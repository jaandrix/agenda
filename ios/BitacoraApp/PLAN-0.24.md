# Plan de la 0.24 (para esta noche, cuando Alejandro dé la orden)

Claude dirige y GPT audita. Una sola subida al final, como en la 0.22 y la 0.23.

## 1. Apuntar fiable en el iPhone y en el PC (lo principal)

El 17-11 «tarea Organización de Viajeros - PE 3 hoy a las 16,30h» tomaba el «3» como hora y dejaba «,30h» en el
título (arreglado en c01457d). Hoy el banco acierta 60 de 91 (66 %). El motor es el mismo `js/apuntar.js` en las dos
apps, así que cada arreglo vale para el PC y para el iPhone.

1. **Banco más grande y realista.** Partir de `pruebas/casos-barra.json` (91 casos) y sumar unas 80 frases como las
   que escribe Alejandro, con códigos, guiones, mayúsculas, horas en todas sus formas («16,30h», «16.30», «a las 4 y
   media», «16h»), «tarea …», «evento …», lugares y títulos con números. Guardarlas en `pruebas/casos-barra-2.json`.
2. **Agrupar los fallos por causa** con `node pruebas/barra.mjs`: hora, fecha, tipo, título que se come palabras,
   importes, trocear de más o de menos.
3. **Arreglar por grupos**, de más a menos frecuente. Cada arreglo con su caso en el banco y sin bajar ninguno de los
   que ya aciertan (`barra.mjs`, `apuntar-p0.mjs` y `apuntar-casos.mjs` en verde).
4. **Regla de oro del título:** lo que no se reconoce como fecha, hora, importe o lugar se queda en el título tal cual
   (con sus números y guiones). Nada de recortes a medias como «,30h».
5. **Objetivo:** al menos 85 % en el banco ampliado. Medir antes y después y apuntarlo aquí.
6. Llevar a `js/apuntar.js` los validadores P0 que hoy solo están en el puente del iPhone (`apuntar-puente.js`), y
   quitarlos del puente para no validar dos veces.
7. Subir la versión `?v=` de `js/apuntar.js` en `index.html` sin arrastrar los cambios de la PWA que siguen en espera
   (commit con índice temporal).

**Hecho el 17-11.** `node pruebas/barra.mjs` (mismo banco antes y después, medido con el `js/apuntar.js` de 3222d65):

| banco | antes | después |
|---|---|---|
| `casos-barra.json` (DeepSeek, 91) | 60 (66 %) | 73 (80 %) |
| `casos-barra-2.json` (frases de Alejandro, 99, mira también título y lugar) | 80 (81 %) | 98 (99 %) |
| los dos (190) | 140 (74 %) | 171 (90 %) |

Por causa, en el banco nuevo antes: título 16, hora 4, fecha 4, tipo 3, importe 2, trocear 2, lugar 1. Arreglado:
- **Título:** «examen», «entregar» y «clase» se marcan en vez de quitarse y vuelven al título si al final no es examen,
  entrega ni clase («tarea Entregar TFG v2», «Preparar clase 2ºB», «evento Examen PE 3»); «antes del viernes» ya no deja
  «antes del»; «pagar 1.200 € de alquiler» da «Pagar alquiler»; con un importe, sin artículo delante («Nómina»).
- **Hora:** la que tiene forma de hora («16h», «16:30») gana al número suelto («PE 3 16h» daba las 15:00); minutos
  pegados con punto o coma (con espacio, «PE 3, 16:30» daba 3:16); final con guion («9:00-14:00»); «cine a las 10» es de
  noche como la cena.
- **Fecha:** «el viernes 13» manda el número; «3 de 17» y «1-5» no son fechas (con «de», el mes va con letras; con guion,
  solo con año); los cumpleaños pasados van al año que viene; lo que se repite ciertos días empieza el primero que toca.
- **Tipo e importe:** «nota …» sin dos puntos es nota (salvo «nota media/de/final»); «clase de X martes y jueves» es
  clase aunque falte «los»; «nómina 1650», «me han ingresado/cobrado/devuelto» son movimientos («me han cobrado» es
  gasto); miles («1.320,45 €») y varios importes («gasté 12 en el cine y 8 en palomitas») en el motor.
