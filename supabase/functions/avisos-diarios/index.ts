// Edge Function: avisos-diarios
//
// Avisos push que no dependen de que el usuario abra Bitácora ni de Claude.
// La lanza pg_cron cada 5 minutos (ver supabase/sql/avisos_diarios.sql):
// - El resumen del día, a las 9:00 de Madrid (así sigue el cambio de
//   horario sola), una sola vez al día aunque haya varias pasadas en esa hora.
// - Los eventos con hora, una hora antes de que empiecen (salvo que el
//   evento tenga sinAviso o el usuario haya apagado el tipo "eventos").
// - El domingo a las 20:00, la semana que viene (tipo "semana"): eventos,
//   exámenes, entregas, cumpleaños y cargos. Abre la app en /?semana.
//
// Por usuario con notificaciones activadas: calcula los avisos del día
// con sus datos (bitacora.data), quita los tipos que haya apagado en
// Ajustes (preferenciasAvisos), los ya enviados (avisos_enviados) y manda
// como mucho MAX_DIA, por orden de importancia, a través de send-push.
//
// Se despliega sin verificación de JWT (la llama la base de datos):
//   supabase functions deploy avisos-diarios --no-verify-jwt
// Secreto: AVISOS_SECRET (el mismo que lleva la tarea de pg_cron).
// Para probar sin enviar: POST {"forzar": true, "simular": true} (y "forzarSemana": true para el de la semana)
// ("forzar" lanza el resumen del día aunque no sean las 9:00).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const sb = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const ZONA = 'Europe/Madrid';
const MAX_DIA = 3;
const HORA = 9;
// A las 19:00, el aviso de fin de la prueba (3 días antes y el último día) y el de volver (4 días sin entrar).
const HORA_TARDE = 19;
const CORTE_PAGO = '2026-09-15T00:00:00Z';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const euros = (n: number) => (Math.round(n * 100) / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

function hoyMadrid() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function horaMadrid() {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', hour12: false }).format(new Date()));
}
// Minutos desde ahora hasta una fecha y hora de Madrid. Las dos se tratan
// como horas "de pared" de Madrid, así no hace falta conocer su desfase.
function minutosHasta(fecha: string, hora: string) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()).map(x => [x.type, x.value]));
    const ahora = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
    const [h, m] = hora.split(':').map(Number);
    const [y, mo, d] = fecha.split('-').map(Number);
    return Math.round((Date.UTC(y, mo - 1, d, h, m) - ahora) / 60000);
}
const ANTELACION = 60;
function sumarDias(iso: string, n: number) {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
function diasEntre(desde: string, hasta: string) {
    return Math.round((new Date(hasta + 'T12:00:00Z').getTime() - new Date(desde + 'T12:00:00Z').getTime()) / 86400000);
}
function fechaCorta(iso: string) {
    return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z')).replace('.', '');
}
const minus = (t: unknown) => String(t || '').trim().toLowerCase().replace(/[.\s]+$/, '');
// Título en el estilo de la app: minúscula y un solo punto final, aunque el
// nombre ya traiga el suyo ("Logística." no debe dar "logística..").
const titulo = (t: unknown) => minus(t) + '.';

interface Aviso { clave: string; tipo: string; prioridad: number; titulo: string; texto: string; url?: string }

// Misma regla que la app (financeProEsAuto / financeProCicloMes): un cargo
// automático sin conciliar no cuenta como "llegado al banco".
const esAuto = (t: any) => !!((t.recurringEntryId || t.programadoId) && !t.conciliado);
const cicloMes = (t: any) => t.cicloMes || String(t.date || '').slice(0, 7);

function calcularAvisos(data: any, hoy: string, pendientesBandeja: number): Aviso[] {
    const avisos: Aviso[] = [];
    const entries = (data.entries || []).filter(Boolean);
    const txs = data.financePro?.transactions || [];
    const mes = hoy.slice(0, 7);
    const diaHoy = Number(hoy.slice(8));
    const manana = sumarDias(hoy, 1);

    entries.filter((e: any) => (e.type === 'subscription' || e.type === 'fixed_expense') && e.vigilar && e.active !== false).forEach((e: any) => {
        const [y, m] = mes.split('-').map(Number);
        const dia = Math.min(Number(e.renewalDay) || 1, new Date(Date.UTC(y, m, 0)).getUTCDate());
        if (diaHoy < dia + 3) return;
        const llegado = txs.some((t: any) => t.recurringEntryId === e.id && cicloMes(t) === mes && !esAuto(t));
        if (llegado) return;
        avisos.push({ clave: `aportacion:${e.id}:${mes}`, tipo: 'aportaciones', prioridad: 1, titulo: titulo(e.title), texto: `El cargo de ${euros(Number(e.amount) || 0)} del día ${dia} todavía no aparece en el banco. Importa el extracto para confirmarlo.`, url: '/' });
    });

    entries.filter((e: any) => e.type === 'document' && e.date).forEach((e: any) => {
        const d = diasEntre(hoy, e.date);
        if (![30, 7, 1, 0].includes(d)) return;
        avisos.push({ clave: `documento:${e.id}:${d}`, tipo: 'documentos', prioridad: d <= 1 ? 2 : 6, titulo: titulo(e.title), texto: d === 0 ? 'Caduca hoy.' : d === 1 ? 'Caduca mañana.' : `Caduca en ${d} días, el ${fechaCorta(e.date)}.` });
    });

    (data.studies?.subjects || []).forEach((s: any) => {
        (s.exams || []).forEach((x: any) => {
            if (x?.date === hoy) avisos.push({ clave: `examen:${x.id}:${hoy}`, tipo: 'estudios', prioridad: 2, titulo: titulo('examen de ' + s.name), texto: `Hoy: «${x.title || 'examen'}»${x.time ? ' a las ' + x.time : ''}. Mucha suerte.` });
            if (x?.date === manana) avisos.push({ clave: `examen-manana:${x.id}:${manana}`, tipo: 'estudios', prioridad: 4, titulo: titulo('examen de ' + s.name), texto: `Mañana: «${x.title || 'examen'}»${x.time ? ' a las ' + x.time : ''}.` });
        });
        (s.assignments || []).forEach((x: any) => {
            if (x?.date === hoy && !x.done) avisos.push({ clave: `entrega:${x.id}:${hoy}`, tipo: 'estudios', prioridad: 2, titulo: titulo('entrega de ' + s.name), texto: `«${x.title || 'trabajo'}» se entrega hoy.` });
        });
    });

    txs.filter((t: any) => t?.type === 'income' && t.pendiente && t.date).forEach((t: any) => {
        const d = diasEntre(t.date, hoy);
        if (d < 7) return;
        avisos.push({ clave: `reembolso:${t.id}`, tipo: 'reembolsos', prioridad: 3, titulo: 'reembolso pendiente.', texto: `${t.bankNote || t.note || 'Un ingreso'} (${euros(Number(t.amount) || 0)}) lleva ${d} días pendiente.` });
    });

    entries.filter((e: any) => e.type === 'birthday' && e.birthDate).forEach((e: any) => {
        const md = String(e.birthDate).slice(5);
        if (md === hoy.slice(5)) avisos.push({ clave: `cumple:${e.id}:${hoy}`, tipo: 'cumpleanos', prioridad: 3, titulo: 'cumpleaños.', texto: `Hoy es el cumpleaños de ${e.title}.` });
        if (md === manana.slice(5)) avisos.push({ clave: `cumple-manana:${e.id}:${manana}`, tipo: 'cumpleanos', prioridad: 5, titulo: 'cumpleaños.', texto: `Mañana es el cumpleaños de ${e.title}.` });
    });

    // El ritmo lo calcula la app y lo deja en analisisIA: solo se usa si es
    // reciente, y avisa como mucho una vez por quincena.
    const r = data.analisisIA?.ritmo;
    const reciente = data.analisisIA?.actualizado && diasEntre(String(data.analisisIA.actualizado).slice(0, 10), hoy) <= 3;
    if (reciente && r?.nivel === 'muy' && diaHoy >= 7) {
        avisos.push({ clave: `ritmo:${mes}:${diaHoy <= 15 ? 1 : 2}`, tipo: 'ritmo', prioridad: 7, titulo: 'ritmo de gasto.', texto: `Llevas ${r.llevas} de gasto del día a día; a estas alturas lo normal en ti es ${r.normalHoy}.` });
    }

    if (pendientesBandeja > 0) {
        avisos.push({ clave: `bandeja:${hoy}`, tipo: 'bandeja', prioridad: 8, titulo: 'bandeja.', texto: `Tienes ${pendientesBandeja} ${pendientesBandeja === 1 ? 'cambio' : 'cambios'} de Claude esperando tu validación.` });
    }

    return avisos.sort((a, b) => a.prioridad - b.prioridad);
}

// Eventos que empiezan dentro de la próxima hora. Con pasadas cada 5
// minutos, el aviso llega entre 55 y 60 minutos antes; la clave lleva la
// fecha y la hora, así si el evento se mueve se vuelve a avisar.
function avisosEventos(data: any): Aviso[] {
    return (data.entries || []).filter((e: any) => e?.type === 'event' && !e.calendarLog && !/^(weekly_task_done_|planner_done_|recurring_done_)/.test(e.id || '') && !e.sinAviso && /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') && /^\d{1,2}:\d{2}$/.test(e.time || ''))
        .map((e: any) => ({ e, m: minutosHasta(e.date, e.time) }))
        .filter(({ m }: any) => m > 0 && m <= ANTELACION)
        .map(({ e, m }: any) => ({
            clave: `evento:${e.id}:${e.date}T${e.time}`, tipo: 'eventos', prioridad: 0, titulo: titulo(e.title),
            texto: `Empieza ${m >= 55 ? 'en una hora' : `en ${m} minutos`}, a las ${e.time}${e.place ? `, ${e.place}` : ''}.`, url: '/',
        }));
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const diaSemana = (iso: string) => DIAS_SEMANA[new Date(iso + 'T12:00:00Z').getUTCDay()];

// La semana que empieza mañana, en una frase.
function avisoSemana(data: any, hoy: string): Aviso | null {
    const desde = sumarDias(hoy, 1), hasta = sumarDias(hoy, 7);
    const dentro = (f: string) => f >= desde && f <= hasta;
    const entries = (data.entries || []).filter(Boolean);
    const eventos = entries.filter((e: any) => e.type === 'event' && !e.calendarLog && !/^(weekly_task_done_|planner_done_|recurring_done_)/.test(e.id || '') && dentro(String(e.date || '')));
    const examenes: string[] = [], entregas: string[] = [];
    (data.studies?.subjects || []).forEach((sub: any) => {
        (sub.exams || []).forEach((x: any) => { if (x?.date && dentro(x.date)) examenes.push(`examen de ${minus(sub.name)} el ${diaSemana(x.date)}`); });
        (sub.assignments || []).forEach((x: any) => { if (x?.date && dentro(x.date) && !x.done) entregas.push(`entrega de ${minus(sub.name)} el ${diaSemana(x.date)}`); });
    });
    const cumples: string[] = [];
    entries.filter((e: any) => e.type === 'birthday' && e.birthDate).forEach((e: any) => {
        for (let k = 1; k <= 7; k++) { const f = sumarDias(hoy, k); if (f.slice(5) === String(e.birthDate).slice(5)) cumples.push(`cumple de ${e.title} el ${diaSemana(f)}`); }
    });
    let cargos = 0, totalCargos = 0;
    entries.filter((e: any) => (e.type === 'subscription' || e.type === 'fixed_expense') && e.active !== false && Number(e.amount) > 0).forEach((e: any) => {
        for (let k = 1; k <= 7; k++) {
            const f = sumarDias(hoy, k);
            const [y, m] = f.split('-').map(Number);
            const dia = Math.min(Number(e.renewalDay) || 1, new Date(Date.UTC(y, m, 0)).getUTCDate());
            if (Number(f.slice(8)) === dia) { cargos++; totalCargos += Number(e.amount); }
        }
    });
    const partes = [
        eventos.length ? `${eventos.length} ${eventos.length === 1 ? 'evento' : 'eventos'}` : '',
        ...examenes.slice(0, 2), ...entregas.slice(0, 2), ...cumples.slice(0, 2),
        cargos ? `${cargos} ${cargos === 1 ? 'cargo' : 'cargos'} (${euros(totalCargos)})` : '',
    ].filter(Boolean);
    if (!partes.length) return null;
    const frase = partes.length > 1 ? partes.slice(0, -1).join(', ') + ' y ' + partes[partes.length - 1] : partes[0];
    return { clave: `semana:${hoy}`, tipo: 'semana', prioridad: 1, titulo: 'tu semana.', texto: frase.charAt(0).toUpperCase() + frase.slice(1) + '.', url: '/?semana' };
}

function cuentaPropia(data: any) {
    const propio = (x: any) => !(x?.ejemplo === true || String(x?.id || '').includes('ejemplo_'));
    const ent = (data.entries || []).filter(propio);
    return {
        planes: ent.filter((e: any) => e.type === 'event' && !/^(planner_done_|recurring_done_|weekly_task_done_)/.test(e.id || '') && !e.calendarLog && !e.linkedItemId).length,
        hechas: ent.filter((e: any) => /^(planner_done_|recurring_done_)/.test(e.id || '')).length,
        movs: (data.financePro?.transactions || []).filter((t: any) => propio(t) && t.category).length,
    };
}

// Fin de la prueba: solo cuentas en prueba (sin fila de suscripción), 3 días antes y el último día.
async function avisoFinPrueba(userId: string, data: any): Promise<Aviso | null> {
    const { data: u } = await sb.auth.admin.getUserById(userId);
    const alta = u?.user?.created_at;
    if (!alta || alta < CORTE_PAGO) return null;
    const { data: sub } = await sb.from('suscripciones').select('estado').eq('user_id', userId).maybeSingle();
    if (sub) return null;
    const { data: inv } = await sb.from('invitaciones').select('invitado').eq('invitado', userId).maybeSingle();
    const total = inv ? 30 : 14;
    const quedan = Math.ceil((new Date(alta).getTime() + total * 864e5 - Date.now()) / 864e5);
    if (quedan !== 3 && quedan !== 1) return null;
    const c = cuentaPropia(data);
    const partes = [c.planes ? `${c.planes} planes` : '', c.hechas ? `${c.hechas} tareas hechas` : '', c.movs ? `${c.movs} gastos ordenados` : ''].filter(Boolean);
    const llevas = partes.length ? `Llevas ${partes.length > 1 ? partes.slice(0, -1).join(', ') + ' y ' + partes[partes.length - 1] : partes[0]} en Bitácora. ` : '';
    return { clave: `finprueba:${quedan}`, tipo: 'finprueba', prioridad: 0, titulo: quedan === 1 ? 'tu prueba termina mañana.' : 'tu prueba termina en 3 días.', texto: `${llevas}Nada se borra; mira cómo seguir.`, url: '/?finprueba' };
}

// Volver: tras 4 días sin abrir la app, uno por semana como mucho, con algo suyo si lo hay.
async function avisoVolver(userId: string, data: any, hoy: string): Promise<Aviso | null> {
    const { data: act } = await sb.from('actividad').select('ultima_vez').eq('user_id', userId).maybeSingle();
    if (!act || Date.now() - new Date(act.ultima_vez).getTime() < 4 * 864e5) return null;
    const semana = sumarDias(hoy, -((new Date(hoy + 'T12:00:00Z').getUTCDay() + 6) % 7));
    const manana = sumarDias(hoy, 1);
    const propio = (x: any) => !(x?.ejemplo === true || String(x?.id || '').includes('ejemplo_'));
    const deManana = (data.entries || []).filter((e: any) => propio(e) && e.type === 'event' && e.date === manana && !e.calendarLog);
    let texto = '';
    if (deManana.length) texto = `Mañana tienes «${minus(deManana[0].title)}»${deManana.length > 1 ? ` y ${deManana.length - 1} ${deManana.length === 2 ? 'cosa' : 'cosas'} más` : ''}. Échale un ojo a tu día.`;
    else {
        const cumple = (data.entries || []).filter((e: any) => propio(e) && e.type === 'birthday' && e.birthDate).map((e: any) => ({ e, d: [0, 1, 2, 3, 4, 5, 6, 7].find(k => sumarDias(hoy, k).slice(5) === String(e.birthDate).slice(5)) })).find((x: any) => x.d !== undefined);
        if (cumple) texto = cumple.d === 0 ? `Hoy es el cumpleaños de ${cumple.e.title}.` : `El cumpleaños de ${cumple.e.title} es en ${cumple.d} ${cumple.d === 1 ? 'día' : 'días'}. ¿Le apuntas el regalo?`;
    }
    if (!texto) texto = 'Vuelve a Bitácora: apunta lo que tengas esta semana y deja la cabeza libre.';
    return { clave: `volver:${semana}`, tipo: 'volver', prioridad: 0, titulo: 'bitácora.', texto, url: '/' };
}

async function enviar(userId: string, a: Aviso) {
    const res = await fetch(SUPABASE_URL + '/functions/v1/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': Deno.env.get('INTERNAL_PUSH_SECRET') || '' },
        body: JSON.stringify({ user_id: userId, title: a.titulo, body: a.texto, url: a.url || '/', tag: a.clave }),
    });
    const r = await res.json().catch(() => ({}));
    return res.ok && r.sent > 0;
}

Deno.serve(async (req) => {
    const secreto = Deno.env.get('AVISOS_SECRET');
    if (!secreto || req.headers.get('x-internal-secret') !== secreto) return json({ error: 'No autorizado' }, 401);
    const opciones = await req.json().catch(() => ({}));
    const tocaResumen = opciones.forzar || horaMadrid() === HORA;
    const hoy = hoyMadrid();
    const tocaSemana = opciones.forzarSemana || (new Date(hoy + 'T12:00:00Z').getUTCDay() === 0 && horaMadrid() === 20);
    const tocaTarde = opciones.forzarTarde || horaMadrid() === HORA_TARDE;
    const { data: subs } = await sb.from('push_subscriptions').select('user_id');
    const usuarios = [...new Set((subs || []).map((s: any) => s.user_id))].filter(u => !opciones.user_id || u === opciones.user_id);
    const resumen: any[] = [];

    for (const userId of usuarios) {
        // Sin acceso (prueba terminada, suscripción cancelada...) no hay avisos.
        const { data: acceso } = await sb.rpc('tiene_acceso', { p_user: userId });
        if (!acceso) continue;
        const { data: fila } = await sb.from('bitacora').select('data').eq('user_id', userId).maybeSingle();
        const data = fila?.data || {};
        const prefs = data.preferenciasAvisos || {};
        const eventos = prefs.eventos === false ? [] : avisosEventos(data);
        const semanal = tocaSemana && prefs.semana !== false ? [avisoSemana(data, hoy)].filter(Boolean) as Aviso[] : [];
        // El resumen del día va una sola vez: su propia clave marca que ya
        // se hizo, aunque la hora de las 9 tenga varias pasadas.
        const claveResumen = `resumen:${hoy}`;
        let diarios: Aviso[] = [];
        if (tocaResumen) {
            const haceUnDia = new Date(Date.now() - 20 * 3600e3).toISOString();
            const { count } = await sb.from('conector_bandeja').select('id', { count: 'exact', head: true }).eq('user_id', userId).lt('creado', haceUnDia);
            // Quien en Ajustes eligió el perfil "trabajador" no ve Estudios:
            // tampoco recibe sus avisos de exámenes y entregas.
            const sinEstudios = data.apartadosConfig?.perfil === 'trabajador';
            diarios = calcularAvisos(data, hoy, count || 0).filter(a => prefs[a.tipo] !== false && !(sinEstudios && a.tipo === 'estudios'));
        }
        const tarde: Aviso[] = [];
        if (tocaTarde) {
            const fin = prefs.finprueba === false ? null : await avisoFinPrueba(userId, data);
            if (fin) tarde.push(fin);
            const volver = prefs.volver === false ? null : await avisoVolver(userId, data, hoy);
            if (volver) tarde.push(volver);
        }
        const claves = [...eventos, ...semanal, ...diarios, ...tarde].map(a => a.clave);
        if (tocaResumen) claves.push(claveResumen);
        if (!claves.length) continue;
        const { data: enviados } = await sb.from('avisos_enviados').select('clave').eq('user_id', userId).in('clave', claves);
        const ya = new Set((enviados || []).map((e: any) => e.clave));
        const resumenHecho = ya.has(claveResumen) && !opciones.forzar;
        const nuevos = [...tarde.filter(a => !ya.has(a.clave)), ...eventos.filter(a => !ya.has(a.clave)), ...semanal.filter(a => !ya.has(a.clave) || opciones.forzarSemana), ...(resumenHecho ? [] : diarios.filter(a => !ya.has(a.clave)).slice(0, MAX_DIA))];
        if (tocaResumen && !resumenHecho && !opciones.simular) await sb.from('avisos_enviados').upsert({ user_id: userId, clave: claveResumen });
        const hechos: string[] = [];
        for (const a of nuevos) {
            if (opciones.simular) { hechos.push(`${a.titulo} ${a.texto}`); continue; }
            if (await enviar(userId, a)) {
                await sb.from('avisos_enviados').insert({ user_id: userId, clave: a.clave });
                hechos.push(a.clave);
            }
        }
        resumen.push({ usuario: userId.slice(0, 8), eventos: eventos.length, semana: semanal.length, diarios: diarios.length, ya_enviados: ya.size, [opciones.simular ? 'se_enviarian' : 'enviados']: hechos });
    }
    return json({ hoy, resumen });
});
