// Cliente del contrato generado por la Stellar CLI (npm run bindings, en packages/uno).
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
