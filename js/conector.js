        // ============================================================
        //  CONECTOR CLAUDE / CHATGPT (ver supabase/functions/bitacora-mcp)
        //  Lo que el usuario pide apuntar desde Claude o ChatGPT llega a
        //  conector_bandeja en vez de a sus datos: la app abierta guarda su
        //  estado en memoria y habría pisado el cambio. Aquí se incorpora
        //  con la misma lógica que el resto de la app (ids "ia_<fila>", así
        //  dos dispositivos abiertos a la vez no lo duplican), se guarda y se
        //  vacía la bandeja.
        // ============================================================
        const CONECTOR_URL = SUPABASE_URL + '/functions/v1/bitacora-mcp/';
        let aplicandoBandeja = false;

        const REGISTRO_CONECTOR_MAX = 300;

        function localizarTareaConector(id) {
            resetDayPlannerIfNeeded();
            let i = dayPlanner.backlog.findIndex(t => t.id === id);
            if (i >= 0) return { lista: dayPlanner.backlog, i, dia: null };
            for (const k of Object.keys(dayPlanner.days)) {
                i = (dayPlanner.days[k] || []).findIndex(t => t.id === id);
                if (i >= 0) return { lista: dayPlanner.days[k], i, dia: k };
            }
            return null;
        }

        function localizarConector(coleccion, id) {
            if (coleccion === 'tarea') return localizarTareaConector(id);
            const lista = coleccion === 'evento' ? entries : coleccion === 'movimiento' ? financePro.transactions : null;
            const i = lista ? lista.findIndex(x => x.id === id) : -1;
            return i >= 0 ? { lista, i, dia: null } : null;
        }

        function insertarConector(coleccion, item, dia, i) {
            let lista;
            if (coleccion === 'evento') lista = entries;
            else if (coleccion === 'movimiento') lista = financePro.transactions;
            else if (dia) lista = dayPlanner.days[dia] = Array.isArray(dayPlanner.days[dia]) ? dayPlanner.days[dia] : [];
            else lista = dayPlanner.backlog;
            lista.splice(Math.min(Math.max(0, i ?? lista.length), lista.length), 0, item);
        }

        // Igual que al marcarla a mano (togglePlannerItemDone): una tarea
        // del día hecha deja constancia en el calendario y, si viene de un
        // trabajo de Estudios, lo marca también.
        function marcarTareaConector(item, enDia, hecha) {
            item.done = hecha;
            if (!enDia) return;
            if (item.linkedAssignmentId) { const a = findAssignmentById(item.linkedAssignmentId); if (a) a.done = hecha; }
            const logId = 'planner_done_' + item.id;
            entries = entries.filter(e => e.id !== logId);
            if (hecha) entries.push({ id: logId, type: 'event', eventType: 'otro', title: 'Completado: ' + item.title, date: todayISO(), time: item.time || '', place: '', notes: item.notes || '', category: 'Planificador', calendarLog: true });
        }

        // Misma lógica que moverTarea en la función del conector: con día y
        // hora va a la línea de ese día; sin alguno de los dos, a "tareas
        // pendientes".
        function moverTareaConector(id, c) {
            const loc = localizarTareaConector(id);
            if (!loc) return false;
            const it = loc.lista[loc.i];
            if (c.titulo !== undefined) it.title = c.titulo;
            if (c.notas !== undefined) it.notes = c.notas;
            if (c.fecha !== undefined || c.hora !== undefined || c.sinFecha) {
                const dia = c.sinFecha ? null : (c.fecha || loc.dia);
                const hora = c.sinFecha ? '' : (c.hora || it.time || '');
                loc.lista.splice(loc.i, 1);
                if (dia && hora) { it.time = hora; insertarConector('tarea', it, dia); }
                else { delete it.time; dayPlanner.backlog.unshift(it); }
            }
            if (c.hecha !== undefined) marcarTareaConector(it, !!localizarTareaConector(id)?.dia, !!c.hecha);
            return true;
        }

        // Aplica una operación de la bandeja y devuelve su línea del registro
        // (o null si ya estaba aplicada o ya no hay a qué aplicarla).
        function aplicarOpConector(op, ref) {
            const linea = (tipo, resumen, deshacer) => ({ id: ref, cuando: new Date().toISOString(), tipo, resumen, deshacer });
            const corto = t => { const x = String(t || '').trim(); return x.length > 70 ? x.slice(0, 70) + '…' : x; };
            if (op.tipo === 'evento') {
                if (entries.some(e => e.id === ref)) return null;
                entries.push({ id: ref, title: op.titulo, type: 'event', categoryId: getCategoryIdForType('event'), tags: [], eventType: op.eventType || 'otro', date: op.fecha, time: op.hora || '', place: op.lugar || '', notes: op.notas || '' });
                filteredEntries = [...entries];
                return linea('evento', `evento «${corto(op.titulo)}» el ${op.fecha}${op.hora ? ' a las ' + op.hora : ''}.`, { accion: 'quitar', coleccion: 'evento', id: ref });
            }
            if (op.tipo === 'tarea') {
                if (localizarTareaConector(ref)) return null;
                if (op.fecha && op.hora) insertarConector('tarea', { id: ref, time: op.hora, title: op.titulo, notes: op.notas || '', done: false }, op.fecha);
                else dayPlanner.backlog.unshift({ id: ref, title: op.titulo, notes: [op.fecha ? 'para el ' + op.fecha : '', op.notas || ''].filter(Boolean).join(' · '), done: false });
                return linea('tarea', `tarea «${corto(op.titulo)}»${op.fecha && op.hora ? ` el ${op.fecha} a las ${op.hora}` : ' en tareas pendientes'}.`, { accion: 'quitar', coleccion: 'tarea', id: ref });
            }
            if (op.tipo === 'movimiento') {
                if (financePro.transactions.some(t => t.id === ref)) return null;
                financePro.transactions.push({ id: ref, date: op.fecha, account: op.cuenta, type: op.type, amount: op.importe, category: op.categoria || undefined, note: op.concepto || undefined, manual: true, needsReview: !op.categoria });
                return linea('movimiento', `${op.type === 'income' ? 'ingreso' : 'gasto'} de ${financeMoney(op.importe)} · ${corto(op.concepto)} (${op.fecha}).`, { accion: 'quitar', coleccion: 'movimiento', id: ref });
            }
            if (op.tipo === 'nota') {
                const fecha = op.fecha || todayISO();
                let nota = notes.find(n => n.date === fecha);
                if (!nota) { nota = { id: 'note_' + Date.now(), date: fecha, content: '', createdAt: new Date().toISOString() }; notes.push(nota); }
                nota.refsConector = Array.isArray(nota.refsConector) ? nota.refsConector : [];
                if (nota.refsConector.includes(ref)) return null;
                const antes = { content: nota.content || '', title: nota.title };
                const titulo = String(op.titulo || '').trim();
                const usaTitulo = titulo && !nota.title && !String(nota.content || '').trim();
                if (usaTitulo) nota.title = titulo;
                const texto = [usaTitulo ? '' : titulo, op.texto].map(x => String(x || '').trim()).filter(Boolean).join('\n');
                nota.content = [nota.content, texto].filter(Boolean).join('\n\n');
                nota.refsConector.push(ref);
                return linea('nota', `en la nota del ${fecha}: «${corto(titulo || op.texto)}».`, { accion: 'nota', notaId: nota.id, antes, despues: nota.content, titulo: usaTitulo ? titulo : '' });
            }
            if (op.tipo === 'entrada') {
                const ev = entries.find(e => e.id === op.eventoId);
                if (!ev) return null;
                ev.entradas = Array.isArray(ev.entradas) ? ev.entradas : [];
                if (ev.entradas.some(x => x.id === ref || (op.qrB64 && x.qrB64 === op.qrB64) || (!op.qrB64 && op.qr && x.qr === op.qr))) return null;
                ev.entradas.push({ id: ref, qr: op.qr || '', qrB64: op.qrB64 || undefined, etiqueta: op.etiqueta || '' });
                return linea('entrada', `entrada con QR para «${corto(ev.title)}».`, { accion: 'entrada', eventoId: ev.id, id: ref });
            }
            if (op.tipo === 'entrada_crear') {
                if (entries.some(e => e.id === ref)) return null;
                const datos = { ...(op.datos || {}) };
                delete datos.sinValidar;
                entries.push({ id: ref, type: op.entryType, categoryId: getCategoryIdForType(op.entryType), tags: [], ...datos });
                filteredEntries = [...entries];
                if (op.entryType === 'travel') geocodificarItinerarioViaje(entries[entries.length - 1]);
                return linea(ENTRADA_TIPO_REGISTRO[op.entryType] || 'entrada', `${ENTRADA_NOMBRE[op.entryType] || 'entrada'} «${corto(datos.title)}»${op.entryType === 'travel' && datos.date ? ' · ' + datos.date : ''}${op.entryType === 'document' && datos.date ? ' · caduca ' + datos.date : ''}${op.entryType === 'birthday' && datos.date ? ' · ' + datos.date.slice(8) + '/' + datos.date.slice(5, 7) : ''}${op.entryType === 'subscription' || op.entryType === 'fixed_expense' ? ` · ${financeMoney(datos.amount)} el día ${datos.renewalDay}` : ''}.`, { accion: 'quitar', coleccion: 'evento', id: ref });
            }
            if (op.tipo === 'entrada_editar') {
                const e = entries.find(x => x.id === op.id);
                if (!e) return null;
                const antes = {};
                Object.keys(op.datos || {}).forEach(k => { antes[k] = e[k]; });
                Object.assign(e, op.datos || {});
                filteredEntries = [...entries];
                if (op.entryType === 'travel') geocodificarItinerarioViaje(e);
                const d = op.datos || {};
                const que = [d.active === false ? 'baja' : d.active === true ? 'reactivada' : '', d.amount ? financeMoney(d.amount) : '', d.renewalDay ? 'día ' + d.renewalDay : '', d.currentValue !== undefined ? `${d.currentValue}${e.targetValue ? ' de ' + e.targetValue : ''} ${e.unit || ''}`.trim() : '', d.status || '', d.startDate || d.endDate ? [d.startDate, d.endDate].filter(Boolean).join(' → ') : '', d.expenses ? 'gastos actualizados' : '', ...reservasTexto(d, antes)].filter(Boolean).join(', ');
                return linea(ENTRADA_TIPO_REGISTRO[op.entryType] || 'cambio', `${ENTRADA_NOMBRE[op.entryType] || 'entrada'} «${corto(e.title)}»: ${que || 'cambiado'}.`, { accion: 'restaurar', id: e.id, antes });
            }
            if (op.tipo === 'deseo') {
                ensureLongTermData();
                const lista = financeProfile.wishlist;
                if (op.accion === 'quitar') {
                    const i = lista.findIndex(x => x.id === op.id);
                    if (i < 0) return null;
                    const item = lista.splice(i, 1)[0];
                    return linea('deseo', `quitado de deseos: «${corto(item.title)}».`, { accion: 'deseo_reponer', item, i });
                }
                if (lista.some(x => x.id === ref)) return null;
                lista.push({ id: ref, title: op.titulo, price: Number(op.precio) || 0 });
                return linea('deseo', `deseo «${corto(op.titulo)}»${op.precio ? ' · ' + financeMoney(op.precio) : ''}.`, { accion: 'deseo_quitar', id: ref });
            }
            if (op.tipo === 'habito') {
                if (op.accion === 'crear') {
                    if (habits.some(h => h.id === ref)) return null;
                    habits.push({ id: ref, texto: op.texto, activo: true, completadas: {} });
                    return linea('hábito', `hábito nuevo «${corto(op.texto)}».`, { accion: 'habito_quitar', id: ref });
                }
                const h = habits.find(x => x.id === op.id);
                if (!h) return null;
                const antes = h.activo;
                h.activo = !!op.activo;
                return linea('hábito', `hábito «${corto(h.texto)}» ${op.activo ? 'reactivado' : 'en pausa'}.`, { accion: 'habito_activo', id: h.id, antes });
            }
            if (op.tipo === 'tarea_recurrente') {
                if (op.accion === 'crear') {
                    if (recurringTasks.some(t => t.id === ref)) return null;
                    recurringTasks.push({ id: ref, activo: true, completadas: {}, ...(op.datos || {}) });
                    return linea('recurrente', `tarea recurrente «${corto(op.datos?.texto)}» (${op.datos?.frecuencia}).`, { accion: 'recurrente_quitar', id: ref });
                }
                const t = recurringTasks.find(x => x.id === op.id);
                if (!t) return null;
                const antes = t.activo;
                t.activo = !!op.activo;
                return linea('recurrente', `tarea recurrente «${corto(t.texto)}» ${op.activo ? 'reactivada' : 'en pausa'}.`, { accion: 'recurrente_activo', id: t.id, antes });
            }
            if (op.tipo === 'enlace') {
                if (links.some(l => l.id === ref || l.url === op.url)) return null;
                links.unshift({ id: ref, title: op.titulo, url: op.url, categoryId: op.categoryId || '', createdAt: new Date().toISOString() });
                return linea('enlace', `enlace «${corto(op.titulo)}».`, { accion: 'enlace_quitar', id: ref });
            }
            if (op.tipo === 'clase') {
                const lista = studies.schedule[op.dia] = Array.isArray(studies.schedule[op.dia]) ? studies.schedule[op.dia] : [];
                const dia = (STUDIES_DAYS.find(d => d.key === op.dia)?.label || op.dia).toLowerCase();
                if (op.accion === 'quitar') {
                    const i = lista.findIndex(b => b.time === op.hora && stripAccents(String(b.subject).toLowerCase()) === stripAccents(String(op.texto).toLowerCase()));
                    if (i < 0) return null;
                    const bloque = lista.splice(i, 1)[0];
                    return linea('horario', `quitada del horario: «${corto(bloque.subject)}» el ${dia} a las ${bloque.time}.`, { accion: 'clase_reponer', dia: op.dia, bloque });
                }
                if (lista.some(b => b.time === op.hora && b.subject === op.texto)) return null;
                lista.push({ time: op.hora, subject: op.texto });
                lista.sort((a, b) => String(a.time).localeCompare(String(b.time)));
                return linea('horario', `clase «${corto(op.texto)}» el ${dia} a las ${op.hora}.`, { accion: 'clase_quitar', dia: op.dia, bloque: { time: op.hora, subject: op.texto } });
            }
            if (op.tipo === 'estudio_crear') {
                const asig = findSubject(op.subjectId);
                if (!asig) return null;
                asig[op.lista] = asig[op.lista] || [];
                if (asig[op.lista].some(x => x.id === ref)) return null;
                const item = { id: ref, title: '', date: '', grade: '', weight: '', done: false, ...(op.item || {}) };
                asig[op.lista].push(item);
                syncExamCalendarEvent(asig, op.lista, item);
                if (op.lista === 'assignments') syncAssignmentPlannerItem(asig, item);
                filteredEntries = [...entries];
                return linea('estudios', `${op.lista === 'exams' ? 'examen' : 'trabajo'} «${corto(item.title)}» en ${asig.name.toLowerCase()}${item.date ? ' el ' + item.date : ''}${item.time ? ' a las ' + item.time : ''}.`, { accion: 'estudio_quitar', subjectId: asig.id, lista: op.lista, id: ref });
            }
            if (op.tipo === 'estudio_editar') {
                const asig = findSubject(op.subjectId);
                const item = asig?.[op.lista]?.find(x => x.id === op.id);
                if (!item) return null;
                const antes = {};
                Object.keys(op.cambios || {}).forEach(k => { antes[k] = item[k]; });
                Object.assign(item, op.cambios || {});
                syncExamCalendarEvent(asig, op.lista, item);
                if (op.lista === 'assignments') syncAssignmentPlannerItem(asig, item);
                filteredEntries = [...entries];
                const c = op.cambios || {};
                const que = [c.grade !== undefined ? `nota ${c.grade}` : '', c.done === true ? 'entregado' : c.done === false ? 'pendiente' : '', c.date ? 'fecha ' + c.date : '', c.time ? 'hora ' + c.time : '', c.weight ? `peso ${c.weight} %` : '', c.title ? 'nuevo título' : ''].filter(Boolean).join(', ');
                return linea('estudios', `«${corto(op.resumen)}»: ${que || 'cambiado'}.`, { accion: 'estudio_restaurar', subjectId: asig.id, lista: op.lista, id: item.id, antes });
            }
            if (op.tipo === 'ocio') {
                const nombre = { book: 'libro', movie: 'película', series: 'serie', game: 'videojuego' }[op.entryType] || 'ocio';
                if (op.id) {
                    const e = entries.find(x => x.id === op.id);
                    if (!e) return null;
                    const antes = {};
                    Object.keys(op.datos || {}).forEach(k => { antes[k] = e[k]; });
                    Object.assign(e, op.datos || {});
                    if (e.type === 'movie' && op.datos?.rating > 0) completarTareaValorarPelicula(e.id);
                    filteredEntries = [...entries];
                    const que = [op.datos?.endDate ? 'terminado' : '', op.datos?.rating ? `${op.datos.rating}/5` : '', op.datos?.status && !op.datos?.endDate ? op.datos.status.toLowerCase() : ''].filter(Boolean).join(', ');
                    return linea('ocio', `${nombre} «${corto(e.title)}»${que ? ': ' + que : ' actualizado'}.`, { accion: 'restaurar', id: e.id, antes });
                }
                if (entries.some(e => e.id === ref)) return null;
                entries.push({ id: ref, type: op.entryType, categoryId: getCategoryIdForType(op.entryType), tags: [], date: '', ...(op.datos || {}), title: op.titulo });
                filteredEntries = [...entries];
                return linea('ocio', `${nombre} «${corto(op.titulo)}» añadido a ocio.`, { accion: 'quitar', coleccion: 'evento', id: ref });
            }
            if (op.tipo === 'editar_evento') {
                const ev = entries.find(e => e.id === op.id);
                if (!ev) return null;
                const antes = {};
                Object.keys(op.cambios || {}).forEach(k => { antes[k] = ev[k]; });
                Object.assign(ev, op.cambios || {});
                filteredEntries = [...entries];
                return linea('cambio', `cambiado el evento «${corto(ev.title)}»${op.cambios?.date ? ' al ' + op.cambios.date : ''}${op.cambios?.time ? ' a las ' + op.cambios.time : ''}.`, { accion: 'restaurar', id: ev.id, antes });
            }
            if (op.tipo === 'editar_movimiento') {
                const t = financePro.transactions.find(x => x.id === op.id);
                if (!t) return null;
                const antes = JSON.parse(JSON.stringify(t));
                Object.assign(t, op.cambios || {});
                if (op.cambios?.category) { t.needsReview = false; delete t.categoriaAuto; }
                const cat = op.cambios?.category ? financeProCategoryById(op.cambios.category)?.name : '';
                return linea('cambio', `corregido «${corto(op.resumen)}»${cat ? ' → ' + cat.toLowerCase() : ''}.`, { accion: 'reemplazar', id: t.id, antes });
            }
            if (op.tipo === 'editar_tarea') {
                const loc = localizarTareaConector(op.id);
                if (!loc) return null;
                const antes = { item: JSON.parse(JSON.stringify(loc.lista[loc.i])), dia: loc.dia, i: loc.i };
                moverTareaConector(op.id, op.cambios || {});
                const c = op.cambios || {};
                const que = [c.hecha === true ? 'hecha' : c.hecha === false ? 'pendiente otra vez' : '', c.sinFecha ? 'a tareas pendientes' : (c.fecha || c.hora) ? `al ${c.fecha || antes.dia || 'mismo día'}${c.hora ? ' a las ' + c.hora : ''}` : '', c.titulo ? 'nuevo título' : ''].filter(Boolean).join(', ');
                return linea('cambio', `tarea «${corto(op.resumen)}»: ${que || 'cambiada'}.`, { accion: 'tarea', id: op.id, antes });
            }
            if (op.tipo === 'borrar') {
                const loc = localizarConector(op.coleccion, op.id);
                if (!loc) return null;
                const item = loc.lista.splice(loc.i, 1)[0];
                if (op.coleccion === 'tarea' && item.done && loc.dia) marcarTareaConector({ ...item }, true, false);
                if (op.coleccion === 'evento') filteredEntries = [...entries];
                return linea('borrado', `borrado: ${corto(op.resumen)}.`, { accion: 'reinsertar', coleccion: op.coleccion, item, dia: loc.dia, i: loc.i });
            }
            if (op.tipo === 'dia') {
                const antes = { esfuerzo: dailyEffort[op.fecha] || 0, habitos: {} };
                const partes = [];
                if (op.esfuerzo) { dailyEffort[op.fecha] = op.esfuerzo; partes.push('esfuerzo ' + op.esfuerzo); }
                habits.forEach(h => {
                    const si = (op.hechos || []).includes(h.id), no = (op.noHechos || []).includes(h.id);
                    if (!si && !no) return;
                    h.completadas = h.completadas || {};
                    antes.habitos[h.id] = !!h.completadas[op.fecha];
                    if (si) h.completadas[op.fecha] = true; else delete h.completadas[op.fecha];
                    partes.push(`${h.texto.toLowerCase()} ${si ? '✓' : '✗'}`);
                });
                if (!partes.length) return null;
                return linea('dia', `día ${op.fecha}: ${partes.join(', ')}.`, { accion: 'dia', fecha: op.fecha, antes });
            }
            if (op.tipo === 'importar') {
                const antes = new Map(financePro.transactions.map(t => [t.id, JSON.stringify(t)]));
                const imp = financeProPrepararImport(op.csv, op.cuenta);
                if (!imp) return linea('importar', 'extracto recibido pero no se ha podido leer.', null);
                const r = financeProEjecutarImport(imp);
                const despues = new Map(financePro.transactions.map(t => [t.id, JSON.stringify(t)]));
                const anadidos = [...despues.keys()].filter(id => !antes.has(id));
                const modificados = [...antes].filter(([id, j]) => despues.has(id) && despues.get(id) !== j).map(([, j]) => JSON.parse(j));
                const quitados = [...antes].filter(([id]) => !despues.has(id)).map(([, j]) => JSON.parse(j));
                return linea('importar', `extracto en ${financePro.accounts[imp.mapping.account]?.name || imp.mapping.account}: ${financeProResumenImport(r)}.`, { accion: 'importar', anadidos, modificados, quitados });
            }
            return null;
        }

        async function deshacerConector(id) {
            const l = registroConector.find(x => x.id === id);
            if (!l || l.deshecho || !l.deshacer) return;
            if (!confirm(`¿Deshacer esto?\n\n${l.resumen}`)) return;
            const d = l.deshacer;
            if (d.accion === 'quitar') {
                const loc = localizarConector(d.coleccion, d.id);
                if (loc) { const it = loc.lista.splice(loc.i, 1)[0]; if (d.coleccion === 'tarea' && it?.done && loc.dia) marcarTareaConector({ ...it }, true, false); }
            } else if (d.accion === 'nota') {
                const n = notes.find(x => x.id === d.notaId);
                const anadido = String(d.despues || '').slice(String(d.antes?.content || '').length);
                if (n && anadido && String(n.content || '').includes(anadido)) n.content = String(n.content).replace(anadido, '').trim();
                if (n && d.titulo && n.title === d.titulo) delete n.title;
            } else if (d.accion === 'entrada') {
                const ev = entries.find(e => e.id === d.eventoId);
                if (ev?.entradas) ev.entradas = ev.entradas.filter(x => x.id !== d.id);
            } else if (d.accion === 'restaurar') {
                const ev = entries.find(e => e.id === d.id);
                if (ev) Object.assign(ev, d.antes);
            } else if (d.accion === 'reemplazar') {
                const i = financePro.transactions.findIndex(t => t.id === d.id);
                if (i >= 0) financePro.transactions[i] = d.antes;
            } else if (d.accion === 'tarea') {
                const loc = localizarTareaConector(d.id);
                if (loc) {
                    const actual = loc.lista.splice(loc.i, 1)[0];
                    if (actual.done !== d.antes.item.done && (loc.dia || d.antes.dia)) marcarTareaConector({ ...d.antes.item }, true, !!d.antes.item.done);
                }
                insertarConector('tarea', d.antes.item, d.antes.dia, d.antes.i);
            } else if (d.accion === 'reinsertar') {
                insertarConector(d.coleccion, d.item, d.dia, d.i);
                if (d.coleccion === 'tarea' && d.item.done && d.dia) marcarTareaConector({ ...d.item }, true, true);
            } else if (d.accion === 'dia') {
                if (d.antes.esfuerzo) dailyEffort[d.fecha] = d.antes.esfuerzo; else delete dailyEffort[d.fecha];
                Object.entries(d.antes.habitos || {}).forEach(([hid, hecho]) => {
                    const h = habits.find(x => x.id === hid);
                    if (!h) return;
                    h.completadas = h.completadas || {};
                    if (hecho) h.completadas[d.fecha] = true; else delete h.completadas[d.fecha];
                });
            } else if (d.accion === 'deseo_quitar') {
                financeProfile.wishlist = (financeProfile.wishlist || []).filter(x => x.id !== d.id);
            } else if (d.accion === 'deseo_reponer') {
                ensureLongTermData();
                if (!financeProfile.wishlist.some(x => x.id === d.item.id)) financeProfile.wishlist.splice(Math.min(d.i, financeProfile.wishlist.length), 0, d.item);
            } else if (d.accion === 'habito_quitar') {
                habits = habits.filter(h => h.id !== d.id);
            } else if (d.accion === 'habito_activo') {
                const h = habits.find(x => x.id === d.id); if (h) h.activo = d.antes;
            } else if (d.accion === 'recurrente_quitar') {
                recurringTasks = recurringTasks.filter(t => t.id !== d.id);
            } else if (d.accion === 'recurrente_activo') {
                const t = recurringTasks.find(x => x.id === d.id); if (t) t.activo = d.antes;
            } else if (d.accion === 'enlace_quitar') {
                links = links.filter(l => l.id !== d.id);
            } else if (d.accion === 'clase_quitar') {
                const lista = studies.schedule[d.dia] || [];
                const i = lista.findIndex(b => b.time === d.bloque.time && b.subject === d.bloque.subject);
                if (i >= 0) lista.splice(i, 1);
            } else if (d.accion === 'clase_reponer') {
                const lista = studies.schedule[d.dia] = studies.schedule[d.dia] || [];
                lista.push(d.bloque);
                lista.sort((a, b) => String(a.time).localeCompare(String(b.time)));
            } else if (d.accion === 'estudio_quitar') {
                const asig = findSubject(d.subjectId);
                if (asig?.[d.lista]) {
                    asig[d.lista] = asig[d.lista].filter(x => x.id !== d.id);
                    removeLinkedExamEvent(d.id);
                    if (d.lista === 'assignments') removeLinkedPlannerItem(d.id);
                }
            } else if (d.accion === 'estudio_restaurar') {
                const asig = findSubject(d.subjectId);
                const item = asig?.[d.lista]?.find(x => x.id === d.id);
                if (item) {
                    Object.assign(item, d.antes);
                    syncExamCalendarEvent(asig, d.lista, item);
                    if (d.lista === 'assignments') syncAssignmentPlannerItem(asig, item);
                }
            } else if (d.accion === 'importar') {
                const quitar = new Set(d.anadidos || []);
                financePro.transactions = financePro.transactions.filter(t => !quitar.has(t.id));
                (d.modificados || []).forEach(t => { const i = financePro.transactions.findIndex(x => x.id === t.id); if (i >= 0) financePro.transactions[i] = t; });
                (d.quitados || []).forEach(t => { if (!financePro.transactions.some(x => x.id === t.id)) financePro.transactions.push(t); });
            }
            l.deshecho = true;
            l.revisado = true;
            filteredEntries = [...entries];
            invalidarCachesDerivadas();
            render();
            refrescarBandeja();
            try { await saveData(); showToast('Deshecho'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // Se aplican solos (el usuario no quiere validarlos): crear y editar
        // eventos, las entradas con QR de un evento y Ocio. El resto espera
        // en la bandeja sin tocar sus datos hasta que pulse "validar".
        const OPS_AUTOMATICAS = ['evento', 'editar_evento', 'entrada', 'ocio'];
        // Filas ya validadas o descartadas aquí que el servidor quizá aún no
        // ha borrado (se borran después de guardar): sin esto, una lectura
        // de la bandeja en ese intervalo las devolvía como pendientes y
        // reaparecían en la lista hasta la siguiente.
        const bandejaResueltas = new Set();
        let bandejaUltimaLectura = 0;

        function registrarLineaConector(l, origen) {
            l.origen = origen;
            registroConector = [l, ...registroConector].slice(0, REGISTRO_CONECTOR_MAX);
        }

        async function aplicarBandejaConector() {
            if (aplicandoBandeja) return;
            aplicandoBandeja = true;
            try {
                const firmaAntes = bandejaPendiente.map(f => f.id).join();
                let cambios = 0;
                // Antes "anotar" iba al inbox antiguo (solo visible en Centro
                // resumen); lo que quedó allí pasa a la nota de hoy.
                const antiguas = inbox.filter(i => String(i.id).startsWith('ia_'));
                if (antiguas.length) {
                    antiguas.forEach(i => { const l = aplicarOpConector({ tipo: 'nota', texto: i.text }, i.id); if (l) { registrarLineaConector(l, 'auto'); cambios++; } });
                    inbox = inbox.filter(i => !String(i.id).startsWith('ia_'));
                }
                const { data: leidas, error } = await sb.from('conector_bandeja').select('id, op, creado').order('creado');
                if (error) return;
                bandejaUltimaLectura = Date.now();
                const enServidor = new Set((leidas || []).map(f => f.id));
                [...bandejaResueltas].forEach(id => { if (!enServidor.has(id)) bandejaResueltas.delete(id); });
                const filas = (leidas || []).filter(f => !bandejaResueltas.has(f.id));
                const automaticas = (filas || []).filter(f => OPS_AUTOMATICAS.includes(f.op?.tipo));
                bandejaPendiente = (filas || []).filter(f => !OPS_AUTOMATICAS.includes(f.op?.tipo));
                automaticas.forEach(f => { const l = aplicarOpConector(f.op || {}, 'ia_' + f.id); if (l) { registrarLineaConector(l, 'auto'); cambios++; } });
                // El QR se deja ya dibujado, igual que al subirlo desde el
                // formulario: en la puerta puede no haber cobertura.
                for (const f of automaticas.filter(x => x.op?.tipo === 'entrada')) {
                    const entrada = entries.find(e => e.id === f.op.eventoId)?.entradas?.find(x => x.id === 'ia_' + f.id);
                    if (entrada && !entrada.svg) entrada.svg = await qrEntradaSvg(entrada).catch(() => undefined);
                }
                if (automaticas.length || antiguas.length) {
                    await saveData();
                    if (automaticas.length) await sb.from('conector_bandeja').delete().in('id', automaticas.map(f => f.id));
                }
                const nuevasPendientes = bandejaPendiente.filter(f => !firmaAntes.split(',').includes(f.id)).length;
                if (cambios || firmaAntes !== bandejaPendiente.map(f => f.id).join()) {
                    invalidarCachesDerivadas();
                    renderAllNavs();
                    render();
                }
                const avisos = [cambios ? `${cambios} ${cambios === 1 ? 'cambio aplicado' : 'cambios aplicados'} desde Claude o ChatGPT` : '', nuevasPendientes ? `${nuevasPendientes} ${nuevasPendientes === 1 ? 'espera' : 'esperan'} tu validación en «bandeja.»` : ''].filter(Boolean);
                if (avisos.length && currentView !== 'bandeja') showToast(avisos.join(' · '));
            } catch (e) {
                console.error('Bandeja del conector:', e);
            } finally {
                aplicandoBandeja = false;
            }
        }

        function detalleReservas(d, antes = {}) {
            const nuevos = k => (d[k] || []).filter(x => !(antes[k] || []).some(y => y.id === x.id && JSON.stringify(y) === JSON.stringify(x)));
            return [
                ...nuevos('transportes').map(x => `${TRANSPORTE_TIPOS[x.tipo] || x.tipo || 'transporte'} ${x.origen || '?'} → ${x.destino || '?'}${x.salida ? ' · ' + fechaHoraViaje(x.salida) : ''}${x.numero ? ' · ' + x.numero : ''}`),
                ...nuevos('alojamientos').map(x => `${x.nombre}${x.entrada ? ' · ' + fechaHoraViaje(x.entrada) : ''}${x.salida ? ' → ' + fechaHoraViaje(x.salida) : ''}`),
                ...nuevos('itinerario').map(x => `${x.dia || ''}${x.hora ? ' ' + x.hora : ''} ${x.titulo}`.trim()),
            ].join('\n');
        }
        function reservasTexto(d, antes = {}) {
            const n = (k, uno, varios) => { const x = (d[k]?.length || 0) - (antes[k]?.length || 0); return x > 0 ? `${x} ${x === 1 ? uno : varios}` : d[k] ? `${varios} actualizados` : ''; };
            return [n('transportes', 'transporte', 'transportes'), n('alojamientos', 'alojamiento', 'alojamientos'), n('itinerario', 'punto de itinerario', 'puntos de itinerario')];
        }
        const ENTRADA_NOMBRE = { travel: 'viaje', subscription: 'suscripción', fixed_expense: 'gasto fijo', goal: 'objetivo', birthday: 'cumpleaños', document: 'documento' };
        const ENTRADA_TIPO_REGISTRO = { travel: 'viaje', subscription: 'suscripción', fixed_expense: 'gasto fijo', goal: 'objetivo', birthday: 'cumpleaños', document: 'documento' };
        const ENTRADA_APARTADO = { travel: 'viajes', subscription: 'finanzas', fixed_expense: 'finanzas', goal: 'objetivos', birthday: 'cumpleaños', document: 'documentos' };

        function apartadoDeOp(op) {
            if (op.tipo === 'entrada_crear' || op.tipo === 'entrada_editar') return ENTRADA_APARTADO[op.entryType] || 'otros';
            if (op.tipo === 'deseo') return 'finanzas';
            if (op.tipo === 'habito') return 'hábitos y esfuerzo';
            if (op.tipo === 'tarea_recurrente') return 'planificador';
            if (op.tipo === 'enlace') return 'enlaces';
            if (op.tipo === 'clase') return 'estudios';
            if (op.tipo === 'borrar') return { evento: 'eventos', tarea: 'planificador', movimiento: 'finanzas' }[op.coleccion] || 'otros';
            return { tarea: 'planificador', editar_tarea: 'planificador', movimiento: 'finanzas', editar_movimiento: 'finanzas', importar: 'finanzas', nota: 'notas', dia: 'hábitos y esfuerzo', estudio_crear: 'estudios', estudio_editar: 'estudios' }[op.tipo] || 'otros';
        }

        // Qué se propone, contado como lo leería el usuario. detalle va en un
        // desplegable (el texto entero de una nota, las primeras filas de un
        // extracto).
        function describirOpConector(op) {
            const fecha = f => f ? financeDateLabelShort(f) : '';
            const c = op.cambios || {};
            switch (op.tipo) {
                case 'tarea': return { tipo: 'nueva tarea', texto: `«${op.titulo}»`, meta: op.fecha && op.hora ? `${fecha(op.fecha)} · ${op.hora}` : 'a tareas pendientes', detalle: op.notas };
                case 'editar_tarea': return { tipo: 'cambio de tarea', texto: `«${op.resumen}»`, meta: [c.hecha === true ? 'marcar hecha' : c.hecha === false ? 'volver a pendiente' : '', c.sinFecha ? 'pasar a tareas pendientes' : (c.fecha || c.hora) ? `mover a ${fecha(c.fecha) || 'su día'}${c.hora ? ' · ' + c.hora : ''}` : '', c.titulo ? `título: «${c.titulo}»` : '', c.notas !== undefined ? 'cambiar notas' : ''].filter(Boolean).join(' · ') };
                case 'movimiento': return { tipo: op.type === 'income' ? 'nuevo ingreso' : 'nuevo gasto', texto: `${financeMoney(op.importe)} · ${op.concepto || 'sin concepto'}`, meta: `${fecha(op.fecha)} · ${financePro.accounts[op.cuenta]?.name || op.cuenta}${op.categoria ? ' · ' + (financeProCategoryById(op.categoria)?.name || '').toLowerCase() : ' · sin categoría'}` };
                case 'editar_movimiento': return { tipo: 'corregir movimiento', texto: `«${op.resumen}»`, meta: [c.category ? 'categoría ' + (financeProCategoryById(c.category)?.name || '').toLowerCase() : '', c.note ? `concepto «${c.note}»` : '', c.amount ? financeMoney(c.amount) : '', c.date ? fecha(c.date) : '', c.account ? financePro.accounts[c.account]?.name : ''].filter(Boolean).join(' · ') };
                case 'importar': {
                    const lineas = String(op.csv || '').split(/\r?\n/).filter(l => l.trim());
                    return { tipo: 'importar extracto', texto: `${lineas.length - 1} filas`, meta: op.cuenta ? financePro.accounts[op.cuenta]?.name || op.cuenta : 'última cuenta usada', detalle: lineas.slice(0, 6).join('\n') + (lineas.length > 6 ? '\n…' : '') };
                }
                case 'nota': return { tipo: 'nota', texto: `«${String(op.titulo || op.texto || '').slice(0, 80)}»`, meta: `nota del ${fecha(op.fecha) || 'día'}`, detalle: [op.titulo, op.texto].filter(Boolean).join('\n') };
                case 'dia': {
                    const nombres = ids => (ids || []).map(id => habits.find(h => h.id === id)?.texto).filter(Boolean).map(x => x.toLowerCase());
                    return { tipo: 'día', texto: [op.esfuerzo ? `esfuerzo ${op.esfuerzo}/5` : '', ...nombres(op.hechos).map(n => n + ' ✓'), ...nombres(op.noHechos).map(n => n + ' ✗')].filter(Boolean).join(' · ') || 'sin cambios', meta: fecha(op.fecha) };
                }
                case 'borrar': return { tipo: `borrar ${op.coleccion}`, texto: op.resumen, meta: 'se puede deshacer después' };
                case 'entrada_crear': {
                    const d = op.datos || {};
                    const nombre = ENTRADA_NOMBRE[op.entryType] || 'entrada';
                    const meta = op.entryType === 'travel' ? [d.startDate && fecha(d.startDate), d.endDate && '→ ' + fecha(d.endDate), d.companions && 'con ' + d.companions, d.expenses?.length ? `${d.expenses.length} gasto${d.expenses.length === 1 ? '' : 's'}` : '', ...reservasTexto(d)].filter(Boolean).join(' · ')
                        : op.entryType === 'subscription' || op.entryType === 'fixed_expense' ? `${financeMoney(d.amount)} · día ${d.renewalDay} de cada mes${d.proAccount ? ' · ' + (financePro.accounts[d.proAccount]?.name || d.proAccount) : ''}${d.vigilar ? ' · avisar si no llega' : ''}`
                        : op.entryType === 'goal' ? [d.goalType === 'numeric' ? `${d.currentValue ?? 0} de ${d.targetValue ?? '?'} ${d.unit || ''}`.trim() : '', { short: 'corto plazo', medium: 'medio plazo', long: 'largo plazo' }[d.term] || '', d.milestones?.length ? `${d.milestones.length} hitos` : ''].filter(Boolean).join(' · ')
                        : op.entryType === 'birthday' ? fecha(d.birthDate)
                        : op.entryType === 'document' ? [d.docTipo, d.date ? 'caduca ' + fecha(d.date) : 'sin fecha', d.url ? 'con enlace' : ''].filter(Boolean).join(' · ') : '';
                    return { tipo: `nuevo ${nombre}`.replace('nuevo suscripción', 'nueva suscripción'), texto: `«${d.title || ''}»`, meta, detalle: (op.entryType === 'travel' && detalleReservas(d)) || d.notes || (d.expenses?.length ? d.expenses.map(g => `${g.description}: ${financeMoney(g.amount)}`).join('\n') : '') };
                }
                case 'entrada_editar': {
                    const d = op.datos || {};
                    const nombre = ENTRADA_NOMBRE[op.entryType] || 'entrada';
                    return { tipo: d.active === false ? `baja de ${nombre}` : d.active === true ? `reactivar ${nombre}` : `cambio de ${nombre}`, texto: `«${op.resumen}»`, meta: [d.amount ? financeMoney(d.amount) : '', d.renewalDay ? 'día ' + d.renewalDay : '', d.currentValue !== undefined ? `progreso ${d.currentValue}${d.targetValue !== undefined ? ' de ' + d.targetValue : ''}` : '', d.status || '', d.startDate ? fecha(d.startDate) : '', d.endDate ? '→ ' + fecha(d.endDate) : '', d.expenses ? 'gastos' : '', d.notes !== undefined ? 'notas' : '', ...(op.entryType === 'travel' ? reservasTexto(d, entries.find(x => x.id === op.id) || {}) : [])].filter(Boolean).join(' · '), detalle: op.entryType === 'travel' ? detalleReservas(d, entries.find(x => x.id === op.id) || {}) : '' };
                }
                case 'deseo': return { tipo: op.accion === 'quitar' ? 'quitar deseo' : 'nuevo deseo', texto: `«${op.titulo}»`, meta: op.precio ? financeMoney(op.precio) : '' };
                case 'habito': return { tipo: op.accion === 'crear' ? 'nuevo hábito' : op.activo ? 'reactivar hábito' : 'pausar hábito', texto: `«${op.texto}»`, meta: '' };
                case 'tarea_recurrente': {
                    const d = op.datos || {};
                    const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
                    const cuando = d.frecuencia === 'semanal' ? 'cada ' + (d.diasSemana || []).map(n => dias[n]).join(', ') : d.frecuencia === 'mensual' ? `el día ${d.diaMes} de cada mes` : d.frecuencia === 'intervalo' ? `cada ${d.intervaloDias} días desde ${fecha(d.intervaloInicio)}` : 'todos los días';
                    return { tipo: op.accion === 'crear' ? 'nueva tarea recurrente' : op.activo ? 'reactivar recurrente' : 'pausar recurrente', texto: `«${d.texto || op.texto}»`, meta: op.accion === 'crear' ? cuando : '' };
                }
                case 'enlace': return { tipo: 'nuevo enlace', texto: `«${op.titulo}»`, meta: [op.url.replace(/^https?:\/\//, '').slice(0, 60), op.categoryId ? (linkCategories.find(c => c.id === op.categoryId)?.name || '') : ''].filter(Boolean).join(' · ') };
                case 'clase': return { tipo: op.accion === 'quitar' ? 'quitar clase' : 'nueva clase', texto: `«${op.texto}»`, meta: `${(STUDIES_DAYS.find(d => d.key === op.dia)?.label || op.dia).toLowerCase()} · ${op.hora}` };
                case 'estudio_crear': return { tipo: op.lista === 'exams' ? 'nuevo examen' : 'nuevo trabajo', texto: `«${op.item?.title || ''}» · ${op.asignatura || findSubject(op.subjectId)?.name || ''}`, meta: [op.item?.date ? fecha(op.item.date) : 'sin fecha', op.item?.time || '', op.item?.weight ? `peso ${op.item.weight} %` : ''].filter(Boolean).join(' · ') };
                case 'estudio_editar': return { tipo: op.lista === 'exams' ? 'cambio de examen' : 'cambio de trabajo', texto: `«${op.resumen}»`, meta: [c.grade !== undefined ? `nota ${c.grade}` : '', c.done === true ? 'marcar entregado' : c.done === false ? 'volver a pendiente' : '', c.date ? fecha(c.date) : '', c.time ? c.time : '', c.weight ? `peso ${c.weight} %` : '', c.title ? `título: «${c.title}»` : ''].filter(Boolean).join(' · ') };
            }
            return { tipo: op.tipo, texto: '', meta: '' };
        }

        async function validarBandeja(ids) {
            const filas = bandejaPendiente.filter(f => ids.includes(f.id));
            if (!filas.length) return;
            filas.forEach(f => bandejaResueltas.add(f.id));
            let aplicadas = 0;
            filas.forEach(f => {
                const l = aplicarOpConector(f.op || {}, 'ia_' + f.id);
                if (l) { registrarLineaConector(l, 'validado'); aplicadas++; }
            });
            bandejaPendiente = bandejaPendiente.filter(f => !ids.includes(f.id));
            invalidarCachesDerivadas();
            renderAllNavs();
            render();
            try {
                await saveData();
                await sb.from('conector_bandeja').delete().in('id', filas.map(f => f.id));
                showToast(aplicadas === filas.length ? `${aplicadas} ${aplicadas === 1 ? 'cambio validado' : 'cambios validados'}` : `${aplicadas} de ${filas.length} aplicados · el resto ya no tenía a qué aplicarse`);
            } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function descartarBandeja(ids) {
            const filas = bandejaPendiente.filter(f => ids.includes(f.id));
            if (!filas.length) return;
            if (filas.length > 1 && !confirm(`¿Descartar ${filas.length} cambios? No se aplicará ninguno.`)) return;
            filas.forEach(f => bandejaResueltas.add(f.id));
            filas.forEach(f => {
                const d = describirOpConector(f.op || {});
                registrarLineaConector({ id: 'ia_' + f.id, cuando: new Date().toISOString(), tipo: f.op?.tipo, resumen: `${d.tipo}: ${d.texto}`.replace(/: $/, '.'), deshacer: null }, 'descartado');
            });
            bandejaPendiente = bandejaPendiente.filter(f => !ids.includes(f.id));
            renderAllNavs();
            render();
            try {
                await saveData();
                await sb.from('conector_bandeja').delete().in('id', filas.map(f => f.id));
                showToast(filas.length === 1 ? 'Cambio descartado' : `${filas.length} cambios descartados`);
            } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        const validarGrupoBandeja = grupo => validarBandeja(bandejaPendiente.filter(f => apartadoDeOp(f.op || {}) === grupo).map(f => f.id));
        const descartarGrupoBandeja = grupo => descartarBandeja(bandejaPendiente.filter(f => apartadoDeOp(f.op || {}) === grupo).map(f => f.id));

        // Lo calcula la app (ritmo y patrones viven aquí) y lo deja guardado
        // para que el conector lo lea. Como mucho cada 3 h, y solo se guarda
        // si ha cambiado algo.
        function construirAnalisisIA() {
            const r = financeRitmoDatos();
            const veredictos = { contenido: 'va más contenido que de costumbre', normal: 'va en su ritmo de siempre', alto: 'este mes va por encima de lo habitual', muy: 'este mes está gastando bastante más de lo que es normal en él' };
            const nombreCat = id => id ? (financeProCategoryById(id)?.name || 'otros') : 'sin categoría';
            const limpio = t => String(t || '').replace(/<[^>]+>/g, '');
            const hallazgos = patronesHallazgos();
            return {
                ritmo: r.suficiente
                    ? { nivel: r.nivel, veredicto: veredictos[r.nivel], dia_del_mes: r.dia, llevas: financeMoney(r.llevas), normalHoy: financeMoney(r.hoyFranja.medio), proyeccion: financeMoney(r.proyeccion), mesNormal: financeMoney(r.totalNormal), meses_analizados: r.meses, categorias_que_se_desvian: r.categorias.map(c => ({ categoria: nombreCat(c.cat), llevas: financeMoney(c.ahora), normal_a_estas_alturas: financeMoney(c.normal) })), que_cuenta: 'gasto del día a día: sin suscripciones, gastos fijos, inversiones, coleccionables ni ajustes; lo devuelto resta' }
                    : { veredicto: 'todavía no hay meses suficientes para saber qué es normal en él', llevas: financeMoney(r.llevas) },
                patrones: hallazgos.map(h => limpio(h.frase)),
                avisos: avisosProximos(hallazgos).map(a => limpio(a.frase)),
            };
        }

        let analisisIAUltimo = 0;
        async function actualizarAnalisisIA() {
            if (Date.now() - analisisIAUltimo < 3 * 3600e3) return;
            analisisIAUltimo = Date.now();
            try {
                const nuevo = construirAnalisisIA();
                const { actualizado, ...anterior } = analisisIA || {};
                if (JSON.stringify(anterior) === JSON.stringify(nuevo)) return;
                analisisIA = { actualizado: new Date().toISOString(), ...nuevo };
                await saveData();
            } catch (e) { console.error('Análisis para la IA:', e); }
        }

        const REGISTRO_ICONO = '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M12 14h76v54H42L22 86V68H12z"/></svg>';
        const BANDEJA_ORDEN = ['planificador', 'estudios', 'finanzas', 'viajes', 'objetivos', 'notas', 'hábitos y esfuerzo', 'documentos', 'enlaces', 'cumpleaños', 'eventos', 'otros'];
        let bandejaHistorialAbierto = false;
        let bandejaBusqueda = '';

        function haceCuanto(iso) {
            const min = Math.round((Date.now() - new Date(iso)) / 60000);
            if (min < 1) return 'ahora';
            if (min < 60) return `hace ${min} min`;
            if (min < 1440) return `hace ${Math.round(min / 60)} h`;
            return financeDateLabelShort(new Date(iso).toISOString().slice(0, 10));
        }

        function renderBandejaItem(f) {
            const d = describirOpConector(f.op || {});
            return `
                <article class="bandeja-item">
                    <div class="bandeja-item-cuerpo">
                        <div class="bandeja-item-tipo">${escapeHtml(d.tipo)}.</div>
                        <div class="bandeja-item-texto">${escapeHtml(d.texto)}</div>
                        <div class="bandeja-item-meta">${escapeHtml([d.meta, 'pedido ' + haceCuanto(f.creado)].filter(Boolean).join(' · '))}</div>
                        ${d.detalle ? `<details class="bandeja-item-detalle"><summary>ver contenido.</summary><pre>${escapeHtml(d.detalle)}</pre></details>` : ''}
                    </div>
                    <div class="bandeja-item-acciones">
                        <button class="bandeja-btn bandeja-btn-validar" onclick="validarBandeja(['${f.id}'])">validar cambio.</button>
                        <button class="bandeja-btn bandeja-btn-descartar" onclick="descartarBandeja(['${f.id}'])">descartar.</button>
                    </div>
                </article>`;
        }

        function renderBandejaHistorial() {
            const q = stripAccents(bandejaBusqueda.trim().toLowerCase());
            const lista = bandejaHistorialAbierto
                ? registroConector.filter(l => !q || stripAccents(`${l.resumen} ${l.tipo} ${l.origen || ''}`.toLowerCase()).includes(q))
                : registroConector.slice(0, 5);
            const origen = { auto: 'automático', validado: 'validado', descartado: 'descartado' };
            if (!lista.length) return `<div class="bandeja-vacia-linea">${q ? 'Nada coincide con esa búsqueda.' : 'Todavía no hay historial.'}</div>`;
            return lista.map(l => `
                <div class="bandeja-hist-fila ${l.deshecho ? 'deshecho' : ''} ${l.origen === 'descartado' ? 'descartado' : ''}">
                    <span class="bandeja-hist-cuando">${new Date(l.cuando).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} ${new Date(l.cuando).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span class="bandeja-hist-texto">${escapeHtml(l.resumen)}</span>
                    <span class="bandeja-hist-origen">${l.deshecho ? 'deshecho' : origen[l.origen] || 'aplicado'}.</span>
                    ${!l.deshecho && l.deshacer ? `<button class="bandeja-hist-deshacer" onclick="deshacerConector('${l.id}')">deshacer.</button>` : '<span></span>'}
                </div>`).join('');
        }

        // Cuántos enlaces de conector tiene el usuario: null sin consultar,
        // 'cargando' mientras se pide. Con 0, Bandeja explica cómo conectar.
        let conectoresActivos = null;
        async function cargarEstadoConector() {
            conectoresActivos = 'cargando';
            const { count, error } = await sb.from('conector_tokens').select('token_hash', { count: 'exact', head: true });
            conectoresActivos = error ? null : (count || 0);
            if (!error) refrescarBandeja();
        }

        function renderBandejaComoConectar() {
            return `
                <section class="bandeja-conectar">
                    <div class="bandeja-conectar-titulo">conecta claude o chatgpt.</div>
                    <p>Todavía no has conectado ninguna IA. Con el conector, le hablas a Claude o a ChatGPT como siempre y ellos leen y apuntan en tu Bitácora. Usa tu propia cuenta de Claude o ChatGPT; no tienes que pagar nada más.</p>
                    <div class="bandeja-conectar-ejemplos">
                        <span>«¿qué tengo esta semana?»</span>
                        <span>«apunta el examen de estadística el jueves 12»</span>
                        <span>«lee este ticket y añade el gasto»</span>
                        <span>«¿cuánto llevo gastado en comida este mes?»</span>
                        <span>«añade la peli que vi ayer a ocio»</span>
                    </div>
                    <ol class="bandeja-conectar-pasos">
                        <li>Crea tu enlace personal con uno de los botones de abajo.</li>
                        <li>Pégalo en Claude (Ajustes → Conectores) o en ChatGPT (Aplicaciones y conectores). Te lo explicamos paso a paso al crearlo.</li>
                        <li>Pide lo que quieras. Los eventos y Ocio se apuntan solos; el resto espera aquí, en bandeja, a que lo valides.</li>
                    </ol>
                    <div class="bandeja-globales">
                        <button class="bandeja-btn bandeja-btn-validar" onclick="crearConector('claude').then(() => cargarEstadoConector())">+ conectar Claude.</button>
                        <button class="bandeja-btn bandeja-btn-descartar" onclick="crearConector('chatgpt').then(() => cargarEstadoConector())">+ conectar ChatGPT.</button>
                    </div>
                </section>`;
        }

        function renderBandeja() {
            if (conectoresActivos === null) setTimeout(cargarEstadoConector, 0);
            const n = bandejaPendiente.length;
            const grupos = {};
            bandejaPendiente.forEach(f => { const g = apartadoDeOp(f.op || {}); (grupos[g] = grupos[g] || []).push(f); });
            const orden = Object.keys(grupos).sort((a, b) => BANDEJA_ORDEN.indexOf(a) - BANDEJA_ORDEN.indexOf(b));
            return `
            <div class="bandeja">
                <header class="bandeja-cabecera">
                    <div>
                        <div class="bandeja-titulo">bandeja.</div>
                        <div class="bandeja-sub">Lo que Claude o ChatGPT proponen cambiar en tu Bitácora. Hasta que lo validas, no toca nada.</div>
                    </div>
                    <div class="bandeja-contador ${n ? 'activo' : ''}"><b>${n}</b><span>${n === 1 ? 'pendiente.' : 'pendientes.'}</span></div>
                </header>
                ${conectoresActivos === 0 && !n ? renderBandejaComoConectar() : ''}
                ${n > 1 ? `
                <div class="bandeja-globales">
                    <button class="bandeja-btn bandeja-btn-validar" onclick="validarBandeja(bandejaPendiente.map(f => f.id))">validar todo (${n}).</button>
                    <button class="bandeja-btn bandeja-btn-descartar" onclick="descartarBandeja(bandejaPendiente.map(f => f.id))">descartar todo.</button>
                </div>` : ''}
                ${conectoresActivos === 0 && !n ? '' : n ? orden.map(g => `
                    <section class="bandeja-grupo">
                        <div class="bandeja-grupo-cab">
                            <span class="bandeja-grupo-nombre">${escapeHtml(g)}.</span>
                            <span class="bandeja-grupo-n">${grupos[g].length}</span>
                            ${grupos[g].length > 1 ? `<button class="bandeja-grupo-btn" onclick="validarGrupoBandeja('${g}')">validar los ${grupos[g].length}.</button><button class="bandeja-grupo-btn" onclick="descartarGrupoBandeja('${g}')">descartar.</button>` : ''}
                        </div>
                        ${grupos[g].map(renderBandejaItem).join('')}
                    </section>`).join('') : `
                    <div class="bandeja-vacia">
                        <div class="bandeja-vacia-titulo">nada pendiente.</div>
                        <div class="bandeja-vacia-sub">Cuando Claude proponga una tarea, un gasto, una nota o un borrado, aparecerá aquí para que lo valides. Los eventos y Ocio se aplican solos y quedan en el historial.</div>
                    </div>`}
                <section class="bandeja-historial">
                    <div class="bandeja-hist-cab">
                        <span class="bandeja-grupo-nombre">historial.</span>
                        <button class="bandeja-grupo-btn" onclick="toggleHistorialBandeja()">${bandejaHistorialAbierto ? 'ver solo los últimos 5.' : `ver todo el historial${registroConector.length > 5 ? ` (${registroConector.length})` : ''}.`}</button>
                    </div>
                    ${bandejaHistorialAbierto ? `<input class="modal-input bandeja-buscar" type="search" placeholder="Buscar en el historial…" value="${escapeHtml(bandejaBusqueda)}" oninput="setBusquedaBandeja(this.value)">` : ''}
                    <div id="bandeja-historial-lista">${renderBandejaHistorial()}</div>
                </section>
            </div>`;
        }

        function refrescarBandeja() {
            if (currentView === 'bandeja') render();
        }

        function toggleHistorialBandeja() {
            bandejaHistorialAbierto = !bandejaHistorialAbierto;
            if (!bandejaHistorialAbierto) bandejaBusqueda = '';
            render();
            if (bandejaHistorialAbierto) setTimeout(() => document.querySelector('.bandeja-buscar')?.focus(), 0);
        }

        function setBusquedaBandeja(valor) {
            bandejaBusqueda = valor;
            const el = document.getElementById('bandeja-historial-lista');
            if (el) el.innerHTML = renderBandejaHistorial();
        }

        async function cargarConectoresAjustes() {
            const body = cuerpoAjustes('settings-conector-body');
            if (!body) return;
            const { data, error } = await sb.from('conector_tokens').select('token_hash, nombre, creado, ultimo_uso').order('creado');
            if (error) { body.innerHTML = 'No se ha podido cargar.'; return; }
            const fecha = iso => iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
            body.innerHTML = `
                <div style="line-height:1.5;margin-bottom:12px">Conecta Bitácora a Claude o a ChatGPT para preguntarle por tu agenda, tus gastos o cualquier apartado, y pedirle que apunte cosas (un evento a partir de una entrada, un gasto a partir de un ticket...). Usa tu propia suscripción de Claude o ChatGPT.</div>
                ${(data || []).map(t => `
                    <div class="conector-fila">
                        <div><b>${escapeHtml(t.nombre)}.</b><small>creado el ${fecha(t.creado)}${t.ultimo_uso ? ` · usado por última vez el ${fecha(t.ultimo_uso)}` : ' · sin usar todavía'}</small></div>
                        <button class="finance-oneoff-btn" onclick="revocarConector('${t.token_hash}')">revocar.</button>
                    </div>`).join('')}
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
                    <button class="btn-secondary" style="width:auto" onclick="crearConector('claude')">+ enlace para Claude</button>
                    <button class="btn-secondary" style="width:auto" onclick="crearConector('chatgpt')">+ enlace para ChatGPT</button>
                </div>`;
        }

        async function crearConector(nombre) {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) return;
            const bytes = crypto.getRandomValues(new Uint8Array(32));
            const token = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
            const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
            const token_hash = [...new Uint8Array(hashBuf)].map(b => b.toString(16).padStart(2, '0')).join('');
            const { error } = await sb.from('conector_tokens').insert({ token_hash, user_id: user.id, nombre });
            if (error) { console.error(error); showToast('No se pudo crear el enlace', true); return; }
            const url = CONECTOR_URL + token;
            const pasos = nombre === 'claude'
                ? `<li>En claude.ai (o la app de escritorio): <b>Ajustes → Conectores → Añadir conector personalizado</b>.</li><li>Ponle de nombre <b>Bitácora</b> y pega el enlace como URL del servidor. Sin OAuth.</li><li>En un chat, activa Bitácora en el menú de herramientas y pregunta: «¿qué tengo esta semana?».</li><li>Una vez añadido en la web, también funciona en la app del móvil.</li>`
                : `<li>En chatgpt.com: <b>Ajustes → Aplicaciones y conectores → Avanzado</b> y activa el <b>modo desarrollador</b>.</li><li>Vuelve a <b>Aplicaciones y conectores → Crear</b>, ponle de nombre <b>Bitácora</b>, pega el enlace como URL y elige «Sin autenticación».</li><li>En un chat, elige Bitácora en el menú «+» y pregunta: «¿cómo van mis gastos?».</li>`;
            showModal(`
                <div class="modal-title">enlace para ${nombre === 'claude' ? 'Claude' : 'ChatGPT'}.</div>
                <div class="finance-modal-note" style="margin-bottom:10px">Es tu llave personal: quien lo tenga puede leer y escribir en tu Bitácora. Solo se enseña ahora; si lo pierdes, crea otro y revoca este.</div>
                <div class="conector-url"><code>${escapeHtml(url)}</code></div>
                <button class="btn-modal-primary" style="margin:10px 0 16px" onclick="navigator.clipboard.writeText('${url}').then(() => showToast('Enlace copiado'))">copiar enlace.</button>
                <ol class="conector-pasos">${pasos}</ol>
            `);
            cargarConectoresAjustes();
        }

        async function revocarConector(hash) {
            if (!confirm('¿Revocar este enlace? Claude o ChatGPT dejarán de poder acceder con él.')) return;
            const { error } = await sb.from('conector_tokens').delete().eq('token_hash', hash);
            if (error) { showToast('No se pudo revocar', true); return; }
            showToast('Enlace revocado');
            cargarConectoresAjustes();
        }

