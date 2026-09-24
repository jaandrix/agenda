-- Snapshots semanales de seguridad de la tabla "bitacora" (hasta 12,
-- uno por semana) — independientes de los backups manuales/diarios
-- que van a Storage. Ejecutar en el SQL Editor de Supabase.
--
-- El cliente inserta, lee y borra únicamente sus propias filas
-- (saveData(), ver app.js) — nunca las de otro usuario.

create table if not exists bitacora_snapshots (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    week_key text not null,
    data jsonb not null,
    created_at timestamptz not null default now()
);

create index if not exists bitacora_snapshots_user_id_idx on bitacora_snapshots(user_id);

alter table bitacora_snapshots enable row level security;

drop policy if exists "usuarios gestionan sus propios snapshots" on bitacora_snapshots;
create policy "usuarios gestionan sus propios snapshots"
    on bitacora_snapshots for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
