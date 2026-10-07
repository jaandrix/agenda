// ============================================================
//  CV (Empleo → "crear mi cv.")
//  Un asistente por pasos que pregunta lo que un CV necesita y no está
//  en Bitácora (contacto, formación, idiomas) y, por cada empleo, qué
//  hacías, qué aprendiste y qué habilidades ganaste. Con eso genera un
//  PDF limpio de una columna con etiquetas a la izquierda.
//  Datos: `perfilLaboral` (sincronizado) y, en cada entrada de empleo,
//  cvFunciones / cvAprendido / cvHabilidades.
// ============================================================
const CV_NIVELES = ['Nativo', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1'];
let cvBorrador = null;
let cvEmpleosBorrador = {};
let cvPaso = 0;

function cvEmpleos() {
    const hoy = todayISO();
    return entries.filter(e => e.type === 'work').sort((a, b) => {
        const aActivo = !a.endDate || a.endDate >= hoy, bActivo = !b.endDate || b.endDate >= hoy;
        if (aActivo !== bActivo) return aActivo ? -1 : 1;
        return (b.startDate || '').localeCompare(a.startDate || '');
    });
}

function cvPuesto(w) { return w.position || w.title || 'Puesto'; }
function cvEmpresa(w) { return w.company || (w.position ? w.title : '') || ''; }

function cvPasos() {
    return ['tu', ...cvEmpleos().map(w => 'emp:' + w.id), 'formacion', 'habilidades', 'perfil', 'listo'];
}

function cvLista(texto) {
    return String(texto || '').split(/[,\n]/).map(x => x.trim()).filter(Boolean);
}

function openCv() {
    const c = typeof carreraActiva === 'function' ? carreraActiva() : null;
    const base = perfilLaboral || {};
    cvBorrador = {
        nombre: base.nombre || nombrePublico || userName || '',
        titular: base.titular || '',
        email: base.email || '',
        telefono: base.telefono || '',
        ciudad: base.ciudad || '',
        web: base.web || '',
        resumen: base.resumen || '',
        formacion: base.formacion?.length ? base.formacion : (c ? [{ titulo: c.grado, centro: c.universidad || '', inicio: (c.cuatrimestres || []).map(q => q.anio).filter(Boolean).sort()[0]?.slice(0, 4) || '', fin: '' }] : []),
        idiomas: base.idiomas?.length ? base.idiomas : [{ idioma: 'Español', nivel: 'Nativo' }],
        habilidades: base.habilidades || [],
        otros: base.otros || '',
    };
    cvEmpleosBorrador = Object.fromEntries(cvEmpleos().map(w => [w.id, {
        funciones: w.cvFunciones || '',
        aprendido: w.cvAprendido || w.logros || '',
        habilidades: w.cvHabilidades || [],
    }]));
    cvPaso = 0;
    showModal(`<div class="cv" id="cv">${renderCvPaso()}</div>`);
}

function renderCvPaso() {
    const pasos = cvPasos();
    const paso = pasos[cvPaso];
    const b = cvBorrador;
    const campo = (id, etiqueta, valor, extra = '') => `<div><div class="modal-label">${etiqueta}</div><input id="${id}" class="modal-input" value="${escapeHtml(valor || '')}" ${extra}></div>`;
    let titulo = '', pregunta = '', cuerpo = '';
    if (paso === 'tu') {
        titulo = 'tú.';
        pregunta = 'Lo básico para que te puedan contactar.';
        cuerpo = `
            ${campo('cv-nombre', 'Nombre y apellidos', b.nombre)}
            ${campo('cv-titular', 'Qué eres, en una línea', b.titular, 'placeholder="Estudiante de Psicología · Dependiente con experiencia en atención al cliente"')}
            <div class="modal-row">${campo('cv-email', 'Correo', b.email, 'type="email"')}${campo('cv-telefono', 'Teléfono', b.telefono, 'type="tel"')}</div>
            <div class="modal-row">${campo('cv-ciudad', 'Ciudad', b.ciudad)}${campo('cv-web', 'LinkedIn o web (opcional)', b.web)}</div>`;
    } else if (paso.startsWith('emp:')) {
        const w = entries.find(e => e.id === paso.slice(4));
        const d = cvEmpleosBorrador[w.id];
        titulo = `${escapeHtml(cvPuesto(w).toLowerCase())}.`;
        pregunta = `${escapeHtml(cvEmpresa(w) || 'Este empleo')} · ${cvFechas(w.startDate, w.endDate)}. Cuéntale a Bitácora qué hiciste allí; con eso se escribe esta parte del CV.`;
        cuerpo = `
            <div class="modal-label">¿Qué hacías en tu día a día?</div>
            <textarea id="cv-funciones" class="modal-input cv-texto" placeholder="Atendía a clientes en caja, reponía el almacén y cerraba la tienda.">${escapeHtml(d.funciones)}</textarea>
            <div class="modal-label">¿Qué aprendiste o de qué estás orgulloso? (una cosa por línea)</div>
            <textarea id="cv-aprendido" class="modal-input cv-texto" placeholder="Gestionar las quejas sin perder la calma.\nFormé a dos compañeros nuevos.">${escapeHtml(d.aprendido)}</textarea>
            <div class="modal-label">Habilidades que ganaste (separadas por comas)</div>
            <input id="cv-habilidades-emp" class="modal-input" value="${escapeHtml(d.habilidades.join(', '))}" placeholder="atención al cliente, trabajo en equipo, caja">`;
    } else if (paso === 'formacion') {
        titulo = 'formación.';
        pregunta = 'Lo que has estudiado, de lo más reciente a lo más antiguo. Deja el fin vacío si aún estás en ello.';
        cuerpo = `<div id="cv-formacion">${(b.formacion.length ? b.formacion : [{}]).map(renderCvFormacionFila).join('')}</div>
            <button class="pedido-btn" onclick="cvLeerPaso();cvBorrador.formacion.push({});cvRepintar()">+ estudios.</button>`;
    } else if (paso === 'habilidades') {
        const deEmpleos = [...new Set(Object.values(cvEmpleosBorrador).flatMap(d => d.habilidades))];
        if (!b.habilidades.length) b.habilidades = deEmpleos;
        const sugeridas = deEmpleos.filter(h => !b.habilidades.some(x => x.toLowerCase() === h.toLowerCase()));
        titulo = 'idiomas y habilidades.';
        pregunta = 'Los idiomas que hablas y lo que sabes hacer bien.';
        cuerpo = `
            <div id="cv-idiomas">${b.idiomas.map(renderCvIdiomaFila).join('')}</div>
            <button class="pedido-btn" onclick="cvLeerPaso();cvBorrador.idiomas.push({idioma:'',nivel:'B2'});cvRepintar()">+ idioma.</button>
            <div class="modal-label" style="margin-top:16px">Habilidades (separadas por comas)</div>
            <textarea id="cv-habilidades" class="modal-input cv-texto" placeholder="Excel, atención al cliente, Photoshop, carnet de conducir...">${escapeHtml(b.habilidades.join(', '))}</textarea>
            ${sugeridas.length ? `<div class="cv-sugeridas"><span>de tus empleos:</span>${sugeridas.map(h => `<button onclick="cvAnadirHabilidad(this.textContent)">${escapeHtml(h)}</button>`).join('')}</div>` : ''}
            <div class="modal-label">Otros (opcional)</div>
            <input id="cv-otros" class="modal-input" value="${escapeHtml(b.otros)}" placeholder="Carnet B, voluntariado en..., disponibilidad inmediata">`;
    } else if (paso === 'perfil') {
        titulo = 'tu perfil.';
        pregunta = 'Tres o cuatro líneas que abren el CV. Bitácora te propone un borrador con todo lo anterior: cámbialo a tu gusto.';
        cuerpo = `<textarea id="cv-resumen" class="modal-input cv-texto cv-texto-alto">${escapeHtml(b.resumen || cvBorradorResumen())}</textarea>
            <button class="pedido-btn" onclick="document.getElementById('cv-resumen').value=cvBorradorResumen()">volver a proponer.</button>`;
    } else {
        const empleos = cvEmpleos();
        titulo = 'listo.';
        pregunta = 'Tu CV tendrá:';
        cuerpo = `<ul class="cv-resumen-lista">
            <li><b>${escapeHtml(b.nombre || 'sin nombre')}</b>${b.titular ? ` · ${escapeHtml(b.titular)}` : ''}</li>
            <li>${empleos.length} ${empleos.length === 1 ? 'empleo' : 'empleos'} · ${b.formacion.filter(f => f.titulo).length} de formación · ${b.idiomas.filter(i => i.idioma).length} idiomas · ${b.habilidades.length} habilidades</li>
            ${!b.email && !b.telefono ? '<li class="cv-falta">Falta un correo o un teléfono de contacto.</li>' : ''}
        </ul>`;
    }
    const ultimo = cvPaso === pasos.length - 1;
    return `
        <div class="cv-progreso">${pasos.map((_, i) => `<span class="${i <= cvPaso ? 'hecho' : ''}"></span>`).join('')}</div>
        <div class="cv-kicker">crear mi cv. · ${cvPaso + 1} de ${pasos.length}</div>
        <div class="modal-title">${titulo}</div>
        <div class="cv-pregunta">${pregunta}</div>
        ${cuerpo}
        <div class="cv-nav">
            ${cvPaso ? '<button class="btn-secondary" onclick="cvIr(-1)">← atrás.</button>' : '<span></span>'}
            ${ultimo ? '<button class="btn-modal-primary" onclick="guardarYGenerarCv()">descargar pdf.</button>' : '<button class="btn-modal-primary" onclick="cvIr(1)">siguiente →</button>'}
        </div>`;
}

function renderCvFormacionFila(f, i) {
    return `<div class="cv-fila" data-i="${i}">
        <input class="modal-input cv-f-titulo" value="${escapeHtml(f.titulo || '')}" placeholder="Grado en..., Bachillerato, FP de...">
        <input class="modal-input cv-f-centro" value="${escapeHtml(f.centro || '')}" placeholder="Centro">
        <div class="cv-fila-fechas"><input class="modal-input cv-f-inicio" value="${escapeHtml(f.inicio || '')}" placeholder="Desde (2022)"><input class="modal-input cv-f-fin" value="${escapeHtml(f.fin || '')}" placeholder="Hasta (vacío = en curso)"></div>
    </div>`;
}

function renderCvIdiomaFila(x) {
    return `<div class="cv-idioma"><input class="modal-input cv-i-idioma" value="${escapeHtml(x.idioma || '')}" placeholder="Inglés"><select class="modal-input cv-i-nivel">${CV_NIVELES.map(n => `<option ${n === x.nivel ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
}

function cvLeerPaso() {
    const v = id => document.getElementById(id)?.value.trim() ?? null;
    const paso = cvPasos()[cvPaso];
    const b = cvBorrador;
    if (paso === 'tu') Object.assign(b, { nombre: v('cv-nombre'), titular: v('cv-titular'), email: v('cv-email'), telefono: v('cv-telefono'), ciudad: v('cv-ciudad'), web: v('cv-web') });
    else if (paso.startsWith('emp:')) cvEmpleosBorrador[paso.slice(4)] = { funciones: v('cv-funciones'), aprendido: v('cv-aprendido'), habilidades: cvLista(v('cv-habilidades-emp')) };
    else if (paso === 'formacion') b.formacion = [...document.querySelectorAll('#cv-formacion .cv-fila')].map(f => ({ titulo: f.querySelector('.cv-f-titulo').value.trim(), centro: f.querySelector('.cv-f-centro').value.trim(), inicio: f.querySelector('.cv-f-inicio').value.trim(), fin: f.querySelector('.cv-f-fin').value.trim() }));
    else if (paso === 'habilidades') {
        b.idiomas = [...document.querySelectorAll('#cv-idiomas .cv-idioma')].map(f => ({ idioma: f.querySelector('.cv-i-idioma').value.trim(), nivel: f.querySelector('.cv-i-nivel').value }));
        b.habilidades = cvLista(v('cv-habilidades'));
        b.otros = v('cv-otros');
    } else if (paso === 'perfil') b.resumen = v('cv-resumen');
}

function cvRepintar() {
    const el = document.getElementById('cv');
    if (el) el.innerHTML = renderCvPaso();
}

function cvIr(delta) {
    cvLeerPaso();
    if (cvPasos()[cvPaso] === 'tu' && !cvBorrador.nombre) { showToast('Escribe tu nombre', true); return; }
    cvPaso = Math.max(0, Math.min(cvPasos().length - 1, cvPaso + delta));
    cvRepintar();
    document.querySelector('#modal-container .modal-sheet')?.scrollTo(0, 0);
}

function cvAnadirHabilidad(h) {
    const t = document.getElementById('cv-habilidades');
    if (!t) return;
    t.value = [...cvLista(t.value), h].join(', ');
    cvLeerPaso();
    cvRepintar();
}

function cvMesesExperiencia() {
    const hoy = todayISO();
    return cvEmpleos().reduce((t, w) => {
        if (!w.startDate) return t;
        const fin = w.endDate && w.endDate < hoy ? w.endDate : hoy;
        return t + Math.max(0, Math.round((new Date(fin) - new Date(w.startDate)) / (30.44 * 86400000)));
    }, 0);
}

function cvListaNatural(xs) {
    return xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1];
}

function cvBorradorResumen() {
    const b = cvBorrador;
    const meses = cvMesesExperiencia();
    const puestos = [...new Set(cvEmpleos().map(w => cvPuesto(w).toLowerCase()))].slice(0, 2);
    const habilidades = [...new Set([...Object.values(cvEmpleosBorrador).flatMap(d => d.habilidades), ...b.habilidades].map(h => h.toLowerCase()))].slice(0, 4);
    const formacion = b.formacion.find(f => f.titulo);
    const exp = meses >= 12 ? `${Math.round(meses / 12)} ${Math.round(meses / 12) === 1 ? 'año' : 'años'}` : `${meses} ${meses === 1 ? 'mes' : 'meses'}`;
    const frases = [];
    if (formacion) frases.push(`${formacion.fin ? 'Formación:' : 'Cursando'} ${formacion.titulo}${formacion.centro ? ` (${formacion.centro})` : ''}.`);
    if (puestos.length && meses) frases.push(`${exp} de experiencia como ${cvListaNatural(puestos)}.`);
    if (habilidades.length) frases.push(`Destaco en ${cvListaNatural(habilidades)}.`);
    frases.push('Busco un puesto en el que seguir aprendiendo y aportar desde el primer día.');
    return frases.join(' ');
}

function cvFechas(inicio, fin) {
    const f = iso => {
        if (!iso) return '';
        if (/^\d{4}$/.test(iso)) return iso;
        const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
        return isNaN(d) ? iso : d.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }).replace('.', '');
    };
    const hoy = todayISO();
    return `${f(inicio)} — ${!fin || fin >= hoy ? 'actualidad' : f(fin)}`;
}

