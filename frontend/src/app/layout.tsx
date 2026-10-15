import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Uno · Credencial de unicidad sobre Stellar",
  description: "Apoyos que se pagan una sola vez por persona real, sin guardar su INE ni su CURP.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // suppressHydrationWarning en <html>: Stellar Wallets Kit agrega variables
  // CSS (--swk-*) a <html> en el navegador, que el HTML del servidor no tiene.
  return (
    <html lang="es" className="h-full" suppressHydrationWarning>
      <head>
        {/* Satoshi (Fontshare) */}
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap"
        />
      </head>
      <body className="min-h-full">
        {/* Auditoría lee ?programa= con useSearchParams: Next pide un Suspense arriba. */}
        <Suspense>{children}</Suspense>
      </body>
    </html>
  );
}
