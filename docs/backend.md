# Backend: Punto Uno, beneficiario y relayer

Las rutas de servidor viven en `frontend/src/app/api/` y los módulos con secretos en `frontend/src/server/`. Todos esos módulos importan `"server-only"`: si un componente del navegador los importa, la compilación falla.

Auditoría: [docs/auditorias/2026-10-19-backend.md](auditorias/2026-10-19-backend.md). Al final del reporte está el estado de cada hallazgo después de las correcciones.

## Flujo

1. **Beneficiario** (`/beneficiario?programa=N`): el navegador genera una llave Ed25519 con `Keypair.random()` y la guarda en `localStorage`. Esa llave es a la vez la credencial del celular y la cuenta G… que recibe el dinero. Solo se muestra la llave pública, en texto y en QR.
2. **Punto Uno** (`/punto-uno` → `POST /api/registro`): el operador escribe el PIN, la CURP y la llave pública. El servidor:
   - valida el formato de la CURP y su dígito verificador;
   - calcula `huella = HMAC-SHA256(UNO_HMAC_SECRET, CURP normalizada)` y descarta la CURP;
   - simula `issue(verifier, huella, holder)`, firma con `VERIFIER_SECRET` y envía.

   Devuelve solo `{ hash }`.
3. **Cobro** (botón "Cobrar" → `POST /api/cobro`): el navegador pide al contrato `claim_message(programa, expires, destino)` mediante una simulación y lo firma de forma local, siempre como 128 caracteres hex. La vigencia es de 720 ledgers, unos 60 minutos. Con ese reclamo firmado:
   - **Si la cuenta no existe**:
     - `preparar-cuenta`: el servidor arma `begin_sponsoring_future_reserves → create_account(0) → change_trust MXNDEMO → end_sponsoring_future_reserves`. Usa la siguiente secuencia del relayer, una comisión fija, una caducidad de 120 s y ninguna precondición extra. Devuelve la transacción y un **token** = `HMAC(K, hash)`.
     - El navegador revisa la transacción operación por operación y la co-firma.
     - `crear-cuenta`: el servidor solo firma si el hash de lo que recibe coincide con el token, es decir, si es **exactamente** la transacción que él armó (auditoría C-01). Además revisa, como respaldo, la forma, las precondiciones, la comisión, la única firma y la secuencia.
   - Después, el relayer simula `claim` y, solo si la simulación pasa, lo envía como fuente de la transacción y paga la comisión.

## Reglas de seguridad

- **Secretos**: `UNO_HMAC_SECRET`, `VERIFIER_SECRET`, `RELAYER_SECRET` y `PUNTO_UNO_PIN` solo existen como variables de servidor. Si alguna aparece también como `NEXT_PUBLIC_*`, el servidor se niega a arrancar. `PUNTO_UNO_PIN` debe tener al menos 16 caracteres y `UNO_HMAC_SECRET` al menos 32. La validación ocurre al arrancar (`src/instrumentation.ts`), no al compilar, y los mensajes de error nombran la variable sin mostrar su valor.
- **Token del patrocinio**: la llave `K` se deriva de `RELAYER_SECRET` con una etiqueta propia (`uno-sponsorship-token-v1`). No es `UNO_HMAC_SECRET` y es la misma en todas las instancias, así que no hace falta guardar estado.
- **Datos personales**: la CURP no se guarda ni se registra en logs, y nunca llega a la cadena.
- **Logs**: no se registran cuerpos de peticiones, CURP, huellas, firmas ni mensajes crudos del RPC, porque una simulación fallida trae los argumentos de la llamada. Ante un error inesperado solo se registra su tipo.
- **El relayer no decide nada**: el programa y el destino salen del reclamo firmado. El servidor verifica la firma **antes de cualquier llamada al RPC**, contra `claim_message` armado localmente (`lib/claimMessage.ts`, idéntico byte por byte al del contrato). Solo patrocina la cuenta de la llave que firmó, y solo cuando el destino es esa misma cuenta.
- **Entrada**: solo `application/json`, como máximo 4096 bytes (se corta al leer) y `Origin` del propio sitio.
- **Límites contra abuso en `/api/registro`**:
  - 5 peticiones por minuto por IP, contando también los PIN incorrectos.
  - `MAX_REGISTROS` (por defecto 20): tope de credenciales emitidas.
