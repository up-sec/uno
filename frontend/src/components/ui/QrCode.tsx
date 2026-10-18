"use client";
// Código QR generado en el navegador (sin servicios externos).
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrCode({ text, size = 160 }: { text: string; size?: number }) {
  const [src, setSrc] = useState<{ text: string; url: string } | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(text, { margin: 1, width: size * 2, errorCorrectionLevel: "M" }).then((url) => {
      if (active) setSrc({ text, url });
    });
    return () => {
      active = false;
    };
  }, [text, size]);

  return (
    <div className="shrink-0 rounded-lg bg-white p-1.5" style={{ width: size, height: size }}>
      {src?.text === text && (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL generada aquí
        <img src={src.url} alt={`Código QR: ${text}`} width={size - 12} height={size - 12} />
      )}
    </div>
  );
}
