// Huella de unicidad: HMAC-SHA256(UNO_HMAC_SECRET, CURP normalizada).
// La CURP solo existe en memoria mientras dura la petición: no se guarda, no se
// registra en logs y nunca sale del servidor. A la cadena solo llega la huella.
import "server-only";
import { createHmac } from "node:crypto";
import { serverEnv } from "./env";

/** Estructura oficial de la CURP (RENAPO): 18 caracteres. */
const CURP_RE =
  /^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HMX](AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/;

const CURP_ALPHABET = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";

/** Sin espacios y en mayúsculas: "  abcd… " y "ABCD…" deben dar la misma huella. */
export function normalizeCurp(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/g, "").toUpperCase();
}

/**
 * Formato + dígito verificador. El dígito importa: una CURP con un error de
 * dedo daría OTRA huella, y la misma persona podría registrarse dos veces.
 */
export function isValidCurp(curp: string): boolean {
  if (!CURP_RE.test(curp)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += CURP_ALPHABET.indexOf(curp[i]) * (18 - i);
  const digit = (10 - (sum % 10)) % 10;
  return digit === Number(curp[17]);
}

/** 32 bytes. Recibe la CURP ya normalizada y validada. */
export function huellaDeCurp(curp: string): Buffer {
  return createHmac("sha256", serverEnv().hmacSecret).update(curp, "utf8").digest();
}
