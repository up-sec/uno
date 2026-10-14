"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const LINKS = [
  { href: "/", label: "Inicio" },
  { href: "/organizacion", label: "Organización" },
  { href: "/auditoria", label: "Auditoría" },
  { href: "/punto-uno", label: "Punto Uno" },
  { href: "/beneficiario", label: "Beneficiario" },
];

/** Encabezado común: marca + navegación entre pantallas (+ wallet, si la pantalla la usa). */
export function SiteHeader({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  return (
    <header className="space-y-5 border-b border-hairline pb-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-2xl font-black tracking-tight">Uno</span>
          <span className="label">Stellar Testnet</span>
        </Link>
        {children}
      </div>
      <nav aria-label="Pantallas" className="-mx-1 flex flex-wrap gap-1">
        {LINKS.map((link) => {
          const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${active ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"}`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

/** Contenedor de cada pantalla. */
export function PageShell({ header, children }: { header?: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-5 py-8 sm:px-8">
      <SiteHeader>{header}</SiteHeader>
      {children}
    </main>
  );
}
