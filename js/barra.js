// ============================================================
//  BARRA DE APUNTAR (05-11): sustituye al «+ apuntar.» flotante del ordenador. Una barra fija bajo el contenido
//  en la que se escribe directamente; encima, un panel en directo enseña lo que va a pasar al pulsar intro:
//    · apuntar (por defecto): lo mismo que la hoja de Apuntar (apuntarTrocear, interpretarApunte, apuntarTipo,
//      apuntarCrear), con el tipo de cada cosa cambiable antes de guardar;
//    · buscar («busca: médico esta semana», «buscar cena»): lo que cuadra en eventos, tareas, cumpleaños,
//      exámenes, movimientos y notas, filtrado por tipo y fecha y con sinónimos (médico también encuentra dentista);
//    · preguntar («¿cuánto gasté en gasolina en octubre?»): la respuesta de responderPregunta (asistente.js).
//  En el móvil no sale: tiene su + en la barra de abajo.
// ============================================================
let barraElegidos = {};
let barraItems = [];
let barraModo = 'vacio';
let barraResultados = [];
let barraSel = 0;
let barraHecho = null;

const BARRA_BUSCAR_RE = /^\s*(?:busca(?:r|me)?|encuentra|d[oó]nde\s+(?:est[aá]|tengo))\s*:?\s+/i;
const BARRA_PISTA = [
    ['cena con marta el viernes a las 21', 'un evento'],
    ['gasté 12 en gasolina', 'un gasto'],
    ['busca: médico este mes', 'buscar'],
    ['¿cuánto gasté en comida en octubre?', 'una pregunta'],
];

function barraVisible() {
    return !document.body.classList.contains('mobile-standalone') && matchMedia('(min-width: 769px)').matches && !!document.getElementById('barra-texto');
}
function barraEntrada() { return document.getElementById('barra-texto'); }

// ---- búsqueda ----
const BARRA_TIPOS = [
    ['evento', /\b(eventos?|citas?|quedadas?|planes?)\b/],
    ['tarea', /\b(tareas?|pendientes?|recados?)\b/],
    ['gasto', /\b(gastos?|movimientos?|pagos?|cargos?|ingresos?|cobros?)\b/],
    ['nota', /\b(notas?|apuntes?)\b/],
    ['cumple', /\b(cumples?|cumpleanos)\b/],
    ['viaje', /\b(viajes?)\b/],
    ['examen', /\b(examen(es)?|entregas?)\b/],
];
// Palabras que significan lo mismo a efectos de buscar: «médico» encuentra la cita del dentista.
const BARRA_SINONIMOS = [
    ['medico', 'medica', 'doctor', 'doctora', 'dentista', 'hospital', 'clinica', 'consulta', 'fisio', 'fisioterapeuta', 'analisis', 'oculista', 'oftalmologo', 'dermatologo', 'ginecologo', 'pediatra', 'vacuna', 'urgencias', 'psicologo', 'salud', 'centro de salud', 'revision medica'],
    ['comida', 'comer', 'cena', 'cenar', 'almuerzo', 'desayuno', 'restaurante', 'tapas', 'merienda', 'brunch'],
    ['deporte', 'gimnasio', 'gym', 'correr', 'futbol', 'partido', 'padel', 'entrenamiento', 'entreno', 'natacion', 'yoga', 'bici', 'crossfit'],
    ['clase', 'examen', 'estudiar', 'universidad', 'facultad', 'entrega', 'tutoria', 'parcial'],
    ['viaje', 'vuelo', 'avion', 'tren', 'hotel', 'billete', 'reserva', 'aeropuerto'],
    ['cumple', 'cumpleanos', 'fiesta', 'celebracion', 'regalo'],
    ['super', 'supermercado', 'mercadona', 'lidl', 'carrefour', 'alimentacion', 'compra'],
    ['coche', 'gasolina', 'gasolinera', 'taller', 'itv', 'parking', 'aparcamiento'],
    ['banco', 'transferencia', 'bizum', 'nomina', 'sueldo', 'factura', 'recibo'],
    ['ocio', 'cine', 'pelicula', 'concierto', 'teatro', 'museo', 'exposicion'],
    ['trabajo', 'reunion', 'oficina', 'cliente', 'llamada'],
];
const BARRA_VACIAS = new Set('el la los las un una unos unas de del al a en con que me mi mis tu hay tengo tenia tuve todo todos toda todas algo alguna algun para por y o este esta estos estas ese esa lo le se su sus cuando donde'.split(' '));

