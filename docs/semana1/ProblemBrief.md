# Problem Brief

## Decisión del problema

### Problema elegido

> El problema ganador en una frase, sin mencionar blockchain, y quién lo propuso.

Las organizaciones que entregan dinero o beneficios a personas no pueden comprobar que cada beneficiario es una persona real y única sin pedir y guardar datos sensibles (INE, CURP, rostro) que se filtran, se duplican y quedarán expuestos en el futuro.

**Propuesto por:** Ángel Uriel Prado Zamora ([`Uriel.md`](Uriel.md)).

### Por qué elegimos este

> Qué inclinó al equipo por este problema frente a los demás, según los criterios de la Sesión 1.

- **Cumple los tres criterios de la Sesión 1:** muchas organizaciones que no comparten bases de datos necesitan saber lo mismo ("¿esta persona ya cobró?"); ese registro no debe poder alterarse; y hoy la confianza la concentra quien custodia los datos (cada organización o un proveedor de verificación).
- **Quien sufre el problema es quien adopta la solución:** la organización que pierde dinero por duplicados y carga el riesgo legal de custodiar datos sensibles es la misma que decide usar la herramienta.
- **Evidencia pública y reciente** de pagos duplicados, beneficiarios fantasma y robo de identidad en México (ver *Problema y evidencia*).
- **Ventaja del equipo:** experiencia directa operando registros de World ID en CDMX y formación en seguridad informática y criptografía.
- **Escala:** el mismo mecanismo sirve para programas sociales, fundaciones, ayuda en desastres, promociones e incentivos digitales, en cualquier país.

### Propuestas descartadas

> Cada propuesta considerada, quién la propuso y el motivo del descarte.

| Propuesta | Propuso | Motivo del descarte |
|---|---|---|
| Pagos por avance (escrow) para técnicos subcontratados en instalaciones | Uriel Prado | Quien retiene el dinero (integrador y subcontratista) no tiene incentivo para adoptarlo, y el cliente final no conoce la cadena. |
| Escrow para compraventa entre desconocidos / tandas digitales | Uriel Prado | Poca diferenciación: ya fueron resueltas por proyectos de generaciones anteriores. |
| Factoraje de facturas para PyMEs | Uriel Prado | Mercado con soluciones establecidas; la diferenciación dependía de integraciones con el SAT difíciles de demostrar en 5 semanas. |
| Credenciales verificables para técnicos que entran a domicilios | Uriel Prado | Adopción y rentabilidad difíciles en Latinoamérica: requiere que muchas empresas emisoras participen. |
| Alternativa privada al registro de líneas celulares con CURP | Uriel Prado | Choca con un marco regulatorio obligatorio; sirvió como detonante del enfoque de identidad con mínima divulgación de datos. |
| Trazabilidad de exportaciones (EUDR), créditos de carbono y cumplimiento REPSE | Uriel Prado | Lejos de la experiencia del equipo y con competencia de software establecida. |

### Cómo tomamos la decisión

> Cómo llegó el equipo al acuerdo: votación, consenso tras debate u otro.

El proyecto se desarrolla en modalidad individual. Cada propuesta pasó por seis filtros: (1) se entiende en 10 segundos, (2) cumple al menos un criterio de pertinencia de la Sesión 1, (3) quien sufre el problema es quien adopta la solución, (4) se puede demostrar funcionando en unas 3 semanas, (5) no repite proyectos de generaciones anteriores y (6) el equipo tiene una ventaja real en el tema. Esta fue la única que pasó los seis.

---

## Problem Brief

### Encabezado

> Nombre del proyecto y una frase que describa el problema. Extensión: breve.

**Uno**: las organizaciones no pueden pagar solo a personas reales y únicas sin guardar su identidad completa.

### Equipo y roles

> Integrantes con su usuario de GitHub, rol asumido por cada persona, responsable de las entregas y canal de coordinación interna. Extensión: breve.

| Integrante | Usuario de GitHub | Rol |
|---|---|---|
| Ángel Uriel Prado Zamora | `@[COMPLETAR]` | Producto, investigación, desarrollo (contrato, backend y frontend), seguridad y pitch. **Responsable de las entregas.** |

**Modalidad:** individual. **Canal de coordinación:** Discord del programa.

### Problema y evidencia

