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

- Escrituras: hasta tener la operación del servidor, `merge_bitacora_data` sustituye el bloque entero; dos ediciones a
  la vez dentro del mismo bloque dependen de la fusión previa (como en la web).
- `PREPARAR_FUSION` del planificador sin portar (necesario antes de escribir tareas).
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

## Fase 2 (siguiente)

Portada, Planificador y Captura rápida con escrituras: portar `PREPARAR_FUSION`, operaciones con `operationId` en la
cola, subida con fusión a tres bandas y `merge_bitacora_data`, interfaz optimista y la matriz de pruebas cruzadas con la
PWA (guía 12.2) en una cuenta de prueba.
