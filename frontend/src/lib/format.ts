// Conversión de montos y direcciones. Sin dependencias de React ni de la red.
import { tokenConfig } from "@/config/stellar";

const SCALE = BigInt(10) ** BigInt(tokenConfig.decimals);

/** Límites de los tipos del contrato: cap y program_id son u32; los montos, i128. */
export const MAX_U32 = 4_294_967_295;
export const MAX_I128 = (BigInt(1) << BigInt(127)) - BigInt(1);

/**
 * "12" → 12. Número de programa válido (u32), o null.
 * Sin tope, un número enorme llegaría al SDK y fallaría con un error genérico.
 */
export function parseProgramId(text: string | null): number | null {
  if (text === null || !/^\d{1,10}$/.test(text.trim())) return null;
  const id = Number(text);
  return id <= MAX_U32 ? id : null;
}

/**
 * "150.5" → 1505000000n (unidades mínimas, 7 decimales).
 * Se hace con texto y bigint: con `number` se pierden centavos por redondeo.
 * Devuelve null si el texto no es un monto positivo válido.
 */
export function parseAmount(text: string): bigint | null {
  const match = text.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const [, whole, fraction = ""] = match;
  if (fraction.length > tokenConfig.decimals) return null;
  const value = BigInt(whole) * SCALE + BigInt(fraction.padEnd(tokenConfig.decimals, "0"));
  return value > BigInt(0) && value <= MAX_I128 ? value : null;
}

/** 1505000000n → "150.5" */
export function formatAmount(units: bigint): string {
  const negative = units < BigInt(0);
  const abs = negative ? -units : units;
  const whole = abs / SCALE;
  const fraction = (abs % SCALE).toString().padStart(tokenConfig.decimals, "0").replace(/0+$/, "");
  const wholeText = whole.toLocaleString("es-MX");
  return `${negative ? "-" : ""}${wholeText}${fraction ? `.${fraction}` : ""}`;
}

/** GABC…WXYZ */
export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

