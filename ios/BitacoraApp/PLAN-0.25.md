# Plan 0.25

## Tema monocromo («tinta.»)

Pedido de Alejandro del 17-11-2026: un tema solo en blanco, negro y grises, trabajado a fondo, que aporte algo y no sea
quitar el color. Claude lo diseña; GPT lo audita.

### La idea

Sin color, la jerarquía sale de tres cosas: **luminancia, opacidad y peso**. La regla que lo ordena todo: **el peso
visual es la urgencia**. Lo que pide atención va en tinta plena; lo que va bien, en un gris más suave; lo normal, en
tinta. Lo que en los otros temas dice un color, aquí lo dice una forma:

| Significado | Otros temas | Tinta |
| --- | --- | --- |
| Acento (pestaña activa, botón +, día elegido, marcar) | color del tema | tinta plena invertida: negro sobre claro, blanco sobre oscuro |
| Prioridad alta / media / baja | rojo / ámbar / azul | negrita en tinta plena / seminegrita al 70 % / normal en gris secundario |
| Ingresos, mejoras, presupuesto en orden | `progreso` | `positivo` (gris pizarra), y en las barras **hueca** |
| Gastos de más, presupuesto superado, negativo | `atencion` | tinta plena, y en las barras **rayada** (trama a 45°) |
| Lo que falta por entrar del sueldo | barra al 30 % | rayado fino |
| Arrastrado o en curso (agenda) | acento | negrita y aro entero |
| Hoy en el calendario | acento | aro alrededor del número |
| Peligro (eliminar) | rojo | borde doble; el icono, en el cuadrado invertido |
| Errores | rojo | tinta plena |
| Colores de la persona (categorías, enlaces) | su color | su gris (ver abajo) |
| Punto del logo «b.» | naranja #E5532B | tinta |

### Dos modos que siguen al iPhone

Un solo tema, `tinta`, con `esquema = nil` como «sistema»: **día** (papel blanco y tinta negra) y **noche** (carbón y
tiza). En un tema sin color no se pierde nada al pasar de uno a otro, y así no hay que elegir dos veces. Los dos están
en `DesignSystem/Monocromo.swift` (`Grises.dia`, `Grises.noche`).

### La escala (12 pasos por modo, neutros: R = G = B)

Día, de claro a oscuro:

| Paso | Valor | Uso |
| --- | --- | --- |
| blanco | #FFFFFF | superficie: tarjetas, hojas, barra de abajo |
| papel | #F3F3F3 | fondo |
| niebla | #E6E6E6 | pulsado, pista de las barras |
| ceniza | #D6D6D6 | bolitas sin nada (`punto`) |
| humo | #BFBFBF | desactivado, decorativo |
| plomo | #9E9E9E | rayas guía, decorativo |
| acero | #747474 | texto apagado (solo decorativo) |
| grafito | #5A5A5A | texto secundario |
| pizarra | #4A4A4A | positivo: ingresos, mejoras |
| carbón | #2E2E2E | colores de usuario oscuros |
| hollín | #1F1F1F | colores de usuario oscuros |
| tinta | #121212 | texto, acento, progreso, atención |

Noche, de claro a oscuro: tiza #F7F7F7 (acento, atención), papel #EDEDED (texto), niebla #D6D6D6, ceniza #BDBDBD
(positivo), humo #A8A8A8 (secundario), plomo #8C8C8C (apagado), acero #5E5E5E, grafito #3D3D3D, pizarra #2A2A2A (punto),
carbón #1C1C1C (superficie y barra), hollín #161616, negro #0E0E0E (fondo).

Opacidades sobre la tinta (las de siempre de `Paleta`, con los alfas de este tema): borde 12 %, borde fuerte 24 %,
separador 15 %, aro 50 % de día y 46 % de noche (≥ 3:1), tinte del acento 8 % / 12 % (bloque «ahora.»), selección
11 % / 16 %, pulsado 7 % / 10 %, desactivado: secundario al 50 %.

### Contraste (lo vigila `TintaTests`)

| | Día | Noche |
| --- | --- | --- |
| texto sobre fondo / superficie | 16,9 / 18,7 | 16,3 / 14,6 |
| secundario | 6,2 / 6,9 | 8,2 / 7,3 |
| positivo | 8,0 / 8,8 | 10,3 / 9,1 |
| aro de marcar | 3,5 | 4,1 |
| texto apagado (decorativo) | 3,6 | 4,7 |
| sobre el acento | 18,7 | 18,0 |
| superficie frente al fondo | 1,11 | 1,13 |

### Colores de la persona

