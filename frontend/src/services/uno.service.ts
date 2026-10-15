// Llamadas al contrato Uno: lecturas, escrituras y revisión de transacciones. Sin React.
import { rpc, type contract } from "@stellar/stellar-sdk";
import type { Program } from "uno";
import { explorerTxUrl } from "@/config/stellar";
import { getUnoClient } from "@/lib/contracts/uno.client";
import { getRpcServer } from "@/lib/contracts/rpc";
import { TxError } from "./errors";

export type { Program };

// ── Lectura ──────────────────────────────────────────────────────────────────
// Leer es una simulación: no necesita firma ni wallet.

/** Datos públicos de un programa. Lanza "Error(Contract, #6)" si no existe. */
export async function readProgram(programId: number): Promise<Program> {
  const tx = await getUnoClient().program({ program_id: programId });
  // Si el contrato devuelve un error, la simulación falla con "Error(Contract, #N)".
  // Lo revisamos aquí: el Err de `tx.result` llega sin mensaje, porque los
  // bindings toman el texto de los comentarios del enum Error y no tiene.
  if (rpc.Api.isSimulationError(tx.simulation!)) {
    throw new TxError("simulation", tx.simulation.error);
  }
  return tx.result.unwrap();
}

// ── Escritura ────────────────────────────────────────────────────────────────
// Firmamos y enviamos por separado (no con signAndSend) para conocer el hash
// ANTES de enviar: si después la red no confirma a tiempo, la app puede revisar
// esa transacción en lugar de pedir otra firma (auditoría integral, F-01).

/** Los pasos intermedios del ciclo de escritura, en orden. */
export type TxStep = "simulando" | "esperando-firma" | "enviando";

/** Quién firma: el servicio no conoce la wallet, recibe la función (ver wallet.service.ts). */
export type SignTransaction = (
  xdr: string,
  address: string,
) => Promise<{ signedTxXdr: string; signerAddress?: string }>;

export type TxOptions = {
  sign: SignTransaction;
  onStep: (step: TxStep) => void; // para mostrar el avance en la interfaz
};

/** Una transacción confirmada en la red y el valor que devolvió el contrato. */
export type Confirmed<T> = { value: T; hash: string; explorerUrl: string };

/** Lo que devuelven los métodos de los bindings que regresan Result<T>. */
type ResultTx<T> = contract.AssembledTransaction<contract.Result<T>>;

/** Pasos 3 a 5, iguales para cualquier escritura. `tx` ya viene simulada. */
async function signAndSubmit<T>(tx: ResultTx<T>, signer: string, { sign, onStep }: TxOptions): Promise<Confirmed<T>> {
  // Si va a fallar (token no aprobado, sin saldo, programa ajeno…) nos enteramos
  // en la simulación, sin pedir firma ni gastar nada.
  if (rpc.Api.isSimulationError(tx.simulation!)) {
    throw new TxError("simulation", tx.simulation.error);
  }

  onStep("esperando-firma");
  await tx.sign({ signTransaction: (xdr) => sign(xdr, signer) });
  const signed = tx.signed!;
  // El hash ya existe aunque no se haya enviado: es el mismo que verá el explorador.
  const hash = Array.from(signed.hash(), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const maxTime = Number(signed.timeBounds?.maxTime ?? 0);
  const validUntil = maxTime > 0 ? maxTime : undefined; // después de esto la red ya no la acepta

  // De aquí en adelante la transacción firmada puede llegar a la red. Ante
  // cualquier duda NO se reintenta: se revisa su estado con el hash.
  onStep("enviando");
  let sent: contract.SentTransaction<contract.Result<T>>;
  try {
    sent = await tx.send();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // La red respondió que NO la aceptó (ERROR / TRY_AGAIN_LATER): es definitivo.
    if (/"status":\s*"(ERROR|TRY_AGAIN_LATER)"/.test(message)) throw new TxError("rejected", message, hash);
    throw new TxError("pending", message, hash, validUntil);
  }

  if (sent.getTransactionResponse?.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new TxError("failed", "La transacción falló en la red", hash);
  }
  return { value: sent.result.unwrap(), hash, explorerUrl: explorerTxUrl(hash) };
}

export type CreateProgramParams = {
  org: string; // la organización: firma y deposita
  token: string;
  amount: bigint; // monto por persona, en unidades mínimas (7 decimales)
  cap: number; // cupo de personas
  verifiers: string[]; // verificadores (Punto Uno) en los que confía la organización
};

/**
 * Crea un programa. Al firmar, Freighter muestra la llamada `create_program`
 * con sus argumentos en unidades mínimas (amount = monto × 10^7); por eso la
 * interfaz muestra esa equivalencia ANTES de abrir la wallet.
 * Devuelve el número del programa nuevo.
 */
export async function createProgram(params: CreateProgramParams, options: TxOptions): Promise<Confirmed<number>> {
  options.onStep("simulando");
  const tx = await getUnoClient(params.org).create_program(params, { timeoutInSeconds: 30 });
  return signAndSubmit(tx, params.org, options);
}

/**
 * Cierra un programa: el contrato le regresa a la organización lo que no se
 * cobró y ya nadie puede cobrar en él. Solo la organización que lo creó puede
 * cerrarlo. Devuelve el monto recuperado, en unidades mínimas.
 */
export async function closeProgram({ org, programId }: { org: string; programId: number }, options: TxOptions): Promise<Confirmed<bigint>> {
  options.onStep("simulando");
  const tx = await getUnoClient(org).close_program({ program_id: programId }, { timeoutInSeconds: 30 });
  return signAndSubmit(tx, org, options);
}

// ── Revisar una transacción ya enviada ───────────────────────────────────────

export type TxCheck<T> =
  | { status: "confirmada"; value: T } // entró y el contrato respondió
  | { status: "fallida" } // entró, pero falló: no se movió dinero
  | { status: "pendiente" } // todavía no aparece y aún podría entrar
  | { status: "no-llego" }; // no aparece y ya caducó: nunca va a entrar

const CLOCK_MARGIN_S = 60;

/**
 * Estado real de una transacción enviada. `method` es la función del contrato
 * que se llamó, para traducir lo que devolvió.
 *
 * Toda transacción de la app caduca a los 30 s (timeoutInSeconds). Si después
 * de eso la red no la conoce, ya no puede entrar y es seguro intentar de nuevo.
 */
export async function checkTransaction<T>(
  method: "create_program" | "close_program",
  hash: string,
  validUntil: number | undefined, // segundos Unix; undefined = no sabemos, nunca se da por perdida
): Promise<TxCheck<T>> {
  const response = await getRpcServer().getTransaction(hash);
  if (response.status === rpc.Api.GetTransactionStatus.SUCCESS) {
    const result = getUnoClient().spec.funcResToNative(method, response.returnValue!) as contract.Result<T>;
    return { status: "confirmada", value: result.unwrap() };
  }
  if (response.status === rpc.Api.GetTransactionStatus.FAILED) return { status: "fallida" };

  // NOT_FOUND: ¿todavía puede entrar? Lo sabemos por la caducidad que se firmó.
  // Damos 60 s de margen por si el reloj de esta computadora está desfasado.
  const now = Date.now() / 1000;
  return validUntil !== undefined && now > validUntil + CLOCK_MARGIN_S ? { status: "no-llego" } : { status: "pendiente" };
}
