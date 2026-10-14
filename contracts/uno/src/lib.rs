//! Uno v1 — credencial de unicidad + programas de apoyo en Stellar (Soroban).
//!
//! Idea en una frase: un verificador autorizado registra que "esta persona (huella)
//! es real y única" y le asocia la llave pública de su celular; después, la persona
//! puede cobrar UNA sola vez en cada programa, firmando el reclamo con esa llave.
//!
//! En la cadena NUNCA hay datos personales: solo la huella de unicidad
//! (HMAC(secreto, CURP) calculado fuera de la cadena) y una llave pública.
//!
//! Cambios v1 (auditoría auditor-uno, 13-oct-2026):
//! - A-01: cada programa elige qué verificadores acepta.
//! - A-02: cambio de admin en dos pasos (propose_admin / accept_admin).
//! - M-01 + B-03: se quita el registro de sellos; el reclamo firmado ahora caduca.
//! - M-02 + M-03: lista blanca de tokens que controla el admin.
//! - M-04: una credencial revocada por el admin queda bloqueada hasta que el admin la libere.
//! - B-01: no se puede pagar al propio contrato.
//! - Upgrade: solo durante testnet/piloto; `freeze_upgrades` lo apaga para siempre.
//!
//! Arreglos rápidos de la auditoría v1 (14-oct-2026):
//! - M-04: época por verificador; darlo de alta otra vez no revive credenciales viejas.
//! - M-02: `create_program` mide lo que de verdad recibió el contrato.
//! - B-04: la propuesta de admin caduca y se puede cancelar.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, xdr::ToXdr,
    Address, Bytes, BytesN, Env, Vec,
};

// ---------------------------------------------------------------------------
// Tiempo de vida en almacenamiento (TTL). 1 día ≈ 17 280 ledgers (5 s c/u).
// ---------------------------------------------------------------------------
const DAY: u32 = 17_280;
const BUMP: u32 = 30 * DAY;
const THRESHOLD: u32 = BUMP - DAY;

/// Versión del código. Sube cada vez que se hace un upgrade.
const VERSION: u32 = 1;

/// Prefijo del mensaje que firma el celular. v2: sin sello, con caducidad.
const CLAIM_DOMAIN: &[u8] = b"UNO-CLAIM-v2";

/// Máximo de verificadores aceptados por programa (evita inflar el storage).
const MAX_PROGRAM_VERIFIERS: u32 = 10;

/// Máximo de vida de un reclamo firmado: ~1 día de ledgers.
const MAX_CLAIM_TTL: u32 = DAY;

/// Vida de una propuesta de cambio de admin: ~7 días de ledgers (B-04).
const ADMIN_PROPOSAL_TTL: u32 = 7 * DAY;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotVerifier = 1,
    AlreadyRegistered = 2,
    KeyInUse = 3,
    NotRegistered = 4,
    CredentialInvalid = 5,
    ProgramNotFound = 6,
    ProgramClosed = 7,
    ProgramFull = 8,
    AlreadyClaimed = 9,
    // 10 quedó libre (era SealUsed en v0).
    InvalidAmount = 11,
    Overflow = 12,
    NotAuthorized = 13,
    TokenNotAllowed = 14,
    VerifierNotAccepted = 15,
    ClaimExpired = 16,
    InvalidDestination = 17,
    CredentialLocked = 18,
    NoPendingAdmin = 19,
    UpgradesFrozen = 20,
    InvalidVerifierList = 21,
    InsufficientDeposit = 22,
    AdminProposalExpired = 23,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Credential {
    /// Llave pública Ed25519 del celular de la persona.
    pub holder: BytesN<32>,
    /// Quién verificó a la persona.
    pub verifier: Address,
    /// Época del verificador al emitirla. Si lo quitan y lo vuelven a dar de
    /// alta, su época sube y esta credencial deja de valer (M-04).
    pub verifier_epoch: u32,
    pub issued_at: u64,
    pub revoked: bool,
    /// true si la revocó el admin (ej. fraude): nadie la reemite hasta que el admin la libere.
    pub locked: bool,
}

