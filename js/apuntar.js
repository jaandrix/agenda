// ============================================================
//  APUNTAR (el + de la barra del móvil y el rayo del escritorio)
//  Una hoja con una sola línea que entiende lo que escribes y te enseña
//  qué va a crear antes de guardarlo:
//    «gimnasio mañana a las 19»  → tarea del planificador, mañana 19:00
//    «cena con Marta el viernes a las 21» → evento (más allá de pasado
//                                            mañana, el planificador no llega)
//    «café 2,40 €» / «+620 € nómina»     → gasto / ingreso en Finanzas
//    «comprar pan y leche»               → lista de la compra
//  Se puede cambiar el tipo con un toque, y debajo están los accesos a
//  cada formulario completo.
// ============================================================
let apuntarFechaBase = null;
let apuntarTipoElegido = null;

const APUNTAR_DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

function apuntarNorm(t) { return stripAccents(String(t || '').toLowerCase()); }

// Lee fecha, hora e importe del texto y deja el resto como título.
// Entiende, entre otras: «ayer», «en 3 días», «dentro de 2 semanas», «la
// semana que viene», «el finde», «el lunes que viene», «15/10/2026», «a
// las 7 de la tarde», «a la una», «19h», «7 pm», «a mediodía», «8 menos
// cuarto», «de 18 a 20», «esta tarde», «mañana por la mañana», «gasté 12
// en el cine», «me han pagado 50», «recuérdame…», «nota: …».
const APUNTAR_NUMEROS = { una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 };
const APUNTAR_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function interpretarApunte(texto) {
    let resto = ' ' + String(texto || '').trim() + ' ';
    const n = apuntarNorm(resto);
    const r = { fecha: apuntarFechaBase || todayISO(), fechaDicha: false, hora: '', importe: null, ingreso: false, comprar: false, nota: false, titulo: '' };
    const quitar = (re) => { const m = apuntarNorm(resto).match(re); if (!m) return null; resto = resto.slice(0, m.index) + ' ' + resto.slice(m.index + m[0].length); return m; };

    // Qué es: prefijos que no forman parte del título.
    if (quitar(/^\s*(?:nota|idea|apunte)\s*:\s*/)) r.nota = true;
    quitar(/^\s*(?:recuerdame|recordar|acuerdate de|no olvidar|no olvides|tengo que|apunta|apuntar)\s+(?:que\s+)?/);
    if (quitar(/^\s*(?:anade|anadir|pon|apunta)?\s*(?:a|en)\s+la\s+(?:lista\s+de\s+la\s+)?compra\s*:?\s*/) || quitar(/\s+a\s+la\s+(?:lista\s+de\s+la\s+)?compra\s*$/)) r.comprar = true;

    let m = quitar(/[+]?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur(?:os)?\b)/) || quitar(/€\s*(\d+(?:[.,]\d{1,2})?)/);
    if (!m && (m = quitar(/\b(?:gaste|he gastado|pague|he pagado|me ha costado|me costo|cuesta|costo|cobre|he cobrado|me han pagado|me pagan|me ingresan|ingrese|ingreso de)\s+(\d+(?:[.,]\d{1,2})?)\b/))) {
        resto = ' ' + m[0].replace(/\s*\d+(?:[.,]\d{1,2})?\s*$/, '') + ' ' + resto;
    }
    if (m) { r.importe = Number(m[1].replace(',', '.')); r.ingreso = /^\s*\+/.test(m[0]) || /\b(cobr|ingres|nomina|me pagan|me han pagado|me ingresan)/.test(n); }
    if (r.importe != null) quitar(/^\s*(?:gaste|he gastado|pague|he pagado|me ha costado|me costo|cobre|he cobrado|me han pagado|me pagan|me ingresan|ingrese)\b/);

    const base = new Date(todayISO() + 'T12:00:00');
    const enDias = k => { const d = new Date(base); d.setDate(d.getDate() + k); return isoLocal(d); };
    const dia = k => { r.fecha = enDias(k); r.fechaDicha = true; };
    // Momento del día (se usa como hora si no se dice otra).
    let momento = '';
    if ((m = quitar(/\b(?:por|de)\s+la\s+(manana|tarde|noche)\b/))) momento = m[1];
    else if ((m = quitar(/\besta\s+(manana|tarde|noche)\b/))) { momento = m[1]; dia(0); }
    else if (quitar(/\b(?:a|al)\s+medio\s?dia\b/)) momento = 'mediodia';

    if (quitar(/\banteayer\b/)) dia(-2);
    else if (quitar(/\bayer\b/)) dia(-1);
    else if (quitar(/\bpasado\s+manana\b/)) dia(2);
    else if (quitar(/\bmanana\b/)) dia(1);
    else if (quitar(/\bhoy\b/)) dia(0);
    else if ((m = quitar(/\b(?:en|dentro\s+de)\s+(\d{1,2}|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(dias?|semanas?|mes(?:es)?)\b/))) {
        const cant = /^\d+$/.test(m[1]) ? Number(m[1]) : (APUNTAR_NUMEROS[m[1]] || 1);
        if (m[2].startsWith('mes')) { const d = new Date(base); d.setMonth(d.getMonth() + cant); r.fecha = isoLocal(d); r.fechaDicha = true; }
        else dia(cant * (m[2].startsWith('semana') ? 7 : 1));
    }
    else if (quitar(/\b(?:la\s+)?(?:semana\s+que\s+viene|proxima\s+semana|siguiente\s+semana)\b/)) dia(((1 - base.getDay() + 7) % 7) || 7);
    else if (quitar(/\b(?:este|el)\s+(?:finde|fin\s+de\s+semana)\b/)) dia((6 - base.getDay() + 7) % 7);
    else if ((m = quitar(/\b(?:el\s+)?(?:proximo\s+)?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)(\s+que\s+viene|\s+proximo)?\b/))) {
        const objetivo = APUNTAR_DIAS.indexOf(m[1]);
        let k = (objetivo - base.getDay() + 7) % 7; if (k === 0) k = 7;
        dia(k);
    } else if ((m = quitar(/\b(?:el\s+(?:dia\s+)?)?(\d{1,2})\s*(?:\/|-|de\s+)(\d{1,2}|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s*(?:\/|-|de\s+)(\d{4}|\d{2}))?\b/))) {
        const mes = /^\d+$/.test(m[2]) ? Number(m[2]) - 1 : APUNTAR_MESES.indexOf(m[2]);
        const anio = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : base.getFullYear();
        const d = new Date(anio, mes, Number(m[1]), 12);
        if (!m[3] && isoLocal(d) < todayISO()) d.setFullYear(d.getFullYear() + 1);
        r.fecha = isoLocal(d); r.fechaDicha = true;
    } else if ((m = quitar(/\bel\s+(?:dia\s+)?(\d{1,2})\b/))) {
        const d = new Date(base.getFullYear(), base.getMonth(), Number(m[1]), 12);
        if (isoLocal(d) < todayISO()) d.setMonth(d.getMonth() + 1);
        r.fecha = isoLocal(d); r.fechaDicha = true;
    }

    // Hora: «a las 19», «a la una y media», «19:30», «19h», «7 pm», «8 menos
    // cuarto», «de 18 a 20» (se queda la de empezar), «sobre las 8».
    const num = '(\\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)';
    const reHora = new RegExp(`\\b(?:de|desde)?\\s*(?:a|sobre|hacia)?\\s*(?:las?\\s+)?${num}(?:\\s*[:.,h]\\s*(\\d{2})|\\s+y\\s+(media|cuarto)|\\s+menos\\s+(cuarto|\\d{1,2}))?(?:\\s*(am|pm|h\\b|de la (?:manana|tarde|noche|madrugada)))?(?:\\s+(?:a|hasta)\\s+(?:las?\\s+)?\\d{1,2}(?:[:.]\\d{2})?)?`);
    const leerHora = mm => {
        let h = /^\d+$/.test(mm[1]) ? Number(mm[1]) : APUNTAR_NUMEROS[mm[1]];
        let min = mm[2] ? Number(mm[2]) : mm[3] === 'media' ? 30 : mm[3] === 'cuarto' ? 15 : 0;
        const dicha = h;
        if (mm[4]) { h -= 1; min = 60 - (mm[4] === 'cuarto' ? 15 : Number(mm[4])); if (h < 0) h = 23; }
        const suf = mm[5] || '';
        // «a la una», «a las 5» a secas casi siempre es por la tarde.
        const tarde = /pm|tarde|noche/.test(suf) || (!suf && /tarde|noche/.test(momento)) || (!suf && !momento && !mm[2] && dicha >= 1 && dicha <= 7);
        if (tarde && h < 12) h += 12;
        if (/am|madrugada|manana/.test(suf) && h === 12) h = 0;
        return h < 24 && min < 60 ? `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` : '';
    };
    const marcaHora = /\b(?:a|sobre|hacia|desde)\s+(?:las?\s+)?(?:\d|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)|\bde\s+\d{1,2}\s+a\s+\d|\b\d{1,2}\s*(?:[:.]\d{2}|h\b|am\b|pm\b)/;
    if (marcaHora.test(apuntarNorm(resto)) && (m = quitar(reHora)) && /\d|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce/.test(m[0])) r.hora = leerHora(m);
    if (!r.hora && momento) r.hora = { manana: '09:00', mediodia: '14:00', tarde: '17:00', noche: '21:00' }[momento];

    if (/^\s*(?:comprar|compra)\b/.test(apuntarNorm(resto))) { r.comprar = true; resto = resto.replace(/^\s*(?:comprar|compra)\b\s*:?/i, ''); }
    if (r.comprar) quitar(/^\s*(?:anade|anadir|pon|poner|mete|meter|apunta)\s+/);
    if (r.importe != null) quitar(/^\s*(?:en|de|del|por)\s+(?:el\s+|la\s+|los\s+|las\s+)?/);
    const t = resto.replace(/\s+/g, ' ').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '').replace(/\s+(?:a|el|en|para|de)$/i, '').trim();
    r.titulo = t.charAt(0).toUpperCase() + t.slice(1);
    return r;
}

