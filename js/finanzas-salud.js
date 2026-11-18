        // ============================================================
        //  FINANZAS, SALUD (0.25): lo que GPT encontró al leer el Markdown de unas finanzas reales. Ingresos y gastos
        //  inflados por bolsillos, traspasos, inversión y devoluciones; presupuestos con casillas repetidas; un fondo de
        //  emergencia sin medida; ingresos irregulares sin colchón propio.
        //  Todo lo de aquí calcula sin tocar nada, salvo saludAccion, que es la única entrada para escribir (la web la
        //  llama dentro de commitFinanceChange y la app del iPhone por finanzas-puente.js). Nada se reclasifica solo:
        //  saludPropuestas propone y la persona acepta una a una (o todas las de un tipo).
        //  Datos nuevos: financePro.salud (ajustes, cierres, rutinas), en cada movimiento reembolsoDe y revisado, en
        //  cada suscripción ultimoUso y revisadaEn, en cada cuenta de inversión fondo, en cada deseo esperaHasta y en
        //  financeProfile.estabilizacion { saldo, objetivo, base }.
        // ============================================================
        const SALUD_BOLSILLO = /\bpockets?\b|\bhucha\b|bolsillo|\bvaults?\b|savings|flexible cash|cash funds?|money market|fondo monetario|\bfrom eur [a-z]|\bto eur [a-z]/i;
        const SALUD_INVERSION = /myinvestor|indexa|inversis|trade ?republic|vanguard|amundi|fidelity|\bisin\b|fondo index|suscripci[oó]n (?:de )?fondo|compra (?:de )?(?:participaciones|fondo)/i;
        const SALUD_REEMBOLSO = /refund|reembols|devoluc|devuelt|revert|reversal|retroced|anulaci[oó]n|chargeback|abono (?:de )?compra/i;
        const SALUD_ESENCIAL = /alquiler|hipoteca|vivienda|\bluz\b|\bagua\b|\bgas\b|electric|internet|tel[eé]fono|m[oó]vil|seguro|supermercado|alimentaci|transporte|gasolina|combustible|farmacia|salud|suministro|comunidad|matr[ií]cula|universidad/i;
        const SALUD_NETO = /compras|coleccionab/i;
        const SALUD_TRAMOS = [{ hasta: 700, importe: 50 }, { hasta: 900, importe: 100 }, { hasta: null, importe: 150 }];

        const saludRedondo = v => Math.round((Number(v) || 0) * 100) / 100;
        const saludConcepto = t => String(t?.bankNote ?? t?.note ?? '');

        function saludAjustes() {
            const s = (financePro.salud && typeof financePro.salud === 'object') ? financePro.salud : {};
            return {
                esenciales: Array.isArray(s.esenciales) ? s.esenciales : null,
                mesesObjetivo: Number(s.mesesObjetivo) > 0 ? Number(s.mesesObjetivo) : 3,
                umbralFondo: Number(s.umbralFondo) > 0 ? Number(s.umbralFondo) : 1500,
                tramos: Array.isArray(s.tramos) && s.tramos.length ? s.tramos : SALUD_TRAMOS,
                extraEmergencia: Number.isFinite(Number(s.extraEmergencia)) && s.extraEmergencia !== undefined ? Number(s.extraEmergencia) : 50,
                ordinario: Number(s.ordinario) > 0 ? Number(s.ordinario) : null,
                avisos: s.avisos && typeof s.avisos === 'object' ? s.avisos : {},
                ultimaSemanal: s.ultimaSemanal || null,
                cierres: s.cierres && typeof s.cierres === 'object' ? s.cierres : {}
            };
        }

        function saludGuardarAjuste(k, v) {
            if (!financePro.salud || typeof financePro.salud !== 'object') financePro.salud = {};
            if (v === undefined || v === null) delete financePro.salud[k];
            else financePro.salud[k] = v;
        }

        // Índice de movimientos por id: los reembolsos vinculados se buscan muchas veces por pintado.
        let saludIndiceCache = null;
        function saludPorId(id) {
            const txs = financePro.transactions || [];
            if (!saludIndiceCache || saludIndiceCache.txs !== txs || saludIndiceCache.n !== txs.length) {
                const m = new Map();
                txs.forEach(t => { if (t && t.id != null) m.set(String(t.id), t); });
                saludIndiceCache = { txs, n: txs.length, m };
            }
            return saludIndiceCache.m.get(String(id)) || null;
        }

        // Un ingreso que devuelve una compra concreta: no es ingreso, resta del gasto (de su categoría y del total del mes).
        function saludEsReembolso(t) {
            return !!(t && t.type === 'income' && t.reembolsoDe);
        }

        function saludCompraDe(t) {
            if (!saludEsReembolso(t)) return null;
            const c = saludPorId(t.reembolsoDe);
            return c && c.type === 'expense' ? c : null;
        }

        // Lo devuelto en un mes a compras de una categoría (por la fecha de la devolución, como las devoluciones de siempre).
        function saludReembolsosCategoria(catId, monthKey) {
            let s = 0;
            (financePro.transactions || []).forEach(t => {
                if (!saludEsReembolso(t) || !String(t.date || '').startsWith(monthKey)) return;
                const c = saludCompraDe(t);
                if (c && c.category === catId && !c.viaje) s += Number(t.amount) || 0;
            });
            return s;
        }

        function saludReembolsosMes(monthKey) {
            let s = 0;
            (financePro.transactions || []).forEach(t => {
                if (!saludEsReembolso(t) || !String(t.date || '').startsWith(monthKey)) return;
                const c = saludCompraDe(t);
                if (c && !financeProNeutro(c)) s += Number(t.amount) || 0;
            });
            return s;
        }

        // ---------- 1. clasificación ----------

        function saludClase(t) {
            if (!t) return '';
            if (t.type === 'transfer') return 'traspaso';
            if (financeProEsAjuste(t)) return 'ajuste';
            if (saludEsReembolso(t)) return 'reembolso';
            if (t.ahorro) return 'ahorro';
            if (financeProEsInversion(t)) return 'inversion';
            return t.type === 'income' ? 'ingreso' : t.type === 'expense' ? 'gasto' : '';
        }

        function saludLibre(t) {
            return t && (t.type === 'income' || t.type === 'expense') && !financeProNeutro(t) && !t.recurringEntryId && !t.programadoId && !t.revisado && t.date;
        }

        function saludCategoriaInversion(tipo) {
            const fija = tipo === 'income' ? 'cat_inversion_ing' : 'cat_inversion_gasto';
            const cats = financePro.categories || [];
            return (cats.find(c => c.id === fija) || cats.find(c => c.type === tipo && financeProEsInversion({ type: tipo, category: c.id })))?.id || null;
        }

        function saludDias(a, b) {
            return Math.abs((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000);
        }

        function saludPalabras(s) {
            return new Set(financeProNormalizar(s).split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !/^\d+$/.test(w)));
        }

        // Las palabras del concepto de cada movimiento, una vez (en el iPhone, JavaScriptCore va sin JIT).
        const saludPalabrasCache = new WeakMap();
        function saludPalabrasDe(t) {
            const c = saludConcepto(t);
            const v = saludPalabrasCache.get(t);
            if (v && v.c === c) return v.p;
            const p = saludPalabras(c);
            saludPalabrasCache.set(t, { c, p });
            return p;
        }

        function saludYaDevuelto(salvo) {
            const m = new Map();
            (financePro.transactions || []).forEach(t => { if (saludEsReembolso(t) && t !== salvo) m.set(String(t.reembolsoDe), (m.get(String(t.reembolsoDe)) || 0) + (Number(t.amount) || 0)); });
            return m;
        }

        // Las compras que puede estar devolviendo un ingreso: gastos de antes (hasta 120 días), por un importe igual o
        // mayor; primero las de la misma cuenta y con alguna palabra en común, y entre ellas la de importe exacto.
        function saludComprasCandidatas(ingreso, max = 5, yaUsadas, gastos) {
            if (!ingreso || ingreso.type !== 'income' || !ingreso.date) return [];
            const pal = saludPalabrasDe(ingreso);
            const imp = Number(ingreso.amount) || 0;
            yaUsadas = yaUsadas || saludYaDevuelto(ingreso);
            const desde = financeProSumarDias(ingreso.date, -120);
            return (gastos || financePro.transactions || []).filter(t => {
                if (t.type !== 'expense' || !t.date || t.date > ingreso.date || t.date < desde || financeProNeutro(t)) return false;
                return (Number(t.amount) || 0) - (yaUsadas.get(String(t.id)) || 0) >= imp - 0.005;
            }).map(t => {
                const comun = [...saludPalabrasDe(t)].some(w => pal.has(w));
                const exacto = Math.abs((Number(t.amount) || 0) - imp) < 0.005;
                const puntos = (comun ? 4 : 0) + (t.account === ingreso.account ? 2 : 0) + (exacto ? 1 : 0) - saludDias(t.date, ingreso.date) / 200;
                return { t, puntos, comun };
            }).sort((a, b) => b.puntos - a.puntos).slice(0, max);
        }

        function saludParecido(t) {
            const c = saludConcepto(t);
            return { bolsillo: SALUD_BOLSILLO.test(c), inversion: SALUD_INVERSION.test(c), reembolso: SALUD_REEMBOLSO.test(c), bizum: /bizum/i.test(c) };
        }

        // Propuestas para lo que parece mal clasificado. Nada se aplica aquí.
        //   ahorro: bolsillos, huchas y Flexible Cash Funds; inversion: el bróker o el fondo; traspaso: la salida de una
        //   cuenta propia y la entrada en otra (mismo importe, ≤3 días, uno de los dos con pinta de transferencia o con el
        //   nombre de la otra cuenta; nunca Bizum); reembolso: un ingreso que devuelve una compra.
        function saludPropuestas() {
            const libres = (financePro.transactions || []).filter(saludLibre);
            const r = [];
            const tomadas = new Set();
            const nombres = Object.fromEntries(Object.entries(financePro.accounts || {}).map(([k, a]) => [k, financeProNormalizar(a?.name || k).trim()]));
            const nombraCuenta = (t, k) => nombres[k] && nombres[k].length >= 4 && financeProNormalizar(saludConcepto(t)).includes(nombres[k]);
            const salidas = libres.filter(t => t.type === 'expense' && !t.pendiente);
            const porImporte = new Map();
            libres.forEach(t => {
                if (t.type !== 'income' || t.pendiente) return;
                const k = Math.round((Number(t.amount) || 0) * 100);
                if (!porImporte.has(k)) porImporte.set(k, []);
                porImporte.get(k).push(t);
            });
            salidas.forEach(sal => {
                let mejor = null, mejorDias = Infinity;
                (porImporte.get(Math.round((Number(sal.amount) || 0) * 100)) || []).forEach(ent => {
                    if (tomadas.has(ent) || ent.account === sal.account) return;
                    const a = saludConcepto(sal), b = saludConcepto(ent);
                    if (/bizum/i.test(a + ' ' + b)) return;
                    const pinta = TRASPASO_CONCEPTO.test(a) || TRASPASO_CONCEPTO.test(b) || /top.?up|revolut|recarga/i.test(a + ' ' + b) || nombraCuenta(sal, ent.account) || nombraCuenta(ent, sal.account);
                    if (!pinta) return;
                    const d = saludDias(ent.date, sal.date);
                    if (d <= 3 && d < mejorDias) { mejor = ent; mejorDias = d; }
                });
                if (!mejor) return;
                tomadas.add(mejor); tomadas.add(sal);
                r.push({ tipo: 'traspaso', t: sal, con: mejor, motivo: `sale de ${financeProCuentaNombre(sal.account)} y entra en ${financeProCuentaNombre(mejor.account)} el mismo importe.` });
            });
            const yaUsadas = saludYaDevuelto(null);
            const gastos = (financePro.transactions || []).filter(t => t.type === 'expense' && t.date && !financeProNeutro(t));
            libres.forEach(t => {
                if (tomadas.has(t)) return;
                const p = saludParecido(t);
                if (p.bizum) return;
                if (p.bolsillo) r.push({ tipo: 'ahorro', t, motivo: t.type === 'income' ? 'sale de un bolsillo o de Flexible Cash Funds: no es un ingreso.' : 'va a un bolsillo o a Flexible Cash Funds: no es un gasto.' });
                else if (p.inversion) r.push({ tipo: 'inversion', t, motivo: t.type === 'income' ? 'viene de tu inversión: no es un ingreso.' : 'es una aportación a tu inversión: no es un gasto.' });
                else if (t.type === 'income' && !t.pendiente && (p.reembolso || !t.category)) {
                    const cand = saludComprasCandidatas(t, 1, yaUsadas, gastos)[0];
                    if (cand && (p.reembolso ? true : cand.comun && t.account === cand.t.account && !t.category)) {
                        r.push({ tipo: 'reembolso', t, con: cand.t, motivo: `devuelve ${saludConcepto(cand.t) || 'una compra'} del ${financeDateLabelShort(cand.t.date)} (${financeMoney(cand.t.amount)}).` });
                    }
                }
            });
            return r.sort((a, b) => String(b.t.date).localeCompare(String(a.t.date)));
        }

        // Lo que hay que mirar a mano: sin categoría, Bizums sin categoría e ingresos que parecen devoluciones sin compra.
        function saludPorRevisar() {
            const enPropuesta = new Set();
            saludPropuestas().forEach(p => { enPropuesta.add(p.t); if (p.con) enPropuesta.add(p.con); });
            const r = [];
            (financePro.transactions || []).forEach(t => {
                if (!saludLibre(t) || enPropuesta.has(t)) return;
                const p = saludParecido(t);
                let motivo = '';
                if (p.bizum && !t.category) motivo = 'bizum sin categoría.';
                else if (p.reembolso && t.type === 'income') motivo = 'parece una devolución: ¿de qué compra?';
                else if (t.needsReview || !t.category) motivo = t.type === 'income' ? 'ingreso sin categoría.' : 'gasto sin categoría.';
                if (motivo) r.push({ t, motivo });
            });
            return r.sort((a, b) => String(b.t.date).localeCompare(String(a.t.date)));
        }

        function saludQuitarCategoria(t) {
            delete t.category; delete t.categoriaAuto; t.needsReview = false;
        }

        function saludHacerTraspaso(sal, ent) {
            if (!sal || !ent) throw new Error('Ese movimiento ya no está');
            const salida = sal.type === 'expense' ? sal : ent, entrada = salida === sal ? ent : sal;
            const otraNota = saludConcepto(entrada);
            Object.assign(salida, { type: 'transfer', transferTo: entrada.account, needsReview: false });
            delete salida.category; delete salida.categoriaAuto; delete salida.reembolsoDe;
            if (!salida.claveImport) salida.claveImport = `${entrada.account}|${entrada.date}|${entrada.amount}|${otraNota}`;
            else if (!salida.claveImport2) salida.claveImport2 = `${entrada.account}|${entrada.date}|${entrada.amount}|${otraNota}`;
            financePro.transactions = financePro.transactions.filter(t => t !== entrada);
        }

        // Un movimiento suelto que es un traspaso con otra cuenta propia: si el otro lado está apuntado, se juntan; si no,
        // se convierte en traspaso tal cual.
        function saludTraspasoCon(t, otra) {
            if (!otra || otra === t.account || !financePro.accounts?.[otra]) throw new Error('Elige la otra cuenta');
            const tipoOtro = t.type === 'expense' ? 'income' : 'expense';
            const gemelo = (financePro.transactions || []).find(x => x !== t && x.account === otra && x.type === tipoOtro && Math.abs(Number(x.amount) - Number(t.amount)) < 0.005 && x.date && saludDias(x.date, t.date) <= 3 && !financeProNeutro(x) && !x.recurringEntryId);
            if (gemelo) return saludHacerTraspaso(t, gemelo);
            const desde = t.type === 'expense' ? t.account : otra, hasta = t.type === 'expense' ? otra : t.account;
            Object.assign(t, { type: 'transfer', account: desde, transferTo: hasta, needsReview: false });
            delete t.category; delete t.categoriaAuto; delete t.reembolsoDe;
        }

        function saludResolver(t, d) {
            if (!t) throw new Error('Ese movimiento ya no está');
            switch (d.como) {
            case 'categoria': {
                const c = financeProCategoryById(d.categoria);
                if (!c) throw new Error('Elige una categoría');
                t.category = c.id; t.needsReview = false; delete t.categoriaAuto; delete t.ahorro; delete t.reembolsoDe;
                if (c.type && c.type !== t.type && (c.type === 'income' || c.type === 'expense')) t.type = c.type;
                return 'Categoría puesta';
            }
            case 'ahorro':
                saludQuitarCategoria(t); delete t.reembolsoDe; t.ahorro = true;
                return t.type === 'income' ? 'Marcado como sacado de tus ahorros' : 'Marcado como ahorro';
            case 'inversion': {
                const c = saludCategoriaInversion(t.type);
                delete t.reembolsoDe;
                if (c) { t.category = c; t.needsReview = false; delete t.categoriaAuto; delete t.ahorro; }
                else { saludQuitarCategoria(t); t.ahorro = true; }
                return 'Marcado como inversión';
            }
            case 'reembolso': {
                if (t.type !== 'income') throw new Error('Solo un ingreso puede ser una devolución');
                const c = saludPorId(d.compra);
                if (!c || c.type !== 'expense') throw new Error('Elige la compra que devuelve');
                t.reembolsoDe = String(c.id); t.needsReview = false; delete t.ahorro; delete t.categoriaAuto;
                return 'Devolución unida a ' + (saludConcepto(c) || 'su compra');
            }
            case 'traspaso':
                if (d.con) saludHacerTraspaso(t, saludPorId(d.con));
                else saludTraspasoCon(t, d.cuenta);
                return 'Ahora es un traspaso entre tus cuentas';
            case 'desvincular':
                delete t.reembolsoDe;
                return 'Ya no cuenta como devolución';
            case 'bien':
                t.revisado = true; t.needsReview = false;
                return 'Se queda como está';
            }
            throw new Error('No sé hacer eso');
        }

        function saludAplicarPropuestas(tipo, ids) {
            const quiero = ids ? new Set(ids.map(String)) : null;
            let n = 0;
            saludPropuestas().forEach(p => {
                if ((tipo && p.tipo !== tipo) || (quiero && !quiero.has(String(p.t.id)))) return;
                if (!financePro.transactions.includes(p.t) || (p.con && !financePro.transactions.includes(p.con))) return;
                saludResolver(p.t, { como: p.tipo, con: p.con && String(p.con.id), compra: p.con && String(p.con.id) });
                n++;
            });
            return n;
        }

        // ---------- 2. presupuestos honestos ----------

        function saludClaveCasilla(a) {
            return [financeProNormalizar(a.label || '').trim(), saludRedondo(a.amount), a.categoryId || ''].join('|');
        }

        function saludDuplicadosPlan(plan) {
            const vistos = new Map(), r = [];
            (plan?.allocations || []).forEach(a => {
                if (a.auto) return;
                const k = saludClaveCasilla(a);
                if (vistos.has(k)) r.push({ id: String(a.id), label: String(a.label || ''), amount: saludRedondo(a.amount) });
                else vistos.set(k, a);
            });
            return r;
        }

        function saludPresupuestoAvisos(mes) {
            mes = mes || financeMonthKey();
            const { plan, recorded } = presupuestoPlanDe(mes);
            const m = financeBudgetUnifiedModel(mes, plan, recorded);
            const subs = budgetAutoResumen('subscription');
            const fijos = budgetAutoResumen('fixed_expense');
            return {
                mes, cerrado: !!recorded,
                duplicados: saludDuplicadosPlan(plan),
                suscripcionesFuera: !!(plan.autoQuitadas?.subscription && subs.n) ? subs.total : 0,
                fijosFuera: !!(plan.autoQuitadas?.fixed_expense && fijos.n) ? fijos.total : 0,
                ingresos: m.income, asignado: m.totalAssigned,
                exceso: m.totalAssigned > m.income + 0.005 ? saludRedondo(m.totalAssigned - m.income) : 0
            };
        }

        // Los meses guardados desde el actual en adelante que tienen algo que arreglar.
        function saludPresupuestosFuturos() {
            const desde = financeMonthKey();
            return Object.keys(financeProfile.budgetPlans || {}).filter(k => /^\d{4}-\d{2}$/.test(k) && k >= desde).sort()
                .map(saludPresupuestoAvisos).filter(a => !a.cerrado && (a.duplicados.length || a.suscripcionesFuera || a.fijosFuera || a.exceso));
        }

        function saludQuitarDuplicados(meses) {
            let n = 0;
            const lista = meses?.length ? meses : Object.keys(financeProfile.budgetPlans || {}).filter(k => k >= financeMonthKey());
            lista.forEach(mes => {
                if ((financeProfile.budgetHistory || []).some(h => h.month === mes)) return;
                const plan = financeProfile.budgetPlans?.[mes];
                if (!plan || !Array.isArray(plan.allocations)) return;
                const fuera = new Set(saludDuplicadosPlan(plan).map(d => d.id));
                if (!fuera.size) return;
                plan.allocations = plan.allocations.filter(a => !fuera.has(String(a.id)));
                n += fuera.size;
            });
            return n;
        }

        function saludReponerCompromisos(mes) {
            const plan = getBudgetPlanForMonth(mes);
            if (plan.autoQuitadas) {
                delete plan.autoQuitadas.subscription; delete plan.autoQuitadas.fixed_expense;
                if (!Object.keys(plan.autoQuitadas).length) delete plan.autoQuitadas;
            }
            asegurarCasillasAutomaticas(plan, mes);
        }

        // ---------- 3. colchones ----------

        function saludEsencialesIds() {
            const a = saludAjustes();
            if (a.esenciales) return new Set(a.esenciales.map(String));
            return new Set((financePro.categories || []).filter(c => c.type === 'expense' && SALUD_ESENCIAL.test(c.name || '')).map(c => c.id));
        }

        function saludMesesCerrados(n) {
            const r = [];
            for (let i = 1; i <= n; i++) r.push(longtermMonthOffset(financeMonthKey(), -i));
            const primero = (financePro.transactions || []).reduce((m, t) => t.date && (!m || t.date < m) ? t.date : m, '').slice(0, 7);
            return r.filter(m => primero && m >= primero);
        }

        // Gasto esencial de un mes: las categorías esenciales (netas de devoluciones) y los gastos fijos sin categoría esencial.
        function saludEsencialMes(mes, ids) {
            ids = ids || saludEsencialesIds();
            let s = 0;
            ids.forEach(id => { s += financeProCategorySpend(id, mes); });
            const fijos = new Set(entries.filter(e => e.type === 'fixed_expense').map(e => e.id));
            (financePro.transactions || []).forEach(t => {
                if (t.type === 'expense' && fijos.has(t.recurringEntryId) && !ids.has(t.category) && financeProCicloMes(t) === mes && !financeProNeutro(t)) s += Number(t.amount) || 0;
            });
            return saludRedondo(s);
        }

        function saludIngresoMes(mes) {
            return saludRedondo(financeProMonthTotals(mes).income);
        }

        function saludMediana(l) {
            if (!l.length) return 0;
            const o = [...l].sort((a, b) => a - b), k = Math.floor(o.length / 2);
            return o.length % 2 ? o[k] : (o[k - 1] + o[k]) / 2;
        }

        function saludEstabilizacionDatos() {
            const e = financeProfile.estabilizacion && typeof financeProfile.estabilizacion === 'object' ? financeProfile.estabilizacion : {};
            const meses = saludMesesCerrados(6);
            const ingresos = meses.map(saludIngresoMes).filter(v => v > 0);
            const base = Number(e.base) > 0 ? Number(e.base) : saludRedondo(saludMediana(ingresos));
            const minimo = ingresos.length ? Math.min(...ingresos) : 0;
            const propuesto = ingresos.length >= 2 ? Math.round(3 * Math.max(0, base - minimo) / 10) * 10 : 0;
            const objetivo = Number(e.objetivo) > 0 ? Number(e.objetivo) : propuesto;
            return { saldo: saludRedondo(e.saldo), objetivo: saludRedondo(objetivo), objetivoPropuesto: propuesto, base: saludRedondo(base), baseManual: Number(e.base) > 0, minimo: saludRedondo(minimo), maximo: saludRedondo(ingresos.length ? Math.max(...ingresos) : 0), meses: ingresos.length };
        }

        // Con lo que entra este mes: cuánto sacar de la reserva (mes flojo) o cuánto reponer (mes bueno).
        function saludEstabilizacionMes(ingreso) {
            const e = saludEstabilizacionDatos();
            if (!e.base) return { usar: 0, reponer: 0 };
            if (ingreso < e.base) return { usar: saludRedondo(Math.min(e.base - ingreso, e.saldo)), reponer: 0 };
            return { usar: 0, reponer: saludRedondo(Math.max(0, Math.min(ingreso - e.base, e.objetivo - e.saldo))) };
        }

        function saludColchones() {
            const ids = saludEsencialesIds();
            const meses = saludMesesCerrados(6).map(mes => ({ mes, importe: saludEsencialMes(mes, ids) }));
            const conDatos = meses.filter(m => m.importe > 0);
            const esencialesMes = conDatos.length ? saludRedondo(conDatos.reduce((s, m) => s + m.importe, 0) / conDatos.length) : 0;
            const a = saludAjustes();
            const fondo = saludRedondo(financeProfile.emergency);
            return {
                esencialesMes, meses,
                categorias: (financePro.categories || []).filter(c => c.type === 'expense').map(c => ({ id: String(c.id), nombre: String(c.name || ''), esencial: ids.has(c.id) })),
                elegidasAMano: !!a.esenciales,
                fondo, cubre: esencialesMes > 0 ? Math.round(fondo / esencialesMes * 10) / 10 : null,
                mesesObjetivo: a.mesesObjetivo, objetivoFondo: saludRedondo(esencialesMes * a.mesesObjetivo),
                estabilizacion: saludEstabilizacionDatos()
            };
        }

        // ---------- 4. coste neto ----------

        function saludCosteNeto(mes) {
            mes = mes || financeMonthKey();
            return (financePro.categories || []).filter(c => c.type === 'expense').map(c => {
                const bruto = saludRedondo(financeProCategoryExpense(c.id, mes));
                const devuelto = saludRedondo(financeProCategoryRefunds(c.id, mes));
                return { id: String(c.id), nombre: String(c.name || ''), bruto, devuelto, neto: saludRedondo(bruto - devuelto), destacada: SALUD_NETO.test(c.name || '') };
            }).filter(c => c.bruto || c.devuelto).sort((a, b) => (b.destacada - a.destacada) || (b.neto - a.neto));
        }

        // ---------- 5. rutinas ----------

        function saludTramo(ingreso) {
            const t = [...saludAjustes().tramos].sort((a, b) => (a.hasta ?? Infinity) - (b.hasta ?? Infinity));
            return Number((t.find(x => x.hasta == null || ingreso < Number(x.hasta)) || t[t.length - 1]).importe) || 0;
        }

        function saludGastoOrdinario() {
            const a = saludAjustes();
            if (a.ordinario) return a.ordinario;
            const g = saludMesesCerrados(3).map(m => financeProMonthTotals(m).expense).filter(v => v > 0);
            return g.length ? saludRedondo(g.reduce((s, v) => s + v, 0) / g.length) : 0;
        }

        // El día de cobro, en este orden: lo ordinario del mes, la reserva de estabilización, el fondo de emergencia
        // (la parte de lo que sobra mientras esté por debajo del umbral), la inversión según el tramo y el resto, ocio.
        function saludReparto(ingreso) {
            ingreso = saludRedondo(ingreso);
            const a = saludAjustes();
            const ordinarioBase = saludGastoOrdinario();
            const estab = saludEstabilizacionMes(ingreso);
            const pasos = [];
            let resto = ingreso + estab.usar;
            const ordinario = saludRedondo(Math.min(resto, ordinarioBase));
            resto -= ordinario;
            pasos.push({ clave: 'ordinario', nombre: 'gastos del mes.', importe: ordinario, nota: estab.usar ? `incluye ${financeMoney(estab.usar)} de la reserva de estabilización.` : '' });
            const reponer = saludRedondo(Math.min(resto, estab.reponer));
            resto -= reponer;
            pasos.push({ clave: 'estabilizacion', nombre: 'reserva de estabilización.', importe: reponer, nota: estab.usar ? 'mes flojo: se usa, no se repone.' : '' });
            const fondo = saludRedondo(financeProfile.emergency);
            const falta = Math.max(0, a.umbralFondo - fondo);
            const emergencia = saludRedondo(Math.min(falta, Math.max(0, resto) * a.extraEmergencia / 100));
            resto -= emergencia;
            pasos.push({ clave: 'emergencia', nombre: 'fondo de emergencia.', importe: emergencia, nota: falta ? `hasta ${financeMoney(a.umbralFondo)}.` : 'ya está completo.' });
            const tramo = saludTramo(ingreso);
            const inversion = saludRedondo(Math.min(Math.max(0, resto), tramo));
            resto -= inversion;
            pasos.push({ clave: 'inversion', nombre: 'inversión.', importe: inversion, nota: `tramo de ${financeMoney(tramo)} al mes.` });
            pasos.push({ clave: 'ocio', nombre: 'ocio y caprichos.', importe: saludRedondo(Math.max(0, resto)), nota: '' });
            return { ingreso, ordinarioBase, falta: saludRedondo(Math.max(0, ordinarioBase - ingreso - estab.usar)), pasos };
        }

        function saludCargosProximos(dias) {
            const hoy = new Date(todayISO() + 'T12:00:00');
            const r = [];
            entries.filter(e => (e.type === 'subscription' || e.type === 'fixed_expense') && e.active !== false && Number(e.amount) > 0).forEach(e => {
                for (let i = 0; i <= dias; i++) {
                    const d = new Date(hoy); d.setDate(d.getDate() + i);
                    const ult = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                    if (Math.min(Number(e.renewalDay) || 1, ult) !== d.getDate()) continue;
                    if (e.type === 'subscription' && !suscripcionVigente(e, isoLocal(d))) continue;
                    r.push({ id: String(e.id), titulo: String(e.title || 'sin nombre'), importe: saludRedondo(e.amount), fecha: isoLocal(d) });
                }
            });
            return r.sort((a, b) => a.fecha.localeCompare(b.fecha));
        }

        function saludSemanal() {
            const mes = financeMonthKey();
            const m = financeBudgetUnifiedModel(mes, presupuestoPlanDe(mes).plan, null);
            const quedaPresupuestos = saludRedondo(m.categories.reduce((s, c) => s + Math.max(0, c.remaining), 0));
            return {
                porRevisar: saludPorRevisar().length, propuestas: saludPropuestas().length,
                queda: quedaPresupuestos, presupuestosPasados: m.categories.filter(c => c.status === 'superado').map(c => String(c.name)),
                cargos: saludCargosProximos(7), ultima: saludAjustes().ultimaSemanal
            };
        }

        const SALUD_PREGUNTAS = ['¿qué gasto no volverías a hacer?', '¿qué vas a cambiar el mes que viene?'];

        function saludCifrasMes(mes) {
            const t = financeProMonthTotals(mes);
            let invertido = 0;
            (financePro.transactions || []).forEach(x => {
                if (!String(x.date || '').startsWith(mes) || !financeProEsInversion(x)) return;
                invertido += (x.type === 'expense' ? 1 : -1) * (Number(x.amount) || 0);
            });
            const c = saludColchones();
            return {
                ingresos: saludRedondo(t.income), gastos: saludRedondo(t.expense), ahorro: saludRedondo(t.income - t.expense),
                tasa: t.income > 0 ? Math.round((t.income - t.expense) / t.income * 1000) / 10 : null,
                invertido: saludRedondo(invertido), fondo: c.fondo, cubre: c.cubre
            };
        }

        function saludCierre(mes) {
            mes = mes || longtermMonthOffset(financeMonthKey(), -1);
            const guardado = saludAjustes().cierres[mes] || null;
            return { mes, titulo: financeMonthLabel(mes), cifras: guardado?.cifras || saludCifrasMes(mes), preguntas: SALUD_PREGUNTAS, respuestas: guardado?.respuestas || ['', ''], cerrado: !!guardado, en: guardado?.en || null };
        }

        // ---------- 6. suscripciones ----------

        function saludSuscripcionesRevisar() {
            const hoy = todayISO();
            return entries.filter(e => e.type === 'subscription' && e.active !== false && suscripcionVigente(e, hoy)).map(e => {
                const desde = e.revisadaEn || e.altaDesde || e.date || '';
                const sinRevisar = desde ? saludDias(desde.slice(0, 10), hoy) : Infinity;
                const sinUso = e.ultimoUso ? saludDias(e.ultimoUso, hoy) : null;
                return { id: String(e.id), titulo: String(e.title || 'sin nombre'), importe: saludRedondo(e.amount), ultimoUso: e.ultimoUso || null, revisadaEn: e.revisadaEn || null, diasSinUso: sinUso, toca: sinRevisar >= 90 || (sinUso !== null && sinUso >= 30) };
            }).sort((a, b) => (b.toca - a.toca) || ((b.diasSinUso ?? -1) - (a.diasSinUso ?? -1)));
        }

        // ---------- 7. ficha del fondo ----------

        function saludFichaFondo(id) {
            const a = (financeProfile.investmentAccounts || []).find(x => String(x.id) === String(id));
            const f = a?.fondo || {};
            return { id: String(id), nombre: String(a?.name || 'inversión'), isin: f.isin || '', indice: f.indice || '', riesgo: f.riesgo || null, ter: f.ter ?? '', comisiones: f.comisiones || '', notas: f.notas || '' };
        }

        function saludIsinValido(s) {
            return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(s);
        }

        // ---------- 8. compras grandes ----------

        function saludDeseos() {
            const ahora = Date.now();
            return (financeProfile.wishlist || []).map(w => {
                const hasta = w.esperaHasta ? new Date(w.esperaHasta).getTime() : null;
                const precio = Number(w.price) || 0;
                return { id: String(w.id), titulo: String(w.title || ''), precio, esperaHasta: w.esperaHasta || null, horasQuedan: hasta && hasta > ahora ? Math.ceil((hasta - ahora) / 3600000) : 0, listo: !!hasta && hasta <= ahora, diasSugeridos: precio >= 150 ? 7 : 2 };
            });
        }

        // ---------- avisos (opcionales, se ven al abrir Finanzas) ----------

        function saludAvisos() {
            const a = saludAjustes(), r = [];
            const hoy = todayISO();
            if (a.avisos.semanal && (!a.ultimaSemanal || saludDias(a.ultimaSemanal, hoy) >= 7)) r.push({ clave: 'semanal', texto: 'toca la revisión de la semana.' });
            const anterior = longtermMonthOffset(financeMonthKey(), -1);
            if (a.avisos.cierre && !a.cierres[anterior] && Number(hoy.slice(8, 10)) <= 10) r.push({ clave: 'cierre', texto: `cierra ${financeMonthLabel(anterior).toLowerCase()}.` });
            if (a.avisos.trimestral) {
                const n = saludSuscripcionesRevisar().filter(s => s.toca).length;
                if (n) r.push({ clave: 'trimestral', texto: `${n} ${n === 1 ? 'suscripción pide' : 'suscripciones piden'} una revisión.` });
            }
            return r;
        }

        // ---------- la única entrada para escribir ----------

        function saludAccion(nombre, d = {}) {
            const tx = id => (financePro.transactions || []).find(t => String(t.id) === String(id));
            switch (nombre) {
            case 'resolver': return saludResolver(tx(d.id), d);
            case 'propuestas': {
                const n = saludAplicarPropuestas(d.tipo || null, d.ids || null);
                return n ? `${n} ${n === 1 ? 'movimiento reclasificado' : 'movimientos reclasificados'}` : 'Nada que cambiar';
            }
            case 'quitarDuplicados': {
                const n = saludQuitarDuplicados(d.meses);
                return n ? `${n} ${n === 1 ? 'casilla repetida quitada' : 'casillas repetidas quitadas'}` : 'No había casillas repetidas';
            }
            case 'reponerCompromisos': saludReponerCompromisos(d.mes || financeMonthKey()); return 'Suscripciones y gastos fijos vuelven al presupuesto';
            case 'esenciales': saludGuardarAjuste('esenciales', Array.isArray(d.ids) ? d.ids.map(String) : null); return 'Gastos esenciales guardados';
            case 'ajustes': {
                ['mesesObjetivo', 'umbralFondo', 'extraEmergencia', 'ordinario'].forEach(k => {
                    if (!(k in d)) return;
                    const v = Number(String(d[k]).replace(',', '.'));
                    saludGuardarAjuste(k, d[k] === '' || d[k] === null || !Number.isFinite(v) || v < 0 ? undefined : v);
                });
                if (Array.isArray(d.tramos)) saludGuardarAjuste('tramos', d.tramos.map(t => ({ hasta: t.hasta === null || t.hasta === '' ? null : Number(t.hasta), importe: Number(t.importe) || 0 })));
                if (d.avisos && typeof d.avisos === 'object') saludGuardarAjuste('avisos', { semanal: !!d.avisos.semanal, cierre: !!d.avisos.cierre, trimestral: !!d.avisos.trimestral });
                return 'Guardado';
            }
            case 'estabilizacion': {
                const e = { ...(financeProfile.estabilizacion || {}) };
                ['saldo', 'objetivo', 'base'].forEach(k => {
                    if (!(k in d)) return;
                    const v = d[k] === '' || d[k] === null ? NaN : financeProParseEuroAmount(String(d[k]));
                    if (Number.isFinite(v) && v >= 0) e[k] = saludRedondo(v); else delete e[k];
                });
                financeProfile.estabilizacion = e;
                return 'Reserva de estabilización guardada';
            }
            case 'semanalHecha': saludGuardarAjuste('ultimaSemanal', todayISO()); return 'Revisión de la semana hecha';
            case 'cerrarMes': {
                const mes = d.mes || longtermMonthOffset(financeMonthKey(), -1);
                const cierres = { ...saludAjustes().cierres };
                cierres[mes] = { cifras: saludCifrasMes(mes), respuestas: (d.respuestas || []).slice(0, 2).map(x => String(x || '').trim()), en: todayISO() };
                saludGuardarAjuste('cierres', cierres);
                return financeMonthLabel(mes) + ' cerrado';
            }
            case 'suscripcionUso':
            case 'suscripcionRevisada': {
                const e = entries.find(x => String(x.id) === String(d.id));
                if (!e) throw new Error('Esa suscripción ya no está');
                if (nombre === 'suscripcionUso') e.ultimoUso = /^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '') ? d.fecha : todayISO();
                else e.revisadaEn = todayISO();
                return nombre === 'suscripcionUso' ? 'Apuntado' : 'Revisada: la siguiente, en tres meses';
            }
            case 'fichaFondo': {
                const acc = (financeProfile.investmentAccounts || []).find(x => String(x.id) === String(d.id));
                if (!acc) throw new Error('Esa cuenta de inversión ya no está');
                const isin = String(d.isin || '').replace(/\s+/g, '').toUpperCase();
                if (isin && !saludIsinValido(isin)) throw new Error('El ISIN tiene 12 caracteres: dos letras, nueve letras o números y una cifra');
                const riesgo = d.riesgo === '' || d.riesgo == null ? null : Math.round(Number(d.riesgo));
                if (riesgo !== null && !(riesgo >= 1 && riesgo <= 7)) throw new Error('El riesgo va de 1 a 7');
                const ter = String(d.ter ?? '').trim() === '' ? null : Number(String(d.ter).replace(',', '.').replace('%', ''));
                if (ter !== null && !(ter >= 0 && ter < 10)) throw new Error('El TER es un porcentaje, como 0,20');
                const f = { isin, indice: String(d.indice || '').trim(), riesgo, ter, comisiones: String(d.comisiones || '').trim(), notas: String(d.notas || '').trim() };
                Object.keys(f).forEach(k => { if (f[k] === '' || f[k] === null) delete f[k]; });
                if (Object.keys(f).length) acc.fondo = f; else delete acc.fondo;
                return 'Ficha del fondo guardada';
            }
            case 'esperar': {
                if (!Array.isArray(financeProfile.wishlist)) financeProfile.wishlist = [];
                let w = d.id ? financeProfile.wishlist.find(x => String(x.id) === String(d.id)) : null;
                if (!w) {
                    const titulo = String(d.titulo || '').trim();
                    if (!titulo) throw new Error('Escribe qué quieres comprar');
                    w = { id: 'wl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), title: titulo, price: Math.max(0, financeProParseEuroAmount(String(d.precio || '0')) || 0) };
                    financeProfile.wishlist.push(w);
                }
                const dias = Number(d.dias) === 7 ? 7 : Number(d.dias) === 0 ? 0 : 2;
                if (dias) { w.esperaDesde = new Date().toISOString(); w.esperaHasta = new Date(Date.now() + dias * 86400000).toISOString(); }
                else { delete w.esperaDesde; delete w.esperaHasta; }
                return dias ? `Espera ${dias === 7 ? 'una semana' : '48 horas'} y vuelve a decidir` : 'Sin espera';
            }
            case 'deseoFuera': {
                financeProfile.wishlist = (financeProfile.wishlist || []).filter(x => String(x.id) !== String(d.id));
                return 'Quitado de la lista';
            }
            }
            throw new Error('acción desconocida');
        }
