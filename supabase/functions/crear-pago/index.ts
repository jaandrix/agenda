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

import Stripe from 'https://esm.sh/stripe@23.0.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2025-03-31.basil', httpClient: Stripe.createFetchHttpClient() });
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const APP_URL = 'https://appbitacora.es/';
const PAYMENT_LINKS: Record<string, string> = {
    mensual: 'https://buy.stripe.com/7sYdR8bk5aTI3DZ7E28Zq00',
    anual: 'https://buy.stripe.com/6oUcN4bk58LAdez5vU8Zq01',
};

// Si los Payment Links no se encuentran (desactivados, o la clave de Stripe es de otro modo: prueba frente a real),
// el cobro se crea con el importe dentro (IMPORTES), como el de socio fundador: antes salía «Precio no encontrado».
// stripe-webhook solo mira el intervalo (mensual o anual), así que vale igual. Solo se recuerda lo encontrado.
const IMPORTES: Record<string, { centimos: number; intervalo: 'month' | 'year' }> = { mensual: { centimos: 199, intervalo: 'month' }, anual: { centimos: 1899, intervalo: 'year' } };
const precios: Record<string, string> = {};
async function precioDe(plan: string) {
    if (precios[plan]) return precios[plan];
    try {
        const url = PAYMENT_LINKS[plan];
        const links = await stripe.paymentLinks.list({ limit: 100, active: true });
        const link = links.data.find(l => l.url === url);
        if (!link) return undefined;
        const items = await stripe.paymentLinks.listLineItems(link.id, { limit: 1 });
        const precio = items.data[0]?.price?.id;
        if (precio) precios[plan] = precio;
        return precio;
    } catch (e) {
        console.error('precioDe', e);
        return undefined;
    }
}

async function plazasLibres() {
    const { data } = await sb.rpc('plazas_fundador');
    return Number(data ?? 0);
}

// Límite de peticiones por minuto y por usuario. Vive en la memoria de cada
// instancia: no es exacto, pero frena a quien bombardee la función sin coste extra.
const ventanas = new Map<string, { inicio: number; n: number }>();
function demasiadas(clave: string, max: number) {
    const ahora = Date.now();
    const v = ventanas.get(clave);
    if (!v || ahora - v.inicio > 60000) { ventanas.set(clave, { inicio: ahora, n: 1 }); if (ventanas.size > 5000) ventanas.clear(); return false; }
    v.n++;
    return v.n > max;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    const opciones = await req.json().catch(() => ({}));

    const secreto = Deno.env.get('AVISOS_SECRET');
    if (opciones.probar && secreto && req.headers.get('x-internal-secret') === secreto) {
        return json({ mensual: await precioDe('mensual') || 'sin enlace: se cobra con el importe dentro', anual: await precioDe('anual') || 'sin enlace: se cobra con el importe dentro', plazas: await plazasLibres() });
    }

    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await sb.auth.getUser(jwt);
    if (!user) return json({ error: 'No autorizado' }, 401);
    if (demasiadas(user.id, 10)) return json({ error: 'Demasiadas peticiones. Espera un minuto.' }, 429);

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
            const imp = IMPORTES[plan];
            const sesion = await stripe.checkout.sessions.create({
                mode: 'subscription',
                client_reference_id: user.id,
                customer_email: user.email,
                allow_promotion_codes: true,
                line_items: [precio
                    ? { price: precio, quantity: 1 }
                    : { quantity: 1, price_data: { currency: 'eur', unit_amount: imp.centimos, recurring: { interval: imp.intervalo }, product_data: { name: plan === 'anual' ? 'Bitácora, plan anual' : 'Bitácora, plan mensual' } } }],
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
