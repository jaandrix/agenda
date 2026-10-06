// ============================================================
//  ACTUALIZACIONES — seguimiento manual de pedidos por internet
//  (AliExpress, Vinted, Amazon...). Cada pedido lleva su estado en
//  una escala fija y su historial; el seguimiento detallado se abre
//  en 17TRACK, que reconoce solo el transportista por el número.
//  El estado vive en la variable global `pedidos` (declarada en js/nucleo.js
//  para que la carga y la fusión con la nube no dependan de este
//  archivo).
// ============================================================
const PEDIDO_ESTADOS = [
    { id: 'pedido', texto: 'pedido.', corto: 'pedido.' },
    { id: 'enviado', texto: 'enviado.', corto: 'enviado.' },
    { id: 'transito', texto: 'en camino.', corto: 'camino.' },
    { id: 'reparto', texto: 'en reparto.', corto: 'reparto.' },
    { id: 'entregado', texto: 'entregado.', corto: 'llegó.' },
];
const PEDIDO_TIENDAS = ['AliExpress', 'Vinted', 'Amazon', 'Shein', 'Temu', 'Wallapop', 'Zara', 'Otra'];
const ICONO_PAQUETE = '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M50 6l40 20v48L50 94 10 74V26zM50 16L24 29l26 13 26-13zM18 37v32l28 14V51zm64 0L54 51v32l28-14z"/></svg>';
let verEntregados = false;

function pedidoIndiceEstado(p) {
    const i = PEDIDO_ESTADOS.findIndex(e => e.id === p.estado);
    return i < 0 ? 0 : i;
}

function pedidosActivos() {
    return pedidos.filter(p => p.estado !== 'entregado');
}

function diasHastaPedido(iso) {
    if (!iso) return null;
    return Math.round((new Date(iso + 'T12:00:00') - new Date(todayISO() + 'T12:00:00')) / 86400000);
}

function textoLlegada(p) {
    if (p.estado === 'entregado') return p.fechaEntrega ? `entregado el ${fechaCortaPedido(p.fechaEntrega)}.` : 'entregado.';
    const d = diasHastaPedido(p.fechaEstimada);
    if (d === null) return 'sin fecha estimada.';
    if (d < 0) return `debía llegar el ${fechaCortaPedido(p.fechaEstimada)}.`;
    if (d === 0) return 'llega hoy.';
    if (d === 1) return 'llega mañana.';
    return `llega en ${d} días · ${fechaCortaPedido(p.fechaEstimada)}.`;
}

function fechaCortaPedido(iso) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Si el enlace del pedido (o el propio número) es una página de seguimiento
// de un transportista, se abre esa: 17TRACK no reconoce números cortos como
// los de InPost/Vinted.
const ES_PAGINA_SEGUIMIENTO = /^https?:\/\/[^/]*(inpost|correos|seur|gls|mrw|ups|dhl|dpd|nacex|ctt|17track|cainiao)\./i;
function urlSeguimiento(p) {
    if (ES_PAGINA_SEGUIMIENTO.test(p.seguimiento || '')) return p.seguimiento;
    if (ES_PAGINA_SEGUIMIENTO.test(p.url || '')) return p.url;
    return 'https://t.17track.net/es#nums=' + encodeURIComponent(p.seguimiento);
}

