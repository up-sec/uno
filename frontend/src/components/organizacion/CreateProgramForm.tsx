"use client";
import { StrKey } from "@stellar/stellar-sdk";
import { useState, type FormEvent } from "react";
import { defaultVerifier, explorerAccountUrl, stellarConfig, tokenConfig } from "@/config/stellar";
import { formatAmount, MAX_I128, MAX_U32, parseAmount, shortAddress } from "@/lib/format";
import { Field, GhostButton, PrimaryButton, TextArea, TextInput } from "@/components/ui";
import type { CreateProgramParams } from "@/services/uno.service";
import type { TokenBalance } from "@/services/token.service";

const MAX_VERIFIERS = 10; // MAX_PROGRAM_VERIFIERS en el contrato

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

  const capDigits = /^\d{1,10}$/.test(capText.trim());
  const cap = Number(capText);
  if (!capDigits || cap < 1 || cap > MAX_U32)
    errors.cap = `Escribe un número entero de personas, entre 1 y ${MAX_U32.toLocaleString("es-MX")}.`;

  const verifiers = [...new Set(verifiersText.split(/[\s,]+/).filter(Boolean))];
  const invalid = verifiers.find((v) => !StrKey.isValidEd25519PublicKey(v));
  if (verifiers.length === 0) errors.verifiers = "Agrega al menos un verificador.";
  else if (verifiers.length > MAX_VERIFIERS) errors.verifiers = `Máximo ${MAX_VERIFIERS} verificadores.`;
  else if (invalid) errors.verifiers = `"${shortAddress(invalid)}" no es una dirección G… válida.`;

  let total = amount !== null && !errors.cap ? amount * BigInt(cap) : null;
  // El contrato multiplica en i128: si el total no cabe, lo rechazaría con Overflow.
  if (total !== null && total > MAX_I128) {
    errors.amount = "Monto por persona × cupo es demasiado grande para el contrato.";
    total = null;
  }
  return { errors, amount, cap, verifiers, total };
}

export function CreateProgramForm({ org, balance, disabled, onSubmit }: Props) {
  const [amountText, setAmountText] = useState("");
  const [capText, setCapText] = useState("");
  const [verifiersText, setVerifiersText] = useState(defaultVerifier);
  const [touched, setTouched] = useState(false); // mostramos errores después del primer intento
  const [review, setReview] = useState<CreateProgramParams | null>(null); // paso de confirmación

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
    // Antes de abrir Freighter mostramos exactamente lo que se va a firmar (F-03).
    setReview({ org, token: tokenConfig.id, amount, cap, verifiers });
  }

  if (review) {
    return (
      <ConfirmDeposit
        params={review}
        disabled={disabled}
        onBack={() => setReview(null)}
        onConfirm={() => onSubmit(review)}
      />
    );
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

      <div className="space-y-2 rounded-lg border border-hairline bg-background px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
        <ContractLine />
      </div>
      {fundsProblem && <p role="alert" className="text-sm text-warn">{fundsProblem}</p>}
    </form>
  );
}

/** A qué contrato va el dinero, completo y con enlace (F-02). */
function ContractLine() {
  return (
    <p className="text-xs text-muted">
      Contrato Uno:{" "}
      <a href={explorerAccountUrl(stellarConfig.contractId)} target="_blank" rel="noreferrer" className="break-all font-mono text-dim underline underline-offset-4 hover:text-ink">
        {stellarConfig.contractId} ↗
      </a>
    </p>
  );
}

/**
 * Último paso antes de Freighter: lo que se va a firmar, en pesos y como lo
 * muestra la wallet (unidades mínimas, 7 decimales). Así las cifras de
 * Freighter no toman por sorpresa a la organización (F-03).
 */
function ConfirmDeposit({ params, disabled, onBack, onConfirm }: { params: CreateProgramParams; disabled: boolean; onBack: () => void; onConfirm: () => void }) {
  const total = params.amount * BigInt(params.cap);
  const symbol = tokenConfig.symbol;
  return (
    <section className="card rise space-y-5 p-5" aria-labelledby="confirmar-deposito">
      <div>
        <span className="label">Revisa antes de firmar</span>
        <h2 id="confirmar-deposito" className="mt-1 text-xl font-bold">
          Vas a depositar {formatAmount(total)} {symbol} en el contrato {shortAddress(stellarConfig.contractId)}
        </h2>
        <p className="mt-1 text-sm text-dim">
          {params.cap.toLocaleString("es-MX")} personas × {formatAmount(params.amount)} {symbol} cada una. El dinero sale de tu
          cuenta al confirmar en Freighter.
        </p>
      </div>

      <div className="rounded-lg border border-hairline bg-background px-4 py-3">
        <span className="label">En Freighter verás</span>
        <dl className="mt-2 grid gap-x-4 gap-y-1.5 font-mono text-xs sm:grid-cols-[7rem_1fr]">
          <dt className="text-muted">función</dt>
          <dd>create_program</dd>
          <dt className="text-muted">contrato</dt>
          <dd className="break-all">{stellarConfig.contractId}</dd>
          <dt className="text-muted">amount</dt>
          <dd>
            {params.amount.toString()} <span className="font-sans text-muted">({formatAmount(params.amount)} {symbol} con {tokenConfig.decimals} decimales)</span>
          </dd>
          <dt className="text-muted">cap</dt>
          <dd>{params.cap}</dd>
          <dt className="text-muted">token</dt>
          <dd className="break-all">{params.token} <span className="font-sans text-muted">({symbol})</span></dd>
          <dt className="text-muted">verifiers</dt>
          <dd className="space-y-0.5 break-all">{params.verifiers.map((v) => <div key={v}>{v}</div>)}</dd>
          <dt className="text-muted">org</dt>
          <dd className="break-all">{params.org} <span className="font-sans text-muted">(tu cuenta)</span></dd>
        </dl>
        <p className="mt-3 text-xs text-muted">
          Si Freighter muestra otro contrato u otras cifras, rechaza la firma.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <PrimaryButton onClick={onConfirm} disabled={disabled}>Abrir Freighter y firmar</PrimaryButton>
        <GhostButton onClick={onBack} className="h-10">Volver a editar</GhostButton>
      </div>
    </section>
  );
}
