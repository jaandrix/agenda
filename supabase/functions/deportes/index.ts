// Edge Function: deportes
//
// Puente con los datos públicos de ESPN (sin clave), que no deja llamarlos
// desde el navegador: busca equipos y devuelve el calendario de partidos
// de un equipo en todas sus competiciones (liga, copa, Champions...).
// Las categorías que ESPN no cubre (Primera Federación: el Real Zaragoza)
// salen de TheSportsDB (clave pública de pruebas), jornada a jornada.
//
//   POST { accion: 'buscar', texto }            → { equipos: [...] }
//   POST { accion: 'calendario', deporte, id }  → { partidos: [...] }
//
// Pide sesión de Bitácora (el token del usuario) para no ser un proxy
// abierto. Se despliega con verificación de JWT (la de siempre).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';

// Ligas en las que se busca: [deporte, liga, nombre].
const LIGAS: [string, string, string][] = [
    ['soccer', 'esp.1', 'LaLiga'], ['soccer', 'esp.2', 'LaLiga 2'], ['soccer', 'eng.1', 'Premier League'], ['soccer', 'ita.1', 'Serie A'],
    ['soccer', 'ger.1', 'Bundesliga'], ['soccer', 'fra.1', 'Ligue 1'], ['soccer', 'por.1', 'Liga Portugal'], ['soccer', 'ned.1', 'Eredivisie'],
    ['soccer', 'usa.1', 'MLS'], ['soccer', 'mex.1', 'Liga MX'], ['soccer', 'arg.1', 'Liga Argentina'], ['soccer', 'esp.w.1', 'Liga F'],
    ['basketball', 'nba', 'NBA'], ['basketball', 'wnba', 'WNBA'],
];

const TSDB = 'https://www.thesportsdb.com/api/v1/json/123';
const norm = (t: unknown) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

let equiposCache: { cuando: number; lista: any[] } | null = null;
async function todosLosEquipos() {
    if (equiposCache && Date.now() - equiposCache.cuando < 12 * 3600e3) return equiposCache.lista;
    const listas = await Promise.all(LIGAS.map(async ([deporte, liga, nombreLiga]) => {
        try {
            const d = await fetch(`${ESPN}/${deporte}/${liga}/teams`).then(r => r.json());
            return (d.sports?.[0]?.leagues?.[0]?.teams || []).map((x: any) => ({
                id: String(x.team.id), deporte, liga, ligaNombre: nombreLiga, nombre: x.team.displayName, corto: x.team.shortDisplayName || x.team.displayName,
                escudo: x.team.logos?.[0]?.href || '', color: x.team.color ? '#' + x.team.color : '',
            }));
        } catch (_) { return []; }
    }));
    equiposCache = { cuando: Date.now(), lista: listas.flat() };
    return equiposCache.lista;
}

async function buscarTsdb(texto: string) {
    const variantes = [texto, /^real\b/i.test(texto) ? '' : 'Real ' + texto].filter(Boolean);
    const vistos = new Set<string>();
    const res: any[] = [];
    for (const v of variantes) {
        try {
            const d = await fetch(`${TSDB}/searchteams.php?t=${encodeURIComponent(v.trim().replace(/\s+/g, '_'))}`).then(r => r.json());
            (d.teams || []).filter((t: any) => t.strSport === 'Soccer' && !/^_/.test(t.strLeague || '')).forEach((t: any) => {
                if (vistos.has(t.idTeam)) return;
                vistos.add(t.idTeam);
                res.push({ id: 'tsdb' + t.idTeam, deporte: 'soccer', liga: 'tsdb', ligaNombre: t.strLeague || '', nombre: t.strTeam, corto: t.strTeamShort || t.strTeam, escudo: t.strBadge || '', color: t.strColour1 || '' });
            });
        } catch (_) { /* sin TheSportsDB */ }
    }
    return res;
}

// La jornada en la que va su liga y las siguientes, con los partidos del
// equipo. La clave pública limita las peticiones por minuto: cada equipo se
// recuerda unas horas y, si se pasa del límite, se devuelve lo que haya.
const tsdbCache = new Map<string, { cuando: number; partidos: any[] }>();
async function calendarioTsdb(id: string) {
    const c = tsdbCache.get(id);
    if (c && Date.now() - c.cuando < 6 * 3600e3) return c.partidos;
    const partidos = await calendarioTsdbSinCache(id);
    if (partidos.length || !c) tsdbCache.set(id, { cuando: Date.now(), partidos });
    return partidos.length ? partidos : (c?.partidos || []);
}

