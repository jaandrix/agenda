# Plan 0.20

Pedido de Alejandro del 13-11-2026 tras probar la 0.19 en el iPhone. Claude dirige y GPT audita. Otra sesión hace
Finanzas a la vez (su sección, debajo).

## Todo menos Finanzas (sesión del resto de `ios/`)

| Punto | Commit | Qué |
|---|---|---|
| 1. Carrusel de semanas | 234822c | El paso salía del día que traía Inicio, que se recarga en segundo plano: dos deslizamientos seguidos pedían la misma semana y la respuesta vieja devolvía el carrusel a la semana de antes. Ahora el paso sale de la semana que se ve y se recuerda lo pedido (`EstadoCarrusel`, `CarruselTests`). |
| 2. Parpadeo | 624066b | `HuecoNubeTiempo`: un solo hueco para la nube y el tiempo, los dos puestos y solo cambia cuál se ve (fundido de 0,18 s). «sincronizando.» sale si dura 400 ms y se queda 1,2 s como mínimo (`HisteresisSync`). El tiempo no se repinta si no cambia lo que se ve (`TiempoBarra` equatable, `cambiaTiempo`). |
| 3. Círculos | 862b4a7 | `BitacoraCheck` de 32 a 22 pt (31 % menos), aro de 2 pt y mismo color, toque de 44. |
| 4. Poste del bus | 5592ec7 | `servicios.transporte.posteInicio` ya existía y la PWA ya lo lee (`mobileBusPoste`); faltaba elegirlo. Inicio: «poste N, nombre.» y «cambiar.» abren la lista con la elegida marcada. Transporte: «en inicio.» lleno en la elegida y «poner en inicio.» en las demás. Anotado en el contrato. |
| 5. QR | 648ea91 | `QRMarcado`: módulo a módulo, corrección H, hueco central impar (~24 % del lado, < 8 % del área) sin módulos cortados, placa redondeada con la tinta oscura del tema y medio módulo de margen, ojos redondeados, 3 módulos de margen blanco. Marca de agua «bitácora.» al 3,5 % en la pantalla completa. `QRMarcadoTests` lo genera y lo lee con Vision (y CIDetector de respaldo en el simulador). |
| 6. «valorar …» | 108db41 | Ver la decisión debajo. |
| 6. Ocio | 5e009f6 | Buscador con superficie, filo y lupa; portadas de la función `portadas` (TMDB, Open Library, Steam) al editar y solas al guardar sin portada (`portadaAuto`); «cuándo.» con fechas de verdad (una película nueva sale vista hoy); medias estrellas. |
| 7. Despensa | bcd806d | «pasar a la cesta.» abre una hoja para elegir ingredientes: lo que ya está sale desmarcado y, si se marca, solo se anota la receta (la regla de `recetaALaLista`); aviso de lo añadido. Recetas en tarjetas, «lo de siempre» en chips de la casa, historial con fechas legibles, plan a la lista sin duplicar (`compraClave`). |
| 7b. Temas | fad955a | Retoque, no rediseño. Tokens nuevos opcionales en `TemaTokens` (`titulo`, `barra`, `sobreBarra`, `sobreBarraSuave`, `acentoBarra`, `filo`, `bordeAlfa`, `aroAlfa`); la barra y las cabeceras leen `Paleta.titulo` / `Paleta.barra`… Asfalto grafito casi monocromo; papel crema con tinta casi negra y renglones; teja con títulos y barra granate y superficies más oscuras que el fondo; pizarra con barra #1A2D42 e iconos claros; fundador carbón con dorado #C99A4B y filo dorado; oliva marfil con acento oliva y la ciruela en progreso. Texto y secundario ≥ 4,9:1 en todos. Capturas `inicio-390-tema-*` en el artefacto `capturas-diseno`. |
| 8. Rendimiento | 95f1304 | Ver debajo. |

**Decisión: «valorar …» tras un evento de ocio.** La PWA (`convertirCinesEnPeliculas`) solo mira `eventType: "cine"`
y solo corre en la web; los eventos del editor del iPhone se guardaban como «otro». Ahora el evento dice qué es:
- el editor tiene «de ocio.» (película, serie, concierto, teatro, libro, videojuego), que se propone solo por el título;
  guarda `ocioTipo` y, para película, concierto y teatro, el `eventType` de la web (cine, concierto, teatro);
- sin `ocioTipo` vale el `eventType` (Apuntar ya pone cine, teatro y concierto por palabras) y, al final, el título;
- tres horas después del final (`hasta las HH:MM` de las notas o el inicio más 2 h; 2 h 30 un concierto; sin hora, las
  21:00 como la web), hasta 48 h después. Corre tras cada sincronización, venga el evento de donde venga (editor,
  Apuntar, bandeja o web);
- película: tarjeta vista sin nota + `peliculaId` (la web no la repite); serie, libro o juego: la tarjeta que ya exista
  o una nueva terminada ese día; concierto y teatro: solo la tarea. El evento guarda `valorarTareaId`;
- valorar la tarjeta marca hecha su tarea (`completarValorar`), como `completarTareaValorarPelicula`.

**Medias estrellas:** la web compara `rating` con enteros (`entry.rating === r`). `rating` lleva la parte entera y
`ratingMedia` el valor con medio; si la web cambia la nota, manda `rating`. Anotado en el contrato.

**Rendimiento (punto 8), sin medir en el iPhone:**
- `FichaEventoView.fecha` creaba un DateFormatter por llamada: el carrusel la pide 21 veces por fotograma al arrastrar.
- Las celdas del carrusel van en `PaginasSemanas` (equatable): arrastrar solo cambia el desplazamiento.
- Cada informe de la nube (dos por sincronización) rehacía Inicio y Plan enteros, que siguen vivos en el TabView:
  ahora `InicioCuerpo` y `PlanCuerpo` son equatables y solo se rehacen si cambia lo que pintan.
