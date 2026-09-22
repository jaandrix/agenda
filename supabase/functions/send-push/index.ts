// Edge Function: send-push
//
// Envía una notificación push a todos los dispositivos suscritos de un
// usuario. No la llama el cliente directamente (por eso no verifica una
// sesión de usuario, sino un secreto compartido simple) — está pensada
// para que la llamen otras piezas internas: un cron que revise eventos
// próximos, un aviso de presupuesto superado, etc. Esas piezas (qué
// dispara cada aviso y cuándo) todavía no existen — esta función es solo
// el "enviar", el primer paso.
//
// Despliegue (sin verificación de JWT, como stripe-webhook, porque el
// llamante no es una sesión de usuario sino algo interno):
//   supabase functions deploy send-push --no-verify-jwt
//
// Secretos que hacen falta (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  — el par de claves de app.js;
//   la privada NUNCA se sube al repositorio, solo aquí como secreto.
//   INTERNAL_PUSH_SECRET — cualquier cadena aleatoria larga tuya, para que
//   solo quien la conozca pueda pedir que se envíen avisos.
//
// AVISO: no se ha podido probar el envío real desde esta sesión (no hay
// entorno Deno/Supabase disponible aquí) — antes de dar esto por bueno,
// pruébalo a mano con curl contra la función ya desplegada.

import webpush from 'https://esm.sh/web-push@3.6.7?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;

webpush.setVapidDetails('mailto:jandropas@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const sbAdmin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

interface SendPushBody {
    user_id?: string;
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

    const internalSecret = Deno.env.get('INTERNAL_PUSH_SECRET');
    if (internalSecret && req.headers.get('x-internal-secret') !== internalSecret) {
        return json({ error: 'No autorizado' }, 401);
    }

    let payload: SendPushBody;
    try {
        payload = await req.json();
    } catch {
        return json({ error: 'JSON inválido' }, 400);
    }
    if (!payload.user_id || !payload.title) {
        return json({ error: 'Faltan user_id o title' }, 400);
    }

    const { data: subs, error } = await sbAdmin
        .from('push_subscriptions')
        .select('id, endpoint, subscription')
        .eq('user_id', payload.user_id);
    if (error) return json({ error: error.message }, 500);
    if (!subs || subs.length === 0) return json({ ok: true, sent: 0, note: 'Este usuario no tiene notificaciones activadas en ningún dispositivo' });

    const notificationPayload = JSON.stringify({
        title: payload.title,
        body: payload.body || '',
        url: payload.url || './',
        tag: payload.tag || 'bitacora-generic',
    });

    let sent = 0;
    const staleEndpoints: string[] = [];
    for (const row of subs) {
        try {
            await webpush.sendNotification(row.subscription, notificationPayload);
            sent++;
        } catch (err) {
            // 404/410 = el navegador ya no reconoce esta suscripción (se
            // desinstaló la app, se borraron datos del sitio...) — se
            // limpia en vez de seguir intentando para siempre.
            const statusCode = (err as { statusCode?: number })?.statusCode;
            if (statusCode === 404 || statusCode === 410) {
                staleEndpoints.push(row.endpoint as string);
            } else {
                console.error('Error enviando push a', row.endpoint, err);
            }
        }
    }
    if (staleEndpoints.length) {
        await sbAdmin.from('push_subscriptions').delete().in('endpoint', staleEndpoints);
    }

    return json({ ok: true, sent, cleaned: staleEndpoints.length });
});
