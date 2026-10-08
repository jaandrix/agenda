        // ============================================================
        //  RENDER: EVENTS
        // ============================================================
        const EVENT_ICONS = { social: '◈', teatro: '◊', cine: '▸', concierto: '♪', deporte: '◉', otro: '◈' };

        function nextUpcomingEvent(events) {
            const today = todayISO();
            const upcoming = events.filter(e => e.date && e.date >= today)
                .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
            return upcoming[0] || null;
        }

        function eventCountdownLabel(dateStr) {
            const days = Math.round((new Date(dateStr + 'T00:00:00') - new Date(todayISO() + 'T00:00:00')) / 86400000);
            if (days <= 0) return 'Hoy';
            if (days === 1) return 'Mañana';
            return `En ${days} días`;
        }

        function openEventsImportModal() {
            showModal(`
                <div class="modal-title">Importar eventos</div>

                <div class="events-section-label" style="margin-top:0">Desde un calendario (.ics)</div>
                <div class="doc-upload-box" onclick="document.getElementById('ics-import-input').click()">
                    <div style="font-weight:500;margin-bottom:4px;color:var(--text-primary)">Elegir archivo .ics</div>
                    <div style="font-size:12px;color:var(--text-secondary)">Exportado desde Google Calendar, Apple Calendar u Outlook</div>
                </div>
                <input type="file" id="ics-import-input" accept=".ics,text/calendar" style="display:none" onchange="handleIcsImport(event)">

                <div class="events-section-label" style="margin-top:22px">O pega texto</div>
                <textarea id="events-text-import" class="modal-input" rows="1" placeholder="Pega aquí líneas EVENTO|fecha|hora|tipo|título|lugar|notas..." style="margin-bottom:8px;resize:vertical;min-height:38px;overflow:hidden" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
                <button class="btn-secondary" style="width:auto;margin:0;padding:7px 14px;font-size:12px;border-radius:14px" onclick="processEventsTextImport()">Procesar texto</button>
                <div style="font-size:10px;color:var(--text-secondary);margin-top:6px">Formato: EVENTO|AAAA-MM-DD|HH:MM|tipo|título|lugar|notas — hora, lugar y notas pueden ir vacíos. Tipo: ${Object.keys(EVENT_TYPE_LABELS).join('/')}. El prompt para generar estas líneas a partir de una foto o un enlace está guardado en Ajustes → Prompts guardados.</div>
                <div id="events-import-summary" style="font-size:12px;margin-top:8px;color:var(--text-secondary)"></div>
            `);
        }

        // Formato .ics (RFC 5545): primero se "desdoblan" las líneas partidas
        // (una línea que empieza por espacio es continuación de la
        // anterior), y luego se recorren los bloques BEGIN:VEVENT/END:VEVENT
        // sacando solo los campos que hacen falta. Los eventos recurrentes
        // (RRULE) no se expanden: se importa únicamente la fecha base de
        // cada VEVENT, no cada repetición futura.
        function parseIcs(text) {
            const unfolded = text.replace(/\r\n/g, '\n').split('\n').reduce((lines, line) => {
                if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length) {
                    lines[lines.length - 1] += line.slice(1);
                } else {
                    lines.push(line);
                }
                return lines;
            }, []);

            const events = [];
            let cur = null;
            unfolded.forEach(line => {
                if (line.trim() === 'BEGIN:VEVENT') { cur = {}; return; }
                if (line.trim() === 'END:VEVENT') { if (cur) events.push(cur); cur = null; return; }
                if (!cur) return;
                const idx = line.indexOf(':');
                if (idx === -1) return;
                const key = line.slice(0, idx).split(';')[0].trim().toUpperCase();
                const value = line.slice(idx + 1);
                if (key === 'SUMMARY') cur.summary = value;
                else if (key === 'LOCATION') cur.location = value;
                else if (key === 'DESCRIPTION') cur.description = value;
                else if (key === 'DTSTART') cur.dtstart = value;
            });
            return events;
        }

        function icsUnescape(s) {
            return (s || '').replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
        }

        function handleIcsImport(event) {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async function (e) {
                try {
                    const vevents = parseIcs(String(e.target.result));
                    if (!vevents.length) { showToast('No se han encontrado eventos en ese archivo .ics', true); return; }

                    let added = 0, duplicates = 0, errors = 0;
                    vevents.forEach((ev, i) => {
                        const title = icsUnescape(ev.summary).trim();
                        const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/.exec(ev.dtstart || '');
                        if (!title || !m) { errors++; return; }
                        const date = `${m[1]}-${m[2]}-${m[3]}`;
                        const time = m[4] ? `${m[4]}:${m[5]}` : '';
                        const place = icsUnescape(ev.location).trim();
                        const notes = icsUnescape(ev.description).trim();

                        if (entries.some(en => en.type === 'event' && en.title === title && en.date === date)) { duplicates++; return; }
                        entries.push({ id: 'evt_ics_' + Date.now() + '_' + i, type: 'event', title, eventType: 'otro', date, time, place, notes });
                        added++;
                    });

                    closeModal();
                    render();
                    showToast(`Importados ${added} evento${added === 1 ? '' : 's'}` +
                        (duplicates ? ` · ${duplicates} ya existían` : '') +
                        (errors ? ` · ${errors} sin título o fecha válida` : ''));
                    try { await saveData(); } catch (err) { console.error('Error guardando eventos importados de .ics:', err); showToast('No se pudo guardar en la nube', true); }
                } catch (err) {
                    console.error('Error importando .ics:', err);
                    showToast('Error al leer el archivo .ics', true);
                }
            };
            reader.readAsText(file);
        }

        // Mismo patrón que otros importadores de texto de la app: líneas con
        // campos separados por "|", pensadas para pegar de golpe lo que
        // genere el prompt de importación de eventos (guardado en Ajustes →
        // Prompts guardados). Duplicados = mismo título y misma fecha ya
        // existentes, para poder pegar el mismo bloque dos veces sin miedo.
        function processEventsTextImport() {
            const ta = document.getElementById('events-text-import');
            const raw = ta.value.trim();
            if (!raw) { showToast('Pega primero el texto a importar', true); return; }
            const validTypes = Object.keys(EVENT_TYPE_LABELS);
            let added = 0, errors = 0, duplicates = 0;

            raw.split('\n').map(l => l.trim()).filter(Boolean).forEach((line, i) => {
                const p = line.split('|').map(s => s.trim());
                if ((p[0] || '').toUpperCase() !== 'EVENTO' || p.length < 5) { errors++; return; }
                const date = p[1];
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors++; return; }
                const time = /^\d{1,2}:\d{2}$/.test(p[2]) ? p[2] : '';
                let eventType = (p[3] || '').toLowerCase();
                if (!validTypes.includes(eventType)) eventType = 'otro';
                const title = p[4] || '';
                if (!title) { errors++; return; }
                const place = p[5] || '';
                const notes = p[6] || '';

                if (entries.some(e => e.type === 'event' && e.title === title && e.date === date)) { duplicates++; return; }
                entries.push({ id: 'evt_text_' + Date.now() + '_' + i, type: 'event', title, eventType, date, time, place, notes });
                added++;
            });

            render();
            const summaryEl = document.getElementById('events-import-summary');
            if (summaryEl) {
                summaryEl.textContent = `Importados: ${added}` +
                    (duplicates ? ` · ${duplicates} ya existían` : '') +
                    (errors ? ` · ${errors} línea${errors === 1 ? '' : 's'} con error` : '');
            }
            saveData().catch(e => { console.error('Error guardando eventos importados:', e); showToast('No se pudo guardar en la nube', true); });
        }

        function renderEvents() {
            const allEvents = entries.filter(e => e.type === 'event' && !isCalendarLogEntry(e));
            if (!allEvents.length) {
                return `<div style="max-width:980px"><button class="btn-secondary btn-acento" style="width:auto" onclick="openEventsImportModal()">Importar eventos</button></div><div class="empty-state"><div class="empty-title">Sin eventos</div><div class="empty-sub"><span class="solo-escritorio">Pulsa el botón + y selecciona "Evento", o importa arriba</span><span class="solo-movil">Añade el primero con el botón de arriba.</span></div></div>`;
            }
            const { items: events, banner } = applyMonthFilterTo('event', allEvents);
            if (!events.length) return banner + `<div class="empty-state"><div class="empty-title">Sin eventos ese mes</div></div>`;

            const next = entryMonthFilter && entryMonthFilter.type === 'event' ? null : nextUpcomingEvent(events);

            let html = `<div style="max-width:980px">` + banner;

            if (next) {
                const isToday = next.date === todayISO();
                const todayEvents = isToday
                    ? events.filter(e => e.date === next.date).sort((a, b) => (a.time || '').localeCompare(b.time || ''))
                    : [next];
                const kicker = `próximo evento ${eventCountdownLabel(next.date).toLowerCase()}.`;

                if (todayEvents.length > 1) {
                    // Los trabajos/exámenes (entradas sincronizadas desde
                    // Estudios) van en su propia columna a la derecha; el
                    // resto de eventos normales, a la izquierda.
                    const renderRow = e => {
                        const t = EVENT_TYPE_LABELS[e.eventType] || '';
                        const icon = EVENT_TYPE_ICONS[e.eventType] || EVENT_TYPE_ICONS.otro;
                        return `<div class="event-hero-multi-row" data-open-entry="${e.id}">
                            <div class="event-hero-multi-icon">${icon}</div>
                            <div class="event-hero-multi-body">
                                <div class="event-hero-multi-title">${escapeHtml(e.title)}</div>
                                <div class="event-hero-multi-meta">${t ? escapeHtml(t) + ' · ' : ''}${e.time ? escapeHtml(e.time) : 'sin hora'}${e.place ? ' · ' + escapeHtml(e.place) : ''}</div>
                            </div>
                        </div>`;
                    };
                    const studyLinked = it => it.linkedKind === 'assignments' || it.linkedKind === 'exams';
                    const leftEvents = todayEvents.filter(e => !studyLinked(e));
                    const rightEvents = todayEvents.filter(studyLinked);
                    html += `
                        <div class="event-hero event-hero-flat event-hero-multi">
                            <div class="event-hero-kicker" style="margin-bottom:8px">${kicker} · ${todayEvents.length} eventos</div>
                            <div class="event-hero-multi-columns">
                                <div class="event-hero-multi-col">
                                    ${leftEvents.length ? `<div class="event-hero-multi-list">${leftEvents.map(renderRow).join('')}</div>` : '<div class="event-hero-multi-empty">Sin eventos.</div>'}
                                </div>
                                <div class="event-hero-multi-col">
                                    <div class="event-hero-multi-col-label">trabajos./exámenes.</div>
                                    ${rightEvents.length ? `<div class="event-hero-multi-list">${rightEvents.map(renderRow).join('')}</div>` : '<div class="event-hero-multi-empty">Nada pendiente.</div>'}
                                </div>
                            </div>
                        </div>`;
                } else {
                    const nextType = EVENT_TYPE_LABELS[next.eventType] || '';
                    html += `
                        <div class="event-hero event-hero-flat" data-open-entry="${next.id}">
                            <div class="event-hero-body">
                                <div class="event-hero-kicker">${kicker}</div>
                                <div class="event-hero-title">${escapeHtml(next.title)}</div>
                                <div class="event-hero-meta">${nextType ? escapeHtml(nextType) + ' · ' : ''}${escapeHtml(next.date)}${next.time ? ' · ' + escapeHtml(next.time) : ''}${next.place ? ' · ' + escapeHtml(next.place) : ''}</div>
                            </div>
                            ${next.entradas?.length ? `<button class="event-hero-entrada" onclick="event.stopPropagation();abrirEntradas('${next.id}')">${ENTRADA_ICONO}<span>entrada.</span></button>` : `<div class="event-hero-icon">${EVENT_HERO_ICON_ALERT}</div>`}
                        </div>`;
                }
            }

            html += `
                <div class="events-toolbar">
                    <input type="text" id="events-search-input" class="modal-input" style="margin:0;max-width:260px" placeholder="Buscar por título o lugar..." value="${escapeHtml(eventsSearchQuery)}" oninput="setEventsSearchQuery(this.value)">
                    ${renderEventsFiltro()}
                    <button class="btn-secondary btn-acento" style="width:auto" onclick="openEventsImportModal()">Importar eventos</button>
                </div>
                <div id="events-list-content">${renderEventsListContent(events)}</div>
            </div>`;
            return html;
        }

        // Recalcula solo la lista (próximos/pasados) filtrada por tipo y
        // búsqueda, sin volver a pintar el buscador — así el campo de texto
        // no pierde el foco ni el cursor mientras escribes.
        function renderEventsListContent(events) {
            const q = stripAccents(eventsSearchQuery.toLowerCase().trim());
            let filtered = events;
            if (eventsTypeFilter !== 'all') filtered = filtered.filter(e => eventCoincideFiltro(e, eventsTypeFilter));
            if (q) {
                filtered = filtered.filter(e =>
                    stripAccents((e.title || '').toLowerCase()).includes(q) ||
                    stripAccents((e.place || '').toLowerCase()).includes(q)
                );
            }

            const today = todayISO();
            const upcoming = filtered.filter(e => e.date && e.date >= today)
                .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
            const past = filtered.filter(e => !e.date || e.date < today)
                .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

            const hayFiltro = eventsTypeFilter !== 'all' || !!q;
            let html = `<div class="events-section-label">Próximos${upcoming.length ? ` (${upcoming.length})` : ''}</div>`;
            html += upcoming.length
                ? renderEventsMonthColumns(upcoming, { reverse: false })
                : `<div class="events-empty-note">Sin eventos próximos${hayFiltro ? ' con este filtro.' : '.'}</div>`;

            if (past.length) {
                html += `<button class="events-past-toggle" onclick="toggleEventsShowPast()">${eventsShowPast ? 'Ocultar pasados' : `Mostrar pasados (${past.length})`}</button>`;
                if (eventsShowPast) html += renderEventsMonthColumns(past, { reverse: true });
            }
            return html;
        }

        // Agrupa eventos por mes en columnas separadas (una por mes) en vez
        // de una única rejilla larga — cada columna lleva su propio
        // encabezado "mes. (n)" y sus tarjetas ordenadas por día.
        function renderEventsMonthColumns(events, opts) {
            const reverse = opts && opts.reverse;
            const groups = [];
            const byKey = {};
            events.forEach(e => {
                const key = (e.date || '').slice(0, 7) || 'sin-fecha';
                if (!byKey[key]) { byKey[key] = { key, items: [] }; groups.push(byKey[key]); }
                byKey[key].items.push(e);
            });
            groups.sort((a, b) => reverse ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key));
            const monthLabel = key => {
                if (key === 'sin-fecha') return 'sin fecha';
                const [y, m] = key.split('-').map(Number);
                return new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long' });
            };
            return groups.map(g => `
                <div class="events-month-section">
                    <div class="events-month-col-title"><span class="events-month-col-title-text">${escapeHtml(monthLabel(g.key))}.</span> <span class="events-month-col-count">(${g.items.length})</span></div>
                    <div class="events-month-row">
                        ${g.items.sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(e => renderEventSquareCard(e)).join('')}
                    </div>
                </div>
            `).join('');
        }

        function renderEventSquareCard(e) {
            const cat = categories.find(c => c.id === e.categoryId);
            const color = cat?.color || 'var(--text-secondary)';
            const typeLabel = EVENT_TYPE_LABELS[e.eventType] || '';
            const icon = EVENT_TYPE_ICONS[e.eventType] || EVENT_TYPE_ICONS.otro;
            const day = e.date ? e.date.slice(8, 10) : '–';
            const isPast = e.date && e.date < todayISO();
            // El número del día se tiñe de naranja a granate a medida que se
            // acerca el evento: a 3, 2 y 1 día(s) y el propio día.
            const diasHasta = e.date ? Math.round((new Date(e.date + 'T12:00:00') - new Date(todayISO() + 'T12:00:00')) / 86400000) : null;
            const cercania = diasHasta >= 0 && diasHasta <= 3 ? ` event-sq-day-en-${diasHasta}` : '';
            return `
                <div class="event-sq-card ${isPast ? 'event-sq-card-past' : ''}" data-open-entry="${e.id}" data-categoria="${eventCategoria(e.eventType)}">
                    <div class="event-sq-icon">${icon}</div>
                    <div class="event-sq-body">
                        <div class="event-sq-title">${escapeHtml(e.title)}</div>
                        <div class="event-sq-meta"><span class="event-sq-dot" style="background:${color}"></span>${escapeHtml(typeLabel || e.place || 'Evento')}${e.time ? `,&nbsp;<em>${escapeHtml(e.time)}.</em>` : ''}</div>
                    </div>
                    ${e.entradas?.length && !isPast ? `<button class="event-sq-entrada" title="Ver entrada" onclick="event.stopPropagation();abrirEntradas('${e.id}')">${ENTRADA_ICONO}</button>` : ''}
                    <div class="event-sq-day${cercania}" ${cercania ? `title="${diasHasta === 0 ? 'Hoy' : diasHasta === 1 ? 'Mañana' : 'En ' + diasHasta + ' días'}"` : ''}>${day}</div>
                </div>`;
        }

        // ============================================================
        //  CINE → PELÍCULA VISTA
        //  Tres horas después de empezar un evento de cine (21:00 si no
        //  tiene hora) se crea solo la tarjeta de película vista, sin
        //  valorar, y una tarea de hoy en el planificador para valorarla.
        //  Solo para cines de las últimas 48 h: así los cines antiguos de
        //  antes de existir esto no se convierten todos de golpe. El evento
        //  guarda peliculaId para no convertirse dos veces.
        // ============================================================
        function convertirCinesEnPeliculas() {
            if (!Array.isArray(entries) || !entries.length) return;
            const ahora = Date.now();
            const nuevas = [];
            entries.filter(e => e && e.type === 'event' && e.eventType === 'cine' && e.date && !e.peliculaId && !isCalendarLogEntry(e)).forEach(ev => {
                const inicio = new Date(`${ev.date}T${/^\d{2}:\d{2}/.test(ev.time || '') ? ev.time.slice(0, 5) : '21:00'}:00`).getTime();
                if (Number.isNaN(inicio) || ahora < inicio + 3 * 3600000 || ahora - inicio > 48 * 3600000) return;
                const titulo = String(ev.title || '').replace(/^(cine|película|peli)\s*[:·\-–—]\s*/i, '').trim() || ev.title || 'Película';
                const peli = { id: 'entry_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), title: titulo, type: 'movie', date: ev.date, categoryId: getCategoryIdForType('movie'), tags: [], rating: 0, notes: '' };
                entries.push(peli);
                ev.peliculaId = peli.id;
                const ya = new Date();
                plannerItemsForOffset(0).push({
                    id: 'planner_valorar_' + peli.id,
                    time: `${String(ya.getHours()).padStart(2, '0')}:${String(ya.getMinutes()).padStart(2, '0')}`,
                    title: 'valorar la película. ' + titulo,
                    notes: '', done: false,
                    valorarPeliculaId: peli.id
                });
                nuevas.push(titulo);
            });
            if (!nuevas.length) return;
            filteredEntries = [...entries];
            render();
            showToast(nuevas.length === 1 ? `«${nuevas[0]}» añadida a películas vistas · valórala cuando puedas` : `${nuevas.length} películas añadidas a vistas`);
            saveData().catch(e => console.error(e));
        }

        // Valorar la película (guardarla con nota) da por hecha su tarea.
        function completarTareaValorarPelicula(peliculaId) {
            Object.values(dayPlanner?.days || {}).forEach(lista => (lista || []).forEach(it => {
                if (it.valorarPeliculaId === peliculaId) it.done = true;
            }));
        }

        // ============================================================
        //  ENTRADAS (QR)
        //  Un evento puede llevar una o varias entradas. Se sube una
        //  captura, el QR se lee en el propio navegador (jsQR) y solo se
        //  guarda su contenido, no la imagen. Para enseñarlo en la puerta
        //  se regenera nítido (qrcode-generator) a partir de los MISMOS
        //  bytes leídos (qrB64), no del texto reinterpretado: si el QR
        //  original llevaba bytes que no son UTF-8, regenerarlo desde el
        //  texto produciría otro código y el lector lo rechazaría.
        // ============================================================
        const ENTRADA_ICONO = '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M8 22h84v19a9 9 0 0 0 0 18v19H8V59a9 9 0 0 0 0-18zM60 30v8h7v-8zm0 16v8h7v-8zm0 16v8h7v-8z"/></svg>';
        const SCRIPTS_CARGADOS = {};

        function cargarScript(url) {
            if (!SCRIPTS_CARGADOS[url]) SCRIPTS_CARGADOS[url] = new Promise((resolve, reject) => {
                const sc = document.createElement('script');
                sc.src = url; sc.onload = resolve;
                sc.onerror = () => { delete SCRIPTS_CARGADOS[url]; reject(new Error('No se pudo cargar ' + url)); };
                document.head.appendChild(sc);
            });
            return SCRIPTS_CARGADOS[url];
        }

        // Con varias personas el editor va guiando "entrada 2 de 2"; no
        // limita: se pueden añadir más o menos entradas que personas.
        function renderEntradasEditor() {
            const lista = window._entradasDraft || [];
            const personas = window._personasEvento || 1;
            const siguiente = lista.length + 1;
            const textoSubir = personas > 1 && siguiente <= personas ? `subir QR · entrada ${siguiente} de ${personas}.` : 'subir captura del QR.';
            return `
                ${lista.map((x, i) => `
                    <div class="entrada-editor-fila">
                        <span class="entrada-editor-icono">${ENTRADA_ICONO}</span>
                        <input class="modal-input entrada-editor-etiqueta" value="${escapeHtml(x.etiqueta || '')}" placeholder="Entrada ${i + 1}${personas > 1 ? ' de ' + personas : ''} · p. ej. fila 12, asiento 8" oninput="window._entradasDraft[${i}].etiqueta = this.value">
                        <button type="button" class="planner-item-delete" title="Quitar entrada" onclick="quitarEntradaDraft(${i})">×</button>
                    </div>`).join('')}
                ${personas > 1 ? `<div class="entrada-editor-progreso">${Math.min(lista.length, personas)} de ${personas} entradas añadidas.</div>` : ''}
                <div class="entrada-editor-acciones">
                    <button type="button" class="entrada-editor-add" onclick="document.getElementById('entradas-input').click()">${ENTRADA_ICONO}<span>${textoSubir}</span></button>
                    <button type="button" class="entrada-editor-add" onclick="pegarEntradaDelPortapapeles()"><span>pegar.</span></button>
                </div>
                <div class="entrada-editor-nota">También puedes pegarla con Ctrl + V mientras este formulario está abierto.</div>`;
        }

        function quitarEntradaDraft(i) {
            window._entradasDraft.splice(i, 1);
            document.getElementById('entradas-editor').innerHTML = renderEntradasEditor();
        }

        async function anadirEntradaDesdeImagen(ev) {
            const file = ev.target.files?.[0];
            ev.target.value = '';
            if (file) await procesarImagenEntrada(file);
        }

        // Pegar una captura recortada (Win+Mayús+S, captura del correo...)
        // sin tener que guardarla antes: Ctrl+V con el formulario del evento
        // abierto, o el botón "pegar." (API del portapapeles, que el
        // navegador puede pedir permiso para usar).
        document.addEventListener('paste', e => {
            if (!document.getElementById('entradas-editor')) return;
            const item = [...(e.clipboardData?.items || [])].find(it => it.type.startsWith('image/'));
            if (!item) return;
            e.preventDefault();
            procesarImagenEntrada(item.getAsFile());
        });

        async function pegarEntradaDelPortapapeles() {
            try {
                const items = await navigator.clipboard.read();
                for (const it of items) {
                    const tipo = it.types.find(t => t.startsWith('image/'));
                    if (tipo) { await procesarImagenEntrada(await it.getType(tipo)); return; }
                }
                showToast('No hay ninguna imagen en el portapapeles', true);
            } catch (e) {
                console.error(e);
                showToast('Usa Ctrl + V para pegar la captura', true);
            }
        }

        async function procesarImagenEntrada(file) {
            try {
                await cargarScript('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js');
                const img = await createImageBitmap(file);
                // Las capturas de móvil son enormes; a 1600px el QR sigue
                // siendo legible y la lectura es mucho más rápida.
                const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * escala);
                canvas.height = Math.round(img.height * escala);
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const datos = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const codigo = window.jsQR(datos.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
                if (!codigo || !codigo.binaryData?.length) { showToast('No he encontrado ningún QR en esa imagen', true); return; }
                const qrB64 = btoa(String.fromCharCode(...codigo.binaryData));
                if ((window._entradasDraft || []).some(x => x.qrB64 === qrB64)) { showToast('Esa entrada ya está añadida', true); return; }
                const nueva = { id: 'ent_' + Date.now(), qr: codigo.data || '', qrB64, etiqueta: '' };
                // Se guarda ya generado: en la puerta de un estadio puede no
                // haber cobertura para descargar el generador del QR.
                nueva.svg = await qrEntradaSvg(nueva);
                window._entradasDraft.push(nueva);
                document.getElementById('entradas-editor').innerHTML = renderEntradasEditor();
                showToast('Entrada añadida · se guardará con el evento');
            } catch (e) {
                console.error(e);
                showToast('No se pudo leer la imagen', true);
            }
        }

        async function qrEntradaSvg(entrada) {
            await cargarScript('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js');
            const bytes = entrada.qrB64 ? atob(entrada.qrB64) : unescape(encodeURIComponent(entrada.qr || ''));
            const anterior = window.qrcode.stringToBytes;
            window.qrcode.stringToBytes = str => Array.from(str, ch => ch.charCodeAt(0) & 0xff);
            let qr;
            try {
                // Corrección de errores alta (H, hasta un 30 % del código
                // ilegible) para poder tapar el centro con la «B.»: el lector
                // de la puerta reconstruye lo que queda debajo. El contenido
                // es el mismo, solo cambia el dibujo.
                qr = window.qrcode(0, 'H');
                qr.addData(bytes, 'Byte');
                qr.make();
            } finally {
                window.qrcode.stringToBytes = anterior;
            }
            const n = qr.getModuleCount(), margen = 4, lado = n + margen * 2, centro = lado / 2;
            const radio = Math.max(2.6, n * 0.13);
            let d = '';
            for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
                if (!qr.isDark(r, c)) continue;
                if (Math.hypot(c + margen + 0.5 - centro, r + margen + 0.5 - centro) < radio + 0.9) continue;
                d += `M${c + margen} ${r + margen}h1v1h-1z`;
            }
            return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" data-logo="b" role="img" aria-label="Código QR de la entrada"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#111" shape-rendering="crispEdges"/><circle cx="${centro}" cy="${centro}" r="${radio.toFixed(2)}" fill="#111"/><text x="${centro}" y="${centro}" dy=".36em" text-anchor="middle" font-family="Poppins, system-ui, sans-serif" font-weight="800" font-size="${(radio * 1.1).toFixed(2)}" fill="#3b82f6">B.</text></svg>`;
        }

        async function abrirEntradas(eventId, indice = 0) {
            const ev = entries.find(e => e.id === eventId);
            const lista = ev?.entradas || [];
            if (!lista.length) return;
            const i = (indice + lista.length) % lista.length;
            const entrada = lista[i];
            let svg = entrada.svg;
            // Las entradas guardadas antes de llevar la «B.» se redibujan al
            // abrirlas y se guardan ya así; sin conexión se enseña la de antes.
            if (svg && !svg.includes('data-logo="b"')) {
                const nuevo = await qrEntradaSvg(entrada).catch(() => null);
                if (nuevo) { svg = entrada.svg = nuevo; saveData().catch(e => console.error(e)); }
            }
            try { if (!svg) svg = await qrEntradaSvg(entrada); }
            catch (e) { console.error(e); showToast('No se pudo generar el QR (¿sin conexión?)', true); return; }
            const fecha = ev.date ? new Date(ev.date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
            showModal(`
                <div class="entrada-ticket">
                    <div class="entrada-ticket-cabecera">
                        <span class="entrada-ticket-kicker">${ENTRADA_ICONO}entrada.</span>
                        <span class="entrada-ticket-fecha">${escapeHtml(fecha)}</span>
                        <button class="modal-close" onclick="closeModal()">✕</button>
                    </div>
                    <div class="entrada-ticket-titulo">${escapeHtml(ev.title || '')}</div>
                    <div class="entrada-ticket-meta">${[ev.place, ev.time].filter(Boolean).map(escapeHtml).join(' · ')}</div>
                    <div class="entrada-ticket-corte"></div>
                    <div class="entrada-ticket-qr">${svg}</div>
                    ${entrada.etiqueta ? `<div class="entrada-ticket-etiqueta">${escapeHtml(entrada.etiqueta)}</div>` : ''}
                    ${lista.length > 1 ? `
                        <div class="entrada-ticket-nav">
                            <button class="btn-secondary" onclick="abrirEntradas('${ev.id}', ${i - 1})">‹</button>
                            <span>${i + 1} de ${lista.length}</span>
                            <button class="btn-secondary" onclick="abrirEntradas('${ev.id}', ${i + 1})">›</button>
                        </div>` : ''}
                    <div class="entrada-ticket-nota">Sube el brillo de la pantalla para que lo lean a la primera.</div>
                </div>
            `);
        }

        function setEventsSearchQuery(value) {
            eventsSearchQuery = value;
            const allEvents = entries.filter(e => e.type === 'event');
            const { items: events } = applyMonthFilterTo('event', allEvents);
            const container = document.getElementById('events-list-content');
            if (container) container.innerHTML = renderEventsListContent(events);
        }

        // Filtro por tipo de evento recogido en un solo botón "filtro.": el
        // panel nace del propio botón y las opciones aparecen una tras otra.
        // Elegir una actualiza solo la lista (sin volver a pintar la vista)
        // para que el panel pueda cerrarse con su animación.
        const EVENTS_ICONO_FILTRO = '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M8 12h84L58 52v30L42 92V52z"/></svg>';

        function renderEventsFiltroBtn() {
            const activo = eventsTypeFilter !== 'all' ? EVENT_TYPE_LABELS[eventsTypeFilter] : '';
            return `<span class="events-filtro-icono">${EVENTS_ICONO_FILTRO}</span><span>filtro.</span>${activo ? `<span class="events-filtro-activo">${escapeHtml(activo.toLowerCase())}</span>` : ''}`;
        }

        // "deportes." no filtra: abre su propio desplegable con "todos." y
        // cada deporte, que entran escalonados igual que el panel (--j es su
        // posición dentro del grupo). Siempre arranca cerrado al abrir el
        // filtro; si el filtro activo es un deporte, solo queda marcado.
        function renderEventsFiltro() {
            let i = 0;
            const opcion = (t, j) => `
                <button class="events-filtro-opcion ${j !== undefined ? 'events-filtro-sub' : ''} ${t === 'all' ? 'events-filtro-ancha' : ''} ${eventsTypeFilter === t ? 'active' : ''}" data-tipo="${t}" style="--i:${i++};--j:${j || 0}" onclick="setEventsTypeFilter('${t}')">
                    <span class="events-filtro-opcion-icono">${t === 'all' ? EVENTS_ICONO_FILTRO : (EVENT_TYPE_ICONS[t] || EVENT_TYPE_ICONS.otro)}</span><span>${t === 'all' || (t === 'deportes' && j !== undefined) ? 'todos.' : EVENT_TYPE_LABELS[t].toLowerCase() + '.'}</span>
                </button>`;
            const enDeportes = eventsTypeFilter !== 'all' && eventCategoria(eventsTypeFilter) === 'deportes';
            const opciones = ['all', ...EVENT_CATEGORIAS.filter(t => t !== 'deportes'), 'deportes'].map(t => t === 'deportes'
                ? `<div class="events-filtro-grupo ${enDeportes ? 'con-seleccion' : ''}" id="events-filtro-deportes">
                        <button class="events-filtro-opcion events-filtro-grupo-btn" style="--i:${i++}" aria-expanded="false" onclick="toggleEventsFiltroDeportes()">
                            <span class="events-filtro-opcion-icono">${EVENT_TYPE_ICONS.deportes}</span><span>deportes.</span><span class="events-filtro-chevron"><svg viewBox="0 0 100 100" fill="currentColor"><path d="M34 14l12-12 48 48-48 48-12-12 36-36z"/></svg></span>
                        </button>
                        <div class="events-filtro-subs-wrap"><div class="events-filtro-subs">${['deportes', ...EVENT_DEPORTES].map((d, j) => opcion(d, j)).join('')}</div></div>
                    </div>`
                : opcion(t)).join('');
            return `
                <div class="events-filtro" id="events-filtro">
                    <button class="events-filtro-btn ${eventsTypeFilter !== 'all' ? 'con-filtro' : ''}" id="events-filtro-btn" aria-expanded="false" onclick="toggleEventsFiltro()">${renderEventsFiltroBtn()}</button>
                    <div class="events-filtro-panel" role="listbox">${opciones}</div>
                </div>`;
        }

        function cerrarEventsFiltroFuera(e) {
            if (e.type === 'keydown' && e.key !== 'Escape') return;
            if (e.type === 'pointerdown' && document.getElementById('events-filtro')?.contains(e.target)) return;
            toggleEventsFiltro(false);
        }

        function toggleEventsFiltro(abrir) {
            const filtro = document.getElementById('events-filtro');
            if (!filtro) return;
            const abierto = typeof abrir === 'boolean' ? abrir : !filtro.classList.contains('abierto');
            if (abierto) {
                const grupo = document.getElementById('events-filtro-deportes');
                grupo?.classList.remove('abierto');
                grupo?.querySelector('.events-filtro-grupo-btn')?.setAttribute('aria-expanded', 'false');
            }
            filtro.classList.toggle('abierto', abierto);
            document.getElementById('events-filtro-btn')?.setAttribute('aria-expanded', String(abierto));
            document.removeEventListener('pointerdown', cerrarEventsFiltroFuera, true);
            document.removeEventListener('keydown', cerrarEventsFiltroFuera, true);
            if (abierto) {
                document.addEventListener('pointerdown', cerrarEventsFiltroFuera, true);
                document.addEventListener('keydown', cerrarEventsFiltroFuera, true);
            }
        }

        function toggleEventsFiltroDeportes() {
            const grupo = document.getElementById('events-filtro-deportes');
            if (!grupo) return;
            const abierto = grupo.classList.toggle('abierto');
            grupo.querySelector('.events-filtro-grupo-btn')?.setAttribute('aria-expanded', String(abierto));
        }

        function setEventsTypeFilter(type) {
            eventsTypeFilter = type;
            const lista = document.getElementById('events-list-content');
            const filtro = document.getElementById('events-filtro');
            if (!lista || !filtro) { render(); return; }
            const { items: events } = applyMonthFilterTo('event', entries.filter(e => e.type === 'event'));
            lista.innerHTML = renderEventsListContent(events);
            lista.classList.remove('events-lista-fade'); void lista.offsetWidth; lista.classList.add('events-lista-fade');
            document.getElementById('events-filtro-btn').innerHTML = renderEventsFiltroBtn();
            document.getElementById('events-filtro-btn').classList.toggle('con-filtro', type !== 'all');
            filtro.querySelectorAll('.events-filtro-opcion').forEach(b => b.classList.toggle('active', b.dataset.tipo === type));
            document.getElementById('events-filtro-deportes')?.classList.toggle('con-seleccion', type !== 'all' && eventCategoria(type) === 'deportes');
            toggleEventsFiltro(false);
        }

        function toggleEventsShowPast() {
            eventsShowPast = !eventsShowPast;
            render();
        }

        // ============================================================
        //  RENDER: PLACES
        // ============================================================
        function renderPlaces() {
            const places = entries.filter(e => e.type === 'place');
            if (!places.length) {
                return `<div class="empty-state"><div class="empty-title">Sin lugares</div><div class="empty-sub"><span class="solo-escritorio">Pulsa el botón + y selecciona "Lugar"</span><span class="solo-movil">Añade el primero con el botón de arriba.</span></div></div>`;
            }

            const sorted = [...places].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

            let html = `<div style="max-width:700px">`;
            sorted.forEach(p => {
                const cat = categories.find(c => c.id === p.categoryId);
                const color = cat?.color || 'var(--text-secondary)';
                html += `
                    <div class="entry-item" data-open-entry="${p.id}">
                        <div class="entry-color-dot" style="background:${color}"></div>
                        <div class="entry-info">
                            <div class="entry-title">${p.title}</div>
                            <div class="entry-meta">${p.date || 'Sin fecha'}${p.notes ? ' · ' + linkifyText(p.notes) : ''}</div>
                        </div>
                    </div>`;
            });
            html += `</div>`;
            return html;
        }

