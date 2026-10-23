// ============================================================
//  SEMANA DE EJEMPLO (primer día)
//  Quien empieza puede verla con una semana inventada para ver desde el
//  primer minuto cómo se conecta todo: «tu día», Conexiones, en qué se va
//  el dinero, el examen en el calendario... Es opcional (se elige en la
//  bienvenida). Todo lo de ejemplo lleva `ejemplo: true` y un id que
//  contiene «ejemplo_»; «empezar con lo mío.» borra solo eso y deja lo que
//  la persona haya apuntado mientras tanto (por eso no hay un «borrar todo»).
// ============================================================
const esEjemplo = x => !!x && (x.ejemplo === true || String(x.id || '').includes('ejemplo_') || String(x.linkedItemId || '').includes('ejemplo_'));

function hayEjemplo() {
    return entries.some(esEjemplo) || (financePro?.transactions || []).some(esEjemplo) || habits.some(esEjemplo) || notes.some(esEjemplo)
        || (studies?.subjects || []).some(esEjemplo) || (dayPlanner.backlog || []).some(esEjemplo)
        || Object.values(dayPlanner.days || {}).some(l => Array.isArray(l) && l.some(esEjemplo));
}

function cargarEjemplo(perfil) {
    const hoy = new Date();
    const dia = n => { const d = new Date(hoy); d.setDate(d.getDate() + n); return isoLocal(d); };
    const delMes = n => { const d = new Date(hoy); d.setDate(Math.max(1, Math.min(hoy.getDate(), hoy.getDate() + n))); return isoLocal(d); };
    const id = k => 'ejemplo_' + k;
    const evento = (k, title, date, time, eventType, extra = {}) => ({ id: id(k), ejemplo: true, type: 'event', categoryId: getCategoryIdForType('event'), tags: [], title, date, time, eventType, place: '', notes: '', ...extra });

    entries.push(
        evento('cena', 'Cena con Marta', dia(-2), '21:00', 'social', { place: 'La Tasca, Zaragoza', notes: 'Hablamos del viaje a Lisboa.' }),
        evento('dentista', 'Dentista', dia(1), '10:30', 'salud'),
        evento('padel', 'Pádel con Dani', dia(3), '19:00', 'deportes'),
        { id: id('lisboa'), ejemplo: true, type: 'travel', categoryId: getCategoryIdForType('travel'), tags: [], title: 'Lisboa', destination: 'Lisboa', startDate: dia(20), endDate: dia(23), date: dia(20), companions: 'Marta', notes: 'Vuelo de ida el viernes por la tarde.' },
    );
    if (perfil !== 'estudiante') entries.push(evento('reunion', 'Reunión de equipo', dia(2), '09:30', 'trabajo'));

    const tarea = (k, title, time) => ({ id: id(k), ejemplo: true, time, title, notes: '', done: false });
    (dayPlanner.days[dia(0)] = Array.isArray(dayPlanner.days[dia(0)]) ? dayPlanner.days[dia(0)] : []).push(tarea('seguro', 'Llamar al seguro', '12:00'), tarea('regalo', 'Comprar el regalo de Marta', '18:00'));
    (dayPlanner.days[dia(1)] = Array.isArray(dayPlanner.days[dia(1)]) ? dayPlanner.days[dia(1)] : []).push(tarea('mochila', 'Preparar la mochila de pádel', '20:00'));
    (dayPlanner.backlog = dayPlanner.backlog || []).unshift({ id: id('dni'), ejemplo: true, title: 'Renovar el DNI', notes: '', done: false });

    const cuenta = financePro.accounts?.bancos ? 'bancos' : Object.keys(financePro.accounts || {})[0] || 'bancos';
    const cat = c => financeProCategoryById(c) ? c : undefined;
    const mov = (k, date, amount, category, note, extra = {}) => ({ id: id(k), ejemplo: true, date, account: cuenta, type: 'expense', amount, category: cat(category), note, manual: true, ...extra });
    financePro.transactions.push(
        { id: id('sueldo'), ejemplo: true, date: delMes(-40), account: cuenta, type: 'income', amount: 1350, category: cat('cat_sueldo'), note: 'Nómina', manual: true },
        mov('cena', dia(-2) < delMes(-40) ? delMes(-40) : dia(-2), 34.2, 'cat_comida', 'La Tasca'),
        mov('super', delMes(-4), 46.8, 'cat_comida', 'Supermercado'),
        mov('gasolina', delMes(-6), 40, 'cat_gasolina', 'Gasolinera'),
        mov('cine', delMes(-8), 9.5, 'cat_ocio', 'Cine'),
        mov('farmacia', delMes(-1), 12.3, 'cat_salud', 'Farmacia'),
        mov('vuelo', delMes(-3), 89, 'cat_viajes', 'Vuelo a Lisboa', { viaje: true, viajeId: id('lisboa') }),
    );

    notes.push({ id: id('nota'), ejemplo: true, date: dia(-2), content: 'Cena con Marta en La Tasca. Hablamos del viaje a Lisboa: ella mira el alojamiento y yo los vuelos.', createdAt: new Date().toISOString() });
    habits.push({ id: id('leer'), ejemplo: true, texto: 'Leer 20 minutos', activo: true, completadas: { [dia(-2)]: true, [dia(-1)]: true } });

    if (perfil !== 'trabajador') {
        const examen = { id: id('examen'), title: 'Parcial, temas 1 a 4', date: dia(6), time: '09:00', grade: '', weight: '40', done: false };
        const asig = { id: id('historia'), ejemplo: true, name: 'Historia', color: '#6E8FA8', creditos: null, exams: [examen], assignments: [], cuatrimestre: typeof cuatriParaAsignaturaNueva === 'function' ? cuatriParaAsignaturaNueva() : undefined };
        studies.subjects.push(asig);
        syncExamCalendarEvent(asig, 'exams', examen);
    }
    filteredEntries = [...entries];
    if (typeof invalidarCachesDerivadas === 'function') invalidarCachesDerivadas();
}

