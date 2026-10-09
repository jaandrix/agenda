// ============================================================
//  CONEXIONES (antes "grafo") — relaciones que ya existen en los
//  datos, sin tener que enlazar nada a mano: lo que pasó durante cada
//  viaje, los partidos de cada equipo, lo que comparte una persona,
//  una etiqueta, una asignatura o un lugar, y los [[enlaces]] de las
//  notas. Se elige un centro y se ve su constelación.
// ============================================================
const CONEXION_TIPOS = {
    viaje: { titulo: 'viajes.', min: 1 },
    equipo: { titulo: 'equipos.', min: 2 },
    persona: { titulo: 'personas.', min: 2 },
    etiqueta: { titulo: 'etiquetas.', min: 1 },
    asignatura: { titulo: 'asignaturas.', min: 1 },
    lugar: { titulo: 'lugares.', min: 2 },
    enlace: { titulo: 'enlaces en notas.', min: 1 },
};
let conexionSeleccionada = null;
let conexionAnimar = true;

const normalizarTexto = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const fechaDeEntrada = e => e.date || e.startDate || '';

// "Atlético vs M. United", "Real Murcia - Real Zaragoza"...
function equiposDelPartido(e) {
    if (e.type !== 'event') return [];
    const partes = String(e.title || '').replace(/^[^\p{L}\p{N}]+/u, '').split(/\s+(?:vs\.?|v|–|-)\s+/i);
    if (partes.length !== 2) return [];
    const deportivo = ['futbol', 'baloncesto', 'deportes', 'deporte', 'f1', 'motogp'].includes(e.eventType);
    if (!deportivo && !/\s(vs\.?|v)\s/i.test(e.title)) return [];
    return partes.map(p => p.trim()).filter(p => p.length >= 2 && p.length <= 40);
}

