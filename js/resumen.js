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
                    <button class="btn-secondary" style="width:auto;padding:2px 10px;font-size:11px" onclick="switchView('planner')">Ver planificador</button>
                </div>
                <div style="display:flex;flex-direction:column;gap:2px">
                    ${plannerToday.map(it => `
                        <label class="weekly-task-row">
                            <input class="weekly-task-check" type="checkbox" ${it.done ? 'checked' : ''} onchange="togglePlannerItemDone('${it.id}', 0)">
                            <span class="weekly-task-text" style="${it.done ? 'text-decoration:line-through;opacity:0.6' : ''}">${escapeHtml(it.time)} · ${escapeHtml(it.title)}</span>
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
        // Centro resumen — familia deliberadamente distinta de los iconos
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
            const rows = [
                renderHomeLauncherRow(HOME_ICON_TODAY, 'hoy.', 'openHomeTodayModal()'),
                renderHomeLauncherRow(HOME_ICON_TASKS, 'tareas.', 'openHomeTasksModal()'),
                renderHomeLauncherRow(HOME_ICON_WEEK, 'esta semana.', 'openHomeWeekModal()'),
                renderHomeLauncherRow(HOME_ICON_UPCOMING, 'próximamente.', 'openHomeUpcomingModal()'),
                renderHomeLauncherRow(HOME_ICON_REVIEW, 'revisión semanal.', 'openHomeReviewModal()'),
                renderHomeLauncherRow(HOME_ICON_ACTIVITY, 'actividad.', 'openConstellationView()'),
                renderHomeLauncherRow(HOME_ICON_STATS, 'estadísticas.', 'openHomeStatsModal()'),
                renderHomeLauncherRow(HOME_ICON_PATTERNS, 'patrones.', 'openHomePatternsModal()', hallazgos.length || ''),
                inbox.length ? renderHomeLauncherRow(HOME_ICON_INBOX, 'inbox.', 'openHomeInboxModal()', inbox.length) : '',
                bandejaPendiente.length || registroConector.length ? renderHomeLauncherRow(REGISTRO_ICONO, 'bandeja.', "switchView('bandeja')", bandejaPendiente.length || '') : '',
                renderHomeLauncherRow(HOME_ICON_BACKUP, 'copia de seguridad.', 'openHomeBackupModal()')
            ].join('');

            return `
            <div>
                <div class="home-cabecera">
                    <div>
                        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:2px">${new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>
                        <div class="resumen-titulo" style="font-size:20px;font-weight:700;margin-bottom:18px;color:var(--text-primary)">Centro de resumen</div>
                    </div>
                    <div class="home-estancia" id="home-estancia">
                        <button class="home-estancia-btn" title="tu estancia en bitácora." aria-expanded="false" onclick="toggleHomeEstancia()">${HOME_ICON_ESTANCIA}</button>
                    </div>
                </div>
                <div style="max-width:760px">
                    ${renderHomeAvisos(hallazgos)}
                    <div class="home-launcher-list">${rows}</div>
                </div>
            </div>`;
        }

        // "tu estancia en bitácora." vive dentro de un botón: al pulsarlo se
        // difumina toda la pantalla y el gráfico sale del botón hasta el
        // centro, flotando sin panel, con los radios creciendo uno tras
        // otro en círculo; al cerrarlo vuelve encogiéndose al botón. Se
        // pinta al abrirlo, no en cada pintado de Home. --dx/--dy es lo que
        // separa el centro del botón del centro de la pantalla.
        // Dibujo del usuario (sol.svg), trazado sin tocar; solo el relleno
        // pasa a currentColor y el viewBox se ajusta a su caja real para
        // que quede centrado en el botón.
        // Encuadre centrado en el centro de masas del dibujo, no en su caja:
        // con la caja centrada el icono se veía desplazado a la izquierda.
        const HOME_ICON_ESTANCIA = '<svg viewBox="6.5 25 262 263" fill="currentColor" fill-rule="evenodd"><path d="M144.2 211.2C142.6 211.3 138.4 213.1 136.8 213.5C135.1 213.9 135.2 213.8 134.5 213.5C133.8 213.2 133.4 212.1 132.8 211.8C132.1 211.4 131.3 211.2 130.8 211.5C130.2 211.8 129.4 212.5 129.2 213.8C129.1 215.0 130.0 214.5 130.0 218.8C130.0 223.0 129.5 230.9 129.5 239.2C129.5 247.6 130.0 262.3 130.0 268.8C130.0 275.2 129.2 276.1 129.2 278.0C129.2 279.9 129.6 279.4 130.0 280.0C130.4 280.6 131.2 281.3 131.8 281.5C132.3 281.7 132.9 281.5 133.2 281.2C133.6 281.0 133.6 281.5 133.8 280.2C133.9 279.0 132.3 281.0 134.0 273.5C135.7 266.0 142.2 243.2 144.0 235.5C145.8 227.8 144.2 230.3 144.8 227.0C145.3 223.7 147.0 218.1 147.2 215.8C147.5 213.4 147.0 213.8 146.5 213.0C146.0 212.2 145.9 211.2 144.2 211.2ZM115.0 205.2C113.9 204.8 113.6 205.3 113.2 205.5C112.9 205.7 113.0 205.6 112.8 206.5C112.5 207.4 113.2 207.0 112.0 211.0C110.8 215.0 107.4 225.6 105.8 230.5C104.1 235.4 102.7 238.1 102.0 240.2C101.3 242.4 101.6 242.5 101.8 243.2C101.9 244.0 102.3 244.7 102.8 245.0C103.2 245.3 103.9 245.1 104.2 245.0C104.6 244.9 104.2 245.5 105.0 244.2C105.8 243.0 106.3 240.6 108.8 237.2C111.2 233.9 117.2 227.1 119.5 224.0C121.8 220.9 121.3 220.2 122.5 218.5C123.7 216.8 126.0 215.0 126.8 214.0C127.5 213.0 126.9 213.0 126.8 212.5C126.6 212.0 126.9 211.9 125.8 211.2C124.6 210.6 121.8 209.5 120.0 208.5C118.2 207.5 116.1 205.8 115.0 205.2ZM151.8 216.0C150.9 216.9 151.3 216.9 151.2 217.8C151.2 218.6 151.1 220.0 151.5 221.0C151.9 222.0 152.7 221.9 153.5 224.0C154.3 226.1 155.2 230.6 156.2 233.5C157.3 236.4 159.0 239.4 159.8 241.5C160.5 243.6 160.6 245.0 161.0 246.0C161.4 247.0 161.9 247.3 162.2 247.5C162.6 247.7 163.0 247.5 163.2 247.2C163.5 247.0 163.5 247.7 163.8 246.2C164.0 244.8 164.5 243.2 164.8 238.8C165.0 234.3 165.0 223.3 165.2 219.8C165.5 216.2 166.1 218.0 166.2 217.2C166.4 216.5 166.5 216.2 166.2 215.5C166.0 214.8 165.0 213.4 164.8 212.8C164.5 212.1 164.2 211.4 165.0 211.5C165.8 211.6 167.4 212.0 169.5 213.2C171.6 214.5 172.4 214.7 177.8 218.8C183.1 222.8 195.9 233.1 201.5 237.8C207.1 242.4 209.2 245.0 211.2 246.5C213.3 248.0 213.2 247.2 214.0 247.0C214.8 246.8 215.5 245.8 215.8 245.2C216.0 244.7 216.2 244.5 215.2 243.5C214.3 242.5 212.8 241.9 210.2 239.0C207.7 236.1 204.4 232.4 200.0 226.2C195.6 220.1 186.9 206.9 183.8 202.0C180.6 197.1 181.7 198.0 181.2 196.8C180.8 195.5 181.5 194.9 181.2 194.2C181.0 193.6 180.7 193.0 180.0 192.8C179.3 192.5 177.9 192.5 177.2 192.5C176.6 192.5 176.9 192.1 176.2 193.0C175.6 193.9 174.9 196.2 173.2 198.0C171.6 199.8 167.7 202.0 166.2 203.8C164.8 205.5 164.8 207.2 164.5 208.5C164.2 209.8 165.4 210.8 164.5 211.2C163.6 211.7 160.6 211.0 159.2 211.2C157.9 211.5 157.5 211.7 156.2 212.5C155.0 213.3 152.6 215.1 151.8 216.0ZM109.2 203.8C108.2 202.8 105.1 201.9 102.8 200.0C100.4 198.1 96.6 193.8 95.0 192.5C93.4 191.2 95.1 190.1 93.0 192.5C90.9 194.9 86.9 200.3 82.2 207.0C77.6 213.7 69.3 227.0 65.2 232.8C61.2 238.5 59.5 239.2 57.8 241.8C56.0 244.3 55.3 246.7 54.8 248.0C54.2 249.3 54.5 249.2 54.5 249.8C54.5 250.2 54.8 250.7 55.0 251.0C55.2 251.3 55.5 251.6 56.0 251.8C56.5 251.9 57.1 252.0 58.0 251.8C58.9 251.5 59.2 252.1 61.5 250.0C63.8 247.9 69.2 241.5 71.8 239.0C74.2 236.5 72.9 238.7 76.5 235.2C80.1 231.8 89.2 222.6 93.5 218.5C97.8 214.4 100.2 212.6 102.5 210.8C104.8 208.9 106.4 208.1 107.5 207.2C108.6 206.4 108.7 206.3 109.0 205.8C109.3 205.2 110.3 204.7 109.2 203.8ZM86.0 174.0C85.3 172.5 85.8 173.3 85.2 173.2C84.7 173.2 83.8 172.8 82.5 173.5C81.2 174.2 81.0 175.2 77.2 177.2C73.5 179.3 64.2 183.8 59.8 185.8C55.3 187.7 52.4 188.3 50.8 189.0C49.1 189.7 50.1 189.4 50.0 190.0C49.9 190.6 50.0 192.1 50.2 192.8C50.5 193.4 51.1 193.6 51.5 193.8C51.9 193.9 52.0 194.0 52.5 193.8C53.0 193.5 53.6 192.9 54.8 192.5C55.9 192.1 57.0 191.8 59.2 191.5C61.5 191.2 65.4 191.1 68.2 190.8C71.1 190.4 73.9 189.5 76.2 189.2C78.6 189.0 80.4 189.7 82.2 189.5C84.1 189.3 86.4 188.8 87.5 188.2C88.6 187.7 88.7 187.0 89.0 186.0C89.3 185.0 89.8 184.5 89.2 182.5C88.8 180.5 86.7 175.5 86.0 174.0ZM185.5 184.2C185.0 185.0 185.4 185.0 185.8 185.5C186.1 186.0 186.5 186.7 187.5 187.0C188.5 187.3 190.5 187.0 192.0 187.2C193.5 187.5 194.3 187.6 196.5 188.5C198.7 189.4 202.4 191.6 205.2 192.8C208.1 193.9 211.0 194.2 213.5 195.5C216.0 196.8 219.1 199.5 220.5 200.2C221.9 201.0 221.4 200.4 221.8 200.2C222.1 200.1 222.4 200.0 222.5 199.5C222.6 199.0 222.8 197.8 222.2 197.0C221.7 196.2 222.5 198.0 219.0 194.8C215.5 191.5 204.5 180.6 201.2 177.2C198.0 173.9 200.2 175.4 199.2 174.5C198.3 173.6 196.3 172.4 195.5 172.0C194.7 171.6 194.8 171.9 194.2 172.2C193.7 172.6 192.9 172.8 192.0 174.2C191.1 175.8 189.8 179.6 188.8 181.2C187.7 182.9 186.0 183.5 185.5 184.2ZM87.0 150.8C86.8 150.4 86.5 150.1 86.0 150.0C85.5 149.9 84.5 149.8 83.8 150.0C83.0 150.2 82.7 150.7 81.5 151.0C80.3 151.3 81.0 151.6 76.8 151.8C72.5 151.9 63.0 151.5 55.8 152.0C48.5 152.5 38.5 154.4 33.2 154.8C28.0 155.1 25.8 154.1 24.0 154.2C22.2 154.4 23.0 155.1 22.8 155.8C22.5 156.4 22.3 157.7 22.5 158.2C22.7 158.8 21.9 159.0 24.0 159.2C26.1 159.5 27.1 158.8 35.2 160.0C43.4 161.2 66.0 165.5 73.0 166.8C80.0 168.0 76.1 167.3 77.5 167.8C78.9 168.2 80.5 169.2 81.5 169.5C82.5 169.8 82.8 169.8 83.2 169.5C83.8 169.2 84.3 169.4 84.5 168.0C84.7 166.6 84.0 162.8 84.2 161.2C84.5 159.7 85.8 159.7 86.0 158.5C86.2 157.3 85.6 155.3 85.8 154.2C85.9 153.2 86.8 152.6 87.0 152.0C87.2 151.4 87.2 151.1 87.0 150.8ZM193.0 150.0C192.9 153.0 193.1 162.7 193.2 165.5C193.4 168.3 193.8 166.5 194.0 166.8C194.2 167.0 194.2 167.1 194.8 166.8C195.2 166.4 196.2 165.2 197.0 164.8C197.8 164.2 196.2 164.0 199.8 163.8C203.3 163.5 214.6 163.6 218.2 163.5C221.9 163.4 214.1 163.1 221.5 163.0C228.9 162.9 255.0 162.8 262.5 163.0C270.0 163.2 265.9 164.0 266.8 164.0C267.6 164.0 267.6 163.7 267.8 163.2C267.9 162.8 268.0 161.9 267.5 161.2C267.0 160.6 266.2 159.5 265.0 159.2C263.8 159.0 267.0 160.6 260.2 159.5C253.5 158.4 231.5 154.2 224.5 152.8C217.5 151.3 220.9 151.3 218.0 150.8C215.1 150.2 210.4 150.0 207.2 149.2C204.1 148.5 201.0 147.0 199.0 146.5C197.0 146.0 195.9 146.1 195.0 146.2C194.1 146.4 194.1 146.9 193.8 147.5C193.4 148.1 193.1 147.0 193.0 150.0ZM189.8 137.0C189.8 138.0 189.7 137.5 190.2 137.5C190.8 137.5 188.7 138.8 193.0 137.2C197.3 135.8 211.4 130.2 216.2 128.5C221.1 126.8 220.8 127.6 222.0 127.2C223.2 126.9 223.2 126.6 223.5 126.2C223.8 125.9 224.0 125.4 223.8 125.0C223.5 124.6 223.5 123.9 222.0 123.8C220.5 123.6 218.3 124.1 214.5 124.0C210.7 123.9 202.5 123.6 199.2 123.2C196.0 122.9 196.6 121.9 195.0 121.8C193.4 121.6 190.9 122.0 189.8 122.5C188.6 123.0 188.0 123.0 188.0 124.5C188.0 126.0 189.5 129.4 189.8 131.5C190.0 133.6 189.7 136.0 189.8 137.0ZM55.2 121.2C55.0 121.8 54.7 123.0 54.8 123.5C54.8 124.0 54.5 124.2 55.5 124.5C56.5 124.8 58.9 124.7 61.0 125.5C63.1 126.3 64.9 127.3 68.0 129.2C71.1 131.2 76.5 134.8 79.5 137.2C82.5 139.7 84.9 142.6 86.2 143.8C87.6 144.9 87.2 144.0 87.5 144.0C87.8 144.0 87.9 144.5 88.2 143.5C88.6 142.5 88.8 140.3 89.5 138.2C90.2 136.2 91.8 132.5 92.2 131.0C92.7 129.5 92.5 129.9 92.2 129.2C92.0 128.6 93.6 127.7 91.0 127.0C88.4 126.3 81.2 126.1 76.5 125.2C71.8 124.4 65.8 122.7 62.8 121.8C59.7 120.8 59.3 119.8 58.2 119.5C57.2 119.2 57.0 119.7 56.5 120.0C56.0 120.3 55.5 120.7 55.2 121.2ZM153.5 107.0C151.1 106.5 148.8 105.9 145.5 105.8C142.2 105.6 136.2 106.0 133.5 106.2C130.8 106.5 132.0 106.5 129.5 107.5C127.0 108.5 120.6 111.4 118.5 112.5C116.4 113.6 117.0 113.6 116.8 114.2C116.5 114.9 118.5 114.8 116.8 116.5C115.0 118.2 108.8 122.8 106.5 124.8C104.2 126.8 104.9 125.3 103.0 128.5C101.1 131.7 97.0 137.8 95.0 144.0C93.0 150.2 91.5 160.8 91.0 165.8C90.5 170.8 91.3 171.5 91.8 174.0C92.2 176.5 92.6 178.5 93.5 180.8C94.4 183.0 95.8 185.8 97.2 187.8C98.7 189.8 98.7 190.1 102.2 192.8C105.8 195.4 115.0 201.3 118.8 203.5C122.5 205.7 122.6 205.4 124.5 206.0C126.4 206.6 127.5 207.1 130.0 207.2C132.5 207.4 135.0 207.5 139.8 206.8C144.5 206.0 154.5 203.8 158.5 202.8C162.5 201.8 161.9 201.6 163.5 200.8C165.1 199.9 165.8 199.9 168.0 197.8C170.2 195.6 174.8 190.8 177.0 188.0C179.2 185.2 179.8 183.9 181.2 181.2C182.7 178.6 184.4 175.4 185.5 172.0C186.6 168.6 187.3 164.2 187.8 161.0C188.2 157.8 188.5 156.0 188.2 152.5C188.0 149.0 187.0 143.6 186.2 140.2C185.5 136.9 185.0 134.8 184.0 132.2C183.0 129.8 182.4 128.0 180.2 125.2C178.1 122.5 174.7 118.5 171.2 115.8C167.8 113.0 162.7 110.5 159.8 109.0C156.8 107.5 155.9 107.5 153.5 107.0ZM155.2 110.0C156.6 110.5 160.0 111.8 162.2 113.0C164.5 114.2 166.6 115.1 169.0 117.0C171.4 118.9 174.4 121.8 176.5 124.5C178.6 127.2 180.4 130.0 181.8 133.2C183.1 136.5 184.2 141.5 184.8 144.0C185.3 146.5 185.2 145.6 185.2 148.5C185.2 151.4 185.3 157.4 184.8 161.5C184.2 165.6 183.3 169.6 182.0 173.2C180.7 176.9 179.4 179.6 176.8 183.2C174.1 186.9 168.5 192.5 166.0 195.0C163.5 197.5 164.5 196.9 161.5 198.0C158.5 199.1 152.3 200.8 148.2 201.8C144.2 202.7 141.5 203.5 137.2 203.5C133.0 203.5 125.2 202.2 122.5 201.8C119.8 201.3 121.6 201.6 120.8 201.0C119.9 200.4 118.5 198.7 117.2 198.0C116.0 197.3 114.4 197.3 113.0 196.8C111.6 196.2 110.5 195.6 108.8 194.5C107.0 193.4 103.8 191.2 102.2 190.0C100.7 188.8 100.5 188.5 99.5 187.0C98.5 185.5 97.0 183.5 96.0 181.2C95.0 179.0 94.2 176.4 93.8 173.8C93.3 171.1 92.7 170.2 93.2 165.2C93.8 160.3 95.8 149.3 97.2 144.2C98.7 139.2 100.3 137.4 101.8 134.8C103.2 132.1 103.8 130.9 106.0 128.5C108.2 126.1 111.5 123.0 114.8 120.5C118.0 118.0 122.2 115.1 125.2 113.2C128.2 111.4 130.2 110.3 132.8 109.5C135.2 108.7 138.0 108.6 140.2 108.5C142.5 108.4 144.7 108.5 146.5 109.0C148.3 109.5 150.0 111.3 151.0 111.8C152.0 112.2 151.8 111.8 152.2 111.5C152.8 111.2 153.5 110.2 154.0 110.0C154.5 109.8 153.9 109.5 155.2 110.0ZM107.8 75.5C107.1 75.5 106.7 75.9 106.5 76.5C106.3 77.1 106.1 76.0 106.5 79.0C106.9 82.0 108.5 91.0 109.0 94.5C109.5 98.0 108.9 97.8 109.2 99.8C109.6 101.7 110.4 104.9 111.2 106.0C112.1 107.1 113.2 106.4 114.2 106.2C115.3 106.1 116.4 105.6 117.5 105.0C118.6 104.4 120.2 103.4 121.0 102.8C121.8 102.1 122.2 101.8 122.5 101.2C122.8 100.8 123.4 100.9 122.8 99.8C122.1 98.6 119.4 96.0 118.5 94.5C117.6 93.0 118.2 92.9 117.2 91.0C116.3 89.1 114.0 85.4 113.0 83.2C112.0 81.1 112.0 79.1 111.5 78.0C111.0 76.9 110.9 76.9 110.2 76.5C109.6 76.1 108.4 75.5 107.8 75.5ZM227.8 67.0C227.4 66.5 226.7 65.8 225.8 66.2C224.8 66.7 224.8 67.8 222.2 69.5C219.8 71.2 214.0 74.1 210.8 76.2C207.5 78.4 205.0 80.6 202.5 82.2C200.0 83.9 198.7 84.0 195.5 86.0C192.3 88.0 187.4 91.1 183.5 94.0C179.6 96.9 174.2 101.5 172.2 103.2C170.2 105.0 171.6 103.9 171.5 104.5C171.4 105.1 170.4 105.4 171.8 106.8C173.1 108.1 177.5 110.7 179.5 112.5C181.5 114.3 182.7 116.8 183.8 117.8C184.8 118.7 185.2 118.7 185.8 118.2C186.2 117.8 186.3 116.0 186.8 115.0C187.2 114.0 187.3 113.8 188.5 112.5C189.7 111.2 191.9 109.8 194.0 107.2C196.1 104.8 198.6 100.6 201.2 97.5C203.9 94.4 207.2 91.7 210.0 88.5C212.8 85.3 215.2 81.8 218.2 78.5C221.2 75.2 226.4 70.9 228.0 69.0C229.6 67.1 228.1 67.5 227.8 67.0ZM174.2 66.0C173.9 65.8 175.6 63.3 173.0 66.0C170.4 68.7 162.2 77.5 158.5 82.0C154.8 86.5 151.8 91.0 150.5 93.2C149.2 95.5 150.3 94.4 150.5 95.2C150.7 96.1 151.3 97.5 151.8 98.2C152.2 99.0 152.1 99.4 153.0 99.5C153.9 99.6 155.7 98.5 157.2 98.8C158.8 99.0 161.3 100.9 162.5 101.2C163.7 101.6 164.2 101.4 164.5 100.8C164.8 100.1 164.1 98.7 164.2 97.2C164.4 95.8 164.4 95.7 165.5 92.2C166.6 88.8 169.7 80.0 171.0 76.8C172.3 73.5 172.8 74.0 173.2 73.0C173.7 72.0 173.2 71.2 173.5 70.5C173.8 69.8 174.8 69.1 175.0 68.5C175.2 67.9 175.1 67.4 175.0 67.0C174.9 66.6 174.6 66.2 174.2 66.0ZM69.5 62.2C69.1 62.4 68.5 62.9 68.2 63.2C68.0 63.6 67.8 63.8 68.0 64.5C68.2 65.2 69.0 65.6 69.8 67.5C70.5 69.4 70.8 72.2 72.2 76.0C73.8 79.8 76.8 85.4 78.8 90.2C80.7 95.1 82.5 101.2 84.0 105.0C85.5 108.8 87.2 111.2 88.0 113.2C88.8 115.3 88.1 115.9 88.8 117.5C89.4 119.1 91.0 121.9 92.0 123.0C93.0 124.1 93.8 124.3 94.5 124.2C95.2 124.2 95.9 123.5 96.5 122.8C97.1 122.0 97.2 121.2 98.2 120.0C99.2 118.8 101.2 116.9 102.5 115.8C103.8 114.6 104.8 113.8 105.8 113.2C106.7 112.7 107.7 112.6 108.2 112.2C108.8 111.9 109.1 111.4 109.2 111.0C109.4 110.6 110.2 110.9 109.2 109.8C108.3 108.6 106.3 107.4 103.5 104.0C100.7 100.6 97.0 95.0 92.2 89.2C87.5 83.5 78.7 74.0 75.2 69.8C71.8 65.5 72.5 64.8 71.8 63.5C71.0 62.2 70.9 62.5 70.5 62.2C70.1 62.0 69.9 62.1 69.5 62.2ZM143.2 34.5C142.8 34.3 142.4 34.3 142.0 34.8C141.6 35.2 141.1 35.9 140.8 37.0C140.4 38.1 140.5 39.8 140.0 41.2C139.5 42.7 138.2 44.5 137.8 45.8C137.3 47.0 137.9 47.0 137.2 49.0C136.6 51.0 135.0 54.2 134.0 57.8C133.0 61.2 132.2 63.7 131.0 70.0C129.8 76.3 127.2 91.0 126.5 95.5C125.8 100.0 126.4 96.8 126.8 97.2C127.1 97.7 127.6 98.1 128.5 98.2C129.4 98.4 131.0 98.4 132.0 98.2C133.0 98.1 132.2 97.5 134.2 97.5C136.3 97.5 142.7 98.0 144.5 98.0C146.3 98.0 145.4 99.7 145.2 97.2C145.1 94.8 143.6 93.5 143.5 83.2C143.4 73.0 144.8 43.9 144.8 35.8C144.7 27.6 143.7 34.7 143.2 34.5Z"/></svg>';

        function cerrarHomeEstanciaConTecla(e) {
            if (e.key === 'Escape') { e.stopPropagation(); toggleHomeEstancia(false); }
        }

        function toggleHomeEstancia(abrir) {
            const actual = document.getElementById('estancia-overlay');
            const btn = document.querySelector('.home-estancia-btn');
            const abierto = typeof abrir === 'boolean' ? abrir : !actual;
            if (!abierto) {
                if (!actual || actual.classList.contains('cerrando')) return;
                actual.classList.add('cerrando');
                actual.classList.remove('abierto');
                btn?.classList.remove('activo');
                btn?.setAttribute('aria-expanded', 'false');
                document.removeEventListener('keydown', cerrarHomeEstanciaConTecla, true);
                setTimeout(() => actual.remove(), 420);
                return;
            }
            if (actual || !btn) return;
            const r = btn.getBoundingClientRect();
            const overlay = document.createElement('div');
            overlay.id = 'estancia-overlay';
            overlay.className = 'estancia-overlay';
            overlay.style.setProperty('--dx', Math.round(r.left + r.width / 2 - window.innerWidth / 2) + 'px');
            overlay.style.setProperty('--dy', Math.round(r.top + r.height / 2 - window.innerHeight / 2) + 'px');
            overlay.innerHTML = `
                <div class="estancia-flotante" role="dialog" aria-label="tu estancia en bitácora.">
                    <div class="bitacora-activity-radial">${renderBitacoraActivityRadial(90)}</div>
                    <div class="estancia-flotante-titulo">tu estancia en bitácora.</div>
                </div>`;
            overlay.addEventListener('click', () => toggleHomeEstancia(false));
            document.body.appendChild(overlay);
            btn.classList.add('activo');
            btn.setAttribute('aria-expanded', 'true');
            document.addEventListener('keydown', cerrarHomeEstanciaConTecla, true);
            requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('abierto')));
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
            const today = new Date().toISOString().slice(0, 10);
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
                                <div class="entry-title">🎂 ${escapeHtml(b.title)}</div>
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

        function openHomeStatsModal() {
            const subsTotal = entries.filter(e => e.type === 'subscription' && e.active !== false).reduce((s, e) => s + (e.amount || 0), 0);
            const fixedTotal = entries.filter(e => e.type === 'fixed_expense' && e.active !== false).reduce((s, e) => s + (e.amount || 0), 0);
            const activeProjects = entries.filter(e => e.type === 'project' && e.status !== 'Completado');
            const workDays = entries.filter(e => e.type === 'work').reduce((sum, job) => sum + countWorkingDays(job.startDate, job.endDate || todayISO()), 0);

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

            const stats = [
                [entries.filter(e=>e.type==='book').length, 'libros'], [entries.filter(e=>e.type==='movie').length, 'películas'],
                [entries.filter(e=>e.type==='series').length, 'series'], [entries.filter(e=>e.type==='game').length, 'videojuegos'],
                [entries.filter(e=>e.type==='travel').length, 'viajes'], [activeProjects.length, 'proyectos activos'],
                [notes.length, 'notas'], [entries.filter(e=>e.type==='goal').length, 'objetivos'],
                [entries.filter(e=>e.type==='place').length, 'lugares'], [entries.filter(e=>e.type==='birthday').length, 'cumpleaños'],
                [workDays, 'días cotizados'], [subsTotal.toLocaleString('es-ES') + '€', 'suscripciones/mes'],
                [fixedTotal.toLocaleString('es-ES') + '€', 'gastos fijos/mes']
            ];

            showModal(`
                <div class="modal-title">estadísticas.</div>
                <div class="home-stats-headline">
                    <div class="home-stats-headline-item"><div class="num" id="home-stats-days" data-value="${activeDays}">0</div><div class="txt">días</div></div>
                    <div class="home-stats-headline-item"><div class="num" id="home-stats-entries" data-value="${entries.length}">0</div><div class="txt">entradas</div></div>
                    <div class="home-stats-headline-item"><div class="num" id="home-stats-actions" data-value="${totalActions}">0</div><div class="txt">acciones</div></div>
                </div>
                <div class="home-stats-chart-label">actividad · últimos 30 días</div>
                <div id="home-stats-chart">${renderHomeStatsChart(30)}</div>
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

        function patronesIso(d) { return d.toISOString().slice(0, 10); }

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
                r => `Los días con planes cumples el <b>${patronesPct(r.con)}</b> de tus hábitos, frente al ${patronesPct(r.sin)} de un día sin planes.`,
                'con planes.', 'sin planes.', patronesPct);

            anadir('habitos-examen', patronesComparar(dias, iso => semanaExamen.has(iso), tasaHabitos), okTasa,
                r => `La semana antes de un examen cumples el <b>${patronesPct(r.con)}</b> de tus hábitos, frente al ${patronesPct(r.sin)} habitual.`,
                'antes de examen.', 'resto.', patronesPct);

            anadir('habitos-viaje', patronesComparar(dias, iso => enTramo(tramosViaje, iso), tasaHabitos), okTasa,
                r => `De viaje mantienes el <b>${patronesPct(r.con)}</b> de tus hábitos, frente al ${patronesPct(r.sin)} en casa.`,
                'de viaje.', 'en casa.', patronesPct);

            // Solo lunes a viernes: comparar días de trabajo contra fines de
            // semana mediría el fin de semana, no el trabajo.
            const diaLaborable = iso => { const d = diaSemana(iso); return (d === 0 || d === 6) ? null : enTramo(tramosTrabajo, iso); };
            anadir('habitos-trabajo', patronesComparar(dias, diaLaborable, tasaHabitos), okTasa,
                r => `Entre semana, los días que trabajas cumples el <b>${patronesPct(r.con)}</b> de tus hábitos, frente al ${patronesPct(r.sin)} los que no.`,
                'trabajando.', 'sin trabajar.', patronesPct);

            anadir('esfuerzo-habitos', patronesComparar(dias, iso => { const t = tasaHabitos(iso); return t === null ? null : t >= 0.5; }, esfuerzo), okEsfuerzo,
                r => `Cuando cumples al menos la mitad de tus hábitos, puntúas tu esfuerzo con un <b>${patronesNum(r.con)}</b> de media, frente a ${patronesNum(r.sin)}.`,
                'hábitos ≥ 50 %.', 'hábitos < 50 %.', patronesNum);

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
            const gastos = (financePro.transactions || []).filter(t => t && t.type === 'expense' && t.date && !noEsGasto.includes(t.category));
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
                        frase: `Examen de ${escapeHtml(ex.asignatura)} ${avisoCuando(ex.date)}. La semana antes de un examen tus hábitos bajan al <b>${patronesPct(hx.con)}</b>: quizá convenga quedarte solo con los esenciales.`
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
                    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">Todavía no hay datos suficientes para ver patrones claros. Cuantos más gastos, hábitos, planes y puntuaciones de esfuerzo registres, más cosas aparecerán aquí.</div>`}
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
                        <button class="btn-secondary" style="width:auto;padding:2px 10px;font-size:11px" onclick="deleteInboxItem('${i.id}');closeModal();openHomeInboxModal()">✕</button>
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
                <div style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin:20px 0 12px 0">Entradas por mes</div>
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

