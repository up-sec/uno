"use client";
// Estado público de un programa: lo mismo que ve cualquiera con program(id).
import { explorerAccountUrl, tokenConfig } from "@/config/stellar";
import type { ProgramState } from "@/hooks/useProgram";
import { formatAmount, shortAddress } from "@/lib/format";
import { Badge, GhostButton } from "@/components/ui";
import type { Program } from "@/services/uno.service";

function AddressLink({ address, label }: { address: string; label?: string }) {
  return (
    <a href={explorerAccountUrl(address)} target="_blank" rel="noreferrer" title={address} className="font-mono text-ink underline decoration-hairline-strong underline-offset-4 hover:decoration-ink">
      {label ?? shortAddress(address)} ↗
    </a>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-background px-3 py-2.5">
      <span className="label">{label}</span>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function ProgramDetails({ programId, program }: { programId: number; program: Program }) {
  const symbol = program.token === tokenConfig.id ? tokenConfig.symbol : "";
  const amount = BigInt(program.amount);
  const remainingPeople = program.cap - program.claimed;
  // Mientras está abierto, el contrato guarda lo que falta por cobrar.
  // Al cerrarse, ese sobrante regresó a la organización.
  const inCustody = program.open ? amount * BigInt(remainingPeople) : BigInt(0);
  const percent = program.cap === 0 ? 0 : Math.round((program.claimed / program.cap) * 100);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xl font-bold">Programa #{programId}</h3>
        <Badge tone={program.open ? "ok" : "idle"}>{program.open ? "Abierto" : "Cerrado"}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Por persona" value={`${formatAmount(amount)} ${symbol}`} />
        <Stat label="Cobros" value={`${program.claimed} / ${program.cap}`} sub={`${percent}% del cupo`} />
        <Stat
          label="En el contrato"
          value={`${formatAmount(inCustody)} ${symbol}`}
          sub={program.open ? `${remainingPeople} cobros pendientes` : "sobrante devuelto"}
        />
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de cobros">
        <div className="h-full bg-ink transition-[width]" style={{ width: `${percent}%` }} />
      </div>

      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
        <dt className="text-muted">Organización</dt>
        <dd><AddressLink address={program.org} /></dd>
        <dt className="text-muted">Token</dt>
        <dd><AddressLink address={program.token} label={symbol ? `${symbol} · ${shortAddress(program.token)}` : undefined} /></dd>
        <dt className="text-muted">Verificadores</dt>
        <dd className="space-y-1">
          {program.verifiers.map((v) => (
            <div key={v}><AddressLink address={v} /></div>
          ))}
        </dd>
      </dl>
    </div>
  );
}

/** Tarjeta con los estados de carga: cargando, error, ok. */
export function ProgramCard({ programId, state, onRefresh }: { programId: number; state: ProgramState; onRefresh: () => void }) {
  return (
    <section className="card rise space-y-4 p-5" aria-live="polite">
      {state.status === "cargando" && <p className="text-sm text-muted">Leyendo el programa #{programId}…</p>}
      {state.status === "error" && (
        <div role="alert" className="space-y-1">
          <p className="font-bold text-bad">{state.error.title}</p>
          <p className="text-sm text-dim">{state.error.message}</p>
        </div>
      )}
      {state.status === "ok" && <ProgramDetails programId={state.programId} program={state.program} />}
      {state.status !== "cargando" && (
        <GhostButton onClick={onRefresh}>Actualizar</GhostButton>
      )}
    </section>
  );
}
