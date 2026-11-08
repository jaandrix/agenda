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

## Fase 2 (lo que queda)

Probar en el iPhone crear y marcar con la PWA abierta en el ordenador. Después: editar, mover y borrar tareas,
mañana y pasado mañana, pendientes sin día, recurrentes del día y apuntar (`bitacoradev://apuntar`) creando de verdad;
la matriz de pruebas cruzadas con la PWA (guía 12.2) y medir arranque, memoria y descarga en el iPhone.
