# Entregable 4 — MVP funcional

**Uno**: credencial de unicidad sobre Stellar. Las organizaciones que reparten apoyos pagan una sola vez a cada persona real, sin guardar su INE ni su CURP.

Semana 4 (12–19 de octubre de 2026). Esta semana el flujo quedó completo en testnet: Punto Uno registra, el beneficiario cobra desde su celular sin XLM y el contrato rechaza el segundo cobro.

## Aprendizajes y ajustes priorizados

1. **Rotar llaves sin dudar.** Las semillas de las cuentas del verificador y del relayer quedaron expuestas en una captura. Las tratamos como comprometidas aunque fuera testnet:
   - creamos cuentas nuevas;
   - dimos de alta al verificador nuevo en el contrato y de baja al viejo;
   - fusionamos las cuentas viejas con las nuevas para que esas semillas ya no controlen fondos.

   Costo: el programa 0 dejó de servir, porque solo aceptaba al verificador viejo. Ahora los secretos viven solo en variables de servidor y revisamos que no lleguen al bundle ni a los commits.
2. **La auditoría encontró un Crítico en nuestro propio backend.** C-01: el relayer co-firmaba la transacción que creaba la cuenta del beneficiario revisando sus operaciones, pero no su secuencia. Una persona registrada podía poner la secuencia del relayer en el máximo y congelar su cuenta para siempre. Ahora el relayer solo firma si el hash coincide con un token que él emitió. El auditor intentó 25 variantes sin red, todas rechazadas, y la prueba de punta a punta pasó completa en testnet. Lección: validar "la forma" de lo que firmas no basta; firma solo lo que tú armaste.
3. **`tx_too_late` y las caducidades.** Toda transacción firmada lleva fecha de vencimiento: si tarda en llegar, la red la rechaza. Eso evita que una firma vieja se use después, cuando las condiciones ya cambiaron. Uno tiene dos caducidades: el reclamo del beneficiario dura 720 ledgers (~60 min) y la transacción de patrocinio 120 s. Ajuste: el servidor ya no firma transacciones caducadas.
4. **Un solo protagonista.** Contar Uno desde cuatro roles confundía. Elegimos a **la coordinadora** del programa: ella crea el programa, deposita, comparte el enlace y ve en vivo que nadie cobra dos veces. Punto Uno y el beneficiario aparecen en su historia.

## Riesgos y pendientes

- **La unicidad depende de la honestidad del verificador.** El contrato garantiza que una huella cobre una sola vez, pero no que la huella sea de una persona real: un Punto Uno deshonesto podría registrar CURP inventadas que sí cumplen el formato. Hoy lo acotan la lista de verificadores que acepta cada programa y la revocación por verificador. **Siguiente paso:** validar contra la CURP biométrica (RENAPO), para que la CURP corresponda a la persona que está enfrente.
- **A-01 mitigado, no cerrado.** `/api/registro` tiene un límite de 5 intentos por minuto por IP y un tope de registros, pero viven en memoria (en Vercel cada instancia cuenta por su lado) y el PIN es uno solo para todos los operadores. Para cerrarlo hacen falta contadores en una base de datos o KV compartida y credenciales por operador con bitácora y cuota.
- **La llave del beneficiario vive en el navegador (M-03).** Se guarda en `localStorage`. Un XSS o una dependencia comprometida podría leerla; quien robe el celular desbloqueado puede cobrar por la persona; Safari la borra tras 7 días sin uso. Plan: CSP, aislar la página, cifrar la llave con un PIN local y después usar llaves no exportables o passkeys.
- **Vinculación entre programas (M-05; M-04 en la auditoría del backend).** No hay datos personales en la cadena, pero la llave es también la cuenta que recibe el dinero, así que los cobros de una persona quedan ligados entre sí. Se resuelve con pruebas de conocimiento cero (ZK) y nulificadores por programa; las disponibles hoy en Stellar no son post-cuánticas, así que queda para después del MVP.
- **N-05: una sola cuenta de relayer.** Patrocina y cobra con la misma secuencia: con muchos cobros simultáneos habrá reintentos. Antes de un piloto se separa en dos cuentas.
- **Costo del relayer.** Medido en la prueba de hoy: el patrocinio costó 0.00004 XLM de comisión más **1.5 XLM de reservas** que quedan apartadas mientras exista la cuenta, y el cobro 0.049 XLM. El registro (0.18 XLM) lo paga el verificador. A escala, las reservas dominan: 1,000 beneficiarios ≈ 1,500 XLM inmovilizados. Lo acotan `MAX_SPONSORED` y un patrocinio por llave; en mainnet el patrocinio pasará al registro en Punto Uno.
- **Todo está en testnet.** El token es MXNDEMO, un activo de prueba sin valor, y el contrato todavía se puede actualizar (`freeze_upgrades` pendiente). Nada de esto es dinero real.