- **Límites contra abuso en `/api/cobro`**:
  - `ALLOWED_PROGRAMS`: solo esos programas (por defecto, `0`).
  - Antes de patrocinar se simula `claim` (*fail-closed*). Solo se continúa si falla exactamente por falta de trustline del destino; cualquier otro resultado detiene el patrocinio.
  - Una creación por llave: se comprueba **en cadena** que la cuenta no exista.
  - `MAX_SPONSORED` (por defecto 25): tope global de cuentas patrocinadas. Se cuenta en cadena como `num_sponsoring` del relayer dividido entre 3 reservas por cuenta. Si el relayer patrocinara otra cosa, el conteo sale más alto, nunca más bajo.

## Limitaciones conocidas

- **A-01 queda mitigado, no cerrado.** Ya están el límite de 5 peticiones por minuto por IP (que cuenta los PIN incorrectos) y el tope `MAX_REGISTROS`. Pero:
  - viven en memoria: cada instancia de Vercel lleva su propio contador y se reinicia en cada arranque en frío, así que el límite real es "por instancia";
  - el PIN es uno solo para todos los operadores: no identifica a nadie, y quien lo tenga puede emitir credenciales con CURP sintéticas válidas;
  - la CURP solo se valida por formato y dígito verificador.

  **Para cerrarlo, antes de un piloto**:
  1. Contadores en una **base de datos o KV compartida**: límite por IP, cuota de registros, patrocinios por llave e `inFlight`.
  2. **Credenciales por operador** (usuario y contraseña o passkey) en lugar del PIN único, con una bitácora sin datos personales (`{operador, hash de tx, hora}`) y una cuota por operador y por día.
