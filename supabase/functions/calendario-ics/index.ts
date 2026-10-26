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

function ipv4NoPublica(ip: string) {
    const partes = ip.split('.').map(Number);
    if (partes.length !== 4 || partes.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b, c] = partes;
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 0 && c === 0) ||
        (a === 192 && b === 0 && c === 2) || (a === 192 && b === 88 && c === 99) ||
        (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) ||
        (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113);
}

function ipv6NoPublica(ip: string) {
    const valor = ip.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
    const mapeada = valor.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapeada) return ipv4NoPublica(mapeada[1]);
    const mapeadaHex = valor.match(/^(?:::ffff:|(?:0:){5}ffff:)([\da-f]{1,4}):([\da-f]{1,4})$/);
    if (mapeadaHex) {
        const alta = parseInt(mapeadaHex[1], 16); const baja = parseInt(mapeadaHex[2], 16);
        return ipv4NoPublica(`${alta >> 8}.${alta & 255}.${baja >> 8}.${baja & 255}`);
    }
    const primerGrupo = parseInt(valor.split(':')[0] || '0', 16);
    return valor === '::' || valor === '::1' || /^f[cd]/.test(valor) ||
        (primerGrupo >= 0xfe80 && primerGrupo <= 0xfebf) ||
        (primerGrupo >= 0xff00 && primerGrupo <= 0xffff) ||
        valor.startsWith('100:') || valor.startsWith('2001:db8:') || valor.startsWith('3fff:');
}

async function destinoPublico(url: URL) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (privada(host)) return false;
    if (/^\d+(?:\.\d+){3}$/.test(host)) return !ipv4NoPublica(host);
    if (host.includes(':')) return !ipv6NoPublica(host);
    // Si el entorno no deja resolver DNS, se queda la comprobación de antes en vez de bloquear todas las importaciones.
    if (typeof Deno.resolveDns !== 'function') return true;
    try {
        const [a, aaaa] = await Promise.all([
            Deno.resolveDns(host, 'A').catch(() => [] as string[]),
            Deno.resolveDns(host, 'AAAA').catch(() => [] as string[])
        ]);
        return a.length + aaaa.length > 0 && a.every(ip => !ipv4NoPublica(ip)) && aaaa.every(ip => !ipv6NoPublica(ip));
    } catch (_) {
        return false;
    }
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

Deno.serve(async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await sb.auth.getUser(jwt);
    if (!user) return json({ error: 'Sin sesión' }, 401);
    if (demasiadas(user.id, 10)) return json({ error: 'Demasiadas peticiones. Espera un minuto.' }, 429);
    let cuerpo: { url?: string };
    try { cuerpo = await req.json(); } catch (_) { return json({ error: 'Petición no válida' }, 400); }
    let url: URL;
    try { url = new URL(String(cuerpo.url || '').trim().replace(/^webcals?:\/\//i, 'https://')); } catch (_) { return json({ error: 'La dirección no es válida.' }, 400); }
    if (url.protocol !== 'https:' || !(await destinoPublico(url))) return json({ error: 'La dirección tiene que empezar por https:// (o webcal://).' }, 400);
    try {
        // Las redirecciones se siguen a mano y se vuelve a comprobar cada destino: con redirect automático,
        // una web pública podía mandar la petición a una dirección interna y saltarse privada().
        let r: Response | null = null;
        for (let salto = 0; salto < 4; salto++) {
            if (!(await destinoPublico(url))) return json({ error: 'La dirección apunta a una red no permitida.' }, 200);
            r = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Bitacora/1.0 (appbitacora.es)', Accept: 'text/calendar, text/plain, */*' }, signal: AbortSignal.timeout(15000) });
            if (r.status < 300 || r.status >= 400) break;
            const destino = r.headers.get('location');
            if (!destino) break;
            url = new URL(destino, url);
            if (url.protocol !== 'https:' || !(await destinoPublico(url))) return json({ error: 'El calendario redirige a una dirección no permitida.' }, 200);
            r = null;
        }
        if (!r || !r.ok) return json({ error: `La web respondió con un error (${r ? r.status : 'demasiadas redirecciones'}).` }, 200);
        if (Number(r.headers.get('content-length') || 0) > MAX) return json({ error: 'El calendario es demasiado grande.' }, 200);
        const lector = r.body!.getReader(); const trozos: Uint8Array[] = []; let total = 0;
        for (;;) {
            const { done, value } = await lector.read();
            if (done) break;
            total += value.length;
            if (total > MAX) { await lector.cancel(); return json({ error: 'El calendario es demasiado grande.' }, 200); }
            trozos.push(value);
        }
        const unido = new Uint8Array(total); let pos = 0; for (const t of trozos) { unido.set(t, pos); pos += t.length; }
        const texto = new TextDecoder().decode(unido);
        if (!texto.includes('BEGIN:VCALENDAR')) return json({ error: 'Esa dirección no devuelve un calendario .ics.' }, 200);
        return json({ ics: texto });
    } catch (e) {
        console.error(e);
        return json({ error: 'No se pudo descargar el calendario.' }, 200);
    }
});
