-- Escritura condicionada para la app nativa de iOS (auditoría 0.7.0, 08-11-2026).
-- Ejecutar entero en Supabase, SQL Editor. Se puede repetir sin problema.
--
-- La app nativa manda el parche (claves de primer nivel) y lo que esas claves valían cuando las leyó. Con la fila
-- bloqueada, si alguna ha cambiado entretanto (la PWA, el conector u otro iPhone escribieron), no escribe nada y
-- devuelve false: la app vuelve a leer, aplica otra vez sus operaciones sobre lo nuevo y lo intenta de nuevo. Así una
-- escritura del iPhone nunca borra un cambio que no ha visto. La web sigue usando merge_bitacora_data.

create or replace function public.merge_bitacora_si(p_patch jsonb, p_esperado jsonb)
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
    if jsonb_typeof(p_patch) <> 'object' or jsonb_typeof(p_esperado) <> 'object' then
        raise exception 'parche no válido';
    end if;
    select data into actual from bitacora where user_id = auth.uid() for update;
    if actual is null then
        return false;
    end if;
    for k in select jsonb_object_keys(p_patch) loop
        if k in ('apuntes', '_meta') then
            raise exception 'clave protegida: %', k;
        end if;
        if (actual -> k) is distinct from (p_esperado -> k) then
            return false;
        end if;
    end loop;
    update bitacora set data = actual || p_patch, updated_at = now() where user_id = auth.uid();
    return true;
end;
$$;

revoke execute on function public.merge_bitacora_si(jsonb, jsonb) from public, anon;
grant execute on function public.merge_bitacora_si(jsonb, jsonb) to authenticated;
