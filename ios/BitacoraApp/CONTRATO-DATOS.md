# Contrato de datos de Bitácora, versión 1 (06-11-2026)

Qué hay en la fila `public.bitacora` (`user_id`, `data jsonb`, `updated_at`) y cómo lo trata la web. Sale de
`DATOS_SINCRONIZADOS`, `loadData` y `doSaveData` en `js/datos.js`, y de los apartados que tocan cada bloque.
La lista de claves la vigila `node --test pruebas/contrato-ios.mjs` contra `BitacoraNative/DataContract/ContratoDatos.swift`.

## Reglas comunes

- **Guardado de la web:** lee la fila, fusiona a tres bandas cada clave de `DATOS_SINCRONIZADOS` (base = lo último que
  leyó ese dispositivo, local, nube) y manda solo las claves de primer nivel que cambian a `merge_bitacora_data(p_patch)`.
  El upsert completo solo si esa función no existe. Las claves que no están en la lista se copian de la nube tal cual.
- **Fusión (`fusionarTresBandas`):** si solo cambió un lado, gana ese; objetos campo a campo; listas cuyos elementos
  tienen todos `id` único, elemento a elemento (un borrado gana salvo que el otro lado cambiara ese elemento); en
  cualquier otro caso gana el local. `undefined` (no existe) y `null` son distintos. Portada a Swift en `Fusion.swift`.
- **Antes de fusionar `dayPlanner`** la web arrastra a hoy lo no hecho de días pasados en los tres lados
  (`PREPARAR_FUSION`). La nativa debe portarlo antes de escribir en el planificador.
- **Identificadores:** cadenas `prefijo_<Date.now()>_<azar>` (`planner_`, `habit_`, `entry_`, `cat_`, `sub_`...). La
  nativa puede crear UUID: la web solo compara con `String(id)`.
- **Fechas:** días civiles `AAAA-MM-DD` en hora local del dispositivo (`isoLocal`, nunca `toISOString().slice(0,10)`);
  meses `AAAA-MM`; instantes ISO 8601 (`createdAt`, `hechaEn`). El día del planificador cambia a las 4:00
  (`currentPlannerDayKey`).
- **Dinero:** números JSON (a veces cadenas heredadas). `amount` es positivo y `type` decide el sentido.
- **Normalizaciones al cargar:** la web rellena valores por defecto y migra formatos viejos (abajo). Muchas solo viven
  en memoria hasta el siguiente guardado, así que la nube puede tener todavía la forma antigua: la nativa tiene que
  leer las dos.

## Claves especiales

| Clave | Qué es | Regla |
|---|---|---|
| `apuntes` | notas de la página independiente `estudios-apuntes.html` | la web solo la sustituye al importar (`apuntesDirty`); en cualquier otro guardado conserva la de la nube. **La nativa nunca la escribe.** |
| `_meta` | `{ lastSnapshotWeek: "AAAA-Www" }` | la web la actualiza para el snapshot semanal en `bitacora_snapshots`. **La nativa nunca la escribe.** |

## Claves heredadas

`diasFiesta`, `fantasyData` y `wishlistItems` (vistas en la cuenta de Alejandro el 06-11-2026) son de las primeras
versiones de la web, cuando todo vivía en un solo `index.html`; ningún código actual las lee ni las escribe. La web las
conserva porque al guardar copia de la nube todo lo que no está en `DATOS_SINCRONIZADOS`. La nativa las marca como
conocidas (`ContratoDatos.heredadas`) y también las conserva. Borrarlas sería una decisión de Alejandro, nunca automática.

## Bloques sincronizados

Tipo y valor por defecto según `loadData`. «id» = sus listas se fusionan elemento a elemento.

