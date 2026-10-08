-- ¿Tiene esta cuenta acceso a Bitácora ahora mismo? Mismas reglas que
-- getSubscriptionStatus + hasAccess en js/nucleo.js: cuentas anteriores al
-- lanzamiento de pago (legado), socios, suscripción activa o en prueba de
-- Stripe, cobro fallido con 3 días de margen, regalo vigente y, sin fila de
-- suscripción, los 14 días de prueba desde que se creó la cuenta.
-- La usan las Edge Functions (avisos-diarios, bitacora-mcp,
-- seguimiento-pedidos) para no dar servicio a cuentas sin acceso.

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
        else (select created_at from u) > now() - interval '14 days'
    end;
$$;
revoke all on function public.tiene_acceso(uuid) from public, anon, authenticated;
grant execute on function public.tiene_acceso(uuid) to service_role;
