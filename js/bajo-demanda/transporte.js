// ============================================================
//  TRANSPORTE (05-11): las paradas de bus de Zaragoza con sus tiempos de llegada en directo. Buscas el poste (por
//  número, calle o línea) o los que tienes cerca, lo guardas en «tus paradas.» y ves cuándo llega cada bus; con tu
//  ubicación, también si llegas andando. Favoritos en servicios.transporte.favoritos (sincronizado, 'bus:688').
//  Paradas: datos abiertos del Ayuntamiento (se leen desde el navegador y se guardan una semana en localStorage).
//  Tiempos: función transporte (lee la página de Avanza, que no deja leerse desde el navegador).
//  Tranvía: sus dos fuentes (Ayuntamiento y Tranvías de Zaragoza) no dan datos ahora; si el Ayuntamiento vuelve a
//  publicar las paradas, salen solas en la búsqueda.
// ============================================================
const TR_API = 'https://www.zaragoza.es/sede/servicio/urbanismo-infraestructuras/transporte-urbano';
const TR_CACHE = 'bitacora-transporte-paradas-v1';
const TR_ICONO_BUS = '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="M22 8h56a12 12 0 0 1 12 12v58a6 6 0 0 1-6 6h-4v8H68v-8H32v8H20v-8h-4a6 6 0 0 1-6-6V20A12 12 0 0 1 22 8zm-2 16v28h60V24zm6 38a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm48 0a6 6 0 1 0 0 12 6 6 0 0 0 0-12z"/></svg>';
const TR_ICONO_TRAM = '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="M30 4h40v7H55l-3 7h18a10 10 0 0 1 10 10v46a8 8 0 0 1-8 8h-2l8 14H66l-8-14H42l-8 14H22l8-14h-2a8 8 0 0 1-8-8V28a10 10 0 0 1 10-10h18l-3-7H30zm-2 26v20h44V30zm5 32a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm34 0a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/></svg>';

let trParadas = null;            // { bus: [...], tram: [...] } con { tipo, id, numero, nombre, lineas, lat, lon }
let trCargandoParadas = null;
let trBusqueda = '';
let trAbierta = null;            // clave de la parada desplegada en la búsqueda
let trTiempos = {};              // clave → { tiempos, hora, error, cargando }
let trPosicion = null;           // { lat, lon } solo en memoria: no se guarda en ningún sitio
let trCerca = false;
let trReloj = null;

function trDatos() {
    if (!servicios.transporte || typeof servicios.transporte !== 'object') servicios.transporte = { favoritos: [] };
    if (!Array.isArray(servicios.transporte.favoritos)) servicios.transporte.favoritos = [];
    if (!Array.isArray(servicios.transporte.plegadas)) servicios.transporte.plegadas = [];
    return servicios.transporte;
}
const trClave = p => `${p.tipo}:${p.numero}`;
function trEsFavorita(p) { return trDatos().favoritos.includes(trClave(p)); }
const trPlegada = clave => trDatos().plegadas.includes(clave);
function trBuscarPorClave(clave) {
    const [tipo, numero] = clave.split(':');
    return (trParadas?.[tipo] || []).find(p => String(p.numero) === numero) || null;
}

// «(688) P. Reyes De Aragón N.º 24 Líneas: 58» → número, nombre y líneas.
function trLeerParada(r, tipo) {
    const m = String(r.title || '').match(/^\((\d+)\)\s*(.*?)\s*(?:L[ií]neas?:\s*(.*))?$/);
    const [lon, lat] = r.geometry?.coordinates || [];
    const numero = m ? m[1] : String(r.id || '').replace(/\D/g, '');
    if (!numero) return null;
    return { tipo, id: r.id, numero, nombre: (m ? m[2] : r.title || '').trim(), lineas: m && m[3] ? m[3].split(/\s*,\s*/).filter(Boolean) : [], lat, lon };
}

