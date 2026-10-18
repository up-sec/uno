// Relayer: crea cuentas patrocinadas y envía `claim` pagando la comisión.
// Nunca elige el programa ni el destino: los toma del reclamo que firmó el
// beneficiario, y lo comprueba antes de gastar nada.
import "server-only";
import {
  Asset,
  BASE_FEE,
  Contract,
  Keypair,
  StrKey,
  TransactionBuilder,
  rpc,
  scValToNative,
  xdr,
  type Transaction,
} from "@stellar/stellar-sdk";
import { stellarConfig, tokenConfig } from "@/config/stellar";
import { getUnoClient } from "@/lib/contracts/uno.client";
import { RESERVES_PER_ACCOUNT, SPONSORSHIP_TIMEOUT_S, isMxnDemo, sponsorshipOps } from "@/lib/sponsorship";
import { serverEnv } from "./env";
import { ApiError, int, str } from "./http";

let server: rpc.Server | null = null;
function rpcServer(): rpc.Server {
  server ??= new rpc.Server(stellarConfig.rpcUrl);
  return server;
}

/** Máximo que el contrato acepta entre hoy y la caducidad del reclamo (~1 día). */
const MAX_CLAIM_TTL = 17_280;

/** Un reclamo firmado por el beneficiario, ya validado. */
export type SignedClaim = {
  programa: number;
  holder: string; // cuenta G… cuya llave firmó (la registrada en Punto Uno)
  expires: number;
  firma: Buffer; // 64 bytes
  destino: string; // a dónde pidió el beneficiario que llegue el dinero
};

/**
 * Lee el reclamo del cuerpo y comprueba, SIN gastar nada, que el programa esté
 * permitido, que no haya caducado y que la firma corresponda al mensaje exacto
 * del contrato (claim_message) para ese programa, caducidad y destino.
 */
export async function readSignedClaim(body: Record<string, unknown>): Promise<SignedClaim> {
  const programa = int(body, "programa");
  if (!serverEnv().allowedPrograms.has(programa)) throw new ApiError(403, "ProgramNotAllowed", "El relayer no atiende cobros de este programa.");

  const holder = str(body, "holder");
  if (!StrKey.isValidEd25519PublicKey(holder)) throw new ApiError(400, "BadKey", "La llave del beneficiario no es una cuenta G… válida.");
  const destino = str(body, "destino");
  if (!StrKey.isValidEd25519PublicKey(destino) && !StrKey.isValidContract(destino)) throw new ApiError(400, "BadDestination", "El destino no es una dirección válida.");
  const firmaHex = str(body, "firma");
  if (!/^[0-9a-f]{128}$/i.test(firmaHex)) throw new ApiError(400, "BadSignature", "La firma debe ser de 64 bytes en hexadecimal.");
  const firma = Buffer.from(firmaHex, "hex");

  const expires = int(body, "expires");
  const { sequence } = await rpcServer().getLatestLedger();
  if (expires < sequence || expires - sequence > MAX_CLAIM_TTL) throw new ApiError(400, "ClaimExpired", "El reclamo firmado ya caducó. Vuelve a intentar.");

  // El mensaje lo arma el propio contrato (simulación, sin firma ni costo).
  const message = (await getUnoClient().claim_message({ program_id: programa, expires_ledger: expires, dest: destino })).result;
  if (!Keypair.fromPublicKey(holder).verify(Buffer.from(message), firma)) {
    throw new ApiError(401, "BadSignature", "La firma no corresponde a este reclamo.");
  }
  return { programa, holder, expires, firma, destino };
}

// ── Cuentas ──────────────────────────────────────────────────────────────────

/** La cuenta tal como está en el ledger, o null si no existe. */
async function accountEntry(account: string): Promise<xdr.AccountEntry | null> {
  const key = xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId: Keypair.fromPublicKey(account).xdrAccountId() }));
  const { entries } = await rpcServer().getLedgerEntries(key);
  const data = entries[0]?.val;
  return data?.type === "account" ? data.account : null;
}

export async function accountExists(account: string): Promise<boolean> {
  return (await accountEntry(account)) !== null;
}

/**
 * Cuentas que el relayer patrocina hoy, contadas EN CADENA: num_sponsoring de su
 * cuenta / 3 reservas por cuenta. Si el relayer patrocinara otra cosa, el número
 * sale más alto (nunca más bajo), así que el tope sigue protegiendo.
 */
export async function sponsoredAccounts(): Promise<number> {
  const entry = await accountEntry(serverEnv().relayer.publicKey());
  if (!entry) throw new ApiError(503, "RelayerMissing", "La cuenta del relayer no existe en esta red.");
  if (entry.ext.type !== "v1") return 0;
  const ext1 = entry.ext.v1.ext;
  if (ext1.type !== "v2") return 0;
  return Math.floor(ext1.v2.numSponsoring / RESERVES_PER_ACCOUNT);
}

let mxnAsset: Asset | null = null;

/** Activo clásico del token MXNDEMO, leído de su contrato SAC (name = "CODE:ISSUER"). */
async function mxnDemoAsset(): Promise<Asset> {
  if (mxnAsset) return mxnAsset;
  const relayer = serverEnv().relayer.publicKey();
  const tx = new TransactionBuilder(await rpcServer().getAccount(relayer), { fee: BASE_FEE, networkPassphrase: stellarConfig.networkPassphrase })
    .addOperation(new Contract(tokenConfig.id).call("name"))
    .setTimeout(30)
    .build();
  const sim = await rpcServer().simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) throw new ApiError(503, "TokenUnavailable", "No se pudo leer el token MXNDEMO.");
  const [code, issuer] = String(scValToNative(sim.result.retval)).split(":");
  const asset = new Asset(code, issuer);
  if (!isMxnDemo(asset)) throw new ApiError(503, "TokenMismatch", "El token configurado no coincide con su activo clásico.");
  mxnAsset = asset;
  return asset;
}

/** Transacción de patrocinio sin firmas, con el relayer como fuente. */
export async function buildSponsorshipTx(beneficiary: string): Promise<Transaction> {
  const asset = await mxnDemoAsset();
  const relayer = await rpcServer().getAccount(serverEnv().relayer.publicKey());
  const builder = new TransactionBuilder(relayer, { fee: String(Number(BASE_FEE) * 10), networkPassphrase: stellarConfig.networkPassphrase });
  for (const op of sponsorshipOps(beneficiary, asset)) builder.addOperation(op);
  return builder.setTimeout(SPONSORSHIP_TIMEOUT_S).build();
}

/** Envía una transacción clásica ya firmada y espera a que se confirme. */
export async function submitClassic(tx: Transaction): Promise<string> {
  const hash = Buffer.from(tx.hash()).toString("hex");
  const sent = await rpcServer().sendTransaction(tx);
  if (sent.status !== "PENDING" && sent.status !== "DUPLICATE") {
    throw new ApiError(502, "Rejected", "La red no aceptó la transacción; no se creó la cuenta.", hash);
  }
  const final = await rpcServer().pollTransaction(hash, { attempts: 20 });
  if (final.status === rpc.Api.GetTransactionStatus.SUCCESS) return hash;
  if (final.status === rpc.Api.GetTransactionStatus.FAILED) throw new ApiError(502, "TxFailed", "La transacción falló en la red.", hash);
  throw new ApiError(504, "Pending", "Se envió la transacción pero la red no confirmó a tiempo. Revisa su estado con el hash.", hash);
}
