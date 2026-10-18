"use client";
// Beneficiario: su celular genera la llave, la muestra para el registro en Punto
// Uno y firma el cobro. La llave privada nunca sale de este navegador.
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Keypair } from "@stellar/stellar-sdk";
import { tokenConfig } from "@/config/stellar";
import { useProgram } from "@/hooks/useProgram";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { formatAmount, parseProgramId } from "@/lib/format";
import { PageShell } from "@/components/layout/SiteHeader";
import { QrCode } from "@/components/ui/QrCode";
import { TxLink } from "@/components/tx/TxLink";
import { Badge, GhostButton, PrimaryButton } from "@/components/ui";
import { ApiCallError } from "@/services/api";
import { cobrar, loadOrCreateKey, type CobroResult, type CobroStep } from "@/services/beneficiario.service";

type State =
  | { status: "idle" }
  | { status: CobroStep }
  | ({ status: "ok" } & CobroResult)
  | { status: "error"; message: string; hash?: string };

const STEP_TEXT: Record<CobroStep, string> = {
  firmando: "Firmando el reclamo en este celular…",
  "creando-cuenta": "Creando tu cuenta (la paga Uno)…",
  cobrando: "Cobrando…",
};

export function BeneficiarioView() {
  const programId = parseProgramId(useSearchParams().get("programa"));
  const [keypair, setKeypair] = useState<Keypair | null | undefined>(undefined); // undefined = cargando
  const [state, setState] = useState<State>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const program = useProgram(programId);
  const address = keypair?.publicKey() ?? null;
  const { balance, refresh: refreshBalance } = useTokenBalance(address);

  // localStorage solo existe en el navegador.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setKeypair(loadOrCreateKey()), []);

  async function onCobrar() {
    if (!keypair || programId === null) return;
    try {
      const result = await cobrar(keypair, programId, (step) => setState({ status: step }));
      setState({ status: "ok", ...result });
      refreshBalance();
      program.refresh();
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Ocurrió un error inesperado.",
        hash: error instanceof ApiCallError ? error.hash : undefined,
      });
    }
  }

  async function copy() {
    if (!address) return;
    await navigator.clipboard.writeText(address).catch(() => {});
    setCopied(true);
  }

  const busy = state.status === "firmando" || state.status === "creando-cuenta" || state.status === "cobrando";
  const p = program.state.status === "ok" ? program.state.program : null;

  return (
    <PageShell>
      <section className="space-y-2">
        <span className="label">Beneficiario</span>
        <h1 className="text-3xl font-bold tracking-tight">Cobrar mi apoyo</h1>
        <p className="text-dim">
          Este celular guarda tu llave. Muéstrala en Punto Uno para registrarte y después cobra aquí: solo se puede
          cobrar una vez por programa y no necesitas XLM.
        </p>
      </section>

      {keypair === null && (
        <p role="alert" className="card p-5 text-sm text-bad">
          Este navegador no permite guardar datos (¿modo privado?). Abre la página en una ventana normal para no perder tu llave.
        </p>
      )}

      {address && (
        <section className="card space-y-4 p-5">
          <div>
            <h2 className="text-lg font-bold">1. Tu llave para el registro</h2>
            <p className="text-sm text-muted">Enséñale este código al Punto Uno. Es pública: no permite cobrar por ti.</p>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <QrCode text={address} size={180} />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="break-all font-mono text-sm">{address}</p>
              <GhostButton onClick={copy}>{copied ? "Copiada ✓" : "Copiar llave"}</GhostButton>
            </div>
          </div>
          <p className="text-xs text-warn">
            Tu llave privada vive solo en este navegador. Si borras sus datos, la pierdes y tendrás que pedir en Punto Uno que te registren con una nueva.
          </p>
        </section>
      )}

      <section className="card space-y-4 p-5" aria-live="polite">
        <div>
          <h2 className="text-lg font-bold">2. Cobrar {programId !== null && `en el programa #${programId}`}</h2>
          {programId === null && <p className="text-sm text-bad">Abre el enlace que te dio la organización (incluye ?programa=…).</p>}
          {p && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-dim">
              <Badge tone={p.open ? "ok" : "idle"}>{p.open ? "Abierto" : "Cerrado"}</Badge>
              <span>{formatAmount(BigInt(p.amount))} {tokenConfig.symbol} por persona · {p.claimed}/{p.cap} cobros</span>
            </div>
          )}
          {program.state.status === "error" && <p className="text-sm text-bad">{program.state.error.title}</p>}
        </div>

        {balance && balance !== "error" && balance.status !== "sin-trustline" && (
          <p className="text-sm">Tu saldo: <b className="tabular-nums">{formatAmount(balance.units)}</b> {tokenConfig.symbol}</p>
        )}

        <PrimaryButton onClick={onCobrar} disabled={!keypair || programId === null || busy || (p !== null && !p.open)}>
          {busy ? STEP_TEXT[state.status as CobroStep] : "Cobrar"}
        </PrimaryButton>

        {state.status === "ok" && (
          <div className="space-y-3">
            <p className="text-lg font-bold text-ok">✓ Cobraste tu apoyo</p>
            {state.cuentaHash && <TxLink hash={state.cuentaHash} label="Creación de tu cuenta" />}
            <TxLink hash={state.cobroHash} label="Cobro" />
          </div>
        )}
        {state.status === "error" && (
          <div role="alert" className="space-y-2">
            <p className="font-bold text-bad">No se pudo cobrar</p>
            <p className="text-sm text-dim">{state.message}</p>
            {state.hash && <TxLink hash={state.hash} />}
          </div>
        )}
      </section>
    </PageShell>
  );
}
