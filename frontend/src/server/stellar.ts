// Firmar y enviar transacciones con las cuentas del servidor (verificador y relayer).
import "server-only";
import { contract, rpc, type Keypair } from "@stellar/stellar-sdk";
import { Client } from "uno";
import { stellarConfig } from "@/config/stellar";
import { ApiError } from "./http";

/** Cliente del contrato que firma con `keypair` (y la usa como fuente de la transacción). */
export function unoClientFor(keypair: Keypair): Client {
  return new Client({
    contractId: stellarConfig.contractId,
    networkPassphrase: stellarConfig.networkPassphrase,
    rpcUrl: stellarConfig.rpcUrl,
    publicKey: keypair.publicKey(),
    signTransaction: contract.basicNodeSigner(keypair, stellarConfig.networkPassphrase).signTransaction,
  });
}

/** Número del error del contrato en un texto "Error(Contract, #9)". */
export function contractErrorCode(detail: string): number | undefined {
  const match = detail.match(/Error\(Contract, #(\d+)\)/);
  return match ? Number(match[1]) : undefined;
}

/** Errores del contrato que una ruta sabe explicar: código → respuesta. */
export type ContractErrors = Record<number, { status: number; code: string; message: string }>;

/**
 * Revisa la simulación y SOLO si pasó firma y envía. Si la simulación falla no
 * se envía nada. Devuelve el hash de la transacción confirmada.
 */
export async function simulateSignSend<T>(tx: contract.AssembledTransaction<T>, known: ContractErrors): Promise<string> {
  const simulation = tx.simulation!;
  if (rpc.Api.isSimulationError(simulation)) {
    const code = contractErrorCode(simulation.error);
    const mapped = code === undefined ? undefined : known[code];
    if (mapped) throw new ApiError(mapped.status, mapped.code, mapped.message);
    throw new ApiError(422, code === undefined ? "SimulationFailed" : `Contract${code}`, "El contrato rechazó la operación en la simulación; no se envió nada.");
  }

  await tx.sign();
  const hash = Buffer.from(tx.signed!.hash()).toString("hex");
  let sent: contract.SentTransaction<T>;
  try {
    sent = await tx.send();
  } catch (error) {
    // La red respondió que NO la aceptó: es definitivo.
    if (error instanceof Error && /"status":\s*"(ERROR|TRY_AGAIN_LATER)"/.test(error.message)) {
      throw new ApiError(502, "Rejected", "La red no aceptó la transacción; no se movió dinero.", hash);
    }
    // Ya se envió y no sabemos si entró: se devuelve el hash para revisarlo.
    throw new ApiError(504, "Pending", "Se envió la transacción pero la red no confirmó a tiempo. Revisa su estado con el hash.", hash);
  }
  if (sent.getTransactionResponse?.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new ApiError(502, "TxFailed", "La transacción falló en la red; no se movió dinero.", hash);
  }
  return hash;
}
