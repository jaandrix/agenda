-- ARREGLO DE SEGURIDAD (2026-10), a partir de la auditoría.
-- Ejecutar entero en Supabase, en el SQL Editor. Se puede repetir sin problema.

-- 1. global_settings (contraseña del modo desarrollador): antes cualquier
--    usuario con cuenta podía leerla y cambiarla. Ahora solo Alejandro.
drop policy if exists "Usuarios autenticados pueden leer global_settings" on global_settings;
drop policy if exists "Usuarios autenticados pueden modificar global_settings" on global_settings;
drop policy if exists "solo el administrador lee global_settings" on global_settings;
drop policy if exists "solo el administrador modifica global_settings" on global_settings;
create policy "solo el administrador lee global_settings"
    on global_settings for select to authenticated
    using ((auth.jwt() ->> 'email') = 'jandropas@gmail.com');
create policy "solo el administrador modifica global_settings"
    on global_settings for all to authenticated
    using ((auth.jwt() ->> 'email') = 'jandropas@gmail.com')
    with check ((auth.jwt() ->> 'email') = 'jandropas@gmail.com');

-- 2. perfiles_publicos: antes cualquiera con cuenta leía el nombre e id de
--    todos los usuarios. Ahora: uno mismo, sus amigos y la gente con la que
--    hay una solicitud de amistad (para ver quién te la manda).
drop policy if exists "perfiles_publicos: lectura para cualquier usuario autenticado" on perfiles_publicos;
drop policy if exists "cualquier autenticado lee nombres visibles" on perfiles_publicos;
drop policy if exists "perfiles_publicos: lectura de uno mismo, amigos y solicitudes" on perfiles_publicos;
create policy "perfiles_publicos: lectura de uno mismo, amigos y solicitudes"
    on perfiles_publicos for select to authenticated
    using (
        auth.uid() = user_id
        or exists (select 1 from amistades a where a.user_id = auth.uid() and a.friend_id = perfiles_publicos.user_id)
        or exists (select 1 from solicitudes_amistad s
                   where (s.remitente_id = auth.uid() and s.destinatario_id = perfiles_publicos.user_id)
                      or (s.destinatario_id = auth.uid() and s.remitente_id = perfiles_publicos.user_id))
    );

-- 3. listas_ocio_compartidas: como los eventos, viajes y recomendaciones,
--    solo se comparten con amigos.
drop policy if exists "remitente crea la lista compartida" on listas_ocio_compartidas;
drop policy if exists "remitente comparte lista con un amigo" on listas_ocio_compartidas;
create policy "remitente comparte lista con un amigo"
    on listas_ocio_compartidas for insert
    with check (
        auth.uid() = remitente_id
        and exists (select 1 from amistades a where a.user_id = auth.uid() and a.friend_id = listas_ocio_compartidas.destinatario_id)
    );
