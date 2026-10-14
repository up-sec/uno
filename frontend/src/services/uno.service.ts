// ─────────────────────────────────────────────────────────────────────────────
// 3. INVOCAR EL CONTRATO · Servicio del contrato Uno
//
// Las reglas de cada llamada al contrato: qué se lee, cómo se escribe y qué
// errores salen. No sabe nada de React, así que se puede usar desde un hook,
// un script o un test.
// ─────────────────────────────────────────────────────────────────────────────
import { rpc } from "@stellar/stellar-sdk";
import type { Program } from "uno";
import { explorerTxUrl } from "@/config/stellar";
import { getUnoClient } from "@/lib/contracts/uno.client";
import { TxError } from "./errors";

export type { Program };

// ── Lectura ──────────────────────────────────────────────────────────────────
// Leer NO necesita firma ni cuesta nada: el nodo RPC SIMULA la llamada
// (ejecuta el contrato "en seco", sin guardar nada en la blockchain).
// Por eso la auditoría pública funciona sin conectar wallet.

/** Datos públicos de un programa. Lanza "Error(Contract, #6)" si no existe. */
export async function readProgram(programId: number): Promise<Program> {
  const tx = await getUnoClient().program({ program_id: programId });
  // Si el contrato devuelve un error, la simulación falla con "Error(Contract, #N)".
  // Lo revisamos aquí: el Err de `tx.result` llega sin mensaje, porque los
  // bindings toman el texto de los comentarios del enum Error y no tiene.
  if (rpc.Api.isSimulationError(tx.simulation!)) {
    throw new TxError("simulation", tx.simulation.error);
  }
  return tx.result.unwrap();
}

// ── Escritura ────────────────────────────────────────────────────────────────
// Crear un programa cambia el estado de la blockchain (y mueve dinero), así que
// hace falta una transacción FIRMADA. El ciclo completo:
//
//   1. construir → 2. simular → 3. firmar → 4. enviar → 5. esperar confirmación
//   └─ client.create_program() ─┘ └───────── tx.signAndSend() ─────────┘

/** Los pasos intermedios del ciclo de escritura, en orden. */
export type TxStep = "simulando" | "esperando-firma" | "enviando";

/** Quién firma: el servicio no conoce la wallet, recibe la función (ver wallet.service.ts). */
export type SignTransaction = (
  xdr: string,
  address: string,
) => Promise<{ signedTxXdr: string; signerAddress?: string }>;

export type TxOptions = {
  sign: SignTransaction;
  onStep: (step: TxStep) => void; // para mostrar el avance en la interfaz
};

export type CreateProgramParams = {
  org: string; // la organización: firma y deposita
  token: string;
  amount: bigint; // monto por persona, en unidades mínimas (7 decimales)
  cap: number; // cupo de personas
  verifiers: string[]; // verificadores (Punto Uno) en los que confía la organización
};

export type CreateProgramResult = { programId: number; hash: string; explorerUrl: string };

export async function createProgram(
  { org, token, amount, cap, verifiers }: CreateProgramParams,
  { sign, onStep }: TxOptions,
): Promise<CreateProgramResult> {
  // 1 + 2. CONSTRUIR y SIMULAR. Si va a fallar (token no aprobado, sin saldo,
  // verificador dado de baja…) nos enteramos AQUÍ, sin pedir firma ni gastar nada.
  onStep("simulando");
  const client = getUnoClient(org); // la organización paga la comisión y firma
  const tx = await client.create_program({ org, token, amount, cap, verifiers }, { timeoutInSeconds: 30 });
  if (rpc.Api.isSimulationError(tx.simulation!)) {
    throw new TxError("simulation", tx.simulation.error);
  }

  // 3 + 4 + 5. FIRMAR, ENVIAR y ESPERAR CONFIRMACIÓN.
  // La wallet le muestra a la organización que el contrato va a mover
  // amount × cap de su cuenta: es la autorización del depósito.
  onStep("esperando-firma");
  const sent = await tx.signAndSend({
    signTransaction: async (xdr) => {
      const signed = await sign(xdr, org);
      onStep("enviando");
      return signed;
    },
  });

  // "Enviada" no es "confirmada": signAndSend espera el resultado del ledger.
  const hash = sent.sendTransactionResponse?.hash ?? "";
  if (sent.getTransactionResponse?.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new TxError("failed", "La transacción falló en la red", hash);
  }
  // create_program devuelve Result<u32>: el número del programa nuevo.
  const programId = sent.result.unwrap();
  return { programId, hash, explorerUrl: explorerTxUrl(hash) };
}
