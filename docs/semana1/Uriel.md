# Propuesta individual

**Nombre:** Ángel Uriel Prado Zamora

**Usuario de GitHub:** [COMPLETAR: tu usuario de GitHub]

---

## El problema

> El problema en una sola frase, sin mencionar blockchain.

Las organizaciones que entregan dinero o beneficios a personas no pueden comprobar que cada beneficiario es una persona real y única sin pedirle y guardar datos sensibles (INE, CURP, rostro), que se filtran, se duplican y quedarán expuestos en el futuro.

## ¿Quién lo sufre?

> Quién tiene el problema y en qué situación lo vive.

- **Las organizaciones que reparten dinero** (fundaciones, programas de apoyo públicos y privados, empresas con promociones, plataformas que dan incentivos): pierden dinero con beneficiarios duplicados, fantasmas o bots, y cargan con el riesgo legal de custodiar datos sensibles.
- **Las personas beneficiarias**: entregan su identidad completa una y otra vez a cada organización, sin control sobre dónde queda, y con riesgo de que alguien la use para suplantarlas.

## ¿Cómo se resuelve hoy y qué cuesta?

> Cómo lo resuelven hoy las personas afectadas y qué les cuesta en dinero, tiempo o esfuerzo.

Cada organización arma su propio padrón: pide copia de INE, CURP, comprobante de domicilio y a veces una selfie; valida a mano o paga a un proveedor de verificación por cada alta, y solo puede detectar duplicados dentro de su propia base.

- **Dinero:** un pago por cada verificación, más las pérdidas por pagos duplicados. Aun cruzando la CURP con RENAPO, la ASF ha encontrado pagos a beneficiarios fallecidos, apoyos duplicados y miles de CURP repetidas en padrones de programas sociales.
- **Tiempo:** validación manual y días o semanas entre el registro y el pago.
- **Riesgo:** cada copia de una INE guardada es un punto de filtración. La alternativa más conocida, World, depende de escanear el iris y ha sido suspendida en varios países.

## ¿Por qué creo que blockchain podría aportar?

> Hipótesis personal, no certeza, apoyada en al menos un criterio de la Sesión 1: partes que no confían entre sí comparten un registro, histórico inalterable, o eliminar un intermediario que concentra la confianza.

Mi hipótesis se apoya en dos criterios de la Sesión 1:

1. **Varias partes que no confían entre sí necesitan compartir un registro:** muchas organizaciones distintas necesitan saber si una persona ya cobró o si su credencial sigue vigente, sin conocer su identidad y sin que una sola de ellas (o un proveedor) sea dueña de los datos de todos.
2. **Eliminar un intermediario que hoy concentra la confianza:** en lugar de que cada organización o proveedor guarde la identidad completa, la persona controla su credencial y en la blockchain solo quedan "sellos" de unicidad sin datos personales.

Además, como la identidad dura toda la vida, la credencial debería firmarse con criptografía post-cuántica: los datos que se roban hoy podrían descifrarse cuando existan computadoras cuánticas capaces de romper la criptografía actual.
