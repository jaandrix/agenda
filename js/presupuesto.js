// ============================================================
//  PRESUPUESTO DEL MES (29-10)
//  Una sola vista para la planificación del sueldo y los presupuestos: los mismos datos de siempre
//  (financeProfile.budgetPlans[mes], el historial en budgetHistory). Cuatro cifras arriba: ingresos (sueldo +
//  aportaciones), presupuestos (casillas normales), compromisos (las automáticas: suscripciones y gastos fijos) y sin
//  asignar. Las devoluciones no tocan el reparto: amplían lo disponible de su categoría.
//  Editar trabaja sobre un borrador: nada cambia hasta «guardar planificación.», y «cancelar.» lo descarta.
// ============================================================
let presupuestoMes = null;
let presupuestoBorrador = null;
let presupuestoGuardando = false;

const presRedondo = v => Math.round((Number(v) || 0) * 100) / 100;

// Sin efectos: recibe el plan (o el registro del historial) y devuelve las cifras.
function financeBudgetUnifiedModel(month, plan, recorded) {
    const allocations = (plan?.allocations || []);
    const salary = Number(plan?.salary) || 0;
    const contributionsPlanned = Number(plan?.contributions) || 0;
    // Lo que de verdad ha entrado como aportación este mes (regalos, Bizum de la familia...): si es más de lo previsto,
    // manda, que es dinero que tienes para repartir.
    const contributionsReal = presRedondo((financePro.transactions || []).filter(t => t.type === 'income' && t.date?.startsWith(month) && !financeProNeutro(t)
        && /aportaci/i.test(financeProCategoryById(t.category)?.name || '')).reduce((s, t) => s + (Number(t.amount) || 0), 0));
    const contributions = Math.max(contributionsPlanned, contributionsReal);
    const income = presRedondo(salary + contributions);
    const normales = allocations.filter(a => !a.auto);
    const autos = allocations.filter(a => a.auto);
    const manualAssigned = presRedondo(normales.reduce((s, a) => s + (Number(a.amount) || 0), 0));
    const commitmentsAssigned = presRedondo(autos.reduce((s, a) => s + (Number(a.amount) || 0), 0));
    const totalAssigned = presRedondo(manualAssigned + commitmentsAssigned);
    const porCat = {};
    normales.filter(a => a.categoryId).forEach(a => { (porCat[a.categoryId] ||= []).push(a); });
    const categories = Object.entries(porCat).map(([categoryId, l]) => {
        const cat = financeProCategoryById(categoryId);
        const planned = presRedondo(l.reduce((s, a) => s + (Number(a.amount) || 0), 0));
        // El gasto de la categoría una sola vez, aunque tenga varias casillas.
        const refunded = presRedondo(financeProCategoryRefunds(categoryId, month));
        const spent = presRedondo(financeProCategoryExpense(categoryId, month));
        const available = presRedondo(planned + refunded);
        const remaining = presRedondo(available - spent);
        const percentage = available > 0 ? spent / available * 100 : spent > 0 ? 100 : 0;
        const status = remaining < 0 ? 'superado' : percentage >= 80 ? 'aviso' : 'normal';
        return { categoryId, name: cat?.name || l[0].label || 'categoría', allocations: l, planned, refunded, available, spent, remaining, percentage, status };
    }).sort((a, b) => b.planned - a.planned);
    const unlinkedAllocations = normales.filter(a => !a.categoryId);
    const commitments = autos.map(a => {
        const tipo = a.auto;
        const lista = entries.filter(e => e.type === tipo && e.active !== false);
        const confirmados = lista.filter(e => recurrenteEstadoMes(e, month) === 'banco').length;
        return { allocation: a, tipo, nombre: a.label || BUDGET_CASILLAS_AUTO[tipo], planned: presRedondo(a.amount), charged: presRedondo(budgetAutoGastado(tipo, month)), n: lista.length, confirmados, manual: !!a.limiteManual };
    });
    return { month, salary, contributions, contributionsPlanned, contributionsReal, income, manualAssigned, commitmentsAssigned, totalAssigned, remaining: presRedondo(income - totalAssigned), categories, unlinkedAllocations, commitments, recorded: !!recorded };
}

function presupuestoPlanDe(month) {
    const recorded = (financeProfile.budgetHistory || []).find(h => h.month === month) || null;
    if (recorded) return { plan: recorded, recorded };
    ensureLongTermData();
    return { plan: getBudgetPlanForMonth(month), recorded: null };
}

