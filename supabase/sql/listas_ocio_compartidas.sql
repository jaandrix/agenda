-- Tabla de listas de Ocio compartidas entre amigos para Bitácora.
-- Ejecutar una sola vez en el SQL Editor de Supabase.
--
-- Mismo patrón que viajes_compartidos y recomendaciones: se manda una foto
-- fija de la lista (columna "lista", jsonb con {name, items:[{title,type,rating}]}),
-- no una referencia en vivo. El destinatario decide si la añade a las suyas
-- (se copia como entradas y lista nuevas) o la descarta; en ambos casos la
-- fila se borra después.

create table if not exists listas_ocio_compartidas (
    id uuid primary key default gen_random_uuid(),
    remitente_id uuid not null references auth.users(id) on delete cascade,
    destinatario_id uuid not null references auth.users(id) on delete cascade,
    lista jsonb not null,
    nota text,
    creado_en timestamptz not null default now()
);

alter table listas_ocio_compartidas enable row level security;

drop policy if exists "remitente crea la lista compartida" on listas_ocio_compartidas;
create policy "remitente crea la lista compartida"
    on listas_ocio_compartidas for insert
    with check (auth.uid() = remitente_id);

drop policy if exists "destinatario ve sus listas compartidas" on listas_ocio_compartidas;
create policy "destinatario ve sus listas compartidas"
    on listas_ocio_compartidas for select
    using (auth.uid() = destinatario_id);

drop policy if exists "remitente o destinatario borran la lista compartida" on listas_ocio_compartidas;
create policy "remitente o destinatario borran la lista compartida"
    on listas_ocio_compartidas for delete
    using (auth.uid() = remitente_id or auth.uid() = destinatario_id);
