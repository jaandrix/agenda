// ============================================================
//  ESTUDIAR (vista 'estudiar', apartado opcional de la rama #school)
//  Va aparte de Estudios a propósito: Estudios es lo administrativo
//  (asignaturas, horario, exámenes, notas) y aquí está el rato de sentarse
//  a estudiar. Tres pestañas:
//    hoy.      pomodoro y el plan del día, con los temas repartidos en bloques
//    tarjetas. mazos de repaso espaciado al estilo Anki, programados con FSRS-4.5
//    temario.  los temas de cada asignatura, marcados al estudiarlos
//  Datos: `estudiar` (sincronizado) = { mazos: [{ id, nombre, asignaturaId }],
//  tarjetas: [{ id, mazoId, tipo, frente, reverso, creada }], repasos:
//  { 'tarjeta:cara': { s, d, estado, due, ultima, reps, fallos } }, temas:
//  [{ id, asignaturaId, nombre, hecho }], plan: { 'AAAA-MM-DD': { inicio,
//  items: [{ id, texto, temaId, asignaturaId, pomodoros, hechos, hecho }] } },
//  diario: { 'AAAA-MM-DD': { minutos, pomodoros, repasadas, nuevas } },
//  nuevasDia, pomodoro: { trabajo, descanso, largo, cada } }.
//  El pomodoro en marcha vive en localStorage: es de este dispositivo.
// ============================================================
let estudiarPestana = 'hoy';
let estRepaso = null;

function datosEstudiar() {
    if (!estudiar || typeof estudiar !== 'object') estudiar = {};
    for (const k of ['mazos', 'tarjetas', 'temas']) if (!Array.isArray(estudiar[k])) estudiar[k] = [];
    for (const k of ['repasos', 'plan', 'diario']) if (!estudiar[k] || typeof estudiar[k] !== 'object') estudiar[k] = {};
    if (!(estudiar.nuevasDia > 0)) estudiar.nuevasDia = 20;
    return estudiar;
}

