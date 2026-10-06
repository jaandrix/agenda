        // ============================================================
        //  RENDER: ENLACES
        // ============================================================
        const LINK_CATEGORY_COLORS = ['#FFADAD', '#FFD6A5', '#FDFFB6', '#CAFFBF', '#9BF6FF', '#BDB2FF'];

        function renderLinks() {
            const nameDisplay = userName && userName.trim() ? escapeHtml(userName.trim()) : 'tu nombre';
            const hasCategories = linkCategories.length > 0;
            let body;
            if (!links.length) {
                body = '<div class="finance-empty-line" style="margin-top:14px">Aún no has añadido ningún enlace.</div>';
            } else if (!hasCategories) {
                body = `<div class="links-grid">${links.map(l => renderLinkCard(l, null)).join('')}</div>`;
            } else {
                const grouped = {};
                links.forEach(l => {
                    const key = l.categoryId || '__none__';
                    (grouped[key] = grouped[key] || []).push(l);
                });
                const blocks = linkCategories.filter(c => grouped[c.id]).map(c => renderLinkCategoryBlock(c.name, c.color, grouped[c.id]));
                if (grouped.__none__) blocks.push(renderLinkCategoryBlock('Sin categoría', null, grouped.__none__));
                body = blocks.join('');
            }
            return `
            <div class="links-view">
                <div class="studies-actions-row">
                    <div class="studies-actions-stack">
                        <button class="btn-modal-primary studies-inline-add-btn btn-accent-blue" onclick="openAddLink()">+ enlace</button>
                        <button class="btn-modal-primary studies-inline-add-btn" onclick="openAddLinkCategory()">+ categoría</button>
                    </div>
                </div>
                <h3>Accesos directos de <a href="javascript:void(0)" class="bitacora-username-link" onclick="editUserName()">${nameDisplay}</a></h3>
                ${body}
            </div>`;
        }

        function renderLinkCategoryBlock(name, color, items) {
            return `
                <section class="studies-section">
                    <div class="links-category-head">${color ? `<span class="links-category-dot" style="background:${color}"></span>` : ''}${escapeHtml(name)}</div>
                    <div class="links-grid">${items.map(l => renderLinkCard(l, color)).join('')}</div>
                </section>`;
        }

        function renderLinkCard(l, color) {
            return `
                <div class="link-card" style="${color ? `border:3px solid ${color}` : ''}">
                    <div class="link-card-actions">
                        <button class="link-card-icon-btn link-card-delete" title="Eliminar" onclick="deleteLink('${l.id}')">✕</button>
                        <button class="link-card-icon-btn link-card-edit" title="Editar" onclick="openEditLink('${l.id}')">✎</button>
                    </div>
                    <div class="link-card-title">${escapeHtml(l.title)}</div>
                    <a href="javascript:void(0)" class="link-card-url" data-ext-url="${escapeHtml(l.url)}" onclick="openLinkPopup(event,this)">enlace</a>
                </div>`;
        }

        function openLinkPopup(event, el) {
            event.preventDefault();
            event.stopPropagation();
            const url = el.dataset.extUrl;
            if (!url) return;
            const w = 1000, h = 520;
            const left = Math.round((screen.width - w) / 2), top = Math.round((screen.height - h) / 2);
            window.open(url, '_blank', `noopener,width=${w},height=${h},left=${left},top=${top}`);
        }

        function openAddLink() {
            showModal(`
                <div class="modal-title">+ Enlace</div>
                <div class="modal-label">Título</div>
                <input id="link-title" class="modal-input" placeholder="Ej: Campus virtual">
                <div class="modal-label">Enlace (URL)</div>
                <input id="link-url" class="modal-input" placeholder="https://...">
                <div class="modal-label">Categoría</div>
                <select id="link-category" class="modal-input">
                    <option value="">Sin categoría</option>
                    ${linkCategories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
                </select>
                <button class="btn-modal-primary" onclick="saveNewLink()">Añadir enlace</button>
            `);
        }

        async function saveNewLink() {
            const title = document.getElementById('link-title')?.value.trim();
            let url = document.getElementById('link-url')?.value.trim();
            const categoryId = document.getElementById('link-category')?.value || null;
            if (!title || !url) { showToast('Indica un título y un enlace', true); return; }
            if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
            links.unshift({ id: 'link_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), title, url, categoryId, createdAt: new Date().toISOString() });
            closeModal();
            render();
            try { await saveData(); showToast('Enlace añadido'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteLink(id) {
            links = links.filter(l => l.id !== id);
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openEditLink(id) {
            const l = links.find(x => x.id === id);
            if (!l) return;
            showModal(`
                <div class="modal-title">Editar enlace</div>
                <div class="modal-label">Título</div>
                <input id="link-title" class="modal-input" value="${escapeHtml(l.title)}">
                <div class="modal-label">Enlace (URL)</div>
                <input id="link-url" class="modal-input" value="${escapeHtml(l.url)}">
                <div class="modal-label">Categoría</div>
                <select id="link-category" class="modal-input">
                    <option value="">Sin categoría</option>
                    ${linkCategories.map(c => `<option value="${c.id}" ${c.id === l.categoryId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                </select>
                <button class="btn-modal-primary" onclick="saveEditLink('${id}')">Guardar cambios</button>
            `);
        }

        async function saveEditLink(id) {
            const l = links.find(x => x.id === id);
            if (!l) return;
            const title = document.getElementById('link-title')?.value.trim();
            let url = document.getElementById('link-url')?.value.trim();
            const categoryId = document.getElementById('link-category')?.value || null;
            if (!title || !url) { showToast('Indica un título y un enlace', true); return; }
            if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
            l.title = title; l.url = url; l.categoryId = categoryId;
            closeModal();
            render();
            try { await saveData(); showToast('Enlace actualizado'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openAddLinkCategory() {
            showModal(`
                <div class="modal-title">+ Categoría</div>
                <div class="modal-label">Nombre</div>
                <input id="link-cat-name" class="modal-input" placeholder="Ej: Universidad">
                <div class="modal-label">Color</div>
                <div class="link-color-picker">
                    ${LINK_CATEGORY_COLORS.map((c, i) => `<button type="button" class="link-color-swatch ${i === 0 ? 'selected' : ''}" style="background:${c}" data-color="${c}" onclick="selectLinkColor(this)"></button>`).join('')}
                </div>
                <input type="hidden" id="link-cat-color" value="${LINK_CATEGORY_COLORS[0]}">
                <button class="btn-modal-primary" onclick="saveNewLinkCategory()">Crear categoría</button>
            `);
        }

        function selectLinkColor(btn) {
            btn.parentElement.querySelectorAll('.link-color-swatch').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            document.getElementById('link-cat-color').value = btn.dataset.color;
        }

        async function saveNewLinkCategory() {
            const name = document.getElementById('link-cat-name')?.value.trim();
            const color = document.getElementById('link-cat-color')?.value || LINK_CATEGORY_COLORS[0];
            if (!name) { showToast('Indica un nombre para la categoría', true); return; }
            linkCategories.push({ id: 'lcat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name, color });
            closeModal();
            render();
            try { await saveData(); showToast('Categoría creada'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // Nota final ponderada: si algún examen/trabajo tiene peso indicado,
        // se usa media ponderada solo con los que tienen nota Y peso; si no
        // hay ningún peso indicado, se cae a la media simple de las notas
        // que haya (compatibilidad con asignaturas ya creadas sin peso).
        function subjectFinalGrade(s) {
            const items = [...(s.exams || []), ...(s.assignments || [])];
            const graded = items.filter(x => x.grade !== '' && x.grade !== null && x.grade !== undefined && !isNaN(Number(x.grade)));
            if (!graded.length) return null;
            const weighted = graded.filter(x => x.weight !== '' && x.weight !== null && x.weight !== undefined && !isNaN(Number(x.weight)) && Number(x.weight) > 0);
            if (weighted.length) {
                const sumW = weighted.reduce((sum, x) => sum + Number(x.weight), 0);
                return sumW > 0 ? weighted.reduce((sum, x) => sum + Number(x.grade) * Number(x.weight), 0) / sumW : null;
            }
            return graded.reduce((sum, x) => sum + Number(x.grade), 0) / graded.length;
        }

        // Una línea por asignatura, por orden de creación — nombre en
        // negrita, profesor en gris debajo ("añadir nombre." si no se ha
        // indicado todavía, pulsable aparte sin abrir el detalle). El
        // desglose de trabajos/exámenes vive solo en el popup de detalle.
        function renderSubjectRow(s, index, total) {
            const hasProfessor = !!(s.professor && s.professor.trim());
            const lastRowStart = total - (total % 2 === 0 ? 2 : 1);
            const isLastRow = index >= lastRowStart;
            return `
                <div class="studies-subject-row ${isLastRow ? 'studies-subject-row-lastrow' : ''}" onclick="openSubjectDetail('${s.id}')">
                    <div class="studies-subject-index">${String(index + 1).padStart(2, '0')}</div>
                    <div class="studies-subject-row-body">
                        <div class="studies-subject-row-name">${escapeHtml(s.name)}</div>
                        <div class="studies-subject-row-prof ${hasProfessor ? '' : 'studies-subject-row-prof-empty'}" onclick="event.stopPropagation();editSubjectProfessor('${s.id}')">${hasProfessor ? escapeHtml(s.professor) : 'añadir nombre.'}</div>
                    </div>
                </div>`;
        }

        function editSubjectProfessor(id) {
            const s = findSubject(id);
            if (!s) return;
            showModal(`
                <div class="modal-title">Profesor — ${escapeHtml(s.name)}</div>
                <input id="subject-professor-input" class="modal-input" placeholder="Nombre del profesor" value="${escapeHtml(s.professor || '')}">
                <button class="btn-modal-primary" onclick="saveSubjectProfessor('${id}')">Guardar</button>
            `);
            setTimeout(() => document.getElementById('subject-professor-input')?.focus(), 50);
        }

        async function saveSubjectProfessor(id) {
            const s = findSubject(id);
            if (!s) return;
            const val = document.getElementById('subject-professor-input')?.value.trim();
            s.professor = val || null;
            closeModal();
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openAddSubject() {
            showModal(`
                <div class="modal-title">+ Asignatura</div>
                <div class="modal-label">Nombre</div>
                <input id="subject-name" class="modal-input" placeholder="Ej: Cálculo I">
                <div class="modal-label">Color</div>
                <input id="subject-color" class="modal-input" type="color" value="#5b8def" style="height:40px;padding:4px">
                <button class="btn-modal-primary" onclick="saveNewSubject()">Añadir asignatura</button>
            `);
            setTimeout(() => document.getElementById('subject-name')?.focus(), 50);
        }

        async function saveNewSubject() {
            const name = document.getElementById('subject-name')?.value.trim();
            if (!name) { showToast('Indica un nombre para la asignatura', true); return; }
            const color = document.getElementById('subject-color')?.value || '#5b8def';
            studies.subjects.push({ id: 'subj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name, color, creditos: null, exams: [], assignments: [] });
            closeModal();
            render();
            try { await saveData(); showToast('Asignatura añadida'); }
            catch (e) { console.error('Error guardando la asignatura en Supabase:', e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteSubject(id) {
            if (!confirm('¿Eliminar esta asignatura y todos sus exámenes/trabajos?')) return;
            const s = findSubject(id);
            if (s) [...(s.exams || []), ...(s.assignments || [])].forEach(item => removeLinkedExamEvent(item.id));
            if (s) (s.assignments || []).forEach(item => removeLinkedPlannerItem(item.id));
            studies.subjects = studies.subjects.filter(s => s.id !== id);
            closeModal();
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openSubjectDetail(id) {
            const s = findSubject(id);
            if (!s) return;
            showModal(renderSubjectDetailModal(s));
            loadEntryDocs('studies', s.id);
        }

        const STUDIES_ICON_EXAM = '<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M9 9h6M9 13h6M9 17h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
        const STUDIES_ICON_WORK = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 20l1-5 11-11 4 4-11 11-5 1z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><path d="M14 5l4 4" stroke="currentColor" stroke-width="1.8"/></svg>';

        function renderSubjectDetailModal(s) {
            const finalGrade = subjectFinalGrade(s);
            const hasProfessor = !!(s.professor && s.professor.trim());
            return `
                <div class="subject-detail-modal">
                    <div class="subject-detail-head">
                        <div>
                            <div class="modal-title" style="margin-bottom:0">${escapeHtml(s.name)}</div>
                            <div class="subject-detail-prof ${hasProfessor ? '' : 'subject-detail-prof-empty'}" onclick="editSubjectProfessor('${s.id}')">${hasProfessor ? escapeHtml(s.professor) : 'añadir nombre.'}</div>
                        </div>
                        <div class="subject-detail-grade" id="subject-detail-grade-wrap" style="${finalGrade === null ? 'display:none' : ''}">
                            <span class="nota-final ${finalGrade !== null ? gradeTierClass(finalGrade) : ''}">${finalGrade !== null ? finalGrade.toFixed(2) : ''}</span>
                            <div class="subject-detail-grade-label">Nota final</div>
                        </div>
                    </div>
                    <div class="studies-weight-note" id="subject-weight-note">${renderSubjectWeightNote(s)}</div>
                    ${renderSubjectItemsBlock(s, 'exams')}
                    ${renderSubjectItemsBlock(s, 'assignments')}
                    ${renderEntryDocsSection('studies', s.id, 'Documentos (apuntes, resúmenes...)')}
                    <button class="finance-oneoff-btn" style="color:#dc2626;border-color:#dc2626" onclick="deleteSubject('${s.id}')">Eliminar asignatura</button>
                </div>
            `;
        }

        // Cuánto falta/pasó para la fecha de un examen o trabajo — a
        // diferencia de eventCountdownLabel (solo futuro), aquí también
        // hacen falta los ya pasados para poder agruparlos aparte.
        function studiesItemCountdown(dateStr) {
            if (!dateStr) return null;
            const days = Math.round((new Date(dateStr + 'T00:00:00') - new Date(todayISO() + 'T00:00:00')) / 86400000);
            if (days === 0) return { text: 'hoy', due: true, past: false };
            if (days === 1) return { text: 'mañana', due: true, past: false };
            if (days > 1) return { text: `en ${days} días`, due: days <= 7, past: false };
            return { text: `hace ${Math.abs(days)} día${Math.abs(days) === 1 ? '' : 's'}`, due: false, past: true };
        }

        // Suma de los pesos ya repartidos entre exámenes y trabajos de la
        // asignatura (solo cuenta los que tienen peso indicado) — para
        // avisar si no llegan al 100% o si se han pasado.
        function subjectWeightTotal(s) {
            const items = [...(s.exams || []), ...(s.assignments || [])];
            return items.reduce((sum, x) => sum + (x.weight !== '' && x.weight != null && !isNaN(Number(x.weight)) ? Number(x.weight) : 0), 0);
        }

        function renderSubjectWeightNote(s) {
            const total = subjectWeightTotal(s);
            if (!total) return '';
            if (total === 100) return 'Peso repartido: 100%.';
            if (total > 100) return `Peso repartido: ${total}% — te has pasado ${total - 100}%.`;
            return `Peso repartido: ${total}% (quedan ${100 - total}% sin asignar).`;
        }

        function refreshSubjectDetailStats(s) {
            const finalGrade = subjectFinalGrade(s);
            const wrap = document.getElementById('subject-detail-grade-wrap');
            if (wrap) {
                wrap.style.display = finalGrade === null ? 'none' : '';
                wrap.querySelector('.nota-final').textContent = finalGrade !== null ? finalGrade.toFixed(2) : '';
                wrap.querySelector('.nota-final').className = `nota-final ${finalGrade !== null ? gradeTierClass(finalGrade) : ''}`;
            }
            const note = document.getElementById('subject-weight-note');
            if (note) note.textContent = renderSubjectWeightNote(s);
        }

        // Bloque "Exámenes"/"Trabajos" del detalle de asignatura — estética
        // editorial en blanco y negro (regla gruesa + texto pequeño en
        // mayúsculas + título grande), pendientes primero y ya pasados
        // colapsados debajo para no acumular ruido con el tiempo.
        // Recuerda si el usuario colapsó manualmente el desplegable de
        // "pasados" de cada bloque — si no, cada vez que se refresca el
        // bloque (al añadir/editar cualquier examen o trabajo) se volvía
        // a abrir solo, porque el HTML siempre traía el atributo "open".
        let studiesPastGroupOpen = {};
        function renderSubjectItemsBlock(s, listKey) {
            const items = s[listKey] || [];
            const label = listKey === 'exams' ? 'Exámenes' : 'Trabajos';
            const singular = listKey === 'exams' ? 'examen' : 'trabajo';
            const noDate = items.filter(it => !it.date);
            const withDate = items.filter(it => !!it.date);
            const upcoming = withDate.filter(it => it.date >= todayISO()).sort((a, b) => a.date.localeCompare(b.date));
            const past = withDate.filter(it => it.date < todayISO()).sort((a, b) => b.date.localeCompare(a.date));
            const next = upcoming[0];
            const kicker = items.length
                ? `${items.length} ${label.toLowerCase()}${next ? ` · próximo ${studiesItemCountdown(next.date).text}` : ''}`
                : `sin ${label.toLowerCase()} todavía`;
            return `
            <div class="studies-editorial-block" id="studies-block-${listKey}-${s.id}">
                <div class="studies-editorial-rule"></div>
                <div class="studies-editorial-kicker"><span>${escapeHtml(kicker)}</span></div>
                <div class="studies-editorial-heading-row">
                    <div class="studies-editorial-heading">${label}</div>
                    <button class="studies-editorial-add-btn" onclick="addSubjectItem('${s.id}','${listKey}')">+ añadir</button>
                </div>
                ${!items.length ? `<div class="studies-editorial-empty">Todavía no has añadido ningún ${singular}.</div>` : `
                    ${noDate.map(it => renderSubjectItemRow(s.id, listKey, it, s[listKey].indexOf(it))).join('')}
                    ${upcoming.map(it => renderSubjectItemRow(s.id, listKey, it, s[listKey].indexOf(it))).join('')}
                    ${past.length ? `
                    <details class="studies-past-group" ${studiesPastGroupOpen[`${listKey}-${s.id}`] === false ? '' : 'open'} ontoggle="studiesPastGroupOpen['${listKey}-${s.id}']=this.open">
                        <summary class="studies-editorial-group-label">pasados (${past.length})</summary>
                        ${past.map(it => renderSubjectItemRow(s.id, listKey, it, s[listKey].indexOf(it))).join('')}
                    </details>` : ''}
                `}
            </div>`;
        }

        function refreshSubjectItemsBlock(s, listKey) {
            const el = document.getElementById(`studies-block-${listKey}-${s.id}`);
            if (el) el.outerHTML = renderSubjectItemsBlock(s, listKey);
        }

        function renderSubjectItemRow(subjectId, listKey, item, index) {
            const cd = studiesItemCountdown(item.date);
            return `
                <div class="studies-row" data-item-id="${item.id}">
                    <div class="studies-row-head">
                        <input class="studies-row-title-input" value="${escapeHtml(item.title || '')}" placeholder="${listKey === 'exams' ? 'Examen sin título' : 'Trabajo sin título'}" onchange="updateSubjectItem('${subjectId}','${listKey}',${index},'title',this.value)">
                        ${cd ? `<span class="studies-row-countdown ${cd.due ? 'due-soon' : ''} ${cd.past ? 'past' : ''}">${cd.text}</span>` : ''}
                        <button class="studies-row-remove" title="Eliminar" onclick="removeSubjectItem('${subjectId}','${listKey}',${index})">✕</button>
                    </div>
                    <div class="studies-row-fields">
                        <div class="studies-row-field"><label>Fecha</label><input type="date" value="${item.date || ''}" onchange="updateSubjectItem('${subjectId}','${listKey}',${index},'date',this.value)"></div>
                        <div class="studies-row-field grade"><label>Nota</label><input type="number" min="0" max="10" step="0.1" value="${item.grade ?? ''}" placeholder="—" onchange="updateSubjectItem('${subjectId}','${listKey}',${index},'grade',this.value)"></div>
                        <div class="studies-row-field"><label>Peso %</label><input type="number" min="0" max="100" step="1" value="${item.weight ?? ''}" placeholder="—" onchange="updateSubjectItem('${subjectId}','${listKey}',${index},'weight',this.value)"></div>
                    </div>
                </div>`;
        }

        // Añadir/quitar solo refresca el bloque afectado (en vez de
        // reabrir el modal entero, que también volvía a pedir los
        // documentos a Supabase cada vez) — más rápido y sin perder el
        // scroll de lo que ya estabas mirando.
        function addSubjectItem(subjectId, listKey) {
            const s = findSubject(subjectId);
            if (!s) return;
            s[listKey] = s[listKey] || [];
            const newItem = { id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), title: '', date: '', grade: '', weight: '', done: false };
            s[listKey].push(newItem);
            refreshSubjectItemsBlock(s, listKey);
            setTimeout(() => document.querySelector(`[data-item-id="${newItem.id}"] .studies-row-title-input`)?.focus(), 30);
        }

        async function updateSubjectItem(subjectId, listKey, index, field, value) {
            const s = findSubject(subjectId);
            if (!s || !s[listKey] || !s[listKey][index]) return;
            s[listKey][index][field] = value;
            if (field === 'title' || field === 'date') syncExamCalendarEvent(s, listKey, s[listKey][index]);
            if (listKey === 'assignments' && (field === 'title' || field === 'date')) syncAssignmentPlannerItem(s, s[listKey][index]);
            // La fecha cambia el grupo (pendiente/pasado) y el "próximo en..."
            // del bloque; la nota o el peso cambian la nota final y el aviso
            // de reparto — cada uno refresca solo lo que de verdad depende de él.
            if (field === 'date') refreshSubjectItemsBlock(s, listKey);
            if (field === 'grade' || field === 'weight') refreshSubjectDetailStats(s);
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function removeSubjectItem(subjectId, listKey, index) {
            const s = findSubject(subjectId);
            if (!s || !s[listKey]) return;
            const item = s[listKey][index];
            if (item) {
                removeLinkedExamEvent(item.id);
                if (listKey === 'assignments') removeLinkedPlannerItem(item.id);
            }
            s[listKey].splice(index, 1);
            refreshSubjectItemsBlock(s, listKey);
            refreshSubjectDetailStats(s);
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // Sincroniza un examen/trabajo con fecha hacia un evento normal de
        // Bitácora (visible en el calendario y en la alerta diaria), sin
        // necesidad de crearlo a mano dos veces. Se identifica por
        // `linkedItemId` para poder actualizarlo o borrarlo cuando cambie.
        function syncExamCalendarEvent(subject, listKey, item) {
            const existingIdx = entries.findIndex(e => e.linkedItemId === item.id);
            if (!item.date) {
                if (existingIdx !== -1) entries.splice(existingIdx, 1);
                return;
            }
            const label = listKey === 'exams' ? 'Examen' : 'Entrega';
            const title = `${label}: ${item.title || 'Sin título'} (${subject.name})`;
            if (existingIdx !== -1) {
                entries[existingIdx].title = title;
                entries[existingIdx].date = item.date;
                entries[existingIdx].time = item.time || '';
            } else {
                entries.push({
                    id: 'evt_' + item.id, type: 'event', eventType: 'otro', title, date: item.date, time: item.time || '', notes: '',
                    linkedItemId: item.id, linkedSubjectId: subject.id, linkedKind: listKey
                });
            }
        }

        function removeLinkedExamEvent(itemId) {
            const idx = entries.findIndex(e => e.linkedItemId === itemId);
            if (idx !== -1) entries.splice(idx, 1);
        }

        // Los trabajos (no los exámenes) con fecha se reflejan además como
        // una tarea normal en el Planificador, el día de entrega — "trabajo
        // pendiente. <título>" — para no tener que apuntarlos dos veces.
        // Vive dentro de dayPlanner.days[fecha] igual que cualquier tarea
        // manual, así que en cuanto ese día llega se ve en la pestaña "Hoy"
        // (y si se pasa sin marcarla hecha, se arrastra igual que las demás).
        function syncAssignmentPlannerItem(subject, item) {
            resetDayPlannerIfNeeded();
            // El propio trabajo (item.done) es la fuente permanente de si
            // está hecho — NO la tarea del planificador ya existente,
            // porque esa se archiva (se borra) en cuanto pasa su día
            // estando hecha, así que en la siguiente sincronización no
            // quedaba ni rastro y se recreaba pendiente. Con esto, aunque
            // se haya archivado, se recrea ya marcada si el trabajo lo está.
            const existing = findLinkedPlannerItem(item.id);
            removeLinkedPlannerItem(item.id);
            if (!item.date || item.fueraDelPlanificador) return;
            if (!Array.isArray(dayPlanner.days[item.date])) dayPlanner.days[item.date] = [];
            dayPlanner.days[item.date].push({
                id: 'planner_assign_' + item.id,
                time: existing?.time || '23:59',
                title: `trabajo pendiente. ${item.title || 'Sin título'}`,
                notes: subject?.name ? `Asignatura: ${subject.name}` : '',
                done: !!item.done,
                arrastrado: false,
                linkedAssignmentId: item.id
            });
        }

        function findAssignmentById(itemId) {
            for (const s of studies.subjects) {
                const found = (s.assignments || []).find(a => a.id === itemId);
                if (found) return found;
            }
            return null;
        }

        function findLinkedPlannerItem(itemId) {
            if (!dayPlanner || !dayPlanner.days) return null;
            const plannerId = 'planner_assign_' + itemId;
            for (const k of Object.keys(dayPlanner.days)) {
                const found = (dayPlanner.days[k] || []).find(p => p.id === plannerId);
                if (found) return found;
            }
            return null;
        }

        function removeLinkedPlannerItem(itemId) {
            if (!dayPlanner || !dayPlanner.days) return;
            const plannerId = 'planner_assign_' + itemId;
            Object.keys(dayPlanner.days).forEach(k => {
                dayPlanner.days[k] = (dayPlanner.days[k] || []).filter(p => p.id !== plannerId);
            });
        }

        // Resalta el bloque de "ahora mismo": el de hora de inicio más
        // reciente que ya haya pasado, dentro del día de hoy. Al no haber
        // hora de fin, se asume que sigue siendo la clase actual hasta que
        // empiece la siguiente (o hasta medianoche si es la última).
        const STUDIES_DAY_KEYS_BY_JS_DAY = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
        function todayScheduleKey() { return STUDIES_DAY_KEYS_BY_JS_DAY[new Date().getDay()]; }

        function currentScheduleBlockIndex(dayKey) {
            if (dayKey !== todayScheduleKey()) return -1;
            const blocks = studies.schedule[dayKey] || [];
            const nowHM = new Date().toTimeString().slice(0, 5);
            let idx = -1;
            blocks.forEach((b, i) => { if (b.time && b.time <= nowHM) idx = i; });
            return idx;
        }

        function refreshScheduleHighlight() {
            if (currentView !== 'studies') return;
            const wrap = document.getElementById('studies-schedule-grid');
            if (wrap) wrap.outerHTML = renderScheduleGrid();
        }
        if (!window._scheduleHighlightTimer) window._scheduleHighlightTimer = setInterval(refreshScheduleHighlight, 60000);

        // Cuadrícula estilo Google Calendar, en franjas de 30 minutos: solo
        // se pintan las franjas en las que hay alguna clase esa semana (en
        // cualquier día) — así no queda un hueco enorme en blanco entre,
        // por ejemplo, las 8:00 y las 15:00 si no hay nada a esas horas.
        // Se usan franjas de 30 min (no de 1 hora completa) porque es muy
        // habitual tener dos clases seguidas dentro de la misma hora (p.ej.
        // 15:00 y 15:55): con franjas de 1h esas dos clases tenían que
        // apretarse o desbordar su celda; con 30 min casi siempre caen cada
        // una en su propia franja. Si no hay ninguna clase todavía, se cae
        // a un rango por defecto (8:00-21:30) para poder añadir la primera.
        const SCHEDULE_ROW_PX = 40;
        const SCHEDULE_ADD_ROW_PX = 24;
        function scheduleTimeToBucket(time) {
            const h = parseInt(String(time || '0').slice(0, 2), 10) || 0;
            const m = parseInt(String(time || '0').slice(3, 5), 10) || 0;
            return h * 2 + (m >= 30 ? 1 : 0);
        }
        function scheduleBucketLabel(bucket) {
            return `${String(Math.floor(bucket / 2)).padStart(2, '0')}:${bucket % 2 === 0 ? '00' : '30'}`;
        }
        function scheduleActiveBuckets() {
            const set = new Set();
            STUDIES_SCHEDULE_DISPLAY_DAYS.forEach(d => {
                (studies.schedule[d.key] || []).forEach(b => { if (b.time) set.add(scheduleTimeToBucket(b.time)); });
            });
            if (!set.size) { for (let bk = 16; bk <= 43; bk++) set.add(bk); }
            return [...set].sort((a, b) => a - b);
        }

        function renderScheduleGrid() {
            const buckets = scheduleActiveBuckets();
            const bucketRow = new Map(buckets.map((bk, i) => [bk, i]));
            const contentHeight = buckets.length * SCHEDULE_ROW_PX;
            const totalHeight = contentHeight + SCHEDULE_ADD_ROW_PX;

            return `
                <div class="studies-schedule-grid" id="studies-schedule-grid">
                    <div class="studies-schedule-headrow">
                        <div class="studies-schedule-head-gutter"></div>
                        ${STUDIES_SCHEDULE_DISPLAY_DAYS.map(d => `<div class="studies-day-head">${escapeHtml(d.label)}</div>`).join('')}
                    </div>
                    <div class="studies-schedule-body" style="height:${totalHeight}px">
                        <div class="studies-schedule-hours">
                            ${buckets.map(bk => `<div class="studies-hour-label" style="height:${SCHEDULE_ROW_PX}px">${scheduleBucketLabel(bk)}</div>`).join('')}
                        </div>
                        <div class="studies-schedule-days">
                            ${buckets.map((bk, i) => `<div class="studies-hour-line" style="top:${i * SCHEDULE_ROW_PX}px"></div>`).join('')}
                            ${STUDIES_SCHEDULE_DISPLAY_DAYS.map(d => renderScheduleDayColumn(d, bucketRow, contentHeight)).join('')}
                        </div>
                    </div>
                </div>`;
        }

        function renderScheduleDayColumn(d, bucketRow, contentHeight) {
            const blocks = studies.schedule[d.key] || [];
            const nowIdx = currentScheduleBlockIndex(d.key);
            // Cada bloque ocupa directamente la franja entera de sus 30
            // minutos. Si, aun así, dos clases cayeran en la misma franja
            // (raro), se apilan dentro de esa misma celda en vez de
            // solaparse.
            const byBucket = new Map();
            blocks.forEach((b, i) => {
                const bk = scheduleTimeToBucket(b.time);
                if (!byBucket.has(bk)) byBucket.set(bk, []);
                byBucket.get(bk).push({ b, i });
            });
            let cellsHtml = '';
            byBucket.forEach((items, bk) => {
                const rowIdx = bucketRow.has(bk) ? bucketRow.get(bk) : 0;
                const top = rowIdx * SCHEDULE_ROW_PX;
                cellsHtml += `<div class="studies-hour-cell" style="top:${top}px;height:${SCHEDULE_ROW_PX}px">`;
                cellsHtml += items.map(({ b, i }) => `
                    <div class="studies-block ${i === nowIdx ? 'studies-block-now' : ''}">
                        <span>${escapeHtml(b.time || '')} ${escapeHtml(b.subject || '')}</span>
                        <button title="Eliminar" onclick="removeScheduleBlock('${d.key}',${i})">✕</button>
                    </div>`).join('');
                cellsHtml += `</div>`;
            });
            return `
                <div class="studies-day-col">
                    ${cellsHtml}
                    <button class="studies-day-add" style="top:${contentHeight}px" title="Añadir clase" onclick="openAddScheduleBlock('${d.key}')">+</button>
                </div>`;
        }

        function openAddScheduleBlock(dayKey) {
            showModal(`
                <div class="modal-title">Añadir clase</div>
                <div class="modal-label">Hora</div>
                <input id="schedule-time" class="modal-input" type="time">
                <div class="modal-label">Asignatura / texto</div>
                <input id="schedule-subject" class="modal-input" placeholder="Ej: Cálculo I - Aula 3">
                <button class="btn-modal-primary" onclick="saveScheduleBlock('${dayKey}')">Añadir</button>
            `);
        }

        async function saveScheduleBlock(dayKey) {
            const time = document.getElementById('schedule-time')?.value || '';
            const subject = document.getElementById('schedule-subject')?.value.trim();
            if (!subject) { showToast('Indica el nombre de la clase', true); return; }
            studies.schedule[dayKey] = studies.schedule[dayKey] || [];
            studies.schedule[dayKey].push({ time, subject });
            studies.schedule[dayKey].sort((a, b) => String(a.time).localeCompare(String(b.time)));
            closeModal();
            render();
            try { await saveData(); showToast('Clase añadida'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function removeScheduleBlock(dayKey, index) {
            if (!studies.schedule[dayKey]) return;
            studies.schedule[dayKey].splice(index, 1);
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // ============================================================
        //  RENDER: PROJECTS
        // ============================================================
        // Los proyectos antiguos usaban "En desarrollo" (derivado automáticamente
        // de la fecha fin). Esto normaliza cualquier valor histórico a las 3
        // columnas del tablero, sin necesidad de migrar datos.
        function projectStatusBucket(status) {
            if (status === 'Completado') return 'Completado';
            if (status === 'En progreso' || status === 'En desarrollo') return 'En progreso';
            return 'Pendiente';
        }

        const PROJECT_PRIORITY_COLOR = { alta: '#f87171', media: '#eab308', baja: '#4ade80' };
        const PROJECT_PRIORITY_LABEL = { alta: 'Alta', media: 'Media', baja: 'Baja' };
        // Icono genérico (bandera de hito) — misma familia TARJETA BITACORA,
        // reutilizado para todas las filas de Proyectos.
        const PROJECT_ICON_FLAG = '<svg viewBox="0 0 100 100" fill="currentColor"><rect x="16" y="6" width="10" height="88" rx="3"/><path d="M26 10h58l-14 20 14 20H26z"/></svg>';

        function projectTaskProgress(p) {
            const total = p.tasks?.length || 0;
            const done = p.tasks?.filter(t => t.done).length || 0;
            return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
        }

        let projectViewMode = 'list';
        function setProjectViewMode(mode) { projectViewMode = mode; render(); }

        function renderProjects() {
            const projects = entries.filter(e => e.type === 'project');
            if (!projects.length) {
                return `<div class="empty-state"><div class="empty-title">Sin proyectos</div><div class="empty-sub"><span class="solo-escritorio">Pulsa el botón + y selecciona "Proyecto"</span><span class="solo-movil">Añade el primero con el botón de arriba.</span></div></div>`;
            }

            const toggle = `
                <div class="culture-tabs" style="margin-bottom:18px">
                    <button class="culture-tab ${projectViewMode === 'list' ? 'active' : ''}" onclick="setProjectViewMode('list')">Lista</button>
                    <button class="culture-tab ${projectViewMode === 'kanban' ? 'active' : ''}" onclick="setProjectViewMode('kanban')">Tablero</button>
                </div>`;

            return `<div style="max-width:980px">${toggle}<div class="cal-view-anim">${projectViewMode === 'kanban' ? renderProjectsKanban(projects) : renderProjectsList(projects)}</div></div>`;
        }

        // Lista de proyectos con la misma línea de diseño que Asignaturas/
        // Documentos/Viajes: fila con la fecha a la izquierda (fin
        // previsto), icono, título en negrita + categoría, y estado a la
        // derecha. La descripción y las features detalladas quedan solo en
        // el popup de detalle (openEntryDetail).
        function renderProjectsList(projects) {
            const today = todayISO();
            const sorted = [...projects].sort((a, b) => {
                const aActive = projectStatusBucket(a.status) !== 'Completado', bActive = projectStatusBucket(b.status) !== 'Completado';
                if (aActive !== bActive) return aActive ? -1 : 1;
                return (b.startDate || '').localeCompare(a.startDate || '');
            });

            return `<div class="line-row-list">${sorted.map((p) => {
                const bucket = projectStatusBucket(p.status);
                const statusClass = bucket === 'Completado' ? 'badge-done' : bucket === 'En progreso' ? 'badge-progress' : 'badge-pending';
                const { total, done, pct } = projectTaskProgress(p);
                const overdue = p.endDate && p.endDate < today && bucket !== 'Completado';
                const priority = p.priority || 'media';
                const dateObj = p.endDate ? new Date(p.endDate + 'T00:00:00') : null;

                return `
                    <div class="line-row" data-open-entry="${p.id}">
                        <div class="line-row-date">
                            <div class="line-row-date-day ${overdue ? 'line-row-date-overdue' : ''}">${dateObj ? String(dateObj.getDate()).padStart(2, '0') : '–'}</div>
                            ${dateObj ? `<div class="line-row-date-month">${dateObj.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}</div>` : ''}
                        </div>
                        <div class="line-row-icon">${PROJECT_ICON_FLAG}</div>
                        <div class="line-row-body">
                            <div class="line-row-title"><span class="project-priority-dot" style="background:${PROJECT_PRIORITY_COLOR[priority]}" title="Prioridad ${PROJECT_PRIORITY_LABEL[priority]}"></span><span class="line-row-title-text">${escapeHtml(p.title)}</span></div>
                            <div class="line-row-meta">${escapeHtml(p.projectCategory || 'Sin categoría')}${total > 0 ? ` · ${done}/${total} hitos · ${pct}%` : ''}</div>
                        </div>
                        <div class="line-row-side"><span class="badge ${statusClass}">${bucket}</span></div>
                    </div>`;
            }).join('')}</div>`;
        }

        function renderProjectsKanban(projects) {
            const today = todayISO();
            const columns = ['Pendiente', 'En progreso', 'Completado'];
            return `<div class="kanban-board" id="projects-kanban-board">
                ${columns.map(col => {
                    const items = projects.filter(p => projectStatusBucket(p.status) === col);
                    return `
                    <div class="kanban-column" ondragover="event.preventDefault()" ondrop="projectColumnDrop(event,'${col}')">
                        <div class="kanban-column-head">${col} <span>${items.length}</span></div>
                        ${items.map(p => {
                            const cat = categories.find(c => c.id === p.categoryId);
                            const color = cat?.color || 'var(--text-secondary)';
                            const { total, done, pct } = projectTaskProgress(p);
                            const overdue = p.endDate && p.endDate < today && col !== 'Completado';
                            const priority = p.priority || 'media';
                            return `
                            <div class="kanban-card" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${p.id}')" data-open-entry="${p.id}" style="border-left:4px solid ${color}">
                                <div class="kanban-card-title">${escapeHtml(p.title)}</div>
                                ${total > 0 ? `<div class="progress-bar-bg" style="margin-top:8px"><div class="progress-bar-fill" style="width:${pct}%;background:#2563eb"></div></div>` : ''}
                                <div class="kanban-card-foot">
                                    <span class="project-priority-dot" style="background:${PROJECT_PRIORITY_COLOR[priority]}" title="Prioridad ${PROJECT_PRIORITY_LABEL[priority]}"></span>
                                    ${p.endDate ? `<span class="${overdue ? 'project-overdue' : ''}">${escapeHtml(p.endDate)}</span>` : '<span></span>'}
                                </div>
                            </div>`;
                        }).join('') || '<div class="kanban-empty">Arrastra aquí un proyecto</div>'}
                    </div>`;
                }).join('')}
            </div>`;
        }

        async function projectColumnDrop(event, status) {
            event.preventDefault();
            const id = event.dataTransfer.getData('text/plain');
            const p = entries.find(e => e.id === id && e.type === 'project');
            if (!p || projectStatusBucket(p.status) === status) return;
            p.status = status;
            // Solo se repinta el tablero (no toda la pantalla) para que
            // soltar una tarjeta se sienta instantáneo.
            const board = document.getElementById('projects-kanban-board');
            if (board) board.outerHTML = renderProjectsKanban(entries.filter(e => e.type === 'project'));
            else render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