async function trCargarParadas() {
    if (trParadas) return trParadas;
    if (trCargandoParadas) return trCargandoParadas;
    trCargandoParadas = (async () => {
        try {
            const c = JSON.parse(localStorage.getItem(TR_CACHE) || 'null');
            if (c && c.fecha > Date.now() - 7 * 86400000 && c.bus?.length) { trParadas = c; return c; }
        } catch (e) { /* sin almacenamiento */ }
        // El Ayuntamiento da como mucho 500 por petición: se piden por páginas hasta tenerlas todas.
        const leer = async (ruta, tipo) => {
            const out = [];
            try {
                for (let start = 0; start < 5000; start += 500) {
                    const r = await fetch(`${TR_API}/${ruta}.json?rows=500&start=${start}&srsname=wgs84`);
                    const d = r.ok ? await r.json().catch(() => null) : null;
                    const lote = d?.result || [];
                    out.push(...lote.map(x => trLeerParada(x, tipo)).filter(Boolean));
                    if (lote.length < 500 || out.length >= (d.totalCount || 0)) break;
                }
            } catch (e) { /* lo que haya llegado */ }
            return out;
        };
        const [bus, tram] = await Promise.all([leer('poste-autobus', 'bus'), leer('parada-tranvia', 'tram')]);
        trParadas = { fecha: Date.now(), bus, tram };
        if (bus.length) try { localStorage.setItem(TR_CACHE, JSON.stringify(trParadas)); } catch (e) { /* sin almacenamiento */ }
        return trParadas;
    })();
    try { return await trCargandoParadas; } finally { trCargandoParadas = null; }
}

async function trCargarTiempos(p) {
    const clave = trClave(p);
    trTiempos[clave] = { ...(trTiempos[clave] || {}), cargando: true };
    trPintarParada(p);
    let res = null;
    try {
        if (p.tipo === 'bus') {
            const { data: { session } } = await sb.auth.getSession();
            if (session) {
                const r = await fetch(`${SUPABASE_URL}/functions/v1/transporte`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                    body: JSON.stringify({ poste: p.numero }),
                });
                res = r.ok ? await r.json() : { tiempos: [], error: r.status === 404 ? 'Falta activar los tiempos en el servidor.' : 'No se pudieron traer los tiempos.' };
            }
        } else {
            // Formato del Ayuntamiento para el tranvía (destinos con minutos); ahora mismo no publica nada.
            const r = await fetch(`${TR_API}/parada-tranvia/${encodeURIComponent(p.id)}.json`);
            const d = r.ok ? await r.json().catch(() => null) : null;
            res = { tiempos: (d?.destinos || []).map(x => ({ linea: x.linea || 'L1', destino: x.destino || '', minutos: Number.isFinite(Number(x.minutos)) ? Number(x.minutos) : null, texto: `${x.minutos} min` })) };
        }
    } catch (e) { res = null; }
    trTiempos[clave] = res ? { tiempos: res.tiempos || [], error: res.error || '', hora: Date.now() } : { tiempos: [], error: navigator.onLine === false ? 'Sin conexión.' : 'No se pudieron traer los tiempos.', hora: Date.now() };
    trPintarParada(p);
}

function trDistancia(a, b) {
    const R = 6371000, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}
// Andando: la distancia en línea recta por 1,3 (las calles no van rectas) a 75 m por minuto.
function trMinutosAndando(p) {
    if (!trPosicion || !Number.isFinite(p.lat)) return null;
    return Math.max(1, Math.round(trDistancia(trPosicion, p) * 1.3 / 75));
}

function trLlegas(minBus, andando) {
    if (andando === null || minBus === null) return '';
    const margen = minBus - andando;
    if (margen >= 2) return '<span class="tr-llegas si">llegas.</span>';
    if (margen >= 0) return '<span class="tr-llegas justo">justo.</span>';
    return '<span class="tr-llegas no">no llegas.</span>';
}

