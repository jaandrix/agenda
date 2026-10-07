        // ============================================================
        //  RENDER
        // ============================================================
        function render() {
            invalidateLinkableIndex();
            if (!apartadoVisible(currentView)) currentView = 'calendar';
            const content = document.getElementById('content');
            if (currentView === 'calendar') content.innerHTML = renderCalendar();
            else if (currentView === 'home') content.innerHTML = renderHome();
            else if (currentView === 'culture') content.innerHTML = renderCulture();
            else if (currentView === 'travels') { content.innerHTML = renderTravels();
                if (window._openTripId && tripManagerTab === 'documentos') loadTripDocuments(window._openTripId);
                if (window._openTripId && tripManagerTab === 'mapa') { const t = getTrip(window._openTripId); if (t) setTimeout(() => initTripMap(t), 0); } }
            else if (currentView === 'work') content.innerHTML = renderWork();
            else if (currentView === 'projects') content.innerHTML = renderProjects();
            else if (currentView === 'events') content.innerHTML = renderEvents();
            else if (currentView === 'documents') { content.innerHTML = renderDocuments();
                loadDocuments(); loadViewerFiles(); }
            else if (currentView === 'finances') { content.innerHTML = renderFinances();
                requestAnimationFrame(animateFinanceProChartPanel); }
            else if (currentView === 'tags') content.innerHTML = renderTagsView();
            else if (currentView === 'graph') content.innerHTML = renderGraph();
            else if (currentView === 'vault') content.innerHTML = renderVault();
            else if (currentView === 'notes') content.innerHTML = renderNotes();
            else if (currentView === 'goals') content.innerHTML = renderGoals();
            else if (currentView === 'planner') content.innerHTML = renderPlanner();
            else if (currentView === 'habits') content.innerHTML = renderHabits();
            else if (currentView === 'collectibles') content.innerHTML = renderCollectibles();
            else if (currentView === 'friends') { content.innerHTML = renderFriendsView();
                loadFriendsViewData(); }
            else if (currentView === 'studies') content.innerHTML = renderStudies();
            else if (currentView === 'links') content.innerHTML = renderLinks();
            else if (currentView === 'actualizaciones') content.innerHTML = renderActualizaciones();
            else if (currentView === 'universidad') content.innerHTML = renderUniversidad();
            else if (currentView === 'suggestions') { content.innerHTML = renderSuggestions(); loadMySuggestions(); }
            else if (currentView === 'bandeja') { content.innerHTML = renderBandeja(); if (!aplicandoBandeja && Date.now() - bandejaUltimaLectura > 15000) setTimeout(aplicarBandejaConector, 0); }
            else if (currentView === 'settings') { content.innerHTML = renderSettings();
                if (typeof pwaSyncInstallButton === 'function') pwaSyncInstallButton();
                loadSettingsSubscriptionInfo();
                cargarConectoresAjustes();
                loadSettingsPushInfo(); }
            updateAddButton();
            updateFabIcon();

            if(currentView==='finances' && financeSubView==='indexado') {
                setTimeout(() => {
                    reorderInvestmentCharts();
                    renderInvestmentCharts();
                }, 0);
            }

            renderMobileShell();
        }

        // ============================================================
        //  RENDER: CALENDAR
        // ============================================================
        let calYear = new Date().getFullYear();
        let calMonth = new Date().getMonth();
        let calViewMode = 'month'; // 'day' | 'week' | 'month'
        let calSelectedDate = new Date().toISOString().slice(0, 10);
        const CAL_MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        const CAL_DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

        function getRecurringCalendarEntries(dateStr) {
            const day = Number(String(dateStr).slice(8, 10));
            if (!day) return [];
            const year = Number(String(dateStr).slice(0, 4));
            const month = Number(String(dateStr).slice(5, 7));
            const daysInMonth = new Date(year, month, 0).getDate();
            return entries.filter(e => {
                if (!((e.type === 'subscription' || e.type === 'fixed_expense') && e.active !== false)) return false;
                const renewalDay = Number(e.renewalDay);
                if (!renewalDay) return false;
                return Math.min(renewalDay, daysInMonth) === day;
            }).map(e => ({ ...e, date: dateStr, _recurringPayment: true }));
        }

        function buildEntriesByDate(year) {
            const entriesByDate = {};
            entries.forEach(e => {
                if (NON_CALENDAR_TYPES.includes(e.type)) return;
                if (isCalendarLogEntry(e)) return;
                if (e.type === 'birthday' && e.birthDate) {
                    const [, m, d] = e.birthDate.split('-');
                    const projectedDate = `${year}-${m}-${d}`;
                    if (!entriesByDate[projectedDate]) entriesByDate[projectedDate] = [];
                    entriesByDate[projectedDate].push(e);
                    return;
                }
                const date = e.date || e.startDate || '';
                if (!date) return;
                if (!entriesByDate[date]) entriesByDate[date] = [];
                entriesByDate[date].push(e);
            });
            return entriesByDate;
        }

        function greetingText() {
            const h = new Date().getHours();
            if (h < 6) return 'buenas noches.';
            if (h < 13) return 'buenos días.';
            if (h < 20) return 'buenas tardes.';
            return 'buenas noches.';
        }

        // Mes → semana → día es acercarse: la vista nueva crece desde lo
        // que se pulsó; volver atrás es alejarse.
        const CAL_NIVEL_ZOOM = { month: 0, week: 1, day: 2 };

        function setCalView(mode) {
            const antes = CAL_NIVEL_ZOOM[calViewMode], despues = CAL_NIVEL_ZOOM[mode];
            const tipo = despues > antes ? 'acercar' : despues < antes ? 'alejar' : 'fundido';
            vtOrigenEnContenido();
            conTransicion(tipo, () => { calViewMode = mode; render(); });
        }

        function jumpToToday() {
            const t = new Date();
            const hoy = t.toISOString().slice(0, 10);
            conTransicion(hoy > calSelectedDate ? 'adelante' : hoy < calSelectedDate ? 'atras' : 'fundido', () => {
                calYear = t.getFullYear();
                calMonth = t.getMonth();
                calSelectedDate = hoy;
                render();
            });
        }

        function selectCalDate(dateStr) {
            calSelectedDate = dateStr;
            window._selectedDate = dateStr;
            const d = new Date(dateStr + 'T12:00:00');
            calYear = d.getFullYear();
            calMonth = d.getMonth();
            render();
        }

        // ============================================================
        //  VISTA ANUAL (calendario de puntos, un punto por día)
        // ============================================================
        // Puntuación de esfuerzo (1-5) por día: cuánto te esforzaste ese día
        // en cumplir tus objetivos. Se puntúa pulsando su bolita en la
        // vista "esfuerzo." del calendario anual.
        let dailyEffort = {};

        // ============================================================
        //  CALENDARIO ANUAL (bolitas)
        //  Una bolita por día del año, flotando en el centro sobre la
        //  pantalla difuminada (mismo gesto que "tu estancia en bitácora."):
        //  sale desde el botón que lo abre. Tres vistas que solo cambian un
        //  atributo del contenedor (data-vista), así el color de cada
        //  estrella cambia con una transición CSS escalonada en diagonal
        //  (--o) en vez de volver a pintar la cuadrícula.
        // ============================================================
        let yearCalVista = 'dias';

        function abrirCalendarioAnual() {
            yearCalYear = new Date().getFullYear();
            yearCalVista = 'dias';
            if (document.getElementById('anual-overlay')) return;
            const origen = document.querySelector('.year-cal-btn');
            const r = origen?.getBoundingClientRect();
            const overlay = document.createElement('div');
            overlay.id = 'anual-overlay';
            overlay.className = 'anual-overlay';
            overlay.style.setProperty('--dx', r ? Math.round(r.left + r.width / 2 - window.innerWidth / 2) + 'px' : '0px');
            overlay.style.setProperty('--dy', r ? Math.round(r.top + r.height / 2 - window.innerHeight / 2) + 'px' : '0px');
            overlay.innerHTML = `<button class="anual-cerrar" onclick="cerrarCalendarioAnual()" aria-label="Cerrar">✕</button><div class="anual-flotante" id="anual-flotante">${renderCalendarioAnual()}</div>`;
            overlay.addEventListener('click', e => { if (e.target === overlay) cerrarCalendarioAnual(); });
            document.body.appendChild(overlay);
            document.addEventListener('keydown', cerrarCalendarioAnualConTecla, true);
            requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('abierto')));
        }

        function cerrarCalendarioAnualConTecla(e) {
            // Con el selector de esfuerzo abierto encima, Escape cierra solo ese modal.
            if (e.key !== 'Escape' || document.querySelector('#modal-container .modal-overlay')) return;
            e.stopPropagation();
            cerrarCalendarioAnual();
        }

        function cerrarCalendarioAnual() {
            const overlay = document.getElementById('anual-overlay');
            if (!overlay || overlay.classList.contains('cerrando')) return;
            overlay.classList.add('cerrando');
            overlay.classList.remove('abierto');
            document.removeEventListener('keydown', cerrarCalendarioAnualConTecla, true);
            setTimeout(() => overlay.remove(), 420);
        }

        function refrescarCalendarioAnual() {
            const cont = document.getElementById('anual-flotante');
            if (cont) cont.innerHTML = renderCalendarioAnual();
        }

        function cambiarYearCal(delta) {
            yearCalYear += delta;
            refrescarCalendarioAnual();
        }

        function setYearCalVista(vista) {
            yearCalVista = vista;
            const grid = document.querySelector('#anual-flotante .anual-grid');
            if (grid) grid.dataset.vista = vista;
            document.querySelectorAll('#anual-flotante .anual-vista-btn').forEach(b => b.classList.toggle('active', b.dataset.vista === vista));
            fundirTextoAnual('anual-resumen', renderYearCalResumen());
            fundirTextoAnual('anual-leyenda', renderYearCalLeyenda());
        }

        function fundirTextoAnual(id, html) {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.add('anual-texto-fuera');
            setTimeout(() => { el.innerHTML = html; el.classList.remove('anual-texto-fuera'); }, 180);
        }

        function yearCalDias() {
            const dias = [];
            const hoy = todayISO();
            for (let m = 0; m < 12; m++) {
                const n = new Date(yearCalYear, m + 1, 0).getDate();
                for (let d = 1; d <= n; d++) {
                    const iso = `${yearCalYear}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    dias.push({ iso, m, d, futuro: iso > hoy, hoy: iso === hoy });
                }
            }
            return dias;
        }

        function renderYearCalResumen() {
            const dias = yearCalDias();
            const vividos = dias.filter(x => !x.futuro).length;
            if (yearCalVista === 'viajes') {
                const n = dias.filter(x => esDiaDeViaje(x.iso)).length;
                return `${n} ${n === 1 ? 'día' : 'días'} de viaje en ${yearCalYear}.`;
            }
            if (yearCalVista === 'esfuerzo') {
                const notas = dias.map(x => dailyEffort[x.iso]).filter(Boolean);
                return notas.length ? `media ${(notas.reduce((a, b) => a + b, 0) / notas.length).toLocaleString('es-ES', { maximumFractionDigits: 1 })} · ${notas.length} ${notas.length === 1 ? 'día puntuado' : 'días puntuados'}.` : 'todavía sin días puntuados.';
            }
            const quedan = dias.length - vividos;
            return quedan <= 0 ? `${yearCalYear} ya terminó.` : `le ${quedan === 1 ? 'queda 1 día' : `quedan ${quedan} días`} a ${yearCalYear}.`;
        }

        function renderYearCalLeyenda() {
            const e = (cls, txt) => `<span class="anual-leyenda-item"><span class="anual-estrella ${cls}"></span>${txt}</span>`;
            if (yearCalVista === 'viajes') return e('anual-leyenda-viaje', 'día de viaje') + e('anual-leyenda-apagada', 'resto');
            if (yearCalVista === 'esfuerzo') return [1, 2, 3, 4, 5].map(n => e('anual-leyenda-esfuerzo-' + n, String(n))).join('') + '<span class="anual-leyenda-nota">pulsa una bolita para puntuar ese día.</span>';
            return e('', 'vivido') + e('anual-leyenda-futuro', 'por venir') + e('anual-leyenda-hoy', 'hoy');
        }

        function renderCalendarioAnual() {
            const dias = yearCalDias();
            const meses = ['e', 'f', 'm', 'a', 'm', 'j', 'j', 'a', 's', 'o', 'n', 'd'];
            let filas = '';
            for (let m = 0; m < 12; m++) {
                let celdas = '';
                dias.filter(x => x.m === m).forEach(x => {
                    const esfuerzo = dailyEffort[x.iso];
                    celdas += `<span class="anual-estrella" style="--o:${x.m + x.d}" data-fecha="${x.iso}" title="${x.iso}"${x.futuro ? ' data-futuro' : ''}${x.hoy ? ' data-hoy' : ''}${esDiaDeViaje(x.iso) ? ' data-viaje' : ''}${esfuerzo ? ` data-esfuerzo="${esfuerzo}"` : ''}></span>`;
                });
                filas += `<div class="anual-fila"><span class="anual-mes">${meses[m]}</span><div class="anual-dias">${celdas}</div></div>`;
            }
            return `
                <div class="anual-cabecera">
                    <button class="anual-flecha" onclick="cambiarYearCal(-1)" aria-label="Año anterior">‹</button>
                    <div class="anual-anio">${yearCalYear}</div>
                    <button class="anual-flecha" onclick="cambiarYearCal(1)" aria-label="Año siguiente">›</button>
                </div>
                <div class="anual-resumen" id="anual-resumen">${renderYearCalResumen()}</div>
                <div class="anual-grid" data-vista="${yearCalVista}" onclick="clickEstrellaAnual(event)">${filas}</div>
                <div class="anual-vistas">
                    ${[['dias', 'días.'], ['viajes', 'viajes.'], ['esfuerzo', 'esfuerzo.']].map(([v, t]) => `<button class="anual-vista-btn ${yearCalVista === v ? 'active' : ''}" data-vista="${v}" onclick="setYearCalVista('${v}')">${t}</button>`).join('')}
                </div>
                <div class="anual-leyenda" id="anual-leyenda">${renderYearCalLeyenda()}</div>`;
        }

        function clickEstrellaAnual(e) {
            const estrella = e.target.closest('.anual-estrella');
            if (!estrella || yearCalVista !== 'esfuerzo' || estrella.hasAttribute('data-futuro')) return;
            openDailyEffortPicker(estrella.dataset.fecha);
        }

        // Puntuar el esfuerzo de un día concreto (1-5). Se abre como modal
        // por encima del calendario anual, que sigue abierto debajo.
        function openDailyEffortPicker(dateStr) {
            const current = dailyEffort[dateStr] || 0;
            const fecha = new Date(dateStr + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
            showModal(`
                <div class="modal-title">Esfuerzo — ${escapeHtml(fecha)}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px">¿Cuánto te esforzaste ese día en cumplir tus objetivos?</div>
                <div class="effort-picker-row">
                    ${[1, 2, 3, 4, 5].map(n => `<button class="effort-picker-btn year-dot-effort-${n} ${current === n ? 'active' : ''}" onclick="setDailyEffort('${dateStr}',${n})">${n}</button>`).join('')}
                </div>
                ${current ? `<button class="btn-secondary" style="width:auto;margin-top:14px" onclick="setDailyEffort('${dateStr}',0)">Quitar puntuación</button>` : ''}
            `);
        }

        async function setDailyEffort(dateStr, value) {
            if (value > 0) dailyEffort[dateStr] = value; else delete dailyEffort[dateStr];
            closeModal();
            const estrella = document.querySelector(`#anual-flotante .anual-estrella[data-fecha="${dateStr}"]`);
            if (estrella) { if (value > 0) estrella.dataset.esfuerzo = value; else estrella.removeAttribute('data-esfuerzo'); }
            const resumen = document.getElementById('anual-resumen');
            if (resumen) resumen.innerHTML = renderYearCalResumen();
            try { await saveData(); } catch (e) { console.error('Error guardando el esfuerzo diario:', e); showToast('No se pudo guardar en la nube', true); }
        }

        // Punto 2 del rediseño: día trabajado = dentro del rango de un
        // contrato ("Trabajo", startDate–endDate, sin fecha fin = sigue
        // vigente) y que no sea fin de semana — los fines de semana nunca se
        // marcan como trabajados aquí, aunque el contrato siga activo.
        function esDiaTrabajado(dateStr) {
            const dow = new Date(dateStr + 'T12:00:00').getDay();
            if (dow === 0 || dow === 6) return false;
            return entries.some(e => e.type === 'work' && e.startDate &&
                dateStr >= e.startDate && dateStr <= (e.endDate || '9999-12-31'));
        }

        function esDiaDeViaje(dateStr) {
            return entries.some(e => e.type === 'travel' && e.startDate && e.endDate &&
                dateStr >= e.startDate && dateStr <= e.endDate);
        }

        // ============================================================
        //  RENDER: HOME (calendario estilo Stoic)
        // ============================================================
        // "En este día, hace...": entradas y notas de exactamente el mismo día
        // y mes (en años anteriores). Se guarda id+tipo (no solo título) para
        // poder abrir directamente la entrada/nota original al pulsarla.
        // Fija el mediodía al parsear fechas sin hora ("YYYY-MM-DD") para que
        // getMonth()/getDate() no se desplacen un día en zonas horarias por
        // detrás de UTC (mismo patrón ya usado en el resto de la app).
        function parseFechaSegura(raw) {
            const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(raw);
            return new Date(soloFecha ? raw + 'T12:00:00' : raw);
        }

        function buildOnThisDayItems() {
            const hoy = new Date();
            const mes = hoy.getMonth(), dia = hoy.getDate(), anioActual = hoy.getFullYear();
            const esMismoDia = d => d && d.getMonth() === mes && d.getDate() === dia && d.getFullYear() < anioActual;
            const items = [];

            (Array.isArray(entries) ? entries : []).forEach(e => {
                const raw = e.date || e.startDate || e.createdAt;
                if (!raw) return;
                const d = parseFechaSegura(raw);
                if (isNaN(d) || !esMismoDia(d)) return;
                items.push({
                    id: e.id,
                    kind: 'entry',
                    title: e.title || e.destination || e.company || 'Entrada',
                    type: (TYPE_LABELS[e.type] || e.type || 'Entrada'),
                    year: d.getFullYear()
                });
            });

            (Array.isArray(notes) ? notes : []).forEach(n => {
                const raw = n.date || n.createdAt;
                if (!raw) return;
                const d = parseFechaSegura(raw);
                if (isNaN(d) || !esMismoDia(d)) return;
                items.push({
                    id: n.id,
                    kind: 'note',
                    title: n.title || (typeof formatNoteTitle === 'function' ? formatNoteTitle(n.date) : 'Nota'),
                    type: 'Nota',
                    year: d.getFullYear()
                });
            });

            return items.sort((a, b) => b.year - a.year);
        }

        function openOnThisDayItem(kind, id) {
            if (kind === 'entry' && typeof openEntryDetail === 'function') openEntryDetail(id);
            else if (kind === 'note' && typeof openReadNote === 'function') openReadNote(id);
        }

        function renderOnThisDayCard() {
            const items = buildOnThisDayItems();
            if (!items.length) return '';
            const anioActual = new Date().getFullYear();
            return `<div class="card" style="margin-top:16px;padding:14px 16px">
                <div class="card-title" style="margin-bottom:8px;font-size:12px">En este día, hace...</div>
                <div style="display:flex;flex-direction:column;gap:8px">
                    ${items.map(it => {
                        const anios = anioActual - it.year;
                        return `<div style="display:flex;align-items:baseline;gap:8px;cursor:pointer" onclick="openOnThisDayItem('${it.kind}','${it.id}')">
                            <span style="font-size:10px;font-weight:700;color:var(--text-secondary);white-space:nowrap;min-width:48px">${anios} año${anios === 1 ? '' : 's'}</span>
                            <div style="min-width:0">
                                <div style="font-size:12px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(it.title)}</div>
                                <div style="font-size:10px;color:var(--text-secondary)">${escapeHtml(it.type)}</div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
        }

        // ============================================================
        //  TIEMPO (Home): icono y temperatura de la ciudad elegida, sin
        //  fondo. Open-Meteo: gratis, sin clave ni registro. Se guarda en el
        //  navegador para pintarlo al instante y se renueva cada 30 min; al
        //  pulsarlo, máximas y mínimas y cambio de ciudad.
        // ============================================================
        const CIUDAD_TIEMPO_DEFECTO = { nombre: 'Zaragoza', lat: 41.6488, lon: -0.8891 };
        const TIEMPO_CACHE = 'bitacora-tiempo';
        let tiempoActual = null;
        let tiempoCargando = false;

        // Iconos sólidos y geométricos, como el resto de la app; heredan el
        // color del texto (sin fondo).
        const TIEMPO_NUBE = 'M24 78h50a18 18 0 0 0 3-35.7A25 25 0 0 0 29 39a19.5 19.5 0 0 0-5 39z';
        const TIEMPO_ICONOS = {
            sol: '<circle cx="50" cy="50" r="20"/><g>' + [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<rect x="46.5" y="8" width="7" height="15" rx="3.5" transform="rotate(${a} 50 50)"/>`).join('') + '</g>',
            luna: '<path d="M60 12a38 38 0 1 0 28 64A32 32 0 0 1 60 12z"/>',
            claros: '<circle cx="36" cy="34" r="15"/>' + [0, 60, 120, 180, 240, 300].map(a => `<rect x="33.5" y="6" width="5" height="9" rx="2.5" transform="rotate(${a} 36 34)"/>`).join('') + `<path d="M34 84h44a15 15 0 0 0 2.5-29.8A21 21 0 0 0 40 55.5a14.3 14.3 0 0 0-6 28.5z"/>`,
            nube: `<path d="${TIEMPO_NUBE}"/>`,
            niebla: '<rect x="14" y="30" width="72" height="9" rx="4.5"/><rect x="22" y="46" width="64" height="9" rx="4.5"/><rect x="14" y="62" width="60" height="9" rx="4.5"/>',
            lluvia: '<path d="M24 62h50a16 16 0 0 0 3-31.7A22 22 0 0 0 30 31a15.5 15.5 0 0 0-6 31z"/><rect x="32" y="70" width="6" height="16" rx="3" transform="rotate(15 35 78)"/><rect x="48" y="70" width="6" height="16" rx="3" transform="rotate(15 51 78)"/><rect x="64" y="70" width="6" height="16" rx="3" transform="rotate(15 67 78)"/>',
            nieve: '<path d="M24 62h50a16 16 0 0 0 3-31.7A22 22 0 0 0 30 31a15.5 15.5 0 0 0-6 31z"/><circle cx="34" cy="76" r="4.5"/><circle cx="50" cy="84" r="4.5"/><circle cx="66" cy="76" r="4.5"/>',
            tormenta: '<path d="M24 58h50a16 16 0 0 0 3-31.7A22 22 0 0 0 30 27a15.5 15.5 0 0 0-6 31z"/><path d="M52 60 38 80h10l-4 16 16-22H50l6-14z"/>',
        };

        function tiempoTipo(code, esDia) {
            if (code === 0) return esDia ? 'sol' : 'luna';
            if (code === 1 || code === 2) return esDia ? 'claros' : 'nube';
            if (code === 3) return 'nube';
            if (code === 45 || code === 48) return 'niebla';
            if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'lluvia';
            if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'nieve';
            if (code >= 95) return 'tormenta';
            return 'nube';
        }

        const TIEMPO_TEXTO = { sol: 'despejado', luna: 'despejado', claros: 'intervalos de nubes', nube: 'nuboso', niebla: 'niebla', lluvia: 'lluvia', nieve: 'nieve', tormenta: 'tormenta' };

        function tiempoIcono(tipo, tam = 20) {
            return `<svg width="${tam}" height="${tam}" viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">${TIEMPO_ICONOS[tipo] || TIEMPO_ICONOS.nube}</svg>`;
        }

        function tiempoClave() {
            const c = ciudadTiempo || CIUDAD_TIEMPO_DEFECTO;
            return `${c.lat.toFixed(3)},${c.lon.toFixed(3)}`;
        }

        function contenidoTiempoWidget() {
            if (!tiempoActual) return '';
            const tipo = tiempoTipo(tiempoActual.code, tiempoActual.esDia);
            return `${tiempoIcono(tipo)}<span>${Math.round(tiempoActual.temp)}°</span>`;
        }

        function renderTiempoWidget() {
            if (!tiempoActual) {
                try { const g = JSON.parse(localStorage.getItem(TIEMPO_CACHE) || 'null'); if (g && g.clave === tiempoClave()) tiempoActual = g; } catch (e) { /* sin almacenamiento: se pide a la red */ }
            }
            if (!tiempoActual || Date.now() - tiempoActual.hora > 30 * 60000) setTimeout(cargarTiempo, 0);
            const c = ciudadTiempo || CIUDAD_TIEMPO_DEFECTO;
            const desc = tiempoActual ? `${c.nombre}: ${TIEMPO_TEXTO[tiempoTipo(tiempoActual.code, tiempoActual.esDia)]}, ${Math.round(tiempoActual.temp)}°` : c.nombre;
            return `<button class="tiempo-widget" onclick="openTiempo()" title="${escapeHtml(desc)}" aria-label="${escapeHtml(desc)}">${contenidoTiempoWidget()}</button>`;
        }

        async function cargarTiempo(forzar) {
            if (tiempoCargando) return;
            const clave = tiempoClave();
            if (!forzar && tiempoActual && tiempoActual.clave === clave && Date.now() - tiempoActual.hora < 30 * 60000) return;
            tiempoCargando = true;
            try {
                const c = ciudadTiempo || CIUDAD_TIEMPO_DEFECTO;
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=4&timezone=auto`;
                const r = await fetch(url).then(x => x.json());
                if (!r?.current) return;
                tiempoActual = {
                    clave, hora: Date.now(), temp: r.current.temperature_2m, code: r.current.weather_code, esDia: r.current.is_day === 1,
                    dias: (r.daily?.time || []).map((f, i) => ({ fecha: f, code: r.daily.weather_code[i], max: r.daily.temperature_2m_max[i], min: r.daily.temperature_2m_min[i], lluvia: r.daily.precipitation_probability_max?.[i] }))
                };
                try { localStorage.setItem(TIEMPO_CACHE, JSON.stringify(tiempoActual)); } catch (e) { /* sin almacenamiento */ }
                document.querySelectorAll('.tiempo-widget').forEach(b => { b.innerHTML = contenidoTiempoWidget(); });
                if (document.getElementById('tiempo-modal')) document.getElementById('tiempo-modal').innerHTML = renderTiempoModal();
            } catch (e) {
                console.error('Tiempo:', e);
            } finally {
                tiempoCargando = false;
            }
        }

        function renderTiempoModal() {
            const c = ciudadTiempo || CIUDAD_TIEMPO_DEFECTO;
            if (!tiempoActual) return '<div class="finance-modal-note">Cargando la previsión…</div>';
            const tipo = tiempoTipo(tiempoActual.code, tiempoActual.esDia);
            const hoy = tiempoActual.dias?.[0];
            const nombreDia = f => new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
            return `
                <div class="tiempo-ahora">
                    ${tiempoIcono(tipo, 56)}
                    <div>
                        <div class="tiempo-ahora-temp">${Math.round(tiempoActual.temp)}°</div>
                        <div class="tiempo-ahora-desc">${TIEMPO_TEXTO[tipo]}.${hoy ? ` máx ${Math.round(hoy.max)}° · mín ${Math.round(hoy.min)}°` : ''}</div>
                    </div>
                </div>
                ${(tiempoActual.dias || []).length > 1 ? `
                <div class="tiempo-dias">
                    ${tiempoActual.dias.slice(1).map(d => `
                        <div class="tiempo-dia">
                            <span>${nombreDia(d.fecha)}.</span>
                            ${tiempoIcono(tiempoTipo(d.code, true), 22)}
                            <b>${Math.round(d.max)}°</b><small>${Math.round(d.min)}°</small>
                        </div>`).join('')}
                </div>` : ''}
                <div class="tiempo-ciudad">
                    <div class="modal-label">ciudad.</div>
                    <input class="modal-input" id="tiempo-ciudad-input" value="${escapeHtml(c.nombre)}" placeholder="Busca tu ciudad…" oninput="buscarCiudadTiempo(this.value)">
                    <div id="tiempo-ciudad-resultados"></div>
                </div>`;
        }

        function openTiempo() {
            showModal(`<div class="modal-title">tiempo.</div><div id="tiempo-modal">${renderTiempoModal()}</div>`);
            cargarTiempo();
        }

        let tiempoBusquedaTimer;
        function buscarCiudadTiempo(texto) {
            clearTimeout(tiempoBusquedaTimer);
            const el = document.getElementById('tiempo-ciudad-resultados');
            if (!el) return;
            if (texto.trim().length < 2) { el.innerHTML = ''; return; }
            tiempoBusquedaTimer = setTimeout(async () => {
                try {
                    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(texto.trim())}&count=5&language=es&format=json`).then(x => x.json());
                    window._tiempoCiudades = r.results || [];
                    el.innerHTML = window._tiempoCiudades.length ? window._tiempoCiudades.map((c, i) => `
                        <button class="tiempo-ciudad-opcion" onclick="elegirCiudadTiempo(${i})">${escapeHtml(c.name)}<small>${escapeHtml([c.admin1, c.country].filter(Boolean).join(', '))}</small></button>`).join('')
                        : '<div class="finance-modal-note">No encuentro esa ciudad.</div>';
                } catch (e) { el.innerHTML = '<div class="finance-modal-note">No se ha podido buscar ahora.</div>'; }
            }, 300);
        }

        async function elegirCiudadTiempo(i) {
            const c = (window._tiempoCiudades || [])[i];
            if (!c) return;
            ciudadTiempo = { nombre: c.name, lat: c.latitude, lon: c.longitude };
            tiempoActual = null;
            const el = document.getElementById('tiempo-modal');
            if (el) el.innerHTML = renderTiempoModal();
            await cargarTiempo(true);
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function renderCalendar() {
            let html = `<div class="cal-home">`;
            html += `<div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
                <div class="culture-tabs" style="margin-bottom:0">
                    ${[['day','Día'],['week','Semana'],['month','Mes']].map(([id,label]) => `
                        <button class="culture-tab ${calViewMode===id?'active':''}" onclick="setCalView('${id}')">${label}</button>
                    `).join('')}
                </div>
                <button class="year-cal-btn" onclick="abrirCalendarioAnual()" title="Vista anual">
                    <svg width="18" height="18" viewBox="0 0 100 100" fill="currentColor"><circle cx="50" cy="50" r="30"/></svg>
                </button>
                ${renderTiempoWidget()}
            </div>`;

            const body = calViewMode === 'month' ? renderCalMonth() : calViewMode === 'week' ? renderCalWeek() : renderCalDay();
            html += `<div class="cal-view-anim">${body}</div>`;

            html += renderOnThisDayCard();
            html += `</div>`;
            return html;
        }

        function changeMonth(delta) {
            conTransicion(delta > 0 ? 'adelante' : 'atras', () => {
                calMonth += delta;
                if (calMonth < 0) { calMonth = 11;
                    calYear--; }
                if (calMonth > 11) { calMonth = 0;
                    calYear++; }
                render();
            });
        }

        function renderCalMonth() {
            const entriesByDate = buildEntriesByDate(calYear);

            for (let d = 1; d <= new Date(calYear, calMonth + 1, 0).getDate(); d++) {
                const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const recurring = getRecurringCalendarEntries(dateStr);
                if (recurring.length) entriesByDate[dateStr] = [...(entriesByDate[dateStr] || []), ...recurring];
            }

            const today = new Date().toISOString().slice(0, 10);
            const dayNames = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

            const firstDay = new Date(calYear, calMonth, 1).getDay();
            const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
            const offset = (firstDay + 6) % 7;

            const prevMonth = new Date(calYear, calMonth, 0);
            const daysInPrevMonth = prevMonth.getDate();

            let html = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <button class="cal-nav-arrow" onclick="changeMonth(-1)">‹</button>
                <span style="font-size:17px;font-weight:600;color:var(--text-primary)">${CAL_MONTH_NAMES[calMonth]} ${calYear}</span>
                <button class="cal-nav-arrow" onclick="changeMonth(1)">›</button>
            </div>
            <div class="vt-interior" style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px">`;

            dayNames.forEach(d => {
                html +=
                    `<div style="text-align:center;font-size:10px;font-weight:600;text-transform:uppercase;color:var(--text-secondary);padding:6px 0 10px 0">${d}</div>`;
            });

            for (let i = 0; i < offset; i++) {
                const day = daysInPrevMonth - offset + i + 1;
                html +=
                    `<div style="background:transparent;border-radius:16px;padding:6px 4px 8px 4px;min-height:64px;text-align:center;border:1px solid transparent"><span style="font-size:13px;font-weight:600;opacity:0.3;color:var(--text-secondary)">${day}</span></div>`;
            }

            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr =
                    `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const isToday = dateStr === today;
                const isSelected = dateStr === window._selectedDate;
                const dayEntries = entriesByDate[dateStr] || [];

                // Un punto por evento (no uno por color distinto) para que
                // el número de puntos refleje cuántos eventos hay ese día,
                // de un vistazo, sin tener que abrirlo.
                const barsHtml = dayEntries.slice(0, 4).map(e => {
                    const cat = categories.find(c => c.id === e.categoryId);
                    const color = cat ? cat.color : 'var(--text-muted)';
                    return `<span style="width:5px;height:5px;border-radius:50%;display:block;background:${color};flex-shrink:0"></span>`;
                }).join('');

                const extra = dayEntries.length > 4 ?
                    `<span style="font-size:8px;line-height:5px;color:var(--text-secondary);flex-shrink:0">+${dayEntries.length - 4}</span>` :
                    '';

                html += `
                <div class="cal-month-cell ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}" data-cal-date="${dateStr}" onclick="showDayEntries('${dateStr}')">
                    <span style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;color:var(--text-primary)">${d}</span>
                    <div style="display:flex;flex-direction:row;flex-wrap:wrap;gap:3px;align-items:center;justify-content:center">${barsHtml}${extra}</div>
                </div>`;
            }

            const totalDays = offset + daysInMonth;
            const remaining = (7 - (totalDays % 7)) % 7;
            for (let d = 1; d <= remaining; d++) {
                html +=
                    `<div style="background:transparent;border-radius:16px;padding:6px 4px 8px 4px;min-height:64px;text-align:center;border:1px solid transparent"><span style="font-size:13px;font-weight:600;opacity:0.3;color:var(--text-secondary)">${d}</span></div>`;
            }

            html += `</div>`;

            return html;
        }

        function changeWeek(delta) {
            conTransicion(delta > 0 ? 'adelante' : 'atras', () => {
                const d = new Date(calSelectedDate + 'T12:00:00');
                d.setDate(d.getDate() + delta * 7);
                calSelectedDate = d.toISOString().slice(0, 10);
                calYear = d.getFullYear();
                calMonth = d.getMonth();
                render();
            });
        }

        function renderCalWeek() {
            const base = new Date(calSelectedDate + 'T12:00:00');
            const dow = base.getDay();
            const monday = new Date(base);
            monday.setDate(base.getDate() - ((dow + 6) % 7));
            const today = new Date().toISOString().slice(0, 10);
            const entriesByDate = buildEntriesByDate(monday.getFullYear());

            let html = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <button class="cal-nav-arrow" onclick="changeWeek(-1)">‹</button>
                <span style="font-size:15px;font-weight:600;color:var(--text-primary)">Semana del ${monday.getDate()} de ${CAL_MONTH_NAMES[monday.getMonth()]}</span>
                <button class="cal-nav-arrow" onclick="changeWeek(1)">›</button>
            </div>
            <div class="cal-week-grid vt-interior">`;

            for (let i = 0; i < 7; i++) {
                const d = new Date(monday);
                d.setDate(monday.getDate() + i);
                const dateStr = d.toISOString().slice(0, 10);
                const isToday = dateStr === today;
                const recurring = getRecurringCalendarEntries(dateStr);
                const dayEntries = [...(entriesByDate[dateStr] || []), ...recurring];

                html += `
                <div class="cal-week-col ${isToday ? 'is-today' : ''}" onclick="selectCalDate('${dateStr}');setCalView('day')">
                    <div class="cal-week-col-head">
                        <span>${CAL_DAY_LETTERS[d.getDay()]}</span>
                        <span class="cal-week-col-num">${d.getDate()}</span>
                    </div>
                    <div class="cal-week-col-items">
                        ${dayEntries.slice(0, 4).map(e => {
                            const cat = categories.find(c => c.id === e.categoryId);
                            const color = cat?.color || 'var(--text-secondary)';
                            return `<div class="cal-week-item" style="border-left-color:${color}">${escapeHtml(e.title || '')}</div>`;
                        }).join('') || '<div class="cal-week-empty">—</div>'}
                        ${dayEntries.length > 4 ? `<div class="cal-week-more">+${dayEntries.length - 4} más</div>` : ''}
                    </div>
                </div>`;
            }

            html += `</div>`;
            return html;
        }

        function changeDay(delta) {
            conTransicion(delta > 0 ? 'adelante' : 'atras', () => {
                const d = new Date(calSelectedDate + 'T12:00:00');
                d.setDate(d.getDate() + delta);
                calSelectedDate = d.toISOString().slice(0, 10);
                calYear = d.getFullYear();
                calMonth = d.getMonth();
                render();
            });
        }

        function renderCalDay() {
            const dateObj = new Date(calSelectedDate + 'T12:00:00');
            const dateLabel = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
            const body = renderDayEntries(calSelectedDate);

            return `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <button class="cal-nav-arrow" onclick="changeDay(-1)">‹</button>
                <span class="cal-day-title" style="font-size:15px;font-weight:600;color:var(--text-primary);text-transform:capitalize">${dateLabel}</span>
                <button class="cal-nav-arrow" onclick="changeDay(1)">›</button>
            </div>
            <div class="vt-interior">${body || '<div class="empty-state"><div class="empty-title">Sin entradas</div><div class="empty-sub">No hay nada registrado este día.</div></div>'}</div>`;
        }

        function showDayEntries(date) {
            window._selectedDate = date;
            calSelectedDate = date;
            render();

            const dateObj = new Date(date + 'T12:00:00');
            const weekday = dateObj.toLocaleDateString('es-ES', { weekday: 'long' });
            const restDate = dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
            const all = getDayAllEntries(date);
            const rows = all.length ? renderDayEntryRows(all) : `<div class="empty-state"><div class="empty-title">Sin entradas</div><div class="empty-sub">No hay nada registrado este día.</div></div>`;

            showModalDesde(`.cal-month-cell[data-cal-date="${date}"]`, `
                <div class="modal-title day-modal-title">
                    <span><span class="day-modal-weekday">${weekday}</span>, ${restDate}:</span>
                    <button class="modal-close" onclick="closeModal()">✕</button>
                </div>
                <div class="day-modal-list">${rows}</div>
                <button class="day-modal-add-btn" style="margin-top:14px" onclick="openNewEntryForDay('${date}')">+ Añadir entrada este día</button>
            `);
        }

        // Deja elegir el tipo con el mismo buscador de captura rápida,
        // pero rellenando la fecha con el día sobre el que se pinchó.
        window._dayPrefillDate = null;
        function openNewEntryForDay(date) {
            window._dayPrefillDate = date;
            closeModal();
            openCommandPalette('create');
        }

        function isBirthdayOnDate(entry, dateStr) {
            if (entry.type !== 'birthday' || !entry.birthDate) return false;
            const [, m1, d1] = entry.birthDate.split('-');
            const [, m2, d2] = dateStr.split('-');
            return m1 === m2 && d1 === d2;
        }

        function getDayAllEntries(date) {
            const dayEntries = entries.filter(e => {
                if (NON_CALENDAR_TYPES.includes(e.type)) return false;
                if (isCalendarLogEntry(e)) return false;
                if (isBirthdayOnDate(e, date)) return true;
                return e.date === date || e.startDate === date;
            });
            const workDate=new Date(date+'T12:00:00');
            const weekend=workDate.getDay()===0||workDate.getDay()===6;
            const activeJobs=weekend?[]:entries.filter(e =>
                e.type === 'work' &&
                e.startDate && e.startDate <= date &&
                (!e.endDate || e.endDate >= date)
            );
            const recurringEntries = getRecurringCalendarEntries(date);
            return [...dayEntries, ...activeJobs, ...recurringEntries];
        }

        function renderDayEntryRows(all) {
            return all.map(e => {
                const cat = categories.find(c => c.id === e.categoryId);
                const color = cat?.color || 'var(--text-secondary)';
                const catName = cat?.name || 'Sin categoría';

                let titleHtml, metaHtml;

                if (e._recurringPayment) {
                    titleHtml = `Pago: ${e.title}`;
                    metaHtml = `${e.type === 'subscription' ? 'Suscripción' : 'Gasto fijo'} · ${financeMoney(e.amount)}`;
                } else if (e.type === 'work') {
                    const start = e.startTime || '';
                    const end = e.endTime || '';
                    const scheduleText = (start || end) ? ` de ${start || '--'} a ${end || '--'}` : '';
                    titleHtml = `Trabajando en ${e.company || 'empresa sin nombre'}${scheduleText}`;
                    metaHtml = e.position || catName;
                } else if (e.type === 'birthday') {
                    const years = e.birthDate ? new Date().getFullYear() - parseInt(e.birthDate.split('-')[0]) : '?';
                    titleHtml = `🎂 ${e.title} (${years} años)`;
                    metaHtml = 'Cumpleaños';
                } else {
                    titleHtml = e.title;
                    metaHtml = `${catName}${e.notes ? ' · ' + linkifyText(e.notes) : ''}`;
                }

                return `
                <div class="entry-item" data-open-entry="${e.id}">
                    <div class="entry-color-dot" style="background:${color}"></div>
                    <div class="entry-info">
                        <div class="entry-title">${titleHtml}</div>
                        <div class="entry-meta">${metaHtml}</div>
                    </div>
                    <div class="entry-actions">
                        <button class="delete" onclick="event.stopPropagation();deleteEntry('${e.id}')">✕</button>
                    </div>
                </div>`;
            }).join('');
        }

        function renderDayEntries(date) {
            const all = getDayAllEntries(date);
            if (!all.length) return '';
            return `<div class="day-entry-list">${renderDayEntryCards(all)}</div>`;
        }

        // Tarjetas de la vista Día de Home. Distintas de renderDayEntryRows
        // (que sigue usando el popup del calendario mensual/semanal) para
        // poder darles un aspecto propio sin tocar el popup.
        function renderDayEntryCards(all) {
            return all.map(e => {
                const cat = categories.find(c => c.id === e.categoryId);
                const color = cat?.color || 'var(--text-secondary)';
                const catName = cat?.name || 'Sin categoría';

                let titleHtml, metaHtml;
                if (e._recurringPayment) {
                    titleHtml = `Pago: ${e.title}`;
                    metaHtml = `${e.type === 'subscription' ? 'Suscripción' : 'Gasto fijo'} · ${financeMoney(e.amount)}`;
                } else if (e.type === 'work') {
                    const start = e.startTime || '';
                    const end = e.endTime || '';
                    const scheduleText = (start || end) ? ` de ${start || '--'} a ${end || '--'}` : '';
                    titleHtml = `Trabajando en ${e.company || 'empresa sin nombre'}${scheduleText}`;
                    metaHtml = e.position || catName;
                } else if (e.type === 'birthday') {
                    const years = e.birthDate ? new Date().getFullYear() - parseInt(e.birthDate.split('-')[0]) : '?';
                    titleHtml = `🎂 ${e.title} (${years} años)`;
                    metaHtml = 'Cumpleaños';
                } else {
                    titleHtml = e.title;
                    metaHtml = `${catName}${e.notes ? ' · ' + linkifyText(e.notes) : ''}`;
                }

                return `
                <div class="day-entry-card" data-open-entry="${e.id}">
                    <div class="day-entry-dot" style="background:${color}"></div>
                    <div class="day-entry-body">
                        <div class="day-entry-title">${titleHtml}</div>
                        <div class="day-entry-meta">${metaHtml}</div>
                    </div>
                    <button class="day-entry-delete" title="Eliminar" onclick="event.stopPropagation();deleteEntry('${e.id}')">✕</button>
                </div>`;
            }).join('');
        }

        // ============================================================
        //  CHECK BIRTHDAYS TODAY
        // ============================================================
        // ============================================================
        //  ALERTA DIARIA
        //  Pop-up diferenciado que resume cumpleaños, exámenes y eventos
        //  del día. Aparece una vez al entrar en la app y, como red de
        //  seguridad, también a las 7:30 si la app ya estaba abierta
        //  desde antes de esa hora.
        // ============================================================
        function getTodayAlerts() {
            const today = todayISO();
            const todayMonth = today.slice(5, 7), todayDay = today.slice(8, 10);
            const birthdays = entries.filter(e => e.type === 'birthday' && e.birthDate &&
                e.birthDate.slice(5, 7) === todayMonth && e.birthDate.slice(8, 10) === todayDay);
            const exams = [];
            (studies.subjects || []).forEach(s => (s.exams || []).forEach(ex => {
                if (ex.date === today) exams.push({ subjectId: s.id, subject: s.name, title: ex.title });
            }));
            // Los eventos sincronizados desde un examen (linkedKind==='exams')
            // ya aparecen en el grupo "Exámenes" de arriba; se excluyen aquí
            // para no duplicarlos. Los de "Entrega" (trabajos) sí se listan.
            const events = entries.filter(e => e.type === 'event' && e.date === today && e.linkedKind !== 'exams' && !isCalendarLogEntry(e));
            return { birthdays, exams, events };
        }

        // Icono de cumpleaños (misma familia TARJETA BITACORA que el resto
        // de chips de línea: bola de tarta con vela, solo relleno).
        const BIRTHDAY_ICON_CAKE = '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M12 46h76v42a6 6 0 0 1-6 6H18a6 6 0 0 1-6-6z"/><path d="M12 60c8-6 16 6 24 0s16 6 24 0 16 6 24 0v10c-8 6-16-6-24 0s-16-6-24 0-16-6-24 0z" opacity=".5"/><rect x="46" y="18" width="8" height="20"/><path d="M50 6c6 6 6 10 0 16-6-6-6-10 0-16z"/></svg>';

        function showDailyAlertPopup() {
            const { birthdays, exams, events } = getTodayAlerts();
            if (!birthdays.length && !exams.length && !events.length) return;

            const row = (icon, title, meta, onclick) => `
                <div class="line-row"${onclick ? ` onclick="${onclick}"` : ' style="cursor:default"'}>
                    <div class="line-row-icon">${icon}</div>
                    <div class="line-row-body">
                        <div class="line-row-title"><span class="line-row-title-text">${title}</span></div>
                        ${meta ? `<div class="line-row-meta">${meta}</div>` : ''}
                    </div>
                </div>`;

            const rows = [
                ...birthdays.map(e => {
                    const years = e.birthDate ? new Date().getFullYear() - parseInt(e.birthDate.split('-')[0]) : null;
                    return row(BIRTHDAY_ICON_CAKE, escapeHtml(e.title), years ? `${years} años` : '');
                }),
                ...exams.map(ex => row(STUDIES_ICON_EXAM, escapeHtml(ex.title || 'Examen'), escapeHtml(ex.subject), "closeModal();switchView('studies')")),
                ...events.map(e => row(EVENT_TYPE_ICONS[e.eventType] || EVENT_TYPE_ICONS.otro, escapeHtml(e.title), e.time ? escapeHtml(e.time) : '', `closeModal();navigateToEntry('${e.id}')`))
            ].join('');

            document.getElementById('modal-container').innerHTML = `
                <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
                    <div class="modal-sheet">
                        <div class="modal-title">tienes esto para hoy.<button class="modal-close" onclick="closeModal()">✕</button></div>
                        <div class="line-row-list">${rows}</div>
                        <button class="btn-secondary" style="width:100%;margin-top:14px" onclick="closeModal()">entendido.</button>
                    </div>
                </div>`;
        }

        function maybeShowDailyAlert() {
            const today = todayISO();
            let openDate = '', d0730 = '';
            try { openDate = localStorage.getItem('bitacora_alert_open_date') || ''; } catch (e) {}
            try { d0730 = localStorage.getItem('bitacora_alert_0730_date') || ''; } catch (e) {}

            if (openDate !== today) {
                try { localStorage.setItem('bitacora_alert_open_date', today); } catch (e) {}
                showDailyAlertPopup();
                return;
            }
            const now = new Date();
            const past0730 = now.getHours() > 7 || (now.getHours() === 7 && now.getMinutes() >= 30);
            if (past0730 && d0730 !== today) {
                try { localStorage.setItem('bitacora_alert_0730_date', today); } catch (e) {}
                showDailyAlertPopup();
            }
        }

