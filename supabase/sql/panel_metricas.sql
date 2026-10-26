-- Métricas de uso para el pulso del proyecto (pestaña «resumen.»). Solo cifras agregadas: ni correos, ni nombres,
-- ni contenido. Como los votos, pide la clave del panel (panel_clave_ok, ver panel_sugerencias.sql), así que nadie
-- sin ella puede leerlas aunque la página del panel sea pública. Ejecutar una vez en el SQL Editor.

create or replace function public.panel_metricas(p_clave text)
returns jsonb language plpgsql volatile security definer set search_path = public, auth as $$
declare r jsonb;
begin
    if not panel_clave_ok(p_clave) then return null; end if;
    select jsonb_build_object(
        'generado', now(),
        'usuarios', (select count(*) from auth.users),
        'altas_7', (select count(*) from auth.users where created_at > now() - interval '7 days'),
        'altas_30', (select count(*) from auth.users where created_at > now() - interval '30 days'),
        'altas_semana', (select coalesce(jsonb_agg(jsonb_build_object('semana', s, 'n', n) order by s), '[]') from (
            select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') s, count(*) n from auth.users
            where created_at > now() - interval '12 weeks' group by 1) x),
        'confirmados', (select count(*) from auth.users where email_confirmed_at is not null),
        'activos_hoy', (select count(*) from actividad where ultima_vez > date_trunc('day', now())),
        'activos_7', (select count(*) from actividad where ultima_vez > now() - interval '7 days'),
        'activos_30', (select count(*) from actividad where ultima_vez > now() - interval '30 days'),
        -- De quien se dio de alta hace entre 7 y 30 días, cuántos han vuelto en la última semana (aproxima la retención).
        'cohorte_7_30', (select count(*) from auth.users where created_at between now() - interval '30 days' and now() - interval '7 days'),
        'cohorte_7_30_activos', (select count(*) from auth.users u join actividad a on a.user_id = u.id
            where u.created_at between now() - interval '30 days' and now() - interval '7 days' and a.ultima_vez > now() - interval '7 days'),
        'suscripciones', (select coalesce(jsonb_object_agg(estado, n), '{}') from (select estado, count(*) n from suscripciones group by 1) x),
        'planes', (select coalesce(jsonb_object_agg(coalesce(plan, 'sin plan'), n), '{}') from (select plan, count(*) n from suscripciones where estado in ('active', 'trialing', 'past_due') group by 1) x),
        'cancelan', (select count(*) from suscripciones where cancela_al_final_periodo),
        'fundadores', (select count(*) from suscripciones where socio_numero is not null),
        'perfiles', (select coalesce(jsonb_object_agg(p, n), '{}') from (select coalesce(data->'apartadosConfig'->>'perfil', 'sin elegir') p, count(*) n from bitacora group by 1) x),
        'opcionales', (select coalesce(jsonb_object_agg(k, n), '{}') from (select k, count(*) n from bitacora, jsonb_each_text(coalesce(data->'apartadosConfig'->'opcionales', '{}')) as e(k, v) where v = 'true' group by 1) x),
        'con_avisos', (select count(distinct user_id) from push_subscriptions),
        'con_conector', (select count(distinct user_id) from conector_tokens where nombre not in ('siri', 'correo')),
        'correo_domingos', (select count(*) from correo_semanal where activo),
        -- Tamaño de los datos de cada cuenta (KB), para saber si hace falta guardar aparte lo antiguo.
        'datos_kb', (select jsonb_build_object('media', round(avg(pg_column_size(data)) / 1024.0), 'p90', round((percentile_cont(0.9) within group (order by pg_column_size(data)) / 1024.0)::numeric), 'maxima', round(max(pg_column_size(data)) / 1024.0), 'maxima_sin_comprimir', round(max(octet_length(data::text)) / 1024.0)) from bitacora)
    ) into r;
    return r;
end $$;

revoke all on function public.panel_metricas(text) from public;
grant execute on function public.panel_metricas(text) to anon, authenticated;
