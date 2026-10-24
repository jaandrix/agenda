        // ============================================================
        //  RENDER: ENLACES
        // ============================================================
        const LINK_CATEGORY_COLORS = ['#FFADAD', '#FFD6A5', '#FDFFB6', '#CAFFBF', '#9BF6FF', '#BDB2FF'];

        // Enlaces (rediseño 24-10): buscador, vista en rejilla o lista (se recuerda en este dispositivo), filtro por
        // categoría, favoritos arriba y un menú «···» por enlace y por categoría. El buscador y el filtro esconden
        // tarjetas sin repintar la vista, así no se pierde lo escrito.
        let enlacesFiltroCat = '';
        function enlacesVista() { try { return localStorage.getItem('bitacora-enlaces-vista') === 'lista' ? 'lista' : 'rejilla'; } catch (e) { return 'rejilla'; } }
        function enlaceDominio(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return String(url || '').replace(/^https?:\/\//, '').split('/')[0]; } }
        function enlaceIcono(l) {
            const d = enlaceDominio(l.url);
            const letra = escapeHtml((l.title || d || '?').trim().charAt(0).toUpperCase());
            // El icono de la web lo da DuckDuckGo (solo recibe el dominio); si no hay, la inicial.
            return `<span class="enlace-icono" aria-hidden="true"><span>${letra}</span>${d ? `<img src="https://icons.duckduckgo.com/ip3/${encodeURIComponent(d)}.ico" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>`;
        }

        function renderLinks() {
            const vista = enlacesVista();
            const favoritos = links.filter(l => l.favorito).slice(0, 5);
            const grupos = {};
            links.forEach(l => { const k = linkCategories.some(c => c.id === l.categoryId) ? l.categoryId : '__none__'; (grupos[k] = grupos[k] || []).push(l); });
            const bloques = [...linkCategories.map(c => ({ c, items: grupos[c.id] || [] })), ...(grupos.__none__ ? [{ c: null, items: grupos.__none__ }] : [])]
                .filter(b => b.c || b.items.length);
            const cuerpo = !links.length && !linkCategories.length ? `
                <div class="vista-vacio"><b>todavía no hay enlaces.</b>Guarda aquí las webs que usas a menudo: el campus, el banco, tu proyecto...<br><button class="vista-btn principal" onclick="openAddLink()"><i class="ico ico-mas" aria-hidden="true"></i>nuevo enlace.</button></div>`
                : bloques.map(b => renderLinkCategoryBlock(b.c, b.items, vista)).join('');
            return `
            <div class="links-view enlaces-${vista}">
                <div class="vista-cab">
                    <div><div class="vista-cab-titulo">enlaces.</div><div class="vista-cab-sub">Tus accesos y recursos, organizados.</div></div>
                    <div class="vista-cab-acciones">
                        <label class="vista-buscar"><i class="ico ico-buscar" aria-hidden="true"></i><input id="enlaces-buscar" class="modal-input" type="search" placeholder="buscar enlace..." aria-label="Buscar enlace" oninput="filtrarEnlaces()"></label>
                        <div class="vista-seg" role="tablist" aria-label="Vista">
                            <button role="tab" aria-selected="${vista === 'rejilla'}" aria-label="En rejilla" onclick="cambiarVistaEnlaces('rejilla')"><i class="ico ico-rejilla" aria-hidden="true"></i></button>
                            <button role="tab" aria-selected="${vista === 'lista'}" aria-label="En lista" onclick="cambiarVistaEnlaces('lista')"><i class="ico ico-lista" aria-hidden="true"></i></button>
                        </div>
                        ${linkCategories.length ? `<select id="enlaces-cat" class="modal-input enlaces-cat" style="width:auto;min-width:190px;margin:0" aria-label="Categoría" onchange="enlacesFiltroCat=this.value;filtrarEnlaces()"><option value="">todas las categorías.</option>${linkCategories.map(c => `<option value="${c.id}" ${c.id === enlacesFiltroCat ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}${grupos.__none__ ? `<option value="__none__" ${enlacesFiltroCat === '__none__' ? 'selected' : ''}>sin categoría.</option>` : ''}</select>` : ''}
                        <button class="vista-btn" onclick="openAddLinkCategory()">+ categoría.</button>
                        <button class="vista-btn principal" onclick="openAddLink()"><i class="ico ico-mas" aria-hidden="true"></i>nuevo enlace.</button>
                    </div>
                </div>
                <div id="enlaces-contador" class="enlaces-contador" aria-live="polite"></div>
                ${favoritos.length ? `
                <section class="enlaces-favoritos" data-bloque-fav>
                    <div class="enlaces-bloque-cab"><span class="enlaces-bloque-titulo">favoritos.</span><span class="enlaces-bloque-sub">siempre a mano.</span></div>
                    <div class="enlaces-fav-fila">${favoritos.map(l => renderLinkCard(l, 'fav')).join('')}</div>
                </section>` : ''}
                ${cuerpo}
                <div id="enlaces-sin-resultados" class="vista-vacio" hidden><b>nada con esa búsqueda.</b><button class="vista-btn" onclick="limpiarFiltrosEnlaces()">limpiar filtros.</button></div>
            </div>`;
        }

        function renderLinkCategoryBlock(c, items, vista) {
            const id = c ? c.id : '__none__';
            return `
                <section class="enlaces-categoria" data-cat="${id}">
                    <div class="enlaces-bloque-cab">
                        <span class="enlaces-cat-punto" style="${c?.color ? `background:${escapeHtml(c.color)}` : ''}" aria-hidden="true"></span>
                        <span class="enlaces-bloque-titulo">${escapeHtml(c ? c.name : 'sin categoría')}.</span>
                        <span class="vista-contador">${items.length}</span>
                        ${c ? `<button class="vista-icono-btn enlaces-cat-menu" aria-label="Opciones de ${escapeHtml(c.name)}" aria-haspopup="menu" onclick="menuCategoriaEnlace(this,'${jsAttr(c.id)}')"><i class="ico ico-puntos" aria-hidden="true"></i></button>` : ''}
                    </div>
                    <div class="enlaces-grid">
                        ${items.map(l => renderLinkCard(l)).join('')}
                        <button class="enlace-anadir" onclick="openAddLink('${c ? jsAttr(c.id) : ''}')"><i class="ico ico-mas" aria-hidden="true"></i><span>añadir un enlace.<small>${escapeHtml(c ? c.name : 'sin categoría')}</small></span></button>
                    </div>
                </section>`;
        }

        function renderLinkCard(l, modo) {
            const d = enlaceDominio(l.url);
            const texto = [l.title, d, l.descripcion, linkCategories.find(c => c.id === l.categoryId)?.name].filter(Boolean).join(' ');
            return `
                <div class="enlace-card" data-enlace="${escapeHtml(l.id)}" data-texto="${escapeHtml(texto)}" data-cat="${linkCategories.some(c => c.id === l.categoryId) ? escapeHtml(l.categoryId) : '__none__'}" ${modo === 'fav' ? 'data-fav' : ''}>
                    <a class="enlace-abrir" href="${escapeHtml(/^https?:\/\//i.test(l.url) ? l.url : 'https://' + l.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(l.title)} (se abre en otra pestaña)">
                        ${enlaceIcono(l)}
                        <span class="enlace-cuerpo"><b>${escapeHtml(l.title)}</b><small>${escapeHtml(d)}</small>${l.descripcion && modo !== 'fav' ? `<span class="enlace-desc">${escapeHtml(l.descripcion)}</span>` : ''}</span>
                    </a>
                    <div class="enlace-botones">
                        <button class="vista-icono-btn ${l.favorito ? 'on' : ''}" aria-pressed="${!!l.favorito}" aria-label="${l.favorito ? 'Quitar de favoritos' : 'Marcar como favorito'}" onclick="alternarFavoritoEnlace('${jsAttr(l.id)}')"><i class="ico ico-estrella" aria-hidden="true"></i></button>
                        ${modo === 'fav' ? '' : `<button class="vista-icono-btn" aria-label="Opciones de ${escapeHtml(l.title)}" aria-haspopup="menu" onclick="menuEnlace(this,'${jsAttr(l.id)}')"><i class="ico ico-puntos" aria-hidden="true"></i></button>`}
                    </div>
                </div>`;
        }

        function cambiarVistaEnlaces(v) {
            try { localStorage.setItem('bitacora-enlaces-vista', v); } catch (e) { /* sin almacenamiento */ }
            const q = document.getElementById('enlaces-buscar')?.value || '';
            render();
            const campo = document.getElementById('enlaces-buscar');
            if (campo && q) { campo.value = q; filtrarEnlaces(); }
        }

        function filtrarEnlaces() {
            const norm = t => stripAccents(String(t || '').toLowerCase());
            const q = norm(document.getElementById('enlaces-buscar')?.value).trim();
            const cat = enlacesFiltroCat;
            let n = 0;
            document.querySelectorAll('.links-view .enlace-card:not([data-fav])').forEach(el => {
                const ok = (!q || norm(el.dataset.texto).includes(q)) && (!cat || el.dataset.cat === cat);
                el.hidden = !ok;
                if (ok) n++;
            });
            document.querySelectorAll('.links-view .enlaces-categoria').forEach(sec => {
                const visibles = sec.querySelectorAll('.enlace-card:not([hidden])').length;
                sec.hidden = (q || cat) ? !visibles : false;
                sec.querySelectorAll('.enlace-anadir').forEach(b => { b.hidden = !!q; });
            });
            const fav = document.querySelector('.links-view [data-bloque-fav]');
            if (fav) fav.hidden = !!(q || cat);
            const filtrando = !!(q || cat);
            const contador = document.getElementById('enlaces-contador');
            if (contador) contador.textContent = filtrando && n ? `${n} ${n === 1 ? 'enlace' : 'enlaces'}.` : '';
            const nada = document.getElementById('enlaces-sin-resultados');
            if (nada) nada.hidden = !filtrando || !!n;
        }

        function limpiarFiltrosEnlaces() {
            enlacesFiltroCat = '';
            const b = document.getElementById('enlaces-buscar'); if (b) b.value = '';
            const c = document.getElementById('enlaces-cat'); if (c) c.value = '';
            filtrarEnlaces();
        }

        async function alternarFavoritoEnlace(id) {
            const l = links.find(x => x.id === id);
            if (!l) return;
            if (!l.favorito && links.filter(x => x.favorito).length >= 5) { showToast('Como mucho 5 favoritos: quita uno antes', true); return; }
            l.favorito = !l.favorito;
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function menuEnlace(boton, id) {
            const l = links.find(x => x.id === id);
            if (!l) return;
            abrirMenuAcciones(boton, [
                ['editar.', () => openEditLink(id)],
                ['duplicar.', () => duplicarEnlace(id)],
                ['copiar la dirección.', async () => { try { await navigator.clipboard.writeText(l.url); showToast('Dirección copiada'); } catch (e) { prompt('Copia la dirección:', l.url); } }],
                ['eliminar.', () => confirmarBorrarEnlace(id)],
            ]);
        }

        async function duplicarEnlace(id) {
            const l = links.find(x => x.id === id);
            if (!l) return;
            links.splice(links.indexOf(l) + 1, 0, { ...l, id: 'link_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), title: l.title + ' (copia)', favorito: false, createdAt: new Date().toISOString() });
            render();
            try { await saveData(); showToast('Enlace duplicado'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function confirmarBorrarEnlace(id) {
            const l = links.find(x => x.id === id);
            if (!l) return;
            showModal(`
                <div class="modal-title">eliminar enlace.</div>
                <p class="finance-modal-note" style="margin-top:0">Se borra «${escapeHtml(l.title)}». No se puede deshacer.</p>
                <button class="btn-modal-primary btn-peligro" onclick="closeModal();deleteLink('${jsAttr(id)}')">eliminar.</button>
                <button class="btn-secondary" style="margin-top:8px" onclick="closeModal()">cancelar.</button>`);
        }

        function menuCategoriaEnlace(boton, id) {
            const c = linkCategories.find(x => x.id === id);
            if (!c) return;
            abrirMenuAcciones(boton, [
                ['renombrar o cambiar el color.', () => openEditarCategoriaEnlace(id)],
                ['eliminar.', () => confirmarBorrarCategoriaEnlace(id)],
            ]);
        }

        function openEditarCategoriaEnlace(id) {
            const c = linkCategories.find(x => x.id === id);
            if (!c) return;
            showModal(`
                <div class="modal-title">categoría.</div>
                <div class="modal-label">nombre.</div>
                <input id="link-cat-name" class="modal-input" value="${escapeHtml(c.name)}">
                <div class="modal-label">color.</div>
                <div class="link-color-picker">${LINK_CATEGORY_COLORS.map(col => `<button type="button" class="link-color-swatch ${col === c.color ? 'selected' : ''}" style="background:${col}" data-color="${col}" aria-label="Color ${col}" onclick="selectLinkColor(this)"></button>`).join('')}</div>
                <input type="hidden" id="link-cat-color" value="${escapeHtml(c.color || LINK_CATEGORY_COLORS[0])}">
                <button class="btn-modal-primary" onclick="guardarCategoriaEnlace('${jsAttr(id)}')">guardar.</button>`);
        }

        async function guardarCategoriaEnlace(id) {
            const c = linkCategories.find(x => x.id === id);
            const name = document.getElementById('link-cat-name')?.value.trim();
            if (!c || !name) { showToast('Indica un nombre', true); return; }
            c.name = name; c.color = document.getElementById('link-cat-color')?.value || c.color;
            closeModal(); render();
            try { await saveData(); showToast('Categoría guardada'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // Al borrar una categoría con enlaces, se elige qué hacer con ellos: pasarlos a otra o dejarlos sin categoría.
        function confirmarBorrarCategoriaEnlace(id) {
            const c = linkCategories.find(x => x.id === id);
            if (!c) return;
            const n = links.filter(l => l.categoryId === id).length;
            const otras = linkCategories.filter(x => x.id !== id);
            showModal(`
                <div class="modal-title">eliminar categoría.</div>
                <p class="finance-modal-note" style="margin-top:0">Se borra «${escapeHtml(c.name)}».${n ? ` Tiene ${n} ${n === 1 ? 'enlace' : 'enlaces'}: ¿adónde ${n === 1 ? 'va' : 'van'}?` : ''}</p>
                ${n ? `<select id="link-cat-destino" class="modal-input"><option value="">sin categoría.</option>${otras.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('')}</select>` : ''}
                <button class="btn-modal-primary btn-peligro" onclick="borrarCategoriaEnlace('${jsAttr(id)}')">eliminar categoría.</button>
                <button class="btn-secondary" style="margin-top:8px" onclick="closeModal()">cancelar.</button>`);
        }

        async function borrarCategoriaEnlace(id) {
            const destino = document.getElementById('link-cat-destino')?.value || null;
            links.forEach(l => { if (l.categoryId === id) l.categoryId = destino; });
            linkCategories = linkCategories.filter(c => c.id !== id);
            if (enlacesFiltroCat === id) enlacesFiltroCat = '';
            closeModal(); render();
            try { await saveData(); showToast('Categoría eliminada'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
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

        function openAddLink(categoria) {
            showModal(`
                <div class="modal-title">nuevo enlace.</div>
                <div class="modal-label">dirección.</div>
                <input id="link-url" class="modal-input" placeholder="https://..." autocomplete="off">
                <div class="modal-label">título.</div>
                <input id="link-title" class="modal-input" placeholder="Ej: campus virtual">
                <div class="modal-label">descripción (opcional).</div>
                <input id="link-desc" class="modal-input" placeholder="Para qué es, en una frase">
                <div class="modal-label">categoría.</div>
                <select id="link-category" class="modal-input">
                    <option value="">sin categoría.</option>
                    ${linkCategories.map(c => `<option value="${c.id}" ${c.id === categoria ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                </select>
                <button class="btn-modal-primary" onclick="saveNewLink()">añadir enlace.</button>
            `);
        }

        async function saveNewLink() {
            const title = document.getElementById('link-title')?.value.trim();
            let url = document.getElementById('link-url')?.value.trim();
            const categoryId = document.getElementById('link-category')?.value || null;
            const descripcion = document.getElementById('link-desc')?.value.trim() || undefined;
            if (!title || !url) { showToast('Indica un título y un enlace', true); return; }
            if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
            links.unshift({ id: 'link_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), title, url, categoryId, descripcion, createdAt: new Date().toISOString() });
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
                <div class="modal-title">editar enlace.</div>
                <div class="modal-label">título.</div>
                <input id="link-title" class="modal-input" value="${escapeHtml(l.title)}">
                <div class="modal-label">dirección.</div>
                <input id="link-url" class="modal-input" value="${escapeHtml(l.url)}">
                <div class="modal-label">descripción (opcional).</div>
                <input id="link-desc" class="modal-input" value="${escapeHtml(l.descripcion || '')}" placeholder="Para qué es, en una frase">
                <div class="modal-label">categoría.</div>
                <select id="link-category" class="modal-input">
                    <option value="">sin categoría.</option>
                    ${linkCategories.map(c => `<option value="${c.id}" ${c.id === l.categoryId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                </select>
                <button class="btn-modal-primary" onclick="saveEditLink('${id}')">guardar.</button>
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
            l.title = title; l.url = url; l.categoryId = categoryId; l.descripcion = document.getElementById('link-desc')?.value.trim() || undefined;
            closeModal();
            render();
            try { await saveData(); showToast('Enlace actualizado'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openAddLinkCategory() {
            showModal(`
                <div class="modal-title">nueva categoría.</div>
                <div class="modal-label">nombre.</div>
                <input id="link-cat-name" class="modal-input" placeholder="Ej: universidad">
                <div class="modal-label">color.</div>
                <div class="link-color-picker">
                    ${LINK_CATEGORY_COLORS.map((c, i) => `<button type="button" class="link-color-swatch ${i === 0 ? 'selected' : ''}" style="background:${c}" data-color="${c}" onclick="selectLinkColor(this)"></button>`).join('')}
                </div>
                <input type="hidden" id="link-cat-color" value="${LINK_CATEGORY_COLORS[0]}">
                <button class="btn-modal-primary" onclick="saveNewLinkCategory()">crear categoría.</button>
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
                <div class="modal-title">Profesor – ${escapeHtml(s.name)}</div>
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
            studies.subjects.push({ id: 'subj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name, color, creditos: null, exams: [], assignments: [], cuatrimestre: cuatriParaAsignaturaNueva() });
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
            document.querySelector('#modal-container .modal-sheet')?.classList.add('asignatura-sheet');
            // El foco va al nombre de la asignatura, no al primer campo (seleccionaba el título del primer examen).
            setTimeout(() => document.getElementById('asig-titulo')?.focus({ preventScroll: true }), 30);
            loadEntryDocs('studies', s.id);
        }

        const STUDIES_ICON_EXAM = '<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M9 9h6M9 13h6M9 17h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
        const STUDIES_ICON_WORK = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 20l1-5 11-11 4 4-11 11-5 1z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><path d="M14 5l4 4" stroke="currentColor" stroke-width="1.8"/></svg>';

        // Ficha de asignatura (rediseño 24-10): cabecera con sus cifras y «añadir.», y a dos columnas: próximas
        // entregas y trabajos a la izquierda; exámenes y progreso a la derecha (una sola columna en el móvil).
        // Todo lo que enseña sale de los datos; si falta algo, lo dice en vez de inventarlo.
        function renderSubjectDetailModal(s) {
            const hasProfessor = !!(s.professor && s.professor.trim());
            return `
                <div class="subject-detail-modal asignatura" role="dialog" aria-modal="true" aria-labelledby="asig-titulo">
                    <div class="asig-cab">
                        <div class="asig-cab-txt">
                            <div class="modal-title asig-titulo" id="asig-titulo" tabindex="-1">${escapeHtml(s.name)}.</div>
                            <div class="subject-detail-prof ${hasProfessor ? '' : 'subject-detail-prof-empty'}" onclick="editSubjectProfessor('${s.id}')">${hasProfessor ? escapeHtml(s.professor) : 'añadir nombre del profesor.'}</div>
                            <div class="asig-cifras" id="asig-cifras-${s.id}">${renderAsignaturaCifras(s)}</div>
                        </div>
                        <div class="asig-cab-acc">
                            <button class="vista-btn principal" aria-haspopup="menu" onclick="abrirMenuAcciones(this,[['añadir trabajo.',()=>addSubjectItem('${s.id}','assignments')],['añadir examen.',()=>addSubjectItem('${s.id}','exams')]])"><i class="ico ico-mas" aria-hidden="true"></i>añadir.</button>
                            <button class="vista-icono-btn" aria-label="Más opciones de la asignatura" aria-haspopup="menu" onclick="abrirMenuAcciones(this,[['eliminar asignatura.',()=>deleteSubject('${s.id}')]])"><i class="ico ico-puntos" aria-hidden="true"></i></button>
                            <button class="vista-icono-btn" aria-label="Cerrar" onclick="closeModal()"><i class="ico ico-x" aria-hidden="true"></i></button>
                        </div>
                    </div>
                    <div class="asig-cuerpo">
                        <div class="asig-col">
                            <section class="asig-panel" id="asig-proximas-${s.id}">${renderAsignaturaProximas(s)}</section>
                            ${renderSubjectItemsBlock(s, 'assignments')}
                        </div>
                        <div class="asig-col">
                            ${renderSubjectItemsBlock(s, 'exams')}
                            <section class="asig-panel" id="asig-progreso-${s.id}">${renderAsignaturaProgreso(s)}</section>
                            <div class="studies-weight-note" id="subject-weight-note">${renderSubjectWeightNote(s)}</div>
                        </div>
                    </div>
                    ${renderEntryDocsSection('studies', s.id, 'documentos (apuntes, resúmenes...).')}
                </div>
            `;
        }

        function renderAsignaturaCifras(s) {
            const nEx = (s.exams || []).length, nTr = (s.assignments || []).length;
            const media = subjectFinalGrade(s);
            return `<span class="asig-cifra"><b>${nEx}</b>${nEx === 1 ? 'examen' : 'exámenes'}</span><span class="asig-cifra"><b>${nTr}</b>${nTr === 1 ? 'trabajo' : 'trabajos'}</span><span class="asig-cifra"><b class="${media !== null ? gradeTierClass(media) : ''}">${media !== null ? media.toFixed(2).replace('.', ',') : 'sin nota'}</b>nota media</span>`;
        }

        // Estado de un examen o trabajo: calificado si tiene nota; entregado si está marcado; vencido si pasó la fecha
        // sin entregar (solo trabajos); y si no, pendiente. Nunca se da por entregado solo porque pase la fecha.
        function estadoItemAsignatura(listKey, it) {
            const tieneNota = it.grade !== '' && it.grade != null && !isNaN(Number(it.grade));
            if (tieneNota) return { clave: 'nota', texto: 'calificado.' };
            if (listKey === 'assignments' && it.done) return { clave: 'hecho', texto: 'entregado.' };
            if (it.date && it.date < todayISO()) return listKey === 'assignments' ? { clave: 'vencido', texto: 'vencido.' } : { clave: 'pasado', texto: 'hecho, sin nota.' };
            return { clave: 'pend', texto: 'pendiente.' };
        }

        function renderAsignaturaProximas(s) {
            const hoy = todayISO();
            const futuras = [...(s.assignments || []).filter(x => !x.done).map(x => ({ x, tipo: 'trabajo' })), ...(s.exams || []).map(x => ({ x, tipo: 'examen' }))]
                .filter(({ x }) => x.date && x.date >= hoy).sort((a, b) => a.x.date.localeCompare(b.x.date)).slice(0, 3);
            return `<div class="asig-panel-cab"><b>próximas entregas.</b></div>
                ${futuras.length ? `<div class="asig-proximas">${futuras.map(({ x, tipo }) => {
                    const cd = studiesItemCountdown(x.date);
                    return `<div class="asig-prox"><span class="asig-prox-cuando ${cd.due ? 'pronto' : ''}">${escapeHtml(cd.text)}.</span><span class="asig-prox-txt"><b>${escapeHtml(x.title || (tipo === 'examen' ? 'examen sin título' : 'trabajo sin título'))}</b><small>${tipo}, ${new Date(x.date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}${x.time ? ', ' + escapeHtml(x.time) : ''}</small></span></div>`;
                }).join('')}</div>` : `<p class="asig-vacio">Nada con fecha por delante. <button class="asig-enlace" onclick="addSubjectItem('${s.id}','assignments')">añadir trabajo.</button></p>`}`;
        }

        function renderAsignaturaProgreso(s) {
            const items = [...(s.exams || []), ...(s.assignments || [])];
            const conNota = items.filter(x => x.grade !== '' && x.grade != null && !isNaN(Number(x.grade)));
            const media = subjectFinalGrade(s);
            const evaluado = conNota.reduce((n, x) => n + (Number(x.weight) > 0 ? Number(x.weight) : 0), 0);
            const tr = s.assignments || [];
            const entregados = tr.filter(x => x.done || (x.grade !== '' && x.grade != null)).length;
            return `<div class="asig-panel-cab"><b>progreso.</b></div>
                ${!conNota.length && !tr.length ? '<p class="asig-vacio">Aún no hay calificaciones. Cuando pongas notas, aquí verás cómo vas.</p>' : `
                <div class="asig-prog">
                    <div><b class="${media !== null ? gradeTierClass(media) : ''}">${media !== null ? media.toFixed(2).replace('.', ',') : 'sin nota'}</b><small>${media !== null ? (evaluado ? 'media ponderada.' : 'media de las notas.') : 'aún no hay calificaciones.'}</small></div>
                    ${evaluado ? `<div><b>${Math.min(100, Math.round(evaluado))} %</b><small>de la nota ya evaluado.</small><i class="viaje-barra"><i style="width:${Math.min(100, evaluado)}%"></i></i></div>` : ''}
                    ${tr.length ? `<div><b>${entregados}/${tr.length}</b><small>trabajos entregados.</small><i class="viaje-barra"><i style="width:${Math.round(entregados / tr.length * 100)}%"></i></i></div>` : ''}
                </div>`}`;
        }

        // Lo que depende de varias cosas (cifras de arriba, próximas, progreso) se repinta junto tras cada cambio.
        function refrescarFichaAsignatura(s) {
            const poner = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
            poner(`asig-cifras-${s.id}`, renderAsignaturaCifras(s));
            poner(`asig-proximas-${s.id}`, renderAsignaturaProximas(s));
            poner(`asig-progreso-${s.id}`, renderAsignaturaProgreso(s));
        }

        async function alternarEntregado(subjectId, index) {
            const s = findSubject(subjectId);
            const it = s?.assignments?.[index];
            if (!it) return;
            it.done = !it.done;
            syncAssignmentPlannerItem(s, it);
            refreshSubjectItemsBlock(s, 'assignments');
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
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
            if (total > 100) return `Peso repartido: ${total} %. Te has pasado ${total - 100} puntos.`;
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
            refrescarFichaAsignatura(s);
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
                ? `${items.length} ${label.toLowerCase()}${next ? `, próximo ${studiesItemCountdown(next.date).text}` : ''}`
                : `sin ${label.toLowerCase()} todavía`;
            return `
            <section class="studies-editorial-block asig-panel" id="studies-block-${listKey}-${s.id}">
                <div class="asig-panel-cab"><b>${label.toLowerCase()}.</b><small>${escapeHtml(kicker)}.</small><button class="vista-btn" onclick="addSubjectItem('${s.id}','${listKey}')"><i class="ico ico-mas" aria-hidden="true"></i>${singular}.</button></div>
                ${!items.length ? `<div class="asig-vacio">Todavía no hay ${label.toLowerCase()}. ${listKey === 'exams' ? 'Apúntalos para tener todas las fechas importantes juntas y en el calendario.' : 'Al ponerles fecha, salen solos en tu planificador el día de entrega.'}</div>` : `
                    ${noDate.map(it => renderSubjectItemRow(s.id, listKey, it, s[listKey].indexOf(it))).join('')}
                    ${upcoming.map(it => renderSubjectItemRow(s.id, listKey, it, s[listKey].indexOf(it))).join('')}
                    ${past.length ? `
                    <details class="studies-past-group" ${studiesPastGroupOpen[`${listKey}-${s.id}`] === true || (studiesPastGroupOpen[`${listKey}-${s.id}`] !== false && past.length <= 3) ? 'open' : ''} ontoggle="studiesPastGroupOpen['${listKey}-${s.id}']=this.open">
                        <summary class="studies-editorial-group-label">pasados. ${past.length}</summary>
                        ${past.map(it => renderSubjectItemRow(s.id, listKey, it, s[listKey].indexOf(it))).join('')}
                    </details>` : ''}
                `}
            </section>`;
        }

        function refreshSubjectItemsBlock(s, listKey) {
            const el = document.getElementById(`studies-block-${listKey}-${s.id}`);
            if (el) el.outerHTML = renderSubjectItemsBlock(s, listKey);
            refrescarFichaAsignatura(s);
        }

        function renderSubjectItemRow(subjectId, listKey, item, index) {
            const cd = studiesItemCountdown(item.date);
            return `
                <div class="studies-row" data-item-id="${item.id}">
                    <div class="studies-row-head">
                        <input class="studies-row-title-input" value="${escapeHtml(item.title || '')}" placeholder="${listKey === 'exams' ? 'Examen sin título' : 'Trabajo sin título'}" onchange="updateSubjectItem('${subjectId}','${listKey}',${index},'title',this.value)">
                        ${cd && !cd.past ? `<span class="studies-row-countdown ${cd.due ? 'due-soon' : ''}">${cd.text}</span>` : ''}
                        ${listKey === 'assignments'
                            ? `<button class="asig-estado ${estadoItemAsignatura(listKey, item).clave}" aria-pressed="${!!item.done}" title="Marcar como entregado o pendiente" onclick="alternarEntregado('${subjectId}',${index})"><i aria-hidden="true"></i>${estadoItemAsignatura(listKey, item).texto}</button>`
                            : `<span class="asig-estado ${estadoItemAsignatura(listKey, item).clave}"><i aria-hidden="true"></i>${estadoItemAsignatura(listKey, item).texto}</span>`}
                        ${item.enlace ? `<a class="studies-row-remove" href="${escapeHtml(item.enlace)}" target="_blank" rel="noopener" title="Abrir en Classroom" aria-label="Abrir en Classroom"><i class='ico ico-abrir' aria-hidden=true></i></a>` : ''}
                        <button class="studies-row-remove" title="Eliminar" aria-label="Eliminar" onclick="removeSubjectItem('${subjectId}','${listKey}',${index})"><i class='ico ico-x' aria-hidden=true></i></button>
                    </div>
                    <div class="studies-row-fields">
                        <div class="studies-row-field"><label>fecha.</label><input type="date" value="${item.date || ''}" onchange="updateSubjectItem('${subjectId}','${listKey}',${index},'date',this.value)"></div>
                        <div class="studies-row-field grade"><label>nota.</label><input type="number" min="0" max="10" step="0.1" value="${item.grade ?? ''}" placeholder="—" onchange="updateSubjectItem('${subjectId}','${listKey}',${index},'grade',this.value)"></div>
                        <div class="studies-row-field"><label>peso %.</label><input type="number" min="0" max="100" step="1" value="${item.weight ?? ''}" placeholder="—" onchange="updateSubjectItem('${subjectId}','${listKey}',${index},'weight',this.value)"></div>
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
                        <button title="Eliminar" onclick="removeScheduleBlock('${d.key}',${i})"><i class='ico ico-x' aria-hidden=true></i></button>
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
            const abierto = typeof proyectoActual === 'function' && proyectoAbierto ? proyectoActual() : null;
            if (abierto) return renderGestorProyecto(abierto);
            const projects = entries.filter(e => e.type === 'project');
            if (!projects.length) {
                return `<div class="empty-state"><div class="empty-title">ningún proyecto todavía.</div><div class="empty-sub"><span class="solo-escritorio">Pulsa el botón + y selecciona "Proyecto"</span><span class="solo-movil">Añade el primero con el botón de arriba.</span></div></div>`;
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
                    <div class="line-row" onclick="abrirProyecto('${p.id}')" style="cursor:pointer">
                        <div class="line-row-date">
                            <div class="line-row-date-day ${overdue ? 'line-row-date-overdue' : ''}">${dateObj ? String(dateObj.getDate()).padStart(2, '0') : '–'}</div>
                            ${dateObj ? `<div class="line-row-date-month">${dateObj.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}</div>` : ''}
                        </div>
                        <div class="line-row-icon">${PROJECT_ICON_FLAG}</div>
                        <div class="line-row-body">
                            <div class="line-row-title"><span class="project-priority-dot" style="background:${PROJECT_PRIORITY_COLOR[priority]}" title="Prioridad ${PROJECT_PRIORITY_LABEL[priority]}"></span><span class="line-row-title-text">${escapeHtml(p.title)}</span></div>
                            <div class="line-row-meta">${(() => { const sig = proyectoSiguiente(p); return sig && bucket !== 'Completado' ? `siguiente: ${escapeHtml(sig.texto)}` : escapeHtml(p.projectCategory || 'Sin categoría'); })()}${total > 0 ? `, ${done}/${total}, ${pct}%` : ''}</div>
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
                            <div class="kanban-card" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${p.id}')" onclick="abrirProyecto('${p.id}')" data-color="${color}" style="--c:${color}">
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

