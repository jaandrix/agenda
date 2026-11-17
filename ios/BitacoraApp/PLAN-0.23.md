# Bitácora nativa 0.23

Primero el carrusel de semanas de Inicio, que seguía sin pasar de semana en el iPhone. Después, los 27 hallazgos de
las dos auditorías de ChatGPT sobre la IPA 0.21 (`AUDITORIA-BUGS-0.21.md`, A1-A16, y `SEGUNDA-AUDITORIA-EXHAUSTIVA.md`,
B1-B11), comprobados contra el código de la 0.22.

## Carrusel de semanas (urgente)

- **Causa:** el arrastre era un `DragGesture` simultáneo dentro del `ScrollView` vertical de Inicio. El scroll
  vertical se quedaba el toque y cancelaba el gesto sin llamar a `onEnded`, así que la semana no cambiaba. Los tests de
  `EstadoCarrusel` pasaban porque la lógica estaba bien: el fallo estaba en la vista.
- **Arreglo (671fdee):** `ScrollView` horizontal con `.scrollTargetBehavior(.paging)` y `scrollPosition(id:)`, una
  página por semana con id = su lunes, cinco años a cada lado y sin recentrar. `EstadoCarrusel.irA` pide el mismo día
  de la semana; las respuestas viejas de Inicio se siguen ignorando.
- **Prueba de interfaz:** `BitacoraNativeUITests/CarruselUITests` (con `-pruebaCarrusel`, `PruebaCarruselView`, el
  carrusel real con la recarga tardía y una sincronización de fondo) desliza a los dos lados y comprueba la semana. El
  workflow falla si no se ejecuta y pasa.

## Hallazgos