/// Estado de un verificador. NO se borra al darlo de baja, para no perder la época.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifierInfo {
    pub active: bool,
    /// Sube en cada alta. Las credenciales de épocas anteriores ya no valen (M-04).
    pub epoch: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Program {
    pub org: Address,
    pub token: Address,
    /// Monto por persona (con 7 decimales, como todos los tokens de Stellar).
    pub amount: i128,
    /// Cupo: cuántas personas pueden cobrar.
    pub cap: u32,
    pub claimed: u32,
    pub open: bool,
    /// Verificadores en los que esta organización confía.
    pub verifiers: Vec<Address>,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    /// (admin propuesto, último ledger en que se puede aceptar)
    PendingAdmin,
    UpgradesFrozen,
    /// verificador -> VerifierInfo
    Verifier(Address),
    AllowedToken(Address),
    /// huella -> Credential
    Cred(BytesN<32>),
    /// llave del celular -> huella
    Holder(BytesN<32>),
    NextProgram,
    Program(u32),
    /// (programa, huella) ya cobró
    Claimed(u32, BytesN<32>),
}

// ------------------------------- Eventos ----------------------------------

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifierSet {
    #[topic]
    pub verifier: Address,
    pub active: bool,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenSet {
    #[topic]
    pub token: Address,
    pub allowed: bool,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminProposed {
    pub current: Address,
    pub proposed: Address,
    pub expires_ledger: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminProposalCanceled {
    pub current: Address,
    pub proposed: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminChanged {
    pub previous: Address,
    pub admin: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Upgraded {
    pub wasm_hash: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradesFrozenEvt {
    pub by: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CredIssued {
    #[topic]
    pub huella: BytesN<32>,
    pub verifier: Address,
    pub holder: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CredRevoked {
    #[topic]
    pub huella: BytesN<32>,
    pub by: Address,
    pub locked: bool,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CredUnlocked {
    #[topic]
    pub huella: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProgramCreated {
    #[topic]
    pub program_id: u32,
    pub org: Address,
    pub amount: i128,
    pub cap: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProgramClosed {
    #[topic]
    pub program_id: u32,
    pub refunded: i128,
}

/// Evento público de cada pago. No incluye la huella para no facilitar
/// el rastreo de una persona entre programas.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ClaimPaid {
    #[topic]
    pub program_id: u32,
    pub dest: Address,
    pub amount: i128,
}

// --------------------------- Ayudas de almacenamiento -----------------------

fn bump_instance(env: &Env) {
    env.storage().instance().extend_ttl(THRESHOLD, BUMP);
}

fn get_p<V: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(env: &Env, key: &DataKey) -> Option<V> {
    let s = env.storage().persistent();
    let v: Option<V> = s.get(key);
    if v.is_some() {
        s.extend_ttl(key, THRESHOLD, BUMP);
    }
    v
}

fn set_p<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &DataKey, val: &V) {
    let s = env.storage().persistent();
    s.set(key, val);
    s.extend_ttl(key, THRESHOLD, BUMP);
}

fn has_p(env: &Env, key: &DataKey) -> bool {
    let s = env.storage().persistent();
    let h = s.has(key);
    if h {
        s.extend_ttl(key, THRESHOLD, BUMP);
    }
    h
}

fn admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

fn verifier_info(env: &Env, v: &Address) -> Option<VerifierInfo> {
    get_p(env, &DataKey::Verifier(v.clone()))
}

fn verifier_active(env: &Env, v: &Address) -> bool {
    verifier_info(env, v).is_some_and(|i| i.active)
}

/// Una credencial vale si no está revocada, su verificador sigue autorizado
/// y se emitió en la época actual de ese verificador (M-04).
fn cred_valid(env: &Env, c: &Credential) -> bool {
    !c.revoked && verifier_info(env, &c.verifier).is_some_and(|i| i.active && i.epoch == c.verifier_epoch)
}

fn load_program(env: &Env, id: u32) -> Result<Program, Error> {
    get_p(env, &DataKey::Program(id)).ok_or(Error::ProgramNotFound)
}

/// ÚNICO lugar donde se revisa la firma del celular. Hoy es Ed25519; cuando
/// se cambie a una firma post-cuántica (ADR-001) solo se toca esta función.
/// Si la firma no es válida, el host de Soroban detiene la transacción.
fn verificar_firma_titular(env: &Env, holder: &BytesN<32>, msg: &Bytes, sig: &BytesN<64>) {
    env.crypto().ed25519_verify(holder, msg, sig);
}

/// Mensaje que firma el celular:
/// "UNO-CLAIM-v2" || XDR(contrato) || program_id (BE) || expires_ledger (BE) || XDR(dest)
fn build_claim_message(env: &Env, program_id: u32, expires_ledger: u32, dest: &Address) -> Bytes {
    let mut m = Bytes::from_slice(env, CLAIM_DOMAIN);
    m.append(&env.current_contract_address().to_xdr(env));
    m.extend_from_array(&program_id.to_be_bytes());
    m.extend_from_array(&expires_ledger.to_be_bytes());
    m.append(&dest.clone().to_xdr(env));
    m
}

// --------------------------------- Contrato ---------------------------------

#[contract]
pub struct Uno;

#[contractimpl]
impl Uno {
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextProgram, &0u32);
        bump_instance(&env);
    }

    pub fn version(_env: Env) -> u32 {
        VERSION
    }

    pub fn admin(env: Env) -> Address {
        bump_instance(&env);
        admin(&env)
    }

    // ------------------------------- Admin ----------------------------------

    /// Paso 1 del cambio de admin: el admin actual propone al nuevo.
    /// La propuesta caduca en ~7 días (B-04).
    pub fn propose_admin(env: Env, new_admin: Address) {
        let current = admin(&env);
        current.require_auth();
        bump_instance(&env);
        let expires_ledger = env.ledger().sequence() + ADMIN_PROPOSAL_TTL;
        env.storage().instance().set(&DataKey::PendingAdmin, &(new_admin.clone(), expires_ledger));
        AdminProposed { current, proposed: new_admin, expires_ledger }.publish(&env);
    }

    /// Paso 2: el nuevo admin acepta (prueba que controla su llave).
    pub fn accept_admin(env: Env) -> Result<(), Error> {
        bump_instance(&env);
        let (pending, expires_ledger): (Address, u32) = env
            .storage()
            .instance()
            .get(&DataKey::PendingAdmin)
            .ok_or(Error::NoPendingAdmin)?;
        if env.ledger().sequence() > expires_ledger {
            return Err(Error::AdminProposalExpired);
        }
        pending.require_auth();
        let previous = admin(&env);
        env.storage().instance().set(&DataKey::Admin, &pending);
        env.storage().instance().remove(&DataKey::PendingAdmin);
        AdminChanged { previous, admin: pending }.publish(&env);
        Ok(())
    }

    /// El admin retira una propuesta de cambio de admin (B-04).
    pub fn cancel_admin_proposal(env: Env) -> Result<(), Error> {
        let current = admin(&env);
        current.require_auth();
        bump_instance(&env);
        let (proposed, _): (Address, u32) = env
            .storage()
            .instance()
            .get(&DataKey::PendingAdmin)
            .ok_or(Error::NoPendingAdmin)?;
        env.storage().instance().remove(&DataKey::PendingAdmin);
        AdminProposalCanceled { current, proposed }.publish(&env);
        Ok(())
    }

    /// Cambia el código del contrato conservando su ID y sus datos.
    /// Solo para testnet/piloto: antes de mainnet se decide si se congela.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        admin(&env).require_auth();
        bump_instance(&env);
        if env.storage().instance().has(&DataKey::UpgradesFrozen) {
            return Err(Error::UpgradesFrozen);
        }
        // Se usa a propósito la API deprecada: solo acepta el hash de un wasm.
        // `update_current_contract(ContractExecutable)` sí es pública en
        // soroban-sdk 28, pero también aceptaría un `ExternalRef` (auditoría A-03).
        // Si se migra: envolver siempre el hash en `ContractExecutable::Wasm` y
        // nunca recibir un `ContractExecutable` como argumento.
        #[allow(deprecated)]
        env.deployer().update_current_contract_wasm(new_wasm_hash.clone());
        Upgraded { wasm_hash: new_wasm_hash }.publish(&env);
        Ok(())
    }

    /// Apaga los upgrades PARA SIEMPRE. No hay forma de revertirlo.
    pub fn freeze_upgrades(env: Env) {
        let by = admin(&env);
        by.require_auth();
        bump_instance(&env);
        env.storage().instance().set(&DataKey::UpgradesFrozen, &true);
        UpgradesFrozenEvt { by }.publish(&env);
    }

    pub fn upgrades_frozen(env: Env) -> bool {
        bump_instance(&env);
        env.storage().instance().has(&DataKey::UpgradesFrozen)
    }

    // ---------------------------- Verificadores ----------------------------

    /// Cada alta abre una época nueva del verificador: si se le quitó y se le
    /// vuelve a dar de alta, sus credenciales anteriores ya no valen (M-04).
    /// Si ya está activo no cambia nada.
    pub fn add_verifier(env: Env, verifier: Address) {
        admin(&env).require_auth();
        bump_instance(&env);
        let epoch = match verifier_info(&env, &verifier) {
            Some(i) if i.active => return,
            Some(i) => i.epoch + 1,
            None => 1,
        };
        set_p(&env, &DataKey::Verifier(verifier.clone()), &VerifierInfo { active: true, epoch });
        VerifierSet { verifier, active: true }.publish(&env);
    }

    /// Quitar a un verificador invalida TODAS las credenciales que emitió.
    /// Esas personas pueden volver a registrarse con otro verificador.
    pub fn remove_verifier(env: Env, verifier: Address) {
        admin(&env).require_auth();
        bump_instance(&env);
        // Se marca inactivo en vez de borrarlo, para conservar la época (M-04).
        if let Some(mut i) = verifier_info(&env, &verifier) {
            i.active = false;
            set_p(&env, &DataKey::Verifier(verifier.clone()), &i);
        }
        VerifierSet { verifier, active: false }.publish(&env);
    }

    pub fn is_verifier(env: Env, verifier: Address) -> bool {
        bump_instance(&env);
        verifier_active(&env, &verifier)
    }

    // ------------------------------- Tokens ---------------------------------

    /// El admin decide qué tokens se pueden usar en programas.
    /// El contrato NO revisa el clawback: antes de aprobar un token hay que revisar
    /// fuera de la cadena las banderas del emisor (AUTH_CLAWBACK_ENABLED, AUTH_REVOCABLE).
    pub fn allow_token(env: Env, token: Address) {
        admin(&env).require_auth();
        bump_instance(&env);
        set_p(&env, &DataKey::AllowedToken(token.clone()), &true);
        TokenSet { token, allowed: true }.publish(&env);
    }

    pub fn disallow_token(env: Env, token: Address) {
        admin(&env).require_auth();
        bump_instance(&env);
        env.storage().persistent().remove(&DataKey::AllowedToken(token.clone()));
        TokenSet { token, allowed: false }.publish(&env);
    }

    pub fn is_token_allowed(env: Env, token: Address) -> bool {
        bump_instance(&env);
        has_p(&env, &DataKey::AllowedToken(token))
    }

    // ----------------------------- Credenciales -----------------------------

    /// Registra a una persona. `huella` = HMAC(secreto, CURP), calculado fuera.
    pub fn issue(env: Env, verifier: Address, huella: BytesN<32>, holder: BytesN<32>) -> Result<(), Error> {
        verifier.require_auth();
        bump_instance(&env);
        let epoch = match verifier_info(&env, &verifier) {
            Some(i) if i.active => i.epoch,
            _ => return Err(Error::NotVerifier),
        };

        let cred_key = DataKey::Cred(huella.clone());
        if let Some(old) = get_p::<Credential>(&env, &cred_key) {
            // Revocada por el admin (fraude): solo el admin la puede liberar.
            if old.locked {
                return Err(Error::CredentialLocked);
            }
            // Solo se puede volver a registrar si la anterior ya no vale.
            if cred_valid(&env, &old) {
                return Err(Error::AlreadyRegistered);
            }
            env.storage().persistent().remove(&DataKey::Holder(old.holder));
        }

        let holder_key = DataKey::Holder(holder.clone());
        if has_p(&env, &holder_key) {
            return Err(Error::KeyInUse);
        }

        let cred = Credential {
            holder: holder.clone(),
            verifier: verifier.clone(),
            verifier_epoch: epoch,
            issued_at: env.ledger().timestamp(),
            revoked: false,
            locked: false,
        };
        set_p(&env, &cred_key, &cred);
        set_p(&env, &holder_key, &huella);
        CredIssued { huella, verifier, holder }.publish(&env);
        Ok(())
    }

    /// Revoca una credencial. Puede hacerlo el admin o el verificador que la emitió.
    /// Si la revoca el admin, queda BLOQUEADA (M-04).
    pub fn revoke(env: Env, by: Address, huella: BytesN<32>) -> Result<(), Error> {
        by.require_auth();
        bump_instance(&env);
        let key = DataKey::Cred(huella.clone());
        let mut cred: Credential = get_p(&env, &key).ok_or(Error::NotRegistered)?;
        let is_admin = by == admin(&env);
        if !is_admin && by != cred.verifier {
            return Err(Error::NotAuthorized);
        }
        cred.revoked = true;
        if is_admin {
            cred.locked = true;
        }
        set_p(&env, &key, &cred);
        CredRevoked { huella, by, locked: cred.locked }.publish(&env);
        Ok(())
    }

    /// El admin libera una credencial bloqueada para que se pueda reemitir.
    pub fn unlock(env: Env, huella: BytesN<32>) -> Result<(), Error> {
        admin(&env).require_auth();
        bump_instance(&env);
        let key = DataKey::Cred(huella.clone());
        let mut cred: Credential = get_p(&env, &key).ok_or(Error::NotRegistered)?;
        cred.locked = false;
        set_p(&env, &key, &cred);
        CredUnlocked { huella }.publish(&env);
        Ok(())
    }

    pub fn credential(env: Env, huella: BytesN<32>) -> Option<Credential> {
        bump_instance(&env);
        get_p(&env, &DataKey::Cred(huella))
    }

    /// ¿Esta huella tiene hoy una credencial válida?
    pub fn is_registered(env: Env, huella: BytesN<32>) -> bool {
        bump_instance(&env);
        match get_p::<Credential>(&env, &DataKey::Cred(huella)) {
            Some(c) => cred_valid(&env, &c),
            None => false,
        }
    }

    // ------------------------------- Programas ------------------------------

    /// La organización crea un programa, elige en qué verificadores confía
    /// y deposita de una vez amount × cap.
    pub fn create_program(
        env: Env,
        org: Address,
        token: Address,
        amount: i128,
        cap: u32,
        verifiers: Vec<Address>,
    ) -> Result<u32, Error> {
        org.require_auth();
        bump_instance(&env);
        if amount <= 0 || cap == 0 {
            return Err(Error::InvalidAmount);
        }
        if !has_p(&env, &DataKey::AllowedToken(token.clone())) {
            return Err(Error::TokenNotAllowed);
        }
        if verifiers.is_empty() || verifiers.len() > MAX_PROGRAM_VERIFIERS {
            return Err(Error::InvalidVerifierList);
        }
        for v in verifiers.iter() {
            if !verifier_active(&env, &v) {
                return Err(Error::NotVerifier);
            }
        }
        let total = amount.checked_mul(cap as i128).ok_or(Error::Overflow)?;

        let id: u32 = env.storage().instance().get(&DataKey::NextProgram).unwrap_or(0);
        let next = id.checked_add(1).ok_or(Error::Overflow)?;
        env.storage().instance().set(&DataKey::NextProgram, &next);

        // M-02: se mide lo que de verdad llegó. Si falta algo, el error revierte
        // toda la transacción, incluida la transferencia.
        let tc = token::Client::new(&env, &token);
        let me = env.current_contract_address();
        let before = tc.balance(&me);
        tc.transfer(&org, &me, &total);
        let received = tc.balance(&me).checked_sub(before).ok_or(Error::Overflow)?;
        if received < total {
            return Err(Error::InsufficientDeposit);
        }

        let p = Program { org: org.clone(), token, amount, cap, claimed: 0, open: true, verifiers };
        set_p(&env, &DataKey::Program(id), &p);
        ProgramCreated { program_id: id, org, amount, cap }.publish(&env);
        Ok(id)
    }

    /// Cierra el programa y regresa a la organización lo que no se cobró.
    pub fn close_program(env: Env, program_id: u32) -> Result<i128, Error> {
        bump_instance(&env);
        let key = DataKey::Program(program_id);
        let mut p = load_program(&env, program_id)?;
        p.org.require_auth();
        if !p.open {
            return Err(Error::ProgramClosed);
        }
        let left = (p.cap - p.claimed) as i128;
        let refund = p.amount.checked_mul(left).ok_or(Error::Overflow)?;

        // Primero se marca cerrado y después se mueve el dinero.
        p.open = false;
        set_p(&env, &key, &p);
        if refund > 0 {
            token::Client::new(&env, &p.token).transfer(&env.current_contract_address(), &p.org, &refund);
        }
        ProgramClosed { program_id, refunded: refund }.publish(&env);
        Ok(refund)
    }

    pub fn program(env: Env, program_id: u32) -> Result<Program, Error> {
        bump_instance(&env);
        load_program(&env, program_id)
    }

    // -------------------------------- Cobrar --------------------------------

    /// Mensaje exacto que el celular debe firmar para cobrar.
    pub fn claim_message(env: Env, program_id: u32, expires_ledger: u32, dest: Address) -> Bytes {
        build_claim_message(&env, program_id, expires_ledger, &dest)
    }

    /// Cualquiera puede enviar esta transacción (ej. un "relayer" que paga la
    /// comisión); lo que da el permiso es la FIRMA del celular de la persona.
    pub fn claim(
        env: Env,
        program_id: u32,
        holder: BytesN<32>,
        expires_ledger: u32,
        signature: BytesN<64>,
        dest: Address,
    ) -> Result<(), Error> {
        bump_instance(&env);
        let now = env.ledger().sequence();
        if now > expires_ledger || expires_ledger - now > MAX_CLAIM_TTL {
            return Err(Error::ClaimExpired);
        }
        if dest == env.current_contract_address() {
            return Err(Error::InvalidDestination);
        }

        let pkey = DataKey::Program(program_id);
        let mut p = load_program(&env, program_id)?;
        if !p.open {
            return Err(Error::ProgramClosed);
        }
        if p.claimed >= p.cap {
            return Err(Error::ProgramFull);
        }

        let huella: BytesN<32> = get_p(&env, &DataKey::Holder(holder.clone())).ok_or(Error::NotRegistered)?;
        let cred: Credential = get_p(&env, &DataKey::Cred(huella.clone())).ok_or(Error::NotRegistered)?;
        if cred.holder != holder || !cred_valid(&env, &cred) {
            return Err(Error::CredentialInvalid);
        }
        if !p.verifiers.contains(&cred.verifier) {
            return Err(Error::VerifierNotAccepted);
        }

        let claimed_key = DataKey::Claimed(program_id, huella);
        if has_p(&env, &claimed_key) {
            return Err(Error::AlreadyClaimed);
        }

        let msg = build_claim_message(&env, program_id, expires_ledger, &dest);
        verificar_firma_titular(&env, &holder, &msg, &signature);

        // Se anota todo ANTES de mover el dinero.
        set_p(&env, &claimed_key, &true);
        p.claimed += 1;
        set_p(&env, &pkey, &p);

        token::Client::new(&env, &p.token).transfer(&env.current_contract_address(), &dest, &p.amount);
        ClaimPaid { program_id, dest, amount: p.amount }.publish(&env);
        Ok(())
    }

    pub fn has_claimed(env: Env, program_id: u32, huella: BytesN<32>) -> bool {
        bump_instance(&env);
        has_p(&env, &DataKey::Claimed(program_id, huella))
    }
}

#[cfg(test)]
mod test;