function barraRango(q) {
    const hoy = todayISO();
    const mas = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoLocal(d); };
    const lunes = mas(hoy, -((new Date().getDay() + 6) % 7));
    const h = new Date();
    if (/\bpasado manana\b/.test(q)) return { desde: mas(hoy, 2), hasta: mas(hoy, 2), nombre: 'pasado mañana' };
    if (/\bmanana\b/.test(q)) return { desde: mas(hoy, 1), hasta: mas(hoy, 1), nombre: 'mañana' };
    if (/\bayer\b/.test(q)) return { desde: mas(hoy, -1), hasta: mas(hoy, -1), nombre: 'ayer' };
    if (/\bhoy\b/.test(q)) return { desde: hoy, hasta: hoy, nombre: 'hoy' };
    if (/\b(semana que viene|proxima semana)\b/.test(q)) return { desde: mas(lunes, 7), hasta: mas(lunes, 13), nombre: 'la semana que viene' };
    if (/\bsemana pasada\b/.test(q)) return { desde: mas(lunes, -7), hasta: mas(lunes, -1), nombre: 'la semana pasada' };
    if (/\besta semana\b/.test(q)) return { desde: lunes, hasta: mas(lunes, 6), nombre: 'esta semana' };
    if (/\b(mes que viene|proximo mes)\b/.test(q)) return { desde: isoLocal(new Date(h.getFullYear(), h.getMonth() + 1, 1, 12)), hasta: isoLocal(new Date(h.getFullYear(), h.getMonth() + 2, 0, 12)), nombre: 'el mes que viene' };
    if (/\beste mes\b/.test(q)) return { desde: isoLocal(new Date(h.getFullYear(), h.getMonth(), 1, 12)), hasta: isoLocal(new Date(h.getFullYear(), h.getMonth() + 1, 0, 12)), nombre: 'este mes' };
    if (/\b(proximos|siguientes)\s+dias\b|\bpronto\b|\blo que viene\b/.test(q)) return { desde: hoy, hasta: mas(hoy, 14), nombre: 'en los próximos días' };
    const p = typeof asistPeriodo === 'function' ? asistPeriodo(q) : null;
    if (p) return { ...p, hasta: /\beste ano\b/.test(q) ? `${h.getFullYear()}-12-31` : p.hasta };
    const dia = q.match(/\b(?:el\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
    if (dia) { const r = interpretarApunte(dia[0]); if (r.fechaDicha) return { desde: r.fecha, hasta: r.fecha, nombre: 'el ' + dia[1].replace('miercoles', 'miércoles').replace('sabado', 'sábado') }; }
    const fecha = q.match(/\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/);
    if (fecha) { const r = interpretarApunte(fecha[0]); if (r.fechaDicha) return { desde: r.fecha, hasta: r.fecha, nombre: 'el ' + fecha[0] }; }
    return null;
}

function barraPalabras(q) {
    let t = q.replace(/\b(pasado manana|manana|ayer|hoy|semana que viene|proxima semana|semana pasada|esta semana|mes que viene|proximo mes|este mes|mes pasado|este ano|ano pasado|proximos dias|siguientes dias|pronto|lo que viene)\b/g, ' ')
        .replace(/\b(?:en|de)\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(\s+(?:de\s+)?\d{4})?\b/g, ' ')
        .replace(/\b\d{1,2}\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/g, ' ')
        .replace(/\b(el\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/g, ' ');
    BARRA_TIPOS.forEach(([, re]) => { t = t.replace(new RegExp(re.source, 'g'), ' '); });
    return t.split(/[^a-z0-9ñ]+/).filter(w => w.length >= 3 && !BARRA_VACIAS.has(w));
}

// Puntos de una palabra en un texto: 3 si está tal cual (o sin la s final), 2 si está un sinónimo.
function barraPuntos(texto, w) {
    const raiz = w.length > 4 ? w.replace(/(es|s)$/, '') : w;
    if (texto.includes(w) || texto.includes(raiz)) return 3;
    const grupos = BARRA_SINONIMOS.filter(g => g.some(s => s === w || s === raiz || (raiz.length > 4 && s.startsWith(raiz))));
    for (const g of grupos) if (g.some(s => new RegExp(`(^|[^a-z0-9ñ])${s}`).test(texto))) return 2;
    return 0;
}

function barraCandidatos(rango) {
    const out = [];
    const norm = s => apuntarNorm(s || '');
    // Con un rango corto se recorre día a día: así salen también los cumpleaños, las recurrentes y lo virtual.
    const dias = [];
    if (rango) {
        const d = new Date(rango.desde + 'T12:00:00'), fin = new Date(rango.hasta + 'T12:00:00');
        for (let n = 0; d <= fin && n < 120; n++, d.setDate(d.getDate() + 1)) dias.push(isoLocal(d));
    }
    const vistos = new Set();
    const anadir = c => { const k = `${c.tipo}|${c.fecha}|${c.titulo}`; if (!vistos.has(k)) { vistos.add(k); out.push(c); } };
    const tipoEntrada = e => e.type === 'birthday' ? 'cumple' : e.type === 'travel' ? 'viaje' : e.type === 'subscription' || e.type === 'fixed_expense' ? 'gasto' : 'evento';
    if (dias.length) {
        dias.forEach(iso => {
            getDayAllEntries(iso).forEach(e => {
                if (e.type === 'work') return;
                anadir({ tipo: tipoEntrada(e), fecha: iso, hora: e.time || e.startTime || '', titulo: e.type === 'birthday' ? `cumpleaños de ${e.title}` : e.title || '', texto: norm([e.title, e.place, e.notes, e.eventType, e.type === 'birthday' ? 'cumpleanos' : ''].join(' ')), abrir: () => showDayEntries(iso) });
            });
            mobileDiaPlanner(iso).forEach(t => anadir({ tipo: 'tarea', fecha: iso, hora: t.time || '', titulo: t.title || t.text || '', texto: norm([t.title, t.text, t.notes].join(' ')), hecha: !!t.done, abrir: () => showDayEntries(iso) }));
        });
    } else {
        entries.forEach(e => {
            if (isCalendarLogEntry(e) || NON_CALENDAR_TYPES.includes(e.type)) return;
            const fecha = e.date || e.startDate;
            if (fecha) anadir({ tipo: tipoEntrada(e), fecha, hora: e.time || '', titulo: e.type === 'birthday' ? `cumpleaños de ${e.title}` : e.title || '', texto: norm([e.title, e.place, e.notes, e.eventType, e.type === 'birthday' ? 'cumpleanos' : ''].join(' ')), abrir: () => showDayEntries(fecha) });
        });
        Object.entries(dayPlanner.days || {}).forEach(([iso, lista]) => (lista || []).forEach(t => anadir({ tipo: 'tarea', fecha: iso, hora: t.time || '', titulo: t.title || t.text || '', texto: norm([t.title, t.text, t.notes].join(' ')), hecha: !!t.done, abrir: () => showDayEntries(iso) })));
    }
    (dayPlanner.backlog || []).filter(t => !t.done).forEach(t => anadir({ tipo: 'tarea', fecha: '', hora: '', titulo: t.title || t.text || '', texto: norm([t.title, t.text, t.notes].join(' ')), abrir: () => switchView('planner') }));
    (studies?.subjects || []).forEach(s => {
        (s.exams || []).forEach(x => x.date && anadir({ tipo: 'examen', fecha: x.date, hora: x.time || '', titulo: `${x.title || 'examen'} de ${s.name}`, texto: norm(`examen ${x.title} ${s.name}`), abrir: () => switchView('studies') }));
        (s.assignments || []).forEach(x => x.date && anadir({ tipo: 'examen', fecha: x.date, hora: x.time || '', titulo: `entrega: ${x.title || 'trabajo'} (${s.name})`, texto: norm(`entrega trabajo ${x.title} ${s.name}`), abrir: () => switchView('studies') }));
    });
    (financePro.transactions || []).forEach(t => t.date && t.type !== 'transfer' && anadir({ tipo: 'gasto', fecha: t.date, hora: t.hora || '', titulo: t.note || t.bankNote || 'movimiento', importe: (t.type === 'income' ? 1 : -1) * (Number(t.amount) || 0), texto: norm([t.note, t.bankNote, financeProCategoryById(t.category)?.name].join(' ')), abrir: () => switchView('finances') }));
    (notes || []).forEach(n => n.content && anadir({ tipo: 'nota', fecha: n.date || '', hora: '', titulo: n.content.split('\n').find(l => l.trim()) || 'nota', texto: norm(n.content), abrir: () => switchView('notes') }));
    return out;
}

function barraBuscar(consulta) {
    const q = apuntarNorm(consulta).replace(/[¿?¡!.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
    const rango = barraRango(q);
    const tipos = BARRA_TIPOS.filter(([, re]) => re.test(q)).map(([k]) => k);
    const palabras = barraPalabras(q);
    if (!palabras.length && !tipos.length && !rango) return { rango, tipos, palabras, lista: [] };
    const hoy = todayISO();
    const lista = barraCandidatos(rango)
        .filter(c => (!tipos.length || tipos.includes(c.tipo)) && (!rango || (c.fecha >= rango.desde && c.fecha <= rango.hasta)))
        .map(c => ({ ...c, puntos: palabras.reduce((s, w) => { const p = barraPuntos(c.texto, w); return s === null || !p ? null : s + p; }, 0) }))
        .filter(c => c.puntos !== null);
    // Primero lo que mejor cuadra; a igualdad, lo que viene (de antes a después) y luego lo pasado (lo más reciente antes).
    lista.sort((a, b) => {
        if (b.puntos !== a.puntos) return b.puntos - a.puntos;
        const fa = a.fecha >= hoy, fb = b.fecha >= hoy;
        if (fa !== fb) return fa ? -1 : 1;
        return fa ? (a.fecha + a.hora).localeCompare(b.fecha + b.hora) : (b.fecha + b.hora).localeCompare(a.fecha + a.hora);
    });
    return { rango, tipos, palabras, lista: lista.slice(0, 40) };
}

// ---- panel ----
function barraEscribir() {
    barraHecho = null;
    barraElegidos = {};
    barraPintar();
}

function barraPintar() {
    const panel = document.getElementById('barra-panel'), entrada = barraEntrada();
    if (!panel || !entrada) return;
    const texto = entrada.value;
    const enfocada = document.activeElement === entrada;
    document.getElementById('barra-apuntar')?.classList.toggle('escribiendo', !!texto.trim());
    if (barraHecho) { panel.innerHTML = barraHecho; panel.hidden = false; return; }
    if (!texto.trim()) {
        barraModo = 'vacio';
        panel.hidden = !enfocada;
        panel.innerHTML = `<div class="barra-pista">${BARRA_PISTA.map(([t, q]) => `<button type="button" onmousedown="event.preventDefault()" onclick="barraProbar('${jsAttr(t)}')"><span>${escapeHtml(t)}</span><small>${q}.</small></button>`).join('')}</div>`;
        return;
    }
    panel.hidden = false;
    if (BARRA_BUSCAR_RE.test(texto)) return barraPintarBusqueda(texto.replace(BARRA_BUSCAR_RE, ''));
    const respuesta = typeof responderPregunta === 'function' ? responderPregunta(texto) : null;
    if (respuesta) {
        barraModo = 'pregunta';
        panel.innerHTML = `<div class="barra-cab"><b>respuesta.</b><span>con tus datos, en este dispositivo.</span></div><div class="barra-respuesta">${escapeHtml(respuesta.texto)}</div>`;
        return;
    }
    barraModo = 'apuntar';
    barraItems = apuntarTrocear(texto).map(t => ({ texto: t, r: interpretarApunte(t) }));
    barraPintarApunte();
}

function barraPintarApunte() {
    const panel = document.getElementById('barra-panel');
    const tipos = APUNTAR_TIPOS.filter(([k]) => (k !== 'compra' || apartadoVisible('compra')) && (!['examen', 'trabajo', 'clase'].includes(k) || apartadoVisible('studies')) && (!APUNTAR_OCIO[k] || apartadoVisible('culture')));
    let faltan = 0;
    const filas = barraItems.map((it, k) => {
        const tipo = apuntarTipo(it.r, barraElegidos[k]);
        const d = apuntarDescribir(it.r, tipo);
        if (d.falta) faltan++;
        const nada = !barraElegidos[k] && tipo === 'tarea' && !it.r.fechaDicha && !it.r.hora && it.r.importe == null && !it.r.comprar && !it.r.nota && !it.r.estudio && !it.r.cumple;
        return `<div class="barra-item ${d.falta ? 'incompleto' : ''}">
            <i class="barra-item-ico">${APUNTAR_ICONOS[APUNTAR_ICONO_DE[tipo] || 'tarea']}</i>
            <div class="barra-item-cuerpo"><div class="barra-item-txt">${d.texto}</div>${d.falta ? `<small class="barra-falta">${d.falta}.</small>` : nada ? '<small class="barra-nota">sin fecha ni hora: irá como tarea para hoy.</small>' : ''}</div>
            <select class="barra-item-tipo" aria-label="Cambiar el tipo" onmousedown="event.stopPropagation()" onchange="barraElegidos[${k}]=this.value;barraPintarApunte()">${tipos.map(([v, t]) => `<option value="${v}" ${v === tipo ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </div>`;
    }).join('');
    panel.innerHTML = `<div class="barra-cab"><b>${barraItems.length > 1 ? `${barraItems.length} cosas.` : 'se apuntará.'}</b><span>${faltan ? `completa lo que falta o <button type="button" class="barra-enlace" onmousedown="event.preventDefault()" onclick="barraAbrirEnApuntar()">ábrelo en apuntar.</button>` : 'intro para apuntar.'}</span></div>${filas}`;
}

function barraPintarBusqueda(consulta) {
    barraModo = 'buscar';
    const panel = document.getElementById('barra-panel');
    const res = barraBuscar(consulta);
    barraResultados = res.lista;
    barraSel = Math.min(barraSel, Math.max(0, barraResultados.length - 1));
    const que = [res.palabras.length ? `«${consulta.trim()}»` : '', res.tipos.length ? res.tipos.map(t => ({ evento: 'eventos', tarea: 'tareas', gasto: 'movimientos', nota: 'notas', cumple: 'cumpleaños', viaje: 'viajes', examen: 'exámenes y entregas' }[t])).join(', ') : '', res.rango ? res.rango.nombre : ''].filter(Boolean).join(', ');
    if (!que) { panel.innerHTML = '<div class="barra-cab"><b>buscar.</b><span>escribe qué buscas: «busca: dentista», «busca: eventos la semana que viene».</span></div>'; return; }
    const fechaTxt = c => !c.fecha ? 'sin fecha' : apuntarFechaTexto(c.fecha) + (c.hora ? ' ' + c.hora : '');
    const visibles = barraResultados.slice(0, 8);
    panel.innerHTML = `<div class="barra-cab"><b>${barraResultados.length ? `${barraResultados.length} ${barraResultados.length === 1 ? 'resultado' : 'resultados'}.` : 'nada.'}</b><span>${escapeHtml(que)}${barraResultados.length ? ', intro abre el marcado.' : ''}</span></div>
        ${visibles.map((c, i) => `<button type="button" class="barra-res ${i === barraSel ? 'sel' : ''} ${c.hecha ? 'hecha' : ''}" onmousedown="event.preventDefault()" onclick="barraSel=${i};barraAbrirResultado()">
            <i class="barra-item-ico">${APUNTAR_ICONOS[APUNTAR_ICONO_DE[c.tipo === 'examen' ? 'examen' : c.tipo] || 'tarea']}</i>
            <span class="barra-res-tit">${escapeHtml(c.titulo)}</span>
            ${c.importe != null ? `<span class="barra-res-imp ${c.importe < 0 ? '' : 'ingreso'}">${c.importe < 0 ? '−' : '+'}${financeMoney(Math.abs(c.importe))}</span>` : ''}
            <span class="barra-res-fecha">${escapeHtml(fechaTxt(c))}</span>
        </button>`).join('')}
        ${barraResultados.length > 8 ? `<div class="barra-mas">y ${barraResultados.length - 8} más: afina la búsqueda con una fecha o un tipo.</div>` : ''}
        ${!barraResultados.length ? '<div class="barra-mas">Prueba con otra palabra o sin fecha.</div>' : ''}`;
}

function barraProbar(texto) {
    const e = barraEntrada();
    if (!e) return;
    e.value = texto;
    e.focus();
    barraEscribir();
}

function barraAbrirResultado() {
    const c = barraResultados[barraSel];
    if (!c) return;
    barraLimpiar(true);
    try { c.abrir(); } catch (e) { console.error(e); }
}

function barraAbrirEnApuntar() {
    const e = barraEntrada();
    const texto = e?.value || '';
    try { localStorage.setItem(apuntarClaveBorrador(), JSON.stringify({ texto, actualizado: Date.now() })); } catch (_) { /* sin almacenamiento */ }
    barraLimpiar(true);
    openApuntar();
}

function barraLimpiar(salir) {
    const e = barraEntrada(), panel = document.getElementById('barra-panel');
    if (e) { e.value = ''; if (salir) e.blur(); }
    barraElegidos = {};
    barraItems = [];
    barraSel = 0;
    document.getElementById('barra-apuntar')?.classList.remove('escribiendo');
    if (panel && salir) panel.hidden = true;
}

async function barraEnviar() {
    const e = barraEntrada();
    const texto = e?.value.trim() || '';
    if (!texto) { e?.focus(); return; }
    if (barraModo === 'buscar') { barraAbrirResultado(); return; }
    if (barraModo === 'pregunta') return;
    barraItems = apuntarTrocear(texto).map(t => ({ texto: t, r: interpretarApunte(t) }));
    const malos = barraItems.map((it, k) => apuntarDescribir(it.r, apuntarTipo(it.r, barraElegidos[k])).falta).filter(Boolean);
    if (malos.length) { barraPintarApunte(); document.getElementById('barra-apuntar')?.classList.add('aviso'); setTimeout(() => document.getElementById('barra-apuntar')?.classList.remove('aviso'), 400); return; }
    const hechos = [];
    barraItems.forEach((it, k) => {
        const tipo = apuntarTipo(it.r, barraElegidos[k]);
        const res = apuntarCrear(it.texto, it.r, tipo);
        if (res.error) return;
        apuntarRegistrar(it.texto, tipo, res.aviso, res.hecho);
        hechos.push({ aviso: res.aviso, id: apuntesRecientes[0]?.id });
    });
    if (!hechos.length) { showToast('No he podido apuntarlo', true); return; }
    barraLimpiar(false);
    invalidarCachesDerivadas();
    render();
    barraHecho = `<div class="barra-cab"><b>apuntado.</b><span><button type="button" class="barra-enlace" onmousedown="event.preventDefault()" onclick="barraDeshacer()">deshacer.</button></span></div>${hechos.map(h => `<div class="barra-hecho">${escapeHtml(h.aviso)}.</div>`).join('')}`;
    window._barraDeshacer = hechos.map(h => h.id).filter(Boolean);
    barraPintar();
    clearTimeout(window._barraHechoTemp);
    window._barraHechoTemp = setTimeout(() => { barraHecho = null; barraPintar(); }, 5000);
    try { await saveData(); } catch (err) { console.error(err); showToast('No se pudo guardar en la nube', true); }
}

async function barraDeshacer() {
    const ids = window._barraDeshacer || [];
    window._barraDeshacer = [];
    barraHecho = null;
    for (const id of ids) await deshacerApunte(id);
    barraPintar();
}

function barraTecla(ev) {
    if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); barraEnviar(); return; }
    if (ev.key === 'Escape') { ev.preventDefault(); barraLimpiar(true); return; }
    if (barraModo === 'buscar' && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
        ev.preventDefault();
        const n = Math.min(8, barraResultados.length);
        if (!n) return;
        barraSel = (barraSel + (ev.key === 'ArrowDown' ? 1 : n - 1)) % n;
        barraPintarBusqueda(barraEntrada().value.replace(BARRA_BUSCAR_RE, ''));
    }
}

function barraSalir() {
    setTimeout(() => {
        if (document.activeElement === barraEntrada()) return;
        const panel = document.getElementById('barra-panel');
        if (panel && !barraHecho) panel.hidden = true;
    }, 120);
}

function barraEnfocar() {
    const e = barraEntrada();
    if (!e) return false;
    e.focus();
    barraEscribir();
    return true;
}
