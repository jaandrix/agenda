// Edge Function: entrada
//
// Dos puertas para meter cosas en Bitácora sin abrirla:
//
// - Siri y los Atajos del iPhone: POST ?t=TOKEN con { "texto": "cena con
//   Marta el viernes a las 9" }. Lo encola para que la app lo apunte con su
//   propio intérprete (el de «apuntar»), y responde una frase para que Siri
//   la lea. Token con nombre «siri».
// - El correo: lo que llega a <TOKEN>@in.appbitacora.es (ForwardEmail lo
//   reenvía aquí como JSON). Las confirmaciones de vuelos, hoteles, trenes,
//   entradas, restaurantes y envíos suelen llevar dentro sus datos en
//   schema.org (lo que usa Gmail para sus tarjetas): de ahí sale un evento
//   o un envío. Si no los lleva, el correo va a la inbox. Token «correo».
//
// Los tokens viven en conector_tokens (solo su SHA-256), pero estos dos solo
// sirven para apuntar: el servidor del conector los rechaza.
// Despliegue: supabase functions deploy entrada --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const texto = (body: string, status = 200) => new Response(body, { status, headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function sha256(t: string) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function usuarioDe(token: string, nombre: 'siri' | 'correo') {
    if (!/^[a-f0-9]{40,128}$/.test(token)) return null;
    const hash = await sha256(token);
    const { data } = await sb.from('conector_tokens').select('user_id, nombre').eq('token_hash', hash).maybeSingle();
    if (!data || data.nombre !== nombre) return null;
    const { data: acceso } = await sb.rpc('tiene_acceso', { p_user: data.user_id });
    if (!acceso) return null;
    sb.from('conector_tokens').update({ ultimo_uso: new Date().toISOString() }).eq('token_hash', hash).then(() => {});
    return data.user_id as string;
}

async function encolar(userId: string, op: any) {
    const { error } = await sb.from('conector_bandeja').insert({ user_id: userId, op });
    if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- correo
const limpio = (t: unknown) => String(t ?? '').replace(/\s+/g, ' ').trim();
const nombreDe = (x: any) => limpio(typeof x === 'string' ? x : x?.name || x?.iataCode || '');
// La fecha y la hora tal como las escribe la reserva (la hora local del
// sitio, que es la que importa), sin pasarlas a otra zona.
function fechaHora(v: unknown) {
    const m = String(v || '').match(/(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
    return m ? { fecha: m[1], hora: m[2] || '' } : null;
}

const diaLargo = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

function bloquesJsonLd(html: string): any[] {
    const res: any[] = [];
    const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html))) {
        try {
            const d = JSON.parse(m[1].replace(/&quot;/g, '"').trim());
            const lista = Array.isArray(d) ? d : d['@graph'] ? d['@graph'] : [d];
            lista.forEach((x: any) => x && typeof x === 'object' && res.push(x));
        } catch (_) { /* bloque roto: se ignora */ }
    }
    return res;
}

