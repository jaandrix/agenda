-- Lectura con huellas y escritura condicionada para la PWA y la app de iOS (reauditoría 0.8.0, 08-11-2026).
-- Ejecutar entero en Supabase, SQL Editor, ANTES de abrir la web nueva. Se puede repetir sin problema.
--
-- leer_bitacora() devuelve la fila y una huella (md5) de cada clave de primer nivel. guardar_bitacora(parche, huellas)
-- solo escribe si, con la fila bloqueada, cada clave del parche sigue teniendo la huella que el cliente leyó; si no,
-- devuelve false y el cliente vuelve a leer, fusiona y lo intenta otra vez. Así ningún cliente (web, iPhone) borra
-- un cambio que no ha visto, y la comprobación viaja en unos bytes en vez de repetir bloques enteros.
-- merge_bitacora_data y merge_bitacora_si se quedan para versiones antiguas.

create or replace function public.leer_bitacora()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select jsonb_build_object(
        'data', b.data,
        'updated_at', b.updated_at,
        'huellas', coalesce((select jsonb_object_agg(e.key, md5(e.value::text)) from jsonb_each(b.data) e), '{}'::jsonb)
    )
    from bitacora b
    where b.user_id = auth.uid();
$$;

create or replace function public.guardar_bitacora(p_patch jsonb, p_huellas jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    actual jsonb;
    k text;
begin
    if auth.uid() is null then
        raise exception 'sin sesión';
    end if;
    if jsonb_typeof(p_patch) <> 'object' or jsonb_typeof(p_huellas) <> 'object' then
        raise exception 'parche no válido';
    end if;
    select data into actual from bitacora where user_id = auth.uid() for update;
    if not found then
        -- Cuenta nueva: solo si el cliente tampoco vio nada.
        if exists (select 1 from jsonb_each_text(p_huellas) h where h.value <> '') then
            return false;
        end if;
        insert into bitacora (user_id, data, updated_at) values (auth.uid(), p_patch, now());
        return true;
    end if;
    for k in select jsonb_object_keys(p_patch) loop
        if coalesce(md5((actual -> k)::text), '') <> coalesce(p_huellas ->> k, '') then
            return false;
        end if;
    end loop;
    update bitacora set data = actual || p_patch, updated_at = now() where user_id = auth.uid();
    return true;
end;
$$;

revoke execute on function public.leer_bitacora() from public, anon;
grant execute on function public.leer_bitacora() to authenticated;
revoke execute on function public.guardar_bitacora(jsonb, jsonb) from public, anon;
grant execute on function public.guardar_bitacora(jsonb, jsonb) to authenticated;
