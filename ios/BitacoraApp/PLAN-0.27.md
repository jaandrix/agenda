# 0.27: listas de Panorama en el iPhone

Pedido de Alejandro (22-11): «continúa con mejoras para la IPA». Desde la 0.26 (64fba66) la web ganó las listas con
subtareas de Panorama (b81d48d, 5e158f9, a4fa57a, 3fc4f5b), el círculo y el contador de las subtareas del planificador
(997d8af) y «en este día.» (4b1e058). Esta versión los lleva a la nativa, cierra lo pendiente de la 0.26 que se podía
cerrar sin tocar la web y hace un barrido de calidad. **No se ha tocado `js/`, `index.html` ni `styles.css`.**

## 1. Listas de Panorama

**Dónde:** en Panorama, debajo de la puntualidad (como en la web, debajo de las tarjetas), y con página propia en el
menú, «listas», en «general.» justo después de panorama, con el contador de lo que queda por hacer. En la web son parte de
Panorama, así que en el iPhone «listas» no tiene interruptor en Ajustes → apartados (`Apartados.fijos`). En Inicio no:
su espacio ya va justo y las listas son una zona de trabajo, no de un vistazo.

**Datos (`DataContract/OperacionesListas.swift`).** `ListasOp.aplicar` es `listasAplicarOp` (js/listas.js y
bitacora-mcp) en Swift, con las mismas acciones y la misma forma de operación: `crear_lista`, `lista` (título, color,
ocultar las hechas), `borrar_lista`, `quitar_hechas`, `anadir` (con padre e índice), `editar` (texto, hecha con o sin
subtareas, plegada), `borrar` y `mover` (de sitio, de madre o a otra lista). Y las que la web hace a mano y aquí tienen
que ser operación: `mover_lista`, `plegar_todo`, `restaurar_lista` y `reponer_tareas` (para deshacer). Viajan como
`extra(tipo: "listas")` y tocan solo `listasPanorama`. Como todas, se vuelven a aplicar sobre lo último de la nube: un
cambio del iPhone nunca reescribe una caja o una tarea que no tocó, y la web, que funde por id de caja y de tarea, no
pierde lo suyo. Diferencias con la web, a propósito:

- `mover` comprueba aquí el límite de cuatro niveles y que no se meta una tarea en su propia rama (en la web lo
  comprueba quien llama).
- La lectura (`VistaListas`) quita los ids repetidos en el mismo orden que `listasNormalizar` (primero la tarea y luego
  sus hijas), sin escribir nada.

**«→ hoy» en los dos sentidos.** Op `listaAHoy` (solo `dayPlanner`): la tarea del día con `listaId` y `listaTareaId` y el
título «lista: tarea», sin repetirse si ese día ya la tiene. Marcar esa tarea en el plan marca la de la lista (sola, sin
sus subtareas, como `listaTareaDesdePlanner`): `marcarTarea` lleva ahora también la clave `listasPanorama`. Marcar en la
lista marca en el plan las tareas de hoy enlazadas (la tarea y, si se pide, sus subtareas), en la misma escritura.

**Cómo se usa (`Features/Panorama/ListasView.swift`).** En la web se escribe con el teclado (Enter, Tab, Mayús+Tab,
Alt+flechas). En el iPhone:

- Cada caja: título editable (con el subrayado de color de la web, en gris en tinta), «hechas/total» (en tinta fuerte al
  completarse) y «···»: color del título, ocultar o mostrar las hechas, plegar y desplegar todo, quitar las hechas, mover
  antes o después y eliminar lista (pregunta si tiene tareas).
- Cada tarea: plegar si tiene hijas, el círculo de la casa, el texto (tocarlo lo edita en su sitio), «hechas/total» de
  sus hijas y «en hoy.» si está en el plan. Su «···» (y mantener pulsado): + subtarea, → hoy, editar, meter, sacar,
  subir, bajar, a otra lista y borrar.
