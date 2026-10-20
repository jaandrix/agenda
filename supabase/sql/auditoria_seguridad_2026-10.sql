-- AUDITORÍA DE SEGURIDAD (2026-10): solo lectura, no cambia nada.
-- Ejecútala en Supabase, en el SQL Editor, y pásale a Claude el resultado de
-- cada bloque (los cinco salen como pestañas o seguidos).

-- 1. Todas las tablas públicas: ¿RLS activado?, ¿qué políticas tienen y para quién?
select
    t.tablename as tabla,
    t.rowsecurity as rls_activado,
    coalesce(string_agg(p.policyname || ' [' || p.cmd || ', ' || array_to_string(p.roles, '/') || '] usando: ' || coalesce(p.qual, '-') || ' / comprueba: ' || coalesce(p.with_check, '-'), E'\n' order by p.policyname), 'SIN POLÍTICAS') as politicas
from pg_tables t
left join pg_policies p on p.tablename = t.tablename and p.schemaname = t.schemaname
where t.schemaname = 'public'
group by t.tablename, t.rowsecurity
order by t.rowsecurity, t.tablename;

-- 2. Funciones SECURITY DEFINER (se saltan RLS): quién puede llamarlas.
select
    p.proname as funcion,
    pg_get_function_identity_arguments(p.oid) as argumentos,
    array_to_string(array(
        select r.rolname from pg_roles r
        where r.rolname in ('anon', 'authenticated', 'service_role') and has_function_privilege(r.oid, p.oid, 'execute')
    ), ', ') as pueden_ejecutar
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by p.proname;

-- 3. El guardado de los datos: debe escribir solo la fila de auth.uid().
select pg_get_functiondef(p.oid) as definicion
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'merge_bitacora_data';

-- 4. Almacenamiento: ¿algún bucket público?, límites de tamaño y tipos.
select id as bucket, public as publico, file_size_limit as limite_bytes, allowed_mime_types as tipos_permitidos
from storage.buckets
order by id;

-- 5. Reglas de los archivos subidos.
select policyname as politica, cmd, array_to_string(roles, '/') as roles, qual as usando, with_check as comprueba
from pg_policies
where schemaname = 'storage'
order by policyname;
