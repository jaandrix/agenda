        // ============================================================
        //  COLECCIONABLES
        // ============================================================

        function collectibleCategoryName(catId) {
            const cat = collectibleCategories.find(c => c.id === catId);
            return cat ? cat.name : 'Sin categoría';
        }

        // ============================================================
        //  COLECCIONABLES — inventario en lista
        //  Pensado para colecciones grandes: cabecera con el total, filtro
        //  por categoría, buscador y orden; cada categoría en un panel con
        //  sus objetos como tarjetitas a dos columnas (nombre, estado y
        //  valor; el set y el número quedan para la ficha). Sin scroll infinito: cada categoría enseña sus 12
        //  primeras según el orden y "ver las N restantes." despliega el
        //  resto. Buscar, ordenar y filtrar solo vuelven a pintar la lista
        //  (#coll-lista), para no perder el foco del buscador.
        // ============================================================
        const COLL_LIMITE = 12;
        const CARTA_ESTADO_CORTO = { 'Sellado': 'sellado', 'Mint': 'M', 'Near Mint': 'NM', 'Excellent': 'EX', 'Good': 'GD', 'Light Played': 'LP', 'Played': 'PL', 'Poor': 'PO' };
        const CARTA_ESTADO_TONO = { 'Sellado': 'sellado', 'Mint': 'alto', 'Near Mint': 'alto', 'Excellent': 'medio', 'Good': 'medio', 'Light Played': 'bajo', 'Played': 'bajo', 'Poor': 'bajo' };
        let collFiltroCat = 'all';
        let collOrden = 'valor';
        let collBusqueda = '';
        const collExpandidas = new Set();

        function renderCollectibles() {
            if (!Array.isArray(collectibleCategories) || !collectibleCategories.length) {
                collectibleCategories = [{ id: 'cat_cartas', name: 'Cartas' }, { id: 'cat_videojuegos', name: 'Videojuegos' }];
            }
            if (!Array.isArray(collectibles)) collectibles = [];
            if (collFiltroCat !== 'all' && !collectibleCategories.some(c => c.id === collFiltroCat)) collFiltroCat = 'all';
            const chip = (id, nombre, n) => `<button class="coll-chip ${collFiltroCat === id ? 'active' : ''}" data-cat="${id}" onclick="setCollFiltro('${id}')">${escapeHtml(nombre)}. <span>${n}</span></button>`;
            const conCategoria = collectibleCategories.filter(cat => collectibles.some(c => c.category === cat.id)).length;

            return `
            <div class="coll-vista">
                <div class="coll-cabecera">
                    <div>
                        <div class="coll-titulo">tu colección.</div>
                        <div class="coll-total-sub">${collectibles.length} ${collectibles.length === 1 ? 'objeto' : 'objetos'} en ${conCategoria} ${conCategoria === 1 ? 'categoría' : 'categorías'}.</div>
                    </div>
                    <div class="coll-acciones">
                        <button class="finance-oneoff-btn" onclick="openAddCollectibleCategory()">+ categoría.</button>
                        <button class="btn-modal-primary" onclick="openAddCollectible()">+ coleccionable.</button>
                    </div>
                </div>
                <div class="coll-controles">
                    <div class="coll-chips">
                        ${chip('all', 'todas', collectibles.length)}
                        ${collectibleCategories.map(cat => chip(cat.id, cat.name.toLowerCase(), collectibles.filter(c => c.category === cat.id).length)).join('')}
                    </div>
                    <div class="coll-busqueda">
                        <input class="modal-input" type="search" placeholder="Buscar por nombre, set o número…" value="${escapeHtml(collBusqueda)}" oninput="setCollBusqueda(this.value)">
                        <select class="modal-input" onchange="setCollOrden(this.value)">
                            <option value="valor" ${collOrden === 'valor' ? 'selected' : ''}>Valor ↓</option>
                            <option value="nombre" ${collOrden === 'nombre' ? 'selected' : ''}>Nombre</option>
                            <option value="recientes" ${collOrden === 'recientes' ? 'selected' : ''}>Recientes</option>
                        </select>
                    </div>
                </div>
                <div id="coll-lista">${renderCollLista()}</div>
            </div>`;
        }

        function collOrdenar(items) {
            const valor = c => Number(c.value) || 0;
            if (collOrden === 'nombre') return items.sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
            if (collOrden === 'recientes') return items.sort((a, b) => String(b.createdAt || b.id).localeCompare(String(a.createdAt || a.id)));
            return items.sort((a, b) => valor(b) - valor(a) || String(a.name).localeCompare(String(b.name), 'es'));
        }

        function collCoincide(c, q) {
            if (!q) return true;
            const texto = stripAccents([c.name, c.carta?.set, c.carta?.numero, c.carta?.anio].filter(Boolean).join(' ').toLowerCase());
            return texto.includes(q);
        }

        function renderCollLista() {
            if (!collectibles.length) return `<div class="finance-empty-state">Aún no has añadido coleccionables. Pulsa <strong>+ coleccionable.</strong> para empezar tu catálogo.</div>`;
            const q = stripAccents(collBusqueda.trim().toLowerCase());
            const bloques = collectibleCategories.filter(cat => collFiltroCat === 'all' || cat.id === collFiltroCat).map(cat => {
                const todos = collectibles.filter(c => c.category === cat.id);
                const items = collOrdenar(todos.filter(c => collCoincide(c, q)));
                if (!items.length) return '';
                const maxVal = Math.max(...todos.map(c => Number(c.value) || 0));
                const subtotal = items.reduce((s, c) => s + (Number(c.value) || 0), 0);
                const totalColeccion = collectibles.reduce((s, c) => s + (Number(c.value) || 0), 0);
                const peso = totalColeccion > 0 ? Math.round(subtotal / totalColeccion * 100) : 0;
                const conPeso = collFiltroCat === 'all' && collectibleCategories.length > 1;
                // Buscando se enseña todo lo que coincide: recortar ahí escondería resultados.
                const recortar = !q && !collExpandidas.has(cat.id) && items.length > COLL_LIMITE;
                const visibles = recortar ? items.slice(0, COLL_LIMITE) : items;
                return `
                    <section class="coll-categoria">
                        <div class="coll-categoria-cabecera">
                            <span class="coll-categoria-nombre">${escapeHtml(cat.name.toLowerCase())}. <span>${items.length}</span></span>
                            <span class="coll-categoria-cifras">${conPeso ? `<span>${peso}% del total.</span>` : ''}${financeMoney(subtotal)}</span>
                        </div>
                        <div class="coll-categoria-peso"><span style="width:${conPeso ? peso : 100}%"></span></div>
                        <div class="coll-filas">
                            ${visibles.map((c, i) => renderCollFila(c, maxVal > 0 && (Number(c.value) || 0) === maxVal, collExpandidas.has(cat.id) && i >= COLL_LIMITE ? i - COLL_LIMITE : -1, i + 1)).join('')}
                        </div>
                        ${recortar ? `<button class="coll-ver-mas" onclick="expandirCollCategoria('${cat.id}')">ver ${items.length - COLL_LIMITE === 1 ? 'la restante' : `las ${items.length - COLL_LIMITE} restantes`}.</button>` : ''}
                        ${!q && collExpandidas.has(cat.id) && items.length > COLL_LIMITE ? `<button class="coll-ver-mas" onclick="plegarCollCategoria('${cat.id}')">ver menos.</button>` : ''}
                    </section>`;
            }).join('');
            return bloques || `<div class="finance-empty-state">Ningún coleccionable coincide con «${escapeHtml(collBusqueda.trim())}».</div>`;
        }

        // escalon >= 0: fila recién desplegada con "ver las N restantes.",
        // entra escalonada como el resto de despliegues de la app.
        function renderCollFila(item, esTop, escalon, puesto) {
            const carta = item.carta && esCategoriaCartas(item.category) ? item.carta : null;
            const estado = carta?.estado ? `<span class="coll-estado ${CARTA_ESTADO_TONO[carta.estado] || ''}" title="${escapeHtml(carta.estado)}">${CARTA_ESTADO_CORTO[carta.estado] || escapeHtml(carta.estado)}</span>` : '';
            return `
                <div class="coll-fila ${escalon >= 0 ? 'despliegue-item' : ''}" ${escalon >= 0 ? `style="--i:${Math.min(escalon, 14)}"` : ''} data-coll-id="${item.id}" onclick="openEditCollectible('${item.id}')">
                    <div class="coll-puesto">${String(puesto).padStart(2, '0')}</div>
                    <div class="coll-fila-nombre">${esTop ? '<span class="coll-top" title="La más valiosa de su categoría">✦</span>' : ''}${escapeHtml(item.name)}</div>
                    ${estado}
                    <div class="coll-fila-valor">${financeMoney(item.value)}</div>
                    <button class="coll-fila-borrar" title="Eliminar" onclick="event.stopPropagation();deleteCollectible('${item.id}')">×</button>
                </div>`;
        }

        function refrescarCollLista() {
            const el = document.getElementById('coll-lista');
            if (el) el.innerHTML = renderCollLista();
        }

        function setCollFiltro(id) {
            collFiltroCat = id;
            document.querySelectorAll('.coll-chip').forEach(b => b.classList.toggle('active', b.dataset.cat === id));
            refrescarCollLista();
        }

        function setCollBusqueda(valor) {
            collBusqueda = valor;
            refrescarCollLista();
        }

        function setCollOrden(valor) {
            collOrden = valor;
            refrescarCollLista();
        }

        function expandirCollCategoria(id) {
            collExpandidas.add(id);
            refrescarCollLista();
        }

        function plegarCollCategoria(id) {
            collExpandidas.delete(id);
            refrescarCollLista();
        }

        // Las cartas tienen datos propios (set, número, año, estado), todos
        // opcionales. Se reconoce la categoría por su id por defecto o por
        // el nombre, por si se creó a mano otra llamada "Cartas".
        const CARTA_ESTADOS = ['Sellado', 'Mint', 'Near Mint', 'Excellent', 'Good', 'Light Played', 'Played', 'Poor'];

        function esCategoriaCartas(catId) {
            return catId === 'cat_cartas' || /^cartas?$/i.test(collectibleCategoryName(catId).trim());
        }

        function renderCartaFields(carta, visible) {
            const c = carta || {};
            return `
                <div id="collectible-carta-fields" style="${visible ? '' : 'display:none'}">
                    <div class="finance-correction-inputs">
                        <div><div class="modal-label">Set</div><input id="carta-set" class="modal-input" type="text" value="${escapeHtml(c.set || '')}" placeholder="Ej: Base Set"></div>
                        <div><div class="modal-label">Número</div><input id="carta-numero" class="modal-input" type="text" value="${escapeHtml(c.numero || '')}" placeholder="Ej: 4/102"></div>
                    </div>
                    <div class="finance-correction-inputs">
                        <div><div class="modal-label">Año</div><input id="carta-anio" class="modal-input" type="number" min="1900" max="2100" step="1" value="${c.anio || ''}" placeholder="Ej: 1999"></div>
                        <div><div class="modal-label">Estado</div>
                            <select id="carta-estado" class="modal-input">
                                <option value="">Sin indicar</option>
                                ${CARTA_ESTADOS.map(e => `<option value="${e}" ${c.estado === e ? 'selected' : ''}>${e}</option>`).join('')}
                            </select></div>
                    </div>
                </div>`;
        }

        function toggleCartaFields(catId) {
            const el = document.getElementById('collectible-carta-fields');
            if (el) el.style.display = esCategoriaCartas(catId) ? '' : 'none';
        }

        function leerCartaFields() {
            const carta = {
                set: document.getElementById('carta-set')?.value.trim() || '',
                numero: document.getElementById('carta-numero')?.value.trim() || '',
                anio: parseInt(document.getElementById('carta-anio')?.value, 10) || null,
                estado: document.getElementById('carta-estado')?.value || ''
            };
            Object.keys(carta).forEach(k => { if (!carta[k]) delete carta[k]; });
            return Object.keys(carta).length ? carta : null;
        }

        // Si se cambia una carta a otra categoría sus datos de carta se
        // conservan (no se ven, pero vuelven si se devuelve a Cartas).
        function aplicarCartaFields(item, category) {
            if (!esCategoriaCartas(category)) return;
            const carta = leerCartaFields();
            if (carta) item.carta = carta; else delete item.carta;
        }

        function collectibleCategoryOptions(selectedId) {
            return collectibleCategories.map(c =>
                `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
            ).join('');
        }

        function openAddCollectible() {
            showModal(`
                <div class="modal-title">+ Coleccionable</div>
                <div class="modal-label">Nombre</div>
                <input id="collectible-name" class="modal-input" type="text" placeholder="Ej: Carta Charizard 1ª edición">
                <div class="modal-label">Categoría</div>
                <select id="collectible-category" class="modal-input" onchange="toggleCartaFields(this.value)">${collectibleCategoryOptions()}</select>
                ${renderCartaFields(null, esCategoriaCartas(collectibleCategories[0]?.id))}
                <div class="modal-label">Valor de mercado (€)</div>
                <input id="collectible-value" class="modal-input" type="number" min="0" step="0.01" value="0">
                <button class="btn-modal-primary" onclick="saveNewCollectible()">Añadir</button>
            `);
            setTimeout(() => document.getElementById('collectible-name')?.focus(), 50);
        }

        async function saveNewCollectible() {
            const name = document.getElementById('collectible-name')?.value.trim() || '';
            const category = document.getElementById('collectible-category')?.value || '';
            const value = Math.max(0, Number(document.getElementById('collectible-value')?.value) || 0);
            if (!name || !category) { showToast('Indica al menos nombre y categoría', true); return; }

            const nuevo = {
                id: 'coll_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                name, category, value, createdAt: new Date().toISOString()
            };
            aplicarCartaFields(nuevo, category);
            collectibles.push(nuevo);
            closeModal();
            if (currentView === 'collectibles') render();
            try { await saveData(); showToast('Coleccionable añadido'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openEditCollectible(id) {
            const item = collectibles.find(c => c.id === id);
            if (!item) return;
            showModalDesde(`[data-coll-id="${id}"]`, `
                <div class="modal-title">Editar coleccionable</div>
                <div class="modal-label">Nombre</div>
                <input id="collectible-name" class="modal-input" type="text" value="${escapeHtml(item.name)}">
                <div class="modal-label">Categoría</div>
                <select id="collectible-category" class="modal-input" onchange="toggleCartaFields(this.value)">${collectibleCategoryOptions(item.category)}</select>
                ${renderCartaFields(item.carta, esCategoriaCartas(item.category))}
                <div class="modal-label">Valor de mercado (€)</div>
                <input id="collectible-value" class="modal-input" type="number" min="0" step="0.01" value="${Number(item.value) || 0}">
                ${esCategoriaCartas(item.category) ? '<div id="coll-mercado" class="coll-mercado"></div>' : ''}
                <button class="btn-modal-primary" onclick="saveEditCollectible('${id}')">Guardar cambios</button>
            `);
            if (esCategoriaCartas(item.category)) cargarMercadoCarta(id);
        }

        // ============================================================
        //  COLECCIONABLES — precio de mercado de una carta (TCGdex)
        //  Solo informativo, en la ficha: no toca el valor que pone el
        //  usuario. TCGdex en vez de pokemontcg.io porque tiene los nombres
        //  en español ("Giratina V-ASTRO", "Origen Perdido") y sus precios
        //  de Cardmarket se actualizan a diario; los de pokemontcg.io se
        //  quedaron parados en noviembre de 2025 y las colecciones nuevas no
        //  los traen. La carta se busca por nombre y número; si hay varias
        //  posibles, el usuario elige la suya una vez (mercadoId) y desde
        //  entonces se consulta directa.
        // ============================================================
        const MERCADO_API = 'https://api.tcgdex.net/v2';
        const mercadoCache = new Map();

        async function mercadoGet(ruta) {
            if (mercadoCache.has(ruta)) return mercadoCache.get(ruta);
            const res = await fetch(MERCADO_API + ruta);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const datos = await res.json();
            mercadoCache.set(ruta, datos);
            return datos;
        }

        // Las cartas antiguas o no publicadas en español solo existen en la
        // base inglesa: se pide primero la española y, si no está, la otra.
        async function mercadoCarta(cartaId) {
            const ruta = `/cards/${encodeURIComponent(cartaId)}`;
            return mercadoGet('/es' + ruta).catch(() => mercadoGet('/en' + ruta));
        }

        // El set se puede haber apuntado en español ("Origen Perdido") o en
        // inglés ("Base Set"); vale cualquiera de los dos. Primero nombre
        // exacto y, si no hay, que lo contenga ("Base Set" no debe traer
        // también "Base Set 2").
        async function mercadoSetsDe(texto) {
            const buscado = financeProNormalizar(texto).trim();
            if (!buscado) return [];
            const sets = [...await mercadoGet('/es/sets').catch(() => []), ...await mercadoGet('/en/sets').catch(() => [])];
            const exactos = sets.filter(x => financeProNormalizar(x.name).trim() === buscado || x.id.toLowerCase() === buscado);
            const ids = (exactos.length ? exactos : sets.filter(x => financeProNormalizar(x.name).includes(buscado))).map(x => x.id);
            return [...new Set(ids)];
        }

        function mercadoPintar(html) {
            const el = document.getElementById('coll-mercado');
            if (el) el.innerHTML = `<div class="coll-mercado-titulo">en el mercado.</div>${html}`;
        }

        async function cargarMercadoCarta(id, elegir) {
            const item = collectibles.find(c => c.id === id);
            if (!item) return;
            if (item.carta?.estado === 'Sellado') {
                mercadoPintar('<div class="coll-mercado-nota">Los productos sellados no están en la base de datos de cartas.</div>');
                return;
            }
            mercadoPintar('<div class="coll-mercado-nota">consultando…</div>');
            try {
                if (item.mercadoId) { mercadoPintarCarta(id, await mercadoCarta(item.mercadoId)); return; }
                const nombre = encodeURIComponent(item.name.trim());
                const setIds = await mercadoSetsDe(item.carta?.set);
                const delSet = c => setIds.some(sid => c.id.startsWith(sid + '-'));
                let lista = await mercadoGet(`/es/cards?name=${nombre}`).catch(() => []);
                if (!lista.length || (setIds.length && !lista.some(delSet))) {
                    const en = await mercadoGet(`/en/cards?name=${nombre}`).catch(() => []);
                    lista = [...lista, ...en.filter(c => !lista.some(x => x.id === c.id))];
                }
                if (!lista.length) { mercadoPintar('<div class="coll-mercado-nota">No encuentro esta carta por su nombre. Prueba a escribirlo como en la carta impresa.</div>'); return; }
                const candidatas = setIds.length && lista.some(delSet) ? lista.filter(delSet) : lista;
                const numero = String(item.carta?.numero || '').split('/')[0].trim().replace(/^0+(?=.)/, '').toLowerCase();
                const porNumero = numero ? candidatas.filter(c => String(c.localId).replace(/^0+(?=.)/, '').toLowerCase() === numero) : [];
                const unica = porNumero.length === 1 ? porNumero[0] : (!numero && setIds.length && candidatas.length === 1 ? candidatas[0] : null);
                if (unica && !elegir) {
                    const carta = await mercadoCarta(unica.id);
                    item.mercadoId = carta.id;
                    saveData().catch(e => console.error(e));
                    mercadoPintarCarta(id, carta);
                    return;
                }
                await mercadoPintarOpciones(id, porNumero.length && !elegir ? porNumero : candidatas);
            } catch (e) {
                console.error(e);
                mercadoPintar(`<div class="coll-mercado-nota">No se ha podido consultar ahora. <button class="coll-mercado-link" onclick="cargarMercadoCarta('${id}')">reintentar.</button></div>`);
            }
        }

        async function mercadoPintarOpciones(id, lista) {
            const item = collectibles.find(c => c.id === id);
            const detalles = await Promise.all(lista.slice(0, 8).map(c => mercadoCarta(c.id).catch(() => null)));
            const opciones = detalles.filter(Boolean);
            const rareza = c => c.rarity && !/^(ninguno|none)$/i.test(c.rarity) ? ' · ' + escapeHtml(c.rarity.toLowerCase()) : '';
            mercadoPintar(`
                <div class="coll-mercado-nota">Hay ${lista.length} ${lista.length === 1 ? 'carta posible' : 'cartas posibles'}. ¿Cuál es la tuya?${lista.length > 8 ? ' Añade el set o el número de la carta para afinar.' : ''}</div>
                <div class="coll-mercado-opciones">
                    ${opciones.map(c => `
                        <button class="coll-mercado-opcion" onclick="elegirMercadoCarta('${id}','${escapeHtml(c.id)}')">
                            ${c.image ? `<img src="${escapeHtml(c.image)}/low.webp" alt="" loading="lazy">` : '<span class="coll-mercado-sinimg"></span>'}
                            <span>${escapeHtml(c.set?.name || '')}<small>#${escapeHtml(c.localId)}${rareza(c)}</small></span>
                        </button>`).join('')}
                </div>`);
        }

        async function elegirMercadoCarta(id, cartaId) {
            const item = collectibles.find(c => c.id === id);
            if (!item) return;
            item.mercadoId = cartaId;
            cargarMercadoCarta(id);
            try { await saveData(); } catch (e) { console.error(e); }
        }

        function cambiarMercadoCarta(id) {
            const item = collectibles.find(c => c.id === id);
            if (!item) return;
            delete item.mercadoId;
            cargarMercadoCarta(id, true);
        }

        function mercadoPintarCarta(id, c) {
            const cm = c.pricing?.cardmarket;
            const tp = c.pricing?.tcgplayer;
            const tpVariante = tp && ['holofoil', 'reverse-holofoil', 'normal', '1st-edition-holofoil', '1st-edition'].map(k => tp[k]).find(v => v && v.marketPrice);
            const eur = v => (Number.isFinite(v) && v > 0 ? financeMoney(v) : '—');
            const usd = v => (Number.isFinite(v) && v > 0 ? v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $' : '—');
            // Cardmarket a veces enlaza la versión normal de una carta que
            // solo existe en holo (precio de céntimos frente a decenas de
            // dólares en TCGplayer): si las dos fuentes no se parecen nada,
            // se avisa en vez de dar por buena una de ellas.
            const tendencia = cm?.trend || cm?.avg30 || cm?.avg;
            const noCuadran = tendencia > 0 && tpVariante?.marketPrice > 0 && (tpVariante.marketPrice / tendencia > 4 || tendencia / tpVariante.marketPrice > 4);
            const actualizado = (cm?.updated || tp?.updated || '').slice(0, 10);
            const busqueda = encodeURIComponent(`${c.name} ${c.localId}`);
            mercadoPintar(`
                <div class="coll-mercado-carta">
                    ${c.image ? `<img src="${escapeHtml(c.image)}/low.webp" alt="" loading="lazy">` : ''}
                    <div class="coll-mercado-info">
                        <div class="coll-mercado-nombre">${escapeHtml(c.name)}</div>
                        <div class="coll-mercado-set">${escapeHtml(c.set?.name || '')} · #${escapeHtml(c.localId)}${c.rarity && !/^(ninguno|none)$/i.test(c.rarity) ? ' · ' + escapeHtml(c.rarity.toLowerCase()) : ''}</div>
                        ${cm || tpVariante ? `
                        <div class="coll-mercado-precios">
                            ${cm ? `<div><span>cardmarket.</span><b>${eur(tendencia)}</b><small>media 30 días ${eur(cm.avg30)} · desde ${eur(cm.low)}</small></div>` : ''}
                            ${tpVariante ? `<div><span>tcgplayer.</span><b>${usd(tpVariante.marketPrice)}</b><small>de ${usd(tpVariante.lowPrice)} a ${usd(tpVariante.highPrice)}</small></div>` : ''}
                        </div>
                        ${noCuadran ? '<div class="coll-mercado-nota aviso">Las dos fuentes no cuadran: puede que una esté mirando otra versión de la carta. Compruébalo en Cardmarket.</div>' : ''}` : '<div class="coll-mercado-nota">Esta carta todavía no tiene precios publicados.</div>'}
                        <div class="coll-mercado-pie">
                            ${actualizado ? `<span>actualizado el ${escapeHtml(financeDateLabelShort(actualizado))}.</span>` : ''}
                            <a class="coll-mercado-link" href="https://www.cardmarket.com/es/Pokemon/Products/Search?searchString=${busqueda}" target="_blank" rel="noopener">ver en cardmarket.</a>
                            <button class="coll-mercado-link" onclick="cambiarMercadoCarta('${id}')">no es esta.</button>
                        </div>
                    </div>
                </div>`);
        }

        async function saveEditCollectible(id) {
            const item = collectibles.find(c => c.id === id);
            if (!item) return;
            const name = document.getElementById('collectible-name')?.value.trim() || '';
            const category = document.getElementById('collectible-category')?.value || '';
            const value = Math.max(0, Number(document.getElementById('collectible-value')?.value) || 0);
            if (!name || !category) { showToast('Indica al menos nombre y categoría', true); return; }

            item.name = name; item.category = category; item.value = value;
            aplicarCartaFields(item, category);
            closeModal();
            if (currentView === 'collectibles') render();
            try { await saveData(); showToast('Coleccionable actualizado'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteCollectible(id) {
            if (!confirm('¿Eliminar este coleccionable?')) return;
            collectibles = collectibles.filter(c => c.id !== id);
            if (currentView === 'collectibles') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openAddCollectibleCategory() {
            showModal(`
                <div class="modal-title">+ Categoría de coleccionables</div>
                <div class="modal-label">Nombre de la categoría</div>
                <input id="collectible-category-name" class="modal-input" type="text" placeholder="Ej: Figuras, Vinilos, Cómics...">
                <button class="btn-modal-primary" onclick="saveNewCollectibleCategory()">Añadir categoría</button>
            `);
            setTimeout(() => document.getElementById('collectible-category-name')?.focus(), 50);
        }

        async function saveNewCollectibleCategory() {
            const name = document.getElementById('collectible-category-name')?.value.trim() || '';
            if (!name) { showToast('Indica un nombre para la categoría', true); return; }
            if (collectibleCategories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
                showToast('Ya existe una categoría con ese nombre', true); return;
            }
            collectibleCategories.push({ id: 'cat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name });
            closeModal();
            if (currentView === 'collectibles') render();
            try { await saveData(); showToast('Categoría añadida'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function closeWeeklyTasksOnOutsideClick(event) {
            const panel = document.getElementById('weekly-tasks-panel');
            const button = document.getElementById('weekly-tasks-btn');
            if (!panel || !panel.classList.contains('open')) return;
            if (panel.contains(event.target) || button?.contains(event.target)) return;
            toggleWeeklyTasks(false);
        }

        document.addEventListener('click', closeWeeklyTasksOnOutsideClick);
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') toggleWeeklyTasks(false);
        });