- **Trocear:** «mañana: llamar al banco, pedir cita y comprar sellos» lleva el día a las tres; una nota no se parte.
- **Validadores en la web:** `apuntarValidar` (fechas que no existen, repeticiones imposibles, cosas vacías, órdenes de
  borrar o cambiar, preguntas, negaciones y asignatura que no existe), `apuntarSinMiles`, `apuntarDictado` y
  `apuntarVariosImportes` pasan de `apuntar-puente.js` a `js/apuntar.js`. La web los aplica en `apuntarDescribir` (la
  hoja y la barra del escritorio enseñan el motivo) y en `apuntarCrear` (no guarda); el puente solo conserva la
  prioridad. `apuntar-p0.mjs` comprueba ahora también la web (55 pruebas).

Queda sin resolver: «mañana a las 10 dentista y a las 12 recoger el coche» (la segunda cosa empieza por la hora y no se
parte) y, del banco de DeepSeek, lo discutible («llamar a María a las 5» como evento, «12,50 de cena» sin €).

## 2. Lo que quedó de las auditorías

- **B10:** los formularios que se cierran con un gesto deben preguntar si hay cambios (editor de tarea, evento,
  movimiento, receta, viaje…). Un modificador común que compare el borrador con el original.
- **A16:** símbolos del binario (P3, solo si sobra tiempo).
- **P1, rendimiento del carrusel nuevo (de la 0.23).** En las dos ejecuciones de la 0.23, «carrusel: otra semana
  (pintar)» va unas 2 veces más lento (50 → 101 ms) y «marcar tarea hasta Inicio» de 100 a 400 ms. Pista: en
  `RendimientoAppTests` la vuelta deja Inicio en otra semana justo antes de marcar, así que marcar también devuelve el
  carrusel a hoy. Mide un salto programático del `ScrollView` paginado (`scrollPosition`, páginas perezosas que se
  crean), que en la app no pasa al marcar. Pasos: separar en la prueba «marcar» del cambio de semana; medir el salto
  solo; si sigue caro, probar menos páginas (`alcance`), pintar las semanas sin `containerRelativeFrame` (ancho fijo
  desde `GeometryReader`) o un `TabView` `.page` con las mismas ids. Sin tocar el paginado, que es lo que arregló el
  deslizamiento.
- **Medida estable:** desde la 0.23 se mide antes y ahora dos veces, intercaladas, y avisa (sin bloquear) por encima
  del 30 % y 15 ms. Cuando sea estable entre ejecuciones, volver a hacerla bloqueante.
- **Servidor:** probar el borrado de cuenta con una cuenta de prueba, nunca con la de Alejandro.

**Hecho el 17-11 (nativa).**
- **P1, carrusel y marcar (f17e9d5).** La causa de «marcar tarea hasta Inicio» era la prueba: medía también el salto del
  carrusel de otra semana a hoy. `ultimaGana` no está en ese camino (Inicio y la prueba calculan con `Task.detached`),
  así que no era el salto de hilo. Ahora el salto va aparte («carrusel: volver a hoy (pintar)»), marcar sale de Inicio
  en hoy y lo que la vista deja para el siguiente ciclo (el `onChange` del carrusel) se hace fuera de la medida
  (`asentar()`). Además, el carrusel pasa de 521 a 105 páginas (`alcance` 52, un año a cada lado; se rehace alrededor de
  la semana que se ve a las 42 semanas): el `LazyHStack` coloca todas las ids en cada salto. El paginado no cambia y
  `CarruselUITests` desliza solo unas semanas. Como la medida de «antes» usa la prueba de este commit, la comparación
  sigue siendo justa. **Por comprobar en CI:** si «carrusel: volver a hoy» y «otra semana» siguen caros, lo siguiente es
  pintar las semanas con ancho fijo (`GeometryReader`) en vez de `containerRelativeFrame`.
- **B10 (936f172).** `preguntarAlDescartar(cambiado, preguntar:cerrar:)` en `DesignSystem/Descartar.swift`: con cambios,
  la hoja no se deja bajar y el intento pregunta «¿descartar los cambios?», lo mismo que «cancelar.». Para enterarse del
  intento se pone delante del delegado de la presentación (solo `presentationControllerDidAttemptToDismiss`; lo demás va
  al de SwiftUI); si no lo encuentra, la hoja sigue sin bajarse, sin pregunta. En tarea, evento, movimiento, receta,
  viaje, objetivo, ficha de documento, presupuestos y los editores nuevos (reserva, empleo, pilar).
- **A16:** no ha dado tiempo; pasa a la 0.25.

## 3. Lo que sigue en la web dentro de apartados ya nativos

- Viajes: reservas, listas, mapa y Destino.
- Empleo: fichas de empleo y vida laboral.
- Objetivos: Harada, kaizen y tablero.
Por valor de uso diario; lo que no entre, se queda para la 0.25.

