// Forma EXACTA de la transacción que crea la cuenta del beneficiario con
// reservas patrocinadas por el relayer. Sin secretos: la usan el servidor (para
// armarla y validarla antes de co-firmar) y el navegador (para revisarla antes
// de firmar con la llave del beneficiario).
//
//   1. begin_sponsoring_future_reserves(beneficiario)   fuente: relayer
//   2. create_account(beneficiario, 0 XLM)              fuente: relayer
//   3. change_trust(MXNDEMO)                            fuente: beneficiario
//   4. end_sponsoring_future_reserves()                 fuente: beneficiario
//
// El relayer aparta las reservas (2 de la cuenta + 1 de la trustline) y paga la
// comisión; el beneficiario no necesita XLM.
import { Asset, Keypair, Operation, type Transaction } from "@stellar/stellar-sdk";
import { stellarConfig, tokenConfig } from "@/config/stellar";

/** Vida del reclamo firmado: 720 ledgers ≈ 60 min (el contrato acepta hasta ~1 día). */
export const CLAIM_TTL_LEDGERS = 720;

/** Reservas que el relayer aparta por cada cuenta: cuenta (2) + trustline (1). */
export const RESERVES_PER_ACCOUNT = 3;

/** Máxima vida de la transacción de patrocinio. */
export const SPONSORSHIP_TIMEOUT_S = 120;

/** Comisión por operación (stroops) y total: 4 operaciones. Fija, para que nadie la infle (M-01). */
export const SPONSORSHIP_FEE_PER_OP = 1000;
export const SPONSORSHIP_FEE_TOTAL = SPONSORSHIP_FEE_PER_OP * 4;

/** Límite por defecto de change_trust (el máximo de un i64 con 7 decimales). */
export const MAX_TRUST_LIMIT = "922337203685.4775807";

/** ¿Este activo clásico es el que respalda el token MXNDEMO (su contrato SAC)? */
export function isMxnDemo(asset: Asset): boolean {
  return !asset.isNative() && asset.contractId(stellarConfig.networkPassphrase) === tokenConfig.id;
}

/** Las operaciones esperadas, para armar la transacción. */
export function sponsorshipOps(beneficiary: string, asset: Asset) {
  return [
    Operation.beginSponsoringFutureReserves({ sponsoredId: beneficiary }),
    Operation.createAccount({ destination: beneficiary, startingBalance: "0" }),
    Operation.changeTrust({ asset, source: beneficiary }),
    Operation.endSponsoringFutureReserves({ source: beneficiary }),
  ];
}

/**
 * Revisa que `tx` sea EXACTAMENTE la transacción de patrocinio para
 * `beneficiary`. Devuelve el problema encontrado, o null si está bien.
 * `relayer` es opcional: el navegador no lo conoce, el servidor sí.
 */
export function checkSponsorshipTx(tx: Transaction, beneficiary: string, relayer?: string): string | null {
  if (tx.networkPassphrase !== stellarConfig.networkPassphrase) return "red equivocada";
  if (relayer && tx.source !== relayer) return "la fuente no es el relayer";
  if (tx.source === beneficiary) return "el beneficiario no puede pagar la transacción";
  if (tx.memo.type !== "none") return "trae memo";
  const maxTime = Number(tx.timeBounds?.maxTime ?? 0);
  if (maxTime === 0 || maxTime > Date.now() / 1000 + SPONSORSHIP_TIMEOUT_S + 60) return "caducidad inválida";
  if (tx.timeBounds?.minTime !== "0") return "minTime distinto de 0";
  // Precondiciones extra (CAP-21): con minAccountSequence alguien podría saltar
  // la secuencia del relayer al máximo y congelar su cuenta (auditoría C-01).
  if (tx.minAccountSequence !== undefined || tx.minAccountSequenceAge !== undefined || tx.minAccountSequenceLedgerGap !== undefined) {
    return "trae precondiciones de secuencia";
  }
  if (tx.ledgerBounds !== undefined) return "trae ledgerBounds";
  if (tx.extraSigners !== undefined && tx.extraSigners.length > 0) return "trae extraSigners";
  if (Number(tx.fee) !== SPONSORSHIP_FEE_TOTAL) return "comisión distinta de la fija";

  const ops = tx.operations;
  if (ops.length !== 4) return "número de operaciones distinto de 4";
  const [begin, create, trust, end] = ops;
  // Las dos primeras usan la fuente de la transacción (relayer): sin `source` propio.
  if (begin.type !== "beginSponsoringFutureReserves" || begin.source || begin.sponsoredId !== beneficiary) return "operación 1 inesperada";
  if (create.type !== "createAccount" || create.source || create.destination !== beneficiary || Number(create.startingBalance) !== 0) return "operación 2 inesperada";
  if (trust.type !== "changeTrust" || trust.source !== beneficiary || !(trust.line instanceof Asset) || !isMxnDemo(trust.line) || trust.limit !== MAX_TRUST_LIMIT) return "operación 3 inesperada";
  if (end.type !== "endSponsoringFutureReserves" || end.source !== beneficiary) return "operación 4 inesperada";
  return null;
}

/** ¿`tx` trae una firma válida de `account`? */
export function hasSignatureOf(tx: Transaction, account: string): boolean {
  const keypair = Keypair.fromPublicKey(account);
  const hint = Buffer.from(keypair.signatureHint());
  const hash = Buffer.from(tx.hash());
  return tx.signatures.some((s) => Buffer.from(s.hint.value).equals(hint) && keypair.verify(hash, Buffer.from(s.signature.value)));
}
