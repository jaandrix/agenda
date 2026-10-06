        // ============================================================
        //  RENDER: INVESTMENTS
        // ============================================================
        // ============================================================
        //  FINANZAS: HUB
        // ============================================================
        // toLocaleString con opciones crea un formateador nuevo en cada
        // llamada, y Finanzas formatea decenas de importes y meses por
        // pintado: se crean una sola vez y se reutilizan (mismo resultado).
        const FMT_EUROS = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const FMT_MES_ANIO = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });

        function financeMoney(value) {
            return FMT_EUROS.format(Number(value || 0)) + '€';
        }

        function financeMonthKey(date = new Date()) {
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }

        function financeMonthLabel(key) {
            const [y, m] = String(key).split('-').map(Number);
            if (!y || !m) return key;
            return FMT_MES_ANIO.format(new Date(y, m - 1, 1));
        }

        function financeTotalAssets() {
            return Number(financeProfile.cash || 0) + Number(financeProfile.invested || 0) + Number(financeProfile.emergency || 0) + Number(financeProfile.vacation || 0);
        }

        function financeCorePatrimony() {
            return Number(financeProfile.cash || 0) + Number(financeProfile.invested || 0) + Number(financeProfile.emergency || 0);
        }

        function financeTargetTotal() {
            return Number(financeProfile.cashTarget || 0) + Number(financeProfile.investedTarget || 0) + Number(financeProfile.emergencyTarget || 0);
        }

        function financeRecurringTotal() {
            return entries.filter(e => (e.type === 'subscription' || e.type === 'fixed_expense') && e.active !== false)
                .reduce((s, e) => s + (Number(e.amount) || 0), 0);
        }

        // ============================================================
        //  PROVISIÓN A FIN DE AÑO
        //  Combina la tendencia histórica mensual (financeProfile.history)
        //  con el plan manual de la tarjeta de Previsión. El peso de la
        //  tendencia histórica crece con el número de meses registrados
        //  (0 con poco historial, 1 a partir de 12 meses), así que la
        //  estimación se vuelve más precisa sola conforme el usuario
        //  actualiza sus cifras mes a mes.
        // ============================================================
        function financeHistoricalDelta(key) {
            const hist = [...(financeProfile.history || [])].sort((a, b) => String(a.month).localeCompare(String(b.month))).slice(-12);
            const values = hist.map(h => Number(h[key] || 0));
            if (values.length < 2) return null;
            const deltas = values.slice(1).map((v, i) => v - values[i]);
            return { avg: deltas.reduce((s, d) => s + d, 0) / deltas.length, weight: Math.min(1, deltas.length / 11) };
        }

        function financeYearEndProvision(key) {
            const now = new Date();
            const monthsLeft = 12 - now.getMonth();
            if (monthsLeft <= 0) return null;
            const current = Number(financeProfile[key] || 0);
            const fc = financeProfile.forecastProfile || {};
            const hist = financeHistoricalDelta(key);

            const blend = (planned) => hist ? (hist.weight * hist.avg + (1 - hist.weight) * planned) : planned;

            if (key === 'cash') {
                const salary = Number(fc.salary || 0);
                const recurring = financeRecurringTotal();
                const plannedDuring = salary - recurring - Number(fc.emergencyMonthlyPlan || 0) - Number(fc.vacationMonthlyPlan || 0) - Number(fc.investMonthlyPlan || 0);
                const plannedAfter = -recurring;
                const contractMonths = Number(fc.contractMonths || 0);
                const monthsInContract = Math.min(monthsLeft, contractMonths > 0 ? contractMonths : monthsLeft);
                const monthsAfter = monthsLeft - monthsInContract;
                if (!hist && !(salary > 0) && recurring === 0) return null;
                return current + blend(plannedDuring) * monthsInContract + blend(plannedAfter) * monthsAfter;
            }

            const planned = key === 'emergency' ? Number(fc.emergencyMonthlyPlan || 0) : Number(fc.vacationMonthlyPlan || 0);
            if (!hist && !planned) return null;
            return current + blend(planned) * monthsLeft;
        }

        // Todas las cuentas con saldo: las 4 fijas de siempre + las que el
        // usuario haya añadido. "key" identifica cada una para usarla en
        // financeSnapshot y en las líneas configurables de la gráfica.
        function getAllAccounts() {
            return [
                { key: 'cash', label: 'Efectivo / bancos', balance: Number(financeProfile.cash || 0) },
                { key: 'emergency', label: 'Fondo de emergencia', balance: Number(financeProfile.emergency || 0) },
                { key: 'vacation', label: 'Reserva de vacaciones', balance: Number(financeProfile.vacation || 0) },
                { key: 'invested', label: 'Inversiones', balance: Number(financeProfile.invested || 0) },
                ...(financeProfile.customAccounts || []).map(a => ({ key: a.id, label: a.name, balance: Number(a.balance || 0) }))
            ];
        }

        function financeSnapshot() {
            const accounts = {};
            getAllAccounts().forEach(a => { accounts[a.key] = a.balance; });
            return {
                month: financeMonthKey(),
                date: new Date().toISOString(),
                cash: Number(financeProfile.cash || 0),
                invested: Number(financeProfile.invested || 0),
                emergency: Number(financeProfile.emergency || 0),
                vacation: Number(financeProfile.vacation || 0),
                safe: Number(financeProfile.cash || 0) + Number(financeProfile.emergency || 0),
                total: financeCorePatrimony(),
                accounts
            };
        }

        // Mantiene siempre un punto para el mes en curso en el histórico,
        // arrancando con las cifras en vivo. Si el mes ya cambió desde el
        // último registro, crea el nuevo punto (el mes anterior queda
        // "congelado" tal y como estaba) sin necesidad de acción manual.
        function ensureCurrentMonthHistory() {
            const month = financeMonthKey();
            const history = Array.isArray(financeProfile.history) ? financeProfile.history : [];
            if (history.some(h => h.month === month)) return;
            financeProfile.history = [...history, financeSnapshot()]
                .sort((a, b) => String(a.month).localeCompare(String(b.month)))
                .slice(-36);
            saveData().catch(e => console.error(e));
        }

        function financePreviousSnapshot() {
            const current = financeMonthKey();
            return [...(financeProfile.history || [])]
                .filter(h => h.month !== current)
                .sort((a, b) => String(b.month).localeCompare(String(a.month)))[0] || null;
        }

        function financePctChange(current, previous) {
            if (previous === null || previous === undefined || Number(previous) === 0) return null;
            return ((Number(current) - Number(previous)) / Math.abs(Number(previous))) * 100;
        }

        function financePctToTarget(current, target) {
            if (Number(target) <= 0) return null;
            return (Number(current) / Number(target)) * 100;
        }

        function financeMonthDiff(fromKey, toKey) {
            const [fy, fm] = String(fromKey).split('-').map(Number);
            const [ty, tm] = String(toKey).split('-').map(Number);
            return (ty - fy) * 12 + (tm - fm);
        }

        function financeProjectedCashAtYearEnd() {
            const now = new Date();
            let balance = Number(financeProfile.cash || 0);
            const recurring = financeRecurringTotal();
            const currentKey = financeMonthKey(now);
            const year = now.getFullYear();
            for (let month = now.getMonth(); month < 12; month++) {
                const key = `${year}-${String(month + 1).padStart(2, '0')}`;
                const salary = Number(financeProfile.salaryForecast?.[key] || 0);
                if (key === currentKey) balance += Math.max(0, salary);
                else balance += salary;
                const today = todayISO();
                const oneOffs = (financeProfile.oneOffIncome || []).filter(x => {
                    const d = String(x.date || '');
                    return d.slice(0,7) === key && (d > today || (d === today && !x.addedToCash));
                });
                balance += oneOffs.reduce((s, x) => s + (Number(x.amount) || 0), 0);
                balance -= recurring;
            }
            return Math.max(0, balance);
        }

        function financeYearEndInvestedProjection() {
            const now = new Date();
            const monthsLeft = 12 - now.getMonth();
            const current = Number(financeProfile.invested || 0);
            const monthly = Number(investmentData.projectionMonthly || 0);
            return current + monthly * monthsLeft;
        }

        function financeYearEndPatrimonyProjection() {
            return financeProjectedCashAtYearEnd() + financeYearEndInvestedProjection() + Number(financeProfile.emergency || 0);
        }

        function financeGoalStatus(value, target) {
            if (Number(target) <= 0) return { pct: null, label: 'Sin objetivo', cls: '' };
            const pct = Math.max(0, Math.min(100, Number(value) / Number(target) * 100));
            return { pct, label: `${pct.toFixed(0)}% del objetivo`, cls: pct >= 100 ? 'finance-goal-complete' : '' };
        }

        const FINANCE_EYE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.1 12S4.8 5 12 5s10.9 7 10.9 7-3.7 7-10.9 7-10.9-7-10.9-7z"/><circle cx="12" cy="12" r="3"/></svg>';
        const FINANCE_EYE_OFF_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6 0 9.5 5.5 9.9 7a10.9 10.9 0 0 1-3 3.9M6.2 6.2C3.6 7.9 1.9 10.7 1.1 12c.7 1.2 4.2 7 10.9 7 1.6 0 3-.3 4.2-.8"/><path d="M9.5 9.7a3 3 0 0 0 4.2 4.2"/></svg>';

        // Iconos de las cuentas de Finanzas — mismo trazo/estilo que los
        // iconos de ojo de arriba, para que todo el dashboard comparta un
        // único lenguaje visual (stroke, sin relleno).
        const FINANCE_ICON_CASH = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.4"/><path d="M6 9h.01M18 15h.01"/></svg>';
        const FINANCE_ICON_SHIELD = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3.2v5.3c0 4.6-3 7.7-7 9-4-1.3-7-4.4-7-9V6.2L12 3z"/><path d="M9 12l2 2 4-4"/></svg>';
        const FINANCE_ICON_SUN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M4.3 4.3l1.8 1.8M17.9 17.9l1.8 1.8M2.5 12h2.6M18.9 12h2.6M4.3 19.7l1.8-1.8M17.9 6.1l1.8-1.8"/></svg>';
        const FINANCE_ICON_TREND = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16.5l6.2-6.2 4 4L21 6.5"/><path d="M15 6.5h6v6"/></svg>';
        const FINANCE_ICON_CARD = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19"/><path d="M6 14.5h4"/></svg>';
        const FINANCE_ICON_REPEAT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2.5l3.5 3.5L17 9.5"/><path d="M3.5 10.5V9a4 4 0 0 1 4-4h13"/><path d="M7 21.5L3.5 18 7 14.5"/><path d="M20.5 13.5V15a4 4 0 0 1-4 4h-13"/></svg>';
        const FINANCE_ICON_STAR = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5l2.95 6.1 6.55.7-4.9 4.5 1.3 6.5L12 16.9l-5.9 3.4 1.3-6.5-4.9-4.5 6.55-.7z"/></svg>';
        const FINANCE_ICON_TARGET = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.7"/><circle cx="12" cy="12" r="0.9" fill="currentColor"/></svg>';
        const FINANCE_ICON_CHART = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V10M11 21V4M18 21v-7"/><path d="M2.5 21h19"/></svg>';
        const FINANCE_ICON_CALENDAR = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18"/><path d="M8 3v4M16 3v4"/></svg>';
        const FINANCE_ICON_GLOBE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.8 2.5 4.3 5.7 4.3 9s-1.5 6.5-4.3 9c-2.8-2.5-4.3-5.7-4.3-9s1.5-6.5 4.3-9z"/></svg>';
        const FINANCE_ICON_UPLOAD = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>';
        const FINANCE_ICON_SWAP = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v14M7 17l-3.5-3.5M7 17l3.5-3.5"/><path d="M17 21V7M17 7l3.5 3.5M17 7l-3.5 3.5"/></svg>';
        const FINANCE_ICON_ALERT = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v6"/><circle cx="12" cy="16.5" r="0.75" fill="currentColor" stroke="none"/></svg>';
        const FINANCE_ICON_SCALE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M7 7h10"/><path d="M4 7l-2.5 5.5A2.7 2.7 0 0 0 4 16a2.7 2.7 0 0 0 2.5-3.5z"/><path d="M20 7l-2.5 5.5A2.7 2.7 0 0 0 20 16a2.7 2.7 0 0 0 2.5-3.5z"/></svg>';
        const FINANCE_ICON_STATS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>';

        // Iconos propios de los botones de "Planificación a futuro" — sólidos
        // (fill, no stroke), pensados para verse grandes y de alto contraste
        // sobre el fondo de la tarjeta, al estilo de las tarjetas de
        // referencia (nombre arriba, icono grande abajo).
        const FINANCE_ICON_PULSE = '<svg viewBox="0 0 120 80" fill="currentColor"><rect x="2" y="6" width="15" height="68" rx="7.5"/><rect x="23" y="13" width="15" height="54" rx="7.5"/><rect x="44" y="20" width="13" height="40" rx="6.5"/><rect x="63" y="27" width="11" height="26" rx="5.5"/><rect x="80" y="32" width="9" height="16" rx="4.5"/><rect x="95" y="35.5" width="7" height="9" rx="3.5"/></svg>';
        const FINANCE_ICON_GROWTH_BARS = '<svg viewBox="0 0 100 80" fill="currentColor"><rect x="2" y="50" width="22" height="28" rx="9"/><rect x="32" y="28" width="22" height="50" rx="9"/><rect x="62" y="2" width="22" height="76" rx="9"/></svg>';
        const FINANCE_ICON_CROSSHAIR = '<svg viewBox="0 0 100 100" fill="none"><rect x="45" y="1" width="10" height="20" rx="5" fill="currentColor"/><rect x="45" y="79" width="10" height="20" rx="5" fill="currentColor"/><rect x="1" y="45" width="20" height="10" rx="5" fill="currentColor"/><rect x="79" y="45" width="20" height="10" rx="5" fill="currentColor"/><circle cx="50" cy="50" r="23" stroke="currentColor" stroke-width="9"/><circle cx="50" cy="50" r="9" fill="currentColor"/></svg>';
        const FINANCE_ICON_ARROW_UP = '<svg viewBox="0 0 100 100" fill="none"><path d="M25 75 L75 25 M50 22 H78 V50" stroke="currentColor" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        // Misma familia sólida/geométrica que los tres anteriores, para las
        // 4 TARJETA BITACORA de "Otros ahorros" (fondo de emergencia,
        // vacaciones, gastos recurrentes, coleccionables) — inspirados en
        // las 4 referencias que se pidió replicar.
        const FINANCE_ICON_ASTERISK_BOLD = '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M44 2 H56 V38 L84 18 L90 28 L60 46 L90 64 L84 74 L56 56 V98 H44 V56 L16 74 L10 64 L40 46 L10 28 L16 18 L44 38 Z"/></svg>';
        const FINANCE_ICON_FAN_BOLD = '<svg viewBox="0 0 100 100" fill="currentColor"><g transform="translate(50,96)"><path d="M0 0 L-6 -84 Q0 -91 6 -84 Z" transform="rotate(-60)"/><path d="M0 0 L-6 -84 Q0 -91 6 -84 Z" transform="rotate(-36)"/><path d="M0 0 L-6 -84 Q0 -91 6 -84 Z" transform="rotate(-12)"/><path d="M0 0 L-6 -84 Q0 -91 6 -84 Z" transform="rotate(12)"/><path d="M0 0 L-6 -84 Q0 -91 6 -84 Z" transform="rotate(36)"/><path d="M0 0 L-6 -84 Q0 -91 6 -84 Z" transform="rotate(60)"/></g></svg>';
        const FINANCE_ICON_REFRESH_BOLD = '<svg viewBox="0 0 100 100" fill="none"><path d="M50 12 A38 38 0 0 1 88 50" stroke="currentColor" stroke-width="13" stroke-linecap="round"/><path d="M50 88 A38 38 0 0 1 12 50" stroke="currentColor" stroke-width="13" stroke-linecap="round"/><path d="M78 30 L91 27 L93 42 Z" fill="currentColor"/><path d="M22 70 L9 73 L7 58 Z" fill="currentColor"/></svg>';
        const FINANCE_ICON_CLUSTER_BOLD = (() => {
            const petal = '<circle cx="50" cy="18" r="9"/><rect x="46" y="26" width="8" height="14" rx="4"/>';
            const angles = [0, 60, 120, 180, 240, 300];
            return `<svg viewBox="0 0 100 100" fill="currentColor"><circle cx="50" cy="50" r="12"/>${angles.map(a => `<g transform="rotate(${a} 50 50)">${petal}</g>`).join('')}</svg>`;
        })();

        // ============================================================
        //  FINANZAS PRO — iconos de categoría (sin emoticonos: mismo
        //  trazo/estilo que el resto de iconos de Finanzas).
        // ============================================================
        function financeProSvgIcon(inner) {
            return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
        }
        const FINANCE_PRO_CATEGORY_ICON_SET = [
            { key: 'food', label: 'Comida y bebida', svg: financeProSvgIcon('<path d="M4 3h13v8a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V3z"/><path d="M17 6h1.5a2.5 2.5 0 0 1 0 5H17"/>') },
            { key: 'home', label: 'Vivienda', svg: financeProSvgIcon('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>') },
            { key: 'car', label: 'Transporte', svg: financeProSvgIcon('<path d="M4 16V9a2 2 0 0 1 2-2h1l2-3h6l2 3h1a2 2 0 0 1 2 2v7"/><path d="M4 16h16"/><circle cx="7.5" cy="16.5" r="1.5"/><circle cx="16.5" cy="16.5" r="1.5"/>') },
            { key: 'bag', label: 'Compras', svg: financeProSvgIcon('<path d="M6 8V6a6 6 0 0 1 12 0v2"/><rect x="3" y="8" width="18" height="13" rx="2"/>') },
            { key: 'ticket', label: 'Ocio', svg: financeProSvgIcon('<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M9 6v12" stroke-dasharray="2 2"/>') },
            { key: 'heart', label: 'Salud', svg: financeProSvgIcon('<path d="M12 20s-7.5-4.6-9.7-9A5.2 5.2 0 0 1 12 6a5.2 5.2 0 0 1 9.7 5c-2.2 4.4-9.7 9-9.7 9z"/>') },
            { key: 'phone', label: 'Comunicación', svg: financeProSvgIcon('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>') },
            { key: 'bank', label: 'Comisiones e impuestos', svg: financeProSvgIcon('<path d="M12 3l9 5H3z"/><path d="M5 8v10M9.5 8v10M14.5 8v10M19 8v10"/><path d="M3 21h18"/>') },
            { key: 'book', label: 'Educación', svg: financeProSvgIcon('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M19 19H6"/>') },
            { key: 'family', label: 'Familia y mascotas', svg: financeProSvgIcon('<circle cx="8" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M3 20v-1a5 5 0 0 1 5-5h1a5 5 0 0 1 5 5v1"/><path d="M14 20v-.5a3.8 3.8 0 0 1 3.8-3.8h.4a3.8 3.8 0 0 1 3.8 3.8v.5"/>') },
            { key: 'briefcase', label: 'Sueldo / trabajo', svg: financeProSvgIcon('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>') },
            { key: 'coin', label: 'Ingreso extra', svg: financeProSvgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8.5 10.5h5a1.75 1.75 0 0 1 0 3.5h-4a1.75 1.75 0 0 0 0 3.5h5"/>') },
            { key: 'trend', label: 'Inversiones', svg: FINANCE_ICON_TREND },
            { key: 'gift', label: 'Regalos', svg: financeProSvgIcon('<rect x="3" y="9" width="18" height="12" rx="1"/><path d="M3 9h18M12 9v12"/><path d="M12 9C10 4 4 5 5 8c.6 1.8 4 1 7 1zM12 9c2-5 8-4 7-1-.6 1.8-4 1-7 1z"/>') },
            { key: 'repeat', label: 'Reembolsos', svg: FINANCE_ICON_REPEAT },
            { key: 'plane', label: 'Viajes', svg: financeProSvgIcon('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>') },
            { key: 'paw', label: 'Mascotas', svg: financeProSvgIcon('<circle cx="12" cy="15" r="4" fill="currentColor" stroke="none"/><circle cx="6" cy="9" r="2" fill="currentColor" stroke="none"/><circle cx="10" cy="5" r="2" fill="currentColor" stroke="none"/><circle cx="14" cy="5" r="2" fill="currentColor" stroke="none"/><circle cx="18" cy="9" r="2" fill="currentColor" stroke="none"/>') },
            { key: 'dumbbell', label: 'Deporte', svg: financeProSvgIcon('<path d="M7 12h10"/><rect x="2" y="9" width="4" height="6" rx="1.2"/><rect x="18" y="9" width="4" height="6" rx="1.2"/><rect x="5.5" y="10.2" width="2.2" height="3.6" rx="0.6"/><rect x="16.3" y="10.2" width="2.2" height="3.6" rx="0.6"/>') },
            { key: 'laptop', label: 'Tecnología', svg: financeProSvgIcon('<rect x="4" y="4" width="16" height="10" rx="1.5"/><path d="M2 18h20"/><path d="M9 18l1-2h4l1 2"/>') },
            { key: 'sparkle', label: 'Bienestar y belleza', svg: financeProSvgIcon('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>') },
            { key: 'key', label: 'Alquileres', svg: financeProSvgIcon('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9"/><path d="M17 6l3 3"/><path d="M14 9l2 2"/>') },
            { key: 'star', label: 'Coleccionables', svg: FINANCE_ICON_STAR },
            { key: 'fuel', label: 'Gasolina', svg: financeProSvgIcon('<path d="M3 21V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15"/><path d="M3 21h10"/><rect x="5" y="6" width="6" height="5" rx="0.5"/><path d="M15 8h2l3 3v7a1.5 1.5 0 0 1-3 0v-3h-2"/>') },
            { key: 'other', label: 'Otros', svg: financeProSvgIcon('<circle cx="12" cy="12" r="8"/>') }
        ];
        function financeProCategoryIconSvg(key) {
            return (FINANCE_PRO_CATEGORY_ICON_SET.find(i => i.key === key) || FINANCE_PRO_CATEGORY_ICON_SET[FINANCE_PRO_CATEGORY_ICON_SET.length - 1]).svg;
        }

        // Cabecera de panel con icono de color — mismo lenguaje visual que
        // las tarjetas de cuentas, para que cada panel de Finanzas se
        // identifique de un vistazo (gráfica, previsión, inversión, metas).
        function financePanelHeadIcon(iconSvg, iconClass, kicker, title) {
            return `<div class="finance-panel-head-icon"><div class="finance-metric-icon ${iconClass}" style="width:32px;height:32px;margin:0">${iconSvg}</div><div><div class="finance-kicker">${escapeHtml(kicker)}</div><h3>${escapeHtml(title)}</h3></div></div>`;
        }

        // Cambia solo la clase "blurred" y el icono del botón sobre el DOM ya
        // pintado (en vez de volver a llamar a render(), que sustituiría
        // todo el contenido y perdería la animación de transición del blur).
        async function toggleBlurFinances() {
            blurFinances = !blurFinances;
            const dash = document.querySelector('.finance-dashboard');
            if (dash) {
                dash.classList.toggle('blurred', blurFinances);
                const btn = dash.querySelector('.finance-blur-toggle');
                if (btn) {
                    btn.title = blurFinances ? 'Mostrar cifras' : 'Ocultar cifras';
                    btn.innerHTML = blurFinances ? FINANCE_EYE_OFF_ICON : FINANCE_EYE_ICON;
                }
            } else {
                render();
            }
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // Sustituye (o crea) el punto del mes en curso en el histórico por
        // uno fresco con las cifras en vivo. Se llama desde cualquier sitio
        // que edite una cuenta fuera del flujo de "Actualizar este mes",
        // para que la gráfica nunca se quede desincronizada de lo que el
        // usuario ve en las tarjetas.
        function refreshCurrentMonthSnapshot() {
            const snap = financeSnapshot();
            const history = Array.isArray(financeProfile.history) ? financeProfile.history : [];
            const withoutCurrent = history.filter(h => h.month !== snap.month);
            financeProfile.history = [...withoutCurrent, snap].sort((a, b) => String(a.month).localeCompare(String(b.month))).slice(-36);
        }

        async function saveFinanceDashboard() {
            refreshCurrentMonthSnapshot();
            try { await saveData(); showToast('Finanzas actualizadas'); render(); }
            catch (e) { console.error(e); showToast('No se pudieron guardar las finanzas', true); }
        }

        // ============================================================
        //  GRÁFICA FLOTANTE: seguimiento mensual del patrimonio
        //  Línea "segura" = Efectivo + Fondo de emergencia
        //  Línea "total"  = línea segura + Inversión
        //  Usa financeProfile.history: el mes en curso se auto-actualiza
        //  con las cifras en vivo (ensureCurrentMonthHistory), y los 3
        //  meses anteriores se pueden corregir a mano ("Corregir
        //  registros"). Sin caja, sin fondo: flota sobre la app. Los
        //  colores usan variables CSS por lo que se invierten solos
        //  con el tema. Incluye una línea de puntos fija en el objetivo.
        // ============================================================
        // Ventana temporal (nº de meses) que se muestra en la gráfica
        // flotante; null = todo el histórico disponible. Se ajusta con la
        // rueda del ratón, como en un gráfico de cotización.
        let financeChartMonths = null;

        function financeChartWheelZoom(event) {
            const totalMonths = Array.isArray(financeProfile.history) ? financeProfile.history.length : 0;
            if (totalMonths <= 2) return;
            event.preventDefault();
            const current = financeChartMonths || totalMonths;
            const next = Math.max(2, Math.min(totalMonths, current + (event.deltaY < 0 ? -1 : 1)));
            financeChartMonths = next;
            const wrap = document.getElementById('finance-floating-chart-wrap');
            if (wrap) wrap.innerHTML = renderFinanceFloatingChart();
        }

        // Líneas configurables de la gráfica: por defecto, las dos de
        // siempre (Efectivo+Emergencia y Patrimonio total); si el usuario
        // ha definido las suyas en "Configurar gráfica", se usan esas.
        function getFinanceChartSeries() {
            if (Array.isArray(financeProfile.chartSeries) && financeProfile.chartSeries.length) return financeProfile.chartSeries;
            return [
                { id: 'safe', name: 'Efectivo + Emergencia', accountKeys: ['cash', 'emergency'], color: 'var(--text-secondary)' },
                { id: 'total', name: 'Patrimonio total', accountKeys: ['cash', 'emergency', 'invested'], color: 'var(--text-primary)' }
            ];
        }

        // Los puntos guardados antes de tener desglose por cuenta ("accounts")
        // solo pueden aproximarse con safe/total; cualquier serie nueva del
        // usuario queda a 0 en esos meses antiguos.
        function financeSeriesValueForHistoryPoint(h, series) {
            if (h.accounts && typeof h.accounts === 'object') {
                return series.accountKeys.reduce((s, k) => s + Number(h.accounts[k] || 0), 0);
            }
            if (series.id === 'safe') return h.safe !== undefined ? Number(h.safe) : Number(h.cash || 0) + Number(h.emergency || 0);
            if (series.id === 'total') return h.total !== undefined ? Number(h.total) : Number(h.cash || 0) + Number(h.emergency || 0) + Number(h.invested || 0);
            return 0;
        }

        // Curva suave a través de todos los puntos (Catmull-Rom -> Bézier
        // cúbica), en vez de segmentos rectos — inspirado en cómo dibuja
        // sus gráficas Stoic, sin picos angulosos entre mes y mes.
        // Nombre distinto de financeSmoothPath (más abajo, usada por
        // renderFinanceProLineChart) porque esa otra toma tuplas [x,y] en
        // vez de objetos {x,y} — mismo nombre + firma distinta pisaba esta
        // definición (la última declaración de una función gana) y rompía
        // silenciosamente esta gráfica en cuanto había 3+ meses de histórico.
        function financeSmoothPathObj(points) {
            if (points.length < 2) return '';
            if (points.length === 2) return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`;
            let d = `M${points[0].x},${points[0].y}`;
            for (let i = 0; i < points.length - 1; i++) {
                const p0 = points[i === 0 ? 0 : i - 1];
                const p1 = points[i];
                const p2 = points[i + 1];
                const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
                const cp1x = p1.x + (p2.x - p0.x) / 6;
                const cp1y = p1.y + (p2.y - p0.y) / 6;
                const cp2x = p2.x - (p3.x - p1.x) / 6;
                const cp2y = p2.y - (p3.y - p1.y) / 6;
                d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
            }
            return d;
        }

        function renderFinanceFloatingChart() {
            const raw = Array.isArray(financeProfile.history) ? [...financeProfile.history] : [];
            const series = getFinanceChartSeries();
            const fullData = raw
                .sort((a, b) => String(a.month).localeCompare(String(b.month)))
                .map(h => {
                    const point = { month: h.month };
                    series.forEach(s => { point[s.id] = financeSeriesValueForHistoryPoint(h, s); });
                    return point;
                });
            const visibleCount = financeChartMonths ? Math.min(financeChartMonths, fullData.length) : fullData.length;
            const data = fullData.slice(-visibleCount);
            const target = financeTargetTotal();

            if (!data.length) {
                return `<div class="finance-empty-state">Aún no hay histórico. Edita tus cifras o usa <strong>Corregir registros</strong> abajo para registrar meses anteriores y empezar a ver la evolución.</div>`;
            }

            const W = 950, H = 220, padX = 48, padT = 30, padB = 26;
            const innerW = W - padX * 2, innerH = H - padT - padB;
            const allValues = data.flatMap(d => series.map(s => d[s.id]));
            const maxVal = Math.max(1, target, ...allValues) * 1.08;

            const x = i => data.length === 1 ? padX + innerW / 2 : padX + (innerW * i) / (data.length - 1);
            const y = v => padT + innerH - (v / maxVal) * innerH;

            const targetLine = target > 0 ? `
                <line x1="${padX}" y1="${y(target).toFixed(1)}" x2="${W - padX}" y2="${y(target).toFixed(1)}" stroke="var(--text-muted)" stroke-width="1.3" stroke-dasharray="1.5,4" stroke-linecap="round"/>
                <text x="${padX}" y="${(y(target) - 6).toFixed(1)}" font-size="9" fill="var(--text-muted)">Objetivo · ${financeMoney(target)}</text>` : '';

            // Valores de guía en el eje Y (0 / mitad / máximo), para poder
            // situar cada punto sin tener que pasar el ratón por encima.
            const yAxisGuides = [0, maxVal / 2, maxVal].map(v => `
                <line x1="${padX}" y1="${y(v).toFixed(1)}" x2="${W - padX}" y2="${y(v).toFixed(1)}" stroke="var(--border)" stroke-width="0.6"/>
                <text x="${padX - 6}" y="${(y(v) - 3).toFixed(1)}" text-anchor="end" font-size="8" fill="var(--text-muted)">${financeMoney(v).replace(',00€', '€')}</text>`).join('');

            // El último punto de la serie principal se marca más grande y
            // relleno, como el punto de "hoy" en las gráficas de Stoic —
            // el resto quedan como aros finos, discretos.
            const dotsOf = (s, isMain) => data.map((d, i) => {
                const isLast = isMain && i === data.length - 1;
                return `
                <circle class="finance-chart-point" cx="${x(i).toFixed(1)}" cy="${y(d[s.id]).toFixed(1)}" r="${isLast ? 5 : 3.5}" fill="${isLast ? (s.color || 'var(--text-secondary)') : 'var(--bg-app)'}" stroke="${s.color || 'var(--text-secondary)'}" stroke-width="2"
                    onmousemove="showFinanceChartTooltip(event,'${escapeHtml(s.name).replace(/'/g, "\\'")}','${escapeHtml(financeMonthLabel(d.month))}',${d[s.id]})"
                    onmouseleave="hideFinanceChartTooltip()"></circle>`;
            }).join('');

            const step = Math.max(1, Math.ceil(data.length / 6));
            const xLabels = data.map((d, i) => (data.length === 1 || i % step === 0 || i === data.length - 1)
                ? `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="var(--text-muted)">${escapeHtml(financeMonthLabel(d.month).split(' de ')[0])}</text>`
                : '').join('');

            let linesSvg = '';
            let lastYearSvg = '';
            let hasLastYear = false;
            if (data.length > 1) {
                const pathOf = id => financeSmoothPathObj(data.map((d, i) => ({ x: Number(x(i).toFixed(1)), y: Number(y(d[id]).toFixed(1)) })));
                const mainSeries = series[series.length - 1];
                linesSvg = series.map((s, idx) => `<path d="${pathOf(s.id)}" fill="none" stroke="${s.color || 'var(--text-secondary)'}" stroke-width="${idx === series.length - 1 ? 2.5 : 2}" ${idx === series.length - 1 ? '' : 'stroke-dasharray="4,4"'} stroke-linecap="round" stroke-linejoin="round"/>`).join('');

                // "Mismo mes, año pasado" — línea de referencia gris tenue,
                // superpuesta en la misma posición X que el punto actual
                // (no desplazada en el tiempo), para comparar el ritmo de
                // este año contra el de hace 12 meses. Se dibuja detrás de
                // las líneas principales y solo por los tramos donde hay
                // dato real de hace un año (huecos = sin ese mes todavía).
                const historyByMonth = {};
                (Array.isArray(financeProfile.history) ? financeProfile.history : []).forEach(h => { historyByMonth[h.month] = h; });
                const lastYearPoints = data.map((d, i) => {
                    const [yy, mm] = d.month.split('-').map(Number);
                    const prevKey = `${yy - 1}-${String(mm).padStart(2, '0')}`;
                    const h = historyByMonth[prevKey];
                    if (!h) return null;
                    const v = financeSeriesValueForHistoryPoint(h, mainSeries);
                    return { x: Number(x(i).toFixed(1)), y: Number(y(v).toFixed(1)) };
                });
                hasLastYear = lastYearPoints.some(p => p !== null);
                if (hasLastYear) {
                    const segments = [];
                    let current = [];
                    lastYearPoints.forEach(p => {
                        if (p) current.push(p);
                        else { if (current.length > 1) segments.push(current); current = []; }
                    });
                    if (current.length > 1) segments.push(current);
                    const lastYearPath = segments.map(seg => financeSmoothPathObj(seg)).join(' ');
                    lastYearSvg = `<path d="${lastYearPath}" fill="none" stroke="var(--text-secondary)" stroke-width="2" stroke-opacity="0.35" stroke-linecap="round" stroke-linejoin="round"/>`;
                }
            }

            return `
                <div class="finance-chart-svg-wrap finance-floating-svg-wrap">
                    <svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:280px">
                        ${yAxisGuides}
                        ${lastYearSvg}
                        ${linesSvg}
                        ${targetLine}
                        ${series.map((s, idx) => dotsOf(s, idx === series.length - 1)).join('')}
                        ${xLabels}
                    </svg>
                </div>
                <div class="finance-chart-legend">${series.map(s => `<span class="finance-chart-legend-item"><i style="background:${s.color || 'var(--text-secondary)'}"></i>${escapeHtml(s.name)}</span>`).join('')}${hasLastYear ? `<span class="finance-chart-legend-item"><i style="background:var(--text-secondary);opacity:.4"></i>Año pasado</span>` : ''}</div>
                ${data.length === 1 ? `<div class="finance-empty-state" style="margin-top:6px">Un solo registro todavía. Usa <strong>Corregir registros</strong> abajo para añadir meses anteriores y ver la evolución completa.</div>` : ''}`;
        }

        function showFinanceChartTooltip(evt, seriesLabel, monthLabel, value) {
            let tip = document.getElementById('finance-chart-tooltip');
            if (!tip) {
                tip = document.createElement('div');
                tip.id = 'finance-chart-tooltip';
                document.body.appendChild(tip);
            }
            tip.innerHTML = `<strong>${financeMoney(value)}</strong><br>${escapeHtml(seriesLabel)} · ${escapeHtml(monthLabel)}`;
            tip.style.display = 'block';
            tip.style.left = (evt.clientX + 14) + 'px';
            tip.style.top = (evt.clientY + 14) + 'px';
        }

        function hideFinanceChartTooltip() {
            const tip = document.getElementById('finance-chart-tooltip');
            if (tip) tip.style.display = 'none';
        }

        function openFinanceMetricEditor(key, label, targetKey) {
            showModal(`
                <div class="modal-title">Editar ${escapeHtml(label)}</div>
                <div class="modal-label">Valor actual (€)</div>
                <input id="finance-edit-value" class="modal-input" type="number" min="0" step="0.01" value="${Number(financeProfile[key] || 0)}">
                <div class="modal-label">Objetivo para final de año (€)</div>
                <input id="finance-edit-target" class="modal-input" type="number" min="0" step="0.01" value="${Number(financeProfile[targetKey] || 0)}">
                <button class="btn-modal-primary" onclick="saveFinanceMetricEditor('${key}','${targetKey}')">Guardar</button>
            `);
        }

        async function saveFinanceMetricEditor(key, targetKey) {
            financeProfile[key] = Math.max(0, Number(document.getElementById('finance-edit-value')?.value) || 0);
            financeProfile[targetKey] = Math.max(0, Number(document.getElementById('finance-edit-target')?.value) || 0);
            closeModal();
            await saveFinanceDashboard();
        }

        // ============================================================
        //  CUENTAS (minimalista): Fondo indexado + Gastos recurrentes
        // ============================================================
        function openFinanceTargetEditor() {
            showModal(`
                <div class="modal-title">Editar objetivo del patrimonio operativo</div>
                <div class="modal-label">Efectivo / bancos (€)</div>
                <input id="finance-target-cash" class="modal-input" type="number" min="0" step="0.01" value="${Number(financeProfile.cashTarget || 0)}">
                <div class="modal-label">Fondo de emergencia (€)</div>
                <input id="finance-target-emergency" class="modal-input" type="number" min="0" step="0.01" value="${Number(financeProfile.emergencyTarget || 0)}">
                <div class="modal-label">Fondo indexado (€)</div>
                <input id="finance-target-invested" class="modal-input" type="number" min="0" step="0.01" value="${Number(financeProfile.investedTarget || 0)}">
                <button class="btn-modal-primary" onclick="saveFinanceTargetEditor()">Guardar</button>
            `);
        }

        async function saveFinanceTargetEditor() {
            financeProfile.cashTarget = Math.max(0, Number(document.getElementById('finance-target-cash')?.value) || 0);
            financeProfile.emergencyTarget = Math.max(0, Number(document.getElementById('finance-target-emergency')?.value) || 0);
            financeProfile.investedTarget = Math.max(0, Number(document.getElementById('finance-target-invested')?.value) || 0);
            closeModal();
            await saveFinanceDashboard();
        }

        function openRecurringExpensesModal() {
            showModal(`
                <div class="modal-title">Gastos recurrentes</div>
                <div class="finance-recurring-modal-cols">
                    ${renderRecurringColumn('subscription','Suscripciones','↻')}
                    ${renderRecurringColumn('fixed_expense','Gastos fijos','■')}
                </div>
                <button class="btn-secondary" style="width:auto;margin-top:16px" onclick="closeModal()">Cerrar</button>
            `);
        }

        function financeCollectiblesTotal() {
            return (Array.isArray(collectibles) ? collectibles : []).reduce((s, c) => s + (Number(c.value) || 0), 0);
        }

        // ============================================================
        //  CORREGIR REGISTROS: permite rellenar/ajustar a mano los
        //  3 meses anteriores de la gráfica (el mes en curso se
        //  actualiza solo con ensureCurrentMonthHistory).
        // ============================================================
        function financeRecentEditableMonths() {
            const months = [];
            const now = new Date();
            for (let i = 1; i <= 3; i++) {
                months.push(financeMonthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
            }
            return months;
        }

        function openFinanceHistoryCorrectionModal() {
            const months = financeRecentEditableMonths();
            const history = Array.isArray(financeProfile.history) ? financeProfile.history : [];
            const accounts = getAllAccounts();
            const rows = months.map(m => {
                const h = history.find(x => x.month === m);
                const acc = h && h.accounts && typeof h.accounts === 'object' ? h.accounts : {};
                const fields = accounts.map(a => `
                    <div>
                        <div class="modal-label">${escapeHtml(a.label)}</div>
                        <input class="modal-input finance-correction-input" data-month="${m}" data-field="${a.key}" type="number" min="0" step="0.01" value="${acc[a.key] !== undefined ? acc[a.key] : ''}" placeholder="0.00">
                    </div>`).join('');
                return `
                    <div class="finance-correction-row">
                        <div class="finance-correction-month">${escapeHtml(financeMonthLabel(m))}</div>
                        <div class="finance-correction-inputs">${fields}</div>
                    </div>`;
            }).join('');
            showModal(`
                <div class="modal-title">Corregir registros</div>
                <div class="finance-modal-note" style="margin-bottom:12px">Ajusta o rellena el saldo de cada cuenta para los 3 meses anteriores. Deja en blanco lo que no sepas. El mes actual se actualiza solo con tus cifras en vivo.</div>
                ${rows}
                <button class="btn-modal-primary" onclick="saveFinanceHistoryCorrection()">Guardar correcciones</button>
            `);
        }

        // Guarda un desglose por cuenta completo (igual que financeSnapshot())
        // para cada mes corregido — no solo "safe"/"total" — así cualquier
        // línea que el usuario configure en la gráfica (incluidas cuentas
        // propias o Inversión) tiene datos reales también en estos meses,
        // en vez de caer a 0 por no tener un desglose "accounts".
        // Punto de partida del desglose por cuenta de un mes histórico: si
        // ya tenía .accounts se reutiliza tal cual; si es un registro
        // antiguo sin desglose, se reconstruye desde sus campos planos
        // (cash/emergency/vacation/invested) en vez de partir de cero —
        // si no, corregir un solo campo borraría el resto a 0.
        function financeHistoryEntryAccountsBaseline(base) {
            if (base.accounts && typeof base.accounts === 'object') return { ...base.accounts };
            return { cash: base.cash, emergency: base.emergency, vacation: base.vacation, invested: base.invested };
        }

        async function saveFinanceHistoryCorrection() {
            const byMonth = {};
            document.querySelectorAll('.finance-correction-input').forEach(inp => {
                const m = inp.dataset.month, f = inp.dataset.field;
                byMonth[m] = byMonth[m] || {};
                byMonth[m][f] = inp.value === '' ? null : Math.max(0, Number(inp.value) || 0);
            });
            let history = Array.isArray(financeProfile.history) ? [...financeProfile.history] : [];
            Object.keys(byMonth).forEach(m => {
                const fields = byMonth[m];
                if (Object.values(fields).every(v => v === null)) return;
                const idx = history.findIndex(h => h.month === m);
                const base = idx >= 0 ? history[idx] : { month: m, date: new Date().toISOString() };
                const accounts = financeHistoryEntryAccountsBaseline(base);
                Object.keys(fields).forEach(key => { if (fields[key] !== null) accounts[key] = fields[key]; });
                const cash = Number(accounts.cash || 0);
                const emergency = Number(accounts.emergency || 0);
                const vacation = Number(accounts.vacation || 0);
                const invested = Number(accounts.invested || 0);
                const entry = { ...base, month: m, cash, emergency, vacation, invested, safe: cash + emergency, total: cash + emergency + invested, accounts };
                if (idx >= 0) history[idx] = entry; else history.push(entry);
            });
            financeProfile.history = history.sort((a, b) => String(a.month).localeCompare(String(b.month))).slice(-36);
            closeModal();
            try { await saveData(); showToast('Registros corregidos'); render(); }
            catch (e) { console.error(e); showToast('No se pudieron guardar los registros', true); }
        }

        // ============================================================
        //  MOVIMIENTOS: ingresos y gastos puntuales (sueldo, extras, compras...)
        //  Sustituye a "+ Ingreso puntual". Cada movimiento ajusta el
        //  Efectivo automáticamente y queda registrado en el historial.
        // ============================================================

        function openForecastProfileEditor() {
            const fc = financeProfile.forecastProfile || {};
            showModal(`
                <div class="modal-title">Previsión</div>
                <div class="finance-modal-note">Estos datos alimentan la provisión a fin de año que se muestra en Efectivo, Emergencia y Vacaciones.</div>
                <div class="modal-label">Sueldo actual (€/mes)</div>
                <input id="forecast-salary" class="modal-input" type="number" min="0" step="0.01" value="${Number(fc.salary || 0) || ''}" placeholder="0.00">
                <div class="modal-label">Meses de contrato con ese sueldo</div>
                <input id="forecast-contract" class="modal-input" type="number" min="0" step="1" value="${Number(fc.contractMonths || 0) || ''}" placeholder="Ej: 12">
                <div class="modal-label">Ampliación mensual del fondo de emergencia (€)</div>
                <input id="forecast-emergency" class="modal-input" type="number" min="0" step="0.01" value="${Number(fc.emergencyMonthlyPlan || 0) || ''}" placeholder="0.00">
                <div class="modal-label">Ampliación mensual de la reserva de vacaciones (€)</div>
                <input id="forecast-vacation" class="modal-input" type="number" min="0" step="0.01" value="${Number(fc.vacationMonthlyPlan || 0) || ''}" placeholder="0.00">
                <div class="modal-label">Aportación mensual a inversiones a largo plazo (€)</div>
                <input id="forecast-invest" class="modal-input" type="number" min="0" step="0.01" value="${Number(fc.investMonthlyPlan || 0) || ''}" placeholder="0.00">
                <div class="finance-modal-note">Gasto actual en suscripciones/gastos fijos: ${financeMoney(financeRecurringTotal())}/mes (se descuenta solo, no hace falta indicarlo).</div>
                <button class="btn-modal-primary" onclick="saveForecastProfileEditor()">Guardar previsión</button>
            `);
        }

        async function saveForecastProfileEditor() {
            financeProfile.forecastProfile = {
                salary: Math.max(0, Number(document.getElementById('forecast-salary')?.value) || 0),
                contractMonths: Math.max(0, Number(document.getElementById('forecast-contract')?.value) || 0),
                emergencyMonthlyPlan: Math.max(0, Number(document.getElementById('forecast-emergency')?.value) || 0),
                vacationMonthlyPlan: Math.max(0, Number(document.getElementById('forecast-vacation')?.value) || 0),
                investMonthlyPlan: Math.max(0, Number(document.getElementById('forecast-invest')?.value) || 0)
            };
            closeModal();
            await saveFinanceDashboard();
        }

        function renderFinanceMetric(key, targetKey, label, iconSvg, iconClass, note) {
            const value = Number(financeProfile[key] || 0);
            const target = Number(financeProfile[targetKey] || 0);
            const prev = financePreviousSnapshot()?.[key];
            const change = financePctChange(value, prev);
            const goal = financeGoalStatus(value, target);
            const provision = financeYearEndProvision(key);
            const trendCls = change === null ? 'neutral' : change >= 0 ? 'positive' : 'negative';
            const trendText = change === null ? 'Sin mes anterior' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
            return `
                <div class="finance-metric-card finance-metric-card-compact ${goal.cls}" onclick="openFinanceMetricEditor('${key}','${label}','${targetKey}')">
                    <button class="finance-edit-btn" title="Editar" onclick="event.stopPropagation();openFinanceMetricEditor('${key}','${label}','${targetKey}')">✎</button>
                    <div class="finance-metric-compact-head">
                        <div class="finance-metric-icon ${iconClass}" style="width:28px;height:28px;margin:0;flex-shrink:0">${iconSvg}</div>
                        <div class="finance-metric-compact-info">
                            <div class="finance-metric-label">${label}</div>
                            <div class="finance-metric-value">${financeMoney(value)}</div>
                        </div>
                    </div>
                    <div class="finance-progress"><span style="width:${goal.pct === null ? 0 : Math.min(100, goal.pct)}%"></span></div>
                    <div class="finance-metric-compact-foot">
                        <span class="finance-trend-chip ${trendCls}">${trendText}</span>
                        <span>${goal.pct === null ? 'Sin objetivo' : `${goal.pct.toFixed(0)}% obj.`}</span>
                    </div>
                    <div class="finance-metric-note">${provision === null ? 'Provisión: sin datos suficientes' : `Provisión: ${financeMoney(provision)}`}${note ? ` · ${note}` : ''}</div>
                </div>`;
        }

        // ============================================================
        //  METAS DE AHORRO
        // ============================================================
        function openFinanceSavingsGoalModal(id) {
            const goal = id ? (financeProfile.savingsGoals || []).find(g => g.id === id) : null;
            showModal(`
                <div class="modal-title">${goal ? 'Editar meta' : '+ Meta de ahorro'}</div>
                <div class="modal-label">Nombre</div>
                <input id="savings-goal-name" class="modal-input" value="${goal ? escapeHtml(goal.name) : ''}" placeholder="Ej: Viaje a Japón">
                <div class="modal-label">Objetivo (€)</div>
                <input id="savings-goal-target" class="modal-input" type="number" min="0" step="0.01" value="${goal ? goal.target : ''}" placeholder="0.00">
                <div class="modal-label">Ahorrado hasta ahora (€)</div>
                <input id="savings-goal-current" class="modal-input" type="number" min="0" step="0.01" value="${goal ? goal.current : '0'}" placeholder="0.00">
                <button class="btn-modal-primary" onclick="saveFinanceSavingsGoal('${goal ? goal.id : ''}')">${goal ? 'Guardar' : 'Crear meta'}</button>
                ${goal ? `<button class="btn-secondary" style="margin-top:8px" onclick="deleteFinanceSavingsGoal('${goal.id}')">Eliminar meta</button>` : ''}
            `);
            setTimeout(() => document.getElementById('savings-goal-name')?.focus(), 50);
        }

        async function saveFinanceSavingsGoal(id) {
            const name = document.getElementById('savings-goal-name')?.value.trim();
            const target = Number(document.getElementById('savings-goal-target')?.value);
            const current = Number(document.getElementById('savings-goal-current')?.value) || 0;
            if (!name || !(target > 0)) { showToast('Indica nombre y objetivo válidos', true); return; }
            financeProfile.savingsGoals = Array.isArray(financeProfile.savingsGoals) ? financeProfile.savingsGoals : [];
            if (id) {
                const goal = financeProfile.savingsGoals.find(g => g.id === id);
                if (goal) { goal.name = name; goal.target = target; goal.current = current; }
            } else {
                financeProfile.savingsGoals.push({ id: 'goal_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name, target, current });
            }
            closeModal();
            await saveFinanceDashboard();
        }

        async function deleteFinanceSavingsGoal(id) {
            financeProfile.savingsGoals = (financeProfile.savingsGoals || []).filter(g => g.id !== id);
            closeModal();
            await saveFinanceDashboard();
        }

        function renderFinanceSavingsGoals() {
            const goals = financeProfile.savingsGoals || [];
            return `
            <section class="finance-panel" id="finance-savings-section">
                <div class="finance-panel-head">${financePanelHeadIcon(FINANCE_ICON_TARGET, 'fin-pink', 'A largo plazo', 'Metas de ahorro')}<button class="finance-icon-btn" title="Nueva meta" onclick="openFinanceSavingsGoalModal()">+</button></div>
                ${goals.length ? goals.map(g => {
                    const pct = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0;
                    return `
                    <div class="finance-budget-row" onclick="openFinanceSavingsGoalModal('${g.id}')">
                        <div class="finance-budget-row-head">
                            <span>${escapeHtml(g.name)}</span>
                            <span>${financeMoney(g.current)} / ${financeMoney(g.target)}</span>
                        </div>
                        <div class="finance-progress"><span style="width:${pct}%"></span></div>
                    </div>`;
                }).join('') : `<div class="finance-empty-line">Sin metas todavía. Añade una para ahorrar con un objetivo concreto en mente.</div>`}
            </section>`;
        }

        // ============================================================
        //  CUENTAS PROPIAS
        // ============================================================
        function openFinanceAccountsConfig() {
            showModal(`
                <div class="modal-title">Cuentas propias</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Efectivo, Emergencia, Vacaciones e Inversión son fijas. Aquí puedes añadir otras con nombre y saldo libres (p. ej. "Cripto" o "Ahorro coche").</div>
                <div id="finance-custom-accounts-list">${renderFinanceCustomAccountsList()}</div>
                <div class="modal-label" style="margin-top:14px">Nueva cuenta</div>
                <input id="finance-new-account-name" class="modal-input" placeholder="Nombre">
                <input id="finance-new-account-balance" class="modal-input" type="number" step="0.01" placeholder="Saldo inicial (€)">
                <button class="btn-modal-primary" onclick="addFinanceCustomAccount()">+ Añadir cuenta</button>
            `);
        }

        function renderFinanceCustomAccountsList() {
            const accounts = financeProfile.customAccounts || [];
            if (!accounts.length) return `<div class="finance-empty-line">Aún no tienes cuentas propias.</div>`;
            return accounts.map(a => `
                <div class="finance-budget-row" style="display:flex;justify-content:space-between;align-items:center;cursor:default">
                    <span>${escapeHtml(a.name)}</span>
                    <span style="display:flex;gap:8px;align-items:center">
                        <strong style="font-variant-numeric:tabular-nums">${financeMoney(a.balance)}</strong>
                        <button class="btn-secondary" style="width:auto;padding:2px 8px;font-size:11px" onclick="openCustomAccountEditor('${a.id}', true)">✎</button>
                        <button class="btn-secondary" style="width:auto;padding:2px 8px;font-size:11px;color:#dc2626" onclick="deleteFinanceCustomAccount('${a.id}')">✕</button>
                    </span>
                </div>`).join('');
        }

        async function addFinanceCustomAccount() {
            const name = document.getElementById('finance-new-account-name')?.value.trim();
            const balance = Number(document.getElementById('finance-new-account-balance')?.value) || 0;
            if (!name) { showToast('Ponle un nombre a la cuenta', true); return; }
            financeProfile.customAccounts = financeProfile.customAccounts || [];
            financeProfile.customAccounts.push({ id: 'acc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name, balance });
            const list = document.getElementById('finance-custom-accounts-list');
            if (list) list.innerHTML = renderFinanceCustomAccountsList();
            document.getElementById('finance-new-account-name').value = '';
            document.getElementById('finance-new-account-balance').value = '';
            if (currentView === 'finances') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // returnToList: true cuando se abre desde dentro del modal "Cuentas
        // propias" (que se reemplazaría al abrir este modal encima) — así
        // saber si hay que volver a él al guardar, o simplemente cerrar.
        function openCustomAccountEditor(id, returnToList) {
            const acc = (financeProfile.customAccounts || []).find(a => a.id === id);
            if (!acc) return;
            window._customAcctEditorReturnToList = !!returnToList;
            showModal(`
                <div class="modal-title">Editar cuenta</div>
                <div class="modal-label">Nombre</div>
                <input id="edit-acc-name" class="modal-input" value="${escapeHtml(acc.name)}">
                <div class="modal-label">Saldo actual (€)</div>
                <input id="edit-acc-balance" class="modal-input" type="number" step="0.01" value="${Number(acc.balance || 0)}">
                <button class="btn-modal-primary" onclick="saveCustomAccountEditor('${id}')">Guardar</button>
                <button class="btn-secondary" style="margin-top:8px;color:#dc2626" onclick="deleteFinanceCustomAccount('${id}')">Eliminar cuenta</button>
            `);
            setTimeout(() => document.getElementById('edit-acc-name')?.focus(), 50);
        }

        async function saveCustomAccountEditor(id) {
            const acc = (financeProfile.customAccounts || []).find(a => a.id === id);
            if (!acc) return;
            const name = document.getElementById('edit-acc-name')?.value.trim();
            if (!name) { showToast('Ponle un nombre a la cuenta', true); return; }
            acc.name = name;
            acc.balance = Number(document.getElementById('edit-acc-balance')?.value) || 0;
            if (window._customAcctEditorReturnToList) openFinanceAccountsConfig(); else closeModal();
            if (currentView === 'finances') { refreshCurrentMonthSnapshot(); render(); }
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteFinanceCustomAccount(id) {
            if (!confirm('¿Eliminar esta cuenta?')) return;
            financeProfile.customAccounts = (financeProfile.customAccounts || []).filter(a => a.id !== id);
            // Quita también esa cuenta de cualquier línea de la gráfica que la usara.
            financeProfile.chartSeries = (financeProfile.chartSeries || [])
                .map(s => ({ ...s, accountKeys: s.accountKeys.filter(k => k !== id) }))
                .filter(s => s.accountKeys.length);
            const list = document.getElementById('finance-custom-accounts-list');
            if (list) list.innerHTML = renderFinanceCustomAccountsList();
            else if (window._customAcctEditorReturnToList) openFinanceAccountsConfig();
            else closeModal();
            if (currentView === 'finances') { refreshCurrentMonthSnapshot(); render(); }
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // ============================================================
        //  CONFIGURAR LÍNEAS DE LA GRÁFICA
        // ============================================================
        const FINANCE_SERIES_COLORS = ['#111827', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

        // Atajos para las combinaciones de cuentas más habituales, para que
        // no haga falta montar una línea a mano marcando casillas una a una.
        const FINANCE_SERIES_PRESETS = [
            { key: 'ahorro', name: 'Efectivo + Emergencia', accountKeys: ['cash', 'emergency'] },
            { key: 'inversion', name: 'Inversiones', accountKeys: ['invested'] },
            { key: 'patrimonio', name: 'Patrimonio operativo', accountKeys: ['cash', 'emergency', 'invested'] }
        ];

        function openFinanceChartSeriesConfig() {
            window._chartSeriesDraft = JSON.parse(JSON.stringify(getFinanceChartSeries()));
            showModal(`
                <div class="modal-title">Elegir qué se muestra en la gráfica</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Cada línea suma las cuentas que marques — incluidas las que tú mismo has creado.</div>
                <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px">Atajos:</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
                    ${FINANCE_SERIES_PRESETS.map(p => `<button class="finance-oneoff-btn" style="padding:7px 12px" onclick="addFinanceSeriesPreset('${p.key}')">+ ${escapeHtml(p.name)}</button>`).join('')}
                </div>
                <div id="finance-series-draft-list">${renderFinanceSeriesDraftList()}</div>
                <button class="btn-secondary" style="margin-top:10px" onclick="addFinanceSeriesDraft()">+ Nueva línea</button>
                <button class="btn-modal-primary" style="margin-top:14px" onclick="saveFinanceChartSeries()">Guardar</button>
            `);
        }

        function addFinanceSeriesPreset(key) {
            const preset = FINANCE_SERIES_PRESETS.find(p => p.key === key);
            if (!preset) return;
            window._chartSeriesDraft = window._chartSeriesDraft || [];
            if (window._chartSeriesDraft.some(s => s.name === preset.name)) return;
            const color = FINANCE_SERIES_COLORS[window._chartSeriesDraft.length % FINANCE_SERIES_COLORS.length];
            window._chartSeriesDraft.push({ id: 'serie_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5), name: preset.name, accountKeys: [...preset.accountKeys], color });
            const list = document.getElementById('finance-series-draft-list');
            if (list) list.innerHTML = renderFinanceSeriesDraftList();
        }

        function renderFinanceSeriesDraftList() {
            const accounts = getAllAccounts();
            const draft = window._chartSeriesDraft || [];
            if (!draft.length) return `<div class="finance-empty-line">Sin líneas propias — se usarán las dos de siempre.</div>`;
            return draft.map((s, i) => `
                <div class="finance-budget-row" style="cursor:default">
                    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
                        <input class="modal-input" style="margin:0" value="${escapeHtml(s.name)}" oninput="window._chartSeriesDraft[${i}].name=this.value">
                        <button class="btn-secondary" style="width:auto;padding:2px 8px" onclick="removeFinanceSeriesDraft(${i})">✕</button>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:6px">
                        ${accounts.map(a => `
                            <label class="recurring-weekday-chip">
                                <input type="checkbox" ${s.accountKeys.includes(a.key) ? 'checked' : ''} onchange="toggleFinanceSeriesDraftAccount(${i},'${a.key}',this.checked)">
                                ${escapeHtml(a.label)}
                            </label>`).join('')}
                    </div>
                </div>`).join('');
        }

        function addFinanceSeriesDraft() {
            window._chartSeriesDraft = window._chartSeriesDraft || [];
            const color = FINANCE_SERIES_COLORS[window._chartSeriesDraft.length % FINANCE_SERIES_COLORS.length];
            window._chartSeriesDraft.push({ id: 'serie_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5), name: 'Nueva línea', accountKeys: [], color });
            const list = document.getElementById('finance-series-draft-list');
            if (list) list.innerHTML = renderFinanceSeriesDraftList();
        }

        function removeFinanceSeriesDraft(i) {
            window._chartSeriesDraft.splice(i, 1);
            const list = document.getElementById('finance-series-draft-list');
            if (list) list.innerHTML = renderFinanceSeriesDraftList();
        }

        function toggleFinanceSeriesDraftAccount(i, key, checked) {
            const s = window._chartSeriesDraft[i];
            if (checked) { if (!s.accountKeys.includes(key)) s.accountKeys.push(key); }
            else s.accountKeys = s.accountKeys.filter(k => k !== key);
        }

        async function saveFinanceChartSeries() {
            financeProfile.chartSeries = (window._chartSeriesDraft || []).filter(s => s.accountKeys.length && s.name.trim());
            window._chartSeriesDraft = null;
            closeModal();
            if (currentView === 'finances') render();
            try { await saveData(); showToast('Gráfica actualizada'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // ============================================================
        //  ACTUALIZACIÓN MENSUAL GUIADA
        // ============================================================
        function financeMonthUpdatePending() {
            return financeProfile.ultimoCierreMensual !== financeMonthKey();
        }


        function openMonthlyFinanceUpdate() {
            const monthKey = financeMonthKey();
            const fc = financeProfile.forecastProfile || {};
            const forecast = Number(financeProfile.salaryForecast?.[monthKey] || fc.salary || 0);
            const existingSalary = financeProfile.salaryReal?.[monthKey];
            window._financeUpdateBefore = financeCorePatrimony();

            showModal(`
                <div class="modal-title">Actualizar ${escapeHtml(financeMonthLabel(monthKey))}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px">Rellena solo lo que sepas ahora mismo — no hace falta que sea exacto ni completo.</div>

                <div class="modal-label">Sueldo recibido este mes${forecast > 0 ? ` (previsto: ${financeMoney(forecast)})` : ''}</div>
                <input id="mfu-salario" class="modal-input" type="number" step="0.01" placeholder="0.00" value="${existingSalary !== undefined ? existingSalary : (forecast || '')}">

                <div class="modal-label" style="margin-top:14px">Saldos actuales</div>
                <div class="modal-row">
                    <div><div style="font-size:11px;color:var(--text-secondary)">Efectivo</div><input id="mfu-cash" class="modal-input" type="number" step="0.01" value="${financeProfile.cash || 0}"></div>
                    <div><div style="font-size:11px;color:var(--text-secondary)">Emergencia</div><input id="mfu-emergency" class="modal-input" type="number" step="0.01" value="${financeProfile.emergency || 0}"></div>
                </div>
                <div class="modal-label" style="margin-top:8px">Vacaciones</div>
                <input id="mfu-vacation" class="modal-input" type="number" step="0.01" value="${financeProfile.vacation || 0}">

                <button class="btn-modal-primary" style="margin-top:16px" onclick="saveMonthlyFinanceUpdate('${monthKey}')">Guardar actualización</button>
            `);
        }

        async function saveMonthlyFinanceUpdate(monthKey) {
            const salario = Number(document.getElementById('mfu-salario')?.value);
            const cash = Number(document.getElementById('mfu-cash')?.value);
            const emergency = Number(document.getElementById('mfu-emergency')?.value);
            const vacation = Number(document.getElementById('mfu-vacation')?.value);
            const before = window._financeUpdateBefore ?? financeCorePatrimony();

            // El sueldo real de cada mes se guarda aparte de la previsión,
            // para poder comparar "lo previsto" con "lo que de verdad cobré"
            // sin que uno pise al otro.
            if (salario > 0) {
                financeProfile.salaryReal = financeProfile.salaryReal || {};
                financeProfile.salaryReal[monthKey] = salario;
            }

            if (Number.isFinite(cash)) financeProfile.cash = Math.max(0, cash);
            if (Number.isFinite(emergency)) financeProfile.emergency = Math.max(0, emergency);
            if (Number.isFinite(vacation)) financeProfile.vacation = Math.max(0, vacation);

            // El cierre mensual sustituye el snapshot automático de este mes
            // por uno fiel a lo que el usuario acaba de confirmar.
            const snap = financeSnapshot();
            financeProfile.history = Array.isArray(financeProfile.history) ? financeProfile.history : [];
            const idx = financeProfile.history.findIndex(h => h.month === monthKey);
            if (idx >= 0) financeProfile.history[idx] = snap; else financeProfile.history.push(snap);
            financeProfile.history.sort((a, b) => String(a.month).localeCompare(String(b.month)));

            financeProfile.ultimoCierreMensual = monthKey;
            const after = financeCorePatrimony();

            closeModal();
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }

            const delta = after - before;
            showModal(`
                <div class="modal-title">Actualización guardada</div>
                <div style="text-align:center;padding:12px 0">
                    <div style="font-size:12px;color:var(--text-secondary)">Patrimonio operativo</div>
                    <div style="font-size:24px;font-weight:700;margin:8px 0">${financeMoney(before)} → ${financeMoney(after)}</div>
                    <div style="font-size:15px;font-weight:600;color:${delta >= 0 ? '#10b981' : '#dc2626'}">${delta >= 0 ? '+' : ''}${financeMoney(delta)} este mes</div>
                </div>
                <button class="btn-modal-primary" onclick="closeModal()">Aceptar</button>
            `);
        }

        // Tarjeta simple para cuentas sin objetivo/previsión propios (cuentas
        // propias, gastos recurrentes, coleccionables) — mismo estilo visual
        // que renderFinanceMetric para que toda la fila de Cuentas sea coherente.
        function renderFinanceSimpleTile(value, label, onClick, note, muted, iconSvg, iconClass) {
            return `
                <div class="finance-metric-card finance-metric-card-compact finance-metric-card-simple ${muted ? 'finance-metric-card-muted' : ''}" ${onClick ? `onclick="${onClick}"` : ''}>
                    <div class="finance-metric-compact-head">
                        ${iconSvg ? `<div class="finance-metric-icon ${iconClass || ''}" style="width:14px;height:14px;margin:0;flex-shrink:0;padding:4px">${iconSvg}</div>` : ''}
                        <div class="finance-metric-compact-info">
                            <div class="finance-metric-label">${escapeHtml(label)}</div>
                            <div class="finance-metric-value">${financeMoney(value)}</div>
                        </div>
                    </div>
                    ${note ? `<div class="finance-metric-note">${escapeHtml(note)}</div>` : ''}
                </div>`;
        }

        // ============================================================
        //  INVERSIÓN A LARGO PLAZO: aportaciones vs. valor actual
        // ============================================================
        // ============================================================
        //  LARGO PLAZO: varias cuentas de inversión + planificación del
        //  sueldo mensual, todo dentro de un único popup ("largo plazo.").
        //  Sustituye al antiguo modelo de un solo valor (financeProfile.
        //  invested como número suelto); ahora es la suma de las cuentas
        //  registradas — migrateToInvestmentAccounts() trae los datos
        //  antiguos como la primera cuenta la primera vez que se carga.
        // ============================================================
        function investmentAccountInvested(acc) {
            return (acc.contributions || []).reduce((s, c) => s + Number(c.amount || 0), 0);
        }
        function investmentAccountValue(acc) {
            const withValue = (acc.contributions || []).filter(c => c.value !== undefined && c.value !== null && c.value !== '');
            if (!withValue.length) return 0;
            withValue.sort((a, b) => a.month.localeCompare(b.month));
            return Number(withValue[withValue.length - 1].value) || 0;
        }
        // financeProfile.invested sigue siendo la cifra que usan el resto de
        // cálculos de patrimonio (financeCorePatrimony, historial...) — se
        // recalcula aquí después de cualquier cambio en las cuentas, en vez
        // de tocar los ~15 sitios que ya la leen.
        function syncInvestedTotal() {
            financeProfile.invested = (financeProfile.investmentAccounts || []).reduce((s, a) => s + investmentAccountValue(a), 0);
        }
        function migrateToInvestmentAccounts() {
            if (Array.isArray(financeProfile.investmentAccounts)) return;
            const oldContribs = Array.isArray(financeProfile.investmentContributions) ? financeProfile.investmentContributions : [];
            const hasOldData = oldContribs.length > 0 || Number(financeProfile.invested) > 0;
            if (!hasOldData) { financeProfile.investmentAccounts = []; return; }
            const contributions = oldContribs.map(c => ({ month: c.month, amount: Number(c.amount) || 0 }));
            const currentMonth = financeMonthKey();
            const currentEntry = contributions.find(c => c.month === currentMonth);
            if (currentEntry) currentEntry.value = Number(financeProfile.invested || 0);
            else contributions.push({ month: currentMonth, amount: 0, value: Number(financeProfile.invested || 0) });
            financeProfile.investmentAccounts = [{
                id: 'inv_' + Date.now(),
                name: (financeProfile.investedNote || '').split(',')[0].trim().slice(0, 40) || 'Mi inversión',
                notes: financeProfile.investedNote || '',
                contributions
            }];
            syncInvestedTotal();
        }

        function financeInvestmentStats() {
            const accounts = financeProfile.investmentAccounts || [];
            const totalAportado = accounts.reduce((s, a) => s + investmentAccountInvested(a), 0);
            const valorActual = accounts.reduce((s, a) => s + investmentAccountValue(a), 0);
            const gain = valorActual - totalAportado;
            const gainPct = totalAportado > 0 ? (gain / totalAportado) * 100 : null;
            const months = new Set();
            accounts.forEach(a => (a.contributions || []).forEach(c => months.add(c.month)));
            return { meses: months.size, totalAportado, valorActual, gain, gainPct, cuentas: accounts.length };
        }

        function renderInvestmentPanel() {
            const stats = financeInvestmentStats();

            if (!stats.cuentas) {
                return `
                <section class="finance-panel" id="finance-investment-section">
                    <div class="finance-panel-head">${financePanelHeadIcon(FINANCE_ICON_TREND, 'fin-purple', 'Largo plazo', 'Inversión')}</div>
                    <div class="finance-empty-line" style="text-align:center;margin-top:4px">Planifica tu sueldo mensual y lleva el seguimiento de tus cuentas de inversión — fondos, ETFs, cuentas remuneradas...</div>
                    <button class="finance-oneoff-btn" style="margin-top:12px" onclick="openLongTermModal()">largo plazo.</button>
                </section>`;
            }

            const gainCls = stats.gain > 0 ? 'positive' : stats.gain < 0 ? 'negative' : 'neutral';
            // Tarjeta-lanzadera: sin barras ni desglose, un vistazo y un
            // clic directo al popup — el detalle vive ahí, no aquí.
            return `
            <section class="finance-panel finance-panel-clickable" id="finance-investment-section" onclick="openLongTermModal()">
                <div class="finance-panel-head">${financePanelHeadIcon(FINANCE_ICON_TREND, 'fin-purple', 'Largo plazo', 'Inversión')}</div>
                <div class="finance-invest-simple-value">${financeMoney(stats.valorActual)}</div>
                <div class="finance-empty-line" style="margin-top:4px">${stats.cuentas} cuenta${stats.cuentas === 1 ? '' : 's'} · <span class="${gainCls === 'positive' ? 'finance-positive' : gainCls === 'negative' ? 'finance-negative' : ''}">${stats.gain >= 0 ? '+' : ''}${financeMoney(stats.gain)}</span></div>
            </section>`;
        }

        // ---- Popup "largo plazo." ----
        function ensureLongTermData() {
            if (!Array.isArray(financeProfile.budgetHistory)) financeProfile.budgetHistory = [];
            if (!financeProfile.budgetPlans || typeof financeProfile.budgetPlans !== 'object') {
                // Migración desde el modelo antiguo (un único borrador sin
                // mes asociado) al nuevo, indexado por mes.
                financeProfile.budgetPlans = {};
                const old = financeProfile.budgetPlanning;
                if (old && typeof old === 'object' && (old.salary || (Array.isArray(old.allocations) && old.allocations.length))) {
                    financeProfile.budgetPlans[financeMonthKey()] = { salary: Number(old.salary) || 0, allocations: Array.isArray(old.allocations) ? old.allocations : [] };
                }
            }
            if (!Array.isArray(financeProfile.investmentAccounts)) migrateToInvestmentAccounts();
            if (!Array.isArray(financeProfile.wishlist)) financeProfile.wishlist = [];
        }

        // Suma de lo sobrante (sueldo sin asignar) de todos los meses ya
        // grabados/cerrados — el criterio de la wishlist compara cada
        // precio contra este colchón acumulado "a mes vencido", nunca
        // contra el mes en curso (que puede seguir cambiando).
        function wishlistAvailableSavings() {
            const hist = financeProfile.budgetHistory || [];
            const total = hist.reduce((sum, h) => sum + (Number(h.saved) || 0), 0);
            return Math.max(0, total);
        }

        function getBudgetPlanForMonth(month) {
            if (!financeProfile.budgetPlans[month] || typeof financeProfile.budgetPlans[month] !== 'object') {
                financeProfile.budgetPlans[month] = { salary: 0, contributions: 0, allocations: [] };
            }
            if (!Array.isArray(financeProfile.budgetPlans[month].allocations)) financeProfile.budgetPlans[month].allocations = [];
            if (!Number.isFinite(financeProfile.budgetPlans[month].contributions)) financeProfile.budgetPlans[month].contributions = 0;
            asegurarCasillasAutomaticas(financeProfile.budgetPlans[month]);
            return financeProfile.budgetPlans[month];
        }

        // Suscripciones y gastos fijos entran solos en el presupuesto de cada
        // mes como dos casillas al final, con el importe ya sumado. Si el
        // usuario quita una, ese mes no vuelve (autoQuitadas); si todavía no
        // tenía ninguna suscripción, aparece en cuanto la tenga. Mientras
        // el usuario no toque el importe
        // (limiteManual) sigue la suma actual; al editarlo pasa a ser su
        // límite. "Gastado" son los cargos de ese mes vinculados a esas
        // suscripciones o gastos fijos (recurringEntryId), automáticos o ya
        // conciliados con el extracto.
        const BUDGET_CASILLAS_AUTO = { subscription: 'suscripciones', fixed_expense: 'gastos fijos' };

        function budgetAutoResumen(tipo) {
            const activos = entries.filter(e => e.type === tipo && e.active !== false);
            return { total: Math.round(activos.reduce((s, e) => s + (Number(e.amount) || 0), 0) * 100) / 100, n: activos.length };
        }

        function budgetAutoGastado(tipo, month) {
            const ids = new Set(entries.filter(e => e.type === tipo).map(e => e.id));
            return (financePro.transactions || [])
                .filter(t => t.type === 'expense' && financeProCicloMes(t) === month && ids.has(t.recurringEntryId))
                .reduce((s, t) => Math.round((s + (Number(t.amount) || 0)) * 100) / 100, 0);
        }

        // banco: el extracto ya lo confirma · anotado: cargo automático que
        // el extracto todavía no ha confirmado · falta: pasó el día de cargo
        // (con 3 de margen) y no hay nada · pronto: aún no toca.
        function recurrenteEstadoMes(e, month) {
            const txs = (financePro.transactions || []).filter(t => t.recurringEntryId === e.id && financeProCicloMes(t) === month);
            if (txs.some(t => !financeProEsAuto(t))) return 'banco';
            const [y, m] = month.split('-').map(Number);
            const dia = Math.min(Number(e.renewalDay) || 1, new Date(y, m, 0).getDate());
            const limite = new Date(y, m - 1, dia + 3);
            if (txs.length) return new Date() >= limite ? 'falta' : 'anotado';
            return new Date() >= limite ? 'falta' : 'pronto';
        }

        function asegurarCasillasAutomaticas(plan) {
            Object.keys(BUDGET_CASILLAS_AUTO).forEach(tipo => {
                if (plan.autoQuitadas?.[tipo] || plan.allocations.some(a => a.auto === tipo)) return;
                const r = budgetAutoResumen(tipo);
                if (!r.n) return;
                plan.allocations.push({ id: 'ba_auto_' + tipo + '_' + Date.now(), label: BUDGET_CASILLAS_AUTO[tipo], amount: r.total, categoryId: '', auto: tipo });
            });
            plan.allocations.forEach(a => { if (a.auto && !a.limiteManual) a.amount = budgetAutoResumen(a.auto).total; });
        }

        // Mes que se está viendo/editando en el popup — vuelve al actual
        // cada vez que se abre, se mueve con las flechas del navegador.
        let longtermViewMonth = null;

        function longtermMonthOffset(month, delta) {
            const [y, m] = month.split('-').map(Number);
            return financeMonthKey(new Date(y, m - 1 + delta, 1));
        }

        function setLongtermViewMonth(month) {
            longtermViewMonth = month;
            const el = document.getElementById('longterm-planning-section');
            if (el) el.outerHTML = renderBudgetPlanningSection();
        }

        function renderLongTermMonthNav(month) {
            return `<div class="longterm-month-nav">
                <button class="lt-nav-btn" onclick="setLongtermViewMonth('${longtermMonthOffset(month, -1)}')" title="Mes anterior">‹</button>
                <div class="longterm-month-nav-label">${escapeHtml(financeMonthLabel(month))}</div>
                <button class="lt-nav-btn" onclick="setLongtermViewMonth('${longtermMonthOffset(month, 1)}')" title="Mes siguiente">›</button>
            </div>`;
        }

        function openLongTermModal() {
            ensureLongTermData();
            longtermViewMonth = financeMonthKey();
            showModal(renderLongTermModalBody());
        }

        // Fila de 12 puntos (uno por mes del año) — relleno = mes con
        // alguna aportación de inversión registrada, en color de acento =
        // mes actual, vacío = todavía sin nada. Lectura del año de un
        // vistazo, como la tarjeta-heatmap de la referencia visual.
        function renderLongTermYearDots() {
            const year = new Date().getFullYear();
            const currentMonth = new Date().getMonth();
            const monthsWithData = new Set();
            (financeProfile.investmentAccounts || []).forEach(acc => (acc.contributions || []).forEach(c => { if (String(c.month).startsWith(String(year))) monthsWithData.add(c.month); }));
            const dots = Array.from({ length: 12 }, (_, i) => {
                const mk = `${year}-${String(i + 1).padStart(2, '0')}`;
                const isCurrent = i === currentMonth;
                const hasData = monthsWithData.has(mk);
                const cls = isCurrent ? 'lt-dot-today' : hasData ? 'lt-dot-filled' : '';
                return `<span class="lt-dot ${cls}" title="${escapeHtml(financeMonthLabel(mk))}"></span>`;
            }).join('');
            return `<div class="lt-dots-row">${dots}</div>`;
        }

        function renderLongTermModalBody() {
            const stats = financeInvestmentStats();
            const month = longtermViewMonth || financeMonthKey();
            const { income, assigned } = budgetPlanningRemaining();
            const pctAssigned = income > 0 ? Math.min(100, Math.round((assigned / income) * 100)) : 0;
            return `
            <div class="longterm-modal">
                <div class="longterm-modal-head">
                    <div class="longterm-modal-title">largo plazo.</div>
                    <div class="longterm-modal-head-actions">
                        <button class="lt-icon-circle" title="Nueva cuenta de inversión" onclick="openAddInvestmentAccountModal()">+</button>
                        <button class="lt-icon-circle" title="Cerrar" onclick="closeModal()">✕</button>
                    </div>
                </div>

                <div class="longterm-grid">
                    <div class="lt-card lt-card-ring">
                        <div class="lt-ring" style="--pct:${pctAssigned}"><div class="lt-ring-value">${pctAssigned}%</div></div>
                        <div class="lt-card-title">Sueldo asignado</div>
                        <div class="lt-card-sub">${escapeHtml(financeMonthLabel(month))}</div>
                    </div>
                    <div class="lt-card lt-card-number">
                        <div class="lt-card-number-value">${financeMoney(stats.valorActual)}</div>
                        <div class="lt-card-title">carteras de inversiones a largo.</div>
                        <div class="lt-card-sub">${stats.cuentas} cuenta${stats.cuentas === 1 ? '' : 's'}</div>
                    </div>
                </div>

                <div class="lt-card lt-card-heatmap">
                    <div class="lt-card-title" style="margin-bottom:10px">meses con seguimiento.</div>
                    ${renderLongTermYearDots()}
                </div>

                <div id="longterm-planning-section">${renderBudgetPlanningSection()}</div>

                <div class="lt-card">
                    <div class="longterm-section-head">
                        <div class="longterm-section-title">cuentas de inversión.</div>
                    </div>
                    <div id="longterm-accounts-list">
                        ${stats.cuentas ? (financeProfile.investmentAccounts || []).map(a => renderInvestmentAccountRow(a)).join('') : '<div class="finance-empty-line" style="margin:8px 0">Todavía no tienes ninguna cuenta.</div>'}
                    </div>
                    <button class="finance-oneoff-btn" style="margin-top:8px" onclick="openAddInvestmentAccountModal()">+ Nueva cuenta</button>
                </div>

                ${stats.totalAportado ? `
                <div class="lt-strip">
                    <div>
                        <div class="lt-strip-label">aportado en total.</div>
                        <div class="lt-strip-value">${financeMoney(stats.totalAportado)}</div>
                    </div>
                    <span class="lt-strip-icon">${FINANCE_ICON_TREND}</span>
                </div>` : ''}

                ${renderWishlistSection()}
            </div>`;
        }

        // -- Whishlist --
        // Marca cada deseo como ya alcanzable (✓) o todavía no (✕)
        // comparando su precio contra el colchón de sueldo sin asignar
        // acumulado en los meses ya cerrados (wishlistAvailableSavings) —
        // nunca contra el mes en curso, que aún puede cambiar.
        function renderWishlistSection() {
            ensureLongTermData();
            const available = wishlistAvailableSavings();
            const items = financeProfile.wishlist || [];
            return `
            <div class="lt-card">
                <div class="longterm-section-head">
                    <div class="longterm-section-title">whishlist.</div>
                    <div class="wishlist-available" title="Sueldo sin asignar acumulado en los meses ya cerrados">${financeMoney(available)} disponibles</div>
                </div>
                <div id="wishlist-list">
                    ${items.length ? items.map(it => renderWishlistRow(it, available)).join('') : '<div class="finance-empty-line" style="margin:8px 0">Todavía no has añadido nada — apunta aquí lo que te gustaría comprarte más adelante.</div>'}
                </div>
                <button class="finance-oneoff-btn" style="margin-top:8px" onclick="addWishlistItem()">+ Añadir deseo</button>
            </div>`;
        }

        function renderWishlistRow(item, available) {
            const price = Number(item.price) || 0;
            const affordable = price > 0 && available >= price;
            return `
            <div class="wishlist-row">
                <input class="modal-input wishlist-label" value="${escapeHtml(item.title || '')}" placeholder="Ej. Auriculares, viaje, videoconsola..." oninput="updateWishlistItem('${item.id}','title',this.value,false)" onchange="updateWishlistItem('${item.id}','title',this.value,true)">
                <input class="modal-input wishlist-price" type="number" min="0" step="0.01" value="${item.price || ''}" placeholder="0.00" oninput="updateWishlistItem('${item.id}','price',this.value,false)" onchange="updateWishlistItem('${item.id}','price',this.value,true)">
                <span id="wishlist-badge-${item.id}" class="wishlist-badge ${affordable ? 'wishlist-badge-yes' : 'wishlist-badge-no'}" title="${affordable ? 'Ya es buen momento para comprarlo' : 'Todavía no es buen momento'}">${affordable ? '✓' : '✕'}</span>
                <button class="doc-action-delete-btn" title="Eliminar" onclick="removeWishlistItem('${item.id}')">✕</button>
            </div>`;
        }

        function refreshWishlistBadge(id) {
            const badge = document.getElementById('wishlist-badge-' + id);
            if (!badge) return;
            const it = (financeProfile.wishlist || []).find(x => x.id === id);
            if (!it) return;
            const price = Number(it.price) || 0;
            const affordable = price > 0 && wishlistAvailableSavings() >= price;
            badge.className = 'wishlist-badge ' + (affordable ? 'wishlist-badge-yes' : 'wishlist-badge-no');
            badge.title = affordable ? 'Ya es buen momento para comprarlo' : 'Todavía no es buen momento';
            badge.textContent = affordable ? '✓' : '✕';
        }

        function renderWishlistList() {
            const available = wishlistAvailableSavings();
            const items = financeProfile.wishlist || [];
            return items.length ? items.map(it => renderWishlistRow(it, available)).join('') : '<div class="finance-empty-line" style="margin:8px 0">Todavía no has añadido nada — apunta aquí lo que te gustaría comprarte más adelante.</div>';
        }

        function addWishlistItem() {
            ensureLongTermData();
            financeProfile.wishlist.push({ id: 'wl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), title: '', price: 0 });
            const el = document.getElementById('wishlist-list');
            if (el) el.innerHTML = renderWishlistList();
        }

        async function updateWishlistItem(id, field, value, persist) {
            const items = financeProfile.wishlist || [];
            const it = items.find(x => x.id === id);
            if (!it) return;
            it[field] = field === 'price' ? Math.max(0, Number(value) || 0) : value;
            if (field === 'price') refreshWishlistBadge(id);
            if (persist) { try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); } }
        }

        async function removeWishlistItem(id) {
            financeProfile.wishlist = (financeProfile.wishlist || []).filter(it => it.id !== id);
            const el = document.getElementById('wishlist-list');
            if (el) el.innerHTML = renderWishlistList();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // -- Planificación del sueldo --
        function budgetPlanningRemaining() {
            ensureLongTermData();
            const plan = getBudgetPlanForMonth(longtermViewMonth || financeMonthKey());
            const salary = Number(plan.salary) || 0;
            const contributions = Number(plan.contributions) || 0;
            const income = salary + contributions;
            const assigned = plan.allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
            return { salary, contributions, income, assigned, remaining: income - assigned };
        }

        function renderBudgetPlanningSection() {
            ensureLongTermData();
            const month = longtermViewMonth || financeMonthKey();
            const recorded = (financeProfile.budgetHistory || []).find(h => h.month === month);

            if (recorded) {
                return `
                <div class="lt-card" id="longterm-planning-section">
                    <div class="longterm-section-head">
                        <div class="longterm-section-title">planificación del sueldo.</div>
                        <button class="finance-icon-btn" title="Editar este mes" onclick="editBudgetHistoryMonth('${month}')">✎</button>
                    </div>
                    ${renderLongTermMonthNav(month)}
                    <div class="finance-empty-line" style="margin:10px 0">Mes ya grabado — esto es lo que previste entonces frente a lo que pasó de verdad.</div>
                    ${renderBudgetHistoryMonthTable(recorded)}
                </div>`;
            }

            const plan = getBudgetPlanForMonth(month);
            return `
            <div class="lt-card" id="longterm-planning-section">
                <div class="longterm-section-head">
                    <div class="longterm-section-title">planificación del sueldo.</div>
                    <button class="finance-icon-btn" title="Heredar la previsión del mes anterior" onclick="inheritPreviousMonthPlan()">↺</button>
                </div>
                ${renderLongTermMonthNav(month)}
                <div class="modal-label">sueldo esperado o recibido:</div>
                <input id="budget-salary-input" class="modal-input" type="number" min="0" step="0.01" value="${plan.salary || ''}" placeholder="0.00" oninput="updateBudgetSalary(this.value,false)" onchange="updateBudgetSalary(this.value,true)">
                <div class="modal-label">aportaciones:</div>
                <input id="budget-contributions-input" class="modal-input" type="number" min="0" step="0.01" value="${plan.contributions || ''}" placeholder="0.00" oninput="updateBudgetContributions(this.value,false)" onchange="updateBudgetContributions(this.value,true)">
                <div id="budget-allocations-list">${renderBudgetAllocationsList()}</div>
                <button class="finance-oneoff-btn" style="margin-top:8px" onclick="addBudgetAllocation()">+ Añadir casilla</button>
                <div id="budget-remaining-bar">${renderBudgetRemainingBar()}</div>
                <button class="longterm-cta" onclick="recordBudgetMonth()">grabar datos.</button>
            </div>`;
        }

        function renderBudgetAllocationsList() {
            ensureLongTermData();
            const plan = getBudgetPlanForMonth(longtermViewMonth || financeMonthKey());
            const cats = (financePro.categories || []).filter(c => c.type === 'expense');
            if (!plan.allocations.length) return '<div class="finance-empty-line" style="margin:8px 0">Sin casillas todavía — añade una por cada sitio al que quieras llevar el sueldo (alquiler, ahorro, ocio...).</div>';
            return `
                <div class="budget-alloc-row budget-alloc-row-head">
                    <span>Casilla</span><span>Previsto</span><span>Categoría</span><span>Gastado</span><span></span>
                </div>
                ${[...plan.allocations.filter(a => !a.auto), ...plan.allocations.filter(a => a.auto)].map(a => renderBudgetAllocationRow(a, cats)).join('')}`;
        }

        function renderBudgetAllocationRow(a, cats) {
            const month = longtermViewMonth || financeMonthKey();
            if (a.auto) {
                const r = budgetAutoResumen(a.auto);
                const gastado = budgetAutoGastado(a.auto, month);
                const nombre = a.auto === 'subscription' ? (r.n === 1 ? 'suscripción' : 'suscripciones') : (r.n === 1 ? 'gasto fijo' : 'gastos fijos');
                return `
            <div class="budget-alloc-row budget-alloc-row-auto">
                <div class="budget-alloc-auto-label"><span>${escapeHtml(a.label)}.</span><small>${r.n} ${nombre} · ${financeMoney(r.total)}</small></div>
                <input class="modal-input budget-alloc-amount" type="number" min="0" step="0.01" value="${a.amount || ''}" placeholder="0.00" title="Límite de presupuesto" oninput="updateBudgetAllocation('${a.id}','amount',this.value,false)" onchange="updateBudgetAllocation('${a.id}','amount',this.value,true)">
                <div class="budget-alloc-auto-tag">automático.</div>
                <div class="budget-alloc-spent${Number(a.amount) > 0 && gastado > Number(a.amount) ? ' over' : ''}">${financeMoney(gastado)}</div>
                <button class="doc-action-delete-btn" title="Quitar de este mes" onclick="removeBudgetAllocation('${a.id}')">✕</button>
            </div>`;
            }
            // Gasto real hasta ahora este mes en la categoría vinculada —
            // para poder ajustar el importe previsto sobre la marcha en
            // vez de descubrir la desviación al grabar el mes.
            const pres = a.categoryId ? financeProPresupuestoConDevoluciones(a.categoryId, month, a.amount) : null;
            const spent = pres ? pres.gastado : null;
            const over = pres && Number(a.amount) > 0 && pres.gastado > pres.limite;
            return `
            <div class="budget-alloc-row">
                <input class="modal-input budget-alloc-label" value="${escapeHtml(a.label || '')}" placeholder="Ej. Alquiler, Ahorro..." oninput="updateBudgetAllocation('${a.id}','label',this.value,false)" onchange="updateBudgetAllocation('${a.id}','label',this.value,true)">
                <input class="modal-input budget-alloc-amount" type="number" min="0" step="0.01" value="${a.amount || ''}" placeholder="0.00" oninput="updateBudgetAllocation('${a.id}','amount',this.value,false)" onchange="updateBudgetAllocation('${a.id}','amount',this.value,true)">
                <select class="modal-input budget-alloc-cat" onchange="updateBudgetAllocation('${a.id}','categoryId',this.value,true)">
                    <option value="">Sin vincular</option>
                    ${cats.map(c => `<option value="${c.id}" ${a.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                </select>
                <div class="budget-alloc-spent${over ? ' over' : ''}">${spent != null ? financeMoney(spent) : '—'}${pres?.devuelto > 0 ? `<small title="Lo devuelto este mes amplía lo que puedes gastar en esta casilla">+${financeMoney(pres.devuelto)} devuelto.</small>` : ''}</div>
                <button class="doc-action-delete-btn" title="Eliminar" onclick="removeBudgetAllocation('${a.id}')">✕</button>
            </div>`;
        }

        function renderBudgetRemainingBar() {
            const { income, assigned, remaining } = budgetPlanningRemaining();
            return `<div class="longterm-remaining-bar ${remaining < 0 ? 'over' : ''}">
                <span>Ingresos <strong>${financeMoney(income)}</strong></span>
                <span>Asignado <strong>${financeMoney(assigned)}</strong></span>
                <span class="longterm-remaining-highlight">Sin asignar <strong>${financeMoney(remaining)}</strong></span>
            </div>`;
        }

        function refreshBudgetRemainingBar() {
            const el = document.getElementById('budget-remaining-bar');
            if (el) el.innerHTML = renderBudgetRemainingBar();
        }

        async function updateBudgetSalary(value, persist) {
            const plan = getBudgetPlanForMonth(longtermViewMonth || financeMonthKey());
            plan.salary = Math.max(0, Number(value) || 0);
            refreshBudgetRemainingBar();
            if (persist) { try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); } }
        }

        // Ingresos variables (regalos, ayudas puntuales...) que también hay
        // que presupuestar cada mes, aparte del sueldo — se suman al mismo
        // total repartible entre casillas (ver budgetPlanningRemaining).
        async function updateBudgetContributions(value, persist) {
            const plan = getBudgetPlanForMonth(longtermViewMonth || financeMonthKey());
            plan.contributions = Math.max(0, Number(value) || 0);
            refreshBudgetRemainingBar();
            if (persist) { try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); } }
        }

        async function updateBudgetAllocation(id, field, value, persist) {
            const plan = getBudgetPlanForMonth(longtermViewMonth || financeMonthKey());
            const a = plan.allocations.find(x => x.id === id);
            if (!a) return;
            a[field] = field === 'amount' ? Math.max(0, Number(value) || 0) : value;
            if (field === 'amount' && a.auto) a.limiteManual = true;
            if (field === 'amount') refreshBudgetRemainingBar();
            if (field === 'categoryId') {
                // La columna "Gastado" depende de la categoría vinculada —
                // hay que recalcularla, no basta con la barra de restante.
                const listEl = document.getElementById('budget-allocations-list');
                if (listEl) listEl.innerHTML = renderBudgetAllocationsList();
            }
            if (persist) { try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); } }
        }

        function addBudgetAllocation() {
            const plan = getBudgetPlanForMonth(longtermViewMonth || financeMonthKey());
            plan.allocations.push({ id: 'ba_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), label: '', amount: 0, categoryId: '' });
            const listEl = document.getElementById('budget-allocations-list');
            if (listEl) listEl.innerHTML = renderBudgetAllocationsList();
            refreshBudgetRemainingBar();
        }

        async function removeBudgetAllocation(id) {
            const plan = getBudgetPlanForMonth(longtermViewMonth || financeMonthKey());
            const quitada = plan.allocations.find(a => a.id === id);
            if (quitada?.auto) plan.autoQuitadas = { ...(plan.autoQuitadas || {}), [quitada.auto]: true };
            plan.allocations = plan.allocations.filter(a => a.id !== id);
            const listEl = document.getElementById('budget-allocations-list');
            if (listEl) listEl.innerHTML = renderBudgetAllocationsList();
            refreshBudgetRemainingBar();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // Copia la previsión (sueldo + casillas) del mes INMEDIATAMENTE
        // anterior al que se está viendo — ya sea un mes grabado en el
        // historial o un borrador todavía sin grabar — sobre el mes actual.
        async function inheritPreviousMonthPlan() {
            const month = longtermViewMonth || financeMonthKey();
            const prevMonth = longtermMonthOffset(month, -1);
            const fromHistory = (financeProfile.budgetHistory || []).find(h => h.month === prevMonth);
            const fromPlan = financeProfile.budgetPlans ? financeProfile.budgetPlans[prevMonth] : null;
            const source = fromHistory || fromPlan;
            if (!source || (!source.salary && !source.contributions && !(source.allocations || []).length)) { showToast('No hay previsión guardada de ' + financeMonthLabel(prevMonth), true); return; }
            financeProfile.budgetPlans[month] = {
                salary: Number(source.salary) || 0,
                contributions: Number(source.contributions) || 0,
                allocations: (source.allocations || []).map(a => ({ ...a, id: 'ba_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) })),
                autoQuitadas: { ...(source.autoQuitadas || {}) }
            };
            const el = document.getElementById('longterm-planning-section');
            if (el) el.outerHTML = renderBudgetPlanningSection();
            try { await saveData(); showToast('Previsión heredada de ' + financeMonthLabel(prevMonth)); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // "grabar datos.": calcula el gasto real del mes que se está
        // viendo por cada casilla vinculada a una categoría (sumando los
        // movimientos de Finanzas PRO), y lo archiva junto a lo previsto.
        // Funciona igual para el mes actual, uno pasado sin grabar
        // todavía, o uno futuro que estés preparando por adelantado (en
        // ese caso el "real" saldrá a 0 hasta que ese mes llegue de verdad).
        async function recordBudgetMonth() {
            const month = longtermViewMonth || financeMonthKey();
            const plan = getBudgetPlanForMonth(month);
            if (!plan.allocations.length && !plan.salary && !plan.contributions) { showToast('Añade el sueldo, las aportaciones o al menos una casilla antes de grabar', true); return; }
            if (!confirm(`¿Grabar la planificación de ${financeMonthLabel(month)}? Pasará al historial — podrás reabrirla con ✎ si hace falta.`)) return;
            const actuals = {};
            plan.allocations.forEach(a => {
                // financeProCategorySpend ya descuenta devoluciones/reembolsos
                // (ingresos de la categoría de ingreso con el mismo nombre).
                actuals[a.id] = a.auto ? budgetAutoGastado(a.auto, month) : a.categoryId ? financeProCategorySpend(a.categoryId, month) : null;
            });
            // El sueldo + aportaciones sin asignar a ninguna casilla se
            // archiva como ahorro de ese mes, en vez de perderse sin más al
            // reiniciar la planificación.
            const assigned = plan.allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
            const saved = Math.max(0, (Number(plan.salary) || 0) + (Number(plan.contributions) || 0) - assigned);
            financeProfile.budgetHistory = (financeProfile.budgetHistory || []).filter(h => h.month !== month);
            financeProfile.budgetHistory.push({
                month, salary: plan.salary, contributions: plan.contributions,
                allocations: plan.allocations.map(a => ({ ...a })),
                actuals, saved, recordedAt: new Date().toISOString()
            });
            financeProfile.budgetHistory = financeProfile.budgetHistory.sort((a, b) => a.month.localeCompare(b.month)).slice(-36);
            delete financeProfile.budgetPlans[month];
            const el = document.getElementById('longterm-planning-section');
            if (el) el.outerHTML = renderBudgetPlanningSection();
            if (currentView === 'finances') render();
            try { await saveData(); showToast('Mes grabado'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function renderBudgetHistoryMonthTable(h) {
            const totalPrevisto = h.allocations.reduce((s, a) => s + Number(a.amount || 0), 0);
            const totalReal = h.allocations.reduce((s, a) => s + (h.actuals[a.id] != null ? Number(h.actuals[a.id]) : 0), 0);
            return `
            ${h.contributions ? `<div class="finance-empty-line" style="margin-bottom:10px">Ingresos: sueldo ${financeMoney(h.salary || 0)} + aportaciones ${financeMoney(h.contributions)}</div>` : ''}
            <table class="budget-history-table">
                <tr><th>Casilla</th><th>Previsto</th><th>Real</th><th>Diferencia</th></tr>
                ${h.allocations.map(a => {
                    const real = h.actuals[a.id];
                    const diff = real != null ? Number(a.amount || 0) - real : null;
                    return `<tr>
                        <td>${escapeHtml(a.label || '(sin nombre)')}</td>
                        <td>${financeMoney(a.amount || 0)}</td>
                        <td>${real != null ? financeMoney(real) : '—'}</td>
                        <td class="${diff != null ? (diff >= 0 ? 'finance-positive' : 'finance-negative') : ''}">${diff != null ? (diff >= 0 ? '+' : '') + financeMoney(diff) : '—'}</td>
                    </tr>`;
                }).join('')}
                <tr class="budget-history-total-row"><td>Total</td><td>${financeMoney(totalPrevisto)}</td><td>${financeMoney(totalReal)}</td><td>${financeMoney(totalPrevisto - totalReal)}</td></tr>
            </table>
            ${h.saved ? `<div class="finance-empty-line" style="margin-top:10px">Sin asignar a ninguna casilla, ahorrado: <strong style="color:var(--text-primary)">${financeMoney(h.saved)}</strong></div>` : ''}
            <button class="finance-oneoff-btn" style="margin-top:10px;color:#c2455c;border-color:#c2455c" onclick="deleteBudgetHistoryMonth('${h.month}')">Eliminar registro</button>`;
        }

        // Un mes "grabado" no es definitivo: se puede sacar de vuelta a
        // planificación editable para seguir tocándolo, o borrar sin más.
        async function editBudgetHistoryMonth(month) {
            const hist = financeProfile.budgetHistory || [];
            const entry = hist.find(h => h.month === month);
            if (!entry) return;
            if (!confirm('¿Editar este mes? Vuelve a planificación editable (sustituyendo lo que tuvieras ahí) y sale del historial hasta que lo grabes de nuevo.')) return;
            financeProfile.budgetHistory = hist.filter(h => h.month !== month);
            financeProfile.budgetPlans[month] = { salary: entry.salary, contributions: entry.contributions || 0, allocations: entry.allocations.map(a => ({ ...a })) };
            longtermViewMonth = month;
            const el = document.getElementById('longterm-planning-section');
            if (el) el.outerHTML = renderBudgetPlanningSection();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteBudgetHistoryMonth(month) {
            if (!confirm('¿Eliminar este registro del historial? No se puede deshacer.')) return;
            financeProfile.budgetHistory = (financeProfile.budgetHistory || []).filter(h => h.month !== month);
            const el = document.getElementById('longterm-planning-section');
            if (el) el.outerHTML = renderBudgetPlanningSection();
            try { await saveData(); showToast('Registro eliminado'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // -- Cuentas de inversión --
        function renderInvestmentAccountRow(acc) {
            const invested = investmentAccountInvested(acc);
            const value = investmentAccountValue(acc);
            const gain = value - invested;
            const monthKey = financeMonthKey();
            const updatedThisMonth = (acc.contributions || []).some(c => c.month === monthKey);
            return `
            <div class="investment-account-row">
                <span class="lt-dot ${updatedThisMonth ? 'lt-dot-today' : ''}" title="${updatedThisMonth ? 'Actualizada este mes' : 'Sin actualizar este mes'}"></span>
                <div class="investment-account-main">
                    <div class="investment-account-name">${escapeHtml(acc.name)}</div>
                    <div class="investment-account-meta">${financeMoney(invested)} aportado${gain !== 0 ? ` · ${gain >= 0 ? '+' : ''}${financeMoney(gain)}` : ''}</div>
                </div>
                <div class="investment-account-value">${financeMoney(value)}</div>
                <button class="finance-oneoff-btn" style="width:auto" onclick="openAccountMonthlyUpdate('${acc.id}')">+ mes</button>
                <button class="doc-action-delete-btn" title="Eliminar cuenta" onclick="deleteInvestmentAccount('${acc.id}')">✕</button>
            </div>`;
        }

        function openAddInvestmentAccountModal() {
            showModal(`
                <div class="modal-title">+ Nueva cuenta de inversión</div>
                <div class="modal-label">Nombre</div>
                <input id="inv-acc-name" class="modal-input" placeholder="Ej. Fondo indexado MSCI World, MyInvestor...">
                <div class="modal-label">Notas (opcional)</div>
                <input id="inv-acc-notes" class="modal-input" placeholder="Ej. ISIN, bróker...">
                <button class="btn-modal-primary" onclick="saveNewInvestmentAccount()">Crear cuenta</button>
            `);
            setTimeout(() => document.getElementById('inv-acc-name')?.focus(), 50);
        }

        async function saveNewInvestmentAccount() {
            const name = (document.getElementById('inv-acc-name')?.value || '').trim();
            if (!name) { showToast('Ponle un nombre a la cuenta', true); return; }
            const notes = (document.getElementById('inv-acc-notes')?.value || '').trim();
            financeProfile.investmentAccounts = financeProfile.investmentAccounts || [];
            financeProfile.investmentAccounts.push({ id: 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name, notes, contributions: [] });
            syncInvestedTotal();
            openLongTermModal();
            try { await saveData(); showToast('Cuenta creada'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteInvestmentAccount(id) {
            if (!confirm('¿Eliminar esta cuenta de inversión? Se perderá su historial de aportaciones. No se puede deshacer.')) return;
            financeProfile.investmentAccounts = (financeProfile.investmentAccounts || []).filter(a => a.id !== id);
            syncInvestedTotal();
            openLongTermModal();
            try { await saveData(); showToast('Cuenta eliminada'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // Mismo ritual que el antiguo "una vez al mes": aportación + valor
        // total a fecha de hoy, con opción de corregir los 2 meses
        // anteriores si se te olvidó registrarlo a tiempo.
        function openAccountMonthlyUpdate(accountId, monthKey) {
            const acc = (financeProfile.investmentAccounts || []).find(a => a.id === accountId);
            if (!acc) return;
            monthKey = monthKey || financeMonthKey();
            const now = new Date();
            const monthOptions = [0, 1, 2].map(back => financeMonthKey(new Date(now.getFullYear(), now.getMonth() - back, 1)));
            const existing = (acc.contributions || []).find(c => c.month === monthKey);
            showModal(`
                <div class="modal-title">${escapeHtml(acc.name)}</div>
                <div class="modal-label">Mes</div>
                <select class="modal-input" onchange="openAccountMonthlyUpdate('${accountId}',this.value)">
                    ${monthOptions.map(m => `<option value="${m}" ${m === monthKey ? 'selected' : ''}>${escapeHtml(financeMonthLabel(m))}</option>`).join('')}
                </select>
                <div class="modal-label">Aportación de ${escapeHtml(financeMonthLabel(monthKey))} (€)</div>
                <input id="inv-acc-update-amount" class="modal-input" type="number" min="0" step="0.01" value="${existing ? existing.amount : ''}" placeholder="0.00">
                <div class="modal-label">Valor total de la cuenta a fecha de hoy (€)</div>
                <input id="inv-acc-update-value" class="modal-input" type="number" min="0" step="0.01" value="${existing && existing.value !== undefined ? existing.value : ''}" placeholder="0.00">
                <button class="btn-modal-primary" style="margin-top:10px" onclick="saveAccountMonthlyUpdate('${accountId}','${monthKey}')">Guardar</button>
            `);
            setTimeout(() => document.getElementById('inv-acc-update-amount')?.focus(), 50);
        }

        async function saveAccountMonthlyUpdate(accountId, monthKey) {
            const acc = (financeProfile.investmentAccounts || []).find(a => a.id === accountId);
            if (!acc) return;
            const amount = Math.max(0, Number(document.getElementById('inv-acc-update-amount')?.value) || 0);
            const valueRaw = document.getElementById('inv-acc-update-value')?.value;
            const value = valueRaw === '' ? undefined : Math.max(0, Number(valueRaw) || 0);
            acc.contributions = (acc.contributions || []).filter(c => c.month !== monthKey);
            const entry = { month: monthKey, amount };
            if (value !== undefined) entry.value = value;
            acc.contributions.push(entry);
            syncInvestedTotal();
            if (monthKey === financeMonthKey()) refreshCurrentMonthSnapshot();
            closeModal();
            openLongTermModal();
            try { await saveData(); showToast('Aportación guardada'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function renderFinanceDashboard() {
            ensureCurrentMonthHistory();
            const total = financeCorePatrimony();
            const totalWithVacation = financeTotalAssets();
            const target = financeTargetTotal();
            const totalPct = target > 0 ? Math.min(100, total / target * 100) : null;
            const prevTotal = financePreviousSnapshot()?.total;
            const totalChange = financePctChange(total, prevTotal);
            const recurring = financeRecurringTotal();
            const now = new Date();
            const monthsLeft = 12 - now.getMonth();
            const remainingToTarget = Math.max(0, target - total);
            const fc = financeProfile.forecastProfile || {};

            const blurToggleBtn = `<button class="finance-blur-toggle" title="${blurFinances ? 'Mostrar cifras' : 'Ocultar cifras'}" onclick="toggleBlurFinances()">${blurFinances ? FINANCE_EYE_OFF_ICON : FINANCE_EYE_ICON}</button>`;
            const updatePending = financeMonthUpdatePending();
            return `
            <div class="finance-dashboard ${blurFinances ? 'blurred' : ''}">
                <div class="finance-toolbar-row">
                    ${renderFinanceProInlineToggle()}
                    <div style="display:flex;align-items:center;gap:8px">
                        <button class="finance-oneoff-btn finance-chart-config-btn" onclick="openFinanceChartSeriesConfig()">⚙ Elegir qué mostrar</button>
                        ${blurToggleBtn}
                    </div>
                </div>
                ${renderFinanceProSyncWarning()}

                ${(financeProfile.recordatorioDia && updatePending && new Date().getDate() >= financeProfile.recordatorioDia) ? `
                <div class="finance-reminder-banner">
                    <span>Cuando tengas la información disponible, puedes actualizar tus finanzas de ${escapeHtml(financeMonthLabel(financeMonthKey()))}.</span>
                    <button class="btn-modal-primary" style="width:auto" onclick="openMonthlyFinanceUpdate()">Actualizar ahora</button>
                </div>` : ''}

                <section class="finance-panel finance-chart-panel">
                    <div class="finance-panel-head">
                        ${financePanelHeadIcon(FINANCE_ICON_CHART, 'fin-slate', 'Evolución', 'Tu patrimonio en el tiempo')}
                    </div>
                    <div id="finance-floating-chart-wrap" onwheel="financeChartWheelZoom(event)" title="Rueda del ratón: acercar/alejar el periodo mostrado">
                        ${renderFinanceFloatingChart()}
                    </div>
                </section>

                <section class="finance-networth-card finance-networth-card-wide" id="finance-networth-section">
                    <div class="finance-networth-main">
                        <div>
                            <div class="finance-kicker">Patrimonio operativo</div>
                            <div class="finance-networth-value finance-networth-value-compact">${financeMoney(total)}</div>
                            <div class="finance-networth-meta">
                                ${totalChange === null ? 'Primer registro' : `${totalChange >= 0 ? '+' : ''}${totalChange.toFixed(1)}% frente al mes anterior`}
                                · Objetivo ${target > 0 ? financeMoney(target) : 'sin definir'}
                            </div>
                        </div>
                        <div class="finance-networth-side">
                            <span>Progreso</span>
                            <strong>${totalPct === null ? '—' : totalPct.toFixed(0) + '%'}</strong>
                            <div class="finance-progress finance-progress-large"><span style="width:${totalPct === null ? 0 : totalPct}%"></span></div>
                            <small>${remainingToTarget <= 0 && target > 0 ? 'Objetivo alcanzado' : target > 0 ? `Faltan ${financeMoney(remainingToTarget)} · ${monthsLeft} meses` : 'Define un objetivo para ver el camino'}</small>
                        </div>
                    </div>
                    <div class="finance-networth-actions">
                        <button class="finance-networth-action-btn" onclick="openFinanceTargetEditor()">✎ Objetivo</button>
                        <button class="btn-modal-primary" style="width:auto" onclick="openMonthlyFinanceUpdate()">${updatePending ? 'Actualizar este mes' : '✓ Mes actualizado'}</button>
                    </div>
                </section>

                <div id="finance-accounts-section" class="finance-section-head">
                    <div class="finance-kicker">Cuentas</div>
                    <button class="finance-oneoff-btn" onclick="openFinanceAccountsConfig()">+ Cuenta propia</button>
                </div>
                <div class="finance-metrics-grid">
                    ${renderFinanceMetric('cash','cashTarget','Efectivo / bancos',FINANCE_ICON_CASH,'fin-blue','Liquidez disponible')}
                    ${renderFinanceMetric('emergency','emergencyTarget','Fondo de emergencia',FINANCE_ICON_SHIELD,'fin-amber','Reserva no destinada al gasto corriente')}
                    ${renderFinanceMetric('vacation','vacationTarget','Reserva de vacaciones',FINANCE_ICON_SUN,'fin-teal','Se mantiene aparte del patrimonio operativo')}
                    ${(financeProfile.customAccounts || []).map(a => renderFinanceSimpleTile(a.balance, a.name, `openCustomAccountEditor('${a.id}')`, null, false, FINANCE_ICON_CARD, 'fin-slate')).join('')}
                    ${renderFinanceSimpleTile(recurring, 'Gastos recurrentes / mes', 'openRecurringExpensesModal()', null, true, FINANCE_ICON_REPEAT, 'fin-red')}
                    ${collectibles.length ? renderFinanceSimpleTile(financeCollectiblesTotal(), 'Coleccionables', "switchView('collectibles')", 'No cuenta para el patrimonio operativo', true, FINANCE_ICON_STAR, 'fin-gold') : ''}
                </div>

                <div class="finance-section-head" style="margin-top:24px">
                    <div class="finance-kicker">Planificación a futuro</div>
                </div>
                <div class="finance-grid-3">
                    <section class="finance-panel" id="finance-forecast-section">
                        <div class="finance-panel-head">
                            ${financePanelHeadIcon(FINANCE_ICON_CALENDAR, 'fin-indigo', 'Previsión', 'Sueldo y aportaciones')}
                            <button class="finance-icon-btn" title="Editar previsión" onclick="openForecastProfileEditor()">✎</button>
                        </div>
                        <div class="finance-stat-grid">
                            <div class="finance-stat-box"><span>Sueldo actual</span><strong>${financeMoney(fc.salary || 0)}</strong></div>
                            <div class="finance-stat-box"><span>Meses de contrato</span><strong>${fc.contractMonths || '—'}</strong></div>
                            <div class="finance-stat-box"><span>+Emergencia/mes</span><strong>${financeMoney(fc.emergencyMonthlyPlan || 0)}</strong></div>
                            <div class="finance-stat-box"><span>+Vacaciones/mes</span><strong>${financeMoney(fc.vacationMonthlyPlan || 0)}</strong></div>
                        </div>
                        <div class="finance-empty-line" style="margin-top:10px">Suscripciones y gastos fijos: ${financeMoney(recurring)}/mes (se descuentan solos de la provisión).</div>
                    </section>

                    ${renderInvestmentPanel()}

                    ${renderFinanceSavingsGoals()}
                </div>

                <div class="finance-section-head" style="margin-top:6px">
                    <div class="finance-kicker">Ajustes</div>
                </div>
                <div class="finance-dashboard-foot-actions">
                    <button class="finance-oneoff-btn" onclick="openFinanceHistoryCorrectionModal()">✎ Corregir registros</button>
                    <label class="finance-foot-reminder">
                        Recordarme el día
                        <select class="modal-input" style="width:auto;margin:0;padding:4px 8px" onchange="setFinanceReminderDay(this.value)">
                            <option value="">Sin recordatorio</option>
                            ${Array.from({ length: 28 }, (_, i) => i + 1).map(d => `<option value="${d}" ${financeProfile.recordatorioDia === d ? 'selected' : ''}>${d}</option>`).join('')}
                        </select>
                        de cada mes
                    </label>
                </div>

                <div class="finance-dashboard-foot">${monthsLeft > 0 ? `Quedan ${monthsLeft} meses del año. ` : ''}La reserva de vacaciones (${financeMoney(financeProfile.vacation || 0)}) queda fuera del patrimonio operativo para evitar contar dos veces el dinero disponible.</div>
            </div>`;
        }

        function renderFinances() {
            migrateInvestmentData();
            migrateToInvestmentAccounts();
            // Finanzas PRO (cuentas reales + movimientos) es ahora el único
            // panel: el "Resumen" clásico, que llevaba sus propias cifras
            // manuales desincronizadas de PRO, queda fusionado dentro de
            // renderFinanceProDashboard(). Se fuerza aquí por si alguna
            // cuenta antigua todavía tiene financePro.enabled=false guardado.
            financePro.enabled = true;
            ensureRecurringProCharges();
            return renderFinanceProDashboard();
        }

        // ============================================================
        //  FINANZAS PRO — activación y navegación
        // ============================================================
        // Paleta fija — cada categoría por defecto tiene su propio color,
        // así se distinguen entre sí de un vistazo en la lista de
        // movimientos (antes solo había color de ingreso/gasto, igual
        // para todas las categorías).
        const FINANCE_PRO_PALETTE = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#78716c'];

        function financeProDefaultCategories() {
            return [
                { id: 'cat_comida', name: 'Comida y bebida', icon: 'food', type: 'expense', color: FINANCE_PRO_PALETTE[0] },
                { id: 'cat_vivienda', name: 'Vivienda', icon: 'home', type: 'expense', color: FINANCE_PRO_PALETTE[1] },
                { id: 'cat_transporte', name: 'Transporte', icon: 'car', type: 'expense', color: FINANCE_PRO_PALETTE[2] },
                { id: 'cat_compras', name: 'Compras', icon: 'bag', type: 'expense', color: FINANCE_PRO_PALETTE[3] },
                { id: 'cat_ocio', name: 'Ocio', icon: 'ticket', type: 'expense', color: FINANCE_PRO_PALETTE[4] },
                { id: 'cat_salud', name: 'Salud', icon: 'heart', type: 'expense', color: FINANCE_PRO_PALETTE[5] },
                { id: 'cat_comunicacion', name: 'Comunicación', icon: 'phone', type: 'expense', color: FINANCE_PRO_PALETTE[6] },
                { id: 'cat_finanzas_gasto', name: 'Comisiones e impuestos', icon: 'bank', type: 'expense', color: FINANCE_PRO_PALETTE[7] },
                { id: 'cat_educacion', name: 'Educación', icon: 'book', type: 'expense', color: FINANCE_PRO_PALETTE[8] },
                { id: 'cat_familia', name: 'Familia y mascotas', icon: 'family', type: 'expense', color: FINANCE_PRO_PALETTE[9] },
                { id: 'cat_otros_gasto', name: 'Otros gastos', icon: 'other', type: 'expense', color: FINANCE_PRO_PALETTE[15] },
                { id: 'cat_sueldo', name: 'Sueldo', icon: 'briefcase', type: 'income', color: FINANCE_PRO_PALETTE[10] },
                { id: 'cat_extra', name: 'Trabajo extra', icon: 'coin', type: 'income', color: FINANCE_PRO_PALETTE[11] },
                { id: 'cat_inversion_ing', name: 'Inversiones', icon: 'trend', type: 'income', color: FINANCE_PRO_PALETTE[12] },
                { id: 'cat_regalo', name: 'Aportaciones', icon: 'gift', type: 'income', color: FINANCE_PRO_PALETTE[13] },
                { id: 'cat_reembolso', name: 'Reembolsos', icon: 'repeat', type: 'income', color: FINANCE_PRO_PALETTE[14] },
                { id: 'cat_otros_ingreso', name: 'Otros ingresos', icon: 'other', type: 'income', color: FINANCE_PRO_PALETTE[15] },
                { id: 'cat_viajes', name: 'Viajes y vacaciones', icon: 'plane', type: 'expense', color: FINANCE_PRO_PALETTE[8] },
                { id: 'cat_mascotas', name: 'Mascotas', icon: 'paw', type: 'expense', color: FINANCE_PRO_PALETTE[9] },
                { id: 'cat_deporte', name: 'Deporte', icon: 'dumbbell', type: 'expense', color: FINANCE_PRO_PALETTE[2] },
                { id: 'cat_tecnologia', name: 'Tecnología', icon: 'laptop', type: 'expense', color: FINANCE_PRO_PALETTE[6] },
                { id: 'cat_bienestar', name: 'Bienestar y belleza', icon: 'sparkle', type: 'expense', color: FINANCE_PRO_PALETTE[13] },
                { id: 'cat_alquileres', name: 'Alquileres', icon: 'key', type: 'income', color: FINANCE_PRO_PALETTE[7] },
                // No son gastos reales (son dinero que sigue siendo tuyo,
                // solo que en otra forma) pero necesitan aparecer en la
                // lista de "Gastos" para poder categorizar ahí el dinero
                // que sale de la cuenta corriente hacia un bróker o una
                // compra de coleccionables al importar movimientos.
                { id: 'cat_inversion_gasto', name: 'Inversiones', icon: 'trend', type: 'expense', color: FINANCE_PRO_PALETTE[12] },
                { id: 'cat_coleccionables', name: 'Coleccionables', icon: 'star', type: 'expense', color: FINANCE_PRO_PALETTE[14] },
                { id: 'cat_gasolina', name: 'Gasolina', icon: 'fuel', type: 'expense', color: FINANCE_PRO_PALETTE[2] },
                // Contrapartida de ingreso con el mismo nombre que su gasto
                // — para poder registrar ahí devoluciones/reembolsos (un
                // amigo pagándote su parte de la cuenta) o dinero que
                // vuelve (vender un coleccionable), y que Bitácora lo reste
                // del gasto real de esa categoría en vez de sumarlo aparte
                // como si fuera un ingreso nuevo (ver financeProCategorySpend).
                { id: 'cat_comida_ing', name: 'Comida y bebida', icon: 'food', type: 'income', color: FINANCE_PRO_PALETTE[0] },
                { id: 'cat_coleccionables_ing', name: 'Coleccionables', icon: 'star', type: 'income', color: FINANCE_PRO_PALETTE[14] }
            ];
        }

        const FINANCE_PRO_ACCOUNT_KEYS = ['efectivo', 'bancos', 'online'];

        async function toggleFinancePro() {
            financePro.enabled = !financePro.enabled;
            if (financePro.enabled && !financePro.categories.length) {
                financePro.categories = financeProDefaultCategories();
            }
            render();
            try { await saveData(); showToast(financePro.enabled ? 'Modo PRO activado' : 'Modo PRO desactivado'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // Interruptor compacto — comparte fila con el de ocultar cifras
        // para no ocupar una línea entera solo para esto.
        function renderFinanceProInlineToggle() {
            return `<div class="finance-pro-inline-toggle">
                <span>Modo PRO</span>
                <button class="finance-pro-switch ${financePro.enabled ? 'on' : ''}" onclick="toggleFinancePro()" title="${financePro.enabled ? 'Desactivar' : 'Activar'} modo PRO" aria-label="Modo PRO">
                    <span class="finance-pro-switch-knob"></span>
                </button>
            </div>`;
        }

        // Compara la cuenta "Efectivo / bancos" del Resumen con la suma de
        // Efectivo + Bancos del modo PRO — son dos caminos independientes
        // para llevar las mismas cuentas, así que pueden desincronizarse
        // si se actualiza uno y no el otro. "Online" no tiene equivalente
        // en el Resumen, así que no entra en la comparación.
        function financeProSyncStatus() {
            const proCashLike = financeProAccountBalance('efectivo') + financeProAccountBalance('bancos');
            const resumenCash = Number(financeProfile.cash || 0);
            const diff = proCashLike - resumenCash;
            return { proCashLike, resumenCash, diff, inSync: Math.abs(diff) < 1 };
        }

        function renderFinanceProSyncWarning() {
            if (!financePro.enabled) return '';
            const status = financeProSyncStatus();
            if (status.inSync) return '';
            return `<div class="finance-sync-warning">
                <div class="finance-metric-icon fin-amber finance-pro-tx-icon">${FINANCE_ICON_ALERT}</div>
                <div>
                    <strong>Efectivo + Bancos no coincide entre el Resumen y el modo PRO</strong>
                    <span>Resumen: ${financeMoney(status.resumenCash)} · PRO: ${financeMoney(status.proCashLike)} — diferencia de ${financeMoney(Math.abs(status.diff))}</span>
                </div>
            </div>`;
        }

