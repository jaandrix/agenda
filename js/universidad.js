// ============================================================
//  UNIVERSIDAD (vista 'universidad', apartado opcional)
//  La carrera entera organizada por cuatrimestres: créditos, media del
//  expediente, calendario académico (clases, exámenes, extraordinaria) y
//  las asignaturas de cada cuatrimestre con lo que hace falta sacar para
//  aprobar. Estudios sigue siendo el día a día: con Universidad activa,
//  allí solo se ven las asignaturas del cuatrimestre actual.
//  Vive dentro de `studies` (studies.carrera y subject.cuatrimestre /
//  creditos / notaActa / convalidada), así que se sincroniza con Estudios.
// ============================================================
const UNI_HORARIO_VACIO = () => ({ lun: [], mar: [], mie: [], jue: [], vie: [], sab: [], dom: [] });

function carreraActiva() {
    return studies.carrera && Array.isArray(studies.carrera.cuatrimestres) ? studies.carrera : null;
}

function cuatriActual() {
    const c = carreraActiva();
    return c ? c.cuatrimestres.find(q => q.id === c.actual) || null : null;
}

function cuatrisOrdenados() {
    return [...(carreraActiva()?.cuatrimestres || [])].sort((a, b) => (a.curso - b.curso) || (a.periodo - b.periodo) || (a.inicio || '').localeCompare(b.inicio || ''));
}

function nombreCuatri(q, corto = false) {
    if (!q) return '';
    const periodo = q.periodo === 1 ? '1er' : '2º';
    return corto ? `${q.curso}º · ${periodo} cuatri.` : `${q.curso}º curso · ${periodo} cuatrimestre${q.anio ? ` · ${q.anio}` : ''}.`;
}

// Estudios llama a esto para listar asignaturas: con Universidad activa,
// solo las del cuatrimestre actual (y las que no tienen cuatrimestre).
function asignaturasEnCurso() {
    const q = apartadoVisible('universidad') ? cuatriActual() : null;
    return q ? studies.subjects.filter(s => !s.cuatrimestre || s.cuatrimestre === q.id) : studies.subjects;
}

let uniCuatriDestino = null;
function cuatriParaAsignaturaNueva() {
    if (!apartadoVisible('universidad')) return undefined;
    const id = uniCuatriDestino || cuatriActual()?.id;
    uniCuatriDestino = null;
    return id || undefined;
}

function notaAsignatura(s) {
    const acta = s.notaActa !== undefined && s.notaActa !== null && s.notaActa !== '' ? Number(s.notaActa) : null;
    return acta !== null && !isNaN(acta) ? acta : subjectFinalGrade(s);
}

function estadoAsignatura(s) {
    if (s.convalidada) return 'convalidada';
    const nota = notaAsignatura(s);
    const q = carreraActiva()?.cuatrimestres.find(x => x.id === s.cuatrimestre);
    const cerrada = s.notaActa !== undefined && s.notaActa !== null && s.notaActa !== '';
    if (nota !== null && nota >= 5 && (cerrada || (q && q.fin && q.fin < todayISO()))) return 'aprobada';
    if (nota !== null && nota < 5 && cerrada) return 'suspensa';
    if (q && q.inicio && q.inicio > todayISO()) return 'pendiente';
    return 'en curso';
}

// Lo que hace falta sacar en la parte que queda sin nota para llegar al 5,
// con los pesos de exámenes y trabajos. null si no hay pesos o no queda
// nada por evaluar.
function notaNecesaria(s) {
    const items = [...(s.exams || []), ...(s.assignments || [])].filter(x => Number(x.weight) > 0);
    if (!items.length) return null;
    const conNota = items.filter(x => x.grade !== '' && x.grade !== null && x.grade !== undefined && !isNaN(Number(x.grade)));
    const total = Math.max(100, items.reduce((t, x) => t + Number(x.weight), 0));
    const hecho = conNota.reduce((t, x) => t + Number(x.weight), 0);
    const queda = total - hecho;
    if (queda <= 0) return null;
    const puntos = conNota.reduce((t, x) => t + Number(x.grade) * Number(x.weight), 0);
    return { nota: (5 * total - puntos) / queda, queda };
}

