# Plan 0.20

## Finanzas (sesión de Finanzas)

**Hecho:**
- Rendimiento (361beb9). La causa: JavaScriptCore va sin JIT dentro de la app y cada revisión (cualquier escritura de
  cualquier apartado o sincronización) recargaba el documento en JS, olvidaba las cuatro pestañas, repetía
  prepararFinanzas y, en cada alta, Swift decodificaba todo `financePro` en el hilo principal para contar la «vez».
  Ahora el motor solo carga si cambian los bytes de las claves de Finanzas, compara campo a campo lo que llega con lo
  que ya tiene, las escrituras se quedan en el motor (incrementales) y la `vez` la cuenta el puente. Medidas: mantener
  pulsado «finanzas.» (cada función y «guardar movimiento (total)»), y señales «finanzas» en Instruments.
- Categorías con los iconos de la web (c9424b6), «Regalos» de gasto (`cat_regalos_gasto`), icono al crear una.
- Importar: «importar N movimientos.» y «hecho.» abajo y a todo el ancho.
- «al año» de suscripciones y fijos: en iOS cuenta solo las suscripciones.

**Pendiente en la web (no se ha tocado `js/`):**
- `finResPanelSuscripciones` (js/finanzas-resumen.js) multiplica por 12 la suma de suscripciones y gastos fijos para
  «al año». Debería contar solo las suscripciones, como ya hace la app nativa.

**Pendiente (Finanzas):**
- Medir en el iPhone con datos reales (pulsación larga en el título) y apuntar aquí los números.
- `documentoVisible` (SyncEngine, común) vuelve a aplicar todas las operaciones pendientes sobre la base en cada
  escritura, y `CambioFinanzas.aplicar` decodifica `financePro` entero cada vez. Con muchas operaciones en cola y
  miles de movimientos se nota. No es de Finanzas: proponerlo a la sesión del resto de `ios/`.
