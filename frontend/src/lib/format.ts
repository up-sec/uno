// Conversión de montos y direcciones. Sin dependencias de React ni de la red.
import { tokenConfig } from "@/config/stellar";

const SCALE = BigInt(10) ** BigInt(tokenConfig.decimals);

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
  return value > BigInt(0) ? value : null;
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

