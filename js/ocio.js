        // ============================================================
        //  RENDER: BOOKS
        // ============================================================
        // ============================================================
        //  RENDER: CULTURA (Libros + Series + Películas + Videojuegos)
        // ============================================================
        let cultureTab = 'books';
        const CULTURE_TAB_TO_TYPE = { books: 'book', series: 'series', movies: 'movie', games: 'game' };

        function setCultureTab(tab) {
            cultureTab = tab;
            render();
        }

        function toggleCultureSharedMode() {
            cultureSharedMode = !cultureSharedMode;
            render();
        }

        function renderCulture() {
            const tabs = [
                { id: 'books', label: 'Libros', icon: '◊', count: entries.filter(e => e.type === 'book').length },
                { id: 'series', label: 'Series', icon: '◈', count: entries.filter(e => e.type === 'series').length },
                { id: 'movies', label: 'Películas', icon: '▸', count: entries.filter(e => e.type === 'movie').length },
                { id: 'games', label: 'Videojuegos', icon: '◉', count: entries.filter(e => e.type === 'game').length },
                { id: 'lists', label: 'Listas', icon: '☰', count: cultureLists.length },
            ];
            const tipoActivo = CULTURE_TAB_TO_TYPE[cultureTab];
            const pendientes = recomendaciones.filter(r => r.tipo === tipoActivo).length;

            let html = `<div style="max-width:980px">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;flex-wrap:wrap">
                <div class="culture-tabs" style="margin-bottom:0">
                    ${tabs.map(t => `
                        <button class="culture-tab ${cultureTab === t.id ? 'active' : ''}" onclick="setCultureTab('${t.id}')">
                            <span>${t.label}</span>
                            <span class="culture-tab-count">${t.count}</span>
                        </button>`).join('')}
                </div>
                ${(!cultureSharedMode && cultureTab === 'movies') ? `
                <button class="btn-secondary btn-acento" style="width:auto" onclick="openLetterboxdImportModal()">Importar Letterboxd</button>
                ` : ''}
                ${(!cultureSharedMode && cultureTab === 'books') ? `
                <button class="btn-secondary btn-acento" style="width:auto" onclick="openGoodreadsImportModal()">Importar Goodreads</button>
                ` : ''}
                ${(!cultureSharedMode && cultureTab === 'series') ? `
                <button class="btn-secondary btn-acento" style="width:auto" onclick="openImdbSeriesImportModal()">Importar IMDb</button>
                ` : ''}
                <button class="btn-secondary culture-shared-toggle" style="width:auto" onclick="toggleCultureSharedMode()">
                    ${cultureSharedMode ? '← Mi biblioteca' : `Recomendaciones${pendientes ? ` (${pendientes})` : ''}`}
                </button>
                </div>
                <div class="culture-tab-content">
                <div class="cal-view-anim">`;

            if (cultureSharedMode) {
                html += renderGhostGrid(tipoActivo);
            } else if (cultureTab === 'books') html += renderBooks();
            else if (cultureTab === 'series') html += renderSeries();
            else if (cultureTab === 'movies') html += renderMovies();
            else if (cultureTab === 'games') html += renderGames();
            else if (cultureTab === 'lists') html += renderCultureLists();

            html += `</div></div></div>`;
            return html;
        }

        // ------------------------------------------------------------
        //  LISTAS PERSONALIZADAS DE OCIO
        // ------------------------------------------------------------
        const CULTURE_MEDIA_TYPES = ['book', 'movie', 'series', 'game'];

        function renderCultureLists() {
            if (window._selectedCultureList) {
                const list = cultureLists.find(l => l.id === window._selectedCultureList);
                if (!list) { window._selectedCultureList = null; return renderCultureLists(); }
                const items = entries.filter(e => (list.entryIds || []).includes(e.id));
                return `
                <div>
                    <button class="btn-secondary" style="width:auto;margin-bottom:12px" onclick="window._selectedCultureList=null;render()">← Volver a Listas</button>
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap">
                        <div style="font-size:18px;font-weight:700">${escapeHtml(list.name)} · ${items.length}</div>
                        <div style="display:flex;gap:8px">
                            <button class="finance-oneoff-btn" onclick="openCultureListPicker('${list.id}')">+ Añadir</button>
                            <button class="finance-oneoff-btn" onclick="abrirCompartirListaModal('${list.id}')">Compartir</button>
                            <button class="finance-oneoff-btn" style="color:#dc2626" onclick="deleteCultureList('${list.id}')">Eliminar lista</button>
                        </div>
                    </div>
                    ${items.length ? renderMediaCardGrid(items, e => TYPE_LABELS[e.type] || '') : `
                        <div class="finance-empty-state">Lista vacía. Pulsa <strong>+ Añadir</strong> para meter libros, pelis, series o juegos.</div>
                    `}
                </div>`;
            }

            return `
            <div>
                <button class="btn-modal-primary" style="width:auto;margin-bottom:16px" onclick="createCultureList()">+ Nueva lista</button>
                ${renderSharedCultureListsSection()}
                ${cultureLists.length ? `
                    <div style="display:flex;flex-direction:column;gap:2px">
                        ${cultureLists.map(l => `
                            <div class="entry-item" onclick="window._selectedCultureList='${l.id}';render()">
                                <div class="entry-color-dot" style="background:var(--accent)"></div>
                                <div class="entry-info">
                                    <div class="entry-title">${escapeHtml(l.name)}</div>
                                    <div class="entry-meta">${(l.entryIds || []).length} elemento${(l.entryIds || []).length === 1 ? '' : 's'}</div>
                                </div>
                            </div>`).join('')}
                    </div>
                ` : `<div class="finance-empty-state">Aún no tienes listas. Crea una para agrupar tus favoritos, tu "pendiente 2026" o lo que quieras.</div>`}
            </div>`;
        }

        async function createCultureList() {
            const name = prompt('Nombre de la nueva lista');
            if (!name || !name.trim()) return;
            const list = { id: 'clist_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), name: name.trim(), entryIds: [] };
            cultureLists.push(list);
            window._selectedCultureList = list.id;
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteCultureList(id) {
            const list = cultureLists.find(l => l.id === id);
            if (!list || !confirm(`¿Eliminar la lista "${list.name}"? Las entradas no se borran, solo la lista.`)) return;
            cultureLists = cultureLists.filter(l => l.id !== id);
            window._selectedCultureList = null;
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openCultureListPicker(listId) {
            const list = cultureLists.find(l => l.id === listId);
            if (!list) return;
            window._cultureListPickerId = listId;
            // Selección "en borrador": los ticks se acumulan aquí y solo se
            // aplican a la lista real al pulsar "Confirmar", para poder
            // marcar varios elementos seguidos sin que el modal se repinte
            // ni se guarde nada hasta terminar.
            window._cultureListPickerPending = [...(list.entryIds || [])];
            const options = entries.filter(e => CULTURE_MEDIA_TYPES.includes(e.type));
            showModal(`
                <div class="modal-title">Añadir a "${escapeHtml(list.name)}"</div>
                <input id="culture-list-picker-filter" class="modal-input" placeholder="Buscar..." oninput="filterCultureListPicker(this.value)">
                <div id="culture-list-picker-items" style="max-height:340px;overflow-y:auto;margin-top:8px">${renderCultureListPickerItems(options, '')}</div>
                <button class="btn-modal-primary" style="margin-top:12px" onclick="confirmCultureListPicker()">Confirmar</button>
            `);
            setTimeout(() => document.getElementById('culture-list-picker-filter')?.focus(), 50);
        }

        function renderCultureListPickerItems(options, q) {
            const pending = window._cultureListPickerPending || [];
            const filtered = q ? options.filter(e => e.title.toLowerCase().includes(q.toLowerCase())) : options;
            if (!filtered.length) return `<div class="finance-empty-line">Sin resultados</div>`;
            return filtered.map(e => `
                <label class="weekly-task-row">
                    <input type="checkbox" class="weekly-task-check" ${pending.includes(e.id) ? 'checked' : ''} onchange="toggleCultureListEntry('${e.id}')">
                    <span class="weekly-task-text">${escapeHtml(e.title)} <span style="color:var(--text-secondary)">· ${TYPE_LABELS[e.type] || ''}</span></span>
                </label>`).join('');
        }

        function filterCultureListPicker(q) {
            const options = entries.filter(e => CULTURE_MEDIA_TYPES.includes(e.type));
            const el = document.getElementById('culture-list-picker-items');
            if (el) el.innerHTML = renderCultureListPickerItems(options, q);
        }

        // Solo marca/desmarca en el borrador (window._cultureListPickerPending),
        // no toca la lista real todavía.
        function toggleCultureListEntry(entryId) {
            const pending = window._cultureListPickerPending || (window._cultureListPickerPending = []);
            if (pending.includes(entryId)) window._cultureListPickerPending = pending.filter(id => id !== entryId);
            else pending.push(entryId);
        }

        async function confirmCultureListPicker() {
            const list = cultureLists.find(l => l.id === window._cultureListPickerId);
            if (list) list.entryIds = [...(window._cultureListPickerPending || [])];
            window._cultureListPickerPending = null;
            closeModal();
            render();
            try { await saveData(); showToast('Lista actualizada'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // ------------------------------------------------------------
        //  LISTAS DE OCIO COMPARTIDAS ENTRE AMIGOS
        //  Mismo patrón que los viajes compartidos: se manda una foto fija
        //  de la lista (título, tipo y valoración de cada elemento), no una
        //  referencia en vivo, y el destinatario decide si la añade a las
        //  suyas o la descarta.
        // ------------------------------------------------------------
        let listasOcioCompartidas = [];

        async function cargarListasOcioCompartidas() {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) { listasOcioCompartidas = []; return; }
                const { data, error } = await sb.from('listas_ocio_compartidas')
                    .select('id, remitente_id, lista, nota, creado_en')
                    .eq('destinatario_id', user.id)
                    .order('creado_en', { ascending: false });
                if (error) { console.error('Error cargando listas de Ocio compartidas:', error); return; }
                listasOcioCompartidas = data || [];
                if (listasOcioCompartidas.length) {
                    const ids = [...new Set(listasOcioCompartidas.map(l => l.remitente_id))];
                    const { data: publicos } = await sb.from('perfiles_publicos').select('user_id, nombre_publico').in('user_id', ids);
                    const porId = Object.fromEntries((publicos || []).map(p => [p.user_id, p.nombre_publico]));
                    const amigoPorId = Object.fromEntries((amigos || []).map(a => [a.friend_id, a.nombre_visible || a.friend_nombre]));
                    listasOcioCompartidas.forEach(l => { l.remitente_nombre = porId[l.remitente_id] || amigoPorId[l.remitente_id] || 'Un amigo'; });
                }
            } catch (e) {
                console.error('Error cargando listas de Ocio compartidas:', e);
            }
        }

        function abrirCompartirListaModal(listId) {
            const list = cultureLists.find(l => l.id === listId);
            if (!list) return;
            if (!amigos.length) { showToast('Añade primero un amigo desde el apartado Amigos', true); return; }
            showModal(`
                <div class="modal-title">Compartir "${escapeHtml(list.name)}"</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Se enviará tal como está ahora: los títulos, su tipo y tu valoración. Si luego cambias la lista, no se actualizará lo ya enviado.</div>
                <div class="modal-label">Con quién</div>
                <select id="compartir-lista-amigo" class="modal-input">
                    ${amigos.map(a => `<option value="${a.friend_id}">${escapeHtml(a.nombre_visible || a.friend_nombre || 'Amigo')}</option>`).join('')}
                </select>
                <div class="modal-label">Nota (opcional)</div>
                <textarea id="compartir-lista-nota" class="modal-input" rows="3" placeholder="Algo que quieras contarle sobre la lista"></textarea>
                <button class="btn-modal-primary" onclick="enviarListaCompartida('${listId}')">Enviar lista</button>
            `);
        }

        async function enviarListaCompartida(listId) {
            const list = cultureLists.find(l => l.id === listId);
            if (!list) return;
            const destinatarioId = document.getElementById('compartir-lista-amigo')?.value;
            const nota = document.getElementById('compartir-lista-nota')?.value?.trim() || null;
            if (!destinatarioId) { showToast('Elige con quién compartirla', true); return; }
            const { data: { user } } = await sb.auth.getUser();
            if (!user) return;
            const items = entries.filter(e => (list.entryIds || []).includes(e.id))
                .map(e => ({ title: e.title, type: e.type, rating: e.rating || null }));
            if (!items.length) { showToast('Esta lista está vacía', true); return; }
            try {
                const { error } = await sb.from('listas_ocio_compartidas').insert({
                    remitente_id: user.id,
                    destinatario_id: destinatarioId,
                    lista: { name: list.name, items },
                    nota
                });
                if (error) throw error;
                closeModal();
                showToast('Lista compartida');
            } catch (e) {
                console.error('Error compartiendo la lista:', e);
                showToast('No se pudo compartir la lista', true);
            }
        }

        async function quitarListaCompartida(id) {
            listasOcioCompartidas = listasOcioCompartidas.filter(l => l.id !== id);
            if (typeof updateNotifBadge === 'function') updateNotifBadge();
            try {
                const { error } = await sb.from('listas_ocio_compartidas').delete().eq('id', id);
                if (error) console.error('Error quitando la lista compartida en Supabase:', error);
            } catch (e) {
                console.error('Error quitando la lista compartida:', e);
            }
        }

        async function anadirListaCompartidaAMisListas(id) {
            const l = listasOcioCompartidas.find(x => x.id === id);
            if (!l) return;
            const lista = l.lista || {};
            const nuevaLista = { id: 'clist_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), name: lista.name || 'Lista compartida', entryIds: [] };
            (lista.items || []).forEach(item => {
                const entryId = 'entry_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                entries.push({ id: entryId, type: item.type, title: item.title, rating: item.rating || 0, createdAt: new Date().toISOString() });
                nuevaLista.entryIds.push(entryId);
            });
            cultureLists.push(nuevaLista);
            filteredEntries = [...entries];
            try { await saveData(); } catch (e) { console.error(e); }
            await quitarListaCompartida(id);
            render();
            showToast('Lista añadida a las tuyas');
        }

        async function descartarListaCompartida(id) {
            if (!confirm('¿Descartar esta lista compartida?')) return;
            await quitarListaCompartida(id);
            render();
            showToast('Lista descartada');
        }

        function renderSharedCultureListsSection() {
            if (!listasOcioCompartidas.length) return '';
            return `
                <div style="margin-bottom:18px">
                    <div style="font-size:13px;font-weight:600;margin-bottom:8px">Listas compartidas contigo (${listasOcioCompartidas.length})</div>
                    ${listasOcioCompartidas.map(l => {
                        const lista = l.lista || {};
                        const items = lista.items || [];
                        return `
                        <div class="card" style="background:transparent;border-style:dashed;margin-bottom:10px">
                            <div style="font-weight:600">${escapeHtml(lista.name || 'Lista')}</div>
                            <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">De ${escapeHtml(l.remitente_nombre || 'un amigo')} · ${items.length} elemento${items.length === 1 ? '' : 's'}</div>
                            ${l.nota ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${linkifyText(l.nota)}</div>` : ''}
                            <div style="display:flex;gap:8px;margin-top:10px">
                                <button class="btn-modal-primary" style="width:auto" onclick="anadirListaCompartidaAMisListas('${l.id}')">+ Añadir a mis listas</button>
                                <button class="btn-secondary" style="width:auto" onclick="descartarListaCompartida('${l.id}')">Descartar</button>
                            </div>
                        </div>`;
                    }).join('')}
                </div>`;
        }

        // Iconos minimalistas en SVG para las tarjetas de Ocio (mismo estilo
        // de trazo/relleno para todos, sustituyen a los símbolos de fuente).
        const MEDIA_CARD_ICONS = {
            book: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5.5c2.5-1 5-1 8 .5v13c-3-1.5-5.5-1.5-8-.5z"/><path d="M21 5.5c-2.5-1-5-1-8 .5v13c3-1.5 5.5-1.5 8-.5z"/><line x1="6" y1="8" x2="9.5" y2="8.6"/><line x1="6" y1="10.8" x2="9.5" y2="11.4"/><line x1="6" y1="13.6" x2="9.5" y2="14.2"/></svg>`,
            movie: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 4v16l14-8z"/></svg>`,
            series: `<svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M3 5v14l8-7z"/><path d="M13 5v14l8-7z"/></svg>`,
            game: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8.5 6.3h1.5v3.2H13v1.5h-3v3.2H8.5v-3.2h-3V9.5h3z"/><circle cx="17.2" cy="8" r="1.25"/><circle cx="14.6" cy="10.6" r="1.25"/><circle cx="19.8" cy="10.6" r="1.25"/><circle cx="17.2" cy="13.2" r="1.25"/></svg>`
        };
        function mediaCardIcon(type) {
            return MEDIA_CARD_ICONS[type] || TYPE_ICONS[type] || '◈';
        }

        // Tarjeta común para Ocio (libros, películas, series, videojuegos). Fondo
        // negro por defecto; si la valoración es de 5 estrellas, reborde dorado.
        // El estado ("Viendo"...) y la valoración comparten un único hueco fijo,
        // nunca se muestran a la vez, para que el título quede siempre a la misma altura.
        // Enlace de una búsqueda ya compuesta (título + IMDb/Goodreads) que
        // se abre en una pestaña nueva del navegador. No se puede incrustar
        // esas páginas en un iframe dentro de Bitácora: casi todos los
        // sitios (IMDb y Goodreads incluidos) bloquean explícitamente que
        // los carguen dentro de otra página (cabecera X-Frame-Options), así
        // que una "ventana por encima" con esa búsqueda ya hecha no cargaría
        // nada — abrir pestaña nueva es la única forma que funciona de verdad.
        function externalSearchUrl(type, title) {
            const q = encodeURIComponent(title);
            if (type === 'book') return 'https://www.goodreads.com/search?q=' + q;
            if (type === 'movie' || type === 'series') return 'https://www.imdb.com/find/?q=' + q;
            return null;
        }

        // Enlace externo de una entrada: IMDb/Goodreads por título, o Google
        // Maps por lugar en el caso de un evento con lugar indicado. Misma
        // idea en todos los casos: una búsqueda ya compuesta que se abre en
        // una ventana nueva (los sitios de destino no se pueden incrustar).
        function entryExternalLink(entry) {
            const byTitle = externalSearchUrl(entry.type, entry.title);
            if (byTitle) return { url: byTitle, label: entry.type === 'book' ? 'Ver en Goodreads' : 'Ver en IMDb' };
            if (entry.type === 'event' && entry.place) {
                return { url: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(entry.place), label: 'Ver en Maps' };
            }
            return null;
        }

        function openExternalSearch(event, btn) {
            event.stopPropagation();
            const url = btn.dataset.extUrl;
            if (!url) return;
            const w = 1000, h = 520;
            const left = Math.round((screen.width - w) / 2), top = Math.round((screen.height - h) / 2);
            window.open(url, '_blank', `noopener,width=${w},height=${h},left=${left},top=${top}`);
        }

        function renderMediaCard(entry, metaLine, badge) {
            const gold = Number(entry.rating) === 5;
            const stars = entry.rating ? '★'.repeat(entry.rating) : '';
            const statusContent = stars
                ? `<div class="media-card-stars">${stars}</div>`
                : (badge ? `<div class="media-card-badge">${escapeHtml(badge)}</div>` : '');
            return `
                <div class="media-card media-card-type-${entry.type} ${gold ? 'media-card-gold' : ''}" data-open-entry="${entry.id}">
                    <div class="media-card-icon">${mediaCardIcon(entry.type)}</div>
                    <div class="media-card-title">${escapeHtml(entry.title)}</div>
                    <div class="media-card-meta">${metaLine ? escapeHtml(metaLine) : ''}</div>
                    <div class="media-card-status-slot">${statusContent}</div>
                </div>`;
        }
        function renderMediaCardGrid(items, metaFn, badgeFn) {
            return `<div class="media-card-grid">${items.map(e => renderMediaCard(e, metaFn ? metaFn(e) : '', badgeFn ? badgeFn(e) : '')).join('')}</div>`;
        }

        function openGoodreadsImportModal() {
            showModal(`
                <div class="modal-title">Importar desde Goodreads</div>
                <div class="doc-upload-box" onclick="document.getElementById('goodreads-import-input').click()">
                    <div style="font-weight:500;margin-bottom:4px;color:var(--text-primary)">Elegir archivo CSV</div>
                    <div style="font-size:12px;color:var(--text-secondary)">Goodreads → My Books → Import and export → Export Library</div>
                </div>
                <input type="file" id="goodreads-import-input" accept=".csv,text/csv" style="display:none" onchange="handleGoodreadsImport(event)">
            `);
        }

        // Los libros marcados "to-read" (aún no empezados) se omiten a
        // propósito — importar la pila de pendientes como si fueran lecturas
        // ensuciaría Ocio con libros que en realidad no has tocado todavía,
        // igual que se evitó con la lista de Letterboxd.
        function handleGoodreadsImport(event) {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async function (e) {
                try {
                    const rows = parseCsv(String(e.target.result));
                    if (rows.length < 2) { showToast('El CSV está vacío o no se ha podido leer', true); return; }
                    const header = rows[0].map(h => h.trim());
                    const idx = name => header.indexOf(name);
                    const iTitle = idx('Title');
                    const iAuthor = idx('Author');
                    const iRating = idx('My Rating');
                    const iDateRead = idx('Date Read');
                    const iDateAdded = idx('Date Added');
                    const iShelf = idx('Exclusive Shelf');
                    if (iTitle === -1) { showToast('Este archivo no parece un CSV de Goodreads (falta la columna "Title")', true); return; }

                    let added = 0, duplicates = 0, skippedToRead = 0, errors = 0;
                    for (let r = 1; r < rows.length; r++) {
                        const row = rows[r];
                        const title = (row[iTitle] || '').trim();
                        if (!title) { errors++; continue; }

                        const shelf = iShelf !== -1 ? (row[iShelf] || '').trim() : '';
                        if (shelf === 'to-read') { skippedToRead++; continue; }

                        const dateRead = iDateRead !== -1 ? (row[iDateRead] || '').trim() : '';
                        const dateAdded = iDateAdded !== -1 ? (row[iDateAdded] || '').trim() : '';
                        const endDate = normalizeImportDate(dateRead);
                        // Goodreads no guarda cuándo se EMPEZÓ un libro, solo cuándo
                        // se añadió y cuándo se terminó — se usa la mejor fecha
                        // disponible como fecha de inicio en vez de dejarla vacía.
                        const startDate = endDate || normalizeImportDate(dateAdded);
                        const status = endDate ? 'Completado' : 'Leyendo';
                        const ratingRaw = iRating !== -1 ? parseInt(row[iRating], 10) : NaN;
                        const rating = isNaN(ratingRaw) ? 0 : Math.max(0, Math.min(5, ratingRaw));
                        const author = iAuthor !== -1 ? (row[iAuthor] || '').trim() : '';

                        const normTitle = stripAccents(title.toLowerCase());
                        const isDup = entries.some(en => en.type === 'book' &&
                            stripAccents((en.title || '').toLowerCase()) === normTitle && en.startDate === startDate);
                        if (isDup) { duplicates++; continue; }

                        entries.push({
                            id: 'book_gr_' + Date.now() + '_' + r,
                            type: 'book',
                            title,
                            author,
                            startDate,
                            endDate,
                            date: startDate,
                            status,
                            rating
                        });
                        added++;
                    }

                    closeModal();
                    render();
                    showToast(`Importados ${added} libro${added === 1 ? '' : 's'}` +
                        (duplicates ? ` · ${duplicates} ya existían` : '') +
                        (skippedToRead ? ` · ${skippedToRead} pendientes de leer omitidos` : '') +
                        (errors ? ` · ${errors} fila${errors === 1 ? '' : 's'} con error` : ''));
                    try { await saveData(); } catch (err) { console.error('Error guardando la importación de Goodreads:', err); showToast('No se pudo guardar en la nube', true); }
                } catch (err) {
                    console.error('Error importando CSV de Goodreads:', err);
                    showToast('Error al leer el archivo CSV', true);
                }
            };
            reader.readAsText(file);
        }

        function renderBooks() {
            const allBooks = entries.filter(e => e.type === 'book');
            if (!allBooks.length) {
                return `<div class="empty-state"><div class="empty-title">Sin libros</div><div class="empty-sub"><span class="solo-escritorio">Pulsa el botón + y selecciona "Libro"</span><span class="solo-movil">Añade el primero con el botón de arriba.</span></div></div>`;
            }
            const { items: books, banner } = applyMonthFilterTo('book', allBooks);
            if (!books.length) return banner + `<div class="empty-state"><div class="empty-title">Sin libros ese mes</div></div>`;

            const reading = books.filter(b => b.status === 'Leyendo');
            const completed = books.filter(b => b.status === 'Completado');

            let html = banner + `<div>
                <div style="display:flex;gap:10px;margin-bottom:16px;max-width:280px">
                    <div class="card" style="flex:1;padding:10px 12px"><div class="card-title" style="font-size:10px">Leyendo</div><div class="card-value" style="font-size:17px">${reading.length}</div></div>
                    <div class="card" style="flex:1;padding:10px 12px"><div class="card-title" style="font-size:10px">Completados</div><div class="card-value" style="font-size:17px">${completed.length}</div></div>
                </div>`;

            if (reading.length) {
                html += `<div class="media-card-section-title">Leyendo</div>`;
                html += renderMediaCardGrid(reading, b => b.author || 'Sin autor');
            }

            if (completed.length) {
                html += `<div class="media-card-section-title">Completados</div>`;
                html += renderMediaCardGrid(completed, b => b.author || 'Sin autor');
            }

            html += `</div>`;
            return html;
        }

        // ============================================================
        //  RENDER: MOVIES
        // ============================================================
        function openLetterboxdImportModal() {
            showModal(`
                <div class="modal-title">Importar desde Letterboxd</div>
                <div class="doc-upload-box" onclick="document.getElementById('letterboxd-import-input').click()">
                    <div style="font-weight:500;margin-bottom:4px;color:var(--text-primary)">Elegir archivo CSV</div>
                    <div style="font-size:12px;color:var(--text-secondary)">Sube tu archivo diary.csv o watched.csv — Letterboxd → Settings → Import & Export → Export Your Data</div>
                </div>
                <input type="file" id="letterboxd-import-input" accept=".csv,text/csv" style="display:none" onchange="handleLetterboxdImport(event)">
            `);
        }

        function renderMovies() {
            const allMovies = entries.filter(e => e.type === 'movie');
            if (!allMovies.length) {
                return `<div class="empty-state"><div class="empty-title">Sin películas</div><div class="empty-sub"><span class="solo-escritorio">Pulsa el botón + y selecciona "Película", o "Importar Letterboxd" arriba</span><span class="solo-movil">Añade el primero con el botón de arriba.</span></div></div>`;
            }
            const { items: movies, banner } = applyMonthFilterTo('movie', allMovies);
            if (!movies.length) return banner + `<div class="empty-state"><div class="empty-title">Sin películas ese mes</div></div>`;

            const sorted = [...movies].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            const groups = [];
            const byKey = {};
            sorted.forEach(m => {
                const key = (m.date || '').slice(0, 7) || 'sin-fecha';
                if (!byKey[key]) { byKey[key] = { key, items: [] }; groups.push(byKey[key]); }
                byKey[key].items.push(m);
            });
            const monthLabel = key => {
                if (key === 'sin-fecha') return 'sin fecha';
                const [y, mo] = key.split('-').map(Number);
                return new Date(y, mo - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
            };

            let html = banner + `<div>`;
            groups.forEach(g => {
                html += `<div class="media-month-label">${escapeHtml(monthLabel(g.key))}.</div>`;
                html += renderMediaCardGrid(g.items, m => m.date || 'Sin fecha');
            });
            html += `</div>`;
            return html;
        }

        // Parser CSV mínimo pero correcto: entiende campos entre comillas con
        // comas dentro (habitual en títulos de película, p.ej. "Paris, Texas")
        // y comillas escapadas como "" — un split(',') simple los rompería.
        function parseCsv(text) {
            const rows = [];
            let row = [], field = '', inQuotes = false;
            for (let i = 0; i < text.length; i++) {
                const c = text[i];
                if (inQuotes) {
                    if (c === '"') {
                        if (text[i + 1] === '"') { field += '"'; i++; }
                        else inQuotes = false;
                    } else field += c;
                } else if (c === '"') inQuotes = true;
                else if (c === ',') { row.push(field); field = ''; }
                else if (c === '\r') { /* ignorar, el salto real es \n */ }
                else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
                else field += c;
            }
            if (field.length || row.length) { row.push(field); rows.push(row); }
            return rows.filter(r => r.some(f => f !== ''));
        }

        // Normaliza una fecha de un CSV externo a AAAA-MM-DD. No todos usan
        // guiones: Goodreads, por ejemplo, exporta con barras ("2024/03/12").
        // Devuelve cadena vacía si no reconoce el formato, en vez de intentar
        // adivinar y arriesgarse a una fecha incorrecta.
        function normalizeImportDate(raw) {
            const s = (raw || '').trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
            const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(s);
            return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
        }

        // Importador de Letterboxd: acepta tanto diary.csv (fecha real de
        // visionado + valoración) como watched.csv (solo título/fecha, sin
        // valorar) — busca las columnas por nombre en la cabecera en vez de
        // por posición fija, así vale para cualquiera de los dos archivos
        // del export oficial de Letterboxd sin pedir dos importadores
        // distintos. Duplicados = mismo título (sin acentos/mayúsculas) y
        // misma fecha ya existentes, para poder reimportar sin duplicar.
        function handleLetterboxdImport(event) {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async function (e) {
                try {
                    const rows = parseCsv(String(e.target.result));
                    if (rows.length < 2) { showToast('El CSV está vacío o no se ha podido leer', true); return; }

                    // Letterboxd exporta dos formatos muy distintos con la
                    // misma extensión .csv:
                    //  - diary.csv / watched.csv: una sola cabecera en la
                    //    primera línea (Date, Name, Rating, Watched Date...).
                    //  - la exportación de una LISTA propia: empieza con una
                    //    línea de título ("Letterboxd list export v7"),
                    //    luego una cabecera+fila con los metadatos de la
                    //    lista (nombre, fecha de creación...), y solo DESPUÉS
                    //    la cabecera real de las películas de la lista
                    //    (Position, Name, Year, URL...). Si se coge la
                    //    primera línea como cabecera aquí, se importa basura.
                    // Se detecta buscando la cabecera de items (contiene
                    // "Position" y "Name" a la vez) en vez de asumir que
                    // siempre está en la primera fila.
                    const isListExport = /letterboxd list export/i.test(rows[0][0] || '');
                    let headerRowIndex = 0;
                    let listName = '';
                    if (isListExport) {
                        const metaHeaderIdx = rows.findIndex(r => r.includes('Name') && r.includes('Date'));
                        if (metaHeaderIdx !== -1 && rows[metaHeaderIdx + 1]) {
                            listName = (rows[metaHeaderIdx + 1][rows[metaHeaderIdx].indexOf('Name')] || '').trim();
                        }
                        const itemsHeaderIdx = rows.findIndex(r => r.includes('Position') && r.includes('Name'));
                        if (itemsHeaderIdx !== -1) headerRowIndex = itemsHeaderIdx;
                    }

                    const header = rows[headerRowIndex].map(h => h.trim());
                    const idx = name => header.indexOf(name);
                    const iName = idx('Name');
                    const iYear = idx('Year');
                    const iDate = idx('Date');
                    const iWatchedDate = idx('Watched Date');
                    const iRating = idx('Rating');
                    const iUri = idx('Letterboxd URI') !== -1 ? idx('Letterboxd URI') : idx('URL');
                    if (iName === -1) { showToast('Este archivo no parece un CSV de Letterboxd reconocible (falta la columna "Name")', true); return; }

                    let added = 0, duplicates = 0, errors = 0;
                    for (let r = headerRowIndex + 1; r < rows.length; r++) {
                        const row = rows[r];
                        const title = (row[iName] || '').trim();
                        if (!title) { errors++; continue; }

                        const rawDate = (iWatchedDate !== -1 && row[iWatchedDate]) ? row[iWatchedDate] : (iDate !== -1 ? row[iDate] : '');
                        const date = normalizeImportDate(rawDate);
                        const ratingRaw = iRating !== -1 ? parseFloat(row[iRating]) : NaN;
                        const rating = isNaN(ratingRaw) ? 0 : Math.max(0, Math.min(5, Math.round(ratingRaw)));
                        const year = iYear !== -1 ? (row[iYear] || '').trim() : '';
                        const uri = iUri !== -1 ? (row[iUri] || '').trim() : '';

                        const normTitle = stripAccents(title.toLowerCase());
                        const isDup = entries.some(en => en.type === 'movie' &&
                            stripAccents((en.title || '').toLowerCase()) === normTitle && en.date === date);
                        if (isDup) { duplicates++; continue; }

                        entries.push({
                            id: 'movie_lb_' + Date.now() + '_' + r,
                            type: 'movie',
                            title,
                            date,
                            rating,
                            notes: [listName ? `Lista Letterboxd: ${listName}` : '', year ? `Año: ${year}` : '', uri].filter(Boolean).join(' · ')
                        });
                        added++;
                    }

                    closeModal();
                    render();
                    showToast(`Importadas ${added} película${added === 1 ? '' : 's'}` +
                        (duplicates ? ` · ${duplicates} ya existían` : '') +
                        (errors ? ` · ${errors} fila${errors === 1 ? '' : 's'} con error` : ''));
                    try { await saveData(); } catch (err) { console.error('Error guardando la importación de Letterboxd:', err); showToast('No se pudo guardar en la nube', true); }
                } catch (err) {
                    console.error('Error importando CSV de Letterboxd:', err);
                    showToast('Error al leer el archivo CSV', true);
                }
            };
            reader.readAsText(file);
        }

        // ============================================================
        //  RENDER: SERIES
        // ============================================================
        function openImdbSeriesImportModal() {
            showModal(`
                <div class="modal-title">Importar desde IMDb</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px">Series según tus valoraciones de IMDb — de un mismo archivo de valoraciones, solo se cogen las series (se ignoran películas y episodios sueltos).</div>
                <div class="doc-upload-box" onclick="document.getElementById('imdb-series-import-input').click()">
                    <div style="font-weight:500;margin-bottom:4px;color:var(--text-primary)">Elegir archivo CSV</div>
                    <div style="font-size:12px;color:var(--text-secondary)">IMDb → Your Ratings → Export</div>
                </div>
                <input type="file" id="imdb-series-import-input" accept=".csv,text/csv" style="display:none" onchange="handleImdbSeriesImport(event)">
            `);
        }

        // IMDb no tiene un export de "series" aparte: el mismo archivo de
        // valoraciones mezcla películas, series y episodios sueltos, así que
        // se filtra por la columna "Title Type" y solo se importan las de
        // tipo serie (tvSeries/tvMiniSeries) — los episodios sueltos
        // valorados aparte se ignoran para no meter un episodio como si
        // fuera la serie entera.
        function handleImdbSeriesImport(event) {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async function (e) {
                try {
                    const rows = parseCsv(String(e.target.result));
                    if (rows.length < 2) { showToast('El CSV está vacío o no se ha podido leer', true); return; }
                    const header = rows[0].map(h => h.trim());
                    const idx = name => header.indexOf(name);
                    const iTitle = idx('Title');
                    const iRating = idx('Your Rating');
                    const iDateRated = idx('Date Rated');
                    const iType = idx('Title Type');
                    if (iTitle === -1) { showToast('Este archivo no parece un CSV de valoraciones de IMDb (falta la columna "Title")', true); return; }

                    let added = 0, duplicates = 0, skippedNotSeries = 0, errors = 0;
                    for (let r = 1; r < rows.length; r++) {
                        const row = rows[r];
                        const title = (row[iTitle] || '').trim();
                        if (!title) { errors++; continue; }

                        const titleType = iType !== -1 ? (row[iType] || '').trim() : '';
                        if (iType !== -1 && titleType !== 'tvSeries' && titleType !== 'tvMiniSeries') { skippedNotSeries++; continue; }

                        const dateRated = iDateRated !== -1 ? (row[iDateRated] || '').trim() : '';
                        const endDate = normalizeImportDate(dateRated);
                        // IMDb tampoco guarda cuándo se empezó a ver una serie,
                        // solo cuándo se valoró — se usa esa misma fecha de inicio.
                        const startDate = endDate;
                        const status = endDate ? 'Completada' : 'Viendo';
                        const ratingRaw = iRating !== -1 ? parseInt(row[iRating], 10) : NaN;
                        // Escala de IMDb (1-10) a la de Bitácora (0-5).
                        const rating = isNaN(ratingRaw) ? 0 : Math.max(0, Math.min(5, Math.round(ratingRaw / 2)));

                        const normTitle = stripAccents(title.toLowerCase());
                        const isDup = entries.some(en => en.type === 'series' &&
                            stripAccents((en.title || '').toLowerCase()) === normTitle && en.startDate === startDate);
                        if (isDup) { duplicates++; continue; }

                        entries.push({
                            id: 'series_imdb_' + Date.now() + '_' + r,
                            type: 'series',
                            title,
                            startDate,
                            endDate,
                            date: startDate,
                            status,
                            rating
                        });
                        added++;
                    }

                    closeModal();
                    render();
                    showToast(`Importadas ${added} serie${added === 1 ? '' : 's'}` +
                        (duplicates ? ` · ${duplicates} ya existían` : '') +
                        (skippedNotSeries ? ` · ${skippedNotSeries} no eran series` : '') +
                        (errors ? ` · ${errors} fila${errors === 1 ? '' : 's'} con error` : ''));
                    try { await saveData(); } catch (err) { console.error('Error guardando la importación de IMDb:', err); showToast('No se pudo guardar en la nube', true); }
                } catch (err) {
                    console.error('Error importando CSV de IMDb:', err);
                    showToast('Error al leer el archivo CSV', true);
                }
            };
            reader.readAsText(file);
        }

        function renderSeries() {
            const allSeries = entries.filter(e => e.type === 'series');
            if (!allSeries.length) {
                return `<div class="empty-state"><div class="empty-title">Sin series</div><div class="empty-sub"><span class="solo-escritorio">Pulsa el botón + y selecciona "Serie"</span><span class="solo-movil">Añade el primero con el botón de arriba.</span></div></div>`;
            }
            const { items: series, banner } = applyMonthFilterTo('series', allSeries);
            if (!series.length) return banner + `<div class="empty-state"><div class="empty-title">Sin series ese mes</div></div>`;

            const statusOrder = { 'Viendo': 0, 'Completada': 1, 'Abandonada': 2 };
            // Estado efectivo: si hay fecha de fin y el estado guardado sigue en
            // "Viendo" (dato antiguo sin reeditar), se muestra como "Completada".
            const effectiveStatus = s => (s.endDate && s.status === 'Viendo') ? 'Completada' : s.status;
            const sorted = [...series].sort((a, b) => (statusOrder[effectiveStatus(a)] || 0) - (statusOrder[effectiveStatus(b)] || 0));

            let html = banner + `<div>`;
            html += renderMediaCardGrid(sorted,
                null,
                s => effectiveStatus(s));
            html += `</div>`;
            return html;
        }

        // ============================================================
        //  RENDER: GAMES
        // ============================================================
        function renderGames() {
            const games = entries.filter(e => e.type === 'game');
            if (!games.length) {
                return `<div class="empty-state"><div class="empty-title">Sin videojuegos</div><div class="empty-sub"><span class="solo-escritorio">Pulsa el botón + y selecciona "Videojuego"</span><span class="solo-movil">Añade el primero con el botón de arriba.</span></div></div>`;
            }

            const statusOrder = { 'Jugando': 0, 'Completado': 1, 'Abandonado': 2 };
            const sorted = [...games].sort((a, b) => (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0));

            // Sin badge de estado: muchos juegos no tienen fecha de finalización.
            let html = `<div>`;
            html += renderMediaCardGrid(sorted, g => g.endDate ? `Fin: ${g.endDate}` : '');
            html += `</div>`;
            return html;
        }

        // ============================================================
        //  RECOMENDACIONES ENTRE AMIGOS (libros, pelis, series, videojuegos)
        // ============================================================
        async function cargarRecomendaciones() {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) { recomendaciones = []; return; }
                const { data, error } = await sb.from('recomendaciones')
                    .select('id, remitente_id, tipo, entrada, nota, creado_en')
                    .eq('destinatario_id', user.id)
                    .order('creado_en', { ascending: false });
                if (error) { console.error('Error cargando recomendaciones:', error); return; }
                recomendaciones = data || [];
                if (recomendaciones.length) {
                    const ids = [...new Set(recomendaciones.map(r => r.remitente_id))];
                    const { data: publicos } = await sb.from('perfiles_publicos').select('user_id, nombre_publico').in('user_id', ids);
                    const porId = Object.fromEntries((publicos || []).map(p => [p.user_id, p.nombre_publico]));
                    const amigoPorId = Object.fromEntries(amigos.map(a => [a.friend_id, a.nombre_visible || a.friend_nombre]));
                    recomendaciones.forEach(r => { r.remitente_nombre = porId[r.remitente_id] || amigoPorId[r.remitente_id] || 'Un amigo'; });
                }
            } catch (e) {
                console.error('Error cargando recomendaciones:', e);
            }
        }

        // ------------------------------------------------------------
        //  NOTIFICACIONES (solicitudes de amistad + recomendaciones pendientes)
        // ------------------------------------------------------------
        const NOTIF_ICON_FRIEND = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><path d="M16 8v6M19 11h-6"/></svg>';
        const NOTIF_ICON_REC = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';
        const NOTIF_ICON_TRIP = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h20"/><path d="M12 2c2.5 2.7 4 6.3 4 10s-1.5 7.3-4 10c-2.5-2.7-4-6.3-4-10s1.5-7.3 4-10z"/></svg>';
        const NOTIF_ICON_EVENT = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>';
        const CULTURE_TYPE_TO_TAB = { book: 'books', series: 'series', movie: 'movies', game: 'games' };
        const CULTURE_TYPE_LABEL = { book: 'un libro', series: 'una serie', movie: 'una película', game: 'un videojuego' };

        // La entrega de un trabajo (evento "Entrega: ...") sigue viva en el
        // calendario aunque ya la hayas hecho — solo el aviso de la parte
        // superior necesita saber que está completada, para dejar de
        // avisar de algo que ya no está pendiente.
        function isLinkedAssignmentDone(itemId) {
            if (!dayPlanner || !dayPlanner.days) return false;
            return Object.values(dayPlanner.days).some(list => (list || []).some(p => p.linkedAssignmentId === itemId && p.done));
        }

        function computeNotifItems() {
            const items = [];
            // Eventos de hoy — mismos datos que el popup de bienvenida
            // (getTodayAlerts), pero también avisados aquí por si el
            // usuario cerró el popup sin fijarse o entra más tarde. Los
            // trabajos ya marcados como hechos en el Planificador no
            // aparecen aquí (sí siguen en el calendario y en el popup).
            const today = todayISO();
            getTodayAlerts().events
                .filter(e => !(e.linkedKind === 'assignments' && isLinkedAssignmentDone(e.linkedItemId)))
                .forEach(e => {
                items.push({
                    icon: NOTIF_ICON_EVENT,
                    iconClass: 'icon-event',
                    title: e.title,
                    sub: e.time ? `Hoy · ${e.time}` : 'Hoy',
                    date: today + 'T' + (e.time || '00:00'),
                    onClick: () => { closeNotifPanel(); navigateToEntry(e.id); }
                });
            });
            (typeof solicitudesRecibidas !== 'undefined' ? solicitudesRecibidas : []).forEach(s => {
                items.push({
                    icon: NOTIF_ICON_FRIEND,
                    iconClass: 'icon-friend',
                    title: `${s.nombre || 'Alguien'} quiere ser tu amigo`,
                    sub: 'Solicitud de amistad pendiente',
                    date: s.creado_en || '',
                    onClick: () => { closeNotifPanel(); switchView('friends'); }
                });
            });
            if (suscripcionActual?.estado === 'prueba') {
                const dias = Math.max(0, Math.ceil((new Date(suscripcionActual.trial_fin) - new Date()) / 86400000));
                if (dias <= 3) items.push({
                    icon: NOTIF_ICON_EVENT,
                    iconClass: 'icon-event',
                    title: dias <= 1 ? 'Tu prueba gratuita termina hoy' : `Te quedan ${dias} días de prueba gratuita`,
                    sub: 'Suscríbete desde Ajustes si quieres seguir; tus datos no se pierden',
                    date: today + 'T00:00',
                    onClick: () => { closeNotifPanel(); switchView('settings'); }
                });
            }
            (typeof eventosCompartidosRecibidos !== 'undefined' ? eventosCompartidosRecibidos : []).forEach(e => {
                items.push({
                    icon: NOTIF_ICON_EVENT,
                    iconClass: 'icon-event',
                    title: `${e.nombre || 'Un amigo'} te comparte «${e.evento?.title || 'un evento'}»`,
                    sub: 'Evento compartido',
                    date: e.creado_en || '',
                    onClick: () => { closeNotifPanel(); switchView('friends'); setSocialTab('eventos'); }
                });
            });
            (typeof recomendaciones !== 'undefined' ? recomendaciones : []).forEach(r => {
                items.push({
                    icon: NOTIF_ICON_REC,
                    iconClass: 'icon-rec',
                    title: `${r.remitente_nombre || 'Un amigo'} te recomendó ${CULTURE_TYPE_LABEL[r.tipo] || 'algo'}`,
                    sub: (r.entrada && r.entrada.title) || '',
                    date: r.creado_en || '',
                    onClick: () => {
                        closeNotifPanel();
                        cultureTab = CULTURE_TYPE_TO_TAB[r.tipo] || 'books';
                        cultureSharedMode = true;
                        switchView('culture');
                    }
                });
            });
            (typeof viajesCompartidos !== 'undefined' ? viajesCompartidos : []).forEach(v => {
                items.push({
                    icon: NOTIF_ICON_TRIP,
                    iconClass: 'icon-trip',
                    title: `${v.remitente_nombre || 'Un amigo'} te compartió un viaje`,
                    sub: (v.viaje && v.viaje.title) || '',
                    date: v.creado_en || '',
                    onClick: () => { closeNotifPanel(); switchView('travels'); }
                });
            });
            (typeof listasOcioCompartidas !== 'undefined' ? listasOcioCompartidas : []).forEach(l => {
                items.push({
                    icon: NOTIF_ICON_TRIP,
                    iconClass: 'icon-trip',
                    title: `${l.remitente_nombre || 'Un amigo'} te compartió una lista`,
                    sub: (l.lista && l.lista.name) || '',
                    date: l.creado_en || '',
                    onClick: () => { closeNotifPanel(); cultureTab = 'lists'; window._selectedCultureList = null; switchView('culture'); }
                });
            });
            items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
            return items;
        }

        function renderNotifPanelHtml() {
            const items = computeNotifItems();
            window._notifItems = items;
            if (!items.length) {
                return `
                    <div class="notif-empty">
                        <svg class="notif-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                        Sin notificaciones nuevas
                    </div>`;
            }
            return `
                <div class="notif-panel-title">Notificaciones</div>
                ${items.map((it, i) => `
                    <div class="notif-item" onclick="window._notifItems[${i}].onClick()">
                        <div class="notif-item-icon ${it.iconClass || ''}">${it.icon}</div>
                        <div class="notif-item-body">
                            <div class="notif-item-title">${escapeHtml(it.title)}</div>
                            ${it.sub ? `<div class="notif-item-sub">${escapeHtml(it.sub)}</div>` : ''}
                        </div>
                    </div>
                `).join('')}
            `;
        }

        function updateNotifBadge() {
            const badge = document.getElementById('notif-badge');
            const bellBtn = document.getElementById('notif-bell-btn');
            if (!badge) return;
            const count = computeNotifItems().length;
            badge.hidden = count === 0;
            if (bellBtn) bellBtn.classList.toggle('has-unread', count > 0);
            const panel = document.getElementById('notif-panel');
            if (panel && panel.classList.contains('open')) {
                panel.innerHTML = renderNotifPanelHtml();
            }
        }

        async function refreshNotifData() {
            try {
                await Promise.all([cargarSolicitudesAmistad(), cargarRecomendaciones(), cargarViajesCompartidos(), cargarListasOcioCompartidas(), cargarEventosCompartidos()]);
                updateNotifBadge();
            } catch (e) {
                console.error('Error actualizando notificaciones:', e);
            }
        }

        function closeNotifPanel() {
            const panel = document.getElementById('notif-panel');
            if (panel) panel.classList.remove('open');
        }

        // Explicaciones del panel de ayuda — se apoyan en NAV_SECTIONS (la
        // misma fuente que usan la barra lateral y el buscador) para no
        // mantener dos listas de apartados por separado. Cada una explica
        // qué se hace ahí, no solo qué es, pensando en quien entra por
        // primera vez y no tiene ni idea de por dónde empezar.
        const HELP_VIEW_DESC = {
            calendar: 'Tu calendario de toda la vida: cambia entre vista de día, semana, mes o año, y toca cualquier día para ver o añadir lo que tengas planeado ese día.',
            home: 'Un resumen de un vistazo: lo próximo que tienes encima, cumpleaños cercanos y accesos directos a lo que más usas — para no tener que ir apartado por apartado.',
            planner: 'La franja horaria de tu día, hora a hora. Tiene pestañas para dejar ya planificados hoy, mañana y pasado mañana, y se vacía sola cada madrugada.',
            bandeja: 'Lo que Claude o ChatGPT proponen cambiar en tu Bitácora y espera tu visto bueno: nada se aplica hasta que lo validas. Los eventos y Ocio se aplican solos. Debajo, el historial de todo lo hecho, con opción de deshacer.',
            notes: 'Una nota de texto libre por día, como un diario — sin campos ni estructura, escribe lo que quieras.',
            events: 'Planes con fecha, hora y lugar: conciertos, citas, quedadas... Puedes añadirlos a mano o importar varios de golpe pegando texto o subiendo un archivo .ics de Google/Apple Calendar.',
            finances: 'Registra cada ingreso y gasto, y sigue tus inversiones — verás tu balance y cómo evoluciona con gráficas.',
            work: 'El historial de tus empleos: empresa, fechas, sueldo, y los documentos de cada uno (contrato, nóminas) guardados dentro.',
            studies: 'Tus asignaturas, con los exámenes de cada una y tus propios apuntes guardados sin salir de Bitácora.',
            documents: 'Un cajón para documentos importantes (DNI, contratos, seguros...), a mano cuando de verdad los necesites.',
            goals: 'Objetivos que quieres cumplir a medio o largo plazo. Puedes vincular cada uno a los proyectos con los que estás trabajando para conseguirlo.',
            projects: 'Proyectos con sus propias tareas: ve marcando lo que completas y verás el progreso de cada proyecto.',
            links: 'Enlaces web guardados por categoría, para no perderlos entre veinte pestañas abiertas.',
            culture: 'Lleva la cuenta de lo que lees, ves y juegas — libros, películas, series y videojuegos — con tu valoración y notas. Se puede importar desde Letterboxd, Goodreads o IMDb.',
            travels: 'Cada viaje con su itinerario día a día y los gastos que vas llevando, para no perder el control fuera de casa.',
            collectibles: 'Un catálogo de tus coleccionables (cartas, videojuegos...) con su valor de mercado actual.',
            friends: 'Añade amigos dentro de Bitácora para recomendaros películas, libros o series entre vosotros, y compartir viajes.',
            tags: 'Todas tus entradas de golpe, filtradas por la etiqueta que elijas — útil cuando sabes qué buscas pero no en qué apartado lo metiste.',
            settings: 'Tu cuenta: exportar o importar tus datos, tu suscripción, el tema claro/oscuro, y el resto de opciones generales.',
        };

        function helpKbd(tecla) {
            return `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:26px;padding:0 9px;border-radius:7px;border:1px solid var(--border-strong);border-bottom-width:2.5px;background:var(--bg-input);font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:var(--text-primary);white-space:nowrap">${tecla}</span>`;
        }

        function openHelpPanel() {
            const movimiento = [
                ['ENTER', 'Abre el buscador «¿Dónde quieres ir?», para saltar a cualquier apartado o entrada sin tocar el ratón.'],
                ['ESPACIO', 'Abre la captura rápida «¿Dónde quieres crear la entrada?», para añadir algo nuevo al instante.'],
                ['ESC', 'Cierra lo que esté abierto (un buscador, un modal...). Si no hay nada abierto, pregunta si quieres cerrar sesión.'],
                ['CTRL + ↑ / ↓', 'Salta al apartado anterior o siguiente del menú, sin usar el ratón.'],
            ];
            const secciones = navSeccionesVisibles().map(s => `
                <div class="help-section-label">${escapeHtml(s.label)}</div>
                <div class="help-item-list">
                    ${s.items.map(it => `
                        <div class="help-item">
                            <div class="help-item-title">${escapeHtml(it.text)}</div>
                            <div class="help-item-desc">${escapeHtml(HELP_VIEW_DESC[it.view] || '')}</div>
                        </div>
                    `).join('')}
                </div>`).join('');

            showModal(`
                <div class="modal-title">Cómo usar Bitácora<button class="modal-close" onclick="closeModal()">✕</button></div>
                <button class="guia-ayuda-btn" onclick="openGuia()">guía completa de bitácora. <span>→</span></button>
                <div class="help-section-label" style="color:var(--m-acento)">Movimiento por Bitácora</div>
                <div class="help-kbd-list">
                    ${movimiento.map(([tecla, texto]) => `
                        <div class="help-kbd-row">
                            ${helpKbd(tecla)}
                            <span class="help-kbd-desc">${texto}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="help-section-label" style="color:var(--m-acento);margin-top:22px">Apartados</div>
                ${secciones}
            `);
        }

        function toggleNotifPanel() {
            const panel = document.getElementById('notif-panel');
            if (!panel) return;
            const willOpen = !panel.classList.contains('open');
            panel.classList.toggle('open', willOpen);
            if (willOpen) {
                panel.innerHTML = renderNotifPanelHtml();
                escalonarDespliegue(panel, ':scope > *');
                panel.style.right = '0';
                // En pantallas estrechas el botón de la campana no queda
                // pegado al borde derecho (el reloj va después), así que
                // anclar el panel a "right:0" de su propio contenedor puede
                // sacarlo por la izquierda de la pantalla. Se corrige
                // desplazándolo lo justo para que no se salga. getBoundingClientRect
                // fuerza el reflow, así que no hace falta esperar a un frame.
                const r = panel.getBoundingClientRect();
                const overflow = 8 - r.left;
                if (overflow > 0) panel.style.right = (-overflow) + 'px';
                setTimeout(() => {
                    document.addEventListener('click', function closeNotifOnOutsideClick(e) {
                        const wrap = document.querySelector('.notif-bell-wrap');
                        if (wrap && !wrap.contains(e.target)) {
                            panel.classList.remove('open');
                            document.removeEventListener('click', closeNotifOnOutsideClick);
                        }
                    });
                }, 0);
            }
        }

        // Abre el selector de amigo + nota, desde el botón "Recomendar" de la
        // ficha de un libro/peli/serie/videojuego. Solo tiene sentido para esos
        // 4 tipos, y solo si ya tienes al menos un amigo añadido.
        function abrirRecomendarModal(entryId) {
            const entry = entries.find(e => e.id === entryId);
            if (!entry) return;
            if (!amigos.length) { showToast('Añade primero un amigo desde el apartado Amigos', true); return; }
            showModal(`
                <div class="modal-title">Recomendar "${escapeHtml(entry.title)}"</div>
                <div class="modal-label">A quién</div>
                <select id="recomendar-amigo" class="modal-input">
                    ${amigos.map(a => `<option value="${a.friend_id}">${escapeHtml(a.nombre_visible || a.friend_nombre || 'Amigo')}</option>`).join('')}
                </select>
                <div class="modal-label">Nota (opcional)</div>
                <textarea id="recomendar-nota" class="modal-input" rows="3" placeholder="¿Por qué se lo recomiendas?"></textarea>
                <button class="btn-modal-primary" onclick="enviarRecomendacion('${entryId}')">Enviar recomendación</button>
            `);
        }

        async function enviarRecomendacion(entryId) {
            const entry = entries.find(e => e.id === entryId);
            if (!entry) return;
            const destinatarioId = document.getElementById('recomendar-amigo')?.value;
            const nota = document.getElementById('recomendar-nota')?.value?.trim() || null;
            if (!destinatarioId) { showToast('Elige a quién recomendárselo', true); return; }
            const { data: { user } } = await sb.auth.getUser();
            if (!user) return;
            try {
                const { error } = await sb.from('recomendaciones').insert({
                    remitente_id: user.id,
                    destinatario_id: destinatarioId,
                    tipo: entry.type,
                    entrada: { title: entry.title, author: entry.author || null },
                    nota
                });
                if (error) throw error;
                closeModal();
                showToast('Recomendación enviada');
            } catch (e) {
                console.error('Error enviando la recomendación:', e);
                showToast('No se pudo enviar la recomendación', true);
            }
        }

        function renderGhostCard(rec) {
            const entrada = rec.entrada || {};
            return `
                <div class="media-card media-card-type-${rec.tipo} media-card-ghost" onclick="abrirGhostDetalle('${rec.id}')">
                    <div class="media-card-icon">${mediaCardIcon(rec.tipo)}</div>
                    <div class="media-card-title">${escapeHtml(entrada.title || 'Sin título')}</div>
                    <div class="media-card-meta">${escapeHtml(entrada.author || '')}</div>
                    <div class="media-card-ghost-from">De ${escapeHtml(rec.remitente_nombre || 'un amigo')}</div>
                    ${rec.nota ? `<div class="media-card-ghost-note">"${escapeHtml(rec.nota)}"</div>` : ''}
                </div>`;
        }

        function renderGhostGrid(tipo) {
            const items = recomendaciones.filter(r => r.tipo === tipo);
            if (!items.length) {
                return `<div class="empty-state"><div class="empty-title">Sin recomendaciones</div><div class="empty-sub">Aquí aparecerá lo que tus amigos te recomienden.</div></div>`;
            }
            return `<div class="media-card-grid">${items.map(renderGhostCard).join('')}</div>`;
        }

        function abrirGhostDetalle(recId) {
            const rec = recomendaciones.find(r => r.id === recId);
            if (!rec) return;
            const entrada = rec.entrada || {};
            showModal(`
                <div class="modal-title">${escapeHtml(entrada.title || 'Sin título')}</div>
                <div style="font-size:11px;color:var(--text-secondary)">${TYPE_LABELS[rec.tipo] || rec.tipo}</div>
                <div class="entry-detail-grid">
                    ${entrada.author ? detailField('Autor', escapeHtml(entrada.author)) : ''}
                    ${detailField('Recomendado por', escapeHtml(rec.remitente_nombre || 'Un amigo'))}
                    ${rec.nota ? detailField('Nota', escapeHtml(rec.nota)) : ''}
                </div>
                <div class="entry-detail-actions">
                    <button class="btn-modal-primary" onclick="anadirRecomendacionABiblioteca('${recId}')">+ Añadir a mi biblioteca</button>
                    <button class="btn-secondary" style="width:auto" onclick="descartarRecomendacion('${recId}')">No me interesa</button>
                    <button class="btn-secondary" style="width:auto" onclick="closeModal()">Cerrar</button>
                </div>
            `);
        }

        async function anadirRecomendacionABiblioteca(recId) {
            const rec = recomendaciones.find(r => r.id === recId);
            if (!rec) return;
            const entrada = rec.entrada || {};
            entries.push({
                id: 'entry_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                type: rec.tipo,
                title: entrada.title || 'Sin título',
                author: entrada.author || '',
                status: '',
                date: todayISO(),
                notes: rec.nota ? `Recomendado por ${rec.remitente_nombre || 'un amigo'}: ${rec.nota}` : `Recomendado por ${rec.remitente_nombre || 'un amigo'}`,
                createdAt: new Date().toISOString()
            });
            filteredEntries = [...entries];
            try { await saveData(); } catch (e) { console.error(e); }
            await quitarRecomendacion(recId);
            closeModal();
            render();
            showToast('Añadido a tu biblioteca');
        }

        async function descartarRecomendacion(recId) {
            if (!confirm('¿Descartar esta recomendación?')) return;
            await quitarRecomendacion(recId);
            closeModal();
            render();
            showToast('Recomendación descartada');
        }

        async function quitarRecomendacion(recId) {
            recomendaciones = recomendaciones.filter(r => r.id !== recId);
            if (typeof updateNotifBadge === 'function') updateNotifBadge();
            try {
                const { error } = await sb.from('recomendaciones').delete().eq('id', recId);
                if (error) console.error('Error quitando la recomendación en Supabase:', error);
            } catch (e) {
                console.error('Error quitando la recomendación:', e);
            }
        }

        // ------------------------------------------------------------
        //  VIAJES COMPARTIDOS ENTRE AMIGOS
        //  Mismo patrón que las recomendaciones: se manda una foto fija
        //  del viaje (no edición conjunta en vivo, ver bitacora_viajes_
        //  compartidos.sql), y el destinatario decide si la añade a sus
        //  propios viajes o la descarta.
        // ------------------------------------------------------------
        let viajesCompartidos = [];

        async function cargarViajesCompartidos() {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) { viajesCompartidos = []; return; }
                const { data, error } = await sb.from('viajes_compartidos')
                    .select('id, remitente_id, viaje, nota, creado_en')
                    .eq('destinatario_id', user.id)
                    .order('creado_en', { ascending: false });
                if (error) { console.error('Error cargando viajes compartidos:', error); return; }
                viajesCompartidos = data || [];
                if (viajesCompartidos.length) {
                    const ids = [...new Set(viajesCompartidos.map(v => v.remitente_id))];
                    const { data: publicos } = await sb.from('perfiles_publicos').select('user_id, nombre_publico').in('user_id', ids);
                    const porId = Object.fromEntries((publicos || []).map(p => [p.user_id, p.nombre_publico]));
                    const amigoPorId = Object.fromEntries((amigos || []).map(a => [a.friend_id, a.nombre_visible || a.friend_nombre]));
                    viajesCompartidos.forEach(v => { v.remitente_nombre = porId[v.remitente_id] || amigoPorId[v.remitente_id] || 'Un amigo'; });
                }
            } catch (e) {
                console.error('Error cargando viajes compartidos:', e);
            }
        }

        function abrirCompartirViajeModal(tripId) {
            const t = getTrip(tripId);
            if (!t) return;
            if (!amigos.length) { showToast('Añade primero un amigo desde el apartado Amigos', true); return; }
            showModal(`
                <div class="modal-title">Compartir "${escapeHtml(t.title)}"</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Se enviará tal como está ahora: lugares, itinerario y listas. Si luego cambias el viaje, no se actualizará lo ya enviado.</div>
                <div class="modal-label">Con quién</div>
                <select id="compartir-viaje-amigo" class="modal-input">
                    ${amigos.map(a => `<option value="${a.friend_id}">${escapeHtml(a.nombre_visible || a.friend_nombre || 'Amigo')}</option>`).join('')}
                </select>
                <div class="modal-label">Nota (opcional)</div>
                <textarea id="compartir-viaje-nota" class="modal-input" rows="3" placeholder="Algo que quieras contarle sobre el viaje"></textarea>
                <button class="btn-modal-primary" onclick="enviarViajeCompartido('${tripId}')">Enviar viaje</button>
            `);
        }

        async function enviarViajeCompartido(tripId) {
            const t = getTrip(tripId);
            if (!t) return;
            const destinatarioId = document.getElementById('compartir-viaje-amigo')?.value;
            const nota = document.getElementById('compartir-viaje-nota')?.value?.trim() || null;
            if (!destinatarioId) { showToast('Elige con quién compartirlo', true); return; }
            const { data: { user } } = await sb.auth.getUser();
            if (!user) return;
            // No se incluyen documentos (archivos en Storage, no triviales
            // de copiar a otro usuario) ni gastos (información económica
            // personal que no tiene sentido compartir por defecto).
            const viaje = {
                title: t.title, destination: t.destination || '',
                startDate: t.startDate || '', endDate: t.endDate || '',
                places: Array.isArray(t.places) ? t.places.map(p => ({ nombre: p.nombre })) : [],
                itinerario: Array.isArray(t.itinerario) ? t.itinerario.map(it => ({ dia: it.dia, hora: it.hora, titulo: it.titulo, notas: it.notas })) : [],
                listas: Array.isArray(t.listas) ? t.listas.map(l => ({ nombre: l.nombre, items: (l.items || []).map(i => ({ texto: i.texto })) })) : []
            };
            try {
                const { error } = await sb.from('viajes_compartidos').insert({
                    remitente_id: user.id,
                    destinatario_id: destinatarioId,
                    viaje,
                    nota
                });
                if (error) throw error;
                closeModal();
                showToast('Viaje compartido');
            } catch (e) {
                console.error('Error compartiendo el viaje:', e);
                showToast('No se pudo compartir el viaje', true);
            }
        }

        async function quitarViajeCompartido(id) {
            viajesCompartidos = viajesCompartidos.filter(v => v.id !== id);
            if (typeof updateNotifBadge === 'function') updateNotifBadge();
            try {
                const { error } = await sb.from('viajes_compartidos').delete().eq('id', id);
                if (error) console.error('Error quitando el viaje compartido en Supabase:', error);
            } catch (e) {
                console.error('Error quitando el viaje compartido:', e);
            }
        }

        async function anadirViajeCompartidoAMisViajes(id) {
            const v = viajesCompartidos.find(x => x.id === id);
            if (!v) return;
            const viaje = v.viaje || {};
            entries.push({
                id: 'entry_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                type: 'travel',
                title: viaje.title || 'Viaje compartido',
                destination: viaje.destination || '',
                startDate: viaje.startDate || '', endDate: viaje.endDate || '',
                companions: '', expenses: [],
                notes: v.nota ? `Compartido por ${v.remitente_nombre || 'un amigo'}: ${v.nota}` : `Compartido por ${v.remitente_nombre || 'un amigo'}`,
                places: (viaje.places || []).map(p => ({ id: 'place_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), nombre: p.nombre, visitado: false })),
                itinerario: (viaje.itinerario || []).map(it => ({ id: 'it_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), dia: it.dia || '', hora: it.hora || '', titulo: it.titulo, notas: it.notas || '' })),
                listas: (viaje.listas || []).map(l => ({ id: 'lista_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), nombre: l.nombre, items: (l.items || []).map(i => ({ id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), texto: i.texto, hecho: false })) })),
                createdAt: new Date().toISOString()
            });
            filteredEntries = [...entries];
            try { await saveData(); } catch (e) { console.error(e); }
            await quitarViajeCompartido(id);
            render();
            showToast('Viaje añadido a los tuyos');
        }

        async function descartarViajeCompartido(id) {
            if (!confirm('¿Descartar este viaje compartido?')) return;
            await quitarViajeCompartido(id);
            render();
            showToast('Viaje descartado');
        }

        function renderSharedTripsSection() {
            if (!viajesCompartidos.length) return '';
            return `
                <div style="margin-bottom:18px">
                    <div style="font-size:13px;font-weight:600;margin-bottom:8px">Viajes compartidos contigo (${viajesCompartidos.length})</div>
                    ${viajesCompartidos.map(v => {
                        const viaje = v.viaje || {};
                        return `
                        <div class="trip-card" style="background:transparent;border-style:dashed">
                            <div style="font-weight:700;font-size:15px;color:var(--text-primary)">${escapeHtml(viaje.title || 'Viaje')}</div>
                            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${escapeHtml(viaje.destination || '')}${viaje.startDate ? ' · ' + escapeHtml(formatTravelRange(viaje.startDate, viaje.endDate)) : ''}</div>
                            <div style="font-size:11px;color:var(--text-secondary);margin-top:6px">De ${escapeHtml(v.remitente_nombre || 'un amigo')}</div>
                            ${v.nota ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;font-style:italic">"${escapeHtml(v.nota)}"</div>` : ''}
                            <div style="display:flex;gap:8px;margin-top:10px">
                                <button class="btn-modal-primary" style="width:auto;padding:6px 12px;font-size:12px" onclick="anadirViajeCompartidoAMisViajes('${v.id}')">+ Añadir a mis viajes</button>
                                <button class="btn-secondary" style="width:auto;padding:6px 12px;font-size:12px" onclick="descartarViajeCompartido('${v.id}')">Descartar</button>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            `;
        }

