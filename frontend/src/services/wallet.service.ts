// Lo que la app le pide a la wallet, sin React: conectar, recuperar la sesión,
// desconectar, consultar la red y firmar. La configuración del kit vive en lib/wallet/kit.ts.
import { stellarConfig } from "@/config/stellar";
import { loadKit } from "@/lib/wallet/kit";
import { TxError } from "./errors";

/** ok = Testnet · wrong = otra red (bloqueamos) · unknown = la wallet no lo informa */
export type WalletNetworkStatus = "ok" | "wrong" | "unknown";

/** Abre el selector de wallets y devuelve la dirección elegida. */
export async function connectWallet(): Promise<string> {
  const kit = await loadKit();
  const { address } = await kit.authModal();
  return address;
}

/** Recupera la sesión guardada (el kit la persiste en localStorage). */
export async function restoreWallet(): Promise<string | null> {
  const kit = await loadKit();
  try {
    const { address } = await kit.getAddress();
    return address;
  } catch {
    return null; // nunca se conectó o se desconectó
  }
}

export async function disconnectWallet(): Promise<void> {
  const kit = await loadKit();
  await kit.disconnect();
}

/**
 * Pregunta a la wallet en qué red está. Devuelve `null` si la wallet
 * no lo informa (xBull, Lobstr, Albedo… no soportan esta consulta).
 */
async function getWalletNetwork(): Promise<string | null> {
  const kit = await loadKit();
  try {
    const { networkPassphrase } = await kit.getNetwork();
    return networkPassphrase;
  } catch {
    return null;
  }
}

/** Compara la red de la wallet con la de la app (config/stellar.ts). */
export async function getWalletNetworkStatus(): Promise<WalletNetworkStatus> {
  const passphrase = await getWalletNetwork();
  if (passphrase === null) return "unknown";
  return passphrase === stellarConfig.networkPassphrase ? "ok" : "wrong";
}

/** Pide a la wallet que firme el XDR. Antes revisa que esté en la red de la app. */
export async function signWithWallet(xdr: string, address: string) {
  // Una firma de otra red no sirve en Testnet: mejor avisar antes de firmar.
  const walletNetwork = await getWalletNetwork(); // null si la wallet no lo informa
  if (walletNetwork && walletNetwork !== stellarConfig.networkPassphrase) {
    throw new TxError("network", `La wallet está en: ${walletNetwork}`);
  }

  const kit = await loadKit();
  return kit.signTransaction(xdr, {
    address,
    networkPassphrase: stellarConfig.networkPassphrase,
  });
}

/** Fondea y crea la cuenta con Friendbot (solo Testnet). */
export async function fundWithFriendbot(address: string): Promise<void> {
  const response = await fetch(`${stellarConfig.friendbotUrl}?addr=${address}`);
  if (!response.ok) throw new Error(`Friendbot respondió ${response.status}`);
}
