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

// Mantenimiento (x-internal-secret = AVISOS_SECRET): {"ver": true} enseña la
// configuración del portal y {"configurar": true} la deja como la queremos:
// tarjeta, facturas, cambio entre mensual y anual, y cancelar al final del periodo.
const PAYMENT_LINKS = ['https://buy.stripe.com/7sYdR8bk5aTI3DZ7E28Zq00', 'https://buy.stripe.com/6oUcN4bk58LAdez5vU8Zq01'];
async function preciosSuscripcion() {
    const links = await stripe.paymentLinks.list({ limit: 100 });
    const precios: any[] = [];
    for (const url of PAYMENT_LINKS) {
        const link = links.data.find(l => l.url === url);
        if (!link) continue;
        const items = await stripe.paymentLinks.listLineItems(link.id, { limit: 1 });
        if (items.data[0]?.price) precios.push(items.data[0].price);
    }
    return precios;
}

async function mantenimiento(opciones: any) {
    const configs = await stripe.billingPortal.configurations.list({ limit: 10 });
    if (opciones.ver) return json({ configuraciones: configs.data.map(c => ({ id: c.id, activa: c.active, porDefecto: c.is_default, funciones: c.features, perfil: c.business_profile })) });
    const precios = await preciosSuscripcion();
    const porProducto: Record<string, string[]> = {};
    precios.forEach((p: any) => { const prod = typeof p.product === 'string' ? p.product : p.product.id; (porProducto[prod] = porProducto[prod] || []).push(p.id); });
    const datos: any = {
        business_profile: { headline: 'Bitácora: tu suscripción, tu tarjeta y tus facturas.', privacy_policy_url: 'https://appbitacora.es/legal.html#privacidad', terms_of_service_url: 'https://appbitacora.es/legal.html#condiciones' },
        default_return_url: 'https://appbitacora.es/',
        features: {
            customer_update: { enabled: true, allowed_updates: ['email'] },
            invoice_history: { enabled: true },
            payment_method_update: { enabled: true },
            subscription_cancel: { enabled: true, mode: 'at_period_end', cancellation_reason: { enabled: true, options: ['too_expensive', 'unused', 'missing_features', 'switched_service', 'other'] } },
            subscription_update: { enabled: true, default_allowed_updates: ['price'], proration_behavior: 'create_prorations', products: Object.entries(porProducto).map(([product, prices]) => ({ product, prices })) },
        },
    };
    // Si ya hay un portal activo (configurado en el Dashboard), solo se le
    // añaden los enlaces legales y la vuelta a la app: el resto se respeta.
    const actual = configs.data.find(c => c.is_default);
    const res = actual
        ? await stripe.billingPortal.configurations.update(actual.id, { business_profile: datos.business_profile, default_return_url: datos.default_return_url, active: true })
        : await stripe.billingPortal.configurations.create(datos);
    return json({ ok: true, id: res.id, creada: !actual });
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    const secreto = Deno.env.get('AVISOS_SECRET');
    if (secreto && req.headers.get('x-internal-secret') === secreto) {
        try { return await mantenimiento(await req.json().catch(() => ({}))); }
        catch (e) { console.error(e); return json({ error: String((e as Error).message || e) }, 500); }
    }
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
