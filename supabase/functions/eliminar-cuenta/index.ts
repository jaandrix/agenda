// Edge Function: eliminar-cuenta
//
// Borra para siempre la cuenta de quien la llama (Ajustes → zona de riesgo).
// Casi todo cuelga de auth.users con "on delete cascade" y se va solo al
// borrar el usuario; aquí se hace antes lo que no:
// - cancelar ya la suscripción de Stripe, para que no se vuelva a cobrar;
// - borrar sus archivos del bucket "documents" (todo vive bajo <user_id>/);
// - pasar sus grupos de gastos a otro miembro con cuenta, para que no
//   desaparezcan para sus amigos (si no queda nadie, se borran);
// - borrar las filas de bitacora y bitacora_secrets, que no tienen cascade.
//   supabase functions deploy eliminar-cuenta --no-verify-jwt

import Stripe from 'https://esm.sh/stripe?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2025-03-31.basil', httpClient: Stripe.createFetchHttpClient() });
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function borrarCarpeta(prefijo: string) {
    const { data } = await sb.storage.from('documents').list(prefijo, { limit: 1000 });
    const archivos: string[] = [];
    for (const item of data || []) {
        const ruta = `${prefijo}/${item.name}`;
        if (item.id) archivos.push(ruta);
        else await borrarCarpeta(ruta);
    }
    if (archivos.length) await sb.storage.from('documents').remove(archivos);
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await sb.auth.getUser(jwt);
    if (!user) return json({ error: 'No autorizado' }, 401);
    const opciones = await req.json().catch(() => ({}));
    if (opciones.confirmar !== 'eliminar') return json({ error: 'Falta la confirmación' }, 400);

    try {
        const { data: sub } = await sb.from('suscripciones').select('stripe_subscription_id, estado').eq('user_id', user.id).maybeSingle();
        if (sub?.stripe_subscription_id && ['active', 'trialing', 'past_due', 'incomplete'].includes(sub.estado)) {
            try { await stripe.subscriptions.cancel(sub.stripe_subscription_id); }
            catch (e) { console.error('No se pudo cancelar la suscripción:', e); }
        }

        await borrarCarpeta(user.id);

        const { data: grupos } = await sb.from('grupos_gastos').select('id').eq('creador_id', user.id);
        for (const g of grupos || []) {
            const { data: otro } = await sb.from('grupos_gastos_miembros').select('user_id').eq('grupo_id', g.id).not('user_id', 'is', null).neq('user_id', user.id).limit(1).maybeSingle();
            if (otro?.user_id) await sb.from('grupos_gastos').update({ creador_id: otro.user_id }).eq('id', g.id);
            else await sb.from('grupos_gastos').delete().eq('id', g.id);
        }

        await sb.from('bitacora').delete().eq('user_id', user.id);
        await sb.from('bitacora_secrets').delete().eq('user_id', user.id);
        const { error } = await sb.auth.admin.deleteUser(user.id);
        if (error) throw error;
        return json({ ok: true });
    } catch (e) {
        console.error('Error eliminando la cuenta:', e);
        return json({ error: 'No se pudo eliminar la cuenta. Escríbenos y lo hacemos a mano.' }, 500);
    }
});
