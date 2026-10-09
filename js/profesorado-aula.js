// ============================================================
//  PROFESORADO: EL AULA (complemento de profesorado.js)
//  La ficha de cada clase con pestañas (resumen y avance, cuaderno de
//  notas, deberes, horario y notas de cada día), el horario semanal por
//  franjas, copiar un grupo o guardarlo como plantilla y exportar el
//  cuadrante a PDF y Excel.
//  Datos dentro de `profesorado`: en cada clase `alumnos` [{ id, nombre,
//  observaciones }], `evaluaciones` (columnas del cuaderno) [{ id, nombre,
//  fecha, peso, periodo, max }], `calificaciones` { evalId: { alumnoId:
//  nota } }, `deberes` [{ id, titulo, puesto, entrega, entregados: {
//  alumnoId: true }, evaluacionId }] y `horario` [{ dia, inicio, fin, aula }];
//  y en la raíz `notasDia` { 'claseId|fecha': texto } y `plantillas`
//  [{ id, nombre, materia, tareas: [titulo] }].
// ============================================================
const PROFE_PERIODOS = [['', 'todo el curso'], ['1', '1ª evaluación'], ['2', '2ª evaluación'], ['3', '3ª evaluación']];
let profeFicha = { id: null, pestana: 'resumen', alumno: null, periodo: '' };

function aulaProfe(c) {
    ['alumnos', 'evaluaciones', 'deberes', 'horario'].forEach(k => { if (!Array.isArray(c[k])) c[k] = []; });
    if (!c.calificaciones || typeof c.calificaciones !== 'object') c.calificaciones = {};
    return c;
}

function profeNotasDia() {
    const p = datosProfe();
    if (!p.notasDia || typeof p.notasDia !== 'object') p.notasDia = {};
    return p.notasDia;
}

function profeNotaTexto(n) { return Number.isFinite(n) ? n.toFixed(n % 1 ? 1 : 0).replace('.', ',') : '—'; }

// ------------------------------------------------------------
//  AVANCE DEL TEMARIO
// ------------------------------------------------------------
function profeAvance(c) {
    const hoy = isoLocal(new Date());
    const ses = datosProfe().sesiones.filter(s => s.claseId === c.id && profeConCasilla(s) && !s.descartada);
    const dadas = ses.filter(s => s.hecha).length;
    const atrasadas = ses.filter(s => profeEsPendiente(s, hoy)).length;
    const porDar = ses.filter(s => !s.hecha).length;
    const fin = datosProfe().curso?.fin || ses.map(s => s.fecha).sort().pop() || hoy;
    const clases = fin >= hoy ? profeProximosDias(c, hoy, 400).filter(d => d <= fin).length : 0;
    let estado = 'al día.';
    if (atrasadas) estado = `${atrasadas} ${atrasadas === 1 ? 'tarea' : 'tareas'} por detrás.`;
    else if (porDar > clases && clases) estado = `ajustado: ${porDar} por dar y ${clases} clases.`;
    return { dadas, total: ses.length, atrasadas, porDar, clases, fin, estado, pct: ses.length ? Math.round(dadas / ses.length * 100) : 0 };
}

// ------------------------------------------------------------
//  FICHA DE LA CLASE
// ------------------------------------------------------------
function openFichaClaseProfe(id, pestana = 'resumen') {
    const c = profeClase(id);
    if (!c) return;
    aulaProfe(c);
    profeFicha = { id, pestana, alumno: null, periodo: profeFicha.id === id ? profeFicha.periodo : '' };
    showModal(`<div id="profe-ficha">${renderFichaProfe()}</div>`);
    document.querySelector('#modal-container .modal-sheet')?.classList.add('profe-ficha-sheet');
}

function profeIrPestana(pestana) {
    profeFicha.pestana = pestana;
    profeFicha.alumno = null;
    repintarFichaProfe();
}

function repintarFichaProfe() {
    const el = document.getElementById('profe-ficha');
    if (el) el.innerHTML = renderFichaProfe();
}

function renderFichaProfe() {
    const c = profeClase(profeFicha.id);
    if (!c) return '';
    aulaProfe(c);
    const pestanas = [['resumen', 'resumen.'], ['cuaderno', 'cuaderno.'], ['deberes', 'deberes.'], ['horario', 'horario.'], ['notas', 'notas.']];
    const cuerpo = profeFicha.alumno ? renderAlumnoProfe(c) : {
        resumen: renderFichaResumenProfe, cuaderno: renderCuadernoProfe, deberes: renderDeberesProfe, horario: renderHorarioClaseProfe, notas: renderNotasClaseProfe,
    }[profeFicha.pestana](c);
    return `
        <div class="modal-title"><span class="profe-ficha-titulo" style="--c:${c.color}">${escapeHtml(c.nombre)}</span><button class="modal-close" onclick="closeModal()" aria-label="Cerrar">✕</button></div>
        <div class="profe-ficha-sub">${escapeHtml(c.materia || 'sin materia')} · ${c.alumnos.length} ${c.alumnos.length === 1 ? 'alumno' : 'alumnos'} · ${(c.dias || []).length ? c.dias.map(d => PROFE_DIAS[d]).join(', ') : 'de lunes a viernes'}</div>
        <div class="profe-pestanas">${pestanas.map(([k, t]) => `<button class="profe-chip ${profeFicha.pestana === k ? 'activa' : ''}" onclick="profeIrPestana('${k}')">${t}</button>`).join('')}</div>
        ${cuerpo}`;
}