- **IP del cliente** (auditoría N-03). En Vercel (`VERCEL=1`) se usa `x-vercel-forwarded-for`. Según la [documentación de Vercel](https://vercel.com/docs/headers/request-headers), la plataforma sobrescribe `x-forwarded-for` para evitar spoofing, y `x-vercel-forwarded-for` no la puede pisar un proxy puesto delante. Fuera de Vercel no se confía en ninguna cabecera y el límite es **global** (5 por minuto para todos). Si en Vercel se desactiva "Enable access to System Environment Variables", `VERCEL` no existe y también aplica el límite global. La IP se valida con `net.isIP`. Con más de 10 000 claves se desalojan las más viejas.
- **Se puede drenar XLM del relayer.** Cada cuenta patrocinada aparta 3 reservas base (unos 1.5 XLM) y cada transacción cuesta una comisión. Una persona registrada de verdad puede generar llaves nuevas y pedir que la registren otra vez, por ejemplo después de una revocación. El tope `MAX_SPONSORED` limita la pérdida máxima a unos `MAX_SPONSORED × 1.5 XLM` más comisiones, pero no la evita. **En mainnet el patrocinio se moverá al registro en Punto Uno**: la cuenta se crea cuando un verificador ya comprobó a la persona en persona, y `/api/cobro` solo envía `claim`.
- **El registro en memoria de `/api/cobro` no es confiable en Vercel.** `inFlight` vive en la memoria de cada instancia y solo evita envíos duplicados simultáneos dentro de una misma instancia. **La verificación que vale es la de la cadena**: que la cuenta no exista y el conteo de `num_sponsoring`.
- **B-03: `MAX_SPONSORED` no es atómico.** El tope se lee y luego se actúa. Con N peticiones simultáneas de N llaves registradas distintas se puede rebasar por algunas cuentas (≈1.5 XLM cada una). Las colisiones de secuencia del relayer lo acotan en parte, pero no es un control. Para un piloto: contador atómico en KV o una cola de un solo trabajador.
- **Un patrocinio por llave** (auditoría N-02): un contador en memoria rechaza un segundo patrocinio para la misma llave (`AlreadySponsored`) y corta el bucle "crear la cuenta → fusionarla → pedir otra". Como los demás contadores, no es confiable entre instancias.
- **N-05: el relayer usa una sola cuenta para patrocinar y para cobrar.** Si llegan dos peticiones al mismo tiempo, comparten la secuencia del relayer. Un `claim` puede fallar con `tx_bad_seq`. Cualquier `cobrar` que entre entre `preparar-cuenta` y `crear-cuenta` deja vieja la transacción de patrocinio pendiente (`StaleSequence`, 409). No se mueve dinero y la persona puede reintentar, pero con muchas personas cobrando a la vez será frecuente. **Antes de un piloto el relayer se separa en dos cuentas**:
  - una que solo patrocina, con saldo pequeño y recargas;
  - otra que solo envía `claim`.

  Esto también limita el daño de cualquier incidente futuro con una de las dos llaves.
- **M-03: la llave del beneficiario vive en `localStorage`.**
  - Cualquier script que corra en el mismo origen la puede leer: un XSS futuro o una dependencia comprometida, por ejemplo del wallet kit, que se carga en el mismo sitio. No hay CSP todavía.
  - Si roban el celular desbloqueado, el ladrón cobra en los programas abiertos que la persona no ha cobrado. Mientras no exista una ruta de revocación, hay que revocar con la CLI.
  - Safari/iOS borra ese almacenamiento tras 7 días sin uso, salvo que la página esté agregada a la pantalla de inicio. Si borran los datos, la persona pierde la llave y tiene que pedir en Punto Uno revocación y un registro nuevo.
  - Plan: CSP y cabeceras, `/beneficiario` en un origen sin wallet kit, llave cifrada con un PIN local y, a mediano plazo, una llave no exportable o passkeys (ADR-001).
- **M-04: vinculación de personas entre programas.** No hay datos personales en la cadena (I7 se cumple), pero:
  - la llave es también la cuenta destino, y `CredIssued` liga la huella con esa cuenta;
  - `ClaimPaid` muestra cada programa que cobró;
  - la huella es la misma en cada reemisión;
  - Horizon muestra al relayer como patrocinador de todas las cuentas: una lista pública de beneficiarios.

  Con un dato externo (por ejemplo, un depósito en una casa de cambio con KYC) se puede re-identificar a la persona. Plan a mediano plazo: un destino distinto por programa, quitar `holder` de `CredIssued` y nulificadores por programa.
- **B-04: el script `scripts/e2e-cobro.mjs`.**
  - Manda el PIN real a `E2E_BASE_URL`, que puede ser cualquier URL.
  - Cada corrida crea una credencial sintética permanente y **cobra de verdad** en el primer programa de `ALLOWED_PROGRAMS`.
  - Usa la passphrase de testnet fija.

  Úsalo solo contra `localhost`, en testnet y con un programa de pruebas.

## Variables (`frontend/.env.local`)

| Variable | Qué es |
|---|---|
| `UNO_HMAC_SECRET` | Secreto del HMAC, de 32 caracteres o más (`openssl rand -hex 32`). Si cambia, cambian todas las huellas. |
| `VERIFIER_SECRET` | Llave S… de la cuenta verificadora (`verificador2`, `GDBF…M674` en testnet). |
| `RELAYER_SECRET` | Llave S… del relayer (`relayer2`, `GBOU…CLAB` en testnet). También deriva la llave del token de patrocinio. |
| `PUNTO_UNO_PIN` | PIN del operador, de 16 caracteres o más. |
| `ALLOWED_PROGRAMS` | Programas atendidos, separados por comas. Por defecto, `0`. |
| `MAX_SPONSORED` | Tope de cuentas patrocinadas. Por defecto, `25`. |
| `MAX_REGISTROS` | Tope de credenciales emitidas por instancia. Por defecto, `20`. |
