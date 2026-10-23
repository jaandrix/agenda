# Bitácora — contexto para trabajar en este repo

Este archivo lo lee Claude Code automáticamente al abrir una sesión nueva en esta
carpeta. Resume cómo trabajamos, qué es Bitácora y cómo está construida, para no
tener que re-explicarlo cada vez. Se actualiza a mano cuando cambia algo importante
— no es exhaustivo línea a línea, es la foto general.

## Qué es Bitácora

Una app personal para reunir la vida entera del usuario (Alejandro, jandropas@gmail.com)
en un solo sitio — calendario, planificador, finanzas, estudios, eventos, hábitos,
notas, viajes, coleccionables, amigos, ocio (libros/series/películas/videojuegos),
trabajo, proyectos, enlaces — en vez de repartirla entre decenas de apps sueltas.
Filosofía explícita del proyecto: nada de scroll infinito, nada de ruido, un espacio
tranquilo y propio. Es un proyecto personal en producción real, no una maqueta.

## Dónde está todo

- **Repo principal:** `C:\Users\jandr\Documents\GitHub\agenda` (GitHub: `jaandrix/agenda`,
  rama única `main`, sin flujo de PRs — se commitea y se pushea directo a `main`).
- **Sitio en producción:** appbitacora.es (GitHub Pages, hosting estático — ver `CNAME`).
  Backend: Supabase (auth + una tabla `bitacora` con los datos de cada usuario en una
  columna `jsonb`). Hay Edge Functions desplegadas (`supabase/functions/`: Stripe
  webhook de suscripción, envío de notificaciones push, cancelación de suscripción y
  `bitacora-mcp`, el conector para Claude/ChatGPT — ver `supabase/sql/conector_ia.sql` —, y
  `calendario-feed`, el calendario suscribible .ics para Google/iPhone/Outlook con enlace firmado por HMAC
  (secreto `CALENDARIO_SECRET`, `calendarioFeedVersion` sincronizado para anularlo), `calendario-ics`, que
  descarga un .ics de otra web para importarlo, `portadas` (Ocio; secreto `TMDB_KEY`), `deportes` (partidos de
  tus equipos: ESPN y TheSportsDB), `entrada` (Siri y el correo) y `compartir` (enlaces sin registro), ver
  «Servicios públicos» en el mapa, y
  `avisos-diarios`, avisos push automáticos vía pg_cron cada 5 minutos: resumen del
  día a las 9:00 y cada evento con hora una hora antes, salvo `sinAviso` en el
  evento o `preferenciasAvisos.eventos === false` — ver `supabase/sql/avisos_diarios.sql`) y
  SQL de referencia en `supabase/sql/` (amistades, listas de ocio compartidas, viajes
  compartidos, sugerencias, snapshots...).
- **Carpeta espejo para pruebas locales:** `C:\Users\jandr\Downloads\bitacora-mirror\`
  — ver más abajo, "Cómo se prueba un cambio".
- **App nativa iOS:** `ios/BitacoraApp/` (proyecto Xcode/project.yml aparte, con
  widgets) — envoltorio nativo de la misma web app. No se ha tocado en las sesiones
  recientes; existe, pero no es el foco habitual de trabajo.
- **Apuntes:** `apuntes-window.js` + `estudios-apuntes.html` + carpeta `apuntes/` —
  un mini-editor de notas independiente, enlazado desde Estudios.
- **Memoria persistente entre conversaciones (fuera del repo):**
  `C:\Users\jandr\.claude\projects\...\memory\` — preferencias del usuario ya
  aprendidas (p. ej. "hacer `git push` a `main` sin pedir confirmación tras cualquier
  cambio"). Claude Code la carga solo, no hace falta pegarla aquí.

## Cómo está construida (arquitectura)

- **Nada de build/bundler/framework.** JavaScript vanilla, scripts clásicos (no
  módulos ES), repartidos por apartado en la carpeta `js/` (hasta el 2026-10-06 era un
  único `app.js` de ~21.000 líneas; se dividió en trozos contiguos sin cambiar el
  código). `index.html` los carga en este orden, que importa:
  `nucleo` (config, auth, constantes, navegación, versión móvil, buscador) → `datos`
  (carga, guardado y fusión con la nube, tema, tipografía) → `interfaz` →
  `planificador` (y hábitos) → `coleccionables` → `entradas` (modal de crear/editar,
  guardar, borrar, exportar) → `calendario` (dispatcher `render()`, Home, tiempo) →
  `resumen` (panorama, patrones, avisos) → `ocio` → `viajes` →
  `trabajo-estudios` → `agenda-laboral` → `enlaces-proyectos` → `eventos` → `ajustes` (y notificaciones
  push) → `notas-objetivos` → `finanzas` → `finanzas-pro` → `documentos` → `vault` →
  `conector` → `inicio` (init) → `actualizaciones` → `compra` → `estudiar` → `test` → `conexiones` → `metodo` → `universidad` → `profesorado` → `profesorado-aula` → `cv` → `social` → `perfil` → `bienvenida` → `ejemplo` → `invitar` → `asistente` → `tumes` → `servicios` → `compartir` → `guia` → `landing`.
  - Todas las funciones y variables de primer nivel son globales y compartidas entre
    archivos, así que **los nombres no pueden repetirse** entre archivos (un `let`/`const`
    duplicado rompe la carga entera; una función duplicada pisa en silencio a la otra).
  - **Nada que se ejecute al cargar un archivo puede usar funciones de un archivo
    posterior** (el hoisting no cruza archivos): en objetos que mapean vistas a funciones
    se usan flechas (`home: () => renderHome()`), y el arranque espera a
    `DOMContentLoaded`. Al añadir un archivo nuevo: en `js/` y su `<script>` en `index.html`.
  - `styles.css` — **~6.500 líneas**. `index.html` — el shell HTML (contenedores vacíos:
    `#content`, `#modal-container`, `#mobile-shell`...). `v23.js`, `pwa-install.js`,
    `service-worker.js` — utilidades/PWA.
