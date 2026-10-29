        // ============================================================
        //  FINANZAS PRO — cargos automáticos (suscripciones, gastos fijos
        //  y gastos programados) y su conciliación con el banco.
        //  Un cargo automático es provisional: cuando llega el movimiento
        //  real (importado del extracto), el real lo sustituye en vez de
        //  sumarse — si no, cada suscripción contaría dos veces.
        // ============================================================
        function financeProNormalizar(s) {
            return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        }

        function financeProEsAuto(t) {
            return !!(t && (t.recurringEntryId || t.programadoId) && !t.conciliado);
        }

        // El concepto del banco rara vez coincide con el nombre que se le
        // dio a la suscripción ("NETFLIX.COM 866-579..." frente a
        // "Netflix"), así que si alguna palabra del nombre aparece en el
        // concepto se admite algo de margen en fecha e importe (cambios de
        // precio, cargos en divisa). Sin coincidencia de nombre se exige
        // misma cuenta e importe exacto, para no emparejar un cargo con
        // cualquier compra que casualmente cueste lo mismo.
        function financeProMismoCargo(auto, real) {
            if (!auto || !real || auto.type !== 'expense' || real.type !== 'expense') return false;
            const dias = Math.abs((new Date(auto.date) - new Date(real.date)) / 86400000);
            const diff = Math.abs(Number(auto.amount) - Number(real.amount));
            const texto = financeProNormalizar(real.note);
            if (financeProCoincideNombre(auto, texto)) return dias <= 6 && diff <= Math.max(1, Number(auto.amount) * 0.1);
            if (dias > 3 || diff >= 0.005) return false;
            return auto.account === real.account || !financeProImporteRedondo(real.amount);
        }

        // Un importe con céntimos (21,78 €) casi nunca coincide por casualidad
        // con el de una suscripción: basta para emparejar un cargo cobrado en
        // otra cuenta que la que tenía la suscripción (Claude, apuntada en
        // Ibercaja y cobrada como "Anthropic" en Revolut, quedaba duplicada).
        // Con uno redondo (5,00 €) se sigue exigiendo la misma cuenta.
        function financeProImporteRedondo(importe) {
            return Math.round(Number(importe) * 100) % 100 === 0;
        }

        // Además del nombre que le puso el usuario, vale el concepto con el
        // que el banco lo cobró la última vez (conceptoBanco): una
        // transferencia al fondo indexado llega como "To Alejandro Pascual",
        // que no comparte ni una palabra con "Fondo indexado".
        function financeProCoincideNombre(auto, texto) {
            const e = auto.recurringEntryId && entries.find(x => x.id === auto.recurringEntryId);
            if (e?.conceptoBanco && texto.includes(e.conceptoBanco)) return true;
            return financeProNormalizar(auto.note).split(/[^a-z0-9]+/).some(w => w.length >= 3 && texto.includes(w));
        }

        // El mes de presupuesto al que pertenece un cargo recurrente no es
        // el de la fecha de compra: Revolut fecha el cobro de octubre de una
        // suscripción el 30 de septiembre (started date), y sin cicloMes
        // contaba como pagada en septiembre y en octubre seguía a cero.
        function financeProCicloMes(t) {
            return t.cicloMes || String(t.date || '').slice(0, 7);
        }

        function financeProAprenderConcepto(entryId, concepto) {
            const e = entries.find(x => x.id === entryId);
            const c = financeProNormalizar(concepto).trim();
            if (e && c.length >= 3) e.conceptoBanco = c;
        }

        // Movimiento del extracto que corresponde a una suscripción o gasto
        // fijo aunque no exista (todavía) su cargo automático: gastos fijos
        // sin cuenta PRO, o un banco que cobra un par de días antes del día
        // de cargo. Por concepto aprendido o nombre, con margen; si no, solo
        // importe exacto a ±3 días. Un ciclo que ya tiene su movimiento real
        // no admite otro.
        function financeProBuscarRecurrente(real) {
            const texto = financeProNormalizar(real.note);
            let mejor = null, mejorDias = Infinity;
            entries.forEach(e => {
                if (!(e.type === 'subscription' || e.type === 'fixed_expense') || e.active === false) return;
                const importe = Number(e.amount) || 0;
                const diff = Math.abs(importe - Number(real.amount));
                const nombre = financeProCoincideNombre({ recurringEntryId: e.id, note: e.title }, texto);
                const cuenta = financeProCuentaRecurrente(e);
                if (!nombre && (diff >= 0.005 || (cuenta && cuenta !== real.account && financeProImporteRedondo(importe)))) return;
                if (nombre && diff > Math.max(1, importe * 0.1)) return;
                const base = new Date(real.date + 'T12:00:00');
                [-1, 0, 1].forEach(delta => {
                    const ref = new Date(base.getFullYear(), base.getMonth() + delta, 1);
                    const ciclo = financeMonthKey(ref);
                    const dia = Math.min(Number(e.renewalDay) || 1, new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate());
                    const dias = Math.abs((new Date(ref.getFullYear(), ref.getMonth(), dia, 12) - base) / 86400000);
                    if (dias > (nombre ? 6 : 3) || dias >= mejorDias) return;
                    if (financePro.transactions.some(t => t.recurringEntryId === e.id && financeProCicloMes(t) === ciclo && !financeProEsAuto(t))) return;
                    mejor = { entry: e, ciclo }; mejorDias = dias;
                });
            });
            return mejor;
        }

        // Categorías aprendidas de las que el usuario ya puso (nunca de las
        // puestas solas, categoriaAuto: un error se reforzaría a sí mismo).
        // Solo se asigna si al menos el 90 % de los movimientos parecidos
        // llevan la misma: primero mismo concepto (mín. 2), luego mismo
        // concepto e importe (Estanco 6,20 € frente a Estanco 3 € de
        // sellos), y por último una palabra del concepto ("cafeteria"),
        // con más ejemplos (mín. 3) y sin que otra palabra lo contradiga.
        // Un cargo de suscripción o gasto fijo hereda la del mes anterior.
        const CATEGORIA_AUTO_CONFIANZA = 0.9;
        const CATEGORIA_PALABRAS_VACIAS = new Set(['payment', 'pago', 'compra', 'card', 'tarjeta', 'transfer', 'transferencia', 'from', 'bizum', 'recibo', 'cargo', 'online', 'store', 'shop', 'tienda', 'para', 'with']);

        function financeProClaveConcepto(t) {
            return financeProNormalizar(t.bankNote ?? t.note).replace(/[^a-z]+/g, ' ').trim();
        }

        function financeProIndiceCategorias() {
            return financePro.transactions
                .filter(t => t.category && !t.categoriaAuto && (t.type === 'expense' || t.type === 'income') && financeProCategoryById(t.category))
                .map(t => { const clave = financeProClaveConcepto(t); return { t, clave, palabras: new Set(clave.split(' ')) }; });
        }

        function financeProCategoriaAprendida(tx, indice) {
            if (tx.type !== 'expense' && tx.type !== 'income') return null;
            const base = (indice || financeProIndiceCategorias()).filter(x => x.t !== tx && x.t.type === tx.type);
            if (tx.recurringEntryId) {
                const previo = base.filter(x => x.t.recurringEntryId === tx.recurringEntryId).sort((a, b) => b.t.date.localeCompare(a.t.date))[0];
                if (previo) return previo.t.category;
            }
            const clave = financeProClaveConcepto(tx);
            if (!clave) return null;
            const decidir = (grupo, minimo) => {
                if (grupo.length < minimo) return null;
                const cuenta = {};
                grupo.forEach(x => { cuenta[x.t.category] = (cuenta[x.t.category] || 0) + 1; });
                const [cat, n] = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
                return n / grupo.length >= CATEGORIA_AUTO_CONFIANZA ? cat : null;
            };
            const mismoImporte = grupo => grupo.filter(x => Math.abs(Number(x.t.amount) - Number(tx.amount)) < 0.005);
            const mismoConcepto = base.filter(x => x.clave === clave);
            const directa = decidir(mismoConcepto, 2) || decidir(mismoImporte(mismoConcepto), 2);
            if (directa) return directa;
            const porPalabra = new Set();
            let contradice = false;
            clave.split(' ').filter(w => w.length >= 4 && !CATEGORIA_PALABRAS_VACIAS.has(w)).forEach(w => {
                const grupo = base.filter(x => x.palabras.has(w));
                if (!grupo.length) return;
                const cat = decidir(grupo, 3) || decidir(mismoImporte(grupo), 3);
                if (cat) porPalabra.add(cat); else if (grupo.length >= 3) contradice = true;
            });
            return porPalabra.size === 1 && !contradice ? [...porPalabra][0] : null;
        }

        function financeProAutoCategorizar() {
            const indice = financeProIndiceCategorias();
            let n = 0;
            financePro.transactions.forEach(t => {
                if (t.category || t.needsReview || t.type === 'transfer') return;
                const cat = financeProCategoriaAprendida(t, indice);
                if (cat) { t.category = cat; t.categoriaAuto = true; n++; }
            });
            return n;
        }

        // Si el movimiento real ya está (se importó el extracto antes de
        // que la app generara el cargo), se marca como conciliado y no se
        // crea el automático.
        function financeProRegistrarAuto(tx) {
            const ciclo = tx.date.slice(0, 7);
            if (tx.recurringEntryId && financePro.transactions.some(t => t.recurringEntryId === tx.recurringEntryId && financeProCicloMes(t) === ciclo)) return;
            const real = financePro.transactions.find(t => !financeProEsAuto(t) && !t.conciliado && financeProMismoCargo(tx, t));
            if (real) {
                // Un gasto manual sigue siendo provisional hasta que llegue
                // el extracto: solo evita que se cree el automático.
                if (!real.manual) real.conciliado = true;
                if (tx.recurringEntryId) {
                    real.recurringEntryId = tx.recurringEntryId;
                    real.cicloMes = ciclo;
                    if (!real.manual) financeProAprenderConcepto(tx.recurringEntryId, real.bankNote ?? real.note);
                }
                if (!real.category && tx.category) real.category = tx.category;
                return;
            }
            if (!tx.category) {
                const cat = financeProCategoriaAprendida(tx);
                if (cat) { tx.category = cat; tx.categoriaAuto = true; }
            }
            financePro.transactions.push(tx);
        }

        // Un apunte a mano en otra cuenta (Apuntar usa la última que se usó)
        // también vale si el importe lleva céntimos: 8,42 € no coincide por
        // casualidad. Con uno redondo se sigue exigiendo la misma cuenta.
        function financeProBuscarManual(real) {
            let mejor = null, mejorDias = Infinity;
            financePro.transactions.forEach(t => {
                if (!t.manual || t.conciliado || t.type !== real.type) return;
                if (t.account !== real.account && financeProImporteRedondo(real.amount)) return;
                if (Math.abs(Number(t.amount) - Number(real.amount)) >= 0.005) return;
                const dias = Math.abs((new Date(t.date) - new Date(real.date)) / 86400000);
                if (dias <= 3 && dias < mejorDias) { mejor = t; mejorDias = dias; }
            });
            return mejor;
        }

        // Transferencias entre cuentas propias (el sueldo llega a una cuenta y
        // de ahí se reparte): la salida de una y la entrada en otra, mismo
        // importe exacto, como mucho 2 días de diferencia y los dos conceptos
        // con pinta de transferencia (un Bizum a un amigo no), son un traspaso y no un gasto y
        // un ingreso. Se guarda uno solo; el concepto del otro lado queda en
        // claveImport para que reimportar su extracto lo siga reconociendo.
        const TRASPASO_CONCEPTO = /transf|traspas|top.?up|\b(?:to|from|de|a)\s+(?:eur|cuenta|ahorro)|\bto [a-z]|\bfrom [a-z]|enviad|recibid|emitid|ordenante|beneficiari|reintegro|ingreso en cuenta|cuenta propia/i;
        function financeProEmparejarTraspasos(fechas) {
            if (!fechas?.length) return 0;
            const desde = fechas.reduce((a, b) => a < b ? a : b), hasta = fechas.reduce((a, b) => a > b ? a : b);
            const enRango = t => t.date >= financeProSumarDias(desde, -2) && t.date <= financeProSumarDias(hasta, 2);
            const libre = t => !financeProNeutro(t) && !t.recurringEntryId && !t.programadoId && !t.pendiente && enRango(t);
            const salidas = financePro.transactions.filter(t => t.type === 'expense' && libre(t));
            const entradas = financePro.transactions.filter(t => t.type === 'income' && libre(t));
            const usadas = new Set();
            let n = 0;
            salidas.forEach(sal => {
                const nota = sal.bankNote ?? sal.note ?? '';
                let mejor = null, mejorDias = Infinity;
                entradas.forEach(ent => {
                    if (usadas.has(ent) || ent.account === sal.account || Math.abs(Number(ent.amount) - Number(sal.amount)) >= 0.005) return;
                    const otra = ent.bankNote ?? ent.note ?? '';
                    if (!TRASPASO_CONCEPTO.test(nota) || !TRASPASO_CONCEPTO.test(otra) || /bizum/i.test(nota + ' ' + otra)) return;
                    const dias = Math.abs((new Date(ent.date) - new Date(sal.date)) / 86400000);
                    if (dias <= 2 && dias < mejorDias) { mejor = ent; mejorDias = dias; }
                });
                if (!mejor) return;
                usadas.add(mejor);
                const otraNota = mejor.bankNote ?? mejor.note ?? '';
                Object.assign(sal, { type: 'transfer', transferTo: mejor.account, category: undefined, needsReview: false, categoriaAuto: undefined });
                if (!sal.claveImport) sal.claveImport = `${mejor.account}|${mejor.date}|${mejor.amount}|${otraNota}`;
                financePro.transactions = financePro.transactions.filter(t => t !== mejor);
                n++;
            });
            return n;
        }

        function financeProSumarDias(iso, k) {
            const d = new Date(iso + 'T12:00:00');
            d.setDate(d.getDate() + k);
            return isoLocal(d);
        }

        // Si se apunta un gasto a mano cuando el extracto ya lo había traído
        // (pendiente o no), al importar no había ninguna fila nueva con la
        // que emparejarlo y quedaban los dos (los peajes de AUCAT). Tras cada
        // importación, en las fechas del extracto, cada apunte a mano suelto
        // se funde con su gemelo del banco (mismo tipo, importe exacto, ±3
        // días, el más cercano): se quedan la nota y la categoría del usuario
        // y la fecha, la cuenta y el concepto del banco.
        function financeProFusionarManuales(cuenta, fechas) {
            if (!fechas.length) return 0;
            const desde = fechas.reduce((a, b) => a < b ? a : b), hasta = fechas.reduce((a, b) => a > b ? a : b);
            const dias = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
            let fusionados = 0;
            const banco = financePro.transactions.filter(t => !t.manual && t.account === cuenta && t.type !== 'transfer' && !t.recurringEntryId && !t.programadoId && t.date >= desde && t.date <= hasta);
            banco.forEach(b => {
                let mejor = null, mejorDias = Infinity;
                financePro.transactions.forEach(t => {
                    if (!t.manual || t.conciliado || t.type !== b.type || Math.abs(Number(t.amount) - Number(b.amount)) >= 0.005) return;
                    if (t.account !== cuenta && financeProImporteRedondo(b.amount)) return;
                    const d = dias(t.date, b.date);
                    if (d <= 3 && d < mejorDias) { mejor = t; mejorDias = d; }
                });
                if (!mejor) return;
                Object.assign(mejor, { date: b.date, account: cuenta, bankNote: b.bankNote ?? b.note, conciliado: true, pendiente: b.pendiente || undefined, hora: b.hora ?? mejor.hora, orden: b.orden ?? mejor.orden });
                if (!mejor.category && b.category) mejor.category = b.category;
                if (mejor.category) mejor.needsReview = false;
                financePro.transactions = financePro.transactions.filter(t => t !== b);
                fusionados++;
            });
            return fusionados;
        }

        // Mismo concepto del banco y misma cuenta son la señal fuerte; el
        // importe admite margen porque el cargo final puede no coincidir con
        // el retenido (divisa, propina, reserva de hotel). Si además coincide
        // la fecha de inicio exacta — la que se guardó al importarlo
        // pendiente — es casi seguro la misma operación y el margen se
        // amplía: una fianza de hotel de 120 € puede acabar en 98 €.
        // Un pendiente que ya ha emparejado otra fila del mismo extracto no
        // vale para una segunda (`usados`), y el importe exacto va antes que
        // el aproximado: dos peajes de Autopistas pendientes el mismo día
        // (8,42 € y 5,03 €) caían dentro del margen y el segundo pisaba al
        // primero, que desaparecía.
        function financeProBuscarPendiente(f, usados) {
            const texto = financeProNormalizar(f.note);
            const fechas = [f.date, ...(f.altDates || [])];
            let mejor = null, mejorNota = Infinity;
            financePro.transactions.forEach(t => {
                if (!t.pendiente || t.account !== f.account || t.type !== f.type || usados?.has(t)) return;
                if (financeProNormalizar(t.bankNote ?? t.note) !== texto) return;
                const dias = Math.min(...fechas.map(d => Math.abs((new Date(t.date) - new Date(d)) / 86400000)));
                const diff = Math.abs(Number(t.amount) - Number(f.amount));
                const margen = dias === 0 ? 0.5 : 0.15;
                if (dias > 3 || diff > Math.max(1, Number(t.amount) * margen)) return;
                const nota = (diff < 0.005 ? 0 : 100) + dias;
                if (nota < mejorNota) { mejor = t; mejorNota = nota; }
            });
            return mejor;
        }

        function financeProCuentaRecurrente(e) {
            if (e.proAccount && FINANCE_PRO_ACCOUNT_KEYS.includes(e.proAccount)) return e.proAccount;
            return e.type === 'subscription' ? 'bancos' : null;
        }

        function financeProAplicarProgramados() {
            const hoy = todayISO();
            let cambios = false;
            financePro.programados = (financePro.programados || []).filter(p => {
                if (p.date > hoy) return true;
                financeProRegistrarAuto({
                    id: 'ptx_prog_' + p.id, date: p.date, account: p.account, type: 'expense',
                    amount: Number(p.amount) || 0, category: p.category || undefined, note: p.note || undefined, programadoId: p.id
                });
                cambios = true;
                return false;
            });
            return cambios;
        }

        // Cada suscripción (y cada gasto fijo con cuenta PRO) se registra
        // sola como movimiento el día de cargo de cada mes, una vez por mes
        // (_proLastCharged). Las suscripciones sin cuenta elegida van a
        // Bancos: casi siempre se cobran con tarjeta. Queda sin categoría,
        // igual que un movimiento importado, para no adivinar mal. También
        // se recupera el mes anterior si la app no se abrió entre el día de
        // cargo y fin de mes — solo para gastos que ya se cargaban solos,
        // para no rellenar de golpe meses que nunca se registraron.
        function ensureRecurringProCharges() {
            if (!Array.isArray(financePro.programados)) financePro.programados = [];
            const today = new Date();
            const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            let changed = financeProAplicarProgramados();
            entries.forEach(e => {
                if (!(e.type === 'subscription' || e.type === 'fixed_expense')) return;
                if (e.active === false) return;
                const account = financeProCuentaRecurrente(e);
                if (!account) return;
                const meses = [];
                if (e._proLastCharged && e._proLastCharged < financeMonthKey(prev)) meses.push(prev);
                meses.push(today);
                meses.forEach(ref => {
                    const monthKey = financeMonthKey(ref);
                    if (e._proLastCharged && e._proLastCharged >= monthKey) return;
                    const daysInMonth = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
                    const chargeDay = Math.min(Number(e.renewalDay) || 1, daysInMonth);
                    if (ref === today && today.getDate() < chargeDay) return;
                    financeProRegistrarAuto({
                        id: 'ptx_rec_' + e.id + '_' + monthKey,
                        date: monthKey + '-' + String(chargeDay).padStart(2, '0'),
                        account,
                        type: 'expense',
                        amount: Number(e.amount) || 0,
                        note: e.title || (e.type === 'subscription' ? 'Suscripción' : 'Gasto fijo'),
                        recurringEntryId: e.id
                    });
                    e._proLastCharged = monthKey;
                    changed = true;
                });
            });
            if (changed) saveData().catch(err => console.error(err));
        }

        // Un ingreso pendiente (un reembolso que Revolut todavía no ha
        // abonado) no está en el saldo del banco; un cargo pendiente sí, el
        // banco ya lo retiene.
        function financeProCuentaEnSaldo(t) {
            return !(t.pendiente && t.type === 'income');
        }

        // Un ajuste de saldo (modificar saldo, o cuadrar con el extracto) corrige la cuenta, pero no es un ingreso ni
        // un gasto, igual que lo que va o viene de los ahorros: los dos mueven el saldo y se quedan fuera de entra/sale,
        // presupuestos, ritmo y estadísticas. Antes se distinguía por una categoría «Ajuste de saldo» creada a mano
        // (una de gasto y otra de ingreso) y solo el ritmo la apartaba.
        function financeProEsAjuste(t) {
            return !!(t && (t.ajuste || String(t.id || '').startsWith('ptx_adj_')));
        }

        // Lo que va a la inversión (la categoría «Inversiones», de gasto o de ingreso) es dinero tuyo que cambia de
        // sitio: tampoco es gasto ni ingreso. En su propia categoría sí cuenta (financeProFueraDeCategoria): así la
        // casilla del fondo en largo plazo sigue sabiendo cuánto se aportó.
        function financeProEsInversion(t) {
            if (!t || (t.type !== 'expense' && t.type !== 'income')) return false;
            if (t.category === 'cat_inversion_gasto' || t.category === 'cat_inversion_ing') return true;
            return financeProNormalizar(financeProCategoryById(t.category)?.name).trim() === 'inversiones';
        }

        function financeProNeutro(t) {
            return !!(t && (t.ahorro || financeProEsAjuste(t) || financeProEsInversion(t)));
        }

        function financeProFueraDeCategoria(t) {
            return !!(t && (t.ahorro || financeProEsAjuste(t)));
        }

        function financeProUnificarAjustes() {
            const ids = new Set((financePro.categories || []).filter(c => financeProNormalizar(c.name).trim() === 'ajuste de saldo').map(c => c.id));
            let cambio = false;
            financePro.transactions.forEach(t => {
                if (t.type === 'transfer') return;
                if ((ids.has(t.category) || String(t.id || '').startsWith('ptx_adj_')) && !t.ajuste && !t.ahorro) { t.ajuste = true; cambio = true; }
                if (ids.has(t.category)) { delete t.category; delete t.categoriaAuto; cambio = true; }
            });
            if (ids.size) {
                financePro.categories = financePro.categories.filter(c => !ids.has(c.id));
                Object.keys(financePro.categoryBudgets || {}).forEach(k => { if (ids.has(k)) delete financePro.categoryBudgets[k]; });
                cambio = true;
            }
            return cambio;
        }

        // Finanzas pedía el saldo de cada cuenta (y la serie mensual) muchas
        // veces por pintado, y cada vez recorría todos los movimientos: con
        // unos miles, se notaba al entrar. Ahora se calcula una vez y se
        // guarda hasta el siguiente pintado o cambio de datos (render() e
        // invalidarCachesDerivadas() la vacían; además caduca sola).
        let financeSaldosCache = null;
        function financeSaldosVigente(c) {
            return c && c.txs === financePro.transactions && c.n === financePro.transactions.length && Date.now() - c.cuando < 1500
                && c.base === JSON.stringify(Object.values(financePro.accounts || {}).map(a => a?.balance0 || 0));
        }

        function financeProSaldos() {
            if (financeSaldosVigente(financeSaldosCache)) return financeSaldosCache.saldos;
            const saldos = {};
            new Set([...FINANCE_PRO_ACCOUNT_KEYS, ...Object.keys(financePro.accounts || {})]).forEach(k => { saldos[k] = Number(financePro.accounts[k]?.balance0 || 0); });
            financePro.transactions.forEach(t => {
                if (!financeProCuentaEnSaldo(t)) return;
                const importe = Number(t.amount) || 0;
                if (t.type === 'transfer') {
                    if (t.account in saldos) saldos[t.account] -= importe;
                    if (t.transferTo in saldos) saldos[t.transferTo] += importe;
                } else if (t.account in saldos) {
                    saldos[t.account] += (t.type === 'income' ? 1 : -1) * importe;
                }
            });
            financeSaldosCache = { txs: financePro.transactions, n: financePro.transactions.length, cuando: Date.now(), base: JSON.stringify(Object.values(financePro.accounts || {}).map(a => a?.balance0 || 0)), saldos, mensual: {} };
            return saldos;
        }

        function financeProAccountBalance(key) {
            const saldos = financeProSaldos();
            return key in saldos ? saldos[key] : 0;
        }

        function financeProTotalBalance() {
            return FINANCE_PRO_ACCOUNT_KEYS.reduce((s, k) => s + financeProAccountBalance(k), 0);
        }

        function financeProCategoryById(id) {
            return financePro.categories.find(c => c.id === id) || null;
        }

        function financeProCategoryColor(cat) {
            return (cat && cat.color) || '#78716c';
        }

        // Insignia de icono con el color propio de la categoría (en vez del
        // color fijo de ingreso/gasto), calculado inline porque el color
        // es arbitrario — no encaja en el set de clases .fin-*.
        function financeProCategoryBadge(cat, extraClass) {
            const color = financeProCategoryColor(cat);
            const icon = financeProCategoryIconSvg(cat ? cat.icon : 'other');
            return `<div class="finance-metric-icon finance-pro-tx-icon ${extraClass || ''}" style="background:${color}22;color:${color}">${icon}</div>`;
        }

        // ============================================================
        //  FINANZAS PRO — gráficas (saldo acumulado mes a mes)
        // ============================================================
        function financeProMonthlyBalances(key, rangeMonths) {
            financeProSaldos();
            const clave = `${key || ''}|${rangeMonths || ''}`;
            const memo = financeSaldosCache.mensual;
            if (!(clave in memo)) memo[clave] = financeProMonthlyBalancesCalc(key, rangeMonths);
            return memo[clave];
        }

        function financeProMonthlyBalancesCalc(key, rangeMonths) {
            const txs = financePro.transactions;
            if (!txs.length) return [];
            if (!financeSaldosCache.ordenados) financeSaldosCache.ordenados = [...txs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
            const sorted = financeSaldosCache.ordenados;
            const startMonth = sorted[0].date.slice(0, 7);
            // Normalmente el último mes es "ahora", pero si hay algún
            // movimiento fechado más adelante, el rango tiene que llegar
            // hasta ahí — si no, el último punto de la gráfica no incluiría
            // ese movimiento aunque sí cuente en el saldo total mostrado
            // arriba, y los dos números dejarían de cuadrar entre sí.
            const lastTxMonth = sorted[sorted.length - 1].date.slice(0, 7);
            const todayMonth = financeMonthKey();
            const endMonth = lastTxMonth > todayMonth ? lastTxMonth : todayMonth;
            const keys = key ? [key] : FINANCE_PRO_ACCOUNT_KEYS;
            const months = [];
            let cursor = new Date(Number(startMonth.slice(0, 4)), Number(startMonth.slice(5, 7)) - 1, 1);
            const end = new Date(Number(endMonth.slice(0, 4)), Number(endMonth.slice(5, 7)) - 1, 1);
            while (cursor <= end) { months.push(financeMonthKey(cursor)); cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); }
            // Una sola pasada sobre los movimientos ya ordenados, acumulando
            // mes a mes: antes cada mes volvía a recorrer todos los movimientos
            // desde cero, y la vista de Finanzas llama a esto varias veces por
            // pintado (gráfica principal, una por cuenta, comparativas).
            let bal = keys.reduce((s, k) => s + Number(financePro.accounts[k]?.balance0 || 0), 0);
            let idx = 0;
            const results = months.map(m => {
                const cutoff = m + '-31';
                for (; idx < sorted.length && sorted[idx].date <= cutoff; idx++) {
                    const t = sorted[idx];
                    if (!financeProCuentaEnSaldo(t)) continue;
                    if (t.type === 'transfer') {
                        if (keys.includes(t.account) && !keys.includes(t.transferTo)) bal -= Number(t.amount) || 0;
                        if (keys.includes(t.transferTo) && !keys.includes(t.account)) bal += Number(t.amount) || 0;
                    } else if (keys.includes(t.account)) {
                        bal += (t.type === 'income' ? 1 : -1) * (Number(t.amount) || 0);
                    }
                }
                return { month: m, balance: bal };
            });
            // El saldo de cada mes ya se calcula desde cero hasta ese mes, así
            // que recortar los primeros puntos para un rango más corto (3M,
            // 6M, 1A) no requiere volver a calcular nada — el primer punto que
            // quede ya lleva arrastrado todo lo anterior.
            return (rangeMonths && results.length > rangeMonths) ? results.slice(-rangeMonths) : results;
        }

        // Curva suave (Catmull-Rom → Bézier cúbica, tensión 1/6) en vez de
        // segmentos rectos entre puntos — mismo aspecto que las gráficas de
        // apps de finanzas tipo Stoic, sin depender de ninguna librería.
        function financeSmoothPath(pts) {
            if (pts.length < 2) return '';
            if (pts.length === 2) return `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)} L${pts[1][0].toFixed(1)},${pts[1][1].toFixed(1)}`;
            let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
            for (let i = 0; i < pts.length - 1; i++) {
                const p0 = pts[i === 0 ? i : i - 1];
                const p1 = pts[i];
                const p2 = pts[i + 1];
                const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];
                const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
                const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
                d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
            }
            return d;
        }

        // Líneas guía horizontales de fondo con su valor a la izquierda —
        // igual que el eje Y discreto de Stoic, en vez de solo la línea de
        // referencia en 0€.
        function financeChartGridLines(minVal, maxVal, padX, padT, innerW, innerH, W, count) {
            const lines = [];
            for (let i = 0; i <= count; i++) {
                const v = minVal + (maxVal - minVal) * (i / count);
                const yPos = padT + innerH - ((v - minVal) / (maxVal - minVal || 1)) * innerH;
                lines.push(`<line x1="${padX}" y1="${yPos.toFixed(1)}" x2="${W - padX}" y2="${yPos.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>`);
                lines.push(`<text x="2" y="${(yPos - 3).toFixed(1)}" font-size="8" fill="var(--text-muted)">${financeMoney(v).replace(',00', '')}</text>`);
            }
            return lines.join('');
        }

        function renderFinanceProLineChart(dataPoints, color, idSuffix, compact) {
            if (dataPoints.length < 2) {
                return `<div class="finance-empty-state" style="padding:${compact ? '10px 0' : '30px 0'}">Sin histórico suficiente todavía: necesitas movimientos en al menos 2 meses distintos.</div>`;
            }
            const W = compact ? 320 : 900, H = compact ? 90 : 200, padX = compact ? 8 : 28, padT = 8, padB = compact ? 16 : 22;
            const innerW = W - padX * 2, innerH = H - padT - padB;
            const values = dataPoints.map(d => d.balance);
            const minVal = Math.min(0, ...values);
            const maxVal = Math.max(1, ...values) * 1.08;
            const range = (maxVal - minVal) || 1;
            const x = i => dataPoints.length === 1 ? padX + innerW / 2 : padX + innerW * i / (dataPoints.length - 1);
            const y = v => padT + innerH - ((v - minVal) / range) * innerH;
            const pts = dataPoints.map((d, i) => [x(i), y(d.balance)]);
            const path = financeSmoothPath(pts);
            const area = `${path} L${x(dataPoints.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${x(0).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
            const step = Math.max(1, Math.ceil(dataPoints.length / (compact ? 3 : 6)));
            const gradId = 'fpGrad_' + idSuffix;
            const labels = compact ? '' : dataPoints.map((d, i) => (i % step === 0 || i === dataPoints.length - 1)
                ? `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="var(--text-muted)">${escapeHtml(financeMonthLabel(d.month).split(' de ')[0])}</text>` : '').join('');
            const gridLines = compact ? '' : financeChartGridLines(minVal, maxVal, padX, padT, innerW, innerH, W, 3);
            // Puntos: uno visible pequeño + uno invisible más grande encima
            // para ampliar el área donde el hover muestra el valor exacto,
            // sin que el punto dibujado se vea desproporcionado.
            const points = compact ? '' : dataPoints.map((d, i) => {
                const tip = escapeHtml(`${financeMonthLabel(d.month)}: ${financeMoney(d.balance)}`).replace(/"/g, '&quot;');
                return `<circle cx="${x(i).toFixed(1)}" cy="${y(d.balance).toFixed(1)}" r="10" fill="transparent" onmousemove="financeProChartTooltipShow(event,'${idSuffix}-${i}',&quot;${tip}&quot;)" onmouseleave="financeProChartTooltipHide('${idSuffix}-${i}')" onclick="financeProChartTooltipShow(event,'${idSuffix}-${i}',&quot;${tip}&quot;)"/>
                <circle cx="${x(i).toFixed(1)}" cy="${y(d.balance).toFixed(1)}" r="3.5" fill="${color}" style="pointer-events:none"/>`;
            }).join('');
            return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:${compact ? 140 : 280}px;display:block">
                <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:${color};stop-opacity:0.25"/>
                    <stop offset="100%" style="stop-color:${color};stop-opacity:0"/>
                </linearGradient></defs>
                ${gridLines}
                <path d="${area}" fill="url(#${gradId})" stroke="none"/>
                <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                ${points}
                ${labels}
            </svg>`;
        }

        // ============================================================
        //  MICRO-ANIMACIONES: cifra que cuenta hacia arriba + gráfica de
        //  líneas que se dibuja al aparecer, inspirado en el vídeo de
        //  referencia de Pinterest (Lift, app de gimnasio). Genéricas a
        //  propósito para poder reutilizarlas en cualquier cifra/gráfica.
        // ============================================================
        function bitacoraAnimateNumber(el, endValue, formatFn, duration) {
            if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                if (el) el.textContent = formatFn(endValue);
                return;
            }
            duration = duration || 700;
            const startTime = performance.now();
            const ease = t => 1 - Math.pow(1 - t, 3); // easeOutCubic
            function tick(now) {
                const t = Math.min(1, (now - startTime) / duration);
                el.textContent = formatFn(endValue * ease(t));
                if (t < 1) requestAnimationFrame(tick);
                else el.textContent = formatFn(endValue);
            }
            requestAnimationFrame(tick);
        }

        // Dibuja cada <path> con stroke (líneas, nunca el área de relleno)
        // desde cero mediante el truco de stroke-dasharray/-dashoffset, con
        // un pequeño desfase por serie, y desvanece los puntos y el área
        // detrás. `container` es cualquier elemento que contenga el <svg>.
        function bitacoraAnimateChart(container) {
            if (!container) return;
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            const lines = container.querySelectorAll('svg path[stroke]:not([stroke="none"])');
            lines.forEach((path, i) => {
                const len = path.getTotalLength();
                path.style.transition = 'none';
                path.style.strokeDasharray = len;
                path.style.strokeDashoffset = len;
                path.getBoundingClientRect(); // fuerza reflow: fija el estado inicial antes de animar
                path.style.transition = `stroke-dashoffset .9s cubic-bezier(.16,1,.3,1) ${i * 0.12}s`;
                requestAnimationFrame(() => { path.style.strokeDashoffset = '0'; });
            });
            container.querySelectorAll('svg path[fill^="url("]').forEach(area => {
                area.style.opacity = '0';
                area.style.transition = 'opacity .6s ease .2s';
                requestAnimationFrame(() => { area.style.opacity = '1'; });
            });
            container.querySelectorAll('svg circle[fill]:not([fill="transparent"])').forEach((c, i) => {
                c.style.opacity = '0';
                c.style.transition = `opacity .35s ease ${0.5 + i * 0.015}s`;
                requestAnimationFrame(() => { c.style.opacity = '1'; });
            });
        }

        // Tooltip flotante compartido por todas las gráficas PRO — un único
        // div reutilizado (no uno por punto) para no ensuciar el DOM.
        function financeProChartTooltipShow(evt, pointId, text) {
            let tip = document.getElementById('finance-pro-chart-tooltip');
            if (!tip) {
                tip = document.createElement('div');
                tip.id = 'finance-pro-chart-tooltip';
                tip.className = 'finance-pro-chart-tooltip';
                document.body.appendChild(tip);
            }
            tip.dataset.point = pointId;
            tip.textContent = text;
            tip.style.display = 'block';
            const x = evt.clientX, y = evt.clientY;
            tip.style.left = Math.min(x + 14, window.innerWidth - tip.offsetWidth - 10) + 'px';
            tip.style.top = Math.max(y - 34, 6) + 'px';
        }
        function financeProChartTooltipHide(pointId) {
            const tip = document.getElementById('finance-pro-chart-tooltip');
            if (tip && (!pointId || tip.dataset.point === pointId)) tip.style.display = 'none';
        }

        // ============================================================
        //  FINANZAS PRO — la gráfica de patrimonio
        //  Saldo día a día (no un punto por mes: así se ven el sueldo, el alquiler o un viaje), relleno rayado, los
        //  movimientos sueltos que más la movieron rotulados encima, el balance de cada mes debajo y, aparte, qué día
        //  de la semana se gasta más. El SVG se dibuja al ancho real del hueco (financeDibujarGrafica, después de
        //  pintar): con un viewBox fijo el texto se encogía hasta no leerse en el móvil.
        // ============================================================
        let financeProChartRange = '6m';
        let financeGrafExtras = (() => { try { return localStorage.getItem('bitacora-fin-extras') === '1'; } catch (e) { return false; } })();
        const FINANCE_PRO_CHART_RANGES = [
            { key: '1m', label: '1 mes.', corto: 'mes.', months: 1 },
            { key: '3m', label: '3 meses.', corto: '3 m.', months: 3 },
            { key: '6m', label: '6 meses.', corto: '6 m.', months: 6 },
            { key: '1y', label: '1 año.', corto: 'año.', months: 12 },
            { key: 'all', label: 'todo.', corto: 'todo.', months: null }
        ];

        function financeProSetChartRange(key) {
            financeProChartRange = key;
            repintarGraficaFinanzas();
        }

        function alternarExtrasGrafica() {
            financeGrafExtras = !financeGrafExtras;
            try { localStorage.setItem('bitacora-fin-extras', financeGrafExtras ? '1' : '0'); } catch (e) {}
            repintarGraficaFinanzas();
        }

        function repintarGraficaFinanzas() {
            document.querySelectorAll('.fin-grafica').forEach(el => { el.outerHTML = renderFinanzasGrafica(el.classList.contains('movil')); });
            requestAnimationFrame(animateFinanceProChartPanel);
        }

        function animateFinanceProChartPanel() {
            financeDibujarGrafica();
            document.querySelectorAll('.fin-graf-cifra').forEach(el => { if (el.offsetWidth) bitacoraAnimateNumber(el, Number(el.dataset.value || 0), financeMoney); });
            document.querySelectorAll('.fin-graf').forEach(el => { if (el.offsetWidth) bitacoraAnimateChart(el); });
        }

        // Lo que dicen las cuentas sin las transferencias entre ellas, con el resto del patrimonio (inversión y
        // emergencia, que se apuntan a mano una vez al mes) sumado si se pide.
        function financeSerieDiaria(meses, conExtras) {
            const txs = financePro.transactions;
            if (!txs.length) return [];
            financeProSaldos();
            if (!financeSaldosCache.ordenados) financeSaldosCache.ordenados = [...txs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
            const memo = financeSaldosCache.diaria || (financeSaldosCache.diaria = {});
            const clave = `${meses || ''}|${conExtras ? 1 : 0}`;
            if (memo[clave]) return memo[clave];
            const ord = financeSaldosCache.ordenados;
            const keys = FINANCE_PRO_ACCOUNT_KEYS;
            const hoy = todayISO();
            const fin = ord[ord.length - 1].date > hoy ? ord[ord.length - 1].date : hoy;
            const historia = [...(financeProfile.history || [])].sort((a, b) => String(a.month).localeCompare(String(b.month)));
            const extraDe = mes => {
                let snap = null;
                for (const h of historia) { if (h.month <= mes) snap = h; else break; }
                return snap ? Number(snap.emergency || 0) + Number(snap.invested || 0) : Number(financeProfile.emergency || 0) + Number(financeProfile.invested || 0);
            };
            let bal = keys.reduce((n, k) => n + Number(financePro.accounts[k]?.balance0 || 0), 0);
            const serie = [];
            let idx = 0;
            for (let d = new Date(ord[0].date + 'T12:00:00'); isoLocal(d) <= fin; d.setDate(d.getDate() + 1)) {
                const f = isoLocal(d);
                let delta = 0;
                for (; idx < ord.length && ord[idx].date <= f; idx++) {
                    const t = ord[idx];
                    if (!financeProCuentaEnSaldo(t)) continue;
                    const imp = Number(t.amount) || 0;
                    if (t.type === 'transfer') {
                        if (keys.includes(t.account) && !keys.includes(t.transferTo)) delta -= imp;
                        if (keys.includes(t.transferTo) && !keys.includes(t.account)) delta += imp;
                    } else if (keys.includes(t.account)) delta += (t.type === 'income' ? 1 : -1) * imp;
                }
                bal += delta;
                serie.push({ f, v: bal + (conExtras ? extraDe(f.slice(0, 7)) : 0), delta });
            }
            let res = serie;
            if (meses) {
                const desde = new Date(fin + 'T12:00:00');
                desde.setMonth(desde.getMonth() - meses);
                res = serie.filter(d => d.f >= isoLocal(desde));
            }
            memo[clave] = res;
            return res;
        }

        function renderFinanzasGrafica(movil) {
            const rango = FINANCE_PRO_CHART_RANGES.find(r => r.key === financeProChartRange) || FINANCE_PRO_CHART_RANGES[2];
            const serie = financeSerieDiaria(rango.months, financeGrafExtras);
            const total = serie.length ? serie[serie.length - 1].v : financeProTotalBalance();
            const cambio = serie.length > 1 ? total - serie[0].v : 0;
            const tieneExtras = Number(financeProfile.invested || 0) + Number(financeProfile.emergency || 0) > 0 || (financeProfile.history || []).some(h => Number(h.invested || 0) + Number(h.emergency || 0) > 0);
            window._finGraf = { serie, rango };
            const periodo = rango.months === 1 ? 'en el último mes' : rango.months === 12 ? 'en el último año' : rango.months ? `en los últimos ${rango.months} meses` : 'desde el primer movimiento';
            const delta = c => `<b class="${c < 0 ? 'neg' : ''}">${c >= 0 ? '+' : '−'}${financeMoney(Math.abs(c))}</b>`;
            return `<section class="${movil ? '' : 'finance-panel '}fin-grafica ${movil ? 'movil' : ''}" ${movil ? '' : 'id="finance-pro-chart-panel"'}>
                <div class="fin-graf-cab">
                    <div><h3>${financeGrafExtras ? 'patrimonio.' : 'tus cuentas.'}</h3><small class="fin-graf-sub">${financeGrafExtras ? 'tus cuentas, la inversión y la emergencia.' : 'lo que tienes hoy entre todas.'}</small></div>
                    <div class="vista-seg fin-graf-rango" role="tablist" aria-label="Periodo">${FINANCE_PRO_CHART_RANGES.map(r => `<button role="tab" aria-selected="${r.key === rango.key}" onclick="financeProSetChartRange('${r.key}')"><span class="largo">${r.label}</span><span class="corto">${r.corto}</span></button>`).join('')}</div>
                </div>
                <div class="fin-graf-cifra" data-value="${total}">${financeMoney(total)}</div>
                <div class="fin-graf-delta" data-base="${serie.length ? serie[0].v : 0}" data-texto="${periodo}">${serie.length > 1 ? `${delta(cambio)} ${periodo}.` : ''}</div>
                ${serie.length > 1
                    ? `<div class="fin-graf" role="img" aria-label="Evolución del patrimonio ${periodo}: de ${financeMoney(serie[0].v)} a ${financeMoney(total)}, diferencia ${cambio >= 0 ? 'positiva' : 'negativa'} de ${financeMoney(Math.abs(cambio))}." onpointermove="financeGrafScrub(event)" onpointerdown="financeGrafScrub(event)" onpointerleave="financeGrafSoltar()"></div>`
                    : `<p class="asig-vacio fin-graf-vacio">La gráfica empieza en cuanto apuntes o importes tu primer movimiento.</p>`}
                <div class="fin-graf-pie">
                    ${tieneExtras ? `<button class="asig-enlace" onclick="alternarExtrasGrafica()">${financeGrafExtras ? 'solo las cuentas.' : 'con inversión y emergencia.'}</button>` : '<span></span>'}
                    ${movil ? '' : `<span class="fin-graf-acciones"><button class="vista-btn" onclick="openHistorialPresupuestos()">presupuestos.</button><button class="vista-btn" onclick="openFinanceProStatsModal()">estadísticas.</button></span>`}
                </div>
            </section>`;
        }

        function actualizarHistorialPresupuestos() {
            if (typeof asistLimitesDelMes !== 'function') return false;
            const hist = financePro.historialPresupuestos || (financePro.historialPresupuestos = {});
            const actual = financeMonthKey();
            const meses = new Set([actual, ...Object.keys(financeProfile?.budgetPlans || {}).filter(m => m <= actual)]);
            let cambio = false;
            meses.forEach(mes => {
                const cats = {};
                Object.entries(asistLimitesDelMes(mes)).forEach(([id, l]) => {
                    const cat = financeProCategoryById(id);
                    if (!cat) return;
                    const { gastado, limite } = financeProPresupuestoConDevoluciones(id, mes, l.limite);
                    cats[id] = { nombre: (l.nombre || cat.name || '').trim(), limite: Math.round(limite * 100) / 100, gastado: Math.round(gastado * 100) / 100 };
                });
                if (!Object.keys(cats).length) return;
                const antes = JSON.stringify(hist[mes]?.categorias || {});
                if (antes !== JSON.stringify(cats)) { hist[mes] = { categorias: cats, actualizado: todayISO() }; cambio = true; }
            });
            return cambio;
        }

        function openHistorialPresupuestos() {
            if (actualizarHistorialPresupuestos()) saveData().catch(e => console.error(e));
            const hist = financePro.historialPresupuestos || {};
            const meses = Object.keys(hist).sort().reverse();
            showModal(`
                <div class="modal-title">presupuestos, mes a mes.</div>
                ${meses.length ? meses.map(m => {
                    const cats = Object.values(hist[m].categorias || {}).sort((a, b) => (b.gastado - b.limite) - (a.gastado - a.limite));
                    const pasado = cats.reduce((n, c) => n + Math.max(0, c.gastado - c.limite), 0);
                    return `<details class="presu-mes" ${m === meses[0] ? 'open' : ''}><summary><b>${escapeHtml(financeMonthLabel(m))}.</b><span>${pasado > 0 ? `te pasaste ${financeMoney(pasado)}` : 'dentro de lo previsto'}</span></summary>
                        <div class="presu-tabla">${cats.map(c => {
                            const dif = c.gastado - c.limite;
                            return `<div class="presu-fila"><span>${escapeHtml(c.nombre.toLowerCase())}.</span><span>${financeMoney(c.gastado)} de ${financeMoney(c.limite)}</span><b class="${dif > 0 ? 'neg' : ''}">${dif > 0 ? '+' + financeMoney(dif) : financeMoney(-dif) + ' libres'}</b></div>`;
                        }).join('')}</div></details>`;
                }).join('') : '<p class="finance-modal-note">Todavía no hay meses con presupuesto. Se apuntan solos en cuanto pones límites a tus categorías o casillas en largo plazo.</p>'}
            `);
        }

        function renderFinanceProChartPanel() {
            return renderFinanzasGrafica(false);
        }

        function financeDibujarGrafica() {
            const g = window._finGraf;
            if (!g || g.serie.length < 2) return;
            const MESES = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];
            document.querySelectorAll('.fin-graf').forEach(el => {
                const W = el.clientWidth;
                if (!W) return;
                const serie = g.serie, n = serie.length;
                const movil = W < 520;
                const H = movil ? 190 : 220, pT = 18, pB = 24, pR = 10;
                const iw = W - pR, ih = H - pT - pB;
                const vals = serie.map(d => d.v);
                const min = Math.min(...vals), max = Math.max(...vals), marg = (max - min) * 0.14 || Math.abs(max) * 0.05 || 1;
                const lo = min - marg, hi = max + marg;
                const x = i => (i / (n - 1)) * (iw - 6) + 3;
                const y = v => pT + ih - ((v - lo) / (hi - lo)) * ih;
                const linea = financeSmoothPath(serie.map((d, i) => [x(i), y(d.v)]));
                const area = `${linea} L${x(n - 1).toFixed(1)},${pT + ih}L${x(0).toFixed(1)},${pT + ih}Z`;
                const inicios = serie.map((d, i) => ({ d, i })).filter(({ d, i }) => i === 0 || d.f.endsWith('-01'));
                const cada = Math.max(1, Math.ceil(inicios.length / (movil ? 5 : 9)));
                const meses = inicios.filter((_, j) => j % cada === 0).map(({ d, i }) => {
                    const cx = x(i) + (i === 0 ? 0 : 0);
                    return cx > 14 && cx < iw - 14 ? `<text x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle">${MESES[Number(d.f.slice(5, 7)) - 1]}</text>` : '';
                }).join('');
                const id = 'fin-raya-' + (el.closest('.movil') ? 'm' : 'd');
                el.innerHTML = `<svg width="${W}" height="${H}" aria-hidden="true">
                    <defs><pattern id="${id}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" class="fin-raya"/></pattern></defs>
                    <line x1="0" x2="${iw}" y1="${y(serie[0].v).toFixed(1)}" y2="${y(serie[0].v).toFixed(1)}" class="fin-base"/>
                    <path d="${area}" fill="url(#${id})" stroke="none" class="fin-area"/>
                    <path d="${linea}" fill="none" stroke="currentColor" class="fin-linea"/>
                    ${meses}
                    <line class="fin-cursor" x1="0" x2="0" y1="${pT - 8}" y2="${pT + ih}" style="display:none"/>
                    <circle class="fin-fin-halo" cx="${x(n - 1).toFixed(1)}" cy="${y(serie[n - 1].v).toFixed(1)}" r="7"/>
                    <circle class="fin-fin" cx="${x(n - 1).toFixed(1)}" cy="${y(serie[n - 1].v).toFixed(1)}" r="4.5"/>
                </svg>`;
                el._geo = { x, y, iw, n };
            });
        }

        // Al pasar el dedo o el ratón, la cifra grande dice el saldo de ese día y cuánto ha cambiado desde el principio.
        function financeGrafScrub(e) {
            const el = e.currentTarget, g = window._finGraf, geo = el._geo;
            if (!g || !geo) return;
            const r = el.getBoundingClientRect();
            const i = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left - 3) / (geo.iw - 6))) * (geo.n - 1));
            const d = g.serie[i];
            const panel = el.closest('.fin-grafica');
            const cx = geo.x(i).toFixed(1), cy = geo.y(d.v).toFixed(1);
            const cursor = el.querySelector('.fin-cursor');
            cursor.setAttribute('x1', cx); cursor.setAttribute('x2', cx); cursor.style.display = '';
            el.querySelectorAll('.fin-fin, .fin-fin-halo').forEach(c => { c.setAttribute('cx', cx); c.setAttribute('cy', cy); });
            const cifra = panel.querySelector('.fin-graf-cifra');
            cifra.textContent = financeMoney(d.v);
            const c = d.v - g.serie[0].v;
            panel.querySelector('.fin-graf-delta').innerHTML = `<b class="${c < 0 ? 'neg' : ''}">${c >= 0 ? '+' : '−'}${financeMoney(Math.abs(c))}</b> desde el principio del periodo.`;
            panel.querySelector('.fin-graf-sub').textContent = new Date(d.f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) + '.';
        }

        function financeGrafSoltar() {
            const g = window._finGraf;
            if (!g || g.serie.length < 2) return;
            document.querySelectorAll('.fin-grafica').forEach(panel => {
                const el = panel.querySelector('.fin-graf');
                if (!el || !el._geo) return;
                const n = g.serie.length, ult = g.serie[n - 1];
                const cx = el._geo.x(n - 1).toFixed(1), cy = el._geo.y(ult.v).toFixed(1);
                el.querySelector('.fin-cursor').style.display = 'none';
                el.querySelectorAll('.fin-fin, .fin-fin-halo').forEach(c => { c.setAttribute('cx', cx); c.setAttribute('cy', cy); });
                panel.querySelector('.fin-graf-cifra').textContent = financeMoney(ult.v);
                const c = ult.v - g.serie[0].v, d = panel.querySelector('.fin-graf-delta');
                d.innerHTML = `<b class="${c < 0 ? 'neg' : ''}">${c >= 0 ? '+' : '−'}${financeMoney(Math.abs(c))}</b> ${d.dataset.texto}.`;
                panel.querySelector('.fin-graf-sub').textContent = financeGrafExtras ? 'tus cuentas, la inversión y la emergencia.' : 'lo que tienes hoy entre todas.';
            });
        }

        let finGrafRedim = null;
        window.addEventListener('resize', () => {
            if (!document.querySelector('.fin-graf')) return;
            clearTimeout(finGrafRedim);
            finGrafRedim = setTimeout(financeDibujarGrafica, 120);
        });

        function financeProMonthTotals(monthKey) {
            let income = 0, expense = 0;
            financePro.transactions.forEach(t => {
                if (t.date.slice(0, 7) !== monthKey || financeProNeutro(t)) return;
                if (t.type === 'income') income += Number(t.amount) || 0;
                else if (t.type === 'expense') expense += Number(t.amount) || 0;
            });
            return { income, expense };
        }

        function financeProPctLabel(pct) {
            if (pct === null || !Number.isFinite(pct)) return '—';
            return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
        }

        function financeProStatsData() {
            const now = financeMonthKey();
            const prevDate = new Date(); prevDate.setMonth(prevDate.getMonth() - 1);
            const prevMonth = financeMonthKey(prevDate);
            const curTotals = financeProMonthTotals(now);
            const prevTotals = financeProMonthTotals(prevMonth);
            const avgMonths = [];
            for (let i = 1; i <= 6; i++) { const d = new Date(); d.setMonth(d.getMonth() - i); avgMonths.push(financeMonthKey(d)); }
            const avgData = avgMonths.map(m => financeProMonthTotals(m));
            const avgExpense = avgData.reduce((s, t) => s + t.expense, 0) / avgMonths.length;
            const avgIncome = avgData.reduce((s, t) => s + t.income, 0) / avgMonths.length;
            const series = financeProMonthlyBalances(null);
            const firstBal = series.length ? series[0].balance : 0;
            const lastBal = series.length ? series[series.length - 1].balance : financeProTotalBalance();
            const prevBal = series.length >= 2 ? series[series.length - 2].balance : null;
            const pctSinceStart = firstBal ? ((lastBal - firstBal) / Math.abs(firstBal)) * 100 : null;
            const pctVsPrevMonth = (prevBal !== null && prevBal !== 0) ? ((lastBal - prevBal) / Math.abs(prevBal)) * 100 : null;
            const catTotals = {};
            financePro.transactions.forEach(t => {
                if (t.type !== 'expense' || t.date.slice(0, 7) !== now || financeProNeutro(t)) return;
                const k = t.category || '_none';
                catTotals[k] = (catTotals[k] || 0) + (Number(t.amount) || 0);
            });
            let topCat = null, topAmt = 0;
            Object.keys(catTotals).forEach(k => { if (catTotals[k] > topAmt) { topAmt = catTotals[k]; topCat = k; } });
            const savingsRate = curTotals.income ? ((curTotals.income - curTotals.expense) / curTotals.income) * 100 : null;
            return { now, curTotals, prevTotals, avgExpense, avgIncome, pctSinceStart, pctVsPrevMonth, topCat, topAmt, savingsRate };
        }

        function openFinanceProStatsModal() {
            const s = financeProStatsData();
            const expVsPrev = s.prevTotals.expense ? ((s.curTotals.expense - s.prevTotals.expense) / s.prevTotals.expense) * 100 : null;
            const incVsPrev = s.prevTotals.income ? ((s.curTotals.income - s.prevTotals.income) / s.prevTotals.income) * 100 : null;
            const expVsAvg = s.avgExpense ? ((s.curTotals.expense - s.avgExpense) / s.avgExpense) * 100 : null;
            const incVsAvg = s.avgIncome ? ((s.curTotals.income - s.avgIncome) / s.avgIncome) * 100 : null;
            const topCatObj = s.topCat && s.topCat !== '_none' ? financeProCategoryById(s.topCat) : null;
            showModal(`
                <div class="modal-title">Estadísticas de ${escapeHtml(financeMonthLabel(s.now))}</div>
                <div class="finance-stats-grid">
                    <div class="finance-stats-card">
                        <div class="finance-stats-label">Gastos este mes</div>
                        <div class="finance-stats-value finance-negative">${financeMoney(s.curTotals.expense)}</div>
                        <div class="finance-stats-sub">${financeProPctLabel(expVsPrev)} vs mes anterior, ${financeProPctLabel(expVsAvg)} vs media (6m)</div>
                    </div>
                    <div class="finance-stats-card">
                        <div class="finance-stats-label">Ingresos este mes</div>
                        <div class="finance-stats-value finance-positive">${financeMoney(s.curTotals.income)}</div>
                        <div class="finance-stats-sub">${financeProPctLabel(incVsPrev)} vs mes anterior, ${financeProPctLabel(incVsAvg)} vs media (6m)</div>
                    </div>
                    <div class="finance-stats-card">
                        <div class="finance-stats-label">Evolución del saldo</div>
                        <div class="finance-stats-value">${financeProPctLabel(s.pctVsPrevMonth)}</div>
                        <div class="finance-stats-sub">vs mes anterior, ${financeProPctLabel(s.pctSinceStart)} desde el primer registro</div>
                    </div>
                    <div class="finance-stats-card">
                        <div class="finance-stats-label">Tasa de ahorro</div>
                        <div class="finance-stats-value">${s.savingsRate === null ? '—' : financeProPctLabel(s.savingsRate)}</div>
                        <div class="finance-stats-sub">de lo ingresado este mes que no se ha gastado</div>
                    </div>
                    <div class="finance-stats-card" style="grid-column:1/-1">
                        <div class="finance-stats-label">Categoría con más gasto este mes</div>
                        <div class="finance-stats-value">${topCatObj ? escapeHtml(topCatObj.name) : (s.topCat === '_none' ? 'Sin categoría' : '—')}</div>
                        <div class="finance-stats-sub">${s.topAmt ? financeMoney(s.topAmt) + ' este mes' : 'Sin gastos registrados todavía'}</div>
                    </div>
                </div>
            `);
        }

        const FINANCE_PRO_ACCOUNT_META = {
            efectivo: { icon: FINANCE_ICON_CASH, badge: 'fin-teal', color: '#0d9488' },
            bancos: { icon: FINANCE_ICON_CARD, badge: 'fin-blue', color: '#3b82f6' },
            online: { icon: FINANCE_ICON_GLOBE, badge: 'fin-purple', color: '#8b5cf6' }
        };

        // ============================================================
        //  FINANZAS PRO — panel principal
        // ============================================================
        function renderFinanceProAccountCard(key) {
            const meta = FINANCE_PRO_ACCOUNT_META[key];
            const acc = financePro.accounts[key];
            const balance = financeProAccountBalance(key);
            const series = financeProMonthlyBalances(key);
            return `
            <div class="finance-panel finance-pro-account-card">
                <div class="finance-panel-head">
                    ${financePanelHeadIcon(meta.icon, meta.badge, 'Cuenta', acc.name)}
                    <div style="display:flex;gap:6px">
                        <button class="finance-icon-btn" title="Modificar saldo de ${escapeHtml(acc.name)}" onclick="openFinanceProBalanceAdjustModal('${key}')">${FINANCE_ICON_SCALE}</button>
                        <button class="finance-icon-btn" title="Movimiento en ${escapeHtml(acc.name)}" onclick="openFinanceProTransactionModal(null,'${key}')">+</button>
                    </div>
                </div>
                <div class="finance-networth-value finance-networth-value-compact" style="margin:4px 0 10px">${financeMoney(balance)}</div>
                <div class="finance-pro-mini-chart">${renderFinanceProLineChart(series, meta.color, key, true)}</div>
            </div>`;
        }

        // Modificar saldo: el usuario pone el saldo real de la cuenta y se
        // crea un único movimiento "Ajuste de saldo" con la diferencia, en
        // vez de tener que editar el saldo inicial (que desplazaría todo el
        // histórico) o añadir movimientos sueltos para cuadrar la cuenta.
        function openFinanceProBalanceAdjustModal(key) {
            const acc = financePro.accounts[key];
            const current = financeProAccountBalance(key);
            window._financeProAdjustKey = key;
            showModal(`
                <div class="modal-title">Modificar saldo de ${escapeHtml(acc.name)}</div>
                <div class="finance-modal-note" style="margin-bottom:12px">Saldo actual: ${financeMoney(current)}. Escribe el saldo real y se creará un movimiento "Ajuste de saldo" con la diferencia para cuadrarlo, sin tocar tu histórico.</div>
                <div class="modal-label">Saldo real (€)</div>
                <input class="modal-input" id="pro-acc-adjust-target" type="number" step="0.01" value="${current.toFixed(2)}">
                <button class="btn-modal-primary" style="margin-top:6px" onclick="saveFinanceProBalanceAdjust()">guardar.</button>
            `);
        }

        async function saveFinanceProBalanceAdjust() {
            const key = window._financeProAdjustKey;
            const target = Number(document.getElementById('pro-acc-adjust-target')?.value);
            if (!Number.isFinite(target)) { showToast('Introduce un importe válido', true); return; }
            const current = financeProAccountBalance(key);
            const diff = Math.round((target - current) * 100) / 100;
            closeModal();
            if (Math.abs(diff) < 0.01) { showToast('El saldo ya coincidía'); return; }
            financePro.transactions.push({
                id: 'ptx_adj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                date: todayISO(),
                account: key,
                type: diff > 0 ? 'income' : 'expense',
                amount: Math.abs(diff),
                note: 'Ajuste de saldo',
                ajuste: true
            });
            render();
            try { await saveData(); showToast(`Saldo ajustado, ${diff > 0 ? '+' : '-'}${financeMoney(Math.abs(diff))}`); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // Gasto neto de una categoría: al gasto real se le restan los
        // ingresos de la categoría de ingreso con el MISMO nombre — un
        // amigo devolviéndote su parte de la cuenta (Comida y bebida),
        // vender un coleccionable (Coleccionables), reembolsos de
        // inversión... no es dinero ganado, es gasto que vuelve. Si no
        // existe una categoría de ingreso con ese nombre, no hay nada que
        // restar y se comporta como antes.
        function financeProCategorySpend(catId, monthKey) {
            return Math.max(0, financeProCategoryExpense(catId, monthKey) - financeProCategoryRefunds(catId, monthKey));
        }

        function financeProCategoryExpense(catId, monthKey) {
            monthKey = monthKey || financeMonthKey();
            return financePro.transactions
                .filter(t => t.type === 'expense' && t.category === catId && t.date.slice(0, 7) === monthKey && !t.viaje && !financeProFueraDeCategoria(t))
                .reduce((s, t) => s + (Number(t.amount) || 0), 0);
        }

        // En los presupuestos, lo devuelto no resta del gasto sino que amplía
        // el límite del mes: con 60 € para coleccionables y un reembolso de
        // 149,85 €, ese mes se pueden gastar 209,85 €. Restándolo del gasto
        // (y sin bajar de cero) el sobrante del reembolso se perdía.
        function financeProPresupuestoConDevoluciones(catId, monthKey, limite) {
            const devuelto = Math.round(financeProCategoryRefunds(catId, monthKey) * 100) / 100;
            const gastado = Math.round(financeProCategoryExpense(catId, monthKey) * 100) / 100;
            return { gastado, devuelto, limite: (Number(limite) || 0) + devuelto };
        }

        function financeProCategoryRefunds(catId, monthKey) {
            monthKey = monthKey || financeMonthKey();
            const cat = financeProCategoryById(catId);
            if (!cat) return 0;
            const incomeCat = financePro.categories.find(c => c.type === 'income' && c.name.toLowerCase() === cat.name.toLowerCase());
            if (!incomeCat) return 0;
            return financePro.transactions
                .filter(t => t.type === 'income' && t.category === incomeCat.id && t.date.slice(0, 7) === monthKey && !financeProFueraDeCategoria(t))
                .reduce((s, t) => s + (Number(t.amount) || 0), 0);
        }

        // Las categorías con límite este mes: las casillas de largo plazo vinculadas a ellas (el único límite que hay).
        // Sin ninguna, el panel entero desaparece en vez de quedar vacío ocupando sitio.
        function renderFinanceProBudgetsPanel() {
            const monthKey = financeMonthKey();
            const limitesMes = typeof asistLimitesDelMes === 'function' ? asistLimitesDelMes(monthKey) : {};
            const budgets = Object.fromEntries(Object.entries(limitesMes).map(([id, l]) => [id, l.limite]));
            const ids = Object.keys(budgets).filter(id => budgets[id] > 0 && financeProCategoryById(id));
            if (!ids.length) return '';
            return `<section class="finance-panel" style="margin-top:16px">
                <div class="finance-panel-head">
                    ${financePanelHeadIcon(FINANCE_ICON_TARGET, 'fin-pink', financeMonthLabel(monthKey), 'Presupuestos')}
                </div>
                ${ids.map(id => {
                    const cat = financeProCategoryById(id);
                    const { gastado: spent, devuelto, limite: budget } = financeProPresupuestoConDevoluciones(id, monthKey, budgets[id]);
                    const pct = Math.min(100, (spent / budget) * 100);
                    const over = spent > budget;
                    const near = !over && pct >= 80;
                    const barColor = over ? '#dc2626' : near ? '#d97706' : financeProCategoryColor(cat);
                    return `<div class="finance-budget-row" style="cursor:default">
                        <div class="finance-budget-row-head">
                            <span style="display:flex;align-items:center;gap:8px;color:var(--text-primary)">${financeProCategoryBadge(cat)}${escapeHtml(cat.name)}</span>
                            <span class="${over ? 'finance-negative' : ''}">${financeMoney(spent)} / ${financeMoney(budget)}</span>
                        </div>
                        <div class="finance-progress"><span style="width:${pct}%;background:${barColor}"></span></div>
                        ${devuelto > 0 ? `<div class="finance-devuelto">+${financeMoney(devuelto)} devuelto este mes.</div>` : ''}
                        ${over ? `<div class="finance-metric-note" style="color:#dc2626;margin-top:4px">Presupuesto superado en ${financeMoney(spent - budget)}</div>` : near ? `<div class="finance-metric-note" style="color:#d97706;margin-top:4px">Cerca del límite</div>` : ''}
                    </div>`;
                }).join('')}
            </section>`;
        }

        // Patrimonio operativo unificado: efectivo+bancos+online reales de
        // PRO (ya no la cifra manual financeProfile.cash del extinto
        // Resumen clásico) + emergencia/inversión, que se siguen llevando a
        // mano vía "Actualizar este mes" porque no son cuentas transaccionales.
        function financeUnifiedPatrimony() {
            return financeProTotalBalance() + Number(financeProfile.invested || 0) + Number(financeProfile.emergency || 0);
        }

        function financeUnifiedPatrimonyChange() {
            const total = financeUnifiedPatrimony();
            const now = financeMonthKey();
            const [y, m] = now.split('-').map(Number);
            const prevMonthKey = financeMonthKey(new Date(y, m - 2, 1));
            const prevPoint = financeProMonthlyBalances(null).find(p => p.month === prevMonthKey);
            const prevSnap = [...(financeProfile.history || [])].find(h => h.month === prevMonthKey);
            if (!prevPoint && !prevSnap) return { total, change: null };
            const prevProBalance = prevPoint ? prevPoint.balance : 0;
            const prevInvested = prevSnap ? Number(prevSnap.invested || 0) : Number(financeProfile.invested || 0);
            const prevEmergency = prevSnap ? Number(prevSnap.emergency || 0) : Number(financeProfile.emergency || 0);
            return { total, change: financePctChange(total, prevProBalance + prevInvested + prevEmergency) };
        }

        // Sustituye la antigua "Previsión" (sueldo/aportaciones editados a
        // mano) por una señal calculada del ritmo real de los últimos meses
        // en las cuentas PRO frente al objetivo fijado.
        function financeGoalTrendSignal() {
            const series = financeProMonthlyBalances(null);
            if (series.length < 2) return null;
            const last6 = series.slice(-6);
            const deltas = [];
            for (let i = 1; i < last6.length; i++) deltas.push(last6[i].balance - last6[i - 1].balance);
            if (!deltas.length) return null;
            const avgDelta = deltas.reduce((s, d) => s + d, 0) / deltas.length;
            const target = financeTargetTotal();
            if (target <= 0) return { text: 'Define un objetivo (botón "✎ Objetivo") para ver tu previsión automática.' };
            const remaining = target - financeUnifiedPatrimony();
            if (remaining <= 0) return { text: 'Objetivo alcanzado.' };
            if (avgDelta <= 0) return { text: `A tu ritmo actual (${financeMoney(avgDelta)}/mes de media) no te acercas al objetivo: te faltan ${financeMoney(remaining)}.` };
            const monthsToGo = Math.ceil(remaining / avgDelta);
            return { text: `A este ritmo (+${financeMoney(avgDelta)}/mes de media), llegarías a tu objetivo en ${monthsToGo} mes${monthsToGo === 1 ? '' : 'es'}.` };
        }

        // Variación del patrimonio PRO (Efectivo+Bancos+Online) mes a mes,
        // en un popup con navegación por años — ya no una tarjeta fija en
        // el panel, se abre desde el botón de % en "Patrimonio operativo".
        let financeYearlyPctSelectedYear = null;

        function financeProYearlyPctChanges(year) {
            const series = financeProMonthlyBalances(null);
            const balanceByMonth = {};
            series.forEach(p => { balanceByMonth[p.month] = p.balance; });
            const months = [];
            for (let m = 1; m <= 12; m++) {
                const mk = `${year}-${String(m).padStart(2, '0')}`;
                const prevKey = financeMonthKey(new Date(Number(year), m - 2, 1));
                const cur = balanceByMonth[mk];
                const prev = balanceByMonth[prevKey];
                const pct = (cur !== undefined && prev !== undefined) ? financePctChange(cur, prev) : null;
                months.push({ month: mk, pct });
            }
            return months;
        }

        function openFinanceYearlyChangeModal() {
            if (!financeYearlyPctSelectedYear) financeYearlyPctSelectedYear = new Date().getFullYear();
            showModal(`<div class="modal-title">Variación mes a mes</div><div id="finance-yearly-pct-body">${renderFinanceYearlyPctBody()}</div>`);
        }

        function financeShiftYearlyPctYear(delta) {
            const current = new Date().getFullYear();
            const next = (financeYearlyPctSelectedYear || current) + delta;
            financeYearlyPctSelectedYear = Math.min(current, next);
            const el = document.getElementById('finance-yearly-pct-body');
            if (el) el.outerHTML = `<div id="finance-yearly-pct-body">${renderFinanceYearlyPctBody()}</div>`;
        }

        function renderFinanceYearlyPctBody() {
            const year = financeYearlyPctSelectedYear || new Date().getFullYear();
            const months = financeProYearlyPctChanges(year);
            const atCurrentYear = year >= new Date().getFullYear();
            return `
                <div class="finance-year-summary-nav">
                    <button onclick="financeShiftYearlyPctYear(-1)" aria-label="Año anterior"><i class='ico ico-izq' aria-hidden=true></i></button>
                    <strong>${year}</strong>
                    <button onclick="financeShiftYearlyPctYear(1)" aria-label="Año siguiente" ${atCurrentYear ? 'disabled' : ''}><i class='ico ico-der' aria-hidden=true></i></button>
                </div>
                <div class="finance-year-summary-list">
                    ${months.map(m => `
                        <div class="finance-year-summary-row">
                            <span>${FINANCE_PRO_MONTH_NAMES[Number(m.month.slice(5, 7)) - 1]}</span>
                            <span class="${m.pct === null ? '' : m.pct >= 0 ? 'finance-positive' : 'finance-negative'}">${m.pct === null ? '—' : `${m.pct >= 0 ? '+' : ''}${m.pct.toFixed(1)}%`}</span>
                        </div>`).join('')}
                </div>
            `;
        }

        // ============================================================
        //  FINANZAS PRO — tarjeta de Patrimonio operativo
        // ============================================================
        function renderFinanceNetworthCard() {
            const { total, change: totalChange } = financeUnifiedPatrimonyChange();
            const target = financeTargetTotal();
            const remainingToTarget = Math.max(0, target - total);
            const pctBtnClass = totalChange === null ? 'neutral' : totalChange >= 0 ? 'positive' : 'negative';
            const composition = 'compuesto de la suma de tus cuentas principales, tu inversión y tu fondo de emergencia';
            const noteText = target > 0
                ? (remainingToTarget <= 0
                    ? `Objetivo alcanzado. Esta cuenta es tu patrimonio operativo, ${composition}.`
                    : `Faltan ${financeMoney(remainingToTarget)} para alcanzar tu meta de ${financeMoney(target)}. Esta cuenta es tu patrimonio operativo, ${composition}.`)
                : `Define un objetivo para ver tu camino. Esta cuenta es tu patrimonio operativo, ${composition}.`;
            return `<section class="finance-panel finance-networth-compact" id="finance-networth-section">
                <div class="finance-panel-head">
                    <div>
                        <div class="finance-kicker">Patrimonio</div>
                        <div class="finance-networth-compact-value">${financeMoney(total)}</div>
                    </div>
                    <button class="finance-networth-pct-btn ${pctBtnClass}" onclick="openFinanceYearlyChangeModal()" title="Ver variación mes a mes">
                        ${totalChange === null ? 'Variación' : `${totalChange >= 0 ? '+' : ''}${totalChange.toFixed(1)}%`}
                    </button>
                </div>
                <div class="finance-networth-compact-note">${escapeHtml(noteText)}</div>
                <div class="finance-networth-compact-foot">
                    <button class="finance-networth-action-btn" onclick="openFinanceTargetEditor()">Objetivo.</button>
                    <button class="finance-networth-action-btn" onclick="openFinanceMonthlyBalancesModal()">saldos.</button>
                    <div class="finance-networth-compact-icon">${FINANCE_ICON_ARROW_UP}</div>
                </div>
            </section>`;
        }

        // Saldo neto (ingresos − gastos) de cada uno de los últimos 6 meses,
        // del más antiguo al más reciente.
        function financeLast6MonthsNetBalances() {
            const now = new Date();
            const months = [];
            for (let i = 5; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                months.push(financeMonthKey(d));
            }
            return months.map(month => {
                const { income, expense } = financeProMonthTotals(month);
                return { month, net: income - expense };
            });
        }

        // Gráfica de barras redondeadas con línea base al centro: las barras
        // de meses en positivo suben, las de meses en negativo cuelgan hacia
        // abajo — mismo lenguaje visual que los iconos sólidos TARJETA
        // BITACORA (ver FINANCE_ICON_PULSE), aplicado aquí a datos reales.
        function renderFinanceMonthlyBalancesChart() {
            const data = financeLast6MonthsNetBalances();
            const maxAbs = Math.max(1, ...data.map(d => Math.abs(d.net)));
            const W = 340, H = 180, baseY = H / 2, maxBarH = H / 2 - 24;
            const barW = 34, gap = (W - barW * data.length) / (data.length + 1);
            const bars = data.map((d, i) => {
                const x = gap + i * (barW + gap);
                const h = Math.max(6, (Math.abs(d.net) / maxAbs) * maxBarH);
                const y = d.net >= 0 ? baseY - h : baseY;
                const rx = barW / 2;
                const label = FINANCE_PRO_MONTH_NAMES[Number(d.month.slice(5, 7)) - 1].slice(0, 3);
                return `
                    <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" rx="${rx}" fill="var(--text-primary)" opacity="${d.net >= 0 ? '1' : '.45'}"/>
                    <text x="${(x + barW / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="10" font-weight="600" fill="var(--text-muted)">${label}</text>`;
            }).join('');
            return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;max-width:400px;margin:0 auto">
                <line x1="0" y1="${baseY}" x2="${W}" y2="${baseY}" stroke="var(--border)" stroke-width="1"/>
                ${bars}
            </svg>`;
        }

        function openFinanceMonthlyBalancesModal() {
            showModal(`<div class="modal-title">Saldos netos, últimos 6 meses</div>
                <div class="finance-modal-note" style="margin-bottom:6px">Ingresos menos gastos de cada mes en tus cuentas PRO. Las barras tenues por debajo de la línea son meses en negativo.</div>
                ${renderFinanceMonthlyBalancesChart()}`);
        }

        // "Planificación a futuro" — tres botones a modo de tarjeta (blanco
        // y negro, icono grande) que abren cada uno su popup, en vez de tres
        // paneles anchos siempre visibles ocupando toda esa franja.
        // ============================================================
        //  RITMO — cómo va el gasto del mes frente a lo que es normal en
        //  el usuario a estas alturas. Gasto neto del día a día: sin
        //  suscripciones ni gastos fijos (son fijos, no dicen nada del
        //  ritmo), sin inversiones ni coleccionables (lo mismo que la
        //  proyección del inicio) y sin ajustes de saldo; lo devuelto en una
        //  categoría resta. Se compara el acumulado a día de hoy con el que
        //  llevaban los meses anteriores el mismo día (mediana y la franja
        //  entre el cuartil bajo y el alto), así que cada mes que pasa
        //  afina la idea de "normal" sin que haya nada que configurar.
        // ============================================================
        const RITMO_FUERA = ['cat_inversion_gasto', 'cat_coleccionables'];
        const RITMO_MAX_MESES = 12;

        function ritmoCuantil(valores, q) {
            const v = [...valores].sort((a, b) => a - b);
            if (!v.length) return 0;
            const pos = (v.length - 1) * q, i = Math.floor(pos);
            return v[i] + ((v[i + 1] ?? v[i]) - v[i]) * (pos - i);
        }

        function ritmoMovimientos() {
            const esAjuste = id => financeProNormalizar(financeProCategoryById(id)?.name).trim() === 'ajuste de saldo';
            const gastoPorNombre = {};
            financePro.categories.filter(c => c.type === 'expense').forEach(c => { gastoPorNombre[c.name.toLowerCase()] = c.id; });
            const lista = [];
            financePro.transactions.forEach(t => {
                if (!t.date || t.viaje || financeProNeutro(t)) return;
                if (t.type === 'expense') {
                    if (t.recurringEntryId || RITMO_FUERA.includes(t.category) || esAjuste(t.category)) return;
                    lista.push({ date: t.date, cat: t.category || '', valor: Number(t.amount) || 0 });
                } else if (t.type === 'income' && t.category) {
                    const gasto = gastoPorNombre[(financeProCategoryById(t.category)?.name || '').toLowerCase()];
                    if (!gasto || RITMO_FUERA.includes(gasto) || esAjuste(gasto)) return;
                    lista.push({ date: t.date, cat: gasto, valor: -(Number(t.amount) || 0) });
                }
            });
            return lista;
        }

        function financeRitmoDatos() {
            const hoy = new Date();
            const dia = hoy.getDate();
            const actual = financeMonthKey(hoy);
            const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
            const movs = ritmoMovimientos();
            const porMes = {};
            movs.forEach(mv => {
                const m = mv.date.slice(0, 7);
                const d = Number(mv.date.slice(8, 10));
                (porMes[m] = porMes[m] || []).push({ d, cat: mv.cat, valor: mv.valor });
            });
            // El primer mes con datos solo cuenta si empieza a principios de
            // mes: uno empezado a medias parecería un mes muy ahorrador.
            const primero = (financePro.transactions || []).reduce((min, t) => (t.date && (!min || t.date < min) ? t.date : min), null);
            const validos = new Set(Object.keys(porMes).filter(m => m < actual && primero && (m > primero.slice(0, 7) || Number(primero.slice(8, 10)) <= 5)));
            // Un mes de los históricos sustituye al de Bitácora si es más
            // completo (más movimientos): los primeros meses de la app se
            // grabaron a mano y a medias, el extracto del banco los tiene todos.
            Object.entries(historicoMeses()).forEach(([m, h]) => {
                if (m >= actual || h.n < (porMes[m]?.length || 0)) return;
                porMes[m] = h.lista;
                validos.add(m);
            });
            const todos = [...validos].sort();
            const meses = todos.slice(-RITMO_MAX_MESES);
            const acumulado = (m, hasta, cat) => (porMes[m] || []).filter(x => x.d <= hasta && (cat === undefined || x.cat === cat)).reduce((s, x) => s + x.valor, 0);
            const llevas = acumulado(actual, dia);
            if (meses.length < 2) return { suficiente: false, meses: meses.length, dia, llevas };
            const serie = d => meses.map(m => acumulado(m, d));
            const franja = [];
            for (let d = 1; d <= diasMes; d++) {
                const v = serie(d);
                franja.push({ d, bajo: ritmoCuantil(v, 0.25), medio: ritmoCuantil(v, 0.5), alto: ritmoCuantil(v, 0.75) });
            }
            const hoyFranja = franja[dia - 1];
            const totales = meses.map(m => acumulado(m, 31));
            const totalNormal = ritmoCuantil(totales, 0.5);
            const restoNormal = ritmoCuantil(meses.map(m => acumulado(m, 31) - acumulado(m, dia)), 0.5);
            const proyeccion = llevas + restoNormal;
            const recorrido = [];
            for (let d = 1; d <= dia; d++) recorrido.push({ d, v: acumulado(actual, d) });
            const cats = new Set(movs.map(mv => mv.cat));
            const categorias = [...cats].map(cat => {
                const ahora = acumulado(actual, dia, cat);
                const normal = ritmoCuantil(meses.map(m => acumulado(m, dia, cat)), 0.5);
                return { cat, ahora, normal, diff: ahora - normal };
            }).filter(c => Math.abs(c.diff) >= Math.max(15, c.normal * 0.4));
            const holgura = Math.max(10, hoyFranja.alto - hoyFranja.bajo, hoyFranja.medio * 0.25);
            let nivel = 'normal';
            if (llevas < hoyFranja.bajo - 5) nivel = 'contenido';
            else if (llevas > hoyFranja.alto + holgura) nivel = 'muy';
            else if (llevas > hoyFranja.alto + 10) nivel = 'alto';
            const mismoMes = todos.filter(m => m.slice(5) === actual.slice(5));
            const otrosAnios = mismoMes.length ? { n: mismoMes.length, valor: ritmoCuantil(mismoMes.map(m => acumulado(m, dia)), 0.5) } : null;
            // Lo que este mes no cuenta en el ritmo, para que la cifra se entienda frente al gasto total de otras pantallas.
            const fueraMes = { viaje: 0, fijos: 0, otros: 0 };
            financePro.transactions.forEach(t => {
                if (t.type !== 'expense' || !t.date?.startsWith(actual) || Number(t.date.slice(8, 10)) > dia || financeProNeutro(t)) return;
                const v = Number(t.amount) || 0;
                if (t.viaje) fueraMes.viaje += v;
                else if (t.recurringEntryId) fueraMes.fijos += v;
                else if (RITMO_FUERA.includes(t.category)) fueraMes.otros += v;
            });
            return { suficiente: true, fueraMes, meses: meses.length, dia, diasMes, llevas, hoyFranja, totalNormal, proyeccion, franja, recorrido, categorias, nivel, otrosAnios, mesNombre: FINANCE_PRO_MONTH_NAMES[hoy.getMonth()].toLowerCase() };
        }

        function renderRitmoGrafica(r) {
            const W = 340, H = 150, padL = 4, padR = 4, padT = 10, padB = 18;
            const maxV = Math.max(10, ...r.franja.map(f => f.alto), r.llevas, r.proyeccion) * 1.08;
            const x = d => padL + (W - padL - padR) * (d - 1) / Math.max(1, r.diasMes - 1);
            const y = v => padT + (H - padT - padB) * (1 - Math.max(0, v) / maxV);
            const banda = r.franja.map(f => `${x(f.d).toFixed(1)},${y(f.alto).toFixed(1)}`).join(' L')
                + ' L' + [...r.franja].reverse().map(f => `${x(f.d).toFixed(1)},${y(f.bajo).toFixed(1)}`).join(' L');
            const medio = r.franja.map((f, i) => `${i ? 'L' : 'M'}${x(f.d).toFixed(1)},${y(f.medio).toFixed(1)}`).join(' ');
            const linea = r.recorrido.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
            const ultimo = r.recorrido[r.recorrido.length - 1];
            return `<svg class="ritmo-grafica" viewBox="0 0 ${W} ${H}" width="100%">
                <path d="M${banda} Z" fill="var(--text-primary)" opacity=".07"/>
                <path d="${medio}" fill="none" stroke="var(--text-secondary)" stroke-width="1.2" stroke-dasharray="3 4"/>
                <path d="M${x(ultimo.d).toFixed(1)},${y(ultimo.v).toFixed(1)} L${x(r.diasMes).toFixed(1)},${y(r.proyeccion).toFixed(1)}" fill="none" stroke="var(--text-primary)" stroke-width="1.2" stroke-dasharray="1 4" stroke-linecap="round" opacity=".6"/>
                <path d="${linea}" fill="none" stroke="var(--text-primary)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="${x(ultimo.d).toFixed(1)}" cy="${y(ultimo.v).toFixed(1)}" r="4" fill="var(--text-primary)"/>
                <text x="${padL}" y="${H - 3}" font-size="9" fill="var(--text-secondary)">1</text>
                <text x="${W - padR}" y="${H - 3}" font-size="9" text-anchor="end" fill="var(--text-secondary)">${r.diasMes}</text>
            </svg>`;
        }

        function renderRitmoBody() {
            const r = financeRitmoDatos();
            if (!r.suficiente) {
                return `<div class="ritmo-veredicto">todavía te estoy conociendo.</div>
                    <div class="ritmo-frase">Para saber qué es normal en ti necesito al menos dos meses completos de movimientos${r.meses ? ` y por ahora tengo ${r.meses}` : ''}. Mientras tanto: este mes llevas <b>${financeMoney(r.llevas)}</b> de gasto del día a día.</div>`;
            }
            const veredictos = {
                contenido: 'vas más contenido que de costumbre.',
                normal: 'vas en tu ritmo de siempre.',
                alto: 'este mes vas por encima de lo habitual.',
                muy: 'este mes estás gastando bastante más de lo que es normal en ti.'
            };
            const nombreCat = id => id ? (financeProCategoryById(id)?.name || 'otros').toLowerCase() : 'sin categoría';
            const frases = [];
            const restantes = r.diasMes - r.dia;
            if (restantes > 0) {
                const margen = r.totalNormal - r.llevas;
                frases.push(Math.abs(r.proyeccion - r.totalNormal) < 10
                    ? `Si sigues como siempre acabarás el mes en torno a <b>${financeMoney(r.proyeccion)}</b>, lo de un mes normal.`
                    : `Si a partir de hoy sigues como siempre, acabarás el mes en torno a <b>${financeMoney(r.proyeccion)}</b>, frente a los ${financeMoney(r.totalNormal)} de un mes normal.`);
                frases.push(margen > 0
                    ? `Para quedarte en tu mes de siempre te quedan unos <b>${financeMoney(margen / restantes)}</b> al día.`
                    : `Ya has gastado lo que sueles gastar en un mes entero, y quedan ${restantes} ${restantes === 1 ? 'día' : 'días'}.`);
            }
            [...r.categorias].sort((a, b) => b.diff - a.diff).slice(0, 2).forEach(c => {
                if (c.diff > 0) frases.push(`En <b>${escapeHtml(nombreCat(c.cat))}</b> llevas ${financeMoney(c.ahora)}; a estas alturas lo normal es ${financeMoney(c.normal)}.`);
            });
            const ahorro = [...r.categorias].sort((a, b) => a.diff - b.diff)[0];
            if (ahorro && ahorro.diff < 0) frases.push(`En <b>${escapeHtml(nombreCat(ahorro.cat))}</b> vas ${financeMoney(-ahorro.diff)} por debajo de lo habitual.`);
            if (r.otrosAnios) frases.push(`En ${r.mesNombre} de ${r.otrosAnios.n === 1 ? 'otro año' : 'otros años'}, a día ${r.dia} solías llevar <b>${financeMoney(r.otrosAnios.valor)}</b>.`);
            return `
                <div class="ritmo-veredicto ${r.nivel}">${veredictos[r.nivel]}</div>
                <div class="ritmo-frase">A día ${r.dia} sueles llevar <b>${financeMoney(r.hoyFranja.medio)}</b> de gasto del día a día. Este mes llevas <b>${financeMoney(r.llevas)}</b>.</div>
                ${r.fueraMes && (r.fueraMes.viaje || r.fueraMes.fijos || r.fueraMes.otros) ? `<div class="ritmo-frase ritmo-fuera">El día a día no cuenta ${[r.fueraMes.viaje && `<b>${financeMoney(r.fueraMes.viaje)}</b> de viajes`, r.fueraMes.fijos && `<b>${financeMoney(r.fueraMes.fijos)}</b> de suscripciones y gastos fijos`, r.fueraMes.otros && `<b>${financeMoney(r.fueraMes.otros)}</b> de inversión y coleccionables`].filter(Boolean).join(", ")}, ni los traspasos entre tus cuentas. Por eso es menos que el gasto total del mes.</div>` : ""}
                ${renderRitmoGrafica(r)}
                <div class="ritmo-leyenda"><span><i class="ritmo-l-actual"></i>este mes.</span><span><i class="ritmo-l-medio"></i>lo normal.</span><span><i class="ritmo-l-franja"></i>tus meses habituales.</span></div>
                <div class="ritmo-cifras">
                    <div><span>llevas.</span><b>${financeMoney(r.llevas)}</b></div>
                    <div><span>lo normal hoy.</span><b>${financeMoney(r.hoyFranja.medio)}</b></div>
                    <div><span>a fin de mes.</span><b>${financeMoney(r.proyeccion)}</b></div>
                </div>
                ${frases.map(f => `<div class="ritmo-linea">${f}</div>`).join('')}
                <div class="finance-modal-note" style="margin-top:14px">Aprendido de tus últimos ${r.meses} meses. Sin suscripciones, gastos fijos, inversiones, coleccionables ni ajustes de saldo; lo devuelto resta.</div>`;
        }

        // ============================================================
        //  RITMO — históricos. Extractos antiguos del banco que solo sirven
        //  para que el ritmo conozca al usuario: no entran en movimientos ni
        //  tocan ningún saldo. Se guardan ya resumidos (céntimos por
        //  categoría y día de cada mes) y no las filas: años de extractos
        //  pesarían en cada guardado. Por eso un mes se sustituye entero al
        //  volver a subir un extracto que lo cubre, en vez de mezclarse, y
        //  solo se guardan meses que el extracto cubre completos. Cada banco
        //  (fuente) va aparte: Ibercaja y Revolut del mismo mes se suman.
        // ============================================================
        function historicoMeses() {
            const fuentes = financePro.historico?.fuentes || {};
            const meses = {};
            Object.values(fuentes).forEach(f => Object.entries(f.meses || {}).forEach(([m, datos]) => {
                const mes = meses[m] = meses[m] || { n: 0, lista: [] };
                mes.n += datos.n || 0;
                Object.entries(datos.c || {}).forEach(([cat, dias]) => Object.entries(dias).forEach(([d, cent]) => {
                    mes.lista.push({ d: Number(d), cat, valor: cent / 100 });
                }));
            }));
            return meses;
        }

        function historicoAdivinarColumnas(cabecera) {
            const h = cabecera.map(x => financeProNormalizar(x).trim());
            const buscar = (...claves) => {
                for (const c of claves) { const i = h.findIndex(x => x.includes(c)); if (i >= 0) return i; }
                return -1;
            };
            return {
                date: buscar('started', 'fecha operacion', 'fecha de operacion', 'fecha', 'date'),
                amount: buscar('amount', 'importe', 'cantidad'),
                description: buscar('description', 'descripcion', 'concepto', 'detalle', 'movimiento'),
                status: buscar('state', 'estado')
            };
        }

        function renderRitmoHistoricos() {
            const fuentes = Object.entries(financePro.historico?.fuentes || {});
            const etiqueta = m => FINANCE_PRO_MONTH_NAMES[Number(m.slice(5, 7)) - 1].slice(0, 3).toLowerCase() + ' ' + m.slice(0, 4);
            return `
                <div class="finance-kicker" style="margin:22px 0 6px">históricos.</div>
                ${fuentes.map(([id, f]) => {
                    const meses = Object.keys(f.meses || {}).sort();
                    return `<div class="ritmo-historico-fila">
                        <span><b>${escapeHtml(f.nombre.toLowerCase())}.</b> ${meses.length} ${meses.length === 1 ? 'mes' : 'meses'}${meses.length ? `, ${etiqueta(meses[0])} – ${etiqueta(meses[meses.length - 1])}` : ''}</span>
                        <button class="doc-action-delete-btn" title="Olvidar estos históricos" onclick="borrarHistoricoFuente('${id}')"><i class='ico ico-x' aria-hidden=true></i></button>
                    </div>`;
                }).join('')}
                <button class="finance-oneoff-btn" onclick="openHistoricosModal()">añadir históricos.</button>
                <div class="finance-modal-note" style="margin-top:8px">Extractos antiguos de tu banco para que bitácora aprenda tu ritmo. No se añaden a tus movimientos ni cambian ningún saldo.</div>`;
        }

        function openHistoricosModal() {
            const nombres = FINANCE_PRO_ACCOUNT_KEYS.map(k => financePro.accounts[k]?.name).filter(Boolean);
            window._historico = { archivos: [], fuente: financePro.historico?.ultimaFuente || nombres[0] || 'banco' };
            showModal(`
                <div class="modal-title">añadir históricos.</div>
                <div class="finance-modal-note" style="margin-bottom:12px">Sube los CSV de extractos antiguos (puedes elegir varios a la vez) o pega uno. Solo se usan para conocer tu ritmo de gasto: tus movimientos y saldos no cambian.</div>
                <div class="modal-label">banco:</div>
                <input class="modal-input" list="historico-bancos" value="${escapeHtml(window._historico.fuente)}" oninput="window._historico.fuente=this.value">
                <datalist id="historico-bancos">${nombres.map(n => `<option value="${escapeHtml(n)}">`).join('')}</datalist>
                <input type="file" class="modal-input" accept=".csv,text/csv" multiple onchange="historicoLeerArchivos(event)">
                <button class="finance-oneoff-btn finance-import-pegar" onclick="historicoPegar()">pegar extracto.</button>
                <div id="historico-body"></div>
            `);
        }

        function historicoLeerArchivos(event) {
            const files = [...(event.target.files || [])];
            if (!files.length) return;
            Promise.all(files.map(f => f.text())).then(textos => historicoCargar(textos));
        }

        async function historicoPegar() {
            let texto = '';
            try { texto = await navigator.clipboard.readText(); } catch (e) { texto = ''; }
            if (historicoCargar([texto], true)) return;
            document.getElementById('historico-body').innerHTML = `
                <div class="modal-label">pega aquí el extracto:</div>
                <textarea class="modal-input" rows="6" oninput="historicoCargar([this.value], true)"></textarea>`;
        }

        function historicoCargar(textos, silencioso) {
            const archivos = textos.map(t => financeProParseCSV(String(t || '').trim())).filter(rows => rows.length >= 2 && rows[0].length >= 3);
            if (!archivos.length) { if (!silencioso) showToast('No se ha podido leer ningún extracto', true); return false; }
            window._historico.archivos = archivos;
            window._historico.map = historicoAdivinarColumnas(archivos[0][0]);
            historicoPintarColumnas();
            return true;
        }

        function historicoPintarColumnas() {
            const h = window._historico;
            const cab = h.archivos[0][0];
            const opciones = (sel, opcional) => `${opcional ? `<option value="-1" ${sel === -1 ? 'selected' : ''}>No tengo esta columna</option>` : ''}${cab.map((c, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${escapeHtml(String(c).slice(0, 24))}</option>`).join('')}`;
            const filas = h.archivos.reduce((s, a) => s + a.length - 1, 0);
            document.getElementById('historico-body').innerHTML = `
                <div class="finance-modal-note" style="margin:12px 0 8px">${h.archivos.length} ${h.archivos.length === 1 ? 'extracto' : 'extractos'}, ${filas} filas. Comprueba las columnas (se usan las mismas para todos).</div>
                <div class="finance-correction-inputs">
                    <div><div class="modal-label">fecha</div><select class="modal-input" onchange="window._historico.map.date=Number(this.value)">${opciones(h.map.date)}</select></div>
                    <div><div class="modal-label">importe</div><select class="modal-input" onchange="window._historico.map.amount=Number(this.value)">${opciones(h.map.amount)}</select></div>
                </div>
                <div class="finance-correction-inputs">
                    <div><div class="modal-label">concepto</div><select class="modal-input" onchange="window._historico.map.description=Number(this.value)">${opciones(h.map.description)}</select></div>
                    <div><div class="modal-label">estado</div><select class="modal-input" onchange="window._historico.map.status=Number(this.value)">${opciones(h.map.status, true)}</select></div>
                </div>
                <button class="btn-modal-primary" style="margin-top:12px" onclick="historicoAprender()">aprender de ${h.archivos.length === 1 ? 'este extracto' : 'estos extractos'}.</button>`;
        }

        // Qué cuenta como gasto del día a día, con el mismo criterio que los
        // movimientos de Bitácora: la categoría se adivina con lo aprendido
        // (financeProCategoriaAprendida) y se descartan inversiones,
        // coleccionables y ajustes; suscripciones y gastos fijos por su
        // concepto del banco o su nombre; traspasos entre cuentas propias
        // por las reglas de importación y los conceptos típicos (recargas,
        // traspasos, cajero: el efectivo retirado se gasta después, y
        // contarlo al sacarlo lo contaría dos veces si luego se anota).
        function historicoClasificar(fecha, valor, concepto, indice, gastoPorNombre) {
            const texto = financeProNormalizar(concepto);
            if ((financePro.rules || []).some(rl => rl.enabled && rl.matchText && texto.includes(financeProNormalizar(rl.matchText)))) return null;
            if (/top.?up|recarga|traspaso|transferencia (a|entre) (mis|cuentas)|cajero|atm |retirada|reintegro/.test(texto)) return null;
            const recurrente = entries.some(e => (e.type === 'subscription' || e.type === 'fixed_expense')
                && financeProCoincideNombre({ recurringEntryId: e.id, note: e.title }, texto)
                && Math.abs((Number(e.amount) || 0) - Math.abs(valor)) <= Math.max(1, (Number(e.amount) || 0) * 0.15));
            if (recurrente) return null;
            const esAjuste = id => financeProNormalizar(financeProCategoryById(id)?.name).trim() === 'ajuste de saldo';
            if (valor < 0) {
                const cat = financeProCategoriaAprendida({ type: 'expense', note: concepto, amount: -valor, date: fecha }, indice) || '';
                if (RITMO_FUERA.includes(cat) || (cat && esAjuste(cat))) return null;
                return { cat, valor: -valor };
            }
            const ingreso = financeProCategoriaAprendida({ type: 'income', note: concepto, amount: valor, date: fecha }, indice);
            const gasto = ingreso && gastoPorNombre[(financeProCategoryById(ingreso)?.name || '').toLowerCase()];
            if (!gasto || RITMO_FUERA.includes(gasto) || esAjuste(gasto)) return null;
            return { cat: gasto, valor: -valor };
        }

        async function historicoAprender() {
            const h = window._historico;
            const m = h.map;
            const fuenteNombre = (h.fuente || '').trim() || 'banco';
            if (m.date < 0 || m.amount < 0) { showToast('Elige las columnas de fecha e importe', true); return; }
            const indice = financeProIndiceCategorias();
            const gastoPorNombre = {};
            financePro.categories.filter(c => c.type === 'expense').forEach(c => { gastoPorNombre[c.name.toLowerCase()] = c.id; });
            const nuevos = {};
            let contados = 0, fuera = 0, mesesIncompletos = 0;
            h.archivos.forEach(rows => {
                const filas = [];
                rows.slice(1).forEach(r => {
                    const estado = m.status >= 0 ? String(r[m.status] || '').toLowerCase() : '';
                    if (/pending|pendiente|revert|declin|fail|cancel|rechaz|anulad/.test(estado)) return;
                    const fecha = financeProParseDate(r[m.date]);
                    const valor = financeProParseEuroAmount(r[m.amount]);
                    if (!fecha || !Number.isFinite(valor) || valor === 0) return;
                    filas.push({ fecha, valor, concepto: String(r[m.description] ?? '').trim() });
                });
                if (!filas.length) return;
                const fechas = filas.map(f => f.fecha).sort();
                const desde = fechas[0], hasta = fechas[fechas.length - 1];
                const porMes = {};
                filas.forEach(f => {
                    const mes = f.fecha.slice(0, 7);
                    const datos = porMes[mes] = porMes[mes] || { n: 0, c: {} };
                    const cl = historicoClasificar(f.fecha, f.valor, f.concepto, indice, gastoPorNombre);
                    if (!cl) { fuera++; return; }
                    const d = Number(f.fecha.slice(8, 10));
                    const dias = datos.c[cl.cat] = datos.c[cl.cat] || {};
                    dias[d] = (dias[d] || 0) + Math.round(cl.valor * 100);
                    datos.n++;
                    contados++;
                });
                // Solo meses que el extracto cubre enteros (con 3 días de
                // margen en los bordes, por si el primero o el último no
                // tuvieron movimientos).
                Object.entries(porMes).forEach(([mes, datos]) => {
                    const [y, mm] = mes.split('-').map(Number);
                    const ultimo = new Date(y, mm, 0).getDate();
                    const empieza = desde <= `${mes}-04`;
                    const acaba = hasta >= `${mes}-${String(ultimo - 3).padStart(2, '0')}`;
                    if (empieza && acaba && mes < financeMonthKey()) nuevos[mes] = datos;
                    else mesesIncompletos++;
                });
            });
            const meses = Object.keys(nuevos).sort();
            if (!meses.length) { showToast('Ningún mes completo en estos extractos', true); return; }
            financePro.historico = financePro.historico || { fuentes: {} };
            financePro.historico.fuentes = financePro.historico.fuentes || {};
            const id = 'h_' + financeProNormalizar(fuenteNombre).replace(/[^a-z0-9]+/g, '_');
            const fuente = financePro.historico.fuentes[id] = financePro.historico.fuentes[id] || { nombre: fuenteNombre, meses: {} };
            Object.assign(fuente.meses, nuevos);
            financePro.historico.ultimaFuente = fuenteNombre;
            const etiqueta = mk => financeMonthLabel(mk).toLowerCase();
            document.getElementById('historico-body').innerHTML = `
                <div class="ritmo-veredicto" style="font-size:17px;margin-top:14px">aprendido.</div>
                <div class="ritmo-frase">${meses.length} ${meses.length === 1 ? 'mes' : 'meses'} de ${escapeHtml(fuenteNombre)}, de ${etiqueta(meses[0])} a ${etiqueta(meses[meses.length - 1])}: ${contados} gastos del día a día. ${fuera} movimientos quedan fuera (traspasos, inversiones, suscripciones, ingresos)${mesesIncompletos ? ` y ${mesesIncompletos} ${mesesIncompletos === 1 ? 'mes incompleto' : 'meses incompletos'} en los bordes del extracto` : ''}.</div>
                <button class="btn-modal-primary" onclick="openFinanceRitmoModal()">ver mi ritmo.</button>`;
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function borrarHistoricoFuente(id) {
            const f = financePro.historico?.fuentes?.[id];
            if (!f || !confirm(`¿Olvidar los históricos de ${f.nombre}? Tus movimientos no cambian.`)) return;
            delete financePro.historico.fuentes[id];
            openFinanceRitmoModal();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openFinanceRitmoModal() {
            const trend = financeGoalTrendSignal();
            showModal(`
                <div class="modal-title">ritmo.</div>
                ${renderRitmoBody()}
                ${trend ? `<div class="finance-kicker" style="margin:20px 0 6px">previsión.</div><div class="finance-empty-line">${escapeHtml(trend.text)}</div>` : ''}
                ${renderRitmoHistoricos()}
            `);
        }

        // Resto en desuso desde el rediseño: esto abría la tarjeta
        // resumen (renderInvestmentPanel) metida dentro de otro modal —
        // un doble popup sin sentido. Va directa al modal real.
        function openFinanceLargoPlazoModal() {
            openLongTermModal();
        }

        function openFinanceMetasModal() {
            showModal(renderFinanceSavingsGoals());
        }

        // TARJETA BITACORA: el molde único (nombre arriba a la izquierda,
        // icono SIEMPRE abajo a la derecha, cifra abajo a la izquierda del
        // icono cuando la hay, sólido/contorno alternando). "Planificación
        // a futuro" y "Otros ahorros" ya no van separados (uno inline, el
        // otro en un popup aparte) — las 7 tarjetas fijas + las cuentas
        // propias viven todas juntas en una sola fila con scroll horizontal.
        function renderFinanceBitacoraCard(label, iconSvg, variant, onClick, value, negative) {
            const hasValue = value !== undefined;
            const valueText = negative ? `(${financeMoney(value)})` : financeMoney(value);
            return `
                <button class="finance-plan-btn finance-plan-btn-${variant} finance-bitacora-card ${hasValue ? 'finance-bitacora-card-with-value' : ''}" ${onClick ? `onclick="${onClick}"` : ''}>
                    <div class="finance-plan-btn-label">${escapeHtml(label)}</div>
                    <div class="finance-bitacora-card-foot">
                        ${hasValue ? `<div class="finance-bitacora-card-value">${valueText}</div>` : ''}
                        <div class="finance-plan-btn-icon">${iconSvg}</div>
                    </div>
                </button>`;
        }

        function renderFinancePlanRow() {
            const recurring = financeRecurringTotal();
            const cards = [
                renderFinanceBitacoraCard('ritmo.', FINANCE_ICON_PULSE, 'solid', 'openFinanceRitmoModal()'),
                renderFinanceBitacoraCard('largo plazo.', FINANCE_ICON_GROWTH_BARS, 'outline', 'openFinanceLargoPlazoModal()'),
                renderFinanceBitacoraCard('metas.', FINANCE_ICON_CROSSHAIR, 'solid', 'openFinanceMetasModal()'),
                renderFinanceBitacoraCard('fondo de emergencia.', FINANCE_ICON_ASTERISK_BOLD, 'outline', 'openMonthlyFinanceUpdate()', Number(financeProfile.emergency || 0)),
                renderFinanceBitacoraCard('vacaciones.', FINANCE_ICON_FAN_BOLD, 'solid', 'openMonthlyFinanceUpdate()', Number(financeProfile.vacation || 0)),
                renderFinanceBitacoraCard('recurrentes.', FINANCE_ICON_REFRESH_BOLD, 'outline', 'openRecurringExpensesModal()', recurring, true),
                collectibles.length ? renderFinanceBitacoraCard('coleccionables.', FINANCE_ICON_CLUSTER_BOLD, 'solid', "closeModal();switchView('collectibles')", financeCollectiblesTotal()) : ''
            ];
            const customCards = (financeProfile.customAccounts || []).map((a, i) =>
                renderFinanceBitacoraCard(`${a.name.toLowerCase()}.`, FINANCE_ICON_CARD, i % 2 === 0 ? 'outline' : 'solid', `openCustomAccountEditor('${a.id}')`, a.balance)
            );
            return `<div class="finance-bitacora-row">
                ${cards.join('') + customCards.join('')}
                <button class="finance-plan-btn finance-plan-btn-outline finance-bitacora-add" onclick="openFinanceAccountsConfig()" title="Cuenta propia">+</button>
            </div>`;
        }

        function mdEscape(s) {
            return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
        }
        function mdTable(headers, rows) {
            if (!rows.length) return '_Sin datos._\n';
            return `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n` +
                rows.map(r => `| ${r.map(mdEscape).join(' | ')} |`).join('\n') + '\n';
        }

        // Exporta TODO lo que el usuario ha metido en Finanzas — cuentas,
        // categorías, reglas, movimientos, recurrentes, metas, histórico
        // mensual, y todo el apartado "largo plazo" (cuentas de inversión
        // y planificación de sueldo, grabada y en curso) — en Markdown:
        // un único documento de texto plano, fácil de leer tanto para un
        // humano como para pegárselo a una IA y pedirle que lo analice.
        function buildFinanceExportMarkdown() {
            const today = todayISO();
            const lines = [];
            lines.push(`# Finanzas en Bitácora`);
            lines.push(`Exportado el ${today}. Todas las cifras en euros salvo que se indique lo contrario.`);
            lines.push('');

            lines.push('## Patrimonio operativo');
            lines.push(mdTable(['Cuenta', 'Saldo', 'Objetivo'], [
                ['Tus cuentas', financeMoney(financeProTotalBalance()), financeMoney(financeProfile.cashTarget || 0)],
                ['Fondo de emergencia', financeMoney(financeProfile.emergency || 0), financeMoney(financeProfile.emergencyTarget || 0)],
                ['Reserva de vacaciones (fuera del patrimonio operativo)', financeMoney(financeProfile.vacation || 0), '—'],
                ['Inversión a largo plazo', financeMoney(financeProfile.invested || 0), financeMoney(financeProfile.investedTarget || 0)],
                ...(financeProfile.customAccounts || []).map(a => [mdEscape(a.name), financeMoney(a.balance || 0), '—'])
            ]));
            lines.push(`**Patrimonio operativo total**: ${financeMoney(financeCorePatrimony())}, **Objetivo total**: ${financeMoney(financeTargetTotal())}`);
            lines.push('');

            lines.push('## Cuentas (Finanzas PRO)');
            lines.push(mdTable(['Cuenta', 'Saldo inicial', 'Saldo actual'],
                FINANCE_PRO_ACCOUNT_KEYS.map(k => [financePro.accounts[k]?.name || k, financeMoney(financePro.accounts[k]?.balance0 || 0), financeMoney(financeProAccountBalance(k))])
            ));
            lines.push(`**Total cuentas PRO**: ${financeMoney(financeProTotalBalance())}`);
            lines.push('');

            const histP = financePro.historialPresupuestos || {};
            if (Object.keys(histP).length) {
                lines.push('## Presupuestos, mes a mes');
                lines.push(mdTable(['Mes', 'Categoría', 'Presupuesto', 'Gastado', 'Diferencia'], Object.keys(histP).sort().flatMap(m => Object.values(histP[m].categorias || {}).map(c => [financeMonthLabel(m), c.nombre, financeMoney(c.limite), financeMoney(c.gastado), financeMoney(c.gastado - c.limite)]))));
                lines.push('');
            }

            lines.push('## Categorías');
            const cats = financePro.categories || [];
            lines.push('### Gasto');
            lines.push(mdTable(['Nombre'], cats.filter(c => c.type === 'expense').map(c => [c.name])));
            lines.push('### Ingreso');
            lines.push(mdTable(['Nombre'], cats.filter(c => c.type === 'income').map(c => [c.name])));
            lines.push('');

            const rules = financePro.rules || [];
            if (rules.length) {
                lines.push('## Reglas de traspaso');
                lines.push(mdTable(['Texto que busca', 'Cuenta destino', 'Activa'], rules.map(r => [r.matchText, financePro.accounts[r.otherAccount]?.name || r.otherAccount, r.enabled ? 'sí' : 'no'])));
                lines.push('');
            }

            lines.push('## Movimientos');
            const txs = [...(financePro.transactions || [])].sort(financeProCompararMov);
            lines.push(`${txs.length} movimientos en total.`);
            lines.push(mdTable(['Fecha', 'Cuenta', 'Tipo', 'Categoría / destino', 'Importe', 'Nota'], txs.map(t => [
                t.date,
                financePro.accounts[t.account]?.name || t.account,
                t.type === 'income' ? 'Ingreso' : t.type === 'expense' ? 'Gasto' : 'Traspaso',
                t.type === 'transfer' ? (financePro.accounts[t.transferTo]?.name || t.transferTo) : financeProNeutro(t) ? financeProEtiquetaNeutro(t).replace(/^./, c => c.toUpperCase()).replace(/\.$/, '') : (financeProCategoryById(t.category)?.name || '—'),
                financeMoney(t.amount || 0),
                t.note || ''
            ])));
            lines.push('');

            const recurring = entries.filter(e => e.type === 'subscription' || e.type === 'fixed_expense');
            if (recurring.length) {
                lines.push('## Gastos recurrentes y suscripciones');
                lines.push(mdTable(['Nombre', 'Tipo', 'Importe/mes', 'Día de renovación', 'Activo'], recurring.map(e => [
                    e.title, e.type === 'subscription' ? 'Suscripción' : 'Gasto fijo', financeMoney(e.amount || 0), e.renewalDay || '—', e.active === false ? 'no' : 'sí'
                ])));
                lines.push('');
            }

            const goals = financeProfile.savingsGoals || [];
            if (goals.length) {
                lines.push('## Metas de ahorro');
                lines.push(mdTable(['Nombre', 'Actual', 'Objetivo', '%'], goals.map(g => [g.name, financeMoney(g.current || 0), financeMoney(g.target || 0), g.target > 0 ? Math.round((g.current || 0) / g.target * 100) + '%' : '—'])));
                lines.push('');
            }

            const hist = (financeProfile.history || []).slice().sort((a, b) => a.month.localeCompare(b.month));
            if (hist.length) {
                lines.push('## Histórico mensual de patrimonio');
                lines.push(mdTable(['Mes', 'Efectivo', 'Emergencia', 'Inversión', 'Total'], hist.map(h => [financeMonthLabel(h.month), financeMoney(h.cash || 0), financeMoney(h.emergency || 0), financeMoney(h.invested || 0), financeMoney(h.total || 0)])));
                lines.push('');
            }

            lines.push('## Largo plazo, previsión de sueldo (perfil general)');
            const fc = financeProfile.forecastProfile || {};
            lines.push(mdTable(['Campo', 'Valor'], [
                ['Sueldo actual', financeMoney(fc.salary || 0)],
                ['Meses de contrato', fc.contractMonths || '—'],
                ['Plan mensual, emergencia', financeMoney(fc.emergencyMonthlyPlan || 0)],
                ['Plan mensual, vacaciones', financeMoney(fc.vacationMonthlyPlan || 0)],
                ['Plan mensual, inversión', financeMoney(fc.investMonthlyPlan || 0)]
            ]));
            lines.push('');

            const invAccounts = financeProfile.investmentAccounts || [];
            if (invAccounts.length) {
                lines.push('## Largo plazo, cuentas de inversión');
                invAccounts.forEach(acc => {
                    lines.push(`### ${mdEscape(acc.name)}${acc.notes ? ', ' + mdEscape(acc.notes) : ''}`);
                    lines.push(`Aportado: ${financeMoney(investmentAccountInvested(acc))}, Valor actual: ${financeMoney(investmentAccountValue(acc))}`);
                    const contribs = (acc.contributions || []).slice().sort((a, b) => a.month.localeCompare(b.month));
                    lines.push(mdTable(['Mes', 'Aportación', 'Valor registrado'], contribs.map(c => [financeMonthLabel(c.month), financeMoney(c.amount || 0), c.value !== undefined ? financeMoney(c.value) : '—'])));
                });
                lines.push('');
            }

            const budgetHist = (financeProfile.budgetHistory || []).slice().sort((a, b) => a.month.localeCompare(b.month));
            if (budgetHist.length) {
                lines.push('## Largo plazo, planificación de sueldo (meses grabados)');
                budgetHist.forEach(h => {
                    lines.push(`### ${financeMonthLabel(h.month)}`);
                    lines.push(`Sueldo: ${financeMoney(h.salary || 0)}${h.contributions ? `, Aportaciones: ${financeMoney(h.contributions)}` : ''}${h.saved ? `, Ahorrado (sin asignar): ${financeMoney(h.saved)}` : ''}`);
                    lines.push(mdTable(['Casilla', 'Previsto', 'Real'], h.allocations.map(a => [a.label || '(sin nombre)', financeMoney(a.amount || 0), h.actuals[a.id] != null ? financeMoney(h.actuals[a.id]) : '—'])));
                });
                lines.push('');
            }

            const plans = financeProfile.budgetPlans || {};
            const pendingMonths = Object.keys(plans).filter(m => (plans[m].salary || plans[m].contributions || (plans[m].allocations || []).length) && !budgetHist.some(h => h.month === m)).sort();
            if (pendingMonths.length) {
                lines.push('## Largo plazo, planificación en curso (todavía sin grabar)');
                pendingMonths.forEach(m => {
                    const p = plans[m];
                    lines.push(`### ${financeMonthLabel(m)}`);
                    lines.push(`Sueldo previsto: ${financeMoney(p.salary || 0)}${p.contributions ? `, Aportaciones previstas: ${financeMoney(p.contributions)}` : ''}`);
                    lines.push(mdTable(['Casilla', 'Previsto'], (p.allocations || []).map(a => [a.label || '(sin nombre)', financeMoney(a.amount || 0)])));
                });
                lines.push('');
            }

            return lines.join('\n');
        }

        function exportFinanceMarkdown() {
            const md = buildFinanceExportMarkdown();
            const blob = new Blob([md], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `bitacora_finanzas_${todayISO()}.md`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Finanzas exportadas');
        }

        // Finanzas en tres pestañas. Al cambiar se repinta solo el panel (no la vista entera) y se conserva el sitio
        // de la barra de pestañas en pantalla, para que no salte el scroll al pasar a una más corta o más larga.
        let financeTab = (() => { try { return ['resumen', 'movimientos', 'planificacion'].includes(localStorage.getItem('bitacora-fin-pestana')) ? localStorage.getItem('bitacora-fin-pestana') : 'resumen'; } catch (e) { return 'resumen'; } })();
        function cambiarPestanaFinanzas(tab) {
            if (tab === financeTab) return;
            financeTab = tab;
            try { localStorage.setItem('bitacora-fin-pestana', tab); } catch (e) {}
            const barra = document.querySelector('.finance-dashboard .fin-pestanas');
            const antes = barra ? barra.getBoundingClientRect().top : null;
            const cuerpo = document.getElementById('finance-tab-cuerpo');
            if (!cuerpo) { render(); return; }
            cuerpo.innerHTML = renderFinanceTabCuerpo();
            document.querySelectorAll('.finance-dashboard .fin-pestanas button').forEach(b => { b.classList.toggle('active', b.dataset.tab === tab); b.setAttribute('aria-selected', b.dataset.tab === tab); });
            const ahora = document.querySelector('.finance-dashboard .fin-pestanas')?.getBoundingClientRect().top;
            if (antes != null && ahora != null && Math.abs(ahora - antes) > 1) (document.getElementById('content') || document.scrollingElement).scrollBy?.(0, ahora - antes);
            if (tab === 'resumen') requestAnimationFrame(animateFinanceProChartPanel);
        }

        function renderFinanceTabCuerpo() {
            if (financeTab === 'movimientos') return renderFinanceProTxSection();
            if (financeTab === 'planificacion') return `
                ${renderFinanceProBudgetsPanel()}
                ${renderFinancePlanRow()}
                <div class="finance-dashboard-foot-actions" style="margin-top:20px">
                    <button class="finance-oneoff-btn" onclick="openFinanceHistoryCorrectionModal()"><i class='ico ico-lapiz' aria-hidden=true></i> corregir registros.</button>
                </div>`;
            return `
                ${renderFinanceProChartPanel()}
                ${renderFinanceProReviewBanner()}
                ${renderAvisoPresupuestos()}
                ${renderSuscripcionesDetectadas()}
                ${renderFinanceNetworthCard()}
                <div class="finance-section-head" style="margin-top:20px"><div class="finance-kicker">cuentas.</div></div>
                <div class="finance-pro-accounts-grid">${FINANCE_PRO_ACCOUNT_KEYS.map(k => renderFinanceProAccountCard(k)).join('')}</div>`;
        }

        function renderFinanceProDashboard() {
            ensureCurrentMonthHistory();
            if (actualizarHistorialPresupuestos()) setTimeout(() => saveData().catch(e => console.error(e)), 0);
            const blurToggleBtn = `<button class="finance-blur-toggle" title="${blurFinances ? 'Mostrar cifras' : 'Ocultar cifras'}" onclick="toggleBlurFinances()">${blurFinances ? FINANCE_EYE_OFF_ICON : FINANCE_EYE_ICON}</button>`;
            return `
            <div class="finance-dashboard ${blurFinances ? 'blurred' : ''}">
                <div class="finance-toolbar-row">
                    <div class="finance-pro-settings-links">
                        <button onclick="openFinanceProAccountsSettings()"><i class='ico ico-lapiz' aria-hidden=true></i> nombres y saldo inicial.</button>
                        <button onclick="openFinanceProCategoriesModal()">categorías.</button>
                        <button onclick="openFinanceProImportModal()">${FINANCE_ICON_UPLOAD} importar.</button>
                        <button onclick="openDeshacerImportacion()"><i class='ico ico-repetir' aria-hidden=true></i> deshacer importación.</button>
                        <button onclick="exportFinanceMarkdown()"><i class='ico ico-bajar' aria-hidden=true></i> exportar.</button>
                        <button onclick="openFinanceProRulesModal()">${FINANCE_ICON_REPEAT} reglas.</button>
                    </div>
                    ${blurToggleBtn}
                </div>
                <div class="vista-seg fin-pestanas" role="tablist" aria-label="Finanzas">
                    ${[['resumen', 'resumen.'], ['movimientos', 'movimientos.'], ['planificacion', 'planificación.']].map(([k, t]) => `<button role="tab" data-tab="${k}" class="${financeTab === k ? 'active' : ''}" aria-selected="${financeTab === k}" onclick="cambiarPestanaFinanzas('${k}')">${t}</button>`).join('')}
                </div>
                <div id="finance-tab-cuerpo">${renderFinanceTabCuerpo()}</div>
            </div>`;
        }

        // ============================================================
        //  FINANZAS PRO — cuentas (renombrar / saldo inicial)
        // ============================================================
        function openFinanceProAccountsSettings() {
            showModal(`
                <div class="modal-title">Cuentas PRO</div>
                <div class="finance-modal-note" style="margin-bottom:12px">El saldo inicial es el punto de partida de cada cuenta antes de tus movimientos registrados: útil si no vas a importar todo tu historial.</div>
                ${FINANCE_PRO_ACCOUNT_KEYS.map(k => `
                    <div class="modal-label">Nombre</div>
                    <input class="modal-input" id="pro-acc-name-${k}" value="${escapeHtml(financePro.accounts[k].name)}">
                    <div class="modal-label">Saldo inicial (€)</div>
                    <input class="modal-input" id="pro-acc-balance0-${k}" type="number" step="0.01" value="${Number(financePro.accounts[k].balance0 || 0)}" style="margin-bottom:16px">
                `).join('')}
                <button class="btn-modal-primary" onclick="saveFinanceProAccountsSettings()">guardar.</button>
                <button class="btn-secondary" style="margin-top:14px;color:#dc2626" onclick="resetFinancePro()">restablecer Finanzas PRO.</button>
            `);
        }

        // Borra todo el histórico de Finanzas PRO (cuentas, movimientos,
        // categorías personalizadas y presupuestos) y vuelve a los valores
        // de fábrica — para empezar de cero sin desactivar el modo PRO.
        async function resetFinancePro() {
            if (!confirm('¿Restablecer Finanzas PRO?\n\nSe borrarán todos los movimientos, las categorías personalizadas, los presupuestos, las reglas de traspaso y los saldos de las 3 cuentas. Esta acción no se puede deshacer.')) return;
            financePro.accounts = {
                efectivo: { name: 'Efectivo', balance0: 0 },
                bancos: { name: 'Bancos', balance0: 0 },
                online: { name: 'Online', balance0: 0 }
            };
            financePro.categories = financeProDefaultCategories();
            financePro.transactions = [];
            financePro.categoryBudgets = {};
            financePro.rules = [];
            closeModal();
            render();
            try { await saveData(); showToast('Finanzas PRO restablecido'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function saveFinanceProAccountsSettings() {
            FINANCE_PRO_ACCOUNT_KEYS.forEach(k => {
                const name = document.getElementById('pro-acc-name-' + k)?.value.trim();
                if (name) financePro.accounts[k].name = name;
                financePro.accounts[k].balance0 = Number(document.getElementById('pro-acc-balance0-' + k)?.value) || 0;
            });
            closeModal();
            render();
            try { await saveData(); showToast('Cuentas actualizadas'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // ============================================================
        //  FINANZAS PRO — registro rápido (móvil) y ajuste posterior
        // ============================================================
        // Pensado para registrar un movimiento en el móvil en el mínimo de
        // toques posible: importe + tocar la cuenta = guardado al instante,
        // sin categoría. Queda marcado "needsReview" y aparece en el aviso
        // "Ajustar movimientos" para completarlo con calma luego (categoría,
        // y la cuenta si hiciera falta corregirla).
        function openFinanceProQuickCaptureModal() {
            window._financeProQuickDraft = { type: 'expense', amount: '' };
            showModal(`
                <div class="modal-title">Registro rápido</div>
                <div class="finance-modal-note" style="margin-bottom:10px">Escribe el importe y toca la cuenta: se guarda al instante sin categoría. Lo ajustas luego desde "Ajustar movimientos".</div>
                <div id="finance-quick-capture-body">${renderFinanceProQuickCaptureBody()}</div>
            `);
        }

        function renderFinanceProQuickCaptureBody() {
            const d = window._financeProQuickDraft;
            return `
                <div class="finance-pro-type-tabs">
                    <button class="${d.type === 'expense' ? 'active' : ''}" onclick="financeProQuickSet('type','expense')">gasto.</button>
                    <button class="${d.type === 'income' ? 'active' : ''}" onclick="financeProQuickSet('type','income')">ingreso.</button>
                </div>
                <input class="modal-input finance-quick-amount-input" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${escapeHtml(String(d.amount))}" oninput="financeProQuickSet('amount', this.value)" autofocus>
                <div class="modal-label" style="margin-top:12px">Toca la cuenta para guardar</div>
                <div class="finance-quick-account-row">
                    ${FINANCE_PRO_ACCOUNT_KEYS.map(k => `<button class="finance-quick-account-btn" onclick="financeProQuickSave('${k}')">${FINANCE_PRO_ACCOUNT_META[k].icon}<span>${escapeHtml(financePro.accounts[k].name)}</span></button>`).join('')}
                </div>
            `;
        }

        function financeProQuickSet(key, value) {
            window._financeProQuickDraft[key] = value;
            if (key === 'type') document.getElementById('finance-quick-capture-body').innerHTML = renderFinanceProQuickCaptureBody();
        }

        async function financeProQuickSave(account) {
            const d = window._financeProQuickDraft;
            const amount = Math.abs(financeProParseEuroAmount(d.amount));
            if (!(amount > 0)) { showToast('Introduce un importe válido', true); return; }
            financePro.transactions.push({
                id: 'ptx_q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                date: todayISO(), hora: financeProHoraAhora(todayISO()),
                account, type: d.type, amount, needsReview: true, manual: true
            });
            window._financeProQuickDraft = null;
            closeModal();
            render();
            try { await saveData(); showToast('Guardado, ajústalo luego en «Ajustar movimientos»'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function financeProPendingReviewCount() {
            return financePro.transactions.filter(t => t.needsReview).length;
        }

        function renderFinanceProReviewBanner() {
            const pending = financeProPendingReviewCount();
            if (!pending) return '';
            return `<div class="finance-sync-warning finance-review-banner" onclick="openFinanceProReviewModal()" role="button" tabindex="0">
                <div class="finance-metric-icon fin-blue finance-pro-tx-icon">${FINANCE_ICON_SWAP}</div>
                <div>
                    <strong>${pending} movimiento${pending === 1 ? '' : 's'} rápido${pending === 1 ? '' : 's'} por ajustar</strong>
                    <span>Toca para ponerles categoría y revisar la cuenta.</span>
                </div>
            </div>`;
        }

        function openFinanceProReviewModal() {
            showModal(`
                <div class="modal-title">Ajustar movimientos rápidos</div>
                <div class="finance-modal-note" style="margin-bottom:12px">Movimientos guardados desde el registro rápido. Ponles categoría (y corrige la cuenta si hace falta) para completarlos.</div>
                <div id="finance-pro-review-list">${renderFinanceProReviewList()}</div>
            `);
        }

        function renderFinanceProReviewList() {
            const pending = financePro.transactions.filter(t => t.needsReview).sort((a, b) => financeProCompararMov(b, a));
            if (!pending.length) return `<div class="finance-empty-state">No queda ningún movimiento rápido por ajustar.</div>`;
            return pending.map(t => {
                const cats = financePro.categories.filter(c => c.type === t.type);
                return `<div class="finance-review-row">
                    <div class="finance-review-row-head">
                        <span class="finance-pro-tx-amount ${t.type === 'income' ? 'finance-positive' : 'finance-negative'}">${t.type === 'income' ? '+' : '-'}${financeMoney(t.amount)}</span>
                        <span class="finance-metric-note">${financeDateLabelShort(t.date)}</span>
                    </div>
                    <select class="modal-input" style="margin:6px 0" onchange="financeProReviewSetAccount('${t.id}', this.value)">
                        ${FINANCE_PRO_ACCOUNT_KEYS.map(k => `<option value="${k}" ${t.account === k ? 'selected' : ''}>${escapeHtml(financePro.accounts[k].name)}</option>`).join('')}
                    </select>
                    <select class="modal-input" onchange="financeProReviewSetCategory('${t.id}', this.value)">
                        <option value="">Sin categoría</option>
                        ${cats.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
                    </select>
                </div>`;
            }).join('');
        }

        async function financeProReviewSetAccount(id, value) {
            const t = financePro.transactions.find(x => x.id === id);
            if (!t) return;
            t.account = value;
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function financeProReviewSetCategory(id, value) {
            const t = financePro.transactions.find(x => x.id === id);
            if (!t) return;
            t.category = value || undefined;
            t.needsReview = false;
            const list = document.getElementById('finance-pro-review-list');
            if (list) list.innerHTML = renderFinanceProReviewList();
            render();
            try { await saveData(); showToast('Movimiento ajustado'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // ============================================================
        //  FINANZAS PRO — lista de movimientos
        // ============================================================
        let financeProTxFilter = { account: '', month: '', year: '', search: '', category: '' };
        const FINANCE_PRO_MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

        function financeProTxFilterYears() {
            const years = new Set(financePro.transactions.map(t => t.date.slice(0, 4)));
            years.add(String(new Date().getFullYear()));
            return Array.from(years).sort().reverse();
        }

        // Los filtros solo se muestran dentro del popup de "todos los
        // movimientos" — ahí es donde financeProApplyTxFilter actualiza.
        function financeProApplyTxFilter(key, value) {
            financeProTxFilter[key] = value;
            const el = document.getElementById('finance-pro-tx-modal-list');
            if (el) el.innerHTML = renderFinanceProTransactionList(true);
        }

        // El listado del panel principal muestra solo los 5 movimientos más
        // recientes (sin filtros); "Ver todos los movimientos" abre un
        // popup con el listado completo y filtrable — así cerrar el popup
        // no obliga a hacer scroll de vuelta hasta arriba como pasaba con
        // el desplegable inline de antes.
        function renderFinanceProTxSection() {
            return `<div id="finance-pro-tx-section">
                <div class="finance-section-head" style="margin-top:24px">
                    <div class="finance-kicker">Movimientos</div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <button class="finance-oneoff-btn" onclick="openFinanceProProgramadosModal()">programar gastos.${financePro.programados?.length ? ` <span class="finance-programados-count">${financePro.programados.length}</span>` : ''}</button>
                        <button class="finance-oneoff-btn" onclick="openFinanceProDuplicatesModal()">buscar duplicados.</button>
                        <button class="finance-oneoff-btn" onclick="openFinanceProViajeModal()">gastos de un viaje.</button>
                        <button class="finance-oneoff-btn" onclick="openFinanceProQuickCaptureModal()">registro rápido.</button>
                        <button class="finance-oneoff-btn finance-chart-config-btn" onclick="openFinanceProTransactionModal()">+ Movimiento</button>
                        <button class="finance-oneoff-btn" onclick="openPuedoPermitirme()">¿me lo puedo permitir?</button>
                    </div>
                </div>
                <div id="finance-pro-tx-list">${renderFinanceProTransactionList(false)}</div>
                <button class="finance-oneoff-btn finance-pro-tx-expand-btn" onclick="openFinanceProAllTxModal()">▾ Ver todos los movimientos</button>
            </div>`;
        }

        function openFinanceProProgramadosModal() {
            const manana = new Date(); manana.setDate(manana.getDate() + 1);
            window._financeProgramadoDraft = { date: isoLocal(manana), amount: '', account: 'bancos', category: '', note: '' };
            showModal(`
                <div class="modal-title">programar gastos.</div>
                <div class="finance-modal-note" style="margin-bottom:12px">Se añaden solos a tus movimientos el día que indiques. Si después importas el extracto del banco, el cargo real sustituye al programado en vez de duplicarse.</div>
                <div id="finance-programados-body">${renderFinanceProProgramadosBody()}</div>
            `);
        }

        function renderFinanceProProgramadosBody() {
            const d = window._financeProgramadoDraft;
            const cats = financePro.categories.filter(c => c.type === 'expense');
            const pendientes = [...(financePro.programados || [])].sort((a, b) => a.date.localeCompare(b.date));
            const hoyDia = new Date().getDate();
            const suscripciones = entries
                .filter(e => e.type === 'subscription' && e.active !== false)
                .sort((a, b) => ((Number(a.renewalDay) || 1) - hoyDia + 31) % 31 - ((Number(b.renewalDay) || 1) - hoyDia + 31) % 31);
            return `
                <div class="finance-correction-inputs">
                    <div><div class="modal-label">Fecha</div><input class="modal-input" type="date" value="${d.date}" onchange="financeProProgramadoSet('date',this.value)"></div>
                    <div><div class="modal-label">Importe (€)</div><input class="modal-input" type="text" inputmode="decimal" autocomplete="off" value="${escapeHtml(String(d.amount ?? ''))}" oninput="financeProProgramadoSet('amount',this.value)" placeholder="0,00"></div>
                </div>
                <div class="modal-label">Concepto</div>
                <input class="modal-input" value="${escapeHtml(d.note)}" oninput="financeProProgramadoSet('note',this.value)" placeholder="p. ej. matrícula, seguro del coche...">
                <div class="finance-correction-inputs">
                    <div><div class="modal-label">Cuenta</div>
                        <select class="modal-input" onchange="financeProProgramadoSet('account',this.value)">
                            ${FINANCE_PRO_ACCOUNT_KEYS.map(k => `<option value="${k}" ${d.account === k ? 'selected' : ''}>${escapeHtml(financePro.accounts[k].name)}</option>`).join('')}
                        </select></div>
                    <div><div class="modal-label">Categoría</div>
                        <select class="modal-input" onchange="financeProProgramadoSet('category',this.value)">
                            <option value="">Sin categoría</option>
                            ${cats.map(c => `<option value="${c.id}" ${d.category === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                        </select></div>
                </div>
                <button class="btn-modal-primary" style="margin-top:12px" onclick="saveFinanceProProgramado()">programar gasto.</button>

                <div class="finance-kicker" style="margin:22px 0 8px">programados.</div>
                ${pendientes.length ? pendientes.map(p => `
                    <div class="finance-programado-row">
                        <div class="finance-programado-main">
                            <div>${escapeHtml(p.note || 'Gasto programado')}</div>
                            <div class="finance-programado-meta">${financeDateLabelShort(p.date)}, ${escapeHtml(financePro.accounts[p.account]?.name || p.account)}</div>
                        </div>
                        <span class="finance-negative">-${financeMoney(p.amount)}</span>
                        <button class="doc-action-delete-btn" title="Quitar" onclick="deleteFinanceProProgramado('${p.id}')"><i class='ico ico-x' aria-hidden=true></i></button>
                    </div>`).join('') : `<div class="finance-empty-state">No hay gastos programados.</div>`}

                ${suscripciones.length ? `
                <div class="finance-kicker" style="margin:22px 0 8px">suscripciones.</div>
                <div class="finance-modal-note" style="margin-bottom:6px">Se cargan solas cada mes, no hace falta programarlas.</div>
                ${suscripciones.map(e => `
                    <div class="finance-programado-row">
                        <div class="finance-programado-main">
                            <div>${escapeHtml(e.title || 'Suscripción')}</div>
                            <div class="finance-programado-meta">Día ${Number(e.renewalDay) || 1} de cada mes, ${escapeHtml(financePro.accounts[financeProCuentaRecurrente(e)]?.name || '')}</div>
                        </div>
                        <span class="finance-negative">-${financeMoney(Number(e.amount) || 0)}</span>
                    </div>`).join('')}` : ''}
            `;
        }

        function financeProProgramadoSet(key, value) {
            window._financeProgramadoDraft[key] = value;
        }

        async function saveFinanceProProgramado() {
            const d = window._financeProgramadoDraft;
            const amount = Math.abs(financeProParseEuroAmount(d.amount));
            if (!(amount > 0)) { showToast('Introduce un importe válido', true); return; }
            if (!d.date) { showToast('Elige una fecha', true); return; }
            financePro.programados.push({
                id: 'prog_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                date: d.date, account: d.account, amount, category: d.category || undefined, note: d.note.trim() || undefined
            });
            const esHoyOAntes = d.date <= todayISO();
            if (esHoyOAntes) financeProAplicarProgramados();
            window._financeProgramadoDraft = { ...d, amount: '', note: '' };
            document.getElementById('finance-programados-body').innerHTML = renderFinanceProProgramadosBody();
            render();
            try { await saveData(); showToast(esHoyOAntes ? 'Añadido a tus movimientos' : 'Gasto programado'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteFinanceProProgramado(id) {
            financePro.programados = financePro.programados.filter(p => p.id !== id);
            document.getElementById('finance-programados-body').innerHTML = renderFinanceProProgramadosBody();
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openFinanceProAllTxModal() {
            showModal(`
                <div class="modal-title">Movimientos</div>
                ${renderFinanceProTransactionFilters()}
                <div id="finance-pro-tx-modal-list">${renderFinanceProTransactionList(true)}</div>
            `);
        }

        function renderFinanceProTransactionFilters() {
            return `<div style="margin:14px 0 6px">
                <input class="modal-input" style="margin:0 0 8px" type="search" placeholder="Buscar por categoría, nota o cuenta..." value="${escapeHtml(financeProTxFilter.search)}" oninput="financeProApplyTxFilter('search',this.value)">
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                <select class="modal-input" style="width:auto;margin:0" onchange="financeProApplyTxFilter('account',this.value)">
                    <option value="">Todas las cuentas</option>
                    ${FINANCE_PRO_ACCOUNT_KEYS.map(k => `<option value="${k}" ${financeProTxFilter.account === k ? 'selected' : ''}>${escapeHtml(financePro.accounts[k].name)}</option>`).join('')}
                </select>
                <select class="modal-input" style="width:auto;margin:0" onchange="financeProApplyTxFilter('month',this.value)">
                    <option value="">Todos los meses</option>
                    ${FINANCE_PRO_MONTH_NAMES.map((name, i) => `<option value="${String(i + 1).padStart(2, '0')}" ${financeProTxFilter.month === String(i + 1).padStart(2, '0') ? 'selected' : ''}>${name}</option>`).join('')}
                </select>
                <select class="modal-input" style="width:auto;margin:0" onchange="financeProApplyTxFilter('year',this.value)">
                    <option value="">Todos los años</option>
                    ${financeProTxFilterYears().map(y => `<option value="${y}" ${financeProTxFilter.year === y ? 'selected' : ''}>${y}</option>`).join('')}
                </select>
                <select class="modal-input" style="width:auto;margin:0" onchange="financeProApplyTxFilter('category',this.value)">
                    <option value="">Todas las categorías</option>
                    <option value="__none__" ${financeProTxFilter.category === '__none__' ? 'selected' : ''}>Sin categoría</option>
                    ${(financePro.categories || []).map(c => `<option value="${c.id}" ${financeProTxFilter.category === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                </select>
                </div>
            </div>`;
        }

        function financeDateLabelShort(dateStr) {
            const [y, m, d] = String(dateStr).split('-').map(Number);
            if (!y) return dateStr;
            return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        }

        function renderFinanceProTransactionList(full) {
            let txs = [...financePro.transactions];
            // Vista plegada del panel principal: sin filtros, se recortan
            // directamente los 5 movimientos más recientes.
            if (full) {
                if (financeProTxFilter.account) txs = txs.filter(t => t.account === financeProTxFilter.account || t.transferTo === financeProTxFilter.account);
                if (financeProTxFilter.year) txs = txs.filter(t => t.date.slice(0, 4) === financeProTxFilter.year);
                if (financeProTxFilter.month) txs = txs.filter(t => t.date.slice(5, 7) === financeProTxFilter.month);
                if (financeProTxFilter.category === '__none__') txs = txs.filter(t => !t.category && !financeProNeutro(t) && t.type !== 'transfer');
                else if (financeProTxFilter.category) txs = txs.filter(t => t.category === financeProTxFilter.category);
                if (financeProTxFilter.search.trim()) {
                    const q = financeProTxFilter.search.trim().toLowerCase();
                    txs = txs.filter(t => {
                        const cat = financeProCategoryById(t.category);
                        const haystack = [
                            cat ? cat.name : '',
                            t.note || '',
                            financePro.accounts[t.account]?.name || '',
                            t.transferTo ? financePro.accounts[t.transferTo]?.name || '' : ''
                        ].join(' ').toLowerCase();
                        return haystack.includes(q);
                    });
                }
            }
            if (!txs.length) return `<div class="finance-empty-state">${financePro.transactions.length ? 'Ningún movimiento coincide con este filtro.' : 'Todavía no hay movimientos. Añade uno o importa un extracto bancario.'}</div>`;
            txs.sort((a, b) => financeProCompararMov(b, a));
            if (!full) txs = txs.slice(0, 5);
            const saldos = financeProSaldosTrasMovimiento();
            const groups = {};
            txs.forEach(t => { const m = t.date.slice(0, 7); groups[m] = groups[m] || []; groups[m].push(t); });
            // El detalle mes a mes (ingresos/gastos, barra) vive ahora en la
            // tarjeta ampliable "Resumen anual" — aquí solo queda una
            // cabecera ligera con el neto, para no repetir lo mismo cada vez
            // que se hace scroll por el listado de movimientos.
            return Object.keys(groups).sort().reverse().map(m => {
                // Plegado solo se pintan los 5 últimos movimientos, pero el
                // neto es el del mes entero (antes sumaba solo esos 5 y no
                // coincidía con el del listado completo).
                const delMes = full ? groups[m] : financePro.transactions.filter(t => t.date.slice(0, 7) === m);
                const income = delMes.filter(t => t.type === 'income' && !financeProNeutro(t)).reduce((s, t) => s + Number(t.amount), 0);
                const expense = delMes.filter(t => t.type === 'expense' && !financeProNeutro(t)).reduce((s, t) => s + Number(t.amount), 0);
                const monthTotal = income - expense;
                return `<div class="finance-pro-tx-month-group">
                    <div class="finance-pro-tx-month-summary finance-pro-tx-month-summary-light">
                        <span class="finance-pro-tx-month-title">${escapeHtml(financeMonthLabel(m))}</span>
                        <span class="finance-pro-tx-month-net ${monthTotal >= 0 ? 'positive' : 'negative'}">${monthTotal >= 0 ? '+' : ''}${financeMoney(monthTotal)}</span>
                    </div>
                    ${groups[m].map(t => renderFinanceProTxRow(t, saldos)).join('')}
                </div>`;
            }).join('');
        }

        // Orden dentro de un mismo día: la hora si el extracto la trae
        // (Revolut) o se apuntó hoy a mano, y si no el orden de las filas del
        // extracto. Antes se desempataba por el id, que en una importación es
        // casi aleatorio, y los movimientos del día salían revueltos.
        function financeProClaveDia(t) {
            if (t.hora) return t.hora;
            return t.orden != null ? 'o' + String(t.orden).padStart(6, '0') : '';
        }
        function financeProCompararMov(a, b) {
            return (a.date || '').localeCompare(b.date || '') || financeProClaveDia(a).localeCompare(financeProClaveDia(b)) || String(a.id).localeCompare(String(b.id));
        }
        function financeProHoraAhora(fecha) {
            return fecha === todayISO() ? new Date().toTimeString().slice(0, 8) : undefined;
        }

        // Saldo de la cuenta justo después de cada movimiento. Se recorre en
        // el orden inverso exacto al de la lista (financeProCompararMov), así el
        // saldo de cada fila es coherente con la de debajo aunque haya
        // varios movimientos el mismo día.
        function financeProSaldosTrasMovimiento() {
            const saldo = {};
            FINANCE_PRO_ACCOUNT_KEYS.forEach(k => { saldo[k] = Number(financePro.accounts[k]?.balance0 || 0); });
            const porId = {};
            [...financePro.transactions]
                .sort(financeProCompararMov)
                .forEach(t => {
                    const amount = financeProCuentaEnSaldo(t) ? Number(t.amount) || 0 : 0;
                    if (t.type === 'transfer') {
                        saldo[t.account] = (saldo[t.account] || 0) - amount;
                        saldo[t.transferTo] = (saldo[t.transferTo] || 0) + amount;
                        porId[t.id] = { [t.account]: saldo[t.account], [t.transferTo]: saldo[t.transferTo] };
                    } else {
                        saldo[t.account] = (saldo[t.account] || 0) + (t.type === 'income' ? amount : -amount);
                        porId[t.id] = { [t.account]: saldo[t.account] };
                    }
                });
            return porId;
        }

        function renderFinanceProTxSaldo(t, saldos) {
            const cuenta = t.type === 'transfer' && financeProTxFilter.account === t.transferTo ? t.transferTo : t.account;
            const valor = saldos?.[t.id]?.[cuenta];
            return valor === undefined ? '' : ` <span class="finance-pro-tx-saldo">(${financeMoney(valor)})</span>`;
        }

        function financeProEtiquetaNeutro(t) {
            if (t.ahorro) return t.type === 'income' ? 'de tus ahorros.' : 'a tus ahorros.';
            if (financeProEsInversion(t)) return t.type === 'income' ? 'de tu inversión.' : 'a tu inversión.';
            return 'ajuste de saldo.';
        }

        function renderFinanceProTxRow(t, saldos) {
            if (t.type === 'transfer') {
                return `<div class="finance-pro-tx-row" onclick="openFinanceProTransactionModal('${t.id}')">
                    <div class="finance-metric-icon fin-slate finance-pro-tx-icon">${FINANCE_ICON_SWAP}</div>
                    <div class="finance-pro-tx-main">
                        <div class="finance-pro-tx-title">${escapeHtml(financePro.accounts[t.account]?.name || t.account)} → ${escapeHtml(financePro.accounts[t.transferTo]?.name || t.transferTo)}</div>
                        <div class="finance-pro-tx-sub">${t.note ? escapeHtml(t.note) + ', ' : ''}${financeDateLabelShort(t.date)}${t.pendiente ? ', pendiente.' : ''}</div>
                    </div>
                    <div class="finance-pro-tx-amount">${financeMoney(t.amount)}${renderFinanceProTxSaldo(t, saldos)}</div>
                </div>`;
            }
            const neutro = financeProNeutro(t);
            const cat = neutro ? null : financeProCategoryById(t.category);
            return `<div class="finance-pro-tx-row" onclick="openFinanceProTransactionModal('${t.id}')">
                ${neutro ? `<div class="finance-metric-icon fin-slate finance-pro-tx-icon">${FINANCE_ICON_SWAP}</div>` : financeProCategoryBadge(cat)}
                <div class="finance-pro-tx-main">
                    <div class="finance-pro-tx-title">${neutro ? financeProEtiquetaNeutro(t) : escapeHtml(cat ? cat.name : 'Sin categoría')}${!neutro && cat && t.categoriaAuto ? '<span class="finance-cat-auto" title="Puesta por bitácora a partir de movimientos parecidos. Ábrelo y guarda para confirmarla.">auto.</span>' : ''}</div>
                    <div class="finance-pro-tx-sub">${escapeHtml(financePro.accounts[t.account]?.name || t.account)}, ${financeDateLabelShort(t.date)}${t.pendiente ? ', pendiente.' : ''}${t.viaje ? ', <span class="finance-marca">viaje.</span>' : ''}</div>
                    ${t.note ? `<div class="finance-pro-tx-note">${escapeHtml(t.note)}</div>` : ''}
                </div>
                <div class="finance-pro-tx-amount ${t.type === 'income' ? 'finance-positive' : 'finance-negative'}">${t.type === 'income' ? '+' : '-'}${financeMoney(t.amount)}${renderFinanceProTxSaldo(t, saldos)}</div>
            </div>`;
        }

        // ============================================================
        //  FINANZAS PRO — crear / editar / eliminar movimiento
        // ============================================================
        function openFinanceProTransactionModal(id, presetAccount) {
            window._financeProTxEditId = id || null;
            // Si se abre desde dentro del popup de "todos los movimientos"
            // (busca/filtra), al guardar o borrar hay que volver ahí en vez
            // de cerrar del todo — si no, cada edición obliga a reabrir el
            // popup y volver a buscar por dónde iba.
            window._financeProTxReturnToAll = !!document.getElementById('finance-pro-tx-modal-list');
            const existing = id ? financePro.transactions.find(t => t.id === id) : null;
            window._financeProTxDraft = existing
                ? { ...existing, category: existing.category || '', transferTo: existing.transferTo || '', note: existing.note || '' }
                : { type: 'expense', account: presetAccount || FINANCE_PRO_ACCOUNT_KEYS[0], date: todayISO(), amount: '', category: '', note: '', transferTo: '' };
            showModal(`
                <div class="modal-title">${existing ? 'Editar movimiento' : '+ Movimiento'}</div>
                <div id="finance-pro-tx-modal-body">${renderFinanceProTxModalBody()}</div>
            `);
        }

        function renderFinanceProTxModalBody() {
            const d = window._financeProTxDraft;
            const cats = financePro.categories.filter(c => c.type === d.type);
            return `
                <div class="finance-pro-type-tabs">
                    <button class="${d.type === 'expense' ? 'active' : ''}" onclick="financeProDraftSet('type','expense')">gasto.</button>
                    <button class="${d.type === 'income' ? 'active' : ''}" onclick="financeProDraftSet('type','income')">ingreso.</button>
                    <button class="${d.type === 'transfer' ? 'active' : ''}" onclick="financeProDraftSet('type','transfer')">transferencia.</button>
                </div>
                <div class="modal-label">Fecha</div>
                <input class="modal-input" type="date" value="${d.date}" onchange="financeProDraftSet('date',this.value)">
                <div class="modal-label">Importe (€)</div>
                <input class="modal-input" type="text" inputmode="decimal" autocomplete="off" value="${escapeHtml(String(d.amount ?? ''))}" oninput="window._financeProTxDraft.amount=this.value" placeholder="0,00">
                <div class="modal-label">${d.type === 'transfer' ? 'Cuenta origen' : 'Cuenta'}</div>
                <select class="modal-input" onchange="financeProDraftSet('account',this.value)">
                    ${FINANCE_PRO_ACCOUNT_KEYS.map(k => `<option value="${k}" ${d.account === k ? 'selected' : ''}>${escapeHtml(financePro.accounts[k].name)}</option>`).join('')}
                </select>
                ${d.type === 'transfer' ? `
                <div class="modal-label">Cuenta destino</div>
                <select class="modal-input" onchange="financeProDraftSet('transferTo',this.value)">
                    <option value="">Elige una cuenta</option>
                    ${FINANCE_PRO_ACCOUNT_KEYS.filter(k => k !== d.account).map(k => `<option value="${k}" ${d.transferTo === k ? 'selected' : ''}>${escapeHtml(financePro.accounts[k].name)}</option>`).join('')}
                </select>` : `
                <div id="finance-tx-categoria" ${d.ahorro || financeProEsAjuste(d) ? 'hidden' : ''}>
                <div class="modal-label">Categoría</div>
                <select class="modal-input" onchange="financeProDraftSet('category',this.value)">
                    <option value="">Sin categoría</option>
                    ${cats.map(c => `<option value="${c.id}" ${d.category === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                </select>
                ${d.categoriaAuto && d.category ? '<div class="finance-modal-note" style="margin:-4px 0 8px">Categoría puesta por bitácora: el 90 % o más de tus movimientos parecidos la llevan. Al guardar queda confirmada.</div>' : ''}
                </div>`}
                ${renderFinanceProMarcasTx(d)}
                <div class="modal-label">Nota (opcional)</div>
                <input class="modal-input" value="${escapeHtml(d.note || '')}" oninput="window._financeProTxDraft.note=this.value" placeholder="Ej. Cena con amigos">
                <button class="btn-modal-primary" style="margin-top:6px" onclick="saveFinanceProTransaction()">guardar.</button>
                ${window._financeProTxEditId ? `<button class="btn-secondary" style="margin-top:8px;color:#dc2626" onclick="deleteFinanceProTransaction('${window._financeProTxEditId}')">eliminar movimiento.</button>` : ''}
            `;
        }

        function financeProDraftSet(key, value) {
            window._financeProTxDraft[key] = value;
            if (key === 'type' || key === 'account') {
                document.getElementById('finance-pro-tx-modal-body').innerHTML = renderFinanceProTxModalBody();
            }
        }

        async function saveFinanceProTransaction() {
            const d = window._financeProTxDraft;
            // El importe se escribe como texto (en el iPhone, el campo numérico
            // con teclado en español dejaba vacío «12,50» y daba error).
            const amount = Math.abs(financeProParseEuroAmount(d.amount));
            if (!(amount > 0)) { showToast('Introduce un importe válido', true); return; }
            if (d.type === 'transfer' && (!d.transferTo || d.transferTo === d.account)) { showToast('Elige una cuenta destino distinta', true); return; }
            const entry = {
                id: window._financeProTxEditId || ('ptx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
                date: d.date || todayISO(),
                account: d.account,
                type: d.type,
                amount,
                category: d.type === 'transfer' ? undefined : (d.category || undefined),
                transferTo: d.type === 'transfer' ? d.transferTo : undefined,
                note: (d.note || '').trim() || undefined,
                viaje: d.type === 'expense' && d.viaje ? true : undefined,
                viajeId: d.type === 'expense' && d.viaje && d.viajeId ? d.viajeId : undefined,
                ahorro: d.type !== 'transfer' && d.ahorro ? true : undefined,
                hora: d.hora || financeProHoraAhora(d.date || todayISO())
            };
            // Al editar se conserva de dónde vino el movimiento (manual,
            // cargo automático, ya conciliado con el banco...): si se
            // perdiera, la próxima importación lo duplicaría.
            const prev = financePro.transactions.find(t => t.id === entry.id);
            if (prev) ['manual', 'recurringEntryId', 'cicloMes', 'programadoId', 'conciliado', 'bankNote', 'pendiente', 'noDuplicadoDe', 'claveImport', 'ajuste', 'orden'].forEach(k => { if (prev[k] !== undefined) entry[k] = prev[k]; });
            else entry.manual = true;
            // Si a un movimiento importado se le cambia la nota, el concepto
            // del banco se guarda aparte: con él se reconoce al reimportar y
            // al completarse si estaba pendiente (Cinesa → "Cinesa, cine"
            // entraba otra vez al importar el extracto siguiente).
            if (prev && !prev.manual && !prev.bankNote && prev.note && entry.note !== prev.note) entry.bankNote = prev.note;
            if (prev && !prev.manual && !prev.claveImport) {
                const clave = `${prev.account}|${prev.date}|${prev.amount}|${prev.bankNote ?? prev.note ?? ''}`;
                if (clave !== `${entry.account}|${entry.date}|${entry.amount}|${entry.bankNote ?? entry.note ?? ''}`) entry.claveImport = clave;
            }
            const idx = financePro.transactions.findIndex(t => t.id === entry.id);
            if (idx >= 0) financePro.transactions[idx] = entry; else financePro.transactions.push(entry);
            const categorizados = entry.category ? financeProAutoCategorizar() : 0;
            window._financeProTxEditId = null; window._financeProTxDraft = null;
            render();
            if (window._financeProTxReturnToAll) openFinanceProAllTxModal(); else closeModal();
            window._financeProTxReturnToAll = false;
            try { await saveData(); showToast(categorizados ? `Movimiento guardado, ${categorizados} parecido${categorizados === 1 ? '' : 's'} categorizado${categorizados === 1 ? '' : 's'} solo${categorizados === 1 ? '' : 's'}` : 'Movimiento guardado'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteFinanceProTransaction(id) {
            if (!confirm('¿Eliminar este movimiento?')) return;
            financePro.transactions = financePro.transactions.filter(t => t.id !== id);
            window._financeProTxEditId = null; window._financeProTxDraft = null;
            render();
            if (window._financeProTxReturnToAll) openFinanceProAllTxModal(); else closeModal();
            window._financeProTxReturnToAll = false;
            try { await saveData(); showToast('Movimiento eliminado'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // Detector de posibles duplicados: casos típicos de importar dos
        // extractos con periodos solapados (p. ej. un movimiento que se
        // importó "pendiente" con una fecha y luego "completado" con otra,
        // sin que el saneado de fechas del importador los reconociera como
        // el mismo). Exige misma cuenta, mismo tipo, mismo importe y misma
        // nota, con fechas a 2 días o menos — bastante estricto a
        // propósito, para no marcar como duplicados dos cafés del mismo
        // sitio en días distintos.
        function findFinanceProDuplicates() {
            const txs = financePro.transactions.filter(t => t.type !== 'transfer');
            const pairs = [];
            const used = new Set();
            for (let i = 0; i < txs.length; i++) {
                if (used.has(txs[i].id)) continue;
                for (let j = i + 1; j < txs.length; j++) {
                    if (used.has(txs[j].id)) continue;
                    const a = txs[i], b = txs[j];
                    if (a.account !== b.account || a.type !== b.type) continue;
                    if (Math.abs(Number(a.amount) - Number(b.amount)) > 0.005) continue;
                    const noteA = (a.note || '').trim().toLowerCase();
                    const noteB = (b.note || '').trim().toLowerCase();
                    if (noteA !== noteB) continue;
                    const daysDiff = Math.abs((new Date(a.date) - new Date(b.date)) / 86400000);
                    if (daysDiff > 2) continue;
                    pairs.push([a, b]);
                    used.add(a.id); used.add(b.id);
                    break;
                }
            }
            return pairs;
        }

        // Gasto grabado a mano + el mismo cargo importado del banco con otro
        // concepto ("mega dream ex booster box" frente a "eBay"). La
        // importación ya los fusiona sola, pero solo si el manual se grabó
        // después de que existiera la marca `manual`; esto cubre los de
        // antes. Es más laxo que el detector de arriba (concepto distinto,
        // ±3 días), así que puede proponer falsos positivos — dos cafés de
        // 1,60 € en días seguidos —: por eso cada pareja se puede descartar
        // y no vuelve a salir.
        function findFinanceProPosiblesDuplicados(yaListados) {
            const usados = new Set(yaListados.flat().map(t => t.id));
            const txs = financePro.transactions.filter(t => t.type !== 'transfer' && !usados.has(t.id));
            const pairs = [];
            for (let i = 0; i < txs.length; i++) {
                if (usados.has(txs[i].id)) continue;
                for (let j = i + 1; j < txs.length; j++) {
                    const a = txs[i], b = txs[j];
                    if (usados.has(b.id) || a.account !== b.account || a.type !== b.type) continue;
                    // Dos movimientos ya conciliados vienen los dos del banco:
                    // son dos cargos reales. Uno conciliado y otro no es el
                    // caso típico de gasto grabado a mano que el extracto no
                    // llegó a emparejar.
                    if (a.conciliado && b.conciliado) continue;
                    if (Math.abs(Number(a.amount) - Number(b.amount)) >= 0.005) continue;
                    if (financeProNormalizar(a.note).trim() === financeProNormalizar(b.note).trim()) continue;
                    if ((a.noDuplicadoDe || []).includes(b.id) || (b.noDuplicadoDe || []).includes(a.id)) continue;
                    if (Math.abs((new Date(a.date) - new Date(b.date)) / 86400000) > 3) continue;
                    pairs.push([a, b]);
                    usados.add(a.id); usados.add(b.id);
                    break;
                }
            }
            return pairs;
        }

        function renderFinanceProDupItem(t, conBorrar) {
            const cat = financeProCategoryById(t.category);
            return `
                <div class="finance-dup-item">
                    <div class="finance-dup-item-main">
                        <div>${escapeHtml(financePro.accounts[t.account]?.name || t.account)}, ${financeDateLabelShort(t.date)}${cat ? ', ' + escapeHtml(cat.name) : ''}</div>
                        ${t.note ? `<div class="finance-dup-item-note">${escapeHtml(t.note)}</div>` : ''}
                    </div>
                    <div class="finance-dup-item-amount ${t.type === 'income' ? 'finance-positive' : 'finance-negative'}">${t.type === 'income' ? '+' : '-'}${financeMoney(t.amount)}</div>
                    ${conBorrar ? `<button class="doc-action-delete-btn" title="Eliminar esta copia" onclick="deleteFinanceProTransaction('${t.id}')"><i class='ico ico-x' aria-hidden=true></i></button>` : ''}
                </div>`;
        }

        function openFinanceProDuplicatesModal() {
            const pairs = findFinanceProDuplicates();
            const posibles = findFinanceProPosiblesDuplicados(pairs);
            if (!pairs.length && !posibles.length) { closeModal(); showToast('No se han encontrado duplicados probables'); return; }
            showModal(`
                <div class="modal-title">Posibles duplicados</div>
                ${pairs.length ? `
                <div class="finance-modal-note" style="margin-bottom:12px">Mismo importe, misma cuenta y misma nota, con fechas muy cercanas: típico de importar dos extractos con periodos solapados. Revisa cada pareja y elimina la copia sobrante.</div>
                ${pairs.map(([a, b]) => `<div class="finance-dup-pair">${renderFinanceProDupItem(a, true)}${renderFinanceProDupItem(b, true)}</div>`).join('')}` : ''}
                ${posibles.length ? `
                <div class="finance-kicker" style="margin:${pairs.length ? '20px' : '0'} 0 6px">mismo importe, concepto distinto.</div>
                <div class="finance-modal-note" style="margin-bottom:12px">Suele ser un gasto que grabaste a mano y el mismo cargo importado del banco. «Fusionar» los deja en uno solo: conserva tu nota y tu categoría y recuerda el concepto del banco para que reimportar el extracto no lo vuelva a duplicar.</div>
                ${posibles.map(([a, b]) => `
                    <div class="finance-dup-pair">
                        ${renderFinanceProDupItem(a, false)}${renderFinanceProDupItem(b, false)}
                        <div class="finance-dup-actions">
                            <button class="finance-oneoff-btn" onclick="fusionarFinanceProPareja('${a.id}','${b.id}')">fusionar.</button>
                            <button class="finance-oneoff-btn" onclick="descartarFinanceProPareja('${a.id}','${b.id}')">no es duplicado.</button>
                        </div>
                    </div>`).join('')}` : ''}
            `);
        }

        // Se queda como base el que tiene más información puesta por el
        // usuario (marca manual, categoría) y el otro aporta su concepto
        // como bankNote: la importación compara con bankNote y con la
        // fecha de inicio de la fila, así que reimportar el extracto lo
        // reconoce aunque la fecha de la base sea la de cuando se grabó.
        async function fusionarFinanceProPareja(idA, idB) {
            const a = financePro.transactions.find(t => t.id === idA);
            const b = financePro.transactions.find(t => t.id === idB);
            if (!a || !b) return;
            const puntos = t => (t.manual ? 4 : 0) + (t.category ? 2 : 0) + (t.needsReview ? -1 : 0);
            const [base, otra] = puntos(a) >= puntos(b) ? [a, b] : [b, a];
            if (otra.note) base.bankNote = otra.bankNote || otra.note;
            if (!base.note && otra.note) base.note = otra.note;
            if (!base.category && otra.category) { base.category = otra.category; base.needsReview = false; }
            if (!base.recurringEntryId && otra.recurringEntryId) { base.recurringEntryId = otra.recurringEntryId; base.cicloMes = financeProCicloMes(otra); }
            if (otra.pendiente) base.pendiente = true;
            base.conciliado = true;
            financePro.transactions = financePro.transactions.filter(t => t !== otra);
            render();
            openFinanceProDuplicatesModal();
            try { await saveData(); showToast('Movimientos fusionados'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function descartarFinanceProPareja(idA, idB) {
            const a = financePro.transactions.find(t => t.id === idA);
            const b = financePro.transactions.find(t => t.id === idB);
            if (!a || !b) return;
            a.noDuplicadoDe = [...(a.noDuplicadoDe || []), b.id];
            b.noDuplicadoDe = [...(b.noDuplicadoDe || []), a.id];
            openFinanceProDuplicatesModal();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // ============================================================
        //  FINANZAS PRO — categorías
        // ============================================================
        let financeProNewCatIcon = 'other';
        let financeProNewCatColor = FINANCE_PRO_PALETTE[0];

        function openFinanceProCategoriesModal() {
            financeProNewCatIcon = 'other';
            financeProNewCatColor = FINANCE_PRO_PALETTE[0];
            showModal(`
                <div class="modal-title">Categorías</div>
                <div class="finance-modal-note" style="margin-bottom:10px">Los límites de gasto se ponen en la planificación de largo plazo, vinculando una casilla a la categoría.</div>
                <div id="finance-pro-cat-list">${renderFinanceProCategoryList()}</div>
                <div class="modal-label" style="margin-top:14px">Nueva categoría</div>
                <input id="new-cat-name" class="modal-input" placeholder="Nombre">
                <select id="new-cat-type" class="modal-input">
                    <option value="expense">Gasto</option>
                    <option value="income">Ingreso</option>
                </select>
                <div class="modal-label">Icono</div>
                <div id="new-cat-icon-picker">${renderFinanceProIconPicker()}</div>
                <div class="modal-label">Color</div>
                <div id="new-cat-color-picker">${renderFinanceProColorPicker()}</div>
                <button class="btn-modal-primary" style="margin-top:10px" onclick="addFinanceProCategory()">+ Añadir categoría</button>
                <button class="m-enlace" style="display:block;margin:12px auto 0" onclick="openDividirCategoria()">dividir una categoría.</button>
                <button class="m-enlace" style="display:block;margin:6px auto 0" onclick="openImportarCategorias()">importar categorías.</button>
            `);
        }

        function renderFinanceProIconPicker() {
            return `<div class="finance-pro-icon-picker">
                ${FINANCE_PRO_CATEGORY_ICON_SET.map(i => `<button type="button" class="finance-pro-icon-choice ${financeProNewCatIcon === i.key ? 'selected' : ''}" title="${escapeHtml(i.label)}" onclick="financeProNewCatIcon='${i.key}';document.getElementById('new-cat-icon-picker').innerHTML=renderFinanceProIconPicker()">${i.svg}</button>`).join('')}
            </div>`;
        }

        function renderFinanceProColorPicker() {
            return `<div class="finance-pro-icon-picker">
                ${FINANCE_PRO_PALETTE.map(c => `<button type="button" class="finance-pro-color-choice ${financeProNewCatColor === c ? 'selected' : ''}" style="background:${c}" title="${c}" onclick="financeProNewCatColor='${c}';document.getElementById('new-cat-color-picker').innerHTML=renderFinanceProColorPicker()"></button>`).join('')}
            </div>`;
        }

        function renderFinanceProCategoryList() {
            const row = c => `<div class="finance-budget-row" style="cursor:default">
                <div class="finance-budget-row-head" style="align-items:center">
                    <span style="display:flex;align-items:center;gap:8px;color:var(--text-primary)">${financeProCategoryBadge(c)}${escapeHtml(c.name)}</span>
                    <button class="btn-secondary" style="width:auto;padding:2px 8px;font-size:11px;color:#dc2626" onclick="deleteFinanceProCategory('${c.id}')"><i class='ico ico-x' aria-hidden=true></i></button>
                </div>
            </div>`;
            const expense = financePro.categories.filter(c => c.type === 'expense');
            const income = financePro.categories.filter(c => c.type === 'income');
            return `<div class="finance-kicker" style="margin:8px 0 4px">Gastos</div>${expense.map(row).join('') || '<div class="finance-empty-line">Ninguna</div>'}
                <div class="finance-kicker" style="margin:14px 0 4px">Ingresos</div>${income.map(row).join('') || '<div class="finance-empty-line">Ninguna</div>'}`;
        }

        async function addFinanceProCategory() {
            const name = document.getElementById('new-cat-name')?.value.trim();
            const type = document.getElementById('new-cat-type')?.value || 'expense';
            if (!name) { showToast('Ponle un nombre a la categoría', true); return; }
            financePro.categories.push({ id: 'cat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name, icon: financeProNewCatIcon, color: financeProNewCatColor, type });
            financeProNewCatIcon = 'other';
            financeProNewCatColor = FINANCE_PRO_PALETTE[0];
            document.getElementById('finance-pro-cat-list').innerHTML = renderFinanceProCategoryList();
            document.getElementById('new-cat-icon-picker').innerHTML = renderFinanceProIconPicker();
            document.getElementById('new-cat-color-picker').innerHTML = renderFinanceProColorPicker();
            document.getElementById('new-cat-name').value = '';
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteFinanceProCategory(id) {
            if (!confirm('¿Eliminar esta categoría? Los movimientos que la usaban quedarán sin categoría.')) return;
            financePro.categories = financePro.categories.filter(c => c.id !== id);
            financePro.transactions.forEach(t => { if (t.category === id) t.category = undefined; });
            document.getElementById('finance-pro-cat-list').innerHTML = renderFinanceProCategoryList();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // ============================================================
        //  FINANZAS PRO — importar movimientos (CSV genérico del banco)
        // ============================================================
        // ============================================================
        //  FINANZAS PRO — reglas de traspaso (para la importación)
        //  Un movimiento entre dos cuentas propias (p. ej. traer saldo de
        //  un banco no llevado en Bitácora a la cuenta que sí lo está, o
        //  entre dos cuentas PRO) no es ni ingreso ni gasto real — infla
        //  las estadísticas si se importa tal cual. Una regla dice: "si el
        //  concepto contiene este texto, es un traspaso con esta otra
        //  cuenta", y la importación (confirmFinanceProImport) resta de un
        //  lado y suma en el otro en vez de crear un ingreso/gasto.
        // ============================================================
        function openFinanceProRulesModal() {
            showModal(`
                <div class="modal-title">Reglas de traspaso</div>
                <div class="finance-modal-note" style="margin-bottom:12px">Para movimientos recurrentes que en realidad son traspasos entre tus propias cuentas (traer saldo de un banco a otro, por ejemplo): al importar, si el concepto contiene el texto de una regla activa, se registra como traspaso en vez de como ingreso o gasto.</div>
                <div id="finance-pro-rules-list">${renderFinanceProRulesList()}</div>
                <div class="finance-panel" style="margin-top:14px">
                    <div class="modal-label">El concepto contiene</div>
                    <input class="modal-input" id="new-rule-text" placeholder="p. ej. Top-up by *1185">
                    <div class="modal-label">Es un traspaso con</div>
                    <select class="modal-input" id="new-rule-account">
                        ${FINANCE_PRO_ACCOUNT_KEYS.map(k => `<option value="${k}">${escapeHtml(financePro.accounts[k].name)}</option>`).join('')}
                    </select>
                    <div class="finance-modal-note" style="margin:4px 0 10px">Si el importe del movimiento importado es positivo, se suma aquí y se resta de esa otra cuenta; si es negativo, al revés.</div>
                    <button class="btn-modal-primary" onclick="addFinanceProRule()">+ Añadir regla</button>
                </div>
            `);
        }

        function renderFinanceProRulesList() {
            if (!financePro.rules.length) return `<div class="finance-empty-state">Todavía no tienes reglas. Los movimientos importados se registran como ingreso o gasto normal.</div>`;
            return financePro.rules.map(r => `
                <div class="finance-rule-row">
                    <button class="finance-pro-switch ${r.enabled ? 'on' : ''}" onclick="toggleFinanceProRule('${r.id}')" title="${r.enabled ? 'Desactivar' : 'Activar'}"><span class="finance-pro-switch-knob"></span></button>
                    <div class="finance-rule-info">
                        <div class="finance-rule-text">"${escapeHtml(r.matchText)}"</div>
                        <div class="finance-rule-sub">Traspaso con ${escapeHtml(financePro.accounts[r.otherAccount]?.name || r.otherAccount)}</div>
                    </div>
                    <button class="finance-icon-btn" title="Eliminar" onclick="deleteFinanceProRule('${r.id}')"><i class='ico ico-x' aria-hidden=true></i></button>
                </div>`).join('');
        }

        async function addFinanceProRule() {
            const text = document.getElementById('new-rule-text').value.trim();
            if (!text) { showToast('Escribe el texto a buscar en el concepto', true); return; }
            const otherAccount = document.getElementById('new-rule-account').value;
            financePro.rules.push({ id: 'prule_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), enabled: true, matchText: text, otherAccount });
            document.getElementById('finance-pro-rules-list').innerHTML = renderFinanceProRulesList();
            document.getElementById('new-rule-text').value = '';
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function toggleFinanceProRule(id) {
            const rule = financePro.rules.find(r => r.id === id);
            if (!rule) return;
            rule.enabled = !rule.enabled;
            document.getElementById('finance-pro-rules-list').innerHTML = renderFinanceProRulesList();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteFinanceProRule(id) {
            if (!confirm('¿Eliminar esta regla?')) return;
            financePro.rules = financePro.rules.filter(r => r.id !== id);
            document.getElementById('finance-pro-rules-list').innerHTML = renderFinanceProRulesList();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openFinanceProImportModal() {
            window._financeProImport = null;
            showModal(`
                <div class="modal-title">Importar movimientos</div>
                <div class="finance-modal-note" style="margin-bottom:12px">Sube el Excel o el CSV que exporta tu banco o tu app de finanzas, o pega su contenido si lo has copiado desde el botón de compartir. En el siguiente paso indicas qué columna es cada dato.</div>
                <input type="file" id="finance-pro-import-file" accept=".csv,.xlsx,.xls,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" class="modal-input" onchange="handleFinanceProImportFile(event)">
                <button class="finance-oneoff-btn finance-import-pegar" onclick="pegarExtractoBancario()">pegar extracto.</button>
                <button class="m-enlace" style="display:block;margin:10px auto 0" onclick="openDeshacerImportacion()">deshacer una importación.</button>
                <button class="m-enlace" style="display:block;margin:6px auto 0" onclick="openBorrarHistorial()">borrar un historial antiguo.</button>
                <button class="m-enlace" style="display:block;margin:6px auto 0" onclick="openFinanceProRulesModal()">reglas de traspaso.</button>
                <div id="finance-pro-import-body"></div>
            `);
        }

        // Parser CSV manual (soporta comillas, campos con comas dentro, y
        // detecta solo si el separador es "," o ";" — este último es muy
        // habitual en extractos de bancos españoles).
        function financeProParseCSV(text) {
            // El separador se cuenta en las primeras líneas y no solo en la
            // primera: hay bancos que ponen antes el nombre de la cuenta, y lo
            // copiado de una hoja de cálculo llega separado por tabuladores.
            const inicio = text.split(/\r?\n/).slice(0, 12).join('\n');
            // Se cuenta fuera de las comillas: un concepto «Compra, tienda, Madrid» hacía elegir la coma en un CSV con «;».
            const fuera = inicio.replace(/"(?:[^"]|"")*"/g, '');
            const veces = c => fuera.split(c).length - 1;
            const sep = veces('\t') > Math.max(veces(';'), veces(',')) ? '\t' : veces(';') >= veces(',') ? ';' : ',';
            const rows = [];
            let row = [], field = '', inQuotes = false;
            for (let i = 0; i < text.length; i++) {
                const c = text[i];
                if (inQuotes) {
                    if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
                    else field += c;
                } else if (c === '"') inQuotes = true;
                else if (c === sep) { row.push(field); field = ''; }
                else if (c === '\n' || c === '\r') {
                    if (c === '\r' && text[i + 1] === '\n') i++;
                    row.push(field); field = '';
                    if (row.some(f => f !== '')) rows.push(row);
                    row = [];
                } else field += c;
            }
            if (field !== '' || row.length) { row.push(field); if (row.some(f => f !== '')) rows.push(row); }
            return rows;
        }

        // Antes se adivinaban las columnas por posición (fecha=0, importe=1,
        // concepto=2) — funcionaba solo por casualidad según el orden de
        // cada banco. Revolut, por ejemplo, trae "Type,Product,Started
        // Date,Completed Date,Description,Amount,..." — con la posición fija
        // el importe caía en la columna "Product" (siempre "Current", nunca
        // un número), así que TODAS las filas fallaban al no poder leer un
        // importe y se omitían en silencio. Ahora se busca cada columna por
        // su nombre de cabecera (en español e inglés, las variantes más
        // habituales) y solo se cae a la posición fija si no se reconoce
        // ninguna cabecera así.
        // Los patrones van por orden de preferencia: Ibercaja trae
        // "Concepto" (TARJETA VISA) y "Descripción" (el comercio), y manda
        // la descripción aunque venga después.
        function financeProGuessColumn(headerRow, patterns, fallback, prefijos) {
            const cab = headerRow.map(h => String(h || '').replace(/^\uFEFF/, '').trim().toLowerCase());
            for (const p of patterns) { const idx = cab.indexOf(p); if (idx >= 0) return idx; }
            for (const p of prefijos || []) { const idx = cab.findIndex(h => h.startsWith(p)); if (idx >= 0) return idx; }
            return fallback;
        }

        // Muchos bancos (Ibercaja, Santander) ponen arriba la cuenta, el
        // titular o los filtros, y la tabla empieza más abajo: la cabecera
        // es la primera fila con una columna de fecha y otra de importe.
        function financeProFilaCabecera(rows) {
            for (let i = 0; i < Math.min(rows.length, 40); i++) {
                const cab = rows[i].map(h => String(h || '').trim().toLowerCase());
                if (cab.some(h => /^(fecha|date|started date|completed date|booking date|value date|f\. ?(operaci|operat|valor|contable))/.test(h)) && cab.some(h => /^(importe|amount|cantidad|cargo|abono|debe|haber|neto)/.test(h))) return i;
            }
            return 0;
        }

        // Lector propio de .xlsx (un zip con XML dentro): ExcelJS no abría el
        // de Ibercaja, que escribe las etiquetas con prefijo (x:row, x:c), y
        // así no hace falta cargar ninguna librería. Lee la primera hoja.
        async function financeProLeerExcel(file) {
            const buf = new Uint8Array(await file.arrayBuffer());
            const dv = new DataView(buf.buffer);
            let fin = buf.length - 22;
            while (fin >= 0 && dv.getUint32(fin, true) !== 0x06054b50) fin--;
            if (fin < 0) throw new Error('no es un xlsx');
            const partes = {};
            for (let k = 0, p = dv.getUint32(fin + 16, true); k < dv.getUint16(fin + 10, true); k++) {
                const nLen = dv.getUint16(p + 28, true), eLen = dv.getUint16(p + 30, true), cLen = dv.getUint16(p + 32, true);
                const nombre = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nLen));
                const local = dv.getUint32(p + 42, true);
                const ini = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
                partes[nombre] = { metodo: dv.getUint16(p + 10, true), datos: buf.subarray(ini, ini + dv.getUint32(p + 20, true)) };
                p += 46 + nLen + eLen + cLen;
            }
            const leer = async nombre => {
                const e = partes[nombre];
                if (!e) return null;
                const txt = e.metodo === 0 ? new TextDecoder().decode(e.datos) : await new Response(new Blob([e.datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
                return new DOMParser().parseFromString(txt, 'application/xml');
            };
            const todos = (nodo, tag) => [...nodo.getElementsByTagNameNS('*', tag)];
            const texto = nodo => todos(nodo, 't').filter(t => t.parentNode.localName !== 'rPh').map(t => t.textContent).join('');
            const ss = await leer('xl/sharedStrings.xml');
            const compartidas = ss ? todos(ss, 'si').map(texto) : [];
            // Las fechas guardadas como número llevan un formato de fecha en styles.xml.
            const estilos = await leer('xl/styles.xml');
            const formatos = {};
            if (estilos) todos(estilos, 'numFmt').forEach(f => { formatos[f.getAttribute('numFmtId')] = f.getAttribute('formatCode') || ''; });
            const xfs = estilos ? todos(todos(estilos, 'cellXfs')[0] || estilos, 'xf').map(x => x.getAttribute('numFmtId') || '0') : [];
            const esFecha = id => (+id >= 14 && +id <= 22) || (+id >= 45 && +id <= 47) || /[dmy]/i.test((formatos[id] || '').replace(/"[^"]*"|\[[^\]]*\]/g, ''));
            const hojas = Object.keys(partes).filter(n => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            const hoja = hojas.length ? await leer(hojas[0]) : null;
            if (!hoja) throw new Error('sin hojas');
            const columna = ref => [...String(ref || '').replace(/\d+$/, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
            const rows = [];
            todos(hoja, 'row').forEach(fila => {
                const celdas = [];
                todos(fila, 'c').forEach((c, pos) => {
                    const tipo = c.getAttribute('t'), v = todos(c, 'v')[0]?.textContent ?? '';
                    let valor;
                    if (tipo === 's') valor = compartidas[+v] ?? '';
                    else if (tipo === 'inlineStr') valor = texto(c);
                    else if (!tipo || tipo === 'n') {
                        valor = v;
                        if (v !== '' && esFecha(xfs[+c.getAttribute('s') || 0])) {
                            const d = new Date(Math.round((+v - 25569) * 86400000));
                            valor = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
                        }
                    } else valor = v;
                    const idx = c.getAttribute('r') ? columna(c.getAttribute('r')) : pos;
                    while (celdas.length < idx) celdas.push('');
                    celdas[idx] = String(valor).trim();
                });
                if (celdas.some(Boolean)) rows.push(celdas);
            });
            const ancho = Math.max(0, ...rows.map(r => r.length));
            return rows.map(r => r.concat(Array(ancho - r.length).fill('')));
        }

        async function handleFinanceProImportFile(event) {
            const file = event.target.files[0];
            if (!file) return;
            if (/\.xls$/i.test(file.name)) { showToast('Ese Excel es del formato antiguo (.xls): ábrelo y guárdalo como .xlsx o CSV', true); return; }
            if (/\.xlsx$/i.test(file.name) || /spreadsheetml/.test(file.type)) {
                try { financeProCargarTextoImport(await financeProLeerExcel(file)); }
                catch (e) { console.error(e); showToast('No se pudo leer el Excel', true); }
                return;
            }
            try {
                const buf = await file.arrayBuffer();
                let texto;
                const b = new Uint8Array(buf.slice(0, 4));
                // UTF-16 (con su marca, o un archivo lleno de ceros entre letras) salía lleno de caracteres nulos.
                const u16 = (b[0] === 0xFF && b[1] === 0xFE) ? 'utf-16le' : (b[0] === 0xFE && b[1] === 0xFF) ? 'utf-16be' : (b[1] === 0 && b[3] === 0 && b[0] && b[2]) ? 'utf-16le' : null;
                if (u16) texto = new TextDecoder(u16).decode(buf);
                else try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
                catch (e) { texto = new TextDecoder('windows-1252').decode(buf); }
                financeProCargarTextoImport(texto);
            } catch (e) { console.error(e); showToast('No se pudo leer el archivo', true); }
        }

        // En el iPhone, "Copiar" en la hoja de compartir del CSV de Revolut
        // deja el texto del extracto en el portapapeles: así se importa sin
        // guardar el archivo. Si Safari no deja leer el portapapeles, queda
        // un cuadro donde pegarlo a mano.
        async function pegarExtractoBancario() {
            if (!document.getElementById('finance-pro-import-body')) openFinanceProImportModal();
            let texto = '';
            try { texto = await navigator.clipboard.readText(); } catch (e) { texto = ''; }
            if (financeProCargarTextoImport(texto, true)) return;
            document.getElementById('finance-pro-import-body').innerHTML = `
                <div class="modal-label">pega aquí el extracto:</div>
                <textarea class="modal-input" rows="6" placeholder="Type,Product,Started Date,..." oninput="financeProCargarTextoImport(this.value, true)"></textarea>`;
        }

        function financeProCargarTextoImport(texto, silencioso) {
            const imp = financeProPrepararImport(texto);
            if (!imp) {
                if (!silencioso) showToast('El archivo no tiene filas suficientes', true);
                return false;
            }
            window._financeProImport = imp;
            document.getElementById('finance-pro-import-body').innerHTML = renderFinanceProImportMapping();
            return true;
        }

        // Columnas adivinadas por cabecera y cuenta (la pedida, o la última
        // usada al importar). También la usa el conector, sin ventana.
        function financeProPrepararImport(texto, cuentaPedida) {
            const todas = Array.isArray(texto) ? texto : financeProParseCSV(String(texto || '').replace(/^\uFEFF/, '').trim());
            const filaCab = financeProFilaCabecera(todas);
            const rows = todas.slice(filaCab);
            const primera = rows[0] || [];
            const sinCabecera = primera.some(c => financeProParseDate(c)) && primera.some(c => !financeProParseDate(c) && Number.isFinite(financeProParseEuroAmount(c)));
            const cuentaDetectada = financeProDetectarCuenta(rows[0] || [], todas.slice(0, filaCab).flat().join(' '));
            if (rows.length < 1 || rows[0].length < 2) return null;
            const header = rows[0];
            // La fecha que cuenta es la de la compra, no la de cuando el
            // banco la liquida: una compra del 30 de septiembre que
            // Revolut completa el 1 de octubre es un gasto de septiembre.
            // Además siempre viene rellena (también en los pendientes).
            // La de finalización sigue usándose al reimportar para
            // reconocer movimientos ya importados con esa fecha (altDates).
            const date = financeProGuessColumn(header, ['started date', 'fecha de inicio', 'completed date', 'fecha de finalización', 'date', 'fecha', 'fecha operación', 'fecha operacion', 'fecha de operación', 'fecha de operacion', 'f. operación', 'f.operación', 'f. operativa', 'f. contable', 'f.contable', 'fecha contable', 'booking date', 'fecha valor', 'f. valor', 'f.valor'], 0, ['fecha', 'f. ', 'date', 'booking']);
            const amount = financeProGuessColumn(header, ['amount', 'importe', 'importe (€)', 'importe eur', 'cantidad', 'neto'], 1, ['importe', 'amount', 'cantidad']);
            let description = financeProGuessColumn(header, ['description', 'descripción', 'descripcion', 'concepto', 'detalle', 'movimiento', 'partner name', 'nombre', 'payment reference'], header.length > 2 ? 2 : 0, ['descrip', 'concepto']);
            // BBVA trae «Concepto» (Pago con tarjeta) y «Movimiento» (el comercio): manda el comercio.
            const iMov = header.findIndex(h => String(h || '').trim().toLowerCase() === 'movimiento');
            if (iMov >= 0 && String(header[description] || '').trim().toLowerCase() === 'concepto') description = iMov;
            // Bancos que separan cargo y abono (o debe y haber) en dos columnas y no traen «importe».
            const cabMin = header.map(h => String(h || '').trim().toLowerCase());
            const iCargo = cabMin.findIndex(h => /^(cargo|debe|gastos?|salida)/.test(h)), iAbono = cabMin.findIndex(h => /^(abono|haber|ingresos?|entrada)/.test(h));
            const separado = iCargo >= 0 && iAbono >= 0 && !cabMin.some(h => /^(importe|amount|cantidad|neto)/.test(h));
            const category = financeProGuessColumn(header, ['category', 'categoría', 'categoria'], -1);
            const status = financeProGuessColumn(header, ['state', 'estado'], -1);
            const account = FINANCE_PRO_ACCOUNT_KEYS.includes(cuentaPedida) ? cuentaPedida : cuentaDetectada || (FINANCE_PRO_ACCOUNT_KEYS.includes(financePro.cuentaImport) ? financePro.cuentaImport : FINANCE_PRO_ACCOUNT_KEYS[0]);
            if (sinCabecera) {
                // Sin cabecera, las columnas se deducen de la primera fila: la de la fecha, la del importe y el texto más largo.
                const iFecha = primera.findIndex(c => financeProParseDate(c));
                const iImporte = primera.findIndex((c, i) => i !== iFecha && !financeProParseDate(c) && Number.isFinite(financeProParseEuroAmount(c)));
                const iTexto = primera.map((c, i) => [i, String(c || '').length]).filter(([i]) => i !== iFecha && i !== iImporte).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
                return { rows, cuentaDetectada: !!cuentaDetectada && !cuentaPedida, cuentaPedida: !!cuentaPedida, mapping: { hasHeader: false, date: iFecha, amount: iImporte, description: iTexto, category: -1, amountOut: 0, amountIn: 1, splitAmount: false, account, status: -1, skipPending: false } };
            }
            return { rows, cuentaDetectada: !!cuentaDetectada && !cuentaPedida, cuentaPedida: !!cuentaPedida, mapping: { hasHeader: true, date, amount, description, category, amountOut: separado ? iCargo : 0, amountIn: separado ? iAbono : 1, splitAmount: separado, account, status, skipPending: false } };
        }

        function renderFinanceProImportMapping() {
            const imp = window._financeProImport;
            const headerRow = imp.rows[0];
            const previewRows = imp.rows.slice(imp.mapping.hasHeader ? 1 : 0, imp.mapping.hasHeader ? 4 : 3);
            const colOptions = (selected) => headerRow.map((h, i) => `<option value="${i}" ${Number(selected) === i ? 'selected' : ''}>${imp.mapping.hasHeader ? escapeHtml(String(h).slice(0, 24)) : 'Columna ' + (i + 1)}</option>`).join('');
            // Lo normal es no tocar nada: la cuenta sale del propio archivo y las columnas se adivinan. Todo eso queda
            // plegado en «columnas y opciones.»; a la vista, la cuenta, qué se importa y el botón.
            return `
                <div class="modal-label" style="margin-top:14px">cuenta.${imp.cuentaDetectada ? ' <span class="fin-imp-detectada">la he sacado del archivo.</span>' : financeProCuentaConfirmada(imp) ? '' : ' <span class="fin-imp-detectada fin-imp-aviso">no la he podido sacar del archivo: elígela o confírmala.</span>'}</div>
                <select class="modal-input" onchange="financeProImportSet('account', this.value)">
                    ${FINANCE_PRO_ACCOUNT_KEYS.map(k => `<option value="${k}" ${imp.mapping.account === k ? 'selected' : ''}>${escapeHtml(financePro.accounts[k].name)}</option>`).join('')}
                </select>
                ${financeProCuentaConfirmada(imp) ? '' : `<button class="btn-secondary" style="width:100%;margin-top:8px" onclick="window._financeProImport.cuentaConfirmada=true;document.getElementById('finance-pro-import-body').innerHTML=renderFinanceProImportMapping()">es ${escapeHtml(financeProCuentaNombre(imp.mapping.account))}.</button>`}
                ${renderFinanceProImportFilas(imp, previewRows)}
                <button class="btn-modal-primary" style="margin-top:14px" ${financeProCuentaConfirmada(imp) ? '' : 'disabled'} onclick="confirmFinanceProImport()">${financeProCuentaConfirmada(imp) ? financeProTextoBotonImport(imp) : 'elige la cuenta primero.'}</button>
                ${financeProTieneSaldo(imp) ? `<button class="m-enlace" style="display:block;margin:10px auto 0" onclick="openRehacerCuenta()">rehacer la cuenta con este extracto.</button>` : ''}
                <details class="fin-imp-avanzado"><summary>columnas y opciones.</summary>
                <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-primary);margin:14px 0 10px">
                    <input type="checkbox" ${imp.mapping.hasHeader ? 'checked' : ''} onchange="financeProImportSet('hasHeader', this.checked)"> La primera fila es cabecera
                </label>
                <div class="finance-correction-inputs">
                    <div><div class="modal-label">Columna de fecha</div><select class="modal-input" onchange="financeProImportSet('date', this.value)">${colOptions(imp.mapping.date)}</select></div>
                    <div><div class="modal-label">Columna de concepto</div><select class="modal-input" onchange="financeProImportSet('description', this.value)">${colOptions(imp.mapping.description)}</select></div>
                </div>
                <div class="modal-label">Columna de categoría (opcional)</div>
                <select class="modal-input" onchange="financeProImportSet('category', this.value)">
                    <option value="-1" ${imp.mapping.category === -1 ? 'selected' : ''}>Sin categoría</option>
                    ${colOptions(imp.mapping.category)}
                </select>
                <div class="finance-modal-note" style="margin:4px 0 10px">Si el texto de esa columna coincide con el nombre de una de tus categorías (Comida y bebida, Transporte...), se asigna sola. Si no coincide con ninguna, el movimiento entra sin categoría.</div>
                <div class="modal-label">Columna de estado (opcional)</div>
                <select class="modal-input" onchange="financeProImportSet('status', this.value)">
                    <option value="-1" ${imp.mapping.status === -1 ? 'selected' : ''}>No tengo esta columna</option>
                    ${colOptions(imp.mapping.status)}
                </select>
                ${imp.mapping.status >= 0 ? `
                <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-primary);margin:4px 0 10px">
                    <input type="checkbox" ${imp.mapping.skipPending ? 'checked' : ''} onchange="financeProImportSet('skipPending', this.checked)"> Omitir movimientos pendientes (PENDING)
                </label>` : `<div class="finance-modal-note" style="margin:4px 0 10px">Si tu fecha viene de la columna de "fecha de finalización" y un movimiento está pendiente (todavía sin esa fecha), se importa igual usando cualquier otra fecha de la fila.</div>`}
                <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-primary);margin:4px 0 10px">
                    <input type="checkbox" ${imp.mapping.splitAmount ? 'checked' : ''} onchange="financeProImportSet('splitAmount', this.checked)"> Mi banco separa cargo y abono en dos columnas
                </label>
                ${imp.mapping.splitAmount ? `
                <div class="finance-correction-inputs">
                    <div><div class="modal-label">Columna de cargo (gastos)</div><select class="modal-input" onchange="financeProImportSet('amountOut', this.value)">${colOptions(imp.mapping.amountOut)}</select></div>
                    <div><div class="modal-label">Columna de abono (ingresos)</div><select class="modal-input" onchange="financeProImportSet('amountIn', this.value)">${colOptions(imp.mapping.amountIn)}</select></div>
                </div>` : `
                <div class="modal-label">Columna de importe (negativo = gasto)</div>
                <select class="modal-input" onchange="financeProImportSet('amount', this.value)">${colOptions(imp.mapping.amount)}</select>`}
                </details>
            `;
        }

        function financeProImportSet(key, value) {
            const m = window._financeProImport.mapping;
            if (key === 'hasHeader' || key === 'splitAmount' || key === 'skipPending' || key === 'account') m[key] = value;
            else m[key] = Number(value);
            window._financeProImport.excluidas = null;
            if (key === 'account') window._financeProImport.cuentaConfirmada = true;
            document.getElementById('finance-pro-import-body').innerHTML = renderFinanceProImportMapping();
        }

        function financeProParseEuroAmount(str) {
            if (str === undefined || str === null) return NaN;
            // Santander escribe el negativo con el signo menos tipográfico (−).
            let s = String(str).trim().replace(/[\u2212\u2013]/g, '-').replace(/eur/gi, '').replace(/[€\s\u00a0]/g, '');
            if (!s) return NaN;
            let negativo = false;
            if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1); }
            if (/-$/.test(s)) { negativo = true; s = s.slice(0, -1); }
            // Algunos bancos marcan el signo con DR/CR (débito y crédito) o D/H al final.
            const marca = s.match(/(DR|CR|D|H)$/i);
            if (marca) { negativo = /^(DR|D)$/i.test(marca[1]); s = s.slice(0, -marca[1].length); }
            if (s.includes(',') && s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
            else if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
            else s = s.replace(/,/g, '');
            const n = Number(s);
            return negativo ? -Math.abs(n) : n;
        }

        // Solo fechas que existen: «31/02/2026» o «10/29/2026» (formato de EE. UU.) daban fechas imposibles que
        // descolocaban orden, presupuestos y duplicados. Si el día es mayor que 12 y el mes no, se da la vuelta.
        function financeProParseDate(str) {
            const iso = financeProParseDateCruda(str);
            if (!iso) return null;
            let [y, mo, d] = iso.split('-').map(Number);
            if (mo > 12 && d <= 12) [mo, d] = [d, mo];
            const f = new Date(y, mo - 1, d);
            if (f.getFullYear() !== y || f.getMonth() !== mo - 1 || f.getDate() !== d) return null;
            return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
        function financeProParseDateCruda(str) {
            const s = String(str || '').trim();
            let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
            if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
            m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
            if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
            m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})(?!\d)/);
            if (m) return `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
            return null;
        }

        async function confirmFinanceProImport() {
            const imp = window._financeProImport;
            await financeImportGuardarAntes(`importación de ${financeProCuentaNombre(imp.mapping.account)}`);
            const r = financeProEjecutarImport(imp);
            closeModal();
            render();
            try { await saveData(); showToast(financeProResumenImport(r)); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
            let cuadre = financeProCuadreExtracto(imp);
            const quitados = financeProResolverDuplicados(cuadre);
            if (quitados) {
                cuadre = financeProCuadreExtracto(imp);
                render();
                try { await saveData(); } catch (e) { console.error(e); }
            }
            if (cuadre && !cuadre.cuadra) openFinanceProCuadre(cuadre);
            else if (cuadre) showToast(`${financeProResumenImport(r)}${quitados ? `, ${quitados} ${quitados === 1 ? 'duplicado quitado' : 'duplicados quitados'}` : ''}, saldo cuadrado con el extracto: ${cuadre.retenido ? `${financeMoney(cuadre.saldoBanco)} en el banco menos ${financeMoney(cuadre.retenido)} retenidos que aún no enseña, ${financeMoney(cuadre.esperado)}` : financeMoney(cuadre.esperado)}`);
        }

        // ============================================================
        //  CUADRE CON EL SALDO DEL EXTRACTO
        //  Si el extracto trae el saldo tras cada movimiento (Revolut, la
        //  columna Balance), ese saldo es el real y manda. Tras importar se
        //  compara con el de Bitácora a la misma fecha; si no coincide, se
        //  cruzan uno a uno los movimientos de esas fechas y se enseña qué
        //  sobra (un duplicado) o qué falta, para arreglarlo con un botón.
        // ============================================================
        function financeProCuadreExtracto(imp) {
            const m = imp?.mapping;
            if (!m?.hasHeader) return null;
            const cab = imp.rows[0].map(h => String(h || '').trim().toLowerCase());
            const iSaldo = cab.findIndex(h => /^(balance|saldo|disponible)\b/.test(h));
            if (iSaldo < 0) return null;
            const filas = [];
            const iProd = cab.indexOf('product');
            imp.rows.slice(1).forEach((r, orden) => {
                const st = m.status >= 0 ? String(r[m.status] || '').toLowerCase() : '';
                if (/revert|declin|fail|cancel|rechaz|anulad|fallid/.test(st)) return;
                // Las huchas de Revolut (Savings) llevan su propio saldo: no son de la cuenta.
                if (iProd >= 0 && String(r[iProd] || '').trim().toLowerCase() !== 'current') return;
                const fechas = r.map(financeProParseDate).filter(Boolean);
                let val;
                if (m.splitAmount) {
                    const ent = financeProParseEuroAmount(r[m.amountIn]), sal = financeProParseEuroAmount(r[m.amountOut]);
                    val = (Number.isFinite(ent) ? Math.abs(ent) : 0) - (Number.isFinite(sal) ? Math.abs(sal) : 0);
                } else val = financeProParseEuroAmount(r[m.amount]);
                if (!Number.isFinite(val) || !val || !fechas.length) return;
                filas.push({ orden, fechas, val: Math.round(val * 100) / 100, desc: (r[m.description] || '').trim(), pend: /pending|pendiente|processing|procesando/.test(st), saldo: financeProParseEuroAmount(r[iSaldo]) });
            });
            const completas = filas.filter(f => !f.pend && Number.isFinite(f.saldo));
            if (!completas.length) return null;
            // El extracto puede venir de más antiguo a más nuevo o al revés.
            const asc = completas[0].fechas[completas[0].fechas.length - 1] <= completas[completas.length - 1].fechas[completas[completas.length - 1].fechas.length - 1];
            const ultima = asc ? completas[completas.length - 1] : completas[0];
            const esperado = Math.round((ultima.saldo + filas.filter(f => f.pend && f.val < 0).reduce((x, f) => x + f.val, 0)) * 100) / 100;
            const todas = filas.flatMap(f => f.fechas);
            const desde = todas.reduce((a, b) => a < b ? a : b), hasta = todas.reduce((a, b) => a > b ? a : b);
            const cuenta = m.account;
            const signo = t => t.type === 'transfer' ? (t.account === cuenta ? -1 : 1) : t.type === 'income' ? 1 : -1;
            const deCuenta = t => t.account === cuenta || t.transferTo === cuenta;
            let actual = Number(financePro.accounts[cuenta]?.balance0 || 0);
            financePro.transactions.forEach(t => { if (deCuenta(t) && financeProCuentaEnSaldo(t) && t.date <= hasta) actual += signo(t) * (Number(t.amount) || 0); });
            actual = Math.round(actual * 100) / 100;
            if (Math.abs(esperado - actual) < 0.005) return { cuadra: true, esperado, actual, cuenta };
            // El primer día del extracto no está entero: el de octubre de Revolut
            // trae del 30 de septiembre solo lo que se completó el 1 (eBay), y
            // lo completado el mismo 30 está en el de septiembre. Se cruza desde
            // el primer día en que se completó algo, en los dos lados.
            const lleno = completas.map(f => f.fechas.reduce((a, b) => a > b ? a : b)).reduce((a, b) => a < b ? a : b);
            const inicioFila = f => f.fechas.reduce((a, b) => a < b ? a : b);
            const movs = financePro.transactions.filter(t => deCuenta(t) && t.date >= lleno && t.date <= hasta && financeProCuentaEnSaldo(t))
                .map(t => ({ t, val: Math.round(signo(t) * (Number(t.amount) || 0) * 100) / 100 }));
            const libres = new Set(movs);
            const libresFilas = new Set(filas.filter(f => !(f.pend && f.val > 0) && inicioFila(f) >= lleno));
            const cerca = (f, t) => f.fechas.some(d => Math.abs((new Date(d) - new Date(t.date)) / 86400000) <= 3);
            const emparejar = exigeNombre => [...libresFilas].forEach(f => {
                const mov = [...libres].find(x => Math.abs(x.val - f.val) < 0.005 && (exigeNombre
                    ? f.fechas.includes(x.t.date) && financeProNormalizar(x.t.bankNote ?? x.t.note) === financeProNormalizar(f.desc)
                    : cerca(f, x.t)));
                if (mov) { libres.delete(mov); libresFilas.delete(f); }
            });
            emparejar(true);
            emparejar(false);
            // Lo que pasaste a otra cuenta en los últimos días y el banco aún no enseña (Ibercaja retiene la recarga de
            // Revolut hasta que se completa) está retenido: con eso, si cuadra, no es un descuadre ni hay que ajustar.
            const retenidos = [...libres].filter(x => x.val < 0 && x.t.type === 'transfer' && x.t.account === cuenta && x.t.date >= financeProSumarDias(hasta, -4));
            const retenido = Math.round(-retenidos.reduce((a, x) => a + x.val, 0) * 100) / 100;
            if (retenido && Math.abs(esperado - retenido - actual) < 0.005) return { cuadra: true, esperado: actual, actual, cuenta, retenido, saldoBanco: esperado };
            // Un sobrante con su gemelo en el extracto (mismo importe, ±3 días)
            // es un duplicado de un movimiento que sí está: el apunte a mano o
            // renombrado que no se fundió con el del banco.
            // Lo de Bitácora posterior al final del extracto (el CSV acaba el 30 a mediodía y el café del 30 se completó el 1)
            // no entra en el saldo que da el extracto: se aparta antes de comparar.
            // El extracto se corta por la fecha de completado: lo del último día que no está en él se completó después.
            const posteriores = [...libres].filter(x => x.t.date >= hasta && !retenidos.includes(x));
            if (posteriores.length) {
                posteriores.forEach(x => libres.delete(x));
                actual = Math.round((actual - posteriores.reduce((a, x) => a + x.val, 0)) * 100) / 100;
                if (Math.abs(esperado - actual) < 0.005) return { cuadra: true, esperado, actual, cuenta };
            }
            const gemelo = x => movs.find(o => o !== x && !libres.has(o) && Math.abs(o.val - x.val) < 0.005 && Math.abs((new Date(o.t.date) - new Date(x.t.date)) / 86400000) <= 3);
            // Lo retenido (salidas recientes a otra cuenta que el banco aún no enseña) no es un sobrante: al fijar el saldo
            // de partida se descuenta, o Ibercaja quedaba con la transferencia a Revolut contada como si no hubiera salido.
            retenidos.forEach(x => libres.delete(x));
            return { cuadra: false, esperado, actual, diff: Math.round((esperado - retenido - actual) * 100) / 100, retenido, cuenta, desde: lleno, hasta,
                sobran: [...libres].map(x => x.t), faltan: [...libresFilas],
                duplicados: [...libres].map(x => ({ t: x.t, val: x.val, gemelo: gemelo(x)?.t })) };
        }

        // Si todo lo que sobra son duplicados de movimientos del extracto y
        // quitarlos deja el saldo exacto, se resuelve solo: se quita cada
        // duplicado y su nota y categoría pasan a su gemelo del banco. Si no
        // cuadra al céntimo, no se toca nada y se enseña el aviso.
        function financeProResolverDuplicados(c) {
            if (!c || c.cuadra || c.faltan.length || !c.duplicados?.length || c.duplicados.some(d => !d.gemelo)) return false;
            const efecto = -c.duplicados.reduce((x, d) => x + d.val, 0);
            if (Math.abs(efecto - c.diff) >= 0.005) return false;
            const fuera = new Set();
            c.duplicados.forEach(({ t, gemelo }) => {
                if (!gemelo.category && t.category) { gemelo.category = t.category; gemelo.needsReview = false; delete gemelo.categoriaAuto; }
                if (t.note && t.note !== gemelo.note && financeProNormalizar(t.note) !== financeProNormalizar(gemelo.bankNote ?? gemelo.note)) {
                    if (!gemelo.bankNote) gemelo.bankNote = gemelo.note;
                    gemelo.note = t.note;
                }
                fuera.add(t);
            });
            financePro.transactions = financePro.transactions.filter(t => !fuera.has(t));
            return fuera.size;
        }

        function openFinanceProCuadre(c) {
            window._financeProCuadre = c;
            const sobranSuma = c.sobran.reduce((x, t) => x + Math.abs(Number(t.amount) || 0), 0);
            const nombre = financePro.accounts[c.cuenta]?.name || c.cuenta;
            showModal(`
                <div class="modal-title">el saldo no cuadra.</div>
                <div class="finance-cuadre-cifras">
                    <div><small>el extracto dice</small><b>${financeMoney(c.esperado)}</b></div>
                    <div><small>bitácora dice</small><b>${financeMoney(c.actual)}</b></div>
                    <div class="${c.diff ? 'mal' : ''}"><small>diferencia</small><b>${c.diff > 0 ? '+' : ''}${financeMoney(c.diff)}</b></div>
                </div>
                <p class="finance-modal-note">Saldo de ${escapeHtml(nombre)} a ${financeDateLabelShort(c.hasta)}, ya descontados los cargos pendientes. He cruzado uno a uno los movimientos del ${financeDateLabelShort(c.desde)} al ${financeDateLabelShort(c.hasta)} con el extracto.</p>
                ${c.sobran.length ? `<div class="modal-label">sobran en bitácora (no están en el extracto)</div>
                <div class="finance-viaje-lista">${c.sobran.map(t => `<label class="finance-viaje-fila"><input type="checkbox" checked data-cuadre="${t.id}"><span>${financeDateLabelShort(t.date)}</span><b>${escapeHtml(t.note || t.bankNote || financeProCategoryById(t.category)?.name || 'movimiento')}</b><i>${t.type === 'income' ? '+' : '-'}${financeMoney(t.amount)}</i></label>`).join('')}</div>` : ''}
                ${c.faltan.length ? `<div class="modal-label">faltan en bitácora (están en el extracto)</div>
                <div class="finance-viaje-lista">${c.faltan.map(f => `<div class="finance-viaje-fila"><span></span><span>${financeDateLabelShort(f.fechas[0])}</span><b>${escapeHtml(f.desc)}</b><i>${f.val > 0 ? '+' : ''}${financeMoney(f.val)}</i></div>`).join('')}</div>` : ''}
                ${c.sobran.length ? `<button class="btn-modal-primary" onclick="financeProQuitarSobrantes()">quitar los marcados.</button>` : ''}
                <button class="btn-secondary" style="margin-top:8px" onclick="financeProAjustarAlExtracto()">ajustar el saldo a ${financeMoney(c.esperado)}.</button>
                <button class="btn-secondary" style="margin-top:8px" onclick="financeProFijarSaldoInicial()">fijar el saldo de partida.</button>
                <div class="finance-modal-note">Fijar el saldo de partida no añade ningún movimiento: cambia con cuánto empezaba la cuenta para que coincida con el extracto. Es lo que toca al importar el historial de meses atrás. Antes, quita lo que sobra si son ajustes de saldo antiguos.</div>
                <div class="finance-modal-note">${c.sobran.length && Math.abs(sobranSuma - Math.abs(c.diff)) < 0.005 ? 'Lo que sobra explica justo la diferencia: quitándolo, cuadra.' : c.sobran.length || c.faltan.length ? 'Revisa la lista: si la diferencia viene de antes de estas fechas, el ajuste la deja a cero sin tocar nada más.' : 'Los movimientos de estas fechas coinciden: la diferencia viene de antes. El ajuste la deja a cero sin tocar tu histórico.'}</div>
            `);
        }

        async function financeProQuitarSobrantes() {
            const ids = new Set([...document.querySelectorAll('[data-cuadre]:checked')].map(i => i.dataset.cuadre));
            if (!ids.size) return;
            financePro.transactions = financePro.transactions.filter(t => !ids.has(t.id));
            const c = window._financeProCuadre;
            closeModal();
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); return; }
            const saldo = Math.round(financeProAccountBalance(c.cuenta) * 100) / 100;
            showToast(`${ids.size} ${ids.size === 1 ? 'movimiento quitado' : 'movimientos quitados'}. ${Math.abs(saldo - c.esperado) < 0.005 ? 'Cuadra con el extracto.' : `Saldo: ${financeMoney(saldo)}.`}`);
        }

        async function financeProAjustarAlExtracto() {
            const c = window._financeProCuadre;
            const diff = Math.round((c.esperado - c.actual) * 100) / 100;
            closeModal();
            if (Math.abs(diff) < 0.005) return;
            financePro.transactions.push({ id: 'ptx_adj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), date: c.hasta, account: c.cuenta, type: diff > 0 ? 'income' : 'expense', amount: Math.abs(diff), note: 'Ajuste de saldo', ajuste: true });
            render();
            try { await saveData(); showToast(`Saldo ajustado al del extracto: ${financeMoney(c.esperado)}`); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function financeProResumenImport(r) {
            const { added, skipped, conciliados, completados, anulados, categorizados, traspasos } = r;
            return `${added} movimiento${added === 1 ? '' : 's'} importado${added === 1 ? '' : 's'}${traspasos ? `, ${traspasos} ${traspasos === 1 ? 'traspaso' : 'traspasos'} entre tus cuentas` : ''}${conciliados ? `, ${conciliados} fusionado${conciliados === 1 ? '' : 's'} con movimientos ya registrados` : ''}${completados ? `, ${completados} pendiente${completados === 1 ? '' : 's'} ya completado${completados === 1 ? '' : 's'}` : ''}${anulados ? `, ${anulados} pendiente${anulados === 1 ? '' : 's'} anulado${anulados === 1 ? '' : 's'} y retirado${anulados === 1 ? '' : 's'}` : ''}${categorizados ? `, ${categorizados} categorizado${categorizados === 1 ? '' : 's'} solo${categorizados === 1 ? '' : 's'}` : ''}${skipped ? `, ${skipped} omitido${skipped === 1 ? '' : 's'}` : ''}`;
        }

        function financeProEjecutarImport(imp) {
            const m = imp.mapping;
            financePro.cuentaImport = m.account;
            const rows = m.hasHeader ? imp.rows.slice(1) : imp.rows;
            // Si el extracto trae la fecha de inicio (Revolut), esa es la del
            // gasto aunque se eligiera la de finalización: si no, un pago que
            // se completaba días después quedaba con la fecha de completado.
            const cabecera = m.hasHeader ? imp.rows[0].map(h => String(h || '').trim().toLowerCase()) : [];
            const colInicio = cabecera.findIndex(h => h === 'started date' || h === 'fecha de inicio');
            const fechaInicio = r => colInicio >= 0 ? financeProParseDate(r[colInicio]) : null;
            const fechasArchivo = [];
            const horaDe = r => { const h = String((colInicio >= 0 ? r[colInicio] : r[m.date]) || '').match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/); return h ? `${h[1].padStart(2, '0')}:${h[2]}:${h[3] || '00'}` : undefined; };
            // Sin hora, el orden de las filas: unos bancos listan de más nuevo
            // a más antiguo (Ibercaja, Santander) y otros al revés (Revolut).
            const fechaFila = r => fechaInicio(r) || financeProParseDate(r[m.date]) || '';
            const deMasNuevo = rows.length > 1 && fechaFila(rows[0]) > fechaFila(rows[rows.length - 1]);
            const ordenDe = i => deMasNuevo ? rows.length - 1 - i : i;
            // Una transferencia sale en el extracto de las dos cuentas (gasto en
            // una, ingreso en la otra), y un movimiento importado que luego se
            // editó guarda en claveImport cómo venía del banco: si no, al
            // volver a importar el extracto entraría otra vez.
            // Se cuentan las veces, no solo si la clave existe: dos cafés
            // iguales el mismo día son dos movimientos, y al reimportar un
            // extracto que se solapa con el anterior (Revolut solo exporta
            // meses enteros) cada fila tiene que encontrar su pareja.
            const existentes = new Map();
            const sumarClave = k => existentes.set(k, (existentes.get(k) || 0) + 1);
            financePro.transactions.forEach(t => {
                const nota = t.bankNote ?? t.note ?? '';
                [`${t.account}|${t.date}|${t.amount}|${nota}`, t.transferTo && `${t.transferTo}|${t.date}|${t.amount}|${nota}`, t.claveImport, t.claveImport2].filter(Boolean).forEach(sumarClave);
            });
            const vistas = new Map();
            const yaEsta = k => (vistas.get(k) || 0) < (existentes.get(k) || 0);
            const consumir = k => vistas.set(k, (vistas.get(k) || 0) + 1);
            const registrar = k => { sumarClave(k); consumir(k); };
            // Movimientos importados a los que se les cambió la nota antes de
            // que se guardara aparte el concepto del banco: ninguna fila del
            // archivo los nombra igual, así que la fila con la misma cuenta,
            // día e importe que no tenga su pareja exacta es ese movimiento.
            const clavesArchivo = new Set();
            rows.forEach(r => {
                const fechas = r.map(financeProParseDate).filter(Boolean);
                const val = financeProParseEuroAmount(m.splitAmount ? (r[m.amountIn] || r[m.amountOut]) : r[m.amount]);
                if (Number.isFinite(val)) fechas.forEach(f => clavesArchivo.add(`${f}|${Math.abs(val)}|${(r[m.description] || '').trim()}`));
            });
            const reclamados = new Set();
            const buscarEditado = (cuenta, fechas, importe) => financePro.transactions.find(t =>
                !t.manual && !t.pendiente && !reclamados.has(t) && (!financeProEsAuto(t) || t.conciliado)
                && (t.account === cuenta || t.transferTo === cuenta) && fechas.includes(t.date)
                && Math.abs(Number(t.amount) - importe) < 0.005
                && !clavesArchivo.has(`${t.date}|${Number(t.amount)}|${t.bankNote ?? t.note ?? ''}`));
            const activeRules = financePro.rules.filter(r => r.enabled);
            let added = 0, skipped = 0, conciliados = 0, completados = 0, anulados = 0;
            // Revolut repite a veces un cargo: el primer intento queda
            // REVERTED y el reintento PENDING, mismo comercio, importe y día
            // (Breasy 0,45 €). La fila anulada no debe retirar el pendiente
            // que corresponde al reintento, que sigue en el extracto.
            const clavePendiente = (nota, importe, fecha) => `${financeProNormalizar(nota).trim()}|${Number(importe).toFixed(2)}|${fecha}`;
            const pendientesEnArchivo = new Set();
            const pendientesUsados = new Set();
            if (m.status >= 0) rows.forEach(r => {
                if (!/pending|pendiente|processing|procesando/.test(String(r[m.status] || '').toLowerCase())) return;
                const fecha = financeProParseDate(r[m.date]) || r.map(financeProParseDate).find(Boolean);
                const val = financeProParseEuroAmount(m.splitAmount ? (r[m.amountIn] || r[m.amountOut]) : r[m.amount]);
                if (fecha && Number.isFinite(val)) pendientesEnArchivo.add(clavePendiente(r[m.description], Math.abs(val), fecha));
            });
            rows.forEach((r, fila) => {
                if (imp.excluidas?.has(fila)) { skipped++; return; }
                const hora = horaDe(r);
                const marcaDia = hora ? { hora } : { orden: ordenDe(fila) };
                const ponerMarca = t => { if (t && !t.hora && t.orden == null) Object.assign(t, marcaDia); };
                const statusVal = m.status >= 0 ? String(r[m.status] || '').trim().toLowerCase() : '';
                const esPendiente = /pending|pendiente|processing|procesando/.test(statusVal);
                // Revolut deja en el extracto los cargos que nunca llegaron a
                // cobrarse (REVERTED, DECLINED, FAILED): no son movimientos
                // reales, y si se habían importado como pendientes se quitan.
                const esAnulado = /revert|declin|fail|cancel|rechaz|anulad|fallid/.test(statusVal);
                if (esPendiente && m.skipPending) { skipped++; return; }
                // Otras columnas de la fila que también parezcan una fecha
                // (normalmente "fecha de inicio") — un movimiento que se
                // importó pendiente usó esa fecha porque la de finalización
                // todavía estaba vacía; cuando se vuelve a importar ya
                // completado, aparece con la fecha de verdad y dejaría de
                // coincidir con el que ya existe si solo se comparase esa.
                const altDates = [];
                r.forEach((cell, i) => {
                    if (i === m.date) return;
                    const d = financeProParseDate(cell);
                    if (d) altDates.push(d);
                });
                let date = fechaInicio(r) || financeProParseDate(r[m.date]);
                if (!date) {
                    // Fecha vacía en la columna elegida — típico de "fecha de
                    // finalización" en un movimiento todavía pendiente.
                    date = altDates[0] || null;
                }
                if (!date) { skipped++; return; }
                fechasArchivo.push(date);
                const description = (r[m.description] || '').trim();
                let amount, type;
                if (m.splitAmount) {
                    const out = financeProParseEuroAmount(r[m.amountOut]);
                    const inAmt = financeProParseEuroAmount(r[m.amountIn]);
                    if (Number.isFinite(inAmt) && inAmt > 0) { amount = inAmt; type = 'income'; }
                    else if (Number.isFinite(out) && out !== 0) { amount = Math.abs(out); type = 'expense'; }
                    else { skipped++; return; }
                } else {
                    const val = financeProParseEuroAmount(r[m.amount]);
                    if (!Number.isFinite(val) || val === 0) { skipped++; return; }
                    amount = Math.abs(val); type = val < 0 ? 'expense' : 'income';
                }
                // Regla de traspaso: en vez de ingreso/gasto, se registra
                // como movimiento entre m.account y la otra cuenta de la
                // regla — restando de un lado y sumando en el otro, sin
                // contar como ingreso o gasto real en las estadísticas.
                const rule = activeRules.find(rl => description.toLowerCase().includes(rl.matchText.toLowerCase()) && rl.otherAccount !== m.account)
                    || financeProTraspasoAprendido(m.account, type, description);
                const effectiveAccount = rule ? (type === 'income' ? rule.otherAccount : m.account) : m.account;
                const dedupeKey = `${effectiveAccount}|${date}|${amount}|${description}`;
                // Primero, lo que ya existe tal cual (misma cuenta, día, importe
                // y concepto): esa fila es ese movimiento y no se busca nada
                // más. Antes se buscaba antes un pendiente parecido, y el
                // aparcamiento del 1 de octubre «completaba» el pendiente del
                // 9, que se movía al día 1 y quedaba duplicado.
                if (!esAnulado) {
                    const exacta = [dedupeKey, ...altDates.map(d => `${effectiveAccount}|${d}|${amount}|${description}`)].find(yaEsta);
                    if (exacta) {
                        consumir(exacta);
                        ponerMarca(financePro.transactions.find(t => !t.hora && t.orden == null && [`${t.account}|${t.date}|${t.amount}|${t.bankNote ?? t.note ?? ''}`, t.claveImport].includes(exacta)));
                        const pend = !esPendiente && financePro.transactions.find(t => t.pendiente && !pendientesUsados.has(t) && `${t.account}|${t.date}|${t.amount}|${t.bankNote ?? t.note ?? ''}` === exacta);
                        if (pend) { delete pend.pendiente; pendientesUsados.add(pend); completados++; } else skipped++;
                        return;
                    }
                }
                // Un pendiente ya importado se actualiza al llegar completado
                // (el importe final puede cambiar: divisa, propina, reserva
                // de hotel) en vez de entrar otra vez como movimiento nuevo.
                // Dos pendientes solo son el mismo si comparten fecha de
                // inicio exacta: si no, serían dos compras en el mismo sitio.
                const candidato = financeProBuscarPendiente({ account: effectiveAccount, type: rule ? 'transfer' : type, amount, date, altDates, note: description }, pendientesUsados);
                if (candidato) pendientesUsados.add(candidato);
                const pendiente = candidato && esPendiente && candidato.date !== date ? null : candidato;
                if (esAnulado) {
                    const sigueEnArchivo = pendiente && pendientesEnArchivo.has(clavePendiente(pendiente.bankNote ?? pendiente.note, pendiente.amount, pendiente.date));
                    if (pendiente && !sigueEnArchivo) { financePro.transactions = financePro.transactions.filter(t => t !== pendiente); anulados++; }
                    else skipped++;
                    return;
                }
                if (pendiente) {
                    if (esPendiente) { pendiente.amount = amount; skipped++; return; }
                    Object.assign(pendiente, { date: pendiente.date && pendiente.date < date ? pendiente.date : date, amount });
                    ponerMarca(pendiente);
                    delete pendiente.pendiente;
                    registrar(dedupeKey);
                    completados++;
                    return;
                }
                // Se comprueba también con las fechas alternativas de la
                // fila (ver altDates arriba) para no duplicar un movimiento
                // que ya se importó pendiente con otra fecha.
                const repetida = [dedupeKey, ...altDates.map(d => `${effectiveAccount}|${d}|${amount}|${description}`)].find(yaEsta);
                if (repetida) { consumir(repetida); skipped++; return; }
                // En la cuenta del extracto: con una regla de traspaso, effectiveAccount es la otra (Ibercaja), y allí encontraba
                // cualquier movimiento del mismo día e importe (el historial antiguo) y daba la recarga por ya apuntada.
                const editado = !esPendiente && buscarEditado(m.account, [date, ...altDates], amount);
                if (editado) {
                    reclamados.add(editado);
                    if (!editado.bankNote && description) editado.bankNote = description;
                    skipped++;
                    return;
                }
                // Una transferencia entre tus cuentas grabada a mano (o ya traída del otro banco) es esta fila si va en el
                // mismo sentido, por el mismo importe y a 4 días como mucho: se concilia y guarda el concepto del banco
                // para reconocerla al reimportar. Así puedes apuntar el traspaso a Revolut el día que lo haces y, cuando
                // Ibercaja lo enseñe (y Revolut), no se duplica.
                const traspaso = !esPendiente && financeProTraspasoCercano(m.account, type, amount, [date, ...altDates], reclamados);
                if (traspaso) {
                    reclamados.add(traspaso);
                    const clave = `${m.account}|${date}|${amount}|${description}`;
                    if (!traspaso.claveImport) traspaso.claveImport = clave;
                    else if (traspaso.claveImport !== clave) traspaso.claveImport2 = clave;
                    traspaso.conciliado = true;
                    ponerMarca(traspaso);
                    registrar(dedupeKey);
                    conciliados++;
                    return;
                }
                registrar(dedupeKey);
                // La otra mitad ya puede estar en la otra cuenta como gasto o ingreso suelto (un historial traído de otra
                // app con «Transferir, retirar»): se convierte en este traspaso en vez de crear otro, o se restaba dos veces.
                const mitad = rule && financeProMitadSuelta(rule.otherAccount, type === 'income' ? 'expense' : 'income', amount, [date, ...altDates], reclamados);
                if (mitad) {
                    reclamados.add(mitad);
                    if (!mitad.bankNote && mitad.note) mitad.bankNote = mitad.note;
                    Object.assign(mitad, { type: 'transfer', account: effectiveAccount, transferTo: type === 'income' ? m.account : rule.otherAccount, category: undefined, needsReview: false, categoriaAuto: undefined, conciliado: true });
                    if (!mitad.claveImport) mitad.claveImport = dedupeKey; else mitad.claveImport2 = dedupeKey;
                    conciliados++;
                    return;
                }
                if (rule) {
                    financePro.transactions.push({
                        id: 'ptx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + added,
                        date, type: 'transfer',
                        account: effectiveAccount,
                        transferTo: type === 'income' ? m.account : rule.otherAccount,
                        amount, note: description || undefined,
                        pendiente: esPendiente || undefined, ...marcaDia
                    });
                    pendientesUsados.add(financePro.transactions[financePro.transactions.length - 1]);
                    added++;
                    return;
                }
                let category;
                if (m.category >= 0) {
                    const raw = (r[m.category] || '').trim().toLowerCase();
                    const match = raw && financePro.categories.find(c => c.type === type && c.name.toLowerCase() === raw);
                    if (match) category = match.id;
                }
                // El concepto pasa a ser el del banco para que reimportar el
                // mismo extracto lo reconozca por la clave exacta de arriba.
                let auto = type === 'expense' && financePro.transactions.find(t => financeProEsAuto(t) && !t.manual && financeProMismoCargo(t, { type, date, amount, account: m.account, note: description }));
                // Un gasto grabado a mano manda sobre crear un movimiento
                // nuevo para la suscripción: si no, la cuota de TV Football
                // Club grabada a mano y la del extracto quedaban las dos.
                const manualPrevio = !auto && financeProBuscarManual({ type, date, amount, account: m.account });
                const recurrente = type === 'expense' && !auto && financeProBuscarRecurrente({ date, amount, account: m.account, note: description });
                if (manualPrevio && recurrente && !manualPrevio.recurringEntryId) {
                    manualPrevio.recurringEntryId = recurrente.entry.id;
                    manualPrevio.cicloMes = recurrente.ciclo;
                }
                let nuevo = false;
                if (recurrente && !manualPrevio) {
                    auto = financePro.transactions.find(t => financeProEsAuto(t) && t.recurringEntryId === recurrente.entry.id && financeProCicloMes(t) === recurrente.ciclo);
                    if (!auto) {
                        auto = { id: 'ptx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + added, type, recurringEntryId: recurrente.entry.id, cicloMes: recurrente.ciclo };
                        financePro.transactions.push(auto);
                        nuevo = true;
                    }
                }
                if (auto) {
                    if (auto.recurringEntryId) {
                        auto.cicloMes = financeProCicloMes(auto);
                        if (!esPendiente) financeProAprenderConcepto(auto.recurringEntryId, description);
                        // Si el banco la cobra en otra cuenta, esa pasa a ser la
                        // de la suscripción y los próximos cargos se crean ahí.
                        const e = entries.find(x => x.id === auto.recurringEntryId);
                        if (e && !esPendiente && (e.proAccount || e.type === 'subscription') && financeProCuentaRecurrente(e) !== m.account) e.proAccount = m.account;
                    }
                    Object.assign(auto, { date, account: m.account, amount, note: description || auto.note, conciliado: true, pendiente: esPendiente || undefined, ...marcaDia });
                    pendientesUsados.add(auto);
                    if (category) auto.category = category;
                    if (nuevo) added++; else conciliados++;
                    return;
                }
                // Un gasto grabado a mano casi nunca lleva el concepto del
                // banco, así que se empareja por misma cuenta, mismo tipo,
                // importe exacto y ±3 días (el más cercano si hay varios).
                // Fecha e importe pasan a ser los del banco, que son los
                // fiables; la nota y la categoría que puso el usuario se
                // conservan, y el concepto del banco se guarda en bankNote
                // para que reimportar el extracto lo siga reconociendo.
                const manual = manualPrevio;
                if (manual) {
                    Object.assign(manual, { date, account: m.account, bankNote: description, conciliado: true, pendiente: esPendiente || undefined, ...marcaDia });
                    pendientesUsados.add(manual);
                    if (!manual.note && description) manual.note = description;
                    if (!manual.category && category) manual.category = category;
                    if (manual.category) manual.needsReview = false;
                    if (manual.recurringEntryId && !esPendiente) financeProAprenderConcepto(manual.recurringEntryId, description);
                    conciliados++;
                    return;
                }
                financePro.transactions.push({
                    id: 'ptx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + added,
                    date, account: m.account, type, amount, category, note: description || undefined,
                    pendiente: esPendiente || undefined,
                    ahorro: /^(From|To) [A-Z]{3} \S/.test(description) || undefined,
                    ...marcaDia
                });
                pendientesUsados.add(financePro.transactions[financePro.transactions.length - 1]);
                added++;
            });
            conciliados += financeProFusionarManuales(m.account, fechasArchivo);
            const traspasos = financeProEmparejarTraspasos(fechasArchivo);
            const categorizados = financeProAutoCategorizar();
            return { added, skipped, conciliados, completados, anulados, categorizados, traspasos };
        }

        // ============================================================
        //  SUSCRIPCIONES Y GASTOS FIJOS (paralelas)
        // ============================================================
        function renderRecurringColumn(type, label, icon) {
            const items = entries.filter(e => e.type === type);
            const active = items.filter(i => i.active !== false);
            const total = active.reduce((s, e) => s + (e.amount || 0), 0);
            const todayDay = new Date().getDate();
            const sorted = [...active].sort((a, b) => {
                const da = a.renewalDay < todayDay ? a.renewalDay + 31 : a.renewalDay;
                const db = b.renewalDay < todayDay ? b.renewalDay + 31 : b.renewalDay;
                return da - db;
            });
            return `
            <div style="flex:1;min-width:260px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <div style="font-weight:700;font-size:14px">${icon} ${label}</div>
                    <button class="btn-secondary" style="width:auto;padding:4px 10px;font-size:12px" onclick="openNewEntry('${type}')">+ Añadir</button>
                </div>
                <div class="card" style="margin-bottom:12px">
                    <div class="card-title">Total mensual</div>
                    <div class="card-value">${total.toLocaleString('es-ES')}€</div>
                    <div class="card-sub">${active.length} activos, ${(total * 12).toLocaleString('es-ES')}€/año</div>
                </div>
                ${sorted.length ? sorted.map(s => {
                    const daysUntil = s.renewalDay >= todayDay ? s.renewalDay - todayDay : s.renewalDay + 31 - todayDay;
                    return `
                    <div class="entry-item" data-open-entry="${s.id}">
                        <div class="entry-color-dot" style="background:${daysUntil <= 3 ? '#e17055' : 'var(--text-secondary)'}"></div>
                        <div class="entry-info">
                            <div class="entry-title">${escapeHtml(s.title)}</div>
                            <div class="entry-meta">Día ${s.renewalDay}, en ${daysUntil} días</div>
                        </div>
                        <span style="font-weight:600;font-size:13px">${s.amount.toLocaleString('es-ES')}€</span>
                    </div>`;
                }).join('') : `<div style="font-size:12px;color:var(--text-secondary);padding:8px 0">Nada por aquí todavía</div>`}
            </div>`;
        }

        // ============================================================
        //  FONDO INDEXADO — CARTERA MULTIFONDO
        // ============================================================

        function migrateInvestmentData() {
            // La proyección de Bitácora utiliza siempre un supuesto del 5 % anual.
            // Las cifras reales de la cartera nunca se alteran por esta simulación.
            if (investmentData && Array.isArray(investmentData.funds)) {
                investmentData.rate = 5;
                if (!Number.isFinite(Number(investmentData.projectionMonthly))) {
                    investmentData.projectionMonthly = 130;
                }
                return;
            }

            const old = investmentData || {};
            const initial = Number(old.initial || 0);
            const extras = Array.isArray(old.extraContributions) ? old.extraContributions : [];
            const contributions = [];

            if (initial > 0) {
                contributions.push({
                    id: 'contrib_' + Date.now(),
                    date: old.initializedAt ? String(old.initializedAt).slice(0, 10) : todayISO(),
                    amount: initial,
                    note: 'Capital inicial'
                });
            }

            extras.forEach((e, i) => {
                contributions.push({
                    id: 'contrib_' + Date.now() + '_' + i,
                    date: e.date || todayISO(),
                    amount: Number(e.amount) || 0,
                    note: e.note || 'Aportación'
                });
            });

            const currentValue = Number(
                old.currentBalance ??
                (initial + extras.reduce((sum, e) => sum + (Number(e.amount) || 0), 0))
            );

            investmentData = {
                rate: 5,
                projectionMonthly: Number(old.monthly || 130) > 0 ? Number(old.monthly || 130) : 130,
                funds: contributions.length || currentValue > 0 ? [{
                    id: 'fund_' + Date.now(),
                    name: 'Mi fondo indexado',
                    ticker: '',
                    color: '#eab308',
                    contributions,
                    valuations: currentValue > 0 ? [{
                        id: 'val_' + Date.now(),
                        date: todayISO(),
                        value: currentValue
                    }] : []
                }] : []
            };
        }

        function fundInvested(fund) {
            return (fund.contributions || []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
        }

        function fundCurrentValue(fund) {
            const vals = (fund.valuations || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
            if (vals.length) return Number(vals[vals.length - 1].value) || 0;
            return fundInvested(fund);
        }

        function portfolioCurrentValue() {
            return (investmentData.funds || []).reduce((s, f) => s + fundCurrentValue(f), 0);
        }

        // ============================================================
        //  VIAJES Y AHORRO
        //  "viaje": cuenta como gasto, pero no en presupuestos ni en el ritmo
        //  (un viaje rompe cualquier presupuesto de comida o transporte sin
        //  decir nada del día a día). "ahorro": dinero que va o viene de un
        //  bolsillo de ahorro; mueve el saldo, pero no es ingreso ni gasto.
        // ============================================================
        function financeProViajesConFecha() {
            return entries.filter(e => e.type === 'travel' && e.startDate).sort((a, b) => b.startDate.localeCompare(a.startDate));
        }

        function financeProNombreViaje(v) {
            return `${v.destination || v.title || 'viaje'}${v.startDate ? `, ${formatTravelRange(v.startDate, v.endDate)}` : ''}`;
        }

        function renderFinanceProMarcasTx(d) {
            const viajes = financeProViajesConFecha();
            return `
                ${d.type === 'expense' ? `
                <label class="finance-tx-marca"><input type="checkbox" ${d.viaje ? 'checked' : ''} onchange="financeProDraftSet('viaje',this.checked);document.getElementById('finance-tx-viaje').hidden=!this.checked"><span><b>gasto de viaje.</b><small>Cuenta como gasto, pero no entra en los presupuestos ni en el ritmo del mes.</small></span></label>
                ${viajes.length ? `<div id="finance-tx-viaje" ${d.viaje ? '' : 'hidden'}><select class="modal-input" onchange="financeProDraftSet('viajeId',this.value)"><option value="">sin un viaje concreto</option>${viajes.map(v => `<option value="${v.id}" ${d.viajeId === v.id ? 'selected' : ''}>${escapeHtml(financeProNombreViaje(v))}</option>`).join('')}</select></div>` : '<div id="finance-tx-viaje" hidden></div>'}` : ''}
                ${d.type !== 'transfer' ? `
                <label class="finance-tx-marca"><input type="checkbox" ${d.ahorro ? 'checked' : ''} onchange="financeProDraftSet('ahorro',this.checked);const c=document.getElementById('finance-tx-categoria');if(c)c.hidden=this.checked"><span><b>${d.type === 'income' ? 'viene de mis ahorros.' : 'va a mis ahorros.'}</b><small>${d.type === 'income' ? 'Sube el saldo, pero no cuenta como ingreso (lo que sacas de una hucha o un bolsillo).' : 'Baja el saldo, pero no cuenta como gasto (lo que apartas a una hucha o un bolsillo).'}</small></span></label>` : ''}`;
        }

        // Los gastos de un viaje: los marcados con ese viaje y, si se marcaron
        // sin elegir viaje, los que caen dentro de sus fechas.
        function financeProGastosDelViaje(viaje) {
            if (!viaje) return [];
            const fin = viaje.endDate || viaje.startDate;
            return financePro.transactions.filter(t => t.type === 'expense' && t.viaje
                && (t.viajeId === viaje.id || (!t.viajeId && viaje.startDate && t.date >= viaje.startDate && t.date <= fin)))
                .sort((a, b) => a.date.localeCompare(b.date));
        }

        function financeProGastoViaje(viajeId) {
            return financeProGastosDelViaje(getTrip(viajeId)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
        }

        // Marcar de una vez todo lo de un viaje: se eligen el viaje (o las
        // fechas) y salen los gastos de esos días, ya marcados salvo las
        // suscripciones y gastos fijos, que se cobran igual estés donde estés.
        function openFinanceProViajeModal(viajeId) {
            const viajes = financeProViajesConFecha();
            const v = (viajeId && getTrip(viajeId)) || viajes.find(x => x.startDate <= todayISO()) || viajes[0];
            window._viajeMarca = { viajeId: v?.id || '', desde: v?.startDate || '', hasta: v?.endDate || v?.startDate || '', sel: null, nuevo: '' };
            showModal(`<div class="modal-title">gastos de un viaje.</div><div id="finance-viaje-cuerpo">${renderFinanceProViajeCuerpo()}</div>`);
        }

        function financeProViajeLista() {
            const v = window._viajeMarca;
            if (!v.desde || !v.hasta) return [];
            return financePro.transactions.filter(t => t.type === 'expense' && !financeProNeutro(t) && t.date >= v.desde && t.date <= v.hasta)
                .sort((a, b) => a.date.localeCompare(b.date));
        }

        function renderFinanceProViajeCuerpo() {
            const v = window._viajeMarca;
            const viajes = financeProViajesConFecha();
            const lista = financeProViajeLista();
            if (!v.sel) v.sel = new Set(lista.filter(t => t.viaje || !t.recurringEntryId).map(t => t.id));
            const total = lista.filter(t => v.sel.has(t.id)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
            return `
                <p class="finance-modal-note" style="margin-top:0">Los gastos de un viaje siguen contando como gasto, pero no entran en los presupuestos ni en el ritmo del mes. Elige el viaje o las fechas y desmarca lo que no fuera del viaje.</p>
                ${viajes.length ? `<div class="modal-label">viaje</div>
                <select class="modal-input" onchange="financeProViajeElegir(this.value)"><option value="">elegir las fechas a mano</option>${viajes.map(x => `<option value="${x.id}" ${v.viajeId === x.id ? 'selected' : ''}>${escapeHtml(financeProNombreViaje(x))}</option>`).join('')}</select>` : ''}
                <div class="lab-horas">
                    <div><div class="modal-label">desde</div><input class="modal-input" type="date" value="${v.desde}" onchange="window._viajeMarca.desde=this.value;window._viajeMarca.sel=null;financeProViajeRepintar()"></div>
                    <div><div class="modal-label">hasta</div><input class="modal-input" type="date" value="${v.hasta}" onchange="window._viajeMarca.hasta=this.value;window._viajeMarca.sel=null;financeProViajeRepintar()"></div>
                </div>
                <div class="finance-viaje-lista">${lista.length ? lista.map(t => {
                    const cat = financeProCategoryById(t.category);
                    return `<label class="finance-viaje-fila"><input type="checkbox" ${v.sel.has(t.id) ? 'checked' : ''} onchange="financeProViajeMarcar('${t.id}',this.checked)"><span>${financeDateLabelShort(t.date)}</span><b>${escapeHtml(t.note || cat?.name || 'gasto')}</b><i>${financeMoney(t.amount)}</i></label>`;
                }).join('') : `<div class="finance-empty-line">${v.desde && v.hasta ? 'No hay gastos esos días.' : 'Elige las fechas del viaje.'}</div>`}</div>
                ${lista.length ? `<div class="finance-viaje-total"><span>${v.sel.size} de ${lista.length} marcados</span><b>${financeMoney(total)}</b></div>` : ''}
                ${!v.viajeId && lista.length ? `<div class="modal-label">guardarlo también en viajes</div><input class="modal-input" placeholder="Nombre del viaje (Viena, Pirineo...). Vacío para no crearlo" value="${escapeHtml(v.nuevo || '')}" oninput="window._viajeMarca.nuevo=this.value">` : ''}
                <button class="btn-modal-primary" onclick="guardarFinanceProViaje()" ${lista.length ? '' : 'disabled'}>guardar.</button>`;
        }

        function financeProViajeRepintar() {
            const el = document.getElementById('finance-viaje-cuerpo');
            if (el) el.innerHTML = renderFinanceProViajeCuerpo();
        }

        function financeProViajeElegir(id) {
            const x = getTrip(id);
            Object.assign(window._viajeMarca, { viajeId: id, sel: null }, x ? { desde: x.startDate, hasta: x.endDate || x.startDate } : {});
            financeProViajeRepintar();
        }

        function financeProViajeMarcar(id, marcado) {
            const v = window._viajeMarca;
            if (marcado) v.sel.add(id); else v.sel.delete(id);
            financeProViajeRepintar();
        }

        async function guardarFinanceProViaje() {
            const v = window._viajeMarca;
            let marcados = 0;
            const nombre = (v.nuevo || '').trim();
            if (!v.viajeId && nombre && v.desde) {
                const viaje = { id: 'trip_' + Date.now(), type: 'travel', title: nombre, destination: nombre, startDate: v.desde, endDate: v.hasta || v.desde, date: v.desde, categoryId: getCategoryIdForType('travel') };
                entries.push(viaje);
                filteredEntries = [...entries];
                v.viajeId = viaje.id;
            }
            financeProViajeLista().forEach(t => {
                if (v.sel.has(t.id)) { t.viaje = true; if (v.viajeId) t.viajeId = v.viajeId; marcados++; }
                else if (t.viaje) { delete t.viaje; delete t.viajeId; }
            });
            closeModal();
            render();
            try { await saveData(); showToast(`${marcados} ${marcados === 1 ? 'gasto marcado' : 'gastos marcados'} como viaje`); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }



// ============================================================
//  DESHACER IMPORTACIONES (28-10)
//  Importar toca mucho más que añadir filas: concilia lo grabado a mano, completa pendientes, funde gemelos, empareja
//  traspasos, quita duplicados y puede cambiar la cuenta o el concepto de una suscripción. Por eso no se deshace
//  quitando lo añadido, sino volviendo a cómo estaba Finanzas justo antes. Esa foto se guarda en este dispositivo
//  (IndexedDB, las ocho últimas); para lo importado antes de esto, o desde otro dispositivo, están las copias
//  semanales de la nube (bitacora_snapshots).
// ============================================================
const financeClaveImportaciones = () => 'importaciones-' + (copiaUid || '');
function financeProCuentaNombre(id) {
    return financePro.accounts?.[id]?.name || id || 'una cuenta';
}
function financeFotoFinanzas() {
    const recurrentes = {};
    entries.forEach(e => { if (e.proAccount !== undefined || e.conceptoBanco !== undefined) recurrentes[e.id] = { proAccount: e.proAccount, conceptoBanco: e.conceptoBanco }; });
    return { financePro: JSON.parse(JSON.stringify(financePro)), recurrentes };
}
async function financeLeerImportaciones() {
    try {
        const db = await copiaDb();
        return await new Promise((ok, mal) => {
            const r = db.transaction('copias').objectStore('copias').get(financeClaveImportaciones());
            r.onsuccess = () => ok(Array.isArray(r.result) ? r.result : []);
            r.onerror = () => mal(r.error);
        });
    } catch (e) { console.error(e); return []; }
}
async function financeEscribirImportaciones(lista) {
    const db = await copiaDb();
    await new Promise((ok, mal) => {
        const t = db.transaction('copias', 'readwrite');
        t.objectStore('copias').put(lista.slice(0, 8), financeClaveImportaciones());
        t.oncomplete = ok;
        t.onerror = () => mal(t.error);
    });
}
// La foto se saca al momento (la importación del conector no espera) y se escribe después.
function financeImportGuardarAntes(texto) {
    const foto = { id: 'imp_' + Date.now(), cuando: Date.now(), texto, movimientos: financePro.transactions.length, ...financeFotoFinanzas() };
    return financeLeerImportaciones().then(lista => financeEscribirImportaciones([foto, ...lista]))
        .catch(e => console.error('No se pudo guardar la foto antes de importar:', e));
}

async function openDeshacerImportacion() {
    showModal(`<div class="modal-title">deshacer importación.<button class="modal-close" aria-label="cerrar" onclick="closeModal()"><i class='ico ico-x' aria-hidden=true></i></button></div>
        <p class="finance-modal-note" style="margin-top:0">Finanzas vuelve a como estaba en ese momento. Lo que cambiaste en Finanzas después también se pierde; el resto de Bitácora no se toca. Antes de deshacer se guarda cómo está ahora, por si quieres volver.</p>
        <div id="deshacer-import-cuerpo"><p class="finance-modal-note">Buscando…</p></div>`);
    const [locales, nube] = await Promise.all([
        financeLeerImportaciones(),
        sb.from('bitacora_snapshots').select('id, created_at, week_key').order('created_at', { ascending: false }).limit(12).then(r => r.data || [], () => []),
    ]);
    const caja = document.getElementById('deshacer-import-cuerpo');
    if (!caja) return;
    const fecha = t => new Date(t).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const fila = (titulo, detalle, accion) => `<div class="deshacer-fila"><span><b>${titulo}</b><small>${detalle}</small></span><button class="btn-secondary" onclick="${accion}">volver aquí.</button></div>`;
    caja.innerHTML = `
        <div class="modal-label">en este dispositivo.</div>
        ${locales.length ? locales.map(l => fila(escapeHtml(fecha(l.cuando)), `antes de la ${escapeHtml(l.texto)}, ${l.movimientos} movimientos`, `financeConfirmarVuelta('local', '${l.id}')`)).join('') : '<p class="finance-modal-note">Aún no hay ninguna: se guarda una cada vez que importas a partir de ahora.</p>'}
        <div class="modal-label" style="margin-top:16px">copias de la nube.</div>
        <p class="finance-modal-note" style="margin:0 0 6px">Una por semana, del primer guardado de cada semana. Sirve para lo que importaste antes o desde otro dispositivo.</p>
        ${nube.length ? nube.map(c => fila(escapeHtml(fecha(c.created_at)), `semana ${escapeHtml(c.week_key)}`, `financeConfirmarVuelta('nube', '${jsAttr(c.id)}')`)).join('') : '<p class="finance-modal-note">No hay copias en la nube.</p>'}`;
}

async function financeConfirmarVuelta(origen, id) {
    let foto, texto;
    if (origen === 'local') {
        const l = (await financeLeerImportaciones()).find(x => x.id === id);
        if (!l) return showToast('Esa copia ya no está', true);
        foto = l; texto = `antes de la ${l.texto}`;
    } else {
        const { data, error } = await sb.from('bitacora_snapshots').select('created_at, fp:data->financePro, ent:data->entries').eq('id', id).maybeSingle();
        if (error || !data?.fp) return showToast('No se pudo leer esa copia de la nube', true);
        const recurrentes = {};
        (Array.isArray(data.ent) ? data.ent : []).forEach(e => { if (e?.id) recurrentes[e.id] = { proAccount: e.proAccount, conceptoBanco: e.conceptoBanco }; });
        foto = { financePro: data.fp, recurrentes };
        texto = `el ${new Date(data.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} (copia de la nube)`;
    }
    const ahora = financePro.transactions.length, antes = (foto.financePro.transactions || []).length;
    window._financeVuelta = { ...foto, texto };
    showModal(`<div class="modal-title">¿volver a como estaba ${escapeHtml(texto)}?</div>
        <p class="finance-modal-note" style="margin-top:0">Ahora tienes ${ahora} movimientos; en esa copia hay ${antes}. Lo que hiciste en Finanzas después se pierde, pero la situación de ahora se guarda en «deshacer importación.» por si quieres volver.</p>
        <button class="btn-modal-primary" onclick="financeAplicarVuelta()">volver a esa copia.</button>
        <button class="btn-secondary" style="width:100%;margin-top:8px" onclick="openDeshacerImportacion()">cancelar.</button>`);
}

async function financeAplicarVuelta() {
    const foto = window._financeVuelta;
    if (!foto?.financePro) return;
    const texto = foto.texto;
    await financeImportGuardarAntes(`vuelta atrás a como estaba ${texto}`);
    financePro = JSON.parse(JSON.stringify(foto.financePro));
    entries.forEach(e => {
        const r = foto.recurrentes?.[e.id];
        if (!r) return;
        ['proAccount', 'conceptoBanco'].forEach(k => { if (r[k] === undefined) delete e[k]; else e[k] = r[k]; });
    });
    window._financeVuelta = null;
    financeSaldosCache = null;
    invalidarCachesDerivadas();
    closeModal();
    render();
    try { await saveData(); showToast(`Finanzas está como estaba ${texto}.`); }
    catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}


// ============================================================
//  ELEGIR QUÉ FILAS SE IMPORTAN (28-10)
//  Un extracto suele traer cosas que ya están apuntadas de otra forma: las cargas a Revolut desde Ibercaja salen en
//  el banco con otra fecha (el banco cobra 2 o 3 días después) y a veces partidas (dos de 300 € frente a un traspaso
//  de 600 €), y el importador, que reconoce por día, importe y concepto exactos, las volvía a meter. Ahora se ven
//  todas las filas con su casilla, y las que parecen ya apuntadas salen desmarcadas.
// ============================================================
function financeProFilasDelExtracto(imp) {
    const m = imp.mapping;
    const datos = m.hasHeader ? imp.rows.slice(1) : imp.rows;
    const iProducto = m.hasHeader ? imp.rows[0].findIndex(h => String(h || '').trim().toLowerCase() === 'product') : -1;
    return datos.map((r, fila) => {
        let val;
        if (m.splitAmount) {
            const ent = financeProParseEuroAmount(r[m.amountIn]), sal = financeProParseEuroAmount(r[m.amountOut]);
            val = (Number.isFinite(ent) && ent > 0 ? ent : 0) - (Number.isFinite(sal) ? Math.abs(sal) : 0);
        } else val = financeProParseEuroAmount(r[m.amount]);
        const date = financeProParseDate(r[m.date]) || r.map(financeProParseDate).find(Boolean) || '';
        // Revolut trae la fecha de inicio y la de completado: Bitácora puede tener cualquiera de las dos.
        const fechas = [...new Set(r.map(financeProParseDate).filter(Boolean))];
        const estado = m.status >= 0 ? String(r[m.status] || '').toLowerCase() : '';
        const producto = iProducto >= 0 ? String(r[iProducto] || '').trim().toLowerCase() : '';
        const fuera = /revert|declin|fail|cancel|rechaz|anulad|fallid/.test(estado) ? 'anulado en el banco.' : producto && producto !== 'current' ? 'es de una hucha, no de esta cuenta.' : '';
        return { fila, date, fechas: fechas.length ? fechas : [date], val: Number.isFinite(val) ? Math.round(val * 100) / 100 : NaN, desc: String(r[m.description] || '').trim(), fuera };
    });
}
function financeProFilasYaApuntadas(imp) {
    const cuenta = imp.mapping.account;
    const filas = financeProFilasDelExtracto(imp).filter(f => f.date && Number.isFinite(f.val) && f.val && !f.fuera);
    const signo = t => t.type === 'transfer' ? (t.account === cuenta ? -1 : 1) : t.type === 'income' ? 1 : -1;
    const libres = financePro.transactions.filter(t => (t.account === cuenta || t.transferTo === cuenta) && !t.pendiente)
        .map(t => ({ t, val: Math.round(signo(t) * (Number(t.amount) || 0) * 100) / 100 }));
    const dias = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
    const cerca = (t, f) => Math.min(...f.fechas.map(d => dias(t.date, d)));
    const mismoConcepto = (x, f) => financeProNormalizar(x.t.bankNote ?? x.t.note ?? '') === financeProNormalizar(f.desc);
    const ya = new Set(), usados = new Set();
    const tomar = (f, x) => { ya.add(f.fila); usados.add(x); };
    // Primero lo idéntico (mismo día, importe y concepto); luego mismo importe a 4 días como mucho, el más cercano.
    filas.forEach(f => {
        const x = libres.find(x => !usados.has(x) && f.fechas.includes(x.t.date) && Math.abs(x.val - f.val) < 0.005 && mismoConcepto(x, f));
        if (x) tomar(f, x);
    });
    // Mismo concepto e importe con otra fecha cercana (la de completado frente a la de inicio).
    filas.filter(f => !ya.has(f.fila)).forEach(f => {
        const x = libres.filter(x => !usados.has(x) && Math.abs(x.val - f.val) < 0.005 && mismoConcepto(x, f) && cerca(x.t, f) <= 4)
            .sort((a, b) => cerca(a.t, f) - cerca(b.t, f))[0];
        if (x) tomar(f, x);
    });
    // Por importe y fecha cercana no vale un movimiento que es la pareja de otra fila de este mismo extracto (el café
    // de 1,60 € del día 2 no es el del día 1, aunque estén a un día).
    const conceptos = new Set(filas.map(f => financeProNormalizar(f.desc)));
    const parecido = x => x.t.type === 'transfer' || !conceptos.has(financeProNormalizar(x.t.bankNote ?? x.t.note ?? ''));
    filas.filter(f => !ya.has(f.fila)).forEach(f => {
        const x = libres.filter(x => !usados.has(x) && parecido(x) && Math.abs(x.val - f.val) < 0.005 && cerca(x.t, f) <= (x.t.type === 'transfer' && f.fechas.some(d => d >= x.t.date) ? 10 : 4))
            .sort((a, b) => cerca(a.t, f) - cerca(b.t, f))[0];
        if (x) tomar(f, x);
    });
    // Dos filas del mismo concepto y signo, cercanas, que juntas son un movimiento ya apuntado (600 € = 300 + 300).
    const sueltas = filas.filter(f => !ya.has(f.fila));
    sueltas.forEach((a, i) => sueltas.slice(i + 1).forEach(b => {
        if (ya.has(a.fila) || ya.has(b.fila) || Math.sign(a.val) !== Math.sign(b.val) || dias(a.date, b.date) > 4) return;
        if (financeProNormalizar(a.desc) !== financeProNormalizar(b.desc)) return;
        const x = libres.find(x => !usados.has(x) && Math.abs(x.val - (a.val + b.val)) < 0.005 && dias(x.t.date, a.date) <= 4);
        if (x) { tomar(a, x); ya.add(b.fila); }
    }));
    return ya;
}
function renderFinanceProImportFilas(imp) {
    const filas = financeProFilasDelExtracto(imp);
    if (!imp.excluidas) { imp.yaApuntadas = financeProFilasYaApuntadas(imp); imp.excluidas = new Set([...imp.yaApuntadas, ...filas.filter(f => f.fuera).map(f => f.fila)]); }
    const n = filas.length - imp.excluidas.size;
    const nFuera = filas.filter(f => f.fuera).length;
    const nYa = filas.length - n - nFuera;
    return `<div class="fin-imp-resumen"><b>${n ? `${n} ${n === 1 ? 'nueva' : 'nuevas'}` : 'nada nuevo'}</b><span>${nYa > 0 ? `${nYa} ya ${nYa === 1 ? 'estaba' : 'estaban'} en ${escapeHtml(financePro.accounts[imp.mapping.account]?.name || imp.mapping.account)}` : 'ninguna estaba ya'}${nFuera ? `, ${nFuera} ${nFuera === 1 ? 'no cuenta' : 'no cuentan'} (anuladas o de una hucha)` : ''}, de ${filas.length} filas.</span></div>
        <details class="fin-imp-lista" ${filas.length <= 25 ? 'open' : ''}><summary>ver las filas.</summary>
        <div class="finance-modal-note" style="margin:6px 0">Las que parecen ya apuntadas (mismo importe en 4 días, o dos que suman uno) salen desmarcadas. Puedes cambiar cualquiera.</div>
        <div class="fin-imp-filas">${filas.map(f => `<label class="fin-imp-fila ${imp.yaApuntadas.has(f.fila) ? 'ya' : ''}">
            <input type="checkbox" ${imp.excluidas.has(f.fila) ? '' : 'checked'} onchange="financeProImportFila(${f.fila}, this.checked)">
            <span>${f.date ? financeDateLabelShort(f.date) : 'sin fecha'}</span>
            <b>${escapeHtml(f.desc.slice(0, 60) || 'sin concepto')}${f.fuera ? `<small>${f.fuera}</small>` : imp.yaApuntadas.has(f.fila) ? '<small>parece que ya está.</small>' : ''}</b>
            <i class="${f.val > 0 ? 'positiva' : ''}">${Number.isFinite(f.val) ? (f.val > 0 ? '+' : '') + financeMoney(f.val) : ''}</i>
        </label>`).join('')}</div></details>`;
}
function financeProTextoBotonImport(imp) {
    const n = financeProFilasDelExtracto(imp).length - (imp.excluidas?.size || 0);

    return n ? `importar ${n === 1 ? 'la nueva' : `las ${n} nuevas`}.` : 'comprobar el saldo con el extracto.';
}
function financeProImportFila(fila, marcada) {
    const imp = window._financeProImport;
    imp.excluidas = new Set(imp.excluidas);
    if (marcada) imp.excluidas.delete(fila); else imp.excluidas.add(fila);
    document.getElementById('finance-pro-import-body').innerHTML = renderFinanceProImportMapping();
}


// Un concepto que ya fue un traspaso entre tus cuentas vuelve a serlo al importar, aunque el otro banco todavía no
// enseñe su mitad: la recarga de Revolut con la tarjeta de Ibercaja («Top-up by *1185») entraba como ingreso en
// Revolut mientras Ibercaja la tenía retenida, y el dinero salía contado dos veces. Nunca para un Bizum.
function financeProTraspasoAprendido(cuenta, type, descripcion) {
    const n = financeProNormalizar(descripcion || '').trim();
    if (n.length < 4 || /bizum/i.test(descripcion)) return null;
    let t = null;
    for (let i = financePro.transactions.length - 1; i >= 0; i--) {
        const x = financePro.transactions[i];
        if (x.type !== 'transfer' || financeProNormalizar(x.bankNote ?? x.note ?? '').trim() !== n) continue;
        if (type === 'income' && x.transferTo === cuenta && x.account !== cuenta) { t = { otherAccount: x.account }; break; }
        if (type === 'expense' && x.account === cuenta && x.transferTo && x.transferTo !== cuenta) { t = { otherAccount: x.transferTo }; break; }
    }
    return t;
}


function financeProTraspasoCercano(cuenta, type, importe, fechas, reclamados) {
    const dias = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
    let mejor = null, mejorDias = Infinity;
    financePro.transactions.forEach(t => {
        if (t.type !== 'transfer' || reclamados.has(t) || Math.abs(Number(t.amount) - importe) >= 0.005) return;
        if (type === 'income' ? t.transferTo !== cuenta : t.account !== cuenta) return;
        // Ya conciliada por este lado: su concepto de este banco ya está guardado.
        if (t.conciliado && [t.claveImport, t.claveImport2].some(k => k && k.startsWith(cuenta + '|'))) return;
        // El banco puede completar un traspaso ya apuntado bastantes días después (una retención), nunca antes: hacia
        // delante se espera hasta 10 días.
        const d = Math.min(...fechas.map(f => dias(t.date, f)));
        const tope = fechas.some(f => f >= t.date) ? 10 : 4;
        if (d <= tope && d < mejorDias) { mejor = t; mejorDias = d; }
    });
    return mejor;
}


// La cuenta a la que va el extracto sale del propio archivo: la cabecera de Revolut, o el número de cuenta que los
// bancos ponen encima de los movimientos (Ibercaja: «20850136******608462»; 2085 es Ibercaja). Se busca la cuenta
// tuya cuyo nombre lleva el del banco.
const FINANCE_BANCOS_CODIGO = { '2085': 'ibercaja', '0049': 'santander', '0182': 'bbva', '2100': 'caixa', '0081': 'sabadell', '1465': 'ing', '0073': 'openbank', '0128': 'bankinter', '2080': 'abanca', '3058': 'cajamar', '2095': 'kutxa', '0239': 'evo', '0487': 'mare nostrum', '2103': 'unicaja', '3035': 'laboral' };
function financeProDetectarCuenta(cabecera, antes) {
    const cab = cabecera.map(h => String(h || '').trim().toLowerCase());
    const pistas = [];
    if (cab.includes('product') && cab.includes('started date')) pistas.push('revolut');
    if (cab.includes('payee') || /n26/i.test(antes)) pistas.push('n26');
    const codigo = String(antes || '').replace(/\s/g, '').match(/(?:ES\d{2})?(\d{4})\d{4}[\d*]{10,}/i);
    if (codigo && FINANCE_BANCOS_CODIGO[codigo[1]]) pistas.push(FINANCE_BANCOS_CODIGO[codigo[1]]);
    Object.values(FINANCE_BANCOS_CODIGO).forEach(n => { if (new RegExp(`\\b${n}\\b`, 'i').test(antes)) pistas.push(n); });
    for (const p of pistas) {
        const k = FINANCE_PRO_ACCOUNT_KEYS.find(k => financeProNormalizar(financePro.accounts[k]?.name || '').includes(p));
        if (k) return k;
    }
    return null;
}

// Fijar el saldo de partida con el extracto: en vez de un movimiento de ajuste, cambia con cuánto empezaba la cuenta.
async function financeProFijarSaldoInicial() {
    const c = window._financeProCuadre;
    const diff = Math.round((c.esperado - (c.retenido || 0) - c.actual) * 100) / 100;
    closeModal();
    if (Math.abs(diff) < 0.005) return;
    await financeImportGuardarAntes(`saldo de partida de ${financeProCuentaNombre(c.cuenta)}`);
    financePro.accounts[c.cuenta].balance0 = Math.round((Number(financePro.accounts[c.cuenta].balance0 || 0) + diff) * 100) / 100;
    financeSaldosCache = null;
    render();
    try { await saveData(); showToast(`${financeProCuentaNombre(c.cuenta)} empieza ahora con ${financeMoney(financePro.accounts[c.cuenta].balance0)} y cuadra con el extracto: ${financeMoney(c.esperado)}`); }
    catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}

// ============================================================
//  BORRAR UN HISTORIAL ANTIGUO (29-10)
//  Para quitar lo que se metió a mano o desde otra app cuando ya está el de los bancos. Antes de borrar, cada
//  categoría pasa al movimiento del banco que coincide (mismo tipo e importe, a 3 días como mucho, de cualquier
//  cuenta) para no perder lo aprendido; y el saldo de partida de cada cuenta se corrige para que el saldo de hoy no
//  cambie. Se guarda una foto antes, en «deshacer importación.».
// ============================================================
function financeHistorialABorrar(cuenta, desde, hasta) {
    // Los traspasos con otra cuenta no se tocan: la otra (Revolut) los tiene de su propio extracto, y borrarlos dejaba
    // sus meses de atrás falseados aunque el saldo de hoy cuadrara.
    return financePro.transactions.filter(t => t.date >= desde && t.date <= hasta && (cuenta === 'todas' || (t.account === cuenta && t.type !== 'transfer')));
}
function openBorrarHistorial() {
    const ant = window._financeHistorial || { cuenta: FINANCE_PRO_ACCOUNT_KEYS[0], desde: '2000-01-01', hasta: financeProSumarDias(todayISO(), -60), pasar: true };
    window._financeHistorial = ant;
    const l = financeHistorialABorrar(ant.cuenta, ant.desde, ant.hasta).sort((a, b) => a.date.localeCompare(b.date));
    const conCat = l.filter(t => t.category && !t.categoriaAuto).length;
    const fila = t => `<div class="fin-imp-fila"><span></span><span>${financeDateLabelShort(t.date)}</span><b>${escapeHtml(t.note || t.bankNote || financeProCategoryById(t.category)?.name || 'movimiento')}</b><i>${t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}${financeMoney(t.amount)}</i></div>`;
    showModal(`<div class="modal-title">borrar un historial antiguo.<button class="modal-close" aria-label="cerrar" onclick="closeModal()"><i class='ico ico-x' aria-hidden=true></i></button></div>
        <p class="finance-modal-note" style="margin-top:0">Para quitar lo que metiste a mano o desde otra app, cuando ya tienes el de los bancos. El saldo de hoy de cada cuenta no cambia, y antes de borrar se guarda una foto en «deshacer importación.».</p>
        <div class="modal-label">cuenta.</div>
        <select class="modal-input" onchange="window._financeHistorial.cuenta=this.value;openBorrarHistorial()"><option value="todas" ${ant.cuenta === 'todas' ? 'selected' : ''}>todas</option>${FINANCE_PRO_ACCOUNT_KEYS.map(k => `<option value="${k}" ${ant.cuenta === k ? 'selected' : ''}>${escapeHtml(financePro.accounts[k].name)}</option>`).join('')}</select>
        <div class="finance-correction-inputs">
            <div><div class="modal-label">desde.</div><input type="date" class="modal-input" value="${ant.desde === '2000-01-01' ? '' : ant.desde}" onchange="window._financeHistorial.desde=this.value||'2000-01-01';openBorrarHistorial()"></div>
            <div><div class="modal-label">hasta.</div><input type="date" class="modal-input" value="${ant.hasta}" onchange="window._financeHistorial.hasta=this.value;openBorrarHistorial()"></div>
        </div>
        <label class="admin-fila"><input type="checkbox" ${ant.pasar ? 'checked' : ''} onchange="window._financeHistorial.pasar=this.checked"><span><b>pasar sus categorías a los movimientos del banco.</b><small>${conCat} con categoría puesta por ti. Cada una va al movimiento del banco que coincide (mismo importe, a 3 días), para seguir aprendiendo de ellas.</small></span></label>
        <div class="fin-imp-resumen"><b>${l.length} ${l.length === 1 ? 'movimiento' : 'movimientos'}</b><span>${l.length ? `del ${financeDateLabelShort(l[0].date)} al ${financeDateLabelShort(l[l.length - 1].date)}` : 'en esas fechas'}.</span></div>
        ${l.length ? `<details class="fin-imp-lista"><summary>ver los primeros y los últimos.</summary><div class="fin-imp-filas">${[...l.slice(0, 5), ...l.slice(-5)].filter((t, i, a) => a.indexOf(t) === i).map(fila).join('')}</div></details>
        <button class="btn-modal-primary" style="margin-top:14px;background:#b3261e;border-color:#b3261e" onclick="borrarHistorialAntiguo()">borrar ${l.length} ${l.length === 1 ? 'movimiento' : 'movimientos'}.</button>` : ''}`);
}
async function borrarHistorialAntiguo() {
    const h = window._financeHistorial;
    const fuera = new Set(financeHistorialABorrar(h.cuenta, h.desde, h.hasta));
    if (!fuera.size) return;
    await financeImportGuardarAntes(`borrado del historial antiguo (${fuera.size} movimientos)`);
    let pasadas = 0;
    if (h.pasar) {
        const dias = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
        const libres = financePro.transactions.filter(t => !fuera.has(t) && (t.type === 'expense' || t.type === 'income') && (!t.category || t.categoriaAuto));
        const usadas = new Set();
        [...fuera].filter(t => t.category && !t.categoriaAuto && (t.type === 'expense' || t.type === 'income')).forEach(t => {
            const x = libres.filter(y => !usadas.has(y) && y.type === t.type && Math.abs(Number(y.amount) - Number(t.amount)) < 0.005 && dias(y.date, t.date) <= 3)
                .sort((a, b) => dias(a.date, t.date) - dias(b.date, t.date))[0];
            if (!x) return;
            usadas.add(x);
            x.category = t.category; x.needsReview = false; delete x.categoriaAuto;
            pasadas++;
        });
    }
    // Quitar un movimiento cambia el saldo de su cuenta: el saldo de partida lo compensa y el de hoy sigue igual.
    fuera.forEach(t => {
        const efecto = (k, signo) => { if (financePro.accounts[k]) financePro.accounts[k].balance0 = Math.round((Number(financePro.accounts[k].balance0 || 0) + signo * Number(t.amount || 0)) * 100) / 100; };
        if (t.type === 'transfer') { efecto(t.account, -1); efecto(t.transferTo, 1); }
        else efecto(t.account, t.type === 'income' ? 1 : -1);
    });
    financePro.transactions = financePro.transactions.filter(t => !fuera.has(t));
    window._financeHistorial = null;
    financeSaldosCache = null;
    invalidarCachesDerivadas();
    closeModal();
    render();
    try { await saveData(); showToast(`${fuera.size} movimientos borrados${pasadas ? `, ${pasadas} categorías pasadas a los del banco` : ''}. Los saldos de hoy no cambian.`); }
    catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}


function financeProMitadSuelta(cuenta, type, importe, fechas, reclamados) {
    const dias = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
    let mejor = null, mejorDias = Infinity;
    financePro.transactions.forEach(t => {
        if (t.account !== cuenta || t.type !== type || reclamados.has(t) || t.recurringEntryId || financeProNeutro(t)) return;
        if (Math.abs(Number(t.amount) - importe) >= 0.005) return;
        const nota = `${t.bankNote ?? ''} ${t.note ?? ''}`;
        if (!TRASPASO_CONCEPTO.test(nota) && !/revolut|top.?up|retirar|recarga/i.test(nota)) return;
        const d = Math.min(...fechas.map(f => dias(t.date, f)));
        if (d <= 4 && d < mejorDias) { mejor = t; mejorDias = d; }
    });
    return mejor;
}


// ============================================================
//  REHACER UNA CUENTA CON SU EXTRACTO (29-10)
//  Cuando una cuenta arrastra un historial que no es el del banco (traído de otra app, ajustes, importaciones a
//  medias), ir cuadrando a mano no acaba nunca. Esto la deja como dice el banco en las fechas del extracto: quita lo
//  que tenía en esas fechas, mete las filas del extracto y fija el saldo de partida con la columna de saldo.
//  Se conservan: tus categorías y notas (pasan al movimiento del banco que coincide), los traspasos con otras cuentas
//  que el extracto confirma (son la otra mitad de otro banco) y los que el banco aún retiene (de los últimos días).
// ============================================================
function financeProTieneSaldo(imp) {
    return imp?.mapping?.hasHeader && imp.rows[0].some(h => /^(balance|saldo|disponible)\b/i.test(String(h || '').trim()));
}
function financeRehacerPlan(imp) {
    const cuenta = imp.mapping.account;
    const filas = financeProFilasDelExtracto(imp).filter(f => f.date && Number.isFinite(f.val) && f.val && !f.fuera);
    const todas = filas.flatMap(f => f.fechas);
    const desde = todas.reduce((a, b) => a < b ? a : b), hasta = todas.reduce((a, b) => a > b ? a : b);
    const dias = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
    const cerca = (t, f) => Math.min(...f.fechas.map(d => dias(t.date, d)));
    const signo = t => t.type === 'transfer' ? (t.account === cuenta ? -1 : 1) : t.type === 'income' ? 1 : -1;
    const enRango = t => t.date >= desde && t.date <= hasta && (t.account === cuenta || t.transferTo === cuenta);
    // Todo lo de la cuenta en esas fechas sale, traspasos incluidos, y vuelve desde el extracto: las recargas a Revolut
    // las rehace la regla de traspaso y se unen con su mitad de Ibercaja. Decidir qué traspasos antiguos se quedaban
    // fallaba con historiales mezclados.
    const quitar = financePro.transactions.filter(enRango);
    const filasConTraspaso = new Set();
    return { cuenta, desde, hasta, filas, quitar, filasConTraspaso, quedan: 0 };
}
function openRehacerCuenta() {
    const imp = window._financeProImport;
    const p = financeRehacerPlan(imp);
    const nombre = escapeHtml(financeProCuentaNombre(p.cuenta));
    showModal(`<div class="modal-title">rehacer ${nombre} con este extracto.</div>
        <p class="finance-modal-note" style="margin-top:0">Del ${financeDateLabelShort(p.desde)} al ${financeDateLabelShort(p.hasta)}, ${nombre} quedará exactamente como dice el banco, día a día.</p>
        <div class="fin-imp-resumen"><b>${p.quitar.length} fuera</b><span>lo que tiene ahora ${nombre} en esas fechas.</span></div>
        <div class="fin-imp-resumen"><b>${p.filas.length - p.filasConTraspaso.size} del extracto</b><span>entran en su lugar.</span></div>
        <p class="finance-modal-note">Tus categorías y notas pasan al movimiento del banco que coincide (mismo importe, a 3 días). El resto de cuentas y fechas no se tocan. Antes se guarda una foto en «deshacer importación.».</p>
        <button class="btn-modal-primary" onclick="rehacerCuenta()">rehacer ${nombre}.</button>
        <button class="btn-secondary" style="width:100%;margin-top:8px" onclick="closeModal()">cancelar.</button>`);
}
async function rehacerCuenta() {
    const imp = window._financeProImport;
    const p = financeRehacerPlan(imp);
    await financeImportGuardarAntes(`rehacer ${financeProCuentaNombre(p.cuenta)} con su extracto`);
    const fuera = new Set(p.quitar);
    const recuerdos = p.quitar.filter(t => t.type !== 'transfer' && ((t.category && !t.categoriaAuto) || t.viaje || (t.note && t.bankNote && t.note !== t.bankNote)));
    financePro.transactions = financePro.transactions.filter(t => !fuera.has(t));
    imp.excluidas = new Set([...p.filasConTraspaso, ...financeProFilasDelExtracto(imp).filter(f => f.fuera).map(f => f.fila)]);
    const antes = new Set(financePro.transactions);
    const r = financeProEjecutarImport(imp);
    const nuevos = financePro.transactions.filter(t => !antes.has(t));
    const dias = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
    const usados = new Set();
    let pasadas = 0;
    recuerdos.forEach(v => {
        const x = nuevos.filter(n => !usados.has(n) && n.type === v.type && Math.abs(Number(n.amount) - Number(v.amount)) < 0.005 && dias(n.date, v.date) <= 3).sort((a, b) => dias(a.date, v.date) - dias(b.date, v.date))[0];
        if (!x) return;
        usados.add(x);
        if (v.category && !v.categoriaAuto) { x.category = v.category; x.needsReview = false; delete x.categoriaAuto; }
        if (v.viaje) x.viaje = v.viaje;
        if (v.note && v.bankNote && v.note !== v.bankNote) { x.bankNote = x.note; x.note = v.note; }
        pasadas++;
    });
    financeSaldosCache = null;
    const c = financeProCuadreExtracto(imp);
    if (c && !c.cuadra) {
        const diff = Math.round((c.esperado - (c.retenido || 0) - c.actual) * 100) / 100;
        financePro.accounts[p.cuenta].balance0 = Math.round((Number(financePro.accounts[p.cuenta].balance0 || 0) + diff) * 100) / 100;
    }
    financeSaldosCache = null;
    invalidarCachesDerivadas();
    closeModal();
    render();
    try { await saveData(); showToast(`${financeProCuentaNombre(p.cuenta)} rehecha con el extracto: ${p.quitar.length} fuera, ${r.added} del banco, ${pasadas} con tu categoría o nota. Saldo: ${financeMoney(financeProAccountBalance(p.cuenta))}.`); }
    catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}


// Un extracto solo se importa en una cuenta que ha salido del archivo o que has elegido tú: antes iba en silencio a la
// última usada, y un extracto de Ibercaja podía acabar en Revolut.
function financeProCuentaConfirmada(imp) {
    return !!(imp?.cuentaDetectada || imp?.cuentaPedida || imp?.cuentaConfirmada);
}


// ============================================================
//  DIVIDIR UNA CATEGORÍA (29-10)
//  Sacar de una categoría los movimientos de un tipo (de «Comida y bebida», los de «Bar») a una nueva o existente.
//  Se eligen por palabras del concepto; con «*» al final, también las que empiezan así («cafeter*»). Antes de mover
//  se ve la lista con casillas. Al moverlos a mano, Bitácora aprende y los siguientes caen solos en la nueva.
// ============================================================
let dividirCat = null;
function openDividirCategoria() {
    const gastos = financePro.categories.filter(c => c.type === 'expense');
    const origen = gastos.find(c => /comida/i.test(c.name)) || gastos[0];
    dividirCat = { origen: origen?.id, nombre: 'Bar', palabras: 'bar, bares, cafe*, cafeter*, menfis, estoril, tabern*, cervec*, pub, tasca, copas', fuera: new Set() };
    pintarDividirCategoria();
}
function dividirCategoriaCandidatos() {
    const d = dividirCat;
    const palabras = d.palabras.split(',').map(p => financeProNormalizar(p.trim())).filter(Boolean);
    const exp = palabras.map(p => p.endsWith('*') ? new RegExp(`\\b${p.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) : new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`));
    return financePro.transactions.filter(t => t.category === d.origen && exp.some(r => r.test(financeProNormalizar(`${t.note || ''} ${t.bankNote || ''}`))))
        .sort((a, b) => b.date.localeCompare(a.date));
}
function pintarDividirCategoria() {
    const d = dividirCat;
    const gastos = financePro.categories.filter(c => c.type === 'expense');
    const lista = dividirCategoriaCandidatos();
    const marcados = lista.filter(t => !d.fuera.has(t.id));
    const total = marcados.reduce((a, t) => a + Number(t.amount || 0), 0);
    const html = `<div class="modal-title">dividir una categoría.<button class="modal-close" aria-label="cerrar" onclick="closeModal()"><i class='ico ico-x' aria-hidden=true></i></button></div>
        <p class="finance-modal-note" style="margin-top:0">Saca de una categoría los movimientos cuyo concepto lleva alguna de estas palabras. Con «*» al final cuentan también las que empiezan así. Después Bitácora aprende y los nuevos caen solos.</p>
        <div class="finance-correction-inputs">
            <div><div class="modal-label">de.</div><select class="modal-input" onchange="dividirCat.origen=this.value;dividirCat.fuera=new Set();pintarDividirCategoria()">${gastos.map(c => `<option value="${c.id}" ${c.id === d.origen ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
            <div><div class="modal-label">a.</div><input class="modal-input" value="${escapeHtml(d.nombre)}" onchange="dividirCat.nombre=this.value.trim();pintarDividirCategoria()" placeholder="nombre de la categoría"></div>
        </div>
        <div class="modal-label">palabras del concepto.</div>
        <input class="modal-input" value="${escapeHtml(d.palabras)}" onchange="dividirCat.palabras=this.value;dividirCat.fuera=new Set();pintarDividirCategoria()">
        <div class="fin-imp-resumen"><b>${marcados.length} ${marcados.length === 1 ? 'movimiento' : 'movimientos'}</b><span>pasan a «${escapeHtml(d.nombre || '…')}», ${financeMoney(total)} en total.</span></div>
        <details class="fin-imp-lista" ${lista.length <= 40 ? 'open' : ''}><summary>ver cuáles.</summary>
        <div class="fin-imp-filas">${lista.map(t => `<label class="fin-imp-fila"><input type="checkbox" ${d.fuera.has(t.id) ? '' : 'checked'} onchange="dividirCat.fuera[this.checked ? 'delete' : 'add']('${t.id}');pintarDividirCategoria()"><span>${financeDateLabelShort(t.date)}</span><b>${escapeHtml(t.note || t.bankNote || 'movimiento')}</b><i>-${financeMoney(t.amount)}</i></label>`).join('') || '<p class="finance-modal-note">Ninguno con esas palabras.</p>'}</div></details>
        <button class="btn-modal-primary" style="margin-top:14px" ${marcados.length && d.nombre ? '' : 'disabled'} onclick="aplicarDividirCategoria()">mover ${marcados.length} a «${escapeHtml(d.nombre || '…')}».</button>`;
    const hoja = document.querySelector('#modal-container .modal-sheet');
    if (hoja && hoja.querySelector('.fin-imp-resumen')) { const y = hoja.scrollTop; hoja.innerHTML = html; hoja.scrollTop = y; }
    else showModal(html);
}
async function aplicarDividirCategoria() {
    const d = dividirCat;
    const mover = dividirCategoriaCandidatos().filter(t => !d.fuera.has(t.id));
    if (!mover.length || !d.nombre) return;
    const origen = financeProCategoryById(d.origen);
    let destino = financePro.categories.find(c => c.type === 'expense' && financeProNormalizar(c.name) === financeProNormalizar(d.nombre));
    if (!destino) {
        const usados = new Set(financePro.categories.map(c => c.color));
        destino = { id: 'cat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name: d.nombre, icon: origen?.icon || 'other', color: FINANCE_PRO_PALETTE.find(c => !usados.has(c)) || FINANCE_PRO_PALETTE[0], type: 'expense' };
        financePro.categories.push(destino);
    }
    mover.forEach(t => { t.category = destino.id; t.needsReview = false; delete t.categoriaAuto; });
    dividirCat = null;
    financeSaldosCache = null;
    invalidarCachesDerivadas();
    closeModal();
    render();
    try { await saveData(); showToast(`${mover.length} movimientos pasan de «${origen?.name || 'la categoría'}» a «${destino.name}».`); }
    catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}


// ============================================================
//  IMPORTAR CATEGORÍAS (29-10)
//  Un archivo «fecha;cuenta;tipo;importe;concepto;categoria» (el que prepara Claude a partir del .md) rellena la
//  categoría de los movimientos que no tienen ninguna. Solo rellena: nunca cambia una categoría puesta, ni importes,
//  fechas o cuentas. Cada fila busca su movimiento exacto (misma fecha, cuenta, tipo, importe y concepto); si hay
//  dos iguales, cada fila se queda con uno. Las categorías que no existan (Bar) se crean.
// ============================================================
let importarCats = null;
function openImportarCategorias() {
    showModal(`<div class="modal-title">importar categorías.<button class="modal-close" aria-label="cerrar" onclick="closeModal()"><i class='ico ico-x' aria-hidden=true></i></button></div>
        <p class="finance-modal-note" style="margin-top:0">Sube el archivo de categorías. Solo se rellenan movimientos sin categoría; los saldos no cambian. Antes se guarda una foto en «deshacer importación.».</p>
        <input type="file" class="modal-input" accept=".csv,.txt,text/csv,text/plain" onchange="leerArchivoCategorias(event)">
        <div id="importar-cats-cuerpo"></div>`);
}
async function leerArchivoCategorias(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    const filas = financeProParseCSV((await file.text()).replace(/^﻿/, '').trim());
    const cab = (filas[0] || []).map(h => String(h || '').trim().toLowerCase());
    const col = n => cab.indexOf(n);
    if (['fecha', 'cuenta', 'tipo', 'importe', 'concepto', 'categoria'].some(n => col(n) < 0)) return showToast('El archivo no tiene las columnas fecha, cuenta, tipo, importe, concepto y categoria', true);
    const usados = new Set();
    const cuentaDe = nombre => FINANCE_PRO_ACCOUNT_KEYS.find(k => financeProNormalizar(financePro.accounts[k]?.name || '') === financeProNormalizar(nombre));
    importarCats = { filas: filas.slice(1).map((r, i) => {
        const f = { i, fecha: financeProParseDate(r[col('fecha')]), cuenta: cuentaDe(r[col('cuenta')]), tipo: /^ing/i.test(r[col('tipo')]) ? 'income' : 'expense',
            importe: Math.abs(financeProParseEuroAmount(r[col('importe')])), concepto: String(r[col('concepto')] || '').trim(), categoria: String(r[col('categoria')] || '').trim() };
        const libres = financePro.transactions.filter(t => !usados.has(t) && t.date === f.fecha && t.account === f.cuenta && t.type === f.tipo && Math.abs(Number(t.amount) - f.importe) < 0.005 && String(t.note || '').trim() === f.concepto);
        const t = libres.find(t => !t.category) || null;
        f.estado = t ? 'ok' : libres.length ? 'ya' : 'no';
        if (t) { usados.add(t); f.t = t; }
        return f;
    }), fuera: new Set() };
    pintarImportarCategorias();
}
function pintarImportarCategorias() {
    const d = importarCats;
    const ok = d.filas.filter(f => f.estado === 'ok'), ya = d.filas.filter(f => f.estado === 'ya'), no = d.filas.filter(f => f.estado === 'no');
    const marcadas = ok.filter(f => !d.fuera.has(f.i));
    const nuevas = [...new Set(marcadas.map(f => f.categoria))].filter(n => !financePro.categories.some(c => financeProNormalizar(c.name) === financeProNormalizar(n)));
    const grupos = {};
    ok.forEach(f => { (grupos[f.categoria] ||= []).push(f); });
    document.getElementById('importar-cats-cuerpo').innerHTML = `
        <div class="fin-imp-resumen"><b>${marcadas.length} se categorizan</b><span>${ya.length ? `${ya.length} ya tenían categoría y no se tocan, ` : ''}${no.length ? `${no.length} no encuentran su movimiento, ` : ''}de ${d.filas.length} filas.</span></div>
        ${nuevas.length ? `<p class="finance-modal-note">Se crean ${nuevas.length === 1 ? 'la categoría' : 'las categorías'} ${nuevas.map(n => `«${escapeHtml(n)}»`).join(', ')}.</p>` : ''}
        ${Object.entries(grupos).sort((a, b) => b[1].length - a[1].length).map(([cat, l]) => `<details class="fin-imp-lista"><summary>${escapeHtml(cat)}: ${l.filter(f => !d.fuera.has(f.i)).length}.</summary><div class="fin-imp-filas">${l.map(f => `<label class="fin-imp-fila"><input type="checkbox" ${d.fuera.has(f.i) ? '' : 'checked'} onchange="importarCats.fuera[this.checked ? 'delete' : 'add'](${f.i});pintarImportarCategorias()"><span>${financeDateLabelShort(f.fecha)}</span><b>${escapeHtml(f.concepto || 'sin concepto')}</b><i>${f.tipo === 'income' ? '+' : '-'}${financeMoney(f.importe)}</i></label>`).join('')}</div></details>`).join('')}
        ${no.length ? `<details class="fin-imp-lista"><summary>no encuentran su movimiento: ${no.length}.</summary><div class="fin-imp-filas">${no.map(f => `<div class="fin-imp-fila"><span></span><span>${f.fecha ? financeDateLabelShort(f.fecha) : '?'}</span><b>${escapeHtml(f.concepto)}</b><i>${financeMoney(f.importe)}</i></div>`).join('')}</div></details>` : ''}
        <button class="btn-modal-primary" style="margin-top:14px" ${marcadas.length ? '' : 'disabled'} onclick="aplicarImportarCategorias()">categorizar ${marcadas.length}.</button>`;
}
async function aplicarImportarCategorias() {
    const d = importarCats;
    const marcadas = d.filas.filter(f => f.estado === 'ok' && !d.fuera.has(f.i) && !f.t.category);
    if (!marcadas.length) return;
    await financeImportGuardarAntes(`importar categorías (${marcadas.length})`);
    const usadosColor = new Set(financePro.categories.map(c => c.color));
    marcadas.forEach(f => {
        let c = financePro.categories.find(c => c.type === f.tipo && financeProNormalizar(c.name) === financeProNormalizar(f.categoria));
        if (!c) {
            const color = FINANCE_PRO_PALETTE.find(x => !usadosColor.has(x)) || FINANCE_PRO_PALETTE[0];
            usadosColor.add(color);
            c = { id: 'cat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name: f.categoria, icon: 'other', color, type: f.tipo };
            financePro.categories.push(c);
        }
        f.t.category = c.id; f.t.needsReview = false; delete f.t.categoriaAuto;
    });
    importarCats = null;
    financeSaldosCache = null;
    invalidarCachesDerivadas();
    closeModal();
    render();
    try { await saveData(); showToast(`${marcadas.length} movimientos categorizados. Los saldos no cambian.`); }
    catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
}
