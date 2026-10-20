# Uno

Credencial de unicidad sobre Stellar: las organizaciones que reparten apoyos pagan **una sola vez a cada persona real**, sin guardar su INE ni su CURP.

## Cómo funciona

1. **Registro.** Un Punto Uno (un módulo físico de registro, parecido a un módulo del INE, donde un verificador autorizado comprueba en persona que eres un ser humano real y que la CURP es tuya) verifica a la persona. En Stellar solo queda una huella de unicidad (un código que se calcula a partir de la CURP y del que no se puede recuperar la CURP), nunca la CURP.
2. **Programa.** La organización crea un programa y deposita en el contrato (un programa en Stellar que guarda el dinero y lo reparte con reglas públicas que nadie puede cambiar) el total: monto por persona × cupo (cuántas personas pueden cobrar).
3. **Cobro.** La persona firma desde su celular (con un toque confirma que es ella quien cobra: su celular guarda una llave digital única, como una firma electrónica, que nunca sale del teléfono). El contrato paga una sola vez por persona y por programa.

- [Contrato, seguridad y auditorías](docs/contrato.md)
- [Documentación del frontend (Entregable 3)](docs/semana3/Documentacion.md)
- [Backend: Punto Uno, beneficiario y relayer](docs/backend.md)
- [Roadmap](ROADMAP.md)

## Requisitos

- **Rust** (estable) con el target de Soroban: `rustup target add wasm32v1-none`.
- **Stellar CLI** 28 o más reciente (probado con 28.1.0).
- **Node.js** 20.9 o más reciente, con npm (probado con Node 24).
- **Freighter** (extensión del navegador) configurada en **Testnet**, con una cuenta fondeada con Friendbot y trustline al activo `MXNDEMO` (emisor `GDY7S3CSXCBCFAMJH6FNBDFD2GKLJERK4C27RM3QGD2GQ4PHYTVD3OGL`) para crear programas.

## Instalación

```powershell
git clone https://github.com/up-sec/uno.git
cd uno

# Frontend
cd frontend
npm install
Copy-Item .env.example .env.local
```

`.env.local` no se versiona. Lleva dos grupos de variables (ver `.env.example`):

- **Públicas** (`NEXT_PUBLIC_`): red, RPC y Contract IDs. Terminan en el JavaScript del navegador.
- **De servidor** (`UNO_HMAC_SECRET`, `VERIFIER_SECRET`, `RELAYER_SECRET`, `PUNTO_UNO_PIN`, `ALLOWED_PROGRAMS`, `MAX_SPONSORED`): solo las leen las rutas `/api`. **Nunca** con prefijo `NEXT_PUBLIC_`. Si falta una o no es válida, el servidor no arranca. Detalles en [docs/backend.md](docs/backend.md).

**Escaneo de secretos antes de cada push.** El hook `.githooks/pre-push` corre [gitleaks](https://github.com/gitleaks/gitleaks) (8.30 o más reciente) con `.gitleaks.toml` (reglas por defecto + semillas secretas de Stellar `S...`) sobre los commits que se van a subir, y bloquea el push si encuentra algo o si gitleaks no está instalado. Actívalo una vez por clon, desde la raíz del repo:

```powershell
git config core.hooksPath .githooks
```

## Cómo correrlo

**Frontend** (desde `frontend/`):

```powershell
npm run dev
```

Abre http://localhost:3000.

**Contrato** (desde la raíz del repositorio):

```powershell
cargo test
stellar contract build
```