- **Un único dispatcher de render:** la función `render()` mira `currentView` y llama
  a la función `renderXxx()` correspondiente, volcando HTML a `#content`. Cada
  apartado (`finances`, `studies`, `planner`, `events`...) tiene su propio
  `renderXxx()`. Al final de `render()` se llama siempre a `renderMobileShell()`
  (para que la versión móvil PWA quede sincronizada sin tocar cada punto de llamada).
- **Estado = variables globales `let`** cargadas desde Supabase al iniciar sesión
  (`entries`, `categories`, `financeProfile`, `financePro`, `studies`, `dayPlanner`,
  `habits`, `notes`, etc.) y persistidas con `saveData()` → `doSaveData()`, que hace
  un **read-merge-write** (lee lo último de Supabase, mezcla con las variables locales
  actuales, escribe) para no pisar cambios hechos desde otra pestaña/dispositivo.
  `saveData()` encola las llamadas (`saveChain`) para que no se solapen.
- **Modales:** patrón único `showModal(html)` / `closeModal()` sobre un solo
  `#modal-container` — no hay pila de modales, abrir uno sustituye el anterior.
  Si ya hay uno en pantalla (o cerrándose), `showModal` cambia solo su contenido sin volver a animar el fondo; los
  modales que traen su propio overlay (ficha de evento, formulario, documentos) se pintan con `ponerModal(html)`,
  nunca con `innerHTML` directo, por lo mismo. Para refrescar un modal abierto, cambiar su contenido por dentro.
  Nada de transiciones de vista para abrir modales (`showModalDesde` es ya un `showModal`): parpadeaban en escritorio.
  Con un modal abierto no se llama a `render()`: `repintarTrasModal()` lo deja para cuando se cierre (se veía a
  través del fondo como un destello, sobre todo en el móvil). Lo usan también los repintados que llegan solos
  (sincronizar con la nube, volver a la app, la bandeja) y `pintarSocial` (mira `modalEnPantalla()`).
- **Sin conexión (datos.js, «SIN CONEXIÓN»):** copia por usuario en IndexedDB (`bitacora-copia`: `base` = datosBase y
  `local` = lo de la app, `pendiente`). `loadData` arranca con ella si no hay red (`modoSinConexion`) o si quedó algo
  pendiente; `saveData` sin red guarda la copia con `pendiente` en vez de fallar, y al volver la red (`online`,
  `volverAConectar`, o el siguiente arranque) se fusiona a tres bandas como cualquier dispositivo. `esErrorDeRed()` decide
  qué es «sin red»; el resto de errores sigue fallando como antes. Sin red se entra con la sesión guardada
  (`usuarioGuardado()`) y la suscripción leída la última vez (`bitacora-sub-<uid>`). El service worker guarda también
  las librerías de los CDN y las tipografías (`CDN_GUARDADOS`; en index.html llevan `crossorigin` para no ser opacas).
  El service worker sirve desde su copia lo que no cambia (archivos propios con `?v=`, librerías con versión exacta, tipografías) y borra las versiones viejas; el resto va «red primero». jsPDF y pdf.js se cargan solo al exportar o leer un PDF (`cargarJsPDF`, `PDFJS_URL` en eventos.js). La app cuenta de forma anónima qué apartados se abren (`contarApartado` en calendario.js, GoatCounter; se ve en el pulso, «Uso de la app»), y los fallos que ve la gente: errores sin capturar y avisos de error de `showToast` (`contarFallo` al principio de nucleo.js, sin números, enlaces, correos ni textos entre comillas). Las llamadas del arranque y del guardado van por `authConRed` / `consultaConRed` (nucleo.js): sin red no se hacen
  y, si no responden (6 s sesión, 12 s datos), se sigue sin red; la librería de Supabase si no esperaba ~30 s renovando.
- **Transiciones de vista (`conTransicion`, interfaz.js):** mientras dura una, el navegador pinta su "foto"
  por encima de todo; por eso `showModal`, el buscador y otras capas llaman a `vtCortar()` para cortarla
  (si no, quedaban debajo, tapadas por el contenido). **Cualquier capa nueva que se abra encima debe
  llamar a `vtCortar()`.** Finanzas cachea los saldos por pintado (`financeSaldosCache`, se vacía en
  `render()` e `invalidarCachesDerivadas()`).
- **PWA / versión móvil:** cuando la app se abre en modo standalone (añadida a
  pantalla de inicio en iOS/Android), se oculta la interfaz de escritorio y se
  muestra un `#mobile-shell` aparte que sigue siempre a `currentView`: inicio con el
  mes en bolitas (días con cosas en `--m-acento`, se pulsan para ver ese día) y
  teselas con cifras, menú a pantalla completa con filas numeradas (botón de arriba a
  la derecha, `toggleMenuMovil`) y una página por apartado con título enorme en dos
  tonos (`renderMobileCabecera`). Planificador, Finanzas, Estudios, Hábitos, Eventos,
  Notas y Viajes tienen vista propia (`MOBILE_SECCIONES`); el resto reutiliza su
  `renderXxx()` de escritorio dentro de `.m-generico`. Navegar con `mobileIr(view, tipo)` (si ya estás en esa
  vista, sube arriba; la página entra de lado con `.m-pag-adelante`/`.m-pag-atras` o funde desde la barra con `m-pestana`, sin View Transitions, que en iOS
  parpadeaban; **sin `viewport-fit=cover`**: con él iOS dejaba un hueco vacío bajo la barra
  de abajo y la landing quedaba bajo la hora sin poder pulsarse; al bajar,
  `body.m-plegada` recoge el título en la barra de arriba). En `.m-generico`, una sola acción naranja (`btn-modal-primary`) y
  el resto de botones con tinte translúcido. Barra de pestañas abajo (`renderMobileTabbar`: inicio, plan, + captura, el último
  apartado visitado `mobileReciente` y menú; el botón de menú de arriba está oculto). El inicio enseña la
  semana del día elegido (o el mes en bolitas, `mobileVerMes`) y el día como horario (`.m-tl`, con marca de
  "ahora"; la semana va en un carrusel nativo de tres semanas con encaje por semana, `mobileCentrarCarrusel` / `mobileCarruselPaso`; el mes en bolitas se desliza con `mobileDeslizarFranja`). Hoy, el inicio enseña también las tareas sin día (`renderMobilePendientesInicio`) y lo hecho se queda 30 minutos (`hechaEn`, que guardan las tareas, las sin día y las recurrentes al marcarse; `mobileHechaReciente` repinta al cumplirse) y luego se va, salvo con «ver las hechas.» (`mobileVerHechas`). Al volver de segundo plano
  más de 30 s se repinta sola (`refrescarAlVolver`, inicio.js) y si cambió el día vuelve a hoy. Estudios en el móvil enseña el horario
  un día cada vez (`renderMobileHorario`). Paleta propia del móvil (`body.mobile-standalone` / `body.pwa` + tema) con `--m-superficie`
  para las tarjetas. Tamaño de letra del móvil con `zoom` (`TAMANOS_LETRA` en datos.js): dentro de lo que lleva zoom (`.m-app`, las hojas de los
  modales) las medidas de pantalla (vh, dvh, vw) se dividen por `var(--m-zoom, 1)`, o la hoja sale por arriba. Al tocar una pestaña de
  `PESTANAS_ANIMADAS` (interfaz.js) lo de debajo entra de lado (`animarCambioPestana`). Iconos de categorías de Finanzas: el set del
  usuario en rejilla de 48 (`FINANCE_PRO_CATEGORY_ICON_SET`), no rehacerlos.