function renderFinanceBudgetUnifiedPanel() {
    ensureLongTermData();
    const month = presupuestoMes || financeMonthKey();
    const editando = presupuestoBorrador?.month === month;
    const { plan, recorded } = editando ? { plan: presupuestoBorrador.plan, recorded: null } : presupuestoPlanDe(month);
    const m = financeBudgetUnifiedModel(month, plan, recorded);
    const vacio = !editando && !recorded && !m.salary && !m.contributions && !plan.allocations.some(a => !a.auto);
    const acciones = editando ? '' : recorded
        ? `<button class="vista-btn" onclick="presupuestoReabrir()">reabrir mes.</button>`
        : vacio ? `<button class="vista-btn" onclick="enterFinanceBudgetEdit()"><i class='ico ico-lapiz' aria-hidden=true></i> crear planificación.</button>`
        : `<button class="vista-btn" onclick="enterFinanceBudgetEdit()"><i class='ico ico-lapiz' aria-hidden=true></i> editar planificación.</button><button class="vista-btn" onclick="presupuestoCerrarMes()">cerrar mes.</button>`;
    return `<section class="finance-panel pres" id="pres-panel" aria-label="presupuesto del mes">
        <div class="pres-cab">
            <div>
                <div class="pres-mes">
                    <button class="pres-flecha" onclick="presupuestoCambiarMes(-1)" aria-label="mes anterior" ${editando ? 'disabled' : ''}><i class='ico ico-izq' aria-hidden=true></i></button>
                    <span>${escapeHtml(financeMonthLabel(month))}</span>
                    <button class="pres-flecha" onclick="presupuestoCambiarMes(1)" aria-label="mes siguiente" ${editando ? 'disabled' : ''}><i class='ico ico-der' aria-hidden=true></i></button>
                </div>
                <h3 class="pres-titulo">presupuesto del mes.</h3>
                <p class="pres-explica">${recorded ? 'Mes cerrado: lo que planificaste frente a lo que gastaste.' : vacio ? 'Reparte lo que entra este mes entre lo que vas a gastar.' : 'Lo que entra, lo que reservas y lo que puedes gastar.'}</p>
            </div>
            <div class="pres-acciones">${acciones}</div>
        </div>
        <div id="pres-resumen">${renderFinanceBudgetSummary(m, editando)}</div>
        ${editando ? renderFinanceBudgetEditor(m) : `${renderFinanceBudgetRows(m)}${renderFinanceBudgetCommitments(m)}`}
    </section>`;
}

function renderFinanceBudgetSummary(m, editando) {
    const pct = v => m.income > 0 ? Math.max(0, Math.min(100, v / m.income * 100)) : 0;
    const aport = m.contributionsReal > m.contributionsPlanned ? `${financeMoney(m.contributions)} de aportaciones (${financeMoney(m.contributionsPlanned)} previstas)` : `${financeMoney(m.contributions)} de aportaciones`;
    return `<div class="pres-resumen">
        ${editando ? `<div class="pres-editar-ingresos">
            <label class="pres-campo"><span>sueldo.</span><input type="number" inputmode="decimal" min="0" step="0.01" value="${m.salary || ''}" placeholder="0,00" oninput="updateFinanceBudgetDraft('salary', this.value)"></label>
            <label class="pres-campo"><span>aportaciones previstas.</span><input type="number" inputmode="decimal" min="0" step="0.01" value="${m.contributionsPlanned || ''}" placeholder="0,00" oninput="updateFinanceBudgetDraft('contributions', this.value)">${m.contributionsReal ? `<small>Este mes han entrado ${financeMoney(m.contributionsReal)}.</small>` : ''}</label>
        </div>` : ''}
        <div class="pres-cifras">
            <div class="pres-cifra pres-cifra-ing"><span>ingresos del mes.</span><b>${financeMoney(m.income)}</b><small>${financeMoney(m.salary)} de sueldo y ${aport}.</small></div>
            <div class="pres-cifra"><span>presupuestos.</span><b>${financeMoney(m.manualAssigned)}</b></div>
            <div class="pres-cifra"><span>compromisos.</span><b>${financeMoney(m.commitmentsAssigned)}</b></div>
            <div class="pres-cifra pres-sin ${m.remaining < 0 ? 'superado' : ''}" aria-live="polite"><span>sin asignar.</span><b>${financeMoney(m.remaining)}</b>${m.remaining < 0 ? '<small>Has repartido más de lo que entra.</small>' : ''}</div>
        </div>
        <div class="pres-reparto" role="img" aria-label="repartido el ${Math.round(pct(m.totalAssigned))} % de lo que entra"><i class="pres-reparto-pres" style="width:${pct(m.manualAssigned)}%"></i><i class="pres-reparto-comp" style="width:${pct(m.commitmentsAssigned)}%"></i></div>
    </div>`;
}

