"use client";
// Auditoría pública: cualquiera puede leer un programa sin wallet ni firma.
// El número va en la URL (?programa=3) para poder compartir el enlace.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { explorerAccountUrl, stellarConfig } from "@/config/stellar";
import { useProgram } from "@/hooks/useProgram";
import { parseProgramId } from "@/lib/format";
import { PageShell } from "@/components/layout/SiteHeader";
import { ProgramCard } from "@/components/program/ProgramCard";
import { Field, PrimaryButton, TextInput } from "@/components/ui";

export function AuditoriaView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const programId = parseProgramId(searchParams.get("programa"));
  const program = useProgram(programId);
  const [text, setText] = useState(programId === null ? "" : String(programId));
  const [invalid, setInvalid] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const id = parseProgramId(text);
    setInvalid(id === null);
    if (id !== null) router.replace(`${pathname}?programa=${id}`, { scroll: false });
  }

  return (
    <PageShell>
      <section className="space-y-2">
        <span className="label">Auditoría pública</span>
        <h1 className="text-3xl font-bold tracking-tight">Revisa cualquier programa, sin wallet</h1>
        <p className="text-dim">
          Los datos salen directo del contrato con <code className="font-mono text-sm text-ink">program(id)</code>: una
          simulación de solo lectura que no necesita firma ni cuesta nada. No hay datos personales, solo montos, cupo,
          cobros y direcciones.
        </p>
      </section>

      <form onSubmit={submit} className="card flex flex-wrap items-end gap-3 p-5" noValidate>
        <div className="min-w-40 flex-1">
          <Field label="Número de programa" error={invalid ? "Escribe un número entero de 0 a 4,294,967,295 (los programas empiezan en 0)." : null} hint="Los programas se numeran desde 0.">
            <TextInput inputMode="numeric" placeholder="0" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        </div>
        <PrimaryButton type="submit" className="mb-5">Consultar</PrimaryButton>
      </form>

      {programId !== null && <ProgramCard programId={programId} state={program.state} onRefresh={program.refresh} />}

      <p className="text-xs text-muted">
        Contrato Uno:{" "}
        <a href={explorerAccountUrl(stellarConfig.contractId)} target="_blank" rel="noreferrer" className="break-all font-mono underline underline-offset-4 hover:text-dim">
          {stellarConfig.contractId} ↗
        </a>
      </p>
    </PageShell>
  );
}
