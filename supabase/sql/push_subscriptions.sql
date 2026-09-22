-- Suscripciones a notificaciones push (Web Push) de Bitácora.
-- Ejecutar una sola vez en el SQL Editor de Supabase.
--
-- A diferencia de "suscripciones" (Stripe), aquí SÍ escribe el propio
-- usuario desde el cliente (al activar/desactivar notificaciones en
-- Ajustes) — cada uno gestiona únicamente sus propias filas. La función
-- "send-push" lee todas las filas usando la service role key, que se
-- salta RLS por diseño.

create table if not exists push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    -- El endpoint identifica de forma única cada dispositivo/navegador
    -- suscrito; un mismo usuario puede tener varios (móvil, escritorio...).
    endpoint text not null unique,
    -- El objeto PushSubscription completo tal cual lo da el navegador
    -- (endpoint + claves p256dh/auth), en JSON.
    subscription jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

drop policy if exists "usuarios gestionan sus propias suscripciones push" on push_subscriptions;
create policy "usuarios gestionan sus propias suscripciones push"
    on push_subscriptions for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
