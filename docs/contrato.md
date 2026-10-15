# Uno: contrato, seguridad y auditorías

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
| v1.1 (`version()` = 2) | [`CCPJ3LQOWC3NAJYV77FO74HKELG7YXJ4ANMSALXKHGIKAJJ6FXFQDMQQ`](https://lab.stellar.org/r/testnet/contract/CCPJ3LQOWC3NAJYV77FO74HKELG7YXJ4ANMSALXKHGIKAJJ6FXFQDMQQ) | Actual: incluye los arreglos de las auditorías y upgrade |
| v0 | [`CCLD6LE2HLHZZ6SEGNODCYSEV5XWTBQ3JG7Q55GYCRE5QW4AMFTYGLAG`](https://lab.stellar.org/r/testnet/contract/CCLD6LE2HLHZZ6SEGNODCYSEV5XWTBQ3JG7Q55GYCRE5QW4AMFTYGLAG) | Obsoleto; no se puede actualizar porque no tenía upgrade |

### Token MXNDEMO

| Token | Contract ID (SAC) | Activo clásico |
|---|---|---|
| **MXNDEMO** (aprobado en v1.1 con `allow_token`) | [`CAKQXZLMZBOR5EJNHVJBB7UHYXAHX2JHPES3N7HSMBQUNOJZEKPDW2HZ`](https://lab.stellar.org/r/testnet/contract/CAKQXZLMZBOR5EJNHVJBB7UHYXAHX2JHPES3N7HSMBQUNOJZEKPDW2HZ) | `MXNDEMO:GDY7S3CSXCBCFAMJH6FNBDFD2GKLJERK4C27RM3QGD2GQ4PHYTVD3OGL`, 7 decimales |

SDK: soroban-sdk 28.0.0.

**Funciones principales:**
- Admin: `propose_admin`, `accept_admin`, `cancel_admin_proposal`, `upgrade`, `freeze_upgrades`, `add_verifier`, `remove_verifier`, `allow_token`, `disallow_token` y `unlock`.
- Credenciales: `issue`, `revoke`, `credential` e `is_registered`.
- Programas: `create_program` (con la lista de verificadores aceptados), `close_program`, `program`, `claim`, `claim_message` y `has_claimed`.
- Lectura: `version`, `admin`, `upgrades_frozen`, `is_verifier` e `is_token_allowed`.

### Despliegue

```
cargo test
stellar contract build
stellar contract deploy --wasm target\wasm32v1-none\release\uno.wasm --source admin --network testnet --alias uno -- --admin admin
```

Después del deploy, el admin debe aprobar el token (`allow_token`) y dar de alta a los verificadores (`add_verifier`).

### Upgrade (solo testnet y piloto)
El admin puede actualizar el código sin cambiar el Contract ID. Antes de mainnet se decide: o se llama `freeze_upgrades` (el contrato queda inmutable para siempre), o el upgrade se mantiene solo con un admin multifirma 2 de 3.

**Regla:** todo upgrade que cambie la forma de los datos guardados (por ejemplo, un campo nuevo en `Credential`) necesita una migración y subir `VERSION`. El `__constructor` no corre en un upgrade, y sin migración las lecturas de los datos viejos fallan.

## Auditorías

- **12-oct-2026 (v0):** el agente `auditor-uno` encontró 2 hallazgos Altos, 4 Medios y 3 Bajos, sin ningún Crítico. Ver [2026-10-12-v0.md](auditorias/2026-10-12-v0.md).
- **13-oct-2026 (v1):** se corrigieron A-02, M-01, M-03, B-01, B-02 y B-03. Ver [2026-10-13-v1.md](auditorias/2026-10-13-v1.md).
- **14-oct-2026 (v1.1):** M-04 (época por verificador) y B-04 (caducidad de la propuesta de admin) quedan arreglados. A-01 y M-02 siguen **parciales**. Ver [2026-10-14-v1.1.md](auditorias/2026-10-14-v1.1.md).
- **14-oct-2026 (frontend):** revisión de secretos, variables de entorno y dependencias del frontend. Ver [2026-10-14-frontend.md](auditorias/2026-10-14-frontend.md).
- **14-oct-2026 (integral):** contrato, frontend y repositorio, sobre el commit `4101c70`. Semáforo 🟢 para la demo en testnet y 🔴 para mainnet. Se verificó que el ejecutable desplegado es el Wasm `9bc704149bbfb80f2b54c5f6243cdf69867ca9b92420997b7d599714b629aaf2`, compilado de este código. Los hallazgos del frontend F-01 a F-05, R-01 y R-02 se corrigieron después; I-05, I-06 e I-15 quedaron documentados abajo. Ver [2026-10-14-integral.md](auditorias/2026-10-14-integral.md).

**Abiertos, bloquean mainnet:**
- **A-03:** `freeze_upgrades` depende de que el ejecutable vigente sea este código.
- **A-04:** `upgrade` no tiene retraso.
- **M-06:** un verificador comprometido puede ocupar las huellas que quedaron libres (por ejemplo, las de un verificador dado de baja), cobrar con ellas donde lo aceptan y dejar a la persona real fuera de los demás programas.

M-05 (vinculación entre programas) queda como limitación conocida.

## Seguridad (lo que el contrato garantiza)

Cubierto por 33 pruebas en [`contracts/uno/src/test.rs`](../contracts/uno/src/test.rs):

- Una misma persona (huella) no puede registrarse dos veces mientras su credencial esté vigente.
- Nadie cobra dos veces en el mismo programa, ni siquiera tras reemitir su credencial.
- Nadie cobra con una llave que no es la suya (firma Ed25519).
- Un reclamo firmado no se puede desviar a otra cuenta ni reutilizar en otro programa, y caduca en un máximo de ~1 día.
- Cada programa elige en qué verificadores confía; un verificador comprometido no puede vaciar programas ajenos, aunque sí puede sacar de ellos a personas reales (M-06, abierto).
- Solo se aceptan tokens que el admin puso en la lista blanca. **El contrato no verifica el clawback ni las comisiones** (ver las reglas abajo).
- Si al crear un programa el contrato recibe menos dinero del pedido, el programa no se crea.
- Una credencial revocada por el admin por fraude no la puede reactivar un verificador.
- Cada función protegida exige la firma correcta; hay pruebas que lo verifican.
- Las credenciales revocadas y las de verificadores dados de baja no cobran, ni siquiera si el verificador vuelve a darse de alta.
- Los montos se validan contra desbordamientos y el sobrante regresa a la organización.

## Reglas de operación

- **Tokens:** solo se aprueban tokens sin clawback (revisar las banderas `AUTH_CLAWBACK_ENABLED` y `AUTH_REVOCABLE` del emisor) y sin comisiones de transferencia. Todos los programas del mismo token comparten fondo, así que un token así puede hacer que un programa gaste el dinero de otro (M-02). El emisor de MXNDEMO no tiene ninguna de esas banderas activas.
- **Migraciones:** todo upgrade que cambie la forma de los datos guardados necesita una migración y subir `VERSION` (ver [Upgrade](#upgrade-solo-testnet-y-piloto)).

## Limitaciones conocidas

- I-12: dar de baja a un verificador invalida para siempre todas las credenciales que emitió, aunque después se le vuelva a dar de alta. Toda su gente tiene que volver a registrarse en persona. No existe una "pausa" temporal.
- I-05: la lista de verificadores de un programa se fija al crearlo y no se puede cambiar. Para confiar en un verificador nuevo hay que cerrar el programa y crear otro. El contrato tampoco rechaza verificadores repetidos en la lista (no causa daño, solo ocupa lugar del máximo de 10).
- I-06: `disallow_token` solo impide crear programas **nuevos** con ese token. Los programas que ya están abiertos siguen pagando y se pueden cerrar con normalidad.
- I-15: la organización puede cerrar su programa en cualquier momento, incluso si hay personas con un reclamo ya firmado que todavía no se procesa; esos reclamos fallan con `ProgramClosed`. Es una decisión de diseño del piloto. Para producción se evaluará una fecha mínima de cierre fijada al crear el programa o un aviso con tiempo de espera.
- El secreto del HMAC es el dato más sensible del sistema: vive solo en el backend y **nunca** se sube al repo.
- M-05: la misma huella y la misma llave del celular se usan en todos los programas, así que con datos públicos se puede ligar la participación de una persona entre programas.
- El admin y los verificadores son roles de confianza: antes de mainnet el admin debe ser una cuenta multifirma.
- La firma del titular es Ed25519 (clásica). Está aislada en `verificar_firma_titular()` para cambiarla a una firma post-cuántica (ver ADR-001, pendiente).

## Documentación

- [Semana 1 — Problem Brief](semana1/ProblemBrief.md)
- [Semana 2 — Product Blueprint](semana2/ProductBlueprint.md)
- [Semana 3 — Documentación del frontend](semana3/Documentacion.md)
- [Roadmap](../ROADMAP.md)
