// Edge Function: calendario-ics
//
// Descarga un calendario .ics desde una dirección pública (la dirección
// iCal secreta de Google Calendar, el calendario de un equipo, de la
// universidad...) y devuelve su texto, para que la app lo importe. Va en
// el servidor porque casi ninguna de esas webs permite leerlas desde el
// navegador (CORS). Solo https, como mucho 3 MB y 15 segundos.
//   supabase functions deploy calendario-ics --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const MAX = 3 * 1024 * 1024;

// Nada de direcciones internas: la función no debe servir para mirar
// dentro de la red de Supabase.
function privada(host: string) {
    return /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$)/i.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith('.internal') || host.endsWith('.local');
}

Deno.serve(async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await sb.auth.getUser(jwt);
    if (!user) return json({ error: 'Sin sesión' }, 401);
    let cuerpo: { url?: string };
    try { cuerpo = await req.json(); } catch (_) { return json({ error: 'Petición no válida' }, 400); }
    let url: URL;
    try { url = new URL(String(cuerpo.url || '').trim().replace(/^webcals?:\/\//i, 'https://')); } catch (_) { return json({ error: 'La dirección no es válida.' }, 400); }
    if (url.protocol !== 'https:' || privada(url.hostname)) return json({ error: 'La dirección tiene que empezar por https:// (o webcal://).' }, 400);
    try {
        const r = await fetch(url, { headers: { 'User-Agent': 'Bitacora/1.0 (appbitacora.es)', Accept: 'text/calendar, text/plain, */*' }, signal: AbortSignal.timeout(15000) });
        if (!r.ok) return json({ error: `La web respondió con un error (${r.status}).` }, 200);
        const texto = await r.text();
        if (texto.length > MAX) return json({ error: 'El calendario es demasiado grande.' }, 200);
        if (!texto.includes('BEGIN:VCALENDAR')) return json({ error: 'Esa dirección no devuelve un calendario .ics.' }, 200);
        return json({ ics: texto });
    } catch (e) {
        console.error(e);
        return json({ error: 'No se pudo descargar el calendario.' }, 200);
    }
});
