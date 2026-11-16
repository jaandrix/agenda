// Lo que no toca la red de calendario-feed: firma, validación de fechas y el
// .ics. Va aparte para probarlo con `deno test` (ics_test.ts).

export const ZONA = 'Europe/Madrid';

export async function firma(secreto: string, userId: string, version: number) {
    const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(`${userId}:${version}`)));
    return btoa(String.fromCharCode(...mac)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32);
}

// Comparación en tiempo constante: con !== se podía ir adivinando la firma por lo que tardaba en responder.
export function igualSeguro(a: string, b: string) {
    const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
    let dif = x.length ^ y.length;
    for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
    return dif === 0;
}

export const versionDe = (data: any) => { const v = Number(data?.calendarioFeedVersion); return Number.isInteger(v) && v >= 0 ? v : 0; };

// La forma AAAA-MM-DD no basta: 2026-02-31 se convertía en silencio en marzo y 2026-99-99 tiraba el feed entero.
export function esFecha(s: unknown): s is string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''));
    if (!m) return false;
    const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (a < 1900 || a > 2200 || me < 1 || me > 12 || d < 1) return false;
    const f = new Date(Date.UTC(a, me - 1, d));
    return f.getUTCFullYear() === a && f.getUTCMonth() === me - 1 && f.getUTCDate() === d;
}
export function horaNormal(s: unknown): string {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
    if (!m) return '';
    const h = Number(m[1]), mi = Number(m[2]);
    if (h > 23 || mi > 59) return '';
    return `${String(h).padStart(2, '0')}:${m[2]}`;
}

const esc = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n|\r/g, '\\n');
const uidLimpio = (s: unknown) => String(s ?? '').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 120) || 'sin-id';
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
export const masDias = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const deMinutos = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

type Momento = { date: string; time?: string };
export function evento(uid: string, titulo: string, inicio: Momento, fin?: Momento, extra: string[] = [], ahora = new Date()) {
    const lineas = ['BEGIN:VEVENT', `UID:${uidLimpio(uid)}@appbitacora.es`, `DTSTAMP:${ahora.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `SUMMARY:${esc(titulo)}`];
    if (inicio.time) {
        // Un final que no llega después del inicio (o sin final) pasa a una hora más, sin salirse del día.
        let finHora = fin?.time && fin.date === inicio.date && minutos(fin.time) > minutos(inicio.time) ? fin.time : '';
        if (!finHora) finHora = deMinutos(Math.min(minutos(inicio.time) + 60, 23 * 60 + 59));
        if (finHora === inicio.time) finHora = '';
        lineas.push(`DTSTART;TZID=${ZONA}:${fechaIcs(inicio.date)}T${inicio.time.replace(':', '')}00`);
        if (finHora) lineas.push(`DTEND;TZID=${ZONA}:${fechaIcs(inicio.date)}T${finHora.replace(':', '')}00`);
    } else {
        const ultimo = fin?.date && fin.date >= inicio.date ? fin.date : inicio.date;
        lineas.push(`DTSTART;VALUE=DATE:${fechaIcs(inicio.date)}`, `DTEND;VALUE=DATE:${fechaIcs(masDias(ultimo, 1))}`);
    }
    lineas.push(...extra, 'END:VEVENT');
    return lineas.map(plegar).join('\r\n');
}

export function calendario(data: any, hoy = new Date().toISOString().slice(0, 10)) {
    const desde = masDias(hoy, -120);
    const vevents: string[] = [];
    for (const e of Array.isArray(data?.entries) ? data.entries : []) {
        // Un elemento raro se salta; nunca tira el calendario entero.
        try {
            if (!e || typeof e !== 'object' || !e.id) continue;
            if (e.type === 'event' && !e.calendarLog && !/^(planner_done_|recurring_done_|weekly_task_done_)/.test(String(e.id)) && esFecha(e.date) && e.date >= desde) {
                const hora = horaNormal(e.time);
                const fin = hora ? horaNormal(e.endTime) : '';
                const extra = [e.place ? `LOCATION:${esc(String(e.place))}` : '', e.notes ? `DESCRIPTION:${esc(String(e.notes).slice(0, 1500))}` : ''].filter(Boolean);
                vevents.push(evento(e.id, String(e.title || 'Evento'), { date: e.date, time: hora }, fin ? { date: e.date, time: fin } : undefined, extra));
            } else if (e.type === 'birthday' && esFecha(e.birthDate)) {
                vevents.push(evento(e.id, `Cumpleaños de ${e.title || ''}`.trim(), { date: e.birthDate }, undefined, ['RRULE:FREQ=YEARLY']));
            } else if (e.type === 'travel' && esFecha(e.startDate)) {
                const fin = esFecha(e.endDate) && e.endDate >= e.startDate ? e.endDate : e.startDate;
                if (fin < desde) continue;
                vevents.push(evento(e.id, `Viaje: ${e.title || e.destination || ''}`.trim(), { date: e.startDate }, { date: fin }, e.destination ? [`LOCATION:${esc(String(e.destination))}`] : []));
            } else if (e.type === 'project' && esFecha(e.endDate) && e.endDate >= desde && e.status !== 'Completado') {
                vevents.push(evento(e.id + '_fin', `Fecha límite: ${e.title || ''}`.trim(), { date: e.endDate }));
            }
        } catch (_) { /* se salta */ }
    }
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bitacora//appbitacora.es//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'X-WR-CALNAME:Bitácora', `X-WR-TIMEZONE:${ZONA}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
        ...vevents, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

export type Lectura = { data: any; error: unknown };
export type Dependencias = {
    secreto: string;
    leerDatos: (uid: string) => Promise<Lectura>;
    tieneAcceso: (uid: string) => Promise<Lectura>;
};

const cabecerasIcs = { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'max-age=900', 'Content-Disposition': 'inline; filename="bitacora.ics"' };
const texto = (cuerpo: string, status: number, extra: Record<string, string> = {}) => new Response(cuerpo, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });

// GET ?u=&k=. Falla cerrado: solo se entregan datos si la firma es buena y tiene_acceso dice exactamente true.
export async function servirFeed(u: string, k: string, dep: Dependencias): Promise<Response> {
    if (!dep.secreto) return texto('No disponible', 503);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u) || !/^[A-Za-z0-9_-]{32}$/.test(k)) return texto('No encontrado', 404);
    let fila: Lectura, acceso: Lectura;
    try { fila = await dep.leerDatos(u); } catch (_) { return texto('No disponible ahora mismo', 503, { 'Retry-After': '600' }); }
    if (fila.error) return texto('No disponible ahora mismo', 503, { 'Retry-After': '600' });
    if (!fila.data) return texto('No encontrado', 404);
    if (!igualSeguro(k, await firma(dep.secreto, u, versionDe(fila.data)))) return texto('Este enlace ya no es válido', 404);
    try { acceso = await dep.tieneAcceso(u); } catch (_) { return texto('No disponible ahora mismo', 503, { 'Retry-After': '600' }); }
    if (acceso.error || (acceso.data !== true && acceso.data !== false)) return texto('No disponible ahora mismo', 503, { 'Retry-After': '600' });
    // Sin acceso (prueba terminada...) el calendario sale vacío y no da error: así la suscripción sigue viva si vuelve a pagar.
    return new Response(calendario(acceso.data === true ? fila.data : {}), { headers: cabecerasIcs });
}
