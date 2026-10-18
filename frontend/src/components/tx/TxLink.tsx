import { explorerTxUrl } from "@/config/stellar";

/** Hash de una transacción con enlace al explorador. */
export function TxLink({ hash, label = "Hash de la transacción" }: { hash: string; label?: string }) {
  return (
    <div>
      <span className="label">{label}</span>
      <a href={explorerTxUrl(hash)} target="_blank" rel="noreferrer" className="mt-1 block break-all font-mono text-sm text-ink underline decoration-hairline-strong underline-offset-4 hover:decoration-ink">
        {hash} ↗
      </a>
    </div>
  );
}
