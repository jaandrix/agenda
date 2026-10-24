// ============================================================
//  TU MES, EN UNA TARJETA PARA COMPARTIR
//  Panorama → «tu mes.»: una imagen vertical (1080 × 1920, para stories)
//  con lo del mes: planes, viajes, ocio terminado, tareas hechas, días con
//  rutinas y exámenes aprobados. Antes de guardarla se puede quitar
//  cualquier grupo o cualquier cosa suelta (un evento que no quieres
//  enseñar); el dinero va apagado por defecto. Se dibuja en un canvas con
//  los colores del tema y se guarda o se comparte como PNG.
// ============================================================
let tuMesEstado = null;

function tuMesClave(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

function openTuMes(mes) {
    const hoy = new Date();
    const porDefecto = hoy.getDate() <= 7 ? new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1) : hoy;
    tuMesEstado = { mes: mes || tuMesClave(porDefecto), quitados: new Set(['grupo:dinero']) };
    showModal(`<div class="tumes" id="tumes"></div>`);
    document.querySelector('#modal-container .modal-sheet')?.classList.add('tumes-sheet');
    pintarTuMes();
}

function tuMesMover(delta) {
    const [y, m] = tuMesEstado.mes.split('-').map(Number);
    tuMesEstado.mes = tuMesClave(new Date(y, m - 1 + delta, 1));
    pintarTuMes();
}

function tuMesDatos(mes) {
    const enMes = f => String(f || '').slice(0, 7) === mes;
    const grupos = [];
    const eventos = entries.filter(e => e.type === 'event' && enMes(e.date) && !isCalendarLogEntry(e) && !e.linkedItemId && !esEjemploTuMes(e))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (eventos.length) grupos.push({ clave: 'planes', una: 'plan.', varias: 'planes.', items: eventos.map(e => ({ id: e.id, texto: e.title })) });
    const viajes = entries.filter(e => e.type === 'travel' && (enMes(e.startDate) || enMes(e.endDate)) && !esEjemploTuMes(e));
    if (viajes.length) grupos.push({ clave: 'viajes', una: 'viaje.', varias: 'viajes.', items: viajes.map(e => ({ id: e.id, texto: e.destination || e.title })) });
    const ocio = entries.filter(e => ['book', 'movie', 'series', 'game'].includes(e.type) && enMes(e.endDate) && !esEjemploTuMes(e));
    if (ocio.length) grupos.push({ clave: 'ocio', una: 'libro, peli o serie terminada.', varias: 'libros, pelis y series terminadas.', items: ocio.map(e => ({ id: e.id, texto: e.title })) });
    const tareas = entries.filter(e => isCalendarLogEntry(e) && /^planner_done_/.test(e.id || '') && enMes(e.date)).length;
    if (tareas) grupos.push({ clave: 'tareas', una: 'tarea hecha.', varias: 'tareas hechas.', cifra: tareas, items: [] });
    const diasRutina = new Set();
    habits.forEach(h => Object.keys(h.completadas || {}).forEach(d => { if (enMes(d) && h.completadas[d]) diasRutina.add(d); }));
    if (diasRutina.size) grupos.push({ clave: 'rutinas', una: 'día con mis rutinas.', varias: 'días con mis rutinas.', cifra: diasRutina.size, items: [] });
    const aprobados = [];
    (studies?.subjects || []).forEach(s => (s.exams || []).forEach(x => { const n = parseFloat(String(x.grade).replace(',', '.')); if (enMes(x.date) && n >= 5) aprobados.push({ id: x.id, texto: s.name }); }));
    if (aprobados.length) grupos.push({ clave: 'examenes', una: 'examen aprobado.', varias: 'exámenes aprobados.', items: aprobados });
    let ingresos = 0, gastos = 0;
    (financePro?.transactions || []).forEach(t => {
        if (!enMes(t.date) || financeProNeutro(t) || t.transfer || esEjemploTuMes(t)) return;
        if (t.type === 'income') ingresos += Number(t.amount) || 0;
        else if (t.type === 'expense') gastos += Number(t.amount) || 0;
    });
    if (ingresos - gastos > 0) grupos.push({ clave: 'dinero', texto: `ahorrados.`, cifraTexto: financeMoney(Math.round(ingresos - gastos)), items: [] });
    return grupos;
}