function textoNotaNecesaria(s) {
    const n = notaNecesaria(s);
    if (!n) return '';
    if (n.nota <= 0) return 'aprobada pase lo que pase.';
    if (n.nota > 10) return `ya no llega al 5 con el ${Math.round(n.queda)}% que queda.`;
    return `necesitas un ${n.nota.toFixed(1).replace('.0', '')} en el ${Math.round(n.queda)}% que queda.`;
}

function expedienteCarrera() {
    const c = carreraActiva();
    let superados = 0, sumaNota = 0, sumaCred = 0, aprobadas = 0;
    studies.subjects.forEach(s => {
        const estado = estadoAsignatura(s);
        const cred = Number(s.creditos) > 0 ? Number(s.creditos) : 0;
        if (estado === 'convalidada') { superados += cred; aprobadas++; return; }
        if (estado !== 'aprobada') return;
        aprobadas++;
        superados += cred;
        const nota = notaAsignatura(s);
        const peso = cred || 6;
        sumaNota += nota * peso;
        sumaCred += peso;
    });
    const totales = Number(c?.creditosTotales) || 240;
    return { superados, totales, porcentaje: Math.min(100, Math.round(superados / totales * 100)), media: sumaCred ? sumaNota / sumaCred : null, aprobadas };
}

function diasEntre(a, b) {
    return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}

function fechaUni(iso) {
    return iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '—';
}

// En qué momento del cuatrimestre estamos: clases (semana X de Y),
// exámenes, extraordinaria o terminado.
function momentoCuatri(q) {
    const hoy = todayISO();
    const ex = q.examenes || {}, extra = q.extraordinaria || {};
    if (q.inicio && hoy < q.inicio) return { fase: 'antes', cifra: diasEntre(hoy, q.inicio), texto: diasEntre(hoy, q.inicio) === 1 ? 'día para empezar.' : 'días para empezar.' };
    if (q.inicio && q.fin && hoy <= q.fin) {
        const semanas = Math.max(1, Math.ceil((diasEntre(q.inicio, q.fin) + 1) / 7));
        const semana = Math.min(semanas, Math.floor(diasEntre(q.inicio, hoy) / 7) + 1);
        const aExamenes = ex.inicio ? diasEntre(hoy, ex.inicio) : null;
        return { fase: 'clases', cifra: semana, de: semanas, texto: `de ${semanas} semanas de clase.`, extra: aExamenes !== null && aExamenes > 0 ? `exámenes en ${aExamenes} días.` : '' };
    }
    if (ex.inicio && hoy < ex.inicio) return { fase: 'estudio', cifra: diasEntre(hoy, ex.inicio), texto: 'días para los exámenes.' };
    if (ex.inicio && ex.fin && hoy <= ex.fin) return { fase: 'examenes', cifra: diasEntre(hoy, ex.fin), texto: diasEntre(hoy, ex.fin) === 1 ? 'día de exámenes por delante.' : 'días de exámenes por delante.' };
    if (extra.inicio && hoy < extra.inicio) return { fase: 'espera', cifra: diasEntre(hoy, extra.inicio), texto: 'días para la extraordinaria.' };
    if (extra.inicio && extra.fin && hoy <= extra.fin) return { fase: 'extraordinaria', cifra: diasEntre(hoy, extra.fin), texto: 'días de extraordinaria por delante.' };
    return { fase: 'terminado', cifra: '✓', texto: 'cuatrimestre terminado.' };
}

function progresoCuatri(q) {
    const fin = q.extraordinaria?.fin || q.examenes?.fin || q.fin;
    if (!q.inicio || !fin) return 0;
    return Math.max(0, Math.min(100, Math.round(diasEntre(q.inicio, todayISO()) / Math.max(1, diasEntre(q.inicio, fin)) * 100)));
}

