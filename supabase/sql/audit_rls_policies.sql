-- AUDITORÍA de RLS de Bitácora — solo lectura, no cambia nada.
-- Ejecútalo en el SQL Editor de Supabase y compara el resultado con
-- los archivos .sql de esta misma carpeta: cada tabla debería aparecer
-- con "rls_habilitado = true" y con las políticas descritas en su
-- propio archivo. Si una tabla no aparece aquí, no existe todavía. Si
-- aparece con rls_habilitado = false, o sin políticas, es el hueco de
-- seguridad más urgente a tapar.

select
    t.tablename as tabla,
    t.rowsecurity as rls_habilitado,
    count(p.policyname) as num_politicas,
    coalesce(string_agg(p.policyname || ' (' || p.cmd || ')', ', ' order by p.policyname), '— sin políticas —') as politicas
from pg_tables t
left join pg_policies p on p.tablename = t.tablename and p.schemaname = t.schemaname
where t.schemaname = 'public'
  and t.tablename in (
    'bitacora', 'bitacora_snapshots', 'amistades', 'codigos_amigo',
    'listas_ocio_compartidas', 'perfiles_publicos', 'push_subscriptions',
    'recomendaciones', 'solicitudes_amistad', 'sugerencias',
    'suscripciones', 'viajes_compartidos'
  )
group by t.tablename, t.rowsecurity
order by t.tablename;

-- Comprobación aparte: funciones RPC que deberían ser SECURITY DEFINER
-- (para saltarse RLS a propósito, de forma controlada) — confirma que
-- lo son de verdad, porque si no lo fueran, añadir/eliminar amigos y
-- el guardado optimizado dejarían de funcionar en cuanto RLS esté bien
-- cerrado en las tablas que tocan.
select
    p.proname as funcion,
    case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER (revisar)' end as seguridad
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('merge_bitacora_data', 'enviar_solicitud_amistad_por_codigo', 'eliminar_amigo')
order by p.proname;