// La semana de ejemplo no entra en la tarjeta: es inventada.
function esEjemploTuMes(x) { return typeof esEjemplo === 'function' && esEjemplo(x); }

function tuMesVisible(grupos) {
    const q = tuMesEstado.quitados;
    return grupos.filter(g => !q.has('grupo:' + g.clave)).map(g => {
        const items = g.items.filter(i => !q.has('item:' + i.id));
        const cifra = g.cifra ?? items.length;
        return { ...g, items, cifra };
    }).filter(g => g.cifraTexto || g.cifra > 0);
}

function pintarTuMes() {
    const cont = document.getElementById('tumes');
    if (!cont) return;
    const [y, m] = tuMesEstado.mes.split('-').map(Number);
    const nombreMes = new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long' });
    const grupos = tuMesDatos(tuMesEstado.mes);
    const q = tuMesEstado.quitados;
    const futuro = tuMesEstado.mes >= tuMesClave(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1));
    cont.innerHTML = `
        <div class="modal-title">tu mes.<button class="modal-close" onclick="closeModal()" aria-label="Cerrar"><i class='ico ico-x' aria-hidden=true></i></button></div>
        <div class="tumes-mes">
            <button class="m-mini" onclick="tuMesMover(-1)" aria-label="Mes anterior"><i class='ico ico-izq' aria-hidden=true></i></button>
            <b>${nombreMes} ${y}.</b>
            <button class="m-mini" onclick="tuMesMover(1)" ${futuro ? 'disabled' : ''} aria-label="Mes siguiente"><i class='ico ico-der' aria-hidden=true></i></button>
        </div>
        ${grupos.length ? `
        <div class="tumes-cuerpo">
            <canvas id="tumes-canvas" width="1080" height="1920" aria-label="Vista previa de la tarjeta"></canvas>
            <div class="tumes-lista">
                <p class="tumes-pista">Toca lo que no quieras enseñar y desaparece de la tarjeta.</p>
                ${grupos.map(g => {
                    const fuera = q.has('grupo:' + g.clave);
                    return `<div class="tumes-grupo ${fuera ? 'fuera' : ''}">
                        <button class="tumes-grupo-cab" onclick="tuMesAlternar('grupo:${g.clave}')" aria-pressed="${!fuera}"><span class="tumes-check"></span><b>${g.clave === 'dinero' ? `${g.cifraTexto} ahorrados.` : `${g.cifra ?? g.items.length} ${(g.cifra ?? g.items.length) === 1 ? g.una : g.varias}`}</b>${g.clave === 'dinero' ? '<small>apagado por defecto</small>' : ''}</button>
                        ${!fuera && g.items.length ? `<div class="tumes-items">${g.items.map(i => `<button class="tumes-item ${q.has('item:' + i.id) ? 'fuera' : ''}" onclick="tuMesAlternar('item:${jsAttr(i.id)}')">${escapeHtml(i.texto || '')}</button>`).join('')}</div>` : ''}
                    </div>`;
                }).join('')}
                <div class="tumes-botones">
                    <button class="btn-modal-primary" onclick="compartirTuMes()">${navigator.share ? 'compartir.' : 'guardar imagen.'}</button>
                    ${navigator.share ? '<button class="btn-secondary" onclick="guardarTuMes()">guardar imagen.</button>' : ''}
                </div>
            </div>
        </div>` : `<div class="m-vacio">No hay nada apuntado en ${nombreMes} todavía.</div>`}`;
    if (grupos.length) dibujarTuMes(document.getElementById('tumes-canvas'), nombreMes, tuMesVisible(grupos));
}

function tuMesAlternar(clave) {
    const q = tuMesEstado.quitados;
    if (q.has(clave)) q.delete(clave); else q.add(clave);
    pintarTuMes();
}

