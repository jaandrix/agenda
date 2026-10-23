-- Sugerencias del panel del proyecto (jaandrix.github.io/bitacora-panel, pestaña Tareas).
-- Claude propone 5 sugerencias en datos/tareas.json del repositorio del panel; Alejandro las acepta o las
-- rechaza desde el panel y Claude lee aquí lo que ha marcado. El panel es una página pública: para votar
-- hace falta una clave que solo sabe Alejandro (aquí se guarda su huella sha256, nunca la clave). Leer los
-- votos es público a propósito: son sobre sugerencias que ya están publicadas en el panel.
-- Después de ejecutar este archivo, poner la clave (una frase larga) con:
--   insert into public.panel_clave values (encode(extensions.digest('AQUÍ TU CLAVE', 'sha256'), 'hex'));

create table if not exists public.panel_clave (hash text primary key);
alter table public.panel_clave enable row level security;

create table if not exists public.panel_votos (
    id text primary key check (char_length(id) between 1 and 40),
    voto text not null check (voto in ('si', 'no')),
    nota text check (char_length(nota) <= 500),
    cuando timestamptz not null default now()
);
alter table public.panel_votos enable row level security;

create table if not exists public.panel_fallos (cuando timestamptz not null default now());
alter table public.panel_fallos enable row level security;
-- Sin políticas: nadie toca estas tablas directamente, solo las funciones de abajo.

create or replace function public.panel_clave_ok(p_clave text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
    delete from panel_fallos where cuando < now() - interval '1 day';
    if (select count(*) from panel_fallos where cuando > now() - interval '1 hour') >= 20 then
        raise exception 'demasiados intentos, prueba dentro de una hora';
    end if;
    if exists (select 1 from panel_clave where hash = encode(digest(coalesce(p_clave, ''), 'sha256'), 'hex')) then
        return true;
    end if;
    insert into panel_fallos default values;
    return false;
end $$;

create or replace function public.panel_votar(p_clave text, p_id text, p_voto text, p_nota text default null)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
    if not panel_clave_ok(p_clave) then return false; end if;
    if coalesce(p_voto, '') = '' then
        delete from panel_votos where id = p_id;
        return true;
    end if;
    insert into panel_votos (id, voto, nota, cuando) values (p_id, p_voto, nullif(left(coalesce(p_nota, ''), 500), ''), now())
    on conflict (id) do update set voto = excluded.voto, nota = excluded.nota, cuando = now();
    return true;
end $$;

create or replace function public.panel_votos_lista()
returns table (id text, voto text, nota text, cuando timestamptz)
language sql stable security definer set search_path = public as $$
    select id, voto, nota, cuando from panel_votos order by cuando desc limit 200;
$$;

revoke all on function public.panel_clave_ok(text) from public;
revoke all on function public.panel_votar(text, text, text, text) from public;
revoke all on function public.panel_votos_lista() from public;
grant execute on function public.panel_clave_ok(text) to anon, authenticated;
grant execute on function public.panel_votar(text, text, text, text) to anon, authenticated;
grant execute on function public.panel_votos_lista() to anon, authenticated;
