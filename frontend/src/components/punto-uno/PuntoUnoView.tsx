"use client";
// Punto Uno: el operador verifica a la persona en persona y emite su credencial.
// La CURP viaja solo a /api/registro (mismo servidor); en Stellar quedan la
// huella y la llave pública. El PIN vive solo en esta pantalla, no se guarda.
import { useCallback, useState, type FormEvent } from "react";
import { StrKey } from "@stellar/stellar-sdk";
import { PageShell } from "@/components/layout/SiteHeader";
import { TxLink } from "@/components/tx/TxLink";
import { Field, GhostButton, PrimaryButton, TextInput } from "@/components/ui";
import { ApiCallError, postApi } from "@/services/api";
import { QrScanner } from "./QrScanner";

type State =
  | { status: "idle" }
  | { status: "enviando" }
  | { status: "ok"; hash: string }
  | { status: "error"; title: string; message: string; hash?: string };

export function PuntoUnoView() {
  const [pin, setPin] = useState("");
  const [curp, setCurp] = useState("");
  const [llave, setLlave] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  const curpText = curp.replace(/\s+/g, "").toUpperCase();
  const curpLooksOk = /^[A-Z0-9]{18}$/.test(curpText);
  const llaveOk = StrKey.isValidEd25519PublicKey(llave.trim());
  const busy = state.status === "enviando";

  const onScan = useCallback((text: string) => setLlave(text), []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState({ status: "enviando" });
    try {
      const { hash } = await postApi<{ hash: string }>("/api/registro", { pin, curp: curpText, llave: llave.trim() });
      setState({ status: "ok", hash });
      setCurp(""); // la CURP no se queda en pantalla
      setLlave("");
    } catch (error) {
      const e = error instanceof ApiCallError ? error : new ApiCallError("Unknown", "Ocurrió un error inesperado.");
      setState({ status: "error", title: e.code === "BadPin" ? "PIN incorrecto" : "No se pudo registrar", message: e.message, hash: e.hash });
    }
  }

  return (
    <PageShell>
      <section className="space-y-2">
        <span className="label">Punto Uno · verificador</span>
        <h1 className="text-3xl font-bold tracking-tight">Registrar a una persona</h1>
        <p className="text-dim">
          Comprueba a la persona en persona y emite su credencial de unicidad. La CURP se convierte en una huella en el
          servidor y se descarta: en Stellar solo quedan la huella y la llave pública de su celular.
        </p>
      </section>

      <form onSubmit={submit} className="card space-y-4 p-5">
        <Field label="PIN del Punto Uno" hint="Lo da el administrador. No se guarda en este navegador.">
          <TextInput type="password" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} />
        </Field>
        <Field label="CURP" hint="Se envía solo al servidor para calcular la huella. No se guarda." error={curp && !curpLooksOk ? "La CURP tiene 18 letras y números." : null}>
          <TextInput autoComplete="off" spellCheck={false} placeholder="XXXX000000XXXXXX00" value={curp} onChange={(e) => setCurp(e.target.value)} className="font-mono uppercase" />
        </Field>
        <Field label="Llave pública del celular" hint="La muestra la pantalla Beneficiario del celular (texto o QR)." error={llave && !llaveOk ? "Debe ser una cuenta G… válida." : null}>
          <TextInput autoComplete="off" spellCheck={false} placeholder="G…" value={llave} onChange={(e) => setLlave(e.target.value)} className="font-mono" />
        </Field>
        <QrScanner onScan={onScan} />
        <PrimaryButton type="submit" disabled={busy || !pin || !curpLooksOk || !llaveOk}>
          {busy ? "Emitiendo…" : "Emitir credencial"}
        </PrimaryButton>
      </form>

      {state.status === "ok" && (
        <section className="card rise space-y-2 p-5" aria-live="polite">
          <p className="text-lg font-bold text-ok">✓ Credencial emitida</p>
          <TxLink hash={state.hash} />
          <GhostButton onClick={() => setState({ status: "idle" })}>Registrar a otra persona</GhostButton>
        </section>
      )}
      {state.status === "error" && (
        <section role="alert" className="card rise space-y-2 p-5">
          <p className="text-lg font-bold text-bad">{state.title}</p>
          <p className="text-sm text-dim">{state.message}</p>
          {state.hash && <TxLink hash={state.hash} />}
        </section>
      )}
    </PageShell>
  );
}
