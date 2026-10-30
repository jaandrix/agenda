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
                const pathEsc = jsAttr(n.path);
                const hijos = Object.values(n.children).sort((a, b) => a.name.localeCompare(b.name));
                return `
                <div class="etiqueta-tarjeta" onclick="window._selectedTag='${pathEsc}';render()">
                    <div class="etiqueta-tarjeta-top"><span class="etiqueta-tarjeta-nombre">#${escapeHtml(n.name)}</span><span class="etiqueta-tarjeta-n">${items.length}</span></div>
                    <div class="etiqueta-tarjeta-barra"><span style="width:${Math.max(6, items.length / max * 100)}%"></span></div>
                    <div class="etiqueta-tarjeta-tipos">${desgloseTipos(items)}</div>
                    ${hijos.length ? `<div class="etiqueta-tarjeta-hijos">${hijos.map(h => `<button onclick="event.stopPropagation();window._selectedTag='${jsAttr(h.path)}';render()">/${escapeHtml(h.name)}</button>`).join('')}</div>` : ''}
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
            return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${c} ${c === 1 ? (TYPE_LABELS[t] || t).toLowerCase() : (TIPO_PLURAL[t] || t)}`).join(', ');
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
                const tagEsc = jsAttr(tag);
                const porTipo = {};
                items.forEach(e => { (porTipo[e.type] = porTipo[e.type] || []).push(e); });
                const hayConexion = items.length > 0;
                return `
                <div class="etiquetas-vista">
                    <button class="etiquetas-volver" onclick="window._selectedTag=null;render()">← etiquetas.</button>
                    <div class="etiqueta-cabecera">
                        <div>
                            <div class="etiqueta-nombre">#${escapeHtml(tag)}</div>
                            <div class="etiquetas-sub">${items.length} ${items.length === 1 ? 'entrada' : 'entradas'}, ${desgloseTipos(items)}</div>
                        </div>
                        <div class="etiqueta-acciones">
                            ${hayConexion ? `<button class="finance-oneoff-btn" onclick="cargarBajoDemanda('conexiones').then(()=>{conexionSeleccionada='etiqueta:${tagEsc}';conexionAnimar=true;switchView('graph')})">ver conexiones.</button>` : ''}
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
                                <button class="etiqueta-quitar" title="Quitar #${escapeHtml(tag)} de esta entrada" onclick="event.stopPropagation();quitarEtiquetaDeEntrada('${e.id}','${tagEsc}')"><i class='ico ico-x' aria-hidden=true></i></button>
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
                        <div class="chart-title">¿qué le falta a bitácora?</div>
                        <div style="font-size:12px;color:var(--text-secondary);margin:8px 0 14px">Algo que eches en falta, algo que cambiarías o algo que no funciona. Lo leemos todo, una a una.</div>
                        <textarea id="suggestion-text" class="modal-input" rows="4" placeholder="Escribe aquí..."></textarea>
                        <button class="btn-modal-primary" style="width:auto" onclick="submitSuggestion()">enviar.</button>
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
            { tipo: 'pedidos', titulo: 'envíos.', texto: 'Cuando un pedido con seguimiento automático cambia de estado (enviado, en reparto, listo para recoger, entregado).' },
            { tipo: 'reembolsos', titulo: 'reembolsos atascados.', texto: 'Un ingreso que lleva más de 7 días pendiente en el banco.' },
            { tipo: 'cumpleanos', titulo: 'cumpleaños.', texto: 'Los cumpleaños de hoy y de mañana.' },
            { tipo: 'ritmo', titulo: 'ritmo de gasto.', texto: 'Cuando el gasto del día a día va bastante por encima de lo normal en ti. Como mucho dos veces al mes.' },
            { tipo: 'bandeja', titulo: 'propuestas.', texto: 'Cambios de Claude que llevan más de un día esperando tu validación.' },
            { tipo: 'semana', titulo: 'tu semana.', texto: 'El domingo a las 20:00, lo que viene en la semana: eventos, exámenes y entregas, cumpleaños y cargos.' },
            { tipo: 'volver', titulo: 'si llevas días sin entrar.', texto: 'Tras 4 días sin abrir Bitácora, un aviso con algo tuyo (lo que tienes mañana, un cumpleaños...). Como mucho uno por semana.' },
            { tipo: 'regalos', titulo: 'regalos de cumpleaños.', texto: 'Una semana antes de cada cumpleaños, la tarea «pensar regalo» en tareas pendientes.' },
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
                return `<div style="font-size:12.5px;color:var(--text-secondary)">${ios ? 'Bloqueadas en el iPhone: ve a Ajustes del iPhone → Notificaciones → Bitácora y activa «Permitir notificaciones». Después vuelve aquí.' : 'Bloqueadas desde los ajustes del navegador/sistema: actívalas ahí para poder usarlas aquí.'}</div>`;
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
            if (mobileStandaloneActive) {
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
            calendario: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M24 8h12v10h28V8h12v10h6a10 10 0 0 1 10 10v54a10 10 0 0 1-10 10H18A10 10 0 0 1 8 82V28a10 10 0 0 1 10-10h6zM20 40v40h60V40z"/><path d="M50 46l14 14H56v14H44V60h-8z"/></svg>',
            amigos: '<svg viewBox="0 0 100 100" fill="currentColor"><circle cx="34" cy="34" r="16"/><circle cx="68" cy="40" r="13"/><path d="M6 86c0-17 13-30 28-30s28 13 28 30zM58 86c0-8-2-15-6-21 4-3 10-5 16-5 13 0 26 11 26 26z"/></svg>',
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
            const { opcionales } = configApartados();
            return `
                <div class="ajustes-opcionales-resumen">
                    <span>${(() => { const activos = APARTADOS_OPCIONALES.filter(o => opcionales[o.view]); return activos.length ? `${activos.length} de ${APARTADOS_OPCIONALES.length} activos: ${activos.map(o => o.titulo.replace(/\.$/, '')).join(', ')}.` : 'Ninguno activo.'; })()}</span>
                    <button class="btn-secondary" style="width:auto" onclick="openApartadosOpcionales()">elegir apartados.</button>
                </div>`;
        }

        // Son muchos y la lista alargaba Ajustes: se eligen en su modal.
        // Los cambios se apuntan en un borrador y se aplican de una vez con
        // "guardar selección.": aplicarlos con cada toque repintaba los menús
        // y la vista de detrás, y se veían saltos.
        let apartadosBorrador = null;

        function openApartadosOpcionales() {
            apartadosBorrador = { ...configApartados().opcionales };
            showModal(`<div class="modal-title">apartados.</div><div id="apartados-opcionales">${renderApartadosOpcionales()}</div>
                <button class="btn-modal-primary apartados-guardar" onclick="guardarSeleccionApartados()">guardar selección.</button>`);
        }

        function alternarBorradorApartado(view) {
            apartadosBorrador[view] = !apartadosBorrador[view];
            document.getElementById('apartados-opcionales').innerHTML = renderApartadosOpcionales();
        }

        function guardarSeleccionApartados() {
            const opcionales = apartadosBorrador;
            apartadosBorrador = null;
            closeModal();
            guardarConfigApartados({ opcionales });
        }

        // Los opcionales se agrupan en ramas (bitácora#school...). Lo que no
        // esté en ninguna rama cae en #otros, así un apartado nuevo nunca se
        // queda sin poder activarse.
        const RAMAS_APARTADOS = [
            { id: 'school', texto: 'Para quien estudia o da clase.', apartados: ['studies', 'estudiar', 'universidad', 'profesorado'] },
            { id: 'home', texto: 'El día a día de casa.', apartados: ['compra', 'actualizaciones', 'collectibles'] },
            { id: 'work', texto: 'Tu trabajo, proyectos y recursos.', apartados: ['work', 'projects', 'links'] },
            { id: 'mind', texto: 'Tu segundo cerebro: cómo se relaciona todo.', apartados: ['tags', 'graph'] },
        ];

        function renderApartadosOpcionales() {
            const opcionales = apartadosBorrador || configApartados().opcionales;
            const enRama = new Set(RAMAS_APARTADOS.flatMap(r => r.apartados));
            const ramas = [...RAMAS_APARTADOS, { id: 'otros', texto: 'El resto.', apartados: APARTADOS_OPCIONALES.map(o => o.view).filter(v => !enRama.has(v)) }]
                .map(r => ({ ...r, items: r.apartados.map(v => APARTADOS_OPCIONALES.find(o => o.view === v)).filter(Boolean) }))
                .filter(r => r.items.length);
            return `<p class="finance-modal-note" style="margin-top:0">Toca los apartados que quieras ver y pulsa <b>guardar selección.</b> abajo. Lo que apagues desaparece de los menús, pero sus datos se quedan guardados.</p>
                <div class="ramas">${ramas.map(r => {
                    const activos = r.items.filter(o => opcionales[o.view]).length;
                    return `<section class="rama">
                        <div class="rama-cab">
                            <span class="rama-nombre">bitácora<b>#${r.id}</b></span>
                            <span class="rama-cuenta">${activos} de ${r.items.length}</span>
                        </div>
                        <div class="rama-texto">${r.texto}</div>
                        <div class="rama-apartados">${r.items.map(o => `
                            <button class="rama-apartado ${opcionales[o.view] ? 'on' : ''}" onclick="alternarBorradorApartado('${o.view}')" aria-pressed="${!!opcionales[o.view]}">
                                <span class="rama-apartado-cab"><b>${o.titulo}</b><i aria-hidden="true"></i></span>
                                <small>${o.texto}</small>
                            </button>`).join('')}</div>
                    </section>`;
                }).join('')}</div>`;
        }

        // Palabras con las que se encuentra cada ajuste en el buscador, además de su título y su texto.
        const AJUSTES_CLAVES = {
            'suscripción.': 'pago plan precio stripe factura tarjeta fundador regalo código prueba gratis',
            'invita a un amigo.': 'invitar amigo código enlace recomendar regalo prueba 30 días tema amigos',
            'tus datos.': 'exportar importar copia seguridad json backup ics calendario',
            'qué quieres ver.': 'apartados menú perfil estudiante trabajador opcional ocultar mostrar',
            'claude y chatgpt.': 'ia inteligencia artificial conector mcp token bandeja propuestas',
            'siri y tu correo.': 'atajo atajos iphone dictar email reenviar',
            'lo que bitácora sabe sola.': 'festivos puentes luz precio equipos fútbol series ciudad',
            'tu calendario en otras apps.': 'google icloud outlook suscribir ics enlace',
            'correo de los domingos.': 'email correo semanal resumen domingo boletín',
            'notificaciones.': 'avisos push recordatorios resumen mañana',
            'tema y letra.': 'apariencia tema oscuro claro modo color tipografía fuente tamaño letra ancho',
            'semana de ejemplo.': 'ejemplo demo prueba datos inventados empezar',
            'qué es bitácora.': 'instalar app legal privacidad condiciones cookies aviso',
            'prompts guardados.': 'ia textos copiar',
            'modo desarrollador.': 'vault oculto desarrollador',
            'zona de riesgo.': 'borrar eliminar cuenta cerrar sesión dispositivos',
        };

        function bloqueAjuste(id, icono, titulo, texto, cuerpo, clase = '') {
            return `
                <section class="ajuste ${clase}" ${id ? `id="${id}"` : ''} data-claves="${escapeHtml(AJUSTES_CLAVES[titulo] || '')}">
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
                    ${typeof descargarGuiaIA === 'function' ? `
                    <button class="ajustes-guia ajustes-guia-ia" onclick="descargarGuiaIA()">
                        <span class="ajuste-icono"><i class='ico ico-bajar' aria-hidden=true></i></span>
                        <span><b>guía para tu ia.</b><small>Descárgala y pásasela a ChatGPT, Claude o Gemini: te enseña Bitácora paso a paso y te resuelve dudas.</small></span>
                        <span class="ajustes-guia-flecha" aria-hidden="true">→</span>
                    </button>` : ''}
                    <button class="ajustes-guia ajustes-guia-ia" onclick="openVengoDe()">
                        <span class="ajuste-icono"><i class='ico ico-abrir' aria-hidden=true></i></span>
                        <span><b>vengo de otra app.</b><small>Trae tu calendario, tus libros y pelis, el extracto del banco o tus tarjetas de estudio.</small></span>
                        <span class="ajustes-guia-flecha" aria-hidden="true">→</span>
                    </button>

                    <div class="ajustes-buscador">
                        <input id="ajustes-buscar" class="modal-input" type="search" placeholder="busca un ajuste: tema, avisos, exportar..." oninput="filtrarAjustes(this.value)" autocomplete="off">
                        <nav class="ajustes-indice" aria-label="Grupos de ajustes">${AJUSTES_GRUPOS.map(([k, t]) => `<button type="button" onclick="document.getElementById('ajg-${k}')?.scrollIntoView({ behavior: vtReducido() ? 'auto' : 'smooth', block: 'start' })">${t}</button>`).join('')}</nav>
                        <div class="ajustes-sin-resultados" id="ajustes-sin-resultados" hidden></div>
                    </div>

                    <div class="ajustes-seccion" data-grupo="cuenta"><div class="ajustes-grupo" id="ajg-cuenta">cuenta.</div>
                    <div class="ajustes-rejilla">
                        ${bloqueAjuste('settings-subscription-section', 'suscripcion', PAGOS_ACTIVOS ? 'suscripción.' : 'beta abierta.', PAGOS_ACTIVOS ? 'Tu plan y su renovación.' : 'Gratis y con todas las funciones.', `<div id="settings-subscription-body" class="ajuste-cargando">Cargando...</div>`)}
                        ${bloqueAjuste('settings-invitar-section', 'amigos', 'invita a un amigo.', PAGOS_ACTIVOS ? `Con tu enlace, tu amigo tiene ${DIAS_PRUEBA_AMIGO} días de prueba en vez de 14 y, cuando entre, los dos desbloqueáis el tema «oliva.».` : 'Pásale tu enlace a quien quieras que pruebe la beta. Cuando entre, los dos desbloqueáis el tema «oliva.».', `<div id="settings-invitar-body" class="ajuste-cargando">Cargando...</div>`)}
                        ${bloqueAjuste('settings-account-section', 'datos', 'tus datos.', 'Todo lo que hay en Bitácora (entradas, notas, finanzas...) en un archivo JSON: para guardarlo aparte o traerlo de vuelta.', `
                            <div class="ajuste-botones">
                                <button class="btn-secondary" style="width:auto" onclick="exportData()">exportar.</button>
                                <button class="btn-secondary" style="width:auto" onclick="document.getElementById('import-input').click()">importar.</button>
                                <button class="btn-secondary" style="width:auto" onclick="openEventsImportModal()">importar calendario.</button>
                                <button class="btn-secondary" style="width:auto" onclick="openHomeBackupModal()">copias.</button>
                            </div>`)}
                    </div>

                    </div>
                    <div class="ajustes-seccion" data-grupo="apartados"><div class="ajustes-grupo" id="ajg-apartados">apartados.</div>
                    ${bloqueAjuste('settings-apartados-section', 'apartados', 'qué quieres ver.', 'Activa solo los apartados que vayas a usar. Lo que desactives desaparece de los menús, pero sus datos se quedan guardados.', renderAjustesApartados(), 'ajuste-ancho')}

                    </div>
                    <div class="ajustes-seccion" data-grupo="conexiones"><div class="ajustes-grupo" id="ajg-conexiones">conexiones.</div>
                    <div class="ajustes-rejilla">
                        ${bloqueAjuste('settings-conector-section', 'conector', 'claude y chatgpt.', '', `<div id="settings-conector-body" class="ajuste-cargando">Cargando...</div>`)}
                        ${bloqueAjuste('settings-atajos-section', 'atajos', 'siri y tu correo.', 'Apunta cosas sin abrir Bitácora: dictándolas o reenviando un correo.', renderAjustesAtajos())}
                        ${bloqueAjuste('settings-servicios-section', 'lugar', 'lo que bitácora sabe sola.', 'Festivos, puentes, la luz, tus equipos y los estrenos de tus series, sin apuntar nada.', renderAjustesServicios())}
                        ${bloqueAjuste('', 'calendario', 'tu calendario en otras apps.', 'Suscríbete a Bitácora desde Google Calendar, el Calendario del iPhone u Outlook: tus eventos, cumpleaños, viajes y fechas límite, siempre al día.', `<button class="btn-secondary" style="width:auto" onclick="openCalendarioFeed()">obtener enlace.</button>`)}
                        ${bloqueAjuste('settings-correo-section', 'avisos', 'correo de los domingos.', 'A las 18:00 de cada domingo, a tu correo: lo que tienes la semana que viene y cómo ha ido esta. Se apaga aquí o desde el propio correo.', `<div id="settings-correo-body" class="ajuste-cargando">Cargando...</div>`)}
                        ${bloqueAjuste('settings-push-section', 'avisos', 'notificaciones.', 'Avisos en este dispositivo: el resumen de la mañana y una hora antes de cada evento.', `<div id="settings-push-body">${renderPushSettingsBody('cargando')}</div>`)}
                    </div>

                    </div>
                    <div class="ajustes-seccion" data-grupo="apariencia"><div class="ajustes-grupo" id="ajg-apariencia">apariencia.</div>
                    ${bloqueAjuste('settings-appearance-section', 'apariencia', 'tema y letra.', 'Se guarda en este dispositivo.', `
                        <div class="ajuste-subtitulo">tema.</div>
                        ${renderSelectorTema()}
                        <div class="ajuste-subtitulo">tipografía.</div>
                        <div id="font-options-container">${renderFontOptionsList()}</div>
                        <div class="ajuste-subtitulo">tamaño de letra en el móvil.</div>
                        ${renderSelectorTamanoLetra()}
                        <div class="solo-escritorio"><div class="ajuste-subtitulo">ancho.</div>
                        <button class="btn-secondary" style="width:auto" onclick="toggleMode()">alternar modo ancho.</button></div>`, 'ajuste-ancho')}

                    </div>
                    <div class="ajustes-seccion" data-grupo="ayuda"><div class="ajustes-grupo" id="ajg-ayuda">ayuda.</div>
                    <div class="ajustes-rejilla">
                        ${bloqueAjuste('settings-ejemplo-section', 'guia', 'semana de ejemplo.', 'Una semana inventada (una cena, un viaje, unos gastos, un examen) para ver cómo se conecta todo. Se quita cuando quieras y solo se borra lo del ejemplo.', typeof hayEjemplo === 'function' && hayEjemplo()
                            ? `<button class="btn-secondary" style="width:auto" onclick="openEmpezarConLoMio()">quitar el ejemplo.</button>`
                            : `<button class="btn-secondary" style="width:auto" onclick="verSemanaEjemplo()">ver una semana de ejemplo.</button>`)}
                        ${bloqueAjuste('', 'bitacora', 'qué es bitácora.', 'La idea detrás de la app y, si lo abres desde el navegador, instalarla como app.', `
                            <div class="ajuste-botones">
                                <button class="btn-secondary" style="width:auto" onclick="openAboutBitacora()">qué es, a fondo.</button>
                                <button class="btn-secondary" id="pwa-install-btn" style="width:auto;display:none" onclick="handlePwaInstallClick()">instalar bitácora.</button>
                            </div>
                            <div class="ajustes-legal">
                                <a href="legal.html#privacidad" target="_blank" rel="noopener">privacidad.</a>
                                <a href="legal.html#condiciones" target="_blank" rel="noopener">condiciones.</a>
                                <a href="legal.html#aviso-legal" target="_blank" rel="noopener">aviso legal.</a>
                                <a href="legal.html#cookies" target="_blank" rel="noopener">cookies.</a>
                            </div>`)}
                    </div>
                    </div>
                    <div class="ajustes-seccion" data-grupo="herramientas"><div class="ajustes-grupo" id="ajg-herramientas">herramientas.</div>
                    <div class="ajustes-rejilla">
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
                            <button class="finance-pro-switch ${devModeActive ? 'on' : ''}" onclick="toggleDeveloperMode()" aria-label="Modo desarrollador"><span class="finance-pro-switch-knob"></span></button>
                            ${devModeActive ? `<div class="ajuste-botones" style="margin-top:12px"><button class="btn-secondary" style="width:auto" onclick="openAjustesAdmin()">más ajustes.</button><button class="btn-secondary" style="width:auto" onclick="openMedidasModales()">medidas de los modales.</button><button class="btn-secondary" style="width:auto" onclick="alternarFranjaEstable()">${franjaEstable() ? 'quitar la franja estable.' : 'probar la franja estable.'}</button><button class="btn-secondary" style="width:auto" onclick="alternarBordeABorde()">${bordeABordeActivo() ? 'quitar la prueba de pantalla completa.' : 'probar pantalla completa en el iPhone.'}</button></div>` : ''}`)}
                    </div>
                    </div>
                    <div class="ajustes-seccion" data-grupo="riesgo"><div class="ajustes-grupo" id="ajg-riesgo">zona de riesgo.</div>
                    <div class="ajustes-rejilla">
                        ${bloqueAjuste('settings-danger-section', 'riesgo', 'zona de riesgo.', 'Cerrar tu sesión en todos los dispositivos, o borrar tu cuenta y todo lo que hay en ella para siempre.', `
                            <div class="ajuste-botones">
                                <button class="btn-secondary ajuste-peligro" style="width:auto" onclick="handleLogoutAllDevices()">cerrar sesión en todas partes.</button>
                                <button class="btn-secondary ajuste-peligro" style="width:auto" onclick="openEliminarCuenta()">eliminar mi cuenta.</button>
                            </div>`, 'ajuste-riesgo')}
                    </div>
                    </div>
                </div>`;
        }

        async function loadCorreoSemanalAjustes() {
            const body = document.getElementById('settings-correo-body');
            if (!body) return;
            body.classList.remove('ajuste-cargando');
            const { data, error } = await consultaConRed(() => sb.from('correo_semanal').select('activo').maybeSingle());
            if (error) { body.innerHTML = '<div class="ajuste-texto">Ahora mismo no está disponible.</div>'; return; }
            const on = !!data?.activo;
            body.innerHTML = `<div class="ajuste-fila-switch"><span>${on ? 'encendido.' : 'apagado.'}</span><button class="finance-pro-switch ${on ? 'on' : ''}" onclick="alternarCorreoSemanal(${!on})" aria-label="Correo de los domingos" aria-pressed="${on}"><span class="finance-pro-switch-knob"></span></button></div>`;
        }
        async function alternarCorreoSemanal(activo) {
            const { error } = await sb.rpc('poner_correo_semanal', { p_activo: activo });
            if (error) { showToast('No se pudo cambiar', true); return; }
            showToast(activo ? 'Te llegará el domingo a las 18:00' : 'Correo de los domingos apagado');
            loadCorreoSemanalAjustes();
        }

        const AJUSTES_GRUPOS = [['cuenta', 'cuenta.'], ['apartados', 'apartados.'], ['conexiones', 'conexiones.'], ['apariencia', 'apariencia.'], ['ayuda', 'ayuda.'], ['herramientas', 'herramientas.'], ['riesgo', 'riesgo.']];

        // Buscador de Ajustes: filtra los bloques por su título, su texto, lo que ya han cargado y sus palabras clave
        // (AJUSTES_CLAVES), sin repintar, y esconde los grupos que se quedan vacíos.
        function filtrarAjustes(q) {
            const norm = t => stripAccents(String(t || '').toLowerCase());
            const palabras = norm(q).split(/\s+/).filter(Boolean);
            const vista = document.querySelector('.ajustes-vista');
            if (!vista) return;
            let visibles = 0;
            vista.querySelectorAll('.ajustes-seccion').forEach(g => {
                let alguno = false;
                g.querySelectorAll('section.ajuste').forEach(sec => {
                    const texto = norm(sec.textContent + ' ' + (sec.dataset.claves || ''));
                    const ok = palabras.every(p => texto.includes(p));
                    sec.hidden = !ok;
                    if (ok) { alguno = true; visibles++; }
                });
                g.hidden = !alguno;
            });
            const nada = document.getElementById('ajustes-sin-resultados');
            if (nada) { nada.hidden = !!visibles || !palabras.length; nada.textContent = `nada con «${String(q).trim()}». prueba con otra palabra.`; }
            vista.querySelector('.ajustes-indice')?.toggleAttribute('hidden', palabras.length > 0);
        }

        async function verSemanaEjemplo() {
            if (hayEjemplo()) return;
            cargarEjemplo(configApartados().perfil);
            render();
            showToast('Semana de ejemplo puesta: la quitas con «empezar con lo mío.»');
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // Rellena la sección "Suscripción" de Ajustes aparte, porque
        // necesita una consulta a Supabase (renderSettings() es síncrono,
        // igual que ya hacen loadDocuments()/loadFriendsViewData() con
        // sus propias secciones).
        async function loadSettingsSubscriptionInfo() {
            loadInvitarAjustes().catch(e => console.error(e));
            loadCorreoSemanalAjustes().catch(e => console.error(e));
            const body = cuerpoAjustes('settings-subscription-body');
            if (!body) return;
            if (!PAGOS_ACTIVOS) {
                body.innerHTML = `<div class="settings-subscription-card settings-subscription-card-legado">
                    <div class="settings-subscription-status">Beta abierta</div>
                    <div class="settings-subscription-note">Bitácora es gratis y completa mientras dura la beta. Si eres beta tester (tenías cuenta al abrir la beta o entraste con un código), tendrás acceso ilimitado a todas las funciones, sin coste, mientras la app exista.</div>
                    <div class="ajuste-botones" style="margin-top:12px"><input id="codigo-beta" class="modal-input" style="max-width:220px;margin:0" placeholder="código de beta tester" aria-label="código de beta tester" autocomplete="off"><button class="btn-secondary" style="width:auto" onclick="canjearCodigoBeta()">canjear.</button></div>
                </div>`;
                return;
            }
            const { data: { user } } = await sb.auth.getUser();
            if (!user) return;
            const sub = await getSubscriptionStatus(user, { allowRetry: false });

            if (sub.estado === 'fundador') {
                body.innerHTML = `
                    <div class="settings-subscription-card settings-subscription-card-legado">
                        <div class="settings-subscription-status socio-texto">Socio fundador nº ${String(sub.socio_numero).padStart(2, '0')}</div>
                        <div class="settings-subscription-note">Bitácora de por vida. Gracias por creer en esto desde el principio. Tu tema exclusivo, «fundador.», está en Apariencia.</div>
                        <div class="ajuste-botones" style="margin-top:10px">
                            <button class="btn-secondary" style="width:auto" onclick="openRegalosSocio()">tus 3 regalos.</button>
                            <button class="btn-secondary" style="width:auto" onclick="openCondicionesFundador()">condiciones.</button>
                        </div>
                    </div>`;
                return;
            }
            if (sub.estado === 'prueba') {
                const dias = Math.max(0, Math.ceil((new Date(sub.trial_fin) - new Date()) / 86400000));
                body.innerHTML = `
                    <div class="settings-subscription-card settings-subscription-card-neutral">
                        <div class="settings-subscription-status">Prueba gratuita, ${dias === 1 ? 'queda 1 día' : `quedan ${dias} días`}</div>
                        <div class="settings-subscription-note">Sin tarjeta. Si te convence, suscríbete cuando quieras; si no, tus datos se quedan guardados.</div>
                        ${renderPlanesPago()}
                        ${renderCanjeRegalo()}
                    </div>`;
                cargarPlazasFundador();
                return;
            }
            if (sub.estado === 'regalo') {
                body.innerHTML = `
                    <div class="settings-subscription-card settings-subscription-card-neutral">
                        <div class="settings-subscription-status">Regalo de un socio fundador, hasta el ${new Date(sub.periodo_fin).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                        <div class="settings-subscription-note">Seis meses de Bitácora sin pagar nada. Si quieres seguir después, suscríbete cuando quieras.</div>
                        ${renderPlanesPago()}
                    </div>`;
                cargarPlazasFundador();
                return;
            }
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

            const botonPortal = `<button class="btn-secondary" style="width:auto;margin-top:10px" onclick="abrirPortalPago(this)">pagos y facturas.</button>`;
            if (sub.estado === 'past_due') {
                body.innerHTML = `
                    <div class="settings-subscription-card">
                        <div class="settings-subscription-status">No se ha podido cobrar tu suscripción</div>
                        <div class="settings-subscription-note">Actualiza tu tarjeta en los próximos días para no perder el acceso. Tus datos siguen intactos.</div>
                        ${botonPortal}
                    </div>`;
                return;
            }

            if (sub.cancela_al_final_periodo) {
                body.innerHTML = `
                    <div class="settings-subscription-card">
                        <div class="settings-subscription-status">Suscripción ${planLabel}, se cancela${fecha ? ' el ' + fecha : ''}</div>
                        <div class="settings-subscription-note">Mantienes el acceso hasta esa fecha. No se te volverá a cobrar.</div>
                        ${botonPortal}
                    </div>`;
                return;
            }

            body.innerHTML = `
                <div class="settings-subscription-card">
                    <div class="settings-subscription-status">Suscripción ${planLabel}${sub.estado === 'trialing' ? ' (en prueba)' : ''}, se renueva${fecha ? ' el ' + fecha : ''}</div>
                    <div class="ajuste-botones">
                        ${botonPortal}
                        <button class="btn-secondary" style="width:auto;margin-top:10px;color:var(--c-7f1d1d)" onclick="confirmCancelSubscription()">cancelar suscripción.</button>
                    </div>
                </div>
                <button class="paywall-fundador" data-plazas-fundador onclick="startStripeCheckout('fundador')">
                    <span class="paywall-fundador-texto"><b>hazte socio fundador.</b><small>Un único pago y Bitácora de por vida; tu suscripción se cancela sola. <span class="paywall-fundador-plazas">Solo 100 plazas.</span></small></span>
                    <span class="paywall-fundador-precio">29,99€<small>una vez</small></span>
                </button>
                <button class="paywall-condiciones" onclick="openCondicionesFundador()">qué significa «de por vida».</button>`;
            cargarPlazasFundador();
        }

        // Portal de cliente de Stripe (Edge Function portal-pago): tarjeta,
        // facturas, cambio de plan y cancelación.
        async function abrirPortalPago(boton) {
            if (boton) boton.disabled = true;
            try {
                const { data: { session } } = await sb.auth.getSession();
                const res = await fetch(`${SUPABASE_URL}/functions/v1/portal-pago`, { method: 'POST', headers: { 'Authorization': `Bearer ${session.access_token}` } });
                const r = await res.json();
                if (!res.ok || !r.url) throw new Error(r.error || 'No se pudo abrir');
                window.location.href = r.url;
            } catch (e) {
                console.error(e);
                showToast(e.message || 'No se pudo abrir el portal de pagos', true);
            } finally {
                if (boton) boton.disabled = false;
            }
        }

        function openEliminarCuenta() {
            const socio = suscripcionActual?.estado === 'fundador';
            const pagando = ['active', 'trialing', 'past_due'].includes(suscripcionActual?.estado);
            showModal(`
                <div class="modal-title">eliminar mi cuenta.</div>
                <div class="condiciones">
                    <p>Se borra <b>para siempre</b>, sin forma de recuperarlo:</p>
                    <ul>
                        <li>todo lo que hay en tu Bitácora: entradas, notas, finanzas, estudios, rutinas, documentos y archivos subidos;</li>
                        <li>tus copias de seguridad, tus amistades, tu código de amigo y tus conectores con Claude o ChatGPT;</li>
                        <li>en los grupos de gastos compartidos sigues apareciendo con tu nombre, sin cuenta, para que a tus amigos les cuadren las cuentas.</li>
                    </ul>
                    ${pagando ? '<p><b>Tu suscripción se cancela ahora mismo</b> y no se te volverá a cobrar.</p>' : ''}
                    ${socio ? '<p><b>Eres socio fundador:</b> pierdes tu número de socio y tu acceso de por vida, y no se puede recuperar.</p>' : ''}
                    <p>Antes de nada, puedes llevarte una copia de todo:</p>
                    <button class="btn-secondary" style="width:auto;margin-bottom:14px" onclick="exportData()">descargar mis datos.</button>
                    <p>Para confirmar, escribe <b>eliminar</b>:</p>
                </div>
                <input id="eliminar-confirmacion" class="modal-input" autocomplete="off" autocapitalize="none" placeholder="eliminar" oninput="document.getElementById('eliminar-boton').disabled = this.value.trim().toLowerCase() !== 'eliminar'">
                <button id="eliminar-boton" class="btn-modal-primary boton-peligro" disabled onclick="eliminarCuenta(this)">eliminar mi cuenta para siempre.</button>
                <button class="btn-secondary" style="width:100%;margin-top:10px" onclick="closeModal()">cancelar.</button>
            `);
        }

        async function eliminarCuenta(boton) {
            boton.disabled = true;
            boton.textContent = 'eliminando...';
            try {
                const { data: { session } } = await sb.auth.getSession();
                const res = await fetch(`${SUPABASE_URL}/functions/v1/eliminar-cuenta`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ confirmar: 'eliminar' }),
                });
                const r = await res.json();
                if (!res.ok) throw new Error(r.error || 'No se pudo eliminar la cuenta');
                closeModal();
                await sb.auth.signOut().catch(() => {});
                try { localStorage.clear(); } catch (e) {}
                resetToLoginScreen();
                showToast('Tu cuenta se ha eliminado. Gracias por haber probado Bitácora.');
            } catch (e) {
                console.error(e);
                showToast(e.message, true);
                boton.disabled = false;
                boton.textContent = 'eliminar mi cuenta para siempre.';
            }
        }

        function confirmCancelSubscription() {
            showModal(`
                <div class="modal-title">Cancelar suscripción<button class="modal-close" onclick="closeModal()"><i class='ico ico-x' aria-hidden=true></i></button></div>
                <p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:22px">
                    Mantendrás el acceso hasta el final del periodo ya pagado. No se te volverá a cobrar después.
                </p>
                <div style="display:flex;gap:8px">
                    <button class="btn-secondary" style="width:auto;flex:1" onclick="closeModal()">seguir suscrito.</button>
                    <button class="btn-secondary" style="width:auto;flex:1;background:var(--c-7f1d1d);color:var(--c-ffffff);border-color:var(--c-7f1d1d)" onclick="closeModal();executeCancelSubscription()">Sí, cancelar</button>
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


        // ============================================================
        //  CALENDARIO SUSCRIBIBLE (Edge Function calendario-feed)
        // ============================================================
        async function pedirEnlaceCalendario() {
            const { data: { session } } = await sb.auth.getSession();
            const res = await fetch(`${SUPABASE_URL}/functions/v1/calendario-feed`, { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token || ''}` } });
            const r = await res.json().catch(() => ({}));
            if (!r.url) throw new Error(r.error || 'sin enlace');
            return r.url;
        }

        async function openCalendarioFeed() {
            showModal('<div class="modal-title">tu calendario en otras apps.</div><div class="finance-empty-line">Preparando tu enlace...</div>');
            let url;
            try { url = await pedirEnlaceCalendario(); } catch (e) { console.error(e); showModal('<div class="modal-title">tu calendario en otras apps.</div><div class="finance-empty-line">No se pudo preparar el enlace. Prueba de nuevo en un rato.</div>'); return; }
            const webcal = url.replace(/^https:/, 'webcal:');
            window._calendarioFeedUrl = url;
            showModal(`
                <div class="modal-title">tu calendario en otras apps.</div>
                <p class="finance-modal-note" style="margin-top:0">Este enlace es personal: quien lo tenga puede ver tu calendario. Las apps lo vuelven a leer solas cada pocas horas.</p>
                <div class="feed-url">${escapeHtml(url)}</div>
                <div class="ajuste-botones" style="margin:10px 0 16px">
                    <button class="btn-modal-primary" style="width:auto;margin:0" onclick="navigator.clipboard.writeText(window._calendarioFeedUrl).then(() => showToast('Enlace copiado'))">copiar enlace.</button>
                    <a class="btn-secondary" style="width:auto;margin:0;text-decoration:none;display:inline-flex;align-items:center" href="${escapeHtml(webcal)}">abrir en el calendario.</a>
                </div>
                <div class="modal-label">Google Calendar</div>
                <p class="finance-modal-note">En el ordenador: calendar.google.com → «Otros calendarios» (+) → <b>Desde URL</b> → pega el enlace.</p>
                <div class="modal-label">iPhone</div>
                <p class="finance-modal-note">Pulsa «abrir en el calendario.» desde el iPhone, o: Ajustes → Calendario → Cuentas → Añadir cuenta → Otra → <b>Añadir calendario suscrito</b> → pega el enlace.</p>
                <div class="modal-label">Outlook</div>
                <p class="finance-modal-note">Añadir calendario → <b>Suscribirse desde la web</b> → pega el enlace.</p>
                <button class="btn-secondary" style="margin-top:6px" onclick="cambiarEnlaceCalendario()">cambiar enlace (el anterior deja de funcionar).</button>
            `);
        }

        async function cambiarEnlaceCalendario() {
            if (!confirm('El enlace actual dejará de funcionar en las apps donde lo hayas añadido. ¿Seguir?')) return;
            calendarioFeedVersion = (Number(calendarioFeedVersion) || 0) + 1;
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); return; }
            openCalendarioFeed();
        }

