"use client";
import { useCallback, useEffect, useState } from "react";
import { mapError, type FriendlyError } from "@/services/errors";
import { readProgram, type Program } from "@/services/uno.service";

type Loaded =
  | { status: "ok"; programId: number; program: Program }
  | { status: "error"; programId: number; error: FriendlyError };

export type ProgramState = { status: "idle" } | { status: "cargando" } | Loaded;

/** Lee un programa del contrato (simulación, sin firma). `null` = no leer nada. */
export function useProgram(programId: number | null) {
  const [loaded, setLoaded] = useState<Loaded>();

  const refresh = useCallback(() => {
    if (programId === null) return;
    readProgram(programId)
      .then((program) => setLoaded({ status: "ok", programId, program }))
      .catch((e) => setLoaded({ status: "error", programId, error: mapError(e) }));
  }, [programId]);

  useEffect(refresh, [refresh]);

  // Al refrescar el mismo programa, los datos viejos se quedan en pantalla.
  // Si cambió el número, lo cargado es de otro programa: "cargando".
  const state: ProgramState =
    programId === null ? { status: "idle" } : loaded?.programId === programId ? loaded : { status: "cargando" };

  return { state, refresh };
}
