// Edge Function: correo-semanal
//
// El correo opcional de los domingos (lo enciende cada cuenta en Ajustes → conexiones). A las 18:00 de Madrid,
// a quien lo tenga activo y acceso a Bitácora: lo que viene la semana siguiente (planes, exámenes y entregas,
// cumpleaños) y cómo fue la que acaba (tareas hechas, días con rutinas, gasto), con un botón para abrir la app y
// un enlace de baja firmado. Lo envía Resend.
//
// La llama pg_cron cada hora los domingos (supabase/sql/correo_semanal.sql) y una vez por persona y domingo
// (clave en avisos_enviados). Para la baja, GET ?baja=<user_id>&f=<firma>.
// Se despliega sin verificación de JWT:  supabase functions deploy correo-semanal --no-verify-jwt
// Secretos: AVISOS_SECRET (el de pg_cron), RESEND_KEY y CORREO_SECRET (firma de la baja).
// Para probar sin enviar: POST {"forzar": true, "simular": true, "user_id": "..."}.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const sb = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const ZONA = 'Europe/Madrid';
const HORA = 18;
const REMITE = 'Bitácora <semana@appbitacora.es>';
const APP = 'https://appbitacora.es';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const esc = (t: unknown) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const euros = (n: number) => (Math.round(n * 100) / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const horaMadrid = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', hour12: false }).format(new Date()));
const sumarDias = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const diaSemana = (iso: string) => DIAS[new Date(iso + 'T12:00:00Z').getUTCDay()];
const esLog = (e: any) => e?.calendarLog || /^(weekly_task_done_|planner_done_|recurring_done_)/.test(e?.id || '');
const propio = (x: any) => !(x?.ejemplo === true || String(x?.id || '').includes('ejemplo_'));

async function firma(userId: string) {
    const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(Deno.env.get('CORREO_SECRET') || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const f = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode('baja:' + userId));
    return [...new Uint8Array(f)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function contenido(data: any, hoy: string) {
    const entries = (data.entries || []).filter((e: any) => e && propio(e));
    const desde = sumarDias(hoy, 1), hasta = sumarDias(hoy, 7), antes = sumarDias(hoy, -6);
    const viene = entries.filter((e: any) => e.type === 'event' && !esLog(e) && e.date >= desde && e.date <= hasta)
        .sort((a: any, b: any) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    const estudios: string[] = [];
    (data.studies?.subjects || []).filter(propio).forEach((s: any) => {
        (s.exams || []).forEach((x: any) => { if (x?.date >= desde && x?.date <= hasta) estudios.push(`Examen de ${s.name}, el ${diaSemana(x.date)}`); });
        (s.assignments || []).forEach((x: any) => { if (x?.date >= desde && x?.date <= hasta && !x.done) estudios.push(`Entrega de ${s.name}, el ${diaSemana(x.date)}`); });
    });
    const cumples: string[] = [];
    entries.filter((e: any) => e.type === 'birthday' && e.birthDate).forEach((e: any) => {
        for (let k = 1; k <= 7; k++) { const f = sumarDias(hoy, k); if (f.slice(5) === String(e.birthDate).slice(5)) cumples.push(`${e.title}, el ${diaSemana(f)}`); }
    });
    const hechas = entries.filter((e: any) => /^(planner_done_|recurring_done_)/.test(e.id || '') && e.date >= antes && e.date <= hoy).length;
    const diasRutina = new Set<string>();
    (data.habits || []).filter(propio).forEach((h: any) => Object.keys(h.completadas || {}).forEach(d => { if (d >= antes && d <= hoy && h.completadas[d]) diasRutina.add(d); }));
    const gasto = (data.financePro?.transactions || []).filter((t: any) => propio(t) && t.type === 'expense' && !t.viaje && !t.ahorro && t.date >= antes && t.date <= hoy).reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);
    return { viene, estudios, cumples, hechas, diasRutina: diasRutina.size, gasto };
}

function html(c: ReturnType<typeof contenido>, baja: string) {
    const fila = (t: string) => `<tr><td style="padding:6px 0;border-bottom:1px solid #e4e0d6;font-size:15px;color:#161514">${t}</td></tr>`;
    const plan = (e: any) => fila(`<b>${esc(diaSemana(e.date))}${e.time ? ' ' + esc(e.time) : ''}.</b> ${esc(e.title)}${e.place ? `, <span style="color:#6e6a63">${esc(e.place)}</span>` : ''}`);
    const bloques = [
        c.viene.length ? `<h2 style="font-size:15px;margin:24px 0 6px;color:#6e6a63">la semana que viene.</h2><table width="100%" cellspacing="0" cellpadding="0">${c.viene.slice(0, 8).map(plan).join('')}</table>${c.viene.length > 8 ? `<p style="font-size:13px;color:#6e6a63">y ${c.viene.length - 8} más.</p>` : ''}` : '',
        c.estudios.length ? `<h2 style="font-size:15px;margin:24px 0 6px;color:#6e6a63">estudios.</h2><table width="100%" cellspacing="0" cellpadding="0">${c.estudios.slice(0, 5).map(t => fila(esc(t))).join('')}</table>` : '',
        c.cumples.length ? `<h2 style="font-size:15px;margin:24px 0 6px;color:#6e6a63">cumpleaños.</h2><table width="100%" cellspacing="0" cellpadding="0">${c.cumples.slice(0, 5).map(t => fila(esc(t))).join('')}</table>` : '',
    ].join('');
    const hecho = [c.hechas ? `${c.hechas} tareas hechas` : '', c.diasRutina ? `${c.diasRutina} días con tus rutinas` : '', c.gasto ? `${euros(c.gasto)} de gasto` : ''].filter(Boolean);
    return `<!doctype html><html lang="es"><body style="margin:0;background:#E7E2D9;font-family:Helvetica,Arial,sans-serif">
<table width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px">
<table width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#FFF9F0;border-radius:14px;padding:28px">
<tr><td>
<div style="font-size:20px;font-weight:800;color:#161514">bitácora<span style="color:#EE4B1F">.</span></div>
<h1 style="font-size:26px;line-height:1.15;margin:18px 0 4px;color:#161514">tu semana.</h1>
${hecho.length ? `<p style="font-size:15px;color:#3a3934;margin:0">Esta semana: ${esc(hecho.join(', '))}.</p>` : ''}
${bloques || '<p style="font-size:15px;color:#3a3934">La semana que viene está libre. Buen momento para apuntar lo que quieras hacer.</p>'}
<p style="margin:28px 0 8px"><a href="${APP}/" style="display:inline-block;background:#161514;color:#FFF9F0;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">abrir bitácora.</a></p>
<p style="font-size:12px;color:#6e6a63;margin:24px 0 0">Te llega porque encendiste «correo de los domingos.» en Ajustes. <a href="${baja}" style="color:#6e6a63">No quiero recibirlo más.</a></p>
</td></tr></table></td></tr></table></body></html>`;
}

function texto(c: ReturnType<typeof contenido>, baja: string) {
    const l = ['tu semana.', ''];
    if (c.viene.length) { l.push('La semana que viene:'); c.viene.slice(0, 8).forEach((e: any) => l.push(`- ${diaSemana(e.date)}${e.time ? ' ' + e.time : ''}: ${e.title}`)); l.push(''); }
    if (c.estudios.length) { l.push('Estudios:'); c.estudios.slice(0, 5).forEach(t => l.push('- ' + t)); l.push(''); }
    if (c.cumples.length) { l.push('Cumpleaños:'); c.cumples.slice(0, 5).forEach(t => l.push('- ' + t)); l.push(''); }
    l.push(`Abrir Bitácora: ${APP}/`, '', `Darte de baja: ${baja}`);
    return l.join('\n');
}

Deno.serve(async (req) => {
    const url = new URL(req.url);
    // Baja desde el enlace del correo (GET) o desde el botón de baja del propio programa de correo (POST, List-Unsubscribe).
    if (url.searchParams.get('baja')) {
        const uid = url.searchParams.get('baja')!;
        const ok = /^[0-9a-f-]{36}$/.test(uid) && url.searchParams.get('f') === await firma(uid);
        if (ok) await sb.from('correo_semanal').upsert({ user_id: uid, activo: false, cambiado: new Date().toISOString() });
        const msg = ok ? 'Listo: no te llegará más el correo de los domingos. Puedes volver a encenderlo en Ajustes.' : 'Este enlace no es válido.';
        return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:Helvetica,Arial,sans-serif;background:#E7E2D9;padding:40px"><p style="max-width:420px;margin:auto;font-size:17px">${msg}</p></body>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    const secreto = Deno.env.get('AVISOS_SECRET');
    if (!secreto || req.headers.get('x-internal-secret') !== secreto) return json({ error: 'No autorizado' }, 401);
    const opciones = await req.json().catch(() => ({}));
    const hoy = hoyMadrid();
    const esDomingo = new Date(hoy + 'T12:00:00Z').getUTCDay() === 0;
    if (!opciones.forzar && !(esDomingo && horaMadrid() === HORA)) return json({ hoy, nada: 'no es la hora' });
    const RESEND = Deno.env.get('RESEND_KEY');
    if (!RESEND && !opciones.simular) return json({ error: 'Falta el secreto RESEND_KEY' }, 500);
    let q = sb.from('correo_semanal').select('user_id').eq('activo', true);
    if (opciones.user_id) q = q.eq('user_id', opciones.user_id);
    const { data: filas } = await q;
    const resumen: any[] = [];
    for (const { user_id } of filas || []) {
        const clave = `correo:${hoy}`;
        const { data: ya } = await sb.from('avisos_enviados').select('clave').eq('user_id', user_id).eq('clave', clave).maybeSingle();
        if (ya && !opciones.forzar) continue;
        const { data: acceso } = await sb.rpc('tiene_acceso', { p_user: user_id });
        if (!acceso) continue;
        const { data: u } = await sb.auth.admin.getUserById(user_id);
        const email = u?.user?.email;
        if (!email) continue;
        const { data: fila } = await sb.from('bitacora').select('data').eq('user_id', user_id).maybeSingle();
        const c = contenido(fila?.data || {}, hoy);
        const baja = `${SUPABASE_URL}/functions/v1/correo-semanal?baja=${user_id}&f=${await firma(user_id)}`;
        if (opciones.simular) { resumen.push({ usuario: user_id.slice(0, 8), planes: c.viene.length, estudios: c.estudios.length, cumples: c.cumples.length }); continue; }
        const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: REMITE, to: [email], subject: 'tu semana en bitácora.', html: html(c, baja), text: texto(c, baja), headers: { 'List-Unsubscribe': `<${baja}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }),
        });
        if (r.ok) await sb.from('avisos_enviados').upsert({ user_id, clave });
        resumen.push({ usuario: user_id.slice(0, 8), enviado: r.ok, estado: r.status });
    }
    return json({ hoy, resumen });
});
