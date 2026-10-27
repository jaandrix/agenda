-- Beta abierta (27-10-2026): Bitácora es gratis y completa para todo el mundo. tiene_acceso deja de mirar la
-- suscripción, así que nadie pierde los avisos push, el conector ni el seguimiento de envíos por no haber pagado.
-- Para volver a cobrar, ejecutar de nuevo tiene_acceso.sql. Ejecutar una vez en el SQL Editor.

create or replace function public.tiene_acceso(p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
    select p_user is not null;
$$;
