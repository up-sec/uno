// ─────────────────────────────────────────────────────────────────────────────
// 3. INVOCAR EL CONTRATO · Servicio del token MXNDEMO
//
// MXNDEMO es un activo clásico de Stellar con su contrato SAC. Aquí solo LEEMOS
// el saldo (simulación, sin firma) para avisar antes de crear un programa si a
// la organización le falta la trustline o el dinero.
// No generamos bindings del token: basta con una llamada a `balance`.
// ─────────────────────────────────────────────────────────────────────────────
import { Account, Address, Contract, TransactionBuilder, rpc, scValToNative } from "@stellar/stellar-sdk";
import { stellarConfig, tokenConfig } from "@/config/stellar";

/** Cuenta "nula" para simular: leer no necesita una cuenta real (igual que los bindings). */
const SIMULATION_SOURCE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

let server: rpc.Server | null = null;
function getServer(): rpc.Server {
  server ??= new rpc.Server(stellarConfig.rpcUrl);
  return server;
}

/** sin-trustline = la cuenta todavía no acepta el activo; no puede recibirlo ni tenerlo. */
export type TokenBalance = { status: "ok"; units: bigint } | { status: "sin-trustline" };

/** Saldo de MXNDEMO de una cuenta, en unidades mínimas (7 decimales). */
export async function readTokenBalance(address: string): Promise<TokenBalance> {
  const tx = new TransactionBuilder(new Account(SIMULATION_SOURCE, "0"), {
    fee: "100",
    networkPassphrase: stellarConfig.networkPassphrase,
  })
    .addOperation(new Contract(tokenConfig.id).call("balance", new Address(address).toScVal()))
    .setTimeout(30)
    .build();

  const simulation = await getServer().simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulation)) {
    // El SAC responde Error(Contract, #13) si la cuenta no tiene trustline al
    // activo (o si la cuenta ni siquiera existe todavía).
    if (/Error\(Contract, #13\)/.test(simulation.error)) return { status: "sin-trustline" };
    throw new Error(simulation.error);
  }
  const units = scValToNative(simulation.result!.retval) as bigint;
  return { status: "ok", units };
}
