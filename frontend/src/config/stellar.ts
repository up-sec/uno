// Configuración de red. Para cambiar de red solo se cambian las variables NEXT_PUBLIC_.
// Todo lo de aquí es PÚBLICO (termina en el navegador): nunca llaves.
import { Networks, StrKey } from "@stellar/stellar-sdk";
import { networks } from "uno";

// Next reemplaza cada `process.env.NEXT_PUBLIC_...` por su valor al compilar,
// por eso hay que escribir cada variable completa (no se puede leer dinámicamente).
const env = {
  NEXT_PUBLIC_STELLAR_NETWORK: process.env.NEXT_PUBLIC_STELLAR_NETWORK,
  NEXT_PUBLIC_STELLAR_RPC_URL: process.env.NEXT_PUBLIC_STELLAR_RPC_URL,
  NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE,
  NEXT_PUBLIC_UNO_CONTRACT_ID: process.env.NEXT_PUBLIC_UNO_CONTRACT_ID,
  NEXT_PUBLIC_MXNDEMO_TOKEN_ID: process.env.NEXT_PUBLIC_MXNDEMO_TOKEN_ID,
  NEXT_PUBLIC_DEFAULT_VERIFIER: process.env.NEXT_PUBLIC_DEFAULT_VERIFIER,
};

// Si falta una variable, mejor fallar al compilar con un mensaje claro.
for (const [name, value] of Object.entries(env)) {
  if (!value) {
    throw new Error(`Falta ${name}: agrégala en .env.local (local) o en Environment Variables (Vercel)`);
  }
}

// ── Validación (auditoría integral, F-02) ────────────────────────────────────
// Las variables NEXT_PUBLIC_ las puede cambiar cualquiera que despliegue una
// copia. Fallamos al compilar si no tienen sentido, para que un error de
// configuración no termine en un depósito a otro contrato.

/** Passphrase oficial de cada red: una firma de una red no sirve en otra. */
const PASSPHRASES: Record<string, string> = { testnet: Networks.TESTNET, mainnet: Networks.PUBLIC };

const expectedPassphrase = PASSPHRASES[env.NEXT_PUBLIC_STELLAR_NETWORK!];
if (!expectedPassphrase) {
  throw new Error(`NEXT_PUBLIC_STELLAR_NETWORK="${env.NEXT_PUBLIC_STELLAR_NETWORK}" no es una red conocida (testnet o mainnet)`);
}
if (env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE !== expectedPassphrase) {
  throw new Error(`NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE no corresponde a la red ${env.NEXT_PUBLIC_STELLAR_NETWORK}`);
}
if (!StrKey.isValidContract(env.NEXT_PUBLIC_UNO_CONTRACT_ID!) || !StrKey.isValidContract(env.NEXT_PUBLIC_MXNDEMO_TOKEN_ID!)) {
  throw new Error("NEXT_PUBLIC_UNO_CONTRACT_ID y NEXT_PUBLIC_MXNDEMO_TOKEN_ID deben ser direcciones de contrato (C…) válidas");
}
if (!StrKey.isValidEd25519PublicKey(env.NEXT_PUBLIC_DEFAULT_VERIFIER!)) {
  throw new Error("NEXT_PUBLIC_DEFAULT_VERIFIER debe ser una dirección pública (G…) válida");
}
// Los bindings (packages/uno) se generaron desde el contrato desplegado y traen
// su ID. En testnet, la variable tiene que coincidir con ese ID.
if (env.NEXT_PUBLIC_STELLAR_NETWORK === "testnet" && env.NEXT_PUBLIC_UNO_CONTRACT_ID !== networks.testnet.contractId) {
  throw new Error(
    `NEXT_PUBLIC_UNO_CONTRACT_ID no coincide con el contrato de los bindings (${networks.testnet.contractId}). ` +
      "Si se desplegó un contrato nuevo, regenera los bindings con npm run bindings.",
  );
}

export const stellarConfig = Object.freeze({
  /** Nombre de la red: "testnet" */
  network: env.NEXT_PUBLIC_STELLAR_NETWORK!,
  /** URL del nodo RPC */
  rpcUrl: env.NEXT_PUBLIC_STELLAR_RPC_URL!,
  /** Identifica la red al firmar: una firma de Testnet no sirve en Mainnet */
  networkPassphrase: env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE!,
  /** Contrato Uno (contracts/uno) */
  contractId: env.NEXT_PUBLIC_UNO_CONTRACT_ID!,
  /** Explorador para ver transacciones */
  explorerUrl: `https://stellar.expert/explorer/${env.NEXT_PUBLIC_STELLAR_NETWORK}`,
  /** Friendbot: regala XLM de prueba (solo existe en Testnet) */
  friendbotUrl: "https://friendbot.stellar.org",
});

/** Token con el que se fondean los programas. */
export const tokenConfig = Object.freeze({
  /** Contrato SAC del activo MXNDEMO */
  id: env.NEXT_PUBLIC_MXNDEMO_TOKEN_ID!,
  symbol: "MXNDEMO",
  /** Todos los activos de Stellar usan 7 decimales */
  decimals: 7,
});

/** Verificador (Punto Uno) que se propone por defecto al crear un programa. */
export const defaultVerifier = env.NEXT_PUBLIC_DEFAULT_VERIFIER!;

/** Link a una transacción en el explorador. */
export function explorerTxUrl(hash: string): string {
  return `${stellarConfig.explorerUrl}/tx/${hash}`;
}

/** Link a una cuenta o contrato en el explorador. */
export function explorerAccountUrl(address: string): string {
  const kind = address.startsWith("C") ? "contract" : "account";
  return `${stellarConfig.explorerUrl}/${kind}/${address}`;
}
