-- Recomendaciones de cultura (libros/películas/series/juegos) entre
-- amigos de Bitácora. Ejecutar en el SQL Editor de Supabase.
--
-- Mismo patrón que listas_ocio_compartidas y viajes_compartidos: se
-- manda una foto fija de la entrada (columna "entrada", jsonb), no una
-- referencia en vivo. El destinatario decide si la añade a su
-- biblioteca o la descarta; en ambos casos la fila se borra después.

create table if not exists recomendaciones (
    id uuid primary key default gen_random_uuid(),
    remitente_id uuid not null references auth.users(id) on delete cascade,
    destinatario_id uuid not null references auth.users(id) on delete cascade,
    tipo text not null,
    entrada jsonb not null,
    nota text,
    creado_en timestamptz not null default now()
);

alter table recomendaciones enable row level security;

drop policy if exists "remitente crea la recomendacion" on recomendaciones;
create policy "remitente crea la recomendacion"
    on recomendaciones for insert
    with check (auth.uid() = remitente_id);

drop policy if exists "destinatario ve sus recomendaciones" on recomendaciones;
create policy "destinatario ve sus recomendaciones"
    on recomendaciones for select
    using (auth.uid() = destinatario_id);

drop policy if exists "remitente o destinatario borran la recomendacion" on recomendaciones;
create policy "remitente o destinatario borran la recomendacion"
    on recomendaciones for delete
    using (auth.uid() = remitente_id or auth.uid() = destinatario_id);
