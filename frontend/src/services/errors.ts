// Traduce errores de la wallet, el RPC y el contrato a mensajes para la persona.
import { explorerTxUrl, tokenConfig } from "@/config/stellar";

export type TxErrorKind =
  | "simulation" // el contrato rechazó la operación al simularla
  | "network" // la wallet está en otra red
  | "rejected" // la red no aceptó la transacción al enviarla
  | "failed" // la red la aceptó, pero falló al ejecutarse
  | "pending"; // ya se firmó y se envió, pero no sabemos si entró: NO reintentar a ciegas

export class TxError extends Error {
  constructor(
    public kind: TxErrorKind,
    message: string,
    public hash?: string, // si ya fue enviada, para verla en el explorador
    public validUntil?: number, // "pending": hasta cuándo puede entrar (segundos Unix)
  ) {
    super(message);
  }
}

export type FriendlyError = {
  title: string;
  message: string;
  action?: "retry" | "friendbot" | "check"; // botón que ofrecemos para resolverlo
  hash?: string; // si ya fue enviada
  validUntil?: number; // "check": hasta cuándo puede entrar todavía
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

  // Va primero: con la transacción ya enviada, reintentar podría crear un
  // segundo programa y un segundo depósito (auditoría integral, F-01).
  if (kind === "pending")
    return {
      title: "No sabemos todavía si la transacción entró",
      message: "Ya se firmó y se envió, pero la red no confirmó a tiempo. No la firmes otra vez: revisa su estado.",
      action: "check",
      hash,
      validUntil: error instanceof TxError ? error.validUntil : undefined,
      explorerUrl,
      detail,
    };

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

  if (has(/timeout|timed out|Waited \d+ seconds|Failed to fetch|Network Error|ECONN|50[234]/i))
    return { title: "La red no respondió", message: "El nodo RPC tardó demasiado o no está disponible. Prueba de nuevo en unos segundos.", action: "retry", explorerUrl, detail };

  // "failed" es definitivo: la red la procesó y falló, así que no se movió dinero.
  if (kind === "failed" || kind === "rejected")
    return { title: "La red rechazó la transacción", message: "La transacción no se pudo ejecutar y no se movió dinero.", action: "retry", hash, explorerUrl, detail };

  return { title: "Algo salió mal", message: "Ocurrió un error inesperado.", action: "retry", detail };
}
