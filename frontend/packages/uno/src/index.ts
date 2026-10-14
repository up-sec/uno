import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CCPJ3LQOWC3NAJYV77FO74HKELG7YXJ4ANMSALXKHGIKAJJ6FXFQDMQQ",
  }
} as const

export const Errors = {
  1: {message:"NotVerifier"},
  2: {message:"AlreadyRegistered"},
  3: {message:"KeyInUse"},
  4: {message:"NotRegistered"},
  5: {message:"CredentialInvalid"},
  6: {message:"ProgramNotFound"},
  7: {message:"ProgramClosed"},
  8: {message:"ProgramFull"},
  9: {message:"AlreadyClaimed"},
  11: {message:"InvalidAmount"},
  12: {message:"Overflow"},
  13: {message:"NotAuthorized"},
  14: {message:"TokenNotAllowed"},
  15: {message:"VerifierNotAccepted"},
  16: {message:"ClaimExpired"},
  17: {message:"InvalidDestination"},
  18: {message:"CredentialLocked"},
  19: {message:"NoPendingAdmin"},
  20: {message:"UpgradesFrozen"},
  21: {message:"InvalidVerifierList"},
  22: {message:"InsufficientDeposit"},
  23: {message:"AdminProposalExpired"}
}


export interface Program {
  /**
 * Monto por persona (con 7 decimales, como todos los tokens de Stellar).
 */
amount: i128;
  /**
 * Cupo: cuántas personas pueden cobrar.
 */
cap: u32;
  claimed: u32;
  open: boolean;
  org: string;
  token: string;
  /**
 * Verificadores en los que esta organización confía.
 */
verifiers: Array<string>;
}





export interface Credential {
  /**
 * Llave pública Ed25519 del celular de la persona.
 */
holder: Buffer;
  issued_at: u64;
  /**
 * true si la revocó el admin (ej. fraude): nadie la reemite hasta que el admin la libere.
 */
locked: boolean;
  revoked: boolean;
  /**
 * Quién verificó a la persona.
 */
verifier: string;
  /**
 * Época del verificador al emitirla. Si lo quitan y lo vuelven a dar de
 * alta, su época sube y esta credencial deja de valer (M-04).
 */
verifier_epoch: u32;
}