// El siguiente cuatrimestre ya ha empezado pero sigue marcado el anterior.
function cuatriQueDeberiaSerActual() {
    const q = cuatriActual();
    const hoy = todayISO();
    return cuatrisOrdenados().filter(x => x.id !== q?.id && x.inicio && x.inicio <= hoy && (!q || x.inicio > (q.inicio || ''))).pop() || null;
}

function renderUniversidad() {
    const c = carreraActiva();
    if (!c) return `
        <div class="uni-vista">
            <div class="uni-vacio">
                <div class="uni-titulo">universidad.</div>
                <p>Tu carrera entera, organizada por cuatrimestres: créditos superados, media del expediente, cuándo empiezan los exámenes y qué necesitas sacar en cada asignatura para aprobar.</p>
                <button class="btn-modal-primary" onclick="openConfigCarrera()">configurar mi carrera.</button>
            </div>
        </div>`;
    const q = cuatriActual();
    const exp = expedienteCarrera();
    const sugerido = cuatriQueDeberiaSerActual();
    const porCurso = {};
    cuatrisOrdenados().forEach(x => (porCurso[x.curso] = porCurso[x.curso] || []).push(x));
    return `
    <div class="uni-vista">
        <div class="uni-cabecera">
            <div>
                <div class="uni-titulo">universidad.</div>
                <div class="uni-sub">${escapeHtml(c.grado || 'mi carrera')}${c.universidad ? ` · ${escapeHtml(c.universidad)}` : ''}</div>
            </div>
            <button class="pedido-btn" onclick="openConfigCarrera()">editar carrera.</button>
        </div>

        ${sugerido ? `<div class="uni-aviso">${escapeHtml(nombreCuatri(sugerido))} ya ha empezado. <button class="pedido-btn pedido-btn-principal" onclick="hacerCuatriActual('${sugerido.id}')">pasar a él.</button></div>` : ''}

        <div class="uni-cifras">
            <div class="uni-cifra">
                <div class="uni-cifra-num">${exp.porcentaje}<small>%</small></div>
                <div class="uni-cifra-txt">de la carrera.<span>${exp.superados} de ${exp.totales} créditos</span></div>
                <div class="uni-barra"><span style="width:${exp.porcentaje}%"></span></div>
            </div>
            <div class="uni-cifra">
                <div class="uni-cifra-num">${exp.media !== null ? exp.media.toFixed(2) : '—'}</div>
                <div class="uni-cifra-txt">media del expediente.<span>${exp.aprobadas} ${exp.aprobadas === 1 ? 'asignatura superada' : 'asignaturas superadas'}</span></div>
            </div>
        </div>

        ${q ? renderCuatriActual(q) : '<div class="finance-empty-line">Ningún cuatrimestre marcado como actual.</div>'}

        <div class="uni-bloque-cab">
            <div class="uni-etiqueta">la carrera.</div>
            <button class="pedido-btn" onclick="openCuatri()">+ cuatrimestre.</button>
        </div>
        <div class="uni-cursos">
            ${Object.keys(porCurso).map(curso => `
                <div class="uni-curso">
                    <div class="uni-curso-num">${curso}º</div>
                    <div class="uni-curso-cuatris">${porCurso[curso].map(renderCuatriMini).join('')}</div>
                </div>`).join('')}
        </div>
    </div>`;
}

