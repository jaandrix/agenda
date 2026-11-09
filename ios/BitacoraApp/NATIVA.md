# Bitácora nativa (SwiftUI)

Sigue la guía `GUIA-CLAUDE-BITACORA-NATIVA-SWIFTUI-IPA.md` (ChatGPT, 06-11-2026). La web y la PWA siguen siendo el
producto; esta app crece a su lado por cortes completos. La envoltura web (`BitacoraApp/`, `com.bitacora.app`) no se toca.

## Estado

**Fases 0 y 1 (06-11-2026): núcleo de solo lectura.**

- Target `BitacoraNative` (`com.bitacora.nativa.dev`, «Bitácora β»), se instala junto a la envoltura.
- Acceso con correo y contraseña de Supabase; sesión en el llavero (`AfterFirstUnlockThisDeviceOnly`). Se renueva sola;
  sin red se entra con la copia; solo un rechazo claro del servidor saca al acceso.
- Copia local por usuario en Application Support (protección de datos, fuera de la copia de iCloud): `base.json` (la
  fila tal cual) y `estado.json` (cola de operaciones, vacía, y diagnóstico). Se borra al cerrar sesión.
- `SyncEngine` (actor): un ciclo a la vez, al abrir, al volver a la app, al recuperar la red y al tirar hacia abajo;
  reintentos exponenciales con azar; se cancela al cerrar sesión. Solo trae.
- Pestañas «hoy.» (tareas del día lógico, solo lectura), «estado.» (diagnóstico) y «ajustes.» (tema, Face ID, web, salir).
- Enlaces `bitacoradev://apuntar?texto=&url=`, `bitacoradev://quick?type=expense|income` y «Abrir en» de un .txt: se
  validan, se guardan en cola y se atienden con sesión y sin bloqueo (por ahora, copiar y abrir la web).
- Face ID opcional al abrir, con el código del iPhone como recuperación; velo de privacidad en cuanto la app deja de
  estar activa (antes de la foto del selector de apps).

Pendiente para dar la fase 1 por terminada según la guía (14): probarla en el iPhone, Dynamic Type/VoiceOver revisados
en el dispositivo y medir el arranque en Release.

**0.2.0 (06-11-2026): arreglos de la auditoría de Codex y primera escritura.**

- Sesión con generación: una renovación que vuelve tarde no guarda nada si entretanto se salió o se entró con otra
  cuenta; salir y entrar cancelan y esperan la renovación en vuelo. Dos peticiones a la vez comparten una renovación.
- 401/403: una sola renovación forzada y un reintento; si la renovación se rechaza, sesión revocada; si con el token
  nuevo se vuelve a rechazar, error terminal sin reintentos. Solo se reintentan la falta de red, 5xx y 429.
- Cada ciclo de sincronización va ligado a cuenta y generación; detener e iniciar cancelan y esperan el ciclo anterior,
  y lo que vuelve de una generación vieja no guarda ni publica.
- «hoy.» marca y desmarca tareas (también las arrastradas de días anteriores, que pasan a hoy como al abrir la web) y
  crea tareas nuevas, con o sin hora. Ver el apartado «Escrituras».
- La prueba del contrato con la web corre en CI, que salta también con `js/datos.js` y `js/nucleo.js`.
- `PrivacyInfo.xcprivacy` (UserDefaults CA92.1; correo y contenido ligados a la cuenta, sin rastreo).

**0.3.0 y 0.4.0 (06-11-2026): fases 2 y 3.** Planificador entero (hoy, mañana, pasado, sin día, recurrentes; crear,
editar, mover, borrar; apuntar crea tareas) y calendario (mes con puntos, agenda del día, cumpleaños, viajes; crear,
editar y borrar eventos; avisos locales opcionales). Falta en el calendario lo de otros apartados: horario laboral,
pagos recurrentes, servicios y entregas de Estudios.

**0.5.0 (08-11-2026): fase 4, Finanzas.** Pestaña «finanzas.»: saldo líquido, patrimonio operativo y activos
totales (mismas reglas que la web, en Decimal), lo que entra y sale este mes (sin ahorros, ajustes ni inversiones),
saldo por cuenta y últimos movimientos; respeta «ocultar cifras» (`blurFinances`). Alta de movimientos a mano
(`crearMovimiento`, como el registro rápido de la web: `ptx_q_`, `manual`). Fuera: importar, presupuestos, editar y
borrar movimientos, inversiones. Diferencia: si `financeProfile.invested` es 0 la web usa el valor de la cartera.

