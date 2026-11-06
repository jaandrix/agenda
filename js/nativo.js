// Fase 6 del plan de sensación nativa (06-11): lo que la web pide a la app de iPhone (ios/BitacoraApp, Nativo.swift)
// por el puente con respuesta «bitacoraNativa». Fuera de la envoltura no hace nada: la PWA y el escritorio siguen
// igual. Va después de inicio.js; las funciones de otros archivos se miran con typeof.

const nativoActivo = appEntorno.modo === 'ios-wrapper' && !!window.webkit?.messageHandlers?.bitacoraNativa;
let nativoEstado = { ...(window.__BITACORA_NATIVE__ || {}) };
let nativoFinanzasAbiertas = false;

function nativoPedir(accion, datos = {}) {
    if (!nativoActivo) return Promise.reject(new Error('sin app nativa'));
    return window.webkit.messageHandlers.bitacoraNativa.postMessage({ ...datos, accion });
}

// Compartir: navigator.share de la WKWebView no siempre existe ni acepta archivos; con esto, «compartir.» de Tu mes,
// la guía para tu IA, invitar a un amigo o un enlace compartido abren la hoja nativa.
if (nativoActivo) {
    const aBase64 = archivo => new Promise((ok, mal) => {
        const lector = new FileReader();
        lector.onload = () => ok(String(lector.result).split(',')[1] || '');
        lector.onerror = () => mal(lector.error);
        lector.readAsDataURL(archivo);
    });
    const compartir = async (d = {}) => {
        const archivos = await Promise.all([...(d.files || [])].map(async f => ({ nombre: f.name, tipo: f.type, base64: await aBase64(f) })));
        const r = await nativoPedir('compartir', { titulo: d.title || '', texto: d.text || '', url: d.url || '', archivos });
        if (!r?.ok) throw new DOMException('Compartir cancelado', 'AbortError');
    };
    try {
        Object.defineProperty(navigator, 'share', { value: compartir, configurable: true, writable: true });
        Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true, writable: true });
    } catch (_) { /* navegador que no deja redefinirlo: se queda el suyo */ }
}

function abrirFuera(url) {
    if (nativoActivo) nativoPedir('abrir', { url }).catch(() => window.open(url, '_blank', 'noopener'));
    else window.open(url, '_blank', 'noopener');
}

// Lo que llega de otras apps (atajo «Mandar a Bitácora», «Abrir en Bitácora» de un .txt) va a Apuntar como borrador:
// si ya había uno, se añade debajo, y se abre la hoja para revisarlo antes de guardar.
window.bitacoraNativo = Object.freeze({ hayPendientes: () => nativoRecogerPendientes() });
let nativoRecogiendo = false;
async function nativoRecogerPendientes() {
    if (!nativoActivo || nativoRecogiendo) return;
    if (!appInitialized) { setTimeout(nativoRecogerPendientes, 700); return; }
    nativoRecogiendo = true;
    try {
        const lista = await nativoPedir('pendientes');
        const textos = (Array.isArray(lista) ? lista : []).filter(c => c?.tipo === 'texto' && String(c.texto || '').trim()).map(c => String(c.texto).trim());
        if (textos.length) nativoAApuntar(textos.join('\n'));
    } catch (e) { console.error(e); }
    nativoRecogiendo = false;
}

function nativoAApuntar(texto) {
    if (typeof openApuntar !== 'function') return;
    try {
        const anterior = typeof apuntarLeerBorrador === 'function' ? apuntarLeerBorrador() : '';
        localStorage.setItem(apuntarClaveBorrador(), JSON.stringify({ texto: anterior ? anterior + '\n' + texto : texto, actualizado: Date.now() }));
    } catch (_) { /* sin almacenamiento: se abre igual, vacío */ }
    openApuntar();
}

