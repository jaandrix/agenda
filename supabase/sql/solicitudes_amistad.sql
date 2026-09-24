-- Solicitudes de amistad pendientes de Bitácora. Ejecutar en el SQL
-- Editor de Supabase.
--
-- Igual que "amistades": el cliente solo LEE de aquí directamente
-- (tanto las que ha recibido como las que ha enviado, filtrando por
-- estado='pendiente' en el propio cliente). Crearlas/resolverlas pasa
-- por la función RPC enviar_solicitud_amistad_por_codigo() (SECURITY
-- DEFINER), así que no hace falta política de INSERT/UPDATE/DELETE
-- para authenticated.

alter table solicitudes_amistad enable row level security;

drop policy if exists "usuarios ven sus solicitudes enviadas o recibidas" on solicitudes_amistad;
create policy "usuarios ven sus solicitudes enviadas o recibidas"
    on solicitudes_amistad for select
    using (auth.uid() = remitente_id or auth.uid() = destinatario_id);
