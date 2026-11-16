# Auditoría de servidor, 16-11-2026

Hallazgos de servidor (`supabase/`) de las dos auditorías de ChatGPT sobre la IPA 0.21.0
(`AUDITORIA-BUGS-0.21.md` y `SEGUNDA-AUDITORIA-EXHAUSTIVA.md`), comprobados contra el código y
arreglados el 16-11. Lo de `ios/` lo lleva otra sesión.

## Estado

| # | Origen | Hallazgo | Comprobado en el código | Estado |
|---|--------|----------|-------------------------|--------|
| 1 | 2.ª, n.º 2 | `eliminar-cuenta` seguía adelante si Stripe no cancelaba la suscripción | Sí (`catch` que solo registraba) | **Arreglado y desplegado.** Stripe va primero; si falla (o no se puede leer la suscripción, o falta la clave) se responde 502 sin haber tocado nada. Cancela todas las suscripciones vivas del cliente, no solo la apuntada en la fila |
| 2 | 2.ª, n.º 2 | Storage: solo listaba 1.000 objetos y no paginaba; errores ignorados | Sí | **Arreglado.** Lista paginada y recursiva, borrado en tandas de 1.000, cada `{ error }` comprobado y, antes de borrar Auth, se vuelve a listar para confirmar que no queda nada |
| 3 | 2.ª, n.º 2 | Errores ignorados en grupos, `bitacora` y `bitacora_secrets` | Sí | **Arreglado.** Todo `{ data, error }` se comprueba; cualquier fallo para antes de Auth |
| 4 | 2.ª, n.º 2 | Datos sin borrar: solo se borraban `bitacora` y `bitacora_secrets` | Sí. Sin `on delete cascade`: `amistades`, `solicitudes_amistad`, `perfiles_publicos`, `codigos_amigo`, `bitacora_secrets`, y los enlaces compartidos del bucket `compartidos` | **Arreglado.** 31 pares tabla/columna (inventario de `supabase/sql/` y de las consultas de `js/`, comprobado contra producción el 16-11), más los enlaces compartidos del bucket `compartidos` cuyo `meta.json` es suyo. `bitacora` va la última para que un reintento aún vea sus enlaces |
| 5 | 2.ª, n.º 2 | Auth se podía borrar aunque quedaran datos o una suscripción | Sí | **Arreglado.** Auth es el último paso y solo si todo lo anterior salió bien |
| 6 | 2.ª, n.º 2 | Proceso con estado, cola de reintentos y alertas | — | **En parte.** Cada paso se puede repetir y un fallo deja la cuenta viva con un mensaje claro para volver a intentarlo. No hay tabla de estado ni cola automática: para un proyecto de este tamaño, el reintento del usuario y el registro de la función bastan por ahora |
| 7 | 2.ª, n.º 3 | `calendario-feed` entregaba el calendario si `tiene_acceso` fallaba o daba `null` | Sí (`acceso === false ? vacío : todo`) | **Arreglado y desplegado.** Solo se entregan datos si la RPC responde sin error y exactamente `true`. Error, `null`, valor raro o más de 8 s sin respuesta → 503 con `Retry-After`. `false` → calendario vacío (a propósito, para que la suscripción siga si vuelve a pagar). Si no se pueden leer los datos, 503 |
| 8 | Encargo | Firma HMAC del calendario | Comparación con `!==` | **Arreglado.** Comparación en tiempo constante, formato de `k` validado (32 caracteres base64url) y `calendarioFeedVersion` saneado. El POST ya no da un enlace de la versión 0 si falla la lectura de datos (daba uno que podía estar anulado). Sin caducidad por tiempo, a propósito: los programas de calendario lo leen durante años; se anula pidiendo un enlace nuevo (sube la versión) |
| 9 | 2.ª, n.º 4 | Fechas y horas imposibles en el calendario (`2026-99-99` tiraba el feed, `2026-02-31` salía en marzo, `99:99` pasaba, finales antes del inicio) | Sí | **Arreglado.** Validación real de fecha y hora, final anterior al inicio → una hora más (sin pasar de las 23:59), viaje con vuelta anterior a la ida → un día, y cada elemento en su `try`: uno roto se salta sin tirar el resto. El `id` se limpia para que no pueda meter líneas en el .ics |
| 10 | Revisión propia | `correo-semanal`: la baja por enlace aceptaba una firma hecha con secreto vacío si faltaba `CORREO_SECRET` | Sí | **Arreglado y desplegado.** Sin secreto no se acepta ninguna baja por enlace; comparación en tiempo constante |
| 11 | Revisión propia | Errores internos de Postgres devueltos al cliente | `bitacora-mcp` (al encolar) y `seguimiento-pedidos` (al guardar) | **Arreglado y desplegado.** Mensaje genérico al usuario y el detalle solo en el registro |
| 12 | Revisión propia | Otras funciones que usan `tiene_acceso` (`avisos-diarios`, `bitacora-mcp`, `correo-semanal`, `entrada`, `seguimiento-pedidos`) | Usan `if (!acceso)`: error o `null` cuentan como sin acceso | **Correcto, sin cambios** (fallan cerrado) |
| 13 | Revisión propia | `x-internal-secret` comparado con `!==` en `send-push`, `avisos-diarios`, `correo-semanal`, `crear-pago`, `portal-pago`, `seguimiento-pedidos` | Sí | **Pendiente, baja.** Secreto largo y aleatorio entre funciones; medir el tiempo de una comparación de cadenas por la red no es práctico. Se puede cambiar cuando se toque cada función |
| 14 | 1.ª, P2 | El cliente acepta cualquier URL del portal de pagos o del calendario | Es de iOS (`ServidorAjustes.swift`) | **Fuera de esta parte.** El servidor solo devuelve URLs de Stripe y de `calendario-feed` |
| 15 | 1.ª, P2 | El sello «actualizado en nube» queda atrasado: la RPC no devuelve `updated_at` | Es de la RPC de guardado y de `SyncEngine.swift` | **Pendiente.** Hace falta cambiar a la vez el SQL y la app nativa; no aplicado para no desacompasarlos con la sesión de iOS |
| 16 | Ambas | Estado real de RLS y funciones en producción | — | **Sin comprobar a fondo.** Sí se comprobó que existen todas las tablas y columnas que borra `eliminar-cuenta` (consulta de 0 filas con la clave pública) |

