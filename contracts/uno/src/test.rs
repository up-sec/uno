#![cfg(test)]
extern crate std;

use super::*;
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    testutils::{Address as _, AuthorizedFunction, Ledger, MockAuth, MockAuthInvoke},
    IntoVal,
    token::{StellarAssetClient, TokenClient},
    vec, Address, BytesN, Env, Symbol,
};
use std::vec::Vec as StdVec;

const AMOUNT: i128 = 5_000_000_000; // 500 MXN-demo (7 decimales)

struct T<'a> {
    env: Env,
    uno: UnoClient<'a>,
    admin: Address,
    verifier: Address,
    org: Address,
    token: TokenClient<'a>,
}

fn new_token<'a>(env: &Env, org: &Address) -> TokenClient<'a> {
    let issuer = Address::generate(env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    StellarAssetClient::new(env, &sac.address()).mint(org, &10_000_000_000_000);
    TokenClient::new(env, &sac.address())
}

fn setup<'a>() -> T<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.sequence_number = 1_000);
    let admin = Address::generate(&env);
    let verifier = Address::generate(&env);
    let org = Address::generate(&env);
    let token = new_token(&env, &org);

    let id = env.register(Uno, (admin.clone(),));
    let uno = UnoClient::new(&env, &id);
    uno.add_verifier(&verifier);
    uno.allow_token(&token.address);
    T { env, uno, admin, verifier, org, token }
}

fn key(n: u8) -> SigningKey {
    SigningKey::from_bytes(&[n; 32])
}
fn pubkey(t: &T, k: &SigningKey) -> BytesN<32> {
    BytesN::from_array(&t.env, &k.verifying_key().to_bytes())
}
fn huella(t: &T, n: u8) -> BytesN<32> {
    BytesN::from_array(&t.env, &[n; 32])
}
/// Caducidad típica: 100 ledgers (~8 min) después del ledger actual.
fn exp(t: &T) -> u32 {
    t.env.ledger().sequence() + 100
}
fn sign(t: &T, k: &SigningKey, pid: u32, e: u32, dest: &Address) -> BytesN<64> {
    let msg = t.uno.claim_message(&pid, &e, dest);
    let raw: StdVec<u8> = msg.iter().collect();
    BytesN::from_array(&t.env, &k.sign(&raw).to_bytes())
}
fn program(t: &T, cap: u32) -> u32 {
    t.uno.create_program(&t.org, &t.token.address, &AMOUNT, &cap, &vec![&t.env, t.verifier.clone()])
}
/// Registra persona n con llave n (verificador principal).
fn person(t: &T, n: u8) -> (BytesN<32>, SigningKey) {
    let k = key(n);
    let h = huella(t, n);
    t.uno.issue(&t.verifier, &h, &pubkey(t, &k));
    (h, k)
}
/// Cobra con firma válida; regresa la cuenta destino.
fn cobrar(t: &T, pid: u32, k: &SigningKey) -> Address {
    let dest = Address::generate(&t.env);
    let e = exp(t);
    let sig = sign(t, k, pid, e, &dest);
    t.uno.claim(&pid, &pubkey(t, k), &e, &sig, &dest);
    dest
}

/// B-02: comprueba que la ÚLTIMA llamada pidió la firma de `who` para `func`.
fn assert_auth(t: &T, who: &Address, func: &str) {
    let auths = t.env.auths();
    let ok = auths.iter().any(|(a, inv)| {
        a == who
            && match &inv.function {
                AuthorizedFunction::Contract((c, f, _)) => *c == t.uno.address && *f == Symbol::new(&t.env, func),
                _ => false,
            }
    });
    assert!(ok, "{} no exigió la firma esperada", func);
}

// ============================ Flujo y casos v0 ==============================

#[test]
fn flujo_completo() {
    let t = setup();
    let (h, k) = person(&t, 1);
    assert!(t.uno.is_registered(&h));
    let pid = program(&t, 10);
    assert_eq!(t.token.balance(&t.uno.address), AMOUNT * 10);
    let dest = cobrar(&t, pid, &k);
    assert_eq!(t.token.balance(&dest), AMOUNT);
    assert_eq!(t.uno.program(&pid).claimed, 1);
    assert!(t.uno.has_claimed(&pid, &h));
    assert_eq!(t.uno.version(), 2);
}

