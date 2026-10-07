        // ============================================================
        //  FAB
        // ============================================================
        // ============================================================
        //  OPEN NEW ENTRY (FAB)
        // ============================================================
        function openNewEntry(type) {
            editId = null;
            editType = type;
            document.getElementById('modal-container').innerHTML = renderEntryModal(type, null);
        }

        // ============================================================
        //  ENTRY DETAIL (READ-ONLY FIRST)
        // ============================================================
        function formatTravelRange(startDate,endDate){
            if(!startDate&&!endDate)return '';
            const fmt=d=>new Date(d+'T12:00:00').toLocaleDateString('es-ES',{day:'numeric',month:'short'});
            if(startDate&&endDate)return `del ${fmt(startDate)} al ${fmt(endDate)}, ${endDate.slice(0,4)}`;
            return startDate?`desde ${fmt(startDate)}, ${startDate.slice(0,4)}`:`hasta ${fmt(endDate)}, ${endDate.slice(0,4)}`;
        }
        function getTravelTotal(entry){return(entry.expenses||[]).reduce((sum,x)=>sum+(Number(x.amount)||0),0);}
        function detailField(label,value){if(value===undefined||value===null||value==='')return '';return `<div class="entry-detail-field"><div class="entry-detail-label">${label}</div><div class="entry-detail-value">${value}</div></div>`;}
        async function toggleAvisoEvento(id) {
            const e = entries.find(x => x.id === id);
            if (!e) return;
            e.sinAviso = e.sinAviso ? undefined : true;
            openEntryDetail(id);
            showToast(e.sinAviso ? 'Este evento no avisará' : 'Avisará una hora antes');
            try { await saveData(); } catch (err) { console.error(err); showToast('No se pudo guardar en la nube', true); }
        }

        function renderEntryDetailModal(entry){
            const label=TYPE_LABELS[entry.type]||'Entrada'; let fields='';
            if(entry.type==='travel'){
                fields+=detailField('Lugar al que viajé',escapeHtml(entry.destination||entry.title));
                fields+=detailField('Fechas',escapeHtml(formatTravelRange(entry.startDate,entry.endDate)));
                if(entry.companions)fields+=detailField('Viajé con',escapeHtml(entry.companions));
                const total=getTravelTotal(entry); if(total>0)fields+=detailField('Coste total',total.toLocaleString('es-ES')+' €');
                if(entry.notes)fields+=detailField('Notas',linkifyText(entry.notes));
            }else if(entry.type==='project'){
                const pBucket = projectStatusBucket(entry.status);
                const pPriority = entry.priority || 'media';
                fields+=detailField('Descripción',escapeHtml(entry.description||''));
                fields+=detailField('Estado',pBucket);
                fields+=detailField('Prioridad',`<span class="project-priority-dot" style="background:${PROJECT_PRIORITY_COLOR[pPriority]}"></span> ${PROJECT_PRIORITY_LABEL[pPriority]}`);
                if(entry.endDate){
                    const overdue = entry.endDate < todayISO() && pBucket !== 'Completado';
                    fields+=detailField('Fecha límite', overdue ? `<span class="project-overdue">${escapeHtml(entry.endDate)} (vencido)</span>` : escapeHtml(entry.endDate));
                }
                const tasks=Array.isArray(entry.tasks)?entry.tasks:[];
                const doneCount = tasks.filter(t=>t.done).length;
                const pct = tasks.length ? Math.round(doneCount/tasks.length*100) : 0;
                fields+=`<div class="entry-detail-field" style="grid-column:1/-1"><div class="entry-detail-label">Ruta de hitos${tasks.length?` · ${doneCount}/${tasks.length} · ${pct}%`:''}</div>
                    ${tasks.length?`<div class="progress-bar-bg" style="margin-bottom:4px"><div class="progress-bar-fill" style="width:${pct}%;background:#2563eb"></div></div>`:''}
                    ${tasks.length?`<div class="project-roadmap">${tasks.map((task,i)=>`
                        <label class="project-roadmap-item" onclick="event.stopPropagation()">
                            <input type="checkbox" class="project-roadmap-checkbox" ${task.done?'checked':''} onchange="toggleProjectTask('${entry.id}',${i})">
                            <span class="project-roadmap-check ${task.done?'done':''}">${task.done?'✓':i+1}</span>
                            <span class="project-roadmap-text ${task.done?'done':''}">${escapeHtml(task.text)}</span>
                        </label>`).join('')}</div>`:'<span class="entry-detail-value">Sin hitos todavía.</span>'}</div>`;
                const features=Array.isArray(entry.features)?entry.features:[];
                if(features.length){
                    fields+=`<div class="entry-detail-field" style="grid-column:1/-1"><div class="entry-detail-label">Características</div>
                        <div class="project-features">${features.map(f=>`<div class="project-feature-chip"><b>${escapeHtml(f.label)}</b>${f.value?`<span>${escapeHtml(f.value)}</span>`:''}</div>`).join('')}</div></div>`;
                }
                if(entry.notes)fields+=detailField('Notas',linkifyText(entry.notes));
                fields+=renderEntryDocsSection('projects',entry.id,'Documentos');
            }else if(entry.type==='goal'){
                const termLabel = { short:'Corto plazo', medium:'Medio plazo', long:'Largo plazo' }[entry.term] || '';
                fields+=detailField('Plazo',termLabel);
                fields+=detailField('Estado',escapeHtml(entry.status||''));
                const gPct = goalProgressPct(entry);
                if(gPct!==null){
                    fields+=`<div class="entry-detail-field" style="grid-column:1/-1"><div class="entry-detail-label">Progreso</div>
                        <div class="progress-bar-bg" style="margin-bottom:6px"><div class="progress-bar-fill" style="width:${gPct}%;background:#2563eb"></div></div>
                        <div class="entry-detail-value">${goalNumber(entry.currentValue)} / ${goalNumber(entry.targetValue)} ${escapeHtml(entry.unit||'')} · ${gPct}%</div></div>`;
                }
                const milestones=Array.isArray(entry.milestones)?entry.milestones:[];
                if(milestones.length){
                    const msDone=milestones.filter(m=>m.done).length;
                    fields+=`<div class="entry-detail-field" style="grid-column:1/-1"><div class="entry-detail-label">Hitos · ${msDone}/${milestones.length}</div>
                        ${milestones.map((m,i)=>`<label class="project-task-row" onclick="event.stopPropagation()"><input type="checkbox" ${m.done?'checked':''} onchange="toggleGoalMilestone('${entry.id}',${i})"><span class="${m.done?'done':''}">${escapeHtml(m.text)}</span></label>`).join('')}</div>`;
                }
                fields+=renderGoalLinkedProjects(entry.id,entry.title||'');
                if(entry.tags?.length)fields+=detailField('Etiquetas',entry.tags.map(t=>escapeHtml(t)).join(' · '));
                if(entry.notes)fields+=detailField('Notas',linkifyText(entry.notes));
                fields+=renderEntryDocsSection('goals',entry.id,'Documentos');
            }else if(entry.type==='work'){
                if(entry.company)fields+=detailField('Empresa',escapeHtml(entry.company));
                if(entry.position)fields+=detailField('Cargo',escapeHtml(entry.position));
                const modalidadLabel=WORK_MODALIDAD_LABELS[entry.modalidad]||'';
                if(modalidadLabel)fields+=detailField('Modalidad',modalidadLabel);
                fields+=detailField('Fechas',escapeHtml((entry.startDate||'')+(entry.endDate?' → '+entry.endDate:' → Actual')));
                if(entry.schedule)fields+=detailField('Horario',escapeHtml(entry.schedule));
                if(entry.salary)fields+=detailField('Salario',entry.salary+'€/mes');
                if(entry.logros)fields+=detailField('Logros / aprendizajes',linkifyText(entry.logros));
                if(entry.endDate&&entry.motivoSalida)fields+=detailField('Motivo de salida',escapeHtml(entry.motivoSalida));
                if(entry.notes)fields+=detailField('Notas',linkifyText(entry.notes));
                fields+=`<div class="entry-detail-field work-docs-section" style="grid-column:1/-1">
                    <div class="entry-detail-label">Documentos (contratos, nóminas...)</div>
                    <button class="btn-secondary" style="width:auto;margin-bottom:10px" onclick="document.getElementById('work-doc-input-${entry.id}').click()">+ Subir documento</button>
                    <input type="file" id="work-doc-input-${entry.id}" accept="application/pdf" style="display:none" onchange="handleWorkDocUpload(event,'${entry.id}')">
                    <div id="work-doc-list-${entry.id}">Cargando documentos...</div>
                </div>`;
            }else if(entry.type==='event'){
                fields+=detailField('Fecha',escapeHtml(entry.date||''));
                if(entry.time)fields+=detailField('Hora',escapeHtml(entry.time));
                if(entry.time)fields+=detailField('Aviso',`<span class="evento-aviso-fila">${entry.sinAviso?'sin aviso.':(preferenciasAvisos.eventos===false?'apagado en ajustes.':'una hora antes.')}<button class="evento-aviso-btn" onclick="toggleAvisoEvento('${entry.id}')">${entry.sinAviso?'avisarme.':'silenciar.'}</button></span>`);
                if(entry.place)fields+=detailField('Lugar',escapeHtml(entry.place));
                if(entry.entradas?.length)fields+=`<button class="entrada-abrir-btn" onclick="abrirEntradas('${entry.id}')">${ENTRADA_ICONO}<span>${entry.entradas.length > 1 ? `ver entradas. (${entry.entradas.length})` : 'ver entrada.'}</span></button>`;
                const evTypeLabel=EVENT_TYPE_LABELS[entry.eventType]||'';
                if(evTypeLabel)fields+=detailField('Tipo',evTypeLabel);
                if(entry.notes)fields+=detailField('Notas',linkifyText(entry.notes));
                if(entry.tags?.length)fields+=detailField('Etiquetas',entry.tags.map(t=>escapeHtml(t)).join(' · '));
                fields+=renderEntryDocsSection('events',entry.id,'Documentos');
            }else{
                fields+=detailField('Fecha',escapeHtml(entry.date||entry.startDate||'')); fields+=detailField('Estado',escapeHtml(entry.status||''));
                fields+=detailField('Lugar',escapeHtml(entry.place||entry.destination||'')); fields+=detailField('Notas',entry.notes?linkifyText(entry.notes):'');
                if(entry.tags?.length)fields+=detailField('Etiquetas',entry.tags.map(t=>escapeHtml(t)).join(' · '));
                if(entry.author)fields+=detailField('Autor',escapeHtml(entry.author));
                if(entry.company)fields+=detailField('Empresa',escapeHtml(entry.company));
                if(entry.position)fields+=detailField('Cargo',escapeHtml(entry.position));
            }
            const detailExternal = entryExternalLink(entry);
            const detailExternalUrl = detailExternal?.url;
            const detailExternalBtn = detailExternal
                ? `<button class="entry-detail-external" data-ext-url="${escapeHtml(detailExternal.url)}" onclick="openExternalSearch(event,this)"><span>↗</span>${escapeHtml(detailExternal.label)}</button>`
                : '';
            const recomendable = ['book', 'movie', 'series', 'game'].includes(entry.type);
            const recomendarBtn = recomendable
                ? `<button class="btn-secondary" style="width:auto;margin-left:auto" onclick="abrirRecomendarModal('${entry.id}')">Recomendar</button>`
                : '';
            return `<div class="modal-overlay" onclick="if(event.target===this)closeModal()"><div class="modal-sheet entry-detail-card">${detailExternalBtn}<div class="modal-title modal-title-contenido${detailExternalUrl ? ' entry-detail-title-with-external' : ''}">${escapeHtml(entry.title||label)}</div><div style="font-size:11px;color:var(--text-secondary)">${label}</div><div class="entry-detail-grid">${fields||detailField('Información','Sin información adicional')}</div>${renderBacklinksBlock(entry.id, entry.type==='goal' ? ['project'] : null)}<div class="entry-detail-actions"><button class="btn-modal-primary" onclick="openEditEntry('${entry.id}')">Editar</button><button class="btn-secondary" style="width:auto" onclick="deleteEntry('${entry.id}')">Eliminar</button><button class="btn-secondary" style="width:auto" onclick="closeModal()">Cerrar</button>${recomendarBtn}${entry.type==='event' && entry.date >= todayISO() && amigos.length ? `<button class="btn-secondary" style="width:auto" onclick="openCompartirEvento('${entry.id}')">compartir.</button>` : ''}</div></div></div>`;
        }
        function openEntryDetail(id){const entry=entries.find(e=>e.id===id);if(!entry)return;if(entry.type==='travel'){switchView('travels');openTripManager(id);return;}document.getElementById('modal-container').innerHTML=renderEntryDetailModal(entry);if(entry.type==='work')loadWorkDocuments(entry.id);if(['project','goal','event'].includes(entry.type))loadEntryDocs(entry.type==='project'?'projects':entry.type==='goal'?'goals':'events',entry.id);}
        async function toggleProjectTask(projectId,taskIndex){
            const project=entries.find(e=>e.id===projectId); if(!project||!Array.isArray(project.tasks)||!project.tasks[taskIndex])return;
            project.tasks[taskIndex].done=!project.tasks[taskIndex].done;
            try{await saveData();openEntryDetail(projectId);render();}catch(e){console.error(e);showToast('No se pudo guardar la tarea',true);}
        }

        async function toggleGoalMilestone(goalId,index){
            const goal=entries.find(e=>e.id===goalId); if(!goal||!Array.isArray(goal.milestones)||!goal.milestones[index])return;
            goal.milestones[index].done=!goal.milestones[index].done;
            try{await saveData();openEntryDetail(goalId);render();}catch(e){console.error(e);showToast('No se pudo guardar el hito',true);}
        }

        // ============================================================
        //  OPEN EDIT ENTRY
        // ============================================================
        function openEditEntry(id){
            const entry = entries.find(e => e.id === id);
            if (!entry) return;
            editId = id;
            editType = entry.type;
            document.getElementById('modal-container').innerHTML = renderEntryModal(entry.type, entry);
        }

        // ============================================================
        //  CLOSE MODAL
        // ============================================================
        function closeModal() {
            editId = null;
            editType = null;
            const container = document.getElementById('modal-container');
            const overlay = container.querySelector('.modal-overlay');
            if (!overlay) { container.innerHTML = ''; return; }
            const sheet = overlay.querySelector('.modal-sheet');
            if (cerrarFichaHaciaOrigen(container, sheet)) return;
            overlay.style.animation = 'modalOverlayOut 0.18s ease both';
            if (sheet) sheet.style.animation = `${sheet.classList.contains('modal-sheet-desde-punto') ? 'modalSheetHaciaPunto' : 'modalSheetOut'} 0.18s var(--ease-out) both`;
            setTimeout(() => { if (container.contains(overlay)) container.innerHTML = ''; }, 170);
        }

        // ============================================================
        //  RENDER ENTRY MODAL
        // ============================================================
        function renderBacklinksBlock(entryId, excludeTypes) {
            let backlinks = getBacklinks(entryId);
            if (excludeTypes) backlinks = backlinks.filter(e => !excludeTypes.includes(e.type));
            if (!backlinks.length) return '';
            return `
                <div class="modal-label">Enlazado desde</div>
                <div class="backlinks-list">
                    ${backlinks.map(b => `
                        <div class="backlink-item" onclick="openEntryFromLink('${b.id}')">
                            <span>${escapeHtml(b.title)}</span>
                        </div>
                    `).join('')}
                </div>`;
        }

        function renderEntryModal(type, entry) {
            const isEdit = !!entry;
            const today = new Date().toISOString().slice(0, 10);
            const label = TYPE_LABELS[type] || 'Entrada';
            const nuevoNueva = TYPE_GENDER[type] === 'a' ? 'Nueva' : 'Nuevo';
            const title = isEdit ? 'Editar ' + label : nuevoNueva + ' ' + label;

            let extraFields = '';

            // ===== BOOK =====
            if (type === 'book') {
                extraFields = `
                    <div class="modal-label">Autor</div>
                    <input id="modal-author" class="modal-input" value="${isEdit ? entry.author || '' : ''}" placeholder="Ej: Gabriel García Márquez">
                    <div class="modal-label">Fecha de inicio</div>
                    <input type="date" id="modal-start" class="modal-input" value="${isEdit ? entry.startDate || '' : ''}">
                    ${isEdit ? `
                        <div class="modal-label">Fecha de finalización</div>
                        <input type="date" id="modal-end" class="modal-input" value="${entry.endDate || ''}">
                        <div class="modal-label">Valoración (1-5)</div>
                        <select id="modal-rating" class="modal-input">
                            ${[0,1,2,3,4,5].map(r => `<option value="${r}" ${isEdit && entry.rating === r ? 'selected' : ''}>${r === 0 ? 'Sin valorar' : '⭐'.repeat(r)}</option>`).join('')}
                        </select>
                    ` : ''}
                `;
            }

            // ===== MOVIE =====
            else if (type === 'movie') {
                extraFields = `
                    <div class="modal-label">Fecha</div>
                    <input type="date" id="modal-date" class="modal-input" value="${isEdit ? entry.date || '' : today}">
                    ${isEdit ? `
                        <div class="modal-label">Valoración (1-5)</div>
                        <select id="modal-rating" class="modal-input">
                            ${[0,1,2,3,4,5].map(r => `<option value="${r}" ${isEdit && entry.rating === r ? 'selected' : ''}>${r === 0 ? 'Sin valorar' : '⭐'.repeat(r)}</option>`).join('')}
                        </select>
                        <div class="modal-label">Notas</div>
                        <textarea id="modal-notes" class="modal-input" rows="2">${isEdit ? entry.notes || '' : ''}</textarea>
                    ` : ''}
                `;
            }

            // ===== SERIES =====
            else if (type === 'series') {
                const statuses = ['Viendo', 'Completada', 'Abandonada'];
                extraFields = `
                    <div class="modal-label">Fecha de inicio</div>
                    <input type="date" id="modal-start" class="modal-input" value="${isEdit ? entry.startDate || '' : today}">
                    ${isEdit ? `
                        <div class="modal-label">Estado</div>
                        <select id="modal-status" class="modal-input">
                            ${statuses.map(s => `<option value="${s}" ${isEdit && entry.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                        <div class="modal-label">Fecha de finalización</div>
                        <input type="date" id="modal-end" class="modal-input" value="${entry.endDate || ''}">
                        <div class="modal-label">Valoración (1-5)</div>
                        <select id="modal-rating" class="modal-input">
                            ${[0,1,2,3,4,5].map(r => `<option value="${r}" ${isEdit && entry.rating === r ? 'selected' : ''}>${r === 0 ? 'Sin valorar' : '⭐'.repeat(r)}</option>`).join('')}
                        </select>
                    ` : ''}
                `;
            }

            // ===== GAME =====
            else if (type === 'game') {
                const statuses = ['Jugando', 'Completado', 'Abandonado'];
                extraFields = `
                    <div class="modal-label">Fecha de inicio</div>
                    <input type="date" id="modal-start" class="modal-input" value="${isEdit ? entry.startDate || '' : today}">
                    ${isEdit ? `
                        <div class="modal-label">Estado</div>
                        <select id="modal-status" class="modal-input">
                            ${statuses.map(s => `<option value="${s}" ${isEdit && entry.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                        <div class="modal-label">Fecha de finalización</div>
                        <input type="date" id="modal-end" class="modal-input" value="${entry.endDate || ''}">
                        <div class="modal-label">Valoración (1-5)</div>
                        <select id="modal-rating" class="modal-input">
                            ${[0,1,2,3,4,5].map(r => `<option value="${r}" ${isEdit && entry.rating === r ? 'selected' : ''}>${r === 0 ? 'Sin valorar' : '⭐'.repeat(r)}</option>`).join('')}
                        </select>
                    ` : ''}
                `;
            }

            // ===== TRAVEL =====
            else if (type === 'travel') {
                const expenses = isEdit ? (entry.expenses || []) : [];
                extraFields = `
                    <div class="modal-label">Destino</div>
                    <input id="modal-destination" class="modal-input" value="${isEdit ? entry.destination || '' : ''}" placeholder="Ej: Roma, Italia">
                    <div class="modal-row">
                        <div><div class="modal-label">Fecha inicio</div><input type="date" id="modal-start" class="modal-input" value="${isEdit ? entry.startDate || '' : ''}"></div>
                        <div><div class="modal-label">Fecha fin</div><input type="date" id="modal-end" class="modal-input" value="${isEdit ? entry.endDate || '' : ''}"></div>
                    </div>
                    <div class="modal-label">Personas</div>
                    <input id="modal-companions" class="modal-input" value="${isEdit ? entry.companions || '' : ''}" placeholder="Ana, Carlos, ...">
                    <div class="modal-label">Gastos del viaje</div>
                    <div id="expenses-list">
                        ${expenses.map((exp, i) => renderExpenseRow(exp, i)).join('')}
                    </div>
                    <button type="button" class="btn-secondary" onclick="addExpenseRow()">+ Añadir gasto</button>
                    <div id="expenses-total">Total: ${expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0).toLocaleString('es-ES')}€</div>
                    <div class="modal-label">Notas</div>
                    <textarea id="modal-notes" class="modal-input" rows="2">${isEdit ? entry.notes || '' : ''}</textarea>
                `;
            }

            // ===== WORK =====
            else if (type === 'work') {
                extraFields = `
                    <div class="modal-label">Empresa</div>
                    <input id="modal-company" class="modal-input" value="${isEdit ? entry.company || '' : ''}" placeholder="Ej: Empresa X">
                    <div class="modal-label">Cargo</div>
                    <input id="modal-position" class="modal-input" value="${isEdit ? entry.position || '' : ''}" placeholder="Ej: Operario logístico">
                    <div class="modal-label">Modalidad</div>
                    <select id="modal-modalidad" class="modal-input">
                        <option value="" ${isEdit && entry.modalidad ? '' : 'selected'}>Sin especificar</option>
                        <option value="presencial" ${isEdit && entry.modalidad === 'presencial' ? 'selected' : ''}>Presencial</option>
                        <option value="hibrido" ${isEdit && entry.modalidad === 'hibrido' ? 'selected' : ''}>Híbrido</option>
                        <option value="remoto" ${isEdit && entry.modalidad === 'remoto' ? 'selected' : ''}>Remoto</option>
                    </select>
                    <div class="modal-row">
                        <div><div class="modal-label">Fecha inicio</div><input type="date" id="modal-start" class="modal-input" value="${isEdit ? entry.startDate || '' : ''}"></div>
                        <div><div class="modal-label">Fecha fin</div><input type="date" id="modal-end" class="modal-input" value="${isEdit ? entry.endDate || '' : ''}"></div>
                    </div>
                    <div class="modal-label">Horario</div>
                    <div class="modal-row">
                        <div><div class="modal-label" style="margin-top:4px">Entrada</div><input type="time" id="modal-start-time" class="modal-input" value="${isEdit ? entry.startTime || '' : ''}"></div>
                        <div><div class="modal-label" style="margin-top:4px">Salida</div><input type="time" id="modal-end-time" class="modal-input" value="${isEdit ? entry.endTime || '' : ''}"></div>
                    </div>
                    <div class="modal-label">Tipo de cotización</div>
                    <select id="modal-cotization-type" class="modal-input">
                        <option value="general" ${isEdit && entry.cotizationType === 'practicas' ? '' : 'selected'}>Régimen general</option>
                        <option value="practicas" ${isEdit && entry.cotizationType === 'practicas' ? 'selected' : ''}>Prácticas formativas</option>
                    </select>
                    <div class="modal-label">Vida laboral · días cotizados</div>
                    <input type="number" id="modal-cotized-days" class="modal-input" value="${isEdit && Number.isFinite(Number(entry.cotizedDays)) ? entry.cotizedDays : ''}" min="0" step="1" placeholder="Ej: 32">
                    <div style="font-size:11px;color:var(--text-secondary);margin:-4px 0 10px">
                        Opcional. Si introduces aquí la cifra real de tu informe de Vida Laboral, Bitácora la utilizará en lugar de su estimación. Si lo dejas vacío, calculará los días automáticamente, incluyendo fines de semana.
                    </div>
                    <div class="modal-label">Salario (€/mes, opcional)</div>
                    <input type="number" id="modal-salary" class="modal-input" value="${isEdit ? entry.salary || '' : ''}" step="0.01" placeholder="0.00">
                    <div class="modal-label">Logros / lo que aprendiste (opcional)</div>
                    <textarea id="modal-logros" class="modal-input" rows="2" placeholder="Ej: Lideré la migración del almacén al nuevo sistema...">${isEdit ? entry.logros || '' : ''}</textarea>
                    <div class="modal-label">Motivo de salida (opcional)</div>
                    <input id="modal-motivo-salida" class="modal-input" value="${isEdit ? entry.motivoSalida || '' : ''}" placeholder="Ej: Fin de contrato, cambio voluntario...">
                    <div class="modal-label">Notas</div>
                    <textarea id="modal-notes" class="modal-input" rows="2">${isEdit ? entry.notes || '' : ''}</textarea>
                `;
            }

            // ===== PROJECT =====
            else if (type === 'project') {
                const pStatus = isEdit ? projectStatusBucket(entry.status) : 'Pendiente';
                const pPriority = isEdit ? (entry.priority || 'media') : 'media';
                extraFields = `
                    <div class="modal-label">Descripción</div>
                    <textarea id="modal-desc" class="modal-input" rows="2">${isEdit ? entry.description || '' : ''}</textarea>
                    <div class="modal-row">
                        <div><div class="modal-label">Categoría</div>
                            <select id="modal-category" class="modal-input">
                                <option value="Trabajo" ${isEdit && entry.projectCategory === 'Trabajo' ? 'selected' : ''}>Trabajo</option>
                                <option value="Estudios" ${isEdit && entry.projectCategory === 'Estudios' ? 'selected' : ''}>Estudios</option>
                                <option value="Ocio" ${isEdit && entry.projectCategory === 'Ocio' ? 'selected' : ''}>Ocio</option>
                                <option value="Evento" ${isEdit && entry.projectCategory === 'Evento' ? 'selected' : ''}>Evento</option>
                            </select>
                        </div>
                        <div><div class="modal-label">Prioridad</div>
                            <select id="modal-priority" class="modal-input">
                                <option value="alta" ${pPriority === 'alta' ? 'selected' : ''}>Alta</option>
                                <option value="media" ${pPriority === 'media' ? 'selected' : ''}>Media</option>
                                <option value="baja" ${pPriority === 'baja' ? 'selected' : ''}>Baja</option>
                            </select>
                        </div>
                    </div>
                    <div class="modal-label">Estado</div>
                    <select id="modal-project-status" class="modal-input">
                        <option value="Pendiente" ${pStatus === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                        <option value="En progreso" ${pStatus === 'En progreso' ? 'selected' : ''}>En progreso</option>
                        <option value="Completado" ${pStatus === 'Completado' ? 'selected' : ''}>Completado</option>
                    </select>
                    <div class="modal-row">
                        <div><div class="modal-label">Fecha inicio</div><input type="date" id="modal-start" class="modal-input" value="${isEdit ? entry.startDate || '' : ''}"></div>
                        <div><div class="modal-label">Fecha límite</div><input type="date" id="modal-end" class="modal-input" value="${isEdit ? entry.endDate || '' : ''}"></div>
                    </div>
                    <div class="modal-label">Ruta de hitos (uno por línea; añade ✓ al final para marcarlo hecho)</div>
                    <textarea id="modal-tasks" class="modal-input" rows="3">${isEdit ? (entry.tasks || []).map(t => t.text + (t.done ? ' ✓' : '')).join('\n') : ''}</textarea>
                    <div class="modal-label">Características (una por línea, formato Etiqueta: Valor)</div>
                    <textarea id="modal-features" class="modal-input" rows="2" placeholder="Presupuesto: 500€&#10;Cliente: Ada&#10;Stack: React + Supabase">${isEdit ? (entry.features || []).map(f => f.label + ': ' + f.value).join('\n') : ''}</textarea>
                    <div class="modal-label">Notas</div>
                    <textarea id="modal-notes" class="modal-input" rows="2">${isEdit ? entry.notes || '' : ''}</textarea>
                `;
            }

            // ===== EVENT =====
            else if (type === 'event') {
                extraFields = `
                    <div class="modal-label">Tipo</div>
                    <select id="modal-event-type" class="modal-input" onchange="document.getElementById('modal-event-deporte-wrap').style.display = this.value === 'deportes' ? '' : 'none'">
                        ${EVENT_CATEGORIAS.map(t => `<option value="${t}" ${isEdit && eventCategoria(entry.eventType) === t ? 'selected' : ''}>${EVENT_TYPE_LABELS[t]}</option>`).join('')}
                    </select>
                    <div id="modal-event-deporte-wrap" style="${isEdit && eventCategoria(entry.eventType) === 'deportes' ? '' : 'display:none'}">
                        <div class="modal-label">Deporte</div>
                        <select id="modal-event-deporte" class="modal-input">
                            <option value="deportes" ${isEdit && entry.eventType === 'deportes' ? 'selected' : ''}>Sin especificar</option>
                            ${EVENT_DEPORTES.map(t => `<option value="${t}" ${isEdit && entry.eventType === t ? 'selected' : ''}>${EVENT_TYPE_LABELS[t]}</option>`).join('')}
                        </select>
                    </div>
                    <div class="modal-label">Fecha</div>
                    <input type="date" id="modal-date" class="modal-input" value="${isEdit ? entry.date || '' : today}">
                    <div class="modal-label">Hora</div>
                    <input type="time" id="modal-time" class="modal-input" value="${isEdit ? entry.time || '' : ''}">
                    <div class="modal-label">Aviso</div>
                    <select id="modal-event-aviso" class="modal-input">
                        <option value="si" ${isEdit && entry.sinAviso ? '' : 'selected'}>Una hora antes</option>
                        <option value="no" ${isEdit && entry.sinAviso ? 'selected' : ''}>Sin aviso</option>
                    </select>
                    <div class="modal-label">Lugar</div>
                    <input id="modal-place" class="modal-input" value="${isEdit ? entry.place || '' : ''}" placeholder="Ej: Wembley Stadium">
                    <div class="modal-label">Notas</div>
                    <textarea id="modal-notes" class="modal-input" rows="2">${isEdit ? entry.notes || '' : ''}</textarea>
                    <div class="modal-label">¿Cuántas personas vais?</div>
                    <select id="modal-event-personas" class="modal-input" onchange="window._personasEvento = Number(this.value); document.getElementById('entradas-editor').innerHTML = renderEntradasEditor()">
                        ${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${(isEdit ? (entry.personas || 1) : 1) === n ? 'selected' : ''}>${n === 1 ? 'Solo yo' : n + ' personas'}</option>`).join('')}
                    </select>
                    <div class="modal-label">Entradas</div>
                    <div id="entradas-editor">${(window._entradasDraft = isEdit ? JSON.parse(JSON.stringify(entry.entradas || [])) : [], window._personasEvento = isEdit ? (entry.personas || 1) : 1, renderEntradasEditor())}</div>
                    <input type="file" id="entradas-input" accept="image/*" style="display:none" onchange="anadirEntradaDesdeImagen(event)">
                `;
            }

            // ===== PLACE =====
            else if (type === 'place') {
                extraFields = `
                    <div class="modal-label">Fecha</div>
                    <input type="date" id="modal-date" class="modal-input" value="${isEdit ? entry.date || '' : today}">
                    <div class="modal-label">Notas</div>
                    <textarea id="modal-notes" class="modal-input" rows="2">${isEdit ? entry.notes || '' : ''}</textarea>
                `;
            }

            // ===== DOCUMENT =====
            else if (type === 'document') {
                extraFields = `
                    <div class="modal-label">Fecha</div>
                    <input type="date" id="modal-date" class="modal-input" value="${isEdit ? entry.date || '' : today}">
                    <div class="modal-label">Notas</div>
                    <textarea id="modal-notes" class="modal-input" rows="2">${isEdit ? entry.notes || '' : ''}</textarea>
                `;
            }

            // ===== GOAL =====
            else if (type === 'goal') {
                const statuses = ['Pendiente', 'En progreso', 'Completado'];
                const goalType = isEdit ? (entry.goalType || 'simple') : 'simple';
                extraFields = `
                    <div class="modal-row">
                        <div><div class="modal-label">Plazo</div>
                            <select id="modal-term" class="modal-input">
                                <option value="short" ${isEdit && entry.term === 'short' ? 'selected' : ''}>Corto plazo</option>
                                <option value="medium" ${isEdit && entry.term === 'medium' ? 'selected' : ''}>Medio plazo</option>
                                <option value="long" ${isEdit && entry.term === 'long' ? 'selected' : ''}>Largo plazo</option>
                            </select>
                        </div>
                        <div><div class="modal-label">Tipo</div>
                            <select id="modal-goal-type" class="modal-input" onchange="document.getElementById('goal-numeric-fields').style.display=this.value==='numeric'?'block':'none'">
                                <option value="simple" ${goalType === 'simple' ? 'selected' : ''}>Simple (estado)</option>
                                <option value="numeric" ${goalType === 'numeric' ? 'selected' : ''}>Numérico (progreso)</option>
                            </select>
                        </div>
                    </div>
                    <div id="goal-numeric-fields" style="display:${goalType === 'numeric' ? 'block' : 'none'}">
                        <div class="modal-row">
                            <div><div class="modal-label">Valor actual</div><input type="number" step="any" id="modal-goal-current" class="modal-input" value="${isEdit ? entry.currentValue ?? '' : ''}" placeholder="0"></div>
                            <div><div class="modal-label">Objetivo</div><input type="number" step="any" id="modal-goal-target" class="modal-input" value="${isEdit ? entry.targetValue ?? '' : ''}" placeholder="100"></div>
                        </div>
                        <div class="modal-label">Unidad</div>
                        <input id="modal-goal-unit" class="modal-input" value="${isEdit ? entry.unit || '' : ''}" placeholder="Ej: libros, €, km">
                    </div>
                    <div class="modal-label">Estado</div>
                    <select id="modal-goal-status" class="modal-input">
                        ${statuses.map(s => `<option value="${s}" ${isEdit && entry.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                    <div class="modal-label">Hitos (uno por línea; añade ✓ al final para marcarlo hecho)</div>
                    <textarea id="modal-goal-milestones" class="modal-input" rows="3">${isEdit ? (entry.milestones || []).map(m => m.text + (m.done ? ' ✓' : '')).join('\n') : ''}</textarea>
                    <div class="modal-label">Etiquetas (separadas por comas)</div>
                    <input id="modal-tags" class="modal-input" value="${isEdit ? (entry.tags || []).join(', ') : ''}" placeholder="p.ej. personal, trabajo, 2026">
                    <div class="modal-label">Notas</div>
                    <textarea id="modal-notes" class="modal-input" rows="3">${isEdit ? entry.notes || '' : ''}</textarea>
                `;
            }

            // ===== SUBSCRIPTION / FIXED_EXPENSE =====
            else if (type === 'subscription' || type === 'fixed_expense') {
                extraFields = `
                    <div class="modal-label">Importe mensual (€)</div>
                    <input type="number" id="modal-recurring-amount" class="modal-input" step="0.01" value="${isEdit ? entry.amount || '' : ''}" placeholder="0.00">
                    <div class="modal-label">Día de cargo (1-31)</div>
                    <input type="number" id="modal-recurring-day" class="modal-input" min="1" max="31" value="${isEdit ? entry.renewalDay || '' : ''}" placeholder="1">
                    <div class="modal-label">Estado</div>
                    <select id="modal-recurring-active" class="modal-input">
                        <option value="true" ${!isEdit || entry.active !== false ? 'selected' : ''}>Activo</option>
                        <option value="false" ${isEdit && entry.active === false ? 'selected' : ''}>Inactivo</option>
                    </select>
                    ${financePro.enabled ? `
                    <div class="modal-label">Cuenta PRO a la que se carga</div>
                    <select id="modal-recurring-account" class="modal-input">
                        ${type === 'subscription' ? '' : '<option value="">No registrar como movimiento PRO</option>'}
                        ${FINANCE_PRO_ACCOUNT_KEYS.map(k => `<option value="${k}" ${(isEdit ? entry.proAccount || (type === 'subscription' ? 'bancos' : '') : (type === 'subscription' ? 'bancos' : '')) === k ? 'selected' : ''}>${escapeHtml(financePro.accounts[k].name)}</option>`).join('')}
                    </select>
                    <div class="finance-modal-note">${type === 'subscription'
                        ? 'Se registra sola como gasto el día de cargo de cada mes. Si luego importas el extracto del banco, el cargo real sustituye a este en vez de duplicarse.'
                        : 'Si eliges una cuenta, este cargo se registrará solo como movimiento PRO el día indicado de cada mes.'}</div>` : ''}
                    <label class="recurrente-vigilar">
                        <input type="checkbox" id="modal-recurring-vigilar" ${isEdit && entry.vigilar ? 'checked' : ''}>
                        <span>avisarme si no aparece en el banco.<small>Tres días después del día de cargo, si el extracto importado no lo confirma, te lo recuerdo en el inicio.</small></span>
                    </label>
                `;
            }

            // ===== BIRTHDAY =====
            else if (type === 'birthday') {
                extraFields = `
                    <div class="modal-label">Nombre</div>
                    <input id="modal-bday-name" class="modal-input" value="${isEdit ? entry.firstName || '' : ''}" placeholder="Ej: Juan">
                    <div class="modal-label">Apellido</div>
                    <input id="modal-bday-lastname" class="modal-input" value="${isEdit ? entry.lastName || '' : ''}" placeholder="Ej: Pérez">
                    <div class="modal-label">Fecha de nacimiento</div>
                    <input type="date" id="modal-bday-date" class="modal-input" value="${isEdit ? entry.birthDate || '' : ''}">
                    <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">El cumpleaños aparecerá todos los años en el calendario.</div>
                `;
            }

            return `
            <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
                <div class="modal-sheet">
                    <div class="modal-title">
                        ${title}
                        <button class="modal-close" onclick="closeModal()">✕</button>
                    </div>

                    <div class="modal-label">Título</div>
                    <input id="modal-title" class="modal-input" value="${isEdit ? entry.title : ''}" placeholder="Escribe un título...">

                    ${extraFields}

                    <div class="modal-label">Etiquetas (separadas por comas)</div>
                    <input id="modal-tags" class="modal-input" value="${isEdit ? (entry.tags || []).join(', ') : ''}" placeholder="p.ej. urgente, 2026, personal">

                    <div class="wikilink-hint">Consejo: escribe [[ en las notas y elige de la lista para enlazar otra entrada.</div>
                    ${isEdit ? renderBacklinksBlock(entry.id) : ''}

                    <button class="btn-modal-primary" onclick="saveEntry()">Guardar</button>
                    ${isEdit ? `<button class="btn-modal-danger" onclick="deleteEntry('${entry.id}')">Eliminar</button>` : ''}
                </div>
            </div>`;
        }

        // ============================================================
        //  SAVE ENTRY
        // ============================================================
        async function saveEntry() {
            const title = document.getElementById('modal-title').value.trim();

            const type = editType;
            const entry = {
                id: editId || 'entry_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                title: title,
                type: type,
                date: '',
                categoryId: getCategoryIdForType(type),
                tags: (document.getElementById('modal-tags')?.value || '')
                    .split(',').map(t => t.trim()).filter(Boolean)
            };

            if (type === 'book') {
                entry.author = document.getElementById('modal-author')?.value?.trim() || '';
                entry.startDate = document.getElementById('modal-start')?.value || '';
                entry.date = entry.startDate;
                if (editId) {
                    entry.endDate = document.getElementById('modal-end')?.value || '';
                    entry.rating = parseInt(document.getElementById('modal-rating')?.value) || 0;
                } else {
                    entry.endDate = '';
                    entry.rating = 0;
                }
                entry.status = entry.endDate ? 'Completado' : 'Leyendo';
            } else if (type === 'movie') {
                entry.date = document.getElementById('modal-date')?.value || '';
                if (editId) {
                    entry.rating = parseInt(document.getElementById('modal-rating')?.value) || 0;
                    entry.notes = document.getElementById('modal-notes')?.value?.trim() || '';
                    if (entry.rating > 0) completarTareaValorarPelicula(entry.id);
                } else {
                    entry.rating = 0;
                    entry.notes = '';
                }
            } else if (type === 'series') {
                entry.startDate = document.getElementById('modal-start')?.value || '';
                entry.date = entry.startDate;
                if (editId) {
                    entry.endDate = document.getElementById('modal-end')?.value || '';
                    let status = document.getElementById('modal-status')?.value || 'Viendo';
                    // Si se indica fecha de finalización y el estado se dejó en el
                    // valor por defecto "Viendo", se asume completada automáticamente.
                    if (entry.endDate && status === 'Viendo') status = 'Completada';
                    entry.status = status;
                    entry.rating = parseInt(document.getElementById('modal-rating')?.value) || 0;
                } else {
                    entry.status = 'Viendo';
                    entry.endDate = '';
                    entry.rating = 0;
                }
            } else if (type === 'game') {
                entry.startDate = document.getElementById('modal-start')?.value || '';
                entry.date = entry.startDate;
                if (editId) {
                    entry.endDate = document.getElementById('modal-end')?.value || '';
                    let status = document.getElementById('modal-status')?.value || 'Jugando';
                    if (entry.endDate && status === 'Jugando') status = 'Completado';
                    entry.status = status;
                    entry.rating = parseInt(document.getElementById('modal-rating')?.value) || 0;
                } else {
                    entry.status = 'Jugando';
                    entry.endDate = '';
                    entry.rating = 0;
                }
            } else if (type === 'travel') {
                entry.destination = document.getElementById('modal-destination')?.value?.trim() || '';
                entry.startDate = document.getElementById('modal-start')?.value || '';
                entry.endDate = document.getElementById('modal-end')?.value || '';
                entry.date = entry.startDate || entry.endDate || '';
                entry.companions = document.getElementById('modal-companions')?.value?.trim() || '';
                entry.notes = document.getElementById('modal-notes')?.value?.trim() || '';
                entry.expenses = window._expenses || [];
            } else if (type === 'work') {
                entry.company = document.getElementById('modal-company')?.value?.trim() || '';
                entry.position = document.getElementById('modal-position')?.value?.trim() || '';
                entry.modalidad = document.getElementById('modal-modalidad')?.value || '';
                entry.startDate = document.getElementById('modal-start')?.value || '';
                entry.endDate = document.getElementById('modal-end')?.value || '';
                entry.startTime = document.getElementById('modal-start-time')?.value || '';
                entry.endTime = document.getElementById('modal-end-time')?.value || '';
                entry.date = entry.startDate || entry.endDate || '';
                entry.schedule = (entry.startTime ? entry.startTime : '') + (entry.endTime ? ' - ' + entry.endTime : '');
                entry.cotizationType = document.getElementById('modal-cotization-type')?.value || 'general';
                const cotizedDaysRaw = document.getElementById('modal-cotized-days')?.value;
                entry.cotizedDays = cotizedDaysRaw === '' || cotizedDaysRaw == null ? null : Math.max(0, parseInt(cotizedDaysRaw, 10) || 0);
                entry.salary = parseFloat(document.getElementById('modal-salary')?.value) || null;
                entry.logros = document.getElementById('modal-logros')?.value?.trim() || '';
                entry.motivoSalida = document.getElementById('modal-motivo-salida')?.value?.trim() || '';
                entry.notes = document.getElementById('modal-notes')?.value?.trim() || '';
                entry.status = entry.endDate ? 'Completado' : 'Trabajo actual';
            } else if (type === 'project') {
                entry.description = document.getElementById('modal-desc')?.value?.trim() || '';
                entry.projectCategory = document.getElementById('modal-category')?.value || 'Trabajo';
                entry.priority = document.getElementById('modal-priority')?.value || 'media';
                entry.status = document.getElementById('modal-project-status')?.value || 'Pendiente';
                entry.startDate = document.getElementById('modal-start')?.value || '';
                entry.endDate = document.getElementById('modal-end')?.value || '';
                entry.date = entry.startDate || entry.endDate || '';
                const tasksRaw = document.getElementById('modal-tasks')?.value?.split('\n').filter(t => t.trim()) || [];
                entry.tasks = tasksRaw.map(t => {
                    const done = /(?:^|\s)(?:✓|✔|☑|\[x\]|x)$/i.test(t.trim());
                    return { text: t.replace(/(?:\s+(?:✓|✔|☑|\[x\]|x))$/i, '').trim(), done };
                });
                const featuresRaw = document.getElementById('modal-features')?.value?.split('\n').filter(f => f.trim()) || [];
                entry.features = featuresRaw.map(f => {
                    const idx = f.indexOf(':');
                    return idx === -1 ? { label: f.trim(), value: '' } : { label: f.slice(0, idx).trim(), value: f.slice(idx + 1).trim() };
                });
                entry.notes = document.getElementById('modal-notes')?.value?.trim() || '';
            } else if (type === 'event') {
                entry.eventType = document.getElementById('modal-event-type')?.value || 'otro';
                if (entry.eventType === 'deportes') entry.eventType = document.getElementById('modal-event-deporte')?.value || 'deportes';
                entry.date = document.getElementById('modal-date')?.value || '';
                entry.time = document.getElementById('modal-time')?.value || '';
                entry.sinAviso = document.getElementById('modal-event-aviso')?.value === 'no' ? true : undefined;
                entry.place = document.getElementById('modal-place')?.value?.trim() || '';
                entry.notes = document.getElementById('modal-notes')?.value?.trim() || '';
                const entradas = (window._entradasDraft || []).filter(x => x && (x.qrB64 || x.qr));
                entry.entradas = entradas.length ? entradas : undefined;
                const personas = Number(document.getElementById('modal-event-personas')?.value) || 1;
                entry.personas = personas > 1 ? personas : undefined;
                // saveEntry reconstruye la entrada desde el formulario: sin
                // esto, editar un cine ya convertido en película lo volvería
                // a convertir y duplicaría la película.
                const previo = editId ? entries.find(e => e.id === editId) : null;
                if (previo?.peliculaId) entry.peliculaId = previo.peliculaId;
            } else if (type === 'place') {
                entry.date = document.getElementById('modal-date')?.value || '';
                entry.notes = document.getElementById('modal-notes')?.value?.trim() || '';
            } else if (type === 'document') {
                entry.date = document.getElementById('modal-date')?.value || '';
                entry.notes = document.getElementById('modal-notes')?.value?.trim() || '';
            } else if (type === 'goal') {
                entry.term = document.getElementById('modal-term')?.value || 'short';
                entry.goalType = document.getElementById('modal-goal-type')?.value || 'simple';
                if (entry.goalType === 'numeric') {
                    entry.currentValue = parseFloat(document.getElementById('modal-goal-current')?.value) || 0;
                    entry.targetValue = parseFloat(document.getElementById('modal-goal-target')?.value) || 0;
                    entry.unit = document.getElementById('modal-goal-unit')?.value?.trim() || '';
                }
                entry.status = document.getElementById('modal-goal-status')?.value || 'Pendiente';
                const milestonesRaw = document.getElementById('modal-goal-milestones')?.value?.split('\n').filter(t => t.trim()) || [];
                entry.milestones = milestonesRaw.map(t => {
                    const done = /(?:^|\s)(?:✓|✔|☑|\[x\]|x)$/i.test(t.trim());
                    return { text: t.replace(/(?:\s+(?:✓|✔|☑|\[x\]|x))$/i, '').trim(), done };
                });
                entry.tags = (document.getElementById('modal-tags')?.value || '')
                    .split(',').map(t => t.trim()).filter(Boolean);
                entry.notes = document.getElementById('modal-notes')?.value?.trim() || '';
                entry.date = entry.date || todayISO();
            } else if (type === 'subscription' || type === 'fixed_expense') {
                entry.amount = parseFloat(document.getElementById('modal-recurring-amount')?.value) || 0;
                entry.renewalDay = parseInt(document.getElementById('modal-recurring-day')?.value) || 1;
                entry.active = document.getElementById('modal-recurring-active')?.value !== 'false';
                if (financePro.enabled) entry.proAccount = document.getElementById('modal-recurring-account')?.value || '';
                entry.vigilar = !!document.getElementById('modal-recurring-vigilar')?.checked;
                entry.date = entry.date || todayISO();
            } else if (type === 'birthday') {
                entry.firstName = document.getElementById('modal-bday-name')?.value?.trim() || '';
                entry.lastName = document.getElementById('modal-bday-lastname')?.value?.trim() || '';
                entry.birthDate = document.getElementById('modal-bday-date')?.value || '';
                entry.title = (entry.firstName + ' ' + entry.lastName).trim() || entry.title || 'Cumpleaños';
                entry.date = entry.birthDate;
                entry.tags = (document.getElementById('modal-tags')?.value || '')
                    .split(',').map(t => t.trim()).filter(Boolean);
            }

            if (editId) {
                const idx = entries.findIndex(e => e.id === editId);
                // Se mezcla con la entrada anterior: el formulario no tiene
                // todos los campos (concepto del banco aprendido de una
                // suscripción, enlace y tipo de una ficha de documento,
                // marcas internas...) y reemplazarla entera los borraba.
                if (idx >= 0) entries[idx] = { ...entries[idx], ...entry };
            } else {
                entries.push(entry);
            }

            entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            filteredEntries = [...entries];
            closeModal();
            render();
            try {
                await saveData();
                showToast('Guardado');
            } catch (err) {
                console.error('Error guardando la entrada en Supabase:', err);
                showToast('No se pudo guardar en la nube. Revisa tu conexión.', true);
            }
        }

        function getCategoryIdForType(type) {
            const map = {
                book: 'cat_libro',
                movie: 'cat_pelicula',
                series: 'cat_serie',
                game: 'cat_videojuego',
                travel: 'cat_viaje',
                work: 'cat_trabajo',
                project: 'cat_proyecto',
                event: 'cat_evento',
                restaurant: 'cat_restaurante',
                place: 'cat_lugar',
                document: 'cat_general',
                goal: 'cat_general',
                birthday: 'cat_general',
                subscription: 'cat_suscripcion',
                fixed_expense: 'cat_gasto_fijo'
            };
            const id = map[type] || 'cat_general';
            return categories.find(c => c.id === id)?.id || 'cat_general';
        }

        // ============================================================
        //  DELETE ENTRY
        // ============================================================
        async function deleteEntry(id) {
            if (!confirm('¿Eliminar esta entrada?')) return;
            entries = entries.filter(e => e.id !== id);
            filteredEntries = [...entries];
            closeModal();
            render();
            try {
                await saveData();
                showToast('Eliminado');
            } catch (err) {
                console.error('Error eliminando la entrada en Supabase:', err);
                showToast('No se pudo eliminar en la nube. Revisa tu conexión.', true);
            }
        }

        // ============================================================
        //  EXPENSE ROWS (TRAVEL)
        // ============================================================
        window._expenses = [];

        function renderExpenseRow(exp, index) {
            return `
                <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">
                    <input class="modal-input" style="flex:2" value="${exp.description || ''}" placeholder="Concepto" onchange="updateExpense(${index}, 'description', this.value)">
                    <input class="modal-input" style="flex:1" type="number" value="${exp.amount || ''}" placeholder="€" onchange="updateExpense(${index}, 'amount', this.value)">
                    <button onclick="removeExpense(${index})" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:18px">✕</button>
                </div>`;
        }

        function addExpenseRow() {
            const list = document.getElementById('expenses-list');
            if (!list) return;
            const idx = window._expenses.length;
            window._expenses.push({ description: '', amount: 0 });
            list.insertAdjacentHTML('beforeend', renderExpenseRow({ description: '', amount: 0 }, idx));
            updateExpenseTotal();
        }

        function updateExpense(index, field, value) {
            if (!window._expenses[index]) return;
            window._expenses[index][field] = field === 'amount' ? parseFloat(value) || 0 : value;
            updateExpenseTotal();
        }

        function removeExpense(index) {
            window._expenses.splice(index, 1);
            renderExpensesList();
        }

        function renderExpensesList() {
            const list = document.getElementById('expenses-list');
            if (!list) return;
            list.innerHTML = window._expenses.map((exp, i) => renderExpenseRow(exp, i)).join('');
            updateExpenseTotal();
        }

        function updateExpenseTotal() {
            const totalEl = document.getElementById('expenses-total');
            if (!totalEl) return;
            const total = window._expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
            totalEl.textContent = 'Total: ' + total.toLocaleString('es-ES') + '€';
        }

        // ============================================================
        //  EXPORT / IMPORT
        // ============================================================
        // Única fuente de verdad para lo que entra en una copia de seguridad
        // completa — exactamente los mismos campos que doSaveData() manda a
        // Supabase (ver mergedData ahí), para que "Exportar datos" nunca se
        // quede corto de algo que sí se está guardando en la nube. Antes
        // había tres listas de campos distintas (este botón, el de Centro
        // resumen y el propio guardado) que se habían ido desincronizando
        // según se añadían secciones nuevas.
        function buildFullBackupPayload() {
            return {
                entries, categories, userName, investmentData, notes, prompts, inbox, registroConector,
                financeIncome, financeProfile, financePro, plannedTrips, weeklyTasks, cultureLists, habits,
                collectibleCategories, collectibles, dayPlanner, recurringTasks, dailyEffort, studies, links,
                linkCategories, blurFinances, apuntes,
                exportedAt: new Date().toISOString()
            };
        }

        function applyBackupPayload(data) {
            if (!data || typeof data !== 'object') return;
            if (data.entries) entries = data.entries;
            if (data.categories) categories = data.categories;
            if (data.userName) userName = data.userName;
            if (data.notes) notes = data.notes;
            if (data.prompts) prompts = data.prompts;
            if (data.investmentData) { investmentData = data.investmentData; migrateInvestmentData(); }
            if (data.inbox) inbox = data.inbox;
            if (data.registroConector) registroConector = data.registroConector;
            if (data.financeIncome) financeIncome = data.financeIncome;
            if (data.financeProfile) financeProfile = data.financeProfile;
            if (data.financePro) financePro = data.financePro;
            if (data.plannedTrips) plannedTrips = data.plannedTrips;
            if (data.weeklyTasks) weeklyTasks = Array.isArray(data.weeklyTasks) ? data.weeklyTasks : [];
            if (data.cultureLists) cultureLists = Array.isArray(data.cultureLists) ? data.cultureLists : [];
            if (data.habits) habits = Array.isArray(data.habits) ? data.habits : [];
            if (data.collectibleCategories) collectibleCategories = data.collectibleCategories;
            if (data.collectibles) collectibles = data.collectibles;
            if (data.dayPlanner) dayPlanner = migratePlannerData(data.dayPlanner);
            if (data.recurringTasks) recurringTasks = Array.isArray(data.recurringTasks) ? data.recurringTasks : [];
            if (data.dailyEffort) dailyEffort = (typeof data.dailyEffort === 'object') ? data.dailyEffort : {};
            if (data.studies) studies = data.studies;
            if (data.links) links = data.links;
            if (data.linkCategories) linkCategories = data.linkCategories;
            if (typeof data.blurFinances === 'boolean') blurFinances = data.blurFinances;
            if (data.apuntes) { apuntes = data.apuntes; apuntesDirty = true; }
            filteredEntries = [...entries];
            resetDayPlannerIfNeeded();
            (studies.subjects || []).forEach(s => (s.assignments || []).forEach(item => { if (item.date) syncAssignmentPlannerItem(s, item); }));
        }

        function exportData() {
            const data = buildFullBackupPayload();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `bitacora_${new Date().toISOString().slice(0,10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Exportado');
        }

        function importData(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    applyBackupPayload(data);
                    render();
                    updatePageTitle();
                    try {
                        await saveData();
                        showToast('Importado correctamente');
                    } catch (saveErr) {
                        console.error('Error guardando la importación en Supabase:', saveErr);
                        showToast('Importado localmente, pero no se pudo guardar en la nube.', true);
                    }
                } catch (err) {
                    showToast('Error al importar', true);
                }
            };
            reader.readAsText(file);
            event.target.value = '';
        }

