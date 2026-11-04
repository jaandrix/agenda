        // ============================================================
        //  FINANZAS — pestaña «resumen.» (04-11): el mes de un vistazo en paneles pequeños. Todo sale de lo que ya
        //  calcula Finanzas (financeProMonthTotals, financeSerieDiaria, financeRitmoDatos, las cuentas de inversión y
        //  el objetivo de patrimonio); aquí solo se compone.
        // ============================================================
        const FIN_RES_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        const FIN_RES_FLECHA = { sube: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1.5 9 8H1z"/></svg>', baja: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 8.5 1 2h8z"/></svg>' };

        function finResMes(desplazamiento) {
            const d = new Date();
            d.setDate(1);
            d.setMonth(d.getMonth() + (desplazamiento || 0));
            return { clave: financeMonthKey(d), nombre: FIN_RES_MESES[d.getMonth()] };
        }

        function finResSueldoPrevisto(mes) {
            try { return Number(presupuestoPlanDe(mes).plan?.salary) || 0; } catch (e) { return 0; }
        }

        function finResPct(v) {
            return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1).replace('.', ',')} %`;
        }

        function finResVariacion(pct) {
            if (pct === null || !isFinite(pct)) return '<span class="fin-res-var neutra">sin datos</span>';
            const clase = Math.abs(pct) < 0.05 ? 'neutra' : pct > 0 ? 'sube' : 'baja';
            return `<span class="fin-res-var ${clase}">${clase === 'neutra' ? '' : FIN_RES_FLECHA[clase]}${finResPct(pct)}</span>`;
        }

        // Saldo de una cuenta hace n días: el de hoy menos lo que ha movido desde entonces (misma regla que financeProSaldos)
        function finResSaldoHace(cuenta, dias) {
            const desde = isoLocal(new Date(Date.now() - dias * 864e5));
            let saldo = financeProAccountBalance(cuenta);
            financePro.transactions.forEach(t => {
                if (!t.date || t.date <= desde || !financeProCuentaEnSaldo(t)) return;
                const imp = Number(t.amount) || 0;
                if (t.type === 'transfer') {
                    if (t.account === cuenta) saldo += imp;
                    if (t.transferTo === cuenta) saldo -= imp;
                } else if (t.account === cuenta) saldo -= (t.type === 'income' ? 1 : -1) * imp;
            });
            return saldo;
        }

        function finResActivos() {
            const filas = FINANCE_PRO_ACCOUNT_KEYS.map(k => {
                const ahora = financeProAccountBalance(k), antes = finResSaldoHace(k, 30);
                return { nombre: financePro.accounts[k]?.name || k, valor: ahora, pct: Math.abs(antes) > 0.5 ? (ahora - antes) / Math.abs(antes) * 100 : null, nota: '30 días' };
            });
            (financeProfile.investmentAccounts || []).forEach(a => {
                const conValor = (a.contributions || []).filter(c => c.value !== undefined && c.value !== null && c.value !== '').sort((x, y) => x.month.localeCompare(y.month));
                const valor = investmentAccountValue(a);
                const aportado = (a.contributions || []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
                const prev = conValor.length > 1 ? Number(conValor[conValor.length - 2].value) || 0 : null;
                const pct = aportado > 0 ? (valor - aportado) / aportado * 100 : (prev ? (valor - prev) / prev * 100 : null);
                filas.push({ nombre: a.name || 'inversión', valor, pct, nota: aportado > 0 ? 'rentabilidad' : 'último mes' });
            });
            if (!(financeProfile.investmentAccounts || []).length && Number(financeProfile.invested || 0)) filas.push({ nombre: 'inversión', valor: Number(financeProfile.invested), pct: null, nota: '' });
            const emergencia = Number(financeProfile.emergency || 0);
            if (emergencia) {
                const hist = [...(financeProfile.history || [])].filter(h => h.month < financeMonthKey() && Number(h.emergency)).sort((a, b) => b.month.localeCompare(a.month));
                const prev = hist[0] ? Number(hist[0].emergency) : null;
                filas.push({ nombre: 'fondo de emergencia', valor: emergencia, pct: prev ? (emergencia - prev) / prev * 100 : null, nota: 'último mes' });
            }
            return filas;
        }

        // Patrimonio a fin de cada mes, con inversión y emergencia, y la tendencia de los últimos seis meses
        function finResCaminoObjetivo() {
            const serie = financeSerieDiaria(12, true);
            const porMes = {};
            serie.forEach(p => { porMes[p.f.slice(0, 7)] = p.v; });
            const meses = Object.keys(porMes).sort();
            const puntos = meses.map(m => ({ m, v: porMes[m] }));
            const actual = puntos.length ? puntos[puntos.length - 1].v : financeUnifiedPatrimony();
            const base = puntos.length > 6 ? puntos[puntos.length - 7] : puntos[0];
            const n = base ? puntos.length - 1 - puntos.indexOf(base) : 0;
            const ritmo = n > 0 ? (actual - base.v) / n : 0;
            const objetivo = financeTargetTotal();
            let mesesHasta = null;
            if (objetivo > actual && ritmo > 0) mesesHasta = Math.ceil((objetivo - actual) / ritmo);
            return { puntos, actual, ritmo, objetivo, mesesHasta, conseguido: objetivo > 0 && actual >= objetivo };
        }

        function finResGraficaObjetivo(c) {
            if (c.puntos.length < 2) return '<p class="fin-res-vacio">La previsión aparece en cuanto haya un par de meses de movimientos.</p>';
            const proy = [];
            const horizonte = c.mesesHasta ? Math.min(c.mesesHasta, 36) : 12;
            for (let i = 1; i <= horizonte; i++) proy.push(c.actual + c.ritmo * i);
            const todos = c.puntos.map(p => p.v).concat(proy, c.objetivo > 0 ? [c.objetivo] : []);
            let min = Math.min(...todos), max = Math.max(...todos);
            const hueco = (max - min) * 0.12 || Math.abs(max) * 0.1 || 100;
            min -= hueco; max += hueco;
            const total = c.puntos.length - 1 + proy.length;
            const W = 600, H = 200;
            const x = i => i / total * W, y = v => H - (v - min) / (max - min) * H;
            const real = c.puntos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
            const i0 = c.puntos.length - 1;
            const prevision = [`M${x(i0).toFixed(1)},${y(c.actual).toFixed(1)}`].concat(proy.map((v, k) => `L${x(i0 + k + 1).toFixed(1)},${y(v).toFixed(1)}`)).join(' ');
            const area = `${real} L${x(i0).toFixed(1)},${H} L0,${H} Z`;
            const yObj = c.objetivo > 0 ? y(c.objetivo) : null;
            const llegada = c.mesesHasta && c.mesesHasta <= 36 ? { x: x(i0 + c.mesesHasta) / W * 100, y: yObj / H * 100 } : null;
            const fecha = c.mesesHasta ? (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + c.mesesHasta); return `${FIN_RES_MESES[d.getMonth()]} ${d.getFullYear()}`; })() : '';
            const etiquetas = [c.puntos[0].m, c.puntos[i0].m].map(m => FIN_RES_MESES[Number(m.slice(5)) - 1].slice(0, 3) + '.');
            return `<div class="fin-res-graf">
                <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Patrimonio de los últimos meses y su previsión${fecha ? `, llegarías al objetivo en ${fecha}` : ''}.">
                    <path class="area" d="${area}"/>
                    ${yObj !== null ? `<line class="objetivo" x1="0" x2="${W}" y1="${yObj.toFixed(1)}" y2="${yObj.toFixed(1)}"/>` : ''}
                    <line class="hoy" x1="${x(i0).toFixed(1)}" x2="${x(i0).toFixed(1)}" y1="0" y2="${H}"/>
                    <path class="real" d="${real}"/>
                    <path class="prevision" d="${prevision}"/>
                </svg>
                ${yObj !== null ? `<span class="fin-res-graf-obj" style="top:${(yObj / H * 100).toFixed(1)}%">objetivo ${financeMoney(c.objetivo)}</span>` : ''}
                ${llegada ? `<span class="fin-res-graf-punto" style="left:${llegada.x.toFixed(1)}%;top:${llegada.y.toFixed(1)}%"></span><span class="fin-res-graf-fecha" style="left:${llegada.x.toFixed(1)}%;top:${llegada.y.toFixed(1)}%">${fecha}</span>` : ''}
                <span class="fin-res-graf-hoy" style="left:${(x(i0) / W * 100).toFixed(1)}%">hoy</span>
            </div>
            <div class="fin-res-ejes"><span>${etiquetas[0]}</span><span>${etiquetas[1]}</span><span>${c.mesesHasta && c.mesesHasta <= 36 ? fecha : `dentro de ${horizonte} meses`}</span></div>`;
        }

        function finResBarras(entra, sale, previsto) {
            const max = Math.max(entra, sale, previsto, 1);
            const falta = Math.max(0, previsto - entra);
            return `<div class="fin-res-barras">
                <div class="fin-res-barra"><span class="fin-res-barra-nombre">entra.</span><span class="fin-res-barra-pista"><i class="entra" style="width:${(entra / max * 100).toFixed(1)}%"></i>${falta ? `<i class="falta" style="width:${(falta / max * 100).toFixed(1)}%"></i>` : ''}</span><b>${financeMoney(entra)}</b></div>
                <div class="fin-res-barra"><span class="fin-res-barra-nombre">sale.</span><span class="fin-res-barra-pista"><i class="sale" style="width:${(sale / max * 100).toFixed(1)}%"></i></span><b>${financeMoney(sale)}</b></div>
            </div>`;
        }

        function finResPanelMes(titulo, mes, conSueldo) {
            const { income, expense } = financeProMonthTotals(mes.clave);
            const sueldo = conSueldo ? finResSueldoPrevisto(mes.clave) : 0;
            const falta = Math.max(0, sueldo - income);
            const neto = income - expense;
            return `<section class="finance-panel fin-res-panel">
                <div class="fin-res-cab"><h3>${titulo}</h3><span class="fin-res-sub">${mes.nombre}.</span></div>
                <div class="fin-res-cifra ${neto < 0 ? 'finance-negative' : ''}">${neto >= 0 ? '+' : '−'}${financeMoney(Math.abs(neto))}</div>
                <div class="fin-res-nota">${neto >= 0 ? 'te queda' : 'has gastado más de lo que ha entrado'}${falta ? `, y aún falta por entrar ${financeMoney(falta)} del sueldo previsto` : ''}.</div>
                ${finResBarras(income, expense, sueldo)}
                ${conSueldo && sueldo ? `<div class="fin-res-pie"><span>sueldo previsto.</span><b>${financeMoney(sueldo)}</b></div>` : ''}
            </section>`;
        }

        function finResPanelAhorro() {
            const meses = [];
            for (let i = 5; i >= 0; i--) {
                const m = finResMes(-i), { income, expense } = financeProMonthTotals(m.clave);
                meses.push({ m, tasa: income > 0 ? (income - expense) / income * 100 : null });
            }
            const actual = meses[meses.length - 1].tasa;
            const pasados = meses.slice(0, -1).filter(x => x.tasa !== null);
            const media = pasados.length ? pasados.reduce((s, x) => s + x.tasa, 0) / pasados.length : null;
            return `<section class="finance-panel fin-res-panel">
                <div class="fin-res-cab"><h3>tasa de ahorro.</h3><span class="fin-res-sub">de lo que entra.</span></div>
                <div class="fin-res-cifra">${actual === null ? 'sin ingresos' : finResPct(actual).replace('+', '')}</div>
                <div class="fin-res-nota">${media === null ? 'este mes.' : `este mes, frente a un ${finResPct(media).replace('+', '')} de media.`}</div>
                <div class="fin-res-columnas">${meses.map(x => {
                    const alto = x.tasa === null ? 0 : Math.max(2, Math.min(100, Math.abs(x.tasa)));
                    return `<div class="fin-res-col ${x.tasa !== null && x.tasa < 0 ? 'negativa' : ''}" title="${x.m.nombre}: ${x.tasa === null ? 'sin ingresos' : finResPct(x.tasa)}"><i style="height:${alto}%"></i><span>${x.m.nombre.slice(0, 1)}</span></div>`;
                }).join('')}</div>
            </section>`;
        }

        function finResPanelObjetivo() {
            const c = finResCaminoObjetivo();
            let frase;
            if (!c.objetivo) frase = `Tu patrimonio es de ${financeMoney(c.actual)}. Ponte un objetivo para ver cuándo llegas.`;
            else if (c.conseguido) frase = `Objetivo conseguido: tienes ${financeMoney(c.actual)} de ${financeMoney(c.objetivo)}.`;
            else if (c.ritmo <= 0) frase = `A este ritmo no llegas: en los últimos meses tu patrimonio ${c.ritmo < 0 ? 'baja' : 'no crece'}. Te faltan ${financeMoney(c.objetivo - c.actual)}.`;
            else frase = `Al ritmo de los últimos meses (${financeMoney(c.ritmo)} al mes) llegarías en ${c.mesesHasta} ${c.mesesHasta === 1 ? 'mes' : 'meses'}. Te faltan ${financeMoney(c.objetivo - c.actual)}.`;
            return `<section class="finance-panel fin-res-panel fin-res-ancho">
                <div class="fin-res-cab"><h3>camino al objetivo.</h3><button class="vista-btn" onclick="openFinanceTargetEditor()">${c.objetivo ? 'cambiar objetivo.' : 'poner objetivo.'}</button></div>
                <div class="fin-res-nota">${frase}</div>
                ${finResGraficaObjetivo(c)}
            </section>`;
        }

        function finResPanelActivos() {
            const filas = finResActivos();
            const total = filas.reduce((s, f) => s + f.valor, 0);
            return `<section class="finance-panel fin-res-panel">
                <div class="fin-res-cab"><h3>tus activos.</h3><span class="fin-res-sub">en directo.</span></div>
                <div class="fin-res-activos">${filas.map(f => `
                    <div class="fin-res-activo"><span class="fin-res-activo-nombre">${escapeHtml(f.nombre.toLowerCase())}.</span><b>${financeMoney(f.valor)}</b>${finResVariacion(f.pct)}</div>`).join('')}
                </div>
                <div class="fin-res-pie"><span>total.</span><b>${financeMoney(total)}</b></div>
            </section>`;
        }

        function finResPanelSuscripciones() {
            const hoy = new Date(), dia = hoy.getDate();
            const lista = entries.filter(e => (e.type === 'subscription' || e.type === 'fixed_expense') && e.active !== false && Number(e.amount) > 0
                && (e.type !== 'subscription' || typeof suscripcionVigente !== 'function' || suscripcionVigente(e, todayISO())))
                .map(e => {
                    const d = Number(e.renewalDay) || 1;
                    return { e, d, faltan: d >= dia ? d - dia : d + new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate() - dia };
                })
                .sort((a, b) => a.faltan - b.faltan);
            const mes = lista.reduce((s, x) => s + Number(x.e.amount), 0);
            return `<section class="finance-panel fin-res-panel fin-res-ancho">
                <div class="fin-res-cab"><h3>suscripciones y fijos.</h3><span class="fin-res-sub">${financeMoney(mes)} al mes, ${financeMoney(mes * 12)} al año.</span></div>
                ${lista.length ? `<div class="fin-res-subs">${lista.map(x => `
                    <div class="fin-res-sub-tesela ${x.faltan <= 3 ? 'pronto' : ''}">
                        <span class="fin-res-inicial" aria-hidden="true">${escapeHtml((x.e.title || '?').trim().charAt(0).toUpperCase())}</span>
                        <span class="fin-res-sub-nombre">${escapeHtml(x.e.title || 'sin nombre')}</span>
                        <b>${financeMoney(Number(x.e.amount))}</b>
                        <span class="fin-res-sub-dia">${x.faltan === 0 ? 'hoy.' : x.faltan === 1 ? 'mañana.' : `día ${x.d}, en ${x.faltan} días.`}</span>
                    </div>`).join('')}</div>` : '<p class="fin-res-vacio">No tienes suscripciones ni gastos fijos activos.</p>'}
                <div class="fin-res-pie"><button class="vista-btn" onclick="openGestorSuscripciones()">gestionar suscripciones.</button></div>
            </section>`;
        }

        // Fin de mes: saldo de hoy, menos los fijos que quedan, menos el gasto normal que falta (ritmo), más el sueldo por entrar
        function finResPanelPrevision() {
            const hoy = new Date(), dia = hoy.getDate(), mes = financeMonthKey();
            const saldo = financeProTotalBalance();
            const fijos = entries.filter(e => (e.type === 'subscription' || e.type === 'fixed_expense') && e.active !== false && Number(e.amount) > 0 && (Number(e.renewalDay) || 1) > dia
                && (e.type !== 'subscription' || typeof suscripcionVigente !== 'function' || suscripcionVigente(e, todayISO()))).reduce((s, e) => s + Number(e.amount), 0);
            let variable = 0;
            try { const r = financeRitmoDatos(); if (r.suficiente) variable = Math.max(0, r.proyeccion - r.llevas); } catch (e) { /* sin ritmo: solo los fijos */ }
            const porEntrar = Math.max(0, finResSueldoPrevisto(mes) - financeProMonthTotals(mes).income);
            const fin = saldo - fijos - variable + porEntrar;
            const gastos = [1, 2, 3].map(i => financeProMonthTotals(finResMes(-i).clave).expense).filter(v => v > 0);
            const medio = gastos.length ? gastos.reduce((s, v) => s + v, 0) / gastos.length : 0;
            const colchon = medio ? (saldo + Number(financeProfile.emergency || 0)) / medio : null;
            const cats = {};
            financePro.transactions.forEach(t => { if (t.type === 'expense' && t.date?.startsWith(mes) && !financeProNeutro(t)) cats[t.category || ''] = (cats[t.category || ''] || 0) + (Number(t.amount) || 0); });
            const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
            return `<section class="finance-panel fin-res-panel">
                <div class="fin-res-cab"><h3>fin de mes.</h3><span class="fin-res-sub">previsión.</span></div>
                <div class="fin-res-cifra ${fin < 0 ? 'finance-negative' : ''}">${financeMoney(fin)}</div>
                <div class="fin-res-nota">en tus cuentas el día ${new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()}, contando fijos${variable ? ', tu gasto normal' : ''}${porEntrar ? ' y el sueldo por entrar' : ''}.</div>
                <div class="fin-res-lineas">
                    <div><span>fijos que quedan.</span><b>${financeMoney(fijos)}</b></div>
                    ${variable ? `<div><span>gasto normal hasta fin de mes.</span><b>${financeMoney(variable)}</b></div>` : ''}
                    ${porEntrar ? `<div><span>sueldo por entrar.</span><b>${financeMoney(porEntrar)}</b></div>` : ''}
                    ${colchon !== null ? `<div><span>colchón.</span><b>${colchon.toFixed(1).replace('.', ',')} meses</b></div>` : ''}
                    ${top ? `<div><span>donde más gastas.</span><b>${escapeHtml((financeProCategoryById(top[0])?.name || 'sin categoría').toLowerCase())}</b></div>` : ''}
                </div>
            </section>`;
        }

        function renderFinanzasResumen() {
            return `<div class="fin-res">
                ${finResPanelMes('este mes.', finResMes(0), true)}
                ${finResPanelMes('mes anterior.', finResMes(-1), false)}
                ${finResPanelAhorro()}
                ${finResPanelObjetivo()}
                ${finResPanelActivos()}
                ${finResPanelSuscripciones()}
                ${finResPanelPrevision()}
            </div>`;
        }
