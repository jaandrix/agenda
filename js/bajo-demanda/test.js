// ============================================================
//  TEST COMPETITIVO (Estudios → repaso → test.)
//  Tests tipo test (pregunta y de 2 a 6 opciones, una correcta) que se
//  practican a solas o se juegan con amigos. Una partida la crea alguien,
//  elige los segundos por pregunta, cuánto tiempo está abierta y a qué
//  amigos invita; cada uno la juega una vez cuando quiere y se ve la
//  clasificación. Se responde con el teclado: 1, 2, 3...
//  Datos: `estudiar.tests` (sincronizado) = [{ id, titulo, preguntas: [{
//  pregunta, opciones: [..], correcta }], creado }]. Las partidas viven en
//  Supabase (`partidas_test`, `resultados_test`): las respuestas correctas
//  no salen nunca del servidor antes de jugar y la puntuación se calcula
//  allí (ver supabase/sql/tests_competitivos.sql). 3 partidas creadas por
//  persona y día.
// ============================================================
const TEST_PROMPT_IA = `Crea un test tipo test para Bitácora con el temario que te paso.
Devuélvelo SOLO como un bloque JSON, sin texto antes ni después, con este formato:
{"titulo": "Tema 3: la célula", "preguntas": [{"pregunta": "¿Qué orgánulo produce la energía de la célula?", "opciones": ["El núcleo", "La mitocondria", "El ribosoma", "El aparato de Golgi"], "correcta": 1}]}
Reglas: entre 10 y 30 preguntas; 4 opciones por pregunta (entre 2 y 6 si hace falta); "correcta" es la posición de la opción buena empezando por 0; una sola respuesta correcta; opciones de longitud parecida y plausibles, sin «todas las anteriores» ni trampas; preguntas cortas que se lean en pocos segundos; cambia de sitio la correcta entre preguntas.
Temario:
`;
const TEST_SEGUNDOS = [10, 15, 20, 30, 45, 60];
const TEST_HORAS = [[6, '6 horas'], [24, '1 día'], [48, '2 días'], [168, '1 semana']];
let testJuego = null;         // la partida en curso (práctica o con amigos)
let testPartidas = null;      // partidas de Supabase en las que participo
let testCargando = false;
let testYoId = null;        // id de la cuenta, para saber cuáles son mías

function datosTests() {
    const e = datosEstudiar();
    if (!Array.isArray(e.tests)) e.tests = [];
    return e.tests;
}

