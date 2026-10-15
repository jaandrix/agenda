// ============================================================
//  COMPRA (vista 'compra', apartado opcional de la rama #home)
//  Listas de la compra ordenadas por secciones del súper (como se recorre
//  la tienda), con lo que ya está en el carro abajo y tachado, lo que más
//  compras a un toque y un total estimado. Al terminar se limpia el carro
//  y, si se quiere, el gasto pasa a Finanzas.
//  Datos: `listaCompra` (sincronizado) = { listas: [{ id, nombre, items:
//  [{ id, texto, cantidad, precio, hecho }] }], actual, frecuentes: {
//  'texto en minúscula': veces } }.
// ============================================================
const COMPRA_SECCIONES = [
    ['fruta', 'frutas y verduras.', /\b(manzan|plátan|platan|naranj|limon|limón|pera|uva|fres|kiwi|melon|melón|sandí|sandi|piña|aguacate|tomate|lechug|cebolla|ajo|patata|zanahori|pimient|calabac|berenjen|pepino|brócoli|brocoli|espinac|champiñ|seta|fruta|verdura|ensalad|perejil|cilantro)/],
    ['fresco', 'carne y pescado.', /\b(pollo|pavo|ternera|cerdo|carne|filete|hamburgues|salchich|chorizo|jamón|jamon|lomo|bacon|beicon|pescado|salmón|salmon|merluza|atún fresco|gamba|langostino|calamar|sepia|mejill)/],
    ['lacteo', 'lácteos y huevos.', /\b(leche|yogur|queso|mantequilla|nata|huevo|kéfir|kefir|batido)/],
    ['pan', 'panadería.', /\b(pan\b|barra|baguette|bollo|croissant|cruasán|magdalen|tostad|biscote|bizcocho|galleta)/],
    ['despensa', 'despensa.', /\b(arroz|pasta|macarr|espagu|lenteja|garbanzo|alubia|harina|azúcar|azucar|sal\b|aceite|vinagre|atún|atun|conserva|tomate frito|salsa|especia|café|cafe|té\b|cacao|cereal|avena|miel|mermelada|chocolate|frutos secos|nuez|almendra|patatas fritas|snack)/],
    ['congelado', 'congelados.', /\b(congelad|helado|pizza|nugget|guisantes congelados)/],
    ['bebida', 'bebidas.', /\b(agua|refresco|coca|zumo|cerveza|vino|bebida|tónica|tonica|leche de avena|bebida vegetal)/],
    ['limpieza', 'limpieza y hogar.', /\b(detergente|suavizante|lejía|lejia|friegasuelos|lavavajillas|bayeta|estropajo|papel de cocina|papel higiénico|papel higienico|servilleta|bolsa de basura|basura|limpia|ambientador|pila|bombilla)/],
    ['higiene', 'higiene.', /\b(champú|champu|gel|jabón|jabon|pasta de dientes|dentífrico|cepillo|desodorante|compresa|tampón|tampon|crema|cuchilla|maquinilla|algodón|algodon|colonia)/],
];

function datosCompra() {
    if (!listaCompra || typeof listaCompra !== 'object') listaCompra = { listas: [], frecuentes: {} };
    if (!Array.isArray(listaCompra.listas)) listaCompra.listas = [];
    if (!listaCompra.frecuentes || typeof listaCompra.frecuentes !== 'object') listaCompra.frecuentes = {};
    if (!listaCompra.listas.length) listaCompra.listas.push({ id: 'lista_' + Date.now(), nombre: 'Casa', items: [] });
    listaCompra.listas.forEach(l => { if (!Array.isArray(l.items)) l.items = []; });
    if (!listaCompra.listas.some(l => l.id === listaCompra.actual)) listaCompra.actual = listaCompra.listas[0].id;
    return listaCompra;
}

function compraListaActual() {
    const d = datosCompra();
    return d.listas.find(l => l.id === d.actual);
}

function compraSeccion(texto) {
    const t = texto.toLowerCase();
    return (COMPRA_SECCIONES.find(([, , re]) => re.test(t)) || ['otros'])[0];
}