function renderActualizaciones() {
    const activos = pedidosActivos().sort((a, b) => (a.fechaEstimada || '9999').localeCompare(b.fechaEstimada || '9999'));
    const entregados = pedidos.filter(p => p.estado === 'entregado').sort((a, b) => (b.fechaEntrega || '').localeCompare(a.fechaEntrega || ''));
    const estaSemana = activos.filter(p => { const d = diasHastaPedido(p.fechaEstimada); return d !== null && d >= 0 && d <= 7; }).length;
    const retrasados = activos.filter(p => { const d = diasHastaPedido(p.fechaEstimada); return d !== null && d < 0; }).length;
    return `
    <div class="pedidos-vista">
        <div class="pedidos-cabecera">
            <div>
                <div class="pedidos-titulo">actualizaciones.</div>
                <div class="pedidos-sub">${activos.length ? `${activos.length} ${activos.length === 1 ? 'pedido en camino' : 'pedidos en camino'}${estaSemana ? ` · ${estaSemana} llega${estaSemana === 1 ? '' : 'n'} esta semana` : ''}${retrasados ? ` · ${retrasados} con retraso` : ''}.` : 'Nada en camino ahora mismo.'}</div>
            </div>
            <button class="btn-modal-primary pedidos-nuevo" onclick="openPedido()">+ pedido.</button>
        </div>
        ${activos.length ? `<div class="pedidos-lista">${activos.map(renderPedidoTarjeta).join('')}</div>` : `
        <div class="pedidos-vacio">
            <div class="pedidos-vacio-icono">${ICONO_PAQUETE}</div>
            <div class="pedidos-vacio-titulo">sin pedidos en camino.</div>
            <div class="pedidos-vacio-sub">Apunta lo que compras por internet con su número de seguimiento y aquí verás en qué punto está y cuándo llega.</div>
        </div>`}
        ${entregados.length ? `
        <button class="pedidos-entregados-btn" onclick="verEntregados = !verEntregados; render()">${verEntregados ? 'ocultar' : 'ver'} entregados. <span>${entregados.length}</span></button>
        ${verEntregados ? `<div class="pedidos-lista pedidos-lista-entregados">${entregados.map(renderPedidoTarjeta).join('')}</div>` : ''}` : ''}
    </div>`;
}

function renderPedidoTarjeta(p) {
    const paso = pedidoIndiceEstado(p);
    const d = diasHastaPedido(p.fechaEstimada);
    const retraso = p.estado !== 'entregado' && d !== null && d < 0;
    const historial = p.historial || [];
    const ultimo = historial[historial.length - 1];
    return `
    <div class="pedido ${p.estado === 'entregado' ? 'entregado' : ''} ${retraso ? 'retraso' : ''}">
        <div class="pedido-top">
            <div class="pedido-tienda">${escapeHtml((p.tienda || 'otra').toLowerCase())}.</div>
            ${p.precio ? `<div class="pedido-precio">${financeMoney(p.precio)}</div>` : ''}
        </div>
        <div class="pedido-titulo">${escapeHtml(p.titulo)}</div>
        <div class="pedido-llegada">${textoLlegada(p)}</div>
        <div class="pedido-pasos" role="list">
            ${PEDIDO_ESTADOS.map((e, i) => `<div class="pedido-paso ${i <= paso ? 'hecho' : ''} ${i === paso ? 'actual' : ''}" role="listitem"><span></span><small>${e.corto}</small></div>`).join('')}
        </div>
        ${ultimo?.nota ? `<div class="pedido-nota">${escapeHtml(ultimo.nota)}</div>` : ''}
        ${p.seguimiento ? `<div class="pedido-codigo"><code>${escapeHtml(p.seguimiento)}</code><button onclick="navigator.clipboard.writeText('${escapeHtml(p.seguimiento).replace(/'/g, '')}').then(() => showToast('Número copiado'))">copiar.</button></div>` : ''}
        <div class="pedido-acciones">
            ${p.estado !== 'entregado' ? `<button class="pedido-btn pedido-btn-principal" onclick="avanzarPedido('${p.id}')">→ ${PEDIDO_ESTADOS[Math.min(paso + 1, PEDIDO_ESTADOS.length - 1)].texto}</button>` : ''}
            ${p.seguimiento ? `<a class="pedido-btn" href="${escapeHtml(urlSeguimiento(p))}" target="_blank" rel="noopener">seguir envío.</a>` : ''}
            ${p.url && !ES_PAGINA_SEGUIMIENTO.test(p.url) ? `<a class="pedido-btn" href="${escapeHtml(p.url)}" target="_blank" rel="noopener">ver pedido.</a>` : ''}
            <button class="pedido-btn" onclick="openPedido('${p.id}')">editar.</button>
        </div>
    </div>`;
}

