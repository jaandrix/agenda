        // ============================================================
        //  PLANIFICADOR DEL DÍA (sustituye a Apuntes)
        //  Cada día lógico (4:00 am - 4:00 am) tiene su propia lista de
        //  eventos, para poder planificar hoy, mañana y pasado mañana
        //  por adelantado. Los días pasados se limpian solos.
        // ============================================================

        const PLANNER_DAY_TABS = [
            { offset: 0, label: 'Hoy' },
            { offset: 1, label: 'Mañana' },
            { offset: 2, label: 'Pasado mañana' }
        ];

        // Clave del "día lógico" para un desplazamiento de días dado: antes de
        // las 4:00 am se sigue considerando parte del día anterior.
        function currentPlannerDayKey(date = new Date(), offsetDays = 0) {
            const d = new Date(date);
            if (d.getHours() < 4) d.setDate(d.getDate() - 1);
            d.setDate(d.getDate() + offsetDays);
            return d.toISOString().slice(0, 10);
        }

        // Adapta datos guardados con el formato antiguo (un único { dayKey, items })
        // al nuevo formato multi-día { days: { AAAA-MM-DD: items[] } }.
        function migratePlannerData(saved) {
            const backlog = (saved && typeof saved === 'object' && Array.isArray(saved.backlog)) ? saved.backlog : [];
            if (saved && typeof saved === 'object' && saved.days && typeof saved.days === 'object') {
                const days = {};
                Object.keys(saved.days).forEach(k => { days[k] = Array.isArray(saved.days[k]) ? saved.days[k] : []; });
                return { days, backlog };
            }
            if (saved && typeof saved === 'object' && Array.isArray(saved.items) && saved.items.length) {
                const key = saved.dayKey || currentPlannerDayKey();
                return { days: { [key]: saved.items }, backlog };
            }
            return { days: {}, backlog };
        }

        function resetDayPlannerIfNeeded() {
            if (!dayPlanner || typeof dayPlanner !== 'object') dayPlanner = { days: {} };
            if (!dayPlanner.days || typeof dayPlanner.days !== 'object') dayPlanner.days = {};
            if (!Array.isArray(dayPlanner.backlog)) dayPlanner.backlog = [];

            // Lo que quedó sin marcar como hecho en un día ya pasado se
            // arrastra a hoy en vez de perderse (se detecta en cuanto
            // cambia la fecha — ver plannerLastTodayKey en
            // updateSidebarProgress), marcado como "arrastrado" para
            // poder destacarlo como prioritario.
            const todayKey = currentPlannerDayKey();
            if (!Array.isArray(dayPlanner.days[todayKey])) dayPlanner.days[todayKey] = [];
            Object.keys(dayPlanner.days).forEach(k => {
                if (k >= todayKey) return;
                (dayPlanner.days[k] || []).forEach(it => {
                    if (!it.done) {
                        it.arrastrado = true;
                        dayPlanner.days[todayKey].push(it);
                    }
                });
                delete dayPlanner.days[k];
            });
        }

        function plannerItemsForOffset(offset) {
            resetDayPlannerIfNeeded();
            const key = currentPlannerDayKey(new Date(), offset);
            if (!Array.isArray(dayPlanner.days[key])) dayPlanner.days[key] = [];
            return dayPlanner.days[key];
        }

        // Rediseño visual del planificador inspirado en una app de tarjeta
        // de fidelización (tarjetas de acción cuadradas arriba, franja de
        // sellos con el progreso del día) — mismo blanco/negro/gris de
        // siempre, solo que con más aire y más peso visual que la lista
        // plana de antes.
        const PLANNER_ICON_ADD = '<svg viewBox="0 0 100 100" fill="currentColor"><rect x="42" y="8" width="16" height="84" rx="7"/><rect x="8" y="42" width="84" height="16" rx="7"/></svg>';
        const PLANNER_ICON_REPEAT = '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 45a32 32 0 0 1 58-17"/><path d="M82 55a32 32 0 0 1-58 17"/><path d="M64 13l14 15-14 15"/><path d="M36 87l-14-15 14-15"/></svg>';

        // Franja de "sellos" con el progreso del día — un punto por tarea
        // (eventos + recurrentes de hoy), relleno si ya está hecha. Solo
        // se muestra en la pestaña "Hoy": en mañana/pasado mañana no hay
        // nada que "progresar" todavía.
        function renderPlannerStampBar(items, dueToday, today) {
            const total = items.length + dueToday.length;
            if (!total) return '';
            const done = items.filter(i => i.done).length + dueToday.filter(t => t.completadas?.[today]).length;
            const dots = Array.from({ length: total }, (_, i) => `<span class="planner-stamp-dot ${i < done ? 'filled' : ''}"></span>`).join('');
            return `
            <div class="planner-stamp-bar">
                <div class="planner-stamp-label">progreso de hoy.</div>
                <div class="planner-stamp-dots">${dots}</div>
                <div class="planner-stamp-count">${done}/${total}</div>
            </div>`;
        }

        function setPlannerDayOffset(offset) {
            const tipo = offset > plannerDayOffset ? 'adelante' : offset < plannerDayOffset ? 'atras' : 'fundido';
            conTransicion(tipo, () => {
                plannerDayOffset = offset;
                if (currentView === 'planner') render();
            });
        }

        function renderPlanner() {
            resetDayPlannerIfNeeded();
            const offset = plannerDayOffset;
            const items = [...plannerItemsForOffset(offset)].sort((a, b) => String(a.time).localeCompare(String(b.time)));
            const now = new Date();
            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            const today = todayISO();
            const dueToday = offset === 0 ? recurringTasksDueToday() : [];
            // Las tarjetas de acción siempre reflejan lo de HOY, aunque se
            // esté mirando la pestaña de mañana/pasado mañana.
            const todayItemsCount = offset === 0 ? items.length : plannerItemsForOffset(0).length;
            const todayDueCount = offset === 0 ? dueToday.length : recurringTasksDueToday().length;
            const activeLabel = PLANNER_DAY_TABS.find(t => t.offset === offset)?.label || 'Hoy';
            const emptyLabel = offset === 0 ? 'para hoy' : (offset === 1 ? 'para mañana' : 'para pasado mañana');

            return `
            <div class="planner-view">
                <div class="planner-head">
                    <div>
                        <div class="finance-kicker">${activeLabel}</div>
                        <h3 style="margin:2px 0 0 0">planificador.</h3>
                        <p style="font-size:12px;color:var(--text-secondary);margin-top:4px">
                            Cada día empieza de cero a las 4:00 am — lo que no marques como hecho se arrastra a hoy, destacado en granate. Puedes ir dejando planificados los próximos dos días.
                        </p>
                    </div>
                </div>

                ${offset === 0 ? renderPlannerStampBar(items, dueToday, today) : ''}

                <div class="planner-action-row">
                    <button class="planner-action-card" onclick="openAddPlannerItem()" title="+ evento.">
                        <span class="planner-action-icon">${PLANNER_ICON_ADD}</span>
                        <span class="planner-action-count">${todayItemsCount} hoy.</span>
                    </button>
                    <button class="planner-action-card" onclick="openManageRecurringTasks()" title="recurrentes.">
                        <span class="planner-action-icon">${PLANNER_ICON_REPEAT}</span>
                        <span class="planner-action-count">${todayDueCount} hoy.</span>
                    </button>
                </div>

                ${renderPlannerBacklog()}

                <div class="culture-tabs" style="margin-bottom:18px">
                    ${PLANNER_DAY_TABS.map(t => `
                        <button class="culture-tab ${offset === t.offset ? 'active' : ''}" onclick="setPlannerDayOffset(${t.offset})">${t.label}</button>
                    `).join('')}
                </div>

                ${dueToday.length ? `
                    <div class="planner-recurring-block">
                        <div class="planner-recurring-title">Recurrentes de hoy</div>
                        ${dueToday.map(t => `
                            <label class="planner-recurring-row">
                                <input type="checkbox" ${t.completadas?.[today] ? 'checked' : ''} onchange="toggleRecurringTaskDoneToday('${t.id}')">
                                <span class="${t.completadas?.[today] ? 'done' : ''}">${escapeHtml(t.texto)}</span>
                            </label>
                        `).join('')}
                    </div>
                ` : ''}

                <div class="planner-timeline vt-interior">
                    ${items.length ? items.map(it => {
                        const [h, m] = String(it.time).split(':').map(Number);
                        const itemMinutes = (h || 0) * 60 + (m || 0);
                        const isPast = offset === 0 && itemMinutes < nowMinutes;
                        return `
                        <div class="planner-item ${isPast && !it.arrastrado ? 'planner-item-past' : ''} ${it.done ? 'planner-item-done' : ''} ${it.arrastrado ? 'planner-item-arrastrado' : ''}">
                            <div class="planner-item-time">${escapeHtml(it.time)}</div>
                            <input type="checkbox" class="planner-item-check" ${it.done ? 'checked' : ''} onchange="togglePlannerItemDone('${it.id}', ${offset})">
                            <div class="planner-item-body">
                                <div class="planner-item-title"><span ${it.arrastrado && !it.done ? 'title="Pendiente de ayer"' : ''} ${it.valorarPeliculaId ? `class="planner-item-enlace" onclick="openEditEntry('${it.valorarPeliculaId}')" title="Abrir la película para valorarla"` : ''}>${escapeHtml(it.title)}</span></div>
                                ${it.notes ? `<div class="planner-item-notes">${escapeHtml(it.notes)}</div>` : ''}
                                ${renderPlannerSubtasks(it, offset)}
                            </div>
                            <button class="planner-item-delete" title="Eliminar" onclick="deletePlannerItem('${it.id}', ${offset})">×</button>
                        </div>`;
                    }).join('') : `
                        <div class="finance-empty-state">Aún no has añadido eventos ${emptyLabel}. Pulsa <strong>+ evento.</strong> para empezar tu planificación.</div>
                    `}
                </div>
            </div>`;
        }

        // "Tareas pendientes." — un backlog sin día ni hora, aparte de la
        // timeline (que siempre exige ambos). Vive fuera de dayPlanner.days
        // porque no pertenece a ningún día: se ve igual sin importar la
        // pestaña (hoy/mañana/pasado mañana) que tengas seleccionada.
        // "→ hoy" la convierte en un evento normal de la timeline de hoy
        // cuando por fin le toca hacerse.
        function renderPlannerBacklog() {
            resetDayPlannerIfNeeded();
            const items = dayPlanner.backlog;
            return `
            <div class="planner-backlog">
                <div class="planner-backlog-head">
                    <div class="planner-backlog-title">tareas pendientes.</div>
                    <button class="planner-backlog-add" onclick="openAddBacklogTask()">+ tarea</button>
                </div>
                ${items.length ? items.map(it => renderBacklogRow(it)).join('') : '<div class="finance-empty-line" style="margin:6px 0 4px">Sin tareas pendientes — apunta aquí lo que quieras hacer sin ponerle día todavía.</div>'}
            </div>`;
        }

        function renderBacklogRow(it) {
            return `
                <div class="planner-backlog-row ${it.done ? 'done' : ''}">
                    <input type="checkbox" class="planner-item-check" ${it.done ? 'checked' : ''} onchange="toggleBacklogTaskDone('${it.id}')">
                    <div class="planner-backlog-row-body">
                        <div class="planner-backlog-row-title">${escapeHtml(it.title)}</div>
                        ${it.notes ? `<div class="planner-backlog-row-notes">${escapeHtml(it.notes)}</div>` : ''}
                    </div>
                    <button class="planner-backlog-schedule" title="Asignar a hoy" onclick="scheduleBacklogTaskToday('${it.id}')">→ hoy</button>
                    <button class="planner-item-delete" title="Eliminar" onclick="deleteBacklogTask('${it.id}')">×</button>
                </div>`;
        }

        function openAddBacklogTask() {
            showModal(`
                <div class="modal-title">+ Tarea pendiente</div>
                <div class="modal-label">Título</div>
                <input id="backlog-task-title" class="modal-input" type="text" placeholder="¿Qué tienes pendiente?">
                <div class="modal-label">Notas (opcional)</div>
                <textarea id="backlog-task-notes" class="modal-input" rows="2" placeholder="Detalles adicionales..."></textarea>
                <button class="btn-modal-primary" onclick="saveBacklogTask()">Añadir a pendientes</button>
            `);
            setTimeout(() => document.getElementById('backlog-task-title')?.focus(), 50);
        }

        async function saveBacklogTask() {
            const title = document.getElementById('backlog-task-title')?.value.trim() || '';
            const notes = document.getElementById('backlog-task-notes')?.value.trim() || '';
            if (!title) { showToast('Indica un título', true); return; }
            resetDayPlannerIfNeeded();
            dayPlanner.backlog.unshift({ id: 'backlog_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), title, notes, done: false });
            closeModal();
            if (currentView === 'planner') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function toggleBacklogTaskDone(id) {
            resetDayPlannerIfNeeded();
            const item = dayPlanner.backlog.find(it => it.id === id);
            if (!item) return;
            item.done = !item.done;
            if (currentView === 'planner') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteBacklogTask(id) {
            resetDayPlannerIfNeeded();
            dayPlanner.backlog = dayPlanner.backlog.filter(it => it.id !== id);
            if (currentView === 'planner') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // Pasa una tarea pendiente sin día a la timeline de hoy, con la
        // misma hora redondeada por defecto que usa "+ Evento".
        async function scheduleBacklogTaskToday(id) {
            resetDayPlannerIfNeeded();
            const item = dayPlanner.backlog.find(it => it.id === id);
            if (!item) return;
            const now = new Date();
            const time = `${String(now.getHours()).padStart(2, '0')}:${String(Math.ceil(now.getMinutes() / 5) * 5 % 60).padStart(2, '0')}`;
            plannerItemsForOffset(0).push({ id: 'planner_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), time, title: item.title, notes: item.notes || '', done: false });
            dayPlanner.backlog = dayPlanner.backlog.filter(it => it.id !== id);
            if (currentView === 'planner') render();
            try { await saveData(); showToast('Añadida a la timeline de hoy'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // Subtareas de un elemento del planificador: mismo patrón que las
        // tareas de un proyecto, pero por ítem del día.
        function renderPlannerSubtasks(it, offset) {
            const subtasks = Array.isArray(it.subtasks) ? it.subtasks : [];
            return `
                <div class="planner-item-subtasks">
                    ${subtasks.map(st => `
                        <label class="planner-subtask-row">
                            <input type="checkbox" ${st.done ? 'checked' : ''} onchange="togglePlannerSubtaskDone('${it.id}','${st.id}',${offset})">
                            <span class="${st.done ? 'done' : ''}">${escapeHtml(st.text)}</span>
                        </label>`).join('')}
                    <button type="button" class="planner-subtask-add" onclick="addPlannerSubtask('${it.id}',${offset})">+ subtarea</button>
                </div>`;
        }

        async function addPlannerSubtask(itemId, offset) {
            const text = prompt('Nueva subtarea');
            if (!text || !text.trim()) return;
            const item = plannerItemsForOffset(offset).find(it => it.id === itemId);
            if (!item) return;
            item.subtasks = Array.isArray(item.subtasks) ? item.subtasks : [];
            item.subtasks.push({ id: 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), text: text.trim(), done: false });
            if (currentView === 'planner') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function togglePlannerSubtaskDone(itemId, subtaskId, offset) {
            const item = plannerItemsForOffset(offset).find(it => it.id === itemId);
            const sub = item?.subtasks?.find(s => s.id === subtaskId);
            if (!sub) return;
            sub.done = !sub.done;
            if (currentView === 'planner') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openAddPlannerItem() {
            const offset = plannerDayOffset;
            const now = new Date();
            const defaultTime = offset === 0
                ? `${String(now.getHours()).padStart(2, '0')}:${String(Math.ceil(now.getMinutes() / 5) * 5 % 60).padStart(2, '0')}`
                : '09:00';
            const titleSuffix = offset === 0 ? 'de hoy' : (offset === 1 ? 'de mañana' : 'de pasado mañana');
            showModal(`
                <div class="modal-title">+ Evento ${titleSuffix}</div>
                <div class="modal-label">Hora</div>
                <input id="planner-item-time" class="modal-input" type="time" value="${defaultTime}">
                <div class="modal-label">Título</div>
                <input id="planner-item-title" class="modal-input" type="text" placeholder="¿Qué vas a hacer?">
                <div class="modal-label">Notas (opcional)</div>
                <textarea id="planner-item-notes" class="modal-input" rows="2" placeholder="Detalles adicionales..."></textarea>
                <button class="btn-modal-primary" onclick="savePlannerItem(${offset})">Añadir a la timeline</button>
            `);
            setTimeout(() => document.getElementById('planner-item-title')?.focus(), 50);
        }

        async function savePlannerItem(offset = plannerDayOffset) {
            const time = document.getElementById('planner-item-time')?.value || '';
            const title = document.getElementById('planner-item-title')?.value.trim() || '';
            const notes = document.getElementById('planner-item-notes')?.value.trim() || '';
            if (!time || !title) { showToast('Indica al menos hora y título', true); return; }

            plannerItemsForOffset(offset).push({
                id: 'planner_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                time, title, notes, done: false
            });
            closeModal();
            if (currentView === 'planner') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deletePlannerItem(id, offset = plannerDayOffset) {
            const key = currentPlannerDayKey(new Date(), offset);
            resetDayPlannerIfNeeded();
            if (Array.isArray(dayPlanner.days[key])) {
                // Una tarea que viene de un trabajo de Estudios se recrea en
                // cada carga (syncAssignmentPlannerItem): borrarla aquí solo
                // no bastaba, volvía al recargar. Se marca en el propio
                // trabajo que el usuario no la quiere en el planificador.
                const borrada = dayPlanner.days[key].find(it => it.id === id);
                if (borrada?.linkedAssignmentId) {
                    const trabajo = findAssignmentById(borrada.linkedAssignmentId);
                    if (trabajo) trabajo.fueraDelPlanificador = true;
                }
                dayPlanner.days[key] = dayPlanner.days[key].filter(it => it.id !== id);
            }
            if (currentView === 'planner') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function togglePlannerItemDone(id, offset = plannerDayOffset) {
            const item = plannerItemsForOffset(offset).find(it => it.id === id);
            if (!item) return;
            item.done = !item.done;

            // Si es un trabajo enlazado desde Estudios, el propio trabajo
            // guarda si está hecho — es la única copia que sobrevive una
            // vez el día pasa y esta tarea del planificador se archiva
            // (se borra). Sin esto, la siguiente sincronización no tenía
            // forma de saber que ya estaba hecha y la resucitaba pendiente.
            if (item.linkedAssignmentId) {
                const assignment = findAssignmentById(item.linkedAssignmentId);
                if (assignment) assignment.done = item.done;
            }

            // Al completarla, queda constancia como evento en el calendario
            // (con la fecha real en que se completó); al desmarcarla, se retira.
            const doneEntryId = 'planner_done_' + item.id;
            entries = entries.filter(e => e.id !== doneEntryId);
            if (item.done) {
                entries.push({
                    id: doneEntryId,
                    type: 'event',
                    eventType: 'otro',
                    title: 'Completado: ' + item.title,
                    date: todayISO(),
                    time: item.time || '',
                    place: '',
                    notes: item.notes || '',
                    category: 'Planificador',
                    calendarLog: true
                });
            }
            filteredEntries = [...entries];

            if (currentView === 'planner') render();
            else if (currentView === 'calendar' || currentView === 'home') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // ------------------------------------------------------------
        //  TAREAS RECURRENTES (diaria / semanal / mensual)
        // ------------------------------------------------------------
        const RECURRING_FREQ_LABELS = { diaria: 'Todos los días', semanal: 'Cada semana', mensual: 'Cada mes' };
        const RECURRING_WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

        function isRecurringTaskDueToday(task, dateStr = todayISO()) {
            if (!task.activo) return false;
            const d = new Date(dateStr + 'T12:00:00');
            if (task.frecuencia === 'diaria') return true;
            if (task.frecuencia === 'semanal') {
                const dias = Array.isArray(task.diasSemana) && task.diasSemana.length ? task.diasSemana : [task.diaSemana];
                return dias.includes(d.getDay());
            }
            if (task.frecuencia === 'mensual') return d.getDate() === task.diaMes;
            if (task.frecuencia === 'intervalo') {
                if (!task.intervaloInicio || !(task.intervaloDias > 0)) return false;
                const start = new Date(task.intervaloInicio + 'T12:00:00');
                const diffDays = Math.round((d - start) / 86400000);
                return diffDays >= 0 && diffDays % task.intervaloDias === 0;
            }
            return false;
        }

        function recurringTasksDueToday() {
            const today = todayISO();
            return recurringTasks.filter(t => isRecurringTaskDueToday(t, today));
        }

        async function toggleRecurringTaskDoneToday(id) {
            const task = recurringTasks.find(t => t.id === id);
            if (!task) return;
            const today = todayISO();
            task.completadas = task.completadas || {};
            task.completadas[today] = !task.completadas[today];

            // Igual que con los eventos del planificador: cada día que se
            // completa una recurrente queda su propio evento en el calendario.
            const doneEntryId = 'recurring_done_' + task.id + '_' + today;
            entries = entries.filter(e => e.id !== doneEntryId);
            if (task.completadas[today]) {
                entries.push({
                    id: doneEntryId,
                    type: 'event',
                    eventType: 'otro',
                    title: 'Completado: ' + task.texto,
                    date: today,
                    time: '',
                    place: '',
                    notes: 'Tarea recurrente',
                    category: 'Tareas recurrentes',
                    calendarLog: true
                });
            }
            filteredEntries = [...entries];

            if (currentView === 'planner') render();
            else if (currentView === 'calendar' || currentView === 'home') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openManageRecurringTasks() {
            showModal(`
                <div class="modal-title">Tareas recurrentes</div>
                <div style="font-size:11px;color:var(--text-secondary);margin-bottom:14px">Se repiten solas cada día/semana/mes; marcarlas hecha un día no las completa para siempre.</div>
                <div class="modal-label">Texto</div>
                <input id="recurring-texto" class="modal-input" placeholder="Ej: Sacar la basura">
                <div class="modal-label">Frecuencia</div>
                <select id="recurring-frecuencia" class="modal-input" onchange="updateRecurringFreqFields()">
                    <option value="diaria">Todos los días</option>
                    <option value="semanal">Días concretos de la semana</option>
                    <option value="mensual">Cada mes</option>
                    <option value="intervalo">Cada N días</option>
                </select>
                <div id="recurring-freq-extra"></div>
                <button class="btn-modal-primary" onclick="saveRecurringTask()">Añadir</button>
                <div class="modal-label" style="margin-top:18px">Ya creadas</div>
                <div id="recurring-tasks-list">${renderRecurringTasksManageList()}</div>
            `);
            updateRecurringFreqFields();
        }

        function updateRecurringFreqFields() {
            const freq = document.getElementById('recurring-frecuencia')?.value;
            const extra = document.getElementById('recurring-freq-extra');
            if (!extra) return;
            if (freq === 'semanal') {
                extra.innerHTML = `
                    <div class="modal-label">Días de la semana</div>
                    <div class="recurring-weekday-picker">
                        ${RECURRING_WEEKDAY_LABELS.map((label, i) => `
                            <label class="recurring-weekday-chip">
                                <input type="checkbox" class="recurring-dia-semana-check" value="${i}" ${i === 1 ? 'checked' : ''}>
                                ${label.slice(0, 3)}
                            </label>`).join('')}
                    </div>`;
            } else if (freq === 'mensual') {
                extra.innerHTML = `
                    <div class="modal-label">Día del mes</div>
                    <input id="recurring-dia-mes" type="number" min="1" max="31" class="modal-input" value="1">`;
            } else if (freq === 'intervalo') {
                extra.innerHTML = `
                    <div class="modal-label">Cada cuántos días</div>
                    <input id="recurring-intervalo-dias" type="number" min="2" max="365" class="modal-input" value="2">
                    <div class="modal-label">A partir de</div>
                    <input id="recurring-intervalo-inicio" type="date" class="modal-input" value="${todayISO()}">`;
            } else {
                extra.innerHTML = '';
            }
        }

        function renderRecurringTasksManageList() {
            if (!recurringTasks.length) return '<div style="font-size:12px;color:var(--text-secondary);padding:6px 0">Sin tareas recurrentes todavía.</div>';
            return recurringTasks.map(t => {
                let detalle = RECURRING_FREQ_LABELS[t.frecuencia] || '';
                if (t.frecuencia === 'semanal') {
                    const dias = Array.isArray(t.diasSemana) && t.diasSemana.length ? t.diasSemana : [t.diaSemana];
                    detalle = dias.map(d => RECURRING_WEEKDAY_LABELS[d]).join(', ');
                }
                if (t.frecuencia === 'mensual') detalle = `Día ${t.diaMes} de cada mes`;
                if (t.frecuencia === 'intervalo') detalle = `Cada ${t.intervaloDias} días desde ${t.intervaloInicio}`;
                return `
                    <div class="friend-list-item">
                        <span class="friend-list-name" style="${t.activo ? '' : 'opacity:.5;text-decoration:line-through'}">${escapeHtml(t.texto)} <span style="color:var(--text-secondary);font-weight:400">— ${detalle}</span></span>
                        <span style="display:flex;gap:6px">
                            <button class="btn-secondary" style="padding:4px 10px;font-size:11px" onclick="toggleRecurringTaskActiveState('${t.id}')">${t.activo ? 'Pausar' : 'Reactivar'}</button>
                            <button class="friend-remove-btn" title="Eliminar" onclick="deleteRecurringTask('${t.id}')">✕</button>
                        </span>
                    </div>`;
            }).join('');
        }

        async function saveRecurringTask() {
            const texto = document.getElementById('recurring-texto')?.value.trim();
            const frecuencia = document.getElementById('recurring-frecuencia')?.value;
            if (!texto) { showToast('Escribe el texto de la tarea', true); return; }
            const task = {
                id: 'rt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                texto, frecuencia, activo: true, completadas: {}
            };
            if (frecuencia === 'semanal') {
                const dias = [...document.querySelectorAll('.recurring-dia-semana-check:checked')].map(el => parseInt(el.value));
                task.diasSemana = dias.length ? dias : [1];
            }
            if (frecuencia === 'mensual') task.diaMes = parseInt(document.getElementById('recurring-dia-mes')?.value) || 1;
            if (frecuencia === 'intervalo') {
                task.intervaloDias = parseInt(document.getElementById('recurring-intervalo-dias')?.value) || 2;
                task.intervaloInicio = document.getElementById('recurring-intervalo-inicio')?.value || todayISO();
            }
            recurringTasks.push(task);
            document.getElementById('recurring-texto').value = '';
            const list = document.getElementById('recurring-tasks-list');
            if (list) list.innerHTML = renderRecurringTasksManageList();
            if (currentView === 'planner') render();
            try { await saveData(); showToast('Tarea recurrente añadida'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function toggleRecurringTaskActiveState(id) {
            const t = recurringTasks.find(x => x.id === id);
            if (!t) return;
            t.activo = !t.activo;
            const list = document.getElementById('recurring-tasks-list');
            if (list) list.innerHTML = renderRecurringTasksManageList();
            if (currentView === 'planner') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteRecurringTask(id) {
            if (!confirm('¿Eliminar esta tarea recurrente?')) return;
            recurringTasks = recurringTasks.filter(t => t.id !== id);
            const list = document.getElementById('recurring-tasks-list');
            if (list) list.innerHTML = renderRecurringTasksManageList();
            if (currentView === 'planner') render();
            try { await saveData(); showToast('Tarea recurrente eliminada'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // ============================================================
        //  HÁBITOS
        //  Seguimiento de constancia deliberadamente sin puntos, insignias
        //  ni rachas destacadas en rojo/fuego: solo una cuadrícula discreta
        //  de los últimos días y un número de racha en texto normal.
        // ============================================================
        function habitStreak(habit, dateStr = todayISO()) {
            let streak = 0;
            let d = new Date(dateStr + 'T12:00:00');
            while (true) {
                const iso = d.toISOString().slice(0, 10);
                if (habit.completadas?.[iso]) { streak++; d.setDate(d.getDate() - 1); }
                else break;
            }
            return streak;
        }

        function renderHabitDots(habit, days = 14) {
            const cells = [];
            const d = new Date();
            for (let i = days - 1; i >= 0; i--) {
                const dd = new Date(d);
                dd.setDate(dd.getDate() - i);
                const iso = dd.toISOString().slice(0, 10);
                cells.push(`<span class="habit-dot ${habit.completadas?.[iso] ? 'on' : ''}" title="${iso}"></span>`);
            }
            return `<div class="habit-dots">${cells.join('')}</div>`;
        }

        function renderHabits() {
            return `
            <div style="max-width:640px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                    <div style="font-size:20px;font-weight:700;color:var(--text-primary)">Hábitos</div>
                    <button class="btn-modal-primary" style="width:auto" onclick="openAddHabit()">+ Hábito</button>
                </div>
                <div style="color:var(--text-secondary);margin-bottom:20px;font-size:12.5px">Solo para llevar la cuenta, sin presión. Marca el día cuando lo hagas.</div>
                ${habits.length ? habits.filter(h => h.activo !== false).map(h => {
                    const today = todayISO();
                    const streak = habitStreak(h);
                    return `
                    <div class="habit-card">
                        <div class="habit-card-head">
                            <label class="habit-check-row">
                                <input type="checkbox" ${h.completadas?.[today] ? 'checked' : ''} onchange="toggleHabitToday('${h.id}')">
                                <span>${escapeHtml(h.texto)}</span>
                            </label>
                            <span class="habit-menu" onclick="openHabitMenu('${h.id}')">⋯</span>
                        </div>
                        ${renderHabitDots(h)}
                        ${h.objetivoId && entries.find(g => g.id === h.objetivoId) ? `<div class="habit-objetivo">${h.kaizen ? 'paso kaizen' : 'rutina'} para «${escapeHtml(entries.find(g => g.id === h.objetivoId).title)}».</div>` : ''}
                        <div class="habit-streak-text">${streak > 0 ? `Racha: ${streak} día${streak === 1 ? '' : 's'}` : 'Sin racha activa'}</div>
                    </div>`;
                }).join('') : `<div class="empty-state"><div class="empty-title">Sin hábitos todavía</div><div class="empty-sub">Pulsa + Hábito para empezar a seguir alguno, sin más presión que la cuadrícula.</div></div>`}
            </div>`;
        }

        function openAddHabit() {
            showModal(`
                <div class="modal-title">+ Hábito</div>
                <div class="modal-label">¿Qué quieres seguir?</div>
                <input id="habit-texto" class="modal-input" placeholder="Ej: Leer 10 minutos">
                <button class="btn-modal-primary" onclick="saveHabit()">Añadir</button>
            `);
            setTimeout(() => document.getElementById('habit-texto')?.focus(), 50);
        }

        async function saveHabit() {
            const texto = document.getElementById('habit-texto')?.value.trim();
            if (!texto) { showToast('Escribe el hábito', true); return; }
            habits.push({ id: 'habit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), texto, activo: true, completadas: {} });
            closeModal();
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function toggleHabitToday(id) {
            const h = habits.find(x => x.id === id);
            if (!h) return;
            const today = todayISO();
            h.completadas = h.completadas || {};
            h.completadas[today] = !h.completadas[today];
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openHabitMenu(id) {
            const h = habits.find(x => x.id === id);
            if (!h) return;
            showModal(`
                <div class="modal-title">${escapeHtml(h.texto)}</div>
                <button class="btn-secondary" onclick="toggleHabitActiveState('${id}')">${h.activo === false ? 'Reactivar' : 'Pausar'}</button>
                <button class="btn-secondary" style="margin-top:8px;color:#dc2626" onclick="deleteHabit('${id}')">Eliminar hábito</button>
            `);
        }

        async function toggleHabitActiveState(id) {
            const h = habits.find(x => x.id === id);
            if (!h) return;
            h.activo = h.activo === false ? true : false;
            closeModal();
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteHabit(id) {
            if (!confirm('¿Eliminar este hábito? Se pierde su historial.')) return;
            habits = habits.filter(h => h.id !== id);
            closeModal();
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