function renderCuatriActual(q) {
    const m = momentoCuatri(q);
    const asignaturas = studies.subjects.filter(s => s.cuatrimestre === q.id);
    const creditos = asignaturas.reduce((t, s) => t + (Number(s.creditos) || 0), 0);
    return `
        <section class="uni-actual">
            <div class="uni-actual-cab">
                <div>
                    <div class="uni-etiqueta">ahora.</div>
                    <div class="uni-actual-nombre">${nombreCuatri(q)}</div>
                </div>
                <button class="pedido-btn" onclick="openCuatri('${q.id}')">fechas.</button>
            </div>
            <div class="uni-momento">
                <div class="uni-momento-cifra">${m.cifra}</div>
                <div class="uni-momento-texto">${m.texto}${m.extra ? `<span>${m.extra}</span>` : ''}</div>
            </div>
            <div class="uni-calendario">
                <div class="uni-barra uni-barra-fina"><span style="width:${progresoCuatri(q)}%"></span></div>
                <div class="uni-calendario-fechas">
                    <span><b>clases.</b>${fechaUni(q.inicio)} – ${fechaUni(q.fin)}</span>
                    <span><b>exámenes.</b>${fechaUni(q.examenes?.inicio)} – ${fechaUni(q.examenes?.fin)}</span>
                    ${q.extraordinaria?.inicio ? `<span><b>extraordinaria.</b>${fechaUni(q.extraordinaria.inicio)} – ${fechaUni(q.extraordinaria.fin)}</span>` : ''}
                </div>
            </div>
            <div class="uni-bloque-cab">
                <div class="uni-etiqueta">asignaturas. <span>${asignaturas.length}${creditos ? ` · ${creditos} créditos` : ''}</span></div>
                <button class="pedido-btn" onclick="nuevaAsignaturaEn('${q.id}')">+ asignatura.</button>
            </div>
            ${asignaturas.length ? `<div class="uni-asignaturas">${asignaturas.map(renderAsignaturaUni).join('')}</div>` : '<div class="finance-empty-line">Añade las asignaturas de este cuatrimestre.</div>'}
        </section>`;
}

function renderAsignaturaUni(s) {
    const nota = notaAsignatura(s);
    const estado = estadoAsignatura(s);
    const necesita = estado === 'en curso' ? textoNotaNecesaria(s) : '';
    return `
        <div class="uni-asig uni-${estado.replace(' ', '-')}">
            <span class="uni-asig-color" style="background:${escapeHtml(s.color || '#5b8def')}"></span>
            <button class="uni-asig-cuerpo" onclick="openSubjectDetail('${s.id}')">
                <span class="uni-asig-nombre">${escapeHtml(s.name)}</span>
                <span class="uni-asig-meta">${s.creditos ? `${s.creditos} créditos · ` : ''}${estado}.${necesita ? ` ${necesita}` : ''}</span>
            </button>
            <span class="uni-asig-nota">${nota !== null ? nota.toFixed(1) : '—'}</span>
            <button class="uni-asig-editar" onclick="openAsignaturaCarrera('${s.id}')" aria-label="Créditos y nota">···</button>
        </div>`;
}

function renderCuatriMini(q) {
    const asignaturas = studies.subjects.filter(s => s.cuatrimestre === q.id);
    const actual = q.id === carreraActiva().actual;
    const pasado = !actual && (q.extraordinaria?.fin || q.examenes?.fin || q.fin || '9999') < todayISO();
    const notas = asignaturas.map(notaAsignatura).filter(n => n !== null);
    const media = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;
    return `
        <button class="uni-cuatri ${actual ? 'actual' : ''} ${pasado ? 'pasado' : ''}" onclick="openCuatriDetalle('${q.id}')">
            <span class="uni-cuatri-nombre">${q.periodo === 1 ? '1er' : '2º'} cuatri.${q.anio ? ` <small>${escapeHtml(q.anio)}</small>` : ''}</span>
            <span class="uni-cuatri-puntos">${asignaturas.map(s => `<i class="uni-${estadoAsignatura(s).replace(' ', '-')}" title="${escapeHtml(s.name)}"></i>`).join('') || '<small>sin asignaturas.</small>'}</span>
            <span class="uni-cuatri-meta">${actual ? 'ahora.' : media !== null ? `media ${media.toFixed(1)}.` : `${asignaturas.length} asignaturas.`}</span>
        </button>`;
}

function openCuatriDetalle(id) {
    const q = carreraActiva()?.cuatrimestres.find(x => x.id === id);
    if (!q) return;
    const asignaturas = studies.subjects.filter(s => s.cuatrimestre === q.id);
    showModal(`
        <div class="modal-title">${nombreCuatri(q)}</div>
        <div class="uni-asignaturas">${asignaturas.map(renderAsignaturaUni).join('') || '<div class="finance-empty-line">Sin asignaturas.</div>'}</div>
        <div class="uni-modal-acciones">
            <button class="pedido-btn" onclick="closeModal();nuevaAsignaturaEn('${q.id}')">+ asignatura.</button>
            <button class="pedido-btn" onclick="openCuatri('${q.id}')">fechas.</button>
            ${q.id !== carreraActiva().actual ? `<button class="pedido-btn pedido-btn-principal" onclick="closeModal();hacerCuatriActual('${q.id}')">hacer actual.</button>` : ''}
        </div>`);
}