function estFecha(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function estDiario(fecha = estFecha()) {
    const d = datosEstudiar().diario;
    if (!d[fecha]) d[fecha] = { minutos: 0, pomodoros: 0, repasadas: 0, nuevas: 0 };
    return d[fecha];
}

// Nuevas que aún caben hoy: el límite diario más las que se añadieron a
// mano para hoy con «10 más hoy.» (extra), sin tocar el límite.
function estNuevasRestantes() {
    const d = estDiario();
    return Math.max(0, datosEstudiar().nuevasDia + (d.extra || 0) - d.nuevas);
}

function estMasHoy() {
    const d = estDiario();
    d.extra = (d.extra || 0) + 10;
    render();
    guardarEstudiar();
}

function estId(p) { return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function estAsignaturas() {
    return (typeof asignaturasEnCurso === 'function' ? asignaturasEnCurso() : studies.subjects) || [];
}

function estAsignatura(id) { return (studies.subjects || []).find(s => s.id === id); }

async function guardarEstudiar() {
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}

function estTexto(t) { return escapeHtml(t || '').replace(/\n/g, '<br>'); }

// ------------------------------------------------------------
//  FSRS-4.5 (open-spaced-repetition) con sus pesos por defecto. Se apunta
//  a recordar el 90 %: con esa retención el intervalo en días es la propia
//  estabilidad. Los pasos de aprendizaje (1, 6 y 10 minutos) son los de
//  Anki; en ellos FSRS-4.5 no toca la estabilidad ni la dificultad.
// ------------------------------------------------------------
const FSRS_W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const FSRS_RETENCION = 0.9;
const FSRS_DECAY = -0.5;
const FSRS_FACTOR = 19 / 81;
const EST_MIN = 60e3;
const EST_DIA = 864e5;

function fsrsDificultad0(g) { return Math.min(10, Math.max(1, FSRS_W[4] - (g - 3) * FSRS_W[5])); }
function fsrsRecuerdo(dias, s) { return Math.pow(1 + FSRS_FACTOR * dias / s, FSRS_DECAY); }
function fsrsDias(s) { return Math.min(36500, Math.max(1, Math.round(s / FSRS_FACTOR * (Math.pow(FSRS_RETENCION, 1 / FSRS_DECAY) - 1)))); }

// Los cuatro estados posibles tras responder (otra vez, difícil, bien, fácil).
function fsrsOpciones(r, ahora = Date.now()) {
    const w = FSRS_W;
    const base = { reps: (r?.reps || 0) + 1, fallos: r?.fallos || 0, ultima: ahora };
    const aprender = (s, d, g, estado) => g === 1 ? { ...base, s, d, estado, due: ahora + EST_MIN }
        : g === 2 ? { ...base, s, d, estado, due: ahora + 6 * EST_MIN }
        : null;
    if (!r || r.estado === 'nueva') return [1, 2, 3, 4].map(g => {
        const s = w[g - 1], d = fsrsDificultad0(g);
        if (g < 3) return aprender(s, d, g, 'aprendiendo');
        if (g === 3) return { ...base, s, d, estado: 'aprendiendo', due: ahora + 10 * EST_MIN };
        return { ...base, s, d, estado: 'repaso', due: ahora + fsrsDias(s) * EST_DIA };
    });
    if (r.estado === 'aprendiendo' || r.estado === 'reaprendiendo') return [1, 2, 3, 4].map(g => {
        if (g < 3) return aprender(r.s, r.d, g, r.estado);
        const s = g === 4 ? Math.max(r.s * 2, w[2]) : r.s;
        const dias = fsrsDias(s) + (g === 4 ? 1 : 0);
        return { ...base, s, d: r.d, estado: 'repaso', due: ahora + dias * EST_DIA };
    });
    const R = fsrsRecuerdo(Math.max(0, (ahora - (r.ultima || ahora)) / EST_DIA), r.s);
    let previo = 0;
    return [1, 2, 3, 4].map(g => {
        let d = r.d - w[6] * (g - 3);
        d = Math.min(10, Math.max(1, w[7] * fsrsDificultad0(4) + (1 - w[7]) * d));
        if (g === 1) {
            const s = Math.min(r.s, w[11] * Math.pow(r.d, -w[12]) * (Math.pow(r.s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - R)));
            return { ...base, s, d, estado: 'reaprendiendo', fallos: base.fallos + 1, due: ahora + 10 * EST_MIN };
        }
        const s = r.s * (1 + Math.exp(w[8]) * (11 - r.d) * Math.pow(r.s, -w[9]) * (Math.exp(w[10] * (1 - R)) - 1) * (g === 2 ? w[15] : 1) * (g === 4 ? w[16] : 1));
        const dias = Math.max(fsrsDias(s), previo + 1);
        previo = dias;
        return { ...base, s, d, estado: 'repaso', due: ahora + dias * EST_DIA };
    });
}

function estPlazo(ms) {
    const m = Math.round(ms / EST_MIN);
    if (m < 60) return `${Math.max(1, m)} min`;
    if (m < 1440) return `${Math.round(m / 60)} h`;
    const d = Math.round(ms / EST_DIA);
    if (d < 30) return `${d} d`;
    if (d < 365) return `${Math.round(d / 30)} mes${Math.round(d / 30) > 1 ? 'es' : ''}`;
    return `${(d / 365).toFixed(1).replace('.0', '')} años`;
}

// ------------------------------------------------------------
//  TARJETAS
//  Cada tarjeta da una o varias "caras" que se repasan por separado:
//  básica y escribir, una; ida y vuelta, dos; huecos, una por cada {{cN::}}.
// ------------------------------------------------------------
const EST_TIPOS = { basica: 'básica.', inversa: 'ida y vuelta.', escribir: 'escribir.', huecos: 'huecos.' };

function estCaras(t) {
    if (t.tipo === 'inversa') return ['0', '1'];
    if (t.tipo === 'huecos') {
        const ns = [...new Set([...String(t.frente).matchAll(/\{\{c(\d+)::/g)].map(m => m[1]))];
        return ns.length ? ns.map(n => 'c' + n) : ['0'];
    }
    return ['0'];
}

function estClaves(mazoId) {
    const e = datosEstudiar();
    return e.tarjetas.filter(t => !mazoId || t.mazoId === mazoId).flatMap(t => estCaras(t).map(c => `${t.id}:${c}`));
}

function estCuentas(mazoId, ahora = Date.now()) {
    const e = datosEstudiar();
    let nuevas = 0, toca = 0;
    estClaves(mazoId).forEach(k => { const r = e.repasos[k]; if (!r) nuevas++; else if (r.due <= ahora) toca++; });
    const quedanNuevas = estNuevasRestantes();
    return { nuevas, nuevasHoy: Math.min(nuevas, quedanNuevas), toca, total: e.tarjetas.filter(t => !mazoId || t.mazoId === mazoId).length };
}

function estHueco(texto, actual, mostrar) {
    return escapeHtml(texto).replace(/\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/g, (_, n, resp, pista) => {
        if ('c' + n !== actual) return resp;
        return mostrar ? `<b class="est-hueco est-hueco-ok">${resp}</b>` : `<span class="est-hueco">${pista ? pista : '...'}</span>`;
    }).replace(/\n/g, '<br>');
}

function estPregunta(t, cara, mostrar) {
    if (t.tipo === 'huecos') return { pregunta: estHueco(t.frente, cara, false), respuesta: estHueco(t.frente, cara, true) + (t.reverso ? `<div class="est-extra">${estTexto(t.reverso)}</div>` : '') };
    if (cara === '1') return { pregunta: estTexto(t.reverso), respuesta: estTexto(t.frente) };
    return { pregunta: estTexto(t.frente), respuesta: estTexto(t.reverso) };
}

function estNorm(t) { return stripAccents(String(t || '').toLowerCase()).replace(/[^a-z0-9ñ]+/g, ' ').trim(); }

// ------------------------------------------------------------
//  POMODORO
// ------------------------------------------------------------
const POMO_CLAVE = 'bitacora-pomodoro';
const POMO_FASES = { trabajo: 'concéntrate.', descanso: 'descansa.', largo: 'descanso largo.' };

function pomoConfig() { return { trabajo: 25, descanso: 5, largo: 15, cada: 4, ...(datosEstudiar().pomodoro || {}) }; }
function pomoLeer() { try { return JSON.parse(localStorage.getItem(POMO_CLAVE)) || null; } catch (_) { return null; } }
function pomoGuardar(p) { try { if (p) localStorage.setItem(POMO_CLAVE, JSON.stringify(p)); else localStorage.removeItem(POMO_CLAVE); } catch (_) { /* sin almacenamiento */ } }
function pomoDuracion(fase) { return pomoConfig()[fase] * EST_MIN; }
// `extra`: los minutos que se le han sumado a esta fase con "+5 min.".
function pomoTotal(p) { return pomoDuracion(p.fase) + (p.extra || 0); }
function pomoResta(p) { return p.fin ? Math.max(0, p.fin - Date.now()) : (p.resta ?? pomoTotal(p)); }
function pomoReloj(ms) { const s = Math.ceil(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }

function pomoEmpezar(itemId) {
    const p = pomoLeer() || { fase: 'trabajo', ciclo: 0 };
    if (itemId) { p.itemId = itemId; if (p.fase !== 'trabajo') { p.fase = 'trabajo'; delete p.resta; p.fin = null; } }
    if (!p.fin) { p.fin = Date.now() + pomoResta(p); delete p.resta; }
    pomoGuardar(p);
    pomoPintar(true);
}

function pomoPausar() {
    const p = pomoLeer();
    if (!p?.fin) return;
    p.resta = pomoResta(p); p.fin = null;
    pomoGuardar(p);
    pomoPintar(true);
}

function pomoParar() {
    const p = pomoLeer();
    if (p?.fase === 'trabajo') pomoSumar(p, false);
    pomoGuardar(null);
    pomoPintar(true);
}

function pomoSaltar() {
    const p = pomoLeer();
    if (p) pomoFinFase(p, false);
}

// Suma lo estudiado: los minutos siempre, el pomodoro solo si se completó.
function pomoSumar(p, completo) {
    const ms = pomoTotal(p) - pomoResta(p);
    const min = completo ? Math.round(pomoTotal(p) / EST_MIN) : Math.floor(ms / EST_MIN);
    if (min <= 0 && !completo) return;
    const dia = estDiario();
    dia.minutos += min;
    if (completo) {
        dia.pomodoros++;
        const it = estPlanHoy().items.find(x => x.id === p.itemId);
        if (it) it.hechos = (it.hechos || 0) + 1;
    }
    guardarEstudiar();
}

// Tras trabajar, el descanso empieza solo; tras descansar, el siguiente
// pomodoro espera a que le des: así no corre el reloj si te has levantado.
function pomoFinFase(p, completo) {
    const cfg = pomoConfig();
    if (p.fase === 'trabajo') {
        pomoSumar(p, completo);
        delete p.extra;
        p.ciclo = (p.ciclo || 0) + 1;
        p.fase = p.ciclo % cfg.cada === 0 ? 'largo' : 'descanso';
        p.fin = Date.now() + pomoDuracion(p.fase); delete p.resta;
        if (completo) pomoAvisar('Pomodoro terminado. Toca descansar.');
    } else {
        delete p.extra;
        p.fase = 'trabajo'; p.fin = null; p.resta = pomoDuracion('trabajo');
        if (completo) pomoAvisar('Fin del descanso. ¿Seguimos?');
    }
    pomoGuardar(p);
    pomoPintar(true);
}

function pomoAvisar(texto) {
    showToast(texto);
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [0, .18, .36].forEach((t, i) => {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.frequency.value = [660, 880, 990][i];
            g.gain.setValueAtTime(.0001, ctx.currentTime + t);
            g.gain.exponentialRampToValueAtTime(.2, ctx.currentTime + t + .02);
            g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + t + .16);
            o.connect(g).connect(ctx.destination);
            o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + .17);
        });
    } catch (_) { /* sin audio */ }
    try { if (document.hidden && window.Notification?.permission === 'granted') new Notification('Bitácora', { body: texto, icon: 'icon-192.png' }); } catch (_) { /* iOS solo notifica desde el service worker */ }
}

function pomoMas(min) {
    const p = pomoLeer();
    if (!p) return;
    const ms = min * EST_MIN;
    if (p.fin) p.fin += ms; else p.resta = pomoResta(p) + ms;
    p.extra = (p.extra || 0) + ms;
    pomoGuardar(p);
    pomoPintar(true);
}

// Modo foco: el reloj a pantalla completa, encima de todo, sin nada más.
function pomoFoco(abrir) {
    let capa = document.getElementById('pomo-foco');
    if (!abrir) {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        capa?.remove(); document.body.classList.remove('pomo-foco-abierto'); pomoPintar(false); return;
    }
    vtCortar();
    if (!capa) {
        capa = document.createElement('div');
        capa.id = 'pomo-foco';
        capa.className = 'pomo-foco';
        document.body.appendChild(capa);
    }
    document.body.classList.add('pomo-foco-abierto');
    capa.innerHTML = renderEstPomodoro(true);
}

document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && document.getElementById('pomo-foco')) { ev.stopPropagation(); pomoFoco(false); } }, true);