function presupuestoEstadoTexto(c) {
    return c.remaining < 0 ? `${financeMoney(-c.remaining)} por encima` : `quedan ${financeMoney(c.remaining)}`;
}

function renderFinanceBudgetRows(m) {
    if (!m.categories.length && !m.unlinkedAllocations.length) return m.income ? '<p class="pres-nada">Todo está sin asignar: todavía no has puesto presupuestos.</p>' : '';
    return `<div class="pres-tabla">
        <div class="pres-tabla-cab" aria-hidden="true"><span>categoría.</span><span>plan.</span><span>este mes.</span><span></span><span>estado.</span></div>
        ${m.categories.map(c => {
            const cat = financeProCategoryById(c.categoryId);
            const sub = [c.refunded > 0 ? `${financeMoney(c.refunded)} devueltos` : '', c.allocations.length > 1 ? `${c.allocations.length} casillas` : ''].filter(Boolean).join(', ');
            return `<div class="pres-fila ${c.status}">
                <div class="pres-fila-cat">${financeProCategoryBadge(cat, 'pres-icono')}<span><b>${escapeHtml(c.name)}</b>${sub ? `<small>${sub}.</small>` : ''}</span></div>
                <div class="pres-fila-plan"><small>plan. </small>${financeMoney(c.planned)}</div>
                <div class="pres-fila-gasto"><b>${financeMoney(c.spent)}</b> <small>de ${financeMoney(c.available)}</small></div>
                <div class="pres-barra" role="img" aria-label="${Math.round(c.percentage)} % gastado"><i class="estado-color" style="width:${Math.min(100, Math.max(2, c.percentage))}%"></i></div>
                <div class="pres-estado estado-color">${presupuestoEstadoTexto(c)}</div>
            </div>`;
        }).join('')}
        ${m.unlinkedAllocations.length ? `<div class="pres-otros"><b>otros destinos.</b>${m.unlinkedAllocations.map(a => `<span>${escapeHtml(a.label || 'sin nombre')} ${financeMoney(a.amount)}</span>`).join('')}<small>Cuentan como repartido; sin categoría no se puede seguir su gasto.</small></div>` : ''}
    </div>`;
}

function renderFinanceBudgetCommitments(m) {
    if (!m.commitments.length) return '';
    const icono = tipo => financeProCategoryIconSvg(tipo === 'subscription' ? 'subscriptions' : 'home');
    return `<div class="pres-compromisos">
        ${m.commitments.map(c => `<div class="pres-compromiso ${c.planned > 0 && c.charged > c.planned ? 'superado' : ''}">
            <span class="pres-compromiso-icono" aria-hidden="true">${icono(c.tipo)}</span>
            <span><small>${escapeHtml(c.nombre)}.</small><b>${financeMoney(c.planned)}</b><small>${c.n} ${c.n === 1 ? 'cargo previsto' : 'cargos previstos'}, ${financeMoney(c.charged)} cargados, ${c.confirmados} confirmados por el banco.</small></span>
        </div>`).join('')}
        <button class="asig-enlace" onclick="openRecurringExpensesModal()">ver compromisos.</button>
    </div>`;
}