#[test]
fn sybil_misma_huella_dos_veces() {
    let t = setup();
    let (h, _) = person(&t, 1);
    assert_eq!(t.uno.try_issue(&t.verifier, &h, &pubkey(&t, &key(2))), Err(Ok(Error::AlreadyRegistered)));
}

#[test]
fn llave_reutilizada() {
    let t = setup();
    let (_, k) = person(&t, 1);
    assert_eq!(t.uno.try_issue(&t.verifier, &huella(&t, 2), &pubkey(&t, &k)), Err(Ok(Error::KeyInUse)));
}

#[test]
fn doble_cobro_rechazado() {
    let t = setup();
    let (_, k) = person(&t, 1);
    let pid = program(&t, 10);
    let dest = Address::generate(&t.env);
    let pk = pubkey(&t, &k);
    let e1 = exp(&t);
    let sig1 = sign(&t, &k, pid, e1, &dest);
    t.uno.claim(&pid, &pk, &e1, &sig1, &dest);
    // Repetir el mismo reclamo
    assert_eq!(t.uno.try_claim(&pid, &pk, &e1, &sig1, &dest), Err(Ok(Error::AlreadyClaimed)));
    // Reclamo nuevo, con otra caducidad y firma válida: igual se rechaza
    let e2 = e1 + 1;
    let sig2 = sign(&t, &k, pid, e2, &dest);
    assert_eq!(t.uno.try_claim(&pid, &pk, &e2, &sig2, &dest), Err(Ok(Error::AlreadyClaimed)));
    assert_eq!(t.token.balance(&dest), AMOUNT);
}

#[test]
fn suplantacion_firma_de_otra_llave() {
    let t = setup();
    let (_, k) = person(&t, 1);
    let pid = program(&t, 10);
    let dest = Address::generate(&t.env);
    let e = exp(&t);
    let sig = sign(&t, &key(9), pid, e, &dest);
    assert!(t.uno.try_claim(&pid, &pubkey(&t, &k), &e, &sig, &dest).is_err());
    assert_eq!(t.token.balance(&dest), 0);
}

#[test]
fn reenviar_reclamo_a_otra_cuenta_u_otro_programa() {
    let t = setup();
    let (_, k) = person(&t, 1);
    let pid = program(&t, 10);
    let dest = Address::generate(&t.env);
    let ladron = Address::generate(&t.env);
    let e = exp(&t);
    let sig = sign(&t, &k, pid, e, &dest);
    assert!(t.uno.try_claim(&pid, &pubkey(&t, &k), &e, &sig, &ladron).is_err());
    assert_eq!(t.token.balance(&ladron), 0);
    let pid2 = program(&t, 10);
    assert!(t.uno.try_claim(&pid2, &pubkey(&t, &k), &e, &sig, &dest).is_err());
    // Cambiar la caducidad también rompe la firma
    assert!(t.uno.try_claim(&pid, &pubkey(&t, &k), &(e + 1), &sig, &dest).is_err());
}

#[test]
fn credencial_revocada_no_cobra() {
    let t = setup();
    let (h, k) = person(&t, 1);
    let pid = program(&t, 10);
    t.uno.revoke(&t.verifier, &h);
    assert!(!t.uno.is_registered(&h));
    let dest = Address::generate(&t.env);
    let e = exp(&t);
    let sig = sign(&t, &k, pid, e, &dest);
    assert_eq!(t.uno.try_claim(&pid, &pubkey(&t, &k), &e, &sig, &dest), Err(Ok(Error::CredentialInvalid)));
}

#[test]
fn solo_admin_o_emisor_revocan() {
    let t = setup();
    let (h, _) = person(&t, 1);
    let extrano = Address::generate(&t.env);
    assert_eq!(t.uno.try_revoke(&extrano, &h), Err(Ok(Error::NotAuthorized)));
    t.uno.revoke(&t.admin, &h);
    assert!(!t.uno.is_registered(&h));
}

