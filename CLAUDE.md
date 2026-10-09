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
  `conector` → `inicio` (init) → `actualizaciones` → `conexiones` → `metodo` → `universidad` → `profesorado` → `cv` → `social` → `perfil` → `bienvenida` → `guia` → `landing`.
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
- **PWA / versión móvil:** cuando la app se abre en modo standalone (añadida a
  pantalla de inicio en iOS/Android), se oculta la interfaz de escritorio y se
  muestra un `#mobile-shell` aparte que sigue siempre a `currentView`: inicio con el
  mes en bolitas (días con cosas en `--m-acento`, se pulsan para ver ese día) y
  teselas con cifras, menú a pantalla completa con filas numeradas (botón de arriba a
  la derecha, `toggleMenuMovil`) y una página por apartado con título enorme en dos
  tonos (`renderMobileCabecera`). Planificador, Finanzas, Estudios, Hábitos, Eventos,
  Notas y Viajes tienen vista propia (`MOBILE_SECCIONES`); el resto reutiliza su
  `renderXxx()` de escritorio dentro de `.m-generico`. Navegar con `mobileIr(view)`.
- **Tres temas:** "asfalto" (oscuro, por defecto, sin clase), "papel" (claro, clase
  `body.papel`) y "teja" (piedra cálida, negro y naranja teja a lo cartel suizo; por
  compatibilidad conserva la clave `acuarela` y las clases `body.papel.acuarela`:
  hereda todo lo de papel y añade su paleta). Variables CSS en `:root`, `body.papel` y
  `body.papel.acuarela`; los colores por elemento de teja están al final de
  `styles.css` ("TEMA TEJA"). Se elige en Ajustes (`setTheme`). Hay un cuarto tema, "fundador" (dorado), solo
  para socios fundadores (`temasDisponibles()`). **Al añadir un tema** hay que tocar `THEMES` /
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
  IA con `PROFE_PROMPT_IA`; ejemplo en `ejemplos/cuadrante-ejemplo.json`.
- **Agenda laboral (`js/agenda-laboral.js`, dentro de Empleo con un empleo actual):** `agendaLaboral`
  (sincronizado: `enPrincipal`, `horario` por día de la semana, `citas` con id `lab_...`). Estilo propio
  más sobrio (`.lab-*`). Si `enPrincipal`, las citas entran al calendario por `getRecurringCalendarEntries`
  y el horario manda sobre los días de trabajo en `getDayAllEntries`; `openEntryDetail`/`deleteEntry`
  desvían los `lab_`.
- **Perfil (`js/perfil.js`):** foto y frase en la tabla `perfiles_fotos` (solo la ven uno mismo y sus
  amigos, ver `supabase/sql/perfiles_fotos.sql`). Toda foto se procesa en el cliente a 256 px, blanco y
  negro con grano (`procesarFotoPerfil`). Sale en Home (`#mi-avatar`, inicio móvil) y en la lista de amigos.
- **CV (`js/cv.js`, Empleo → "crear mi cv."):** asistente por pasos (contacto, cada empleo con
  `cvFunciones`/`cvAprendido`/`cvHabilidades`, formación, idiomas, habilidades, perfil propuesto)
  que guarda `perfilLaboral` (sincronizado) y genera un PDF de una columna con jsPDF.
- **Eventos:** iconos propios por tipo (fútbol, social, etc., algunos vectorizados a
  partir de imágenes reales del usuario), tarjeta "próximo evento hoy." a dos
  columnas cuando hay varios (eventos normales / trabajos-exámenes).
- **Versión móvil PWA:** ver arquitectura arriba.
- **Landing (`#landing-screen` en index.html, movimiento en `js/landing.js`):** portada, cinta, cinco
  bloques con recortes pequeños de componentes reales (`img/landing/*.webp`, hechos con datos inventados y
  Chrome headless aislando un elemento) sobre tarjetas `.lp-captura`,
  promesa, cómo la usa su creador, precios, preguntas y pie con los textos legales. Los bloques con
  `.revela` aparecen al hacer scroll (IntersectionObserver sobre `#landing-screen`, que es el
  contenedor con scroll). Vault y su etiqueta "Privado" solo se ven con `body.dev-mode`.
- **Conector Claude/ChatGPT y Bandeja:** `supabase/functions/bitacora-mcp` (servidor MCP)
  escribe en `conector_bandeja`; la app aplica sola eventos, entradas con QR y Ocio
  (`OPS_AUTOMATICAS`) y deja el resto en el apartado "bandeja." para validarlo a mano
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
- **Resto de apartados** con su propio `renderXxx()`: Hábitos, Notas, Documentos,
  Viajes, Coleccionables, Ocio, Trabajo, Proyectos, Enlaces, Etiquetas, Ajustes.

Este mapa no es exhaustivo — antes de dar por hecho que algo no existe, conviene
`Grep` en `js/` por el nombre del apartado o la palabra clave.
