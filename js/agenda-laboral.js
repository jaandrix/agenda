// ============================================================
//  AGENDA LABORAL (dentro de Empleo)
//  El horario de trabajo de cada día de la semana y las citas del trabajo
//  (reuniones, turnos, plazos) en un calendario propio, más sobrio que el
//  principal. Un interruptor decide si todo eso pasa también al calendario
//  principal (Home, el inicio del móvil...) o se queda solo aquí.
//  Datos: `agendaLaboral` (sincronizado) = { enPrincipal, horario: { 1: {
//  ini, fin }, ... } (0 domingo … 6 sábado), citas: [{ id, fecha, ini, fin,
//  titulo, tipo, lugar, notas }] }.
// ============================================================
const LAB_TIPOS = { reunion: 'reunión', turno: 'turno', plazo: 'plazo', otro: 'otro' };
const LAB_DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
let labMes = null;

function datosLaboral() {
    if (!agendaLaboral || typeof agendaLaboral !== 'object') agendaLaboral = { enPrincipal: true, horario: {}, citas: [] };
    if (!agendaLaboral.horario || typeof agendaLaboral.horario !== 'object') agendaLaboral.horario = {};
    if (!Array.isArray(agendaLaboral.citas)) agendaLaboral.citas = [];
    if (agendaLaboral.enPrincipal === undefined) agendaLaboral.enPrincipal = true;
    return agendaLaboral;
}

function laboralEnPrincipal() { return !agendaLaboral || agendaLaboral.enPrincipal !== false; }
function horarioLaboralDefinido() { return !!agendaLaboral && Object.keys(agendaLaboral.horario || {}).length > 0; }
function horarioLaboralDia(iso) { return agendaLaboral?.horario?.[new Date(iso + 'T12:00:00').getDay()] || null; }
function citasLaborales(iso) { return (agendaLaboral?.citas || []).filter(c => c.fecha === iso).sort((a, b) => (a.ini || '').localeCompare(b.ini || '')); }

// Las citas entran en el calendario principal como eventos de la
// categoría Trabajo; su id empieza por "lab_" para que al pulsarlas se
// abra su propia ficha y no la de una entrada.
function citasLaboralesCalendario(iso) {
    if (!laboralEnPrincipal()) return [];
    return citasLaborales(iso).map(c => ({ id: c.id, type: 'event', title: c.titulo || LAB_TIPOS[c.tipo] || 'trabajo', date: iso, time: c.ini || '', endTime: c.fin || '', place: c.lugar || '', notes: c.notas || '', categoryId: 'cat_trabajo', _laboral: true }));
}

function labEmpleoActual() {
    const hoy = isoLocal(new Date());
    return entries.find(e => e.type === 'work' && (!e.endDate || e.endDate >= hoy)) || null;
}