function pomoTick() {
    const p = pomoLeer();
    if (p?.fin && Date.now() >= p.fin) { pomoFinFase(p, true); return; }
    pomoPintar(false);
}

// Sin repintar la vista entera cada segundo: solo el reloj y la pastilla.
function pomoPintar(todo) {
    const p = pomoLeer();
    if (todo && currentView === 'estudiar' && !estRepaso) {
        if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) estPintarPomodoro(); else render();
    }
    if (todo && document.getElementById('pomo-foco')) pomoFoco(true);
    document.querySelectorAll('.pomo-reloj').forEach(el => { el.textContent = pomoReloj(p ? pomoResta(p) : pomoDuracion('trabajo')); });
    if (p) document.querySelectorAll('.est-pomo').forEach(el => el.style.setProperty('--pomo-pct', ((1 - pomoResta(p) / pomoTotal(p)) * 100).toFixed(2)));
    let pastilla = document.getElementById('pomo-pastilla');
    const ver = p && (p.fin || p.resta < pomoTotal(p)) && currentView !== 'estudiar' && !document.getElementById('pomo-foco');
    if (!ver) { pastilla?.remove(); return; }
    if (!pastilla) {
        pastilla = document.createElement('button');
        pastilla.id = 'pomo-pastilla';
        pastilla.onclick = () => (typeof mobileStandaloneActive !== 'undefined' && mobileStandaloneActive ? mobileIr('estudiar') : switchView('estudiar'));
        document.body.appendChild(pastilla);
    }
    pastilla.className = `pomo-pastilla fase-${p.fase} ${p.fin ? '' : 'pausado'}`;
    pastilla.innerHTML = `<i></i><b>${pomoReloj(pomoResta(p))}</b><span>${p.fin ? POMO_FASES[p.fase] : 'en pausa.'}</span>`;
}

setInterval(pomoTick, 1000);

function estPintarPomodoro() {
    const caja = document.querySelector('#mobile-shell .est-pomo, #content .est-pomo');
    if (caja) caja.outerHTML = renderEstPomodoro();
}

function renderEstPomodoro(foco) {
    const p = pomoLeer();
    const cfg = pomoConfig();
    const fase = p?.fase || 'trabajo';
    const enMarcha = !!p?.fin;
    const resta = p ? pomoResta(p) : pomoDuracion('trabajo');
    const it = p?.itemId ? estPlanHoy().items.find(x => x.id === p.itemId) : null;
    const total = p ? pomoTotal(p) : pomoDuracion('trabajo');
    const ciclo = (p?.ciclo || 0) % cfg.cada;
    const pausado = p && !enMarcha && resta < total;
    return `<div class="est-pomo fase-${fase} ${enMarcha ? 'en-marcha' : ''} ${foco ? 'est-pomo-grande' : ''}" style="--pomo-pct:${((1 - resta / total) * 100).toFixed(2)}">
        <div class="est-pomo-esquina">
            ${p ? `<button onclick="pomoMas(5)" title="Cinco minutos más">+5 min.</button>` : ''}
            ${foco && document.fullscreenEnabled ? `<button onclick="alternarPantallaCompleta('pomo-foco')">${document.fullscreenElement ? 'salir de pantalla completa.' : 'pantalla completa.'}</button>` : ''}
            <button onclick="pomoFoco(${foco ? 'false' : 'true'})" title="${foco ? 'Salir del modo focus' : 'El reloj solo, a toda la ventana'}">${foco ? 'salir.' : 'modo focus.'}</button>
        </div>
        <div class="est-pomo-anillo">
            <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="est-pomo-pista" cx="60" cy="60" r="54"/><circle class="est-pomo-arco" cx="60" cy="60" r="54" pathLength="100" transform="rotate(-90 60 60)"/></svg>
            <div class="est-pomo-centro">
                <div class="est-pomo-fase">${pausado ? 'en pausa.' : POMO_FASES[fase]}</div>
                <div class="est-pomo-reloj pomo-reloj">${pomoReloj(resta)}</div>
                <div class="est-pomo-ciclo">${Array.from({ length: cfg.cada }, (_, i) => `<i class="${i < ciclo ? 'on' : ''}"></i>`).join('')}</div>
            </div>
        </div>
        ${it ? `<div class="est-pomo-tema">${escapeHtml(it.texto)}</div>` : ''}
        <div class="est-pomo-botones">
            ${enMarcha ? `<button class="btn-modal-primary" onclick="pomoPausar()">pausa.</button>` : `<button class="btn-modal-primary" onclick="pomoEmpezar()">${pausado ? 'seguir.' : 'empezar.'}</button>`}
            ${p ? `<button class="btn-secondary" onclick="pomoSaltar()">${fase === 'trabajo' ? 'descansar ya.' : 'saltar descanso.'}</button><button class="btn-secondary" onclick="pomoParar()">parar.</button>` : ''}
        </div>
        ${foco ? '' : `<button class="est-pomo-ajustes" onclick="openEstAjustes()">${cfg.trabajo} min de estudio, ${cfg.descanso} de descanso.</button>`}
    </div>`;
}

function openEstAjustes() {
    const cfg = pomoConfig();
    const campo = (id, t, v, max = 180) => `<label class="est-ajuste"><span>${t}</span><input id="${id}" class="modal-input" type="number" min="1" max="${max}" value="${v}"></label>`;
    showModal(`
        <div class="modal-title">ajustes de estudiar.</div>
        <div class="modal-label">Pomodoro</div>
        <div class="est-ajustes">${campo('est-a-trabajo', 'minutos de estudio', cfg.trabajo)}${campo('est-a-descanso', 'descanso corto', cfg.descanso)}${campo('est-a-largo', 'descanso largo', cfg.largo)}${campo('est-a-cada', 'descanso largo cada', cfg.cada)}</div>
        <div class="modal-label">Tarjetas</div>
        <div class="est-ajustes">${campo('est-a-nuevas', 'tarjetas nuevas al día', datosEstudiar().nuevasDia, 500)}</div>
        <p class="finance-modal-note">Solo cuenta las que ves por primera vez: los repasos de las que ya estudiaste no tienen límite. Con muchas nuevas cada día, los repasos de los días siguientes crecen deprisa.</p>
        <button class="btn-modal-primary" onclick="guardarEstAjustes()">guardar.</button>
    `);
}

function guardarEstAjustes() {
    const n = (id, def, max) => { const v = Math.round(Number(document.getElementById(id)?.value)); return v >= 1 && v <= max ? v : def; };
    const e = datosEstudiar();
    e.pomodoro = { trabajo: n('est-a-trabajo', 25, 180), descanso: n('est-a-descanso', 5, 60), largo: n('est-a-largo', 15, 90), cada: n('est-a-cada', 4, 12) };
    e.nuevasDia = n('est-a-nuevas', 20, 500);
    closeModal(); render(); guardarEstudiar();
}

// ------------------------------------------------------------
//  PLAN DEL DÍA
// ------------------------------------------------------------
function estPlanHoy() {
    const plan = datosEstudiar().plan;
    const hoy = estFecha();
    if (!plan[hoy]) plan[hoy] = { items: [] };
    if (!Array.isArray(plan[hoy].items)) plan[hoy].items = [];
    return plan[hoy];
}

function estHora(min) { return `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`; }

