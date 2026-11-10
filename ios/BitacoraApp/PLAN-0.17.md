# Plan de la 0.17 (app nativa)

Decidido el 10-11-2026 a partir del plan maestro de ChatGPT (`Documents\ChatGPT\agenda\PREPARACION-CLAUDE-PROXIMA-IPA`).
Claude dirige el proyecto y GPT asesora y audita.

**Alcance de Alejandro:** solo la app nativa. La PWA queda en espera: no se tocan `js/`, `index.html`, `styles.css` ni
`service-worker.js`, y los cambios de la PWA que siguen sin commitear en la copia de trabajo no se tocan.

## Orden acordado

1. Validadores P0 de Apuntar (solo iOS).
2. Una sola clave de importación de extractos: iOS se adapta a la de la PWA.
3. Prioridad en el planificador nativo.
4. El resto de P0 y P1 del plan maestro y de la auditoría de la IPA del run 57.
5. Barra, iconos y carrusel.
6. Glass solo como tema opcional detrás de un interruptor, apagado por defecto.

Ampliación de Alejandro: antes de la parte visual (punto 5), la siguiente tanda de apartados nativos, por orden de uso:
Viajes, Empleo, Objetivos, Enlaces, Envíos y Documentos (en lectura). Cada uno es un corte vertical completo: si no da
tiempo, se queda en la web y se anota aquí.

Un commit y una compilación de Actions por corte, con push a main.

## Hecho

| Corte | Commit | Qué |
|---|---|---|
| 1 | a4bc0c0 | Validadores P0 de Apuntar en `apuntar-puente.js`, que solo carga JavaScriptCore. Ver el detalle debajo de la tabla. |
| 2 | 2797972 | Importar extractos con la clave de la web. Ver el detalle debajo de la tabla. |
| 3 | da20162 | Prioridad de las tareas (`alta`, `media`, `baja` o sin la clave, como en `js/planificador.js`). Ver el detalle debajo de la tabla. |
| 3b | e300543 | El editor de tareas deja elegir cualquier fecha (`moverTarea` conserva el resto de la tarea). |
| fix | 229ae12 | Orden de argumentos en `PlanView`; con él, el run 61 compila los cortes 1 a 3b y pasa las pruebas. |
| Viajes | cf34eb2 | Apartado nativo de Viajes (run 63 en verde). Ver el detalle debajo de la tabla. |
| Empleo | 11d70f9 | Apartado nativo de Empleo con la agenda laboral. Ver el detalle debajo de la tabla. |
| P1 visual | fbc5549 | Los círculos de marcar no se veían en asfalto. Ver el detalle debajo de la tabla. |
| fix | 911b369 | Faltaba la barra del keypath `\.locale` en el editor de tareas: el run 63 no compilaba. Lo había metido un script mío. |
| Objetivos | 64bbe2d | Apartado nativo de Objetivos. Ver el detalle debajo de la tabla. |
| Enlaces | 6adcb96 | Apartado nativo de Enlaces. Ver el detalle debajo de la tabla. |
| Envíos | c74fbfa | Apartado nativo de Envíos. Ver el detalle debajo de la tabla. |
| Documentos | 90f60f4 | Apartado nativo de Documentos, en lectura. Ver el detalle debajo de la tabla. |

**Corte 1, validadores de Apuntar:**
- Bloquea fechas que no existen («31 de febrero», «13/13», «el 32», «el 31» en un mes de 30 días) y rangos al revés.
- Bloquea «cada 0 días» y «el día 32 de cada mes».
- Bloquea los apuntes sin contenido: solo fecha, solo hora o solo importe.
- Bloquea «cancela / mueve / borra / cambia la…» y las preguntas.
- «1.500,50 €» se lee entero (antes salía 500,50).
- El motivo va en `r.error`: la vista lo enseña en rojo y `CrearApunte` se niega a crear.
- 36af1ab había tocado la web: se deshizo en a4bc0c0, así que la PWA está como en 4605e3e.

**Corte 2, clave de importación:**
- La clave es `cuenta|fecha|importe|concepto del banco` (`bankNote` o `note`), igual que `dedupeKey`, más `claveImport` y `claveImport2`.
- Se cuentan las veces, como la web: dos filas iguales son dos movimientos.
- Nueva operación `importarFila`. `importarMovimiento` se queda solo para lo que ya estaba en cola.
- Ya no se escriben `ioscsv_*` ni `conceptoBanco`. Este último, en la web, es un campo de los cargos recurrentes y no de los movimientos.

