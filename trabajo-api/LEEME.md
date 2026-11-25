# Trabajo con una clave de API: léeme primero

Esta carpeta es para las sesiones de Claude Code (u otro agente) que trabajan en Bitácora con una clave de API, aparte de
la sesión habitual de Alejandro. Suele haber varias a la vez, con un saldo limitado. Aquí está todo lo que necesitas para
trabajar bien a la primera y gastar poco.

## Orden de lectura (y nada más)

1. Este archivo.
2. `REGLAS.md`: lo que nunca se hace y cuándo algo está terminado.
3. `COMO-CREAR-ENCARGOS.md`: cómo convertir una petición suelta en un encargo con alcance cerrado.
4. El encargo que te toque, en `cola/API-NNN-*.md`. Si no existe todavía, lo escribes tú siguiendo el paso 3.
5. Solo las secciones de `CLAUDE.md` (raíz) que hablen del apartado de tu encargo, y `ios/BitacoraApp/AGENTS.md` si el
   encargo toca la app nativa.

No leas el repositorio entero, `styles.css` de arriba abajo ni los `PLAN-0.xx.md` antiguos: cuesta tokens en cada turno y
no te hace falta. Busca con `Grep` el nombre exacto y lee solo ese tramo.

`LECCIONES-3.2.md` explica qué salió mal en la última tanda paralela. Léelo una vez si vas a auditar o a revisar código
de otro agente.

## El ciclo de cada encargo

1. **Encargo:** si la petición no viene ya como ficha `API-NNN`, redáctala (`COMO-CREAR-ENCARGOS.md`), enséñasela a
   Alejandro en el chat y espera su «sí» antes de tocar nada.
2. **Aislamiento:** un worktree y una rama propios (`claude/api-NNN-<tema>`) creados desde `main`. Nunca trabajes en la
   carpeta principal ni en la rama de otro encargo.
3. **Implementación:** solo en los archivos permitidos de la ficha.
4. **Verificación:** las pruebas de la ficha y, si hay Swift, compilación en GitHub Actions (ver `REGLAS.md`).
5. **Commit:** uno por encargo, en su rama, con el formato de `REGLAS.md`.
6. **Entrega:** un único mensaje final en el chat con el formato de `REGLAS.md`. Ningún archivo `.md` de informe.

La integración en `main`, la subida de la versión `?v=` y el push a `main` los hace siempre el coordinador (Alejandro o su
sesión principal), nunca la sesión del encargo.

## Contexto mínimo del proyecto

- Web: JavaScript sin framework en `js/`, `styles.css` e `index.html`; GitHub Pages en appbitacora.es; datos en
  Supabase. Todo lo global es compartido entre archivos: un nombre repetido rompe la carga.
- App nativa: SwiftUI en `ios/BitacoraApp/BitacoraNative/` (target `BitacoraNative`), proyecto generado con XcodeGen
  desde `project.yml`. Escribe en la nube con operaciones idempotentes (`DataContract/`), y la PWA es la fuente de
  verdad de las reglas de negocio.
- El ordenador de trabajo es **Windows**: no hay `xcodebuild` ni simulador. Swift solo se compila en el workflow
  `.github/workflows/ios-nativa.yml` (macOS), que se ejecuta al hacer push a `main` o a `rediseno/**`.
- Estilo de la casa: etiquetas en minúscula con punto final, sin emojis ni glifos, sin «·» ni «—» en los textos de la
  interfaz, comentarios solo para explicar un porqué. Detalle en «Convenciones establecidas» de `CLAUDE.md`.