#[test]
fn celular_perdido_y_reemision() {
    let t = setup();
    let (h, viejo) = person(&t, 1);
    let pid = program(&t, 10);
    t.uno.revoke(&t.verifier, &h); // revoca el verificador: NO queda bloqueada
    let nuevo = key(7);
    t.uno.issue(&t.verifier, &h, &pubkey(&t, &nuevo));
    assert!(t.uno.is_registered(&h));

    let dest = Address::generate(&t.env);
    let e = exp(&t);
    let sig0 = sign(&t, &viejo, pid, e, &dest);
    assert_eq!(t.uno.try_claim(&pid, &pubkey(&t, &viejo), &e, &sig0, &dest), Err(Ok(Error::NotRegistered)));
    let d = cobrar(&t, pid, &nuevo);
    assert_eq!(t.token.balance(&d), AMOUNT);
}

#[test]
fn reemision_no_permite_cobrar_doble() {
    let t = setup();
    let (h, viejo) = person(&t, 1);
    let pid = program(&t, 10);
    cobrar(&t, pid, &viejo);
    t.uno.revoke(&t.verifier, &h);
    let nuevo = key(7);
    t.uno.issue(&t.verifier, &h, &pubkey(&t, &nuevo));
    let dest = Address::generate(&t.env);
    let e = exp(&t);
    let sig = sign(&t, &nuevo, pid, e, &dest);
    assert_eq!(t.uno.try_claim(&pid, &pubkey(&t, &nuevo), &e, &sig, &dest), Err(Ok(Error::AlreadyClaimed)));
}

#[test]
fn verificador_no_autorizado() {
    let t = setup();
    let falso = Address::generate(&t.env);
    assert_eq!(t.uno.try_issue(&falso, &huella(&t, 1), &pubkey(&t, &key(1))), Err(Ok(Error::NotVerifier)));
}

#[test]
fn quitar_verificador_invalida_y_permite_reregistro() {
    let t = setup();
    let v2 = Address::generate(&t.env);
    t.uno.add_verifier(&v2);
    let (h, k) = person(&t, 1);
    let pid = t.uno.create_program(&t.org, &t.token.address, &AMOUNT, &10, &vec![&t.env, t.verifier.clone(), v2.clone()]);
    t.uno.remove_verifier(&t.verifier);
    assert!(!t.uno.is_registered(&h));
    assert_eq!(t.uno.try_issue(&t.verifier, &huella(&t, 2), &pubkey(&t, &key(2))), Err(Ok(Error::NotVerifier)));
    let dest = Address::generate(&t.env);
    let e = exp(&t);
    let sig = sign(&t, &k, pid, e, &dest);
    assert_eq!(t.uno.try_claim(&pid, &pubkey(&t, &k), &e, &sig, &dest), Err(Ok(Error::CredentialInvalid)));

    t.uno.issue(&v2, &h, &pubkey(&t, &k));
    assert!(t.uno.is_registered(&h));
    let d = cobrar(&t, pid, &k);
    assert_eq!(t.token.balance(&d), AMOUNT);
}

#[test]
fn programa_lleno() {
    let t = setup();
    let pid = program(&t, 1);
    let (_, k1) = person(&t, 1);
    let (_, k2) = person(&t, 2);
    cobrar(&t, pid, &k1);
    let dest = Address::generate(&t.env);
    let e = exp(&t);
    let sig = sign(&t, &k2, pid, e, &dest);
    assert_eq!(t.uno.try_claim(&pid, &pubkey(&t, &k2), &e, &sig, &dest), Err(Ok(Error::ProgramFull)));
}

#[test]
fn validaciones_al_crear_programa() {
    let t = setup();
    let tok = t.token.address.clone();
    let vs = vec![&t.env, t.verifier.clone()];
    assert_eq!(t.uno.try_create_program(&t.org, &tok, &0, &5, &vs), Err(Ok(Error::InvalidAmount)));
    assert_eq!(t.uno.try_create_program(&t.org, &tok, &-1, &5, &vs), Err(Ok(Error::InvalidAmount)));
    assert_eq!(t.uno.try_create_program(&t.org, &tok, &AMOUNT, &0, &vs), Err(Ok(Error::InvalidAmount)));
    assert_eq!(t.uno.try_create_program(&t.org, &tok, &i128::MAX, &2, &vs), Err(Ok(Error::Overflow)));
    // Lista de verificadores vacía, demasiado larga o con alguien que no es verificador
    assert_eq!(t.uno.try_create_program(&t.org, &tok, &AMOUNT, &5, &vec![&t.env]), Err(Ok(Error::InvalidVerifierList)));
    let mut muchos = vec![&t.env];
    for _ in 0..11 {
        muchos.push_back(t.verifier.clone());
    }
    assert_eq!(t.uno.try_create_program(&t.org, &tok, &AMOUNT, &5, &muchos), Err(Ok(Error::InvalidVerifierList)));
    let falso = vec![&t.env, Address::generate(&t.env)];
    assert_eq!(t.uno.try_create_program(&t.org, &tok, &AMOUNT, &5, &falso), Err(Ok(Error::NotVerifier)));
    assert_eq!(t.uno.try_program(&99), Err(Ok(Error::ProgramNotFound)));
}

