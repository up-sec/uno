"use client";
// El contrato no tiene una función para listar programas por organización.
// Recordamos en este navegador los números de los programas que creó cada
// cuenta, solo como atajo. La fuente de verdad sigue siendo program(id).
import { useCallback, useMemo, useSyncExternalStore } from "react";

const key = (address: string) => `uno:programas:${address}`;
const CHANGE_EVENT = "uno:programas";

function read(address: string | null): string {
  if (!address) return "[]";
  try {
    return localStorage.getItem(key(address)) ?? "[]";
  } catch {
    return "[]"; // localStorage bloqueado: sin atajo
  }
}

function parse(raw: string): number[] {
  try {
    const saved = JSON.parse(raw);
    return Array.isArray(saved) ? saved.filter((n) => Number.isInteger(n) && n >= 0) : [];
  } catch {
    return [];
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange); // otras pestañas
  window.addEventListener(CHANGE_EVENT, onChange); // esta pestaña
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function useMyPrograms(address: string | null) {
  // En el servidor no hay localStorage: la lista empieza vacía y se llena al hidratar.
  const raw = useSyncExternalStore(subscribe, () => read(address), () => "[]");
  const ids = useMemo(() => parse(raw), [raw]);

  const add = useCallback(
    (programId: number) => {
      if (!address) return;
      const next = [programId, ...parse(read(address)).filter((n) => n !== programId)];
      try {
        localStorage.setItem(key(address), JSON.stringify(next));
        window.dispatchEvent(new Event(CHANGE_EVENT));
      } catch {
        // sin localStorage solo perdemos el atajo
      }
    },
    [address],
  );

  return { ids, add };
}