Límites conocidos de `eliminar-cuenta`:
- Los enlaces compartidos se encuentran por la lista de la cuenta (`servicios.compartidos`, las 60 últimas); uno más
  antiguo que ya no esté en la lista se queda en el bucket hasta que alguien lo borre.
- El cliente de Stripe (nombre, correo, facturas) no se borra: las facturas se conservan por obligación fiscal.
- `grupos_gastos_miembros` y `gastos_compartidos` se quedan con `user_id` a `null`: son las cuentas comunes de sus
  amigos (decisión de antes, se mantiene).

## Pruebas

Con Deno (no está instalado; vale con `npx`):

```
npx -y deno@2.5.6 test supabase/functions/calendario-feed/ics_test.ts supabase/functions/eliminar-cuenta/borrado_test.ts
```

30 pruebas, todas en verde el 16-11: acceso `true`, `false`, error, `null`, `undefined`, valor raro y red caída;
firmas malas, de otra versión y de otro usuario; fechas y horas imposibles; y un fallo inyectado en cada paso del
borrado (Stripe, leer la suscripción, listar y quitar documentos, leer datos, quitar compartidos, grupos, tablas y
Auth), más la paginación con 2.600 documentos y el reintento.

## SQL

No hay SQL que ejecutar. Para comprobar a mano que una cuenta borrada no ha dejado nada, en el editor de Supabase:

```sql
-- Sustituir el uuid por el de la cuenta borrada.
with u as (select '00000000-0000-0000-0000-000000000000'::uuid as id)
select 'bitacora' t, count(*) from bitacora, u where user_id = u.id
union all select 'bitacora_secrets', count(*) from bitacora_secrets, u where user_id = u.id
union all select 'bitacora_snapshots', count(*) from bitacora_snapshots, u where user_id = u.id
union all select 'amistades', count(*) from amistades, u where user_id = u.id or friend_id = u.id
union all select 'solicitudes_amistad', count(*) from solicitudes_amistad, u where remitente_id = u.id or destinatario_id = u.id
union all select 'perfiles_publicos', count(*) from perfiles_publicos, u where user_id = u.id
union all select 'perfiles_fotos', count(*) from perfiles_fotos, u where user_id = u.id
union all select 'codigos_amigo', count(*) from codigos_amigo, u where user_id = u.id
union all select 'conector_tokens', count(*) from conector_tokens, u where user_id = u.id
union all select 'conector_bandeja', count(*) from conector_bandeja, u where user_id = u.id
union all select 'push_subscriptions', count(*) from push_subscriptions, u where user_id = u.id
union all select 'actividad', count(*) from actividad, u where user_id = u.id
union all select 'correo_semanal', count(*) from correo_semanal, u where user_id = u.id
union all select 'suscripciones', count(*) from suscripciones, u where user_id = u.id
union all select 'storage', count(*) from storage.objects, u where bucket_id = 'documents' and name like u.id::text || '/%'
union all select 'auth', count(*) from auth.users, u where id = u.id;
```

Todo debe dar 0.