function renderFichaResumenProfe(c) {
    const hoy = isoLocal(new Date());
    const r = profeResumenClase(c);
    const av = profeAvance(c);
    const lunes = profeLunes(hoy), domingo = profeSumar(lunes, 6);
    const ordenar = (a, b) => a.fecha.localeCompare(b.fecha) || (a.orden || 0) - (b.orden || 0);
    const semana = r.ses.filter(s => s.fecha >= lunes && s.fecha <= domingo).sort(ordenar);
    const siguiente = r.ses.filter(s => s.fecha > domingo && s.fecha <= profeSumar(domingo, 7)).sort(ordenar);
    const dadas = r.ses.filter(s => s.hecha === true).sort((a, b) => ordenar(b, a));
    const pendientes = r.ses.filter(s => profeEsPendiente(s, hoy)).sort(ordenar);
    const proximosDeberes = c.deberes.filter(d => d.entrega >= hoy).sort((a, b) => a.entrega.localeCompare(b.entrega)).slice(0, 3);
    const fila = s => `<button class="profe-ficha-fila ${s.hecha === true ? 'hecha' : profeEsPendiente(s, hoy) ? 'pendiente' : ''} ${s.descartada ? 'descartada' : ''}" onclick="openSesionProfe('${s.id}')"><span>${profeFechaCorta(s.fecha)}</span><b>${escapeHtml(s.titulo)}</b><i>${s.descartada ? 'descartada' : s.hecha === true ? 'hecha' : s.hecha === null ? '' : profeEsPendiente(s, hoy) ? 'sin dar' : 'por hacer'}</i></button>`;
    const lista = (titulo, items, vacio) => `<div class="profe-ficha-bloque"><div class="uni-etiqueta">${titulo}</div>${items.length ? items.map(fila).join('') : `<div class="profe-ficha-vacio">${vacio}</div>`}</div>`;
    return `
        <div class="profe-ficha-cifras">
            <div><b>${av.pct}<small>%</small></b><small>del temario hecho (${av.dadas} de ${av.total})</small></div>
            <div class="${av.atrasadas ? 'mal' : ''}"><b>${av.atrasadas}</b><small>sin dar</small></div>
            <div><b>${av.porDar}</b><small>por dar</small></div>
            <div><b>${av.clases}</b><small>clases hasta el ${profeFecha(av.fin)}</small></div>
        </div>
        <span class="profe-barra"><span style="width:${av.pct}%;--c:${c.color}"></span></span>
        <div class="profe-avance-texto">Avance del temario: <b>${av.estado}</b>${av.porDar && av.clases ? ` Te quedan ${av.porDar} tareas por dar y ${av.clases} clases.` : ''}</div>
        ${proximosDeberes.length ? `<div class="profe-ficha-bloque"><div class="uni-etiqueta">próximas entregas.</div>${proximosDeberes.map(d => `<button class="profe-ficha-fila" onclick="profeIrPestana('deberes')"><span>${profeFechaCorta(d.entrega)}</span><b>${escapeHtml(d.titulo)}</b><i>${Object.values(d.entregados || {}).filter(Boolean).length}/${c.alumnos.length}</i></button>`).join('')}</div>` : ''}
        ${pendientes.length ? lista('sin dar.', pendientes, '') : ''}
        ${lista('esta semana.', semana, 'Nada planificado esta semana.')}
        ${siguiente.length ? lista('la semana que viene.', siguiente, '') : ''}
        ${lista('lo que ya has dado.', dadas, 'Todavía nada marcado como hecho.')}
        <div class="profe-botones" style="margin-top:14px">
            <button class="pedido-btn" onclick="openClaseProfe('${c.id}')">editar clase.</button>
            <button class="pedido-btn" onclick="openRepartirProfe('${c.id}')">repartir temario.</button>
            <button class="pedido-btn" onclick="openCopiarClaseProfe('${c.id}')">copiar a otro grupo.</button>
            <button class="pedido-btn" onclick="guardarPlantillaProfe('${c.id}')">guardar como plantilla.</button>
            <button class="pedido-btn" onclick="openExportarProfe('${c.id}')">exportar.</button>
        </div>`;
}

// ------------------------------------------------------------
//  CUADERNO DE NOTAS
//  Como el cuaderno del profesor de siempre: una fila por alumno, una
//  columna por cada cosa que se califica, con su peso, y la media
//  ponderada al final. Lo que queda por debajo de 5 se tiñe.
// ------------------------------------------------------------
function profeColumnas(c) {
    return c.evaluaciones.filter(e => !profeFicha.periodo || String(e.periodo || '') === profeFicha.periodo)
        .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
}

function profeNotaDe(c, evalId, alumnoId) {
    const v = c.calificaciones[evalId]?.[alumnoId];
    return Number.isFinite(v) ? v : null;
}

function profeMediaAlumno(c, alumnoId, columnas) {
    let suma = 0, pesos = 0;
    columnas.forEach(e => {
        const n = profeNotaDe(c, e.id, alumnoId);
        if (n === null) return;
        const peso = Number(e.peso) > 0 ? Number(e.peso) : 1;
        suma += n / (Number(e.max) || 10) * 10 * peso;
        pesos += peso;
    });
    return pesos ? suma / pesos : null;
}

