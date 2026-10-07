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
let socialTab = 'gastos';
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

function setSocialTab(t) { socialTab = t; grupoAbierto = null; pintarSocial(); }

function renderFriendsView() {
    const pendientes = (solicitudesRecibidas || []).length;
    const tabs = [['gastos', 'gastos.'], ['eventos', 'eventos.' + (eventosCompartidosRecibidos.length ? ` <span>${eventosCompartidosRecibidos.length}</span>` : '')], ['amigos', 'amigos.' + (pendientes ? ` <span>${pendientes}</span>` : '')]];
    return `
    <div class="social" id="social">
        <div class="social-cabecera">
            <div class="uni-titulo">social.</div>
            <div class="social-tabs">${tabs.map(([id, t]) => `<button class="${socialTab === id ? 'activo' : ''}" onclick="setSocialTab('${id}')">${t}</button>`).join('')}</div>
        </div>
        ${socialTab === 'gastos' ? (grupoAbierto ? renderGrupoGastos() : renderListaGrupos()) : socialTab === 'eventos' ? renderEventosSocial() : renderAmigosLista()}
    </div>`;
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

// ---------- lista de grupos ----------
function renderListaGrupos() {
    if (!socialCargado) return '<div class="finance-empty-line">Cargando...</div>';
    return `
        <div class="social-intro">
            <p>Viajes, cenas, el piso... Apuntad quién paga qué y Bitácora calcula cuánto debe cada uno y cómo saldarlo con los mínimos pagos.</p>
            <button class="btn-modal-primary" onclick="openGrupoGastos()">+ grupo.</button>
        </div>
        ${gruposGastos.length ? `<div class="social-grupos">${gruposGastos.map(g => {
            const t = totalesGrupo(g);
            return `
            <button class="social-grupo" onclick="abrirGrupoGastos('${g.id}')">
                <span class="social-grupo-nombre">${escapeHtml(g.nombre)}</span>
                <span class="social-grupo-meta">${g.miembros.length} personas · ${g.gastos.filter(x => x.tipo !== 'transferencia').length} gastos · ${dinero(t.total / 100)}</span>
                <span class="social-grupo-saldo ${t.saldo > 0 ? 'positivo' : t.saldo < 0 ? 'negativo' : ''}">${textoSaldo(t.saldo)}</span>
            </button>`;
        }).join('')}</div>` : `<div class="social-vacio">Aún no tienes grupos de gastos.<br>Crea uno para un viaje, una cena o tu piso.</div>`}`;
}

function abrirGrupoGastos(id) { grupoAbierto = id; grupoPestana = 'gastos'; pintarSocial(); }
function setGrupoPestana(p) { grupoPestana = p; pintarSocial(); }

// ---------- un grupo ----------
function renderGrupoGastos() {
    const g = gruposGastos.find(x => x.id === grupoAbierto);
    if (!g) { grupoAbierto = null; return renderListaGrupos(); }
    const t = totalesGrupo(g);
    return `
        <div class="social-grupo-cab">
            <button class="pedido-btn" onclick="setSocialTab('gastos')">← grupos.</button>
            <button class="pedido-btn" onclick="openGrupoGastos('${g.id}')">editar.</button>
        </div>
        <div class="social-grupo-titulo">${escapeHtml(g.nombre)}</div>
        ${g.descripcion ? `<div class="uni-sub">${escapeHtml(g.descripcion)}</div>` : ''}
        <div class="social-miembros">${g.miembros.map(m => `<span class="${m.user_id ? '' : 'invitado'}">${escapeHtml(nombreMiembro(g, m.id))}</span>`).join('')}</div>
        <div class="social-cifras">
            <div><small>mis gastos.</small><b>${dinero(t.mio / 100)}</b></div>
            <div><small>total del grupo.</small><b>${dinero(t.total / 100)}</b></div>
            <div class="${t.saldo > 0 ? 'positivo' : t.saldo < 0 ? 'negativo' : ''}"><small>mi saldo.</small><b>${t.saldo > 0 ? '+' : ''}${dinero(t.saldo / 100)}</b></div>
        </div>
        <div class="social-subtabs">
            <button class="${grupoPestana === 'gastos' ? 'activo' : ''}" onclick="setGrupoPestana('gastos')">gastos.</button>
            <button class="${grupoPestana === 'saldos' ? 'activo' : ''}" onclick="setGrupoPestana('saldos')">saldos.</button>
            <button class="btn-modal-primary social-nuevo-gasto" onclick="openGastoCompartido('${g.id}')">+ gasto.</button>
        </div>
        ${grupoPestana === 'gastos' ? renderGastosGrupo(g) : renderSaldosGrupo(g)}`;
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

function renderEventosSocial() {
    return `
        <div class="social-intro">
            <p>Comparte un evento tuyo (una cena, un partido, un concierto) y a tus amigos les llega para añadirlo a su calendario.</p>
            <button class="btn-modal-primary" onclick="openCompartirEvento()">compartir un evento.</button>
        </div>
        ${eventosCompartidosRecibidos.length ? `<div class="uni-bloque-cab"><div class="uni-etiqueta">te han compartido.</div></div>
        <div class="social-grupos">${eventosCompartidosRecibidos.map(e => {
            const ev = e.evento || {};
            return `
            <div class="social-grupo social-evento">
                <span class="social-grupo-meta">${escapeHtml(e.nombre || 'Un amigo')} te comparte</span>
                <span class="social-grupo-nombre">${escapeHtml(ev.title || 'Evento')}</span>
                <span class="social-grupo-meta">${ev.date ? new Date(ev.date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}${ev.time ? ` · ${escapeHtml(ev.time)}` : ''}${ev.place ? ` · ${escapeHtml(ev.place)}` : ''}</span>
                ${e.nota ? `<span class="pedido-nota">${escapeHtml(e.nota)}</span>` : ''}
                <span class="pedido-acciones"><button class="pedido-btn pedido-btn-principal" onclick="aceptarEventoCompartido('${e.id}')">añadir a mi calendario.</button><button class="pedido-btn" onclick="descartarEventoCompartido('${e.id}')">descartar.</button></span>
            </div>`;
        }).join('')}</div>` : '<div class="social-vacio">Nadie te ha compartido ningún evento todavía.</div>'}`;
}

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