- **Temas:** "pizarra" (gris azulado con tinta azul marino, clase `body.papel.pizarra`, sus colores al final de
  `styles.css` en "TEMA PIZARRA"; barra lateral y barra de abajo en `#1A2D42`). Y los de siempre: "asfalto" (oscuro, por defecto, sin clase), "papel" (claro, clase
  `body.papel`) y "teja" (piedra cálida, negro y naranja teja a lo cartel suizo; por
  compatibilidad conserva la clave `acuarela` y las clases `body.papel.acuarela`:
  hereda todo lo de papel y añade su paleta). Variables CSS en `:root`, `body.papel` y
  `body.papel.acuarela`; los colores por elemento de teja están al final de
  `styles.css` ("TEMA TEJA"). Se elige en Ajustes (`setTheme`). Hay un cuarto tema, "fundador" (dorado), solo
  para socios fundadores, y "oliva" (marfil, oliva y ciruela; `body.papel.oliva`, al final de styles.css) para quien invita a un amigo o entra invitado (`temasDisponibles()`, `temaAmigosDesbloqueado()`). Los socios fundadores y la cuenta del creador tienen todos: la contraseña de desarrollador se pone una vez y queda en la cuenta (`user_metadata.desarrollador`, `cuentaDesarrollador`, `marcarCuentaDesarrollador` en vault.js), con el modo desarrollador encendido al entrar en cualquier dispositivo. **Al añadir un tema** hay que tocar `THEMES` /
  `THEME_CLASSES` (datos.js), las muestras de `renderSelectorTema` y de `renderMobileMenu` (nucleo.js)
  y el script en línea de `index.html`: si falta una muestra, la PWA se queda en negro.

## Convenciones establecidas (seguirlas sin que haga falta repetirlas)

- **Etiquetas en minúscula y con punto final:** "hoy.", "grabar datos.",
  "planificador.", "trabajos./exámenes." — es el estilo de toda la app, no una excepción.
- **Iconos "TARJETA BITACORA":** SVG sólidos, geométricos, `fill="currentColor"`
  (para heredar el color del tema), normalmente `viewBox="0 0 100 100"` salvo que se
  use un trazado vectorizado real proporcionado por el usuario (entonces se respeta
  su propio viewBox).
- **Sin comentarios** salvo que expliquen un motivo no obvio (una decisión de diseño,
  una limitación, un bug ya corregido y por qué se hizo así). Nunca comentarios que
  describan qué hace el código.
- **Diffs mínimos**, sin refactors no pedidos, sin abstracciones prematuras.
- **Sin punto medio («·») como separador** (2026-10-18): en la interfaz, comas, o un espacio tras una etiqueta que
  ya acaba en punto («hoy. tareas.»). Lo que llega por el conector se limpia (`sinPuntoMedio` en el servidor,
  `sinPuntoMedioConector` en la app) y la IA tiene la instrucción de no usarlo.
- **Sin gestos de plantilla** (barrido del 2026-10-17, para que no "parezca hecha con IA"): nada de rayas de color a
  un lado (`border-left`/`inset` de 2px+ en tarjetas o filas: el color va en un punto o en el asa; la prioridad de
  una tarea, en el aro del círculo de marcar), ni pastillas: botones, chips y pestañas llevan esquina de 10 px
  (grupos de pestañas 12 px por fuera y 8 px dentro); redondo solo lo que significa algo (marcar, contadores, barras),
  ni etiquetas en mayúsculas espaciadas (las etiquetas van en minúscula), ni etiquetas pequeñas encima de un título,
  ni números de sección, ni velos con `backdrop-filter: blur`, ni tarjetas que se elevan al pasar el ratón, ni
  resplandores radiales de acento, ni anillos de progreso como adorno (en su lugar, sellos), ni rayas largas («—»)
  como inciso en los textos. Los iconos pequeños son `<i class='ico ico-x'>` (x, izq, der, lapiz, bajar, repetir,
  apagar, cambio: máscaras SVG en styles.css), nunca glifos (✕ ‹ › ✎ ⭳ ↻ ⏻ ⇄) ni emojis. La selección, el cursor, el
  foco y las barras de scroll llevan la tinta del tema. En el inicio del móvil, el día va en renglones con puntos
  guía (`.m-libro`), no en teselas.
- **Escapar siempre (seguridad, 2026-10-20):** `escapeHtml` escapa también las comillas (para textos dentro de atributos);
  dentro de una cadena JS en un atributo (`onclick="f('...')"`) se usa `jsAttr()`, nunca `escapeHtml(...).replace(/'/g, ...)`.
  Lo que llega de otras personas (amigos, enlaces compartidos) es lo más delicado. Contraseñas del Vault con PBKDF2
  (`hashPassword` / `comprobarClave`); las de cuenta pasan por `revisarContrasena` (8 caracteres y Have I Been Pwned).
  Auditoría de la base de datos en `supabase/sql/auditoria_seguridad_2026-10.sql`.
