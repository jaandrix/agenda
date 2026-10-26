// Edge Function: portadas
//
// Busca portadas para Ocio. Recibe { tipo: 'book' | 'movie' | 'series' |
// 'game', q, anio? } con el JWT del usuario y devuelve candidatas
// [{ titulo, anio, autor?, imagen, fuente }], de mejor a peor:
//   libros      → Open Library y, de respaldo, Google Books
//   series      → TVmaze (y TMDB si hay clave)
//   películas   → TMDB, solo si existe el secreto TMDB_KEY
//   videojuegos → la tienda de Steam (portada vertical 600 × 900)
// Va en el servidor para no depender de CORS ni dejar claves en la app.
//   supabase functions deploy portadas --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const TMDB = Deno.env.get('TMDB_KEY') || '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Candidata = { titulo: string; anio?: string; autor?: string; imagen: string; fuente: string };

async function pedir(url: string) {
    const r = await fetch(url, { headers: { 'User-Agent': 'Bitacora/1.0 (appbitacora.es)' } });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
}

async function libros(q: string): Promise<Candidata[]> {
    const out: Candidata[] = [];
    try {
        const d = await pedir(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=12&fields=title,author_name,first_publish_year,cover_i`);
        for (const x of d.docs || []) if (x.cover_i) out.push({ titulo: x.title, autor: (x.author_name || [])[0], anio: x.first_publish_year ? String(x.first_publish_year) : undefined, imagen: `https://covers.openlibrary.org/b/id/${x.cover_i}-L.jpg`, fuente: 'Open Library' });
    } catch (_) { /* se prueba Google Books */ }
    try {
        const d = await pedir(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=10&printType=books`);
        for (const i of d.items || []) {
            const v = i.volumeInfo || {};
            const img = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail;
            if (img) out.push({ titulo: v.title, autor: (v.authors || [])[0], anio: (v.publishedDate || '').slice(0, 4) || undefined, imagen: img.replace('http://', 'https://').replace('zoom=1', 'zoom=2').replace('&edge=curl', ''), fuente: 'Google Books' });
        }
    } catch (_) { /* sin Google Books */ }
    return out;
}

async function tmdb(tipo: 'movie' | 'tv', q: string, anio?: string): Promise<Candidata[]> {
    if (!TMDB) return [];
    const extra = anio ? `&${tipo === 'movie' ? 'year' : 'first_air_date_year'}=${anio}` : '';
    const d = await pedir(`https://api.themoviedb.org/3/search/${tipo}?api_key=${TMDB}&language=es-ES&query=${encodeURIComponent(q)}${extra}`);
    return (d.results || []).filter((x: any) => x.poster_path).slice(0, 12).map((x: any) => ({
        titulo: x.title || x.name, anio: (x.release_date || x.first_air_date || '').slice(0, 4) || undefined,
        imagen: `https://image.tmdb.org/t/p/w500${x.poster_path}`, fuente: 'TMDB',
    }));
}

async function series(q: string, anio?: string): Promise<Candidata[]> {
    const out: Candidata[] = [];
    try { out.push(...await tmdb('tv', q, anio)); } catch (_) { /* sigue con TVmaze */ }
    try {
        const d = await pedir(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`);
        for (const x of d || []) {
            const s = x.show || {};
            const img = s.image?.original || s.image?.medium;
            if (img) out.push({ titulo: s.name, anio: (s.premiered || '').slice(0, 4) || undefined, imagen: img.replace('http://', 'https://'), fuente: 'TVmaze' });
        }
    } catch (_) { /* sin TVmaze */ }
    return out;
}

async function juegos(q: string): Promise<Candidata[]> {
    const d = await pedir(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&cc=es&l=spanish`);
    return (d.items || []).filter((x: any) => x.type === 'app').slice(0, 12).map((x: any) => ({
        titulo: x.name, imagen: `https://cdn.cloudflare.steamstatic.com/steam/apps/${x.id}/library_600x900.jpg`, fuente: 'Steam',
    }));
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
    if (demasiadas(user.id, 60)) return json({ error: 'Demasiadas peticiones. Espera un minuto.' }, 429);
    let cuerpo: { tipo?: string; q?: string; anio?: string };
    try { cuerpo = await req.json(); } catch (_) { return json({ error: 'Petición no válida' }, 400); }
    const q = String(cuerpo.q || '').trim().slice(0, 120);
    const anio = /^\d{4}$/.test(String(cuerpo.anio || '')) ? String(cuerpo.anio) : undefined;
    if (!q) return json({ resultados: [] });
    try {
        let resultados: Candidata[] = [];
        if (cuerpo.tipo === 'book') resultados = await libros(q);
        else if (cuerpo.tipo === 'series') resultados = await series(q, anio);
        else if (cuerpo.tipo === 'movie') resultados = await tmdb('movie', q, anio);
        else if (cuerpo.tipo === 'game') resultados = await juegos(q);
        return json({ resultados, necesitaClave: cuerpo.tipo === 'movie' && !TMDB });
    } catch (e) {
        console.error(e);
        return json({ resultados: [], error: 'No se pudo buscar' }, 200);
    }
});
