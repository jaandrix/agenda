// ============================================================
//  BIENVENIDA, PRUEBA GRATUITA Y FIN DE LA PRUEBA
//  - Bienvenida: seis pasos la primera vez que entra una cuenta nueva
//    (nombre, perfil, apartados, primera tarea, llevarla contigo, listo).
//    Se marca en `bienvenida` (sincronizado) para no repetirla en otro
//    dispositivo. Las cuentas legado no la ven: ya conocen la app.
//  - Aviso de prueba en Home (escritorio y móvil) con los días que quedan.
//  - Si la prueba o el regalo caducan con la app abierta, se vuelve a
//    startApp(), que enseña la pantalla de pago.
// ============================================================
const BIENVENIDA_PASOS = ['hola', 'perfil', 'apartados', 'primero', 'contigo', 'listo'];
let bienvenidaPaso = 0;
let bienvenidaBorrador = null;

function comprobarBienvenida() {
    if (bienvenida || !suscripcionActual || suscripcionActual.estado === 'legado' || modoSinConexion || suscripcionActual.sinRed) return;
    openBienvenida();
}

function openBienvenida() {
    const cfg = configApartados();
    bienvenidaBorrador = { nombre: (nombrePublico || userName || '').trim(), perfil: cfg.perfil, opcionales: { ...cfg.opcionales }, tarea: '', ejemplo: false };
    bienvenidaPaso = 0;
    showModal(`<div class="bienvenida" id="bienvenida">${renderBienvenidaPaso()}</div>`);
    document.querySelector('#modal-container .modal-sheet')?.classList.add('bienvenida-sheet');
}

function diasPrueba() {
    const s = suscripcionActual;
    const fin = s?.estado === 'prueba' ? s.trial_fin : s?.estado === 'regalo' ? s.periodo_fin : null;
    return fin ? Math.max(0, Math.ceil((new Date(fin) - new Date()) / 86400000)) : null;
}

function esDispositivo() {
    const ua = navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
    if (/android/i.test(ua)) return 'android';
    return 'ordenador';
}

