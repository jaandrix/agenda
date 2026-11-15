# Plan 0.22

Pedido de Alejandro del 15-11-2026: «mejores realmente el rendimiento, aspecto visual y calidad de cada tema, además
mejora la pestaña de ajustes todo lo que puedas, especialmente el apartado visual de este, así como el funcionamiento y
traer funcionalidades». Dos sesiones a la vez: rendimiento (Core, SyncEngine, almacén, listas) y temas y Ajustes. Claude
dirige y GPT audita.

## Temas y Ajustes

| Paso | Commit | Qué |
|---|---|---|
| 1. Temas | ec989b9 | Contraste y superficies de los seis temas, formularios y barras del tema. |
| 2. Ajustes | c085f16 | Ajustes rehecha con la piel de Bitácora y las funciones de la PWA. |

### 1. Temas: qué estaba mal y qué se cambió

Medido con el mismo cálculo de contraste de WCAG que `AjustesTests.testTodosLosTemasCumplenContraste`:

- **El aro de marcar no llegaba a 3:1** en papel (2,3), teja (2,2), pizarra (1,9) y oliva (2,1): un control necesita 3:1
  con el fondo. Ahora `aroAlfa` está entre 0,46 y 0,6 y todos pasan de 3,1.
- **Las superficies casi no se distinguían del fondo** (contraste 1,06 a 1,09 en oliva, papel y asfalto). Ahora todas
  van de 1,12 a 1,27, y `bordeAlfa` sube para que los filetes se vean.
