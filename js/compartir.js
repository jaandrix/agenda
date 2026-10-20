// ============================================================
//  COMPARTIR CON UN ENLACE (función `compartir`, página pública c/)
//  Quedadas para votar fechas, invitaciones a un evento, listas que
//  todos tachan y el plan de un viaje: la otra persona lo abre sin
//  cuenta ni app. Aquí solo se guarda qué has compartido
//  (servicios.compartidos); las respuestas viven en el servidor.
// ============================================================
const COMPARTIR_WEB = 'https://appbitacora.es/c/#';
const COMPARTIR_TIPOS = { quedada: 'quedada.', invitacion: 'invitación.', lista: 'lista.', viaje: 'viaje.' };
const compartidoCache = {};
let quedadaOpciones = [];
SOCIAL_ICONOS.enlace = '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M4 44 96 6 72 94 50 62 82 20 40 56z"/></svg>';

async function compartirPedir(cuerpo) {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch(`${SUPABASE_URL}/functions/v1/compartir`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) }, body: JSON.stringify(cuerpo) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || 'No se ha podido'); e.status = r.status; throw e; }
    return d;
}

function compartidosLista() { return Array.isArray(servicios.compartidos) ? servicios.compartidos : []; }
function compartirAutor() { return String(nombrePublico || userName || '').trim().split(' ')[0]; }

async function compartirCrear(tipo, datos, ref) {
    try {
        const { id } = await compartirPedir({ accion: 'crear', tipo, datos, autor: compartirAutor() });
        servicios.compartidos = [{ id, tipo, titulo: datos.titulo || '', creado: new Date().toISOString(), ref: ref || '' }, ...compartidosLista()].slice(0, 60);
        compartidoCache[id] = { id, tipo, datos, eventos: [], cierre: null, creado: new Date().toISOString() };
        await servGuardarDatos();
        openCompartido(id, true);
        repintarTrasModal();
    } catch (e) {
        console.error(e);
        showToast(e.status === 401 ? 'Inicia sesión para compartir' : 'No se ha podido crear el enlace', true);
    }
}

