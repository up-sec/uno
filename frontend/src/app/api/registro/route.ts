// POST /api/registro — Punto Uno registra a una persona.
// Entrada: { pin, curp, llave } (llave = cuenta G… que generó el celular).
// Salida: { hash } de la transacción `issue`. Nada más.
//
// La CURP solo vive en esta función: se normaliza, se valida, se convierte en
// huella (HMAC) y se descarta. No se guarda, no se registra y no va a la cadena.
import { createHash, timingSafeEqual } from "node:crypto";
import { StrKey } from "@stellar/stellar-sdk";
import { serverEnv } from "@/server/env";
import { huellaDeCurp, isValidCurp, normalizeCurp } from "@/server/huella";
import { ApiError, errorResponse, readJson, str } from "@/server/http";
import { simulateSignSend, unoClientFor, type ContractErrors } from "@/server/stellar";

const ISSUE_ERRORS: ContractErrors = {
  1: { status: 503, code: "NotVerifier", message: "La cuenta de este Punto Uno no está dada de alta como verificador." },
  2: { status: 409, code: "AlreadyRegistered", message: "Esta persona ya tiene una credencial vigente." },
  3: { status: 409, code: "KeyInUse", message: "Esa llave ya está registrada a otra persona. Pide al celular una llave nueva." },
  18: { status: 409, code: "CredentialLocked", message: "La credencial de esta persona está bloqueada por el admin de Uno." },
};

/** Compara en tiempo constante (los hash igualan la longitud). */
function pinMatches(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  try {
    const env = serverEnv();
    const body = await readJson(request);

    if (!pinMatches(str(body, "pin"), env.puntoUnoPin)) {
      await new Promise((resolve) => setTimeout(resolve, 500)); // frena intentos seguidos
      throw new ApiError(401, "BadPin", "PIN incorrecto.");
    }

    const curp = normalizeCurp(str(body, "curp"));
    if (!isValidCurp(curp)) throw new ApiError(400, "BadCurp", "La CURP no tiene un formato válido o su dígito verificador no coincide.");

    const llave = str(body, "llave").trim();
    if (!StrKey.isValidEd25519PublicKey(llave)) throw new ApiError(400, "BadKey", "La llave pública debe ser una cuenta G… válida.");

    const tx = await unoClientFor(env.verifier).issue(
      { verifier: env.verifier.publicKey(), huella: huellaDeCurp(curp), holder: Buffer.from(StrKey.decodeEd25519PublicKey(llave)) },
      { timeoutInSeconds: 30 },
    );
    const hash = await simulateSignSend(tx, ISSUE_ERRORS);
    return Response.json({ hash });
  } catch (error) {
    return errorResponse("registro", error);
  }
}
