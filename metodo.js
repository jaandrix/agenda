// ============================================================
//  MÉTODO (Objetivos → pestaña "método.") — cuatro prácticas
//  japonesas para conseguir objetivos personales, cada una para un
//  momento distinto:
//  - Mandala del método Harada (el de Shohei Ohtani): el objetivo en
//    el centro, ocho pilares y ocho acciones por pilar. Planificar.
//  - Kaizen: un paso diminuto cada día, llevado como hábito. Empezar.
//  - Para qué (ikigai / el propósito que pide Harada): para mí y para
//    los demás. No abandonar.
//  - Hansei: reflexión honesta de la semana. Corregir el rumbo.
//  Los datos viven en el propio objetivo (proposito, mandala,
//  kaizenHabitId) y en la lista global `hansei` (app.js).
// ============================================================
let metodoObjetivoId = null;

function objetivosActivos() {
    return entries.filter(e => e.type === 'goal' && e.status !== 'Completado');
}

function mandalaVacio() {
    return { pilares: Array.from({ length: 8 }, () => ({ texto: '', acciones: Array(8).fill('') })) };
}

async function guardarMetodo() {
    filteredEntries = [...entries];
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}

function renderMetodo() {
    const objetivos = objetivosActivos();
    const intro = `
        <div class="metodo-intro">
            <div><b>mandala.</b><span>El objetivo en el centro, ocho pilares y ocho acciones por pilar: del sueño a lo que haces hoy.</span></div>
            <div><b>kaizen.</b><span>Un paso tan pequeño que no puedas decir que no. Cada día.</span></div>
            <div><b>para qué.</b><span>Por qué lo quieres, para ti y para los demás. Lo que te sostiene cuando cuesta.</span></div>
            <div><b>hansei.</b><span>Cada semana, mirar con honestidad qué salió, qué no y qué parte fue tuya.</span></div>
        </div>`;
    if (!objetivos.length) {
        return `${intro}<div class="metodo-vacio">Crea un objetivo (botón + → Objetivo) para empezar a trabajarlo con el método.</div>${renderHansei()}`;
    }
    let g = objetivos.find(o => o.id === metodoObjetivoId) || objetivos[0];
    metodoObjetivoId = g.id;
    return `
        ${intro}
        <div class="metodo-elegir">${objetivos.map(o => `<button class="${o.id === g.id ? 'activo' : ''}" onclick="metodoObjetivoId='${o.id}';render()">${escapeHtml(o.title)}</button>`).join('')}</div>
        <div class="metodo-cuerpo">
            ${renderMandala(g)}
            <div class="metodo-lateral">
                ${renderParaQue(g)}
                ${renderKaizen(g)}
            </div>
        </div>
        ${renderHansei()}`;
}

// ---- Mandala (Harada / Open Window 64) ----
function renderMandala(g) {
    const m = g.mandala || mandalaVacio();
    const orden = [0, 1, 2, 7, -1, 3, 6, 5, 4];
    return `
        <section class="metodo-bloque">
            <div class="metodo-bloque-cab"><div class="metodo-bloque-titulo">mandala.</div><div class="metodo-bloque-sub">Pulsa un pilar para escribir sus ocho acciones.</div></div>
            <div class="mandala">
                ${orden.map(i => {
                    if (i < 0) return `<div class="mandala-centro">${escapeHtml(g.title)}</div>`;
                    const p = m.pilares[i];
                    const hechas = p.acciones.filter(a => a.trim()).length;
                    return `<button class="mandala-pilar ${p.texto ? '' : 'vacio'}" onclick="openPilar('${g.id}', ${i})">
                        <span class="mandala-pilar-texto">${p.texto ? escapeHtml(p.texto) : '+ pilar.'}</span>
                        ${p.texto ? `<span class="mandala-pilar-n">${hechas}/8</span>` : ''}
                    </button>`;
                }).join('')}
            </div>
        </section>`;
}