function nuevaAsignaturaEn(id) {
    uniCuatriDestino = id;
    openAddSubject();
}

function anioAcademicoActual() {
    const d = new Date();
    const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
    return `${y}/${String(y + 1).slice(2)}`;
}

// Fechas típicas de un curso en España; luego se ajustan a mano.
function fechasTipicas(periodo, anio) {
    const y = Number(String(anio || anioAcademicoActual()).slice(0, 4));
    if (periodo === 1) return { inicio: `${y}-09-15`, fin: `${y}-12-22`, examenes: { inicio: `${y + 1}-01-08`, fin: `${y + 1}-01-31` }, extraordinaria: { inicio: `${y + 1}-06-15`, fin: `${y + 1}-07-10` } };
    return { inicio: `${y + 1}-02-09`, fin: `${y + 1}-05-22`, examenes: { inicio: `${y + 1}-05-25`, fin: `${y + 1}-06-12` }, extraordinaria: { inicio: `${y + 1}-06-22`, fin: `${y + 1}-07-10` } };
}

function openConfigCarrera() {
    const c = carreraActiva();
    const mes = new Date().getMonth();
    showModal(`
        <div class="modal-title">${c ? 'mi carrera.' : 'configurar mi carrera.'}</div>
        <div class="modal-label">Grado</div>
        <input id="uni-grado" class="modal-input" value="${escapeHtml(c?.grado || '')}" placeholder="Grado en Psicología">
        <div class="modal-row">
            <div><div class="modal-label">Universidad (opcional)</div><input id="uni-universidad" class="modal-input" value="${escapeHtml(c?.universidad || '')}" placeholder="Universidad de Valencia"></div>
            <div><div class="modal-label">Créditos de la carrera</div><input id="uni-creditos" class="modal-input" type="number" min="60" step="6" value="${c?.creditosTotales || 240}"></div>
        </div>
        ${c ? '' : `
        <div class="modal-row">
            <div><div class="modal-label">Curso actual</div><select id="uni-curso" class="modal-input">${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}">${n}º</option>`).join('')}</select></div>
            <div><div class="modal-label">Cuatrimestre</div><select id="uni-periodo" class="modal-input"><option value="1" ${mes >= 7 || mes === 0 ? 'selected' : ''}>1º (sep – ene)</option><option value="2" ${mes >= 1 && mes < 7 ? 'selected' : ''}>2º (feb – jun)</option></select></div>
        </div>
        ${studies.subjects.length ? `<label class="uni-check"><input type="checkbox" id="uni-mover" checked> Las ${studies.subjects.length} asignaturas que ya tengo son de este cuatrimestre.</label>` : ''}
        <div class="uni-hint">Pondremos las fechas típicas (clases, exámenes y extraordinaria); luego las ajustas con las de tu universidad.</div>`}
        <button class="btn-modal-primary" onclick="guardarCarrera()">guardar.</button>
        ${c ? `<button class="btn-secondary btn-danger-pill" style="width:100%;margin-top:10px" onclick="borrarCarrera()">quitar la carrera.</button>` : ''}
    `);
}

async function guardarCarrera() {
    const val = id => document.getElementById(id)?.value.trim() || '';
    const grado = val('uni-grado');
    if (!grado) { showToast('Escribe el nombre del grado', true); return; }
    const c = carreraActiva();
    if (c) Object.assign(c, { grado, universidad: val('uni-universidad'), creditosTotales: Number(val('uni-creditos')) || 240 });
    else {
        const curso = Number(val('uni-curso')) || 1, periodo = Number(val('uni-periodo')) || 1, anio = anioAcademicoActual();
        const q = { id: 'cuat_' + Date.now(), curso, periodo, anio, ...fechasTipicas(periodo, anio) };
        studies.carrera = { grado, universidad: val('uni-universidad'), creditosTotales: Number(val('uni-creditos')) || 240, cuatrimestres: [q], actual: q.id };
        if (document.getElementById('uni-mover')?.checked) studies.subjects.forEach(s => { if (!s.cuatrimestre) s.cuatrimestre = q.id; });
    }
    closeModal();
    render();
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}

