"use client";
import { StrKey } from "@stellar/stellar-sdk";
import { useState, type FormEvent } from "react";
import { defaultVerifier, tokenConfig } from "@/config/stellar";
import { formatAmount, parseAmount, shortAddress } from "@/lib/format";
import { Field, PrimaryButton, TextArea, TextInput } from "@/components/ui";
import type { CreateProgramParams } from "@/services/uno.service";
import type { TokenBalance } from "@/services/token.service";

const MAX_VERIFIERS = 10; // MAX_PROGRAM_VERIFIERS en el contrato
const MAX_U32 = 4_294_967_295;

type Props = {
  org: string;
  balance: TokenBalance | "error" | undefined; // undefined = todavía no sabemos
  disabled: boolean; // hay una transacción en curso o la wallet está en otra red
  onSubmit: (params: CreateProgramParams) => void;
};

/** Revisa el formulario. Devuelve los parámetros listos o los errores por campo. */
function validate(amountText: string, capText: string, verifiersText: string) {
  const errors: { amount?: string; cap?: string; verifiers?: string } = {};

  const amount = parseAmount(amountText);
  if (amount === null) errors.amount = `Escribe un monto mayor que 0, con máximo ${tokenConfig.decimals} decimales.`;

  const cap = Number(capText);
  if (!/^\d+$/.test(capText.trim()) || cap < 1 || cap > MAX_U32) errors.cap = "Escribe un número entero de personas, mínimo 1.";

  const verifiers = [...new Set(verifiersText.split(/[\s,]+/).filter(Boolean))];
  const invalid = verifiers.find((v) => !StrKey.isValidEd25519PublicKey(v));
  if (verifiers.length === 0) errors.verifiers = "Agrega al menos un verificador.";
  else if (verifiers.length > MAX_VERIFIERS) errors.verifiers = `Máximo ${MAX_VERIFIERS} verificadores.`;
  else if (invalid) errors.verifiers = `"${shortAddress(invalid)}" no es una dirección G… válida.`;

  const total = amount !== null && !errors.cap ? amount * BigInt(cap) : null;
  return { errors, amount, cap, verifiers, total };
}

export function CreateProgramForm({ org, balance, disabled, onSubmit }: Props) {
  const [amountText, setAmountText] = useState("");
  const [capText, setCapText] = useState("");
  const [verifiersText, setVerifiersText] = useState(defaultVerifier);
  const [touched, setTouched] = useState(false); // mostramos errores después del primer intento

  const { errors, amount, cap, verifiers, total } = validate(amountText, capText, verifiersText);
  const hasErrors = Object.keys(errors).length > 0;

  // Revisión de saldo antes de firmar. El contrato lo vuelve a revisar al simular.
  let fundsProblem: string | null = null;
  if (balance === undefined) fundsProblem = null; // cargando: no bloqueamos
  else if (balance === "error") fundsProblem = null; // no pudimos leerlo: la simulación decide
  else if (balance.status === "sin-trustline") fundsProblem = `Tu cuenta no tiene trustline a ${tokenConfig.symbol}.`;
  else if (total !== null && balance.units < total)
    fundsProblem = `Te faltan ${formatAmount(total - balance.units)} ${tokenConfig.symbol} para fondear el programa completo.`;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (hasErrors || fundsProblem || amount === null) return;
    onSubmit({ org, token: tokenConfig.id, amount, cap, verifiers });
  }

  return (
    <form onSubmit={submit} className="card space-y-5 p-5" noValidate>
      <div>
        <h2 className="text-lg font-bold">Crear programa</h2>
        <p className="mt-1 text-sm text-dim">
          Al firmar, el contrato toma de tu cuenta el total (monto × cupo) y lo guarda hasta que cada persona cobre o
          cierres el programa.
        </p>
      </div>

      <Field label="Token" hint="El admin de Uno aprobó este token para programas.">
        <TextInput value={`${tokenConfig.symbol} · ${tokenConfig.id}`} readOnly disabled className="font-mono text-xs" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Monto por persona (${tokenConfig.symbol})`} error={touched ? errors.amount : null}>
          <TextInput inputMode="decimal" placeholder="500" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
        </Field>
        <Field label="Cupo (personas)" error={touched ? errors.cap : null}>
          <TextInput inputMode="numeric" placeholder="100" value={capText} onChange={(e) => setCapText(e.target.value)} />
        </Field>
      </div>

      <Field
        label="Verificadores aceptados"
        hint="Direcciones G… de los Punto Uno en los que confías, una por línea. Solo cobran personas registradas por ellos."
        error={touched ? errors.verifiers : null}
      >
        <TextArea rows={2} value={verifiersText} onChange={(e) => setVerifiersText(e.target.value)} spellCheck={false} className="text-xs" />
      </Field>
      {verifiers.includes(defaultVerifier) && (
        <p className="-mt-3 text-xs text-muted">Incluye a “verificador” (cuenta de la CLI) · {shortAddress(defaultVerifier)}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-background px-4 py-3">
        <div>
          <span className="label">Total a depositar</span>
          <p className="text-xl font-bold tabular-nums">
            {total !== null ? `${formatAmount(total)} ${tokenConfig.symbol}` : "—"}
          </p>
        </div>
        <PrimaryButton type="submit" disabled={disabled || (touched && (hasErrors || !!fundsProblem))}>
          Crear y depositar
        </PrimaryButton>
      </div>
      {fundsProblem && <p role="alert" className="text-sm text-warn">{fundsProblem}</p>}
    </form>
  );
}
