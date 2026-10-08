// ============================================================
//  PROFESORADO (vista 'profesorado', apartado opcional)
//  El cuadrante del curso para quien da clase: una columna por grupo,
//  una fila por día y en cada casilla lo que toca ese día, escrito como
//  en una hoja de cálculo. Lo que no se marcó como dado en su día pasa a
//  pendientes, y desde ahí se lleva al siguiente hueco de esa clase o se
//  corre todo el temario que venía detrás.
//  Datos: `profesorado` (sincronizado) = { clases: [{ id, nombre, materia,
//  dias: [1..6] }], sesiones: [{ id, claseId, fecha, titulo, hecha }] }.
// ============================================================
const PROFE_DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const PROFE_LETRAS = ['', 'L', 'M', 'X', 'J', 'V', 'S'];
let profeDesde = null;
let profeSemanas = 2;

function datosProfe() {
    if (!profesorado || typeof profesorado !== 'object') profesorado = { clases: [], sesiones: [] };
    if (!Array.isArray(profesorado.clases)) profesorado.clases = [];
    if (!Array.isArray(profesorado.sesiones)) profesorado.sesiones = [];
    return profesorado;
}

function profeSumar(iso, n) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return isoLocal(d);
}

function profeLunes(iso) {
    const d = new Date(iso + 'T12:00:00');
    return profeSumar(iso, -((d.getDay() + 6) % 7));
}

function profeFecha(iso, conDia = false) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', conDia ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' });
}

// Sin días marcados, la clase cuenta de lunes a viernes.
function profeEsLectivo(clase, iso) {
    const w = new Date(iso + 'T12:00:00').getDay();
    const dias = clase.dias || [];
    return dias.length ? dias.includes(w) : w >= 1 && w <= 5;
}

function profeSesion(claseId, fecha) {
    return datosProfe().sesiones.find(s => s.claseId === claseId && s.fecha === fecha) || null;
}