function openPedido(id) {
    const p = id ? pedidos.find(x => x.id === id) : null;
    const v = (k, def = '') => escapeHtml(p?.[k] ?? def);
    showModal(`
        <div class="modal-title">${p ? 'pedido.' : 'nuevo pedido.'}</div>
        <div class="modal-label">Qué es</div>
        <input id="ped-titulo" class="modal-input" value="${v('titulo')}" placeholder="Zapatillas, funda del móvil...">
        <div class="modal-row">
            <div><div class="modal-label">Tienda</div><select id="ped-tienda" class="modal-input">${PEDIDO_TIENDAS.map(t => `<option ${(p?.tienda || 'AliExpress') === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
            <div><div class="modal-label">Precio (opcional)</div><input id="ped-precio" class="modal-input" type="number" step="0.01" min="0" value="${v('precio')}"></div>
        </div>
        <div class="modal-label">Número de seguimiento</div>
        <input id="ped-seguimiento" class="modal-input" value="${v('seguimiento')}" placeholder="LP00123456789CN" autocapitalize="characters">
        <div class="modal-label">Enlace del pedido (opcional)</div>
        <input id="ped-url" class="modal-input" type="url" value="${v('url')}" placeholder="https://...">
        <div class="modal-row">
            <div><div class="modal-label">Pedido el</div><input id="ped-fecha" class="modal-input" type="date" value="${v('fechaPedido', todayISO())}"></div>
            <div><div class="modal-label">Llegada estimada</div><input id="ped-estimada" class="modal-input" type="date" value="${v('fechaEstimada')}"></div>
        </div>
        <div class="modal-label">Estado</div>
        <select id="ped-estado" class="modal-input">${PEDIDO_ESTADOS.map(e => `<option value="${e.id}" ${(p?.estado || 'pedido') === e.id ? 'selected' : ''}>${e.texto}</option>`).join('')}</select>
        <div class="modal-label">Última novedad (opcional)</div>
        <input id="ped-nota" class="modal-input" placeholder="En aduanas, salió del almacén de Madrid...">
        <button class="btn-modal-primary" onclick="guardarPedido(${p ? `'${p.id}'` : ''})">guardar.</button>
        ${p ? `<button class="btn-secondary btn-danger-pill" style="width:100%;margin-top:10px" onclick="borrarPedido('${p.id}')">borrar pedido.</button>` : ''}
    `);
    if (!p) setTimeout(() => document.getElementById('ped-titulo')?.focus(), 50);
}

async function guardarPedido(id) {
    const val = k => document.getElementById(k)?.value.trim() || '';
    const titulo = val('ped-titulo');
    if (!titulo) { showToast('Escribe qué has pedido', true); return; }
    const estado = val('ped-estado') || 'pedido';
    const nota = val('ped-nota');
    const datos = {
        titulo, tienda: val('ped-tienda'), seguimiento: val('ped-seguimiento').toUpperCase(), url: val('ped-url'),
        fechaPedido: val('ped-fecha'), fechaEstimada: val('ped-estimada'), precio: Number(val('ped-precio')) || undefined, estado,
    };
    let p = id ? pedidos.find(x => x.id === id) : null;
    if (p) {
        const cambioEstado = p.estado !== estado;
        Object.assign(p, datos);
        if (cambioEstado || nota) p.historial = [...(p.historial || []), { fecha: todayISO(), estado, nota: nota || undefined }];
    } else {
        p = { id: 'ped_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), ...datos, historial: [{ fecha: todayISO(), estado, nota: nota || undefined }] };
        pedidos.push(p);
    }
    if (estado === 'entregado' && !p.fechaEntrega) p.fechaEntrega = todayISO();
    if (estado !== 'entregado') delete p.fechaEntrega;
    closeModal();
    render();
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}

async function avanzarPedido(id) {
    const p = pedidos.find(x => x.id === id);
    if (!p) return;
    const siguiente = PEDIDO_ESTADOS[Math.min(pedidoIndiceEstado(p) + 1, PEDIDO_ESTADOS.length - 1)].id;
    p.estado = siguiente;
    p.historial = [...(p.historial || []), { fecha: todayISO(), estado: siguiente }];
    if (siguiente === 'entregado') { p.fechaEntrega = todayISO(); showToast('Pedido entregado'); }
    render();
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}

async function borrarPedido(id) {
    if (!confirm('¿Borrar este pedido?')) return;
    pedidos = pedidos.filter(x => x.id !== id);
    closeModal();
    render();
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}
