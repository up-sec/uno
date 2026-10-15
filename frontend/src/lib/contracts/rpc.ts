// Conexión directa con el nodo RPC, para lo que no cubre el cliente generado:
// leer el saldo del token y revisar el estado de una transacción ya enviada.
import { rpc } from "@stellar/stellar-sdk";
import { stellarConfig } from "@/config/stellar";

let server: rpc.Server | null = null;

export function getRpcServer(): rpc.Server {
  server ??= new rpc.Server(stellarConfig.rpcUrl);
  return server;
}
