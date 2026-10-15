"use client";
import { useCallback, useState, type FormEvent } from "react";
import { tokenConfig } from "@/config/stellar";
import { isBusy, useCreateProgram } from "@/hooks/useCreateProgram";
import { useMyPrograms } from "@/hooks/useMyPrograms";
import { useProgram } from "@/hooks/useProgram";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useWallet } from "@/hooks/useWallet";
import { formatAmount, parseProgramId } from "@/lib/format";
import { PageShell } from "@/components/layout/SiteHeader";
import { ProgramCard } from "@/components/program/ProgramCard";
import { TxStatus } from "@/components/tx/TxStatus";
import { Dot, GhostButton, TextInput } from "@/components/ui";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { NetworkBanner } from "@/components/wallet/NetworkBanner";
import type { Confirmed } from "@/services/uno.service";
import { CloseProgramPanel } from "./CloseProgramPanel";
import { CreateProgramForm } from "./CreateProgramForm";

export function OrganizacionView() {
  const wallet = useWallet();
  const { balance, refresh: refreshBalance } = useTokenBalance(wallet.address);
  const myPrograms = useMyPrograms(wallet.address);
  const [selected, setSelected] = useState<number | null>(null);
  const shownId = selected ?? myPrograms.ids[0] ?? null; // por defecto, el último que creaste
  const program = useProgram(shownId);

  const { add } = myPrograms;
  const onConfirmed = useCallback(
    ({ value: programId }: Confirmed<number>) => {
      add(programId);
      setSelected(programId);
      refreshBalance(); // el depósito bajó el saldo
    },
    [add, refreshBalance],
  );
  const tx = useCreateProgram(onConfirmed);

  const { refresh: refreshProgram } = program;
  const onClosed = useCallback(() => {
    refreshProgram(); // ahora aparece como cerrado
    refreshBalance(); // regresó el sobrante
  }, [refreshProgram, refreshBalance]);
  const wrongNetwork = wallet.network === "wrong";

  return (
    <PageShell header={<ConnectButton wallet={wallet} />}>
      <section className="space-y-2">
        <span className="label">Organización</span>
        <h1 className="text-3xl font-bold tracking-tight">Reparte apoyos una sola vez por persona</h1>
        <p className="text-dim">
          Crea un programa, deposita el total en el contrato y sigue en vivo cuántas personas ya cobraron. Firmas con
          tu wallet (Freighter): Uno nunca ve tu llave.
        </p>
      </section>

      <NetworkBanner network={wallet.network} />

      {!wallet.ready ? null : !wallet.address ? (
        <section className="card p-5 text-sm text-dim">Conecta tu wallet para crear y ver tus programas.</section>
      ) : (
        <>
          <BalanceCard balance={balance} onRefresh={refreshBalance} />

          {tx.state.status === "idle" ? (
            <CreateProgramForm
              org={wallet.address}
              balance={balance}
              disabled={isBusy(tx.state) || wrongNetwork}
              onSubmit={tx.run}
            />
          ) : (
            <TxStatus
              state={tx.state}
              labels={{ log: "programa.log", done: "Programa creado", doneDetail: "depósito en el contrato" }}
              success={(r) => `Programa #${r.value} creado`}
              onReset={tx.reset}
              onRetry={tx.retry}
              onCheck={tx.check}
              onFund={wallet.fund}
            />
          )}

          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Estado del programa</h2>
                <p className="text-sm text-muted">Lectura pública del contrato: lo mismo que ve cualquier auditor.</p>
              </div>
              <ProgramPicker ids={myPrograms.ids} current={shownId} onPick={setSelected} />
            </div>
            {shownId === null ? (
              <p className="card p-5 text-sm text-muted">Todavía no has creado programas desde este navegador. Escribe un número para consultarlo.</p>
            ) : (
              <>
                <ProgramCard programId={shownId} state={program.state} onRefresh={program.refresh} />
                {/* Solo la organización dueña puede cerrar, y solo si sigue abierto. */}
                {program.state.status === "ok" && program.state.program.open && program.state.program.org === wallet.address && (
                  <CloseProgramPanel
                    key={shownId}
                    programId={shownId}
                    program={program.state.program}
                    org={wallet.address}
                    disabled={wrongNetwork}
                    onClosed={onClosed}
                    onFund={wallet.fund}
                  />
                )}
              </>
            )}
          </section>
        </>
      )}
    </PageShell>
  );
}

function BalanceCard({ balance, onRefresh }: { balance: ReturnType<typeof useTokenBalance>["balance"]; onRefresh: () => void }) {
  let content;
  if (balance === undefined) content = <span className="text-muted">Leyendo saldo…</span>;
  else if (balance === "error") content = <span className="text-warn">No se pudo leer el saldo.</span>;
  else if (balance.status === "sin-trustline")
    content = (
      <span className="flex items-center gap-2 text-warn">
        <Dot tone="warn" /> Sin trustline a {tokenConfig.symbol}: agrégala en Freighter para poder fondear.
      </span>
    );
  else
    content = (
      <span className="flex items-center gap-2">
        <Dot tone="ok" />
        <b className="text-lg tabular-nums">{formatAmount(balance.units)}</b> {tokenConfig.symbol}
      </span>
    );

  return (
    <section className="card flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
      <div className="space-y-0.5">
        <span className="label">Tu saldo</span>
        <div>{content}</div>
      </div>
      <GhostButton onClick={onRefresh}>Actualizar</GhostButton>
    </section>
  );
}

/** Atajos a los programas creados aquí + campo para consultar cualquier número. */
function ProgramPicker({ ids, current, onPick }: { ids: number[]; current: number | null; onPick: (id: number) => void }) {
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  function submit(event: FormEvent) {
    event.preventDefault();
    const id = parseProgramId(text);
    setInvalid(id === null);
    if (id !== null) onPick(id);
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ids.slice(0, 6).map((id) => (
        <button
          key={id}
          onClick={() => onPick(id)}
          className={`h-9 rounded-lg border px-3 font-mono text-sm ${id === current ? "border-hairline-strong bg-surface-2 text-ink" : "border-hairline text-dim hover:text-ink"}`}
        >
          #{id}
        </button>
      ))}
      <form onSubmit={submit} className="flex gap-2">
        <TextInput aria-label="Número de programa" inputMode="numeric" placeholder="#" value={text} onChange={(e) => setText(e.target.value)} className="h-9 w-20" />
        <GhostButton type="submit">Ver</GhostButton>
      </form>
      {invalid && <p role="alert" className="w-full text-xs text-bad">Escribe un número de programa válido: entero de 0 a 4,294,967,295.</p>}
    </div>
  );
}
