// ============================================================
//  COMPRAS (vista 'compra', apartado opcional de la rama #home)
//  Listas de la compra ordenadas por secciones del súper (como se recorre
//  la tienda), con lo que ya está en el carro abajo y tachado, lo que más
//  compras a un toque y un total estimado. Al terminar, la compra pasa al
//  historial y, si se quiere, el gasto a Finanzas.
//  El ticket (foto a Claude o ChatGPT con el conector, op 'ticket') se une
//  a la compra de ese día: cada línea con su precio y su tienda, lo que
//  estaba en la lista y lo que se añadió en la tienda. Del historial
//  sale la base de precios: el último de cada producto en cada tienda,
//  dónde sale más barato, qué ha subido y el estimado de la próxima lista.
//  Datos: `listaCompra` (sincronizado) = { listas: [{ id, nombre, items:
//  [{ id, texto, cantidad, precio, hecho }] }], actual, frecuentes: {
//  'texto en minúscula': veces }, historial: [{ id, fecha, tienda,
//  listaId, total, fuente: 'manual'|'ticket', items: [{ texto, clave,
//  deLista, cantidad, precio, importe, planeado, seccion }], sinComprar,
//  txId }], aprendido: { clave: seccion } }.
// ============================================================
const COMPRA_SECCIONES = [
    // Antes que frutas y verduras: «patatas de jamón» son patatas fritas.
    ['aperitivo', 'aperitivos y dulces.', /\b(patatas? (?:fritas|de bolsa|de jamon|jamon|serrano|sabor|onduladas|campesinas|lisas|al punto de sal|chips)|chips|nachos|doritos|snack|ganchito|palomita|maiz frito|frutos secos|cacahuet|pipas|pistacho|anacardo|chicle|caramelo|golosina|gominola|regaliz|chocolatina|bombon|tortitas? (?:de maiz|de arroz|campestre)|aceitunas?|encurtido|pepinillo|banderilla)/],
    ['fruta', 'frutas y verduras.', /\b(manzan|platan|naranj|mandarin|limon|lima\b|pera\b|peras\b|uvas?\b|fres|kiwi|melon|sandi|pina\b|mango|aguacate|tomate(?! frito)|lechug|cebolla|ajo\b|ajos\b|patata|zanahori|pimiento|calabac|calabaza|berenjen|pepino|brocoli|coliflor|espinac|acelga|champin|seta|fruta|verdura|ensalad|canonigo|rucula|perejil|cilantro|albahaca|puerro|apio|judias? verdes?|alcachof|esparrago|boniato|melocoton|nectarina|cereza|arandano|frambuesa)/],
    ['fresco', 'carne y pescado.', /\b(pollo|pavo|ternera|cerdo|solomillo|lomo|costilla|secreto|presa|pluma|chuleta|entrecot|cordero|conejo|pechuga|muslo|alitas?|carne|filete|hamburgues|albondiga|salchich|chorizo|jamon|fuet|salchichon|mortadela|bacon|beicon|panceta|pescado|salmon|merluza|bacalao|dorada|lubina|sardina|boqueron|gamba|langostino|calamar|sepia|pulpo|mejill|almeja)/],
    ['lacteo', 'lácteos y huevos.', /\b(leche(?! de avena| de soja| de almendra)|yogur|queso|roquefort|mozzarella|mantequilla|margarina|nata|huevo|kefir|batido|natillas|flan|cuajada|requeson)/],
    ['pan', 'panadería.', /\b(pan\b|panes|barra|baguette|bocadillo|chapata|hogaza|bollo|bolleria|croissant|cruasan|magdalen|napolitana|donut|tostad|biscote|bizcocho|galleta|picos\b|rosquilla)/],
    ['despensa', 'pasta, arroz y conservas.', /\b(arroz|pasta|macarr|espagu|tallarin|fideo|lenteja|garbanzo|alubia|judion|harina|azucar|sal\b|aceite|vinagre|atun|sardinas en lata|conserva|tomate frito|tomate triturado|salsa|ketchup|mayonesa|mostaza|especia|pimienta|pimenton|oregano|caldo|pastilla de caldo|sopa|pure|cafe|te\b|infusion|manzanilla|cacao|cereal|avena|muesli|miel|mermelada|chocolate|crema de cacao|levadura|pan rallado|maiz dulce)/],
    ['congelado', 'congelados.', /\b(congelad|helado|pizza|nugget|croqueta|empanadilla|guisantes|varitas|lasana)/],
    ['bebida', 'bebidas.', /\b(agua|refresco|coca.?cola|fanta|aquarius|zumo|nectar|cerveza|vino|cava|sidra|bebida|tonica|gaseosa|leche de (?:avena|soja|almendra)|bebida vegetal|isotonica|energetica)/],
    ['limpieza', 'limpieza y hogar.', /\b(detergente|suavizante|lejia|friegasuelos|lavavajillas|fregona|mopa|bayeta|estropajo|papel de cocina|papel higienico|servilleta|bolsas? de basura|basura|limpia|limpiador|quitagrasas|ambientador|insecticida|pilas?\b|bombilla|papel de aluminio|film|vela)/],
    ['higiene', 'higiene.', /\b(champu|acondicionador|gel\b|jabon|pasta de dientes|dentifrico|cepillo|desodorante|compresa|tampon|crema|cuchilla|maquinilla|algodon|bastoncillo|colonia|toallitas|panal|protector solar|enjuague)/],
];
const COMPRA_SECCION_NOMBRE = Object.fromEntries([...COMPRA_SECCIONES.map(([k, t]) => [k, t]), ['otros', 'otros.']]);

let compraPestana = 'lista';

function datosCompra() {
    if (!listaCompra || typeof listaCompra !== 'object') listaCompra = { listas: [], frecuentes: {} };
    if (!Array.isArray(listaCompra.listas)) listaCompra.listas = [];
    if (!listaCompra.frecuentes || typeof listaCompra.frecuentes !== 'object') listaCompra.frecuentes = {};
    if (!Array.isArray(listaCompra.historial)) listaCompra.historial = [];
    if (!listaCompra.aprendido || typeof listaCompra.aprendido !== 'object') listaCompra.aprendido = {};
    if (!Array.isArray(listaCompra.recetas)) listaCompra.recetas = [];
    if (!listaCompra.listas.length) listaCompra.listas.push({ id: 'lista_' + Date.now(), nombre: 'Casa', items: [] });
    listaCompra.listas.forEach(l => { if (!Array.isArray(l.items)) l.items = []; });
    if (!listaCompra.listas.some(l => l.id === listaCompra.actual)) listaCompra.actual = listaCompra.listas[0].id;
    return listaCompra;
}

function compraListaActual() {
    const d = datosCompra();
    return d.listas.find(l => l.id === d.actual);
}

// Clave para reconocer el mismo producto escrito de otra forma: sin
// tildes, en minúscula, sin cantidades delante y en singular aproximado.
function compraClave(texto) {
    return stripAccents(String(texto || '').toLowerCase())
        .replace(/^\s*\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|uds?|paquetes?|botes?|latas?|docenas?|x)?\s+/, '')
        .replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim()
        .split(' ').map(p => p.length > 4 ? p.replace(/(?:es|s)$/, '') : p).join(' ');
}

function compraSeccion(texto) {
    const d = datosCompra();
    const k = compraClave(texto);
    if (d.aprendido[k]) return d.aprendido[k];
    const t = stripAccents(String(texto || '').toLowerCase());
    // «Caldo de pollo» o «sopa de pescado» son despensa aunque nombren carne.
    if (/\b(caldo|sopa|cubito|pastilla de caldo|crema de verduras)\b/.test(t)) return 'despensa';
    return (COMPRA_SECCIONES.find(([, , re]) => re.test(t)) || ['otros'])[0];
}