function profePendientes() {
    const hoy = isoLocal(new Date());
    const p = datosProfe();
    return p.sesiones
        .filter(s => !s.hecha && s.titulo && s.fecha < hoy && p.clases.some(c => c.id === s.claseId))
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function profeSiguienteHueco(clase, desde, ignorarId) {
    let d = desde;
    for (let i = 0; i < 500; i++, d = profeSumar(d, 1)) {
        const s = profeSesion(clase.id, d);
        if (profeEsLectivo(clase, d) && (!s || s.id === ignorarId)) return d;
    }
    return desde;
}

function renderProfesorado() {
    const p = datosProfe();
    const hoy = isoLocal(new Date());
    if (!profeDesde) profeDesde = profeLunes(hoy);
    if (!p.clases.length) return `
        <div class="uni-vista profe">
            <div class="uni-vacio">
                <div class="uni-titulo">profesorado.</div>
                <p>El cuadrante de tu curso: una columna por cada clase, una fila por día y en cada casilla lo que toca. Lo que no llegues a dar en su día pasa a pendientes, y desde ahí lo llevas a la siguiente clase o corres todo el temario.</p>
                <div class="profe-botones">
                    <button class="btn-modal-primary" onclick="openClaseProfe()">añadir mi primera clase.</button>
                    <button class="pedido-btn" onclick="openImportarProfe()">ya tengo un cuadrante.</button>
                </div>
            </div>
        </div>`;
    const sabado = p.clases.some(c => (c.dias || []).includes(6));
    const dias = [];
    for (let i = 0; i < profeSemanas * 7; i++) {
        const d = profeSumar(profeDesde, i);
        const w = new Date(d + 'T12:00:00').getDay();
        if (w === 0 || (w === 6 && !sabado)) continue;
        dias.push(d);
    }
    const conTitulo = p.sesiones.filter(s => s.titulo && p.clases.some(c => c.id === s.claseId));
    const dadas = conTitulo.filter(s => s.hecha).length;
    const pendientes = profePendientes().length;
    return `
    <div class="uni-vista profe">
        <div class="uni-cabecera">
            <div>
                <div class="uni-titulo">profesorado.</div>
                <div class="uni-sub">${p.clases.length} ${p.clases.length === 1 ? 'clase' : 'clases'} · ${dadas} de ${conTitulo.length} sesiones dadas${pendientes ? ` · ${pendientes} ${pendientes === 1 ? 'pendiente' : 'pendientes'}` : ''}.</div>
            </div>
            <div class="profe-botones">
                <button class="pedido-btn solo-escritorio" onclick="openClaseProfe()">+ clase.</button>
                <button class="pedido-btn" onclick="openRepartirProfe()">repartir temario.</button>
                <button class="pedido-btn" onclick="openImportarProfe()">importar con ia.</button>
            </div>
        </div>
        <div id="profe-pendientes">${renderPendientesProfe()}</div>
        <div class="profe-cuadrante">
            <div class="profe-nav">
                <button class="cal-nav-arrow" onclick="profeMover(-1)" aria-label="Semana anterior">‹</button>
                <span class="profe-rango">${profeFecha(dias[0])} — ${profeFecha(dias[dias.length - 1])}</span>
                <button class="cal-nav-arrow" onclick="profeMover(1)" aria-label="Semana siguiente">›</button>
                <div class="profe-nav-der">
                    ${[1, 2, 4].map(n => `<button class="profe-chip ${profeSemanas === n ? 'activa' : ''}" onclick="profeSemanas=${n};render()">${n === 1 ? '1 semana' : `${n} semanas`}</button>`).join('')}
                    <button class="profe-chip" onclick="profeDesde=null;render()">hoy.</button>
                </div>
            </div>
            <div class="profe-tabla-wrap">
                <table class="profe-tabla">
                    <thead><tr><th class="profe-col-dia"></th>${p.clases.map(c => `<th><button class="profe-clase" onclick="openClaseProfe('${c.id}')"><b>${escapeHtml(c.nombre)}</b><small>${escapeHtml(c.materia || '')}${(c.dias || []).length ? ` · ${c.dias.map(d => PROFE_LETRAS[d]).join(' ')}` : ''}</small></button></th>`).join('')}</tr></thead>
                    <tbody>${dias.map((d, f) => {
                        const w = new Date(d + 'T12:00:00').getDay();
                        return `<tr class="${d === hoy ? 'hoy' : ''} ${w === 1 && f > 0 ? 'profe-semana-nueva' : ''}"><th class="profe-col-dia"><span>${PROFE_DIAS[w]}</span>${Number(d.slice(8))}</th>${p.clases.map((c, ci) => renderCeldaProfe(c, d, f, ci, hoy)).join('')}</tr>`;
                    }).join('')}</tbody>
                </table>
            </div>
            <div class="profe-pista">Escribe en cada casilla lo que toca ese día. Intro baja a la fila siguiente y el círculo marca la sesión como dada. Las casillas apagadas son días sin esa clase.</div>
        </div>
    </div>`;
}

function renderCeldaProfe(c, d, f, ci, hoy) {
    const s = profeSesion(c.id, d);
    const lectiva = profeEsLectivo(c, d);
    const clases = ['profe-celda', lectiva ? 'lectiva' : 'libre', s?.hecha ? 'hecha' : '', s && s.titulo && !s.hecha && d < hoy ? 'pendiente' : ''].filter(Boolean).join(' ');
    return `<td class="${clases}"><div class="profe-celda-in">
        <input value="${escapeHtml(s?.titulo || '')}" data-f="${f}" data-c="${ci}" onchange="profeCelda('${c.id}','${d}',this)" onkeydown="profeTecla(event,this)" aria-label="${escapeHtml(c.nombre)}, ${profeFecha(d, true)}">
        ${s ? `<button class="profe-check ${s.hecha ? 'on' : ''}" onclick="profeHecha('${s.id}')" aria-label="${s.hecha ? 'Marcar como no dada' : 'Marcar como dada'}"></button>` : ''}
    </div></td>`;
}

function renderPendientesProfe() {
    const pend = profePendientes();
    if (!pend.length) return '';
    const p = datosProfe();
    return `<div class="profe-pendientes">
        <div class="uni-etiqueta">pendientes. <span>lo que no se dio en su día.</span></div>
        ${pend.map(s => {
            const c = p.clases.find(x => x.id === s.claseId);
            return `<div class="profe-pend-fila">
                <span class="profe-pend-clase">${escapeHtml(c.nombre)}</span>
                <div class="profe-pend-txt"><b>${escapeHtml(s.titulo)}</b><small>era el ${profeFecha(s.fecha, true)}.</small></div>
                <div class="profe-pend-botones">
                    <button class="pedido-btn" onclick="profeHecha('${s.id}')">ya la di.</button>
                    <button class="pedido-btn" onclick="profeAlHueco('${s.id}')" title="La lleva al primer día libre de esa clase, sin mover lo demás">al siguiente hueco.</button>
                    <button class="pedido-btn pedido-btn-principal" onclick="profeCorrer('${s.id}')" title="La pone en la próxima clase y retrasa una sesión todo lo que venía detrás">correr el temario.</button>
                </div>
            </div>`;
        }).join('')}
    </div>`;
}

function profeMover(dir) {
    profeDesde = profeSumar(profeDesde || profeLunes(isoLocal(new Date())), dir * 7 * (profeSemanas === 4 ? 4 : 1));
    render();
}

async function guardarProfe(mensaje) {
    try { await saveData(); if (mensaje) showToast(mensaje); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}

// Se repinta solo la casilla, no el cuadrante: la escritura sigue en la
// casilla siguiente (Tab o Intro) y repintarlo todo le quitaría el foco.
function profeCelda(claseId, fecha, input) {
    const p = datosProfe();
    const c = p.clases.find(x => x.id === claseId);
    if (!c) return;
    const valor = input.value.trim();
    const s = profeSesion(claseId, fecha);
    if (!valor && s) p.sesiones = p.sesiones.filter(x => x !== s);
    else if (s) s.titulo = valor;
    else if (valor) p.sesiones.push({ id: 'ses_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), claseId, fecha, titulo: valor, hecha: false });
    const td = input.closest('td');
    if (td) td.outerHTML = renderCeldaProfe(c, fecha, Number(input.dataset.f), Number(input.dataset.c), isoLocal(new Date()));
    const bloque = document.getElementById('profe-pendientes');
    if (bloque) bloque.innerHTML = renderPendientesProfe();
    guardarProfe();
}

function profeTecla(e, input) {
    const f = Number(input.dataset.f), c = Number(input.dataset.c);
    let destino = null;
    if (e.key === 'Enter' || e.key === 'ArrowDown') destino = [f + (e.shiftKey && e.key === 'Enter' ? -1 : 1), c];
    else if (e.key === 'ArrowUp') destino = [f - 1, c];
    if (!destino) return;
    const sig = input.closest('table')?.querySelector(`input[data-f="${destino[0]}"][data-c="${destino[1]}"]`);
    e.preventDefault();
    if (sig) sig.focus(); else input.blur();
}

function profeHecha(id) {
    const s = datosProfe().sesiones.find(x => x.id === id);
    if (!s) return;
    s.hecha = !s.hecha;
    render();
    guardarProfe();
}

function profeAlHueco(id) {
    const p = datosProfe();
    const s = p.sesiones.find(x => x.id === id);
    const c = s && p.clases.find(x => x.id === s.claseId);
    if (!c) return;
    s.fecha = profeSiguienteHueco(c, isoLocal(new Date()), s.id);
    render();
    guardarProfe(`Pasa al ${profeFecha(s.fecha, true)}.`);
}

// La sesión atrasada ocupa la próxima clase y cada una de las siguientes
// sin dar se corre a la clase de después, conservando el orden del
// temario. Las ya dadas no se tocan y sus días se saltan.
function profeCorrer(id) {
    const p = datosProfe();
    const s = p.sesiones.find(x => x.id === id);
    const c = s && p.clases.find(x => x.id === s.claseId);
    if (!c) return;
    const hoy = isoLocal(new Date());
    const deClase = p.sesiones.filter(x => x.claseId === c.id);
    const ocupados = new Set(deClase.filter(x => x.hecha && x.fecha >= hoy).map(x => x.fecha));
    const aMover = [s, ...deClase.filter(x => x !== s && !x.hecha && x.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha))];
    let d = hoy;
    aMover.forEach(x => {
        while (!profeEsLectivo(c, d) || ocupados.has(d)) d = profeSumar(d, 1);
        x.fecha = d;
        d = profeSumar(d, 1);
    });
    render();
    guardarProfe(`${c.nombre}: ${aMover.length} ${aMover.length === 1 ? 'sesión corrida' : 'sesiones corridas'}.`);
}

function openClaseProfe(id) {
    const c = id ? datosProfe().clases.find(x => x.id === id) : null;
    window._profeDias = [...(c?.dias || [])];
    showModal(`
        <div class="modal-title">${c ? 'editar clase.' : 'nueva clase.'}</div>
        <div class="modal-label">grupo</div>
        <input id="profe-nombre" class="modal-input" value="${escapeHtml(c?.nombre || '')}" placeholder="3º ESO B, 1º Bachillerato A...">
        <div class="modal-label">materia</div>
        <input id="profe-materia" class="modal-input" value="${escapeHtml(c?.materia || '')}" placeholder="Lengua castellana">
        <div class="modal-label">días que tienes esta clase</div>
        <div class="profe-dias-elegir">${[1, 2, 3, 4, 5, 6].map(d => `<button type="button" class="profe-chip ${window._profeDias.includes(d) ? 'activa' : ''}" onclick="profeDiaElegir(${d},this)">${PROFE_DIAS[d]}</button>`).join('')}</div>
        <div class="finance-modal-note">Si no marcas ninguno, cuenta de lunes a viernes. Con los días, el cuadrante apaga los demás y "repartir temario." y "correr el temario." saben dónde van las sesiones.</div>
        <button class="btn-modal-primary" onclick="guardarClaseProfe('${c?.id || ''}')">guardar.</button>
        ${c ? `<button class="btn-secondary" style="margin-top:8px;color:#dc2626" onclick="borrarClaseProfe('${c.id}')">eliminar clase.</button>` : ''}
    `);
    setTimeout(() => document.getElementById('profe-nombre')?.focus(), 50);
}

function profeDiaElegir(d, btn) {
    const dias = window._profeDias;
    if (dias.includes(d)) window._profeDias = dias.filter(x => x !== d); else dias.push(d);
    btn.classList.toggle('activa');
}

function guardarClaseProfe(id) {
    const nombre = document.getElementById('profe-nombre')?.value.trim();
    if (!nombre) { showToast('Ponle nombre al grupo', true); return; }
    const materia = document.getElementById('profe-materia')?.value.trim() || '';
    const dias = [...window._profeDias].sort();
    const p = datosProfe();
    const c = id && p.clases.find(x => x.id === id);
    if (c) Object.assign(c, { nombre, materia, dias });
    else p.clases.push({ id: 'clase_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), nombre, materia, dias });
    closeModal();
    render();
    guardarProfe(c ? 'Clase actualizada' : 'Clase añadida');
}

function borrarClaseProfe(id) {
    const p = datosProfe();
    const c = p.clases.find(x => x.id === id);
    if (!c) return;
    const n = p.sesiones.filter(s => s.claseId === id).length;
    if (!confirm(`¿Eliminar ${c.nombre}${n ? ` y sus ${n} sesiones` : ''}?`)) return;
    p.clases = p.clases.filter(x => x.id !== id);
    p.sesiones = p.sesiones.filter(s => s.claseId !== id);
    closeModal();
    render();
    guardarProfe('Clase eliminada');
}

function openRepartirProfe() {
    const p = datosProfe();
    if (!p.clases.length) { openClaseProfe(); return; }
    showModal(`
        <div class="modal-title">repartir temario.</div>
        <p class="finance-modal-note" style="margin-top:0">Pega los temas o sesiones, uno por línea, y se colocan en los días de esa clase a partir de la fecha que elijas. Los días que ya tienen algo se saltan.</p>
        <div class="modal-label">clase</div>
        <select id="profe-rep-clase" class="modal-input">${p.clases.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}${c.materia ? ` · ${escapeHtml(c.materia)}` : ''}</option>`).join('')}</select>
        <div class="modal-label">desde</div>
        <input id="profe-rep-desde" class="modal-input" type="date" value="${isoLocal(new Date())}">
        <div class="modal-label">sesiones</div>
        <textarea id="profe-rep-lineas" class="modal-input" rows="8" placeholder="Tema 1. La comunicación&#10;Tema 1. Ejercicios&#10;Tema 2. El sustantivo&#10;Examen tema 1 y 2"></textarea>
        <button class="btn-modal-primary" onclick="repartirProfe()">repartir.</button>
    `);
}

function repartirProfe() {
    const p = datosProfe();
    const c = p.clases.find(x => x.id === document.getElementById('profe-rep-clase')?.value);
    const lineas = (document.getElementById('profe-rep-lineas')?.value || '').split('\n').map(l => l.trim()).filter(Boolean);
    if (!c || !lineas.length) { showToast('Escribe al menos una sesión', true); return; }
    let d = document.getElementById('profe-rep-desde')?.value || isoLocal(new Date());
    lineas.forEach((titulo, i) => {
        d = profeSiguienteHueco(c, d);
        p.sesiones.push({ id: 'ses_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 6), claseId: c.id, fecha: d, titulo, hecha: false });
        d = profeSumar(d, 1);
    });
    const ultima = profeSumar(d, -1);
    profeDesde = profeLunes(document.getElementById('profe-rep-desde')?.value || isoLocal(new Date()));
    closeModal();
    render();
    guardarProfe(`${lineas.length} ${lineas.length === 1 ? 'sesión repartida' : 'sesiones repartidas'}, hasta el ${profeFecha(ultima, true)}.`);
}

const PROFE_PROMPT_IA = `Te paso mi cuadrante de clases (puede ser un Excel, una foto o un documento). Conviértelo en JSON para importarlo en Bitácora, con exactamente esta forma:

{"clases":[{"nombre":"3º ESO B","materia":"Lengua","dias":[1,3,5]}],"sesiones":[{"clase":"3º ESO B","fecha":"2026-10-13","titulo":"Tema 2. El sustantivo","hecha":false}]}

Reglas:
- "clases": un elemento por grupo. "dias" son los días de la semana que tengo esa clase: 1 lunes, 2 martes, 3 miércoles, 4 jueves, 5 viernes, 6 sábado.
- "sesiones": una por clase y día. "clase" tiene que coincidir con el "nombre" de su clase.
- "fecha" en formato AAAA-MM-DD. Si el cuadrante va por semanas o por número de sesión y no trae fechas, pregúntame antes cuándo empieza el curso, qué días tengo cada clase y qué festivos hay, y calcula las fechas con eso.
- "titulo": lo que toca ese día, corto. Si hay más detalle, resúmelo dentro del título.
- "hecha": true solo si el cuadrante indica que esa sesión ya se dio.
- No inventes sesiones ni contenidos que no estén en el cuadrante.
- Responde solo con el JSON, sin explicaciones ni texto alrededor.`;

function openImportarProfe() {
    showModal(`
        <div class="modal-title">importar con ia.</div>
        <ol class="profe-pasos">
            <li>Copia esta instrucción y pégala en Claude, ChatGPT o la IA que uses, junto con tu cuadrante (Excel, PDF o una foto).</li>
            <li>Copia lo que te devuelva y pégalo abajo. No se pierde nada de lo que ya tengas aquí: lo nuevo se suma.</li>
        </ol>
        <pre class="profe-prompt">${escapeHtml(PROFE_PROMPT_IA)}</pre>
        <button class="btn-secondary" onclick="navigator.clipboard.writeText(PROFE_PROMPT_IA).then(()=>showToast('Instrucción copiada'))">copiar instrucción.</button>
        <div class="modal-label" style="margin-top:14px">respuesta de la ia</div>
        <textarea id="profe-json" class="modal-input" rows="6" placeholder='{"clases":[...],"sesiones":[...]}'></textarea>
        <button class="btn-modal-primary" onclick="importarProfe()">importar.</button>
    `);
}

function importarProfe() {
    const texto = document.getElementById('profe-json')?.value || '';
    let datos;
    try { datos = JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1)); } catch (e) { showToast('No se ha podido leer: pega solo el JSON que te dio la IA', true); return; }
    const p = datosProfe();
    const porNombre = new Map(p.clases.map(c => [c.nombre.trim().toLowerCase(), c]));
    let nuevasClases = 0, nuevas = 0, repetidas = 0;
    const claseDe = (nombre, materia, dias) => {
        const clave = String(nombre || '').trim().toLowerCase();
        if (!clave) return null;
        let c = porNombre.get(clave);
        if (!c) {
            c = { id: 'clase_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), nombre: String(nombre).trim(), materia: materia || '', dias: [] };
            p.clases.push(c); porNombre.set(clave, c); nuevasClases++;
        }
        if (!c.materia && materia) c.materia = String(materia);
        if (!(c.dias || []).length && Array.isArray(dias)) c.dias = dias.map(Number).filter(d => d >= 1 && d <= 6).sort();
        return c;
    };
    (Array.isArray(datos.clases) ? datos.clases : []).forEach(c => claseDe(c.nombre, c.materia, c.dias));
    (Array.isArray(datos.sesiones) ? datos.sesiones : []).forEach((s, i) => {
        const c = claseDe(s.clase);
        const fecha = String(s.fecha || '').slice(0, 10);
        const titulo = String(s.titulo || '').trim();
        if (!c || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !titulo) return;
        if (profeSesion(c.id, fecha)) { repetidas++; return; }
        p.sesiones.push({ id: 'ses_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 6), claseId: c.id, fecha, titulo, hecha: !!s.hecha });
        nuevas++;
    });
    if (!nuevasClases && !nuevas) { showToast(repetidas ? 'Todo eso ya estaba en tu cuadrante' : 'No había clases ni sesiones que importar', true); return; }
    closeModal();
    render();
    guardarProfe(`${nuevasClases ? `${nuevasClases} ${nuevasClases === 1 ? 'clase' : 'clases'} y ` : ''}${nuevas} ${nuevas === 1 ? 'sesión importada' : 'sesiones importadas'}${repetidas ? `, ${repetidas} ya estaban` : ''}.`);
}
