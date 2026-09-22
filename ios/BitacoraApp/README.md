# Bitácora — app iOS (cáscara nativa)

Envoltorio nativo mínimo de appbitacora.es. No aloja contenido propio: es un
`WKWebView` a pantalla completa cargando la web en producción, más la
plomería nativa (widgets, Siri, Compartir...) que se vaya añadiendo con el
tiempo.

## Por qué existe este proyecto

El usuario quiere tener Bitácora instalada como app real en iOS y, con el
tiempo, ir sumando capacidades que un PWA no puede dar (widgets de pantalla
de inicio, Atajos de Siri, extensión de Compartir...). No hay cuenta de
Apple Developer de pago ni Mac disponible, así que:

- El proyecto se compila **sin firma** en GitHub Actions (runner de macOS).
- El `.ipa` resultante se firma al vuelo con un Apple ID gratuito al
  sideloadearlo con **AltStore/AltServer** (o SideStore) — el certificado
  gratuito caduca cada 7 días y hay que reconectar el iPhone a la misma
  red/USB que el ordenador con AltServer para renovarlo.

## Estructura

```
ios/BitacoraApp/
  project.yml              <- especificación de XcodeGen (genera el .xcodeproj)
  BitacoraApp/
    BitacoraApp.swift      <- punto de entrada de la app
    ContentView.swift      <- WKWebView + loading/error state
    Info.plist
    Assets.xcassets/       <- icono (derivado de icon-512.png) y colores
```

El `.xcodeproj` **no se versiona** — lo genera
[XcodeGen](https://github.com/yonaskolb/XcodeGen) a partir de `project.yml`
tanto en CI como si algún día se abre en un Mac local (`xcodegen generate`).

## Cómo se compila (GitHub Actions)

Workflow: `.github/workflows/ios-build.yml`. Se dispara con cualquier push a
`ios/**` en `main`, o manualmente desde la pestaña Actions ("Run workflow").

Pasos: instala XcodeGen → genera el proyecto → `xcodebuild` sin firma para
`iphoneos` → empaqueta `BitacoraApp.app` en un `.ipa` sin firmar → lo sube
como artefacto descargable (pestaña Actions → la ejecución → Artifacts →
`BitacoraApp-unsigned-ipa`).

## Cómo se instala en el iPhone

1. Descargar el `.ipa` del artefacto de la última ejecución de Actions.
2. Con AltServer corriendo en un PC (Windows vale) y el iPhone en la misma
   red o por USB: abrir AltStore en el iPhone → "+" → elegir el `.ipa`.
3. Cada 7 días, volver a conectar el iPhone a esa misma red/USB con
   AltServer abierto para que renueve la firma (o abrir AltStore y darle a
   refrescar).

## Estado — Hito 1

Cáscara mínima: carga la web, muestra un indicador de carga y una pantalla
de "reintentar" si falla la conexión. **Sin funciones nativas todavía.**
El único objetivo de este hito es confirmar que el circuito completo
(XcodeGen → build sin firmar en Actions → sideload con AltStore) funciona
de punta a punta antes de invertir tiempo en Swift de verdad.

## Próximos pasos (por orden de prioridad acordado)

1. Confirmar que este hito 1 instala y funciona igual que la PWA.
2. Widget de pantalla de inicio (WidgetKit) — "hoy" (próximo evento +
   tareas), saldo de Finanzas PRO, racha de hábitos.
3. Atajos de Siri / App Intents.
4. Extensión de Compartir.
5. Resto de ideas discutidas: notificaciones push ricas con acciones,
   Face ID para Finanzas, OCR de tickets, Apple Watch, EventKit,
   Focus Filters, Spotlight, StandBy.

Cada una de estas es un "target" nativo nuevo dentro del mismo proyecto
Xcode (widget extension, share extension, etc.) — se van añadiendo a
`project.yml` según toque.
