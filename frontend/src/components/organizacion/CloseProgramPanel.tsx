"use client";
// Cerrar un programa: el contrato le regresa a la organización lo que no se
// cobró y ya nadie más puede cobrar en él. Solo se ofrece a la organización
// dueña y solo si el programa sigue abierto. Pide confirmación porque no se
// puede deshacer.
import { useState } from "react";
import { tokenConfig } from "@/config/stellar";
import { isBusy, useCloseProgram } from "@/hooks/useCreateProgram";
import { formatAmount } from "@/lib/format";
import { TxStatus } from "@/components/tx/TxStatus";
import { GhostButton, PrimaryButton } from "@/components/ui";
import type { Program } from "@/services/uno.service";

type Props = {
  programId: number;
  program: Program;
  org: string;
  disabled: boolean; // la wallet está en otra red
  onClosed: () => void; // refrescar el programa y el saldo
  onFund: () => Promise<void>;
};

export function CloseProgramPanel({ programId, program, org, disabled, onClosed, onFund }: Props) {
  const [confirming, setConfirming] = useState(false);
  const tx = useCloseProgram(onClosed);

  const pending = program.cap - program.claimed;
  const refund = BigInt(program.amount) * BigInt(pending); // lo mismo que calcula close_program
  const symbol = tokenConfig.symbol;

  if (tx.state.status !== "idle") {
    return (
      <TxStatus
        state={tx.state}
        labels={{ log: "cierre.log", done: "Programa cerrado", doneDetail: "sobrante devuelto" }}
        success={(r) => `Programa #${programId} cerrado: recuperaste ${formatAmount(r.value)} ${symbol}`}
        onReset={() => {
          tx.reset();
          setConfirming(false);
        }}
        onRetry={tx.retry}
        onCheck={tx.check}
        onFund={onFund}
      />
    );
  }

  if (!confirming) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline px-4 py-3">
        <p className="text-sm text-dim">
          Al cerrar recuperas <b className="text-ink">{formatAmount(refund)} {symbol}</b> y ya nadie podrá cobrar en este programa.
        </p>
        <GhostButton onClick={() => setConfirming(true)} disabled={disabled}>Cerrar programa</GhostButton>
      </div>
    );
  }

  return (
    <div role="alertdialog" aria-labelledby={`cerrar-${programId}`} className="space-y-3 rounded-lg border border-warn/50 px-4 py-4">
      <p id={`cerrar-${programId}`} className="font-bold">¿Cerrar el programa #{programId}?</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-dim">
        <li>
          Recuperas <b className="text-ink">{formatAmount(refund)} {symbol}</b> ({pending} cobros pendientes × {formatAmount(BigInt(program.amount))} {symbol}).
        </li>
        <li>Las {pending} personas que todavía no cobran ya no podrán hacerlo, aunque tengan un reclamo firmado.</li>
        <li>No se puede deshacer.</li>
      </ul>
      <div className="flex flex-wrap gap-2">
        <PrimaryButton onClick={() => tx.run({ org, programId })} disabled={disabled || isBusy(tx.state)}>
          Sí, cerrar y recuperar {formatAmount(refund)} {symbol}
        </PrimaryButton>
        <GhostButton onClick={() => setConfirming(false)} className="h-10">Cancelar</GhostButton>
      </div>
    </div>
  );
}