function quitarEjemplo() {
    entries = entries.filter(e => !esEjemplo(e));
    filteredEntries = [...entries];
    financePro.transactions = financePro.transactions.filter(t => !esEjemplo(t));
    habits = habits.filter(h => !esEjemplo(h));
    notes = notes.filter(n => !esEjemplo(n));
    studies.subjects = studies.subjects.filter(s => !esEjemplo(s));
    dayPlanner.backlog = (dayPlanner.backlog || []).filter(t => !esEjemplo(t));
    Object.keys(dayPlanner.days || {}).forEach(d => { if (Array.isArray(dayPlanner.days[d])) dayPlanner.days[d] = dayPlanner.days[d].filter(t => !esEjemplo(t)); });
    if (typeof invalidarCachesDerivadas === 'function') invalidarCachesDerivadas();
}

function openEmpezarConLoMio() {
    showModal(`
        <div class="modal-title">empezar con lo mío.</div>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:var(--text-secondary)">Se borra solo la semana de ejemplo (la cena con Marta, el viaje a Lisboa, los gastos inventados...). Lo que hayas apuntado tú se queda.</p>
        <button class="btn-modal-primary" onclick="confirmarEmpezarConLoMio()">borrar el ejemplo.</button>
        <button class="btn-secondary" style="margin-top:8px" onclick="closeModal()">seguir mirando.</button>`);
}

async function confirmarEmpezarConLoMio() {
    quitarEjemplo();
    closeModal();
    render();
    showToast('Listo: ya es todo tuyo');
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}

// Franja fija mientras haya ejemplo: se ve en todas las vistas (escritorio y móvil) sin depender de cómo se pinta cada una.
function actualizarFranjaEjemplo() {
    let franja = document.getElementById('ejemplo-franja');
    const hay = hayEjemplo();
    document.body.classList.toggle('con-ejemplo', hay);
    if (!hay) { franja?.remove(); return; }
    if (franja) return;
    franja = document.createElement('div');
    franja.id = 'ejemplo-franja';
    franja.setAttribute('role', 'status');
    franja.innerHTML = '<span><b>estás viendo una semana de ejemplo.</b> Toca lo que quieras: está para que veas cómo se conecta todo.</span><button type="button" onclick="openEmpezarConLoMio()">empezar con lo mío.</button>';
    document.body.appendChild(franja);
}
