//! Uno v0 — credencial de unicidad + programas de apoyo en Stellar (Soroban).
//!
//! Idea en una frase: un verificador autorizado registra que "esta persona (huella)
//! es real y única" y le asocia la llave pública de su celular; después, la persona
//! puede cobrar UNA sola vez en cada programa, firmando el reclamo con esa llave.
//!
//! En la cadena NUNCA hay datos personales: solo la huella de unicidad
//! (HMAC(secreto, CURP) calculado fuera de la cadena) y una llave pública.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, xdr::ToXdr,
    Address, Bytes, BytesN, Env,
};

// ---------------------------------------------------------------------------
// Tiempo de vida en almacenamiento (TTL). 1 día ≈ 17 280 ledgers (5 s c/u).
// Todo se guarda en almacenamiento PERSISTENTE y se renueva al usarse.
// ---------------------------------------------------------------------------
const DAY: u32 = 17_280;
const BUMP: u32 = 30 * DAY;
const THRESHOLD: u32 = BUMP - DAY;

/// Prefijo del mensaje que firma el celular. Si algún día cambia el formato,
/// se sube a v2 y las firmas viejas dejan de servir.
const CLAIM_DOMAIN: &[u8] = b"UNO-CLAIM-v1";

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
    SealUsed = 10,
    InvalidAmount = 11,
    Overflow = 12,
    NotAuthorized = 13,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Credential {
    /// Llave pública Ed25519 del celular de la persona.
    pub holder: BytesN<32>,
    /// Quién verificó a la persona.
    pub verifier: Address,
    pub issued_at: u64,
    pub revoked: bool,
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
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Verifier(Address),
    /// huella -> Credential
    Cred(BytesN<32>),
    /// llave del celular -> huella
    Holder(BytesN<32>),
    NextProgram,
    Program(u32),
    /// (programa, sello) ya usado
    SealUsed(u32, BytesN<32>),
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
/// el rastreo de una persona entre programas; el auditor cuenta pagos y
/// ve a qué cuenta llegó cada uno.
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

fn verifier_active(env: &Env, v: &Address) -> bool {
    has_p(env, &DataKey::Verifier(v.clone()))
}

/// Una credencial vale si no está revocada y su verificador sigue autorizado.
fn cred_valid(env: &Env, c: &Credential) -> bool {
    !c.revoked && verifier_active(env, &c.verifier)
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

fn build_claim_message(env: &Env, program_id: u32, seal: &BytesN<32>, dest: &Address) -> Bytes {
    let mut m = Bytes::from_slice(env, CLAIM_DOMAIN);
    m.append(&env.current_contract_address().to_xdr(env));
    m.extend_from_array(&program_id.to_be_bytes());
    m.append(&Bytes::from(seal.clone()));
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

    pub fn admin(env: Env) -> Address {
        bump_instance(&env);
        admin(&env)
    }

    // ---------------------------- Verificadores ----------------------------

    pub fn add_verifier(env: Env, verifier: Address) {
        admin(&env).require_auth();
        bump_instance(&env);
        set_p(&env, &DataKey::Verifier(verifier.clone()), &true);
        VerifierSet { verifier, active: true }.publish(&env);
    }

    /// Quitar a un verificador invalida TODAS las credenciales que emitió.
    /// Esas personas pueden volver a registrarse con otro verificador.
    pub fn remove_verifier(env: Env, verifier: Address) {
        admin(&env).require_auth();
        bump_instance(&env);
        env.storage().persistent().remove(&DataKey::Verifier(verifier.clone()));
        VerifierSet { verifier, active: false }.publish(&env);
    }

    pub fn is_verifier(env: Env, verifier: Address) -> bool {
        bump_instance(&env);
        verifier_active(&env, &verifier)
    }

    // ----------------------------- Credenciales -----------------------------

    /// Registra a una persona. `huella` = HMAC(secreto, CURP), calculado fuera.
    pub fn issue(env: Env, verifier: Address, huella: BytesN<32>, holder: BytesN<32>) -> Result<(), Error> {
        verifier.require_auth();
        bump_instance(&env);
        if !verifier_active(&env, &verifier) {
            return Err(Error::NotVerifier);
        }

        let cred_key = DataKey::Cred(huella.clone());
        if let Some(old) = get_p::<Credential>(&env, &cred_key) {
            // Solo se puede volver a registrar si la credencial anterior ya no
            // vale (revocada o su verificador fue dado de baja).
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
            issued_at: env.ledger().timestamp(),
            revoked: false,
        };
        set_p(&env, &cred_key, &cred);
        set_p(&env, &holder_key, &huella);
        CredIssued { huella, verifier, holder }.publish(&env);
        Ok(())
    }

    /// Revoca una credencial (ej. celular perdido). Puede hacerlo el admin o
    /// el verificador que la emitió.
    pub fn revoke(env: Env, by: Address, huella: BytesN<32>) -> Result<(), Error> {
        by.require_auth();
        bump_instance(&env);
        let key = DataKey::Cred(huella.clone());
        let mut cred: Credential = get_p(&env, &key).ok_or(Error::NotRegistered)?;
        if by != admin(&env) && by != cred.verifier {
            return Err(Error::NotAuthorized);
        }
        cred.revoked = true;
        set_p(&env, &key, &cred);
        CredRevoked { huella, by }.publish(&env);
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

    /// La organización crea un programa y deposita de una vez amount × cap.
    pub fn create_program(env: Env, org: Address, token: Address, amount: i128, cap: u32) -> Result<u32, Error> {
        org.require_auth();
        bump_instance(&env);
        if amount <= 0 || cap == 0 {
            return Err(Error::InvalidAmount);
        }
        let total = amount.checked_mul(cap as i128).ok_or(Error::Overflow)?;

        let id: u32 = env.storage().instance().get(&DataKey::NextProgram).unwrap_or(0);
        let next = id.checked_add(1).ok_or(Error::Overflow)?;
        env.storage().instance().set(&DataKey::NextProgram, &next);

        token::Client::new(&env, &token).transfer(&org, &env.current_contract_address(), &total);

        let p = Program { org: org.clone(), token, amount, cap, claimed: 0, open: true };
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
    pub fn claim_message(env: Env, program_id: u32, seal: BytesN<32>, dest: Address) -> Bytes {
        build_claim_message(&env, program_id, &seal, &dest)
    }

    /// Cualquiera puede enviar esta transacción (ej. un "relayer" que paga la
    /// comisión); lo que da el permiso es la FIRMA del celular de la persona.
    pub fn claim(
        env: Env,
        program_id: u32,
        holder: BytesN<32>,
        seal: BytesN<32>,
        signature: BytesN<64>,
        dest: Address,
    ) -> Result<(), Error> {
        bump_instance(&env);
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

        let claimed_key = DataKey::Claimed(program_id, huella);
        if has_p(&env, &claimed_key) {
            return Err(Error::AlreadyClaimed);
        }
        let seal_key = DataKey::SealUsed(program_id, seal.clone());
        if has_p(&env, &seal_key) {
            return Err(Error::SealUsed);
        }

        let msg = build_claim_message(&env, program_id, &seal, &dest);
        verificar_firma_titular(&env, &holder, &msg, &signature);

        // Se anota todo ANTES de mover el dinero.
        set_p(&env, &claimed_key, &true);
        set_p(&env, &seal_key, &true);
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
