// Pantallas que todavía no se conectan al contrato: solo muestran la interfaz.
// Todo está deshabilitado a propósito, para que nadie crea que ya funciona.
import type { ReactNode } from "react";
import { PageShell } from "@/components/layout/SiteHeader";
import { Badge, Field, PrimaryButton, TextInput } from "@/components/ui";

function ComingSoonShell({ role, title, intro, children, notes }: { role: string; title: string; intro: string; children: ReactNode; notes: string[] }) {
  return (
    <PageShell>
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="label">{role}</span>
          <Badge tone="warn">Próxima semana</Badge>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-dim">{intro}</p>
      </section>

      <fieldset disabled aria-describedby="proximamente" className="card space-y-4 p-5 opacity-80">
        <p id="proximamente" className="rounded-lg border border-warn/40 px-3 py-2 text-sm text-warn">
          Vista previa: esta pantalla todavía no se conecta al contrato.
        </p>
        {children}
      </fieldset>

      <section className="space-y-2">
        <h2 className="label">Cómo va a funcionar</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-dim">
          {notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      </section>
    </PageShell>
  );
}

export function PuntoUnoView() {
  return (
    <ComingSoonShell
      role="Punto Uno · verificador"
      title="Registrar a una persona"
      intro="El verificador comprueba a la persona en persona y emite su credencial de unicidad en Stellar."
      notes={[
        "La CURP se escribe aquí, pero nunca llega a la blockchain: el backend calcula una huella (HMAC) con un secreto que solo vive en el servidor.",
        "En Stellar solo quedan la huella y la llave pública del celular de la persona (issue).",
        "Si la persona perdió su celular, el verificador puede revocar y reemitir su credencial sin que pueda cobrar dos veces.",
      ]}
    >
      <Field label="CURP" hint="Se envía al backend para calcular la huella. No se guarda.">
        <TextInput placeholder="XXXX000000XXXXXX00" />
      </Field>
      <Field label="Llave pública del celular" hint="La genera la app del beneficiario.">
        <TextInput placeholder="Clave Ed25519 (32 bytes en hex)" className="font-mono" />
      </Field>
      <PrimaryButton type="button">Emitir credencial</PrimaryButton>
    </ComingSoonShell>
  );
}

export function BeneficiarioView() {
  return (
    <ComingSoonShell
      role="Beneficiario"
      title="Cobrar mi apoyo"
      intro="La persona firma el reclamo desde su celular y el contrato le paga una sola vez por programa."
      notes={[
        "El celular firma un mensaje que incluye el programa, la cuenta destino y una fecha de caducidad (claim_message).",
        "Un relayer envía la transacción: la persona no necesita XLM para la comisión.",
        "El contrato revisa la firma, que la credencial esté vigente y que el verificador sea uno aceptado por el programa.",
      ]}
    >
      <Field label="Número de programa">
        <TextInput placeholder="0" inputMode="numeric" />
      </Field>
      <Field label="Cuenta donde recibir el apoyo">
        <TextInput placeholder="G…" className="font-mono" />
      </Field>
      <PrimaryButton type="button">Firmar y cobrar</PrimaryButton>
    </ComingSoonShell>
  );
}
