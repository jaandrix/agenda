// Edge Function: transporte
//
// Tiempos de llegada del bus urbano de Zaragoza para el apartado «transporte.». Recibe { poste: '688' } con el JWT
// del usuario y devuelve { tiempos: [{ linea, destino, minutos, texto }] } (minutos 0 = en la parada, null = sin
// estimación). Lee la página de tiempos de Avanza, la empresa del bus: es la que enlaza el propio Ayuntamiento en
// sus datos abiertos, y su servicio de tiempo real (poste-autobus/tuzsa-N) lleva tiempo sin responder. Avanza no
// deja leerla desde el navegador (sin CORS), por eso va aquí.
//   supabase functions deploy transporte --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Tiempo = { linea: string; destino: string; minutos: number | null; texto: string };

function limpiar(s: string) {
    return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

// Cada llegada es una fila con celdas class="digital": línea, destino, minutos («En la parada.», «12 minutos.»,
// «Sin estimacion.»), accesible y una vacía.
function leerTiempos(html: string): Tiempo[] {
    const out: Tiempo[] = [];
    for (const fila of html.split(/<tr[\s>]/i).slice(1)) {
        const celdas = [...fila.matchAll(/<td[^>]*class="digital"[^>]*>([\s\S]*?)<\/td>/gi)].map(m => limpiar(m[1]));
        if (celdas.length < 3 || !celdas[0]) continue;
        const texto = celdas[2];
        const n = texto.match(/(\d+)\s*min/i);
        const minutos = /en la parada/i.test(texto) ? 0 : n ? Number(n[1]) : null;
        out.push({ linea: celdas[0], destino: celdas[1], minutos, texto });
    }
    return out;
}

// Límite por usuario y minuto, en la memoria de cada instancia (como en portadas).
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
    if (demasiadas(user.id, 120)) return json({ error: 'Demasiadas peticiones. Espera un minuto.' }, 429);
    let cuerpo: { poste?: string };
    try { cuerpo = await req.json(); } catch (_) { return json({ error: 'Petición no válida' }, 400); }
    const poste = String(cuerpo.poste || '').trim();
    if (!/^\d{1,5}$/.test(poste)) return json({ error: 'Poste no válido' }, 400);
    try {
        const r = await fetch(`https://zaragoza-pasobus.avanzagrupo.com/frm_esquemaparadatime.php?poste=${poste}`, {
            headers: { 'User-Agent': 'Bitacora/1.0 (appbitacora.es)' },
            signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) return json({ tiempos: [], error: 'El servicio de Avanza no responde' });
        // Avanza sirve ISO-8859-1 (lo dice su cabecera) y r.text() siempre lee UTF-8: «JESÚS» llegaba como «JES�S».
        // Se prueba UTF-8 estricto por si algún día cambia y, si no cuadra, Windows-1252.
        const bytes = new Uint8Array(await r.arrayBuffer());
        let html: string;
        try { html = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (_) { html = new TextDecoder('windows-1252').decode(bytes); }
        return json({ tiempos: leerTiempos(html), fuente: 'Avanza' });
    } catch (e) {
        console.error(e);
        return json({ tiempos: [], error: 'El servicio de Avanza no responde' });
    }
});
