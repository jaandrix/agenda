-- Viajes compartidos entre amigos de Bitácora. Ejecutar en el SQL
-- Editor de Supabase.
--
-- Mismo patrón que listas_ocio_compartidas y recomendaciones: se manda
-- una foto fija del viaje (columna "viaje", jsonb con title/destino/
-- fechas/lugares/itinerario/listas), no una referencia en vivo. El
-- destinatario decide si lo añade a sus propios viajes o lo descarta;
-- en ambos casos la fila se borra después.

create table if not exists viajes_compartidos (
    id uuid primary key default gen_random_uuid(),
    remitente_id uuid not null references auth.users(id) on delete cascade,
    destinatario_id uuid not null references auth.users(id) on delete cascade,
    viaje jsonb not null,
    nota text,
    creado_en timestamptz not null default now()
);

alter table viajes_compartidos enable row level security;

drop policy if exists "remitente crea el viaje compartido" on viajes_compartidos;
create policy "remitente crea el viaje compartido"
    on viajes_compartidos for insert
    with check (auth.uid() = remitente_id);

drop policy if exists "destinatario ve sus viajes compartidos" on viajes_compartidos;
create policy "destinatario ve sus viajes compartidos"
    on viajes_compartidos for select
    using (auth.uid() = destinatario_id);

drop policy if exists "remitente o destinatario borran el viaje compartido" on viajes_compartidos;
create policy "remitente o destinatario borran el viaje compartido"
    on viajes_compartidos for delete
    using (auth.uid() = remitente_id or auth.uid() = destinatario_id);
