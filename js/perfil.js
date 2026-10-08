// ============================================================
//  PERFIL (foto y descripción)
//  Cada usuario tiene una foto de perfil y una frase sobre sí mismo que
//  ven sus amigos (tabla perfiles_fotos, ver supabase/sql/perfiles_fotos.sql).
//  Toda foto se convierte aquí, antes de subirla, a blanco y negro con
//  grano y recortada en cuadrado: así todas las de la app van a juego,
//  sea cual sea la foto original.
// ============================================================
let miPerfil = { foto: null, descripcion: '' };
let perfilBorrador = null;

async function cargarMiPerfil() {
    try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return;
        const { data, error } = await sb.from('perfiles_fotos').select('foto, descripcion').eq('user_id', user.id).maybeSingle();
        if (error) { console.error('Error cargando el perfil:', error); return; }
        miPerfil = { foto: data?.foto || null, descripcion: data?.descripcion || '' };
        if (currentView === 'calendar' || currentView === 'friends') render();
    } catch (e) {
        console.error('Error cargando el perfil:', e);
    }
}

function avatarHtml(foto, nombre, clase = '') {
    const inicial = String(nombre || '?').trim().charAt(0).toUpperCase() || '?';
    return `<span class="avatar ${clase}">${foto ? `<img src="${foto}" alt="">` : `<span>${escapeHtml(inicial)}</span>`}</span>`;
}

function miNombreVisible() {
    return nombrePublico || userName || '';
}

// Recorte cuadrado centrado, niveles automáticos (sin los extremos del
// histograma), curva en S suave y grano monocromo. 256 px en JPEG: unos
// 30-40 KB, lo bastante pequeño para guardarlo como texto en la tabla.
function procesarFotoPerfil(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const T = 256;
            const lienzo = document.createElement('canvas');
            lienzo.width = lienzo.height = T;
            const ctx = lienzo.getContext('2d');
            const lado = Math.min(img.naturalWidth, img.naturalHeight);
            ctx.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, T, T);
            const datos = ctx.getImageData(0, 0, T, T);
            const p = datos.data;
            const luz = new Float32Array(T * T);
            const hist = new Array(256).fill(0);
            for (let i = 0; i < luz.length; i++) {
                const l = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2];
                luz[i] = l;
                hist[Math.min(255, Math.round(l))]++;
            }
            const percentil = q => { let acum = 0; for (let v = 0; v < 256; v++) { acum += hist[v]; if (acum >= luz.length * q) return v; } return 255; };
            const bajo = percentil(0.02), alto = Math.max(percentil(0.98), bajo + 1);
            for (let i = 0; i < luz.length; i++) {
                let v = Math.min(1, Math.max(0, (luz[i] - bajo) / (alto - bajo)));
                const s = v < 0.5 ? 2 * v * v : 1 - 2 * (1 - v) * (1 - v);
                v = (v * 0.45 + s * 0.55) * 255;
                v += (Math.random() + Math.random() + Math.random() - 1.5) * 30;
                v = Math.min(255, Math.max(0, v));
                p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = v;
            }
            ctx.putImageData(datos, 0, 0);
            resolve(lienzo.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen no válida')); };
        img.src = url;
    });
}

function openMiPerfil() {
    perfilBorrador = { foto: miPerfil.foto, descripcion: miPerfil.descripcion || '', nombre: miNombreVisible() };
    showModal(`
        <div class="modal-title">mi perfil.</div>
        <div id="perfil-editor">${renderPerfilEditor()}</div>
    `);
}

function renderPerfilEditor() {
    const b = perfilBorrador;
    return `
        <div class="perfil-cabeza">
            <button class="perfil-foto" onclick="document.getElementById('perfil-foto-input').click()" aria-label="Cambiar la foto">
                ${avatarHtml(b.foto, b.nombre, 'avatar-grande')}
                <span class="perfil-foto-cambiar">${b.foto ? 'cambiar.' : 'añadir foto.'}</span>
            </button>
            <input type="file" id="perfil-foto-input" accept="image/*" hidden onchange="elegirFotoPerfil(this)">
            <p>Todas las fotos de perfil de bitácora pasan a blanco y negro con grano, para que vayan en sintonía. Solo la ven tus amigos.${b.foto ? ` <button class="perfil-quitar" onclick="perfilBorrador.foto=null;repintarPerfilEditor()">quitar foto.</button>` : ''}</p>
        </div>
        <div class="modal-label">nombre visible</div>
        <input id="perfil-nombre" class="modal-input" value="${escapeHtml(b.nombre)}" placeholder="Cómo te ven tus amigos" maxlength="40" oninput="perfilBorrador.nombre=this.value">
        <div class="modal-label">sobre ti</div>
        <textarea id="perfil-descripcion" class="modal-input" rows="3" maxlength="160" placeholder="Estudio Psicología en Valencia, corro los domingos y siempre llego tarde." oninput="perfilBorrador.descripcion=this.value;document.getElementById('perfil-cuenta').textContent=this.value.length+'/160'">${escapeHtml(b.descripcion || '')}</textarea>
        <div class="perfil-cuenta" id="perfil-cuenta">${(b.descripcion || '').length}/160</div>
        <button class="btn-modal-primary" id="perfil-guardar" onclick="guardarMiPerfil()">guardar.</button>`;
}

function repintarPerfilEditor() {
    const el = document.getElementById('perfil-editor');
    if (el) el.innerHTML = renderPerfilEditor();
}

async function elegirFotoPerfil(input) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
        perfilBorrador.foto = await procesarFotoPerfil(file);
        repintarPerfilEditor();
    } catch (e) {
        console.error(e);
        showToast('No se ha podido abrir esa imagen', true);
    }
}

async function guardarMiPerfil() {
    const b = perfilBorrador;
    const nombre = (b.nombre || '').trim();
    if (!nombre) { showToast('Escribe tu nombre visible', true); return; }
    const btn = document.getElementById('perfil-guardar');
    if (btn) { btn.disabled = true; btn.textContent = 'guardando...'; }
    try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return;
        const ahora = new Date().toISOString();
        if (nombre !== nombrePublico) {
            const { error } = await sb.from('perfiles_publicos').upsert({ user_id: user.id, nombre_publico: nombre, actualizado_en: ahora }, { onConflict: 'user_id' });
            if (error) {
                if (error.code === '23505') { showToast('Ese nombre ya lo tiene otra persona, prueba otro', true); return; }
                throw error;
            }
            nombrePublico = nombre;
        }
        const descripcion = (b.descripcion || '').trim().slice(0, 160);
        const { error } = await sb.from('perfiles_fotos').upsert({ user_id: user.id, foto: b.foto || null, descripcion: descripcion || null, actualizado_en: ahora }, { onConflict: 'user_id' });
        if (error) throw error;
        miPerfil = { foto: b.foto || null, descripcion };
        closeModal();
        render();
        showToast('Perfil guardado');
    } catch (e) {
        console.error('Error guardando el perfil:', e);
        showToast('No se pudo guardar el perfil', true);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'guardar.'; }
    }
}

// Botón con tu foto junto al título de Home (escritorio).
function pintarAvatarCabecera() {
    const btn = document.getElementById('mi-avatar');
    if (!btn) return;
    btn.hidden = currentView !== 'calendar';
    if (!btn.hidden) btn.innerHTML = avatarHtml(miPerfil.foto, miNombreVisible(), 'avatar-cabecera');
}