**0.6.0 (08-11-2026): fase 5.** Pestaña «más.»: rutinas de hoy (marcar, `marcarRutina` como toggleHabitToday),
entregas de Estudios por venir, notas (leer y nota rápida, `crearNota`) y «abrir bitácora web.» en un
SFSafariViewController para lo no migrado (viajes, ocio, despensa, proyectos, enlaces, empleo, social...). El estado de
la sincronización pasa a «más.».

**0.7.0 (08-11-2026): fase 6.** El workflow saca también `BitacoraDefinitiva-unsigned-ipa`: la misma app con la
identidad de la envoltura (`com.bitacora.app`, «Bitácora», `bitacora://`) para sustituirla; la envoltura web solo se
compila a mano (`ios-build.yml`). Atajo de Siri «Apuntar en Bitácora» (App Intents, sin extensión), insignia con las
tareas de hoy sin hacer (con los avisos activados) y compartir el día desde «plan.». Sustituir la envoltura: abrirla
antes con red para que suba lo pendiente; los datos están en la nube. Widgets: siguen fuera (SideStore no instala
extensiones). WKWebView ya no se usa: lo no migrado va por SFSafariViewController.

**0.8.0 (08-11-2026): auditoría de la 0.7.0.** Escritura condicionada (`merge_bitacora_si`, hay que ejecutar
`supabase/sql/merge_bitacora_si.sql`; sin ella la app usa la de siempre y «estado.» lo dice): el servidor solo escribe
si los bloques siguen como el iPhone los leyó; si no, la app vuelve a leer y reaplica sus operaciones (hasta 4 veces).
Marcar una tarea hace lo mismo que la web (trabajo de Estudios, tarea del proyecto, marca «Completado»); las tareas
vinculadas no se editan, mueven ni borran en iOS. Ediciones por campos (`parcharTarea`, `parcharEvento`). Varias
operaciones en una sola escritura de la cola (crear con notas, apuntar con enlace). Movimientos sin categoría con
`needsReview`, orden de financeProCompararMov, gasto/ingreso rápido abre el editor nativo. Errores visibles en
rutinas, notas, borrar eventos y Siri; cola de enlaces con cerrojo. Artefactos: `Bitacora-INSTALAR-ipa` (definitiva) y
`Bitacora-beta-no-instalar-ipa`.

**0.8.1 (08-11-2026): reauditoría de la 0.8.0.** `supabase/sql/guardar_bitacora.sql`: `leer_bitacora()` devuelve la
fila con una huella (md5) por bloque y `guardar_bitacora(parche, huellas)` solo escribe si las huellas siguen igual.
**La PWA también** escribe así (`doSaveData`: `leerNubeConHuellas` / `escribirNubeProtegido`, reintenta hasta 4 veces
tomando lo leído como base) y ya no hace upsert de la fila. Ninguno de los dos cae a una escritura sin comprobar: sin
las funciones, la PWA falla el guardado y el iPhone deja el cambio en la cola. Con huellas ya no se suben dos veces
los bloques. El valor invertido en 0 usa la cartera como la web. La cola de enlaces avisa si no puede guardar o quitar.

**0.9.0 (08-11-2026): Estudios + Proyectos + Planificador.** Contrato en `CONTRATO-ESTUDIOS-PROYECTOS.md` (campos,
operaciones, proyección, conflictos y pruebas PWA–iOS). En «más.»: «estudios.» (asignaturas con exámenes y trabajos y su
estado como en la web; marcar trabajos entregados con `marcarTrabajo`, que también marca su tarea del plan; crear trabajo
o examen con `crearEntrega`, que crea su `evt_` y, si es trabajo con fecha, su tarea del plan) y «proyectos.» (progreso,
siguiente paso, tocar una tarea cicla pendiente → en marcha → hecha con `estadoTareaProyecto`, deslizar «→ hoy.» con
`proyectoAHoy`). Calendario: las entradas `evt_` ya no se editan en iOS (las reescribe la web) y los exámenes y trabajos
sin `evt_` salen como filas de solo lectura. Los exámenes no se marcan (la web no usa `done` en ellos). Marcar una
tarea de proyecto desde el plan respeta ahora lo que el conector añadió a `tasks`.

