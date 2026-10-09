// ============================================================
//  PROFESORADO (vista 'profesorado', apartado opcional)
//  El cuadrante del curso para quien da clase, como la hoja de cálculo
//  que muchos profesores ya usan: una columna por clase, una fila por día
//  y en cada casilla lo que se quiere hacer ese día con esa clase. Cada
//  casilla puede tener varias tareas, cada una con su casilla de hecho
//  (dada / por dar) o sin ella (avisos, "festivo", notas). Las tareas se
//  arrastran de un día a otro, y lo que se quedó por dar antes de hoy
//  aparece como aviso para colocarlo en otro día o descartarlo.
//  Datos: `profesorado` (sincronizado) = {
//    clases: [{ id, nombre, materia, color, dias: [1..6] }],
//    sesiones: [{ id, claseId, fecha, titulo, hecha: true | false | null,
//                 descartada?, orden? }]   (hecha null = sin casilla),
//    festivos: ['AAAA-MM-DD'], nombresFestivos: { fecha: motivo },
//    curso: { inicio, fin } }.
// ============================================================
const PROFE_DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const PROFE_LETRAS = ['', 'L', 'M', 'X', 'J', 'V', 'S'];
const PROFE_COLORES = ['#e07a3f', '#3f7be0', '#3a9e64', '#c94f7c', '#8a63d2', '#cf9f22', '#2aa5a0', '#8b6f55'];
let profeDesde = null;
let profeSemanas = 0;
let profeIrAHoy = false;
let profeVista = 'cuadrante';
let profePendAbierto = null;

function datosProfe() {
    if (!profesorado || typeof profesorado !== 'object') profesorado = { clases: [], sesiones: [], festivos: [] };
    if (!Array.isArray(profesorado.clases)) profesorado.clases = [];
    if (!Array.isArray(profesorado.sesiones)) profesorado.sesiones = [];
    if (!Array.isArray(profesorado.festivos)) profesorado.festivos = [];
    profesorado.clases.forEach((c, i) => { if (!c.color) c.color = PROFE_COLORES[i % PROFE_COLORES.length]; });
    return profesorado;
}

function profeSumar(iso, n) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return isoLocal(d);
}

function profeLunes(iso) {
    const d = new Date(iso + 'T12:00:00');
    return profeSumar(iso, -((d.getDay() + 6) % 7));
}

function profeFecha(iso, conDia = false) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', conDia ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' });
}

function profeFechaCorta(iso) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

function profeEsFestivo(iso) { return datosProfe().festivos.includes(iso); }

// Sin días marcados, la clase cuenta de lunes a viernes. Los festivos no
// cuentan para ninguna.
function profeEsLectivo(clase, iso) {
    if (profeEsFestivo(iso)) return false;
    const w = new Date(iso + 'T12:00:00').getDay();
    const dias = clase.dias || [];
    return dias.length ? dias.includes(w) : w >= 1 && w <= 5;
}

function profeSesiones(claseId, fecha) {
    return datosProfe().sesiones.filter(s => s.claseId === claseId && s.fecha === fecha).sort((a, b) => (a.orden || 0) - (b.orden || 0));
}

function profeClase(id) { return datosProfe().clases.find(c => c.id === id) || null; }
function profeConCasilla(s) { return s.hecha === true || s.hecha === false; }
function profeEsPendiente(s, hoy = isoLocal(new Date())) { return s.hecha === false && !s.descartada && s.fecha < hoy; }

