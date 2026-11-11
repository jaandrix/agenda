# Plan de la 0.18 (app nativa)

Pedido de Alejandro del 11-11-2026. Claude dirige y GPT asesora y audita. Otra sesión hace Finanzas a la vez y escribe
su propia sección al final de este archivo.

## Hecho (todo menos Finanzas)

Los puntos 1 a 7 son la 0.18, en verde en el run 43027827095. Lo marcado «0.19» es del punto 8 y va aparte.

| Punto | Commit | Qué |
|---|---|---|
| 1. Glass fuera | d373292 | Sin interruptor, sin `bitacora.glass` (se borra al arrancar), sin `conVidrio` ni manchas. La barra vuelve a ser opaca. |
| 2. QR en eventos | d902d2e | Ver el detalle debajo. Conector: `imagen_base64` en `anadir_entrada`. |
| Operación genérica | d902d2e, fe31921 | `OperacionBitacora.extra(tipo:json:)`, con su lógica en `OperacionesExtra.swift` y `OperacionesConector.swift`. Así los cortes nuevos no tocan el enum común. Finanzas también la usa (`CambioFinanzas`). |
| 3. Bandeja | 27a7842 | Ver el detalle debajo. |
| 4. Apuntar | 1fd3b9c, 68e4f49 | Un campo, vista previa en directo y «editar.» por cosa (tipo o quitarla). Sin la rejilla de iconos. Ejemplos de `BARRA_PISTA` con el campo vacío. |
| 5. Recordatorios | cbca21a | Ver el detalle debajo. También van las subtareas y «mover a una fecha.» en el menú de la fila. |
| 6. Despensa | 56cb3b0 | Campo con superficie y filo de 3:1 (`campoCasa`, en `DesignSystem/CamposCasa.swift`). Hojas de 44 pt a todo el ancho, sin animación. Lista agrupada al cargar. Editores con el fondo del tema. |
| 7. Rendimiento | d350bc1 | Ver el detalle debajo. |
| Bandeja, editar_tarea (0.19) | 29ff1ee | Cambios de tareas desde Claude: título, notas, fecha, hora y hecha, con deshacer. |
| Enlaces (0.19) | 0277c15 | Se abren dentro de la app (`SFSafariViewController`, con `c.web`); «abrir en safari.» en el menú. |

**QR en los eventos:**
- En la ficha de un evento propio salen «+ añadir entrada.» (foto o captura del carrete) y «pegar.».
- El QR se lee con Vision y, si falla, con CIDetector. Se guarda su contenido en `entradas` (`qr`), como la web.
- No se guarda la imagen si no se puede leer. La web, al guardar un evento, descarta las entradas sin `qr` ni `qrB64` (`js/entradas.js`, línea 756), así que una imagen suelta se perdería en cuanto alguien editara el evento desde la web. Si se quiere, hay que cambiar antes la web.
- A pantalla completa: fondo blanco, brillo al máximo (se devuelve al cerrar), la «b.» en el centro con corrección H, como `qrEntradaSvg`. Si hay varias entradas, se desliza entre ellas.
- Mantener pulsado el QR lo quita (`quitarEntradaQR`).
- **Conector.** La herramienta ya existía; el fallo era que la IA no conseguía decodificar la imagen. Ahora `anadir_entrada` acepta `imagen_base64` (PNG o JPEG) y la lee en el servidor con jsQR, guardando los bytes tal cual (`qrB64`), como la web. La descripción explica tres caminos: decodificar con código, mandar la imagen, o pedir al usuario que la añada desde la app.
- **Sin desplegar:** el despliegue lo bloqueó el permiso de producción de esta sesión. Comando: `supabase functions deploy bitacora-mcp --no-verify-jwt`.

**Bandeja (P0):**
- Al sincronizar (como mucho cada 30 s) se lee `conector_bandeja`. Lo automático que el iPhone sabe aplicar se aplica con la misma forma que `aplicarOpConector`, su línea en `registroConector` y `ref = "ia_" + id` (idempotente con la web): tarea, evento, correo, envío, entrada con QR y nota. Después se borra la fila.
- Una entrada cuyo evento todavía no existe espera a la siguiente vuelta.
- Lo automático que el iPhone aún no sabe aplicar se queda en el servidor para la web: ocio, compra, ticket, receta, proyecto, objetivo, laboral, profe, test, tarjetas, editar_tarea, tarea_recurrente, estudios, clase, hábito, día, enlace, deseo, entrada_crear y entrada_editar. «propuestas.» lo cuenta.
- Lo que espera validación (dinero y borrados) sale en «propuestas.» del menú, ahora nativo:
  - aceptar (movimiento y borrar de tarea, evento o movimiento);
  - rechazar cualquier cosa (línea «descartado»);
  - «validar en la web.» para el resto (editar_movimiento, importar).
- El historial deshace: quitar tarea, evento o movimiento, entrada, envío, reinsertar lo borrado y la nota.
- Aviso agrupado al aplicarse («Claude añadió 3 tareas y 1 evento»). La primera vez que llega algo para validar, notificación local.
- **Límite:** las notificaciones locales solo salen cuando la app se abre o vuelve a primer plano. Para avisar con la app cerrada hace falta push del servidor: ver «Pendiente».