// Ajustes que solo se ven con el modo desarrollador: casillas que cambian cómo se comporta la app.
// Se guardan en servicios.admin (sincronizado), así valen en todos los dispositivos.
const AJUSTES_ADMIN = [
    ['panoramaEditorial', 'panorama editorial.', 'Panorama como una sola superficie dividida por líneas finas, sin tarjetas redondeadas, con «ahora.» como reloj del día, «hoy.» como línea de tiempo y la semana como curva. Usa los colores de tu tema.'],
    ['festivosDiscretos', 'festivos discretos.', 'Los festivos ya no se nombran ni se colorean en el calendario: el día lleva un punto amarillo, como un evento, y el nombre sale al pulsarlo.'],
];
function ajustesAdmin() { return (servicios && servicios.admin) || {}; }
function festivosDiscretos() { return !!ajustesAdmin().festivosDiscretos; }
function openAjustesAdmin() {
    const a = ajustesAdmin();
    showModal(`<div class="modal-title">más ajustes.</div>
        <p class="finance-modal-note" style="margin:0 0 12px">Solo con el modo desarrollador. Se guardan en tu cuenta.</p>
        <div class="admin-lista">${AJUSTES_ADMIN.map(([k, t, d]) => `<label class="admin-fila"><input type="checkbox" ${a[k] ? 'checked' : ''} onchange="cambiarAjusteAdmin('${k}', this.checked)"><span><b>${t}</b><small>${d}</small></span></label>`).join('')}</div>
        <div class="modal-label" style="margin-top:16px">tamaño de tus datos.</div>
        <p class="finance-modal-note" style="margin:0 0 8px">Lo que viaja en cada arranque y en cada guardado. Sirve para decidir qué separar primero.</p>
        <div class="admin-tamanos">${tamanosDatos().map(([k, b], i, l) => `<span><b>${escapeHtml(k)}</b><small>${b < 1024 ? b + ' B' : (b / 1024).toFixed(1) + ' KB'}${i ? '' : `, de ${(l.reduce((s, x) => s + x[1], 0) / 1024).toFixed(0)} KB en total`}</small></span>`).join('')}</div>`);
}
function tamanosDatos() {
    return Object.entries(DATOS_SINCRONIZADOS).map(([k, [leer]]) => { let b = 0; try { b = new Blob([JSON.stringify(leer()) || '']).size; } catch (_) { /* sin datos */ } return [k, b]; })
        .filter(([, b]) => b > 4).sort((a, b) => b[1] - a[1]).slice(0, 12);
}
async function cambiarAjusteAdmin(clave, valor) {
    servicios.admin = { ...ajustesAdmin(), [clave]: valor };
    repintarTrasModal();
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}

