        // ============================================================
        //  RENDER: SETTINGS
        // ============================================================
        function tagMapFromEntries() {
            const tagMap = {};
            entries.forEach(e => (e.tags || []).forEach(t => {
                if (!tagMap[t]) tagMap[t] = [];
                tagMap[t].push(e);
            }));
            return tagMap;
        }

        function renderTagsCloudList() {
            const tagMap = tagMapFromEntries();
            const tagList = Object.keys(tagMap);
            const q = (window._tagFilter || '').trim().toLowerCase();
            const filteredMap = {};
            tagList.forEach(t => { if (!q || t.toLowerCase().includes(q)) filteredMap[t] = tagMap[t]; });
            if (!Object.keys(filteredMap).length) return `<div class="finance-empty-line">Sin etiquetas que coincidan con "${escapeHtml(window._tagFilter || '')}"</div>`;
            const tree = buildTagTree(filteredMap);
            const roots = Object.values(tree).map(n => ({ n, items: entriesForTagPrefix(n.path) })).sort((a, b) => b.items.length - a.items.length || a.n.name.localeCompare(b.n.name));
            const max = Math.max(...roots.map(r => r.items.length));
            return `<div class="etiquetas-rejilla">${roots.map(({ n, items }) => {
                const pathEsc = escapeHtml(n.path).replace(/'/g, "\\'");
                const hijos = Object.values(n.children).sort((a, b) => a.name.localeCompare(b.name));
                return `
                <div class="etiqueta-tarjeta" onclick="window._selectedTag='${pathEsc}';render()">
                    <div class="etiqueta-tarjeta-top"><span class="etiqueta-tarjeta-nombre">#${escapeHtml(n.name)}</span><span class="etiqueta-tarjeta-n">${items.length}</span></div>
                    <div class="etiqueta-tarjeta-barra"><span style="width:${Math.max(6, items.length / max * 100)}%"></span></div>
                    <div class="etiqueta-tarjeta-tipos">${desgloseTipos(items)}</div>
                    ${hijos.length ? `<div class="etiqueta-tarjeta-hijos">${hijos.map(h => `<button onclick="event.stopPropagation();window._selectedTag='${escapeHtml(h.path).replace(/'/g, "\\'")}';render()">/${escapeHtml(h.name)}</button>`).join('')}</div>` : ''}
                </div>`;
            }).join('')}</div>`;
        }

        function filterTagsView(value) {
            window._tagFilter = value;
            const list = document.getElementById('tags-cloud-list');
            if (list) list.innerHTML = renderTagsCloudList();
        }

        async function renameTag(oldTag) {
            const next = prompt('Nuevo nombre para la etiqueta', oldTag);
            if (next === null) return;
            const clean = next.trim();
            if (!clean || clean === oldTag) return;
            entries.forEach(e => {
                if (Array.isArray(e.tags) && e.tags.includes(oldTag)) {
                    e.tags = [...new Set(e.tags.map(t => t === oldTag ? clean : t))];
                }
            });
            window._selectedTag = clean;
            render();
            try { await saveData(); showToast('Etiqueta renombrada'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteTagEverywhere(tag) {
            const count = entries.filter(e => (e.tags || []).includes(tag)).length;
            if (!confirm(`¿Eliminar la etiqueta #${tag} de ${count} entrada${count === 1 ? '' : 's'}? Las entradas no se borran, solo la etiqueta.`)) return;
            entries.forEach(e => { if (Array.isArray(e.tags)) e.tags = e.tags.filter(t => t !== tag); });
            window._selectedTag = null;
            render();
            try { await saveData(); showToast('Etiqueta eliminada'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function buildTagTree(tagMap) {
            const root = {};
            Object.keys(tagMap).forEach(tag => {
                const parts = tag.split('/').map(p => p.trim()).filter(Boolean);
                if (!parts.length) return;
                let node = root;
                let path = '';
                parts.forEach((part, i) => {
                    path = path ? path + '/' + part : part;
                    if (!node[part]) node[part] = { name: part, path, children: {}, count: 0 };
                    if (i === parts.length - 1) node[part].count += tagMap[tag].length;
                    node = node[part].children;
                });
            });
            return root;
        }

        function entriesForTagPrefix(prefix) {
            return entries.filter(e => (e.tags || []).some(t => t === prefix || String(t).startsWith(prefix + '/')));
        }

        const TIPO_PLURAL = { book: 'libros', movie: 'películas', series: 'series', game: 'videojuegos', travel: 'viajes', work: 'empleos', project: 'proyectos', event: 'eventos', place: 'lugares', document: 'documentos', goal: 'objetivos', birthday: 'cumpleaños', subscription: 'suscripciones', fixed_expense: 'gastos fijos' };

        function desgloseTipos(lista) {
            const n = {};
            lista.forEach(e => { n[e.type] = (n[e.type] || 0) + 1; });
            return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${c} ${c === 1 ? (TYPE_LABELS[t] || t).toLowerCase() : (TIPO_PLURAL[t] || t)}`).join(' · ');
        }

        function renderTagsView() {
            const tagMap = tagMapFromEntries();
            const tagList = Object.keys(tagMap);

            if (!tagList.length) {
                return `<div class="etiquetas-vista">
                    <div class="etiquetas-titulo">etiquetas.</div>
                    <div class="etiquetas-vacio">Todavía no has etiquetado nada. Al crear o editar cualquier entrada (un libro, un viaje, un evento...) escribe etiquetas en su campo "Etiquetas" y aquí podrás ver juntas todas las que comparten una.</div>
                </div>`;
            }

            if (window._selectedTag) {
                const tag = window._selectedTag;
                const items = entriesForTagPrefix(tag);
                const tagEsc = escapeHtml(tag).replace(/'/g, "\\'");
                const porTipo = {};
                items.forEach(e => { (porTipo[e.type] = porTipo[e.type] || []).push(e); });
                const hayConexion = typeof construirConexiones === 'function' && items.length > 0;
                return `
                <div class="etiquetas-vista">
                    <button class="etiquetas-volver" onclick="window._selectedTag=null;render()">← etiquetas.</button>
                    <div class="etiqueta-cabecera">
                        <div>
                            <div class="etiqueta-nombre">#${escapeHtml(tag)}</div>
                            <div class="etiquetas-sub">${items.length} ${items.length === 1 ? 'entrada' : 'entradas'} · ${desgloseTipos(items)}</div>
                        </div>
                        <div class="etiqueta-acciones">
                            ${hayConexion ? `<button class="finance-oneoff-btn" onclick="conexionSeleccionada='etiqueta:${tagEsc}';conexionAnimar=true;switchView('graph')">ver conexiones.</button>` : ''}
                            <button class="finance-oneoff-btn" onclick="renameTag('${tagEsc}')">renombrar.</button>
                            <button class="finance-oneoff-btn etiqueta-borrar" onclick="deleteTagEverywhere('${tagEsc}')">eliminar.</button>
                        </div>
                    </div>
                    ${Object.entries(porTipo).map(([tipo, lista]) => `
                        <div class="etiqueta-grupo-titulo">${TIPO_PLURAL[tipo] || tipo}. <span>${lista.length}</span></div>
                        <div class="etiqueta-lista">${lista.map(e => `
                            <div class="etiqueta-fila" data-open-entry="${e.id}">
                                <span class="etiqueta-fila-titulo">${escapeHtml(e.title || '')}</span>
                                ${(e.tags || []).filter(t => t !== tag).length ? `<span class="etiqueta-fila-otras">${(e.tags || []).filter(t => t !== tag).slice(0, 3).map(t => '#' + escapeHtml(t)).join(' ')}</span>` : ''}
                                <button class="etiqueta-quitar" title="Quitar #${escapeHtml(tag)} de esta entrada" onclick="event.stopPropagation();quitarEtiquetaDeEntrada('${e.id}','${tagEsc}')">×</button>
                            </div>`).join('')}
                        </div>`).join('')}
                </div>`;
            }

            const etiquetadas = new Set(Object.values(tagMap).flat().map(e => e.id)).size;
            return `
            <div class="etiquetas-vista">
                <div class="etiquetas-cabecera">
                    <div>
                        <div class="etiquetas-titulo">etiquetas.</div>
                        <div class="etiquetas-sub">${tagList.length} ${tagList.length === 1 ? 'etiqueta' : 'etiquetas'} en ${etiquetadas} ${etiquetadas === 1 ? 'entrada' : 'entradas'}. Usa padre/hijo (p. ej. "viaje/japón") para agruparlas.</div>
                    </div>
                    <input class="modal-input etiquetas-buscar" placeholder="buscar etiqueta..." value="${escapeHtml(window._tagFilter || '')}" oninput="filterTagsView(this.value)">
                </div>
                <div id="tags-cloud-list">${renderTagsCloudList()}</div>
            </div>`;
        }

        async function quitarEtiquetaDeEntrada(id, tag) {
            const e = entries.find(x => x.id === id);
            if (!e) return;
            e.tags = (e.tags || []).filter(t => t !== tag);
            filteredEntries = [...entries];
            if (!entriesForTagPrefix(tag).length) window._selectedTag = null;
            render();
            showToast(`#${tag} quitada`);
            try { await saveData(); } catch (err) { console.error(err); showToast('No se pudo guardar en la nube', true); }
        }

        // ============================================================
        //  SUGERENCIAS
        // ============================================================
        function renderSuggestions() {
            return `
                <div style="max-width:600px">
                    <div class="chart-container" style="margin-bottom:16px">
                        <div class="chart-title">Sugerencias</div>
                        <div style="font-size:12px;color:var(--text-secondary);margin:8px 0 14px">¿Hay algo que eches en falta, o que cambiarías? Cuéntamelo — lo leo yo directamente.</div>
                        <textarea id="suggestion-text" class="modal-input" rows="4" placeholder="Escribe tu sugerencia..."></textarea>
                        <button class="btn-modal-primary" style="width:auto" onclick="submitSuggestion()">Enviar sugerencia</button>
                    </div>
                    <div class="chart-container" id="my-suggestions-section" style="display:none">
                        <div class="chart-title">Tus sugerencias anteriores</div>
                        <div id="my-suggestions-list" style="margin-top:8px"></div>
                    </div>
                </div>`;
        }

        async function submitSuggestion() {
            const textarea = document.getElementById('suggestion-text');
            const texto = textarea?.value.trim();
            if (!texto) { showToast('Escribe algo antes de enviar', true); return; }
            try {
                const { data: { user } } = await sb.auth.getUser();
                const { error } = await sb.from('sugerencias').insert({ user_id: user.id, texto });
                if (error) throw error;
                textarea.value = '';
                showToast('Sugerencia enviada, ¡gracias!');
                loadMySuggestions();
            } catch (e) {
                console.error('Error enviando sugerencia:', e);
                showToast('No se pudo enviar la sugerencia', true);
            }
        }

        async function loadMySuggestions() {
            const section = document.getElementById('my-suggestions-section');
            const list = document.getElementById('my-suggestions-list');
            if (!section || !list) return;
            const { data: { user } } = await sb.auth.getUser();
            const { data } = await sb.from('sugerencias').select('*').eq('user_id', user.id).order('creado_en', { ascending: false });
            if (!data || !data.length) { section.style.display = 'none'; return; }
            section.style.display = '';
            list.innerHTML = data.map(s => `
                <div style="padding:9px 0;border-bottom:1px solid var(--border)">
                    <div style="font-size:12.5px;color:var(--text-primary);white-space:pre-line">${escapeHtml(s.texto)}</div>
                    <div style="font-size:10.5px;color:var(--text-secondary);margin-top:4px">${new Date(s.creado_en).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                </div>
            `).join('');
        }

        // ============================================================
        //  NOTIFICACIONES PUSH
        //  Web Push estándar (funciona en PWA — iOS 16.4+, Android, escritorio
        //  — y dentro de la app nativa, porque ambas cargan esta misma web).
        //  La clave pública VAPID es pública por diseño, no es un secreto.
        //  El envío real lo hace la función de Supabase "send-push" con la
        //  clave privada correspondiente guardada como secreto.
        // ============================================================
        const BITACORA_VAPID_PUBLIC_KEY = 'BG0bTxTamqFW-3hdbkN5gGFV52wc9iA8Nuig-pMwXQmWG1ErG-kdwO44qXm0XWCSEyZ4qJma50aVTK_EN-Hs62c';

        function urlBase64ToUint8Array(base64String) {
            const padding = '='.repeat((4 - base64String.length % 4) % 4);
            const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
            const rawData = atob(base64);
            const output = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
            return output;
        }

        // serviceWorker.ready no termina nunca si el service worker no llegó
        // a registrarse (Ajustes se quedaba en "Cargando..." para siempre):
        // se espera un poco, se intenta registrar aquí mismo y, si tampoco,
        // se da por no disponible en vez de esperar indefinidamente.
        async function serviceWorkerListo() {
            const esperar = ms => Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), ms))]);
            let reg = await esperar(4000);
            if (reg) return reg;
            try { await navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' }); } catch (e) { console.error(e); return null; }
            return esperar(6000);
        }

        async function pushNotificationsStatus() {
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
            if (typeof Notification === 'undefined') return 'unsupported';
            if (Notification.permission === 'denied') return 'denied';
            try {
                const reg = await serviceWorkerListo();
                if (!reg) return 'sin-sw';
                const sub = await reg.pushManager.getSubscription();
                return sub ? 'enabled' : 'disabled';
            } catch (e) { return 'unsupported'; }
        }

        async function enablePushNotifications(permisoPedido) {
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
                showToast('Este navegador no soporta notificaciones push', true);
                return false;
            }
            try {
                const permission = await (permisoPedido || Notification.requestPermission());
                if (permission !== 'granted') {
                    showToast(permission === 'denied' ? 'Permiso denegado: actívalo en Ajustes del iPhone → Notificaciones → Bitácora' : 'No se han activado las notificaciones', true);
                    return false;
                }
                const reg = await serviceWorkerListo();
                if (!reg) { showToast('No se pudo preparar el servicio de notificaciones', true); return false; }
                let sub = await reg.pushManager.getSubscription();
                if (!sub) {
                    sub = await reg.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(BITACORA_VAPID_PUBLIC_KEY)
                    });
                }
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return false;
                const { error } = await sb.from('push_subscriptions').upsert({
                    user_id: user.id,
                    endpoint: sub.endpoint,
                    subscription: sub.toJSON(),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'endpoint' });
                if (error) throw error;
                showToast('Notificaciones activadas');
                return true;
            } catch (e) {
                console.error('enablePushNotifications', e);
                showToast('No se pudieron activar las notificaciones', true);
                return false;
            }
        }

        async function disablePushNotifications() {
            try {
                const reg = await serviceWorkerListo();
                if (!reg) return false;
                const sub = await reg.pushManager.getSubscription();
                if (sub) {
                    try { await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); } catch (e) { console.error(e); }
                    await sub.unsubscribe();
                }
                showToast('Notificaciones desactivadas');
            } catch (e) {
                console.error('disablePushNotifications', e);
                showToast('No se pudieron desactivar', true);
            }
        }

        // iOS solo enseña el aviso de permiso si se pide dentro del propio
        // toque: antes se consultaba primero el estado (asíncrono, espera al
        // service worker) y cuando llegaba la petición iOS ya no la daba por
        // parte del gesto y la rechazaba sin preguntar ("No se han activado
        // las notificaciones"). Se decide con el estado ya pintado y el
        // permiso se pide lo primero, sin nada que esperar delante.
        let pushEstadoActual = null;
        function togglePushNotifications() {
            if (pushEstadoActual === 'enabled') {
                disablePushNotifications().then(loadSettingsPushInfo);
                return;
            }
            const permiso = typeof Notification !== 'undefined' ? Notification.requestPermission() : Promise.resolve('denied');
            enablePushNotifications(permiso).then(loadSettingsPushInfo);
        }

        // Tipos de la función avisos-diarios, en el mismo orden de
        // importancia con el que se envían (como mucho 3 al día).
        const AVISOS_AUTOMATICOS = [
            { tipo: 'eventos', titulo: 'eventos.', texto: 'Una hora antes de cada evento con hora. Para silenciar uno concreto, ábrelo y pulsa "silenciar.".' },
            { tipo: 'aportaciones', titulo: 'cargos vigilados.', texto: 'Una suscripción o gasto fijo con "avisarme si no aparece en el banco" que no ha llegado 3 días después de su día de cargo.' },
            { tipo: 'estudios', titulo: 'exámenes y entregas.', texto: 'Los exámenes y entregas de hoy, y los exámenes de mañana.' },
            { tipo: 'documentos', titulo: 'documentos que caducan.', texto: 'Fichas de Documentos a 30 días, 7 días, un día y el mismo día de su caducidad.' },
            { tipo: 'reembolsos', titulo: 'reembolsos atascados.', texto: 'Un ingreso que lleva más de 7 días pendiente en el banco.' },
            { tipo: 'cumpleanos', titulo: 'cumpleaños.', texto: 'Los cumpleaños de hoy y de mañana.' },
            { tipo: 'ritmo', titulo: 'ritmo de gasto.', texto: 'Cuando el gasto del día a día va bastante por encima de lo normal en ti. Como mucho dos veces al mes.' },
            { tipo: 'bandeja', titulo: 'bandeja.', texto: 'Cambios de Claude que llevan más de un día esperando tu validación.' },
        ];

        function renderAvisosAutomaticosLista() {
            return AVISOS_AUTOMATICOS.map(a => {
                const on = preferenciasAvisos[a.tipo] !== false;
                return `
                <div class="avisos-tipo">
                    <div class="avisos-tipo-texto">
                        <div class="avisos-tipo-titulo">${a.titulo}</div>
                        <div class="avisos-tipo-desc">${a.texto}</div>
                    </div>
                    <button class="finance-pro-switch ${on ? 'on' : ''}" onclick="toggleAvisoAutomatico('${a.tipo}')" aria-label="${a.titulo}" title="${on ? 'Desactivar' : 'Activar'}">
                        <span class="finance-pro-switch-knob"></span>
                    </button>
                </div>`;
            }).join('');
        }

        function openAvisosAutomaticos() {
            showModal(`
                <div class="modal-title">avisos automáticos.</div>
                <div class="finance-modal-note" style="margin-bottom:10px">Una hora antes de cada evento con hora y, cada mañana a las 9:00, lo que toca ese día: como mucho 3 avisos del día y nunca dos veces lo mismo. Elige qué quieres recibir.</div>
                <div id="avisos-automaticos-lista">${renderAvisosAutomaticosLista()}</div>
            `);
        }

        async function toggleAvisoAutomatico(tipo) {
            if (preferenciasAvisos[tipo] === false) delete preferenciasAvisos[tipo];
            else preferenciasAvisos[tipo] = false;
            const lista = document.getElementById('avisos-automaticos-lista');
            if (lista) lista.innerHTML = renderAvisosAutomaticosLista();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
            loadSettingsPushInfo();
        }

        function renderPushSettingsBody(status) {
            if (status === 'unsupported') {
                const iosSinInstalar = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches && !navigator.standalone;
                return `<div style="font-size:12.5px;color:var(--text-secondary)">${iosSinInstalar ? 'En el iPhone, las notificaciones solo funcionan con Bitácora añadida a la pantalla de inicio: Compartir → «Añadir a pantalla de inicio», y ábrela desde ese icono.' : 'Este navegador no soporta notificaciones push.'}</div>`;
            }
            if (status === 'denied') {
                const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
                return `<div style="font-size:12.5px;color:var(--text-secondary)">${ios ? 'Bloqueadas en el iPhone: ve a Ajustes del iPhone → Notificaciones → Bitácora y activa «Permitir notificaciones». Después vuelve aquí.' : 'Bloqueadas desde los ajustes del navegador/sistema — actívalas ahí para poder usarlas aquí.'}</div>`;
            }
            if (status === 'sin-sw') {
                return `<div style="font-size:12.5px;color:var(--text-secondary)">No se ha podido preparar el servicio de notificaciones. Cierra Bitácora del todo y vuelve a abrirla desde el icono de inicio.</div>`;
            }
            if (status === 'cargando') {
                return `<div style="font-size:12.5px;color:var(--text-secondary)">Cargando...</div>`;
            }
            const enabled = status === 'enabled';
            const apagados = AVISOS_AUTOMATICOS.filter(a => preferenciasAvisos[a.tipo] === false).length;
            return `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
                    <div style="font-size:12.5px;color:var(--text-secondary)">${enabled ? 'Activadas en este dispositivo.' : 'Recibe avisos de Bitácora en este dispositivo.'}</div>
                    <button class="finance-pro-switch ${enabled ? 'on' : ''}" onclick="togglePushNotifications()" title="${enabled ? 'Desactivar' : 'Activar'} notificaciones" aria-label="Notificaciones">
                        <span class="finance-pro-switch-knob"></span>
                    </button>
                </div>
                ${enabled ? `
                <div class="avisos-ajustes-fila">
                    <div>
                        <div class="avisos-ajustes-titulo">avisos automáticos.</div>
                        <div class="avisos-ajustes-sub">Antes de tus eventos y cada día a las 9:00. ${apagados ? `${AVISOS_AUTOMATICOS.length - apagados} de ${AVISOS_AUTOMATICOS.length} tipos activados.` : 'Todos los tipos activados.'}</div>
                    </div>
                    <button class="finance-oneoff-btn" onclick="openAvisosAutomaticos()">elegir.</button>
                </div>` : ''}`;
        }

        // En la PWA, Ajustes se pinta dos veces: en #content (escritorio,
        // oculto) y en el carrusel móvil, con los mismos ids. getElementById
        // devolvía el oculto y en el móvil "Notificaciones", "Suscripción" y
        // "Claude y ChatGPT" se quedaban en "Cargando..." sin interruptor.
        function cuerpoAjustes(id) {
            const todos = [...document.querySelectorAll(`[id="${id}"]`)];
            if (mobileStandaloneActive && !mobileExitedToDesktop) {
                const movil = todos.find(el => el.closest('#mobile-shell'));
                if (movil) return movil;
            }
            return todos.find(el => el.offsetParent !== null) || todos[0] || null;
        }

        async function loadSettingsPushInfo() {
            const body = cuerpoAjustes('settings-push-body');
            if (!body) return;
            const status = await pushNotificationsStatus();
            pushEstadoActual = status;
            body.innerHTML = renderPushSettingsBody(status);
        }

        // Iconos sólidos de cada bloque de Ajustes (familia TARJETA BITACORA).
        const AJUSTES_ICONOS = {
            suscripcion: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M50 8a42 42 0 1 1 0 84 42 42 0 0 1 0-84zm0 20a22 22 0 1 0 0 44 22 22 0 0 0 0-44z"/></svg>',
            datos: '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M30 8l24 26H38v28H22V34H6zM70 92L46 66h16V38h16v28h16z"/></svg>',
            conector: '<svg viewBox="0 0 100 100" fill="currentColor"><circle cx="24" cy="50" r="18"/><circle cx="76" cy="50" r="18"/><rect x="30" y="44" width="40" height="12" rx="6"/></svg>',
            avisos: '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M50 6a8 8 0 0 1 8 8v3a28 28 0 0 1 20 27v20l10 12v6H12v-6l10-12V44a28 28 0 0 1 20-27v-3a8 8 0 0 1 8-8zM38 86h24a12 12 0 0 1-24 0z"/></svg>',
            apariencia: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M50 6a44 44 0 1 1 0 88 44 44 0 0 1 0-88zm0 12v64a32 32 0 0 0 0-64z"/></svg>',
            bitacora: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M50 6a44 44 0 1 1 0 88 44 44 0 0 1 0-88zM44 42v32h12V42zm6-20a8 8 0 1 0 0 16 8 8 0 0 0 0-16z"/></svg>',
            prompts: '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M10 22l34 28-34 28V62l15-12-15-12zM50 70h40v12H50z"/></svg>',
            avanzado: '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M34 14L6 50l28 36 10-8-22-28 22-28zm32 0l-10 8 22 28-22 28 10 8 28-36z"/></svg>',
            riesgo: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M50 6l46 84H4zM44 36v28h12V36zm6 34a7 7 0 1 0 0 14 7 7 0 0 0 0-14z"/></svg>',
            apartados: '<svg viewBox="0 0 100 100" fill="currentColor"><rect x="8" y="8" width="38" height="38" rx="10"/><rect x="54" y="8" width="38" height="38" rx="19"/><rect x="8" y="54" width="38" height="38" rx="19"/><rect x="54" y="54" width="38" height="38" rx="10"/></svg>',
            guia: '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M8 18c14-6 28-6 38 2v66c-10-8-24-8-38-2zm84 0c-14-6-28-6-38 2v66c10-8 24-8 38-2z"/></svg>',
        };

        function renderAjustesApartados() {
            const { perfil, opcionales } = configApartados();
            return `
                <div class="ajuste-subtitulo">perfil.</div>
                <div class="ajustes-perfiles">
                    ${PERFILES.map(p => `
                        <button class="ajustes-perfil ${p.id === perfil ? 'activo' : ''}" onclick="elegirPerfil('${p.id}')">
                            <b>${p.titulo}</b><span>${p.texto}</span>
                        </button>`).join('')}
                </div>
                <div class="ajuste-subtitulo">apartados opcionales.</div>
                ${APARTADOS_OPCIONALES.map(o => `
                    <div class="ajustes-opcional">
                        <div><b>${o.titulo}</b><span>${o.texto}</span></div>
                        <button class="finance-pro-switch ${opcionales[o.view] ? 'on' : ''}" onclick="alternarOpcional('${o.view}')" aria-label="${o.titulo}"><span class="finance-pro-switch-knob"></span></button>
                    </div>`).join('')}`;
        }

        function bloqueAjuste(id, icono, titulo, texto, cuerpo, clase = '') {
            return `
                <section class="ajuste ${clase}" ${id ? `id="${id}"` : ''}>
                    <div class="ajuste-cab">
                        <span class="ajuste-icono">${AJUSTES_ICONOS[icono]}</span>
                        <div><div class="ajuste-titulo">${titulo}</div>${texto ? `<div class="ajuste-texto">${texto}</div>` : ''}</div>
                    </div>
                    <div class="ajuste-cuerpo">${cuerpo}</div>
                </section>`;
        }

        function renderSettings() {
            const nombre = (nombrePublico || userName || '').trim();
            return `
                <div class="ajustes-vista">
                    <div class="ajustes-cabecera">
                        <div class="ajustes-titulo">ajustes.</div>
                        <div class="ajustes-sub">${nombre ? `${escapeHtml(nombre)}, aquí` : 'Aquí'} decides cómo es y cómo se comporta tu Bitácora.</div>
                    </div>

                    ${typeof openGuia === 'function' ? `
                    <button class="ajustes-guia" onclick="openGuia()">
                        <span class="ajuste-icono">${AJUSTES_ICONOS.guia}</span>
                        <span><b>guía de bitácora.</b><small>Cada apartado y cada botón, explicado.</small></span>
                        <span class="ajustes-guia-flecha" aria-hidden="true">→</span>
                    </button>` : ''}

                    <div class="ajustes-grupo">cuenta.</div>
                    <div class="ajustes-rejilla">
                        ${bloqueAjuste('settings-subscription-section', 'suscripcion', 'suscripción.', 'Tu plan y su renovación.', `<div id="settings-subscription-body" class="ajuste-cargando">Cargando...</div>`)}
                        ${bloqueAjuste('settings-account-section', 'datos', 'tus datos.', 'Todo lo que hay en Bitácora (entradas, notas, finanzas...) en un archivo JSON: para guardarlo aparte o traerlo de vuelta.', `
                            <div class="ajuste-botones">
                                <button class="btn-secondary" style="width:auto" onclick="exportData()">exportar.</button>
                                <button class="btn-secondary" style="width:auto" onclick="document.getElementById('import-input').click()">importar.</button>
                            </div>`)}
                    </div>

                    <div class="ajustes-grupo">apartados.</div>
                    ${bloqueAjuste('settings-apartados-section', 'apartados', 'qué quieres ver.', 'Bitácora se adapta a ti: elige tu perfil y activa solo los apartados que vayas a usar. Lo que desactives desaparece de los menús, pero sus datos se quedan guardados.', renderAjustesApartados(), 'ajuste-ancho')}

                    <div class="ajustes-grupo">conexiones.</div>
                    <div class="ajustes-rejilla">
                        ${bloqueAjuste('settings-conector-section', 'conector', 'claude y chatgpt.', '', `<div id="settings-conector-body" class="ajuste-cargando">Cargando...</div>`)}
                        ${bloqueAjuste('settings-push-section', 'avisos', 'notificaciones.', 'Avisos en este dispositivo: el resumen de la mañana y una hora antes de cada evento.', `<div id="settings-push-body">${renderPushSettingsBody('cargando')}</div>`)}
                    </div>

                    <div class="ajustes-grupo">apariencia.</div>
                    ${bloqueAjuste('settings-appearance-section', 'apariencia', 'tema y letra.', 'Se guarda en este dispositivo.', `
                        <div class="ajuste-subtitulo">tema.</div>
                        ${renderSelectorTema()}
                        <div class="ajuste-subtitulo">tipografía.</div>
                        <div id="font-options-container">${renderFontOptionsList()}</div>
                        <div class="ajuste-subtitulo">ancho.</div>
                        <button class="btn-secondary" style="width:auto" onclick="toggleMode()">alternar modo ancho.</button>`, 'ajuste-ancho')}

                    <div class="ajustes-grupo">más.</div>
                    <div class="ajustes-rejilla">
                        ${bloqueAjuste('', 'bitacora', 'qué es bitácora.', 'La idea detrás de la app y, si lo abres desde el navegador, instalarla como app.', `
                            <div class="ajuste-botones">
                                <button class="btn-secondary" style="width:auto" onclick="openAboutBitacora()">qué es, a fondo.</button>
                                <button class="btn-secondary" id="pwa-install-btn" style="width:auto;display:none" onclick="handlePwaInstallClick()">instalar bitácora.</button>
                            </div>`)}
                        ${bloqueAjuste('settings-prompts-section', 'prompts', 'prompts guardados.', 'Textos que usas a menudo con una IA, a mano para copiarlos.', `
                            <button class="btn-secondary" style="width:auto;margin-bottom:10px" onclick="openNewPrompt()">+ prompt.</button>
                            <div class="prompts-list">
                                ${prompts.length ? prompts.map(p => `
                                    <div class="prompt-card" onclick="openPromptDetail('${p.id}')">
                                        <span class="prompt-icon">&gt;</span>
                                        <span class="prompt-title">${escapeHtml(p.title)}</span>
                                    </div>`).join('') : '<div class="ajuste-texto">Sin prompts guardados.</div>'}
                            </div>`)}
                        ${bloqueAjuste('settings-advanced-section', 'avanzado', 'modo desarrollador.', 'Enseña funciones ocultas, como Vault.', `
                            <button class="finance-pro-switch ${devModeActive ? 'on' : ''}" onclick="toggleDeveloperMode()" aria-label="Modo desarrollador"><span class="finance-pro-switch-knob"></span></button>`)}
                        ${bloqueAjuste('settings-danger-section', 'riesgo', 'zona de riesgo.', 'Cierra tu sesión en todos los navegadores y dispositivos donde la hayas iniciado.', `
                            <button class="btn-secondary ajuste-peligro" style="width:auto" onclick="handleLogoutAllDevices()">cerrar sesión en todas partes.</button>`, 'ajuste-riesgo')}
                    </div>
                </div>`;
        }

        // Rellena la sección "Suscripción" de Ajustes aparte, porque
        // necesita una consulta a Supabase (renderSettings() es síncrono,
        // igual que ya hacen loadDocuments()/loadFriendsViewData() con
        // sus propias secciones).
        async function loadSettingsSubscriptionInfo() {
            const body = cuerpoAjustes('settings-subscription-body');
            if (!body) return;
            const { data: { user } } = await sb.auth.getUser();
            if (!user) return;
            const sub = await getSubscriptionStatus(user, { allowRetry: false });

            if (sub.estado === 'legado') {
                body.innerHTML = `
                    <div class="settings-subscription-card settings-subscription-card-legado">
                        <div class="settings-subscription-status">Acceso gratuito permanente</div>
                        <div class="settings-subscription-note">Cuenta anterior al lanzamiento de pago.</div>
                    </div>`;
                return;
            }
            if (sub.estado === 'sin_suscripcion' || sub.estado === 'canceled') {
                body.innerHTML = `
                    <div class="settings-subscription-card settings-subscription-card-neutral">
                        <div class="settings-subscription-status">${sub.estado === 'canceled' ? 'Suscripción terminada' : 'Sin suscripción activa'}</div>
                        <div class="settings-subscription-note">${sub.estado === 'canceled' ? 'Ya no tienes acceso a Bitácora.' : ''}</div>
                    </div>`;
                return;
            }

            const planLabel = sub.plan === 'anual' ? 'anual' : 'mensual';
            const fecha = sub.periodo_fin
                ? new Date(sub.periodo_fin).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
                : null;

            if (sub.cancela_al_final_periodo) {
                body.innerHTML = `
                    <div class="settings-subscription-card">
                        <div class="settings-subscription-status">Suscripción ${planLabel} · se cancela${fecha ? ' el ' + fecha : ''}</div>
                        <div class="settings-subscription-note">Mantienes el acceso hasta esa fecha. No se te volverá a cobrar.</div>
                    </div>`;
                return;
            }

            body.innerHTML = `
                <div class="settings-subscription-card">
                    <div class="settings-subscription-status">Suscripción ${planLabel}${sub.estado === 'trialing' ? ' (en prueba)' : ''} · se renueva${fecha ? ' el ' + fecha : ''}</div>
                    <button class="btn-secondary" style="width:auto;margin-top:10px;color:#7f1d1d" onclick="confirmCancelSubscription()">Cancelar suscripción</button>
                </div>`;
        }

        function confirmCancelSubscription() {
            showModal(`
                <div class="modal-title">Cancelar suscripción<button class="modal-close" onclick="closeModal()">✕</button></div>
                <p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:22px">
                    Mantendrás el acceso hasta el final del periodo ya pagado. No se te volverá a cobrar después.
                </p>
                <div style="display:flex;gap:8px">
                    <button class="btn-secondary" style="width:auto;flex:1" onclick="closeModal()">Seguir suscrito</button>
                    <button class="btn-secondary" style="width:auto;flex:1;background:#7f1d1d;color:#fff;border-color:#7f1d1d" onclick="closeModal();executeCancelSubscription()">Sí, cancelar</button>
                </div>
            `);
        }

        async function executeCancelSubscription() {
            try {
                const { data: { session } } = await sb.auth.getSession();
                const res = await fetch(`${SUPABASE_URL}/functions/v1/cancelar-suscripcion`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Error desconocido');
                showToast('Suscripción cancelada. Conservas el acceso hasta el final del periodo.');
                loadSettingsSubscriptionInfo();
            } catch (e) {
                console.error('Error cancelando suscripción:', e);
                showToast('No se pudo cancelar: ' + e.message, true);
            }
        }

