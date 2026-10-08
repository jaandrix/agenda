// ============================================================
//  SOCIAL (vista 'friends', antes "Amigos")
//  Tres pestañas: gastos compartidos al estilo Tricount, eventos que
//  compartes con amigos y la lista de amigos de siempre.
//  Los gastos viven en Supabase, no en los datos del usuario, porque
//  son comunes a todos los miembros: grupos_gastos, grupos_gastos_miembros
//  y gastos_compartidos (ver supabase/sql/gastos_compartidos.sql). Los
//  importes se guardan en euros con dos decimales y se reparten en
//  céntimos para que la suma cuadre siempre.
// ============================================================
const GASTO_CATEGORIAS = ['comida', 'súper', 'transporte', 'alojamiento', 'ocio', 'compras', 'otros'];
let socialYo = null;
let gruposGastos = [];
let grupoAbierto = null;
let grupoPestana = 'gastos';
let eventosCompartidosRecibidos = [];
let socialCargado = false;

async function cargarGruposGastos() {
    try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) { gruposGastos = []; return; }
        socialYo = user.id;
        const { data: grupos, error } = await sb.from('grupos_gastos').select('*').order('creado_en', { ascending: false });
        if (error) throw error;
        const ids = (grupos || []).map(g => g.id);
        if (!ids.length) { gruposGastos = []; return; }
        const [{ data: miembros }, { data: gastos }] = await Promise.all([
            sb.from('grupos_gastos_miembros').select('*').in('grupo_id', ids).order('creado_en'),
            sb.from('gastos_compartidos').select('*').in('grupo_id', ids).order('fecha', { ascending: false }).order('creado_en', { ascending: false }),
        ]);
        gruposGastos = grupos.map(g => ({ ...g, miembros: (miembros || []).filter(m => m.grupo_id === g.id), gastos: (gastos || []).filter(x => x.grupo_id === g.id) }));
    } catch (e) {
        console.error('Error cargando los gastos compartidos:', e);
    } finally {
        socialCargado = true;
    }
}

async function cargarEventosCompartidos() {
    try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) { eventosCompartidosRecibidos = []; return; }
        const { data, error } = await sb.from('eventos_compartidos').select('*').eq('destinatario_id', user.id).order('creado_en', { ascending: false });
        if (error) throw error;
        eventosCompartidosRecibidos = data || [];
        const ids = [...new Set(eventosCompartidosRecibidos.map(e => e.remitente_id))];
        if (ids.length) {
            const { data: publicos } = await sb.from('perfiles_publicos').select('user_id, nombre_publico').in('user_id', ids);
            const porId = Object.fromEntries((publicos || []).map(p => [p.user_id, p.nombre_publico]));
            eventosCompartidosRecibidos.forEach(e => { e.nombre = porId[e.remitente_id] || 'Un amigo'; });
        }
    } catch (e) {
        console.error('Error cargando los eventos compartidos:', e);
    }
}

function pintarSocial() {
    const el = document.getElementById('social');
    if (el) el.outerHTML = renderFriendsView();
}

// ---------- nombres y dinero ----------
function nombreMiembro(g, id) {
    const m = g.miembros.find(x => x.id === id);
    if (!m) return 'alguien';
    if (m.user_id && m.user_id === socialYo) return 'tú';
    const amigo = m.user_id ? amigos.find(a => a.friend_id === m.user_id) : null;
    return amigo?.nombre_visible || m.nombre;
}

function fraseSaldar(g, de, a) {
    const yo = miMiembro(g)?.id;
    if (de === yo) return `<b>tú</b> pagas a <b>${escapeHtml(nombreMiembro(g, a))}</b>`;
    if (a === yo) return `<b>${escapeHtml(nombreMiembro(g, de))}</b> te paga`;
    return `<b>${escapeHtml(nombreMiembro(g, de))}</b> paga a <b>${escapeHtml(nombreMiembro(g, a))}</b>`;
}

function miMiembro(g) { return g.miembros.find(m => m.user_id === socialYo) || null; }

function dinero(n) {
    return (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

const aCentimos = x => Math.round(Number(x) * 100);

// Saldo de cada miembro en céntimos: lo que ha puesto menos lo que le toca.
function saldosGrupo(g) {
    const s = Object.fromEntries(g.miembros.map(m => [m.id, 0]));
    g.gastos.forEach(x => {
        const signo = x.tipo === 'ingreso' ? -1 : 1;
        if (s[x.pagado_por] !== undefined) s[x.pagado_por] += signo * aCentimos(x.importe);
        (x.reparto || []).forEach(r => { if (s[r.miembro] !== undefined) s[r.miembro] -= signo * aCentimos(r.importe); });
    });
    return s;
}

// Cómo saldar con el mínimo de pagos: el que más debe paga al que más le deben.
function comoSaldar(g) {
    const s = saldosGrupo(g);
    const deudores = Object.entries(s).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v })).sort((a, b) => b.v - a.v);
    const acreedores = Object.entries(s).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v);
    const pagos = [];
    let i = 0, j = 0;
    while (i < deudores.length && j < acreedores.length) {
        const c = Math.min(deudores[i].v, acreedores[j].v);
        if (c > 0) pagos.push({ de: deudores[i].id, a: acreedores[j].id, centimos: c });
        deudores[i].v -= c; acreedores[j].v -= c;
        if (!deudores[i].v) i++;
        if (!acreedores[j].v) j++;
    }
    return pagos;
}