async function compartirEnviar(id) {
    const c = compartidosLista().find(x => x.id === id);
    const url = COMPARTIR_WEB + id;
    const texto = { quedada: `¿Cuándo os va? Marcad las fechas que podéis para «${c?.titulo}»:`, invitacion: `Te invito a «${c?.titulo}». ¿Vienes?`, lista: `Lista compartida «${c?.titulo}»:`, viaje: `El plan de «${c?.titulo}»:` }[c?.tipo] || '';
    if (navigator.share) { try { await navigator.share({ title: c?.titulo || 'Bitácora', text: texto, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    navigator.clipboard.writeText(`${texto} ${url}`).then(() => showToast('Enlace copiado, listo para pegar')).catch(() => showToast('No se ha podido copiar', true));
}

// ---- crear ----
function openNuevaQuedada() {
    const base = new Date();
    const prox = k => { const d = new Date(base); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7) + k); return isoLocal(d); };
    quedadaOpciones = [{ fecha: prox(0), hora: '21:00' }, { fecha: prox(1), hora: '21:00' }];
    showModal(`
        <div class="modal-title">nueva quedada.</div>
        <p class="finance-modal-note" style="margin-top:0">Propón varias fechas y manda el enlace. Cada uno marca cuándo puede, sin cuenta ni app; tú eliges la que mejor va y entra en tu calendario.</p>
        <div class="modal-label">Qué</div>
        <input id="qd-titulo" class="modal-input" maxlength="80" placeholder="Cena de Navidad, partido de pádel...">
        <div class="modal-label">Dónde <span class="cmpt-opcional">(opcional)</span></div>
        <input id="qd-lugar" class="modal-input" maxlength="80" placeholder="Casa de Marta, el bar de siempre...">
        <div class="modal-label">Fechas posibles</div>
        <div id="qd-opciones" class="cmpt-opciones-edit"></div>
        <button class="btn-secondary" style="width:auto;margin-top:8px" onclick="quedadaOtra()">+ otra fecha.</button>
        <div class="modal-label">Un mensaje <span class="cmpt-opcional">(opcional)</span></div>
        <textarea id="qd-nota" class="modal-input" rows="2" maxlength="300" placeholder="Para que nos veamos antes de las fiestas"></textarea>
        <button class="btn-modal-primary" style="margin-top:14px" onclick="crearQuedada(this)">crear el enlace.</button>
    `);
    pintarQuedadaOpciones();
    setTimeout(() => document.getElementById('qd-titulo')?.focus(), 60);
}

function pintarQuedadaOpciones() {
    const caja = document.getElementById('qd-opciones');
    if (!caja) return;
    caja.innerHTML = quedadaOpciones.map((o, i) => `<div class="cmpt-opcion-edit">
        <input type="date" class="modal-input" value="${o.fecha}" onchange="quedadaOpciones[${i}].fecha=this.value">
        <input type="time" class="modal-input" value="${o.hora}" onchange="quedadaOpciones[${i}].hora=this.value">
        ${quedadaOpciones.length > 1 ? `<button class="serv-cerrar" onclick="quedadaQuitar(${i})" aria-label="Quitar esta fecha"><i class='ico ico-x' aria-hidden=true></i></button>` : ''}
    </div>`).join('');
}

function quedadaOtra() {
    if (quedadaOpciones.length >= 12) { showToast('Como mucho 12 fechas', true); return; }
    const ult = quedadaOpciones[quedadaOpciones.length - 1] || { fecha: todayISO(), hora: '21:00' };
    const d = new Date(ult.fecha + 'T12:00:00'); d.setDate(d.getDate() + 1);
    quedadaOpciones.push({ fecha: isoLocal(d), hora: ult.hora });
    pintarQuedadaOpciones();
}

function quedadaQuitar(i) { quedadaOpciones.splice(i, 1); pintarQuedadaOpciones(); }

async function crearQuedada(boton) {
    const titulo = document.getElementById('qd-titulo')?.value.trim();
    if (!titulo) { showToast('Ponle un nombre a la quedada', true); return; }
    const opciones = quedadaOpciones.filter(o => o.fecha).map(o => ({ fecha: o.fecha, hora: o.hora || '' }))
        .filter((o, i, l) => l.findIndex(x => x.fecha === o.fecha && x.hora === o.hora) === i)
        .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
    if (!opciones.length) { showToast('Añade al menos una fecha', true); return; }
    boton.disabled = true;
    await compartirCrear('quedada', { titulo, lugar: document.getElementById('qd-lugar')?.value.trim() || '', nota: document.getElementById('qd-nota')?.value.trim() || '', opciones });
    boton.disabled = false;
}

function compartirInvitacion(entryId) {
    const e = entries.find(x => x.id === entryId);
    if (!e) { showToast('Elige un evento', true); return; }
    showModal(`
        <div class="modal-title">invitar con un enlace.</div>
        <p class="finance-modal-note" style="margin-top:0">Quien lo abra ve el evento, lo añade a su calendario y te dice si va, sin cuenta ni app. Tú ves quién viene.</p>
        <div class="cmpt-evento"><b>${escapeHtml(e.title || 'Evento')}</b><span>${e.date ? servFecha(e.date, true) : ''}${e.time ? `, ${escapeHtml(e.time)}` : ''}${e.place ? `, ${escapeHtml(e.place)}` : ''}</span></div>
        <div class="modal-label">Un mensaje <span class="cmpt-opcional">(opcional)</span></div>
        <textarea id="inv-nota" class="modal-input" rows="2" maxlength="300" placeholder="Traed algo de beber, empezamos puntuales..."></textarea>
        <button class="btn-modal-primary" style="margin-top:14px" onclick="this.disabled=true;compartirCrear('invitacion', invitacionDatos('${e.id}', document.getElementById('inv-nota').value.trim()), '${e.id}')">crear el enlace.</button>
    `);
}

function invitacionDatos(entryId, nota) {
    const e = entries.find(x => x.id === entryId) || {};
    return { titulo: e.title || 'Evento', fecha: e.date || '', hora: e.time || '', horaFin: e.endTime || '', lugar: e.place || '', nota: nota ?? '' };
}

function compartirListaCompra(listaId) {
    const l = datosCompra().listas.find(x => x.id === listaId);
    if (!l) return;
    const items = l.items.filter(i => !i.hecho).map(i => ({ id: i.id.slice(-16), texto: [i.texto, i.cantidad].filter(Boolean).join(' ') }));
    compartirCrear('lista', { titulo: l.nombre || 'Lista de la compra', items }, listaId);
}

function viajeDatos(t) {
    const sin = x => { const { reserva, asiento, ...resto } = x || {}; return resto; };
    return { titulo: t.title || 'Viaje', destino: t.destination || '', inicio: t.startDate || '', fin: t.endDate || '', transportes: (t.transportes || []).map(x => { const y = sin(x); y.tipo = (TRANSPORTE_TIPOS[y.tipo] || y.tipo || '').replace(/^\w/, c => c.toUpperCase()); return y; }), alojamientos: (t.alojamientos || []).map(sin), itinerario: (t.itinerario || []).map(({ id, dia, hora, titulo, lugar, notas }) => ({ id, dia, hora, titulo, lugar, notas })) };
}

function compartirViaje(tripId) {
    const t = getTrip(tripId);
    if (t) compartirCrear('viaje', viajeDatos(t), tripId);
}

// ---- ver lo compartido ----
function compartidoVotos(c, tipo) {
    const m = new Map();
    (c.eventos || []).filter(e => e.tipo === tipo).forEach(e => m.set(e.pid, e));
    return [...m.values()];
}

function compartidoItems(c) {
    const m = new Map();
    (c.datos?.items || []).forEach(x => m.set(x.id, { id: x.id, texto: x.texto, hecho: !!x.hecho, quien: '' }));
    (c.eventos || []).forEach(e => {
        if (e.tipo === 'anadir' && !m.has(e.item)) m.set(e.item, { id: e.item, texto: e.texto, hecho: false, quien: e.nombre });
        else if (e.tipo === 'marcar' && m.has(e.item)) m.get(e.item).hecho = e.hecho;
        else if (e.tipo === 'quitar') m.delete(e.item);
    });
    return [...m.values()];
}

function compartidoResumen(c) {
    if (!c) return 'Cargando...';
    if (c.tipo === 'quedada') {
        const v = compartidoVotos(c, 'voto');
        if (c.cierre) { const o = c.datos.opciones[c.cierre.opcion]; return o ? `Decidido: ${servFecha(o.fecha)}${o.hora ? `, ${o.hora}` : ''}.` : 'Decidido.'; }
        return v.length ? `${v.length} ${v.length === 1 ? 'respuesta' : 'respuestas'}.` : 'Nadie ha respondido todavía.';
    }
    if (c.tipo === 'invitacion') {
        const r = compartidoVotos(c, 'rsvp'), van = r.filter(x => x.va === 'si').reduce((t, x) => t + 1 + (x.mas || 0), 0);
        return r.length ? `${van ? `${van} ${van === 1 ? 'va' : 'van'}` : 'Nadie va aún'}${r.filter(x => x.va === 'quiza').length ? `, ${r.filter(x => x.va === 'quiza').length} quizá` : ''}.` : 'Nadie ha respondido todavía.';
    }
    if (c.tipo === 'lista') { const it = compartidoItems(c), p = it.filter(i => !i.hecho).length; return p ? `Faltan ${p} de ${it.length}.` : it.length ? 'Todo hecho.' : 'Vacía.'; }
    return 'Solo lectura.';
}

async function cargarCompartido(id) {
    try { compartidoCache[id] = await compartirPedir({ accion: 'ver', id }); }
    catch (e) { if (e.status === 404) compartidoCache[id] = { id, borrado: true }; }
    return compartidoCache[id];
}

async function openCompartido(id, recien) {
    const fila = compartidosLista().find(x => x.id === id);
    if (!fila) { showToast('Ese enlace ya no está entre los tuyos', true); return; }
    const antes = JSON.stringify(compartidoCache[id] || null);
    pintarCompartido(id, recien);
    await cargarCompartido(id);
    // Solo se repinta si llegó algo nuevo, y por dentro: repintar el modal
    // entero lo hacía parpadear como si se cerrara y se volviera a abrir.
    if (document.getElementById('cmpt-' + id) && JSON.stringify(compartidoCache[id] || null) !== antes) pintarCompartido(id, recien);
    const lista = document.getElementById('cmpt-mios');
    if (lista) lista.innerHTML = compartidosFilas();
}

function pintarCompartido(id, recien) {
    const fila = compartidosLista().find(x => x.id === id);
    const c = compartidoCache[id];
    const url = COMPARTIR_WEB + id;
    let cuerpo = '<div class="finance-modal-note">Cargando las respuestas...</div>';
    if (c?.borrado) cuerpo = '<div class="finance-modal-note">Este enlace ya no existe en el servidor.</div>';
    else if (c?.datos) {
        if (c.tipo === 'quedada') {
            const v = compartidoVotos(c, 'voto');
            const puntos = c.datos.opciones.map((_, i) => v.reduce((t, x) => t + (x.si.includes(i) ? 1 : x.quiza.includes(i) ? .5 : 0), 0));
            const max = Math.max(0, ...puntos);
            cuerpo = `<div class="cmpt-filas">${c.datos.opciones.map((o, i) => {
                const si = v.filter(x => x.si.includes(i)).map(x => x.nombre), qz = v.filter(x => x.quiza.includes(i)).map(x => x.nombre);
                const elegida = c.cierre?.opcion === i;
                return `<div class="cmpt-fila ${elegida ? 'elegida' : ''} ${!c.cierre && max > 0 && puntos[i] === max ? 'mejor' : ''}">
                    <div class="cmpt-fila-txt"><b>${servFecha(o.fecha)}${o.hora ? `, ${escapeHtml(o.hora)}` : ''}</b><span>${[si.length ? `${si.length === 1 ? 'puede' : 'pueden'} ${escapeHtml(si.join(', '))}` : '', qz.length ? `quizá ${escapeHtml(qz.join(', '))}` : ''].filter(Boolean).join(', ') || 'Nadie todavía.'}</span></div>
                    <span class="cmpt-cuenta">${si.length}</span>
                    ${c.cierre ? (elegida ? '<span class="cmpt-sello">elegida.</span>' : '') : `<button class="btn-secondary" style="width:auto" onclick="quedadaElegir('${id}', ${i})">elegir.</button>`}
                </div>`;
            }).join('')}</div>
            ${v.filter(x => x.nota).map(x => `<div class="cmpt-nota"><b>${escapeHtml(x.nombre)}</b> ${escapeHtml(x.nota)}</div>`).join('')}
            ${c.cierre ? `<button class="btn-secondary" style="width:auto;margin-top:10px" onclick="quedadaReabrir('${id}')">reabrir la votación.</button>` : '<p class="finance-modal-note">Al elegir una fecha, la quedada entra en tu calendario y quien abra el enlace verá lo decidido, con un botón para añadirla al suyo.</p>'}`;
        } else if (c.tipo === 'invitacion') {
            const r = compartidoVotos(c, 'rsvp');
            const g = (va, t) => { const l = r.filter(x => x.va === va); return l.length ? `<div class="cmpt-fila"><div class="cmpt-fila-txt"><b>${t}</b><span>${escapeHtml(l.map(x => x.nombre + (x.mas ? ` +${x.mas}` : '')).join(', '))}</span></div><span class="cmpt-cuenta">${l.reduce((s, x) => s + 1 + (va === 'si' ? x.mas || 0 : 0), 0)}</span></div>` : ''; };
            cuerpo = `<div class="cmpt-evento"><b>${escapeHtml(c.datos.titulo)}</b><span>${c.datos.fecha ? servFecha(c.datos.fecha, true) : ''}${c.datos.hora ? `, ${escapeHtml(c.datos.hora)}` : ''}${c.datos.lugar ? `, ${escapeHtml(c.datos.lugar)}` : ''}</span></div>
            ${r.length ? `<div class="cmpt-filas">${g('si', 'van.')}${g('quiza', 'quizá.')}${g('no', 'no pueden.')}</div>` : '<div class="finance-modal-note">Nadie ha respondido todavía.</div>'}
            ${r.filter(x => x.nota).map(x => `<div class="cmpt-nota"><b>${escapeHtml(x.nombre)}</b> ${escapeHtml(x.nota)}</div>`).join('')}
            ${fila.ref && entries.some(e => e.id === fila.ref) ? `<button class="btn-secondary" style="width:auto;margin-top:10px" onclick="compartidoActualizar('${id}')">actualizar con el evento.</button>` : ''}`;
        } else if (c.tipo === 'lista') {
            const it = compartidoItems(c);
            cuerpo = `<div class="cmpt-lista">${it.map(i => `<div class="cmpt-item ${i.hecho ? 'hecho' : ''}"><button class="compra-check ${i.hecho ? 'on' : ''}" onclick="compartidoMarcar('${id}', '${jsAttr(i.id)}', ${!i.hecho})" aria-label="${i.hecho ? 'Desmarcar' : 'Marcar'}"></button><span><b>${escapeHtml(i.texto)}</b>${i.quien ? `<small>lo añadió ${escapeHtml(i.quien)}</small>` : ''}</span></div>`).join('') || '<div class="finance-modal-note">La lista está vacía.</div>'}</div>
            ${it.some(i => !i.hecho) && typeof datosCompra === 'function' ? `<button class="btn-secondary" style="width:auto;margin-top:10px" onclick="compartidoADespensa('${id}')">pasar lo pendiente a mi despensa.</button>` : ''}`;
        } else if (c.tipo === 'viaje') {
            cuerpo = `<p class="finance-modal-note" style="margin-top:0">Quien abra el enlace ve el plan tal como estaba el ${new Date(c.actualizado || c.creado).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}: transportes, alojamientos y el día a día. Los números de reserva no se comparten.</p>
            ${fila.ref && getTrip(fila.ref) ? `<button class="btn-secondary" style="width:auto" onclick="compartidoActualizar('${id}')">actualizar con lo último.</button>` : ''}`;
        }
    }
    const html = `
        <div id="cmpt-${id}">
            <div class="modal-title">${escapeHtml((fila?.titulo || c?.datos?.titulo || 'compartido').toLowerCase())}.</div>
            <p class="finance-modal-note" style="margin-top:0">${recien ? 'Listo. Mándalo por WhatsApp o donde quieras: se abre sin cuenta ni app.' : escapeHtml(compartidoResumen(c))}</p>
            <div class="conector-url cmpt-url"><code>${escapeHtml(url)}</code></div>
            <div class="cmpt-botones">
                <button class="btn-modal-primary" onclick="compartirEnviar('${id}')">enviar.</button>
                <a class="btn-secondary" href="https://wa.me/?text=${encodeURIComponent(url)}" target="_blank" rel="noopener">whatsapp.</a>
                <a class="btn-secondary" href="${url}" target="_blank" rel="noopener">ver como ellos.</a>
            </div>
            <div class="cmpt-cuerpo">${cuerpo}</div>
            <button class="btn-secondary btn-danger-pill" style="width:100%;margin-top:18px" onclick="compartidoBorrar('${id}')">dejar de compartir.</button>
        </div>`;
    const abierto = document.getElementById('cmpt-' + id);
    if (abierto) abierto.outerHTML = html;
    else showModal(html);
}

async function quedadaElegir(id, i) {
    const c = compartidoCache[id];
    const o = c?.datos?.opciones?.[i];
    if (!o) return;
    try { compartidoCache[id] = await compartirPedir({ accion: 'actualizar', id, cierre: { opcion: i, cuando: new Date().toISOString() } }); }
    catch (e) { showToast('No se ha podido cerrar', true); return; }
    entries = entries.filter(e => e.compartidoId !== id);
    const van = compartidoVotos(compartidoCache[id], 'voto').filter(v => v.si.includes(i)).map(v => v.nombre);
    entries.push({ id: 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), type: 'event', eventType: 'social', categoryId: getCategoryIdForType('event'), tags: [], title: c.datos.titulo, date: o.fecha, time: o.hora || '', place: c.datos.lugar || '', notes: [c.datos.nota, van.length ? `Con ${van.join(', ')}.` : ''].filter(Boolean).join('\n'), compartidoId: id });
    filteredEntries = [...entries];
    repintarTrasModal();
    pintarCompartido(id);
    showToast('Decidido. Ya está en tu calendario');
    await servGuardarDatos();
}

async function quedadaReabrir(id) {
    try { compartidoCache[id] = await compartirPedir({ accion: 'actualizar', id, cierre: null }); }
    catch (e) { showToast('No se ha podido reabrir', true); return; }
    entries = entries.filter(e => e.compartidoId !== id);
    filteredEntries = [...entries];
    repintarTrasModal();
    pintarCompartido(id);
    await servGuardarDatos();
}

async function compartidoActualizar(id) {
    const fila = compartidosLista().find(x => x.id === id);
    const c = compartidoCache[id];
    if (!fila || !c) return;
    const datos = fila.tipo === 'viaje' ? viajeDatos(getTrip(fila.ref)) : invitacionDatos(fila.ref, c.datos?.nota);
    try { compartidoCache[id] = await compartirPedir({ accion: 'actualizar', id, datos }); }
    catch (e) { showToast('No se ha podido actualizar', true); return; }
    fila.titulo = datos.titulo;
    pintarCompartido(id);
    showToast('Actualizado');
    await servGuardarDatos();
}

async function compartidoMarcar(id, item, hecho) {
    try { compartidoCache[id] = await compartirPedir({ accion: 'responder', id, ev: { tipo: 'marcar', item, hecho, nombre: compartirAutor(), dueno: true } }); pintarCompartido(id); }
    catch (e) { showToast('No se ha podido marcar', true); }
}

function compartidoADespensa(id) {
    const pend = compartidoItems(compartidoCache[id]).filter(i => !i.hecho);
    if (!pend.length) return;
    compraAnadir(pend.map(i => i.texto.replace(/,/g, ' ')).join('\n'));
    showToast(`${pend.length} ${pend.length === 1 ? 'cosa' : 'cosas'} en tu despensa`);
}

async function compartidoBorrar(id) {
    if (!confirm('¿Dejar de compartir? El enlace dejará de funcionar para todos y se borran sus respuestas.')) return;
    try { await compartirPedir({ accion: 'borrar', id }); }
    catch (e) { if (e.status !== 404) { showToast('No se ha podido borrar', true); return; } }
    servicios.compartidos = compartidosLista().filter(x => x.id !== id);
    delete compartidoCache[id];
    repintarTrasModal();
    closeModal();
    await servGuardarDatos();
}

// ---- en Social ----
let compartidosCargando = false;
function renderEnlacesSocial() {
    const l = compartidosLista();
    const faltan = l.filter(c => !compartidoCache[c.id]);
    if (faltan.length && !compartidosCargando) {
        compartidosCargando = true;
        Promise.all(faltan.slice(0, 20).map(c => cargarCompartido(c.id))).finally(() => {
            compartidosCargando = false;
            // Solo cambian los resúmenes de la lista: se cambian por dentro, sin repintar Social.
            const lista = document.getElementById('cmpt-mios');
            if (lista) lista.innerHTML = compartidosFilas();
        });
    }
    return `
        <div class="ajustes-rejilla">
            ${bloqueSocial('', 'enlace', 'sin cuenta ni app.', 'Para quien no usa Bitácora: lo abren con un enlace, desde WhatsApp o donde sea.', `
                <div class="cmpt-nuevos">
                    <button class="cmpt-nuevo" onclick="openNuevaQuedada()"><b>quedada.</b><span>Propón fechas y que cada uno marque cuándo puede.</span></button>
                    <button class="cmpt-nuevo" onclick="openCompartirEvento()"><b>invitación.</b><span>Un evento tuyo: lo añaden a su calendario y te dicen si van.</span></button>
                    <button class="cmpt-nuevo" onclick="compartirElegirLista()"><b>lista.</b><span>La compra de la cena, lo que falta en el piso: todos tachan y añaden.</span></button>
                </div>`)}
            ${l.length ? bloqueSocial('', 'recibido', 'lo que has compartido.', '', `<div class="cmpt-mios" id="cmpt-mios">${compartidosFilas()}</div>`) : ''}
        </div>`;
}

function compartidosFilas() {
    return compartidosLista().map(c => `
                <button class="cmpt-mio" onclick="openCompartido('${c.id}')"><span class="cmpt-tipo">${COMPARTIR_TIPOS[c.tipo] || ''}</span><b>${escapeHtml(c.titulo || 'Sin nombre')}</b><small>${escapeHtml(compartidoCache[c.id]?.borrado ? 'Ya no existe.' : compartidoResumen(compartidoCache[c.id]))}</small></button>`).join('');
}

function compartirElegirLista() {
    const listas = typeof datosCompra === 'function' ? datosCompra().listas : [];
    showModal(`
        <div class="modal-title">compartir una lista.</div>
        <p class="finance-modal-note" style="margin-top:0">Empieza con lo que tengas pendiente en esa lista de la despensa, o vacía. Después cada uno tacha y añade desde el enlace, y tú puedes traer lo pendiente de vuelta a tu despensa.</p>
        ${listas.map(l => `<button class="serv-resultado" onclick="compartirListaCompra('${l.id}')"><b>${escapeHtml(l.nombre)}</b><span>${l.items.filter(i => !i.hecho).length} pendientes</span></button>`).join('')}
        <div class="modal-label" style="margin-top:14px">O una nueva</div>
        <div class="compra-anadir"><input id="cmpt-lista-nueva" class="modal-input" maxlength="60" placeholder="Barbacoa del sábado, cosas del piso..."><button class="btn-modal-primary" onclick="const v=document.getElementById('cmpt-lista-nueva').value.trim();if(v)compartirCrear('lista',{titulo:v,items:[]});else showToast('Ponle un nombre',true)">crear.</button></div>
    `);
}

function compartidoDesdeUrl() {
    const id = new URLSearchParams(location.search).get('compartido');
    if (!id) return;
    history.replaceState(null, '', location.pathname);
    if (compartidosLista().some(c => c.id === id)) setTimeout(() => openCompartido(id), 900);
}
