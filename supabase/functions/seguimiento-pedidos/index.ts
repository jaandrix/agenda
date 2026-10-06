// Edge Function: seguimiento-pedidos
//
// Seguimiento automático de los pedidos de "actualizaciones." enviados con
// InPost (lo que usa Vinted en España). No hay API pública: se usa la misma
// que la web de seguimiento de InPost, que pide un token que va dentro de la
// propia página (atributo token="..."), así que primero se carga la página y
// luego se consulta /api/tracking. Si InPost cambia su web, esto es lo que
// habría que adaptar.
//
// Dos formas de llamarla:
// - pg_cron cada 2 horas, con x-internal-secret (AVISOS_SECRET): todos los
//   usuarios con pedidos de InPost en curso (ver supabase/sql/seguimiento_pedidos.sql).
// - La app ("actualizar." en un pedido), con el JWT del usuario: solo los suyos.
// Para probar sin guardar ni avisar: {"simular": true}. Para consultar un
// envío suelto: {"probar": {"numero": "32916353", "marca": "V1"}}.
//
// Se despliega sin verificación de JWT (la comprueba ella):
//   supabase functions deploy seguimiento-pedidos --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const sb = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-internal-secret, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const ORDEN = ['pedido', 'enviado', 'transito', 'reparto', 'entregado'];

let tokenInpost: string | null = null;
async function consultarInpost(numero: string, marca: string) {
    const pagina = `https://www.inpost.es/segimiento-de-paquete/?country=ES&exp=${encodeURIComponent(numero)}&language=ES`;
    if (!tokenInpost) {
        const html = await (await fetch(pagina, { headers: { 'User-Agent': UA } })).text();
        tokenInpost = html.match(/ token="([^"]+)"/)?.[1] || null;
        if (!tokenInpost) throw new Error('InPost: sin token en la página');
    }
    const url = `https://www.inpost.es/api/tracking?shipment=${encodeURIComponent(numero)}&postcode=&brand=${encodeURIComponent(marca)}&codePays=es`;
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', Referer: pagina, RequestVerificationToken: tokenInpost } });
    if (!res.ok) throw new Error(`InPost respondió ${res.status}`);
    return (await res.json())?.Expedition || null;
}

// Pasa la respuesta de InPost a la escala de Bitácora (pedido → entregado).
function interpretar(exp: any) {
    const eventos = (exp?.Evenements || []).map((e: any) => ({ fecha: String(e.Date || '').slice(0, 16), texto: String(e.Libelle || '').replace(/\s+/g, ' ').trim(), punto: e.DetailPointRelais }))
        .filter((e: any) => e.texto).sort((a: any, b: any) => a.fecha.localeCompare(b.fecha));
    const etapas = exp?.SuiviParEtapes || {};
    const paso = Math.max(0, ...Object.values(etapas).filter((x: any) => x?.Evenement).map((x: any) => Number(x.Numero) || 0));
    const ultimo = eventos[eventos.length - 1];
    let estado = 'pedido', nota = ultimo ? ultimo.texto : '';
    if (paso >= 5) { estado = 'entregado'; nota = 'Entregado.'; }
    else if (paso === 4) {
        estado = 'reparto';
        const p = [...eventos].reverse().find((e: any) => e.punto?.Adresse)?.punto?.Adresse;
        nota = 'Listo para recoger en el Punto Pack' + (p ? `: ${[p.Libelle, p.AdresseLigne1, p.Ville].filter(Boolean).join(', ')}` : '') + '.';
    }
    else if (paso === 3) estado = 'reparto';
    else if (paso === 2) estado = eventos.some((e: any) => /centro|enviado desde/i.test(e.texto)) ? 'transito' : 'enviado';
    const estimada = String(exp?.EstimatedDeliveryDate || '');
    return {
        estado, nota, paso,
        fechaEstimada: estimada && !estimada.startsWith('0001') ? estimada.slice(0, 10) : '',
        eventos: eventos.slice(-12).map((e: any) => ({ fecha: e.fecha, texto: e.texto })),
    };
}

// Un pedido es de InPost si lo dice su transportista o si su enlace (o el
// propio campo de seguimiento) es una página de seguimiento de inpost.es.
function datosInpost(p: any): { numero: string, marca: string } | null {
    if (!p || p.estado === 'entregado') return null;
    for (const texto of [p.url, p.seguimiento]) {
        const m = String(texto || '').match(/inpost\.[a-z]+\/.*[?&]exp=(\w+)/i);
        if (m) {
            const ens = String(texto).match(/[?&]ens=(\w+)/i)?.[1] || '';
            return { numero: m[1], marca: ens.slice(0, 2) || p.marca || 'V1' };
        }
    }
    if (p.transportista === 'inpost' && p.seguimiento) return { numero: String(p.seguimiento), marca: p.marca || 'V1' };
    return null;
}

