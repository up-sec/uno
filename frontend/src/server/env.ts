// Variables SECRETAS del servidor. Este módulo nunca puede llegar al navegador:
// "server-only" rompe la compilación si un componente cliente lo importa.
//
// Reglas:
// - Ninguna lleva el prefijo NEXT_PUBLIC_ (Next las incrustaría en el JS público).
// - Los mensajes de error dicen QUÉ variable falla, nunca su valor.
// - Se validan al arrancar el servidor (src/instrumentation.ts) y no al compilar,
//   para que `next build` no necesite los secretos.
import "server-only";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { MAX_U32 } from "@/lib/format";

export type ServerEnv = {
  /** Secreto del HMAC de la CURP. El dato más sensible del sistema. */
  hmacSecret: string;
  /** Cuenta del verificador (Punto Uno): firma `issue`. */
  verifier: Keypair;
  /** Cuenta del relayer: paga comisiones, patrocina cuentas y envía `claim`. */
  relayer: Keypair;
  /** PIN del operador de Punto Uno. */
  puntoUnoPin: string;
  /** Programas en los que el relayer acepta cobrar y patrocinar cuentas. */
  allowedPrograms: ReadonlySet<number>;
  /** Tope global de cuentas que el relayer patrocina (contado en cadena). */
  maxSponsored: number;
  /** Tope de credenciales que emite este servidor (contado en memoria, ver rateLimit.ts). */
  maxRegistros: number;
};

const MIN_HMAC_SECRET = 32;
const MIN_PIN = 16;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de servidor ${name}: agrégala en frontend/.env.local (local) o en Environment Variables (Vercel)`);
  return value;
}

function seed(name: string): Keypair {
  const value = required(name);
  if (!StrKey.isValidEd25519SecretSeed(value)) throw new Error(`${name} no es una llave secreta de Stellar válida (S…)`);
  return Keypair.fromSecret(value);
}

function load(): ServerEnv {
  // Si alguien la puso como pública por error, mejor no arrancar.
  for (const name of ["UNO_HMAC_SECRET", "VERIFIER_SECRET", "RELAYER_SECRET", "PUNTO_UNO_PIN"]) {
    if (process.env[`NEXT_PUBLIC_${name}`] !== undefined) {
      throw new Error(`NEXT_PUBLIC_${name} existe: los secretos nunca llevan el prefijo NEXT_PUBLIC_. Bórrala y rota el secreto.`);
    }
  }

  const hmacSecret = required("UNO_HMAC_SECRET");
  if (hmacSecret.length < MIN_HMAC_SECRET) throw new Error(`UNO_HMAC_SECRET debe tener al menos ${MIN_HMAC_SECRET} caracteres (usa: openssl rand -hex 32)`);

  const puntoUnoPin = required("PUNTO_UNO_PIN");
  if (puntoUnoPin.length < MIN_PIN) throw new Error(`PUNTO_UNO_PIN debe tener al menos ${MIN_PIN} caracteres`);

  const verifier = seed("VERIFIER_SECRET");
  const relayer = seed("RELAYER_SECRET");
  if (verifier.publicKey() === relayer.publicKey()) throw new Error("VERIFIER_SECRET y RELAYER_SECRET deben ser cuentas distintas");

  const programsText = process.env.ALLOWED_PROGRAMS ?? "0";
  const programs = programsText.split(",").map((p) => p.trim()).filter(Boolean);
  if (programs.some((p) => !/^\d{1,10}$/.test(p) || Number(p) > MAX_U32)) throw new Error("ALLOWED_PROGRAMS debe ser una lista de números de programa separados por comas (ej. 0,3)");

  const maxText = process.env.MAX_SPONSORED ?? "25";
  if (!/^\d{1,6}$/.test(maxText)) throw new Error("MAX_SPONSORED debe ser un número entero (ej. 25)");

  const maxRegistrosText = process.env.MAX_REGISTROS ?? "20";
  if (!/^\d{1,6}$/.test(maxRegistrosText)) throw new Error("MAX_REGISTROS debe ser un número entero (ej. 20)");

  return {
    hmacSecret,
    verifier,
    relayer,
    puntoUnoPin,
    allowedPrograms: new Set(programs.map(Number)),
    maxSponsored: Number(maxText),
    maxRegistros: Number(maxRegistrosText),
  };
}

let cached: ServerEnv | null = null;

/** Variables del servidor ya validadas. Lanza un error claro si falta algo. */
export function serverEnv(): ServerEnv {
  cached ??= load();
  return cached;
}