**Hecho el 17-11.**
- **Viajes (79fce65):** reservas (transportes y alojamiento con los campos de la web; las fechas como `datetime-local`,
  en hora de Madrid), listas con sus cosas y la pestaña Destino (tiempo: previsión o el año pasado; la hora allí; la
  moneda con cambio y conversor; enchufes y urgencias). Destino no escribe en el documento: usa `destinoGeo` si la web
  ya lo guardó y, si no, lo busca y lo guarda en la caché de este iPhone (6 horas).
- **Empleo (00554ae):** fichas de empleo (op extra `fichaEmpleo`, como `saveEntry`) y la vida laboral (días por empleo,
  los del informe si están, y el total).
- **Objetivos (8209111):** paso kaizen (crear, marcar hoy con racha, cambiar), mandala (ocho pilares con ocho acciones)
  y tablero por estado (flecha al siguiente o menú). Ops extra `kaizenObjetivo`, `quitarKaizenObjetivo`, `pilarObjetivo`
  y `estadoObjetivo`.

**Para la 0.25:** mapa del viaje y sus documentos, festivos del destino, duplicar viaje; CV, PDF de vida laboral e
importador del informe; «para qué», hansei y pasar una acción del mandala a rutina; A16.

## 4. Medir en el iPhone

Preparar una pantalla de medidas en Ajustes → avanzado (arranque, cada pestaña, Finanzas y Apuntar) para que
Alejandro mande los números reales; la tabla de CI ya compara versiones.

**Hecho el 17-11 (a6ca990).** Ajustes → avanzado → «medidas.»: `Medidas` (`Core/Logging/Medidas.swift`) guarda en el
iPhone las 12 últimas de cada una (arranque hasta Inicio desde la app y desde el proceso, cambiar a cada pestaña hasta el
siguiente fotograma, cargar plan, calendario, finanzas y menú, abrir Apuntar e interpretar, marcar hasta Inicio y el
carrusel), enseña mediana, mín. y máx., lo último del motor de Finanzas, y «copiar las medidas.» las deja en el
portapapeles con el formato de CI (`MEDIDA|nombre|mediana|mín|máx|veces`).

## Decisión pendiente de Alejandro

- Los cambios de la PWA en espera (barra de abajo un poco más grande, «más usados» animado, transiciones con escala):
  subirlos o descartarlos. Están en la copia de trabajo y en el stash «pwa-nav-ui-sin-commitear-10-11».

## Qué probar al terminar

Se escribirá al cerrar la versión, con frases concretas para Apuntar en el PC y en el iPhone.

### Qué probar en el iPhone (nativa, puntos 2 a 4)

1. **Carrusel:** en Inicio, desliza la semana varias veces a los dos lados y toca otro día. Marca una tarea: tiene que
   verse hecha al momento, sin que la semana se mueva.
2. **Descartar cambios:** abre una tarea, cambia el título y baja la hoja con el dedo. Tiene que preguntar «¿descartar
   los cambios?»; «seguir editando.» deja lo escrito. Sin cambios, la hoja baja sin preguntar. Prueba también en un
   evento, un movimiento y un viaje.
3. **Medidas:** usa la app un rato (ábrela desde cero, pasa por cada pestaña, Finanzas, Apuntar, marca algo, desliza la
   semana). Luego Ajustes → avanzado → «medidas.» → «copiar las medidas.» y pégalas en el chat.
4. **Viajes:** abre un viaje. Añade un vuelo (origen, destino, salida con hora) y un hotel; crea la lista «qué llevar»
   con dos cosas y marca una. Toca «destino.»: el tiempo, la hora allí y, si es fuera de la zona euro, el cambio con el
   conversor. Comprueba en la web que se ven igual.
5. **Empleo:** «+ empleo.» con empresa, cargo y fecha de inicio; edita uno antiguo y pon los días de tu vida laboral.
   El total de arriba cambia y la web los enseña igual.
6. **Objetivos:** en un objetivo, empieza un paso kaizen y márcalo hoy (sale en Rutinas); escribe un pilar con dos
   acciones. Cambia a «tablero.» y pasa un objetivo a «en progreso» con la flecha.

_17-11: la 0.23 se compila con 22b0df1 (todas las ?v= a la vez)._
_17-11: relanzada otra vez (GitHub sin Mac en 7befa7d)._
_17-11: relanzada a mano (GitHub sin Mac en f1163f8)._
