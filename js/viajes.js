        // ============================================================
        //  RENDER: TRAVELS
        // ============================================================
        let travelPlacesTab = 'travels';
        function setTravelPlacesTab(tab) { travelPlacesTab = tab; render(); }

        // Próximo / En curso / Completado / Sin fecha — según hoy respecto al
        // rango del viaje. Se usa tanto en la tarjeta de la lista como en la
        // cabecera del Gestor de viaje.
        function tripStatus(t) {
            const hoy = todayISO();
            if (!t.startDate) return { label: 'Sin fecha', color: 'var(--text-secondary)' };
            if (t.startDate > hoy) return { label: 'Próximo', color: '#3b82f6' };
            if (!t.endDate || t.endDate >= hoy) return { label: 'En curso', color: '#f59e0b' };
            return { label: 'Completado', color: '#16a34a' };
        }

        function getTrip(id) { return entries.find(e => e.id === id && e.type === 'travel'); }

        // Icono propio de Viajes — misma familia sólida/geométrica que los
        // iconos de Finanzas (ritmo/largo plazo/metas), a modo de logo fijo
        // para toda tarjeta de viaje.
        const TRAVEL_ICON_MOUNTAIN = '<svg viewBox="0 0 100 80" fill="currentColor"><path d="M4 76 L32 16 C34 12 40 12 42 16 L54 40 L62 28 C64 25 68 25 70 28 L96 76 Z"/></svg>';

        function renderTravels() {
            if (window._openTripId) {
                const t = getTrip(window._openTripId);
                if (t) return renderTripManager(t);
                window._openTripId = null;
            }

            const travels = entries.filter(e => e.type === 'travel');
            const places = entries.filter(e => e.type === 'place');

            let html = `
                <div style="max-width:820px">
                    <div style="margin-bottom:16px">
                        <div style="font-size:20px;font-weight:700">Viajes</div>
                        <div style="font-size:12px;color:var(--text-secondary)">Tus viajes y lugares, con su propio gestor: lugares que ver, itinerario, documentos y listas.</div>
                    </div>
                    ${renderSharedTripsSection()}
                    <div class="culture-tabs">
                        <button class="culture-tab ${travelPlacesTab === 'travels' ? 'active' : ''}" onclick="setTravelPlacesTab('travels')">
                            <span>Viajes</span><span class="culture-tab-count">${travels.length}</span>
                        </button>
                        <button class="culture-tab ${travelPlacesTab === 'places' ? 'active' : ''}" onclick="setTravelPlacesTab('places')">
                            <span>Lugares</span><span class="culture-tab-count">${places.length}</span>
                        </button>
                    </div>
                    <div class="culture-tab-content">
            `;

            if (travelPlacesTab === 'travels') {
                if (!travels.length) {
                    html += `<div class="empty-state"><div class="empty-title">ningún viaje todavía.</div><div class="empty-sub"><span class="solo-escritorio">Pulsa el botón + y selecciona "Viaje"</span><span class="solo-movil">Añade el primero con el botón de arriba.</span></div></div>`;
                } else {
                    const orden = { 'En curso': 0, 'Próximo': 1, 'Sin fecha': 2, 'Completado': 3 };
                    const ordenados = [...travels].sort((a, b) => {
                        const sa = tripStatus(a), sb = tripStatus(b);
                        if (orden[sa.label] !== orden[sb.label]) return orden[sa.label] - orden[sb.label];
                        return (b.startDate || '').localeCompare(a.startDate || '');
                    });
                    html += `<div class="line-row-list">`;
                    ordenados.forEach(t => {
                        const status = tripStatus(t);
                        const places2 = Array.isArray(t.places) ? t.places : [];
                        const listas2 = Array.isArray(t.listas) ? t.listas : [];
                        const itemsTotal = listas2.reduce((s, l) => s + (l.items || []).length, 0);
                        const itemsHechos = listas2.reduce((s, l) => s + (l.items || []).filter(i => i.hecho).length, 0);
                        const dateObj = t.startDate ? new Date(t.startDate + 'T00:00:00') : null;
                        const extra = [];
                        if (places2.length) extra.push(`${places2.filter(p => p.visitado).length}/${places2.length} lugares`);
                        if (itemsTotal) extra.push(`${itemsHechos}/${itemsTotal} preparativos`);
                        html += `
                            <div class="line-row" onclick="switchView('travels');openTripManager('${t.id}')">
                                <div class="line-row-date">
                                    <div class="line-row-date-day">${dateObj ? String(dateObj.getDate()).padStart(2, '0') : '–'}</div>
                                    ${dateObj ? `<div class="line-row-date-month">${dateObj.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}</div>` : ''}
                                </div>
                                <div class="line-row-icon">${TRAVEL_ICON_MOUNTAIN}</div>
                                <div class="line-row-body">
                                    <div class="line-row-title"><span class="line-row-title-text">${escapeHtml(t.title)}</span></div>
                                    <div class="line-row-meta">${escapeHtml(t.destination || '')}${t.startDate ? ' · ' + escapeHtml(formatTravelRange(t.startDate, t.endDate)) : ''}${extra.length ? ' · ' + extra.join(' · ') : ''}</div>
                                </div>
                                <div class="line-row-side"><span class="trip-status-badge" style="--badge-color:${status.color}">${status.label}</span></div>
                            </div>`;
                    });
                    html += `</div>`;
                }
            } else {
                html += renderPlaces();
            }

            html += `</div></div>`;
            return html;
        }

        // ============================================================
        //  GESTOR DE VIAJES
        // ============================================================
        let tripManagerTab = 'resumen';
        let tripDocumentsCache = {};

        function openTripManager(id) {
            window._openTripId = id;
            tripManagerTab = 'resumen';
            render();
        }
        function closeTripManager() {
            window._openTripId = null;
            render();
        }
        function setTripManagerTab(tab) {
            tripManagerTab = tab;
            render();
        }

        async function deleteTripFromManager(id) {
            if (!confirm('¿Eliminar este viaje? Se perderán sus lugares, itinerario, documentos y listas.')) return;
            entries = entries.filter(e => e.id !== id);
            filteredEntries = [...entries];
            window._openTripId = null;
            render();
            try {
                await saveData();
                showToast('Viaje eliminado');
            } catch (err) {
                console.error('Error eliminando el viaje en Supabase:', err);
                showToast('No se pudo eliminar en la nube. Revisa tu conexión.', true);
            }
        }

        function renderTripManager(t) {
            if (!Array.isArray(t.places)) t.places = [];
            if (!Array.isArray(t.itinerario)) t.itinerario = [];
            if (!Array.isArray(t.listas)) t.listas = [];
            if (!Array.isArray(t.transportes)) t.transportes = [];
            if (!Array.isArray(t.alojamientos)) t.alojamientos = [];

            const status = tripStatus(t);
            const tabs = [
                { id: 'resumen', label: 'Resumen' },
                { id: 'reservas', label: 'Reservas', count: t.transportes.length + t.alojamientos.length },
                { id: 'lugares', label: 'Lugares', count: t.places.length },
                { id: 'itinerario', label: 'Itinerario', count: t.itinerario.length },
                { id: 'mapa', label: 'Mapa', count: t.itinerario.filter(i => i.lat && i.lon).length },
                { id: 'documentos', label: 'Documentos' },
                { id: 'listas', label: 'Listas', count: t.listas.length },
            ];

            let body = '';
            if (tripManagerTab === 'resumen') body = renderTripResumenTab(t);
            else if (tripManagerTab === 'reservas') body = renderTripReservasTab(t);
            else if (tripManagerTab === 'lugares') body = renderTripPlacesTab(t);
            else if (tripManagerTab === 'itinerario') body = renderTripItineraryTab(t);
            else if (tripManagerTab === 'mapa') body = renderTripMapTab(t);
            else if (tripManagerTab === 'documentos') body = renderTripDocumentsTab(t);
            else if (tripManagerTab === 'listas') body = renderTripListsTab(t);

            return `
            <div style="max-width:820px">
                <button class="btn-secondary" style="width:auto;margin-bottom:14px" onclick="closeTripManager()">← Volver a Viajes</button>
                <div class="trip-manager-header">
                    <div>
                        <span class="trip-status-badge" style="--badge-color:${status.color}">${status.label}</span>
                        <div class="trip-manager-title">${escapeHtml(t.title)}</div>
                        <div class="trip-manager-sub">${escapeHtml(t.destination || '')}${t.startDate ? ' · ' + escapeHtml(formatTravelRange(t.startDate, t.endDate)) : ''}</div>
                    </div>
                    <div style="display:flex;gap:8px;flex-shrink:0">
                        <button class="btn-secondary" style="width:auto" onclick="abrirCompartirViajeModal('${t.id}')">Compartir</button>
                        <button class="btn-secondary" style="width:auto" onclick="openEditEntry('${t.id}')">✎ Editar</button>
                        <button class="btn-secondary btn-danger-pill" style="width:auto" onclick="deleteTripFromManager('${t.id}')">Eliminar</button>
                    </div>
                </div>
                <div class="culture-tabs" style="margin-top:16px">
                    ${tabs.map(tb => `<button class="culture-tab ${tripManagerTab === tb.id ? 'active' : ''}" onclick="setTripManagerTab('${tb.id}')"><span>${tb.label}</span>${tb.count !== undefined ? `<span class="culture-tab-count">${tb.count}</span>` : ''}</button>`).join('')}
                </div>
                <div class="culture-tab-content"><div class="cal-view-anim">${body}</div></div>
            </div>`;
        }

        // ---- Resumen ----
        function renderTripResumenTab(t) {
            const total = getTravelTotal(t);
            const itemsTotal = t.listas.reduce((s, l) => s + (l.items || []).length, 0);
            const itemsHechos = t.listas.reduce((s, l) => s + (l.items || []).filter(i => i.hecho).length, 0);
            return `
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:16px">
                    <div class="card"><div class="card-title">Reservas</div><div class="card-value">${t.transportes.length + t.alojamientos.length}</div></div>
                    <div class="card"><div class="card-title">Lugares</div><div class="card-value">${t.places.filter(p => p.visitado).length}/${t.places.length}</div></div>
                    <div class="card"><div class="card-title">Itinerario</div><div class="card-value">${t.itinerario.length}</div></div>
                    <div class="card"><div class="card-title">Preparativos</div><div class="card-value">${itemsHechos}/${itemsTotal}</div></div>
                    ${total > 0 ? `<div class="card"><div class="card-title">Gasto total</div><div class="card-value">${total.toLocaleString('es-ES')}€</div></div>` : ''}
                </div>
                ${t.companions ? `<div class="entry-detail-field" style="margin-bottom:12px"><div class="entry-detail-label">Viajé con</div><div class="entry-detail-value">${escapeHtml(t.companions)}</div></div>` : ''}
                ${t.notes ? `<div class="entry-detail-field"><div class="entry-detail-label">Notas</div><div class="entry-detail-value">${linkifyText(t.notes)}</div></div>` : '<div class="empty-state"><div class="empty-title">sin notas todavía.</div><div class="empty-sub">Pulsa "Editar" arriba para añadir notas generales del viaje.</div></div>'}
            `;
        }

        // ---- Reservas: transportes y alojamientos ----
        const TRANSPORTE_TIPOS = { avion: 'avión', tren: 'tren', bus: 'autobús', coche: 'coche', barco: 'barco', otro: 'otro' };
        function fechaHoraViaje(v) {
            if (!v) return '';
            const [d, h] = String(v).split('T');
            const f = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) : d;
            return f + (h ? ' · ' + h.slice(0, 5) : '');
        }
        function renderTripReservasTab(t) {
            const transportes = [...t.transportes].sort((a, b) => (a.salida || '').localeCompare(b.salida || ''));
            const alojamientos = [...t.alojamientos].sort((a, b) => (a.entrada || '').localeCompare(b.entrada || ''));
            const dato = (k, v) => v ? `<div class="viaje-reserva-dato"><span>${k}</span>${escapeHtml(v)}</div>` : '';
            return `
                <div class="viaje-reservas-cabecera">
                    <div class="viaje-reservas-titulo">transportes.</div>
                    <button class="btn-secondary" style="width:auto" onclick="openAddTransporte('${t.id}')">+ Añadir</button>
                </div>
                ${transportes.length ? transportes.map(x => `
                    <div class="card viaje-reserva">
                        <div class="viaje-reserva-top">
                            <div style="min-width:0">
                                <div class="viaje-reserva-meta">${escapeHtml(TRANSPORTE_TIPOS[x.tipo] || x.tipo || 'transporte')}${x.compania ? ' · ' + escapeHtml(x.compania) : ''}${x.numero ? ' · ' + escapeHtml(x.numero) : ''}</div>
                                <div class="viaje-reserva-ruta">${escapeHtml(x.origen || '?')} → ${escapeHtml(x.destino || '?')}</div>
                            </div>
                            <button class="friend-remove-btn" title="Eliminar" onclick="deleteTripReserva('${t.id}','transportes','${x.id}')">✕</button>
                        </div>
                        <div class="viaje-reserva-datos">
                            ${dato('salida', fechaHoraViaje(x.salida))}
                            ${dato('llegada', fechaHoraViaje(x.llegada))}
                            ${dato('reserva', x.reserva)}
                            ${dato('asiento', x.asiento)}
                        </div>
                        ${x.notas ? `<div class="viaje-reserva-notas">${linkifyText(x.notas)}</div>` : ''}
                    </div>
                `).join('') : '<div class="viaje-reservas-vacio">Sin transportes todavía.</div>'}
                <div class="viaje-reservas-cabecera" style="margin-top:22px">
                    <div class="viaje-reservas-titulo">alojamiento.</div>
                    <button class="btn-secondary" style="width:auto" onclick="openAddAlojamiento('${t.id}')">+ Añadir</button>
                </div>
                ${alojamientos.length ? alojamientos.map(x => `
                    <div class="card viaje-reserva">
                        <div class="viaje-reserva-top">
                            <div style="min-width:0">
                                <div class="viaje-reserva-ruta">${escapeHtml(x.nombre || 'alojamiento')}</div>
                                ${x.direccion ? `<div class="viaje-reserva-meta" style="margin-top:2px">${escapeHtml(x.direccion)}</div>` : ''}
                            </div>
                            <button class="friend-remove-btn" title="Eliminar" onclick="deleteTripReserva('${t.id}','alojamientos','${x.id}')">✕</button>
                        </div>
                        <div class="viaje-reserva-datos">
                            ${dato('entrada', fechaHoraViaje(x.entrada))}
                            ${dato('salida', fechaHoraViaje(x.salida))}
                            ${dato('reserva', x.reserva)}
                        </div>
                        ${x.notas ? `<div class="viaje-reserva-notas">${linkifyText(x.notas)}</div>` : ''}
                    </div>
                `).join('') : '<div class="viaje-reservas-vacio">Sin alojamiento todavía.</div>'}
            `;
        }
        function openAddTransporte(tripId) {
            showModal(`
                <div class="modal-title">transporte.</div>
                <div class="modal-row">
                    <div><div class="modal-label">Tipo</div><select id="tr-tipo" class="modal-input">${Object.entries(TRANSPORTE_TIPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
                    <div><div class="modal-label">Compañía</div><input id="tr-compania" class="modal-input" placeholder="Iberia, Renfe..."></div>
                </div>
                <div class="modal-row">
                    <div><div class="modal-label">Origen</div><input id="tr-origen" class="modal-input" placeholder="Madrid"></div>
                    <div><div class="modal-label">Destino</div><input id="tr-destino" class="modal-input" placeholder="Roma"></div>
                </div>
                <div class="modal-row">
                    <div><div class="modal-label">Salida</div><input type="datetime-local" id="tr-salida" class="modal-input"></div>
                    <div><div class="modal-label">Llegada</div><input type="datetime-local" id="tr-llegada" class="modal-input"></div>
                </div>
                <div class="modal-row">
                    <div><div class="modal-label">Nº de vuelo / tren</div><input id="tr-numero" class="modal-input"></div>
                    <div><div class="modal-label">Reserva</div><input id="tr-reserva" class="modal-input" placeholder="Localizador"></div>
                </div>
                <div class="modal-label">Asiento (opcional)</div><input id="tr-asiento" class="modal-input">
                <div class="modal-label">Notas (opcional)</div><textarea id="tr-notas" class="modal-input" rows="2" placeholder="Terminal, equipaje, puerta..."></textarea>
                <button class="btn-modal-primary" onclick="saveTripReserva('${tripId}','transportes')">Guardar</button>
            `);
        }
        function openAddAlojamiento(tripId) {
            showModal(`
                <div class="modal-title">alojamiento.</div>
                <div class="modal-label">Nombre</div><input id="al-nombre" class="modal-input" placeholder="Hotel, apartamento...">
                <div class="modal-label">Dirección (opcional)</div><input id="al-direccion" class="modal-input">
                <div class="modal-row">
                    <div><div class="modal-label">Entrada</div><input type="datetime-local" id="al-entrada" class="modal-input"></div>
                    <div><div class="modal-label">Salida</div><input type="datetime-local" id="al-salida" class="modal-input"></div>
                </div>
                <div class="modal-label">Reserva (opcional)</div><input id="al-reserva" class="modal-input" placeholder="Nº de confirmación">
                <div class="modal-label">Notas (opcional)</div><textarea id="al-notas" class="modal-input" rows="2" placeholder="Check-in, desayuno, contacto..."></textarea>
                <button class="btn-modal-primary" onclick="saveTripReserva('${tripId}','alojamientos')">Guardar</button>
            `);
        }
        async function saveTripReserva(tripId, lista) {
            const t = getTrip(tripId); if (!t) return;
            const v = id => document.getElementById(id)?.value.trim() || '';
            const item = lista === 'transportes'
                ? { tipo: v('tr-tipo'), compania: v('tr-compania'), numero: v('tr-numero'), origen: v('tr-origen'), destino: v('tr-destino'), salida: v('tr-salida'), llegada: v('tr-llegada'), reserva: v('tr-reserva'), asiento: v('tr-asiento'), notas: v('tr-notas') }
                : { nombre: v('al-nombre'), direccion: v('al-direccion'), entrada: v('al-entrada'), salida: v('al-salida'), reserva: v('al-reserva'), notas: v('al-notas') };
            if (lista === 'transportes' ? !(item.origen || item.destino) : !item.nombre) { showToast(lista === 'transportes' ? 'Indica origen o destino' : 'Escribe el nombre', true); return; }
            if (!Array.isArray(t[lista])) t[lista] = [];
            t[lista].push({ id: (lista === 'transportes' ? 'tr_' : 'al_') + Date.now() + '_' + Math.random().toString(36).slice(2, 6), ...item });
            closeModal();
            try { await saveData(); } catch (e) { console.error(e); }
            render();
        }
        async function deleteTripReserva(tripId, lista, itemId) {
            const t = getTrip(tripId); if (!t) return;
            t[lista] = (t[lista] || []).filter(x => x.id !== itemId);
            try { await saveData(); } catch (e) { console.error(e); }
            render();
        }

        // Los puntos del itinerario que llegan por el conector traen el
        // lugar sin coordenadas: se localizan al aplicarse, uno a uno
        // (Nominatim pide no más de una consulta por segundo).
        async function geocodificarItinerarioViaje(t) {
            const pendientes = (t?.itinerario || []).filter(i => i.lugar && !i.lat);
            if (!pendientes.length) return;
            for (const it of pendientes) {
                const c = await geocodePlace(it.lugar);
                if (c) { it.lat = c.lat; it.lon = c.lon; }
                await new Promise(r => setTimeout(r, 1100));
            }
            try { await saveData(); } catch (e) { console.error(e); }
            if (window._openTripId === t.id) render();
        }

        // ---- Lugares ----
        function renderTripPlacesTab(t) {
            return `
                <div class="friend-add-row" style="margin-bottom:14px">
                    <input type="text" id="trip-place-input-${t.id}" class="modal-input" style="margin:0" placeholder="Sitio que quieres ver" onkeydown="if(event.key==='Enter'){event.preventDefault();addTripPlace('${t.id}')}">
                    <button class="btn-secondary" style="width:auto" onclick="addTripPlace('${t.id}')">+ Añadir</button>
                </div>
                ${t.places.length ? t.places.map(p => `
                    <div class="trip-check-row">
                        <input type="checkbox" ${p.visitado ? 'checked' : ''} onchange="toggleTripPlace('${t.id}','${p.id}')">
                        <span style="flex:1;cursor:pointer;${p.visitado ? 'text-decoration:line-through;opacity:.5' : ''}" onclick="toggleTripPlace('${t.id}','${p.id}')">${escapeHtml(p.nombre)}</span>
                        <button class="friend-remove-btn" title="Quitar" onclick="deleteTripPlace('${t.id}','${p.id}')">✕</button>
                    </div>
                `).join('') : '<div class="empty-state"><div class="empty-title">ningún lugar todavía.</div><div class="empty-sub">Añade los sitios que quieres visitar.</div></div>'}
            `;
        }
        async function addTripPlace(tripId) {
            const input = document.getElementById('trip-place-input-' + tripId);
            const nombre = input?.value.trim();
            if (!nombre) return;
            const t = getTrip(tripId); if (!t) return;
            if (!Array.isArray(t.places)) t.places = [];
            t.places.push({ id: 'place_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), nombre, visitado: false });
            try { await saveData(); } catch (e) { console.error(e); }
            render();
        }
        async function toggleTripPlace(tripId, placeId) {
            const t = getTrip(tripId); if (!t) return;
            const p = (t.places || []).find(x => x.id === placeId); if (!p) return;
            p.visitado = !p.visitado;
            try { await saveData(); } catch (e) { console.error(e); }
            render();
        }
        async function deleteTripPlace(tripId, placeId) {
            const t = getTrip(tripId); if (!t) return;
            t.places = (t.places || []).filter(x => x.id !== placeId);
            try { await saveData(); } catch (e) { console.error(e); }
            render();
        }

        // ---- Itinerario ----
        function renderTripItineraryTab(t) {
            const sorted = [...t.itinerario].sort((a, b) => (a.dia || '').localeCompare(b.dia || '') || (a.hora || '').localeCompare(b.hora || ''));
            return `
                <button class="btn-modal-primary" style="width:auto;margin-bottom:14px" onclick="openAddItineraryItem('${t.id}')">+ Añadir al itinerario</button>
                ${sorted.length ? sorted.map(it => `
                    <div class="card" style="margin-bottom:10px">
                        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
                            <div style="min-width:0">
                                <div style="font-size:11px;color:var(--text-secondary);font-weight:600">${it.dia ? escapeHtml(new Date(it.dia + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })) : 'Sin día'}${it.hora ? ' · ' + escapeHtml(it.hora) : ''}</div>
                                <div style="font-weight:600;margin-top:2px">${escapeHtml(it.titulo)}</div>
                                ${it.lugar ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">📍 ${escapeHtml(it.lugar)}${it.lat ? '' : ' · localizando...'}</div>` : ''}
                                ${it.notas ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${linkifyText(it.notas)}</div>` : ''}
                            </div>
                            <button class="friend-remove-btn" title="Eliminar" onclick="deleteItineraryItem('${t.id}','${it.id}')">✕</button>
                        </div>
                    </div>
                `).join('') : '<div class="empty-state"><div class="empty-title">sin itinerario todavía.</div><div class="empty-sub">Añade horarios y planes para cada día del viaje.</div></div>'}
            `;
        }
        // ---- Mapa del itinerario ----
        function renderTripMapTab(t) {
            const withCoords = [...t.itinerario].filter(i => i.lat && i.lon)
                .sort((a, b) => (a.dia || '').localeCompare(b.dia || '') || (a.hora || '').localeCompare(b.hora || ''));
            if (!withCoords.length) {
                return `<div class="empty-state"><div class="empty-title">ningún lugar en el mapa todavía.</div><div class="empty-sub">Añade un "Lugar" al crear un punto del itinerario y aparecerá aquí en cuanto se localice.</div></div>`;
            }
            return `<div id="trip-map" class="trip-map-container"></div>`;
        }

        let _tripMapInstance = null;
        function initTripMap(t) {
            const container = document.getElementById('trip-map');
            if (!container || typeof L === 'undefined') return;
            if (_tripMapInstance) { _tripMapInstance.remove(); _tripMapInstance = null; }
            const withCoords = [...t.itinerario].filter(i => i.lat && i.lon)
                .sort((a, b) => (a.dia || '').localeCompare(b.dia || '') || (a.hora || '').localeCompare(b.hora || ''));
            if (!withCoords.length) return;

            const map = L.map('trip-map');
            _tripMapInstance = map;
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap',
                maxZoom: 19
            }).addTo(map);

            const latlngs = withCoords.map(i => [i.lat, i.lon]);
            withCoords.forEach((it, i) => {
                const dayLabel = it.dia ? new Date(it.dia + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '';
                L.marker([it.lat, it.lon]).addTo(map)
                    .bindPopup(`<strong>${i + 1}. ${escapeHtml(it.titulo)}</strong><br>${escapeHtml(dayLabel)}${it.hora ? ' · ' + escapeHtml(it.hora) : ''}`);
            });
            if (latlngs.length > 1) L.polyline(latlngs, { color: '#3b82f6', weight: 3, opacity: 0.7, dashArray: '6,6' }).addTo(map);
            map.fitBounds(latlngs, { padding: [30, 30] });
        }

        function openAddItineraryItem(tripId) {
            showModal(`
                <div class="modal-title">Añadir al itinerario</div>
                <div class="modal-row">
                    <div><div class="modal-label">Día</div><input type="date" id="it-dia" class="modal-input"></div>
                    <div><div class="modal-label">Hora (opcional)</div><input type="time" id="it-hora" class="modal-input"></div>
                </div>
                <div class="modal-label">Qué</div><input id="it-titulo" class="modal-input" placeholder="Visita al Coliseo">
                <div class="modal-label">Lugar (opcional, para el mapa)</div><input id="it-lugar" class="modal-input" placeholder="Colosseo, Roma">
                <div class="modal-label">Notas (opcional)</div><textarea id="it-notas" class="modal-input" rows="2"></textarea>
                <button class="btn-modal-primary" onclick="saveItineraryItem('${tripId}')">Guardar</button>
            `);
        }
        // Geocodifica un texto de lugar a lat/lon vía Nominatim (OpenStreetMap,
        // gratuito y sin API key). Falla en silencio: sin lugar geocodificado
        // el ítem simplemente no aparece en el mapa, pero sigue en la lista.
        async function geocodePlace(query) {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
                const data = await res.json();
                if (data && data[0]) return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
            } catch (e) { console.error('Error geocodificando lugar:', e); }
            return null;
        }
        async function saveItineraryItem(tripId) {
            const t = getTrip(tripId); if (!t) return;
            const titulo = document.getElementById('it-titulo')?.value.trim();
            const lugar = document.getElementById('it-lugar')?.value.trim() || '';
            if (!titulo) { showToast('Escribe qué vas a hacer', true); return; }
            if (!Array.isArray(t.itinerario)) t.itinerario = [];
            const item = {
                lugar,
                id: 'it_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                dia: document.getElementById('it-dia')?.value || '',
                hora: document.getElementById('it-hora')?.value || '',
                titulo,
                notas: document.getElementById('it-notas')?.value.trim() || ''
            };
            t.itinerario.push(item);
            closeModal();
            try { await saveData(); } catch (e) { console.error(e); }
            render();
            showToast('Añadido al itinerario');

            if (lugar) {
                const coords = await geocodePlace(lugar);
                if (coords) {
                    item.lat = coords.lat;
                    item.lon = coords.lon;
                    if (tripManagerTab === 'mapa') render();
                    try { await saveData(); } catch (e) { console.error(e); }
                }
            }
        }
        async function deleteItineraryItem(tripId, itemId) {
            const t = getTrip(tripId); if (!t) return;
            t.itinerario = (t.itinerario || []).filter(i => i.id !== itemId);
            try { await saveData(); } catch (e) { console.error(e); }
            render();
        }

        // ---- Documentos (reutiliza el bucket "documents" con prefijo por viaje) ----
        function renderTripDocumentsTab(t) {
            const docs = tripDocumentsCache[t.id];
            return `
                <div class="doc-upload-box" onclick="document.getElementById('trip-doc-input-${t.id}').click()">
                    <div style="font-size:28px;margin-bottom:6px">📄</div>
                    <div style="font-weight:500;margin-bottom:4px;color:var(--text-primary)">Sube un documento de este viaje</div>
                    <div style="font-size:12px;color:var(--text-secondary)">Billetes, reservas, seguro de viaje... (PDF o HTML)</div>
                </div>
                <input type="file" id="trip-doc-input-${t.id}" accept="application/pdf,.pdf,.html,.htm,text/html" style="display:none" onchange="handleTripDocUpload(event,'${t.id}')">
                <div id="trip-doc-list-${t.id}" style="margin-top:12px">${docs ? renderTripDocList(t.id, docs) : 'Cargando documentos...'}</div>
            `;
        }
        function renderTripDocList(tripId, docs) {
            if (!docs.length) return '<div class="empty-state"><div class="empty-title">ningún documento todavía.</div><div class="empty-sub">Sube el primero con el botón de arriba</div></div>';
            return docs.map(doc => {
                const sizeKb = doc.metadata?.size ? Math.round(doc.metadata.size / 1024) + ' KB' : '';
                const date = doc.created_at ? new Date(doc.created_at).toLocaleDateString('es-ES') : '';
                const isHtml = /\.html?$/i.test(doc.name);
                const openBtn = isHtml
                    ? `<button class="doc-action-download" onclick="openEntryDocHtml('trips','${tripId}','${escapeHtml(doc.name)}')">Ver</button>`
                    : `<button class="doc-action-download" onclick="downloadTripDocument('${tripId}','${escapeHtml(doc.name)}')">Descargar</button>`;
                return `<div class="doc-item">
                    <div class="doc-info"><span style="font-size:20px">${isHtml ? '▥' : '📄'}</span><div style="min-width:0"><div class="doc-name">${escapeHtml(doc.name)}</div><div class="doc-meta">${date}${sizeKb ? ' · ' + sizeKb : ''}</div></div></div>
                    <div class="doc-actions">
                        ${openBtn}
                        <button class="doc-action-delete-btn" title="Eliminar" onclick="deleteTripDocument('${tripId}','${escapeHtml(doc.name)}')">✕</button>
                    </div>
                </div>`;
            }).join('');
        }
        async function loadTripDocuments(tripId) {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const { data, error } = await sb.storage.from('documents').list(`${user.id}/trips/${tripId}`, { sortBy: { column: 'created_at', order: 'desc' } });
                if (error) throw error;
                tripDocumentsCache[tripId] = data || [];
                const el = document.getElementById('trip-doc-list-' + tripId);
                if (el) el.innerHTML = renderTripDocList(tripId, tripDocumentsCache[tripId]);
            } catch (e) {
                console.error('Error cargando documentos del viaje:', e);
                const el = document.getElementById('trip-doc-list-' + tripId);
                if (el) el.innerHTML = '<div class="empty-state"><div class="empty-title">no se pudieron cargar los documentos.</div></div>';
            }
        }
        async function handleTripDocUpload(event, tripId) {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;
            const isHtml = file.type === 'text/html' || /\.html?$/i.test(file.name);
            const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
            if (!isPdf && !isHtml) { showToast('Solo se admiten archivos PDF o HTML', true); return; }
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/trips/${tripId}/${Date.now()}_${sanitizeStorageFilename(file.name)}`;
                const { error } = await sb.storage.from('documents').upload(path, file, isHtml ? { upsert: false, contentType: 'text/html' } : { upsert: false });
                if (error) throw error;
                showToast('Documento subido');
                await loadTripDocuments(tripId);
            } catch (e) {
                console.error('Error subiendo documento del viaje:', e);
                showToast('Error al subir: ' + (e?.message || 'desconocido'), true);
            }
        }
        async function downloadTripDocument(tripId, name) {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/trips/${tripId}/${name}`;
                const { data, error } = await sb.storage.from('documents').createSignedUrl(path, 60);
                if (error) throw error;
                window.open(data.signedUrl, '_blank');
            } catch (e) {
                console.error('Error descargando documento del viaje:', e);
                showToast('Error al descargar: ' + (e?.message || 'desconocido'), true);
            }
        }
        async function deleteTripDocument(tripId, name) {
            if (!confirm('¿Eliminar este documento? No se puede deshacer.')) return;
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/trips/${tripId}/${name}`;
                const { error } = await sb.storage.from('documents').remove([path]);
                if (error) throw error;
                showToast('Documento eliminado');
                await loadTripDocuments(tripId);
            } catch (e) {
                console.error('Error eliminando documento del viaje:', e);
                showToast('Error al eliminar: ' + (e?.message || 'desconocido'), true);
            }
        }

        // ---- Documentos de trabajo (contratos, nóminas...), mismo patrón que los de viaje ----
        let workDocumentsCache = {};
        function renderWorkDocList(workId, docs) {
            if (!docs.length) return '<div class="empty-state"><div class="empty-title">ningún documento todavía.</div><div class="empty-sub">Sube el primero con el botón de arriba</div></div>';
            return docs.map(doc => {
                const sizeKb = doc.metadata?.size ? Math.round(doc.metadata.size / 1024) + ' KB' : '';
                const date = doc.created_at ? new Date(doc.created_at).toLocaleDateString('es-ES') : '';
                return `<div class="doc-item">
                    <div class="doc-info"><div style="min-width:0"><div class="doc-name">${escapeHtml(doc.name)}</div><div class="doc-meta">${date}${sizeKb ? ' · ' + sizeKb : ''}</div></div></div>
                    <div class="doc-actions">
                        <button class="doc-action-download" onclick="downloadWorkDocument('${workId}','${escapeHtml(doc.name)}')">Descargar</button>
                        <button class="doc-action-delete-btn" title="Eliminar" onclick="deleteWorkDocument('${workId}','${escapeHtml(doc.name)}')">✕</button>
                    </div>
                </div>`;
            }).join('');
        }
        async function loadWorkDocuments(workId) {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const { data, error } = await sb.storage.from('documents').list(`${user.id}/work/${workId}`, { sortBy: { column: 'created_at', order: 'desc' } });
                if (error) throw error;
                workDocumentsCache[workId] = data || [];
                const el = document.getElementById('work-doc-list-' + workId);
                if (el) el.innerHTML = renderWorkDocList(workId, workDocumentsCache[workId]);
            } catch (e) {
                console.error('Error cargando documentos del trabajo:', e);
                const el = document.getElementById('work-doc-list-' + workId);
                if (el) el.innerHTML = '<div class="empty-state"><div class="empty-title">no se pudieron cargar los documentos.</div></div>';
            }
        }
        async function handleWorkDocUpload(event, workId) {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;
            if (file.type !== 'application/pdf') { showToast('Solo se admiten archivos PDF', true); return; }
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/work/${workId}/${Date.now()}_${file.name}`;
                const { error } = await sb.storage.from('documents').upload(path, file, { upsert: false });
                if (error) throw error;
                showToast('Documento subido');
                await loadWorkDocuments(workId);
            } catch (e) {
                console.error('Error subiendo documento del trabajo:', e);
                showToast('Error al subir: ' + (e?.message || 'desconocido'), true);
            }
        }
        async function downloadWorkDocument(workId, name) {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/work/${workId}/${name}`;
                const { data, error } = await sb.storage.from('documents').createSignedUrl(path, 60);
                if (error) throw error;
                window.open(data.signedUrl, '_blank');
            } catch (e) {
                console.error('Error descargando documento del trabajo:', e);
                showToast('Error al descargar: ' + (e?.message || 'desconocido'), true);
            }
        }
        async function deleteWorkDocument(workId, name) {
            if (!confirm('¿Eliminar este documento? No se puede deshacer.')) return;
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/work/${workId}/${name}`;
                const { error } = await sb.storage.from('documents').remove([path]);
                if (error) throw error;
                showToast('Documento eliminado');
                await loadWorkDocuments(workId);
            } catch (e) {
                console.error('Error eliminando documento del trabajo:', e);
                showToast('Error al eliminar: ' + (e?.message || 'desconocido'), true);
            }
        }

        // ---- Listas (varias, con nombre propio: qué llevar, qué hacer...) ----
        function renderTripListsTab(t) {
            return `
                <button class="btn-modal-primary" style="width:auto;margin-bottom:14px" onclick="openAddTripList('${t.id}')">+ Nueva lista</button>
                ${t.listas.length ? t.listas.map(l => `
                    <div class="card" style="margin-bottom:14px">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                            <div style="font-weight:700">${escapeHtml(l.nombre)} <span style="font-weight:400;color:var(--text-secondary);font-size:12px">(${(l.items || []).filter(i => i.hecho).length}/${(l.items || []).length})</span></div>
                            <button class="friend-remove-btn" title="Eliminar lista" onclick="deleteTripList('${t.id}','${l.id}')">✕</button>
                        </div>
                        ${(l.items || []).map(i => `
                            <div class="trip-check-row">
                                <input type="checkbox" ${i.hecho ? 'checked' : ''} onchange="toggleTripListItem('${t.id}','${l.id}','${i.id}')">
                                <span style="flex:1;cursor:pointer;${i.hecho ? 'text-decoration:line-through;opacity:.5' : ''}" onclick="toggleTripListItem('${t.id}','${l.id}','${i.id}')">${escapeHtml(i.texto)}</span>
                                <button class="friend-remove-btn" title="Quitar" onclick="deleteTripListItem('${t.id}','${l.id}','${i.id}')">✕</button>
                            </div>
                        `).join('')}
                        <div style="display:flex;gap:8px;margin-top:10px">
                            <input id="trip-list-item-${l.id}" class="modal-input" style="margin:0" placeholder="Añadir elemento" onkeydown="if(event.key==='Enter'){event.preventDefault();addTripListItem('${t.id}','${l.id}')}">
                            <button class="btn-secondary" style="width:auto" onclick="addTripListItem('${t.id}','${l.id}')">+ Añadir</button>
                        </div>
                    </div>
                `).join('') : '<div class="empty-state"><div class="empty-title">ninguna lista todavía.</div><div class="empty-sub">Crea una lista de qué llevar, qué hacer o lo que necesites.</div></div>'}
            `;
        }
        function openAddTripList(tripId) {
            showModal(`<div class="modal-title">Nueva lista</div><div class="modal-label">Nombre</div><input id="new-list-name" class="modal-input" placeholder="Qué llevar"><button class="btn-modal-primary" onclick="saveTripList('${tripId}')">Crear</button>`);
        }
        async function saveTripList(tripId) {
            const t = getTrip(tripId); if (!t) return;
            const nombre = document.getElementById('new-list-name')?.value.trim();
            if (!nombre) { showToast('Ponle un nombre a la lista', true); return; }
            if (!Array.isArray(t.listas)) t.listas = [];
            t.listas.push({ id: 'lista_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), nombre, items: [] });
            closeModal();
            try { await saveData(); } catch (e) { console.error(e); }
            render();
            showToast('Lista creada');
        }
        async function deleteTripList(tripId, listId) {
            if (!confirm('¿Eliminar esta lista?')) return;
            const t = getTrip(tripId); if (!t) return;
            t.listas = (t.listas || []).filter(l => l.id !== listId);
            try { await saveData(); } catch (e) { console.error(e); }
            render();
        }
        async function addTripListItem(tripId, listId) {
            const input = document.getElementById('trip-list-item-' + listId);
            const texto = input?.value.trim();
            if (!texto) return;
            const t = getTrip(tripId); if (!t) return;
            const l = (t.listas || []).find(x => x.id === listId); if (!l) return;
            if (!Array.isArray(l.items)) l.items = [];
            l.items.push({ id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), texto, hecho: false });
            try { await saveData(); } catch (e) { console.error(e); }
            render();
        }
        async function toggleTripListItem(tripId, listId, itemId) {
            const t = getTrip(tripId); if (!t) return;
            const l = (t.listas || []).find(x => x.id === listId); if (!l) return;
            const it = (l.items || []).find(x => x.id === itemId); if (!it) return;
            it.hecho = !it.hecho;
            try { await saveData(); } catch (e) { console.error(e); }
            render();
        }
        async function deleteTripListItem(tripId, listId, itemId) {
            const t = getTrip(tripId); if (!t) return;
            const l = (t.listas || []).find(x => x.id === listId); if (!l) return;
            l.items = (l.items || []).filter(x => x.id !== itemId);
            try { await saveData(); } catch (e) { console.error(e); }
            render();
        }