**0.10.0 (08-11-2026): identidad visual, primera tanda** (plan de ChatGPT `PLAN-CLAUDE-FASE-0.9-IDENTIDAD-VISUAL-NATIVA.md`).
Tokens de la PWA móvil en `DesignSystem/Tema.swift`, piezas en `DesignSystem/Componentes.swift` (`BitacoraCheck`,
`CabeceraApartado`, `CabeceraSeccion`, `FilaAgenda`, `AccionTexto`, `BarraBitacora`), barra propia en lugar de la del
sistema (plan, calendario, +, finanzas, más; ajustes dentro de más) y Plan rehecho como piloto (`PlanCuerpo`, sin `List`;
mover y borrar al mantener pulsado y por VoiceOver). Capturas de 390 pt en claro y oscuro: `CapturasTests`, artefacto
`capturas-diseno` del workflow. Sin cambios en datos ni sincronización.

**0.10.1 a 0.10.5 (08-11-2026): el resto del plan visual, sin esperar aprobación (lo pidió Alejandro).** Inicio nativo
(`InicioView`/`InicioCuerpo`: marca, semana, «ahora.», «hoy.», agenda continua, sin día; sin foto ni tiempo hasta que
haya dato real), barra inicio, plan, +, el último de calendario o finanzas, más. Calendario sin caja con la agenda del día
en `FilaEvento`. Finanzas con el saldo líquido como cifra principal y `FilaLibro` (`.m-libro-fila`) para el resto; ocultar
cifras no mueve nada. Más como índice. Hojas del sistema con fondo y tinta de Bitácora. Capturas: inicio y plan en claro
y oscuro, plan vacío, sin conexión y con letra de accesibilidad.

**0.11.0 (08-11-2026): paridad con la PWA (bloque 2 de la auditoría de la 0.10.5).**

- Repositorios fuera del documento (`Core/Servicios/ServiciosRemotos.swift`): perfil (`perfiles_fotos`, la foto en
  Caches por usuario), tiempo (Open-Meteo con `ciudadTiempo`, 30 min, como `cargarTiempo`), transporte (función
  `transporte`, 30 s; paradas del Ayuntamiento una semana) y deportes (función `deportes`, 12 h por equipo). Si uno
  falla, Inicio sigue.
- Inicio como `renderMobileTopbar` + `.m-home-editorial`: foto, marca, tiempo (hoja con previsión y ciudad), semana
  con día elegible, «ahora.»/«lo próximo.» con el bus, cabecera del día y la agenda completa: trabajo con la agenda
  laboral, citas laborales, pagos recurrentes vigentes (`suscripcionVigente`), entradas con QR y partidos.
- «menú.» con `NAV_SECTIONS` y la visibilidad de `apartadosConfig` (`Features/Mas/Apartados.swift`). Lo no nativo abre
  `appbitacora.es/#vista` (marcado «web.»). Nativos: inicio, plan, finanzas, rutinas, notas, eventos, estudios,
  proyectos, transporte y ajustes.
- Eventos y Transporte nativos; ficha de evento con QR (`CIQRCodeGenerator`, `qr` o `qrB64`).
- Operaciones nuevas: `ponerCiudadTiempo`, `transporteFavorita`, `transporteLinea`, `editarMovimiento`,
  `borrarMovimiento`, `crearTraspaso`, `editarItemEstudio` (mantiene el `evt_`), `borrarItemEstudio` (con su evento y
  su tarea), `crearProyecto`, `cambiarProyecto`. Todas idempotentes y por bloque, como las anteriores.
- Fuera todavía: estrenos de series, «cerca de ti» en Transporte, presupuestos y cuentas en Finanzas, asignaturas y
  horario en Estudios, fechas de fases y tareas en Proyectos.

**0.12.0 (08-11-2026): plan de ChatGPT `PLAN-CLAUDE-SIGUIENTE-IPA-APUNTAR-IDENTIDAD-TEMAS-Y-NAVEGACION-2026-11-08.md`.**

