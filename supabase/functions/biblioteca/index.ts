// Edge Function: biblioteca
//
// Lectura para BiblioTec (la biblioteca 3D, repositorio jaandrix/BiblioTec).
// BiblioTec manda el código que el usuario genera en Ajustes → conexiones →
// «bibliotec.» en la cabecera x-bibliotec, y recibe su Ocio y sus
// Coleccionables con lo justo para montar la biblioteca. Solo lee: el token
// vive en conector_tokens con nombre «bibliotec», y bitacora-mcp y entrada lo
// rechazan, así que no sirve para apuntar ni cambiar nada.
//   supabase functions deploy biblioteca --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'x-bibliotec, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function sha256(texto: string) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function usuario(token: string) {
    if (!/^[a-f0-9]{48,128}$/.test(token)) return null;
    const hash = await sha256(token);
    const { data } = await sb.from('conector_tokens').select('user_id, nombre').eq('token_hash', hash).maybeSingle();
    if (!data || data.nombre !== 'bibliotec') return null;
    const { data: acceso } = await sb.rpc('tiene_acceso', { p_user: data.user_id });
    if (!acceso) return 'sin-acceso';
    sb.from('conector_tokens').update({ ultimo_uso: new Date().toISOString() }).eq('token_hash', hash).then(() => {});
    return data.user_id as string;
}

const TIPOS: Record<string, string> = { book: 'libro', movie: 'pelicula', series: 'serie', game: 'videojuego' };

Deno.serve(async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'GET') return json({ error: 'solo lectura' }, 405);
    const user = await usuario(req.headers.get('x-bibliotec') || '');
    if (!user) return json({ error: 'código no válido o revocado' }, 401);
    if (user === 'sin-acceso') return json({ error: 'la suscripción de Bitácora de esta cuenta ha terminado' }, 402);

    const { data: fila, error } = await sb.from('bitacora').select('data').eq('user_id', user).maybeSingle();
    if (error) return json({ error: 'no se han podido leer los datos' }, 500);
    const d = fila?.data || {};

    const ocio = (d.entries || [])
        .filter((e: any) => TIPOS[e.type])
        .map((e: any) => ({
            id: String(e.id),
            tipo: TIPOS[e.type],
            titulo: e.title || '',
            autor: e.author || null,
            anio: e.year || null,
            portada: e.portada || null,
            estado: e.status || null,
            valoracion: e.rating || null,
            fecha: e.date || e.createdAt || null,
            etiquetas: e.tags || e.etiquetas || [],
        }));

    const categorias = new Map((d.collectibleCategories || []).map((c: any) => [c.id, c.name]));
    const coleccionables = (d.collectibles || []).map((c: any) => ({
        id: String(c.id),
        nombre: c.name || '',
        categoria: categorias.get(c.category) || c.category || '',
        esCarta: c.category === 'cat_cartas' || /^cartas?$/i.test(String(categorias.get(c.category) || '').trim()),
        carta: c.carta || null,
        mercadoId: c.mercadoId || null,
        alta: c.createdAt || null,
    }));

    return json({ version: 1, ocio, coleccionables });
});