- Marcar una tarea con subtareas sin hacer pregunta: «marcar también sus N subtareas.» o «marcar solo esta.».
- Se añade siempre desde el campo de abajo de cada caja, que dice dónde entra («dentro de «pintar».», «después de
  «llamar».»). Return añade y deja el campo abierto para la siguiente; Return con el campo vacío sube un nivel (como Enter
  en una tarea vacía con sangría) y, arriba del todo, cierra el teclado. Pegar varias líneas crea varias tareas y quita
  las viñetas («- », «1. », «[ ] »). Por qué el campo de abajo y no uno en cada fila: no cambia de sitio al guardar, así
  que el teclado no se cierra entre tarea y tarea.
- Return al editar el texto de una tarea la guarda y abre el campo justo detrás. Dejarla vacía y sin subtareas la borra.
- Borrar una tarea, una lista o quitar las hechas enseña abajo «deshacer.» durante siete segundos.
- Sin arrastrar: subir, bajar, meter y sacar hacen lo mismo con un toque y funcionan con VoiceOver.

## 2. Subtareas del planificador

- Plan e Inicio enseñan «hechas/total» detrás del nombre de una tarea con subtareas (`plannerSubCuenta`; en tinta fuerte
  al completarse), también en lo arrastrado y en los pendientes sin día, y VoiceOver lo lee.
- En el editor de la tarea, el mismo círculo que el plan y las listas (`CirculoCheck`, que ahora comparte con
  `BitacoraCheck`), filas de 44 pt, el contador en la cabecera de «subtareas.» y Return añade y deja el campo abierto.

## 3. «En este día.»

Al final del plan de hoy, solo si hay algo: «en este día, N recuerdos.», discreto. Abre una hoja con lo de otros años
(hace cuánto, qué, de qué tipo y el año); cada fila lleva a su apartado. Misma lógica que `buildOnThisDayItems`: entradas
y notas del mismo día y mes de años anteriores, sin los «Completado: …» del plan (`Recuerdo.deHoy` en
LecturaPlanificador.swift).

## 4. Lo pendiente de la 0.26: la fecha de los traspasos guardados

«salud.» → clasificación → «traspasos con otra fecha»: los traspasos emparejados antes de acb8a46 llevan el día en que el
banco de origen asienta la recarga, y el extracto de Revolut de un fin de mes no cuadra (677,25 € en septiembre). Se
propone lo mismo que hace ahora `financeProEmparejarTraspasos`: la fecha de la otra mitad (su clave está en
`claveImport`, es de la cuenta de destino y de hasta 4 días antes) y la clave propia en `claveImport2`, para que
reimportar Ibercaja lo siga reconociendo. Uno a uno («sí.») o todos; **nunca solo**. Con `claveImport2` ya ocupada no se
propone. Está en `finanzas-puente.js` (`traspasosConFechaDelBanco`, acción `fechaTraspaso`), no en `js/`: la web no lo
tiene todavía. Prueba nueva en `pruebas/finanzas-ios.mjs`.

## 5. Lo pendiente de planes anteriores

- **Mapa del viaje (nativo).** El itinerario con lugar localizado, numerado por día y hora y unido por una línea
  discontinua, como `initTripMap` (`Features/Viajes/MapaViaje.swift`). Al guardar un elemento con un lugar nuevo, el
  iPhone lo localiza con el geocodificador del sistema y guarda `lat`/`lon` donde la web (op `coordsItinerario`, solo si
  el lugar sigue siendo el mismo), así que la web también lo pinta.
- **Documentos: subir, renombrar y borrar PDF** desde el iPhone («+ pdf.» y el «···» de cada archivo), como
  `handleDocUpload`, `renameDocument` y `deleteDocument` (mismo nombre saneado, `sanitizeStorageFilename`). Los HTML del
  visor y las copias siguen en la web («html y copias, en la web.»).
- **A16 (símbolos del binario).** La IPA se recorta al empaquetar (`strip -S -x`: sin información de depuración ni
  símbolos locales) y el dSYM sale como artefacto aparte, `simbolos-dsym`, para simbolicar un fallo. Se hace en el
  workflow y no con `STRIP_STYLE` porque las pruebas de rendimiento compilan en Release y necesitan los símbolos. Si el
  recorte fallara, avisa y la IPA sale igual.
- Siguen en la web: los documentos del viaje, festivos del destino y duplicar viaje; CV, PDF de vida laboral e
  importador del informe; «para qué», hansei y pasar una acción del mandala a rutina; propuestas de la bandeja que piden
  validación; el resto del Panorama de la web (tarjetas elegibles).