- **P1 de la auditoría de la 0.11.0:** editar un trabajo rehace su tarea del plan (fecha, título, hora o quitarla, como
  syncAssignmentPlannerItem); un movimiento que se queda sin categoría vuelve a `needsReview`; ningún autotraspaso al
  editar (interfaz y operación); «calendario» del menú abre Calendario y la fila de Estudios abre la primera pestaña
  encendida (asignaturas nativa; repaso y carrera en su página de la web); el manifiesto declara la fecha de las cachés
  (C617.1). `Operaciones011Tests` prueba todas las operaciones de la 0.11 (resultado, bloques, lo desconocido y reaplicar).
- **«apuntar.» completo** (`Features/Apuntar`). El intérprete es el mismo `js/apuntar.js` de la web, cargado en
  JavaScriptCore con `apuntar-entorno.js` (lo que necesita de nucleo.js, copiado tal cual) y `apuntar-puente.js`
  (`__apuntar` devuelve cada cosa con su tipo, sus campos y la descripción de los 15 tipos). Decisión: así no hay dos
  intérpretes que se separen; cualquier arreglo en la web llega a la app en la siguiente compilación. Banco dorado:
  `node pruebas/apuntar-casos.mjs` pasa las frases de `casos-barra.json` y 34 más por la web y por el entorno nativo, falla
  si difieren y escribe `pruebas/apuntar-casos.json`; `ApuntarTests` exige lo mismo al iPhone y el workflow, que el JSON
  siga al día. Las altas son operaciones nuevas (`anadirEnLista`, `anadirCompra`, `anadirANota`, `anadirClase`,
  `registrarApunte`, `deshacerApunte`), un solo lote por frase, ids decididos antes de encolar. `apuntesRecientes` guarda
  `deshacer` con la forma de la web para tarea, evento, gasto, compra y nota (cumpleaños, viaje y ocio son «evento»);
  examen, recurrente y clase usan `estudio`, `recurrente` y `clase`, que solo deshace la app (la web dice «ya no estaba»).
  Lo que la web apuntó con el conector se deshace en la web. Hoja al 56 % ampliable, borrador por cuenta 3 días
  (`BorradorApuntar`), accesos (rutina, ocio, viaje y despensa abren su página de la web). Siri, enlaces y «Abrir en»
  abren la misma hoja con el texto; `IntencionView` desaparece.
- **Barra:** ~68 pt sobre el área segura, iconos propios de 24 (`IconoBarra` en `DesignSystem/Iconos.swift`, trazo 1,85
  redondeado y un detalle que se llena de acento en la activa: cuaderno, eje con hitos, semana, libro con moneda, índice),
  fondo de 36, etiqueta 11 semibold, punto de 4, + de 54 (46 y aro de 4) subido 12, esquinas de 22, sombra corta. Sin SF
  Symbols. Con letra de accesibilidad se ocultan las etiquetas (los nombres siguen para VoiceOver).
