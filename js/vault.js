        // ============================================================
        //  VAULT: CONTRASEÑAS EN SUPABASE
        // ============================================================

        // Antes era un SHA-256 sin sal: si alguien llegaba a ver el hash, se
        // rompía en segundos con tablas precalculadas. Ahora PBKDF2 con sal
        // propia («pbkdf2$iteraciones$sal$hash»); los hashes viejos siguen
        // valiendo y se cambian al formato nuevo al acertar la contraseña.
        const hexDe = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        async function sha256Antiguo(password) {
            return hexDe(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password)));
        }
        async function pbkdf2(password, salHex, iteraciones) {
            const sal = new Uint8Array(salHex.match(/../g).map(h => parseInt(h, 16)));
            const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
            return hexDe(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: sal, iterations: iteraciones, hash: 'SHA-256' }, clave, 256));
        }
        async function hashPassword(password) {
            const sal = hexDe(crypto.getRandomValues(new Uint8Array(16)));
            return `pbkdf2$310000$${sal}$${await pbkdf2(password, sal, 310000)}`;
        }
        // Devuelve true si la contraseña coincide con el hash guardado.
        async function comprobarClave(password, guardado) {
            if (!guardado) return false;
            if (guardado.startsWith('pbkdf2$')) {
                const [, it, sal, hash] = guardado.split('$');
                return (await pbkdf2(password, sal, Number(it))) === hash;
            }
            return (await sha256Antiguo(password)) === guardado;
        }

        async function getSecret(type) {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) throw new Error('No hay sesión activa');
            const { data, error } = await sb
                .from('bitacora_secrets')
                .select(`${type}_password_hash`)
                .eq('user_id', user.id)
                .maybeSingle();
            if (error) throw error;
            return data ? data[`${type}_password_hash`] : null;
        }

        async function setSecret(type, hash) {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) throw new Error('No hay sesión activa');
            const column = `${type}_password_hash`;
            const { error } = await sb
                .from('bitacora_secrets')
                .upsert({
                    user_id: user.id,
                    [column]: hash
                }, { onConflict: 'user_id' });
            if (error) throw error;
        }

        async function getGlobalDevPasswordHash() {
            const { data, error } = await sb
                .from('global_settings')
                .select('dev_password_hash')
                .eq('id', 1)
                .maybeSingle();
            if (error) throw error;
            return data ? data.dev_password_hash : null;
        }

        async function setGlobalDevPasswordHash(hash) {
            const { error } = await sb
                .from('global_settings')
                .upsert({
                    id: 1,
                    dev_password_hash: hash,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id' });
            if (error) throw error;
        }

        let modalAbridor = null;

        function prepararModalAccesible(container) {
            const sheet = container.querySelector('.modal-sheet');
            if (!sheet) return;
            sheet.setAttribute('role', 'dialog');
            sheet.setAttribute('aria-modal', 'true');
            const titulo = sheet.querySelector('.modal-title');
            if (titulo) {
                titulo.id ||= 'modal-titulo-activo';
                const copiaTitulo = titulo.cloneNode(true);
                copiaTitulo.querySelectorAll('button').forEach(b => b.remove());
                titulo.setAttribute('aria-label', copiaTitulo.textContent.trim());
                sheet.setAttribute('aria-labelledby', titulo.id);
            }
            sheet.querySelectorAll('.modal-close').forEach(b => b.setAttribute('aria-label', 'cerrar'));
        }

        function showModal(htmlContent) {
            vtCortar();
            vtFichaOrigen = null;
            const container = document.getElementById('modal-container');
            // Con un modal ya en pantalla (o cerrándose porque se pasa de uno
            // a otro), se cambia su contenido sin volver a animarlo: tirarlo y
            // crearlo de nuevo hacía que se cerrara y se abriera otra vez.
            const previo = container.querySelector('.modal-overlay');
            if (previo) {
                delete previo.dataset.cerrando;
                // Lo nuevo vuelve a ser una capa normal (si lo de antes era un editor, cerraba distinto).
                previo.classList.remove('modal-m-compacta', 'modal-m-detalle', 'modal-m-editor');
                previo.setAttribute('onclick', 'if(event.target===this) closeModal()');
                quitarSalidaVelo(previo);
                previo.style.animation = 'none';
                const hoja = document.createElement('div');
                hoja.className = 'modal-sheet modal-sheet-cambio';
                hoja.innerHTML = htmlContent;
                previo.replaceChildren(hoja);
                prepararModalAccesible(container);
                enfocarPrimerCampo(container);
                return;
            }
            modalAbridor = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            medirModal();
            container.innerHTML = `
                <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
                    <div class="modal-sheet">
                        ${htmlContent}
                    </div>
                </div>
            `;
            prepararModalAccesible(container);
            abrirCapa();
            // El modal nace del punto que se pulsó (un botón, un día del
            // calendario...) en vez de aparecer siempre en el centro. Se
            // usan offsetLeft/Top porque no les afecta la escala con la que
            // arranca la animación; abierto con teclado, sale del centro.
            // En el móvil la hoja sube desde abajo: medir el punto obligaba a calcular la página antes del primer fotograma.
            const punto = !ES_TACTIL && innerWidth > 600 && vtPunteroReciente();
            const sheet = container.querySelector('.modal-sheet');
            if (punto && sheet && !vtReducido()) {
                sheet.style.transformOrigin = `${Math.round(punto.x - sheet.offsetLeft)}px ${Math.round(punto.y - sheet.offsetTop)}px`;
                sheet.classList.add('modal-sheet-desde-punto');
            }
            // Deja el cursor listo en el primer campo de escritura del modal,
            // para no tener que coger el ratón antes de poder escribir. Un
            // setTimeout(0) en vez de requestAnimationFrame: el foco tiene
            // que "ganar" a cualquier auto-focus que el propio contenido del
            // modal dispare (algunos modales ya llaman a su focus() propio).
            enfocarPrimerCampo(container);
        }

        // Para los modales que traen su propio overlay (la ficha de un
        // evento, el formulario...): si ya había uno abierto, el nuevo no
        // vuelve a fundir el fondo desde cero, que se veía como un parpadeo.
        function ponerModal(html) {
            vtCortar();
            const container = document.getElementById('modal-container');
            const habia = !!container.querySelector('.modal-overlay');
            if (!habia) { modalAbridor = document.activeElement instanceof HTMLElement ? document.activeElement : null; medirModal(); }
            container.innerHTML = html;
            const overlay = habia && container.querySelector('.modal-overlay');
            if (overlay) {
                quitarSalidaVelo(overlay);
                overlay.style.animation = 'none';
                overlay.querySelector('.modal-sheet')?.classList.add('modal-sheet-cambio');
            }
            prepararModalAccesible(container);
            if (!habia) abrirCapa();
            enfocarPrimerCampo(container);
        }

        // Capas del móvil (PWA): «compacta» (confirmar, elegir), «detalle» (consultar una ficha) o «editor» (un formulario
        // a pantalla completa, con «cancelar.» arriba y la acción principal abajo). En el escritorio no cambian nada.
        // El editor no se cierra tocando fuera, y si se ha escrito algo pregunta antes de descartarlo.
        function modoCapa(modo) {
            const overlay = document.querySelector('#modal-container .modal-overlay');
            if (!overlay) return;
            overlay.classList.remove('modal-m-compacta', 'modal-m-detalle', 'modal-m-editor');
            overlay.classList.add('modal-m-' + modo);
            if (modo !== 'editor' || !mobileStandaloneActive) return;
            overlay.removeAttribute('onclick');
            const hoja = overlay.querySelector('.modal-sheet');
            if (!hoja || hoja.querySelector('.m-editor-barra')) return;
            hoja.insertAdjacentHTML('afterbegin', '<div class="m-editor-barra"><button type="button" class="m-editor-cancelar" onclick="cancelarEditor()">cancelar.</button></div>');
            const sucio = e => { if (e.isTrusted) hoja.dataset.sucio = '1'; };
            hoja.addEventListener('input', sucio);
            hoja.addEventListener('change', sucio);
        }
        function cancelarEditor() {
            const hoja = document.querySelector('#modal-container .modal-sheet');
            if (hoja?.dataset.sucio && !confirm('¿Descartar los cambios?')) return;
            closeModal();
        }

        // Arrastrar la hoja hacia abajo desde su parte de arriba la cierra, como una hoja nativa: sigue al dedo y, al soltar,
        // baja desde donde esté o vuelve a su sitio. Solo con la hoja arriba del todo, para no pelear con su scroll, y nunca
        // en un editor, que se cierra con «cancelar.» para no perder lo escrito.
        let arrastreHoja = null;
        const modalContenedor = document.getElementById('modal-container');
        modalContenedor?.addEventListener('touchstart', e => {
            arrastreHoja = null;
            const hoja = e.target.closest?.('.modal-sheet');
            if (!hoja || !capaSinInert() || e.touches.length !== 1 || hoja.scrollTop > 0 || e.target.closest('input, textarea, select')) return;
            const velo = hoja.parentElement;
            if (velo.dataset.cerrando || velo.classList.contains('modal-m-editor') || hoja.getAnimations().some(a => a.playState === 'running')) return;
            const r = hoja.getBoundingClientRect(), y = e.touches[0].clientY;
            if (y - r.top > 72) return;
            arrastreHoja = { hoja, y0: y, y, t: e.timeStamp, v: 0, dy: 0, activo: false, alto: r.height, escala: r.height / (hoja.offsetHeight || 1) || 1 };
        }, { passive: true });
        modalContenedor?.addEventListener('touchmove', e => {
            const a = arrastreHoja;
            if (!a) return;
            const y = e.touches[0].clientY;
            a.dy = y - a.y0;
            // Desde el primer movimiento hacia abajo: si iOS empieza su rebote, ya no deja cancelarlo.
            if (a.dy >= 0 && e.cancelable) e.preventDefault();
            if (!a.activo) {
                if (a.dy < -8) { arrastreHoja = null; return; }
                if (a.dy < 8) return;
                a.activo = true;
                a.hoja.style.animation = 'none';
                a.hoja.style.transition = 'none';
            }
            a.v =(y - a.y) / Math.max(1, e.timeStamp - a.t);
            a.y = y;
            a.t = e.timeStamp;
            a.hoja.style.transform = `translateY(${Math.max(0, a.dy) / a.escala}px)`;
        }, { passive: false });
        const soltarHoja = () => {
            const a = arrastreHoja;
            arrastreHoja = null;
            if (!a?.activo) return;
            if (a.dy > a.alto * 0.28 || a.v > 0.6) { a.hoja.style.removeProperty('transition'); closeModal(); return; }
            a.hoja.style.transition = 'transform .2s var(--ease-out)';
            a.hoja.style.transform = '';
            setTimeout(() => { if (!a.hoja.style.transform) a.hoja.style.removeProperty('transition'); }, 220);
        };
        modalContenedor?.addEventListener('touchend', soltarHoja, { passive: true });
        modalContenedor?.addEventListener('touchcancel', soltarHoja, { passive: true });

        // El + del móvil abre al apoyar el dedo, sin esperar a levantarlo (no está sobre nada que se desplace). El clic de ese
        // mismo toque llega después, con la hoja ya debajo del dedo: se ignora para que no la cierre ni pulse lo que haya ahí.
        let clicDelToque = false;
        function apuntarAlToque(e) {
            if (e.button) return;
            clicDelToque = true;
            const soltar = () => setTimeout(() => { clicDelToque = false; }, 350);
            window.addEventListener('pointerup', soltar, { once: true });
            window.addEventListener('pointercancel', soltar, { once: true });
            openApuntar();
        }
        modalContenedor?.addEventListener('click', e => {
            if (!clicDelToque) return;
            clicDelToque = false;
            e.stopPropagation();
            e.preventDefault();
        }, true);

        // Para lo que puede esperar a que la hoja termine de entrar.
        function trasAbrirModal(fn) {
            const sheet = document.querySelector('#modal-container .modal-sheet');
            let hecho = false;
            const una = () => { if (!hecho) { hecho = true; fn(); } };
            if (!sheet || vtReducido()) { una(); return; }
            // Sin once: la animación de un hijo de la hoja también llega aquí y se llevaba el escuchador.
            sheet.addEventListener('animationend', e => { if (e.target === sheet) una(); });
            setTimeout(una, 400);
        }

        // Si se abre otro modal mientras el velo se aclaraba, el overlay que se reutiliza no puede quedarse transparente.
        function quitarSalidaVelo(overlay) {
            if (!overlay.classList.contains('modal-overlay-saliendo')) return;
            overlay.style.transition = 'none';
            overlay.classList.remove('modal-overlay-saliendo');
            requestAnimationFrame(() => { if (overlay.isConnected) overlay.style.removeProperty('transition'); });
        }

        // Con un modal abierto, lo de detrás no se alcanza con el teclado ni con el lector de pantalla, y el botón atrás
        // (Android, el gesto de la PWA) cierra el modal o el menú en vez de salir de la app.
        let capaEnHistorial = false;
        // Sin viewport-fit=cover (dio problemas en iOS), el velo no llega a la franja de la hora: allí manda theme-color
        // y el fondo de html. Al abrir un modal en la PWA se ponen del color del fondo con el velo encima.
        let fondoTemaCapa = null, veladoPorTema = null;
        function pintarFranjaConCapa(abierta) {
            if (!mobileStandaloneActive) return;
            const meta = document.querySelector('meta[name="theme-color"]');
            if (abierta) {
                if (fondoTemaCapa) return;
                fondoTemaCapa = { meta: meta?.content || '', html: document.documentElement.style.backgroundColor };
                // Leer el color obligaba a resolver los estilos justo antes del primer fotograma: se lee una vez por tema.
                const tema = document.body.className;
                if (veladoPorTema?.tema !== tema) {
                    const m = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g);
                    if (!m) return;
                    veladoPorTema = { tema, color: `rgb(${m.slice(0, 3).map(v => Math.round(Number(v) * 0.45)).join(', ')})` };
                }
                const velado = veladoPorTema.color;
                document.documentElement.style.backgroundColor = velado;
                if (meta) meta.content = velado;
            } else if (fondoTemaCapa) {
                document.documentElement.style.backgroundColor = fondoTemaCapa.html;
                if (meta) meta.content = fondoTemaCapa.meta;
                fondoTemaCapa = null;
            }
        }
        function abrirCapa() {
            pintarFranjaConCapa(true);
            const raiz = raizInteractiva();
            // inert obliga a recalcular los estilos de toda la app, al abrir y al cerrar: medido, el peor fotograma pasaba de
            // 67 a 150 ms al abrir y de 17 a 117 al cerrar (CPU 4x). En táctil no hay tabulador y el velo ya impide tocar lo
            // de detrás: con aria-hidden basta para el lector de pantalla y no recalcula nada.
            if (raiz) { if (capaSinInert()) raiz.setAttribute('aria-hidden', 'true'); else if (!raiz.inert) raiz.inert = true; }
            anotarCapa();
        }
        // Solo una de las dos está a la vista: marcar también la oculta era recorrer otro árbol entero para nada.
        function capaSinInert() { return mobileStandaloneActive || ES_TACTIL; }
        function raizInteractiva() {
            return document.getElementById(mobileStandaloneActive ? 'mobile-shell' : 'app');
        }
        function anotarCapa() {
            if (capaEnHistorial) return;
            capaEnHistorial = true;
            try { history.pushState({ bitacoraCapa: 1 }, ''); } catch (_) { /* sin historial */ }
        }
        function soltarCapa() {
            if (!capaEnHistorial) return;
            capaEnHistorial = false;
            try { if (history.state?.bitacoraCapa) history.back(); } catch (_) { /* sin historial */ }
        }
        function cerrarCapa() {
            pintarFranjaConCapa(false);
            const raiz = raizInteractiva();
            if (raiz) { raiz.removeAttribute('aria-hidden'); if (raiz.inert) raiz.inert = false; }
            if (!mobileMenuAbierto) soltarCapa();
        }
        window.addEventListener('popstate', () => {
            if (!capaEnHistorial) return;
            capaEnHistorial = false;
            if (modalEnPantalla()) closeModal();
            else if (mobileMenuAbierto) toggleMenuMovil();
        });

        // Lo que tarda un modal, solo en este dispositivo (window.metricasModal; no se envía a ningún sitio). «preparar»
        // es lo que tardó en construirse antes de llegar aquí (desde el último toque), «pintado» hasta el primer
        // fotograma y «estable» hasta que la hoja termina de entrar. window.tiemposModal sigue con el pintado.
        let ultimoToque = 0;
        document.addEventListener('pointerdown', () => { ultimoToque = performance.now(); }, { capture: true, passive: true });
        function vigilarFotogramas(ms, fin) {
            const pasos = [];
            let antes = performance.now();
            const t0 = antes;
            const paso = ahora => {
                pasos.push(ahora - antes);
                antes = ahora;
                if (ahora - t0 < ms) requestAnimationFrame(paso);
                else fin({ perdidos: pasos.filter(p => p > 25).length, peor: Math.round(Math.max(0, ...pasos)) });
            };
            requestAnimationFrame(paso);
        }
        function openMedidasModales() {
            const filas = (window.metricasModal || []).slice(-12).reverse();
            showModal(`
                <div class="modal-title">medidas de los modales.</div>
                <div class="finance-modal-note">En este dispositivo, desde esta apertura de la app. Tiempos en milisegundos: abrir hasta verse, y peor fotograma y fotogramas perdidos al abrir y al cerrar. Un fotograma perdido es uno de más de 25 ms.</div>
                ${filas.length ? filas.map(m => `<div class="medida-modal"><b>${escapeHtml(m.nombre)}</b><span>abrir ${m.pintado}, peor ${m.peor ?? '?'}, perdidos ${m.perdidos ?? '?'}</span><span>cerrar ${m.cierre ?? '?'}, peor ${m.peorCierre ?? '?'}, perdidos ${m.perdidosCierre ?? '?'}</span></div>`).join('') : '<div class="finance-modal-note">Abre y cierra algunos modales y vuelve aquí.</div>'}
            `);
        }
        function medirModal() {
            const t0 = performance.now();
            const desdeToque = ultimoToque && t0 - ultimoToque < 600 ? ultimoToque : t0;
            requestAnimationFrame(() => requestAnimationFrame(() => {
                const pintado = performance.now();
                (window.tiemposModal ||= []).push(Math.round(pintado - t0));
                if (window.tiemposModal.length > 30) window.tiemposModal.shift();
                const container = document.getElementById('modal-container');
                const nombre = (container.querySelector('.modal-title')?.textContent || '').trim().slice(0, 40) || 'modal';
                const nodos = container.getElementsByTagName('*').length;
                if (devModeActive) vigilarFotogramas(300, r => { const u = window.metricasModal?.at(-1); if (u?.nombre === nombre) Object.assign(u, r); });
                trasAbrirModal(() => {
                    const m = { nombre, preparar: Math.round(t0 - desdeToque), pintado: Math.round(pintado - desdeToque), estable: Math.round(performance.now() - desdeToque), nodos };
                    (window.metricasModal ||= []).push(m);
                    if (window.metricasModal.length > 50) window.metricasModal.shift();
                });
            }));
        }

        // En pantallas táctiles no se enfocan campos: el iPhone los dejaba enfocados sin teclado y después no lo abría.
        // Además, el teclado que salía solo cambiaba la altura de la pantalla mientras la hoja aún subía (tirones). Es la
        // única política de foco: los apartados piden el foco con enfocarSiTeclado y en el móvil el teclado sale al tocar.
        const ES_TACTIL = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;
        // Con el teclado abierto, lo visible encoge pero la página no: la hoja, pegada abajo, dejaba guardar detrás
        // del teclado. --teclado es lo que tapa; la hoja se levanta eso. Y el campo que se toca se deja a la vista.
        // Mientras sale el teclado llegan muchos eventos: se escribe como mucho una vez por fotograma y solo si cambia.
        if (window.visualViewport) {
            let frameTeclado = 0, ultimoTeclado = -1;
            const ajustarTeclado = () => {
                if (frameTeclado) return;
                frameTeclado = requestAnimationFrame(() => {
                    frameTeclado = 0;
                    const tapa = Math.max(0, innerHeight - visualViewport.height - visualViewport.offsetTop);
                    const px = tapa > 80 ? Math.round(tapa) : 0;
                    if (px === ultimoTeclado) return;
                    ultimoTeclado = px;
                    // En el contenedor, no en la raíz: una variable en la raíz invalida los estilos de toda la página.
                    document.getElementById('modal-container')?.style.setProperty('--teclado', px + 'px');
                });
            };
            visualViewport.addEventListener('resize', ajustarTeclado, { passive: true });
            visualViewport.addEventListener('scroll', ajustarTeclado, { passive: true });
        }
        // Antes se desplazaba siempre 350 ms después (un segundo salto cuando el teclado ya había colocado el campo):
        // ahora solo si, cuando el teclado ha terminado de moverse, el campo sigue tapado.
        function asegurarCampoVisible(campo) {
            if (!campo.isConnected) return;
            const vv = window.visualViewport, r = campo.getBoundingClientRect();
            const arriba = vv?.offsetTop || 0, abajo = arriba + (vv?.height || innerHeight);
            if (r.top < arriba + 12 || r.bottom > abajo - 12) campo.scrollIntoView({ block: 'nearest' });
        }
        document.addEventListener('focusin', e => {
            const campo = e.target;
            if (!ES_TACTIL || !campo.matches?.('input, textarea') || !campo.closest('.modal-sheet')) return;
            const vv = window.visualViewport;
            if (vv && 'onscrollend' in vv) vv.addEventListener('scrollend', () => asegurarCampoVisible(campo), { once: true });
            setTimeout(() => requestAnimationFrame(() => asegurarCampoVisible(campo)), 400);
        });
        function enfocarSiTeclado(buscar) {
            if (ES_TACTIL) return;
            setTimeout(() => buscar()?.focus({ preventScroll: true }), 0);
        }
        function enfocarPrimerCampo(container) {
            setTimeout(() => {
                const sheet = container.querySelector('.modal-sheet');
                const field = !ES_TACTIL && sheet?.querySelector(
                    'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=color]):not([type=file]):not([disabled]), textarea:not([disabled]), select:not([disabled]):not(.selector-nativo)'
                );
                // El modal de un día no tiene campos: el foco va a la hoja, para que la X no salga marcada nada más abrir.
                const primero = field || (sheet?.classList.contains('hoja-dia') ? null : sheet?.querySelector('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'));
                if (!primero && sheet) sheet.tabIndex = -1;
                (primero || sheet)?.focus({ preventScroll: true });
                if (field?.tagName === 'INPUT' && (field.type === 'text' || field.type === '')) field.select?.();
            }, 0);
        }

        document.addEventListener('keydown', e => {
            const sheet = document.querySelector('#modal-container .modal-overlay:not([data-cerrando]) .modal-sheet');
            if (!sheet) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                closeModal();
            } else if (e.key === 'Tab') {
                const enfocables = [...sheet.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]):not([type=hidden]), textarea:not([disabled]), select:not([disabled]):not(.selector-nativo), [tabindex]:not([tabindex="-1"])')].filter(el => el.offsetParent || el === document.activeElement);
                if (!enfocables.length) return;
                const primero = enfocables[0], ultimo = enfocables[enfocables.length - 1];
                if (!sheet.contains(document.activeElement)) { e.preventDefault(); primero.focus(); }
                else if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
                else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
            }
        });

        // ============================================================
        //  PASSWORD ACCESS SYSTEM (para Vault) - CORREGIDO
        // ============================================================

        async function requestPasswordAccess(type, onSuccess) {
            try {
                const storedHash = await getSecret(type);
                
                if (!storedHash) {
                    // No hay contraseña guardada → crear por primera vez
                    window._passwordSuccessCallback = onSuccess;
                    window._passwordType = type;
                    
                    showModal(`
                        <div class="modal-title" style="color:var(--vault-accent)">
                            Configurar acceso a Vault
                        </div>
                        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
                            Establece una contraseña para proteger Vault.
                        </div>
                        <div class="form-row">
                            <label class="modal-label">Nueva contraseña</label>
                            <input type="password" id="pw-new" class="modal-input" placeholder="Mínimo 6 caracteres" onkeydown="if(event.key==='Enter')createPassword('${type}')">
                        </div>
                        <div class="form-row">
                            <label class="modal-label">Repetir contraseña</label>
                            <input type="password" id="pw-new2" class="modal-input" placeholder="Repite la contraseña" onkeydown="if(event.key==='Enter')createPassword('${type}')">
                        </div>
                        <div id="pw-create-error" style="color:var(--c-dc2626);font-size:12px;margin-bottom:8px;min-height:16px"></div>
                        <button class="btn-modal-primary" onclick="createPassword('${type}')" style="background:var(--vault-accent)">
                            🔐 Crear contraseña
                        </button>
                    `);
                    return;
                }

                // Ya hay contraseña guardada → verificar acceso
                window._passwordSuccessCallback = onSuccess;
                window._passwordType = type;

                showModal(`
                    <div class="modal-title" style="color:var(--vault-accent)">
                        Acceso a Vault
                    </div>
                    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
                        Introduce tu contraseña para acceder.
                    </div>
                    <div class="form-row">
                        <label class="modal-label">Contraseña</label>
                        <input type="password" id="pw-input" class="modal-input" placeholder="Tu contraseña" onkeydown="if(event.key==='Enter')verifyPassword('${type}')">
                    </div>
                    <div id="pw-error" style="color:var(--c-dc2626);font-size:12px;margin-bottom:8px;min-height:16px"></div>
                    <button class="btn-modal-primary" onclick="verifyPassword('${type}')" style="background:var(--vault-accent)">
                        Verificar
                    </button>
                `);

                // Enfocar el input después de renderizar
                setTimeout(() => {
                    const input = document.getElementById('pw-input');
                    if (input) input.focus();
                }, 100);
                
            } catch (e) {
                console.error('Error al acceder a la contraseña:', e);
                showToast('Error de conexión, intenta de nuevo', true);
            }
        }

        async function createPassword(type) {
            const pw1 = document.getElementById('pw-new').value;
            const pw2 = document.getElementById('pw-new2').value;
            const errorEl = document.getElementById('pw-create-error');
            
            if (!pw1 || pw1.length < 6) {
                errorEl.textContent = '❌ La contraseña debe tener al menos 6 caracteres';
                return;
            }
            if (pw1 !== pw2) {
                errorEl.textContent = '❌ Las contraseñas no coinciden';
                return;
            }
            
            try {
                const hash = await hashPassword(pw1);
                await setSecret(type, hash);
                closeModal();
                if (window._passwordSuccessCallback) {
                    window._passwordSuccessCallback();
                }
                showToast('🔑 Contraseña creada correctamente');
            } catch (e) {
                console.error('Error al crear contraseña:', e);
                errorEl.textContent = 'Error al guardar la contraseña. Intenta de nuevo.';
            }
        }

        async function verifyPassword(type) {
            const input = document.getElementById('pw-input');
            if (!input) return;
            const password = input.value;
            const errorEl = document.getElementById('pw-error');
            
            if (!password) {
                errorEl.textContent = 'Introduce tu contraseña';
                return;
            }
            
            try {
                const storedHash = await getSecret(type);
                if (!storedHash) {
                    errorEl.textContent = 'No hay contraseña guardada. Contacta con el administrador.';
                    return;
                }
                
                if (await comprobarClave(password, storedHash)) {
                    if (!storedHash.startsWith('pbkdf2$')) setSecret(type, await hashPassword(password)).catch(e => console.error(e));
                    closeModal();
                    if (window._passwordSuccessCallback) {
                        window._passwordSuccessCallback();
                    }
                } else {
                    errorEl.textContent = '❌ Contraseña incorrecta';
                }
            } catch (e) {
                console.error('Error al verificar contraseña:', e);
                errorEl.textContent = 'Error de conexión, intenta de nuevo';
            }
        }

        // ============================================================
        //  DESARROLLADOR - CREAR CONTRASEÑA GLOBAL
        // ============================================================

        async function createDevPassword() {
            showModal(`
                <div class="modal-title" style="color:var(--accent-purple)">⚙ Configurar Modo Desarrollador</div>
                <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
                    Esta es la contraseña global que se usará para activar el Modo Desarrollador.
                    <br><strong>Guárdala bien</strong>: no hay forma de recuperarla si la pierdes.
                </div>
                <div class="form-row">
                    <label class="modal-label">Nueva contraseña</label>
                    <input type="password" id="dev-pw-new" class="modal-input" placeholder="Mínimo 6 caracteres" onkeydown="if(event.key==='Enter')confirmCreateDevPassword()">
                </div>
                <div class="form-row">
                    <label class="modal-label">Repetir contraseña</label>
                    <input type="password" id="dev-pw-new2" class="modal-input" placeholder="Repite la contraseña" onkeydown="if(event.key==='Enter')confirmCreateDevPassword()">
                </div>
                <div id="dev-pw-create-error" style="color:var(--c-dc2626);font-size:12px;margin-bottom:8px;min-height:16px"></div>
                <button class="btn-modal-primary" onclick="confirmCreateDevPassword()" style="background:var(--accent-purple)">
                    🔐 Establecer contraseña
                </button>
            `);
        }

        async function confirmCreateDevPassword() {
            const pw1 = document.getElementById('dev-pw-new').value;
            const pw2 = document.getElementById('dev-pw-new2').value;
            const errorEl = document.getElementById('dev-pw-create-error');

            if (!pw1 || pw1.length < 6) {
                errorEl.textContent = '❌ La contraseña debe tener al menos 6 caracteres';
                return;
            }
            if (pw1 !== pw2) {
                errorEl.textContent = '❌ Las contraseñas no coinciden';
                return;
            }

            try {
                const hash = await hashPassword(pw1);
                await setGlobalDevPasswordHash(hash);
                closeModal();
                devModeActive = true;
                document.body.classList.add('dev-mode');
                try { localStorage.setItem('bitacora-uso-no-contar', '1'); } catch (e) {}
                marcarCuentaDesarrollador(true);
                render();
                showCenteredMessage('Modo desarrollador activado');
            } catch (e) {
                console.error('Error al guardar la contraseña global:', e);
                errorEl.textContent = 'Error al guardar la contraseña. Asegúrate de que la tabla global_settings existe en Supabase.';
            }
        }

        // ============================================================
        //  MODE DEVELOPER GLOBAL - CONTRASEÑA EN SUPABASE - CORREGIDO
        // ============================================================
        async function marcarCuentaDesarrollador(si) {
            cuentaDesarrollador = si;
            try { await sb.auth.updateUser({ data: { desarrollador: si } }); } catch (e) { console.error(e); }
        }

        async function toggleDeveloperMode() {
            if (devModeActive) {
                // Desactivar (también en la cuenta: para volver hará falta la contraseña otra vez)
                devModeActive = false;
                document.body.classList.remove('dev-mode');
                marcarCuentaDesarrollador(false);
                render();
                showToast('Modo desarrollador desactivado');
                return;
            }

            try {
                const storedHash = await getGlobalDevPasswordHash();

                if (!storedHash) {
                    // No hay contraseña global → ofrecer crearla
                    createDevPassword();
                    return;
                }

                // Pedir la contraseña
                showModal(`
                    <div class="modal-title" style="color:var(--accent-purple)">⚙ Modo Desarrollador</div>
                    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Introduce la contraseña global del Modo Desarrollador para activarlo.</div>
                    <div class="form-row">
                        <label class="modal-label">Contraseña</label>
                        <input type="password" id="pw-dev-input" class="modal-input" placeholder="Contraseña global" onkeydown="if(event.key==='Enter')verifyDevPassword()">
                    </div>
                    <div id="pw-dev-error" style="color:var(--c-dc2626);font-size:12px;margin-bottom:8px;min-height:16px"></div>
                    <button class="btn-modal-primary" onclick="verifyDevPassword()" style="background:var(--accent-purple)">🔓 Activar</button>
                `);

                setTimeout(() => {
                    const input = document.getElementById('pw-dev-input');
                    if (input) input.focus();
                }, 100);

            } catch (e) {
                console.error('Error al obtener la contraseña global:', e);
                showToast('Error al conectar con el servidor. Asegúrate de que la tabla global_settings existe.', true);
            }
        }

        async function verifyDevPassword() {
            const input = document.getElementById('pw-dev-input').value;
            const errorEl = document.getElementById('pw-dev-error');

            if (!input) {
                errorEl.textContent = 'Introduce la contraseña';
                return;
            }

            try {
                const storedHash = await getGlobalDevPasswordHash();
                if (!storedHash) {
                    errorEl.textContent = 'No hay contraseña global configurada';
                    return;
                }

                if (!(await comprobarClave(input, storedHash))) {
                    errorEl.textContent = '❌ Contraseña incorrecta';
                    return;
                }

                closeModal();
                devModeActive = true;
                document.body.classList.add('dev-mode');
                try { localStorage.setItem('bitacora-uso-no-contar', '1'); } catch (e) {}
                marcarCuentaDesarrollador(true);
                render();
                showCenteredMessage('Modo desarrollador activado');
            } catch (e) {
                console.error('Error verificando contraseña:', e);
                errorEl.textContent = 'Error de conexión, intenta de nuevo';
            }
        }

        function openVault() {
            loadVaultData();
            requestPasswordAccess('vault', () => {
                currentView = 'vault';
                document.querySelectorAll('.sidebar-nav button, #mobile-menu-panel .menu-nav button').forEach(b => {
                    b.classList.toggle('active', b.dataset.view === 'vault');
                });
                updatePageTitle();
                render();
            });
        }

        // ============================================================
        //  PROMPTS (Punto 5)
        // ============================================================
        function openNewPrompt() {
            window._editPromptId = null;
            showModal(renderPromptModalContent());
        }

        function openPromptDetail(id) {
            window._editPromptId = id;
            showModal(renderPromptModalContent());
        }

        function renderPromptModalContent() {
            const p = window._editPromptId ? prompts.find(x => x.id === window._editPromptId) : null;
            const title = p ? p.title : '';
            const content = p ? p.content : '';

            return `
                <div class="modal-title" style="font-family:'JetBrains Mono',monospace;color:var(--accent-purple)">&gt; ${p ? 'Editar prompt' : 'Nuevo prompt'}</div>
                <div class="modal-label">Título</div>
                <input id="prompt-title-input" class="modal-input console-font" value="${escapeHtml(title)}" placeholder="Nombre del prompt...">
                <div class="modal-label">Contenido</div>
                <textarea id="prompt-content-input" class="modal-input console-font console-textarea" rows="8" placeholder="Escribe tu prompt aquí...">${escapeHtml(content)}</textarea>
                <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
                    <button class="btn-modal-primary" style="width:auto;background:var(--accent-purple)" onclick="savePrompt()">💾 Guardar</button>
                    <button class="btn-secondary" style="width:auto" onclick="copyPromptToClipboard()">📋 Copiar</button>
                    ${p ? `<button class="btn-secondary" style="width:auto;color:var(--c-dc2626)" onclick="deletePrompt('${p.id}')">🗑 Eliminar</button>` : ''}
                </div>
            `;
        }

        async function savePrompt() {
            const title = document.getElementById('prompt-title-input').value.trim();
            const content = document.getElementById('prompt-content-input').value;
            if (!title) { showToast('Escribe un título', true); return; }

            if (window._editPromptId) {
                const p = prompts.find(x => x.id === window._editPromptId);
                if (p) {
                    p.title = title;
                    p.content = content;
                    p.updatedAt = new Date().toISOString();
                }
            } else {
                prompts.push({ id: 'prompt_' + Date.now(), title, content, updatedAt: new Date().toISOString() });
            }
            closeModal();
            render();
            try { await saveData();
                showToast('Prompt guardado'); } catch (e) { console.error(e);
                showToast('No se pudo guardar en la nube', true); }
        }

        async function deletePrompt(id) {
            if (!confirm('¿Eliminar este prompt?')) return;
            prompts = prompts.filter(p => p.id !== id);
            closeModal();
            render();
            try { await saveData();
                showToast('Prompt eliminado'); } catch (e) { console.error(e);
                showToast('No se pudo guardar en la nube', true); }
        }

        function copyPromptToClipboard() {
            const content = document.getElementById('prompt-content-input').value;
            navigator.clipboard.writeText(content)
                .then(() => showToast('📋 Copiado al portapapeles'))
                .catch(() => showToast('No se pudo copiar', true));
        }

        // ============================================================
        //  VAULT
        // ============================================================
        let vaultTasks = [];

        function loadVaultData() {
            try {
                const stored = localStorage.getItem('vault_data');
                if (stored) {
                    vaultTasks = JSON.parse(stored);
                    return true;
                }
            } catch (e) { console.error('Error cargando Vault:', e); }
            return false;
        }

        function saveVaultData() {
            try {
                localStorage.setItem('vault_data', JSON.stringify(vaultTasks));
                return true;
            } catch (e) {
                console.error('Error guardando Vault:', e);
                return false;
            }
        }

        function renderVault() {
            if (!vaultTasks.length) {
                return `
                    <div style="max-width:600px">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                            <div>
                                <div style="font-size:20px;font-weight:700;color:var(--text-primary)">Vault</div>
                                <div style="font-size:13px;color:var(--text-secondary)">Tareas personales</div>
                            </div>
                            <button class="btn-secondary" onclick="changeVaultPassword()" style="margin:0;padding:6px 12px;font-size:12px;width:auto;color:var(--vault-accent)">🔑 Cambiar contraseña</button>
                        </div>
                        <div class="vault-input-row">
                            <input type="text" id="vault-input" placeholder="Escribe una tarea..." onkeydown="if(event.key==='Enter')addVaultTask()">
                            <button onclick="addVaultTask()">añadir.</button>
                        </div>
                        <div class="empty-state">
                            
                            <div class="empty-title">Sin tareas</div>
                            <div class="empty-sub">Añade tu primera tarea con el campo de arriba</div>
                        </div>
                    </div>
                `;
            }

            const done = vaultTasks.filter(t => t.done);
            const pending = vaultTasks.filter(t => !t.done);

            return `
                <div style="max-width:600px">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                        <div>
                            <div style="font-size:20px;font-weight:700;color:var(--text-primary)">Vault</div>
                            <div style="font-size:13px;color:var(--text-secondary)">${pending.length} pendientes, ${done.length} completadas</div>
                        </div>
                        <button class="btn-secondary" onclick="changeVaultPassword()" style="margin:0;padding:6px 12px;font-size:12px;width:auto;color:var(--vault-accent)">🔑 Cambiar contraseña</button>
                    </div>
                    <div class="vault-input-row">
                        <input type="text" id="vault-input" placeholder="Escribe una tarea..." onkeydown="if(event.key==='Enter')addVaultTask()">
                        <button onclick="addVaultTask()">añadir.</button>
                    </div>

                    ${pending.length ? `
                        <div style="font-size:12px;font-weight:600;text-transform:uppercase;color:var(--text-secondary);letter-spacing:0.5px;margin:12px 0 8px 0">Pendientes</div>
                        ${pending.map((t, i) => {
                            const realIdx = vaultTasks.indexOf(t);
                            return `
                                <div class="vault-task" onclick="toggleVaultTask(${realIdx})">
                                    <span class="task-check">◯</span>
                                    <span class="task-text">${escapeHtml(t.text)}</span>
                                    <button class="task-delete" onclick="event.stopPropagation();deleteVaultTask(${realIdx})"><i class='ico ico-x' aria-hidden=true></i></button>
                                </div>
                            `;
                        }).join('')}
                    ` : ''}

                    ${done.length ? `
                        <div style="font-size:12px;font-weight:600;text-transform:uppercase;color:var(--text-secondary);letter-spacing:0.5px;margin:12px 0 8px 0">Completadas</div>
                        ${done.map((t, i) => {
                            const realIdx = vaultTasks.indexOf(t);
                            return `
                                <div class="vault-task done" onclick="toggleVaultTask(${realIdx})">
                                    <span class="task-check">●</span>
                                    <span class="task-text">${escapeHtml(t.text)}</span>
                                    <button class="task-delete" onclick="event.stopPropagation();deleteVaultTask(${realIdx})"><i class='ico ico-x' aria-hidden=true></i></button>
                                </div>
                            `;
                        }).join('')}
                    ` : ''}
                </div>
            `;
        }

        function addVaultTask() {
            const input = document.getElementById('vault-input');
            if (!input) return;
            const text = input.value.trim();
            if (!text) { showToast('Escribe una tarea', true); return; }

            vaultTasks.push({ text, done: false, created: new Date().toISOString() });
            saveVaultData();
            input.value = '';
            render();
            showToast('Tarea añadida');
        }

        function toggleVaultTask(index) {
            if (index < 0 || index >= vaultTasks.length) return;
            vaultTasks[index].done = !vaultTasks[index].done;
            saveVaultData();
            render();
        }

        function deleteVaultTask(index) {
            if (index < 0 || index >= vaultTasks.length) return;
            if (!confirm('¿Eliminar esta tarea?')) return;
            vaultTasks.splice(index, 1);
            saveVaultData();
            render();
            showToast('Tarea eliminada');
        }

        // ============================================================
        //  VAULT PASSWORD CHANGE
        // ============================================================
        function changeVaultPassword() {
            showModal(`
                <div class="modal-title" style="color:var(--vault-accent)">Cambiar contraseña de Vault</div>
                <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Introduce tu contraseña actual y la nueva.</div>
                <div class="form-row">
                    <label class="modal-label">Contraseña actual</label>
                    <input type="password" id="pw-old-v" class="modal-input" placeholder="Tu contraseña actual">
                </div>
                <div class="form-row">
                    <label class="modal-label">Nueva contraseña</label>
                    <input type="password" id="pw-new-v" class="modal-input" placeholder="Mínimo 6 caracteres">
                </div>
                <div class="form-row">
                    <label class="modal-label">Repetir nueva contraseña</label>
                    <input type="password" id="pw-new2-v" class="modal-input" placeholder="Repite la contraseña">
                </div>
                <div id="pw-change-error-v" style="color:var(--c-dc2626);font-size:12px;margin-bottom:8px;min-height:16px"></div>
                <button class="btn-modal-primary" onclick="updateVaultPassword()" style="background:var(--vault-accent)">🔐 Cambiar contraseña</button>
            `);
        }

        async function updateVaultPassword() {
            const old = document.getElementById('pw-old-v').value;
            const pw1 = document.getElementById('pw-new-v').value;
            const pw2 = document.getElementById('pw-new2-v').value;
            const errorEl = document.getElementById('pw-change-error-v');

            if (!old) { errorEl.textContent = 'Introduce tu contraseña actual'; return; }
            if (!pw1 || pw1.length < 6) { errorEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres'; return; }
            if (pw1 !== pw2) { errorEl.textContent = 'Las contraseñas no coinciden'; return; }

            try {
                const storedHash = await getSecret('vault');
                if (!(await comprobarClave(old, storedHash))) {
                    errorEl.textContent = '❌ Contraseña actual incorrecta';
                    return;
                }
                const newHash = await hashPassword(pw1);
                await setSecret('vault', newHash);
                closeModal();
                showToast('🔑 Contraseña de Vault actualizada');
            } catch (e) {
                console.error('Error cambiando contraseña:', e);
                errorEl.textContent = 'Error de conexión, intenta de nuevo';
            }
        }