// Qué se crearía, salvo que se elija otro tipo a mano.
function apuntarTipo(r) {
    if (apuntarTipoElegido) return apuntarTipoElegido;
    if (r.nota) return 'nota';
    if (r.importe != null) return 'gasto';
    if (r.comprar && apartadoVisible('compra')) return 'compra';
    const dias = Math.round((new Date(r.fecha + 'T12:00:00') - new Date(currentPlannerDayKey() + 'T12:00:00')) / 864e5);
    return dias >= 0 && dias <= 2 ? 'tarea' : 'evento';
}

function apuntarFechaTexto(iso) {
    const dias = Math.round((new Date(iso + 'T12:00:00') - new Date(todayISO() + 'T12:00:00')) / 864e5);
    if (dias === 0) return 'hoy';
    if (dias === 1) return 'mañana';
    if (dias === 2) return 'pasado mañana';
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }).replace('.', '');
}

function pintarVistaApunte() {
    const caja = document.getElementById('apuntar-vista');
    const texto = document.getElementById('apuntar-texto')?.value || '';
    if (!caja) return;
    if (!texto.trim()) { caja.innerHTML = '<span class="apuntar-pista">Escribe como hablas: «dentista el jueves a las 5 de la tarde», «gasté 12 en el cine», «recuérdame llamar a mamá mañana», «nota: …». Bitácora pone la fecha, la hora o el importe.</span>'; return; }
    const r = interpretarApunte(texto);
    const tipo = apuntarTipo(r);
    const desc = tipo === 'gasto' ? `${r.ingreso ? 'ingreso' : 'gasto'} de ${r.importe != null ? financeMoney(r.importe) : '—'}${r.titulo ? ` · ${escapeHtml(r.titulo)}` : ''}`
        : tipo === 'compra' ? `a la compra: ${escapeHtml(r.titulo || '…')}`
        : `${tipo === 'tarea' ? 'tarea' : 'evento'} · ${apuntarFechaTexto(r.fecha)}${r.hora ? ` a las ${r.hora}` : tipo === 'tarea' ? ', sin hora' : ''} · ${escapeHtml(r.titulo || '…')}`;
    const tipos = [['tarea', 'tarea.'], ['evento', 'evento.'], ['gasto', 'gasto.'], ...(apartadoVisible('compra') ? [['compra', 'compra.']] : []), ['nota', 'nota.']];
    caja.innerHTML = `<div class="apuntar-resumen">${desc}</div>
        <div class="apuntar-como"><span>como:</span>${tipos.map(([k, t]) => `<button type="button" class="${k === tipo ? 'activa' : ''}" onclick="apuntarTipoElegido='${k}';pintarVistaApunte()">${t}</button>`).join('')}</div>`;
}