// "2 leche", "leche x2", "3 kg patatas" o "leche 1,20 €": cantidad delante o
// detrás y, si se escribe, el precio por unidad.
function compraInterpretar(texto) {
    let t = texto.trim().replace(/\s+/g, ' ');
    let precio = null;
    const mp = t.match(/(\d+(?:[.,]\d{1,2})?)\s*€/);
    if (mp) { precio = Number(mp[1].replace(',', '.')); t = t.replace(mp[0], '').trim(); }
    let cantidad = '';
    let m = t.match(/^(\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|uds?|paquetes?|botes?|latas?|docenas?)?)\s+(.+)$/i);
    if (m) { cantidad = m[1]; t = m[2]; }
    else if ((m = t.match(/^(.+?)\s+x\s*(\d+)$/i))) { cantidad = m[2]; t = m[1]; }
    return { texto: t.charAt(0).toUpperCase() + t.slice(1), cantidad, precio };
}

function compraUnidades(it) {
    const n = Number(String(it.cantidad || '').replace(',', '.').match(/^\d+(?:\.\d+)?/)?.[0]);
    return /kg|g\b|ml|\bl\b/i.test(it.cantidad || '') ? 1 : (n > 0 ? n : 1);
}

function compraImporte(items) {
    return items.reduce((s, it) => s + (Number(it.precio) > 0 ? Number(it.precio) * compraUnidades(it) : 0), 0);
}

function renderCompra() {
    const d = datosCompra();
    const l = compraListaActual();
    const pendientes = l.items.filter(i => !i.hecho);
    const carro = l.items.filter(i => i.hecho);
    const enLista = new Set(l.items.map(i => i.texto.toLowerCase()));
    const frecuentes = Object.entries(d.frecuentes).filter(([t]) => !enLista.has(t)).sort((a, b) => b[1] - a[1]).slice(0, 12);
    const grupos = [...COMPRA_SECCIONES.map(([k, t]) => [k, t]), ['otros', 'otros.']]
        .map(([k, t]) => [t, pendientes.filter(i => compraSeccion(i.texto) === k)]).filter(([, xs]) => xs.length);
    const estimado = compraImporte(l.items);
    const fila = it => `<div class="compra-item ${it.hecho ? 'hecho' : ''}">
        <button class="compra-check ${it.hecho ? 'on' : ''}" onclick="compraMarcar('${it.id}')" aria-label="${it.hecho ? 'Sacar del carro' : 'Al carro'}"></button>
        <button class="compra-item-txt" onclick="openCompraItem('${it.id}')"><b>${escapeHtml(it.texto)}</b>${it.cantidad ? `<span>${escapeHtml(it.cantidad)}</span>` : ''}</button>
        ${Number(it.precio) > 0 ? `<i>${financeMoney(Number(it.precio) * compraUnidades(it))}</i>` : ''}
    </div>`;
    return `
    <div class="compra">
        <div class="compra-cab">
            <div>
                <div class="compra-titulo">Compra</div>
                <div class="compra-sub">${pendientes.length ? `${pendientes.length} por coger${carro.length ? `, ${carro.length} en el carro` : ''}.` : carro.length ? 'Todo en el carro.' : 'La lista está vacía.'}${estimado ? ` Unos ${financeMoney(estimado)}.` : ''}</div>
            </div>
            <button class="pedido-btn" onclick="openCompraListas()">listas.</button>
        </div>
        ${d.listas.length > 1 ? `<div class="compra-listas">${d.listas.map(x => `<button class="profe-chip ${x.id === l.id ? 'activa' : ''}" onclick="compraElegirLista('${x.id}')">${escapeHtml(x.nombre.toLowerCase())}. <small>${x.items.filter(i => !i.hecho).length}</small></button>`).join('')}</div>` : ''}
        <div class="compra-anadir">
            <input id="compra-nuevo" class="modal-input" placeholder="Añadir: 2 leche, pan, tomates 1,20 €..." onkeydown="if(event.key==='Enter'){event.preventDefault();compraAnadir(this.value)}" autocomplete="off">
            <button class="btn-modal-primary" onclick="compraAnadir(document.getElementById('compra-nuevo').value)">añadir.</button>
        </div>
        ${frecuentes.length ? `<div class="compra-frecuentes"><span>lo de siempre.</span>${frecuentes.map(([t]) => `<button onclick="compraAnadir('${escapeHtml(t).replace(/'/g, '&#39;')}', true)">+ ${escapeHtml(t)}</button>`).join('')}</div>` : ''}
        ${!l.items.length ? `<div class="compra-vacio"><b>apunta lo que falta.</b>Escríbelo según te acuerdes: se ordena solo por secciones del súper, como se recorre la tienda. Lo que más compras te saldrá aquí para añadirlo con un toque.</div>` : ''}
        ${grupos.map(([t, xs]) => `<div class="compra-seccion"><div class="compra-seccion-titulo">${t}</div>${xs.map(fila).join('')}</div>`).join('')}
        ${carro.length ? `<div class="compra-seccion compra-carro"><div class="compra-seccion-titulo">en el carro.${compraImporte(carro) ? ` <span>${financeMoney(compraImporte(carro))}</span>` : ''}</div>${carro.map(fila).join('')}
            <button class="btn-modal-primary compra-terminar" onclick="openCompraTerminar()">terminar la compra.</button></div>` : ''}
    </div>`;
}

