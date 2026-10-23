-- Correo de los domingos (Edge Function correo-semanal, 23-10-2026). Opcional: cada cuenta lo enciende en
-- Ajustes → conexiones → «correo de los domingos.». Lleva lo que viene la semana siguiente y cómo fue la que
-- acaba, con un enlace para darse de baja en cada correo.
-- Antes de ejecutar: sustituye <AVISOS_SECRET> por el valor del secreto AVISOS_SECRET de las Edge Functions
-- (el mismo que usa avisos_diarios.sql; no se guarda en el repositorio).

create table if not exists public.correo_semanal (
    user_id uuid primary key references auth.users(id) on delete cascade,
    activo boolean not null default false,
    cambiado timestamptz not null default now()
);
alter table public.correo_semanal enable row level security;
drop policy if exists "cada uno ve su correo semanal" on public.correo_semanal;
create policy "cada uno ve su correo semanal" on public.correo_semanal for select to authenticated using (user_id = auth.uid());

create or replace function public.poner_correo_semanal(p_activo boolean)
returns boolean language sql security definer set search_path = public as $$
    insert into correo_semanal (user_id, activo, cambiado) values (auth.uid(), p_activo, now())
    on conflict (user_id) do update set activo = excluded.activo, cambiado = now()
    returning activo;
$$;
revoke all on function public.poner_correo_semanal(boolean) from public, anon;
grant execute on function public.poner_correo_semanal(boolean) to authenticated;

-- Los domingos, cada hora; la función solo envía a las 18:00 de Madrid y una vez por persona y domingo.
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.unschedule('correo-semanal') where exists (select 1 from cron.job where jobname = 'correo-semanal');
select cron.schedule(
    'correo-semanal',
    '2 * * * 0',
    $$
    select net.http_post(
        url := 'https://avdqtnukgbejorieuunj.supabase.co/functions/v1/correo-semanal',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', '<AVISOS_SECRET>'),
        body := '{}'::jsonb
    );
    $$
);