function profePendientes() {
    const hoy = isoLocal(new Date());
    const p = datosProfe();
    return p.sesiones
        .filter(s => profeEsPendiente(s, hoy) && p.clases.some(c => c.id === s.claseId))
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function profeSiguienteHueco(clase, desde, ignorarId) {
    let d = desde;
    for (let i = 0; i < 500; i++, d = profeSumar(d, 1)) {
        if (profeEsLectivo(clase, d) && !profeSesiones(clase.id, d).some(s => s.id !== ignorarId && s.hecha !== null)) return d;
    }
    return desde;
}

function profeProximosDias(clase, desde, n) {
    const dias = [];
    let d = desde;
    for (let i = 0; i < 400 && dias.length < n; i++, d = profeSumar(d, 1)) if (profeEsLectivo(clase, d)) dias.push(d);
    return dias;
}

function profeNuevoId() { return 'ses_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }

// ------------------------------------------------------------
//  VISTA
// ------------------------------------------------------------
function profeRangoDias() {
    const p = datosProfe();
    const hoy = isoLocal(new Date());
    let desde, hasta;
    if (profeSemanas === 0) {
        const fechas = p.sesiones.map(s => s.fecha).sort();
        const primera = [p.curso?.inicio, fechas[0], hoy].filter(Boolean).sort()[0];
        desde = profeLunes(primera);
        hasta = [p.curso?.fin, fechas[fechas.length - 1], profeSumar(hoy, 28)].filter(Boolean).sort().pop();
    } else {
        if (!profeDesde) profeDesde = profeLunes(hoy);
        desde = profeDesde;
        hasta = profeSumar(desde, profeSemanas * 7 - 1);
    }
    const sabado = p.clases.some(c => (c.dias || []).includes(6));
    const dias = [];
    for (let d = desde; d <= hasta; d = profeSumar(d, 1)) {
        const w = new Date(d + 'T12:00:00').getDay();
        if (w === 0 || (w === 6 && !sabado)) continue;
        dias.push(d);
    }
    return dias;
}

function renderProfesorado() {
    const p = datosProfe();
    const hoy = isoLocal(new Date());
    if (!p.clases.length) return `
        <div class="uni-vista profe">
            <div class="uni-vacio">
                <div class="uni-titulo">profesorado.</div>
                <p>El cuadrante de tu curso: tus clases arriba, los días hacia abajo y en cada casilla lo que quieres hacer ese día con esa clase. Lo que no te dé tiempo a dar te lo recuerda al día siguiente, y cualquier tarea se arrastra a otro día cuando cambies de idea.</p>
                <div class="profe-botones">
                    <button class="btn-modal-primary" onclick="openClaseProfe()">añadir mi primera clase.</button>
                    <button class="pedido-btn" onclick="openImportarProfe()">ya tengo un cuadrante.</button>
                </div>
            </div>
        </div>`;
    const dias = profeRangoDias();
    const conCasilla = p.sesiones.filter(s => profeConCasilla(s) && !s.descartada && p.clases.some(c => c.id === s.claseId));
    const dadas = conCasilla.filter(s => s.hecha).length;
    // Al entrar en el apartado el cuadrante se abre con hoy en el centro;
    // al repintarlo después de un cambio, se queda donde estaba.
    const anterior = [...document.querySelectorAll('.profe-tabla-wrap')].find(m => m.offsetParent);
    const sitio = anterior ? [anterior.scrollTop, anterior.scrollLeft] : null;
    if (!sitio) profeIrAHoy = true;
    setTimeout(() => {
        const centrar = profeIrAHoy;
        profeIrAHoy = false;
        document.querySelectorAll('.profe-tabla-wrap').forEach(marco => {
            if (centrar) {
                const fila = marco.querySelector('tr.hoy') || marco.querySelector('tbody tr');
                if (fila) marco.scrollTop = Math.max(0, fila.offsetTop - marco.clientHeight / 2 + fila.offsetHeight / 2);
            } else if (sitio) [marco.scrollTop, marco.scrollLeft] = sitio;
        });
    }, 0);
    return `
    <div class="uni-vista profe">
        <div class="uni-cabecera">
            <div>
                <div class="uni-titulo">profesorado.</div>
                <div class="uni-sub">${p.clases.length} ${p.clases.length === 1 ? 'clase' : 'clases'} · ${dadas} de ${conCasilla.length} tareas hechas.</div>
            </div>
            <div class="profe-botones">
                <button class="pedido-btn solo-escritorio" onclick="openClaseProfe()">+ clase.</button>
                <button class="pedido-btn" onclick="openCalendarioProfe()">calendario escolar.</button>
                <button class="pedido-btn" onclick="openRepartirProfe()">repartir temario.</button>
                <button class="pedido-btn" onclick="openImportarProfe()">importar cuadrante.</button>
                <button class="pedido-btn" onclick="openExportarProfe()">exportar.</button>
            </div>
        </div>
        <div id="profe-pendientes">${renderPendientesProfe()}</div>
        ${renderMisClasesProfe()}
        <div class="profe-pestanas">${[['cuadrante', 'cuadrante.'], ['horario', 'horario semanal.']].map(([k, t]) => `<button class="profe-chip ${profeVista === k ? 'activa' : ''}" onclick="profeVista='${k}';profeIrAHoy=${k === 'cuadrante'};render()">${t}</button>`).join('')}</div>
        ${profeVista === 'horario' ? renderHorarioSemanalProfe() : `<div class="profe-cuadrante">
            <div class="profe-nav">
                ${profeSemanas ? `<button class="cal-nav-arrow" onclick="profeMover(-1)" aria-label="Antes">‹</button>` : ''}
                <span class="profe-rango">${profeFecha(dias[0])} — ${profeFecha(dias[dias.length - 1])}</span>
                ${profeSemanas ? `<button class="cal-nav-arrow" onclick="profeMover(1)" aria-label="Después">›</button>` : ''}
                <div class="profe-nav-der">
                    ${[[1, '1 semana'], [2, '2 semanas'], [4, '4 semanas'], [0, 'todo el curso']].map(([n, t]) => `<button class="profe-chip ${profeSemanas === n ? 'activa' : ''}" onclick="profeSemanas=${n};profeIrAHoy=${n === 0};render()">${t}</button>`).join('')}
                    <button class="profe-chip" onclick="profeDesde=null;profeIrAHoy=true;render()">hoy.</button>
                </div>
            </div>
            <div class="profe-tabla-wrap">
                <table class="profe-tabla">
                    <thead><tr><th class="profe-col-dia"></th>${p.clases.map(c => `<th style="--c:${c.color}"><button class="profe-clase" onclick="openFichaClaseProfe('${c.id}')"><b>${escapeHtml(c.nombre)}</b><small>${escapeHtml(c.materia || '')}${(c.dias || []).length ? `${c.materia ? ' · ' : ''}${c.dias.map(d => PROFE_LETRAS[d]).join(' ')}` : ''}</small></button></th>`).join('')}</tr></thead>
                    <tbody>${dias.map((d, f) => {
                        const w = new Date(d + 'T12:00:00').getDay();
                        const festivo = profeEsFestivo(d);
                        return `<tr class="${d === hoy ? 'hoy' : ''} ${d < hoy ? 'pasado' : ''} ${festivo ? 'festivo' : ''} ${w === 1 && f > 0 ? 'profe-semana-nueva' : ''}">
                            <th class="profe-col-dia"><button onclick="openDiaProfe('${d}')" title="${festivo ? 'Día sin clase' : '¿No hay clase este día?'}"><span>${d === hoy ? 'hoy.' : PROFE_DIAS[w]}</span>${Number(d.slice(8))}${d.slice(8) === '01' || f === 0 ? `<em>${new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { month: 'short' })}</em>` : ''}${festivo ? `<i>${escapeHtml((profeNombreFestivo(d) || 'no lectivo').toLowerCase())}.</i>` : ''}</button></th>
                            ${p.clases.map((c, ci) => renderCeldaProfe(c, d, f, ci, hoy)).join('')}
                        </tr>`;
                    }).join('')}</tbody>
                </table>
            </div>
            <div class="profe-pista">Escribe en una casilla y pulsa Intro para añadir la tarea. Arrastra una tarea por su asa para llevarla a otro día, toca su texto para editarla y su círculo para marcarla hecha. El lápiz de cada casilla guarda una nota de cómo fue esa clase. Pulsa un día si al final no hay clase (o si sí la hay): las tareas se corren solas.</div>
        </div>`}
    </div>`;
}

function renderItemProfe(s, c, hoy) {
    const estado = s.descartada ? 'descartada' : s.hecha === true ? 'hecha' : profeEsPendiente(s, hoy) ? 'pendiente' : s.hecha === null ? 'sin-casilla' : 'por-dar';
    return `<div class="profe-item ${estado}" style="--c:${c.color}" data-id="${s.id}">
        <span class="profe-asa" onpointerdown="profeArrastrar(event,'${s.id}')" aria-label="Arrastrar"><svg viewBox="0 0 100 100" fill="currentColor" aria-hidden="true"><circle cx="35" cy="22" r="9"/><circle cx="65" cy="22" r="9"/><circle cx="35" cy="50" r="9"/><circle cx="65" cy="50" r="9"/><circle cx="35" cy="78" r="9"/><circle cx="65" cy="78" r="9"/></svg></span>
        <button class="profe-item-txt" onclick="openSesionProfe('${s.id}')">${escapeHtml(s.titulo)}</button>
        ${profeConCasilla(s) && !s.descartada ? `<button class="profe-check ${s.hecha ? 'on' : ''}" onclick="profeHecha('${s.id}')" aria-label="${s.hecha ? 'Marcar por hacer' : 'Marcar hecha'}"></button>` : ''}
    </div>`;
}

function renderCeldaProfe(c, d, f, ci, hoy) {
    const items = profeSesiones(c.id, d);
    const lectiva = profeEsLectivo(c, d);
    const franjas = (c.horario || []).length && lectiva ? profeFranjasDia(c, d) : [];
    const nota = profeNotasDia()[`${c.id}|${d}`];
    const entregas = profeEntregasDia(c.id, d);
    return `<td class="profe-celda ${lectiva ? 'lectiva' : 'libre'}" data-clase="${c.id}" data-fecha="${d}" style="--c:${c.color}">
        <div class="profe-celda-cab">
            <span>${franjas.map(h => `${h.inicio}${h.aula ? ` · ${escapeHtml(h.aula)}` : ''}`).join(', ')}</span>
            <button class="profe-nota-btn ${nota ? 'con' : ''}" onclick="openNotaDiaProfe('${c.id}','${d}')" title="${nota ? escapeHtml(nota) : 'Nota de esta clase'}" aria-label="Nota de esta clase"><svg viewBox="0 0 100 100" fill="currentColor" aria-hidden="true"><path d="M70 8l22 22-52 52H18V60z"/><path d="M8 88h84v8H8z"/></svg></button>
        </div>
        ${entregas.map(x => `<button class="profe-entrega" onclick="openFichaClaseProfe('${c.id}','deberes')">entrega: ${escapeHtml(x.titulo)}</button>`).join('')}
        ${items.map(s => renderItemProfe(s, c, hoy)).join('')}
        <input class="profe-nueva" data-f="${f}" data-c="${ci}" onkeydown="profeTecla(event,this)" onchange="profeAnadir(this)" aria-label="Añadir tarea a ${escapeHtml(c.nombre)}, ${profeFecha(d, true)}">
    </td>`;
}

function repintarCeldaProfe(claseId, fecha) {
    const td = document.querySelector(`.profe-celda[data-clase="${claseId}"][data-fecha="${fecha}"]`);
    const c = profeClase(claseId);
    if (!td || !c) return;
    const input = td.querySelector('.profe-nueva');
    td.outerHTML = renderCeldaProfe(c, fecha, Number(input?.dataset.f), Number(input?.dataset.c), isoLocal(new Date()));
}

function renderPendientesProfe() {
    const pend = profePendientes();
    if (!pend.length) return '';
    const p = datosProfe();
    const porClase = p.clases.map(c => ({ c, items: pend.filter(s => s.claseId === c.id) })).filter(g => g.items.length);
    const abierto = profePendAbierto ?? pend.length <= 4;
    return `<details class="profe-pendientes" ${abierto ? 'open' : ''} ontoggle="profePendAbierto=this.open">
        <summary class="profe-aviso"><b>${pend.length === 1 ? 'Hay una tarea que no pudiste dar.' : `Hay ${pend.length} tareas que no pudiste dar.`}</b> Recuerda ponerlas en otro día o descártalas si ya no hacen falta. <span class="profe-aviso-ver"></span></summary>
        ${porClase.map(g => `
            <div class="profe-pend-grupo" style="--c:${g.c.color}">
                <div class="profe-pend-clase">${escapeHtml(g.c.nombre)}</div>
                ${g.items.map(s => `<div class="profe-pend-fila">
                    <div class="profe-pend-txt"><b>${escapeHtml(s.titulo)}</b><small>era para el ${profeFecha(s.fecha, true)}.</small></div>
                    <div class="profe-pend-botones">
                        <button class="pedido-btn pedido-btn-principal" onclick="openAsignarProfe('${s.id}')">asignar al día…</button>
                        <button class="pedido-btn" onclick="profeCorrer('${s.id}')" title="La pone en la próxima clase y retrasa una clase todo lo que venía detrás">correr el temario.</button>
                        <button class="pedido-btn" onclick="profeHecha('${s.id}')">ya está hecha.</button>
                        <button class="pedido-btn" onclick="profeDescartar('${s.id}')">descartar.</button>
                    </div>
                </div>`).join('')}
            </div>`).join('')}
    </details>`;
}

function profeResumenClase(c) {
    const hoy = isoLocal(new Date());
    const ses = datosProfe().sesiones.filter(s => s.claseId === c.id);
    const conCasilla = ses.filter(s => profeConCasilla(s) && !s.descartada);
    const proxima = ses.filter(s => s.fecha >= hoy && !s.descartada && s.hecha !== true).sort((a, b) => a.fecha.localeCompare(b.fecha))[0] || null;
    return {
        ses,
        dadas: conCasilla.filter(s => s.hecha).length,
        total: conCasilla.length,
        pendientes: ses.filter(s => profeEsPendiente(s, hoy)).length,
        proxima,
    };
}

function renderMisClasesProfe() {
    const p = datosProfe();
    return `<div class="profe-clases">
        <div class="uni-etiqueta">mis clases.</div>
        <div class="profe-clases-rejilla">${p.clases.map(c => {
            const r = profeResumenClase(c);
            const pct = r.total ? Math.round(r.dadas / r.total * 100) : 0;
            return `<button class="profe-tarjeta" style="--c:${c.color}" onclick="openFichaClaseProfe('${c.id}')">
                <span class="profe-tarjeta-cab"><b>${escapeHtml(c.nombre)}</b>${r.pendientes ? `<em>${r.pendientes} sin dar</em>` : ''}</span>
                <small>${escapeHtml(c.materia || 'sin materia')}${(c.dias || []).length ? ` · ${c.dias.map(d => PROFE_LETRAS[d]).join(' ')}` : ''}</small>
                <span class="profe-barra"><span style="width:${pct}%"></span></span>
                <small>${r.dadas} de ${r.total} hechas · ${profeAvance(c).estado}</small>
                ${r.proxima ? `<small>próxima: ${profeFechaCorta(r.proxima.fecha)}, ${escapeHtml(r.proxima.titulo)}</small>` : ''}
            </button>`;
        }).join('')}
            <button class="profe-tarjeta profe-tarjeta-nueva" onclick="openClaseProfe()"><b>+ clase.</b><small>Un grupo nuevo, con su color y sus días.</small></button>
        </div>
    </div>`;
}

function profeMover(dir) {
    profeDesde = profeSumar(profeDesde || profeLunes(isoLocal(new Date())), dir * 7 * profeSemanas);
    render();
}

async function guardarProfe(mensaje) {
    try { await saveData(); if (mensaje) showToast(mensaje); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}

function repintarProfeTrasCambio(...celdas) {
    if (currentView !== 'profesorado' || !document.querySelector('.profe-tabla')) { render(); return; }
    celdas.forEach(([claseId, fecha]) => repintarCeldaProfe(claseId, fecha));
    const bloque = document.getElementById('profe-pendientes');
    if (bloque) bloque.innerHTML = renderPendientesProfe();
    const clases = document.querySelector('.profe-clases');
    if (clases) clases.outerHTML = renderMisClasesProfe();
}

// ------------------------------------------------------------
//  ESCRIBIR EN EL CUADRANTE
//  Se repinta solo la casilla tocada, no el cuadrante: así la escritura
//  sigue en la casilla de abajo (Intro) o de al lado (Tab) sin perder el foco.
// ------------------------------------------------------------
function profeAnadir(input) {
    const td = input.closest('.profe-celda');
    const valor = input.value.trim();
    input.value = '';
    if (!td || !valor) return;
    const { clase: claseId, fecha } = td.dataset;
    const orden = profeSesiones(claseId, fecha).length;
    datosProfe().sesiones.push({ id: profeNuevoId(), claseId, fecha, titulo: valor, hecha: /^festivo\.?$/i.test(valor) ? null : false, orden });
    repintarProfeTrasCambio([claseId, fecha]);
    guardarProfe();
}

function profeTecla(e, input) {
    const f = Number(input.dataset.f), c = Number(input.dataset.c);
    if (e.key === 'Enter') {
        e.preventDefault();
        const tabla = input.closest('table');
        const conTexto = !!input.value.trim();
        profeAnadir(input);
        // Con texto, Intro añade y se queda en la misma casilla por si hay
        // más tareas ese día; con la casilla vacía baja a la de abajo.
        const destino = conTexto ? [f, c] : [f + (e.shiftKey ? -1 : 1), c];
        tabla?.querySelector(`input[data-f="${destino[0]}"][data-c="${destino[1]}"]`)?.focus();
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !input.value) {
        e.preventDefault();
        input.closest('table')?.querySelector(`input[data-f="${f + (e.key === 'ArrowDown' ? 1 : -1)}"][data-c="${c}"]`)?.focus();
    }
}

function profeHecha(id) {
    const s = datosProfe().sesiones.find(x => x.id === id);
    if (!s) return;
    s.hecha = s.hecha !== true;
    s.descartada = undefined;
    repintarProfeTrasCambio([s.claseId, s.fecha]);
    guardarProfe();
}

function profeDescartar(id) {
    const s = datosProfe().sesiones.find(x => x.id === id);
    if (!s) return;
    s.descartada = true;
    repintarProfeTrasCambio([s.claseId, s.fecha]);
    guardarProfe('Descartada. Sigue en su día, tachada.');
}

function profeMoverSesion(s, claseId, fecha) {
    const antes = [s.claseId, s.fecha];
    s.claseId = claseId;
    s.fecha = fecha;
    s.orden = profeSesiones(claseId, fecha).filter(x => x !== s).length;
    if (fecha >= isoLocal(new Date())) s.descartada = undefined;
    return antes;
}

// ------------------------------------------------------------
//  EMPUJAR Y ADELANTAR
//  Las tareas de una clase se mueven como vagones: cada día de tareas
//  ocupa la primera clase libre desde su fecha y, si ese día ya lo ha
//  cogido el anterior, empuja al siguiente, hasta que encuentra un hueco y
//  ahí se para. Lo hecho, lo descartado y lo que no lleva casilla (avisos,
//  excursiones) no se mueve, y sus días se saltan. Sirve para correr una
//  tarea atrasada y para cuando un día que era lectivo deja de serlo.
// ------------------------------------------------------------
const profeFija = x => x.hecha === true || x.hecha === null || x.descartada;

function profeEmpujarClase(c, desde, primera) {
    const deClase = datosProfe().sesiones.filter(x => x.claseId === c.id);
    const valido = d => profeEsLectivo(c, d) && !deClase.some(x => profeFija(x) && x.fecha === d);
    const siguiente = d => { for (let i = 0; i < 800 && !valido(d); i++) d = profeSumar(d, 1); return d; };
    const grupos = primera ? [{ fecha: desde, items: [primera] }] : [];
    deClase.filter(x => !profeFija(x) && x !== primera && x.fecha >= desde)
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.orden || 0) - (b.orden || 0))
        .forEach(x => {
            const g = grupos[grupos.length - 1];
            if (g && g.fecha === x.fecha && g.items[0] !== primera) g.items.push(x); else grupos.push({ fecha: x.fecha, items: [x] });
        });
    let previo = null, movidas = 0;
    grupos.forEach(g => {
        let d = siguiente(g.fecha);
        if (previo && d <= previo) d = siguiente(profeSumar(previo, 1));
        g.items.forEach((x, i) => { if (x.fecha !== d) movidas++; x.fecha = d; x.orden = i; });
        previo = d;
    });
    return movidas;
}