- **Logo `b.`:** el AppIcon sale de `img/marca/icono-512.png` (sin la «B» antigua ni el rectángulo incrustado); fondo de
  arranque papel/asfalto; el punto de «bitácora.» usa `Paleta.marca` (#E5532B), que no se usa en controles.
- **Arcilla y temas:** asfalto, papel, teja (`acuarela`), pizarra, oliva y fundador con los colores de styles.css, y
  «sistema». En asfalto y papel el acento es la arcilla (#C96A5A / #A64235); la PWA conserva su naranja. `Paleta` resuelve
  cada color con `TemaActivo.elegido` y la raíz se rehace con `.id(tema)`; no hay `switch` por vistas. Permisos como
  `temasDisponibles` (`PermisosTemasRemotos`: `suscripciones.estado`, `invitaciones`, `user_metadata.desarrollador`),
  guardados por cuenta para usarlos sin red; el tema es de cada cuenta en este iPhone. Selector de muestras en Ajustes.
- **P2 baratos:** Transporte carga las favoritas al entrar, Eventos distingue «cargando» de «sin partidos», Calendario y
  Eventos renuevan «hoy» al volver a la app, los puntos de la semana de Inicio cuentan el planificador.
- Fuera de esta versión: tipografías y tamaños de letra (hay que traer cinco familias al paquete), capturas en los seis
  temas, medidas Release en el iPhone y el resto de cortes verticales.

**0.15.0 (09-11-2026): Despensa, Ocio y cierre visual.**

- Despensa nativa: varias listas, productos por secciones, precios estimados, frecuentes, historial, finalización con
  gasto enlazado en Finanzas, recetas y planificación semanal. Las operaciones conservan campos desconocidos y se
  reaplican sin duplicar compras.
- Ocio nativo: libros, series, películas, videojuegos y listas mixtas; alta, edición y borrado, portada por URL e
  importación local de CSV de Goodreads, Letterboxd e IMDb. Usa los mismos campos `entries` y `cultureLists` que la PWA.
- Inicio usa un carrusel semanal de tres páginas que sigue el dedo y encaja de lunes a domingo. Finanzas incorpora
  presupuestos, movimientos, suscripciones, gráfica y patrimonio. Inicio, Finanzas, Despensa, Ocio y la barra inferior
  comparten la superficie azul de contexto.
- La barra inferior centra sus iconos, usa trazos redondeados más simples, aumenta el botón de apuntar y presenta
  «más usados» en una burbuja animada con una pulsación más corta.

Cómo usar las piezas en un apartado nuevo: `ScrollView` + `LazyVStack` sobre `Paleta.fondo`, `CabeceraApartado` arriba
(sin barra de navegación), `CabeceraSeccion` por bloque, `FilaAgenda` para lo que se marca, `FilaEvento` para lo que
tiene hora y no se marca, `FilaLibro` para cifras e índices, `AccionTexto` para «+ algo.». Solo «ahora.» lleva relieve.
Pendiente del plan: capturas a 375 y 430, hoja de edición, Calendario, Finanzas y Más en capturas, medir en el iPhone.

| PWA (styles.css) | SwiftUI |
|---|---|
| `--bg-app` #efeee9 / #121211 | `Paleta.fondo` |
| `--m-superficie` #fff / #1d1d1b | `Paleta.superficie` |
| `--text-primary` #302f2c / #f4f2eb | `Paleta.texto` |
| `--text-secondary` #736f63 / #a29f96 | `Paleta.textoSecundario` |
| `--border` tinta al 7 % / 8 % | `Paleta.borde` |
| `--border-strong` 16 % | `Paleta.bordeFuerte` (aro de `.m-check`) |
| `--m-acento` #e5532b / #f0643a | `Paleta.acento` (arcilla #a64235 / #c96a5a en la nativa; el naranja solo en `Paleta.marca`) |
| `--m-sobre-acento` #161514 | `Paleta.sobreAcento` |
| `.m-ahora-bloque` acento 7 % y filo 16 %, radio 20 | `Paleta.tinteAcento`, `filoAcento`, `Radio.bloque` |
| `.m-tabbar` radio 26, tab 12,5 bold, icono en círculo al 6 % | `BarraBitacora` (0.14: carcasa contexto, radio 22, hueco 62, icono 32, etiqueta 10,5, `IconoBarra`) |
| `.m-tab-mas` 72 con aro de la barra, subido 28 | botón central visible 56 + aro del contexto, elevado 8 |
| `.m-check` 30, borde 2, lleno de acento | `BitacoraCheck` (sello 160 ms) |
| `--m-fs-titulo` 42 | `Tipo.tituloApartado` |

## Escrituras


- `OperacionBitacora` (DataContract/Operaciones.swift): `crearTarea` y `marcarTarea`. Cada una se guarda en
  `estado.json` (con UUID, dispositivo, fecha y versión de contrato) **antes** de verse; si el disco falla, la interfaz
  vuelve atrás y avisa.
- Lo visible es la base confirmada con la cola aplicada encima.
- Al subir: se lee la fila, las operaciones se aplican **sobre lo último de la nube** (no sobre la copia vieja), y solo
  las claves que cambian van a `merge_bitacora_data`. Crear no hace nada si el id ya existe (no pisa lo que la web
  cambió); marcar solo toca `done`/`hechaEn` de su tarea y no resucita una borrada.
- Idempotencia: si se pierde la respuesta, la siguiente vuelta ve el cambio ya en la nube, el parche sale vacío y la
  operación se da por hecha. «guardar.» decide el id al abrir la hoja: dos toques crean una sola tarea.
- Nunca upsert de la fila completa; `apuntes` y `_meta` no se escriben (hay un `precondition`).
- Riesgo que comparte con la web: si otro dispositivo guarda `dayPlanner` justo entre la lectura y la escritura
  (milisegundos), gana esta escritura. Lo cierra una operación atómica en el servidor (pendiente, necesita SQL).

## Decisiones

- **Sin el SDK de Supabase.** Para leer una fila y renovar un token basta URLSession (`ClienteSupabase`); el SDK suma
  varios paquetes que pueden romper la compilación en CI. Todo va detrás de `AuthRepository` y
  `BitacoraRemoteDataSource`, así que se puede cambiar sin tocar pantallas.
- **Documento por fragmentos de bytes, no `Codable`.** `DocumentoBitacora` guarda cada clave de primer nivel con sus
  bytes originales. Un bloque solo se vuelve a escribir si una operación lo cambia; lo demás viaja intacto. Es la misma
  granularidad que `merge_bitacora_data`.
- **`JSONValue` con el texto literal de los números**: ni `Double` ni `JSONSerialization` en el camino de los datos.
- **Archivos JSON protegidos en vez de SwiftData/Core Data** para la copia y la cola: el documento es semiestructurado y
  la cola es pequeña; un formato explícito y versionado (`EstadoAlmacen.version`) es más predecible.
- **Zona de Madrid** para el día lógico (lo pide la guía). La web usa la del dispositivo: para Alejandro es la misma;
  si viaja a otro huso, decidir cuál manda antes de escribir en el planificador.
- **Esquema `bitacoradev://`** mientras convivan las dos apps (si las dos registran `bitacora://`, iOS elige una al
  azar). El analizador acepta ambos; al sustituir la envoltura se registra `bitacora://`.
- **Sin extensiones ni App Group**: SideStore con cuenta gratuita no las instala. El workflow falla si aparece `PlugIns/`.
- **Navegación:** `TabView` del sistema con una `NavigationStack` por pestaña; una sola hoja a la vez (`Modal`). Sin
  transiciones propias entre pestañas.

## Riesgos abiertos

- `merge_bitacora_data` sustituye el bloque entero (ver «Escrituras»): la operación atómica del servidor es el destino.
- Comprobar `updated_at` antes de bajar la fila no es fiable: no consta que la función del servidor lo actualice
  (su definición no está en el repo). Hace falta una revisión del servidor para ahorrar descargas.
- Símbolos de Release sin recortar a propósito mientras es beta (ayudan a diagnosticar); recortarlos antes de TestFlight.
- Con Apple ID gratuito, SideStore renueva la firma cada 7 días y limita a 3 apps activas (SideStore cuenta como una):
  SideStore + envoltura + nativa llenan el cupo.
- No se ha medido en el dispositivo (arranque < 700 ms con copia, guía 12.4).

## Pruebas

- `BitacoraNativeTests` (XCTest, en el simulador en CI): lector y escritor JSON, conservación byte a byte de claves
  desconocidas, parches de una clave, fila de PostgREST, fusión a tres bandas (cambios, altas, borrados, undefined/null,
  idempotencia), día lógico de las 4:00 con los cambios de hora de 2026, días civiles, dinero y redondeo bancario,
  enlaces (válidos y rechazados), cola persistente, lectura del planificador y almacén por usuario.
- `node --test pruebas/contrato-ios.mjs`: las claves del contrato Swift son las de `DATOS_SINCRONIZADOS`.
- Workflow `.github/workflows/ios-nativa.yml`: tests, análisis estático, Release con número de build = número de
  ejecución, comprobación del .app (binario, recursos, fuentes, bundle ID, sin extensiones) y .ipa como artefacto;
  sube los registros si falla.

## Pendiente

- Paridad: calendario con trabajo, pagos y servicios; Estudios con notas, pesos, horario y borrar; Proyectos con crear,
  fases y diario; planificador con eventos del día, subtareas, prioridad
  y orden; finanzas con editar/borrar, traspasos, revisión e inversiones (y el valor de la cartera cuando `invested` es 0).
- Portada «ahora» y cuatro pestañas (inicio, plan, calendario, más), como propone la auditoría.
- Revisión monotónica del servidor para no bajar la fila entera en cada vuelta.
- Accesibilidad en el dispositivo, medir arranque y memoria, recortar símbolos antes de TestFlight.
