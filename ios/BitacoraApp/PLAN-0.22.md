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
| 3. Capturas y textos | 021aef1 | Láminas por tema, textos informativos en `textoSecundario`, este plan. |
| Arreglo | ef9b2e5 | La op de Siri y correo salía con el token como tipo (lo cazó `AjustesTests` en 43727712880). |

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

- Revisar las láminas `tema-*.png` de la compilación final (desde el 15-11 se sube una sola vez: no las he podido ver).
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

## Usabilidad

Pedido de Alejandro tras probar la 0.21: «No se puede desmarcar un alimento marcado. Darle al tick azul del teclado no
cierra el teclado. Mejora todo lo que veas de este estilo».

| Punto | Commit | Qué |
|---|---|---|
| 1. Despensa | c5a9dfe | Desmarcar, el tick cierra el teclado, deshacer al quitar, confirmar listas y recetas. |
| 2. Teclado | 491e1f8 | `TecladoGlobal`: «listo.» en los campos de varias líneas, tocar fuera y arrastrar cierran. |
| 3. Confirmaciones | d3bbf7d | Borrar tarea, enlace, pedido, cita y entrada con QR pregunta antes. |
| (Ocio) | d74198c | Tocar la misma nota la quita (entró en un commit de la sesión de rendimiento). |

**Desmarcar.** La operación y las marcas estaban bien (un test con el motor real lo comprueba: marcar, desmarcar,
marcar, desmarcar, con una carga vieja en medio de cada toque). Lo que fallaba era la vista: la lista era una
`LazyVStack` dentro de otra perezosa y el toque usaba el producto capturado al pintar la fila. Una fila que pasa de su
sección al carro podía quedarse con los datos de antes, y el toque volvía a mandar «marcar». Ahora la lista no es
perezosa y el toque busca el producto y su lista frescos por id. Además: «sacar del carro.» en «···» y en la pulsación
larga, y respuesta háptica también al sacar.

**Teclado.** Despensa volvía a enfocar el campo en `onSubmit` a propósito (para apuntar varias cosas seguidas); ahora
añade y cierra. Para el resto de la app (~85 campos), `TecladoGlobal` (Features/Comun), instalado al arrancar:
- los campos de varias líneas (notas, TextEditor), donde retorno es salto de línea, llevan «listo.» encima del teclado;
- tocar fuera de un campo cierra el teclado sin quitarle el toque a lo tocado (tocar otro campo pasa a él);
- arrastrar cualquier lista lo cierra (`keyboardDismissMode` interactivo).
Los de una línea ya se cerraban con retorno.

**Barrido.**
- Sin vuelta atrás y sin preguntar: borrar una tarea del plan, un enlace (a un toque desde «···»), un pedido, una cita
  y una entrada con QR. Ahora piden confirmación (`confirmarBorrado`). Quitar un producto de Despensa enseña «deshacer.».
  Eliminar una lista o una receta pregunta.
- Estados que no se podían quitar: la nota de Ocio (el mínimo era media estrella). Tocar la misma nota la quita.
- 44 pt: el «···» de Enlaces (era de 32), la papelera y «+ plato.» del plan de Despensa (0.21).
- Hojas: solo Presupuesto bloquea el gesto, y solo con cambios sin guardar (a propósito).

**Pendiente (anotado, no hecho):**
- Botones `.plain` sin estado pulsado: necesitan un estilo de botón común (DesignSystem, de la sesión de temas).
- Campos de título en los editores: retorno cierra el teclado, pero no pasa al siguiente campo.
- Plan: borrar desde la tarea abierta tampoco se puede deshacer (pregunta en el editor desde antes).

## Probar en el iPhone (usabilidad)

- **Despensa:** marcar un producto y tocar su círculo en «en el carro.»: vuelve a su sección. Marcar, desmarcar y volver a
  marcar rápido. Mantener pulsado un producto: «sacar del carro.».
- **Tick del teclado:** en Despensa, escribir «leche» y tocar el tick: se añade y el teclado baja.
- **Teclado en toda la app:** en las notas de una tarea o un evento, «listo.» encima del teclado lo cierra. Tocar fuera
  de un campo, o arrastrar la lista, también.
- **Deshacer y confirmar:** quitar un producto de Despensa y tocar «deshacer.». Borrar una tarea del plan, un enlace o un
  pedido pregunta antes.
- **Ocio:** en una película con nota, tocar la misma estrella la deja sin valorar.
