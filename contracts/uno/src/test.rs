#![cfg(test)]
extern crate std;

use super::*;
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env,
};
use std::vec::Vec;

const AMOUNT: i128 = 500_0000000; // 500 MXN-demo (7 decimales)

struct T<'a> {
    env: Env,
    uno: UnoClient<'a>,
    admin: Address,
    verifier: Address,
    org: Address,
    token: TokenClient<'a>,
}

fn setup<'a>() -> T<'a> {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let verifier = Address::generate(&env);
    let org = Address::generate(&env);

    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let token_addr = sac.address();
    StellarAssetClient::new(&env, &token_addr).mint(&org, &1_000_000_0000000);
    let token = TokenClient::new(&env, &token_addr);

    let id = env.register(Uno, (admin.clone(),));
    let uno = UnoClient::new(&env, &id);
    uno.add_verifier(&verifier);
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
fn seal(t: &T, n: u8) -> BytesN<32> {
    let mut a = [0u8; 32];
    a[0] = 0xEE;
    a[31] = n;
    BytesN::from_array(&t.env, &a)
}
fn sign(t: &T, k: &SigningKey, pid: u32, s: &BytesN<32>, dest: &Address) -> BytesN<64> {
    let msg = t.uno.claim_message(&pid, s, dest);
    let raw: Vec<u8> = msg.iter().collect();
    BytesN::from_array(&t.env, &k.sign(&raw).to_bytes())
}
fn program(t: &T, cap: u32) -> u32 {
    t.uno.create_program(&t.org, &t.token.address, &AMOUNT, &cap)
}
/// Registra persona n con llave n.
fn person(t: &T, n: u8) -> (BytesN<32>, SigningKey) {
    let k = key(n);
    let h = huella(t, n);
    t.uno.issue(&t.verifier, &h, &pubkey(t, &k));
    (h, k)
}

#[test]
fn flujo_completo() {
    let t = setup();
    let (h, k) = person(&t, 1);
    assert!(t.uno.is_registered(&h));
    let pid = program(&t, 10);
    assert_eq!(t.token.balance(&t.uno.address), AMOUNT * 10);

    let dest = Address::generate(&t.env);
    let s = seal(&t, 1);
    let sig = sign(&t, &k, pid, &s, &dest);
    t.uno.claim(&pid, &pubkey(&t, &k), &s, &sig, &dest);

    assert_eq!(t.token.balance(&dest), AMOUNT);
    assert_eq!(t.uno.program(&pid).claimed, 1);
    assert!(t.uno.has_claimed(&pid, &h));
}

#[test]
fn sybil_misma_huella_dos_veces() {
    let t = setup();
    let (h, _) = person(&t, 1);
    let otra = pubkey(&t, &key(2));
    assert_eq!(t.uno.try_issue(&t.verifier, &h, &otra), Err(Ok(Error::AlreadyRegistered)));
}

#[test]
fn llave_reutilizada() {
    let t = setup();
    let (_, k) = person(&t, 1);
    let h2 = huella(&t, 2);
    assert_eq!(t.uno.try_issue(&t.verifier, &h2, &pubkey(&t, &k)), Err(Ok(Error::KeyInUse)));
}

#[test]
fn doble_cobro_mismo_y_otro_sello() {
    let t = setup();
    let (_, k) = person(&t, 1);
    let pid = program(&t, 10);
    let dest = Address::generate(&t.env);
    let pk = pubkey(&t, &k);

    let s1 = seal(&t, 1);
    let sig1 = sign(&t, &k, pid, &s1, &dest);
    t.uno.claim(&pid, &pk, &s1, &sig1, &dest);
    // Mismo sello
    assert_eq!(t.uno.try_claim(&pid, &pk, &s1, &sig1, &dest), Err(Ok(Error::AlreadyClaimed)));
    // Sello nuevo, firma válida: igual se rechaza
    let s2 = seal(&t, 2);
    let sig2 = sign(&t, &k, pid, &s2, &dest);
    assert_eq!(t.uno.try_claim(&pid, &pk, &s2, &sig2, &dest), Err(Ok(Error::AlreadyClaimed)));
    assert_eq!(t.token.balance(&dest), AMOUNT);
}

#[test]
fn suplantacion_firma_de_otra_llave() {
    let t = setup();
    let (_, k) = person(&t, 1);
    let pid = program(&t, 10);
    let dest = Address::generate(&t.env);
    let s = seal(&t, 1);
    let impostor = key(9);
    let sig = sign(&t, &impostor, pid, &s, &dest);
    assert!(t.uno.try_claim(&pid, &pubkey(&t, &k), &s, &sig, &dest).is_err());
    assert_eq!(t.token.balance(&dest), 0);
}

#[test]
fn reenviar_reclamo_a_otra_cuenta() {
    let t = setup();
    let (_, k) = person(&t, 1);
    let pid = program(&t, 10);
    let dest = Address::generate(&t.env);
    let ladron = Address::generate(&t.env);
    let s = seal(&t, 1);
    let sig = sign(&t, &k, pid, &s, &dest);
    assert!(t.uno.try_claim(&pid, &pubkey(&t, &k), &s, &sig, &ladron).is_err());
    assert_eq!(t.token.balance(&ladron), 0);
    // La firma tampoco sirve en otro programa
    let pid2 = program(&t, 10);
    assert!(t.uno.try_claim(&pid2, &pubkey(&t, &k), &s, &sig, &dest).is_err());
}

#[test]
fn credencial_revocada_no_cobra() {
    let t = setup();
    let (h, k) = person(&t, 1);
    let pid = program(&t, 10);
    t.uno.revoke(&t.verifier, &h);
    assert!(!t.uno.is_registered(&h));
    let dest = Address::generate(&t.env);
    let s = seal(&t, 1);
    let sig = sign(&t, &k, pid, &s, &dest);
    assert_eq!(t.uno.try_claim(&pid, &pubkey(&t, &k), &s, &sig, &dest), Err(Ok(Error::CredentialInvalid)));
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
    t.uno.revoke(&t.verifier, &h);
    let nuevo = key(7);
    t.uno.issue(&t.verifier, &h, &pubkey(&t, &nuevo));
    assert!(t.uno.is_registered(&h));

    let dest = Address::generate(&t.env);
    // La llave vieja ya no sirve
    let s0 = seal(&t, 0);
    let sig0 = sign(&t, &viejo, pid, &s0, &dest);
    assert_eq!(t.uno.try_claim(&pid, &pubkey(&t, &viejo), &s0, &sig0, &dest), Err(Ok(Error::NotRegistered)));
    // La nueva sí
    let s1 = seal(&t, 1);
    let sig1 = sign(&t, &nuevo, pid, &s1, &dest);
    t.uno.claim(&pid, &pubkey(&t, &nuevo), &s1, &sig1, &dest);
    assert_eq!(t.token.balance(&dest), AMOUNT);
}

#[test]
fn reemision_no_permite_cobrar_doble() {
    let t = setup();
    let (h, viejo) = person(&t, 1);
    let pid = program(&t, 10);
    let dest = Address::generate(&t.env);
    let s1 = seal(&t, 1);
    let sig1 = sign(&t, &viejo, pid, &s1, &dest);
    t.uno.claim(&pid, &pubkey(&t, &viejo), &s1, &sig1, &dest);

    t.uno.revoke(&t.verifier, &h);
    let nuevo = key(7);
    t.uno.issue(&t.verifier, &h, &pubkey(&t, &nuevo));
    let s2 = seal(&t, 2);
    let sig2 = sign(&t, &nuevo, pid, &s2, &dest);
    assert_eq!(t.uno.try_claim(&pid, &pubkey(&t, &nuevo), &s2, &sig2, &dest), Err(Ok(Error::AlreadyClaimed)));
}

#[test]
fn verificador_no_autorizado() {
    let t = setup();
    let falso = Address::generate(&t.env);
    let h = huella(&t, 1);
    assert_eq!(t.uno.try_issue(&falso, &h, &pubkey(&t, &key(1))), Err(Ok(Error::NotVerifier)));
}

#[test]
fn quitar_verificador_invalida_y_permite_reregistro() {
    let t = setup();
    let (h, k) = person(&t, 1);
    let pid = program(&t, 10);
    t.uno.remove_verifier(&t.verifier);
    assert!(!t.uno.is_registered(&h));
    // Ya no puede emitir
    assert_eq!(t.uno.try_issue(&t.verifier, &huella(&t, 2), &pubkey(&t, &key(2))), Err(Ok(Error::NotVerifier)));
    // Su credencial ya no cobra
    let dest = Address::generate(&t.env);
    let s = seal(&t, 1);
    let sig = sign(&t, &k, pid, &s, &dest);
    assert_eq!(t.uno.try_claim(&pid, &pubkey(&t, &k), &s, &sig, &dest), Err(Ok(Error::CredentialInvalid)));

    // Arreglo 2: otro verificador puede volver a registrar a la persona (misma llave incluso)
    let v2 = Address::generate(&t.env);
    t.uno.add_verifier(&v2);
    t.uno.issue(&v2, &h, &pubkey(&t, &k));
    assert!(t.uno.is_registered(&h));
    let s2 = seal(&t, 2);
    let sig2 = sign(&t, &k, pid, &s2, &dest);
    t.uno.claim(&pid, &pubkey(&t, &k), &s2, &sig2, &dest);
    assert_eq!(t.token.balance(&dest), AMOUNT);
}

#[test]
fn programa_lleno() {
    let t = setup();
    let pid = program(&t, 1);
    let (_, k1) = person(&t, 1);
    let (_, k2) = person(&t, 2);
    let dest = Address::generate(&t.env);
    let s1 = seal(&t, 1);
    let sig1 = sign(&t, &k1, pid, &s1, &dest);
    t.uno.claim(&pid, &pubkey(&t, &k1), &s1, &sig1, &dest);
    let s2 = seal(&t, 2);
    let sig2 = sign(&t, &k2, pid, &s2, &dest);
    assert_eq!(t.uno.try_claim(&pid, &pubkey(&t, &k2), &s2, &sig2, &dest), Err(Ok(Error::ProgramFull)));
}

#[test]
fn montos_invalidos_y_desbordamiento() {
    let t = setup();
    let tok = t.token.address.clone();
    assert_eq!(t.uno.try_create_program(&t.org, &tok, &0, &5), Err(Ok(Error::InvalidAmount)));
    assert_eq!(t.uno.try_create_program(&t.org, &tok, &-1, &5), Err(Ok(Error::InvalidAmount)));
    assert_eq!(t.uno.try_create_program(&t.org, &tok, &AMOUNT, &0), Err(Ok(Error::InvalidAmount)));
    assert_eq!(t.uno.try_create_program(&t.org, &tok, &i128::MAX, &2), Err(Ok(Error::Overflow)));
    assert_eq!(t.uno.try_program(&99), Err(Ok(Error::ProgramNotFound)));
}

#[test]
fn cerrar_programa_devuelve_sobrante() {
    let t = setup();
    let antes = t.token.balance(&t.org);
    let pid = program(&t, 5);
    let (_, k) = person(&t, 1);
    let dest = Address::generate(&t.env);
    let s = seal(&t, 1);
    let sig = sign(&t, &k, pid, &s, &dest);
    t.uno.claim(&pid, &pubkey(&t, &k), &s, &sig, &dest);

    let devuelto = t.uno.close_program(&pid);
    assert_eq!(devuelto, AMOUNT * 4);
    assert_eq!(t.token.balance(&t.org), antes - AMOUNT);
    assert_eq!(t.token.balance(&t.uno.address), 0);

    // Ya no se puede cobrar ni cerrar otra vez
    let (_, k2) = person(&t, 2);
    let s2 = seal(&t, 2);
    let sig2 = sign(&t, &k2, pid, &s2, &dest);
    assert_eq!(t.uno.try_claim(&pid, &pubkey(&t, &k2), &s2, &sig2, &dest), Err(Ok(Error::ProgramClosed)));
    assert_eq!(t.uno.try_close_program(&pid), Err(Ok(Error::ProgramClosed)));
}

#[test]
fn auditoria_n_personas_n_pagos() {
    let t = setup();
    let n: u8 = 5;
    let pid = program(&t, n as u32);
    for i in 1..=n {
        let (_, k) = person(&t, i);
        let dest = Address::generate(&t.env);
        let s = seal(&t, i);
        let sig = sign(&t, &k, pid, &s, &dest);
        t.uno.claim(&pid, &pubkey(&t, &k), &s, &sig, &dest);
        assert_eq!(t.token.balance(&dest), AMOUNT);
    }
    let p = t.uno.program(&pid);
    assert_eq!(p.claimed, n as u32);
    assert_eq!(t.token.balance(&t.uno.address), 0);
}

#[test]
fn sello_usado_por_otra_persona() {
    let t = setup();
    let pid = program(&t, 10);
    let (_, k1) = person(&t, 1);
    let (_, k2) = person(&t, 2);
    let dest = Address::generate(&t.env);
    let s = seal(&t, 1);
    let sig1 = sign(&t, &k1, pid, &s, &dest);
    t.uno.claim(&pid, &pubkey(&t, &k1), &s, &sig1, &dest);
    let sig2 = sign(&t, &k2, pid, &s, &dest);
    assert_eq!(t.uno.try_claim(&pid, &pubkey(&t, &k2), &s, &sig2, &dest), Err(Ok(Error::SealUsed)));
}

#[test]
fn persona_sin_registro_no_cobra() {
    let t = setup();
    let pid = program(&t, 10);
    let k = key(3);
    let dest = Address::generate(&t.env);
    let s = seal(&t, 1);
    let sig = sign(&t, &k, pid, &s, &dest);
    assert_eq!(t.uno.try_claim(&pid, &pubkey(&t, &k), &s, &sig, &dest), Err(Ok(Error::NotRegistered)));
}
