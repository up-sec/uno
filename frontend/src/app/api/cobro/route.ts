// POST /api/cobro — el relayer cobra por el beneficiario y paga la comisión.
//
// Pasos (campo "paso"); los tres traen el reclamo firmado por el beneficiario
// { programa, holder, expires, firma, destino }, que se verifica cada vez:
//   - "preparar-cuenta": si la cuenta destino no existe, devuelve la transacción
//     de patrocinio SIN firmar + un token (HMAC de su hash) para que el navegador
//     la revise y la co-firme.
//   - "crear-cuenta": { xdr, token } co-firmada por el beneficiario. Solo se firma
//     si el hash es idéntico al de la transacción que armó el servidor (C-01).
//   - "cobrar": simula claim y SOLO si pasa, el relayer lo envía.
//
// Límites contra abuso:
//   - Solo programas de ALLOWED_PROGRAMS.
//   - Antes de patrocinar se simula claim: si la persona no está registrada, ya
//     cobró o el programa no paga, no se crea nada.
//   - Una creación por llave: se comprueba EN CADENA que la cuenta no exista.
//     El Set en memoria solo evita dobles envíos simultáneos en esta instancia;
//     en Vercel cada instancia tiene su propia memoria, así que NO es confiable.
//   - MAX_SPONSORED: tope global de cuentas patrocinadas, contado en cadena.
import { StrKey, TransactionBuilder, Transaction, rpc } from "@stellar/stellar-sdk";
import { stellarConfig } from "@/config/stellar";
import { checkSponsorshipTx, hasSignatureOf } from "@/lib/sponsorship";
import { serverEnv } from "@/server/env";
import { ApiError, errorResponse, readJson, str } from "@/server/http";
import {
  accountExists,
  buildSponsorshipTx,
  isNextRelayerSequence,
  isSponsorshipTokenValid,
  readSignedClaim,
  sponsoredAccounts,
  sponsorshipToken,
  submitClassic,
  type SignedClaim,
} from "@/server/relayer";
import { contractErrorCode, simulateSignSend, unoClientFor, type ContractErrors } from "@/server/stellar";

const CLAIM_ERRORS: ContractErrors = {
  4: { status: 403, code: "NotRegistered", message: "Esta llave no está registrada en ningún Punto Uno." },
  5: { status: 403, code: "CredentialInvalid", message: "Tu credencial ya no es válida. Acude a un Punto Uno." },
  6: { status: 404, code: "ProgramNotFound", message: "No existe ese programa." },
  7: { status: 409, code: "ProgramClosed", message: "El programa ya se cerró." },
  8: { status: 409, code: "ProgramFull", message: "El programa ya llegó a su cupo." },
  9: { status: 409, code: "AlreadyClaimed", message: "Ya cobraste en este programa. Solo se puede cobrar una vez." },
  15: { status: 403, code: "VerifierNotAccepted", message: "Este programa no acepta al Punto Uno que te registró." },
  16: { status: 400, code: "ClaimExpired", message: "El reclamo firmado caducó. Vuelve a intentar." },
  17: { status: 400, code: "InvalidDestination", message: "El destino no es válido." },
  13: { status: 409, code: "NoTrustline", message: "La cuenta destino no acepta MXNDEMO todavía." },
};

/** Cuentas en proceso de creación en ESTA instancia (no confiable entre instancias). */
const inFlight = new Set<string>();

/**
 * Patrocinios ya hechos por llave (auditoría N-02): evita el bucle "crear la
 * cuenta → fusionarla → pedir patrocinio otra vez". En memoria, con el mismo
 * límite que el resto: no es confiable entre instancias de Vercel; para un
 * piloto va a una base de datos o KV compartida.
 */
const MAX_SPONSORSHIPS_PER_KEY = 1;
const MAX_TRACKED_KEYS = 10_000;
const sponsorshipsByKey = new Map<string, number>();

function recordSponsorship(holder: string): void {
  const count = (sponsorshipsByKey.get(holder) ?? 0) + 1;
  sponsorshipsByKey.delete(holder);
  sponsorshipsByKey.set(holder, count);
  // Se desalojan las más viejas; las llaves solo llegan aquí con credencial válida.
  for (const key of sponsorshipsByKey.keys()) {
    if (sponsorshipsByKey.size <= MAX_TRACKED_KEYS) break;
    sponsorshipsByKey.delete(key);
  }
}

function claimTx(claim: SignedClaim) {
  return unoClientFor(serverEnv().relayer).claim(
    { program_id: claim.programa, holder: Buffer.from(StrKey.decodeEd25519PublicKey(claim.holder)), expires_ledger: claim.expires, signature: claim.firma, dest: claim.destino },
    { timeoutInSeconds: 30 },
  );
}

