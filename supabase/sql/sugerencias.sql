-- Tabla de sugerencias de usuarios para Bitácora.
-- Ejecutar una sola vez en el SQL Editor de Supabase.
--
-- Los usuarios pueden crear y ver sus propias sugerencias (RLS). Para leer
-- TODAS las de todo el mundo, entra en el Table Editor de tu proyecto
-- Supabase → tabla "sugerencias": el panel del dueño del proyecto ve todas
-- las filas sin que RLS se lo impida, no hace falta ninguna política extra.

create table if not exists sugerencias (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    texto text not null,
    creado_en timestamptz not null default now()
);

alter table sugerencias enable row level security;

drop policy if exists "usuarios crean sus sugerencias" on sugerencias;
create policy "usuarios crean sus sugerencias"
    on sugerencias for insert
    with check (auth.uid() = user_id);

drop policy if exists "usuarios ven sus propias sugerencias" on sugerencias;
create policy "usuarios ven sus propias sugerencias"
    on sugerencias for select
    using (auth.uid() = user_id);