// Admite el JSON de la IA (con o sin ```), y también la lista de preguntas sola.
// Las IAs no siempre obedecen al formato: se aceptan también comillas tipográficas o simples, claves sin comillas,
// comas sobrantes, claves en inglés («question», «answer»), la correcta como letra («B») o como el texto de la opción,
// y opciones como objeto ({"A": "..."}). Si llegan dos bloques, vale el primero.
function testBloqueJson(t) {
    const i = t.search(/[{[]/);
    if (i < 0) return '';
    let nivel = 0, cadena = null;
    for (let k = i; k < t.length; k++) {
        const ch = t[k];
        if (cadena) { if (ch === '\\') k++; else if (ch === cadena) cadena = null; continue; }
        if (ch === '"' || ch === "'") cadena = ch;
        else if (ch === '{' || ch === '[') nivel++;
        else if ((ch === '}' || ch === ']') && --nivel === 0) return t.slice(i, k + 1);
    }
    return t.slice(i);
}
function testParsear(t) {
    try { return JSON.parse(t); } catch (_) { /* se intenta arreglar */ }
    const arreglado = t.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'")
        .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (m, s) => JSON.stringify(s.replace(/\\'/g, "'")))
        .replace(/([{,]\s*)([A-Za-z_áéíóúñ][\wáéíóúñ]*)\s*:/g, '$1"$2":')
        .replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(arreglado); } catch (_) { return null; }
}
function testCorrecta(q, opciones) {
    let v = q?.correcta ?? q?.respuesta ?? q?.answer ?? q?.correct ?? q?.correctAnswer ?? q?.solucion;
    if (typeof v === 'number' || /^\s*\d+\s*$/.test(String(v ?? ''))) return Number(v);
    const s = String(v ?? '').trim();
    if (/^[a-f]$/i.test(s) || /^[a-f]\)\s*/i.test(s)) return s.toLowerCase().charCodeAt(0) - 97;
    const limpio = x => String(x).toLowerCase().replace(/^[a-f1-6][).:-]\s+/, '').trim();
    return opciones.findIndex(o => limpio(o) === limpio(s));
}
function testLeer(texto) {
    const t = String(texto || '').trim().replace(/```(?:json)?/gi, '');
    const obj = testParsear(testBloqueJson(t));
    const lista = Array.isArray(obj) ? obj : obj?.preguntas || obj?.questions;
    if (!Array.isArray(lista)) return null;
    const preguntas = lista.map(q => {
        const crudas = q?.opciones ?? q?.options ?? q?.respuestas ?? [];
        const opciones = (Array.isArray(crudas) ? crudas : crudas && typeof crudas === 'object' ? Object.values(crudas) : []).map(o => String(o ?? '').trim().slice(0, 200)).filter(Boolean).slice(0, 6);
        return { pregunta: String(q?.pregunta ?? q?.question ?? '').trim().slice(0, 500), opciones, correcta: testCorrecta(q, opciones) };
    }).filter(q => q.pregunta && q.opciones.length >= 2 && Number.isInteger(q.correcta) && q.correcta >= 0 && q.correcta < q.opciones.length).slice(0, 50);
    if (!preguntas.length) return null;
    return { titulo: String((Array.isArray(obj) ? '' : obj?.titulo) || 'test').trim().slice(0, 120), preguntas };
}

function testAnadir(test, id) {
    const lista = datosTests();
    const nuevo = { id: id || 'test_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), titulo: test.titulo, preguntas: test.preguntas, creado: todayISO() };
    if (lista.some(x => x.id === nuevo.id)) return null;
    lista.unshift(nuevo);
    return nuevo;
}

// ------------------------------------------------------------ pestaña
function renderEstTest() {
    if (!testPartidas && !testCargando) cargarPartidasTest();
    const tests = datosTests();
    const yo = testYoId;
    const ahora = new Date().toISOString();
    const partidas = testPartidas || [];
    const pendientes = partidas.filter(p => p.caduca > ahora && !p.yaJugada);
    const resto = partidas.filter(p => !pendientes.includes(p)).slice(0, 12);
    const fila = p => `<button class="est-test-fila" onclick="openPartidaTest('${p.id}')">
            <b>${escapeHtml(p.titulo)}</b>
            <span>${p.creador === yo ? 'tuya' : escapeHtml(p.creadorNombre || 'de un amigo')}, ${p.preguntas.length} preguntas, ${p.segundos} s</span>
            <i>${p.yaJugada ? `${p.misPuntos} pts` : p.caduca > ahora ? `cierra ${testCuando(p.caduca)}` : 'cerrada'}</i>
        </button>`;
    return `<div class="est-test">
        <div class="est-test-acciones">
            <button class="btn-modal-primary" onclick="openNuevoTest()">nuevo test.</button>
            <button class="profe-chip" onclick="navigator.clipboard.writeText(TEST_PROMPT_IA).then(() => showToast('Copiado: pégalo en Claude o ChatGPT con tu temario'))">copiar prompt para la IA.</button>
        </div>
        <p class="est-ayuda">Pídele a una IA un test con tu temario (copia el prompt) y pégalo en <b>nuevo test.</b>, o pídeselo directamente por el conector. Después, practica a solas o crea una partida con tus amigos: cada uno la juega una vez y gana quien más puntos saca. Se responde con el teclado: 1, 2, 3…</p>
        <div class="uni-etiqueta">por jugar.</div>
        ${testCargando && !testPartidas ? '<p class="est-ayuda">cargando…</p>' : pendientes.length ? pendientes.map(fila).join('') : '<p class="est-ayuda">Ninguna partida abierta ahora mismo.</p>'}
        <div class="uni-etiqueta">tus tests.</div>
        ${tests.length ? tests.map(t => `<div class="est-test-fila est-test-mio">
            <b>${escapeHtml(t.titulo)}</b><span>${t.preguntas.length} preguntas</span>
            <div class="est-test-botones">
                <button class="profe-chip" onclick="empezarPracticaTest('${t.id}')">practicar.</button>
                <button class="profe-chip" onclick="openCrearPartidaTest('${t.id}')">jugar con amigos.</button>
                <button class="profe-chip" onclick="borrarTest('${t.id}')" aria-label="Borrar test"><i class='ico ico-x'></i></button>
            </div>
        </div>`).join('') : '<p class="est-ayuda">Todavía no tienes tests.</p>'}
        ${resto.length ? `<div class="uni-etiqueta">jugadas y cerradas.</div>${resto.map(fila).join('')}` : ''}
    </div>`;
}

function testCuando(iso) {
    const h = Math.round((new Date(iso) - new Date()) / 36e5);
    return h < 1 ? 'en menos de una hora' : h < 48 ? `en ${h} h` : `en ${Math.round(h / 24)} días`;
}

async function cargarPartidasTest() {
    testCargando = true;
    try {
        const { data: { session } } = await sb.auth.getSession();
        const yo = testYoId = session?.user?.id || null;
        const { data, error } = await sb.from('partidas_test').select('id, creador, titulo, preguntas, segundos, invitados, caduca, creada').order('creada', { ascending: false }).limit(60);
        if (error) throw error;
        const ids = (data || []).map(p => p.id);
        const { data: mios } = ids.length ? await sb.from('resultados_test').select('partida, puntos, terminada').eq('jugador', yo).in('partida', ids) : { data: [] };
        const porPartida = Object.fromEntries((mios || []).map(r => [r.partida, r]));
        if (typeof amigos !== 'undefined' && !amigos.length) await cargarAmigos();
        const nombre = id => amigos.find(a => a.friend_id === id)?.nombre_visible;
        testPartidas = (data || []).map(p => ({ ...p, yaJugada: !!porPartida[p.id], misPuntos: porPartida[p.id]?.puntos ?? 0, creadorNombre: nombre(p.creador) }));
    } catch (e) {
        console.error('Error cargando partidas:', e);
        testPartidas = [];
    }
    testCargando = false;
    if (currentView === 'estudiar' && estudiarPestana === 'test' && !modalEnPantalla()) render();
}

// ------------------------------------------------------------ crear, borrar
function openNuevoTest() {
    showModal(`
        <div class="modal-title">nuevo test.</div>
        <p class="est-ayuda">Pega aquí lo que te ha devuelto la IA con el prompt de Bitácora.</p>
        <textarea id="test-json" class="modal-input" rows="10" placeholder='{"titulo": "...", "preguntas": [{"pregunta": "...", "opciones": ["...", "..."], "correcta": 0}]}'></textarea>
        <button class="btn-modal-primary" onclick="guardarNuevoTest()">guardar test.</button>
        <button class="btn-secondary" style="margin-top:8px" onclick="navigator.clipboard.writeText(TEST_PROMPT_IA).then(() => showToast('Copiado: pégalo en Claude o ChatGPT con tu temario'))">copiar prompt para la IA.</button>
    `);
}

function guardarNuevoTest() {
    const t = testLeer(document.getElementById('test-json')?.value);
    if (!t) { showToast('No entiendo el test: revisa que sea el bloque JSON que devuelve la IA', true); return; }
    testAnadir(t);
    closeModal();
    estudiarPestana = 'test';
    render();
    guardarEstudiar();
    showToast(`Test «${t.titulo}» guardado: ${t.preguntas.length} preguntas`);
}

function borrarTest(id) {
    const t = datosTests().find(x => x.id === id);
    if (!t || !confirm(`¿Borrar el test «${t.titulo}»? Las partidas ya creadas siguen abiertas.`)) return;
    datosEstudiar().tests = datosTests().filter(x => x.id !== id);
    render();
    guardarEstudiar();
}

async function openCrearPartidaTest(id) {
    const t = datosTests().find(x => x.id === id);
    if (!t) return;
    if (!amigos.length) await cargarAmigos();
    showModal(`
        <div class="modal-title">jugar con amigos.</div>
        <p class="est-ayuda">«${escapeHtml(t.titulo)}», ${t.preguntas.length} preguntas. Cada uno la juega una vez, cuando quiera mientras esté abierta. Puedes crear 3 partidas al día.</p>
        <div class="modal-label">Segundos por pregunta</div>
        <div class="profe-dias-elegir" id="test-segundos">${TEST_SEGUNDOS.map(s => `<button type="button" class="profe-chip ${s === 20 ? 'activa' : ''}" data-v="${s}" onclick="this.parentNode.querySelectorAll('.profe-chip').forEach(b => b.classList.toggle('activa', b === this))">${s} s</button>`).join('')}</div>
        <div class="modal-label">Abierta durante</div>
        <div class="profe-dias-elegir" id="test-horas">${TEST_HORAS.map(([h, txt]) => `<button type="button" class="profe-chip ${h === 24 ? 'activa' : ''}" data-v="${h}" onclick="this.parentNode.querySelectorAll('.profe-chip').forEach(b => b.classList.toggle('activa', b === this))">${txt}</button>`).join('')}</div>
        <div class="modal-label">Amigos</div>
        ${amigos.length ? `<div class="est-test-amigos">${amigos.map(a => `<label class="est-test-amigo"><input type="checkbox" value="${escapeHtml(a.friend_id)}" checked> ${escapeHtml(a.nombre_visible || 'Amigo')}</label>`).join('')}</div>`
            : '<p class="est-ayuda">Todavía no tienes amigos agregados: añádelos en Social → amigos. Puedes crear la partida igual y jugarla tú.</p>'}
        <button class="btn-modal-primary" onclick="crearPartidaTest('${id}')">crear partida.</button>
    `);
}

async function crearPartidaTest(id) {
    const t = datosTests().find(x => x.id === id);
    if (!t) return;
    const segundos = Number(document.querySelector('#test-segundos .activa')?.dataset.v) || 20;
    const horas = Number(document.querySelector('#test-horas .activa')?.dataset.v) || 24;
    const invitados = [...document.querySelectorAll('.est-test-amigo input:checked')].map(i => i.value);
    const { data, error } = await sb.rpc('crear_partida_test', { p_titulo: t.titulo, p_preguntas: t.preguntas, p_segundos: segundos, p_horas: horas, p_invitados: invitados });
    if (error) { showToast(error.message || 'No se pudo crear la partida', true); return; }
    closeModal();
    showToast(invitados.length ? `Partida creada para ${invitados.length} ${invitados.length === 1 ? 'amigo' : 'amigos'}` : 'Partida creada');
    testPartidas = null;
    estudiarPestana = 'test';
    render();
    if (data) setTimeout(() => openPartidaTest(data), 400);
}

// ------------------------------------------------------------ partida: ficha y clasificación
async function openPartidaTest(id) {
    if (!testPartidas) await cargarPartidasTest();
    const p = (testPartidas || []).find(x => x.id === id);
    if (!p) return;
    const { data: tabla } = await sb.rpc('clasificacion_partida_test', { p_partida: id });
    const abierta = p.caduca > new Date().toISOString();
    showModal(`
        <div class="modal-title">${escapeHtml(p.titulo)}</div>
        <p class="est-ayuda">${p.preguntas.length} preguntas, ${p.segundos} segundos cada una. ${abierta ? `Cierra ${testCuando(p.caduca)}.` : 'Cerrada.'}</p>
        <div class="uni-etiqueta">clasificación.</div>
        ${(tabla || []).length ? `<ol class="est-test-tabla">${tabla.map(r => `<li class="${r.jugador === testYoId ? 'yo' : ''}"><span>${escapeHtml(r.nombre)}</span><b>${r.terminada ? r.puntos + ' pts' : 'jugando'}</b><i>${r.terminada ? `${r.aciertos}/${p.preguntas.length}` : ''}</i></li>`).join('')}</ol>` : '<p class="est-ayuda">Nadie la ha jugado todavía.</p>'}
        ${abierta && !p.yaJugada ? `<button class="btn-modal-primary" onclick="empezarPartidaTest('${id}')">jugar.</button><p class="finance-modal-note">Solo se puede jugar una vez: en cuanto empieces, cuenta. Responde con 1, 2, 3… o pulsando la opción.</p>` : ''}
        ${p.yaJugada ? `<button class="btn-secondary" onclick="repasarPartidaTest('${id}')">ver respuestas.</button>` : ''}
    `);
}

async function repasarPartidaTest(id) {
    const p = (testPartidas || []).find(x => x.id === id);
    const { data: correctas, error } = await sb.rpc('soluciones_partida_test', { p_partida: id });
    if (error || !p || !correctas) { showToast('No se pudieron cargar las respuestas', true); return; }
    showModal(`
        <div class="modal-title">respuestas.</div>
        <ol class="est-test-repaso">${p.preguntas.map((q, i) => `<li><b>${escapeHtml(q.pregunta)}</b><span>${escapeHtml(q.opciones[correctas[i]] || '')}</span></li>`).join('')}</ol>
    `);
}

// ------------------------------------------------------------ jugar
function empezarPracticaTest(id) {
    const t = datosTests().find(x => x.id === id);
    if (!t) return;
    testJuego = { modo: 'practica', titulo: t.titulo, preguntas: t.preguntas, segundos: 20, i: 0, respuestas: [], inicio: 0, correctas: t.preguntas.map(q => q.correcta) };
    testSiguiente();
}

async function empezarPartidaTest(id) {
    const { data, error } = await sb.rpc('empezar_partida_test', { p_partida: id });
    if (error) { showToast(error.message || 'No se pudo empezar', true); return; }
    const p = (testPartidas || []).find(x => x.id === id);
    if (p) p.yaJugada = true;
    testJuego = { modo: 'partida', id, titulo: data.titulo, preguntas: data.preguntas, segundos: data.segundos, i: 0, respuestas: [], inicio: 0 };
    testSiguiente();
}

function testSiguiente() {
    const j = testJuego;
    if (!j) return;
    if (j.i >= j.preguntas.length) { terminarJuegoTest(); return; }
    const q = j.preguntas[j.i];
    j.inicio = performance.now();
    clearTimeout(j.reloj);
    j.reloj = setTimeout(() => responderTest(null), j.segundos * 1000);
    showModal(`<div class="est-test-juego" aria-label="Pregunta ${j.i + 1} de ${j.preguntas.length}">
        <div class="est-test-cab"><span>${escapeHtml(j.titulo)}</span><b>${j.i + 1}/${j.preguntas.length}</b></div>
        <div class="est-test-tiempo"><i style="animation-duration:${j.segundos}s"></i></div>
        <div class="est-test-pregunta">${escapeHtml(q.pregunta)}</div>
        <div class="est-test-opciones">${q.opciones.map((o, k) => `<button onclick="responderTest(${k})"><kbd>${k + 1}</kbd><span>${escapeHtml(o)}</span></button>`).join('')}</div>
        <button class="est-test-salir" onclick="abandonarTest()">abandonar.</button>
    </div>`);
}

function responderTest(k) {
    const j = testJuego;
    if (!j || j.respondiendo) return;
    clearTimeout(j.reloj);
    const ms = Math.round(performance.now() - j.inicio);
    j.respuestas.push({ opcion: k, ms });
    if (j.modo === 'practica') {
        // En práctica se ve al momento si era la buena.
        j.respondiendo = true;
        const botones = document.querySelectorAll('.est-test-opciones button');
        botones.forEach((b, i) => { b.disabled = true; b.classList.toggle('bien', i === j.correctas[j.i]); b.classList.toggle('mal', i === k && k !== j.correctas[j.i]); });
        setTimeout(() => { j.respondiendo = false; j.i++; testSiguiente(); }, 900);
        return;
    }
    j.i++;
    testSiguiente();
}

async function terminarJuegoTest() {
    const j = testJuego;
    testJuego = null;
    let r;
    if (j.modo === 'practica') {
        const aciertos = j.respuestas.filter((x, i) => x.opcion === j.correctas[i]).length;
        r = { puntos: null, aciertos, total: j.preguntas.length };
    } else {
        const { data, error } = await sb.rpc('terminar_partida_test', { p_partida: j.id, p_respuestas: j.respuestas });
        if (error) { closeModal(); showToast(error.message || 'No se pudo guardar el resultado', true); return; }
        r = data;
        const p = (testPartidas || []).find(x => x.id === j.id);
        if (p) p.misPuntos = r.puntos;
    }
    showModal(`
        <div class="modal-title">${r.aciertos} de ${r.total}.</div>
        ${r.puntos !== null ? `<p class="est-test-puntos"><b>${r.puntos}</b> puntos</p>` : '<p class="est-ayuda">Práctica: no cuenta para ninguna partida.</p>'}
        ${j.modo === 'partida' ? `<button class="btn-modal-primary" onclick="openPartidaTest('${j.id}')">ver clasificación.</button>` : `<button class="btn-modal-primary" onclick="closeModal()">cerrar.</button>`}
    `);
    if (j.modo === 'partida') { testPartidas = null; cargarPartidasTest(); }
}

function abandonarTest() {
    const j = testJuego;
    if (!j) { closeModal(); return; }
    if (j.modo === 'partida' && !confirm('Si abandonas, lo que no hayas respondido cuenta como fallo y no podrás volver a jugarla. ¿Abandonar?')) return;
    clearTimeout(j.reloj);
    if (j.modo === 'practica') { testJuego = null; closeModal(); return; }
    while (j.respuestas.length < j.preguntas.length) j.respuestas.push({ opcion: null, ms: j.segundos * 1000 });
    j.i = j.preguntas.length;
    terminarJuegoTest();
}

// Teclado: 1-6 responde; Escape pregunta antes de abandonar (va en captura
// para adelantarse al Escape global, que cerraría el modal sin más).
document.addEventListener('keydown', e => {
    if (!testJuego) return;
    if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); abandonarTest(); return; }
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= (testJuego.preguntas[testJuego.i]?.opciones.length || 0)) { e.preventDefault(); responderTest(n - 1); }
}, true);