#[test]
fn cerrar_programa_devuelve_sobrante() {
    let t = setup();
    let antes = t.token.balance(&t.org);
    let pid = program(&t, 5);
    let (_, k) = person(&t, 1);
    cobrar(&t, pid, &k);
    assert_eq!(t.uno.close_program(&pid), AMOUNT * 4);
    assert_eq!(t.token.balance(&t.org), antes - AMOUNT);
    assert_eq!(t.token.balance(&t.uno.address), 0);

    let (_, k2) = person(&t, 2);
    let dest = Address::generate(&t.env);
    let e = exp(&t);
    let sig = sign(&t, &k2, pid, e, &dest);
    assert_eq!(t.uno.try_claim(&pid, &pubkey(&t, &k2), &e, &sig, &dest), Err(Ok(Error::ProgramClosed)));
    assert_eq!(t.uno.try_close_program(&pid), Err(Ok(Error::ProgramClosed)));
}

#[test]
fn auditoria_n_personas_n_pagos() {
    let t = setup();
    let n: u8 = 5;
    let pid = program(&t, n as u32);
    for i in 1..=n {
        let (_, k) = person(&t, i);
        let d = cobrar(&t, pid, &k);
        assert_eq!(t.token.balance(&d), AMOUNT);
    }
    assert_eq!(t.uno.program(&pid).claimed, n as u32);
    assert_eq!(t.token.balance(&t.uno.address), 0);
}

#[test]
fn persona_sin_registro_no_cobra() {
    let t = setup();
    let pid = program(&t, 10);
    let k = key(3);
    let dest = Address::generate(&t.env);
    let e = exp(&t);
    let sig = sign(&t, &k, pid, e, &dest);
    assert_eq!(t.uno.try_claim(&pid, &pubkey(&t, &k), &e, &sig, &dest), Err(Ok(Error::NotRegistered)));
}

// ======================= Arreglos de la auditoría v1 ========================

/// A-01: un verificador robado solo afecta programas que confían en él.
#[test]
fn a01_programa_solo_acepta_sus_verificadores() {
    let t = setup();
    let corrupto = Address::generate(&t.env);
    t.uno.add_verifier(&corrupto);
    let pid = program(&t, 10); // solo confía en t.verifier
    let k = key(5);
    t.uno.issue(&corrupto, &huella(&t, 5), &pubkey(&t, &k));
    let dest = Address::generate(&t.env);
    let e = exp(&t);
    let sig = sign(&t, &k, pid, e, &dest);
    assert_eq!(t.uno.try_claim(&pid, &pubkey(&t, &k), &e, &sig, &dest), Err(Ok(Error::VerifierNotAccepted)));
    assert_eq!(t.token.balance(&t.uno.address), AMOUNT * 10);
}

/// A-02: cambio de admin en dos pasos.
#[test]
fn a02_cambio_de_admin_en_dos_pasos() {
    let t = setup();
    let nuevo = Address::generate(&t.env);
    assert_eq!(t.uno.try_accept_admin(), Err(Ok(Error::NoPendingAdmin)));
    t.uno.propose_admin(&nuevo);
    assert_auth(&t, &t.admin, "propose_admin");
    assert_eq!(t.uno.admin(), t.admin); // aún no cambia
    t.uno.accept_admin();
    assert_auth(&t, &nuevo, "accept_admin");
    assert_eq!(t.uno.admin(), nuevo);
    // Ahora las funciones de admin piden la firma del nuevo
    t.uno.add_verifier(&Address::generate(&t.env));
    assert_auth(&t, &nuevo, "add_verifier");
    assert_eq!(t.uno.try_accept_admin(), Err(Ok(Error::NoPendingAdmin)));
}