// Al revés: un día que pasa a tener clase se llena con lo de la clase
// siguiente, y cada día con lo de su siguiente, hasta el primer hueco.
function profeAdelantarClase(c, dia) {
    const deClase = datosProfe().sesiones.filter(x => x.claseId === c.id);
    const valido = d => profeEsLectivo(c, d) && !deClase.some(x => profeFija(x) && x.fecha === d);
    if (!valido(dia) || deClase.some(x => !profeFija(x) && x.fecha === dia)) return 0;
    const siguienteDe = d => { d = profeSumar(d, 1); for (let i = 0; i < 800 && !valido(d); i++) d = profeSumar(d, 1); return d; };
    let hueco = dia, movidas = 0;
    for (let i = 0; i < 400; i++) {
        const origen = siguienteDe(hueco);
        const items = deClase.filter(x => !profeFija(x) && x.fecha === origen);
        if (!items.length) break;
        items.forEach(x => { x.fecha = hueco; movidas++; });
        hueco = origen;
    }
    return movidas;
}

function profeCorrer(id) {
    const s = datosProfe().sesiones.find(x => x.id === id);
    const c = s && profeClase(s.claseId);
    if (!c) return;
    const movidas = profeEmpujarClase(c, isoLocal(new Date()), s);
    s.descartada = undefined;
    render();
    guardarProfe(`${c.nombre}: va el ${profeFecha(s.fecha, true)}${movidas > 1 ? ` y ${movidas - 1} más se corren una clase` : ''}.`);
}