async function calendarioTsdbSinCache(id: string) {
    const prox = await fetch(`${TSDB}/eventsnext.php?id=${id}`).then(r => r.json()).catch(() => ({}));
    const e0 = prox.events?.[0];
    if (!e0) return [];
    const ronda = Number(e0.intRound) || 0;
    const rondas = ronda ? await Promise.all(Array.from({ length: 6 }, (_, k) => fetch(`${TSDB}/eventsround.php?id=${e0.idLeague}&r=${ronda + k}&s=${encodeURIComponent(e0.strSeason)}`).then(r => r.json()).catch(() => ({})))) : [];
    const eventos = [e0, ...rondas.flatMap((d: any) => d.events || [])].filter((e: any) => e.idHomeTeam === id || e.idAwayTeam === id);
    const vistos = new Set<string>();
    const ahora = Date.now() - 3 * 3600e3;
    return eventos.filter((e: any) => !vistos.has(e.idEvent) && vistos.add(e.idEvent)).map((e: any) => {
        const local = e.idHomeTeam === id;
        const cuando = e.strTimestamp ? e.strTimestamp + (/[zZ+]/.test(e.strTimestamp.slice(10)) ? '' : 'Z') : `${e.dateEvent}T${e.strTime || '00:00:00'}Z`;
        return { id: 'tsdb' + e.idEvent, fecha: cuando, horaConfirmada: !!e.strTime && e.strTime !== '00:00:00', local, rival: local ? e.strAwayTeam : e.strHomeTeam, rivalEscudo: (local ? e.strAwayTeamBadge : e.strHomeTeamBadge) || '', competicion: e.strLeague || '', estadio: e.strVenue || '' };
    }).filter((p: any) => new Date(p.fecha).getTime() >= ahora).sort((a: any, b: any) => a.fecha.localeCompare(b.fecha));
}

async function calendario(deporte: string, liga: string, id: string) {
    const ruta = deporte === 'basketball' ? `${ESPN}/basketball/${liga === 'wnba' ? 'wnba' : 'nba'}/teams/${id}/schedule` : `${ESPN}/soccer/all/teams/${id}/schedule?fixture=true`;
    const d = await fetch(ruta).then(r => r.json());
    const ahora = Date.now() - 3 * 3600e3;
    return (d.events || []).map((e: any) => {
        const comp = e.competitions?.[0] || {};
        const equipos = comp.competitors || [];
        const yo = equipos.find((c: any) => String(c.team?.id) === String(id));
        const rival = equipos.find((c: any) => String(c.team?.id) !== String(id));
        return {
            id: String(e.id), fecha: e.date, horaConfirmada: e.timeValid !== false,
            local: yo?.homeAway === 'home', rival: rival?.team?.displayName || '', rivalEscudo: rival?.team?.logos?.[0]?.href || rival?.team?.logo || '',
            competicion: e.league?.name || (deporte === 'basketball' ? (liga === 'wnba' ? 'WNBA' : 'NBA') : ''), estadio: comp.venue?.fullName || '',
        };
    }).filter((p: any) => new Date(p.fecha).getTime() >= ahora).slice(0, 60);
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
    if (demasiadas(user.id, 30)) return json({ error: 'Demasiadas peticiones. Espera un minuto.' }, 429);
    let cuerpo: any;
    try { cuerpo = await req.json(); } catch (_) { return json({ error: 'Petición no válida' }, 400); }
    try {
        if (cuerpo.accion === 'buscar') {
            const q = norm(cuerpo.texto);
            if (q.length < 2) return json({ equipos: [] });
            const lista = await todosLosEquipos();
            const deEspn = lista.filter(e => norm(e.nombre).includes(q) || norm(e.corto).includes(q)).slice(0, 12);
            const nombres = new Set(deEspn.map(e => norm(e.nombre)));
            const deTsdb = (await buscarTsdb(String(cuerpo.texto || ''))).filter(e => !nombres.has(norm(e.nombre)));
            return json({ equipos: [...deEspn, ...deTsdb].slice(0, 14) });
        }
        if (cuerpo.accion === 'calendario') {
            if (String(cuerpo.id || '').startsWith('tsdb')) return json({ partidos: await calendarioTsdb(String(cuerpo.id).slice(4).replace(/[^0-9]/g, '')) });
            const id = String(cuerpo.id || '').replace(/[^0-9]/g, '');
            if (!id) return json({ partidos: [] });
            return json({ partidos: await calendario(cuerpo.deporte === 'basketball' ? 'basketball' : 'soccer', String(cuerpo.liga || ''), id) });
        }
        return json({ error: 'Acción desconocida' }, 400);
    } catch (e) {
        console.error(e);
        return json({ error: 'No se pudo consultar' }, 200);
    }
});
