"use client";
// Enlace (y QR) que la organización comparte con sus beneficiarios para cobrar.
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { QrCode } from "@/components/ui/QrCode";

const noop = () => () => {};

export function BeneficiaryLink({ programId }: { programId: number }) {
  const path = `/beneficiario?programa=${programId}`;
  // El dominio solo se conoce en el navegador; en el servidor no hay QR.
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => null);

  return (
    <section className="card flex flex-wrap items-center gap-5 p-5">
      {origin && <QrCode text={origin + path} size={140} />}
      <div className="min-w-0 flex-1 space-y-1.5">
        <h3 className="font-bold">Enlace para beneficiarios</h3>
        <p className="text-sm text-muted">Compártelo o muestra el QR: ahí cada persona genera su llave y cobra el programa #{programId}.</p>
        <Link href={path} className="block break-all font-mono text-sm text-ink underline decoration-hairline-strong underline-offset-4 hover:decoration-ink">
          {origin ? origin + path : path}
        </Link>
      </div>
    </section>
  );
}