- Ocio busca sobre una clave normalizada al leer (antes normalizaba cada título en cada tecla); filas perezosas.
- Despensa: lista, historial y recetas en pilas perezosas.

**Pendiente (no Finanzas), por valor:**
1. Medir en el iPhone en Release con Instruments (arranque, cambio de pestaña, Inicio al deslizar). Sin datos no se ha
   tocado el arranque.
2. `documentoVisible` reaplica toda la cola sobre la base en cada escritura (lo señala Finanzas): cachear por versión
   la base ya analizada y aplicar solo las operaciones nuevas.
3. `c.informe` es un solo valor observado: cualquier cambio avisa a todas las pantallas. Separar `revision`, `estado` y
   `pendientes` en propiedades propias evitaría el resto de repintados.
4. «valorar …» con la app cerrada: hoy salta al abrirla o volver a ella. Un aviso local programado a esa hora lo
   adelantaría.
5. Calendario: el editor de eventos no enseña aún la hora de fin; con ella, el momento de «valorar» sería exacto.

## Probar en el iPhone (0.20, todo menos Finanzas)

- **Carrusel:** en Inicio, deslizar dos semanas seguidas rápido hacia la derecha: tiene que avanzar dos semanas y quedarse. Volver atrás igual. Tocar un día lo marca al momento.
- **Parpadeo:** tirar hacia abajo en Inicio varias veces: arriba a la derecha el tiempo no parpadea; «sincronizando.» solo sale si tarda y se queda un instante.
- **Círculos:** en Inicio y Plan son más pequeños y se siguen marcando bien tocando cerca. Mirarlo en asfalto.
- **Bus:** con dos paradas guardadas en Transporte, la elegida lleva «en inicio.»; «poner en inicio.» en la otra. En Inicio, bajo «siguiente.», tocar «poste N… cambiar.» y elegir la otra: cambia el bus al momento. La PWA enseña la misma.
- **QR:** abrir un evento con entrada: la «b.» va en su placa sin tapar medios cuadritos y los tres ojos son redondeados. A pantalla completa, «bitácora.» muy suave abajo. Leerlo con la cámara de otro móvil.
- **Valorar:** crear un evento «cine Dune» hoy hace 6 horas (o con «de ocio.» película) y abrir la app: en Plan sale «valorar la película. Dune» y en Ocio la película vista. Valorarla con 3,5 estrellas: la tarea queda hecha. Con un concierto, «valorar el concierto. …».
- **Ocio:** el buscador se ve; «+ añadir.» una película: «buscar portada.» trae carátulas de TMDB; «la he visto.» con fecha; nota con media estrella tocando la mitad izquierda. En la web la película sale con 3 estrellas (la parte entera).
- **Temas:** en Ajustes, pasar por los seis: cada uno se distingue por Inicio y la barra (teja con barra granate, pizarra con barra azul marino y iconos claros, fundador con dorado).
- **Despensa:** en una receta, «pasar a la cesta.»: lo que ya está sale desmarcado con «ya está en la lista.»; pasar y ver el aviso de lo añadido. Repetir: no se duplica.


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
- Editar presupuestos en el móvil (6f8111c): borrador, cifras de `financeBudgetUnifiedModel`, una sola escritura de
  `budgetPlans[mes]`, compromisos, copiar el mes anterior y cambiar de mes.
- Gastos del mes por categoría en el resumen (1e1e53e), con el mes anterior.
- Objetivo de patrimonio, «inversión desde.» y ficha de inversión en nativo (el mes, referencia, proyección e histórico).

**Pendiente en la web (no se ha tocado `js/`):**
- `finResPanelSuscripciones` (js/finanzas-resumen.js) multiplica por 12 la suma de suscripciones y gastos fijos para
  «al año». Debería contar solo las suscripciones, como ya hace la app nativa.

**Pendiente (Finanzas):**
- Medir en el iPhone con datos reales (pulsación larga en el título) y apuntar aquí los números.
- `documentoVisible` (SyncEngine, común) vuelve a aplicar todas las operaciones pendientes sobre la base en cada
  escritura, y `CambioFinanzas.aplicar` decodifica `financePro` entero cada vez. Con muchas operaciones en cola y
  miles de movimientos se nota. No es de Finanzas: proponerlo a la sesión del resto de `ios/`.

**Compilación:** 43476336072 (0a067f1) en verde, con los siete pasos.

## Probar en el iPhone (0.20, Finanzas)

- **Rendimiento:** cambiar de pestaña y guardar un movimiento; mantener pulsado «finanzas.» enseña lo que tarda cada cosa (apuntar «guardar movimiento (total)», «cargar (igual)» y cada pestaña).
- **Categorías:** la lista lleva el icono de cada gasto; el editor enseña todas las categorías con su icono; existe «Regalos» (gasto); en «más opciones.», «categorías.», una nueva propone icono por el nombre y no deja crearla sin icono.
- **Importar:** abajo, «importar N movimientos.» y, al acabar, «hecho.».
- **Resumen:** «suscripciones y fijos.» dice «al año» solo de las suscripciones; «gastos por categoría.» con flechas de mes.
- **Planificación:** «editar presupuestos.» (o «repartir el mes.»): cambiar un importe, añadir una casilla con categoría, guardar y ver que la web dice lo mismo.
- **Objetivo e inversión:** «poner objetivo.» en el resumen; tocar la cuenta de inversión en «tus activos.» abre su ficha; en la gráfica con inversión y emergencia, «inversión desde.».