/// M-01: sin registro de sellos, nadie puede bloquear el cobro de otro.
#[test]
fn m01_dos_personas_mismo_ledger_no_se_bloquean() {
    let t = setup();
    let pid = program(&t, 10);
    let (_, k1) = person(&t, 1);
    let (_, k2) = person(&t, 2);
    let dest1 = Address::generate(&t.env);
    let dest2 = Address::generate(&t.env);
    let e = exp(&t);
    let s1 = sign(&t, &k1, pid, e, &dest1);
    let s2 = sign(&t, &k2, pid, e, &dest2);
    t.uno.claim(&pid, &pubkey(&t, &k1), &e, &s1, &dest1);
    t.uno.claim(&pid, &pubkey(&t, &k2), &e, &s2, &dest2);
    assert_eq!(t.token.balance(&dest2), AMOUNT);
}

/// M-03: solo tokens de la lista blanca.
#[test]
fn m03_token_no_permitido() {
    let t = setup();
    let falso = new_token(&t.env, &t.org);
    let vs = vec![&t.env, t.verifier.clone()];
    assert_eq!(t.uno.try_create_program(&t.org, &falso.address, &AMOUNT, &5, &vs), Err(Ok(Error::TokenNotAllowed)));
    t.uno.allow_token(&falso.address);
    assert!(t.uno.is_token_allowed(&falso.address));
    t.uno.disallow_token(&falso.address);
    assert_eq!(t.uno.try_create_program(&t.org, &falso.address, &AMOUNT, &5, &vs), Err(Ok(Error::TokenNotAllowed)));
}

/// M-04: lo que revoca el admin no lo reactiva un verificador.
#[test]
fn m04_revocacion_del_admin_queda_bloqueada() {
    let t = setup();
    let (h, _) = person(&t, 1);
    t.uno.revoke(&t.admin, &h);
    assert!(t.uno.credential(&h).unwrap().locked);
    assert_eq!(t.uno.try_issue(&t.verifier, &h, &pubkey(&t, &key(8))), Err(Ok(Error::CredentialLocked)));
    t.uno.unlock(&h);
    t.uno.issue(&t.verifier, &h, &pubkey(&t, &key(8)));
    assert!(t.uno.is_registered(&h));
}

/// B-01: no se puede mandar el pago al propio contrato.
#[test]
fn b01_destino_no_puede_ser_el_contrato() {
    let t = setup();
    let (_, k) = person(&t, 1);
    let pid = program(&t, 10);
    let dest = t.uno.address.clone();
    let e = exp(&t);
    let sig = sign(&t, &k, pid, e, &dest);
    assert_eq!(t.uno.try_claim(&pid, &pubkey(&t, &k), &e, &sig, &dest), Err(Ok(Error::InvalidDestination)));
}

/// B-03: los reclamos firmados caducan y no pueden durar más de ~1 día.
#[test]
fn b03_reclamo_caduca() {
    let t = setup();
    let (_, k) = person(&t, 1);
    let pid = program(&t, 10);
    let dest = Address::generate(&t.env);
    let e = t.env.ledger().sequence() + 10;
    let sig = sign(&t, &k, pid, e, &dest);
    t.env.ledger().with_mut(|l| l.sequence_number += 11);
    assert_eq!(t.uno.try_claim(&pid, &pubkey(&t, &k), &e, &sig, &dest), Err(Ok(Error::ClaimExpired)));
    // Caducidad demasiado lejana
    let lejos = t.env.ledger().sequence() + MAX_CLAIM_TTL + 1;
    let sig2 = sign(&t, &k, pid, lejos, &dest);
    assert_eq!(t.uno.try_claim(&pid, &pubkey(&t, &k), &lejos, &sig2, &dest), Err(Ok(Error::ClaimExpired)));
    // Con caducidad válida sí cobra
    cobrar(&t, pid, &k);
}

/// Upgrade: se puede congelar para siempre.
#[test]
fn upgrade_se_congela_para_siempre() {
    let t = setup();
    assert!(!t.uno.upgrades_frozen());
    t.uno.freeze_upgrades();
    assert_auth(&t, &t.admin, "freeze_upgrades");
    assert!(t.uno.upgrades_frozen());
    let hash = BytesN::from_array(&t.env, &[7; 32]);
    assert_eq!(t.uno.try_upgrade(&hash), Err(Ok(Error::UpgradesFrozen)));
}