**Corte 3, prioridad:**
- Se ve delante del nombre y en su color, y VoiceOver la lee.
- Lo que no tiene hora va primero y por prioridad, igual que `PLANNER_PRIORIDAD_ORDEN`. «Pendientes sin día» también se ordena por prioridad.
- Se cambia en el editor y en el menú de la tarea.
- `parcharTarea` quita la clave si la tarea se queda sin prioridad.

**P1 visual, círculos de marcar en asfalto:**
- El aro usaba el color de la raya separadora: tinta al 8 %.
- Ahora usa el token `Paleta.aro`, como `.m-check` con `--border-strong` en la web, pero con más tinta (42 % en oscuro y 36 % en claro) para llegar a 3:1.
- Vale para plan, pendientes sin día, rutinas, inicio y despensa.

**Viajes:**
- Lista de próximos (y en curso) y completados.
- Crear, editar y eliminar viajes (`guardarViaje` / `borrarEntrada`).
- Ficha con destino, fechas y compañía; itinerario por día (añadir, editar, quitar); lugares (añadir, marcar visitado, quitar).
- Gastos del viaje: los movimientos de Finanzas marcados `viaje`, como `financeProGastosDelViaje`, más los apuntados a mano.
- Los cambios van por `cambiarViaje` / `CambioViaje`, sobre `entries`.

**Empleo:**
- Horario por día de la semana y si sale en el calendario principal.
- Citas `lab_` (reunión, turno, plazo u otro): crear, editar y eliminar; las pasadas, plegadas.
- El empleo actual en la cabecera.
- Operaciones `guardarCitaLaboral`, `borrarCitaLaboral`, `horarioLaboral` y `laboralEnPrincipal`, sobre `agendaLaboral`.

**Objetivos:**
- Lista por plazo con estado, progreso e hitos; crear, editar y eliminar.
- Hitos: añadir, marcar y quitar. Se reconocen por el texto, como la op `objetivo` del conector.
- Apuntar el progreso de los objetivos numéricos.
- Operaciones `guardarObjetivo` / `cambiarObjetivo`, sobre `entries`.

