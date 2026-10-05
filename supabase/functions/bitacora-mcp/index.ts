// Edge Function: bitacora-mcp
//
// Conector de Bitácora para Claude y ChatGPT (servidor MCP por HTTP). El
// usuario crea en Ajustes un enlace personal
//   https://<proyecto>.supabase.co/functions/v1/bitacora-mcp/<token>
// y lo añade como conector en Claude o ChatGPT; desde allí puede preguntar
// por su agenda, sus finanzas o cualquier apartado, y pedir que se apunten
// cosas. Usa la suscripción de Claude/ChatGPT del propio usuario: aquí no
// se llama a ninguna IA.
//
// El token va en la ruta porque los conectores personalizados no mandan la
// sesión de Supabase; solo se guarda su SHA-256 (conector_tokens). Se
// despliega SIN verificación de JWT:
//   supabase functions deploy bitacora-mcp --no-verify-jwt
//
// Las escrituras no tocan bitacora.data: van a conector_bandeja y la app
// las incorpora (ver conector_ia.sql). Las lecturas sí tienen en cuenta lo
// que aún está en la bandeja, para que "apúntalo" seguido de "¿qué tengo
// el martes?" ya lo incluya.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const sbAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const ZONA = 'Europe/Madrid';
const PROTOCOLO = '2025-06-18';

const EVENTO_TIPOS = ['social', 'teatro', 'cine', 'concierto', 'deportes', 'futbol', 'baloncesto', 'f1', 'motogp', 'estudios', 'hogar', 'otro'];
const CUENTAS = ['efectivo', 'bancos', 'online'];

const INSTRUCCIONES = `Bitácora es la agenda personal del usuario: calendario, planificador del día, finanzas, estudios, hábitos, esfuerzo diario, notas, viajes, coleccionables, ocio y objetivos. Las fechas van en formato AAAA-MM-DD y la zona horaria es Europe/Madrid; usa "hoy" de la herramienta agenda si dudas del día. Responde en el idioma del usuario. Antes de apuntar algo con datos ambiguos (fecha, importe, cuenta), pregunta. Para editar, completar, mover o borrar algo, busca primero su id con agenda, movimientos o buscar; antes de borrar, confirma siempre con el usuario. Crear o editar eventos, añadir entradas con QR y los cambios en Ocio se aplican solos. Todo lo demás (tareas, movimientos, extractos, notas, hábitos y esfuerzo, y cualquier borrado) queda en la bandeja de Bitácora hasta que el usuario lo valide: díselo así, sin dar el cambio por hecho. Todo queda en un historial donde el usuario puede deshacerlo.`;
const PENDIENTE = ' Queda en la bandeja de Bitácora hasta que el usuario lo valide.';
const OCIO_TIPOS: Record<string, string> = { libro: 'book', pelicula: 'movie', serie: 'series', videojuego: 'game' };

