# 0.26: importar extractos sin descuadres

Auditoría de GPT sobre la IPA 0.23 (19-11): `C:\Users\jandr\Documents\ChatGPT\agenda\AUDITORIA-FINANZAS-IPA-2026-11-19\`
(`AUDITORIA-IMPORTADOR-Y-FINANZAS-0.23.md` y `casos-adversos-importador.mjs`). Cada hallazgo se comprobó contra `main`
(0.25 con «salud.» y cc5b1b5), no contra la 0.23: los cuatro fallos reproducidos seguían ahí.

El motor es el mismo en la web y en el iPhone (`js/finanzas-pro.js` dentro de JavaScriptCore), así que lo arreglado en
el motor vale para los dos. Commits: web `acb8a46`, iPhone el de este plan.

## Los 14 hallazgos

| | Hallazgo | Estado | Dónde |
|---|---|---|---|
| F-01 | `Status` no se reconocía: PENDING y REVERTED entraban como hechos | arreglado (`acb8a46`) | `financeProEstadoBanco`; columnas Status, Transaction Status, State, Estado, Situación. Pendiente entra como pendiente, anulado/rechazado/void fuera, desconocido desmarcado con aviso. Un pendiente que llega anulado se quita aunque su fila venga desmarcada (antes no). |
| F-02 | Una compra nueva desmarcada por coincidir solo importe y 4 días | arreglado (`acb8a46`) | Tres niveles en `financeProFilasYaApuntadas`: ya está (misma operación por hora de inicio, mismo concepto, o dos filas que suman un traspaso), posible (marcada, con aviso en `imp.posibles`) y nueva. |
| F-03 | Apunte a mano de otra cuenta absorbido por los céntimos | arreglado en el importador (`acb8a46`) | `financeProManualEncaja`: en su cuenta, concepto parecido o ≤2 días; en otra, concepto parecido y céntimos. Lo demás lo propone «salud.» (tipo `apunte`). La conciliación de suscripciones (`financeProMismoCargo`) sigue cruzando cuentas por céntimos: el cargo automático es provisional y no descuadra el saldo; queda como está. |
| F-04 | «Ajustar el saldo» no restaba lo retenido | arreglado (`acb8a46` y este) | `financeProDiferenciaCuadre` en ajustar, fijar, rehacer y en el puente (`cuadreAjustar`, `cuadreFijar`). El botón dice a cuánto queda. |
| F-05 | Recargas Ibercaja ↔ Revolut como gasto e ingreso | arreglado (`acb8a46`) | `TRASPASO_RECARGA` y ventana de −2 a +4 días (el banco asienta después). El traspaso lleva la fecha de la recarga y su clave de Ibercaja en `claveImport2`. La prueba `todo` es obligatoria y en los dos órdenes. |
| F-06 | Solo tres cuentas importables | parcial (`acb8a46`, este) | El importador, la detección de cuenta, «borrar un historial» y el iPhone aceptan cualquier cuenta de `financePro.accounts` (`financeProCuentasImportables`). Pendiente: crear cuentas nuevas desde la interfaz y que formularios y reglas usen la lista dinámica. |
| F-07 | Cambios concurrentes que se pierden sin avisar | parcial (`acb8a46`, este) | Web: importación, duplicados claros y lote en una sola escritura (`commitFinanceChange`, que funde a tres bandas) y cuadre después de guardar. iPhone: cada alta lleva todas sus claves (`claves`/`veces`), no solo la primera, y lo unido a un apunte viaja entero en `siFalta`: si el apunte se borró en otro dispositivo, entra como movimiento del banco. Pendiente: volver a conciliar sobre el documento nuevo en vez de degradar a alta. |
| F-08 | `1,234` y `04/05/2026` interpretados fila a fila | arreglado (`acb8a46`, este) | `financeProDetectarFormato` con todo el archivo; si no se puede, se pregunta en la vista previa (web: dos desplegables; iPhone: dos Pickers) y no se importa hasta elegir. |
| F-09 | El Excel usaba la primera hoja por nombre de archivo | arreglado (`acb8a46`, este) | `financeProHojasDelLibro` y `XMLExcel.libro`: orden de `workbook.xml` y sus relaciones, primero las visibles, la primera con cabecera de movimientos; fechas de 1904. No hay selector de hoja si hay varias compatibles: manda la primera. |
| F-10 | Una fila de hucha marcada a mano entraba en la cuenta | arreglado (`acb8a46`, este) | Filas bloqueadas (anuladas y de hucha) sin casilla en la web y el iPhone; quien importa lo vuelve a comprobar (`financeProFilaFuera`). Producto `Current`/`corriente`/`main`. |
| F-11 | El cuadre daba más confianza de la que tenía | parcial (`acb8a46`, este) | Aviso «sin columna de saldo» en la vista previa (web e iPhone) y en el resultado; retenido y movimientos apartados del último día explicados en el aviso. Pendiente: saldo antes y después en la vista previa. |
| F-12 | Pruebas del importador Swift que no usa nadie | arreglado (este) | `ImportadorFinanzas.swift` y `ImportadorFinanzasTests.swift` retirados; `ClaveImportacion` pasa a `CambioFinanzas.swift`. Las pruebas del importador real están en `pruebas/finanzas.mjs` y `pruebas/finanzas-ios.mjs`. |
| F-13 | Sin identidad de lote y fila | parcial (`acb8a46`) | `importLote`, `importFila`, `importHuella` en cada movimiento nuevo; `financePro.lotes` (30); aviso de archivo ya importado; «quitar solo lo que entró.» en la web. La huella todavía no se usa para deduplicar (las claves de siempre lo hacen; usarla las dos a la vez descontaba filas dos veces). Pendiente: el botón en el iPhone y el id de operación del banco. |
| F-14 | Un importador genérico para todos los bancos | parcial (`acb8a46`) | `financeProDetectarBanco` y adaptador de formato: Revolut, N26 y PayPal (punto decimal, fechas ISO), bancos españoles (coma decimal, día/mes). Pendiente: un adaptador con contrato común por banco (Ibercaja, Revolut, MyInvestor, N26, ING, BBVA, Sabadell, PayPal) y el genérico como último recurso. |

## Simulación con datos reales

Importador viejo (`HEAD` antes de `acb8a46`) y nuevo con los mismos archivos (`sim.mjs` en el scratchpad de la sesión):
los Revolut reales de `Downloads\bitacora-mirror` (881 filas de 2026, octubre y dos parciales), el Ibercaja y los
Revolut anonimizados de `pruebas/extractos`, un Excel real de Santander y los 13 formatos de `_extractos.json`. La
exportación del 29-10 (1.115 movimientos) no está en disco: se pidió a la sesión de la 0.25. Nada de esto se ha subido.

| Escenario | Viejo | Nuevo |
|---|---|---|
| A. Revolut 2026, octubre, dos parciales y otra vez 2026 | 864 movimientos, 983,18 €, cuadra | igual (primera versión: dos peajes pendientes duplicados, 13,45 €; arreglado reconociendo la misma operación por hora de inicio) |
| B. Los parciales primero y luego el año | 864, 983,18 €, cuadra | igual |
| C. 12 apuntes a mano (4 en la cuenta equivocada) y luego octubre | Revolut cuadra; Ibercaja −5 € (un apunte redondo se queda) | Revolut cuadra; los 4 de Ibercaja ya no se mueven solos, «salud.» los propone y al aceptarlos Ibercaja queda en 0 € |
| D. Ibercaja + 3 Revolut (anonimizados) | 7 recargas como gasto e ingreso (septiembre: 2.348 € de ingresos) | 6 traspasos, septiembre 1.195 € de ingresos; los 4 extractos cuadran (primera versión: Revolut descuadraba 793,22 € a fin de mes por la fecha del traspaso; arreglado) |
| E. Excel real de Santander | 134 movimientos | igual |
| F. 13 formatos de banco | — | mismos saldos, fechas y movimientos en los 13 |

### Con la exportación real del 29-10 y sus extractos

La exportación (`bitacora_finanzas_2026-10-29(5).md`, 1.115 movimientos) y los extractos reales (Ibercaja de enero a
octubre de 2026 en .xlsx; Revolut de 2026, septiembre y 1-18 de octubre) estaban en la papelera de Windows: se
copiaron al scratchpad para leerlos, sin restaurarlos ni subirlos. La exportación se reconstruye como en la sesión de
la 0.25 (con la regla «Top-up by *1185» → Ibercaja). Arnés: `sim3.mjs` (copia en las notas de la sesión).

| Escenario | Viejo (`8a890f2`) | Nuevo |
|---|---|---|
| R1. Sobre su estado del 29-10, reimportar Ibercaja del año, Revolut septiembre, 1-18 octubre y 2026 entero | nada nuevo; Ibercaja 800 €, Revolut 983,18 € | primera versión: 4 recargas de septiembre duplicadas (Ibercaja −677,25 €). Arreglado (`clavesFila`: con una regla, la clave se busca también con la cuenta del extracto). Ahora Ibercaja 800 € igual y Revolut 982,73 €: los 0,45 € son del arnés (la exportación no trae el concepto del banco ni la hora; en la app, «cafe dachser» lleva el de Breasy y su hora y se reconoce) |
| R2. Desde cero, Ibercaja y luego Revolut (el orden de la guía) | Ibercaja cuadra; Revolut de septiembre no cuadra (677,25 €) | los cuatro extractos cuadran: la recarga unida a su mitad de Ibercaja lleva la fecha de la recarga |
| R3. Desde cero, Revolut y luego Ibercaja | Ibercaja no cuadra (−351,38 €; la nómina del 7-10 se perdía en el traspaso del mismo importe) y Revolut tampoco (850 €) | Ibercaja cuadra y la nómina está; Revolut igual que antes (850 €) |

Pendiente que sale de aquí: en su estado actual, los traspasos de las recargas tienen la fecha de Ibercaja, así que el
extracto de Revolut de un fin de mes con recargas no cuadra (septiembre, 677,25 €, igual que con el importador
viejo). No se cambia solo al reimportar (serían datos ya guardados): debería proponerlo el cuadre o «salud.». Y el
orden Revolut → Ibercaja sigue sin cuadrar Revolut (850 €, también antes): importar primero Ibercaja.

## Pruebas

`node --test pruebas/finanzas.mjs pruebas/finanzas-ios.mjs pruebas/importar-ios-web.mjs pruebas/concurrencia-ios.mjs
pruebas/sincronizar.mjs pruebas/contrato-ios.mjs`: 217 de 217, ninguna `todo`. Nuevas: F-01 (cuatro cabeceras, seis
estados, pendiente que se anula), F-02 (dos compras de 12,34 €, mismo día y misma cuenta), F-03 (con y sin concepto,
y «salud.»), F-04 (retenido con otra diferencia), F-05 (los dos órdenes), F-06, F-08 (EE. UU., España, dudoso),
F-09, F-10, F-11, F-13 y F-07 en el iPhone. XCTest: `testElLibroUsaLaHojaDeMovimientosVisibleYLasFechasDe1904`.

## Qué probar

1. Web, Revolut: importa el CSV del mes. Las anuladas salen sin casilla; las que ya estaban, desmarcadas; las que
   solo se parecen, marcadas con «¿ya está?». Debe cuadrar.
2. Web, Ibercaja después de Revolut (y al revés en otra cuenta de prueba): las recargas quedan como traspaso y no
   inflan ingresos ni gastos del mes.
3. Apunta un gasto a mano en la cuenta equivocada e importa: no se mueve solo; en «salud.» sale en «apuntes a mano que
   ya trajo el banco.» y al aceptarlo queda uno.
4. «deshacer importación.» → «quitar solo lo que entró.» de la última: quita solo esos movimientos.
5. iPhone: lo mismo con el Excel de Ibercaja (elige la hoja buena) y el CSV de Revolut; filas de hucha sin casilla.
6. Un CSV con fechas 04/05 y sin cabecera en español: pregunta el formato antes de importar.
