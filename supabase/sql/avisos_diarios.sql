-- Avisos automáticos (Edge Function avisos-diarios).
--
-- avisos_enviados: qué aviso se mandó ya a quién, para no repetirlo
-- (la clave lleva el día, el mes o el umbral según el tipo). Solo la usa
-- la función con la service role: RLS activado y sin políticas.
--
-- La tarea de pg_cron llama a la función cada 5 minutos: así los eventos
-- avisan una hora antes con poco margen, y el resumen del día sale una vez
-- a las 9:00 de Madrid (sin tocar nada con el cambio de horario). Sustituye <AVISOS_SECRET> por el valor del secreto
-- AVISOS_SECRET de las Edge Functions antes de ejecutar este archivo (no se
-- guarda en el repositorio).

create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists avisos_enviados (
    user_id uuid not null references auth.users(id) on delete cascade,
    clave text not null,
    enviado timestamptz not null default now(),
    primary key (user_id, clave)
);

alter table avisos_enviados enable row level security;

select cron.unschedule('avisos-diarios') where exists (select 1 from cron.job where jobname = 'avisos-diarios');
select cron.schedule(
    'avisos-diarios',
    '*/5 * * * *',
    $$
    select net.http_post(
        url := 'https://avdqtnukgbejorieuunj.supabase.co/functions/v1/avisos-diarios',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', '<AVISOS_SECRET>'),
        body := '{}'::jsonb
    );
    $$
);
