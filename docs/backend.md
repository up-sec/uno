# Backend: Punto Uno, beneficiario y relayer

Las rutas de servidor viven en `frontend/src/app/api/` y los módulos con secretos en `frontend/src/server/`. Todos esos módulos importan `"server-only"`: si un componente del navegador los importa, la compilación falla.

## Flujo

1. **Beneficiario** (`/beneficiario?programa=N`): el navegador genera una llave Ed25519 con `Keypair.random()` y la guarda en `localStorage`. Esa llave es a la vez la credencial del celular y la cuenta G… que recibe el dinero. Solo se muestra la llave pública, en texto y en QR.
2. **Punto Uno** (`/punto-uno` → `POST /api/registro`): el operador escribe el PIN, la CURP y la llave pública. El servidor:
   - valida el formato de la CURP y su dígito verificador;
   - calcula `huella = HMAC-SHA256(UNO_HMAC_SECRET, CURP normalizada)` y descarta la CURP;
   - simula `issue(verifier, huella, holder)`, firma con `VERIFIER_SECRET` y envía.

   Devuelve solo `{ hash }`.
3. **Cobro** (botón "Cobrar" → `POST /api/cobro`): el navegador pide al contrato `claim_message(programa, expires, destino)` mediante una simulación y lo firma de forma local. La vigencia es de 720 ledgers, unos 60 minutos. Con ese reclamo firmado:
   - Si la cuenta no existe, el relayer arma `begin_sponsoring_future_reserves → create_account(0) → change_trust MXNDEMO → end_sponsoring_future_reserves`. El navegador revisa la transacción operación por operación y la co-firma. El servidor comprueba que sea exactamente la esperada, la firma y la envía.
   - Después, el relayer simula `claim` y, solo si la simulación pasa, lo envía como fuente de la transacción y paga la comisión.

## Reglas de seguridad

- **Secretos**: `UNO_HMAC_SECRET`, `VERIFIER_SECRET`, `RELAYER_SECRET` y `PUNTO_UNO_PIN` solo existen como variables de servidor. Si alguna aparece también como `NEXT_PUBLIC_*`, el servidor se niega a arrancar. `PUNTO_UNO_PIN` debe tener al menos 16 caracteres y `UNO_HMAC_SECRET` al menos 32. La validación ocurre al arrancar (`src/instrumentation.ts`), no al compilar, y los mensajes de error nombran la variable sin mostrar su valor.
- **Datos personales**: la CURP no se guarda ni se registra en logs, y nunca llega a la cadena.
- **Logs**: no se registran cuerpos de peticiones, CURP, huellas, firmas ni mensajes crudos del RPC, porque una simulación fallida trae los argumentos de la llamada. Ante un error inesperado solo se registra su tipo.
- **El relayer no decide nada**: el programa y el destino salen del reclamo firmado. Antes de gastar, el servidor verifica la firma contra `claim_message` del propio contrato. Solo patrocina la cuenta de la llave que firmó, y solo cuando el destino es esa misma cuenta.
- **Límites contra abuso en `/api/cobro`**:
  - `ALLOWED_PROGRAMS`: solo esos programas (por defecto, `0`).
  - Antes de patrocinar se simula `claim`. Si la persona no está registrada, ya cobró, el programa está cerrado o no acepta a su verificador, no se crea nada.
  - Una creación por llave: se comprueba **en cadena** que la cuenta no exista.
  - `MAX_SPONSORED` (por defecto 25): tope global de cuentas patrocinadas. Se cuenta en cadena como `num_sponsoring` del relayer dividido entre 3 reservas por cuenta. Si el relayer patrocinara otra cosa, el conteo sale más alto, nunca más bajo.

## Limitaciones conocidas

- **Se puede drenar XLM del relayer.** Cada cuenta patrocinada aparta 3 reservas base (unos 1.5 XLM) y cada transacción cuesta una comisión. Una persona registrada de verdad puede generar llaves nuevas y pedir que la registren otra vez, por ejemplo después de una revocación. Además, cualquiera puede mandar peticiones que el relayer simula sin costo. El tope `MAX_SPONSORED` limita la pérdida máxima a unos `MAX_SPONSORED × 1.5 XLM` más comisiones, pero no la evita. **En mainnet el patrocinio se moverá al registro en Punto Uno**: la cuenta se crea cuando un verificador ya comprobó a la persona en persona, y `/api/cobro` solo envía `claim`.
- **El registro en memoria no es confiable en Vercel.** `/api/cobro` guarda en memoria las cuentas que se están creando, pero en Vercel cada instancia tiene su propia memoria y puede reiniciarse en cualquier momento. Ese registro solo evita envíos duplicados simultáneos dentro de una misma instancia. **La verificación que vale es la de la cadena**: que la cuenta no exista y el conteo de `num_sponsoring`.
- **Carreras de secuencia**: si llegan dos cobros al mismo tiempo, comparten la cuenta del relayer y una de las dos transacciones puede fallar con `tx_bad_seq`. No se mueve dinero y la persona puede reintentar.
- **La llave vive en `localStorage`**: si la persona borra los datos del navegador, la pierde y tiene que pedir en Punto Uno una revocación y un registro nuevo. Cualquier script que corra en el mismo origen podría leerla. Para producción se planea un almacenamiento no exportable (WebCrypto o passkeys).
- **El PIN de Punto Uno es uno solo para todos los operadores** y no tiene bloqueo por intentos: solo una espera de 0.5 s tras cada fallo. Con 16 caracteres o más no se puede adivinar por fuerza bruta, pero no identifica a cada operador.

## Variables (`frontend/.env.local`)

| Variable | Qué es |
|---|---|
| `UNO_HMAC_SECRET` | Secreto del HMAC, de 32 caracteres o más (`openssl rand -hex 32`). Si cambia, cambian todas las huellas. |
| `VERIFIER_SECRET` | Llave S… de la cuenta verificadora (`GALQ…GSBL` en testnet). |
| `RELAYER_SECRET` | Llave S… del relayer (`GC4J…ZGEY` en testnet). |
| `PUNTO_UNO_PIN` | PIN del operador, de 16 caracteres o más. |
| `ALLOWED_PROGRAMS` | Programas atendidos, separados por comas. Por defecto, `0`. |
| `MAX_SPONSORED` | Tope de cuentas patrocinadas. Por defecto, `25`. |