function openApuntar(fecha) {
    apuntarFechaBase = fecha || null;
    apuntarTipoElegido = null;
    const accesos = [
        ['tarea.', 'tarea', `closeModal();plannerDayOffset=${Math.min(2, Math.max(0, Math.round((new Date((fecha || todayISO()) + 'T12:00:00') - new Date(currentPlannerDayKey() + 'T12:00:00')) / 864e5)))};openAddPlannerItem()`],
        ['evento.', 'evento', `closeModal();openNewEntry('event');${fecha ? `setTimeout(()=>{const f=document.getElementById('modal-date');if(f)f.value='${fecha}'},60)` : ''}`],
        ['gasto.', 'gasto', 'closeModal();openFinanceProQuickCaptureModal()'],
        ['nota.', 'nota', 'closeModal();openWriteNote()'],
        ...(apartadoVisible('compra') ? [['compra.', 'compra', "closeModal();(mobileStandaloneActive?mobileIr:switchView)('compra')"]] : []),
        ['rutina.', 'rutina', 'closeModal();openAddHabit()'],
        ['ocio.', 'ocio', "closeModal();openNewEntry('book')"],
        ['viaje.', 'viaje', "closeModal();openNewEntry('travel')"],
    ];
    showModal(`
        <div class="modal-title">apuntar${fecha && fecha !== todayISO() ? ` para ${apuntarFechaTexto(fecha)}` : ''}.</div>
        <textarea id="apuntar-texto" class="modal-input apuntar-texto" rows="2" placeholder="gimnasio mañana a las 19, café 2,40 €, comprar pan..." oninput="pintarVistaApunte()" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();guardarApunte()}"></textarea>
        <div id="apuntar-vista" class="apuntar-vista"></div>
        <button class="btn-modal-primary" onclick="guardarApunte()">apuntar.</button>
        <div class="apuntar-o">o elige qué quieres apuntar</div>
        <div class="apuntar-rejilla">${accesos.map(([t, icono, accion]) => `<button onclick="${accion}"><i>${APUNTAR_ICONOS[icono]}</i><span>${t}</span></button>`).join('')}</div>
        <button class="m-enlace apuntar-todos" onclick="closeModal();window._dayPrefillDate=apuntarFechaBase;openCommandPalette('create');window._dayPrefillDate=apuntarFechaBase">todos los tipos.</button>
    `);
    pintarVistaApunte();
    setTimeout(() => document.getElementById('apuntar-texto')?.focus(), 60);
}

