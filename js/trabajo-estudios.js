        // ============================================================
        //  RENDER: WORK
        // ============================================================
        // Días naturales inclusivos: se utiliza como estimación de cotización
        // cuando todavía no existe una cifra corregida desde la Vida Laboral.
        // Incluye siempre el día de inicio y el de fin, incluidos sábados y domingos.
        function countCotizationDays(startDate, endDate) {
            if (!startDate || !endDate) return 0;
            const start = new Date(startDate + 'T12:00:00');
            const end = new Date(endDate + 'T12:00:00');
            if (end < start) return 0;
            return Math.floor((end - start) / 86400000) + 1;
        }

        function getCotizationDays(entry, todayStr) {
            const effectiveEnd = (!entry.endDate || entry.endDate >= todayStr) ? todayStr : entry.endDate;
            const calculated = countCotizationDays(entry.startDate, effectiveEnd);
            const manual = Number(entry.cotizedDays);
            return Number.isFinite(manual) && manual >= 0 ? manual : calculated;
        }

        function getCotizationSource(entry) {
            const manual = Number(entry.cotizedDays);
            return Number.isFinite(manual) && manual >= 0 ? 'Vida laboral' : 'Estimación';
        }

        const WORK_MODALIDAD_LABELS = { presencial: 'Presencial', hibrido: 'Híbrido', remoto: 'Remoto' };

        // Icono de portátil — misma familia sólida de las TARJETA BITACORA,
        // pensado para ir en blanco sobre el fondo negro de la tarjeta.
        const WORK_ICON_LAPTOP = '<svg viewBox="0 0 100 80" fill="none"><rect x="6" y="6" width="88" height="56" rx="8" fill="currentColor"/><rect x="18" y="16" width="64" height="36" rx="3" fill="#000"/><rect x="0" y="66" width="100" height="10" rx="5" fill="currentColor"/></svg>';
        // Misma silueta, pero el "hueco" de la pantalla toma el color de
        // fondo del FAB (var(--bg-fab)) en vez de negro fijo, porque el FAB
        // sí cambia de blanco a negro según el tema.

        function renderWork() {
            const work = entries.filter(e => e.type === 'work');
            if (!work.length) {
                return `<div class="empty-state">
                    <div class="empty-title">Sin experiencia laboral</div>
                    <div class="empty-sub"><span class="solo-escritorio">Pulsa el botón + y selecciona "Empleo", o importa tu Informe de Vida Laboral</span><span class="solo-movil">Añade el primero con el botón de arriba.</span></div>
                    <button class="btn-secondary" style="width:auto;margin-top:12px;background:#3b82f6;color:#fff;border-color:#3b82f6" onclick="openWorkImportModal()">Importar Vida Laboral</button>
                    <button class="btn-secondary" style="width:auto;margin-top:8px" onclick="openCv()">crear mi cv.</button>
                </div>`;
            }

            const todayStr = new Date().toISOString().slice(0, 10);
            const daysBetween = (start, end) => countWorkingDays(start, end || todayISO());

            const sorted = [...work].sort((a, b) => {
                const aActive = !a.endDate || a.endDate >= todayStr;
                const bActive = !b.endDate || b.endDate >= todayStr;
                if (aActive !== bActive) return aActive ? -1 : 1;
                return (b.startDate || '').localeCompare(a.startDate || '');
            });

            // Los días trabajados parten del cálculo automático de días naturales.
            // Si el usuario ha introducido una cifra oficial de Vida Laboral,
            // esa cifra sustituye también la duración mostrada para ese registro,
            // de modo que ambas estadísticas queden alineadas con la realidad
            // verificada por el usuario.
            const totalDays = sorted.reduce((sum, w) => {
                const isActive = !w.endDate || w.endDate >= todayStr;
                const effectiveEnd = isActive ? todayStr : w.endDate;
                const calculatedDays = daysBetween(w.startDate, effectiveEnd);
                const manual = Number(w.cotizedDays);
                const displayDays = Number.isFinite(manual) && manual >= 0 ? manual : calculatedDays;
                return sum + displayDays;
            }, 0);

            const actuales = sorted.filter(w => !w.endDate || w.endDate >= todayStr);
            const historial = sorted.filter(w => w.endDate && w.endDate < todayStr);

            let html = `
                <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;max-width:980px;flex-wrap:wrap">
                    <div style="font-size:20px;font-weight:700;color:var(--text-primary)">Empleo</div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <button class="btn-secondary" style="width:auto;background:#3b82f6;color:#fff;border-color:#3b82f6" onclick="openWorkImportModal()">Importar Vida Laboral</button>
                        <button class="btn-secondary" style="width:auto" onclick="generateWorkResumePDF()">⭳ Descargar resumen (PDF)</button>
                        <button class="btn-modal-primary" style="width:auto;margin:0" onclick="openCv()">crear mi cv.</button>
                    </div>
                </div>
                <div class="card work-bubble-flow-card" style="max-width:980px;margin-bottom:22px">
                    <div class="work-bubble-flow-title">evolución de tus empleos. ${totalDays} días trabajados en total.</div>
                    ${renderWorkBubbleFlow(sorted)}
                </div>
                <div style="max-width:980px">`;

            if (actuales.length) {
                html += `<div class="work-current-list">`;
                actuales.forEach(w => { html += renderWorkCurrentCard(w, todayStr, daysBetween); });
                html += `</div>`;
            }
            if (historial.length) {
                html += `<div style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin:${actuales.length ? '4px' : '0'} 0 6px 0">Historial</div>`;
                html += `<div class="line-row-list">`;
                historial.forEach(w => { html += renderWorkHistoryRow(w, todayStr, daysBetween); });
                html += `</div>`;
            }
            html += `</div><div style="height:70px"></div>`;
            return html;
        }

        // Gráfico de bolas conectadas por flechas curvas — una bola por
        // trabajo, en orden cronológico (más antiguo a la izquierda). El
        // tamaño crece con los días trabajados ahí (raíz cuadrada, para que
        // el ÁREA sea proporcional, no el radio) con un límite en 365 días.
        // Reparte `label` en como mucho 2 líneas que quepan en `maxChars`
        // caracteres cada una (estimación por caracteres, no medida real de
        // texto) — la 2ª línea se trunca con "…" si aún sobra contenido.
        function wrapOvalLabel(label, maxChars) {
            const words = label.split(' ');
            const lines = [''];
            for (let i = 0; i < words.length; i++) {
                const w = words[i];
                const li = lines.length - 1;
                const candidate = lines[li] ? lines[li] + ' ' + w : w;
                if (candidate.length <= maxChars || !lines[li]) {
                    lines[li] = candidate;
                } else if (lines.length < 2) {
                    lines.push(w);
                } else {
                    lines[1] = (lines[1].length > maxChars - 1 ? lines[1].slice(0, maxChars - 1) : lines[1]) + '…';
                    return lines;
                }
            }
            return lines;
        }

        function renderWorkBubbleFlow(sortedByRecency) {
            const todayStr = todayISO();
            const daysBetween = (start, end) => countWorkingDays(start, end || todayStr);
            const chrono = [...sortedByRecency].sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
            const items = chrono.map(w => {
                const isActive = !w.endDate || w.endDate >= todayStr;
                const effectiveEnd = isActive ? todayStr : w.endDate;
                const calculatedDays = daysBetween(w.startDate, effectiveEnd);
                const manual = Number(w.cotizedDays);
                const days = Number.isFinite(manual) && manual >= 0 ? manual : calculatedDays;
                return { label: w.company || w.title || 'Empleo', days: Math.max(0, days) };
            });
            const n = items.length;
            if (!n) return '';
            // Óvalos (rx > ry) en vez de círculos — mucho más ancho que
            // alto, para que quepa el nombre completo de la empresa (hasta
            // 2 líneas) sin que se salga del contorno.
            const rxMin = 40, rxMax = 96, ryMin = 26, ryMax = 56;
            const scale = d => Math.sqrt(Math.min(d, 365) / 365);
            const gap = 30, cy = 150, amp = n > 1 ? 50 : 0;
            let x = rxMax + 10;
            const points = items.map((it, i) => {
                const t = scale(it.days);
                const rx = rxMin + (rxMax - rxMin) * t;
                const ry = ryMin + (ryMax - ryMin) * t;
                const cx = x + Math.max(rx, rxMin);
                x = cx + Math.max(rx, rxMin) + gap;
                return { cx, cy: cy + (i % 2 === 0 ? -amp : amp), rx, ry, r: (rx + ry) / 2 };
            });
            const totalWidth = Math.max(x, 200);
            const totalHeight = cy + amp + ryMax + 30;

            const arrows = [];
            for (let i = 0; i < n - 1; i++) {
                const a = points[i], b = points[i + 1];
                const dx = b.cx - a.cx, dy = b.cy - a.cy;
                const dist = Math.hypot(dx, dy) || 1;
                const ux = dx / dist, uy = dy / dist;
                const startX = a.cx + ux * a.r, startY = a.cy + uy * a.r;
                const endX = b.cx - ux * (b.r + 11), endY = b.cy - uy * (b.r + 11);
                const midX = (startX + endX) / 2, midY = (startY + endY) / 2;
                const perpX = -uy, perpY = ux;
                const curveAmount = 34 * (i % 2 === 0 ? 1 : -1);
                const ctrlX = midX + perpX * curveAmount, ctrlY = midY + perpY * curveAmount;
                const angleEnd = Math.atan2(endY - ctrlY, endX - ctrlX);
                const arrowLen = 9;
                const ax1 = endX - arrowLen * Math.cos(angleEnd - Math.PI / 7), ay1 = endY - arrowLen * Math.sin(angleEnd - Math.PI / 7);
                const ax2 = endX - arrowLen * Math.cos(angleEnd + Math.PI / 7), ay2 = endY - arrowLen * Math.sin(angleEnd + Math.PI / 7);
                arrows.push(`<path d="M${startX.toFixed(1)},${startY.toFixed(1)} Q${ctrlX.toFixed(1)},${ctrlY.toFixed(1)} ${endX.toFixed(1)},${endY.toFixed(1)}" fill="none" stroke="var(--text-secondary)" stroke-width="2"/>
                    <path d="M${endX.toFixed(1)},${endY.toFixed(1)} L${ax1.toFixed(1)},${ay1.toFixed(1)} M${endX.toFixed(1)},${endY.toFixed(1)} L${ax2.toFixed(1)},${ay2.toFixed(1)}" stroke="var(--text-secondary)" stroke-width="2" stroke-linecap="round"/>`);
            }

            const bubbles = points.map((p, i) => {
                const it = items[i];
                const fontSize = Math.max(9, Math.min(13, p.ry * 0.34));
                const maxChars = Math.max(6, Math.floor((p.rx * 1.7) / (fontSize * 0.56)));
                const lines = wrapOvalLabel(it.label, maxChars);
                const lineGap = fontSize * 1.15;
                const firstY = lines.length > 1 ? p.cy - lineGap * 0.5 + fontSize * 0.35 : p.cy + fontSize * 0.35;
                const nameLines = lines.map((ln, li) => `<text x="${p.cx.toFixed(1)}" y="${(firstY + li * lineGap).toFixed(1)}" text-anchor="middle" fill="#fff" font-size="${fontSize}" font-weight="800" font-family="Poppins, sans-serif">${escapeHtml(ln)}</text>`).join('');
                return `<ellipse cx="${p.cx.toFixed(1)}" cy="${p.cy.toFixed(1)}" rx="${p.rx.toFixed(1)}" ry="${p.ry.toFixed(1)}" fill="#000"/>
                    ${nameLines}`;
            }).join('');

            return `<div class="work-bubble-flow-wrap"><svg viewBox="0 0 ${totalWidth.toFixed(0)} ${totalHeight.toFixed(0)}" width="100%" style="display:block">${arrows.join('')}${bubbles}</svg></div>`;
        }

        function computeWorkDaysHere(w, todayStr, daysBetween) {
            const isActive = !w.endDate || w.endDate >= todayStr;
            const effectiveEnd = isActive ? todayStr : w.endDate;
            const calculatedDaysHere = daysBetween(w.startDate, effectiveEnd);
            const manualDaysHere = Number(w.cotizedDays);
            const daysHere = Number.isFinite(manualDaysHere) && manualDaysHere >= 0
                ? manualDaysHere
                : calculatedDaysHere;
            return { isActive, daysHere };
        }

        // Trabajo actual: tarjeta negra destacada arriba de todo (a la
        // manera de la fila resaltada de un calendario), con el número
        // grande de días totales a la derecha.
        function renderWorkCurrentCard(w, todayStr, daysBetween) {
            const { daysHere } = computeWorkDaysHere(w, todayStr, daysBetween);
            const scheduleText = (w.startTime || w.endTime) ? `${w.startTime || '--'} - ${w.endTime || '--'}` : (w
                .schedule || '');
            const heading = w.company || w.title;
            const subheading = [w.position, w.company ? w.title : ''].filter(Boolean).join(' · ');
            const modalidadLabel = WORK_MODALIDAD_LABELS[w.modalidad] || '';
            return `
                <div class="work-current-card" data-open-entry="${w.id}">
                    <div class="work-current-card-icon">${WORK_ICON_LAPTOP}</div>
                    <div class="work-current-card-body">
                        <div class="work-current-card-eyebrow">Empleo actual</div>
                        <div class="work-current-card-title">${escapeHtml(heading)}</div>
                        ${subheading ? `<div class="work-current-card-sub">${escapeHtml(subheading)}</div>` : ''}
                        <div class="work-current-card-meta">
                            <span>${w.startDate || ''} → Actual</span>
                            <span>${getCotizationDays(w, todayStr)} días cotizados · ${getCotizationSource(w)}</span>
                            ${modalidadLabel ? `<span>${modalidadLabel}</span>` : ''}
                            ${scheduleText ? `<span>${scheduleText}</span>` : ''}
                            ${w.salary ? `<span>${w.salary}€/mes</span>` : ''}
                        </div>
                        ${w.notes ? `<div style="font-size:13px;color:rgba(255,255,255,.75);margin-top:8px">${linkifyText(w.notes)}</div>` : ''}
                        ${w.logros ? `<div class="work-current-card-logros"><strong>Logros:</strong> ${linkifyText(w.logros)}</div>` : ''}
                    </div>
                    <div class="work-current-card-side">
                        <div class="work-current-card-days">${daysHere}</div>
                        <div class="work-current-card-days-label">días</div>
                    </div>
                </div>`;
        }

        // Historial: fila numerada (misma familia visual que Proyectos,
        // Viajes, Documentos...) con el total de días trabajados ahí como
        // número grande a la derecha, igual que las cifras de un calendario.
        function renderWorkHistoryRow(w, todayStr, daysBetween) {
            const { isActive, daysHere } = computeWorkDaysHere(w, todayStr, daysBetween);
            const heading = w.company || w.title;
            const subheading = [w.position, w.company ? w.title : ''].filter(Boolean).join(' · ');
            const dateRange = `${w.startDate || ''}${w.endDate ? ' → ' + w.endDate : ' → Actual'}`;
            const modalidadLabel = WORK_MODALIDAD_LABELS[w.modalidad] || '';
            const meta = [subheading, dateRange, modalidadLabel].filter(Boolean).join(' · ');
            return `
                <div class="line-row" data-open-entry="${w.id}">
                    <div class="line-row-icon">${WORK_ICON_LAPTOP}</div>
                    <div class="line-row-body">
                        <div class="line-row-title"><span class="line-row-title-text">${escapeHtml(heading)}</span></div>
                        <div class="line-row-meta">${escapeHtml(meta)}${!isActive && w.motivoSalida ? ' · ' + escapeHtml(w.motivoSalida) : ''}</div>
                    </div>
                    <div class="line-row-side">
                        <div class="work-history-days">${daysHere}</div>
                        <div class="work-history-days-label">días</div>
                    </div>
                </div>`;
        }

        // Genera un PDF descargable con el resumen de vida laboral (jsPDF,
        // cargado por CDN). Reutiliza los mismos cálculos que la vista en
        // pantalla para que ambos coincidan siempre.
        function generateWorkResumePDF() {
            if (typeof window.jspdf === 'undefined') { showToast('No se pudo cargar el generador de PDF', true); return; }
            const work = entries.filter(e => e.type === 'work');
            if (!work.length) { showToast('Añade primero experiencia laboral', true); return; }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ unit: 'pt', format: 'a4' });
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            const marginX = 48;
            let y = 0;

            const ACCENT = [59, 130, 246], DARK = [20, 20, 20], GRAY = [110, 110, 110], LIGHT_GRAY = [220, 220, 220];

            doc.setFillColor(...ACCENT);
            doc.rect(0, 0, pageW, 92, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
            doc.text('Resumen de vida laboral', marginX, 48);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
            doc.text(`${userName || 'Bitácora'} · generado el ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`, marginX, 70);
            y = 92 + 36;

            const todayStr = todayISO();
            const daysBetween = (start, end) => countWorkingDays(start, end || todayISO());
            const sorted = [...work].sort((a, b) => {
                const aActive = !a.endDate || a.endDate >= todayStr;
                const bActive = !b.endDate || b.endDate >= todayStr;
                if (aActive !== bActive) return aActive ? -1 : 1;
                return (b.startDate || '').localeCompare(a.startDate || '');
            });
            const totalDays = sorted.reduce((sum, w) => {
                const isActive = !w.endDate || w.endDate >= todayStr;
                const calculatedDays = daysBetween(w.startDate, isActive ? todayStr : w.endDate);
                const manual = Number(w.cotizedDays);
                return sum + (Number.isFinite(manual) && manual >= 0 ? manual : calculatedDays);
            }, 0);
            const cotizedStats = sorted.reduce((acc, w) => {
                const c = getCotizationDays(w, todayStr);
                if (w.cotizationType === 'practicas') acc.practicas += c; else acc.general += c;
                return acc;
            }, { practicas: 0, general: 0 });
            const totalCotized = cotizedStats.practicas + cotizedStats.general;
            const empresas = new Set(sorted.map(w => w.company).filter(Boolean)).size;

            const stats = [
                { label: 'Días trabajados', value: String(totalDays) },
                { label: 'Días cotizados', value: String(totalCotized) },
                { label: 'Empresas', value: String(empresas || sorted.length) }
            ];
            const cardGap = 12;
            const cardW = (pageW - marginX * 2 - cardGap * 2) / 3;
            stats.forEach((s, i) => {
                const x = marginX + i * (cardW + cardGap);
                doc.setDrawColor(...LIGHT_GRAY); doc.setLineWidth(1);
                doc.roundedRect(x, y, cardW, 60, 6, 6, 'S');
                doc.setTextColor(...DARK); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
                doc.text(s.value, x + 14, y + 34);
                doc.setTextColor(...GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
                doc.text(s.label.toUpperCase(), x + 14, y + 48);
            });
            y += 60 + 34;

            doc.setTextColor(...DARK); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
            doc.text('Experiencia', marginX, y);
            y += 14;
            doc.setDrawColor(...LIGHT_GRAY); doc.line(marginX, y, pageW - marginX, y);
            y += 22;

            const ensureSpace = (needed) => { if (y + needed > pageH - 50) { doc.addPage(); y = 50; } };

            sorted.forEach(w => {
                ensureSpace(70);
                const isActive = !w.endDate || w.endDate >= todayStr;
                const calculatedDaysHere = daysBetween(w.startDate, isActive ? todayStr : w.endDate);
                const manualDaysHere = Number(w.cotizedDays);
                const daysHere = Number.isFinite(manualDaysHere) && manualDaysHere >= 0 ? manualDaysHere : calculatedDaysHere;
                const heading = w.company || w.title || 'Puesto';
                const subheading = [w.position, w.company ? w.title : ''].filter(Boolean).join(' · ');

                doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...DARK);
                doc.text(heading, marginX, y);
                const badgeText = (isActive ? 'ACTUAL' : (w.status || 'FINALIZADO')).toUpperCase();
                doc.setFontSize(8);
                const badgeW = doc.getTextWidth(badgeText) + 14;
                doc.setFillColor(...(isActive ? ACCENT : [170, 170, 170]));
                doc.roundedRect(pageW - marginX - badgeW, y - 11, badgeW, 16, 8, 8, 'F');
                doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
                doc.text(badgeText, pageW - marginX - badgeW + 7, y);
                y += 16;

                if (subheading) {
                    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...GRAY);
                    doc.text(subheading, marginX, y);
                    y += 14;
                }
                const metaParts = [`${w.startDate || ''} ${w.endDate ? '→ ' + w.endDate : '→ Actual'}`, `${daysHere} días`];
                if (WORK_MODALIDAD_LABELS[w.modalidad]) metaParts.push(WORK_MODALIDAD_LABELS[w.modalidad]);
                if (w.salary) metaParts.push(`${w.salary}€/mes`);
                doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...GRAY);
                doc.text(metaParts.join('   ·   '), marginX, y);
                y += 16;

                if (w.logros) {
                    const logrosLines = doc.splitTextToSize(w.logros, pageW - marginX * 2 - 48);
                    ensureSpace(logrosLines.length * 12 + 10);
                    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...DARK);
                    doc.text('Logros:', marginX, y);
                    doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY);
                    doc.text(logrosLines, marginX + 42, y);
                    y += logrosLines.length * 12 + 6;
                }
                if (w.notes) {
                    const notesLines = doc.splitTextToSize(w.notes, pageW - marginX * 2);
                    ensureSpace(notesLines.length * 12 + 10);
                    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...GRAY);
                    doc.text(notesLines, marginX, y);
                    y += notesLines.length * 12 + 6;
                }
                y += 8;
                doc.setDrawColor(...LIGHT_GRAY); doc.line(marginX, y, pageW - marginX, y);
                y += 22;
            });

            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY);
                doc.text(`Bitácora · Página ${i} de ${pageCount}`, marginX, pageH - 24);
            }

            doc.save(`vida-laboral-${todayISO()}.pdf`);
        }

        // ============================================================
        //  IMPORTAR INFORME DE VIDA LABORAL (Seguridad Social, PDF)
        //  Todo el proceso ocurre en el propio navegador con pdf.js — el
        //  PDF nunca se sube a ningún sitio. El formato de la tabla se
        //  ajustó a partir de un informe real; como el texto extraído de
        //  un PDF nunca es 100% fiable, se muestra una revisión marcable
        //  antes de crear nada.
        // ============================================================
        function openWorkImportModal() {
            showModal(`
                <div class="modal-title">Importar Vida Laboral</div>
                <div class="doc-upload-box" onclick="document.getElementById('work-import-input').click()">
                    <div style="font-weight:500;margin-bottom:4px;color:var(--text-primary)">Elegir el PDF del Informe de Vida Laboral</div>
                    <div style="font-size:12px;color:var(--text-secondary)">Sede Electrónica de la Seguridad Social → Tu Seguridad Social → Informes y certificados → Informe de vida laboral</div>
                </div>
                <div style="font-size:11px;color:var(--text-secondary);margin-top:10px">El PDF se procesa aquí mismo, en tu navegador — no se sube a ningún servidor.</div>
                <input type="file" id="work-import-input" accept="application/pdf" style="display:none" onchange="handleWorkPdfImport(event)">
            `);
        }

        const WORK_IMPORT_REGIMENES = ['GENERAL', 'AUTONOMOS', 'AUTÓNOMOS', 'AGRARIO', 'MAR', 'CARBON', 'CARBÓN', 'HOGAR'];

        // pdf.js no garantiza que content.items llegue en orden de lectura
        // visual (en este tipo de informe, de hecho, no lo está). Hay que
        // reagrupar por línea (misma Y, con tolerancia) y ordenar cada
        // línea de izquierda a derecha antes de poder aplicar ningún regex.
        function extractPdfPageText(content) {
            const rows = [];
            content.items.forEach(it => {
                if (it.str === undefined) return;
                const y = it.transform[5];
                let row = rows.find(r => Math.abs(r.y - y) < 3);
                if (!row) { row = { y, items: [] }; rows.push(row); }
                row.items.push(it);
            });
            rows.sort((a, b) => b.y - a.y);
            return rows.map(r => r.items.sort((a, b) => a.transform[4] - b.transform[4]).map(it => it.str).join(' ')).join('\n');
        }

        function parseVidaLaboralDate(str) {
            const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((str || '').trim());
            return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
        }

        // Interpreta el texto ya extraído del PDF (una cadena por página,
        // unidas) y devuelve un borrador por cada periodo de alta. Cada fila
        // real puede venir seguida de: el nombre de la empresa partido en la
        // línea siguiente (si es largo), y/o una línea de guiones con el
        // texto de la "situación asimilada a la de alta" (p. ej. prácticas).
        function parseVidaLaboralText(fullText) {
            // A partir de "Notas aclaratorias" empiezan las páginas de
            // glosario del informe (sin tabla) — cortar ahí evita que ese
            // texto se cuele como "continuación" del último periodo real.
            const notesIdx = fullText.indexOf('Notas aclaratorias');
            const tableText = notesIdx >= 0 ? fullText.slice(0, notesIdx) : fullText;
            const regimenPattern = WORK_IMPORT_REGIMENES.join('|');
            const rowRegex = new RegExp(
                `^(${regimenPattern})\\s+\\d+\\s+(.+?)\\s+(\\d{2}\\.\\d{2}\\.\\d{4})\\s+\\d{2}\\.\\d{2}\\.\\d{4}\\s+(---|\\d{2}\\.\\d{2}\\.\\d{4})\\s+\\S+\\s+\\S+\\s+\\S+\\s+(\\d+)\\s*$`
            );
            const lines = tableText.split('\n').map(l => l.trim()).filter(Boolean);
            const rows = [];
            let current = null;
            for (const line of lines) {
                const m = rowRegex.exec(line);
                if (m) {
                    current = {
                        regimen: m[1],
                        company: m[2].replace(/\s+/g, ' ').trim(),
                        startDate: parseVidaLaboralDate(m[3]),
                        endDate: m[4] === '---' ? '' : parseVidaLaboralDate(m[4]),
                        cotizedDays: parseInt(m[5]) || 0,
                        situacion: '',
                        include: true
                    };
                    rows.push(current);
                } else if (/^-{5,}/.test(line)) {
                    // Línea de "situación asimilada a la de alta": el texto va
                    // entre el bloque de guiones inicial y los guiones finales.
                    const situ = line.replace(/^-+\s*-*\s*/, '').replace(/[\s-]+$/, '').trim();
                    if (current && situ) current.situacion = situ;
                } else if (current && line !== 'TVLCEAIM' && !/^(GENERAL|SITUACI|R[ÉE]GIMEN|EMPRESA|FECHA|REFERENCIAS|Id\. CEA|Este documento|DATOS IDENTIFICATIVOS|NOMBRE Y APELLIDOS)/i.test(line) && line.length < 60) {
                    // Continuación del nombre de la empresa en la línea siguiente.
                    current.company = (current.company + ' ' + line).replace(/\s+/g, ' ').trim();
                }
            }
            return rows;
        }

        async function handleWorkPdfImport(event) {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;
            if (typeof pdfjsLib === 'undefined') { showToast('No se pudo cargar el lector de PDF', true); return; }
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

            showToast('Leyendo el PDF...');
            try {
                const buffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
                let fullText = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    fullText += extractPdfPageText(content) + '\n';
                }

                const rows = parseVidaLaboralText(fullText);
                closeModal();
                if (!rows.length) {
                    showModal(`
                        <div class="modal-title">No se ha podido leer la tabla</div>
                        <div style="font-size:13px;color:var(--text-secondary)">No he reconocido ningún periodo en este PDF. Puede que el formato de tu informe difiera del habitual — añade tu experiencia manualmente con el botón +.</div>
                        <button class="btn-secondary" style="margin-top:12px" onclick="closeModal()">Entendido</button>
                    `);
                    return;
                }
                window._workImportDraft = rows;
                renderWorkImportReview();
            } catch (e) {
                console.error('Error leyendo el Informe de Vida Laboral:', e);
                closeModal();
                showToast('No se pudo leer el PDF', true);
            }
        }

        function renderWorkImportReview() {
            const rows = window._workImportDraft || [];
            showModal(`
                <div class="modal-title">Revisa antes de importar</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">He encontrado ${rows.length} periodo${rows.length === 1 ? '' : 's'}. Desmarca los que no quieras añadir — el texto de un PDF no siempre se lee perfecto, comprueba las fechas.</div>
                <div id="work-import-review-list" style="max-height:380px;overflow-y:auto">${renderWorkImportRows()}</div>
                <button class="btn-modal-primary" style="margin-top:14px" onclick="confirmWorkImport()">Importar seleccionados</button>
            `);
        }

        function renderWorkImportRows() {
            const rows = window._workImportDraft || [];
            return rows.map((r, i) => `
                <label class="weekly-task-row" style="align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border)">
                    <input type="checkbox" class="weekly-task-check" style="margin-top:2px" ${r.include ? 'checked' : ''} onchange="window._workImportDraft[${i}].include=this.checked">
                    <span class="weekly-task-text">
                        <strong>${escapeHtml(r.company)}</strong><br>
                        <span style="color:var(--text-secondary);font-size:11.5px">${r.startDate || '¿?'} → ${r.endDate || 'Actual'} · ${r.cotizedDays} días${r.situacion ? ' · ' + escapeHtml(r.situacion) : ''}</span>
                    </span>
                </label>`).join('');
        }

        async function confirmWorkImport() {
            const rows = (window._workImportDraft || []).filter(r => r.include);
            window._workImportDraft = null;
            if (!rows.length) { closeModal(); return; }
            rows.forEach(r => {
                const esPracticas = /pr[aá]cticas formativas/i.test(r.situacion || '');
                entries.push({
                    id: 'entry_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                    type: 'work',
                    company: r.company,
                    title: '',
                    position: '',
                    startDate: r.startDate,
                    endDate: r.endDate,
                    cotizedDays: r.cotizedDays,
                    cotizationType: esPracticas ? 'practicas' : 'general',
                    categoryId: 'cat_trabajo',
                    notes: 'Importado del Informe de Vida Laboral' + (r.situacion ? ` (${r.situacion})` : ''),
                    createdAt: new Date().toISOString()
                });
            });
            filteredEntries = [...entries];
            closeModal();
            render();
            try { await saveData(); showToast(`${rows.length} periodo${rows.length === 1 ? '' : 's'} importado${rows.length === 1 ? '' : 's'}`); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // ============================================================
        //  RENDER: ESTUDIOS
        // ============================================================
        function findSubject(id) { return studies.subjects.find(s => s.id === id); }

        function nextUpcomingExam() {
            const today = todayISO();
            let best = null;
            studies.subjects.forEach(s => {
                (s.exams || []).forEach(ex => {
                    if (ex.date && ex.date >= today && (!best || ex.date < best.date)) {
                        best = { title: ex.title, date: ex.date, subjectName: s.name, subjectColor: s.color };
                    }
                });
            });
            return best;
        }

        // Créditos (ECTS) de una asignatura, si se han rellenado — se usan
        // como peso en la nota media del expediente; las asignaturas sin
        // créditos cuentan con peso 1, para no obligar a rellenarlos todos.
        function subjectCreditsWeight(s) {
            const c = Number(s.creditos);
            return Number.isFinite(c) && c > 0 ? c : null;
        }

        function studiesExpediente() {
            const subjects = studies.subjects || [];
            let aprobadas = 0, suspensas = 0, pendientes = 0;
            let sumGradeWeighted = 0, sumWeight = 0;
            let creditosSuperados = 0, creditosTotales = 0, hasCreditos = false;
            subjects.forEach(s => {
                const grade = subjectFinalGrade(s);
                const credits = subjectCreditsWeight(s);
                if (credits !== null) {
                    hasCreditos = true;
                    creditosTotales += credits;
                    if (grade !== null && grade >= 5) creditosSuperados += credits;
                }
                if (grade === null) { pendientes++; return; }
                if (grade >= 5) aprobadas++; else suspensas++;
                const w = credits !== null ? credits : 1;
                sumGradeWeighted += grade * w;
                sumWeight += w;
            });
            const media = sumWeight > 0 ? sumGradeWeighted / sumWeight : null;
            return { total: subjects.length, aprobadas, suspensas, pendientes, media, hasCreditos, creditosSuperados, creditosTotales };
        }

        function gradeTierClass(grade) {
            if (grade >= 9) return 'nota-matricula';
            if (grade >= 5) return 'nota-aprobado';
            return 'nota-suspenso';
        }

        function renderStudiesExpediente() {
            const ex = studiesExpediente();
            if (!ex.total) return '';
            return `
                <section class="studies-section" id="studies-expediente-section">
                    <h3>Expediente</h3>
                    <div class="studies-expediente-grid">
                        <div class="card bone-surface" style="margin:0">
                            <div class="label" style="font-size:12px;color:var(--bone-muted);text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Nota media${ex.hasCreditos ? ' (ponderada por créditos)' : ''}</div>
                            <div class="value" style="font-size:28px;font-weight:700;color:var(--bone-text);margin-top:4px">${ex.media !== null ? `<span class="nota-final ${gradeTierClass(ex.media)}" style="font-size:28px;padding:0">${ex.media.toFixed(2)}</span>` : '—'}</div>
                        </div>
                        <div class="card bone-surface" style="margin:0">
                            <div class="label" style="font-size:12px;color:var(--bone-muted);text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Asignaturas</div>
                            <div style="font-size:13px;color:var(--bone-text);margin-top:6px">
                                <strong style="color:#16a34a">${ex.aprobadas}</strong> aprobadas · <strong style="color:#dc2626">${ex.suspensas}</strong> suspensas · <strong>${ex.pendientes}</strong> pendientes
                            </div>
                            ${ex.hasCreditos ? `<div style="font-size:11px;color:var(--bone-muted);margin-top:6px">${ex.creditosSuperados} / ${ex.creditosTotales} créditos superados</div>` : ''}
                        </div>
                    </div>
                </section>`;
        }

        function renderStudies() {
            const nextExam = nextUpcomingExam();
            return `
            <div class="studies-view">
                ${nextExam ? `
                <div class="event-hero" style="border-color:${(nextExam.subjectColor || '#3b82f6')}66;margin-bottom:18px">
                    <div class="event-hero-body">
                        <div class="event-hero-kicker" style="color:${nextExam.subjectColor || '#3b82f6'}">Próximo examen · ${eventCountdownLabel(nextExam.date)}</div>
                        <div class="event-hero-title">${escapeHtml(nextExam.title || 'Examen')} — ${escapeHtml(nextExam.subjectName)}</div>
                        <div class="event-hero-meta">${escapeHtml(nextExam.date)}</div>
                    </div>
                </div>` : ''}

                <section class="studies-section" id="studies-schedule-section">
                    <h3>Horario semanal</h3>
                    ${renderScheduleGrid()}
                </section>

                <div class="studies-actions-row studies-actions-row-center">
                    <div class="studies-actions-stack">
                        <button class="btn-modal-primary studies-inline-add-btn btn-accent-blue" onclick="openAddSubject()">+ asignatura</button>
                        <button class="btn-modal-primary studies-inline-add-btn" onclick="openAddQuickNote()">+ nota rápida</button>
                        <button class="btn-modal-primary studies-inline-add-btn" onclick="openQuickNotesList()">notas rápidas${(studies.quickNotes || []).length ? ` (${studies.quickNotes.length})` : ''}</button>
                    </div>
                </div>

                <section class="studies-section" id="studies-subjects-section">
                    <h3>Asignaturas${apartadoVisible('universidad') && cuatriActual() ? ` <button class="studies-uni-link" onclick="switchView('universidad')">${nombreCuatri(cuatriActual(), true)} ver la carrera →</button>` : ''}</h3>
                    ${asignaturasEnCurso().length ? `<div class="studies-subjects-list">${asignaturasEnCurso().map((s, i, l) => renderSubjectRow(s, i, l.length)).join('')}</div>` : '<div class="finance-empty-line">Aún no has añadido ninguna asignatura.</div>'}
                </section>
            </div>`;
        }

        // ---- Notas rápidas: lista corta, para apuntes largos está el notebook por asignatura ----
        function openAddQuickNote() {
            showModal(`
                <div class="modal-title">Nueva nota rápida</div>
                <textarea id="quick-note-text" class="studies-notes-box" style="min-height:120px" placeholder="Cosas para recordar otro día..."></textarea>
                <button class="btn-modal-primary" onclick="saveQuickNote()">Guardar</button>
            `);
            setTimeout(() => document.getElementById('quick-note-text')?.focus(), 50);
        }

        async function saveQuickNote() {
            const text = document.getElementById('quick-note-text')?.value.trim();
            if (!text) { showToast('Escribe algo antes de guardar', true); return; }
            studies.quickNotes = studies.quickNotes || [];
            studies.quickNotes.unshift({ id: 'qn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), text, createdAt: new Date().toISOString() });
            closeModal();
            showToast('Nota guardada');
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openQuickNotesList() {
            showModal(renderQuickNotesModal());
        }

        function renderQuickNotesModal() {
            const notes = studies.quickNotes || [];
            return `
                <div class="modal-title">Notas rápidas</div>
                ${notes.length ? notes.map(n => `
                    <div class="studies-quicknote-row">
                        <div class="studies-quicknote-text">${linkifyText(n.text)}</div>
                        <div class="studies-quicknote-meta">
                            <span>${new Date(n.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            <button title="Eliminar" onclick="deleteQuickNote('${n.id}')">✕</button>
                        </div>
                    </div>`).join('') : '<div class="finance-empty-line">Aún no hay notas rápidas.</div>'}
            `;
        }

        async function deleteQuickNote(id) {
            studies.quickNotes = (studies.quickNotes || []).filter(n => n.id !== id);
            openQuickNotesList();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

