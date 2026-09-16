// Edge Function: cancelar-suscripcion
//
// La llama la propia app (Ajustes → Cancelar suscripción) con el token de
// sesión del usuario. Verifica quién es de verdad (no se fía de ningún
// user_id que mande el cliente), busca su suscripción de Stripe y la marca
// para cancelarse al final del periodo ya pagado — el usuario conserva el
// acceso hasta esa fecha, coherente con "cancela cuando quieras, sin
// permanencia".
//
// A diferencia de stripe-webhook, esta función SÍ debe desplegarse CON
// verificación de JWT (sin --no-verify-jwt), porque quien la llama es nuestra
// propia app autenticada, no Stripe:
//   supabase functions deploy cancelar-suscripcion

import Stripe from 'https://esm.sh/stripe?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_API_VERSION = '2025-03-31.basil';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
});

const sbAdmin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'No autorizado' }, 401);

    // Cliente atado al token de quien llama: identifica al usuario real a
    // partir de su sesión, no de nada que venga en el body de la petición.
    const sbUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await sbUser.auth.getUser();
    if (userError || !user) return json({ error: 'No autorizado' }, 401);

    const { data: sub, error: subError } = await sbAdmin
        .from('suscripciones')
        .select('stripe_subscription_id')
        .eq('user_id', user.id)
        .maybeSingle();
    if (subError || !sub?.stripe_subscription_id) {
        return json({ error: 'No se encontró ninguna suscripción de pago activa para esta cuenta' }, 404);
    }

    try {
        const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
            cancel_at_period_end: true,
        });
        const item = (updated as any).items?.data?.[0];
        const periodoFin = item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null;

        await sbAdmin.from('suscripciones').update({
            cancela_al_final_periodo: true,
            periodo_fin: periodoFin,
            actualizado_en: new Date().toISOString(),
        }).eq('user_id', user.id);

        return json({ ok: true, periodo_fin: periodoFin });
    } catch (err) {
        console.error('Error cancelando en Stripe:', err);
        return json({ error: 'No se pudo cancelar la suscripción en Stripe' }, 500);
    }
});
