-- Seguimiento automático de pedidos (Edge Function seguimiento-pedidos).
--
-- bitacora_actualizar_pedidos: sustituye solo la clave "pedidos" de los datos
-- de un usuario, sin tocar el resto (la función lee, consulta InPost y
-- escribe; así no pisa nada que la app haya guardado entretanto en otros
-- apartados). Solo la puede ejecutar la service role.
--
-- La tarea de pg_cron consulta InPost cada 2 horas. Sustituye
-- <AVISOS_SECRET> por el valor del secreto AVISOS_SECRET de las Edge
-- Functions antes de ejecutar este archivo (no se guarda en el repositorio).

create or replace function public.bitacora_actualizar_pedidos(p_user uuid, p_pedidos jsonb)
returns void
language sql
security definer
set search_path = public
as $$
    update public.bitacora
    set data = jsonb_set(coalesce(data, '{}'::jsonb), '{pedidos}', p_pedidos, true),
        updated_at = now()
    where user_id = p_user;
$$;

revoke all on function public.bitacora_actualizar_pedidos(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.bitacora_actualizar_pedidos(uuid, jsonb) to service_role;

select cron.unschedule('seguimiento-pedidos') where exists (select 1 from cron.job where jobname = 'seguimiento-pedidos');
select cron.schedule(
    'seguimiento-pedidos',
    '17 */2 * * *',
    $$
    select net.http_post(
        url := 'https://avdqtnukgbejorieuunj.supabase.co/functions/v1/seguimiento-pedidos',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', '<AVISOS_SECRET>'),
        body := '{}'::jsonb
    );
    $$
);