// Palabras que cuentan para emparejar «Patatas de jamón» con «PATATAS
// SERRANO» o «Nata» con «NATA PARA COCINAR».
const COMPRA_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'sin', 'para', 'y', 'en', 'al', 'a', 'pack', 'bandeja', 'bolsa', 'hacendado', 'unidad']);
function compraPalabras(texto) {
    return compraClave(texto).split(' ').filter(p => p.length > 2 && !COMPRA_VACIAS.has(p));
}
function compraParecido(a, b) {
    const pa = compraPalabras(a), pb = new Set(compraPalabras(b));
    if (!pa.length || !pb.size) return 0;
    const comunes = pa.filter(p => pb.has(p)).length;
    return comunes / Math.min(pa.length, pb.size);
}

// ---- base de precios (sale del historial) ----
// Primero el mismo producto; si no, uno que lleve todas sus palabras
// («Chicle» → «chicle hierbabuena»).
function compraPrecios(texto) {
    const k = compraClave(texto);
    if (!k) return [];
    const buscar = coincide => datosCompra().historial.flatMap(c => (c.items || [])
        .filter(i => Number(i.precio) > 0 && coincide(i))
        .map(i => ({ fecha: c.fecha, tienda: c.tienda || '', precio: Number(i.precio) })))
        .sort((a, b) => b.fecha.localeCompare(a.fecha));
    const exactos = buscar(i => i.clave === k || (i.deLista && compraClave(i.deLista) === k));
    return exactos.length ? exactos : buscar(i => compraParecido(texto, i.texto) >= 1 && compraPalabras(texto).length >= 1);
}

function compraPrecioEstimado(texto, tienda) {
    const ps = compraPrecios(texto);
    if (!ps.length) return null;
    const enTienda = tienda ? ps.find(p => compraClave(p.tienda) === compraClave(tienda)) : null;
    return enTienda || ps[0];
}

function compraPrecioItem(it, tienda) {
    if (Number(it.precio) > 0) return { precio: Number(it.precio), estimado: false };
    const e = compraPrecioEstimado(it.texto, tienda);
    return e ? { precio: e.precio, estimado: true, tienda: e.tienda } : null;
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

function compraImporte(items, tienda) {
    return items.reduce((s, it) => { const p = compraPrecioItem(it, tienda); return s + (p ? p.precio * compraUnidades(it) : 0); }, 0);
}

function compraTiendaDeLista(l) {
    return l && l.nombre && compraClave(l.nombre) !== 'casa' ? l.nombre : '';
}

function renderCompra() {
    const d = datosCompra();
    const pestanas = `<div class="profe-pestanas compra-pestanas">${[['lista', 'lista.'], ['historial', `historial.${d.historial.length ? ` <small>${d.historial.length}</small>` : ''}`], ['recetas', `recetas.${d.recetas.length ? ` <small>${d.recetas.length}</small>` : ''}`]].map(([k, t]) => `<button class="profe-chip ${compraPestana === k ? 'activa' : ''}" onclick="compraPestana='${k}';render()">${t}</button>`).join('')}</div>`;
    if (compraPestana === 'recetas') return `<div class="compra">${renderCompraCabecera(`${d.recetas.length} ${d.recetas.length === 1 ? 'receta' : 'recetas'}.`)}${pestanas}${renderCompraRecetas()}</div>`;
    if (compraPestana === 'historial') return `<div class="compra">${renderCompraCabecera(`${d.historial.length} ${d.historial.length === 1 ? 'compra guardada' : 'compras guardadas'}.`)}${pestanas}${renderCompraHistorial()}</div>`;
    const l = compraListaActual();
    const tienda = compraTiendaDeLista(l);
    const pendientes = l.items.filter(i => !i.hecho);
    const carro = l.items.filter(i => i.hecho);
    const grupos = [...COMPRA_SECCIONES.map(([k, t]) => [k, t]), ['otros', 'otros.']]
        .map(([k, t]) => [t, pendientes.filter(i => compraSeccion(i.texto) === k)]).filter(([, xs]) => xs.length);
    const estimado = compraImporte(l.items, tienda);
    const conEstimado = l.items.some(i => !(Number(i.precio) > 0) && compraPrecioItem(i, tienda));
    const fila = it => {
        const p = compraPrecioItem(it, tienda);
        return `<div class="compra-item ${it.hecho ? 'hecho' : ''}">
        <button class="compra-check ${it.hecho ? 'on' : ''}" onclick="compraMarcar('${it.id}')" aria-label="${it.hecho ? 'Sacar del carro' : 'Al carro'}"></button>
        <button class="compra-item-txt" onclick="openCompraItem('${it.id}')"><b>${escapeHtml(it.texto)}</b>${it.cantidad ? `<span>${escapeHtml(it.cantidad)}</span>` : ''}${(it.recetas || []).length ? `<em>para ${escapeHtml(it.recetas.join(', ').toLowerCase())}</em>` : ''}</button>
        ${p ? `<i class="${p.estimado ? 'estimado' : ''}" title="${p.estimado ? `Lo que pagaste la última vez${p.tienda ? ' en ' + escapeHtml(p.tienda) : ''}` : ''}">${p.estimado ? '≈ ' : ''}${financeMoney(p.precio * compraUnidades(it))}</i>` : ''}
    </div>`;
    };
    return `
    <div class="compra">
        ${renderCompraCabecera(`${pendientes.length ? `${pendientes.length} por coger${carro.length ? `, ${carro.length} en el carro` : ''}.` : carro.length ? 'Todo en el carro.' : 'La lista está vacía.'}${estimado ? ` ${conEstimado ? 'Unos' : ''} ${financeMoney(estimado)}.` : ''}`, true, carro.length)}
        ${pestanas}
        ${d.listas.length > 1 ? `<div class="compra-listas">${d.listas.map(x => `<button class="profe-chip ${x.id === l.id ? 'activa' : ''}" onclick="compraElegirLista('${x.id}')">${escapeHtml(x.nombre.toLowerCase())}. <small>${x.items.filter(i => !i.hecho).length}</small></button>`).join('')}</div>` : ''}
        <div class="compra-anadir">
            <input id="compra-nuevo" class="modal-input" placeholder="Añadir: 2 leche, pan, tomates 1,20 €..." onkeydown="if(event.key==='Enter'){event.preventDefault();compraAnadir(this.value)}" autocomplete="off">
            <button class="btn-modal-primary" onclick="compraAnadir(document.getElementById('compra-nuevo').value)">añadir.</button>
        </div>
        ${!l.items.length ? `<div class="compra-vacio"><b>apunta lo que falta.</b>Escríbelo tal como te venga a la cabeza: se ordena por secciones, en el orden en que se recorre el súper. Lo que compras a menudo está arriba, en «lo de siempre». Cuando pases tus tickets, junto a cada cosa verás lo que te costó la última vez.</div>` : ''}
        ${grupos.map(([t, xs]) => `<div class="compra-seccion"><div class="compra-seccion-titulo">${t}</div>${xs.map(fila).join('')}</div>`).join('')}
        ${carro.length ? `<div class="compra-seccion compra-carro"><div class="compra-seccion-titulo">en el carro.${compraImporte(carro, tienda) ? ` <span>${financeMoney(compraImporte(carro, tienda))}</span>` : ''}</div>${carro.map(fila).join('')}
            <button class="btn-modal-primary compra-terminar" onclick="openCompraTerminar()">terminar la compra.</button></div>` : ''}
        ${conEstimado ? '<div class="compra-nota">≈ lo que pagaste la última vez, según tus tickets.</div>' : ''}
    </div>`;
}

// Con algo en el carro, «terminar la compra» también arriba: abajo queda
// después de todo lo pendiente y con la lista a medias no se veía.
function renderCompraCabecera(sub, conListas, enCarro) {
    return `<div class="compra-cab">
        <div>
            <div class="compra-titulo">despensa.</div>
            <div class="compra-sub">${sub}</div>
        </div>
        ${conListas ? `<div class="compra-cab-botones">${enCarro ? `<button class="btn-modal-primary compra-terminar-arriba" onclick="openCompraTerminar()">terminar la compra. <small>${enCarro}</small></button>` : ''}${Object.keys(datosCompra().frecuentes).length ? '<button class="pedido-btn" onclick="openCompraFrecuentes()">lo de siempre.</button>' : ''}<button class="pedido-btn" onclick="openCompraListas()">listas.</button></div>` : ''}
    </div>`;
}

// «Lo de siempre»: lo que más veces has comprado (cuenta cada compra
// terminada y cada ticket), para añadirlo a la lista sin escribirlo. Se
// puede quitar lo que ya no compras; si lo vuelves a comprar, vuelve.
function openCompraFrecuentes() {
    const d = datosCompra();
    const enLista = new Set(compraListaActual().items.filter(i => !i.hecho).map(i => i.texto.toLowerCase()));
    const filas = Object.entries(d.frecuentes).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 60);
    showModal(`
        <div class="modal-title">lo de siempre.</div>
        <p class="finance-modal-note" style="margin-top:0">Lo que más veces has comprado. Añádelo a la lista con un toque o quita lo que ya no compras.</p>
        <div class="compra-frec-lista">${filas.map(([t, n]) => {
            const ya = enLista.has(t);
            const arg = escapeHtml(t).replace(/'/g, '&#39;');
            return `<div class="compra-frec-fila">
                <span><b>${escapeHtml(t.charAt(0).toUpperCase() + t.slice(1))}</b><small>${n} ${n === 1 ? 'vez' : 'veces'}</small></span>
                ${ya ? '<em>en la lista.</em>' : `<button class="profe-chip" onclick="compraFrecuenteAnadir('${arg}')">+ añadir.</button>`}
                <button class="profe-chip compra-frec-quitar" onclick="compraFrecuenteQuitar('${arg}')" aria-label="Quitar de lo de siempre">quitar.</button>
            </div>`;
        }).join('') || '<div class="finance-empty-line">Todavía nada: se llena al terminar compras o con los tickets.</div>'}</div>
    `);
}

