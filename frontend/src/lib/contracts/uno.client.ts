// ─────────────────────────────────────────────────────────────────────────────
// 3. CONTRATO · Cliente generado con bindings
//
// `uno` lo generó la Stellar CLI a partir del contrato desplegado (npm run bindings):
//   stellar contract bindings typescript --contract-id <UNO> --network testnet --output-dir ./packages/uno
// Trae un método tipado por cada función del contrato
// (create_program, program, close_program, claim…): no armamos las llamadas a mano.
// ─────────────────────────────────────────────────────────────────────────────
import { Client } from "uno";
import { stellarConfig } from "@/config/stellar";

let readClient: Client | null = null;

/**
 * Devuelve el cliente del contrato.
 * - Sin `publicKey`: alcanza para LEER (simular no necesita cuenta). No guarda
 *   estado por usuario, así que se crea una sola vez y se reutiliza.
 * - Con `publicKey`: la cuenta que va a pagar y firmar una ESCRITURA.
 */
export function getUnoClient(publicKey?: string): Client {
  if (publicKey) return createClient(publicKey);
  readClient ??= createClient();
  return readClient;
}

function createClient(publicKey?: string): Client {
  return new Client({
    contractId: stellarConfig.contractId,
    networkPassphrase: stellarConfig.networkPassphrase,
    rpcUrl: stellarConfig.rpcUrl,
    publicKey,
  });
}
