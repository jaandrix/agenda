        // Google Classroom → Estudios. Todo pasa en el navegador: Google da un permiso de solo lectura que dura una hora
        // (Google Identity Services, ventana emergente) y no se guarda en ningún servidor. Cada clase se une a una
        // asignatura (studies.classroom.cursos: id de la clase → id de la asignatura o 'ignorar') y cada tarea guarda
        // su classroomId, así que traerlas otra vez actualiza en vez de duplicar. Lo que el usuario cambie a mano
        // (nota, peso, entregado) no se pisa: Classroom solo rellena lo que está vacío y solo marca entregado.
        // En el iPhone con la app instalada la ventana de Google no vuelve a la app: se conecta desde el navegador.
        const CLASSROOM_CLIENT_ID = '';
        // Hasta que Google verifique la app, solo pueden conectar las cuentas de prueba del proyecto de Google Cloud:
        // mientras tanto el botón solo sale en la cuenta del creador.
        const CLASSROOM_PARA_TODOS = false;
        const CLASSROOM_SCOPES = 'https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me.readonly';
        const CLASSROOM_API = 'https://classroom.googleapis.com/v1/';
        const CLASSROOM_EXAMEN = /\b(examen|exam|parcial|final|control|quiz|cuestionario)\b/i;
        let classroomToken = null;
        let classroomCursos = null;

        function classroomDisponible() {
            return !!CLASSROOM_CLIENT_ID && (CLASSROOM_PARA_TODOS || cuentaDesarrollador);
        }

        function classroomDatos() {
            if (!studies.classroom || typeof studies.classroom !== 'object') studies.classroom = { cursos: {}, ultima: '' };
            if (!studies.classroom.cursos) studies.classroom.cursos = {};
            return studies.classroom;
        }

        function classroomCargarGoogle() {
            if (window.google?.accounts?.oauth2) return Promise.resolve();
            if (!window._classroomGsi) window._classroomGsi = new Promise((resolve, reject) => {
                const sc = document.createElement('script');
                sc.src = 'https://accounts.google.com/gsi/client';
                sc.onload = resolve;
                sc.onerror = () => { window._classroomGsi = null; reject(new Error('sin google')); };
                document.head.appendChild(sc);
            });
            return window._classroomGsi;
        }

        function openClassroom() {
            if (CLASSROOM_CLIENT_ID) classroomCargarGoogle().catch(() => {});
            pintarClassroom();
        }

        function pintarClassroom(aviso) {
            const datos = classroomDatos();
            const conectado = classroomToken && classroomToken.expira > Date.now();
            const pwaIos = document.body.classList.contains('mobile-standalone') && /iPhone|iPad/.test(navigator.userAgent);
            let cuerpo;
            if (!CLASSROOM_CLIENT_ID) {
                cuerpo = `<p class="finance-modal-note">La conexión con Classroom todavía no está activada en Bitácora.</p>`;
            } else if (!conectado || !classroomCursos) {
                cuerpo = `
                    <p class="finance-modal-note">Bitácora lee tus clases y sus tareas (título, fecha de entrega, si la has entregado y la nota) y las pone en tus asignaturas. Solo lectura: no puede entregar ni cambiar nada en Classroom. El permiso dura una hora y no se guarda.</p>
                    ${pwaIos ? `<p class="finance-modal-note">En el iPhone, hazlo desde Safari o desde el ordenador: lo que traigas aparece aquí solo.</p>` : ''}
                    <button class="btn-modal-primary" onclick="classroomConectar()">conectar con google.</button>`;
            } else if (!classroomCursos.length) {
                cuerpo = `<p class="finance-modal-note">Esta cuenta de Google no tiene clases activas en Classroom. Si usas otra (la del centro), conecta con esa.</p>
                    <button class="btn-secondary" onclick="classroomToken = null; classroomConectar()">usar otra cuenta.</button>`;
            } else {
                const opciones = (sel, curso) => `
                    <option value="" ${!sel ? 'selected' : ''}>elige.</option>
                    ${studies.subjects.map(s => `<option value="${escapeHtml(s.id)}" ${sel === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
                    <option value="nueva">crear «${escapeHtml(curso.name)}».</option>
                    <option value="ignorar" ${sel === 'ignorar' ? 'selected' : ''}>no traer esta clase.</option>`;
                cuerpo = `
                    <p class="finance-modal-note">Une cada clase con su asignatura. Se recuerda para la próxima vez.</p>
                    <div class="classroom-lista">
                        ${classroomCursos.map(c => {
                            const sel = datos.cursos[c.id] && (datos.cursos[c.id] === 'ignorar' || findSubject(datos.cursos[c.id])) ? datos.cursos[c.id] : classroomParecida(c.name);
                            return `<label class="classroom-fila"><span><b>${escapeHtml(c.name)}</b>${c.section ? `<small>${escapeHtml(c.section)}</small>` : ''}</span>
                                <select class="modal-input" data-curso="${escapeHtml(c.id)}">${opciones(sel, c)}</select></label>`;
                        }).join('')}
                    </div>
                    <button class="btn-modal-primary" onclick="classroomTraer()">traer tareas.</button>`;
            }
            showModal(`
                <div class="modal-title">classroom.</div>
                ${aviso ? `<p class="classroom-aviso">${aviso}</p>` : ''}
                ${cuerpo}
                ${datos.ultima ? `<p class="finance-modal-note classroom-ultima">última vez: ${escapeHtml(new Date(datos.ultima).toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}.</p>` : ''}
            `);
        }

        function classroomParecida(nombre) {
            const norm = t => stripAccents(String(t || '').toLowerCase()).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(p => p.length > 2);
            const a = norm(nombre);
            let mejor = '', puntos = 0;
            studies.subjects.forEach(s => {
                const b = norm(s.name);
                if (!a.length || !b.length) return;
                const comunes = a.filter(p => b.includes(p)).length;
                const p = comunes / Math.max(a.length, b.length);
                if (p > puntos) { puntos = p; mejor = s.id; }
            });
            return puntos >= 0.5 ? mejor : '';
        }

        async function classroomConectar() {
            try { await classroomCargarGoogle(); }
            catch (e) { showToast('No se pudo abrir Google. Revisa la conexión.', true); return; }
            const cliente = google.accounts.oauth2.initTokenClient({
                client_id: CLASSROOM_CLIENT_ID,
                scope: CLASSROOM_SCOPES,
                callback: async r => {
                    if (r.error) { pintarClassroom('Google no dio permiso. Si es la cuenta del centro, puede que lo tenga bloqueado.'); return; }
                    classroomToken = { token: r.access_token, expira: Date.now() + (Number(r.expires_in || 3600) - 60) * 1000 };
                    try {
                        const d = await classroomPedir('courses?studentId=me&courseStates=ACTIVE&pageSize=100');
                        classroomCursos = (d.courses || []).map(c => ({ id: c.id, name: c.name || 'Clase sin nombre', section: c.section || '' }));
                        pintarClassroom();
                    } catch (e) { pintarClassroom(classroomError(e)); }
                },
                error_callback: () => pintarClassroom('Se cerró la ventana de Google antes de terminar.'),
            });
            cliente.requestAccessToken();
        }

        async function classroomPedir(ruta) {
            const todo = {};
            let pagina = '';
            do {
                const r = await fetch(CLASSROOM_API + ruta + (pagina ? `&pageToken=${encodeURIComponent(pagina)}` : ''), { headers: { Authorization: 'Bearer ' + classroomToken.token } });
                if (!r.ok) throw new Error('http ' + r.status);
                const d = await r.json();
                Object.keys(d).forEach(k => { if (Array.isArray(d[k])) todo[k] = (todo[k] || []).concat(d[k]); });
                pagina = d.nextPageToken || '';
            } while (pagina);
            return todo;
        }

        function classroomError(e) {
            const m = String(e?.message || '');
            if (m.includes('401')) { classroomToken = null; return 'El permiso de Google ha caducado. Vuelve a conectar.'; }
            if (m.includes('403')) return 'Google no deja leer Classroom con esta cuenta. Si es la del centro, puede que lo tenga bloqueado.';
            return 'No se pudo hablar con Classroom. Prueba otra vez en un momento.';
        }

        function classroomFecha(cw) {
            if (!cw.dueDate) return { date: '', time: '' };
            const { year, month, day } = cw.dueDate;
            if (!cw.dueTime) return { date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, time: '' };
            const d = new Date(Date.UTC(year, month - 1, day, cw.dueTime.hours || 0, cw.dueTime.minutes || 0));
            return { date: isoLocal(d), time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` };
        }

        async function classroomTraer() {
            if (!classroomToken || classroomToken.expira <= Date.now()) { classroomToken = null; pintarClassroom('El permiso de Google ha caducado. Vuelve a conectar.'); return; }
            const datos = classroomDatos();
            document.querySelectorAll('.classroom-fila select').forEach(sel => {
                const curso = classroomCursos.find(c => c.id === sel.dataset.curso);
                let v = sel.value;
                if (v === 'nueva' && curso) {
                    const nueva = { id: 'subj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name: curso.name, color: '#5b8def', creditos: null, exams: [], assignments: [], cuatrimestre: cuatriParaAsignaturaNueva() };
                    studies.subjects.push(nueva);
                    v = nueva.id;
                }
                if (v) datos.cursos[sel.dataset.curso] = v; else delete datos.cursos[sel.dataset.curso];
            });
            const unidas = classroomCursos.filter(c => datos.cursos[c.id] && datos.cursos[c.id] !== 'ignorar' && findSubject(datos.cursos[c.id]));
            if (!unidas.length) { pintarClassroom('Une al menos una clase con una asignatura.'); return; }
            const boton = document.querySelector('#modal-container .btn-modal-primary');
            if (boton) { boton.disabled = true; boton.textContent = 'trayendo...'; }
            const cuenta = { nuevas: 0, cambiadas: 0, entregadas: 0, fallos: 0 };
            for (const c of unidas) {
                try {
                    const [tareas, entregas] = await Promise.all([
                        classroomPedir(`courses/${c.id}/courseWork?courseWorkStates=PUBLISHED&pageSize=100`),
                        classroomPedir(`courses/${c.id}/courseWork/-/studentSubmissions?userId=me&pageSize=100`),
                    ]);
                    const porTarea = {};
                    (entregas.studentSubmissions || []).forEach(e => { porTarea[e.courseWorkId] = e; });
                    classroomAplicar(findSubject(datos.cursos[c.id]), tareas.courseWork || [], porTarea, cuenta);
                } catch (e) {
                    cuenta.fallos++;
                    if (String(e?.message).includes('401')) { classroomToken = null; break; }
                }
            }
            datos.ultima = new Date().toISOString();
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
            const partes = [];
            if (cuenta.nuevas) partes.push(`${cuenta.nuevas} ${cuenta.nuevas === 1 ? 'tarea nueva' : 'tareas nuevas'}`);
            if (cuenta.cambiadas) partes.push(`${cuenta.cambiadas} con cambios`);
            if (cuenta.entregadas) partes.push(`${cuenta.entregadas} ${cuenta.entregadas === 1 ? 'marcada' : 'marcadas'} como entregada${cuenta.entregadas === 1 ? '' : 's'}`);
            let aviso = partes.length ? `Listo: ${partes.join(', ')}.` : 'Todo estaba ya al día.';
            if (cuenta.fallos) aviso += ` ${cuenta.fallos === 1 ? 'Una clase no' : cuenta.fallos + ' clases no'} se pudo leer.`;
            pintarClassroom(aviso);
        }

        function classroomAplicar(s, tareas, porTarea, cuenta) {
            s.exams = s.exams || [];
            s.assignments = s.assignments || [];
            tareas.forEach(cw => {
                const entrega = porTarea[cw.id];
                const entregada = entrega && (entrega.state === 'TURNED_IN' || entrega.state === 'RETURNED');
                const nota = entrega && entrega.assignedGrade != null && cw.maxPoints ? String(Math.round(entrega.assignedGrade / cw.maxPoints * 100) / 10) : '';
                const { date, time } = classroomFecha(cw);
                const enlace = /^https:\/\/classroom\.google\.com\//.test(cw.alternateLink || '') ? cw.alternateLink : '';
                let lista = (s.assignments.find(i => i.classroomId === cw.id) && 'assignments') || (s.exams.find(i => i.classroomId === cw.id) && 'exams');
                let item = lista && s[lista].find(i => i.classroomId === cw.id);
                if (!item) {
                    lista = CLASSROOM_EXAMEN.test(cw.title || '') ? 'exams' : 'assignments';
                    item = { id: 'item_cr_' + cw.id, title: cw.title || 'Tarea sin título', date, time, grade: nota, weight: '', done: !!entregada, classroomId: cw.id, enlace };
                    // Las de días ya pasados no van al planificador: si no, todo lo atrasado del curso se arrastraría a hoy.
                    if (date && date < todayISO()) item.fueraDelPlanificador = true;
                    s[lista].push(item);
                    cuenta.nuevas++;
                } else {
                    let cambio = false;
                    if ((cw.title || '') && item.title !== cw.title) { item.title = cw.title; cambio = true; }
                    if (item.date !== date || (item.time || '') !== time) { item.date = date; item.time = time; cambio = true; }
                    if (nota && (item.grade === '' || item.grade == null)) { item.grade = nota; cambio = true; }
                    if (enlace) item.enlace = enlace;
                    if (cambio) cuenta.cambiadas++;
                    if (entregada && !item.done) { item.done = true; cuenta.entregadas++; cambio = true; }
                    if (!cambio) return;
                }
                syncExamCalendarEvent(s, lista, item);
                if (lista === 'assignments') syncAssignmentPlannerItem(s, item);
            });
        }