function renderCuadernoProfe(c) {
    const cols = profeColumnas(c);
    const alumnos = [...c.alumnos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const medias = alumnos.map(a => profeMediaAlumno(c, a.id, cols)).filter(m => m !== null);
    const mediaGrupo = medias.length ? medias.reduce((x, y) => x + y, 0) / medias.length : null;
    const suspensos = medias.filter(m => m < 5).length;
    return `
        <div class="profe-cuaderno-barra">
            <div class="profe-dias-elegir" style="margin:0">${PROFE_PERIODOS.map(([k, t]) => `<button class="profe-chip ${profeFicha.periodo === k ? 'activa' : ''}" onclick="profeFicha.periodo='${k}';repintarFichaProfe()">${t}</button>`).join('')}</div>
            <div class="profe-botones">
                <button class="pedido-btn" onclick="openAlumnosProfe()">+ alumnos.</button>
                <button class="pedido-btn pedido-btn-principal" onclick="openColumnaProfe()">+ columna.</button>
            </div>
        </div>
        ${!alumnos.length ? `<div class="profe-ficha-vacio" style="padding:18px 2px">Añade a tus alumnos con <b>+ alumnos.</b>: puedes pegar la lista entera, uno por línea.</div>` : `
        <div class="profe-cuaderno-resumen">${mediaGrupo !== null ? `Media del grupo: <b class="${mediaGrupo < 5 ? 'suspenso' : ''}">${profeNotaTexto(mediaGrupo)}</b> · ${suspensos ? `<b class="suspenso">${suspensos} por debajo de 5</b>` : 'nadie por debajo de 5'}` : 'Todavía no hay notas.'}</div>
        <div class="profe-cuaderno-wrap">
            <table class="profe-cuaderno">
                <thead><tr><th class="profe-cuaderno-alumno">alumno.</th>${cols.map(e => `<th><button onclick="openColumnaProfe('${e.id}')"><b>${escapeHtml(e.nombre)}</b><small>${e.fecha ? profeFecha(e.fecha) : ''}${Number(e.peso) && Number(e.peso) !== 1 ? ` · peso ${String(e.peso).replace('.', ',')}` : ''}${e.periodo ? ` · ${e.periodo}ª` : ''}</small></button></th>`).join('')}<th class="profe-cuaderno-media">media.</th></tr></thead>
                <tbody>${alumnos.map((a, f) => {
                    const media = profeMediaAlumno(c, a.id, cols);
                    return `<tr>
                        <th class="profe-cuaderno-alumno"><button onclick="profeFicha.alumno='${a.id}';repintarFichaProfe()">${escapeHtml(a.nombre)}</button></th>
                        ${cols.map((e, ci) => { const n = profeNotaDe(c, e.id, a.id); return `<td class="${n !== null && n / (Number(e.max) || 10) * 10 < 5 ? 'suspenso' : ''}"><input inputmode="decimal" value="${n === null ? '' : String(n).replace('.', ',')}" data-f="${f}" data-c="${ci}" onchange="profePonerNota('${e.id}','${a.id}',this)" onkeydown="profeTeclaNota(event,this)" aria-label="${escapeHtml(a.nombre)}, ${escapeHtml(e.nombre)}"></td>`; }).join('')}
                        <td class="profe-cuaderno-media ${media !== null && media < 5 ? 'suspenso' : ''}" id="profe-media-${a.id}">${profeNotaTexto(media)}</td>
                    </tr>`;
                }).join('')}</tbody>
                ${cols.length ? `<tfoot><tr><th class="profe-cuaderno-alumno">media.</th>${cols.map(e => {
                    const ns = alumnos.map(a => profeNotaDe(c, e.id, a.id)).filter(n => n !== null).map(n => n / (Number(e.max) || 10) * 10);
                    const m = ns.length ? ns.reduce((x, y) => x + y, 0) / ns.length : null;
                    return `<td class="${m !== null && m < 5 ? 'suspenso' : ''}">${profeNotaTexto(m)}</td>`;
                }).join('')}<td></td></tr></tfoot>` : ''}
            </table>
        </div>
        <div class="profe-pista">Escribe la nota (de 0 a 10, o sobre el máximo de la columna) y pulsa Intro para bajar al siguiente alumno. La media pondera cada columna por su peso. Pulsa un nombre para ver su seguimiento.</div>`}`;
}

function profePonerNota(evalId, alumnoId, input) {
    const c = profeClase(profeFicha.id);
    const e = c?.evaluaciones.find(x => x.id === evalId);
    if (!e) return;
    const texto = input.value.trim().replace(',', '.');
    const max = Number(e.max) || 10;
    if (!c.calificaciones[evalId]) c.calificaciones[evalId] = {};
    if (texto === '') delete c.calificaciones[evalId][alumnoId];
    else {
        const n = Number(texto);
        if (!Number.isFinite(n) || n < 0 || n > max) { showToast(`La nota tiene que ir de 0 a ${String(max).replace('.', ',')}`, true); input.value = ''; return; }
        c.calificaciones[evalId][alumnoId] = Math.round(n * 100) / 100;
    }
    const n = profeNotaDe(c, evalId, alumnoId);
    input.closest('td')?.classList.toggle('suspenso', n !== null && n / max * 10 < 5);
    const media = profeMediaAlumno(c, alumnoId, profeColumnas(c));
    const celda = document.getElementById('profe-media-' + alumnoId);
    if (celda) { celda.textContent = profeNotaTexto(media); celda.classList.toggle('suspenso', media !== null && media < 5); }
    guardarProfe();
}

function profeTeclaNota(e, input) {
    if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const f = Number(input.dataset.f) + (e.key === 'ArrowUp' || e.shiftKey ? -1 : 1);
    const sig = input.closest('table')?.querySelector(`input[data-f="${f}"][data-c="${input.dataset.c}"]`);
    if (sig) { sig.focus(); sig.select(); } else input.blur();
}

function openAlumnosProfe() {
    const c = profeClase(profeFicha.id);
    if (!c) return;
    document.getElementById('profe-ficha').innerHTML = `
        <div class="modal-title">alumnos de ${escapeHtml(c.nombre)}.</div>
        <p class="finance-modal-note" style="margin-top:0">Uno por línea. Puedes pegar la lista directamente desde Excel o desde el programa del centro.</p>
        <textarea id="profe-alumnos" class="modal-input" rows="10" placeholder="Apellidos Nombre&#10;Apellidos Nombre"></textarea>
        <button class="btn-modal-primary" onclick="guardarAlumnosProfe()">añadir.</button>
        <button class="btn-secondary" style="margin-top:8px" onclick="repintarFichaProfe()">volver.</button>`;
    setTimeout(() => document.getElementById('profe-alumnos')?.focus(), 50);
}

function guardarAlumnosProfe() {
    const c = profeClase(profeFicha.id);
    const ya = new Set(c.alumnos.map(a => a.nombre.trim().toLowerCase()));
    const nuevos = (document.getElementById('profe-alumnos')?.value || '').split('\n').map(l => l.replace(/\t/g, ' ').trim()).filter(l => l && !ya.has(l.toLowerCase()));
    nuevos.forEach((nombre, i) => c.alumnos.push({ id: 'alu_' + Date.now() + '_' + i + Math.random().toString(36).slice(2, 5), nombre }));
    profeFicha.pestana = 'cuaderno';
    repintarFichaProfe();
    render();
    guardarProfe(nuevos.length ? `${nuevos.length} ${nuevos.length === 1 ? 'alumno añadido' : 'alumnos añadidos'}` : 'Ya estaban todos');
}

function openColumnaProfe(id) {
    const c = profeClase(profeFicha.id);
    const e = id ? c.evaluaciones.find(x => x.id === id) : null;
    window._profePeriodo = String(e?.periodo ?? profeFicha.periodo ?? '');
    document.getElementById('profe-ficha').innerHTML = `
        <div class="modal-title">${e ? 'editar columna.' : 'nueva columna.'}</div>
        <div class="modal-label">qué se califica</div>
        <input id="profe-col-nombre" class="modal-input" value="${escapeHtml(e?.nombre || '')}" placeholder="Examen tema 3, comentario de texto, cuaderno...">
        <div class="lab-horas">
            <div><div class="modal-label">fecha</div><input id="profe-col-fecha" class="modal-input" type="date" value="${e?.fecha || isoLocal(new Date())}"></div>
            <div><div class="modal-label">peso</div><input id="profe-col-peso" class="modal-input" inputmode="decimal" value="${String(e?.peso ?? 1).replace('.', ',')}"></div>
        </div>
        <div class="lab-horas">
            <div><div class="modal-label">nota máxima</div><input id="profe-col-max" class="modal-input" inputmode="decimal" value="${String(e?.max ?? 10).replace('.', ',')}"></div>
            <div></div>
        </div>
        <div class="modal-label">evaluación</div>
        <div class="profe-dias-elegir">${[['', 'ninguna'], ['1', '1ª'], ['2', '2ª'], ['3', '3ª']].map(([k, t]) => `<button type="button" class="profe-chip ${window._profePeriodo === k ? 'activa' : ''}" onclick="window._profePeriodo='${k}';this.parentNode.querySelectorAll('.profe-chip').forEach(b=>b.classList.toggle('activa',b===this))">${t}</button>`).join('')}</div>
        <div class="finance-modal-note">El peso cuenta cuánto vale esta columna en la media frente a las demás: un examen con peso 3 vale el triple que unos deberes con peso 1.</div>
        <button class="btn-modal-primary" onclick="guardarColumnaProfe('${e?.id || ''}')">guardar.</button>
        ${e ? `<button class="btn-secondary" style="margin-top:8px;color:#dc2626" onclick="borrarColumnaProfe('${e.id}')">eliminar columna y sus notas.</button>` : ''}
        <button class="btn-secondary" style="margin-top:8px" onclick="repintarFichaProfe()">volver.</button>`;
    setTimeout(() => document.getElementById('profe-col-nombre')?.focus(), 50);
}

function guardarColumnaProfe(id) {
    const c = profeClase(profeFicha.id);
    const nombre = document.getElementById('profe-col-nombre')?.value.trim();
    if (!nombre) { showToast('Ponle nombre a la columna', true); return; }
    const num = (k, def) => { const v = Number(String(document.getElementById(k)?.value || '').replace(',', '.')); return v > 0 ? v : def; };
    const datos = { nombre, fecha: document.getElementById('profe-col-fecha')?.value || '', peso: num('profe-col-peso', 1), max: num('profe-col-max', 10), periodo: window._profePeriodo || '' };
    const e = id && c.evaluaciones.find(x => x.id === id);
    if (e) Object.assign(e, datos); else c.evaluaciones.push({ id: 'eva_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), ...datos });
    profeFicha.pestana = 'cuaderno';
    repintarFichaProfe();
    guardarProfe();
}

function borrarColumnaProfe(id) {
    const c = profeClase(profeFicha.id);
    if (!confirm('¿Eliminar esta columna y todas sus notas?')) return;
    c.evaluaciones = c.evaluaciones.filter(x => x.id !== id);
    delete c.calificaciones[id];
    c.deberes.forEach(d => { if (d.evaluacionId === id) delete d.evaluacionId; });
    repintarFichaProfe();
    guardarProfe('Columna eliminada');
}

// Seguimiento de un alumno: sus notas, medias por evaluación, lo que ha
// entregado y las observaciones del profesor.
function renderAlumnoProfe(c) {
    const a = c.alumnos.find(x => x.id === profeFicha.alumno);
    if (!a) { profeFicha.alumno = null; return renderCuadernoProfe(c); }
    const todas = [...c.evaluaciones].sort((x, y) => (x.fecha || '').localeCompare(y.fecha || ''));
    const media = profeMediaAlumno(c, a.id, todas);
    const porPeriodo = ['1', '2', '3'].map(k => [k, profeMediaAlumno(c, a.id, todas.filter(e => String(e.periodo || '') === k))]).filter(([, m]) => m !== null);
    const deberes = c.deberes.filter(d => d.entrega <= isoLocal(new Date()));
    const entregados = deberes.filter(d => d.entregados?.[a.id]).length;
    return `
        <button class="pedido-btn" style="margin-bottom:12px" onclick="profeFicha.alumno=null;repintarFichaProfe()">← cuaderno.</button>
        <div class="profe-alumno-cab"><b>${escapeHtml(a.nombre)}</b><span class="profe-alumno-media ${media !== null && media < 5 ? 'suspenso' : ''}">${profeNotaTexto(media)}</span></div>
        <div class="profe-ficha-cifras">
            ${porPeriodo.map(([k, m]) => `<div class="${m < 5 ? 'mal' : ''}"><b>${profeNotaTexto(m)}</b><small>${k}ª evaluación</small></div>`).join('')}
            <div><b>${entregados}/${deberes.length}</b><small>deberes entregados</small></div>
        </div>
        <div class="profe-ficha-bloque"><div class="uni-etiqueta">notas.</div>
            ${todas.length ? todas.map(e => { const n = profeNotaDe(c, e.id, a.id); return `<div class="profe-ficha-fila"><span>${e.fecha ? profeFechaCorta(e.fecha) : ''}</span><b>${escapeHtml(e.nombre)}</b><i class="${n !== null && n / (Number(e.max) || 10) * 10 < 5 ? 'suspenso' : ''}">${n === null ? 'sin nota' : `${profeNotaTexto(n)}${Number(e.max) && Number(e.max) !== 10 ? ` / ${profeNotaTexto(Number(e.max))}` : ''}`}</i></div>`; }).join('') : '<div class="profe-ficha-vacio">Todavía no hay columnas en el cuaderno.</div>'}
        </div>
        <div class="profe-ficha-bloque"><div class="uni-etiqueta">observaciones.</div>
            <textarea class="modal-input" rows="4" placeholder="Cómo va, qué le cuesta, lo hablado con la familia..." onchange="profeObservaciones('${a.id}',this.value)">${escapeHtml(a.observaciones || '')}</textarea>
        </div>
        <div class="profe-botones">
            <button class="pedido-btn" onclick="profeRenombrarAlumno('${a.id}')">cambiar nombre.</button>
            <button class="pedido-btn" style="color:#dc2626" onclick="profeBorrarAlumno('${a.id}')">quitar de la clase.</button>
        </div>`;
}

function profeObservaciones(alumnoId, texto) {
    const a = profeClase(profeFicha.id)?.alumnos.find(x => x.id === alumnoId);
    if (!a) return;
    a.observaciones = texto.trim();
    guardarProfe('Observaciones guardadas');
}

function profeRenombrarAlumno(alumnoId) {
    const a = profeClase(profeFicha.id)?.alumnos.find(x => x.id === alumnoId);
    const nombre = a && prompt('Nombre del alumno', a.nombre);
    if (!nombre || !nombre.trim()) return;
    a.nombre = nombre.trim();
    repintarFichaProfe();
    guardarProfe();
}

function profeBorrarAlumno(alumnoId) {
    const c = profeClase(profeFicha.id);
    const a = c?.alumnos.find(x => x.id === alumnoId);
    if (!a || !confirm(`¿Quitar a ${a.nombre} de ${c.nombre}? Se borran sus notas.`)) return;
    c.alumnos = c.alumnos.filter(x => x.id !== alumnoId);
    Object.values(c.calificaciones).forEach(notas => delete notas[alumnoId]);
    c.deberes.forEach(d => { if (d.entregados) delete d.entregados[alumnoId]; });
    profeFicha.alumno = null;
    repintarFichaProfe();
    render();
    guardarProfe('Alumno quitado');
}

// ------------------------------------------------------------
//  DEBERES Y ENTREGAS
// ------------------------------------------------------------
function renderDeberesProfe(c) {
    const hoy = isoLocal(new Date());
    const ordenados = [...c.deberes].sort((a, b) => a.entrega.localeCompare(b.entrega));
    const proximos = ordenados.filter(d => d.entrega >= hoy);
    const pasados = ordenados.filter(d => d.entrega < hoy).reverse();
    const tarjeta = d => {
        const hechos = c.alumnos.filter(a => d.entregados?.[a.id]).length;
        return `<details class="profe-deber ${d.entrega < hoy ? 'pasado' : ''}">
            <summary><span>${profeFechaCorta(d.entrega)}</span><b>${escapeHtml(d.titulo)}</b><i>${c.alumnos.length ? `${hechos}/${c.alumnos.length} entregados` : ''}</i></summary>
            <div class="profe-deber-cuerpo">
                <small>Puesto el ${profeFecha(d.puesto || d.entrega, true)}, para el ${profeFecha(d.entrega, true)}.</small>
                ${c.alumnos.length ? `<div class="profe-deber-alumnos">${[...c.alumnos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(a => `<label class="profe-check-linea"><input type="checkbox" ${d.entregados?.[a.id] ? 'checked' : ''} onchange="profeEntregado('${d.id}','${a.id}',this.checked)"> ${escapeHtml(a.nombre)}</label>`).join('')}</div>` : '<div class="profe-ficha-vacio">Añade alumnos en el cuaderno para marcar quién lo entrega.</div>'}
                <div class="profe-botones">
                    ${d.evaluacionId ? `<button class="pedido-btn" onclick="profeIrPestana('cuaderno')">ver sus notas.</button>` : `<button class="pedido-btn" onclick="profeCalificarDeber('${d.id}')">calificar en el cuaderno.</button>`}
                    <button class="pedido-btn" style="color:#dc2626" onclick="profeBorrarDeber('${d.id}')">eliminar.</button>
                </div>
            </div>
        </details>`;
    };
    return `
        <div class="profe-deber-nuevo">
            <input id="profe-deber-titulo" class="modal-input" placeholder="Ejercicios 1 a 5 de la página 34, redacción...">
            <div class="lab-horas">
                <div><div class="modal-label">puesto</div><input id="profe-deber-puesto" class="modal-input" type="date" value="${hoy}"></div>
                <div><div class="modal-label">para el</div><input id="profe-deber-entrega" class="modal-input" type="date" value="${profeProximosDias(c, profeSumar(hoy, 1), 1)[0] || profeSumar(hoy, 1)}"></div>
            </div>
            <button class="btn-modal-primary" onclick="profeAnadirDeber()">+ deber.</button>
        </div>
        <div class="profe-ficha-bloque"><div class="uni-etiqueta">por entregar.</div>${proximos.length ? proximos.map(tarjeta).join('') : '<div class="profe-ficha-vacio">Nada pendiente de entrega.</div>'}</div>
        ${pasados.length ? `<div class="profe-ficha-bloque"><div class="uni-etiqueta">ya entregados.</div>${pasados.map(tarjeta).join('')}</div>` : ''}
        <div class="profe-pista">Cada entrega sale también en su día en el cuadrante.</div>`;
}

function profeAnadirDeber() {
    const c = profeClase(profeFicha.id);
    const titulo = document.getElementById('profe-deber-titulo')?.value.trim();
    const entrega = document.getElementById('profe-deber-entrega')?.value;
    if (!titulo || !entrega) { showToast('Escribe el deber y su fecha de entrega', true); return; }
    c.deberes.push({ id: 'deb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), titulo, puesto: document.getElementById('profe-deber-puesto')?.value || isoLocal(new Date()), entrega, entregados: {} });
    repintarFichaProfe();
    render();
    guardarProfe(`Para el ${profeFecha(entrega, true)}.`);
}

function profeEntregado(deberId, alumnoId, marcado) {
    const d = profeClase(profeFicha.id)?.deberes.find(x => x.id === deberId);
    if (!d) return;
    d.entregados = d.entregados || {};
    if (marcado) d.entregados[alumnoId] = true; else delete d.entregados[alumnoId];
    guardarProfe();
}

function profeCalificarDeber(deberId) {
    const c = profeClase(profeFicha.id);
    const d = c.deberes.find(x => x.id === deberId);
    if (!d) return;
    const id = 'eva_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    c.evaluaciones.push({ id, nombre: d.titulo, fecha: d.entrega, peso: 1, max: 10, periodo: '' });
    d.evaluacionId = id;
    profeFicha.pestana = 'cuaderno';
    profeFicha.periodo = '';
    repintarFichaProfe();
    guardarProfe('Columna creada en el cuaderno');
}

function profeBorrarDeber(deberId) {
    const c = profeClase(profeFicha.id);
    if (!confirm('¿Eliminar este deber?')) return;
    c.deberes = c.deberes.filter(x => x.id !== deberId);
    repintarFichaProfe();
    render();
    guardarProfe('Deber eliminado');
}

function profeEntregasDia(claseId, fecha) {
    const c = profeClase(claseId);
    return (c?.deberes || []).filter(d => d.entrega === fecha);
}

// ------------------------------------------------------------
//  HORARIO POR FRANJAS
// ------------------------------------------------------------
function profeFranjasDia(c, iso) {
    const w = new Date(iso + 'T12:00:00').getDay();
    return (c.horario || []).filter(h => Number(h.dia) === w).sort((a, b) => (a.inicio || '').localeCompare(b.inicio || ''));
}

function renderHorarioClaseProfe(c) {
    window._profeFranjas = (c.horario || []).map(h => ({ ...h }));
    return `
        <p class="finance-modal-note" style="margin-top:0">A qué horas y en qué aula das esta clase cada semana. Los días de la clase se toman de aquí, y la hora y el aula salen en el cuadrante y en el horario semanal.</p>
        <div id="profe-franjas">${renderFranjasProfe()}</div>
        <button class="btn-secondary" onclick="profeAnadirFranja()">+ franja.</button>
        <button class="btn-modal-primary" style="margin-top:10px" onclick="guardarHorarioClaseProfe()">guardar horario.</button>`;
}

function renderFranjasProfe() {
    const f = window._profeFranjas;
    if (!f.length) return '<div class="profe-ficha-vacio" style="padding:4px 2px 12px">Sin franjas todavía.</div>';
    return f.map((h, i) => `<div class="profe-franja">
        <select class="modal-input" onchange="window._profeFranjas[${i}].dia=Number(this.value)">${[1, 2, 3, 4, 5, 6].map(d => `<option value="${d}" ${Number(h.dia) === d ? 'selected' : ''}>${PROFE_DIAS[d]}</option>`).join('')}</select>
        <input class="modal-input" type="time" value="${h.inicio || ''}" onchange="window._profeFranjas[${i}].inicio=this.value" aria-label="Empieza">
        <input class="modal-input" type="time" value="${h.fin || ''}" onchange="window._profeFranjas[${i}].fin=this.value" aria-label="Acaba">
        <input class="modal-input" value="${escapeHtml(h.aula || '')}" placeholder="Aula" onchange="window._profeFranjas[${i}].aula=this.value.trim()">
        <button class="friend-remove-btn" onclick="window._profeFranjas.splice(${i},1);document.getElementById('profe-franjas').innerHTML=renderFranjasProfe()" aria-label="Quitar franja">✕</button>
    </div>`).join('');
}

function profeAnadirFranja() {
    const f = window._profeFranjas;
    const ultima = f[f.length - 1];
    f.push(ultima ? { dia: Math.min(6, Number(ultima.dia) + 1), inicio: ultima.inicio, fin: ultima.fin, aula: ultima.aula } : { dia: 1, inicio: '08:30', fin: '09:25', aula: '' });
    document.getElementById('profe-franjas').innerHTML = renderFranjasProfe();
}

function guardarHorarioClaseProfe() {
    const c = profeClase(profeFicha.id);
    const franjas = window._profeFranjas.filter(h => h.inicio && h.fin && h.inicio < h.fin);
    c.horario = franjas.map(h => ({ dia: Number(h.dia), inicio: h.inicio, fin: h.fin, aula: h.aula || '' }));
    if (c.horario.length) c.dias = [...new Set(c.horario.map(h => h.dia))].sort();
    repintarFichaProfe();
    render();
    guardarProfe('Horario guardado');
}

// Horario semanal de todas las clases: cada franja es un bloque del color
// de su clase, colocado por su hora real.
function renderHorarioSemanalProfe() {
    const p = datosProfe();
    const franjas = p.clases.flatMap(c => aulaProfe(c).horario.map(h => ({ ...h, c })));
    if (!franjas.length) return `<div class="uni-vacio"><p>Pon las horas y el aula de cada clase en su ficha (pulsa la clase en <b>mis clases.</b> → <b>horario.</b>) y aquí verás tu semana entera.</p></div>`;
    const min = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
    const desde = Math.floor(Math.min(...franjas.map(f => min(f.inicio))) / 60) * 60;
    const hasta = Math.ceil(Math.max(...franjas.map(f => min(f.fin))) / 60) * 60;
    const dias = franjas.some(f => Number(f.dia) === 6) ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
    const alto = (hasta - desde) * 1.1;
    const horas = [];
    for (let m = desde; m <= hasta; m += 60) horas.push(m);
    const hoyDia = new Date().getDay();
    return `<div class="profe-semana" style="--dias:${dias.length}">
        <div class="profe-semana-cab"><span></span>${dias.map(d => `<span class="${d === hoyDia ? 'hoy' : ''}">${PROFE_DIAS[d]}</span>`).join('')}</div>
        <div class="profe-semana-cuerpo" style="height:${alto}px">
            <div class="profe-semana-horas">${horas.map(m => `<span style="top:${(m - desde) * 1.1}px">${String(m / 60).padStart(2, '0')}:00</span>`).join('')}</div>
            ${dias.map(d => `<div class="profe-semana-dia ${d === hoyDia ? 'hoy' : ''}">${horas.map(m => `<i style="top:${(m - desde) * 1.1}px"></i>`).join('')}${franjas.filter(f => Number(f.dia) === d).map(f => `<button class="profe-bloque" style="--c:${f.c.color};top:${(min(f.inicio) - desde) * 1.1}px;height:${(min(f.fin) - min(f.inicio)) * 1.1 - 3}px" onclick="openFichaClaseProfe('${f.c.id}','horario')"><b>${escapeHtml(f.c.nombre)}</b><small>${f.inicio}–${f.fin}${f.aula ? ` · ${escapeHtml(f.aula)}` : ''}</small></button>`).join('')}</div>`).join('')}
        </div>
    </div>`;
}

// ------------------------------------------------------------
//  NOTAS RÁPIDAS DE CADA DÍA
// ------------------------------------------------------------
function openNotaDiaProfe(claseId, fecha) {
    const c = profeClase(claseId);
    if (!c) return;
    const texto = profeNotasDia()[`${claseId}|${fecha}`] || '';
    showModal(`
        <div class="modal-title">${escapeHtml(c.nombre)}, ${profeFecha(fecha, true)}.</div>
        <textarea id="profe-nota-dia" class="modal-input" rows="5" placeholder="Cómo fue la clase, qué repetir, quién faltó, qué quedó a medias...">${escapeHtml(texto)}</textarea>
        <button class="btn-modal-primary" onclick="guardarNotaDiaProfe('${claseId}','${fecha}')">guardar.</button>
    `);
    setTimeout(() => document.getElementById('profe-nota-dia')?.focus(), 50);
}

function guardarNotaDiaProfe(claseId, fecha) {
    const notas = profeNotasDia();
    const texto = document.getElementById('profe-nota-dia')?.value.trim() || '';
    if (texto) notas[`${claseId}|${fecha}`] = texto; else delete notas[`${claseId}|${fecha}`];
    closeModal();
    repintarProfeTrasCambio([claseId, fecha]);
    guardarProfe(texto ? 'Nota guardada' : 'Nota borrada');
}

function renderNotasClaseProfe(c) {
    const notas = Object.entries(profeNotasDia()).filter(([k]) => k.startsWith(c.id + '|')).map(([k, t]) => ({ fecha: k.split('|')[1], texto: t })).sort((a, b) => b.fecha.localeCompare(a.fecha));
    return `
        <button class="btn-secondary" onclick="openNotaDiaProfe('${c.id}','${isoLocal(new Date())}')">+ nota de hoy.</button>
        <div class="profe-ficha-bloque">${notas.length ? notas.map(n => `<button class="profe-nota-dia" onclick="openNotaDiaProfe('${c.id}','${n.fecha}')"><span>${profeFecha(n.fecha, true)}</span><p>${escapeHtml(n.texto)}</p></button>`).join('') : '<div class="profe-ficha-vacio">Sin notas todavía. También puedes añadirlas desde la casilla de cada día en el cuadrante.</div>'}</div>`;
}

// ------------------------------------------------------------
//  COPIAR A OTRO GRUPO Y PLANTILLAS
// ------------------------------------------------------------
function profeTitulosTemario(c, soloPorDar) {
    return datosProfe().sesiones.filter(s => s.claseId === c.id && profeConCasilla(s) && !s.descartada && (!soloPorDar || !s.hecha))
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.orden || 0) - (b.orden || 0)).map(s => s.titulo);
}

function openCopiarClaseProfe(id) {
    const p = datosProfe();
    const c = profeClase(id);
    if (!c) return;
    const otras = p.clases.filter(x => x.id !== id);
    showModal(`
        <div class="modal-title">copiar ${escapeHtml(c.nombre)} a otro grupo.</div>
        <p class="finance-modal-note" style="margin-top:0">Copia las tareas de este grupo, en el mismo orden, en los días de clase del otro a partir de la fecha que elijas. Lo que ya tenga el otro grupo se respeta.</p>
        <div class="modal-label">a qué grupo</div>
        <select id="profe-copia-destino" class="modal-input" onchange="document.getElementById('profe-copia-nuevo').hidden=this.value!=='nuevo'">
            ${otras.map(x => `<option value="${x.id}">${escapeHtml(x.nombre)}</option>`).join('')}
            <option value="nuevo" ${otras.length ? '' : 'selected'}>un grupo nuevo…</option>
        </select>
        <input id="profe-copia-nuevo" class="modal-input" placeholder="Nombre del grupo nuevo (1º ESO B)" ${otras.length ? 'hidden' : ''}>
        <div class="modal-label">desde</div>
        <input id="profe-copia-desde" class="modal-input" type="date" value="${isoLocal(new Date())}">
        <label class="profe-check-linea"><input type="checkbox" id="profe-copia-pordar" checked> solo lo que queda por dar en ${escapeHtml(c.nombre)}.</label>
        <button class="btn-modal-primary" style="margin-top:10px" onclick="copiarClaseProfe('${c.id}')">copiar.</button>
    `);
}

function copiarClaseProfe(id) {
    const p = datosProfe();
    const c = profeClase(id);
    let destinoId = document.getElementById('profe-copia-destino')?.value;
    if (destinoId === 'nuevo') {
        const nombre = document.getElementById('profe-copia-nuevo')?.value.trim();
        if (!nombre) { showToast('Ponle nombre al grupo nuevo', true); return; }
        const nueva = { id: 'clase_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), nombre, materia: c.materia, dias: [...(c.dias || [])], color: PROFE_COLORES[p.clases.length % PROFE_COLORES.length] };
        p.clases.push(nueva);
        destinoId = nueva.id;
    }
    const destino = profeClase(destinoId);
    const titulos = profeTitulosTemario(c, document.getElementById('profe-copia-pordar')?.checked);
    if (!destino || !titulos.length) { showToast('No hay tareas que copiar', true); return; }
    const ultima = profeRepartirTitulos(destino, titulos, document.getElementById('profe-copia-desde')?.value || isoLocal(new Date()));
    closeModal();
    render();
    guardarProfe(`${titulos.length} ${titulos.length === 1 ? 'tarea copiada' : 'tareas copiadas'} a ${destino.nombre}, hasta el ${profeFecha(ultima, true)}.`);
}

function profeRepartirTitulos(c, titulos, desde) {
    const p = datosProfe();
    let d = desde, ultima = desde;
    titulos.forEach(titulo => {
        d = profeSiguienteHueco(c, d);
        p.sesiones.push({ id: profeNuevoId(), claseId: c.id, fecha: d, titulo, hecha: false, orden: profeSesiones(c.id, d).length });
        ultima = d;
        d = profeSumar(d, 1);
    });
    return ultima;
}

function guardarPlantillaProfe(id) {
    const p = datosProfe();
    const c = profeClase(id);
    const titulos = profeTitulosTemario(c, false);
    if (!titulos.length) { showToast('Esta clase todavía no tiene tareas', true); return; }
    const nombre = prompt('Nombre de la plantilla', `${c.materia || c.nombre}`);
    if (!nombre || !nombre.trim()) return;
    if (!Array.isArray(p.plantillas)) p.plantillas = [];
    p.plantillas.push({ id: 'pla_' + Date.now(), nombre: nombre.trim(), materia: c.materia || '', tareas: titulos });
    guardarProfe(`Plantilla «${nombre.trim()}» guardada con ${titulos.length} tareas. La tienes en «repartir temario.».`);
}

function profeUsarPlantilla(id) {
    const pl = (datosProfe().plantillas || []).find(x => x.id === id);
    const area = document.getElementById('profe-rep-lineas');
    if (pl && area) area.value = pl.tareas.join('\n');
}

function profeBorrarPlantilla(id) {
    const p = datosProfe();
    const pl = (p.plantillas || []).find(x => x.id === id);
    if (!pl || !confirm(`¿Borrar la plantilla «${pl.nombre}»?`)) return;
    p.plantillas = p.plantillas.filter(x => x.id !== id);
    openRepartirProfe(document.getElementById('profe-rep-clase')?.value);
    guardarProfe('Plantilla borrada');
}

function renderPlantillasRepartirProfe() {
    const pl = datosProfe().plantillas || [];
    if (!pl.length) return '';
    return `<div class="modal-label">o empieza desde una plantilla</div>
        <div class="profe-plantillas">${pl.map(x => `<span class="profe-plantilla"><button type="button" class="profe-chip" onclick="profeUsarPlantilla('${x.id}')">${escapeHtml(x.nombre)} <small>${x.tareas.length}</small></button><button type="button" class="profe-plantilla-x" onclick="profeBorrarPlantilla('${x.id}')" aria-label="Borrar plantilla">✕</button></span>`).join('')}</div>`;
}

// ------------------------------------------------------------
//  EXPORTAR A PDF Y EXCEL
// ------------------------------------------------------------
function profeMesesCurso() {
    const p = datosProfe();
    const hoy = isoLocal(new Date());
    const fechas = [p.curso?.inicio, p.curso?.fin, hoy, ...p.sesiones.map(s => s.fecha)].filter(Boolean).sort();
    const meses = [];
    for (let d = new Date(fechas[0].slice(0, 7) + '-01T12:00:00'); isoLocal(d).slice(0, 7) <= fechas[fechas.length - 1].slice(0, 7); d.setMonth(d.getMonth() + 1)) meses.push(isoLocal(d).slice(0, 7));
    return meses;
}

function openExportarProfe(claseId) {
    const p = datosProfe();
    const mesActual = isoLocal(new Date()).slice(0, 7);
    showModal(`
        <div class="modal-title">exportar.</div>
        <div class="modal-label">qué</div>
        <select id="profe-exp-clase" class="modal-input">
            <option value="">todas las clases (el cuadrante del mes)</option>
            ${p.clases.map(c => `<option value="${c.id}" ${c.id === claseId ? 'selected' : ''}>${escapeHtml(c.nombre)}: tareas, notas del día, deberes y cuaderno</option>`).join('')}
        </select>
        <div class="modal-label">mes</div>
        <select id="profe-exp-mes" class="modal-input">${profeMesesCurso().map(m => `<option value="${m}" ${m === mesActual ? 'selected' : ''}>${new Date(m + '-15T12:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</option>`).join('')}</select>
        <div class="lab-horas" style="margin-top:6px">
            <button class="btn-modal-primary" style="margin:0" onclick="exportarProfe('pdf')">pdf.</button>
            <button class="btn-secondary" style="margin:0" onclick="exportarProfe('excel')">excel.</button>
        </div>
    `);
}

function profeDiasMes(mes) {
    const sabado = datosProfe().clases.some(c => (c.dias || []).includes(6));
    const dias = [];
    for (let d = mes + '-01'; d.startsWith(mes); d = profeSumar(d, 1)) {
        const w = new Date(d + 'T12:00:00').getDay();
        if (w !== 0 && (w !== 6 || sabado)) dias.push(d);
    }
    return dias;
}

function profeEstadoTexto(s) {
    if (s.descartada) return 'descartada';
    if (s.hecha === true) return 'hecha';
    if (s.hecha === null) return '';
    return profeEsPendiente(s) ? 'sin dar' : 'por hacer';
}

function profeRgb(hex, mezcla = 0) {
    const n = parseInt(String(hex || '#888888').slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => Math.round(v + (255 - v) * mezcla));
}

function profeNombreMes(mes) { return new Date(mes + '-15T12:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }); }

// Lo que se exporta, igual para PDF y Excel: el cuadrante del mes de todas
// las clases, o el detalle de una clase (tareas día a día, deberes y su
// cuaderno de notas).
function profeDatosExport(claseId, mes) {
    const p = datosProfe();
    const dias = profeDiasMes(mes);
    const fechaLarga = d => new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
    const linea = s => `${s.hecha === true ? '[x] ' : s.hecha === false && !s.descartada ? '[ ] ' : ''}${s.titulo}${s.descartada ? ' (descartada)' : ''}`;
    if (!claseId) {
        return {
            titulo: `cuadrante. ${profeNombreMes(mes)}`,
            sub: `${p.clases.length} clases`,
            tablas: [{
                cabecera: ['día', ...p.clases.map(c => c.nombre)],
                colores: [null, ...p.clases.map(c => c.color)],
                filas: dias.map(d => {
                    const festivo = profeEsFestivo(d);
                    return {
                        festivo,
                        celdas: [fechaLarga(d), ...p.clases.map(c => {
                            if (festivo) return profeNombreFestivo(d) || 'no lectivo';
                            const partes = profeSesiones(c.id, d).map(linea);
                            profeEntregasDia(c.id, d).forEach(x => partes.push(`Entrega: ${x.titulo}`));
                            const nota = profeNotasDia()[`${c.id}|${d}`];
                            if (nota) partes.push(`Nota: ${nota}`);
                            return partes.join('\n');
                        })],
                    };
                }),
            }],
        };
    }
    const c = aulaProfe(profeClase(claseId));
    const av = profeAvance(c);
    const cols = [...c.evaluaciones].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    const alumnos = [...c.alumnos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const tablas = [{
        titulo: 'tareas del mes.',
        cabecera: ['día', 'tareas', 'estado', 'nota del día'],
        colores: [null, c.color, null, null],
        filas: dias.filter(d => profeEsLectivo(c, d) || profeSesiones(c.id, d).length || profeEsFestivo(d)).map(d => {
            const ses = profeSesiones(c.id, d);
            const franjas = profeFranjasDia(c, d).map(h => `${h.inicio}${h.aula ? ` ${h.aula}` : ''}`).join(', ');
            return {
                festivo: profeEsFestivo(d),
                celdas: [`${fechaLarga(d)}${franjas ? `\n${franjas}` : ''}`, profeEsFestivo(d) ? (profeNombreFestivo(d) || 'no lectivo') : [...ses.map(s => s.titulo), ...profeEntregasDia(c.id, d).map(x => `Entrega: ${x.titulo}`)].join('\n'), ses.map(profeEstadoTexto).join('\n'), profeNotasDia()[`${c.id}|${d}`] || ''],
            };
        }),
    }];
    const deberes = c.deberes.filter(d => d.entrega.startsWith(mes)).sort((a, b) => a.entrega.localeCompare(b.entrega));
    if (deberes.length) tablas.push({
        titulo: 'deberes y entregas.',
        cabecera: ['para el', 'deber', 'entregados'],
        colores: [null, c.color, null],
        filas: deberes.map(d => ({ celdas: [fechaLarga(d.entrega), d.titulo, `${alumnos.filter(a => d.entregados?.[a.id]).length} de ${alumnos.length}`] })),
    });
    if (alumnos.length && cols.length) tablas.push({
        titulo: 'cuaderno de notas.',
        cabecera: ['alumno', ...cols.map(e => e.nombre), 'media'],
        colores: [null, ...cols.map(() => c.color), null],
        filas: alumnos.map(a => {
            const media = profeMediaAlumno(c, a.id, cols);
            return { suspensos: [null, ...cols.map(e => { const n = profeNotaDe(c, e.id, a.id); return n !== null && n / (Number(e.max) || 10) * 10 < 5; }), media !== null && media < 5],
                celdas: [a.nombre, ...cols.map(e => { const n = profeNotaDe(c, e.id, a.id); return n === null ? '' : profeNotaTexto(n); }), profeNotaTexto(media)] };
        }),
    });
    return {
        titulo: `${c.nombre}. ${profeNombreMes(mes)}`,
        sub: `${c.materia || ''}${c.materia ? '. ' : ''}Temario hecho: ${av.pct} % (${av.dadas} de ${av.total}). ${av.estado}`,
        color: c.color,
        tablas,
    };
}

async function exportarProfe(formato) {
    const claseId = document.getElementById('profe-exp-clase')?.value || '';
    const mes = document.getElementById('profe-exp-mes')?.value;
    const datos = profeDatosExport(claseId, mes);
    const nombre = `${(claseId ? profeClase(claseId).nombre : 'cuadrante')} ${mes}`.replace(/[^\wáéíóúñÁÉÍÓÚÑº ª-]/g, '').trim().replace(/\s+/g, '-');
    try {
        if (formato === 'pdf') await exportarPdfProfe(datos, nombre, !claseId);
        else await exportarExcelProfe(datos, nombre);
        closeModal();
    } catch (e) {
        console.error(e);
        showToast('No se pudo exportar. Revisa la conexión e inténtalo otra vez.', true);
    }
}

async function exportarPdfProfe(datos, nombre, apaisado) {
    await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: apaisado ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    const ancho = doc.internal.pageSize.getWidth();
    const margen = 12;
    const tinta = [33, 32, 30];
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...tinta);
    doc.text(datos.titulo, margen, 18);
    if (datos.color) { doc.setFillColor(...profeRgb(datos.color)); doc.rect(margen, 21.5, 24, 1.6, 'F'); }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110, 108, 102);
    doc.text(doc.splitTextToSize(datos.sub, ancho - margen * 2), margen, 28);
    let y = 34;
    datos.tablas.forEach(t => {
        if (t.titulo) {
            if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = 18; }
            doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...tinta);
            doc.text(t.titulo, margen, y + 4); y += 7;
        }
        doc.autoTable({
            startY: y,
            margin: { left: margen, right: margen, bottom: 16 },
            head: [t.cabecera],
            body: t.filas.map(f => f.celdas),
            theme: 'grid',
            styles: { font: 'helvetica', fontSize: apaisado ? 7.2 : 8.4, cellPadding: 1.8, lineColor: [220, 217, 210], lineWidth: 0.15, textColor: tinta, valign: 'top', overflow: 'linebreak' },
            headStyles: { fillColor: tinta, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: apaisado ? 7.6 : 8.6 },
            columnStyles: { 0: { cellWidth: apaisado ? 20 : 24, fontStyle: 'bold' } },
            didParseCell: data => {
                const fila = t.filas[data.row.index];
                if (data.section === 'head' && t.colores[data.column.index]) {
                    data.cell.styles.fillColor = profeRgb(t.colores[data.column.index], 0.08);
                }
                if (data.section !== 'body' || !fila) return;
                if (fila.festivo) { data.cell.styles.fillColor = [238, 235, 229]; data.cell.styles.textColor = [130, 127, 120]; data.cell.styles.fontStyle = 'italic'; return; }
                if (fila.suspensos?.[data.column.index]) { data.cell.styles.fillColor = [248, 226, 229]; data.cell.styles.textColor = [150, 30, 50]; data.cell.styles.fontStyle = 'bold'; }
                else if (t.colores[data.column.index] && data.cell.raw) data.cell.styles.fillColor = profeRgb(t.colores[data.column.index], 0.86);
            },
        });
        y = doc.lastAutoTable.finalY + 10;
    });
    const paginas = doc.internal.getNumberOfPages();
    for (let i = 1; i <= paginas; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(150, 147, 140);
        doc.text('bitácora.  appbitacora.es', margen, doc.internal.pageSize.getHeight() - 7);
        doc.text(`${i} / ${paginas}`, ancho - margen, doc.internal.pageSize.getHeight() - 7, { align: 'right' });
    }
    doc.save(`${nombre}.pdf`);
}

async function exportarExcelProfe(datos, nombre) {
    await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js');
    const libro = new window.ExcelJS.Workbook();
    libro.creator = 'Bitácora';
    const argb = (rgb) => 'FF' + rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    const borde = { style: 'thin', color: { argb: 'FFDCD9D2' } };
    datos.tablas.forEach((t, ti) => {
        const hoja = libro.addWorksheet((t.titulo || 'cuadrante').replace(/[.:/\\?*[\]]/g, '').slice(0, 30) || `hoja ${ti + 1}`, { views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] });
        hoja.addRow([datos.titulo]).font = { bold: true, size: 15, color: { argb: 'FF21201E' } };
        hoja.addRow([datos.sub]).font = { size: 10, color: { argb: 'FF6E6C66' } };
        const cab = hoja.addRow(t.cabecera);
        cab.height = 22;
        cab.eachCell((celda, i) => {
            const color = t.colores[i - 1];
            celda.font = { bold: true, color: { argb: color ? 'FF21201E' : 'FFFFFFFF' } };
            celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color ? argb(profeRgb(color, 0.55)) : 'FF21201E' } };
            celda.alignment = { vertical: 'middle', wrapText: true };
            celda.border = { top: borde, bottom: borde, left: borde, right: borde };
        });
        t.filas.forEach(f => {
            const fila = hoja.addRow(f.celdas);
            const lineas = Math.max(1, ...f.celdas.map(x => String(x || '').split('\n').length));
            fila.height = Math.max(18, lineas * 14);
            fila.eachCell({ includeEmpty: true }, (celda, i) => {
                celda.alignment = { vertical: 'top', wrapText: true };
                celda.border = { top: borde, bottom: borde, left: borde, right: borde };
                if (i === 1) celda.font = { bold: true };
                if (f.festivo) { celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEBE5' } }; celda.font = { italic: true, color: { argb: 'FF827F78' } }; }
                else if (f.suspensos?.[i - 1]) { celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8E2E5' } }; celda.font = { bold: true, color: { argb: 'FF961E32' } }; }
                else if (t.colores[i - 1] && celda.value) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(profeRgb(t.colores[i - 1], 0.86)) } };
            });
        });
        hoja.columns.forEach((col, i) => { col.width = i === 0 ? 16 : Math.min(48, Math.max(14, ...t.filas.map(f => Math.min(48, ...String(f.celdas[i] || '').split('\n').map(l => l.length + 2))), String(t.cabecera[i]).length + 4)); });
        hoja.mergeCells(1, 1, 1, Math.max(1, t.cabecera.length));
        hoja.mergeCells(2, 1, 2, Math.max(1, t.cabecera.length));
    });
    const buffer = await libro.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${nombre}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}
