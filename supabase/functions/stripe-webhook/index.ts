// Edge Function: stripe-webhook
//
// Recibe los eventos de suscripción de Stripe y mantiene al día la tabla
// "suscripciones" en Supabase. No crea el Checkout Session (eso lo hace
// directamente el Payment Link de Stripe, sin backend propio) — esta
// función solo escucha lo que pasa después.
//
// Despliegue (desde la raíz del repo, con la Supabase CLI ya vinculada
// al proyecto):
//   supabase functions deploy stripe-webhook --no-verify-jwt
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_...
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
//
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los
// inyecta Supabase automáticamente en toda Edge Function — no hace
// falta (y la CLI lo rechaza) fijarlos a mano con supabase secrets set.
//
// En el Dashboard de Stripe, el endpoint del webhook es:
//   https://<tu-project-ref>.supabase.co/functions/v1/stripe-webhook
// con los eventos: checkout.session.completed, customer.subscription.updated,
// customer.subscription.deleted

import Stripe from 'https://esm.sh/stripe?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_API_VERSION = '2025-03-31.basil';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
});

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

// Cliente con la service role: se salta RLS, solo vive dentro de esta
// función (nunca se expone al navegador).
const sbAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

function centroPeriodoFin(subscription: any): string | null {
    const item = subscription.items?.data?.[0];
    const segundos = item?.current_period_end;
    return segundos ? new Date(segundos * 1000).toISOString() : null;
}

function trialFin(subscription: any): string | null {
    return subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null;
}

async function upsertPorUserId(userId: string, fields: Record<string, unknown>) {
    const { error } = await sbAdmin
        .from('suscripciones')
        .upsert({ user_id: userId, actualizado_en: new Date().toISOString(), ...fields }, { onConflict: 'user_id' });
    if (error) console.error('Error guardando suscripcion (por user_id):', error);
}

async function updatePorSubscriptionId(stripeSubscriptionId: string, fields: Record<string, unknown>) {
    const { error } = await sbAdmin
        .from('suscripciones')
        .update({ actualizado_en: new Date().toISOString(), ...fields })
        .eq('stripe_subscription_id', stripeSubscriptionId);
    if (error) console.error('Error actualizando suscripcion (por subscription_id):', error);
}

Deno.serve(async (req) => {
    // Importante: leer el body como texto ANTES de tocarlo de cualquier
    // otra forma. Si se parsea como JSON primero, la verificación de
    // firma de Stripe falla porque compara sobre el texto original.
    const body = await req.text();
    const sig = req.headers.get('stripe-signature');
    if (!sig) return new Response('Falta la cabecera stripe-signature', { status: 400 });

    let event;
    try {
        // En Deno hace falta la variante async: la síncrona depende del
        // módulo "crypto" de Node y no funciona en el runtime de Edge
        // Functions.
        event = await stripe.webhooks.constructEventAsync(body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Firma de webhook inválida:', err);
        return new Response('Firma inválida', { status: 400 });
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as any;
                const userId = session.client_reference_id;
                if (!userId) {
                    console.error('checkout.session.completed sin client_reference_id, se ignora');
                    break;
                }
                const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
                await upsertPorUserId(userId, {
                    stripe_customer_id: session.customer,
                    stripe_subscription_id: subscription.id,
                    estado: subscription.status,
                    modulos: ['base'],
                    periodo_fin: centroPeriodoFin(subscription),
                    trial_fin: trialFin(subscription),
                });
                break;
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object as any;
                // Este evento no lleva client_reference_id (solo existe
                // en el Checkout Session): se localiza la fila por el id
                // de la propia suscripción de Stripe. El margen de gracia
                // de past_due se aplica en el cliente (app.js); aquí solo
                // se guarda el estado real que reporta Stripe.
                await updatePorSubscriptionId(subscription.id, {
                    estado: subscription.status,
                    periodo_fin: centroPeriodoFin(subscription),
                    trial_fin: trialFin(subscription),
                });
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object as any;
                await updatePorSubscriptionId(subscription.id, { estado: 'canceled' });
                break;
            }

            default:
                // Otros eventos de Stripe no nos interesan.
                break;
        }
    } catch (err) {
        console.error('Error procesando evento de Stripe:', event.type, err);
        // Devolvemos 200 igualmente para que Stripe no reintente
        // indefinidamente un evento que ya sabemos que va a fallar igual;
        // el error queda en los logs de la función para revisarlo.
    }

    return new Response(JSON.stringify({ recibido: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
});
