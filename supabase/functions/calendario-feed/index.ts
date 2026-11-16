// Edge Function: calendario-feed
//
// El calendario de Bitácora como .ics para suscribirse desde Google
// Calendar, el Calendario del iPhone u Outlook (que lo vuelven a leer
// solos cada pocas horas):
//   POST con el JWT del usuario  → { url } con su enlace personal.
//   GET ?u=<user_id>&k=<firma>   → el calendario (eventos, cumpleaños,
//                                  viajes y fechas límite de proyectos).
// La firma es un HMAC del usuario y de `calendarioFeedVersion` (en sus
// datos): pedir un enlace nuevo sube la versión y el anterior deja de
// funcionar, sin tabla de tokens. No caduca por tiempo a propósito: los
// programas de calendario lo leen durante años sin que nadie lo renueve.
// Secreto: CALENDARIO_SECRET. La lógica está en ics.ts (pruebas: ics_test.ts).
//   supabase functions deploy calendario-feed --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { firma, servirFeed, versionDe } from './ics.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const sb = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const SECRETO = Deno.env.get('CALENDARIO_SECRET') || '';
const ESPERA_MS = 8000;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function leerDatos(userId: string) {
    const { data, error } = await sb.from('bitacora').select('data').eq('user_id', userId).abortSignal(AbortSignal.timeout(ESPERA_MS)).maybeSingle();
    if (error) console.error('calendario-feed: no se pudieron leer los datos:', error.code || error.message);
    return { data: data ? (data.data || {}) : null, error };
}
async function tieneAcceso(userId: string) {
    const { data, error } = await sb.rpc('tiene_acceso', { p_user: userId }).abortSignal(AbortSignal.timeout(ESPERA_MS));
    if (error) console.error('calendario-feed: tiene_acceso falló:', error.code || error.message);
    return { data, error };
}

Deno.serve(async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

    if (req.method === 'POST') {
        if (!SECRETO) return json({ error: 'El calendario no está disponible ahora mismo.' }, 503);
        const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
        if (!jwt) return json({ error: 'Sin sesión' }, 401);
        const { data: auth } = await sb.auth.getUser(jwt);
        const user = auth?.user;
        if (!user) return json({ error: 'Sin sesión' }, 401);
        const fila = await leerDatos(user.id).catch(e => ({ data: null, error: e }));
        // Sin leer la versión de verdad se daría un enlace de la versión 0, que puede estar ya anulado.
        if (fila.error) return json({ error: 'No se pudo preparar el enlace. Prueba en un rato.' }, 503);
        return json({ url: `${SUPABASE_URL}/functions/v1/calendario-feed?u=${user.id}&k=${await firma(SECRETO, user.id, versionDe(fila.data))}` });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Método no permitido', { status: 405 });
    const url = new URL(req.url);
    return await servirFeed(url.searchParams.get('u') || '', url.searchParams.get('k') || '', { secreto: SECRETO, leerDatos, tieneAcceso });
});
