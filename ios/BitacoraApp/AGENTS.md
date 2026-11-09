# Bitácora nativa — instrucciones para agentes

Lee primero `../../AGENTS.md`, `../../CLAUDE.md` y `NATIVA.md`. `project.yml` es la fuente del proyecto Xcode; el
`.xcodeproj` generado no se versiona.

- La entrega principal es `BitacoraDefinitiva-unsigned.ipa`, con `com.bitacora.app`, nombre `Bitácora` y esquema
  `bitacora://`. La beta paralela conserva `com.bitacora.nativa.dev`.
- La app se compila sin firma. No añadas certificados, perfiles, secretos, `DEVELOPMENT_TEAM` ni extensiones.
- Conserva los nombres de artefacto del workflow: los usa el proceso de instalación actual.
- Implementa cortes verticales pequeños, mantén intactas las claves desconocidas del documento y añade pruebas a
  cada operación o proyección nueva.
- Antes de entregar, desde la raíz ejecuta `node pruebas/comprobar.mjs`, `node --test pruebas/contrato-ios.mjs` y
  `node pruebas/apuntar-casos.mjs`; el banco dorado no debe dejar diferencias.
- Windows no puede ejecutar `xcodebuild`. Revisa estáticamente Swift y `project.yml`, y deja que
  `.github/workflows/ios-nativa.yml` ejecute XCTest, análisis y compilación en macOS.
- No hagas `push`, no dispares Actions y no descargues artefactos salvo que la petición actual lo autorice.
- No limpies archivos no versionados ni reviertas cambios que no hayas creado.