- **La app NO tiene reset global de `box-sizing: border-box`** — si el tamaño en
  píxeles de algo importa (centrar contenido interno de un elemento con borde, p. ej.
  un checkbox a medida), hay que declararlo explícitamente en ese elemento o los
  cálculos de posición salen mal.

## Skills de diseño instaladas (en `~/.claude/skills`, no en el repo)

- **Emil Kowalski** (`emil-design-eng`, `animate`, `review-animations`,
  `improve-animations`, `find-animation-opportunities`, `animation-vocabulary`):
  criterio para animaciones (ease-out fuertes, UI < 300 ms, solo transform/opacity,
  nada en acciones de teclado, reduced-motion).
- **Impeccable** (`impeccable`): auditar y pulir tipografía, contraste, espaciado y
  estructura. Solo están su SKILL.md y sus guías: el lanzador `scripts/impeccable`
  (que descarga y ejecuta un binario) y sus hooks NO se instalaron a propósito; usar su
  modo de reserva ("Launcher unavailable": leer el contexto del proyecto directamente).
- **La identidad de Bitácora manda** sobre las opiniones de cualquier skill: Poppins,
  minúsculas con punto, los tres temas, iconos sólidos geométricos, el brutalismo de la
  bandeja. Se usan para detectar fallos y pulir, no para rediseñar a su gusto, y los
  cambios que propongan se enseñan al usuario antes de aplicarlos.

## Subagente explorador (Haiku)

`.claude/agents/explorador.md`: subagente con Haiku y solo lectura (Read, Grep,
Glob), que se lanza con el Agent tool (`subagent_type: "explorador"`). **Solo para
exploraciones grandes o abiertas**: entender un apartado que no se conoce, seguir un
dato a través de varias funciones o revisar cientos de líneas de `js/` o `styles.css`.
Ahí ahorra cupo del plan Pro porque a la conversación principal solo llega su resumen.

No usarlo para localizar algo concreto (un nombre de función, una clase, una
variable): cada lanzamiento cuesta unos 10.000 tokens fijos (medido el 2026-10-06),
mucho más que un `Grep` directo. Además se inventa detalles periféricos de vez en
cuando, así que antes de editar hay que comprobar en el sitio exacto lo que dice. Las
ediciones, las pruebas y las decisiones las hace siempre el agente principal.

Lo que más cupo ahorra no es el explorador sino las conversaciones cortas: una sesión
nueva por tema (CLAUDE.md y la memoria ya llevan el contexto) y capturas de pantalla
a menor resolución.

## Cómo se prueba un cambio (no hay suite de tests)

1. Editar los archivos de `js/` y `styles.css` en el repo real.
2. Copiar los archivos tocados a `C:\Users\jandr\Downloads\bitacora-mirror\`.
3. Servir esa carpeta en local: `py -m http.server <puerto>` (usar un puerto libre
   cada vez, matar el proceso al terminar).
4. Abrir en el Browser pane integrado (`preview_start`/`navigate`), y para lo que
   necesite datos de sesión/Supabase, montar una página de prueba mínima en el
   scratchpad que defina un `window.supabase` de mentira (`createClient` devolviendo
   stubs) antes de cargar los archivos de `js/`, rellene las variables globales necesarias a mano
   (`entries`, `studies`, `financePro`, etc.) y llame directamente a la función
   `renderXxx()` o a la lógica a probar.
5. Verificar visualmente (screenshot) y/o por JS (`javascript_tool`) antes de dar el
   cambio por bueno.
6. **Si cambian `styles.css` o algún `.js`, subir la versión `?v=` de index.html** (todas a la vez:
   GitHub Pages deja que el navegador guarde CSS/JS 10 minutos, y sin cambiar la versión se mezcla
   el HTML nuevo con el CSS viejo).
7. Commitear y hacer **`git push origin main` sin pedir confirmación** (instrucción
   permanente del usuario) — mensajes de commit en español, descriptivos, con la
   línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Si un mensaje de
   commit lleva comillas dobles anidadas y falla por parseo en PowerShell, escribirlo
   a un archivo en el scratchpad y usar `git commit -F <archivo>`.
8. Para PDFs: `pdftoppm` no está instalado en este entorno (no se puede usar
   `Read` con `pages` para renderizar páginas como imagen) — usar `pdftotext -layout`
   o `pypdf`/`reportlab` (instalables con `py -m pip install`) en su lugar.

## Mapa rápido de apartados grandes ya construidos

- **Calendario:** vistas día/semana/mes; en la vista mensual, los eventos se marcan
  como puntos de color (no líneas) bajo el número de cada día.
- **Panorama (vista `home`, antes "Centro resumen"):** dashboard de lanzadores a cada apartado + estadísticas.
- **Planificador:** timeline diaria (pestañas Hoy/Mañana/Pasado mañana, cada día
  empieza a las 4:00 am, lo no marcado se arrastra al día siguiente destacado en
  granate), tareas recurrentes, bloque "tareas pendientes." (backlog sin fecha/hora
  fija, con botón "→ hoy" para pasarlas a la timeline), tarjetas de acción "+ evento."
  / "recurrentes." (muestran siempre la cifra de HOY), franja "progreso de hoy." tipo
  tarjeta de sellos, tarjetas de evento con checkbox circular propio (sin tick, solo
  se rellena) y píldora de hora.
- **Finanzas:** dos sistemas conviven — "Finanzas PRO" (cuentas Efectivo/Bancos/Online
  + transacciones + categorías + reglas de importación + registro rápido) y un
  sistema "simple" más antiguo (patrimonio operativo/emergencia/inversión). "Largo
  plazo": planificación mensual de sueldo + aportaciones repartidos en casillas,
  historial mes a mes, wishlist con semáforo según el sueldo sin asignar acumulado,
  múltiples cuentas de inversión. Export a Markdown pensado para pegar en una IA.
  Suscripción de pago (Stripe): cuentas anteriores a `CUTOFF_LANZAMIENTO_PAGO` gratis para
  siempre ("legado"); las nuevas tienen `DIAS_PRUEBA` (14) días sin tarjeta desde que se crean
  (estado "prueba", calculado en el cliente) y luego la pantalla "tu prueba gratuita ha terminado."
  con "descargar mis datos.". El pago lo crea la Edge Function `crear-pago` (mensual/anual con los
  precios de los Payment Links, sin prueba de Stripe; y socio fundador: 29,99 € único, 100 plazas,
  `socio_numero` en `suscripciones`, ver `supabase/sql/socios_fundadores.sql`). Los socios ven
  "socio fundador nº xx" en Home (`#socio-badge`, abre sus 3 códigos de regalo de 6 meses:
  `mis_codigos_regalo` / `canjear_codigo_regalo`, estado "regalo" — ver `supabase/sql/codigos_regalo.sql`),
  tienen el tema `fundador` (dorado) y sus condiciones en `openCondicionesFundador()`.
  Bienvenida de 6 pasos para cuentas nuevas, aviso de días de prueba en Home y vuelta a la
  pantalla de pago si la prueba caduca con la app abierta: `js/bienvenida.js` (marca `bienvenida`,
  sincronizado). En el servidor, `tiene_acceso(uid)` (`supabase/sql/tiene_acceso.sql`) corta avisos
  push, conector y seguimiento de envíos a cuentas sin acceso. Textos legales en `legal.html`;
  eliminar cuenta y portal de Stripe: Edge Functions `eliminar-cuenta` y `portal-pago`.
