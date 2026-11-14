# Plan 0.21

Pedido de Alejandro del 14-11-2026: «La despensa no funciona bien, no se marcan los alimentos correctamente y además los
nombres están descentrados de la bola de marcar como en la cesta… revisa en profundidad eso y aplica este y otros cambios
que consideres mejoras». Claude dirige y GPT audita.

| Punto | Commit | Qué |
|---|---|---|
| 1. Despensa | c3be221 | Marcar, secciones como la web y fila común con el círculo alineado. |
| 2. Rendimiento | 5364d60 | Cola incremental en `documentoVisible`, informe de la nube por piezas, señales. |
| 3 y 4. Valorar y hora de fin | d129792 | `endTime` en el editor de eventos; aviso local de «valorar» a su hora. |
| 5. Bandeja | 05312c8 | Ocio, compra, proyecto, objetivo, estudios y deseo se aplican en el iPhone. |
| 6. Mejoras | 48c03b7 | Fichas de Documentos en el iPhone; el mismo círculo en Estudios, Objetivos y Viajes. |
| Arreglo | 202b9f6, 03bf146 | Tipos de las listas de resumen de la bandeja (el primer intento no compilaba). |

Compilaciones: punto 1 en verde (43636898716). Los puntos 2 a 6 se subieron juntos: la primera (43638688818) falló por
un tipo mal anotado en `OperacionesConectorMas.swift`; con el arreglo, **43638963633 en verde** (tests, análisis, Release y
la definitiva).

## 1. Despensa: por qué no se marcaba bien

Tres causas, no una:

1. **El toque mandaba una foto vieja.** `BitacoraCheck` encolaba `guardarItemCompra(… hecho: !item.hecho …)` con el
   producto entero tal como estaba al pintar la fila. La fila no cambiaba hasta que la cola, el análisis del documento y
   el agrupado fuera del hilo principal volvían (con muchas operaciones en cola, un rato). Un segundo toque, pensando que
   el primero no había entrado, mandaba otra vez `hecho: true`: no se desmarcaba, o se quedaba como antes.
2. **Una carga vieja podía pisar a una nueva.** `cargar()` corría en `Task.detached`, que no se cancela con el
   `.task(id:)`: si dos cargas se cruzaban, la más lenta (con datos de antes) se pintaba la última.
3. **Las secciones no eran las de la web.** La web no guarda `seccion` en el producto: la deduce con `compraSeccion`
   (COMPRA_SECCIONES y `aprendido[compraClave]`). La nativa leía `item.seccion` y, sin ella, todo caía en «otros»; además
   cada marca escribía `seccion: "otros"` en el producto.

Arreglo:
- Op `marcarCompra` (`OperacionesDespensa`): solo cambia `hecho`, con el valor escrito (no «al revés»), así que reaplicarla
  da lo mismo. Busca el producto en su lista y, si no, en las demás; un producto borrado no vuelve.
- `MarcasDespensa`: el toque se ve al momento y el valor sale de lo que se ve, no de la foto. Las operaciones de una misma
  pantalla salen en el orden de los toques (cadena de `Task`). Una marca se suelta cuando llega un documento de una
  revisión igual o posterior a la de su operación (`documentoVisibleConRevision`), que ya la incluye.
- Cada carga lleva un número: solo se pinta la última.
- `SeccionCompra`: COMPRA_SECCIONES y la regla del caldo, portadas tal cual; lo aprendido manda. Editar un producto ya no
  toca `hecho` (op `editarCompra`) y, si la sección no es la que se deduce, la apunta en `aprendido` como la web.
- Terminar la compra guarda la clave de `compraClave` en el historial y la sección deducida; el gasto se llama
  «Compra (tienda)», como en la web. Ids repetidos en una lista se pintan una vez.

**Alineación.** El círculo se centraba en el bloque entero (título y detalle); en Despensa el detalle podía ser un texto
vacío que igual ocupaba una línea, así que el círculo quedaba por debajo del nombre. `FilaCirculo` (Componentes.swift) es
ahora la única fila con círculo: guía de alineación `primeraLinea`, el centro del círculo cae en el centro de la x de la
primera línea del título, con Dynamic Type y el tamaño de letra de la app (`enPrimeraLinea`). La usan Inicio, Plan,
rutinas, pendientes sin día (todos por `FilaAgenda`), Despensa, la cesta («pasar a la cesta.»), los trabajos de Estudios,
los hitos de Objetivos y los lugares de Viajes.

Tests: `DespensaMarcarTests` (marcar sin tocar lo demás e idempotente, tres toques seguidos, varios productos, desmarcar,
sincronización a medias, fallo al guardar, otra lista, borrado, secciones, editar, ids repetidos).

## 2. Rendimiento

- **Cola incremental.** `AlmacenLocal.versionBase` solo cambia con `base.json`. `SyncEngine` guarda lo último calculado
  con esa versión y los ids de las operaciones que lleva: si la base no cambió y la cola solo creció, aplica encima las
  nuevas. Antes, cada escritura de cualquier apartado volvía a analizar la base y aplicar la cola entera; con movimientos
  de Finanzas en cola, cada marca en Despensa volvía a descodificar `financePro` entero una vez por vuelta
  (`CambioFinanzas.aplicar` y `crearMovimiento` leen la clave entera). Ahora solo se lee la clave que toca la operación
  nueva. Cuando la sincronización confirma, cambia la base y se recalcula una vez.
- **Informe por piezas.** `AppCoordinator` tenía `informe` como un solo valor observado: empezar a traer, la hora de la
  última sincronización o el resumen avisaban a todas las pantallas que leían `revision`. Ahora `revision`, `estadoSync`
  y `pendientes` son propiedades propias que solo se asignan si cambian; el informe completo solo lo lee «estado.».
