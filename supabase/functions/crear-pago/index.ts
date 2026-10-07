// Edge Function: crear-pago
//
// Crea el Checkout de Stripe para suscribirse (mensual / anual) o para
// hacerse socio fundador (pago único de 29,99 €, máximo 100 plazas).
// Sustituye a los Payment Links: la prueba gratuita de 14 días la da la
// propia app sin tarjeta (desde que se crea la cuenta), así que aquí ya no
// hay periodo de prueba de Stripe. Los precios mensual y anual se sacan de
// los Payment Links de siempre, para no duplicarlos en el código.
//
// La llama la app con el JWT del usuario; stripe-webhook escribe después
// el resultado en "suscripciones". Para comprobar la configuración sin
// crear nada: x-internal-secret (AVISOS_SECRET) y {"probar": true}.
//   supabase functions deploy crear-pago --no-verify-jwt

import Stripe from 'https://esm.sh/stripe?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2025-03-31.basil', httpClient: Stripe.createFetchHttpClient() });
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const APP_URL = 'https://appbitacora.es/';
const PAYMENT_LINKS: Record<string, string> = {
    mensual: 'https://buy.stripe.com/7sYdR8bk5aTI3DZ7E28Zq00',
    anual: 'https://buy.stripe.com/6oUcN4bk58LAdez5vU8Zq01',
};

let precios: Record<string, string> | null = null;
async function precioDe(plan: string) {
    if (!precios) {
        precios = {};
        const links = await stripe.paymentLinks.list({ limit: 100 });
        for (const [nombre, url] of Object.entries(PAYMENT_LINKS)) {
            const link = links.data.find(l => l.url === url);
            if (!link) continue;
            const items = await stripe.paymentLinks.listLineItems(link.id, { limit: 1 });
            const precio = items.data[0]?.price?.id;
            if (precio) precios[nombre] = precio;
        }
    }
    return precios[plan];
}

async function plazasLibres() {
    const { data } = await sb.rpc('plazas_fundador');
    return Number(data ?? 0);
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    const opciones = await req.json().catch(() => ({}));

    const secreto = Deno.env.get('AVISOS_SECRET');
    if (opciones.probar && secreto && req.headers.get('x-internal-secret') === secreto) {
        return json({ mensual: await precioDe('mensual'), anual: await precioDe('anual'), plazas: await plazasLibres() });
    }

    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await sb.auth.getUser(jwt);
    if (!user) return json({ error: 'No autorizado' }, 401);

    const { data: actual } = await sb.from('suscripciones').select('estado, socio_numero').eq('user_id', user.id).maybeSingle();
    if (actual?.socio_numero) return json({ error: 'Ya eres socio fundador' }, 409);

    const plan = String(opciones.plan || '');
    try {
        if (plan === 'fundador') {
            if (await plazasLibres() <= 0) return json({ error: 'Ya no quedan plazas de socio fundador' }, 409);
            const sesion = await stripe.checkout.sessions.create({
                mode: 'payment',
                client_reference_id: user.id,
                customer_email: user.email,
                customer_creation: 'always',
                metadata: { plan: 'fundador', user_id: user.id },
                line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: 2999, product_data: { name: 'Bitácora · socio fundador', description: 'Bitácora de por vida con un único pago. Solo 100 plazas.' } } }],
                success_url: APP_URL + '?checkout=success',
                cancel_url: APP_URL,
            });
            return json({ url: sesion.url });
        }
        if (plan === 'mensual' || plan === 'anual') {
            if (['active', 'trialing'].includes(actual?.estado)) return json({ error: 'Ya tienes una suscripción activa' }, 409);
            const precio = await precioDe(plan);
            if (!precio) return json({ error: 'Precio no encontrado' }, 500);
            const sesion = await stripe.checkout.sessions.create({
                mode: 'subscription',
                client_reference_id: user.id,
                customer_email: user.email,
                allow_promotion_codes: true,
                line_items: [{ price: precio, quantity: 1 }],
                success_url: APP_URL + '?checkout=success',
                cancel_url: APP_URL,
            });
            return json({ url: sesion.url });
        }
        return json({ error: 'Plan desconocido' }, 400);
    } catch (e) {
        console.error('Error creando el pago:', e);
        return json({ error: 'No se pudo iniciar el pago' }, 500);
    }
});
