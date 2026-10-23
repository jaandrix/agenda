-- Cuándo abrió cada cuenta la app por última vez (23-10-2026). Lo usa avisos-diarios para el aviso suave a
-- quien lleva 4 días o más sin entrar (como mucho uno por semana). La app llama a marcar_actividad() una vez al
-- día por dispositivo. Solo se guarda la fecha, nada más. Ejecutar en el SQL Editor de Supabase.

create table if not exists public.actividad (
    user_id uuid primary key references auth.users(id) on delete cascade,
    ultima_vez timestamptz not null default now()
);
alter table public.actividad enable row level security;
-- Sin políticas: nadie la lee ni la escribe directamente; la app usa la función y avisos-diarios, la clave de servicio.

create or replace function public.marcar_actividad()
returns void language sql security definer set search_path = public as $$
    insert into actividad (user_id, ultima_vez) values (auth.uid(), now())
    on conflict (user_id) do update set ultima_vez = now();
$$;
revoke all on function public.marcar_actividad() from public, anon;
grant execute on function public.marcar_actividad() to authenticated;
