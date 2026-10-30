// Alta y baja de suscripciones y gastos fijos, y el gestor de Finanzas → Planificación.
//   altaDesde: desde cuándo cuenta (solo lo nuevo: lo anterior al 30-10 no sabe cuándo empezó, cuenta desde siempre).
//   bajas: [{ desde, hasta? }]: los periodos de baja; el abierto (sin hasta) es la baja actual.
// Con esto, darla de baja no borra del calendario los meses que sí se pagaron, y reactivarla no apunta los que no.
function suscripcionVigente(e, fecha) {
    if (e.altaDesde && fecha < e.altaDesde) return false;
    const bajas = e.bajas || [];
    if (bajas.some(b => fecha >= b.desde && (!b.hasta || fecha < b.hasta))) return false;
    // Dada de baja antes de existir las fechas: no se sabe cuándo, así que no sale en ningún mes.
    if (e.active === false && !bajas.some(b => !b.hasta)) return false;
    return true;
}

function suscripcionBajaAbierta(e) {
    return (e.bajas || []).find(b => !b.hasta);
}

function suscripcionCambiarEstado(e, activa) {
    const hoy = todayISO();
    const abierta = suscripcionBajaAbierta(e);
    e.bajas = (e.bajas || []).map(b => ({ ...b }));
    const copia = e.bajas.find(b => !b.hasta);
    if (!activa) {
        e.active = false;
        if (!abierta) e.bajas.push({ desde: hoy });
        return;
    }
    if (copia) copia.hasta = hoy;
    else if (e.active === false) {
        // Sin fecha de baja: desde el mes siguiente al último cargo, para que al reactivarla no apunte los meses de en medio.
        const ultimo = e._proLastCharged;
        const desde = ultimo ? financeMonthKey(new Date(Number(ultimo.slice(0, 4)), Number(ultimo.slice(5, 7)), 1)) + '-01' : '0000-01-01';
        e.bajas.push({ desde, hasta: hoy });
    }
    e.active = true;
}

// Los cargos del banco posteriores a la baja: mismo nombre e importe parecido. Solo cuando ya has dicho que la has quitado.
function suscripcionCobrosTrasBaja(e) {
    const baja = suscripcionBajaAbierta(e);
    if (!baja) return [];
    const vistos = new Set(e.cobrosVistos || []);
    const importe = Number(e.amount) || 0;
    return (financePro.transactions || []).filter(t => {
        if (t.type !== 'expense' || !t.date || t.date < baja.desde || vistos.has(t.id) || financeProEsAuto(t) || financeProNeutro(t)) return false;
        if (Math.abs((Number(t.amount) || 0) - importe) > Math.max(1, importe * 0.15)) return false;
        return t.recurringEntryId === e.id || financeProCoincideNombre({ recurringEntryId: e.id, note: e.title }, financeProNormalizar(`${t.note || ''} ${t.bankNote || ''}`));
    }).sort((a, b) => b.date.localeCompare(a.date));
}

function suscripcionFechaCorta(iso) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
}

function renderAvisosCobroTrasBaja() {
    return entries.filter(e => e.type === 'subscription').map(e => {
        const cobros = suscripcionCobrosTrasBaja(e);
        if (!cobros.length) return '';
        const t = cobros[0];
        return `<div class="asist-suscripcion">
            <div><b>${escapeHtml(e.title)} sigue cobrando.</b><span>La diste de baja el ${suscripcionFechaCorta(suscripcionBajaAbierta(e).desde)} y hay ${cobros.length === 1 ? 'un cargo' : `${cobros.length} cargos`}: ${financeMoney(t.amount)} el ${suscripcionFechaCorta(t.date)}.</span></div>
            <div class="asist-suscripcion-botones"><button class="pedido-btn" onclick="suscripcionDarDeAlta('${jsAttr(e.id)}')">dar de alta.</button><button class="pedido-btn" onclick="suscripcionCobroVisto('${jsAttr(e.id)}')">ya lo sé.</button></div>
        </div>`;
    }).join('');
}