> Enunciado del problema en una frase, sin mencionar blockchain. Contexto, frecuencia y alcance. Evidencia mínima de que el problema existe: observación directa, experiencia propia, conversaciones o fuentes consultadas, con enlace o cita cuando aplique. Extensión: 150–300 palabras.

**Enunciado:** las organizaciones que reparten dinero no pueden asegurar que cada beneficiario sea una persona real y única sin pedir y guardar datos de identidad sensibles.

**Contexto, frecuencia y alcance:** en México, programas sociales, fundaciones, empresas con promociones y plataformas con incentivos dan de alta a miles de personas. El problema aparece en cada registro y en cada pago, y afecta a cualquier organización que entrega dinero a individuos.

**Evidencia:**

- **Duplicados y beneficiarios fantasma, aun con CURP:** la ASF encontró más de 10 mil CURP duplicadas en el Censo del Bienestar ([Serendipia](https://serendipia.digital/datos-y-mas/irregularidades-en-el-censo-de-bienestar-amlo/)); pagos por 48.7 millones de pesos a 13,730 beneficiarios de la pensión de adultos mayores después de su fallecimiento ([Infobae](https://www.infobae.com/mexico/2023/02/21/la-asf-detecto-depositos-duplicados-a-muertos-y-pagos-por-marcha-en-los-programas-sociales-de-amlo/)); y 28 millones por aclarar en Jóvenes Construyendo el Futuro por apoyos duplicados y depósitos a fallecidos ([La Razón](https://www.razon.com.mx/mexico/2022/02/20/asf-jovenes-construyendo-el-futuro-acumula-irregularidades-por-28-mdp/)).
- **Robo de identidad al alza:** la suplantación representa cerca del 40% de los fraudes financieros, con pérdidas de 14,500 millones de pesos en 2024 según la CONDUSEF ([Banca21](https://www.banca21mx.com/single-post/crece-en-84-el-robo-de-identidad-en-m%C3%A9xico-toma-en-cuenta-mecanismos-de-protecci%C3%B3n)); los intentos con deepfakes crecieron 484% en un año ([El Sol de México](https://oem.com.mx/elsoldemexico/finanzas/aumentan-fraudes-con-deepfakes-29177641)).
- **Custodiar datos es riesgoso:** durante el registro obligatorio de líneas con CURP se reportó una vulnerabilidad que expuso datos personales ([Expansión](https://expansion.mx/empresas/2026/04/24/registro-de-celulares-curp-evidencia-riesgo-usuarios)).
- **La alternativa biométrica genera rechazo:** Colombia ordenó el cierre de World y la eliminación de los registros de iris ([Mobile Time](https://mobiletime.la/noticias/17/10/2025/colombia-suspende-worldcoin/)).
- **Experiencia propia:** operé puntos de registro de World ID en CDMX (2022–2024). [COMPLETAR: 1–2 observaciones concretas de esa experiencia.]

### Usuario y actores

> Quién sufre el problema y qué necesita resolver. Cómo lo resuelve hoy y qué le cuesta en dinero, tiempo o esfuerzo. Demás actores que intervienen en el flujo, con el papel que cumple cada uno. Extensión: 150–300 palabras.

**Usuario principal:** la persona responsable de un programa que entrega dinero o beneficios; por ejemplo, la coordinadora de una fundación que reparte apoyos económicos a 2,000 personas. Necesita pagar solo a personas reales y únicas, rápido, y sin convertirse en guardiana de miles de copias de INE.

**Cómo lo resuelve hoy y qué le cuesta:** arma su propio padrón con copias de INE, CURP, comprobante de domicilio y a veces una selfie. Valida a mano o paga a un proveedor de verificación por cada alta, y solo puede detectar duplicados dentro de su propia base. Le cuesta dinero (verificaciones y pagos perdidos), tiempo (días de revisión) y riesgo legal, porque los datos biométricos son datos sensibles que exigen consentimiento expreso y protección reforzada.

**Usuario secundario:** el beneficiario, que entrega su identidad completa a cada organización y no sabe dónde queda.

**Actores del flujo:**

| Actor | Papel |
|---|---|
| Organización | Financia el programa, valida y paga |
| Beneficiario | Entrega sus datos y recibe el pago |
| Proveedor de verificación | Intermediario que revisa documentos y biometría por cada alta |
| RENAPO | Fuente oficial para validar la CURP |
| Banco o medio de pago | Intermediario que dispersa el dinero |
| Auditor o autoridad | Revisa que los pagos lleguen a quien cumple las reglas |
| Atacante | Se registra varias veces o suplanta a otra persona |

### Flujo actual de valor

> Recorrido paso a paso de cómo se mueve hoy el dinero, la información o el activo, desde el origen hasta el destino. Diagrama o secuencia numerada, con los intermediarios explícitos. Señalar si algún paso responde a una obligación normativa. Extensión: 150–300 palabras.

```
[1] Organización publica la convocatoria
        ↓
[2] Beneficiario envía INE, CURP, comprobante y selfie (formulario, WhatsApp o en persona)   ⚖️
        ↓
[3] Validación de documentos: organización o PROVEEDOR DE VERIFICACIÓN; consulta de CURP en RENAPO
        ↓
[4] La organización guarda el expediente en su base de datos, nube u hojas de cálculo          ⚖️
        ↓
[5] Búsqueda de duplicados: solo contra el padrón propio
        ↓
[6] Alta en el padrón de beneficiarios
        ↓
[7] Pago: BANCO, tarjeta, orden de pago o efectivo
        ↓
[8] Comprobación y auditoría del uso de los recursos                                         ⚖️
```

**Cómo se mueve el valor:** la *información* (la identidad del beneficiario) viaja del beneficiario a la organización y, muchas veces, a un proveedor de verificación, donde se queda guardada. El *dinero* viaja en sentido contrario: de la organización al banco y del banco al beneficiario, días o semanas después del alta. Cada organización repite el ciclo completo por su cuenta, con la misma persona.

**Intermediarios explícitos:** proveedor de verificación (paso 3), RENAPO (paso 3) y banco o medio de pago (paso 7).

**Pasos con obligación normativa (⚖️):**

- **Pasos 2 y 4:** recabar y guardar datos personales exige aviso de privacidad, y los datos biométricos, por ser sensibles, requieren consentimiento expreso y medidas de seguridad reforzadas (Ley Federal de Protección de Datos Personales en Posesión de los Particulares).
- **Paso 8:** los programas públicos deben cumplir sus reglas de operación y son auditados por la ASF; las donatarias autorizadas deben comprobar el destino de los recursos ante el SAT.

### Fricciones identificadas

> Puntos concretos donde el flujo falla, se encarece o se demora. Cada fricción indica en qué paso ocurre, qué la causa y a quién afecta. Extensión: 150–300 palabras.

| # | Paso | Fricción | Causa | A quién afecta |
|---|---|---|---|---|
| F1 | 2 | El beneficiario entrega su identidad completa a cada organización, una y otra vez | No existe una credencial reutilizable que la persona controle | Beneficiario |
| F2 | 3 | Documentos falsos y deepfakes pasan la validación | La verificación remota con selfie ya se puede engañar con IA | Organización y persona suplantada |
| F3 | 4 | Miles de copias de INE y selfies acumuladas en bases de datos | El modelo exige custodiar datos para poder auditar | Ambos: riesgo de filtración y de responsabilidad legal |
| F4 | 5 | Duplicados entre programas y personas registradas con identidades ajenas | Cada padrón es una isla; nadie ve el registro de los demás | Organización: pagos perdidos |
| F5 | 7 | Días o semanas entre el alta y el pago, con comisiones | Dispersión con varios intermediarios | Beneficiario |
| F6 | 4 y 8 | Los datos que se roban hoy podrían descifrarse en el futuro | La criptografía actual de curvas elípticas y RSA será vulnerable a computadoras cuánticas; NIST propone retirarla después de 2030 | Todos, a largo plazo |

### Oportunidad e hipótesis

> Oportunidad priorizada entre las fricciones identificadas, con el motivo de la elección. Hipótesis inicial de por qué blockchain podría mejorar ese punto, expresada en términos de qué cambiaría para el usuario. Extensión: 150–300 palabras.

**Oportunidad priorizada: F3 + F4** (custodia de datos y duplicados entre organizaciones). Las elegimos porque son las que generan pérdidas de dinero y riesgo legal, y porque ninguna organización puede resolverlas sola: aunque una mejore su propio padrón, sigue sin ver los duplicados de las demás y sigue guardando datos sensibles. Resolverlas, además, atenúa F1 y F6.

**Hipótesis:** si una persona se verifica **una sola vez** con un verificador autorizado y recibe una **credencial firmada con criptografía post-cuántica que ella controla en su celular**, y cada programa solo registra un **sello de unicidad sin datos personales** en un registro compartido en Stellar, entonces:

- **La organización** podrá pagar solo a personas reales y únicas sin recibir ni guardar INE ni biometría, y detectará intentos de cobro duplicado al instante.
- **El beneficiario** dejará de entregar su identidad a cada programa y recibirá su pago en minutos en la misma red.
- **Ambos** contarán con una credencial que seguirá siendo segura cuando la criptografía actual deje de serlo.

### Criterio de pertinencia

> Justificación de por qué el caso requiere un registro distribuido y no una base de datos tradicional o una integración entre sistemas existentes. Debe apoyarse en al menos uno de los criterios de la Sesión 1: varias partes que no confían entre sí necesitan compartir un mismo registro, el histórico no puede alterarse, o se elimina un intermediario que hoy concentra la confianza. Extensión: 150–300 palabras.

**¿Por qué no una base de datos tradicional?** Porque alguien tendría que ser su dueño. Si la administra una organización o un proveedor, ese actor se convierte en el nuevo intermediario que concentra la confianza y en el blanco más atractivo para una filtración: justo lo que queremos eliminar. Además, organizaciones públicas, privadas y de distintos países no van a confiar en la base de un competidor ni a darle acceso a su padrón.

**¿Por qué no integrar los sistemas existentes?** Conectar los padrones entre sí obliga a compartir datos personales entre todos y multiplica los puntos de filtración. Cada organización seguiría guardando la identidad completa.

**Criterios de la Sesión 1 que cumple:**

1. **Varias partes que no confían entre sí comparten un registro:** organizaciones distintas consultan un mismo registro de sellos usados y credenciales revocadas, sin ver quién es la persona.
2. **El histórico no puede alterarse:** un sello usado no puede borrarse para cobrar dos veces, y cada revocación queda visible para todos.
3. **Se elimina el intermediario que concentra la confianza:** nadie guarda la base de identidades; la persona controla su credencial y la red solo verifica firmas y sellos.

**¿Por qué Stellar?** Pagos rápidos y de bajo costo al beneficiario en el mismo flujo; contratos en Soroban para el registro de sellos; hashes como SHA-256, que se consideran seguros frente a computadoras cuánticas; y un Plan de Preparación Cuántica publicado en junio de 2026 que agrega verificación de firmas post-cuánticas a Soroban ([Crypto Briefing](https://cryptobriefing.com/stellar-quantum-preparedness-roadmap/)).

### Supuestos y riesgos

> Dos o tres supuestos que tendrían que ser ciertos para que la hipótesis funcione, y qué podría invalidarla. Extensión: 150–300 palabras.

| Supuesto | Qué podría invalidarlo | Cómo lo mitigamos |
|---|---|---|
| **S1.** Las organizaciones aceptarán una credencial emitida por un verificador externo en lugar de hacer su propio expediente | Regulaciones que obliguen a cada organización a conservar copia de la identificación, o desconfianza en los verificadores | Empezar con programas privados y promociones, donde no existe esa obligación, y documentar el respaldo de cada verificador |
| **S2.** Una red de verificadores presenciales puede operar a bajo costo y sin emitir credenciales falsas | Verificadores coludidos que emitan credenciales para personas inexistentes | Registro público de qué verificador emitió cada credencial, revocación masiva y reputación visible por verificador |
| **S3.** La verificación de firmas post-cuánticas en Soroban es técnicamente viable y de bajo costo | Que las funciones nativas aún no estén en testnet y la verificación dentro del contrato exceda los límites de cómputo | Plan B: firmas basadas en hash (tipo Lamport o WOTS) verificadas con SHA-256, ya disponible en Soroban, o modo híbrido con verificación fuera de la cadena |

**Riesgo adicional:** la privacidad total entre programas (que nadie pueda ligar que una persona usó dos programas) requiere pruebas de conocimiento cero post-cuánticas que todavía no existen en Stellar. Queda como evolución posterior al MVP.