function openPilar(goalId, i) {
    const g = entries.find(e => e.id === goalId);
    if (!g) return;
    const p = (g.mandala || mandalaVacio()).pilares[i];
    const orden = [0, 1, 2, 7, -1, 3, 6, 5, 4];
    const habitoDe = texto => habits.find(h => h.objetivoId === goalId && h.texto === texto && h.activo !== false);
    showModal(`
        <div class="modal-title">pilar.</div>
        <div class="modal-label">Qué necesitas para «${escapeHtml(g.title)}»</div>
        <input id="pilar-texto" class="modal-input" value="${escapeHtml(p.texto)}" placeholder="Forma física, constancia, dinero...">
        <div class="modal-label">Ocho acciones concretas</div>
        <div class="pilar-rejilla">
            ${orden.map(k => k < 0
                ? `<div class="pilar-centro" id="pilar-centro">${escapeHtml(p.texto || 'pilar')}</div>`
                : `<div class="pilar-accion">
                        <textarea id="pilar-accion-${k}" class="modal-input" rows="2" placeholder="acción ${k + 1}">${escapeHtml(p.acciones[k])}</textarea>
                        ${p.acciones[k].trim() ? (habitoDe(p.acciones[k].trim()) ? '<span class="pilar-habito-ya">es hábito.</span>' : `<button class="pilar-habito" onclick="pilarAHabito('${goalId}', ${i}, ${k})">→ hábito.</button>`) : ''}
                   </div>`).join('')}
        </div>
        <button class="btn-modal-primary" onclick="guardarPilar('${goalId}', ${i})">guardar.</button>
    `);
    document.getElementById('pilar-texto')?.addEventListener('input', ev => {
        const c = document.getElementById('pilar-centro');
        if (c) c.textContent = ev.target.value || 'pilar';
    });
}

function leerPilarDelModal(g, i) {
    if (!g.mandala) g.mandala = mandalaVacio();
    const p = g.mandala.pilares[i];
    p.texto = document.getElementById('pilar-texto')?.value.trim() || '';
    for (let k = 0; k < 8; k++) p.acciones[k] = document.getElementById(`pilar-accion-${k}`)?.value.trim() || '';
}

async function guardarPilar(goalId, i) {
    const g = entries.find(e => e.id === goalId);
    if (!g) return;
    leerPilarDelModal(g, i);
    closeModal();
    render();
    await guardarMetodo();
}

