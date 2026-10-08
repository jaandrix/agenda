// Edge Function: portal-pago
//
// Abre el portal de cliente de Stripe (cambiar de tarjeta, ver y descargar
// facturas, cambiar de plan o cancelar) para quien la llama. El portal se
// configura una vez en el Dashboard de Stripe: Configuración → Facturación →
// Portal de clientes.
//   supabase functions deploy portal-pago --no-verify-jwt

import Stripe from 'https://esm.sh/stripe?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2025-03-31.basil', httpClient: Stripe.createFetchHttpClient() });
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await sb.auth.getUser(jwt);
    if (!user) return json({ error: 'No autorizado' }, 401);
    const { data: sub } = await sb.from('suscripciones').select('stripe_customer_id').eq('user_id', user.id).maybeSingle();
    if (!sub?.stripe_customer_id) return json({ error: 'No tienes pagos con Bitácora todavía' }, 404);
    try {
        const sesion = await stripe.billingPortal.sessions.create({ customer: sub.stripe_customer_id, return_url: 'https://appbitacora.es/' });
        return json({ url: sesion.url });
    } catch (e) {
        console.error('Error abriendo el portal de Stripe:', e);
        return json({ error: 'El portal de pagos aún no está activado' }, 500);
    }
});
