        // ============================================================
        //  FICHA DE UNA CUENTA DE INVERSIÓN (04-11): el mes que toca (hereda lo del mes anterior y solo se guarda al
        //  pulsar «guardar.»), las rentabilidades, la proyección si mantienes el ritmo (y con 50 € más al mes) y el
        //  histórico. Los datos son los de siempre (financeProfile.investmentAccounts[].contributions: month, amount,
        //  value); el correo mensual del banco añade «correo» por el conector (op inversion) y nunca pisa lo guardado.
        // ============================================================
        let invFichaCuenta = null;
        let invFichaMes = null;
        const INV_HORIZONTES = [5, 10, 15, 20, 25];
        const INV_EXTRA = 50;

        // Las aportaciones salen de los movimientos: lo que va a «a tu inversión» menos lo que vuelve de ella, sumado por
        // mes (dos traspasos en un mes son una aportación de su suma). Con varias cuentas de inversión, cada una se queda
        // los movimientos cuyo concepto lleva su texto (traspasoTexto). Menos de 1 € no cuenta: son las transferencias de
        // prueba al abrir la cuenta.
        function invTraspasos(acc) {
            const cuentas = financeProfile.investmentAccounts || [];
            const clave = financeProNormalizar(acc.traspasoTexto || '').trim();
            if (cuentas.length > 1 && !clave) return [];
            return (financePro.transactions || []).filter(t => financeProEsInversion(t) && Math.abs(Number(t.amount) || 0) >= 1 && /^\d{4}-\d{2}/.test(t.date || '')
                && (!clave || financeProNormalizar(`${t.note || ''} ${t.bankNote || ''}`).includes(clave)))
                .sort((a, b) => a.date.localeCompare(b.date));
        }
        function invTraspasosPorMes(acc) {
            const porMes = {};
            invTraspasos(acc).forEach(t => {
                const m = t.date.slice(0, 7);
                (porMes[m] = porMes[m] || { suma: 0, lista: [] }).lista.push(t);
                porMes[m].suma = Math.round((porMes[m].suma + (t.type === 'income' ? -1 : 1) * Math.abs(Number(t.amount) || 0)) * 100) / 100;
            });
            return porMes;
        }

        // Pone en cada mes la aportación de sus movimientos (salvo en los guardados a mano, que solo se avisan) y pasa los
        // meses del correo a saldo total: el correo da la cartera y lo invertido, no el dinero enviado que espera a
        // invertirse, así que el saldo total es lo enviado hasta ese mes más la ganancia desde el inicio que da el correo.
        // Devuelve si ha cambiado algo.
        function invSincronizarMovimientos() {
            let cambio = false;
            (financeProfile.investmentAccounts || []).forEach(acc => {
                const antes = JSON.stringify(acc.contributions || []);
                const porMes = invTraspasosPorMes(acc);
                acc.contributions = acc.contributions || [];
                const meses = new Set([...Object.keys(porMes), ...acc.contributions.filter(c => c.deMovimientos).map(c => c.month)]);
                meses.forEach(m => {
                    const suma = porMes[m]?.suma || 0;
                    const c = acc.contributions.find(x => x.month === m);
                    if (!c) { if (suma) acc.contributions.push({ month: m, amount: suma, deMovimientos: true }); return; }
                    if (c.guardado) return;
                    c.amount = suma;
                    c.deMovimientos = true;
                });
                acc.contributions = acc.contributions.filter(c => !(c.deMovimientos && !c.guardado && !c.amount && !c.correo && (c.value === undefined || c.value === null || c.value === '')));
                let enviado = 0;
                [...acc.contributions].sort((a, b) => a.month.localeCompare(b.month)).forEach(c => {
                    enviado = Math.round((enviado + (Number(c.amount) || 0)) * 100) / 100;
                    if (c.guardado || !c.correo) return;
                    const g = Number(c.correo.gananciasInicio);
                    c.value = isFinite(g) && c.correo.gananciasInicio !== null && c.correo.gananciasInicio !== '' ? Math.round((enviado + g) * 100) / 100 : Number(c.correo.valor);
                });
                if (JSON.stringify(acc.contributions) !== antes) cambio = true;
            });
            return cambio;
        }

        function invFechaCorta(iso) { return new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', ''); }

        function invCuenta(id) { return (financeProfile.investmentAccounts || []).find(a => a.id === id) || null; }
        function invRentabilidadSupuesta() { const v = Number(financeProfile.inversionRentabilidad); return isFinite(v) && v > -50 && v < 50 && financeProfile.inversionRentabilidad !== undefined ? v : 6; }
        function invPct(v, dec = 1) { return v === null || !isFinite(v) ? 'sin datos' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(dec).replace('.', ',')} %`; }

        // Rentabilidad de cada mes con el método de Dietz (la aportación cuenta la mitad del mes), la media, la acumulada
        // sobre lo aportado y la anual equivalente encadenando los meses.
        function invDatos(acc) {
            const filas = [...(acc.contributions || [])].sort((a, b) => a.month.localeCompare(b.month));
            let aportado = 0, previo = null;
            const meses = filas.map(c => {
                const amount = Number(c.amount) || 0;
                aportado += amount;
                const value = c.value === undefined || c.value === null || c.value === '' ? null : Number(c.value);
                let rent = null;
                if (value !== null) {
                    const base = previo === null ? amount : previo + amount / 2;
                    if (base > 0) rent = (value - (previo || 0) - amount) / base * 100;
                    previo = value;
                }
                return { c, amount, aportado, value, ganancia: value === null ? null : value - aportado, rent };
            });
            const conRent = meses.filter(m => m.rent !== null && (meses.indexOf(m) > 0));
            const media = conRent.length ? conRent.reduce((s, m) => s + m.rent, 0) / conRent.length : null;
            const encadenado = conRent.reduce((p, m) => p * (1 + m.rent / 100), 1);
            const anual = conRent.length ? (Math.pow(encadenado, 12 / conRent.length) - 1) * 100 : null;
            const ultimo = [...meses].reverse().find(m => m.value !== null) || null;
            // Lo enviado después del último valor apuntado (el mes en curso, aún sin valor) ya está en la cuenta: cuenta
            // por lo que es hasta que pongas el valor, para que la ganancia no baje de golpe a principio de mes.
            const valor = ultimo ? ultimo.value + (aportado - ultimo.aportado) : 0;
            const acumulada = aportado > 0 && ultimo ? (valor - aportado) / aportado * 100 : null;
            const ultimaAportacion = meses.length ? meses[meses.length - 1].amount : 0;
            return { meses, aportado, valor, ganancia: valor - aportado, acumulada, media, anual, ultimaAportacion };
        }

        // Valor futuro con aportación mensual fija y la rentabilidad anual pasada a mensual compuesta
        function invFuturo(inicial, mensual, anualPct, meses) {
            const r = Math.pow(1 + anualPct / 100, 1 / 12) - 1;
            const f = Math.pow(1 + r, meses);
            return r === 0 ? inicial + mensual * meses : inicial * f + mensual * (f - 1) / r;
        }

        function invProyeccionHtml(d) {
            const R = invRentabilidadSupuesta();
            const A = d.ultimaAportacion, P = d.valor;
            const total = 25 * 12;
            const puntos = n => ({ base: invFuturo(P, A, R, n), mas: invFuturo(P, A + INV_EXTRA, R, n), puesto: P + A * n });
            const serie = []; for (let n = 0; n <= total; n += 3) serie.push({ n, ...puntos(n) });
            const max = Math.max(1, ...serie.map(s => s.mas));
            const W = 600, H = 220, x = n => n / total * W, y = v => H - v / max * H;
            const camino = clave => serie.map((s, i) => `${i ? 'L' : 'M'}${x(s.n).toFixed(1)},${y(s[clave]).toFixed(1)}`).join(' ');
            const filas = INV_HORIZONTES.map(a => ({ a, ...puntos(a * 12) }));
            return `
                <div class="inv-proy-cab">
                    <p class="inv-texto">Aportando <b>${financeMoney(A)}</b> al mes desde los <b>${financeMoney(P)}</b> de hoy, con un <label class="inv-tasa"><input type="number" step="0.5" min="-20" max="30" value="${R}" onchange="invCambiarTasa(this.value)" aria-label="Rentabilidad anual supuesta"> %</label> anual.</p>
                    <div class="inv-leyenda"><span><i class="base"></i>si mantienes el ritmo.</span><span><i class="mas"></i>con ${INV_EXTRA} € más al mes.</span><span><i class="puesto"></i>lo que pones tú.</span></div>
                </div>
                <div class="inv-graf">
                    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Proyección a 25 años: ${financeMoney(filas[4].base)} manteniendo el ritmo, ${financeMoney(filas[4].mas)} con ${INV_EXTRA} € más al mes.">
                        <path class="area" d="${camino('mas')} L${W},${H} L0,${H} Z"/>
                        <path class="puesto" d="${camino('puesto')}"/>
                        <path class="base" d="${camino('base')}"/>
                        <path class="mas" d="${camino('mas')}"/>
                        ${INV_HORIZONTES.map(a => `<line class="marca" x1="${x(a * 12)}" x2="${x(a * 12)}" y1="0" y2="${H}"/>`).join('')}
                    </svg>
                    ${INV_HORIZONTES.map(a => `<span class="inv-graf-anio" style="left:${(x(a * 12) / W * 100).toFixed(1)}%">${a} años</span>`).join('')}
                </div>
                <table class="inv-tabla inv-tabla-proy">
                    <thead><tr><th>dentro de.</th><th>pones tú.</th><th>si mantienes el ritmo.</th><th>con ${INV_EXTRA} € más.</th><th>diferencia.</th></tr></thead>
                    <tbody>${filas.map(f => `<tr><td>${f.a} años</td><td>${financeMoney(f.puesto)}</td><td><b>${financeMoney(f.base)}</b></td><td><b>${financeMoney(f.mas)}</b></td><td class="inv-dif">+${financeMoney(f.mas - f.base)}</td></tr>`).join('')}</tbody>
                </table>`;
        }

        function invFichaHtml(acc) {
            const d = invDatos(acc);
            const hoy = financeMonthKey();
            const mes = invFichaMes || hoy;
            const existe = (acc.contributions || []).find(c => c.month === mes);
            const anterior = [...(acc.contributions || [])].filter(c => c.month < mes).sort((a, b) => b.month.localeCompare(a.month))[0];
            const heredado = !existe && anterior;
            const porMes = invTraspasosPorMes(acc);
            const movMes = porMes[mes];
            const aportacion = movMes ? movMes.suma : existe ? Number(existe.amount) || 0 : anterior ? Number(anterior.amount) || 0 : '';
            const distinto = movMes && existe?.guardado && Math.abs((Number(existe.amount) || 0) - movMes.suma) > 0.005;
            const valor = existe && existe.value !== undefined ? existe.value : anterior && anterior.value !== undefined ? anterior.value : '';
            const estado = existe?.guardado ? `guardado${existe.guardadoEn ? ' el ' + new Date(existe.guardadoEn + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) : ''}.`
                : existe?.desdeCorreo ? 'rellenado con el correo del banco y tus movimientos: revísalo y guárdalo.'
                : existe?.deMovimientos ? 'aportación de tus movimientos: falta el valor de la cuenta.'
                : existe ? 'apuntado.' : heredado ? `sin guardar: trae lo de ${financeMonthLabel(anterior.month).toLowerCase()}.` : 'sin guardar.';
            const meses = [...d.meses].reverse();
            const opcionesMes = [...new Set([hoy, ...meses.map(m => m.c.month)])].sort().reverse();
            return `<div class="inv-ficha">
                <div class="inv-cab">
                    <div class="modal-title">${escapeHtml(acc.name)}.</div>
                    <div class="inv-cab-acciones">
                        <button class="vista-btn" title="Abre Claude con la tarea escrita: revisa los correos del banco y apunta los meses que falten" onclick="abrirTareaClaude('inversion')">revisar con claude.</button>
                        <button class="lt-icon-circle" title="Cerrar" onclick="closeModal()"><i class='ico ico-x' aria-hidden=true></i></button>
                    </div>
                </div>
                <div class="inv-cifras">
                    <div><span>vale hoy.</span><b>${financeMoney(d.valor)}</b></div>
                    <div><span>has aportado.</span><b>${financeMoney(d.aportado)}</b></div>
                    <div><span>ganancia.</span><b class="${d.ganancia < 0 ? 'finance-negative' : ''}">${d.ganancia >= 0 ? '+' : '−'}${financeMoney(Math.abs(d.ganancia))}</b></div>
                    <div><span>acumulada.</span><b>${invPct(d.acumulada)}</b></div>
                    <div><span>media al mes.</span><b>${invPct(d.media, 2)}</b><small>${d.anual === null ? '' : `${invPct(d.anual)} al año`}</small></div>
                </div>

                <section class="inv-bloque inv-mes">
                    <div class="inv-bloque-cab"><h3>el mes.</h3>
                        <select class="inv-mes-sel" onchange="invFichaMes=this.value;invRepintar()" aria-label="Mes">${opcionesMes.map(m => `<option value="${m}" ${m === mes ? 'selected' : ''}>${escapeHtml(financeMonthLabel(m).toLowerCase())}</option>`).join('')}</select>
                    </div>
                    <div class="inv-mes-campos">
                        <label><span>aportación del mes.</span><input id="inv-aportacion" class="modal-input" type="number" min="0" step="0.01" value="${aportacion}" placeholder="0,00" ${movMes ? 'readonly title="Sale de tus movimientos de este mes"' : ''}></label>
                        <label><span>valor de la cuenta.</span><input id="inv-valor" class="modal-input" type="number" min="0" step="0.01" value="${valor}" placeholder="0,00"></label>
                        <button class="btn-modal-primary" onclick="invGuardarMes()">guardar.</button>
                    </div>
                    ${movMes ? `<div class="inv-traspasos"><span>de tus movimientos.</span>${movMes.lista.map(t => `<span>${invFechaCorta(t.date)} ${t.type === 'income' ? '−' : ''}${financeMoney(Math.abs(Number(t.amount) || 0))}</span>`).join('')}${movMes.lista.length > 1 ? `<b>${financeMoney(movMes.suma)} en total.</b>` : ''}</div>` : ''}
                    ${distinto ? `<div class="inv-aviso">Guardaste ${financeMoney(Number(existe.amount) || 0)} de aportación, pero tus movimientos de este mes suman ${financeMoney(movMes.suma)}. <button class="vista-btn" onclick="invUsarMovimientos('${mes}')">usar ${financeMoney(movMes.suma)}.</button></div>` : ''}
                    <div class="inv-estado ${existe?.guardado && !distinto ? 'ok' : ''}">${escapeHtml(estado)}${existe?.correo ? ` Según el correo, la cartera valía ${financeMoney(existe.correo.valor)}${existe.value !== undefined && Number(existe.value) - Number(existe.correo.valor) > 0.5 ? `: ${financeMoney(Number(existe.value) - Number(existe.correo.valor))} esperan a invertirse` : ''}.` : ''}</div>
                </section>

                <section class="inv-bloque">
                    <div class="inv-bloque-cab"><h3>si mantienes el ritmo.</h3></div>
                    <div id="inv-proy">${invProyeccionHtml(d)}</div>
                </section>

                <section class="inv-bloque">
                    <div class="inv-bloque-cab"><h3>histórico.</h3><span class="inv-sub">${meses.length} ${meses.length === 1 ? 'mes' : 'meses'}.</span></div>
                    ${meses.length ? `<div class="inv-tabla-caja"><table class="inv-tabla">
                        <thead><tr><th>mes.</th><th>aportación.</th><th>aportado.</th><th>valor.</th><th>ganancia.</th><th>mes.</th><th>cartera.</th><th></th></tr></thead>
                        <tbody>${meses.map(m => `<tr class="${m.c.month === mes ? 'actual' : ''}" onclick="invFichaMes='${m.c.month}';invRepintar()" title="Editar ${escapeHtml(financeMonthLabel(m.c.month).toLowerCase())}">
                            <td>${escapeHtml(financeMonthLabel(m.c.month).toLowerCase())}</td>
                            <td class="${porMes[m.c.month] && Math.abs(porMes[m.c.month].suma - m.amount) > 0.005 ? 'finance-negative' : ''}" title="${porMes[m.c.month] ? escapeHtml(porMes[m.c.month].lista.map(t => invFechaCorta(t.date) + ' ' + financeMoney(Math.abs(Number(t.amount) || 0))).join(', ')) : ''}">${financeMoney(m.amount)}${porMes[m.c.month] && porMes[m.c.month].lista.length > 1 ? `<small class="inv-veces">${porMes[m.c.month].lista.length} traspasos</small>` : ''}</td>
                            <td>${financeMoney(m.aportado)}</td>
                            <td><b>${m.value === null ? '' : financeMoney(m.value)}</b></td>
                            <td class="${m.ganancia < 0 ? 'finance-negative' : ''}">${m.ganancia === null ? '' : (m.ganancia >= 0 ? '+' : '−') + financeMoney(Math.abs(m.ganancia))}</td>
                            <td>${m.rent === null || m === d.meses[0] ? '' : invPct(m.rent, 2)}</td>
                            <td>${m.c.correo ? financeMoney(m.c.correo.valor) : ''}</td>
                            <td class="inv-origen">${m.c.guardado ? 'guardado.' : m.c.desdeCorreo ? 'del correo.' : m.c.deMovimientos ? 'de movimientos.' : 'a mano.'}</td>
                        </tr>`).join('')}</tbody>
                    </table></div>` : '<div class="finance-empty-line">Todavía no hay meses. Apunta el primero arriba.</div>'}
                </section>
            </div>`;
        }

        function openFichaInversion(id) {
            const acc = invCuenta(id);
            if (!acc) return;
            invFichaCuenta = id;
            invFichaMes = financeMonthKey();
            if (invSincronizarMovimientos()) { syncInvestedTotal(); invalidarCachesDerivadas(); saveData().catch(e => console.error(e)); }
            showModal(invFichaHtml(acc));
            if (typeof modoCapa === 'function') modoCapa('detalle');
        }

        function invRepintar() {
            const acc = invCuenta(invFichaCuenta);
            const caja = document.querySelector('#modal-container .inv-ficha');
            if (!acc || !caja) return;
            caja.outerHTML = invFichaHtml(acc);
        }

        let invTasaTemporizador = null;
        function invCambiarTasa(v) {
            const n = Number(String(v).replace(',', '.'));
            if (!isFinite(n)) return;
            financeProfile.inversionRentabilidad = Math.max(-20, Math.min(30, n));
            const acc = invCuenta(invFichaCuenta), caja = document.getElementById('inv-proy');
            if (acc && caja) caja.innerHTML = invProyeccionHtml(invDatos(acc));
            clearTimeout(invTasaTemporizador);
            invTasaTemporizador = setTimeout(() => saveData().catch(e => console.error(e)), 800);
        }

        async function invGuardarMes() {
            const acc = invCuenta(invFichaCuenta);
            if (!acc) return;
            const mes = invFichaMes || financeMonthKey();
            const movMes = invTraspasosPorMes(acc)[mes];
            const aportacion = movMes ? movMes.suma : Number(document.getElementById('inv-aportacion')?.value);
            const valorTxt = document.getElementById('inv-valor')?.value;
            if (!isFinite(aportacion) || aportacion < 0) { showToast('Pon la aportación del mes', true); return; }
            if (valorTxt === '' || !isFinite(Number(valorTxt))) { showToast('Pon el valor de la cuenta', true); return; }
            acc.contributions = acc.contributions || [];
            const previo = acc.contributions.find(c => c.month === mes);
            const fila = { ...(previo || {}), month: mes, amount: Math.round(aportacion * 100) / 100, value: Math.round(Number(valorTxt) * 100) / 100, guardado: true, guardadoEn: todayISO() };
            delete fila.desdeCorreo;
            if (movMes) fila.deMovimientos = true; else delete fila.deMovimientos;
            acc.contributions = acc.contributions.filter(c => c.month !== mes).concat(fila);
            syncInvestedTotal();
            if (mes === financeMonthKey() && typeof refreshCurrentMonthSnapshot === 'function') refreshCurrentMonthSnapshot();
            invRepintar();
            invalidarCachesDerivadas();
            try { await saveData(); showToast(`${financeMonthLabel(mes)} guardado`); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function invUsarMovimientos(mes) {
            const acc = invCuenta(invFichaCuenta);
            const movMes = acc && invTraspasosPorMes(acc)[mes];
            const c = movMes && (acc.contributions || []).find(x => x.month === mes);
            if (!c) return;
            c.amount = movMes.suma;
            c.deMovimientos = true;
            invSincronizarMovimientos();
            syncInvestedTotal();
            invalidarCachesDerivadas();
            invRepintar();
            try { await saveData(); showToast(`Aportación de ${financeMonthLabel(mes).toLowerCase()}: ${financeMoney(movMes.suma)}`); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // Un botón que pone a Claude a trabajar: abre claude.ai con la tarea ya escrita. Claude usa tus conectores (Gmail y
        // Bitácora), comprueba qué falta y lo hace; tú solo tienes que enviar el mensaje.
        const TAREAS_CLAUDE = {
            inversion: 'Revisa en mi Gmail los correos de MyInvestor con el asunto «Rentabilidad de tu cartera» (de comunicaciones@myinvestor.es). Cada correo es de un mes (el que dice el asunto, no el día en que llega). Para cada uno, saca el valor de la cartera, las aportaciones del mes y del año, las ganancias y la rentabilidad del mes, del año y desde el inicio, y apúntalo con la herramienta «inversion» del conector de Bitácora (cuenta MyInvestor, mes AAAA-MM), del más antiguo al más reciente. La herramienta no toca lo que yo guardé a mano. No escribas en Gmail. Al acabar, dime en una tabla qué meses has apuntado.'
        };
        function abrirTareaClaude(clave) {
            const texto = TAREAS_CLAUDE[clave];
            if (!texto) return;
            window.open('https://claude.ai/new?q=' + encodeURIComponent(texto), '_blank', 'noopener');
        }