function trTiemposHtml(p, compacto) {
    const t = trTiempos[trClave(p)];
    if (!t || (t.cargando && !t.tiempos)) return '<div class="tr-tiempos-vacio">Mirando los tiempos…</div>';
    if (!t.tiempos.length) return `<div class="tr-tiempos-vacio">${escapeHtml(t.error || 'Ahora no hay buses previstos en esta parada.')}</div>`;
    const andando = trMinutosAndando(p);
    // Por línea y destino, el primero grande y el siguiente al lado.
    const grupos = [];
    t.tiempos.forEach(x => {
        const g = grupos.find(y => y.linea === x.linea && y.destino === x.destino);
        if (g) g.min.push(x.minutos); else grupos.push({ linea: x.linea, destino: x.destino, min: [x.minutos] });
    });
    grupos.sort((a, b) => (a.min[0] ?? 999) - (b.min[0] ?? 999));
    const minTxt = m => m === null ? 'sin hora' : m === 0 ? 'ya' : `${m} min`;
    if (compacto) return `<div class="tr-tiempos">${grupos.map(g => `<div class="tr-llegada">
        <span class="tr-linea">${escapeHtml(g.linea)}</span>
        <span class="tr-destino" title="${escapeHtml(g.destino.toLowerCase())}">${escapeHtml(g.destino.toLowerCase())}</span>
        <span class="tr-min ${g.min[0] === 0 ? 'ya' : ''}">${minTxt(g.min[0])}${trLlegas(g.min[0], andando)}${g.min[1] !== undefined ? `<small>luego ${minTxt(g.min[1])}</small>` : ''}</span>
    </div>`).join('')}</div>
    <div class="tr-hora">${t.cargando ? 'actualizando…' : `a las ${new Date(t.hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.`}</div>`;
    return `<div class="tr-tiempos">${grupos.map(g => `<div class="tr-llegada">
        <span class="tr-linea">${escapeHtml(g.linea)}</span>
        <span class="tr-destino">${escapeHtml(g.destino.toLowerCase())}${g.min[1] !== undefined ? `<small>luego, ${minTxt(g.min[1])}</small>` : ''}</span>
        <span class="tr-min ${g.min[0] === 0 ? 'ya' : ''}">${minTxt(g.min[0])}${trLlegas(g.min[0], andando)}</span>
    </div>`).join('')}</div>
    <div class="tr-hora">${t.cargando ? 'actualizando…' : `actualizado a las ${new Date(t.hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.`}</div>`;
}

function trCabParada(p, favorita) {
    const andando = trMinutosAndando(p);
    return `<span class="tr-icono ${p.tipo}">${p.tipo === 'tram' ? TR_ICONO_TRAM : TR_ICONO_BUS}</span>
        <span class="tr-nombre"><b>${escapeHtml(p.nombre || 'parada')}</b><small>${p.tipo === 'tram' ? 'tranvía' : 'poste'} ${escapeHtml(p.numero)}${p.lineas.length ? `, ${p.lineas.length === 1 ? 'línea' : 'líneas'} ${escapeHtml(p.lineas.join(', '))}` : ''}${andando !== null ? `, a ${andando} min andando` : ''}</small></span>
        <button type="button" class="vista-icono-btn tr-estrella ${favorita ? 'on' : ''}" title="${favorita ? 'Quitar de tus paradas' : 'Guardar en tus paradas'}" aria-pressed="${favorita}" onclick="event.stopPropagation();trAlternarFavorita('${jsAttr(trClave(p))}')"><i class="ico ico-estrella" aria-hidden="true"></i></button>`;
}

function trFavoritaHtml(p) {
    const clave = trClave(p), plegada = trPlegada(clave), andando = trMinutosAndando(p);
    return `<section class="tr-parada tr-fav ${plegada ? 'plegada' : ''}" data-tr="${escapeHtml(clave)}">
        <div class="tr-fav-cab" role="button" tabindex="0" aria-expanded="${!plegada}" title="${plegada ? 'Ver los tiempos' : 'Plegar'}" onclick="trPlegar('${jsAttr(clave)}')" onkeydown="if(event.key==='Enter'){event.preventDefault();this.click()}">
            <span class="tr-icono ${p.tipo}">${p.tipo === 'tram' ? TR_ICONO_TRAM : TR_ICONO_BUS}</span>
            <span class="tr-nombre"><b>${escapeHtml(p.nombre || 'parada')}</b><small>${p.tipo === 'tram' ? 'tranvía' : 'poste'} ${escapeHtml(p.numero)}${andando !== null ? `, a ${andando} min` : ''}</small></span>
            <i class="ico ico-der tr-pliegue" aria-hidden="true"></i>
        </div>
        ${plegada ? '' : `<div class="tr-cuerpo">${trTiemposHtml(p, true)}</div>
        <button type="button" class="tr-quitar" onclick="trAlternarFavorita('${jsAttr(clave)}')">quitar.</button>`}
    </section>`;
}

async function trPlegar(clave) {
    const d = trDatos();
    const plegar = !d.plegadas.includes(clave);
    d.plegadas = plegar ? [...d.plegadas, clave] : d.plegadas.filter(c => c !== clave);
    const p = trBuscarPorClave(clave);
    const caja = document.querySelector(`.tr-fav[data-tr="${CSS.escape(clave)}"]`);
    if (p && caja) caja.outerHTML = trFavoritaHtml(p);
    if (p && !plegar && (!trTiempos[clave] || Date.now() - (trTiempos[clave].hora || 0) > 25000)) trCargarTiempos(p);
    try { await saveData(); } catch (e) { console.error(e); }
}

function trResultadoHtml(p) {
    const abierta = trAbierta === trClave(p);
    return `<div class="tr-resultado ${abierta ? 'abierta' : ''}" data-tr="${escapeHtml(trClave(p))}">
        <div class="tr-parada-cab" role="button" tabindex="0" onclick="trAbrir('${jsAttr(trClave(p))}')" onkeydown="if(event.key==='Enter'){event.preventDefault();this.click()}">${trCabParada(p, trEsFavorita(p))}</div>
        ${abierta ? `<div class="tr-cuerpo">${trTiemposHtml(p)}</div>` : ''}
    </div>`;
}

function trResultados() {
    if (!trParadas) return [];
    const todas = [...trParadas.bus, ...trParadas.tram];
    if (trCerca && trPosicion) return todas.filter(p => Number.isFinite(p.lat)).map(p => ({ p, d: trDistancia(trPosicion, p) })).sort((a, b) => a.d - b.d).slice(0, 8).map(x => x.p);
    const q = stripAccents(trBusqueda.trim().toLowerCase());
    if (!q) return [];
    const esNumero = /^\d+$/.test(q);
    return todas.filter(p => esNumero
        ? p.numero.startsWith(q) || p.lineas.some(l => l.toLowerCase() === q)
        : stripAccents(p.nombre.toLowerCase()).includes(q) || p.lineas.some(l => l.toLowerCase() === q))
        .sort((a, b) => (a.numero === q ? -1 : 0) - (b.numero === q ? -1 : 0) || Number(a.numero) - Number(b.numero))
        .slice(0, 30);
}

function trListaHtml() {
    if (!trParadas) return '<div class="tr-tiempos-vacio">Cargando las paradas…</div>';
    if (!trParadas.bus.length && !trParadas.tram.length) return '<div class="tr-tiempos-vacio">No se pudieron cargar las paradas. Prueba a recargar.</div>';
    const res = trResultados();
    if (trCerca && trPosicion) return `<div class="tr-sub">las más cercanas.</div>${res.map(trResultadoHtml).join('')}`;
    if (!trBusqueda.trim()) return `<p class="tr-ayuda">Busca tu parada por su número (está en el poste), por la calle o por la línea, o pulsa «cerca de ti.». Guárdala con la estrella y saldrá arriba con sus tiempos.${trParadas.tram.length ? '' : ' El tranvía no publica sus tiempos ahora mismo: en cuanto vuelva, sus paradas saldrán aquí.'}</p>`;
    return res.length ? res.map(trResultadoHtml).join('') : '<div class="tr-tiempos-vacio">No hay ninguna parada con eso.</div>';
}

function renderTransporte() {
    const favs = trParadas ? trDatos().favoritos.map(trBuscarPorClave).filter(Boolean) : [];
    return `<div class="tr-vista">
        <div class="vista-cab">
            <div><div class="vista-cab-titulo">transporte.</div><div class="vista-cab-sub">El bus de Zaragoza, en directo.</div></div>
            <div class="vista-cab-acciones"><button class="vista-btn" onclick="trRecargar()"><i class="ico ico-repetir" aria-hidden="true"></i>recargar.</button></div>
        </div>
        ${favs.length ? `<div class="tr-favoritas">${favs.map(trFavoritaHtml).join('')}</div>` : ''}
        <section class="tr-buscar">
            <div class="tr-buscar-fila">
                <input type="search" class="modal-input" id="tr-buscar" placeholder="número, calle o línea" value="${escapeHtml(trBusqueda)}" oninput="trBuscar(this.value)" autocomplete="off" enterkeyhint="search">
                <button class="vista-btn ${trCerca ? 'activo' : ''}" onclick="trCercaDeTi()">cerca de ti.</button>
            </div>
            <div id="tr-lista">${trListaHtml()}</div>
        </section>
        <p class="tr-pie">Tiempos de Avanza y paradas del Ayuntamiento de Zaragoza. Son estimaciones y pueden cambiar con el tráfico.</p>
    </div>`;
}

function trRepintarTodo() {
    const caja = document.querySelector('.tr-vista');
    if (!caja) return;
    const foco = document.activeElement?.id === 'tr-buscar';
    caja.outerHTML = renderTransporte();
    if (foco) { const i = document.getElementById('tr-buscar'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}
function trRepintarLista() { const l = document.getElementById('tr-lista'); if (l) l.innerHTML = trListaHtml(); }
function trPintarParada(p) {
    const clave = trClave(p);
    document.querySelectorAll(`[data-tr="${CSS.escape(clave)}"] .tr-cuerpo`).forEach(el => { el.innerHTML = trTiemposHtml(p, !!el.closest('.tr-fav')); });
}

// Tras pintar la vista: paradas, tiempos de las favoritas y recarga cada 30 s mientras se ve.
async function transporteTrasPintar() {
    const primera = !trParadas;
    if (!trPosicion && navigator.permissions && navigator.geolocation) {
        navigator.permissions.query({ name: 'geolocation' }).then(s => {
            if (s.state !== 'granted') return;
            navigator.geolocation.getCurrentPosition(pos => { trPosicion = { lat: pos.coords.latitude, lon: pos.coords.longitude }; trRepintarTodo(); }, () => {}, { maximumAge: 60000, timeout: 10000 });
        }).catch(() => {});
    }
    await trCargarParadas();
    if (primera) trRepintarTodo();
    trDatos().favoritos.filter(c => !trPlegada(c)).map(trBuscarPorClave).filter(Boolean).forEach(p => { if (!trTiempos[trClave(p)] || Date.now() - (trTiempos[trClave(p)].hora || 0) > 25000) trCargarTiempos(p); });
    clearInterval(trReloj);
    trReloj = setInterval(() => {
        if (currentView !== 'transporte' || !document.querySelector('.tr-vista')) { clearInterval(trReloj); trReloj = null; return; }
        if (document.hidden) return;
        trRecargar(true);
    }, 30000);
}

function trRecargar(callado) {
    const visibles = new Set([...trDatos().favoritos.filter(c => !trPlegada(c)), ...(trAbierta ? [trAbierta] : [])]);
    visibles.forEach(clave => { const p = trBuscarPorClave(clave); if (p) trCargarTiempos(p); });
    if (!callado && !visibles.size) showToast('Guarda una parada para ver sus tiempos');
}

let trBuscarTemporizador = null;
function trBuscar(v) {
    trBusqueda = v;
    trCerca = false;
    clearTimeout(trBuscarTemporizador);
    trBuscarTemporizador = setTimeout(trRepintarLista, 120);
}

function trAbrir(clave) {
    trAbierta = trAbierta === clave ? null : clave;
    trRepintarLista();
    const p = trAbierta && trBuscarPorClave(trAbierta);
    if (p) trCargarTiempos(p);
}

function trCercaDeTi() {
    if (trCerca) { trCerca = false; trRepintarTodo(); return; }
    if (!navigator.geolocation) { showToast('Este dispositivo no da la ubicación', true); return; }
    showToast('Buscando dónde estás…');
    navigator.geolocation.getCurrentPosition(pos => {
        trPosicion = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        trCerca = true;
        trBusqueda = '';
        trRepintarTodo();
    }, () => showToast('Sin permiso de ubicación: busca la parada por su número', true), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}

async function trAlternarFavorita(clave) {
    const d = trDatos();
    d.favoritos = d.favoritos.includes(clave) ? d.favoritos.filter(c => c !== clave) : [...d.favoritos, clave];
    trRepintarTodo();
    const p = trBuscarPorClave(clave);
    if (p && d.favoritos.includes(clave) && !trTiempos[clave]?.tiempos) trCargarTiempos(p);
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}
