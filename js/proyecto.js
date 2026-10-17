// ============================================================
//  GESTOR DE UN PROYECTO (dentro de Proyectos)
//  Cada proyecto se abre en su propio gestor, como los viajes:
//    resumen.  la colina (Basecamp: cuesta arriba aún se decide cómo,
//              cuesta abajo ya solo es hacer), el siguiente paso, el
//              progreso y la fecha límite
//    tareas.   por fases (como los encabezados de Things), con estado
//              (pendiente / en marcha / hecha), fecha y "→ hoy" al
//              planificador; al completarla allí, se completa aquí
//    fases.    hitos con fecha y su avance
//    diario.   decisiones y avances con fecha: la bitácora del proyecto
//  Datos en la propia entrada del proyecto: tareas [{ id, texto, estado,
//  fecha, faseId, notas }], fases [{ id, nombre, fecha, hecha }], diario
//  [{ id, fecha, texto }], colina (0 a 1) y siguienteId. `tasks` (lo que
//  usan la ficha, el conector y las estadísticas) se mantiene al día.
// ============================================================
let proyectoAbierto = null;
let proyectoPestana = 'resumen';
let proyectoVerHechas = false;

const PROYECTO_ESTADOS = { pendiente: 'pendiente.', curso: 'en marcha.', hecha: 'hecha.' };
const PROYECTO_COLINA = [[0.08, 'pensando.'], [0.28, 'probando.'], [0.5, 'decidido.'], [0.72, 'haciendo.'], [0.93, 'rematando.']];

