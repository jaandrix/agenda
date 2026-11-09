# Flujo OpenCode → auditoría → IPA

OpenCode implementa; el coordinador revisa, decide y publica. El objetivo es trasladar aproximadamente el 70 % del
trabajo mecánico y de implementación sin delegar la aceptación final.

## Uso

1. Abrir este repositorio en OpenCode. El agente predeterminado es `bitacora`.
2. Ejecutar `/implementar-ios <encargo>`.
3. Revisar el resultado y, si hace falta, ejecutar `/auditar-ios <ámbito>`.
4. Ejecutar `/preparar-ipa` antes de entregar el diff al coordinador.
5. El coordinador revisa el diff, ejecuta las comprobaciones, crea el commit y hace `push` a `main`.
6. `iOS - Bitácora nativa (tests y .ipa sin firmar)` genera los artefactos en un runner macOS.

OpenCode no debe almacenar secretos ni firmar la aplicación. Las IPA generadas son deliberadamente sin firma y se
instalan mediante el mecanismo de sideloading habitual.

## Artefactos

- `Bitacora-INSTALAR-ipa`: la aplicación definitiva que sustituye la instalación anterior.
- `Bitacora-beta-no-instalar-ipa`: la variante paralela para pruebas de desarrollo.
- `capturas-diseno`: capturas creadas por las pruebas visuales.
- `registros-nativa`: registros disponibles únicamente cuando falla el workflow.

Cada entrega incluye un manifiesto con commit, versión, número de build y hashes SHA-256 para poder auditar qué IPA se
ha instalado.
