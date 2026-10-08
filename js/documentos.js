        // ============================================================
        //  DOCUMENTS
        // ============================================================
        const DOC_ICONO = '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M22 6h38l22 22v60a6 6 0 0 1-6 6H22a6 6 0 0 1-6-6V12a6 6 0 0 1 6-6zm36 4v20h20z"/></svg>';
        const DOC_ICONO_FICHA = '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M14 18a8 8 0 0 1 8-8h56a8 8 0 0 1 8 8v64a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8zM26 30h48v8H26zm0 16h48v8H26zm0 16h30v8H26z"/></svg>';

        function renderDocuments() {
            const fichas = entries.filter(e => e.type === 'document');
            const pronto = fichas.filter(f => f.date && diasHasta(f.date) <= 30).length;
            const archivos = documents.length + viewerFiles.length;
            return `
                <div class="docs2-vista" ondragover="event.preventDefault();this.classList.add('soltando')" ondragleave="if(!this.contains(event.relatedTarget))this.classList.remove('soltando')" ondrop="soltarDocumento(event)">
                    <div class="docs2-cabecera">
                        <div>
                            <div class="docs2-titulo">documentos.</div>
                            <div class="docs2-sub"><span id="docs2-n-archivos">${archivos} ${archivos === 1 ? 'archivo' : 'archivos'}</span> · ${fichas.length} ${fichas.length === 1 ? 'ficha' : 'fichas'}${pronto ? ` · <b>${pronto} ${pronto === 1 ? 'caduca' : 'caducan'} en menos de un mes</b>` : ''}.</div>
                        </div>
                        <div class="docs2-acciones">
                            <button class="btn-secondary" style="width:auto" onclick="openBackupsModal()">copias.</button>
                            <button class="btn-secondary" style="width:auto" onclick="openNewEntry('document')">+ ficha.</button>
                            <button class="btn-modal-primary docs2-subir" onclick="document.getElementById('doc-upload-input').click()">subir archivo.</button>
                        </div>
                    </div>
                    ${renderFichasDocumentos()}
                    <div class="docs2-seccion-cab">
                        <div class="docs2-seccion-titulo">archivos.</div>
                        <input type="text" id="doc-search-input" class="modal-input docs2-buscar" placeholder="buscar por nombre..." value="${escapeHtml(docSearchQuery)}" oninput="setDocSearchQuery(this.value)">
                    </div>
                    <div id="doc-list">Cargando documentos...</div>
                    <div class="docs2-soltar">${DOC_ICONO}<span>suelta aquí tu PDF o HTML para subirlo.</span></div>
                </div>`;
        }

        // Arrastrar y soltar sobre la vista: reutiliza la misma subida que
        // el botón, con el primer archivo que se suelte.
        function soltarDocumento(event) {
            event.preventDefault();
            event.currentTarget.classList.remove('soltando');
            const file = event.dataTransfer?.files?.[0];
            if (file) handleDocUpload({ target: { files: [file], value: '' } });
        }

        // Fichas de documentos sin archivo (garantías, contratos, seguros...)
        // con fecha de caducidad: las crea el conector o el usuario desde
        // "+ ficha."; las que caducan pronto salen primero y avisan en el
        // inicio (avisosProximos).
        function diasHasta(iso) {
            return Math.round((new Date(iso + 'T12:00:00') - new Date(todayISO() + 'T12:00:00')) / 86400000);
        }

        function renderFichasDocumentos() {
            const fichas = entries.filter(e => e.type === 'document')
                .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
            const estado = f => {
                if (!f.date) return { cifra: '—', texto: 'sin caducidad.', clase: '' };
                const d = diasHasta(f.date);
                if (d < 0) return { cifra: -d, texto: `${d === -1 ? 'día caducada' : 'días caducada'} · ${financeDateLabelShort(f.date)}`, clase: 'caducada' };
                if (d === 0) return { cifra: 'hoy', texto: 'caduca hoy.', clase: 'pronto' };
                return { cifra: d, texto: `${d === 1 ? 'día' : 'días'} · ${financeDateLabelShort(f.date)}`, clase: d <= 30 ? 'pronto' : '' };
            };
            if (!fichas.length) {
                return `<div class="docs2-fichas-vacio" onclick="openNewEntry('document')">${DOC_ICONO_FICHA}<div><b>fichas.</b> Garantías, contratos, seguros, el DNI... con su fecha de caducidad: Bitácora te avisa cuando se acerca. Claude también puede apuntarlas por ti.</div></div>`;
            }
            return `
                <div class="docs2-seccion-cab"><div class="docs2-seccion-titulo">fichas.</div></div>
                <div class="docs2-fichas">
                    ${fichas.map(f => {
                        const st = estado(f);
                        return `
                        <div class="docs2-ficha ${st.clase}" onclick="openEditEntry('${f.id}')">
                            <div class="docs2-ficha-top">
                                <span class="docs2-ficha-tipo">${escapeHtml((f.docTipo || 'documento').toLowerCase())}.</span>
                                ${f.url ? `<a class="docs2-ficha-enlace" href="${escapeHtml(f.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Abrir el enlace">abrir ↗</a>` : ''}
                            </div>
                            <div class="docs2-ficha-titulo">${escapeHtml(f.title || '')}</div>
                            <div class="docs2-ficha-pie"><span class="docs2-ficha-cifra">${st.cifra}</span><span class="docs2-ficha-estado">${escapeHtml(st.texto)}</span></div>
                        </div>`;
                    }).join('')}
                </div>`;
        }

        let documents = [];
        let docSearchQuery = '';

        async function loadDocuments() {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) { documents = []; renderDocList(); return; }
                const { data, error } = await sb.storage.from('documents').list(user.id, {
                    sortBy: { column: 'created_at', order: 'desc' }
                });
                if (error) throw error;
                // Las carpetas "backups" y "viewer" aparecen en este listado
                // como una entrada más (id null, sin metadata) porque hay
                // archivos dentro — se excluyen porque no son un documento
                // subido en sí (backups tiene su propio popup; viewer se
                // carga aparte con loadViewerFiles).
                documents = (data || []).filter(d => d.name !== 'backups' && d.name !== 'viewer' && d.id !== null);
                renderDocList();
            } catch (e) {
                console.error('Error cargando documentos:', e);
                const listEl = document.getElementById('doc-list');
                if (listEl) listEl.innerHTML =
                    `<div class="empty-state"><div class="empty-title">no se pudieron cargar los documentos.</div><div class="empty-sub">${(e?.message || 'Comprueba que el bucket "documents" existe en Supabase Storage')}</div></div>`;
            }
        }

        function setDocSearchQuery(value) {
            docSearchQuery = value;
            renderDocList();
        }

        // Documentos (PDF) y Visor (HTML) comparten exactamente la misma
        // función — un archivo que subes y luego abres — así que se
        // fusionan en una sola lista. "kind" distingue cómo se abre cada
        // fila (descarga directa vs. el visor con srcdoc) y de qué
        // carpeta de Storage viene.
        function renderDocList() {
            const listEl = document.getElementById('doc-list');
            if (!listEl) return;
            const all = [
                ...documents.map(d => ({ ...d, kind: 'pdf' })),
                ...viewerFiles.map(f => ({ ...f, kind: 'html' }))
            ].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

            const q = stripAccents(docSearchQuery.toLowerCase().trim());
            const filtered = q ? all.filter(d => stripAccents(d.name.toLowerCase()).includes(q)) : all;
            const contador = document.getElementById('docs2-n-archivos');
            if (contador) contador.textContent = `${all.length} ${all.length === 1 ? 'archivo' : 'archivos'}`;

            if (!all.length) {
                listEl.innerHTML = `<div class="docs2-vacio" onclick="document.getElementById('doc-upload-input').click()">${DOC_ICONO}<div><b>sin archivos todavía.</b> Sube un PDF o una página HTML (guías, checklists...) con el botón de arriba o arrastrándolo aquí.</div></div>`;
                return;
            }
            if (!filtered.length) {
                listEl.innerHTML = `<div class="docs2-vacio">${DOC_ICONO}<div>Nada coincide con "${escapeHtml(docSearchQuery)}".</div></div>`;
                return;
            }
            listEl.innerHTML = `<div class="docs2-archivos">${filtered.map(doc => {
                const sizeKb = doc.metadata?.size ? (doc.metadata.size > 1048576 ? (doc.metadata.size / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.round(doc.metadata.size / 1024) + ' KB') : '';
                const date = doc.created_at ? new Date(doc.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
                const n = escapeHtml(doc.name);
                const nombreVisible = n.replace(/^\d{10,}_/, '');
                const abrir = doc.kind === 'pdf' ? `downloadDocument('${n}')` : `openViewerFile('${n}')`;
                const renameFn = doc.kind === 'pdf' ? 'renameDocument' : 'renameViewerFile';
                const deleteFn = doc.kind === 'pdf' ? 'deleteDocument' : 'deleteViewerFile';
                return `
                    <div class="docs2-archivo" onclick="${abrir}">
                        <div class="docs2-archivo-icono ${doc.kind}">${DOC_ICONO}<span>${doc.kind === 'pdf' ? 'PDF' : 'HTML'}</span></div>
                        <div class="docs2-archivo-cuerpo">
                            <div class="docs2-archivo-nombre" title="${nombreVisible}">${nombreVisible}</div>
                            <div class="docs2-archivo-meta">${date}${sizeKb ? ' · ' + sizeKb : ''}</div>
                        </div>
                        <div class="docs2-archivo-acciones">
                            <button title="${doc.kind === 'pdf' ? 'Descargar' : 'Ver'}" onclick="event.stopPropagation();${abrir}">${doc.kind === 'pdf' ? '↓' : '→'}</button>
                            <button title="Renombrar" onclick="event.stopPropagation();${renameFn}('${n}')">✎</button>
                            <button title="Eliminar" class="borrar" onclick="event.stopPropagation();${deleteFn}('${n}')">✕</button>
                        </div>
                    </div>`;
            }).join('')}</div>`;
        }

        async function handleDocUpload(event) {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;
            const isHtml = file.type === 'text/html' || /\.html?$/i.test(file.name);
            const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
            if (!isPdf && !isHtml) { showToast('Solo se admiten archivos PDF o HTML', true); return; }
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                if (isPdf) {
                    const path = `${user.id}/${Date.now()}_${sanitizeStorageFilename(file.name)}`;
                    const { error } = await sb.storage.from('documents').upload(path, file, { upsert: false });
                    if (error) throw error;
                    await loadDocuments();
                } else {
                    const path = `${user.id}/viewer/${Date.now()}_${sanitizeStorageFilename(file.name)}`;
                    const { error } = await sb.storage.from('documents').upload(path, file, { upsert: false, contentType: 'text/html' });
                    if (error) throw error;
                    await loadViewerFiles();
                }
                showToast('Documento subido correctamente');
            } catch (e) {
                console.error('Error subiendo documento:', e);
                showToast('Error al subir: ' + (e?.message || 'desconocido'), true);
            }
        }

        async function renameDocument(oldName) {
            const dot = oldName.lastIndexOf('.');
            const currentBase = dot > 0 ? oldName.slice(0, dot) : oldName;
            const ext = dot > 0 ? oldName.slice(dot) : '';
            const input = prompt('Nuevo nombre para el documento:', currentBase);
            if (input === null) return;
            const trimmed = input.trim();
            if (!trimmed) return;
            const newName = sanitizeStorageFilename(trimmed + ext);
            if (newName === oldName) return;
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const fromPath = `${user.id}/${oldName}`;
                const toPath = `${user.id}/${newName}`;
                const { error } = await sb.storage.from('documents').move(fromPath, toPath);
                if (error) throw error;
                showToast('Nombre actualizado');
                await loadDocuments();
            } catch (e) {
                console.error('Error renombrando:', e);
                showToast('Error al renombrar: ' + (e?.message || 'ya existe un archivo con ese nombre'), true);
            }
        }

        async function downloadDocument(name) {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/${name}`;
                const { data, error } = await sb.storage.from('documents').createSignedUrl(path, 60);
                if (error) throw error;
                window.open(data.signedUrl, '_blank');
            } catch (e) {
                console.error('Error descargando documento:', e);
                showToast('Error al descargar: ' + (e?.message || 'desconocido'), true);
            }
        }

        async function deleteDocument(name) {
            if (!confirm('¿Eliminar este documento? No se puede deshacer.')) return;
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/${name}`;
                const { error } = await sb.storage.from('documents').remove([path]);
                if (error) throw error;
                showToast('Documento eliminado');
                await loadDocuments();
            } catch (e) {
                console.error('Error eliminando documento:', e);
                showToast('Error al eliminar: ' + (e?.message || 'desconocido'), true);
            }
        }

        // ============================================================
        //  DOCUMENTOS ENLAZADOS A UNA ENTRADA (viajes ya tenía su propio
        //  patrón con carpeta por viaje; esto lo generaliza a cualquier
        //  tipo — eventos, asignaturas, objetivos, proyectos — usando la
        //  misma carpeta por entrada dentro del bucket "documents":
        //  <usuario>/<kind>/<entryId>/. Admite PDF y HTML (este último se
        //  abre en el mismo visor con srcdoc que usa Documentos).
        // ============================================================
        let entryDocsCache = {};
        function entryDocsKey(kind, id) { return kind + ':' + id; }

        // Si los documentos de esta entrada ya se cargaron antes, se pintan al
        // instante (y loadEntryDocs los refresca en segundo plano). Si no, una
        // línea "buscando…" de la misma altura que "sin documentos.", para
        // que la sección no salte de tamaño al terminar de cargar.
        function renderEntryDocsSection(kind, id, label) {
            const cargados = entryDocsCache[entryDocsKey(kind, id)];
            return `<div class="entry-detail-field entry-docs-section" style="grid-column:1/-1">
                <div class="entry-docs-cabecera">
                    <div class="entry-detail-label">${label}</div>
                    <button class="entry-docs-subir" onclick="document.getElementById('entry-doc-input-${kind}-${id}').click()">+ subir.</button>
                </div>
                <input type="file" id="entry-doc-input-${kind}-${id}" accept="application/pdf,.pdf,.html,.htm,text/html" style="display:none" onchange="handleEntryDocUpload(event,'${kind}','${id}')">
                <div id="entry-doc-list-${kind}-${id}">${cargados ? renderEntryDocsList(kind, id) : '<div class="entry-docs-vacio entry-docs-cargando">buscando documentos…</div>'}</div>
            </div>`;
        }

        async function loadEntryDocs(kind, id) {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const { data, error } = await sb.storage.from('documents').list(`${user.id}/${kind}/${id}`, { sortBy: { column: 'created_at', order: 'desc' } });
                if (error) throw error;
                entryDocsCache[entryDocsKey(kind, id)] = (data || []).filter(d => d.id !== null);
                const el = document.getElementById(`entry-doc-list-${kind}-${id}`);
                if (el) {
                    const html = renderEntryDocsList(kind, id);
                    if (el.innerHTML !== html) el.innerHTML = html;
                }
            } catch (e) {
                console.error('Error cargando documentos:', e);
                const el = document.getElementById(`entry-doc-list-${kind}-${id}`);
                if (el) el.innerHTML = '<div class="entry-docs-vacio">no se pudieron cargar los documentos.</div>';
            }
        }

        function renderEntryDocsList(kind, id) {
            const docs = entryDocsCache[entryDocsKey(kind, id)] || [];
            if (!docs.length) return '<div class="entry-docs-vacio">sin documentos. puedes subir un PDF o una página HTML.</div>';
            return `<div class="docs-list">${docs.map((doc, i) => {
                const sizeKb = doc.metadata?.size ? Math.round(doc.metadata.size / 1024) + ' KB' : '';
                const date = doc.created_at ? new Date(doc.created_at).toLocaleDateString('es-ES') : '';
                const isHtml = /\.html?$/i.test(doc.name);
                const n = escapeHtml(doc.name);
                const openBtn = isHtml
                    ? `<button class="doc-action-download" onclick="openEntryDocHtml('${kind}','${id}','${n}')">Ver</button>`
                    : `<button class="doc-action-download" onclick="downloadEntryDoc('${kind}','${id}','${n}')">Descargar</button>`;
                return `
                    <div class="docs-row">
                        <div class="docs-row-index">${String(i + 1).padStart(2, '0')}</div>
                        <div class="docs-row-body">
                            <div class="docs-row-name">${n}<span class="docs-row-kind">${isHtml ? 'HTML' : 'PDF'}</span></div>
                            <div class="docs-row-meta">${date}${sizeKb ? ' · ' + sizeKb : ''}</div>
                        </div>
                        <div class="doc-actions">${openBtn}<button class="doc-action-delete-btn" title="Eliminar" onclick="deleteEntryDoc('${kind}','${id}','${n}')">✕</button></div>
                    </div>`;
            }).join('')}</div>`;
        }

        async function handleEntryDocUpload(event, kind, id) {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;
            const isHtml = file.type === 'text/html' || /\.html?$/i.test(file.name);
            const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
            if (!isPdf && !isHtml) { showToast('Solo se admiten archivos PDF o HTML', true); return; }
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/${kind}/${id}/${Date.now()}_${sanitizeStorageFilename(file.name)}`;
                const { error } = await sb.storage.from('documents').upload(path, file, isHtml ? { upsert: false, contentType: 'text/html' } : { upsert: false });
                if (error) throw error;
                showToast('Documento subido');
                await loadEntryDocs(kind, id);
            } catch (e) {
                console.error('Error subiendo documento:', e);
                showToast('Error al subir: ' + (e?.message || 'desconocido'), true);
            }
        }

        async function downloadEntryDoc(kind, id, name) {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/${kind}/${id}/${name}`;
                const { data, error } = await sb.storage.from('documents').createSignedUrl(path, 60);
                if (error) throw error;
                window.open(data.signedUrl, '_blank');
            } catch (e) {
                console.error('Error descargando documento:', e);
                showToast('Error al descargar: ' + (e?.message || 'desconocido'), true);
            }
        }

        async function openEntryDocHtml(kind, id, name) {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/${kind}/${id}/${name}`;
                const { data, error } = await sb.storage.from('documents').download(path);
                if (error) throw error;
                const html = await data.text();
                document.getElementById('modal-container').innerHTML = renderViewerFrameModal(name);
                document.getElementById('viewer-modal-iframe').srcdoc = html;
            } catch (e) {
                console.error('Error abriendo el documento:', e);
                showToast('Error al abrir: ' + (e?.message || 'desconocido'), true);
            }
        }

        async function deleteEntryDoc(kind, id, name) {
            if (!confirm('¿Eliminar este documento? No se puede deshacer.')) return;
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/${kind}/${id}/${name}`;
                const { error } = await sb.storage.from('documents').remove([path]);
                if (error) throw error;
                showToast('Documento eliminado');
                await loadEntryDocs(kind, id);
            } catch (e) {
                console.error('Error eliminando documento:', e);
                showToast('Error al eliminar: ' + (e?.message || 'desconocido'), true);
            }
        }

        // ============================================================
        //  VISOR: guías/checklists en HTML sueltas (como la de
        //  coleccionismo) que el usuario sube y luego abre en un visor
        //  propio, en vez de tener que guardarlas y abrirlas fuera de
        //  Bitácora. Fusionado visualmente con Documentos (misma lista,
        //  ver renderDocList), pero vive en su propia carpeta "viewer/"
        //  del bucket "documents" para no mezclarse con los PDFs.
        // ============================================================
        let viewerFiles = [];

        async function loadViewerFiles() {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) { viewerFiles = []; renderDocList(); return; }
                const { data, error } = await sb.storage.from('documents').list(`${user.id}/viewer`, {
                    sortBy: { column: 'created_at', order: 'desc' }
                });
                if (error) throw error;
                viewerFiles = (data || []).filter(d => d.id !== null);
                renderDocList();
            } catch (e) {
                console.error('Error cargando el visor:', e);
            }
        }

        // Supabase Storage rechaza claves con tildes, "·" y otros
        // caracteres fuera de un set seguro (error "Invalid key") — se
        // limpia el nombre del archivo antes de usarlo como ruta, sin
        // tocar el nombre visible en ningún otro sitio.
        function sanitizeStorageFilename(name) {
            const dot = name.lastIndexOf('.');
            const base = dot > 0 ? name.slice(0, dot) : name;
            const ext = dot > 0 ? name.slice(dot).toLowerCase() : '';
            const clean = base.normalize('NFD').replace(/[̀-ͯ]/g, '')
                .replace(/[^a-zA-Z0-9._-]+/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_+|_+$/g, '');
            return (clean || 'archivo') + ext;
        }

        async function renameViewerFile(oldName) {
            const currentBase = oldName.replace(/\.html?$/i, '');
            const input = prompt('Nuevo nombre para el archivo:', currentBase);
            if (input === null) return;
            const trimmed = input.trim();
            if (!trimmed) return;
            const newName = sanitizeStorageFilename(trimmed.replace(/\.html?$/i, '') + '.html');
            if (newName === oldName) return;
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const fromPath = `${user.id}/viewer/${oldName}`;
                const toPath = `${user.id}/viewer/${newName}`;
                const { error } = await sb.storage.from('documents').move(fromPath, toPath);
                if (error) throw error;
                showToast('Nombre actualizado');
                await loadViewerFiles();
            } catch (e) {
                console.error('Error renombrando:', e);
                showToast('Error al renombrar: ' + (e?.message || 'ya existe un archivo con ese nombre'), true);
            }
        }

        async function openViewerFile(name) {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/viewer/${name}`;
                // Se descarga el contenido y se inyecta con srcdoc en vez de
                // apuntar el iframe a la URL firmada: Supabase Storage no
                // siempre devuelve Content-Type: text/html al servir el
                // archivo, y entonces el navegador lo enseña como texto en
                // vez de ejecutarlo. Con srcdoc da igual qué Content-Type
                // haya puesto Storage, el navegador siempre lo trata como
                // HTML.
                const { data, error } = await sb.storage.from('documents').download(path);
                if (error) throw error;
                const html = await data.text();
                document.getElementById('modal-container').innerHTML = renderViewerFrameModal(name);
                document.getElementById('viewer-modal-iframe').srcdoc = html;
            } catch (e) {
                console.error('Error abriendo el archivo:', e);
                showToast('Error al abrir: ' + (e?.message || 'desconocido'), true);
            }
        }

        function renderViewerFrameModal(name) {
            return `
                <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
                    <div class="modal-sheet viewer-modal-sheet">
                        <div class="viewer-modal-head">
                            <div class="viewer-modal-title">${escapeHtml(name)}</div>
                            <button class="modal-close" onclick="closeModal()">✕</button>
                        </div>
                        <iframe id="viewer-modal-iframe" class="viewer-modal-iframe" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
                    </div>
                </div>`;
        }

        async function deleteViewerFile(name) {
            if (!confirm('¿Eliminar este archivo del visor? No se puede deshacer.')) return;
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/viewer/${name}`;
                const { error } = await sb.storage.from('documents').remove([path]);
                if (error) throw error;
                showToast('Archivo eliminado');
                await loadViewerFiles();
            } catch (e) {
                console.error('Error eliminando del visor:', e);
                showToast('Error al eliminar: ' + (e?.message || 'desconocido'), true);
            }
        }

        // ============================================================
        //  BACKUPS AUTOMÁTICOS DIARIOS
        //  Como Bitácora no tiene servidor propio (es una app estática),
        //  no puede ejecutar nada exactamente a las 00:00h aunque tengas
        //  la app cerrada. En su lugar, la primera vez que la abres cada
        //  día (en cualquier dispositivo) se sube una copia de seguridad
        //  completa a Storage, en documents/<usuario>/backups/. Se
        //  consulta la lista real de archivos (no localStorage) para que
        //  funcione igual da igual desde qué dispositivo abras la app.
        //  Se conservan solo los 7 backups más recientes; al subir el 8º,
        //  se borra el más antiguo.
        // ============================================================
        let backupFiles = [];
        const BACKUPS_TO_KEEP = 7;
        const BACKUP_LAST_ERROR_KEY = 'bitacora_backup_last_error';

        function backupFileDate(name) {
            const m = name.match(/(\d{4}-\d{2}-\d{2})/);
            return m ? m[1] : '';
        }

        // Traduce el error crudo de Supabase (network/auth/RLS/bucket/cuota...)
        // a un mensaje concreto en vez de "desconocido" — para que si falla
        // el backup sepas de un vistazo qué ha pasado, sin tener que abrir
        // la consola del navegador.
        function describeBackupError(e) {
            const raw = (e?.message || String(e || '')).toLowerCase();
            const status = e?.status || e?.statusCode;
            if (!navigator.onLine || raw.includes('failed to fetch') || raw.includes('network')) {
                return 'Sin conexión a internet en ese momento.';
            }
            if (status === 401 || raw.includes('jwt') || raw.includes('not authenticated') || raw.includes('invalid token')) {
                return 'La sesión había caducado — vuelve a iniciar sesión y se reintentará solo.';
            }
            if (status === 403 || raw.includes('row-level security') || raw.includes('permission denied') || raw.includes('policy')) {
                return 'Permiso denegado por Supabase (revisa las políticas RLS del bucket "documents").';
            }
            if (status === 404 || raw.includes('bucket not found')) {
                return 'El bucket "documents" no existe o no es accesible en Supabase Storage.';
            }
            if (status === 413 || raw.includes('payload too large') || raw.includes('exceeded') || raw.includes('quota')) {
                return 'La copia de seguridad supera el límite de tamaño o se agotó la cuota de almacenamiento.';
            }
            return e?.message ? `Error de Supabase: ${e.message}` : 'Error desconocido al subir el backup.';
        }

        function recordBackupFailure(e) {
            try {
                localStorage.setItem(BACKUP_LAST_ERROR_KEY, JSON.stringify({ date: todayISO(), message: describeBackupError(e) }));
            } catch (_) { /* localStorage no disponible: no es crítico, se pierde el aviso persistente */ }
        }

        function clearBackupFailure() {
            try { localStorage.removeItem(BACKUP_LAST_ERROR_KEY); } catch (_) { /* no-op */ }
        }

        function getBackupFailure() {
            try {
                const raw = localStorage.getItem(BACKUP_LAST_ERROR_KEY);
                return raw ? JSON.parse(raw) : null;
            } catch (_) { return null; }
        }

        // Sube (o sustituye) el backup de HOY y aplica la rotación de los
        // últimos BACKUPS_TO_KEEP. La usan tanto la comprobación diaria
        // automática como el comando /backup para forzar uno al momento.
        async function uploadTodayBackupAndRotate(user, existingFiles) {
            const todayName = `bitacora_backup_${todayISO()}.json`;
            const payload = buildFullBackupPayload();
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            const { error: upErr } = await sb.storage.from('documents').upload(`${user.id}/backups/${todayName}`, blob, { upsert: true, contentType: 'application/json' });
            if (upErr) throw upErr;
            clearBackupFailure();

            const alreadyListed = existingFiles.some(f => f.name === todayName);
            const updated = alreadyListed ? existingFiles : [...existingFiles, { name: todayName }];
            updated.sort((a, b) => a.name.localeCompare(b.name));
            if (updated.length > BACKUPS_TO_KEEP) {
                const toDelete = updated.slice(0, updated.length - BACKUPS_TO_KEEP).map(f => `${user.id}/backups/${f.name}`);
                await sb.storage.from('documents').remove(toDelete);
            }
            if (currentView === 'documents') { await loadBackups(); renderBackupFailureBanner(); }
        }

        // El chequeo diario corre en silencio al abrir la app — si falla, el
        // usuario podría no enterarse nunca (nadie mira la consola). Ahora
        // se avisa con un toast la primera vez que falla cada día, y además
        // queda un aviso persistente (leído por renderBackupFailureBanner)
        // hasta que un backup se suba con éxito.
        async function runDailyBackupCheck() {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const todayName = `bitacora_backup_${todayISO()}.json`;
                const { data: files, error } = await sb.storage.from('documents').list(`${user.id}/backups`, {
                    sortBy: { column: 'name', order: 'asc' }
                });
                if (error) throw error;
                const existing = files || [];
                if (existing.some(f => f.name === todayName)) return; // ya hay backup de hoy
                await uploadTodayBackupAndRotate(user, existing);
            } catch (e) {
                console.error('Error en el backup automático diario:', e);
                const already = getBackupFailure();
                recordBackupFailure(e);
                if (!already || already.date !== todayISO()) {
                    showToast('No se pudo hacer la copia de seguridad de hoy: ' + describeBackupError(e), true);
                }
            }
        }

        // Comando /backup: fuerza una copia de seguridad AHORA MISMO, sin
        // esperar a que sea la primera vez que abres la app hoy — útil
        // justo antes de probar algo que podrías querer deshacer.
        async function runManualBackupNow() {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) { showToast('No hay sesión activa', true); return; }
                const { data: files, error } = await sb.storage.from('documents').list(`${user.id}/backups`, {
                    sortBy: { column: 'name', order: 'asc' }
                });
                if (error) throw error;
                await uploadTodayBackupAndRotate(user, files || []);
                showToast('Backup guardado ahora mismo');
            } catch (e) {
                console.error('Error en el backup manual:', e);
                recordBackupFailure(e);
                showToast('No se pudo guardar el backup: ' + describeBackupError(e), true);
                renderBackupFailureBanner();
            }
        }

        // Aviso persistente (no solo el toast, que se puede perder) en la
        // propia sección Documentos si el último intento de backup falló.
        function renderBackupFailureBanner() {
            const el = document.getElementById('backup-failure-banner');
            if (!el) return;
            const failure = getBackupFailure();
            if (!failure) { el.innerHTML = ''; return; }
            el.innerHTML = `
                <div class="backup-failure-banner">
                    <div>
                        <strong>⚠ El backup automático falló</strong>
                        <div class="backup-failure-banner-msg">${escapeHtml(failure.message)} (${escapeHtml(failure.date)})</div>
                    </div>
                    <button class="btn-secondary" style="width:auto" onclick="runManualBackupNow()">Reintentar ahora</button>
                </div>`;
        }

        function renderBackupsModal() {
            return `
                <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
                    <div class="modal-sheet">
                        <div class="modal-title">Backups automáticos<button class="modal-close" onclick="closeModal()">✕</button></div>
                        <div style="font-size:12px;color:var(--text-secondary);margin:-10px 0 14px">
                            Bitácora guarda una copia de seguridad completa la primera vez que abres la app cada día, y conserva las 7 más recientes.
                        </div>
                        <div id="backup-failure-banner"></div>
                        <button class="btn-secondary" style="width:auto;margin-bottom:14px" onclick="runManualBackupNow()">Guardar backup ahora</button>
                        <div id="backups-list">Cargando backups...</div>
                    </div>
                </div>`;
        }

        function openBackupsModal() {
            document.getElementById('modal-container').innerHTML = renderBackupsModal();
            loadBackups();
            renderBackupFailureBanner();
        }

        async function loadBackups() {
            const el = document.getElementById('backups-list');
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) { backupFiles = []; if (el) el.innerHTML = ''; return; }
                const { data, error } = await sb.storage.from('documents').list(`${user.id}/backups`, {
                    sortBy: { column: 'name', order: 'desc' }
                });
                if (error) throw error;
                backupFiles = data || [];
                if (el) renderBackupsListContent();
            } catch (e) {
                console.error('Error cargando backups:', e);
                if (el) el.innerHTML = `<div class="empty-state"><div class="empty-title">no se pudieron cargar las copias.</div></div>`;
            }
        }

        function renderBackupsListContent() {
            const el = document.getElementById('backups-list');
            if (!el) return;
            if (!backupFiles.length) {
                el.innerHTML = `<div class="empty-state"><div class="empty-title">aún no hay copias automáticas.</div><div class="empty-sub">Se generará el primero la próxima vez que abras Bitácora.</div></div>`;
                return;
            }
            el.innerHTML = `<div class="docs-list">${backupFiles.map((f, i) => {
                const iso = backupFileDate(f.name);
                const fecha = iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) : f.name;
                return `<div class="docs-row">
                    <div class="docs-row-index">${String(i + 1).padStart(2, '0')}</div>
                    <div class="docs-row-body"><div class="docs-row-name">${escapeHtml(fecha)}</div><div class="docs-row-meta">${escapeHtml(iso)}</div></div>
                    <div class="doc-actions"><button class="doc-action-download" onclick="restoreBackupFile('${escapeHtml(f.name)}')">Restaurar</button></div>
                </div>`;
            }).join('')}</div>`;
        }

        async function restoreBackupFile(name) {
            const iso = backupFileDate(name);
            if (!confirm(`¿Restaurar el backup del ${iso}? Esto sustituirá TODOS tus datos actuales (de cualquier apartado) por los que había guardados ese día. No se puede deshacer.`)) return;
            if (!confirm(`Segunda confirmación: ¿seguro que quieres restaurar el backup del ${iso}? Se perderá cualquier cambio hecho después de esa fecha. Esta acción no se puede deshacer.`)) return;
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const { data, error } = await sb.storage.from('documents').download(`${user.id}/backups/${name}`);
                if (error) throw error;
                const payload = JSON.parse(await data.text());
                applyBackupPayload(payload);
                await saveData();
                render();
                updatePageTitle();
                showToast('Backup restaurado correctamente');
            } catch (e) {
                console.error('Error restaurando backup:', e);
                showToast('Error al restaurar: ' + (e?.message || 'desconocido'), true);
            }
        }