**Enlaces:**
- Por categorías y favoritos (5 como mucho).
- Buscar; crear (arriba, con https:// si falta), editar, duplicar, copiar la dirección y eliminar.
- Categorías con color; al borrar una, sus enlaces pasan a otra o se quedan sin categoría.
- Se abren en Safari. «pegar.» crea el enlace con lo copiado; la hoja de compartir del sistema necesita una extensión, que de momento no se usa (ver «Sideloadly»).
- Operaciones sobre `links` y `linkCategories`.

**Envíos:**
- Cinco pasos, llegada estimada o retraso, última nota y movimientos.
- `estadoPedido` lleva el estado de destino, así que reintentar no avanza dos veces.
- «actualizar.» llama a `seguimiento-pedidos` y trae la nube.
- Seguir el envío, ver el pedido, copiar el número; crear, editar y borrar.
- El historial no repite la misma línea si se reintenta la operación.

**Documentos (en lectura):**
- Fichas por caducidad, con aviso a 30 días o si ya ha caducado.
- Archivos del bucket `documents`, que se abren con Vista Rápida.
- Subir, renombrar y editar sigue en la web.

**Pruebas añadidas:**
- `pruebas/apuntar-p0.mjs`: 30 casos, sobre el mismo entorno que JavaScriptCore.
- Frases P0 en el banco de paridad `pruebas/apuntar-casos.json`.
- `pruebas/importar-ios-web.mjs`: comprueba con el importador real de la web que lo importado en el iPhone no se duplica.
- `testMismaClaveQueLaWebEnLosDosSentidos` y `testPrioridadComoEnLaWeb`.
- `ViajesTests`, `EmpleoTests`, `ObjetivosTests`, `EnlacesTests`, `EnviosTests` y `DocumentosTests`.
- Las dos pruebas de Node corren en el workflow `ios-nativa.yml`.

## Pendiente, por prioridad

**P0**
- **Bandeja de Claude/ChatGPT en iOS:** leer `conector_bandeja` y `registroConector`; aceptar, rechazar y deshacer; agrupar los avisos («Claude añadió 3 tareas»). Es el corte más grande que queda.
- **Concurrencia PWA/iPhone en `dayPlanner`:** prueba de guardados simultáneos sobre la misma clave. Después, valorar compare-and-swap o una RPC por operación.
- **Importar, filas pendientes:** la web importa los movimientos pendientes con `pendiente` y luego los completa; iOS los sigue omitiendo. Hay que portar esa lógica sin duplicar.

**P1**
- Mover una tarea a una fecha concreta también desde el menú de la fila. Hoy solo se puede desde el editor.
- Subtareas en el planificador.
- Finanzas:
  - edición de presupuestos;
  - CRUD de suscripciones con logos;
  - patrimonio por rangos;
  - navegación interna accesible (44 pt, selector que no se desborda).
- Apuntar, P1 del laboratorio:
  - prioridad dicha en la frase («… prioridad alta»);
  - negaciones y condiciones;
  - faltas de dictado;
  - varios importes en una frase;
  - asignatura que no existe (que avise en vez de crear un evento).
- Rutinas, Notas, Estudios y Proyectos hasta tener el contrato completo; Enlaces nativo.

**Lo que falta de los apartados nuevos (sigue en la web)**
- Objetivos: método Harada, kaizen y el kanban arrastrable.
- Enlaces: vista en rejilla y guardar desde la hoja de compartir (necesita extensión).
- Documentos: subir, renombrar y borrar archivos; crear y editar fichas.

**Lo que falta de Viajes y Empleo (sigue en la web)**
- Viajes:
  - reservas (transportes y alojamientos), listas, documentos y mapa;
  - la pestaña Destino (tiempo y moneda);
  - marcar en Finanzas qué gastos son del viaje.
- Empleo:
  - fichas de empleo, vida laboral, CV e importar el horario con IA (la vista nativa enlaza a la web).

**Visual**
- Barra, iconos (catálogo común en `Iconos.swift`) y carrusel semanal con encaje físico.
- Glass: tema opcional tras un interruptor, apagado por defecto. Antes hay que corregir dos fallos del prototipo: en Finanzas marca «calendario.» como pestaña activa, y un logo de suscripción sale como un cuadro vacío. Tampoco puede llevar velos con desenfoque en filas ni iconos.

**Web (en espera)**
- Llevar los validadores de Apuntar a `js/apuntar.js`. Están en `apuntar-puente.js` y se pueden copiar tal cual. Después, quitarlos del puente para no validar dos veces.

**Comprobación pendiente**
- Los apartados Objetivos, Enlaces, Envíos y Documentos se subieron juntos (90f60f4) y se comprueban en una sola compilación. Me quedé sin consultas a la API pública de GitHub y no podía seguir cada compilación por separado.

## Requisitos (15-CORRECCION-Y-TRAZABILIDAD-DE-REQUISITOS.md)

He leído la corrección vinculante del 10-11. Cómo queda cada requisito al cerrar este ciclo:

| Requisito | Estado | Dónde, o qué falta |
|---|---|---|
| Viajes, terminado antes de Asfalto | hecho | cf34eb2; reservas, listas, documentos, mapa y Destino siguen en la web |
| Círculos de Asfalto en Inicio/Hoy y Plan | parcial | fbc5549: un solo token (`Paleta.aro`) y 3:1. Faltan capturas en el iPhone real |
| Círculos en Rutinas y Pendientes sin día | parcial | Usan la misma `FilaAgenda` y el mismo token. Faltan capturas |
| Estados distinguibles por forma o trazo | parcial | Pendiente: aro vacío. Completada: relleno y check. Prioridad: texto («alta.»), no solo color. Faltan seleccionada y deshabilitada |
| Asfalto claro/oscuro, contraste aumentado, Dynamic Type, Reduce Motion | parcial | Con contraste aumentado el aro usa la tinta secundaria; el sello respeta Reduce Motion. Sin comprobar en el dispositivo |
| Cambiar de tema no altera prioridad ni estado | hecho | El color solo se calcula al pintar; los datos no se tocan |
| Prioridad alta/media/baja | hecho | da20162 |
| Mover a mañana, pasado o fecha | hecho | e300543 (editor) y el menú de la fila; desde el menú falta una fecha concreta |
| Apuntar: validadores P0 | hecho (solo iOS) | a4bc0c0; pendiente llevarlos a la web |
| Apuntar: barra reactiva sin parrilla de iconos | pendiente | Contrastar antes con la PWA real |
| Clave de importación PWA/iOS | hecho | 2797972 |
| Iconos de apartados y barra | pendiente | Fase visual |
| Modal de los cinco más usados desde Menú (tercera referencia de Pinterest) | pendiente | Fase visual; ver la referencia antes de diseñar |
| Enlaces con navegador dentro de la app | parcial | 6adcb96 abre en Safari; falta `SFSafariViewController` |
| Avisos de cambios de Claude/ChatGPT | pendiente | P0: bandeja |
| Paridad por apartado como pruebas ejecutables | parcial | Hay pruebas por apartado nuevo; falta el resto |
| Objetivos, Enlaces, Envíos y Documentos | hecho | 64bbe2d, 6adcb96, c74fbfa y 90f60f4, comprobados en una sola compilación |

## Sideloadly

Alejandro instala con **Sideloadly**, no con SideStore.
- Con cuenta gratuita, la firma dura 7 días.
- Se renueva desde el ordenador o con Sideloadly Daemon. Si el código no cambia, la misma IPA se vuelve a firmar.
- Se instala encima con el mismo Apple ID y el mismo bundle ID; no hay que borrar la app antes.

¿Sigue haciendo falta la regla de «sin extensiones ni App Group»? Mi conclusión, sin cambiarla en este ciclo:
- Sideloadly firma extensiones, así que la causa original (SideStore no las instalaba) ya no vale.
- Con cuenta gratuita, cada extensión gasta un App ID de los 10 por semana.
- App Group necesita una capacidad que un equipo personal quizá no conceda.
- Antes de quitar la regla, hay que probar una IPA de ensayo con un widget mínimo y un App Group, instalada con Sideloadly en el iPhone de Alejandro.

## Qué debe auditar GPT

1. `apuntar-puente.js` (`__validar`, `__sinMiles`), buscando falsos positivos con frases reales:
   - «el 30» en un mes de 31 días;
   - rangos que cruzan de mes o de año;
   - «cambia el aceite» y «quita el polvo», que deben seguir siendo tareas.
2. `importarFila` en `Operaciones.swift` y `ClaveImportacion`. Puntos a revisar:
   - que el importe salga como lo escribe JavaScript (`12.5`, `1250`, `0.1`);
   - el concepto con espacios o comillas;
   - un traspaso con `transferTo`;
   - un extracto que se solapa con otro ya importado.
3. Prioridad: orden estable y conservación de los campos que iOS no conoce (`linkedAssignmentId`, `proyectoTareaId`, otros).
4. Viajes y Empleo frente a la web. Puntos a revisar:
   - que `guardarViaje` no pise reservas ni listas;
   - que el itinerario sin día salga al final;
   - que una cita de tipo turno se pueda guardar sin título;
   - que `horarioLaboral` sustituya el horario entero, como `guardarHorarioLaboral`.
5. Enlaces: que `guardarEnlace` no acepte direcciones que no sean web. Envíos: que el historial no se duplique al reintentar. Documentos: la descarga autenticada de un archivo con espacios o tildes en el nombre.
6. La IPA del run final: estructura, ausencia de firma y hashes, igual que `14-AUDITORIA-IPA-RUN57.md`.

## OpenCode

El 10-11, `opencode run` falla en este PC con «Database is not empty and has no session table». Falla tanto con el supervisor como directamente, así que no se pudo delegar nada. El encargo preparado es `trabajo-opencode/cola/OC-004-clave-importacion.md` (de solo lectura). La investigación la hizo Claude.

Antes de volver a delegar hay que revisar la base de datos de OpenCode del usuario: tiene una sesión rota.

## Probar en el iPhone

- **Asfalto:** los círculos de marcar se ven en plan, pendientes sin día, rutinas e inicio.
- **Objetivos:** crear uno numérico, apuntar el progreso y comprobar que la barra avanza; añadir un hito y marcarlo.
- **Enlaces:** copiar una dirección en Safari, pulsar «pegar.» y guardarlo; marcar 5 favoritos e intentar un sexto.
- **Envíos:** crear un pedido con número de seguimiento, pulsar «→ enviado.» y luego «actualizar.».
- **Documentos:** abrir un archivo con Vista Rápida y comprobar el aviso de una ficha que caduca pronto.

- **Viajes** (desde «más.»):
  - crear un viaje con fechas;
  - añadir dos cosas al itinerario el mismo día a horas distintas: salen ordenadas;
  - añadir un lugar y marcarlo como visitado;
  - comprobar que el viaje se ve igual en la web.
- **Empleo:**
  - poner el horario;
  - crear una cita de tipo turno sin título;
  - apagar «en el calendario principal.» y comprobar que la cita deja de salir en el calendario.

- **Apuntar.** Al escribir estas frases tiene que salir el aviso en rojo y no guardarse nada:
  - «dentista el 31 de febrero»
  - «cancela la cita del dentista»
  - «12 €»
  - «regar cada 0 días»

  En cambio, «gasté 1.500,50 € en el sofá» se guarda como 1.500,50 €.
- **Plan.** Mantener pulsada una tarea, elegir «prioridad.» y luego «alta.»: sale «alta.» en rojo delante y la tarea sube entre las que no tienen hora. Abrirla y cambiar la «fecha.» a otro día: desaparece de hoy y aparece ese día.
- **Finanzas.**
  1. Importar el mismo CSV dos veces en el iPhone: la segunda no añade nada.
  2. Importar en el iPhone un extracto que ya se había importado en la web: no añade nada.