function dibujarTuMes(canvas, nombreMes, grupos) {
    const ctx = canvas.getContext('2d');
    const css = getComputedStyle(document.body);
    const v = (n, f) => (css.getPropertyValue(n) || '').trim() || f;
    const fondo = v('--bg-app', '#E7E2D9'), tinta = v('--text-primary', '#161514'), suave = v('--text-secondary', '#6e6a63'), acento = v('--m-acento', '#EE4B1F');
    const W = 1080, H = 1920, X = 96;
    ctx.fillStyle = fondo; ctx.fillRect(0, 0, W, H);
    const letra = (peso, px) => { ctx.font = `${peso} ${px}px Poppins, system-ui, sans-serif`; };
    const texto = (t, x, y, color) => { ctx.fillStyle = color; ctx.fillText(t, x, y); return ctx.measureText(t).width; };
    const lineas = (t, max) => {
        const palabras = String(t).split(' '); const out = []; let l = '';
        palabras.forEach(p => { const prueba = l ? l + ' ' + p : p; if (ctx.measureText(prueba).width > max && l) { out.push(l); l = p; } else l = prueba; });
        if (l) out.push(l);
        return out;
    };
    ctx.textBaseline = 'alphabetic';
    letra(800, 46); const wMarca = texto('bitácora', X, 170, tinta); texto('.', X + wMarca, 170, acento);
    letra(800, 168); ctx.letterSpacing = '-6px';
    const wMes = texto(nombreMes, X - 6, 410, tinta); texto('.', X - 6 + wMes, 410, acento);
    ctx.letterSpacing = '0px';
    letra(500, 40); texto('mi mes, en bitácora.', X, 480, suave);
    // Con pocos grupos, más aire entre ellos para que la tarjeta no se quede vacía abajo.
    const hueco = Math.max(150, Math.min(260, 1000 / Math.max(1, grupos.length)));
    let y = 680;
    for (const g of grupos) {
        if (y > 1660) break;
        letra(800, 104); ctx.letterSpacing = '-3px';
        const cifra = g.clave === 'dinero' ? g.cifraTexto : String(g.cifra);
        const wc = texto(cifra, X, y, acento);
        ctx.letterSpacing = '0px';
        letra(700, 52);
        const etiqueta = g.clave === 'dinero' ? 'ahorrados.' : (g.cifra === 1 ? g.una : g.varias);
        const resto = lineas(etiqueta, W - X * 2 - wc - 24);
        resto.forEach((l, k) => texto(l, X + wc + 24, y + k * 60, tinta));
        y += (resto.length - 1) * 60;
        if (g.items.length) {
            letra(500, 38);
            // Tantas cosas como quepan en tres renglones, y el resto como «y N más.» (nunca una frase cortada).
            let ls = [];
            for (let n = Math.min(8, g.items.length); n >= 1; n--) {
                const lista = g.items.slice(0, n).map(i => i.texto).join(', ') + (g.items.length > n ? ` y ${g.items.length - n} más` : '') + '.';
                ls = lineas(lista, W - X * 2);
                if (ls.length <= 3) break;
            }
            ls = ls.slice(0, 3);
            ls.forEach((l, k) => texto(l, X, y + 66 + k * 52, suave));
            y += 66 + (ls.length - 1) * 52;
        }
        y += hueco;
    }
    letra(600, 38); texto('appbitacora.es', X, H - 110, suave);
}

function tuMesBlob() {
    return new Promise(res => document.getElementById('tumes-canvas').toBlob(res, 'image/png'));
}

async function guardarTuMes() {
    const blob = await tuMesBlob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mi-mes-${tuMesEstado.mes}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function compartirTuMes() {
    if (!navigator.share) return guardarTuMes();
    const blob = await tuMesBlob();
    const archivo = new File([blob], `mi-mes-${tuMesEstado.mes}.png`, { type: 'image/png' });
    try {
        if (navigator.canShare?.({ files: [archivo] })) await navigator.share({ files: [archivo] });
        else await guardarTuMes();
    } catch (e) { if (e?.name !== 'AbortError') guardarTuMes(); }
}