- **Estudios:** asignaturas con exámenes/trabajos (bloques con estética editorial en
  blanco y negro, agrupados en pendientes/pasados), horario semanal, notas rápidas.
  Los trabajos con fecha se sincronizan automáticamente como tarea del Planificador
  ("trabajo pendiente. ...") el día de entrega — con cuidado especial en que el
  estado "hecho" sobreviva a que esa tarea se archive al pasar su día (la fuente de
  verdad permanente vive en el propio trabajo de Estudios, no en la tarea efímera del
  Planificador).
- **Universidad (`js/universidad.js`, vista `universidad`, opcional):** la carrera por cuatrimestres
  dentro de `studies.carrera` (grado, créditos, `cuatrimestres` con fechas de clases/exámenes/
  extraordinaria y su `horario`, `actual`); cada asignatura lleva `cuatrimestre`, `creditos`,
  `notaActa`, `convalidada`, `anual` (un periodo 0 es un curso completo). Con ella activa, Estudios lista solo `asignaturasEnCurso()`, y al
  cambiar de cuatrimestre (`hacerCuatriActual`) se guarda/recupera `studies.schedule`.
- **Profesorado (`js/profesorado.js`, vista `profesorado`, opcional):** cuadrante tipo hoja de cálculo
  (columna por clase con su `color`, fila por día) en `profesorado` (sincronizado: `clases`, `sesiones`
  —varias por casilla, `hecha` true/false/null = sin casilla, `descartada`—, `festivos`, `nombresFestivos`,
  `curso`). Las tareas se arrastran con puntero (`profeArrastrar`, vale en iPhone) y se corren "como
  vagones" (`profeEmpujarClase` / `profeAdelantarClase`) al correr una pendiente o al marcar/quitar un día
  no lectivo. Calendario escolar de Zaragoza 2026-27 en `PROFE_CALENDARIOS`. Importa el JSON que genera una
  IA con `PROFE_PROMPT_IA`; ejemplo en `ejemplos/cuadrante-ejemplo.json`. `js/profesorado-aula.js`: ficha de
  clase con pestañas (resumen con avance del temario, cuaderno de notas con `alumnos`/`evaluaciones`/
  `calificaciones` y media ponderada, `deberes`, `horario` por franjas, notas del día en `notasDia`),
  horario semanal, copiar a otro grupo, `plantillas` y exportación PDF (jsPDF + autotable) y Excel
  (ExcelJS), ambas cargadas con `cargarScript` solo al exportar.
- **Agenda laboral (`js/agenda-laboral.js`, dentro de Empleo con un empleo actual):** `agendaLaboral`
  (sincronizado: `enPrincipal`, `horario` por día de la semana, `citas` con id `lab_...`). Estilo propio
  más sobrio (`.lab-*`). Si `enPrincipal`, las citas entran al calendario por `getRecurringCalendarEntries`
  y el horario manda sobre los días de trabajo en `getDayAllEntries`; `openEntryDetail`/`deleteEntry`
  desvían los `lab_`.
- **Perfil (`js/perfil.js`):** foto y frase en la tabla `perfiles_fotos` (solo la ven uno mismo y sus
  amigos, ver `supabase/sql/perfiles_fotos.sql`). Toda foto se procesa en el cliente a 256 px, blanco y
  negro con grano (`procesarFotoPerfil`). Sale en Home (`#mi-avatar`, inicio móvil) y en la lista de amigos.
- **Rutinas (antes Hábitos; vista y datos siguen siendo `habits`, en `planificador.js`):** momento del día,
  `frecuencia` (diaria / días / x por semana), `pasos` con `pasosHechos`, semana de bolitas que marca días
  pasados, `habitStreak` respeta los días que no tocan; al marcar se repinta solo la rutina (`repintarRutina`).
