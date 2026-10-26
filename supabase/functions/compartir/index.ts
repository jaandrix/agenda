// Edge Function: compartir
//
// Cosas que se comparten con un enlace y que la otra persona abre sin
// cuenta ni app (appbitacora.es/c/#ID): una quedada para votar fechas, una
// invitación a un evento (voy, quizá, no voy), una lista que todos pueden
// tachar y ampliar, y el plan de un viaje (solo lectura).
//
// Se guarda en Storage, no en tablas: <id>/meta.json lo escribe solo el
// dueño y cada respuesta es un archivo aparte en <id>/ev/, así dos amigos
// que contestan a la vez no se pisan. El enlace (96 bits al azar) es la
// única llave para leer y responder; crear, cerrar y borrar exigen la
// sesión del dueño. Cuando alguien responde, al dueño le llega un aviso.
// Despliegue: supabase functions deploy compartir --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const sb = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const BUCKET = 'compartidos';
const TIPOS = ['quedada', 'invitacion', 'lista', 'viaje'];
const MAX_EVENTOS = 400;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

let bucketListo = false;
async function asegurarBucket() {
    if (bucketListo) return;
    const { data } = await sb.storage.getBucket(BUCKET);
    if (!data) await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 65536 });
    bucketListo = true;
}

const nuevoId = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12)))).replace(/\+/g, '-').replace(/\//g, '_');
const idValido = (id: unknown) => typeof id === 'string' && /^[A-Za-z0-9_-]{16}$/.test(id);
// Los identificadores de las cosas de una lista acaban dentro de botones de
// la app del dueño: solo letras, números, guion y guion bajo.
const idItem = (v: unknown) => String(v ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
const txt = (v: unknown, max = 200) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

async function leerJson(ruta: string) {
    const { data } = await sb.storage.from(BUCKET).download(ruta);
    if (!data) return null;
    try { return JSON.parse(await data.text()); } catch (_) { return null; }
}
async function escribirJson(ruta: string, v: unknown) {
    const { error } = await sb.storage.from(BUCKET).upload(ruta, new Blob([JSON.stringify(v)], { type: 'application/json' }), { upsert: true, contentType: 'application/json' });
    if (error) throw new Error(error.message);
}

async function usuario(req: Request) {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return null;
    const { data } = await sb.auth.getUser(jwt);
    return data?.user?.id || null;
}

async function eventos(id: string) {
    const { data } = await sb.storage.from(BUCKET).list(`${id}/ev`, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
    const nombres = (data || []).map(f => f.name).filter(n => n.endsWith('.json'));
    const lista = await Promise.all(nombres.map(n => leerJson(`${id}/ev/${n}`)));
    return lista.filter(Boolean);
}

// Lo que cada tipo admite como respuesta, ya limpio.
function respuestaValida(tipo: string, ev: any) {
    const pid = txt(ev?.pid, 40), nombre = txt(ev?.nombre, 40);
    if (tipo === 'quedada' && ev?.tipo === 'voto') {
        const idx = (l: unknown) => (Array.isArray(l) ? l : []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < 20).slice(0, 20);
        if (!pid || !nombre) return null;
        return { tipo: 'voto', pid, nombre, si: idx(ev.si), quiza: idx(ev.quiza), nota: txt(ev.nota, 200) };
    }
    if (tipo === 'invitacion' && ev?.tipo === 'rsvp') {
        if (!pid || !nombre || !['si', 'quiza', 'no'].includes(ev.va)) return null;
        return { tipo: 'rsvp', pid, nombre, va: ev.va, mas: Math.max(0, Math.min(9, Number(ev.mas) || 0)), nota: txt(ev.nota, 200) };
    }
    if (tipo === 'lista') {
        if (ev?.tipo === 'anadir' && txt(ev.texto, 80)) return { tipo: 'anadir', item: idItem(ev.item) || nuevoId(), texto: txt(ev.texto, 80), nombre };
        if (ev?.tipo === 'marcar' && idItem(ev.item)) return { tipo: 'marcar', item: idItem(ev.item), hecho: !!ev.hecho, nombre };
        if (ev?.tipo === 'quitar' && idItem(ev.item)) return { tipo: 'quitar', item: idItem(ev.item), nombre };
    }
    return null;
}

async function avisarDueno(meta: any, ev: any) {
    const titulo = txt(meta.datos?.titulo, 60);
    let texto = '';
    if (ev.tipo === 'voto') texto = ev.si.length ? `Puede ${ev.si.length === 1 ? 'una de las fechas' : ev.si.length + ' de las fechas'} de «${titulo}».` : `No puede en ninguna fecha de «${titulo}».`;
    else if (ev.tipo === 'rsvp') texto = ev.va === 'si' ? `Va a «${titulo}»${ev.mas ? ` con ${ev.mas} más` : ''}.` : ev.va === 'quiza' ? `Quizá vaya a «${titulo}».` : `No puede ir a «${titulo}».`;
    else if (ev.tipo === 'anadir') texto = `Ha añadido «${ev.texto}» a «${titulo}».`;
    else return;
    await fetch(SUPABASE_URL + '/functions/v1/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': Deno.env.get('INTERNAL_PUSH_SECRET') || '' },
        body: JSON.stringify({ user_id: meta.owner, title: `${ev.nombre || 'Alguien'} ha respondido.`, body: texto, url: `/?compartido=${meta.id}`, tag: `compartido:${meta.id}` }),
    }).catch(() => {});
}

const publico = (meta: any, evs: unknown[]) => ({ id: meta.id, tipo: meta.tipo, autor: meta.autor, creado: meta.creado, actualizado: meta.actualizado, datos: meta.datos, cierre: meta.cierre || null, eventos: evs });

// Límite de peticiones por minuto y por quien llama (IP o token). Vive en la
// memoria de cada instancia: no es exacto, pero frena a quien bombardee la
// función sin coste extra.
const ventanas = new Map<string, { inicio: number; n: number }>();
function demasiadas(clave: string, max: number) {
    const ahora = Date.now();
    const v = ventanas.get(clave);
    if (!v || ahora - v.inicio > 60000) { ventanas.set(clave, { inicio: ahora, n: 1 }); if (ventanas.size > 5000) ventanas.clear(); return false; }
    v.n++;
    return v.n > max;
}
const ipDe = (req: Request) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'sin-ip';

Deno.serve(async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
    if (demasiadas(ipDe(req), 90)) return json({ error: 'Demasiadas peticiones. Espera un minuto.' }, 429);
    try {
        await asegurarBucket();
        const b = await req.json().catch(() => ({}));
        const accion = b.accion;

        if (accion === 'crear') {
            const uid = await usuario(req);
            if (!uid) return json({ error: 'Sin sesión' }, 401);
            if (!TIPOS.includes(b.tipo)) return json({ error: 'Tipo desconocido' }, 400);
            const datos = b.datos || {};
            if (JSON.stringify(datos).length > 40000) return json({ error: 'Demasiado grande' }, 400);
            const id = nuevoId();
            const ahora = new Date().toISOString();
            await escribirJson(`${id}/meta.json`, { id, tipo: b.tipo, owner: uid, autor: txt(b.autor, 40), creado: ahora, actualizado: ahora, datos, cierre: null });
            return json({ id });
        }

        if (!idValido(b.id)) return json({ error: 'Enlace no válido' }, 400);
        const meta = await leerJson(`${b.id}/meta.json`);
        if (!meta) return json({ error: 'Este enlace ya no existe' }, 404);

        if (accion === 'ver') return json(publico(meta, await eventos(b.id)));

        if (accion === 'responder') {
            const ev = respuestaValida(meta.tipo, b.ev);
            if (!ev) return json({ error: 'Respuesta no válida' }, 400);
            if (meta.cierre && meta.tipo === 'quedada') return json({ error: 'La quedada ya está cerrada' }, 409);
            const { data: ya } = await sb.storage.from(BUCKET).list(`${b.id}/ev`, { limit: MAX_EVENTOS + 1 });
            if ((ya || []).length >= MAX_EVENTOS) return json({ error: 'Este enlace ya tiene demasiadas respuestas' }, 429);
            const marca = `${Date.now().toString().padStart(15, '0')}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
            const guardado = { ...ev, cuando: new Date().toISOString() };
            await escribirJson(`${b.id}/ev/${marca}.json`, guardado);
            if (b.ev?.dueno !== true) await avisarDueno(meta, ev);
            return json(publico(meta, await eventos(b.id)));
        }

        const uid = await usuario(req);
        if (!uid || uid !== meta.owner) return json({ error: 'Solo quien lo creó puede cambiarlo' }, 403);

        if (accion === 'actualizar') {
            if (b.datos !== undefined) {
                if (JSON.stringify(b.datos).length > 40000) return json({ error: 'Demasiado grande' }, 400);
                meta.datos = b.datos;
            }
            if (b.cierre !== undefined) meta.cierre = b.cierre;
            meta.actualizado = new Date().toISOString();
            await escribirJson(`${b.id}/meta.json`, meta);
            return json(publico(meta, await eventos(b.id)));
        }

        if (accion === 'borrar') {
            const { data } = await sb.storage.from(BUCKET).list(`${b.id}/ev`, { limit: 1000 });
            const rutas = [`${b.id}/meta.json`, ...(data || []).map(f => `${b.id}/ev/${f.name}`)];
            await sb.storage.from(BUCKET).remove(rutas);
            return json({ ok: true });
        }

        return json({ error: 'Acción desconocida' }, 400);
    } catch (e) {
        console.error(e);
        return json({ error: 'No se ha podido completar' }, 500);
    }
});