async function avisar(userId: string, p: any, nota: string) {
    await fetch(SUPABASE_URL + '/functions/v1/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': Deno.env.get('INTERNAL_PUSH_SECRET') || '' },
        body: JSON.stringify({ user_id: userId, title: String(p.titulo || 'pedido').toLowerCase().replace(/[.\s]+$/, '') + '.', body: nota || 'Tu pedido ha cambiado de estado.', url: '/', tag: 'pedido-' + p.id }),
    }).catch(() => {});
}

async function procesarUsuario(userId: string, opciones: any) {
    const { data: fila } = await sb.from('bitacora').select('data').eq('user_id', userId).maybeSingle();
    const datos = fila?.data || {};
    const pedidos = Array.isArray(datos.pedidos) ? datos.pedidos : [];
    const cambios: Record<string, any> = {};
    const informe: any[] = [];
    for (const p of pedidos.filter((p: any) => datosInpost(p) && (!opciones.pedido || p.id === opciones.pedido))) {
        try {
            const envio = datosInpost(p)!;
            const r = interpretar(await consultarInpost(envio.numero, envio.marca));
            const ahora = new Date().toISOString();
            const avanza = ORDEN.indexOf(r.estado) > ORDEN.indexOf(p.estado || 'pedido');
            const nuevo: any = { seguimientoAuto: { ultimaConsulta: ahora, eventos: r.eventos, paso: r.paso } };
            if (r.fechaEstimada) nuevo.fechaEstimada = r.fechaEstimada;
            if (avanza) {
                nuevo.estado = r.estado;
                nuevo.historial = [...(p.historial || []), { fecha: ahora.slice(0, 10), estado: r.estado, nota: r.nota || undefined }];
                if (r.estado === 'entregado') nuevo.fechaEntrega = ahora.slice(0, 10);
            } else if (r.nota && r.nota !== (p.historial || []).slice(-1)[0]?.nota) {
                nuevo.historial = [...(p.historial || []), { fecha: ahora.slice(0, 10), estado: p.estado, nota: r.nota }];
            }
            cambios[p.id] = nuevo;
            informe.push({ pedido: p.titulo, de: p.estado, a: avanza ? r.estado : p.estado, nota: r.nota });
            if (avanza && !opciones.simular && datos.preferenciasAvisos?.pedidos !== false) await avisar(userId, p, r.nota);
        } catch (e) {
            informe.push({ pedido: p.titulo, error: String((e as Error).message || e) });
        }
    }
    if (Object.keys(cambios).length && !opciones.simular) {
        // Se vuelve a leer justo antes de escribir y solo se tocan los campos
        // del seguimiento de cada pedido: lo demás puede haber cambiado en la
        // app mientras se consultaba InPost.
        const { data: ultima } = await sb.from('bitacora').select('data').eq('user_id', userId).maybeSingle();
        const actuales = Array.isArray(ultima?.data?.pedidos) ? ultima.data.pedidos : [];
        const fusion = actuales.map((p: any) => cambios[p.id] ? { ...p, ...cambios[p.id] } : p);
        const { error } = await sb.rpc('bitacora_actualizar_pedidos', { p_user: userId, p_pedidos: fusion });
        if (error) informe.push({ error: 'no se pudo guardar: ' + error.message });
    }
    return informe;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    const opciones = await req.json().catch(() => ({}));
    const interno = req.headers.get('x-internal-secret');
    const secreto = Deno.env.get('AVISOS_SECRET');
    let usuarios: string[] = [];
    if (secreto && interno === secreto) {
        if (opciones.probar) {
            try { return json(interpretar(await consultarInpost(String(opciones.probar.numero), String(opciones.probar.marca || 'V1')))); }
            catch (e) { return json({ error: String((e as Error).message || e) }, 502); }
        }
        if (opciones.user_id) usuarios = [opciones.user_id];
        else {
            const { data } = await sb.from('bitacora').select('user_id').not('data->pedidos', 'is', null);
            usuarios = (data || []).map((f: any) => f.user_id);
        }
    } else {
        const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
        const { data: { user } } = await sb.auth.getUser(jwt);
        if (!user) return json({ error: 'No autorizado' }, 401);
        usuarios = [user.id];
    }
    const resumen: any[] = [];
    for (const u of usuarios) {
        const informe = await procesarUsuario(u, opciones);
        if (informe.length) resumen.push({ usuario: u.slice(0, 8), informe });
    }
    return json({ resumen });
});