| Clave | Tipo, por defecto | Elementos e id | Fechas | Lo escriben | Al cargar | Notas |
|---|---|---|---|---|---|---|
| `entries` | lista, `[]` | eventos, viajes, cumpleaños, exámenes...; `id` | `date`, `endDate`, `startDate` civiles; `time` HH:MM | entradas.js, viajes.js, eventos.js, conector, apuntar | `·` pasa a comas en título/notas/lugar; `normalizeWorkCotizationData`; absorbe `plannedTrips` | `type` decide la forma; `ejemplo: true` para la semana de ejemplo |
| `categories` | lista, `getDefaultCategories()` | `id` (`cat_...`) | | entradas.js | rosa de `cat_evento` pasa a negro; se ponen ids que falten | |
| `userName` | texto, `''` | | | ajustes | | |
| `investmentData` | objeto, `{initial:0, rate:7, monthly:0}` | | | finanzas | `migrateInvestmentData` | heredado |
| `notes` | lista, `[]` | `id` | `createdAt` | notas-objetivos.js | | |
| `prompts` | lista, `[]` | | | | | |
| `inbox` | lista, `[]` | `id` | | captura | | |
| `registroConector` | lista, `[]` | `ref` | instantes | conector.js | | historial con deshacer |
| `analisisIA` | objeto o `null` | | | conector | | |
| `preferenciasAvisos` | objeto, `{}` | | | ajustes | | `eventos === false` apaga avisos push (avisos-diarios) |
| `ciudadTiempo` | objeto o `null` | | | calendario | | |
| `financeIncome` | objeto, `{current:0, next:0}` | | | finanzas | | heredado |
| `financeProfile` | objeto (cash, targets, `salaryForecast`, `history`, `movements`, `budgetPlans`, `budgetHistory`...) | listas internas con `id` | meses `AAAA-MM` como claves | finanzas.js, presupuesto.js | rellena una docena de campos; migra `oneOffIncome` a `movements` (`_oneOffMigrated`) | `cash` ya no se usa |
| `financePro` | objeto (`accounts`, `categories`, `transactions`, `rules`, `programados`, `categoryBudgets`, `incidencias`...) | `transactions[].id` | `date` civil | finanzas-pro.js, conector (bandeja), importar | `enabled = true`; cuentas efectivo/bancos/online; categorías por defecto añadidas; `cat_regalo` «Regalos» → «Aportaciones» | todo cambio por `commitFinanceChange`; `prepararFinanzas()` es idempotente y no guarda solo |
| `plannedTrips` | lista, `[]` | | | | se migra a `entries` y se vacía | heredado |
| `weeklyTasks` | lista, `[]` | | | | | |
| `cultureLists` | lista, `[]` | `id` | | ocio.js, conector | | |
| `habits` | lista, `[]` | `id` (`habit_`) | `completadas` = `{ "AAAA-MM-DD": true }` | planificador.js | `completadas` siempre objeto | rutinas en la interfaz |
| `collectibleCategories` | lista, cartas y videojuegos | `id` | | coleccionables | | |
| `collectibles` | lista, `[]` | `id` | | coleccionables | | |
| `dayPlanner` | objeto, `{days:{}, backlog:[]}` | `days["AAAA-MM-DD"][]` y `backlog[]` con `id` (`planner_`) | claves civiles del día lógico | planificador.js, estudios (trabajos), proyectos, apuntar, conector | `migratePlannerData` (formato viejo `{dayKey, items}`); `arrastrarPlanner` | tarea: `id, title, time?, notes?, done, arrastrado?, hechaEn?, prioridad?, subtasks?` |
| `recurringTasks` | lista, `[]` | `id` | `completadas` por día | planificador.js | `completadas` siempre objeto | |
| `dailyEffort` | objeto, `{}` | | claves civiles | | | |
| `studies` | objeto (`subjects`, `schedule` por día `lun..dom`, `quickNotes`, `carrera`, `classroom`) | `subjects[].id` | exámenes/trabajos con `date` civil | estudios, universidad.js, conector | rellena días del horario; `notes` (texto viejo) pasa a `quickNotes` y se borra; `syncAssignmentPlannerItem` crea tareas | el «hecho» del trabajo vive en el trabajo, no en la tarea |
| `links` | lista, `[]` | `id` | | enlaces-proyectos.js | | |
| `linkCategories` | lista, `[]` | `id` | | | | |
| `blurFinances` | sí/no, `false` | | | finanzas | | |
| `pedidos` | lista, `[]` | `id` | | actualizaciones.js, función seguimiento-pedidos | | |
| `hansei` | lista, `[]` | `id` | | metodo.js | | |
| `apartadosConfig` | objeto o `null` | | | ajustes | | `perfil`, `opcionales`, `panorama` |
| `perfilLaboral` | objeto o `null` | | | cv.js | | |
| `profesorado` | objeto o `null` | `clases`, `sesiones` con `id` | civiles | profesorado*.js, conector | | |
| `agendaLaboral` | objeto o `null` | `citas[].id` (`lab_`) | civiles | agenda-laboral.js | | |
| `listaCompra` | objeto o `null` | listas, `recetas`, `plan["AAAA-MM-DD"][]` con `id` | civiles | compra.js, conector | | |
| `estudiar` | objeto o `null` | `tests`, tarjetas con `id`; `repasos["id:cara"]` | instantes | estudiar.js, test.js | | |
| `avisoDiarioVisto` | texto o `null` | | día civil | | | |
| `apuntesRecientes` | lista, `[]` (40 como mucho) | `id` | instantes | apuntar.js | | |
| `calendarioFeedVersion` | número, `0` | | | ajustes | `Number()` | invalida el enlace .ics firmado |
| `bienvenida` | objeto o `null` | | | bienvenida.js | | |
| `servicios` | objeto, `{}` | `compartidos`, `ocultos`... | | servicios.js, compartir.js | | tokens de Siri y correo; `transporte.posteInicio` («bus:N», la parada de Inicio, debe estar en `favoritos`; la PWA la lee en `mobileBusPoste` y la conserva) |

## Lo que la nativa hace con cada bloque (v1)

Todo es **solo lectura**. La fila se guarda entera, tal como llega, en `base.json`; `DocumentoBitacora` la parte por
claves conservando los bytes de cada una, y `conservaTodoAlReescribir()` comprueba (en la pantalla «estado.» y en los
tests) que volver a escribirla no cambia ni una clave, conocida o no. Se decodifica solo `dayPlanner`, para «hoy.».

Antes de la primera escritura (fase 2) hace falta: portar `PREPARAR_FUSION`, decidir la operación del servidor para
tareas (o usar `merge_bitacora_data` con fusión previa) y la prueba cruzada PWA/iPhone de la guía (12.2).
