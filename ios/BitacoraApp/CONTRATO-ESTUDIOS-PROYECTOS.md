# Contrato Estudios + Proyectos + Planificador (08-11-2026, app nativa 0.9.0)

Sale del código de la web (no de los documentos de ChatGPT): `js/enlaces-proyectos.js` (`estadoItemAsignatura`,
`alternarEntregado`, `syncExamCalendarEvent`, `syncAssignmentPlannerItem`, `findAssignmentById`), `js/conector.js`
(`estudio_crear`), `js/proyecto.js` (`proyectoDatos`, `proyectoCambiarEstado`, `proyectoAHoy`,
`proyectoTareaDesdePlanner`) y `js/planificador.js` (`togglePlannerItemDone`, `deletePlannerItem`, `arrastrarPlanner`).
En Swift: `DataContract/Operaciones.swift`.

## Campos

**`studies.subjects[]`**: `{ id, name, exams: [Item], assignments: [Item], ... }`.
`Item = { id: "item_<ms>_<azar>", title, date: "AAAA-MM-DD" | "", time?: "HH:MM", grade: "" | número, weight: "" | número, done: bool, fueraDelPlanificador?: true }`.
- `done` solo significa algo en **trabajos** («entregado.»). En exámenes la web lo ignora: su estado sale de la nota y
  la fecha. Por eso iOS no marca exámenes.
- Estado (`estadoItemAsignatura`): con nota → calificado; trabajo con `done` → entregado; fecha pasada → vencido
  (trabajo) o «hecho, sin nota.» (examen); si no, pendiente. Nunca se da por entregado porque pase la fecha.
- `fueraDelPlanificador`: el usuario borró su tarea del plan; no se vuelve a crear.

**Reflejos de un Item** (los rehace la web, nunca son la fuente):
- Calendario: entrada `evt_<itemId>` en `entries` con `linkedItemId`, `linkedSubjectId`, `linkedKind`, título
  «Examen: …» / «Entrega: … (asignatura)», `date`, `time`. Solo se crea al editar/crear con fecha: los Items viejos
  pueden no tenerla.
- Plan (solo trabajos con fecha y sin `fueraDelPlanificador`): tarea `planner_assign_<itemId>` en
  `dayPlanner.days[date]`, `time: item.time || '23:59'`, título «trabajo pendiente. …», notas «Asignatura: …»,
  `done = item.done`, `linkedAssignmentId`. La web la borra y la recrea en **cada carga** (`loadData`), así que la
  verdad es `item.done`.

**Proyecto**: entrada de `entries` con `type: "project"`, `title`, `status`, `tareas: [{ id, texto, estado: pendiente | curso | hecha, faseId?, fecha? }]`,
`tasks: [{ text, done }]` (espejo para la ficha y el conector), `fases`, `diario`, `siguienteId?`, `colina?`.
- `proyectoDatos`: sin `tareas`, se crean desde `tasks`; con `tareas`, lo que el conector añadió a `tasks` (por texto)
  entra y un `done` marca hecha. iOS hace lo mismo con ids deterministas `pt_c<índice>` (reaplicar da el mismo id).
- Tras cualquier cambio, `tasks = tareas.map({ text: texto, done: estado == "hecha" })`.

**Tarea del plan vinculada**: `linkedAssignmentId` (trabajo) o `proyectoId` + `proyectoTareaId` (proyecto).

## Operaciones atómicas

Todas se guardan en la cola antes de verse, se reaplican sobre lo último de la nube y suben con
`guardar_bitacora(parche, huellas)`. «Bloques» = claves de primer nivel que pueden ir en el parche.

