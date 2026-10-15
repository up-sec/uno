# Uno

Credencial de unicidad sobre Stellar: las organizaciones que reparten apoyos pagan **una sola vez a cada persona real**, sin guardar su INE ni su CURP.

- [Contrato, seguridad y auditorías](docs/contrato.md)
- [Documentación del frontend (Entregable 3)](docs/semana3/Documentacion.md)
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

`.env.local` solo lleva variables públicas `NEXT_PUBLIC_` (red, RPC y Contract IDs) y no se versiona. Nunca pongas llaves ni secretos ahí.

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