**Recordatorios:**
- `recordatorio` en la tarea: `{"tipo":"hora"}` (a la hora de la tarea) o `{"tipo":"fecha","cuando":"AAAA-MM-DDTHH:MM"}` en hora de Madrid. Es un campo nuevo dentro de una tarea, no una clave de primer nivel, así que el contrato no cambia.
- La web lo conserva: `savePlannerItem` usa `Object.assign`, y arrastrar copia la tarea entera.
- Se reprograma al cambiar la revisión (`Recordatorios.reconciliar`): uno puesto en otro dispositivo también suena aquí. Id fijo `recordatorio-<id>`. Como mucho 14, para no pasar de 64 con los avisos de eventos. Las hechas no avisan.

**Rendimiento:**
- `documentoVisible()` leía y analizaba el `base.json` entero y descodificaba `estado.json` cada vez que una pantalla lo pedía. Ahora:
  - `AlmacenLocal` guarda en memoria lo último escrito o leído;
  - `SyncEngine` guarda el documento por versión del almacén.
  Mientras no se escriba nada, todas las pantallas comparten el mismo documento.
- Calendario y Plan creaban un `DateFormatter` en cada pintado: ahora son estáticos.
- Despensa agrupa la lista fuera del hilo principal, una vez por versión.
- Inicio y el menú ya calculaban fuera del `body`.
- Sin medir en el iPhone: falta un Instruments en Release.

## Pendiente (no Finanzas), por valor

1. **Avisos push de la bandeja y de los recordatorios con la app cerrada.** Encaja en `avisos-diarios` (pg_cron cada 5 minutos, ya manda push web):
   - recorrer `dayPlanner` y avisar de los `recordatorio` que caen en esa ventana de 5 minutos;
   - en `bitacora-mcp`, al encolar algo que no es de `OPS_AUTOMATICAS`, mandar un push «Claude propone…».
   Para el iPhone nativo haría falta APNs, que con Sideloadly y cuenta gratuita no hay. Mientras, el push web llega al iPhone si la PWA tiene los avisos activados. Recomendación: hacerlo en el servidor para la PWA ya, y en la nativa cuando haya cuenta de desarrollador.
2. **Bandeja, más tipos en el iPhone:** tarea_recurrente, hábito, enlace y entrada_crear (viaje, cumpleaños y documento). Hoy esperan a la web.
3. **Apuntar, P1 del laboratorio:**
   - prioridad dicha en la frase;
   - negaciones;
   - faltas de dictado;
   - varios importes;
   - asignatura que no existe.
   Van en `apuntar-puente.js` con su caso en `pruebas/apuntar-casos.json`.
4. **«Más usados»:** elegir arrastrando desde «menú.».
5. **Viajes:** reservas, listas, documentos, mapa y Destino.
6. **Empleo:** fichas de empleo, vida laboral y CV.
7. **Objetivos:** Harada, kaizen y kanban.
8. **Documentos:** subir, renombrar y borrar archivos; crear y editar fichas.
9. **Concurrencia PWA/iPhone en `dayPlanner`** (P0 de la 0.17): prueba de guardados simultáneos.
10. **Web, en espera:** llevar los validadores de Apuntar a `js/apuntar.js`. Mostrar las subtareas y el recordatorio en la web (hoy solo se conservan).

## Probar en el iPhone

- **Glass:** en ajustes ya no está «glass (prueba).»; la barra es opaca en todos los temas.
- **QR:**
  - abrir un evento propio → «+ añadir entrada.» → elegir la captura de una entrada;
  - sale el QR con la «b.» en el centro → «ver a pantalla completa.» → brillo al máximo y fondo blanco;
  - al cerrar, el brillo vuelve;
  - probar también copiando la imagen y «pegar.»;
  - mantener pulsado el QR → «quitar esta entrada.».
- **Conector (después de desplegar):** mandar a Claude la captura de un QR y pedirle que la añada a un evento. Si no puede ejecutar código, debe usar `imagen_base64` o decirte que la añadas desde la app.
- **Bandeja:**
  - pedir a Claude «apunta tarea X y evento Y el viernes a las 8» con la app cerrada;
  - al abrirla, sale «Claude añadió 1 tarea y 1 evento.» y aparecen;
  - en menú → «propuestas.», en «lo último.», «deshacer.» los quita;
  - pedir a Claude que registre un gasto: llega una notificación, y en «propuestas.» se acepta o se rechaza.
- **Apuntar:**
  - escribir «cena con marta el viernes a las 21 y comprar pan»: salen «2 cosas.»;
  - «editar.» en la segunda → «compra» → «apuntar.»;
  - con el campo vacío, tocar un ejemplo lo escribe.
- **Recordatorios:**
  - editar una tarea con hora → «recordarme.» → «a la hora de la tarea.» → guardar. Suena a esa hora;
  - otra con «a una hora concreta.» dentro de 2 minutos;
  - marcar una como hecha: ya no suena.
- **Subtareas:** abrir una tarea → «+ subtarea.» → marcarla → deslizar para quitarla. En la web sigue saliendo bajo la tarea.
- **Mover a una fecha:** mantener pulsada una tarea → «mover a una fecha.» → elegir el día 20.
- **Despensa:**
  - el campo de añadir se ve en asfalto y en papel;
  - las cuatro hojas responden al instante y son fáciles de tocar;
  - en una receta, los cuadros de ingredientes y pasos se ven.
- **Enlaces:** tocar un enlace lo abre dentro de la app; «···» → «abrir en safari.».