## 6. Barrido de calidad

- **Proyectos:** el aro de una tarea pendiente iba en `bordeFuerte` (por debajo de 3:1, apenas se veía en asfalto);
  ahora en `aro`, el del círculo de marcar.
- **Zonas de toque de 44 pt** sin cambiar cómo se ven (el fondo se queda, el toque crece): botones de los avisos de
  Finanzas, los de las hojas de Finanzas, la colina de Proyectos y la flecha del tablero de Objetivos.
- **Colores sueltos:** no queda ninguno fuera del tema salvo el QR (negro sobre blanco a propósito) y las prioridades,
  que ya tienen su variante en tinta.
- Se dejan como están, a propósito: los controles segmentados de Finanzas (pestañas y rango de la gráfica, de 32-36 pt,
  como el segmentado del sistema) y la línea del bus de Inicio (36 pt; Inicio está medido al píxel).

## Pruebas

- XCTest nuevo, `ListasTests`: lectura y contadores, añadir y marcar con subtareas (idempotente y sin tocar campos
  ajenos), meter, sacar, límite de niveles y rama propia, a otra lista, ordenar cajas, deshacer borrados (caja y tarea),
  ocultar, plegar y quitar hechas, «→ hoy» sin repetirse y marcar en el plan que marca la lista, ids repetidos, viñetas al
  pegar, «en este día.» y el nombre saneado de los PDF.
- JS: `node --test pruebas/finanzas.mjs pruebas/finanzas-ios.mjs pruebas/importar-ios-web.mjs pruebas/concurrencia-ios.mjs
  pruebas/sincronizar.mjs pruebas/contrato-ios.mjs`: 230 de 230 (una nueva, la fecha de los traspasos).
- Xcode no se ha compilado aquí (Windows): lo compila el workflow `ios-nativa.yml`. Revisado a mano lo que suele romper:
  expresiones largas partidas en funciones, sin `self.` en `catch`, cierres al final de las firmas, el campo nuevo de
  «salud.» opcional (`fechasTraspaso`), sin casos de enum nuevos con valor asociado (todo va por `extra`), `.hoja` y
  `c.guardar`.

## Qué probar en el iPhone

1. **Menú → listas:** «+ nueva lista.», escribe el título y Return: el cursor pasa al campo de abajo. Escribe tres tareas
   seguidas con Return entre ellas (el teclado no se cierra).
2. En la segunda, «···» → «+ subtarea.»: el campo dice «dentro de «…».»; añade dos. Return con el campo vacío: sube a
   «después de «…».».
3. «···» → meter, sacar, subir y bajar en una tarea; luego llévala a otra lista. Intenta meter cinco niveles: avisa.
4. Marca la tarea con subtareas: pregunta. «marcar también…»: el contador de la caja sube a la vez.
5. «→ hoy» en una tarea: sale «en hoy.» y en Plan aparece «lista: tarea». Márcala en Plan: en la lista sale hecha.
   Desmárcala en la lista: en Plan también.
6. «···» de la caja: color del título (el subrayado), ocultar las hechas («N hechas ocultas. ver.»), plegar todo,
   quitar las hechas y «deshacer.», eliminar lista y «deshacer.».
7. Abre la web: lo hecho en el iPhone está igual, y lo que cambies en la web llega al iPhone sin pisar nada.
8. **Panorama:** las mismas listas debajo de la puntualidad.
9. **Plan:** una tarea con subtareas enseña «1/3»; ábrela: círculos como los del plan, Return sigue añadiendo.
10. **Plan de hoy, abajo:** si hay algo de otros años, «en este día, N recuerdos.»; tócalo y abre uno.
11. **Finanzas → salud.:** «traspasos con otra fecha» (si sale): acepta uno y mira en movimientos que el traspaso cambia
    de día; reimporta el Ibercaja de ese mes: no se duplica.
12. **Viajes:** en un viaje con itinerario con lugares, el mapa con los puntos numerados. Añade un elemento con un lugar
    nuevo: al poco sale en el mapa (y en la web).
13. **Documentos:** «+ pdf.» sube uno; «···» → renombrar y borrar.
14. **Proyectos:** el aro de las tareas pendientes se ve bien en asfalto.
