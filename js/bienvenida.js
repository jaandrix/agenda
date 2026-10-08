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
    if (bienvenida || !suscripcionActual || suscripcionActual.estado === 'legado') return;
    openBienvenida();
}

function openBienvenida() {
    const cfg = configApartados();
    bienvenidaBorrador = { nombre: (nombrePublico || userName || '').trim(), perfil: cfg.perfil, opcionales: { ...cfg.opcionales }, tarea: '' };
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
            <p>Calendario, tareas, estudios, dinero, planes y amigos, juntos y conectados entre sí. Sin scroll infinito, sin anuncios, sin ruido.</p>
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
        const opcionales = APARTADOS_OPCIONALES.filter(o => !(o.view === 'universidad' && b.perfil === 'trabajador'));
        cuerpo = `
            <h2>elige qué quieres ver.</h2>
            <p>Siempre tienes calendario, planificador, hábitos, notas, eventos, finanzas, ocio, viajes y social. Estos son opcionales:</p>
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
            <div class="bienvenida-pista">Más tarde, la <b>captura rápida</b> (el botón del rayo, o la tecla espacio en el ordenador) te deja apuntar cualquier cosa desde cualquier sitio.</div>`;
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
    apartadosConfig = { ...configApartados(), perfil: b.perfil, opcionales: b.opcionales };
    if (b.tarea) {
        const ahora = new Date();
        const hora = `${String(Math.min(23, ahora.getHours() + 1)).padStart(2, '0')}:00`;
        plannerItemsForOffset(0).push({ id: 'planner_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), time: hora, title: b.tarea, notes: '', done: false });
    }
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
    const total = regalo ? 183 : DIAS_PRUEBA;
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
        <div class="paywall-legal"><a href="legal.html#condiciones" target="_blank" rel="noopener">condiciones.</a> · <a href="legal.html#privacidad" target="_blank" rel="noopener">privacidad.</a></div>
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
