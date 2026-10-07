-- Socios fundadores: pago único de 29,99 € con acceso de por vida, solo
-- para las 100 primeras personas. Ejecutar en el SQL Editor de Supabase.
--
-- La fila de "suscripciones" de un socio queda con estado 'fundador',
-- plan 'fundador', sin stripe_subscription_id (no hay nada que renovar) y
-- con su número en socio_numero. La escribe solo stripe-webhook.

alter table suscripciones add column if not exists socio_numero int unique;

-- Plazas que quedan, para enseñarlo en la landing y en la pantalla de pago
-- (también a quien aún no ha iniciado sesión).
create or replace function public.plazas_fundador()
returns int language sql security definer stable set search_path = public as $$
    select greatest(0, 100 - (select count(*) from suscripciones where socio_numero is not null))::int;
$$;
revoke all on function public.plazas_fundador() from public;
grant execute on function public.plazas_fundador() to anon, authenticated;
