        // ============================================================
        //  ASISTENTE: lo que Bitácora hace por su cuenta con tus datos.
        //  Resumen de la semana, presupuesto con aviso suave, suscripciones
        //  que se repiten en el banco, «¿me lo puedo permitir?», respuestas
        //  en el buscador y la tarea de regalo antes de cada cumpleaños.
        // ============================================================

        const ASIST_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        const asistNorm = t => stripAccents(String(t || '').toLowerCase()).replace(/\s+/g, ' ').trim();
        const asistDias = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
        const asistSumar = (iso, k) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + k); return isoLocal(d); };
        const asistFecha = (iso, larga) => new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', larga ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' }).replace('.', '');

        // Gasto real (sin traspasos ni bolsillos de ahorro) entre dos fechas.
        function asistGasto(desde, hasta, filtro) {
            return financePro.transactions.filter(t => t.type === 'expense' && !t.ahorro && t.date >= desde && t.date <= hasta && (!filtro || filtro(t)));
        }

        // Próximo día de cargo de una suscripción o gasto fijo a partir de hoy.
        function asistProximoCargo(e, desde) {
            const base = new Date(desde + 'T12:00:00');
            for (let k = 0; k < 2; k++) {
                const y = base.getFullYear(), m = base.getMonth() + k;
                const ultimo = new Date(y, m + 1, 0).getDate();
                const d = isoLocal(new Date(y, m, Math.min(Number(e.renewalDay) || 1, ultimo), 12));
                if (d >= desde) return d;
            }
            return null;
        }

        function asistCargosEntre(desde, hasta) {
            return entries.filter(e => (e.type === 'subscription' || e.type === 'fixed_expense') && e.active !== false && Number(e.amount) > 0)
                .map(e => ({ e, fecha: asistProximoCargo(e, desde) })).filter(x => x.fecha && x.fecha <= hasta);
        }

        // ------------------------------------------------------------
        //  RESUMEN DE LA SEMANA (también llega el domingo a las 20:00 como
        //  aviso; el aviso abre la app en ?semana).
        // ------------------------------------------------------------
        function openResumenSemana() {
            const hoy = todayISO();
            const dias = Array.from({ length: 7 }, (_, i) => asistSumar(hoy, i + (new Date().getDay() === 0 ? 1 : 0)));
            const filasDia = dias.map(d => {
                const cosas = getDayAllEntries(d).filter(e => !isCalendarLogEntry(e) && e.type !== 'work').map(e => {
                    if (e.type === 'birthday') return `cumpleaños de ${escapeHtml(e.title)}`;
                    return `${e.time ? `<b>${escapeHtml(e.time)}</b> ` : ''}${escapeHtml(e.title || '')}`;
                });
                asistCargosEntre(d, d).forEach(x => cosas.push(`cargo de ${escapeHtml(x.e.title)}, ${financeMoney(Number(x.e.amount))}`));
                const fest = typeof festivoDe === 'function' ? festivoDe(d) : null;
                if (fest) cosas.unshift(`<b>festivo</b>, ${escapeHtml(fest.nombre)}`);
                return cosas.length ? `<div class="asist-dia"><span>${asistFecha(d, true)}.</span><div>${cosas.map(c => `<div>${c}</div>`).join('')}</div></div>` : '';
            }).filter(Boolean);
            const desde = asistSumar(hoy, -6);
            const gastoSemana = asistGasto(desde, hoy).reduce((s, t) => s + Number(t.amount), 0);
            const semanas = Array.from({ length: 8 }, (_, i) => asistGasto(asistSumar(desde, -7 * (i + 1)), asistSumar(hoy, -7 * (i + 1))).reduce((s, t) => s + Number(t.amount), 0)).filter(v => v > 0);
            const media = semanas.length >= 3 ? semanas.reduce((a, b) => a + b, 0) / semanas.length : null;
            const rutinas = (habits || []).filter(h => h.activo !== false);
            const hechas = rutinas.reduce((s, h) => s + Object.keys(h.completadas || {}).filter(k => k >= desde && k <= hoy && h.completadas[k]).length, 0);
            const pasada = [
                `<div><b>${financeMoney(gastoSemana)}</b> gastados en los últimos 7 días${media ? `, ${gastoSemana > media * 1.15 ? 'más' : gastoSemana < media * 0.85 ? 'menos' : 'lo'} ${Math.abs(gastoSemana - media) / media < 0.15 ? 'normal en ti' : `de lo normal (unos ${financeMoney(media)} por semana)`}` : ''}.</div>`,
                rutinas.length ? `<div><b>${hechas}</b> ${hechas === 1 ? 'vez' : 'veces'} cumpliste tus rutinas.</div>` : '',
            ].join('');
            const cargos = asistCargosEntre(dias[0], dias[6]);
            showModal(`
                <div class="modal-title">tu semana.</div>
                <div class="asist-bloque-cab">lo que viene.</div>
                ${filasDia.length ? `<div class="asist-dias">${filasDia.join('')}</div>` : '<p class="finance-modal-note">Nada apuntado para los próximos siete días.</p>'}
                ${cargos.length ? `<p class="finance-modal-note">${cargos.length} ${cargos.length === 1 ? 'cargo' : 'cargos'} por ${financeMoney(cargos.reduce((s, x) => s + Number(x.e.amount), 0))} esta semana.</p>` : ''}
                ${typeof renderLineaFestivos === 'function' ? renderLineaFestivos('asist-linea') : ''}
                <div class="asist-bloque-cab">la que acaba.</div>
                <div class="asist-pasada">${pasada}</div>
            `);
        }

        // ------------------------------------------------------------
        //  PRESUPUESTO SUAVE: una línea, sin notificación, cuando una
        //  categoría pasa del 80 % de su presupuesto del mes. El límite es el
        //  de las casillas de Largo plazo de este mes vinculadas a esa
        //  categoría (lo planificado para este mes manda) y, si no tiene
        //  casilla, el presupuesto mensual de la categoría.
        // ------------------------------------------------------------
        function asistLimitesDelMes(mes) {
            const limites = {};
            Object.entries(financePro.categoryBudgets || {}).forEach(([id, v]) => { if (Number(v) > 0) limites[id] = { limite: Number(v), nombre: '' }; });
            const casillas = (financeProfile?.budgetPlans?.[mes]?.allocations || []).filter(a => a.categoryId && !a.auto && Number(a.amount) > 0);
            const porCat = {};
            casillas.forEach(a => { (porCat[a.categoryId] = porCat[a.categoryId] || []).push(a); });
            Object.entries(porCat).forEach(([id, l]) => {
                limites[id] = { limite: l.reduce((s, a) => s + Number(a.amount), 0), nombre: l.length === 1 ? (l[0].label || '').trim() : '' };
            });
            return limites;
        }

        function asistPresupuestosAlerta() {
            const mes = financeMonthKey();
            const hoy = new Date();
            const quedanDias = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate() - hoy.getDate() + 1;
            return Object.entries(asistLimitesDelMes(mes)).filter(([id]) => financeProCategoryById(id)).map(([id, l]) => {
                const { gastado, limite } = financeProPresupuestoConDevoluciones(id, mes, l.limite);
                return { cat: financeProCategoryById(id), nombre: l.nombre, gastado, limite, pct: limite ? gastado / limite : 0, quedanDias };
            }).filter(x => x.pct >= 0.8).sort((a, b) => b.pct - a.pct);
        }

        function renderAvisoPresupuestos() {
            const lista = asistPresupuestosAlerta();
            if (!lista.length) return '';
            return `<div class="asist-presupuesto">${lista.slice(0, 3).map(x => {
                const queda = x.limite - x.gastado;
                const nombre = escapeHtml((x.nombre || x.cat.name).toLowerCase());
                return `<div>${queda >= 0
                    ? `vas al <b>${Math.round(x.pct * 100)} %</b> en ${nombre}: quedan ${financeMoney(queda)} para ${x.quedanDias} ${x.quedanDias === 1 ? 'día' : 'días'}.`
                    : `${nombre} se ha pasado <b>${financeMoney(-queda)}</b> del presupuesto este mes.`}</div>`;
            }).join('')}</div>`;
        }

        // ------------------------------------------------------------
        //  SUSCRIPCIONES QUE SE REPITEN EN EL BANCO (la misma regla que la
        //  herramienta del conector): mismo concepto en 3 meses o más, con
        //  importe parecido y sin dar de alta. «No es» lo deja de proponer.
        // ------------------------------------------------------------
        function asistClaveCargo(t) {
            return asistNorm(t.bankNote ?? t.note).replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
        }

        // «NETFLIX.COM 866-579» → «Netflix».
        function asistNombreBonito(t) {
            let n = String(t || '').replace(/\.(com|es|net|org|io|tv)\b.*$/i, '').replace(/[*#]|\b\d[\d\s-]{3,}\b/g, ' ').replace(/\s+/g, ' ').trim();
            if (n && n === n.toUpperCase()) n = n.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
            return n || String(t || '');
        }

        function asistSuscripcionesDetectadas() {
            const desde = asistSumar(todayISO(), -245);
            const ignoradas = new Set(financePro.suscripcionesIgnoradas || []);
            const recurrentes = entries.filter(e => e.type === 'subscription' || e.type === 'fixed_expense');
            const yaDada = k => recurrentes.some(e => (e.conceptoBanco && k.includes(asistNorm(e.conceptoBanco).split(' ')[0])) || asistNorm(e.title).split(/[^a-z0-9]+/).some(w => w.length >= 4 && k.includes(w)));
            const grupos = {};
            financePro.transactions.forEach(t => {
                if (t.type !== 'expense' || !t.date || t.date < desde || t.recurringEntryId || t.ahorro) return;
                const k = asistClaveCargo(t);
                if (k.length >= 3) (grupos[k] = grupos[k] || []).push(t);
            });
            const res = [];
            Object.entries(grupos).forEach(([k, l]) => {
                const meses = new Set(l.map(t => t.date.slice(0, 7)));
                if (meses.size < 3 || ignoradas.has(k) || yaDada(k)) return;
                const importes = l.map(t => Number(t.amount) || 0).sort((a, b) => a - b);
                const mediana = importes[Math.floor(importes.length / 2)];
                const parecidos = importes.filter(v => Math.abs(v - mediana) <= Math.max(1, mediana * 0.1)).length;
                if (parecidos / importes.length < 0.8 || l.length > meses.size * 2) return;
                const dias = l.map(t => Number(t.date.slice(8, 10))).sort((a, b) => a - b);
                const ultimo = l.slice().sort(financeProCompararMov).pop();
                res.push({ clave: k, nombre: asistNombreBonito(ultimo.note || ultimo.bankNote || k), importe: Math.round(mediana * 100) / 100, dia: dias[Math.floor(dias.length / 2)], meses: meses.size, cuenta: ultimo.account, concepto: ultimo.bankNote || ultimo.note || '' });
            });
            return res.sort((a, b) => b.meses - a.meses);
        }

        function renderSuscripcionesDetectadas() {
            const lista = asistSuscripcionesDetectadas();
            if (!lista.length) return '';
            return `<div class="asist-suscripciones">${lista.slice(0, 3).map(s => `
                <div class="asist-suscripcion">
                    <div><b>¿${escapeHtml(s.nombre)} es una suscripción?</b><span>unos ${financeMoney(s.importe)} cada mes, hacia el día ${s.dia} (${s.meses} meses seguidos).</span></div>
                    <div class="asist-suscripcion-botones"><button class="pedido-btn" onclick="asistAnadirSuscripcion('${escapeHtml(s.clave)}')">añadir.</button><button class="pedido-btn" onclick="asistIgnorarSuscripcion('${escapeHtml(s.clave)}')">no es.</button></div>
                </div>`).join('')}</div>`;
        }

        async function asistAnadirSuscripcion(clave) {
            const s = asistSuscripcionesDetectadas().find(x => x.clave === clave);
            if (!s) return;
            const nombre = s.nombre.charAt(0).toUpperCase() + s.nombre.slice(1);
            entries.push({ id: 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), type: 'subscription', title: nombre, amount: s.importe, renewalDay: s.dia, active: true, proAccount: s.cuenta, conceptoBanco: asistNorm(s.concepto), categoryId: getCategoryIdForType('subscription'), tags: [], date: todayISO() });
            filteredEntries = [...entries];
            render();
            try { await saveData(); showToast(`${nombre} añadida a suscripciones`); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function asistIgnorarSuscripcion(clave) {
            financePro.suscripcionesIgnoradas = [...new Set([...(financePro.suscripcionesIgnoradas || []), clave])];
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // ------------------------------------------------------------
        //  ¿ME LO PUEDO PERMITIR? Lo que tienes, menos lo que te queda por
        //  gastar este mes a tu ritmo, los cargos que faltan y lo programado.
        // ------------------------------------------------------------
        function asistPermitir(precio) {
            const hoy = todayISO();
            const fin = isoLocal(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 12));
            const saldo = financeProTotalBalance();
            const r = financeRitmoDatos();
            const diasMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
            const resto = r.suficiente ? Math.max(0, r.proyeccion - r.llevas) : (r.dia ? r.llevas / r.dia * (diasMes - r.dia) : 0);
            const cargos = asistCargosEntre(asistSumar(hoy, 1), fin).reduce((s, x) => s + Number(x.e.amount), 0);
            const programado = (financePro.programados || []).filter(p => p.date > hoy && p.date <= fin).reduce((s, p) => s + (Number(p.amount) || 0), 0);
            const queda = saldo - resto - cargos - programado;
            const tras = queda - precio;
            const colchon = (financeProfile?.budgetHistory || []).reduce((s, h) => s + (Number(h.saved) || 0), 0);
            const holgura = Math.max(100, (r.suficiente ? r.totalNormal : resto) * 0.25);
            const veredicto = tras >= holgura ? 'si' : tras >= 0 ? 'justo' : 'no';
            return { saldo, resto, cargos, programado, queda, tras, colchon, veredicto, suficiente: r.suficiente, quedanDias: diasMes - new Date().getDate() };
        }

        function openPuedoPermitirme(importe) {
            showModal(`
                <div class="modal-title">¿me lo puedo permitir?</div>
                <input id="asist-permitir" class="modal-input" type="text" inputmode="decimal" autocomplete="off" placeholder="¿cuánto cuesta? 0,00 €" value="${importe ? escapeHtml(String(importe).replace('.', ',')) : ''}" oninput="pintarPuedoPermitirme()">
                <div id="asist-permitir-res"></div>
            `);
            pintarPuedoPermitirme();
            setTimeout(() => document.getElementById('asist-permitir')?.focus(), 60);
        }

        function pintarPuedoPermitirme() {
            const caja = document.getElementById('asist-permitir-res');
            if (!caja) return;
            const precio = Math.abs(financeProParseEuroAmount(document.getElementById('asist-permitir')?.value || ''));
            if (!(precio > 0)) { caja.innerHTML = '<p class="finance-modal-note">Escribe el precio y te digo cómo quedaría tu mes con tu ritmo de gasto, los cargos que faltan y lo que tienes programado.</p>'; return; }
            const p = asistPermitir(precio);
            const titulo = { si: 'sí, sin problema.', justo: 'sí, pero justo.', no: 'este mes, mejor no.' }[p.veredicto];
            const linea = (t, v) => `<div class="asist-permitir-linea"><span>${t}</span><b>${v}</b></div>`;
            caja.innerHTML = `
                <div class="asist-veredicto asist-${p.veredicto}"><b>${titulo}</b><span>${p.tras >= 0 ? `Te quedarían unos ${financeMoney(p.tras)} hasta fin de mes (${p.quedanDias} ${p.quedanDias === 1 ? 'día' : 'días'}).` : `Te faltarían unos ${financeMoney(-p.tras)} para llegar a fin de mes.`}</span></div>
                ${linea('tienes en tus cuentas', financeMoney(p.saldo))}
                ${linea(p.suficiente ? 'lo que sueles gastar de aquí a fin de mes' : 'a tu ritmo de este mes, hasta fin de mes', '−' + financeMoney(p.resto))}
                ${p.cargos ? linea('suscripciones y gastos fijos que faltan', '−' + financeMoney(p.cargos)) : ''}
                ${p.programado ? linea('gastos programados', '−' + financeMoney(p.programado)) : ''}
                ${linea('esto', '−' + financeMoney(precio))}
                ${p.veredicto === 'no' && p.colchon >= precio ? `<p class="finance-modal-note">Tu sueldo sin asignar de otros meses (${financeMoney(p.colchon)}) sí lo cubriría.</p>` : ''}
                ${!p.suficiente ? '<p class="finance-modal-note">Con un par de meses de movimientos, el cálculo usa lo que es normal en ti y no solo este mes.</p>' : ''}`;
        }

        // ------------------------------------------------------------
        //  RESPUESTAS EN EL BUSCADOR: «¿cuándo fue la última vez que fui al
        //  dentista?», «¿cuánto gasté en gasolina en septiembre?», «¿cuándo
        //  es el examen de estadística?», «¿cuántas veces fui al cine este
        //  año?», «¿puedo permitirme 300 €?». Todo con tus datos, en el
        //  dispositivo.
        // ------------------------------------------------------------
        const ASIST_VACIAS = new Set('el la los las un una unos unas de del al a en con que me mi mis tu he ha hay fue fui fuimos estuve era es son voy vamos tengo tenemos ultima ultimo vez veces cuando cuanto cuanta cuantos cuantas gaste gastado gastamos llevo lleva este esta mes ano semana pasado pasada por para y o se le lo'.split(' '));

        function asistPeriodo(q) {
            const hoy = new Date();
            const iso = d => isoLocal(d);
            if (/\beste mes\b/.test(q)) return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1, 12)), hasta: todayISO(), nombre: 'este mes' };
            if (/\bmes pasado\b/.test(q)) return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1, 12)), hasta: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 0, 12)), nombre: 'el mes pasado' };
            if (/\besta semana\b/.test(q)) return { desde: asistSumar(todayISO(), -((hoy.getDay() + 6) % 7)), hasta: todayISO(), nombre: 'esta semana' };
            if (/\beste ano\b/.test(q)) return { desde: `${hoy.getFullYear()}-01-01`, hasta: todayISO(), nombre: 'este año' };
            if (/\bano pasado\b/.test(q)) return { desde: `${hoy.getFullYear() - 1}-01-01`, hasta: `${hoy.getFullYear() - 1}-12-31`, nombre: 'el año pasado' };
            const m = q.match(/\b(?:en|de)\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+(?:de\s+)?(\d{4}))?\b/);
            if (m) {
                const mes = ASIST_MESES.indexOf(m[1]);
                const anio = m[2] ? Number(m[2]) : (mes > hoy.getMonth() ? hoy.getFullYear() - 1 : hoy.getFullYear());
                return { desde: iso(new Date(anio, mes, 1, 12)), hasta: iso(new Date(anio, mes + 1, 0, 12)), nombre: `en ${m[1]}${m[2] ? ' de ' + m[2] : ''}` };
            }
            return null;
        }

        function asistPalabras(q) {
            return q.replace(/\b(este|esta|el|la)\s+(mes|semana|ano)(\s+pasad[oa])?\b/g, ' ').replace(/\b(?:en|de)\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(\s+(de\s+)?\d{4})?\b/g, ' ')
                .split(/[^a-z0-9ñ]+/).filter(w => w.length >= 3 && !ASIST_VACIAS.has(w));
        }

        // Lo que tiene fecha y texto: eventos y entradas, tareas del
        // planificador y movimientos de Finanzas.
        function asistCosasConFecha() {
            const cosas = [];
            entries.forEach(e => {
                if (isCalendarLogEntry(e) || NON_CALENDAR_TYPES.includes(e.type)) return;
                const fecha = e.date || e.startDate;
                if (fecha) cosas.push({ fecha, hora: e.time || '', titulo: e.title || '', texto: asistNorm([e.title, e.place, e.notes, e.eventType].join(' ')), donde: 'calendario' });
            });
            (studies?.subjects || []).forEach(s => {
                (s.exams || []).forEach(x => x.date && cosas.push({ fecha: x.date, hora: x.time || '', titulo: `${x.title || 'examen'} de ${s.name}`, texto: asistNorm(`examen ${x.title} ${s.name}`), donde: 'calendario' }));
                (s.assignments || []).forEach(x => x.date && cosas.push({ fecha: x.date, hora: '', titulo: `entrega de ${x.title || 'trabajo'} (${s.name})`, texto: asistNorm(`entrega trabajo ${x.title} ${s.name}`), donde: 'calendario' }));
            });
            financePro.transactions.forEach(t => t.date && cosas.push({ fecha: t.date, hora: t.hora || '', titulo: t.note || t.bankNote || 'movimiento', texto: asistNorm([t.note, t.bankNote, financeProCategoryById(t.category)?.name].join(' ')), donde: 'finanzas', importe: t.type === 'expense' ? Number(t.amount) : 0 }));
            return cosas;
        }

        function asistCoincide(texto, palabras) {
            return palabras.length && palabras.every(w => texto.includes(w) || (w.length > 4 && texto.includes(w.slice(0, -1))));
        }

        function responderPregunta(consulta) {
            const q = asistNorm(consulta).replace(/[¿?¡!.,]/g, ' ').replace(/\s+/g, ' ').trim();
            if (q.length < 6) return null;
            const hoy = todayISO();
            const pregunta = /^(cuando|cuanto|cuanta|cuantos|cuantas|que|puedo|me puedo|ultima vez)\b/.test(q) || consulta.trim().endsWith('?');
            if (!pregunta) return null;

            const permitir = q.match(/\b(?:puedo|me puedo)\s+permitir(?:me)?\b.*?(\d+(?:[.,]\d{1,2})?)/);
            if (permitir) {
                const precio = Number(permitir[1].replace(',', '.'));
                const p = asistPermitir(precio);
                return { texto: `${{ si: 'Sí, sin problema', justo: 'Sí, pero justo', no: 'Este mes, mejor no' }[p.veredicto]}: ${p.tras >= 0 ? `te quedarían unos ${financeMoney(p.tras)} hasta fin de mes` : `te faltarían unos ${financeMoney(-p.tras)}`}. Toca para ver el detalle.`, accion: () => openPuedoPermitirme(precio) };
            }

            if (/^(cuanto|cuanta)\s+(he gastado|gaste|llevo gastado|me he gastado|me gaste|gastamos|hemos gastado)\b/.test(q)) {
                const periodo = asistPeriodo(q) || asistPeriodo('este mes');
                const palabras = asistPalabras(q.replace(/^(cuanto|cuanta)\s+(he gastado|gaste|llevo gastado|me he gastado|me gaste|gastamos|hemos gastado)\s*/, ''));
                const lista = asistGasto(periodo.desde, periodo.hasta, palabras.length ? t => asistCoincide(asistNorm([t.note, t.bankNote, financeProCategoryById(t.category)?.name].join(' ')), palabras) : null);
                const total = lista.reduce((s, t) => s + Number(t.amount), 0);
                return { texto: `${financeMoney(total)}${palabras.length ? ` en ${palabras.join(' ')}` : ''} ${periodo.nombre}${lista.length ? ` (${lista.length} ${lista.length === 1 ? 'movimiento' : 'movimientos'})` : ''}.`, vista: 'finances' };
            }

            if (/^cuantas veces\b/.test(q)) {
                const periodo = asistPeriodo(q);
                const palabras = asistPalabras(q.replace(/^cuantas veces\s*/, ''));
                if (!palabras.length) return null;
                const lista = asistCosasConFecha().filter(c => c.fecha <= hoy && (!periodo || (c.fecha >= periodo.desde && c.fecha <= periodo.hasta)) && asistCoincide(c.texto, palabras));
                const dias = [...new Set(lista.map(c => c.fecha))].sort();
                if (!dias.length) return { texto: `No encuentro ${palabras.join(' ')} ${periodo ? periodo.nombre : 'en tus datos'}.` };
                const ultima = dias[dias.length - 1];
                return { texto: `${dias.length} ${dias.length === 1 ? 'vez' : 'veces'} ${periodo ? periodo.nombre : 'en total'}; la última, el ${asistFecha(ultima, true)}.`, fecha: ultima };
            }

            if (/\bultima vez\b/.test(q)) {
                const palabras = asistPalabras(q.replace(/^.*?\bultima vez\b\s*(que\s+)?/, ''));
                if (!palabras.length) return null;
                const c = asistCosasConFecha().filter(x => x.fecha <= hoy && asistCoincide(x.texto, palabras)).sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora))[0];
                if (!c) return { texto: `No encuentro ninguna vez de ${palabras.join(' ')} en tus datos.` };
                const hace = asistDias(c.fecha, hoy);
                return { texto: `El ${asistFecha(c.fecha, true)} (${hace === 0 ? 'hoy' : hace === 1 ? 'ayer' : `hace ${hace} días`}): «${c.titulo}».`, fecha: c.fecha };
            }

            if (/^cuando\s+(es|son|tengo|toca|empieza|sera|hay)\b/.test(q)) {
                const palabras = asistPalabras(q.replace(/^cuando\s+(es|son|tengo|toca|empieza|sera|hay)\s*/, '').replace(/\bcumple(anos)?\b/, 'cumple'));
                if (!palabras.length) return null;
                const cumple = palabras.includes('cumple') && entries.filter(e => e.type === 'birthday' && e.birthDate && asistCoincide(asistNorm(e.title), palabras.filter(w => w !== 'cumple')))[0];
                if (cumple) {
                    const md = cumple.birthDate.slice(5);
                    let f = `${hoy.slice(0, 4)}-${md}`;
                    if (f < hoy) f = `${Number(hoy.slice(0, 4)) + 1}-${md}`;
                    const d = asistDias(hoy, f);
                    return { texto: `El cumpleaños de ${cumple.title} es el ${asistFecha(f, true)} (${d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`}).`, fecha: f };
                }
                const c = asistCosasConFecha().filter(x => x.fecha >= hoy && x.donde === 'calendario' && asistCoincide(x.texto, palabras)).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))[0];
                if (!c) return { texto: `No veo nada próximo de ${palabras.join(' ')}.` };
                const d = asistDias(hoy, c.fecha);
                return { texto: `El ${asistFecha(c.fecha, true)}${c.hora ? ` a las ${c.hora}` : ''} (${d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`}): «${c.titulo}».`, fecha: c.fecha };
            }

            if (/^cuanto\s+(tengo|me queda|dinero tengo)\b/.test(q)) {
                return { texto: `Tienes ${financeMoney(financeProTotalBalance())} entre tus cuentas.`, vista: 'finances' };
            }
            return null;
        }

        // ------------------------------------------------------------
        //  CUMPLEAÑOS CON ANTELACIÓN: una semana antes, una tarea «pensar
        //  regalo» en tareas pendientes, una sola vez por cumpleaños y año.
        // ------------------------------------------------------------
        async function revisarCumplesRegalo() {
            if (preferenciasAvisos?.regalos === false || !Array.isArray(dayPlanner?.backlog)) return;
            const hoy = todayISO();
            let nuevas = 0;
            entries.filter(e => e.type === 'birthday' && e.birthDate).forEach(e => {
                const md = String(e.birthDate).slice(5);
                let f = `${hoy.slice(0, 4)}-${md}`;
                if (f < hoy) f = `${Number(hoy.slice(0, 4)) + 1}-${md}`;
                const d = asistDias(hoy, f);
                if (d < 1 || d > 7 || e.regaloAviso === f.slice(0, 4)) return;
                e.regaloAviso = f.slice(0, 4);
                dayPlanner.backlog.unshift({ id: `regalo_${e.id}_${f.slice(0, 4)}`, title: `Pensar regalo para ${e.title}`, notes: `cumple el ${asistFecha(f, true)}`, done: false });
                nuevas++;
            });
            if (!nuevas) return;
            render();
            try { await saveData(); } catch (err) { console.error(err); }
        }