function renderAgendaLaboral() {
    const a = datosLaboral();
    const hoy = isoLocal(new Date());
    if (!labMes) { const d = new Date(); labMes = { y: d.getFullYear(), m: d.getMonth() }; }
    const { y, m } = labMes;
    const huecos = (new Date(y, m, 1).getDay() + 6) % 7;
    const diasMes = new Date(y, m + 1, 0).getDate();
    const celdas = [];
    for (let i = 0; i < huecos; i++) celdas.push('<div class="lab-celda fuera"></div>');
    for (let dia = 1; dia <= diasMes; dia++) {
        const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        const w = new Date(iso + 'T12:00:00').getDay();
        const h = horarioLaboralDia(iso);
        const citas = citasLaborales(iso);
        const clases = ['lab-celda', iso === hoy ? 'hoy' : '', iso < hoy ? 'pasado' : '', w === 0 || w === 6 ? 'finde' : '', h || citas.length ? 'con' : ''].filter(Boolean).join(' ');
        celdas.push(`<button class="${clases}" onclick="openDiaLaboral('${iso}')" aria-label="${dia} de ${new Date(y, m, 1).toLocaleDateString('es-ES', { month: 'long' })}">
            <span class="lab-num">${dia}</span>
            ${h ? `<span class="lab-turno">${h.ini}–${h.fin}</span>` : ''}
            ${citas.slice(0, 3).map(c => `<span class="lab-cita lab-${c.tipo || 'otro'}">${c.ini ? `<i>${c.ini}</i> ` : ''}${escapeHtml(c.titulo || LAB_TIPOS[c.tipo] || '')}</span>`).join('')}
            ${citas.length > 3 ? `<span class="lab-mas">+${citas.length - 3}</span>` : ''}
        </button>`);
    }
    while (celdas.length % 7) celdas.push('<div class="lab-celda fuera"></div>');
    const proximas = a.citas.filter(c => c.fecha >= hoy).sort((p, q) => (p.fecha + (p.ini || '')).localeCompare(q.fecha + (q.ini || ''))).slice(0, 4);
    const mes = new Date(y, m, 1).toLocaleDateString('es-ES', { month: 'long' });
    return `
    <section class="lab">
        <header class="lab-cab">
            <div>
                <div class="lab-sobre">agenda laboral.</div>
                <div class="lab-mes">${mes} <span>${y}</span></div>
            </div>
            <div class="lab-controles">
                <button class="lab-btn" onclick="labCambiarMes(-1)" aria-label="Mes anterior">‹</button>
                <button class="lab-btn" onclick="labMes=null;render()">hoy.</button>
                <button class="lab-btn" onclick="labCambiarMes(1)" aria-label="Mes siguiente">›</button>
                <span class="lab-sep"></span>
                <button class="lab-btn" onclick="openHorarioLaboral()">horario.</button>
                <button class="lab-btn lab-btn-principal" onclick="openCitaLaboral()">+ cita.</button>
            </div>
        </header>
        <div class="lab-letras">${['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map(l => `<span>${l}</span>`).join('')}</div>
        <div class="lab-rejilla">${celdas.join('')}</div>
        <footer class="lab-pie">
            <div class="lab-proximas">
                <div class="lab-sobre">próximas.</div>
                ${proximas.length ? proximas.map(c => `<button class="lab-proxima" onclick="openCitaLaboral('${c.id}')"><span>${new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}${c.ini ? ` · ${c.ini}` : ''}</span><b>${escapeHtml(c.titulo || LAB_TIPOS[c.tipo])}</b><em>${LAB_TIPOS[c.tipo] || ''}</em></button>`).join('') : '<div class="lab-nada">Ninguna cita por delante.</div>'}
            </div>
            <div class="lab-interruptor">
                <span><b>en el calendario principal.</b><small>${a.enPrincipal ? 'Tu horario y tus citas de trabajo salen también en Home y en el inicio.' : 'Tu horario y tus citas de trabajo solo se ven aquí.'}</small></span>
                <button class="finance-pro-switch ${a.enPrincipal ? 'on' : ''}" onclick="alternarLaboralPrincipal()" aria-label="Mostrar en el calendario principal"><span class="finance-pro-switch-knob"></span></button>
            </div>
        </footer>
    </section>`;
}

function labCambiarMes(dir) {
    const d = new Date(labMes.y, labMes.m + dir, 1);
    labMes = { y: d.getFullYear(), m: d.getMonth() };
    render();
}