async function guardarApunte() {
    const texto = document.getElementById('apuntar-texto')?.value || '';
    if (!texto.trim()) { showToast('Escribe qué quieres apuntar', true); return; }
    const r = interpretarApunte(texto);
    const tipo = apuntarTipo(r);
    const id = p => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let aviso = '';
    if (tipo === 'gasto') {
        if (!(r.importe > 0)) { showToast('Falta el importe (por ejemplo, 2,40 €)', true); return; }
        const ultima = [...(financePro.transactions || [])].reverse().find(t => t.manual && t.account)?.account;
        const cuenta = FINANCE_PRO_ACCOUNT_KEYS.includes(ultima) ? ultima : FINANCE_PRO_ACCOUNT_KEYS.includes('bancos') ? 'bancos' : FINANCE_PRO_ACCOUNT_KEYS[0];
        financePro.transactions.push({ id: id('ptx_q'), date: r.fechaDicha ? r.fecha : todayISO(), account: cuenta, type: r.ingreso ? 'income' : 'expense', amount: r.importe, note: r.titulo || undefined, needsReview: true, manual: true });
        aviso = `${r.ingreso ? 'Ingreso' : 'Gasto'} de ${financeMoney(r.importe)} en ${financePro.accounts[cuenta]?.name || cuenta}. Ponle categoría en Finanzas.`;
    } else if (tipo === 'compra') {
        closeModal();
        compraAnadir(r.titulo || texto);
        showToast('Añadido a la lista de la compra');
        return;
    } else if (tipo === 'nota') {
        const hoy = todayISO();
        let nota = notes.find(n => n.date === hoy);
        if (!nota) { nota = { id: 'note_' + Date.now(), date: hoy, content: '', createdAt: new Date().toISOString() }; notes.push(nota); }
        nota.content = [nota.content, (r.nota ? texto.replace(/^\s*(?:nota|idea|apunte)\s*:\s*/i, '') : texto).trim()].filter(Boolean).join('\n\n');
        aviso = 'Añadido a la nota de hoy';
    } else {
        if (!r.titulo) { showToast('Falta qué es (por ejemplo, «gimnasio»)', true); return; }
        const dias = Math.round((new Date(r.fecha + 'T12:00:00') - new Date(currentPlannerDayKey() + 'T12:00:00')) / 864e5);
        if (tipo === 'tarea' && dias >= 0 && dias <= 2) {
            plannerItemsForOffset(dias).push({ id: id('planner'), time: r.hora, title: r.titulo, notes: '', done: false });
            aviso = `Tarea para ${apuntarFechaTexto(r.fecha)}${r.hora ? ' a las ' + r.hora : ''}`;
        } else {
            entries.push({ id: id('evt'), type: 'event', categoryId: getCategoryIdForType('event'), tags: [], eventType: 'otro', title: r.titulo, date: r.fecha, time: r.hora, place: '', notes: '' });
            filteredEntries = [...entries];
            aviso = `Evento el ${apuntarFechaTexto(r.fecha)}${r.hora ? ' a las ' + r.hora : ''}`;
        }
    }
    closeModal();
    invalidarCachesDerivadas();
    render();
    showToast(aviso);
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}

