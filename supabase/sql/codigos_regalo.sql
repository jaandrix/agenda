-- Códigos de regalo de los socios fundadores: cada socio tiene 3 códigos
-- personales que regalan 6 meses de Bitácora a quien los canjee. Ejecutar
-- en el SQL Editor de Supabase (después de socios_fundadores.sql).
--
-- Nadie escribe en la tabla directamente: los códigos se crean con
-- mis_codigos_regalo() (solo socios) y se gastan con canjear_codigo_regalo().
-- Quien canjea queda en "suscripciones" con estado 'regalo', plan 'regalo'
-- y periodo_fin a 6 meses; al pasar esa fecha vuelve a ver la pantalla de pago.

create table if not exists codigos_regalo (
    codigo text primary key,
    socio_id uuid not null references auth.users(id) on delete cascade,
    creado_en timestamptz not null default now(),
    canjeado_por uuid unique references auth.users(id) on delete set null,
    canjeado_en timestamptz
);
alter table codigos_regalo enable row level security;
drop policy if exists "el socio ve sus codigos" on codigos_regalo;
create policy "el socio ve sus codigos" on codigos_regalo for select using (socio_id = auth.uid());

-- Devuelve los 3 códigos del socio que llama, creándolos la primera vez.
create or replace function public.mis_codigos_regalo()
returns setof codigos_regalo language plpgsql security definer set search_path = public as $$
declare
    v_alfabeto text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    v_codigo text;
begin
    if not exists (select 1 from suscripciones where user_id = auth.uid() and socio_numero is not null) then
        raise exception 'Solo los socios fundadores tienen códigos de regalo';
    end if;
    while (select count(*) from codigos_regalo where socio_id = auth.uid()) < 3 loop
        v_codigo := 'BITA-';
        for i in 1..8 loop
            if i = 5 then v_codigo := v_codigo || '-'; end if;
            v_codigo := v_codigo || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
        end loop;
        insert into codigos_regalo (codigo, socio_id) values (v_codigo, auth.uid()) on conflict do nothing;
    end loop;
    return query select * from codigos_regalo where socio_id = auth.uid() order by creado_en, codigo;
end;
$$;
revoke all on function public.mis_codigos_regalo() from public, anon;
grant execute on function public.mis_codigos_regalo() to authenticated;

create or replace function public.canjear_codigo_regalo(p_codigo text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
    v_codigo codigos_regalo;
    v_sub suscripciones;
    v_fin timestamptz := now() + interval '6 months';
begin
    select * into v_codigo from codigos_regalo where codigo = upper(trim(p_codigo)) for update;
    if v_codigo.codigo is null then raise exception 'Ese código no existe'; end if;
    if v_codigo.canjeado_por is not null then raise exception 'Ese código ya se ha usado'; end if;
    if v_codigo.socio_id = auth.uid() then raise exception 'No puedes canjear tus propios códigos'; end if;
    if exists (select 1 from codigos_regalo where canjeado_por = auth.uid()) then raise exception 'Ya canjeaste un código de regalo'; end if;
    if exists (select 1 from auth.users where id = auth.uid() and created_at < '2026-09-15T00:00:00Z') then raise exception 'Tu cuenta ya tiene acceso gratis para siempre'; end if;
    select * into v_sub from suscripciones where user_id = auth.uid();
    if v_sub.estado in ('fundador', 'active', 'trialing') then raise exception 'Ya tienes Bitácora activa'; end if;
    update codigos_regalo set canjeado_por = auth.uid(), canjeado_en = now() where codigo = v_codigo.codigo;
    insert into suscripciones (user_id, estado, plan, periodo_fin, cancela_al_final_periodo, actualizado_en)
        values (auth.uid(), 'regalo', 'regalo', v_fin, true, now())
        on conflict (user_id) do update set estado = 'regalo', plan = 'regalo', periodo_fin = v_fin, cancela_al_final_periodo = true, actualizado_en = now();
    return v_fin;
end;
$$;
revoke all on function public.canjear_codigo_regalo(text) from public, anon;
grant execute on function public.canjear_codigo_regalo(text) to authenticated;
