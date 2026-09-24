-- Tabla principal de datos de Bitácora (entries, categorías, notas,
-- Finanzas PRO, estudios... todo el JSON de cada usuario).
-- Ejecutar en el SQL Editor de Supabase — es la tabla más sensible de
-- toda la app (contiene absolutamente todos los datos personales y
-- financieros), y no tenía este archivo versionado en el repo. Si ya
-- existe con RLS activado, este script es idempotente (no rompe nada,
-- solo confirma/recrea la política con el mismo nombre).
--
-- El guardado normal pasa por la función merge_bitacora_data() (RPC,
-- SECURITY DEFINER, se salta RLS por diseño); el upsert directo desde
-- el cliente (sb.from('bitacora').upsert(...)) es solo el camino de
-- reserva si esa función falla, así que además de la función también
-- hace falta una política de INSERT/UPDATE para el propio usuario.

create table if not exists bitacora (
    user_id uuid primary key references auth.users(id) on delete cascade,
    data jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

alter table bitacora enable row level security;

drop policy if exists "usuarios ven sus propios datos" on bitacora;
create policy "usuarios ven sus propios datos"
    on bitacora for select
    using (auth.uid() = user_id);

drop policy if exists "usuarios crean su propia fila" on bitacora;
create policy "usuarios crean su propia fila"
    on bitacora for insert
    with check (auth.uid() = user_id);

drop policy if exists "usuarios actualizan sus propios datos" on bitacora;
create policy "usuarios actualizan sus propios datos"
    on bitacora for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- Sin política de DELETE a propósito: nada en el cliente borra esta
-- fila directamente (solo se sustituye su contenido). Si algún día
-- hace falta borrar la cuenta, hazlo con la service role key, no
-- abriendo DELETE a los propios usuarios.
