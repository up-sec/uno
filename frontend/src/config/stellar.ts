// ─────────────────────────────────────────────────────────────────────────────
// 1. ARQUITECTURA · Configuración de red
//
// Toda la información sobre "a qué Stellar nos conectamos" vive aquí.
// Para pasar de Testnet a Mainnet solo se cambian las variables de entorno
// (.env.local en tu compu, "Environment Variables" en Vercel).
//
// Todo lo que está aquí es PÚBLICO: termina en el navegador. Nunca llaves.
// ─────────────────────────────────────────────────────────────────────────────

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

export const stellarConfig = Object.freeze({
  /** Nombre de la red: "testnet" */
  network: env.NEXT_PUBLIC_STELLAR_NETWORK!,
  /** Nodo RPC: el "puente" HTTP entre la app y la blockchain */
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
