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
            const hoy = todayISO();
            const proximos = travels.filter(t => tripStatus(t).label !== 'Completado');
            const completados = travels.filter(t => tripStatus(t).label === 'Completado');
            if (travelPlacesTab === 'travels') travelPlacesTab = 'proximos';
            const pestana = travelPlacesTab;
            // Orden: en curso primero, luego próximos por fecha, luego sin fecha; los completados, del más reciente.
            const peso = t => ({ 'En curso': 0, 'Próximo': 1, 'Sin fecha': 2 })[tripStatus(t).label] ?? 3;
            const listaProx = [...proximos].sort((a, b) => peso(a) - peso(b) || (a.startDate || '9').localeCompare(b.startDate || '9'));
            const listaComp = [...completados].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
            const destacado = listaProx.find(t => ['En curso', 'Próximo'].includes(tripStatus(t).label));
            const lista = pestana === 'completados' ? listaComp : listaProx;
            return `
                <div class="viajes-vista">
                    <div class="vista-cab">
                        <div><div class="vista-cab-titulo">viajes.</div><div class="vista-cab-sub">Planifica lo próximo y conserva lo vivido.</div></div>
                        <div class="vista-cab-acciones">
                            <label class="vista-buscar"><i class="ico ico-buscar" aria-hidden="true"></i><input id="viajes-buscar" class="modal-input" type="search" placeholder="buscar viajes, lugares, notas..." aria-label="Buscar viajes" oninput="filtrarViajes()"></label>
                            <button class="vista-btn principal" onclick="openNewEntry('travel')"><i class="ico ico-mas" aria-hidden="true"></i>nuevo viaje.</button>
                        </div>
                    </div>
                    ${renderViajeDestacado(destacado, places.length)}
                    ${renderSharedTripsSection()}
                    <div class="vista-seg viajes-seg" role="tablist" aria-label="Viajes">
                        <button role="tab" aria-selected="${pestana === 'proximos'}" onclick="setTravelPlacesTab('proximos')">próximos. <span class="vista-contador">${proximos.length}</span></button>
                        <button role="tab" aria-selected="${pestana === 'completados'}" onclick="setTravelPlacesTab('completados')">completados. <span class="vista-contador">${completados.length}</span></button>
                        <button role="tab" aria-selected="${pestana === 'places'}" onclick="setTravelPlacesTab('places')">lugares. <span class="vista-contador">${places.length}</span></button>
                    </div>
                    ${pestana === 'places' ? `<div class="viajes-lugares">${renderPlaces()}</div>` : lista.length ? `
                    <div class="viajes-grid">${lista.map(renderViajeTarjeta).join('')}</div>
                    <div id="viajes-sin-resultados" class="vista-vacio" hidden><b>nada con esa búsqueda.</b><button class="vista-btn" onclick="document.getElementById('viajes-buscar').value='';filtrarViajes()">limpiar búsqueda.</button></div>` : `
                    <div class="vista-vacio">${pestana === 'completados' ? '<b>todavía no hay viajes hechos.</b>Cuando pase la fecha de un viaje, aparecerá aquí con todo lo que guardaste.' : '<b>no hay viajes por delante.</b>Crea uno y ve juntando lugares, itinerario, reservas y listas.'}</div>`}
                </div>`;
        }

        // Preparativos: las cosas de las listas del viaje (maleta, papeles...) hechas frente al total.
        function viajePreparativos(t) {
            const listas = Array.isArray(t.listas) ? t.listas : [];
            const total = listas.reduce((n, l) => n + (l.items || []).length, 0);
            return { total, hechos: listas.reduce((n, l) => n + (l.items || []).filter(i => i.hecho).length, 0) };
        }
        function viajeDias(t) {
            if (!t.startDate) return 0;
            return Math.round((new Date((t.endDate || t.startDate) + 'T12:00:00') - new Date(t.startDate + 'T12:00:00')) / 86400000) + 1;
        }
        // Documentos: solo si ya se han cargado alguna vez (viven en Storage, no en los datos del viaje).
        function viajeDocs(t) { return Array.isArray(tripDocumentsCache[t.id]) ? tripDocumentsCache[t.id].length : null; }

        function renderViajeDestacado(t, nLugares) {
            const mapa = `<svg class="viaje-dest-mapa" viewBox="0 0 400 200" aria-hidden="true"><path d="M-10 150c60-40 90 10 150-30s80-70 140-50 90 40 130 10" /><path d="M-10 175c70-30 100 15 160-20s90-60 150-40 80 30 120 5" /><path d="M-10 125c50-45 95 5 150-35s70-75 135-55 95 45 135 15" /><path class="ruta" d="M70 160c40-10 60-60 110-70s80 20 120-10 40-50 70-55" /><circle class="punto" cx="70" cy="160" r="6" /><circle class="punto" cx="370" cy="25" r="6" /></svg>`;
            if (!t) return `
                <section class="viaje-dest">
                    ${mapa}
                    <div class="viaje-dest-cuerpo">
                        <h2>¿cuál será el próximo?</h2>
                        <p>Empieza a preparar un viaje y reúne lugares, itinerario, reservas y listas en un solo sitio.</p>
                        <div class="viaje-dest-botones">
                            <button class="vista-btn principal" onclick="openNewEntry('travel')"><i class="ico ico-mas" aria-hidden="true"></i>planificar viaje.</button>
                            ${nLugares ? `<button class="vista-btn" onclick="setTravelPlacesTab('places')">ver lugares guardados.</button>` : ''}
                        </div>
                    </div>
                </section>`;
            const st = tripStatus(t);
            const hoy = todayISO();
            const faltan = st.label === 'Próximo' ? Math.round((new Date(t.startDate + 'T12:00:00') - new Date(hoy + 'T12:00:00')) / 86400000) : null;
            const p = viajePreparativos(t);
            const docs = viajeDocs(t);
            return `
                <section class="viaje-dest">
                    ${mapa}
                    <div class="viaje-dest-cuerpo">
                        <h2>${escapeHtml(t.title || t.destination || 'viaje')}</h2>
                        <p>${st.label === 'En curso' ? 'Estás de viaje' : 'Tu próximo viaje'}${t.destination ? `${st.label === 'En curso' ? ' en' : ' a'} ${escapeHtml(t.destination)}` : ''}, ${escapeHtml(formatTravelRange(t.startDate, t.endDate))}.</p>
                        <div class="viaje-dest-datos">
                            ${faltan !== null ? `<div><b>${faltan}</b><span>${faltan === 1 ? 'día para salir.' : 'días para salir.'}</span></div>` : ''}
                            <div><b>${viajeDias(t)}</b><span>${viajeDias(t) === 1 ? 'día de viaje.' : 'días de viaje.'}</span></div>
                            ${p.total ? `<div><b>${p.hechos}/${p.total}</b><span>preparativos.</span><i class="viaje-barra"><i style="width:${Math.round(p.hechos / p.total * 100)}%"></i></i></div>` : ''}
                            ${docs ? `<div><b>${docs}</b><span>${docs === 1 ? 'documento.' : 'documentos.'}</span></div>` : ''}
                        </div>
                        <div class="viaje-dest-botones"><button class="vista-btn principal" onclick="openTripManager('${jsAttr(t.id)}')">abrir viaje.</button></div>
                    </div>
                </section>`;
        }

        function renderViajeTarjeta(t) {
            const st = tripStatus(t);
            const d = t.startDate ? new Date(t.startDate + 'T12:00:00') : null;
            const p = viajePreparativos(t);
            const docs = viajeDocs(t);
            const lugares = (Array.isArray(t.places) ? t.places : []).map(x => x.nombre || x.name || x.title || '').join(' ');
            const texto = [t.title, t.destination, t.notes, lugares, t.companions].filter(Boolean).join(' ');
            const clase = { 'En curso': 'curso', 'Próximo': 'proximo', 'Completado': 'hecho' }[st.label] || 'sin';
            return `
                <div class="viaje-card" data-texto="${escapeHtml(texto)}">
                    <button class="viaje-card-abrir" onclick="openTripManager('${jsAttr(t.id)}')" aria-label="Abrir ${escapeHtml(t.title || 'viaje')}">
                        <span class="viaje-fecha">${d ? `<b>${String(d.getDate()).padStart(2, '0')}</b><span>${d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}</span><small>${d.getFullYear()}</small>` : '<b>?</b><span>sin fecha</span>'}</span>
                        <span class="viaje-card-cuerpo">
                            <b>${escapeHtml(t.title || t.destination || 'viaje')}</b>
                            ${t.destination && t.destination !== t.title ? `<small>${escapeHtml(t.destination)}</small>` : ''}
                            <small>${t.startDate ? escapeHtml(formatTravelRange(t.startDate, t.endDate)) : 'sin fecha todavía'}</small>
                        </span>
                    </button>
                    <button class="vista-icono-btn viaje-card-menu" aria-label="Opciones de ${escapeHtml(t.title || 'viaje')}" aria-haspopup="menu" onclick="menuViaje(this,'${jsAttr(t.id)}')"><i class="ico ico-puntos" aria-hidden="true"></i></button>
                    <div class="viaje-card-pie">
                        ${t.startDate ? `<span>${viajeDias(t)} ${viajeDias(t) === 1 ? 'día' : 'días'}</span>` : ''}
                        <span>${p.total ? `${p.hechos}/${p.total} preparativos` : 'sin preparativos'}</span>
                        ${docs ? `<span>${docs} ${docs === 1 ? 'doc' : 'docs'}</span>` : ''}
                        <span class="viaje-estado ${clase}"><i aria-hidden="true"></i>${st.label.toLowerCase()}.</span>
                    </div>
                    ${p.total ? `<i class="viaje-barra" aria-hidden="true"><i style="width:${Math.round(p.hechos / p.total * 100)}%"></i></i>` : ''}
                </div>`;
        }

        function filtrarViajes() {
            const norm = x => stripAccents(String(x || '').toLowerCase());
            const q = norm(document.getElementById('viajes-buscar')?.value).trim();
            let n = 0;
            document.querySelectorAll('.viajes-vista .viaje-card').forEach(el => { const ok = !q || norm(el.dataset.texto).includes(q); el.hidden = !ok; if (ok) n++; });
            const nada = document.getElementById('viajes-sin-resultados');
            if (nada) nada.hidden = !q || !!n;
        }

        function menuViaje(boton, id) {
            abrirMenuAcciones(boton, [
                ['abrir.', () => openTripManager(id)],
                ['editar los datos.', () => openEditEntry(id)],
                ['duplicar la planificación.', () => duplicarViaje(id)],
                ['eliminar.', () => deleteTripFromManager(id)],
            ]);
        }

        // Copia lugares, itinerario y listas (sin marcar) en un viaje nuevo sin fechas. No copia reservas, gastos ni
        // documentos, que son de ese viaje.
        async function duplicarViaje(id) {
            const t = getTrip(id);
            if (!t) return;
            const limpio = JSON.parse(JSON.stringify({ places: t.places || [], itinerario: t.itinerario || [], listas: t.listas || [] }));
            limpio.listas.forEach(l => (l.items || []).forEach(i => { i.hecho = false; }));
            limpio.places.forEach(x => { delete x.visitado; });
            const nuevo = { id: 'entry_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), type: 'travel', categoryId: t.categoryId, tags: [...(t.tags || [])], title: (t.title || 'viaje') + ' (copia)', destination: t.destination || '', startDate: '', endDate: '', date: '', notes: t.notes || '', ...limpio };
            entries.push(nuevo);
            filteredEntries = [...entries];
            render();
            try { await saveData(); showToast('Planificación duplicada, sin fechas'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
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
                { id: 'destino', label: 'Destino' },
                { id: 'reservas', label: 'Reservas', count: t.transportes.length + t.alojamientos.length },
                { id: 'lugares', label: 'Lugares', count: t.places.length },
                { id: 'itinerario', label: 'Itinerario', count: t.itinerario.length },
                { id: 'mapa', label: 'Mapa', count: t.itinerario.filter(i => i.lat && i.lon).length },
                { id: 'documentos', label: 'Documentos' },
                { id: 'listas', label: 'Listas', count: t.listas.length },
                { id: 'gastos', label: 'Gastos', count: financeProGastosDelViaje(t).length },
            ];

            let body = '';
            if (tripManagerTab === 'resumen') body = renderTripResumenTab(t);
            else if (tripManagerTab === 'destino') body = renderTripDestinoTab(t);
            else if (tripManagerTab === 'reservas') body = renderTripReservasTab(t);
            else if (tripManagerTab === 'lugares') body = renderTripPlacesTab(t);
            else if (tripManagerTab === 'itinerario') body = renderTripItineraryTab(t);
            else if (tripManagerTab === 'mapa') body = renderTripMapTab(t);
            else if (tripManagerTab === 'documentos') body = renderTripDocumentsTab(t);
            else if (tripManagerTab === 'listas') body = renderTripListsTab(t);
            else if (tripManagerTab === 'gastos') body = renderTripGastosTab(t);

            return `
            <div style="max-width:820px">
                <button class="btn-secondary" style="width:auto;margin-bottom:14px" onclick="closeTripManager()">← Volver a Viajes</button>
                <div class="trip-manager-header">
                    <div>
                        <span class="trip-status-badge" style="--badge-color:${colorTema(status.color)}">${status.label}</span>
                        <div class="trip-manager-title">${escapeHtml(t.title)}</div>
                        <div class="trip-manager-sub">${escapeHtml(t.destination || '')}${t.startDate ? ', ' + escapeHtml(formatTravelRange(t.startDate, t.endDate)) : ''}${financeProGastoViaje(t.id) ? `, ${financeMoney(financeProGastoViaje(t.id))} gastados` : ''}</div>
                    </div>
                    <div class="trip-manager-botones" style="display:flex;gap:8px;flex-shrink:0">
                        <button class="btn-secondary" style="width:auto" onclick="abrirCompartirViajeModal('${t.id}')">compartir.</button>
                        <button class="btn-secondary" style="width:auto" onclick="openEditEntry('${t.id}')"><i class='ico ico-lapiz' aria-hidden=true></i> Editar</button>
                        <button class="btn-secondary btn-danger-pill" style="width:auto" onclick="deleteTripFromManager('${t.id}')">eliminar.</button>
                    </div>
                </div>
                <div class="culture-tabs trip-tabs" style="margin-top:16px">
                    ${tabs.map(tb => `<button class="culture-tab ${tripManagerTab === tb.id ? 'active' : ''}" onclick="setTripManagerTab('${tb.id}')"><span>${tb.label}</span>${tb.count !== undefined ? `<span class="culture-tab-count">${tb.count}</span>` : ''}</button>`).join('')}
                </div>
                <div class="culture-tab-content"><div class="cal-view-anim">${body}</div></div>
            </div>`;
        }

        // ---- Resumen ----
        function renderTripResumenTab(t) {
            const total = getTravelTotal(t) + financeProGastoViaje(t.id);
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
            return f + (h ? ', ' + h.slice(0, 5) : '');
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
                                <div class="viaje-reserva-meta">${escapeHtml(TRANSPORTE_TIPOS[x.tipo] || x.tipo || 'transporte')}${x.compania ? ', ' + escapeHtml(x.compania) : ''}${x.numero ? ', ' + escapeHtml(x.numero) : ''}</div>
                                <div class="viaje-reserva-ruta">${escapeHtml(x.origen || '?')} → ${escapeHtml(x.destino || '?')}</div>
                            </div>
                            <button class="friend-remove-btn" title="Eliminar" onclick="deleteTripReserva('${t.id}','transportes','${x.id}')"><i class='ico ico-x' aria-hidden=true></i></button>
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
                            <button class="friend-remove-btn" title="Eliminar" onclick="deleteTripReserva('${t.id}','alojamientos','${x.id}')"><i class='ico ico-x' aria-hidden=true></i></button>
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
                <button class="btn-modal-primary" onclick="saveTripReserva('${tripId}','transportes')">guardar.</button>
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
                <button class="btn-modal-primary" onclick="saveTripReserva('${tripId}','alojamientos')">guardar.</button>
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
                        <button class="friend-remove-btn" title="Quitar" onclick="deleteTripPlace('${t.id}','${p.id}')"><i class='ico ico-x' aria-hidden=true></i></button>
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
                                <div style="font-size:11px;color:var(--text-secondary);font-weight:600">${it.dia ? escapeHtml(new Date(it.dia + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })) : 'Sin día'}${it.hora ? ', ' + escapeHtml(it.hora) : ''}</div>
                                <div style="font-weight:600;margin-top:2px">${escapeHtml(it.titulo)}</div>
                                ${it.lugar ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">📍 ${escapeHtml(it.lugar)}${it.lat ? '' : ', localizando...'}</div>` : ''}
                                ${it.notas ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${linkifyText(it.notas)}</div>` : ''}
                            </div>
                            <button class="friend-remove-btn" title="Eliminar" onclick="deleteItineraryItem('${t.id}','${it.id}')"><i class='ico ico-x' aria-hidden=true></i></button>
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
            if (!container) return;
            // Leaflet solo se descarga al abrir un mapa, no en cada arranque.
            if (typeof L === 'undefined') {
                if (!document.querySelector('link[href*="leaflet.css"]')) document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" crossorigin="anonymous">');
                cargarScript('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js').then(() => initTripMap(t), e => console.error(e));
                return;
            }
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
                    .bindPopup(`<strong>${i + 1}. ${escapeHtml(it.titulo)}</strong><br>${escapeHtml(dayLabel)}${it.hora ? ', ' + escapeHtml(it.hora) : ''}`);
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
                <button class="btn-modal-primary" onclick="saveItineraryItem('${tripId}')">guardar.</button>
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
            // En el móvil nadie los pedía y se quedaba en "Cargando documentos...".
            if (!docs) setTimeout(() => loadTripDocuments(t.id), 0);
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
                    ? `<button class="doc-action-download" onclick="openEntryDocHtml('trips','${tripId}','${jsAttr(doc.name)}')">ver.</button>`
                    : `<button class="doc-action-download" onclick="downloadTripDocument('${tripId}','${jsAttr(doc.name)}')">descargar.</button>`;
                return `<div class="doc-item">
                    <div class="doc-info"><span style="font-size:20px">${isHtml ? '▥' : '📄'}</span><div style="min-width:0"><div class="doc-name">${escapeHtml(doc.name.replace(/^\d{10,}_/, ''))}</div><div class="doc-meta">${date}${sizeKb ? ', ' + sizeKb : ''}</div></div></div>
                    <div class="doc-actions">
                        ${openBtn}
                        <button class="doc-action-delete-btn" title="Eliminar" onclick="deleteTripDocument('${tripId}','${jsAttr(doc.name)}')"><i class='ico ico-x' aria-hidden=true></i></button>
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
            // En la app instalada (iPhone), window.open tras un await se
            // bloquea: la ventana se abre antes y luego se le pone la dirección.
            const ventana = window.open('', '_blank');
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/trips/${tripId}/${name}`;
                const { data, error } = await sb.storage.from('documents').createSignedUrl(path, 60);
                if (error) throw error;
                if (ventana) ventana.location.href = data.signedUrl; else window.location.href = data.signedUrl;
            } catch (e) {
                ventana?.close();
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
                    <div class="doc-info"><div style="min-width:0"><div class="doc-name">${escapeHtml(doc.name.replace(/^\d{10,}_/, ''))}</div><div class="doc-meta">${date}${sizeKb ? ', ' + sizeKb : ''}</div></div></div>
                    <div class="doc-actions">
                        <button class="doc-action-download" onclick="downloadWorkDocument('${workId}','${jsAttr(doc.name)}')">descargar.</button>
                        <button class="doc-action-delete-btn" title="Eliminar" onclick="deleteWorkDocument('${workId}','${jsAttr(doc.name)}')"><i class='ico ico-x' aria-hidden=true></i></button>
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
                            <button class="friend-remove-btn" title="Eliminar lista" onclick="deleteTripList('${t.id}','${l.id}')"><i class='ico ico-x' aria-hidden=true></i></button>
                        </div>
                        ${(l.items || []).map(i => `
                            <div class="trip-check-row">
                                <input type="checkbox" ${i.hecho ? 'checked' : ''} onchange="toggleTripListItem('${t.id}','${l.id}','${i.id}')">
                                <span style="flex:1;cursor:pointer;${i.hecho ? 'text-decoration:line-through;opacity:.5' : ''}" onclick="toggleTripListItem('${t.id}','${l.id}','${i.id}')">${escapeHtml(i.texto)}</span>
                                <button class="friend-remove-btn" title="Quitar" onclick="deleteTripListItem('${t.id}','${l.id}','${i.id}')"><i class='ico ico-x' aria-hidden=true></i></button>
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
            showModal(`<div class="modal-title">Nueva lista</div><div class="modal-label">Nombre</div><input id="new-list-name" class="modal-input" placeholder="Qué llevar"><button class="btn-modal-primary" onclick="saveTripList('${tripId}')">crear.</button>`);
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

        // Lo que se gastó en el viaje, sacado de Finanzas: los movimientos
        // marcados como gasto de viaje (con este viaje o dentro de sus fechas).
        function renderTripGastosTab(t) {
            const gastos = financeProGastosDelViaje(t);
            const manual = t.expenses || [];
            const total = gastos.reduce((s, x) => s + (Number(x.amount) || 0), 0);
            const fin = t.endDate || t.startDate;
            const dias = t.startDate ? Math.max(1, Math.round((new Date(fin + 'T12:00:00') - new Date(t.startDate + 'T12:00:00')) / 86400000) + 1) : 0;
            const porCat = {};
            gastos.forEach(x => { const k = x.category || ''; porCat[k] = (porCat[k] || 0) + (Number(x.amount) || 0); });
            const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
            const porDia = {};
            gastos.forEach(x => (porDia[x.date] = porDia[x.date] || []).push(x));
            if (!gastos.length && !manual.length) return `
                <div class="empty-state"><div class="empty-title">sin gastos todavía.</div>
                <div class="empty-sub">En Finanzas, marca los gastos de estos días como «gasto de viaje.» (o usa «gastos de un viaje.» para marcarlos todos de una vez) y aparecerán aquí.</div>
                <button class="btn-secondary" style="width:auto;margin-top:12px" onclick="openFinanceProViajeModal('${t.id}')">marcar los gastos de estas fechas.</button></div>`;
            return `
                <div class="viaje-gastos-cifras">
                    <div><b>${financeMoney(total)}</b><small>gastado en el viaje</small></div>
                    ${dias ? `<div><b>${financeMoney(total / dias)}</b><small>al día, en ${dias} ${dias === 1 ? 'día' : 'días'}</small></div>` : ''}
                    <div><b>${gastos.length}</b><small>${gastos.length === 1 ? 'movimiento' : 'movimientos'}</small></div>
                </div>
                ${cats.length ? `<div class="viaje-gastos-cats">${cats.map(([k, v]) => {
                    const cat = financeProCategoryById(k);
                    return `<div class="viaje-gastos-cat"><span>${escapeHtml(cat?.name || 'sin categoría')}</span><i><em style="width:${Math.round(v / total * 100)}%"></em></i><b>${financeMoney(v)}</b></div>`;
                }).join('')}</div>` : ''}
                ${Object.entries(porDia).map(([d, xs]) => `
                    <div class="viaje-gastos-dia"><span>${new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}.</span><b>${financeMoney(xs.reduce((s, x) => s + (Number(x.amount) || 0), 0))}</b></div>
                    ${xs.map(x => `<button class="viaje-gastos-fila" onclick="openFinanceProTransactionModal('${x.id}')"><span>${escapeHtml(x.note || financeProCategoryById(x.category)?.name || 'gasto')}</span><i>${escapeHtml(financeProCategoryById(x.category)?.name || '')}</i><b>${financeMoney(x.amount)}</b></button>`).join('')}`).join('')}
                ${manual.length ? `<div class="viaje-gastos-dia"><span>apuntados a mano en el viaje.</span><b>${financeMoney(getTravelTotal(t))}</b></div>${manual.map(x => `<div class="viaje-gastos-fila"><span>${escapeHtml(x.concept || x.name || x.description || 'gasto')}</span><i></i><b>${financeMoney(Number(x.amount) || 0)}</b></div>`).join('')}` : ''}
                <button class="btn-secondary" style="width:auto;margin-top:14px" onclick="openFinanceProViajeModal('${t.id}')">revisar qué gastos son del viaje.</button>`;
        }