const APUNTAR_ICONOS = {
    tarea: '<svg viewBox="0 0 100 100" fill="currentColor"><circle cx="17" cy="22" r="9"/><rect x="34" y="16" width="58" height="12" rx="6"/><circle cx="17" cy="50" r="9"/><rect x="34" y="44" width="46" height="12" rx="6"/><circle cx="17" cy="78" r="9"/><rect x="34" y="72" width="52" height="12" rx="6"/></svg>',
    evento: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M24 8h12v10h28V8h12v10h6a10 10 0 0 1 10 10v54a10 10 0 0 1-10 10H18A10 10 0 0 1 8 82V28a10 10 0 0 1 10-10h6zM20 40v40h60V40z"/><rect x="30" y="50" width="16" height="16" rx="4"/></svg>',
    gasto: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M50 6a44 44 0 1 1 0 88 44 44 0 0 1 0-88zM30 38v11h40V38zm0 16v11h40V54z"/></svg>',
    nota: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M18 6h48l22 22v56a10 10 0 0 1-10 10H18A10 10 0 0 1 8 84V16A10 10 0 0 1 18 6zm6 40v10h52V46zm0 20v10h40V66zM60 10v24h24z"/></svg>',
    compra: '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M6 12h16l12 50h48l10-36H32l-3-14z"/><circle cx="40" cy="82" r="8"/><circle cx="76" cy="82" r="8"/></svg>',
    rutina: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M50 6a44 44 0 1 1 0 88 44 44 0 0 1 0-88zm0 14a30 30 0 1 0 0 60 30 30 0 0 0 0-60z"/><circle cx="50" cy="50" r="12"/></svg>',
    ocio: '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M10 14h34a10 10 0 0 1 10 10v66a8 8 0 0 0-8-8H10zM90 14H62a8 8 0 0 0-8 8v68a8 8 0 0 1 8-8h28z"/></svg>',
    viaje: '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M50 4l10 34 32 14v10L58 52 54 80l10 8v8L50 90l-14 6v-8l10-8-4-28-34 10V52l32-14z"/></svg>',
};
