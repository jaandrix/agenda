        // Google Classroom → Estudios. Todo pasa en el navegador: Google da un permiso de solo lectura que dura una hora
        // (Google Identity Services, ventana emergente) y no se guarda en ningún servidor. Cada clase se une a una
        // asignatura (studies.classroom.cursos: id de la clase → id de la asignatura o 'ignorar') y cada tarea guarda
        // su classroomId, así que traerlas otra vez actualiza en vez de duplicar. Lo que el usuario cambie a mano
        // (nota, peso, entregado) no se pisa: Classroom solo rellena la nota si está vacía o la puso él, y solo marca entregado.
        // En el iPhone con la app instalada la ventana de Google no vuelve a la app: se conecta desde el navegador.
        const CLASSROOM_CLIENT_ID = '476419211198-8rftknhtf15b3u6t5q3qu4a3iuu7p0m7.apps.googleusercontent.com';
        // Hasta que Google verifique la app, solo pueden conectar las cuentas de prueba del proyecto de Google Cloud:
        // mientras tanto el botón solo sale en la cuenta del creador.
        const CLASSROOM_PARA_TODOS = false;
        const CLASSROOM_SCOPES = 'https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me.readonly';
        const CLASSROOM_API = 'https://classroom.googleapis.com/v1/';
        // Un cuestionario de Forms suele ser una tarea más: solo es examen si lo dice el título y no se llama «tarea».
        const CLASSROOM_EXAMEN = /\b(examen|exam|parcial|control)\b/i;
        const classroomLista = cw => CLASSROOM_EXAMEN.test(cw.title || '') && !/\btarea\b/i.test(cw.title || '') ? 'exams' : 'assignments';
        let classroomToken = null;
        let classroomCursos = null;

        function classroomDisponible() {
            // Oculto desde el 30-10 a petición de Alejandro: por ahora no le aporta. Lo ya importado sigue en Estudios y Panorama.
            return false;
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
            window._classroomPropuestas = {};
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
                    <p class="finance-modal-note">Une cada clase con su asignatura. Se recuerda para la próxima vez. Si cambias una, sus tareas se mueven a la nueva; con «no traer esta clase.» se quitan.</p>
                    <div class="classroom-lista">
                        ${classroomCursos.map(c => {
                            const guardada = datos.cursos[c.id] && (datos.cursos[c.id] === 'ignorar' || findSubject(datos.cursos[c.id])) ? datos.cursos[c.id] : '';
                            // Una propuesta por asignatura: si ya la usa otra clase, esta se queda en «elige.».
                            const usadas = new Set(Object.values(datos.cursos).concat(Object.values(window._classroomPropuestas || {})));
                            const propuesta = guardada || (() => { const p = classroomParecida(c.name); return p && !usadas.has(p) ? p : ''; })();
                            if (!guardada && propuesta) (window._classroomPropuestas = window._classroomPropuestas || {})[c.id] = propuesta;
                            const sel = propuesta;
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
                        // Si ya estaban todas las clases unidas, no hace falta pasar por la lista: se traen al momento.
                        const unidas = classroomDatos().cursos;
                        if (classroomCursos.length && classroomCursos.every(c => unidas[c.id])) classroomTraer();
                    } catch (e) { pintarClassroom(classroomError(e)); }
                },
                error_callback: () => pintarClassroom('Se cerró la ventana de Google antes de terminar.'),
            });
            // Tras el primer permiso, Google no vuelve a enseñar la pantalla de consentimiento: basta con elegir la cuenta.
            cliente.requestAccessToken(classroomDatos().ultima ? { prompt: '' } : {});
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
            const cuenta = { nuevas: 0, cambiadas: 0, entregadas: 0, movidas: 0, quitadas: 0, fallos: 0 };
            // Las clases que pasan a «no traer» se llevan las tareas que habían traído (las de antes de guardar la clase
            // en cada tarea se reconocen pidiendo sus tareas a Classroom).
            const ignoradas = classroomCursos.filter(c => datos.cursos[c.id] === 'ignorar');
            for (const c of ignoradas) {
                try {
                    const t = await classroomPedir(`courses/${c.id}/courseWork?pageSize=100`);
                    (t.courseWork || []).forEach(cw => { const sitio = classroomBuscar(cw.id); if (sitio && classroomQuitar(sitio)) cuenta.quitadas++; });
                } catch (e) { cuenta.fallos++; }
            }
            // Todas las clases a la vez (antes una detrás de otra); se aplican después, en orden.
            const leidas = await Promise.all(unidas.map(c => Promise.all([
                classroomPedir(`courses/${c.id}/courseWork?courseWorkStates=PUBLISHED&pageSize=100`),
                classroomPedir(`courses/${c.id}/courseWork/-/studentSubmissions?userId=me&pageSize=100`),
            ]).then(r => ({ c, r }), e => ({ c, e }))));
            for (const { c, r, e } of leidas) {
                if (e) { cuenta.fallos++; if (String(e?.message).includes('401')) classroomToken = null; continue; }
                const [tareas, entregas] = r;
                const porTarea = {};
                (entregas.studentSubmissions || []).forEach(x => { porTarea[x.courseWorkId] = x; });
                classroomAplicar(findSubject(datos.cursos[c.id]), c.id, tareas.courseWork || [], porTarea, cuenta);
            }
            datos.ultima = new Date().toISOString();
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
            const partes = [];
            if (cuenta.nuevas) partes.push(`${cuenta.nuevas} ${cuenta.nuevas === 1 ? 'tarea nueva' : 'tareas nuevas'}`);
            if (cuenta.cambiadas) partes.push(`${cuenta.cambiadas} con cambios`);
            if (cuenta.movidas) partes.push(`${cuenta.movidas} ${cuenta.movidas === 1 ? 'movida' : 'movidas'} de asignatura`);
            if (cuenta.quitadas) partes.push(`${cuenta.quitadas} ${cuenta.quitadas === 1 ? 'quitada' : 'quitadas'}`);
            if (cuenta.entregadas) partes.push(`${cuenta.entregadas} ${cuenta.entregadas === 1 ? 'marcada' : 'marcadas'} como entregada${cuenta.entregadas === 1 ? '' : 's'}`);
            let aviso = partes.length ? `Listo: ${partes.join(', ')}.` : 'Todo estaba ya al día.';
            if (cuenta.fallos) aviso += ` ${cuenta.fallos === 1 ? 'Una clase no' : cuenta.fallos + ' clases no'} se pudo leer.`;
            pintarClassroom(aviso);
        }

        // Dónde está ya una tarea traída (puede estar en otra asignatura si se cambió la unión de su clase).
        function classroomBuscar(classroomId) {
            for (const sub of studies.subjects) for (const k of ['assignments', 'exams']) {
                const i = (sub[k] || []).findIndex(x => x.classroomId === classroomId);
                if (i !== -1) return { sub, k, i, item: sub[k][i] };
            }
            return null;
        }

        // Solo se quitan las que siguen como llegaron: si les has puesto peso o una nota tuya, se quedan.
        function classroomQuitar(sitio) {
            const it = sitio.item;
            const tocada = (it.weight !== '' && it.weight != null) || (it.grade !== '' && it.grade != null && it.grade !== it.notaClassroom);
            if (tocada) return false;
            removeLinkedExamEvent(it.id);
            if (sitio.k === 'assignments') removeLinkedPlannerItem(it.id);
            sitio.sub[sitio.k].splice(sitio.i, 1);
            return true;
        }

        function classroomAplicar(s, curso, tareas, porTarea, cuenta) {
            s.exams = s.exams || [];
            s.assignments = s.assignments || [];
            tareas.forEach(cw => {
                const entrega = porTarea[cw.id];
                const entregada = entrega && (entrega.state === 'TURNED_IN' || entrega.state === 'RETURNED');
                // Hasta que el profesor la devuelve (RETURNED), Classroom manda assignedGrade a 0 aunque ya esté calificada.
                const nota = entrega && entrega.state === 'RETURNED' && entrega.assignedGrade != null && cw.maxPoints ? String(Math.round(entrega.assignedGrade / cw.maxPoints * 100) / 10) : '';
                const { date, time } = classroomFecha(cw);
                const enlace = /^https:\/\/classroom\.google\.com\//.test(cw.alternateLink || '') ? cw.alternateLink : '';
                const sitio = classroomBuscar(cw.id);
                let lista, item, movida = false;
                if (sitio && (sitio.sub !== s || sitio.k !== classroomLista(cw))) {
                    sitio.sub[sitio.k].splice(sitio.i, 1);
                    removeLinkedExamEvent(sitio.item.id);
                    if (sitio.k === 'assignments') removeLinkedPlannerItem(sitio.item.id);
                    if (sitio.sub !== s) cuenta.movidas++; else cuenta.cambiadas++;
                    sitio.k = classroomLista(cw);
                    s[sitio.k].push(sitio.item);
                    movida = true;
                }
                if (!sitio) {
                    lista = classroomLista(cw);
                    item = { id: 'item_cr_' + cw.id, title: cw.title || 'Tarea sin título', date, time, grade: nota, weight: '', done: !!entregada, classroomId: cw.id, classroomCurso: curso, enlace, notaClassroom: nota };
                    // Las de días ya pasados no van al planificador: si no, todo lo atrasado del curso se arrastraría a hoy.
                    if (date && date < todayISO()) item.fueraDelPlanificador = true;
                    s[lista].push(item);
                    cuenta.nuevas++;
                } else {
                    lista = sitio.k;
                    item = sitio.item;
                    item.classroomCurso = curso;
                    let cambio = false;
                    if ((cw.title || '') && item.title !== cw.title) { item.title = cw.title; cambio = true; }
                    if (item.date !== date || (item.time || '') !== time) { item.date = date; item.time = time; cambio = true; }
                    if (nota && (item.grade === '' || item.grade == null || item.grade === item.notaClassroom)) {
                        if (item.grade !== nota) { item.grade = nota; cambio = true; }
                        item.notaClassroom = nota;
                    } else if (!nota && !item.notaClassroom && String(item.grade) === '0') { item.grade = ''; cambio = true; }
                    if (enlace) item.enlace = enlace;
                    if (cambio) cuenta.cambiadas++;
                    if (entregada && !item.done) { item.done = true; cuenta.entregadas++; cambio = true; }
                    if (!cambio && !movida) return;
                }
                syncExamCalendarEvent(s, lista, item);
                if (lista === 'assignments') syncAssignmentPlannerItem(s, item);
            });
        }