- **Teja** tenía tarjetas más oscuras que el fondo, que con la barra granate pesaban. Ahora son piedra clara (#F4EFE7)
  sobre el fondo de piedra; el granate se queda en títulos y barra.
- **Pizarra:** la atención (#8A3A52) no llegaba a 4,5 sobre el fondo; ahora #7A2E47. Superficies más claras y frías.
- **Asfalto:** la arcilla un punto más clara (#CF7262) para que llegue a 5:1 sobre las tarjetas; superficie más alzada.
- **Fundador y oliva:** superficies más separadas (carbón #201E19, oliva #E3E8D1), el resto igual.
- **Formularios:** las 24 hojas con `Form` pintaban celdas del sistema (blancas en los claros, gris de iOS en los oscuros)
  y los encabezados en mayúsculas. `FormCasa` (DesignSystem/CamposCasa.swift) pone cada fila en la superficie del tema,
  el separador del tema, minúsculas y Poppins. Se cambió `Form {` por `FormCasa {` en todas las vistas.
- **Barra de navegación:** con scroll era el material translúcido del sistema (desenfoque y gris). Ahora es opaca, del
  fondo del tema, con un filete del tema, y el título en la tinta del tema.
- **Segmentos** (tipo de movimiento, de categoría...): elegido en la superficie, tinta del tema, Poppins.
- Texto que informa con `textoApagado` (Envíos, Transporte, «web.» del menú, «auto.» de Eventos) pasa a `textoSecundario`.
- Tokens nuevos de estado: `Paleta.pulsado`, `seleccion`, `desactivado` y `separador`.

### 2. Ajustes

La pantalla era un `List` del sistema con cuatro filas. Ahora es como el menú (`GrupoMenu`), con:

- **Cabecera de perfil:** foto de `perfiles_fotos` (la misma caché que Inicio), nombre (`userName`), correo y el estado de
  la suscripción.
- **Apariencia:** cada tema es una miniatura de la app con sus colores reales (fondo, título, una tarjeta con su
  círculo, acento y barra), solo los que la cuenta puede usar. Tamaño de letra en opciones. Restablecer.
- **Apartados:** «eres.» (estudiante, trabajo, las dos) y los 13 opcionales de `APARTADOS_OPCIONALES`, con el mismo
  `porDefecto` (`Apartados.visible`). Escriben `ponerPerfil` / `ponerApartado`; el menú se rehace con la revisión.
- **Avisos:** los 12 automáticos de la web (`preferenciasAvisos`, op `ajusteAviso`), los avisos de eventos de este iPhone
  y Face ID.
- **Conexiones:** enlaces de Claude y ChatGPT (`conector_tokens`, SHA-256 como la web, revocar), Siri y tu correo (token
  propio, `servicios.siriToken` / `correoToken` con la op `ajusteToken`; el viejo se revoca), calendario .ics
  (`calendario-feed`; cambiar el enlace sube `calendarioFeedVersion` con `ajusteFeed`, sincroniza y lo vuelve a pedir) y
  correo de los domingos (`correo_semanal`, `poner_correo_semanal`).
- **Cuenta:** suscripción con su estado (fundador, prueba, regalo, legado, mensual o anual), «pagos y facturas.» con
  `portal-pago` (o planes en la web), invitar (`mi_codigo_invitacion`, compartir enlace), cerrar sesión y eliminar la
  cuenta (explica, ofrece la copia, pide escribir «eliminar» y llama a `eliminar-cuenta`; después cierra la sesión).
- **Datos:** «descargar mis datos.»: el documento entero con `exportedAt`, como `exportData` de la web, por la hoja de
  compartir. Estado de la sincronización.
- **Ayuda:** guía, guía para tu IA y novedades, en la web (no tienen dirección propia: se abre Ajustes de la web).
  Versión y contrato.

Sin claves nuevas: `preferenciasAvisos`, `calendarioFeedVersion`, `servicios` y `apartadosConfig` ya estaban en el
contrato. Pruebas: `AjustesTests` (avisos idempotentes, tipo desconocido, versión del calendario, tokens que conservan el
resto de `servicios`, perfil y apartados en el menú, hash como la web y contraste de todos los temas).

### Capturas

`CapturasTemasTests` deja `tema-<nombre>.png` en el artefacto `capturas-diseno`: Plan, el menú con campos y botones
(normal, activo, secundario, peligro, desactivado) y Ajustes, uno al lado del otro.

### Pendiente

- Los formularios con `Form` se ven con la piel nueva pero no se han revisado uno a uno en el iPhone.
- Guía y novedades nativas (hoy, la web).
- Planes de pago y canjear códigos regalo dentro de la app (hoy, la web).
- Editar la foto y la frase del perfil (hoy, la web).

### Probar en el iPhone (temas y Ajustes)

- **Cada tema:** Ajustes, apariencia, tocar cada miniatura. En cada uno, mirar Inicio, Plan, Calendario, Finanzas,
  Despensa, Ocio, el menú y una hoja (nueva tarea, nuevo movimiento): las tarjetas se separan del fondo, los círculos de
  marcar se ven, los formularios no tienen celdas blancas ni grises y al hacer scroll la barra de arriba no se vuelve
  translúcida.
- **Ajustes:** arriba tu foto, nombre y correo. Cambiar el tamaño de letra. «eres.» trabajo: Estudios desaparece del menú
  al momento; volver a «las dos.». Apartados opcionales: encender «enlaces.» y verlo en el menú.
- **Avisos:** apagar «ritmo de gasto.» y comprobar en la web (Ajustes, avisos automáticos) que sale apagado.
- **Conexiones:** «claude y chatgpt.», «+ claude.»: sale el enlace, se copia y aparece en la lista; revocarlo. Siri:
  «conectar siri.» y copiar el enlace. Calendario: «abrir en el calendario.» lo añade al Calendario del iPhone. Correo de
  los domingos: encender y apagar.
- **Cuenta:** suscripción enseña tu estado; invitar enseña tu código y comparte el enlace. Eliminar cuenta: solo mirar
  que el botón no se activa hasta escribir «eliminar» (no pulsarlo).
- **Datos:** «descargar mis datos.»: la hoja de compartir con `bitacora_AAAA-MM-DD.json`; guardarlo en Archivos.
