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
// funcionar, sin tabla de tokens. Secreto: CALENDARIO_SECRET.
//   supabase functions deploy calendario-feed --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const sb = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const SECRETO = Deno.env.get('CALENDARIO_SECRET') || '';
const ZONA = 'Europe/Madrid';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function firma(userId: string, version: number) {
    const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRETO), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(`${userId}:${version}`)));
    return btoa(String.fromCharCode(...mac)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32);
}

async function datosDe(userId: string) {
    const { data } = await sb.from('bitacora').select('data').eq('user_id', userId).maybeSingle();
    return data?.data || {};
}

// ---- formato .ics (RFC 5545) ----
const esc = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function plegar(linea: string) {
    // Líneas de 75 octetos como mucho; las siguientes empiezan por espacio.
    const bytes = new TextEncoder().encode(linea);
    if (bytes.length <= 75) return linea;
    const partes: string[] = [];
    let actual = '', tam = 0;
    for (const ch of linea) {
        const n = new TextEncoder().encode(ch).length;
        if (tam + n > (partes.length ? 74 : 75)) { partes.push(actual); actual = ''; tam = 0; }
        actual += ch; tam += n;
    }
    partes.push(actual);
    return partes.join('\r\n ');
}
const fechaIcs = (iso: string) => iso.replace(/-/g, '');
const masDias = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const masHora = (hora: string) => { const [h, m] = hora.split(':').map(Number); return `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };

function evento(uid: string, titulo: string, inicio: { date: string; time?: string }, fin?: { date: string; time?: string }, extra: string[] = []) {
    const lineas = ['BEGIN:VEVENT', `UID:${uid}@appbitacora.es`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `SUMMARY:${esc(titulo)}`];
    if (inicio.time) {
        lineas.push(`DTSTART;TZID=${ZONA}:${fechaIcs(inicio.date)}T${inicio.time.replace(':', '')}00`);
        const f = fin?.time ? fin : { date: inicio.date, time: masHora(inicio.time) };
        lineas.push(`DTEND;TZID=${ZONA}:${fechaIcs(f.date)}T${(f.time as string).replace(':', '')}00`);
    } else {
        lineas.push(`DTSTART;VALUE=DATE:${fechaIcs(inicio.date)}`, `DTEND;VALUE=DATE:${fechaIcs(masDias(fin?.date || inicio.date, 1))}`);
    }
    lineas.push(...extra, 'END:VEVENT');
    return lineas.map(plegar).join('\r\n');
}

function calendario(data: any) {
    const esFecha = (s: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
    const esHora = (s: any) => /^\d{1,2}:\d{2}$/.test(String(s || ''));
    const desde = masDias(new Date().toISOString().slice(0, 10), -120);
    const vevents: string[] = [];
    (data.entries || []).forEach((e: any) => {
        if (!e || !e.id) return;
        if (e.type === 'event' && !e.calendarLog && !/^(planner_done_|recurring_done_|weekly_task_done_)/.test(e.id) && esFecha(e.date) && e.date >= desde) {
            const hora = esHora(e.time) ? e.time.padStart(5, '0') : '';
            const extra = [e.place ? `LOCATION:${esc(e.place)}` : '', e.notes ? `DESCRIPTION:${esc(String(e.notes).slice(0, 1500))}` : ''].filter(Boolean);
            vevents.push(evento(e.id, e.title || 'Evento', { date: e.date, time: hora }, hora && esHora(e.endTime) ? { date: e.date, time: e.endTime.padStart(5, '0') } : undefined, extra));
        } else if (e.type === 'birthday' && esFecha(e.birthDate)) {
            vevents.push(evento(e.id, `Cumpleaños de ${e.title}`, { date: e.birthDate }, undefined, ['RRULE:FREQ=YEARLY']));
        } else if (e.type === 'travel' && esFecha(e.startDate) && (e.endDate || e.startDate) >= desde) {
            vevents.push(evento(e.id, `Viaje: ${e.title || e.destination || ''}`.trim(), { date: e.startDate }, { date: esFecha(e.endDate) ? e.endDate : e.startDate }, e.destination ? [`LOCATION:${esc(e.destination)}`] : []));
        } else if (e.type === 'project' && esFecha(e.endDate) && e.endDate >= desde && e.status !== 'Completado') {
            vevents.push(evento(e.id + '_fin', `Fecha límite: ${e.title}`, { date: e.endDate }));
        }
    });
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bitacora//appbitacora.es//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'X-WR-CALNAME:Bitácora', `X-WR-TIMEZONE:${ZONA}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
        ...vevents, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

Deno.serve(async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (!SECRETO) return json({ error: 'Falta configurar CALENDARIO_SECRET' }, 500);

    if (req.method === 'POST') {
        const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
        const { data: { user } } = await sb.auth.getUser(jwt);
        if (!user) return json({ error: 'Sin sesión' }, 401);
        const data = await datosDe(user.id);
        const version = Number(data.calendarioFeedVersion) || 0;
        return json({ url: `${SUPABASE_URL}/functions/v1/calendario-feed?u=${user.id}&k=${await firma(user.id, version)}` });
    }

    const url = new URL(req.url);
    const u = url.searchParams.get('u') || '', k = url.searchParams.get('k') || '';
    if (!/^[0-9a-f-]{36}$/i.test(u) || !k) return new Response('No encontrado', { status: 404 });
    const data = await datosDe(u);
    if (k !== await firma(u, Number(data.calendarioFeedVersion) || 0)) return new Response('Este enlace ya no es válido', { status: 404 });
    const { data: acceso } = await sb.rpc('tiene_acceso', { p_user: u });
    const ics = acceso === false ? calendario({}) : calendario(data);
    return new Response(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'max-age=900', 'Content-Disposition': 'inline; filename="bitacora.ics"' } });
});