function totalesGrupo(g) {
    const yo = miMiembro(g)?.id;
    let total = 0, mio = 0;
    g.gastos.forEach(x => {
        if (x.tipo === 'transferencia') return;
        const signo = x.tipo === 'ingreso' ? -1 : 1;
        total += signo * aCentimos(x.importe);
        const parte = (x.reparto || []).find(r => r.miembro === yo);
        if (parte) mio += signo * aCentimos(parte.importe);
    });
    return { total, mio, saldo: yo ? saldosGrupo(g)[yo] : 0 };
}

function textoSaldo(c) {
    if (Math.abs(c) < 1) return 'estás en paz.';
    return c > 0 ? `te deben ${dinero(c / 100)}.` : `debes ${dinero(-c / 100)}.`;
}

function setSocialTab(t) {
    grupoAbierto = null;
    pintarSocial();
    setTimeout(() => document.getElementById('social-' + t)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
}

const SOCIAL_ICONOS = {
    gastos: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M18 6h64v88l-11-8-10 8-11-8-10 8-11-8-11 8zM30 26v9h40v-9zm0 18v9h40v-9zm0 18v9h24v-9z"/></svg>',
    grupo: '<svg viewBox="0 0 100 100" fill="currentColor"><circle cx="32" cy="30" r="15"/><circle cx="68" cy="30" r="15"/><path d="M4 86c0-18 12-32 28-32 9 0 16 4 21 10-4 6-6 14-6 22zm92 0H53c0-18 7-32 15-32 16 0 28 14 28 32z"/></svg>',
    evento: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M10 18h80v74H10zm10 24v40h60V42z"/><rect x="26" y="6" width="12" height="22" rx="4"/><rect x="62" y="6" width="12" height="22" rx="4"/><path d="M32 52h14v14H32z"/></svg>',
    recibido: '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M8 52h22l8 14h24l8-14h22v40H8z"/><path d="M42 8h16v28h14L50 60 28 36h14z"/></svg>',
    amigos: '<svg viewBox="0 0 100 100" fill="currentColor"><circle cx="50" cy="30" r="20"/><path d="M12 92c0-22 17-38 38-38s38 16 38 38z"/></svg>',
    codigo: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M8 8h36v36H8zm12 12v12h12V20zM56 8h36v36H56zm12 12v12h12V20zM8 56h36v36H8zm12 12v12h12V68zM56 56h14v14H56zm22 0h14v14H78zM56 78h14v14H56zm22 0h14v14H78z"/></svg>',
    nombre: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M8 20h56l28 30-28 30H8zm16 22v16h28V42z"/></svg>',
    solicitud: '<svg viewBox="0 0 100 100" fill="currentColor"><circle cx="40" cy="30" r="18"/><path d="M6 90c0-20 15-34 34-34 8 0 15 2 21 7-3 6-5 13-5 21v6z"/><path d="M74 58h10v14h14v10H84v14H74V82H60V72h14z"/></svg>',
    mas: '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M42 12h16v30h30v16H58v30H42V58H12V42h30z"/></svg>',
};

function bloqueSocial(id, icono, titulo, texto, cuerpo, clase = '') {
    return `
        <section class="ajuste ${clase}" ${id ? `id="${id}"` : ''}>
            <div class="ajuste-cab">
                <span class="ajuste-icono">${SOCIAL_ICONOS[icono]}</span>
                <div><div class="ajuste-titulo">${titulo}</div>${texto ? `<div class="ajuste-texto">${texto}</div>` : ''}</div>
            </div>
            ${cuerpo ? `<div class="ajuste-cuerpo">${cuerpo}</div>` : ''}
        </section>`;
}

function renderFriendsView() {
    if (grupoAbierto && gruposGastos.some(g => g.id === grupoAbierto)) return `<div class="ajustes-vista social" id="social">${renderGrupoGastos()}</div>`;
    grupoAbierto = null;
    const nombre = (nombrePublico || userName || '').trim();
    const saldoTotal = gruposGastos.reduce((t, g) => t + totalesGrupo(g).saldo, 0);
    const conSaldo = gruposGastos.find(g => Math.abs(totalesGrupo(g).saldo) >= 1);
    const pendientes = [
        gruposGastos.length ? `${gruposGastos.length} ${gruposGastos.length === 1 ? 'grupo' : 'grupos'}` : '',
        solicitudesRecibidas.length ? `${solicitudesRecibidas.length} ${solicitudesRecibidas.length === 1 ? 'solicitud' : 'solicitudes'}` : '',
        eventosCompartidosRecibidos.length ? `${eventosCompartidosRecibidos.length} ${eventosCompartidosRecibidos.length === 1 ? 'evento por ver' : 'eventos por ver'}` : '',
    ].filter(Boolean).join(' · ');
    return `
    <div class="ajustes-vista social" id="social">
        <div class="ajustes-cabecera">
            <div class="ajustes-titulo">social.</div>
            <div class="ajustes-sub">${nombre ? `${escapeHtml(nombre)}, tu` : 'Tu'} gente y lo que compartís: gastos, planes y amigos.</div>
        </div>

        ${socialCargado && gruposGastos.length ? `
        <button class="ajustes-guia social-resumen" onclick="${conSaldo ? `abrirGrupoGastos('${conSaldo.id}')` : `setSocialTab('gastos')`}">
            <span class="ajuste-icono">${SOCIAL_ICONOS.gastos}</span>
            <span><b>${Math.abs(saldoTotal) < 1 ? 'estás en paz con todos.' : saldoTotal > 0 ? `te deben ${dinero(saldoTotal / 100)} en total.` : `debes ${dinero(-saldoTotal / 100)} en total.`}</b><small>${pendientes}</small></span>
            <span class="ajustes-guia-flecha" aria-hidden="true">→</span>
        </button>` : ''}

        <div class="ajustes-grupo" id="social-gastos">gastos compartidos.</div>
        ${renderListaGrupos()}

        <div class="ajustes-grupo" id="social-eventos">eventos.</div>
        ${renderEventosSocial()}

        <div class="ajustes-grupo" id="social-amigos">amigos.</div>
        ${renderAmigosSocial()}
    </div>`;
}

function renderListaGrupos() {
    if (!socialCargado) return '<div class="ajuste-cargando">Cargando...</div>';
    return `
        <div class="ajustes-rejilla">
            ${gruposGastos.map(g => {
                const t = totalesGrupo(g);
                return `
                <button class="ajuste social-grupo" onclick="abrirGrupoGastos('${g.id}')">
                    <span class="ajuste-cab">
                        <span class="ajuste-icono">${SOCIAL_ICONOS.grupo}</span>
                        <span><span class="ajuste-titulo">${escapeHtml(g.nombre)}</span><span class="ajuste-texto">${g.miembros.map(m => escapeHtml(nombreMiembro(g, m.id))).join(', ')}</span></span>
                    </span>
                    <span class="social-grupo-pie">
                        <span class="social-grupo-saldo ${t.saldo > 0 ? 'positivo' : t.saldo < 0 ? 'negativo' : ''}">${textoSaldo(t.saldo)}</span>
                        <span class="social-grupo-meta">${dinero(t.total / 100)} · ${((n) => `${n} ${n === 1 ? 'gasto' : 'gastos'}`)(g.gastos.filter(x => x.tipo !== 'transferencia').length)}</span>
                    </span>
                </button>`;
            }).join('')}
            <button class="ajuste social-grupo social-grupo-nuevo" onclick="openGrupoGastos()">
                <span class="ajuste-cab">
                    <span class="ajuste-icono">${SOCIAL_ICONOS.mas}</span>
                    <span><span class="ajuste-titulo">nuevo grupo.</span><span class="ajuste-texto">Un viaje, una cena, el piso... Apuntad quién paga qué y Bitácora calcula cuánto debe cada uno y cómo saldarlo con los mínimos pagos.</span></span>
                </span>
            </button>
        </div>`;
}

function renderEventosSocial() {
    return `
        <div class="ajustes-rejilla">
            ${bloqueSocial('', 'evento', 'compartir un evento.', 'Manda una cena, un partido o un concierto a tus amigos; les llega para añadirlo a su calendario.', `<div class="ajuste-botones"><button class="btn-secondary" style="width:auto" onclick="openCompartirEvento()">elegir evento.</button></div>`)}
            ${bloqueSocial('', 'recibido', 'te han compartido.', eventosCompartidosRecibidos.length ? '' : 'Nada pendiente. Lo que te compartan tus amigos aparecerá aquí.', eventosCompartidosRecibidos.length ? `<div class="social-recibidos">${eventosCompartidosRecibidos.map(e => {
                const ev = e.evento || {};
                return `
                <div class="social-recibido">
                    <div class="social-recibido-de">${escapeHtml(e.nombre || 'Un amigo')}</div>
                    <div class="social-recibido-titulo">${escapeHtml(ev.title || 'Evento')}</div>
                    <div class="social-recibido-meta">${ev.date ? new Date(ev.date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}${ev.time ? ` · ${escapeHtml(ev.time)}` : ''}${ev.place ? ` · ${escapeHtml(ev.place)}` : ''}</div>
                    ${e.nota ? `<div class="social-recibido-nota">«${escapeHtml(e.nota)}»</div>` : ''}
                    <div class="ajuste-botones"><button class="btn-modal-primary social-btn" onclick="aceptarEventoCompartido('${e.id}')">añadir.</button><button class="btn-secondary" style="width:auto" onclick="descartarEventoCompartido('${e.id}')">descartar.</button></div>
                </div>`;
            }).join('')}</div>` : '')}
        </div>`;
}

function renderAmigosSocial() {
    const nombreAmigo = a => a.nombre_visible || a.friend_nombre || 'Amigo sin nombre';
    return `
        ${solicitudesRecibidas.length ? bloqueSocial('', 'solicitud', 'quieren ser tus amigos.', '', `<div class="social-lista">${solicitudesRecibidas.map(s => `
            <div class="social-fila"><b>${escapeHtml(s.nombre)}</b><span class="ajuste-botones"><button class="btn-modal-primary social-btn" onclick="responderSolicitudAmistad('${s.id}', true)">aceptar.</button><button class="btn-secondary" style="width:auto" onclick="responderSolicitudAmistad('${s.id}', false)">rechazar.</button></span></div>`).join('')}</div>`, 'social-destacado') : ''}
        <div class="ajustes-rejilla">
            ${bloqueSocial('friends-list-section', 'amigos', `mis amigos.${amigos.length ? ` <span class="social-cuenta">${amigos.length}</span>` : ''}`, 'Escribe el código que te ha pasado tu amigo; le llegará una solicitud.', `
                <div class="friend-add-row">
                    <input type="text" id="friend-add-input" class="friend-add-input" placeholder="código de amigo." maxlength="8" onkeydown="friendAddInputKeydown(event)">
                    <button class="btn-secondary" id="friend-add-btn" style="width:auto" onclick="anadirAmigoPorCodigo()">añadir.</button>
                </div>
                <div class="social-lista">
                    ${solicitudesEnviadas.map(s => `<div class="social-fila social-fila-pendiente"><b>${escapeHtml(s.nombre)}</b><small>pendiente.</small></div>`).join('')}
                    ${amigos.map(a => `<div class="social-fila"><b>${escapeHtml(nombreAmigo(a))}</b><button class="friend-remove-btn" title="Eliminar amigo" onclick="eliminarAmigo('${a.friend_id}', '${escapeHtml(nombreAmigo(a)).replace(/'/g, '')}')">✕</button></div>`).join('')}
                    ${!amigos.length && !solicitudesEnviadas.length ? '<div class="ajuste-cargando social-vacio-linea">Aún no tienes amigos añadidos.</div>' : ''}
                </div>`)}
            <div class="social-columna">
                ${bloqueSocial('friends-code-section', 'codigo', 'tu código de amigo.', 'Compártelo para que te añadan.', userFriendCode ? `
                    <div class="friend-code-box">
                        <span class="friend-code-value">${userFriendCode}</span>
                        <button class="friend-code-copy-btn" onclick="copiarCodigoAmigo()" title="Copiar código">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2.5"/><path d="M5 15H3.5A1.5 1.5 0 0 1 2 13.5v-10A1.5 1.5 0 0 1 3.5 2h10A1.5 1.5 0 0 1 15 3.5V5"/></svg>
                        </button>
                    </div>` : `<button class="btn-secondary" id="friend-code-generate-btn" style="width:auto" onclick="generarCodigoAmigo()">generar código.</button>`)}
                ${bloqueSocial('friends-name-section', 'nombre', 'tu nombre visible.', 'Cómo te ven tus amigos. No tiene por qué coincidir con el de tu cuenta.', `
                    <div class="friend-add-row">
                        <input type="text" id="nombre-publico-input" class="modal-input" style="margin:0;text-transform:none;letter-spacing:normal;font-family:var(--font-family)" placeholder="Tu nombre visible" value="${escapeHtml(nombrePublico || '')}">
                        <button class="btn-secondary" id="nombre-publico-btn" style="width:auto" onclick="guardarNombrePublico()">Guardar</button>
                    </div>`)}
            </div>
        </div>`;
}

function abrirGrupoGastos(id) { grupoAbierto = id; grupoPestana = 'gastos'; pintarSocial(); document.getElementById('social')?.scrollIntoView({ block: 'start' }); }
function setGrupoPestana(p) { grupoPestana = p; pintarSocial(); }

function renderGrupoGastos() {
    const g = gruposGastos.find(x => x.id === grupoAbierto);
    const t = totalesGrupo(g);
    return `
        <div class="social-grupo-cab">
            <button class="pedido-btn" onclick="setSocialTab('gastos')">← social.</button>
            <button class="pedido-btn" onclick="openGrupoGastos('${g.id}')">editar.</button>
        </div>
        <div class="ajustes-cabecera social-grupo-nombre">
            <div class="ajustes-titulo">${escapeHtml(g.nombre)}</div>
            <div class="ajustes-sub">${g.descripcion ? `${escapeHtml(g.descripcion)} · ` : ''}${g.miembros.length} personas</div>
        </div>
        <div class="social-miembros">${g.miembros.map(m => `<span class="${m.user_id ? '' : 'invitado'}">${escapeHtml(nombreMiembro(g, m.id))}</span>`).join('')}</div>
        <div class="social-cifras">
            <div><small>mis gastos.</small><b>${dinero(t.mio / 100)}</b></div>
            <div><small>total del grupo.</small><b>${dinero(t.total / 100)}</b></div>
            <div class="${t.saldo > 0 ? 'positivo' : t.saldo < 0 ? 'negativo' : ''}"><small>mi saldo.</small><b>${t.saldo > 0 ? '+' : ''}${dinero(t.saldo / 100)}</b></div>
        </div>
        <button class="ajustes-guia social-anadir" onclick="openGastoCompartido('${g.id}')">
            <span class="ajuste-icono">${SOCIAL_ICONOS.mas}</span>
            <span><b>apuntar un gasto.</b><small>Quién pagó, cuánto y para quién.</small></span>
            <span class="ajustes-guia-flecha" aria-hidden="true">→</span>
        </button>
        <section class="ajuste">
            <div class="social-subtabs">
                <button class="${grupoPestana === 'gastos' ? 'activo' : ''}" onclick="setGrupoPestana('gastos')">gastos.</button>
                <button class="${grupoPestana === 'saldos' ? 'activo' : ''}" onclick="setGrupoPestana('saldos')">saldos.</button>
            </div>
            ${grupoPestana === 'gastos' ? renderGastosGrupo(g) : renderSaldosGrupo(g)}
        </section>`;
}

function renderGastosGrupo(g) {
    if (!g.gastos.length) return '<div class="social-vacio">Apunta el primer gasto con "+ gasto.".</div>';
    const yo = miMiembro(g)?.id;
    const porFecha = {};
    g.gastos.forEach(x => (porFecha[x.fecha] = porFecha[x.fecha] || []).push(x));
    return Object.keys(porFecha).sort().reverse().map(f => `
        <div class="social-dia">${new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        ${porFecha[f].map(x => {
            const parte = (x.reparto || []).find(r => r.miembro === yo);
            const sub = x.tipo === 'transferencia'
                ? `${nombreMiembro(g, x.pagado_por)} → ${nombreMiembro(g, x.reparto?.[0]?.miembro)}`
                : `${x.tipo === 'ingreso' ? 'recibido por' : 'pagado por'} ${nombreMiembro(g, x.pagado_por).replace(/^tú$/, 'ti')}${x.categoria ? ` · ${escapeHtml(x.categoria)}` : ''}`;
            return `
            <button class="social-gasto ${x.tipo}" onclick="openGastoCompartido('${g.id}', '${x.id}')">
                <span class="social-gasto-cuerpo"><b>${escapeHtml(x.titulo)}</b><small>${sub}</small></span>
                <span class="social-gasto-importe"><b>${x.tipo === 'ingreso' ? '−' : ''}${dinero(x.importe)}</b>${x.tipo !== 'transferencia' && parte ? `<small>tu parte ${dinero(parte.importe)}</small>` : ''}</span>
            </button>`;
        }).join('')}`).join('');
}

function renderSaldosGrupo(g) {
    const s = saldosGrupo(g);
    const max = Math.max(1, ...Object.values(s).map(Math.abs));
    const pagos = comoSaldar(g);
    return `
        <div class="social-saldos">${g.miembros.map(m => {
            const v = s[m.id];
            return `
            <div class="social-saldo">
                <span class="social-saldo-nombre">${escapeHtml(nombreMiembro(g, m.id))}</span>
                <span class="social-saldo-barra"><i class="${v >= 0 ? 'positivo' : 'negativo'}" style="width:${Math.abs(v) / max * 50}%"></i></span>
                <span class="social-saldo-cifra ${v > 0 ? 'positivo' : v < 0 ? 'negativo' : ''}">${v > 0 ? '+' : ''}${dinero(v / 100)}</span>
            </div>`;
        }).join('')}</div>
        <div class="uni-bloque-cab" style="margin-top:20px"><div class="uni-etiqueta">cómo saldar.</div></div>
        ${pagos.length ? `<div class="social-pagos">${pagos.map(p => `
            <div class="social-pago">
                <span>${fraseSaldar(g, p.de, p.a)}</span>
                <span class="social-pago-importe">${dinero(p.centimos / 100)}</span>
                <button class="pedido-btn" onclick="marcarPagoSaldado('${g.id}', '${p.de}', '${p.a}', ${p.centimos})">pagado.</button>
            </div>`).join('')}</div>` : '<div class="social-vacio">Todo saldado.</div>'}`;
}

async function marcarPagoSaldado(grupoId, de, a, centimos) {
    const g = gruposGastos.find(x => x.id === grupoId);
    if (!g || !confirm(`¿${nombreMiembro(g, de)} ya ha pagado ${dinero(centimos / 100)} a ${nombreMiembro(g, a)}?`)) return;
    await guardarFilaGasto({ grupo_id: grupoId, tipo: 'transferencia', titulo: 'Pago para saldar', importe: centimos / 100, pagado_por: de, modo: 'importes', reparto: [{ miembro: a, importe: centimos / 100 }], fecha: todayISO() });
}

// ---------- crear / editar grupo ----------
let grupoInvitados = [];
function openGrupoGastos(id) {
    const g = id ? gruposGastos.find(x => x.id === id) : null;
    grupoInvitados = [];
    const yaDentro = new Set((g?.miembros || []).map(m => m.user_id).filter(Boolean));
    showModal(`
        <div class="modal-title">${g ? 'grupo.' : 'nuevo grupo.'}</div>
        <div class="modal-label">Nombre</div>
        <input id="gg-nombre" class="modal-input" value="${escapeHtml(g?.nombre || '')}" placeholder="Viaje a Lisboa, piso, cena de Navidad...">
        <div class="modal-label">Descripción (opcional)</div>
        <input id="gg-desc" class="modal-input" value="${escapeHtml(g?.descripcion || '')}">
        <div class="modal-label">Quién está</div>
        <div class="social-elegir">
            ${g ? g.miembros.map(m => `<label class="dentro"><input type="checkbox" checked disabled> ${escapeHtml(nombreMiembro(g, m.id))}${m.user_id ? '' : ' <small>sin cuenta</small>'}</label>`).join('') : '<label class="dentro"><input type="checkbox" checked disabled> tú</label>'}
            ${amigos.filter(a => !yaDentro.has(a.friend_id)).map(a => `<label><input type="checkbox" class="gg-amigo" value="${a.friend_id}" data-nombre="${escapeHtml(a.nombre_visible || a.friend_nombre || 'Amigo')}"> ${escapeHtml(a.nombre_visible || a.friend_nombre || 'Amigo')}</label>`).join('')}
        </div>
        ${!amigos.length ? '<div class="uni-hint">Aún no tienes amigos en Bitácora: añádelos en la pestaña "amigos." o apunta a la gente sin cuenta aquí abajo.</div>' : ''}
        <div class="modal-label">Alguien sin Bitácora (opcional)</div>
        <div class="friend-add-row"><input id="gg-invitado" class="modal-input" style="margin:0" placeholder="Nombre" onkeydown="if(event.key==='Enter'){event.preventDefault();anadirInvitadoGrupo()}"><button class="btn-secondary" style="width:auto" onclick="anadirInvitadoGrupo()">+ añadir</button></div>
        <div id="gg-invitados" class="social-miembros"></div>
        <button class="btn-modal-primary" onclick="guardarGrupoGastos(${g ? `'${g.id}'` : ''})">guardar.</button>
        ${g ? `<button class="btn-secondary" style="width:100%;margin-top:10px" onclick="salirGrupoGastos('${g.id}')">salir del grupo.</button>` : ''}
        ${g && g.creador_id === socialYo ? `<button class="btn-secondary btn-danger-pill" style="width:100%;margin-top:10px" onclick="borrarGrupoGastos('${g.id}')">borrar grupo para todos.</button>` : ''}
    `);
    if (!g) setTimeout(() => document.getElementById('gg-nombre')?.focus(), 50);
}

function anadirInvitadoGrupo() {
    const i = document.getElementById('gg-invitado');
    const n = i?.value.trim();
    if (!n) return;
    grupoInvitados.push(n);
    i.value = '';
    document.getElementById('gg-invitados').innerHTML = grupoInvitados.map((x, k) => `<span class="invitado">${escapeHtml(x)} <button onclick="grupoInvitados.splice(${k},1);this.parentNode.remove()">×</button></span>`).join('');
}

async function guardarGrupoGastos(id) {
    const nombre = document.getElementById('gg-nombre')?.value.trim();
    if (!nombre) { showToast('Ponle un nombre al grupo', true); return; }
    const descripcion = document.getElementById('gg-desc')?.value.trim() || null;
    const nuevos = [...document.querySelectorAll('.gg-amigo:checked')].map(c => ({ user_id: c.value, nombre: c.dataset.nombre }));
    grupoInvitados.forEach(n => nuevos.push({ user_id: null, nombre: n }));
    try {
        let grupoId = id;
        if (id) {
            const { error } = await sb.from('grupos_gastos').update({ nombre, descripcion }).eq('id', id);
            if (error) throw error;
        } else {
            const { data, error } = await sb.from('grupos_gastos').insert({ nombre, descripcion, creador_id: socialYo }).select().single();
            if (error) throw error;
            grupoId = data.id;
            nuevos.unshift({ user_id: socialYo, nombre: nombrePublico || userName || 'Yo' });
        }
        if (nuevos.length) {
            const { error } = await sb.from('grupos_gastos_miembros').insert(nuevos.map(m => ({ ...m, grupo_id: grupoId })));
            if (error) throw error;
        }
        closeModal();
        await cargarGruposGastos();
        grupoAbierto = grupoId;
        pintarSocial();
        showToast(id ? 'Grupo actualizado' : 'Grupo creado');
    } catch (e) {
        console.error(e);
        showToast('No se pudo guardar el grupo', true);
    }
}

async function salirGrupoGastos(id) {
    if (!confirm('¿Salir del grupo? Si apareces en algún gasto, seguirás saliendo con tu nombre para que las cuentas cuadren.')) return;
    const { error } = await sb.rpc('salir_grupo_gastos', { p_grupo: id });
    if (error) { console.error(error); showToast('No se pudo salir del grupo', true); return; }
    closeModal();
    grupoAbierto = null;
    await cargarGruposGastos();
    pintarSocial();
}

async function borrarGrupoGastos(id) {
    if (!confirm('¿Borrar el grupo y todos sus gastos para todos sus miembros?')) return;
    const { error } = await sb.from('grupos_gastos').delete().eq('id', id);
    if (error) { console.error(error); showToast('No se pudo borrar el grupo', true); return; }
    closeModal();
    grupoAbierto = null;
    await cargarGruposGastos();
    pintarSocial();
}

// ---------- crear / editar gasto ----------
let gastoBorrador = null;
function openGastoCompartido(grupoId, gastoId) {
    const g = gruposGastos.find(x => x.id === grupoId);
    if (!g) return;
    const x = gastoId ? g.gastos.find(y => y.id === gastoId) : null;
    const yo = miMiembro(g)?.id || g.miembros[0]?.id;
    gastoBorrador = {
        grupoId, id: x?.id || null, tipo: x?.tipo || 'gasto', modo: x?.modo || 'igual',
        partes: Object.fromEntries(g.miembros.map(m => {
            const r = x?.reparto?.find(r => r.miembro === m.id);
            return [m.id, x ? (r ? (x.modo === 'importes' ? r.importe : (r.partes ?? 1)) : 0) : 1];
        })),
        para: x?.tipo === 'transferencia' ? x.reparto?.[0]?.miembro : g.miembros.find(m => m.id !== yo)?.id,
    };
    showModal(`
        <div class="modal-title">${x ? 'gasto.' : 'nuevo gasto.'}</div>
        <div class="social-subtabs social-tipo">${[['gasto', 'gasto.'], ['transferencia', 'transferencia.'], ['ingreso', 'ingreso.']].map(([t, n]) => `<button data-tipo="${t}" class="${gastoBorrador.tipo === t ? 'activo' : ''}" onclick="gastoBorrador.tipo='${t}';refrescarGastoModal()">${n}</button>`).join('')}</div>
        <div class="modal-label">Título</div>
        <input id="gc-titulo" class="modal-input" value="${escapeHtml(x?.titulo || '')}" placeholder="Cena, gasolina, supermercado...">
        <div class="modal-row">
            <div><div class="modal-label">Importe (€)</div><input id="gc-importe" class="modal-input" type="number" inputmode="decimal" step="0.01" min="0" value="${x?.importe ?? ''}" oninput="refrescarGastoModal()"></div>
            <div><div class="modal-label">Fecha</div><input id="gc-fecha" class="modal-input" type="date" value="${x?.fecha || todayISO()}"></div>
        </div>
        <div class="modal-row">
            <div><div class="modal-label" id="gc-pagado-label">Pagado por</div><select id="gc-pagado" class="modal-input">${g.miembros.map(m => `<option value="${m.id}" ${(x?.pagado_por || yo) === m.id ? 'selected' : ''}>${escapeHtml(nombreMiembro(g, m.id))}</option>`).join('')}</select></div>
            <div id="gc-categoria-wrap"><div class="modal-label">Categoría</div><select id="gc-categoria" class="modal-input"><option value="">—</option>${GASTO_CATEGORIAS.map(c => `<option ${x?.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        </div>
        <div id="gc-reparto"></div>
        <button class="btn-modal-primary" onclick="guardarGastoCompartido()">guardar.</button>
        ${x ? `<button class="btn-secondary btn-danger-pill" style="width:100%;margin-top:10px" onclick="borrarGastoCompartido('${g.id}', '${x.id}')">borrar.</button>` : ''}
    `);
    refrescarGastoModal();
    if (!x) setTimeout(() => document.getElementById('gc-titulo')?.focus(), 50);
}

// Reparte `centimos` según el modo: a partes iguales entre los marcados,
// por partes (pesos) o por importes escritos a mano. El sobrante de
// redondeo va a los primeros para que la suma sea exacta.
function calcularReparto(g, centimos) {
    const b = gastoBorrador;
    if (b.tipo === 'transferencia') return b.para ? [{ miembro: b.para, importe: centimos / 100 }] : [];
    if (b.modo === 'importes') return g.miembros.filter(m => Number(b.partes[m.id]) > 0).map(m => ({ miembro: m.id, importe: Math.round(Number(b.partes[m.id]) * 100) / 100 }));
    const pesos = g.miembros.map(m => ({ id: m.id, p: b.modo === 'igual' ? (Number(b.partes[m.id]) > 0 ? 1 : 0) : Math.max(0, Number(b.partes[m.id]) || 0) })).filter(x => x.p > 0);
    const totalP = pesos.reduce((t, x) => t + x.p, 0);
    if (!totalP) return [];
    const base = pesos.map(x => ({ ...x, c: Math.floor(centimos * x.p / totalP) }));
    let resto = centimos - base.reduce((t, x) => t + x.c, 0);
    for (let k = 0; resto > 0; k = (k + 1) % base.length, resto--) base[k].c++;
    return base.map(x => ({ miembro: x.id, importe: x.c / 100, ...(b.modo === 'partes' ? { partes: x.p } : {}) }));
}

function refrescarGastoModal() {
    const b = gastoBorrador;
    const g = gruposGastos.find(x => x.id === b.grupoId);
    const cont = document.getElementById('gc-reparto');
    if (!g || !cont) return;
    document.querySelectorAll('.social-tipo button').forEach(el => el.classList.toggle('activo', el.dataset.tipo === b.tipo));
    document.getElementById('gc-pagado-label').textContent = b.tipo === 'transferencia' ? 'De' : b.tipo === 'ingreso' ? 'Recibido por' : 'Pagado por';
    document.getElementById('gc-categoria-wrap').style.visibility = b.tipo === 'transferencia' ? 'hidden' : '';
    const centimos = aCentimos(document.getElementById('gc-importe')?.value || 0);
    if (b.tipo === 'transferencia') {
        cont.innerHTML = `<div class="modal-label">Para</div><select class="modal-input" onchange="gastoBorrador.para=this.value">${g.miembros.map(m => `<option value="${m.id}" ${b.para === m.id ? 'selected' : ''}>${escapeHtml(nombreMiembro(g, m.id))}</option>`).join('')}</select>`;
        return;
    }
    const reparto = calcularReparto(g, centimos);
    const suma = reparto.reduce((t, r) => t + aCentimos(r.importe), 0);
    cont.innerHTML = `
        <div class="uni-bloque-cab" style="margin-top:14px">
            <div class="modal-label" style="margin:0">${b.tipo === 'ingreso' ? 'Para quién' : 'Para quién'}</div>
            <select class="social-modo" onchange="cambiarModoReparto(this.value)">
                <option value="igual" ${b.modo === 'igual' ? 'selected' : ''}>a partes iguales.</option>
                <option value="partes" ${b.modo === 'partes' ? 'selected' : ''}>por partes.</option>
                <option value="importes" ${b.modo === 'importes' ? 'selected' : ''}>por importes.</option>
            </select>
        </div>
        <div class="social-reparto">${g.miembros.map(m => {
            const r = reparto.find(x => x.miembro === m.id);
            const v = b.partes[m.id];
            const control = b.modo === 'igual'
                ? `<input type="checkbox" ${Number(v) > 0 ? 'checked' : ''} onchange="gastoBorrador.partes['${m.id}']=this.checked?1:0;refrescarGastoModal()">`
                : `<input type="number" class="social-reparto-num" min="0" step="${b.modo === 'partes' ? '1' : '0.01'}" value="${Number(v) || ''}" placeholder="0" onchange="gastoBorrador.partes['${m.id}']=this.value;refrescarGastoModal()">`;
            return `<label class="social-reparto-fila">${b.modo === 'igual' ? control : ''}<span>${escapeHtml(nombreMiembro(g, m.id))}</span>${b.modo !== 'igual' ? control : ''}<b>${r ? dinero(r.importe) : '—'}</b></label>`;
        }).join('')}</div>
        ${b.modo === 'importes' && centimos && suma !== centimos ? `<div class="social-descuadre">${suma < centimos ? `faltan ${dinero((centimos - suma) / 100)} por repartir.` : `te pasas ${dinero((suma - centimos) / 100)}.`}</div>` : ''}`;
}

function cambiarModoReparto(modo) {
    const b = gastoBorrador;
    const g = gruposGastos.find(x => x.id === b.grupoId);
    const centimos = aCentimos(document.getElementById('gc-importe')?.value || 0);
    if (modo === 'importes') {
        const actual = calcularReparto(g, centimos);
        b.partes = Object.fromEntries(g.miembros.map(m => [m.id, actual.find(r => r.miembro === m.id)?.importe || 0]));
    } else {
        b.partes = Object.fromEntries(g.miembros.map(m => [m.id, Number(b.partes[m.id]) > 0 ? 1 : 0]));
    }
    b.modo = modo;
    refrescarGastoModal();
}

async function guardarGastoCompartido() {
    const b = gastoBorrador;
    const g = gruposGastos.find(x => x.id === b.grupoId);
    const titulo = document.getElementById('gc-titulo')?.value.trim() || (b.tipo === 'transferencia' ? 'Transferencia' : '');
    const centimos = aCentimos(document.getElementById('gc-importe')?.value || 0);
    if (!titulo) { showToast('Ponle un título', true); return; }
    if (centimos <= 0) { showToast('Escribe el importe', true); return; }
    const pagado_por = document.getElementById('gc-pagado').value;
    const reparto = calcularReparto(g, centimos);
    if (!reparto.length) { showToast('Elige para quién es', true); return; }
    if (b.tipo === 'transferencia' && reparto[0].miembro === pagado_por) { showToast('Una transferencia va de una persona a otra distinta', true); return; }
    if (b.modo === 'importes' && b.tipo !== 'transferencia' && reparto.reduce((t, r) => t + aCentimos(r.importe), 0) !== centimos) { showToast('Los importes no suman el total', true); return; }
    const fila = {
        grupo_id: g.id, tipo: b.tipo, titulo, importe: centimos / 100, pagado_por,
        modo: b.tipo === 'transferencia' ? 'importes' : b.modo, reparto,
        fecha: document.getElementById('gc-fecha')?.value || todayISO(),
        categoria: b.tipo === 'transferencia' ? null : (document.getElementById('gc-categoria')?.value || null),
    };
    await guardarFilaGasto(fila, b.id);
}

async function guardarFilaGasto(fila, id) {
    try {
        const { error } = id
            ? await sb.from('gastos_compartidos').update({ ...fila, actualizado_en: new Date().toISOString() }).eq('id', id)
            : await sb.from('gastos_compartidos').insert({ ...fila, creado_por: socialYo });
        if (error) throw error;
        closeModal();
        await cargarGruposGastos();
        pintarSocial();
    } catch (e) {
        console.error(e);
        showToast('No se pudo guardar el gasto', true);
    }
}

async function borrarGastoCompartido(grupoId, id) {
    if (!confirm('¿Borrar este gasto para todo el grupo?')) return;
    const { error } = await sb.from('gastos_compartidos').delete().eq('id', id);
    if (error) { console.error(error); showToast('No se pudo borrar', true); return; }
    closeModal();
    await cargarGruposGastos();
    pintarSocial();
}

// ---------- eventos compartidos ----------
const EVENTO_CAMPOS_COMPARTIDOS = ['title', 'date', 'time', 'endDate', 'endTime', 'place', 'notes', 'eventType'];

function openCompartirEvento(entryId) {
    const hoy = todayISO();
    const proximos = entries.filter(e => e.type === 'event' && e.date && e.date >= hoy && !isCalendarLogEntry(e)).sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
    if (!amigos.length) { showToast('Añade primero a tus amigos en Social → amigos.', true); return; }
    if (!proximos.length && !entryId) { showToast('No tienes eventos próximos que compartir', true); return; }
    showModal(`
        <div class="modal-title">compartir un evento.</div>
        <div class="modal-label">Evento</div>
        <select id="ce-evento" class="modal-input">${proximos.map(e => `<option value="${e.id}" ${e.id === entryId ? 'selected' : ''}>${escapeHtml(e.title || 'Evento')} · ${new Date(e.date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}${e.time ? ` ${e.time}` : ''}</option>`).join('')}</select>
        <div class="modal-label">Con quién</div>
        <div class="social-elegir">${amigos.map(a => `<label><input type="checkbox" class="ce-amigo" value="${a.friend_id}"> ${escapeHtml(a.nombre_visible || a.friend_nombre || 'Amigo')}</label>`).join('')}</div>
        <div class="modal-label">Nota (opcional)</div>
        <input id="ce-nota" class="modal-input" placeholder="¿Te vienes?">
        <button class="btn-modal-primary" onclick="enviarEventoCompartido()">compartir.</button>
    `);
}

async function enviarEventoCompartido() {
    const ev = entries.find(e => e.id === document.getElementById('ce-evento')?.value);
    const destinos = [...document.querySelectorAll('.ce-amigo:checked')].map(c => c.value);
    if (!ev) return;
    if (!destinos.length) { showToast('Elige al menos un amigo', true); return; }
    const evento = Object.fromEntries(EVENTO_CAMPOS_COMPARTIDOS.filter(k => ev[k]).map(k => [k, ev[k]]));
    const nota = document.getElementById('ce-nota')?.value.trim() || null;
    const { error } = await sb.from('eventos_compartidos').insert(destinos.map(d => ({ remitente_id: socialYo, destinatario_id: d, evento, nota })));
    if (error) { console.error(error); showToast('No se pudo compartir', true); return; }
    closeModal();
    showToast(destinos.length === 1 ? 'Evento compartido' : `Compartido con ${destinos.length} amigos`);
}

async function aceptarEventoCompartido(id) {
    const e = eventosCompartidosRecibidos.find(x => x.id === id);
    if (!e) return;
    const ev = Object.fromEntries(EVENTO_CAMPOS_COMPARTIDOS.filter(k => e.evento?.[k]).map(k => [k, e.evento[k]]));
    entries.push({ id: 'entry_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), type: 'event', categoryId: getCategoryIdForType('event'), tags: [], ...ev, compartidoPor: e.nombre, createdAt: new Date().toISOString() });
    await descartarEventoCompartido(id, true);
    render();
    showToast('Añadido a tu calendario');
    try { await saveData(); } catch (err) { console.error(err); showToast('No se pudo guardar en la nube', true); }
}

async function descartarEventoCompartido(id, silencioso) {
    await sb.from('eventos_compartidos').delete().eq('id', id);
    eventosCompartidosRecibidos = eventosCompartidosRecibidos.filter(x => x.id !== id);
    if (typeof updateNotifBadge === 'function') updateNotifBadge();
    if (!silencioso) pintarSocial();
}
