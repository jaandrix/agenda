-- Nombre visible público de cada usuario (independiente del nombre de
-- cuenta), usado para mostrar a quién pertenece cada amistad,
-- solicitud, recomendación o viaje compartido. Ejecutar en el SQL
-- Editor de Supabase.
--
-- Lectura abierta a cualquier usuario autenticado a propósito: el
-- cliente busca nombres visibles de terceros por user_id
-- (amigos, solicitudes, recomendaciones, viajes compartidos — ver
-- app.js, siempre `.in('user_id', ids)` con ids ya conocidos por otra
-- vía), y lo único que expone es un nombre elegido para mostrarse, no
-- datos sensibles. Solo el propio usuario puede crear/editar su fila.

alter table perfiles_publicos enable row level security;

drop policy if exists "cualquier autenticado lee nombres visibles" on perfiles_publicos;
create policy "cualquier autenticado lee nombres visibles"
    on perfiles_publicos for select
    to authenticated
    using (true);

drop policy if exists "usuarios gestionan su propio nombre visible" on perfiles_publicos;
create policy "usuarios gestionan su propio nombre visible"
    on perfiles_publicos for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
