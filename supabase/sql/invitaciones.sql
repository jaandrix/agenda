-- Invitar a un amigo (23-10-2026). Cada cuenta tiene un código propio (AMIGO-XXXX-XXXX). Quien se da de alta
-- con un código tiene 30 días de prueba en vez de 14, y cuando eso pasa los dos (quien invita y quien entra)
-- desbloquean el tema «oliva.». Nadie escribe en las tablas directamente: solo las funciones de abajo.
-- Ejecutar en el SQL Editor de Supabase. También cambia tiene_acceso() para contar los 30 días.

create table if not exists public.invitaciones_codigos (
    user_id uuid primary key references auth.users(id) on delete cascade,
    codigo text unique not null,
    creado_en timestamptz not null default now()
);
alter table public.invitaciones_codigos enable row level security;
drop policy if exists "cada uno ve su codigo" on public.invitaciones_codigos;
create policy "cada uno ve su codigo" on public.invitaciones_codigos for select to authenticated using (user_id = auth.uid());

create table if not exists public.invitaciones (
    invitado uuid primary key references auth.users(id) on delete cascade,
    anfitrion uuid not null references auth.users(id) on delete cascade,
    creado_en timestamptz not null default now()
);
alter table public.invitaciones enable row level security;
drop policy if exists "cada uno ve sus invitaciones" on public.invitaciones;
create policy "cada uno ve sus invitaciones" on public.invitaciones for select to authenticated using (invitado = auth.uid() or anfitrion = auth.uid());

-- Tu código (se crea la primera vez) y cuántos amigos han entrado con él.
create or replace function public.mi_codigo_invitacion()
returns table (codigo text, amigos int) language plpgsql security definer set search_path = public as $$
declare
    v_alfabeto text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    v_codigo text;
begin
    if auth.uid() is null then raise exception 'Hace falta iniciar sesión'; end if;
    while not exists (select 1 from invitaciones_codigos where user_id = auth.uid()) loop
        v_codigo := 'AMIGO-';
        for i in 1..8 loop
            if i = 5 then v_codigo := v_codigo || '-'; end if;
            v_codigo := v_codigo || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
        end loop;
        insert into invitaciones_codigos (user_id, codigo) values (auth.uid(), v_codigo) on conflict do nothing;
    end loop;
    return query select c.codigo, (select count(*)::int from invitaciones i where i.anfitrion = auth.uid())
        from invitaciones_codigos c where c.user_id = auth.uid();
end $$;

-- Usar el código de un amigo: solo en los primeros 14 días de una cuenta nueva sin plan activo, una vez.
-- Devuelve los días de prueba que quedan con la ampliación.
create or replace function public.usar_codigo_invitacion(p_codigo text)
returns int language plpgsql security definer set search_path = public as $$
declare
    v_anfitrion uuid;
    v_alta timestamptz;
begin
    if auth.uid() is null then raise exception 'Hace falta iniciar sesión'; end if;
    select created_at into v_alta from auth.users where id = auth.uid();
    if exists (select 1 from invitaciones where invitado = auth.uid()) then
        return greatest(0, ceil(extract(epoch from (v_alta + interval '30 days' - now())) / 86400))::int;
    end if;
    select user_id into v_anfitrion from invitaciones_codigos where codigo = upper(trim(p_codigo));
    if v_anfitrion is null then raise exception 'Ese código de amigo no existe'; end if;
    if v_anfitrion = auth.uid() then raise exception 'No puedes usar tu propio código'; end if;
    if v_alta < '2026-09-15T00:00:00Z' then raise exception 'Tu cuenta ya tiene acceso gratis para siempre'; end if;
    if v_alta < now() - interval '14 days' then raise exception 'El código de un amigo se usa en los primeros 14 días de la cuenta'; end if;
    if exists (select 1 from suscripciones where user_id = auth.uid() and estado in ('legado', 'fundador', 'active', 'trialing', 'regalo')) then
        raise exception 'Ya tienes Bitácora activa';
    end if;
    insert into invitaciones (invitado, anfitrion) values (auth.uid(), v_anfitrion);
    return greatest(0, ceil(extract(epoch from (v_alta + interval '30 days' - now())) / 86400))::int;
end $$;

revoke all on function public.mi_codigo_invitacion() from public, anon;
revoke all on function public.usar_codigo_invitacion(text) from public, anon;
grant execute on function public.mi_codigo_invitacion() to authenticated;
grant execute on function public.usar_codigo_invitacion(text) to authenticated;

-- Misma regla que tiene_acceso.sql, con la prueba de 30 días para quien entró con un código de amigo.
create or replace function public.tiene_acceso(p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
    with u as (select created_at from auth.users where id = p_user),
         s as (select * from suscripciones where user_id = p_user)
    select case
        when not exists (select 1 from u) then false
        when (select created_at from u) < '2026-09-15T00:00:00Z' then true
        when exists (select 1 from s) then exists (select 1 from s where
            estado in ('legado', 'fundador', 'active', 'trialing')
            or (estado = 'past_due' and actualizado_en > now() - interval '3 days')
            or (estado = 'regalo' and periodo_fin > now()))
        else (select created_at from u) > now() - case when exists (select 1 from invitaciones where invitado = p_user) then interval '30 days' else interval '14 days' end
    end;
$$;
revoke all on function public.tiene_acceso(uuid) from public, anon, authenticated;
grant execute on function public.tiene_acceso(uuid) to service_role;