export interface Client {
  /**
   * Construct and simulate a admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cualquiera puede enviar esta transacción (ej. un "relayer" que paga la
   * comisión); lo que da el permiso es la FIRMA del celular de la persona.
   */
  claim: ({program_id, holder, expires_ledger, signature, dest}: {program_id: u32, holder: Buffer, expires_ledger: u32, signature: Buffer, dest: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a issue transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Registra a una persona. `huella` = HMAC(secreto, CURP), calculado fuera.
   */
  issue: ({verifier, huella, holder}: {verifier: string, huella: Buffer, holder: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a revoke transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Revoca una credencial. Puede hacerlo el admin o el verificador que la emitió.
   * Si la revoca el admin, queda BLOQUEADA (M-04).
   */
  revoke: ({by, huella}: {by: string, huella: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a unlock transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * El admin libera una credencial bloqueada para que se pueda reemitir.
   */
  unlock: ({huella}: {huella: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a program transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  program: ({program_id}: {program_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Program>>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cambia el código del contrato conservando su ID y sus datos.
   * Solo para testnet/piloto: antes de mainnet se decide si se congela.
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a credential transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  credential: ({huella}: {huella: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Credential>>>

  /**
   * Construct and simulate a allow_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * El admin decide qué tokens se pueden usar en programas.
   * El contrato NO revisa el clawback: antes de aprobar un token hay que revisar
   * fuera de la cadena las banderas del emisor (AUTH_CLAWBACK_ENABLED, AUTH_REVOCABLE).
   */
  allow_token: ({token}: {token: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a has_claimed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  has_claimed: ({program_id, huella}: {program_id: u32, huella: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a is_verifier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_verifier: ({verifier}: {verifier: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a accept_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Paso 2: el nuevo admin acepta (prueba que controla su llave).
   */
  accept_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a add_verifier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cada alta abre una época nueva del verificador: si se le quitó y se le
   * vuelve a dar de alta, sus credenciales anteriores ya no valen (M-04).
   * Si ya está activo no cambia nada.
   */
  add_verifier: ({verifier}: {verifier: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a claim_message transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Mensaje exacto que el celular debe firmar para cobrar.
   */
  claim_message: ({program_id, expires_ledger, dest}: {program_id: u32, expires_ledger: u32, dest: string}, options?: MethodOptions) => Promise<AssembledTransaction<Buffer>>

  /**
   * Construct and simulate a close_program transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cierra el programa y regresa a la organización lo que no se cobró.
   */
  close_program: ({program_id}: {program_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a is_registered transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * ¿Esta huella tiene hoy una credencial válida?
   */
  is_registered: ({huella}: {huella: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a propose_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Paso 1 del cambio de admin: el admin actual propone al nuevo.
   * La propuesta caduca en ~7 días (B-04).
   */
  propose_admin: ({new_admin}: {new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a create_program transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * La organización crea un programa, elige en qué verificadores confía
   * y deposita de una vez amount × cap.
   */
  create_program: ({org, token, amount, cap, verifiers}: {org: string, token: string, amount: i128, cap: u32, verifiers: Array<string>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a disallow_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  disallow_token: ({token}: {token: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a freeze_upgrades transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Apaga los upgrades PARA SIEMPRE. No hay forma de revertirlo.
   */
  freeze_upgrades: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a remove_verifier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Quitar a un verificador invalida TODAS las credenciales que emitió.
   * Esas personas pueden volver a registrarse con otro verificador.
   */
  remove_verifier: ({verifier}: {verifier: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a upgrades_frozen transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  upgrades_frozen: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a is_token_allowed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_token_allowed: ({token}: {token: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a cancel_admin_proposal transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * El admin retira una propuesta de cambio de admin (B-04).
   */
  cancel_admin_proposal: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin}: {admin: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAFgAAAAAAAAALTm90VmVyaWZpZXIAAAAAAQAAAAAAAAARQWxyZWFkeVJlZ2lzdGVyZWQAAAAAAAACAAAAAAAAAAhLZXlJblVzZQAAAAMAAAAAAAAADU5vdFJlZ2lzdGVyZWQAAAAAAAAEAAAAAAAAABFDcmVkZW50aWFsSW52YWxpZAAAAAAAAAUAAAAAAAAAD1Byb2dyYW1Ob3RGb3VuZAAAAAAGAAAAAAAAAA1Qcm9ncmFtQ2xvc2VkAAAAAAAABwAAAAAAAAALUHJvZ3JhbUZ1bGwAAAAACAAAAAAAAAAOQWxyZWFkeUNsYWltZWQAAAAAAAkAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAALAAAAAAAAAAhPdmVyZmxvdwAAAAwAAAAAAAAADU5vdEF1dGhvcml6ZWQAAAAAAAANAAAAAAAAAA9Ub2tlbk5vdEFsbG93ZWQAAAAADgAAAAAAAAATVmVyaWZpZXJOb3RBY2NlcHRlZAAAAAAPAAAAAAAAAAxDbGFpbUV4cGlyZWQAAAAQAAAAAAAAABJJbnZhbGlkRGVzdGluYXRpb24AAAAAABEAAAAAAAAAEENyZWRlbnRpYWxMb2NrZWQAAAASAAAAAAAAAA5Ob1BlbmRpbmdBZG1pbgAAAAAAEwAAAAAAAAAOVXBncmFkZXNGcm96ZW4AAAAAABQAAAAAAAAAE0ludmFsaWRWZXJpZmllckxpc3QAAAAAFQAAAAAAAAATSW5zdWZmaWNpZW50RGVwb3NpdAAAAAAWAAAAAAAAABRBZG1pblByb3Bvc2FsRXhwaXJlZAAAABc=",
        "AAAAAQAAAAAAAAAAAAAAB1Byb2dyYW0AAAAABwAAAEZNb250byBwb3IgcGVyc29uYSAoY29uIDcgZGVjaW1hbGVzLCBjb21vIHRvZG9zIGxvcyB0b2tlbnMgZGUgU3RlbGxhcikuAAAAAAAGYW1vdW50AAAAAAALAAAAJkN1cG86IGN1w6FudGFzIHBlcnNvbmFzIHB1ZWRlbiBjb2JyYXIuAAAAAAADY2FwAAAAAAQAAAAAAAAAB2NsYWltZWQAAAAABAAAAAAAAAAEb3BlbgAAAAEAAAAAAAAAA29yZwAAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAA0VmVyaWZpY2Fkb3JlcyBlbiBsb3MgcXVlIGVzdGEgb3JnYW5pemFjacOzbiBjb25mw61hLgAAAAl2ZXJpZmllcnMAAAAAAAPqAAAAEw==",
        "AAAABQAAAAAAAAAAAAAACFRva2VuU2V0AAAAAQAAAAl0b2tlbl9zZXQAAAAAAAACAAAAAAAAAAV0b2tlbgAAAAAAABMAAAABAAAAAAAAAAdhbGxvd2VkAAAAAAEAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAACFVwZ3JhZGVkAAAAAQAAAAh1cGdyYWRlZAAAAAEAAAAAAAAACXdhc21faGFzaAAAAAAAA+4AAAAgAAAAAAAAAAI=",
        "AAAABQAAAG9FdmVudG8gcMO6YmxpY28gZGUgY2FkYSBwYWdvLiBObyBpbmNsdXllIGxhIGh1ZWxsYSBwYXJhIG5vIGZhY2lsaXRhcgplbCByYXN0cmVvIGRlIHVuYSBwZXJzb25hIGVudHJlIHByb2dyYW1hcy4AAAAAAAAAAAlDbGFpbVBhaWQAAAAAAAABAAAACmNsYWltX3BhaWQAAAAAAAMAAAAAAAAACnByb2dyYW1faWQAAAAAAAQAAAABAAAAAAAAAARkZXN0AAAAEwAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAAAQAAAAAAAAAAAAAACkNyZWRlbnRpYWwAAAAAAAYAAAAxTGxhdmUgcMO6YmxpY2EgRWQyNTUxOSBkZWwgY2VsdWxhciBkZSBsYSBwZXJzb25hLgAAAAAAAAZob2xkZXIAAAAAA+4AAAAgAAAAAAAAAAlpc3N1ZWRfYXQAAAAAAAAGAAAAWHRydWUgc2kgbGEgcmV2b2PDsyBlbCBhZG1pbiAoZWouIGZyYXVkZSk6IG5hZGllIGxhIHJlZW1pdGUgaGFzdGEgcXVlIGVsIGFkbWluIGxhIGxpYmVyZS4AAAAGbG9ja2VkAAAAAAABAAAAAAAAAAdyZXZva2VkAAAAAAEAAAAeUXVpw6luIHZlcmlmaWPDsyBhIGxhIHBlcnNvbmEuAAAAAAAIdmVyaWZpZXIAAAATAAAAg8OJcG9jYSBkZWwgdmVyaWZpY2Fkb3IgYWwgZW1pdGlybGEuIFNpIGxvIHF1aXRhbiB5IGxvIHZ1ZWx2ZW4gYSBkYXIgZGUKYWx0YSwgc3Ugw6lwb2NhIHN1YmUgeSBlc3RhIGNyZWRlbmNpYWwgZGVqYSBkZSB2YWxlciAoTS0wNCkuAAAAAA52ZXJpZmllcl9lcG9jaAAAAAAABA==",
        "AAAABQAAAAAAAAAAAAAACkNyZWRJc3N1ZWQAAAAAAAEAAAALY3JlZF9pc3N1ZWQAAAAAAwAAAAAAAAAGaHVlbGxhAAAAAAPuAAAAIAAAAAEAAAAAAAAACHZlcmlmaWVyAAAAEwAAAAAAAAAAAAAABmhvbGRlcgAAAAAD7gAAACAAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAC0NyZWRSZXZva2VkAAAAAAEAAAAMY3JlZF9yZXZva2VkAAAAAwAAAAAAAAAGaHVlbGxhAAAAAAPuAAAAIAAAAAEAAAAAAAAAAmJ5AAAAAAATAAAAAAAAAAAAAAAGbG9ja2VkAAAAAAABAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAC1ZlcmlmaWVyU2V0AAAAAAEAAAAMdmVyaWZpZXJfc2V0AAAAAgAAAAAAAAAIdmVyaWZpZXIAAAATAAAAAQAAAAAAAAAGYWN0aXZlAAAAAAABAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADEFkbWluQ2hhbmdlZAAAAAEAAAANYWRtaW5fY2hhbmdlZAAAAAAAAAIAAAAAAAAACHByZXZpb3VzAAAAEwAAAAAAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAADENyZWRVbmxvY2tlZAAAAAEAAAANY3JlZF91bmxvY2tlZAAAAAAAAAEAAAAAAAAABmh1ZWxsYQAAAAAD7gAAACAAAAABAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADUFkbWluUHJvcG9zZWQAAAAAAAABAAAADmFkbWluX3Byb3Bvc2VkAAAAAAADAAAAAAAAAAdjdXJyZW50AAAAABMAAAAAAAAAAAAAAAhwcm9wb3NlZAAAABMAAAAAAAAAAAAAAA5leHBpcmVzX2xlZGdlcgAAAAAABAAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAADVByb2dyYW1DbG9zZWQAAAAAAAABAAAADnByb2dyYW1fY2xvc2VkAAAAAAACAAAAAAAAAApwcm9ncmFtX2lkAAAAAAAEAAAAAQAAAAAAAAAIcmVmdW5kZWQAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADlByb2dyYW1DcmVhdGVkAAAAAAABAAAAD3Byb2dyYW1fY3JlYXRlZAAAAAAEAAAAAAAAAApwcm9ncmFtX2lkAAAAAAAEAAAAAQAAAAAAAAADb3JnAAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAAAAAANjYXAAAAAABAAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAEVVwZ3JhZGVzRnJvemVuRXZ0AAAAAAAAAQAAABN1cGdyYWRlc19mcm96ZW5fZXZ0AAAAAAEAAAAAAAAAAmJ5AAAAAAATAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAFUFkbWluUHJvcG9zYWxDYW5jZWxlZAAAAAAAAAEAAAAXYWRtaW5fcHJvcG9zYWxfY2FuY2VsZWQAAAAAAgAAAAAAAAAHY3VycmVudAAAAAATAAAAAAAAAAAAAAAIcHJvcG9zZWQAAAATAAAAAAAAAAI=",
        "AAAAAAAAAAAAAAAFYWRtaW4AAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAI9DdWFscXVpZXJhIHB1ZWRlIGVudmlhciBlc3RhIHRyYW5zYWNjacOzbiAoZWouIHVuICJyZWxheWVyIiBxdWUgcGFnYSBsYQpjb21pc2nDs24pOyBsbyBxdWUgZGEgZWwgcGVybWlzbyBlcyBsYSBGSVJNQSBkZWwgY2VsdWxhciBkZSBsYSBwZXJzb25hLgAAAAAFY2xhaW0AAAAAAAAFAAAAAAAAAApwcm9ncmFtX2lkAAAAAAAEAAAAAAAAAAZob2xkZXIAAAAAA+4AAAAgAAAAAAAAAA5leHBpcmVzX2xlZGdlcgAAAAAABAAAAAAAAAAJc2lnbmF0dXJlAAAAAAAD7gAAAEAAAAAAAAAABGRlc3QAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAEhSZWdpc3RyYSBhIHVuYSBwZXJzb25hLiBgaHVlbGxhYCA9IEhNQUMoc2VjcmV0bywgQ1VSUCksIGNhbGN1bGFkbyBmdWVyYS4AAAAFaXNzdWUAAAAAAAADAAAAAAAAAAh2ZXJpZmllcgAAABMAAAAAAAAABmh1ZWxsYQAAAAAD7gAAACAAAAAAAAAABmhvbGRlcgAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAH1SZXZvY2EgdW5hIGNyZWRlbmNpYWwuIFB1ZWRlIGhhY2VybG8gZWwgYWRtaW4gbyBlbCB2ZXJpZmljYWRvciBxdWUgbGEgZW1pdGnDsy4KU2kgbGEgcmV2b2NhIGVsIGFkbWluLCBxdWVkYSBCTE9RVUVBREEgKE0tMDQpLgAAAAAAAAZyZXZva2UAAAAAAAIAAAAAAAAAAmJ5AAAAAAATAAAAAAAAAAZodWVsbGEAAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAERFbCBhZG1pbiBsaWJlcmEgdW5hIGNyZWRlbmNpYWwgYmxvcXVlYWRhIHBhcmEgcXVlIHNlIHB1ZWRhIHJlZW1pdGlyLgAAAAZ1bmxvY2sAAAAAAAEAAAAAAAAABmh1ZWxsYQAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAHcHJvZ3JhbQAAAAABAAAAAAAAAApwcm9ncmFtX2lkAAAAAAAEAAAAAQAAA+kAAAfQAAAAB1Byb2dyYW0AAAAAAw==",
        "AAAAAAAAAIFDYW1iaWEgZWwgY8OzZGlnbyBkZWwgY29udHJhdG8gY29uc2VydmFuZG8gc3UgSUQgeSBzdXMgZGF0b3MuClNvbG8gcGFyYSB0ZXN0bmV0L3BpbG90bzogYW50ZXMgZGUgbWFpbm5ldCBzZSBkZWNpZGUgc2kgc2UgY29uZ2VsYS4AAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAAAAAAAKY3JlZGVudGlhbAAAAAAAAQAAAAAAAAAGaHVlbGxhAAAAAAPuAAAAIAAAAAEAAAPoAAAH0AAAAApDcmVkZW50aWFsAAA=",
        "AAAAAAAAANlFbCBhZG1pbiBkZWNpZGUgcXXDqSB0b2tlbnMgc2UgcHVlZGVuIHVzYXIgZW4gcHJvZ3JhbWFzLgpFbCBjb250cmF0byBOTyByZXZpc2EgZWwgY2xhd2JhY2s6IGFudGVzIGRlIGFwcm9iYXIgdW4gdG9rZW4gaGF5IHF1ZSByZXZpc2FyCmZ1ZXJhIGRlIGxhIGNhZGVuYSBsYXMgYmFuZGVyYXMgZGVsIGVtaXNvciAoQVVUSF9DTEFXQkFDS19FTkFCTEVELCBBVVRIX1JFVk9DQUJMRSkuAAAAAAAAC2FsbG93X3Rva2VuAAAAAAEAAAAAAAAABXRva2VuAAAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAALaGFzX2NsYWltZWQAAAAAAgAAAAAAAAAKcHJvZ3JhbV9pZAAAAAAABAAAAAAAAAAGaHVlbGxhAAAAAAPuAAAAIAAAAAEAAAAB",
        "AAAAAAAAAAAAAAALaXNfdmVyaWZpZXIAAAAAAQAAAAAAAAAIdmVyaWZpZXIAAAATAAAAAQAAAAE=",
        "AAAAAAAAAD1QYXNvIDI6IGVsIG51ZXZvIGFkbWluIGFjZXB0YSAocHJ1ZWJhIHF1ZSBjb250cm9sYSBzdSBsbGF2ZSkuAAAAAAAADGFjY2VwdF9hZG1pbgAAAAAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAALFDYWRhIGFsdGEgYWJyZSB1bmEgw6lwb2NhIG51ZXZhIGRlbCB2ZXJpZmljYWRvcjogc2kgc2UgbGUgcXVpdMOzIHkgc2UgbGUKdnVlbHZlIGEgZGFyIGRlIGFsdGEsIHN1cyBjcmVkZW5jaWFsZXMgYW50ZXJpb3JlcyB5YSBubyB2YWxlbiAoTS0wNCkuClNpIHlhIGVzdMOhIGFjdGl2byBubyBjYW1iaWEgbmFkYS4AAAAAAAAMYWRkX3ZlcmlmaWVyAAAAAQAAAAAAAAAIdmVyaWZpZXIAAAATAAAAAA==",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAEAAAAAAAAABWFkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAADZNZW5zYWplIGV4YWN0byBxdWUgZWwgY2VsdWxhciBkZWJlIGZpcm1hciBwYXJhIGNvYnJhci4AAAAAAA1jbGFpbV9tZXNzYWdlAAAAAAAAAwAAAAAAAAAKcHJvZ3JhbV9pZAAAAAAABAAAAAAAAAAOZXhwaXJlc19sZWRnZXIAAAAAAAQAAAAAAAAABGRlc3QAAAATAAAAAQAAAA4=",
        "AAAAAAAAAERDaWVycmEgZWwgcHJvZ3JhbWEgeSByZWdyZXNhIGEgbGEgb3JnYW5pemFjacOzbiBsbyBxdWUgbm8gc2UgY29icsOzLgAAAA1jbG9zZV9wcm9ncmFtAAAAAAAAAQAAAAAAAAAKcHJvZ3JhbV9pZAAAAAAABAAAAAEAAAPpAAAACwAAAAM=",
        "AAAAAAAAAC/Cv0VzdGEgaHVlbGxhIHRpZW5lIGhveSB1bmEgY3JlZGVuY2lhbCB2w6FsaWRhPwAAAAANaXNfcmVnaXN0ZXJlZAAAAAAAAAEAAAAAAAAABmh1ZWxsYQAAAAAD7gAAACAAAAABAAAAAQ==",
        "AAAAAAAAAGVQYXNvIDEgZGVsIGNhbWJpbyBkZSBhZG1pbjogZWwgYWRtaW4gYWN0dWFsIHByb3BvbmUgYWwgbnVldm8uCkxhIHByb3B1ZXN0YSBjYWR1Y2EgZW4gfjcgZMOtYXMgKEItMDQpLgAAAAAAAA1wcm9wb3NlX2FkbWluAAAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAAGtMYSBvcmdhbml6YWNpw7NuIGNyZWEgdW4gcHJvZ3JhbWEsIGVsaWdlIGVuIHF1w6kgdmVyaWZpY2Fkb3JlcyBjb25mw61hCnkgZGVwb3NpdGEgZGUgdW5hIHZleiBhbW91bnQgw5cgY2FwLgAAAAAOY3JlYXRlX3Byb2dyYW0AAAAAAAUAAAAAAAAAA29yZwAAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAADY2FwAAAAAAQAAAAAAAAACXZlcmlmaWVycwAAAAAAA+oAAAATAAAAAQAAA+kAAAAEAAAAAw==",
        "AAAAAAAAAAAAAAAOZGlzYWxsb3dfdG9rZW4AAAAAAAEAAAAAAAAABXRva2VuAAAAAAAAEwAAAAA=",
        "AAAAAAAAADxBcGFnYSBsb3MgdXBncmFkZXMgUEFSQSBTSUVNUFJFLiBObyBoYXkgZm9ybWEgZGUgcmV2ZXJ0aXJsby4AAAAPZnJlZXplX3VwZ3JhZGVzAAAAAAAAAAAA",
        "AAAAAAAAAIRRdWl0YXIgYSB1biB2ZXJpZmljYWRvciBpbnZhbGlkYSBUT0RBUyBsYXMgY3JlZGVuY2lhbGVzIHF1ZSBlbWl0acOzLgpFc2FzIHBlcnNvbmFzIHB1ZWRlbiB2b2x2ZXIgYSByZWdpc3RyYXJzZSBjb24gb3RybyB2ZXJpZmljYWRvci4AAAAPcmVtb3ZlX3ZlcmlmaWVyAAAAAAEAAAAAAAAACHZlcmlmaWVyAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAAPdXBncmFkZXNfZnJvemVuAAAAAAAAAAABAAAAAQ==",
        "AAAAAAAAAAAAAAAQaXNfdG9rZW5fYWxsb3dlZAAAAAEAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAB",
        "AAAAAAAAADhFbCBhZG1pbiByZXRpcmEgdW5hIHByb3B1ZXN0YSBkZSBjYW1iaW8gZGUgYWRtaW4gKEItMDQpLgAAABVjYW5jZWxfYWRtaW5fcHJvcG9zYWwAAAAAAAAAAAAAAQAAA+kAAAACAAAAAw==" ]),
      options
    )
  }
  public readonly fromJSON = {
    admin: this.txFromJSON<string>,
        claim: this.txFromJSON<Result<void>>,
        issue: this.txFromJSON<Result<void>>,
        revoke: this.txFromJSON<Result<void>>,
        unlock: this.txFromJSON<Result<void>>,
        program: this.txFromJSON<Result<Program>>,
        upgrade: this.txFromJSON<Result<void>>,
        version: this.txFromJSON<u32>,
        credential: this.txFromJSON<Option<Credential>>,
        allow_token: this.txFromJSON<null>,
        has_claimed: this.txFromJSON<boolean>,
        is_verifier: this.txFromJSON<boolean>,
        accept_admin: this.txFromJSON<Result<void>>,
        add_verifier: this.txFromJSON<null>,
        claim_message: this.txFromJSON<Buffer>,
        close_program: this.txFromJSON<Result<i128>>,
        is_registered: this.txFromJSON<boolean>,
        propose_admin: this.txFromJSON<null>,
        create_program: this.txFromJSON<Result<u32>>,
        disallow_token: this.txFromJSON<null>,
        freeze_upgrades: this.txFromJSON<null>,
        remove_verifier: this.txFromJSON<null>,
        upgrades_frozen: this.txFromJSON<boolean>,
        is_token_allowed: this.txFromJSON<boolean>,
        cancel_admin_proposal: this.txFromJSON<Result<void>>
  }
}