const tipoDe = (x: any) => String(Array.isArray(x?.['@type']) ? x['@type'][0] : x?.['@type'] || '').replace(/^.*\//, '');

function opsDeReserva(x: any): any[] {
    const tipo = tipoDe(x);
    const r = x.reservationFor || {};
    const num = limpio(x.reservationNumber || x.confirmationNumber || '');
    const notas = num ? `Reserva ${num}` : '';
    if (tipo === 'FlightReservation') {
        const s = fechaHora(r.departureTime);
        if (!s) return [];
        const vuelo = `${limpio(r.airline?.iataCode || r.airline?.name || '')}${limpio(r.flightNumber || '')}`;
        const de = nombreDe(r.departureAirport?.iataCode ? r.departureAirport.iataCode : r.departureAirport), a = nombreDe(r.arrivalAirport?.iataCode ? r.arrivalAirport.iataCode : r.arrivalAirport);
        return [{ tipo: 'evento', titulo: `Vuelo ${vuelo}${de && a ? ` ${de} - ${a}` : ''}`.trim(), fecha: s.fecha, hora: s.hora, lugar: nombreDe(r.departureAirport), notas, eventType: 'viajes' }];
    }
    if (tipo === 'TrainReservation' || tipo === 'BusReservation') {
        const s = fechaHora(r.departureTime);
        if (!s) return [];
        const de = nombreDe(r.departureStation || r.departureBusStop), a = nombreDe(r.arrivalStation || r.arrivalBusStop);
        return [{ tipo: 'evento', titulo: `${tipo === 'TrainReservation' ? 'Tren' : 'Autobús'}${de && a ? ` ${de} - ${a}` : ''}`, fecha: s.fecha, hora: s.hora, lugar: de, notas: [limpio(r.trainNumber || r.busNumber || ''), notas].filter(Boolean).join(', '), eventType: 'viajes' }];
    }
    if (tipo === 'LodgingReservation') {
        const s = fechaHora(x.checkinTime || x.checkinDate), f = fechaHora(x.checkoutTime || x.checkoutDate);
        if (!s) return [];
        return [{ tipo: 'evento', titulo: `Entrada en ${nombreDe(r) || 'el alojamiento'}`, fecha: s.fecha, hora: s.hora, lugar: limpio(r.address?.streetAddress || r.address?.addressLocality || (typeof r.address === 'string' ? r.address : '')), notas: [f ? `Salida el ${diaLargo(f.fecha)}${f.hora ? ' a las ' + f.hora : ''}` : '', notas].filter(Boolean).join('. '), eventType: 'viajes' }];
    }
    if (tipo === 'FoodEstablishmentReservation') {
        const s = fechaHora(x.startTime || x.startDate);
        if (!s) return [];
        return [{ tipo: 'evento', titulo: nombreDe(r) || 'Restaurante', fecha: s.fecha, hora: s.hora, lugar: limpio(r.address?.streetAddress || ''), notas: [x.partySize ? `Mesa para ${x.partySize}` : '', notas].filter(Boolean).join('. '), eventType: 'social' }];
    }
    if (tipo === 'EventReservation') {
        const s = fechaHora(r.startDate);
        if (!s) return [];
        return [{ tipo: 'evento', titulo: nombreDe(r) || 'Evento', fecha: s.fecha, hora: s.hora, lugar: nombreDe(r.location), notas, eventType: /concierto|concert|tour|festival/i.test(nombreDe(r)) ? 'concierto' : /partido|vs\.?|match|liga/i.test(nombreDe(r)) ? 'deportes' : 'otro' }];
    }
    if (tipo === 'RentalCarReservation') {
        const s = fechaHora(x.pickupTime);
        if (!s) return [];
        return [{ tipo: 'evento', titulo: `Recoger el coche de alquiler${r.brand?.name ? ` (${limpio(r.brand.name)})` : ''}`, fecha: s.fecha, hora: s.hora, lugar: nombreDe(x.pickupLocation), notas, eventType: 'viajes' }];
    }
    if (tipo === 'ParcelDelivery') {
        const pedido = x.partOfOrder || {};
        return [{ tipo: 'pedido', titulo: limpio(x.itemShipped?.name || pedido.description || 'Pedido'), tienda: limpio(pedido.merchant?.name || x.provider?.name || ''), seguimiento: limpio(x.trackingNumber || ''), transportista: limpio(x.carrier?.name || x.provider?.name || ''), url: limpio(x.trackingUrl || ''), fechaEstimada: fechaHora(x.expectedArrivalUntil || x.expectedArrivalFrom)?.fecha || '', fechaPedido: fechaHora(pedido.orderDate)?.fecha || '' }];
    }
    return [];
}

function destinatarios(c: any): string[] {
    const l: string[] = [];
    const meter = (v: any) => {
        if (!v) return;
        if (typeof v === 'string') v.split(/[,;\s]+/).forEach(x => l.push(x));
        else if (Array.isArray(v)) v.forEach(meter);
        else if (v.address) l.push(v.address);
        else if (v.value) meter(v.value);
        else if (v.text) meter(v.text);
    };
    meter(c.recipients); meter(c.session?.recipient); meter(c.to); meter(c.cc);
    return l.map(x => x.replace(/[<>"]/g, '').toLowerCase()).filter(x => x.includes('@'));
}

async function recibirCorreo(c: any) {
    const tokens = destinatarios(c).map(x => x.split('@')[0].replace(/^[^+]*\+/, '')).filter(x => /^[a-f0-9]{40,128}$/.test(x));
    let userId: string | null = null;
    for (const t of tokens) { userId = await usuarioDe(t, 'correo'); if (userId) break; }
    if (!userId) return json({ ok: false }, 200);
    const asunto = limpio(c.subject || '').slice(0, 200);
    const de = limpio(c.from?.text || c.from?.value?.[0]?.address || c.from || '').slice(0, 120);
    const ops = bloquesJsonLd(String(c.html || '')).flatMap(opsDeReserva).slice(0, 8);
    if (ops.length) { for (const op of ops) await encolar(userId, { ...op, origen: 'correo', asunto }); }
    else await encolar(userId, { tipo: 'correo', origen: 'correo', asunto, de, extracto: limpio(c.text || '').slice(0, 500) });
    return json({ ok: true, apuntados: ops.length });
}

// ---------------------------------------------------------------- Siri
async function recibirSiri(req: Request, url: URL) {
    const token = url.searchParams.get('t') || (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const userId = await usuarioDe(token, 'siri');
    if (!userId) return texto('Este atajo ya no está conectado a Bitácora. Créalo otra vez desde Ajustes.', 401);
    let frase = url.searchParams.get('texto') || '';
    if (!frase && req.method === 'POST') {
        const tipo = req.headers.get('content-type') || '';
        if (tipo.includes('json')) { const b = await req.json().catch(() => ({})); frase = String(b.texto || b.text || b.texto_dictado || ''); }
        else frase = await req.text();
    }
    frase = limpio(frase).slice(0, 500);
    if (!frase) return texto('No he oído qué apuntar.', 400);
    await encolar(userId, { tipo: 'apuntar', texto: frase, origen: 'siri' });
    return texto(`Apuntado en Bitácora: ${frase}.`);
}

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
    const url = new URL(req.url);
    // El correo llega siempre desde los servidores de ForwardEmail: por IP
    // frenaría a todos a la vez, así que su margen es mucho mayor.
    const correo = url.pathname.endsWith('/correo');
    if (demasiadas((correo ? 'correo:' : 'siri:') + ipDe(req), correo ? 600 : 30)) return texto('Demasiadas peticiones. Espera un minuto.', 429);
    try {
        if (url.pathname.endsWith('/correo')) {
            const c = await req.json().catch(() => null);
            if (!c) return json({ ok: false }, 400);
            return await recibirCorreo(c);
        }
        return await recibirSiri(req, url);
    } catch (e) {
        console.error(e);
        return texto('Bitácora no ha podido apuntarlo ahora. Prueba otra vez en un momento.', 500);
    }
});
