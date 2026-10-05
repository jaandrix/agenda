// Edge Function: avisos-diarios
//
// Revisión diaria de lo que merece una notificación push, sin depender de
// que el usuario abra Bitácora ni de Claude: la lanza cada hora pg_cron
// (ver supabase/sql/avisos_diarios.sql) y solo actúa a las 9:00 de Madrid,
// así sigue el cambio de horario sola.
//
// Por usuario con notificaciones activadas: calcula los avisos del día
// con sus datos (bitacora.data), quita los tipos que haya apagado en
// Ajustes (preferenciasAvisos), los ya enviados (avisos_enviados) y manda
// como mucho MAX_DIA, por orden de importancia, a través de send-push.
//
// Se despliega sin verificación de JWT (la llama la base de datos):
//   supabase functions deploy avisos-diarios --no-verify-jwt
// Secreto: AVISOS_SECRET (el mismo que lleva la tarea de pg_cron).
// Para probar sin enviar: POST {"forzar": true, "simular": true}.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const sb = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const ZONA = 'Europe/Madrid';
const MAX_DIA = 3;
const HORA = 9;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const euros = (n: number) => (Math.round(n * 100) / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

function hoyMadrid() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function horaMadrid() {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', hour12: false }).format(new Date()));
}
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
    if (!opciones.forzar && horaMadrid() !== HORA) return json({ omitido: 'fuera de hora' });

    const hoy = hoyMadrid();
    const { data: subs } = await sb.from('push_subscriptions').select('user_id');
    const usuarios = [...new Set((subs || []).map((s: any) => s.user_id))].filter(u => !opciones.user_id || u === opciones.user_id);
    const resumen: any[] = [];

    for (const userId of usuarios) {
        const { data: fila } = await sb.from('bitacora').select('data').eq('user_id', userId).maybeSingle();
        const data = fila?.data || {};
        const prefs = data.preferenciasAvisos || {};
        const haceUnDia = new Date(Date.now() - 20 * 3600e3).toISOString();
        const { count } = await sb.from('conector_bandeja').select('id', { count: 'exact', head: true }).eq('user_id', userId).lt('creado', haceUnDia);
        const candidatos = calcularAvisos(data, hoy, count || 0).filter(a => prefs[a.tipo] !== false);
        const { data: enviados } = candidatos.length
            ? await sb.from('avisos_enviados').select('clave').eq('user_id', userId).in('clave', candidatos.map(a => a.clave))
            : { data: [] };
        const ya = new Set((enviados || []).map((e: any) => e.clave));
        const nuevos = candidatos.filter(a => !ya.has(a.clave)).slice(0, MAX_DIA);
        const hechos: string[] = [];
        for (const a of nuevos) {
            if (opciones.simular) { hechos.push(`${a.titulo} ${a.texto}`); continue; }
            if (await enviar(userId, a)) {
                await sb.from('avisos_enviados').insert({ user_id: userId, clave: a.clave });
                hechos.push(a.clave);
            }
        }
        resumen.push({ usuario: userId.slice(0, 8), candidatos: candidatos.length, ya_enviados: ya.size, [opciones.simular ? 'se_enviarian' : 'enviados']: hechos });
    }
    return json({ hoy, resumen });
});