/** ¿Se puede patrocinar la cuenta de este reclamo? Lanza si no. */
async function checkCanSponsor(claim: SignedClaim): Promise<void> {
  // Solo se patrocina la cuenta de la propia llave que firmó: ella co-firma.
  if (claim.destino !== claim.holder) throw new ApiError(400, "BadDestination", "Solo se crea la cuenta de la llave que firma el reclamo.");
  if (inFlight.has(claim.holder)) throw new ApiError(429, "InProgress", "Ya se está creando esta cuenta.");
  if ((sponsorshipsByKey.get(claim.holder) ?? 0) >= MAX_SPONSORSHIPS_PER_KEY) {
    throw new ApiError(409, "AlreadySponsored", "Ya se patrocinó una cuenta para esta llave.");
  }
  if (await accountExists(claim.holder)) throw new ApiError(409, "AccountExists", "La cuenta ya existe: cobra directamente.");
  if ((await sponsoredAccounts()) >= serverEnv().maxSponsored) {
    throw new ApiError(503, "SponsorLimit", "El relayer llegó a su tope de cuentas patrocinadas.");
  }
  // Simular el cobro. Con la cuenta destino inexistente, lo ÚNICO aceptable es
  // que falle el pago final del token por falta de trustline (SAC #13; comprobado
  // en testnet). Todo lo demás frena: errores de Uno, errores desconocidos y
  // hasta una simulación exitosa, que aquí no tendría sentido (B-01, fail-closed).
  const simulation = (await claimTx(claim)).simulation!;
  if (!rpc.Api.isSimulationError(simulation)) {
    throw new ApiError(409, "SponsorCheckFailed", "No se pudo confirmar que la cuenta necesite patrocinio.");
  }
  const code = contractErrorCode(simulation.error);
  if (code === 13 && /trustline/i.test(simulation.error)) return;
  const known = code === undefined || code === 13 ? undefined : CLAIM_ERRORS[code];
  if (known) throw new ApiError(known.status, known.code, known.message);
  throw new ApiError(422, "SponsorCheckFailed", "El cobro no pasaría la simulación; no se creó la cuenta.");
}

export async function POST(request: Request) {
  try {
    const env = serverEnv();
    const body = await readJson(request);
    const paso = str(body, "paso");
    const claim = await readSignedClaim(body);

    if (paso === "preparar-cuenta") {
      await checkCanSponsor(claim);
      const tx = await buildSponsorshipTx(claim.holder);
      return Response.json({ xdr: tx.toXDR(), token: sponsorshipToken(tx) });
    }

    if (paso === "crear-cuenta") {
      let tx: Transaction;
      try {
        const parsed = TransactionBuilder.fromXDR(str(body, "xdr"), stellarConfig.networkPassphrase);
        if (!(parsed instanceof Transaction)) throw new Error();
        tx = parsed;
      } catch {
        throw new ApiError(400, "BadXdr", "La transacción no es válida.");
      }
      // C-01: solo se co-firma la transacción EXACTA que armó este servidor. El
      // token es un HMAC de su hash; cualquier cambio (secuencia, comisión,
      // precondiciones, operaciones) cambia el hash y el token deja de valer.
      if (!isSponsorshipTokenValid(tx, str(body, "token"))) {
        throw new ApiError(400, "BadSponsorshipTx", "La transacción no es la que armó el servidor.");
      }
      // Respaldo por si el token fallara: la forma exacta y las precondiciones.
      const problem = checkSponsorshipTx(tx, claim.holder, env.relayer.publicKey());
      if (problem) throw new ApiError(400, "BadSponsorshipTx", `La transacción no es la esperada: ${problem}.`);
      if (tx.signatures.length !== 1 || !hasSignatureOf(tx, claim.holder)) {
        throw new ApiError(400, "MissingSignature", "La transacción debe traer solo la firma del beneficiario.");
      }
      await checkCanSponsor(claim);
      if (!(await isNextRelayerSequence(tx))) throw new ApiError(409, "StaleSequence", "La transacción ya no es vigente. Vuelve a intentar.");

      inFlight.add(claim.holder);
      try {
        tx.sign(env.relayer);
        const hash = await submitClassic(tx);
        recordSponsorship(claim.holder);
        return Response.json({ hash });
      } catch (error) {
        // Un envío dudoso pudo entrar: se cuenta, por las dudas.
        if (error instanceof ApiError && error.code === "Pending") recordSponsorship(claim.holder);
        throw error;
      } finally {
        inFlight.delete(claim.holder);
      }
    }

    if (paso === "cobrar") {
      // simulateSignSend no envía nada si la simulación falla.
      const hash = await simulateSignSend(await claimTx(claim), CLAIM_ERRORS);
      return Response.json({ hash });
    }

    throw new ApiError(400, "BadStep", 'El campo "paso" debe ser preparar-cuenta, crear-cuenta o cobrar.');
  } catch (error) {
    return errorResponse("cobro", error);
  }
}
