// Llave del beneficiario y cobro. Corre SOLO en el navegador: la llave privada
// se genera aquí, se guarda en localStorage y nunca sale de este dispositivo.
// Al servidor solo llegan la llave PÚBLICA y firmas.
import { Keypair, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { stellarConfig } from "@/config/stellar";
import { getRpcServer } from "@/lib/contracts/rpc";
import { getUnoClient } from "@/lib/contracts/uno.client";
import { CLAIM_TTL_LEDGERS, checkSponsorshipTx } from "@/lib/sponsorship";
import { postApi } from "./api";

const STORAGE_KEY = "uno:beneficiario:llave";

/**
 * La llave guardada en este navegador, o una nueva. La llave Ed25519 ES la
 * cuenta G… del beneficiario: la misma que se registra en Punto Uno y la que
 * recibe el dinero. Devuelve null si el navegador no deja guardar (modo
 * privado estricto): sin guardarla, la persona la perdería al cerrar.
 */
export function loadOrCreateKey(): Keypair | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) return Keypair.fromSecret(saved);
    const keypair = Keypair.random();
    window.localStorage.setItem(STORAGE_KEY, keypair.secret());
    return window.localStorage.getItem(STORAGE_KEY) ? keypair : null;
  } catch {
    return null;
  }
}

export type CobroStep = "firmando" | "creando-cuenta" | "cobrando";
export type CobroResult = { cuentaHash?: string; cobroHash: string };

/**
 * Firma Ed25519 → 128 caracteres hex (el formato que exige /api/cobro).
 * No se usa `.toString("hex")`: Keypair.sign devuelve Uint8Array, que ignora
 * el argumento y produciría "218,110,…".
 */
function signatureHex(signature: Uint8Array): string {
  const hex = Array.from(signature, (b) => b.toString(16).padStart(2, "0")).join("");
  if (!/^[0-9a-f]{128}$/.test(hex)) throw new Error("La firma no quedó en 128 caracteres hex; no se envió nada.");
  return hex;
}

async function accountExists(address: string): Promise<boolean> {
  try {
    await getRpcServer().getAccount(address);
    return true;
  } catch (error) {
    if (error instanceof Error && /not found/i.test(error.message)) return false;
    throw error;
  }
}

/**
 * Cobra en `programa` y recibe en la propia cuenta de la llave.
 * 1. Arma el mensaje exacto con claim_message (simulación) y lo firma aquí.
 * 2. Si la cuenta no existe, el relayer la crea con reservas patrocinadas: el
 *    navegador revisa la transacción operación por operación antes de co-firmar.
 * 3. El relayer envía claim.
 */
export async function cobrar(keypair: Keypair, programa: number, onStep: (step: CobroStep) => void): Promise<CobroResult> {
  onStep("firmando");
  const cuenta = keypair.publicKey();
  const { sequence } = await getRpcServer().getLatestLedger();
  const expires = sequence + CLAIM_TTL_LEDGERS;
  const message = (await getUnoClient().claim_message({ program_id: programa, expires_ledger: expires, dest: cuenta })).result;
  const claim = { programa, holder: cuenta, expires, firma: signatureHex(keypair.sign(message)), destino: cuenta };

  let cuentaHash: string | undefined;
  if (!(await accountExists(cuenta))) {
    onStep("creando-cuenta");
    const { xdr, token } = await postApi<{ xdr: string; token: string }>("/api/cobro", { paso: "preparar-cuenta", ...claim });
    const tx = TransactionBuilder.fromXDR(xdr, stellarConfig.networkPassphrase);
    // No se firma nada que no sea exactamente "crear MI cuenta y aceptar MXNDEMO".
    const problem = tx instanceof Transaction ? checkSponsorshipTx(tx, cuenta) : "no es una transacción normal";
    if (problem) throw new Error(`El servidor mandó una transacción inesperada (${problem}); no se firmó.`);
    tx.sign(keypair);
    ({ hash: cuentaHash } = await postApi<{ hash: string }>("/api/cobro", { paso: "crear-cuenta", ...claim, xdr: tx.toXDR(), token }));
  }

  onStep("cobrando");
  const { hash: cobroHash } = await postApi<{ hash: string }>("/api/cobro", { paso: "cobrar", ...claim });
  return { cuentaHash, cobroHash };
}
