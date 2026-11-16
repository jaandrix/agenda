// Edge Function: eliminar-cuenta
//
// Borra para siempre la cuenta de quien la llama (Ajustes → zona de riesgo).
// El orden y las comprobaciones están en borrado.ts (pruebas: borrado_test.ts):
// primero se cancela Stripe (si falla, no se borra nada), luego documentos,
// enlaces compartidos, grupos de gastos y todas las tablas con sus datos, y
// el usuario de Auth al final, solo si todo lo anterior salió bien.
//   supabase functions deploy eliminar-cuenta --no-verify-jwt

import Stripe from 'https://esm.sh/stripe@23.0.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { eliminarCuenta, type Dependencias } from './borrado.ts';

const CLAVE_STRIPE = Deno.env.get('STRIPE_SECRET_KEY') || '';
const stripe = CLAVE_STRIPE ? new Stripe(CLAVE_STRIPE, { apiVersion: '2025-03-31.basil', httpClient: Stripe.createFetchHttpClient() }) : null;
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const TERMINADAS = ['canceled', 'incomplete_expired'];

// Se cancelan todas las suscripciones vivas del cliente, no solo la apuntada:
// si el webhook llegó a destiempo, la fila puede no tener la última.
async function cancelarStripe(sub: { stripe_customer_id?: string | null; stripe_subscription_id?: string | null }) {
    if (!stripe) throw new Error('Falta STRIPE_SECRET_KEY');
    const ids = new Set<string>();
    if (sub.stripe_customer_id) {
        for await (const s of stripe.subscriptions.list({ customer: sub.stripe_customer_id, status: 'all', limit: 100 })) {
            if (!TERMINADAS.includes(s.status)) ids.add(s.id);
        }
    }
    if (sub.stripe_subscription_id && !ids.has(sub.stripe_subscription_id)) {
        try {
            const s = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
            if (!TERMINADAS.includes(s.status)) ids.add(s.id);
        } catch (e) {
            if ((e as any)?.code !== 'resource_missing') throw e;
        }
    }
    for (const id of ids) await stripe.subscriptions.cancel(id);
}

const dep: Dependencias = {
    leerSuscripcion: async uid => await sb.from('suscripciones').select('stripe_customer_id, stripe_subscription_id, estado').eq('user_id', uid).maybeSingle(),
    cancelarStripe,
    listar: async (bucket, prefijo, offset, limit) => await sb.storage.from(bucket).list(prefijo, { limit, offset, sortBy: { column: 'name', order: 'asc' } }),
    quitar: async (bucket, rutas) => await sb.storage.from(bucket).remove(rutas),
    leerJson: async (bucket, ruta) => {
        const { data, error } = await sb.storage.from(bucket).download(ruta);
        if (error || !data) return { error: error || 'vacío' };
        try { return { data: JSON.parse(await data.text()) }; } catch (e) { return { error: e }; }
    },
    leerDatos: async uid => {
        const { data, error } = await sb.from('bitacora').select('data').eq('user_id', uid).maybeSingle();
        return { data: data?.data || {}, error };
    },
    gruposCreados: async uid => await sb.from('grupos_gastos').select('id').eq('creador_id', uid),
    otroMiembro: async (grupoId, uid) => await sb.from('grupos_gastos_miembros').select('user_id').eq('grupo_id', grupoId).not('user_id', 'is', null).neq('user_id', uid).limit(1).maybeSingle(),
    pasarGrupo: async (grupoId, nuevo) => await sb.from('grupos_gastos').update({ creador_id: nuevo }).eq('id', grupoId),
    borrarGrupo: async grupoId => await sb.from('grupos_gastos').delete().eq('id', grupoId),
    borrarFilas: async (tabla, columna, uid) => await sb.from(tabla).delete().eq(columna, uid),
    borrarUsuario: async uid => await sb.auth.admin.deleteUser(uid),
};

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
    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'No autorizado' }, 401);
    const { data: auth } = await sb.auth.getUser(jwt);
    const user = auth?.user;
    if (!user) return json({ error: 'No autorizado' }, 401);
    if (demasiadas(user.id, 5)) return json({ error: 'Demasiadas peticiones. Espera un minuto.' }, 429);
    const opciones = await req.json().catch(() => ({}));
    if (opciones?.confirmar !== 'eliminar') return json({ error: 'Falta la confirmación' }, 400);

    const r = await eliminarCuenta(user.id, dep).catch(e => {
        console.error('eliminar-cuenta: error inesperado', e);
        return { ok: false as const, paso: 'desconocido', status: 500, error: 'No se ha podido borrar la cuenta. Vuelve a intentarlo; si sigue fallando, escríbenos.' };
    });
    return r.ok ? json({ ok: true }) : json({ error: r.error, paso: r.paso }, r.status);
});
