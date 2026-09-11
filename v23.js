/* ============================================================
   BITÁCORA v23 — CENTRO RESUMEN + BÚSQUEDA GLOBAL + BACKUP
   ============================================================ */

(function () {
    function esc(value) {
        if (typeof escapeHtml === 'function') return escapeHtml(String(value ?? ''));
        return String(value ?? '').replace(/[&<>"']/g, c => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
        }[c]));
    }

    function dateOf(value) {
        if (!value) return null;
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function formatDate(d) {
        return d.toLocaleDateString('es-ES', {
            day:'2-digit', month:'short', year:'numeric'
        });
    }

    function entryDate(entry) {
        return dateOf(
            entry?.startDate ||
            entry?.date ||
            entry?.birthDate ||
            entry?.endDate ||
            entry?.createdAt
        );
    }

    function collectEvents() {
        const result = [];

        (Array.isArray(entries) ? entries : []).forEach(e => {
            const d = entryDate(e);
            if (!d) return;

            const type = (typeof TYPE_LABELS !== 'undefined' && TYPE_LABELS[e.type])
                ? TYPE_LABELS[e.type]
                : (e.type || 'Entrada');

            result.push({
                date: d,
                title: e.title || e.destination || e.company || 'Entrada',
                type,
                detail: e.notes || e.description || ''
            });

            if (e.endDate && e.endDate !== e.startDate) {
                const end = dateOf(e.endDate);
                if (end) {
                    result.push({
                        date: end,
                        title: e.title || e.destination || e.company || 'Entrada',
                        type: type + ' · fin',
                        detail: 'Finalización'
                    });
                }
            }
        });

        (Array.isArray(notes) ? notes : []).forEach(n => {
            const d = dateOf(n.date || n.createdAt);
            if (!d) return;
            result.push({
                date: d,
                title: n.title || (n.date && typeof formatNoteTitle === 'function'
                    ? formatNoteTitle(n.date)
                    : 'Nota'),
                type: 'Nota',
                detail: n.text || n.content || n.body || ''
            });
        });

        // Cada punto del itinerario de un viaje tiene su propia fecha
        // (distinta del inicio/fin del viaje), así que merece su propio
        // punto en la constelación en vez de quedar oculto dentro del viaje.
        (Array.isArray(entries) ? entries : []).filter(e => e.type === 'travel').forEach(trip => {
            (Array.isArray(trip.itinerario) ? trip.itinerario : []).forEach(it => {
                const d = dateOf(it.dia);
                if (!d || !it.titulo) return;
                result.push({
                    date: d,
                    title: it.titulo,
                    type: 'Itinerario de viaje',
                    detail: `${trip.title || trip.destination || 'Viaje'}${it.hora ? ' · ' + it.hora : ''}`
                });
            });
        });

        const seen = new Set();
        return result
            .filter(e => {
                const key = `${e.date.toISOString().slice(0,10)}|${e.title}|${e.type}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .sort((a,b) => b.date - a.date);
    }

    function thisWeek(events) {
        const now = new Date();
        const start = new Date(now);
        const day = start.getDay();
        start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
        start.setHours(0,0,0,0);

        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        end.setHours(23,59,59,999);

        return events.filter(e => e.date >= start && e.date <= end)
            .sort((a,b) => a.date - b.date);
    }

    function countdown(target) {
        const ms = target - new Date();
        if (ms <= 0) return 'Ahora';

        const total = Math.floor(ms / 1000);
        const d = Math.floor(total / 86400);
        const h = Math.floor((total % 86400) / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;

        return `${d}d ${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
    }

    function historicalStats() {
        const countType = type => Array.isArray(entries)
            ? entries.filter(e => e.type === type).length
            : 0;

        const workDays = Array.isArray(entries)
            ? entries.filter(e => e.type === 'work').reduce((sum, job) => {
                return sum + countWorkingDays(job.startDate, job.endDate || todayISO());
            }, 0)
            : 0;

        return {
            total: Array.isArray(entries) ? entries.length : 0,
            books: countType('book'),
            movies: countType('movie'),
            series: countType('series'),
            games: countType('game'),
            trips: countType('travel'),
            projects: countType('project'),
            places: countType('place'),
            goals: countType('goal'),
            notes: Array.isArray(notes) ? notes.length : 0,
            workDays
        };
    }

    window.v23RenderSummaryDashboard = function () {
        const root = document.getElementById('summaryDashboard');
        if (!root) return;

        const events = collectEvents();
        const week = thisWeek(events);
        const stats = historicalStats();

        root.innerHTML = `
            <div class="summary-section">
                <div class="summary-section-head">
                    <div>
                        <div class="summary-section-title">Esta semana</div>
                        <div class="summary-section-desc">Próximos eventos y tiempo restante.</div>
                    </div>
                </div>

                ${week.length ? `
                    <div class="summary-week-events">
                        ${week.map(e => `
                            <div class="summary-event-card">
                                <div class="event-type">${esc(e.type)}</div>
                                <div class="event-name">${esc(e.title)}</div>
                                <div class="summary-countdown" data-v23-countdown="${e.date.toISOString()}">${countdown(e.date)}</div>
                                <div class="summary-countdown-label">${formatDate(e.date)}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div style="font-size:12px;color:var(--text-secondary)">
                        No hay eventos registrados para esta semana.
                    </div>
                `}
            </div>

            <div class="summary-section">
                <div class="summary-section-head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
                    <div>
                        <div class="summary-section-title">Actividad reciente</div>
                        <div class="summary-section-desc">Timeline de tu actividad, de lo más reciente hacia atrás.</div>
                    </div>
                    ${events.length ? `<button class="btn-secondary" style="width:auto;flex-shrink:0" onclick="openConstellationView()">Ver todo →</button>` : ''}
                </div>

                ${events.length ? `
                    <div class="summary-timeline">
                        ${events.slice(0, 12).map(e => `
                            <div class="timeline-item">
                                <div class="timeline-dot"></div>
                                <div class="timeline-date">${formatDate(e.date)}</div>
                                <div>
                                    <div class="timeline-title">${esc(e.title)}</div>
                                    <div class="timeline-meta">${esc(e.type)}${e.detail ? ' · ' + esc(e.detail) : ''}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div style="font-size:12px;color:var(--text-secondary)">
                        Todavía no hay actividad fechada suficiente para mostrar la timeline.
                    </div>
                `}
            </div>

            <div class="summary-section">
                <div class="summary-section-head">
                    <div>
                        <div class="summary-section-title">Estadísticas históricas</div>
                        <div class="summary-section-desc">La dimensión real de todo lo que has ido registrando en Bitácora.</div>
                    </div>
                </div>

                <div class="summary-stat-list">
                    <div class="summary-stat"><div class="num">${stats.total}</div><div class="txt">entradas</div></div>
                    <div class="summary-stat"><div class="num">${stats.books}</div><div class="txt">libros</div></div>
                    <div class="summary-stat"><div class="num">${stats.movies}</div><div class="txt">películas</div></div>
                    <div class="summary-stat"><div class="num">${stats.series}</div><div class="txt">series</div></div>
                    <div class="summary-stat"><div class="num">${stats.games}</div><div class="txt">videojuegos</div></div>
                    <div class="summary-stat"><div class="num">${stats.trips}</div><div class="txt">viajes</div></div>
                    <div class="summary-stat"><div class="num">${stats.projects}</div><div class="txt">proyectos</div></div>
                    <div class="summary-stat"><div class="num">${stats.places}</div><div class="txt">lugares</div></div>
                    <div class="summary-stat"><div class="num">${stats.goals}</div><div class="txt">objetivos</div></div>
                    <div class="summary-stat"><div class="num">${stats.notes}</div><div class="txt">notas</div></div>
                    <div class="summary-stat"><div class="num">${stats.workDays}</div><div class="txt">días cotizados</div></div>
                </div>
            </div>

            <div class="summary-section">
                <div class="summary-backup-row">
                    <div>
                        <div class="summary-section-title">Copia de seguridad</div>
                        <div class="desc">Descarga una copia completa de los datos que Bitácora tiene actualmente cargados.</div>
                    </div>
                    <button class="btn-secondary" style="width:auto" onclick="v23ExportBackup()">↧ Copia de seguridad</button>
                </div>
            </div>
        `;

        if (!window._v23Timer) {
            window._v23Timer = setInterval(() => {
                document.querySelectorAll('[data-v23-countdown]').forEach(el => {
                    const d = new Date(el.dataset.v23Countdown);
                    el.textContent = countdown(d);
                });
            }, 1000);
        }
    };

    // Vista "constelación": el mismo timeline cronológico de "Actividad
    // reciente", pero completo y navegable — para hojear todo lo vivido en
    // vez de gestionarlo. Reutiliza collectEvents() (misma fuente de datos,
    // ya deduplicada y ordenada) y el mismo estilo visual de timeline.
    window.openConstellationView = function () {
        const events = collectEvents();
        if (typeof showModal === 'function') showModal(renderConstellationModal(events, ''));
    };

    function renderConstellationTimelineHtml(events) {
        if (!events.length) return `<div style="padding:16px;color:var(--text-secondary);text-align:center">Sin resultados</div>`;
        return `<div class="summary-timeline">${events.map(e => `
            <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="timeline-date">${formatDate(e.date)}</div>
                <div>
                    <div class="timeline-title">${esc(e.title)}</div>
                    <div class="timeline-meta">${esc(e.type)}${e.detail ? ' · ' + esc(e.detail) : ''}</div>
                </div>
            </div>
        `).join('')}</div>`;
    }

    function renderConstellationModal(events, query) {
        return `
            <div class="modal-title">
                <span>Constelación</span>
                <button class="modal-close" onclick="closeModal()">✕</button>
            </div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">${events.length} momentos registrados, de más reciente a más antiguo.</div>
            <input type="text" id="constellation-search" class="modal-input" placeholder="Buscar..." value="${esc(query || '')}" oninput="filterConstellation(this.value)">
            <div id="constellation-list" style="margin-top:12px;max-height:50vh;overflow-y:auto">
                ${renderConstellationTimelineHtml(events)}
            </div>
        `;
    }

    window.filterConstellation = function (query) {
        const list = document.getElementById('constellation-list');
        if (!list) return;
        const q = String(query || '').trim().toLowerCase();
        const events = collectEvents().filter(e => !q || `${e.title} ${e.type} ${e.detail}`.toLowerCase().includes(q));
        list.innerHTML = renderConstellationTimelineHtml(events);
    };

    window.v23ExportBackup = async function () {
        try {
            if (typeof saveData === 'function') {
                try { await saveData(); } catch (e) { console.warn('Backup save:', e); }
            }

            const payload = {
                exportedAt: new Date().toISOString(),
                version: 'Bitácora v23',
                data: (typeof buildFullBackupPayload === 'function') ? buildFullBackupPayload() : {}
            };

            const blob = new Blob(
                [JSON.stringify(payload, null, 2)],
                {type:'application/json;charset=utf-8'}
            );

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `bitacora-backup-${todayISO()}.json`;
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                URL.revokeObjectURL(url);
                a.remove();
            }, 1000);

            if (typeof showToast === 'function') showToast('Copia de seguridad creada');
        } catch (e) {
            console.error(e);
            if (typeof showToast === 'function') showToast('No se pudo crear la copia de seguridad', true);
        }
    };

    window.reorderInvestmentCharts = function () {
        const projectionCanvas = document.getElementById('portfolioProjectionChart');
        const historyCanvas = document.getElementById('portfolioHistoryChart');
        if (!projectionCanvas || !historyCanvas) return;

        const projectionCard = projectionCanvas.closest('.investment-chart-card');
        const historyCard = historyCanvas.closest('.investment-chart-card');
        if (!projectionCard || !historyCard || projectionCard === historyCard) return;

        historyCard.parentNode.insertBefore(projectionCard, historyCard);
    };

    function collectSearchResults() {
        const out = [];
        const push = (kind, title, detail, action) => {
            if (title || detail) out.push({
                kind,
                title: title || 'Sin título',
                detail: detail || '',
                action
            });
        };

        (Array.isArray(entries) ? entries : []).forEach(e => {
            const type = (typeof TYPE_LABELS !== 'undefined' && TYPE_LABELS[e.type])
                ? TYPE_LABELS[e.type]
                : (e.type || 'Entrada');

            push(
                type,
                e.title || e.destination || e.company || 'Sin título',
                e.notes || e.description || '',
                () => {
                    if (e.id && typeof openEntryDetail === 'function') openEntryDetail(e.id);
                }
            );
        });

        (Array.isArray(notes) ? notes : []).forEach(n => {
            push(
                'Nota',
                n.title || (n.date && typeof formatNoteTitle === 'function'
                    ? formatNoteTitle(n.date)
                    : 'Nota'),
                n.text || n.content || '',
                () => {
                    if (n.id && typeof openReadNote === 'function') openReadNote(n.id);
                }
            );
        });


        (Array.isArray(apuntes) ? apuntes : []).forEach(a => {
            push(
                'Apunte',
                a.title || a.name || 'Apunte',
                a.date || '',
                () => {
                    if (typeof openApuntes === 'function') openApuntes();
                }
            );
        });

        // Contenido de cada viaje (lugares, itinerario, listas): vive anidado
        // dentro de cada entry de tipo 'travel', así que el bucle de arriba
        // (que solo mira title/notes del viaje) no llega a este nivel.
        (Array.isArray(entries) ? entries : []).filter(e => e.type === 'travel').forEach(trip => {
            (Array.isArray(trip.places) ? trip.places : []).forEach(p => {
                push('Lugar de viaje', p.nombre || 'Lugar', trip.title || trip.destination || '', () => {
                    if (typeof openTripManager === 'function') { openTripManager(trip.id); setTripManagerTab('lugares'); }
                });
            });
            (Array.isArray(trip.itinerario) ? trip.itinerario : []).forEach(it => {
                push('Itinerario de viaje', it.titulo || 'Plan', trip.title || trip.destination || '', () => {
                    if (typeof openTripManager === 'function') { openTripManager(trip.id); setTripManagerTab('itinerario'); }
                });
            });
            (Array.isArray(trip.listas) ? trip.listas : []).forEach(lista => {
                (Array.isArray(lista.items) ? lista.items : []).forEach(item => {
                    push('Lista de viaje', item.texto || 'Elemento', `${lista.nombre || 'Lista'} · ${trip.title || trip.destination || ''}`, () => {
                        if (typeof openTripManager === 'function') { openTripManager(trip.id); setTripManagerTab('listas'); }
                    });
                });
            });
        });

        (typeof studies !== 'undefined' && Array.isArray(studies.subjects) ? studies.subjects : []).forEach(s => {
            push('Asignatura', s.name || 'Asignatura', '', () => { if (typeof switchView === 'function') switchView('studies'); });
            (Array.isArray(s.exams) ? s.exams : []).forEach(ex => {
                push('Examen', ex.title || 'Examen', s.name || '', () => { if (typeof switchView === 'function') switchView('studies'); });
            });
            (Array.isArray(s.assignments) ? s.assignments : []).forEach(as => {
                push('Trabajo', as.title || 'Trabajo', s.name || '', () => { if (typeof switchView === 'function') switchView('studies'); });
            });
        });

        (Array.isArray(links) ? links : []).forEach(l => {
            push('Enlace', l.title || l.url || 'Enlace', l.url || '', () => { if (typeof switchView === 'function') switchView('links'); });
        });

        (Array.isArray(collectibles) ? collectibles : []).forEach(c => {
            push('Coleccionable', c.name || 'Coleccionable', c.category || '', () => { if (typeof switchView === 'function') switchView('collectibles'); });
        });

        (typeof amigos !== 'undefined' && Array.isArray(amigos) ? amigos : []).forEach(a => {
            push('Amigo', a.nombre_visible || a.friend_nombre || 'Amigo', '', () => { if (typeof switchView === 'function') switchView('friends'); });
        });

        (typeof recomendaciones !== 'undefined' && Array.isArray(recomendaciones) ? recomendaciones : []).forEach(r => {
            const tipoLabel = { book: 'Libro', movie: 'Película', series: 'Serie', game: 'Videojuego' }[r.tipo] || 'Recomendación';
            push(`Recomendación · ${tipoLabel}`, (r.entrada && r.entrada.title) || 'Recomendación', `De ${r.remitente_nombre || 'un amigo'}`, () => {
                if (typeof switchView !== 'function') return;
                if (typeof CULTURE_TYPE_TO_TAB !== 'undefined') cultureTab = CULTURE_TYPE_TO_TAB[r.tipo] || 'books';
                cultureSharedMode = true;
                switchView('culture');
            });
        });

        return out.filter((r, i, arr) =>
            arr.findIndex(x => `${x.kind}|${x.title}|${x.detail}` === `${r.kind}|${r.title}|${r.detail}`) === i
        );
    }

    window.v23RunGlobalSearch = function (query) {
        const box = document.getElementById('globalSearchResults');
        if (!box) return;

        const q = String(query || '').trim().toLowerCase();
        if (!q) {
            box.style.display = 'none';
            box.innerHTML = '';
            return;
        }

        const results = collectSearchResults()
            .filter(r => `${r.kind} ${r.title} ${r.detail}`.toLowerCase().includes(q))
            .slice(0, 40);

        box.innerHTML = results.length
            ? results.map((r, i) => `
                <div class="global-search-result" data-v23-result="${i}">
                    <div style="min-width:0">
                        <div class="result-kind">${esc(r.kind)}</div>
                        <div class="result-title">${esc(r.title)}</div>
                        ${r.detail ? `<div class="result-detail">${esc(r.detail)}</div>` : ''}
                    </div>
                </div>
            `).join('')
            : `<div style="padding:14px;font-size:12px;color:var(--text-secondary)">No se han encontrado resultados.</div>`;

        if (results.length) {
            box.querySelectorAll('[data-v23-result]').forEach((el, i) => {
                el.addEventListener('click', () => {
                    try { results[i].action?.(); } catch (e) { console.warn(e); }
                    box.style.display = 'none';
                });
            });
        }

        box.style.display = 'block';
    };

    function initSearch() {
        const input =
            document.querySelector('#globalSearch') ||
            document.querySelector('#search') ||
            document.querySelector('input[placeholder*="Buscar" i]');

        if (!input || input.dataset.v23Bound) return;
        input.dataset.v23Bound = '1';

        input.addEventListener('input', () => v23RunGlobalSearch(input.value));
        input.addEventListener('focus', () => {
            if (input.value.trim()) v23RunGlobalSearch(input.value);
        });

        document.addEventListener('click', e => {
            const box = document.getElementById('globalSearchResults');
            if (!box || box.contains(e.target) || e.target === input) return;
            box.style.display = 'none';
        });
    }

    function init() {
        initSearch();
        if (typeof currentView !== 'undefined' && currentView === 'home') {
            requestAnimationFrame(() => v23RenderSummaryDashboard());
        }
    }

    function initSidebarScrollFade() {
        const sb = document.getElementById('sidebar');
        if (!sb) return;
        const updateFade = () => {
            const atBottom = sb.scrollHeight - sb.scrollTop - sb.clientHeight < 4;
            sb.classList.toggle('at-bottom', atBottom || sb.scrollHeight <= sb.clientHeight);
        };
        sb.addEventListener('scroll', updateFade);
        window.addEventListener('resize', updateFade);
        updateFade();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSidebarScrollFade);
    } else {
        initSidebarScrollFade();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