| # | Hallazgo | Prioridad | Estado | Commit |
|---|---|---|---|---|
| A1 | Importador sin límite de archivo ni de descompresión | P0 | Arreglado: 15 MB texto, 25 MB Excel, 20 MB por XML, 60 MB en total, relación 100:1, 100.000 filas y 200 columnas; sin `.data`; lectura fuera del hilo principal y cancelable; lo pegado espera 300 ms y la última petición gana. Pruebas en `LimitesImportadorTests` | 4b4915d |
| A2 | Apuntar: hoja, teclado y JavaScript a la vez | P1 | Arreglado: se abre ya en `.large`, el foco llega 160 ms después, interpretar y guardar el borrador esperan 150 ms y el intérprete se precalienta al arrancar | 25bfcd4 |
| A3 | Acierto de Apuntar (60/91) | P1 | Pendiente: versión propia, como se pidió | |
| A4 | Guardados y borrados que callan el error | P1 | Arreglado: `c.guardar` sustituye a los 52 `try? await c.encolar`, avisa (también encima de las hojas) y los editores solo se cierran si se guarda. Regla en el workflow | f73e624 |
| A5 | Sección personalizada de Despensa que no vuelve a la automática | P1 | Arreglado, con prueba | f73e624 |
| A6 | Copias de deshacer importación sin protección | P1 | Arreglado: protección de archivo, fuera de las copias de seguridad y borradas al salir | 2618fe8 |
| A7 | Exportaciones y documentos en temporal | P1 | Arreglado: `ArchivosTemporales`, carpeta aleatoria con protección completa, borrada al cerrar la hoja o Quick Look, al salir y al arrancar; nombre remoto saneado | 2618fe8 |
| A8 | Caché de sync en memoria tras salir | P2 | Arreglado: `visible` y `aplicado` se vacían al iniciar y al detener; solo se hereda de la misma cuenta | 2618fe8 |
| A9 | Sello «actualizado en nube» atrasado | P2 | Arreglado: tras subir no se cambia hasta la siguiente lectura | 25bfcd4 |
| A10 | Finanzas no se precalienta al entrar | P2 | Arreglado | 2618fe8 |
| A11 | Rendimiento que solo informa | P2 | Arreglado: compara con el final de la 0.22 y falla si una medida empeora más de un 20 % y 5 ms. Las medidas del carrusel se separan en cálculo y pintado | 25bfcd4 |
| A12 | URLs del servidor sin validar e invitación mal escapada | P2 | Arreglado: HTTPS y host esperado (Supabase, `billing.stripe.com`); invitación con `URLComponents` | 25bfcd4 |
| A13 | Dos guías al mismo sitio | P2 | Arreglado a medias: una sola fila «guías.»; los enlaces a cada guía necesitan un cambio en la web | 25bfcd4 |
| A14 | Versión pública atrasada | P2 | Arreglado: 0.23.0 (con el número de build en Ajustes y Estado) | 25bfcd4 |
| A15 | Reduce Motion sin respetar | P3 | Arreglado en el aviso, los interruptores de Ajustes y las hojas | 25bfcd4 |
| A16 | Símbolos en el binario | P3 | Pendiente: no afecta al uso | |
| B1 | Cargas viejas que pisan a las nuevas | Alta | Arreglado: `ultimaGana` en todas las lecturas con `Task.detached`; Plan y Calendario con su turno | 1b82ec0 |
| B2 | Borrado de cuenta incompleto (Stripe, Storage) | Crítica | No aplica a esta sesión: servidor, lo lleva la sesión de Supabase | 551eabb |
| B3 | Calendario que falla abierto | Alta | No aplica: servidor | 551eabb |
| B4 | Fechas inválidas en el calendario | Media | No aplica: servidor | 551eabb |
| B5 | Franja blanca de las hojas | Media | Arreglado: `.hoja` / `hojaBitacora` en las 20 hojas (fondo, radio, tinta y aviso). Regla en el workflow contra `.sheet(` | f73e624 |
| B6 | Documentos e imágenes enormes en memoria | Alta | Arreglado: documentos de más de 50 MB no se bajan; imágenes solo 2xx, de tipo imagen y hasta 8 MB | 2618fe8 |
| B7 | Borrador de Apuntar tras salir | Media | Arreglado | 2618fe8 |
| B8 | Ajustes guardados en otro orden | Media | Arreglado: `ponerAjuste` encadena los toques y solo el último vuelve atrás | 1b82ec0 |
| B9 | Llavero que falla en silencio | Media | Arreglado: entrar avisa si la sesión no queda guardada | 2618fe8 |
| B10 | Formularios que se cierran con un gesto | Media | Pendiente: hace falta saber en cada editor si hay cambios; Presupuestos ya lo hace | |
| B11 | Borrado local sin comprobar | Baja | Arreglado: dos intentos, se comprueba y, si queda algo, aviso al salir | 2618fe8 |

## Qué probar en el iPhone

1. Inicio: deslizar la semana a un lado y a otro, varias veces seguidas y rápido. Tiene que pasar siempre y no volver atrás.
2. Apuntar: abrir con el +, escribir rápido. La hoja sale grande, sin salto al subir el teclado.
3. Una hoja cualquiera (Despensa, Viajes, Ajustes) en tema oscuro: sin franja blanca arriba.
4. Despensa: poner a un producto otra sección, volver a la automática y recargar.
5. Importar un extracto grande: aparece «leyendo el archivo…» y se puede cancelar.
6. Ajustes: tocar varias veces seguidas el mismo interruptor. Se queda como lo dejas.

## Rendimiento tras el carrusel nuevo

La primera compilación completa frenó en el umbral: sincronizar sin cambios hasta Inicio (15,1 → 41,8 ms), marcar una
tarea hasta Inicio (112,2 → 150,9 ms) y pintar otra semana del carrusel (58,1 → 92,0 ms). Las tres pintan Inicio, y el
carrusel paginado rehacía sus 521 semanas (sumas de calendario) en cada evaluación. d776417: caché por centro y
`CarruselDias` Equatable, sin tocar el paginado.
