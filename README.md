# Uno

**Credencial de unicidad sobre Stellar.** Uno permite que organizaciones que reparten apoyos paguen **una sola vez a cada persona real**, sin guardar su INE ni su CURP.

Proyecto de Ángel Uriel Prado Zamora ([up-sec](https://github.com/up-sec)) para Blockchain Builders 101.

## Cómo funciona

1. **Registro:** un verificador autorizado (Punto Uno) comprueba a la persona en persona. En Stellar solo queda una *huella de unicidad*: un HMAC de la CURP calculado fuera de la cadena, del que no se puede recuperar la CURP. También queda la llave pública del celular de la persona.
2. **Programa:** una organización crea un programa de apoyo y deposita en el contrato el monto total (monto por persona × cupo).
3. **Cobro:** la persona firma el reclamo desde su celular. El contrato paga **una sola vez por persona y por programa**.
4. **Cierre:** la organización puede cerrar el programa y recuperar lo que no se cobró.

## Contrato v0 en testnet

| Dato | Valor |
|---|---|
| Red | Stellar testnet |
| Contract ID | `CCLD6LE2HLHZZ6SEGNODCYSEV5XWTBQ3JG7Q55GYCRE5QW4AMFTYGLAG` |
| Explorador | [Ver en Stellar Lab](https://lab.stellar.org/r/testnet/contract/CCLD6LE2HLHZZ6SEGNODCYSEV5XWTBQ3JG7Q55GYCRE5QW4AMFTYGLAG) |
| Wasm hash | `4c4f5fd47752e10242f700a7e53d0d67e422cd043e93e928dc375a6b33cd96e3` |
| SDK | soroban-sdk 28.0.0 |

Funciones principales: `add_verifier`, `remove_verifier`, `issue`, `revoke`, `is_registered`, `create_program`, `close_program`, `claim`, `claim_message`, `program` y `has_claimed`.

## Seguridad (lo que el contrato garantiza)

Cubierto por 18 pruebas en `contracts/uno/src/test.rs`:

- Una misma persona (huella) no puede registrarse dos veces mientras su credencial esté vigente.
- Nadie cobra dos veces en el mismo programa, ni siquiera tras reemitir su credencial.
- Nadie cobra con una llave que no es la suya (firma Ed25519).
- Un reclamo firmado no se puede desviar a otra cuenta ni reutilizar en otro programa.
- Las credenciales revocadas y las de verificadores dados de baja no cobran.
- Los montos se validan contra desbordamientos y el sobrante regresa a la organización.

**Limitaciones conocidas de v0:**
- El secreto del HMAC es el dato más sensible del sistema: vive solo en el backend y **nunca** se sube al repo.
- La misma huella se usa en todos los programas, así que en teoría se podría ligar la participación de una persona entre programas.
- La firma del titular es Ed25519 (clásica). Está aislada en `verificar_firma_titular()` para cambiarla a una firma post-cuántica (ver ADR-001, pendiente).

## Correr el proyecto

```
cargo test
stellar contract build
stellar contract deploy --wasm target\wasm32v1-none\release\uno.wasm --source admin --network testnet --alias uno -- --admin admin
```

## Documentación

- [Semana 1 — Problem Brief](docs/semana1/ProblemBrief.md)
- [Semana 2 — Product Blueprint](docs/semana2/ProductBlueprint.md)
- [Roadmap](ROADMAP.md)