Las categorías de Finanzas y de Enlaces guardan su color («#FFADAD»). En tinta se pasan a gris con
`Grises.deColor`: se conserva su claridad (luminancia percibida) dentro de la franja que se lee sobre el fondo (día de
#121212 a #666666, noche de #969696 a #F0F0F0). Dos categorías siguen distinguiéndose por tono, cualquiera llega a 4,5:1
y lo guardado no cambia (la web sigue viendo el color). Entra por `Color(hexWeb:)` y `Color.deUsuario`, así que vale
para el icono, su fondo, las barras de gasto por categoría y los selectores de color.

Los iconos de las categorías **no son emoji**: son los SVG de Alejandro en `IconosCategorias.xcassets`, en modo
plantilla, así que ya son monocromos y solo toman su gris. No hacía falta decidir entre emoji en gris o fuente
monocroma.

### Imágenes

Portadas de Ocio y foto de perfil de Inicio pasan por `Imagenes`: con tinta se guardan **ya en gris al decodificar**
(una vez, fuera del hilo principal, con su propia clave de caché `…g`), así que pintarlas no cuesta nada y al volver a
un tema de color salen las de color. Los logos de bancos y la foto de Ajustes, que no pasan por ahí, llevan
`.enGrises()` (solo actúa con tinta). El QR sigue negro sobre blanco y su punto central pasa del naranja al negro.

### Guardado: no toca la web

El tema de la nativa se guarda **solo en el iPhone** (`UserDefaults`, `bitacora.tema` y `bitacora.tema.<uid>`): no va
en el documento de la nube ni en `DATOS_SINCRONIZADOS`, y la PWA guarda el suyo en su navegador. Por eso un valor que la
web no conoce no puede dejarla en negro, y no hace falta tocar `js/`. `tinta` está disponible para todos
(`permitido` cae en `default: true`, sin pasar por fundador ni oliva).

### Colores sueltos llevados a tokens

- Prioridad (`FilaAgenda`): los tres colores fijos siguen en los temas de color; en tinta, peso.
- Finanzas: todo lo que usaba `progreso` para decir «va bien» usa ahora `Paleta.positivo` (igual a `progreso` en los
  demás temas, así que no cambian).
- `Paleta.error` y `Paleta.marca` salen del tema.
- `Color(hexWeb:)` (Finanzas) y `colorHex` (Enlaces), por `Color.deUsuario`; el `.gray` de reserva de Enlaces,
  `textoSecundario`.
- `BarraAvance` tiene `forma` (`.llena`, `.hueca`, `.rayada`); solo cambia algo en tinta. Las barras a mano de
  «entra./sale.» y de la tasa de ahorro siguen la misma regla.
- Lo que queda del sistema y no se puede teñir: el rojo de los botones `role: .destructive` en los avisos de iOS.

### Archivos

`DesignSystem/Monocromo.swift` (nuevo: escala, tokens, `deColor`, `Trama`, `enGrises`), `Tema.swift` (caso `tinta`,
`positivo`, `mono`), `Componentes.swift` (prioridad, barra de avance, barra de abajo y botón +), `Imagenes.swift`,
Finanzas (`FinanzasView`, `GastosPorCategoriaView`, `HojasFinanzas`, `InversionView`, `MasOpcionesFinanzas`), Ajustes
(selector, botón de peligro, icono de peligro), `CalendarioView` (aro de hoy), `EnlacesView`, `EntradasQR`.
Pruebas: `BitacoraNativeTests/TintaTests.swift` (escala, solo grises, contraste AA en los dos modos, colores de la
persona) y las láminas `tinta-dia.png` y `tinta-noche.png` en `capturas-diseno` (Inicio, Plan y una columna de piezas).
`CapturasTemasTests` y `CapturasTests` ya sacan `tema-tinta.png` e `inicio-390-tema-tinta.png` solos.

### Qué probar en el iPhone

- Ajustes, apariencia: la miniatura «tinta.», tocarla. Cambiar el iPhone de claro a oscuro (Centro de control) con la
  app abierta: tiene que pasar de papel a carbón sin reiniciar.
- **Inicio:** el día elegido en tinta plena, hoy con su aro, «ahora.» en un bloque gris suave, la pestaña activa como
  un cuadrado negro (blanco de noche) con el icono invertido, y el + lleno.
- **Plan:** una tarea con prioridad alta, media y baja (se tienen que leer distintas sin color), una arrastrada de
  ayer (en negrita) y una hecha (tachada en gris).
- **Calendario:** hoy con aro, el día elegido lleno, los puntos de días con cosas.
- **Finanzas:** resumen (barra de lo gastado; si pasas del 100 %, rayada), «entra.» hueca y «sale.» llena, tasa de
  ahorro (meses negativos rayados), planificación (presupuesto superado rayado), categorías en gris distintos, ingresos
  en gris pizarra con «+», logos de bancos en gris.
- **Ocio:** portadas en gris y estrellas. **Enlaces:** el punto de cada categoría.
- **Ajustes:** «eliminar mi cuenta.» con el icono invertido y el botón de borrar con borde doble.
- **Despensa, Estudios, Proyectos, Viajes, Empleo, Objetivos, Transporte, Apuntar, bandeja, hojas y editores:**
  que nada salga de color (si algo sale, es un color suelto que se escapó del tema: avisar con captura).
- Una entrada con QR: negro sobre blanco, punto negro.
- Volver a cualquier otro tema: todo como antes (las portadas vuelven a color).

## Finanzas («salud.»)

GPT leyó el Markdown que exporta Bitácora con las finanzas reales de Alejandro y encontró que la contabilidad mezclaba
gasto, ahorro, traspasos y reembolsos. Esta parte arregla lo que tiene arreglo. **Nada se reclasifica solo:** Bitácora
propone y Alejandro acepta una a una o todas las de un tipo. No hay migraciones.

### Dónde está

- **Motor:** `js/finanzas-salud.js` (nuevo, va en `index.html`, en `MotorFinanzas.archivos` y en `project.yml`). Todo
  calcula sin tocar nada salvo `saludAccion(nombre, datos)`, la única escritura: en la web dentro de
  `commitFinanceChange`, en el iPhone por `finanzas-puente.js` (`__fin.saludAccion`) como una operación de
  `CambioFinanzas`. Lecturas del puente: `salud`, `saludCompras`, `fondoDatos`; la pestaña de cuentas trae `salud`
  (cuántas propuestas, por revisar y avisos).
- **iPhone:** `SaludFinanzasView.swift` (hoja `.salud`, se abre desde la línea «salud.» de la pestaña de cuentas) y la
  sección «el fondo.» en la ficha de inversión (`InversionView.swift`).
- **Web:** Finanzas → acciones. → «salud.» con lo de los puntos 1 a 3. El Markdown para la IA lleva una sección «Salud
  financiera».

### Datos nuevos (todos dentro de claves que ya existían: el contrato no cambia)

| Dónde | Campo | Qué |
| --- | --- | --- |
| movimiento | `reembolsoDe` | id de la compra que devuelve un ingreso |
| movimiento | `revisado` | «está bien así.»: sale de propuestas y de por revisar |
| `financePro.salud` | `esenciales`, `mesesObjetivo`, `umbralFondo`, `extraEmergencia`, `ordinario`, `tramos`, `avisos`, `ultimaSemanal`, `cierres[mes]` | ajustes, rutinas y el historial de cierres |
| `financeProfile.estabilizacion` | `saldo`, `objetivo`, `base` | la reserva de estabilización (vacío = lo propone Bitácora) |
| suscripción (`entries`) | `ultimoUso`, `revisadaEn` | última vez que se usó y última revisión |
| cuenta de inversión | `fondo` | `isin`, `indice`, `riesgo` (1 a 7), `ter`, `comisiones`, `notas` |
| deseo (`wishlist`) | `esperaDesde`, `esperaHasta` | la espera antes de una compra grande |

### Los ocho puntos

1. **Clasificación estricta.** `saludClase(t)`: ingreso, gasto, traspaso, ahorro, inversión, ajuste o reembolso.
   `saludPropuestas` detecta bolsillos, huchas y Flexible Cash Funds (ahorro), el bróker o el fondo (inversión),
   traspasos entre cuentas propias (mismo importe, ≤3 días, uno de los dos con pinta de transferencia, «Top-up»,
   «Revolut» o el nombre de la otra cuenta; nunca Bizum) y devoluciones (concepto de reembolso, o un ingreso sin
   categoría con palabras de una compra anterior de la misma cuenta). **Reembolso vinculado:** `financeProNeutro` lo
   deja fuera de ingresos, `financeProCategoryRefunds` lo suma a la categoría de la compra (gasto neto) y
   `financeProMonthTotals` lo resta del gasto del mes; `LecturaFinanzas.swift` hace lo mismo. «por revisar.»: Bizums sin
   categoría, ingresos o gastos sin categoría y devoluciones sin compra, con «resolver.» (categoría, ahorros, inversión,
   traspaso con otra cuenta, devolución de una compra, está bien así).
2. **Presupuestos honestos.** Casilla repetida = mismo nombre (sin mayúsculas ni acentos), importe y categoría en el
   mismo mes. Se avisa en el mes actual y en los futuros guardados, y «quitar las casillas repetidas.» deja la primera
   (nunca en meses cerrados). Las suscripciones y los gastos fijos ya entraban solos como compromiso; si en un mes se
   quitaron (`autoQuitadas`), se avisa con «volver a ponerlos.». Aviso si lo planificado (con compromisos) pasa de los
   ingresos previstos.
3. **Colchones.** Gastos esenciales = media de los últimos 6 meses cerrados de las categorías esenciales (netas de
   devoluciones) más los gastos fijos. Por defecto, las de vivienda, suministros, súper, transporte, seguros, salud y
   estudios; editables. «tu fondo cubre X meses». Reserva de estabilización aparte: referencia = mediana de lo que
   entró en esos meses, objetivo propuesto = 3 × (referencia − peor mes), redondeado a 10. Cuenta en activos totales,
   como la de vacaciones (no en el patrimonio operativo).
4. **Coste neto** por categoría (gastado, devuelto o vendido, neto), con Compras y Coleccionables primero.
5. **Rutinas.** Semana: por revisar, propuestas, lo que queda en presupuestos y cargos de 7 días, «hecha.». Día de
   cobro, en este orden: gastos del mes (media de los tres últimos o el que se ponga), reserva de estabilización (en un
   mes flojo se usa; en uno bueno se repone con lo que pasa de la referencia), fondo de emergencia (50 % de lo que sobra
   mientras esté por debajo de 1.500 €), inversión por tramos (menos de 700 → 50; hasta 900 → 100; más → 150) y ocio.
   Cierre de mes: ingresos, gastos, ahorro con tasa, a la inversión y fondo con los meses que cubre, más «¿qué gasto no
   volverías a hacer?» y «¿qué vas a cambiar el mes que viene?», guardado en `financePro.salud.cierres`. Avisos
   opcionales (semana, cierre, suscripciones) arriba de «salud.»; no son notificaciones push.
6. **Suscripciones:** «la usé hoy.» y «revisada.»; piden revisión a los 90 días sin revisar o a los 30 sin usar.
7. **Ficha del fondo:** solo lo que escribe Alejandro. El ISIN se comprueba solo por su forma (12 caracteres), el riesgo
   de 1 a 7 y el TER como porcentaje.
8. **Compras grandes:** «esperar 48 h.» o «esperar 7 días.» (sugiere 7 a partir de 150 €), con lo que queda y «ya has
   esperado: ¿lo sigues queriendo?».

### Pruebas

`pruebas/finanzas.mjs`: 6 nuevas (propuestas sin tocar nada hasta aceptar, reembolso vinculado y coste neto, casillas
repetidas, meses que cubre y estabilización, reparto del día de cobro y cierre, ficha del fondo con suscripciones y
esperas). `pruebas/finanzas-ios.mjs`: la lectura `salud` y una escritura como cambios desde el motor del iPhone.
`FinanzasLecturaTests.testReembolsoVinculadoRestaDelGasto` en Swift. Las de antes, en verde; Xcode no se ha compilado
aquí (Windows): lo compila el workflow `ios-nativa.yml`.

### Qué probar en el iPhone

- **Finanzas → cuentas:** debajo de «+ movimiento.», la línea «salud. N por clasificar». Ábrela.
- **Propuestas:** que salgan los bolsillos de Revolut y Flexible Cash Funds como ahorro, MyInvestor como inversión, las
  recargas de Ibercaja a Revolut como traspaso y las devoluciones con su compra. Acepta **una** («sí.») y mira en
  movimientos que ha cambiado; luego decide el resto. Si alguna está mal, «no, está bien así.».
- **Por revisar:** un Bizum, «resolver.» → categoría. Un ingreso que sea devolución → «devolución de una compra...» y
  elige la compra: en resumen, el gasto de esa categoría baja.
- **Presupuestos:** con «Cuenta conjunta» repetida de diciembre a junio, «quitar las casillas repetidas.» y comprueba un
  mes futuro en planificación.
- **Colchones:** «qué gastos son esenciales.», marca las tuyas; los meses que cubren tus 300 € tienen que tener
  sentido. Pon lo que tienes en la reserva de estabilización.
- **Rutinas:** día de cobro con 568, 800 y 1.234 €; cierre de octubre con las dos respuestas.
- **Inversión → tu fondo:** ISIN, índice, riesgo, TER; guardar y volver a abrir.
- **La web:** Finanzas → acciones. → salud.; y «exportar para tu ia.» trae «Salud financiera» al final.
_relanzada (intento 1, GitHub sin Mac)._