async function guardarCompra() {
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}

function compraRepintar(foco) {
    render();
    if (foco) setTimeout(() => document.querySelector('#mobile-shell #compra-nuevo, #content #compra-nuevo')?.focus(), 0);
}

function compraAnadir(texto, desdeFrecuente) {
    if (!texto || !texto.trim()) return;
    const l = compraListaActual();
    texto.split(/\n|,(?!\d)/).map(x => x.trim()).filter(Boolean).forEach(parte => {
        const it = compraInterpretar(parte);
        if (!it.texto) return;
        const ya = l.items.find(x => !x.hecho && x.texto.toLowerCase() === it.texto.toLowerCase());
        if (ya) { if (it.cantidad) ya.cantidad = it.cantidad; if (it.precio) ya.precio = it.precio; return; }
        const previo = datosCompra().listas.flatMap(x => x.items).find(x => x.texto.toLowerCase() === it.texto.toLowerCase() && Number(x.precio) > 0);
        l.items.push({ id: 'cmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), texto: it.texto, cantidad: it.cantidad, precio: it.precio ?? previo?.precio ?? null, hecho: false });
    });
    compraRepintar(!desdeFrecuente);
    guardarCompra();
}

function compraMarcar(id) {
    const it = compraListaActual().items.find(x => x.id === id);
    if (!it) return;
    it.hecho = !it.hecho;
    render();
    guardarCompra();
}

function compraElegirLista(id) {
    datosCompra().actual = id;
    render();
    guardarCompra();
}

function openCompraItem(id) {
    const it = compraListaActual().items.find(x => x.id === id);
    if (!it) return;
    showModal(`
        <div class="modal-title">${escapeHtml(it.texto)}</div>
        <div class="modal-label">qué</div>
        <input id="compra-it-texto" class="modal-input" value="${escapeHtml(it.texto)}">
        <div class="lab-horas">
            <div><div class="modal-label">cantidad</div><input id="compra-it-cant" class="modal-input" value="${escapeHtml(it.cantidad || '')}" placeholder="2, 1 kg, 3 latas..."></div>
            <div><div class="modal-label">precio por unidad</div><input id="compra-it-precio" class="modal-input" inputmode="decimal" value="${it.precio ? String(it.precio).replace('.', ',') : ''}" placeholder="1,20"></div>
        </div>
        <button class="btn-modal-primary" onclick="guardarCompraItem('${id}')">guardar.</button>
        <button class="btn-secondary" style="margin-top:8px;color:#dc2626" onclick="borrarCompraItem('${id}')">quitar de la lista.</button>
    `);
}

function guardarCompraItem(id) {
    const it = compraListaActual().items.find(x => x.id === id);
    if (!it) return;
    it.texto = document.getElementById('compra-it-texto').value.trim() || it.texto;
    it.cantidad = document.getElementById('compra-it-cant').value.trim();
    const p = Number(document.getElementById('compra-it-precio').value.replace(',', '.'));
    it.precio = p > 0 ? Math.round(p * 100) / 100 : null;
    closeModal();
    render();
    guardarCompra();
}

function borrarCompraItem(id) {
    const l = compraListaActual();
    l.items = l.items.filter(x => x.id !== id);
    closeModal();
    render();
    guardarCompra();
}

function openCompraListas() {
    const d = datosCompra();
    showModal(`
        <div class="modal-title">listas.</div>
        <p class="finance-modal-note" style="margin-top:0">Una por sitio o por súper: casa, el piso, Mercadona, la del finde...</p>
        ${d.listas.map(l => `<div class="compra-lista-fila"><b>${escapeHtml(l.nombre)}</b><span>${l.items.length} productos</span>
            <button class="pedido-btn" onclick="compraRenombrarLista('${l.id}')">renombrar.</button>
            ${d.listas.length > 1 ? `<button class="pedido-btn" style="color:#dc2626" onclick="compraBorrarLista('${l.id}')">eliminar.</button>` : ''}</div>`).join('')}
        <div class="compra-anadir" style="margin-top:12px">
            <input id="compra-lista-nueva" class="modal-input" placeholder="Nombre de la lista nueva">
            <button class="btn-modal-primary" onclick="compraNuevaLista()">crear.</button>
        </div>
    `);
}

function compraNuevaLista() {
    const nombre = document.getElementById('compra-lista-nueva')?.value.trim();
    if (!nombre) return;
    const d = datosCompra();
    const l = { id: 'lista_' + Date.now(), nombre, items: [] };
    d.listas.push(l);
    d.actual = l.id;
    closeModal();
    render();
    guardarCompra();
}

function compraRenombrarLista(id) {
    const l = datosCompra().listas.find(x => x.id === id);
    const nombre = l && prompt('Nombre de la lista', l.nombre);
    if (!nombre || !nombre.trim()) return;
    l.nombre = nombre.trim();
    openCompraListas();
    render();
    guardarCompra();
}

function compraBorrarLista(id) {
    const d = datosCompra();
    const l = d.listas.find(x => x.id === id);
    if (!l || !confirm(`¿Eliminar la lista «${l.nombre}»?`)) return;
    d.listas = d.listas.filter(x => x.id !== id);
    openCompraListas();
    render();
    guardarCompra();
}

// Al terminar: lo del carro sale de la lista, cuenta para "lo de
// siempre" y, si se quiere, se apunta el gasto en Finanzas.
function openCompraTerminar() {
    const l = compraListaActual();
    const carro = l.items.filter(i => i.hecho);
    const importe = compraImporte(carro);
    const cuentas = typeof FINANCE_PRO_ACCOUNT_KEYS !== 'undefined' ? FINANCE_PRO_ACCOUNT_KEYS : [];
    showModal(`
        <div class="modal-title">terminar la compra.</div>
        <p class="finance-modal-note" style="margin-top:0">${carro.length} ${carro.length === 1 ? 'producto sale' : 'productos salen'} de la lista. Lo que quede sin coger se queda para la próxima.</p>
        <label class="finance-tx-marca"><input type="checkbox" id="compra-a-finanzas" checked onchange="document.getElementById('compra-gasto').hidden=!this.checked"><span><b>apuntar el gasto en finanzas.</b><small>Lo que pagaste, en comida y bebida.</small></span></label>
        <div id="compra-gasto">
            <div class="lab-horas">
                <div><div class="modal-label">importe</div><input id="compra-importe" class="modal-input" inputmode="decimal" value="${importe ? importe.toFixed(2).replace('.', ',') : ''}" placeholder="0,00"></div>
                <div><div class="modal-label">cuenta</div><select id="compra-cuenta" class="modal-input">${cuentas.map(k => `<option value="${k}" ${k === (financePro.cuentaImport || 'bancos') ? 'selected' : ''}>${escapeHtml(financePro.accounts[k]?.name || k)}</option>`).join('')}</select></div>
            </div>
            <div class="finance-modal-note">Si luego importas el extracto del banco, este gasto se emparejará con el cargo real.</div>
        </div>
        <button class="btn-modal-primary" onclick="terminarCompra()">terminar.</button>
    `);
}

async function terminarCompra() {
    const d = datosCompra();
    const l = compraListaActual();
    const carro = l.items.filter(i => i.hecho);
    carro.forEach(i => { const k = i.texto.toLowerCase(); d.frecuentes[k] = (d.frecuentes[k] || 0) + 1; });
    l.items = l.items.filter(i => !i.hecho);
    let gasto = '';
    if (document.getElementById('compra-a-finanzas')?.checked) {
        const importe = Number(String(document.getElementById('compra-importe')?.value || '').replace(',', '.'));
        if (importe > 0) {
            const cat = financePro.categories.find(c => c.type === 'expense' && /comida/i.test(c.name));
            financePro.transactions.push({ id: 'ptx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), date: todayISO(), account: document.getElementById('compra-cuenta')?.value || 'bancos', type: 'expense', amount: Math.round(importe * 100) / 100, category: cat?.id, note: `Compra${l.nombre && l.nombre.toLowerCase() !== 'casa' ? ` (${l.nombre})` : ''}`, manual: true });
            gasto = ` y ${financeMoney(importe)} en finanzas`;
        }
    }
    closeModal();
    render();
    await guardarCompra();
    showToast(`Compra terminada${gasto}.`);
}