/// B-02: cada función que cambia estado exige la firma de quien debe.
#[test]
fn b02_cada_funcion_exige_la_firma_correcta() {
    let t = setup();
    let v = Address::generate(&t.env);
    t.uno.add_verifier(&v);
    assert_auth(&t, &t.admin, "add_verifier");
    t.uno.remove_verifier(&v);
    assert_auth(&t, &t.admin, "remove_verifier");
    t.uno.allow_token(&t.token.address);
    assert_auth(&t, &t.admin, "allow_token");

    let h = huella(&t, 1);
    t.uno.issue(&t.verifier, &h, &pubkey(&t, &key(1)));
    assert_auth(&t, &t.verifier, "issue");
    t.uno.revoke(&t.verifier, &h);
    assert_auth(&t, &t.verifier, "revoke");
    t.uno.revoke(&t.admin, &h);
    assert_auth(&t, &t.admin, "revoke");
    t.uno.unlock(&h);
    assert_auth(&t, &t.admin, "unlock");

    let pid = program(&t, 3);
    assert_auth(&t, &t.org, "create_program");
    t.uno.close_program(&pid);
    assert_auth(&t, &t.org, "close_program");

    t.uno.disallow_token(&t.token.address);
    assert_auth(&t, &t.admin, "disallow_token");
}

/// B-02: sin firmas, las funciones protegidas fallan.
#[test]
fn b02_sin_firma_se_rechaza() {
    let t = setup();
    let pid = program(&t, 3);
    t.uno.propose_admin(&Address::generate(&t.env));
    t.env.set_auths(&[]); // a partir de aquí no hay firmas simuladas
    let x = Address::generate(&t.env);
    assert!(t.uno.try_add_verifier(&x).is_err());
    assert!(t.uno.try_remove_verifier(&t.verifier).is_err());
    assert!(t.uno.try_allow_token(&x).is_err());
    assert!(t.uno.try_propose_admin(&x).is_err());
    assert!(t.uno.try_cancel_admin_proposal().is_err());
    assert!(t.uno.try_freeze_upgrades().is_err());
    assert!(t.uno.try_upgrade(&BytesN::from_array(&t.env, &[7; 32])).is_err());
    assert!(t.uno.try_issue(&t.verifier, &huella(&t, 4), &pubkey(&t, &key(4))).is_err());
    assert!(t.uno.try_close_program(&pid).is_err());
    assert!(t.uno.try_create_program(&t.org, &t.token.address, &AMOUNT, &1, &vec![&t.env, t.verifier.clone()]).is_err());
    assert_eq!(t.token.balance(&t.uno.address), AMOUNT * 3);
}

// =================== Arreglos rápidos de la auditoría v1 ====================

/// M-04: quitar y volver a dar de alta a un verificador NO revive sus credenciales viejas.
#[test]
fn m04_realta_de_verificador_no_revive_credenciales() {
    let t = setup();
    let (h, k) = person(&t, 1);
    let pid = program(&t, 10);
    t.uno.remove_verifier(&t.verifier);
    t.uno.add_verifier(&t.verifier);
    assert!(t.uno.is_verifier(&t.verifier));
    assert!(!t.uno.is_registered(&h));
    let dest = Address::generate(&t.env);
    let e = exp(&t);
    let sig = sign(&t, &k, pid, e, &dest);
    assert_eq!(t.uno.try_claim(&pid, &pubkey(&t, &k), &e, &sig, &dest), Err(Ok(Error::CredentialInvalid)));
    assert_eq!(t.token.balance(&t.uno.address), AMOUNT * 10);
    // La persona real se vuelve a registrar en la época nueva y cobra.
    t.uno.issue(&t.verifier, &h, &pubkey(&t, &k));
    assert_eq!(t.uno.credential(&h).unwrap().verifier_epoch, 2);
    cobrar(&t, pid, &k);
}

/// M-04: dar de alta a un verificador que ya está activo no invalida sus credenciales.
#[test]
fn m04_alta_repetida_no_invalida() {
    let t = setup();
    let (h, _) = person(&t, 1);
    t.uno.add_verifier(&t.verifier);
    assert!(t.uno.is_registered(&h));
}

/// Token de prueba que se queda con 1% de cada transferencia (M-02).
#[contract]
pub struct TokenConComision;