| Operación | Bloques | Qué hace | Idempotencia |
|---|---|---|---|
| `marcarTarea` (ya existía) | dayPlanner, entries, studies | `togglePlannerItemDone`: done/hechaEn, `planner_done_<id>`, `item.done` del trabajo, estado de la tarea del proyecto (hecha / curso) | valor fijo, no alterna |
| `marcarTrabajo(asignaturaId, id, hecho, momentoMs)` | studies, dayPlanner | `alternarEntregado`: `item.done = hecho`; si su tarea `planner_assign_` existe, `done`/`hechaEn` en su sitio; si no existe y hay fecha y no está fuera, se crea como la web | valor fijo; trabajo borrado → nada |
| `crearEntrega(asignaturaId, lista, id, titulo, fecha?, hora?)` | studies, entries, dayPlanner | `estudio_crear` del conector: Item nuevo, `evt_<id>` si hay fecha y, si es trabajo, su tarea del plan | si el id ya está, no toca nada |
| `estadoTareaProyecto(proyectoId, tareaId, estado)` | entries | `proyectoCambiarEstado` con el estado final (no el ciclo); `hecha` quita `siguienteId` si era ella | valor fijo |
| `proyectoAHoy(proyectoId, tareaId, idTarea, dia)` | entries, dayPlanner | `proyectoAHoy`: tarea «<proyecto>: <texto>» con `proyectoId`/`proyectoTareaId` en el día lógico; pendiente pasa a curso | id decidido al tocar; tampoco crea si ese día ya hay una con ese `proyectoTareaId` |

Lo que iOS **no** hace (se queda en la web): editar, borrar o mover tareas vinculadas (`deletePlannerItem` marca
`fueraDelPlanificador`, y la web recrea la tarea en cada carga), notas y pesos, borrar Items, crear proyectos, fases,
diario y colina, marcar exámenes.

## Proyección

- **Plan**: las tareas vinculadas se ven y se marcan; marcarlas usa `marcarTarea` (que ya arrastra el resto). No se
  editan ni se mueven.
- **Calendario**: entradas `evt_` (no editables: la web las reescribe) y, para Items con fecha sin `evt_`, una fila
  virtual «Examen: …» / «Entrega: …» (`estudio_<id>`), solo lectura.
- **Estudios** (más. → estudios.): por asignatura, pendientes primero, con su estado; marcar trabajos; crear trabajo o
  examen. **Proyectos** (más. → proyectos.): progreso, siguiente paso y tareas; tocar cicla el estado; «→ hoy.».

## Sin red y conflictos

- Sin red: la operación queda en la cola (en disco) y la vista es base + cola. Sube al volver la red.
- Conflicto (otro dispositivo escribió entre leer y guardar): las huellas no cuadran, se vuelve a leer y se reaplica
  la cola. Como cada operación pone un valor final o comprueba el id, reaplicar no duplica ni alterna.
- La web cambió el mismo Item entretanto: gana el último valor escrito de `done`; título, fecha o nota de la web no se
  tocan (las operaciones cambian solo sus campos).
- Item o proyecto borrado en la web antes de subir: la operación no hace nada (no resucita).
- Al abrir la web después, `syncAssignmentPlannerItem` recoloca la tarea del trabajo en su fecha con el `done` del
  trabajo: coincide con lo que dejó iOS.

## Pruebas PWA–iOS imprescindibles

1. Marcar un trabajo en iOS (Estudios) → en la web: «entregado.» y su tarea del plan hecha. Y al revés.
2. Marcar en iOS la tarea «trabajo pendiente. …» del plan → la web lo ve entregado al recargar (no vuelve pendiente).
3. Crear un trabajo con fecha en iOS → la web lo tiene en la asignatura, en el calendario (`evt_`) y en el plan ese día;
   recargar la web no lo duplica.
4. En iOS «→ hoy.» de una tarea de proyecto y marcarla en el plan → la web la ve hecha en el proyecto y en `tasks`.
5. Cambiar el estado de una tarea de proyecto en iOS sin red, cambiar otra en la web, volver la red → las dos quedan.
6. Tocar dos veces seguidas «→ hoy.» → una sola tarea en el plan.
