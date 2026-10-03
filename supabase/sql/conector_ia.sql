-- Conector de Bitácora para Claude / ChatGPT (Edge Function bitacora-mcp).
--
-- conector_tokens: enlaces personales. El cliente genera un token
-- aleatorio, guarda aquí solo su SHA-256 y enseña la URL una única vez;
-- la función busca el usuario por ese hash. Revocar = borrar la fila.
--
-- conector_bandeja: lo que Claude o ChatGPT piden apuntar (eventos,
-- tareas, movimientos, notas). No se escribe directamente en
-- bitacora.data porque la app abierta guarda su estado en memoria y
-- pisaría el cambio; la app lee esta bandeja al abrirse o al volver a la
-- pestaña, lo incorpora a sus datos con su propia lógica y borra las
-- filas. Solo la función (service role) inserta.

create table if not exists conector_tokens (
    token_hash text primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    nombre text not null default 'conector',
    creado timestamptz not null default now(),
    ultimo_uso timestamptz
);

alter table conector_tokens enable row level security;

drop policy if exists "usuarios ven sus enlaces" on conector_tokens;
create policy "usuarios ven sus enlaces"
    on conector_tokens for select
    using (auth.uid() = user_id);

drop policy if exists "usuarios crean sus enlaces" on conector_tokens;
create policy "usuarios crean sus enlaces"
    on conector_tokens for insert
    with check (auth.uid() = user_id);

drop policy if exists "usuarios revocan sus enlaces" on conector_tokens;
create policy "usuarios revocan sus enlaces"
    on conector_tokens for delete
    using (auth.uid() = user_id);

create table if not exists conector_bandeja (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    op jsonb not null,
    creado timestamptz not null default now()
);

create index if not exists conector_bandeja_user_idx on conector_bandeja (user_id, creado);

alter table conector_bandeja enable row level security;

drop policy if exists "usuarios leen su bandeja" on conector_bandeja;
create policy "usuarios leen su bandeja"
    on conector_bandeja for select
    using (auth.uid() = user_id);

drop policy if exists "usuarios vacían su bandeja" on conector_bandeja;
create policy "usuarios vacían su bandeja"
    on conector_bandeja for delete
    using (auth.uid() = user_id);
