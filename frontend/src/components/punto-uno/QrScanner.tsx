"use client";
// Lee un QR con la cámara usando BarcodeDetector (Chrome/Android, Safari 17+).
// Si el navegador no lo tiene, no se muestra: la llave se puede pegar como texto.
import { useEffect, useRef, useState } from "react";
import { GhostButton } from "@/components/ui";

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (options: { formats: string[] }) => Detector;

function getDetector(): DetectorCtor | undefined {
  return typeof window === "undefined" ? undefined : (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
}

export function QrScanner({ onScan }: { onScan: (text: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- solo existe en el navegador
  useEffect(() => setSupported(!!getDetector()), []);

  useEffect(() => {
    if (!open) return;
    const Ctor = getDetector();
    if (!Ctor) return;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const detector = new Ctor({ formats: ["qr_code"] });
        const tick = async () => {
          if (stopped || !video.current) return;
          const codes = await detector.detect(video.current).catch(() => []);
          if (codes[0]?.rawValue) {
            onScan(codes[0].rawValue.trim());
            setOpen(false);
            return;
          }
          timer = window.setTimeout(tick, 250);
        };
        tick();
      } catch {
        setError("No se pudo abrir la cámara. Pega la llave como texto.");
        setOpen(false);
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onScan]);

  if (!supported) return null;
  return (
    <div className="space-y-2">
      <GhostButton type="button" onClick={() => { setError(null); setOpen((o) => !o); }}>
        {open ? "Cerrar cámara" : "Escanear QR del celular"}
      </GhostButton>
      {open && <video ref={video} muted playsInline className="w-full max-w-xs rounded-lg border border-hairline" />}
      {error && <p className="text-xs text-warn">{error}</p>}
    </div>
  );
}