#[contractimpl]
impl TokenConComision {
    pub fn mint(env: Env, to: Address, amount: i128) {
        let b = Self::balance(env.clone(), to.clone());
        env.storage().persistent().set(&to, &(b + amount));
    }
    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage().persistent().get(&id).unwrap_or(0)
    }
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        let b = Self::balance(env.clone(), from.clone());
        env.storage().persistent().set(&from, &(b - amount));
        let b = Self::balance(env.clone(), to.clone());
        env.storage().persistent().set(&to, &(b + amount - amount / 100));
    }
}

/// M-02: si el contrato recibe menos de amount × cap, el programa no se crea.
#[test]
fn m02_rechaza_deposito_incompleto() {
    let t = setup();
    let id = t.env.register(TokenConComision, ());
    let tok = TokenConComisionClient::new(&t.env, &id);
    tok.mint(&t.org, &(AMOUNT * 10));
    t.uno.allow_token(&id);
    let vs = vec![&t.env, t.verifier.clone()];
    assert_eq!(t.uno.try_create_program(&t.org, &id, &AMOUNT, &5, &vs), Err(Ok(Error::InsufficientDeposit)));
    // Todo se revierte: la organización conserva su dinero y no hay programa.
    assert_eq!(tok.balance(&t.org), AMOUNT * 10);
    assert_eq!(tok.balance(&t.uno.address), 0);
    assert_eq!(t.uno.try_program(&0), Err(Ok(Error::ProgramNotFound)));
}

/// B-04: la propuesta de admin caduca en ~7 días.
#[test]
fn b04_propuesta_de_admin_caduca() {
    let t = setup();
    let nuevo = Address::generate(&t.env);
    t.uno.propose_admin(&nuevo);
    t.env.ledger().with_mut(|l| l.sequence_number += ADMIN_PROPOSAL_TTL + 1);
    assert_eq!(t.uno.try_accept_admin(), Err(Ok(Error::AdminProposalExpired)));
    assert_eq!(t.uno.admin(), t.admin);
    // En el último ledger válido sí se puede aceptar.
    t.uno.propose_admin(&nuevo);
    t.env.ledger().with_mut(|l| l.sequence_number += ADMIN_PROPOSAL_TTL);
    t.uno.accept_admin();
    assert_eq!(t.uno.admin(), nuevo);
}

/// B-04: el admin puede cancelar una propuesta pendiente.
#[test]
fn b04_cancelar_propuesta_de_admin() {
    let t = setup();
    assert_eq!(t.uno.try_cancel_admin_proposal(), Err(Ok(Error::NoPendingAdmin)));
    let nuevo = Address::generate(&t.env);
    t.uno.propose_admin(&nuevo);
    t.uno.cancel_admin_proposal();
    assert_auth(&t, &t.admin, "cancel_admin_proposal");
    assert_eq!(t.uno.try_accept_admin(), Err(Ok(Error::NoPendingAdmin)));
    assert_eq!(t.uno.admin(), t.admin);
}

/// B-05: upgrade exige la firma del admin. Un upgrade fallido no deja rastro en
/// `env.auths()`, así que se congela primero y se revisa POR QUÉ falla: con la firma
/// de otra cuenta se rechaza en la firma; con la del admin pasa la firma y llega a
/// `UpgradesFrozen`. El upgrade real que conserva el estado necesita el wasm
/// compilado: queda para el paso del deploy.
#[test]
fn b05_upgrade_exige_firma_del_admin() {
    let t = setup();
    t.uno.freeze_upgrades();
    let hash = BytesN::from_array(&t.env, &[7; 32]);
    let invoke = MockAuthInvoke {
        contract: &t.uno.address,
        fn_name: "upgrade",
        args: (hash.clone(),).into_val(&t.env),
        sub_invokes: &[],
    };
    let extrano = Address::generate(&t.env);
    let r = t.uno.mock_auths(&[MockAuth { address: &extrano, invoke: &invoke }]).try_upgrade(&hash);
    assert!(matches!(r, Err(Err(_))), "con firma ajena debe fallar en la firma: {:?}", r);
    let r = t.uno.mock_auths(&[MockAuth { address: &t.admin, invoke: &invoke }]).try_upgrade(&hash);
    assert_eq!(r, Err(Ok(Error::UpgradesFrozen)));
}
