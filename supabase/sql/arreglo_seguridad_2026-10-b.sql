-- ARREGLO DE SEGURIDAD (2026-10), segunda parte: funciones y archivos.
-- Ejecutar entero en Supabase, en el SQL Editor. Se puede repetir sin problema.

-- 1. Funciones que la app no usa y que permitían saltarse las solicitudes de
--    amistad: crear_amistad_bidireccional (dos usuarios cualquiera) y
--    anadir_amigo_por_codigo. Solo el servidor podrá llamarlas; si
--    responder_solicitud_amistad las usa por dentro, sigue funcionando
--    (corre con los permisos de su dueño).
revoke execute on function public.crear_amistad_bidireccional(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.anadir_amigo_por_codigo(text) from public, anon, authenticated;

-- 2. Sin cuenta no se llama a nada que sea de una cuenta (solo queda abierta
--    plazas_fundador, que usa la portada).
revoke execute on function public.merge_bitacora_data(jsonb) from public, anon;
revoke execute on function public.eliminar_amigo(uuid) from public, anon;
revoke execute on function public.enviar_solicitud_amistad_por_codigo(text) from public, anon;
revoke execute on function public.responder_solicitud_amistad(uuid, boolean) from public, anon;
revoke execute on function public.es_miembro_grupo_gastos(uuid) from public, anon;
grant execute on function public.merge_bitacora_data(jsonb) to authenticated;
grant execute on function public.eliminar_amigo(uuid) to authenticated;
grant execute on function public.enviar_solicitud_amistad_por_codigo(text) to authenticated;
grant execute on function public.responder_solicitud_amistad(uuid, boolean) to authenticated;
grant execute on function public.es_miembro_grupo_gastos(uuid) to authenticated;

-- 3. Documentos: como mucho 25 MB por archivo.
update storage.buckets set file_size_limit = 26214400 where id = 'documents';