function compraFrecuenteAnadir(texto) {
    compraAnadir(texto, true);
    openCompraFrecuentes();
}

function compraFrecuenteQuitar(texto) {
    delete datosCompra().frecuentes[texto];
    openCompraFrecuentes();
    render();
    guardarCompra();
}

// ---- historial ----
// Lo planeado frente a lo que se coló, solo con las compras que tienen
// ticket (sin él no se sabe qué hubo fuera de la lista).
function compraResumenCenido(dias = 60) {
    const desde = isoLocal(new Date(Date.now() - dias * 864e5));
    const conTicket = datosCompra().historial.filter(c => c.fuente === 'ticket' && c.fecha >= desde);
    let total = 0, planeado = 0, extra = 0;
    const extras = {};
    conTicket.forEach(c => (c.items || []).forEach(i => {
        const imp = Number(i.importe) || 0;
        total += imp;
        if (i.planeado) planeado += imp;
        else { extra += imp; const k = i.clave || compraClave(i.texto); extras[k] = extras[k] || { texto: i.texto, veces: 0, importe: 0 }; extras[k].veces++; extras[k].importe += imp; }
    }));
    const sinComprar = conTicket.reduce((s, c) => s + (c.sinComprar || []).length, 0);
    const deLista = conTicket.reduce((s, c) => s + (c.items || []).filter(i => i.planeado).length, 0);
    return { compras: conTicket.length, total, planeado, extra, extras: Object.values(extras).sort((a, b) => b.veces - a.veces || b.importe - a.importe), sinComprar, deLista };
}

// ---- la base de datos personal (sale del historial) ----
// Cada producto atado a su tienda: su último precio y, si hay más de una
// referencia, cuánto ha variado desde la primera.
function compraProductos() {
    const mapa = {};
    datosCompra().historial.forEach(c => (c.items || []).forEach(i => {
        if (!(Number(i.precio) > 0)) return;
        const clave = i.clave || compraClave(i.texto);
        const tienda = c.tienda || '';
        const k = `${clave}|${compraClave(tienda)}`;
        const p = mapa[k] = mapa[k] || { clave, texto: i.texto, tienda, precios: [] };
        p.precios.push({ fecha: c.fecha, precio: Number(i.precio), texto: i.texto });
    }));
    return Object.values(mapa).map(p => {
        p.precios.sort((a, b) => a.fecha.localeCompare(b.fecha));
        const ultimo = p.precios[p.precios.length - 1], primero = p.precios[0], previo = p.precios[p.precios.length - 2];
        p.texto = ultimo.texto;
        p.actual = ultimo.precio;
        p.fecha = ultimo.fecha;
        p.variacion = p.precios.length > 1 && primero.precio ? Math.round((ultimo.precio - primero.precio) / primero.precio * 100) : null;
        p.ultimaSubida = previo && previo.precio ? (ultimo.precio - previo.precio) / previo.precio : 0;
        return p;
    });
}

// La cesta habitual: lo que más veces aparece en tus compras (al menos dos
// si hay bastante historial) y lo que te cuesta en cada tienda con el
// último precio de allí. Si dos tiendas comparten productos, cuánto cambia
// en esos.
function compraCestaHabitual() {
    const veces = {};
    datosCompra().historial.forEach(c => new Set((c.items || []).map(i => i.clave || compraClave(i.texto))).forEach(k => { veces[k] = (veces[k] || 0) + 1; }));
    const ordenadas = Object.entries(veces).sort((a, b) => b[1] - a[1]);
    const repetidas = ordenadas.filter(([, n]) => n > 1);
    const cesta = (repetidas.length >= 3 ? repetidas : ordenadas).slice(0, 12).map(([k]) => k);
    if (!cesta.length) return null;
    const productos = compraProductos();
    const porTienda = {};
    productos.filter(p => cesta.includes(p.clave)).forEach(p => {
        const t = porTienda[p.tienda || '—'] = porTienda[p.tienda || '—'] || { tienda: p.tienda || 'sin tienda', total: 0, precios: {} };
        t.total += p.actual;
        t.precios[p.clave] = p.actual;
    });
    const tiendas = Object.values(porTienda).map(t => ({ ...t, n: Object.keys(t.precios).length }))
        .filter(t => t.n).sort((a, b) => b.n - a.n || a.total - b.total).slice(0, 3);
    let comparacion = null;
    if (tiendas.length > 1) {
        const [a, b] = tiendas;
        const comunes = Object.keys(a.precios).filter(k => k in b.precios);
        if (comunes.length >= 2) {
            const ta = comunes.reduce((s, k) => s + a.precios[k], 0), tb = comunes.reduce((s, k) => s + b.precios[k], 0);
            if (Math.abs(ta - tb) >= 0.1) comparacion = { barata: ta < tb ? a.tienda : b.tienda, diferencia: Math.abs(ta - tb), comunes: comunes.length };
        }
    }
    return { tamano: cesta.length, tiendas, comparacion };
}

function compraAvisoPrecios() {
    return compraProductos().filter(p => p.ultimaSubida >= 0.1).sort((a, b) => b.ultimaSubida - a.ultimaSubida);
}

function compraEsteMes() {
    const hoy = todayISO().slice(0, 7);
    const delMes = datosCompra().historial.filter(c => String(c.fecha).slice(0, 7) === hoy);
    const total = delMes.reduce((s, c) => s + (Number(c.total) || 0), 0);
    return { compras: delMes.length, total, media: delMes.length ? total / delMes.length : 0 };
}