// ------------------------------------------------------------
//  DÍAS NO LECTIVOS Y CALENDARIO ESCOLAR
// ------------------------------------------------------------
const PROFE_CALENDARIOS = {
    'zaragoza-2026-27': {
        nombre: 'Zaragoza, curso 2026-2027',
        fuente: 'Calendario escolar de Aragón (resolución de 29 de abril de 2025) y fiestas locales de Zaragoza.',
        inicio: { eso: '2026-09-08', bach: '2026-09-09', fp: '2026-09-10' },
        fin: '2027-06-18',
        dias: [
            ['2026-10-12', '2026-10-12', 'Fiesta nacional'],
            ['2026-10-13', '2026-10-14', 'No lectivo en Zaragoza'],
            ['2026-11-02', '2026-11-02', 'Todos los Santos'],
            ['2026-12-07', '2026-12-07', 'Día de la Constitución'],
            ['2026-12-08', '2026-12-08', 'Inmaculada'],
            ['2026-12-23', '2027-01-06', 'Navidad'],
            ['2027-01-29', '2027-01-29', 'San Valero (local)'],
            ['2027-03-05', '2027-03-05', 'Cincomarzada (local)'],
            ['2027-03-25', '2027-04-02', 'Semana Santa'],
            ['2027-04-23', '2027-04-23', 'Día de Aragón'],
            ['2027-05-03', '2027-05-03', 'No lectivo en Zaragoza'],
        ],
    },
};

function profeNombreFestivo(iso) { return datosProfe().nombresFestivos?.[iso] || ''; }

// Marca días como no lectivos y, si se pide, corre en cada clase lo que
// caía en ellos. Devuelve cuántas tareas se movieron.
function profeMarcarNoLectivos(fechas, nombre, correr) {
    const p = datosProfe();
    p.nombresFestivos = p.nombresFestivos || {};
    const nuevas = fechas.filter(f => !p.festivos.includes(f)).sort();
    nuevas.forEach(f => { p.festivos.push(f); if (nombre) p.nombresFestivos[f] = nombre; });
    if (!correr || !nuevas.length) return 0;
    return p.clases.reduce((n, c) => n + profeEmpujarClase(c, nuevas[0]), 0);
}

function openDiaProfe(fecha) {
    const p = datosProfe();
    const festivo = profeEsFestivo(fecha);
    const tareas = p.sesiones.filter(s => s.fecha === fecha && !profeFija(s)).length;
    showModal(`
        <div class="modal-title">${profeFecha(fecha, true)}.</div>
        ${festivo ? `
            <p class="finance-modal-note" style="margin-top:0">Marcado como no lectivo${profeNombreFestivo(fecha) ? `: <b>${escapeHtml(profeNombreFestivo(fecha))}</b>` : ''}. Si al final sí hay clase:</p>
            <button class="btn-modal-primary" onclick="profeQuitarNoLectivo('${fecha}',true)">hay clase, adelantar las tareas para aprovecharlo.</button>
            <button class="btn-secondary" style="margin-top:8px" onclick="profeQuitarNoLectivo('${fecha}',false)">hay clase, dejarlo libre.</button>
            <div class="finance-modal-note">Adelantar trae a este día lo de la clase siguiente de cada grupo, y así sucesivamente hasta el primer hueco.</div>` : `
            <p class="finance-modal-note" style="margin-top:0">¿Este día al final no hay clase? ${tareas ? `Tienes <b>${tareas} ${tareas === 1 ? 'tarea' : 'tareas'}</b> puesta${tareas === 1 ? '' : 's'} ese día.` : 'No tienes nada puesto ese día.'}</p>
            <div class="modal-label">motivo</div>
            <input id="profe-dia-nombre" class="modal-input" placeholder="Huelga, jornada del centro, evaluación...">
            <button class="btn-modal-primary" onclick="profePonerNoLectivo('${fecha}',true)">no lectivo, y correr las tareas una clase.</button>
            <button class="btn-secondary" style="margin-top:8px" onclick="profePonerNoLectivo('${fecha}',false)">no lectivo, sin mover nada.</button>
            <div class="finance-modal-note">Correr lleva cada tarea a la siguiente clase de su grupo, saltando fines de semana y festivos, y empuja a las de detrás hasta el primer hueco.</div>`}
    `);
}

function profePonerNoLectivo(fecha, correr) {
    const nombre = document.getElementById('profe-dia-nombre')?.value.trim() || 'No lectivo';
    const movidas = profeMarcarNoLectivos([fecha], nombre, correr);
    closeModal();
    render();
    guardarProfe(`${profeFecha(fecha, true)}: no lectivo${movidas ? `. ${movidas} ${movidas === 1 ? 'tarea corrida' : 'tareas corridas'}` : ''}.`);
}

