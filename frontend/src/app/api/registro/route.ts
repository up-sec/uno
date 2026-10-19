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
import { allowRequest, clientIp } from "@/server/rateLimit";
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

/** Peticiones por IP por minuto, contando también los PIN incorrectos (A-01). */
const REGISTRO_LIMIT = 5;
const REGISTRO_WINDOW_MS = 60_000;

/**
 * Credenciales emitidas (o en proceso) por ESTA instancia. En memoria: en Vercel
 * cada instancia lleva su propia cuenta y se reinicia, así que no es un tope
 * confiable. Antes de un piloto va a una base de datos o a un PIN por operador.
 */
let registros = 0;

export async function POST(request: Request) {
  try {
    const env = serverEnv();
    if (!allowRequest(`registro:${clientIp(request)}`, REGISTRO_LIMIT, REGISTRO_WINDOW_MS)) {
      throw new ApiError(429, "TooManyRequests", "Demasiados intentos. Espera un minuto.");
    }
    const body = await readJson(request);

    if (!pinMatches(str(body, "pin"), env.puntoUnoPin)) {
      await new Promise((resolve) => setTimeout(resolve, 500)); // frena intentos seguidos
      throw new ApiError(401, "BadPin", "PIN incorrecto.");
    }

    const curp = normalizeCurp(str(body, "curp"));
    if (!isValidCurp(curp)) throw new ApiError(400, "BadCurp", "La CURP no tiene un formato válido o su dígito verificador no coincide.");

    const llave = str(body, "llave").trim();
    if (!StrKey.isValidEd25519PublicKey(llave)) throw new ApiError(400, "BadKey", "La llave pública debe ser una cuenta G… válida.");

    // Se aparta el lugar antes de enviar para que dos peticiones simultáneas no
    // rebasen el tope; si la emisión falla, se libera.
    if (registros >= env.maxRegistros) throw new ApiError(503, "RegistroLimit", "Este Punto Uno llegó a su tope de registros.");
    registros++;
    try {
      const tx = await unoClientFor(env.verifier).issue(
        { verifier: env.verifier.publicKey(), huella: huellaDeCurp(curp), holder: Buffer.from(StrKey.decodeEd25519PublicKey(llave)) },
        { timeoutInSeconds: 30 },
      );
      const hash = await simulateSignSend(tx, ISSUE_ERRORS);
      return Response.json({ hash });
    } catch (error) {
      // Un envío dudoso ("Pending") pudo entrar: se sigue contando, por las dudas.
      if (!(error instanceof ApiError && error.code === "Pending")) registros--;
      throw error;
    }
  } catch (error) {
    return errorResponse("registro", error);
  }
}
