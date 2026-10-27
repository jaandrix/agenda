-- Beta testers (27-10-2026). Quien canjea el código de la beta antes del 31-12-2026 queda apuntado aquí y es
-- tester para siempre: lleva la insignia y, cuando vuelva a haber funciones de pago, tiene_acceso debe darle todo
-- (ver la nota al final). Las cuentas creadas hasta esa fecha también son testers aunque no canjeen nada.
-- El código no se guarda en el repositorio, que es público: solo su huella sha256. Después de ejecutar este
-- archivo, pon el código (el que tú quieras, por ejemplo BITACORA-BETA) con:
--   insert into public.beta_codigo values (encode(extensions.digest(upper('TU-CODIGO'), 'sha256'), 'hex'));

create table if not exists public.beta_codigo (hash text primary key);
alter table public.beta_codigo enable row level security;

create table if not exists public.beta_testers (
    user_id uuid primary key references auth.users(id) on delete cascade,
    desde timestamptz not null default now()
);
alter table public.beta_testers enable row level security;
-- Sin políticas: solo las funciones de abajo leen y escriben.

create or replace function public.canjear_codigo_beta(p_codigo text)
returns text language plpgsql volatile security definer set search_path = public, extensions as $$
begin
    if auth.uid() is null then return 'sin sesión'; end if;
    if now() > timestamptz '2026-12-31 23:59:59+01' then return 'caducado'; end if;
    if not exists (select 1 from beta_codigo where hash = encode(digest(upper(trim(coalesce(p_codigo, ''))), 'sha256'), 'hex')) then
        return 'no válido';
    end if;
    insert into beta_testers (user_id) values (auth.uid()) on conflict (user_id) do nothing;
    return 'ok';
end $$;

create or replace function public.soy_beta_tester()
returns boolean language sql stable security definer set search_path = public, auth as $$
    select exists (select 1 from beta_testers where user_id = auth.uid())
        or exists (select 1 from auth.users where id = auth.uid() and created_at <= timestamptz '2026-12-31 23:59:59+01');
$$;

revoke all on function public.canjear_codigo_beta(text) from public;
revoke all on function public.soy_beta_tester() from public;
grant execute on function public.canjear_codigo_beta(text) to authenticated;
grant execute on function public.soy_beta_tester() to authenticated;

-- Para el lanzamiento oficial: tiene_acceso tendrá que dar acceso completo también a los testers, por ejemplo
--   ... or exists (select 1 from beta_testers where user_id = p_user)
--       or exists (select 1 from auth.users where id = p_user and created_at <= timestamptz '2026-12-31 23:59:59+01')
