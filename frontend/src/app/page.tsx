import Link from "next/link";
import { PageShell } from "@/components/layout/SiteHeader";
import { Badge } from "@/components/ui";
import { explorerAccountUrl, stellarConfig } from "@/config/stellar";

const STEPS = [
  { title: "Registro", text: "Un Punto Uno verifica a la persona en persona. En Stellar solo queda una huella de unicidad, nunca su CURP." },
  { title: "Programa", text: "La organización crea un programa y deposita en el contrato el total: monto por persona × cupo." },
  { title: "Cobro", text: "La persona firma desde su celular. El contrato paga una sola vez por persona y por programa." },
  { title: "Cierre", text: "La organización cierra el programa y recupera lo que no se cobró. Todo queda auditable." },
];

const ROLES = [
  { href: "/organizacion", title: "Organización", text: "Crea un programa, deposita y sigue los cobros.", ready: true },
  { href: "/auditoria", title: "Auditoría pública", text: "Revisa cualquier programa sin wallet.", ready: true },
  { href: "/punto-uno", title: "Punto Uno", text: "Registra personas y emite credenciales.", ready: false },
  { href: "/beneficiario", title: "Beneficiario", text: "Cobra tu apoyo desde el celular.", ready: false },
];

/** Inicio: qué es Uno y a dónde ir según tu rol. */
export default function Home() {
  return (
    <PageShell>
      <section className="space-y-4 py-4">
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Un apoyo, una persona.</h1>
        <p className="max-w-2xl text-lg text-dim">
          Uno permite que las organizaciones que reparten apoyos paguen <b className="text-ink">una sola vez a cada
          persona real</b>, sin guardar su INE ni su CURP.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="label">Cómo funciona</h2>
        <ol className="grid gap-2 sm:grid-cols-2">
          {STEPS.map((step, i) => (
            <li key={step.title} className="card p-4">
              <p className="font-mono text-xs text-muted">0{i + 1}</p>
              <p className="mt-1 font-bold">{step.title}</p>
              <p className="mt-1 text-sm text-dim">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="label">Entra según tu rol</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {ROLES.map((role) => (
            <Link key={role.href} href={role.href} className="card group block p-4 transition-colors hover:border-hairline-strong">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold">{role.title} <span className="text-muted transition-colors group-hover:text-ink">→</span></p>
                {!role.ready && <Badge tone="warn">Próxima semana</Badge>}
              </div>
              <p className="mt-1 text-sm text-dim">{role.text}</p>
            </Link>
          ))}
        </div>
      </section>

      <p className="text-xs text-muted">
        Contrato Uno v1.1 en {stellarConfig.network}:{" "}
        <a href={explorerAccountUrl(stellarConfig.contractId)} target="_blank" rel="noreferrer" className="break-all font-mono underline underline-offset-4 hover:text-dim">
          {stellarConfig.contractId} ↗
        </a>
      </p>
    </PageShell>
  );
}