- **Señales.** Intervalo «documento visible» en Points of Interest (subsistema `com.bitacora.nativa`), con
  «incremental N» o «completo N».

**Medidas.** `RendimientoTests` (3.000 movimientos, 30 en cola y 10 marcas de Despensa) comprueba que el resultado
incremental es igual que aplicar toda la cola sobre la base y deja la medida como aviso «medida» en la compilación:

- Compilación 43638963633 (simulador de CI): **cola entera 82,8 ms, solo lo nuevo 0,9 ms de media** por escritura. En el
  iPhone la diferencia será parecida o mayor (más movimientos y CPU más lenta que el Mac del runner).

Sin medir aún en el iPhone en Release (Instruments, plantilla Points of Interest): pendiente.

## 3 y 4. Hora de fin y «valorar» con la app cerrada

- La web ya tiene `endTime` en eventos (importados de .ics en eventos.js, compartidos en social.js y compartir.js) y
  Apuntar escribe «hasta las HH:MM» en las notas. El editor del iPhone guarda `endTime` («hasta una hora.», «acaba.»);
  quitarlo borra el campo. Al editar, se rellena con `endTime` o, si no, con lo de las notas. La ficha enseña «de … a …».
- `ValorarOcio.horaFin` mira `endTime` y después las notas; si acaba antes de empezar, es del día siguiente.
- Aviso local `valorar-<evento>` a la hora exacta para los eventos de ocio de la semana siguiente (como mucho 6), dentro
  de `Recordatorios.reconciliar` (corre en cada revisión). Al abrir la app, ValorarOcio crea la tarea y la tarjeta y el
  aviso deja de pedirse. Los avisos de eventos bajan de 50 a 44 para no pasar de los 64 de iOS. Elegir «de ocio.» en el
  editor pide permiso de avisos si aún no se ha pedido.

Tests: `HoraFinValorarTests`.

## 5. Bandeja

`OperacionesConectorMas.swift`: compra, deseo, ocio (nuevo o cambios; con nota de película, la tarea «valorar» queda
hecha), objetivo (hitos, hito hecho, hito quitado, progreso, quitar), proyecto (crear, tareas, siguiente, completar,
apunte, quitar, mover, estado, fecha, fase) y estudio_crear / estudio_editar (con su evento y su tarea, por las mismas
operaciones que Estudios). Misma línea y mismo `deshacer` que la web, así que se deshacen desde la web; en el iPhone se
deshacen los que ya se podían (quitar entrada nueva, reinsertar objetivo). Las fases que la web crea con id al azar salen
de `ref`, para que reaplicar no cambie nada. Tests: `ConectorMasTests`.

Siguen esperando a la web: ticket, receta, laboral, profe, test, tarjetas, clase, día, entrada_editar, inversion y las
entradas de dinero.

## 6. Mejoras elegidas y por qué

Por valor en el uso diario de Alejandro:
1. **El mismo círculo en todo lo que se marca** (Estudios, Objetivos, Viajes): era la queja de la cesta repetida en otros
   apartados; un solo componente evita que vuelva a pasar.
2. **Fichas de Documentos en el iPhone** (PLAN-0.18, pendiente 8): las caducidades (DNI, seguros, ITV) se apuntan cuando
   se tiene el papel delante, que suele ser con el móvil. Subir, renombrar y borrar archivos sigue en la web.
3. **Accesibilidad**: filas con círculo como un solo elemento de VoiceOver con su acción («al carro», «marcar entregado»);
   la papelera y «+ plato.» del plan de Despensa pasan a 44 pt.

## Pendiente, por valor

1. Medir en el iPhone en Release con Instruments (Points of Interest «documento visible», arranque, cambio de pestaña).
2. Bandeja: ticket y receta (Despensa), clase y día.
3. Viajes (reservas, listas, documentos, Destino), Empleo (fichas, vida laboral) y Objetivos (Harada, kaizen).
4. Documentos: subir y borrar archivos.
5. Despensa: «lo que te ha costado» por producto y precios por tienda (compraPrecios), como en la web.

## Probar en el iPhone (0.21)

- **Despensa, marcar:** en la lista, tocar el círculo de un producto: pasa al momento a «en el carro.». Tocar tres veces
  rápido el mismo: se queda marcado. Marcar cinco seguidos: van todos al carro y no vuelve ninguno atrás. Sin red (modo
  avión), marcar y desmarcar; al volver la red, la web enseña lo mismo.
- **Despensa, secciones:** lo apuntado en la web (leche, tomates, pan…) sale en su sección, no todo en «otros».
  Cambiar la sección de un producto en «editar.»: la web la recuerda.
- **Alineación:** el círculo a la altura del nombre en Despensa (también con «para receta» debajo), la cesta de una
  receta, Inicio, Plan, rutinas, trabajos de Estudios, hitos y lugares de un viaje. Probar con letra grande en Ajustes.
- **Hora de fin:** crear un evento «cine Dune» de 20:00 «hasta una hora.» 22:40: la ficha dice «de 20:00 a 22:40» y la
  web conserva la hora de fin. A las 01:40 llega «valorar la película.» con la app cerrada (si se dieron permisos).
- **Bandeja:** pedir a Claude «añade leche a la compra», «apunta el libro Dune», «añade el hito 10 km a Correr» o «pon
  un examen de Física el 1 de diciembre»: se aplican solos en el iPhone, con su aviso, y se deshacen desde la web.
- **Documentos:** «+ ficha.», DNI con caducidad: sale ordenada por fecha y en rojo si caduca en 30 días; editarla y
  borrarla.