// ---------------------------------------------------------------- fechas
function hoyISO(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function sumarDias(iso: string, n: number): string {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
function diaSemana(iso: string): string {
    return new Intl.DateTimeFormat('es-ES', { weekday: 'long', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'));
}
const esFecha = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const norm = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const euros = (n: number) => (Math.round(n * 100) / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

// ---------------------------------------------------------------- bandeja
// Misma lógica que aplicarOpConector en app.js, sobre una copia de los
// datos, solo para que las lecturas incluyan lo pendiente.
function aplicarOp(data: any, op: any, id: string) {
    const ref = 'ia_' + id;
    if (op.tipo === 'evento') {
        data.entries = data.entries || [];
        data.entries.push({ id: ref, type: 'event', eventType: op.eventType || 'otro', title: op.titulo, date: op.fecha, time: op.hora || '', place: op.lugar || '', notes: op.notas || '' });
    } else if (op.tipo === 'tarea') {
        data.dayPlanner = data.dayPlanner || { days: {}, backlog: [] };
        if (op.fecha && op.hora) {
            data.dayPlanner.days = data.dayPlanner.days || {};
            (data.dayPlanner.days[op.fecha] = data.dayPlanner.days[op.fecha] || []).push({ id: ref, time: op.hora, title: op.titulo, notes: op.notas || '', done: false, sinValidar: true });
        } else {
            (data.dayPlanner.backlog = data.dayPlanner.backlog || []).unshift({ id: ref, title: op.titulo, notes: [op.fecha ? 'para el ' + op.fecha : '', op.notas || ''].filter(Boolean).join(' · '), done: false, sinValidar: true });
        }
    } else if (op.tipo === 'movimiento') {
        data.financePro = data.financePro || { transactions: [] };
        (data.financePro.transactions = data.financePro.transactions || []).push({ id: ref, date: op.fecha, account: op.cuenta, type: op.type, amount: op.importe, category: op.categoria || undefined, note: op.concepto || undefined, manual: true, needsReview: !op.categoria, sinValidar: true });
    } else if (op.tipo === 'ocio') {
        data.entries = data.entries || [];
        const e = op.id ? data.entries.find((x: any) => x?.id === op.id) : null;
        if (e) Object.assign(e, op.datos || {});
        else data.entries.push({ id: ref, type: op.entryType, title: op.titulo, ...(op.datos || {}) });
    } else if (op.tipo === 'nota') {
        data.notes = data.notes || [];
        const fecha = op.fecha || hoyISO();
        let nota = data.notes.find((n: any) => n.date === fecha);
        if (!nota) data.notes.push(nota = { id: ref, date: fecha, content: '' });
        if (op.titulo && !nota.title && !String(nota.content || '').trim()) { nota.title = String(op.titulo).trim(); nota.content = String(op.texto || '').trim(); }
        else nota.content = [nota.content, textoNota(op)].filter(Boolean).join('\n\n');
    } else if (op.tipo === 'entrada') {
        const ev = (data.entries || []).find((e: any) => e?.id === op.eventoId);
        if (ev) (ev.entradas = ev.entradas || []).push({ id: ref, qr: op.qr || '', qrB64: op.qrB64 || undefined, etiqueta: op.etiqueta || '' });
    } else if (op.tipo === 'editar_evento') {
        const ev = (data.entries || []).find((e: any) => e?.id === op.id);
        if (ev) Object.assign(ev, op.cambios || {});
    } else if (op.tipo === 'editar_movimiento') {
        const t = (data.financePro?.transactions || []).find((x: any) => x?.id === op.id);
        if (t) { Object.assign(t, op.cambios || {}); if (op.cambios?.category) t.needsReview = false; }
    } else if (op.tipo === 'editar_tarea') {
        moverTarea(data.dayPlanner = data.dayPlanner || { days: {}, backlog: [] }, op.id, op.cambios || {});
    } else if (op.tipo === 'borrar') {
        if (op.coleccion === 'evento') data.entries = (data.entries || []).filter((e: any) => e?.id !== op.id);
        if (op.coleccion === 'movimiento' && data.financePro) data.financePro.transactions = (data.financePro.transactions || []).filter((t: any) => t?.id !== op.id);
        if (op.coleccion === 'tarea') { const loc = buscarTarea(data.dayPlanner, op.id); if (loc) loc.lista.splice(loc.i, 1); }
    } else if (op.tipo === 'dia') {
        if (op.esfuerzo) (data.dailyEffort = data.dailyEffort || {})[op.fecha] = op.esfuerzo;
        (data.habits || []).forEach((h: any) => {
            if ((op.hechos || []).includes(h.id)) (h.completadas = h.completadas || {})[op.fecha] = true;
            if ((op.noHechos || []).includes(h.id) && h.completadas) delete h.completadas[op.fecha];
        });
    }
}

// Misma lógica que moverTareaConector en app.js: con día y hora va a la
// línea de ese día; sin alguno de los dos, a "tareas pendientes".
function buscarTarea(dp: any, id: string) {
    if (!dp) return null;
    let i = (dp.backlog || []).findIndex((t: any) => t?.id === id);
    if (i >= 0) return { lista: dp.backlog, i, dia: null as string | null };
    for (const [k, l] of Object.entries(dp.days || {})) {
        i = ((l as any[]) || []).findIndex((t: any) => t?.id === id);
        if (i >= 0) return { lista: l as any[], i, dia: k as string | null };
    }
    return null;
}

function moverTarea(dp: any, id: string, c: any) {
    const loc = buscarTarea(dp, id);
    if (!loc) return;
    const it = loc.lista[loc.i];
    if (c.titulo !== undefined) it.title = c.titulo;
    if (c.notas !== undefined) it.notes = c.notas;
    if (c.hecha !== undefined) it.done = !!c.hecha;
    if (c.fecha === undefined && c.hora === undefined && !c.sinFecha) return;
    const dia = c.sinFecha ? null : (c.fecha || loc.dia);
    const hora = c.sinFecha ? '' : (c.hora || it.time || '');
    loc.lista.splice(loc.i, 1);
    if (dia && hora) { it.time = hora; dp.days = dp.days || {}; (dp.days[dia] = dp.days[dia] || []).push(it); }
    else { delete it.time; (dp.backlog = dp.backlog || []).unshift(it); }
}

// Notas tiene una nota por día (solo la de hoy es editable en la app):
// lo que se anota se añade al final de la de hoy, con su título si lo hay.
function textoNota(op: any) {
    return [op.titulo ? String(op.titulo).trim() : '', String(op.texto || '').trim()].filter(Boolean).join('\n');
}

async function cargarDatos(userId: string) {
    const [{ data: fila }, { data: pendientes }] = await Promise.all([
        sbAdmin.from('bitacora').select('data').eq('user_id', userId).maybeSingle(),
        sbAdmin.from('conector_bandeja').select('id, op').eq('user_id', userId).order('creado'),
    ]);
    const data = structuredClone(fila?.data || {});
    (pendientes || []).forEach((p: any) => aplicarOp(data, p.op, p.id));
    return data;
}

async function encolar(userId: string, op: any) {
    const { error } = await sbAdmin.from('conector_bandeja').insert({ user_id: userId, op });
    if (error) throw new Error('No se pudo guardar: ' + error.message);
}

// ---------------------------------------------------------------- lecturas
function recurrenteToca(t: any, iso: string): boolean {
    if (!t?.activo) return false;
    const d = new Date(iso + 'T12:00:00Z');
    if (t.frecuencia === 'diaria') return true;
    if (t.frecuencia === 'semanal') return (Array.isArray(t.diasSemana) && t.diasSemana.length ? t.diasSemana : [t.diaSemana]).includes(d.getUTCDay());
    if (t.frecuencia === 'mensual') return d.getUTCDate() === t.diaMes;
    if (t.frecuencia === 'intervalo' && t.intervaloInicio && t.intervaloDias > 0) {
        const dif = Math.round((d.getTime() - new Date(t.intervaloInicio + 'T12:00:00Z').getTime()) / 86400000);
        return dif >= 0 && dif % t.intervaloDias === 0;
    }
    return false;
}

function agenda(data: any, desde: string, hasta: string) {
    const entries = data.entries || [];
    const dias: any[] = [];
    for (let f = desde; f <= hasta && dias.length < 62; f = sumarDias(f, 1)) {
        const dia: any = { fecha: f, dia: diaSemana(f) };
        const eventos = entries.filter((e: any) => e?.type === 'event' && e.date === f && !e.calendarLog)
            .sort((a: any, b: any) => String(a.time || '').localeCompare(String(b.time || '')))
            .map((e: any) => ({ id: e.id, titulo: e.title, hora: e.time || undefined, lugar: e.place || undefined, tipo: e.eventType, notas: e.notes || undefined, entradas: e.entradas?.length || undefined }));
        if (eventos.length) dia.eventos = eventos;
        const plan = (data.dayPlanner?.days?.[f] || []).map((it: any) => ({ id: it.id, hora: it.time, titulo: it.title, hecha: !!it.done, sin_validar: it.sinValidar || undefined }));
        if (plan.length) dia.planificador = plan;
        const rec = (data.recurringTasks || []).filter((t: any) => recurrenteToca(t, f)).map((t: any) => t.texto);
        if (rec.length) dia.recurrentes = rec;
        const estudios: any[] = [];
        (data.studies?.subjects || []).forEach((s: any) => {
            (s.exams || []).forEach((x: any) => { if (x?.date === f) estudios.push({ examen: x.title || 'examen', asignatura: s.name }); });
            (s.assignments || []).forEach((x: any) => { if (x?.date === f) estudios.push({ entrega: x.title || 'trabajo', asignatura: s.name, hecho: !!x.done }); });
        });
        if (estudios.length) dia.estudios = estudios;
        const cumple = entries.filter((e: any) => e?.type === 'birthday' && String(e.birthDate || '').slice(5) === f.slice(5)).map((e: any) => e.title);
        if (cumple.length) dia.cumpleanos = cumple;
        const cargos = entries.filter((e: any) => (e?.type === 'subscription' || e?.type === 'fixed_expense') && e.active !== false && Number(e.renewalDay) === Number(f.slice(8)))
            .map((e: any) => `${e.title} (${euros(Number(e.amount) || 0)})`);
        if (cargos.length) dia.cargos = cargos;
        if (data.dailyEffort?.[f]) dia.esfuerzo = data.dailyEffort[f];
        const habitos = (data.habits || []).filter((h: any) => h.activo !== false).map((h: any) => ({ habito: h.texto, hecho: !!h.completadas?.[f] }));
        if (habitos.length && f <= hoyISO()) dia.habitos = habitos;
        dias.push(dia);
    }
    const pendientes = (data.dayPlanner?.backlog || []).filter((t: any) => !t.done).map((t: any) => ({ id: t.id, titulo: t.title, notas: t.notes || undefined, sin_validar: t.sinValidar || undefined }));
    return { hoy: hoyISO(), dias, tareas_pendientes_sin_fecha: pendientes };
}

function nombreCategoria(data: any, id: string) {
    return (data.financePro?.categories || []).find((c: any) => c.id === id)?.name || 'sin categoría';
}

function saldos(data: any) {
    const fp = data.financePro || {};
    const res: Record<string, number> = {};
    CUENTAS.forEach(k => { res[k] = Number(fp.accounts?.[k]?.balance0 || 0); });
    (fp.transactions || []).forEach((t: any) => {
        if (t.pendiente && t.type === 'income') return;
        const v = Number(t.amount) || 0;
        if (t.type === 'transfer') { res[t.account] = (res[t.account] || 0) - v; res[t.transferTo] = (res[t.transferTo] || 0) + v; }
        else if (t.account in res) res[t.account] += t.type === 'income' ? v : -v;
    });
    return Object.fromEntries(CUENTAS.map(k => [fp.accounts?.[k]?.name || k, euros(res[k])]));
}

function finanzas(data: any, mes: string) {
    const fp = data.financePro || {};
    const txs = (fp.transactions || []).filter((t: any) => t?.date);
    const delMes = (m: string) => txs.filter((t: any) => t.date.slice(0, 7) === m);
    const suma = (lista: any[], tipo: string) => lista.filter(t => t.type === tipo).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const actual = delMes(mes);
    const porCat: Record<string, number> = {};
    actual.filter((t: any) => t.type === 'expense').forEach((t: any) => { const n = nombreCategoria(data, t.category); porCat[n] = (porCat[n] || 0) + (Number(t.amount) || 0); });
    const [y, m] = mes.split('-').map(Number);
    const anteriores = [1, 2, 3].map(i => new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
    const hoy = hoyISO();
    const dia = mes === hoy.slice(0, 7) ? Number(hoy.slice(8)) : 31;
    const hastaDia = (m2: string) => delMes(m2).filter((t: any) => t.type === 'expense' && Number(t.date.slice(8)) <= dia);
    const mediaHastaHoy = anteriores.reduce((s, m2) => s + suma(hastaDia(m2), 'expense'), 0) / 3;
    const presupuestos = Object.entries(fp.categoryBudgets || {}).filter(([, v]) => Number(v) > 0).map(([id, v]) => {
        const gastado = actual.filter((t: any) => t.type === 'expense' && t.category === id).reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);
        return { categoria: nombreCategoria(data, id), limite: euros(Number(v)), gastado: euros(gastado) };
    });
    const recurrentes = (data.entries || []).filter((e: any) => (e?.type === 'subscription' || e?.type === 'fixed_expense') && e.active !== false)
        .map((e: any) => ({ nombre: e.title, tipo: e.type === 'subscription' ? 'suscripción' : 'gasto fijo', importe: euros(Number(e.amount) || 0), dia: e.renewalDay }));
    return {
        mes,
        saldos: saldos(data),
        ingresos: euros(suma(actual, 'income')),
        gastos: euros(suma(actual, 'expense')),
        gasto_por_categoria: Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => ({ categoria: c, total: euros(v) })),
        comparacion: { dia_del_mes: dia, gastado_hasta_hoy: euros(suma(hastaDia(mes), 'expense')), media_de_los_3_meses_anteriores_a_esta_altura: euros(mediaHastaHoy) },
        presupuestos,
        suscripciones_y_gastos_fijos: recurrentes,
        ultimos_movimientos: movimientosLista(data, { desde: mes + '-01', hasta: mes + '-31', limite: 15 }),
    };
}

function movimientosLista(data: any, f: any) {
    const q = norm(f.texto);
    const cat = norm(f.categoria);
    return (data.financePro?.transactions || [])
        .filter((t: any) => t?.date && (!f.desde || t.date >= f.desde) && (!f.hasta || t.date <= f.hasta))
        .filter((t: any) => !q || norm(t.note).includes(q) || norm(t.bankNote).includes(q))
        .filter((t: any) => !cat || norm(nombreCategoria(data, t.category)).includes(cat))
        .sort((a: any, b: any) => b.date.localeCompare(a.date))
        .slice(0, Math.min(Number(f.limite) || 50, 200))
        .map((t: any) => ({
            id: t.id,
            fecha: t.date,
            tipo: t.type === 'income' ? 'ingreso' : t.type === 'expense' ? 'gasto' : 'traspaso',
            importe: euros(Number(t.amount) || 0),
            concepto: t.note || t.bankNote || undefined,
            categoria: t.type === 'transfer' ? undefined : nombreCategoria(data, t.category),
            cuenta: data.financePro?.accounts?.[t.account]?.name || t.account,
            pendiente: t.pendiente || undefined,
            por_revisar: t.needsReview || undefined,
            sin_validar: t.sinValidar || undefined,
        }));
}

function buscar(data: any, texto: string) {
    const q = norm(texto);
    if (!q) return [];
    const res: any[] = [];
    const mira = (...v: unknown[]) => v.some(x => norm(x).includes(q));
    (data.entries || []).forEach((e: any) => { if (e && mira(e.title, e.notes, e.place)) res.push({ apartado: e.type, id: e.id, titulo: e.title, fecha: e.date || undefined, notas: e.notes || undefined }); });
    (data.notes || []).forEach((n: any) => { if (mira(n.title, n.content)) res.push({ apartado: 'nota', fecha: n.date, titulo: n.title || undefined, texto: String(n.content || '').slice(0, 400) }); });
    (data.inbox || []).forEach((n: any) => { if (mira(n.text)) res.push({ apartado: 'inbox antiguo (Centro resumen)', texto: n.text }); });
    Object.entries(data.dayPlanner?.days || {}).forEach(([f, its]: any) => (its || []).forEach((it: any) => { if (mira(it.title, it.notes)) res.push({ apartado: 'planificador', id: it.id, fecha: f, hora: it.time, titulo: it.title, hecha: !!it.done }); }));
    (data.dayPlanner?.backlog || []).forEach((it: any) => { if (mira(it.title, it.notes)) res.push({ apartado: 'tarea pendiente', id: it.id, titulo: it.title, hecha: !!it.done }); });
    (data.collectibles || []).forEach((c: any) => { if (mira(c.name, c.carta?.set)) res.push({ apartado: 'coleccionable', nombre: c.name, valor: euros(Number(c.value) || 0) }); });
    (data.studies?.subjects || []).forEach((s: any) => { if (mira(s.name)) res.push({ apartado: 'asignatura', nombre: s.name }); });
    movimientosLista(data, { texto, limite: 30 }).forEach(m => res.push({ apartado: 'movimiento', ...m }));
    return res.slice(0, 80);
}

function resumenPeriodo(data: any, desde: string, hasta: string) {
    const fechas: string[] = [];
    for (let f = desde; f <= hasta && fechas.length < 93; f = sumarDias(f, 1)) fechas.push(f);
    const dentro = (f: unknown) => typeof f === 'string' && f >= desde && f <= hasta;
    const eventos = (data.entries || []).filter((e: any) => e?.type === 'event' && !e.calendarLog && dentro(e.date))
        .sort((a: any, b: any) => a.date.localeCompare(b.date)).map((e: any) => `${e.date} · ${e.title}`);
    const plan = fechas.map(f => {
        const l = data.dayPlanner?.days?.[f] || [];
        return { fecha: f, hechas: l.filter((t: any) => t.done).map((t: any) => t.title), sin_hacer: l.filter((t: any) => !t.done).map((t: any) => t.title) };
    }).filter(d => d.hechas.length || d.sin_hacer.length);
    const recurrentes = (data.recurringTasks || []).filter((t: any) => t.activo).map((t: any) => {
        const tocaban = fechas.filter(f => recurrenteToca(t, f));
        return { tarea: t.texto, tocaban: tocaban.length, hechas: tocaban.filter(f => t.completadas?.[f]).length };
    }).filter((x: any) => x.tocaban);
    const habitos = (data.habits || []).filter((h: any) => h.activo !== false).map((h: any) => ({ habito: h.texto, dias_hechos: fechas.filter(f => h.completadas?.[f]).length, de: fechas.length }));
    const esf = fechas.map(f => ({ fecha: f, valor: Number(data.dailyEffort?.[f]) || 0 })).filter(x => x.valor);
    const txs = (data.financePro?.transactions || []).filter((t: any) => t?.type === 'expense');
    const fuera = ['cat_inversion_gasto', 'cat_coleccionables'];
    const gastoEntre = (a: string, b: string) => txs.filter((t: any) => t.date >= a && t.date <= b && !t.recurringEntryId && !fuera.includes(t.category)).reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);
    const porCat: Record<string, number> = {};
    txs.filter((t: any) => dentro(t.date)).forEach((t: any) => { const n = nombreCategoria(data, t.category); porCat[n] = (porCat[n] || 0) + (Number(t.amount) || 0); });
    const n = fechas.length;
    const anteriores = [1, 2, 3, 4].map(i => gastoEntre(sumarDias(desde, -n * i), sumarDias(hasta, -n * i)));
    const estudios: any[] = [];
    (data.studies?.subjects || []).forEach((s: any) => {
        (s.exams || []).forEach((x: any) => { if (x?.date >= desde && x.date <= sumarDias(hasta, 14)) estudios.push({ fecha: x.date, examen: x.title || 'examen', asignatura: s.name }); });
        (s.assignments || []).forEach((x: any) => { if (x?.date >= desde && x.date <= sumarDias(hasta, 14)) estudios.push({ fecha: x.date, entrega: x.title || 'trabajo', asignatura: s.name, hecho: !!x.done }); });
    });
    const notas = (data.notes || []).filter((x: any) => dentro(x.date)).map((x: any) => ({ fecha: x.date, titulo: x.title || undefined, extracto: String(x.content || '').slice(0, 300) }));
    const ocio = (data.entries || []).filter((e: any) => ['book', 'movie', 'series', 'game'].includes(e?.type) && (dentro(e.endDate) || dentro(e.date))).map((e: any) => ({ tipo: e.type, titulo: e.title, valoracion: e.rating || undefined }));
    return {
        periodo: { desde, hasta, dias: n },
        eventos,
        planificador: plan,
        tareas_recurrentes: recurrentes,
        habitos,
        esfuerzo: { media: esf.length ? Math.round(esf.reduce((s, x) => s + x.valor, 0) / esf.length * 10) / 10 : null, dias_puntuados: esf.length, por_dia: esf },
        gasto_dia_a_dia: { este_periodo: euros(gastoEntre(desde, hasta)), media_de_los_4_periodos_anteriores: euros(anteriores.reduce((a, b) => a + b, 0) / 4), nota: 'sin suscripciones, gastos fijos, inversiones ni coleccionables' },
        gasto_por_categoria: Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => ({ categoria: c, total: euros(v) })),
        estudios_en_el_periodo_y_las_2_semanas_siguientes: estudios.sort((a, b) => a.fecha.localeCompare(b.fecha)),
        notas,
        ocio_terminado: ocio,
    };
}

function habitosPorNombre(data: any, nombres: unknown) {
    const lista = Array.isArray(nombres) ? nombres : [];
    const activos = (data.habits || []).filter((h: any) => h.activo !== false);
    const ids: string[] = [], noEncontrados: string[] = [];
    lista.forEach((n: unknown) => {
        const q = norm(n).trim();
        const h = activos.find((x: any) => norm(x.texto).trim() === q) || activos.find((x: any) => norm(x.texto).includes(q) || q.includes(norm(x.texto)));
        if (h) ids.push(h.id); else noEncontrados.push(String(n));
    });
    return { ids, noEncontrados };
}

const APARTADOS: Record<string, (d: any) => unknown> = {
    habitos: d => d.habits,
    estudios: d => d.studies,
    notas: d => ({ notas_del_dia: (d.notes || []).slice(-60).map((n: any) => ({ fecha: n.date, titulo: n.title || undefined, texto: n.content })), inbox_antiguo: d.inbox }),
    viajes: d => ({ viajes: (d.entries || []).filter((e: any) => e?.type === 'travel' || e?.type === 'place'), planeados: d.plannedTrips }),
    coleccionables: d => ({ categorias: d.collectibleCategories, objetos: (d.collectibles || []).map((c: any) => ({ nombre: c.name, categoria: c.category, valor: c.value, carta: c.carta })) }),
    ocio: d => ({ listas: d.cultureLists, entradas: (d.entries || []).filter((e: any) => ['book', 'movie', 'series', 'game'].includes(e?.type)) }),
    objetivos: d => (d.entries || []).filter((e: any) => e?.type === 'goal'),
    trabajo: d => (d.entries || []).filter((e: any) => e?.type === 'work'),
    proyectos: d => (d.entries || []).filter((e: any) => e?.type === 'project'),
    enlaces: d => ({ enlaces: d.links, categorias: d.linkCategories }),
    recurrentes: d => d.recurringTasks,
    esfuerzo: d => d.dailyEffort,
};

// ---------------------------------------------------------------- herramientas
const HERRAMIENTAS = [
    {
        name: 'agenda',
        description: 'Lo que el usuario tiene entre dos fechas: eventos del calendario, planificador del día, tareas recurrentes, exámenes y entregas, cumpleaños y cargos de suscripciones; además, sus tareas pendientes sin fecha. Por defecto, hoy y los 7 días siguientes. Devuelve también la fecha de hoy.',
        inputSchema: { type: 'object', properties: { desde: { type: 'string', description: 'AAAA-MM-DD' }, hasta: { type: 'string', description: 'AAAA-MM-DD (máximo 62 días)' } } },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'finanzas',
        description: 'Resumen financiero de un mes: saldos de las cuentas, ingresos, gastos, gasto por categoría, comparación con los tres meses anteriores a la misma altura del mes, presupuestos, suscripciones y gastos fijos, y últimos movimientos. Por defecto, el mes actual.',
        inputSchema: { type: 'object', properties: { mes: { type: 'string', description: 'AAAA-MM' } } },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'movimientos',
        description: 'Lista de movimientos bancarios y gastos, filtrables por fechas, texto del concepto y categoría.',
        inputSchema: { type: 'object', properties: { desde: { type: 'string' }, hasta: { type: 'string' }, texto: { type: 'string' }, categoria: { type: 'string' }, limite: { type: 'number' } } },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'buscar',
        description: 'Busca un texto en todo Bitácora: eventos, notas, planificador, tareas, movimientos, coleccionables y asignaturas.',
        inputSchema: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'apartado',
        description: 'Datos completos de un apartado de Bitácora para preguntas que no cubren las otras herramientas.',
        inputSchema: { type: 'object', properties: { nombre: { type: 'string', enum: Object.keys(APARTADOS) } }, required: ['nombre'] },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'crear_evento',
        description: 'Apunta un evento en el calendario (un plan, una cita, un concierto, un partido...). También sirve para entradas o billetes que el usuario comparta: extrae fecha, hora y lugar.',
        inputSchema: {
            type: 'object',
            properties: {
                titulo: { type: 'string' }, fecha: { type: 'string', description: 'AAAA-MM-DD' }, hora: { type: 'string', description: 'HH:MM, opcional' },
                lugar: { type: 'string' }, tipo: { type: 'string', enum: EVENTO_TIPOS }, notas: { type: 'string' },
            },
            required: ['titulo', 'fecha'],
        },
    },
    {
        name: 'anadir_entrada',
        description: 'Añade una entrada con QR (concierto, partido, cine, tren...) a un evento del calendario, para enseñarla luego en la puerta desde Bitácora. Si el usuario manda la imagen de un QR, DECODIFÍCALO CON TU HERRAMIENTA DE CÓDIGO (Python: cv2.QRCodeDetector().detectAndDecode o pyzbar.pyzbar.decode) y pasa aquí su contenido exacto; si el contenido son bytes que no son texto, pásalo en qr_base64. Nunca transcribas un QR a ojo ni inventes su contenido: si no puedes ejecutar código, dile al usuario que active la ejecución de código o que la añada desde Bitácora con el botón "pegar.". Si el evento no existe, créalo antes con crear_evento.',
        inputSchema: {
            type: 'object',
            properties: {
                evento: { type: 'string', description: 'Título (o parte) del evento' },
                fecha: { type: 'string', description: 'AAAA-MM-DD del evento, para distinguir entre varios con el mismo nombre' },
                qr: { type: 'string', description: 'Contenido de texto del QR, exacto' },
                qr_base64: { type: 'string', description: 'Bytes del QR en base64, si no son texto' },
                etiqueta: { type: 'string', description: 'Opcional: fila, asiento, puerta, nombre...' },
            },
            required: ['evento'],
        },
    },
    {
        name: 'crear_tarea',
        description: 'Apunta una tarea. Con fecha y hora va a la línea del planificador de ese día; sin hora, a "tareas pendientes".',
        inputSchema: { type: 'object', properties: { titulo: { type: 'string' }, fecha: { type: 'string' }, hora: { type: 'string', description: 'HH:MM' }, notas: { type: 'string' } }, required: ['titulo'] },
    },
    {
        name: 'registrar_movimiento',
        description: 'Registra un gasto o un ingreso (por ejemplo a partir de un ticket o una factura). Si el usuario no dice la cuenta, usa la de bancos. La categoría debe ser una de las del usuario; si no está claro, déjala vacía y Bitácora la marcará para revisar.',
        inputSchema: {
            type: 'object',
            properties: {
                tipo: { type: 'string', enum: ['gasto', 'ingreso'] }, importe: { type: 'number' }, concepto: { type: 'string' },
                fecha: { type: 'string', description: 'AAAA-MM-DD, por defecto hoy' }, cuenta: { type: 'string', enum: CUENTAS }, categoria: { type: 'string' },
            },
            required: ['tipo', 'importe', 'concepto'],
        },
    },
    {
        name: 'editar_evento',
        description: 'Cambia un evento del calendario (título, fecha, hora, lugar, notas o tipo). Busca antes su id con agenda o buscar.',
        inputSchema: { type: 'object', properties: { id: { type: 'string' }, titulo: { type: 'string' }, fecha: { type: 'string' }, hora: { type: 'string' }, lugar: { type: 'string' }, notas: { type: 'string' }, tipo: { type: 'string', enum: EVENTO_TIPOS } }, required: ['id'] },
    },
    {
        name: 'editar_tarea',
        description: 'Cambia, completa o mueve una tarea (del planificador o de "tareas pendientes"). hecha=true la marca hecha. Con fecha y/o hora se mueve a la línea de ese día; sin_fecha=true la devuelve a "tareas pendientes". Busca antes su id con agenda o buscar.',
        inputSchema: { type: 'object', properties: { id: { type: 'string' }, titulo: { type: 'string' }, notas: { type: 'string' }, fecha: { type: 'string' }, hora: { type: 'string', description: 'HH:MM' }, hecha: { type: 'boolean' }, sin_fecha: { type: 'boolean' } }, required: ['id'] },
    },
    {
        name: 'editar_movimiento',
        description: 'Corrige un movimiento: categoría, concepto, importe, fecha o cuenta. Sirve para categorizar los que están por revisar. Busca antes su id con movimientos.',
        inputSchema: { type: 'object', properties: { id: { type: 'string' }, categoria: { type: 'string' }, concepto: { type: 'string' }, importe: { type: 'number' }, fecha: { type: 'string' }, cuenta: { type: 'string', enum: CUENTAS } }, required: ['id'] },
    },
    {
        name: 'borrar',
        description: 'Borra un evento, una tarea o un movimiento por su id. CONFIRMA SIEMPRE CON EL USUARIO ANTES de llamar a esta herramienta, diciéndole qué vas a borrar.',
        inputSchema: { type: 'object', properties: { tipo: { type: 'string', enum: ['evento', 'tarea', 'movimiento'] }, id: { type: 'string' } }, required: ['tipo', 'id'] },
        annotations: { destructiveHint: true },
    },
    {
        name: 'registrar_dia',
        description: 'Check-in de un día: puntúa el esfuerzo (1 a 5: cuánto se esforzó en cumplir sus objetivos), marca hábitos hechos o no hechos por su nombre y, si hay algo que contar, lo añade a la nota del día. Por defecto, hoy.',
        inputSchema: {
            type: 'object',
            properties: {
                fecha: { type: 'string' }, esfuerzo: { type: 'number', minimum: 1, maximum: 5 },
                habitos_hechos: { type: 'array', items: { type: 'string' } }, habitos_no_hechos: { type: 'array', items: { type: 'string' } },
                nota: { type: 'string' }, titulo_nota: { type: 'string' },
            },
        },
    },
    {
        name: 'importar_extracto',
        description: 'Importa un extracto bancario en CSV (Revolut, Ibercaja...) que el usuario comparta: pasa aquí el contenido completo del archivo, sin tocarlo. Bitácora lo procesa con su propio importador al abrirse: no duplica lo ya registrado, fusiona los gastos apuntados a mano y las suscripciones, actualiza los pendientes y categoriza solo lo que tiene claro.',
        inputSchema: { type: 'object', properties: { csv: { type: 'string' }, cuenta: { type: 'string', enum: CUENTAS, description: 'Cuenta de Bitácora a la que pertenece; por defecto la última usada al importar' } }, required: ['csv'] },
    },
    {
        name: 'resumen_periodo',
        description: 'Todo lo que pasó entre dos fechas, para revisiones semanales o mensuales: eventos, tareas hechas y sin hacer, recurrentes, hábitos, esfuerzo, gasto del día a día frente a los periodos anteriores, gasto por categoría, exámenes y entregas, notas y ocio terminado. Por defecto, los últimos 7 días.',
        inputSchema: { type: 'object', properties: { desde: { type: 'string' }, hasta: { type: 'string' } } },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'ocio',
        description: 'Añade o actualiza un libro, una película, una serie o un videojuego en Ocio (se aplica solo, sin validar). Si ya existe uno con ese título, lo actualiza: por ejemplo, terminarlo (fecha_fin), valorarlo (1 a 5) o cambiar su estado.',
        inputSchema: {
            type: 'object',
            properties: {
                tipo: { type: 'string', enum: Object.keys(OCIO_TIPOS) }, titulo: { type: 'string' }, autor: { type: 'string', description: 'Solo libros' },
                fecha_inicio: { type: 'string' }, fecha_fin: { type: 'string' }, valoracion: { type: 'number', minimum: 1, maximum: 5 },
                estado: { type: 'string', description: 'Libros: Leyendo/Completado. Series: Viendo/Completada/Abandonada. Videojuegos: Jugando/Completado/Abandonado.' },
            },
            required: ['tipo', 'titulo'],
        },
    },
    {
        name: 'anotar',
        description: 'Escribe en el apartado Notas de Bitácora. Notas funciona como un diario: hay una nota por día y esto se añade al final de la nota de hoy. Si la nota de hoy está vacía y sin título, el título pasa a ser el de la nota; si no, va como primera línea del texto añadido. Para ideas, apuntes, reflexiones o datos que el usuario quiera guardar.',
        inputSchema: { type: 'object', properties: { titulo: { type: 'string', description: 'Opcional' }, texto: { type: 'string' } }, required: ['texto'] },
    },
];

function categoriaPorNombre(data: any, nombre: string, tipo: string) {
    const n = norm(nombre).trim();
    if (!n) return null;
    const cats = (data.financePro?.categories || []).filter((c: any) => c.type === tipo);
    return cats.find((c: any) => norm(c.name) === n) || cats.find((c: any) => norm(c.name).includes(n) || n.includes(norm(c.name))) || null;
}

async function llamar(userId: string, nombre: string, a: any) {
    const data = await cargarDatos(userId);
    const hoy = hoyISO();
    switch (nombre) {
        case 'agenda': {
            const desde = esFecha(a.desde) ? a.desde : hoy;
            const hasta = esFecha(a.hasta) ? a.hasta : sumarDias(desde, 7);
            return agenda(data, desde, hasta);
        }
        case 'finanzas':
            return finanzas(data, /^\d{4}-\d{2}$/.test(a.mes || '') ? a.mes : hoy.slice(0, 7));
        case 'movimientos':
            return movimientosLista(data, a);
        case 'buscar':
            return buscar(data, a.texto);
        case 'apartado': {
            const f = APARTADOS[a.nombre];
            if (!f) throw new Error('Apartado desconocido');
            const txt = JSON.stringify(f(data) ?? null);
            return txt.length > 60000 ? txt.slice(0, 60000) + '… (recortado)' : JSON.parse(txt);
        }
        case 'crear_evento': {
            if (!a.titulo || !esFecha(a.fecha)) throw new Error('Hacen falta título y fecha (AAAA-MM-DD)');
            await encolar(userId, { tipo: 'evento', titulo: String(a.titulo), fecha: a.fecha, hora: /^\d{2}:\d{2}$/.test(a.hora || '') ? a.hora : '', lugar: a.lugar || '', notas: a.notas || '', eventType: EVENTO_TIPOS.includes(a.tipo) ? a.tipo : 'otro' });
            return `Apuntado: «${a.titulo}» el ${diaSemana(a.fecha)} ${a.fecha}${a.hora ? ' a las ' + a.hora : ''}.`;
        }
        case 'anadir_entrada': {
            const qr = typeof a.qr === 'string' ? a.qr : '';
            let qrB64 = '';
            if (a.qr_base64) {
                try { qrB64 = btoa(atob(String(a.qr_base64).replace(/\s+/g, ''))); } catch { throw new Error('qr_base64 no es base64 válido'); }
            }
            if (!qr && !qrB64) throw new Error('Falta el contenido del QR (qr o qr_base64), decodificado con código');
            const q = norm(a.evento).trim();
            const hoy2 = hoyISO();
            const candidatos = (data.entries || []).filter((e: any) => e?.type === 'event' && !e.calendarLog && (norm(e.title).includes(q) || (q.includes(norm(e.title)) && norm(e.title).length >= 3)))
                .filter((e: any) => !esFecha(a.fecha) || e.date === a.fecha)
                .sort((x: any, y: any) => {
                    const fx = String(x.date || ''), fy = String(y.date || '');
                    const px = fx >= hoy2 ? 0 : 1, py = fy >= hoy2 ? 0 : 1;
                    return px - py || (px === 0 ? fx.localeCompare(fy) : fy.localeCompare(fx));
                });
            const ev = candidatos[0];
            if (!ev) throw new Error(`No encuentro ningún evento que se llame «${a.evento}»${esFecha(a.fecha) ? ' el ' + a.fecha : ''}. Créalo primero con crear_evento.`);
            if ((ev.entradas || []).some((x: any) => (qrB64 && x.qrB64 === qrB64) || (!qrB64 && qr && x.qr === qr))) return `Esa entrada ya estaba en «${ev.title}».`;
            await encolar(userId, { tipo: 'entrada', eventoId: ev.id, qr, qrB64, etiqueta: String(a.etiqueta || '') });
            return `Entrada añadida a «${ev.title}» (${ev.date})${candidatos.length > 1 ? `; había ${candidatos.length} eventos parecidos y he elegido el más próximo` : ''}. Ya la tiene: ${(ev.entradas?.length || 0) + 1} en total.`;
        }
        case 'crear_tarea': {
            if (!a.titulo) throw new Error('Hace falta un título');
            const fecha = esFecha(a.fecha) ? a.fecha : '';
            const hora = /^\d{2}:\d{2}$/.test(a.hora || '') ? a.hora : '';
            await encolar(userId, { tipo: 'tarea', titulo: String(a.titulo), fecha, hora, notas: a.notas || '' });
            return (fecha && hora ? `Tarea propuesta para el planificador el ${fecha} a las ${hora}.` : 'Tarea propuesta para "tareas pendientes".') + PENDIENTE;
        }
        case 'registrar_movimiento': {
            const importe = Math.abs(Number(a.importe));
            if (!(importe > 0)) throw new Error('Importe no válido');
            const type = a.tipo === 'ingreso' ? 'income' : 'expense';
            const cat = a.categoria ? categoriaPorNombre(data, a.categoria, type) : null;
            const cuenta = CUENTAS.includes(a.cuenta) ? a.cuenta : 'bancos';
            const fecha = esFecha(a.fecha) ? a.fecha : hoy;
            await encolar(userId, { tipo: 'movimiento', type, importe, concepto: String(a.concepto || ''), fecha, cuenta, categoria: cat?.id || '' });
            return `Registrado: ${a.tipo === 'ingreso' ? 'ingreso' : 'gasto'} de ${euros(importe)} (${a.concepto}) el ${fecha} en ${data.financePro?.accounts?.[cuenta]?.name || cuenta}${cat ? ', categoría ' + cat.name : ', sin categoría (queda para revisar)'}. Si se importa luego el extracto del banco, se fusiona con el cargo real.${PENDIENTE}`;
        }
        case 'editar_evento': {
            const ev = (data.entries || []).find((e: any) => e?.id === a.id && e.type === 'event');
            if (!ev) throw new Error('No encuentro ese evento; busca su id con agenda o buscar');
            const cambios: any = {};
            if (a.titulo) cambios.title = String(a.titulo);
            if (esFecha(a.fecha)) cambios.date = a.fecha;
            if (a.hora !== undefined) cambios.time = /^\d{2}:\d{2}$/.test(a.hora || '') ? a.hora : '';
            if (a.lugar !== undefined) cambios.place = String(a.lugar || '');
            if (a.notas !== undefined) cambios.notes = String(a.notas || '');
            if (EVENTO_TIPOS.includes(a.tipo)) cambios.eventType = a.tipo;
            if (!Object.keys(cambios).length) throw new Error('No hay nada que cambiar');
            await encolar(userId, { tipo: 'editar_evento', id: ev.id, cambios, resumen: ev.title });
            return `Cambiado «${ev.title}».`;
        }
        case 'editar_tarea': {
            const loc = buscarTarea(data.dayPlanner, a.id);
            if (!loc) throw new Error('No encuentro esa tarea; busca su id con agenda o buscar');
            const it = loc.lista[loc.i];
            const cambios: any = {};
            if (a.titulo) cambios.titulo = String(a.titulo);
            if (a.notas !== undefined) cambios.notas = String(a.notas || '');
            if (typeof a.hecha === 'boolean') cambios.hecha = a.hecha;
            if (esFecha(a.fecha)) cambios.fecha = a.fecha;
            if (/^\d{2}:\d{2}$/.test(a.hora || '')) cambios.hora = a.hora;
            if (a.sin_fecha) cambios.sinFecha = true;
            if (!Object.keys(cambios).length) throw new Error('No hay nada que cambiar');
            await encolar(userId, { tipo: 'editar_tarea', id: it.id, cambios, resumen: it.title });
            return `Propuesto: «${it.title}»${cambios.hecha === true ? ' marcada como hecha' : cambios.hecha === false ? ' marcada como pendiente' : ''}${cambios.sinFecha ? ', pasa a tareas pendientes' : cambios.fecha || cambios.hora ? `, movida a ${cambios.fecha || loc.dia || 'su día'}${cambios.hora || it.time ? ' a las ' + (cambios.hora || it.time) : ''}` : ''}.${PENDIENTE}`;
        }
        case 'editar_movimiento': {
            const t = (data.financePro?.transactions || []).find((x: any) => x?.id === a.id);
            if (!t) throw new Error('No encuentro ese movimiento; busca su id con movimientos');
            const cambios: any = {};
            if (a.categoria) {
                const cat = categoriaPorNombre(data, a.categoria, t.type === 'income' ? 'income' : 'expense');
                if (!cat) throw new Error(`No hay ninguna categoría «${a.categoria}». Las del usuario: ${(data.financePro?.categories || []).filter((c: any) => c.type === (t.type === 'income' ? 'income' : 'expense')).map((c: any) => c.name).join(', ')}`);
                cambios.category = cat.id;
            }
            if (a.concepto) cambios.note = String(a.concepto);
            if (Number(a.importe) > 0) cambios.amount = Math.abs(Number(a.importe));
            if (esFecha(a.fecha)) cambios.date = a.fecha;
            if (CUENTAS.includes(a.cuenta)) cambios.account = a.cuenta;
            if (!Object.keys(cambios).length) throw new Error('No hay nada que cambiar');
            await encolar(userId, { tipo: 'editar_movimiento', id: t.id, cambios, resumen: `${t.note || t.bankNote || 'movimiento'} (${euros(Number(t.amount) || 0)})` });
            return `Corrección propuesta para «${t.note || t.bankNote || ''}» del ${t.date}${cambios.category ? ', categoría ' + nombreCategoria(data, cambios.category) : ''}.${PENDIENTE}`;
        }
        case 'borrar': {
            let resumen = '';
            if (a.tipo === 'evento') resumen = (data.entries || []).find((e: any) => e?.id === a.id && e.type === 'event')?.title || '';
            if (a.tipo === 'tarea') { const loc = buscarTarea(data.dayPlanner, a.id); resumen = loc ? loc.lista[loc.i].title : ''; }
            if (a.tipo === 'movimiento') { const t = (data.financePro?.transactions || []).find((x: any) => x?.id === a.id); resumen = t ? `${t.note || t.bankNote || 'movimiento'} (${euros(Number(t.amount) || 0)}, ${t.date})` : ''; }
            if (!resumen) throw new Error('No encuentro eso; comprueba el tipo y el id');
            await encolar(userId, { tipo: 'borrar', coleccion: a.tipo, id: a.id, resumen });
            return `Borrado propuesto: ${resumen}.${PENDIENTE}`;
        }
        case 'registrar_dia': {
            const fecha = esFecha(a.fecha) ? a.fecha : hoy;
            const esfuerzo = Math.round(Number(a.esfuerzo));
            const si = habitosPorNombre(data, a.habitos_hechos);
            const no = habitosPorNombre(data, a.habitos_no_hechos);
            const partes: string[] = [];
            if (esfuerzo >= 1 && esfuerzo <= 5 || si.ids.length || no.ids.length) {
                await encolar(userId, { tipo: 'dia', fecha, esfuerzo: esfuerzo >= 1 && esfuerzo <= 5 ? esfuerzo : 0, hechos: si.ids, noHechos: no.ids });
                if (esfuerzo >= 1 && esfuerzo <= 5) partes.push(`esfuerzo ${esfuerzo}`);
                if (si.ids.length) partes.push(`${si.ids.length} hábito${si.ids.length === 1 ? '' : 's'} hecho${si.ids.length === 1 ? '' : 's'}`);
                if (no.ids.length) partes.push(`${no.ids.length} sin hacer`);
            }
            if (a.nota) { await encolar(userId, { tipo: 'nota', titulo: String(a.titulo_nota || ''), texto: String(a.nota), fecha }); partes.push('nota del día'); }
            const perdidos = [...si.noEncontrados, ...no.noEncontrados];
            const habitos = (data.habits || []).filter((h: any) => h.activo !== false).map((h: any) => h.texto);
            if (!partes.length) throw new Error(`Nada que registrar.${perdidos.length ? ` No encuentro los hábitos: ${perdidos.join(', ')}. Los del usuario: ${habitos.join(', ')}` : ''}`);
            return `Propuesto para el ${fecha}: ${partes.join(', ')}.${PENDIENTE}${perdidos.length ? ` No encuentro estos hábitos: ${perdidos.join(', ')} (los del usuario son: ${habitos.join(', ')}).` : ''}`;
        }
        case 'importar_extracto': {
            const csv = String(a.csv || '').trim();
            const lineas = csv.split(/\r?\n/).filter(l => l.trim());
            if (lineas.length < 2 || !/[,;]/.test(lineas[0])) throw new Error('Eso no parece un CSV con cabecera y filas');
            if (csv.length > 400000) throw new Error('El extracto es demasiado grande; impórtalo por partes (por meses)');
            const cuenta = CUENTAS.includes(a.cuenta) ? a.cuenta : (data.financePro?.cuentaImport || '');
            await encolar(userId, { tipo: 'importar', csv, cuenta, resumen: `${lineas.length - 1} filas` });
            return `Extracto recibido (${lineas.length - 1} filas)${cuenta ? ' para ' + (data.financePro?.accounts?.[cuenta]?.name || cuenta) : ''}. Cuando el usuario lo valide en la bandeja, Bitácora lo importará con su importador: sin duplicados y fusionando lo ya apuntado.`;
        }
        case 'resumen_periodo': {
            const hasta = esFecha(a.hasta) ? a.hasta : hoy;
            const desde = esFecha(a.desde) ? a.desde : sumarDias(hasta, -6);
            if (desde > hasta) throw new Error('desde es posterior a hasta');
            return resumenPeriodo(data, desde, hasta);
        }
        case 'ocio': {
            const t = OCIO_TIPOS[a.tipo];
            if (!t || !a.titulo) throw new Error('Hacen falta tipo (libro, pelicula, serie o videojuego) y título');
            const existente = (data.entries || []).find((e: any) => e?.type === t && norm(e.title).trim() === norm(a.titulo).trim());
            const datos: any = {};
            if (a.autor && t === 'book') datos.author = String(a.autor);
            if (esFecha(a.fecha_inicio)) { datos.startDate = a.fecha_inicio; datos.date = a.fecha_inicio; }
            if (esFecha(a.fecha_fin)) datos.endDate = a.fecha_fin;
            if (t === 'movie' && (esFecha(a.fecha_fin) || esFecha(a.fecha_inicio))) datos.date = esFecha(a.fecha_fin) ? a.fecha_fin : a.fecha_inicio;
            const v = Math.round(Number(a.valoracion));
            if (v >= 1 && v <= 5) datos.rating = v;
            const terminado: Record<string, string> = { book: 'Completado', series: 'Completada', game: 'Completado' };
            const empezado: Record<string, string> = { book: 'Leyendo', series: 'Viendo', game: 'Jugando' };
            if (a.estado && t !== 'movie') datos.status = String(a.estado);
            else if (datos.endDate && terminado[t]) datos.status = terminado[t];
            else if (!existente && empezado[t]) datos.status = empezado[t];
            if (existente) {
                if (!Object.keys(datos).length) throw new Error('Ya está en Ocio y no hay nada que cambiar');
                await encolar(userId, { tipo: 'ocio', id: existente.id, entryType: t, titulo: existente.title, datos });
                return `Actualizado en Ocio: «${existente.title}».`;
            }
            await encolar(userId, { tipo: 'ocio', entryType: t, titulo: String(a.titulo), datos: { title: String(a.titulo), rating: 0, endDate: '', ...datos } });
            return `Añadido a Ocio: «${a.titulo}».`;
        }
        case 'anotar': {
            if (!a.texto) throw new Error('Texto vacío');
            await encolar(userId, { tipo: 'nota', titulo: String(a.titulo || ''), texto: String(a.texto), fecha: hoy });
            return `Propuesto para la nota de hoy (${hoy}) en el apartado Notas.${PENDIENTE}`;
        }
    }
    throw new Error('Herramienta desconocida: ' + nombre);
}

// ---------------------------------------------------------------- atajos
// Aparecen en Claude/ChatGPT como acciones del conector: guían una
// conversación que acaba usando las herramientas de arriba.
const ATAJOS = [
    { name: 'check-in', title: 'Check-in del día', description: 'Repasa el día conmigo (vale por voz): esfuerzo, hábitos, qué contar y qué queda para mañana.' },
    { name: 'revision-semanal', title: 'Revisión semanal', description: 'Revisión de la última semana con lo que dicen mis datos, y la guarda como nota.' },
    { name: 'planificar-semana', title: 'Planificar la semana', description: 'Organiza conmigo los próximos 7 días y lo vuelca en el planificador.' },
];

async function textoAtajo(userId: string, nombre: string) {
    const data = await cargarDatos(userId);
    const hoy = hoyISO();
    const habitos = (data.habits || []).filter((h: any) => h.activo !== false);
    if (nombre === 'check-in') {
        const plan = (data.dayPlanner?.days?.[hoy] || []).map((t: any) => `- [${t.done ? 'x' : ' '}] ${t.time || ''} ${t.title} (id ${t.id})`).join('\n') || '(nada en el planificador)';
        return `Vamos a hacer el check-in de hoy (${diaSemana(hoy)} ${hoy}) en Bitácora. Puede que te hable por voz: sé breve, natural y haz las preguntas de una en una.

1. Pregúntame qué tal el día y escucha.
2. Repasa conmigo los hábitos de hoy: ${habitos.length ? habitos.map((h: any) => `«${h.texto}»${h.completadas?.[hoy] ? ' (ya marcado)' : ''}`).join(', ') : 'no tengo hábitos activos'}.
3. Pregúntame del 1 al 5 cuánto me he esforzado hoy en cumplir mis objetivos${data.dailyEffort?.[hoy] ? ` (ya puse un ${data.dailyEffort[hoy]})` : ''}.
4. Mira mis tareas de hoy y pregúntame cuáles he hecho:
${plan}
5. Pregúntame si quiero apuntar algo en la nota del día y si queda algo para mañana.

Al final, sin pedirme confirmación de cada cosa: usa registrar_dia (esfuerzo, hábitos y la nota con lo importante de lo que te he contado, en mis palabras), editar_tarea para marcar hechas o mover a mañana lo que no hice, y crear_tarea para lo nuevo. Termina con un resumen de dos líneas de lo que has apuntado.`;
    }
    if (nombre === 'revision-semanal') {
        return `Hazme la revisión de la semana con Bitácora.

1. Llama a resumen_periodo (los últimos 7 días) y a agenda (los próximos 7).
2. Escribe una revisión corta y honesta, sin adornos: qué ha ido bien, qué no, cómo han ido mis hábitos y mi esfuerzo, cómo voy de gasto frente a lo normal y qué viene la semana que viene (exámenes, entregas, planes). Si ves un patrón (por ejemplo, días de poco esfuerzo que coinciden con más gasto), dilo.
3. Hazme dos preguntas para pensar la semana que viene y espera mis respuestas.
4. Guarda la revisión y mis respuestas con anotar, con el título «revisión semana del ${sumarDias(hoy, -6)} al ${hoy}».`;
    }
    return `Ayúdame a planificar los próximos 7 días en Bitácora.

1. Llama a agenda (hoy y los 7 días siguientes): mira eventos, lo que ya tengo en el planificador, exámenes y entregas, y las tareas pendientes sin fecha.
2. Pregúntame qué quiero conseguir esta semana y si hay algo que no esté en Bitácora.
3. Propón un reparto realista por días y horas, dejando huecos libres y sin llenar los días con muchos planes. Prioriza lo que tenga fecha límite cerca.
4. Cuando te dé el visto bueno (y no antes), vuélcalo: crear_tarea para lo nuevo y editar_tarea para dar día y hora a las tareas pendientes que ya existían.
5. Termina con la semana resumida en una lista por días.`;
}

// ---------------------------------------------------------------- JSON-RPC
const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, mcp-session-id, mcp-protocol-version, authorization',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function sha256(texto: string) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function usuarioDelToken(token: string): Promise<string | null> {
    if (!/^[a-f0-9]{48,128}$/.test(token)) return null;
    const hash = await sha256(token);
    const { data } = await sbAdmin.from('conector_tokens').select('user_id').eq('token_hash', hash).maybeSingle();
    if (!data) return null;
    sbAdmin.from('conector_tokens').update({ ultimo_uso: new Date().toISOString() }).eq('token_hash', hash).then(() => {});
    return data.user_id;
}

async function responder(userId: string, msg: any) {
    const { id, method, params } = msg || {};
    if (id === undefined || id === null) return null;
    try {
        if (method === 'initialize') {
            return { jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion || PROTOCOLO, capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } }, serverInfo: { name: 'bitacora', title: 'Bitácora', version: '2.0.0' }, instructions: INSTRUCCIONES } };
        }
        if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
        if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: HERRAMIENTAS } };
        if (method === 'tools/call') {
            try {
                const res = await llamar(userId, params?.name, params?.arguments || {});
                const text = typeof res === 'string' ? res : JSON.stringify(res, null, 1);
                return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
            } catch (e) {
                return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String((e as Error).message || e) }], isError: true } };
            }
        }
        if (method === 'resources/list') return { jsonrpc: '2.0', id, result: { resources: [] } };
        if (method === 'prompts/list') return { jsonrpc: '2.0', id, result: { prompts: ATAJOS } };
        if (method === 'prompts/get') {
            const atajo = ATAJOS.find(x => x.name === params?.name);
            if (!atajo) return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Atajo desconocido' } };
            const text = await textoAtajo(userId, atajo.name);
            return { jsonrpc: '2.0', id, result: { description: atajo.description, messages: [{ role: 'user', content: { type: 'text', text } }] } };
        }
        return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Método no soportado: ' + method } };
    } catch (e) {
        console.error(e);
        return { jsonrpc: '2.0', id, error: { code: -32603, message: 'Error interno' } };
    }
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    const token = new URL(req.url).pathname.split('/').filter(Boolean).pop() || '';
    const userId = await usuarioDelToken(token);
    if (!userId) return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Enlace de Bitácora no válido o revocado' } }, 401);
    // Sin flujo de eventos del servidor: todas las respuestas van en el
    // propio POST, como permite el transporte HTTP de MCP.
    if (req.method !== 'POST') return new Response('Método no permitido', { status: 405, headers: { ...cors, Allow: 'POST' } });
    let cuerpo: any;
    try { cuerpo = await req.json(); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON no válido' } }, 400); }
    if (Array.isArray(cuerpo)) {
        const res = (await Promise.all(cuerpo.map(m => responder(userId, m)))).filter(Boolean);
        return res.length ? json(res) : new Response(null, { status: 202, headers: cors });
    }
    const res = await responder(userId, cuerpo);
    return res ? json(res) : new Response(null, { status: 202, headers: cors });
});