// Reparte los temas pendientes en pomodoros seguidos desde la hora de
// inicio, con el descanso largo donde toca.
function estRepartir() {
    const cfg = pomoConfig();
    const plan = estPlanHoy();
    const ahora = new Date();
    const [h, m] = String(plan.inicio || '').split(':').map(Number);
    let t = plan.inicio ? h * 60 + m : Math.ceil((ahora.getHours() * 60 + ahora.getMinutes()) / 5) * 5;
    let n = 0;
    const franjas = {};
    plan.items.filter(i => !i.hecho).forEach(it => {
        const inicio = t;
        for (let i = 0; i < Math.max(1, (it.pomodoros || 1) - (it.hechos || 0)); i++) {
            t += cfg.trabajo; n++;
            const fin = t;
            t += n % cfg.cada === 0 ? cfg.largo : cfg.descanso;
            franjas[it.id] = [inicio, fin];
        }
    });
    return franjas;
}

function estPlanAnadir(texto, temaId) {
    const plan = estPlanHoy();
    const tema = temaId && datosEstudiar().temas.find(x => x.id === temaId);
    String(texto || '').split(/\n|,/).map(x => x.trim()).filter(Boolean).forEach(t => {
        plan.items.push({ id: estId('ep'), texto: tema ? tema.nombre : t, temaId: tema?.id || null, asignaturaId: tema?.asignaturaId || null, pomodoros: 1, hechos: 0, hecho: false });
    });
    render(); guardarEstudiar();
    setTimeout(() => document.querySelector('#mobile-shell #est-plan-nuevo, #content #est-plan-nuevo')?.focus(), 0);
}

function estTemaAHoy(temaId) {
    if (estPlanHoy().items.some(i => i.temaId === temaId)) { showToast('Ya está en el plan de hoy'); return; }
    estPlanAnadir('x', temaId);
    showToast('Añadido al plan de hoy');
}

function estPlanMarcar(id) {
    const it = estPlanHoy().items.find(x => x.id === id);
    if (!it) return;
    it.hecho = !it.hecho;
    const tema = it.temaId && datosEstudiar().temas.find(x => x.id === it.temaId);
    if (tema && it.hecho) tema.hecho = true;
    render(); guardarEstudiar();
}

function estPlanPomodoros(id, delta) {
    const it = estPlanHoy().items.find(x => x.id === id);
    if (!it) return;
    it.pomodoros = Math.min(12, Math.max(1, (it.pomodoros || 1) + delta));
    render(); guardarEstudiar();
}

function estPlanQuitar(id) {
    const plan = estPlanHoy();
    plan.items = plan.items.filter(x => x.id !== id);
    render(); guardarEstudiar();
}

function estPlanMover(id, delta) {
    const xs = estPlanHoy().items;
    const i = xs.findIndex(x => x.id === id), j = i + delta;
    if (i < 0 || j < 0 || j >= xs.length) return;
    [xs[i], xs[j]] = [xs[j], xs[i]];
    render(); guardarEstudiar();
}

function estPlanInicio(valor) {
    estPlanHoy().inicio = valor || undefined;
    render(); guardarEstudiar();
}

function openEstDelTemario() {
    const ya = new Set(estPlanHoy().items.map(i => i.temaId).filter(Boolean));
    const temas = datosEstudiar().temas.filter(t => !t.hecho && !ya.has(t.id));
    if (!temas.length) { showToast('No quedan temas pendientes en el temario'); return; }
    showModal(`
        <div class="modal-title">del temario.</div>
        <div class="est-elegir">${temas.map(t => `<label><input type="checkbox" value="${t.id}"><span>${escapeHtml(t.nombre)}</span><small>${escapeHtml(estAsignatura(t.asignaturaId)?.name || '')}</small></label>`).join('')}</div>
        <button class="btn-modal-primary" onclick="estAnadirDelTemario()">añadir al plan.</button>
    `);
}

function estAnadirDelTemario() {
    const ids = [...document.querySelectorAll('.est-elegir input:checked')].map(x => x.value);
    closeModal();
    ids.forEach(id => estPlanAnadir('x', id));
}

