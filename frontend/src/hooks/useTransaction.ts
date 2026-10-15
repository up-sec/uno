"use client";
// ─────────────────────────────────────────────────────────────────────────────
// 4. ESTADOS · Máquina de estados de una transacción
//
//   idle → simulando → esperando-firma → enviando → confirmado
//                 ╲            ╲             ╲
//                  ╰────────────┴─────────────┴──→ error
//
// En cada momento la transacción está en UN solo estado, y la interfaz
// muestra exactamente ese estado. Nada de varios booleanos sueltos.
//
// Si el error llega en "enviando", la transacción ya está firmada y pudo haber
// entrado: no se ofrece "Reintentar" sino "Revisar estado" (auditoría integral, F-01).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useRef, useState } from "react";
import { explorerTxUrl } from "@/config/stellar";
import { mapError, type FriendlyError } from "@/services/errors";
import { checkTransaction, type Confirmed, type TxOptions, type TxStep } from "@/services/uno.service";
import { signWithWallet } from "@/services/wallet.service";

export type TxState<T> =
  | { status: "idle" }
  | { status: TxStep }
  | ({ status: "confirmado" } & Confirmed<T>)
  | { status: "error"; error: FriendlyError; step: TxStep; checking?: boolean }; // en qué paso falló

/** ¿Hay una operación en curso? (para deshabilitar botones) */
export function isBusy(state: TxState<unknown>): boolean {
  return state.status !== "idle" && state.status !== "confirmado" && state.status !== "error";
}

type Action<P, T> = (params: P, options: TxOptions) => Promise<Confirmed<T>>;

/**
 * Ejecuta una escritura del contrato y expone su estado.
 * - `method`: la función del contrato, para traducir el resultado al revisar el estado.
 * - `onConfirmed`: se llama una sola vez cuando la transacción queda confirmada.
 */
export function useTransaction<P, T>(
  method: "create_program" | "close_program",
  action: Action<P, T>,
  onConfirmed?: (result: Confirmed<T>) => void,
) {
  const [state, setState] = useState<TxState<T>>({ status: "idle" });
  const last = useRef<P | null>(null); // para "Reintentar"

  const confirm = useCallback(
    (result: Confirmed<T>) => {
      setState({ status: "confirmado", ...result });
      onConfirmed?.(result);
    },
    [onConfirmed],
  );

  const run = useCallback(
    async (params: P) => {
      last.current = params;
      let step: TxStep = "simulando"; // recordamos el último paso alcanzado
      try {
        const result = await action(params, {
          sign: signWithWallet,
          onStep: (next) => {
            step = next;
            setState({ status: next });
          },
        });
        confirm(result);
      } catch (error) {
        setState({ status: "error", error: mapError(error), step });
      }
    },
    [action, confirm],
  );

  /** Solo cuando el error lo permite (action "retry"): nunca tras un envío dudoso. */
  const retry = useCallback(() => {
    if (last.current) run(last.current);
  }, [run]);

  /** "Revisar estado": pregunta a la red qué pasó con la transacción enviada. */
  const check = useCallback(async () => {
    if (state.status !== "error" || !state.error.hash) return;
    const { error, step } = state;
    const hash = error.hash!;
    setState({ status: "error", error, step, checking: true });
    try {
      const result = await checkTransaction<T>(method, hash, error.validUntil);
      if (result.status === "confirmada") {
        confirm({ value: result.value, hash, explorerUrl: explorerTxUrl(hash) });
      } else if (result.status === "pendiente") {
        setState({
          status: "error",
          step,
          error: { ...error, title: "Todavía no aparece en la red", message: "Puede tardar unos segundos más. No la firmes otra vez: vuelve a revisar en un momento." },
        });
      } else {
        // "fallida" o "no-llego": es seguro intentar de nuevo, no se movió dinero.
        setState({
          status: "error",
          step,
          error: {
            ...error,
            title: result.status === "fallida" ? "La transacción falló en la red" : "La transacción no llegó a la red",
            message:
              result.status === "fallida"
                ? "La red la procesó, pero falló: no se movió dinero. Puedes intentar de nuevo."
                : "Ya caducó sin entrar, así que no se movió dinero. Puedes intentar de nuevo.",
            action: "retry",
          },
        });
      }
    } catch (e) {
      // No pudimos preguntar: seguimos sin saber, así que seguimos sin reintentar.
      setState({ status: "error", step, error: { ...error, title: "No se pudo revisar el estado", message: "El nodo RPC no respondió. Vuelve a intentar la revisión en unos segundos.", detail: mapError(e).detail } });
    }
  }, [state, method, confirm]);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, run, retry, check, reset };
}
