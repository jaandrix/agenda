// ============================================================
//  INVITAR A UN AMIGO
//  Cada cuenta tiene su código (Ajustes → cuenta → «invita a un amigo.»)
//  y un enlace appbitacora.es/?amigo=CODIGO. Quien se da de alta con él
//  tiene 30 días de prueba en vez de 14, y los dos desbloquean el tema
//  «amigos.». El código viaja en los datos del alta (user_metadata), así
//  vale aunque se confirme el correo en otro dispositivo, y se aplica al
//  entrar por primera vez (usar_codigo_invitacion). Ver
//  supabase/sql/invitaciones.sql.
// ============================================================
const DIAS_PRUEBA_AMIGO = 30;
let invitacion = { invitado: false, amigos: 0 };

function codigoAmigoGuardado() {
    try { return localStorage.getItem('bitacora-amigo') || ''; } catch (e) { return ''; }
}

// El enlace de un amigo deja el código guardado y lo enseña en la portada y en el alta.
(function leerCodigoAmigoDeLaUrl() {
    const c = new URLSearchParams(location.search).get('amigo');
    if (c) { try { localStorage.setItem('bitacora-amigo', c.trim().toUpperCase()); } catch (e) { /* sin almacenamiento */ } }
    const codigo = c || codigoAmigoGuardado();
    if (!codigo) return;
    const nota = document.querySelector('#landing-screen .lp-hero-nota');
    if (nota) nota.textContent = `Te invita un amigo: ${DIAS_PRUEBA_AMIGO} días gratis, sin tarjeta. Después, 1,99 € al mes.`;
    const campo = document.getElementById('signup-amigo');
    if (campo && !campo.value) campo.value = codigo.toUpperCase();
})();

async function aplicarCodigoAmigoPendiente(user) {
    const hecho = 'bitacora-amigo-usado-' + user.id;
    try { if (localStorage.getItem(hecho)) return; } catch (e) { /* sin almacenamiento */ }
    const codigo = String(user.user_metadata?.codigo_amigo || codigoAmigoGuardado() || '').trim();
    if (!codigo || Date.now() - new Date(user.created_at) > DIAS_PRUEBA * 86400000) return;
    const { error } = await consultaConRed(() => sb.rpc('usar_codigo_invitacion', { p_codigo: codigo }));
    if (error && esErrorDeRed(error)) return;
    try { localStorage.setItem(hecho, '1'); localStorage.removeItem('bitacora-amigo'); } catch (e) { /* sin almacenamiento */ }
    if (error) setTimeout(() => showToast(error.message || 'No se pudo usar el código de tu amigo', true), 2500);
}

async function cargarInvitacion(user) {
    const { data } = await consultaConRed(() => sb.from('invitaciones').select('invitado, anfitrion'));
    const filas = data || [];
    invitacion = { invitado: filas.some(r => r.invitado === user.id), amigos: filas.filter(r => r.anfitrion === user.id).length };
    return invitacion;
}

// El tema «amigos.» lo desbloquean quien invita (con al menos un amigo dentro) y quien entra con un código.
function temaAmigosDesbloqueado() { return invitacion.invitado || invitacion.amigos > 0; }

async function loadInvitarAjustes() {
    const body = document.getElementById('settings-invitar-body');
    if (!body) return;
    body.classList.remove('ajuste-cargando');
    const { data, error } = await consultaConRed(() => sb.rpc('mi_codigo_invitacion'));
    const fila = Array.isArray(data) ? data[0] : data;
    if (error || !fila?.codigo) { body.innerHTML = '<div class="ajuste-texto">No se ha podido cargar tu código ahora mismo.</div>'; return; }
    const enlace = `${location.origin}/?amigo=${encodeURIComponent(fila.codigo)}`;
    const s = suscripcionActual;
    const puedeUsar = s?.estado === 'prueba' && !invitacion.invitado;
    body.innerHTML = `
        <div class="invitar-codigo"><b>${escapeHtml(fila.codigo)}</b><span>${fila.amigos ? `${fila.amigos} ${fila.amigos === 1 ? 'amigo ha entrado' : 'amigos han entrado'} con tu código.` : 'Nadie ha entrado aún con tu código.'}</span></div>
        <div class="ajuste-botones">
            <button class="btn-secondary" style="width:auto" onclick="compartirEnlaceAmigo('${jsAttr(enlace)}')">${navigator.share ? 'compartir enlace.' : 'copiar enlace.'}</button>
        </div>
        ${puedeUsar ? `
        <div class="ajuste-subtitulo">¿te ha invitado alguien?</div>
        <div class="invitar-usar"><input id="invitar-usar-codigo" class="modal-input" placeholder="AMIGO-XXXX-XXXX" autocomplete="off"><button class="btn-secondary" style="width:auto" onclick="usarCodigoAmigoAjustes()">usar.</button></div>` : ''}`;
}

async function compartirEnlaceAmigo(enlace) {
    const texto = `Yo organizo mi vida con Bitácora. Con mi enlace tienes ${DIAS_PRUEBA_AMIGO} días gratis:`;
    if (navigator.share) {
        try { await navigator.share({ title: 'Bitácora', text: texto, url: enlace }); return; } catch (e) { if (e?.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(`${texto} ${enlace}`); showToast('Enlace copiado'); } catch (e) { prompt('Copia el enlace:', enlace); }
}

async function usarCodigoAmigoAjustes() {
    const codigo = document.getElementById('invitar-usar-codigo')?.value.trim();
    if (!codigo) return;
    const { data, error } = await consultaConRed(() => sb.rpc('usar_codigo_invitacion', { p_codigo: codigo }));
    if (error) { showToast(error.message || 'No se pudo usar el código', true); return; }
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
        await cargarInvitacion(user);
        suscripcionActual = await getSubscriptionStatus(user);
    }
    showToast(`Listo: te quedan ${data} días de prueba`);
    render();
}
