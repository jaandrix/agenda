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

    // ------------------------------------------------------------
    //  MIS TAREAS: agrega lo pendiente de Proyectos, Objetivos, el
    //  Planificador de hoy y las tareas recurrentes en una sola lista,
    //  para no tener que ir sección por sección a ver qué falta.
    // ------------------------------------------------------------
    function collectMyTasks() {
        const tasks = [];
        const today = typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10);

        if (typeof recurringTasksDueToday === 'function') {
            recurringTasksDueToday().forEach(t => {
                if (!(t.completadas && t.completadas[today])) {
                    tasks.push({ texto: t.texto, fuente: 'Recurrente de hoy', onclick: `toggleMyTaskRecurring('${t.id}')` });
                }
            });
        }

        if (typeof dayPlanner !== 'undefined' && Array.isArray(dayPlanner.items)) {
            dayPlanner.items.filter(it => !it.done).forEach(it => {
                tasks.push({ texto: `${it.time ? it.time + ' · ' : ''}${it.title}`, fuente: 'Hoy', onclick: `toggleMyTaskPlanner('${it.id}')` });
            });
        }

        if (typeof entries !== 'undefined') {
            entries.filter(e => e.type === 'project').forEach(p => {
                (p.tasks || []).forEach((t, i) => {
                    if (!t.done) tasks.push({ texto: t.text, fuente: `Proyecto · ${p.title}`, onclick: `toggleMyTaskProjectTask('${p.id}',${i})` });
                });
            });
            entries.filter(e => e.type === 'goal').forEach(g => {
                (g.milestones || []).forEach((m, i) => {
                    if (!m.done) tasks.push({ texto: m.text, fuente: `Objetivo · ${g.title}`, onclick: `toggleMyTaskGoalMilestone('${g.id}',${i})` });
                });
            });
        }

        return tasks;
    }

    function renderMyTasksSection() {
        const tasks = collectMyTasks();
        return `
            <div class="summary-section" id="summary-mytasks-section">
                <div class="summary-section-head">
                    <div>
                        <div class="summary-section-title">Mis tareas</div>
                        <div class="summary-section-desc">Todo lo pendiente de Proyectos, Objetivos, el Planificador de hoy y las tareas recurrentes, en un solo sitio.</div>
                    </div>
                </div>
                ${tasks.length ? `
                    <div class="mytasks-list">
                        ${tasks.map(t => `
                            <label class="mytasks-row">
                                <input type="checkbox" onchange="${t.onclick}">
                                <div class="mytasks-row-body">
                                    <div class="mytasks-row-text">${esc(t.texto)}</div>
                                    <div class="mytasks-row-source">${esc(t.fuente)}</div>
                                </div>
                            </label>
                        `).join('')}
                    </div>
                ` : `<div style="font-size:12px;color:var(--text-secondary)">Sin tareas pendientes ahora mismo.</div>`}
            </div>
        `;
    }

    // ------------------------------------------------------------
    //  REVISIÓN SEMANAL: un paso atrás antes de seguir añadiendo cosas —
    //  esfuerzo medio de los últimos 7 días (del calendario anual) y los
    //  proyectos/objetivos activos, ordenados por el que menos avanza
    //  primero, para que salte a la vista qué se está quedando atrás.
    // ------------------------------------------------------------
    function collectWeeklyReview() {
        const allEntries = typeof entries !== 'undefined' ? entries : [];

        const projects = allEntries
            .filter(e => e.type === 'project' && (typeof projectStatusBucket !== 'function' || projectStatusBucket(e.status) !== 'Completado'))
            .map(p => {
                const prog = typeof projectTaskProgress === 'function' ? projectTaskProgress(p) : { total: 0, pct: 0 };
                return { id: p.id, title: p.title, pct: prog.pct };
            })
            .sort((a, b) => a.pct - b.pct);

        const goals = allEntries
            .filter(e => e.type === 'goal' && e.status !== 'Completado' && e.status !== 'Conseguido')
            .map(g => {
                let pct = typeof goalProgressPct === 'function' ? goalProgressPct(g) : null;
                if (pct === null && Array.isArray(g.milestones) && g.milestones.length) {
                    pct = Math.round(g.milestones.filter(m => m.done).length / g.milestones.length * 100);
                }
                return { id: g.id, title: g.title, pct };
            })
            .sort((a, b) => (a.pct ?? -1) - (b.pct ?? -1));

        let effortSum = 0, effortCount = 0;
        if (typeof dailyEffort === 'object' && dailyEffort) {
            const today = new Date();
            for (let i = 0; i < 7; i++) {
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                const key = d.toISOString().slice(0, 10);
                const v = dailyEffort[key] || 0;
                if (v > 0) { effortSum += v; effortCount++; }
            }
        }

        return { projects, goals, effortAvg: effortCount ? effortSum / effortCount : null, effortCount };
    }

    function renderWeeklyReviewSection() {
        const r = collectWeeklyReview();
        const hasContent = r.projects.length || r.goals.length;
        return `
            <div class="summary-section" id="summary-review-section">
                <div class="summary-section-head">
                    <div>
                        <div class="summary-section-title">Revisión semanal</div>
                        <div class="summary-section-desc">Un vistazo a lo que sigue en marcha, antes de seguir añadiendo cosas nuevas.</div>
                    </div>
                </div>
                <div class="review-effort-line">
                    ${r.effortCount
                        ? `Esfuerzo medio de los últimos 7 días: <strong>${r.effortAvg.toFixed(1)} / 5</strong> (${r.effortCount} día${r.effortCount === 1 ? '' : 's'} puntuado${r.effortCount === 1 ? '' : 's'})`
                        : `<span style="color:var(--text-secondary)">Aún no has puntuado ningún día de esta semana en la vista de esfuerzo del calendario anual.</span>`}
                </div>
                ${hasContent ? `
                    <div class="review-grid">
                        ${r.projects.length ? `
                            <div class="review-col">
                                <div class="review-col-title">Proyectos activos</div>
                                ${r.projects.map(p => `
                                    <div class="review-item" data-open-entry="${p.id}">
                                        <span class="review-item-text">${esc(p.title)}</span>
                                        <div class="progress-bar-bg" style="margin-top:4px"><div class="progress-bar-fill" style="width:${p.pct}%;background:#2563eb"></div></div>
                                    </div>
                                `).join('')}
                            </div>` : ''}
                        ${r.goals.length ? `
                            <div class="review-col">
                                <div class="review-col-title">Objetivos activos</div>
                                ${r.goals.map(g => `
                                    <div class="review-item" data-open-entry="${g.id}">
                                        <span class="review-item-text">${esc(g.title)}</span>
                                        ${g.pct !== null ? `<div class="progress-bar-bg" style="margin-top:4px"><div class="progress-bar-fill" style="width:${g.pct}%;background:#2563eb"></div></div>` : `<span class="review-item-nodata">sin progreso medible</span>`}
                                    </div>
                                `).join('')}
                            </div>` : ''}
                    </div>
                ` : `<div style="font-size:12px;color:var(--text-secondary);margin-top:6px">Sin proyectos ni objetivos activos ahora mismo.</div>`}
            </div>
        `;
    }

    // Envoltorios: las funciones "toggle" propias de cada sección hacen
    // cosas específicas de su vista (reabrir un modal, refrescar el
    // Planificador...) que no encajan sueltas en Centro resumen — estos
    // wrappers llaman a la función real y luego solo refrescan el popup
    // abierto (Centro resumen ya no tiene un panel fijo en la página).
    function v23RefreshOpenPopup() {
        const sheet = document.querySelector('.modal-sheet');
        if (!sheet) return;
        if (sheet.querySelector('#summary-mytasks-section')) sheet.innerHTML = renderMyTasksSection();
        else if (sheet.querySelector('#summary-review-section')) sheet.innerHTML = renderWeeklyReviewSection();
    }
    window.toggleMyTaskRecurring = async function (id) {
        if (typeof toggleRecurringTaskDoneToday === 'function') await toggleRecurringTaskDoneToday(id);
        v23RefreshOpenPopup();
    };
    window.toggleMyTaskPlanner = async function (id) {
        if (typeof togglePlannerItemDone === 'function') await togglePlannerItemDone(id);
        v23RefreshOpenPopup();
    };
    window.toggleMyTaskProjectTask = async function (projectId, taskIndex) {
        const project = entries.find(e => e.id === projectId);
        if (!project || !Array.isArray(project.tasks) || !project.tasks[taskIndex]) return;
        project.tasks[taskIndex].done = !project.tasks[taskIndex].done;
        try { await saveData(); } catch (e) { console.error(e); }
        v23RefreshOpenPopup();
    };
    window.toggleMyTaskGoalMilestone = async function (goalId, index) {
        const goal = entries.find(e => e.id === goalId);
        if (!goal || !Array.isArray(goal.milestones) || !goal.milestones[index]) return;
        goal.milestones[index].done = !goal.milestones[index].done;
        try { await saveData(); } catch (e) { console.error(e); }
        v23RefreshOpenPopup();
    };

    // Centro resumen (categorías → popup): estos tres abren en modal las
    // secciones que antes vivían fijas en la página.
    window.openHomeTasksModal = function () {
        if (typeof showModal === 'function') showModal(renderMyTasksSection());
    };
    window.openHomeReviewModal = function () {
        if (typeof showModal === 'function') showModal(renderWeeklyReviewSection());
    };
    window.openHomeWeekModal = function () {
        if (typeof showModal === 'function') showModal(renderWeekSection());
    };

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

    // "Esta semana" — antes vivía fija en el panel de Centro resumen,
    // ahora es el contenido de la categoría "esta semana." (popup). El
    // contador en vivo sigue actualizándose mientras el popup está abierto
    // (el intervalo ya solo toca elementos [data-v23-countdown] que existan).
    function renderWeekSection() {
        const week = thisWeek(collectEvents());
        v23StartCountdownTimer();
        return `
            <div class="summary-section" id="summary-week-section">
                <div class="summary-section-head">
                    <div>
                        <div class="summary-section-title">Esta semana</div>
                        <div class="summary-section-desc">Próximos eventos y tiempo restante.</div>
                    </div>
                </div>

                ${week.length ? `
                    <div class="week-events-list">
                        ${week.map((e, i) => `
                            <div class="week-event-row">
                                <div class="week-event-index">${String(i + 1).padStart(2, '0')}</div>
                                <div class="week-event-body">
                                    <div class="week-event-title">${esc(e.title)}</div>
                                    <div class="week-event-meta">${esc(e.type)} · ${formatDate(e.date)}</div>
                                </div>
                                <div class="week-event-countdown" data-v23-countdown="${e.date.toISOString()}">${countdown(e.date)}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div style="font-size:12px;color:var(--text-secondary)">
                        No hay eventos registrados para esta semana.
                    </div>
                `}
            </div>
        `;
    }

    function v23StartCountdownTimer() {
        if (window._v23Timer) return;
        window._v23Timer = setInterval(() => {
            document.querySelectorAll('[data-v23-countdown]').forEach(el => {
                const d = new Date(el.dataset.v23Countdown);
                el.textContent = countdown(d);
            });
        }, 1000);
    }

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
