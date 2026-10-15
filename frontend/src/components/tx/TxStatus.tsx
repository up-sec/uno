"use client";
import { useState, type ReactNode } from "react";
import { GhostButton, PrimaryButton } from "@/components/ui";
import type { TxState } from "@/hooks/useTransaction";
import type { FriendlyError } from "@/services/errors";
import type { Confirmed, TxStep } from "@/services/uno.service";

type Props<T> = {
  state: TxState<T>;
  /** Nombre del log y texto del último paso, según la operación. */
  labels: { log: string; done: string; doneDetail: string };
  /** Qué decir cuando se confirma (ej. "Programa #3 creado"). */
  success: (result: Confirmed<T>) => ReactNode;
  onReset: () => void;
  onRetry: () => void; // "Reintentar": solo si el error lo permite
  onCheck: () => void; // "Revisar estado": si ya se envió y no sabemos si entró
  onFund: () => Promise<void>; // Friendbot, para el error "cuenta sin fondos"
};

/** Las líneas del log, en orden. Cada una explica qué pasa en ese paso. */
function lines(labels: Props<unknown>["labels"]): { step: TxStep | "confirmado"; text: string; detail: string }[] {
  return [
    { step: "simulando", text: "Preparando…", detail: "construir + simular" },
    { step: "esperando-firma", text: "Esperando firma…", detail: "Freighter firma" },
    { step: "enviando", text: "Enviando…", detail: "enviar + esperar ledger" },
    { step: "confirmado", text: labels.done, detail: labels.doneDetail },
  ];
}

export function TxStatus<T>({ state, labels, success, onReset, onRetry, onCheck, onFund }: Props<T>) {
  const [funding, setFunding] = useState(false);
  if (state.status === "idle") return null;

  const LINES = lines(labels);
  const step = state.status === "error" ? state.step : state.status;
  const current = state.status === "confirmado" ? LINES.length : LINES.findIndex((l) => l.step === step);
  const failed = state.status === "error";

  return (
    <section className="card rise overflow-hidden" aria-live="polite">
      <header className="flex items-center gap-3 border-b border-hairline bg-surface-2 px-4 py-2.5">
        <span className="flex gap-1.5">
          <i className="size-2 rounded-full bg-hairline-strong" />
          <i className="size-2 rounded-full bg-hairline-strong" />
          <i className="size-2 rounded-full bg-hairline-strong" />
        </span>
        <span className="font-mono text-xs text-muted">{labels.log}</span>
      </header>

      <ol className="space-y-2.5 px-4 py-4 font-mono text-sm">
        {LINES.map((line, i) => {
          const done = i < current;
          const active = i === current && !failed;
          const error = i === current && failed;
          return (
            <li key={line.step} className={`flex items-center gap-3 ${done || active || error ? "text-ink" : "text-muted/60"}`}>
              <span className="w-5 text-center">
                {done && <span className="text-ok">✓</span>}
                {active && <span className="inline-block size-3 animate-spin rounded-full border-2 border-ink border-t-transparent" />}
                {error && <span className="text-bad">✗</span>}
                {!done && !active && !error && "·"}
              </span>
              <span className={error ? "text-bad" : ""}>{line.text}</span>
              <span className="ml-auto text-xs text-muted">{line.detail}</span>
            </li>
          );
        })}
      </ol>

      {state.status === "confirmado" && (
        <footer className="space-y-3 border-t border-hairline px-4 py-4">
          <p className="text-lg font-bold text-ok">✓ {success(state)}</p>
          <HashLink hash={state.hash} explorerUrl={state.explorerUrl} />
          <PrimaryButton onClick={onReset}>Listo</PrimaryButton>
        </footer>
      )}

      {state.status === "error" && (
        <ErrorFooter
          error={state.error}
          checking={!!state.checking}
          funding={funding}
          onReset={onReset}
          onRetry={onRetry}
          onCheck={onCheck}
          onFund={async () => {
            setFunding(true);
            try {
              await onFund();
            } finally {
              setFunding(false);
            }
          }}
        />
      )}
    </section>
  );
}

function HashLink({ hash, explorerUrl }: { hash: string; explorerUrl?: string }) {
  return (
    <div>
      <span className="label">Hash de la transacción</span>
      {explorerUrl ? (
        <a href={explorerUrl} target="_blank" rel="noreferrer" className="mt-1 block break-all font-mono text-sm text-ink underline decoration-hairline-strong underline-offset-4 hover:decoration-ink">
          {hash} ↗
        </a>
      ) : (
        <p className="mt-1 break-all font-mono text-sm text-ink">{hash}</p>
      )}
    </div>
  );
}

type FooterProps = {
  error: FriendlyError;
  checking: boolean;
  funding: boolean;
  onReset: () => void;
  onRetry: () => void;
  onCheck: () => void;
  onFund: () => void;
};

function ErrorFooter({ error: friendly, checking, funding, onReset, onRetry, onCheck, onFund }: FooterProps) {
  const pending = friendly.action === "check";
  return (
    <footer role="alert" className="space-y-3 border-t border-hairline px-4 py-4">
      <div>
        <p className={`text-lg font-bold ${pending ? "text-warn" : "text-bad"}`}>{friendly.title}</p>
        <p className="mt-1 text-sm text-dim">{friendly.message}</p>
      </div>

      {friendly.hash && <HashLink hash={friendly.hash} explorerUrl={friendly.explorerUrl} />}

      <details className="text-xs">
        <summary className="cursor-pointer text-muted hover:text-dim">Detalle técnico</summary>
        <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-background p-3 font-mono text-xs whitespace-pre-wrap text-muted">{friendly.detail}</pre>
      </details>

      <div className="flex flex-wrap gap-2">
        {pending && (
          <PrimaryButton onClick={onCheck} disabled={checking}>{checking ? "Revisando…" : "Revisar estado"}</PrimaryButton>
        )}
        {friendly.action === "retry" && <PrimaryButton onClick={onRetry}>Reintentar</PrimaryButton>}
        {friendly.action === "friendbot" && (
          <PrimaryButton onClick={onFund} disabled={funding}>{funding ? "Fondeando…" : "Fondear con Friendbot"}</PrimaryButton>
        )}
        {/* Cerrar con una transacción dudosa podría llevar a firmar otra: lo avisamos. */}
        <GhostButton onClick={onReset} className="h-10">{pending ? "Cerrar (revisa antes de volver a intentar)" : "Cerrar"}</GhostButton>
      </div>
    </footer>
  );
}
