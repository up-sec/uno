// ─────────────────────────────────────────────────────────────────────────────
// 4. ERRORES · De error técnico a mensaje humano
//
// Los errores llegan de muchos lados (wallet, RPC, contrato) y en formatos
// distintos. mapError() los traduce a algo que el usuario entienda y pueda
// resolver. El detalle técnico se guarda para mostrarlo aparte.
// ─────────────────────────────────────────────────────────────────────────────
import { explorerTxUrl, tokenConfig } from "@/config/stellar";

export type TxErrorKind =
  | "simulation" // el contrato rechazó la operación al simularla
  | "network" // la wallet está en otra red
  | "rejected" // la red no aceptó la transacción al enviarla
  | "failed" // la red la aceptó, pero falló al ejecutarse
  | "timeout"; // no llegó la confirmación a tiempo

export class TxError extends Error {
  constructor(
    public kind: TxErrorKind,
    message: string,
    public hash?: string, // si ya fue enviada, para verla en el explorador
  ) {
    super(message);
  }
}

export type FriendlyError = {
  title: string;
  message: string;
  action?: "retry" | "friendbot"; // botón que ofrecemos para resolverlo
  explorerUrl?: string; // si ya fue enviada, para verla en el explorador
  detail: string; // texto técnico original
};

/**
 * Errores del contrato Uno (enum Error en contracts/uno/src/lib.rs; packages/uno
 * los lista en `Errors`). Solo los que puede ver una organización o un auditor.
 */
const UNO_ERRORS: Record<number, { title: string; message: string }> = {
  1: { title: "Verificador no autorizado", message: "Alguno de los verificadores no está dado de alta en Uno." },
  6: { title: "Programa no encontrado", message: "No existe un programa con ese número." },
  7: { title: "Programa cerrado", message: "Este programa ya se cerró." },
  11: { title: "Monto inválido", message: "El monto por persona y el cupo deben ser mayores que cero." },
  12: { title: "Monto demasiado grande", message: "Monto por persona × cupo se sale del rango permitido." },
  14: { title: "Token no permitido", message: "El admin de Uno no aprobó este token." },
  21: { title: "Lista de verificadores inválida", message: "Elige entre 1 y 10 verificadores." },
  22: { title: "Depósito incompleto", message: "El contrato recibió menos dinero del que se pidió, así que el programa no se creó." },
};

/** Número del error de Uno: llega como "Error(Contract, #6)" en una simulación fallida. */
function unoErrorCode(detail: string): number | undefined {
  const match = detail.match(/Error\(Contract, #(\d+)\)/);
  return match ? Number(match[1]) : undefined;
}

/** Texto de cualquier tipo de error (Error, objeto de la wallet, string). */
function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) return String(error.message);
  return String(error);
}

export function mapError(error: unknown): FriendlyError {
  const detail = describe(error);
  const has = (pattern: RegExp) => pattern.test(detail);
  const hash = error instanceof TxError ? error.hash : undefined;
  const explorerUrl = hash ? explorerTxUrl(hash) : undefined;
  const kind = error instanceof TxError ? error.kind : undefined;
  // SEP-43: las wallets usan el código -4 cuando el usuario rechaza.
  const code = typeof error === "object" && error && "code" in error ? error.code : undefined;

  if (code === -4 || has(/reject|declin|denied|cancel/i))
    return { title: "Firma cancelada", message: "Cancelaste la firma en tu wallet.", action: "retry", detail };

  if (has(/Account not found|account entry is missing/i))
    return { title: "Cuenta sin fondos", message: "Tu cuenta todavía no existe en la red. Fondéala con XLM de prueba.", action: "friendbot", detail };

  // Errores del token (SAC) durante el depósito de create_program. Uno no usa el
  // #10, y su #13 (NotAuthorized) no sale en los flujos de esta app.
  if (has(/Error\(Contract, #13\)|trustline/i))
    return { title: `Sin trustline a ${tokenConfig.symbol}`, message: `Tu cuenta todavía no acepta ${tokenConfig.symbol}. Agrega la trustline en tu wallet.`, detail };

  if (has(/Error\(Contract, #10\)/))
    return { title: "Saldo insuficiente", message: `No tienes suficiente ${tokenConfig.symbol} para fondear el programa completo.`, detail };

  const unoCode = unoErrorCode(detail);
  const uno = unoCode === undefined ? undefined : UNO_ERRORS[unoCode];
  if (uno) return { ...uno, detail };

  if (kind === "network" || has(/network passphrase|wrong network/i))
    return { title: "Red equivocada", message: "Tu wallet está en otra red. Cámbiala a Testnet.", detail };

  if (kind === "simulation")
    return { title: "El contrato rechazó la operación", message: "La simulación falló, así que no se pidió ninguna firma ni se gastó nada.", detail };

  if (kind === "timeout" || has(/timeout|timed out|Waited \d+ seconds|Failed to fetch|Network Error|ECONN|50[234]/i))
    return { title: "La red no respondió", message: "El nodo RPC tardó demasiado o no está disponible. Prueba de nuevo en unos segundos.", action: "retry", explorerUrl, detail };

  if (kind === "failed" || kind === "rejected")
    return { title: "La red rechazó la transacción", message: "La transacción no se pudo ejecutar.", action: "retry", explorerUrl, detail };

  return { title: "Algo salió mal", message: "Ocurrió un error inesperado.", action: "retry", detail };
}
