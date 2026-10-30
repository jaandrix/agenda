        // ============================================================
        //  NAVIGATION
        // ============================================================
        let currentView = 'calendar';

        // Abre Apuntes como una ventana flotante dentro de Bitácora.
        // IMPORTANTE: el contenido NO se duplica aquí: se carga directamente
        // desde /apuntes/index.html, por lo que sigue siendo un proyecto independiente.
        let apuntesFloatingWindow = null;

        function openApuntes() {
            if (apuntesFloatingWindow) {
                apuntesFloatingWindow.classList.remove('apuntes-window-minimized');
                apuntesFloatingWindow.style.display = 'flex';
                bringApuntesToFront();
                return;
            }

            const layer = document.createElement('div');
            layer.className = 'apuntes-window-layer';
            layer.innerHTML = `
                <div class="apuntes-window" id="apuntes-floating-window">
                    <div class="apuntes-window-bar" id="apuntes-window-bar">
                        <div class="apuntes-window-title">Apuntes</div>
                        <div class="apuntes-window-actions">
                            <button class="apuntes-window-action" type="button" title="Minimizar" onclick="minimizeApuntes()">−</button>
                            <button class="apuntes-window-action" type="button" title="Maximizar" onclick="maximizeApuntes()">□</button>
                            <button class="apuntes-window-action" type="button" title="Cerrar" onclick="closeApuntes()"><i class='ico ico-x' aria-hidden=true></i></button>
                        </div>
                    </div>
                    <iframe class="apuntes-window-frame" src="/apuntes/index.html" title="Apuntes"></iframe>
                </div>`;

            document.body.appendChild(layer);
            apuntesFloatingWindow = layer.querySelector('#apuntes-floating-window');
            bringApuntesToFront();
            makeApuntesDraggable(apuntesFloatingWindow, layer.querySelector('#apuntes-window-bar'));

            // Si se pulsa fuera de la ventana, no la cerramos: se comporta como
            // una ventana de escritorio y permanece disponible hasta que el usuario la cierre.
            layer.addEventListener('mousedown', () => bringApuntesToFront());
        }

        function bringApuntesToFront() {
            if (!apuntesFloatingWindow) return;
            apuntesFloatingWindow.style.zIndex = String(Date.now());
        }

        function minimizeApuntes() {
            if (!apuntesFloatingWindow) return;
            apuntesFloatingWindow.classList.toggle('apuntes-window-minimized');
        }

        function maximizeApuntes() {
            if (!apuntesFloatingWindow) return;
            apuntesFloatingWindow.classList.toggle('maximized');
        }

        function closeApuntes() {
            if (!apuntesFloatingWindow) return;
            const layer = apuntesFloatingWindow.parentElement;
            layer?.remove();
            apuntesFloatingWindow = null;
        }

        function makeApuntesDraggable(win, bar) {
            let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
            bar.addEventListener('mousedown', (e) => {
                if (e.target.closest('button')) return;
                if (win.classList.contains('maximized')) return;
                dragging = true;
                const rect = win.getBoundingClientRect();
                startX = e.clientX; startY = e.clientY; startLeft = rect.left; startTop = rect.top;
                win.style.left = rect.left + 'px'; win.style.top = rect.top + 'px'; win.style.transform = 'none';
                e.preventDefault();
            });
            window.addEventListener('mousemove', (e) => {
                if (!dragging) return;
                win.style.left = Math.max(0, startLeft + e.clientX - startX) + 'px';
                win.style.top = Math.max(0, startTop + e.clientY - startY) + 'px';
            });
            window.addEventListener('mouseup', () => { dragging = false; });
        }

        function updateHeaderClock() {
            const el=document.getElementById('header-clock');
            if(el) el.textContent=new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
        }

        // Barra casi imperceptible en la sidebar: progreso del día transcurrido (0:00-23:59).
        function updateSidebarProgress() {
            const fill = document.getElementById('sidebar-progress-fill');
            const pctEl = document.getElementById('sidebar-progress-pct');
            if (fill && pctEl) {
                const now = new Date();
                const secondsElapsed = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
                const pct = Math.min(100, Math.max(0, (secondsElapsed / 86400) * 100));
                fill.style.transform = `scaleX(${(pct / 100).toFixed(4)})`;
                pctEl.textContent = Math.round(pct) + '%';
            }

            // Comprueba si "hoy" ha cambiado (cruce de las 4:00 am), para
            // limpiar días pasados y refrescar la pestaña "Hoy" si está abierta.
            const todayKey = currentPlannerDayKey();
            if (plannerLastTodayKey !== todayKey) {
                plannerLastTodayKey = todayKey;
                resetDayPlannerIfNeeded();
                if (currentView === 'planner') render();
            }
        }

        // Vuelve a disparar la animación de entrada del contenido al
        // cambiar de apartado (el nodo #content persiste entre renders,
        // así que hay que forzar un reflow para reiniciar la animación).
        // ============================================================
        //  TRANSICIONES
        //  El movimiento explica la relación entre lo que se deja y lo
        //  que se abre: dirección según la barra lateral, deslizamiento
        //  lateral en lo que avanza en el tiempo, zoom desde el punto
        //  pulsado y elementos que viajan de una vista a otra. Usa la
        //  View Transitions API; sin ella, o con "reducir movimiento"
        //  activado en el sistema, todo cambia como antes.
        // ============================================================
        const VT_DISPONIBLE = typeof document.startViewTransition === 'function';
        if (VT_DISPONIBLE) document.documentElement.classList.add('vt-on');
        let vtUltimoPuntero = null;
        document.addEventListener('pointerdown', e => { vtUltimoPuntero = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);

        function vtReducido() {
            return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        }

        function vtPunteroReciente() {
            return vtUltimoPuntero && Date.now() - vtUltimoPuntero.t < 1000 ? vtUltimoPuntero : null;
        }

        // Mientras dura una transición, el navegador pinta su "foto" por encima
        // de todo: un modal o el buscador abiertos en ese momento quedaban
        // debajo, tapados por las casillas del calendario. Por eso abrir
        // cualquier capa corta la transición en curso (vtCortar), salvo
        // cuando la propia capa es el cambio que se anima (showModalDesde).
        let vtActiva = null, vtEnCambio = false;

        function conTransicion(tipo, cambio) {
            if (!VT_DISPONIBLE || vtReducido()) { cambio(); return null; }
            const html = document.documentElement;
            html.dataset.vt = tipo;
            const t = document.startViewTransition(() => { vtEnCambio = true; try { cambio(); } finally { vtEnCambio = false; } });
            vtActiva = t;
            t.finished.finally(() => { if (vtActiva === t) vtActiva = null; if (html.dataset.vt === tipo) delete html.dataset.vt; });
            return t;
        }

        // Pantalla completa del navegador para una capa a toda la ventana
        // (modo focus del pomodoro y del repaso).
        function alternarPantallaCompleta(id) {
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            else document.getElementById(id)?.requestFullscreen?.().catch(() => {});
        }

        function vtCortar() {
            if (!vtActiva || vtEnCambio) return;
            try { vtActiva.skipTransition(); } catch (_) { /* ya había terminado */ }
            vtActiva = null;
        }

        // El orden de la barra lateral es el "mapa" de la app: bajar en
        // ella hace que el contenido nuevo entre desde abajo, y subir,
        // desde arriba.
        // Antes la tarjeta pulsada se convertía en el modal con una
        // transición de vista, pero el navegador fotografiaba la página
        // entera y la fundía: en escritorio parpadeaba al abrir y al cerrar.
        // El modal normal ya nace del punto pulsado, que da el mismo gesto.
        let vtFichaOrigen = null;

        function showModalDesde(selector, htmlContent) {
            showModal(htmlContent);
        }

        // Misma animación que el panel "filtro." de Eventos, para otros
        // paneles que nacen de un botón: sus elementos entran uno tras otro
        // (--i, con tope para que una lista larga no tarde en completarse).
        function escalonarDespliegue(contenedor, selector, tope = 12) {
            contenedor?.querySelectorAll(selector).forEach((el, i) => {
                el.style.setProperty('--i', Math.min(i, tope));
                el.classList.add('despliegue-item');
            });
        }

        // ============================================================
        //  DESPLEGABLES PROPIOS
        //  Cada <select class="modal-input"> se sustituye visualmente por un
        //  botón y un panel con la estética de "filtro." (también arregla
        //  que en iPhone el selector nativo no use Poppins). El <select>
        //  real sigue en el DOM, oculto, y es la fuente de verdad: el código
        //  que lee .value o escucha onchange no cambia. Un MutationObserver
        //  mejora los que aparezcan (modales, vistas repintadas).
        // ============================================================
        const SELECTOR_CHEVRON = '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M14 34l12-12 24 24 24-24 12 12-36 36z"/></svg>';
        let selectorAbierto = null;

        function mejorarSelect(sel) {
            if (sel.dataset.mejorado || sel.multiple || sel.size > 1) return;
            sel.dataset.mejorado = '1';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'modal-input selector-btn';
            btn.setAttribute('aria-haspopup', 'listbox');
            btn.style.cssText = sel.style.cssText;
            btn.innerHTML = `<span class="selector-valor"></span><span class="selector-chevron">${SELECTOR_CHEVRON}</span>`;
            const sync = () => {
                const o = sel.options[sel.selectedIndex];
                btn.querySelector('.selector-valor').textContent = o ? o.textContent.trim() : '';
                btn.disabled = sel.disabled;
            };
            sel._selectorSync = sync;
            sel.tabIndex = -1;
            sel.classList.add('selector-nativo');
            sel.after(btn);
            sync();
            sel.addEventListener('change', sync);
            btn.addEventListener('click', () => abrirSelector(sel, btn));
        }

        // Las etiquetas llevan un punto final por CSS ("título."); las que ya
        // acaban en signo de puntuación ("¿Qué tienes que hacer?",
        // "aportaciones:") se marcan para no añadírselo.
        function mejorarSelectsEn(raiz) {
            if (!raiz || raiz.nodeType !== 1) return;
            if (raiz.matches?.('select.modal-input')) mejorarSelect(raiz);
            raiz.querySelectorAll?.('select.modal-input:not([data-mejorado])').forEach(mejorarSelect);
            const etiquetas = raiz.matches?.('.modal-label') ? [raiz] : [...(raiz.querySelectorAll?.('.modal-label') || [])];
            etiquetas.forEach(l => { if (/[?:.!…]$/.test(l.textContent.trim())) l.classList.add('sin-punto'); });
            const titulos = raiz.matches?.('.modal-title') ? [raiz] : [...(raiz.querySelectorAll?.('.modal-title') || [])];
            titulos.forEach(puntoFinalTitulo);
            raiz.querySelectorAll?.('.modal-sheet :is(.btn-modal-primary, .btn-secondary)').forEach(vozDeBoton);
        }

        // Muchos modales antiguos dicen "Guardar" o "Añadir a la timeline"
        // con mayúscula y sin punto; se pasan a "guardar." al pintarse en vez
        // de reescribir decenas de textos. Solo botones de puro texto, y solo
        // si la segunda letra es minúscula (para no tocar siglas como "CSV").
        function vozDeBoton(b) {
            if (b.dataset.voz || b.children.length) return;
            b.dataset.voz = '1';
            const t = b.textContent.trim();
            if (!/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(t)) return;
            b.textContent = t.charAt(0).toLowerCase() + t.slice(1) + (/[?:.!…)»"]$/.test(t) ? '' : '.');
        }

        // Los títulos de los modales van en minúscula (CSS) y con punto final
        // como el resto de etiquetas de la app. El punto se añade al último
        // trozo de texto, no al final del elemento, porque muchos títulos
        // llevan dentro el botón de cerrar. Los que ya acaban en signo de
        // puntuación, o son el nombre de una entrada, se dejan como están.
        function puntoFinalTitulo(t) {
            if (t.dataset.punto || t.classList.contains('modal-title-contenido')) return;
            t.dataset.punto = '1';
            const recorrido = document.createTreeWalker(t, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest('button') ? NodeFilter.FILTER_REJECT : (n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
            let ultimo = null;
            while (recorrido.nextNode()) ultimo = recorrido.currentNode;
            if (!ultimo || /[?:.!…)»"]$/.test(ultimo.textContent.trim())) return;
            ultimo.textContent = ultimo.textContent.replace(/\s*$/, '.');
        }

        // Antes se recorría cada nodo añadido por separado (al abrir un modal o repintar el móvil, cientos): ahora
        // solo los elementos que no están ya dentro de otro de la misma tanda.
        new MutationObserver(cambios => {
            const raices = [];
            cambios.forEach(c => c.addedNodes.forEach(n => { if (n.nodeType === 1 && n.isConnected) raices.push(n); }));
            raices.filter(n => !raices.some(o => o !== n && o.contains(n))).forEach(mejorarSelectsEn);
        }).observe(document.body, { childList: true, subtree: true });

        function cerrarSelector() {
            if (!selectorAbierto) return;
            const { panel, btn } = selectorAbierto;
            selectorAbierto = null;
            btn.classList.remove('abierto');
            btn.setAttribute('aria-expanded', 'false');
            panel.classList.remove('abierto');
            setTimeout(() => panel.remove(), 180);
            document.removeEventListener('pointerdown', cerrarSelectorFuera, true);
            window.removeEventListener('scroll', cerrarSelectorAlDesplazar, true);
            window.removeEventListener('resize', cerrarSelector);
        }

        function cerrarSelectorFuera(e) {
            if (selectorAbierto && !selectorAbierto.panel.contains(e.target) && !selectorAbierto.btn.contains(e.target)) cerrarSelector();
        }

        function cerrarSelectorAlDesplazar(e) {
            if (selectorAbierto && !selectorAbierto.panel.contains(e.target)) cerrarSelector();
        }

        function abrirSelector(sel, btn) {
            if (selectorAbierto?.sel === sel) { cerrarSelector(); return; }
            cerrarSelector();
            sel._selectorSync?.();
            const panel = document.createElement('div');
            panel.className = 'selector-panel';
            panel.setAttribute('role', 'listbox');
            let i = 0;
            const opcion = o => `<button type="button" role="option" class="selector-opcion ${o.selected ? 'active' : ''}" data-indice="${o.index}" ${o.disabled ? 'disabled' : ''} style="--i:${Math.min(i++, 14)}">${escapeHtml(o.textContent.trim())}</button>`;
            panel.innerHTML = [...sel.children].map(el => el.tagName === 'OPTGROUP'
                ? `<div class="selector-grupo" style="--i:${Math.min(i++, 14)}">${escapeHtml((el.label || '').toLowerCase())}.</div>${[...el.children].map(opcion).join('')}`
                : opcion(el)).join('');
            document.body.appendChild(panel);

            const r = btn.getBoundingClientRect();
            const abajo = window.innerHeight - r.bottom - 12, arriba = r.top - 12;
            const haciaArriba = abajo < 220 && arriba > abajo;
            panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 200) - 8)) + 'px';
            panel.style.minWidth = Math.max(r.width, 200) + 'px';
            panel.style.maxHeight = Math.max(140, Math.min(340, haciaArriba ? arriba : abajo)) + 'px';
            if (haciaArriba) { panel.style.bottom = (window.innerHeight - r.top + 6) + 'px'; panel.classList.add('hacia-arriba'); }
            else panel.style.top = (r.bottom + 6) + 'px';

            panel.addEventListener('click', e => {
                const b = e.target.closest('.selector-opcion');
                if (!b || b.disabled) return;
                sel.selectedIndex = Number(b.dataset.indice);
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                cerrarSelector();
                btn.focus();
            });
            // Intro y Escape no deben llegar a los atajos globales (abrir el
            // buscador, cerrar el modal) mientras el panel está abierto.
            panel.addEventListener('keydown', e => {
                const opciones = [...panel.querySelectorAll('.selector-opcion:not([disabled])')];
                const actual = opciones.indexOf(document.activeElement);
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const sig = e.key === 'ArrowDown' ? Math.min(opciones.length - 1, actual + 1) : Math.max(0, actual - 1);
                    opciones[sig]?.focus();
                } else if (e.key === 'Escape') { e.preventDefault(); cerrarSelector(); btn.focus(); }
                else if (e.key === 'Tab') cerrarSelector();
                if (e.key === 'Enter' || e.key === 'Escape') e.stopPropagation();
            });

            selectorAbierto = { sel, btn, panel };
            btn.classList.add('abierto');
            btn.setAttribute('aria-expanded', 'true');
            requestAnimationFrame(() => {
                panel.classList.add('abierto');
                (panel.querySelector('.selector-opcion.active') || panel.querySelector('.selector-opcion:not([disabled])'))?.focus({ preventScroll: false });
            });
            document.addEventListener('pointerdown', cerrarSelectorFuera, true);
            window.addEventListener('scroll', cerrarSelectorAlDesplazar, true);
            window.addEventListener('resize', cerrarSelector);
        }

        function vtOrigenEnContenido() {
            const punto = vtPunteroReciente();
            const content = document.getElementById('content');
            const html = document.documentElement;
            if (!punto || !content) { html.style.removeProperty('--vt-ox'); html.style.removeProperty('--vt-oy'); return; }
            const r = content.getBoundingClientRect();
            html.style.setProperty('--vt-ox', Math.round(punto.x - r.left) + 'px');
            html.style.setProperty('--vt-oy', Math.round(punto.y - r.top) + 'px');
        }

        function vtDireccionSidebar(desde, hasta) {
            const orden = [...document.querySelectorAll('#sidebar-nav-top [data-view], #sidebar-nav-bottom [data-view]')].map(b => b.dataset.view);
            const a = orden.indexOf(desde), b = orden.indexOf(hasta);
            if (a < 0 || b < 0 || a === b) return 'fundido';
            return b > a ? 'abajo' : 'arriba';
        }

        function animateContentSwitch() {
            // Con View Transitions esta animación está apagada en el CSS: sin salir antes, se forzaba un layout para nada.
            if (VT_DISPONIBLE && !vtReducido()) return;
            const el = document.getElementById('content');
            if (!el) return;
            el.classList.remove('view-fade-in');
            void el.offsetWidth;
            el.classList.add('view-fade-in');
        }

        // "afterEnter" es un callback opcional para cuando switchView('finances')
        // va seguido de otra acción que necesita que la vista ya esté activa
        // (p. ej. abrir un modal encima) — con el aviso de privacidad de por
        // medio, ese "seguido de" deja de ser síncrono, así que se guarda
        // para lanzarlo en cuanto se responda la pregunta.
        // Menú «···» de una cosa (un enlace, un viaje...): `acciones` es [[texto, función], ...]; la que empieza por
        // «eliminar» va al final, separada y en rojo. Se cierra al elegir, al tocar fuera, con Escape o al hacer scroll.
        let menuAccionesAbierto = null;
        function abrirMenuAcciones(boton, acciones) {
            cerrarMenuAcciones();
            vtCortar();
            const menu = document.createElement('div');
            menu.className = 'menu-acciones';
            menu.setAttribute('role', 'menu');
            const normales = acciones.filter(a => !/^eliminar/.test(a[0])), peligro = acciones.filter(a => /^eliminar/.test(a[0]));
            const pintar = ([texto], i, clase) => `<button type="button" role="menuitem" class="${clase}" data-i="${i}">${escapeHtml(texto)}</button>`;
            menu.innerHTML = normales.map((a, i) => pintar(a, i, '')).join('') + (peligro.length ? '<hr>' + peligro.map((a, i) => pintar(a, normales.length + i, 'peligro')).join('') : '');
            const todas = [...normales, ...peligro];
            menu.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (!b) return; cerrarMenuAcciones(); todas[+b.dataset.i][1](); });
            menu.addEventListener('keydown', e => {
                const items = [...menu.querySelectorAll('button')], i = items.indexOf(document.activeElement);
                if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
                else if (e.key === 'Escape') { e.preventDefault(); cerrarMenuAcciones(); boton.focus(); }
            });
            document.body.appendChild(menu);
            const r = boton.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
            menu.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
            menu.style.top = (r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
            boton.setAttribute('aria-expanded', 'true');
            menuAccionesAbierto = { menu, boton };
            menu.querySelector('button')?.focus({ preventScroll: true });
            setTimeout(() => {
                document.addEventListener('pointerdown', cerrarMenuFuera, true);
                addEventListener('scroll', cerrarMenuAcciones, { capture: true, once: true });
            }, 0);
        }
        function cerrarMenuFuera(e) { if (menuAccionesAbierto && !menuAccionesAbierto.menu.contains(e.target)) cerrarMenuAcciones(); }
        function cerrarMenuAcciones() {
            if (!menuAccionesAbierto) return;
            menuAccionesAbierto.boton.setAttribute('aria-expanded', 'false');
            menuAccionesAbierto.menu.remove();
            menuAccionesAbierto = null;
            document.removeEventListener('pointerdown', cerrarMenuFuera, true);
        }

        function switchView(view, afterEnter) {
            // Al entrar en Finanzas (desde otra sección) se pregunta si
            // activar el modo privacidad (cifras ocultas) antes de mostrar
            // el panel — con Intro se responde "Sí" (botón enfocado de
            // salida) por ser la opción más prudente por defecto.
            if (view === 'finances' && currentView !== 'finances') {
                promptFinancePrivacyThenEnter(afterEnter);
                return;
            }
            trasCambioDeVista(performSwitchView(view), afterEnter);
        }

        // Con transición, el cambio de vista se aplica un fotograma después
        // (startViewTransition captura antes la pantalla vieja): lo que
        // dependa de la vista nueva tiene que esperar a que esté pintada.
        function trasCambioDeVista(transicion, fn) {
            if (typeof fn !== 'function') return;
            if (transicion) transicion.updateCallbackDone.then(fn, fn); else fn();
        }

        function promptFinancePrivacyThenEnter(afterEnter) {
            window._financePrivacyPromptCallback = afterEnter || null;
            showModal(`
                <div class="modal-title">Modo privacidad</div>
                <div class="finance-modal-note" style="margin:4px 0 18px">¿Quieres entrar a Finanzas con el modo privacidad activado (cifras ocultas)?</div>
                <button class="btn-modal-primary" id="finance-privacy-yes-btn" onclick="answerFinancePrivacyPrompt(true)">sí.</button>
                <button class="btn-secondary" style="margin-top:10px" onclick="answerFinancePrivacyPrompt(false)">no.</button>
            `);
            enfocarSiTeclado(() => document.getElementById('finance-privacy-yes-btn'));
        }

        function answerFinancePrivacyPrompt(wantsPrivacy) {
            blurFinances = wantsPrivacy;
            closeModal();
            const cb = window._financePrivacyPromptCallback;
            window._financePrivacyPromptCallback = null;
            trasCambioDeVista(performSwitchView('finances'), cb);
            saveData().catch(e => console.error(e));
        }

        // Fotografiar y animar una página densa entera multiplicaba su coste (Finanzas a Panorama, 480 ms frente a 123, CPU 4x):
        // en estas vistas, o en un dispositivo con poca memoria, solo funde el contenido.
        const VISTAS_PESADAS = new Set(['home', 'finances', 'profesorado']);
        function performSwitchView(view) {
            if (VISTAS_PESADAS.has(view) || VISTAS_PESADAS.has(currentView) || vistaPorCargar(view) || (navigator.deviceMemory || 8) <= 4) {
                aplicarSwitchView(view);
                if (!vtReducido()) document.getElementById('content')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' });
                return null;
            }
            return conTransicion(vtDireccionSidebar(currentView, view), () => aplicarSwitchView(view));
        }

        function aplicarSwitchView(view) {
            try {
                // Entrar en Finanzas desde otro apartado abre siempre su inicio, no la última pestaña que se dejó.
                if (view === 'finances' && currentView !== 'finances' && typeof financeTab !== 'undefined') financeTab = 'resumen';
                currentView = view;
                if (view === 'planner') plannerDayOffset = 0;

                document.querySelectorAll('.sidebar-nav button, #mobile-menu-panel .menu-nav button').forEach(b => {
                    b.classList.toggle('active', b.dataset.view === (ESTUDIOS_GRUPO.includes(view) ? 'studies' : view));
                });

                updatePageTitle();
                render();
                animateContentSwitch();

                const mobilePanel = document.getElementById('mobile-menu-panel');
                if (mobilePanel && mobilePanel.classList.contains('open')) {
                    toggleMobileMenu();
                }
            } catch (error) {
                console.error('Error cambiando de sección:', error);
                showToast('No se pudo abrir esta sección. Revisa la consola.', true);
            }
        }

        // ============================================================
        //  MOBILE MENU
        // ============================================================
        function toggleMobileMenu() {
            const overlay = document.getElementById('mobile-menu-overlay');
            const panel = document.getElementById('mobile-menu-panel');
            overlay.classList.toggle('open');
            panel.classList.toggle('open');
            if (panel.classList.contains('open')) panel.querySelectorAll('[data-view], .nav-label').forEach((el, i) => el.style.setProperty('--i', Math.min(i, 24)));
        }

        async function deleteInboxItem(id) {
            inbox = inbox.filter(i => i.id !== id);
            if (currentView === 'home') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }


        // ============================================================
        //  TAREAS SEMANALES
        // ============================================================
        function getWeeklyTasksWeekKey(date = new Date()) {
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);
            const day = d.getDay() || 7;
            d.setDate(d.getDate() - day + 1);
            return isoLocal(d);
        }

        function formatWeeklyTasksWeek() {
            const start = new Date(getWeeklyTasksWeekKey() + 'T12:00:00');
            const end = new Date(start);
            end.setDate(end.getDate() + 6);
            const fmt = d => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
            return `${fmt(start)} – ${fmt(end)}`;
        }

        function getCurrentWeeklyTasks() {
            const weekKey = getWeeklyTasksWeekKey();
            return (Array.isArray(weeklyTasks) ? weeklyTasks : []).filter(t => t && t.weekKey === weekKey && !t.completed);
        }

        function renderWeeklyTasksPanel() {
            const panel = document.getElementById('weekly-tasks-panel');
            if (!panel) return;
            const tasks = getCurrentWeeklyTasks();

            panel.innerHTML = `
                <div class="weekly-tasks-head">
                    <div>
                        <div class="weekly-tasks-title">Tareas semanales</div>
                        <div class="weekly-tasks-week">${formatWeeklyTasksWeek()}</div>
                    </div>
                    <button class="weekly-tasks-add" type="button" onclick="openWeeklyTaskModal()">+ Tarea</button>
                </div>
                <div class="weekly-tasks-list">
                    ${tasks.length ? tasks.map(t => `
                        <label class="weekly-task-row">
                            <input class="weekly-task-check" type="checkbox" onchange="completeWeeklyTask('${String(t.id).replace(/'/g, "\\'")}')" aria-label="Marcar como hecha">
                            <span class="weekly-task-text">${escapeHtml(t.title)}</span>
                        </label>
                    `).join('') : `
                        <div class="weekly-tasks-empty">
                            No tienes tareas pendientes esta semana.<br>
                            Pulsa <strong>+ Tarea</strong> para añadir una.
                        </div>
                    `}
                </div>`;
        }

        function toggleWeeklyTasks(force) {
            const panel = document.getElementById('weekly-tasks-panel');
            if (!panel) return;
            const shouldOpen = typeof force === 'boolean' ? force : !panel.classList.contains('open');
            panel.classList.toggle('open', shouldOpen);
            panel.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
            if (shouldOpen) renderWeeklyTasksPanel();
        }

        function openWeeklyTaskModal() {
            showModal(`
                <div class="modal-title">+ Tarea semanal</div>
                <div class="modal-label">¿Qué tienes que hacer?</div>
                <input id="weekly-task-input" class="modal-input" maxlength="140" placeholder="Ej: Comprar comida para la semana">
                <button class="btn-modal-primary" onclick="saveWeeklyTask()">añadir tarea.</button>
            `);
            enfocarSiTeclado(() => document.getElementById('weekly-task-input'));
        }

        async function saveWeeklyTask() {
            const input = document.getElementById('weekly-task-input');
            const title = input?.value.trim();
            if (!title) {
                showToast('Escribe una tarea', true);
                input?.focus();
                return;
            }

            weeklyTasks = Array.isArray(weeklyTasks) ? weeklyTasks : [];
            weeklyTasks.push({
                id: 'weekly_task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                title,
                weekKey: getWeeklyTasksWeekKey(),
                completed: false,
                createdAt: new Date().toISOString()
            });

            closeModal();
            renderWeeklyTasksPanel();
            toggleWeeklyTasks(true);
            try {
                await saveData();
                showToast('Tarea añadida');
            } catch (e) {
                console.error('Error guardando tarea semanal:', e);
                showToast('La tarea se añadió, pero no se pudo guardar en la nube.', true);
            }
        }

        async function completeWeeklyTask(taskId) {
            const task = (Array.isArray(weeklyTasks) ? weeklyTasks : []).find(t => t && t.id === taskId);
            if (!task || task.completed) return;

            const completedDate = todayISO();
            task.completed = true;
            task.completedAt = new Date().toISOString();

            // La tarea deja de estar pendiente y pasa a formar parte del
            // historial normal de Bitácora mediante una entrada de calendario.
            entries.push({
                id: 'weekly_task_done_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                type: 'event',
                title: 'Tarea hecha: ' + task.title,
                date: completedDate,
                notes: 'Tarea semanal completada',
                category: 'Tareas semanales',
                createdAt: new Date().toISOString(),
                calendarLog: true
            });

            filteredEntries = [...entries];
            renderWeeklyTasksPanel();
            if (currentView === 'calendar') render();

            try {
                await saveData();
                showToast('Tarea completada');
            } catch (e) {
                console.error('Error guardando tarea completada:', e);
                showToast('Se marcó como hecha, pero no se pudo guardar en la nube.', true);
            }
        }


        // Al cambiar de pestaña (lista/historial, hoy/mañana, libros/series...)
        // el contenido se cambiaba de golpe. Lo que queda debajo del grupo de
        // pestañas entra ahora desde el lado de la pestaña elegida, con la
        // misma animación que el cambio de día del móvil.
        const PESTANAS_ANIMADAS = '.culture-tabs, .profe-pestanas, .social-subtabs, .m-pestanas, .est-pestanas, .fin-pestanas';
        function animarCambioPestana(e) {
            const boton = e.target.closest?.('button');
            const grupo = boton?.closest(PESTANAS_ANIMADAS);
            if (!grupo || boton.matches('.active, .activa, .activo') || vtReducido()) return;
            const botones = [...grupo.querySelectorAll('button')];
            const nueva = botones.indexOf(boton), actual = botones.findIndex(b => b.matches('.active, .activa, .activo'));
            const dx = actual >= 0 && nueva < actual ? '-18px' : '18px';
            const clase = [...grupo.classList].find(c => PESTANAS_ANIMADAS.split(', ').includes('.' + c));
            const animar = () => document.querySelectorAll('.' + clase).forEach(g => {
                if (!g.offsetParent) return;
                // Lo de debajo: los hermanos siguientes que no son botones de la
                // misma barra (en Ocio, las pestañas van con botones al lado).
                let base = g, debajo = [];
                for (let i = 0; i < 3 && base; i++) {
                    debajo = [];
                    for (let x = base.nextElementSibling; x; x = x.nextElementSibling) if (!x.matches('button, .btn-secondary')) debajo.push(x);
                    if (debajo.length) break;
                    base = base.parentElement;
                }
                debajo.forEach(x => {
                    x.style.setProperty('--m-dx', dx);
                    x.classList.remove('m-cambia-dia');
                    void x.offsetWidth;
                    x.classList.add('m-cambia-dia');
                    const fin = ev => { if (ev.target !== x) return; x.classList.remove('m-cambia-dia'); x.removeEventListener('animationend', fin); };
                    x.addEventListener('animationend', fin);
                });
            });
            // Algunas pestañas repintan al momento y otras un poco después: se
            // anima en cuanto cambia la página (o al siguiente fotograma si no cambia).
            let hecho = false;
            const una = () => { if (hecho) return; hecho = true; obs.disconnect(); requestAnimationFrame(animar); };
            const obs = new MutationObserver(una);
            obs.observe(document.body, { childList: true, subtree: true });
            setTimeout(una, 450);
        }
        document.addEventListener('click', animarCambioPestana, true);
