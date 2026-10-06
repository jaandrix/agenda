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
  módulos ES), todo en unos pocos archivos grandes:
  - `app.js` — **~16.800 líneas**, el núcleo entero de la app (estado, render, lógica
    de cada apartado). Las funciones declaradas en top-level se vuelven globales.
  - `styles.css` — **~5.200 líneas**.
  - `index.html` — el shell HTML (contenedores vacíos: `#content`, `#modal-container`,
    `#mobile-shell`, etc., que `app.js` rellena).
  - `v23.js`, `pwa-install.js`, `service-worker.js` — utilidades/PWA.
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
  `styles.css` ("TEMA TEJA"). Se elige en Ajustes (`setTheme`).

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

## Cómo se prueba un cambio (no hay suite de tests)

1. Editar `app.js` / `styles.css` en el repo real.
2. Copiar los archivos tocados a `C:\Users\jandr\Downloads\bitacora-mirror\`.
3. Servir esa carpeta en local: `py -m http.server <puerto>` (usar un puerto libre
   cada vez, matar el proceso al terminar).
4. Abrir en el Browser pane integrado (`preview_start`/`navigate`), y para lo que
   necesite datos de sesión/Supabase, montar una página de prueba mínima en el
   scratchpad que defina un `window.supabase` de mentira (`createClient` devolviendo
   stubs) antes de cargar `app.js`, rellene las variables globales necesarias a mano
   (`entries`, `studies`, `financePro`, etc.) y llame directamente a la función
   `renderXxx()` o a la lógica a probar.
5. Verificar visualmente (screenshot) y/o por JS (`javascript_tool`) antes de dar el
   cambio por bueno.
6. Commitear y hacer **`git push origin main` sin pedir confirmación** (instrucción
   permanente del usuario) — mensajes de commit en español, descriptivos, con la
   línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Si un mensaje de
   commit lleva comillas dobles anidadas y falla por parseo en PowerShell, escribirlo
   a un archivo en el scratchpad y usar `git commit -F <archivo>`.
7. Para PDFs: `pdftoppm` no está instalado en este entorno (no se puede usar
   `Read` con `pages` para renderizar páginas como imagen) — usar `pdftotext -layout`
   o `pypdf`/`reportlab` (instalables con `py -m pip install`) en su lugar.

## Mapa rápido de apartados grandes ya construidos

- **Calendario:** vistas día/semana/mes; en la vista mensual, los eventos se marcan
  como puntos de color (no líneas) bajo el número de cada día.
- **Centro resumen (Home):** dashboard de lanzadores a cada apartado + estadísticas.
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
  Suscripción de pago (Stripe) ya implementada con cuentas anteriores a una fecha de
  corte con acceso gratis para siempre.
- **Estudios:** asignaturas con exámenes/trabajos (bloques con estética editorial en
  blanco y negro, agrupados en pendientes/pasados), horario semanal, notas rápidas.
  Los trabajos con fecha se sincronizan automáticamente como tarea del Planificador
  ("trabajo pendiente. ...") el día de entrega — con cuidado especial en que el
  estado "hecho" sobreviva a que esa tarea se archive al pasar su día (la fuente de
  verdad permanente vive en el propio trabajo de Estudios, no en la tarea efímera del
  Planificador).
- **Eventos:** iconos propios por tipo (fútbol, social, etc., algunos vectorizados a
  partir de imágenes reales del usuario), tarjeta "próximo evento hoy." a dos
  columnas cuando hay varios (eventos normales / trabajos-exámenes).
- **Versión móvil PWA:** ver arquitectura arriba.
- **Conector Claude/ChatGPT y Bandeja:** `supabase/functions/bitacora-mcp` (servidor MCP)
  escribe en `conector_bandeja`; la app aplica sola eventos, entradas con QR y Ocio
  (`OPS_AUTOMATICAS`) y deja el resto en el apartado "bandeja." para validarlo a mano
  (`aplicarOpConector` / `validarBandeja`). Historial con deshacer en `registroConector`.
- **Amigos/social:** solicitudes de amistad, código de amigo, listas de ocio y viajes
  compartidos, recomendaciones entre amigos (tablas SQL en `supabase/sql/`).
- **Resto de apartados** con su propio `renderXxx()`: Hábitos, Notas, Documentos,
  Viajes, Coleccionables, Ocio, Trabajo, Proyectos, Enlaces, Etiquetas, Grafo, Ajustes.

Este mapa no es exhaustivo — antes de dar por hecho que algo no existe, conviene
`Grep` en `app.js` por el nombre del apartado o la palabra clave.