async function guardarLaboral(mensaje) {
    try { await saveData(); if (mensaje) showToast(mensaje); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}

function alternarLaboralPrincipal() {
    const a = datosLaboral();
    a.enPrincipal = !a.enPrincipal;
    render();
    guardarLaboral(a.enPrincipal ? 'Tu trabajo vuelve al calendario principal' : 'Tu trabajo ya solo se ve en Empleo');
}

function openDiaLaboral(iso) {
    const h = horarioLaboralDia(iso);
    const citas = citasLaborales(iso);
    const titulo = new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    showModal(`
        <div class="modal-title">${titulo}.</div>
        <div class="lab-dia">
            <div class="lab-dia-fila lab-dia-horario"><span>horario.</span><b>${h ? `${h.ini} – ${h.fin}` : 'no trabajas este día.'}</b></div>
            ${citas.map(c => `<button class="lab-dia-fila" onclick="openCitaLaboral('${c.id}')"><span>${c.ini || '—'}${c.fin ? `–${c.fin}` : ''}</span><b>${escapeHtml(c.titulo || LAB_TIPOS[c.tipo])}</b><em>${LAB_TIPOS[c.tipo] || ''}${c.lugar ? ` · ${escapeHtml(c.lugar)}` : ''}</em></button>`).join('')}
        </div>
        <button class="btn-modal-primary" onclick="openCitaLaboral(null,'${iso}')">+ cita este día.</button>
    `);
}

function openCitaLaboral(id, fecha) {
    const c = id ? datosLaboral().citas.find(x => x.id === id) : null;
    window._labTipo = c?.tipo || 'reunion';
    showModal(`
        <div class="modal-title">${c ? 'editar cita.' : 'nueva cita de trabajo.'}</div>
        <div class="profe-dias-elegir">${Object.entries(LAB_TIPOS).map(([k, v]) => `<button type="button" class="profe-chip ${window._labTipo === k ? 'activa' : ''}" onclick="window._labTipo='${k}';this.parentNode.querySelectorAll('.profe-chip').forEach(b=>b.classList.toggle('activa',b===this))">${v}.</button>`).join('')}</div>
        <div class="modal-label">qué</div>
        <input id="lab-titulo" class="modal-input" value="${escapeHtml(c?.titulo || '')}" placeholder="Reunión de equipo, turno de tarde, entrega del informe...">
        <div class="modal-label">cuándo</div>
        <input id="lab-fecha" class="modal-input" type="date" value="${c?.fecha || fecha || isoLocal(new Date())}">
        <div class="lab-horas">
            <div><div class="modal-label">de</div><input id="lab-ini" class="modal-input" type="time" value="${c?.ini || ''}"></div>
            <div><div class="modal-label">a</div><input id="lab-fin" class="modal-input" type="time" value="${c?.fin || ''}"></div>
        </div>
        <div class="modal-label">dónde</div>
        <input id="lab-lugar" class="modal-input" value="${escapeHtml(c?.lugar || '')}" placeholder="Sala 2, Teams, oficina central...">
        <div class="modal-label">notas</div>
        <textarea id="lab-notas" class="modal-input" rows="2">${escapeHtml(c?.notas || '')}</textarea>
        <button class="btn-modal-primary" onclick="guardarCitaLaboral('${c?.id || ''}')">guardar.</button>
        ${c ? `<button class="btn-secondary" style="margin-top:8px;color:#dc2626" onclick="borrarCitaLaboral('${c.id}')">eliminar cita.</button>` : ''}
    `);
    setTimeout(() => document.getElementById('lab-titulo')?.focus(), 50);
}

function guardarCitaLaboral(id) {
    const val = k => document.getElementById(k)?.value.trim() || '';
    const fecha = val('lab-fecha');
    if (!fecha) { showToast('Elige el día', true); return; }
    const datos = { fecha, ini: val('lab-ini'), fin: val('lab-fin'), titulo: val('lab-titulo'), tipo: window._labTipo || 'otro', lugar: val('lab-lugar'), notas: val('lab-notas') };
    if (!datos.titulo && datos.tipo !== 'turno') { showToast('Escribe qué es', true); return; }
    const a = datosLaboral();
    const c = id && a.citas.find(x => x.id === id);
    if (c) Object.assign(c, datos);
    else a.citas.push({ id: 'lab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), ...datos });
    const d = new Date(fecha + 'T12:00:00');
    labMes = { y: d.getFullYear(), m: d.getMonth() };
    closeModal();
    render();
    guardarLaboral(c ? 'Cita actualizada' : 'Cita guardada');
}

function borrarCitaLaboral(id) {
    if (!confirm('¿Eliminar esta cita?')) return;
    const a = datosLaboral();
    a.citas = a.citas.filter(x => x.id !== id);
    closeModal();
    render();
    guardarLaboral('Cita eliminada');
}

function openHorarioLaboral() {
    const a = datosLaboral();
    const empleo = labEmpleoActual();
    const base = horarioLaboralDefinido() ? a.horario : Object.fromEntries([1, 2, 3, 4, 5].map(w => [w, { ini: empleo?.startTime || '09:00', fin: empleo?.endTime || '17:00' }]));
    showModal(`
        <div class="modal-title">horario laboral.</div>
        <p class="finance-modal-note" style="margin-top:0">Los días que trabajas y a qué horas. Sale cada día en la agenda laboral${a.enPrincipal ? ' y en el calendario principal' : ''}. Los cambios puntuales (un turno distinto, una guardia) apúntalos como cita de tipo turno.</p>
        <div class="lab-horario">${[1, 2, 3, 4, 5, 6, 0].map(w => {
            const h = base[w];
            return `<div class="lab-horario-fila ${h ? '' : 'apagado'}" data-dia="${w}">
                <button type="button" class="profe-chip ${h ? 'activa' : ''}" onclick="this.classList.toggle('activa');this.parentNode.classList.toggle('apagado')">${LAB_DIAS[w]}</button>
                <input class="modal-input" type="time" value="${h?.ini || '09:00'}" aria-label="Entrada el ${LAB_DIAS[w]}">
                <span>a</span>
                <input class="modal-input" type="time" value="${h?.fin || '17:00'}" aria-label="Salida el ${LAB_DIAS[w]}">
            </div>`;
        }).join('')}</div>
        <button class="btn-modal-primary" onclick="guardarHorarioLaboral()">guardar.</button>
    `);
}

function guardarHorarioLaboral() {
    const horario = {};
    document.querySelectorAll('.lab-horario-fila').forEach(f => {
        if (f.classList.contains('apagado')) return;
        const [ini, fin] = [...f.querySelectorAll('input')].map(i => i.value);
        if (ini && fin) horario[f.dataset.dia] = { ini, fin };
    });
    datosLaboral().horario = horario;
    closeModal();
    render();
    guardarLaboral('Horario guardado');
}