async function borrarCarrera() {
    if (!confirm('¿Quitar la carrera? Las asignaturas se quedan en Estudios.')) return;
    delete studies.carrera;
    studies.subjects.forEach(s => delete s.cuatrimestre);
    closeModal();
    render();
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}

function openCuatri(id) {
    const q = id ? carreraActiva()?.cuatrimestres.find(x => x.id === id) : null;
    const ultimo = cuatrisOrdenados().pop();
    const curso = q?.curso || (ultimo ? (ultimo.periodo === 2 ? ultimo.curso + 1 : ultimo.curso) : 1);
    const periodo = q?.periodo || (ultimo && ultimo.periodo === 1 ? 2 : 1);
    const anio = q?.anio || (ultimo ? (ultimo.periodo === 2 ? `${Number(ultimo.anio.slice(0, 4)) + 1}/${String(Number(ultimo.anio.slice(0, 4)) + 2).slice(2)}` : ultimo.anio) : anioAcademicoActual());
    const f = q || fechasTipicas(periodo, anio);
    const fecha = (idCampo, v) => `<input id="${idCampo}" class="modal-input" type="date" value="${v || ''}">`;
    showModal(`
        <div class="modal-title">${q ? 'cuatrimestre.' : 'nuevo cuatrimestre.'}</div>
        <div class="modal-row">
            <div><div class="modal-label">Curso</div><select id="cu-curso" class="modal-input">${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${n === curso ? 'selected' : ''}>${n}º</option>`).join('')}</select></div>
            <div><div class="modal-label">Cuatrimestre</div><select id="cu-periodo" class="modal-input"><option value="1" ${periodo === 1 ? 'selected' : ''}>1º</option><option value="2" ${periodo === 2 ? 'selected' : ''}>2º</option></select></div>
            <div><div class="modal-label">Año</div><input id="cu-anio" class="modal-input" value="${escapeHtml(anio)}" placeholder="2026/27"></div>
        </div>
        <div class="modal-label">Clases</div>
        <div class="modal-row"><div>${fecha('cu-inicio', f.inicio)}</div><div>${fecha('cu-fin', f.fin)}</div></div>
        <div class="modal-label">Exámenes</div>
        <div class="modal-row"><div>${fecha('cu-ex-inicio', f.examenes?.inicio)}</div><div>${fecha('cu-ex-fin', f.examenes?.fin)}</div></div>
        <div class="modal-label">Extraordinaria (opcional)</div>
        <div class="modal-row"><div>${fecha('cu-extra-inicio', f.extraordinaria?.inicio)}</div><div>${fecha('cu-extra-fin', f.extraordinaria?.fin)}</div></div>
        <button class="btn-modal-primary" onclick="guardarCuatri(${q ? `'${q.id}'` : ''})">guardar.</button>
        ${q && q.id !== carreraActiva().actual ? `<button class="btn-secondary btn-danger-pill" style="width:100%;margin-top:10px" onclick="borrarCuatri('${q.id}')">borrar cuatrimestre.</button>` : ''}
    `);
}

async function guardarCuatri(id) {
    const val = k => document.getElementById(k)?.value.trim() || '';
    const datos = {
        curso: Number(val('cu-curso')) || 1, periodo: Number(val('cu-periodo')) || 1, anio: val('cu-anio'),
        inicio: val('cu-inicio'), fin: val('cu-fin'),
        examenes: { inicio: val('cu-ex-inicio'), fin: val('cu-ex-fin') },
        extraordinaria: { inicio: val('cu-extra-inicio'), fin: val('cu-extra-fin') },
    };
    if (datos.inicio && datos.fin && datos.fin < datos.inicio) { showToast('Las clases terminan antes de empezar', true); return; }
    const c = carreraActiva();
    const q = id ? c.cuatrimestres.find(x => x.id === id) : null;
    if (q) Object.assign(q, datos);
    else c.cuatrimestres.push({ id: 'cuat_' + Date.now(), ...datos });
    closeModal();
    render();
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}

async function borrarCuatri(id) {
    const n = studies.subjects.filter(s => s.cuatrimestre === id).length;
    if (!confirm(n ? `¿Borrar el cuatrimestre? Sus ${n} asignaturas se quedan en Estudios, sin cuatrimestre.` : '¿Borrar el cuatrimestre?')) return;
    const c = carreraActiva();
    c.cuatrimestres = c.cuatrimestres.filter(x => x.id !== id);
    studies.subjects.forEach(s => { if (s.cuatrimestre === id) delete s.cuatrimestre; });
    closeModal();
    render();
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}

// Cada cuatrimestre tiene su horario: el del actual vive en studies.schedule
// (lo que pinta Estudios) y al cambiar de cuatrimestre se guarda en el que
// se deja y se recupera el del nuevo.
async function hacerCuatriActual(id) {
    const c = carreraActiva();
    const nuevo = c?.cuatrimestres.find(x => x.id === id);
    if (!nuevo) return;
    const anterior = cuatriActual();
    if (anterior) anterior.horario = JSON.parse(JSON.stringify(studies.schedule));
    studies.schedule = nuevo.horario ? JSON.parse(JSON.stringify(nuevo.horario)) : UNI_HORARIO_VACIO();
    c.actual = id;
    render();
    showToast(`Ahora: ${nombreCuatri(nuevo, true)}`);
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}

function openAsignaturaCarrera(id) {
    const s = findSubject(id);
    if (!s) return;
    showModal(`
        <div class="modal-title">${escapeHtml(s.name)}</div>
        <div class="modal-row">
            <div><div class="modal-label">Créditos</div><input id="ua-creditos" class="modal-input" type="number" min="0" step="0.5" value="${s.creditos ?? ''}" placeholder="6"></div>
            <div><div class="modal-label">Nota oficial (acta)</div><input id="ua-acta" class="modal-input" type="number" min="0" max="10" step="0.1" value="${s.notaActa ?? ''}" placeholder="${subjectFinalGrade(s)?.toFixed(1) || 'sin nota'}"></div>
        </div>
        <div class="modal-label">Cuatrimestre</div>
        <select id="ua-cuatri" class="modal-input">${cuatrisOrdenados().map(q => `<option value="${q.id}" ${q.id === s.cuatrimestre ? 'selected' : ''}>${nombreCuatri(q, true)}${q.anio ? ` ${q.anio}` : ''}</option>`).join('')}<option value="" ${!s.cuatrimestre ? 'selected' : ''}>sin cuatrimestre</option></select>
        <label class="uni-check"><input type="checkbox" id="ua-convalidada" ${s.convalidada ? 'checked' : ''}> Convalidada o reconocida.</label>
        <div class="uni-hint">Sin nota oficial, la nota sale de tus exámenes y trabajos.</div>
        <button class="btn-modal-primary" onclick="guardarAsignaturaCarrera('${s.id}')">guardar.</button>
    `);
}

async function guardarAsignaturaCarrera(id) {
    const s = findSubject(id);
    if (!s) return;
    const val = k => document.getElementById(k)?.value.trim() || '';
    s.creditos = val('ua-creditos') ? Number(val('ua-creditos')) : null;
    const acta = val('ua-acta');
    if (acta !== '' && (Number(acta) < 0 || Number(acta) > 10)) { showToast('La nota va de 0 a 10', true); return; }
    if (acta === '') delete s.notaActa; else s.notaActa = Number(acta);
    if (val('ua-cuatri')) s.cuatrimestre = val('ua-cuatri'); else delete s.cuatrimestre;
    if (document.getElementById('ua-convalidada')?.checked) s.convalidada = true; else delete s.convalidada;
    closeModal();
    render();
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}