// Avisos locales: dentro de la app no hay notificaciones web, así que la app programa en el iPhone una hora antes de
// cada evento con hora de los próximos 7 días (mismas reglas que avisos-diarios: ni silenciados ni con «eventos.»
// apagado) y pone en el icono cuántas tareas de hoy faltan. Se manda la lista entera al ir a segundo plano.
function nativoAvisosLista() {
    if (preferenciasAvisos?.eventos === false) return [];
    const ahora = Date.now(), limite = ahora + 7 * 864e5;
    const dos = n => String(n).padStart(2, '0');
    return (entries || []).filter(e => e?.type === 'event' && !e.calendarLog && !e.sinAviso
        && !/^(weekly_task_done_|planner_done_|recurring_done_)/.test(e.id || '')
        && /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') && /^\d{1,2}:\d{2}$/.test(e.time || ''))
        .map(e => {
            const [h, m] = e.time.split(':').map(Number);
            const empieza = new Date(e.date + 'T12:00:00');
            empieza.setHours(h, m, 0, 0);
            const aviso = new Date(empieza.getTime() - 3600e3);
            return { e, empieza, aviso };
        })
        .filter(x => x.aviso.getTime() > ahora && x.aviso.getTime() < limite)
        .sort((a, b) => a.aviso - b.aviso)
        .slice(0, 60)
        .map(({ e, aviso }) => ({
            id: `${e.id}-${e.date}-${e.time}`,
            titulo: e.title || 'Evento',
            texto: `Empieza en una hora, a las ${e.time}${e.place ? `, ${e.place}` : ''}.`,
            fecha: `${aviso.getFullYear()}-${dos(aviso.getMonth() + 1)}-${dos(aviso.getDate())}T${dos(aviso.getHours())}:${dos(aviso.getMinutes())}`,
        }));
}

function nativoTareasPendientesHoy() {
    try {
        const hoy = todayISO();
        const tareas = typeof plannerItemsForOffset === 'function' ? plannerItemsForOffset(0).filter(i => !i.done).length : 0;
        const recurrentes = typeof recurringTasksDueToday === 'function' ? recurringTasksDueToday().filter(t => !t.completadas?.[hoy]).length : 0;
        return tareas + recurrentes;
    } catch (_) { return 0; }
}

function nativoSincronizarAvisos() {
    if (!nativoActivo || !nativoEstado.avisos || !appInitialized) return;
    nativoPedir('avisos', { lista: nativoAvisosLista(), insignia: nativoTareasPendientesHoy() }).catch(e => console.error(e));
}

// Finanzas con Face ID (opcional): al entrar en Finanzas, un velo tapa las cifras hasta pasar Face ID. Vale hasta que
// la app se va a segundo plano.
function nativoVeloFinanzas(poner) {
    let velo = document.getElementById('nativo-velo-finanzas');
    if (!poner) { velo?.remove(); return; }
    if (velo) return;
    velo = document.createElement('div');
    velo.id = 'nativo-velo-finanzas';
    velo.setAttribute('style', 'position:fixed;inset:0;z-index:50;background:var(--bg-app);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center');
    velo.innerHTML = `
        <div style="font-size:26px;font-weight:700;color:var(--text-primary)">finanzas.</div>
        <div style="font-size:14px;color:var(--text-secondary)">Protegidas con ${escapeHtml(nativoNombreBiometria())}.</div>
        <button class="btn-modal-primary" style="width:auto;padding:0 22px" onclick="nativoDesbloquearFinanzas()">desbloquear.</button>
        <button class="btn-secondary" style="width:auto" onclick="nativoVeloFinanzas(false);(mobileStandaloneActive?mobileIr:switchView)('calendar')">volver.</button>`;
    document.body.appendChild(velo);
}

async function nativoDesbloquearFinanzas() {
    try {
        const r = await nativoPedir('biometria', { motivo: 'Ver tus finanzas' });
        if (r?.ok) { nativoFinanzasAbiertas = true; nativoVeloFinanzas(false); }
    } catch (e) { console.error(e); }
}

function nativoRevisarFinanzas(pedir = true) {
    const bloquear = nativoActivo && nativoEstado.bloqueoFinanzas && !nativoFinanzasAbiertas && currentView === 'finances';
    if (!bloquear) { nativoVeloFinanzas(false); return; }
    const yaEstaba = !!document.getElementById('nativo-velo-finanzas');
    nativoVeloFinanzas(true);
    if (!yaEstaba && pedir) nativoDesbloquearFinanzas();
}

if (nativoActivo && typeof render === 'function') {
    const renderSinNativo = render;
    render = function (...args) {
        const r = renderSinNativo.apply(this, args);
        nativoRevisarFinanzas();
        return r;
    };
}

function nativoNombreBiometria() {
    return { faceID: 'Face ID', touchID: 'Touch ID', opticID: 'Optic ID' }[nativoEstado.biometria] || 'el código del iPhone';
}

// Ajustes → conexiones → «app del iphone.» (solo dentro de la app). El estado vive en la app (UserDefaults), no en
// la nube: es de este iPhone.
if (typeof AJUSTES_ICONOS === 'object') AJUSTES_ICONOS.iphone = '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M30 4h40a10 10 0 0 1 10 10v72a10 10 0 0 1-10 10H30a10 10 0 0 1-10-10V14A10 10 0 0 1 30 4zm2 14v58h36V18zm18 64a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/></svg>';
if (typeof AJUSTES_CLAVES === 'object') AJUSTES_CLAVES['app del iphone.'] = 'face id touch id bloqueo candado avisos notificaciones icono insignia compartir app nativa';

function renderAjustesNativo() {
    if (!nativoActivo || typeof bloqueAjuste !== 'function') return '';
    return bloqueAjuste('settings-nativo-section', 'iphone', 'app del iphone.', 'Lo que solo hace la app: se guarda en este iPhone.', `<div id="settings-nativo-body">${renderAjustesNativoCuerpo()}</div>`);
}

function renderAjustesNativoCuerpo() {
    const bio = nativoNombreBiometria();
    const fila = (clave, titulo, texto) => {
        const on = !!nativoEstado[clave];
        return `
            <div class="avisos-tipo">
                <div class="avisos-tipo-texto">
                    <div class="avisos-tipo-titulo">${titulo}</div>
                    <div class="avisos-tipo-desc">${texto}</div>
                </div>
                <button class="finance-pro-switch ${on ? 'on' : ''}" onclick="nativoCambiarAjuste('${clave}')" aria-label="${titulo}" title="${on ? 'Desactivar' : 'Activar'}">
                    <span class="finance-pro-switch-knob"></span>
                </button>
            </div>`;
    };
    const sinBio = nativoEstado.biometria === 'ninguna';
    const denegado = nativoEstado.permisoAvisos === 'denegado';
    return `
        ${sinBio ? '' : fila('bloqueo', `abrir con ${bio}.`, 'Al abrir Bitácora y al volver tras más de un minuto fuera. En el selector de apps no se ve lo que tienes.')}
        ${sinBio ? '' : fila('bloqueoFinanzas', `finanzas con ${bio}.`, 'Las cifras de Finanzas quedan tapadas hasta que lo pases. Vale hasta que salgas de la app.')}
        ${fila('avisos', 'avisos en el iphone.', denegado ? 'Bloqueados: ve a Ajustes del iPhone → Notificaciones → Bitácora y actívalos.' : 'Una hora antes de cada evento con hora, y en el icono, las tareas de hoy que faltan. Si también tienes la versión web instalada con avisos, te llegarían dos veces.')}
        <div class="avisos-tipo-desc" style="margin-top:10px">Para mandar algo a Apuntar desde otra app: un atajo que abra bitacora://apuntar?texto=… en la hoja de compartir, o «Abrir en Bitácora» con un archivo de texto. Versión ${escapeHtml(nativoEstado.version || '')}.</div>`;
}

async function nativoCambiarAjuste(clave) {
    try {
        const info = await nativoPedir('ajustes', { [clave]: !nativoEstado[clave] });
        if (info) nativoEstado = { ...nativoEstado, ...info };
        if (clave === 'avisos' && nativoEstado.avisos) nativoSincronizarAvisos();
        if (clave === 'avisos' && !nativoEstado.avisos && nativoEstado.permisoAvisos === 'denegado') showToast('Los avisos están bloqueados en los ajustes del iPhone', true);
        if (clave === 'bloqueoFinanzas') nativoFinanzasAbiertas = true;
    } catch (e) { console.error(e); showToast('No se pudo cambiar en la app', true); }
    const cuerpo = document.getElementById('settings-nativo-body');
    if (cuerpo) cuerpo.innerHTML = renderAjustesNativoCuerpo();
}

if (nativoActivo) {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            nativoFinanzasAbiertas = false;
            nativoSincronizarAvisos();
        } else {
            // Con el bloqueo de la app encendido, la app ya puede estar pidiendo Face ID: dos a la vez fallan.
            nativoRevisarFinanzas(!nativoEstado.bloqueo);
        }
    });
    window.addEventListener('DOMContentLoaded', () => {
        const alEstarLista = () => {
            if (!appInitialized) { setTimeout(alEstarLista, 700); return; }
            nativoPedir('info').then(info => { if (info) nativoEstado = { ...nativoEstado, ...info }; nativoSincronizarAvisos(); }).catch(() => {});
            nativoRecogerPendientes();
        };
        alEstarLista();
    });
}