## Plan de validación

Estas tres hipótesis se fijan por primera vez en este entregable: los documentos anteriores tenían la hipótesis general del Problem Brief y los supuestos S1–S3, pero no estas métricas.

**Qué está comprobado, qué observado y qué creemos:**

- **Comprobado** (verificable en la cadena o con pruebas):
  - el flujo completo funciona en testnet: registro, cuenta patrocinada, cobro y rechazo del segundo cobro con `AlreadyClaimed` (hashes abajo);
  - el contrato pasa 33/33 pruebas;
  - en la cadena no hay CURP ni nombres.
- **Observado** (experiencia, no medición): al operar puntos de registro de World ID en CDMX (2022–2025), la mayoría de las personas desconfiaba del escaneo de iris; de ahí la verificación presencial sin biometría almacenada.
- **Creído** (todavía sin datos): las tres hipótesis de abajo. **No hemos medido tiempos con usuarios** ni hablado con coordinadoras sobre esta versión.

### H1 — Coordinadoras

- **Creemos que** al menos 4 de 5 coordinadoras de programas de apoyo usarían Uno para su siguiente reparto.
- **Porque** hoy pierden dinero con cobros duplicados y cargan con el riesgo de guardar copias de INE; Uno les quita ambas cosas sin cambiar cómo reparten.
- **Lo sabremos si** en 5 entrevistas, después de ver la demo y con un caso real de duplicados de su propio programa, 4 dicen que lo usarían en el próximo ciclo y aceptan hacer una prueba.

### H2 — Beneficiarios

- **Creemos que** una persona ya registrada cobra su apoyo en menos de 2 minutos, sin ayuda.
- **Porque** cobrar es abrir un enlace y tocar "Cobrar": no necesita wallet, XLM ni crear una cuenta, ya que el relayer paga y patrocina.
- **Lo sabremos si** en una prueba con 5 a 10 personas, desde que abren el enlace hasta ver "Cobraste tu apoyo", al menos 8 de cada 10 lo logran en menos de 2 minutos sin que nadie las guíe. Lo cronometramos y anotamos dónde se atoran.

### H3 — Registro en Punto Uno

- **Creemos que** registrar a una persona en Punto Uno toma menos de 5 minutos.
- **Porque** el operador solo captura la CURP y escanea el QR del celular; la huella y la emisión las hace el servidor en una transacción (unos 5 segundos en testnet).
- **Lo sabremos si** en 10 registros simulados con operadores que no son el equipo, la mediana es menor a 5 minutos desde que la persona llega hasta que ve su credencial emitida, sin errores de captura.

## Enlaces verificables

- **App:** https://uno-jet-sigma.vercel.app
- **Repositorio:** https://github.com/up-sec/uno
- **Contrato Uno v1.1 (testnet):** [CCPJ3LQOWC3NAJYV77FO74HKELG7YXJ4ANMSALXKHGIKAJJ6FXFQDMQQ](https://stellar.expert/explorer/testnet/contract/CCPJ3LQOWC3NAJYV77FO74HKELG7YXJ4ANMSALXKHGIKAJJ6FXFQDMQQ)
- **Prueba de punta a punta del 19 de octubre de 2026** (programa 2, beneficiario `GDB54XGMWNXCVDI2NOZQE46BT52DT5GIXLGEGABDUGMK7BBT3D6FORCU`):
  - Registro (`issue`, firmado por verificador2): [bcf1d74e361c127057702899e2454ec01235abf3cc4c0b4c992d609547ea5c1c](https://stellar.expert/explorer/testnet/tx/bcf1d74e361c127057702899e2454ec01235abf3cc4c0b4c992d609547ea5c1c)
  - Cuenta patrocinada (4 operaciones, relayer2): [e373a7b2212782e2ff4f9039d14e1f52e45fd0da1a137c4a4a8b235c7ae23dae](https://stellar.expert/explorer/testnet/tx/e373a7b2212782e2ff4f9039d14e1f52e45fd0da1a137c4a4a8b235c7ae23dae)
  - Cobro (`claim`, relayer2): [c9454cdc2149a10ef661b40986fae3582a4ff666be357f0e8330dda60b90c5c4](https://stellar.expert/explorer/testnet/tx/c9454cdc2149a10ef661b40986fae3582a4ff666be357f0e8330dda60b90c5c4)
  - Segundo cobro: rechazado en la simulación con `AlreadyClaimed`, así que no se envió ninguna transacción ni existe un hash.
- **Auditoría del backend:** [docs/auditorias/2026-10-19-backend.md](../auditorias/2026-10-19-backend.md)
- **Video:** (pendiente)