function proyId(p) { return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function proyectoDatos(p) {
    if (!Array.isArray(p.tareas)) p.tareas = (p.tasks || []).map(t => ({ id: proyId('pt'), texto: t.text || '', estado: t.done ? 'hecha' : 'pendiente' }));
    else (p.tasks || []).forEach(t => {
        // Lo que añada o complete el conector (que usa `tasks`) entra aquí.
        const ya = p.tareas.find(x => x.texto === t.text);
        if (!ya && t.text) p.tareas.push({ id: proyId('pt'), texto: t.text, estado: t.done ? 'hecha' : 'pendiente' });
        else if (ya && t.done && ya.estado !== 'hecha') ya.estado = 'hecha';
    });
    if (!Array.isArray(p.fases)) p.fases = [];
    if (!Array.isArray(p.diario)) p.diario = [];
    return p;
}

function proyectoActual() {
    const p = entries.find(e => e.id === proyectoAbierto && e.type === 'project');
    return p ? proyectoDatos(p) : null;
}

async function guardarProyecto(p) {
    if (p) p.tasks = p.tareas.map(t => ({ text: t.texto, done: t.estado === 'hecha' }));
    render();
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}

function abrirProyecto(id) {
    proyectoAbierto = id;
    proyectoPestana = 'resumen';
    if (currentView !== 'projects') {
        if (typeof mobileStandaloneActive !== 'undefined' && mobileStandaloneActive) mobileIr('projects'); else switchView('projects');
    } else render();
}

function cerrarProyecto() {
    proyectoAbierto = null;
    render();
}

// El siguiente paso es el marcado a mano o, si no hay, la primera tarea en
// marcha y luego la primera pendiente.
function proyectoSiguiente(p) {
    proyectoDatos(p);
    const vivas = p.tareas.filter(t => t.estado !== 'hecha');
    return vivas.find(t => t.id === p.siguienteId) || vivas.find(t => t.estado === 'curso') || vivas[0] || null;
}

function proyectoProgreso(p) {
    proyectoDatos(p);
    const total = p.tareas.length, hechas = p.tareas.filter(t => t.estado === 'hecha').length;
    return { total, hechas, pct: total ? Math.round(hechas / total * 100) : 0 };
}

// ---- Colina ----
function proyectoColinaSvg(valor, grande) {
    const W = 300, H = 96, y0 = 84;
    const y = x => y0 - 70 * Math.exp(-Math.pow((x - 0.5) / 0.2, 2));
    const pts = Array.from({ length: 61 }, (_, i) => { const x = i / 60; return `${(x * W).toFixed(1)},${y(x).toFixed(1)}`; }).join(' ');
    const marca = valor == null ? '' : `<circle cx="${(valor * W).toFixed(1)}" cy="${y(valor).toFixed(1)}" r="${grande ? 9 : 7}" class="proy-colina-marca"/>`;
    return `<svg viewBox="-10 0 320 ${H}" class="proy-colina-svg" aria-hidden="true"><line x1="150" y1="10" x2="150" y2="${y0}" class="proy-colina-mitad"/><polyline points="${pts}" class="proy-colina-linea"/>${marca}</svg>`;
}

function proyectoPonerColina(valor) {
    const p = proyectoActual();
    if (!p) return;
    p.colina = valor;
    if (projectStatusBucket(p.status) === 'Pendiente' && valor > 0) p.status = 'En progreso';
    guardarProyecto(p);
}

// ---- Tareas ----
function proyectoAnadirTareas(texto, faseId) {
    const p = proyectoActual();
    if (!p || !String(texto || '').trim()) return;
    String(texto).split('\n').map(x => x.trim()).filter(Boolean).forEach(t => p.tareas.push({ id: proyId('pt'), texto: t, estado: 'pendiente', faseId: faseId || null }));
    guardarProyecto(p);
    setTimeout(() => document.querySelector('#mobile-shell #proy-nueva, #content #proy-nueva')?.focus(), 0);
}

function proyectoCambiarEstado(tid) {
    const p = proyectoActual();
    const t = p?.tareas.find(x => x.id === tid);
    if (!t) return;
    t.estado = t.estado === 'pendiente' ? 'curso' : t.estado === 'curso' ? 'hecha' : 'pendiente';
    if (t.estado === 'hecha' && p.siguienteId === tid) delete p.siguienteId;
    guardarProyecto(p);
}

function proyectoMarcarSiguiente(tid) {
    const p = proyectoActual();
    if (!p) return;
    p.siguienteId = p.siguienteId === tid ? null : tid;
    guardarProyecto(p);
}

function proyectoSiguienteHecho() {
    const p = proyectoActual();
    const t = p && proyectoSiguiente(p);
    if (!t) return;
    t.estado = 'hecha';
    delete p.siguienteId;
    showToast('Hecho. ' + (proyectoSiguiente(p) ? 'Ya tienes el siguiente.' : 'No quedan tareas.'));
    guardarProyecto(p);
}

// Lleva la tarea a la línea de hoy del planificador. Al marcarla allí como
// hecha, se marca también aquí (ver togglePlannerItemDone).
function proyectoAHoy(pid, tid) {
    const p = entries.find(e => e.id === pid);
    const t = p && proyectoDatos(p).tareas.find(x => x.id === tid);
    if (!t) return;
    const hoy = plannerItemsForOffset(0);
    if (hoy.some(it => it.proyectoTareaId === tid)) { showToast('Ya está en el planificador de hoy'); return; }
    hoy.push({ id: 'planner_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), time: '', title: `${p.title}: ${t.texto}`, notes: '', done: false, proyectoId: pid, proyectoTareaId: tid });
    if (t.estado === 'pendiente') t.estado = 'curso';
    showToast('Añadido a hoy en el planificador');
    guardarProyecto(p);
}

function proyectoTareaDesdePlanner(pid, tid, hecha) {
    const p = entries.find(e => e.id === pid);
    const t = p && proyectoDatos(p).tareas.find(x => x.id === tid);
    if (!t) return;
    t.estado = hecha ? 'hecha' : 'curso';
    p.tasks = p.tareas.map(x => ({ text: x.texto, done: x.estado === 'hecha' }));
}

function openProyectoTarea(tid) {
    const p = proyectoActual();
    const t = p?.tareas.find(x => x.id === tid);
    if (!t) return;
    showModal(`
        <div class="modal-title">tarea.</div>
        <div class="modal-label">Tarea</div>
        <input id="pt-texto" class="modal-input" value="${escapeHtml(t.texto)}">
        <div class="modal-row">
            <div><div class="modal-label">Estado</div><select id="pt-estado" class="modal-input">${Object.entries(PROYECTO_ESTADOS).map(([k, v]) => `<option value="${k}" ${t.estado === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
            <div><div class="modal-label">Fecha</div><input id="pt-fecha" type="date" class="modal-input" value="${t.fecha || ''}"></div>
        </div>
        <div class="modal-label">Fase</div>
        <select id="pt-fase" class="modal-input"><option value="">sin fase.</option>${p.fases.map(f => `<option value="${f.id}" ${t.faseId === f.id ? 'selected' : ''}>${escapeHtml(f.nombre)}</option>`).join('')}</select>
        <div class="modal-label">Notas</div>
        <textarea id="pt-notas" class="modal-input" rows="3">${escapeHtml(t.notas || '')}</textarea>
        <button class="btn-modal-primary" onclick="guardarProyectoTarea('${tid}')">guardar.</button>
        <button class="btn-secondary" style="margin-top:8px" onclick="closeModal();proyectoAHoy('${p.id}','${tid}')">→ hoy.</button>
        <button class="btn-secondary" style="margin-top:8px;color:#dc2626" onclick="borrarProyectoTarea('${tid}')">eliminar tarea.</button>
    `);
}

function guardarProyectoTarea(tid) {
    const p = proyectoActual();
    const t = p?.tareas.find(x => x.id === tid);
    if (!t) return;
    const texto = document.getElementById('pt-texto')?.value.trim();
    if (!texto) { showToast('Escribe la tarea', true); return; }
    Object.assign(t, { texto, estado: document.getElementById('pt-estado')?.value || 'pendiente', fecha: document.getElementById('pt-fecha')?.value || '', faseId: document.getElementById('pt-fase')?.value || null, notas: document.getElementById('pt-notas')?.value.trim() || '' });
    closeModal();
    guardarProyecto(p);
}

function borrarProyectoTarea(tid) {
    const p = proyectoActual();
    if (!p) return;
    p.tareas = p.tareas.filter(x => x.id !== tid);
    if (p.siguienteId === tid) delete p.siguienteId;
    closeModal();
    guardarProyecto(p);
}

// ---- Fases ----
function proyectoAnadirFase() {
    const p = proyectoActual();
    const nombre = document.getElementById('proy-fase-nombre')?.value.trim();
    if (!p || !nombre) { showToast('Ponle un nombre a la fase', true); return; }
    p.fases.push({ id: proyId('pf'), nombre, fecha: document.getElementById('proy-fase-fecha')?.value || '', hecha: false });
    guardarProyecto(p);
}

function proyectoFase(fid, accion) {
    const p = proyectoActual();
    const i = p ? p.fases.findIndex(f => f.id === fid) : -1;
    if (i < 0) return;
    if (accion === 'hecha') p.fases[i].hecha = !p.fases[i].hecha;
    else if (accion === 'subir' && i > 0) [p.fases[i - 1], p.fases[i]] = [p.fases[i], p.fases[i - 1]];
    else if (accion === 'quitar') {
        if (!confirm('¿Quitar esta fase? Sus tareas se quedan, sin fase.')) return;
        p.tareas.forEach(t => { if (t.faseId === fid) t.faseId = null; });
        p.fases.splice(i, 1);
    }
    guardarProyecto(p);
}

// ---- Diario ----
function proyectoApuntar() {
    const p = proyectoActual();
    const texto = document.getElementById('proy-diario')?.value.trim();
    if (!p || !texto) return;
    p.diario.unshift({ id: proyId('pd'), fecha: todayISO(), texto });
    guardarProyecto(p);
}

function proyectoQuitarApunte(id) {
    const p = proyectoActual();
    if (!p) return;
    p.diario = p.diario.filter(d => d.id !== id);
    guardarProyecto(p);
}

// ---- Vista ----
function proyectoFechaCorta(iso) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
}

function renderProyectoTarea(p, t) {
    const sig = proyectoSiguiente(p);
    const vencida = t.fecha && t.fecha < todayISO() && t.estado !== 'hecha';
    return `<div class="proy-tarea estado-${t.estado}">
        <button class="proy-estado" onclick="proyectoCambiarEstado('${t.id}')" aria-label="Cambiar estado: ${PROYECTO_ESTADOS[t.estado]}" title="${PROYECTO_ESTADOS[t.estado]}"></button>
        <button class="proy-tarea-txt" onclick="openProyectoTarea('${t.id}')"><b>${escapeHtml(t.texto)}</b>${t.fecha || t.notas ? `<span class="${vencida ? 'vencida' : ''}">${[t.fecha ? proyectoFechaCorta(t.fecha) : '', t.notas ? 'con notas' : ''].filter(Boolean).join(', ')}</span>` : ''}</button>
        ${t.estado !== 'hecha' ? `<button class="proy-icono ${sig?.id === t.id ? 'on' : ''}" onclick="proyectoMarcarSiguiente('${t.id}')" title="Siguiente paso" aria-label="Marcar como siguiente paso">★</button><button class="proy-hoy" onclick="proyectoAHoy('${p.id}','${t.id}')">→ hoy</button>` : ''}
    </div>`;
}

function renderProyectoResumen(p) {
    const { total, hechas, pct } = proyectoProgreso(p);
    const sig = proyectoSiguiente(p);
    const hoy = todayISO();
    const dias = p.endDate ? Math.round((new Date(p.endDate + 'T12:00:00') - new Date(hoy + 'T12:00:00')) / 864e5) : null;
    const curso = p.tareas.filter(t => t.estado === 'curso').length;
    const colinaTxt = p.colina == null ? '¿dónde está? toca abajo.' : p.colina < 0.5 ? 'cuesta arriba: aún decidiendo cómo.' : p.colina < 0.6 ? 'en la cima: ya sabes cómo hacerlo.' : 'cuesta abajo: ya solo es hacer.';
    return `
        <div class="proy-bloque proy-siguiente">
            <div class="proy-etiqueta">siguiente paso.</div>
            ${sig ? `<div class="proy-siguiente-txt">${escapeHtml(sig.texto)}</div>
                <div class="proy-botones"><button class="btn-modal-primary" onclick="proyectoSiguienteHecho()">hecho.</button><button class="btn-secondary" onclick="proyectoAHoy('${p.id}','${sig.id}')">→ hoy.</button></div>`
                : `<div class="proy-siguiente-txt proy-vacio">${total ? 'Todo hecho. Apunta lo siguiente en tareas.' : 'Escribe la primera tarea: la más pequeña que te haga avanzar.'}</div>
                <div class="proy-botones"><button class="btn-secondary" onclick="proyectoPestana='tareas';render()">+ tarea.</button></div>`}
        </div>
        <div class="proy-bloque">
            <div class="proy-etiqueta">la colina. <span>${colinaTxt}</span></div>
            ${proyectoColinaSvg(p.colina, true)}
            <div class="proy-colina-botones">${PROYECTO_COLINA.map(([v, t]) => `<button class="${p.colina != null && Math.abs(p.colina - v) < 0.05 ? 'activa' : ''}" onclick="proyectoPonerColina(${v})">${t}</button>`).join('')}</div>
        </div>
        <div class="proy-cifras">
            <div><b>${pct}<small>%</small></b><span>${hechas} de ${total} tareas.</span></div>
            <div><b>${curso}</b><span>en marcha.</span></div>
            <div><b>${dias == null ? '—' : dias < 0 ? `${-dias}` : dias}</b><span>${dias == null ? 'sin fecha límite.' : dias < 0 ? 'días de retraso.' : dias === 0 ? 'vence hoy.' : 'días para la fecha.'}</span></div>
        </div>
        ${p.fases.length ? `<div class="proy-bloque"><div class="proy-etiqueta">fases.</div>${p.fases.map(f => {
            const ts = p.tareas.filter(t => t.faseId === f.id), h = ts.filter(t => t.estado === 'hecha').length;
            return `<div class="proy-fase-mini ${f.hecha ? 'hecha' : ''}"><span>${escapeHtml(f.nombre)}</span><i><em style="width:${f.hecha ? 100 : ts.length ? h / ts.length * 100 : 0}%"></em></i><small>${f.fecha ? proyectoFechaCorta(f.fecha) : ''}</small></div>`;
        }).join('')}</div>` : ''}
        ${p.description ? `<div class="proy-bloque"><div class="proy-etiqueta">de qué va.</div><p class="proy-desc">${escapeHtml(p.description)}</p></div>` : ''}
        ${p.diario[0] ? `<div class="proy-bloque"><div class="proy-etiqueta">último apunte. <span>${proyectoFechaCorta(p.diario[0].fecha)}</span></div><p class="proy-desc">${escapeHtml(p.diario[0].texto)}</p></div>` : ''}`;
}

function renderProyectoTareas(p) {
    const grupos = [...p.fases.map(f => ({ id: f.id, nombre: f.nombre })), { id: null, nombre: p.fases.length ? 'sin fase' : '' }];
    const hechas = p.tareas.filter(t => t.estado === 'hecha');
    const visibles = t => proyectoVerHechas || t.estado !== 'hecha';
    return `
        <div class="compra-anadir">
            <input id="proy-nueva" class="modal-input" placeholder="+ tarea (pega varias, una por línea)" onkeydown="if(event.key==='Enter'){event.preventDefault();proyectoAnadirTareas(this.value, document.getElementById('proy-nueva-fase')?.value)}" autocomplete="off">
            ${p.fases.length ? `<select id="proy-nueva-fase" class="modal-input proy-select"><option value="">sin fase.</option>${p.fases.filter(f => !f.hecha).map(f => `<option value="${f.id}">${escapeHtml(f.nombre)}</option>`).join('')}</select>` : ''}
            <button class="btn-modal-primary" onclick="proyectoAnadirTareas(document.getElementById('proy-nueva').value, document.getElementById('proy-nueva-fase')?.value)">añadir.</button>
        </div>
        <div class="proy-leyenda"><span class="proy-estado-mini estado-pendiente"></span>pendiente. <span class="proy-estado-mini estado-curso"></span>en marcha. <span class="proy-estado-mini estado-hecha"></span>hecha. Toca el círculo para avanzarla.</div>
        ${grupos.map(g => {
            const ts = p.tareas.filter(t => (t.faseId || null) === g.id && visibles(t));
            if (!ts.length && g.id === null) return '';
            return `<div class="proy-grupo">${g.nombre ? `<div class="proy-grupo-cab">${escapeHtml(g.nombre.toLowerCase())}.</div>` : ''}${ts.map(t => renderProyectoTarea(p, t)).join('') || '<div class="proy-vacio">Nada pendiente en esta fase.</div>'}</div>`;
        }).join('')}
        ${!p.tareas.length ? '<div class="compra-vacio"><b>parte el proyecto en pasos.</b>Cada tarea, algo que se pueda hacer en una sentada. Agrúpalas en fases si el proyecto es largo, y marca con ★ la siguiente.</div>' : ''}
        ${hechas.length ? `<button class="est-enlace proy-ver-hechas" onclick="proyectoVerHechas=!proyectoVerHechas;render()">${proyectoVerHechas ? 'ocultar' : 'ver'} ${hechas.length === 1 ? 'la hecha' : `las ${hechas.length} hechas`}.</button>` : ''}`;
}

function renderProyectoFases(p) {
    return `
        <div class="compra-anadir">
            <input id="proy-fase-nombre" class="modal-input" placeholder="Nueva fase: diseño, primera versión..." autocomplete="off" onkeydown="if(event.key==='Enter')proyectoAnadirFase()">
            <input id="proy-fase-fecha" type="date" class="modal-input proy-select">
            <button class="btn-modal-primary" onclick="proyectoAnadirFase()">añadir.</button>
        </div>
        ${p.fases.length ? p.fases.map((f, i) => {
            const ts = p.tareas.filter(t => t.faseId === f.id), h = ts.filter(t => t.estado === 'hecha').length;
            return `<div class="proy-fase ${f.hecha ? 'hecha' : ''}">
                <button class="compra-check ${f.hecha ? 'on' : ''}" onclick="proyectoFase('${f.id}','hecha')" aria-label="Fase completada"></button>
                <div class="proy-fase-txt"><b>${i + 1}. ${escapeHtml(f.nombre)}</b><span>${[f.fecha ? proyectoFechaCorta(f.fecha) : 'sin fecha', `${h} de ${ts.length} tareas`].join(', ')}.</span><i><em style="width:${f.hecha ? 100 : ts.length ? h / ts.length * 100 : 0}%"></em></i></div>
                <button class="proy-icono" onclick="proyectoFase('${f.id}','subir')" aria-label="Subir">↑</button>
                <button class="proy-icono" onclick="proyectoFase('${f.id}','quitar')" aria-label="Quitar"><i class='ico ico-x' aria-hidden=true></i></button>
            </div>`;
        }).join('') : '<div class="compra-vacio"><b>las etapas del proyecto.</b>Divide el camino en fases con su fecha (idea, diseño, primera versión, entrega...). Las tareas se agrupan por fase y cada una muestra su avance.</div>'}`;
}

function renderProyectoDiario(p) {
    return `
        <textarea id="proy-diario" class="modal-input" rows="3" placeholder="Qué has decidido, qué has hecho, qué te ha frenado..."></textarea>
        <button class="btn-modal-primary proy-apuntar" onclick="proyectoApuntar()">apuntar.</button>
        ${p.diario.length ? p.diario.map(d => `<div class="proy-apunte"><div class="proy-apunte-cab"><span>${new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</span><button class="est-quitar" onclick="proyectoQuitarApunte('${d.id}')" aria-label="Quitar"><i class='ico ico-x' aria-hidden=true></i></button></div><p>${escapeHtml(d.texto).replace(/\n/g, '<br>')}</p></div>`).join('')
            : '<div class="compra-vacio"><b>la bitácora del proyecto.</b>Apunta las decisiones y los avances según pasan. Dentro de un mes sabrás por qué hiciste cada cosa.</div>'}`;
}

function renderGestorProyecto(p) {
    proyectoDatos(p);
    const pestanas = [['resumen', 'resumen.'], ['tareas', `tareas.${p.tareas.length ? ` <small>${p.tareas.filter(t => t.estado !== 'hecha').length}</small>` : ''}`], ['fases', `fases.${p.fases.length ? ` <small>${p.fases.length}</small>` : ''}`], ['diario', 'diario.']];
    const cuerpo = proyectoPestana === 'tareas' ? renderProyectoTareas(p) : proyectoPestana === 'fases' ? renderProyectoFases(p) : proyectoPestana === 'diario' ? renderProyectoDiario(p) : renderProyectoResumen(p);
    return `<div class="proy">
        <button class="est-enlace" onclick="cerrarProyecto()">← proyectos.</button>
        <div class="proy-cab">
            <div>
                <div class="proy-titulo">${escapeHtml(p.title)}</div>
                <div class="compra-sub">${escapeHtml([p.projectCategory, projectStatusBucket(p.status).toLowerCase(), p.endDate ? 'hasta el ' + proyectoFechaCorta(p.endDate) : ''].filter(Boolean).join(', '))}.</div>
            </div>
            <button class="pedido-btn" onclick="openEditEntry('${p.id}')">editar.</button>
        </div>
        <div class="compra-listas est-pestanas">${pestanas.map(([k, t]) => `<button class="profe-chip ${proyectoPestana === k ? 'activa' : ''}" onclick="proyectoPestana='${k}';render()">${t}</button>`).join('')}</div>
        ${cuerpo}
    </div>`;
}

// Bloque del planificador: el siguiente paso de cada proyecto en marcha,
// para llevarlo a hoy sin entrar en Proyectos.
function renderSiguientesPasos() {
    if (typeof apartadoVisible === 'function' && !apartadoVisible('projects')) return '';
    const filas = entries.filter(e => e.type === 'project' && projectStatusBucket(e.status) !== 'Completado')
        .map(p => ({ p, t: proyectoSiguiente(p) })).filter(x => x.t);
    if (!filas.length) return '';
    const hoy = plannerItemsForOffset(0);
    return `<div class="planner-backlog proy-pasos">
        <div class="planner-backlog-head"><div class="planner-backlog-title">siguientes pasos.</div></div>
        ${filas.map(({ p, t }) => `<div class="planner-backlog-row">
            <div class="planner-backlog-row-body" onclick="abrirProyecto('${p.id}')" style="cursor:pointer"><div class="planner-backlog-row-title">${escapeHtml(t.texto)}</div><div class="planner-backlog-row-notes">${escapeHtml(p.title)}</div></div>
            ${hoy.some(it => it.proyectoTareaId === t.id) ? '<span class="proy-en-hoy">en hoy.</span>' : `<button class="proy-hoy" onclick="proyectoAHoy('${p.id}','${t.id}')">→ hoy</button>`}
        </div>`).join('')}
    </div>`;
}
