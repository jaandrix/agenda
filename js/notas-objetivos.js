        // ============================================================
        //  RENDER: NOTES
        // ============================================================
        let notasFiltro = '';

        function renderNotes() {
            const hoy = todayISO();
            const escritas = notes.filter(n => String(n.content || '').trim() || n.title);
            const notaHoy = notes.find(n => n.date === hoy && (String(n.content || '').trim() || n.title));
            const ahora = new Date();
            const mesClave = hoy.slice(0, 7);
            const diasMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
            const escritosMes = new Set(escritas.filter(n => (n.date || '').startsWith(mesClave)).map(n => n.date));
            const tira = Array.from({ length: diasMes }, (_, k) => {
                const iso = `${mesClave}-${String(k + 1).padStart(2, '0')}`;
                return `<span class="${escritosMes.has(iso) ? 'on' : ''} ${iso === hoy ? 'hoy' : ''} ${iso > hoy ? 'futuro' : ''}" title="${k + 1}"></span>`;
            }).join('');
            const q = stripAccents(notasFiltro.toLowerCase().trim());
            const lista = escritas
                .filter(n => !q || stripAccents(`${n.title || ''} ${n.content || ''}`.toLowerCase()).includes(q))
                .sort((a, b) => b.date.localeCompare(a.date));
            let mesActual = '';
            const tarjetas = lista.map(n => {
                const d = new Date(n.date + 'T12:00:00');
                const mes = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).replace(' de ', ' ');
                const cab = mes !== mesActual ? `<div class="notas-mes">${mes}.</div>` : '';
                mesActual = mes;
                const extracto = extractoNota(n.content);
                return `${cab}
                    <div class="note-card ${n.title ? '' : 'sin-titulo'} ${n.date === hoy ? 'note-card-hoy' : ''}" onclick="openReadNote('${n.id}')">
                        <div class="note-card-fecha">${formatNoteFecha(n.date)}${n.date === hoy ? ' · hoy' : ''}</div>
                        <div class="note-card-title">${n.title ? escapeHtml(n.title) : 'sin título.'}</div>
                        ${extracto ? `<div class="note-card-extracto">${escapeHtml(extracto)}</div>` : ''}
                    </div>`;
            }).join('');
            return `
            <div class="notas-vista">
                <div class="notas-cabecera">
                    <div>
                        <div class="notas-titulo">notas.</div>
                        <div class="notas-sub">${escritas.length} ${escritas.length === 1 ? 'nota escrita' : 'notas escritas'} · ${escritosMes.size} ${escritosMes.size === 1 ? 'día' : 'días'} este mes.</div>
                    </div>
                    <button class="btn-modal-primary notas-escribir" onclick="openWriteNote()">${notaHoy ? 'seguir con la de hoy.' : 'escribir la de hoy.'}</button>
                </div>
                <div class="notas-tira" aria-label="Días con nota este mes">${tira}</div>
                ${!notaHoy ? `<button class="notas-hoy-vacia" onclick="openWriteNote()"><b>hoy todavía no has escrito.</b> Una frase basta: qué ha pasado, qué piensas, qué no quieres olvidar.</button>` : ''}
                ${escritas.length > 6 ? `<input class="modal-input notas-buscar" placeholder="buscar en tus notas..." value="${escapeHtml(notasFiltro)}" oninput="notasFiltro=this.value;const c=this.selectionStart;render();const i=document.querySelector('.notas-buscar');if(i){i.focus();i.setSelectionRange(c,c)}">` : ''}
                ${lista.length ? `<div class="notes-grid notas-rejilla">${tarjetas}</div>` : (escritas.length ? `<div class="finance-empty-line">Ninguna nota contiene "${escapeHtml(notasFiltro)}".</div>` : '')}
            </div>`;
        }

        function openWriteNote() {
            const today = todayISO();
            let note = notes.find(n => n.date === today);
            if (!note) {
                note = { id: 'note_' + Date.now(), date: today, content: '', createdAt: new Date().toISOString() };
                notes.push(note);
                saveData();
            }
            openReadNote(note.id);
        }

        function openReadNote(id) {
            const note = notes.find(n => n.id === id);
            if (!note) return;
            window.openNoteId = id;
            document.getElementById('content').innerHTML = renderNoteDetail(note);
            requestAnimationFrame(() => {
                const editor = document.getElementById('note-content-input');
                if (editor) autoResizeNote(editor);
                const titulo = document.getElementById('note-title-input');
                if (titulo) autoResizeNote(titulo);
            });
        }

        function renderNoteDetail(note) {
            const editable = note.date === todayISO();
            const content = note.content || '';

            return `
                <div class="note-detail note-detail-wide">
                    <button class="btn-secondary" style="width:auto;padding:6px 14px;margin-bottom:16px" onclick="closeNoteDetail()">← Volver</button>
                    <div class="note-detail-fecha">${note.date === todayISO() ? 'hoy, ' : ''}${formatNoteFecha(note.date, true)}</div>
                    <textarea id="note-title-input" class="note-titulo-input" rows="1" placeholder="título de la nota." maxlength="120" oninput="autoSaveNoteTitle('${note.id}', this.value);autoResizeNote(this)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${escapeHtml(note.title || '')}</textarea>
                    ${editable ? `
                        <textarea id="note-content-input" class="note-textarea" placeholder="Escribe tu nota del día..." oninput="autoSaveNote('${note.id}', this.value);autoResizeNote(this);updateNoteLivePreview(this.value)">${escapeHtml(content)}</textarea>
                        <div class="note-detail-hint">Esta nota es editable solo hoy. Se guarda automáticamente. Usa [[Título exacto]] o /palabra para enlazar con cualquier entrada, asignatura o coleccionable.</div>
                        <div id="note-live-preview" class="note-readonly note-live-preview">${content ? linkifyText(content) : ''}</div>
                    ` : `
                        <div class="note-readonly">${content ? linkifyText(content) : '<span style="color:var(--text-muted)">(Nota vacía)</span>'}</div>
                        <div class="note-detail-hint">Esta nota ya no es editable: se escribió el ${formatNoteFecha(note.date)}. El título sí puedes cambiarlo.</div>
                    `}
                </div>`;
        }

        function closeNoteDetail() {
            window.openNoteId = null;
            document.getElementById('content').innerHTML = renderNotes();
        }

        let noteSaveTimer;

        function autoSaveNote(id, value) {
            const note = notes.find(n => n.id === id);
            if (!note || note.date !== todayISO()) return;
            note.content = value;
            clearTimeout(noteSaveTimer);
            noteSaveTimer = setTimeout(async () => {
                try { await saveData(); } catch (e) { console.error('Error guardando nota:', e); }
            }, 800);
        }

        // El título se puede poner o cambiar en cualquier nota, también en
        // las de días pasados: solo sirve para encontrarlas, no cambia lo
        // que se escribió ese día.
        let noteTitleTimer;
        function autoSaveNoteTitle(id, value) {
            const note = notes.find(n => n.id === id);
            if (!note) return;
            note.title = value.trim() || undefined;
            clearTimeout(noteTitleTimer);
            noteTitleTimer = setTimeout(async () => {
                try { await saveData(); } catch (e) { console.error('Error guardando el título:', e); }
            }, 800);
        }

        function updateNoteLivePreview(value) {
            const preview = document.getElementById('note-live-preview');
            if (preview) preview.innerHTML = value ? linkifyText(value) : '';
        }

        function autoResizeNote(el) {
            if (!el) return;
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
        }

        // ============================================================
        //  RENDER: GOALS
        // ============================================================
        function goalNumber(v) {
            return Number(v || 0).toLocaleString('es-ES', { maximumFractionDigits: 2 });
        }

        function goalProgressPct(e) {
            if (e.goalType !== 'numeric') return null;
            const target = Number(e.targetValue) || 0;
            if (target <= 0) return null;
            return Math.max(0, Math.min(100, Math.round((Number(e.currentValue) || 0) / target * 100)));
        }

        let goalViewMode = 'list';
        function setGoalViewMode(mode) { goalViewMode = mode; render(); }

        function renderGoals() {
            const goals = entries.filter(e => e.type === 'goal');
            const groups = [
                { key: 'short', label: 'Corto plazo' },
                { key: 'medium', label: 'Medio plazo' },
                { key: 'long', label: 'Largo plazo' }
            ];

            if (!goals.length) {
                return `
                    <div class="empty-state">

                        <div class="empty-title">ningún objetivo todavía.</div>
                        <div class="empty-sub"><span class="solo-escritorio">Pulsa el botón + y selecciona "Objetivo"</span><span class="solo-movil">Añade el primero con el botón de arriba.</span></div>
                    </div>`;
            }

            const thisYear = String(new Date().getFullYear());
            const activeCount = goals.filter(g => g.status !== 'Completado').length;
            const completedThisYear = goals.filter(g => g.status === 'Completado' && (g.date || '').startsWith(thisYear)).length;

            let html = `<div style="max-width:980px">
                <div class="culture-tabs" style="margin-bottom:18px">
                    <button class="culture-tab ${goalViewMode === 'list' ? 'active' : ''}" onclick="setGoalViewMode('list')">Lista</button>
                    <button class="culture-tab ${goalViewMode === 'kanban' ? 'active' : ''}" onclick="setGoalViewMode('kanban')">Tablero</button>
                    <button class="culture-tab ${goalViewMode === 'metodo' ? 'active' : ''}" onclick="setGoalViewMode('metodo')">Método</button>
                </div>
                <div class="goals-summary">
                    <div><strong>${activeCount}</strong><span>activos</span></div>
                    <div><strong>${completedThisYear}</strong><span>completados en ${thisYear}</span></div>
                    <div><strong>${goals.length}</strong><span>en total</span></div>
                </div>`;

            if (goalViewMode === 'metodo') {
                html += renderMetodo();
                html += `</div>`;
                return html;
            }

            if (goalViewMode === 'kanban') {
                html += renderGoalsKanban(goals);
                html += `</div>`;
                return html;
            }

            groups.forEach(g => {
                const items = goals.filter(e => e.term === g.key);
                if (!items.length) return;

                html += `
                    <div style="margin-bottom:24px">
                        <div class="modal-label" style="margin-bottom:8px">${g.label}</div>`;

                items.forEach(e => {
                    const cat = categories.find(c => c.id === e.categoryId);
                    const color = cat?.color || 'var(--text-secondary)';
                    const statusClass = e.status === 'Completado' ? 'badge-done' :
                        e.status === 'En progreso' ? 'badge-progress' : 'badge-pending';
                    const tags = (e.tags || []).map(t => `<span class="badge badge-default">${escapeHtml(t)}</span>`)
                        .join(' ');
                    const pct = goalProgressPct(e);
                    const milestones = e.milestones || [];
                    const msDone = milestones.filter(m => m.done).length;

                    html += `
                        <div class="entry-item" style="align-items:flex-start" data-open-entry="${e.id}">
                            <div class="entry-color-dot" style="background:${color};margin-top:6px"></div>
                            <div class="entry-info">
                                <div class="entry-title">${escapeHtml(e.title)}</div>
                                <div class="entry-meta">${tags} ${e.notes ? ' · ' + linkifyText(e.notes) : ''}</div>
                                ${pct !== null ? `
                                    <div class="progress-bar-bg" style="margin-top:8px;max-width:260px"><div class="progress-bar-fill" style="width:${pct}%;background:#2563eb"></div></div>
                                    <div style="font-size:11px;color:var(--text-secondary);margin-top:3px">${goalNumber(e.currentValue)} / ${goalNumber(e.targetValue)} ${escapeHtml(e.unit || '')} · ${pct}%</div>
                                ` : ''}
                                ${milestones.length ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:4px">${msDone}/${milestones.length} hitos</div>` : ''}
                                ${e.mandala?.pilares?.some(p => p.texto) || e.kaizenHabitId ? `<div class="objetivo-metodo-marcas">${e.mandala?.pilares?.some(p => p.texto) ? '<span>mandala.</span>' : ''}${e.kaizenHabitId ? '<span>kaizen.</span>' : ''}</div>` : ''}
                            </div>
                            <span class="badge ${statusClass}">${e.status}</span>
                            <div class="entry-actions">
                                <button class="delete" onclick="event.stopPropagation();deleteEntry('${e.id}')">✕</button>
                            </div>
                        </div>`;
                });

                html += `</div>`;
            });

            html += `</div>`;
            return html;
        }

        function renderGoalsKanban(goals) {
            const columns = ['Pendiente', 'En progreso', 'Completado'];
            return `<div class="kanban-board" id="goals-kanban-board">
                ${columns.map(col => {
                    const items = goals.filter(g => (g.status || 'Pendiente') === col);
                    return `
                    <div class="kanban-column" ondragover="event.preventDefault()" ondrop="goalColumnDrop(event,'${col}')">
                        <div class="kanban-column-head">${col} <span>${items.length}</span></div>
                        ${items.map(g => {
                            const cat = categories.find(c => c.id === g.categoryId);
                            const color = cat?.color || 'var(--text-secondary)';
                            const pct = goalProgressPct(g);
                            return `
                            <div class="kanban-card" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${g.id}')" data-open-entry="${g.id}" style="border-left:4px solid ${color}">
                                <div class="kanban-card-title">${escapeHtml(g.title)}</div>
                                ${pct !== null ? `<div class="progress-bar-bg" style="margin-top:8px"><div class="progress-bar-fill" style="width:${pct}%;background:#2563eb"></div></div>` : ''}
                            </div>`;
                        }).join('')}
                    </div>`;
                }).join('')}
            </div>`;
        }

        async function goalColumnDrop(event, status) {
            event.preventDefault();
            const id = event.dataTransfer.getData('text/plain');
            const g = entries.find(e => e.id === id && e.type === 'goal');
            if (!g || (g.status || 'Pendiente') === status) return;
            g.status = status;
            const board = document.getElementById('goals-kanban-board');
            if (board) board.outerHTML = renderGoalsKanban(entries.filter(e => e.type === 'goal'));
            else render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

