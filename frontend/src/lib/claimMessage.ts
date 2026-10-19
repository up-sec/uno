// Mensaje que firma el celular para cobrar, armado localmente (sin RPC).
// Debe ser idéntico byte por byte a `claim_message` del contrato
// (contracts/uno/src/lib.rs, build_claim_message):
//
//   "UNO-CLAIM-v2" || XDR(contrato) || program_id (u32 BE) || expires_ledger (u32 BE) || XDR(dest)
//
// donde XDR(x) es el ScVal::Address serializado. Comprobado contra el contrato
// desplegado (destinos G y C). Si cambia CLAIM_DOMAIN en el contrato, cambia aquí.
import { Address } from "@stellar/stellar-sdk";

const CLAIM_DOMAIN = new TextEncoder().encode("UNO-CLAIM-v2");

function u32be(n: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n, false);
  return out;
}

export function buildClaimMessage(contractId: string, programId: number, expiresLedger: number, dest: string): Uint8Array {
  const parts = [
    CLAIM_DOMAIN,
    Address.fromString(contractId).toScVal().toXDR(),
    u32be(programId),
    u32be(expiresLedger),
    Address.fromString(dest).toScVal().toXDR(),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