function renderBienvenidaPaso() {
    const b = bienvenidaBorrador;
    const paso = BIENVENIDA_PASOS[bienvenidaPaso];
    let cuerpo = '';
    if (paso === 'hola') {
        cuerpo = `
            <div class="bienvenida-marca">bitácora.</div>
            <h2>tu vida, en un solo sitio.</h2>
            <p>Tu calendario, tus tareas, tus finanzas, tus estudios y tus planes, conectados entre sí: lo que apuntas en un sitio aparece donde hace falta. Sin anuncios.</p>
            <div class="bienvenida-promesas"><span>sin anuncios.</span><span>tus datos son tuyos.</span><span>exportas todo cuando quieras.</span></div>
            <label class="bienvenida-label" for="bv-nombre">¿cómo te llamas?</label>
            <input id="bv-nombre" class="modal-input" value="${escapeHtml(b.nombre)}" placeholder="Tu nombre" autocomplete="given-name" onkeydown="if(event.key==='Enter')bienvenidaIr(1)">`;
    } else if (paso === 'perfil') {
        cuerpo = `
            <h2>${b.nombre ? `${escapeHtml(b.nombre.split(' ')[0])}, ¿qué te describe?` : '¿qué te describe?'}</h2>
            <p>Bitácora se adapta: enseña lo que vas a usar y esconde lo demás. Lo puedes cambiar cuando quieras en Ajustes.</p>
            <div class="bienvenida-opciones">${PERFILES.map(p => `
                <button class="bienvenida-opcion ${b.perfil === p.id ? 'activa' : ''}" onclick="bienvenidaBorrador.perfil='${p.id}';if('${p.id}'!=='trabajador')bienvenidaBorrador.opcionales.universidad=bienvenidaBorrador.opcionales.universidad||false;bienvenidaRepintar()">
                    <b>${p.id === 'estudiante' ? 'estudio.' : p.id === 'trabajador' ? 'trabajo.' : 'las dos cosas.'}</b><span>${p.texto}</span>
                </button>`).join('')}</div>`;
    } else if (paso === 'apartados') {
        const opcionales = APARTADOS_OPCIONALES.filter(o => o.view !== 'studies' && o.view !== 'work' && !(o.view === 'universidad' && b.perfil === 'trabajador'));
        cuerpo = `
            <h2>elige qué quieres ver.</h2>
            <p>Siempre tienes calendario, planificador, rutinas, notas, eventos, finanzas, ocio, viajes y social. Estos son opcionales:</p>
            <div class="bienvenida-lista">${opcionales.map(o => `
                <label class="bienvenida-fila">
                    <span><b>${o.titulo}</b><small>${o.texto}</small></span>
                    <button class="finance-pro-switch ${b.opcionales[o.view] ? 'on' : ''}" onclick="event.preventDefault();bienvenidaBorrador.opcionales['${o.view}']=!bienvenidaBorrador.opcionales['${o.view}'];bienvenidaRepintar()" aria-label="${o.titulo}"><span class="finance-pro-switch-knob"></span></button>
                </label>`).join('')}</div>`;
    } else if (paso === 'primero') {
        cuerpo = `
            <h2>apunta lo primero.</h2>
            <p>¿Qué tienes que hacer hoy? Lo pondremos en tu planificador. Es la forma más rápida de empezar a usar Bitácora.</p>
            <input id="bv-tarea" class="modal-input" value="${escapeHtml(b.tarea)}" placeholder="Llamar al dentista, entregar la práctica..." onkeydown="if(event.key==='Enter')bienvenidaIr(1)">
            <div class="bienvenida-pista">Más tarde, <b>apuntar</b> (el botón «+ apuntar.», el + del móvil o la tecla espacio en el ordenador) te deja apuntar cualquier cosa desde cualquier sitio.</div>`;
    } else if (paso === 'contigo') {
        const disp = esDispositivo();
        const instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
        const instrucciones = {
            ios: 'En Safari, pulsa <b>Compartir</b> (el cuadrado con la flecha) y elige <b>Añadir a pantalla de inicio</b>. Ábrela desde ese icono: tendrás Bitácora como una app más y podrás recibir avisos.',
            android: 'En Chrome, abre el menú <b>⋮</b> y elige <b>Instalar aplicación</b> (o «Añadir a pantalla de inicio»).',
            ordenador: 'En Chrome o Edge, pulsa el icono de <b>instalar</b> de la barra de direcciones. Bitácora se abrirá en su propia ventana y la puedes anclar a la barra de tareas como cualquier programa.',
        }[disp];
        cuerpo = `
            <h2>llévala contigo.</h2>
            <p>Bitácora funciona en el ordenador y en el móvil, con los mismos datos al momento.</p>
            <div class="bienvenida-bloque">
                <b>${instalada ? 'ya la tienes instalada.' : disp === 'ordenador' ? 'instálala en el ordenador.' : 'ponla en tu pantalla de inicio.'}</b>
                ${instalada ? '<span>Perfecto: así se abre como una app más.</span>' : `<span>${instrucciones}</span>`}
                ${!instalada && disp === 'ordenador' ? '<button class="btn-secondary" style="width:auto;margin-top:10px" onclick="handlePwaInstallClick()">instalar bitácora.</button>' : ''}
            </div>
            <div class="bienvenida-bloque">
                <b>activa los avisos.</b>
                <span>Un resumen cada mañana y un aviso una hora antes de cada evento.${disp === 'ios' && !instalada ? ' En iPhone, los avisos solo funcionan con Bitácora añadida a la pantalla de inicio.' : ''}</span>
                ${disp === 'ios' && !instalada ? '' : '<button class="btn-secondary" style="width:auto;margin-top:10px" onclick="enablePushNotifications().then(ok => { if (ok) showToast(\'Avisos activados\'); })">activar avisos.</button>'}
            </div>`;
    } else {
        const dias = diasPrueba();
        cuerpo = `
            <h2>todo listo.</h2>
            <p>${dias !== null ? `Tienes <b>${dias} días de prueba gratis</b>, sin tarjeta. Si te convence, la suscripción cuesta 1,99 € al mes; si no, tus datos se quedan guardados.` : 'Ya puedes empezar.'}</p>
            <div class="bienvenida-bloque">
                <b>¿quieres verla con una semana de ejemplo?</b>
                <span>Una cena, un viaje, unos gastos y un examen inventados, para ver desde ya cómo se conecta todo. Se quita cuando quieras con «empezar con lo mío.» y solo se borra el ejemplo.</span>
                <div class="bienvenida-ejemplo">
                    <button type="button" class="profe-chip ${b.ejemplo ? '' : 'activa'}" onclick="bienvenidaBorrador.ejemplo=false;bienvenidaRepintar()">no, empiezo vacía.</button>
                    <button type="button" class="profe-chip ${b.ejemplo ? 'activa' : ''}" onclick="bienvenidaBorrador.ejemplo=true;bienvenidaRepintar()">sí, enséñamela.</button>
                </div>
            </div>
            <div class="bienvenida-bloque">
                <b>¿por dónde sigo?</b>
                <span>Añade tus eventos y clases, prueba Social para dividir gastos con tus amigos y, si usas Claude o ChatGPT, conéctalos en Bandeja para apuntar cosas hablando.</span>
            </div>
            <button class="btn-secondary" style="width:auto" onclick="terminarBienvenida(true)">abrir la guía.</button>`;
    }
    const ultimo = bienvenidaPaso === BIENVENIDA_PASOS.length - 1;
    return `
        <div class="bienvenida-progreso">${BIENVENIDA_PASOS.map((_, i) => `<span class="${i <= bienvenidaPaso ? 'hecho' : ''}"></span>`).join('')}</div>
        <div class="bienvenida-cuerpo">${cuerpo}</div>
        <div class="bienvenida-nav">
            ${bienvenidaPaso ? '<button class="btn-secondary" onclick="bienvenidaIr(-1)">← atrás.</button>' : '<button class="bienvenida-saltar" onclick="terminarBienvenida()">saltar.</button>'}
            <button class="btn-modal-primary" onclick="${ultimo ? 'terminarBienvenida()' : 'bienvenidaIr(1)'}">${ultimo ? 'empezar.' : 'siguiente →'}</button>
        </div>`;
}