// ---- edición ----
function renderFinanceBudgetEditor(m) {
    const cats = (financePro.categories || []).filter(c => c.type === 'expense');
    const casilla = a => `<div class="pres-casilla" data-id="${a.id}">
        <label class="pres-campo pres-campo-nombre"><span>casilla.</span><input value="${escapeHtml(a.label || '')}" placeholder="alquiler, ahorro, ocio..." oninput="updateFinanceBudgetDraft('label', this.value, '${a.id}')"></label>
        <label class="pres-campo"><span>importe.</span><input type="number" inputmode="decimal" min="0" step="0.01" value="${a.amount || ''}" placeholder="0,00" oninput="updateFinanceBudgetDraft('amount', this.value, '${a.id}')"></label>
        <label class="pres-campo"><span>categoría.</span><select onchange="updateFinanceBudgetDraft('categoryId', this.value, '${a.id}')"><option value="">otros destinos</option>${cats.map(c => `<option value="${c.id}" ${a.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select></label>
        <button class="vista-icono-btn" onclick="presupuestoQuitarCasilla('${a.id}')" aria-label="quitar ${escapeHtml(a.label || 'casilla')}"><i class='ico ico-x' aria-hidden=true></i></button>
    </div>`;
    const gastoDe = c => `<small class="pres-casilla-gasto">${financeMoney(c.spent)} gastados${c.refunded > 0 ? `, +${financeMoney(c.refunded)} devueltos` : ''}, ${presupuestoEstadoTexto(c)}</small>`;
    return `<div class="pres-bloque">
        <div class="pres-bloque-tit">presupuestos.</div>
        ${m.categories.map(c => `<div class="pres-grupo"><b>${escapeHtml(c.name)}</b>${gastoDe(c)}${c.allocations.map(casilla).join('')}</div>`).join('')}
        ${m.unlinkedAllocations.length ? `<div class="pres-grupo"><b>otros destinos.</b><small class="pres-casilla-gasto">Cuentan como repartido; sin categoría no se sigue el gasto.</small>${m.unlinkedAllocations.map(casilla).join('')}</div>` : ''}
        <button class="vista-btn" onclick="presupuestoAnadirCasilla()">+ casilla.</button>
    </div>
    ${m.commitments.length ? `<div class="pres-bloque">
        <div class="pres-bloque-tit">compromisos.</div>
        ${m.commitments.map(c => `<div class="pres-casilla" data-id="${c.allocation.id}">
            <span class="pres-campo pres-campo-nombre"><span>${escapeHtml(c.nombre)}.</span><small>${c.n} activos, ${financeMoney(budgetAutoResumen(c.tipo).total)} al mes, ${financeMoney(c.charged)} cargados</small></span>
            <label class="pres-campo"><span>límite.</span><input type="number" inputmode="decimal" min="0" step="0.01" value="${c.planned || ''}" placeholder="0,00" oninput="updateFinanceBudgetDraft('amount', this.value, '${c.allocation.id}')"></label>
            <button class="vista-icono-btn" onclick="presupuestoQuitarCasilla('${c.allocation.id}')" aria-label="quitar ${escapeHtml(c.nombre)} de este mes"><i class='ico ico-x' aria-hidden=true></i></button>
        </div>`).join('')}
    </div>` : ''}
    <div class="pres-guardar">
        <button class="vista-btn" onclick="presupuestoHeredar()">copiar el mes anterior.</button>
        <span class="pres-guardar-der">
            <button class="vista-btn" onclick="cancelFinanceBudgetEdit()" ${presupuestoGuardando ? 'disabled' : ''}>cancelar.</button>
            <button class="btn-modal-primary" onclick="saveFinanceBudgetDraft()" ${presupuestoGuardando ? 'disabled' : ''}>${presupuestoGuardando ? 'guardando.' : 'guardar planificación.'}</button>
        </span>
    </div>`;
}

function presupuestoRepintar() {
    const el = document.getElementById('pres-panel');
    if (el) el.outerHTML = renderFinanceBudgetUnifiedPanel();
}

function enterFinanceBudgetEdit() {
    const month = presupuestoMes || financeMonthKey();
    const { plan } = presupuestoPlanDe(month);
    presupuestoBorrador = { month, plan: JSON.parse(JSON.stringify(plan)) };
    presupuestoRepintar();
}

// Cada pulsación cambia el borrador y repinta solo las cifras de arriba; elegir categoría repinta el editor.
function updateFinanceBudgetDraft(campo, valor, id) {
    if (!presupuestoBorrador) return;
    const plan = presupuestoBorrador.plan;
    if (!id) plan[campo] = Math.max(0, Number(valor) || 0);
    else {
        const a = plan.allocations.find(x => x.id === id);
        if (!a) return;
        if (campo === 'amount') { a.amount = Math.max(0, Number(valor) || 0); if (a.auto) a.limiteManual = true; }
        else a[campo] = valor;
    }
    if (campo === 'categoryId') { presupuestoRepintar(); return; }
    const res = document.getElementById('pres-resumen');
    if (res && campo !== 'label') {
        const m = financeBudgetUnifiedModel(presupuestoBorrador.month, plan, null);
        const sin = res.querySelector('.pres-sin');
        if (sin) { sin.classList.toggle('superado', m.remaining < 0); sin.querySelector('b').textContent = financeMoney(m.remaining); }
        res.querySelectorAll('.pres-cifra:not(.pres-editable):not(.pres-sin) b').forEach((b, i) => { b.textContent = financeMoney([m.income, m.manualAssigned, m.commitmentsAssigned][i]); });
        const pct = v => m.income > 0 ? Math.max(0, Math.min(100, v / m.income * 100)) : 0;
        const p = res.querySelector('.pres-reparto-pres'), c = res.querySelector('.pres-reparto-comp');
        if (p) p.style.width = pct(m.manualAssigned) + '%';
        if (c) c.style.width = pct(m.commitmentsAssigned) + '%';
    }
}
function presupuestoAnadirCasilla() {
    presupuestoBorrador?.plan.allocations.push({ id: 'ba_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), label: '', amount: 0, categoryId: '' });
    presupuestoRepintar();
}
function presupuestoQuitarCasilla(id) {
    const plan = presupuestoBorrador?.plan;
    if (!plan) return;
    const a = plan.allocations.find(x => x.id === id);
    if (a?.auto) plan.autoQuitadas = { ...(plan.autoQuitadas || {}), [a.auto]: true };
    plan.allocations = plan.allocations.filter(x => x.id !== id);
    presupuestoRepintar();
}
// Copia al borrador el mes anterior (grabado o en planificación); no se guarda hasta «guardar planificación.».
function presupuestoHeredar() {
    const month = presupuestoBorrador?.month;
    if (!month) return;
    const prev = longtermMonthOffset(month, -1);
    const fuente = (financeProfile.budgetHistory || []).find(h => h.month === prev) || financeProfile.budgetPlans?.[prev];
    if (!fuente || (!fuente.salary && !fuente.contributions && !(fuente.allocations || []).length)) { showToast('No hay planificación de ' + financeMonthLabel(prev), true); return; }
    presupuestoBorrador.plan = { salary: Number(fuente.salary) || 0, contributions: Number(fuente.contributions) || 0,
        allocations: (fuente.allocations || []).map(a => ({ ...a, id: 'ba_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) })), autoQuitadas: { ...(fuente.autoQuitadas || {}) } };
    presupuestoRepintar();
}
function cancelFinanceBudgetEdit() {
    presupuestoBorrador = null;
    presupuestoRepintar();
}
// Una sola escritura. Si falla, los datos vuelven a como estaban y el borrador se queda para reintentar.
async function saveFinanceBudgetDraft() {
    if (!presupuestoBorrador || presupuestoGuardando) return;
    const { month, plan } = presupuestoBorrador;
    const antes = financeProfile.budgetPlans[month];
    presupuestoGuardando = true;
    presupuestoRepintar();
    financeProfile.budgetPlans[month] = JSON.parse(JSON.stringify(plan));
    try {
        await saveData();
        presupuestoBorrador = null;
        showToast('Planificación guardada.');
    } catch (e) {
        console.error(e);
        financeProfile.budgetPlans[month] = antes;
        showToast('No se pudo guardar la planificación. Sigue aquí para reintentar.', true);
    } finally {
        presupuestoGuardando = false;
        presupuestoRepintar();
    }
}

function presupuestoCambiarMes(delta) {
    presupuestoMes = longtermMonthOffset(presupuestoMes || financeMonthKey(), delta);
    presupuestoRepintar();
}
async function presupuestoCerrarMes() {
    longtermViewMonth = presupuestoMes || financeMonthKey();
    await recordBudgetMonth();
    presupuestoRepintar();
}
async function presupuestoReabrir() {
    const month = presupuestoMes || financeMonthKey();
    await editBudgetHistoryMonth(month);
    presupuestoRepintar();
}

// Desde «largo plazo»: la planificación vive ahora en Finanzas (pestaña planificación; en el móvil, en Finanzas).
function presupuestoAbrir() {
    closeModal();
    if (mobileStandaloneActive) mobileIr('finances');
    else { if (currentView !== 'finances') switchView('finances'); cambiarPestanaFinanzas('planificacion'); }
    setTimeout(() => document.getElementById('pres-panel')?.scrollIntoView({ block: 'start', behavior: vtReducido() ? 'auto' : 'smooth' }), 350);
}