- **Compras (`js/compra.js`, vista `compra`, opcional de #home; en la interfaz "Despensa", antes "Compra" y "Compras"):** `listaCompra` (sincronizado)
  con listas, secciones del súper por palabras clave (`COMPRA_SECCIONES`, con `aperitivo` antes que fruta) más lo aprendido
  (`aprendido`, clave `compraClave`), "lo de siempre" (`frecuentes`), `historial` de compras (al terminar o con el ticket) y
  "terminar la compra." que apunta el gasto en Finanzas. El ticket llega por la herramienta `ticket_compra` del conector (op
  `ticket`, `compraAplicarTicket` / `compraDeshacerTicket`): cada línea con precio, sección y `de_lista`; lo que no estaba en la
  lista es un extra. Precios (último por tienda, más barato, lo que sube) y "cómo te ciñes" salen del historial.
  Pestaña recetas (`listaCompra.recetas`, `openReceta` / `openEditarReceta` / `recetaALaLista`): ingredientes con
  coste según los tickets (cada ingrediente cuenta una vez) y paso a la lista marcado con `recetas`; herramienta
  `receta` del conector (op `receta`, `compraAplicarReceta` / `compraDeshacerReceta`). Mercadona tiene API pública sin CORS (tienda.mercadona.es/api,
  necesitaría una Edge Function); DIA bloquea con antibots: no se usa.
- **Estudios con pestañas (22-10):** `studies` (asignaturas.), `estudiar` (repaso., antes Estudiar) y `universidad` (carrera., antes Universidad) siguen siendo vistas y opcionales distintos, pero en los menús salen como una sola entrada «Estudios» (`ESTUDIOS_GRUPO`, `enMenu`, `estudiosVistaInicial`, `pestanasEstudios(activa)` en nucleo.js) con pestañas arriba de cada vista; `render()` manda a la primera pestaña activa si `studies` está apagado.
- **Test competitivo (`js/test.js`, pestaña test. de repaso):** tests tipo test en `estudiar.tests` (sincronizado) que se practican a solas o se juegan con amigos de forma asíncrona. Las partidas viven en Supabase (`partidas_test`, `resultados_test`, soluciones en `partidas_test_soluciones` que nadie lee) y todo pasa por funciones: `crear_partida_test` (3 al día, solo invita a amigos), `empezar_partida_test` (una vez por persona), `terminar_partida_test` (puntúa en el servidor: 100 por acierto y hasta 50 por rapidez), `clasificacion_partida_test`, `soluciones_partida_test`; ver `supabase/sql/tests_competitivos.sql`. Prompt para la IA en `TEST_PROMPT_IA`; herramienta `test` del conector (op `test`). Se responde con 1-6 del teclado.
- **Repaso (antes Estudiar; `js/estudiar.js`, vista `estudiar`, opcional de #school):**
  `estudiar` (sincronizado): pomodoro (el que está en marcha va en localStorage `bitacora-pomodoro`, con
  pastilla flotante `#pomo-pastilla` fuera de la vista), plan del día repartido en pomodoros (`estRepartir`,
  "pasar al planificador."), temario por asignatura y tarjetas tipo Anki (básica, ida y vuelta, escribir,
  huecos `{{c1::}}`) programadas con FSRS-4.5 (`fsrsOpciones`, estado por cara en `repasos['id:cara']`).
  Importa "frente;reverso" o TSV y exporta TSV para Anki. Durante un repaso, `canUseGlobalShortcut` se
  desactiva para que espacio y 1-4 no abran la captura rápida.
- **Proyectos → gestor (`js/proyecto.js`):** cada proyecto se abre en su gestor (`abrirProyecto`, `proyectoAbierto`):
  resumen (siguiente paso, la colina 0-1 de Basecamp, cifras, fases), tareas por fases (`tareas` con estado
  pendiente/curso/hecha, fecha, fase; `tasks` se mantiene sincronizado para la ficha, el conector y las
  estadísticas), fases y diario. "→ hoy" crea una tarea del planificador con `proyectoTareaId` y
  `togglePlannerItemDone` la completa en el proyecto. El planificador enseña "siguientes pasos.".
- **Apuntar (`js/apuntar.js`):** el + del móvil, el rayo del escritorio y el "+" de cada día abren `openApuntar(fecha)`.
  `apuntarTrocear` parte una frase en varias cosas (líneas, «;», puntos, y comas o «y» seguidas de una fecha o un verbo
  de `APUNTAR_ARRANQUE`, o cuando los dos trozos tienen su propia fecha/hora/repetición/importe, salvo listas de días);
  `interpretarApunte` saca fecha (también rangos «del 3 al 7»), hora (y hora de fin), importe, cuenta, categoría,
  repetición, lugar y de qué se trata; `apuntarTipo` elige entre tarea, evento, gasto, compra, nota, cumple, examen,
  trabajo, recurrente, clase y viaje. Los tipos nuevos se crean con `aplicarOpConector` (se registran en el historial
  del conector con origen «apuntar» y se deshacen con `deshacerConector(ref, true)`). Vista previa por cosa con su
  selector de tipo; `apuntesRecientes` (sincronizado, 40) con deshacer/cambiar. Cumpleaños sin año: `birthDate` 2000 y
  `sinAnio`. La primera palabra puede forzar el tipo (`r.forzado`: evento, tarea y los de Ocio libro/serie/peli/juego,
  `APUNTAR_OCIO`, que se crean con la op `ocio`); con hora y sin verbo delante, o «con alguien» (`r.conGente`), es evento;
  una «y» solo parte si después empieza otra cosa o los dos trozos tienen fecha (`apuntarConFecha`). Los importes dichos con palabras delante de euros/€/pavos se pasan a cifras (`apuntarCifrasEscritas`), y de 8 a 11 sin «de la mañana» es de noche si el plan lo es (cena, copas, concierto…). El botón flotante del escritorio es "+ apuntar." (#fab).
- **Fechas:** `todayISO()` e `isoLocal(d)` son en hora local. Nunca `toISOString().slice(0, 10)` para "hoy" (en UTC,
  de 0:00 a 2:00 daba el día anterior).
- **Ramas de apartados:** `RAMAS_APARTADOS` en ajustes.js agrupa los opcionales (#school, #home, #work, #mind).
- **Importar extractos:** la fecha es la de inicio si el extracto la trae (`colInicio`; al completarse un pendiente se queda la más temprana). Al final de cada importación, `financeProFusionarManuales` funde los apuntes a mano sueltos con su gemelo del banco (también de otra cuenta si el importe lleva céntimos) y `financeProEmparejarTraspasos` convierte en traspaso la salida y la entrada entre cuentas propias (importe exacto, ≤2 días, los dos conceptos con pinta de transferencia, nunca Bizum; el otro lado queda en `claveImport`). Después, primero la coincidencia exacta, luego pendientes (≤3 días, importe exacto antes que
  aproximado, sin reutilizar), recuento de claves (dos cargos iguales cuentan dos) y, si el CSV trae saldo
  (`Balance`), `financeProCuadreExtracto` compara y enseña qué sobra o falta. Marcas `viaje` (fuera de
  presupuestos y ritmo; pestaña Gastos del viaje) y `ahorro` (bolsillos de Revolut, ni ingreso ni gasto).
- **Landing:** el cerebro de la portada (`montarCerebro` en landing.js, `CEREBRO_ZONAS`) y el modal
  "actualizaciones." (`NOVEDADES` / `openNovedades` en landing.js). **Al añadir un apartado o algo grande, apuntarlo
  arriba del todo en `NOVEDADES`** (fecha, rama, nombre, para quién y una línea).
- **Semana de ejemplo (`js/ejemplo.js`, 23-10):** opcional en el último paso de la bienvenida (`bienvenidaBorrador.ejemplo`). `cargarEjemplo(perfil)` mete eventos, un viaje, tareas, gastos (uno de viaje), una nota, una rutina y, si estudia, una asignatura con examen; todo con `ejemplo: true` e id con «ejemplo_» (`esEjemplo`). Mientras `hayEjemplo()`, franja fija `#ejemplo-franja` (la pone `render()`) con «empezar con lo mío.» → `quitarEjemplo()` borra solo eso.
- **Tu mes (`js/tumes.js`, Panorama → «tu mes.»):** tarjeta 1080 × 1920 dibujada en canvas con los colores del tema (`dibujarTuMes`); grupos y cosas sueltas se quitan antes de exportar (`tuMesEstado.quitados`; el dinero empieza apagado); guarda o comparte el PNG (`navigator.share` con archivo).
- **Invitar a un amigo (`js/invitar.js`, `supabase/sql/invitaciones.sql`):** código por cuenta (`mi_codigo_invitacion`, Ajustes → cuenta) y enlace `/?amigo=CODIGO` (se guarda en localStorage y va en el alta como `user_metadata.codigo_amigo`); al entrar, `usar_codigo_invitacion` da 30 días de prueba (`DIAS_PRUEBA_AMIGO`, también en `tiene_acceso`). `invitacion` (invitado, amigos) y `temaAmigosDesbloqueado()` para el tema «oliva.» (colores pendientes de Alejandro).
- **Fin de la prueba, pregunta y aviso para volver (23-10, bienvenida.js y avisos-diarios):** `openFinPrueba` / `loQueLlevas` (3 días antes y el último, también con `/?finprueba`); a los 7-60 días, una vez, «¿qué echas en falta?» → tabla `sugerencias` con «[7 días]»; `comprobarAvisosDeArranque` saca como mucho una de las dos al arrancar. avisos-diarios a las 19:00: `finprueba` (cuentas en prueba sin fila de suscripción) y `volver` (4 días sin abrir según `actividad`, `supabase/sql/actividad.sql`, que la app marca con `marcar_actividad` una vez al día; uno por semana).
- **Correo de los domingos (función `correo-semanal`, `supabase/sql/correo_semanal.sql`):** opcional (Ajustes → conexiones, tabla `correo_semanal`, `poner_correo_semanal`); domingo 18:00 de Madrid, por Resend (`RESEND_KEY`, remitente semana@appbitacora.es), baja firmada con `CORREO_SECRET`.
- **Portadas por perfil (23-10):** `estudiantes/`, `profes/`, `finanzas/` y `trabajo/` redirigen a `/?perfil=...` (conservan el `?ref=` del vídeo o ponen `perfil-<nombre>`); `PORTADAS` / `aplicarPortadaPerfil` en landing.js cambian el titular y suben su bloque.
- **CV (`js/cv.js`, Empleo → "crear mi cv."):** asistente por pasos (contacto, cada empleo con
  `cvFunciones`/`cvAprendido`/`cvHabilidades`, formación, idiomas, habilidades, perfil propuesto)
  que guarda `perfilLaboral` (sincronizado) y genera un PDF de una columna con jsPDF.
- **Eventos:** iconos propios por tipo (fútbol, social, etc., algunos vectorizados a
  partir de imágenes reales del usuario), tarjeta "próximo evento hoy." a dos
  columnas cuando hay varios (eventos normales / trabajos-exámenes).
- **Versión móvil PWA:** ver arquitectura arriba.
- **Landing (`#landing-screen` en index.html, movimiento en `js/landing.js`):** portada, cinta, seis
  bloques (calendario, finanzas, estudios, empleo, amigos, móvil) con recortes de componentes reales en tema claro (`img/landing/*-claro.webp`, hechos con datos inventados y
  Chrome headless aislando un elemento) sobre tarjetas `.lp-captura`,
  promesa, cómo la usa su creador, precios, preguntas y pie con los textos legales. Los bloques con
  `.revela` aparecen al hacer scroll (IntersectionObserver sobre `#landing-screen`, que es el
  contenedor con scroll). Vault y su etiqueta "Privado" solo se ven con `body.dev-mode`.
- **Conector Claude/ChatGPT y Bandeja:** `supabase/functions/bitacora-mcp` (servidor MCP)
  escribe en `conector_bandeja`; desde el 23-10 en la bandeja solo esperan validación el dinero (movimientos, correcciones, extractos) y los borrados, y la app aplica sola el resto (tareas, Estudios, horario, notas, hábitos, día, recurrentes, enlaces, deseos, entradas de viajes/suscripciones/objetivos/cumpleaños/documentos), eventos, entradas con QR, Ocio, tarjetas de Estudiar, tests,
  compra, proyecto (crear, tareas, mover, estado, fecha, quitar, fases, diario), objetivo (hitos, progreso, quitar), laboral
  (horario y citas de la agenda laboral) y profe (sesiones, días no lectivos, deberes) (`OPS_AUTOMATICAS`, con deshacer); la herramienta `agenda` devuelve también `ahora` (hora de Madrid) y deja el resto en el apartado "bandeja." para validarlo a mano
  (`aplicarOpConector` / `validarBandeja`). Historial con deshacer en `registroConector`.
- **Social (`js/social.js`, vista `friends`, antes "Amigos"):** pestañas gastos (grupos al estilo
  Tricount en `grupos_gastos` / `grupos_gastos_miembros` / `gastos_compartidos`, datos vivos y
  comunes con RLS por miembro — ver `supabase/sql/gastos_compartidos.sql`), eventos (`eventos_compartidos`,
  foto del evento que el amigo añade o descarta) y amigos (`renderAmigosLista`: solicitudes,
  código de amigo). Se repinta con `pintarSocial()`. Listas de ocio, viajes compartidos y
  recomendaciones siguen en sus apartados.
- **Envíos (`js/actualizaciones.js`, vista `actualizaciones`, antes "Actualizaciones"):** pedidos
  por internet (estado en cinco pasos, historial, movimientos); lista global `pedidos`. La Edge
  Function `seguimiento-pedidos` (pg_cron cada 2 h + botón "actualizar.") los avanza sola:
  InPost por su web y el resto por la API de 17TRACK si existe el secreto `TRACK17_KEY`.
- **Conexiones (`js/conexiones.js`, vista `graph`, antes "grafo"):** relaciones sacadas
  de los datos (lo que pasa durante cada viaje, partidos por equipo, personas, etiquetas,
  asignaturas, lugares, [[enlaces]]) con una constelación por centro.
- **Objetivos → método (`js/metodo.js`):** mandala del método Harada (8 pilares × 8
  acciones, cada acción puede pasar a Hábitos), paso kaizen (hábito ligado al
  objetivo), "para qué" y hansei semanal (lista global `hansei`).
- **Asistente (`js/asistente.js`):** `openResumenSemana` (Panorama → «esta semana.», y el aviso del domingo a las 20:00 de
  avisos-diarios, tipo `semana`, que abre la app en `/?semana`), `renderAvisoPresupuestos` (línea suave al pasar del 80 %; el límite es el de las
  casillas de Largo plazo del mes vinculadas a la categoría, `asistLimitesDelMes`, y si no `financePro.categoryBudgets`), `asistSuscripcionesDetectadas` (misma regla que la herramienta del conector; «no es» va a
  `financePro.suscripcionesIgnoradas`), `openPuedoPermitirme`/`asistPermitir`, `responderPregunta` (respuestas arriba en el
  buscador, `kind: 'respuesta'`) y `revisarCumplesRegalo` (tarea en `dayPlanner.backlog` una semana antes; `e.regaloAviso`
  guarda el año; aviso `regalos` en Ajustes).
- **Guía (`js/guia.js`):** modal completo con una sección por apartado (para qué sirve,
  pasos, cada botón, trucos), abierto desde Ajustes, el botón "?", el buscador y el
  menú móvil. **Al cambiar un apartado, actualizar su sección en `GUIA`.**
- **Perfil y apartados opcionales (Ajustes → apartados.):** `apartadosConfig` (sincronizado)
  con `perfil` (`estudiante` sin Empleo, `trabajador` sin Estudios ni avisos de exámenes,
  `ambos`) y `opcionales` (`APARTADOS_OPCIONALES`: envíos, proyectos, enlaces, etiquetas, conexiones y
  coleccionables; sin elección guardada, `porDefecto()` los activa solo si ya tienen datos). Todo lo que liste apartados pasa por `apartadoVisible(view)` /
  `navSeccionesVisibles()` (menús, buscador, captura rápida, ayuda, Ctrl+flechas,
  teselas del inicio móvil); `render()` saca de un apartado oculto. "Trabajo" se llama
  **Empleo** en la interfaz (la vista sigue siendo `work`).
- **Servicios públicos (`js/servicios.js`, datos en `servicios`, sincronizado):** festivos y puentes (Nager.Date por
  país y comunidad, `servicios.festivos` con ciudad y `locales`; `festivoDe`, `proximosPuentes`), la luz (REE PVPC,
  `renderLuzDia` en el planificador y `luzAviso` en tareas con aparatos), la pestaña Destino de cada viaje
  (Open-Meteo, Frankfurter, `PAISES_VIAJE`), «tu día» (`openTuDia`), tus equipos (función `deportes`) y estrenos de
  series (TVmaze) como entradas virtuales `srv_` en `getRecurringCalendarEntries` (se apuntan con `servicioApuntar` o
  se ocultan en `servicios.ocultos`). Cachés en localStorage `bitacora-festivos-*`, `bitacora-luz-*`,
  `bitacora-partidos-*`, `bitacora-serie-*`.
- **Siri y correo (función `entrada`):** tokens en `conector_tokens` con nombre `siri` / `correo` (copias en
  `servicios.siriToken` / `correoToken`), que `bitacora-mcp` rechaza. Siri encola la op `apuntar` (pasa por
  `apuntarTrocear`/`interpretarApunte`/`apuntarCrear`); el correo (`<token>@in.appbitacora.es`, ForwardEmail con
  webhook a `entrada/correo`) lee el schema.org de las reservas: ops `evento` / `pedido`, y si no, `correo` (tarea
  pendiente). Las tres están en `OPS_AUTOMATICAS`. Necesita en IONOS los MX del subdominio `in` hacia ForwardEmail.
- **Compartir sin registro (`js/compartir.js` + `c/index.html` + función `compartir`):** quedada (votar fechas,
  `quedadaElegir` crea el evento con `compartidoId`), invitación (voy/quizá/no), lista (tachan y añaden) y viaje
  (solo lectura, sin números de reserva). Se guarda en Storage (bucket `compartidos`: `<id>/meta.json` del dueño y
  un archivo por respuesta en `<id>/ev/`); la página pública `appbitacora.es/c/#ID` no necesita cuenta. Lo tuyo en
  `servicios.compartidos`, en Social, «con un enlace.»; aviso push al dueño en cada respuesta (`/?compartido=ID`).
- **Resto de apartados** con su propio `renderXxx()`: Hábitos, Notas, Documentos,
  Viajes, Coleccionables, Ocio, Trabajo, Proyectos, Enlaces, Etiquetas, Ajustes.

Este mapa no es exhaustivo — antes de dar por hecho que algo no existe, conviene
`Grep` en `js/` por el nombre del apartado o la palabra clave.
