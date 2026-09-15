-- Tabla de suscripciones de pago (Stripe) para Bitácora.
-- Ejecutar una sola vez en el SQL Editor de Supabase.
--
-- No hay política de INSERT/UPDATE para los roles anon/authenticated:
-- solo la Edge Function "stripe-webhook" escribe aquí, usando la
-- service role key (que se salta RLS por diseño). Los usuarios solo
-- pueden leer su propia fila.

create table if not exists suscripciones (
    user_id uuid primary key references auth.users(id) on delete cascade,
    stripe_customer_id text,
    stripe_subscription_id text,
    -- 'sin_suscripcion' | 'legado' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete'
    estado text not null default 'sin_suscripcion',
    -- Módulos que esta suscripción desbloquea. Hoy solo existe "base";
    -- el día que se venda un módulo extra (p. ej. Fantasy), se amplía
    -- este array según el price_id que llegue en el webhook, sin tocar
    -- el esquema.
    modulos jsonb not null default '["base"]'::jsonb,
    periodo_fin timestamptz,
    trial_fin timestamptz,
    actualizado_en timestamptz not null default now()
);

alter table suscripciones enable row level security;

create policy "usuarios ven su propia suscripcion"
    on suscripciones for select
    using (auth.uid() = user_id);