// Una acción repetible del mandala pasa a Hábitos, ligada al objetivo:
// es la "lista de rutinas" del método Harada.
async function pilarAHabito(goalId, i, k) {
    const g = entries.find(e => e.id === goalId);
    if (!g) return;
    leerPilarDelModal(g, i);
    const texto = g.mandala.pilares[i].acciones[k];
    if (!texto) return;
    if (!habits.some(h => h.objetivoId === goalId && h.texto === texto && h.activo !== false)) {
        habits.push({ id: 'habit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), texto, activo: true, completadas: {}, objetivoId: goalId });
    }
    showToast('Añadido a Hábitos');
    openPilar(goalId, i);
    await guardarMetodo();
}

// ---- Para qué ----
function renderParaQue(g) {
    const p = g.proposito || {};
    return `
        <section class="metodo-bloque">
            <div class="metodo-bloque-cab"><div class="metodo-bloque-titulo">para qué.</div></div>
            <div class="modal-label">para mí.</div>
            <textarea class="modal-input metodo-texto" rows="2" placeholder="Qué cambia en tu vida si lo consigues." onchange="guardarProposito('${g.id}', 'mi', this.value)">${escapeHtml(p.mi || '')}</textarea>
            <div class="modal-label">para los demás.</div>
            <textarea class="modal-input metodo-texto" rows="2" placeholder="A quién le importa o a quién ayuda." onchange="guardarProposito('${g.id}', 'otros', this.value)">${escapeHtml(p.otros || '')}</textarea>
        </section>`;
}

async function guardarProposito(goalId, campo, valor) {
    const g = entries.find(e => e.id === goalId);
    if (!g) return;
    g.proposito = { ...(g.proposito || {}), [campo]: valor.trim() };
    await guardarMetodo();
}

// ---- Kaizen ----
function renderKaizen(g) {
    const h = habits.find(x => x.id === g.kaizenHabitId && x.activo !== false);
    const hoy = todayISO();
    if (!h) {
        return `
            <section class="metodo-bloque">
                <div class="metodo-bloque-cab"><div class="metodo-bloque-titulo">paso kaizen.</div></div>
                <div class="metodo-bloque-sub" style="margin-bottom:10px">El gesto más pequeño que te acerca a esto, tan fácil que puedas hacerlo hasta el peor día. Por ejemplo: «ponerme las zapatillas», «leer una página».</div>
                <div class="metodo-kaizen-nuevo">
                    <input id="kaizen-texto" class="modal-input" placeholder="mi paso de cada día..." onkeydown="if(event.key==='Enter')crearKaizen('${g.id}')">
                    <button class="btn-modal-primary" onclick="crearKaizen('${g.id}')">empezar.</button>
                </div>
            </section>`;
    }
    const on = !!h.completadas?.[hoy];
    const racha = habitStreak(h);
    const dias = Array.from({ length: 21 }, (_, k) => {
        const d = new Date(); d.setDate(d.getDate() - 20 + k);
        return `<span class="${h.completadas?.[d.toISOString().slice(0, 10)] ? 'on' : ''}"></span>`;
    }).join('');
    return `
        <section class="metodo-bloque">
            <div class="metodo-bloque-cab"><div class="metodo-bloque-titulo">paso kaizen.</div><button class="metodo-mini" onclick="quitarKaizen('${g.id}')">cambiar.</button></div>
            <div class="metodo-kaizen">
                <button class="metodo-kaizen-check ${on ? 'on' : ''}" onclick="toggleHabitToday('${h.id}')" aria-label="Hecho hoy"></button>
                <div><div class="metodo-kaizen-texto">${escapeHtml(h.texto)}</div><div class="metodo-bloque-sub">${racha ? `${racha} ${racha === 1 ? 'día' : 'días'} seguidos.` : on ? 'hecho hoy.' : 'hoy todavía no.'}</div></div>
            </div>
            <div class="metodo-kaizen-dias" title="Últimas tres semanas">${dias}</div>
        </section>`;
}

async function crearKaizen(goalId) {
    const g = entries.find(e => e.id === goalId);
    const texto = document.getElementById('kaizen-texto')?.value.trim();
    if (!g || !texto) { showToast('Escribe tu paso', true); return; }
    const h = { id: 'habit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), texto, activo: true, completadas: {}, objetivoId: goalId, kaizen: true };
    habits.push(h);
    g.kaizenHabitId = h.id;
    render();
    await guardarMetodo();
}

async function quitarKaizen(goalId) {
    const g = entries.find(e => e.id === goalId);
    if (!g) return;
    if (!confirm('¿Cambiar el paso kaizen? El hábito actual se pausa (su historial se conserva).')) return;
    const h = habits.find(x => x.id === g.kaizenHabitId);
    if (h) h.activo = false;
    delete g.kaizenHabitId;
    render();
    await guardarMetodo();
}

// ---- Hansei (semanal, para todos los objetivos) ----
function renderHansei() {
    const semana = isoWeekKey();
    const actual = hansei.find(h => h.semana === semana) || {};
    const anteriores = hansei.filter(h => h.semana !== semana).sort((a, b) => b.semana.localeCompare(a.semana));
    const n = semana.split('-W')[1];
    const pregunta = (id, titulo, ayuda) => `
        <div class="hansei-pregunta">
            <div class="modal-label">${titulo}</div>
            <textarea id="hansei-${id}" class="modal-input metodo-texto" rows="3" placeholder="${ayuda}">${escapeHtml(actual[id] || '')}</textarea>
        </div>`;
    return `
        <section class="metodo-bloque hansei">
            <div class="metodo-bloque-cab">
                <div class="metodo-bloque-titulo">hansei. <span>semana ${Number(n)}</span></div>
                <div class="metodo-bloque-sub">Sin castigarte y sin excusas: lo que pasó, tu parte y lo que cambias.</div>
            </div>
            <div class="hansei-preguntas">
                ${pregunta('bien', 'qué salió bien.', 'Lo que funcionó y por qué.')}
                ${pregunta('mal', 'qué no salió y qué parte fue mía.', 'Sin culpar a otros ni a la suerte.')}
                ${pregunta('cambio', 'qué cambio la semana que viene.', 'Un cambio concreto, no un propósito vago.')}
            </div>
            <button class="btn-modal-primary hansei-guardar" onclick="guardarHansei()">${actual.semana ? 'actualizar.' : 'guardar la semana.'}</button>
            ${anteriores.length ? `
            <details class="hansei-historial">
                <summary>semanas anteriores. <span>${anteriores.length}</span></summary>
                ${anteriores.map(h => `
                    <div class="hansei-pasada">
                        <div class="hansei-pasada-semana">semana ${Number(h.semana.split('-W')[1])} · ${h.semana.slice(0, 4)}</div>
                        ${h.bien ? `<div><b>bien.</b> ${escapeHtml(h.bien)}</div>` : ''}
                        ${h.mal ? `<div><b>mi parte.</b> ${escapeHtml(h.mal)}</div>` : ''}
                        ${h.cambio ? `<div><b>cambio.</b> ${escapeHtml(h.cambio)}</div>` : ''}
                    </div>`).join('')}
            </details>` : ''}
        </section>`;
}

async function guardarHansei() {
    const semana = isoWeekKey();
    const v = id => document.getElementById('hansei-' + id)?.value.trim() || '';
    const datos = { semana, bien: v('bien'), mal: v('mal'), cambio: v('cambio'), fecha: todayISO() };
    if (!datos.bien && !datos.mal && !datos.cambio) { showToast('Escribe al menos una respuesta', true); return; }
    hansei = [...hansei.filter(h => h.semana !== semana), datos];
    showToast('Semana guardada');
    render();
    try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}
