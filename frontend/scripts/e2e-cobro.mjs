// Prueba de punta a punta contra el servidor local (npm run build && npm start):
// registro → cobro (pagó) → segundo cobro rechazado con AlreadyClaimed.
// Hace lo mismo que el navegador del beneficiario. Imprime solo hashes y códigos.
//
// Uso (desde frontend/, con el servidor corriendo en :3000):
//   node --env-file=.env.local scripts/e2e-cobro.mjs
// Lee PUNTO_UNO_PIN del entorno para llamar a /api/registro; no lo imprime.
import { Contract, Keypair, Networks, TransactionBuilder, nativeToScVal, Address, rpc, scValToNative, BASE_FEE } from "@stellar/stellar-sdk";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const RPC = process.env.NEXT_PUBLIC_STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
const CONTRACT = process.env.NEXT_PUBLIC_UNO_CONTRACT_ID;
// El primer programa de ALLOWED_PROGRAMS (el mismo default que el servidor: 0).
const PROGRAM = Number((process.env.ALLOWED_PROGRAMS ?? "0").split(",")[0].trim());
if (!Number.isInteger(PROGRAM) || PROGRAM < 0) throw new Error("ALLOWED_PROGRAMS no empieza con un número de programa válido");
const SIM_SOURCE = process.env.NEXT_PUBLIC_DEFAULT_VERIFIER; // cuenta existente, solo para simular
const PIN = process.env.PUNTO_UNO_PIN;
if (!PIN || !CONTRACT || !SIM_SOURCE) throw new Error("Faltan variables: corre con --env-file=.env.local");

const server = new rpc.Server(RPC);

/** CURP sintética válida (formato + dígito verificador), distinta en cada corrida. */
function randomCurp() {
  const pick = (s) => s[Math.floor(Math.random() * s.length)];
  const L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", V = "AEIOU", C = "BCDFGHJKLMNPQRSTVWXYZ";
  const two = (n) => String(n).padStart(2, "0");
  const base = pick(L) + pick(V) + pick(L) + pick(L) + two(Math.floor(Math.random() * 100)) + two(1 + Math.floor(Math.random() * 12)) + two(1 + Math.floor(Math.random() * 28)) + pick("HM") + "DF" + pick(C) + pick(C) + pick(C) + pick(L);
  const alphabet = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += alphabet.indexOf(base[i]) * (18 - i);
  return base + ((10 - (sum % 10)) % 10);
}

async function post(path, body) {
  const res = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
}

async function claimMessage(expires, dest) {
  const op = new Contract(CONTRACT).call("claim_message", nativeToScVal(PROGRAM, { type: "u32" }), nativeToScVal(expires, { type: "u32" }), Address.fromString(dest).toScVal());
  const tx = new TransactionBuilder(await server.getAccount(SIM_SOURCE), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET }).addOperation(op).setTimeout(30).build();
  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) throw new Error("claim_message falló");
  return Buffer.from(scValToNative(sim.result.retval));
}

async function signedClaim(kp) {
  const { sequence } = await server.getLatestLedger();
  const expires = sequence + 720;
  const firma = kp.sign(await claimMessage(expires, kp.publicKey())).toString("hex");
  return { programa: PROGRAM, holder: kp.publicKey(), expires, firma, destino: kp.publicKey() };
}

const kp = Keypair.random();
console.log("Beneficiario (llave pública):", kp.publicKey());

// 0. PIN incorrecto → 401
const bad = await post("/api/registro", { pin: "x".repeat(16), curp: randomCurp(), llave: kp.publicKey() });
console.log("0. Registro con PIN incorrecto →", bad.status, bad.data.error);

// 1. Registro
const reg = await post("/api/registro", { pin: PIN, curp: randomCurp(), llave: kp.publicKey() });
console.log("1. Registro (issue) →", reg.status, reg.data.hash ?? reg.data.error);
if (!reg.data.hash) process.exit(1);

// 2. Crear cuenta patrocinada (co-firma del beneficiario)
const claim = await signedClaim(kp);
const prep = await post("/api/cobro", { paso: "preparar-cuenta", ...claim });
if (!prep.data.xdr) { console.log("2. preparar-cuenta →", prep.status, prep.data.error, prep.data.message); process.exit(1); }
const tx = TransactionBuilder.fromXDR(prep.data.xdr, Networks.TESTNET);
console.log("   operaciones:", tx.operations.map((o) => o.type).join(" → "));
tx.sign(kp);
const cuenta = await post("/api/cobro", { paso: "crear-cuenta", ...claim, xdr: tx.toXDR() });
console.log("2. Cuenta patrocinada →", cuenta.status, cuenta.data.hash ?? `${cuenta.data.error}: ${cuenta.data.message}`);
if (!cuenta.data.hash) process.exit(1);

// 3. Cobro
const cobro = await post("/api/cobro", { paso: "cobrar", ...claim });
console.log("3. Cobro (claim) →", cobro.status, cobro.data.hash ?? `${cobro.data.error}: ${cobro.data.message}`);

// 4. Segundo cobro con un reclamo nuevo → AlreadyClaimed, sin enviar nada
const again = await post("/api/cobro", { paso: "cobrar", ...(await signedClaim(kp)) });
console.log("4. Segundo cobro →", again.status, again.data.error, again.data.hash ? `(¡se envió! ${again.data.hash})` : "(no se envió transacción)");

// 5. Volver a pedir cuenta para la misma llave → AccountExists
const dup = await post("/api/cobro", { paso: "preparar-cuenta", ...(await signedClaim(kp)) });
console.log("5. Segunda creación de cuenta →", dup.status, dup.data.error);

// Saldo final del beneficiario
const acct = await fetch(`https://horizon-testnet.stellar.org/accounts/${kp.publicKey()}`).then((r) => r.json());
console.log("Saldo MXNDEMO:", acct.balances?.find((b) => b.asset_code === "MXNDEMO")?.balance, "· XLM:", acct.balances?.find((b) => b.asset_type === "native")?.balance);