function profeQuitarNoLectivo(fecha, adelantar) {
    const p = datosProfe();
    p.festivos = p.festivos.filter(f => f !== fecha);
    if (p.nombresFestivos) delete p.nombresFestivos[fecha];
    p.sesiones = p.sesiones.filter(s => !(s.fecha === fecha && s.hecha === null && /^(festivo|no lectivo)\.?$/i.test(s.titulo.trim())));
    const movidas = adelantar ? p.clases.reduce((n, c) => n + profeAdelantarClase(c, fecha), 0) : 0;
    closeModal();
    render();
    guardarProfe(`${profeFecha(fecha, true)}: hay clase${movidas ? `. ${movidas} ${movidas === 1 ? 'tarea adelantada' : 'tareas adelantadas'}` : ''}.`);
}

function openCalendarioProfe() {
    const p = datosProfe();
    const curso = p.curso || {};
    const festivos = [...p.festivos].sort();
    const porMes = {};
    festivos.forEach(f => (porMes[f.slice(0, 7)] = porMes[f.slice(0, 7)] || []).push(f));
    showModal(`
        <div class="modal-title">calendario escolar.</div>
        <p class="finance-modal-note" style="margin-top:0">Los días sin clase salen marcados en el cuadrante y se saltan al repartir, correr o asignar tareas. Puedes seguir escribiendo en ellos si lo necesitas.</p>
        <div class="profe-cal-preset">
            <b>${PROFE_CALENDARIOS['zaragoza-2026-27'].nombre}</b>
            <small>Festivos nacionales, de Aragón, los no lectivos de la provincia y las fiestas locales (San Valero y Cincomarzada: confírmalas en tu centro).</small>
            <div class="profe-dias-elegir">${[['eso', 'ESO (8 sep.)'], ['bach', 'Bachillerato (9 sep.)'], ['fp', 'FP (10 sep.)']].map(([k, t], i) => `<button type="button" class="profe-chip ${i === 0 ? 'activa' : ''}" data-etapa="${k}" onclick="this.parentNode.querySelectorAll('.profe-chip').forEach(b=>b.classList.toggle('activa',b===this))">${t}</button>`).join('')}</div>
            <label class="profe-check-linea"><input type="checkbox" id="profe-cal-correr" checked> si ya tienes tareas en esos días, correrlas a la siguiente clase.</label>
            <button class="btn-modal-primary" onclick="cargarCalendarioProfe('zaragoza-2026-27')">cargar este calendario.</button>
        </div>
        <div class="lab-horas">
            <div><div class="modal-label">empieza el curso</div><input id="profe-curso-inicio" class="modal-input" type="date" value="${curso.inicio || ''}" onchange="profeGuardarCurso()"></div>
            <div><div class="modal-label">acaba el curso</div><input id="profe-curso-fin" class="modal-input" type="date" value="${curso.fin || ''}" onchange="profeGuardarCurso()"></div>
        </div>
        <div class="modal-label">días sin clase</div>
        ${festivos.length ? Object.entries(porMes).map(([mes, dias]) => `
            <div class="profe-cal-mes">${new Date(mes + '-15T12:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</div>
            ${dias.map(f => `<button class="profe-cal-fila" onclick="openDiaProfe('${f}')"><span>${profeFechaCorta(f)}</span><b>${escapeHtml(profeNombreFestivo(f) || 'No lectivo')}</b><i>cambiar.</i></button>`).join('')}`).join('') : '<div class="profe-ficha-vacio">Ninguno todavía.</div>'}
        <div class="modal-label" style="margin-top:14px">añadir un día sin clase</div>
        <div class="lab-horas">
            <input id="profe-nl-fecha" class="modal-input" type="date">
            <input id="profe-nl-nombre" class="modal-input" placeholder="Motivo">
        </div>
        <button class="btn-secondary" onclick="profeAnadirNoLectivo()">añadir y correr las tareas de ese día.</button>
    `);
}

function profeGuardarCurso() {
    const p = datosProfe();
    p.curso = { inicio: document.getElementById('profe-curso-inicio')?.value || '', fin: document.getElementById('profe-curso-fin')?.value || '' };
    guardarProfe();
}

function profeAnadirNoLectivo() {
    const fecha = document.getElementById('profe-nl-fecha')?.value;
    if (!fecha) { showToast('Elige el día', true); return; }
    profeMarcarNoLectivos([fecha], document.getElementById('profe-nl-nombre')?.value.trim() || 'No lectivo', true);
    render();
    openCalendarioProfe();
    guardarProfe();
}

function cargarCalendarioProfe(clave) {
    const cal = PROFE_CALENDARIOS[clave];
    const p = datosProfe();
    const etapa = document.querySelector('.profe-cal-preset .profe-chip.activa')?.dataset.etapa || 'eso';
    const correr = document.getElementById('profe-cal-correr')?.checked;
    p.curso = { inicio: cal.inicio[etapa], fin: cal.fin };
    const antes = p.festivos.length;
    let movidas = 0;
    cal.dias.forEach(([desde, hasta, nombre]) => {
        const fechas = [];
        for (let d = desde; d <= hasta; d = profeSumar(d, 1)) {
            const w = new Date(d + 'T12:00:00').getDay();
            if (w !== 0 && w !== 6) fechas.push(d);
        }
        p.nombresFestivos = p.nombresFestivos || {};
        fechas.forEach(f => { if (!p.nombresFestivos[f]) p.nombresFestivos[f] = nombre; });
        movidas += profeMarcarNoLectivos(fechas, nombre, false);
    });
    const nuevos = p.festivos.length - antes;
    if (correr && nuevos) {
        const primero = cal.dias[0][0];
        movidas = p.clases.reduce((n, c) => n + profeEmpujarClase(c, primero), 0);
    }
    closeModal();
    render();
    guardarProfe(`${cal.nombre}: ${nuevos} ${nuevos === 1 ? 'día sin clase' : 'días sin clase'}${movidas ? `, ${movidas} ${movidas === 1 ? 'tarea corrida' : 'tareas corridas'}` : ''}.`);
}

// ------------------------------------------------------------
//  ARRASTRAR
//  Con el puntero (ratón y dedo a la vez) en vez de drag and drop nativo,
//  que en el iPhone no funciona. Se arrastra desde el asa, que lleva
//  touch-action:none para que el dedo no haga scroll mientras.
// ------------------------------------------------------------
function profeContenedorScroll(el) {
    for (let n = el?.parentElement; n; n = n.parentElement) {
        const oy = getComputedStyle(n).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
    }
    return document.scrollingElement;
}

function profeArrastrar(e, id) {
    const item = e.currentTarget.closest('.profe-item');
    const s = datosProfe().sesiones.find(x => x.id === id);
    if (!item || !s) return;
    e.preventDefault();
    const r = item.getBoundingClientRect();
    const fantasma = item.cloneNode(true);
    fantasma.classList.add('profe-fantasma');
    fantasma.style.width = r.width + 'px';
    document.body.appendChild(fantasma);
    item.classList.add('arrastrando');
    const marco = item.closest('.profe-tabla-wrap');
    const pagina = profeContenedorScroll(marco);
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    let destino = null, x = e.clientX, y = e.clientY, vivo = true;
    const colocar = () => { fantasma.style.transform = `translate(${x - dx}px, ${y - dy}px) rotate(-1.5deg)`; };
    colocar();
    const marcar = () => {
        const td = document.elementFromPoint(x, y)?.closest('.profe-celda');
        if (td === destino) return;
        destino?.classList.remove('destino');
        destino = td || null;
        destino?.classList.add('destino');
    };
    // Al acercarse a un borde, el cuadrante (o la página) se desplaza solo.
    const bucle = () => {
        if (!vivo) return;
        const m = marco.getBoundingClientRect();
        const borde = 48, paso = 14;
        if (x > m.right - borde) marco.scrollLeft += paso;
        else if (x < m.left + borde + 64) marco.scrollLeft -= paso;
        const vertical = marco.scrollHeight > marco.clientHeight ? marco : pagina;
        const v = vertical === marco ? m : { top: 0, bottom: innerHeight };
        if (y > v.bottom - borde) vertical.scrollTop += paso;
        else if (y < v.top + borde) vertical.scrollTop -= paso;
        marcar();
        requestAnimationFrame(bucle);
    };
    requestAnimationFrame(bucle);
    const mover = ev => { x = ev.clientX; y = ev.clientY; colocar(); marcar(); };
    const soltar = () => {
        vivo = false;
        window.removeEventListener('pointermove', mover);
        window.removeEventListener('pointerup', soltar);
        window.removeEventListener('pointercancel', soltar);
        fantasma.remove();
        item.classList.remove('arrastrando');
        destino?.classList.remove('destino');
        if (!destino) return;
        const { clase: claseId, fecha } = destino.dataset;
        if (claseId === s.claseId && fecha === s.fecha) return;
        const antes = profeMoverSesion(s, claseId, fecha);
        repintarProfeTrasCambio(antes, [claseId, fecha]);
        guardarProfe(`Movida al ${profeFecha(fecha, true)}${claseId !== antes[0] ? `, a ${profeClase(claseId).nombre}` : ''}.`);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
}

// ------------------------------------------------------------
//  MODALES DE TAREA
// ------------------------------------------------------------
function chipsDiasProfe(clase, desde, accion) {
    return profeProximosDias(clase, desde, 6).map(d => `<button type="button" class="profe-chip" onclick="${accion.replace('$D', d)}">${profeFechaCorta(d)}</button>`).join('');
}

function openAsignarProfe(id) {
    const s = datosProfe().sesiones.find(x => x.id === id);
    const c = s && profeClase(s.claseId);
    if (!c) return;
    const hoy = isoLocal(new Date());
    showModal(`
        <div class="modal-title">asignar al día.</div>
        <p class="finance-modal-note" style="margin-top:0"><b>${escapeHtml(s.titulo)}</b>, de ${escapeHtml(c.nombre)}, era para el ${profeFecha(s.fecha, true)}. Elige cuándo darla.</p>
        <div class="modal-label">próximas clases de ${escapeHtml(c.nombre)}</div>
        <div class="profe-dias-elegir">${chipsDiasProfe(c, hoy, `profeAsignar('${s.id}','$D')`)}</div>
        <div class="modal-label">u otro día</div>
        <input id="profe-asignar-fecha" class="modal-input" type="date" min="${hoy}" value="${profeSiguienteHueco(c, hoy, s.id)}">
        <button class="btn-modal-primary" onclick="profeAsignar('${s.id}',document.getElementById('profe-asignar-fecha').value)">asignar.</button>
    `);
}

function profeAsignar(id, fecha) {
    const s = datosProfe().sesiones.find(x => x.id === id);
    if (!s || !fecha) return;
    profeMoverSesion(s, s.claseId, fecha);
    s.descartada = undefined;
    closeModal();
    render();
    guardarProfe(`Asignada al ${profeFecha(fecha, true)}.`);
}

function openSesionProfe(id) {
    const p = datosProfe();
    const s = p.sesiones.find(x => x.id === id);
    const c = s && profeClase(s.claseId);
    if (!c) return;
    const estado = s.descartada ? 'descartada' : s.hecha === true ? 'hecha' : s.hecha === null ? 'sin' : 'pendiente';
    window._profeEstado = estado;
    showModal(`
        <div class="modal-title">tarea.</div>
        <div class="modal-label">qué</div>
        <textarea id="profe-ses-titulo" class="modal-input" rows="2">${escapeHtml(s.titulo)}</textarea>
        <div class="modal-label">estado</div>
        <div class="profe-dias-elegir">${[['pendiente', 'por hacer.'], ['hecha', 'hecha.'], ['sin', 'sin casilla.'], ['descartada', 'descartada.']].map(([k, t]) => `<button type="button" class="profe-chip ${estado === k ? 'activa' : ''}" onclick="window._profeEstado='${k}';this.parentNode.querySelectorAll('.profe-chip').forEach(b=>b.classList.toggle('activa',b===this))">${t}</button>`).join('')}</div>
        <div class="finance-modal-note">«sin casilla.» es para lo que no se marca como hecho: un aviso, un festivo, una nota.</div>
        <div class="modal-label">clase</div>
        <select id="profe-ses-clase" class="modal-input">${p.clases.map(x => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${escapeHtml(x.nombre)}</option>`).join('')}</select>
        <div class="modal-label">día</div>
        <input id="profe-ses-fecha" class="modal-input" type="date" value="${s.fecha}">
        <div class="profe-dias-elegir">${chipsDiasProfe(c, profeSumar(isoLocal(new Date()) > s.fecha ? isoLocal(new Date()) : s.fecha, 1), "document.getElementById('profe-ses-fecha').value='$D'")}</div>
        <button class="btn-modal-primary" onclick="guardarSesionProfe('${s.id}')">guardar.</button>
        <button class="btn-secondary" style="margin-top:8px;color:#dc2626" onclick="borrarSesionProfe('${s.id}')">eliminar tarea.</button>
    `);
}

function guardarSesionProfe(id) {
    const s = datosProfe().sesiones.find(x => x.id === id);
    if (!s) return;
    const titulo = document.getElementById('profe-ses-titulo')?.value.trim();
    if (!titulo) { showToast('Escribe la tarea', true); return; }
    s.titulo = titulo;
    const claseId = document.getElementById('profe-ses-clase')?.value || s.claseId;
    const fecha = document.getElementById('profe-ses-fecha')?.value || s.fecha;
    if (claseId !== s.claseId || fecha !== s.fecha) profeMoverSesion(s, claseId, fecha);
    const e = window._profeEstado;
    s.hecha = e === 'hecha' ? true : e === 'sin' ? null : e === 'descartada' ? (s.hecha === null ? false : s.hecha) : false;
    s.descartada = e === 'descartada' ? true : undefined;
    closeModal();
    render();
    guardarProfe('Tarea guardada');
}

function borrarSesionProfe(id) {
    const p = datosProfe();
    p.sesiones = p.sesiones.filter(x => x.id !== id);
    closeModal();
    render();
    guardarProfe('Tarea eliminada');
}

// ------------------------------------------------------------
//  CLASES
// ------------------------------------------------------------
function openClaseProfe(id) {
    const p = datosProfe();
    const c = id ? profeClase(id) : null;
    window._profeDias = [...(c?.dias || [])];
    window._profeColor = c?.color || PROFE_COLORES[p.clases.length % PROFE_COLORES.length];
    showModal(`
        <div class="modal-title">${c ? 'editar clase.' : 'nueva clase.'}</div>
        <div class="modal-label">grupo</div>
        <input id="profe-nombre" class="modal-input" value="${escapeHtml(c?.nombre || '')}" placeholder="3º ESO B, 1º Bachillerato A...">
        <div class="modal-label">materia</div>
        <input id="profe-materia" class="modal-input" value="${escapeHtml(c?.materia || '')}" placeholder="Lengua castellana">
        <div class="modal-label">color</div>
        <div class="profe-colores">${PROFE_COLORES.map(col => `<button type="button" class="profe-color ${window._profeColor === col ? 'activa' : ''}" style="--c:${col}" onclick="window._profeColor='${col}';this.parentNode.querySelectorAll('.profe-color').forEach(b=>b.classList.toggle('activa',b===this))" aria-label="Color ${col}"></button>`).join('')}</div>
        <div class="modal-label">días que tienes esta clase</div>
        <div class="profe-dias-elegir">${[1, 2, 3, 4, 5, 6].map(d => `<button type="button" class="profe-chip ${window._profeDias.includes(d) ? 'activa' : ''}" onclick="profeDiaElegir(${d},this)">${PROFE_DIAS[d]}</button>`).join('')}</div>
        <div class="finance-modal-note">Si no marcas ninguno, cuenta de lunes a viernes. Con los días, el cuadrante apaga los demás y "asignar al día…", "repartir temario." y "correr el temario." saben dónde van las tareas. Si pones su horario (ficha de la clase → horario.), los días se toman de ahí.</div>
        <button class="btn-modal-primary" onclick="guardarClaseProfe('${c?.id || ''}')">guardar.</button>
        ${c ? `<button class="btn-secondary" style="margin-top:8px;color:#dc2626" onclick="borrarClaseProfe('${c.id}')">eliminar clase.</button>` : ''}
    `);
    setTimeout(() => document.getElementById('profe-nombre')?.focus(), 50);
}

function profeDiaElegir(d, btn) {
    const dias = window._profeDias;
    if (dias.includes(d)) window._profeDias = dias.filter(x => x !== d); else dias.push(d);
    btn.classList.toggle('activa');
}

function guardarClaseProfe(id) {
    const nombre = document.getElementById('profe-nombre')?.value.trim();
    if (!nombre) { showToast('Ponle nombre al grupo', true); return; }
    const materia = document.getElementById('profe-materia')?.value.trim() || '';
    const dias = [...window._profeDias].sort();
    const color = window._profeColor;
    const p = datosProfe();
    const c = id && profeClase(id);
    if (c) Object.assign(c, { nombre, materia, dias, color });
    else p.clases.push({ id: 'clase_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), nombre, materia, dias, color });
    closeModal();
    render();
    guardarProfe(c ? 'Clase actualizada' : 'Clase añadida');
}

function borrarClaseProfe(id) {
    const p = datosProfe();
    const c = profeClase(id);
    if (!c) return;
    const n = p.sesiones.filter(s => s.claseId === id).length;
    if (!confirm(`¿Eliminar ${c.nombre}${n ? ` y sus ${n} tareas` : ''}?`)) return;
    p.clases = p.clases.filter(x => x.id !== id);
    p.sesiones = p.sesiones.filter(s => s.claseId !== id);
    closeModal();
    render();
    guardarProfe('Clase eliminada');
}

// ------------------------------------------------------------
//  REPARTIR E IMPORTAR
// ------------------------------------------------------------
function openRepartirProfe(claseId) {
    const p = datosProfe();
    if (!p.clases.length) { openClaseProfe(); return; }
    showModal(`
        <div class="modal-title">repartir temario.</div>
        <p class="finance-modal-note" style="margin-top:0">Pega las tareas o temas, uno por línea, y se colocan uno por clase en los días de ese grupo a partir de la fecha que elijas. Los días que ya tienen algo y los festivos se saltan.</p>
        <div class="modal-label">clase</div>
        <select id="profe-rep-clase" class="modal-input">${p.clases.map(c => `<option value="${c.id}" ${c.id === claseId ? 'selected' : ''}>${escapeHtml(c.nombre)}${c.materia ? ` · ${escapeHtml(c.materia)}` : ''}</option>`).join('')}</select>
        <div class="modal-label">desde</div>
        <input id="profe-rep-desde" class="modal-input" type="date" value="${isoLocal(new Date())}">
        <div class="modal-label">tareas</div>
        <textarea id="profe-rep-lineas" class="modal-input" rows="8" placeholder="Tema 1. La comunicación&#10;Tema 1. Ejercicios&#10;Tema 2. El sustantivo&#10;Examen tema 1 y 2"></textarea>
        ${renderPlantillasRepartirProfe()}
        <button class="btn-modal-primary" onclick="repartirProfe()">repartir.</button>
    `);
}

function repartirProfe() {
    const p = datosProfe();
    const c = profeClase(document.getElementById('profe-rep-clase')?.value);
    const lineas = (document.getElementById('profe-rep-lineas')?.value || '').split('\n').map(l => l.trim()).filter(Boolean);
    if (!c || !lineas.length) { showToast('Escribe al menos una tarea', true); return; }
    const desde = document.getElementById('profe-rep-desde')?.value || isoLocal(new Date());
    let d = desde;
    lineas.forEach(titulo => {
        d = profeSiguienteHueco(c, d);
        p.sesiones.push({ id: profeNuevoId(), claseId: c.id, fecha: d, titulo, hecha: false, orden: profeSesiones(c.id, d).length });
        d = profeSumar(d, 1);
    });
    profeDesde = profeLunes(desde);
    closeModal();
    render();
    guardarProfe(`${lineas.length} ${lineas.length === 1 ? 'tarea repartida' : 'tareas repartidas'}, hasta el ${profeFecha(profeSumar(d, -1), true)}.`);
}

const PROFE_PROMPT_IA = `Te adjunto mi cuadrante de clases (puede ser un Excel, un PDF, una foto o un documento). Necesito que lo conviertas en un archivo para importarlo en la app Bitácora. Hazlo así:

1. CÓMO LEER MI CUADRANTE
- Normalmente hay una fila de cabecera con el nombre de cada clase o grupo (una columna por clase) y una columna con los días, uno por fila. Si está al revés (clases en filas y días en columnas), interprétalo igual.
- Cada casilla donde se cruzan una clase y un día es lo que quiero hacer ese día con esa clase.
- Si en una casilla hay varias cosas en líneas distintas o separadas por viñetas, son tareas distintas. Si es una sola frase ("tareas 5 y 6", "tema 3 y ejercicio 1"), es una sola tarea.
- Las casillas vacías no son nada: no las incluyas.
- Si las fechas no llevan año (por ejemplo "09-oct"), deduce el año del curso escolar: de septiembre a diciembre es el primer año del curso y de enero a agosto el siguiente. Si no puedes deducirlo, pregúntamelo antes de hacer nada.
- Si el cuadrante va por semanas o por número de sesión en vez de por fechas, pregúntame cuándo empieza el curso y qué días tengo cada clase, y calcula las fechas.

2. EL ESTADO DE CADA TAREA ("hecha")
- Marcada como hecha (✓, ☑, x, check marcado, tachada, en verde, "hecho", "dado"): true.
- Con casilla o check sin marcar (☐, casilla vacía, "pendiente", "no dio tiempo"): false.
- Sin ninguna casilla ni marca: false si es contenido de clase (un tema, unos ejercicios, un examen) y null si es un aviso o una nota que no se "hace" (por ejemplo "festivo", "excursión", "evaluación", "no hay clase").
- Si en todo el cuadrante no hay ninguna marca, usa false para el contenido y null para los avisos.

3. FESTIVOS
- Si un día pone "festivo" o "no lectivo" en todas o casi todas las clases, añade esa fecha a "festivos" y NO crees tareas "festivo" para ese día.
- Si solo pone festivo en alguna clase suelta, crea esa tarea con "hecha": null.

4. LAS CLASES
- "nombre": tal como aparece en la cabecera.
- "materia": si se ve en el cuadrante; si no, "".
- "dias": los días de la semana que tengo esa clase (1 lunes, 2 martes, 3 miércoles, 4 jueves, 5 viernes, 6 sábado). Dedúcelos de los días en los que esa clase suele tener tareas. Si no está claro, déjalo vacío: [].
- "color": opcional, un color en hexadecimal (#rrggbb) si el cuadrante usa colores por clase.

5. EL RESULTADO
Genera un archivo descargable llamado cuadrante-bitacora.json con exactamente esta estructura (este es un ejemplo, usa mis datos):

{
  "formato": "bitacora-cuadrante",
  "version": 1,
  "clases": [
    { "nombre": "3º ESO B", "materia": "Lengua", "dias": [1, 3, 5], "color": "#e07a3f" }
  ],
  "festivos": ["2026-10-12"],
  "tareas": [
    { "clase": "3º ESO B", "fecha": "2026-10-09", "titulo": "Tareas 1 y 2", "hecha": true },
    { "clase": "3º ESO B", "fecha": "2026-10-14", "titulo": "Tema 3. Ejercicio 1", "hecha": false },
    { "clase": "3º ESO B", "fecha": "2026-10-16", "titulo": "Excursión al museo", "hecha": null }
  ]
}

Reglas finales:
- Fechas siempre en formato AAAA-MM-DD.
- "clase" de cada tarea tiene que coincidir exactamente con el "nombre" de una clase.
- Respeta mi texto: no inventes, no resumas de más y no añadas tareas que no estén en el cuadrante.
- Si no puedes crear archivos, responde solo con el JSON, sin explicaciones alrededor, para que yo lo copie.
- Al terminar, dime cuántas clases, tareas y festivos has encontrado y si hubo algo que no supiste interpretar.`;

function openImportarProfe() {
    showModal(`
        <div class="modal-title">importar cuadrante.</div>
        <div class="profe-importar-ayuda">
            <b>¿Ya tienes un cuadrante en Excel, PDF o en papel?</b>
            <ol class="profe-pasos">
                <li>Copia la instrucción de abajo y dásela a cualquier IA que pueda crear archivos (Claude, ChatGPT...), adjuntando tu cuadrante actual.</li>
                <li>La IA lo transformará y te dará un archivo <b>cuadrante-bitacora.json</b>.</li>
                <li>Súbelo aquí. Se suma a lo que ya tengas: no se borra nada.</li>
            </ol>
        </div>
        <details class="profe-prompt-caja">
            <summary>ver la instrucción para la ia.</summary>
            <pre class="profe-prompt">${escapeHtml(PROFE_PROMPT_IA)}</pre>
        </details>
        <button class="btn-secondary" onclick="navigator.clipboard.writeText(PROFE_PROMPT_IA).then(()=>showToast('Instrucción copiada'))">copiar instrucción.</button>
        <button class="btn-modal-primary" style="margin-top:14px" onclick="document.getElementById('profe-archivo').click()">subir el archivo.</button>
        <input type="file" id="profe-archivo" accept=".json,application/json,text/plain" hidden onchange="importarArchivoProfe(this)">
        <details class="profe-prompt-caja">
            <summary>la ia me dio el texto en vez de un archivo.</summary>
            <textarea id="profe-json" class="modal-input" rows="5" placeholder='{"formato":"bitacora-cuadrante", ...}'></textarea>
            <button class="btn-secondary" onclick="importarProfe(document.getElementById('profe-json').value)">importar el texto.</button>
        </details>
    `);
}

function importarArchivoProfe(input) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const lector = new FileReader();
    lector.onload = () => importarProfe(String(lector.result || ''));
    lector.readAsText(file);
}

function importarProfe(texto) {
    let datos;
    try { datos = JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1)); } catch (e) { showToast('No se ha podido leer: tiene que ser el archivo .json que dio la IA', true); return; }
    const p = datosProfe();
    const fechaOk = f => /^\d{4}-\d{2}-\d{2}$/.test(String(f || '').slice(0, 10));
    const porNombre = new Map(p.clases.map(c => [c.nombre.trim().toLowerCase(), c]));
    const nuevasIds = new Set();
    let nuevas = 0, repetidas = 0, festivos = 0;
    const claseDe = (nombre, materia, dias, color) => {
        const clave = String(nombre || '').trim().toLowerCase();
        if (!clave) return null;
        let c = porNombre.get(clave);
        if (!c) {
            c = { id: 'clase_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), nombre: String(nombre).trim(), materia: '', dias: [], color: PROFE_COLORES[p.clases.length % PROFE_COLORES.length] };
            p.clases.push(c); porNombre.set(clave, c); nuevasIds.add(c.id);
        }
        if (!c.materia && materia) c.materia = String(materia);
        if (!(c.dias || []).length && Array.isArray(dias)) c.dias = dias.map(Number).filter(d => d >= 1 && d <= 6).sort();
        if (nuevasIds.has(c.id) && /^#[0-9a-f]{6}$/i.test(color || '')) c.color = color;
        return c;
    };
    (Array.isArray(datos.clases) ? datos.clases : []).forEach(c => claseDe(c.nombre, c.materia, c.dias, c.color));
    (Array.isArray(datos.festivos) ? datos.festivos : []).forEach(f => {
        const fecha = typeof f === 'object' && f ? f.fecha : f;
        if (fechaOk(fecha) && !p.festivos.includes(fecha.slice(0, 10))) {
            p.festivos.push(fecha.slice(0, 10)); festivos++;
            if (f.nombre) { p.nombresFestivos = p.nombresFestivos || {}; p.nombresFestivos[fecha.slice(0, 10)] = String(f.nombre); }
        }
    });
    const tareas = Array.isArray(datos.tareas) ? datos.tareas : Array.isArray(datos.sesiones) ? datos.sesiones : [];
    tareas.forEach(t => {
        const c = claseDe(t.clase);
        const fecha = String(t.fecha || '').slice(0, 10);
        const titulo = String(t.titulo || '').trim();
        if (!c || !fechaOk(fecha) || !titulo) return;
        const enCasilla = profeSesiones(c.id, fecha);
        if (enCasilla.some(s => s.titulo.trim().toLowerCase() === titulo.toLowerCase())) { repetidas++; return; }
        p.sesiones.push({ id: profeNuevoId(), claseId: c.id, fecha, titulo, hecha: t.hecha === true ? true : t.hecha === null ? null : false, orden: enCasilla.length });
        nuevas++;
    });
    // Clases nuevas sin días: se deducen de los días de la semana en que
    // tienen al menos dos tareas.
    p.clases.filter(c => nuevasIds.has(c.id) && !(c.dias || []).length).forEach(c => {
        const cuenta = {};
        p.sesiones.filter(s => s.claseId === c.id).forEach(s => { const w = new Date(s.fecha + 'T12:00:00').getDay(); cuenta[w] = (cuenta[w] || 0) + 1; });
        c.dias = Object.keys(cuenta).map(Number).filter(w => w >= 1 && w <= 6 && cuenta[w] >= 2).sort();
    });
    if (!nuevasIds.size && !nuevas && !festivos) { showToast(repetidas ? 'Todo eso ya estaba en tu cuadrante' : 'No había clases ni tareas que importar', true); return; }
    profeSemanas = 0;
    profeIrAHoy = true;
    closeModal();
    render();
    guardarProfe(`${nuevasIds.size ? `${nuevasIds.size} ${nuevasIds.size === 1 ? 'clase' : 'clases'}, ` : ''}${nuevas} ${nuevas === 1 ? 'tarea' : 'tareas'}${festivos ? ` y ${festivos} ${festivos === 1 ? 'festivo' : 'festivos'}` : ''} importados${repetidas ? `. ${repetidas} ya estaban` : ''}.`);
}
