# Lecciones de la tanda 3.2 (25-11-2026)

Ocho worktrees `v32-*` en paralelo, con Opus y Sonnet por API: primero desarrollo y luego tres sesiones de «auditoría»
sin commits. Esto es lo que pasó, para no repetirlo.

## Lo que funcionó

- **El desarrollo por apartados:** unas 3.600 líneas útiles en siete ramas (perfil e inicio, sistema, estudios,
  objetivos y social, finanzas, ocio, panorama y eventos), cada una con su commit y sus pruebas de Node.
- **Ramas casi independientes:** al integrar solo hubo dos conflictos, y los dos triviales (`?v=` de `index.html` y
  `case` contiguos en `OperacionesExtra.swift`).

## Lo que salió mal

1. **Nadie compiló Swift.** En Windows no hay `xcodebuild`, y las pruebas de Node no ven Swift. Dos ramas quedaron sin
   compilar: `private func campoManual: some View` (era `var`) en Ocio, y `VigiaFinanzas` y `EscalonadoInicial`, que
   se usaban en Finanzas pero nunca se escribieron. Ahora la regla es: CI en verde o no está terminado.
2. **Auditorías que inventaban.** Un «bug crítico» de concurrencia en `NSCache`, que es segura entre hilos. Un
   `onChange` vacío con comentarios que se contradecían. Reformateos sin cambio real. La única corrección valiosa fue
   añadir `NSCameraUsageDescription`, sin la que el escáner de ISBN cerraba la app.
3. **Auditorías que implementaban.** Con la orden de «solo auditar», dos sesiones añadieron funciones nuevas a medias.
   Se cortaron al agotarse el saldo y quedaron sin commitear.
4. **Nueve documentos de resumen** en la raíz (AUDITORIA-V32*, MERGE-V32, CAMBIOS-V32...), repetidos entre sí y con
   errores: fecha de 2025, solo 3 de las 8 ramas, nombres de rama sin `claude/`, «238/238 pruebas» cuando eran unas
   430 por rama, `git push -f` y «avisar al equipo». Se borraron. Escribirlos costó tokens de salida, los más caros.
5. **Sesiones demasiado largas.** El coste por turno subió de 0,26 a 0,31 $ dentro de la misma auditoría, la espera del
   primer token llegó a casi 2 minutos y hubo cortes con error 400 al pasar de 200.000 tokens.
6. **Opus para todo:** el 87 % del gasto, incluido leer diffs y pasar pruebas, que Sonnet hace igual por la mitad.
7. **Cada rama subía su `?v=`.** Ese fue casi todo el origen de los conflictos.

## Qué cambió por esto

- `REGLAS.md` §3: terminado significa CI en verde, con push solo a `rediseno/api-NNN-*`.
- `REGLAS.md` §4: «bug» solo con prueba, reproducción o documentación.
- `REGLAS.md` §1: ni informes `.md` ni subidas de `?v=` en los encargos.
- `COMO-CREAR-ENCARGOS.md`: tope de tamaño y de turnos, una sesión por encargo y nada de auditorías generales.
