"use client";
import { closeProgram, createProgram, type Confirmed } from "@/services/uno.service";
import { useTransaction } from "./useTransaction";

export { isBusy } from "./useTransaction";

/** Crea un programa (devuelve su número) y expone el estado de la transacción. */
export function useCreateProgram(onConfirmed?: (result: Confirmed<number>) => void) {
  return useTransaction("create_program", createProgram, onConfirmed);
}

/** Cierra un programa (devuelve lo recuperado) y expone el estado de la transacción. */
export function useCloseProgram(onConfirmed?: (result: Confirmed<bigint>) => void) {
  return useTransaction("close_program", closeProgram, onConfirmed);
}
