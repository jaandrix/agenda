        // ============================================================
        //  PLANIFICADOR DEL DÍA (sustituye a Apuntes)
        //  Cada día lógico (4:00 am - 4:00 am) tiene su propia lista de
        //  eventos, para poder planificar hoy, mañana y pasado mañana
        //  por adelantado. Los días pasados se limpian solos.
        // ============================================================

        const PLANNER_DAY_TABS = [
            { offset: 0, label: 'hoy.' },
            { offset: 1, label: 'mañana.' },
            { offset: 2, label: 'pasado mañana.' }
        ];

        // Clave del "día lógico" para un desplazamiento de días dado: antes de
        // las 4:00 am se sigue considerando parte del día anterior.
        function currentPlannerDayKey(date = new Date(), offsetDays = 0) {
            const d = new Date(date);
            if (d.getHours() < 4) d.setDate(d.getDate() - 1);
            d.setDate(d.getDate() + offsetDays);
            return isoLocal(d);
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
            const todos = plannerItemsForOffset(offset);
            const eventosDia = plannerEventosDia(offset, todos);
            const items = [...todos.filter(i => i.time), ...eventosDia.filter(e => e.time)].sort((a, b) => String(a.time).padStart(5, '0').localeCompare(String(b.time).padStart(5, '0')));
            const sinHora = [...eventosDia.filter(e => !e.time), ...todos.filter(i => !i.time).sort((a, b) => (PLANNER_PRIORIDAD_ORDEN[a.prioridad] ?? 3) - (PLANNER_PRIORIDAD_ORDEN[b.prioridad] ?? 3))];
            const now = new Date();
            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            const today = todayISO();
            const dueToday = offset === 0 ? recurringTasksDueToday() : [];
            // Las tarjetas de acción siempre reflejan lo de HOY, aunque se
            // esté mirando la pestaña de mañana/pasado mañana.
            const todayItemsCount = offset === 0 ? items.length : plannerItemsForOffset(0).length;
            const todayDueCount = offset === 0 ? dueToday.length : recurringTasksDueToday().length;
            const emptyLabel = offset === 0 ? 'para hoy' : (offset === 1 ? 'para mañana' : 'para pasado mañana');

            return `
            <div class="planner-view">
                <div class="planner-head">
                    <div>
                        <h3 style="margin:0">planificador.</h3>
                        <p style="font-size:12px;color:var(--text-secondary);margin-top:4px">
                            Cada día empieza de cero a las 4:00 am: lo que no marques como hecho se arrastra a hoy, destacado en granate. Puedes ir dejando planificados los próximos dos días.
                        </p>
                    </div>
                </div>

                ${offset === 0 ? renderPlannerStampBar(items, dueToday, today) : ''}

                <div class="planner-action-row">
                    <button class="planner-action-card" onclick="openAddPlannerItem()" title="+ tarea.">
                        <span class="planner-action-icon">${PLANNER_ICON_ADD}</span>
                        <span class="planner-action-count">${todayItemsCount} hoy.</span>
                    </button>
                    <button class="planner-action-card" onclick="openManageRecurringTasks()" title="recurrentes.">
                        <span class="planner-action-icon">${PLANNER_ICON_REPEAT}</span>
                        <span class="planner-action-count">${todayDueCount} hoy.</span>
                    </button>
                </div>


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

                ${plannerDayOffset <= 1 ? renderLuzDia(servMasDias(currentPlannerDayKey(), plannerDayOffset)) : ''}
                <div class="planner-timeline vt-interior">
                    ${sinHora.length ? `<div class="planner-sin-hora-titulo">sin hora.</div>` : ''}
                    ${[...sinHora, ...items].length ? [...sinHora, ...items].map((it, n) => {
                        const [h, m] = String(it.time || '').split(':').map(Number);
                        const itemMinutes = (h || 0) * 60 + (m || 0);
                        const isPast = offset === 0 && !!it.time && itemMinutes < nowMinutes;
                        const titulo = n === sinHora.length && sinHora.length && items.length ? '<div class="planner-sin-hora-titulo">con hora.</div>' : '';
                        if (it.esEvento) return `${titulo}
                        <div class="planner-item planner-item-evento ${isPast ? 'planner-item-past' : ''}" onclick="openEntryDetail('${jsAttr(it.id)}')">
                            <div class="planner-item-time">${it.time ? escapeHtml(it.time) : ''}</div>
                            <i class="planner-evento-punto" style="background:${escapeHtml(colorTema(it.color))}" aria-hidden="true"></i>
                            <div class="planner-item-body"><div class="planner-item-title"><span>${escapeHtml(it.title)}</span></div><div class="planner-item-notes">${escapeHtml(it.sub)}</div></div>
                        </div>`;
                        return `${titulo}
                        <div class="planner-item ${isPast && !it.arrastrado ? 'planner-item-past' : ''} ${it.done ? 'planner-item-done' : ''} ${it.arrastrado ? 'planner-item-arrastrado' : ''} ${it.prioridad ? `prioridad-${it.prioridad}` : ''}">
                            <div class="planner-item-time">${it.time ? escapeHtml(it.time) : '—'}</div>
                            <input type="checkbox" class="planner-item-check" ${it.done ? 'checked' : ''} onchange="togglePlannerItemDone('${it.id}', ${offset})" aria-label="${escapeHtml(it.title)}: hecha">
                            <div class="planner-item-body">
                                <div class="planner-item-title"><span ${it.arrastrado && !it.done ? 'title="Pendiente de ayer"' : ''} ${it.valorarPeliculaId ? `class="planner-item-enlace" onclick="openEditEntry('${it.valorarPeliculaId}')" title="Abrir la película para valorarla"` : `class="planner-item-editar" onclick="openAddPlannerItem('${it.id}')" title="Editar"`}>${escapeHtml(it.title)}</span>${it.prioridad ? `<i class="planner-prioridad">${PLANNER_PRIORIDADES[it.prioridad]}</i>` : ''}</div>
                                ${it.notes ? `<div class="planner-item-notes">${escapeHtml(it.notes)}</div>` : ''}
                                ${it.done ? '' : luzAviso(it.title, servMasDias(currentPlannerDayKey(), offset), it.time)}
                                ${renderPlannerSubtasks(it, offset)}
                            </div>
                            <button class="planner-item-delete" title="Eliminar" onclick="deletePlannerItem('${it.id}', ${offset})"><i class='ico ico-x' aria-hidden=true></i></button>
                        </div>`;
                    }).join('') : `
                        <div class="finance-empty-state">Aún no has añadido tareas ${emptyLabel}. Pulsa <strong>+ tarea.</strong> para empezar tu planificación.</div>
                    `}
                </div>

                ${renderPlannerBacklog()}
                ${typeof renderSiguientesPasos === 'function' ? renderSiguientesPasos() : ''}
            </div>`;
        }

        // "Tareas pendientes." — un backlog sin día ni hora, aparte de la
        // timeline (que siempre exige ambos). Vive fuera de dayPlanner.days
        // porque no pertenece a ningún día: se ve igual sin importar la
        // pestaña (hoy/mañana/pasado mañana) que tengas seleccionada.
        // "→ hoy" la convierte en un evento normal de la timeline de hoy
        // cuando por fin le toca hacerse.
        // Las ya hechas no se quedan a la vista para siempre: se esconden y
        // un botón las enseña cuando hace falta (se recuerda por dispositivo).
        let backlogVerHechas = false;
        try { backlogVerHechas = localStorage.getItem('bitacora_backlog_hechas') === '1'; } catch (_) { /* sin almacenamiento */ }

        // «mostrar completadas» enseña solo las completadas hoy (día de 4:00 a 4:00). Antes enseñaba todas, de cualquier
        // día, y como la elección se recuerda en el dispositivo, las de hace días se quedaban siempre a la vista.
        function backlogHechaHoy(it) {
            return !!it.done && typeof it.hechaEn === 'number' && isoLocal(new Date(it.hechaEn - 4 * 3600e3)) === currentPlannerDayKey();
        }
        function backlogVisibles() {
            return dayPlanner.backlog.filter(it => !it.done || (backlogVerHechas && backlogHechaHoy(it)));
        }

        function backlogBotonHechas(clase) {
            const n = dayPlanner.backlog.filter(backlogHechaHoy).length;
            if (!n) return '';
            return `<button class="${clase}" onclick="alternarBacklogHechas()">${backlogVerHechas ? 'ocultar completadas.' : `mostrar completadas (${n}).`}</button>`;
        }

        function alternarBacklogHechas() {
            backlogVerHechas = !backlogVerHechas;
            try { localStorage.setItem('bitacora_backlog_hechas', backlogVerHechas ? '1' : '0'); } catch (_) { /* sin almacenamiento */ }
            render();
        }

        function renderPlannerBacklog() {
            resetDayPlannerIfNeeded();
            const items = backlogVisibles();
            const quedan = dayPlanner.backlog.length;
            return `
            <div class="planner-backlog">
                <div class="planner-backlog-head">
                    <div class="planner-backlog-title">tareas pendientes.</div>
                    <button class="planner-backlog-add" onclick="openAddBacklogTask()">+ tarea</button>
                </div>
                ${items.length ? items.map(it => renderBacklogRow(it)).join('') : `<div class="finance-empty-line" style="margin:6px 0 4px">${quedan ? 'Todo hecho por aquí.' : 'Sin tareas pendientes: apunta aquí lo que quieras hacer sin ponerle día todavía.'}</div>`}
                ${backlogBotonHechas('planner-backlog-hechas')}
            </div>`;
        }

        function renderBacklogRow(it) {
            return `
                <div class="planner-backlog-row ${it.done ? 'done' : ''}">
                    <input type="checkbox" class="planner-item-check" ${it.done ? 'checked' : ''} onchange="toggleBacklogTaskDone('${it.id}')" aria-label="${escapeHtml(it.title)}: hecha">
                    <div class="planner-backlog-row-body">
                        <div class="planner-backlog-row-title">${escapeHtml(it.title)}</div>
                        ${it.notes ? `<div class="planner-backlog-row-notes">${escapeHtml(it.notes)}</div>` : ''}
                    </div>
                    <button class="planner-backlog-schedule" title="Asignar a hoy" onclick="scheduleBacklogTaskToday('${it.id}')">→ hoy</button>
                    <button class="planner-item-delete" title="Eliminar" onclick="deleteBacklogTask('${it.id}')"><i class='ico ico-x' aria-hidden=true></i></button>
                </div>`;
        }

        function openAddBacklogTask() {
            showModal(`
                <div class="modal-title">+ Tarea pendiente</div>
                <div class="modal-label">Título</div>
                <input id="backlog-task-title" class="modal-input" type="text" placeholder="¿Qué tienes pendiente?">
                <div class="modal-label">Notas (opcional)</div>
                <textarea id="backlog-task-notes" class="modal-input" rows="2" placeholder="Detalles adicionales..."></textarea>
                <button class="btn-modal-primary" onclick="saveBacklogTask()">añadir a pendientes.</button>
            `);
            enfocarSiTeclado(() => document.getElementById('backlog-task-title'));
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
            if (item.done) item.hechaEn = Date.now(); else delete item.hechaEn;
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

        // Prioridad de cada tarea: color en el borde y en el círculo, y orden
        // dentro de "sin hora.". Sin elegir, la tarea no lleva color.
        const PLANNER_PRIORIDADES = { alta: 'alta.', media: 'media.', baja: 'baja.' };
        const PLANNER_PRIORIDAD_ORDEN = { alta: 0, media: 1, baja: 2 };

        // Crear y editar comparten modal. La hora es opcional: sin hora, la
        // tarea va al bloque "sin hora." del día, ordenada por prioridad.
        function openAddPlannerItem(id) {
            const offset = plannerDayOffset;
            const it = id ? plannerItemsForOffset(offset).find(x => x.id === id) : null;
            const now = new Date();
            const defaultTime = offset === 0
                ? `${String(now.getHours()).padStart(2, '0')}:${String(Math.ceil(now.getMinutes() / 5) * 5 % 60).padStart(2, '0')}`
                : '09:00';
            const titleSuffix = offset === 0 ? 'de hoy' : (offset === 1 ? 'de mañana' : 'de pasado mañana');
            window._plannerBorrador = { sinHora: it ? !it.time : false, prioridad: it?.prioridad || '' };
            const b = window._plannerBorrador;
            showModal(`
                <div class="modal-title">${it ? 'tarea.' : `+ tarea ${titleSuffix}`}</div>
                <div class="modal-label">Título</div>
                <input id="planner-item-title" class="modal-input" type="text" placeholder="¿Qué vas a hacer?" value="${escapeHtml(it?.title || '')}">
                <div class="modal-label">Hora</div>
                <div class="planner-hora-fila">
                    <input id="planner-item-time" class="modal-input" type="time" value="${it?.time || defaultTime}" ${b.sinHora ? 'disabled' : ''}>
                    <button type="button" class="profe-chip ${b.sinHora ? 'activa' : ''}" onclick="plannerSinHora(this)">sin hora.</button>
                </div>
                <div class="modal-label">Prioridad</div>
                <div class="profe-dias-elegir planner-prioridades">${[['', 'ninguna.'], ['alta', 'alta.'], ['media', 'media.'], ['baja', 'baja.']].map(([k, t]) => `<button type="button" class="profe-chip ${k ? `prioridad-chip-${k}` : ''} ${b.prioridad === k ? 'activa' : ''}" onclick="window._plannerBorrador.prioridad='${k}';this.parentNode.querySelectorAll('.profe-chip').forEach(x=>x.classList.toggle('activa',x===this))">${t}</button>`).join('')}</div>
                <div class="modal-label">Notas (opcional)</div>
                <textarea id="planner-item-notes" class="modal-input" rows="2" placeholder="Detalles adicionales...">${escapeHtml(it?.notes || '')}</textarea>
                <button class="btn-modal-primary" onclick="savePlannerItem(${offset}, '${it?.id || ''}')">${it ? 'guardar.' : 'añadir.'}</button>
                ${it ? `<button class="btn-secondary" style="margin-top:8px;color:var(--c-dc2626)" onclick="closeModal();deletePlannerItem('${it.id}', ${offset})">eliminar tarea.</button>` : ''}
            `);
            modoCapa('editor');
            if (!it) enfocarSiTeclado(() => document.getElementById('planner-item-title'));
        }

        function plannerSinHora(btn) {
            const b = window._plannerBorrador;
            b.sinHora = !b.sinHora;
            btn.classList.toggle('activa', b.sinHora);
            const t = document.getElementById('planner-item-time');
            if (t) t.disabled = b.sinHora;
        }

        async function savePlannerItem(offset = plannerDayOffset, id = '') {
            const b = window._plannerBorrador || {};
            const time = b.sinHora ? '' : (document.getElementById('planner-item-time')?.value || '');
            const title = document.getElementById('planner-item-title')?.value.trim() || '';
            const notes = document.getElementById('planner-item-notes')?.value.trim() || '';
            if (!title) { showToast('Escribe la tarea', true); return; }
            const datos = { time, title, notes, prioridad: b.prioridad || undefined };
            const existente = id && plannerItemsForOffset(offset).find(x => x.id === id);
            if (existente) Object.assign(existente, datos);
            else plannerItemsForOffset(offset).push({ id: 'planner_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), ...datos, done: false });
            closeModal();
            if (currentView === 'planner') render(); else renderMobileShell();
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

        // Al marcar desde el móvil la fila ya cambió al momento (mobileMarcarAlMomento): lo demás se rehace después de pintar.
        let mobileMarcarRapido = false;
        function repintarMarcar() {
            if (!['planner', 'calendar', 'home'].includes(currentView)) return;
            if (!mobileMarcarRapido) { render(); return; }
            mobileMarcarRapido = false;
            repintarTrasPintar();
        }

        async function togglePlannerItemDone(id, offset = plannerDayOffset) {
            const item = plannerItemsForOffset(offset).find(it => it.id === id);
            if (!item) return;
            item.done = !item.done;
            if (item.done) item.hechaEn = Date.now(); else delete item.hechaEn;

            // Si es un trabajo enlazado desde Estudios, el propio trabajo
            // guarda si está hecho — es la única copia que sobrevive una
            // vez el día pasa y esta tarea del planificador se archiva
            // (se borra). Sin esto, la siguiente sincronización no tenía
            // forma de saber que ya estaba hecha y la resucitaba pendiente.
            if (item.linkedAssignmentId) {
                const assignment = findAssignmentById(item.linkedAssignmentId);
                if (assignment) assignment.done = item.done;
            }
            if (item.proyectoTareaId && typeof proyectoTareaDesdePlanner === 'function') proyectoTareaDesdePlanner(item.proyectoId, item.proyectoTareaId, item.done);

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

            repintarMarcar();
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
            task.hechaEn = task.completadas[today] ? { dia: today, cuando: Date.now() } : undefined;

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

            repintarMarcar();
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
                <button class="btn-modal-primary" onclick="saveRecurringTask()">añadir.</button>
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
                            <button class="friend-remove-btn" title="Eliminar" onclick="deleteRecurringTask('${t.id}')"><i class='ico ico-x' aria-hidden=true></i></button>
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
        //  RUTINAS (antes Hábitos; la vista y los datos siguen llamándose
        //  `habits` para no romper lo guardado ni el conector)
        //  Pensado para dos tipos de persona: quien vive de rutinas (momentos
        //  del día, frecuencias, rutinas con pasos, marcar días pasados) y
        //  quien solo quiere probar (ideas que se añaden con un toque, una
        //  sola para empezar). Sin puntos, insignias ni fuego: una semana de
        //  bolitas y la racha en texto normal.
        //  Campos de cada rutina: texto, activo, completadas { fecha: true },
        //  y opcionales momento ('manana' | 'tarde' | 'noche'), frecuencia
        //  { tipo: 'diaria' | 'dias' | 'semana', dias: [0..6], veces },
        //  pasos [texto] y pasosHechos { fecha: [índices] }.
        // ============================================================
        const RUTINA_MOMENTOS = [['manana', 'por la mañana.'], ['tarde', 'por la tarde.'], ['noche', 'por la noche.'], ['', 'cuando sea.']];
        const RUTINA_LETRAS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
        const RUTINAS_IDEAS = [
            { texto: 'Beber un vaso de agua al levantarme', momento: 'manana' },
            { texto: 'Rutina de mañana', momento: 'manana', pasos: ['Beber agua', 'Estirar 5 minutos', 'Hacer la cama'] },
            { texto: 'Caminar 20 minutos', momento: 'tarde' },
            { texto: 'Leer 10 minutos', momento: 'noche' },
            { texto: 'Dejar el móvil a las 23:30', momento: 'noche' },
            { texto: 'Hacer deporte', momento: 'tarde', frecuencia: { tipo: 'semana', veces: 3 } },
        ];

        function rutinaFrecuencia(h) { return h.frecuencia && h.frecuencia.tipo ? h.frecuencia : { tipo: 'diaria' }; }

        function rutinaToca(h, iso) {
            const f = rutinaFrecuencia(h);
            if (f.tipo !== 'dias' || !(f.dias || []).length) return true;
            return f.dias.includes(new Date(iso + 'T12:00:00').getDay());
        }

        function rutinaLunes(iso) {
            const d = new Date(iso + 'T12:00:00');
            d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
            return isoLocal(d);
        }

        function rutinaHechasSemana(h, iso = todayISO()) {
            const d = new Date(rutinaLunes(iso) + 'T12:00:00');
            let n = 0;
            for (let i = 0; i < 7; i++) { if (h.completadas?.[isoLocal(d)]) n++; d.setDate(d.getDate() + 1); }
            return n;
        }

        // Los días que no tocan no rompen la racha; en las de "x veces por
        // semana" la racha se cuenta en semanas cumplidas.
        function habitStreak(habit, dateStr = todayISO()) {
            const f = rutinaFrecuencia(habit);
            if (f.tipo === 'semana') {
                const veces = Number(f.veces) || 1;
                let semanas = 0;
                const d = new Date(rutinaLunes(dateStr) + 'T12:00:00');
                if (rutinaHechasSemana(habit, dateStr) < veces) d.setDate(d.getDate() - 7);
                for (let i = 0; i < 300; i++) {
                    if (rutinaHechasSemana(habit, isoLocal(d)) >= veces) { semanas++; d.setDate(d.getDate() - 7); } else break;
                }
                return semanas;
            }
            let streak = 0;
            let d = new Date(dateStr + 'T12:00:00');
            // Lo que aún no se ha marcado hoy no rompe la racha: el día no ha
            // terminado, así que se cuenta desde ayer.
            if (!habit.completadas?.[dateStr]) d.setDate(d.getDate() - 1);
            for (let i = 0; i < 2000; i++) {
                const iso = isoLocal(d);
                if (habit.completadas?.[iso]) streak++;
                else if (rutinaToca(habit, iso)) break;
                d.setDate(d.getDate() - 1);
            }
            return streak;
        }

        function rutinaTextoFrecuencia(h) {
            const f = rutinaFrecuencia(h);
            if (f.tipo === 'dias' && (f.dias || []).length) return [1, 2, 3, 4, 5, 6, 0].filter(d => f.dias.includes(d)).map(d => ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d]).join(', ') + '.';
            if (f.tipo === 'semana') return `${f.veces || 1} ${Number(f.veces) === 1 ? 'vez' : 'veces'} por semana, llevas ${rutinaHechasSemana(h)}.`;
            return 'todos los días.';
        }

        function rutinaPasosHoy(h, iso = todayISO()) {
            return new Set((h.pasosHechos?.[iso] || []).filter(i => i < (h.pasos || []).length));
        }

        function renderRutina(h, movil = false) {
            const hoy = todayISO();
            const on = !!h.completadas?.[hoy];
            const pasos = h.pasos || [];
            const hechos = rutinaPasosHoy(h);
            const racha = habitStreak(h);
            const f = rutinaFrecuencia(h);
            const parcial = !on && pasos.length && hechos.size ? hechos.size / pasos.length : 0;
            const semana = Array.from({ length: 7 }, (_, i) => {
                const d = new Date(); d.setDate(d.getDate() - 6 + i);
                const iso = isoLocal(d);
                const toca = rutinaToca(h, iso);
                return `<button class="rutina-dia ${h.completadas?.[iso] ? 'on' : ''} ${toca ? '' : 'libre'} ${iso === hoy ? 'hoy' : ''}" onclick="rutinaMarcarDia('${h.id}','${iso}')" aria-label="${iso}"><i>${RUTINA_LETRAS[d.getDay()]}</i><span></span></button>`;
            }).join('');
            return `<div class="rutina ${on ? 'hecha' : ''} ${movil ? 'rutina-movil' : ''}" data-rutina="${h.id}">
                <button class="rutina-check ${on ? 'on' : ''}" style="--p:${Math.round(parcial * 100)}" onclick="toggleHabitToday('${h.id}')" aria-label="${on ? 'Desmarcar' : 'Hecha hoy'}"></button>
                <div class="rutina-cuerpo">
                    <button class="rutina-nombre" onclick="openHabitMenu('${h.id}')">${escapeHtml(h.texto)}</button>
                    <div class="rutina-meta">${rutinaTextoFrecuencia(h)} ${racha ? `<b>racha de ${racha} ${f.tipo === 'semana' ? (racha === 1 ? 'semana' : 'semanas') : (racha === 1 ? 'día' : 'días')}.</b>` : ''}</div>
                    ${pasos.length ? `<div class="rutina-pasos">${pasos.map((p, i) => `<button class="rutina-paso ${on || hechos.has(i) ? 'on' : ''}" onclick="rutinaMarcarPaso('${h.id}',${i})"><span></span>${escapeHtml(p)}</button>`).join('')}</div>` : ''}
                    <div class="rutina-semana">${semana}</div>
                    ${h.objetivoId && entries.find(g => g.id === h.objetivoId) ? `<div class="rutina-objetivo">${h.kaizen ? 'paso kaizen' : 'rutina'} para «${escapeHtml(entries.find(g => g.id === h.objetivoId).title)}».</div>` : ''}
                </div>
            </div>`;
        }

        // El cuerpo es el mismo en escritorio y en el móvil: lo de hoy por
        // momentos del día, lo que hoy no toca y lo que está en pausa.
        function renderRutinasCuerpo(movil = false) {
            const hoy = todayISO();
            const activas = habits.filter(h => h.activo !== false);
            const deHoy = activas.filter(h => rutinaToca(h, hoy));
            const otras = activas.filter(h => !rutinaToca(h, hoy));
            const pausadas = habits.filter(h => h.activo === false);
            const ideas = RUTINAS_IDEAS.filter(i => !habits.some(h => h.texto.toLowerCase() === i.texto.toLowerCase()));
            const grupos = RUTINA_MOMENTOS.map(([k, t]) => [t, deHoy.filter(h => (h.momento || '') === k)]).filter(([, l]) => l.length);
            return `
                ${!activas.length ? `<div class="rutinas-vacio"><b>empieza por una.</b>Una rutina pequeña que hagas casi sin pensar vale más que diez que te agobien. Elige una idea o escribe la tuya; cuando la tengas, añade otra.</div>` : ''}
                ${grupos.map(([t, l]) => `<div class="rutinas-grupo"><div class="rutinas-grupo-titulo">${t}</div>${l.map(h => renderRutina(h, movil)).join('')}</div>`).join('')}
                ${otras.length ? `<div class="rutinas-grupo"><div class="rutinas-grupo-titulo">hoy no toca.</div>${otras.map(h => renderRutina(h, movil)).join('')}</div>` : ''}
                ${activas.length < 4 && ideas.length ? `<div class="rutinas-ideas"><div class="rutinas-grupo-titulo">ideas para empezar.</div><div class="rutinas-ideas-lista">${ideas.map((i, n) => `<button class="rutinas-idea" onclick="rutinaDesdeIdea(${RUTINAS_IDEAS.indexOf(i)})">+ ${escapeHtml(i.texto.toLowerCase())}.${i.pasos ? `<small>${i.pasos.length} pasos</small>` : ''}</button>`).join('')}</div></div>` : ''}
                ${pausadas.length ? `<details class="rutinas-pausa"><summary>en pausa. ${pausadas.length}</summary>${pausadas.map(h => `<button class="rutinas-pausada" onclick="openHabitMenu('${h.id}')">${escapeHtml(h.texto)}</button>`).join('')}</details>` : ''}`;
        }

        function rutinasResumenHoy() {
            const hoy = todayISO();
            const deHoy = habits.filter(h => h.activo !== false && rutinaToca(h, hoy));
            return { total: deHoy.length, hechas: deHoy.filter(h => h.completadas?.[hoy]).length };
        }

        function renderHabits() {
            const r = rutinasResumenHoy();
            return `
            <div class="rutinas">
                <div class="rutinas-cab">
                    <div>
                        <div class="rutinas-titulo">rutinas.</div>
                        <div class="rutinas-sub" id="rutinas-sub">${r.total ? `${r.hechas} de ${r.total} hoy.` : 'Lo que haces para estar bien, sin presión.'}</div>
                    </div>
                    <button class="btn-modal-primary" style="width:auto" onclick="openAddHabit()">+ rutina.</button>
                </div>
                ${renderRutinasCuerpo()}
            </div>`;
        }

        // Al marcar se repinta solo esa rutina (y la cuenta de hoy), no el
        // apartado entero: con muchas rutinas el repintado completo se notaba.
        function repintarRutina(id) {
            const h = habits.find(x => x.id === id);
            const tarjetas = document.querySelectorAll(`[data-rutina="${id}"]`);
            if (!h || !tarjetas.length || (currentView !== 'habits' && currentView !== 'calendar')) { render(); return; }
            tarjetas.forEach(t => { t.outerHTML = renderRutina(h, !!t.closest('#mobile-shell')); });
            const r = rutinasResumenHoy();
            document.querySelectorAll('#rutinas-sub').forEach(el => { el.textContent = r.total ? `${r.hechas} de ${r.total} hoy.` : ''; });
            if (typeof renderMobileShell === 'function' && document.querySelector('#mobile-shell .m-cab')) {
                document.querySelectorAll('#mobile-shell .m-sub').forEach(el => { if (currentView === 'habits') el.textContent = r.total ? `${r.hechas} de ${r.total} hoy.` : 'sin presión.'; });
            }
        }

        async function guardarRutinas() {
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function toggleHabitToday(id) {
            const h = habits.find(x => x.id === id);
            if (!h) return;
            const today = todayISO();
            h.completadas = h.completadas || {};
            h.completadas[today] = !h.completadas[today];
            if (!h.completadas[today]) delete h.completadas[today];
            if ((h.pasos || []).length) {
                h.pasosHechos = h.pasosHechos || {};
                if (h.completadas[today]) h.pasosHechos[today] = h.pasos.map((_, i) => i); else delete h.pasosHechos[today];
            }
            if (currentView === 'habits') repintarRutina(id); else render();
            guardarRutinas();
        }

        function rutinaMarcarPaso(id, i) {
            const h = habits.find(x => x.id === id);
            if (!h) return;
            const hoy = todayISO();
            h.pasosHechos = h.pasosHechos || {};
            const hechos = rutinaPasosHoy(h);
            if (h.completadas?.[hoy]) h.pasos.forEach((_, n) => hechos.add(n));
            if (hechos.has(i)) hechos.delete(i); else hechos.add(i);
            h.pasosHechos[hoy] = [...hechos];
            h.completadas = h.completadas || {};
            if (hechos.size === h.pasos.length) h.completadas[hoy] = true; else delete h.completadas[hoy];
            repintarRutina(id);
            guardarRutinas();
        }

        // Se puede marcar o desmarcar cualquier día de la última semana: a
        // quien se le olvidó apuntarlo ayer no se le rompe la racha.
        function rutinaMarcarDia(id, iso) {
            const h = habits.find(x => x.id === id);
            if (!h) return;
            if (iso === todayISO()) { toggleHabitToday(id); return; }
            h.completadas = h.completadas || {};
            if (h.completadas[iso]) delete h.completadas[iso]; else h.completadas[iso] = true;
            repintarRutina(id);
            guardarRutinas();
        }

        function rutinaDesdeIdea(n) {
            const i = RUTINAS_IDEAS[n];
            if (!i) return;
            habits.push({ id: 'habit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), texto: i.texto, activo: true, completadas: {}, momento: i.momento || '', frecuencia: i.frecuencia || { tipo: 'diaria' }, pasos: i.pasos ? [...i.pasos] : undefined });
            render();
            guardarRutinas();
            showToast(`«${i.texto}» añadida. Tócala para ajustarla.`);
        }

        function openAddHabit() { openRutina(null); }
        function openHabitMenu(id) { openRutina(id); }

        function openRutina(id) {
            const h = id ? habits.find(x => x.id === id) : null;
            const f = h ? rutinaFrecuencia(h) : { tipo: 'diaria' };
            window._rutinaBorrador = { momento: h?.momento || '', tipo: f.tipo, dias: [...(f.dias || [])], veces: f.veces || 3 };
            const b = window._rutinaBorrador;
            const chip = (grupo, valor, texto, activo) => `<button type="button" class="profe-chip ${activo ? 'activa' : ''}" onclick="rutinaElegir('${grupo}','${valor}',this)">${texto}</button>`;
            showModal(`
                <div class="modal-title">${h ? 'rutina.' : 'nueva rutina.'}</div>
                <div class="modal-label">qué</div>
                <input id="rutina-texto" class="modal-input" value="${escapeHtml(h?.texto || '')}" placeholder="Leer 10 minutos, rutina de mañana...">
                <div class="modal-label">cuándo, más o menos</div>
                <div class="profe-dias-elegir" data-grupo="momento">${RUTINA_MOMENTOS.map(([k, t]) => chip('momento', k, t.replace('por la ', '').replace('cuando sea.', 'cuando sea.'), b.momento === k)).join('')}</div>
                <div class="modal-label">cada cuánto</div>
                <div class="profe-dias-elegir" data-grupo="tipo">${[['diaria', 'todos los días.'], ['dias', 'algunos días.'], ['semana', 'x veces por semana.']].map(([k, t]) => chip('tipo', k, t, b.tipo === k)).join('')}</div>
                <div id="rutina-dias" class="profe-dias-elegir" ${b.tipo === 'dias' ? '' : 'hidden'}>${[1, 2, 3, 4, 5, 6, 0].map(d => `<button type="button" class="profe-chip ${b.dias.includes(d) ? 'activa' : ''}" onclick="rutinaDia(${d},this)">${['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d]}</button>`).join('')}</div>
                <div id="rutina-veces" ${b.tipo === 'semana' ? '' : 'hidden'}><input id="rutina-veces-n" class="modal-input" type="number" min="1" max="7" value="${b.veces}" style="max-width:120px"></div>
                <div class="modal-label">pasos (opcional, uno por línea)</div>
                <textarea id="rutina-pasos" class="modal-input" rows="3" placeholder="Beber agua&#10;Estirar 5 minutos&#10;Hacer la cama">${escapeHtml((h?.pasos || []).join('\n'))}</textarea>
                <button class="btn-modal-primary" onclick="guardarRutina('${h?.id || ''}')">guardar.</button>
                ${h ? `<button class="btn-secondary" style="margin-top:8px" onclick="toggleHabitActiveState('${h.id}')">${h.activo === false ? 'reactivar.' : 'poner en pausa.'}</button>
                <button class="btn-secondary" style="margin-top:8px;color:var(--c-dc2626)" onclick="deleteHabit('${h.id}')">eliminar rutina.</button>` : ''}
            `);
            modoCapa('editor');
            if (!h) enfocarSiTeclado(() => document.getElementById('rutina-texto'));
        }

        function rutinaElegir(grupo, valor, btn) {
            window._rutinaBorrador[grupo] = valor;
            btn.parentNode.querySelectorAll('.profe-chip').forEach(x => x.classList.toggle('activa', x === btn));
            if (grupo === 'tipo') {
                document.getElementById('rutina-dias').hidden = valor !== 'dias';
                document.getElementById('rutina-veces').hidden = valor !== 'semana';
            }
        }

        function rutinaDia(d, btn) {
            const b = window._rutinaBorrador;
            b.dias = b.dias.includes(d) ? b.dias.filter(x => x !== d) : [...b.dias, d];
            btn.classList.toggle('activa');
        }

        function guardarRutina(id) {
            const texto = document.getElementById('rutina-texto')?.value.trim();
            if (!texto) { showToast('Escribe la rutina', true); return; }
            const b = window._rutinaBorrador;
            const pasos = (document.getElementById('rutina-pasos')?.value || '').split('\n').map(x => x.trim()).filter(Boolean);
            const frecuencia = b.tipo === 'dias' && b.dias.length ? { tipo: 'dias', dias: [...b.dias].sort() } : b.tipo === 'semana' ? { tipo: 'semana', veces: Math.min(7, Math.max(1, Number(document.getElementById('rutina-veces-n')?.value) || 3)) } : { tipo: 'diaria' };
            const datos = { texto, momento: b.momento || '', frecuencia, pasos: pasos.length ? pasos : undefined };
            const h = id && habits.find(x => x.id === id);
            if (h) Object.assign(h, datos);
            else habits.push({ id: 'habit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), activo: true, completadas: {}, ...datos });
            closeModal();
            render();
            guardarRutinas();
        }

        async function toggleHabitActiveState(id) {
            const h = habits.find(x => x.id === id);
            if (!h) return;
            h.activo = h.activo === false ? true : false;
            closeModal();
            render();
            guardarRutinas();
        }

        async function deleteHabit(id) {
            if (!confirm('¿Eliminar esta rutina? Se pierde su historial.')) return;
            habits = habits.filter(h => h.id !== id);
            closeModal();
            render();
            guardarRutinas();
        }


// Lo que hay en el calendario ese día (eventos, cumpleaños, viajes, trabajo), para enseñarlo en el planificador
// junto a las tareas y en orden de hora. No se marcan: al pulsarlos se abre su ficha. Si una tarea del día se
// llama igual y es a la misma hora (un evento que también se apuntó como tarea), sale solo la tarea.
function plannerEventosDia(offset, tareas) {
    const fecha = servMasDias(currentPlannerDayKey(), offset);
    const ya = new Set((tareas || []).map(t => `${t.time || ''}|${String(t.title || '').trim().toLowerCase()}`));
    return getDayAllEntries(fecha)
        .filter(e => ['event', 'birthday', 'travel', 'work'].includes(e.type) && !isCalendarLogEntry(e) && !/^(weekly_task_done_|planner_done_|recurring_done_)/.test(e.id || ''))
        .map(e => {
            const time = e.time || e.startTime || '';
            const title = e.type === 'birthday' ? 'cumpleaños de ' + e.title : e.type === 'work' ? (e.company || e.title || 'trabajo') : (e.title || '');
            const cat = categories.find(c => c.id === e.categoryId);
            return { esEvento: true, id: e.id, time, title, color: (typeof tintaCategoria === 'function' ? tintaCategoria(cat?.color) : cat?.color) || 'var(--text-secondary)', sub: { event: 'evento', birthday: 'cumpleaños', travel: 'viaje', work: 'trabajo' }[e.type] + (e.place ? `, ${e.place}` : '') };
        })
        .filter(e => !ya.has(`${e.time}|${e.title.trim().toLowerCase()}`));
}
