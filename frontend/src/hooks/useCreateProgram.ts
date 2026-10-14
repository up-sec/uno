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
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useRef, useState } from "react";
import { mapError, type FriendlyError } from "@/services/errors";
import {
  createProgram,
  type CreateProgramParams,
  type CreateProgramResult,
  type TxStep,
} from "@/services/uno.service";
import { signWithWallet } from "@/services/wallet.service";

export type TxState =
  | { status: "idle" }
  | { status: TxStep }
  | ({ status: "confirmado" } & CreateProgramResult)
  | { status: "error"; error: FriendlyError; step: TxStep }; // en qué paso falló

/** ¿Hay una operación en curso? (para deshabilitar el botón de enviar) */
export function isBusy(state: TxState): boolean {
  return state.status !== "idle" && state.status !== "confirmado" && state.status !== "error";
}

/** Crea un programa y expone el estado de la transacción. */
export function useCreateProgram(onConfirmed?: (result: CreateProgramResult) => void) {
  const [state, setState] = useState<TxState>({ status: "idle" });
  const last = useRef<CreateProgramParams | null>(null); // para "Reintentar"

  const run = useCallback(
    async (params: CreateProgramParams) => {
      last.current = params;
      let step: TxStep = "simulando"; // recordamos el último paso alcanzado
      try {
        const result = await createProgram(params, {
          sign: signWithWallet,
          onStep: (next) => {
            step = next;
            setState({ status: next });
          },
        });
        setState({ status: "confirmado", ...result });
        onConfirmed?.(result);
      } catch (error) {
        setState({ status: "error", error: mapError(error), step });
      }
    },
    [onConfirmed],
  );

  const retry = useCallback(() => {
    if (last.current) run(last.current);
  }, [run]);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, run, retry, reset };
}