function renderCompraHistorial() {
    const d = datosCompra();
    if (!d.historial.length) return `<div class="compra-vacio"><b>aquí se guardan tus compras.</b>Cada compra se guarda al pulsar «terminar la compra». Si además le pasas la foto del ticket a Claude o ChatGPT con el conector («apunta este ticket en Bitácora»), cada producto queda con su precio y su tienda, y con el tiempo verás dónde te sale más barato lo que sueles comprar.</div>`;
    const r = compraResumenCenido();
    const pct = r.total ? Math.round(r.planeado / r.total * 100) : 0;
    const mes = compraEsteMes();
    const cesta = compraCestaHabitual();
    const avisos = compraAvisoPrecios();
    const nProductos = compraProductos().length;
    const fecha = iso => new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
    const nombreMes = new Date().toLocaleDateString('es-ES', { month: 'long' });
    const aviso = avisos[0];
    return `
        <div class="compra-franja">
            <div class="compra-dato">
                <span class="compra-dato-etq">${nombreMes}.</span>
                <b>${financeMoney(mes.total)}</b>
                <small>${mes.compras ? `${mes.compras} ${mes.compras === 1 ? 'compra' : 'compras'} · unos ${financeMoney(mes.media)} cada una` : 'sin compras este mes'}</small>
            </div>
            <div class="compra-dato">
                <span class="compra-dato-etq">tu cesta habitual.</span>
                ${cesta && cesta.tiendas.length ? `<div class="compra-cesta">${cesta.tiendas.map(t => `<div><span>${escapeHtml(t.tienda)}</span><b>${financeMoney(t.total)}</b>${t.n < cesta.tamano ? `<small>${t.n} de ${cesta.tamano}</small>` : ''}</div>`).join('')}</div>
                <small>${cesta.comparacion ? `En los ${cesta.comparacion.comunes} productos que tienen las dos, ${escapeHtml(cesta.comparacion.barata)} sale ${financeMoney(cesta.comparacion.diferencia)} más barata.` : `Lo que más compras (${cesta.tamano} ${cesta.tamano === 1 ? 'producto' : 'productos'}), con lo último que pagaste.`}</small>` : '<small>Aparecerá cuando tengas tickets con precios.</small>'}
            </div>
            ${aviso ? `<div class="compra-dato compra-dato-aviso">
                <span class="compra-dato-etq">ha subido.</span>
                <b>${escapeHtml(aviso.texto)}</b>
                <small>+${Math.round(aviso.ultimaSubida * 100)} % en ${escapeHtml(aviso.tienda || 'su tienda')}: ${financeMoney(aviso.precios[aviso.precios.length - 2].precio)} → ${financeMoney(aviso.actual)}${avisos.length > 1 ? ` · y ${avisos.length - 1} más` : ''}</small>
            </div>` : ''}
        </div>
        <div class="compra-franja-pie">
            ${r.compras ? `<span>En los últimos 60 días, el <b>${pct} %</b> de lo gastado estaba en tu lista.</span>` : '<span></span>'}
            ${nProductos ? `<button class="pedido-btn" onclick="openCompraProductos()">tus productos. <small>${nProductos}</small></button>` : ''}
        </div>
        <div class="compra-seccion-titulo compra-historial-titulo">compras.</div>
        ${[...d.historial].sort((a, b) => b.fecha.localeCompare(a.fecha)).map(c => {
            const plan = (c.items || []).filter(i => i.planeado);
            const extras = (c.items || []).filter(i => !i.planeado);
            return `<button class="compra-hist-fila" onclick="openCompraHistorial('${c.id}')">
                <span class="compra-hist-fecha">${fecha(c.fecha)}</span>
                <span class="compra-hist-cuerpo"><b>${escapeHtml(c.tienda || 'sin tienda')}</b><small>${(c.items || []).length} productos${c.fuente === 'ticket' ? ` · ${plan.length} de la lista${extras.length ? `, ${extras.length} ${extras.length === 1 ? 'añadido' : 'añadidos'} en la tienda` : ''}` : ' · sin ticket'}</small></span>
                <span class="compra-hist-total">${c.total ? financeMoney(c.total) : '—'}</span>
            </button>`;
        }).join('')}`;
}

// ---- «tus productos.»: todo lo que Bitácora ha ido recogiendo ----
let compraProdBusca = '', compraProdOrden = 'nombre', compraProdTienda = '';

