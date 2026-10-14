// Piezas visuales compartidas. Sin lógica.
import type { ComponentProps, ReactNode } from "react";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";

export function PrimaryButton({ className = "", ...props }: ComponentProps<"button">) {
  return <button className={`${base} h-10 bg-ink px-4 text-sm text-background hover:bg-ink/85 ${className}`} {...props} />;
}

export function GhostButton({ className = "", ...props }: ComponentProps<"button">) {
  return (
    <button
      className={`${base} h-9 border border-hairline px-3 text-sm text-dim hover:border-hairline-strong hover:text-ink ${className}`}
      {...props}
    />
  );
}

/** Punto de estado: ok (verde) · bad (rojo) · warn (ámbar) · idle (gris) */
export function Dot({ tone }: { tone: "ok" | "bad" | "warn" | "idle" }) {
  const color = { ok: "bg-ok", bad: "bg-bad", warn: "bg-warn", idle: "bg-muted" }[tone];
  return <span className={`inline-block size-1.5 shrink-0 rounded-full ${color}`} />;
}

/** Etiqueta + control + ayuda o error debajo. */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      {children}
      {error ? <span className="block text-xs text-bad">{error}</span> : hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

const control =
  "w-full rounded-lg border border-hairline bg-background px-3 text-sm text-ink placeholder:text-muted/70 focus:border-hairline-strong focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

export function TextInput({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${control} h-10 ${className}`} {...props} />;
}

export function TextArea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea className={`${control} py-2 font-mono ${className}`} {...props} />;
}

/** Etiqueta chica de estado ("Abierto", "Próxima semana"…). */
export function Badge({ tone, children }: { tone: "ok" | "bad" | "warn" | "idle"; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-0.5 text-xs text-dim">
      <Dot tone={tone} />
      {children}
    </span>
  );
}
