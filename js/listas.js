        // ============================================================
        //  LISTAS DE PANORAMA (20-11): cajas independientes con tareas en árbol (hasta cuatro niveles), para
        //  organizarse en el ordenador. Datos en `listasPanorama` (sincronizado): [{ id, titulo, ocultarHechas,
        //  tareas: [{ id, texto, hecha, hechaEn, plegada, hijos: [...] }] }]. Todo lleva id para que la fusión a tres
        //  bandas combine caja a caja y tarea a tarea: dos dispositivos que tocan cajas distintas no se pisan.
        //  Los manejadores leen la caja y la tarea de los data-* de la fila: no se meten ids en cadenas JS.
        // ============================================================
        let listasPanorama = [];
        const LISTAS_NIVELES = 4;
        let listaArrastre = null, listaSucia = false, listaRepintando = false, listaDeshacerDatos = null;

        function listasDatos() {
            if (!Array.isArray(listasPanorama)) listasPanorama = [];
            return listasPanorama;
        }
        const listaNuevoId = p => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
        const listaCaja = id => listasDatos().find(c => c.id === id);
        const listaHijos = n => Array.isArray(n.hijos) ? n.hijos : (n.hijos = []);

        // Si un dispositivo movió una tarea de padre mientras otro la editaba, la fusión puede dejarla en los dos
        // sitios: se queda la primera que aparece.
        function listasNormalizar() {
            const vistos = new Set();
            const limpiar = arr => (Array.isArray(arr) ? arr : []).filter(n => {
                if (!n || typeof n !== 'object' || n.id == null || vistos.has(String(n.id))) return false;
                vistos.add(String(n.id));
                if (Array.isArray(n.hijos)) n.hijos = limpiar(n.hijos);
                return true;
            });
            listasPanorama = listasDatos().filter(c => c && typeof c === 'object' && c.id != null);
            listasPanorama.forEach(c => { c.tareas = limpiar(c.tareas); });
        }

        function listaBuscar(caja, id) {
            const ir = (arr, padre, nivel) => {
                for (let i = 0; i < arr.length; i++) {
                    const n = arr[i];
                    if (n.id === id) return { nodo: n, hermanos: arr, indice: i, padre, nivel };
                    const r = ir(n.hijos || [], n, nivel + 1);
                    if (r) return r;
                }
                return null;
            };
            return caja ? ir(caja.tareas || [], null, 0) : null;
        }
        const listaAltura = n => 1 + Math.max(0, ...(n.hijos || []).map(listaAltura));
        const listaTodas = arr => (arr || []).flatMap(n => [n, ...listaTodas(n.hijos)]);
        const listaContiene = (n, id) => (n.hijos || []).some(h => h.id === id || listaContiene(h, id));

        function listasGuardar() {
            listaSucia = false;
            clearTimeout(listasGuardar.t);
            listasGuardar.t = setTimeout(() => {
                Promise.resolve(saveData()).catch(e => { console.error(e); showToast('No se pudo guardar en la nube', true); });
            }, 400);
        }

        // Colores del título (subrayado de rotulador, muy suave). La clave es lo que se guarda; el conector usa las mismas.
        const LISTAS_COLORES = [['rosa', '#f4a7b9'], ['melocotón', '#f7c19a'], ['amarillo', '#f3dc6b'], ['menta', '#9fdcbc'], ['cielo', '#a3c9ef'], ['lavanda', '#c7b3ee'], ['salvia', '#bfd29d'], ['arena', '#e2cba6']];
        const listaColor = clave => (LISTAS_COLORES.find(([k]) => k === clave) || [])[1] || null;

        // Operaciones del conector (op.tipo 'listas'), ya con ids resueltos por el servidor. Es la misma función que
        // listasAplicarOp en supabase/functions/bitacora-mcp/index.ts (allí sirve para leer con lo pendiente aplicado):
        // si cambia una, cambiar la otra. Devuelve false si no había nada que hacer.
        function listasAplicarOp(listas, op) {
            const caja = id => listas.find(c => c && c.id === id);
            const buscar = (c, id) => {
                const ir = (arr, padre) => {
                    for (let i = 0; i < arr.length; i++) {
                        if (arr[i].id === id) return { nodo: arr[i], hermanos: arr, indice: i, padre };
                        const r = ir(arr[i].hijos || [], arr[i]);
                        if (r) return r;
                    }
                    return null;
                };
                return c ? ir(c.tareas || (c.tareas = []), null) : null;
            };
            const todas = arr => (arr || []).flatMap(n => [n, ...todas(n.hijos)]);
            const existe = id => listas.some(c => todas(c.tareas).some(n => n.id === id));
            const marcar = (n, hecha) => { if (hecha) { if (!n.hecha) { n.hecha = true; n.hechaEn = op.cuando || new Date().toISOString(); } } else { n.hecha = false; delete n.hechaEn; } };
            const insertar = (c, padreId, indice, nodos) => {
                const p = padreId ? buscar(c, padreId)?.nodo : null;
                if (padreId && !p) return false;
                const arr = p ? (p.hijos = Array.isArray(p.hijos) ? p.hijos : []) : c.tareas;
                if (p) delete p.plegada;
                arr.splice(indice == null ? arr.length : Math.max(0, Math.min(indice, arr.length)), 0, ...nodos);
                return true;
            };
            if (op.accion === 'crear_lista') {
                if (caja(op.id)) return false;
                listas.push({ id: op.id, titulo: op.titulo || '', ...(op.color ? { color: op.color } : {}), tareas: (op.tareas || []).filter(n => !existe(n.id)) });
                return true;
            }
            const c = caja(op.lista);
            if (!c) return false;
            if (op.accion === 'lista') {
                if (op.titulo != null) c.titulo = op.titulo;
                if (op.color !== undefined) { if (op.color) c.color = op.color; else delete c.color; }
                if (op.ocultarHechas !== undefined) { if (op.ocultarHechas) c.ocultarHechas = true; else delete c.ocultarHechas; }
                return true;
            }
            if (op.accion === 'borrar_lista') { listas.splice(listas.indexOf(c), 1); return true; }
            if (op.accion === 'quitar_hechas') {
                const filtrar = arr => arr.filter(n => !n.hecha).map(n => { if (n.hijos) n.hijos = filtrar(n.hijos); return n; });
                c.tareas = filtrar(c.tareas || []);
                return true;
            }
            if (op.accion === 'anadir') {
                const nodos = (op.tareas || []).filter(n => !existe(n.id));
                return nodos.length ? insertar(c, op.padre, op.indice, nodos) : false;
            }
            const f = buscar(c, op.id);
            if (!f) return false;
            if (op.accion === 'editar') {
                if (op.texto != null) f.nodo.texto = op.texto;
                if (op.hecha !== undefined) { marcar(f.nodo, op.hecha); if (op.conSubtareas) todas(f.nodo.hijos).forEach(n => marcar(n, op.hecha)); }
                if (op.plegada !== undefined) { if (op.plegada) f.nodo.plegada = true; else delete f.nodo.plegada; }
                return true;
            }
            if (op.accion === 'borrar') { f.hermanos.splice(f.indice, 1); return true; }
            if (op.accion === 'mover') {
                const destino = caja(op.aLista || op.lista);
                if (!destino || (op.padre && (op.padre === f.nodo.id || todas(f.nodo.hijos).some(n => n.id === op.padre)))) return false;
                f.hermanos.splice(f.indice, 1);
                if (insertar(destino, op.padre, op.indice, [f.nodo])) return true;
                f.hermanos.splice(f.indice, 0, f.nodo);
                return false;
            }
            return false;
        }

        // ---------- pintar ----------
        function renderPanoramaListas() {
            listasNormalizar();
            // Si se repinta Panorama mientras escribes (llega algo de la nube), se devuelve el cursor a su sitio.
            const activo = document.activeElement?.closest?.('.lst-fila');
            if (activo && document.activeElement.classList.contains('lst-texto')) {
                const id = activo.dataset.id, pos = listaCursor(document.activeElement);
                requestAnimationFrame(() => listaEnfocar(id, pos));
            }
            const cajas = listasDatos();
            return `<section class="lst" id="pano-listas" aria-label="listas">
                <div class="lst-cab"><b>listas.</b><small>${cajas.length ? 'Enter añade, Tab y Mayús+Tab cambian de nivel.' : 'Cajas de tareas con subtareas, para organizarte.'}</small><button type="button" class="vista-btn lst-nueva-caja" onclick="listaCrearCaja()"><i class="ico ico-mas" aria-hidden="true"></i>nueva lista.</button></div>
                ${cajas.length ? `<div class="lst-rejilla">${cajas.map(renderListaCaja).join('')}</div>` : ''}
            </section>`;
        }

        function renderListaCaja(c) {
            const todas = listaTodas(c.tareas), hechas = todas.filter(n => n.hecha).length;
            const filas = [], enHoy = listaIdsEnHoy();
            const pintar = (arr, nivel) => arr.forEach(n => {
                if (c.ocultarHechas && n.hecha) return;
                filas.push(renderListaFila(c, n, nivel, enHoy));
                if (!n.plegada) pintar(n.hijos || [], nivel + 1);
            });
            pintar(c.tareas, 0);
            const ocultas = c.ocultarHechas ? hechas : 0;
            return `<article class="lst-caja" id="lst-caja-${escapeHtml(c.id)}" data-caja="${escapeHtml(c.id)}" ondragover="listaSobreCaja(event)" ondrop="listaSoltarEnCaja(event)" ondragleave="listaDejarCaja(event)">
                <header class="lst-caja-cab">
                    <span class="lst-asa lst-asa-caja" draggable="true" ondragstart="listaEmpezarCaja(event)" ondragend="listaAcabarArrastre()" title="arrastrar para ordenar"><i class="ico ico-asa" aria-hidden="true"></i></span>
                    <span class="lst-caja-nombre" onclick="if (event.target === this) this.firstElementChild.focus()"><span class="lst-caja-titulo${listaColor(c.color) ? ' tinta' : ''}"${listaColor(c.color) ? ` style="--lst-tinta:${listaColor(c.color)}"` : ''} contenteditable="plaintext-only" spellcheck="false" role="textbox" aria-label="nombre de la lista" data-ph="sin nombre." onkeydown="listaTeclaTitulo(event)" onblur="listaRenombrar(this)">${escapeHtml(c.titulo || '')}</span></span>
                    ${todas.length ? `<span class="lst-caja-cuenta${hechas === todas.length ? ' lleno' : ''}">${hechas}/${todas.length}</span>` : ''}
                    <button type="button" class="lst-boton" aria-label="opciones de la lista" onclick="listaMenuCaja(this)"><i class="ico ico-puntos" aria-hidden="true"></i></button>
                </header>
                <div class="lst-arbol" role="tree">${filas.join('') || (ocultas ? '' : '<p class="lst-vacia">Vacía. Escribe abajo la primera tarea.</p>')}</div>
                ${ocultas ? `<button type="button" class="lst-ocultas" onclick="listaAlternarHechas(this)">${ocultas === 1 ? '1 hecha oculta' : ocultas + ' hechas ocultas'}. ver.</button>` : ''}
                <label class="lst-anadir"><i class="ico ico-mas" aria-hidden="true"></i><input type="text" class="lst-nueva" placeholder="añadir tarea." aria-label="añadir tarea a ${escapeHtml(c.titulo || 'la lista')}" onkeydown="listaTeclaNueva(event)" onpaste="listaPegarNueva(event)"></label>
            </article>`;
        }

        function renderListaFila(c, n, nivel, enHoy = new Set()) {
            const hijos = n.hijos || [];
            const hechasH = hijos.filter(h => h.hecha).length;
            const cuenta = hijos.length ? `<span class="lst-cuenta${hechasH === hijos.length ? ' lleno' : ''}" title="subtareas hechas">${hechasH}/${hijos.length}</span>` : '';
            return `<div class="lst-fila${n.hecha ? ' hecha' : ''}" role="treeitem" aria-level="${nivel + 1}"${hijos.length ? ` aria-expanded="${!n.plegada}"` : ''} data-id="${escapeHtml(n.id)}" data-caja="${escapeHtml(c.id)}" data-nivel="${nivel}" style="--nivel:${nivel}" ondragover="listaSobreFila(event)" ondragleave="listaDejarFila(event)" ondrop="listaSoltarEnFila(event)">
                <span class="lst-asa" draggable="true" ondragstart="listaEmpezarTarea(event)" ondragend="listaAcabarArrastre()" title="arrastrar"><i class="ico ico-asa" aria-hidden="true"></i></span>
                ${hijos.length ? `<button type="button" class="lst-plegar${n.plegada ? ' plegada' : ''}" aria-label="${n.plegada ? 'desplegar' : 'plegar'}" onclick="listaPlegar(this)"><i class="ico ico-der" aria-hidden="true"></i></button>` : '<span class="lst-plegar vacio" aria-hidden="true"></span>'}
                <button type="button" class="lst-check${n.hecha ? ' on' : ''}" role="checkbox" aria-checked="${!!n.hecha}" aria-label="hecha" onclick="listaMarcar(this)"></button>
                <span class="lst-texto" contenteditable="plaintext-only" spellcheck="false" role="textbox" aria-label="tarea" data-ph="escribe." onkeydown="listaTecla(event)" oninput="listaEscribir(this)" onblur="listaSoltarTexto(this)" onpaste="listaPegar(event)">${escapeHtml(n.texto || '')}</span>
                ${cuenta}
                ${n.hecha ? '' : enHoy.has(n.id) ? '<span class="lst-en-hoy">en hoy.</span>' : '<button type="button" class="lst-boton lst-hoy" title="llevar a hoy en el planificador" onclick="listaAHoy(this)">→ hoy</button>'}
                ${nivel < LISTAS_NIVELES - 1 ? '<button type="button" class="lst-boton lst-sub" aria-label="añadir subtarea" title="añadir subtarea" onclick="listaNuevaSubtarea(this)"><i class="ico ico-mas" aria-hidden="true"></i></button>' : ''}
                <button type="button" class="lst-boton lst-borrar" aria-label="borrar tarea" onclick="listaBorrarTarea(this)"><i class="ico ico-x" aria-hidden="true"></i></button>
            </div>`;
        }

        function listaRepintarCaja(cajaId, foco) {
            const c = listaCaja(cajaId), el = document.getElementById('lst-caja-' + cajaId);
            if (!c || !el) return listasRepintar(foco);
            listaRepintando = true;
            el.outerHTML = renderListaCaja(c);
            listaRepintando = false;
            if (foco) listaEnfocar(...foco);
        }
        function listasRepintar(foco) {
            const el = document.getElementById('pano-listas');
            if (!el) return;
            listaRepintando = true;
            el.outerHTML = renderPanoramaListas();
            listaRepintando = false;
            if (foco) listaEnfocar(...foco);
        }

        function listaCursor(el) {
            const s = getSelection();
            if (!s.rangeCount || !el.contains(s.anchorNode)) return (el.textContent || '').length;
            const r = s.getRangeAt(0).cloneRange();
            r.selectNodeContents(el);
            r.setEnd(s.anchorNode, s.anchorOffset);
            return r.toString().length;
        }
        function listaPonerCursor(el, pos) {
            el.focus({ preventScroll: false });
            const t = el.firstChild;
            const r = document.createRange();
            if (t && t.nodeType === 3) r.setStart(t, Math.max(0, Math.min(pos ?? t.length, t.length)));
            else r.setStart(el, 0);
            r.collapse(true);
            const s = getSelection();
            s.removeAllRanges();
            s.addRange(r);
        }
        function listaEnfocar(id, pos) {
            const el = document.querySelector(`.lst-fila[data-id="${CSS.escape(id)}"] .lst-texto`);
            if (el) listaPonerCursor(el, pos);
        }
        const listaDe = el => {
            const f = el.closest('.lst-fila, .lst-caja');
            const caja = listaCaja(f?.dataset.caja);
            return { fila: f?.classList.contains('lst-fila') ? f : null, caja, id: f?.classList.contains('lst-fila') ? f.dataset.id : null };
        };

        // ---------- cajas ----------
        function listaCrearCaja() {
            const c = { id: listaNuevoId('lst'), titulo: '', tareas: [] };
            listasDatos().push(c);
            listasRepintar();
            document.querySelector(`#lst-caja-${CSS.escape(c.id)} .lst-caja-titulo`)?.focus();
            listasGuardar();
        }
        function listaTeclaTitulo(e) {
            if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault();
                const caja = e.target.closest('.lst-caja');
                e.target.blur();
                if (e.key === 'Enter') caja?.querySelector('.lst-nueva')?.focus();
            }
        }
        function listaRenombrar(el) {
            if (listaRepintando) return;
            const { caja } = listaDe(el);
            if (!caja) return;
            const t = el.textContent.replace(/\s+/g, ' ').trim();
            if (!t) el.textContent = '';
            if (t === (caja.titulo || '')) return;
            caja.titulo = t;
            listasGuardar();
        }
        function listaMenuCaja(boton) {
            const { caja } = listaDe(boton);
            if (!caja) return;
            const cajas = listasDatos(), i = cajas.indexOf(caja);
            const hayHijos = listaTodas(caja.tareas).some(n => (n.hijos || []).length);
            abrirMenuAcciones(boton, [
                ['color del título.', () => listaElegirColor(caja.id)],
                [caja.ocultarHechas ? 'mostrar las hechas.' : 'ocultar las hechas.', () => listaAlternarHechas(boton)],
                ...(hayHijos ? [['plegar todo.', () => listaPlegarTodo(caja.id, true)], ['desplegar todo.', () => listaPlegarTodo(caja.id, false)]] : []),
                ...(listaTodas(caja.tareas).some(n => n.hecha) ? [['quitar las hechas.', () => listaQuitarHechas(caja.id)]] : []),
                ...(i > 0 ? [['mover antes.', () => listaMoverCaja(caja.id, -1)]] : []),
                ...(i < cajas.length - 1 ? [['mover después.', () => listaMoverCaja(caja.id, 1)]] : []),
                ['eliminar lista.', () => listaConfirmarBorrarCaja(caja.id)],
            ]);
        }
        function listaElegirColor(cajaId) {
            const c = listaCaja(cajaId);
            if (!c) return;
            const id = jsAttr(cajaId);
            showModal(`<div class="modal-title">color del título.</div>
                <p class="finance-modal-note" style="margin-top:0">Un subrayado suave bajo «${escapeHtml(c.titulo || 'sin nombre')}».</p>
                <div class="lst-colores">${LISTAS_COLORES.map(([k, hex]) => `<button type="button" class="lst-color${c.color === k ? ' on' : ''}" style="--lst-tinta:${hex}" aria-pressed="${c.color === k}" onclick="listaPonerColor('${id}', '${k}')"><span class="lst-color-muestra">${escapeHtml(c.titulo || 'lista')}</span><small>${k}.</small></button>`).join('')}</div>
                <button class="btn-secondary" style="margin-top:12px" onclick="listaPonerColor('${id}', '')">sin color.</button>`);
        }
        function listaPonerColor(cajaId, color) {
            const c = listaCaja(cajaId);
            closeModal();
            if (!c) return;
            if (color) c.color = color; else delete c.color;
            listaRepintarCaja(cajaId);
            listasGuardar();
        }
        function listaNuevaSubtarea(boton) {
            const { caja, id } = listaDe(boton);
            const f = listaBuscar(caja, id);
            if (!f || f.nivel + 1 >= LISTAS_NIVELES) return;
            const nuevo = listaNodo('');
            listaHijos(f.nodo).push(nuevo);
            delete f.nodo.plegada;
            listaRepintarCaja(caja.id, [nuevo.id, 0]);
        }
        function listaAlternarHechas(el) {
            const { caja } = listaDe(el);
            if (!caja) return;
            if (caja.ocultarHechas) delete caja.ocultarHechas; else caja.ocultarHechas = true;
            listaRepintarCaja(caja.id);
            listasGuardar();
        }
        function listaPlegarTodo(cajaId, plegar) {
            const c = listaCaja(cajaId);
            listaTodas(c.tareas).forEach(n => { if (plegar && (n.hijos || []).length) n.plegada = true; else delete n.plegada; });
            listaRepintarCaja(cajaId);
            listasGuardar();
        }
        function listaQuitarHechas(cajaId) {
            const c = listaCaja(cajaId);
            const antes = JSON.parse(JSON.stringify(c.tareas));
            const filtrar = arr => arr.filter(n => !n.hecha).map(n => (n.hijos && (n.hijos = filtrar(n.hijos)), n));
            const n = listaTodas(c.tareas).length;
            c.tareas = filtrar(c.tareas);
            const quitadas = n - listaTodas(c.tareas).length;
            listaRepintarCaja(cajaId);
            listasGuardar();
            listaOfrecerDeshacer(`${quitadas === 1 ? 'Quitada 1 tarea hecha' : `Quitadas ${quitadas} tareas hechas`}.`, () => { const cc = listaCaja(cajaId); if (cc) cc.tareas = antes; });
        }
        function listaMoverCaja(cajaId, d) {
            const cajas = listasDatos(), i = cajas.findIndex(c => c.id === cajaId), j = i + d;
            if (i < 0 || j < 0 || j >= cajas.length) return;
            [cajas[i], cajas[j]] = [cajas[j], cajas[i]];
            listasRepintar();
            listasGuardar();
        }
        function listaConfirmarBorrarCaja(cajaId) {
            const c = listaCaja(cajaId);
            if (!c) return;
            const n = listaTodas(c.tareas).length;
            if (!n) return listaBorrarCaja(cajaId);
            showModal(`<div class="modal-title">eliminar lista.</div>
                <p class="finance-modal-note" style="margin-top:0">Se borra «${escapeHtml(c.titulo || 'sin nombre')}» con ${n === 1 ? 'su tarea' : `sus ${n} tareas`}. Podrás deshacerlo unos segundos.</p>
                <button class="btn-modal-primary btn-peligro" onclick="closeModal(); listaBorrarCaja('${jsAttr(cajaId)}')">eliminar.</button>
                <button class="btn-secondary" style="margin-top:8px" onclick="closeModal()">cancelar.</button>`);
        }
        function listaBorrarCaja(cajaId) {
            const cajas = listasDatos(), i = cajas.findIndex(c => c.id === cajaId);
            if (i < 0) return;
            const [c] = cajas.splice(i, 1);
            listasRepintar();
            listasGuardar();
            listaOfrecerDeshacer(`Lista «${c.titulo || 'sin nombre'}» eliminada.`, () => { listasDatos().splice(Math.min(i, listasDatos().length), 0, c); });
        }

        // ---------- tareas ----------
        const listaNodo = texto => ({ id: listaNuevoId('lt'), texto, hecha: false, hijos: [] });

        function listaTeclaNueva(e) {
            if (e.key !== 'Enter' || e.isComposing) return;
            e.preventDefault();
            const input = e.target, { caja } = listaDe(input);
            const t = input.value.replace(/\s+/g, ' ').trim();
            if (!caja || !t) return;
            caja.tareas.push(listaNodo(t));
            listaRepintarCaja(caja.id);
            document.querySelector(`#lst-caja-${CSS.escape(caja.id)} .lst-nueva`)?.focus();
            listasGuardar();
        }
        function listaPegarNueva(e) {
            const lineas = (e.clipboardData?.getData('text') || '').split(/\r?\n/).map(l => l.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ x]\])\s*/i, '').trim()).filter(Boolean);
            if (lineas.length < 2) return;
            e.preventDefault();
            const { caja } = listaDe(e.target);
            if (!caja) return;
            lineas.forEach(l => caja.tareas.push(listaNodo(l)));
            listaRepintarCaja(caja.id);
            document.querySelector(`#lst-caja-${CSS.escape(caja.id)} .lst-nueva`)?.focus();
            listasGuardar();
        }
        function listaPegar(e) {
            const texto = e.clipboardData?.getData('text') || '';
            e.preventDefault();
            const lineas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            if (lineas.length < 2) { document.execCommand('insertText', false, texto.replace(/\s+/g, ' ')); return; }
            const { caja, id } = listaDe(e.target);
            const f = listaBuscar(caja, id);
            if (!f) return;
            f.nodo.texto = (e.target.textContent + ' ' + lineas[0]).trim();
            const nuevos = lineas.slice(1).map(listaNodo);
            f.hermanos.splice(f.indice + 1, 0, ...nuevos);
            listaRepintarCaja(caja.id, [nuevos[nuevos.length - 1].id]);
            listasGuardar();
        }
        function listaEscribir(el) {
            const { caja, id } = listaDe(el);
            const f = listaBuscar(caja, id);
            if (!f) return;
            f.nodo.texto = el.textContent.replace(/\s+/g, ' ');
            listaSucia = true;
        }
        function listaSoltarTexto(el) {
            if (listaRepintando || !el.isConnected) return;
            const { caja, id } = listaDe(el);
            const f = listaBuscar(caja, id);
            if (!f) return;
            const t = (f.nodo.texto || '').trim();
            if (t !== f.nodo.texto) { f.nodo.texto = t; listaSucia = true; }
            // Una fila que se creó con Enter y se dejó vacía no se guarda.
            if (!t && !(f.nodo.hijos || []).length) {
                f.hermanos.splice(f.indice, 1);
                el.closest('.lst-fila')?.remove();
                listasGuardar();
                return;
            }
            if (listaSucia) listasGuardar();
        }

        function listaTecla(e) {
            if (e.isComposing) return;
            const el = e.target, { caja, id } = listaDe(el);
            const f = listaBuscar(caja, id);
            if (!f) return;
            const n = f.nodo;
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); listaAplicarMarca(caja, n, !n.hecha, false); return; }
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const texto = el.textContent, pos = listaCursor(el);
                // Vacía y con sangría: Enter la saca un nivel, como en un esquema.
                if (!texto.trim() && f.padre && !(n.hijos || []).length) return listaQuitarSangria(caja, id);
                if (!texto.trim() && !f.padre) { el.blur(); el.closest('.lst-caja')?.querySelector('.lst-nueva')?.focus(); return; }
                const nuevo = listaNodo(texto.slice(pos).trim());
                n.texto = texto.slice(0, pos).trim();
                if (pos === 0 && texto.trim()) { nuevo.texto = ''; n.texto = texto.trim(); f.hermanos.splice(f.indice, 0, nuevo); listaRepintarCaja(caja.id, [n.id, 0]); }
                else if ((n.hijos || []).length && !n.plegada && !nuevo.texto) { n.hijos.unshift(nuevo); listaRepintarCaja(caja.id, [nuevo.id, 0]); }
                else { f.hermanos.splice(f.indice + 1, 0, nuevo); listaRepintarCaja(caja.id, [nuevo.id, 0]); }
                listasGuardar();
                return;
            }
            if (e.key === 'Tab') {
                e.preventDefault();
                n.texto = el.textContent.replace(/\s+/g, ' ');
                return e.shiftKey ? listaQuitarSangria(caja, id) : listaSangrar(caja, id);
            }
            if (e.key === 'Backspace' && !el.textContent && !(n.hijos || []).length) {
                e.preventDefault();
                const filas = [...el.closest('.lst-arbol').querySelectorAll('.lst-fila')];
                const previa = filas[filas.indexOf(el.closest('.lst-fila')) - 1]?.dataset.id;
                f.hermanos.splice(f.indice, 1);
                listaRepintarCaja(caja.id, previa ? [previa] : null);
                if (!previa) el.closest('.lst-caja')?.querySelector('.lst-nueva')?.focus();
                listasGuardar();
                return;
            }
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) {
                e.preventDefault();
                const j = f.indice + (e.key === 'ArrowUp' ? -1 : 1);
                if (j < 0 || j >= f.hermanos.length) return;
                [f.hermanos[f.indice], f.hermanos[j]] = [f.hermanos[j], f.hermanos[f.indice]];
                listaRepintarCaja(caja.id, [id, listaCursor(el)]);
                listasGuardar();
                return;
            }
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                const filas = [...el.closest('.lst-arbol').querySelectorAll('.lst-texto')];
                const otra = filas[filas.indexOf(el) + (e.key === 'ArrowUp' ? -1 : 1)];
                if (otra) { e.preventDefault(); listaPonerCursor(otra, Math.min(listaCursor(el), otra.textContent.length)); }
                else if (e.key === 'ArrowDown') { e.preventDefault(); el.closest('.lst-caja')?.querySelector('.lst-nueva')?.focus(); }
                return;
            }
            if (e.key === 'Escape') { e.preventDefault(); el.blur(); }
        }

        function listaAvisoNiveles() { showToast(`Como mucho, ${LISTAS_NIVELES} niveles.`); }
        function listaSangrar(caja, id) {
            const f = listaBuscar(caja, id);
            if (!f || f.indice === 0) return;
            if (f.nivel + 1 + listaAltura(f.nodo) > LISTAS_NIVELES) return listaAvisoNiveles();
            const previa = f.hermanos[f.indice - 1];
            const pos = listaCursor(document.activeElement);
            f.hermanos.splice(f.indice, 1);
            listaHijos(previa).push(f.nodo);
            delete previa.plegada;
            listaRepintarCaja(caja.id, [id, pos]);
            listasGuardar();
        }
        function listaQuitarSangria(caja, id) {
            const f = listaBuscar(caja, id);
            if (!f || !f.padre) return;
            const p = listaBuscar(caja, f.padre.id);
            const pos = listaCursor(document.activeElement);
            f.hermanos.splice(f.indice, 1);
            p.hermanos.splice(p.indice + 1, 0, f.nodo);
            listaRepintarCaja(caja.id, [id, pos]);
            listasGuardar();
        }
        function listaPlegar(boton) {
            const { caja, id } = listaDe(boton);
            const f = listaBuscar(caja, id);
            if (!f) return;
            if (f.nodo.plegada) delete f.nodo.plegada; else f.nodo.plegada = true;
            listaRepintarCaja(caja.id);
            document.querySelector(`.lst-fila[data-id="${CSS.escape(id)}"] .lst-plegar`)?.focus();
            listasGuardar();
        }

        function listaMarcar(boton) {
            const { caja, id } = listaDe(boton);
            const f = listaBuscar(caja, id);
            if (!f) return;
            const pendientes = listaTodas(f.nodo.hijos).filter(n => !n.hecha).length;
            if (!f.nodo.hecha && pendientes) {
                return abrirMenuAcciones(boton, [
                    [pendientes === 1 ? 'marcar también su subtarea.' : `marcar también sus ${pendientes} subtareas.`, () => listaAplicarMarca(caja, f.nodo, true, true)],
                    ['marcar solo esta.', () => listaAplicarMarca(caja, f.nodo, true, false)],
                ]);
            }
            listaAplicarMarca(caja, f.nodo, !f.nodo.hecha, false);
        }
        function listaAplicarMarca(caja, nodo, hecha, conHijas) {
            const ahora = new Date().toISOString();
            const poner = n => { if (hecha) { if (!n.hecha) { n.hecha = true; n.hechaEn = ahora; } } else { n.hecha = false; delete n.hechaEn; } };
            poner(nodo);
            if (conHijas) listaTodas(nodo.hijos).forEach(poner);
            listaRepintarCaja(caja.id);
            const tocadas = new Set([nodo, ...(conHijas ? listaTodas(nodo.hijos) : [])].map(n => n.id));
            if (typeof plannerItemsForOffset === 'function') plannerItemsForOffset(0).filter(it => tocadas.has(it.listaTareaId) && !!it.done !== hecha).forEach(it => togglePlannerItemDone(it.id, 0));
            if (hecha) document.querySelector(`.lst-fila[data-id="${CSS.escape(nodo.id)}"] .lst-check`)?.classList.add('sella');
            if (typeof haptico === 'function' && hecha) haptico('suave');
            listasGuardar();
        }

        function listaBorrarTarea(boton) {
            const { caja, id } = listaDe(boton);
            const f = listaBuscar(caja, id);
            if (!f) return;
            const padreId = f.padre?.id || null, indice = f.indice, nodo = f.nodo;
            f.hermanos.splice(indice, 1);
            listaRepintarCaja(caja.id);
            listasGuardar();
            const sub = listaTodas(nodo.hijos).length;
            listaOfrecerDeshacer(`Borrada «${(nodo.texto || 'sin texto').slice(0, 40)}»${sub ? ` y ${sub === 1 ? 'su subtarea' : `sus ${sub} subtareas`}` : ''}.`, () => {
                const c = listaCaja(caja.id);
                if (!c) return;
                const destino = padreId ? listaBuscar(c, padreId)?.nodo : null;
                const arr = destino ? listaHijos(destino) : c.tareas;
                arr.splice(Math.min(indice, arr.length), 0, nodo);
            });
        }

        // Enlace con el planificador, como «→ hoy» en Proyectos: la tarea del día guarda listaId y listaTareaId, y marcarla
        // en un sitio la marca en el otro (togglePlannerItemDone llama a listaTareaDesdePlanner).
        function listaIdsEnHoy() {
            return new Set(typeof plannerItemsForOffset === 'function' ? plannerItemsForOffset(0).filter(it => it.listaTareaId).map(it => it.listaTareaId) : []);
        }
        function listaAHoy(boton) {
            const { caja, id } = listaDe(boton);
            const f = listaBuscar(caja, id);
            if (!f) return;
            const hoy = plannerItemsForOffset(0);
            if (hoy.some(it => it.listaTareaId === id)) { showToast('Ya está en el planificador de hoy'); return; }
            const texto = (f.nodo.texto || '').trim() || 'tarea';
            hoy.push({ id: 'planner_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), time: '', title: caja.titulo ? `${caja.titulo}: ${texto}` : texto, notes: '', done: false, listaId: caja.id, listaTareaId: id });
            listaRepintarCaja(caja.id);
            showToast('Añadida a hoy en el planificador');
            listasGuardar();
        }
        function listaTareaDesdePlanner(cajaId, id, hecha) {
            const f = listaBuscar(listaCaja(cajaId), id);
            if (!f || !!f.nodo.hecha === !!hecha) return;
            if (hecha) { f.nodo.hecha = true; f.nodo.hechaEn = new Date().toISOString(); } else { f.nodo.hecha = false; delete f.nodo.hechaEn; }
        }

        // Barra de deshacer propia: el toast de la app no lleva botón.
        function listaOfrecerDeshacer(texto, deshacer) {
            document.getElementById('lst-deshacer')?.remove();
            clearTimeout(listaOfrecerDeshacer.t);
            listaDeshacerDatos = deshacer;
            const barra = document.createElement('div');
            barra.id = 'lst-deshacer';
            barra.className = 'lst-deshacer';
            barra.setAttribute('role', 'status');
            barra.innerHTML = `<span>${escapeHtml(texto)}</span><button type="button" onclick="listaDeshacer()">deshacer.</button>`;
            document.body.appendChild(barra);
            listaOfrecerDeshacer.t = setTimeout(() => { barra.remove(); listaDeshacerDatos = null; }, 7000);
        }
        function listaDeshacer() {
            const f = listaDeshacerDatos;
            listaDeshacerDatos = null;
            document.getElementById('lst-deshacer')?.remove();
            if (!f) return;
            f();
            listasRepintar();
            listasGuardar();
        }

        // ---------- arrastrar ----------
        // Tareas: arriba o abajo de una fila la pone delante o detrás (mismo padre que esa fila); en el centro, dentro,
        // como su última subtarea. Vale también entre cajas. Cajas: se sueltan delante o detrás de otra.
        function listaEmpezarTarea(e) {
            const { caja, id, fila } = listaDe(e.target);
            listaArrastre = { tipo: 'tarea', cajaId: caja.id, id };
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', fila.querySelector('.lst-texto').textContent);
            e.dataTransfer.setDragImage(fila, 16, 14);
            requestAnimationFrame(() => fila.classList.add('arrastrando'));
        }
        function listaEmpezarCaja(e) {
            const caja = e.target.closest('.lst-caja');
            listaArrastre = { tipo: 'caja', cajaId: caja.dataset.caja };
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', caja.querySelector('.lst-caja-titulo').textContent);
            e.dataTransfer.setDragImage(caja, 24, 20);
            requestAnimationFrame(() => caja.classList.add('arrastrando'));
        }
        function listaLimpiarMarcas() {
            document.querySelectorAll('.lst .drop-antes, .lst .drop-despues, .lst .drop-dentro, .lst .drop-final').forEach(x => x.classList.remove('drop-antes', 'drop-despues', 'drop-dentro', 'drop-final'));
        }
        function listaAcabarArrastre() {
            listaArrastre = null;
            listaLimpiarMarcas();
            document.querySelectorAll('.lst .arrastrando').forEach(x => x.classList.remove('arrastrando'));
        }
        function listaDondeSoltar(e, fila) {
            const a = listaArrastre;
            if (!a || a.tipo !== 'tarea') return null;
            const origen = listaBuscar(listaCaja(a.cajaId), a.id), caja = listaCaja(fila.dataset.caja);
            const destino = listaBuscar(caja, fila.dataset.id);
            if (!origen || !destino || destino.nodo === origen.nodo || listaContiene(origen.nodo, destino.nodo.id)) return null;
            const r = fila.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
            let modo = y < .3 ? 'antes' : y > .7 ? 'despues' : 'dentro';
            const alto = listaAltura(origen.nodo);
            if (modo === 'dentro' && destino.nivel + 1 + alto > LISTAS_NIVELES) modo = y < .5 ? 'antes' : 'despues';
            if (modo !== 'dentro' && destino.nivel + alto > LISTAS_NIVELES) return null;
            return { modo, origen, destino, caja };
        }
        function listaSobreFila(e) {
            if (!listaArrastre || listaArrastre.tipo !== 'tarea') return;
            const fila = e.currentTarget, d = listaDondeSoltar(e, fila);
            e.stopPropagation();
            listaLimpiarMarcas();
            if (!d) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            fila.classList.add('drop-' + d.modo);
        }
        function listaDejarFila(e) {
            if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('drop-antes', 'drop-despues', 'drop-dentro');
        }
        function listaSoltarEnFila(e) {
            const d = listaArrastre && listaDondeSoltar(e, e.currentTarget);
            if (!d) return;
            e.preventDefault();
            e.stopPropagation();
            const { origen, destino, caja, modo } = d;
            const cajaOrigen = listaArrastre.cajaId;
            origen.hermanos.splice(origen.indice, 1);
            const aqui = listaBuscar(caja, destino.nodo.id);
            if (modo === 'dentro') { listaHijos(aqui.nodo).push(origen.nodo); delete aqui.nodo.plegada; }
            else aqui.hermanos.splice(aqui.indice + (modo === 'despues' ? 1 : 0), 0, origen.nodo);
            listaAcabarArrastre();
            if (cajaOrigen !== caja.id) listaRepintarCaja(cajaOrigen);
            listaRepintarCaja(caja.id);
            listasGuardar();
        }
        // Sobre la caja (fuera de las filas): una tarea va al final del primer nivel; una caja, delante o detrás.
        function listaSobreCaja(e) {
            const a = listaArrastre, caja = e.currentTarget;
            if (!a) return;
            if (a.tipo === 'tarea') {
                const origen = listaBuscar(listaCaja(a.cajaId), a.id);
                if (!origen || listaAltura(origen.nodo) > LISTAS_NIVELES) return;
                e.preventDefault();
                listaLimpiarMarcas();
                caja.classList.add('drop-final');
                return;
            }
            if (caja.dataset.caja === a.cajaId) return;
            e.preventDefault();
            const r = caja.getBoundingClientRect();
            listaLimpiarMarcas();
            caja.classList.add(e.clientX < r.left + r.width / 2 ? 'drop-antes' : 'drop-despues');
        }
        function listaDejarCaja(e) {
            if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('drop-antes', 'drop-despues', 'drop-final');
        }
        function listaSoltarEnCaja(e) {
            const a = listaArrastre, el = e.currentTarget;
            if (!a) return;
            e.preventDefault();
            const destinoId = el.dataset.caja;
            if (a.tipo === 'tarea') {
                const origen = listaBuscar(listaCaja(a.cajaId), a.id), destino = listaCaja(destinoId);
                if (!origen || !destino) return listaAcabarArrastre();
                origen.hermanos.splice(origen.indice, 1);
                destino.tareas.push(origen.nodo);
                const cajaOrigen = a.cajaId;
                listaAcabarArrastre();
                if (cajaOrigen !== destinoId) listaRepintarCaja(cajaOrigen);
                listaRepintarCaja(destinoId);
                listasGuardar();
                return;
            }
            if (destinoId === a.cajaId) return listaAcabarArrastre();
            const despues = el.classList.contains('drop-despues');
            const cajas = listasDatos(), i = cajas.findIndex(c => c.id === a.cajaId);
            const [movida] = cajas.splice(i, 1);
            const j = cajas.findIndex(c => c.id === destinoId);
            cajas.splice(j + (despues ? 1 : 0), 0, movida);
            listaAcabarArrastre();
            listasRepintar();
            listasGuardar();
        }