// Lleva el plan al Planificador del día, con sus horas. Si ya se pasó,
// solo corrige la hora y el texto.
async function estPlanAlPlanificador() {
    const plan = estPlanHoy();
    const franjas = estRepartir();
    const lista = plannerItemsForOffset(0);
    let n = 0;
    plan.items.filter(i => !i.hecho && franjas[i.id]).forEach(it => {
        const datos = { time: estHora(franjas[it.id][0]), title: `estudiar: ${it.texto}` };
        const ya = it.plannerId && lista.find(x => x.id === it.plannerId);
        if (ya) Object.assign(ya, datos);
        else { it.plannerId = 'planner_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); lista.push({ id: it.plannerId, ...datos, notes: '', done: false }); }
        n++;
    });
    if (!n) { showToast('No hay nada pendiente en el plan'); return; }
    showToast(`${n} ${n === 1 ? 'bloque pasado' : 'bloques pasados'} al planificador.`);
    render(); guardarEstudiar();
}

function renderEstHoy() {
    const e = datosEstudiar();
    const plan = estPlanHoy();
    const dia = estDiario();
    const cuentas = estCuentas();
    const franjas = estRepartir();
    const pomo = pomoLeer();
    const fila = it => {
        const a = estAsignatura(it.asignaturaId);
        const f = franjas[it.id];
        return `<div class="est-plan-item ${it.hecho ? 'hecho' : ''} ${pomo?.itemId === it.id && pomo.fase === 'trabajo' && pomo.fin ? 'activo' : ''}">
            <button class="compra-check ${it.hecho ? 'on' : ''}" onclick="estPlanMarcar('${it.id}')" aria-label="Marcar como estudiado"></button>
            <div class="est-plan-txt">
                <b>${a?.color ? `<i style="background:${escapeHtml(a.color)}"></i>` : ''}${escapeHtml(it.texto)}</b>
                <span>${f && !it.hecho ? `${estHora(f[0])}–${estHora(f[1])}, ` : ''}${Array.from({ length: it.pomodoros || 1 }, (_, i) => `<em class="${i < (it.hechos || 0) ? 'on' : ''}"></em>`).join('')}</span>
            </div>
            <div class="est-plan-acciones">
                ${it.hecho ? '' : `<button onclick="estPlanPomodoros('${it.id}',-1)" aria-label="Un pomodoro menos">−</button><button onclick="estPlanPomodoros('${it.id}',1)" aria-label="Un pomodoro más">+</button><button onclick="estPlanMover('${it.id}',-1)" aria-label="Subir">↑</button><button class="est-play" onclick="pomoEmpezar('${it.id}')" aria-label="Estudiar esto ahora">▶</button>`}
                <button onclick="estPlanQuitar('${it.id}')" aria-label="Quitar"><i class='ico ico-x' aria-hidden=true></i></button>
            </div>
        </div>`;
    };
    const pendientes = plan.items.filter(i => !i.hecho), hechos = plan.items.filter(i => i.hecho);
    return `<div class="est-hoy">
        ${renderEstPomodoro()}
        <div class="est-cifras">
            <div><b>${dia.minutos >= 60 ? `${Math.floor(dia.minutos / 60)} h ${dia.minutos % 60}` : dia.minutos}</b><span>${dia.minutos >= 60 ? 'estudiado hoy.' : 'minutos hoy.'}</span></div>
            <div><b>${dia.pomodoros}</b><span>pomodoros.</span></div>
            <button onclick="estudiarPestana='tarjetas';estEmpezarRepaso('')" ${cuentas.toca + cuentas.nuevasHoy ? '' : 'disabled'}><b>${cuentas.toca + cuentas.nuevasHoy}</b><span>tarjetas por repasar.</span></button>
        </div>
        <div class="est-bloque">
            <div class="est-bloque-cab"><b>plan de hoy.</b>
                <label class="est-inicio">empiezo a las <input type="time" value="${plan.inicio || ''}" onchange="estPlanInicio(this.value)"></label>
            </div>
            <div class="compra-anadir">
                <input id="est-plan-nuevo" class="modal-input" placeholder="¿Qué vas a estudiar? Separa con comas..." onkeydown="if(event.key==='Enter'){event.preventDefault();estPlanAnadir(this.value)}" autocomplete="off">
                <button class="btn-modal-primary" onclick="estPlanAnadir(document.getElementById('est-plan-nuevo').value)">añadir.</button>
            </div>
            ${e.temas.some(t => !t.hecho && !plan.items.some(i => i.temaId === t.id)) ?`<button class="est-enlace" onclick="openEstDelTemario()">+ del temario.</button>` : ''}
            ${plan.items.length ? pendientes.map(fila).join('') + hechos.map(fila).join('') : `<div class="compra-vacio"><b>divide el día en bloques.</b>Apunta los temas que quieres ver hoy y cuántos pomodoros te llevará cada uno: Bitácora los coloca uno detrás de otro desde la hora que digas, con sus descansos. Pulsa ▶ para estudiar uno.</div>`}
            ${pendientes.length ? `<button class="btn-secondary est-al-planificador" onclick="estPlanAlPlanificador()">pasar al planificador.</button>` : ''}
        </div>
    </div>`;
}

// ------------------------------------------------------------
//  TEMARIO
// ------------------------------------------------------------
function estTemaAnadir(asignaturaId, texto) {
    const temas = datosEstudiar().temas;
    String(texto || '').split(/\n|;/).map(x => x.trim()).filter(Boolean).forEach(nombre => temas.push({ id: estId('et'), asignaturaId: asignaturaId || null, nombre, hecho: false }));
    render(); guardarEstudiar();
    setTimeout(() => document.querySelector(`#mobile-shell #est-tema-${asignaturaId || 'otros'}, #content #est-tema-${asignaturaId || 'otros'}`)?.focus(), 0);
}

function estTemaMarcar(id) {
    const t = datosEstudiar().temas.find(x => x.id === id);
    if (!t) return;
    t.hecho = !t.hecho;
    render(); guardarEstudiar();
}

function estTemaQuitar(id) {
    const e = datosEstudiar();
    e.temas = e.temas.filter(x => x.id !== id);
    render(); guardarEstudiar();
}

function renderEstTemario() {
    const e = datosEstudiar();
    const grupos = [...estAsignaturas().map(s => ({ id: s.id, nombre: s.name, color: s.color })), { id: '', nombre: estAsignaturas().length ? 'otros temas' : 'temario' }];
    return `<div class="est-temario">${grupos.map(g => {
        const temas = e.temas.filter(t => (t.asignaturaId || '') === g.id || (!g.id && t.asignaturaId && !estAsignatura(t.asignaturaId)));
        if (!g.id && !temas.length && estAsignaturas().length) return '';
        const hechos = temas.filter(t => t.hecho).length;
        return `<div class="est-bloque">
            <div class="est-bloque-cab"><b>${g.color ? `<i style="background:${escapeHtml(g.color)}"></i>` : ''}${escapeHtml(g.nombre.toLowerCase())}.</b>${temas.length ? `<span>${hechos}/${temas.length} estudiados.</span>` : ''}</div>
            ${temas.length ? `<div class="est-barra"><i style="width:${hechos / temas.length * 100}%"></i></div>` : ''}
            ${temas.map(t => `<div class="est-tema ${t.hecho ? 'hecho' : ''}">
                <button class="compra-check ${t.hecho ? 'on' : ''}" onclick="estTemaMarcar('${t.id}')" aria-label="Estudiado"></button>
                <span>${escapeHtml(t.nombre)}</span>
                ${t.hecho ? '' : `<button class="est-enlace" onclick="estTemaAHoy('${t.id}')">→ hoy</button>`}
                <button class="est-quitar" onclick="estTemaQuitar('${t.id}')" aria-label="Quitar"><i class='ico ico-x' aria-hidden=true></i></button>
            </div>`).join('')}
            <div class="compra-anadir est-tema-anadir">
                <input id="est-tema-${g.id || 'otros'}" class="modal-input" placeholder="+ tema (pega varios, uno por línea)" onkeydown="if(event.key==='Enter'){event.preventDefault();estTemaAnadir('${g.id}',this.value)}" onpaste="setTimeout(()=>{if(this.value.includes('\\n'))estTemaAnadir('${g.id}',this.value)},0)" autocomplete="off">
            </div>
        </div>`;
    }).join('')}
    ${!estAsignaturas().length ? `<div class="finance-empty-line">Si añades tus asignaturas en Estudios, el temario se agrupa por asignatura.</div>` : ''}
    </div>`;
}

// ------------------------------------------------------------
//  MAZOS Y TARJETAS
// ------------------------------------------------------------
function openEstMazo(id) {
    const m = id ? datosEstudiar().mazos.find(x => x.id === id) : null;
    showModal(`
        <div class="modal-title">${m ? 'mazo.' : '+ mazo.'}</div>
        <div class="modal-label">Nombre</div>
        <input id="est-mazo-nombre" class="modal-input" value="${escapeHtml(m?.nombre || '')}" placeholder="Anatomía, vocabulario de inglés...">
        <div class="modal-label">Asignatura</div>
        <select id="est-mazo-asig" class="modal-input"><option value="">ninguna.</option>${(studies.subjects || []).map(s => `<option value="${s.id}" ${m?.asignaturaId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}</select>
        <button class="btn-modal-primary" onclick="guardarEstMazo('${id || ''}')">${m ? 'guardar.' : 'crear.'}</button>
        ${m ? `<button class="btn-secondary" style="margin-top:8px;color:#dc2626" onclick="borrarEstMazo('${m.id}')">eliminar el mazo y sus tarjetas.</button>` : ''}
    `);
    if (!m) enfocarSiTeclado(() => document.getElementById('est-mazo-nombre'));
}

function guardarEstMazo(id) {
    const nombre = document.getElementById('est-mazo-nombre')?.value.trim();
    if (!nombre) { showToast('Ponle un nombre', true); return; }
    const asignaturaId = document.getElementById('est-mazo-asig')?.value || null;
    const e = datosEstudiar();
    const m = id && e.mazos.find(x => x.id === id);
    if (m) Object.assign(m, { nombre, asignaturaId });
    else e.mazos.push({ id: estId('em'), nombre, asignaturaId });
    closeModal(); render(); guardarEstudiar();
}

function borrarEstMazo(id) {
    const e = datosEstudiar();
    const n = e.tarjetas.filter(t => t.mazoId === id).length;
    if (n && !confirm(`Se borrarán también sus ${n} tarjetas. ¿Seguro?`)) return;
    const fuera = new Set(e.tarjetas.filter(t => t.mazoId === id).map(t => t.id));
    e.tarjetas = e.tarjetas.filter(t => t.mazoId !== id);
    Object.keys(e.repasos).forEach(k => { if (fuera.has(k.split(':')[0])) delete e.repasos[k]; });
    e.mazos = e.mazos.filter(x => x.id !== id);
    closeModal(); render(); guardarEstudiar();
}

function openEstTarjeta(mazoId, id, tipo) {
    const e = datosEstudiar();
    const t = id ? e.tarjetas.find(x => x.id === id) : null;
    const tp = tipo || t?.tipo || window._estUltimoTipo || 'basica';
    const ayuda = {
        basica: 'Ves el frente y recuerdas el reverso.',
        inversa: 'Se pregunta en los dos sentidos: crea dos tarjetas en una.',
        escribir: 'Escribes la respuesta antes de verla, y Bitácora la compara.',
        huecos: 'Escribe el texto y convierte en hueco lo que quieras recordar: selecciónalo y pulsa «hacer hueco.». Cada hueco se repasa por separado.',
    }[tp];
    showModal(`
        <div class="modal-title">${t ? 'tarjeta.' : '+ tarjeta.'}</div>
        <div class="profe-dias-elegir">${Object.entries(EST_TIPOS).map(([k, v]) => `<button type="button" class="profe-chip ${k === tp ? 'activa' : ''}" onclick="estCambiarTipo('${mazoId}','${id || ''}','${k}')">${v}</button>`).join('')}</div>
        <div class="est-ayuda">${ayuda}</div>
        <div class="modal-label">${tp === 'huecos' ? 'Texto' : 'Frente'}</div>
        <textarea id="est-t-frente" class="modal-input" rows="${tp === 'huecos' ? 5 : 3}" placeholder="${tp === 'huecos' ? 'La mitocondria produce {{c1::ATP}}.' : 'Pregunta, palabra, concepto...'}">${escapeHtml(t?.frente || window._estBorrador?.frente || '')}</textarea>
        ${tp === 'huecos' ? `<button type="button" class="est-enlace" onclick="estHacerHueco()">hacer hueco.</button>` : ''}
        <div class="modal-label">${tp === 'huecos' ? 'Nota extra (opcional)' : 'Reverso'}</div>
        <textarea id="est-t-reverso" class="modal-input" rows="3" placeholder="${tp === 'huecos' ? 'Se enseña al ver la respuesta.' : 'Respuesta'}">${escapeHtml(t?.reverso || window._estBorrador?.reverso || '')}</textarea>
        <button class="btn-modal-primary" onclick="guardarEstTarjeta('${mazoId}','${id || ''}','${tp}')">guardar.</button>
        ${t ? `<button class="btn-secondary" style="margin-top:8px;color:#dc2626" onclick="borrarEstTarjeta('${t.id}')">eliminar tarjeta.</button>`
            : `<button class="btn-secondary" style="margin-top:8px" onclick="guardarEstTarjeta('${mazoId}','','${tp}',true)">guardar y añadir otra.</button>`}
    `);
    window._estBorrador = null;
    enfocarSiTeclado(() => document.getElementById('est-t-frente'));
}

function estCambiarTipo(mazoId, id, tipo) {
    window._estBorrador = { frente: document.getElementById('est-t-frente')?.value, reverso: document.getElementById('est-t-reverso')?.value };
    window._estUltimoTipo = tipo;
    if (id) { const t = datosEstudiar().tarjetas.find(x => x.id === id); if (t) { t.tipo = tipo; Object.assign(t, window._estBorrador); } window._estBorrador = null; }
    openEstTarjeta(mazoId, id, tipo);
}

function estHacerHueco() {
    const ta = document.getElementById('est-t-frente');
    if (!ta) return;
    const { selectionStart: a, selectionEnd: b, value: v } = ta;
    if (a === b) { showToast('Selecciona primero el texto que quieres ocultar'); return; }
    const n = Math.max(0, ...[...v.matchAll(/\{\{c(\d+)::/g)].map(m => Number(m[1]))) + 1;
    ta.value = `${v.slice(0, a)}{{c${n}::${v.slice(a, b)}}}${v.slice(b)}`;
    ta.focus();
}

function guardarEstTarjeta(mazoId, id, tipo, otra) {
    const frente = document.getElementById('est-t-frente')?.value.trim() || '';
    const reverso = document.getElementById('est-t-reverso')?.value.trim() || '';
    if (!frente) { showToast('Escribe el frente', true); return; }
    if (tipo === 'huecos' && !/\{\{c\d+::/.test(frente)) { showToast('Marca al menos un hueco', true); return; }
    if (tipo !== 'huecos' && !reverso) { showToast('Escribe el reverso', true); return; }
    const e = datosEstudiar();
    const t = id && e.tarjetas.find(x => x.id === id);
    if (t) Object.assign(t, { frente, reverso, tipo });
    else e.tarjetas.push({ id: estId('ec'), mazoId, tipo, frente, reverso, creada: Date.now() });
    window._estUltimoTipo = tipo;
    guardarEstudiar();
    if (otra) { showToast('Tarjeta guardada'); openEstTarjeta(mazoId, '', tipo); return; }
    closeModal(); render();
}

function borrarEstTarjeta(id) {
    const e = datosEstudiar();
    const t = e.tarjetas.find(x => x.id === id);
    e.tarjetas = e.tarjetas.filter(x => x.id !== id);
    Object.keys(e.repasos).forEach(k => { if (k.split(':')[0] === id) delete e.repasos[k]; });
    closeModal(); render(); guardarEstudiar();
    if (t) openEstVerMazo(t.mazoId);
}

function openEstVerMazo(mazoId) {
    const e = datosEstudiar();
    const m = e.mazos.find(x => x.id === mazoId);
    if (!m) return;
    const ts = e.tarjetas.filter(t => t.mazoId === mazoId);
    const proximo = t => {
        const rs = estCaras(t).map(c => e.repasos[`${t.id}:${c}`]);
        if (rs.some(r => !r)) return 'nueva.';
        const due = Math.min(...rs.map(r => r.due));
        return due <= Date.now() ? 'toca hoy.' : `en ${estPlazo(due - Date.now())}.`;
    };
    showModal(`
        <div class="modal-title">${escapeHtml(m.nombre.toLowerCase())}.</div>
        <div class="est-mazo-botones">
            <button class="btn-secondary" onclick="openEstTarjeta('${m.id}')">+ tarjeta.</button>
            <button class="btn-secondary" onclick="openEstImportar('${m.id}')">importar.</button>
            ${ts.length ? `<button class="btn-secondary" onclick="estExportar('${m.id}')">exportar.</button>` : ''}
            <button class="btn-secondary" onclick="openEstMazo('${m.id}')">editar.</button>
        </div>
        <div class="est-lista">${ts.length ? ts.map(t => `<button class="est-lista-fila" onclick="openEstTarjeta('${m.id}','${t.id}')"><b>${escapeHtml(t.frente.replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g, '[$1]'))}</b><span>${EST_TIPOS[t.tipo] || ''} ${proximo(t)}</span></button>`).join('') : '<div class="finance-empty-line">Este mazo aún no tiene tarjetas.</div>'}</div>
    `);
}

const EST_PROMPT_IA = `Convierte el material que te paso en tarjetas de estudio para Bitácora.
Devuélvelas en un bloque de texto, una tarjeta por línea, con este formato:
pregunta;respuesta
Para tarjetas de huecos, escribe la frase entera con lo que hay que recordar entre {{c1::...}} (y {{c2::...}} si hay más de un hueco), sin punto y coma.
Reglas: una sola idea por tarjeta, preguntas concretas que no se puedan responder con sí o no, respuestas cortas, sin numerar las líneas y sin texto antes ni después del bloque.
Material:
`;

function openEstImportar(mazoId) {
    showModal(`
        <div class="modal-title">importar tarjetas.</div>
        <div class="est-ayuda">Una tarjeta por línea, con el frente y el reverso separados por punto y coma o tabulador (lo que exportan Anki y Quizlet). Las líneas con {{c1::...}} se crean como huecos.</div>
        <textarea id="est-importar" class="modal-input" rows="8" placeholder="Capital de Australia;Canberra&#10;La {{c1::mitocondria}} produce energía."></textarea>
        <div class="modal-label">Las demás, como</div>
        <div class="profe-dias-elegir" id="est-importar-tipo">${['basica', 'inversa', 'escribir'].map((k, i) => `<button type="button" class="profe-chip ${i ? '' : 'activa'}" data-tipo="${k}" onclick="this.parentNode.querySelectorAll('.profe-chip').forEach(x=>x.classList.toggle('activa',x===this))">${EST_TIPOS[k]}</button>`).join('')}</div>
        <button class="btn-modal-primary" onclick="estImportar('${mazoId}')">importar.</button>
        <button class="btn-secondary" style="margin-top:8px" onclick="navigator.clipboard.writeText(EST_PROMPT_IA).then(() => showToast('Copiado: pégalo en Claude o ChatGPT con tus apuntes'))">copiar instrucciones para una IA.</button>
    `);
}

function estImportar(mazoId) {
    const texto = document.getElementById('est-importar')?.value || '';
    const tipo = document.querySelector('#est-importar-tipo .activa')?.dataset.tipo || 'basica';
    const e = datosEstudiar();
    const ya = new Set(e.tarjetas.filter(t => t.mazoId === mazoId).map(t => estNorm(t.frente)));
    let n = 0, repes = 0;
    texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => {
        const sep = l.includes('\t') ? '\t' : ';';
        const i = l.indexOf(sep);
        const frente = (i < 0 ? l : l.slice(0, i)).trim();
        const reverso = (i < 0 ? '' : l.slice(i + 1)).trim();
        const esHueco = /\{\{c\d+::/.test(frente);
        if (!frente || (!reverso && !esHueco)) return;
        if (ya.has(estNorm(frente))) { repes++; return; }
        ya.add(estNorm(frente));
        e.tarjetas.push({ id: estId('ec'), mazoId, tipo: esHueco ? 'huecos' : tipo, frente, reverso, creada: Date.now() + n });
        n++;
    });
    if (!n) { showToast(repes ? 'Esas tarjetas ya estaban en el mazo' : 'No he encontrado tarjetas: separa frente y reverso con ;', true); return; }
    showToast(`${n} ${n === 1 ? 'tarjeta importada' : 'tarjetas importadas'}${repes ? `, ${repes} repetidas` : ''}.`);
    closeModal(); render(); guardarEstudiar();
}

// Texto separado por tabuladores: Anki lo importa tal cual (las de huecos,
// con el tipo de nota «Cloze»).
function estExportar(mazoId) {
    const e = datosEstudiar();
    const m = e.mazos.find(x => x.id === mazoId);
    const limpio = s => String(s || '').replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
    const tsv = e.tarjetas.filter(t => t.mazoId === mazoId).map(t => `${limpio(t.frente)}\t${limpio(t.reverso)}`).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([tsv], { type: 'text/tab-separated-values' }));
    a.download = `${(m?.nombre || 'mazo').replace(/[^\wáéíóúñ -]/gi, '')}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function renderEstTarjetas() {
    const e = datosEstudiar();
    const total = estCuentas();
    if (!e.mazos.length) return `<div class="compra-vacio est-vacio"><b>repaso espaciado.</b>Haz tarjetas con lo que quieras memorizar y Bitácora te las enseña justo antes de que se te olviden: las que fallas vuelven pronto y las que sabes se espacian días, semanas y meses. Es el método de Anki, con el mismo algoritmo (FSRS).<button class="btn-modal-primary" onclick="openEstMazo()">crear el primer mazo.</button></div>`;
    return `<div class="est-tarjetas">
        <div class="est-mazos-cab">
            <button class="btn-modal-primary" onclick="estEmpezarRepaso('')" ${total.toca + total.nuevasHoy ? '' : 'disabled'}>repasar todo. ${total.toca + total.nuevasHoy ? `(${total.toca + total.nuevasHoy})` : ''}</button>
            <button class="btn-secondary" onclick="openEstMazo()">+ mazo.</button>
        </div>
        ${e.mazos.map(m => {
            const c = estCuentas(m.id);
            const a = estAsignatura(m.asignaturaId);
            return `<div class="est-mazo">
                <button class="est-mazo-info" onclick="openEstVerMazo('${m.id}')">
                    <b>${a?.color ? `<i style="background:${escapeHtml(a.color)}"></i>` : ''}${escapeHtml(m.nombre)}</b>
                    <span>${c.total} ${c.total === 1 ? 'tarjeta' : 'tarjetas'}${a ? `, ${escapeHtml(a.name)}` : ''}</span>
                </button>
                <div class="est-mazo-cifras"><span class="nuevas" title="Nuevas para hoy">${c.nuevasHoy}</span><span class="toca" title="Por repasar">${c.toca}</span></div>
                <div class="est-mazo-acciones">
                    <button class="btn-secondary" onclick="openEstTarjeta('${m.id}')">+ tarjeta.</button>
                    <button class="btn-modal-primary" onclick="estEmpezarRepaso('${m.id}')" ${c.toca + c.nuevasHoy ? '' : 'disabled'}>repasar.</button>
                </div>
            </div>`;
        }).join('')}
        <div class="est-leyenda"><span class="nuevas">nuevas.</span><span class="toca">por repasar.</span> ${e.nuevasDia}${estDiario().extra ? ` (+${estDiario().extra} hoy)` : ''} nuevas al día como mucho, para no acumular repasos. <button class="est-enlace" onclick="openEstAjustes()">cambiar.</button>${!estNuevasRestantes() && e.tarjetas.some(t => estCaras(t).some(c => !e.repasos[`${t.id}:${c}`])) ? ` <button class="est-enlace" onclick="estMasHoy()">10 más hoy.</button>` : ''}</div>
    </div>`;
}

// ------------------------------------------------------------
//  SESIÓN DE REPASO
//  Primero lo que está aprendiéndose, luego los repasos que vencen y al
//  final las nuevas que quepan hoy. Lo que se falla o sigue en
//  aprendizaje vuelve al final de la cola en esta misma sesión.
// ------------------------------------------------------------
function estEmpezarRepaso(mazoId) {
    const e = datosEstudiar();
    const ahora = Date.now();
    const claves = estClaves(mazoId);
    const vencidas = claves.filter(k => e.repasos[k] && e.repasos[k].due <= ahora).sort((a, b) => {
        const ra = e.repasos[a], rb = e.repasos[b];
        return (ra.estado === 'repaso') - (rb.estado === 'repaso') || ra.due - rb.due;
    });
    const nuevas = claves.filter(k => !e.repasos[k]).slice(0, estNuevasRestantes());
    const cola = [...vencidas, ...nuevas];
    if (!cola.length) { showToast('Nada que repasar ahora'); return; }
    estRepaso = { mazoId, cola, mostrar: false, hechas: 0, total: cola.length };
    estudiarPestana = 'tarjetas';
    render();
}

function estSalirRepaso() {
    estRepaso = null;
    if (estFoco) salirEstFoco();
    else render();
}

// Modo focus del repaso: la tarjeta sola, a toda la ventana, en una capa
// colgada de <body> (como el reloj del pomodoro y el cuadrante grande).
// Mientras está abierta, la página solo enseña un aviso: así hay una única
// tarjeta y los atajos y el campo de escribir encuentran la buena.
let estFoco = false;

function abrirEstFoco() {
    vtCortar();
    estFoco = true;
    render();
}

function salirEstFoco() {
    estFoco = false;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    pintarEstFoco('');
    render();
}

function pintarEstFoco(html) {
    let capa = document.getElementById('est-foco');
    if (!html) {
        capa?.remove();
        document.body.classList.remove('est-foco-abierto');
        return;
    }
    if (!capa) {
        capa = document.createElement('div');
        capa.id = 'est-foco';
        capa.setAttribute('role', 'dialog');
        capa.setAttribute('aria-label', 'Repaso en modo focus');
        document.body.appendChild(capa);
    }
    document.body.classList.add('est-foco-abierto');
    capa.innerHTML = `<div class="est-foco-esquina">
            ${document.fullscreenEnabled ? `<button class="profe-chip" onclick="alternarPantallaCompleta('est-foco')">${document.fullscreenElement ? 'salir de pantalla completa.' : 'pantalla completa.'}</button>` : ''}
            <button class="profe-chip" onclick="salirEstFoco()">salir del modo focus.</button>
        </div>
        <div class="estudiar">${html}</div>`;
    setTimeout(() => capa.querySelector('#est-escrito')?.focus(), 0);
}

document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape' || !estFoco || document.fullscreenElement) return;
    if (document.querySelector('#modal-container .modal-sheet')) return;
    ev.stopPropagation();
    salirEstFoco();
}, true);
document.addEventListener('fullscreenchange', () => {
    if (estFoco && currentView === 'estudiar') render();
    if (document.getElementById('pomo-foco')) pomoFoco(true);
});

function estMostrar() {
    if (!estRepaso || estRepaso.mostrar) return;
    estRepaso.escrito = document.getElementById('est-escrito')?.value || '';
    estRepaso.mostrar = true;
    render();
}

function estCalificar(g) {
    if (!estRepaso?.mostrar) return;
    const e = datosEstudiar();
    const k = estRepaso.cola.shift();
    const r = e.repasos[k];
    const dia = estDiario();
    if (!r) dia.nuevas++;
    dia.repasadas++;
    const nuevo = fsrsOpciones(r)[g - 1];
    e.repasos[k] = nuevo;
    if (nuevo.estado !== 'repaso') estRepaso.cola.push(k);
    else estRepaso.hechas++;
    estRepaso.mostrar = false;
    estRepaso.escrito = '';
    render();
    guardarEstudiar();
}

function renderEstRepaso() {
    const e = datosEstudiar();
    const k = estRepaso.cola[0];
    if (!k) {
        return `<div class="est-repaso est-fin"><b>¡hecho!</b><span>${estRepaso.hechas} ${estRepaso.hechas === 1 ? 'tarjeta repasada' : 'tarjetas repasadas'}. Vuelve cuando Bitácora te avise de que toca.</span><button class="btn-modal-primary" onclick="estSalirRepaso()">volver.</button></div>`;
    }
    const [id, cara] = k.split(':');
    const t = e.tarjetas.find(x => x.id === id);
    if (!t) { estRepaso.cola.shift(); return renderEstRepaso(); }
    const m = e.mazos.find(x => x.id === t.mazoId);
    const { pregunta, respuesta } = estPregunta(t, cara, estRepaso.mostrar);
    const r = e.repasos[k];
    const opciones = fsrsOpciones(r);
    const ahora = Date.now();
    const escribir = t.tipo === 'escribir';
    let comparacion = '';
    if (escribir && estRepaso.mostrar) {
        const ok = estNorm(estRepaso.escrito) === estNorm(t.reverso);
        comparacion = `<div class="est-comparar ${ok ? 'ok' : 'mal'}">${estRepaso.escrito ? `${ok ? '✓' : '✗'} has escrito: <b>${escapeHtml(estRepaso.escrito)}</b>` : 'no has escrito nada.'}</div>`;
    }
    const pendientes = estRepaso.cola.length;
    return `<div class="est-repaso">
        <div class="est-repaso-cab">
            <button class="est-enlace" onclick="estSalirRepaso()">← salir.</button>
            <span>${escapeHtml(m?.nombre || '')}, quedan ${pendientes}${estFoco ? '' : `, <button class="est-enlace" onclick="abrirEstFoco()" title="La tarjeta sola, a toda la ventana">modo focus.</button>`}</span>
        </div>
        <div class="est-barra"><i style="width:${Math.min(100, estRepaso.hechas / Math.max(1, estRepaso.total) * 100)}%"></i></div>
        <div class="est-carta ${!r ? 'nueva' : ''}">
            ${!r ? '<div class="est-carta-etiqueta">nueva.</div>' : ''}
            <div class="est-carta-pregunta">${estRepaso.mostrar && t.tipo === 'huecos' ? respuesta : pregunta}</div>
            ${escribir && !estRepaso.mostrar ? `<input id="est-escrito" class="modal-input" placeholder="Escribe la respuesta" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();estMostrar()}">` : ''}
            ${estRepaso.mostrar && t.tipo !== 'huecos' ? `<div class="est-carta-respuesta">${respuesta}</div>` : ''}
            ${comparacion}
        </div>
        ${estRepaso.mostrar ? `<div class="est-notas">${['otra vez.', 'difícil.', 'bien.', 'fácil.'].map((txt, i) => `<button class="est-nota est-nota-${i + 1}" onclick="estCalificar(${i + 1})"><b>${txt}</b><span>${estPlazo(opciones[i].due - ahora)}</span><kbd>${i + 1}</kbd></button>`).join('')}</div>`
            : `<button class="btn-modal-primary est-mostrar" onclick="estMostrar()">ver la respuesta. <kbd>espacio</kbd></button>`}
        <div class="est-atajos">Atajos: espacio para ver la respuesta, 1 a 4 para responder.</div>
    </div>`;
}

document.addEventListener('keydown', ev => {
    if (currentView !== 'estudiar' || !estRepaso || !estRepaso.cola.length) return;
    if (document.getElementById('modal-container')?.innerHTML.trim()) return;
    const enCampo = /INPUT|TEXTAREA|SELECT/.test(ev.target?.tagName || '');
    if (!estRepaso.mostrar && (ev.key === ' ' || ev.key === 'Enter') && !enCampo) { ev.preventDefault(); estMostrar(); return; }
    if (estRepaso.mostrar && !enCampo && /^[1-4]$/.test(ev.key)) { ev.preventDefault(); estCalificar(Number(ev.key)); }
    else if (estRepaso.mostrar && !enCampo && ev.key === ' ') { ev.preventDefault(); estCalificar(3); }
});

// ------------------------------------------------------------
//  VISTA
// ------------------------------------------------------------
function renderEstudiar() {
    datosEstudiar();
    setTimeout(() => pomoPintar(false), 0);
    if (estRepaso && estFoco) {
        pintarEstFoco(renderEstRepaso());
        return `<div class="estudiar"><div class="profe-grande-aviso">El repaso está en modo focus. <button class="profe-chip" onclick="salirEstFoco()">volver aquí.</button></div></div>`;
    }
    pintarEstFoco('');
    if (estRepaso) return `<div class="estudiar">${renderEstRepaso()}</div>`;
    const c = estCuentas();
    const porRepasar = c.toca + c.nuevasHoy;
    const pestanas = [['hoy', 'hoy.'], ['tarjetas', `tarjetas.${porRepasar ? ` <small>${porRepasar}</small>` : ''}`], ['temario', 'temario.'], ['test', 'test.']];
    return `<div class="estudiar">
        ${pestanasEstudios('estudiar')}
        <div class="compra-cab">
            <div>
                <div class="compra-titulo">repaso.</div>
                <div class="compra-sub">Pomodoro, plan del día, temario, repaso espaciado y tests con amigos.</div>
            </div>
            <button class="pedido-btn" onclick="openEstAjustes()">ajustes.</button>
        </div>
        <div class="compra-listas est-pestanas">${pestanas.map(([k, t]) => `<button class="profe-chip ${estudiarPestana === k ? 'activa' : ''}" onclick="estudiarPestana='${k}';render()">${t}</button>`).join('')}</div>
        ${estudiarPestana === 'tarjetas' ? renderEstTarjetas() : estudiarPestana === 'temario' ? renderEstTemario() : estudiarPestana === 'test' ? renderEstTest() : renderEstHoy()}
    </div>`;
}
