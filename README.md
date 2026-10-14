# Uno

**Credencial de unicidad sobre Stellar.** Uno permite que organizaciones que reparten apoyos paguen **una sola vez a cada persona real**, sin guardar su INE ni su CURP.

Proyecto de Ángel Uriel Prado Zamora ([up-sec](https://github.com/up-sec)) para Blockchain Builders 101.

## Cómo funciona

1. **Registro:** un verificador autorizado (Punto Uno) comprueba a la persona en persona. En Stellar solo queda una *huella de unicidad*: un HMAC de la CURP calculado fuera de la cadena, del que no se puede recuperar la CURP. También queda la llave pública del celular de la persona.
2. **Programa:** una organización crea un programa de apoyo y deposita en el contrato el monto total (monto por persona × cupo).
3. **Cobro:** la persona firma el reclamo desde su celular. El contrato paga **una sola vez por persona y por programa**.
4. **Cierre:** la organización puede cerrar el programa y recuperar lo que no se cobró.

## Contrato en testnet

| Versión | Contract ID | Estado |
|---|---|---|
| v1 | _pendiente de desplegar_ | Actual: incluye los arreglos de la auditoría y upgrade |
| v0 | [`CCLD6LE2HLHZZ6SEGNODCYSEV5XWTBQ3JG7Q55GYCRE5QW4AMFTYGLAG`](https://lab.stellar.org/r/testnet/contract/CCLD6LE2HLHZZ6SEGNODCYSEV5XWTBQ3JG7Q55GYCRE5QW4AMFTYGLAG) | Obsoleto; no se puede actualizar porque no tenía upgrade |

SDK: soroban-sdk 28.0.0.

**Funciones principales:**
- Admin: `propose_admin`, `accept_admin`, `upgrade`, `freeze_upgrades`, `add_verifier`, `remove_verifier`, `allow_token`, `disallow_token` y `unlock`.
- Credenciales: `issue`, `revoke`, `credential` e `is_registered`.
- Programas: `create_program` (con la lista de verificadores aceptados), `close_program`, `program`, `claim`, `claim_message` y `has_claimed`.

### Upgrade (solo testnet y piloto)
El admin puede actualizar el código sin cambiar el Contract ID. Antes de mainnet se decide: o se llama `freeze_upgrades` (el contrato queda inmutable para siempre), o el upgrade se mantiene solo con un admin multifirma 2 de 3.

### Auditoría
El 12-oct-2026 el agente `auditor-uno` revisó el contrato v0 y encontró 2 hallazgos Altos, 4 Medios y 3 Bajos, sin ningún Crítico. En v1 se corrigieron A-02, M-01, M-03, B-01, B-02 y B-03, y M-04 se completó con la época por verificador. A-01 y M-02 quedan parciales (ver `docs/auditorias/2026-10-13-v1.md`). M-05 (vinculación entre programas) queda como limitación conocida.

## Seguridad (lo que el contrato garantiza)

Cubierto por 33 pruebas en `contracts/uno/src/test.rs`:

- Una misma persona (huella) no puede registrarse dos veces mientras su credencial esté vigente.
- Nadie cobra dos veces en el mismo programa, ni siquiera tras reemitir su credencial.
- Nadie cobra con una llave que no es la suya (firma Ed25519).
- Un reclamo firmado no se puede desviar a otra cuenta ni reutilizar en otro programa, y caduca en un máximo de ~1 día.
- Cada programa elige en qué verificadores confía; un verificador comprometido no puede vaciar programas ajenos.
- Solo se aceptan tokens que el admin puso en la lista blanca. **El contrato no verifica el clawback**: antes de aprobar un token hay que revisar las banderas del emisor (`AUTH_CLAWBACK_ENABLED`, `AUTH_REVOCABLE`).
- Si al crear un programa el contrato recibe menos dinero del pedido, el programa no se crea.
- Una credencial revocada por el admin por fraude no la puede reactivar un verificador.
- Cada función protegida exige la firma correcta; hay pruebas que lo verifican.
- Las credenciales revocadas y las de verificadores dados de baja no cobran, ni siquiera si el verificador vuelve a darse de alta.
- Los montos se validan contra desbordamientos y el sobrante regresa a la organización.

**Limitaciones conocidas de v0:**
- El secreto del HMAC es el dato más sensible del sistema: vive solo en el backend y **nunca** se sube al repo.
- M-05: la misma huella y la misma llave del celular se usan en todos los programas, así que con datos públicos se puede ligar la participación de una persona entre programas.
- El admin y los verificadores son roles de confianza: antes de mainnet el admin debe ser una cuenta multifirma.
- La firma del titular es Ed25519 (clásica). Está aislada en `verificar_firma_titular()` para cambiarla a una firma post-cuántica (ver ADR-001, pendiente).

## Correr el proyecto

```
cargo test
stellar contract build
stellar contract deploy --wasm target\wasm32v1-none\release\uno.wasm --source admin --network testnet --alias uno -- --admin admin
```

Después del deploy, el admin debe aprobar el token (`allow_token`) y dar de alta a los verificadores (`add_verifier`).

## Documentación

- [Semana 1 — Problem Brief](docs/semana1/ProblemBrief.md)
- [Semana 2 — Product Blueprint](docs/semana2/ProductBlueprint.md)
- [Roadmap](ROADMAP.md)