// ---- gestor ----
function renderGestorSuscripciones() {
    const subs = entries.filter(e => e.type === 'subscription');
    const activas = subs.filter(e => e.active !== false);
    const deBaja = subs.filter(e => e.active === false);
    const total = activas.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const hoyDia = new Date().getDate();
    const faltan = e => { const d = Number(e.renewalDay) || 1; return d >= hoyDia ? d - hoyDia : d + 31 - hoyDia; };
    const fila = (e, cuerpo, botones) => `<div class="subs-fila">
        <div class="subs-fila-texto" onclick="openEditEntry('${jsAttr(e.id)}')"><b>${escapeHtml(e.title)}</b><span>${cuerpo}</span></div>
        <div class="subs-fila-importe">${financeMoney(Number(e.amount) || 0)}</div>
        <div class="subs-fila-botones">${botones}</div>
    </div>`;
    return `
        <p class="subs-resumen">${activas.length ? `${activas.length} ${activas.length === 1 ? 'activa' : 'activas'}, ${financeMoney(total)} al mes, ${financeMoney(total * 12)} al año.` : 'Ninguna activa.'}</p>
        ${[...activas].sort((a, b) => faltan(a) - faltan(b)).map(e => {
            const f = faltan(e);
            return fila(e, `día ${Number(e.renewalDay) || 1}, ${f === 0 ? 'hoy' : f === 1 ? 'mañana' : `en ${f} días`}`, `<button class="subs-btn" onclick="suscripcionDarDeBaja('${jsAttr(e.id)}')">dar de baja.</button>`);
        }).join('')}
        <button class="subs-anadir" onclick="closeModal();openNewEntry('subscription')">+ añadir.</button>
        ${deBaja.length ? `<div class="subs-seccion">dadas de baja.</div>${deBaja.map(e => {
            const baja = suscripcionBajaAbierta(e), cobros = suscripcionCobrosTrasBaja(e);
            const texto = (baja ? `desde el ${suscripcionFechaCorta(baja.desde)}` : 'de baja') + (cobros.length ? `, <em>sigue cobrando: ${financeMoney(cobros[0].amount)} el ${suscripcionFechaCorta(cobros[0].date)}</em>` : '');
            return fila(e, texto, `<button class="subs-btn" onclick="suscripcionDarDeAlta('${jsAttr(e.id)}')">dar de alta.</button><button class="subs-btn subs-btn-borrar" onclick="suscripcionBorrar('${jsAttr(e.id)}')">borrar.</button>`);
        }).join('')}` : ''}`;
}

function openGestorSuscripciones() {
    showModal(`
        <div class="modal-title">suscripciones.<button class="modal-close" onclick="closeModal()"><i class='ico ico-x' aria-hidden=true></i></button></div>
        <div id="gestor-suscripciones">${renderGestorSuscripciones()}</div>
    `);
    // Mismo aspecto que el modal de un día: X gruesa y sin marcar al abrir.
    document.querySelector('#modal-container .modal-sheet')?.classList.add('hoja-dia');
    modoCapa('detalle');
}

// Repinta el gestor si está abierto, y lo de detrás cuando se cierre (o ya, si el aviso se pulsó desde Finanzas).
async function suscripcionGuardar() {
    filteredEntries = [...entries];
    invalidarCachesDerivadas();
    const caja = document.getElementById('gestor-suscripciones');
    if (caja) caja.innerHTML = renderGestorSuscripciones();
    repintarTrasModal();
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}

function suscripcionDarDeBaja(id) {
    const e = entries.find(x => x.id === id);
    if (!e) return;
    suscripcionCambiarEstado(e, false);
    suscripcionGuardar();
}

function suscripcionDarDeAlta(id) {
    const e = entries.find(x => x.id === id);
    if (!e) return;
    suscripcionCambiarEstado(e, true);
    suscripcionGuardar();
}

function suscripcionCobroVisto(id) {
    const e = entries.find(x => x.id === id);
    if (!e) return;
    e.cobrosVistos = [...new Set([...(e.cobrosVistos || []), ...suscripcionCobrosTrasBaja(e).map(t => t.id)])];
    suscripcionGuardar();
}

function suscripcionBorrar(id) {
    const e = entries.find(x => x.id === id);
    if (!e || !confirm(`¿Borrar ${e.title} de la lista? Los gastos ya apuntados se quedan.`)) return;
    entries = entries.filter(x => x.id !== id);
    suscripcionGuardar();
}
