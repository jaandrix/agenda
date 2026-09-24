-- Código de amigo (8 caracteres) que cada usuario genera para que
-- otros le añadan. Ejecutar en el SQL Editor de Supabase.
--
-- El cliente solo lee y crea SU PROPIO código
-- (cargarCodigoAmigo()/generarCodigoAmigo(), ver app.js). Buscar el
-- código de OTRO usuario (al añadir un amigo por código) pasa por la
-- función RPC enviar_solicitud_amistad_por_codigo() (SECURITY
-- DEFINER, se salta RLS), así que esta tabla no necesita ninguna
-- política de lectura pública.

alter table codigos_amigo enable row level security;

drop policy if exists "usuarios gestionan su propio codigo" on codigos_amigo;
create policy "usuarios gestionan su propio codigo"
    on codigos_amigo for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