async function guardarYGenerarCv() {
    cvLeerPaso();
    perfilLaboral = { ...cvBorrador, formacion: cvBorrador.formacion.filter(f => f.titulo), idiomas: cvBorrador.idiomas.filter(i => i.idioma), actualizado: todayISO() };
    Object.entries(cvEmpleosBorrador).forEach(([id, d]) => {
        const w = entries.find(e => e.id === id);
        if (!w) return;
        w.cvFunciones = d.funciones; w.cvAprendido = d.aprendido; w.cvHabilidades = d.habilidades;
    });
    try { generarPdfCv(); }
    catch (e) { console.error(e); showToast('No se pudo generar el PDF', true); return; }
    closeModal();
    showToast('CV descargado');
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}

function generarPdfCv() {
    if (typeof window.jspdf === 'undefined') throw new Error('jsPDF no cargado');
    const p = perfilLaboral;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const M = 54, COL = 162, ANCHO = W - COL - M;
    const NEGRO = [17, 17, 17], GRIS = [105, 105, 105], LINEA = [215, 215, 215];
    let y = 70;
    const espacio = n => { if (y + n > H - 54) { doc.addPage(); y = 60; } };
    const texto = (t, x, tam, estilo = 'normal', color = NEGRO, ancho = ANCHO) => {
        doc.setFont('helvetica', estilo); doc.setFontSize(tam); doc.setTextColor(...color);
        const lineas = doc.splitTextToSize(String(t), ancho);
        espacio(lineas.length * tam * 1.35);
        doc.text(lineas, x, y);
        y += lineas.length * tam * 1.35;
    };
    const seccion = (nombre, pintar) => {
        espacio(40);
        y += 8;
        doc.setDrawColor(...LINEA); doc.setLineWidth(.6); doc.line(M, y, W - M, y);
        y += 20;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...GRIS);
        doc.text(nombre.toUpperCase(), M, y + 1, { charSpace: 1 });
        pintar();
        y += 4;
    };

    doc.setFont('helvetica', 'bold'); doc.setFontSize(26); doc.setTextColor(...NEGRO);
    doc.text(p.nombre || '', M, y);
    y += 20;
    if (p.titular) texto(p.titular, M, 12, 'normal', GRIS, W - M * 2);
    const contacto = [p.email, p.telefono, p.ciudad, p.web].filter(Boolean).join('   ·   ');
    if (contacto) { y += 2; texto(contacto, M, 9, 'normal', GRIS, W - M * 2); }
    y += 6;

    if (p.resumen) seccion('Perfil', () => texto(p.resumen, COL, 10));

    const empleos = cvEmpleos();
    if (empleos.length) seccion('Experiencia', () => {
        empleos.forEach((w, i) => {
            if (i) y += 12;
            espacio(48);
            const fechas = cvFechas(w.startDate, w.endDate);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
            const anchoFechas = doc.getTextWidth(fechas);
            doc.setTextColor(...GRIS); doc.text(fechas, W - M - anchoFechas, y);
            texto(cvPuesto(w), COL, 11, 'bold', NEGRO, ANCHO - anchoFechas - 12);
            if (cvEmpresa(w)) texto(cvEmpresa(w) + (WORK_MODALIDAD_LABELS[w.modalidad] ? ` · ${WORK_MODALIDAD_LABELS[w.modalidad].toLowerCase()}` : ''), COL, 9.5, 'normal', GRIS);
            y += 3;
            if (w.cvFunciones) texto(w.cvFunciones, COL, 9.5);
            String(w.cvAprendido || '').split('\n').map(x => x.trim()).filter(Boolean).forEach(l => {
                y += 1;
                doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...NEGRO);
                espacio(14);
                doc.text('–', COL, y);
                texto(l, COL + 11, 9.5, 'normal', NEGRO, ANCHO - 11);
            });
            if ((w.cvHabilidades || []).length) { y += 2; texto(w.cvHabilidades.join(' · '), COL, 8.5, 'normal', GRIS); }
        });
    });

    if (p.formacion?.length) seccion('Formación', () => {
        p.formacion.forEach((f, i) => {
            if (i) y += 8;
            const fechas = f.inicio || f.fin ? `${f.inicio || ''} — ${f.fin || 'en curso'}` : '';
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
            const anchoFechas = fechas ? doc.getTextWidth(fechas) : 0;
            if (fechas) { doc.setTextColor(...GRIS); doc.text(fechas, W - M - anchoFechas, y); }
            texto(f.titulo, COL, 11, 'bold', NEGRO, ANCHO - anchoFechas - 12);
            if (f.centro) texto(f.centro, COL, 9.5, 'normal', GRIS);
        });
    });

    if (p.habilidades?.length) seccion('Habilidades', () => texto(p.habilidades.join('   ·   '), COL, 10));
    if (p.idiomas?.length) seccion('Idiomas', () => texto(p.idiomas.map(i => `${i.idioma} — ${i.nivel.toLowerCase()}`).join('   ·   '), COL, 10));
    if (p.otros) seccion('Otros', () => texto(p.otros, COL, 10));

    const nombreArchivo = (p.nombre || 'cv').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    doc.save(`cv-${nombreArchivo}.pdf`);
}