function openCompraProductos() {
    const tiendas = [...new Set(compraProductos().map(p => p.tienda).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    showModal(`
        <div class="modal-title">tus productos.</div>
        <p class="finance-modal-note" style="margin-top:0">Todo lo que ha salido en tus tickets, cada uno con su tienda y lo último que pagaste. Entre paréntesis, cuánto ha cambiado desde la primera vez.</p>
        <input id="compra-prod-busca" class="modal-input" placeholder="Buscar un producto..." value="${escapeHtml(compraProdBusca)}" oninput="compraProdBusca=this.value;pintarCompraProductos()" autocomplete="off">
        <div class="compra-prod-filtros">
            <select class="modal-input" onchange="compraProdOrden=this.value;pintarCompraProductos()">${[['nombre', 'por nombre'], ['barato', 'más baratos primero'], ['caro', 'más caros primero'], ['tienda', 'por tienda'], ['cambio', 'lo que más ha cambiado']].map(([k, t]) => `<option value="${k}" ${k === compraProdOrden ? 'selected' : ''}>${t}</option>`).join('')}</select>
            <select class="modal-input" onchange="compraProdTienda=this.value;pintarCompraProductos()"><option value="">todas las tiendas</option>${tiendas.map(t => `<option value="${escapeHtml(t)}" ${t === compraProdTienda ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select>
        </div>
        <div id="compra-prod-lista" class="compra-prod-lista"></div>
    `);
    pintarCompraProductos();
}

function pintarCompraProductos() {
    const caja = document.getElementById('compra-prod-lista');
    if (!caja) return;
    const q = compraClave(compraProdBusca);
    let ps = compraProductos().filter(p => (!q || compraClave(p.texto).includes(q) || p.clave.includes(q)) && (!compraProdTienda || p.tienda === compraProdTienda));
    const porNombre = (a, b) => a.texto.localeCompare(b.texto) || a.actual - b.actual;
    ps.sort(compraProdOrden === 'barato' ? (a, b) => a.actual - b.actual
        : compraProdOrden === 'caro' ? (a, b) => b.actual - a.actual
        : compraProdOrden === 'tienda' ? (a, b) => (a.tienda || '').localeCompare(b.tienda || '') || porNombre(a, b)
        : compraProdOrden === 'cambio' ? (a, b) => Math.abs(b.variacion || 0) - Math.abs(a.variacion || 0) || porNombre(a, b)
        : porNombre);
    caja.innerHTML = ps.map(p => `<div class="compra-prod-fila">
        <span><b>${escapeHtml(p.texto)}</b><small>${escapeHtml(p.tienda || 'sin tienda')} · ${new Date(p.fecha + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}${p.precios.length > 1 ? ` · ${p.precios.length} veces` : ''}</small></span>
        <i>${financeMoney(p.actual)}${p.variacion ? ` <em class="${p.variacion > 0 ? 'sube' : 'baja'}">(${p.variacion > 0 ? '+' : ''}${p.variacion} %)</em>` : ''}</i>
    </div>`).join('') || '<div class="finance-empty-line">Nada con ese nombre.</div>';
}

function openCompraHistorial(id) {
    const c = datosCompra().historial.find(x => x.id === id);
    if (!c) return;
    const plan = (c.items || []).filter(i => i.planeado);
    const extras = (c.items || []).filter(i => !i.planeado);
    const linea = i => `<div class="compra-hist-linea"><span><b>${escapeHtml(i.texto)}</b>${i.deLista && compraClave(i.deLista) !== i.clave ? `<small>en la lista: ${escapeHtml(i.deLista)}</small>` : ''}</span><i>${Number(i.importe) > 0 ? financeMoney(Number(i.importe)) : ''}</i></div>`;
    const suma = xs => xs.reduce((s, i) => s + (Number(i.importe) || 0), 0);
    showModal(`
        <div class="modal-title">${escapeHtml(c.tienda || 'compra')}.</div>
        <p class="finance-modal-note" style="margin-top:0">${new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} · ${c.total ? financeMoney(c.total) : 'sin importe'}${c.fuente === 'ticket' ? ' · con ticket' : ' · sin ticket todavía'}</p>
        ${c.fuente === 'ticket' ? `
            <div class="compra-seccion-titulo">de tu lista. <span>${financeMoney(suma(plan))}</span></div>${plan.map(linea).join('') || '<div class="compra-hist-vacio">nada.</div>'}
            ${extras.length ? `<div class="compra-seccion-titulo" style="margin-top:16px">añadido en la tienda. <span>${financeMoney(suma(extras))}</span></div>${extras.map(linea).join('')}` : ''}
            ${(c.sinComprar || []).length ? `<div class="compra-seccion-titulo" style="margin-top:16px">de la lista, sin comprar.</div>${c.sinComprar.map(t => `<div class="compra-hist-linea"><span>${escapeHtml(t)}</span></div>`).join('')}` : ''}`
            : `${(c.items || []).map(linea).join('')}<p class="finance-modal-note">Pásale la foto del ticket a Claude o ChatGPT con el conector y se unirá a esta compra con sus precios.</p>`}
        <button class="btn-secondary" style="margin-top:16px;color:#dc2626" onclick="borrarCompraHistorial('${c.id}')">quitar del historial.</button>
    `);
}

function borrarCompraHistorial(id) {
    const d = datosCompra();
    if (!confirm('¿Quitar esta compra del historial? Sus precios dejarán de contar.')) return;
    d.historial = d.historial.filter(x => x.id !== id);
    closeModal();
    render();
    guardarCompra();
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
        l.items.push({ id: 'cmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), texto: it.texto, cantidad: it.cantidad, precio: it.precio ?? null, hecho: false });
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
    const seccion = compraSeccion(it.texto);
    const precios = compraPrecios(it.texto).slice(0, 6);
    showModal(`
        <div class="modal-title">${escapeHtml(it.texto)}</div>
        <div class="modal-label">qué</div>
        <input id="compra-it-texto" class="modal-input" value="${escapeHtml(it.texto)}">
        <div class="lab-horas">
            <div><div class="modal-label">cantidad</div><input id="compra-it-cant" class="modal-input" value="${escapeHtml(it.cantidad || '')}" placeholder="2, 1 kg, 3 latas..."></div>
            <div><div class="modal-label">precio por unidad</div><input id="compra-it-precio" class="modal-input" inputmode="decimal" value="${it.precio ? String(it.precio).replace('.', ',') : ''}" placeholder="${precios[0] ? String(precios[0].precio).replace('.', ',') : '1,20'}"></div>
        </div>
        <div class="modal-label">sección</div>
        <select id="compra-it-seccion" class="modal-input">${Object.entries(COMPRA_SECCION_NOMBRE).map(([k, t]) => `<option value="${k}" ${k === seccion ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <div class="finance-modal-note" style="margin-top:4px">Si la cambias, Bitácora lo recuerda para la próxima vez.</div>
        ${precios.length ? `<div class="modal-label" style="margin-top:12px">lo que te ha costado.</div>${precios.map(p => `<div class="compra-hist-linea"><span>${new Date(p.fecha + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}${p.tienda ? ` · ${escapeHtml(p.tienda)}` : ''}</span><i>${financeMoney(p.precio)}</i></div>`).join('')}` : ''}
        <button class="btn-modal-primary" style="margin-top:14px" onclick="guardarCompraItem('${id}')">guardar.</button>
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
    const seccion = document.getElementById('compra-it-seccion')?.value;
    if (seccion && seccion !== compraSeccion(it.texto)) datosCompra().aprendido[compraClave(it.texto)] = seccion;
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
        <p class="finance-modal-note" style="margin-top:0">Una por sitio o por súper: casa, el piso, Mercadona, Lidl... Si se llama como la tienda, los tickets de esa tienda se emparejan con ella y los precios estimados son los de allí.</p>
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

function compraTiendasConocidas() {
    const d = datosCompra();
    return [...new Set([...d.historial.map(c => c.tienda), ...d.listas.map(compraTiendaDeLista)].filter(Boolean))];
}

// Al terminar: lo del carro sale de la lista, cuenta para "lo de
// siempre", se guarda en el historial (con su tienda, para unirle luego el
// ticket) y, si se quiere, se apunta el gasto en Finanzas.
function openCompraTerminar() {
    const l = compraListaActual();
    const carro = l.items.filter(i => i.hecho);
    const tienda = compraTiendaDeLista(l) || datosCompra().historial.slice(-1)[0]?.tienda || '';
    const importe = compraImporte(carro, tienda);
    const cuentas = typeof FINANCE_PRO_ACCOUNT_KEYS !== 'undefined' ? FINANCE_PRO_ACCOUNT_KEYS : [];
    showModal(`
        <div class="modal-title">terminar la compra.</div>
        <p class="finance-modal-note" style="margin-top:0">${carro.length} ${carro.length === 1 ? 'producto sale' : 'productos salen'} de la lista y se guardan en el historial. Lo que quede sin coger se queda para la próxima.</p>
        <div class="modal-label">tienda</div>
        <input id="compra-tienda" class="modal-input" list="compra-tiendas" value="${escapeHtml(tienda)}" placeholder="Mercadona, Lidl, el mercado...">
        <datalist id="compra-tiendas">${compraTiendasConocidas().map(t => `<option value="${escapeHtml(t)}">`).join('')}</datalist>
        <label class="finance-tx-marca"><input type="checkbox" id="compra-a-finanzas" onchange="document.getElementById('compra-gasto').hidden=!this.checked"><span><b>apuntar también el gasto en finanzas.</b><small>Normalmente no hace falta: el cargo llega con el extracto del banco.</small></span></label>
        <div id="compra-gasto" hidden>
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
    const tienda = (document.getElementById('compra-tienda')?.value || '').trim();
    carro.forEach(i => { const k = i.texto.toLowerCase(); d.frecuentes[k] = (d.frecuentes[k] || 0) + 1; });
    l.items = l.items.filter(i => !i.hecho);
    let gasto = '', txId = null, total = 0;
    const importe = Number(String(document.getElementById('compra-importe')?.value || '').replace(',', '.'));
    if (document.getElementById('compra-a-finanzas')?.checked) {
        if (importe > 0) {
            total = Math.round(importe * 100) / 100;
            const cat = financePro.categories.find(c => c.type === 'expense' && /comida/i.test(c.name));
            txId = 'ptx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
            financePro.transactions.push({ id: txId, date: todayISO(), account: document.getElementById('compra-cuenta')?.value || 'bancos', type: 'expense', amount: total, category: cat?.id, note: `Compra${tienda ? ` (${tienda})` : l.nombre && l.nombre.toLowerCase() !== 'casa' ? ` (${l.nombre})` : ''}`, manual: true });
            gasto = ` y ${financeMoney(importe)} en finanzas`;
        }
    }
    if (carro.length) {
        d.historial.push({
            id: 'cmpr_' + Date.now(), fecha: todayISO(), tienda, listaId: l.id, fuente: 'manual', txId,
            total: total || (importe > 0 ? Math.round(importe * 100) / 100 : Math.round(compraImporte(carro, tienda) * 100) / 100),
            items: carro.map(i => { const p = compraPrecioItem(i, tienda); return { texto: i.texto, clave: compraClave(i.texto), deLista: i.texto, cantidad: i.cantidad || '', precio: p && !p.estimado ? p.precio : null, importe: p && !p.estimado ? Math.round(p.precio * compraUnidades(i) * 100) / 100 : null, planeado: true, seccion: compraSeccion(i.texto) }; }),
        });
    }
    closeModal();
    render();
    await guardarCompra();
    showToast(`Compra terminada${gasto}.`);
}

// ---- el ticket que llega por el conector (op 'ticket') ----
// Cada línea trae el producto, su precio y, si la IA la reconoce, el
// elemento de la lista al que corresponde. Lo que no estaba en la lista es
// un extra. Se une a la compra que ya se terminó a mano ese día (misma
// tienda o lista) para no duplicarla; lo comprado sale de las listas.
// Devuelve el resumen y lo necesario para deshacerlo.
function compraAplicarTicket(op, ref) {
    const d = datosCompra();
    const fechaOk = /^\d{4}-\d{2}-\d{2}$/.test(String(op.fecha || '')) ? op.fecha : todayISO();
    const tienda = String(op.tienda || '').trim();
    const kTienda = compraClave(tienda);
    const listaNombrada = op.lista ? d.listas.find(l => compraClave(l.nombre) === compraClave(op.lista)) : null;
    const listaTienda = kTienda ? d.listas.find(l => { const k = compraClave(l.nombre); return k && (k === kTienda || kTienda.includes(k) || k.includes(kTienda)); }) : null;
    const listaPrincipal = listaNombrada || listaTienda || null;
    const candidatas = listaPrincipal ? [listaPrincipal, ...d.listas.filter(l => l !== listaPrincipal)] : d.listas;
    const planeadaDicha = (Array.isArray(op.lista_planeada) ? op.lista_planeada : []).map(x => String(x || '').trim()).filter(Boolean);
    const usadas = new Set();
    const usadasDichas = new Set();
    const quitados = [];
    const lineas = (Array.isArray(op.lineas) ? op.lineas : []).filter(x => x && (x.producto || x.descripcion));
    const items = lineas.map(x => {
        const texto = String(x.producto || x.descripcion).trim();
        const nombreTexto = texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();
        const deListaIA = String(x.de_lista || '').trim();
        // 1) Lo que la IA dice; 2) parecido de palabras con la lista.
        let elegido = null;
        for (const l of candidatas) {
            for (const it of l.items) {
                if (usadas.has(it.id)) continue;
                const k = compraClave(it.texto);
                if ((deListaIA && (k === compraClave(deListaIA) || compraParecido(deListaIA, it.texto) >= 1)) || (!deListaIA && compraParecido(texto, it.texto) >= 1)) { elegido = { l, it }; break; }
            }
            if (elegido) break;
        }
        let deLista = '';
        if (elegido) { usadas.add(elegido.it.id); quitados.push({ listaId: elegido.l.id, item: { ...elegido.it } }); deLista = elegido.it.texto; }
        else {
            const dicha = planeadaDicha.find(p => !usadasDichas.has(p) && ((deListaIA && (compraClave(p) === compraClave(deListaIA) || compraParecido(deListaIA, p) >= 1)) || compraParecido(texto, p) >= 1));
            if (dicha) { usadasDichas.add(dicha); deLista = dicha; }
            else if (deListaIA) deLista = deListaIA;
        }
        const cantidad = Number(String(x.cantidad ?? 1).replace(',', '.')) || 1;
        const importe = Number(String(x.importe ?? '').replace(',', '.')) || (Number(String(x.precio_unidad ?? '').replace(',', '.')) * cantidad) || null;
        const precio = Number(String(x.precio_unidad ?? '').replace(',', '.')) || (importe ? Math.round(importe / cantidad * 100) / 100 : null);
        const seccion = COMPRA_SECCION_NOMBRE[x.seccion] ? x.seccion : compraSeccion(deLista || texto);
        return { texto: nombreTexto, clave: compraClave(texto), deLista, cantidad: x.cantidad != null ? String(x.cantidad) : '', precio, importe: importe ? Math.round(importe * 100) / 100 : null, planeado: !!deLista, seccion, linea: String(x.descripcion || '') };
    });
    if (!items.length) return null;
    const total = Number(String(op.total ?? '').replace(',', '.')) || Math.round(items.reduce((s, i) => s + (i.importe || 0), 0) * 100) / 100;
    // Lo de la lista que no salió en el ticket: lo de la lista de esa
    // tienda que sigue pendiente y lo que se dijo de palabra.
    const sinComprar = [
        ...(listaPrincipal ? listaPrincipal.items.filter(it => !usadas.has(it.id) && !it.hecho).map(it => it.texto) : []),
        ...planeadaDicha.filter(p => !usadasDichas.has(p)),
    ];

    // Aprende la sección de cada producto (la del ticket manda).
    const aprendidoAntes = { ...d.aprendido };
    items.forEach(i => { if (i.seccion && i.seccion !== 'otros') { d.aprendido[i.clave] = i.seccion; if (i.deLista) d.aprendido[compraClave(i.deLista)] = i.seccion; } });

    // ¿Ya había una compra de ese día (o del anterior) terminada a mano? Vale
    // si la tienda coincide o si una de las dos no la dice; gana la que
    // coincide. El ticket puede ser solo una parte (compra en varias
    // tiendas): lo suyo pasa a su propia compra y el resto se queda en la
    // terminada, esperando el siguiente ticket.
    const cerca = iso => Math.abs(new Date(iso + 'T12:00:00') - new Date(fechaOk + 'T12:00:00')) <= 864e5;
    const manuales = d.historial.filter(c => c.fuente === 'manual' && cerca(c.fecha));
    const previa = manuales.find(c => kTienda && compraClave(c.tienda) === kTienda)
        || manuales.find(c => listaPrincipal && c.listaId === listaPrincipal.id && (!c.tienda || !kTienda))
        || manuales.find(c => !c.tienda || !kTienda);
    const previaCopia = previa ? JSON.parse(JSON.stringify(previa)) : null;
    // Lo que se terminó a mano y sale en el ticket cuenta como de la lista.
    const cubiertos = new Set();
    if (previa) items.forEach(i => {
        const k = (previa.items || []).findIndex((p, n) => !cubiertos.has(n) && ((i.deLista && compraClave(i.deLista) === compraClave(p.deLista || p.texto)) || compraParecido(p.deLista || p.texto, i.texto) >= 1 || compraParecido(i.texto, p.deLista || p.texto) >= 1));
        if (k < 0) return;
        cubiertos.add(k);
        const p = previa.items[k];
        i.planeado = true;
        i.deLista = i.deLista || p.deLista || p.texto;
    });
    const resto = previa ? (previa.items || []).filter((p, n) => !cubiertos.has(n)) : [];
    const completa = previa && !resto.length;
    const entrada = completa ? previa : { id: `cmpr_${ref || Date.now()}` };
    Object.assign(entrada, { fecha: fechaOk, tienda: tienda || entrada.tienda || '', listaId: (listaPrincipal || compraListaActual()).id, fuente: 'ticket', total, items, sinComprar });
    if (!completa) d.historial.push(entrada);
    if (previa && !completa) {
        previa.items = resto;
        previa.total = Math.round(resto.reduce((s, p) => s + (Number(p.importe) || 0), 0) * 100) / 100 || null;
    }

    // Lo comprado sale de las listas y cuenta para «lo de siempre».
    quitados.forEach(q => {
        const l = d.listas.find(x => x.id === q.listaId);
        if (l) l.items = l.items.filter(x => x.id !== q.item.id);
        if (!previa) { const k = q.item.texto.toLowerCase(); d.frecuentes[k] = (d.frecuentes[k] || 0) + 1; }
    });

    // Finanzas solo si se pide expresamente (gasto: true): el gasto real ya
    // llega con el extracto del banco y el ticket es para Despensa. Si se
    // pide, cada ticket va con su gasto exacto y el estimado que se apuntó al
    // terminar a mano se corrige (ticket completo) o se le resta lo de este
    // ticket (parcial); si se queda en nada, se quita.
    let txCreado = null, txAntes = null, txQuitado = null;
    if (op.gasto === true && total > 0) {
        const tx = previa?.txId ? financePro.transactions.find(t => t.id === previa.txId) : null;
        if (tx && completa) { txAntes = { id: tx.id, amount: tx.amount }; tx.amount = total; }
        else {
            if (tx) {
                const queda = Math.round((tx.amount - total) * 100) / 100;
                if (queda >= 0.5) { txAntes = { id: tx.id, amount: tx.amount }; tx.amount = queda; }
                else { txQuitado = { ...tx }; financePro.transactions = financePro.transactions.filter(t => t.id !== tx.id); previa.txId = null; }
            }
            const cat = financePro.categories.find(c => c.type === 'expense' && /comida/i.test(c.name));
            const cuenta = tx?.account || (() => { const ultima = [...(financePro.transactions || [])].reverse().find(t => t.manual && t.account)?.account; return FINANCE_PRO_ACCOUNT_KEYS.includes(ultima) ? ultima : FINANCE_PRO_ACCOUNT_KEYS.includes('bancos') ? 'bancos' : FINANCE_PRO_ACCOUNT_KEYS[0]; })();
            txCreado = `ptx_${ref || Date.now()}`;
            financePro.transactions.push({ id: txCreado, date: fechaOk, account: cuenta, type: 'expense', amount: total, category: cat?.id, note: `Compra${tienda ? ` (${tienda})` : ''}`, manual: true, needsReview: !cat });
            entrada.txId = txCreado;
        }
    }

    const plan = items.filter(i => i.planeado), extras = items.filter(i => !i.planeado);
    const sumaExtras = extras.reduce((s, i) => s + (i.importe || 0), 0);
    const pct = total ? Math.round((total - sumaExtras) / total * 100) : 0;
    const resumen = `Ticket${tienda ? ` de ${tienda}` : ''}: ${items.length} productos, ${financeMoney(total)}. ${plan.length} de la lista (${pct} %)${extras.length ? `, ${extras.length} ${extras.length === 1 ? 'añadido' : 'añadidos'} en la tienda (${financeMoney(sumaExtras)})` : ''}${sinComprar.length ? `; sin comprar: ${sinComprar.join(', ')}` : ''}.`;
    const parte = previa && !completa ? ` Queda${resto.length === 1 ? '' : 'n'} ${resto.length} de esa compra a la espera de otro ticket.` : '';
    return { resumen: resumen + parte, deshacer: { accion: 'ticket', entradaId: entrada.id, previa: previaCopia, completa, quitados, txCreado, txAntes, txQuitado, aprendidoAntes } };
}

function compraDeshacerTicket(dh) {
    const d = datosCompra();
    if (dh.previa && (dh.completa ?? true)) { const i = d.historial.findIndex(c => c.id === dh.entradaId); if (i >= 0) d.historial[i] = dh.previa; }
    else {
        d.historial = d.historial.filter(c => c.id !== dh.entradaId);
        if (dh.previa) { const i = d.historial.findIndex(c => c.id === dh.previa.id); if (i >= 0) d.historial[i] = dh.previa; }
    }
    if (dh.txQuitado && !financePro.transactions.some(t => t.id === dh.txQuitado.id)) financePro.transactions.push(dh.txQuitado);
    (dh.quitados || []).forEach(q => {
        const l = d.listas.find(x => x.id === q.listaId);
        if (l && !l.items.some(x => x.id === q.item.id)) l.items.push(q.item);
    });
    if (dh.txCreado) financePro.transactions = financePro.transactions.filter(t => t.id !== dh.txCreado);
    if (dh.txAntes) { const t = financePro.transactions.find(x => x.id === dh.txAntes.id); if (t) t.amount = dh.txAntes.amount; }
    if (dh.aprendidoAntes) d.aprendido = dh.aprendidoAntes;
}

// ============================================================
//  RECETAS (pestaña de Despensa)
//  Cada receta con sus ingredientes (los de tus compras, con lo que te
//  costaron según tus tickets), raciones, pasos y notas. «añadir a la
//  lista.» mete lo que falte en la lista de la compra, marcado con la
//  receta para la que es. Datos: listaCompra.recetas = [{ id, nombre,
//  raciones, ingredientes: [{ texto, cantidad }], pasos, notas, creada }].
// ============================================================
function compraReceta(id) { return datosCompra().recetas.find(r => r.id === id); }

// Lo que cuesta, con el último precio de cada ingrediente en tus tickets.
function compraCosteReceta(r) {
    let total = 0, conPrecio = 0;
    (r.ingredientes || []).forEach(i => {
        const p = compraPrecioItem({ texto: i.texto, cantidad: '', precio: null });
        if (p) { total += p.precio; conPrecio++; }
    });
    return { total, conPrecio, n: (r.ingredientes || []).length };
}

function compraIngredientesTexto(r) {
    return (r.ingredientes || []).map(i => [i.cantidad, i.texto].filter(Boolean).join(' ')).join('\n');
}

function renderCompraRecetas() {
    const d = datosCompra();
    const nueva = '<button class="btn-modal-primary compra-receta-nueva" onclick="openEditarReceta()">+ receta.</button>';
    if (!d.recetas.length) return `${nueva}<div class="compra-vacio"><b>tus recetas, con lo que llevan.</b>Apunta lo que cocinas a menudo con sus ingredientes: Bitácora te dirá cuánto te cuesta cada una según tus tickets y, cuando quieras hacerla, pasa a la lista lo que falte. También puedes pedírselo a Claude o ChatGPT con el conector («guarda esta receta en Bitácora»).</div>`;
    const enLista = new Set(compraListaActual().items.filter(i => !i.hecho).map(i => compraClave(i.texto)));
    return `${nueva}<div class="compra-recetas">${[...d.recetas].sort((a, b) => a.nombre.localeCompare(b.nombre)).map(r => {
        const c = compraCosteReceta(r);
        const faltan = (r.ingredientes || []).filter(i => !enLista.has(compraClave(i.texto))).length;
        return `<div class="compra-receta">
            <button class="compra-receta-cuerpo" onclick="openReceta('${r.id}')">
                <b>${escapeHtml(r.nombre)}</b>
                <small>${c.n} ${c.n === 1 ? 'ingrediente' : 'ingredientes'}${r.raciones ? ` · ${r.raciones} ${Number(r.raciones) === 1 ? 'ración' : 'raciones'}` : ''}${c.conPrecio ? ` · ≈ ${financeMoney(c.total)}${r.raciones > 1 ? ` (${financeMoney(c.total / r.raciones)} la ración)` : ''}` : ''}</small>
            </button>
            ${faltan ? `<button class="pedido-btn" onclick="recetaALaLista('${r.id}')">a la lista.</button>` : '<span class="compra-receta-ok">en la lista.</span>'}
        </div>`;
    }).join('')}</div>`;
}

function openReceta(id) {
    const r = compraReceta(id);
    if (!r) return;
    const c = compraCosteReceta(r);
    const enLista = new Set(compraListaActual().items.filter(i => !i.hecho).map(i => compraClave(i.texto)));
    showModal(`
        <div class="modal-title">${escapeHtml(r.nombre)}.</div>
        <p class="finance-modal-note" style="margin-top:0">${r.raciones ? `${r.raciones} ${Number(r.raciones) === 1 ? 'ración' : 'raciones'}` : 'Sin raciones'}${c.conPrecio ? ` · ≈ ${financeMoney(c.total)}${c.conPrecio < c.n ? ` (con precio de ${c.conPrecio} de ${c.n} ingredientes)` : ''}` : ''}</p>
        <div class="compra-seccion-titulo">ingredientes.</div>
        ${(r.ingredientes || []).map(i => {
            const p = compraPrecioItem({ texto: i.texto, cantidad: '', precio: null });
            return `<div class="compra-hist-linea"><span><b>${escapeHtml(i.texto)}</b>${i.cantidad ? `<small>${escapeHtml(i.cantidad)}</small>` : ''}</span><i>${enLista.has(compraClave(i.texto)) ? '<em class="compra-en-lista">en la lista.</em> ' : ''}${p ? `≈ ${financeMoney(p.precio)}` : ''}</i></div>`;
        }).join('') || '<div class="compra-hist-vacio">Sin ingredientes.</div>'}
        ${r.pasos ? `<div class="compra-seccion-titulo" style="margin-top:16px">cómo se hace.</div><div class="compra-receta-pasos">${escapeHtml(r.pasos).replace(/\n/g, '<br>')}</div>` : ''}
        ${r.notas ? `<div class="compra-seccion-titulo" style="margin-top:16px">notas.</div><div class="compra-receta-pasos">${escapeHtml(r.notas).replace(/\n/g, '<br>')}</div>` : ''}
        <button class="btn-modal-primary" style="margin-top:16px" onclick="recetaALaLista('${r.id}');closeModal()">añadir a la lista lo que falte.</button>
        <div class="compra-receta-acciones">
            <button class="btn-secondary" onclick="openEditarReceta('${r.id}')">editar.</button>
            <button class="btn-secondary" style="color:#dc2626" onclick="borrarReceta('${r.id}')">borrar.</button>
        </div>
    `);
}

function openEditarReceta(id) {
    const r = id ? compraReceta(id) : null;
    const productos = [...new Set([...compraProductos().map(p => p.texto), ...Object.keys(datosCompra().frecuentes).map(t => t.charAt(0).toUpperCase() + t.slice(1))])].sort((a, b) => a.localeCompare(b));
    const habituales = Object.entries(datosCompra().frecuentes).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([t]) => t);
    showModal(`
        <div class="modal-title">${r ? 'editar receta.' : 'receta nueva.'}</div>
        <div class="modal-label">nombre</div>
        <input id="receta-nombre" class="modal-input" value="${escapeHtml(r?.nombre || '')}" placeholder="Pasta con nata y solomillo">
        <div class="modal-label">raciones</div>
        <input id="receta-raciones" class="modal-input" inputmode="numeric" value="${r?.raciones || ''}" placeholder="2">
        <div class="modal-label">ingredientes <small style="font-weight:500;color:var(--text-secondary)">(uno por línea: «200 g nata», «2 huevos»)</small></div>
        <textarea id="receta-ingredientes" class="modal-input" rows="6" placeholder="200 g nata\nsolomillo de cerdo\n250 g pasta">${escapeHtml(r ? compraIngredientesTexto(r) : '')}</textarea>
        ${habituales.length ? `<div class="compra-receta-sugeridas"><span>de tus compras:</span>${habituales.map(t => `<button type="button" class="profe-chip" onclick="recetaAnadirIngrediente('${escapeHtml(t).replace(/'/g, '&#39;')}')">+ ${escapeHtml(t)}</button>`).join('')}</div>` : ''}
        <input id="receta-buscar" class="modal-input" list="receta-productos" placeholder="Buscar en tus productos y añadir..." onchange="if(this.value){recetaAnadirIngrediente(this.value);this.value=''}" style="margin-top:8px">
        <datalist id="receta-productos">${productos.map(p => `<option value="${escapeHtml(p)}">`).join('')}</datalist>
        <div class="modal-label">cómo se hace</div>
        <textarea id="receta-pasos" class="modal-input" rows="4" placeholder="Los pasos, como los dirías.">${escapeHtml(r?.pasos || '')}</textarea>
        <div class="modal-label">notas</div>
        <textarea id="receta-notas" class="modal-input" rows="2" placeholder="De dónde es, trucos...">${escapeHtml(r?.notas || '')}</textarea>
        <button class="btn-modal-primary" style="margin-top:14px" onclick="guardarReceta(${r ? `'${r.id}'` : ''})">guardar.</button>
    `);
    setTimeout(() => document.getElementById('receta-nombre')?.focus(), 60);
}

function recetaAnadirIngrediente(texto) {
    const t = document.getElementById('receta-ingredientes');
    if (!t) return;
    const lineas = t.value.split('\n').map(x => x.trim()).filter(Boolean);
    if (!lineas.some(l => compraClave(compraInterpretar(l).texto) === compraClave(texto))) lineas.push(texto.toLowerCase());
    t.value = lineas.join('\n');
}

function compraLeerIngredientes(texto) {
    return String(texto || '').split(/\n/).map(x => x.trim()).filter(Boolean).map(l => {
        const it = compraInterpretar(l);
        return { texto: it.texto, cantidad: it.cantidad || '' };
    }).filter(i => i.texto);
}

function guardarReceta(id) {
    const nombre = document.getElementById('receta-nombre')?.value.trim();
    if (!nombre) { showToast('Ponle un nombre a la receta', true); return; }
    const d = datosCompra();
    const datos = {
        nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1),
        raciones: Math.max(0, parseInt(document.getElementById('receta-raciones')?.value, 10) || 0) || null,
        ingredientes: compraLeerIngredientes(document.getElementById('receta-ingredientes')?.value),
        pasos: document.getElementById('receta-pasos')?.value.trim() || '',
        notas: document.getElementById('receta-notas')?.value.trim() || '',
    };
    const r = id ? compraReceta(id) : null;
    if (r) Object.assign(r, datos);
    else d.recetas.push({ id: 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), creada: todayISO(), ...datos });
    compraPestana = 'recetas';
    closeModal();
    render();
    guardarCompra();
    showToast(r ? 'Receta guardada' : 'Receta creada');
}

function borrarReceta(id) {
    const r = compraReceta(id);
    if (!r || !confirm(`¿Borrar la receta «${r.nombre}»?`)) return;
    datosCompra().recetas = datosCompra().recetas.filter(x => x.id !== id);
    closeModal();
    render();
    guardarCompra();
}

// Mete en la lista actual los ingredientes que no estén ya, marcados con la
// receta; si ya estaban, solo les añade la receta. Devuelve lo añadido.
function recetaALaLista(id, sinAviso) {
    const r = compraReceta(id);
    if (!r) return [];
    const l = compraListaActual();
    const anadidos = [];
    (r.ingredientes || []).forEach(i => {
        const ya = l.items.find(x => !x.hecho && compraClave(x.texto) === compraClave(i.texto));
        const para = i.cantidad ? `${r.nombre} (${i.cantidad})` : r.nombre;
        if (ya) { ya.recetas = [...new Set([...(ya.recetas || []), para])]; return; }
        const it = { id: 'cmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), texto: i.texto, cantidad: '', precio: null, hecho: false, recetas: [para] };
        l.items.push(it);
        anadidos.push(it.id);
    });
    if (!sinAviso) {
        render();
        guardarCompra();
        showToast(anadidos.length ? `${anadidos.length} ${anadidos.length === 1 ? 'ingrediente' : 'ingredientes'} a la lista «${l.nombre}»` : 'Ya tenías todo en la lista');
    }
    return anadidos;
}

// Op 'receta' del conector: crea la receta (o la actualiza si ya hay una con
// ese nombre) y, si se pide, pasa a la lista lo que falte.
function compraAplicarReceta(op, ref) {
    const d = datosCompra();
    const nombre = String(op.nombre || '').trim();
    if (!nombre) return null;
    const datos = {
        nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1),
        raciones: parseInt(op.raciones, 10) || null,
        ingredientes: compraLeerIngredientes((op.ingredientes || []).join('\n')),
        pasos: (Array.isArray(op.pasos) ? op.pasos.map((p, k) => `${k + 1}. ${String(p).replace(/^\s*\d+[.)]\s*/, '')}`).join('\n') : String(op.pasos || '')).trim(),
        notas: String(op.notas || '').trim(),
    };
    const previa = d.recetas.find(r => compraClave(r.nombre) === compraClave(datos.nombre));
    const antes = previa ? JSON.parse(JSON.stringify(previa)) : null;
    let receta = previa;
    if (previa) Object.assign(previa, datos);
    else { receta = { id: `rec_${ref || Date.now()}`, creada: todayISO(), ...datos }; d.recetas.push(receta); }
    const anadidos = op.a_la_lista ? recetaALaLista(receta.id, true) : [];
    return {
        resumen: `Receta «${receta.nombre}»: ${datos.ingredientes.length} ingredientes${anadidos.length ? `, ${anadidos.length} a la lista` : ''}.`,
        deshacer: { accion: 'receta', id: receta.id, nombre: receta.nombre, antes, listaId: compraListaActual().id, anadidos },
    };
}

function compraDeshacerReceta(dh) {
    const d = datosCompra();
    if (dh.antes) { const i = d.recetas.findIndex(r => r.id === dh.id); if (i >= 0) d.recetas[i] = dh.antes; }
    else d.recetas = d.recetas.filter(r => r.id !== dh.id);
    const l = d.listas.find(x => x.id === dh.listaId);
    if (l) {
        l.items = l.items.filter(x => !(dh.anadidos || []).includes(x.id));
        if (dh.nombre) l.items.forEach(x => { if (x.recetas) x.recetas = x.recetas.filter(t => t !== dh.nombre && !t.startsWith(dh.nombre + ' (')); });
    }
}
