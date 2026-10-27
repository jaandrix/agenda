        // ============================================================
        //  RENDER: HOME
        // ============================================================
        function getBirthdaysInRange(filter) {
            const birthdays = entries.filter(e => e.type === 'birthday' && e.birthDate);
            const today = new Date();
            const range = filter === 'week' ? 7 : filter === 'month' ? 31 : filter === 'year' ? 365 : 372;
            const todayMD = today.getMonth() * 31 + today.getDate();
            return birthdays.filter(b => {
                const [, m, d] = b.birthDate.split('-').map(Number);
                const bMD = (m - 1) * 31 + d;
                let diff = bMD - todayMD;
                if (diff < 0) diff += 372;
                return diff <= range;
            }).sort((a, b) => {
                const [, ma, da] = a.birthDate.split('-').map(Number);
                const [, mb, db] = b.birthDate.split('-').map(Number);
                return (ma * 31 + da) - (mb * 31 + db);
            });
        }

        function renderTodayWidget() {
            resetDayPlannerIfNeeded();
            const today = todayISO();
            const plannerToday = [...plannerItemsForOffset(0)].sort((a, b) => String(a.time).localeCompare(String(b.time)));
            const dueToday = recurringTasksDueToday();
            const weekly = getCurrentWeeklyTasks();

            const totalCount = plannerToday.length + dueToday.length + weekly.length;
            const doneCount = plannerToday.filter(it => it.done).length + dueToday.filter(t => t.completadas?.[today]).length;

            if (!totalCount) {
                return `
                <div class="card" style="margin-bottom:16px">
                    <div class="card-title">Hoy</div>
                    <div class="finance-empty-state" style="padding:8px 0 0 0">
                        Sin nada planificado para hoy. Ve a <strong>Planificador</strong> o <strong>Tareas semanales</strong> para añadir algo.
                    </div>
                </div>`;
            }

            return `
            <div class="card" style="margin-bottom:16px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <div class="card-title">Hoy (${doneCount}/${totalCount})</div>
                    <button class="btn-secondary" style="width:auto;padding:2px 10px;font-size:11px" onclick="switchView('planner')">ver planificador.</button>
                </div>
                <div style="display:flex;flex-direction:column;gap:2px">
                    ${plannerToday.map(it => `
                        <label class="weekly-task-row">
                            <input class="weekly-task-check" type="checkbox" ${it.done ? 'checked' : ''} onchange="togglePlannerItemDone('${it.id}', 0)">
                            <span class="weekly-task-text" style="${it.done ? 'text-decoration:line-through;opacity:0.6' : ''}">${it.time ? `${escapeHtml(it.time)}, ` : ''}${escapeHtml(it.title)}</span>
                        </label>`).join('')}
                    ${dueToday.map(t => `
                        <label class="weekly-task-row">
                            <input class="weekly-task-check" type="checkbox" ${t.completadas?.[today] ? 'checked' : ''} onchange="toggleRecurringTaskDoneToday('${t.id}')">
                            <span class="weekly-task-text" style="${t.completadas?.[today] ? 'text-decoration:line-through;opacity:0.6' : ''}">↻ ${escapeHtml(t.texto)}</span>
                        </label>`).join('')}
                    ${weekly.map(t => `
                        <label class="weekly-task-row">
                            <input class="weekly-task-check" type="checkbox" onchange="completeWeeklyTask('${String(t.id).replace(/'/g, "\\'")}')">
                            <span class="weekly-task-text">${escapeHtml(t.title)}</span>
                        </label>`).join('')}
                </div>
            </div>`;
        }

        // "Tu uso en Bitácora" — cuánto se registró un día concreto, sumando
        // entradas (cualquier tipo), notas y movimientos de Finanzas PRO.
        // No pretende ser un recuento exhaustivo de cada rincón de la app,
        // solo una señal razonable de actividad real por día.
        // Antes cada día recorría todas las entradas, notas y movimientos; las
        // estadísticas lo piden para cada día desde el primer registro y el
        // radial de Home para 90 días en cada pintado. Ahora se cuenta todo
        // en una pasada y se guarda (ver invalidarCachesDerivadas()).
        let actividadPorDiaCache = null;

        function bitacoraActivityCount(dateISO) {
            const clave = todayISO() + '|' + entries.length + '|' + (notes || []).length + '|' + (financePro?.transactions?.length || 0);
            if (!actividadPorDiaCache || actividadPorDiaCache.clave !== clave) {
                const mapa = new Map();
                const sumar = d => { if (d) mapa.set(d, (mapa.get(d) || 0) + 1); };
                entries.forEach(e => { sumar(e.date); if (e.startDate !== e.date) sumar(e.startDate); });
                (Array.isArray(notes) ? notes : []).forEach(n => sumar(String(n.date || n.createdAt || '').slice(0, 10)));
                (financePro?.transactions || []).forEach(t => sumar(t.date));
                actividadPorDiaCache = { clave, mapa };
            }
            return actividadPorDiaCache.mapa.get(dateISO) || 0;
        }

        // Gráfica radial circular — un radio por día de los últimos `days`,
        // más largo cuanta más actividad hubo ese día. Cada radio lleva
        // además una guía fina hasta el borde con un punto en la punta
        // (referencia de la escala completa), visible incluso en los días
        // sin nada registrado. Círculo (no óvalo) para encajar en la
        // tarjeta cuadrada del lateral.
        function renderBitacoraActivityRadial(days) {
            days = days || 90;
            const today = new Date();
            const counts = [];
            for (let i = days - 1; i >= 0; i--) {
                const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                counts.push(bitacoraActivityCount(iso));
            }
            const maxCount = Math.max(1, ...counts);
            const cx = 100, cy = 100;
            const rInner = 30, rOuter = 92;
            const dotR = 1.4;
            const n = counts.length;
            const bars = counts.map((c, i) => {
                const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
                const cos = Math.cos(angle), sin = Math.sin(angle);
                const x1 = cx + rInner * cos, y1 = cy + rInner * sin;
                const xGuide = cx + rOuter * cos, yGuide = cy + rOuter * sin;
                const t = Math.max(0.1, c / maxCount);
                const r = rInner + (rOuter - rInner) * t;
                const xBar = cx + r * cos, yBar = cy + r * sin;
                return `<line class="radial-guia" style="--i:${i}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${xGuide.toFixed(1)}" y2="${yGuide.toFixed(1)}" stroke="var(--text-primary)" opacity="0.14" stroke-width="1"/>
                    <circle class="radial-guia" style="--i:${i}" cx="${xGuide.toFixed(1)}" cy="${yGuide.toFixed(1)}" r="${dotR}" fill="var(--text-primary)" opacity="0.28"/>
                    <line class="radial-barra" style="--i:${i}" pathLength="1" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${xBar.toFixed(1)}" y2="${yBar.toFixed(1)}" stroke="var(--text-primary)" stroke-width="2" stroke-linecap="round"/>`;
            }).join('');
            return `<svg viewBox="0 0 200 200" width="100%" height="100%" style="display:block">${bars}</svg>`;
        }

        // Iconos lineales (trazo fino, sin relleno) para las categorías de
        // Panorama (antes Centro resumen) — familia deliberadamente distinta de los iconos
        // sólidos TARJETA BITACORA del resto de la app, inspirada en un
        // lenguaje más geométrico y abstracto.
        const HOME_ICON_TODAY = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v6M12 15v6M3 12h6M15 12h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/></svg>';
        const HOME_ICON_TASKS = '<svg viewBox="0 0 24 24" fill="none"><path d="M8 6h13M8 12h13M8 18h13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="4" cy="6" r="1.6" fill="currentColor"/><circle cx="4" cy="12" r="1.6" fill="currentColor"/><circle cx="4" cy="18" r="1.6" fill="currentColor"/></svg>';
        const HOME_ICON_WEEK = '<svg viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M9 7h8v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        const HOME_ICON_UPCOMING = '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg>';
        const HOME_ICON_REVIEW = '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg>';
        const HOME_ICON_ACTIVITY = '<svg viewBox="0 0 24 24" fill="none"><path d="M3 12h4l2-6 4 12 2-6h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        const HOME_ICON_STATS = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 18V13M11 18V8M17 18V11M21 18V5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
        const HOME_ICON_PATTERNS = '<svg viewBox="0 0 24 24" fill="none"><path d="M6.6 15.6l4.1-6.2M13.4 9.4l3.4 4.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="5.5" cy="17.5" r="2.2" fill="currentColor"/><circle cx="12" cy="7.5" r="2.2" fill="currentColor"/><circle cx="18.5" cy="15.5" r="2.2" fill="currentColor"/></svg>';
        const HOME_ICON_INBOX = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 8V5h4M20 8V5h-4M4 16v3h4M20 16v3h-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 12h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
        const HOME_ICON_BACKUP = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4v11M8 11l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 19h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

        function renderHomeLauncherRow(icon, label, onClick, badge) {
            return `
                <button class="home-launcher-row" onclick="${onClick}">
                    <div class="home-launcher-icon">${icon}</div>
                    <span class="home-launcher-label">${escapeHtml(label)}</span>
                    ${badge ? `<span class="home-launcher-badge">${badge}</span>` : ''}
                </button>`;
        }

        function renderHome() {
            const hallazgos = patronesHallazgos();
            // Panorama (rediseño 24-10): las siete tarjetas abren los modales de siempre y enseñan antes lo que hay
            // dentro, con datos reales; el resto de accesos sigue debajo, en su lista.
            const rows = [
                renderHomeLauncherRow(HOME_ICON_STATS, 'estadísticas.', 'openHomeStatsModal()'),
                renderHomeLauncherRow(HOME_ICON_PATTERNS, 'patrones.', 'openHomePatternsModal()', hallazgos.length || ''),
                inbox.length ? renderHomeLauncherRow(HOME_ICON_INBOX, 'inbox.', 'openHomeInboxModal()', inbox.length) : '',
                bandejaPendiente.length ? renderHomeLauncherRow(REGISTRO_ICONO, 'propuestas.', "switchView('bandeja')", bandejaPendiente.length) : ''
            ].join('');

            return `
            <div>
                <div class="home-cabecera">
                    <div>
                        <div class="resumen-titulo vista-cab-titulo">panorama.</div>
                        <div class="vista-cab-sub" style="margin-bottom:18px">${new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}.</div>
                    </div>
                    <button class="vista-btn pano-editar" onclick="openEditarPanorama()">editar.</button>
                </div>
                <div class="pano ${panoramaEditorial() ? 'pano-editorial' : ''}">
                    ${panoramaEditorial() ? `<div class="pano-fila1">${renderPanoramaDinero()}${renderPanoramaHoy()}${renderPanoramaCuenta(hallazgos)}</div>` : renderHomeAvisos(hallazgos)}
                    ${panoramaEditorial() ? '' : renderPanoramaHoy()}
                    ${renderPanoramaTarjetas()}
                    <div class="pano-mas-cab">más.</div>
                    <div class="home-launcher-list pano-mas">${rows}</div>
                </div>
            </div>`;
        }

        const PANO_ICO_HOY = '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M26 8h10v8h28V8h10v8h12a6 6 0 0 1 6 6v64a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6V22a6 6 0 0 1 6-6h12zM18 38v44h64V38zm8 10h14v12H26z"/></svg>';
        const PANO_ICO_RELOJ = '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M50 6a44 44 0 1 1 0 88 44 44 0 0 1 0-88zm0 12a32 32 0 1 0 0 64 32 32 0 0 0 0-64zm-6 10h12v19l13 13-8 8-17-17z"/></svg>';
        const PANO_ICO_ENTREGA = '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M18 6h42l22 22v66H18zm40 8v18h18zM30 50v10h40V50zm0 18v10h28V68z"/></svg>';

        function panoTarjeta(clase, icono, titulo, sub, accion, cuerpo) {
            return `<button type="button" class="pano-card ${clase}" onclick="${accion}">
                <span class="pano-card-cab"><span class="pano-card-icono" aria-hidden="true">${icono}</span><span class="pano-card-tit"><b>${titulo}</b><small>${sub}</small></span>${panoramaEditorial() ? PANO_FLECHA : ''}</span>
                <span class="pano-card-cuerpo">${cuerpo}</span>
            </button>`;
        }

        function panoramaDatosHoy() {
            const hoy = todayISO();
            const ahora = new Date();
            const horaAhora = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
            const esEvento = e => e.type === 'event' || e.type === 'birthday' || e.type === 'travel';
            const hora = e => e.time || e.startTime || '';
            const eventos = getDayAllEntries(hoy).filter(esEvento).sort((a, b) => (hora(a) || '99').localeCompare(hora(b) || '99'));
            const tareas = plannerItemsForOffset(0);
            const pendientes = tareas.filter(t => !t.done);
            const conHora = [...eventos.filter(hora).map(e => ({ hora: hora(e), titulo: e.type === 'birthday' ? 'cumpleaños de ' + e.title : e.title })), ...pendientes.filter(t => t.time).map(t => ({ hora: t.time, titulo: t.title || t.text || '' }))]
                // Un evento puede estar también en el planificador del día: se enseña una vez.
                .filter((x, i, xs) => xs.findIndex(y => y.hora === x.hora && y.titulo.trim().toLowerCase() === x.titulo.trim().toLowerCase()) === i)
                .sort((a, b) => a.hora.localeCompare(b.hora));
            const sinHora = pendientes.filter(t => !t.time);
            const rutinas = typeof rutinasResumenHoy === 'function' ? rutinasResumenHoy() : { total: 0, hechas: 0 };
            const entrega = typeof asignaturasEnCurso === 'function' ? asignaturasEnCurso().flatMap(s => [
                ...(s.assignments || []).filter(x => !x.done && x.date && x.date >= hoy).map(x => ({ fecha:x.date, titulo:x.title || 'entrega' })),
                ...(s.exams || []).filter(x => x.date && x.date >= hoy).map(x => ({ fecha:x.date, titulo:x.title || 'examen' }))
            ]).sort((a, b) => a.fecha.localeCompare(b.fecha))[0] : null;
            return { hoy, horaAhora, eventos, pendientes, conHora, sinHora, rutinas, entrega, siguiente: conHora.find(x => x.hora >= horaAhora) || null };
        }

        function renderPanoramaHoy() {
            const d = panoramaDatosHoy();
            const cifra = (n, texto) => `<span class="pano-cifra"><b>${n}</b><small>${texto}</small></span>`;
            const filas = d.conHora.filter(x => x.hora >= d.horaAhora).slice(0, 4);
            const cuerpo = filas.length && panoramaEditorial()
                ? `<span class="pano-linea-tiempo">${filas.map((x, i) => `<span class="pano-lt-fila ${i ? '' : 'siguiente'}"><span class="pano-hora">${escapeHtml(x.hora)}</span><i aria-hidden="true"></i><span class="pano-linea-txt">${escapeHtml(x.titulo)}</span></span>`).join('')}</span>`
                : filas.length
                ? `<span class="pano-dia">${filas.map(x => `<span class="pano-dia-fila"><span class="pano-hora">${escapeHtml(x.hora)}</span><i class="ev" aria-hidden="true"></i><span class="pano-linea-txt">${escapeHtml(x.titulo)}</span></span>`).join('')}</span>`
                : `<span class="pano-vacio">No tienes nada con hora.</span>`;
            const pendiente = d.sinHora.length ? `<span class="pano-vacio">Te ${d.sinHora.length === 1 ? 'queda' : 'quedan'} ${d.sinHora.length} tarea${d.sinHora.length === 1 ? '' : 's'} sin hora.</span>` : '';
            const tareasManana = plannerItemsForOffset(1).filter(t => !t.done);
            const deManana = [...plannerEventosDia(1, tareasManana), ...tareasManana]
                .sort((x, y) => String(x.time || '99').padStart(5, '0').localeCompare(String(y.time || '99').padStart(5, '0')));
            const manana = `<span class="pano-manana"><b>mañana.</b>${deManana.length
                ? `<span class="pano-linea-tiempo">${deManana.slice(0, 3).map(x => `<span class="pano-lt-fila"><span class="pano-hora">${escapeHtml(x.time || '')}</span><i aria-hidden="true"></i><span class="pano-linea-txt">${escapeHtml(x.title || x.text || '')}</span></span>`).join('')}</span>` + (deManana.length > 3 ? `<span class="pano-vacio">y ${deManana.length - 3} más.</span>` : '')
                : '<span class="pano-vacio">Nada apuntado.</span>'}</span>`;
            const despejado = !d.conHora.length && !d.sinHora.length && !d.eventos.length && d.rutinas.total === d.rutinas.hechas ? '<span class="pano-vacio">hoy está despejado.</span>' : '';
            if (panoramaEditorial()) return `<button type="button" class="pano-card pano-hoy-estable" onclick="openTuDia()"><span class="pano-card-cab"><span class="pano-card-tit"><b>hoy.</b><small>Lo que te queda de hoy.</small></span><span class="pano-hoy-totales">${d.pendientes.length} ${d.pendientes.length === 1 ? 'tarea' : 'tareas'}<span>${d.eventos.length} ${d.eventos.length === 1 ? 'evento' : 'eventos'}</span></span>${PANO_FLECHA}</span><span class="pano-card-cuerpo">${despejado || cuerpo}${pendiente}${manana}</span></button>`;
            return panoTarjeta('pano-hoy-estable ancha', PANO_ICO_HOY, 'hoy.', 'Lo que queda de tu día.', 'openTuDia()', `${despejado || cuerpo}${pendiente}${manana}<span class="pano-cifras">${cifra(d.eventos.length, d.eventos.length === 1 ? 'evento' : 'eventos')}${cifra(d.pendientes.length, d.pendientes.length === 1 ? 'tarea para hoy' : 'tareas para hoy')}${cifra(Math.max(0, d.rutinas.total - d.rutinas.hechas), 'rutinas restantes')}</span>`);
        }

        function renderCalendarioHoy() {
            const d = panoramaDatosHoy();
            const partes = [];
            if (d.siguiente) partes.push(`${escapeHtml(d.siguiente.hora)} ${escapeHtml(d.siguiente.titulo)}`);
            if (d.pendientes.length) partes.push(`${d.pendientes.length} tarea${d.pendientes.length === 1 ? '' : 's'} pendiente${d.pendientes.length === 1 ? '' : 's'}`);
            if (d.entrega) partes.push(`${escapeHtml(d.entrega.titulo)}, ${new Date(d.entrega.fecha + 'T12:00:00').toLocaleDateString('es-ES', { day:'numeric', month:'short' }).replace('.', '')}`);
            const texto = partes.length ? partes.join(', ') + '.' : 'hoy está despejado.';
            return `<section class="cal-hoy"><b>hoy.</b><span>${texto}</span><span class="cal-hoy-acciones">${partes.length ? `<button onclick="showDayEntries('${d.hoy}')">ver el día.</button>` : ''}<button onclick="openApuntar('${d.hoy}')">apuntar.</button></span></section>`;
        }

        function renderPanoramaTarjetas() {
            const hoy = todayISO();
            const ahora = new Date(), horaAhora = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
            const esEvento = e => e.type === 'event' || e.type === 'birthday' || e.type === 'travel';
            const hora = e => e.time || e.startTime || '';
            const eventosHoy = getDayAllEntries(hoy).filter(esEvento).sort((a, b) => (hora(a) || '99').localeCompare(hora(b) || '99'));
            const tareasHoy = plannerItemsForOffset(0);
            const pendHoy = tareasHoy.filter(t => !t.done);
            const rut = typeof rutinasResumenHoy === 'function' ? rutinasResumenHoy() : { total: 0, hechas: 0 };
            const cifra = (n, etq, alerta) => `<span class="pano-cifra ${alerta ? 'alerta' : ''}"><b>${n}</b><small>${etq}</small></span>`;
            const linea = (h, t, extra = '') => `<span class="pano-linea"><span class="pano-hora">${escapeHtml(h || 'todo el día')}</span><span class="pano-linea-txt">${escapeHtml(t)}</span>${extra}</span>`;
            const vacio = t => `<span class="pano-vacio">${t}</span>`;

            // hoy.
            const siguientes = eventosHoy.filter(e => !hora(e) || hora(e) >= horaAhora).slice(0, 3);
            const cHoy = `${siguientes.length ? `<span class="pano-tl">${siguientes.map(e => `<span class="pano-tl-fila"><span class="pano-hora">${escapeHtml(hora(e) || 'todo el día')}</span><i aria-hidden="true"></i><span class="pano-linea-txt">${escapeHtml(e.type === 'birthday' ? 'cumpleaños de ' + e.title : e.title)}</span></span>`).join('')}</span>` : vacio(eventosHoy.length ? 'Ya ha pasado todo lo de hoy.' : 'Nada en el calendario hoy.')}
                <span class="pano-cifras">${cifra(eventosHoy.length, eventosHoy.length === 1 ? 'evento' : 'eventos')}${cifra(pendHoy.length, pendHoy.length === 1 ? 'tarea' : 'tareas')}${rut.total ? cifra(rut.total - rut.hechas, rut.total - rut.hechas === 1 ? 'rutina' : 'rutinas') : ''}</span>`;

            // tareas.
            const sinDia = (dayPlanner.backlog || []).filter(t => !t.done);
            const arrastradas = pendHoy.filter(t => t.arrastrado);
            const pendientes = [...pendHoy, ...sinDia];
            const prio = k => pendientes.filter(t => t.prioridad === k).length;
            const primeras = [...pendientes].sort((a, b) => ({ alta: 0, media: 1, baja: 2 }[a.prioridad] ?? 3) - ({ alta: 0, media: 1, baja: 2 }[b.prioridad] ?? 3)).slice(0, 3);
            const cTareas = `${primeras.length ? `<span class="pano-tareas">${primeras.map(t => `<span class="pano-tarea"><i class="pano-prio ${t.prioridad || ''}" aria-hidden="true"></i><span class="pano-linea-txt">${escapeHtml(t.title || t.text || '')}</span></span>`).join('')}</span>` : vacio('Nada pendiente. Bien.')}
                ${prio('alta') + prio('media') + prio('baja') ? `<span class="pano-prioridades">${[['alta', 'alta'], ['media', 'media'], ['baja', 'baja']].filter(([k]) => prio(k)).map(([k, t]) => `<span><i class="pano-prio ${k}" aria-hidden="true"></i>${prio(k)} ${t}</span>`).join('')}</span>` : ''}
                <span class="pano-cifras">${cifra(pendientes.length, pendientes.length === 1 ? 'pendiente' : 'pendientes')}<span class="pano-tareas-contexto">${arrastradas.length ? `${arrastradas.length === 1 ? 'atrasada' : arrastradas.length + ' atrasadas'}${pendHoy.length ? ' y ' : ''}` : ''}${pendHoy.length ? `${pendHoy.length === 1 ? 'prevista' : pendHoy.length + ' previstas'} para hoy.` : ''}</span></span>`;

            // tu día.
            const conHora = [...eventosHoy.filter(hora).map(e => ({ h: hora(e), t: e.title, ev: true })), ...tareasHoy.filter(t => t.time).map(t => ({ h: t.time, t: t.title, hecha: t.done }))]
                .sort((a, b) => a.h.localeCompare(b.h)).slice(0, 5);
            const cDia = conHora.length ? `<span class="pano-dia">${conHora.map(x => `<span class="pano-dia-fila ${x.hecha ? 'hecha' : ''} ${x.h < horaAhora ? 'pasada' : ''}"><span class="pano-hora">${x.h}</span><i class="${x.ev ? 'ev' : ''}" aria-hidden="true"></i><span class="pano-linea-txt">${escapeHtml(x.t)}</span></span>`).join('')}</span>` : vacio('Hoy no tienes nada con hora.');

            // esta semana.
            const lunes = new Date(hoy + 'T12:00:00'); lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
            const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(lunes); d.setDate(d.getDate() + i); const iso = isoLocal(d); return { iso, ev: getDayAllEntries(iso).filter(esEvento).length, ta: mobileDiaPlanner(iso).length }; });
            const maxDia = Math.max(1, ...dias.map(d => d.ev + d.ta));
            const totEv = dias.reduce((n, d) => n + d.ev, 0), totTa = dias.reduce((n, d) => n + d.ta, 0);
            const cSemana = panoramaEditorial() ? panoramaCurvaSemana(dias, hoy, totEv, totTa, cifra) : `<span class="pano-semana" role="img" aria-label="${dias.map((d, i) => `${['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][i]} ${d.ev + d.ta}`).join(', ')}">${dias.map((d, i) => `<span class="pano-sem-dia ${d.iso === hoy ? 'hoy' : ''}"><span class="pano-sem-barra"><i class="ta" style="height:${d.ta / maxDia * 100}%"></i><i class="ev" style="height:${d.ev / maxDia * 100}%"></i></span><small>${'LMXJVSD'[i]}</small><em>${d.ev + d.ta || ''}</em></span>`).join('')}</span>
                <span class="pano-cifras">${cifra(totEv, totEv === 1 ? 'evento' : 'eventos')}${cifra(totTa, totTa === 1 ? 'tarea' : 'tareas')}</span>`;

            // tu mes.
            const h0 = new Date(hoy + 'T12:00:00'), y = h0.getFullYear(), m = h0.getMonth();
            const huecos = (new Date(y, m, 1).getDay() + 6) % 7, nDias = new Date(y, m + 1, 0).getDate();
            let conCosas = 0;
            const puntos = [...Array(huecos).fill('<i class="fuera"></i>'), ...Array.from({ length: nDias }, (_, k) => {
                const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(k + 1).padStart(2, '0')}`;
                const n = mobileOcupacionDia(iso);
                if (n) conCosas++;
                return `<i class="${n >= 3 ? 'mucho' : n ? 'algo' : ''} ${iso === hoy ? 'hoy' : ''}" title="${k + 1}: ${n}"></i>`;
            })].join('');
            const nombreMes = h0.toLocaleDateString('es-ES', { month: 'long' });
            const cMes = `<span class="pano-mes"><span class="pano-mes-puntos">${puntos}</span><span class="pano-mes-ley"><span><i class="mucho"></i>3 o más cosas</span><span><i class="algo"></i>1 o 2</span><span><i></i>libre</span><b>${conCosas} de ${nDias} días de ${nombreMes} con algo.</b></span></span>`;

            // próximamente.
            const prox = [];
            for (let k = 1; k <= 30 && prox.length < 3; k++) {
                const d = new Date(hoy + 'T12:00:00'); d.setDate(d.getDate() + k);
                const iso = isoLocal(d);
                getDayAllEntries(iso).filter(esEvento).filter(e => !e.linkedKind && !/^(examen|trabajo|entrega)\b/i.test(e.title || '')).forEach(e => { if (prox.length < 3 && !prox.some(x => x.e.id === e.id)) prox.push({ iso, e }); });
            }
            const cProx = prox.length ? prox.map(({ iso, e }) => {
                const d = new Date(iso + 'T12:00:00');
                const tipo = e.type === 'travel' ? 'viaje.' : e.type === 'birthday' ? 'cumple.' : '';
                return `<span class="pano-prox"><span class="pano-fecha"><small>${['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d.getDay()]}</small><b>${d.getDate()} ${d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}</b></span><span class="pano-linea-txt">${escapeHtml(e.type === 'birthday' ? e.title : e.title)}</span>${tipo ? `<span class="pano-tipo">${tipo}</span>` : ''}</span>`;
            }).join('') : vacio('Nada en los próximos 30 días.');

            // entregas.
            const entregas = typeof asignaturasEnCurso === 'function' && apartadoVisible('studies') ? asignaturasEnCurso().flatMap(s => [
                ...(s.assignments || []).filter(x => !x.done && !(x.grade !== '' && x.grade != null) && x.date).map(x => ({ x, s, tipo: 'trabajo' })),
                ...(s.exams || []).filter(x => x.date && x.date >= hoy && !(x.grade !== '' && x.grade != null)).map(x => ({ x, s, tipo: 'examen' })),
            ]).sort((a, b) => (a.x.date + (a.x.time || '99:99')).localeCompare(b.x.date + (b.x.time || '99:99'))) : null;
            const deClassroom = entregas ? entregas.filter(e => e.x.classroomId).length : 0;
            const cEntregas = entregas && entregas.length ? `${entregas.slice(0, 4).map(({ x, s, tipo }) => {
                const d = new Date(x.date + 'T12:00:00');
                const tarde = x.date < hoy;
                return `<span class="pano-linea ${tarde ? 'tarde' : ''}"><span class="pano-hora">${tarde ? 'vencido' : x.date === hoy ? 'hoy' : `${['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d.getDay()]} ${d.getDate()}`}${x.time ? ' ' + escapeHtml(x.time) : ''}</span><span class="pano-linea-txt">${escapeHtml(x.title || tipo)}<small>${escapeHtml(s.name)}${tipo === 'examen' ? ', examen' : ''}</small></span></span>`;
            }).join('')}${entregas.length > 4 ? `<span class="pano-resto">y ${entregas.length - 4} más.</span>` : ''}` : vacio('Nada pendiente de entregar.');

            // revisión semanal.
            const hace7 = new Date(hoy + 'T12:00:00'); hace7.setDate(hace7.getDate() - 6);
            const desde = isoLocal(hace7);
            const hechas7 = entries.filter(e => /^(planner_done_|recurring_done_)/.test(e.id || '') && e.date >= desde && e.date <= hoy).length;
            const diasRut = new Set(); habits.forEach(hb => Object.keys(hb.completadas || {}).forEach(d => { if (d >= desde && d <= hoy && hb.completadas[d]) diasRut.add(d); }));
            const objetivos = entries.filter(e => e.type === 'goal' && e.status !== 'completed' && e.status !== 'Completado').length;
            const barra = (v, t) => `<i class="pano-barra" aria-hidden="true"><i style="width:${Math.round(Math.min(1, t ? v / t : 0) * 100)}%"></i></i>`;
            const cRev = `<span class="pano-cifras pano-rev">
                <span class="pano-cifra"><b>${hechas7}</b><small>tareas hechas en 7 días</small></span>
                <span class="pano-cifra"><b>${diasRut.size}/7</b><small>días con rutinas</small>${barra(diasRut.size, 7)}</span>
                ${objetivos ? cifra(objetivos, objetivos === 1 ? 'objetivo en curso' : 'objetivos en curso') : ''}</span><span class="pano-revision-accion">hacer revisión.</span>`;

            // Tarjetas que se pueden añadir desde «editar.».
            const cDinero = () => {
                if (!(financePro.transactions || []).length) return vacio('Aún no hay movimientos.');
                const mes = financeProMonthTotals(hoy.slice(0, 7));
                const dinero = n => `${Math.round(n).toLocaleString('es-ES')} €`;
                return `<span class="pano-cifras">${cifra(dinero(mes.expense), 'gastado este mes')}${cifra(dinero(mes.income), 'ingresado')}${cifra(dinero(financeEfectivoActual()), 'en tus cuentas')}</span>`;
            };
            const cRutinas = () => {
                const deHoy = habits.filter(h => h.activo !== false && rutinaToca(h, hoy));
                if (!deHoy.length) return vacio('Hoy no toca ninguna rutina.');
                return `<span class="pano-tareas">${deHoy.slice(0, 4).map(h => `<span class="pano-tarea ${h.completadas?.[hoy] ? 'hecha' : ''}"><i class="pano-prio" aria-hidden="true"></i><span class="pano-linea-txt">${escapeHtml(h.texto)}</span></span>`).join('')}</span>
                    <span class="pano-cifras">${cifra(`${rut.hechas}/${rut.total}`, 'hechas hoy')}</span>`;
            };
            const cViaje = () => {
                const v = entries.filter(e => e.type === 'travel' && e.startDate && (e.endDate || e.startDate) >= hoy).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
                if (!v) return vacio('Ningún viaje a la vista.');
                const faltan = Math.round((new Date(v.startDate + 'T12:00:00') - new Date(hoy + 'T12:00:00')) / 864e5);
                const f = iso => { const d = new Date(iso + 'T12:00:00'); return `${d.getDate()} ${d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}`; };
                return `<span class="pano-linea"><span class="pano-hora">${f(v.startDate)}${v.endDate && v.endDate !== v.startDate ? ' a ' + f(v.endDate) : ''}</span><span class="pano-linea-txt">${escapeHtml(v.title || v.destination || 'viaje')}</span></span>
                    <span class="pano-cifras">${faltan > 0 ? cifra(faltan, faltan === 1 ? 'día para irte' : 'días para irte') : cifra('ya', 'estás de viaje')}</span>`;
            };
            const cDespensa = () => {
                const pend = compraListaActual().items.filter(i => !i.hecho);
                const platos = datosCompra().plan[hoy] || [];
                return `${pend.length ? `<span class="pano-tareas">${pend.slice(0, 4).map(i => `<span class="pano-tarea"><i class="pano-prio" aria-hidden="true"></i><span class="pano-linea-txt">${escapeHtml(i.texto)}</span></span>`).join('')}</span>` : vacio('La lista está vacía.')}
                    <span class="pano-cifras">${cifra(pend.length, 'en la lista')}${cifra(platos.length, platos.length === 1 ? 'plato hoy' : 'platos hoy')}</span>`;
            };

            const t = {
                dia: [PANO_ICO_RELOJ, 'Tu jornada, hora por hora.', 'openTuDia()', () => cDia],
                hoy: [PANO_ICO_HOY, 'Lo que te queda de hoy.', 'openHomeTodayModal()', () => cHoy, 'hoy'],
                entregas: [PANO_ICO_ENTREGA, 'Por fecha de entrega.', "switchView('studies')", () => cEntregas],
                tareas: [HOME_ICON_TASKS, 'Lo que tienes pendiente.', 'openHomeTasksModal()', () => cTareas],
                semana: [HOME_ICON_WEEK, 'Cuánto tienes cada día.', 'openResumenSemana()', () => cSemana],
                mes: [HOME_ICON_STATS, `${nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)}, de un vistazo.`, 'openTuMes()', () => cMes],
                prox: [HOME_ICON_UPCOMING, 'Después de hoy.', 'openHomeUpcomingModal()', () => cProx],
                dinero: [PANO_ICO_DINERO, 'Cómo va el mes.', "switchView('finances')", cDinero],
                rutinas: [PANO_ICO_RUTINAS, 'Las que tocan hoy.', "switchView('habits')", cRutinas],
                viaje: [PANO_ICO_VIAJE, 'Cuánto falta.', "switchView('travels')", cViaje],
                despensa: [PANO_ICO_DESPENSA, 'Lo que falta en casa.', "switchView('compra')", cDespensa],
                revision: [HOME_ICON_REVIEW, 'Cierra la semana y prepara la siguiente.', 'openHomeReviewModal()', () => cRev],
            };
            const ids = panoramaElegidas(!!entregas);
            if (panoramaEditorial()) ['semana', 'mes', 'entregas', 'tareas', 'revision', 'prox'].forEach(id => { if (!ids.includes(id) && (id !== 'entregas' || entregas)) ids.push(id); });
            // Orden de la referencia: semana, mes y entregas; luego tareas, revisión y próximamente (cuatro columnas
            // por fila, con la semana y la revisión a doble ancho). Lo demás que se elija va detrás.
            const ORDEN_ED = ['semana', 'mes', 'entregas', 'tareas', 'revision', 'prox'];
            if (panoramaEditorial()) ids.sort((a, b) => (ORDEN_ED.includes(a) ? ORDEN_ED.indexOf(a) : 99) - (ORDEN_ED.includes(b) ? ORDEN_ED.indexOf(b) : 99));
            if (!ids.length) return `<div class="vista-vacio pano-sin-tarjetas"><p>No has elegido más tarjetas.</p><button class="vista-btn" onclick="openEditarPanorama()">editar panorama.</button></div>`;
            return `<div class="pano-grid">${ids.map((id, n) => {
                const [icono, sub, accion, cuerpo, clase = ''] = t[id];
                // La revisión, si va la última, ocupa lo que quede de la fila.
                const resto = 3 - (ids.length - 1) % 3;
                const ancho = !panoramaEditorial() && id === 'revision' && n === ids.length - 1 ? (resto === 3 ? 'ancha' : resto === 2 ? 'doble' : '') : '';
                return panoTarjeta(`${id} ${clase} ${ancho} ${panoramaEditorial() && (id === 'semana' || id === 'revision') ? 'ed-doble' : ''}`, icono, PANO_NOMBRES[id], sub, accion, cuerpo());
            }).join('')}</div>`;
        }

        const PANO_ICO_DINERO = '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M50 6a44 44 0 1 1 0 88 44 44 0 0 1 0-88zm-6 16v8H32v24h24v6H32v12h12v8h12v-8h12V44H44v-6h24V26H56v-4z"/></svg>';
        const PANO_ICO_RUTINAS = '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M12 12h76v76H12zm12 12v52h52V24zm6 24 8-8 8 8 16-16 8 8-24 24z"/></svg>';
        const PANO_ICO_VIAJE = '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M45 6h10l5 32 32 14v12l-32-8-3 24 11 8v8l-18-5-18 5v-8l11-8-3-24-32 8V52l32-14z"/></svg>';
        const PANO_ICO_DESPENSA = '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M30 30v-6a20 20 0 0 1 40 0v6h18l-6 64H18l-6-64zm10 0h20v-6a10 10 0 0 0-20 0z"/></svg>';

        // Tarjetas de Panorama: el usuario elige cuáles y en qué orden (apartadosConfig.panorama); sin elección,
        // las de su perfil. Las que dependen de un apartado apagado no salen aunque estén elegidas.
        const PANO_NOMBRES = { entregas: 'entregas.', tareas: 'tareas.', semana: 'esta semana.', mes: 'tu mes.', prox: 'próximamente.', dinero: 'dinero.', rutinas: 'rutinas.', viaje: 'próximo viaje.', despensa: 'despensa.', revision: 'revisión semanal.' };
        function panoramaPorPerfil() {
            return configApartados().perfil === 'trabajador'
                ? ['tareas', 'dinero', 'prox', 'semana', 'revision']
                : ['tareas', 'entregas', 'prox', 'semana', 'rutinas', 'revision'];
        }
        function panoramaDisponible(id, hayEntregas) {
            if (id === 'entregas') return hayEntregas;
            if (id === 'revision') return [0, 1, 5, 6].includes(new Date().getDay());
            if (id === 'dinero') return apartadoVisible('finances');
            if (id === 'despensa') return apartadoVisible('compra');
            if (id === 'viaje') return apartadoVisible('travels') && entries.some(e => e.type === 'travel' && e.startDate && (e.endDate || e.startDate) >= todayISO());
            if (id === 'rutinas') return apartadoVisible('habits');
            return !!PANO_NOMBRES[id];
        }
        function panoramaElegidas(hayEntregas) {
            const c = configApartados().panorama;
            const ids = Array.isArray(c) ? c.map(id => id === 'dia' ? 'hoy' : id).filter(id => id !== 'hoy') : panoramaPorPerfil();
            return [...new Set(ids)].filter(id => panoramaDisponible(id, hayEntregas));
        }

        let panoramaBorrador = null;
        function openEditarPanorama() {
            const c = configApartados().panorama;
            const elegidas = Array.isArray(c) ? c : panoramaPorPerfil();
            const hayEntregas = typeof asignaturasEnCurso === 'function' && apartadoVisible('studies');
            const todas = Object.keys(PANO_NOMBRES).filter(id => panoramaDisponible(id, hayEntregas));
            panoramaBorrador = [...elegidas.filter(id => todas.includes(id)).map(id => ({ id, on: true })), ...todas.filter(id => !elegidas.includes(id)).map(id => ({ id, on: false }))];
            showModal(`<div class="modal-title">editar panorama.</div>
                <p class="vista-cab-sub" style="margin:0 0 12px">Elige qué tarjetas ves y en qué orden.</p>
                <div id="pano-ed-lista">${renderEditarPanoramaLista()}</div>
                <div class="pano-ed-acciones"><button class="vista-btn" onclick="panoramaVolverAlPerfil()">restaurar para mi perfil.</button><button class="btn-modal-primary" onclick="guardarPanorama()">guardar.</button></div>`);
            activarArrastrePanorama();
        }
        function renderEditarPanoramaLista() {
            const b = panoramaBorrador;
            const frase = { tareas:'Tus pendientes prioritarios.', entregas:'Trabajos y exámenes por fecha.', prox:'Los próximos acontecimientos.', semana:'La carga de cada día.', mes:'La densidad del mes.', dinero:'El balance de este mes.', rutinas:'Lo que toca hoy.', viaje:'Tu siguiente viaje.', despensa:'Lo que falta en casa.', revision:'Una acción para cerrar la semana.' };
            const fino = matchMedia('(pointer: fine)').matches;
            const filas = on => b.map((x, i) => ({ x, i })).filter(o => o.x.on === on).map(({ x, i }) => `<div class="pano-ed-fila ${on ? '' : 'apagada'}" data-pano-indice="${i}" ${on && fino ? 'draggable="true"' : ''}>
                <label><input type="checkbox" ${on ? 'checked' : ''} onchange="panoramaBorrador[${i}].on = this.checked; document.getElementById('pano-ed-lista').innerHTML = renderEditarPanoramaLista(); activarArrastrePanorama()"><span><b>${PANO_NOMBRES[x.id]}</b><small>${frase[x.id] || ''}</small></span></label>
                ${on ? `<span class="pano-ed-mover"><button type="button" aria-label="subir" ${i ? '' : 'disabled'} onclick="panoramaMover(${i}, -1)"><i class="ico ico-der pano-ed-sube"></i></button><button type="button" aria-label="bajar" ${i < b.length - 1 ? '' : 'disabled'} onclick="panoramaMover(${i}, 1)"><i class="ico ico-der pano-ed-baja"></i></button></span>` : ''}
            </div>`).join('');
            return `<div class="pano-ed-titulo">activas.</div>${filas(true) || '<p class="pano-ed-vacio">No has elegido más tarjetas.</p>'}<div class="pano-ed-titulo">disponibles.</div>${filas(false) || '<p class="pano-ed-vacio">Ya están todas activas.</p>'}`;
        }
        function panoramaMover(i, d) {
            const b = panoramaBorrador, j = i + d;
            if (j < 0 || j >= b.length) return;
            [b[i], b[j]] = [b[j], b[i]];
            document.getElementById('pano-ed-lista').innerHTML = renderEditarPanoramaLista();
            activarArrastrePanorama();
        }
        function activarArrastrePanorama() {
            if (!matchMedia('(pointer: fine)').matches) return;
            document.querySelectorAll('#pano-ed-lista .pano-ed-fila[draggable="true"]').forEach(fila => {
                fila.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', fila.dataset.panoIndice); fila.classList.add('arrastrando'); });
                fila.addEventListener('dragend', () => fila.classList.remove('arrastrando'));
                fila.addEventListener('dragover', e => e.preventDefault());
                fila.addEventListener('drop', e => {
                    e.preventDefault();
                    const desde = Number(e.dataTransfer.getData('text/plain')), hasta = Number(fila.dataset.panoIndice);
                    if (!Number.isInteger(desde) || desde === hasta) return;
                    const [movida] = panoramaBorrador.splice(desde, 1);
                    panoramaBorrador.splice(hasta, 0, movida);
                    document.getElementById('pano-ed-lista').innerHTML = renderEditarPanoramaLista();
                    activarArrastrePanorama();
                });
            });
        }
        function guardarPanorama() {
            const ids = panoramaBorrador.filter(x => x.on).map(x => x.id);
            closeModal();
            guardarConfigApartados({ panorama: ids });
        }
        function panoramaVolverAlPerfil() {
            closeModal();
            guardarConfigApartados({ panorama: null });
        }

        function openHomeTodayModal() {
            const today = todayISO();
            const todayEntries = entries.filter(e => e.date === today || e.startDate === today);
            showModal(`
                <div class="modal-title">hoy.</div>
                <div class="finance-modal-note" style="margin-bottom:10px">${todayEntries.length} entrada${todayEntries.length === 1 ? '' : 's'} registrada${todayEntries.length === 1 ? '' : 's'} hoy.</div>
                ${renderTodayWidget()}
            `);
        }

        function openHomeUpcomingModal() {
            const rangeBirthdays = getBirthdaysInRange('month');
            const today = todayISO();
            const upcoming = entries.filter(e => {
                if (e.type === 'travel' && e.startDate && e.startDate > today) return true;
                if (e.type === 'project' && e.endDate && e.endDate > today) return true;
                if (e.type === 'work' && e.endDate && e.endDate > today) return true;
                if (e.type === 'event' && e.date && e.date > today) return true;
                return false;
            }).sort((a, b) => {
                const dateA = a.startDate || a.endDate || a.date || '';
                const dateB = b.startDate || b.endDate || b.date || '';
                return dateA.localeCompare(dateB);
            }).slice(0, 8);

            showModal(`
                <div class="modal-title">próximamente.</div>
                ${rangeBirthdays.length ? `
                    <div style="font-weight:600;font-size:13px;margin:4px 0 8px 0;color:var(--text-primary)">Cumpleaños</div>
                    ${rangeBirthdays.map(b => `
                        <div class="entry-item">
                            <div class="entry-color-dot" style="background:#ec4899"></div>
                            <div class="entry-info">
                                <div class="entry-title">cumpleaños de ${escapeHtml(b.title)}</div>
                                <div class="entry-meta">${b.birthDate.slice(8,10)}/${b.birthDate.slice(5,7)}</div>
                            </div>
                        </div>`).join('')}
                ` : ''}
                ${upcoming.length ? `
                    <div style="font-weight:600;font-size:13px;margin:16px 0 8px 0;color:var(--text-primary)">Fechas próximas</div>
                    ${upcoming.map(e => {
                        const cat = categories.find(c => c.id === e.categoryId);
                        const color = cat?.color || 'var(--text-secondary)';
                        const dateInfo = e.startDate || e.endDate || e.date || '';
                        return `
                            <div class="entry-item" onclick="closeModal();switchView('calendar');showDayEntries('${dateInfo}')">
                                <div class="entry-color-dot" style="background:${color}"></div>
                                <div class="entry-info">
                                    <div class="entry-title">${escapeHtml(e.title)}</div>
                                    <div class="entry-meta">${dateInfo}</div>
                                </div>
                            </div>`;
                    }).join('')}
                ` : ''}
                ${(!rangeBirthdays.length && !upcoming.length) ? `<div style="font-size:12px;color:var(--text-secondary)">Nada próximo registrado por ahora.</div>` : ''}
            `);
        }

        // Primera fecha con algo registrado (entrada, nota o movimiento de
        // Finanzas PRO) — punto de partida para contar "días" de uso real.
        function bitacoraFirstActivityDate() {
            const dates = [];
            entries.forEach(e => { if (e.date) dates.push(e.date); if (e.startDate) dates.push(e.startDate); });
            (notes || []).forEach(n => { const d = String(n.date || n.createdAt || '').slice(0, 10); if (d) dates.push(d); });
            (financePro?.transactions || []).forEach(t => { if (t.date) dates.push(t.date); });
            dates.sort();
            return dates[0] || todayISO();
        }

        // Días cotizados: la unión de los periodos de todos los empleos. Dos
        // trabajos a la vez no cotizan el doble; antes se sumaban.
        function diasCotizados() {
            const tramos = entries.filter(e => e.type === 'work' && e.startDate)
                .map(e => [e.startDate, (e.endDate && e.endDate < todayISO()) ? e.endDate : todayISO()])
                .filter(([a, b]) => a <= b).sort((x, y) => x[0].localeCompare(y[0]));
            let total = 0, ini = null, fin = null;
            tramos.forEach(([a, b]) => {
                if (fin && a <= fin) { if (b > fin) fin = b; return; }
                if (ini) total += countWorkingDays(ini, fin);
                ini = a; fin = b;
            });
            if (ini) total += countWorkingDays(ini, fin);
            return total;
        }

        function openHomeStatsModal() {
            const subsTotal = entries.filter(e => e.type === 'subscription' && e.active !== false).reduce((s, e) => s + (e.amount || 0), 0);
            const fixedTotal = entries.filter(e => e.type === 'fixed_expense' && e.active !== false).reduce((s, e) => s + (e.amount || 0), 0);
            const activeProjects = entries.filter(e => e.type === 'project' && e.status !== 'Completado');
            const workDays = diasCotizados();

            // días: nº de días distintos con algo registrado desde la
            // primera entrada · entradas: total de entries · acciones:
            // entries + notas + movimientos de Finanzas PRO — misma idea
            // que "Days / Participants / Actions" de la referencia.
            const firstDate = new Date(bitacoraFirstActivityDate());
            const totalDaySpan = Math.max(1, Math.round((new Date(todayISO()) - firstDate) / 86400000) + 1);
            let activeDays = 0;
            for (let i = 0; i < totalDaySpan; i++) {
                const d = new Date(firstDate); d.setDate(d.getDate() + i);
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                if (bitacoraActivityCount(iso) > 0) activeDays++;
            }
            const totalActions = entries.length + (notes || []).length + (financePro?.transactions || []).length;
            // "entradas" sin los registros automáticos (tarea completada, etc.).
            const entradasPropias = entries.filter(e => !isCalendarLogEntry(e)).length;
            const eventos = entries.filter(e => e.type === 'event' && !isCalendarLogEntry(e)).length;
            const tarjetasEstudio = (typeof estudiar !== 'undefined' && estudiar?.tarjetas?.length) || 0;

            const stats = [
                [entries.filter(e=>e.type==='book').length, 'libros'], [entries.filter(e=>e.type==='movie').length, 'películas'],
                [entries.filter(e=>e.type==='series').length, 'series'], [entries.filter(e=>e.type==='game').length, 'videojuegos'],
                [entries.filter(e=>e.type==='travel').length, 'viajes'], [activeProjects.length, 'proyectos activos'],
                [notes.length, 'notas'], [entries.filter(e=>e.type==='goal').length, 'objetivos'],
                [entries.filter(e=>e.type==='place').length, 'lugares'], [entries.filter(e=>e.type==='birthday').length, 'cumpleaños'],
                [eventos, 'eventos'], [(habits || []).filter(h => h.activo !== false).length, 'rutinas activas'],
                [(financePro?.transactions || []).length, 'movimientos'],
                ...(tarjetasEstudio ? [[tarjetasEstudio, 'tarjetas de estudio']] : []),
                [workDays, 'días cotizados'], [financeMoney(subsTotal), 'suscripciones/mes'],
                [financeMoney(fixedTotal), 'gastos fijos/mes']
            ];

            showModal(`
                <div class="modal-title">estadísticas.</div>
                <div class="home-stats-headline">
                    <div class="home-stats-headline-item"><div class="num" id="home-stats-days" data-value="${activeDays}">0</div><div class="txt">días</div></div>
                    <div class="home-stats-headline-item"><div class="num" id="home-stats-entries" data-value="${entradasPropias}">0</div><div class="txt">entradas</div></div>
                    <div class="home-stats-headline-item"><div class="num" id="home-stats-actions" data-value="${totalActions}">0</div><div class="txt">acciones</div></div>
                </div>
                <div class="home-stats-chart-label">actividad de los últimos 30 días.</div>
                <div id="home-stats-chart">${renderHomeStatsChart(30)}</div>
                <div class="home-stats-chart-label">tu estancia en bitácora.</div>
                <div class="home-stats-estancia">${renderBitacoraActivityRadial(90)}</div>
                <div class="home-stats-breakdown-label">por categoría</div>
                <div class="summary-stat-list">
                    ${stats.map(([num, txt]) => `<div class="summary-stat"><div class="num">${num}</div><div class="txt">${txt}</div></div>`).join('')}
                </div>
            `);
            ['home-stats-days', 'home-stats-entries', 'home-stats-actions'].forEach(id => {
                const el = document.getElementById(id);
                if (el) bitacoraAnimateNumber(el, Number(el.dataset.value || 0), v => Math.round(v).toLocaleString('es-ES'));
            });
            bitacoraAnimateChart(document.getElementById('home-stats-chart'));
        }

        // ============================================================
        //  PATRONES
        //  Cruza apartados que ninguna app suelta tiene juntos (gastos,
        //  hábitos, esfuerzo, planes, estudios, viajes, tareas) comparando
        //  días "con" y "sin" algo. Un hallazgo solo se muestra si pasa una
        //  prueba t de Welch (|t| >= 2) y además la diferencia es grande en
        //  la práctica — con pocos datos es muy fácil ver patrones donde
        //  solo hay casualidad, y un falso hallazgo quita credibilidad a
        //  todos los demás.
        // ============================================================
        const PATRONES_DIAS = 180;
        const PATRONES_MIN_MUESTRA = 6;
        // El alquiler cae siempre el mismo día del mes y las inversiones o
        // coleccionables son dinero que sigue siendo tuyo: meterlos haría
        // que el patrón hablara del calendario de cargos, no de ti.
        const PATRONES_GASTO_EXCLUIDO = ['cat_vivienda', 'cat_inversion_gasto', 'cat_coleccionables', 'cat_finanzas_gasto'];
        const PATRONES_DIAS_SEMANA = ['los domingos', 'los lunes', 'los martes', 'los miércoles', 'los jueves', 'los viernes', 'los sábados'];

        function patronesIso(d) { return isoLocal(d); }

        function patronesComparar(dias, cond, valor) {
            const a = [], b = [];
            dias.forEach(iso => {
                const v = valor(iso);
                if (v === null || v === undefined) return;
                const c = cond(iso);
                if (c === null || c === undefined) return;
                (c ? a : b).push(v);
            });
            if (a.length < PATRONES_MIN_MUESTRA || b.length < PATRONES_MIN_MUESTRA) return null;
            const media = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
            const varianza = (xs, m) => xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
            const ma = media(a), mb = media(b);
            const se = Math.sqrt(varianza(a, ma) / a.length + varianza(b, mb) / b.length);
            const t = se > 0 ? (ma - mb) / se : (ma === mb ? 0 : Math.sign(ma - mb) * 99);
            return { con: ma, sin: mb, n: a.length + b.length, t };
        }

        function patronesEuros(x) { return x.toLocaleString('es-ES', { maximumFractionDigits: x < 10 ? 2 : 0 }) + ' €'; }
        function patronesPct(x) { return Math.round(x * 100) + ' %'; }
        function patronesNum(x) { return x.toLocaleString('es-ES', { maximumFractionDigits: 1 }); }
        function patronesVeces(con, sin) {
            if (sin <= 0) return 'más';
            const r = con / sin;
            if (r >= 2) return patronesNum(r) + ' veces más';
            if (r >= 1) return 'un ' + Math.round((r - 1) * 100) + ' % más';
            return 'un ' + Math.round((1 - r) * 100) + ' % menos';
        }

        // Cruzar 180 días de todos los apartados cuesta más que pintar la
        // vista entera, y Home se vuelve a pintar a menudo sin que cambie
        // ningún dato: se guarda el resultado hasta el siguiente saveData()
        // (que es por donde pasa cualquier cambio) o hasta que cambie el día.
        let patronesCache = null;

        function patronesHallazgos() {
            let marcados = 0;
            (habits || []).forEach(h => { marcados += Object.keys(h.completadas || {}).length; });
            const clave = [todayISO(), entries.length, financePro?.transactions?.length || 0, (notes || []).length, marcados, Object.keys(dailyEffort || {}).length].join('|');
            if (patronesCache && patronesCache.clave === clave) return patronesCache.hallazgos;
            const hallazgos = calcularPatrones();
            patronesCache = { clave, hallazgos };
            return hallazgos;
        }

        function calcularPatrones() {
            const hoy = new Date();
            const dias = [];
            for (let i = PATRONES_DIAS; i >= 1; i--) dias.push(patronesIso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - i, 12)));
            const diaSemana = iso => new Date(iso + 'T12:00:00').getDay();

            const gasto = {};
            let primerMovimiento = null;
            if (financePro && financePro.enabled) (financePro.transactions || []).forEach(t => {
                if (!t || !t.date) return;
                const d = String(t.date).slice(0, 10);
                if (!primerMovimiento || d < primerMovimiento) primerMovimiento = d;
                if (t.type !== 'expense' || PATRONES_GASTO_EXCLUIDO.includes(t.category)) return;
                gasto[d] = (gasto[d] || 0) + (Number(t.amount) || 0);
            });
            const gastoDia = iso => (primerMovimiento && iso >= primerMovimiento) ? (gasto[iso] || 0) : null;

            const habitosVivos = (habits || []).filter(h => h && h.activo !== false).map(h => {
                const hechas = Object.keys(h.completadas || {}).filter(k => h.completadas[k]).sort();
                const creado = Number(String(h.id).split('_')[1]);
                let inicio = creado > 0 ? patronesIso(new Date(creado)) : null;
                if (hechas[0] && (!inicio || hechas[0] < inicio)) inicio = hechas[0];
                return { h, inicio };
            }).filter(x => x.inicio);
            const tasaHabitos = iso => {
                const vivos = habitosVivos.filter(x => iso >= x.inicio);
                return vivos.length ? vivos.filter(x => x.h.completadas[iso]).length / vivos.length : null;
            };

            const planes = new Set(), tareas = {};
            let primeraTarea = null;
            const tramosViaje = [], tramosTrabajo = [];
            entries.forEach(e => {
                if (!e) return;
                if (e.type === 'event' && e.date && /^(planner_done_|recurring_done_)/.test(e.id || '')) {
                    tareas[e.date] = (tareas[e.date] || 0) + 1;
                    if (!primeraTarea || e.date < primeraTarea) primeraTarea = e.date;
                } else if (e.type === 'event' && e.date && !isCalendarLogEntry(e) && !e.linkedKind) {
                    planes.add(e.date);
                } else if (e.type === 'travel' && e.startDate && e.endDate) {
                    tramosViaje.push([e.startDate, e.endDate]);
                } else if (e.type === 'work' && e.startDate) {
                    tramosTrabajo.push([e.startDate, e.endDate || '9999-12-31']);
                }
            });
            const tareasDia = iso => (primeraTarea && iso >= primeraTarea) ? (tareas[iso] || 0) : null;
            const enTramo = (tramos, iso) => tramos.some(([a, b]) => iso >= a && iso <= b);

            const semanaExamen = new Set();
            (studies?.subjects || []).forEach(s => (s.exams || []).forEach(ex => {
                if (!ex || !ex.date) return;
                const d = new Date(ex.date + 'T12:00:00');
                for (let i = 0; i < 7; i++) { semanaExamen.add(patronesIso(d)); d.setDate(d.getDate() - 1); }
            }));

            const diasNota = new Set((notes || []).filter(n => n && n.date && String(n.content || '').trim()).map(n => n.date));
            const esfuerzo = iso => dailyEffort[iso] || null;
            const conPlanes = iso => planes.has(iso);

            const okDinero = r => Math.max(r.con, r.sin) >= 3 && (r.sin === 0 || r.con / r.sin >= 1.3 || r.con / r.sin <= 0.77);
            const okTasa = r => Math.abs(r.con - r.sin) >= 0.15;
            const okEsfuerzo = r => Math.abs(r.con - r.sin) >= 0.5;
            const okConteo = r => Math.abs(r.con - r.sin) >= 0.5 && (r.sin === 0 || r.con / r.sin >= 1.3 || r.con / r.sin <= 0.77);

            const hallazgos = [];
            const anadir = (clave, r, ok, frase, etqCon, etqSin, fmt) => {
                if (!r || Math.abs(r.t) < 2 || !ok(r)) return;
                hallazgos.push({ clave, fuerza: Math.abs(r.t), frase: frase(r), etqCon, etqSin, con: r.con, sin: r.sin, fmt, n: r.n });
            };

            anadir('gasto-planes', patronesComparar(dias, conPlanes, gastoDia), okDinero,
                r => `Los días con planes gastas <b>${patronesVeces(r.con, r.sin)}</b>: ${patronesEuros(r.con)} de media frente a ${patronesEuros(r.sin)}.`,
                'con planes.', 'sin planes.', patronesEuros);

            let mejorDia = null;
            for (let dow = 0; dow < 7; dow++) {
                const r = patronesComparar(dias, iso => diaSemana(iso) === dow, gastoDia);
                if (r && r.con > r.sin && okDinero(r) && Math.abs(r.t) >= 2 && (!mejorDia || r.t > mejorDia.r.t)) mejorDia = { dow, r };
            }
            if (mejorDia) {
                const nombre = PATRONES_DIAS_SEMANA[mejorDia.dow];
                anadir('gasto-dia', mejorDia.r, okDinero,
                    r => `${nombre.charAt(0).toUpperCase() + nombre.slice(1)} gastas <b>${patronesVeces(r.con, r.sin)}</b> que el resto de la semana (${patronesEuros(r.con)} frente a ${patronesEuros(r.sin)}).`,
                    nombre.replace('los ', '') + '.', 'resto.', patronesEuros);
            }

            anadir('gasto-examen', patronesComparar(dias, iso => semanaExamen.has(iso), gastoDia), okDinero,
                r => `La semana antes de un examen gastas <b>${patronesVeces(r.con, r.sin)}</b> al día (${patronesEuros(r.con)} frente a ${patronesEuros(r.sin)}).`,
                'antes de examen.', 'resto.', patronesEuros);

            anadir('gasto-esfuerzo', patronesComparar(dias, iso => { const e = esfuerzo(iso); return e === null ? null : e >= 4 ? true : e <= 2 ? false : null; }, gastoDia), okDinero,
                r => `Los días de esfuerzo alto gastas <b>${patronesVeces(r.con, r.sin)}</b> que los días flojos (${patronesEuros(r.con)} frente a ${patronesEuros(r.sin)}).`,
                'esfuerzo 4-5.', 'esfuerzo 1-2.', patronesEuros);

            anadir('habitos-planes', patronesComparar(dias, conPlanes, tasaHabitos), okTasa,
                r => `Los días con planes cumples el <b>${patronesPct(r.con)}</b> de tus rutinas, frente al ${patronesPct(r.sin)} de un día sin planes.`,
                'con planes.', 'sin planes.', patronesPct);

            anadir('habitos-examen', patronesComparar(dias, iso => semanaExamen.has(iso), tasaHabitos), okTasa,
                r => `La semana antes de un examen cumples el <b>${patronesPct(r.con)}</b> de tus rutinas, frente al ${patronesPct(r.sin)} habitual.`,
                'antes de examen.', 'resto.', patronesPct);

            anadir('habitos-viaje', patronesComparar(dias, iso => enTramo(tramosViaje, iso), tasaHabitos), okTasa,
                r => `De viaje mantienes el <b>${patronesPct(r.con)}</b> de tus rutinas, frente al ${patronesPct(r.sin)} en casa.`,
                'de viaje.', 'en casa.', patronesPct);

            // Solo lunes a viernes: comparar días de trabajo contra fines de
            // semana mediría el fin de semana, no el trabajo.
            const diaLaborable = iso => { const d = diaSemana(iso); return (d === 0 || d === 6) ? null : enTramo(tramosTrabajo, iso); };
            anadir('habitos-trabajo', patronesComparar(dias, diaLaborable, tasaHabitos), okTasa,
                r => `Entre semana, los días que trabajas cumples el <b>${patronesPct(r.con)}</b> de tus rutinas, frente al ${patronesPct(r.sin)} los que no.`,
                'trabajando.', 'sin trabajar.', patronesPct);

            anadir('esfuerzo-habitos', patronesComparar(dias, iso => { const t = tasaHabitos(iso); return t === null ? null : t >= 0.5; }, esfuerzo), okEsfuerzo,
                r => `Cuando cumples al menos la mitad de tus rutinas, puntúas tu esfuerzo con un <b>${patronesNum(r.con)}</b> de media, frente a ${patronesNum(r.sin)}.`,
                'rutinas ≥ 50 %.', 'rutinas < 50 %.', patronesNum);

            anadir('esfuerzo-nota', patronesComparar(dias, iso => diasNota.has(iso), esfuerzo), okEsfuerzo,
                r => `Los días que escribes en tu diario puntúas tu esfuerzo con un <b>${patronesNum(r.con)}</b>, frente a ${patronesNum(r.sin)} cuando no escribes.`,
                'con nota.', 'sin nota.', patronesNum);

            anadir('tareas-planes', patronesComparar(dias, conPlanes, tareasDia), okConteo,
                r => `Los días con planes completas <b>${patronesNum(r.con)}</b> tareas de media, frente a ${patronesNum(r.sin)} un día sin planes.`,
                'con planes.', 'sin planes.', patronesNum);

            anadir('tareas-trabajo', patronesComparar(dias, diaLaborable, tareasDia), okConteo,
                r => `Entre semana, los días que trabajas completas <b>${patronesNum(r.con)}</b> tareas, frente a ${patronesNum(r.sin)} los que no.`,
                'trabajando.', 'sin trabajar.', patronesNum);

            // Parejas de hábitos: de cada par se queda solo el sentido más
            // fuerte (A→B o B→A), si no el mismo patrón saldría dos veces.
            const parejas = [];
            habitosVivos.forEach((A, i) => habitosVivos.forEach((B, j) => {
                if (i === j) return;
                const desde = A.inicio > B.inicio ? A.inicio : B.inicio;
                const r = patronesComparar(dias, iso => iso < desde ? null : !!A.h.completadas[iso], iso => iso < desde ? null : (B.h.completadas[iso] ? 1 : 0));
                if (r && Math.abs(r.t) >= 2 && okTasa(r)) parejas.push({ clave: [A.h.id, B.h.id].sort().join('|'), A, B, r });
            }));
            parejas.sort((x, y) => Math.abs(y.r.t) - Math.abs(x.r.t));
            const vistas = new Set();
            parejas.filter(p => !vistas.has(p.clave) && vistas.add(p.clave)).slice(0, 2).forEach(({ A, B, r }) => {
                const a = escapeHtml(A.h.texto), b = escapeHtml(B.h.texto);
                anadir('habitos-pareja', r, okTasa,
                    r => r.con > r.sin
                        ? `Los días que cumples «${a}» también cumples «${b}» el <b>${patronesPct(r.con)}</b> de las veces; si no, solo el ${patronesPct(r.sin)}.`
                        : `Los días que cumples «${a}», «${b}» baja al <b>${patronesPct(r.con)}</b> (frente al ${patronesPct(r.sin)}).`,
                    'con ' + A.h.texto.replace(/\.+$/, '') + '.', 'sin ' + A.h.texto.replace(/\.+$/, '') + '.', patronesPct);
            });

            return hallazgos.sort((x, y) => y.fuerza - x.fuerza);
        }

        // Rota entre los tres hallazgos más fuertes una vez por semana, para
        // que Home no repita siempre la misma frase pero tampoco cambie a
        // cada render.
        function renderPatronDestacado(hallazgos) {
            if (!hallazgos.length) return '';
            const semana = Math.floor((Date.now() / 86400000 + 3) / 7);
            const h = hallazgos[semana % Math.min(3, hallazgos.length)];
            return `<button class="home-pattern-line" onclick="openHomePatternsModal()"><span class="home-pattern-kicker">esta semana.</span>${h.frase}</button>`;
        }

        // ============================================================
        //  AVISOS
        //  Los patrones aplicados a lo que viene: se avisa antes, cuando
        //  todavía se puede cambiar algo. Comparten el hueco de la frase
        //  "esta semana." en Home (como mucho dos, y si no hay ninguno se
        //  vuelve a ver el patrón semanal) para no añadir otro bloque más.
        // ============================================================
        function avisoCuando(iso) {
            const dias = Math.round((new Date(iso + 'T12:00:00') - new Date(todayISO() + 'T12:00:00')) / 86400000);
            if (dias === 0) return 'hoy';
            if (dias === 1) return 'mañana';
            return 'el ' + new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long' });
        }

        // Proyección de gasto a fin de mes: lo ya gastado + lo que se gastó
        // de media en el resto de días del mes en los tres meses anteriores
        // (así el alquiler o la nómina, que caen siempre en las mismas
        // fechas, no deforman el ritmo) + los gastos programados que faltan.
        function financeProProyeccionMes() {
            if (!financePro || !financePro.enabled) return null;
            const hoy = new Date();
            const dia = hoy.getDate();
            if (dia < 7) return null;
            const noEsGasto = ['cat_inversion_gasto', 'cat_coleccionables'];
            const gastos = (financePro.transactions || []).filter(t => t && t.type === 'expense' && t.date && !financeProNeutro(t) && !noEsGasto.includes(t.category));
            const mesDe = offset => financeMonthKey(new Date(hoy.getFullYear(), hoy.getMonth() - offset, 1));
            const primero = gastos.reduce((min, t) => (!min || t.date < min ? t.date : min), null);
            if (!primero || primero > mesDe(3) + '-01') return null;
            const suma = filtro => gastos.filter(filtro).reduce((s, t) => s + (Number(t.amount) || 0), 0);
            const diaDe = t => Number(t.date.slice(8, 10));
            const actual = mesDe(0);
            const gastado = suma(t => t.date.slice(0, 7) === actual && diaDe(t) <= dia);
            let restoMedio = 0, totalMedio = 0;
            for (let i = 1; i <= 3; i++) {
                const m = mesDe(i);
                restoMedio += suma(t => t.date.slice(0, 7) === m && diaDe(t) > dia) / 3;
                totalMedio += suma(t => t.date.slice(0, 7) === m) / 3;
            }
            const programado = (financePro.programados || []).filter(p => p.date.slice(0, 7) === actual).reduce((s, p) => s + (Number(p.amount) || 0), 0);
            const proyeccion = gastado + restoMedio + programado;
            return { proyeccion, media: totalMedio, programado };
        }

        function avisosProximos(hallazgos) {
            const avisos = [];
            const hoy = todayISO();
            const porClave = k => hallazgos.find(h => h.clave === k);

            const proy = financeProProyeccionMes();
            if (proy && proy.media > 0 && proy.proyeccion > proy.media * 1.15 && proy.proyeccion - proy.media >= 50) {
                avisos.push({
                    accion: "switchView('finances')",
                    frase: `A este ritmo terminarás el mes gastando unos <b>${patronesEuros(proy.proyeccion)}</b>, un ${Math.round((proy.proyeccion / proy.media - 1) * 100)} % más que tu media de los últimos tres meses${proy.programado ? ` (incluye ${patronesEuros(proy.programado)} programados)` : ''}.`
                });
            }

            const mesActual = financeMonthKey();
            entries.filter(e => (e.type === 'subscription' || e.type === 'fixed_expense') && e.vigilar && e.active !== false)
                .filter(e => recurrenteEstadoMes(e, mesActual) === 'falta')
                .forEach(e => avisos.push({
                    accion: "switchView('finances')",
                    frase: `<b>${escapeHtml(e.title || 'Un gasto fijo')}</b> (${financeMoney(Number(e.amount) || 0)}, día ${Number(e.renewalDay) || 1}) todavía no aparece en el banco este mes. Importa el extracto para confirmarlo.`
                }));

            entries.filter(e => e.type === 'document' && e.date).map(e => ({ e, d: diasHasta(e.date) }))
                .filter(x => x.d >= -3 && x.d <= 30).sort((a, b) => a.d - b.d).slice(0, 1)
                .forEach(({ e, d }) => avisos.push({
                    accion: "switchView('documents')",
                    frase: `<b>${escapeHtml(e.title || 'Un documento')}</b> ${d < 0 ? `caducó hace ${-d} ${d === -1 ? 'día' : 'días'}` : d === 0 ? 'caduca hoy' : `caduca en ${d} ${d === 1 ? 'día' : 'días'}`}.`
                }));

            const en7 = new Date(hoy + 'T12:00:00'); en7.setDate(en7.getDate() + 6);
            const limite = patronesIso(en7);
            const examenes = [];
            (studies?.subjects || []).forEach(s => (s.exams || []).forEach(ex => {
                if (ex && ex.date && ex.date >= hoy && ex.date <= limite) examenes.push({ date: ex.date, asignatura: s.name || ex.title || 'examen' });
            }));
            examenes.sort((a, b) => a.date.localeCompare(b.date));
            if (examenes.length) {
                const ex = examenes[0];
                const hx = porClave('habitos-examen');
                const planesAntes = entries.filter(e => e && e.type === 'event' && e.date && e.date >= hoy && e.date <= ex.date && !isCalendarLogEntry(e) && !e.linkedKind).length;
                if (hx && hx.con < hx.sin) {
                    avisos.push({
                        accion: "switchView('studies')",
                        frase: `Examen de ${escapeHtml(ex.asignatura)} ${avisoCuando(ex.date)}. La semana antes de un examen tus rutinas bajan al <b>${patronesPct(hx.con)}</b>: quizá convenga quedarte solo con los esenciales.`
                    });
                } else if (planesAntes >= 2) {
                    avisos.push({
                        accion: "switchView('studies')",
                        frase: `Semana cargada: examen de ${escapeHtml(ex.asignatura)} ${avisoCuando(ex.date)} y <b>${planesAntes} planes</b> antes.`
                    });
                }
            }

            const planesHoy = entries.filter(e => e && e.type === 'event' && e.date === hoy && !isCalendarLogEntry(e) && !e.linkedKind);
            const hp = porClave('gasto-planes');
            if (planesHoy.length && hp && hp.con > hp.sin) {
                avisos.push({
                    accion: 'openHomePatternsModal()',
                    frase: `Hoy tienes ${planesHoy.length === 1 ? escapeHtml(planesHoy[0].title || 'un plan') : planesHoy.length + ' planes'}. Los días con planes sueles gastar unos <b>${patronesEuros(hp.con)}</b>, frente a ${patronesEuros(hp.sin)} un día normal.`
                });
            }

            return avisos.slice(0, 2);
        }

        function renderHomeAvisos(hallazgos) {
            const avisos = avisosProximos(hallazgos);
            if (!avisos.length) return renderPatronDestacado(hallazgos);
            return `<div class="home-pattern-line home-aviso-block">
                <span class="home-pattern-kicker">a tener en cuenta.</span>
                ${avisos.map(a => `<button class="home-aviso-item" onclick="${a.accion}">${a.frase}</button>`).join('')}
            </div>`;
        }

        function renderPatronItem(h) {
            const max = Math.max(h.con, h.sin) || 1;
            const barra = (etq, v, on) => `
                <div class="pattern-bar-row">
                    <span class="pattern-bar-label">${escapeHtml(etq)}</span>
                    <div class="pattern-bar-track"><div class="pattern-bar-fill ${on ? 'on' : ''}" style="width:${Math.max(2, v / max * 100)}%"></div></div>
                    <span class="pattern-bar-value">${h.fmt(v)}</span>
                </div>`;
            return `
                <div class="pattern-item">
                    <div class="pattern-text">${h.frase}</div>
                    ${barra(h.etqCon, h.con, true)}
                    ${barra(h.etqSin, h.sin, false)}
                    <div class="pattern-foot">${h.n} días analizados.</div>
                </div>`;
        }

        function openHomePatternsModal() {
            const hallazgos = patronesHallazgos();
            showModal(`
                <div class="modal-title">patrones.</div>
                <div class="finance-modal-note" style="margin-bottom:14px">Cruces entre tus apartados en los últimos ${PATRONES_DIAS} días. Solo aparece lo que difícilmente es casualidad.</div>
                ${hallazgos.length ? hallazgos.map(renderPatronItem).join('') : `
                    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">Todavía no hay datos suficientes para ver patrones claros. Cuantos más gastos, rutinas, planes y puntuaciones de esfuerzo registres, más cosas aparecerán aquí.</div>`}
            `);
        }

        // Línea de actividad diaria de los últimos `days` — mismo dato que
        // el óvalo radial de "tu estancia en bitácora." pero en formato
        // lineal, a juego con el resto de gráficas PRO de la app.
        function renderHomeStatsChart(days) {
            const today = new Date();
            const counts = [];
            for (let i = days - 1; i >= 0; i--) {
                const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                counts.push(bitacoraActivityCount(iso));
            }
            const W = 400, H = 90, padX = 4, padT = 8, padB = 4;
            const innerW = W - padX * 2, innerH = H - padT - padB;
            const maxC = Math.max(1, ...counts);
            const n = counts.length;
            const x = i => padX + innerW * i / (n - 1);
            const y = c => padT + innerH - (c / maxC) * innerH;
            const pathPts = counts.map((c, i) => [x(i), y(c)]);
            const path = pathPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
            const area = `${path} L${x(n - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${x(0).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
            return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">
                <defs><linearGradient id="homeStatsGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style="stop-color:var(--text-primary);stop-opacity:.22"/><stop offset="100%" style="stop-color:var(--text-primary);stop-opacity:0"/></linearGradient></defs>
                <path d="${area}" fill="url(#homeStatsGrad)" stroke="none"/>
                <path d="${path}" fill="none" stroke="var(--text-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`;
        }

        function openHomeInboxModal() {
            showModal(`
                <div class="modal-title">inbox.</div>
                <div class="finance-modal-note" style="margin-bottom:10px">${inbox.length} sin organizar.</div>
                ${inbox.map(i => `
                    <div style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:8px">
                        <span style="font-size:13px">${escapeHtml(i.text)}</span>
                        <button class="btn-secondary" style="width:auto;padding:2px 10px;font-size:11px" onclick="deleteInboxItem('${i.id}');closeModal();openHomeInboxModal()"><i class='ico ico-x' aria-hidden=true></i></button>
                    </div>`).join('')}
            `);
        }

        function openHomeBackupModal() {
            showModal(`
                <div class="modal-title">copia de seguridad.</div>
                <div class="finance-modal-note" style="margin-bottom:14px">Descarga una copia completa de los datos que Bitácora tiene actualmente cargados.</div>
                <button class="btn-modal-primary" onclick="v23ExportBackup()">↧ Descargar copia de seguridad</button>
            `);
        }

        // ============================================================
        //  RENDER: STATS
        // ============================================================
        function renderStats() {
            const totalEntries = entries.length;
            const byType = {};
            Object.keys(ENTRY_TYPES).forEach(key => {
                const type = ENTRY_TYPES[key];
                byType[type] = entries.filter(e => e.type === type).length;
            });

            const monthCount = {};
            entries.forEach(e => {
                const date = e.date || e.startDate || '';
                if (!date) return;
                const m = date.slice(0, 7);
                if (!monthCount[m]) monthCount[m] = 0;
                monthCount[m]++;
            });
            const sortedMonths = Object.keys(monthCount).sort().slice(-6);
            const maxMonth = Math.max(...Object.values(monthCount), 1);

            let html = `
            <div style="max-width:700px">
                <div style="font-size:20px;font-weight:700;margin-bottom:4px;color:var(--text-primary)">Estadísticas</div>
                <div style="color:var(--text-secondary);margin-bottom:20px">Resumen de tu actividad</div>

                <div class="card-grid">
                    <div class="card"><div class="card-title">Total entradas</div><div class="card-value">${totalEntries}</div></div>
                    <div class="card"><div class="card-title">Libros</div><div class="card-value">${byType.book || 0}</div></div>
                    <div class="card"><div class="card-title">Películas</div><div class="card-value">${byType.movie || 0}</div></div>
                    <div class="card"><div class="card-title">Series</div><div class="card-value">${byType.series || 0}</div></div>
                    <div class="card"><div class="card-title">Videojuegos</div><div class="card-value">${byType.game || 0}</div></div>
                    <div class="card"><div class="card-title">Viajes</div><div class="card-value">${byType.travel || 0}</div></div>
                    <div class="card"><div class="card-title">Empleo</div><div class="card-value">${byType.work || 0}</div></div>
                    <div class="card"><div class="card-title">Proyectos</div><div class="card-value">${byType.project || 0}</div></div>
                    <div class="card"><div class="card-title">Eventos</div><div class="card-value">${byType.event || 0}</div></div>
                    <div class="card"><div class="card-title">Lugares</div><div class="card-value">${byType.place || 0}</div></div>
                    <div class="card"><div class="card-title">Objetivos</div><div class="card-value">${byType.goal || 0}</div></div>
                    <div class="card"><div class="card-title">Cumpleaños</div><div class="card-value">${byType.birthday || 0}</div></div>
                    <div class="card"><div class="card-title">Notas</div><div class="card-value">${notes.length}</div></div>
                </div>`;

            if (sortedMonths.length) {
                html += `
                <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin:20px 0 12px 0">entradas por mes.</div>
                <div style="display:flex;gap:8px;align-items:flex-end;height:100px;padding-top:8px">`;
                sortedMonths.forEach(m => {
                    const count = monthCount[m] || 0;
                    const pct = (count / maxMonth) * 100;
                    const label = m.slice(5);
                    html += `
                    <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
                        <div style="font-weight:500;font-size:12px;color:var(--text-primary)">${count}</div>
                        <div style="width:100%;height:${Math.max(4, pct)}px;background:var(--border-strong);border-radius:4px 4px 0 0;min-height:4px"></div>
                        <div style="font-size:10px;color:var(--text-secondary)">${label}</div>
                    </div>`;
                });
                html += `</div>`;
            }

            html += `</div>`;
            return html;
        }


// Panorama editorial (más ajustes. del modo desarrollador): una sola superficie dividida por reglas finas, con
// «ahora.» como instrumento principal y la semana como curva. Solo cambia la presentación; los datos son los mismos.
function panoramaEditorial() { return typeof ajustesAdmin === 'function' && !!ajustesAdmin().panoramaEditorial; }

function panoramaAhoraDatos() {
    const d = panoramaDatosHoy(), ahora = new Date();
    const min = ahora.getHours() * 60 + ahora.getMinutes();
    const sig = d.siguiente;
    let falta = '';
    if (sig) {
        const [h, m] = sig.hora.split(':').map(Number);
        const resto = h * 60 + m - min;
        falta = resto <= 0 ? 'ahora.' : resto < 60 ? `${resto} min` : `${Math.floor(resto / 60)} h ${String(resto % 60).padStart(2, '0')} min`;
    }
    return { d, min, sig, falta, hora: `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}` };
}

function renderPanoramaAhora() {
    const { d, min, sig, falta, hora } = panoramaAhoraDatos();
    const R = 120, C = 2 * Math.PI * R, avance = min / 1440;
    const marcas = Array.from({ length: 48 }, (_, i) => {
        const a = i / 48 * 2 * Math.PI - Math.PI / 2, largo = i % 4 ? 6 : 12;
        const x1 = 150 + Math.cos(a) * 138, y1 = 150 + Math.sin(a) * 138, x2 = 150 + Math.cos(a) * (138 + largo), y2 = 150 + Math.sin(a) * (138 + largo);
        return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    }).join('');
    const ang = avance * 2 * Math.PI - Math.PI / 2;
    const resumen = sig ? `${sig.titulo}, a las ${sig.hora}` : d.sinHora.length ? `te ${d.sinHora.length === 1 ? 'queda 1 tarea' : `quedan ${d.sinHora.length} tareas`} sin hora.` : 'día despejado.';
    return `<button type="button" class="pano-ahora" onclick="openTuDia()" aria-label="ahora, ${hora}. ${escapeHtml(resumen)}">
        <svg viewBox="0 0 300 300" aria-hidden="true">
            <g class="pano-ahora-marcas">${marcas}</g>
            <circle class="pano-ahora-pista" cx="150" cy="150" r="${R}"/>
            <circle class="pano-ahora-arco" id="pano-ahora-arco" cx="150" cy="150" r="${R}" stroke-dasharray="${(C * avance).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 150 150)"/>
            <circle class="pano-ahora-nodo" id="pano-ahora-nodo" cx="${(150 + Math.cos(ang) * R).toFixed(1)}" cy="${(150 + Math.sin(ang) * R).toFixed(1)}" r="7"/>
            <circle class="pano-ahora-masa" cx="150" cy="150" r="104"/>
        </svg>
        <span class="pano-ahora-texto">
            <small>ahora.</small>
            <b id="pano-ahora-hora">${hora}</b>
            ${sig ? `<span class="pano-ahora-sig">${escapeHtml(sig.titulo)}</span><small id="pano-ahora-falta">${falta}</small>` : `<span class="pano-ahora-sig">${escapeHtml(resumen)}</span>`}
        </span>
    </button>`;
}

// El reloj se actualiza cada minuto sin volver a pintar Panorama; en segundo plano no hace nada.
setInterval(() => {
    if (document.hidden || !document.getElementById('pano-ahora-hora')) return;
    const { min, sig, falta, hora } = panoramaAhoraDatos();
    document.getElementById('pano-ahora-hora').textContent = hora;
    const f = document.getElementById('pano-ahora-falta'); if (f && sig) f.textContent = falta;
    const R = 120, C = 2 * Math.PI * R, avance = min / 1440, ang = avance * 2 * Math.PI - Math.PI / 2;
    document.getElementById('pano-ahora-arco')?.setAttribute('stroke-dasharray', `${(C * avance).toFixed(1)} ${C.toFixed(1)}`);
    const n = document.getElementById('pano-ahora-nodo');
    if (n) { n.setAttribute('cx', (150 + Math.cos(ang) * R).toFixed(1)); n.setAttribute('cy', (150 + Math.sin(ang) * R).toFixed(1)); }
}, 30000);

function panoramaCurvaSemana(dias, hoy, totEv, totTa, cifra) {
    const W = 620, H = 190, izq = 26, abajo = 24, arriba = 10;
    const vals = dias.map(d => d.ev + d.ta), max = Math.max(4, ...vals);
    const paso = Math.ceil(max / 4), tope = paso * 4;
    const x = i => izq + i * (W - izq - 12) / 6, y = v => arriba + (1 - v / tope) * (H - arriba - abajo);
    const pts = vals.map((v, i) => [x(i), y(v)]);
    let curva = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cx = (x0 + x1) / 2;
        curva += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
    }
    const base = y(0);
    const reglas = [0, 1, 2, 3, 4].map(k => `<line class="regla" x1="${izq}" x2="${W - 12}" y1="${y(k * paso)}" y2="${y(k * paso)}"/><text class="eje" x="${izq - 8}" y="${y(k * paso) + 4}" text-anchor="end">${k * paso}</text>`).join('');
    const nombres = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
    const etiquetas = dias.map((d, i) => `<text class="eje ${d.iso === hoy ? 'hoy' : ''}" x="${x(i)}" y="${H - 6}" text-anchor="middle">${nombres[i]}</text>`).join('');
    const nodos = pts.map(([px, py], i) => `<circle class="nodo ${dias[i].iso === hoy ? 'hoy' : ''}" cx="${px}" cy="${py}" r="${dias[i].iso === hoy ? 5 : 4}"/>`).join('');
    const etiqueta = dias.map((d, i) => `${['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][i]} ${vals[i]}`).join(', ');
    return `<svg class="pano-curva" viewBox="0 0 ${W} ${H}" role="img" aria-label="${etiqueta}">${reglas}
        <path class="area" d="${curva} L${pts[6][0]},${base} L${pts[0][0]},${base} Z"/><path class="linea" d="${curva}"/>${nodos}${etiquetas}</svg>
        ${vals.every(v => !v) ? '<span class="pano-vacio">semana despejada.</span>' : ''}
        <span class="pano-cifras">${cifra(totEv, totEv === 1 ? 'evento' : 'eventos')}${cifra(totTa, totTa === 1 ? 'tarea' : 'tareas')}</span>`;
}

// «a tener en cuenta.» del modo editorial: los avisos de siempre y, si hay movimientos, la previsión de gasto del
// mes frente a la media de los tres anteriores, con barras de los últimos meses (la del mes en curso, prevista).
function renderPanoramaCuenta(hallazgos) {
    const avisos = avisosProximos(hallazgos);
    let fin = '';
    if (apartadoVisible('finances') && (financePro.transactions || []).length && typeof financeProMonthTotals === 'function') {
        const hoy = new Date(), dia = hoy.getDate(), diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
        const meses = Array.from({ length: 7 }, (_, i) => { const d = new Date(hoy.getFullYear(), hoy.getMonth() - 6 + i, 1); return { clave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, nombre: d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '') }; });
        meses.forEach(m => { m.gasto = financeProMonthTotals(m.clave).expense; });
        const actual = meses[6];
        actual.prevision = dia >= 3 ? actual.gasto / dia * diasMes : actual.gasto;
        const previos = meses.slice(3, 6).map(m => m.gasto).filter(v => v > 0);
        const media = previos.length ? previos.reduce((a, b) => a + b, 0) / previos.length : 0;
        const dif = media ? Math.round((actual.prevision / media - 1) * 100) : null;
        const max = Math.max(1, media, ...meses.map(m => m.prevision || m.gasto));
        const W = 300, H = 110, ancho = W / 7;
        const barras = meses.map((m, i) => { const v = m.prevision || m.gasto, h = v / max * (H - 18); return `<rect class="${i === 6 ? 'actual' : ''}" x="${(i * ancho + ancho * .28).toFixed(1)}" y="${(H - 18 - h).toFixed(1)}" width="${(ancho * .44).toFixed(1)}" height="${h.toFixed(1)}"/><text x="${(i * ancho + ancho / 2).toFixed(1)}" y="${H - 3}" text-anchor="middle">${m.nombre}</text>`; }).join('');
        const yMedia = (H - 18 - media / max * (H - 18)).toFixed(1);
        fin = `<span class="pano-cuenta-frase">A este ritmo terminarás el mes gastando unos</span>
            <b class="pano-cuenta-cifra">${Math.round(actual.prevision).toLocaleString('es-ES')} €</b>
            ${dif != null ? `<span class="pano-cuenta-frase">${dif >= 0 ? `un ${dif} % más` : `un ${-dif} % menos`} que tu media de los últimos tres meses.</span>` : ''}
            <svg class="pano-barras" viewBox="0 0 ${W} ${H}" role="img" aria-label="gasto por mes: ${meses.map(m => `${m.nombre} ${Math.round(m.prevision || m.gasto)} euros`).join(', ')}">${barras}${media ? `<line x1="0" x2="${W}" y1="${yMedia}" y2="${yMedia}"/>` : ''}</svg>`;
    }
    const lista = avisos.slice(0, fin ? 1 : 3).map(a => `<button type="button" class="pano-cuenta-aviso" onclick="${a.accion}">${a.frase}</button>`).join('');
    if (!fin && !lista) return `<div class="pano-cuenta"><b class="pano-cuenta-tit">a tener en cuenta.</b><span class="pano-vacio">Nada que vigilar ahora mismo.</span></div>`;
    return `<div class="pano-cuenta"><b class="pano-cuenta-tit">a tener en cuenta.${PANO_FLECHA}</b>${fin ? `<button type="button" class="pano-cuenta-fin" onclick="switchView('finances')">${fin}</button>` : ''}${lista}</div>`;
}

const PANO_FLECHA = '<svg class="pano-flecha" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h17M14 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

// «dinero.» del modo editorial: el total de tus cuentas y cómo ha ido en los últimos tres meses.
function renderPanoramaDinero() {
    if (!apartadoVisible('finances') || typeof financeSerieDiaria !== 'function' || !(financePro.transactions || []).length)
        return `<button type="button" class="pano-dinero" onclick="switchView('finances')"><b class="pano-cuenta-tit">dinero.${PANO_FLECHA}</b><span class="pano-vacio">Cuando apuntes movimientos, aquí verás cómo van tus cuentas.</span></button>`;
    // Con «todo.», también la inversión y el fondo de emergencia (la misma elección que en la gráfica de Finanzas).
    const todo = typeof financeGrafExtras !== 'undefined' && financeGrafExtras;
    const serie = financeSerieDiaria(3, todo) || [];
    const total = todo ? financeCorePatrimony() : financeEfectivoActual();
    const ini = serie.length ? serie[0].v : total;
    const dif = total - ini;
    const W = 300, H = 110, vs = serie.map(p => p.v), min = Math.min(...vs, total), max = Math.max(...vs, total), rango = max - min || 1;
    const pts = serie.map((p, i) => [(i / Math.max(1, serie.length - 1) * W).toFixed(1), (8 + (1 - (p.v - min) / rango) * (H - 26)).toFixed(1)]);
    const linea = financeSmoothPath(pts.map(p => [Number(p[0]), Number(p[1])]));
    const meses = [2, 1, 0].map(k => { const d = new Date(); d.setMonth(d.getMonth() - k, 1); return d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', ''); });
    const euros = v => `${Math.round(v).toLocaleString('es-ES')} €`;
    return `<div class="pano-dinero" role="button" tabindex="0" onclick="switchView('finances')" onkeydown="if(event.key==='Enter')switchView('finances')">
        <b class="pano-cuenta-tit">dinero.${PANO_FLECHA}</b>
        <span class="pano-dinero-elegir" role="group" aria-label="qué dinero enseñar"><button type="button" class="${todo ? '' : 'activo'}" onclick="event.stopPropagation(); panoramaDineroTodo(false)">cuentas.</button><button type="button" class="${todo ? 'activo' : ''}" onclick="event.stopPropagation(); panoramaDineroTodo(true)">todo.</button></span>
        <span class="pano-cuenta-frase">${todo ? 'Cuentas, inversión y fondo de emergencia.' : 'En tus cuentas.'}</span>
        <b class="pano-cuenta-cifra">${euros(total)}</b>
        <span class="pano-cuenta-frase">${dif >= 0 ? '+' : '−'}${euros(Math.abs(dif))} en tres meses.</span>
        ${pts.length > 1 ? `<svg class="pano-dinero-graf" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="saldo total de los últimos tres meses: de ${euros(ini)} a ${euros(total)}">
            <path class="area" d="${linea} L${W},${H - 18} L0,${H - 18} Z"/><path class="linea" d="${linea}"/>
            <line x1="0" x2="${W}" y1="${H - 18}" y2="${H - 18}"/>
            ${meses.map((m, i) => `<text x="${(i * W / 3 + W / 6).toFixed(0)}" y="${H - 3}" text-anchor="middle">${m}</text>`).join('')}
        </svg>` : ''}
    </div>`;
}
function panoramaDineroTodo(si) {
    financeGrafExtras = si;
    try { localStorage.setItem('bitacora-fin-extras', si ? '1' : '0'); } catch (e) { /* sin almacenamiento */ }
    if (typeof financeSaldosCache !== 'undefined' && financeSaldosCache) financeSaldosCache.diaria = null;
    render();
}
