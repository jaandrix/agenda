// Finanzas de la app nativa con el código de la web (MotorFinanzas.swift). Las cifras salen de las mismas funciones que
// pintan la PWA del móvil (renderMobileFinances, renderFinanzasResumen, renderPresupuestoMovil...): aquí solo se
// devuelven como datos en vez de HTML. Las escrituras no se guardan desde aquí: se ejecuta lo mismo que la web sobre
// una copia y se devuelve la diferencia, que la app convierte en operaciones (CambioFinanzas).
(function () {
    var g = globalThis;
    var n2 = function (v) { return Math.round((Number(v) || 0) * 100) / 100; };
    var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

    function invalidar() {
        financeSaldosCache = null;
        if (typeof invalidarCachesDerivadas === 'function') { try { invalidarCachesDerivadas(); } catch (e) {} }
    }

    function foto() {
        return { pro: JSON.stringify(financePro), perfil: JSON.stringify(financeProfile), entries: JSON.stringify(entries) };
    }

    // Lo que cambió entre dos fotos: movimientos y entradas por id y campo; el resto de financePro y financeProfile por
    // clave de primer nivel. Las cifras viajan tal cual (JSON), sin pasar por Double en Swift.
    function porId(lista) {
        var m = {};
        (lista || []).forEach(function (x, i) { m[x && x.id != null ? String(x.id) : '#' + i] = x; });
        return m;
    }
    function diffLista(antes, despues) {
        var a = porId(antes), d = porId(despues), r = { anadir: [], cambiar: [], quitar: [] };
        Object.keys(a).forEach(function (id) { if (!(id in d)) r.quitar.push(id); });
        (despues || []).forEach(function (x, i) {
            var id = x && x.id != null ? String(x.id) : '#' + i;
            if (!(id in a)) { r.anadir.push(x); return; }
            var y = a[id];
            if (JSON.stringify(x) === JSON.stringify(y)) return;
            var poner = {}, quitar = [];
            Object.keys(x).forEach(function (k) { if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) poner[k] = x[k]; });
            Object.keys(y).forEach(function (k) { if (!(k in x)) quitar.push(k); });
            r.cambiar.push({ id: id, poner: poner, quitar: quitar });
        });
        return r;
    }
    function diffObjeto(antes, despues, saltar) {
        var r = {};
        var a = antes || {}, d = despues || {};
        Object.keys(d).forEach(function (k) { if (k !== saltar && JSON.stringify(d[k]) !== JSON.stringify(a[k])) r[k] = d[k] === undefined ? null : d[k]; });
        Object.keys(a).forEach(function (k) { if (k !== saltar && !(k in d)) r[k] = null; });
        return r;
    }
    function diferencia(f) {
        var pro0 = JSON.parse(f.pro), perfil0 = JSON.parse(f.perfil), ent0 = JSON.parse(f.entries);
        var pro1 = JSON.parse(JSON.stringify(financePro)), perfil1 = JSON.parse(JSON.stringify(financeProfile)), ent1 = JSON.parse(JSON.stringify(entries));
        var tx = diffLista(pro0.transactions, pro1.transactions);
        // Para no duplicar si la operación se vuelve a aplicar sobre una nube que ya tiene la misma fila (otra importación
        // del mismo extracto en la web): las claves con las que la web la reconoce y cuántas había antes.
        tx.anadir = tx.anadir.map(function (t) { return { t: t, claves: clavesTx(t) }; });
        return {
            movimientos: tx,
            pro: diffObjeto(pro0, pro1, 'transactions'),
            perfil: diffObjeto(perfil0, perfil1, null),
            entradas: diffLista(ent0, ent1)
        };
    }
    function clavesTx(t) {
        if (!t || !t.date || !t.account) return [];
        var r = [];
        var nota = t.bankNote != null ? t.bankNote : (t.note || '');
        r.push([t.account, t.date, Number(t.amount), nota].join('|'));
        return r;
    }
    function vacia(d) {
        return !d.movimientos.anadir.length && !d.movimientos.cambiar.length && !d.movimientos.quitar.length
            && !Object.keys(d.pro).length && !Object.keys(d.perfil).length
            && !d.entradas.anadir.length && !d.entradas.cambiar.length && !d.entradas.quitar.length;
    }
    // Ejecuta una función de la web; si cambia algo, devuelve la diferencia y deja el estado como estaba (la app lo
    // recibirá ya cambiado por la cola, como cualquier escritura).
    function enCopia(fn) {
        var f = foto();
        var res;
        try { res = fn(); } catch (e) { restaurar(f); throw e; }
        var d = diferencia(f);
        restaurar(f);
        return { resultado: res === undefined ? null : res, cambios: vacia(d) ? null : d };
    }
    function restaurar(f) {
        financePro = JSON.parse(f.pro); financeProfile = JSON.parse(f.perfil); entries = JSON.parse(f.entries);
        if (typeof filteredEntries !== 'undefined') filteredEntries = entries.slice();
        invalidar();
    }

    function nombreCuenta(k) { return (financePro.accounts && financePro.accounts[k] && financePro.accounts[k].name) || k || ''; }
    function fechaCorta(iso) {
        var d = new Date((iso || todayISO()) + 'T12:00:00');
        return d.getDate() + ' ' + MESES[d.getMonth()].slice(0, 3);
    }
    function fila(t) {
        var cat = financeProNeutro(t) ? { name: financeProEtiquetaNeutro(t).replace(/\.$/, '') } : financeProCategoryById(t.category);
        return {
            id: String(t.id), fecha: t.date || '', dia: fechaCorta(t.date), tipo: t.type || '',
            titulo: String(t.note || t.bankNote || (cat && cat.name) || 'movimiento'),
            pendiente: !!t.pendiente,
            meta: [cat && cat.name, financePro.accounts[t.account] && financePro.accounts[t.account].name].filter(Boolean).join(', ').toLowerCase(),
            importe: Number(t.amount) || 0, cifra: String(Number(t.amount) || 0),
            cuenta: t.account || '', destino: t.transferTo || '', categoria: t.category || '', nota: String(t.note || ''),
            hora: t.hora || '', futuro: !!(t.date && t.date > todayISO()), neutro: financeProNeutro(t), revisar: !!t.needsReview
        };
    }
    function porAjustar() {
        return {
            n: financeProPendingReviewCount(),
            incidencias: financeProIncidencias().map(function (i) { return { nota: String(i.nota || i.id || 'sin nombre'), motivo: String(i.motivo || '') }; })
        };
    }

    var RANGOS = FINANCE_PRO_CHART_RANGES;
    function grafica(rangoKey, extras) {
        var rango = RANGOS.find(function (r) { return r.key === rangoKey; }) || RANGOS[2];
        var serie = financeSerieDiaria(rango.months, extras);
        var total = serie.length ? serie[serie.length - 1].v : saldoLiquido();
        var cambio = serie.length > 1 ? total - serie[0].v : 0;
        var tieneExtras = Number(financeProfile.invested || 0) + Number(financeProfile.emergency || 0) > 0 || (financeProfile.history || []).some(function (h) { return Number(h.invested || 0) + Number(h.emergency || 0) > 0; });
        var periodo = rango.months === 1 ? 'en el último mes' : rango.months === 12 ? 'en el último año' : rango.months ? 'en los últimos ' + rango.months + ' meses' : 'desde el primer movimiento';
        return {
            rango: rango.key, rangos: RANGOS.map(function (r) { return { key: r.key, corto: r.corto, largo: r.label }; }),
            extras: !!extras, tieneExtras: tieneExtras, inversionDesde: financeProfile.inversionDesde || '',
            titulo: extras ? 'patrimonio.' : 'tus cuentas.', sub: extras ? 'tus cuentas, la inversión y la emergencia.' : 'lo que tienes hoy entre todas.',
            total: total, cambio: cambio, periodo: periodo,
            serie: serie.map(function (p) { return [p.f, n2(p.v)]; })
        };
    }

    function ritmo() {
        var ahora = new Date(), mes = financeMonthKey();
        var pasado = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
        var mesPasado = pasado.getFullYear() + '-' + String(pasado.getMonth() + 1).padStart(2, '0');
        var dia = ahora.getDate(), diasMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
        var g1 = 0, antes = 0;
        financePro.transactions.forEach(function (x) {
            if (x.type !== 'expense' || financeProNeutro(x) || x.viaje) return;
            var clave = String(x.date || '').slice(0, 7);
            if (clave === mes) g1 += Number(x.amount) || 0;
            else if (clave === mesPasado && Number(String(x.date).slice(8)) <= dia) antes += Number(x.amount) || 0;
        });
        if (!g1 && !antes) return null;
        return { gasto: g1, antes: antes, dif: g1 - antes, dia: dia, mesPasado: MESES[pasado.getMonth()], previsto: dia >= 5 ? Math.round(g1 / dia * diasMes) : null };
    }

    function cargos(max) {
        var ahora = new Date(), dia = ahora.getDate();
        var l = entries.filter(function (e) { return (e.type === 'subscription' || e.type === 'fixed_expense') && e.active !== false && Number(e.amount) > 0; }).map(function (e) {
            var diaCobro = Number(e.renewalDay) || 1;
            var fecha = new Date(ahora.getFullYear(), ahora.getMonth() + (diaCobro < dia ? 1 : 0), 1);
            fecha.setDate(Math.min(diaCobro, new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate()));
            return { e: e, fecha: fecha, faltan: Math.round((fecha - new Date(ahora.getFullYear(), ahora.getMonth(), dia)) / 864e5) };
        }).filter(function (x) { return x.faltan <= 14; }).sort(function (a, b) { return a.faltan - b.faltan; });
        return {
            total: l.reduce(function (t, x) { return t + Number(x.e.amount); }, 0),
            lista: l.slice(0, max).map(function (x) {
                return { id: String(x.e.id), titulo: String(x.e.title || ''), importe: Number(x.e.amount),
                    cuando: x.faltan === 0 ? 'hoy' : x.faltan === 1 ? 'mañana' : x.fecha.getDate() + ' ' + MESES[x.fecha.getMonth()].slice(0, 3) };
            })
        };
    }

    function avisosPresupuesto() {
        return asistPresupuestosAlerta().slice(0, 3).map(function (x) {
            return { nombre: String(x.nombre || x.cat.name).toLowerCase(), pct: Math.round(x.pct * 100), queda: x.limite - x.gastado, dias: x.quedanDias };
        });
    }

    function detectadas() {
        var siguen = entries.filter(function (e) { return e.type === 'subscription'; }).map(function (e) {
            var c = suscripcionCobrosTrasBaja(e);
            if (!c.length) return null;
            return { id: String(e.id), titulo: String(e.title || ''), desde: suscripcionFechaCorta(suscripcionBajaAbierta(e).desde), n: c.length, importe: Number(c[0].amount) || 0, fecha: suscripcionFechaCorta(c[0].date) };
        }).filter(Boolean);
        return {
            siguenCobrando: siguen,
            propuestas: asistSuscripcionesDetectadas().slice(0, 3).map(function (s) { return { clave: s.clave, nombre: s.nombre, importe: s.importe, dia: s.dia, meses: s.meses }; })
        };
    }

    function logo(e) { return typeof e.logo === 'string' && e.logo.indexOf('data:image/') === 0 ? e.logo : ''; }

    var pestanas = {
        cuentas: function (o) {
            var t = financeProMonthTotals(financeMonthKey());
            return {
                grafica: grafica(o.rango, o.extras),
                porAjustar: porAjustar(), avisosPresupuesto: avisosPresupuesto(), detectadas: detectadas(),
                ingresos: t.income, gastos: t.expense,
                ratio: t.income > 0 ? t.expense / t.income : (t.expense > 0 ? 1 : 0),
                ritmo: ritmo(),
                cuentas: financeProCuentas().map(function (k) { return { id: k, nombre: String(nombreCuenta(k)).toLowerCase(), saldo: financeProAccountBalance(k) }; }),
                cargos: cargos(3),
                ultimos: financeProOrdenados().slice(0, 5).map(fila)
            };
        },
        movimientos: function (o) {
            var todos = financeProOrdenados();
            var n = Math.max(30, o.n || 30);
            return { total: todos.length, porAjustar: porAjustar(), filas: todos.slice(0, n).map(fila), anioActual: new Date().getFullYear() };
        },
        planificacion: function () {
            var month = financeMonthKey();
            var p = presupuestoPlanDe(month);
            var m = financeBudgetUnifiedModel(month, p.plan, p.recorded);
            return {
                ingresos: m.income,
                categorias: m.categories.map(function (c) {
                    var cat = financeProCategoryById(c.categoryId);
                    return { id: String(c.categoryId), nombre: String(c.name), planned: c.planned, spent: c.spent, available: c.available, refunded: c.refunded,
                        lastMonth: c.lastMonth, casillas: c.allocations.length, percentage: c.percentage, status: c.status, remaining: c.remaining,
                        estado: presupuestoEstadoTexto(c), color: (cat && cat.color) || '', icono: (cat && cat.icon) || '' };
                }),
                otros: m.unlinkedAllocations.map(function (a) { return { label: String(a.label || 'sin nombre'), amount: Number(a.amount) || 0 }; })
            };
        },
        resumen: function () {
            var mesPanel = function (desp, conSueldo) {
                var mes = finResMes(desp), t = financeProMonthTotals(mes.clave);
                return { nombre: mes.nombre, entra: t.income, sale: t.expense, sueldo: conSueldo ? finResSueldoPrevisto(mes.clave) : 0, falta: conSueldo ? finResSueldoPorEntrar(mes.clave) : 0 };
            };
            var meses = finResHistoricoAhorro();
            var conTasa = meses.filter(function (x) { return x.tasa !== null; });
            var hoy = new Date();
            var camino = finResCaminoObjetivo();
            var fechaObj = camino.mesesHasta ? (function () { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + camino.mesesHasta); return MESES[d.getMonth()] + ' ' + d.getFullYear(); })() : '';
            var dia = hoy.getDate();
            var subs = entries.filter(function (e) {
                return (e.type === 'subscription' || e.type === 'fixed_expense') && e.active !== false && Number(e.amount) > 0 && (e.type !== 'subscription' || suscripcionVigente(e, todayISO()));
            }).map(function (e) {
                var d = Number(e.renewalDay) || 1;
                return { e: e, d: d, faltan: d >= dia ? d - dia : d + new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate() - dia };
            }).sort(function (a, b) { return a.faltan - b.faltan; });
            // Fin de mes: lo mismo que finResPanelPrevision.
            var mes = financeMonthKey(), saldo = saldoLiquido();
            var diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
            var fijos = entries.filter(function (e) { return (e.type === 'subscription' || e.type === 'fixed_expense') && e.active !== false && Number(e.amount) > 0 && Math.min(Number(e.renewalDay) || 1, diasMes) > dia && (e.type !== 'subscription' || suscripcionVigente(e, todayISO())); }).reduce(function (s, e) { return s + Number(e.amount); }, 0);
            var variable = 0;
            try { var r = financeRitmoDatos(); if (r.suficiente) variable = Math.max(0, r.proyeccion - r.llevas); } catch (e) {}
            var porEntrar = finResSueldoPorEntrar(mes);
            var gastos = [1, 2, 3].map(function (i) { return financeProMonthTotals(finResMes(-i).clave).expense; }).filter(function (v) { return v > 0; });
            var medio = gastos.length ? gastos.reduce(function (s, v) { return s + v; }, 0) / gastos.length : 0;
            var cats = {};
            financePro.transactions.forEach(function (t) { if (t.type === 'expense' && t.date && t.date.indexOf(mes) === 0 && !financeProNeutro(t)) cats[t.category || ''] = (cats[t.category || ''] || 0) + (Number(t.amount) || 0); });
            var top = Object.entries(cats).sort(function (a, b) { return b[1] - a[1]; })[0];
            return {
                esteMes: mesPanel(0, true), mesAnterior: mesPanel(-1, false),
                ahorro: {
                    meses: meses.map(function (x) { return { nombre: x.nombre, anio: x.anio, tasa: x.tasa }; }),
                    media: conTasa.length > 1 ? conTasa.reduce(function (s, x) { return s + x.tasa; }, 0) / conTasa.length : null,
                    enCurso: { nombre: MESES[hoy.getMonth()], anio: hoy.getFullYear(), tasa: finResTasaAhorro(financeMonthKey()) },
                    anioActual: hoy.getFullYear()
                },
                objetivo: { puntos: camino.puntos.map(function (p) { return [p.m, n2(p.v)]; }), actual: camino.actual, ritmo: camino.ritmo, objetivo: camino.objetivo, mesesHasta: camino.mesesHasta, conseguido: camino.conseguido, fecha: fechaObj },
                activos: finResActivos().map(function (f) { return { nombre: String(f.nombre).toLowerCase(), valor: f.valor, pct: f.pct === undefined || (f.pct !== null && !isFinite(f.pct)) ? null : f.pct, cambio: f.cambio == null ? null : f.cambio, ficha: f.ficha || '' }; }),
                suscripciones: subs.map(function (x) { return { id: String(x.e.id), titulo: String(x.e.title || 'sin nombre'), importe: Number(x.e.amount), dia: x.d, faltan: x.faltan }; }),
                prevision: { fin: saldo - fijos - variable + porEntrar, ultimoDia: diasMes, fijos: fijos, variable: variable, porEntrar: porEntrar, colchon: medio ? (saldo + Number(financeProfile.emergency || 0)) / medio : null, top: top ? String((financeProCategoryById(top[0]) || {}).name || 'sin categoría').toLowerCase() : '' }
            };
        }
    };

    function gestorSuscripciones() {
        var subs = entries.filter(function (e) { return e.type === 'subscription'; });
        var hoyDia = new Date().getDate();
        var faltan = function (e) { var d = Number(e.renewalDay) || 1; return d >= hoyDia ? d - hoyDia : d + 31 - hoyDia; };
        var activas = subs.filter(function (e) { return e.active !== false; }).sort(function (a, b) { return faltan(a) - faltan(b); });
        var deBaja = subs.filter(function (e) { return e.active === false; });
        return {
            activas: activas.map(function (e) { return { id: String(e.id), titulo: String(e.title || ''), importe: Number(e.amount) || 0, dia: Number(e.renewalDay) || 1, faltan: faltan(e) }; }),
            deBaja: deBaja.map(function (e) {
                var b = suscripcionBajaAbierta(e), c = suscripcionCobrosTrasBaja(e);
                return { id: String(e.id), titulo: String(e.title || ''), importe: Number(e.amount) || 0, desde: b ? suscripcionFechaCorta(b.desde) : '', cobro: c.length ? { importe: Number(c[0].amount) || 0, fecha: suscripcionFechaCorta(c[0].date) } : null };
            })
        };
    }

    function buscar(f) {
        var txs = financeProOrdenados();
        if (f.account) txs = txs.filter(function (t) { return t.account === f.account || t.transferTo === f.account; });
        if (f.year) txs = txs.filter(function (t) { return String(t.date).slice(0, 4) === f.year; });
        if (f.month) txs = txs.filter(function (t) { return String(t.date).slice(5, 7) === f.month; });
        if (f.category === '__none__') txs = txs.filter(function (t) { return !t.category && !financeProNeutro(t) && t.type !== 'transfer'; });
        else if (f.category) txs = txs.filter(function (t) { return t.category === f.category; });
        if ((f.search || '').trim()) {
            var q = f.search.trim().toLowerCase();
            txs = txs.filter(function (t) {
                var cat = financeProCategoryById(t.category);
                return [cat ? cat.name : '', t.note || '', nombreCuenta(t.account), t.transferTo ? nombreCuenta(t.transferTo) : ''].join(' ').toLowerCase().indexOf(q) >= 0;
            });
        }
        var grupos = {};
        txs.forEach(function (t) { var m = String(t.date).slice(0, 7); (grupos[m] = grupos[m] || []).push(t); });
        return {
            total: txs.length, vacio: financePro.transactions.length ? 'Ningún movimiento coincide con este filtro.' : 'Todavía no hay movimientos. Añade uno o importa un extracto bancario.',
            anios: financeProTxFilterYears().map(String),
            cuentas: FINANCE_PRO_ACCOUNT_KEYS.map(function (k) { return { id: k, nombre: String(nombreCuenta(k)) }; }),
            categorias: (financePro.categories || []).map(function (c) { return { id: String(c.id), nombre: String(c.name || c.id) }; }),
            grupos: Object.keys(grupos).sort().reverse().map(function (m) {
                var l = grupos[m];
                var inc = l.filter(function (t) { return t.type === 'income' && !financeProNeutro(t); }).reduce(function (s, t) { return s + Number(t.amount); }, 0);
                var exp = l.filter(function (t) { return t.type === 'expense' && !financeProNeutro(t); }).reduce(function (s, t) { return s + Number(t.amount); }, 0);
                return { mes: m, titulo: financeMonthLabel(m), neto: inc - exp, filas: l.slice(0, 400).map(fila), mas: Math.max(0, l.length - 400) };
            })
        };
    }

    // ---- importar ----
    var imp = null;
    var ultimoCuadre = null;
    function vistaImport() {
        if (!imp) return null;
        renderFinanceProImportFilas(imp);
        var filas = financeProFilasDelExtracto(imp);
        var nFuera = filas.filter(function (f) { return f.fuera; }).length;
        var n = filas.length - imp.excluidas.size;
        var conSaldo = false;
        try { conSaldo = !!financeProTieneSaldo(imp); } catch (e) {}
        return {
            cuenta: imp.mapping.account, cuentaDetectada: !!imp.cuentaDetectada, confirmada: financeProCuentaConfirmada(imp),
            cuentas: FINANCE_PRO_ACCOUNT_KEYS.map(function (k) { return { id: k, nombre: String(nombreCuenta(k)) }; }),
            nuevas: n, ya: filas.length - n - nFuera, fuera: nFuera, total: filas.length,
            boton: financeProTextoBotonImport(imp),
            filas: filas.map(function (f) {
                return { fila: f.fila, fecha: f.date || '', dia: f.date ? financeDateLabelShort(f.date) : 'sin fecha', concepto: String(f.desc || '').slice(0, 60),
                    importe: Number.isFinite(f.val) ? f.val : null, fuera: f.fuera || '', ya: imp.yaApuntadas.has(f.fila), marcada: !imp.excluidas.has(f.fila) };
            }),
            conSaldo: conSaldo
        };
    }

    g.__fin = {
        cargar: function (pro, ent, perfil, inv, extra) {
            financePro = pro ? JSON.parse(pro) : financePro;
            entries = ent ? JSON.parse(ent) : [];
            financeProfile = perfil ? JSON.parse(perfil) : financeProfile;
            if (inv && typeof investmentData !== 'undefined') investmentData = JSON.parse(inv);
            if (typeof filteredEntries !== 'undefined') filteredEntries = entries.slice();
            // Lo que la web normaliza al cargar (loadData en datos.js), sin guardar: así las cifras parten de lo mismo.
            var fp = financeProfile;
            if (!fp || typeof fp !== 'object') fp = financeProfile = { cash: 0, cashTarget: 0, invested: 0, investedTarget: 0, emergency: 0, emergencyTarget: 0, vacation: 0, vacationTarget: 0, salaryForecast: {}, history: [] };
            fp.salaryForecast = fp.salaryForecast || {};
            ['history', 'oneOffIncome', 'movements', 'customAccounts', 'investmentContributions', 'chartSeries', 'savingsGoals'].forEach(function (k) { if (!Array.isArray(fp[k])) fp[k] = []; });
            ['salaryReal', 'budgets'].forEach(function (k) { if (!fp[k] || typeof fp[k] !== 'object') fp[k] = {}; });
            fp.recordatorioDia = Number.isFinite(fp.recordatorioDia) ? fp.recordatorioDia : null;
            fp.ultimoCierreMensual = fp.ultimoCierreMensual || null;
            financePro.enabled = true;
            financePro.accounts = (financePro.accounts && typeof financePro.accounts === 'object') ? financePro.accounts : {};
            ['efectivo', 'bancos', 'online'].forEach(function (k) { financePro.accounts[k] = financePro.accounts[k] || { name: k[0].toUpperCase() + k.slice(1), balance0: 0 }; });
            financePro.categories = Array.isArray(financePro.categories) && financePro.categories.length ? financePro.categories : financeProDefaultCategories();
            financeProDefaultCategories().forEach(function (def) { if (!financePro.categories.some(function (c) { return c.id === def.id; })) financePro.categories.push(def); });
            var regalo = financePro.categories.find(function (c) { return c.id === 'cat_regalo'; });
            if (regalo && regalo.name === 'Regalos') regalo.name = 'Aportaciones';
            financePro.transactions = Array.isArray(financePro.transactions) ? financePro.transactions : [];
            financePro.categoryBudgets = (financePro.categoryBudgets && typeof financePro.categoryBudgets === 'object') ? financePro.categoryBudgets : {};
            financePro.rules = Array.isArray(financePro.rules) ? financePro.rules : [];
            financePro.programados = Array.isArray(financePro.programados) ? financePro.programados : [];
            invalidar();
            return true;
        },
        preparar: function () { return JSON.stringify(enCopia(function () { return prepararFinanzas(); })); },
        pestana: function (tab, opciones) { return JSON.stringify(pestanas[tab](JSON.parse(opciones || '{}'))); },
        serie: function (rango, extras) { return JSON.stringify(grafica(rango, !!extras)); },
        buscar: function (f) { return JSON.stringify(buscar(JSON.parse(f))); },
        gestor: function () { return JSON.stringify(gestorSuscripciones()); },
        // openFinanceProReviewModal: los que esperan categoría.
        revisar: function () { return JSON.stringify(financeProOrdenados().filter(function (t) { return t.needsReview; }).slice(0, 300).map(fila)); },
        permitir: function (precio) { return JSON.stringify(asistPermitir(Number(precio) || 0)); },
        // Suscripciones: lo mismo que suscripcionDarDeBaja / DarDeAlta / CobroVisto / Borrar, devuelto como cambios.
        // saveEntry (entradas.js) para una suscripción o un gasto fijo: mismos campos, mezcla con la entrada de antes, el logo
        // se vuelve a buscar si cambia el nombre o la web, el estado pasa por suscripcionCambiarEstado y lo nuevo lleva altaDesde.
        guardarSuscripcion: function (datos) {
            var f = JSON.parse(datos);
            return JSON.stringify(enCopia(function () {
                var type = f.tipo === 'fixed_expense' ? 'fixed_expense' : 'subscription';
                var entry = { id: f.id, title: String(f.titulo || '').trim(), type: type, date: '', categoryId: getCategoryIdForType(type), tags: [] };
                entry.amount = parseFloat(f.importe) || 0;
                entry.renewalDay = parseInt(f.dia) || 1;
                entry.active = f.activa !== false;
                entry.proAccount = f.cuenta || '';
                entry.vigilar = !!f.vigilar;
                var web = String(f.web || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
                var idx = entries.findIndex(function (e) { return String(e.id) === String(f.id); });
                var previa = idx >= 0 ? entries[idx] : null;
                entry.date = (previa && previa.date) || todayISO();
                if (previa) { entry.tags = previa.tags || []; }
                if (!previa || previa.title !== entry.title || (previa.logoDominio || '') !== web) { entry.logo = undefined; entry.logoIntento = undefined; }
                entry.logoDominio = web || undefined;
                if (previa) {
                    var nueva = Object.assign({}, previa, entry);
                    Object.keys(nueva).forEach(function (k) { if (nueva[k] === undefined) delete nueva[k]; });
                    entries[idx] = nueva;
                    if ((previa.active !== false) !== (entry.active !== false)) { nueva.active = previa.active; suscripcionCambiarEstado(nueva, entry.active !== false); }
                } else {
                    entry.altaDesde = todayISO();
                    Object.keys(entry).forEach(function (k) { if (entry[k] === undefined) delete entry[k]; });
                    entries.push(entry);
                }
                return true;
            }));
        },
        suscripcionDatos: function (id) {
            var e = entries.find(function (x) { return String(x.id) === id; });
            return JSON.stringify(e ? { id: String(e.id), tipo: e.type, titulo: e.title || '', importe: String(e.amount != null ? e.amount : ''), dia: Number(e.renewalDay) || 1, activa: e.active !== false, cuenta: e.proAccount || '', vigilar: !!e.vigilar, web: e.logoDominio || '' } : null);
        },
        // openFinanceProTransactionModal: el borrador del editor con lo que hace falta para pintarlo.
        movimientoDatos: function (id, tipo) {
            var t = id ? financePro.transactions.find(function (x) { return String(x.id) === id; }) : null;
            var d = t ? Object.assign({}, t, { category: t.category || '', transferTo: t.transferTo || '', note: t.note || '' })
                : { type: tipo === 'income' ? 'income' : 'expense', account: FINANCE_PRO_ACCOUNT_KEYS[0], date: todayISO(), amount: '', category: '', note: '', transferTo: '' };
            return JSON.stringify({
                existe: !!t,
                tipo: d.type, fecha: d.date || todayISO(), importe: d.amount === '' || d.amount == null ? '' : String(d.amount).replace('.', ','),
                cuenta: d.account || FINANCE_PRO_ACCOUNT_KEYS[0], destino: d.transferTo || '', categoria: d.category || '', nota: d.note || '',
                viaje: !!d.viaje, viajeId: d.viajeId || '', ahorro: !!d.ahorro, inversion: d.investmentAccountId || '', hora: d.hora || '',
                ajuste: financeProEsAjuste(d), categoriaAuto: !!(d.categoriaAuto && d.category), pendiente: !!d.pendiente,
                banco: t ? String(t.bankNote || (!t.manual ? t.note || '' : '')) : '',
                cuentas: FINANCE_PRO_ACCOUNT_KEYS.map(function (k) { return { id: k, nombre: String(nombreCuenta(k)) }; }),
                categorias: financePro.categories.map(function (c) { return { id: String(c.id), nombre: String(c.name || c.id), tipo: c.type || '' }; }),
                viajes: financeProViajesConFecha().map(function (v) { return { id: String(v.id), nombre: String(financeProNombreViaje(v)) }; }),
                inversiones: (financeProfile.investmentAccounts || []).map(function (a) { return { id: String(a.id), nombre: String(a.name || 'inversión') }; })
            });
        },
        // ¿Es de la categoría Inversiones? (para enseñar «a qué inversión.»)
        esInversion: function (tipo, categoria) { return JSON.stringify(financeProEsInversion({ type: tipo, category: categoria })); },
        // saveFinanceProTransaction, sin pantalla: mismas reglas al crear y al editar.
        guardarMovimiento: function (datos) {
            var d = JSON.parse(datos);
            return JSON.stringify(enCopia(function () {
                var amount = Math.abs(financeProParseEuroAmount(d.importe));
                if (!(amount > 0)) throw new Error('Introduce un importe válido');
                if (d.tipo === 'transfer' && (!d.destino || d.destino === d.cuenta)) throw new Error('Elige una cuenta destino distinta');
                var esInv = financeProEsInversion({ type: d.tipo, category: d.categoria });
                var entry = {
                    id: d.id || ('ptx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
                    date: d.fecha || todayISO(), account: d.cuenta, type: d.tipo, amount: amount,
                    category: d.tipo === 'transfer' ? undefined : (d.categoria || undefined),
                    investmentAccountId: d.inversion && esInv ? d.inversion : undefined,
                    transferTo: d.tipo === 'transfer' ? d.destino : undefined,
                    note: (d.nota || '').trim() || undefined,
                    viaje: d.tipo === 'expense' && d.viaje ? true : undefined,
                    viajeId: d.tipo === 'expense' && d.viaje && d.viajeId ? d.viajeId : undefined,
                    ahorro: d.tipo !== 'transfer' && d.ahorro ? true : undefined,
                    hora: d.hora || financeProHoraAhora(d.fecha || todayISO())
                };
                var prev = financePro.transactions.find(function (t) { return String(t.id) === String(entry.id); });
                if (prev) ['manual', 'recurringEntryId', 'cicloMes', 'programadoId', 'conciliado', 'bankNote', 'pendiente', 'noDuplicadoDe', 'claveImport', 'ajuste', 'orden'].forEach(function (k) { if (prev[k] !== undefined) entry[k] = prev[k]; });
                else entry.manual = true;
                if (prev && !prev.manual && !prev.bankNote && prev.note && entry.note !== prev.note) entry.bankNote = prev.note;
                if (prev && !prev.manual && !prev.claveImport) {
                    var clave = prev.account + '|' + prev.date + '|' + prev.amount + '|' + (prev.bankNote != null ? prev.bankNote : (prev.note != null ? prev.note : ''));
                    var nueva = entry.account + '|' + entry.date + '|' + entry.amount + '|' + (entry.bankNote != null ? entry.bankNote : (entry.note != null ? entry.note : ''));
                    if (clave !== nueva) entry.claveImport = clave;
                }
                Object.keys(entry).forEach(function (k) { if (entry[k] === undefined) delete entry[k]; });
                var idx = financePro.transactions.findIndex(function (t) { return String(t.id) === String(entry.id); });
                if (idx >= 0) financePro.transactions[idx] = entry; else financePro.transactions.push(entry);
                return entry.category ? financeProAutoCategorizar() : 0;
            }));
        },
        borrarMovimiento: function (id) {
            return JSON.stringify(enCopia(function () { financePro.transactions = financePro.transactions.filter(function (t) { return String(t.id) !== id; }); return true; }));
        },
        // ---- «más opciones.» (mobileFinMenu): lo que enseñan sus modales, como datos ----
        gestion: function () {
            var dup = findFinanceProDuplicates();
            var pos = findFinanceProPosiblesDuplicados(dup);
            var item = function (t) {
                var cat = financeProCategoryById(t.category);
                return { id: String(t.id), texto: nombreCuenta(t.account) + ', ' + financeDateLabelShort(t.date) + (cat ? ', ' + cat.name : ''), nota: String(t.note || ''), tipo: t.type, importe: Number(t.amount) || 0 };
            };
            return JSON.stringify({
                cuentas: FINANCE_PRO_ACCOUNT_KEYS.map(function (k) { return { id: k, nombre: String(nombreCuenta(k)), saldo0: Number(financePro.accounts[k].balance0 || 0), saldo: financeProAccountBalance(k) }; }),
                categorias: financePro.categories.map(function (c) { return { id: String(c.id), nombre: String(c.name || ''), tipo: c.type || '', color: c.color || '' }; }),
                paleta: FINANCE_PRO_PALETTE,
                reglas: (financePro.rules || []).map(function (r) { return { id: String(r.id), texto: String(r.matchText || ''), cuenta: String(nombreCuenta(r.otherAccount)), activa: !!r.enabled }; }),
                duplicados: dup.map(function (p) { return [item(p[0]), item(p[1])]; }),
                posibles: pos.map(function (p) { return [item(p[0]), item(p[1])]; })
            });
        },
        dividirCandidatos: function (origen, palabras) {
            dividirCat = { origen: origen, nombre: '', palabras: palabras, fuera: new Set() };
            var l = dividirCategoriaCandidatos();
            dividirCat = null;
            return JSON.stringify(l.map(function (t) { return { id: String(t.id), dia: financeDateLabelShort(t.date), concepto: String(t.note || t.bankNote || 'movimiento'), importe: Number(t.amount) || 0 }; }));
        },
        // La foto de antes de importar (financeFotoFinanzas), para «deshacer importación.».
        foto: function () { return JSON.stringify(financeFotoFinanzas()); },
        accion: function (nombre, datos) {
            var a = JSON.parse(datos || '{}');
            return JSON.stringify(enCopia(function () {
                switch (nombre) {
                case 'cuentas':
                    a.cuentas.forEach(function (c) {
                        if (!financePro.accounts[c.id]) return;
                        var n = String(c.nombre || '').trim();
                        if (n) financePro.accounts[c.id].name = n;
                        financePro.accounts[c.id].balance0 = Number(String(c.saldo0).replace(',', '.')) || 0;
                    });
                    return true;
                case 'ajustarSaldo':
                    var target = financeProParseEuroAmount(String(a.saldo));
                    if (!Number.isFinite(target)) throw new Error('Introduce un importe válido');
                    var diff = Math.round((target - financeProAccountBalance(a.cuenta)) * 100) / 100;
                    if (Math.abs(diff) < 0.01) return 'El saldo ya coincidía';
                    financePro.transactions.push({ id: 'ptx_adj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), date: todayISO(), account: a.cuenta, type: diff > 0 ? 'income' : 'expense', amount: Math.abs(diff), note: 'Ajuste de saldo', ajuste: true });
                    return 'Saldo ajustado, ' + (diff > 0 ? '+' : '-') + financeMoney(Math.abs(diff));
                case 'restablecer':
                    financePro.accounts = { efectivo: { name: 'Efectivo', balance0: 0 }, bancos: { name: 'Bancos', balance0: 0 }, online: { name: 'Online', balance0: 0 } };
                    financePro.categories = financeProDefaultCategories();
                    financePro.transactions = []; financePro.categoryBudgets = {}; financePro.rules = []; financePro.programados = []; financePro.historialPresupuestos = {};
                    if (a.alcance === 'todo') financeProfile = financeProfileVacio();
                    return true;
                case 'categoria':
                    var nombreCat = String(a.nombre || '').trim();
                    if (!nombreCat) throw new Error('Ponle un nombre a la categoría');
                    financePro.categories.push({ id: 'cat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name: nombreCat, icon: 'other', color: a.color || FINANCE_PRO_PALETTE[0], type: a.tipo === 'income' ? 'income' : 'expense' });
                    return true;
                case 'borrarCategoria':
                    financePro.categories = financePro.categories.filter(function (c) { return String(c.id) !== a.id; });
                    financePro.transactions.forEach(function (t) { if (String(t.category) === a.id) delete t.category; });
                    return true;
                case 'dividir':
                    dividirCat = { origen: a.origen, nombre: String(a.nombre || '').trim(), palabras: a.palabras, fuera: new Set(a.fuera || []) };
                    var mover = dividirCategoriaCandidatos().filter(function (t) { return !dividirCat.fuera.has(String(t.id)); });
                    if (!mover.length || !dividirCat.nombre) { dividirCat = null; throw new Error('Nada que mover'); }
                    var origen = financeProCategoryById(dividirCat.origen);
                    var destino = financePro.categories.find(function (c) { return c.type === 'expense' && financeProNormalizar(c.name) === financeProNormalizar(dividirCat.nombre); });
                    if (!destino) {
                        var usados = new Set(financePro.categories.map(function (c) { return c.color; }));
                        destino = { id: 'cat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name: dividirCat.nombre, icon: (origen && origen.icon) || 'other', color: FINANCE_PRO_PALETTE.find(function (c) { return !usados.has(c); }) || FINANCE_PRO_PALETTE[0], type: 'expense' };
                        financePro.categories.push(destino);
                    }
                    mover.forEach(function (t) { t.category = destino.id; t.needsReview = false; delete t.categoriaAuto; });
                    dividirCat = null;
                    return mover.length + ' movimientos pasan de «' + ((origen && origen.name) || 'la categoría') + '» a «' + destino.name + '».';
                case 'regla':
                    var texto = String(a.texto || '').trim();
                    if (!texto) throw new Error('Escribe el texto a buscar en el concepto');
                    financePro.rules.push({ id: 'prule_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), enabled: true, matchText: texto, otherAccount: a.cuenta });
                    return true;
                case 'activarRegla':
                    var r = financePro.rules.find(function (x) { return String(x.id) === a.id; });
                    if (r) r.enabled = !r.enabled;
                    return true;
                case 'borrarRegla':
                    financePro.rules = financePro.rules.filter(function (x) { return String(x.id) !== a.id; });
                    return true;
                case 'fusionar':
                    var x1 = financePro.transactions.find(function (t) { return String(t.id) === a.a; });
                    var x2 = financePro.transactions.find(function (t) { return String(t.id) === a.b; });
                    if (!x1 || !x2) return false;
                    var puntos = function (t) { return (t.manual ? 4 : 0) + (t.category ? 2 : 0) + (t.needsReview ? -1 : 0); };
                    var base = puntos(x1) >= puntos(x2) ? x1 : x2, otra = base === x1 ? x2 : x1;
                    if (otra.note) base.bankNote = otra.bankNote || otra.note;
                    if (!base.note && otra.note) base.note = otra.note;
                    if (!base.category && otra.category) { base.category = otra.category; base.needsReview = false; }
                    if (!base.recurringEntryId && otra.recurringEntryId) { base.recurringEntryId = otra.recurringEntryId; base.cicloMes = financeProCicloMes(otra); }
                    if (otra.pendiente) base.pendiente = true;
                    base.conciliado = true;
                    financePro.transactions = financePro.transactions.filter(function (t) { return t !== otra; });
                    return true;
                case 'noDuplicado':
                    var y1 = financePro.transactions.find(function (t) { return String(t.id) === a.a; });
                    var y2 = financePro.transactions.find(function (t) { return String(t.id) === a.b; });
                    if (!y1 || !y2) return false;
                    y1.noDuplicadoDe = (y1.noDuplicadoDe || []).concat([y2.id]);
                    y2.noDuplicadoDe = (y2.noDuplicadoDe || []).concat([y1.id]);
                    return true;
                // openFinanceProCuadre: los tres arreglos de un cuadre que no cuadra.
                case 'cuadreQuitar':
                    var ids = new Set((a.ids || []).map(String));
                    if (!ids.size) return false;
                    financePro.transactions = financePro.transactions.filter(function (t) { return !ids.has(String(t.id)); });
                    invalidar();
                    var c1 = ultimoCuadre, saldo = c1 ? Math.round(financeProAccountBalance(c1.cuenta) * 100) / 100 : 0;
                    return ids.size + (ids.size === 1 ? ' movimiento quitado. ' : ' movimientos quitados. ') + (c1 && Math.abs(saldo - c1.esperado) < 0.005 ? 'Cuadra con el extracto.' : 'Saldo: ' + financeMoney(saldo) + '.');
                case 'cuadreAjustar':
                    var c2 = ultimoCuadre;
                    if (!c2) return false;
                    var d2 = Math.round((c2.esperado - c2.actual) * 100) / 100;
                    if (Math.abs(d2) < 0.005) return false;
                    financePro.transactions.push({ id: 'ptx_adj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), date: c2.hasta, account: c2.cuenta, type: d2 > 0 ? 'income' : 'expense', amount: Math.abs(d2), note: 'Ajuste de saldo', ajuste: true });
                    ultimoCuadre = null;
                    return 'Saldo ajustado al del extracto: ' + financeMoney(c2.esperado);
                case 'cuadreFijar':
                    var c3 = ultimoCuadre;
                    if (!c3) return false;
                    var d3 = Math.round((c3.esperado - (c3.retenido || 0) - c3.actual) * 100) / 100;
                    if (Math.abs(d3) < 0.005) return false;
                    financePro.accounts[c3.cuenta].balance0 = Math.round((Number(financePro.accounts[c3.cuenta].balance0 || 0) + d3) * 100) / 100;
                    ultimoCuadre = null;
                    return financeProCuentaNombre(c3.cuenta) + ' empieza ahora con ' + financeMoney(financePro.accounts[c3.cuenta].balance0) + ' y cuadra con el extracto: ' + financeMoney(c3.esperado);
                case 'volver':
                    // financeAplicarVuelta: Finanzas como en la foto, y en las entradas solo la cuenta y el concepto del banco.
                    var foto = a.foto;
                    if (!foto || !foto.financePro) throw new Error('Esa copia ya no está');
                    if (!foto.recurrentes && Array.isArray(foto.entradas)) { foto.recurrentes = {}; foto.entradas.forEach(function (e) { if (e && e.id) foto.recurrentes[e.id] = { proAccount: e.proAccount, conceptoBanco: e.conceptoBanco }; }); }
                    financePro = JSON.parse(JSON.stringify(foto.financePro));
                    entries.forEach(function (e) {
                        var rr = foto.recurrentes && foto.recurrentes[e.id];
                        if (!rr) return;
                        ['proAccount', 'conceptoBanco'].forEach(function (k) { if (rr[k] === undefined) delete e[k]; else e[k] = rr[k]; });
                    });
                    return true;
                }
                throw new Error('acción desconocida');
            }));
        },
        suscripcion: function (id, accion) {
            return JSON.stringify(enCopia(function () {
                var e = entries.find(function (x) { return String(x.id) === id; });
                if (!e) return false;
                if (accion === 'baja') suscripcionCambiarEstado(e, false);
                else if (accion === 'alta') suscripcionCambiarEstado(e, true);
                else if (accion === 'visto') e.cobrosVistos = Array.from(new Set((e.cobrosVistos || []).concat(suscripcionCobrosTrasBaja(e).map(function (t) { return t.id; }))));
                else if (accion === 'borrar') entries = entries.filter(function (x) { return String(x.id) !== id; });
                return true;
            }));
        },
        // asistAnadirSuscripcion / asistIgnorarSuscripcion sin repintar ni guardar.
        detectada: function (clave, accion, nuevoId) {
            return JSON.stringify(enCopia(function () {
                if (accion === 'ignorar') { financePro.suscripcionesIgnoradas = Array.from(new Set((financePro.suscripcionesIgnoradas || []).concat([clave]))); return true; }
                var s = asistSuscripcionesDetectadas().find(function (x) { return x.clave === clave; });
                if (!s) return false;
                var nombre = s.nombre.charAt(0).toUpperCase() + s.nombre.slice(1);
                entries.push({ id: nuevoId, type: 'subscription', title: nombre, amount: s.importe, renewalDay: s.dia, active: true, proAccount: s.cuenta, conceptoBanco: asistNorm(s.concepto), categoryId: getCategoryIdForType('subscription'), tags: [], date: todayISO() });
                return nombre;
            }));
        },
        logoPendientes: function () {
            var mes = isoLocal(new Date(Date.now() - 30 * 86400000));
            return JSON.stringify(entries.filter(function (e) {
                return (e.type === 'subscription' || e.type === 'fixed_expense') && (e.title || '').trim() && (e.logo === undefined || (e.logo === false && (e.logoIntento || '') < mes));
            }).slice(0, 8).map(function (e) { return { id: String(e.id), q: e.title.trim(), dominio: e.logoDominio || logoDominioConocido(e.title) || '', adivinar: e.type === 'subscription' }; }));
        },
        logos: function () {
            var r = {};
            entries.forEach(function (e) { if ((e.type === 'subscription' || e.type === 'fixed_expense') && logo(e)) r[String(e.id)] = logo(e); });
            return JSON.stringify(r);
        },
        importarPreparar: function (texto, cuenta) {
            var datos = texto;
            try { var p = JSON.parse(texto); if (Array.isArray(p)) datos = p; } catch (e) {}
            imp = financeProPrepararImport(datos, cuenta || undefined);
            return JSON.stringify(vistaImport());
        },
        importarCuenta: function (k) { imp.mapping.account = k; imp.excluidas = null; imp.cuentaConfirmada = true; return JSON.stringify(vistaImport()); },
        importarConfirmar: function () { imp.cuentaConfirmada = true; return JSON.stringify(vistaImport()); },
        importarFila: function (fila, marcada) {
            fila = Number(fila); marcada = marcada === true || marcada === 'true';
            imp.excluidas = new Set(imp.excluidas);
            if (marcada) imp.excluidas.delete(fila); else imp.excluidas.add(fila);
            return JSON.stringify(vistaImport());
        },
        importarEjecutar: function () {
            var r = enCopia(function () {
                renderFinanceProImportFilas(imp);
                var antes = financePro.transactions.length;
                var x = financeProEjecutarImport(imp);
                // Como confirmFinanceProImport: tras importar, cuadre con el saldo del extracto y fuera los duplicados claros.
                invalidar();
                var cuadre = financeProCuadreExtracto(imp);
                var quitados = cuadre ? financeProResolverDuplicados(cuadre) : 0;
                if (quitados) { invalidar(); cuadre = financeProCuadreExtracto(imp); }
                ultimoCuadre = cuadre && !cuadre.cuadra ? JSON.parse(JSON.stringify(cuadre)) : null;
                var detalle = ultimoCuadre ? {
                    desde: financeDateLabelShort(cuadre.desde), hasta: financeDateLabelShort(cuadre.hasta),
                    sobran: (cuadre.sobran || []).map(function (t) { return { id: String(t.id), dia: financeDateLabelShort(t.date), concepto: String(t.note || t.bankNote || (financeProCategoryById(t.category) || {}).name || 'movimiento'), tipo: t.type, importe: Number(t.amount) || 0 }; }),
                    faltan: (cuadre.faltan || []).map(function (f) { return { dia: financeDateLabelShort(f.fechas[0]), concepto: String(f.desc || ''), importe: Number(f.val) || 0 }; })
                } : null;
                return { nuevos: financePro.transactions.length - antes, texto: financeProResumenImport(x), quitados: quitados || 0,
                    cuadre: cuadre ? { cuadra: !!cuadre.cuadra, esperado: cuadre.esperado, actual: cuadre.actual, diff: cuadre.diff || 0, saldoBanco: cuadre.saldoBanco != null ? cuadre.saldoBanco : null, retenido: cuadre.retenido || 0, cuenta: String(nombreCuenta(cuadre.cuenta)), detalle: detalle } : null };
            });
            imp = null;
            return JSON.stringify(r);
        }
    };
})();