async function canjearCodigoBeta() {
    const codigo = document.getElementById('codigo-beta')?.value.trim();
    if (!codigo) return;
    const { data, error } = await sb.rpc('canjear_codigo_beta', { p_codigo: codigo });
    if (error) { console.error(error); showToast('No se pudo canjear el código', true); return; }
    if (data === 'ok') {
        const insignia = document.getElementById('beta-insignia'); if (insignia) insignia.hidden = false;
        showCenteredMessage('Ya eres beta tester de Bitácora');
    } else showToast(data === 'caducado' ? 'Ese código ya no se puede canjear' : 'Ese código no es válido', true);
}

        // Prueba de pantalla completa en el iPhone (viewport-fit=cover), solo en este dispositivo: la franja de arriba solo
        // la puede cubrir la web así, pero en su día dejó un hueco bajo la barra de abajo. index.html la aplica antes de
        // pintar; se prueba en la PWA y se quita aquí mismo si algo se ve mal.
        function bordeABordeActivo() {
            try { return localStorage.getItem('bitacora-borde-a-borde') === '1'; } catch (_) { return false; }
        }
        function alternarBordeABorde() {
            try {
                if (bordeABordeActivo()) localStorage.removeItem('bitacora-borde-a-borde');
                else localStorage.setItem('bitacora-borde-a-borde', '1');
            } catch (_) { showToast('No se pudo guardar en este dispositivo.', true); return; }
            location.reload();
        }