function bienvenidaLeer() {
    const b = bienvenidaBorrador;
    const nombre = document.getElementById('bv-nombre');
    if (nombre) b.nombre = nombre.value.trim();
    const tarea = document.getElementById('bv-tarea');
    if (tarea) b.tarea = tarea.value.trim();
}

function bienvenidaRepintar() {
    const el = document.getElementById('bienvenida');
    if (el) el.innerHTML = renderBienvenidaPaso();
}

function bienvenidaIr(delta) {
    bienvenidaLeer();
    bienvenidaPaso = Math.max(0, Math.min(BIENVENIDA_PASOS.length - 1, bienvenidaPaso + delta));
    bienvenidaRepintar();
    setTimeout(() => document.querySelector('#bienvenida input')?.focus(), 50);
}

async function terminarBienvenida(abrirGuia) {
    bienvenidaLeer();
    const b = bienvenidaBorrador;
    if (b.nombre && !userName) userName = b.nombre;
    apartadosConfig = { ...configApartados(), perfil: b.perfil, opcionales: { ...b.opcionales, studies: b.perfil !== 'trabajador', work: b.perfil !== 'estudiante' } };
    if (b.tarea) {
        const ahora = new Date();
        const hora = `${String(Math.min(23, ahora.getHours() + 1)).padStart(2, '0')}:00`;
        plannerItemsForOffset(0).push({ id: 'planner_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), time: hora, title: b.tarea, notes: '', done: false });
    }
    if (b.ejemplo && !hayEjemplo()) cargarEjemplo(b.perfil);
    bienvenida = new Date().toISOString();
    closeModal();
    renderAllNavs();
    render();
    if (abrirGuia) setTimeout(() => openGuia(), 150);
    else if (b.tarea) showToast('Apuntado en tu planificador de hoy');
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
    if (b.nombre && !nombrePublico) {
        try {
            const { data: { user } } = await sb.auth.getUser();
            const { error } = await sb.from('perfiles_publicos').upsert({ user_id: user.id, nombre_publico: b.nombre, actualizado_en: new Date().toISOString() }, { onConflict: 'user_id' });
            if (!error) nombrePublico = b.nombre;
        } catch (e) { console.error(e); }
    }
}

// ---------- aviso de prueba en Home ----------
function renderAvisoPrueba(movil) {
    const dias = diasPrueba();
    if (dias === null) return '';
    const regalo = suscripcionActual.estado === 'regalo';
    const total = regalo ? 183 : (suscripcionActual.diasTotal || DIAS_PRUEBA);
    const pocos = dias <= 3;
    const texto = regalo
        ? (dias === 1 ? 'Queda 1 día de tu regalo.' : `Quedan ${dias} días de tu regalo.`)
        : dias === 0 ? 'Tu prueba gratuita termina hoy.' : dias === 1 ? 'Queda 1 día de prueba gratuita.' : `Quedan ${dias} días de prueba gratuita.`;
    return `
        <div class="aviso-prueba ${pocos ? 'pocos' : ''} ${movil ? 'movil' : ''}">
            <div class="aviso-prueba-cifra">${dias}</div>
            <div class="aviso-prueba-texto">
                <b>${texto}</b>
                <span>${regalo ? 'Regalo de un socio fundador.' : 'Sin tarjeta. Tus datos no se pierden al terminar.'}</span>
                <i class="aviso-prueba-barra"><i style="width:${Math.round((1 - dias / total) * 100)}%"></i></i>
            </div>
            <button class="aviso-prueba-btn" onclick="openPlanesPago()">${pocos ? 'suscribirme.' : 'ver planes.'}</button>
        </div>`;
}

function openPlanesPago() {
    showModal(`
        <div class="modal-title">sigue con bitácora.</div>
        <p class="regalo-intro">Elige cómo quieres seguir. Lo que llevas apuntado se queda tal cual.</p>
        <div class="settings-subscription-card settings-subscription-card-neutral" style="border:0;padding:0;background:none">
            ${renderPlanesPago()}
            ${suscripcionActual?.estado === 'prueba' ? renderCanjeRegalo() : ''}
        </div>
        <div class="paywall-legal"><a href="legal.html#condiciones" target="_blank" rel="noopener">condiciones.</a> <a href="legal.html#privacidad" target="_blank" rel="noopener">privacidad.</a></div>
    `);
    cargarPlazasFundador();
}

// ---------- fin de la prueba con la app abierta ----------
function revisarFinAcceso() {
    const s = suscripcionActual;
    const fin = s?.estado === 'prueba' ? s.trial_fin : s?.estado === 'regalo' ? s.periodo_fin : null;
    if (fin && new Date() >= new Date(fin)) startApp();
}
setInterval(revisarFinAcceso, 10 * 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') revisarFinAcceso(); });

// ---------- lo que llevas en Bitácora (fin de la prueba) ----------
// Tres días antes de que acabe la prueba y el último día, una pantalla con lo que la persona ya ha apuntado y
// conseguido, y cómo seguir. Sale una vez por cada uno de esos dos momentos (también con el aviso /?finprueba).
function loQueLlevas() {
    const propio = x => !(typeof esEjemplo === 'function' && esEjemplo(x));
    const eventos = entries.filter(e => e.type === 'event' && propio(e) && !isCalendarLogEntry(e) && !e.linkedItemId).length;
    const hechas = entries.filter(e => propio(e) && /^(planner_done_|recurring_done_|weekly_task_done_)/.test(e.id || '')).length;
    const movs = (financePro?.transactions || []).filter(t => propio(t) && t.category).length;
    const notas = (notes || []).filter(n => propio(n) && (n.content || '').trim()).length;
    const dias = new Set(); habits.filter(propio).forEach(h => Object.keys(h.completadas || {}).forEach(d => h.completadas[d] && dias.add(d)));
    const viajes = entries.filter(e => e.type === 'travel' && propio(e)).length;
    const ocio = entries.filter(e => ['book', 'movie', 'series', 'game'].includes(e.type) && propio(e)).length;
    const examenes = (studies?.subjects || []).filter(propio).reduce((n, s) => n + (s.exams || []).length + (s.assignments || []).length, 0);
    return [
        [eventos, 'planes en tu calendario.', 'plan en tu calendario.'],
        [hechas, 'tareas hechas.', 'tarea hecha.'],
        [movs, 'gastos e ingresos ordenados.', 'gasto ordenado.'],
        [dias.size, 'días cumpliendo tus rutinas.', 'día cumpliendo tus rutinas.'],
        [notas, 'días escritos en tus notas.', 'día escrito en tus notas.'],
        [examenes, 'exámenes y entregas al día.', 'examen o entrega al día.'],
        [viajes, 'viajes guardados.', 'viaje guardado.'],
        [ocio, 'libros, pelis y series.', 'libro, peli o serie.'],
    ].filter(([n]) => n > 0).map(([n, varias, una]) => ({ n, texto: n === 1 ? una : varias }));
}

function openFinPrueba() {
    const dias = diasPrueba();
    if (dias === null || suscripcionActual?.estado !== 'prueba') return;
    const lista = loQueLlevas().slice(0, 6);
    showModal(`
        <div class="modal-title">${dias === 0 ? 'tu prueba termina hoy.' : dias === 1 ? 'tu prueba termina mañana.' : `tu prueba termina en ${dias} días.`}<button class="modal-close" onclick="closeModal()" aria-label="Cerrar"><i class='ico ico-x' aria-hidden=true></i></button></div>
        ${lista.length ? `
        <p class="regalo-intro">Esto es lo que ya has construido en Bitácora:</p>
        <div class="fin-prueba-cifras">${lista.map(x => `<div><b>${x.n}</b><span>${x.texto}</span></div>`).join('')}</div>` : '<p class="regalo-intro">Aún estás a tiempo de probar lo que más te interese: apunta tus planes de la semana y mira cómo se conectan.</p>'}
        <p class="fin-prueba-nota">Si no te suscribes, nada se borra: tus datos se quedan guardados y los puedes descargar cuando quieras.</p>
        <div class="settings-subscription-card settings-subscription-card-neutral" style="border:0;padding:0;background:none">${renderPlanesPago()}</div>
        <button class="btn-secondary" style="margin-top:10px" onclick="closeModal()">ahora no.</button>`);
    cargarPlazasFundador();
}

function comprobarFinPrueba() {
    const dias = diasPrueba();
    if (dias === null || suscripcionActual?.estado !== 'prueba' || dias > 3) return false;
    const momento = dias <= 1 ? 'ultimo' : 'tres';
    const clave = 'bitacora-fin-prueba-' + momento;
    try { if (localStorage.getItem(clave)) return false; localStorage.setItem(clave, '1'); } catch (e) { return false; }
    openFinPrueba();
    return true;
}

// ---------- ¿qué echas en falta? (a los 7 días) ----------
// Una sola pregunta, una vez, entre los 7 y los 60 días de la cuenta. La respuesta va a Sugerencias con la marca
// «[7 días]» para distinguirla.
async function comprobarPreguntaFalta() {
    const s = suscripcionActual;
    if (!s || s.estado === 'legado' || modoSinConexion) return false;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;
    const edad = (Date.now() - new Date(user.created_at)) / 86400000;
    const clave = 'bitacora-pregunta-falta-' + user.id;
    try { if (edad < 7 || edad > 60 || localStorage.getItem(clave)) return false; } catch (e) { return false; }
    if (modalEnPantalla()) return false;
    showModal(`
        <div class="modal-title">una pregunta.<button class="modal-close" onclick="cerrarPreguntaFalta()" aria-label="Cerrar"><i class='ico ico-x' aria-hidden=true></i></button></div>
        <p class="regalo-intro">Llevas una semana con Bitácora. ¿Qué echas en falta? Lo lee la persona que la hace.</p>
        <textarea id="pregunta-falta" class="modal-input" rows="3" placeholder="Me gustaría que..."></textarea>
        <button class="btn-modal-primary" onclick="enviarPreguntaFalta()">enviar.</button>
        <button class="btn-secondary" style="margin-top:8px" onclick="cerrarPreguntaFalta()">ahora no.</button>`);
    return true;
}
async function cerrarPreguntaFalta() {
    const { data: { user } } = await sb.auth.getUser();
    try { if (user) localStorage.setItem('bitacora-pregunta-falta-' + user.id, 'cerrada'); } catch (e) { /* sin almacenamiento */ }
    closeModal();
}
async function enviarPreguntaFalta() {
    const texto = document.getElementById('pregunta-falta')?.value.trim();
    if (!texto) { showToast('Escribe algo o pulsa «ahora no.»'); return; }
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const { error } = await sb.from('sugerencias').insert({ user_id: user.id, texto: '[7 días] ' + texto.slice(0, 2000) });
    if (error) { showToast('No se pudo enviar', true); return; }
    try { localStorage.setItem('bitacora-pregunta-falta-' + user.id, 'enviada'); } catch (e) { /* sin almacenamiento */ }
    closeModal();
    showToast('Gracias: llega tal cual');
}

// Una sola ventana por arranque: primero la bienvenida (en su sitio), luego el fin de la prueba y, si no, la pregunta.
async function comprobarAvisosDeArranque() {
    if (modalEnPantalla()) return;
    if (comprobarFinPrueba()) return;
    await comprobarPreguntaFalta();
}