function construirConexiones() {
    const centros = new Map();
    const anadir = (tipo, clave, nombre, entrada, extra = {}) => {
        const id = tipo + ':' + clave;
        if (!centros.has(id)) centros.set(id, { id, tipo, nombre, items: new Map(), ...extra });
        if (entrada) centros.get(id).items.set(entrada.id, entrada);
    };
    const visibles = entries.filter(e => e && !isCalendarLogEntry(e));

    visibles.filter(e => e.type === 'travel').forEach(t => {
        anadir('viaje', t.id, t.title || t.destination || 'viaje', null, { entradaId: t.id, sub: t.startDate ? formatTravelRange(t.startDate, t.endDate) : '' });
        if (!t.startDate) return;
        const fin = t.endDate || t.startDate;
        visibles.filter(e => e.type === 'event' && e.date && e.date >= t.startDate && e.date <= fin).forEach(e => anadir('viaje', t.id, null, e));
    });

    const nombresEquipo = new Map();
    visibles.forEach(e => equiposDelPartido(e).forEach(nombre => {
        const clave = normalizarTexto(nombre);
        if (!nombresEquipo.has(clave)) nombresEquipo.set(clave, nombre);
        anadir('equipo', clave, nombresEquipo.get(clave), e);
    }));

    // Personas: acompañantes de los viajes y amigos de Bitácora; se
    // relacionan con todo lo que las nombra (título, notas o etiquetas).
    const personas = new Map();
    visibles.filter(e => e.type === 'travel' && e.companions).forEach(t => String(t.companions).split(/,|\sy\s|&|\//).map(s => s.trim()).filter(s => s.length >= 3 && s.length <= 30).forEach(n => personas.set(normalizarTexto(n), n)));
    (typeof amigos !== 'undefined' ? amigos : []).forEach(a => { const n = (a.nombre_visible || a.friend_nombre || '').trim(); if (n.length >= 3) personas.set(normalizarTexto(n), n); });
    personas.forEach((nombre, clave) => {
        const patron = new RegExp(`(^| )${clave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`);
        visibles.forEach(e => {
            const texto = normalizarTexto([e.title, e.notes, e.companions, (e.tags || []).join(' ')].join(' '));
            if (patron.test(texto)) anadir('persona', clave, nombre, e);
        });
    });

    visibles.forEach(e => (e.tags || []).forEach(t => anadir('etiqueta', String(t), '#' + t, e)));

    (studies.subjects || []).forEach(s => {
        const clave = normalizarTexto(s.name);
        if (!clave) return;
        const nombre = String(s.name).replace(/\.$/, '');
        anadir('asignatura', s.id, nombre, null, { sub: `${(s.exams || []).length} exámenes · ${(s.assignments || []).length} trabajos` });
        visibles.filter(e => e.type === 'event' && (e.linkedSubjectId === s.id || normalizarTexto(e.title).includes(clave))).forEach(e => anadir('asignatura', s.id, null, e));
    });

    visibles.filter(e => e.type === 'event' && e.place).forEach(e => anadir('lugar', normalizarTexto(e.place), e.place, e));

    visibles.forEach(e => parseWikiLinks(e.notes || '').forEach(destino => {
        const otra = entries.find(x => x.id === destino);
        if (!otra || otra.id === e.id) return;
        anadir('enlace', e.id, e.title, otra, { entradaId: e.id });
    }));

    return [...centros.values()]
        .map(c => ({ ...c, items: [...c.items.values()].sort((a, b) => fechaDeEntrada(a).localeCompare(fechaDeEntrada(b))) }))
        .filter(c => c.items.length >= CONEXION_TIPOS[c.tipo].min);
}

function elegirConexion(id) {
    conexionSeleccionada = id;
    conexionAnimar = true;
    render();
    document.querySelector('.conexiones-mapa')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function renderGraph() {
    const centros = construirConexiones();
    if (!centros.length) {
        return `<div class="conexiones-vista">
            <div class="conexiones-titulo">conexiones.</div>
            <div class="empty-state"><div class="empty-title">todavía no hay nada que conectar.</div><div class="empty-sub">En cuanto tengas viajes con fechas, partidos, etiquetas o asignaturas, aquí aparecerá todo lo que se relaciona entre sí.</div></div>
        </div>`;
    }
    const total = new Set(centros.flatMap(c => c.items.map(i => i.id))).size;
    let actual = centros.find(c => c.id === conexionSeleccionada);
    if (!actual) actual = [...centros].sort((a, b) => b.items.length - a.items.length)[0];
    const grupos = Object.keys(CONEXION_TIPOS).map(tipo => ({ tipo, lista: centros.filter(c => c.tipo === tipo).sort((a, b) => b.items.length - a.items.length) })).filter(g => g.lista.length);
    const html = `
    <div class="conexiones-vista">
        <div class="conexiones-cabecera">
            <div class="conexiones-titulo">conexiones.</div>
            <div class="conexiones-sub">${total} ${total === 1 ? 'entrada relacionada' : 'entradas relacionadas'} en ${centros.length} ${centros.length === 1 ? 'grupo' : 'grupos'}. Elige un centro para ver todo lo que tiene que ver con él.</div>
        </div>
        <div class="conexiones-cuerpo">
            <aside class="conexiones-centros">
                ${grupos.map(g => `
                    <div class="conexiones-grupo">
                        <div class="conexiones-grupo-titulo">${CONEXION_TIPOS[g.tipo].titulo}</div>
                        <div class="conexiones-chips">${g.lista.slice(0, 24).map(c => `
                            <button class="conexiones-chip ${c.id === actual.id ? 'activo' : ''}" onclick="elegirConexion('${escapeHtml(c.id).replace(/'/g, "\\'")}')">${escapeHtml(c.nombre)}<span>${c.items.length}</span></button>`).join('')}
                        </div>
                    </div>`).join('')}
            </aside>
            <section class="conexiones-detalle">
                ${renderConstelacion(actual)}
                <div class="conexiones-lista">
                    ${actual.items.map(e => `
                        <div class="conexiones-fila" data-open-entry="${e.id}">
                            <span class="conexiones-fila-icono">${iconoDeEntrada(e)}</span>
                            <span class="conexiones-fila-titulo">${escapeHtml(e.title || '')}</span>
                            <span class="conexiones-fila-fecha">${fechaDeEntrada(e) ? new Date(fechaDeEntrada(e) + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span>
                        </div>`).join('')}
                </div>
            </section>
        </div>
    </div>`;
    conexionAnimar = false;
    return html;
}

function iconoDeEntrada(e) {
    if (e.type === 'event') return EVENT_TYPE_ICONS[e.eventType] || EVENT_TYPE_ICONS.otro;
    if (e.type === 'travel') return EVENT_TYPE_ICONS.viajes;
    return `<span class="conexiones-fila-letra">${escapeHtml((TYPE_LABELS[e.type] || e.type || '·').slice(0, 1))}</span>`;
}

// Constelación: el centro y, alrededor, hasta 24 elementos repartidos en
// una elipse (en dos anillos si son muchos, para que no se pisen los
// nombres). Cada punto abre su entrada.
function renderConstelacion(c) {
    // En la versión móvil se dibuja a su escala (más alta que ancha) para
    // que los nombres se lean sin encoger el dibujo entero.
    const movil = typeof mobileStandaloneActive !== 'undefined' && mobileStandaloneActive;
    const W = movil ? 360 : 640, H = movil ? 440 : 400, cx = W / 2, cy = H / 2;
    const rx = movil ? 128 : 255, ry = movil ? 170 : 150, rCentro = movil ? 44 : 56;
    const items = c.items.slice(0, movil ? 16 : 24);
    const n = items.length;
    const dosAnillos = n > 12;
    const puntos = items.map((e, i) => {
        const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const k = dosAnillos && i % 2 ? 0.62 : 1;
        return { e, x: cx + Math.cos(ang) * rx * k, y: cy + Math.sin(ang) * ry * k, i };
    });
    const corta = t => { const s = String(t || ''); const max = movil ? 14 : 18; return s.length > max ? s.slice(0, max - 1) + '…' : s; };
    const nombre = String(c.nombre);
    const lineasNombre = nombre.length > 14 ? [nombre.slice(0, nombre.lastIndexOf(' ', 14) > 4 ? nombre.lastIndexOf(' ', 14) : 14), nombre.slice(nombre.lastIndexOf(' ', 14) > 4 ? nombre.lastIndexOf(' ', 14) + 1 : 14)] : [nombre];
    return `
    <div class="conexiones-mapa ${conexionAnimar ? 'animar' : ''}">
        <div class="conexiones-mapa-cab">
            <span class="conexiones-mapa-tipo">${CONEXION_TIPOS[c.tipo].titulo}</span>
            ${c.sub ? `<span class="conexiones-mapa-sub">${escapeHtml(c.sub)}</span>` : ''}
            ${c.entradaId ? `<button class="conexiones-abrir" data-open-entry="${c.entradaId}">abrir.</button>` : ''}
        </div>
        <svg viewBox="0 0 ${W} ${H}" class="conexiones-svg" role="img" aria-label="${escapeHtml(nombre)} y lo relacionado">
            ${puntos.map(p => `<line class="conexiones-linea" style="--i:${p.i}" x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}"/>`).join('')}
            <circle class="conexiones-centro" cx="${cx}" cy="${cy}" r="${rCentro}"/>
            <text class="conexiones-centro-texto" x="${cx}" y="${cy + 5 - (lineasNombre.length - 1) * 8}" text-anchor="middle">${lineasNombre.map((l, i) => `<tspan x="${cx}" dy="${i ? 17 : 0}">${escapeHtml(l.slice(0, 16))}</tspan>`).join('')}</text>
            ${puntos.map(p => `
                <g class="conexiones-nodo" style="--i:${p.i}" data-open-entry="${p.e.id}">
                    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="9"/>
                    <text x="${p.x.toFixed(1)}" y="${(p.y + (p.y >= cy ? 24 : -15)).toFixed(1)}" text-anchor="middle">${escapeHtml(corta(p.e.title))}</text>
                </g>`).join('')}
        </svg>
        ${c.items.length > items.length ? `<div class="conexiones-mas">y ${c.items.length - items.length} más en la lista.</div>` : ''}
    </div>`;
}
