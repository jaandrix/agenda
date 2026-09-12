        // ============================================================
        //  SUPABASE CONFIG
        // ============================================================
        const SUPABASE_URL = 'https://avdqtnukgbejorieuunj.supabase.co';
        const SUPABASE_ANON_KEY =
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2ZHF0bnVrZ2Jlam9yaWV1dW5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMjcyOTUsImV4cCI6MjEwMDkwMzI5NX0.sq1cepXuBaNT6qygyxKEAhVHJh7G9LZyzaeJBhc7s7s';
        const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // ============================================================
        //  AUTH FUNCTIONS
        // ============================================================
        async function handleLogin() {
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            const errorEl = document.getElementById('login-error');
            const btn = document.getElementById('login-btn');
            errorEl.textContent = '';
            if (!email || !password) { errorEl.textContent = 'Introduce email y contraseña.'; return; }
            btn.disabled = true;
            btn.textContent = 'Entrando...';
            const { error } = await sb.auth.signInWithPassword({ email, password });
            btn.disabled = false;
            btn.textContent = 'Entrar';
            if (error) {
                console.error('Error de inicio de sesión:', error);
                const msg = (error.message || '').toLowerCase();
                if (msg.includes('email not confirmed')) {
                    errorEl.textContent = 'Tu cuenta todavía figura como no confirmada en Supabase.';
                } else if (msg.includes('invalid login credentials')) {
                    errorEl.textContent = 'Email o contraseña incorrectos.';
                } else {
                    errorEl.textContent = 'No se pudo iniciar sesión: ' + (error.message || 'error de conexión');
                }
                return;
            }
            await startApp();
        }

        function resetToLoginScreen() {
            document.getElementById('app').classList.remove('ready');
            document.getElementById('login-screen').style.display = 'flex';
            document.getElementById('login-email').value = '';
            document.getElementById('login-password').value = '';
            showAuthMode('login');
        }

        async function handleLogout() {
            await sb.auth.signOut();
            resetToLoginScreen();
        }

        async function handleLogoutAllDevices() {
            const confirmed = confirm('Esto cerrará tu sesión en todos los dispositivos donde hayas iniciado sesión. ¿Continuar?');
            if (!confirmed) return;
            try {
                await sb.auth.signOut({ scope: 'global' });
            } catch (e) {
                console.error('Error cerrando sesión global:', e);
            }
            resetToLoginScreen();
            showToast('Sesión cerrada en todos los dispositivos');
        }

        async function startApp() {
            const boot = document.getElementById('boot-loading');
            if (boot) boot.style.display = 'none';
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('app').classList.add('ready');

            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

            await init();
        }

        // Pop-up informativo de la pantalla de login: qué es Bitácora, su
        // filosofía y un resumen de lo que ofrece. Contenido estático, sin
        // depender de que haya sesión iniciada ni de datos cargados.
        function openAboutBitacora() {
            showModal(`
                <div class="modal-title">
                    <span>¿Qué es <span style="color:#3b82f6">Bitácora</span>?</span>
                    <button class="modal-close" onclick="closeModal()">✕</button>
                </div>
                <div class="about-modal">
                    <p class="about-intro">Bitácora es un espacio único y tranquilo para reunir tu vida entera — desde tu ocio hasta tu trabajo, pasando por tus rutinas y tu forma de organizarte — sin la sobrecarga de tener una app distinta para cada cosa, y sin el ruido del contenido rápido de siempre. No busca ser perfecta en cada rincón: busca que no tengas que abrir diez apps distintas para saberlo todo de tu vida.</p>

                    <div class="about-grid">
                        <div class="about-feature">
                            <div class="about-feature-icon">◷</div>
                            <div class="about-feature-title">Tu día a día</div>
                            <div class="about-feature-desc">Calendario, planificador diario, notas y un mapa anual de puntos para ver, de un vistazo, cómo ha sido tu año.</div>
                        </div>
                        <div class="about-feature">
                            <div class="about-feature-icon">◊</div>
                            <div class="about-feature-title">Ocio</div>
                            <div class="about-feature-desc">Lleva la cuenta de libros, películas, series y videojuegos — y recomiéndaselos a tus amigos dentro de la propia app.</div>
                        </div>
                        <div class="about-feature">
                            <div class="about-feature-icon">✈</div>
                            <div class="about-feature-title">Viajes</div>
                            <div class="about-feature-desc">Un gestor completo por viaje: lugares que ver, itinerario con horarios, documentos y listas de qué llevar.</div>
                        </div>
                        <div class="about-feature">
                            <div class="about-feature-icon">◫</div>
                            <div class="about-feature-title">Trabajo y finanzas</div>
                            <div class="about-feature-desc">Historial laboral, un dashboard financiero completo y seguimiento de tus inversiones.</div>
                        </div>
                        <div class="about-feature">
                            <div class="about-feature-icon">◉</div>
                            <div class="about-feature-title">Organización</div>
                            <div class="about-feature-desc">Objetivos, proyectos, enlaces y coleccionables — cada aspecto de tu vida tiene su sitio propio.</div>
                        </div>
                        <div class="about-feature">
                            <div class="about-feature-icon">◕</div>
                            <div class="about-feature-title">Amigos</div>
                            <div class="about-feature-desc">Conecta tu cuenta con la de otras personas mediante un código propio y compartid recomendaciones.</div>
                        </div>
                    </div>

                    <div class="about-footer">
                        <div class="about-footer-title">Accesible desde cualquier sitio, siempre tuyo</div>
                        <div class="about-footer-desc">Funciona desde cualquier ordenador o móvil del mundo con solo iniciar sesión. Tus datos son siempre tuyos: exporta una copia completa cuando quieras, sin depender de nadie.</div>
                    </div>
                </div>
                <button class="btn-modal-primary" onclick="closeModal()">Entendido</button>
            `);
        }

        function showAuthMode(mode) {
            ['login', 'signup', 'forgot', 'reset'].forEach(m => {
                document.getElementById('mode-' + m).style.display = (m === mode) ? 'block' : 'none';
            });
        }

        async function handleSignup() {
            const email = document.getElementById('signup-email').value.trim();
            const password = document.getElementById('signup-password').value;
            const password2 = document.getElementById('signup-password2').value;
            const errorEl = document.getElementById('signup-error');
            const successEl = document.getElementById('signup-success');
            const btn = document.getElementById('signup-btn');
            errorEl.textContent = '';
            successEl.textContent = '';

            if (!email || !password || !password2) { errorEl.textContent = 'Rellena todos los campos.'; return; }
            if (password.length < 6) { errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
            if (password !== password2) { errorEl.textContent = 'Las contraseñas no coinciden.'; return; }

            btn.disabled = true;
            btn.textContent = 'Creando...';
            const { data, error } = await sb.auth.signUp({ email, password });
            btn.disabled = false;
            btn.textContent = 'Crear cuenta';

            if (error) { errorEl.textContent = 'No se pudo crear la cuenta: ' + error.message; return; }
            if (data.session) { await startApp(); } else {
                successEl.textContent =
                    'Cuenta creada. Revisa tu email para confirmar la cuenta antes de entrar.';
                document.getElementById('signup-email').value = '';
                document.getElementById('signup-password').value = '';
                document.getElementById('signup-password2').value = '';
            }
        }

        async function handleForgotPassword() {
            const email = document.getElementById('forgot-email').value.trim();
            const errorEl = document.getElementById('forgot-error');
            const successEl = document.getElementById('forgot-success');
            const btn = document.getElementById('forgot-btn');
            errorEl.textContent = '';
            successEl.textContent = '';

            if (!email) { errorEl.textContent = 'Introduce tu email.'; return; }

            btn.disabled = true;
            btn.textContent = 'Enviando...';
            const { error } = await sb.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + window.location.pathname
            });
            btn.disabled = false;
            btn.textContent = 'Enviar enlace';

            if (error) { errorEl.textContent = 'No se pudo enviar el enlace: ' + error.message; return; }
            successEl.textContent =
                'Si el email existe, te hemos enviado un enlace para restablecer tu contraseña.';
        }

        async function handleResetPassword() {
            const password = document.getElementById('reset-password').value;
            const password2 = document.getElementById('reset-password2').value;
            const errorEl = document.getElementById('reset-error');
            const successEl = document.getElementById('reset-success');
            const btn = document.getElementById('reset-btn');
            errorEl.textContent = '';
            successEl.textContent = '';

            if (!password || !password2) { errorEl.textContent = 'Rellena ambos campos.'; return; }
            if (password.length < 6) { errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
            if (password !== password2) { errorEl.textContent = 'Las contraseñas no coinciden.'; return; }

            btn.disabled = true;
            btn.textContent = 'Guardando...';
            const { error } = await sb.auth.updateUser({ password });
            btn.disabled = false;
            btn.textContent = 'Guardar contraseña';

            if (error) { errorEl.textContent = 'No se pudo actualizar la contraseña: ' + error.message; return; }
            successEl.textContent = 'Contraseña actualizada. Ya puedes usar la app.';
            setTimeout(() => startApp(), 1200);
        }

        document.addEventListener('DOMContentLoaded', () => {
            const pw = document.getElementById('login-password');
            if (pw) pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
        });

        sb.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                document.getElementById('login-screen').style.display = 'flex';
                document.getElementById('app').classList.remove('ready');
                showAuthMode('reset');
            }
        });

        (async () => {
            const { data: { session } } = await sb.auth.getSession();
            document.getElementById('boot-loading').style.display = 'none';
            if (session) {
                await startApp();
            } else {
                document.getElementById('login-screen').style.display = 'flex';
            }
        })();

        // ============================================================
        //  CONSTANTS & DATA
        // ============================================================
        let entries = [];
        let categories = [];
        let notes = [];
        let prompts = [];
        let editId = null;
        let editType = null;
        let filteredEntries = [];
        let userName = '';
        let investmentData = { rate: 7, funds: [] };
        let inbox = [];
        let plannedTrips = [];
        let apuntes = [];
        // Tareas semanales: recordatorios activos de la semana actual.
        // Al completarse se convierten en una entrada real del calendario.
        let weeklyTasks = [];
        // Coleccionables: catálogo de objetos por categoría con valor de mercado.
        let collectibleCategories = [
            { id: 'cat_cartas', name: 'Cartas' },
            { id: 'cat_videojuegos', name: 'Videojuegos' }
        ];
        let collectibles = [];
        // Planificador del día: sustituye a Apuntes. Se reinicia cada día a las 4:00 am.
        let dayPlanner = { dayKey: '', items: [] };
        let financeIncome = { current: 0, next: 0 };
        // Perfil económico: cifras reales que el usuario actualiza periódicamente.
        // history conserva una fotografía mensual para poder comparar evolución.
        let financeProfile = {
            cash: 0,
            cashTarget: 0,
            invested: 0,
            investedTarget: 0,
            emergency: 0,
            emergencyTarget: 0,
            vacation: 0,
            vacationTarget: 0,
            salaryForecast: {},
            history: [],
            oneOffIncome: [],
            // movements: registro unificado de ingresos y gastos puntuales
            // (sustituye a oneOffIncome, que se migra automáticamente al cargar).
            movements: [],
            // chartHistory: fotografías mensuales específicas para la gráfica de evolución
            // (efectivo, ingresado, emergencia). Se alimenta con el botón "Actualizar gráfica".
            chartHistory: [],
            // forecastProfile: datos manuales que alimentan la fórmula de provisión
            // a fin de año (sueldo, duración del contrato, aportaciones planeadas).
            forecastProfile: { salary: 0, contractMonths: 0, emergencyMonthlyPlan: 0, vacationMonthlyPlan: 0, investMonthlyPlan: 0 }
        };
        let financeSubView = 'menu';
        let devModeActive = false;
        // Oculta las cifras del dashboard financiero. Se guarda en la nube
        // (no en localStorage) para que viaje entre dispositivos.
        let blurFinances = false;
        let yearCalYear = new Date().getFullYear();
        // Estudios: asignaturas (con exámenes/trabajos y nota), horario semanal
        // recurrente y notas rápidas.
        const STUDIES_DAYS = [
            { key: 'lun', label: 'Lunes' }, { key: 'mar', label: 'Martes' }, { key: 'mie', label: 'Miércoles' },
            { key: 'jue', label: 'Jueves' }, { key: 'vie', label: 'Viernes' }, { key: 'sab', label: 'Sábado' }, { key: 'dom', label: 'Domingo' }
        ];
        // El horario semanal solo muestra de lunes a viernes (fin de semana
        // sin clases para este uso). Se mantiene STUDIES_DAYS completo para
        // no perder datos de sab/dom que ya hubiera guardados, solo se deja
        // de pintar esas dos columnas.
        const STUDIES_SCHEDULE_DISPLAY_DAYS = STUDIES_DAYS.filter(d => d.key !== 'sab' && d.key !== 'dom');
        let studies = { subjects: [], schedule: { lun: [], mar: [], mie: [], jue: [], vie: [], sab: [], dom: [] }, quickNotes: [] };
        let links = [];
        let linkCategories = [];

        // ============================================================
        //  ENTRY TYPES
        // ============================================================
        const ENTRY_TYPES = {
            BOOK: 'book',
            MOVIE: 'movie',
            SERIES: 'series',
            GAME: 'game',
            TRAVEL: 'travel',
            WORK: 'work',
            PROJECT: 'project',
            EVENT: 'event',
            RESTAURANT: 'restaurant',
            PLACE: 'place',
            DOCUMENT: 'document',
            GOAL: 'goal',
            BIRTHDAY: 'birthday',
            SUBSCRIPTION: 'subscription',
            FIXED_EXPENSE: 'fixed_expense'
        };

        const TYPE_ICONS = {
            book: '◊',
            movie: '▸',
            series: '◈',
            game: '◉',
            travel: '◈',
            work: '◫',
            project: '⊞',
            event: '📅',
            restaurant: '◉',
            place: '⌂',
            document: '📄',
            goal: '◉',
            birthday: '🎂',
            subscription: '🔄',
            fixed_expense: '📌'
        };

        const TYPE_LABELS = {
            book: 'Libro',
            movie: 'Película',
            series: 'Serie',
            game: 'Videojuego',
            travel: 'Viaje',
            work: 'Trabajo',
            project: 'Proyecto',
            event: 'Evento',
            place: 'Lugar',
            document: 'Documento',
            goal: 'Objetivo',
            birthday: 'Cumpleaños',
            subscription: 'Suscripción',
            fixed_expense: 'Gasto fijo'
        };

        const VIEW_LABELS = {
            calendar: 'INICIO',
            home: 'Centro resumen',
            culture: 'Ocio',
            travels: 'Viajes',
            work: 'Trabajo',
            projects: 'Proyectos',
            events: 'Eventos',
            documents: 'Documentos',
            finances: 'Dashboard',
            tags: 'Etiquetas',
            fantasy: 'Fantasy',
            vault: 'Vault',
            notes: 'Notas',
            goals: 'Objetivos',
            planner: 'Planificador del día',
            collectibles: 'Coleccionables',
            friends: 'Amigos',
            studies: 'Estudios',
            links: 'Enlaces',
            settings: 'Ajustes'
        };

        // ============================================================
        //  NAVEGACIÓN: fuente única para sidebar, menú móvil y el
        //  buscador "¿dónde quieres ir?" (evita mantener el menú
        //  duplicado a mano en dos sitios distintos).
        // ============================================================
        const NAV_SECTIONS = [
            { label: 'General', items: [
                { view: 'calendar', icon: '◷', text: 'INICIO' },
                { view: 'home', icon: '⌂', text: 'Centro resumen' },
                { view: 'planner', icon: '▤', text: 'Planificador' },
                { view: 'notes', icon: '✎', text: 'Notas' },
            ] },
            { label: 'Desarrollo', items: [
                { view: 'events', icon: '◈', text: 'Eventos' },
                { view: 'finances', icon: '◫', text: 'Finanzas' },
                { view: 'work', icon: '◫', text: 'Trabajo' },
                { view: 'studies', icon: '◎', text: 'Estudios' },
                { view: 'documents', icon: '▤', text: 'Documentos' },
                { view: 'goals', icon: '◉', text: 'Objetivos' },
                { view: 'projects', icon: '⊞', text: 'Proyectos' },
                { view: 'links', icon: '⛓', text: 'Enlaces' },
            ] },
            { label: 'Otros', items: [
                { view: 'culture', icon: '◊', text: 'Ocio' },
                { view: 'travels', icon: '⌂', text: 'Viajes' },
                { view: 'collectibles', icon: '◆', text: 'Coleccionables' },
                { view: 'friends', icon: '◕', text: 'Amigos' },
                { view: 'tags', icon: '#', text: 'Etiquetas' },
            ] },
            { label: 'Sistema', items: [
                { view: 'settings', icon: '⚙', text: 'Ajustes' },
            ] },
        ];

        const NAV_VIEW_LABELS = Object.fromEntries(NAV_SECTIONS.flatMap(s => s.items).map(i => [i.view, i.text]));

        // Apartados "de segundo nivel" dentro de cada sección — para poder
        // escribir p.ej. "asignaturas" en el buscador y llegar directo a
        // Estudios > Asignaturas, aunque el nombre no coincida con ninguna
        // sección de primer nivel. `anchor` hace scroll hasta ese bloque,
        // `setter`+`value` cambia una pestaña/modo interno (llama a
        // window[setter](value) tras cambiar de vista), `action` llama a una
        // función tras cambiar de vista (p.ej. abrir un modal).
        const NAV_SUBSECTIONS = [
            { view: 'studies', text: 'Asignaturas', anchor: 'studies-subjects-section' },
            { view: 'studies', text: 'Horario semanal', anchor: 'studies-schedule-section' },
            { view: 'studies', text: 'Notas rápidas', action: 'openQuickNotesList' },
            { view: 'culture', text: 'Libros', setter: 'setCultureTab', value: 'books' },
            { view: 'culture', text: 'Series', setter: 'setCultureTab', value: 'series' },
            { view: 'culture', text: 'Películas', setter: 'setCultureTab', value: 'movies' },
            { view: 'culture', text: 'Videojuegos', setter: 'setCultureTab', value: 'games' },
            { view: 'finances', text: 'Sueldo y aportaciones', anchor: 'finance-forecast-section' },
            { view: 'finances', text: 'Movimientos', anchor: 'finance-movements-section' },
            { view: 'finances', text: 'Patrimonio operativo', anchor: 'finance-networth-section' },
            { view: 'finances', text: 'Cuentas', anchor: 'finance-accounts-section' },
            { view: 'travels', text: 'Viajes', setter: 'setTravelPlacesTab', value: 'travels' },
            { view: 'travels', text: 'Lugares', setter: 'setTravelPlacesTab', value: 'places' },
            { view: 'calendar', text: 'Vista Día', setter: 'setCalView', value: 'day' },
            { view: 'calendar', text: 'Vista Semana', setter: 'setCalView', value: 'week' },
            { view: 'calendar', text: 'Vista Mes', setter: 'setCalView', value: 'month' },
        ];

        const CREATE_PALETTE_ITEMS = [
            { type: 'book', text: 'Libro' },
            { type: 'movie', text: 'Película' },
            { type: 'series', text: 'Serie' },
            { type: 'game', text: 'Videojuego' },
            { type: 'travel', text: 'Viaje' },
            { type: 'work', text: 'Trabajo' },
            { type: 'project', text: 'Proyecto' },
            { type: 'event', text: 'Evento' },
            { type: 'place', text: 'Lugar' },
            { type: 'goal', text: 'Objetivo' },
            { type: 'birthday', text: 'Cumpleaños' },
        ];

        // Comandos del buscador "¿dónde quieres ir?": se activan escribiendo
        // "/" y se irán ampliando con el tiempo.
        const PALETTE_COMMANDS = [
            { cmd: 'admin', text: '/admin' },
        ];

        // ============================================================
        //  FILTRO POR MES ("películas septiembre" en el buscador)
        // ============================================================
        const MONTH_QUERY_NAMES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
        const ENTRY_TYPE_QUERY_WORDS = {
            book: ['libro', 'libros'],
            movie: ['pelicula', 'peliculas'],
            series: ['serie', 'series'],
            event: ['evento', 'eventos']
        };
        const ENTRY_TYPE_LABEL_PLURAL = { book: 'Libros', movie: 'Películas', series: 'Series', event: 'Eventos' };
        let entryMonthFilter = null;

        function stripAccents(s) {
            return s.normalize('NFD').split('').filter(function(ch){var c=ch.charCodeAt(0);return !(c>=768&&c<=879);}).join('');
        }

        // Reconoce "<tipo> <mes>" (en cualquier orden) escrito en el
        // buscador, p.ej. "peliculas septiembre" o "septiembre eventos".
        function parseMonthQuery(q) {
            const words = stripAccents(q.trim().toLowerCase()).split(/\s+/);
            if (words.length < 2) return null;
            let type = null;
            for (const [t, list] of Object.entries(ENTRY_TYPE_QUERY_WORDS)) {
                if (list.some(w => words.includes(w))) { type = t; break; }
            }
            if (!type) return null;
            const monthIdx = MONTH_QUERY_NAMES.findIndex(m => words.includes(m));
            if (monthIdx === -1) return null;
            return { type, month: monthIdx + 1, monthLabel: MONTH_QUERY_NAMES[monthIdx] };
        }

        // Reconoce "<día> <mes>" en el buscador (p.ej. "14 septiembre") para
        // saltar directamente a esa fecha en el calendario, vista por día.
        function parseDayMonthQuery(q) {
            const words = stripAccents(q.trim().toLowerCase()).split(/\s+/);
            if (words.length < 2) return null;
            let day = null;
            for (const w of words) {
                if (/^\d{1,2}$/.test(w)) { const n = parseInt(w, 10); if (n >= 1 && n <= 31) { day = n; break; } }
            }
            if (day === null) return null;
            const monthIdx = MONTH_QUERY_NAMES.findIndex(m => words.includes(m));
            if (monthIdx === -1) return null;
            const year = new Date().getFullYear();
            const date = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            return { day, month: monthIdx + 1, monthLabel: MONTH_QUERY_NAMES[monthIdx], date };
        }

        // Reconoce "hoy", "ayer" y "mañana" sueltos en el buscador.
        function parseRelativeDayQuery(q) {
            const word = stripAccents(q.trim().toLowerCase());
            const offsets = { hoy: 0, ayer: -1, manana: 1 };
            if (!(word in offsets)) return null;
            const d = new Date();
            d.setDate(d.getDate() + offsets[word]);
            const label = { hoy: 'Hoy', ayer: 'Ayer', manana: 'Mañana' }[word];
            return { label, date: d.toISOString().slice(0, 10) };
        }

        function goToCalendarDate(dateStr) {
            switchView('calendar');
            calViewMode = 'day';
            selectCalDate(dateStr);
        }

        function applyEntryMonthFilter(type, month, monthLabel) {
            entryMonthFilter = { type, month, monthLabel };
            if (type === 'event') { switchView('events'); return; }
            switchView('culture');
            setCultureTab(type === 'book' ? 'books' : type === 'series' ? 'series' : 'movies');
        }

        function clearEntryMonthFilter() { entryMonthFilter = null; render(); }

        // Filtra por mes (cualquier año) si el filtro activo es de ese tipo,
        // y en tal caso añade el aviso con el enlace para quitarlo.
        function applyMonthFilterTo(type, items) {
            if (!entryMonthFilter || entryMonthFilter.type !== type) return { items, banner: '' };
            const filtered = items.filter(e => e.date && Number(e.date.slice(5, 7)) === entryMonthFilter.month);
            const banner = `<div class="month-filter-banner">Mostrando ${ENTRY_TYPE_LABEL_PLURAL[type].toLowerCase()} de <strong>${escapeHtml(entryMonthFilter.monthLabel)}</strong> (todos los años) · <a href="javascript:void(0)" onclick="clearEntryMonthFilter()">Quitar filtro</a></div>`;
            return { items: filtered, banner };
        }

        function renderNavButtons(sections, mobile) {
            return sections.map(sec => `<span class="nav-label">${escapeHtml(sec.label)}</span>` +
                sec.items.map(i => mobile
                    ? `<button onclick="switchView('${i.view}');toggleMobileMenu()" data-view="${i.view}"><span class="nav-icon">${i.icon}</span> ${escapeHtml(i.text)}</button>`
                    : `<button onclick="switchView('${i.view}')" data-view="${i.view}"><span class="nav-icon">${i.icon}</span><span class="nav-text">${escapeHtml(i.text)}</span></button>`
                ).join('')
            ).join('');
        }

        function renderAllNavs() {
            const top = NAV_SECTIONS.slice(0, 3);
            const bottom = NAV_SECTIONS.slice(3);
            const targets = [
                ['sidebar-nav-top', top, false], ['sidebar-nav-bottom', bottom, false],
                ['mobile-nav-top', top, true], ['mobile-nav-bottom', bottom, true],
            ];
            targets.forEach(([id, sections, mobile]) => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = renderNavButtons(sections, mobile);
            });
        }
        renderAllNavs();

        const NON_CALENDAR_TYPES = ['document', 'restaurant', 'place', 'goal', 'subscription', 'fixed_expense'];

        const VIEW_TO_ENTRY_TYPE = {
            calendar: null,
            home: null,
            culture: null,
            travels: null,
            work: 'work',
            projects: 'project',
            events: 'event',
            documents: null,
            finances: null,
            tags: null,
            fantasy: null,
            vault: null,
            notes: null,
            goals: 'goal',
            settings: null
        };

        const TYPE_GENDER = {
            book: 'o', movie: 'a', series: 'a', game: 'o', travel: 'o',
            work: 'o', project: 'o', event: 'o', place: 'o', document: 'o', goal: 'o', birthday: 'o',
            subscription: 'a', fixed_expense: 'o'
        };

        // ============================================================
        //  UTILITY FUNCTIONS
        // ============================================================
        function todayISO() { return new Date().toISOString().slice(0, 10); }

        function formatNoteTitle(dateISO) {
            const [y, m, d] = dateISO.split('-');
            return '#' + d + '/' + m + '/' + y;
        }

        function escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str || '';
            return div.innerHTML;
        }

        // ============================================================
        //  WIKILINKS
        // ============================================================
        // Dónde vive cada tipo de entrada, para poder navegar hasta ella
        // (vista + pestaña interna) antes de abrirla desde un enlace.
        const ENTRY_TYPE_DESTINATION = {
            book: { view: 'culture', tab: 'books' }, movie: { view: 'culture', tab: 'movies' },
            series: { view: 'culture', tab: 'series' }, game: { view: 'culture', tab: 'games' },
            travel: { view: 'travels', tab: 'travels' }, place: { view: 'travels', tab: 'places' },
            work: { view: 'work' }, project: { view: 'projects' }, event: { view: 'events' },
            document: { view: 'documents' }, goal: { view: 'goals' }, birthday: { view: 'calendar' },
            subscription: { view: 'finances' }, fixed_expense: { view: 'finances' }
        };

        function navigateToEntry(id) {
            const entry = entries.find(e => e.id === id);
            if (!entry) return;
            const dest = ENTRY_TYPE_DESTINATION[entry.type] || { view: 'calendar' };
            switchView(dest.view);
            if (dest.view === 'culture' && dest.tab) setCultureTab(dest.tab);
            else if (dest.view === 'travels' && dest.tab) setTravelPlacesTab(dest.tab);
            openEntryDetail(id);
        }

        // Punto único desde el que cualquier wikilink o mención "/palabra"
        // abre su destino, sea cual sea el módulo donde vive.
        function followMention(kind, id) {
            if (kind === 'entry') navigateToEntry(id);
            else if (kind === 'note') { switchView('notes'); openReadNote(id); }
            else if (kind === 'subject') { switchView('studies'); openSubjectDetail(id); }
            else if (kind === 'movement') { switchView('finances'); }
            else if (kind === 'collectible') { switchView('collectibles'); openEditCollectible(id); }
            else if (kind === 'document') { switchView('documents'); }
            else if (kind === 'link') { switchView('links'); }
            else if (kind === 'friend') { switchView('friends'); }
        }

        // Índice de todo lo que se puede enlazar/mencionar en la app,
        // reconstruido en cada búsqueda (las listas son pequeñas, así que
        // no hace falta cachear) para que wikilinks y menciones alcancen
        // cualquier módulo, no solo entries y notas.
        // Se reconstruía por completo (recorriendo entries/notes/studies/
        // financeProfile/collectibles) cada vez que un wikilink o mención
        // había que resolverse — y un solo render puede resolver decenas
        // (todas las notas/campos con [[...]] o /palabra visibles a la vez).
        // Se cachea y solo se recalcula cuando render() marca los datos
        // como cambiados (invalidateLinkableIndex), así que sigue siempre
        // al día sin repetir el escaneo dentro del mismo render.
        let _linkableIndexCache = null;
        function invalidateLinkableIndex() { _linkableIndexCache = null; }
        function buildLinkableIndex() {
            if (_linkableIndexCache) return _linkableIndexCache;
            const idx = [];
            entries.forEach(e => { if (e.title) idx.push({ title: e.title, kind: 'entry', id: e.id }); });
            (notes || []).forEach(n => idx.push({ title: formatNoteTitle(n.date), kind: 'note', id: n.id }));
            (studies?.subjects || []).forEach(s => idx.push({ title: s.name, kind: 'subject', id: s.id }));
            (financeProfile?.movements || []).forEach(m => { if (m.label) idx.push({ title: m.label, kind: 'movement', id: m.id }); });
            (collectibles || []).forEach(c => idx.push({ title: c.name, kind: 'collectible', id: c.id }));
            _linkableIndexCache = idx;
            return idx;
        }

        function resolveWikilink(label) {
            const clean = label.trim().toLowerCase();
            if (!clean) return null;
            return buildLinkableIndex().find(x => x.title.toLowerCase() === clean) || null;
        }

        // Coincidencia parcial para /palabra: la primera entrada cuyo
        // título contiene el texto escrito (case-insensitive).
        function resolveMention(word) {
            const clean = word.trim().toLowerCase();
            if (!clean || clean.length < 2) return null;
            return buildLinkableIndex().find(x => x.title.toLowerCase().includes(clean)) || null;
        }

        function linkifyWikilinks(text) {
            if (!text) return '';
            let out = text.replace(/\[\[(.+?)\]\]/g, (match, label) => {
                const target = resolveWikilink(label);
                if (!target) {
                    return '<span class="wikilink wikilink-broken" title="No se encontró nada con este título">[[' + escapeHtml(label) + ']]</span>';
                }
                return '<a href="javascript:void(0)" class="wikilink" onclick="followMention(\'' + target.kind + '\',\'' + target.id + '\')">' + escapeHtml(label) + '</a>';
            });
            out = out.replace(/(^|[\s(])\/([a-zA-Z0-9áéíóúñÁÉÍÓÚÑ_-]{2,})/g, (match, pre, word) => {
                const target = resolveMention(word);
                if (!target) return match;
                return pre + '<a href="javascript:void(0)" class="wikilink wikilink-mention" onclick="followMention(\'' + target.kind + '\',\'' + target.id + '\')" title="' + escapeHtml(target.title) + '">/' + escapeHtml(word) + '</a>';
            });
            return out;
        }

        function parseWikiLinks(text) {
            if (!text) return [];
            const ids = new Set();
            [...text.matchAll(/\[\[(.+?)\]\]/g)].forEach(m => {
                const target = resolveWikilink(m[1].trim());
                if (target?.kind === 'entry') ids.add(target.id);
            });
            [...text.matchAll(/(?:^|[\s(])\/([a-zA-Z0-9áéíóúñÁÉÍÓÚÑ_-]{2,})/g)].forEach(m => {
                const target = resolveMention(m[1]);
                if (target?.kind === 'entry') ids.add(target.id);
            });
            return [...ids];
        }

        function linkifyText(text) {
            if (!text) return '';
            const escaped = escapeHtml(text);
            return linkifyWikilinks(escaped).replace(/\n/g, '<br>');
        }

        function getBacklinks(entryId) {
            return entries.filter(e => e.id !== entryId && parseWikiLinks(e.notes || '').includes(entryId));
        }

        function openEntryFromLink(entryId) {
            const target = entries.find(e => e.id === entryId);
            if (!target) return;
            closeModal();
            openEditEntry(entryId);
        }

        // ============================================================
        //  BUSCADOR "¿DÓNDE QUIERES IR?" / CAPTURA RÁPIDA
        //  Un mismo componente sirve para dos cosas: navegar a cualquier
        //  apartado (ENTER en cualquier sitio) o elegir el tipo de una
        //  entrada nueva (botón de captura rápida) — mismo teclado,
        //  mismo filtrado en vivo, distinta lista y distinta acción final.
        // ============================================================
        let cpMode = 'nav';
        let cpSelectedIndex = 0;

        function paletteItemsFor(mode) {
            return mode === 'create'
                ? CREATE_PALETTE_ITEMS.map(i => ({ ...i, kind: 'create' }))
                : NAV_SECTIONS.flatMap(s => s.items).map(i => ({ ...i, kind: 'nav' }));
        }

        // Cuando se escribe algo que no coincide con ningún apartado (solo
        // en modo navegación), se buscan entradas y notas por título,
        // contenido o etiquetas — igual que hacía el buscador antiguo — para
        // poder saltar directamente a una entrada concreta.
        function searchEntriesForPalette(q) {
            const results = [];
            entries.forEach(e => {
                if (!e.title) return;
                const haystack = [e.title, e.notes, e.description, ...(e.tags || [])].filter(Boolean).join(' ').toLowerCase();
                if (haystack.includes(q)) results.push({ kind: 'entry', id: e.id, text: e.title });
            });
            notes.forEach(n => {
                const label = formatNoteTitle(n.date);
                if ((n.content || '').toLowerCase().includes(q) || label.toLowerCase().includes(q)) {
                    results.push({ kind: 'note', id: n.id, text: label });
                }
            });
            (studies.subjects || []).forEach(s => {
                if (s.name && s.name.toLowerCase().includes(q)) results.push({ kind: 'subject', id: s.id, text: s.name });
            });
            // Solo busca entre los documentos ya cargados (la lista se trae
            // de Supabase Storage al entrar en Documentos, no al arrancar
            // la app) — si aún no has abierto ese apartado esta sesión, no
            // habrá nada que buscar todavía.
            (documents || []).forEach(d => {
                if (d.name && d.name.toLowerCase().includes(q)) results.push({ kind: 'document', id: d.name, text: d.name });
            });
            // Lugares/itinerario/listas viven anidados dentro de cada viaje
            // (entries de tipo 'travel'), sin título propio a ese nivel —
            // por eso necesitan su propio recorrido en vez de colar en el
            // bucle de entries de arriba.
            entries.filter(e => e.type === 'travel').forEach(trip => {
                (trip.places || []).forEach(p => {
                    if (p.nombre && p.nombre.toLowerCase().includes(q)) {
                        results.push({ kind: 'trip-place', tripId: trip.id, text: `${p.nombre} - ${trip.title || 'Viaje'}` });
                    }
                });
                (trip.itinerario || []).forEach(it => {
                    if (it.titulo && it.titulo.toLowerCase().includes(q)) {
                        results.push({ kind: 'trip-itinerary', tripId: trip.id, text: `${it.titulo} - ${trip.title || 'Viaje'}` });
                    }
                });
                (trip.listas || []).forEach(lista => {
                    (lista.items || []).forEach(item => {
                        if (item.texto && item.texto.toLowerCase().includes(q)) {
                            results.push({ kind: 'trip-list', tripId: trip.id, text: `${item.texto} - ${trip.title || 'Viaje'}` });
                        }
                    });
                });
            });
            (links || []).forEach(l => {
                if ((l.title || '').toLowerCase().includes(q) || (l.url || '').toLowerCase().includes(q)) {
                    results.push({ kind: 'link', id: l.id, text: l.title || l.url });
                }
            });
            (collectibles || []).forEach(c => {
                if (c.name && c.name.toLowerCase().includes(q)) results.push({ kind: 'collectible', id: c.id, text: c.name });
            });
            (typeof amigos !== 'undefined' ? amigos : []).forEach(a => {
                const nombre = a.nombre_visible || a.friend_nombre;
                if (nombre && nombre.toLowerCase().includes(q)) results.push({ kind: 'friend', text: `${nombre} - Amigo` });
            });
            (typeof recomendaciones !== 'undefined' ? recomendaciones : []).forEach(r => {
                const titulo = (r.entrada && r.entrada.title) || '';
                if (titulo && titulo.toLowerCase().includes(q)) {
                    results.push({ kind: 'recommendation', tipo: r.tipo, text: `${titulo} - Recomendado` });
                }
            });
            (typeof viajesCompartidos !== 'undefined' ? viajesCompartidos : []).forEach(v => {
                const titulo = (v.viaje && v.viaje.title) || '';
                if (titulo && titulo.toLowerCase().includes(q)) {
                    results.push({ kind: 'shared-trip', text: `${titulo} - Viaje compartido` });
                }
            });
            return results.slice(0, 30);
        }

        function openCommandPalette(mode) {
            if (document.getElementById('command-palette-overlay')) return;
            cpMode = mode;
            cpSelectedIndex = 0;
            const overlay = document.createElement('div');
            overlay.id = 'command-palette-overlay';
            overlay.className = 'command-palette-overlay';
            overlay.onclick = (e) => { if (e.target === overlay) closeCommandPalette(); };
            overlay.innerHTML = `
                <div class="command-palette-box">
                    <div class="command-palette-prompt">${mode === 'create' ? '¿Dónde quieres <span class="cp-accent">crear</span> la entrada?' : '¿Dónde quieres <span class="cp-accent">ir</span>?'}</div>
                    <input id="command-palette-input" class="command-palette-input" autocomplete="off" placeholder="Escribe para buscar...">
                    <div class="command-palette-list-wrap">
                        <div id="command-palette-list" class="command-palette-list"></div>
                        <div class="command-palette-fade hidden"></div>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            document.body.classList.add('cp-blur');
            renderCommandPaletteList('');
            const input = document.getElementById('command-palette-input');
            const list = document.getElementById('command-palette-list');
            input.addEventListener('input', () => { cpSelectedIndex = 0; renderCommandPaletteList(input.value); });
            input.addEventListener('keydown', handleCommandPaletteKeydown);
            list.addEventListener('scroll', updateCommandPaletteFade);
            setTimeout(() => input.focus(), 30);
        }

        function updateCommandPaletteFade() {
            const list = document.getElementById('command-palette-list');
            const fade = document.querySelector('#command-palette-overlay .command-palette-fade');
            if (!list || !fade) return;
            const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 4;
            fade.classList.toggle('hidden', atBottom || list.scrollHeight <= list.clientHeight);
        }

        function renderCommandPaletteList(query) {
            const q = query.trim().toLowerCase();
            let filtered;
            // Los comandos "/" son deliberadamente invisibles: no se listan
            // ni se insinúan, solo funcionan si se escribe el comando exacto
            // y se pulsa ENTER (ver handleCommandPaletteKeydown).
            if (cpMode === 'nav' && q.startsWith('/')) {
                filtered = [];
            } else if (cpMode === 'create') {
                const all = paletteItemsFor('create');
                filtered = q ? all.filter(i => i.text.toLowerCase().includes(q)) : all;
            } else {
                const all = paletteItemsFor('nav');
                const navMatches = q ? all.filter(i => i.text.toLowerCase().includes(q)) : all;
                // Subapartados (p.ej. "Asignaturas" dentro de Estudios): se
                // muestran como "Asignaturas - Estudios" y solo entran en
                // juego cuando se escribe algo, para no duplicar la lista
                // inicial de secciones.
                const subMatches = q ? NAV_SUBSECTIONS.filter(s => s.text.toLowerCase().includes(q)).map(s => ({
                    ...s, kind: 'nav-sub', text: `${s.text} - ${s.viewLabel || NAV_VIEW_LABELS[s.view] || s.view}`
                })) : [];
                // Fantasy es un apartado oculto (requiere Modo Desarrollador):
                // nunca aparece en la lista inicial, solo si se escribe algo
                // que coincida con su nombre y el modo esté activo.
                const hiddenMatches = (q && devModeActive && 'fantasy'.includes(q))
                    ? [{ kind: 'fantasy', text: 'Fantasy' }] : [];
                // "peliculas septiembre" (o cualquier combinación tipo+mes)
                // lleva directamente a esa sección filtrada por mes.
                const monthQuery = q ? parseMonthQuery(q) : null;
                // "14 septiembre" lleva directamente a esa fecha en el
                // calendario, vista por día.
                const dayQuery = (q && !monthQuery) ? parseDayMonthQuery(q) : null;
                const relativeDayQuery = (q && !monthQuery && !dayQuery) ? parseRelativeDayQuery(q) : null;
                filtered = monthQuery
                    ? [{ kind: 'month-filter', text: `${ENTRY_TYPE_LABEL_PLURAL[monthQuery.type]} de ${monthQuery.monthLabel}`, type: monthQuery.type, month: monthQuery.month, monthLabel: monthQuery.monthLabel }]
                    : dayQuery
                    ? [{ kind: 'day-nav', text: `${dayQuery.day} de ${dayQuery.monthLabel} - Calendario`, date: dayQuery.date }]
                    : relativeDayQuery
                    ? [{ kind: 'day-nav', text: `${relativeDayQuery.label} - Calendario`, date: relativeDayQuery.date }]
                    : hiddenMatches.length ? hiddenMatches
                    : (navMatches.length || subMatches.length) ? [...navMatches, ...subMatches]
                    : q ? searchEntriesForPalette(q) : navMatches;
            }
            if (cpSelectedIndex >= filtered.length) cpSelectedIndex = 0;
            const list = document.getElementById('command-palette-list');
            if (!list) return;
            list.innerHTML = filtered.length ? filtered.map((item, i) => `
                <div class="command-palette-item ${i === cpSelectedIndex ? 'active' : ''}" onmousedown="event.preventDefault();selectCommandPaletteItem(${i})">
                    <span>${escapeHtml(item.text)}</span>
                </div>`).join('') : '<div class="command-palette-empty">Sin resultados</div>';
            list._filtered = filtered;
            list.querySelector('.command-palette-item.active')?.scrollIntoView({ block: 'nearest' });
            updateCommandPaletteFade();
        }

        function handleCommandPaletteKeydown(e) {
            const list = document.getElementById('command-palette-list');
            const filtered = list?._filtered || [];
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                cpSelectedIndex = filtered.length ? Math.min(filtered.length - 1, cpSelectedIndex + 1) : 0;
                renderCommandPaletteList(document.getElementById('command-palette-input').value);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                cpSelectedIndex = Math.max(0, cpSelectedIndex - 1);
                renderCommandPaletteList(document.getElementById('command-palette-input').value);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const raw = document.getElementById('command-palette-input').value.trim().toLowerCase();
                if (cpMode === 'nav' && raw.startsWith('/')) {
                    const cmd = PALETTE_COMMANDS.find(c => c.cmd === raw.slice(1));
                    if (cmd) { closeCommandPalette(); runPaletteCommand(cmd.cmd); }
                    return;
                }
                if (filtered[cpSelectedIndex]) selectCommandPaletteItem(cpSelectedIndex);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeCommandPalette();
            }
        }

        // Tras crear la entrada, deja el cursor ya puesto en el primer
        // campo de texto para poder seguir sin usar el ratón.
        function focusFirstModalField() {
            requestAnimationFrame(() => {
                const field = document.querySelector('#modal-container input[type="text"], #modal-container input:not([type]), #modal-container textarea');
                field?.focus();
            });
        }

        function selectCommandPaletteItem(index) {
            const list = document.getElementById('command-palette-list');
            const item = list?._filtered?.[index];
            const prefillDate = window._dayPrefillDate;
            closeCommandPalette();
            if (!item) return;
            if (item.kind === 'create') {
                openNewEntry(item.type);
                if (prefillDate) {
                    document.querySelectorAll('#modal-container input[type="date"]').forEach(inp => { if (!inp.value) inp.value = prefillDate; });
                }
                focusFirstModalField();
            } else if (item.kind === 'entry' || item.kind === 'note' || item.kind === 'subject' || item.kind === 'document' || item.kind === 'link' || item.kind === 'friend') {
                followMention(item.kind, item.id);
            } else if (item.kind === 'trip-place' || item.kind === 'trip-itinerary' || item.kind === 'trip-list') {
                switchView('travels');
                openTripManager(item.tripId);
                setTripManagerTab(item.kind === 'trip-place' ? 'lugares' : item.kind === 'trip-itinerary' ? 'itinerario' : 'listas');
            } else if (item.kind === 'recommendation') {
                cultureTab = CULTURE_TYPE_TO_TAB[item.tipo] || 'books';
                cultureSharedMode = true;
                switchView('culture');
            } else if (item.kind === 'shared-trip') {
                switchView('travels');
            } else if (item.kind === 'fantasy') {
                openFantasy();
            } else if (item.kind === 'month-filter') {
                applyEntryMonthFilter(item.type, item.month, item.monthLabel);
            } else if (item.kind === 'day-nav') {
                goToCalendarDate(item.date);
            } else if (item.kind === 'nav-sub') {
                goToNavSubsection(item);
            } else {
                // Ir a "Home" desde el buscador siempre deja la vista en
                // Mes, aunque el calendario se hubiera quedado en Día/Semana.
                if (item.view === 'calendar') calViewMode = 'month';
                switchView(item.view);
            }
        }

        // Navega a la vista de un subapartado y, según el tipo, cambia de
        // pestaña interna, llama a una acción (abrir un modal) o hace scroll
        // hasta el bloque en cuestión con un resalte breve.
        function goToNavSubsection(item) {
            switchView(item.view);
            if (item.setter && typeof window[item.setter] === 'function') window[item.setter](item.value);
            if (item.action && typeof window[item.action] === 'function') {
                setTimeout(() => window[item.action](), 150);
                return;
            }
            if (item.anchor) {
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    const el = document.getElementById(item.anchor);
                    if (!el) return;
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    el.classList.add('nav-subsection-flash');
                    setTimeout(() => el.classList.remove('nav-subsection-flash'), 1400);
                }));
            }
        }

        function runPaletteCommand(cmd) {
            if (cmd === 'admin') toggleDeveloperMode();
        }

        function openLogoutConfirm() {
            if (document.getElementById('logout-confirm-overlay')) return;
            const overlay = document.createElement('div');
            overlay.id = 'logout-confirm-overlay';
            overlay.className = 'command-palette-overlay';
            overlay.onclick = (e) => { if (e.target === overlay) closeLogoutConfirm(); };
            overlay.innerHTML = `
                <div class="command-palette-box logout-confirm-box">
                    <div class="command-palette-prompt" style="margin-bottom:20px">¿Quieres cerrar tu <span class="cp-accent">sesión</span>?</div>
                    <div class="logout-confirm-actions">
                        <button class="btn-secondary" onclick="closeLogoutConfirm()">No</button>
                        <button class="btn-modal-primary" onclick="confirmLogout()">Sí</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            document.body.classList.add('cp-blur');
        }

        function closeLogoutConfirm() {
            const overlay = document.getElementById('logout-confirm-overlay');
            document.body.classList.remove('cp-blur');
            if (!overlay) return;
            overlay.style.animation = 'modalOverlayOut 0.18s ease both';
            setTimeout(() => overlay.remove(), 170);
        }

        async function confirmLogout() {
            closeLogoutConfirm();
            await handleLogout();
        }

        function closeCommandPalette() {
            const overlay = document.getElementById('command-palette-overlay');
            document.body.classList.remove('cp-blur');
            window._dayPrefillDate = null;
            if (!overlay) return;
            overlay.style.animation = 'modalOverlayOut 0.18s ease both';
            setTimeout(() => overlay.remove(), 170);
        }

        // ESC: cierra lo que haya abierto (buscador, modal, confirmación de
        // sesión); si no hay nada abierto, en las mismas condiciones que
        // ENTER/ESPACIO, pregunta si se quiere cerrar sesión.
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape') return;
            if (document.getElementById('logout-confirm-overlay')) { closeLogoutConfirm(); return; }
            if (document.getElementById('command-palette-overlay')) { closeCommandPalette(); return; }
            const modalContainer = document.getElementById('modal-container');
            if (modalContainer && modalContainer.innerHTML.trim() !== '') { closeModal(); return; }
            if (!canUseGlobalShortcut()) return;
            openLogoutConfirm();
        });

        // Condición compartida por los atajos globales: nada de esto debe
        // dispararse si hay un campo con foco, un modal o el buscador ya
        // abiertos, o si todavía estamos en la pantalla de login.
        function canUseGlobalShortcut() {
            const tag = document.activeElement?.tagName;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || document.activeElement?.isContentEditable) return false;
            if (document.getElementById('command-palette-overlay')) return false;
            if (document.getElementById('logout-confirm-overlay')) return false;
            if (document.querySelector('.centered-message-overlay')) return false;
            if (document.getElementById('modal-container')?.innerHTML.trim()) return false;
            if (document.getElementById('login-screen')?.style.display !== 'none') return false;
            return true;
        }

        // Con la confirmación de cierre de sesión abierta, ENTER equivale a
        // pulsar "Sí" — no debe abrir el buscador de navegación.
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Enter') return;
            if (!document.getElementById('logout-confirm-overlay')) return;
            e.preventDefault();
            confirmLogout();
        });

        // Igual que con la confirmación de cierre de sesión: con un mensaje
        // centrado abierto (p. ej. "Modo desarrollador activado"), ENTER/ESC
        // lo cierran en vez de colarse hasta el buscador de navegación.
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Enter' && e.key !== 'Escape') return;
            const overlay = document.querySelector('.centered-message-overlay');
            if (!overlay) return;
            e.preventDefault();
            closeCenteredMessage(overlay);
        });

        // ENTER abre "¿dónde quieres ir?"; ESPACIO abre la captura rápida
        // ("¿dónde quieres crear la entrada?") — mismas condiciones.
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                if (!canUseGlobalShortcut()) return;
                e.preventDefault();
                openCommandPalette('nav');
            } else if (e.key === ' ') {
                if (!canUseGlobalShortcut()) return;
                e.preventDefault();
                openCommandPalette('create');
            }
        });

        // CTRL + flecha arriba/abajo: salta al apartado inmediatamente
        // anterior/siguiente del menú, sin tener que usar el ratón.
        document.addEventListener('keydown', function(e) {
            if (!e.ctrlKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
            if (!canUseGlobalShortcut()) return;
            const flat = NAV_SECTIONS.flatMap(s => s.items);
            const idx = flat.findIndex(i => i.view === currentView);
            if (idx === -1) return;
            e.preventDefault();
            const nextIdx = e.key === 'ArrowDown' ? Math.min(flat.length - 1, idx + 1) : Math.max(0, idx - 1);
            switchView(flat[nextIdx].view);
        });

        // ENTER dentro de un campo de un modal da por completada la
        // entrada (equivale a pulsar el botón principal del modal).
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Enter' || e.shiftKey) return;
            const el = document.activeElement;
            if (!el || el.tagName !== 'INPUT') return;
            const sheet = el.closest('.modal-sheet');
            if (!sheet) return;
            const btn = sheet.querySelector('.btn-modal-primary');
            if (!btn) return;
            e.preventDefault();
            btn.click();
        });

        // ============================================================
        //  DEFAULT COLORS & CATEGORIES
        // ============================================================
        const DEFAULT_COLORS = [
            '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
            '#1abc9c', '#e67e22', '#e84393', '#00b894', '#6c5ce7',
            '#fd79a8', '#0984e3', '#fdcb6e', '#00cec9', '#a29bfe'
        ];

        function getDefaultCategories() {
            return [
                { id: 'cat_general', name: 'General', color: '#6b7280' },
                { id: 'cat_viaje', name: 'Viaje', color: '#e84393' },
                { id: 'cat_proyecto', name: 'Proyecto', color: '#00b894' },
                { id: 'cat_trabajo', name: 'Trabajo', color: '#e67e22' },
                { id: 'cat_libro', name: 'Libro', color: '#3498db' },
                { id: 'cat_pelicula', name: 'Película', color: '#f39c12' },
                { id: 'cat_serie', name: 'Serie', color: '#9b59b6' },
                { id: 'cat_videojuego', name: 'Videojuego', color: '#e74c3c' },
                { id: 'cat_evento', name: 'Evento', color: '#f9a8d4' },
                { id: 'cat_restaurante', name: 'Restaurante', color: '#f59e0b' },
                { id: 'cat_lugar', name: 'Lugar', color: '#14b8a6' },
                { id: 'cat_suscripcion', name: 'Suscripción', color: '#0984e3' },
                { id: 'cat_gasto_fijo', name: 'Gasto fijo', color: '#e17055' },
            ];
        }

        // ============================================================
        //  CÓDIGO DE AMIGO (conexión entre cuentas)
        // ============================================================
        let userFriendCode = null;
        // Nombre visible para amigos (independiente del nombre de cuenta / azul
        // bitácora), y recomendaciones de libros/pelis/series/videojuegos que te
        // han hecho tus amigos y aún no has revisado.
        let nombrePublico = null;
        let recomendaciones = [];
        let cultureSharedMode = false;
        // Solicitudes de amistad pendientes que te han enviado (para
        // aceptar/rechazar) y las que tú has enviado y siguen sin resolver.
        let solicitudesRecibidas = [];
        let solicitudesEnviadas = [];

        async function cargarCodigoAmigo() {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) { userFriendCode = null; return; }
                const { data, error } = await sb.from('codigos_amigo').select('codigo').eq('user_id', user.id).maybeSingle();
                if (error) { console.error('Error cargando el código de amigo:', error); return; }
                userFriendCode = data?.codigo || null;
            } catch (e) {
                console.error('Error cargando el código de amigo:', e);
            }
        }

        function generarCodigoAmigoAleatorio() {
            // Sin 0/O/1/I para evitar confusiones al leerlo o escribirlo a mano.
            const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            let codigo = '';
            for (let i = 0; i < 8; i++) codigo += alfabeto[Math.floor(Math.random() * alfabeto.length)];
            return codigo;
        }

        async function generarCodigoAmigo() {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) { showToast('Inicia sesión para generar tu código', true); return; }
            const btn = document.getElementById('friend-code-generate-btn');
            if (btn) { btn.disabled = true; btn.textContent = 'Generando...'; }
            try {
                let ultimoError = null;
                for (let intento = 0; intento < 3; intento++) {
                    const codigo = generarCodigoAmigoAleatorio();
                    const { error } = await sb.from('codigos_amigo').insert({ user_id: user.id, codigo });
                    if (!error) { userFriendCode = codigo; ultimoError = null; break; }
                    ultimoError = error;
                    if (error.code !== '23505') break; // solo reintenta si fue una colisión de código único
                }
                if (ultimoError) throw ultimoError;
                if (currentView === 'friends') document.getElementById('content').innerHTML = renderFriendsView();
                showToast('Código de amigo generado');
            } catch (e) {
                console.error('Error generando el código de amigo:', e);
                showToast('No se pudo generar el código' + (e?.message ? ': ' + e.message : ''), true);
                if (btn) { btn.disabled = false; btn.textContent = '🔗 Generar código de amigo'; }
            }
        }

        function copiarCodigoAmigo() {
            if (!userFriendCode) return;
            const hecho = () => showToast('Código copiado');
            if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(userFriendCode).then(hecho).catch(() => copiarTextoConFallback(userFriendCode, hecho));
            } else {
                copiarTextoConFallback(userFriendCode, hecho);
            }
        }

        function copiarTextoConFallback(texto, onDone) {
            const input = document.createElement('textarea');
            input.value = texto;
            input.style.position = 'fixed';
            input.style.opacity = '0';
            document.body.appendChild(input);
            input.select();
            try { document.execCommand('copy'); onDone(); } catch (e) { console.error(e); }
            input.remove();
        }

        // ------------------------------------------------------------
        //  AMIGOS: añadir por código y listar
        // ------------------------------------------------------------
        let amigos = [];

        async function cargarAmigos() {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) { amigos = []; return; }
                const { data, error } = await sb.from('amistades')
                    .select('friend_id, friend_nombre, creado_en')
                    .eq('user_id', user.id)
                    .order('creado_en', { ascending: false });
                if (error) { console.error('Error cargando amigos:', error); return; }
                amigos = data || [];

                // El nombre visible (independiente del nombre de cuenta) manda
                // sobre el snapshot guardado en su momento en "amistades", si
                // ese amigo ya se ha puesto uno.
                if (amigos.length) {
                    const ids = amigos.map(a => a.friend_id);
                    const { data: publicos } = await sb.from('perfiles_publicos')
                        .select('user_id, nombre_publico')
                        .in('user_id', ids);
                    const porId = Object.fromEntries((publicos || []).map(p => [p.user_id, p.nombre_publico]));
                    amigos.forEach(a => { a.nombre_visible = porId[a.friend_id] || a.friend_nombre || 'Amigo sin nombre'; });
                }
            } catch (e) {
                console.error('Error cargando amigos:', e);
            }
        }

        function friendAddInputKeydown(e) {
            if (e.key === 'Enter') { e.preventDefault(); anadirAmigoPorCodigo(); }
        }

        async function anadirAmigoPorCodigo() {
            const input = document.getElementById('friend-add-input');
            const codigo = input?.value?.trim().toUpperCase();
            if (!codigo) { showToast('Escribe el código de tu amigo', true); return; }
            const btn = document.getElementById('friend-add-btn');
            if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
            try {
                const { data, error } = await sb.rpc('enviar_solicitud_amistad_por_codigo', { p_codigo: codigo });
                if (error) throw error;
                if (input) input.value = '';
                if (data === 'aceptada_directa') {
                    await cargarAmigos();
                    showToast('¡Ya sois amigos! (esa persona ya te había enviado una solicitud)');
                } else {
                    showToast('Solicitud enviada, a la espera de que la acepte');
                }
                if (currentView === 'friends') document.getElementById('content').innerHTML = renderFriendsView();
            } catch (e) {
                console.error('Error enviando la solicitud de amistad:', e);
                const msg = e?.message || '';
                let texto;
                if (msg.includes('Código no encontrado')) texto = 'No existe ningún amigo con ese código';
                else if (msg.includes('a ti mismo')) texto = 'Ese es tu propio código';
                else if (msg.includes('Ya sois amigos')) texto = 'Ya sois amigos';
                else if (msg.includes('pendiente de que la acepte')) texto = 'Ya le enviaste una solicitud; está pendiente de que la acepte';
                else texto = 'No se pudo enviar la solicitud' + (msg ? ': ' + msg : '');
                showToast(texto, true);
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = '+ Añadir'; }
            }
        }

        async function eliminarAmigo(friendId, nombre) {
            if (!confirm(`¿Eliminar a ${nombre || 'este amigo'}? Dejaréis de estar conectados en Bitácora.`)) return;
            try {
                const { error } = await sb.rpc('eliminar_amigo', { p_friend_id: friendId });
                if (error) throw error;
                amigos = amigos.filter(a => a.friend_id !== friendId);
                if (currentView === 'friends') document.getElementById('content').innerHTML = renderFriendsView();
                showToast('Amigo eliminado');
            } catch (e) {
                console.error('Error eliminando amigo:', e);
                showToast('No se pudo eliminar', true);
            }
        }

        // ------------------------------------------------------------
        //  NOMBRE VISIBLE (independiente del nombre de cuenta)
        // ------------------------------------------------------------
        async function cargarNombrePublico() {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) { nombrePublico = null; return; }
                const { data, error } = await sb.from('perfiles_publicos')
                    .select('nombre_publico').eq('user_id', user.id).maybeSingle();
                if (error) { console.error('Error cargando el nombre visible:', error); return; }
                nombrePublico = data?.nombre_publico || null;
            } catch (e) {
                console.error('Error cargando el nombre visible:', e);
            }
        }

        async function guardarNombrePublico() {
            const input = document.getElementById('nombre-publico-input');
            const nuevo = input?.value?.trim();
            if (!nuevo) { showToast('Escribe un nombre', true); return; }
            const { data: { user } } = await sb.auth.getUser();
            if (!user) return;
            const btn = document.getElementById('nombre-publico-btn');
            if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
            try {
                const { error } = await sb.from('perfiles_publicos')
                    .upsert({ user_id: user.id, nombre_publico: nuevo, actualizado_en: new Date().toISOString() }, { onConflict: 'user_id' });
                if (error) {
                    if (error.code === '23505') { showToast('Ese nombre ya lo tiene otra persona, prueba otro', true); return; }
                    throw error;
                }
                nombrePublico = nuevo;
                document.getElementById('content').innerHTML = renderFriendsView();
                showToast('Nombre visible actualizado');
            } catch (e) {
                console.error('Error guardando el nombre visible:', e);
                showToast('No se pudo guardar el nombre', true);
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
            }
        }

        // ------------------------------------------------------------
        //  VISTA "AMIGOS"
        // ------------------------------------------------------------
        async function loadFriendsViewData() {
            await Promise.all([cargarCodigoAmigo(), cargarAmigos(), cargarNombrePublico(), cargarSolicitudesAmistad()]);
            if (currentView === 'friends') document.getElementById('content').innerHTML = renderFriendsView();
        }

        async function cargarSolicitudesAmistad() {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) { solicitudesRecibidas = []; solicitudesEnviadas = []; return; }
                const { data, error } = await sb.from('solicitudes_amistad')
                    .select('id, remitente_id, destinatario_id, estado, creado_en')
                    .eq('estado', 'pendiente')
                    .or(`remitente_id.eq.${user.id},destinatario_id.eq.${user.id}`)
                    .order('creado_en', { ascending: false });
                if (error) { console.error('Error cargando solicitudes de amistad:', error); return; }
                const todas = data || [];
                const recibidas = todas.filter(s => s.destinatario_id === user.id);
                const enviadas = todas.filter(s => s.remitente_id === user.id);

                const ids = [...new Set([...recibidas.map(s => s.remitente_id), ...enviadas.map(s => s.destinatario_id)])];
                let porId = {};
                if (ids.length) {
                    const { data: publicos } = await sb.from('perfiles_publicos').select('user_id, nombre_publico').in('user_id', ids);
                    porId = Object.fromEntries((publicos || []).map(p => [p.user_id, p.nombre_publico]));
                }
                recibidas.forEach(s => { s.nombre = porId[s.remitente_id] || 'Alguien'; });
                enviadas.forEach(s => { s.nombre = porId[s.destinatario_id] || 'Alguien'; });
                solicitudesRecibidas = recibidas;
                solicitudesEnviadas = enviadas;
            } catch (e) {
                console.error('Error cargando solicitudes de amistad:', e);
            }
        }

        async function responderSolicitudAmistad(id, aceptar) {
            try {
                const { error } = await sb.rpc('responder_solicitud_amistad', { p_solicitud_id: id, p_aceptar: aceptar });
                if (error) throw error;
                await Promise.all([cargarSolicitudesAmistad(), cargarAmigos()]);
                if (currentView === 'friends') document.getElementById('content').innerHTML = renderFriendsView();
                if (typeof updateNotifBadge === 'function') updateNotifBadge();
                showToast(aceptar ? 'Amigo añadido' : 'Solicitud rechazada');
            } catch (e) {
                console.error('Error respondiendo a la solicitud de amistad:', e);
                showToast('No se pudo procesar la solicitud' + (e?.message ? ': ' + e.message : ''), true);
            }
        }

        function renderFriendsView() {
            return `
                <div class="settings-layout">
                <div class="settings-col-main">
                    <div class="chart-container" style="margin-bottom:16px">
                        <div class="chart-title">Tu nombre visible</div>
                        <div style="font-size:11px;color:var(--text-secondary);margin:8px 0 14px">Es el nombre con el que te ven tus amigos dentro de Bitácora. No tiene por qué coincidir con el nombre de tu cuenta, y no puede repetirse con el de otra persona.</div>
                        <div class="friend-add-row">
                            <input type="text" id="nombre-publico-input" class="modal-input" style="margin:0;text-transform:none;letter-spacing:normal;font-family:'Poppins',sans-serif" placeholder="Tu nombre visible" value="${escapeHtml(nombrePublico || '')}">
                            <button class="btn-secondary" id="nombre-publico-btn" style="width:auto" onclick="guardarNombrePublico()">Guardar</button>
                        </div>
                    </div>

                    ${solicitudesRecibidas.length ? `
                    <div class="chart-container" style="margin-bottom:16px">
                        <div class="chart-title">Solicitudes recibidas (${solicitudesRecibidas.length})</div>
                        <div class="friend-list" style="margin-top:10px">
                            ${solicitudesRecibidas.map(s => `
                                <div class="friend-list-item">
                                    <span class="friend-list-name">${escapeHtml(s.nombre)}</span>
                                    <span style="display:flex;gap:6px">
                                        <button class="btn-secondary" style="padding:4px 12px;font-size:11px" onclick="responderSolicitudAmistad('${s.id}', true)">Aceptar</button>
                                        <button class="friend-remove-btn" title="Rechazar" onclick="responderSolicitudAmistad('${s.id}', false)">✕</button>
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    <div class="chart-container">
                        <div class="chart-title">Mis amigos</div>
                        <div style="font-size:11px;color:var(--text-secondary);margin-top:8px">Introduce el código que te ha compartido tu amigo. Le llegará como solicitud y tendrá que aceptarla.</div>
                        <div class="friend-add-row">
                            <input type="text" id="friend-add-input" class="friend-add-input" placeholder="Código de amigo" maxlength="8" onkeydown="friendAddInputKeydown(event)">
                            <button class="btn-secondary" id="friend-add-btn" style="width:auto" onclick="anadirAmigoPorCodigo()">+ Añadir</button>
                        </div>
                        ${solicitudesEnviadas.length ? `<div style="font-size:11px;color:var(--text-secondary);margin:10px 0 4px">Solicitudes enviadas, pendientes de respuesta:</div>
                        <div class="friend-list" style="margin-bottom:10px">
                            ${solicitudesEnviadas.map(s => `<div class="friend-list-item"><span class="friend-list-name" style="font-weight:600;color:var(--text-secondary)">${escapeHtml(s.nombre)}</span><span style="font-size:11px;color:var(--text-secondary)">Pendiente</span></div>`).join('')}
                        </div>` : ''}
                        <div class="friend-list">
                            ${amigos.length ? amigos.map(a => `
                                <div class="friend-list-item">
                                    <span class="friend-list-name">${escapeHtml(a.nombre_visible || a.friend_nombre || 'Amigo sin nombre')}</span>
                                    <button class="friend-remove-btn" title="Eliminar amigo" onclick="eliminarAmigo('${a.friend_id}', '${escapeHtml(a.nombre_visible || a.friend_nombre || '')}')">✕</button>
                                </div>
                            `).join('') : '<div style="font-size:12px;color:var(--text-secondary);padding:8px 0">Aún no tienes amigos añadidos.</div>'}
                        </div>
                    </div>
                </div>

                <div class="settings-col-side">
                    <div class="chart-container">
                        <div class="chart-title">Tu código de amigo</div>
                        <div style="font-size:11px;color:var(--text-secondary);margin:8px 0 14px">Genera tu código de amigo permanente y compártelo para conectar tu cuenta con la de otra persona.</div>
                        ${userFriendCode ? `
                            <div class="friend-code-box">
                                <span class="friend-code-value">${userFriendCode}</span>
                                <button class="friend-code-copy-btn" onclick="copiarCodigoAmigo()" title="Copiar código">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2.5"/><path d="M5 15H3.5A1.5 1.5 0 0 1 2 13.5v-10A1.5 1.5 0 0 1 3.5 2h10A1.5 1.5 0 0 1 15 3.5V5"/></svg>
                                </button>
                            </div>
                        ` : `
                            <button class="btn-secondary" id="friend-code-generate-btn" style="width:auto" onclick="generarCodigoAmigo()">🔗 Generar código de amigo</button>
                        `}
                    </div>

                    <div class="chart-container" style="margin-top:16px">
                        <div class="chart-title">Recomendaciones</div>
                        <div style="font-size:11px;color:var(--text-secondary);margin-top:8px">Comparte libros, pelis, series y videojuegos con tus amigos desde la ficha de cada uno en Ocio, y revisa lo que te recomiendan a ti con el botón "Recomendaciones" de cada apartado.</div>
                    </div>
                </div>
                </div>`;
        }

        // ============================================================
        //  LOAD / SAVE (SUPABASE)
        // ============================================================
        async function loadData() {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) {
                    entries = [];
                    categories = getDefaultCategories();
                    notes = [];
                    prompts = [];
                    userName = '';
                    filteredEntries = [];
                    investmentData = { initial: 0, rate: 7, monthly: 0 };
                    return true;
                }
                const { data, error } = await sb.from('bitacora').select('data').eq('user_id', user.id).maybeSingle();
                if (error) throw error;
                const saved = (data && data.data) ? data.data : {};
                entries = saved.entries || [];
                normalizeWorkCotizationData();
                categories = saved.categories || getDefaultCategories();
                // El rosa por defecto de "Evento" era demasiado chillón; a
                // quien ya tuviera la categoría creada con el tono antiguo
                // se le actualiza sola al pastel nuevo, una única vez.
                const eventCat = categories.find(c => c.id === 'cat_evento');
                if (eventCat && eventCat.color === '#ec4899') eventCat.color = '#f9a8d4';
                notes = saved.notes || [];
                prompts = saved.prompts || [];
                userName = saved.userName || '';
                investmentData = saved.investmentData || { initial: 0, rate: 7, monthly: 0 };
                migrateInvestmentData();
                inbox = saved.inbox || [];
                financeIncome = saved.financeIncome || { current: 0, next: 0 };
                financeProfile = saved.financeProfile || {
                    cash: 0, cashTarget: 0, invested: 0, investedTarget: 0,
                    emergency: 0, emergencyTarget: 0, vacation: 0, vacationTarget: 0,
                    salaryForecast: {}, history: []
                };
                financeProfile.salaryForecast = financeProfile.salaryForecast || {};
                financeProfile.history = Array.isArray(financeProfile.history) ? financeProfile.history : [];
                financeProfile.oneOffIncome = Array.isArray(financeProfile.oneOffIncome) ? financeProfile.oneOffIncome : [];
                financeProfile.movements = Array.isArray(financeProfile.movements) ? financeProfile.movements : [];
                // Migración: los antiguos "ingresos puntuales" pasan a formar parte
                // del registro unificado de movimientos (una sola vez).
                if (financeProfile.oneOffIncome.length && !financeProfile._oneOffMigrated) {
                    financeProfile.movements = [
                        ...financeProfile.oneOffIncome.map(x => ({
                            id: x.id || ('income_' + Date.now() + Math.random().toString(36).slice(2, 6)),
                            type: 'income', label: x.label, amount: Number(x.amount) || 0,
                            date: x.date, addedToCash: !!x.addedToCash
                        })),
                        ...financeProfile.movements
                    ];
                    financeProfile._oneOffMigrated = true;
                }
                // Si aún no existe una cifra manual para inversiones, tomamos como
                // punto de partida el valor real de la cartera ya registrada.
                if (!(Number(financeProfile.invested) > 0) && typeof portfolioCurrentValue === 'function') {
                    financeProfile.invested = portfolioCurrentValue();
                }
                plannedTrips = saved.plannedTrips || [];
                // Migración única: el antiguo "Organizador de Viajes" (viajes
                // planeados aparte, con una sola checklist) se retira — cada uno
                // pasa a ser un viaje normal con su propio Gestor de viajes, y su
                // checklist se conserva como una lista llamada "Preparativos".
                if (plannedTrips.length) {
                    plannedTrips.forEach(pt => {
                        // Por si la migración se repitiera antes de que el borrado de
                        // plannedTrips llegara a guardarse (recarga rápida): no duplicar.
                        if (pt.id && entries.some(e => e.id === pt.id)) return;
                        entries.push({
                            id: pt.id || ('entry_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
                            type: 'travel',
                            title: pt.title || 'Viaje',
                            destination: pt.destination || '',
                            startDate: pt.startDate || '',
                            endDate: pt.endDate || '',
                            companions: '',
                            notes: '',
                            expenses: [],
                            places: [],
                            itinerario: [],
                            listas: (pt.checklist && pt.checklist.length) ? [{
                                id: 'lista_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                                nombre: 'Preparativos',
                                items: pt.checklist.map(c => ({ id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), texto: c.text, hecho: !!c.done }))
                            }] : [],
                            createdAt: pt.createdAt || new Date().toISOString()
                        });
                    });
                    plannedTrips = [];
                    filteredEntries = [...entries];
                    // Se guarda de inmediato para que el borrado de plannedTrips
                    // quede en la nube y la migración no se repita en la próxima
                    // carga (si no, cada recarga duplicaría los viajes migrados).
                    if (typeof saveData === 'function') saveData().catch(e => console.error('Error guardando tras migrar viajes planeados:', e));
                }
                apuntes = saved.apuntes || [];
                weeklyTasks = Array.isArray(saved.weeklyTasks) ? saved.weeklyTasks : [];
                collectibleCategories = Array.isArray(saved.collectibleCategories) && saved.collectibleCategories.length
                    ? saved.collectibleCategories
                    : [{ id: 'cat_cartas', name: 'Cartas' }, { id: 'cat_videojuegos', name: 'Videojuegos' }];
                collectibles = Array.isArray(saved.collectibles) ? saved.collectibles : [];
                dayPlanner = (saved.dayPlanner && typeof saved.dayPlanner === 'object') ? saved.dayPlanner : { dayKey: '', items: [] };
                dayPlanner.items = Array.isArray(dayPlanner.items) ? dayPlanner.items : [];
                financeProfile.chartHistory = Array.isArray(financeProfile.chartHistory) ? financeProfile.chartHistory : [];
                financeProfile.forecastProfile = financeProfile.forecastProfile || { salary: 0, contractMonths: 0, emergencyMonthlyPlan: 0, vacationMonthlyPlan: 0, investMonthlyPlan: 0 };
                blurFinances = !!saved.blurFinances;
                studies = (saved.studies && typeof saved.studies === 'object') ? saved.studies : { subjects: [], schedule: { lun: [], mar: [], mie: [], jue: [], vie: [], sab: [], dom: [] }, notes: '' };
                studies.subjects = Array.isArray(studies.subjects) ? studies.subjects : [];
                studies.schedule = studies.schedule && typeof studies.schedule === 'object' ? studies.schedule : {};
                STUDIES_DAYS.forEach(d => { studies.schedule[d.key] = Array.isArray(studies.schedule[d.key]) ? studies.schedule[d.key] : []; });
                studies.quickNotes = Array.isArray(studies.quickNotes) ? studies.quickNotes : [];
                if (typeof studies.notes === 'string' && studies.notes.trim() && !studies.quickNotes.length) {
                    studies.quickNotes.push({ id: 'qn_migrated_' + Date.now(), text: studies.notes.trim(), createdAt: new Date().toISOString() });
                }
                delete studies.notes;
                links = Array.isArray(saved.links) ? saved.links : [];
                linkCategories = Array.isArray(saved.linkCategories) ? saved.linkCategories : [];
                resetDayPlannerIfNeeded();
                if (saved.fantasyData) {
                    fantasyData = saved.fantasyData;
                    if (!fantasyData.jornadas) fantasyData.jornadas = [];
                    if (!fantasyData.valorHistorico) fantasyData.valorHistorico = [];
                    hydrateFantasyHiddenUsers();
                    fantasyDataFromCloud = true;
                } else {
                    fantasyDataFromCloud = false;
                }
            } catch (e) {
                console.error('Error cargando datos de Supabase:', e);
                return false;
            }
            if (!categories || categories.length === 0) categories = getDefaultCategories();
            categories.forEach(c => { if (!c.id) c.id = 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2,
                    6); });
            filteredEntries = [...entries];
            updatePageTitle();
            return true;
        }

        // Apuntes se edita en una página independiente. Para evitar que una
        // Bitácora abierta con datos antiguos sobrescriba los apuntes recién
        // guardados, solo usamos la copia local de "apuntes" cuando procede
        // de una importación explícita. En el resto de guardados conservamos
        // siempre la versión más reciente que haya en Supabase.
        let apuntesDirty = false;
        let saveChain = Promise.resolve();

        function saveData() {
            const attempt = saveChain.then(doSaveData, doSaveData);
            saveChain = attempt.catch(() => {});
            return attempt;
        }

        // Clave de semana ISO (año-Wsemana), usada para no disparar el
        // snapshot más de una vez por semana.
        function isoWeekKey(d = new Date()) {
            const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
            const dayNum = date.getUTCDay() || 7;
            date.setUTCDate(date.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
            const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
            return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
        }

        async function doSaveData() {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) throw new Error('No hay sesión activa');

            // Leer la versión más reciente antes de escribir. Esto evita que
            // una pestaña antigua de Bitácora borre cambios hechos desde
            // /apuntes/.
            const { data: latestRow, error: readError } = await sb
                .from('bitacora')
                .select('data')
                .eq('user_id', user.id)
                .maybeSingle();

            if (readError) throw readError;

            const latestData = (latestRow && latestRow.data) ? latestRow.data : {};
            const latestApuntes = Array.isArray(latestData.apuntes) ? latestData.apuntes : [];
            const currentWeek = isoWeekKey();
            const lastSnapshotWeek = latestData._meta?.lastSnapshotWeek || '';
            const needsSnapshot = lastSnapshotWeek !== currentWeek;

            const mergedData = {
                ...latestData,
                entries,
                categories,
                userName,
                investmentData,
                notes,
                prompts,
                inbox,
                financeIncome,
                financeProfile,
                plannedTrips,
                weeklyTasks,
                collectibleCategories,
                collectibles,
                dayPlanner,
                studies,
                links,
                linkCategories,
                blurFinances,
                fantasyData,
                // Solo sustituir los apuntes remotos cuando el usuario ha
                // importado deliberadamente un archivo que los contiene.
                apuntes: apuntesDirty ? apuntes : latestApuntes,
                _meta: { ...(latestData._meta || {}), lastSnapshotWeek: needsSnapshot ? currentWeek : lastSnapshotWeek }
            };

            // En vez de reescribir siempre el bloque de datos entero, se
            // envía solo lo que de verdad cambió desde la lectura de arriba
            // (comparando clave a clave de primer nivel). Una función de
            // Supabase hace el merge en el servidor. Si esa función todavía
            // no existe (o falla por cualquier otro motivo), se cae al
            // guardado completo de siempre — nunca se pierde un guardado
            // por este cambio, en el peor caso solo no se ahorra nada.
            const patch = {};
            Object.keys(mergedData).forEach(key => {
                if (JSON.stringify(mergedData[key]) !== JSON.stringify(latestData[key])) {
                    patch[key] = mergedData[key];
                }
            });

            if (Object.keys(patch).length > 0) {
                const { error: patchError } = await sb.rpc('merge_bitacora_data', { p_patch: patch });
                if (patchError) {
                    const { error: fallbackError } = await sb.from('bitacora').upsert({
                        user_id: user.id,
                        data: mergedData,
                        updated_at: new Date().toISOString()
                    });
                    if (fallbackError) throw fallbackError;
                }
            }

            // Mantener la memoria local sincronizada con lo que realmente
            // quedó almacenado.
            if (!apuntesDirty) apuntes = latestApuntes;
            apuntesDirty = false;

            // Snapshot semanal de seguridad: como mucho una escritura extra
            // por semana (no en cada guardado), y solo se conservan las
            // últimas 12. Si la tabla bitacora_snapshots no existe todavía
            // en Supabase, esto falla en silencio sin romper el guardado
            // normal — ver nota de configuración.
            if (needsSnapshot) {
                try {
                    await sb.from('bitacora_snapshots').insert({ user_id: user.id, week_key: currentWeek, data: mergedData });
                    const { data: oldSnapshots } = await sb.from('bitacora_snapshots')
                        .select('id').eq('user_id', user.id).order('created_at', { ascending: false });
                    if (Array.isArray(oldSnapshots) && oldSnapshots.length > 12) {
                        const idsToDelete = oldSnapshots.slice(12).map(r => r.id);
                        await sb.from('bitacora_snapshots').delete().in('id', idsToDelete);
                    }
                } catch (snapErr) {
                    console.error('No se pudo guardar el snapshot semanal:', snapErr);
                }
            }
        }

        // Normaliza registros laborales antiguos para que el nuevo sistema
        // de estimación/corrección sea compatible con los datos existentes.
        function normalizeWorkCotizationData() {
            entries.forEach(entry => {
                if (entry.type !== 'work') return;
                if (entry.cotizationType !== 'practicas' && entry.cotizationType !== 'general') {
                    entry.cotizationType = 'general';
                }
                if (entry.cotizedDays !== null && entry.cotizedDays !== undefined && entry.cotizedDays !== '') {
                    const n = Number(entry.cotizedDays);
                    entry.cotizedDays = Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
                } else {
                    entry.cotizedDays = null;
                }
            });
        }

        // ============================================================
        //  USER NAME
        // ============================================================
        function updatePageTitle() {
            const titleEl = document.getElementById('page-title');
            const hasName = userName && userName.trim();
            const nameDisplay = hasName ? escapeHtml(userName.trim()) : 'tu nombre';
            const nameLink = `<a href="javascript:void(0)" class="username-link" onclick="editUserName()">${nameDisplay}</a><span class="title-period">.</span>`;
            if (currentView === 'calendar') {
                const greeting = greetingText().replace(/\.$/, '');
                titleEl.innerHTML = `INICIO - ${greeting} ${nameLink}`;
            } else {
                const baseTitle = VIEW_LABELS[currentView] || 'INICIO';
                titleEl.innerHTML = `${baseTitle} de ${nameLink}`;
            }
            updateAddButton();
        }

        async function editUserName() {
            const name = prompt('¿Cómo quieres que aparezca tu nombre?', userName || '');
            if (name !== null) {
                userName = name.trim();
                updatePageTitle();
                try {
                    await saveData();
                    showToast('Nombre guardado');
                } catch (err) {
                    console.error('Error guardando el nombre en Supabase:', err);
                    showToast('No se pudo guardar en la nube. Revisa tu conexión.', true);
                }
            }
        }

        // ============================================================
        //  ADD BUTTON
        // ============================================================
        function updateAddButton() {
            const btn = document.getElementById('add-section-btn');
            if (!btn) return;
            let type = VIEW_TO_ENTRY_TYPE[currentView];
            if (currentView === 'culture') {
                type = ({ books: 'book', series: 'series', movies: 'movie', games: 'game' })[cultureTab] || 'book';
            } else if (currentView === 'travels') {
                type = travelPlacesTab === 'places' ? 'place' : 'travel';
            }
            if (type) {
                btn.style.display = 'flex';
                btn.onclick = () => openNewEntry(type);
            } else {
                btn.style.display = 'none';
            }
        }

        function openSectionAdd() {
            const type = VIEW_TO_ENTRY_TYPE[currentView];
            if (type) openNewEntry(type);
        }

        // ============================================================
        //  THEME
        // ============================================================
        const THEMES = ['dark', 'light', 'beige'];

        function loadTheme() {
            const theme = localStorage.getItem('bitacora_theme') || 'dark';
            THEMES.forEach(t => document.body.classList.remove(t));
            if (theme !== 'dark') document.body.classList.add(theme);
        }

        function toggleTheme() {
            const current = THEMES.find(t => document.body.classList.contains(t)) || 'dark';
            const idx = (THEMES.indexOf(current) + 1) % THEMES.length;
            const next = THEMES[idx];
            THEMES.forEach(t => document.body.classList.remove(t));
            if (next !== 'dark') document.body.classList.add(next);
            localStorage.setItem('bitacora_theme', next);
            showToast('Tema cambiado a ' + next);
        }

        let modeWide = false;

        function toggleMode() {
            modeWide = !modeWide;
            document.getElementById('app').style.maxWidth = modeWide ? '100%' : '1200px';
        }

        // ============================================================
        //  TOAST
        // ============================================================
        function showToast(msg, isError = false) {
            const t = document.getElementById('toast');
            t.textContent = msg;
            t.className = isError ? 'error' : '';
            t.classList.add('show');
            clearTimeout(t._timer);
            t._timer = setTimeout(() => t.classList.remove('show'), 2500);
        }

        // Mensaje destacado en el centro de la pantalla, para avisos que
        // merecen más presencia que un toast (p. ej. activar el modo
        // desarrollador). Mismo estilo que el resto de overlays de la app.
        function showCenteredMessage(text) {
            const overlay = document.createElement('div');
            overlay.className = 'centered-message-overlay';
            overlay.onclick = (e) => { if (e.target === overlay) closeCenteredMessage(overlay); };
            overlay.innerHTML = `
                <div class="centered-message-box">
                    <div class="centered-message-text">${escapeHtml(text)}</div>
                    <button class="btn-modal-primary" onclick="closeCenteredMessage(this.closest('.centered-message-overlay'))">Entendido</button>
                </div>`;
            document.body.appendChild(overlay);
            setTimeout(() => closeCenteredMessage(overlay), 2600);
        }

        function closeCenteredMessage(overlay) {
            if (!overlay || !document.body.contains(overlay)) return;
            overlay.style.animation = 'modalOverlayOut 0.18s ease both';
            setTimeout(() => overlay.remove(), 170);
        }

        function countWorkingDays(startDate, endDate) {
            // Los días cotizados incluyen sábados y domingos.
            // La ocultación de "Trabajando en..." en fin de semana es
            // únicamente una regla visual del detalle del calendario.
            // Cálculo por diferencia de fechas (no día a día): con un rango
            // muy grande o una fecha mal escrita, el bucle anterior podía
            // iterar miles de veces y notarse como un cuelgue momentáneo.
            if (!startDate || !endDate) return 0;
            const current = new Date(startDate + 'T12:00:00');
            const end = new Date(endDate + 'T12:00:00');
            if (isNaN(current.getTime()) || isNaN(end.getTime()) || end < current) return 0;
            return Math.round((end - current) / 86400000) + 1;
        }

        // ============================================================
        //  NAVIGATION
        // ============================================================
        let currentView = 'calendar';

        // Abre Apuntes como una ventana flotante dentro de Bitácora.
        // IMPORTANTE: el contenido NO se duplica aquí: se carga directamente
        // desde /apuntes/index.html, por lo que sigue siendo un proyecto independiente.
        let apuntesFloatingWindow = null;

        function openApuntes() {
            if (apuntesFloatingWindow) {
                apuntesFloatingWindow.classList.remove('apuntes-window-minimized');
                apuntesFloatingWindow.style.display = 'flex';
                bringApuntesToFront();
                return;
            }

            const layer = document.createElement('div');
            layer.className = 'apuntes-window-layer';
            layer.innerHTML = `
                <div class="apuntes-window" id="apuntes-floating-window">
                    <div class="apuntes-window-bar" id="apuntes-window-bar">
                        <div class="apuntes-window-title">Apuntes</div>
                        <div class="apuntes-window-actions">
                            <button class="apuntes-window-action" type="button" title="Minimizar" onclick="minimizeApuntes()">−</button>
                            <button class="apuntes-window-action" type="button" title="Maximizar" onclick="maximizeApuntes()">□</button>
                            <button class="apuntes-window-action" type="button" title="Cerrar" onclick="closeApuntes()">×</button>
                        </div>
                    </div>
                    <iframe class="apuntes-window-frame" src="/apuntes/index.html" title="Apuntes"></iframe>
                </div>`;

            document.body.appendChild(layer);
            apuntesFloatingWindow = layer.querySelector('#apuntes-floating-window');
            bringApuntesToFront();
            makeApuntesDraggable(apuntesFloatingWindow, layer.querySelector('#apuntes-window-bar'));

            // Si se pulsa fuera de la ventana, no la cerramos: se comporta como
            // una ventana de escritorio y permanece disponible hasta que el usuario la cierre.
            layer.addEventListener('mousedown', () => bringApuntesToFront());
        }

        function bringApuntesToFront() {
            if (!apuntesFloatingWindow) return;
            apuntesFloatingWindow.style.zIndex = String(Date.now());
        }

        function minimizeApuntes() {
            if (!apuntesFloatingWindow) return;
            apuntesFloatingWindow.classList.toggle('apuntes-window-minimized');
        }

        function maximizeApuntes() {
            if (!apuntesFloatingWindow) return;
            apuntesFloatingWindow.classList.toggle('maximized');
        }

        function closeApuntes() {
            if (!apuntesFloatingWindow) return;
            const layer = apuntesFloatingWindow.parentElement;
            layer?.remove();
            apuntesFloatingWindow = null;
        }

        function makeApuntesDraggable(win, bar) {
            let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
            bar.addEventListener('mousedown', (e) => {
                if (e.target.closest('button')) return;
                if (win.classList.contains('maximized')) return;
                dragging = true;
                const rect = win.getBoundingClientRect();
                startX = e.clientX; startY = e.clientY; startLeft = rect.left; startTop = rect.top;
                win.style.left = rect.left + 'px'; win.style.top = rect.top + 'px'; win.style.transform = 'none';
                e.preventDefault();
            });
            window.addEventListener('mousemove', (e) => {
                if (!dragging) return;
                win.style.left = Math.max(0, startLeft + e.clientX - startX) + 'px';
                win.style.top = Math.max(0, startTop + e.clientY - startY) + 'px';
            });
            window.addEventListener('mouseup', () => { dragging = false; });
        }

        function updateHeaderClock() {
            const el=document.getElementById('header-clock');
            if(el) el.textContent=new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
        }

        // Barra casi imperceptible en la sidebar: progreso del día transcurrido (0:00-23:59).
        function updateSidebarProgress() {
            const fill = document.getElementById('sidebar-progress-fill');
            const pctEl = document.getElementById('sidebar-progress-pct');
            if (fill && pctEl) {
                const now = new Date();
                const secondsElapsed = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
                const pct = Math.min(100, Math.max(0, (secondsElapsed / 86400) * 100));
                fill.style.width = pct.toFixed(1) + '%';
                pctEl.textContent = Math.round(pct) + '%';
            }

            // Comprueba si el planificador debe reiniciarse (cruce de las 4:00 am).
            if (typeof dayPlanner !== 'undefined' && dayPlanner) {
                const key = currentPlannerDayKey();
                if (dayPlanner.dayKey !== key) {
                    resetDayPlannerIfNeeded();
                    if (currentView === 'planner') render();
                }
            }
        }

        // Vuelve a disparar la animación de entrada del contenido al
        // cambiar de apartado (el nodo #content persiste entre renders,
        // así que hay que forzar un reflow para reiniciar la animación).
        function animateContentSwitch() {
            const el = document.getElementById('content');
            if (!el) return;
            el.classList.remove('view-fade-in');
            void el.offsetWidth;
            el.classList.add('view-fade-in');
        }

        function switchView(view) {
            try {
                currentView = view;

                document.querySelectorAll('.sidebar-nav button, #mobile-menu-panel .menu-nav button').forEach(b => {
                    b.classList.toggle('active', b.dataset.view === view);
                });

                updatePageTitle();
                render();
                animateContentSwitch();

                const mobilePanel = document.getElementById('mobile-menu-panel');
                if (mobilePanel && mobilePanel.classList.contains('open')) {
                    toggleMobileMenu();
                }
            } catch (error) {
                console.error('Error cambiando de sección:', error);
                showToast('No se pudo abrir esta sección. Revisa la consola.', true);
            }
        }

        // ============================================================
        //  MOBILE MENU
        // ============================================================
        function toggleMobileMenu() {
            const overlay = document.getElementById('mobile-menu-overlay');
            const panel = document.getElementById('mobile-menu-panel');
            overlay.classList.toggle('open');
            panel.classList.toggle('open');
        }

        async function deleteInboxItem(id) {
            inbox = inbox.filter(i => i.id !== id);
            if (currentView === 'home') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }


        // ============================================================
        //  TAREAS SEMANALES
        // ============================================================
        function getWeeklyTasksWeekKey(date = new Date()) {
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);
            const day = d.getDay() || 7;
            d.setDate(d.getDate() - day + 1);
            return d.toISOString().slice(0, 10);
        }

        function formatWeeklyTasksWeek() {
            const start = new Date(getWeeklyTasksWeekKey() + 'T12:00:00');
            const end = new Date(start);
            end.setDate(end.getDate() + 6);
            const fmt = d => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
            return `${fmt(start)} – ${fmt(end)}`;
        }

        function getCurrentWeeklyTasks() {
            const weekKey = getWeeklyTasksWeekKey();
            return (Array.isArray(weeklyTasks) ? weeklyTasks : []).filter(t => t && t.weekKey === weekKey && !t.completed);
        }

        function renderWeeklyTasksPanel() {
            const panel = document.getElementById('weekly-tasks-panel');
            if (!panel) return;
            const tasks = getCurrentWeeklyTasks();

            panel.innerHTML = `
                <div class="weekly-tasks-head">
                    <div>
                        <div class="weekly-tasks-title">Tareas semanales</div>
                        <div class="weekly-tasks-week">${formatWeeklyTasksWeek()}</div>
                    </div>
                    <button class="weekly-tasks-add" type="button" onclick="openWeeklyTaskModal()">+ Tarea</button>
                </div>
                <div class="weekly-tasks-list">
                    ${tasks.length ? tasks.map(t => `
                        <label class="weekly-task-row">
                            <input class="weekly-task-check" type="checkbox" onchange="completeWeeklyTask('${String(t.id).replace(/'/g, "\\'")}')" aria-label="Marcar como hecha">
                            <span class="weekly-task-text">${escapeHtml(t.title)}</span>
                        </label>
                    `).join('') : `
                        <div class="weekly-tasks-empty">
                            No tienes tareas pendientes esta semana.<br>
                            Pulsa <strong>+ Tarea</strong> para añadir una.
                        </div>
                    `}
                </div>`;
        }

        function toggleWeeklyTasks(force) {
            const panel = document.getElementById('weekly-tasks-panel');
            if (!panel) return;
            const shouldOpen = typeof force === 'boolean' ? force : !panel.classList.contains('open');
            panel.classList.toggle('open', shouldOpen);
            panel.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
            if (shouldOpen) renderWeeklyTasksPanel();
        }

        function openWeeklyTaskModal() {
            showModal(`
                <div class="modal-title">+ Tarea semanal</div>
                <div class="modal-label">¿Qué tienes que hacer?</div>
                <input id="weekly-task-input" class="modal-input" maxlength="140" placeholder="Ej: Comprar comida para la semana">
                <button class="btn-modal-primary" onclick="saveWeeklyTask()">Añadir tarea</button>
            `);
            setTimeout(() => document.getElementById('weekly-task-input')?.focus(), 50);
        }

        async function saveWeeklyTask() {
            const input = document.getElementById('weekly-task-input');
            const title = input?.value.trim();
            if (!title) {
                showToast('Escribe una tarea', true);
                input?.focus();
                return;
            }

            weeklyTasks = Array.isArray(weeklyTasks) ? weeklyTasks : [];
            weeklyTasks.push({
                id: 'weekly_task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                title,
                weekKey: getWeeklyTasksWeekKey(),
                completed: false,
                createdAt: new Date().toISOString()
            });

            closeModal();
            renderWeeklyTasksPanel();
            toggleWeeklyTasks(true);
            try {
                await saveData();
                showToast('Tarea añadida');
            } catch (e) {
                console.error('Error guardando tarea semanal:', e);
                showToast('La tarea se añadió, pero no se pudo guardar en la nube.', true);
            }
        }

        async function completeWeeklyTask(taskId) {
            const task = (Array.isArray(weeklyTasks) ? weeklyTasks : []).find(t => t && t.id === taskId);
            if (!task || task.completed) return;

            const completedDate = new Date().toISOString().slice(0, 10);
            task.completed = true;
            task.completedAt = new Date().toISOString();

            // La tarea deja de estar pendiente y pasa a formar parte del
            // historial normal de Bitácora mediante una entrada de calendario.
            entries.push({
                id: 'weekly_task_done_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                type: 'event',
                title: 'Tarea hecha: ' + task.title,
                date: completedDate,
                notes: 'Tarea semanal completada',
                category: 'Tareas semanales',
                createdAt: new Date().toISOString()
            });

            filteredEntries = [...entries];
            renderWeeklyTasksPanel();
            if (currentView === 'calendar') render();

            try {
                await saveData();
                showToast('Tarea completada');
            } catch (e) {
                console.error('Error guardando tarea completada:', e);
                showToast('Se marcó como hecha, pero no se pudo guardar en la nube.', true);
            }
        }

        // ============================================================
        //  PLANIFICADOR DEL DÍA (sustituye a Apuntes)
        //  La tabla se reinicia vacía cada día a las 4:00 am.
        // ============================================================

        // Clave del "día lógico" actual: antes de las 4:00 am se sigue
        // considerando parte del día anterior.
        function currentPlannerDayKey(date = new Date()) {
            const d = new Date(date);
            if (d.getHours() < 4) d.setDate(d.getDate() - 1);
            return d.toISOString().slice(0, 10);
        }

        function resetDayPlannerIfNeeded() {
            const key = currentPlannerDayKey();
            if (!dayPlanner || dayPlanner.dayKey !== key) {
                dayPlanner = { dayKey: key, items: [] };
            }
            dayPlanner.items = Array.isArray(dayPlanner.items) ? dayPlanner.items : [];
        }

        function renderPlanner() {
            resetDayPlannerIfNeeded();
            const items = [...dayPlanner.items].sort((a, b) => String(a.time).localeCompare(String(b.time)));
            const now = new Date();
            const nowMinutes = now.getHours() * 60 + now.getMinutes();

            return `
            <div class="planner-view">
                <div class="planner-head">
                    <div>
                        <div class="finance-kicker">Hoy</div>
                        <h3 style="margin:2px 0 0 0">Planificador del día</h3>
                        <p style="font-size:12px;color:var(--text-secondary);margin-top:4px">
                            Esta tabla se reinicia vacía automáticamente cada día a las 4:00 am.
                        </p>
                    </div>
                    <button class="btn-modal-primary" onclick="openAddPlannerItem()">+ Evento</button>
                </div>

                <div class="planner-timeline">
                    ${items.length ? items.map(it => {
                        const [h, m] = String(it.time).split(':').map(Number);
                        const itemMinutes = (h || 0) * 60 + (m || 0);
                        const isPast = itemMinutes < nowMinutes;
                        return `
                        <div class="planner-item ${isPast ? 'planner-item-past' : ''}">
                            <div class="planner-item-time">${escapeHtml(it.time)}</div>
                            <div class="planner-item-dot"></div>
                            <div class="planner-item-body">
                                <div class="planner-item-title">${escapeHtml(it.title)}</div>
                                ${it.notes ? `<div class="planner-item-notes">${escapeHtml(it.notes)}</div>` : ''}
                            </div>
                            <button class="planner-item-delete" title="Eliminar" onclick="deletePlannerItem('${it.id}')">×</button>
                        </div>`;
                    }).join('') : `
                        <div class="finance-empty-state">Aún no has añadido eventos para hoy. Pulsa <strong>+ Evento</strong> para empezar tu planificación.</div>
                    `}
                </div>
            </div>`;
        }

        function openAddPlannerItem() {
            const now = new Date();
            const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(Math.ceil(now.getMinutes() / 5) * 5 % 60).padStart(2, '0')}`;
            showModal(`
                <div class="modal-title">+ Evento del día</div>
                <div class="modal-label">Hora</div>
                <input id="planner-item-time" class="modal-input" type="time" value="${defaultTime}">
                <div class="modal-label">Título</div>
                <input id="planner-item-title" class="modal-input" type="text" placeholder="¿Qué vas a hacer?">
                <div class="modal-label">Notas (opcional)</div>
                <textarea id="planner-item-notes" class="modal-input" rows="2" placeholder="Detalles adicionales..."></textarea>
                <button class="btn-modal-primary" onclick="savePlannerItem()">Añadir a la timeline</button>
            `);
            setTimeout(() => document.getElementById('planner-item-title')?.focus(), 50);
        }

        async function savePlannerItem() {
            resetDayPlannerIfNeeded();
            const time = document.getElementById('planner-item-time')?.value || '';
            const title = document.getElementById('planner-item-title')?.value.trim() || '';
            const notes = document.getElementById('planner-item-notes')?.value.trim() || '';
            if (!time || !title) { showToast('Indica al menos hora y título', true); return; }

            dayPlanner.items.push({
                id: 'planner_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                time, title, notes
            });
            closeModal();
            if (currentView === 'planner') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deletePlannerItem(id) {
            resetDayPlannerIfNeeded();
            dayPlanner.items = dayPlanner.items.filter(it => it.id !== id);
            if (currentView === 'planner') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // ============================================================
        //  COLECCIONABLES
        // ============================================================

        function collectibleCategoryName(catId) {
            const cat = collectibleCategories.find(c => c.id === catId);
            return cat ? cat.name : 'Sin categoría';
        }

        function renderCollectibles() {
            if (!Array.isArray(collectibleCategories) || !collectibleCategories.length) {
                collectibleCategories = [{ id: 'cat_cartas', name: 'Cartas' }, { id: 'cat_videojuegos', name: 'Videojuegos' }];
            }
            if (!Array.isArray(collectibles)) collectibles = [];

            const totalsByCategory = collectibleCategories.map(cat => {
                const items = collectibles.filter(c => c.category === cat.id);
                const total = items.reduce((s, c) => s + (Number(c.value) || 0), 0);
                return { cat, count: items.length, total };
            });
            const grandTotal = totalsByCategory.reduce((s, t) => s + t.total, 0);

            const sorted = [...collectibles].sort((a, b) =>
                collectibleCategoryName(a.category).localeCompare(collectibleCategoryName(b.category)) ||
                String(a.name).localeCompare(String(b.name))
            );

            return `
            <div class="collectibles-view">
                <div class="collectibles-dashboard-row">
                    <div class="collectibles-dashboard">
                        ${totalsByCategory.map(t => `
                            <div class="finance-metric-card">
                                <div class="finance-metric-icon">◆</div>
                                <div class="finance-metric-value">${financeMoney(t.total)}</div>
                                <div class="finance-metric-label">${escapeHtml(t.cat.name)}</div>
                                <div class="finance-metric-note">${t.count} objeto${t.count === 1 ? '' : 's'}</div>
                            </div>
                        `).join('')}
                        <div class="finance-metric-card collectibles-total-card">
                            <div class="finance-metric-icon">Σ</div>
                            <div class="finance-metric-value">${financeMoney(grandTotal)}</div>
                            <div class="finance-metric-label">Valor total</div>
                            <div class="finance-metric-note">${collectibles.length} objetos en total</div>
                        </div>
                    </div>
                    <div class="collectibles-actions-col">
                        <button class="btn-modal-primary" onclick="openAddCollectibleCategory()">+ Categoría</button>
                        <button class="btn-modal-primary" onclick="openAddCollectible()">+ Coleccionable</button>
                    </div>
                </div>

                <div class="collectibles-table-wrap">
                    ${collectibles.length ? collectibleCategories.map(cat => {
                        const items = collectibles.filter(c => c.category === cat.id)
                            .sort((a, b) => String(a.name).localeCompare(String(b.name)));
                        if (!items.length) return '';
                        const maxVal = Math.max(...items.map(c => Number(c.value) || 0));
                        return `
                            <div class="media-card-section-title">${escapeHtml(cat.name)}</div>
                            <div class="media-card-grid">
                                ${items.map(c => renderCollectibleCard(c, maxVal > 0 && (Number(c.value) || 0) === maxVal)).join('')}
                            </div>`;
                    }).join('') : `
                        <div class="finance-empty-state">Aún no has añadido coleccionables. Pulsa <strong>+ Coleccionable</strong> para empezar tu catálogo.</div>
                    `}
                </div>
            </div>`;
        }

        // Tarjeta de coleccionable: fondo negro común; reborde dorado minimalista
        // para el objeto de mayor valor de mercado dentro de su categoría.
        function renderCollectibleCard(item, isTopValue) {
            return `
                <div class="media-card collectible-card ${isTopValue ? 'media-card-gold' : ''}" onclick="openEditCollectible('${item.id}')">
                    <div class="collectible-card-actions">
                        <button title="Eliminar" onclick="event.stopPropagation();deleteCollectible('${item.id}')">×</button>
                    </div>
                    <div class="media-card-icon">◆</div>
                    <div class="media-card-title">${escapeHtml(item.name)}</div>
                    <div class="media-card-meta">${financeMoney(item.value)}</div>
                </div>`;
        }

        function collectibleCategoryOptions(selectedId) {
            return collectibleCategories.map(c =>
                `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
            ).join('');
        }

        function openAddCollectible() {
            showModal(`
                <div class="modal-title">+ Coleccionable</div>
                <div class="modal-label">Nombre</div>
                <input id="collectible-name" class="modal-input" type="text" placeholder="Ej: Carta Charizard 1ª edición">
                <div class="modal-label">Categoría</div>
                <select id="collectible-category" class="modal-input">${collectibleCategoryOptions()}</select>
                <div class="modal-label">Valor de mercado (€)</div>
                <input id="collectible-value" class="modal-input" type="number" min="0" step="0.01" value="0">
                <button class="btn-modal-primary" onclick="saveNewCollectible()">Añadir</button>
            `);
            setTimeout(() => document.getElementById('collectible-name')?.focus(), 50);
        }

        async function saveNewCollectible() {
            const name = document.getElementById('collectible-name')?.value.trim() || '';
            const category = document.getElementById('collectible-category')?.value || '';
            const value = Math.max(0, Number(document.getElementById('collectible-value')?.value) || 0);
            if (!name || !category) { showToast('Indica al menos nombre y categoría', true); return; }

            collectibles.push({
                id: 'coll_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                name, category, value, createdAt: new Date().toISOString()
            });
            closeModal();
            if (currentView === 'collectibles') render();
            try { await saveData(); showToast('Coleccionable añadido'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openEditCollectible(id) {
            const item = collectibles.find(c => c.id === id);
            if (!item) return;
            showModal(`
                <div class="modal-title">Editar coleccionable</div>
                <div class="modal-label">Nombre</div>
                <input id="collectible-name" class="modal-input" type="text" value="${escapeHtml(item.name)}">
                <div class="modal-label">Categoría</div>
                <select id="collectible-category" class="modal-input">${collectibleCategoryOptions(item.category)}</select>
                <div class="modal-label">Valor de mercado (€)</div>
                <input id="collectible-value" class="modal-input" type="number" min="0" step="0.01" value="${Number(item.value) || 0}">
                <button class="btn-modal-primary" onclick="saveEditCollectible('${id}')">Guardar cambios</button>
            `);
        }

        async function saveEditCollectible(id) {
            const item = collectibles.find(c => c.id === id);
            if (!item) return;
            const name = document.getElementById('collectible-name')?.value.trim() || '';
            const category = document.getElementById('collectible-category')?.value || '';
            const value = Math.max(0, Number(document.getElementById('collectible-value')?.value) || 0);
            if (!name || !category) { showToast('Indica al menos nombre y categoría', true); return; }

            item.name = name; item.category = category; item.value = value;
            closeModal();
            if (currentView === 'collectibles') render();
            try { await saveData(); showToast('Coleccionable actualizado'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteCollectible(id) {
            if (!confirm('¿Eliminar este coleccionable?')) return;
            collectibles = collectibles.filter(c => c.id !== id);
            if (currentView === 'collectibles') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openAddCollectibleCategory() {
            showModal(`
                <div class="modal-title">+ Categoría de coleccionables</div>
                <div class="modal-label">Nombre de la categoría</div>
                <input id="collectible-category-name" class="modal-input" type="text" placeholder="Ej: Figuras, Vinilos, Cómics...">
                <button class="btn-modal-primary" onclick="saveNewCollectibleCategory()">Añadir categoría</button>
            `);
            setTimeout(() => document.getElementById('collectible-category-name')?.focus(), 50);
        }

        async function saveNewCollectibleCategory() {
            const name = document.getElementById('collectible-category-name')?.value.trim() || '';
            if (!name) { showToast('Indica un nombre para la categoría', true); return; }
            if (collectibleCategories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
                showToast('Ya existe una categoría con ese nombre', true); return;
            }
            collectibleCategories.push({ id: 'cat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name });
            closeModal();
            if (currentView === 'collectibles') render();
            try { await saveData(); showToast('Categoría añadida'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function closeWeeklyTasksOnOutsideClick(event) {
            const panel = document.getElementById('weekly-tasks-panel');
            const button = document.getElementById('weekly-tasks-btn');
            if (!panel || !panel.classList.contains('open')) return;
            if (panel.contains(event.target) || button?.contains(event.target)) return;
            toggleWeeklyTasks(false);
        }

        document.addEventListener('click', closeWeeklyTasksOnOutsideClick);
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') toggleWeeklyTasks(false);
        });

        // ============================================================
        //  FAB
        // ============================================================
        // ============================================================
        //  OPEN NEW ENTRY (FAB)
        // ============================================================
        function openNewEntry(type) {
            editId = null;
            editType = type;
            document.getElementById('modal-container').innerHTML = renderEntryModal(type, null);
        }

        // ============================================================
        //  ENTRY DETAIL (READ-ONLY FIRST)
        // ============================================================
        function formatTravelRange(startDate,endDate){
            if(!startDate&&!endDate)return '';
            const fmt=d=>new Date(d+'T12:00:00').toLocaleDateString('es-ES',{day:'numeric',month:'short'});
            if(startDate&&endDate)return `del ${fmt(startDate)} al ${fmt(endDate)}, ${endDate.slice(0,4)}`;
            return startDate?`desde ${fmt(startDate)}, ${startDate.slice(0,4)}`:`hasta ${fmt(endDate)}, ${endDate.slice(0,4)}`;
        }
        function getTravelTotal(entry){return(entry.expenses||[]).reduce((sum,x)=>sum+(Number(x.amount)||0),0);}
        function detailField(label,value){if(value===undefined||value===null||value==='')return '';return `<div class="entry-detail-field"><div class="entry-detail-label">${label}</div><div class="entry-detail-value">${value}</div></div>`;}
        function renderEntryDetailModal(entry){
            const label=TYPE_LABELS[entry.type]||'Entrada'; let fields='';
            if(entry.type==='travel'){
                fields+=detailField('Lugar al que viajé',escapeHtml(entry.destination||entry.title));
                fields+=detailField('Fechas',escapeHtml(formatTravelRange(entry.startDate,entry.endDate)));
                if(entry.companions)fields+=detailField('Viajé con',escapeHtml(entry.companions));
                const total=getTravelTotal(entry); if(total>0)fields+=detailField('Coste total',total.toLocaleString('es-ES')+' €');
                if(entry.notes)fields+=detailField('Notas',linkifyText(entry.notes));
            }else if(entry.type==='project'){
                const pBucket = projectStatusBucket(entry.status);
                const pPriority = entry.priority || 'media';
                fields+=detailField('Descripción',escapeHtml(entry.description||''));
                fields+=detailField('Estado',pBucket);
                fields+=detailField('Prioridad',`<span class="project-priority-dot" style="background:${PROJECT_PRIORITY_COLOR[pPriority]}"></span> ${PROJECT_PRIORITY_LABEL[pPriority]}`);
                if(entry.endDate){
                    const overdue = entry.endDate < todayISO() && pBucket !== 'Completado';
                    fields+=detailField('Fecha límite', overdue ? `<span class="project-overdue">${escapeHtml(entry.endDate)} (vencido)</span>` : escapeHtml(entry.endDate));
                }
                const tasks=Array.isArray(entry.tasks)?entry.tasks:[];
                const doneCount = tasks.filter(t=>t.done).length;
                const pct = tasks.length ? Math.round(doneCount/tasks.length*100) : 0;
                fields+=`<div class="entry-detail-field" style="grid-column:1/-1"><div class="entry-detail-label">Ruta de hitos${tasks.length?` · ${doneCount}/${tasks.length} · ${pct}%`:''}</div>
                    ${tasks.length?`<div class="progress-bar-bg" style="margin-bottom:4px"><div class="progress-bar-fill" style="width:${pct}%;background:#2563eb"></div></div>`:''}
                    ${tasks.length?`<div class="project-roadmap">${tasks.map((task,i)=>`
                        <label class="project-roadmap-item" onclick="event.stopPropagation()">
                            <input type="checkbox" class="project-roadmap-checkbox" ${task.done?'checked':''} onchange="toggleProjectTask('${entry.id}',${i})">
                            <span class="project-roadmap-check ${task.done?'done':''}">${task.done?'✓':i+1}</span>
                            <span class="project-roadmap-text ${task.done?'done':''}">${escapeHtml(task.text)}</span>
                        </label>`).join('')}</div>`:'<span class="entry-detail-value">Sin hitos todavía.</span>'}</div>`;
                const features=Array.isArray(entry.features)?entry.features:[];
                if(features.length){
                    fields+=`<div class="entry-detail-field" style="grid-column:1/-1"><div class="entry-detail-label">Características</div>
                        <div class="project-features">${features.map(f=>`<div class="project-feature-chip"><b>${escapeHtml(f.label)}</b>${f.value?`<span>${escapeHtml(f.value)}</span>`:''}</div>`).join('')}</div></div>`;
                }
                if(entry.notes)fields+=detailField('Notas',linkifyText(entry.notes));
            }else if(entry.type==='goal'){
                const termLabel = { short:'Corto plazo', medium:'Medio plazo', long:'Largo plazo' }[entry.term] || '';
                fields+=detailField('Plazo',termLabel);
                fields+=detailField('Estado',escapeHtml(entry.status||''));
                const gPct = goalProgressPct(entry);
                if(gPct!==null){
                    fields+=`<div class="entry-detail-field" style="grid-column:1/-1"><div class="entry-detail-label">Progreso</div>
                        <div class="progress-bar-bg" style="margin-bottom:6px"><div class="progress-bar-fill" style="width:${gPct}%;background:#2563eb"></div></div>
                        <div class="entry-detail-value">${goalNumber(entry.currentValue)} / ${goalNumber(entry.targetValue)} ${escapeHtml(entry.unit||'')} · ${gPct}%</div></div>`;
                }
                const milestones=Array.isArray(entry.milestones)?entry.milestones:[];
                if(milestones.length){
                    const msDone=milestones.filter(m=>m.done).length;
                    fields+=`<div class="entry-detail-field" style="grid-column:1/-1"><div class="entry-detail-label">Hitos · ${msDone}/${milestones.length}</div>
                        ${milestones.map((m,i)=>`<label class="project-task-row" onclick="event.stopPropagation()"><input type="checkbox" ${m.done?'checked':''} onchange="toggleGoalMilestone('${entry.id}',${i})"><span class="${m.done?'done':''}">${escapeHtml(m.text)}</span></label>`).join('')}</div>`;
                }
                if(entry.tags?.length)fields+=detailField('Etiquetas',entry.tags.map(t=>escapeHtml(t)).join(' · '));
                if(entry.notes)fields+=detailField('Notas',linkifyText(entry.notes));
            }else{
                fields+=detailField('Fecha',escapeHtml(entry.date||entry.startDate||'')); fields+=detailField('Estado',escapeHtml(entry.status||''));
                fields+=detailField('Lugar',escapeHtml(entry.place||entry.destination||'')); fields+=detailField('Notas',entry.notes?linkifyText(entry.notes):'');
                if(entry.tags?.length)fields+=detailField('Etiquetas',entry.tags.map(t=>escapeHtml(t)).join(' · '));
                if(entry.author)fields+=detailField('Autor',escapeHtml(entry.author));
                if(entry.company)fields+=detailField('Empresa',escapeHtml(entry.company));
                if(entry.position)fields+=detailField('Cargo',escapeHtml(entry.position));
            }
            const detailExternal = entryExternalLink(entry);
            const detailExternalUrl = detailExternal?.url;
            const detailExternalBtn = detailExternal
                ? `<button class="entry-detail-external" data-ext-url="${escapeHtml(detailExternal.url)}" onclick="openExternalSearch(event,this)"><span>↗</span>${escapeHtml(detailExternal.label)}</button>`
                : '';
            const recomendable = ['book', 'movie', 'series', 'game'].includes(entry.type);
            const recomendarBtn = recomendable
                ? `<button class="btn-secondary" style="width:auto;margin-left:auto" onclick="abrirRecomendarModal('${entry.id}')">Recomendar</button>`
                : '';
            return `<div class="modal-overlay" onclick="if(event.target===this)closeModal()"><div class="modal-sheet entry-detail-card">${detailExternalBtn}<div class="modal-title${detailExternalUrl ? ' entry-detail-title-with-external' : ''}">${escapeHtml(entry.title||label)}</div><div style="font-size:11px;color:var(--text-secondary)">${label}</div><div class="entry-detail-grid">${fields||detailField('Información','Sin información adicional')}</div><div class="entry-detail-actions"><button class="btn-modal-primary" onclick="openEditEntry('${entry.id}')">Editar</button><button class="btn-secondary" style="width:auto" onclick="deleteEntry('${entry.id}')">Eliminar</button><button class="btn-secondary" style="width:auto" onclick="closeModal()">Cerrar</button>${recomendarBtn}</div></div></div>`;
        }
        function openEntryDetail(id){const entry=entries.find(e=>e.id===id);if(!entry)return;if(entry.type==='travel'){switchView('travels');openTripManager(id);return;}document.getElementById('modal-container').innerHTML=renderEntryDetailModal(entry);}
        async function toggleProjectTask(projectId,taskIndex){
            const project=entries.find(e=>e.id===projectId); if(!project||!Array.isArray(project.tasks)||!project.tasks[taskIndex])return;
            project.tasks[taskIndex].done=!project.tasks[taskIndex].done;
            try{await saveData();openEntryDetail(projectId);render();}catch(e){console.error(e);showToast('No se pudo guardar la tarea',true);}
        }

        async function toggleGoalMilestone(goalId,index){
            const goal=entries.find(e=>e.id===goalId); if(!goal||!Array.isArray(goal.milestones)||!goal.milestones[index])return;
            goal.milestones[index].done=!goal.milestones[index].done;
            try{await saveData();openEntryDetail(goalId);render();}catch(e){console.error(e);showToast('No se pudo guardar el hito',true);}
        }

        // ============================================================
        //  OPEN EDIT ENTRY
        // ============================================================
        function openEditEntry(id){
            const entry = entries.find(e => e.id === id);
            if (!entry) return;
            editId = id;
            editType = entry.type;
            document.getElementById('modal-container').innerHTML = renderEntryModal(entry.type, entry);
        }

        // ============================================================
        //  CLOSE MODAL
        // ============================================================
        function closeModal() {
            editId = null;
            editType = null;
            const container = document.getElementById('modal-container');
            const overlay = container.querySelector('.modal-overlay');
            if (!overlay) { container.innerHTML = ''; return; }
            overlay.style.animation = 'modalOverlayOut 0.18s ease both';
            const sheet = overlay.querySelector('.modal-sheet');
            if (sheet) sheet.style.animation = 'modalSheetOut 0.18s cubic-bezier(0.4,0,1,1) both';
            setTimeout(() => { if (container.contains(overlay)) container.innerHTML = ''; }, 170);
        }

        // ============================================================
        //  RENDER ENTRY MODAL
        // ============================================================
        function renderBacklinksBlock(entryId) {
            const backlinks = getBacklinks(entryId);
            if (!backlinks.length) return '';
            return `
                <div class="modal-label">Enlazado desde</div>
                <div class="backlinks-list">
                    ${backlinks.map(b => `
                        <div class="backlink-item" onclick="openEntryFromLink('${b.id}')">
                            <span>${TYPE_ICONS[b.type] || '◈'}</span>
                            <span>${escapeHtml(b.title)}</span>
                        </div>
                    `).join('')}
                </div>`;
        }

        function renderEntryModal(type, entry) {
            const isEdit = !!entry;
            const today = new Date().toISOString().slice(0, 10);
            const icon = TYPE_ICONS[type] || '◈';
            const label = TYPE_LABELS[type] || 'Entrada';
            const nuevoNueva = TYPE_GENDER[type] === 'a' ? 'Nueva' : 'Nuevo';
            const title = isEdit ? 'Editar ' + label : nuevoNueva + ' ' + label;

            let extraFields = '';

            // ===== BOOK =====
            if (type === 'book') {
                extraFields = `
                    <div class="modal-label">Autor</div>
                    <input id="modal-author" class="modal-input" value="${isEdit ? entry.author || '' : ''}" placeholder="Ej: Gabriel García Márquez">
                    <div class="modal-label">Fecha de inicio</div>
                    <input type="date" id="modal-start" class="modal-input" value="${isEdit ? entry.startDate || '' : ''}">
                    ${isEdit ? `
                        <div class="modal-label">Fecha de finalización</div>
                        <input type="date" id="modal-end" class="modal-input" value="${entry.endDate || ''}">
                        <div class="modal-label">Valoración (1-5)</div>
                        <select id="modal-rating" class="modal-input">
                            ${[0,1,2,3,4,5].map(r => `<option value="${r}" ${isEdit && entry.rating === r ? 'selected' : ''}>${r === 0 ? 'Sin valorar' : '⭐'.repeat(r)}</option>`).join('')}
                        </select>
                    ` : ''}
                `;
            }

            // ===== MOVIE =====
            else if (type === 'movie') {
                extraFields = `
                    <div class="modal-label">Fecha</div>
                    <input type="date" id="modal-date" class="modal-input" value="${isEdit ? entry.date || '' : today}">
                    ${isEdit ? `
                        <div class="modal-label">Valoración (1-5)</div>
                        <select id="modal-rating" class="modal-input">
                            ${[0,1,2,3,4,5].map(r => `<option value="${r}" ${isEdit && entry.rating === r ? 'selected' : ''}>${r === 0 ? 'Sin valorar' : '⭐'.repeat(r)}</option>`).join('')}
                        </select>
                        <div class="modal-label">Notas</div>
                        <textarea id="modal-notes" class="modal-input" rows="2">${isEdit ? entry.notes || '' : ''}</textarea>
                    ` : ''}
                `;
            }

            // ===== SERIES =====
            else if (type === 'series') {
                const statuses = ['Viendo', 'Completada', 'Abandonada'];
                extraFields = `
                    <div class="modal-label">Fecha de inicio</div>
                    <input type="date" id="modal-start" class="modal-input" value="${isEdit ? entry.startDate || '' : today}">
                    ${isEdit ? `
                        <div class="modal-label">Estado</div>
                        <select id="modal-status" class="modal-input">
                            ${statuses.map(s => `<option value="${s}" ${isEdit && entry.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                        <div class="modal-label">Fecha de finalización</div>
                        <input type="date" id="modal-end" class="modal-input" value="${entry.endDate || ''}">
                        <div class="modal-label">Valoración (1-5)</div>
                        <select id="modal-rating" class="modal-input">
                            ${[0,1,2,3,4,5].map(r => `<option value="${r}" ${isEdit && entry.rating === r ? 'selected' : ''}>${r === 0 ? 'Sin valorar' : '⭐'.repeat(r)}</option>`).join('')}
                        </select>
                    ` : ''}
                `;
            }

            // ===== GAME =====
            else if (type === 'game') {
                const statuses = ['Jugando', 'Completado', 'Abandonado'];
                extraFields = `
                    <div class="modal-label">Fecha de inicio</div>
                    <input type="date" id="modal-start" class="modal-input" value="${isEdit ? entry.startDate || '' : today}">
                    ${isEdit ? `
                        <div class="modal-label">Estado</div>
                        <select id="modal-status" class="modal-input">
                            ${statuses.map(s => `<option value="${s}" ${isEdit && entry.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                        <div class="modal-label">Fecha de finalización</div>
                        <input type="date" id="modal-end" class="modal-input" value="${entry.endDate || ''}">
                        <div class="modal-label">Valoración (1-5)</div>
                        <select id="modal-rating" class="modal-input">
                            ${[0,1,2,3,4,5].map(r => `<option value="${r}" ${isEdit && entry.rating === r ? 'selected' : ''}>${r === 0 ? 'Sin valorar' : '⭐'.repeat(r)}</option>`).join('')}
                        </select>
                    ` : ''}
                `;
            }

            // ===== TRAVEL =====
            else if (type === 'travel') {
                const expenses = isEdit ? (entry.expenses || []) : [];
                extraFields = `
                    <div class="modal-label">Destino</div>
                    <input id="modal-destination" class="modal-input" value="${isEdit ? entry.destination || '' : ''}" placeholder="Ej: Roma, Italia">
                    <div class="modal-row">
                        <div><div class="modal-label">Fecha inicio</div><input type="date" id="modal-start" class="modal-input" value="${isEdit ? entry.startDate || '' : ''}"></div>
                        <div><div class="modal-label">Fecha fin</div><input type="date" id="modal-end" class="modal-input" value="${isEdit ? entry.endDate || '' : ''}"></div>
                    </div>
                    <div class="modal-label">Personas</div>
                    <input id="modal-companions" class="modal-input" value="${isEdit ? entry.companions || '' : ''}" placeholder="Ana, Carlos, ...">
                    <div class="modal-label">Gastos del viaje</div>
                    <div id="expenses-list">
                        ${expenses.map((exp, i) => renderExpenseRow(exp, i)).join('')}
                    </div>
                    <button type="button" class="btn-secondary" onclick="addExpenseRow()">+ Añadir gasto</button>
                    <div id="expenses-total">Total: ${expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0).toLocaleString('es-ES')}€</div>
                    <div class="modal-label">Notas</div>
                    <textarea id="modal-notes" class="modal-input" rows="2">${isEdit ? entry.notes || '' : ''}</textarea>
                `;
            }

            // ===== WORK =====
            else if (type === 'work') {
                extraFields = `
                    <div class="modal-label">Empresa</div>
                    <input id="modal-company" class="modal-input" value="${isEdit ? entry.company || '' : ''}" placeholder="Ej: Empresa X">
                    <div class="modal-label">Cargo</div>
                    <input id="modal-position" class="modal-input" value="${isEdit ? entry.position || '' : ''}" placeholder="Ej: Operario logístico">
                    <div class="modal-row">
                        <div><div class="modal-label">Fecha inicio</div><input type="date" id="modal-start" class="modal-input" value="${isEdit ? entry.startDate || '' : ''}"></div>
                        <div><div class="modal-label">Fecha fin</div><input type="date" id="modal-end" class="modal-input" value="${isEdit ? entry.endDate || '' : ''}"></div>
                    </div>
                    <div class="modal-label">Horario</div>
                    <div class="modal-row">
                        <div><div class="modal-label" style="margin-top:4px">Entrada</div><input type="time" id="modal-start-time" class="modal-input" value="${isEdit ? entry.startTime || '' : ''}"></div>
                        <div><div class="modal-label" style="margin-top:4px">Salida</div><input type="time" id="modal-end-time" class="modal-input" value="${isEdit ? entry.endTime || '' : ''}"></div>
                    </div>
                    <div class="modal-label">Tipo de cotización</div>
                    <select id="modal-cotization-type" class="modal-input">
                        <option value="general" ${isEdit && entry.cotizationType === 'practicas' ? '' : 'selected'}>Régimen general</option>
                        <option value="practicas" ${isEdit && entry.cotizationType === 'practicas' ? 'selected' : ''}>Prácticas formativas</option>
                    </select>
                    <div class="modal-label">Vida laboral · días cotizados</div>
                    <input type="number" id="modal-cotized-days" class="modal-input" value="${isEdit && Number.isFinite(Number(entry.cotizedDays)) ? entry.cotizedDays : ''}" min="0" step="1" placeholder="Ej: 32">
                    <div style="font-size:11px;color:var(--text-secondary);margin:-4px 0 10px">
                        Opcional. Si introduces aquí la cifra real de tu informe de Vida Laboral, Bitácora la utilizará en lugar de su estimación. Si lo dejas vacío, calculará los días automáticamente, incluyendo fines de semana.
                    </div>
                    <div class="modal-label">Salario (€/mes, opcional)</div>
                    <input type="number" id="modal-salary" class="modal-input" value="${isEdit ? entry.salary || '' : ''}" step="0.01" placeholder="0.00">
                    <div class="modal-label">Notas</div>
                    <textarea id="modal-notes" class="modal-input" rows="2">${isEdit ? entry.notes || '' : ''}</textarea>
                `;
            }

            // ===== PROJECT =====
            else if (type === 'project') {
                const pStatus = isEdit ? projectStatusBucket(entry.status) : 'Pendiente';
                const pPriority = isEdit ? (entry.priority || 'media') : 'media';
                extraFields = `
                    <div class="modal-label">Descripción</div>
                    <textarea id="modal-desc" class="modal-input" rows="2">${isEdit ? entry.description || '' : ''}</textarea>
                    <div class="modal-row">
                        <div><div class="modal-label">Categoría</div>
                            <select id="modal-category" class="modal-input">
                                <option value="Trabajo" ${isEdit && entry.projectCategory === 'Trabajo' ? 'selected' : ''}>Trabajo</option>
                                <option value="Estudios" ${isEdit && entry.projectCategory === 'Estudios' ? 'selected' : ''}>Estudios</option>
                                <option value="Ocio" ${isEdit && entry.projectCategory === 'Ocio' ? 'selected' : ''}>Ocio</option>
                                <option value="Evento" ${isEdit && entry.projectCategory === 'Evento' ? 'selected' : ''}>Evento</option>
                            </select>
                        </div>
                        <div><div class="modal-label">Prioridad</div>
                            <select id="modal-priority" class="modal-input">
                                <option value="alta" ${pPriority === 'alta' ? 'selected' : ''}>Alta</option>
                                <option value="media" ${pPriority === 'media' ? 'selected' : ''}>Media</option>
                                <option value="baja" ${pPriority === 'baja' ? 'selected' : ''}>Baja</option>
                            </select>
                        </div>
                    </div>
                    <div class="modal-label">Estado</div>
                    <select id="modal-project-status" class="modal-input">
                        <option value="Pendiente" ${pStatus === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                        <option value="En progreso" ${pStatus === 'En progreso' ? 'selected' : ''}>En progreso</option>
                        <option value="Completado" ${pStatus === 'Completado' ? 'selected' : ''}>Completado</option>
                    </select>
                    <div class="modal-row">
                        <div><div class="modal-label">Fecha inicio</div><input type="date" id="modal-start" class="modal-input" value="${isEdit ? entry.startDate || '' : ''}"></div>
                        <div><div class="modal-label">Fecha límite</div><input type="date" id="modal-end" class="modal-input" value="${isEdit ? entry.endDate || '' : ''}"></div>
                    </div>
                    <div class="modal-label">Ruta de hitos (uno por línea; añade ✓ al final para marcarlo hecho)</div>
                    <textarea id="modal-tasks" class="modal-input" rows="3">${isEdit ? (entry.tasks || []).map(t => t.text + (t.done ? ' ✓' : '')).join('\n') : ''}</textarea>
                    <div class="modal-label">Características (una por línea, formato Etiqueta: Valor)</div>
                    <textarea id="modal-features" class="modal-input" rows="2" placeholder="Presupuesto: 500€&#10;Cliente: Ada&#10;Stack: React + Supabase">${isEdit ? (entry.features || []).map(f => f.label + ': ' + f.value).join('\n') : ''}</textarea>
                    <div class="modal-label">Notas</div>
                    <textarea id="modal-notes" class="modal-input" rows="2">${isEdit ? entry.notes || '' : ''}</textarea>
                `;
            }

            // ===== EVENT =====
            else if (type === 'event') {
                extraFields = `
                    <div class="modal-label">Tipo</div>
                    <select id="modal-event-type" class="modal-input">
                        <option value="social" ${isEdit && entry.eventType === 'social' ? 'selected' : ''}>Social</option>
                        <option value="teatro" ${isEdit && entry.eventType === 'teatro' ? 'selected' : ''}>Teatro</option>
                        <option value="cine" ${isEdit && entry.eventType === 'cine' ? 'selected' : ''}>Cine</option>
                        <option value="concierto" ${isEdit && entry.eventType === 'concierto' ? 'selected' : ''}>Concierto</option>
                        <option value="deporte" ${isEdit && entry.eventType === 'deporte' ? 'selected' : ''}>Deporte</option>
                        <option value="otro" ${isEdit && entry.eventType === 'otro' ? 'selected' : ''}>Otro</option>
                    </select>
                    <div class="modal-label">Fecha</div>
                    <input type="date" id="modal-date" class="modal-input" value="${isEdit ? entry.date || '' : today}">
                    <div class="modal-label">Hora</div>
                    <input type="time" id="modal-time" class="modal-input" value="${isEdit ? entry.time || '' : ''}">
                    <div class="modal-label">Lugar</div>
                    <input id="modal-place" class="modal-input" value="${isEdit ? entry.place || '' : ''}" placeholder="Ej: Wembley Stadium">
                    <div class="modal-label">Notas</div>
                    <textarea id="modal-notes" class="modal-input" rows="2">${isEdit ? entry.notes || '' : ''}</textarea>
                `;
            }

            // ===== PLACE =====
            else if (type === 'place') {
                extraFields = `
                    <div class="modal-label">Fecha</div>
                    <input type="date" id="modal-date" class="modal-input" value="${isEdit ? entry.date || '' : today}">
                    <div class="modal-label">Notas</div>
                    <textarea id="modal-notes" class="modal-input" rows="2">${isEdit ? entry.notes || '' : ''}</textarea>
                `;
            }

            // ===== DOCUMENT =====
            else if (type === 'document') {
                extraFields = `
                    <div class="modal-label">Fecha</div>
                    <input type="date" id="modal-date" class="modal-input" value="${isEdit ? entry.date || '' : today}">
                    <div class="modal-label">Notas</div>
                    <textarea id="modal-notes" class="modal-input" rows="2">${isEdit ? entry.notes || '' : ''}</textarea>
                `;
            }

            // ===== GOAL =====
            else if (type === 'goal') {
                const statuses = ['Pendiente', 'En progreso', 'Completado'];
                const goalType = isEdit ? (entry.goalType || 'simple') : 'simple';
                extraFields = `
                    <div class="modal-row">
                        <div><div class="modal-label">Plazo</div>
                            <select id="modal-term" class="modal-input">
                                <option value="short" ${isEdit && entry.term === 'short' ? 'selected' : ''}>Corto plazo</option>
                                <option value="medium" ${isEdit && entry.term === 'medium' ? 'selected' : ''}>Medio plazo</option>
                                <option value="long" ${isEdit && entry.term === 'long' ? 'selected' : ''}>Largo plazo</option>
                            </select>
                        </div>
                        <div><div class="modal-label">Tipo</div>
                            <select id="modal-goal-type" class="modal-input" onchange="document.getElementById('goal-numeric-fields').style.display=this.value==='numeric'?'block':'none'">
                                <option value="simple" ${goalType === 'simple' ? 'selected' : ''}>Simple (estado)</option>
                                <option value="numeric" ${goalType === 'numeric' ? 'selected' : ''}>Numérico (progreso)</option>
                            </select>
                        </div>
                    </div>
                    <div id="goal-numeric-fields" style="display:${goalType === 'numeric' ? 'block' : 'none'}">
                        <div class="modal-row">
                            <div><div class="modal-label">Valor actual</div><input type="number" step="any" id="modal-goal-current" class="modal-input" value="${isEdit ? entry.currentValue ?? '' : ''}" placeholder="0"></div>
                            <div><div class="modal-label">Objetivo</div><input type="number" step="any" id="modal-goal-target" class="modal-input" value="${isEdit ? entry.targetValue ?? '' : ''}" placeholder="100"></div>
                        </div>
                        <div class="modal-label">Unidad</div>
                        <input id="modal-goal-unit" class="modal-input" value="${isEdit ? entry.unit || '' : ''}" placeholder="Ej: libros, €, km">
                    </div>
                    <div class="modal-label">Estado</div>
                    <select id="modal-goal-status" class="modal-input">
                        ${statuses.map(s => `<option value="${s}" ${isEdit && entry.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                    <div class="modal-label">Hitos (uno por línea; añade ✓ al final para marcarlo hecho)</div>
                    <textarea id="modal-goal-milestones" class="modal-input" rows="3">${isEdit ? (entry.milestones || []).map(m => m.text + (m.done ? ' ✓' : '')).join('\n') : ''}</textarea>
                    <div class="modal-label">Etiquetas (separadas por comas)</div>
                    <input id="modal-tags" class="modal-input" value="${isEdit ? (entry.tags || []).join(', ') : ''}" placeholder="p.ej. personal, trabajo, 2026">
                    <div class="modal-label">Notas</div>
                    <textarea id="modal-notes" class="modal-input" rows="3">${isEdit ? entry.notes || '' : ''}</textarea>
                `;
            }

            // ===== SUBSCRIPTION / FIXED_EXPENSE =====
            else if (type === 'subscription' || type === 'fixed_expense') {
                extraFields = `
                    <div class="modal-label">Importe mensual (€)</div>
                    <input type="number" id="modal-recurring-amount" class="modal-input" step="0.01" value="${isEdit ? entry.amount || '' : ''}" placeholder="0.00">
                    <div class="modal-label">Día de cargo (1-31)</div>
                    <input type="number" id="modal-recurring-day" class="modal-input" min="1" max="31" value="${isEdit ? entry.renewalDay || '' : ''}" placeholder="1">
                    <div class="modal-label">Estado</div>
                    <select id="modal-recurring-active" class="modal-input">
                        <option value="true" ${!isEdit || entry.active !== false ? 'selected' : ''}>Activo</option>
                        <option value="false" ${isEdit && entry.active === false ? 'selected' : ''}>Inactivo</option>
                    </select>
                `;
            }

            // ===== BIRTHDAY =====
            else if (type === 'birthday') {
                extraFields = `
                    <div class="modal-label">Nombre</div>
                    <input id="modal-bday-name" class="modal-input" value="${isEdit ? entry.firstName || '' : ''}" placeholder="Ej: Juan">
                    <div class="modal-label">Apellido</div>
                    <input id="modal-bday-lastname" class="modal-input" value="${isEdit ? entry.lastName || '' : ''}" placeholder="Ej: Pérez">
                    <div class="modal-label">Fecha de nacimiento</div>
                    <input type="date" id="modal-bday-date" class="modal-input" value="${isEdit ? entry.birthDate || '' : ''}">
                    <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">El cumpleaños aparecerá todos los años en el calendario.</div>
                `;
            }

            return `
            <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
                <div class="modal-sheet">
                    <div class="modal-title">
                        ${icon} ${title}
                        <button class="modal-close" onclick="closeModal()">✕</button>
                    </div>

                    <div class="modal-label">Título</div>
                    <input id="modal-title" class="modal-input" value="${isEdit ? entry.title : ''}" placeholder="Escribe un título...">

                    ${extraFields}

                    <div class="modal-label">Etiquetas (separadas por comas)</div>
                    <input id="modal-tags" class="modal-input" value="${isEdit ? (entry.tags || []).join(', ') : ''}" placeholder="p.ej. urgente, 2026, personal">

                    <div class="wikilink-hint">Consejo: escribe [[Título de otra entrada]] en las notas para enlazarla.</div>
                    ${isEdit ? renderBacklinksBlock(entry.id) : ''}

                    <button class="btn-modal-primary" onclick="saveEntry()">Guardar</button>
                    ${isEdit ? `<button class="btn-modal-danger" onclick="deleteEntry('${entry.id}')">Eliminar</button>` : ''}
                </div>
            </div>`;
        }

        // ============================================================
        //  SAVE ENTRY
        // ============================================================
        async function saveEntry() {
            const title = document.getElementById('modal-title').value.trim();

            const type = editType;
            const entry = {
                id: editId || 'entry_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                title: title,
                type: type,
                date: '',
                categoryId: getCategoryIdForType(type),
                tags: (document.getElementById('modal-tags')?.value || '')
                    .split(',').map(t => t.trim()).filter(Boolean)
            };

            if (type === 'book') {
                entry.author = document.getElementById('modal-author')?.value?.trim() || '';
                entry.startDate = document.getElementById('modal-start')?.value || '';
                entry.date = entry.startDate;
                if (editId) {
                    entry.endDate = document.getElementById('modal-end')?.value || '';
                    entry.rating = parseInt(document.getElementById('modal-rating')?.value) || 0;
                } else {
                    entry.endDate = '';
                    entry.rating = 0;
                }
                entry.status = entry.endDate ? 'Completado' : 'Leyendo';
            } else if (type === 'movie') {
                entry.date = document.getElementById('modal-date')?.value || '';
                if (editId) {
                    entry.rating = parseInt(document.getElementById('modal-rating')?.value) || 0;
                    entry.notes = document.getElementById('modal-notes')?.value?.trim() || '';
                } else {
                    entry.rating = 0;
                    entry.notes = '';
                }
            } else if (type === 'series') {
                entry.startDate = document.getElementById('modal-start')?.value || '';
                entry.date = entry.startDate;
                if (editId) {
                    entry.endDate = document.getElementById('modal-end')?.value || '';
                    let status = document.getElementById('modal-status')?.value || 'Viendo';
                    // Si se indica fecha de finalización y el estado se dejó en el
                    // valor por defecto "Viendo", se asume completada automáticamente.
                    if (entry.endDate && status === 'Viendo') status = 'Completada';
                    entry.status = status;
                    entry.rating = parseInt(document.getElementById('modal-rating')?.value) || 0;
                } else {
                    entry.status = 'Viendo';
                    entry.endDate = '';
                    entry.rating = 0;
                }
            } else if (type === 'game') {
                entry.startDate = document.getElementById('modal-start')?.value || '';
                entry.date = entry.startDate;
                if (editId) {
                    entry.endDate = document.getElementById('modal-end')?.value || '';
                    let status = document.getElementById('modal-status')?.value || 'Jugando';
                    if (entry.endDate && status === 'Jugando') status = 'Completado';
                    entry.status = status;
                    entry.rating = parseInt(document.getElementById('modal-rating')?.value) || 0;
                } else {
                    entry.status = 'Jugando';
                    entry.endDate = '';
                    entry.rating = 0;
                }
            } else if (type === 'travel') {
                entry.destination = document.getElementById('modal-destination')?.value?.trim() || '';
                entry.startDate = document.getElementById('modal-start')?.value || '';
                entry.endDate = document.getElementById('modal-end')?.value || '';
                entry.date = entry.startDate || entry.endDate || '';
                entry.companions = document.getElementById('modal-companions')?.value?.trim() || '';
                entry.notes = document.getElementById('modal-notes')?.value?.trim() || '';
                entry.expenses = window._expenses || [];
            } else if (type === 'work') {
                entry.company = document.getElementById('modal-company')?.value?.trim() || '';
                entry.position = document.getElementById('modal-position')?.value?.trim() || '';
                entry.startDate = document.getElementById('modal-start')?.value || '';
                entry.endDate = document.getElementById('modal-end')?.value || '';
                entry.startTime = document.getElementById('modal-start-time')?.value || '';
                entry.endTime = document.getElementById('modal-end-time')?.value || '';
                entry.date = entry.startDate || entry.endDate || '';
                entry.schedule = (entry.startTime ? entry.startTime : '') + (entry.endTime ? ' - ' + entry.endTime : '');
                entry.cotizationType = document.getElementById('modal-cotization-type')?.value || 'general';
                const cotizedDaysRaw = document.getElementById('modal-cotized-days')?.value;
                entry.cotizedDays = cotizedDaysRaw === '' || cotizedDaysRaw == null ? null : Math.max(0, parseInt(cotizedDaysRaw, 10) || 0);
                entry.salary = parseFloat(document.getElementById('modal-salary')?.value) || null;
                entry.notes = document.getElementById('modal-notes')?.value?.trim() || '';
                entry.status = entry.endDate ? 'Completado' : 'Trabajo actual';
            } else if (type === 'project') {
                entry.description = document.getElementById('modal-desc')?.value?.trim() || '';
                entry.projectCategory = document.getElementById('modal-category')?.value || 'Trabajo';
                entry.priority = document.getElementById('modal-priority')?.value || 'media';
                entry.status = document.getElementById('modal-project-status')?.value || 'Pendiente';
                entry.startDate = document.getElementById('modal-start')?.value || '';
                entry.endDate = document.getElementById('modal-end')?.value || '';
                entry.date = entry.startDate || entry.endDate || '';
                const tasksRaw = document.getElementById('modal-tasks')?.value?.split('\n').filter(t => t.trim()) || [];
                entry.tasks = tasksRaw.map(t => {
                    const done = /(?:^|\s)(?:✓|✔|☑|\[x\]|x)$/i.test(t.trim());
                    return { text: t.replace(/(?:\s+(?:✓|✔|☑|\[x\]|x))$/i, '').trim(), done };
                });
                const featuresRaw = document.getElementById('modal-features')?.value?.split('\n').filter(f => f.trim()) || [];
                entry.features = featuresRaw.map(f => {
                    const idx = f.indexOf(':');
                    return idx === -1 ? { label: f.trim(), value: '' } : { label: f.slice(0, idx).trim(), value: f.slice(idx + 1).trim() };
                });
                entry.notes = document.getElementById('modal-notes')?.value?.trim() || '';
            } else if (type === 'event') {
                entry.eventType = document.getElementById('modal-event-type')?.value || 'otro';
                entry.date = document.getElementById('modal-date')?.value || '';
                entry.time = document.getElementById('modal-time')?.value || '';
                entry.place = document.getElementById('modal-place')?.value?.trim() || '';
                entry.notes = document.getElementById('modal-notes')?.value?.trim() || '';
            } else if (type === 'place') {
                entry.date = document.getElementById('modal-date')?.value || '';
                entry.notes = document.getElementById('modal-notes')?.value?.trim() || '';
            } else if (type === 'document') {
                entry.date = document.getElementById('modal-date')?.value || '';
                entry.notes = document.getElementById('modal-notes')?.value?.trim() || '';
            } else if (type === 'goal') {
                entry.term = document.getElementById('modal-term')?.value || 'short';
                entry.goalType = document.getElementById('modal-goal-type')?.value || 'simple';
                if (entry.goalType === 'numeric') {
                    entry.currentValue = parseFloat(document.getElementById('modal-goal-current')?.value) || 0;
                    entry.targetValue = parseFloat(document.getElementById('modal-goal-target')?.value) || 0;
                    entry.unit = document.getElementById('modal-goal-unit')?.value?.trim() || '';
                }
                entry.status = document.getElementById('modal-goal-status')?.value || 'Pendiente';
                const milestonesRaw = document.getElementById('modal-goal-milestones')?.value?.split('\n').filter(t => t.trim()) || [];
                entry.milestones = milestonesRaw.map(t => {
                    const done = /(?:^|\s)(?:✓|✔|☑|\[x\]|x)$/i.test(t.trim());
                    return { text: t.replace(/(?:\s+(?:✓|✔|☑|\[x\]|x))$/i, '').trim(), done };
                });
                entry.tags = (document.getElementById('modal-tags')?.value || '')
                    .split(',').map(t => t.trim()).filter(Boolean);
                entry.notes = document.getElementById('modal-notes')?.value?.trim() || '';
                entry.date = entry.date || todayISO();
            } else if (type === 'subscription' || type === 'fixed_expense') {
                entry.amount = parseFloat(document.getElementById('modal-recurring-amount')?.value) || 0;
                entry.renewalDay = parseInt(document.getElementById('modal-recurring-day')?.value) || 1;
                entry.active = document.getElementById('modal-recurring-active')?.value !== 'false';
                entry.date = entry.date || todayISO();
            } else if (type === 'birthday') {
                entry.firstName = document.getElementById('modal-bday-name')?.value?.trim() || '';
                entry.lastName = document.getElementById('modal-bday-lastname')?.value?.trim() || '';
                entry.birthDate = document.getElementById('modal-bday-date')?.value || '';
                entry.title = (entry.firstName + ' ' + entry.lastName).trim() || entry.title || 'Cumpleaños';
                entry.date = entry.birthDate;
                entry.tags = (document.getElementById('modal-tags')?.value || '')
                    .split(',').map(t => t.trim()).filter(Boolean);
            }

            if (editId) {
                const idx = entries.findIndex(e => e.id === editId);
                if (idx >= 0) entries[idx] = entry;
            } else {
                entries.push(entry);
            }

            entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            filteredEntries = [...entries];
            closeModal();
            render();
            try {
                await saveData();
                showToast('Guardado');
            } catch (err) {
                console.error('Error guardando la entrada en Supabase:', err);
                showToast('No se pudo guardar en la nube. Revisa tu conexión.', true);
            }
        }

        function getCategoryIdForType(type) {
            const map = {
                book: 'cat_libro',
                movie: 'cat_pelicula',
                series: 'cat_serie',
                game: 'cat_videojuego',
                travel: 'cat_viaje',
                work: 'cat_trabajo',
                project: 'cat_proyecto',
                event: 'cat_evento',
                restaurant: 'cat_restaurante',
                place: 'cat_lugar',
                document: 'cat_general',
                goal: 'cat_general',
                birthday: 'cat_general',
                subscription: 'cat_suscripcion',
                fixed_expense: 'cat_gasto_fijo'
            };
            const id = map[type] || 'cat_general';
            return categories.find(c => c.id === id)?.id || 'cat_general';
        }

        // ============================================================
        //  DELETE ENTRY
        // ============================================================
        async function deleteEntry(id) {
            if (!confirm('¿Eliminar esta entrada?')) return;
            entries = entries.filter(e => e.id !== id);
            filteredEntries = [...entries];
            closeModal();
            render();
            try {
                await saveData();
                showToast('Eliminado');
            } catch (err) {
                console.error('Error eliminando la entrada en Supabase:', err);
                showToast('No se pudo eliminar en la nube. Revisa tu conexión.', true);
            }
        }

        // ============================================================
        //  EXPENSE ROWS (TRAVEL)
        // ============================================================
        window._expenses = [];

        function renderExpenseRow(exp, index) {
            return `
                <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">
                    <input class="modal-input" style="flex:2" value="${exp.description || ''}" placeholder="Concepto" onchange="updateExpense(${index}, 'description', this.value)">
                    <input class="modal-input" style="flex:1" type="number" value="${exp.amount || ''}" placeholder="€" onchange="updateExpense(${index}, 'amount', this.value)">
                    <button onclick="removeExpense(${index})" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:18px">✕</button>
                </div>`;
        }

        function addExpenseRow() {
            const list = document.getElementById('expenses-list');
            if (!list) return;
            const idx = window._expenses.length;
            window._expenses.push({ description: '', amount: 0 });
            list.insertAdjacentHTML('beforeend', renderExpenseRow({ description: '', amount: 0 }, idx));
            updateExpenseTotal();
        }

        function updateExpense(index, field, value) {
            if (!window._expenses[index]) return;
            window._expenses[index][field] = field === 'amount' ? parseFloat(value) || 0 : value;
            updateExpenseTotal();
        }

        function removeExpense(index) {
            window._expenses.splice(index, 1);
            renderExpensesList();
        }

        function renderExpensesList() {
            const list = document.getElementById('expenses-list');
            if (!list) return;
            list.innerHTML = window._expenses.map((exp, i) => renderExpenseRow(exp, i)).join('');
            updateExpenseTotal();
        }

        function updateExpenseTotal() {
            const totalEl = document.getElementById('expenses-total');
            if (!totalEl) return;
            const total = window._expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
            totalEl.textContent = 'Total: ' + total.toLocaleString('es-ES') + '€';
        }

        // ============================================================
        //  EXPORT / IMPORT
        // ============================================================
        // Única fuente de verdad para lo que entra en una copia de seguridad
        // completa — exactamente los mismos campos que doSaveData() manda a
        // Supabase (ver mergedData ahí), para que "Exportar datos" nunca se
        // quede corto de algo que sí se está guardando en la nube. Antes
        // había tres listas de campos distintas (este botón, el de Centro
        // resumen y el propio guardado) que se habían ido desincronizando
        // según se añadían secciones nuevas.
        function buildFullBackupPayload() {
            return {
                entries, categories, userName, investmentData, notes, prompts, inbox,
                financeIncome, financeProfile, plannedTrips, weeklyTasks,
                collectibleCategories, collectibles, dayPlanner, studies, links,
                linkCategories, blurFinances, fantasyData, apuntes,
                exportedAt: new Date().toISOString()
            };
        }

        function applyBackupPayload(data) {
            if (!data || typeof data !== 'object') return;
            if (data.entries) entries = data.entries;
            if (data.categories) categories = data.categories;
            if (data.userName) userName = data.userName;
            if (data.notes) notes = data.notes;
            if (data.prompts) prompts = data.prompts;
            if (data.investmentData) { investmentData = data.investmentData; migrateInvestmentData(); }
            if (data.inbox) inbox = data.inbox;
            if (data.financeIncome) financeIncome = data.financeIncome;
            if (data.financeProfile) financeProfile = data.financeProfile;
            if (data.plannedTrips) plannedTrips = data.plannedTrips;
            if (data.weeklyTasks) weeklyTasks = Array.isArray(data.weeklyTasks) ? data.weeklyTasks : [];
            if (data.collectibleCategories) collectibleCategories = data.collectibleCategories;
            if (data.collectibles) collectibles = data.collectibles;
            if (data.dayPlanner) dayPlanner = data.dayPlanner;
            if (data.studies) studies = data.studies;
            if (data.links) links = data.links;
            if (data.linkCategories) linkCategories = data.linkCategories;
            if (typeof data.blurFinances === 'boolean') blurFinances = data.blurFinances;
            if (data.fantasyData) { fantasyData = data.fantasyData; fantasyDataFromCloud = true; }
            if (data.apuntes) { apuntes = data.apuntes; apuntesDirty = true; }
            filteredEntries = [...entries];
        }

        function exportData() {
            const data = buildFullBackupPayload();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `bitacora_${new Date().toISOString().slice(0,10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Exportado');
        }

        function importData(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    applyBackupPayload(data);
                    render();
                    updatePageTitle();
                    try {
                        await saveData();
                        showToast('Importado correctamente');
                    } catch (saveErr) {
                        console.error('Error guardando la importación en Supabase:', saveErr);
                        showToast('Importado localmente, pero no se pudo guardar en la nube.', true);
                    }
                } catch (err) {
                    showToast('Error al importar', true);
                }
            };
            reader.readAsText(file);
            event.target.value = '';
        }

        // ============================================================
        //  FANTASY EXPORT / IMPORT
        // ============================================================
        function exportFantasyData() {
            const blob = new Blob([JSON.stringify(fantasyData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'fantasy_' + new Date().toISOString().slice(0, 10) + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('Fantasy exportado');
        }

        function importFantasyData(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    if (!data.usuarios || !data.transacciones) {
                        showToast('El archivo no tiene el formato esperado de Fantasy', true);
                        return;
                    }
                    fantasyData = data;
                    recalcFantasyBalances();
                    saveFantasyData();
                    document.getElementById('content').innerHTML = renderFantasy();
                    renderAllFantasyCharts();
                    showToast('Fantasy importado correctamente');
                } catch (err) {
                    showToast('Error al importar el archivo de Fantasy', true);
                }
            };
            reader.readAsText(file);
            event.target.value = '';
        }


        // ============================================================
        //  FANTASY TEXT IMPORT (paste block, from screenshot translation)
        // ============================================================
        function processFantasyTextImport() {
            const ta = document.getElementById('fantasy-text-import');
            const raw = ta.value.trim();
            if (!raw) { showToast('Pega primero el texto a importar', true); return; }
            const ensureUser = nombre => {
                if (nombre !== 'LALIGA' && !fantasyData.usuarios.find(u => u.nombre === nombre)) {
                    fantasyData.usuarios.push({ nombre, efectivo: 100000000, valor_plantilla: 100000000 });
                }
            };
            const isDuplicate = t => fantasyData.transacciones.some(e => e.jugador === t.jugador &&
                e.precio === t.precio && e.fecha === t.fecha && e.comprador === t.comprador &&
                e.vendedor === t.vendedor);
            let added = 0, users = 0, errors = 0, duplicates = 0, ignoradas = 0;
            raw.split('\n').map(l => l.trim()).filter(Boolean).forEach((line, i) => {
                // Operaciones tipo "(usuario) shielded (jugador)" no tienen ningún efecto
                // económico (protección de cláusula): se ignoran sin contar como error.
                if (/\bshielded\b/i.test(line)) { ignoradas++; return; }

                const p = line.split('|').map(s => s.trim());
                const tipo = (p[0] || '').toUpperCase();
                if (tipo === 'NUEVO' && p.length >= 3) {
                    const before = fantasyData.usuarios.length;
                    ensureUser(p[2]);
                    if (fantasyData.usuarios.length > before) users++;
                } else if ((tipo === 'COMPRA' || tipo === 'VENTA') && p.length >= 5) {
                    const precio = parseFloat(p[4].replace(/[^\d.-]/g, ''));
                    if (isNaN(precio)) { errors++; return; }
                    const nuevaTx = {
                        jugador: p[3],
                        precio,
                        fecha: p[1],
                        comprador: tipo === 'COMPRA' ? p[2] : 'LALIGA',
                        vendedor: tipo === 'COMPRA' ? 'LALIGA' : p[2]
                    };
                    if (isDuplicate(nuevaTx)) { duplicates++; return; }
                    ensureUser(p[2]);
                    fantasyData.transacciones.push(Object.assign({
                        id: 'tx_text_' + Date.now() + '_' + i,
                        tipo: tipo === 'COMPRA' ? 'compra' : 'venta',
                        gastoClausula: 0
                    }, nuevaTx));
                    added++;
                } else if (tipo === 'TRASPASO' && p.length >= 6) {
                    const precio = parseFloat(p[5].replace(/[^\d.-]/g, ''));
                    if (isNaN(precio)) { errors++; return; }
                    const nuevaTx = { jugador: p[4], precio, fecha: p[1], comprador: p[2], vendedor: p[3] };
                    if (isDuplicate(nuevaTx)) { duplicates++; return; }
                    ensureUser(p[2]);
                    ensureUser(p[3]);
                    fantasyData.transacciones.push(Object.assign({
                        id: 'tx_text_' + Date.now() + '_' + i,
                        tipo: 'compra',
                        gastoClausula: 0
                    }, nuevaTx));
                    added++;
                } else if (tipo === 'PREMIO' && p.length >= 5) {
                    const precio = parseFloat(p[4].replace(/[^\d.-]/g, ''));
                    if (isNaN(precio)) { errors++; return; }
                    const jornada = p[3];
                    const nuevaTx = { jugador: 'Premio jornada ' + jornada, precio, fecha: p[1], comprador: 'LALIGA', vendedor: p[2] };
                    if (isDuplicate(nuevaTx)) { duplicates++; return; }
                    ensureUser(p[2]);
                    fantasyData.transacciones.push(Object.assign({
                        id: 'tx_premio_' + Date.now() + '_' + i,
                        tipo: 'premio',
                        gastoClausula: 0
                    }, nuevaTx));
                    added++;
                } else { errors++; }
            });
            recalcFantasyBalances();
            saveFantasyData();
            ta.value = '';
            document.getElementById('content').innerHTML = renderFantasy();
            renderAllFantasyCharts();
            const summaryEl = document.getElementById('fantasy-import-summary');
            if (summaryEl) {
                summaryEl.innerHTML = `<strong>${added}</strong> operaciones y <strong>${users}</strong> usuarios nuevos importados` +
                    (duplicates ? `, ${duplicates} duplicadas omitidas` : '') +
                    (ignoradas ? `, ${ignoradas} líneas ignoradas` : '') +
                    (errors ? `, <span style="color:#dc2626">${errors} líneas con error</span>` : '');
            }
        }

        // ============================================================
        //  RENDER
        // ============================================================
        function render() {
            invalidateLinkableIndex();
            const content = document.getElementById('content');
            if (currentView !== 'fantasy') document.body.classList.remove('fantasy-green-page');
            if (currentView === 'calendar') content.innerHTML = renderCalendar();
            else if (currentView === 'home') content.innerHTML = renderHome();
            else if (currentView === 'culture') content.innerHTML = renderCulture();
            else if (currentView === 'travels') { content.innerHTML = renderTravels();
                if (window._openTripId && tripManagerTab === 'documentos') loadTripDocuments(window._openTripId); }
            else if (currentView === 'work') content.innerHTML = renderWork();
            else if (currentView === 'projects') content.innerHTML = renderProjects();
            else if (currentView === 'events') content.innerHTML = renderEvents();
            else if (currentView === 'documents') { content.innerHTML = renderDocuments();
                loadDocuments(); } else if (currentView === 'finances') content.innerHTML = renderFinances();
            else if (currentView === 'tags') content.innerHTML = renderTagsView();
            else if (currentView === 'fantasy') { content.innerHTML = renderFantasy();
                renderAllFantasyCharts(); } else if (currentView === 'vault') content.innerHTML = renderVault();
            else if (currentView === 'notes') content.innerHTML = renderNotes();
            else if (currentView === 'goals') content.innerHTML = renderGoals();
            else if (currentView === 'planner') content.innerHTML = renderPlanner();
            else if (currentView === 'collectibles') content.innerHTML = renderCollectibles();
            else if (currentView === 'friends') { content.innerHTML = renderFriendsView();
                loadFriendsViewData(); }
            else if (currentView === 'studies') content.innerHTML = renderStudies();
            else if (currentView === 'links') content.innerHTML = renderLinks();
            else if (currentView === 'settings') content.innerHTML = renderSettings();
            updateAddButton();
            updateSidebarPrivacy();

            if (currentView === 'home' && typeof v23RenderSummaryDashboard === 'function') {
                requestAnimationFrame(() => v23RenderSummaryDashboard());
            }

            if(currentView==='finances' && financeSubView==='indexado') {
                setTimeout(() => {
                    reorderInvestmentCharts();
                    renderInvestmentCharts();
                }, 0);
            }
        }

        // ============================================================
        //  RENDER: CALENDAR
        // ============================================================
        let calYear = new Date().getFullYear();
        let calMonth = new Date().getMonth();
        let calViewMode = 'month'; // 'day' | 'week' | 'month'
        let calSelectedDate = new Date().toISOString().slice(0, 10);
        const CAL_MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        const CAL_DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

        function getRecurringCalendarEntries(dateStr) {
            const day = Number(String(dateStr).slice(8, 10));
            if (!day) return [];
            const year = Number(String(dateStr).slice(0, 4));
            const month = Number(String(dateStr).slice(5, 7));
            const daysInMonth = new Date(year, month, 0).getDate();
            return entries.filter(e => {
                if (!((e.type === 'subscription' || e.type === 'fixed_expense') && e.active !== false)) return false;
                const renewalDay = Number(e.renewalDay);
                if (!renewalDay) return false;
                return Math.min(renewalDay, daysInMonth) === day;
            }).map(e => ({ ...e, date: dateStr, _recurringPayment: true }));
        }

        function buildEntriesByDate(year) {
            const entriesByDate = {};
            entries.forEach(e => {
                if (NON_CALENDAR_TYPES.includes(e.type)) return;
                if (e.type === 'birthday' && e.birthDate) {
                    const [, m, d] = e.birthDate.split('-');
                    const projectedDate = `${year}-${m}-${d}`;
                    if (!entriesByDate[projectedDate]) entriesByDate[projectedDate] = [];
                    entriesByDate[projectedDate].push(e);
                    return;
                }
                const date = e.date || e.startDate || '';
                if (!date) return;
                if (!entriesByDate[date]) entriesByDate[date] = [];
                entriesByDate[date].push(e);
            });
            return entriesByDate;
        }

        function greetingText() {
            const h = new Date().getHours();
            if (h < 6) return 'buenas noches.';
            if (h < 13) return 'buenos días.';
            if (h < 20) return 'buenas tardes.';
            return 'buenas noches.';
        }

        function setCalView(mode) {
            calViewMode = mode;
            render();
        }

        function jumpToToday() {
            const t = new Date();
            calYear = t.getFullYear();
            calMonth = t.getMonth();
            calSelectedDate = t.toISOString().slice(0, 10);
            render();
        }

        function selectCalDate(dateStr) {
            calSelectedDate = dateStr;
            window._selectedDate = dateStr;
            const d = new Date(dateStr + 'T12:00:00');
            calYear = d.getFullYear();
            calMonth = d.getMonth();
            render();
        }

        // ============================================================
        //  VISTA ANUAL (calendario de puntos, un punto por día)
        // ============================================================
        let yearCalCompareMode = false;

        function abrirCalendarioAnual() {
            yearCalYear = new Date().getFullYear();
            yearCalCompareMode = false;
            showModal(renderCalendarioAnual());
        }

        function refrescarCalendarioAnual() {
            const sheet = document.querySelector('#modal-container .modal-sheet');
            if (sheet) sheet.innerHTML = renderCalendarioAnual();
        }

        function cambiarYearCal(delta) {
            yearCalYear += delta;
            refrescarCalendarioAnual();
        }

        // Anillo verde de "hoy" — el único que sigue siendo un reborde en vez
        // de rellenar la bolita entera, para que siga siendo identificable
        // pase lo que pase con el color de fondo en cada vista.
        const ANILLO_HOY = '0 0 0 1.2px var(--bg-modal), 0 0 0 2.7px #22c55e';

        // En la vista de comparación, trabajado/viaje ya no son un reborde:
        // colorean la bolita entera (más visual). Cada combinación tiene su
        // propia clase para poder animarlo con transición suave.
        function claseCompareDot(trabajado, viaje) {
            if (trabajado && viaje) return 'year-dot-worked-travel';
            if (trabajado) return 'year-dot-worked';
            if (viaje) return 'year-dot-travel';
            return '';
        }

        // No se regenera todo el modal (eso crearía puntos nuevos de cero y
        // el cambio se vería como un salto brusco): se cambian las clases de
        // cada punto ya existente en su sitio, así la transición CSS de
        // .year-dot (color de fondo/borde) anima de verdad entre una vista y
        // otra en vez de saltar de golpe.
        function toggleYearCalCompare() {
            yearCalCompareMode = !yearCalCompareMode;
            document.querySelectorAll('.year-cal-grid-wrap .year-dot[title]').forEach(dot => {
                dot.classList.remove('year-dot-worked', 'year-dot-travel', 'year-dot-worked-travel');
                if (yearCalCompareMode) {
                    const dateStr = dot.getAttribute('title');
                    const cls = claseCompareDot(esDiaTrabajado(dateStr), esDiaDeViaje(dateStr));
                    if (cls) dot.classList.add(cls);
                }
            });
            const btn = document.querySelector('.year-cal-compare-btn');
            if (btn) btn.classList.toggle('active', yearCalCompareMode);
            const legend = document.querySelector('.year-cal-legend');
            if (legend) legend.innerHTML = renderYearCalLegendHtml();
        }

        function renderYearCalLegendHtml() {
            return `
                ${yearCalCompareMode ? `
                    <div class="year-cal-legend-item"><span class="year-dot year-dot-worked year-cal-legend-dot"></span> Día trabajado</div>
                    <div class="year-cal-legend-item"><span class="year-dot year-dot-travel year-cal-legend-dot"></span> Día de viaje</div>
                    <div class="year-cal-legend-item"><span class="year-dot year-dot-future year-cal-legend-dot"></span> Día futuro</div>
                ` : `
                    <div class="year-cal-legend-item"><span class="year-dot year-cal-legend-dot"></span> Día transcurrido</div>
                    <div class="year-cal-legend-item"><span class="year-dot year-dot-future year-cal-legend-dot"></span> Día futuro</div>
                `}
                <div class="year-cal-legend-item"><span class="year-dot year-cal-legend-dot" style="box-shadow:${ANILLO_HOY}"></span> Hoy</div>
            `;
        }

        // Punto 2 del rediseño: día trabajado = dentro del rango de un
        // contrato ("Trabajo", startDate–endDate, sin fecha fin = sigue
        // vigente) y que no sea fin de semana — los fines de semana nunca se
        // marcan como trabajados aquí, aunque el contrato siga activo.
        function esDiaTrabajado(dateStr) {
            const dow = new Date(dateStr + 'T12:00:00').getDay();
            if (dow === 0 || dow === 6) return false;
            return entries.some(e => e.type === 'work' && e.startDate &&
                dateStr >= e.startDate && dateStr <= (e.endDate || '9999-12-31'));
        }

        function esDiaDeViaje(dateStr) {
            return entries.some(e => e.type === 'travel' && e.startDate && e.endDate &&
                dateStr >= e.startDate && dateStr <= e.endDate);
        }

        function renderCalendarioAnual() {
            const anio = yearCalYear;
            const hoy = todayISO();
            const maxDias = 31;

            let headerDias = '';
            for (let d = 1; d <= maxDias; d++) {
                headerDias += `<span>${(d === 1 || d % 5 === 0) ? d : ''}</span>`;
            }

            let filas = '';
            for (let m = 0; m < 12; m++) {
                const nombreMes = new Date(anio, m, 1).toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
                const diasMes = new Date(anio, m + 1, 0).getDate();
                let celdas = '';
                for (let d = 1; d <= maxDias; d++) {
                    if (d > diasMes) { celdas += `<div class="year-cal-cell"></div>`; continue; }
                    const dateStr = `${anio}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    const esHoy = dateStr === hoy;
                    const esFuturo = dateStr > hoy;
                    let cls = 'year-dot' + (esFuturo ? ' year-dot-future' : '');
                    if (yearCalCompareMode) {
                        const compareCls = claseCompareDot(esDiaTrabajado(dateStr), esDiaDeViaje(dateStr));
                        if (compareCls) cls += ' ' + compareCls;
                    }
                    const estiloExtra = esHoy ? ` style="box-shadow:${ANILLO_HOY}"` : '';
                    celdas += `<div class="year-cal-cell"><span class="${cls}" title="${dateStr}"${estiloExtra}></span></div>`;
                }
                filas += `<div class="year-cal-row"><div class="year-cal-month-label">${nombreMes}</div><div class="year-cal-days">${celdas}</div></div>`;
            }

            return `
            <div class="year-cal-modal">
                <div class="modal-title">
                    <span style="display:flex;align-items:center;gap:10px">
                        <button class="cal-nav-arrow" onclick="cambiarYearCal(-1)">‹</button>
                        ${anio}
                        <button class="cal-nav-arrow" onclick="cambiarYearCal(1)">›</button>
                        <button class="year-cal-compare-btn ${yearCalCompareMode ? 'active' : ''}" onclick="toggleYearCalCompare()" title="Cambiar vista">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="12" r="6.5"/><circle cx="15" cy="12" r="6.5"/></svg>
                        </button>
                    </span>
                    <button class="modal-close" onclick="closeModal()">✕</button>
                </div>
                <div class="year-cal-body">
                    <div class="year-cal-grid-wrap">
                        <div class="year-cal-header">
                            <div class="year-cal-header-spacer"></div>
                            <div class="year-cal-header-days">${headerDias}</div>
                        </div>
                        ${filas}
                    </div>
                </div>
                <div class="year-cal-legend">${renderYearCalLegendHtml()}</div>
            </div>`;
        }

        // ============================================================
        //  RENDER: HOME (calendario estilo Stoic)
        // ============================================================
        // "En este día, hace...": entradas y notas de exactamente el mismo día
        // y mes (en años anteriores). Se guarda id+tipo (no solo título) para
        // poder abrir directamente la entrada/nota original al pulsarla.
        // Fija el mediodía al parsear fechas sin hora ("YYYY-MM-DD") para que
        // getMonth()/getDate() no se desplacen un día en zonas horarias por
        // detrás de UTC (mismo patrón ya usado en el resto de la app).
        function parseFechaSegura(raw) {
            const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(raw);
            return new Date(soloFecha ? raw + 'T12:00:00' : raw);
        }

        function buildOnThisDayItems() {
            const hoy = new Date();
            const mes = hoy.getMonth(), dia = hoy.getDate(), anioActual = hoy.getFullYear();
            const esMismoDia = d => d && d.getMonth() === mes && d.getDate() === dia && d.getFullYear() < anioActual;
            const items = [];

            (Array.isArray(entries) ? entries : []).forEach(e => {
                const raw = e.date || e.startDate || e.createdAt;
                if (!raw) return;
                const d = parseFechaSegura(raw);
                if (isNaN(d) || !esMismoDia(d)) return;
                items.push({
                    id: e.id,
                    kind: 'entry',
                    title: e.title || e.destination || e.company || 'Entrada',
                    type: (TYPE_LABELS[e.type] || e.type || 'Entrada'),
                    year: d.getFullYear()
                });
            });

            (Array.isArray(notes) ? notes : []).forEach(n => {
                const raw = n.date || n.createdAt;
                if (!raw) return;
                const d = parseFechaSegura(raw);
                if (isNaN(d) || !esMismoDia(d)) return;
                items.push({
                    id: n.id,
                    kind: 'note',
                    title: n.title || (typeof formatNoteTitle === 'function' ? formatNoteTitle(n.date) : 'Nota'),
                    type: 'Nota',
                    year: d.getFullYear()
                });
            });

            return items.sort((a, b) => b.year - a.year);
        }

        function openOnThisDayItem(kind, id) {
            if (kind === 'entry' && typeof openEntryDetail === 'function') openEntryDetail(id);
            else if (kind === 'note' && typeof openReadNote === 'function') openReadNote(id);
        }

        function renderOnThisDayCard() {
            const items = buildOnThisDayItems();
            if (!items.length) return '';
            const anioActual = new Date().getFullYear();
            return `<div class="card" style="margin-bottom:16px">
                <div class="card-title" style="margin-bottom:10px">En este día, hace...</div>
                <div style="display:flex;flex-direction:column;gap:10px">
                    ${items.map(it => {
                        const anios = anioActual - it.year;
                        return `<div style="display:flex;align-items:baseline;gap:10px;cursor:pointer" onclick="openOnThisDayItem('${it.kind}','${it.id}')">
                            <span style="font-size:11px;font-weight:800;color:var(--text-secondary);white-space:nowrap;min-width:56px">${anios} año${anios === 1 ? '' : 's'}</span>
                            <div style="min-width:0">
                                <div style="font-size:13px;font-weight:700;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(it.title)}</div>
                                <div style="font-size:11px;color:var(--text-secondary)">${escapeHtml(it.type)}</div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
        }

        function renderCalendar() {
            let html = `<div class="cal-home">`;
            html += renderOnThisDayCard();
            html += `<div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
                <div class="culture-tabs" style="margin-bottom:0">
                    ${[['day','Día'],['week','Semana'],['month','Mes']].map(([id,label]) => `
                        <button class="culture-tab ${calViewMode===id?'active':''}" onclick="setCalView('${id}')">${label}</button>
                    `).join('')}
                </div>
                <button class="year-cal-btn" onclick="abrirCalendarioAnual()" title="Vista anual">
                    <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="3" cy="3" r="1.4" fill="currentColor"/><circle cx="8" cy="3" r="1.4" fill="currentColor"/><circle cx="13" cy="3" r="1.4" fill="currentColor"/><circle cx="3" cy="8" r="1.4" fill="currentColor"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><circle cx="13" cy="8" r="1.4" fill="currentColor"/><circle cx="3" cy="13" r="1.4" fill="currentColor"/><circle cx="8" cy="13" r="1.4" fill="currentColor"/><circle cx="13" cy="13" r="1.4" fill="currentColor"/></svg>
                </button>
            </div>`;

            const body = calViewMode === 'month' ? renderCalMonth() : calViewMode === 'week' ? renderCalWeek() : renderCalDay();
            html += `<div class="cal-view-anim">${body}</div>`;

            html += `</div>`;
            return html;
        }

        function changeMonth(delta) {
            calMonth += delta;
            if (calMonth < 0) { calMonth = 11;
                calYear--; }
            if (calMonth > 11) { calMonth = 0;
                calYear++; }
            render();
        }

        function renderCalMonth() {
            const entriesByDate = buildEntriesByDate(calYear);

            for (let d = 1; d <= new Date(calYear, calMonth + 1, 0).getDate(); d++) {
                const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const recurring = getRecurringCalendarEntries(dateStr);
                if (recurring.length) entriesByDate[dateStr] = [...(entriesByDate[dateStr] || []), ...recurring];
            }

            const today = new Date().toISOString().slice(0, 10);
            const dayNames = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

            const firstDay = new Date(calYear, calMonth, 1).getDay();
            const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
            const offset = (firstDay + 6) % 7;

            const prevMonth = new Date(calYear, calMonth, 0);
            const daysInPrevMonth = prevMonth.getDate();

            let html = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <button class="cal-nav-arrow" onclick="changeMonth(-1)">‹</button>
                <span style="font-size:17px;font-weight:700;color:var(--text-primary)">${CAL_MONTH_NAMES[calMonth]} ${calYear}</span>
                <button class="cal-nav-arrow" onclick="changeMonth(1)">›</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px">`;

            dayNames.forEach(d => {
                html +=
                    `<div style="text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-secondary);padding:6px 0 10px 0">${d}</div>`;
            });

            for (let i = 0; i < offset; i++) {
                const day = daysInPrevMonth - offset + i + 1;
                html +=
                    `<div style="background:transparent;border-radius:16px;padding:6px 4px 8px 4px;min-height:64px;text-align:center;border:1px solid transparent"><span style="font-size:13px;font-weight:700;opacity:0.3;color:var(--text-secondary)">${day}</span></div>`;
            }

            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr =
                    `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const isToday = dateStr === today;
                const isSelected = dateStr === window._selectedDate;
                const dayEntries = entriesByDate[dateStr] || [];

                const colors = [];
                const seen = new Set();
                dayEntries.forEach(e => {
                    const cat = categories.find(c => c.id === e.categoryId);
                    if (cat && !seen.has(cat.color)) {
                        seen.add(cat.color);
                        colors.push(cat.color);
                    }
                });

                const barsHtml = colors.slice(0, 4).map(color =>
                    `<span style="width:20px;height:3px;border-radius:4px;display:block;background:${color}"></span>`
                ).join('');

                const extra = colors.length > 4 ?
                    `<span style="width:12px;height:3px;border-radius:4px;display:block;background:var(--text-muted);font-size:7px;text-align:center;color:var(--text-secondary)">+${colors.length - 4}</span>` :
                    '';

                html += `
                <div class="cal-month-cell ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}" onclick="showDayEntries('${dateStr}')">
                    <span style="font-size:13px;font-weight:700;display:block;margin-bottom:4px;color:var(--text-primary)">${d}</span>
                    <div style="display:flex;flex-direction:column;gap:2px;align-items:center">${barsHtml}${extra}</div>
                </div>`;
            }

            const totalDays = offset + daysInMonth;
            const remaining = (7 - (totalDays % 7)) % 7;
            for (let d = 1; d <= remaining; d++) {
                html +=
                    `<div style="background:transparent;border-radius:16px;padding:6px 4px 8px 4px;min-height:64px;text-align:center;border:1px solid transparent"><span style="font-size:13px;font-weight:700;opacity:0.3;color:var(--text-secondary)">${d}</span></div>`;
            }

            html += `</div>`;

            return html;
        }

        function changeWeek(delta) {
            const d = new Date(calSelectedDate + 'T12:00:00');
            d.setDate(d.getDate() + delta * 7);
            calSelectedDate = d.toISOString().slice(0, 10);
            calYear = d.getFullYear();
            calMonth = d.getMonth();
            render();
        }

        function renderCalWeek() {
            const base = new Date(calSelectedDate + 'T12:00:00');
            const dow = base.getDay();
            const monday = new Date(base);
            monday.setDate(base.getDate() - ((dow + 6) % 7));
            const today = new Date().toISOString().slice(0, 10);
            const entriesByDate = buildEntriesByDate(monday.getFullYear());

            let html = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <button class="cal-nav-arrow" onclick="changeWeek(-1)">‹</button>
                <span style="font-size:15px;font-weight:700;color:var(--text-primary)">Semana del ${monday.getDate()} de ${CAL_MONTH_NAMES[monday.getMonth()]}</span>
                <button class="cal-nav-arrow" onclick="changeWeek(1)">›</button>
            </div>
            <div class="cal-week-grid">`;

            for (let i = 0; i < 7; i++) {
                const d = new Date(monday);
                d.setDate(monday.getDate() + i);
                const dateStr = d.toISOString().slice(0, 10);
                const isToday = dateStr === today;
                const recurring = getRecurringCalendarEntries(dateStr);
                const dayEntries = [...(entriesByDate[dateStr] || []), ...recurring];

                html += `
                <div class="cal-week-col ${isToday ? 'is-today' : ''}" onclick="selectCalDate('${dateStr}');setCalView('day')">
                    <div class="cal-week-col-head">
                        <span>${CAL_DAY_LETTERS[d.getDay()]}</span>
                        <span class="cal-week-col-num">${d.getDate()}</span>
                    </div>
                    <div class="cal-week-col-items">
                        ${dayEntries.slice(0, 4).map(e => {
                            const cat = categories.find(c => c.id === e.categoryId);
                            const color = cat?.color || 'var(--text-secondary)';
                            return `<div class="cal-week-item" style="border-left-color:${color}">${escapeHtml(e.title || '')}</div>`;
                        }).join('') || '<div class="cal-week-empty">—</div>'}
                        ${dayEntries.length > 4 ? `<div class="cal-week-more">+${dayEntries.length - 4} más</div>` : ''}
                    </div>
                </div>`;
            }

            html += `</div>`;
            return html;
        }

        function changeDay(delta) {
            const d = new Date(calSelectedDate + 'T12:00:00');
            d.setDate(d.getDate() + delta);
            calSelectedDate = d.toISOString().slice(0, 10);
            calYear = d.getFullYear();
            calMonth = d.getMonth();
            render();
        }

        function renderCalDay() {
            const dateObj = new Date(calSelectedDate + 'T12:00:00');
            const dateLabel = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
            const body = renderDayEntries(calSelectedDate);

            return `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <button class="cal-nav-arrow" onclick="changeDay(-1)">‹</button>
                <span class="cal-day-title" style="font-size:15px;font-weight:700;color:var(--text-primary);text-transform:capitalize">${dateLabel}</span>
                <button class="cal-nav-arrow" onclick="changeDay(1)">›</button>
            </div>
            ${body || '<div class="empty-state"><div class="empty-icon">◷</div><div class="empty-title">Sin entradas</div><div class="empty-sub">No hay nada registrado este día.</div></div>'}`;
        }

        function showDayEntries(date) {
            window._selectedDate = date;
            calSelectedDate = date;
            render();

            const dateObj = new Date(date + 'T12:00:00');
            const weekday = dateObj.toLocaleDateString('es-ES', { weekday: 'long' });
            const restDate = dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
            const all = getDayAllEntries(date);
            const rows = all.length ? renderDayEntryRows(all) : `<div class="empty-state"><div class="empty-icon">◷</div><div class="empty-title">Sin entradas</div><div class="empty-sub">No hay nada registrado este día.</div></div>`;

            showModal(`
                <div class="modal-title day-modal-title">
                    <span><span class="day-modal-weekday">${weekday}</span>, ${restDate}:</span>
                    <button class="modal-close" onclick="closeModal()">✕</button>
                </div>
                <div class="day-modal-list">${rows}</div>
                <button class="day-modal-add-btn" style="margin-top:14px" onclick="openNewEntryForDay('${date}')">+ Añadir entrada este día</button>
            `);
        }

        // Deja elegir el tipo con el mismo buscador de captura rápida,
        // pero rellenando la fecha con el día sobre el que se pinchó.
        window._dayPrefillDate = null;
        function openNewEntryForDay(date) {
            window._dayPrefillDate = date;
            openCommandPalette('create');
        }

        function isBirthdayOnDate(entry, dateStr) {
            if (entry.type !== 'birthday' || !entry.birthDate) return false;
            const [, m1, d1] = entry.birthDate.split('-');
            const [, m2, d2] = dateStr.split('-');
            return m1 === m2 && d1 === d2;
        }

        function getDayAllEntries(date) {
            const dayEntries = entries.filter(e => {
                if (NON_CALENDAR_TYPES.includes(e.type)) return false;
                if (isBirthdayOnDate(e, date)) return true;
                return e.date === date || e.startDate === date;
            });
            const workDate=new Date(date+'T12:00:00');
            const weekend=workDate.getDay()===0||workDate.getDay()===6;
            const activeJobs=weekend?[]:entries.filter(e =>
                e.type === 'work' &&
                e.startDate && e.startDate <= date &&
                (!e.endDate || e.endDate >= date)
            );
            const recurringEntries = getRecurringCalendarEntries(date);
            return [...dayEntries, ...activeJobs, ...recurringEntries];
        }

        function renderDayEntryRows(all) {
            return all.map(e => {
                const cat = categories.find(c => c.id === e.categoryId);
                const color = cat?.color || 'var(--text-secondary)';
                const catName = cat?.name || 'Sin categoría';

                let titleHtml, metaHtml;

                if (e._recurringPayment) {
                    titleHtml = `Pago: ${e.title}`;
                    metaHtml = `${e.type === 'subscription' ? 'Suscripción' : 'Gasto fijo'} · ${financeMoney(e.amount)}`;
                } else if (e.type === 'work') {
                    const start = e.startTime || '';
                    const end = e.endTime || '';
                    const scheduleText = (start || end) ? ` de ${start || '--'} a ${end || '--'}` : '';
                    titleHtml = `Trabajando en ${e.company || 'empresa sin nombre'}${scheduleText}`;
                    metaHtml = e.position || catName;
                } else if (e.type === 'birthday') {
                    const years = e.birthDate ? new Date().getFullYear() - parseInt(e.birthDate.split('-')[0]) : '?';
                    titleHtml = `🎂 ${e.title} (${years} años)`;
                    metaHtml = 'Cumpleaños';
                } else {
                    titleHtml = e.title;
                    metaHtml = `${catName}${e.notes ? ' · ' + linkifyText(e.notes) : ''}`;
                }

                return `
                <div class="entry-item" onclick="openEntryDetail('${e.id}')">
                    <div class="entry-color-dot" style="background:${color}"></div>
                    <div class="entry-info">
                        <div class="entry-title">${titleHtml}</div>
                        <div class="entry-meta">${metaHtml}</div>
                    </div>
                    <div class="entry-actions">
                        <button class="delete" onclick="event.stopPropagation();deleteEntry('${e.id}')">✕</button>
                    </div>
                </div>`;
            }).join('');
        }

        function renderDayEntries(date) {
            const all = getDayAllEntries(date);
            if (!all.length) return '';
            return `<div class="day-entry-list">${renderDayEntryCards(all)}</div>`;
        }

        // Tarjetas de la vista Día de Home. Distintas de renderDayEntryRows
        // (que sigue usando el popup del calendario mensual/semanal) para
        // poder darles un aspecto propio sin tocar el popup.
        function renderDayEntryCards(all) {
            return all.map(e => {
                const cat = categories.find(c => c.id === e.categoryId);
                const color = cat?.color || 'var(--text-secondary)';
                const catName = cat?.name || 'Sin categoría';

                let titleHtml, metaHtml;
                if (e._recurringPayment) {
                    titleHtml = `Pago: ${e.title}`;
                    metaHtml = `${e.type === 'subscription' ? 'Suscripción' : 'Gasto fijo'} · ${financeMoney(e.amount)}`;
                } else if (e.type === 'work') {
                    const start = e.startTime || '';
                    const end = e.endTime || '';
                    const scheduleText = (start || end) ? ` de ${start || '--'} a ${end || '--'}` : '';
                    titleHtml = `Trabajando en ${e.company || 'empresa sin nombre'}${scheduleText}`;
                    metaHtml = e.position || catName;
                } else if (e.type === 'birthday') {
                    const years = e.birthDate ? new Date().getFullYear() - parseInt(e.birthDate.split('-')[0]) : '?';
                    titleHtml = `🎂 ${e.title} (${years} años)`;
                    metaHtml = 'Cumpleaños';
                } else {
                    titleHtml = e.title;
                    metaHtml = `${catName}${e.notes ? ' · ' + linkifyText(e.notes) : ''}`;
                }

                return `
                <div class="day-entry-card" onclick="openEntryDetail('${e.id}')">
                    <div class="day-entry-dot" style="background:${color}"></div>
                    <div class="day-entry-body">
                        <div class="day-entry-title">${titleHtml}</div>
                        <div class="day-entry-meta">${metaHtml}</div>
                    </div>
                    <button class="day-entry-delete" title="Eliminar" onclick="event.stopPropagation();deleteEntry('${e.id}')">✕</button>
                </div>`;
            }).join('');
        }

        // ============================================================
        //  CHECK BIRTHDAYS TODAY
        // ============================================================
        // ============================================================
        //  ALERTA DIARIA
        //  Pop-up diferenciado que resume cumpleaños, exámenes y eventos
        //  del día. Aparece una vez al entrar en la app y, como red de
        //  seguridad, también a las 7:30 si la app ya estaba abierta
        //  desde antes de esa hora.
        // ============================================================
        function getTodayAlerts() {
            const today = todayISO();
            const todayMonth = today.slice(5, 7), todayDay = today.slice(8, 10);
            const birthdays = entries.filter(e => e.type === 'birthday' && e.birthDate &&
                e.birthDate.slice(5, 7) === todayMonth && e.birthDate.slice(8, 10) === todayDay);
            const exams = [];
            (studies.subjects || []).forEach(s => (s.exams || []).forEach(ex => {
                if (ex.date === today) exams.push({ subjectId: s.id, subject: s.name, title: ex.title });
            }));
            // Los eventos sincronizados desde un examen (linkedKind==='exams')
            // ya aparecen en el grupo "Exámenes" de arriba; se excluyen aquí
            // para no duplicarlos. Los de "Entrega" (trabajos) sí se listan.
            const events = entries.filter(e => e.type === 'event' && e.date === today && e.linkedKind !== 'exams');
            return { birthdays, exams, events };
        }

        function showDailyAlertPopup() {
            const { birthdays, exams, events } = getTodayAlerts();
            if (!birthdays.length && !exams.length && !events.length) return;

            const group = (label, items, renderItem) => items.length ? `
                <div class="daily-alert-group">
                    <div class="daily-alert-group-label">${label}</div>
                    ${items.map(renderItem).join('')}
                </div>` : '';

            document.getElementById('modal-container').innerHTML = `
                <div class="daily-alert-overlay" onclick="if(event.target===this) closeDailyAlert()">
                    <div class="daily-alert-sheet"><div class="daily-alert-inner">
                        <div class="daily-alert-kicker">Hoy</div>
                        <div class="daily-alert-title">Esto es lo que tienes</div>
                        ${group('Cumpleaños', birthdays, e => {
                            const years = e.birthDate ? new Date().getFullYear() - parseInt(e.birthDate.split('-')[0]) : null;
                            return `<div class="daily-alert-item">🎂 ${escapeHtml(e.title)}${years ? ` · ${years} años` : ''}</div>`;
                        })}
                        ${group('Exámenes', exams, ex => `<div class="daily-alert-item" onclick="closeDailyAlert();switchView('studies')">📝 ${escapeHtml(ex.subject)}${ex.title ? ' · ' + escapeHtml(ex.title) : ''}</div>`)}
                        ${group('Eventos', events, e => `<div class="daily-alert-item" onclick="closeDailyAlert();navigateToEntry('${e.id}')">◈ ${escapeHtml(e.title)}${e.time ? ' · ' + escapeHtml(e.time) : ''}</div>`)}
                        <button class="daily-alert-close" onclick="closeDailyAlert()">Entendido</button>
                    </div></div>
                </div>`;
        }

        function closeDailyAlert() {
            const container = document.getElementById('modal-container');
            const overlay = container.querySelector('.daily-alert-overlay');
            if (!overlay) { container.innerHTML = ''; return; }
            overlay.style.animation = 'modalOverlayOut 0.18s ease both';
            setTimeout(() => { if (container.contains(overlay)) container.innerHTML = ''; }, 170);
        }

        function maybeShowDailyAlert() {
            const today = todayISO();
            let openDate = '', d0730 = '';
            try { openDate = localStorage.getItem('bitacora_alert_open_date') || ''; } catch (e) {}
            try { d0730 = localStorage.getItem('bitacora_alert_0730_date') || ''; } catch (e) {}

            if (openDate !== today) {
                try { localStorage.setItem('bitacora_alert_open_date', today); } catch (e) {}
                showDailyAlertPopup();
                return;
            }
            const now = new Date();
            const past0730 = now.getHours() > 7 || (now.getHours() === 7 && now.getMinutes() >= 30);
            if (past0730 && d0730 !== today) {
                try { localStorage.setItem('bitacora_alert_0730_date', today); } catch (e) {}
                showDailyAlertPopup();
            }
        }

        // ============================================================
        //  RENDER: HOME
        // ============================================================
        let homeFilter = 'month';

        function getFilterRange(filter) {
            const now = new Date();
            let start;
            if (filter === 'week') { start = new Date(now);
                start.setDate(now.getDate() - 7); } else if (filter === 'month') { start = new Date(now.getFullYear(), now
                    .getMonth(), 1); } else if (filter === 'year') { start = new Date(now.getFullYear(), 0, 1); } else
                return null;
            return start.toISOString().slice(0, 10);
        }

        function setHomeFilter(f) { homeFilter = f;
            render(); }

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

        function renderHome() {
            const range = getFilterRange(homeFilter);
            const subsTotal = entries.filter(e => e.type === 'subscription' && e.active !== false).reduce((s, e) => s + (e.amount || 0), 0);
            const fixedTotal = entries.filter(e => e.type === 'fixed_expense' && e.active !== false).reduce((s, e) => s + (e.amount || 0), 0);
            const rangeBirthdays = getBirthdaysInRange(homeFilter);
            const filtered = range ? entries.filter(e => (e.date || '') >= range) : entries;
            const today = new Date().toISOString().slice(0, 10);
            const todayEntries = filtered.filter(e => e.date === today || e.startDate === today);

            const activeProjects = filtered.filter(e => e.type === 'project' && e.status !== 'Completado');

            const upcoming = filtered.filter(e => {
                if (e.type === 'travel' && e.startDate && e.startDate > today) return true;
                if (e.type === 'project' && e.endDate && e.endDate > today) return true;
                if (e.type === 'work' && e.endDate && e.endDate > today) return true;
                if (e.type === 'event' && e.date && e.date > today) return true;
                if (e.type === 'birthday' && e.birthDate) {
                    const [, m, d] = e.birthDate.split('-');
                    const todayM = today.split('-')[1],
                        todayD = today.split('-')[2];
                    return m + '-' + d >= todayM + '-' + todayD;
                }
                return false;
            }).sort((a, b) => {
                const dateA = a.startDate || a.endDate || a.date || a.birthDate || '';
                const dateB = b.startDate || b.endDate || b.date || b.birthDate || '';
                return dateA.localeCompare(dateB);
            }).slice(0, 5);

            let html = `
            <div style="max-width:800px">
                <div class="culture-tabs" style="margin-bottom:16px">
                    ${['week','month','year','all'].map(f => `
                        <button class="culture-tab ${homeFilter===f?'active':''}" onclick="setHomeFilter('${f}')">
                            ${({week:'Semana',month:'Mes',year:'Año',all:'Todo'})[f]}
                        </button>`).join('')}
                </div>

                ${inbox.length ? `
                <div class="card" style="margin-bottom:16px;border-left:3px solid #f59e0b">
                    <div class="card-title">📥 Inbox (${inbox.length} sin organizar)</div>
                    ${inbox.map(i => `
                        <div style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:8px">
                            <span style="font-size:13px">${escapeHtml(i.text)}</span>
                            <button class="btn-secondary" style="width:auto;padding:2px 10px;font-size:11px" onclick="deleteInboxItem('${i.id}')">✕</button>
                        </div>`).join('')}
                </div>` : ''}
                <div style="font-size:13px;color:var(--text-secondary);margin-bottom:4px">${new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>
                <div style="font-size:15px;font-weight:600;margin-bottom:20px;color:var(--text-primary)">${todayEntries.length} entradas hoy</div>

                <div class="card-grid">
                    <div class="card"><div class="card-title">Libros</div><div class="card-value">${entries.filter(e=>e.type==='book').length}</div></div>
                    <div class="card"><div class="card-title">Películas</div><div class="card-value">${entries.filter(e=>e.type==='movie').length}</div></div>
                    <div class="card"><div class="card-title">Series</div><div class="card-value">${entries.filter(e=>e.type==='series').length}</div></div>
                    <div class="card"><div class="card-title">Videojuegos</div><div class="card-value">${entries.filter(e=>e.type==='game').length}</div></div>
                    <div class="card"><div class="card-title">Viajes</div><div class="card-value">${entries.filter(e=>e.type==='travel').length}</div></div>
                    <div class="card"><div class="card-title">Proyectos activos</div><div class="card-value">${activeProjects.length}</div></div>
                    <div class="card"><div class="card-title">Notas</div><div class="card-value">${notes.length}</div></div>
                    <div class="card"><div class="card-title">Objetivos</div><div class="card-value">${entries.filter(e=>e.type==='goal').length}</div></div>
                    <div class="card"><div class="card-title">Cumpleaños</div><div class="card-value">${entries.filter(e=>e.type==='birthday').length}</div></div>
                    <div class="card"><div class="card-title">Suscripciones/mes</div><div class="card-value">${subsTotal.toLocaleString('es-ES')}€</div></div>
                    <div class="card"><div class="card-title">Gastos fijos/mes</div><div class="card-value">${fixedTotal.toLocaleString('es-ES')}€</div></div>
                </div>

                ${rangeBirthdays.length ? `
                    <div style="font-weight:700;font-size:14px;margin:16px 0 8px 0;color:var(--text-primary)">Cumpleaños en este periodo</div>
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
                    <div style="font-weight:700;font-size:14px;margin:16px 0 8px 0;color:var(--text-primary)">Próximamente</div>
                    ${upcoming.map(e => {
                        const cat = categories.find(c => c.id === e.categoryId);
                        const color = cat?.color || 'var(--text-secondary)';
                        const dateInfo = e.birthDate || e.startDate || e.endDate || e.date || '';
                        const label = e.type === 'birthday' ? '🎂 ' + e.title : e.title;
                        return `
                            <div class="entry-item" onclick="switchView('calendar');showDayEntries('${dateInfo}')">
                                <div class="entry-color-dot" style="background:${color}"></div>
                                <div class="entry-info">
                                    <div class="entry-title">${label}</div>
                                    <div class="entry-meta">${dateInfo}</div>
                                </div>
                            </div>`;
                    }).join('')}
                ` : ''}

                <div id="summaryDashboard" style="margin-top:20px"></div>
            </div>`;

            return html;
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
                <div style="font-size:20px;font-weight:800;margin-bottom:4px;color:var(--text-primary)">Estadísticas</div>
                <div style="color:var(--text-secondary);margin-bottom:20px">Resumen de tu actividad</div>

                <div class="card-grid">
                    <div class="card"><div class="card-title">Total entradas</div><div class="card-value">${totalEntries}</div></div>
                    <div class="card"><div class="card-title">Libros</div><div class="card-value">${byType.book || 0}</div></div>
                    <div class="card"><div class="card-title">Películas</div><div class="card-value">${byType.movie || 0}</div></div>
                    <div class="card"><div class="card-title">Series</div><div class="card-value">${byType.series || 0}</div></div>
                    <div class="card"><div class="card-title">Videojuegos</div><div class="card-value">${byType.game || 0}</div></div>
                    <div class="card"><div class="card-title">Viajes</div><div class="card-value">${byType.travel || 0}</div></div>
                    <div class="card"><div class="card-title">Trabajo</div><div class="card-value">${byType.work || 0}</div></div>
                    <div class="card"><div class="card-title">Proyectos</div><div class="card-value">${byType.project || 0}</div></div>
                    <div class="card"><div class="card-title">Eventos</div><div class="card-value">${byType.event || 0}</div></div>
                    <div class="card"><div class="card-title">Lugares</div><div class="card-value">${byType.place || 0}</div></div>
                    <div class="card"><div class="card-title">Objetivos</div><div class="card-value">${byType.goal || 0}</div></div>
                    <div class="card"><div class="card-title">Cumpleaños</div><div class="card-value">${byType.birthday || 0}</div></div>
                    <div class="card"><div class="card-title">Notas</div><div class="card-value">${notes.length}</div></div>
                </div>`;

            if (sortedMonths.length) {
                html += `
                <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin:20px 0 12px 0">Entradas por mes</div>
                <div style="display:flex;gap:8px;align-items:flex-end;height:100px;padding-top:8px">`;
                sortedMonths.forEach(m => {
                    const count = monthCount[m] || 0;
                    const pct = (count / maxMonth) * 100;
                    const label = m.slice(5);
                    html += `
                    <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
                        <div style="font-weight:600;font-size:12px;color:var(--text-primary)">${count}</div>
                        <div style="width:100%;height:${Math.max(4, pct)}px;background:var(--border-strong);border-radius:4px 4px 0 0;min-height:4px"></div>
                        <div style="font-size:10px;color:var(--text-secondary)">${label}</div>
                    </div>`;
                });
                html += `</div>`;
            }

            html += `</div>`;
            return html;
        }

        // ============================================================
        //  RENDER: BOOKS
        // ============================================================
        // ============================================================
        //  RENDER: CULTURA (Libros + Series + Películas + Videojuegos)
        // ============================================================
        let cultureTab = 'books';
        const CULTURE_TAB_TO_TYPE = { books: 'book', series: 'series', movies: 'movie', games: 'game' };

        function setCultureTab(tab) {
            cultureTab = tab;
            render();
        }

        function toggleCultureSharedMode() {
            cultureSharedMode = !cultureSharedMode;
            render();
        }

        function renderCulture() {
            const tabs = [
                { id: 'books', label: 'Libros', icon: '◊', count: entries.filter(e => e.type === 'book').length },
                { id: 'series', label: 'Series', icon: '◈', count: entries.filter(e => e.type === 'series').length },
                { id: 'movies', label: 'Películas', icon: '▸', count: entries.filter(e => e.type === 'movie').length },
                { id: 'games', label: 'Videojuegos', icon: '◉', count: entries.filter(e => e.type === 'game').length },
            ];
            const tipoActivo = CULTURE_TAB_TO_TYPE[cultureTab];
            const pendientes = recomendaciones.filter(r => r.tipo === tipoActivo).length;

            let html = `<div style="max-width:980px">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;flex-wrap:wrap">
                <div class="culture-tabs" style="margin-bottom:0">
                    ${tabs.map(t => `
                        <button class="culture-tab ${cultureTab === t.id ? 'active' : ''}" onclick="setCultureTab('${t.id}')">
                            <span>${t.label}</span>
                            <span class="culture-tab-count">${t.count}</span>
                        </button>`).join('')}
                </div>
                <button class="btn-secondary culture-shared-toggle" style="width:auto" onclick="toggleCultureSharedMode()">
                    ${cultureSharedMode ? '← Mi biblioteca' : `Recomendaciones${pendientes ? ` (${pendientes})` : ''}`}
                </button>
                </div>
                <div class="culture-tab-content">
                <div class="cal-view-anim">`;

            if (cultureSharedMode) {
                html += renderGhostGrid(tipoActivo);
            } else if (cultureTab === 'books') html += renderBooks();
            else if (cultureTab === 'series') html += renderSeries();
            else if (cultureTab === 'movies') html += renderMovies();
            else if (cultureTab === 'games') html += renderGames();

            html += `</div></div></div>`;
            return html;
        }

        // Iconos minimalistas en SVG para las tarjetas de Ocio (mismo estilo
        // de trazo/relleno para todos, sustituyen a los símbolos de fuente).
        const MEDIA_CARD_ICONS = {
            book: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5.5c2.5-1 5-1 8 .5v13c-3-1.5-5.5-1.5-8-.5z"/><path d="M21 5.5c-2.5-1-5-1-8 .5v13c3-1.5 5.5-1.5 8-.5z"/><line x1="6" y1="8" x2="9.5" y2="8.6"/><line x1="6" y1="10.8" x2="9.5" y2="11.4"/><line x1="6" y1="13.6" x2="9.5" y2="14.2"/></svg>`,
            movie: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 4v16l14-8z"/></svg>`,
            series: `<svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M3 5v14l8-7z"/><path d="M13 5v14l8-7z"/></svg>`,
            game: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8.5 6.3h1.5v3.2H13v1.5h-3v3.2H8.5v-3.2h-3V9.5h3z"/><circle cx="17.2" cy="8" r="1.25"/><circle cx="14.6" cy="10.6" r="1.25"/><circle cx="19.8" cy="10.6" r="1.25"/><circle cx="17.2" cy="13.2" r="1.25"/></svg>`
        };
        function mediaCardIcon(type) {
            return MEDIA_CARD_ICONS[type] || TYPE_ICONS[type] || '◈';
        }

        // Tarjeta común para Ocio (libros, películas, series, videojuegos). Fondo
        // negro por defecto; si la valoración es de 5 estrellas, reborde dorado.
        // El estado ("Viendo"...) y la valoración comparten un único hueco fijo,
        // nunca se muestran a la vez, para que el título quede siempre a la misma altura.
        // Enlace de una búsqueda ya compuesta (título + IMDb/Goodreads) que
        // se abre en una pestaña nueva del navegador. No se puede incrustar
        // esas páginas en un iframe dentro de Bitácora: casi todos los
        // sitios (IMDb y Goodreads incluidos) bloquean explícitamente que
        // los carguen dentro de otra página (cabecera X-Frame-Options), así
        // que una "ventana por encima" con esa búsqueda ya hecha no cargaría
        // nada — abrir pestaña nueva es la única forma que funciona de verdad.
        function externalSearchUrl(type, title) {
            const q = encodeURIComponent(title);
            if (type === 'book') return 'https://www.goodreads.com/search?q=' + q;
            if (type === 'movie' || type === 'series') return 'https://www.imdb.com/find/?q=' + q;
            return null;
        }

        // Enlace externo de una entrada: IMDb/Goodreads por título, o Google
        // Maps por lugar en el caso de un evento con lugar indicado. Misma
        // idea en todos los casos: una búsqueda ya compuesta que se abre en
        // una ventana nueva (los sitios de destino no se pueden incrustar).
        function entryExternalLink(entry) {
            const byTitle = externalSearchUrl(entry.type, entry.title);
            if (byTitle) return { url: byTitle, label: entry.type === 'book' ? 'Ver en Goodreads' : 'Ver en IMDb' };
            if (entry.type === 'event' && entry.place) {
                return { url: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(entry.place), label: 'Ver en Maps' };
            }
            return null;
        }

        function openExternalSearch(event, btn) {
            event.stopPropagation();
            const url = btn.dataset.extUrl;
            if (!url) return;
            const w = 1000, h = 520;
            const left = Math.round((screen.width - w) / 2), top = Math.round((screen.height - h) / 2);
            window.open(url, '_blank', `noopener,width=${w},height=${h},left=${left},top=${top}`);
        }

        function renderMediaCard(entry, metaLine, badge) {
            const gold = Number(entry.rating) === 5;
            const stars = entry.rating ? '★'.repeat(entry.rating) : '';
            const statusContent = stars
                ? `<div class="media-card-stars">${stars}</div>`
                : (badge ? `<div class="media-card-badge">${escapeHtml(badge)}</div>` : '');
            return `
                <div class="media-card media-card-type-${entry.type} ${gold ? 'media-card-gold' : ''}" onclick="openEntryDetail('${entry.id}')">
                    <div class="media-card-icon">${mediaCardIcon(entry.type)}</div>
                    <div class="media-card-title">${escapeHtml(entry.title)}</div>
                    <div class="media-card-meta">${metaLine ? escapeHtml(metaLine) : ''}</div>
                    <div class="media-card-status-slot">${statusContent}</div>
                </div>`;
        }
        function renderMediaCardGrid(items, metaFn, badgeFn) {
            return `<div class="media-card-grid">${items.map(e => renderMediaCard(e, metaFn ? metaFn(e) : '', badgeFn ? badgeFn(e) : '')).join('')}</div>`;
        }

        function renderBooks() {
            const allBooks = entries.filter(e => e.type === 'book');
            if (!allBooks.length) {
                return `<div class="empty-state"><div class="empty-icon">◊</div><div class="empty-title">Sin libros</div><div class="empty-sub">Pulsa el botón + y selecciona "Libro"</div></div>`;
            }
            const { items: books, banner } = applyMonthFilterTo('book', allBooks);
            if (!books.length) return banner + `<div class="empty-state"><div class="empty-icon">◊</div><div class="empty-title">Sin libros ese mes</div></div>`;

            const reading = books.filter(b => b.status === 'Leyendo');
            const completed = books.filter(b => b.status === 'Completado');

            let html = banner + `<div>
                <div style="display:flex;gap:10px;margin-bottom:16px;max-width:280px">
                    <div class="card" style="flex:1;padding:10px 12px"><div class="card-title" style="font-size:10px">Leyendo</div><div class="card-value" style="font-size:17px">${reading.length}</div></div>
                    <div class="card" style="flex:1;padding:10px 12px"><div class="card-title" style="font-size:10px">Completados</div><div class="card-value" style="font-size:17px">${completed.length}</div></div>
                </div>`;

            if (reading.length) {
                html += `<div class="media-card-section-title">Leyendo</div>`;
                html += renderMediaCardGrid(reading, b => b.author || 'Sin autor');
            }

            if (completed.length) {
                html += `<div class="media-card-section-title">Completados</div>`;
                html += renderMediaCardGrid(completed, b => b.author || 'Sin autor');
            }

            html += `</div>`;
            return html;
        }

        // ============================================================
        //  RENDER: MOVIES
        // ============================================================
        function renderMovies() {
            const allMovies = entries.filter(e => e.type === 'movie');
            if (!allMovies.length) {
                return `<div class="empty-state"><div class="empty-icon">▸</div><div class="empty-title">Sin películas</div><div class="empty-sub">Pulsa el botón + y selecciona "Película"</div></div>`;
            }
            const { items: movies, banner } = applyMonthFilterTo('movie', allMovies);
            if (!movies.length) return banner + `<div class="empty-state"><div class="empty-icon">▸</div><div class="empty-title">Sin películas ese mes</div></div>`;

            const sorted = [...movies].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            const groups = [];
            const byKey = {};
            sorted.forEach(m => {
                const key = (m.date || '').slice(0, 7) || 'sin-fecha';
                if (!byKey[key]) { byKey[key] = { key, items: [] }; groups.push(byKey[key]); }
                byKey[key].items.push(m);
            });
            const monthLabel = key => {
                if (key === 'sin-fecha') return 'sin fecha';
                const [y, mo] = key.split('-').map(Number);
                return new Date(y, mo - 1, 1).toLocaleDateString('es-ES', { month: 'long' });
            };

            let html = banner + `<div>`;
            groups.forEach(g => {
                html += `<div class="media-month-label">${escapeHtml(monthLabel(g.key))}.</div>`;
                html += renderMediaCardGrid(g.items, m => m.date || 'Sin fecha');
            });
            html += `</div>`;
            return html;
        }

        // ============================================================
        //  RENDER: SERIES
        // ============================================================
        function renderSeries() {
            const allSeries = entries.filter(e => e.type === 'series');
            if (!allSeries.length) {
                return `<div class="empty-state"><div class="empty-icon">◈</div><div class="empty-title">Sin series</div><div class="empty-sub">Pulsa el botón + y selecciona "Serie"</div></div>`;
            }
            const { items: series, banner } = applyMonthFilterTo('series', allSeries);
            if (!series.length) return banner + `<div class="empty-state"><div class="empty-icon">◈</div><div class="empty-title">Sin series ese mes</div></div>`;

            const statusOrder = { 'Viendo': 0, 'Completada': 1, 'Abandonada': 2 };
            // Estado efectivo: si hay fecha de fin y el estado guardado sigue en
            // "Viendo" (dato antiguo sin reeditar), se muestra como "Completada".
            const effectiveStatus = s => (s.endDate && s.status === 'Viendo') ? 'Completada' : s.status;
            const sorted = [...series].sort((a, b) => (statusOrder[effectiveStatus(a)] || 0) - (statusOrder[effectiveStatus(b)] || 0));

            let html = banner + `<div>`;
            html += renderMediaCardGrid(sorted,
                null,
                s => effectiveStatus(s));
            html += `</div>`;
            return html;
        }

        // ============================================================
        //  RENDER: GAMES
        // ============================================================
        function renderGames() {
            const games = entries.filter(e => e.type === 'game');
            if (!games.length) {
                return `<div class="empty-state"><div class="empty-icon">◉</div><div class="empty-title">Sin videojuegos</div><div class="empty-sub">Pulsa el botón + y selecciona "Videojuego"</div></div>`;
            }

            const statusOrder = { 'Jugando': 0, 'Completado': 1, 'Abandonado': 2 };
            const sorted = [...games].sort((a, b) => (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0));

            // Sin badge de estado: muchos juegos no tienen fecha de finalización.
            let html = `<div>`;
            html += renderMediaCardGrid(sorted, g => g.endDate ? `Fin: ${g.endDate}` : '');
            html += `</div>`;
            return html;
        }

        // ============================================================
        //  RECOMENDACIONES ENTRE AMIGOS (libros, pelis, series, videojuegos)
        // ============================================================
        async function cargarRecomendaciones() {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) { recomendaciones = []; return; }
                const { data, error } = await sb.from('recomendaciones')
                    .select('id, remitente_id, tipo, entrada, nota, creado_en')
                    .eq('destinatario_id', user.id)
                    .order('creado_en', { ascending: false });
                if (error) { console.error('Error cargando recomendaciones:', error); return; }
                recomendaciones = data || [];
                if (recomendaciones.length) {
                    const ids = [...new Set(recomendaciones.map(r => r.remitente_id))];
                    const { data: publicos } = await sb.from('perfiles_publicos').select('user_id, nombre_publico').in('user_id', ids);
                    const porId = Object.fromEntries((publicos || []).map(p => [p.user_id, p.nombre_publico]));
                    const amigoPorId = Object.fromEntries(amigos.map(a => [a.friend_id, a.nombre_visible || a.friend_nombre]));
                    recomendaciones.forEach(r => { r.remitente_nombre = porId[r.remitente_id] || amigoPorId[r.remitente_id] || 'Un amigo'; });
                }
            } catch (e) {
                console.error('Error cargando recomendaciones:', e);
            }
        }

        // ------------------------------------------------------------
        //  NOTIFICACIONES (solicitudes de amistad + recomendaciones pendientes)
        // ------------------------------------------------------------
        const NOTIF_ICON_FRIEND = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><path d="M16 8v6M19 11h-6"/></svg>';
        const NOTIF_ICON_REC = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';
        const NOTIF_ICON_TRIP = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h20"/><path d="M12 2c2.5 2.7 4 6.3 4 10s-1.5 7.3-4 10c-2.5-2.7-4-6.3-4-10s1.5-7.3 4-10z"/></svg>';
        const CULTURE_TYPE_TO_TAB = { book: 'books', series: 'series', movie: 'movies', game: 'games' };
        const CULTURE_TYPE_LABEL = { book: 'un libro', series: 'una serie', movie: 'una película', game: 'un videojuego' };

        function computeNotifItems() {
            const items = [];
            (typeof solicitudesRecibidas !== 'undefined' ? solicitudesRecibidas : []).forEach(s => {
                items.push({
                    icon: NOTIF_ICON_FRIEND,
                    iconClass: 'icon-friend',
                    title: `${s.nombre || 'Alguien'} quiere ser tu amigo`,
                    sub: 'Solicitud de amistad pendiente',
                    date: s.creado_en || '',
                    onClick: () => { closeNotifPanel(); switchView('friends'); }
                });
            });
            (typeof recomendaciones !== 'undefined' ? recomendaciones : []).forEach(r => {
                items.push({
                    icon: NOTIF_ICON_REC,
                    iconClass: 'icon-rec',
                    title: `${r.remitente_nombre || 'Un amigo'} te recomendó ${CULTURE_TYPE_LABEL[r.tipo] || 'algo'}`,
                    sub: (r.entrada && r.entrada.title) || '',
                    date: r.creado_en || '',
                    onClick: () => {
                        closeNotifPanel();
                        cultureTab = CULTURE_TYPE_TO_TAB[r.tipo] || 'books';
                        cultureSharedMode = true;
                        switchView('culture');
                    }
                });
            });
            (typeof viajesCompartidos !== 'undefined' ? viajesCompartidos : []).forEach(v => {
                items.push({
                    icon: NOTIF_ICON_TRIP,
                    iconClass: 'icon-trip',
                    title: `${v.remitente_nombre || 'Un amigo'} te compartió un viaje`,
                    sub: (v.viaje && v.viaje.title) || '',
                    date: v.creado_en || '',
                    onClick: () => { closeNotifPanel(); switchView('travels'); }
                });
            });
            items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
            return items;
        }

        function renderNotifPanelHtml() {
            const items = computeNotifItems();
            window._notifItems = items;
            if (!items.length) {
                return `
                    <div class="notif-empty">
                        <svg class="notif-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                        Sin notificaciones nuevas
                    </div>`;
            }
            return `
                <div class="notif-panel-title">Notificaciones</div>
                ${items.map((it, i) => `
                    <div class="notif-item" onclick="window._notifItems[${i}].onClick()">
                        <div class="notif-item-icon ${it.iconClass || ''}">${it.icon}</div>
                        <div class="notif-item-body">
                            <div class="notif-item-title">${escapeHtml(it.title)}</div>
                            ${it.sub ? `<div class="notif-item-sub">${escapeHtml(it.sub)}</div>` : ''}
                        </div>
                    </div>
                `).join('')}
            `;
        }

        function updateNotifBadge() {
            const badge = document.getElementById('notif-badge');
            const bellBtn = document.getElementById('notif-bell-btn');
            if (!badge) return;
            const count = computeNotifItems().length;
            badge.hidden = count === 0;
            if (bellBtn) bellBtn.classList.toggle('has-unread', count > 0);
            const panel = document.getElementById('notif-panel');
            if (panel && panel.classList.contains('open')) {
                panel.innerHTML = renderNotifPanelHtml();
            }
        }

        async function refreshNotifData() {
            try {
                await Promise.all([cargarSolicitudesAmistad(), cargarRecomendaciones(), cargarViajesCompartidos()]);
                updateNotifBadge();
            } catch (e) {
                console.error('Error actualizando notificaciones:', e);
            }
        }

        function closeNotifPanel() {
            const panel = document.getElementById('notif-panel');
            if (panel) panel.classList.remove('open');
        }

        function toggleNotifPanel() {
            const panel = document.getElementById('notif-panel');
            if (!panel) return;
            const willOpen = !panel.classList.contains('open');
            panel.classList.toggle('open', willOpen);
            if (willOpen) {
                panel.innerHTML = renderNotifPanelHtml();
                panel.style.right = '0';
                // En pantallas estrechas el botón de la campana no queda
                // pegado al borde derecho (el reloj va después), así que
                // anclar el panel a "right:0" de su propio contenedor puede
                // sacarlo por la izquierda de la pantalla. Se corrige
                // desplazándolo lo justo para que no se salga. getBoundingClientRect
                // fuerza el reflow, así que no hace falta esperar a un frame.
                const r = panel.getBoundingClientRect();
                const overflow = 8 - r.left;
                if (overflow > 0) panel.style.right = (-overflow) + 'px';
                setTimeout(() => {
                    document.addEventListener('click', function closeNotifOnOutsideClick(e) {
                        const wrap = document.querySelector('.notif-bell-wrap');
                        if (wrap && !wrap.contains(e.target)) {
                            panel.classList.remove('open');
                            document.removeEventListener('click', closeNotifOnOutsideClick);
                        }
                    });
                }, 0);
            }
        }

        // Abre el selector de amigo + nota, desde el botón "Recomendar" de la
        // ficha de un libro/peli/serie/videojuego. Solo tiene sentido para esos
        // 4 tipos, y solo si ya tienes al menos un amigo añadido.
        function abrirRecomendarModal(entryId) {
            const entry = entries.find(e => e.id === entryId);
            if (!entry) return;
            if (!amigos.length) { showToast('Añade primero un amigo desde el apartado Amigos', true); return; }
            showModal(`
                <div class="modal-title">Recomendar "${escapeHtml(entry.title)}"</div>
                <div class="modal-label">A quién</div>
                <select id="recomendar-amigo" class="modal-input">
                    ${amigos.map(a => `<option value="${a.friend_id}">${escapeHtml(a.nombre_visible || a.friend_nombre || 'Amigo')}</option>`).join('')}
                </select>
                <div class="modal-label">Nota (opcional)</div>
                <textarea id="recomendar-nota" class="modal-input" rows="3" placeholder="¿Por qué se lo recomiendas?"></textarea>
                <button class="btn-modal-primary" onclick="enviarRecomendacion('${entryId}')">Enviar recomendación</button>
            `);
        }

        async function enviarRecomendacion(entryId) {
            const entry = entries.find(e => e.id === entryId);
            if (!entry) return;
            const destinatarioId = document.getElementById('recomendar-amigo')?.value;
            const nota = document.getElementById('recomendar-nota')?.value?.trim() || null;
            if (!destinatarioId) { showToast('Elige a quién recomendárselo', true); return; }
            const { data: { user } } = await sb.auth.getUser();
            if (!user) return;
            try {
                const { error } = await sb.from('recomendaciones').insert({
                    remitente_id: user.id,
                    destinatario_id: destinatarioId,
                    tipo: entry.type,
                    entrada: { title: entry.title, author: entry.author || null },
                    nota
                });
                if (error) throw error;
                closeModal();
                showToast('Recomendación enviada');
            } catch (e) {
                console.error('Error enviando la recomendación:', e);
                showToast('No se pudo enviar la recomendación', true);
            }
        }

        function renderGhostCard(rec) {
            const entrada = rec.entrada || {};
            return `
                <div class="media-card media-card-type-${rec.tipo} media-card-ghost" onclick="abrirGhostDetalle('${rec.id}')">
                    <div class="media-card-icon">${mediaCardIcon(rec.tipo)}</div>
                    <div class="media-card-title">${escapeHtml(entrada.title || 'Sin título')}</div>
                    <div class="media-card-meta">${escapeHtml(entrada.author || '')}</div>
                    <div class="media-card-ghost-from">De ${escapeHtml(rec.remitente_nombre || 'un amigo')}</div>
                    ${rec.nota ? `<div class="media-card-ghost-note">"${escapeHtml(rec.nota)}"</div>` : ''}
                </div>`;
        }

        function renderGhostGrid(tipo) {
            const items = recomendaciones.filter(r => r.tipo === tipo);
            if (!items.length) {
                return `<div class="empty-state"><div class="empty-icon">◕</div><div class="empty-title">Sin recomendaciones</div><div class="empty-sub">Aquí aparecerá lo que tus amigos te recomienden.</div></div>`;
            }
            return `<div class="media-card-grid">${items.map(renderGhostCard).join('')}</div>`;
        }

        function abrirGhostDetalle(recId) {
            const rec = recomendaciones.find(r => r.id === recId);
            if (!rec) return;
            const entrada = rec.entrada || {};
            showModal(`
                <div class="modal-title">${escapeHtml(entrada.title || 'Sin título')}</div>
                <div style="font-size:11px;color:var(--text-secondary)">${TYPE_LABELS[rec.tipo] || rec.tipo}</div>
                <div class="entry-detail-grid">
                    ${entrada.author ? detailField('Autor', escapeHtml(entrada.author)) : ''}
                    ${detailField('Recomendado por', escapeHtml(rec.remitente_nombre || 'Un amigo'))}
                    ${rec.nota ? detailField('Nota', escapeHtml(rec.nota)) : ''}
                </div>
                <div class="entry-detail-actions">
                    <button class="btn-modal-primary" onclick="anadirRecomendacionABiblioteca('${recId}')">+ Añadir a mi biblioteca</button>
                    <button class="btn-secondary" style="width:auto" onclick="descartarRecomendacion('${recId}')">No me interesa</button>
                    <button class="btn-secondary" style="width:auto" onclick="closeModal()">Cerrar</button>
                </div>
            `);
        }

        async function anadirRecomendacionABiblioteca(recId) {
            const rec = recomendaciones.find(r => r.id === recId);
            if (!rec) return;
            const entrada = rec.entrada || {};
            entries.push({
                id: 'entry_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                type: rec.tipo,
                title: entrada.title || 'Sin título',
                author: entrada.author || '',
                status: '',
                date: todayISO(),
                notes: rec.nota ? `Recomendado por ${rec.remitente_nombre || 'un amigo'}: ${rec.nota}` : `Recomendado por ${rec.remitente_nombre || 'un amigo'}`,
                createdAt: new Date().toISOString()
            });
            filteredEntries = [...entries];
            try { await saveData(); } catch (e) { console.error(e); }
            await quitarRecomendacion(recId);
            closeModal();
            render();
            showToast('Añadido a tu biblioteca');
        }

        async function descartarRecomendacion(recId) {
            if (!confirm('¿Descartar esta recomendación?')) return;
            await quitarRecomendacion(recId);
            closeModal();
            render();
            showToast('Recomendación descartada');
        }

        async function quitarRecomendacion(recId) {
            recomendaciones = recomendaciones.filter(r => r.id !== recId);
            if (typeof updateNotifBadge === 'function') updateNotifBadge();
            try {
                const { error } = await sb.from('recomendaciones').delete().eq('id', recId);
                if (error) console.error('Error quitando la recomendación en Supabase:', error);
            } catch (e) {
                console.error('Error quitando la recomendación:', e);
            }
        }

        // ------------------------------------------------------------
        //  VIAJES COMPARTIDOS ENTRE AMIGOS
        //  Mismo patrón que las recomendaciones: se manda una foto fija
        //  del viaje (no edición conjunta en vivo, ver bitacora_viajes_
        //  compartidos.sql), y el destinatario decide si la añade a sus
        //  propios viajes o la descarta.
        // ------------------------------------------------------------
        let viajesCompartidos = [];

        async function cargarViajesCompartidos() {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) { viajesCompartidos = []; return; }
                const { data, error } = await sb.from('viajes_compartidos')
                    .select('id, remitente_id, viaje, nota, creado_en')
                    .eq('destinatario_id', user.id)
                    .order('creado_en', { ascending: false });
                if (error) { console.error('Error cargando viajes compartidos:', error); return; }
                viajesCompartidos = data || [];
                if (viajesCompartidos.length) {
                    const ids = [...new Set(viajesCompartidos.map(v => v.remitente_id))];
                    const { data: publicos } = await sb.from('perfiles_publicos').select('user_id, nombre_publico').in('user_id', ids);
                    const porId = Object.fromEntries((publicos || []).map(p => [p.user_id, p.nombre_publico]));
                    const amigoPorId = Object.fromEntries((amigos || []).map(a => [a.friend_id, a.nombre_visible || a.friend_nombre]));
                    viajesCompartidos.forEach(v => { v.remitente_nombre = porId[v.remitente_id] || amigoPorId[v.remitente_id] || 'Un amigo'; });
                }
            } catch (e) {
                console.error('Error cargando viajes compartidos:', e);
            }
        }

        function abrirCompartirViajeModal(tripId) {
            const t = getTrip(tripId);
            if (!t) return;
            if (!amigos.length) { showToast('Añade primero un amigo desde el apartado Amigos', true); return; }
            showModal(`
                <div class="modal-title">Compartir "${escapeHtml(t.title)}"</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Se enviará tal como está ahora: lugares, itinerario y listas. Si luego cambias el viaje, no se actualizará lo ya enviado.</div>
                <div class="modal-label">Con quién</div>
                <select id="compartir-viaje-amigo" class="modal-input">
                    ${amigos.map(a => `<option value="${a.friend_id}">${escapeHtml(a.nombre_visible || a.friend_nombre || 'Amigo')}</option>`).join('')}
                </select>
                <div class="modal-label">Nota (opcional)</div>
                <textarea id="compartir-viaje-nota" class="modal-input" rows="3" placeholder="Algo que quieras contarle sobre el viaje"></textarea>
                <button class="btn-modal-primary" onclick="enviarViajeCompartido('${tripId}')">Enviar viaje</button>
            `);
        }

        async function enviarViajeCompartido(tripId) {
            const t = getTrip(tripId);
            if (!t) return;
            const destinatarioId = document.getElementById('compartir-viaje-amigo')?.value;
            const nota = document.getElementById('compartir-viaje-nota')?.value?.trim() || null;
            if (!destinatarioId) { showToast('Elige con quién compartirlo', true); return; }
            const { data: { user } } = await sb.auth.getUser();
            if (!user) return;
            // No se incluyen documentos (archivos en Storage, no triviales
            // de copiar a otro usuario) ni gastos (información económica
            // personal que no tiene sentido compartir por defecto).
            const viaje = {
                title: t.title, destination: t.destination || '',
                startDate: t.startDate || '', endDate: t.endDate || '',
                places: Array.isArray(t.places) ? t.places.map(p => ({ nombre: p.nombre })) : [],
                itinerario: Array.isArray(t.itinerario) ? t.itinerario.map(it => ({ dia: it.dia, hora: it.hora, titulo: it.titulo, notas: it.notas })) : [],
                listas: Array.isArray(t.listas) ? t.listas.map(l => ({ nombre: l.nombre, items: (l.items || []).map(i => ({ texto: i.texto })) })) : []
            };
            try {
                const { error } = await sb.from('viajes_compartidos').insert({
                    remitente_id: user.id,
                    destinatario_id: destinatarioId,
                    viaje,
                    nota
                });
                if (error) throw error;
                closeModal();
                showToast('Viaje compartido');
            } catch (e) {
                console.error('Error compartiendo el viaje:', e);
                showToast('No se pudo compartir el viaje', true);
            }
        }

        async function quitarViajeCompartido(id) {
            viajesCompartidos = viajesCompartidos.filter(v => v.id !== id);
            if (typeof updateNotifBadge === 'function') updateNotifBadge();
            try {
                const { error } = await sb.from('viajes_compartidos').delete().eq('id', id);
                if (error) console.error('Error quitando el viaje compartido en Supabase:', error);
            } catch (e) {
                console.error('Error quitando el viaje compartido:', e);
            }
        }

        async function anadirViajeCompartidoAMisViajes(id) {
            const v = viajesCompartidos.find(x => x.id === id);
            if (!v) return;
            const viaje = v.viaje || {};
            entries.push({
                id: 'entry_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                type: 'travel',
                title: viaje.title || 'Viaje compartido',
                destination: viaje.destination || '',
                startDate: viaje.startDate || '', endDate: viaje.endDate || '',
                companions: '', expenses: [],
                notes: v.nota ? `Compartido por ${v.remitente_nombre || 'un amigo'}: ${v.nota}` : `Compartido por ${v.remitente_nombre || 'un amigo'}`,
                places: (viaje.places || []).map(p => ({ id: 'place_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), nombre: p.nombre, visitado: false })),
                itinerario: (viaje.itinerario || []).map(it => ({ id: 'it_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), dia: it.dia || '', hora: it.hora || '', titulo: it.titulo, notas: it.notas || '' })),
                listas: (viaje.listas || []).map(l => ({ id: 'lista_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), nombre: l.nombre, items: (l.items || []).map(i => ({ id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), texto: i.texto, hecho: false })) })),
                createdAt: new Date().toISOString()
            });
            filteredEntries = [...entries];
            try { await saveData(); } catch (e) { console.error(e); }
            await quitarViajeCompartido(id);
            render();
            showToast('Viaje añadido a los tuyos');
        }

        async function descartarViajeCompartido(id) {
            if (!confirm('¿Descartar este viaje compartido?')) return;
            await quitarViajeCompartido(id);
            render();
            showToast('Viaje descartado');
        }

        function renderSharedTripsSection() {
            if (!viajesCompartidos.length) return '';
            return `
                <div style="margin-bottom:18px">
                    <div style="font-size:13px;font-weight:700;margin-bottom:8px">Viajes compartidos contigo (${viajesCompartidos.length})</div>
                    ${viajesCompartidos.map(v => {
                        const viaje = v.viaje || {};
                        return `
                        <div class="trip-card" style="background:transparent;border-style:dashed">
                            <div style="font-weight:800;font-size:15px;color:var(--text-primary)">${escapeHtml(viaje.title || 'Viaje')}</div>
                            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${escapeHtml(viaje.destination || '')}${viaje.startDate ? ' · ' + escapeHtml(formatTravelRange(viaje.startDate, viaje.endDate)) : ''}</div>
                            <div style="font-size:11px;color:var(--text-secondary);margin-top:6px">De ${escapeHtml(v.remitente_nombre || 'un amigo')}</div>
                            ${v.nota ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;font-style:italic">"${escapeHtml(v.nota)}"</div>` : ''}
                            <div style="display:flex;gap:8px;margin-top:10px">
                                <button class="btn-modal-primary" style="width:auto;padding:6px 12px;font-size:12px" onclick="anadirViajeCompartidoAMisViajes('${v.id}')">+ Añadir a mis viajes</button>
                                <button class="btn-secondary" style="width:auto;padding:6px 12px;font-size:12px" onclick="descartarViajeCompartido('${v.id}')">Descartar</button>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            `;
        }

        // ============================================================
        //  RENDER: TRAVELS
        // ============================================================
        let travelPlacesTab = 'travels';
        function setTravelPlacesTab(tab) { travelPlacesTab = tab; render(); }

        // Próximo / En curso / Completado / Sin fecha — según hoy respecto al
        // rango del viaje. Se usa tanto en la tarjeta de la lista como en la
        // cabecera del Gestor de viaje.
        function tripStatus(t) {
            const hoy = todayISO();
            if (!t.startDate) return { label: 'Sin fecha', color: 'var(--text-secondary)' };
            if (t.startDate > hoy) return { label: 'Próximo', color: '#3b82f6' };
            if (!t.endDate || t.endDate >= hoy) return { label: 'En curso', color: '#f59e0b' };
            return { label: 'Completado', color: '#16a34a' };
        }

        function getTrip(id) { return entries.find(e => e.id === id && e.type === 'travel'); }

        function renderTravels() {
            if (window._openTripId) {
                const t = getTrip(window._openTripId);
                if (t) return renderTripManager(t);
                window._openTripId = null;
            }

            const travels = entries.filter(e => e.type === 'travel');
            const places = entries.filter(e => e.type === 'place');

            let html = `
                <div style="max-width:820px">
                    <div style="margin-bottom:16px">
                        <div style="font-size:20px;font-weight:800">Viajes</div>
                        <div style="font-size:12px;color:var(--text-secondary)">Tus viajes y lugares, con su propio gestor: lugares que ver, itinerario, documentos y listas.</div>
                    </div>
                    ${renderSharedTripsSection()}
                    <div class="culture-tabs">
                        <button class="culture-tab ${travelPlacesTab === 'travels' ? 'active' : ''}" onclick="setTravelPlacesTab('travels')">
                            <span>Viajes</span><span class="culture-tab-count">${travels.length}</span>
                        </button>
                        <button class="culture-tab ${travelPlacesTab === 'places' ? 'active' : ''}" onclick="setTravelPlacesTab('places')">
                            <span>Lugares</span><span class="culture-tab-count">${places.length}</span>
                        </button>
                    </div>
                    <div class="culture-tab-content">
            `;

            if (travelPlacesTab === 'travels') {
                if (!travels.length) {
                    html += `<div class="empty-state"><div class="empty-icon">◈</div><div class="empty-title">Sin viajes</div><div class="empty-sub">Pulsa el botón + y selecciona "Viaje"</div></div>`;
                } else {
                    const orden = { 'En curso': 0, 'Próximo': 1, 'Sin fecha': 2, 'Completado': 3 };
                    const ordenados = [...travels].sort((a, b) => {
                        const sa = tripStatus(a), sb = tripStatus(b);
                        if (orden[sa.label] !== orden[sb.label]) return orden[sa.label] - orden[sb.label];
                        return (b.startDate || '').localeCompare(a.startDate || '');
                    });
                    ordenados.forEach(t => {
                        const status = tripStatus(t);
                        const places2 = Array.isArray(t.places) ? t.places : [];
                        const listas2 = Array.isArray(t.listas) ? t.listas : [];
                        const itemsTotal = listas2.reduce((s, l) => s + (l.items || []).length, 0);
                        const itemsHechos = listas2.reduce((s, l) => s + (l.items || []).filter(i => i.hecho).length, 0);
                        html += `
                            <div class="trip-card" onclick="switchView('travels');openTripManager('${t.id}')">
                                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
                                    <div style="min-width:0">
                                        <span class="trip-status-badge" style="--badge-color:${status.color}">${status.label}</span>
                                        <div style="font-weight:800;font-size:16px;margin-top:6px;color:var(--text-primary)">${escapeHtml(t.title)}</div>
                                        <div style="font-size:13px;color:var(--text-secondary);margin-top:2px">${escapeHtml(t.destination || '')}${t.startDate ? ' · ' + escapeHtml(formatTravelRange(t.startDate, t.endDate)) : ''}</div>
                                    </div>
                                </div>
                                ${(places2.length || itemsTotal) ? `<div style="display:flex;gap:14px;margin-top:10px;font-size:11px;color:var(--text-secondary)">
                                    ${places2.length ? `<span>⌂ ${places2.filter(p => p.visitado).length}/${places2.length} lugares</span>` : ''}
                                    ${itemsTotal ? `<span>☷ ${itemsHechos}/${itemsTotal} preparativos</span>` : ''}
                                </div>` : ''}
                            </div>`;
                    });
                }
            } else {
                html += renderPlaces();
            }

            html += `</div></div>`;
            return html;
        }

        // ============================================================
        //  GESTOR DE VIAJES
        // ============================================================
        let tripManagerTab = 'resumen';
        let tripDocumentsCache = {};

        function openTripManager(id) {
            window._openTripId = id;
            tripManagerTab = 'resumen';
            render();
        }
        function closeTripManager() {
            window._openTripId = null;
            render();
        }
        function setTripManagerTab(tab) {
            tripManagerTab = tab;
            render();
        }

        async function deleteTripFromManager(id) {
            if (!confirm('¿Eliminar este viaje? Se perderán sus lugares, itinerario, documentos y listas.')) return;
            entries = entries.filter(e => e.id !== id);
            filteredEntries = [...entries];
            window._openTripId = null;
            render();
            try {
                await saveData();
                showToast('Viaje eliminado');
            } catch (err) {
                console.error('Error eliminando el viaje en Supabase:', err);
                showToast('No se pudo eliminar en la nube. Revisa tu conexión.', true);
            }
        }

        function renderTripManager(t) {
            if (!Array.isArray(t.places)) t.places = [];
            if (!Array.isArray(t.itinerario)) t.itinerario = [];
            if (!Array.isArray(t.listas)) t.listas = [];

            const status = tripStatus(t);
            const tabs = [
                { id: 'resumen', label: 'Resumen' },
                { id: 'lugares', label: 'Lugares', count: t.places.length },
                { id: 'itinerario', label: 'Itinerario', count: t.itinerario.length },
                { id: 'documentos', label: 'Documentos' },
                { id: 'listas', label: 'Listas', count: t.listas.length },
            ];

            let body = '';
            if (tripManagerTab === 'resumen') body = renderTripResumenTab(t);
            else if (tripManagerTab === 'lugares') body = renderTripPlacesTab(t);
            else if (tripManagerTab === 'itinerario') body = renderTripItineraryTab(t);
            else if (tripManagerTab === 'documentos') body = renderTripDocumentsTab(t);
            else if (tripManagerTab === 'listas') body = renderTripListsTab(t);

            return `
            <div style="max-width:820px">
                <button class="btn-secondary" style="width:auto;margin-bottom:14px" onclick="closeTripManager()">← Volver a Viajes</button>
                <div class="trip-manager-header">
                    <div>
                        <span class="trip-status-badge" style="--badge-color:${status.color}">${status.label}</span>
                        <div class="trip-manager-title">${escapeHtml(t.title)}</div>
                        <div class="trip-manager-sub">${escapeHtml(t.destination || '')}${t.startDate ? ' · ' + escapeHtml(formatTravelRange(t.startDate, t.endDate)) : ''}</div>
                    </div>
                    <div style="display:flex;gap:8px;flex-shrink:0">
                        <button class="btn-secondary" style="width:auto" onclick="abrirCompartirViajeModal('${t.id}')">Compartir</button>
                        <button class="btn-secondary" style="width:auto" onclick="openEditEntry('${t.id}')">✎ Editar</button>
                        <button class="btn-secondary fantasy-btn-danger" style="width:auto" onclick="deleteTripFromManager('${t.id}')">Eliminar</button>
                    </div>
                </div>
                <div class="culture-tabs" style="margin-top:16px">
                    ${tabs.map(tb => `<button class="culture-tab ${tripManagerTab === tb.id ? 'active' : ''}" onclick="setTripManagerTab('${tb.id}')"><span>${tb.label}</span>${tb.count !== undefined ? `<span class="culture-tab-count">${tb.count}</span>` : ''}</button>`).join('')}
                </div>
                <div class="culture-tab-content"><div class="cal-view-anim">${body}</div></div>
            </div>`;
        }

        // ---- Resumen ----
        function renderTripResumenTab(t) {
            const total = getTravelTotal(t);
            const itemsTotal = t.listas.reduce((s, l) => s + (l.items || []).length, 0);
            const itemsHechos = t.listas.reduce((s, l) => s + (l.items || []).filter(i => i.hecho).length, 0);
            return `
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:16px">
                    <div class="card"><div class="card-title">Lugares</div><div class="card-value">${t.places.filter(p => p.visitado).length}/${t.places.length}</div></div>
                    <div class="card"><div class="card-title">Itinerario</div><div class="card-value">${t.itinerario.length}</div></div>
                    <div class="card"><div class="card-title">Preparativos</div><div class="card-value">${itemsHechos}/${itemsTotal}</div></div>
                    ${total > 0 ? `<div class="card"><div class="card-title">Gasto total</div><div class="card-value">${total.toLocaleString('es-ES')}€</div></div>` : ''}
                </div>
                ${t.companions ? `<div class="entry-detail-field" style="margin-bottom:12px"><div class="entry-detail-label">Viajé con</div><div class="entry-detail-value">${escapeHtml(t.companions)}</div></div>` : ''}
                ${t.notes ? `<div class="entry-detail-field"><div class="entry-detail-label">Notas</div><div class="entry-detail-value">${linkifyText(t.notes)}</div></div>` : '<div class="empty-state"><div class="empty-icon">◈</div><div class="empty-title">Sin notas todavía</div><div class="empty-sub">Pulsa "Editar" arriba para añadir notas generales del viaje.</div></div>'}
            `;
        }

        // ---- Lugares ----
        function renderTripPlacesTab(t) {
            return `
                <div class="friend-add-row" style="margin-bottom:14px">
                    <input type="text" id="trip-place-input-${t.id}" class="modal-input" style="margin:0" placeholder="Sitio que quieres ver" onkeydown="if(event.key==='Enter'){event.preventDefault();addTripPlace('${t.id}')}">
                    <button class="btn-secondary" style="width:auto" onclick="addTripPlace('${t.id}')">+ Añadir</button>
                </div>
                ${t.places.length ? t.places.map(p => `
                    <div class="trip-check-row">
                        <input type="checkbox" ${p.visitado ? 'checked' : ''} onchange="toggleTripPlace('${t.id}','${p.id}')">
                        <span style="flex:1;cursor:pointer;${p.visitado ? 'text-decoration:line-through;opacity:.5' : ''}" onclick="toggleTripPlace('${t.id}','${p.id}')">${escapeHtml(p.nombre)}</span>
                        <button class="friend-remove-btn" title="Quitar" onclick="deleteTripPlace('${t.id}','${p.id}')">✕</button>
                    </div>
                `).join('') : '<div class="empty-state"><div class="empty-icon">⌂</div><div class="empty-title">Sin lugares todavía</div><div class="empty-sub">Añade los sitios que quieres visitar.</div></div>'}
            `;
        }
        async function addTripPlace(tripId) {
            const input = document.getElementById('trip-place-input-' + tripId);
            const nombre = input?.value.trim();
            if (!nombre) return;
            const t = getTrip(tripId); if (!t) return;
            if (!Array.isArray(t.places)) t.places = [];
            t.places.push({ id: 'place_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), nombre, visitado: false });
            try { await saveData(); } catch (e) { console.error(e); }
            render();
        }
        async function toggleTripPlace(tripId, placeId) {
            const t = getTrip(tripId); if (!t) return;
            const p = (t.places || []).find(x => x.id === placeId); if (!p) return;
            p.visitado = !p.visitado;
            try { await saveData(); } catch (e) { console.error(e); }
            render();
        }
        async function deleteTripPlace(tripId, placeId) {
            const t = getTrip(tripId); if (!t) return;
            t.places = (t.places || []).filter(x => x.id !== placeId);
            try { await saveData(); } catch (e) { console.error(e); }
            render();
        }

        // ---- Itinerario ----
        function renderTripItineraryTab(t) {
            const sorted = [...t.itinerario].sort((a, b) => (a.dia || '').localeCompare(b.dia || '') || (a.hora || '').localeCompare(b.hora || ''));
            return `
                <button class="btn-modal-primary" style="width:auto;margin-bottom:14px" onclick="openAddItineraryItem('${t.id}')">+ Añadir al itinerario</button>
                ${sorted.length ? sorted.map(it => `
                    <div class="card" style="margin-bottom:10px">
                        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
                            <div style="min-width:0">
                                <div style="font-size:11px;color:var(--text-secondary);font-weight:700">${it.dia ? escapeHtml(new Date(it.dia + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })) : 'Sin día'}${it.hora ? ' · ' + escapeHtml(it.hora) : ''}</div>
                                <div style="font-weight:700;margin-top:2px">${escapeHtml(it.titulo)}</div>
                                ${it.notas ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${linkifyText(it.notas)}</div>` : ''}
                            </div>
                            <button class="friend-remove-btn" title="Eliminar" onclick="deleteItineraryItem('${t.id}','${it.id}')">✕</button>
                        </div>
                    </div>
                `).join('') : '<div class="empty-state"><div class="empty-icon">◷</div><div class="empty-title">Sin itinerario todavía</div><div class="empty-sub">Añade horarios y planes para cada día del viaje.</div></div>'}
            `;
        }
        function openAddItineraryItem(tripId) {
            showModal(`
                <div class="modal-title">Añadir al itinerario</div>
                <div class="modal-row">
                    <div><div class="modal-label">Día</div><input type="date" id="it-dia" class="modal-input"></div>
                    <div><div class="modal-label">Hora (opcional)</div><input type="time" id="it-hora" class="modal-input"></div>
                </div>
                <div class="modal-label">Qué</div><input id="it-titulo" class="modal-input" placeholder="Visita al Coliseo">
                <div class="modal-label">Notas (opcional)</div><textarea id="it-notas" class="modal-input" rows="2"></textarea>
                <button class="btn-modal-primary" onclick="saveItineraryItem('${tripId}')">Guardar</button>
            `);
        }
        async function saveItineraryItem(tripId) {
            const t = getTrip(tripId); if (!t) return;
            const titulo = document.getElementById('it-titulo')?.value.trim();
            if (!titulo) { showToast('Escribe qué vas a hacer', true); return; }
            if (!Array.isArray(t.itinerario)) t.itinerario = [];
            t.itinerario.push({
                id: 'it_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                dia: document.getElementById('it-dia')?.value || '',
                hora: document.getElementById('it-hora')?.value || '',
                titulo,
                notas: document.getElementById('it-notas')?.value.trim() || ''
            });
            closeModal();
            try { await saveData(); } catch (e) { console.error(e); }
            render();
            showToast('Añadido al itinerario');
        }
        async function deleteItineraryItem(tripId, itemId) {
            const t = getTrip(tripId); if (!t) return;
            t.itinerario = (t.itinerario || []).filter(i => i.id !== itemId);
            try { await saveData(); } catch (e) { console.error(e); }
            render();
        }

        // ---- Documentos (reutiliza el bucket "documents" con prefijo por viaje) ----
        function renderTripDocumentsTab(t) {
            const docs = tripDocumentsCache[t.id];
            return `
                <div class="doc-upload-box" onclick="document.getElementById('trip-doc-input-${t.id}').click()">
                    <div style="font-size:28px;margin-bottom:6px">📄</div>
                    <div style="font-weight:600;margin-bottom:4px;color:var(--text-primary)">Sube un documento PDF de este viaje</div>
                    <div style="font-size:12px;color:var(--text-secondary)">Billetes, reservas, seguro de viaje...</div>
                </div>
                <input type="file" id="trip-doc-input-${t.id}" accept="application/pdf" style="display:none" onchange="handleTripDocUpload(event,'${t.id}')">
                <div id="trip-doc-list-${t.id}" style="margin-top:12px">${docs ? renderTripDocList(t.id, docs) : 'Cargando documentos...'}</div>
            `;
        }
        function renderTripDocList(tripId, docs) {
            if (!docs.length) return '<div class="empty-state"><div class="empty-icon">📄</div><div class="empty-title">Sin documentos</div><div class="empty-sub">Sube el primero con el botón de arriba</div></div>';
            return docs.map(doc => {
                const sizeKb = doc.metadata?.size ? Math.round(doc.metadata.size / 1024) + ' KB' : '';
                const date = doc.created_at ? new Date(doc.created_at).toLocaleDateString('es-ES') : '';
                return `<div class="doc-item">
                    <div class="doc-info"><span style="font-size:20px">📄</span><div style="min-width:0"><div class="doc-name">${escapeHtml(doc.name)}</div><div class="doc-meta">${date}${sizeKb ? ' · ' + sizeKb : ''}</div></div></div>
                    <div class="doc-actions">
                        <button class="doc-action-download" onclick="downloadTripDocument('${tripId}','${escapeHtml(doc.name)}')">Descargar</button>
                        <button class="doc-action-delete-btn" title="Eliminar" onclick="deleteTripDocument('${tripId}','${escapeHtml(doc.name)}')">✕</button>
                    </div>
                </div>`;
            }).join('');
        }
        async function loadTripDocuments(tripId) {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const { data, error } = await sb.storage.from('documents').list(`${user.id}/trips/${tripId}`, { sortBy: { column: 'created_at', order: 'desc' } });
                if (error) throw error;
                tripDocumentsCache[tripId] = data || [];
                const el = document.getElementById('trip-doc-list-' + tripId);
                if (el) el.innerHTML = renderTripDocList(tripId, tripDocumentsCache[tripId]);
            } catch (e) {
                console.error('Error cargando documentos del viaje:', e);
                const el = document.getElementById('trip-doc-list-' + tripId);
                if (el) el.innerHTML = '<div class="empty-state"><div class="empty-icon">📄</div><div class="empty-title">No se pudieron cargar los documentos</div></div>';
            }
        }
        async function handleTripDocUpload(event, tripId) {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;
            if (file.type !== 'application/pdf') { showToast('Solo se admiten archivos PDF', true); return; }
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/trips/${tripId}/${Date.now()}_${file.name}`;
                const { error } = await sb.storage.from('documents').upload(path, file, { upsert: false });
                if (error) throw error;
                showToast('Documento subido');
                await loadTripDocuments(tripId);
            } catch (e) {
                console.error('Error subiendo documento del viaje:', e);
                showToast('Error al subir: ' + (e?.message || 'desconocido'), true);
            }
        }
        async function downloadTripDocument(tripId, name) {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/trips/${tripId}/${name}`;
                const { data, error } = await sb.storage.from('documents').createSignedUrl(path, 60);
                if (error) throw error;
                window.open(data.signedUrl, '_blank');
            } catch (e) {
                console.error('Error descargando documento del viaje:', e);
                showToast('Error al descargar: ' + (e?.message || 'desconocido'), true);
            }
        }
        async function deleteTripDocument(tripId, name) {
            if (!confirm('¿Eliminar este documento? No se puede deshacer.')) return;
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/trips/${tripId}/${name}`;
                const { error } = await sb.storage.from('documents').remove([path]);
                if (error) throw error;
                showToast('Documento eliminado');
                await loadTripDocuments(tripId);
            } catch (e) {
                console.error('Error eliminando documento del viaje:', e);
                showToast('Error al eliminar: ' + (e?.message || 'desconocido'), true);
            }
        }

        // ---- Listas (varias, con nombre propio: qué llevar, qué hacer...) ----
        function renderTripListsTab(t) {
            return `
                <button class="btn-modal-primary" style="width:auto;margin-bottom:14px" onclick="openAddTripList('${t.id}')">+ Nueva lista</button>
                ${t.listas.length ? t.listas.map(l => `
                    <div class="card" style="margin-bottom:14px">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                            <div style="font-weight:800">${escapeHtml(l.nombre)} <span style="font-weight:400;color:var(--text-secondary);font-size:12px">(${(l.items || []).filter(i => i.hecho).length}/${(l.items || []).length})</span></div>
                            <button class="friend-remove-btn" title="Eliminar lista" onclick="deleteTripList('${t.id}','${l.id}')">✕</button>
                        </div>
                        ${(l.items || []).map(i => `
                            <div class="trip-check-row">
                                <input type="checkbox" ${i.hecho ? 'checked' : ''} onchange="toggleTripListItem('${t.id}','${l.id}','${i.id}')">
                                <span style="flex:1;cursor:pointer;${i.hecho ? 'text-decoration:line-through;opacity:.5' : ''}" onclick="toggleTripListItem('${t.id}','${l.id}','${i.id}')">${escapeHtml(i.texto)}</span>
                                <button class="friend-remove-btn" title="Quitar" onclick="deleteTripListItem('${t.id}','${l.id}','${i.id}')">✕</button>
                            </div>
                        `).join('')}
                        <div style="display:flex;gap:8px;margin-top:10px">
                            <input id="trip-list-item-${l.id}" class="modal-input" style="margin:0" placeholder="Añadir elemento" onkeydown="if(event.key==='Enter'){event.preventDefault();addTripListItem('${t.id}','${l.id}')}">
                            <button class="btn-secondary" style="width:auto" onclick="addTripListItem('${t.id}','${l.id}')">+ Añadir</button>
                        </div>
                    </div>
                `).join('') : '<div class="empty-state"><div class="empty-icon">☷</div><div class="empty-title">Sin listas todavía</div><div class="empty-sub">Crea una lista de qué llevar, qué hacer o lo que necesites.</div></div>'}
            `;
        }
        function openAddTripList(tripId) {
            showModal(`<div class="modal-title">Nueva lista</div><div class="modal-label">Nombre</div><input id="new-list-name" class="modal-input" placeholder="Qué llevar"><button class="btn-modal-primary" onclick="saveTripList('${tripId}')">Crear</button>`);
        }
        async function saveTripList(tripId) {
            const t = getTrip(tripId); if (!t) return;
            const nombre = document.getElementById('new-list-name')?.value.trim();
            if (!nombre) { showToast('Ponle un nombre a la lista', true); return; }
            if (!Array.isArray(t.listas)) t.listas = [];
            t.listas.push({ id: 'lista_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), nombre, items: [] });
            closeModal();
            try { await saveData(); } catch (e) { console.error(e); }
            render();
            showToast('Lista creada');
        }
        async function deleteTripList(tripId, listId) {
            if (!confirm('¿Eliminar esta lista?')) return;
            const t = getTrip(tripId); if (!t) return;
            t.listas = (t.listas || []).filter(l => l.id !== listId);
            try { await saveData(); } catch (e) { console.error(e); }
            render();
        }
        async function addTripListItem(tripId, listId) {
            const input = document.getElementById('trip-list-item-' + listId);
            const texto = input?.value.trim();
            if (!texto) return;
            const t = getTrip(tripId); if (!t) return;
            const l = (t.listas || []).find(x => x.id === listId); if (!l) return;
            if (!Array.isArray(l.items)) l.items = [];
            l.items.push({ id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), texto, hecho: false });
            try { await saveData(); } catch (e) { console.error(e); }
            render();
        }
        async function toggleTripListItem(tripId, listId, itemId) {
            const t = getTrip(tripId); if (!t) return;
            const l = (t.listas || []).find(x => x.id === listId); if (!l) return;
            const it = (l.items || []).find(x => x.id === itemId); if (!it) return;
            it.hecho = !it.hecho;
            try { await saveData(); } catch (e) { console.error(e); }
            render();
        }
        async function deleteTripListItem(tripId, listId, itemId) {
            const t = getTrip(tripId); if (!t) return;
            const l = (t.listas || []).find(x => x.id === listId); if (!l) return;
            l.items = (l.items || []).filter(x => x.id !== itemId);
            try { await saveData(); } catch (e) { console.error(e); }
            render();
        }

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

        function renderWork() {
            const work = entries.filter(e => e.type === 'work');
            if (!work.length) {
                return `<div class="empty-state"><div class="empty-icon">◫</div><div class="empty-title">Sin experiencia laboral</div><div class="empty-sub">Pulsa el botón + y selecciona "Trabajo"</div></div>`;
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

            const cotizedStats = sorted.reduce((acc, w) => {
                const cotizationDays = getCotizationDays(w, todayStr);
                if (w.cotizationType === 'practicas') acc.practicas += cotizationDays;
                else acc.general += cotizationDays;
                return acc;
            }, { practicas: 0, general: 0 });

            const totalCotized = cotizedStats.practicas + cotizedStats.general;

            let html = `
                <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:16px;max-width:980px">
                    <div class="card bone-surface work-total-bone" style="margin:0">
                        <div class="label" style="font-size:12px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.4px;font-weight:700">Total de días trabajados hasta hoy</div>
                        <div class="value" style="font-size:28px;font-weight:800;color:var(--text-primary);margin-top:4px">${totalDays} días</div>
                    </div>
                    <div class="card bone-surface work-cotization-bone" style="margin:0">
                        <div style="font-size:12px;color:var(--bone-muted);text-transform:uppercase;letter-spacing:0.4px;font-weight:700">Días cotizados</div>
                        <div class="cotization-main">${totalCotized} días</div>
                        <div class="cotization-detail"><strong>${cotizedStats.practicas}</strong> de prácticas formativas · <strong>${cotizedStats.general}</strong> de régimen general</div>
                        <div style="font-size:10px;color:var(--bone-muted);margin-top:6px;opacity:.82">Estimados automáticamente y corregibles desde «Editar → Vida laboral»</div>
                    </div>
                </div>
                <div style="max-width:980px">`;
            sorted.forEach(w => {
                const cat = categories.find(c => c.id === w.categoryId);
                const color = cat?.color || 'var(--text-secondary)';
                const isActive = !w.endDate || w.endDate >= todayStr;
                const effectiveEnd = isActive ? todayStr : w.endDate;
                const calculatedDaysHere = daysBetween(w.startDate, effectiveEnd);
                const manualDaysHere = Number(w.cotizedDays);
                const daysHere = Number.isFinite(manualDaysHere) && manualDaysHere >= 0
                    ? manualDaysHere
                    : calculatedDaysHere;
                const statusClass = isActive ? 'badge-progress' : 'badge-done';
                const statusLabel = isActive ? `Trabajando en ${w.title}` : (w.status || 'Finalizado');
                const scheduleText = (w.startTime || w.endTime) ? `${w.startTime || '--'} - ${w.endTime || '--'}` : (w
                    .schedule || '');
                html += `
                    <div class="card" style="margin-bottom:12px;cursor:pointer" onclick="openEntryDetail(\'${w.id}\')">
                        <div style="display:flex;justify-content:space-between;align-items:center">
                            <span style="font-weight:700;font-size:16px;color:var(--text-primary)">${w.title}</span>
                            <span style="font-size:12px;color:var(--text-secondary)">${w.position || ''}</span>
                        </div>
                        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px">
                            <span style="font-size:12px;color:var(--text-secondary)">${w.startDate || ''} ${w.endDate ? '→ ' + w.endDate : '→ Actual'}</span>
                            <span class="badge ${statusClass}">${statusLabel}</span>
                            <span style="font-size:12px;color:var(--text-secondary)">${daysHere} días</span>
                            <span style="font-size:11px;color:var(--text-secondary)">${getCotizationDays(w, todayStr)} días cotizados · ${getCotizationSource(w)}</span>
                        </div>
                        ${scheduleText ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${scheduleText}</div>` : ''}
                        ${w.salary ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${w.salary}€/mes</div>` : ''}
                        ${w.notes ? `<div style="font-size:13px;color:var(--text-secondary);margin-top:6px">${linkifyText(w.notes)}</div>` : ''}
                        <div class="entry-color-dot" style="background:${color};margin-top:6px"></div>
                    </div>`;
            });
            html += `</div>`;
            return html;
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

        function renderStudies() {
            const nextExam = nextUpcomingExam();
            return `
            <div class="studies-view">
                <div class="studies-actions-row">
                    <div class="studies-actions-stack">
                        <button class="btn-modal-primary studies-inline-add-btn btn-accent-blue" onclick="openAddSubject()">+ asignatura</button>
                        <button class="btn-modal-primary studies-inline-add-btn" onclick="openAddQuickNote()">+ nota rápida</button>
                        <button class="btn-modal-primary studies-inline-add-btn" onclick="openQuickNotesList()">notas rápidas${(studies.quickNotes || []).length ? ` (${studies.quickNotes.length})` : ''}</button>
                    </div>
                </div>

                ${nextExam ? `
                <div class="event-hero" style="border-color:${(nextExam.subjectColor || '#3b82f6')}66;margin-bottom:18px">
                    <div class="event-hero-kicker" style="color:${nextExam.subjectColor || '#3b82f6'}">Próximo examen · ${eventCountdownLabel(nextExam.date)}</div>
                    <div class="event-hero-title">${escapeHtml(nextExam.title || 'Examen')} — ${escapeHtml(nextExam.subjectName)}</div>
                    <div class="event-hero-meta">${escapeHtml(nextExam.date)}</div>
                </div>` : ''}

                <section class="studies-section" id="studies-schedule-section">
                    <h3>Horario semanal</h3>
                    ${renderScheduleGrid()}
                </section>

                <section class="studies-section" id="studies-subjects-section">
                    <h3>Asignaturas</h3>
                    ${studies.subjects.length ? `<div class="studies-subjects-grid">${studies.subjects.map(renderSubjectCard).join('')}</div>` : '<div class="finance-empty-line">Aún no has añadido ninguna asignatura.</div>'}
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

        // ============================================================
        //  RENDER: ENLACES
        // ============================================================
        const LINK_CATEGORY_COLORS = ['#FFADAD', '#FFD6A5', '#FDFFB6', '#CAFFBF', '#9BF6FF', '#BDB2FF'];

        function renderLinks() {
            const nameDisplay = userName && userName.trim() ? escapeHtml(userName.trim()) : 'tu nombre';
            const hasCategories = linkCategories.length > 0;
            let body;
            if (!links.length) {
                body = '<div class="finance-empty-line" style="margin-top:14px">Aún no has añadido ningún enlace.</div>';
            } else if (!hasCategories) {
                body = `<div class="links-grid">${links.map(l => renderLinkCard(l, null)).join('')}</div>`;
            } else {
                const grouped = {};
                links.forEach(l => {
                    const key = l.categoryId || '__none__';
                    (grouped[key] = grouped[key] || []).push(l);
                });
                const blocks = linkCategories.filter(c => grouped[c.id]).map(c => renderLinkCategoryBlock(c.name, c.color, grouped[c.id]));
                if (grouped.__none__) blocks.push(renderLinkCategoryBlock('Sin categoría', null, grouped.__none__));
                body = blocks.join('');
            }
            return `
            <div class="links-view">
                <div class="studies-actions-row">
                    <div class="studies-actions-stack">
                        <button class="btn-modal-primary studies-inline-add-btn btn-accent-blue" onclick="openAddLink()">+ enlace</button>
                        <button class="btn-modal-primary studies-inline-add-btn" onclick="openAddLinkCategory()">+ categoría</button>
                    </div>
                </div>
                <h3>Accesos directos de <a href="javascript:void(0)" class="bitacora-username-link" onclick="editUserName()">${nameDisplay}</a></h3>
                ${body}
            </div>`;
        }

        function renderLinkCategoryBlock(name, color, items) {
            return `
                <section class="studies-section">
                    <div class="links-category-head">${color ? `<span class="links-category-dot" style="background:${color}"></span>` : ''}${escapeHtml(name)}</div>
                    <div class="links-grid">${items.map(l => renderLinkCard(l, color)).join('')}</div>
                </section>`;
        }

        function renderLinkCard(l, color) {
            return `
                <div class="link-card" style="${color ? `border:3px solid ${color}` : ''}">
                    <div class="link-card-actions">
                        <button class="link-card-icon-btn link-card-delete" title="Eliminar" onclick="deleteLink('${l.id}')">✕</button>
                        <button class="link-card-icon-btn link-card-edit" title="Editar" onclick="openEditLink('${l.id}')">✎</button>
                    </div>
                    <div class="link-card-title">${escapeHtml(l.title)}</div>
                    <a href="javascript:void(0)" class="link-card-url" data-ext-url="${escapeHtml(l.url)}" onclick="openLinkPopup(event,this)">enlace</a>
                </div>`;
        }

        function openLinkPopup(event, el) {
            event.preventDefault();
            event.stopPropagation();
            const url = el.dataset.extUrl;
            if (!url) return;
            const w = 1000, h = 520;
            const left = Math.round((screen.width - w) / 2), top = Math.round((screen.height - h) / 2);
            window.open(url, '_blank', `noopener,width=${w},height=${h},left=${left},top=${top}`);
        }

        function openAddLink() {
            showModal(`
                <div class="modal-title">+ Enlace</div>
                <div class="modal-label">Título</div>
                <input id="link-title" class="modal-input" placeholder="Ej: Campus virtual">
                <div class="modal-label">Enlace (URL)</div>
                <input id="link-url" class="modal-input" placeholder="https://...">
                <div class="modal-label">Categoría</div>
                <select id="link-category" class="modal-input">
                    <option value="">Sin categoría</option>
                    ${linkCategories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
                </select>
                <button class="btn-modal-primary" onclick="saveNewLink()">Añadir enlace</button>
            `);
        }

        async function saveNewLink() {
            const title = document.getElementById('link-title')?.value.trim();
            let url = document.getElementById('link-url')?.value.trim();
            const categoryId = document.getElementById('link-category')?.value || null;
            if (!title || !url) { showToast('Indica un título y un enlace', true); return; }
            if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
            links.unshift({ id: 'link_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), title, url, categoryId, createdAt: new Date().toISOString() });
            closeModal();
            render();
            try { await saveData(); showToast('Enlace añadido'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteLink(id) {
            links = links.filter(l => l.id !== id);
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openEditLink(id) {
            const l = links.find(x => x.id === id);
            if (!l) return;
            showModal(`
                <div class="modal-title">Editar enlace</div>
                <div class="modal-label">Título</div>
                <input id="link-title" class="modal-input" value="${escapeHtml(l.title)}">
                <div class="modal-label">Enlace (URL)</div>
                <input id="link-url" class="modal-input" value="${escapeHtml(l.url)}">
                <div class="modal-label">Categoría</div>
                <select id="link-category" class="modal-input">
                    <option value="">Sin categoría</option>
                    ${linkCategories.map(c => `<option value="${c.id}" ${c.id === l.categoryId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                </select>
                <button class="btn-modal-primary" onclick="saveEditLink('${id}')">Guardar cambios</button>
            `);
        }

        async function saveEditLink(id) {
            const l = links.find(x => x.id === id);
            if (!l) return;
            const title = document.getElementById('link-title')?.value.trim();
            let url = document.getElementById('link-url')?.value.trim();
            const categoryId = document.getElementById('link-category')?.value || null;
            if (!title || !url) { showToast('Indica un título y un enlace', true); return; }
            if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
            l.title = title; l.url = url; l.categoryId = categoryId;
            closeModal();
            render();
            try { await saveData(); showToast('Enlace actualizado'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openAddLinkCategory() {
            showModal(`
                <div class="modal-title">+ Categoría</div>
                <div class="modal-label">Nombre</div>
                <input id="link-cat-name" class="modal-input" placeholder="Ej: Universidad">
                <div class="modal-label">Color</div>
                <div class="link-color-picker">
                    ${LINK_CATEGORY_COLORS.map((c, i) => `<button type="button" class="link-color-swatch ${i === 0 ? 'selected' : ''}" style="background:${c}" data-color="${c}" onclick="selectLinkColor(this)"></button>`).join('')}
                </div>
                <input type="hidden" id="link-cat-color" value="${LINK_CATEGORY_COLORS[0]}">
                <button class="btn-modal-primary" onclick="saveNewLinkCategory()">Crear categoría</button>
            `);
        }

        function selectLinkColor(btn) {
            btn.parentElement.querySelectorAll('.link-color-swatch').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            document.getElementById('link-cat-color').value = btn.dataset.color;
        }

        async function saveNewLinkCategory() {
            const name = document.getElementById('link-cat-name')?.value.trim();
            const color = document.getElementById('link-cat-color')?.value || LINK_CATEGORY_COLORS[0];
            if (!name) { showToast('Indica un nombre para la categoría', true); return; }
            linkCategories.push({ id: 'lcat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name, color });
            closeModal();
            render();
            try { await saveData(); showToast('Categoría creada'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // Nota final ponderada: si algún examen/trabajo tiene peso indicado,
        // se usa media ponderada solo con los que tienen nota Y peso; si no
        // hay ningún peso indicado, se cae a la media simple de las notas
        // que haya (compatibilidad con asignaturas ya creadas sin peso).
        function subjectFinalGrade(s) {
            const items = [...(s.exams || []), ...(s.assignments || [])];
            const graded = items.filter(x => x.grade !== '' && x.grade !== null && x.grade !== undefined && !isNaN(Number(x.grade)));
            if (!graded.length) return null;
            const weighted = graded.filter(x => x.weight !== '' && x.weight !== null && x.weight !== undefined && !isNaN(Number(x.weight)) && Number(x.weight) > 0);
            if (weighted.length) {
                const sumW = weighted.reduce((sum, x) => sum + Number(x.weight), 0);
                return sumW > 0 ? weighted.reduce((sum, x) => sum + Number(x.grade) * Number(x.weight), 0) / sumW : null;
            }
            return graded.reduce((sum, x) => sum + Number(x.grade), 0) / graded.length;
        }

        function renderSubjectCard(s) {
            const finalGrade = subjectFinalGrade(s);
            return `
                <div class="studies-subject-card">
                    <a href="javascript:void(0)" class="studies-subject-link" onclick="openSubjectDetail('${s.id}')">${escapeHtml(s.name)}</a>
                    ${finalGrade !== null ? `<div class="studies-subject-avg">Nota final: ${finalGrade.toFixed(2)}</div>` : ''}
                    <div class="studies-subject-block">
                        <div class="studies-subject-block-head">Trabajos</div>
                        ${(s.assignments || []).length ? s.assignments.map(renderSubjectCardLine).join('') : '<div class="studies-subject-block-empty">Sin trabajos todavía.</div>'}
                    </div>
                    <div class="studies-subject-block">
                        <div class="studies-subject-block-head">Exámenes</div>
                        ${(s.exams || []).length ? s.exams.map(renderSubjectCardLine).join('') : '<div class="studies-subject-block-empty">Sin exámenes todavía.</div>'}
                    </div>
                </div>`;
        }

        function renderSubjectCardLine(item) {
            const grade = item.grade !== '' && item.grade !== null && item.grade !== undefined ? item.grade : '—';
            const weight = item.weight !== '' && item.weight !== null && item.weight !== undefined ? item.weight + '%' : '—';
            return `<div class="studies-subject-item-line">${escapeHtml(item.title || 'Sin título')} - nota: ${escapeHtml(String(grade))} / peso: ${escapeHtml(String(weight))}</div>`;
        }

        function openAddSubject() {
            showModal(`
                <div class="modal-title">+ Asignatura</div>
                <div class="modal-label">Nombre</div>
                <input id="subject-name" class="modal-input" placeholder="Ej: Cálculo I">
                <div class="modal-label">Color</div>
                <input id="subject-color" class="modal-input" type="color" value="#5b8def" style="height:40px;padding:4px">
                <button class="btn-modal-primary" onclick="saveNewSubject()">Añadir asignatura</button>
            `);
            setTimeout(() => document.getElementById('subject-name')?.focus(), 50);
        }

        async function saveNewSubject() {
            const name = document.getElementById('subject-name')?.value.trim();
            if (!name) { showToast('Indica un nombre para la asignatura', true); return; }
            const color = document.getElementById('subject-color')?.value || '#5b8def';
            studies.subjects.push({ id: 'subj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name, color, exams: [], assignments: [] });
            closeModal();
            render();
            try { await saveData(); showToast('Asignatura añadida'); }
            catch (e) { console.error('Error guardando la asignatura en Supabase:', e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteSubject(id) {
            if (!confirm('¿Eliminar esta asignatura y todos sus exámenes/trabajos?')) return;
            const s = findSubject(id);
            if (s) [...(s.exams || []), ...(s.assignments || [])].forEach(item => removeLinkedExamEvent(item.id));
            studies.subjects = studies.subjects.filter(s => s.id !== id);
            closeModal();
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openSubjectDetail(id) {
            const s = findSubject(id);
            if (!s) return;
            showModal(renderSubjectDetailModal(s));
        }

        function renderSubjectDetailModal(s) {
            return `
                <div class="modal-title">${escapeHtml(s.name)}</div>
                <div class="studies-modal-block">
                    <div class="modal-label" style="display:flex;justify-content:space-between;align-items:center">Exámenes <button class="finance-icon-btn" onclick="addSubjectItem('${s.id}','exams')">+</button></div>
                    ${(s.exams || []).length ? s.exams.map((ex, i) => renderSubjectItemRow(s.id, 'exams', ex, i)).join('') : '<div class="finance-empty-line">Sin exámenes todavía.</div>'}
                </div>
                <div class="studies-modal-block">
                    <div class="modal-label" style="display:flex;justify-content:space-between;align-items:center">Trabajos <button class="finance-icon-btn" onclick="addSubjectItem('${s.id}','assignments')">+</button></div>
                    ${(s.assignments || []).length ? s.assignments.map((a, i) => renderSubjectItemRow(s.id, 'assignments', a, i)).join('') : '<div class="finance-empty-line">Sin trabajos todavía.</div>'}
                </div>
                <button class="finance-oneoff-btn" style="color:#dc2626;border-color:#dc2626" onclick="deleteSubject('${s.id}')">Eliminar asignatura</button>
            `;
        }

        function renderSubjectItemRow(subjectId, listKey, item, index) {
            return `
                <div class="studies-item-row">
                    <input class="modal-input" style="flex:2;margin:0" value="${escapeHtml(item.title || '')}" placeholder="Título" onchange="updateSubjectItem('${subjectId}','${listKey}',${index},'title',this.value)">
                    <input class="modal-input" style="flex:1;margin:0" type="date" value="${item.date || ''}" onchange="updateSubjectItem('${subjectId}','${listKey}',${index},'date',this.value)">
                    <input class="modal-input" style="flex:0 0 60px;margin:0" type="number" min="0" max="10" step="0.1" value="${item.grade ?? ''}" placeholder="Nota" onchange="updateSubjectItem('${subjectId}','${listKey}',${index},'grade',this.value)">
                    <input class="modal-input" style="flex:0 0 60px;margin:0" type="number" min="0" max="100" step="1" value="${item.weight ?? ''}" placeholder="Peso %" onchange="updateSubjectItem('${subjectId}','${listKey}',${index},'weight',this.value)">
                    <button title="Eliminar" onclick="removeSubjectItem('${subjectId}','${listKey}',${index})">✕</button>
                </div>`;
        }

        function addSubjectItem(subjectId, listKey) {
            const s = findSubject(subjectId);
            if (!s) return;
            s[listKey] = s[listKey] || [];
            s[listKey].push({ id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), title: '', date: '', grade: '', weight: '' });
            openSubjectDetail(subjectId);
        }

        async function updateSubjectItem(subjectId, listKey, index, field, value) {
            const s = findSubject(subjectId);
            if (!s || !s[listKey] || !s[listKey][index]) return;
            s[listKey][index][field] = value;
            if (field === 'title' || field === 'date') syncExamCalendarEvent(s, listKey, s[listKey][index]);
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function removeSubjectItem(subjectId, listKey, index) {
            const s = findSubject(subjectId);
            if (!s || !s[listKey]) return;
            const item = s[listKey][index];
            if (item) removeLinkedExamEvent(item.id);
            s[listKey].splice(index, 1);
            openSubjectDetail(subjectId);
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // Sincroniza un examen/trabajo con fecha hacia un evento normal de
        // Bitácora (visible en el calendario y en la alerta diaria), sin
        // necesidad de crearlo a mano dos veces. Se identifica por
        // `linkedItemId` para poder actualizarlo o borrarlo cuando cambie.
        function syncExamCalendarEvent(subject, listKey, item) {
            const existingIdx = entries.findIndex(e => e.linkedItemId === item.id);
            if (!item.date) {
                if (existingIdx !== -1) entries.splice(existingIdx, 1);
                return;
            }
            const label = listKey === 'exams' ? 'Examen' : 'Entrega';
            const title = `${label}: ${item.title || 'Sin título'} (${subject.name})`;
            if (existingIdx !== -1) {
                entries[existingIdx].title = title;
                entries[existingIdx].date = item.date;
            } else {
                entries.push({
                    id: 'evt_' + item.id, type: 'event', eventType: 'otro', title, date: item.date, notes: '',
                    linkedItemId: item.id, linkedSubjectId: subject.id, linkedKind: listKey
                });
            }
        }

        function removeLinkedExamEvent(itemId) {
            const idx = entries.findIndex(e => e.linkedItemId === itemId);
            if (idx !== -1) entries.splice(idx, 1);
        }

        // Resalta el bloque de "ahora mismo": el de hora de inicio más
        // reciente que ya haya pasado, dentro del día de hoy. Al no haber
        // hora de fin, se asume que sigue siendo la clase actual hasta que
        // empiece la siguiente (o hasta medianoche si es la última).
        const STUDIES_DAY_KEYS_BY_JS_DAY = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
        function todayScheduleKey() { return STUDIES_DAY_KEYS_BY_JS_DAY[new Date().getDay()]; }

        function currentScheduleBlockIndex(dayKey) {
            if (dayKey !== todayScheduleKey()) return -1;
            const blocks = studies.schedule[dayKey] || [];
            const nowHM = new Date().toTimeString().slice(0, 5);
            let idx = -1;
            blocks.forEach((b, i) => { if (b.time && b.time <= nowHM) idx = i; });
            return idx;
        }

        function refreshScheduleHighlight() {
            if (currentView !== 'studies') return;
            const wrap = document.getElementById('studies-schedule-grid');
            if (wrap) wrap.outerHTML = renderScheduleGrid();
        }
        if (!window._scheduleHighlightTimer) window._scheduleHighlightTimer = setInterval(refreshScheduleHighlight, 60000);

        // Cuadrícula estilo Google Calendar, en franjas de 30 minutos: solo
        // se pintan las franjas en las que hay alguna clase esa semana (en
        // cualquier día) — así no queda un hueco enorme en blanco entre,
        // por ejemplo, las 8:00 y las 15:00 si no hay nada a esas horas.
        // Se usan franjas de 30 min (no de 1 hora completa) porque es muy
        // habitual tener dos clases seguidas dentro de la misma hora (p.ej.
        // 15:00 y 15:55): con franjas de 1h esas dos clases tenían que
        // apretarse o desbordar su celda; con 30 min casi siempre caen cada
        // una en su propia franja. Si no hay ninguna clase todavía, se cae
        // a un rango por defecto (8:00-21:30) para poder añadir la primera.
        const SCHEDULE_ROW_PX = 40;
        const SCHEDULE_ADD_ROW_PX = 24;
        function scheduleTimeToBucket(time) {
            const h = parseInt(String(time || '0').slice(0, 2), 10) || 0;
            const m = parseInt(String(time || '0').slice(3, 5), 10) || 0;
            return h * 2 + (m >= 30 ? 1 : 0);
        }
        function scheduleBucketLabel(bucket) {
            return `${String(Math.floor(bucket / 2)).padStart(2, '0')}:${bucket % 2 === 0 ? '00' : '30'}`;
        }
        function scheduleActiveBuckets() {
            const set = new Set();
            STUDIES_SCHEDULE_DISPLAY_DAYS.forEach(d => {
                (studies.schedule[d.key] || []).forEach(b => { if (b.time) set.add(scheduleTimeToBucket(b.time)); });
            });
            if (!set.size) { for (let bk = 16; bk <= 43; bk++) set.add(bk); }
            return [...set].sort((a, b) => a - b);
        }

        function renderScheduleGrid() {
            const buckets = scheduleActiveBuckets();
            const bucketRow = new Map(buckets.map((bk, i) => [bk, i]));
            const contentHeight = buckets.length * SCHEDULE_ROW_PX;
            const totalHeight = contentHeight + SCHEDULE_ADD_ROW_PX;

            const nowHM = new Date();
            const nowBucket = nowHM.getHours() * 2 + (nowHM.getMinutes() >= 30 ? 1 : 0);
            const minutesIntoBucket = nowHM.getMinutes() % 30;
            const showNowLine = STUDIES_SCHEDULE_DISPLAY_DAYS.some(d => d.key === todayScheduleKey()) && bucketRow.has(nowBucket);
            const nowTop = showNowLine ? (bucketRow.get(nowBucket) + minutesIntoBucket / 30) * SCHEDULE_ROW_PX : 0;

            return `
                <div class="studies-schedule-grid" id="studies-schedule-grid">
                    <div class="studies-schedule-headrow">
                        <div class="studies-schedule-head-gutter"></div>
                        ${STUDIES_SCHEDULE_DISPLAY_DAYS.map(d => `<div class="studies-day-head">${escapeHtml(d.label)}</div>`).join('')}
                    </div>
                    <div class="studies-schedule-body" style="height:${totalHeight}px">
                        <div class="studies-schedule-hours">
                            ${buckets.map(bk => `<div class="studies-hour-label" style="height:${SCHEDULE_ROW_PX}px">${scheduleBucketLabel(bk)}</div>`).join('')}
                        </div>
                        <div class="studies-schedule-days">
                            ${buckets.map((bk, i) => `<div class="studies-hour-line" style="top:${i * SCHEDULE_ROW_PX}px"></div>`).join('')}
                            ${STUDIES_SCHEDULE_DISPLAY_DAYS.map(d => renderScheduleDayColumn(d, bucketRow, contentHeight)).join('')}
                            ${showNowLine ? `<div class="studies-now-line" style="top:${nowTop}px"><span class="studies-now-dot"></span></div>` : ''}
                        </div>
                    </div>
                </div>`;
        }

        function renderScheduleDayColumn(d, bucketRow, contentHeight) {
            const blocks = studies.schedule[d.key] || [];
            const nowIdx = currentScheduleBlockIndex(d.key);
            // Cada bloque ocupa directamente la franja entera de sus 30
            // minutos. Si, aun así, dos clases cayeran en la misma franja
            // (raro), se apilan dentro de esa misma celda en vez de
            // solaparse.
            const byBucket = new Map();
            blocks.forEach((b, i) => {
                const bk = scheduleTimeToBucket(b.time);
                if (!byBucket.has(bk)) byBucket.set(bk, []);
                byBucket.get(bk).push({ b, i });
            });
            let cellsHtml = '';
            byBucket.forEach((items, bk) => {
                const rowIdx = bucketRow.has(bk) ? bucketRow.get(bk) : 0;
                const top = rowIdx * SCHEDULE_ROW_PX;
                cellsHtml += `<div class="studies-hour-cell" style="top:${top}px;height:${SCHEDULE_ROW_PX}px">`;
                cellsHtml += items.map(({ b, i }) => `
                    <div class="studies-block ${i === nowIdx ? 'studies-block-now' : ''}">
                        <span>${escapeHtml(b.time || '')} ${escapeHtml(b.subject || '')}</span>
                        <button title="Eliminar" onclick="removeScheduleBlock('${d.key}',${i})">✕</button>
                    </div>`).join('');
                cellsHtml += `</div>`;
            });
            return `
                <div class="studies-day-col">
                    ${cellsHtml}
                    <button class="studies-day-add" style="top:${contentHeight}px" title="Añadir clase" onclick="openAddScheduleBlock('${d.key}')">+</button>
                </div>`;
        }

        function openAddScheduleBlock(dayKey) {
            showModal(`
                <div class="modal-title">Añadir clase</div>
                <div class="modal-label">Hora</div>
                <input id="schedule-time" class="modal-input" type="time">
                <div class="modal-label">Asignatura / texto</div>
                <input id="schedule-subject" class="modal-input" placeholder="Ej: Cálculo I - Aula 3">
                <button class="btn-modal-primary" onclick="saveScheduleBlock('${dayKey}')">Añadir</button>
            `);
        }

        async function saveScheduleBlock(dayKey) {
            const time = document.getElementById('schedule-time')?.value || '';
            const subject = document.getElementById('schedule-subject')?.value.trim();
            if (!subject) { showToast('Indica el nombre de la clase', true); return; }
            studies.schedule[dayKey] = studies.schedule[dayKey] || [];
            studies.schedule[dayKey].push({ time, subject });
            studies.schedule[dayKey].sort((a, b) => String(a.time).localeCompare(String(b.time)));
            closeModal();
            render();
            try { await saveData(); showToast('Clase añadida'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function removeScheduleBlock(dayKey, index) {
            if (!studies.schedule[dayKey]) return;
            studies.schedule[dayKey].splice(index, 1);
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // ============================================================
        //  RENDER: PROJECTS
        // ============================================================
        // Los proyectos antiguos usaban "En desarrollo" (derivado automáticamente
        // de la fecha fin). Esto normaliza cualquier valor histórico a las 3
        // columnas del tablero, sin necesidad de migrar datos.
        function projectStatusBucket(status) {
            if (status === 'Completado') return 'Completado';
            if (status === 'En progreso' || status === 'En desarrollo') return 'En progreso';
            return 'Pendiente';
        }

        const PROJECT_PRIORITY_COLOR = { alta: '#f87171', media: '#eab308', baja: '#4ade80' };
        const PROJECT_PRIORITY_LABEL = { alta: 'Alta', media: 'Media', baja: 'Baja' };

        function projectTaskProgress(p) {
            const total = p.tasks?.length || 0;
            const done = p.tasks?.filter(t => t.done).length || 0;
            return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
        }

        let projectViewMode = 'list';
        function setProjectViewMode(mode) { projectViewMode = mode; render(); }

        function renderProjects() {
            const projects = entries.filter(e => e.type === 'project');
            if (!projects.length) {
                return `<div class="empty-state"><div class="empty-icon">⊞</div><div class="empty-title">Sin proyectos</div><div class="empty-sub">Pulsa el botón + y selecciona "Proyecto"</div></div>`;
            }

            const toggle = `
                <div class="culture-tabs" style="margin-bottom:18px">
                    <button class="culture-tab ${projectViewMode === 'list' ? 'active' : ''}" onclick="setProjectViewMode('list')">Lista</button>
                    <button class="culture-tab ${projectViewMode === 'kanban' ? 'active' : ''}" onclick="setProjectViewMode('kanban')">Tablero</button>
                </div>`;

            return `<div style="max-width:980px">${toggle}<div class="cal-view-anim">${projectViewMode === 'kanban' ? renderProjectsKanban(projects) : renderProjectsList(projects)}</div></div>`;
        }

        function renderProjectsList(projects) {
            const today = todayISO();
            const sorted = [...projects].sort((a, b) => {
                const aActive = projectStatusBucket(a.status) !== 'Completado', bActive = projectStatusBucket(b.status) !== 'Completado';
                if (aActive !== bActive) return aActive ? -1 : 1;
                return (b.startDate || '').localeCompare(a.startDate || '');
            });

            let html = '<div class="projects-grid">';
            sorted.forEach(p => {
                const cat = categories.find(c => c.id === p.categoryId);
                const color = cat?.color || 'var(--text-secondary)';
                const bucket = projectStatusBucket(p.status);
                const statusClass = bucket === 'Completado' ? 'badge-done' : bucket === 'En progreso' ? 'badge-progress' : 'badge-pending';
                const { total, done, pct } = projectTaskProgress(p);
                const overdue = p.endDate && p.endDate < today && bucket !== 'Completado';
                const priority = p.priority || 'media';
                const features = Array.isArray(p.features) ? p.features : [];

                html += `
                    <div class="project-card ${bucket === 'Completado' ? 'bone-surface project-completed-bone' : ''}" style="border-top-color:${color}" onclick="openEntryDetail('${p.id}')">
                        <div class="project-card-head">
                            <span class="project-card-title">${escapeHtml(p.title)}</span>
                            <span class="project-priority-dot" style="background:${PROJECT_PRIORITY_COLOR[priority]}" title="Prioridad ${PROJECT_PRIORITY_LABEL[priority]}"></span>
                        </div>
                        <div class="project-card-meta">
                            <span class="badge ${statusClass}">${bucket}</span>
                            <span>${escapeHtml(p.projectCategory || 'Sin categoría')}</span>
                            ${p.endDate ? `<span class="${overdue ? 'project-overdue' : ''}">${overdue ? '⚠ ' : '◷ '}${escapeHtml(p.endDate)}</span>` : ''}
                        </div>
                        ${p.description ? `<div class="project-card-desc">${escapeHtml(p.description)}</div>` : ''}
                        ${total > 0 ? `
                            <div class="progress-bar-bg" style="margin-top:10px"><div class="progress-bar-fill" style="width:${pct}%;background:#2563eb"></div></div>
                            <div class="project-card-progress-label">${done}/${total} hitos · ${pct}%</div>
                        ` : ''}
                        ${features.length ? `<div class="project-features" style="margin-top:10px">${features.slice(0, 3).map(f => `<div class="project-feature-chip"><b>${escapeHtml(f.label)}</b>${f.value ? `<span>${escapeHtml(f.value)}</span>` : ''}</div>`).join('')}${features.length > 3 ? `<div class="project-feature-chip">+${features.length - 3}</div>` : ''}</div>` : ''}
                    </div>`;
            });
            html += '</div>';
            return html;
        }

        function renderProjectsKanban(projects) {
            const today = todayISO();
            const columns = ['Pendiente', 'En progreso', 'Completado'];
            return `<div class="kanban-board" id="projects-kanban-board">
                ${columns.map(col => {
                    const items = projects.filter(p => projectStatusBucket(p.status) === col);
                    return `
                    <div class="kanban-column" ondragover="event.preventDefault()" ondrop="projectColumnDrop(event,'${col}')">
                        <div class="kanban-column-head">${col} <span>${items.length}</span></div>
                        ${items.map(p => {
                            const cat = categories.find(c => c.id === p.categoryId);
                            const color = cat?.color || 'var(--text-secondary)';
                            const { total, done, pct } = projectTaskProgress(p);
                            const overdue = p.endDate && p.endDate < today && col !== 'Completado';
                            const priority = p.priority || 'media';
                            return `
                            <div class="kanban-card" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${p.id}')" onclick="openEntryDetail('${p.id}')" style="border-left:4px solid ${color}">
                                <div class="kanban-card-title">${escapeHtml(p.title)}</div>
                                ${total > 0 ? `<div class="progress-bar-bg" style="margin-top:8px"><div class="progress-bar-fill" style="width:${pct}%;background:#2563eb"></div></div>` : ''}
                                <div class="kanban-card-foot">
                                    <span class="project-priority-dot" style="background:${PROJECT_PRIORITY_COLOR[priority]}" title="Prioridad ${PROJECT_PRIORITY_LABEL[priority]}"></span>
                                    ${p.endDate ? `<span class="${overdue ? 'project-overdue' : ''}">${escapeHtml(p.endDate)}</span>` : '<span></span>'}
                                </div>
                            </div>`;
                        }).join('') || '<div class="kanban-empty">Arrastra aquí un proyecto</div>'}
                    </div>`;
                }).join('')}
            </div>`;
        }

        async function projectColumnDrop(event, status) {
            event.preventDefault();
            const id = event.dataTransfer.getData('text/plain');
            const p = entries.find(e => e.id === id && e.type === 'project');
            if (!p || projectStatusBucket(p.status) === status) return;
            p.status = status;
            // Solo se repinta el tablero (no toda la pantalla) para que
            // soltar una tarjeta se sienta instantáneo.
            const board = document.getElementById('projects-kanban-board');
            if (board) board.outerHTML = renderProjectsKanban(entries.filter(e => e.type === 'project'));
            else render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // ============================================================
        //  RENDER: EVENTS
        // ============================================================
        const EVENT_ICONS = { social: '◈', teatro: '◊', cine: '▸', concierto: '♪', deporte: '◉', otro: '◈' };

        function nextUpcomingEvent(events) {
            const today = todayISO();
            const upcoming = events.filter(e => e.date && e.date >= today)
                .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
            return upcoming[0] || null;
        }

        function eventCountdownLabel(dateStr) {
            const days = Math.round((new Date(dateStr + 'T00:00:00') - new Date(todayISO() + 'T00:00:00')) / 86400000);
            if (days <= 0) return 'Hoy';
            if (days === 1) return 'Mañana';
            return `En ${days} días`;
        }

        function renderEvents() {
            const allEvents = entries.filter(e => e.type === 'event');
            if (!allEvents.length) {
                return `<div class="empty-state"><div class="empty-icon">◈</div><div class="empty-title">Sin eventos</div><div class="empty-sub">Pulsa el botón + y selecciona "Evento"</div></div>`;
            }
            const { items: events, banner } = applyMonthFilterTo('event', allEvents);
            if (!events.length) return banner + `<div class="empty-state"><div class="empty-icon">◈</div><div class="empty-title">Sin eventos ese mes</div></div>`;

            const sorted = [...events].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            const next = entryMonthFilter && entryMonthFilter.type === 'event' ? null : nextUpcomingEvent(events);

            const groups = [];
            const byKey = {};
            sorted.forEach(e => {
                const key = (e.date || '').slice(0, 7) || 'sin-fecha';
                if (!byKey[key]) { byKey[key] = { key, items: [] }; groups.push(byKey[key]); }
                byKey[key].items.push(e);
            });
            const monthLabel = key => {
                if (key === 'sin-fecha') return 'Sin fecha';
                const [y, m] = key.split('-').map(Number);
                return new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
            };

            let html = `<div style="max-width:980px">` + banner;

            if (next) {
                const nextCat = categories.find(c => c.id === next.categoryId);
                const nextColor = nextCat?.color || '#3b82f6';
                html += `
                    <div class="event-hero" style="border-color:${nextColor}66" onclick="openEntryDetail('${next.id}')">
                        <div class="event-hero-kicker" style="color:${nextColor}">Próximo evento · ${eventCountdownLabel(next.date)}</div>
                        <div class="event-hero-title">${escapeHtml(next.title)}</div>
                        <div class="event-hero-meta">${escapeHtml(next.date)}${next.time ? ' · ' + escapeHtml(next.time) : ''}${next.place ? ' · ' + escapeHtml(next.place) : ''}</div>
                    </div>`;
            }

            groups.forEach(g => {
                html += `<div class="events-month-label">${escapeHtml(monthLabel(g.key))}</div><div class="events-month-grid">`;
                g.items.forEach(e => {
                    const cat = categories.find(c => c.id === e.categoryId);
                    const color = cat?.color || 'var(--text-secondary)';
                    const dateShort = e.date ? `${e.date.slice(8,10)}/${e.date.slice(5,7)}` : '';
                    html += `
                        <div class="event-card" style="border-color:${color}" onclick="openEntryDetail('${e.id}')">
                            <div class="event-card-top">
                                <span class="event-card-date">${dateShort}${e.time ? ' · ' + escapeHtml(e.time) : ''}</span>
                            </div>
                            <div class="event-card-title">${escapeHtml(e.title)}</div>
                            <div class="event-card-place">${escapeHtml(e.place || 'Sin lugar')}</div>
                        </div>`;
                });
                html += `</div>`;
            });
            html += `</div>`;
            return html;
        }

        // ============================================================
        //  RENDER: PLACES
        // ============================================================
        function renderPlaces() {
            const places = entries.filter(e => e.type === 'place');
            if (!places.length) {
                return `<div class="empty-state"><div class="empty-icon">⌂</div><div class="empty-title">Sin lugares</div><div class="empty-sub">Pulsa el botón + y selecciona "Lugar"</div></div>`;
            }

            const sorted = [...places].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

            let html = `<div style="max-width:700px">`;
            sorted.forEach(p => {
                const cat = categories.find(c => c.id === p.categoryId);
                const color = cat?.color || 'var(--text-secondary)';
                html += `
                    <div class="entry-item" onclick="openEntryDetail(\'${p.id}\')">
                        <div class="entry-color-dot" style="background:${color}"></div>
                        <div class="entry-info">
                            <div class="entry-title">${p.title}</div>
                            <div class="entry-meta">${p.date || 'Sin fecha'}${p.notes ? ' · ' + linkifyText(p.notes) : ''}</div>
                        </div>
                    </div>`;
            });
            html += `</div>`;
            return html;
        }

        // ============================================================
        //  RENDER: SETTINGS
        // ============================================================
        function tagMapFromEntries() {
            const tagMap = {};
            entries.forEach(e => (e.tags || []).forEach(t => {
                if (!tagMap[t]) tagMap[t] = [];
                tagMap[t].push(e);
            }));
            return tagMap;
        }

        function renderTagsCloudList() {
            const tagMap = tagMapFromEntries();
            const tagList = Object.keys(tagMap);
            const q = (window._tagFilter || '').trim().toLowerCase();
            const filtered = q ? tagList.filter(t => t.toLowerCase().includes(q)) : tagList;
            const sorted = [...filtered].sort((a, b) => tagMap[b].length - tagMap[a].length || a.localeCompare(b));
            if (!sorted.length) return `<div class="finance-empty-line">Sin etiquetas que coincidan con "${escapeHtml(window._tagFilter || '')}"</div>`;
            const counts = tagList.map(t => tagMap[t].length);
            const maxCount = Math.max(...counts), minCount = Math.min(...counts);
            const sizeFor = c => maxCount === minCount ? 14 : Math.round(12 + ((c - minCount) / (maxCount - minCount)) * 12);
            return sorted.map(t => `
                <span class="tags-view-chip" style="font-size:${sizeFor(tagMap[t].length)}px"
                    onclick="window._selectedTag='${escapeHtml(t).replace(/'/g, "\\'")}';render()">
                    #${escapeHtml(t)} · ${tagMap[t].length}
                </span>`).join('');
        }

        function filterTagsView(value) {
            window._tagFilter = value;
            const list = document.getElementById('tags-cloud-list');
            if (list) list.innerHTML = renderTagsCloudList();
        }

        async function renameTag(oldTag) {
            const next = prompt('Nuevo nombre para la etiqueta', oldTag);
            if (next === null) return;
            const clean = next.trim();
            if (!clean || clean === oldTag) return;
            entries.forEach(e => {
                if (Array.isArray(e.tags) && e.tags.includes(oldTag)) {
                    e.tags = [...new Set(e.tags.map(t => t === oldTag ? clean : t))];
                }
            });
            window._selectedTag = clean;
            render();
            try { await saveData(); showToast('Etiqueta renombrada'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteTagEverywhere(tag) {
            const count = entries.filter(e => (e.tags || []).includes(tag)).length;
            if (!confirm(`¿Eliminar la etiqueta #${tag} de ${count} entrada${count === 1 ? '' : 's'}? Las entradas no se borran, solo la etiqueta.`)) return;
            entries.forEach(e => { if (Array.isArray(e.tags)) e.tags = e.tags.filter(t => t !== tag); });
            window._selectedTag = null;
            render();
            try { await saveData(); showToast('Etiqueta eliminada'); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function renderTagsView() {
            const tagMap = tagMapFromEntries();
            const tagList = Object.keys(tagMap);

            if (!tagList.length) {
                return `<div class="empty-state"><div class="empty-icon">#</div><div class="empty-title">Sin etiquetas todavía</div><div class="empty-sub">Añade etiquetas a tus entradas para verlas aquí</div></div>`;
            }

            if (window._selectedTag) {
                const items = tagMap[window._selectedTag] || [];
                const tagEsc = escapeHtml(window._selectedTag).replace(/'/g, "\\'");
                return `
                <div style="max-width:700px">
                    <button class="btn-secondary" style="width:auto;margin-bottom:12px" onclick="window._selectedTag=null;render()">← Volver a Etiquetas</button>
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap">
                        <div style="font-size:18px;font-weight:800">#${escapeHtml(window._selectedTag)} · ${items.length}</div>
                        <div style="display:flex;gap:8px">
                            <button class="finance-oneoff-btn" onclick="renameTag('${tagEsc}')">✎ Renombrar</button>
                            <button class="finance-oneoff-btn" style="color:#dc2626" onclick="deleteTagEverywhere('${tagEsc}')">Eliminar etiqueta</button>
                        </div>
                    </div>
                    ${items.map(e => {
                        const cat = categories.find(c => c.id === e.categoryId);
                        const color = cat?.color || 'var(--text-secondary)';
                        return `
                        <div class="entry-item ${e.status === 'Completado' ? 'bone-surface goal-completed-bone' : ''}" onclick="openEntryDetail(\'${e.id}\')">
                            <div class="entry-color-dot" style="background:${color}"></div>
                            <div class="entry-info">
                                <div class="entry-title">${escapeHtml(e.title)}</div>
                                <div class="entry-meta">${TYPE_LABELS[e.type]||''}</div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>`;
            }

            return `
            <div style="max-width:700px">
                <input class="modal-input" style="margin-bottom:16px" placeholder="Buscar etiqueta..." value="${escapeHtml(window._tagFilter || '')}" oninput="filterTagsView(this.value)">
                <div id="tags-cloud-list" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">${renderTagsCloudList()}</div>
            </div>`;
        }

        function renderSettings() {
            const devStatus = devModeActive ? 'Activado' : 'Desactivado';
            const devColor = devModeActive ? 'var(--fantasy-accent)' : 'var(--text-secondary)';

            return `
                <div style="max-width:600px">
                    <div class="chart-container" style="margin-bottom:16px">
                        <div class="chart-title">Datos de la cuenta</div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
                            <button class="btn-secondary" style="width:auto" onclick="exportData()">📤 Exportar datos</button>
                            <button class="btn-secondary" style="width:auto" onclick="document.getElementById('import-input').click()">📥 Importar datos</button>
                        </div>
                        <div style="font-size:11px;color:var(--text-secondary);margin-top:8px">Exporta o importa todos tus datos (entradas, categorías, notas, etc.) en formato JSON.</div>
                    </div>

                    <div class="chart-container" style="margin-bottom:16px">
                        <div class="chart-title">Qué es Bitácora</div>
                        <div style="min-height:20px"></div>
                    </div>

                    <div class="chart-container" style="margin-bottom:16px">
                        <div class="chart-title">Apariencia</div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
                            <button class="btn-secondary" style="width:auto" onclick="toggleTheme()">◐ Cambiar tema</button>
                            <button class="btn-secondary" style="width:auto" onclick="toggleMode()">⊞ Alternar modo ancho</button>
                        </div>
                    </div>

                    <div class="chart-container" style="margin-bottom:16px">
                        <div class="chart-title">Avanzado</div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
                            <button class="btn-secondary" style="width:auto;color:${devColor}" onclick="toggleDeveloperMode()">⚙ Modo desarrollador: ${devStatus}</button>
                        </div>
                        <div style="font-size:11px;color:var(--text-secondary);margin-top:8px">Activa el modo desarrollador para acceder a funciones ocultas (ej. Fantasy).</div>
                    </div>

                    <div class="chart-container" style="margin-bottom:16px">
                        <div class="chart-title">Prompts guardados</div>
                        <div style="display:flex;gap:8px;margin:12px 0">
                            <button class="btn-secondary" style="width:auto" onclick="openNewPrompt()">✎ Nuevo prompt</button>
                        </div>
                        <div class="prompts-list">
                            ${prompts.length ? prompts.map(p => `
                                <div class="prompt-card" onclick="openPromptDetail('${p.id}')">
                                    <span class="prompt-icon">&gt;</span>
                                    <span class="prompt-title">${escapeHtml(p.title)}</span>
                                </div>
                            `).join('') : '<div style="font-size:12px;color:var(--text-secondary);padding:8px 0">Sin prompts guardados</div>'}
                        </div>
                    </div>

                    <div class="chart-container">
                        <div class="chart-title" style="color:#dc2626">Zona de riesgo</div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
                            <button class="btn-secondary" style="width:auto;color:#dc2626" onclick="handleLogoutAllDevices()">⏻ Cerrar sesión en todos los dispositivos</button>
                        </div>
                        <div style="font-size:11px;color:var(--text-secondary);margin-top:8px">Esto cerrará tu sesión en todos los navegadores y dispositivos donde hayas iniciado sesión.</div>
                    </div>
                </div>`;
        }

        // ============================================================
        //  RENDER: NOTES
        // ============================================================
        function renderNotes() {
            const sorted = [...notes].sort((a, b) => b.date.localeCompare(a.date));

            if (!sorted.length) {
                return `
                    <div style="display:flex;justify-content:flex-start;margin-bottom:16px">
                        <button class="btn-modal-primary" style="width:auto;padding:8px 20px" onclick="openWriteNote()">✎ Escribir nota de hoy</button>
                    </div>
                    <div class="empty-state">
                        <div class="empty-icon">✎</div>
                        <div class="empty-title">Todavía no hay notas</div>
                        <div class="empty-sub">Pulsa "Escribir nota de hoy" para crear la nota del día.</div>
                    </div>`;
            }

            return `
                <div style="display:flex;justify-content:flex-start;margin-bottom:16px">
                    <button class="btn-modal-primary" style="width:auto;padding:8px 20px" onclick="openWriteNote()">✎ Escribir nota de hoy</button>
                </div>
                <div class="notes-grid">
                    ${sorted.map(n => `
                        <div class="note-card" onclick="openReadNote('${n.id}')">
                            <div class="note-card-title">${formatNoteTitle(n.date)}</div>
                        </div>
                    `).join('')}
                </div>`;
        }

        function openWriteNote() {
            const today = todayISO();
            let note = notes.find(n => n.date === today);
            if (!note) {
                note = { id: 'note_' + Date.now(), date: today, content: '', createdAt: new Date().toISOString() };
                notes.push(note);
                saveData();
            }
            openReadNote(note.id);
        }

        function openReadNote(id) {
            const note = notes.find(n => n.id === id);
            if (!note) return;
            window.openNoteId = id;
            document.getElementById('content').innerHTML = renderNoteDetail(note);
            requestAnimationFrame(() => {
                const editor = document.getElementById('note-content-input');
                if (editor) autoResizeNote(editor);
            });
        }

        function renderNoteDetail(note) {
            const editable = note.date === todayISO();
            const content = note.content || '';

            return `
                <div class="note-detail note-detail-wide">
                    <button class="btn-secondary" style="width:auto;padding:6px 14px;margin-bottom:16px" onclick="closeNoteDetail()">← Volver</button>
                    <div class="note-detail-title">${formatNoteTitle(note.date)}</div>
                    ${editable ? `
                        <textarea id="note-content-input" class="note-textarea" placeholder="Escribe tu nota del día..." oninput="autoSaveNote('${note.id}', this.value);autoResizeNote(this);updateNoteLivePreview(this.value)">${escapeHtml(content)}</textarea>
                        <div class="note-detail-hint">Esta nota es editable solo hoy. Se guarda automáticamente. Usa [[Título exacto]] o /palabra para enlazar con cualquier entrada, asignatura o coleccionable.</div>
                        <div id="note-live-preview" class="note-readonly note-live-preview">${content ? linkifyText(content) : ''}</div>
                    ` : `
                        <div class="note-readonly">${content ? linkifyText(content) : '<span style="color:var(--text-muted)">(Nota vacía)</span>'}</div>
                        <div class="note-detail-hint">Esta nota ya no es editable (se escribió ${note.date}).</div>
                    `}
                </div>`;
        }

        function closeNoteDetail() {
            window.openNoteId = null;
            document.getElementById('content').innerHTML = renderNotes();
        }

        let noteSaveTimer;

        function autoSaveNote(id, value) {
            const note = notes.find(n => n.id === id);
            if (!note || note.date !== todayISO()) return;
            note.content = value;
            clearTimeout(noteSaveTimer);
            noteSaveTimer = setTimeout(async () => {
                try { await saveData(); } catch (e) { console.error('Error guardando nota:', e); }
            }, 800);
        }

        function updateNoteLivePreview(value) {
            const preview = document.getElementById('note-live-preview');
            if (preview) preview.innerHTML = value ? linkifyText(value) : '';
        }

        function autoResizeNote(el) {
            if (!el) return;
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
        }

        // ============================================================
        //  RENDER: GOALS
        // ============================================================
        function goalNumber(v) {
            return Number(v || 0).toLocaleString('es-ES', { maximumFractionDigits: 2 });
        }

        function goalProgressPct(e) {
            if (e.goalType !== 'numeric') return null;
            const target = Number(e.targetValue) || 0;
            if (target <= 0) return null;
            return Math.max(0, Math.min(100, Math.round((Number(e.currentValue) || 0) / target * 100)));
        }

        function renderGoals() {
            const goals = entries.filter(e => e.type === 'goal');
            const groups = [
                { key: 'short', label: 'Corto plazo' },
                { key: 'medium', label: 'Medio plazo' },
                { key: 'long', label: 'Largo plazo' }
            ];

            if (!goals.length) {
                return `
                    <div class="empty-state">
                        <div class="empty-icon">◉</div>
                        <div class="empty-title">Sin objetivos</div>
                        <div class="empty-sub">Pulsa el botón + y selecciona "Objetivo"</div>
                    </div>`;
            }

            const thisYear = String(new Date().getFullYear());
            const activeCount = goals.filter(g => g.status !== 'Completado').length;
            const completedThisYear = goals.filter(g => g.status === 'Completado' && (g.date || '').startsWith(thisYear)).length;

            let html = `<div style="max-width:980px">
                <div class="goals-summary">
                    <div><strong>${activeCount}</strong><span>activos</span></div>
                    <div><strong>${completedThisYear}</strong><span>completados en ${thisYear}</span></div>
                    <div><strong>${goals.length}</strong><span>en total</span></div>
                </div>`;

            groups.forEach(g => {
                const items = goals.filter(e => e.term === g.key);
                if (!items.length) return;

                html += `
                    <div style="margin-bottom:24px">
                        <div class="modal-label" style="margin-bottom:8px">${g.label}</div>`;

                items.forEach(e => {
                    const cat = categories.find(c => c.id === e.categoryId);
                    const color = cat?.color || 'var(--text-secondary)';
                    const statusClass = e.status === 'Completado' ? 'badge-done' :
                        e.status === 'En progreso' ? 'badge-progress' : 'badge-pending';
                    const tags = (e.tags || []).map(t => `<span class="badge badge-default">${escapeHtml(t)}</span>`)
                        .join(' ');
                    const pct = goalProgressPct(e);
                    const milestones = e.milestones || [];
                    const msDone = milestones.filter(m => m.done).length;

                    html += `
                        <div class="entry-item" style="align-items:flex-start" onclick="openEntryDetail(\'${e.id}\')">
                            <div class="entry-color-dot" style="background:${color};margin-top:6px"></div>
                            <div class="entry-info">
                                <div class="entry-title">${escapeHtml(e.title)}</div>
                                <div class="entry-meta">${tags} ${e.notes ? ' · ' + linkifyText(e.notes) : ''}</div>
                                ${pct !== null ? `
                                    <div class="progress-bar-bg" style="margin-top:8px;max-width:260px"><div class="progress-bar-fill" style="width:${pct}%;background:#2563eb"></div></div>
                                    <div style="font-size:11px;color:var(--text-secondary);margin-top:3px">${goalNumber(e.currentValue)} / ${goalNumber(e.targetValue)} ${escapeHtml(e.unit || '')} · ${pct}%</div>
                                ` : ''}
                                ${milestones.length ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:4px">${msDone}/${milestones.length} hitos</div>` : ''}
                            </div>
                            <span class="badge ${statusClass}">${e.status}</span>
                            <div class="entry-actions">
                                <button class="delete" onclick="event.stopPropagation();deleteEntry('${e.id}')">✕</button>
                            </div>
                        </div>`;
                });

                html += `</div>`;
            });

            html += `</div>`;
            return html;
        }

        // ============================================================
        //  RENDER: INVESTMENTS
        // ============================================================
        // ============================================================
        //  FINANZAS: HUB
        // ============================================================
        function financeMoney(value) {
            return Number(value || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€';
        }

        function financeMonthKey(date = new Date()) {
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }

        function financeMonthLabel(key) {
            const [y, m] = String(key).split('-').map(Number);
            if (!y || !m) return key;
            return new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
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

        function financeSnapshot() {
            return {
                month: financeMonthKey(),
                date: new Date().toISOString(),
                cash: Number(financeProfile.cash || 0),
                invested: Number(financeProfile.invested || 0),
                emergency: Number(financeProfile.emergency || 0),
                vacation: Number(financeProfile.vacation || 0),
                safe: Number(financeProfile.cash || 0) + Number(financeProfile.emergency || 0),
                total: financeCorePatrimony()
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

        async function saveFinanceDashboard() {
            const snap = financeSnapshot();
            const existing = Array.isArray(financeProfile.history) ? financeProfile.history : [];
            const withoutCurrent = existing.filter(h => h.month !== snap.month);
            financeProfile.history = [...withoutCurrent, snap].sort((a, b) => String(a.month).localeCompare(String(b.month))).slice(-24);
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

        function renderFinanceFloatingChart() {
            const raw = Array.isArray(financeProfile.history) ? [...financeProfile.history] : [];
            const fullData = raw
                .sort((a, b) => String(a.month).localeCompare(String(b.month)))
                .map(h => {
                    const safe = h.safe !== undefined ? Number(h.safe) : Number(h.cash || 0) + Number(h.emergency || 0);
                    const total = h.total !== undefined ? Number(h.total) : safe + Number(h.invested || 0);
                    return { month: h.month, safe, total };
                });
            const visibleCount = financeChartMonths ? Math.min(financeChartMonths, fullData.length) : fullData.length;
            const data = fullData.slice(-visibleCount);
            const target = financeTargetTotal();

            if (!data.length) {
                return `<div class="finance-empty-state">Aún no hay histórico. Edita tus cifras o usa <strong>Corregir registros</strong> abajo para registrar meses anteriores y empezar a ver la evolución.</div>`;
            }

            const W = 640, H = 220, padX = 6, padT = 14, padB = 24;
            const innerW = W - padX * 2, innerH = H - padT - padB;
            const maxVal = Math.max(1, target, ...data.map(d => d.total), ...data.map(d => d.safe)) * 1.08;

            const x = i => data.length === 1 ? padX + innerW / 2 : padX + (innerW * i) / (data.length - 1);
            const y = v => padT + innerH - (v / maxVal) * innerH;

            const targetLine = target > 0 ? `
                <line x1="${padX}" y1="${y(target).toFixed(1)}" x2="${W - padX}" y2="${y(target).toFixed(1)}" stroke="var(--text-muted)" stroke-width="1.3" stroke-dasharray="1.5,4" stroke-linecap="round"/>
                <text x="${padX}" y="${(y(target) - 6).toFixed(1)}" font-size="9" fill="var(--text-muted)">Objetivo · ${financeMoney(target)}</text>` : '';

            const dotsOf = (key, label) => data.map((d, i) => `
                <circle class="finance-chart-point" cx="${x(i).toFixed(1)}" cy="${y(d[key]).toFixed(1)}" r="3.5" fill="var(--bg-app)" stroke="${key === 'total' ? 'var(--text-primary)' : 'var(--text-secondary)'}" stroke-width="2"
                    onmousemove="showFinanceChartTooltip(event,'${label}','${escapeHtml(financeMonthLabel(d.month))}',${d[key]})"
                    onmouseleave="hideFinanceChartTooltip()"></circle>`).join('');

            const step = Math.max(1, Math.ceil(data.length / 6));
            const xLabels = data.map((d, i) => (data.length === 1 || i % step === 0 || i === data.length - 1)
                ? `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="var(--text-muted)">${escapeHtml(financeMonthLabel(d.month).split(' de ')[0])}</text>`
                : '').join('');

            let linesSvg = '';
            if (data.length > 1) {
                const pathOf = key => data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
                const areaPath = `${pathOf('total')} L${x(data.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${x(0).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
                linesSvg = `
                    <path d="${areaPath}" fill="url(#financeTotalGradient)" stroke="none"/>
                    <path d="${pathOf('safe')}" fill="none" stroke="var(--text-secondary)" stroke-width="2" stroke-dasharray="4,4" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="${pathOf('total')}" fill="none" stroke="var(--text-primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
            }

            return `
                <div class="finance-chart-svg-wrap finance-floating-svg-wrap">
                    <svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:280px">
                        <defs>
                            <linearGradient id="financeTotalGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" style="stop-color:var(--accent);stop-opacity:0.22"/>
                                <stop offset="100%" style="stop-color:var(--accent);stop-opacity:0"/>
                            </linearGradient>
                        </defs>
                        ${linesSvg}
                        ${targetLine}
                        ${dotsOf('safe', 'Efectivo + Emergencia')}
                        ${dotsOf('total', 'Patrimonio total')}
                        ${xLabels}
                    </svg>
                </div>
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

        function openInvestmentAccountEditor() {
            showModal(`
                <div class="modal-title">Editar Inversiones</div>
                <div class="modal-label">Valor actual (€)</div>
                <input id="finance-invest-value" class="modal-input" type="number" min="0" step="0.01" value="${Number(financeProfile.invested || 0)}">
                <div class="modal-label">Objetivo para final de año (€)</div>
                <input id="finance-invest-target" class="modal-input" type="number" min="0" step="0.01" value="${Number(financeProfile.investedTarget || 0)}">
                <div class="modal-label">Descripción (en qué está invertido)</div>
                <textarea id="finance-invest-note" class="modal-input" rows="2" placeholder="Ej. Fondo indexado MSCI World, cuenta remunerada...">${escapeHtml(financeProfile.investedNote || '')}</textarea>
                <button class="btn-modal-primary" onclick="saveInvestmentAccountEditor()">Guardar</button>
            `);
        }

        async function saveInvestmentAccountEditor() {
            financeProfile.invested = Math.max(0, Number(document.getElementById('finance-invest-value')?.value) || 0);
            financeProfile.investedTarget = Math.max(0, Number(document.getElementById('finance-invest-target')?.value) || 0);
            financeProfile.investedNote = (document.getElementById('finance-invest-note')?.value || '').trim();
            closeModal();
            await saveFinanceDashboard();
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
            const rows = months.map(m => {
                const h = history.find(x => x.month === m);
                const safe = h ? (h.safe !== undefined ? Number(h.safe) : Number(h.cash || 0) + Number(h.emergency || 0)) : '';
                const total = h ? Number(h.total || 0) : '';
                return `
                    <div class="finance-correction-row">
                        <div class="finance-correction-month">${escapeHtml(financeMonthLabel(m))}</div>
                        <div class="finance-correction-inputs">
                            <div>
                                <div class="modal-label">Efectivo + Emergencia (€)</div>
                                <input class="modal-input finance-correction-input" data-month="${m}" data-field="safe" type="number" min="0" step="0.01" value="${safe}" placeholder="0.00">
                            </div>
                            <div>
                                <div class="modal-label">Patrimonio total (€)</div>
                                <input class="modal-input finance-correction-input" data-month="${m}" data-field="total" type="number" min="0" step="0.01" value="${total}" placeholder="0.00">
                            </div>
                        </div>
                    </div>`;
            }).join('');
            showModal(`
                <div class="modal-title">Corregir registros</div>
                <div class="finance-modal-note" style="margin-bottom:12px">Ajusta o rellena los valores de la gráfica para los 3 meses anteriores. El mes actual se actualiza solo con tus cifras en vivo.</div>
                ${rows}
                <button class="btn-modal-primary" onclick="saveFinanceHistoryCorrection()">Guardar correcciones</button>
            `);
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
                const { safe, total } = byMonth[m];
                if (safe === null && total === null) return;
                const idx = history.findIndex(h => h.month === m);
                const base = idx >= 0 ? history[idx] : { month: m, date: new Date().toISOString() };
                const baseSafe = base.safe !== undefined ? Number(base.safe) : Number(base.cash || 0) + Number(base.emergency || 0);
                const entry = { ...base, month: m, safe: safe !== null ? safe : baseSafe, total: total !== null ? total : Number(base.total || 0) };
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

        function openFinanceMovement(type = 'income') {
            const today = todayISO();
            const isIncome = type === 'income';
            showModal(`
                <div class="modal-title">${isIncome ? '+ Ingreso puntual' : '+ Gasto puntual'}</div>
                <div class="finance-modal-note">${isIncome
                    ? 'Registra una venta, regalo, devolución u otro ingreso que no forme parte de tu sueldo habitual.'
                    : 'Registra una compra o gasto puntual que quieras descontar de tu efectivo.'}</div>
                <div class="modal-label">Concepto</div>
                <input id="finance-mov-label" class="modal-input" placeholder="${isIncome ? 'Ej: Venta de ropa' : 'Ej: Reparación del coche'}">
                <div class="modal-label">Importe (€)</div>
                <input id="finance-mov-amount" class="modal-input" type="number" min="0" step="0.01" placeholder="0.00">
                <div class="modal-label">Fecha</div>
                <input id="finance-mov-date" class="modal-input" type="date" value="${today}">
                <label style="display:flex;align-items:center;gap:8px;margin:10px 0 14px;font-size:12px;color:var(--text-secondary);cursor:pointer">
                    <input id="finance-mov-addcash" type="checkbox" checked> ${isIncome ? 'Sumarlo también al efectivo actual' : 'Restarlo también del efectivo actual'}
                </label>
                <button class="btn-modal-primary" onclick="saveFinanceMovement('${type}')">Guardar ${isIncome ? 'ingreso' : 'gasto'}</button>
            `);
            setTimeout(() => document.getElementById('finance-mov-label')?.focus(), 50);
        }

        async function saveFinanceMovement(type = 'income') {
            const isIncome = type === 'income';
            const label = document.getElementById('finance-mov-label')?.value.trim() || (isIncome ? 'Ingreso puntual' : 'Gasto puntual');
            const amount = Number(document.getElementById('finance-mov-amount')?.value);
            const date = document.getElementById('finance-mov-date')?.value || todayISO();
            const addCash = document.getElementById('finance-mov-addcash')?.checked;
            if (!(amount > 0)) { showToast('Introduce un importe válido', true); return; }

            const applied = !!(addCash && date <= todayISO());
            financeProfile.movements = Array.isArray(financeProfile.movements) ? financeProfile.movements : [];
            financeProfile.movements.unshift({
                id: 'mov_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                type, label, amount, date, addedToCash: applied
            });
            financeProfile.movements.sort((a, b) => String(b.date).localeCompare(String(a.date)));

            if (applied) {
                const delta = isIncome ? amount : -amount;
                financeProfile.cash = Math.max(0, Number(financeProfile.cash || 0) + delta);
            }

            closeModal();
            await saveFinanceDashboard();
            showToast(isIncome ? 'Ingreso registrado' : 'Gasto registrado');
        }

        // Botón rápido "Cobrar sueldo": sugiere la previsión del mes actual
        // pero permite ajustar la cifra real antes de aplicarla, ya que el
        // importe cobrado puede diferir de lo previsto.
        function quickPaySalary() {
            const monthKey = financeMonthKey();
            const forecast = Number(financeProfile.salaryForecast?.[monthKey] || financeIncome.current || 0);
            const today = todayISO();
            showModal(`
                <div class="modal-title">Cobrar sueldo</div>
                <div class="finance-modal-note">${forecast > 0
                    ? `Tu previsión para ${escapeHtml(financeMonthLabel(monthKey))} era ${financeMoney(forecast)}. Ajusta la cifra si has cobrado algo distinto.`
                    : `No tienes previsión definida para ${escapeHtml(financeMonthLabel(monthKey))}. Indica el importe real que has cobrado.`}</div>
                <div class="modal-label">Concepto</div>
                <input id="finance-salary-label" class="modal-input" value="Sueldo de ${escapeHtml(financeMonthLabel(monthKey))}">
                <div class="modal-label">Importe cobrado (€)</div>
                <input id="finance-salary-amount" class="modal-input" type="number" min="0" step="0.01" value="${forecast > 0 ? forecast : ''}" placeholder="0.00">
                <div class="modal-label">Fecha</div>
                <input id="finance-salary-date" class="modal-input" type="date" value="${today}">
                ${forecast > 0 ? `
                <label style="display:flex;align-items:center;gap:8px;margin:10px 0 14px;font-size:12px;color:var(--text-secondary);cursor:pointer">
                    <input id="finance-salary-updateforecast" type="checkbox"> Actualizar también la previsión de este mes con esta cifra
                </label>` : ''}
                <button class="btn-modal-primary" onclick="saveQuickPaySalary('${monthKey}')">Sumar al efectivo</button>
            `);
            setTimeout(() => document.getElementById('finance-salary-amount')?.select(), 50);
        }

        async function saveQuickPaySalary(monthKey) {
            const label = document.getElementById('finance-salary-label')?.value.trim() || ('Sueldo de ' + financeMonthLabel(monthKey));
            const amount = Number(document.getElementById('finance-salary-amount')?.value);
            const date = document.getElementById('finance-salary-date')?.value || todayISO();
            const updateForecast = document.getElementById('finance-salary-updateforecast')?.checked;
            if (!(amount > 0)) { showToast('Introduce el importe cobrado', true); return; }

            financeProfile.movements = Array.isArray(financeProfile.movements) ? financeProfile.movements : [];
            financeProfile.movements.unshift({
                id: 'mov_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                type: 'income', label, amount, date, addedToCash: true
            });
            financeProfile.movements.sort((a, b) => String(b.date).localeCompare(String(a.date)));
            financeProfile.cash = Math.max(0, Number(financeProfile.cash || 0) + amount);

            if (updateForecast) {
                financeProfile.salaryForecast = financeProfile.salaryForecast || {};
                financeProfile.salaryForecast[monthKey] = amount;
            }

            closeModal();
            await saveFinanceDashboard();
            showToast(`Sueldo de ${financeMoney(amount)} añadido al efectivo`);
        }

        async function deleteFinanceMovement(id) {
            const mov = (financeProfile.movements || []).find(x => x.id === id);
            if (!mov) return;
            if (mov.type === 'transfer') {
                // Deshace la transferencia: devuelve el importe de destino a origen.
                financeProfile[mov.toKey] = Math.max(0, Number(financeProfile[mov.toKey] || 0) - mov.amount);
                financeProfile[mov.fromKey] = Math.max(0, Number(financeProfile[mov.fromKey] || 0) + mov.amount);
            } else if (mov.addedToCash) {
                const delta = mov.type === 'income' ? -mov.amount : mov.amount;
                financeProfile.cash = Math.max(0, Number(financeProfile.cash || 0) + delta);
            }
            financeProfile.movements = (financeProfile.movements || []).filter(x => x.id !== id);
            await saveFinanceDashboard();
        }

        // ============================================================
        //  TRANSFERENCIAS ENTRE CUENTAS
        //  Repartir el sueldo (u otro importe) entre Efectivo, Inversiones,
        //  Emergencia y Vacaciones sin que cuente como ingreso/gasto nuevo.
        // ============================================================
        const FINANCE_ACCOUNT_LABELS = {
            cash: 'Efectivo / bancos',
            invested: 'Inversiones',
            emergency: 'Fondo de emergencia',
            vacation: 'Reserva de vacaciones'
        };

        function financeAccountOptions(excludeKey) {
            return Object.entries(FINANCE_ACCOUNT_LABELS)
                .filter(([key]) => key !== excludeKey)
                .map(([key, label]) => `<option value="${key}">${label} (${financeMoney(financeProfile[key] || 0)})</option>`)
                .join('');
        }

        function openFinanceTransfer() {
            showModal(`
                <div class="modal-title">Transferir entre cuentas</div>
                <div class="finance-modal-note">Mueve dinero de una cuenta a otra (por ejemplo, repartir el sueldo entre Efectivo, Inversiones y Emergencia). No se cuenta como ingreso ni gasto nuevo, solo cambia de sitio.</div>
                <div class="modal-label">Desde</div>
                <select id="finance-transfer-from" class="modal-input" onchange="updateFinanceTransferOptions()">
                    ${Object.entries(FINANCE_ACCOUNT_LABELS).map(([key, label]) => `<option value="${key}">${label} (${financeMoney(financeProfile[key] || 0)})</option>`).join('')}
                </select>
                <div class="modal-label">Hacia</div>
                <select id="finance-transfer-to" class="modal-input">
                    ${financeAccountOptions('cash')}
                </select>
                <div class="modal-label">Importe (€)</div>
                <input id="finance-transfer-amount" class="modal-input" type="number" min="0" step="0.01" placeholder="0.00">
                <button class="btn-modal-primary" onclick="saveFinanceTransfer()">Transferir</button>
            `);
            setTimeout(() => document.getElementById('finance-transfer-amount')?.focus(), 50);
        }

        function updateFinanceTransferOptions() {
            const fromKey = document.getElementById('finance-transfer-from')?.value;
            const toSelect = document.getElementById('finance-transfer-to');
            if (toSelect) toSelect.innerHTML = financeAccountOptions(fromKey);
        }

        async function saveFinanceTransfer() {
            const fromKey = document.getElementById('finance-transfer-from')?.value;
            const toKey = document.getElementById('finance-transfer-to')?.value;
            const amount = Number(document.getElementById('finance-transfer-amount')?.value);
            if (!fromKey || !toKey || fromKey === toKey) { showToast('Elige dos cuentas distintas', true); return; }
            if (!(amount > 0)) { showToast('Introduce un importe válido', true); return; }
            const available = Number(financeProfile[fromKey] || 0);
            if (amount > available) {
                showToast(`No hay suficiente en ${FINANCE_ACCOUNT_LABELS[fromKey]} (disponible: ${financeMoney(available)})`, true);
                return;
            }

            financeProfile[fromKey] = Math.max(0, available - amount);
            financeProfile[toKey] = Math.max(0, Number(financeProfile[toKey] || 0) + amount);

            financeProfile.movements = Array.isArray(financeProfile.movements) ? financeProfile.movements : [];
            financeProfile.movements.unshift({
                id: 'mov_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                type: 'transfer',
                label: `${FINANCE_ACCOUNT_LABELS[fromKey]} → ${FINANCE_ACCOUNT_LABELS[toKey]}`,
                amount, date: todayISO(), fromKey, toKey, addedToCash: true
            });
            financeProfile.movements.sort((a, b) => String(b.date).localeCompare(String(a.date)));

            closeModal();
            await saveFinanceDashboard();
            showToast('Transferencia realizada');
        }

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

        function renderFinanceMetric(key, targetKey, label, icon, note) {
            const value = Number(financeProfile[key] || 0);
            const target = Number(financeProfile[targetKey] || 0);
            const prev = financePreviousSnapshot()?.[key];
            const change = financePctChange(value, prev);
            const goal = financeGoalStatus(value, target);
            const provision = financeYearEndProvision(key);
            return `
                <div class="finance-metric-card ${goal.cls}">
                    <button class="finance-edit-btn" title="Editar" onclick="openFinanceMetricEditor('${key}','${label}','${targetKey}')">✎</button>
                    <div class="finance-metric-value">${financeMoney(value)}</div>
                    <div class="finance-metric-label">${label}</div>
                    <div class="finance-metric-meta">
                        <span class="${change === null ? '' : change >= 0 ? 'finance-positive' : 'finance-negative'}">${change === null ? 'Sin mes anterior' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs. mes anterior`}</span>
                        <span>${goal.pct === null ? 'Sin objetivo' : `${goal.pct.toFixed(0)}% del objetivo`}</span>
                    </div>
                    <div class="finance-progress"><span style="width:${goal.pct === null ? 0 : Math.min(100, goal.pct)}%"></span></div>
                    <div class="finance-metric-note">${provision === null ? 'Provisión fin de año: sin datos suficientes' : `Provisión fin de año: ${financeMoney(provision)}`}${note ? ` · ${note}` : ''}</div>
                </div>`;
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
            return `
            <div class="finance-dashboard ${blurFinances ? 'blurred' : ''}">
                <div class="finance-hero-row">
                    <section class="finance-floating-chart-wrap" id="finance-floating-chart-wrap" onwheel="financeChartWheelZoom(event)" title="Rueda del ratón: acercar/alejar el periodo mostrado">
                        ${renderFinanceFloatingChart()}
                    </section>

                    <section class="finance-networth-card" id="finance-networth-section">
                        <button class="finance-edit-btn finance-networth-edit-btn" title="Editar objetivo" onclick="openFinanceTargetEditor()">✎</button>
                        <div>
                            <div class="finance-kicker">Patrimonio operativo</div>
                            <div class="finance-networth-value-row">
                                <div class="finance-networth-value finance-networth-value-compact">${financeMoney(total)}</div>
                                ${blurToggleBtn}
                            </div>
                            <div class="finance-networth-meta">
                                ${totalChange === null ? 'Primer registro' : `${totalChange >= 0 ? '+' : ''}${totalChange.toFixed(1)}% frente al mes anterior`}
                                · Objetivo ${target > 0 ? financeMoney(target) : 'sin definir'}
                            </div>
                        </div>
                        <div class="finance-networth-side">
                            <span>Progreso</span>
                            <strong>${totalPct === null ? '—' : totalPct.toFixed(0) + '%'}</strong>
                            <div class="finance-progress finance-progress-large"><span style="width:${totalPct === null ? 0 : totalPct}%"></span></div>
                        </div>
                    </section>
                </div>

                <div class="finance-metrics-grid">
                    ${renderFinanceMetric('cash','cashTarget','Efectivo / bancos','◉','Liquidez disponible')}
                    ${renderFinanceMetric('emergency','emergencyTarget','Fondo de emergencia','◈','Reserva no destinada al gasto corriente')}
                    ${renderFinanceMetric('vacation','vacationTarget','Reserva de vacaciones','◊','Se mantiene aparte del patrimonio operativo')}
                </div>

                <div class="finance-grid-2">
                    <section class="finance-panel" id="finance-forecast-section">
                        <div class="finance-panel-head"><div><div class="finance-kicker">Previsión</div><h3>Sueldo y aportaciones</h3></div><button class="finance-icon-btn" onclick="openForecastProfileEditor()">✎</button></div>
                        <div class="finance-income-highlight"><span>Sueldo actual</span><strong>${financeMoney(fc.salary || 0)}</strong></div>
                        <div class="finance-income-highlight"><span>Meses de contrato</span><strong>${fc.contractMonths || '—'}</strong></div>
                        <div class="finance-income-highlight"><span>Ampliación emergencia / mes</span><strong>${financeMoney(fc.emergencyMonthlyPlan || 0)}</strong></div>
                        <div class="finance-income-highlight"><span>Ampliación vacaciones / mes</span><strong>${financeMoney(fc.vacationMonthlyPlan || 0)}</strong></div>
                        <div class="finance-income-highlight" style="border-bottom:none"><span>Aportación inversión / mes</span><strong>${financeMoney(fc.investMonthlyPlan || 0)}</strong></div>
                        <div class="finance-empty-line" style="margin-top:8px">Suscripciones y gastos fijos actuales: ${financeMoney(financeRecurringTotal())}/mes (se descuentan solas de la provisión).</div>
                    </section>

                    <section class="finance-panel" id="finance-movements-section">
                        <div class="finance-panel-head"><div><div class="finance-kicker">Registro</div><h3>Movimientos</h3></div></div>
                        ${(financeProfile.movements || []).length ? `
                            <div class="finance-oneoff-list" style="margin-top:0;padding-top:0;border-top:none">
                                ${[...(financeProfile.movements || [])].slice(0,6).map(x => `
                                    <div class="finance-oneoff-row">
                                        <span>${x.type === 'transfer' ? '⇄ ' : ''}${escapeHtml(x.label)} · ${escapeHtml(x.date)}${(x.type !== 'transfer' && !x.addedToCash) ? ' <em style="opacity:.7">(no aplicado)</em>' : ''}</span>
                                        <strong class="${x.type === 'income' ? 'finance-mov-income' : x.type === 'expense' ? 'finance-mov-expense' : 'finance-mov-transfer'}">${x.type === 'income' ? '+' : x.type === 'expense' ? '−' : ''}${financeMoney(x.amount)}</strong>
                                        <button title="Eliminar registro" onclick="deleteFinanceMovement('${x.id}')">×</button>
                                    </div>`).join('')}
                            </div>` : `<div class="finance-empty-line">Aún no hay movimientos. Usa "Cobrar sueldo", "Transferir", "+ Ingreso" o "− Gasto" arriba para empezar a registrarlos.</div>`}
                    </section>
                </div>

                <section class="finance-goal-bar">
                    <span class="finance-goal-bar-icon">${remainingToTarget <= 0 && target > 0 ? '🎉' : '◎'}</span>
                    <span class="finance-goal-bar-text">${remainingToTarget <= 0 && target > 0
                        ? '<strong>Objetivo alcanzado</strong>'
                        : `<strong>Camino al objetivo</strong> · ${target > 0 ? `faltan ${financeMoney(remainingToTarget)}` : 'objetivo sin definir'} · ${monthsLeft} meses restantes`}</span>
                    <div class="finance-progress finance-goal-bar-progress"><span style="width:${totalPct === null ? 0 : Math.min(100, totalPct)}%"></span></div>
                </section>

                <section class="finance-accounts-section" id="finance-accounts-section">
                    <div class="finance-kicker" style="margin-bottom:10px">Cuentas</div>
                    <div class="finance-accounts-row">
                        <div class="collectible-card finance-account-card" onclick="openInvestmentAccountEditor()">
                            <div class="finance-account-icon">▸</div>
                            <div class="finance-account-label">Inversiones</div>
                            <div class="finance-account-value">${financeMoney(financeProfile.invested || 0)}</div>
                            ${financeProfile.investedNote ? `<div class="finance-account-note">${escapeHtml(financeProfile.investedNote)}</div>` : ''}
                        </div>
                        <div class="collectible-card finance-account-card" onclick="openRecurringExpensesModal()">
                            <div class="finance-account-icon">↻</div>
                            <div class="finance-account-label">Gastos recurrentes</div>
                            <div class="finance-account-value">${financeMoney(recurring)} <span>/ mes</span></div>
                        </div>
                        <div class="finance-account-card finance-account-card-readonly" onclick="switchView('collectibles')">
                            <div class="finance-account-icon">◆</div>
                            <div class="finance-account-label">Coleccionables</div>
                            <div class="finance-account-value">${financeMoney(financeCollectiblesTotal())}</div>
                            <div class="finance-account-note">No cuenta para el patrimonio operativo</div>
                        </div>
                    </div>
                </section>

                <div class="finance-dashboard-foot-actions">
                    <button class="finance-oneoff-btn" onclick="openFinanceHistoryCorrectionModal()">Corregir registros</button>
                </div>

                <div class="finance-dashboard-foot">${monthsLeft > 0 ? `Quedan ${monthsLeft} meses del año. ` : ''}La reserva de vacaciones (${financeMoney(financeProfile.vacation || 0)}) queda fuera del patrimonio operativo para evitar contar dos veces el dinero disponible.</div>
            </div>`;
        }

        function renderFinances() {
            migrateInvestmentData();
            return renderFinanceDashboard();
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
                    <div style="font-weight:800;font-size:14px">${icon} ${label}</div>
                    <button class="btn-secondary" style="width:auto;padding:4px 10px;font-size:12px" onclick="openNewEntry('${type}')">+ Añadir</button>
                </div>
                <div class="card" style="margin-bottom:12px">
                    <div class="card-title">Total mensual</div>
                    <div class="card-value">${total.toLocaleString('es-ES')}€</div>
                    <div class="card-sub">${active.length} activos · ${(total * 12).toLocaleString('es-ES')}€/año</div>
                </div>
                ${sorted.length ? sorted.map(s => {
                    const daysUntil = s.renewalDay >= todayDay ? s.renewalDay - todayDay : s.renewalDay + 31 - todayDay;
                    return `
                    <div class="entry-item" onclick="openEntryDetail(\'${s.id}\')">
                        <div class="entry-color-dot" style="background:${daysUntil <= 3 ? '#e17055' : 'var(--text-secondary)'}"></div>
                        <div class="entry-info">
                            <div class="entry-title">${escapeHtml(s.title)}</div>
                            <div class="entry-meta">Día ${s.renewalDay} · en ${daysUntil} días</div>
                        </div>
                        <span style="font-weight:700;font-size:13px">${s.amount.toLocaleString('es-ES')}€</span>
                    </div>`;
                }).join('') : `<div style="font-size:12px;color:var(--text-secondary);padding:8px 0">Nada por aquí todavía</div>`}
            </div>`;
        }

        async function updateFinanceIncome(type, value) {
            financeIncome[type]=Math.max(0,parseFloat(value)||0);
            try{await saveData();render();}catch(e){console.error(e);showToast('No se pudo guardar el ingreso',true);}
        }

        function renderRecurringFinances() {
            const subs=entries.filter(e=>e.type==='subscription'&&e.active!==false).reduce((s,e)=>s+(Number(e.amount)||0),0);
            const fixed=entries.filter(e=>e.type==='fixed_expense'&&e.active!==false).reduce((s,e)=>s+(Number(e.amount)||0),0);
            const total=subs+fixed;
            const pctCurrent=financeIncome.current>0?total/financeIncome.current*100:0;
            const pctNext=financeIncome.next>0?total/financeIncome.next*100:0;
            return `<button class="btn-secondary" style="width:auto;margin-bottom:16px" onclick="financeSubView='menu';render()">← Volver a Finanzas</button>
            <div style="max-width:900px;margin-bottom:20px"><div class="card"><div class="card-title">Ingresos y peso de gastos recurrentes</div>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px">
            <div><div class="modal-label">Ingresos este mes (€)</div><input type="number" class="modal-input" value="${financeIncome.current||''}" onchange="updateFinanceIncome('current',this.value)" placeholder="0.00"></div>
            <div><div class="modal-label">Ingresos esperados del mes que viene (€)</div><input type="number" class="modal-input" value="${financeIncome.next||''}" onchange="updateFinanceIncome('next',this.value)" placeholder="0.00"></div></div>
            <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:14px">
            <div class="result-card"><div class="value">${total.toLocaleString('es-ES')}€</div><div class="label">Gastos recurrentes</div></div>
            <div class="result-card"><div class="value">${financeIncome.current>0?pctCurrent.toFixed(1)+'%':'—'}</div><div class="label">Este mes</div></div>
            <div class="result-card"><div class="value">${financeIncome.next>0?pctNext.toFixed(1)+'%':'—'}</div><div class="label">Mes que viene</div></div></div></div></div>
            <div style="display:flex;gap:24px;flex-wrap:wrap;max-width:900px">${renderRecurringColumn('subscription','Suscripciones','↻')}${renderRecurringColumn('fixed_expense','Gastos fijos','■')}</div>`;
        }

        let investmentChartYears = 10;

        function renderInvestments() {
            const proj = calcCompoundProjection(investmentData.initial || 0, investmentData.monthly || 0,
                investmentData.rate || 0, investmentChartYears);
            const max = Math.max(...proj.yearlySnapshots.map(s => s.balance), 1);

            const milestoneMonths = [6, 12, 36, 60, 120];
            const milestoneLabels = ['6 meses', '1 año', '3 años', '5 años', '10 años'];
            const milestones = milestoneMonths.map((m, i) => ({
                label: milestoneLabels[i],
                balance: calcBalanceAtMonth(investmentData.initial || 0, investmentData.monthly || 0,
                    investmentData.rate || 0, m)
            }));

            const yearOptions = [5, 10, 20, 30];

            let html = `
            <div class="investment-calculator">
                <div style="margin-bottom:16px">
                    <div class="modal-label">Capital inicial (€)</div>
                    <input type="number" id="inv-initial" class="modal-input" value="${investmentData.initial || ''}" step="0.01" placeholder="0.00" onchange="updateInvestment()">
                    <div class="modal-label">Rentabilidad anual (%)</div>
                    <input type="number" id="inv-rate" class="modal-input" value="${investmentData.rate || 7}" step="0.1" placeholder="7" onchange="updateInvestment()">
                    <div class="modal-label">Aportación mensual (€)</div>
                    <input type="number" id="inv-monthly" class="modal-input" value="${investmentData.monthly || ''}" step="0.01" placeholder="0.00" onchange="updateInvestment()">
                </div>

                <div class="result-grid">
                    <div class="result-card">
                        <div class="value">${proj.finalBalance.toLocaleString('es-ES')}€</div>
                        <div class="label">Capital estimado</div>
                    </div>
                    <div class="result-card">
                        <div class="value">${proj.totalInterest.toLocaleString('es-ES')}€</div>
                        <div class="label">Intereses generados</div>
                    </div>
                    <div class="result-card">
                        <div class="value">${proj.totalContributed.toLocaleString('es-ES')}€</div>
                        <div class="label">Aportaciones realizadas</div>
                    </div>
                </div>

                <div class="chart-container">
                    <div class="milestones-title">A este ritmo...</div>
                    <div class="milestones-list">
                        ${milestones.map(ms => `
                            <div class="milestone-row">
                                <span class="milestone-label">En ${ms.label}</span>
                                <span class="milestone-value">${ms.balance.toLocaleString('es-ES')}€</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="chart-container">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                        <div class="chart-title" style="margin-bottom:0">Evolución anual</div>
                        <div class="year-selector">
                            ${yearOptions.map(y => `
                                <button class="${y === investmentChartYears ? 'active' : ''}" onclick="setInvestmentYears(${y})">${y} años</button>
                            `).join('')}
                        </div>
                    </div>
                    <div class="investment-chart">
                        ${proj.yearlySnapshots.map((s, i) => {
                            const balancePct = Math.max(4, (s.balance / max) * 100);
                            const contribPct = Math.max(0, (s.contributed / max) * 100);
                            const interestPct = Math.max(0, balancePct - contribPct);
                            return `
                                <div class="bar" title="Año ${s.year}: ${s.balance.toLocaleString('es-ES')}€ (${s.contributed.toLocaleString('es-ES')}€ aportados, ${s.interest.toLocaleString('es-ES')}€ intereses)">
                                    <div class="bar-track">
                                        <div class="bar-fill-contrib" style="height:${contribPct}%"></div>
                                        <div class="bar-fill-interest" style="height:${interestPct}%;bottom:${contribPct}%"></div>
                                    </div>
                                    <div class="bar-label">${shouldShowYearLabel(i, proj.yearlySnapshots.length) ? s.year : ''}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    <div class="chart-legend">
                        <span><span class="legend-dot" style="background:var(--text-secondary)"></span> Aportaciones</span>
                        <span><span class="legend-dot" style="background:var(--accent)"></span> Intereses</span>
                    </div>
                </div>
            </div>`;

            return html;
        }


        // ============================================================
        //  FONDO INDEXADO — CARTERA MULTIFONDO
        // ============================================================

        function todayISO() {
            return new Date().toISOString().slice(0, 10);
        }

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

        function fundFirstDate(fund) {
            const dates = [
                ...(fund.contributions || []).map(c => c.date),
                ...(fund.valuations || []).map(v => v.date)
            ].filter(Boolean).sort();
            return dates[0] || todayISO();
        }

        function portfolioInvested() {
            return (investmentData.funds || []).reduce((s, f) => s + fundInvested(f), 0);
        }

        function portfolioCurrentValue() {
            return (investmentData.funds || []).reduce((s, f) => s + fundCurrentValue(f), 0);
        }

        // CAGR aproximado; no sustituye a una TIR/XIRR cuando hay múltiples flujos.
        function portfolioAnnualizedReturn() {
            const invested = portfolioInvested();
            const value = portfolioCurrentValue();
            if (invested <= 0 || value <= 0) return null;

            const firstDates = (investmentData.funds || [])
                .map(fundFirstDate)
                .filter(Boolean)
                .sort();

            if (!firstDates.length) return null;

            const days = (new Date() - new Date(firstDates[0] + 'T00:00:00')) / 86400000;
            if (days < 30) return null;

            const years = days / 365;
            return (Math.pow(value / invested, 1 / years) - 1) * 100;
        }

        async function persistInvest(msg) {
            try {
                await saveData();
                if (msg) showToast(msg);
            } catch (e) {
                console.error(e);
                showToast('No se pudo guardar en la nube', true);
            }
        }

        function renderFondoIndexado() {
            migrateInvestmentData();

            const funds = investmentData.funds || [];
            const invested = portfolioInvested();
            const value = portfolioCurrentValue();
            const gain = value - invested;
            const gainPct = invested > 0 ? (gain / invested) * 100 : 0;
            const cagr = portfolioAnnualizedReturn();
            const projectionMonthly = Number(investmentData.projectionMonthly || 130);
            const projectionRate = 5;
            const palette = ['#eab308', '#8B5CF6', '#3b82f6', '#ec4899', '#14b8a6', '#f97316', '#22c55e'];

            return `
            <div class="investment-dashboard">
                <div class="investment-topbar">
                    <div>
                        <div class="investment-heading-kicker">Finanzas · Inversión</div>
                        <div class="investment-heading">Fondos indexados</div>
                        <div class="investment-heading-sub">Tu cartera real por posiciones, aportaciones y valoraciones registradas.</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                        <span class="investment-real-badge"><span class="investment-real-dot"></span>Datos reales registrados</span>
                        <button class="btn-secondary" style="width:auto" onclick="financeSubView='menu';render()">← Finanzas</button>
                    </div>
                </div>

                <div class="invest-hero">
                    <div class="invest-hero-card primary">
                        <div class="invest-hero-label">Valor actual</div>
                        <div class="invest-hero-value">${value.toLocaleString('es-ES', {minimumFractionDigits:2, maximumFractionDigits:2})}€</div>
                        <div class="invest-hero-sub">Valor registrado en tu bróker</div>
                    </div>
                    <div class="invest-hero-card">
                        <div class="invest-hero-label">Capital aportado</div>
                        <div class="invest-hero-value">${invested.toLocaleString('es-ES', {minimumFractionDigits:2, maximumFractionDigits:2})}€</div>
                        <div class="invest-hero-sub">Dinero introducido realmente</div>
                    </div>
                    <div class="invest-hero-card">
                        <div class="invest-hero-label">Resultado</div>
                        <div class="invest-hero-value ${gain >= 0 ? 'gain-positive' : 'gain-negative'}">${gain >= 0 ? '+' : ''}${gain.toLocaleString('es-ES', {minimumFractionDigits:2, maximumFractionDigits:2})}€</div>
                        <div class="invest-hero-sub ${gain >= 0 ? 'gain-positive' : 'gain-negative'}">${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}% sobre lo aportado</div>
                    </div>
                    <div class="invest-hero-card">
                        <div class="invest-hero-label">Rentabilidad anualizada</div>
                        <div class="invest-hero-value">${cagr === null ? '—' : (cagr >= 0 ? '+' : '') + cagr.toFixed(2) + '%'}</div>
                        <div class="invest-hero-sub">Estimación orientativa del histórico</div>
                    </div>
                </div>

                <div class="investment-funds-head">
                    <div>
                        <div class="investment-funds-label">Tus posiciones</div>
                        <div class="investment-section-subtitle">Valor actual y rentabilidad de cada fondo registrado.</div>
                    </div>
                    <button class="btn-secondary investment-add-btn" onclick="openAddFundModal()">+ Añadir fondo</button>
                </div>

                ${funds.length ? funds.map((f, i) => {
                    const fv = fundCurrentValue(f);
                    const fi = fundInvested(f);
                    const fg = fv - fi;
                    const fgPct = fi > 0 ? (fg / fi) * 100 : 0;
                    const alloc = value > 0 ? (fv / value) * 100 : 0;
                    const color = f.color || palette[i % palette.length];

                    return `
                    <div class="fund-card" onclick="openFundDetail('${f.id}')">
                        <div class="fund-card-top">
                            <div class="fund-id">
                                <span class="fund-dot" style="background:${color}"></span>
                                <div style="min-width:0">
                                    <div class="fund-name">${escapeHtml(f.name || 'Sin nombre')}</div>
                                    ${f.ticker ? `<div class="fund-ticker">${escapeHtml(f.ticker)}</div>` : ''}
                                </div>
                            </div>
                            <div class="fund-values">
                                <div class="fund-value">${fv.toLocaleString('es-ES', {minimumFractionDigits:2, maximumFractionDigits:2})}€</div>
                                <div class="fund-gain ${fg >= 0 ? 'gain-positive' : 'gain-negative'}">
                                    ${fg >= 0 ? '+' : ''}${fgPct.toFixed(2)}%
                                </div>
                            </div>
                        </div>
                        <div class="fund-alloc-bar-bg">
                            <div class="fund-alloc-bar-fill" style="width:${Math.max(0, Math.min(100, alloc))}%;background:${color}"></div>
                        </div>
                        <div class="fund-card-foot"><span>${fi.toLocaleString('es-ES', {minimumFractionDigits:2, maximumFractionDigits:2})}€ aportados</span><span>${alloc.toFixed(1)}% de la cartera</span></div>
                    </div>`;
                }).join('') : `
                    <div class="investment-empty-state" onclick="openAddFundModal()">
                        <strong>Aún no tienes ninguna posición registrada</strong>
                        Añade tu fondo y empieza a introducir las aportaciones y valoraciones reales.
                    </div>`}

                ${funds.length ? `
                    <div class="investment-chart-card" style="margin-top:20px">
                        <div class="investment-chart-head">
                            <div>
                                <div class="title">Evolución de la cartera</div>
                                <div class="desc">Compara el capital que has aportado con las valoraciones reales que hayas registrado.</div>
                                <div class="investment-chart-context">
                                    <span class="investment-context-chip real">Histórico real</span>
                                    <span class="investment-context-chip">Sin proyecciones</span>
                                </div>
                            </div>
                        </div>
                        <div class="investment-canvas-wrap"><canvas id="portfolioHistoryChart"></canvas></div>
                    </div>

                    ${funds.length > 1 ? `
                    <div class="investment-chart-card">
                        <div class="investment-chart-head">
                            <div>
                                <div class="title">Distribución de la cartera</div>
                                <div class="desc">Peso de cada fondo según su última valoración registrada.</div>
                            </div>
                        </div>
                        <div class="investment-canvas-wrap" style="max-width:380px;margin:0 auto;height:300px">
                            <canvas id="portfolioAllocationChart"></canvas>
                        </div>
                    </div>` : ''}
                ` : ''}

                <div class="investment-chart-card investment-projection-card" style="margin-top:20px">
                    <div class="investment-chart-head">
                        <div>
                            <div class="title">Proyección a futuro</div>
                            <div class="desc">Escenario hipotético a partir del valor actual y de tus aportaciones mensuales.</div>
                        </div>
                        <div class="year-selector">
                            ${[5, 10, 20, 30].map(y => `
                                <button class="${y === investmentChartYears ? 'active' : ''}" onclick="setInvestmentYears(${y})">${y} años</button>
                            `).join('')}
                        </div>
                    </div>

                    <div class="investment-projection-note">
                        <span>◈</span>
                        <span><strong>Simulación al 5 % anual.</strong> No es una previsión de mercado. Se parte del valor actual y se añaden ${projectionMonthly.toLocaleString('es-ES')}€ al mes, aplicando una capitalización mensual equivalente al 5 % anual.</span>
                    </div>

                    <div class="investment-rate-row">
                        <div class="investment-rate-field">
                            <div class="modal-label">Aportación mensual para la simulación (€)</div>
                            <input type="number" id="inv-monthly-projection" class="modal-input" value="${projectionMonthly}" step="1" min="0" onchange="updateProjectionMonthly(this.value)">
                        </div>
                        <div class="invest-note" style="max-width:420px;margin-bottom:4px">
                            Rentabilidad fija del escenario: <strong>5 % anual</strong>. Tus datos reales no se modifican.
                        </div>
                    </div>

                    <div class="investment-canvas-wrap"><canvas id="portfolioProjectionChart"></canvas></div>
                </div>
            </div>`;
        }

        function openAddFundModal() {
            showModal(`
                <div class="modal-title">+ Nuevo fondo</div>
                <div class="modal-label">Nombre</div>
                <input id="fund-name" class="modal-input" placeholder="Ej: MSCI World">
                <div class="modal-label">Ticker (opcional)</div>
                <input id="fund-ticker" class="modal-input" placeholder="Ej: IWDA">
                <div class="modal-label">Aportación inicial (€)</div>
                <input type="number" id="fund-initial" class="modal-input" step="0.01" min="0" value="570" placeholder="0.00">
                <div class="modal-label">Fecha</div>
                <input type="date" id="fund-date" class="modal-input" value="${todayISO()}">
                <button class="btn-modal-primary" style="background:var(--invest-accent)" onclick="saveNewFund()">Crear fondo</button>
            `);
        }

        async function saveNewFund() {
            const name = document.getElementById('fund-name')?.value.trim();
            if (!name) {
                showToast('Ponle un nombre al fondo', true);
                return;
            }

            const amount = Number(document.getElementById('fund-initial')?.value) || 0;
            const date = document.getElementById('fund-date')?.value || todayISO();

            investmentData.funds = investmentData.funds || [];
            investmentData.funds.push({
                id: 'fund_' + Date.now(),
                name,
                ticker: document.getElementById('fund-ticker')?.value.trim() || '',
                color: null,
                contributions: amount > 0 ? [{
                    id: 'c_' + Date.now(),
                    date,
                    amount,
                    note: 'Aportación inicial'
                }] : [],
                valuations: []
            });

            closeModal();
            document.getElementById('content').innerHTML = renderFondoIndexado();
            setTimeout(renderInvestmentCharts, 0);
            await persistInvest('Fondo creado');
        }

        function openFundDetail(fundId) {
            const f = (investmentData.funds || []).find(x => x.id === fundId);
            if (!f) return;

            const invested = fundInvested(f);
            const value = fundCurrentValue(f);
            const gain = value - invested;

            const rows = [
                ...(f.contributions || []).map(c => ({ ...c, kind: 'Aportación', amount: Number(c.amount) || 0 })),
                ...(f.valuations || []).map(v => ({ ...v, amount: Number(v.value) || 0, kind: 'Valoración' }))
            ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

            showModal(`
                <div class="modal-title">
                    ${escapeHtml(f.name)}
                    ${f.ticker ? `<span style="font-size:12px;color:var(--text-secondary)">(${escapeHtml(f.ticker)})</span>` : ''}
                </div>

                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
                    <div class="result-card"><div class="value">${value.toLocaleString('es-ES')}€</div><div class="label">Valor</div></div>
                    <div class="result-card"><div class="value">${invested.toLocaleString('es-ES')}€</div><div class="label">Aportado</div></div>
                    <div class="result-card">
                        <div class="value ${gain >= 0 ? 'gain-positive' : 'gain-negative'}">${gain >= 0 ? '+' : ''}${gain.toLocaleString('es-ES')}€</div>
                        <div class="label">Ganancia</div>
                    </div>
                </div>

                <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
                    <button class="btn-secondary" style="width:auto" onclick="openAddContributionModal('${f.id}')">+ Registrar aportación</button>
                    <button class="btn-modal-primary" style="width:auto;background:var(--invest-accent)" onclick="openUpdateValuationModal('${f.id}')">↻ Actualizar valor actual</button>
                </div>

                <div class="modal-label">Historial</div>
                <div style="max-height:220px;overflow-y:auto">
                    ${rows.length ? rows.map(r => `
                        <div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px">
                            <span>${r.date} · ${r.kind}${r.note ? ' · ' + escapeHtml(r.note) : ''}</span>
                            <strong>${Number(r.amount).toLocaleString('es-ES')}€</strong>
                        </div>
                    `).join('') : '<div style="color:var(--text-secondary);font-size:13px;padding:8px 0">Sin movimientos</div>'}
                </div>

                <button class="btn-modal-danger" onclick="deleteFund('${f.id}')">Eliminar fondo</button>
            `);
        }

        function openAddContributionModal(fundId) {
            showModal(`
                <div class="modal-title">Nueva aportación</div>
                <div class="modal-label">Importe (€)</div>
                <input type="number" id="contrib-amount" class="modal-input" step="0.01" min="0.01" placeholder="300">
                <div class="modal-label">Fecha</div>
                <input type="date" id="contrib-date" class="modal-input" value="${todayISO()}">
                <div class="modal-label">Nota (opcional)</div>
                <input id="contrib-note" class="modal-input" placeholder="Aportación mensual">
                <button class="btn-modal-primary" style="background:var(--invest-accent)" onclick="saveContribution('${fundId}')">Guardar</button>
            `);
        }

        async function saveContribution(fundId) {
            const amount = Number(document.getElementById('contrib-amount')?.value);
            if (!(amount > 0)) {
                showToast('Importe no válido', true);
                return;
            }

            const f = (investmentData.funds || []).find(x => x.id === fundId);
            if (!f) return;

            f.contributions = f.contributions || [];
            f.contributions.push({
                id: 'c_' + Date.now(),
                date: document.getElementById('contrib-date')?.value || todayISO(),
                amount,
                note: document.getElementById('contrib-note')?.value.trim() || 'Aportación'
            });

            closeModal();
            document.getElementById('content').innerHTML = renderFondoIndexado();
            setTimeout(renderInvestmentCharts, 0);
            await persistInvest('Aportación registrada');
        }

        function openUpdateValuationModal(fundId) {
            const f = (investmentData.funds || []).find(x => x.id === fundId);
            if (!f) return;

            showModal(`
                <div class="modal-title">Actualizar valor actual</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">
                    Copia el valor total que ves en tu bróker para este fondo.
                </div>
                <div class="modal-label">Valor actual (€)</div>
                <input type="number" id="val-amount" class="modal-input" step="0.01" min="0" value="${fundCurrentValue(f)}">
                <div class="modal-label">Fecha</div>
                <input type="date" id="val-date" class="modal-input" value="${todayISO()}">
                <button class="btn-modal-primary" style="background:var(--invest-accent)" onclick="saveValuation('${fundId}')">Guardar</button>
            `);
        }

        async function saveValuation(fundId) {
            const value = Number(document.getElementById('val-amount')?.value);
            if (!(value >= 0)) {
                showToast('Valor no válido', true);
                return;
            }

            const f = (investmentData.funds || []).find(x => x.id === fundId);
            if (!f) return;

            f.valuations = f.valuations || [];
            f.valuations.push({
                id: 'v_' + Date.now(),
                date: document.getElementById('val-date')?.value || todayISO(),
                value
            });

            closeModal();
            document.getElementById('content').innerHTML = renderFondoIndexado();
            setTimeout(renderInvestmentCharts, 0);
            await persistInvest('Valor actualizado');
        }

        async function deleteFund(fundId) {
            if (!confirm('¿Eliminar este fondo y todo su historial?')) return;

            investmentData.funds = (investmentData.funds || []).filter(f => f.id !== fundId);
            closeModal();
            document.getElementById('content').innerHTML = renderFondoIndexado();
            setTimeout(renderInvestmentCharts, 0);
            await persistInvest('Fondo eliminado');
        }

        async function updateExpectedRate() {
            // El supuesto de simulación queda fijado al 5 % anual.
            investmentData.rate = 5;
            await persistInvest();
        }

        async function updateProjectionMonthly(value) {
            const monthly = Math.max(0, Number(value) || 0);
            investmentData.projectionMonthly = monthly;
            try {
                await persistInvest();
                document.getElementById('content').innerHTML = renderFondoIndexado();
                setTimeout(renderInvestmentCharts, 0);
            } catch (e) {
                console.error(e);
            }
        }
let portfolioAllocationChart = null;
        let portfolioProjectionChart = null;

        function portfolioTimeline() {
            const events = [];

            (investmentData.funds || []).forEach(f => {
                (f.contributions || []).forEach(c => {
                    events.push({
                        date: c.date,
                        type: 'contrib',
                        amount: Number(c.amount) || 0
                    });
                });
            });

            events.sort((a, b) => String(a.date).localeCompare(String(b.date)));

            let running = 0;
            const investedSeries = events.map(e => {
                running += e.amount;
                return { date: e.date, value: running };
            });

            const valDates = [...new Set(
                (investmentData.funds || [])
                    .flatMap(f => (f.valuations || []).map(v => v.date))
            )].sort();

            const valueSeries = valDates.map(d => {
                const total = (investmentData.funds || []).reduce((sum, f) => {
                    const vs = (f.valuations || [])
                        .filter(v => v.date <= d)
                        .sort((a, b) => String(a.date).localeCompare(String(b.date)));

                    return sum + (vs.length ? Number(vs[vs.length - 1].value) || 0 : 0);
                }, 0);

                return { date: d, value: total };
            });

            return { investedSeries, valueSeries };
        }

        function renderInvestmentCharts() {
            if (typeof Chart === 'undefined') return;

            const hEl = document.getElementById('portfolioHistoryChart');
            const aEl = document.getElementById('portfolioAllocationChart');
            const pEl = document.getElementById('portfolioProjectionChart');
if (portfolioAllocationChart) portfolioAllocationChart.destroy();
            if (portfolioProjectionChart) portfolioProjectionChart.destroy();

            if (hEl) {
                const { investedSeries, valueSeries } = portfolioTimeline();
                const allDates = [...new Set([
                    ...investedSeries.map(s => s.date),
                    ...valueSeries.map(s => s.date)
                ])].sort();

                const investedMap = {};
                const valueMap = {};
                investedSeries.forEach(s => investedMap[s.date] = s.value);
                valueSeries.forEach(s => valueMap[s.date] = s.value);

                let lastInv = 0;
                let lastVal = null;

                const investedData = allDates.map(d => {
                    if (investedMap[d] !== undefined) lastInv = investedMap[d];
                    return lastInv;
                });

                const valueData = allDates.map(d => {
                    if (valueMap[d] !== undefined) lastVal = valueMap[d];
                    return lastVal;
                });

                portfolioHistoryChart = new Chart(hEl.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: allDates.map(d => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', {
                            month: 'short',
                            year: '2-digit'
                        })),
                        datasets: [
                            {
                                label: 'Capital aportado',
                                data: investedData,
                                borderColor: '#6b7280',
                                borderDash: [5, 5],
                                pointRadius: 0,
                                tension: .2
                            },
                            {
                                label: 'Valor registrado',
                                data: valueData,
                                borderColor: '#eab308',
                                backgroundColor: 'rgba(234,179,8,.12)',
                                fill: true,
                                tension: .25,
                                pointRadius: 3,
                                spanGaps: true
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                labels: {
                                    color: '#999',
                                    boxWidth: 10,
                                    font: { size: 10 }
                                }
                            },
                            tooltip: {
                                callbacks: {
                                    label: c => ` ${Number(c.raw).toLocaleString('es-ES')} €`
                                }
                            }
                        },
                        scales: {
                            x: {
                                grid: { display: false },
                                ticks: { color: '#777' }
                            },
                            y: {
                                grid: { color: 'rgba(255,255,255,.06)' },
                                ticks: {
                                    color: '#777',
                                    callback: v => Number(v).toLocaleString('es-ES') + '€'
                                }
                            }
                        }
                    }
                });
            }

            if (aEl) {
                const funds = investmentData.funds || [];
                const palette = ['#eab308', '#8B5CF6', '#3b82f6', '#ec4899', '#14b8a6', '#f97316', '#22c55e'];

                portfolioAllocationChart = new Chart(aEl.getContext('2d'), {
                    type: 'doughnut',
                    data: {
                        labels: funds.map(f => f.name),
                        datasets: [{
                            data: funds.map(fundCurrentValue),
                            backgroundColor: funds.map((f, i) => f.color || palette[i % palette.length]),
                            borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: {
                                    color: '#999',
                                    boxWidth: 10,
                                    font: { size: 10 }
                                }
                            }
                        }
                    }
                });
            }

            if (pEl) {
                const current = portfolioCurrentValue();
                const monthlyContribution = Math.max(0, Number(investmentData.projectionMonthly ?? 130));
                const annualRate = 0.05;
                const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
                let balance = current;
                let contributed = portfolioInvested();
                const projection = [current];
                const contributedSeries = [contributed];
                const interestSeries = [Math.max(0, current - contributed)];

                for (let y = 1; y <= investmentChartYears; y++) {
                    for (let m = 0; m < 12; m++) {
                        balance *= 1 + monthlyRate;
                        balance += monthlyContribution;
                        contributed += monthlyContribution;
                    }
                    projection.push(balance);
                    contributedSeries.push(contributed);
                    interestSeries.push(Math.max(0, balance - contributed));
                }

                portfolioProjectionChart = new Chart(pEl.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: projection.map((_, i) => i === 0 ? 'Hoy' : `Año ${i}`),
                        datasets: [
                            {
                                label: 'Valor estimado',
                                data: projection,
                                borderColor: '#eab308',
                                backgroundColor: 'rgba(234,179,8,.10)',
                                fill: true,
                                tension: .3,
                                pointRadius: 0
                            },
                            {
                                label: 'Capital aportado',
                                data: contributedSeries,
                                borderColor: '#6b7280',
                                borderDash: [5, 5],
                                pointRadius: 0,
                                tension: .2
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                labels: {
                                    color: '#999',
                                    boxWidth: 10,
                                    font: { size: 10 }
                                }
                            },
                            tooltip: {
                                callbacks: {
                                    label: c => ` ${Number(c.raw).toLocaleString('es-ES')} €`
                                }
                            }
                        },
                        scales: {
                            x: {
                                grid: { display: false },
                                ticks: { color: '#777' }
                            },
                            y: {
                                grid: { color: 'rgba(255,255,255,.06)' },
                                ticks: {
                                    color: '#777',
                                    callback: v => Number(v).toLocaleString('es-ES') + '€'
                                }
                            }
                        }
                    }
                });
            }
        }

        function setInvestmentYears(years) {
            investmentChartYears = years;
            document.getElementById('content').innerHTML = renderFondoIndexado();
            setTimeout(renderInvestmentCharts, 0);
        }

        // ============================================================
        //  DOCUMENTS
        // ============================================================
        function renderDocuments() {
            return `
                <div style="max-width:980px">
                    <div class="doc-upload-box" onclick="document.getElementById('doc-upload-input').click()">
                        <div style="font-size:28px;margin-bottom:6px">📄</div>
                        <div style="font-weight:600;margin-bottom:4px;color:var(--text-primary)">Sube un documento PDF</div>
                        <div style="font-size:12px;color:var(--text-secondary)">Pulsa aquí para elegir un archivo</div>
                    </div>
                    <div id="doc-list">Cargando documentos...</div>
                </div>`;
        }

        let documents = [];

        async function loadDocuments() {
            const listEl = document.getElementById('doc-list');
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) { documents = [];
                    if (listEl) listEl.innerHTML = ''; return; }
                const { data, error } = await sb.storage.from('documents').list(user.id, {
                    sortBy: { column: 'created_at', order: 'desc' }
                });
                if (error) throw error;
                documents = data || [];
                if (listEl) renderDocList();
            } catch (e) {
                console.error('Error cargando documentos:', e);
                if (listEl) listEl.innerHTML =
                    `<div class="empty-state"><div class="empty-icon">📄</div><div class="empty-title">No se pudieron cargar los documentos</div><div class="empty-sub">${(e?.message || 'Comprueba que el bucket "documents" existe en Supabase Storage')}</div></div>`;
            }
        }

        function renderDocList() {
            const listEl = document.getElementById('doc-list');
            if (!listEl) return;
            if (!documents.length) {
                listEl.innerHTML =
                    `<div class="empty-state"><div class="empty-icon">📄</div><div class="empty-title">Sin documentos</div><div class="empty-sub">Sube tu primer PDF con el botón de arriba</div></div>`;
                return;
            }
            listEl.innerHTML = documents.map(doc => {
                const sizeKb = doc.metadata?.size ? Math.round(doc.metadata.size / 1024) + ' KB' : '';
                const date = doc.created_at ? new Date(doc.created_at).toLocaleDateString('es-ES') : '';
                return `
                    <div class="doc-item">
                        <div class="doc-info">
                            <span style="font-size:20px">📄</span>
                            <div style="min-width:0">
                                <div class="doc-name">${escapeHtml(doc.name)}</div>
                                <div class="doc-meta">${date}${sizeKb ? ' · ' + sizeKb : ''}</div>
                            </div>
                        </div>
                        <div class="doc-actions">
                            <button class="doc-action-download" onclick="downloadDocument('${escapeHtml(doc.name)}')">Descargar</button>
                            <button class="doc-action-delete-btn" title="Eliminar" onclick="deleteDocument('${escapeHtml(doc.name)}')">✕</button>
                        </div>
                    </div>`;
            }).join('');
        }

        async function handleDocUpload(event) {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;
            if (file.type !== 'application/pdf') { showToast('Solo se admiten archivos PDF', true); return; }
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/${Date.now()}_${file.name}`;
                const { error } = await sb.storage.from('documents').upload(path, file, { upsert: false });
                if (error) throw error;
                showToast('Documento subido correctamente');
                await loadDocuments();
            } catch (e) {
                console.error('Error subiendo documento:', e);
                showToast('Error al subir: ' + (e?.message || 'desconocido'), true);
            }
        }

        async function downloadDocument(name) {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/${name}`;
                const { data, error } = await sb.storage.from('documents').createSignedUrl(path, 60);
                if (error) throw error;
                window.open(data.signedUrl, '_blank');
            } catch (e) {
                console.error('Error descargando documento:', e);
                showToast('Error al descargar: ' + (e?.message || 'desconocido'), true);
            }
        }

        async function deleteDocument(name) {
            if (!confirm('¿Eliminar este documento? No se puede deshacer.')) return;
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/${name}`;
                const { error } = await sb.storage.from('documents').remove([path]);
                if (error) throw error;
                showToast('Documento eliminado');
                await loadDocuments();
            } catch (e) {
                console.error('Error eliminando documento:', e);
                showToast('Error al eliminar: ' + (e?.message || 'desconocido'), true);
            }
        }

        // ============================================================
        //  FANTASY
        // ============================================================
        let fantasyData = { usuarios: [], transacciones: [], jornadas: [], valorHistorico: [] };
        // true cuando fantasyData procede de Supabase (loadData()) en vez de
        // solo del localStorage de este dispositivo.
        let fantasyDataFromCloud = false;
        let fantasyChartInstance = null;
        let patrimonyChartInstance = null;
        let pointsChartInstance = null;
        let economicChartInstance = null;

        // Preferencia de tema visual de Fantasy (persistida en localStorage,
        // independiente del tema general de la app).
        let fantasyTheme = localStorage.getItem('fantasy_theme') || 'default';

        function toggleFantasyTheme() {
            fantasyTheme = fantasyTheme === 'green' ? 'default' : 'green';
            localStorage.setItem('fantasy_theme', fantasyTheme);
            document.getElementById('content').innerHTML = renderFantasy();
            renderAllFantasyCharts();
        }

        // Usuarios ocultos (deseleccionados) en las gráficas de puntos y de
        // evolución económica; cada una mantiene su propia selección. Se
        // guarda en fantasyData.hiddenChartUsers para que la selección viaje
        // con el resto de datos de Fantasy y siga así al volver a entrar.
        let fantasyHiddenUsers = { points: new Set(), economic: new Set() };

        function hydrateFantasyHiddenUsers() {
            const saved = fantasyData.hiddenChartUsers || {};
            fantasyHiddenUsers = {
                points: new Set(Array.isArray(saved.points) ? saved.points : []),
                economic: new Set(Array.isArray(saved.economic) ? saved.economic : [])
            };
        }

        function persistFantasyHiddenUsers() {
            fantasyData.hiddenChartUsers = {
                points: Array.from(fantasyHiddenUsers.points),
                economic: Array.from(fantasyHiddenUsers.economic)
            };
            saveFantasyData();
        }

        function toggleFantasyChartUser(chartKey, nombre) {
            const set = fantasyHiddenUsers[chartKey];
            if (set.has(nombre)) set.delete(nombre); else set.add(nombre);
            persistFantasyHiddenUsers();
            if (chartKey === 'points') renderPointsChart(); else renderEconomicEvolutionChart();
            const chipsEl = document.getElementById('fantasy-chips-' + chartKey);
            if (chipsEl) chipsEl.innerHTML = renderFantasyUserChips(chartKey);
        }

        function resetFantasyChartUsers(chartKey) {
            fantasyHiddenUsers[chartKey].clear();
            persistFantasyHiddenUsers();
            if (chartKey === 'points') renderPointsChart(); else renderEconomicEvolutionChart();
            const chipsEl = document.getElementById('fantasy-chips-' + chartKey);
            if (chipsEl) chipsEl.innerHTML = renderFantasyUserChips(chartKey);
        }

        function renderFantasyUserChips(chartKey) {
            const allOff = fantasyData.usuarios.length > 0 && fantasyHiddenUsers[chartKey].size === 0;
            return `
                <button class="fantasy-user-chip all ${!allOff ? 'off' : ''}" style="--chip-color:var(--fx-text-secondary)" onclick="resetFantasyChartUsers('${chartKey}')">Todos</button>
                ${fantasyData.usuarios.map(u => {
                    const hidden = fantasyHiddenUsers[chartKey].has(u.nombre);
                    return `<button class="fantasy-user-chip ${hidden ? 'off' : ''}" style="--chip-color:${fantasyUserColor(u.nombre)}" onclick="toggleFantasyChartUser('${chartKey}','${u.nombre}')">${escapeHtml(u.nombre)}</button>`;
                }).join('')}
            `;
        }

        // Puntos acumulados totales de un usuario a lo largo de todas las jornadas.
        function fantasyTotalPoints(nombre) {
            return fantasyData.jornadas.reduce((sum, j) => sum + (j.puntos[nombre] || 0), 0);
        }

        // Panel a la derecha de la gráfica de puntos: cuánto por delante/detrás
        // está "Bordalostias" de cada rival, en puntos acumulados.
        const FANTASY_ME = 'Bordalostias';
        function renderFantasyPointsGap() {
            const meExists = fantasyData.usuarios.some(u => u.nombre === FANTASY_ME);
            if (!meExists || !fantasyData.jornadas.length) {
                return `<div class="fantasy-empty-state" style="padding:12px 4px">Sin datos suficientes</div>`;
            }
            const miTotal = fantasyTotalPoints(FANTASY_ME);
            const rows = fantasyData.usuarios
                .filter(u => u.nombre !== FANTASY_ME)
                .map(u => ({ nombre: u.nombre, diff: miTotal - fantasyTotalPoints(u.nombre) }))
                .sort((a, b) => b.diff - a.diff);
            return `
                <div style="font-size:10px;font-weight:700;color:var(--fx-text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Distancia vs. ${escapeHtml(FANTASY_ME)}</div>
                <div style="display:flex;flex-direction:column;gap:7px">
                    ${rows.map(r => `
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px">
                            <span style="color:var(--fx-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.nombre)}</span>
                            <span style="font-weight:700;white-space:nowrap;color:${r.diff >= 0 ? '#16a34a' : '#dc2626'}">${r.diff >= 0 ? '+' : ''}${r.diff} pts</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // Mostrar/ocultar la tabla de beneficios por reventa (desplegable).
        let fantasyShowProfitTable = false;
        function toggleFantasyProfitTable() {
            fantasyShowProfitTable = !fantasyShowProfitTable;
            document.getElementById('content').innerHTML = renderFantasy();
            renderAllFantasyCharts();
        }

        // Convierte 'YYYY-MM-DD' o 'YYYY-MM-DD HH:MM' en un timestamp comparable.
        // Ordenar por string (localeCompare) fallaba en cuanto se mezclaban fechas
        // con y sin hora, o si faltaba el campo: por eso el timeline no siempre
        // mostraba las operaciones más recientes arriba.
        // Las fechas pegadas desde el texto de importación vienen en formato
        // DD/MM/AAAA (el que usa el propio juego), mientras que el resto de
        // fechas de la app ya están en ISO (AAAA-MM-DD). new Date() no sabe
        // parsear "30/08/2026" de forma fiable (en muchos motores devuelve
        // Invalid Date), así que sin este caso especial todas esas fechas
        // valían 0 y el orden cronológico entre transacciones quedaba mal —
        // esto es lo que hacía que un jugador vendido y vuelto a comprar (o
        // viceversa) pudiera aparecer con el estado equivocado en la plantilla.
        function fantasyDateValue(fecha) {
            if (!fecha) return 0;
            const partes = String(fecha).trim().split(' ');
            const fechaParte = partes[0];
            const horaParte = /^\d{2}:\d{2}/.test(partes[1] || '') ? partes[1] + ':00' : '00:00:00';

            const dmy = fechaParte.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (dmy) {
                const [, d, m, y] = dmy;
                const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${horaParte}`;
                const dt = new Date(iso);
                return isNaN(dt) ? 0 : dt.getTime();
            }

            const normalized = /\d{2}:\d{2}/.test(fecha) ? fecha.replace(' ', 'T') : fecha + 'T00:00:00';
            const d = new Date(normalized);
            return isNaN(d) ? 0 : d.getTime();
        }

        // Color estable por usuario (mismo índice que en fantasyData.usuarios),
        // usado tanto en las tarjetas/avatares como en las 4 gráficas para que
        // un mismo usuario se identifique siempre con el mismo color — salvo
        // cuando su efectivo está en números rojos (rojo) o por debajo del
        // umbral de aviso (amarillo), en cuyo caso ese estado manda en todas
        // partes donde aparezca ese usuario. La paleta evita a propósito los
        // tonos rojo/ámbar/naranja para que nunca se confunda un color de
        // identidad con el aviso de efectivo bajo o negativo.
        const FANTASY_PALETTE = ['#3b82f6', '#ec4899', '#8B5CF6', '#14b8a6', '#22c55e', '#06b6d4', '#a855f7', '#0ea5e9'];
        const FANTASY_LOW_CASH_COLOR_THRESHOLD = 15000000;
        function fantasyUserColor(nombre) {
            const idx = fantasyData.usuarios.findIndex(u => u.nombre === nombre);
            const u = idx >= 0 ? fantasyData.usuarios[idx] : null;
            if (u) {
                if (u.efectivo < 0) return '#dc2626';
                if (u.efectivo < FANTASY_LOW_CASH_COLOR_THRESHOLD) return '#f59e0b';
            }
            return FANTASY_PALETTE[(idx >= 0 ? idx : 0) % FANTASY_PALETTE.length];
        }

        // Formatea cifras grandes de forma compacta (18,2M€ / 950K€) para que las
        // tarjetas no se vean saturadas de dígitos; el valor exacto va en el title.
        function fantasyAbbreviate(value) {
            const abs = Math.abs(value);
            const sign = value < 0 ? '-' : '';
            if (abs >= 1000000) return sign + (abs / 1000000).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + 'M€';
            if (abs >= 1000) return sign + (abs / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + 'K€';
            return sign + abs.toLocaleString('es-ES') + '€';
        }

        function fantasyInitials(nombre) {
            const clean = (nombre || '').trim();
            if (!clean) return '?';
            const parts = clean.split(/[\s_]+/).filter(Boolean);
            if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
            return clean.slice(0, 2).toUpperCase();
        }

        function loadFantasyData() {
            // Si Supabase ya nos dio datos de Fantasy en loadData(), esos son
            // la fuente de verdad (viajan entre dispositivos); el localStorage
            // solo se usa como caché offline cuando aún no hay nada en la nube.
            if (fantasyDataFromCloud) return true;
            try {
                const stored = localStorage.getItem('fantasy_data');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    fantasyData = parsed;
                    if (!fantasyData.jornadas) fantasyData.jornadas = [];
                    if (!fantasyData.valorHistorico) fantasyData.valorHistorico = [];
                    hydrateFantasyHiddenUsers();
                    return true;
                }
            } catch (e) { console.error('Error cargando datos de Fantasy:', e); }
            return false;
        }

        function saveFantasyData() {
            try {
                localStorage.setItem('fantasy_data', JSON.stringify(fantasyData));
                fantasyDataFromCloud = true;
                if (typeof saveData === 'function') saveData();
                return true;
            } catch (e) {
                console.error('Error guardando datos de Fantasy:', e);
                return false;
            }
        }

        function getDefaultFantasyData() {
            return { usuarios: [], transacciones: [], jornadas: [], valorHistorico: [] };
        }

        function snapshotValoresActuales() {
            const today = todayISO();
            fantasyData.usuarios.forEach(u => {
                const valorTotal = u.efectivo + u.valor_plantilla;
                const existing = fantasyData.valorHistorico.find(s => s.fecha === today && s.nombre === u.nombre);
                if (existing) {
                    existing.valorTotal = valorTotal;
                } else {
                    fantasyData.valorHistorico.push({ fecha: today, nombre: u.nombre, valorTotal: valorTotal });
                }
            });
            fantasyData.valorHistorico.sort((a, b) => a.fecha.localeCompare(b.fecha));
        }

        function recalcFantasyBalances() {
            const INITIAL_CASH = 100000000;
            const INITIAL_TEAM = 100000000;

            fantasyData.usuarios.forEach(u => {
                u.efectivo = INITIAL_CASH;
                u.valor_plantilla = (typeof u.valor_plantilla_manual === 'number') ? u.valor_plantilla_manual :
                    INITIAL_TEAM;
            });

            fantasyData.transacciones.forEach(tx => {
                const comprador = fantasyData.usuarios.find(u => u.nombre === tx.comprador);
                const vendedor = fantasyData.usuarios.find(u => u.nombre === tx.vendedor);

                if (comprador && comprador.nombre !== 'LALIGA') {
                    comprador.efectivo -= tx.precio;
                }
                if (vendedor && vendedor.nombre !== 'LALIGA') {
                    vendedor.efectivo += tx.precio;
                }
            });

            snapshotValoresActuales();
        }

        // ============================================================
        //  FANTASY: ADD USER MANUALLY (6.1)
        // ============================================================
        function addFantasyUserManually() {
            showModal(`
                <div class="modal-title" style="color:var(--fantasy-accent)">◉ Añadir usuario</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">El nombre debe coincidir exactamente (mayúsculas/minúsculas incluidas) con el que aparece en las transacciones.</div>
                <div class="modal-label">Nombre de usuario</div>
                <input id="new-fantasy-user-name" class="modal-input" placeholder="Ej: VEZAMAN">
                <div id="new-fantasy-user-error" style="color:#dc2626;font-size:12px;margin-bottom:8px;min-height:16px"></div>
                <button class="btn-modal-primary" style="background:var(--fantasy-accent)" onclick="confirmAddFantasyUser()">Añadir</button>
            `);
        }

        function confirmAddFantasyUser() {
            const name = document.getElementById('new-fantasy-user-name').value.trim();
            const errorEl = document.getElementById('new-fantasy-user-error');
            if (!name) { errorEl.textContent = 'Escribe un nombre'; return; }
            if (fantasyData.usuarios.find(u => u.nombre === name)) {
                errorEl.textContent = 'Ya existe un usuario con ese nombre exacto';
                return;
            }
            fantasyData.usuarios.push({ nombre: name, efectivo: 100000000, valor_plantilla: 100000000 });
            saveFantasyData();
            closeModal();
            document.getElementById('content').innerHTML = renderFantasy();
            renderAllFantasyCharts();
            showToast('Usuario "' + name + '" añadido');
        }

        // ============================================================
        //  FANTASY: RECOMPENSA DIARIA POR VÍDEO (+100.000€)
        //  Se puede otorgar una vez al día por usuario, seleccionando a quién.
        // ============================================================
        function openVideoRewardModal() {
            const today = todayISO();
            const alreadyGranted = new Set(
                fantasyData.transacciones
                    .filter(t => t.tipo === 'video' && t.fecha === today)
                    .map(t => t.vendedor)
            );
            showModal(`
                <div class="modal-title" style="color:var(--fantasy-accent)">Recompensa por vídeo (+100.000€)</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Selecciona quién ha visto hoy el vídeo opcional del juego. Cada usuario solo puede recibirla una vez al día.</div>
                <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;max-height:280px;overflow-y:auto">
                    ${fantasyData.usuarios.length ? fantasyData.usuarios.map(u => {
                        const granted = alreadyGranted.has(u.nombre);
                        return `
                        <label style="display:flex;align-items:center;gap:8px;font-size:13px;${granted ? 'opacity:.5' : 'cursor:pointer'}">
                            <input type="checkbox" class="video-reward-check" value="${escapeHtml(u.nombre)}" ${granted ? 'disabled checked' : ''}>
                            ${escapeHtml(u.nombre)}${granted ? ' <span style="font-size:11px">(ya otorgado hoy)</span>' : ''}
                        </label>`;
                    }).join('') : '<div style="font-size:12px;color:var(--text-secondary)">Aún no hay usuarios en Fantasy</div>'}
                </div>
                <button class="btn-modal-primary" style="background:var(--fantasy-accent)" onclick="confirmVideoReward()">Otorgar 100.000€</button>
            `);
        }

        function confirmVideoReward() {
            const today = todayISO();
            const checked = Array.from(document.querySelectorAll('.video-reward-check:not(:disabled):checked')).map(el => el.value);
            if (!checked.length) { showToast('Selecciona al menos un usuario', true); return; }

            checked.forEach(nombre => {
                fantasyData.transacciones.push({
                    id: 'tx_video_' + Date.now() + '_' + nombre,
                    tipo: 'video',
                    jugador: 'Recompensa por vídeo',
                    precio: 100000,
                    fecha: today,
                    comprador: 'LALIGA',
                    vendedor: nombre,
                    gastoClausula: 0
                });
            });

            recalcFantasyBalances();
            saveFantasyData();
            closeModal();
            document.getElementById('content').innerHTML = renderFantasy();
            renderAllFantasyCharts();
            showToast(`Recompensa otorgada a ${checked.length} usuario${checked.length === 1 ? '' : 's'}`);
        }

        // ============================================================
        //  FANTASY: EDIT TEMPLATE VALUE (6.2)
        // ============================================================
        function editTemplateValue(nombre) {
            const u = fantasyData.usuarios.find(u => u.nombre === nombre);
            if (!u) return;
            showModal(`
                <div class="modal-title" style="color:var(--fantasy-accent)">Editar valor de plantilla</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">${escapeHtml(nombre)} · manual, no se ve afectado por compras/ventas</div>
                <input type="number" id="template-value-input" class="modal-input" value="${u.valor_plantilla}" step="100000"
                    style="font-size:20px;font-weight:800;text-align:center"
                    onkeydown="if(event.key==='Enter'){event.preventDefault();confirmEditTemplateValue('${nombre}');}">
                <div style="display:flex;gap:6px;justify-content:center;margin:10px 0 16px">
                    <button class="btn-secondary" style="width:auto;padding:6px 10px;font-size:12px" onclick="adjustTemplateValue(-5000000,'${nombre}')">-5M</button>
                    <button class="btn-secondary" style="width:auto;padding:6px 10px;font-size:12px" onclick="adjustTemplateValue(-1000000,'${nombre}')">-1M</button>
                    <button class="btn-secondary" style="width:auto;padding:6px 10px;font-size:12px" onclick="adjustTemplateValue(1000000,'${nombre}')">+1M</button>
                    <button class="btn-secondary" style="width:auto;padding:6px 10px;font-size:12px" onclick="adjustTemplateValue(5000000,'${nombre}')">+5M</button>
                </div>
                <div style="font-size:11px;color:var(--text-secondary);margin-bottom:12px">Valor total resultante: <span id="template-value-total">${(u.efectivo + u.valor_plantilla).toLocaleString('es-ES')}€</span></div>
                <button class="btn-modal-primary" style="background:var(--fantasy-accent)" onclick="confirmEditTemplateValue('${nombre}')">Guardar</button>
            `);
            setTimeout(() => document.getElementById('template-value-input')?.select(), 50);
        }

        function adjustTemplateValue(delta, nombre) {
            const input = document.getElementById('template-value-input');
            const totalEl = document.getElementById('template-value-total');
            if (!input) return;
            const newValue = (parseFloat(input.value) || 0) + delta;
            input.value = newValue;
            const u = fantasyData.usuarios.find(u => u.nombre === nombre);
            if (totalEl && u) totalEl.textContent = (u.efectivo + newValue).toLocaleString('es-ES') + '€';
        }

        function confirmEditTemplateValue(nombre) {
            const u = fantasyData.usuarios.find(u => u.nombre === nombre);
            if (!u) return;
            const value = parseFloat(document.getElementById('template-value-input').value);
            if (isNaN(value)) { showToast('Introduce un valor numérico', true); return; }
            u.valor_plantilla_manual = value;
            recalcFantasyBalances();
            saveFantasyData();
            closeModal();
            document.getElementById('content').innerHTML = renderFantasy();
            renderAllFantasyCharts();
            showToast('Valor de plantilla actualizado');
        }

        // ============================================================
        //  FANTASY: CALCULATE PLAYER PROFITS (6.4)
        // ============================================================
        function calculatePlayerProfits(nombre) {
            const txsByPlayer = {};
            fantasyData.transacciones.forEach(tx => {
                if (tx.comprador !== nombre && tx.vendedor !== nombre) return;
                if (!txsByPlayer[tx.jugador]) txsByPlayer[tx.jugador] = [];
                txsByPlayer[tx.jugador].push(tx);
            });

            const profits = [];
            Object.entries(txsByPlayer).forEach(([jugador, txs]) => {
                const sorted = txs.slice().sort((a, b) => fantasyDateValue(a.fecha) - fantasyDateValue(b.fecha));
                let openBuy = null;
                sorted.forEach(tx => {
                    // No usamos únicamente tx.tipo, ya que en un TRASPASO (compraventa entre
                    // usuarios, ninguno "LALIGA") el lado del vendedor no debe perderse aunque
                    // el campo tipo esté etiquetado como "compra" (dato antiguo o traspaso).
                    const isSystemTx = tx.tipo === 'clausula' || tx.tipo === 'premio' || tx.tipo === 'video';
                    const boughtByUser = !isSystemTx && tx.comprador === nombre;
                    const soldByUser = !isSystemTx && tx.vendedor === nombre;

                    if (boughtByUser) {
                        openBuy = tx;
                    } else if (soldByUser && openBuy) {
                        profits.push({
                            jugador,
                            fechaCompra: openBuy.fecha,
                            fechaVenta: tx.fecha,
                            precioCompra: openBuy.precio,
                            precioVenta: tx.precio,
                            beneficio: tx.precio - openBuy.precio,
                            sinCompraRegistrada: false
                        });
                        openBuy = null;
                    } else if (soldByUser && !openBuy) {
                        profits.push({
                            jugador,
                            fechaVenta: tx.fecha,
                            precioVenta: tx.precio,
                            sinCompraRegistrada: true,
                            beneficio: null
                        });
                    }
                });
            });

            return profits;
        }

        // ============================================================
        //  FANTASY: PLANTILLA ACTUAL POR USUARIO (6.4b)
        // ============================================================
        // Un jugador pertenece a "nombre" si, siguiendo sus transacciones en
        // orden cronológico (misma lógica que calculatePlayerProfits: premio/
        // clausula/video no cuentan como compra o venta), la última operación
        // que le afecta es una compra suya sin venta posterior — o si nunca
        // hubo transacción para ese jugador pero está en su equipo inicial
        // (jugadores con los que empezó la temporada, sin compra registrada).
        function getUserSquad(nombre) {
            const u = fantasyData.usuarios.find(x => x.nombre === nombre);
            if (!u) return [];
            if (!Array.isArray(u.equipoInicial)) u.equipoInicial = [];
            if (!Array.isArray(u.plantillaOcultos)) u.plantillaOcultos = [];

            const txsByPlayer = {};
            fantasyData.transacciones.forEach(tx => {
                if (tx.comprador !== nombre && tx.vendedor !== nombre) return;
                if (!txsByPlayer[tx.jugador]) txsByPlayer[tx.jugador] = [];
                txsByPlayer[tx.jugador].push(tx);
            });

            const squad = [];
            Object.entries(txsByPlayer).forEach(([jugador, txs]) => {
                const sorted = txs.slice().sort((a, b) => fantasyDateValue(a.fecha) - fantasyDateValue(b.fecha));
                let openBuy = null;
                sorted.forEach(tx => {
                    const isSystemTx = tx.tipo === 'clausula' || tx.tipo === 'premio' || tx.tipo === 'video';
                    if (!isSystemTx && tx.comprador === nombre) openBuy = tx;
                    else if (!isSystemTx && tx.vendedor === nombre) openBuy = null;
                });
                // "Borrar" un jugador de la plantilla NUNCA toca la transacción de
                // compra real (eso movería dinero de verdad). Solo se anota su id
                // en plantillaOcultos para dejar de mostrarlo aquí; si algún día
                // vuelve a comprarse, la nueva transacción tiene otro id y no
                // sigue oculta.
                if (openBuy && !u.plantillaOcultos.includes(openBuy.id)) {
                    squad.push({
                        jugador,
                        source: 'tx',
                        refId: openBuy.id,
                        fecha: openBuy.fecha,
                        valorInicial: (typeof openBuy.clausulaValorInicial === 'number') ? openBuy.clausulaValorInicial : openBuy.precio,
                        valorActual: (typeof openBuy.clausulaValorActual === 'number') ? openBuy.clausulaValorActual : openBuy.precio,
                        gasto: openBuy.clausulaGasto || 0
                    });
                }
            });

            u.equipoInicial.forEach(p => {
                if (txsByPlayer[p.jugador]) return; // ya tiene transacciones propias: no es "inicial" a estas alturas
                squad.push({
                    jugador: p.jugador,
                    source: 'inicial',
                    refId: p.id,
                    fecha: null,
                    valorInicial: p.valorInicial,
                    valorActual: (typeof p.valorActual === 'number') ? p.valorActual : p.valorInicial,
                    gasto: p.gasto || 0
                });
            });

            return squad.sort((a, b) => a.jugador.localeCompare(b.jugador, 'es'));
        }

        function showFantasySquad(nombre) {
            const squad = getUserSquad(nombre);
            const html = `
                <div class="modal-title" style="color:var(--fantasy-accent)">Plantilla de ${escapeHtml(nombre)}</div>
                <div style="font-size:11px;color:var(--text-secondary);margin-bottom:12px">${squad.length} jugador${squad.length === 1 ? '' : 'es'}. Incluye compras sin vender y el equipo inicial.</div>

                <div style="display:flex;gap:6px;margin-bottom:14px">
                    <input id="squad-add-player" class="modal-input" style="margin:0" placeholder="Jugador (equipo inicial)">
                    <input id="squad-add-value" type="number" class="modal-input" style="margin:0;max-width:130px" placeholder="Valor inicial" step="0.01">
                    <button class="btn-secondary" style="width:auto;flex-shrink:0" onclick="addInitialSquadPlayer('${nombre}')">+ Añadir</button>
                </div>

                <div id="squad-list-${nombre}" style="max-height:360px;overflow-y:auto">
                    ${renderFantasySquadList(nombre, squad)}
                </div>
            `;
            showModal(html);
        }

        function renderFantasySquadList(nombre, squad) {
            if (!squad.length) return '<div style="padding:16px;color:var(--text-secondary);text-align:center">Sin jugadores en plantilla</div>';
            return squad.map(p => `
                <div class="fantasy-tx-item">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
                        <span style="font-weight:700">${escapeHtml(p.jugador)}</span>
                        <button class="btn-secondary" style="padding:2px 8px;font-size:10px;color:#dc2626;border-color:#dc2626" title="Borrar jugador" onclick="confirmDeleteSquadPlayer('${nombre}', '${escapeHtml(p.jugador).replace(/'/g, "\\'")}', '${p.source}', '${p.refId}')">✕</button>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
                        <span style="font-size:11px;color:var(--text-secondary)">
                            Valor: ${p.valorActual.toLocaleString('es-ES')}€
                            ${p.gasto > 0 ? `<span style="color:var(--fantasy-accent);font-weight:700"> · Cláusula: ${p.gasto.toLocaleString('es-ES')}€</span>` : ''}
                        </span>
                        <button class="btn-secondary" style="padding:2px 10px;font-size:10px" onclick="openSquadClauseCalculator('${nombre}', '${escapeHtml(p.jugador).replace(/'/g, "\\'")}', '${p.source}', '${p.refId}')">Cláusula</button>
                    </div>
                </div>
            `).join('');
        }

        function refreshFantasySquadModal(nombre) {
            const list = document.getElementById('squad-list-' + nombre);
            if (list) list.innerHTML = renderFantasySquadList(nombre, getUserSquad(nombre));
        }

        function addInitialSquadPlayer(nombre) {
            const u = fantasyData.usuarios.find(x => x.nombre === nombre);
            if (!u) return;
            const nameInput = document.getElementById('squad-add-player');
            const valueInput = document.getElementById('squad-add-value');
            const jugador = nameInput?.value.trim();
            const valor = parseFloat(valueInput?.value);
            if (!jugador) { showToast('Escribe el nombre del jugador', true); return; }
            if (isNaN(valor) || valor < 0) { showToast('Introduce un valor inicial válido', true); return; }
            if (!Array.isArray(u.equipoInicial)) u.equipoInicial = [];
            u.equipoInicial.push({ id: 'inicial_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), jugador, valorInicial: valor });
            saveFantasyData();
            nameInput.value = '';
            valueInput.value = '';
            refreshFantasySquadModal(nombre);
            document.getElementById('content').innerHTML = renderFantasy();
            renderAllFantasyCharts();
            showToast('Jugador añadido a la plantilla inicial');
        }

        // Borrar un jugador de la plantilla es una acción solo visual: nunca
        // borra ni modifica una transacción real ni el efectivo del usuario
        // (eso causó un descuadre real de saldo — un jugador "eliminado" así
        // hacía desaparecer su compra y el dinero volvía a aparecer como
        // disponible). Si el jugador viene de una compra, simplemente se
        // apunta su id como oculto; si viene del equipo inicial (sin
        // transacción ni dinero de por medio), sí se quita del todo porque
        // ahí no hay ningún movimiento económico que proteger.
        function confirmDeleteSquadPlayer(nombre, jugador, source, refId) {
            if (!confirm(`¿Seguro que quieres borrar a ${jugador} de la plantilla? Esto no afecta a ninguna transacción ni a tu efectivo.`)) return;
            const u = fantasyData.usuarios.find(x => x.nombre === nombre);
            if (!u) return;
            if (source === 'tx') {
                if (!Array.isArray(u.plantillaOcultos)) u.plantillaOcultos = [];
                if (!u.plantillaOcultos.includes(refId)) u.plantillaOcultos.push(refId);
            } else {
                u.equipoInicial = (u.equipoInicial || []).filter(p => p.id !== refId);
            }
            saveFantasyData();
            refreshFantasySquadModal(nombre);
            document.getElementById('content').innerHTML = renderFantasy();
            renderAllFantasyCharts();
            showToast('Jugador quitado de la plantilla');
        }

        // Calculadora de cláusula: el juego duplica en el valor de mercado lo
        // que se gasta en subir una cláusula (gastas 1M, el valor sube 2M). El
        // gasto se acumula entre usos: "Valor anterior" viene precargado con
        // el último valor que Bitácora tenía registrado (editable, por si ese
        // valor subió por otro motivo y no quieres que cuente como cláusula),
        // y "Valor nuevo" es lo que ves ahora en el juego. Solo la diferencia
        // de ESTA subida se suma al total ya gastado — no hay que llevar la
        // cuenta manualmente de cada subida por separado.
        function openSquadClauseCalculator(nombre, jugador, source, refId) {
            const squad = getUserSquad(nombre);
            const p = squad.find(x => x.source === source && String(x.refId) === String(refId));
            if (!p) return;
            showModal(`
                <div class="modal-title" style="color:var(--fantasy-accent)">Cláusula — ${escapeHtml(jugador)}</div>
                ${p.gasto > 0 ? `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">Gastado hasta ahora en cláusulas: <strong style="color:var(--fantasy-accent)">${p.gasto.toLocaleString('es-ES')}€</strong></div>` : ''}
                <div class="modal-label">Valor anterior (antes de esta subida)</div>
                <input type="number" id="squad-clause-anterior" class="modal-input" value="${p.valorActual}" step="0.01" data-gasto-previo="${p.gasto}" oninput="updateSquadClausePreview()">
                <div class="modal-label">Valor nuevo (lo que ves ahora en el juego)</div>
                <input type="number" id="squad-clause-nuevo" class="modal-input" value="${p.valorActual}" step="0.01" oninput="updateSquadClausePreview()">
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Gasto en esta subida (se suma a lo ya gastado): <strong id="squad-clause-incremento" style="color:var(--fantasy-accent)">0€</strong></div>
                <button class="btn-modal-primary" style="background:var(--fantasy-accent)" onclick="confirmSquadClauseCalculator('${nombre}', '${escapeHtml(jugador).replace(/'/g, "\\'")}', '${source}', '${refId}')">Guardar</button>
            `);
        }

        function updateSquadClausePreview() {
            const anteriorInput = document.getElementById('squad-clause-anterior');
            const nuevoInput = document.getElementById('squad-clause-nuevo');
            const preview = document.getElementById('squad-clause-incremento');
            if (!anteriorInput || !nuevoInput || !preview) return;
            const anterior = parseFloat(anteriorInput.value);
            const nuevo = parseFloat(nuevoInput.value);
            const incremento = (!isNaN(anterior) && !isNaN(nuevo)) ? Math.max(0, (nuevo - anterior) / 2) : 0;
            preview.textContent = incremento.toLocaleString('es-ES') + '€';
        }

        function confirmSquadClauseCalculator(nombre, jugador, source, refId) {
            const anteriorInput = document.getElementById('squad-clause-anterior');
            const nuevoInput = document.getElementById('squad-clause-nuevo');
            const anterior = parseFloat(anteriorInput.value);
            const nuevo = parseFloat(nuevoInput.value);
            if (isNaN(anterior) || isNaN(nuevo)) { showToast('Introduce valores numéricos válidos', true); return; }
            const gastoPrevio = parseFloat(anteriorInput.dataset.gastoPrevio) || 0;
            const incremento = Math.max(0, (nuevo - anterior) / 2);
            const gastoTotal = gastoPrevio + incremento;

            if (source === 'tx') {
                const tx = fantasyData.transacciones.find(t => t.id === refId);
                if (!tx) return;
                tx.clausulaValorActual = nuevo;
                tx.clausulaGasto = gastoTotal;
            } else {
                const u = fantasyData.usuarios.find(x => x.nombre === nombre);
                const p = u?.equipoInicial.find(x => x.id === refId);
                if (!p) return;
                p.valorActual = nuevo;
                p.gasto = gastoTotal;
            }

            // El gasto de ESTA subida sí sale de tu bolsillo de verdad, así
            // que se registra como una transacción real (igual que la vieja
            // "cláusula manual") y se resta del efectivo — esa es la gracia.
            // Solo se contabiliza el incremento de esta vez, no el total
            // acumulado (los incrementos anteriores ya se restaron en su
            // momento, cuando se guardaron).
            if (incremento > 0) {
                fantasyData.transacciones.push({
                    id: 'tx_clausula_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                    tipo: 'clausula',
                    jugador,
                    precio: incremento,
                    fecha: todayISO(),
                    comprador: nombre,
                    vendedor: 'LALIGA',
                    gastoClausula: 0
                });
                recalcFantasyBalances();
            }

            saveFantasyData();
            closeModal();
            showFantasySquad(nombre);
            showToast(incremento > 0 ? `-${incremento.toLocaleString('es-ES')}€ de cláusula restados de tu efectivo (total gastado ${gastoTotal.toLocaleString('es-ES')}€)` : 'Valor actualizado');
        }

        // ============================================================
        //  FANTASY: CLAUSE EXPENSE (6.5)
        // ============================================================
        function deleteFantasyTransaction(txId) {
            if (!confirm('¿Eliminar esta transacción? Esto recalculará los saldos.')) return;
            fantasyData.transacciones = fantasyData.transacciones.filter(t => t.id !== txId);
            recalcFantasyBalances();
            saveFantasyData();
            closeModal();
            document.getElementById('content').innerHTML = renderFantasy();
            renderAllFantasyCharts();
            showToast('Transacción eliminada');
        }

        // ============================================================
        //  FANTASY: POINTS BY JORNADA (6.6)
        // ============================================================
        function openJornadaForm(numero) {
            const existing = fantasyData.jornadas.find(j => j.numero === numero);
            const puntos = existing ? existing.puntos : {};

            showModal(`
                <div class="modal-title" style="color:var(--fantasy-accent)">Jornada ${numero}</div>
                ${fantasyData.usuarios.map(u => `
                    <div class="modal-label">${escapeHtml(u.nombre)}</div>
                    <input type="number" class="modal-input jornada-points-input" data-user="${escapeHtml(u.nombre)}" value="${puntos[u.nombre] || ''}" placeholder="Puntos">
                `).join('')}
                <button class="btn-modal-primary" style="background:var(--fantasy-accent)" onclick="saveJornada(${numero})">Guardar jornada</button>
            `);
        }

        function saveJornada(numero) {
            const puntos = {};
            document.querySelectorAll('.jornada-points-input').forEach(input => {
                const value = parseInt(input.value);
                if (!isNaN(value)) {
                    puntos[input.dataset.user] = value;
                }
            });
            const idx = fantasyData.jornadas.findIndex(j => j.numero === numero);
            if (idx >= 0) {
                fantasyData.jornadas[idx].puntos = puntos;
            } else {
                fantasyData.jornadas.push({ numero, puntos });
            }
            fantasyData.jornadas.sort((a, b) => a.numero - b.numero);
            saveFantasyData();
            closeModal();
            document.getElementById('content').innerHTML = renderFantasy();
            renderAllFantasyCharts();
            showToast('Jornada ' + numero + ' guardada');
        }

        // ============================================================
        //  FANTASY: TABLA DE BENEFICIOS POR REVENTA (todos los usuarios)
        // ============================================================
        // ============================================================
        //  FANTASY: TIMELINE (con buscador)
        // ============================================================
        function renderFantasyTimelineItems(filterText) {
            const q = (filterText || '').trim().toLowerCase();
            const items = fantasyData.transacciones
                .filter(tx => !q || [tx.jugador, tx.comprador, tx.vendedor].some(v => (v || '').toLowerCase().includes(q)))
                .slice()
                .sort((a, b) => fantasyDateValue(b.fecha) - fantasyDateValue(a.fecha));

            if (!items.length) {
                return `<div style="padding:16px;color:var(--fx-text-secondary);text-align:center">Sin resultados</div>`;
            }

            return items.map(tx => {
                const isClausula = tx.tipo === 'clausula';
                const isPremio = tx.tipo === 'premio';
                const isVideo = tx.tipo === 'video';
                const isBuy = tx.tipo === 'compra';
                const isNegative = isBuy || isClausula;
                const typeLabel = isVideo ? 'VÍDEO' : (isPremio ? 'PREMIO' : (isClausula ? 'CLÁUSULA' : (isBuy ? 'COMPRA' : 'VENTA')));
                const actor = tx.comprador !== 'LALIGA' ? tx.comprador : tx.vendedor;
                const dateObj = new Date(/\d{2}:\d{2}/.test(tx.fecha) ? tx.fecha.replace(' ', 'T') : tx.fecha + 'T12:00:00');
                const dateLabel = isNaN(dateObj) ? (tx.fecha || '—') : dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
                return `
                    <div class="fantasy-tx-item" style="cursor:pointer" onclick="showFantasyUserDetail('${actor}')">
                        <div style="display:flex;justify-content:space-between;align-items:center">
                            <div>
                                <span class="tx-type ${isNegative ? 'buy' : 'sell'}">${typeLabel}</span>
                                <span style="font-weight:700;margin-left:6px">${escapeHtml(actor)}</span>
                                ${(isClausula || isPremio || isVideo) ? '' : `<span style="font-size:11px;color:var(--fx-text-secondary)"> · ${escapeHtml(tx.jugador)} (${escapeHtml(tx.comprador)} → ${escapeHtml(tx.vendedor)})</span>`}
                            </div>
                            <span class="tx-amount ${isNegative ? 'negative' : 'positive'}">${isNegative ? '-' : '+'}${tx.precio.toLocaleString('es-ES')}€</span>
                        </div>
                        <div style="font-size:11px;color:var(--fx-text-secondary);margin-top:2px">${dateLabel}</div>
                    </div>
                `;
            }).join('');
        }

        function filterFantasyTimeline() {
            const input = document.getElementById('fantasy-timeline-search');
            const list = document.getElementById('fantasy-timeline-list');
            if (!input || !list) return;
            list.innerHTML = renderFantasyTimelineItems(input.value);
        }

        function toggleFantasyMoreMenu() {
            const menu = document.getElementById('fantasy-more-menu');
            if (!menu) return;
            const willOpen = !menu.classList.contains('open');
            menu.classList.toggle('open', willOpen);
            if (willOpen) {
                setTimeout(() => {
                    document.addEventListener('click', function closeFantasyMoreMenu(e) {
                        if (!menu.contains(e.target)) {
                            menu.classList.remove('open');
                            document.removeEventListener('click', closeFantasyMoreMenu);
                        }
                    });
                }, 0);
            }
        }

        function getAllFantasyProfits() {
            const rows = [];
            fantasyData.usuarios.forEach(u => {
                calculatePlayerProfits(u.nombre)
                    .filter(p => !p.sinCompraRegistrada)
                    .forEach(p => rows.push(Object.assign({ usuario: u.nombre }, p)));
            });
            return rows.sort((a, b) => fantasyDateValue(b.fechaVenta) - fantasyDateValue(a.fechaVenta));
        }

        function renderFantasyProfitTable() {
            const rows = getAllFantasyProfits();
            if (!rows.length) return '';
            return `
                <div class="fantasy-chart-container" style="margin-top:16px">
                    <div class="fantasy-chart-header">
                        <div class="fantasy-section-title" style="margin-bottom:0">Beneficios por reventa de jugadores (${rows.length})</div>
                        <button class="fantasy-collapse-toggle" onclick="toggleFantasyProfitTable()">${fantasyShowProfitTable ? 'Ocultar' : 'Mostrar'}</button>
                    </div>
                    ${fantasyShowProfitTable ? `
                        <div style="overflow-x:auto">
                            <table class="fantasy-profit-table">
                                <thead>
                                    <tr>
                                        <th>Usuario</th>
                                        <th>Jugador</th>
                                        <th>Compra</th>
                                        <th>Venta</th>
                                        <th>Precio compra</th>
                                        <th>Precio venta</th>
                                        <th>Beneficio</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rows.map(p => `
                                        <tr>
                                            <td class="profit-user" onclick="showFantasyUserDetail('${p.usuario}')">${escapeHtml(p.usuario)}</td>
                                            <td>${escapeHtml(p.jugador)}</td>
                                            <td>${p.fechaCompra}</td>
                                            <td>${p.fechaVenta}</td>
                                            <td>${p.precioCompra.toLocaleString('es-ES')}€</td>
                                            <td>${p.precioVenta.toLocaleString('es-ES')}€</td>
                                            <td class="${p.beneficio >= 0 ? 'fantasy-positive' : 'fantasy-negative'}" style="font-weight:700">${p.beneficio >= 0 ? '+' : ''}${p.beneficio.toLocaleString('es-ES')}€</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        // ============================================================
        //  RENDER: FANTASY (main)
        // ============================================================
        function renderFantasy() {
            if (!fantasyData.usuarios.length) {
                fantasyData = getDefaultFantasyData();
                recalcFantasyBalances();
                saveFantasyData();
            }

            const LOW_CASH_THRESHOLD = 20000000;
            const lowCashUsers = fantasyData.usuarios
                .filter(u => u.efectivo < LOW_CASH_THRESHOLD)
                .sort((a, b) => a.efectivo - b.efectivo);

            let html = `
                <div class="fantasy-root ${fantasyTheme === 'green' ? 'fantasy-theme-green' : ''}" style="max-width:980px">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px">
                        <div>
                            <div style="font-size:20px;font-weight:800;color:var(--fx-text)">Fantasy</div>
                            <div style="font-size:13px;color:var(--fx-text-secondary)">Análisis económico de la liga</div>
                        </div>
                        <div class="fantasy-toolbar">
                            <button class="btn-secondary fantasy-btn-accent" onclick="openVideoRewardModal()">Vídeo +100.000€</button>
                            <button class="btn-secondary" onclick="addFantasyUserManually()">Añadir usuario</button>
                            <div style="position:relative;display:inline-block">
                                <button class="btn-secondary" onclick="toggleFantasyMoreMenu()">Más opciones</button>
                                <div id="fantasy-more-menu" class="fantasy-more-menu">
                                    <div class="fantasy-theme-toggle">
                                        <span>Tema verde</span>
                                        <label class="fantasy-switch">
                                            <input type="checkbox" ${fantasyTheme === 'green' ? 'checked' : ''} onchange="toggleFantasyTheme()">
                                            <span class="fantasy-switch-track"></span>
                                        </label>
                                    </div>
                                    <button class="btn-secondary" onclick="toggleFantasyMoreMenu();exportFantasyData()">Exportar</button>
                                    <button class="btn-secondary" onclick="toggleFantasyMoreMenu();document.getElementById('fantasy-import-input').click()">Restaurar copia</button>
                                    <button class="btn-secondary" onclick="toggleFantasyMoreMenu();resetFantasyData()">Reiniciar</button>
                                    <button class="btn-secondary fantasy-btn-accent" onclick="toggleFantasyMoreMenu();changeFantasyPassword()">Cambiar contraseña</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="fantasy-chart-container" style="margin-bottom:16px">
                        <div class="fantasy-section-title">Actualizar por texto (pegar traducción de capturas)</div>
                        <textarea id="fantasy-text-import" class="modal-input" rows="1" placeholder="Pega aquí el texto (COMPRA / VENTA / TRASPASO / PREMIO / NUEVO)..." style="margin-bottom:8px;resize:vertical;min-height:38px;overflow:hidden" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
                        <button class="btn-secondary fantasy-btn-accent" style="margin:0;padding:7px 14px;font-size:12px;width:auto;border-radius:14px" onclick="processFantasyTextImport()">Procesar texto</button>
                        <div style="font-size:10px;color:var(--fx-text-secondary);margin-top:6px">Las líneas de tipo "shielded" (protección de jugador) se ignoran automáticamente: no tienen efecto económico.</div>
                        <div id="fantasy-import-summary" style="font-size:12px;margin-top:8px"></div>
                    </div>

                    <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
                        <select id="jornada-selector" class="modal-input" style="width:auto;display:inline-block;margin-bottom:0;padding:6px 12px">
                            ${Array.from({length: 38}, (_, i) => i + 1).map(n => {
                                const registrada = fantasyData.jornadas.some(j => j.numero === n);
                                return `<option value="${n}">${registrada ? '✓ ' : ''}Jornada ${n}</option>`;
                            }).join('')}
                        </select>
                        <button class="btn-secondary" style="width:auto" onclick="openJornadaForm(parseInt(document.getElementById('jornada-selector').value))">Registrar jornada</button>
                    </div>

                    <div class="fantasy-chart-container">
                        <div class="fantasy-chart-header"><div class="fantasy-section-title">Efectivo por usuario</div></div>
                        <div class="fantasy-canvas-wrap"><canvas id="fantasyChart"></canvas></div>
                    </div>

                    <div class="fantasy-chart-container">
                        <div class="fantasy-chart-header"><div class="fantasy-section-title">Patrimonio total por usuario (efectivo + plantilla)</div></div>
                        <div class="fantasy-canvas-wrap"><canvas id="patrimonyChart"></canvas></div>
                    </div>

                    <div class="fantasy-chart-container">
                        <div class="fantasy-chart-header"><div class="fantasy-section-title">Evolución de puntos (acumulado)</div></div>
                        <div id="fantasy-chips-points" class="fantasy-user-chips">${renderFantasyUserChips('points')}</div>
                        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:stretch">
                            <div class="fantasy-canvas-wrap" style="flex:2 1 240px"><canvas id="pointsChart"></canvas></div>
                            <div style="flex:1 1 160px;min-width:150px">${renderFantasyPointsGap()}</div>
                        </div>
                    </div>

                    <div class="fantasy-chart-container">
                        <div class="fantasy-chart-header"><div class="fantasy-section-title">Evolución económica (valor total)</div></div>
                        <div id="fantasy-chips-economic" class="fantasy-user-chips">${renderFantasyUserChips('economic')}</div>
                        <div class="fantasy-canvas-wrap"><canvas id="economicChart"></canvas></div>
                    </div>

                    ${renderFantasyProfitTable()}

                    ${fantasyData.transacciones.length ? `
                        <div class="fantasy-chart-container" style="margin-top:16px">
                            <div class="fantasy-section-title">Timeline de actividad (todos los rivales)</div>
                            <input id="fantasy-timeline-search" class="modal-input" placeholder="Buscar por jugador o usuario..." style="margin-bottom:8px" oninput="filterFantasyTimeline()">
                            <div id="fantasy-timeline-list" style="max-height:340px;overflow-y:auto">
                                ${renderFantasyTimelineItems('')}
                            </div>
                        </div>
                    ` : `
                        <div class="fantasy-chart-container" style="margin-top:16px">
                            <div class="fantasy-empty-state">Todavía no hay operaciones registradas</div>
                        </div>
                    `}

                    ${lowCashUsers.length ? `
                        <div style="margin-top:16px">
                            <div class="fantasy-section-title" style="margin-bottom:8px">Efectivo bajo — oportunidad de negociación</div>
                            ${lowCashUsers.map(u => `
                                <div class="fantasy-alert ${u.efectivo < 0 ? 'high' : 'medium'}">
                                    <div style="font-weight:700">${escapeHtml(u.nombre)}</div>
                                    <div>${u.efectivo < 0 ? 'Efectivo negativo' : 'Efectivo por debajo de 20M€'}: ${u.efectivo.toLocaleString('es-ES')}€</div>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}

                    <div style="margin-top:16px">
                        <div class="fantasy-section-title" style="margin-bottom:8px">Usuarios</div>
                        ${fantasyData.usuarios.length ? `
                            <div class="fantasy-users-grid">
                                ${fantasyData.usuarios.map(u => {
                                    const total = u.efectivo + u.valor_plantilla;
                                    const txs = fantasyData.transacciones.filter(t => t.comprador === u.nombre || t.vendedor === u.nombre);
                                    const color = fantasyUserColor(u.nombre);
                                    return `
                                        <div class="fantasy-user-card" style="border-top:3px solid ${color}" onclick="showFantasyUserDetail('${u.nombre}')">
                                            <div>
                                                <div class="user-avatar" style="background:${color}">${fantasyInitials(u.nombre)}</div>
                                                <div class="user-name">${escapeHtml(u.nombre)}</div>
                                                <div class="user-meta">${txs.length} operaciones</div>
                                            </div>
                                            <div class="user-balance">
                                                <div class="cash-label">Efectivo</div>
                                                <div class="cash ${u.efectivo < 0 ? 'fantasy-negative' : ''}" title="${u.efectivo.toLocaleString('es-ES')}€">${fantasyAbbreviate(u.efectivo)}</div>
                                                <div class="total" title="${total.toLocaleString('es-ES')}€">${fantasyAbbreviate(total)} total</div>
                                            </div>
                                            <div class="user-actions">
                                                <button class="btn-secondary" onclick="event.stopPropagation();editTemplateValue('${u.nombre}')">Plantilla</button>
                                                <button class="btn-secondary fantasy-btn-danger" onclick="event.stopPropagation();deleteFantasyUser('${u.nombre}')">Borrar</button>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        ` : `
                            <div class="fantasy-empty-state">Aún no hay usuarios en la liga</div>
                        `}
                    </div>
                </div>
            `;

            return html;
        }

        function deleteFantasyUser(nombre) {
            if (!confirm(`¿Borrar al usuario "${nombre}"? Esto también eliminará todas sus transacciones y recalculará los saldos.`)) return;
            fantasyData.usuarios = fantasyData.usuarios.filter(u => u.nombre !== nombre);
            fantasyData.transacciones = fantasyData.transacciones.filter(t => t.comprador !== nombre && t.vendedor !== nombre);
            if (fantasyData.jornadas) {
                fantasyData.jornadas.forEach(j => { delete j.puntos[nombre]; });
            }
            if (fantasyData.valorHistorico) {
                fantasyData.valorHistorico = fantasyData.valorHistorico.filter(s => s.nombre !== nombre);
            }
            recalcFantasyBalances();
            saveFantasyData();
            document.getElementById('content').innerHTML = renderFantasy();
            renderAllFantasyCharts();
            showToast('Usuario "' + nombre + '" eliminado');
        }

        function resetFantasyData() {
            if (!confirm('¿Reiniciar todos los datos de Fantasy? Esto eliminará todas las transacciones y balances.')) return;
            fantasyData = getDefaultFantasyData();
            recalcFantasyBalances();
            saveFantasyData();
            render();
            renderAllFantasyCharts();
            showToast('Fantasy reiniciado');
        }

        // ============================================================
        //  SHOW FANTASY USER DETAIL (with 6.3, 6.4, 6.5)
        // ============================================================
        function showFantasyUserDetail(nombre) {
            const u = fantasyData.usuarios.find(u => u.nombre === nombre);
            if (!u) return;
            const txs = fantasyData.transacciones
                .filter(t => t.comprador === nombre || t.vendedor === nombre)
                .slice().reverse();

            const profits = calculatePlayerProfits(nombre);
            const withProfit = profits.filter(p => !p.sinCompraRegistrada);
            const withoutBuy = profits.filter(p => p.sinCompraRegistrada);

            const contenidoHTML = `
                <div class="modal-title">${escapeHtml(nombre)}</div>
                <div style="text-align:center;padding:14px;margin-bottom:12px;border-radius:18px;background:var(--fantasy-accent-soft)">
                    <div style="font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Efectivo</div>
                    <div style="font-size:28px;font-weight:800;color:${u.efectivo < 0 ? '#dc2626' : '#16a34a'}">${u.efectivo.toLocaleString('es-ES')}€</div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
                    <div style="text-align:center">
                        <div style="font-size:16px;font-weight:800;color:var(--text-primary)">${(u.efectivo + u.valor_plantilla).toLocaleString('es-ES')}€</div>
                        <div style="font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase">Total</div>
                    </div>
                    <div style="text-align:center;position:relative">
                        <div style="font-size:16px;font-weight:800;color:var(--text-primary)">${u.valor_plantilla.toLocaleString('es-ES')}€</div>
                        <div style="font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase">Plantilla</div>
                        <button class="btn-secondary" style="padding:2px 8px;font-size:10px;margin-top:4px" onclick="event.stopPropagation();closeModal();editTemplateValue('${nombre}')">Editar</button>
                    </div>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
                    <button class="btn-secondary fantasy-btn-accent" style="width:auto" onclick="closeModal();showFantasySquad('${nombre}')">Ver plantilla (${getUserSquad(nombre).length})</button>
                    <button class="btn-secondary fantasy-btn-danger" style="width:auto" onclick="closeModal();deleteFantasyUser('${nombre}')">Borrar usuario</button>
                </div>

                <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin-bottom:8px">Historial de transacciones (${txs.length})</div>
                <div style="max-height:300px;overflow-y:auto">
                    ${txs.length ? txs.map(tx => {
                        const isClausula = tx.tipo === 'clausula';
                        const isPremio = tx.tipo === 'premio';
                        const isVideo = tx.tipo === 'video';
                        // isBuy se calcula respecto al usuario que se está viendo (nombre), no
                        // según el campo global tx.tipo: en un TRASPASO ambos lados (comprador
                        // y vendedor) son usuarios reales, así que hay que mirar quién de los
                        // dos es "nombre" para saber si a él le suma o le resta el efectivo.
                        const isBuy = !isClausula && !isPremio && !isVideo && tx.comprador === nombre;
                        const isNegative = isBuy || isClausula;
                        const typeLabel = isVideo ? 'VÍDEO' : (isPremio ? 'PREMIO' : (isClausula ? 'CLÁUSULA' : (isBuy ? 'COMPRA' : 'VENTA')));
                        const dateObj = new Date(/\d{2}:\d{2}/.test(tx.fecha) ? tx.fecha.replace(' ', 'T') : tx.fecha + 'T12:00:00');
                        const dateLabel = isNaN(dateObj) ? (tx.fecha || '—') : dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
                        return `
                            <div class="fantasy-tx-item">
                                <div style="display:flex;justify-content:space-between;align-items:center">
                                    <div>
                                        <span class="tx-type ${isNegative ? 'buy' : 'sell'}">${typeLabel}</span>
                                        <span style="font-weight:700;margin-left:6px">${escapeHtml(tx.jugador)}</span>
                                        ${(isClausula || isPremio || isVideo) ? '' : `<span style="font-size:11px;color:var(--text-secondary)">${escapeHtml(tx.comprador)} → ${escapeHtml(tx.vendedor)}</span>`}
                                    </div>
                                    <span class="tx-amount ${isNegative ? 'negative' : 'positive'}">${isNegative ? '-' : '+'}${tx.precio.toLocaleString('es-ES')}€</span>
                                </div>
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px">
                                    <span style="font-size:11px;color:var(--text-secondary)">${dateLabel}</span>
                                    <button class="btn-secondary" style="padding:2px 8px;font-size:10px" onclick="event.stopPropagation();deleteFantasyTransaction('${tx.id}')">Eliminar</button>
                                </div>
                            </div>
                        `;
                    }).join('') : '<div style="padding:16px;color:var(--text-secondary);text-align:center">Sin transacciones</div>'}
                </div>

                ${withProfit.length ? `
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin-top:12px;margin-bottom:8px">Beneficios por reventa</div>
                    ${withProfit.map(p => `
                        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
                            <span>${escapeHtml(p.jugador)} <span style="color:var(--text-secondary);font-size:11px">(${p.fechaCompra} → ${p.fechaVenta})</span></span>
                            <span style="font-weight:700;color:${p.beneficio >= 0 ? '#16a34a' : '#dc2626'}">${p.beneficio >= 0 ? '+' : ''}${p.beneficio.toLocaleString('es-ES')}€</span>
                        </div>
                    `).join('')}
                ` : ''}

                ${withoutBuy.length ? `
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin-top:12px;margin-bottom:8px">Ventas sin compra registrada</div>
                    ${withoutBuy.map(p => `
                        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;color:var(--text-secondary)">
                            <span>${escapeHtml(p.jugador)}</span>
                            <span>${p.precioVenta.toLocaleString('es-ES')}€ (${p.fechaVenta})</span>
                        </div>
                    `).join('')}
                ` : ''}
            `;

            showModal(contenidoHTML);
        }

        // ============================================================
        //  RENDER: FANTASY CHART (efectivo)
        // ============================================================
        // Refresca las 4 gráficas de Fantasy. Como cada renderFantasy() reemplaza
        // los <canvas> del DOM, las instancias de Chart.js anteriores quedan
        // apuntando a nodos ya desmontados: hay que reconstruirlas todas juntas
        // cada vez que cambian los datos, o algunas se quedan en blanco.
        // Lee los colores del tema activo de Fantasy (default o verde) para
        // que las 4 gráficas de Chart.js coincidan siempre con el tema visual.
        function fantasyChartTheme() {
            const root = document.querySelector('.fantasy-root');
            const cs = root ? getComputedStyle(root) : null;
            const read = (name, fallback) => (cs && cs.getPropertyValue(name).trim()) || fallback;
            return {
                text: read('--fx-text-secondary', '#6b7280'),
                grid: read('--fx-grid', 'rgba(255,255,255,0.06)'),
                accent: read('--fx-accent', '#8B5CF6'),
                tooltipBg: read('--fx-bg-hover', '#1a1a2e')
            };
        }

        function fantasyTooltipOptions(theme, currency) {
            return {
                backgroundColor: theme.tooltipBg,
                titleColor: theme.text,
                bodyColor: theme.text,
                borderColor: theme.grid,
                borderWidth: 1,
                padding: 10,
                cornerRadius: 8,
                displayColors: true,
                boxPadding: 4,
                callbacks: currency ? {
                    label: ctx => `${ctx.dataset.label}: ${fantasyAbbreviate(ctx.parsed.y ?? ctx.parsed.x ?? ctx.parsed)}`
                } : undefined
            };
        }

        function renderAllFantasyCharts() {
            document.body.classList.toggle('fantasy-green-page', currentView === 'fantasy' && fantasyTheme === 'green');
            renderFantasyChart();
            renderPointsChart();
            renderEconomicEvolutionChart();
        }

        function renderFantasyChart() {
            renderPatrimonyChart();
            setTimeout(() => {
                const canvas = document.getElementById('fantasyChart');
                if (!canvas) return;

                if (fantasyChartInstance) {
                    fantasyChartInstance.destroy();
                    fantasyChartInstance = null;
                }

                if (!fantasyData || !fantasyData.usuarios || fantasyData.usuarios.length === 0) return;

                const theme = fantasyChartTheme();
                const sorted = fantasyData.usuarios.slice().sort((a, b) => b.efectivo - a.efectivo);
                const labels = sorted.map(u => u.nombre);
                const data = sorted.map(u => u.efectivo);
                const colors = sorted.map(u => fantasyUserColor(u.nombre));

                const ctx = canvas.getContext('2d');
                fantasyChartInstance = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Efectivo (€)',
                            data: data,
                            backgroundColor: colors,
                            borderRadius: 6,
                            borderSkipped: false,
                            maxBarThickness: 34
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: fantasyTooltipOptions(theme, true)
                        },
                        scales: {
                            x: {
                                ticks: { color: theme.text, font: { size: 11 } },
                                grid: { display: false },
                                border: { display: false }
                            },
                            y: {
                                ticks: {
                                    color: theme.text,
                                    font: { size: 11 },
                                    callback: value => fantasyAbbreviate(value)
                                },
                                grid: { color: theme.grid, drawTicks: false },
                                border: { display: false }
                            }
                        }
                    }
                });
            }, 100);
        }

        function renderPatrimonyChart() {
            setTimeout(() => {
                const canvas = document.getElementById('patrimonyChart');
                if (!canvas) return;

                if (patrimonyChartInstance) {
                    patrimonyChartInstance.destroy();
                    patrimonyChartInstance = null;
                }

                if (!fantasyData || !fantasyData.usuarios || fantasyData.usuarios.length === 0) return;

                const theme = fantasyChartTheme();
                const sorted = fantasyData.usuarios.slice().sort((a, b) => (b.efectivo + b.valor_plantilla) - (a.efectivo + a.valor_plantilla));
                const labels = sorted.map(u => u.nombre);
                const data = sorted.map(u => u.efectivo + u.valor_plantilla);
                const colors = sorted.map(u => fantasyUserColor(u.nombre));

                const ctx = canvas.getContext('2d');
                patrimonyChartInstance = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Patrimonio total (€)',
                            data: data,
                            backgroundColor: colors,
                            borderRadius: 6,
                            borderSkipped: false,
                            maxBarThickness: 34
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: fantasyTooltipOptions(theme, true)
                        },
                        scales: {
                            x: {
                                ticks: { color: theme.text, font: { size: 11 } },
                                grid: { display: false },
                                border: { display: false }
                            },
                            y: {
                                ticks: {
                                    color: theme.text,
                                    font: { size: 11 },
                                    callback: value => fantasyAbbreviate(value)
                                },
                                grid: { color: theme.grid, drawTicks: false },
                                border: { display: false }
                            }
                        }
                    }
                });
            }, 100);
        }

        // ============================================================
        //  RENDER: POINTS CHART (6.6)
        // ============================================================
        function renderPointsChart() {
            setTimeout(() => {
                const canvas = document.getElementById('pointsChart');
                if (!canvas) return;

                if (pointsChartInstance) {
                    pointsChartInstance.destroy();
                    pointsChartInstance = null;
                }

                const theme = fantasyChartTheme();

                if (!fantasyData.jornadas || fantasyData.jornadas.length === 0) {
                    const ctx = canvas.getContext('2d');
                    pointsChartInstance = new Chart(ctx, {
                        type: 'line',
                        data: { labels: ['Sin datos'], datasets: [{ label: 'Esperando jornadas...', data: [0] }] },
                        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
                    });
                    return;
                }

                const jornadasOrdenadas = fantasyData.jornadas.slice().sort((a, b) => a.numero - b.numero);
                const labels = jornadasOrdenadas.map(j => 'J' + j.numero);

                const datasets = fantasyData.usuarios
                    .filter(u => !fantasyHiddenUsers.points.has(u.nombre))
                    .map((u) => {
                        let running = 0;
                        const data = jornadasOrdenadas.map(j => {
                            const pts = j.puntos[u.nombre];
                            if (pts !== undefined) running += pts;
                            return running;
                        });
                        return {
                            label: u.nombre,
                            data,
                            borderColor: fantasyUserColor(u.nombre),
                            backgroundColor: 'transparent',
                            borderWidth: 2.5,
                            tension: 0.4,
                            pointRadius: 0,
                            pointHoverRadius: 5,
                            pointHoverBackgroundColor: fantasyUserColor(u.nombre),
                            pointHitRadius: 10
                        };
                    });

                const ctx = canvas.getContext('2d');
                pointsChartInstance = new Chart(ctx, {
                    type: 'line',
                    data: { labels, datasets },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        plugins: {
                            legend: { display: false },
                            tooltip: fantasyTooltipOptions(theme, false)
                        },
                        scales: {
                            x: { ticks: { color: theme.text, font: { size: 11 } }, grid: { display: false }, border: { display: false } },
                            y: { ticks: { color: theme.text, font: { size: 11 } }, grid: { color: theme.grid, drawTicks: false }, border: { display: false } }
                        }
                    }
                });
            }, 150);
        }

        // ============================================================
        //  RENDER: ECONOMIC EVOLUTION CHART (6.8)
        // ============================================================
        function renderEconomicEvolutionChart() {
            setTimeout(() => {
                const canvas = document.getElementById('economicChart');
                if (!canvas) return;

                if (economicChartInstance) {
                    economicChartInstance.destroy();
                    economicChartInstance = null;
                }

                const theme = fantasyChartTheme();

                if (!fantasyData.valorHistorico || fantasyData.valorHistorico.length === 0) {
                    const ctx = canvas.getContext('2d');
                    economicChartInstance = new Chart(ctx, {
                        type: 'line',
                        data: { labels: ['Sin datos'], datasets: [{ label: 'Esperando histórico...', data: [0] }] },
                        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
                    });
                    return;
                }

                const fechas = [...new Set(fantasyData.valorHistorico.map(s => s.fecha))].sort();

                const datasets = fantasyData.usuarios
                    .filter(u => !fantasyHiddenUsers.economic.has(u.nombre))
                    .map((u) => ({
                        label: u.nombre,
                        data: fechas.map(f => {
                            const snap = fantasyData.valorHistorico.find(s => s.fecha === f && s.nombre === u.nombre);
                            return snap ? snap.valorTotal : null;
                        }),
                        borderColor: fantasyUserColor(u.nombre),
                        backgroundColor: 'transparent',
                        borderWidth: 2.5,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 5,
                        pointHoverBackgroundColor: fantasyUserColor(u.nombre),
                        pointHitRadius: 10,
                        spanGaps: true
                    }));

                const ctx = canvas.getContext('2d');
                economicChartInstance = new Chart(ctx, {
                    type: 'line',
                    data: { labels: fechas, datasets },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        plugins: {
                            legend: { display: false },
                            tooltip: fantasyTooltipOptions(theme, true)
                        },
                        scales: {
                            x: { ticks: { color: theme.text, font: { size: 11 } }, grid: { display: false }, border: { display: false } },
                            y: {
                                ticks: {
                                    color: theme.text,
                                    font: { size: 11 },
                                    callback: value => fantasyAbbreviate(value)
                                },
                                grid: { color: theme.grid, drawTicks: false },
                                border: { display: false }
                            }
                        }
                    }
                });
            }, 150);
        }

        // ============================================================
        //  FANTASY & VAULT: CONTRASEÑAS EN SUPABASE
        // ============================================================

        async function hashPassword(password) {
            const encoder = new TextEncoder();
            const data = encoder.encode(password);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        async function getSecret(type) {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) throw new Error('No hay sesión activa');
            const { data, error } = await sb
                .from('bitacora_secrets')
                .select(`${type}_password_hash`)
                .eq('user_id', user.id)
                .maybeSingle();
            if (error) throw error;
            return data ? data[`${type}_password_hash`] : null;
        }

        async function setSecret(type, hash) {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) throw new Error('No hay sesión activa');
            const column = `${type}_password_hash`;
            const { error } = await sb
                .from('bitacora_secrets')
                .upsert({
                    user_id: user.id,
                    [column]: hash
                }, { onConflict: 'user_id' });
            if (error) throw error;
        }

        async function getGlobalDevPasswordHash() {
            const { data, error } = await sb
                .from('global_settings')
                .select('dev_password_hash')
                .eq('id', 1)
                .maybeSingle();
            if (error) throw error;
            return data ? data.dev_password_hash : null;
        }

        async function setGlobalDevPasswordHash(hash) {
            const { error } = await sb
                .from('global_settings')
                .upsert({
                    id: 1,
                    dev_password_hash: hash,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id' });
            if (error) throw error;
        }

        function showModal(htmlContent) {
            const container = document.getElementById('modal-container');
            container.innerHTML = `
                <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
                    <div class="modal-sheet">
                        ${htmlContent}
                    </div>
                </div>
            `;
            // Deja el cursor listo en el primer campo de escritura del modal,
            // para no tener que coger el ratón antes de poder escribir. Un
            // setTimeout(0) en vez de requestAnimationFrame: el foco tiene
            // que "ganar" a cualquier auto-focus que el propio contenido del
            // modal dispare (algunos modales ya llaman a su focus() propio).
            setTimeout(() => {
                const sheet = container.querySelector('.modal-sheet');
                const field = sheet?.querySelector(
                    'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=color]):not([type=file]):not([disabled]), textarea:not([disabled]), select:not([disabled])'
                );
                field?.focus();
                if (field?.tagName === 'INPUT' && (field.type === 'text' || field.type === '')) field.select?.();
            }, 0);
        }

        // ============================================================
        //  PASSWORD ACCESS SYSTEM (para Vault y Fantasy) - CORREGIDO
        // ============================================================

        async function requestPasswordAccess(type, onSuccess) {
            try {
                const storedHash = await getSecret(type);
                
                if (!storedHash) {
                    // No hay contraseña guardada → crear por primera vez
                    window._passwordSuccessCallback = onSuccess;
                    window._passwordType = type;
                    
                    showModal(`
                        <div class="modal-title" style="color:${type === 'fantasy' ? 'var(--fantasy-accent)' : 'var(--vault-accent)'}">
                            ${type === 'fantasy' ? '◉' : '◈'} Configurar acceso a ${type === 'fantasy' ? 'Fantasy' : 'Vault'}
                        </div>
                        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
                            Establece una contraseña para proteger ${type === 'fantasy' ? 'Fantasy' : 'Vault'}.
                        </div>
                        <div class="form-row">
                            <label class="modal-label">Nueva contraseña</label>
                            <input type="password" id="pw-new" class="modal-input" placeholder="Mínimo 6 caracteres" onkeydown="if(event.key==='Enter')createPassword('${type}')">
                        </div>
                        <div class="form-row">
                            <label class="modal-label">Repetir contraseña</label>
                            <input type="password" id="pw-new2" class="modal-input" placeholder="Repite la contraseña" onkeydown="if(event.key==='Enter')createPassword('${type}')">
                        </div>
                        <div id="pw-create-error" style="color:#dc2626;font-size:12px;margin-bottom:8px;min-height:16px"></div>
                        <button class="btn-modal-primary" onclick="createPassword('${type}')" style="background:${type === 'fantasy' ? 'var(--fantasy-accent)' : 'var(--vault-accent)'}">
                            🔐 Crear contraseña
                        </button>
                    `);
                    return;
                }
                
                // Ya hay contraseña guardada → verificar acceso
                window._passwordSuccessCallback = onSuccess;
                window._passwordType = type;
                
                showModal(`
                    <div class="modal-title" style="color:${type === 'fantasy' ? 'var(--fantasy-accent)' : 'var(--vault-accent)'}">
                        ${type === 'fantasy' ? '◉' : '◈'} Acceso a ${type === 'fantasy' ? 'Fantasy' : 'Vault'}
                    </div>
                    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
                        Introduce tu contraseña para acceder.
                    </div>
                    <div class="form-row">
                        <label class="modal-label">Contraseña</label>
                        <input type="password" id="pw-input" class="modal-input" placeholder="Tu contraseña" onkeydown="if(event.key==='Enter')verifyPassword('${type}')">
                    </div>
                    <div id="pw-error" style="color:#dc2626;font-size:12px;margin-bottom:8px;min-height:16px"></div>
                    <button class="btn-modal-primary" onclick="verifyPassword('${type}')" style="background:${type === 'fantasy' ? 'var(--fantasy-accent)' : 'var(--vault-accent)'}">
                        🔓 Verificar
                    </button>
                `);
                
                // Enfocar el input después de renderizar
                setTimeout(() => {
                    const input = document.getElementById('pw-input');
                    if (input) input.focus();
                }, 100);
                
            } catch (e) {
                console.error('Error al acceder a la contraseña:', e);
                showToast('Error de conexión, intenta de nuevo', true);
            }
        }

        async function createPassword(type) {
            const pw1 = document.getElementById('pw-new').value;
            const pw2 = document.getElementById('pw-new2').value;
            const errorEl = document.getElementById('pw-create-error');
            
            if (!pw1 || pw1.length < 6) {
                errorEl.textContent = '❌ La contraseña debe tener al menos 6 caracteres';
                return;
            }
            if (pw1 !== pw2) {
                errorEl.textContent = '❌ Las contraseñas no coinciden';
                return;
            }
            
            try {
                const hash = await hashPassword(pw1);
                await setSecret(type, hash);
                closeModal();
                if (window._passwordSuccessCallback) {
                    window._passwordSuccessCallback();
                }
                showToast('🔑 Contraseña creada correctamente');
            } catch (e) {
                console.error('Error al crear contraseña:', e);
                errorEl.textContent = 'Error al guardar la contraseña. Intenta de nuevo.';
            }
        }

        async function verifyPassword(type) {
            const input = document.getElementById('pw-input');
            if (!input) return;
            const password = input.value;
            const errorEl = document.getElementById('pw-error');
            
            if (!password) {
                errorEl.textContent = 'Introduce tu contraseña';
                return;
            }
            
            try {
                const storedHash = await getSecret(type);
                if (!storedHash) {
                    errorEl.textContent = 'No hay contraseña guardada. Contacta con el administrador.';
                    return;
                }
                
                const inputHash = await hashPassword(password);
                
                if (inputHash === storedHash) {
                    closeModal();
                    if (window._passwordSuccessCallback) {
                        window._passwordSuccessCallback();
                    }
                } else {
                    errorEl.textContent = '❌ Contraseña incorrecta';
                }
            } catch (e) {
                console.error('Error al verificar contraseña:', e);
                errorEl.textContent = 'Error de conexión, intenta de nuevo';
            }
        }

        // ============================================================
        //  DESARROLLADOR - CREAR CONTRASEÑA GLOBAL
        // ============================================================

        async function createDevPassword() {
            showModal(`
                <div class="modal-title" style="color:var(--fantasy-accent)">⚙ Configurar Modo Desarrollador</div>
                <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
                    Esta es la contraseña global que se usará para activar el Modo Desarrollador.
                    <br><strong>Guárdala bien</strong> — no hay forma de recuperarla si la pierdes.
                </div>
                <div class="form-row">
                    <label class="modal-label">Nueva contraseña</label>
                    <input type="password" id="dev-pw-new" class="modal-input" placeholder="Mínimo 6 caracteres" onkeydown="if(event.key==='Enter')confirmCreateDevPassword()">
                </div>
                <div class="form-row">
                    <label class="modal-label">Repetir contraseña</label>
                    <input type="password" id="dev-pw-new2" class="modal-input" placeholder="Repite la contraseña" onkeydown="if(event.key==='Enter')confirmCreateDevPassword()">
                </div>
                <div id="dev-pw-create-error" style="color:#dc2626;font-size:12px;margin-bottom:8px;min-height:16px"></div>
                <button class="btn-modal-primary" onclick="confirmCreateDevPassword()" style="background:var(--fantasy-accent)">
                    🔐 Establecer contraseña
                </button>
            `);
        }

        async function confirmCreateDevPassword() {
            const pw1 = document.getElementById('dev-pw-new').value;
            const pw2 = document.getElementById('dev-pw-new2').value;
            const errorEl = document.getElementById('dev-pw-create-error');
            
            if (!pw1 || pw1.length < 6) {
                errorEl.textContent = '❌ La contraseña debe tener al menos 6 caracteres';
                return;
            }
            if (pw1 !== pw2) {
                errorEl.textContent = '❌ Las contraseñas no coinciden';
                return;
            }
            
            try {
                const hash = await hashPassword(pw1);
                await setGlobalDevPasswordHash(hash);
                closeModal();
                devModeActive = true;
                updateSidebarPrivacy();
                document.getElementById('content').innerHTML = renderSettings();
                showCenteredMessage('Modo desarrollador activado');
            } catch (e) {
                console.error('Error al guardar la contraseña global:', e);
                errorEl.textContent = 'Error al guardar la contraseña. Asegúrate de que la tabla global_settings existe en Supabase.';
            }
        }

        // ============================================================
        //  MODE DEVELOPER GLOBAL - CONTRASEÑA EN SUPABASE - CORREGIDO
        // ============================================================
        async function toggleDeveloperMode() {
            if (devModeActive) {
                // Desactivar
                devModeActive = false;
                updateSidebarPrivacy();
                if (currentView === 'fantasy') {
                    switchView('settings');
                } else {
                    document.getElementById('content').innerHTML = renderSettings();
                }
                showToast('Modo desarrollador desactivado');
                return;
            }

            try {
                const storedHash = await getGlobalDevPasswordHash();

                if (!storedHash) {
                    // No hay contraseña global → ofrecer crearla
                    createDevPassword();
                    return;
                }

                // Pedir la contraseña
                showModal(`
                    <div class="modal-title" style="color:var(--fantasy-accent)">⚙ Modo Desarrollador</div>
                    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Introduce la contraseña global del Modo Desarrollador para activarlo.</div>
                    <div class="form-row">
                        <label class="modal-label">Contraseña</label>
                        <input type="password" id="pw-dev-input" class="modal-input" placeholder="Contraseña global" onkeydown="if(event.key==='Enter')verifyDevPassword()">
                    </div>
                    <div id="pw-dev-error" style="color:#dc2626;font-size:12px;margin-bottom:8px;min-height:16px"></div>
                    <button class="btn-modal-primary" onclick="verifyDevPassword()" style="background:var(--fantasy-accent)">🔓 Activar</button>
                `);
                
                setTimeout(() => {
                    const input = document.getElementById('pw-dev-input');
                    if (input) input.focus();
                }, 100);
                
            } catch (e) {
                console.error('Error al obtener la contraseña global:', e);
                showToast('Error al conectar con el servidor. Asegúrate de que la tabla global_settings existe.', true);
            }
        }

        async function verifyDevPassword() {
            const input = document.getElementById('pw-dev-input').value;
            const errorEl = document.getElementById('pw-dev-error');

            if (!input) {
                errorEl.textContent = 'Introduce la contraseña';
                return;
            }

            try {
                const storedHash = await getGlobalDevPasswordHash();
                if (!storedHash) {
                    errorEl.textContent = 'No hay contraseña global configurada';
                    return;
                }

                const inputHash = await hashPassword(input);

                if (inputHash !== storedHash) {
                    errorEl.textContent = '❌ Contraseña incorrecta';
                    return;
                }

                closeModal();
                devModeActive = true;
                updateSidebarPrivacy();
                document.getElementById('content').innerHTML = renderSettings();
                showCenteredMessage('Modo desarrollador activado');
            } catch (e) {
                console.error('Error verificando contraseña:', e);
                errorEl.textContent = 'Error de conexión, intenta de nuevo';
            }
        }

        // ============================================================
        //  UPDATE SIDEBAR PRIVACY
        // ============================================================
        function updateSidebarPrivacy() {
            const fantasyBtns = document.querySelectorAll('[data-view="fantasy"]');
            fantasyBtns.forEach(btn => {
                btn.classList.toggle('fantasy-hidden', !devModeActive);
                if (devModeActive) btn.style.display = 'flex';
                else btn.style.removeProperty('display');
            });
        }

        // ============================================================
        //  OPEN FANTASY (with password, only if dev mode active) - CORREGIDO
        // ============================================================
        function openFantasy() {
            if (!devModeActive) {
                showToast('Activa el Modo Desarrollador en Ajustes para acceder a Fantasy', true);
                return;
            }
            loadFantasyData();
            requestPasswordAccess('fantasy', () => {
                currentView = 'fantasy';
                document.querySelectorAll('.sidebar-nav button, #mobile-menu-panel .menu-nav button').forEach(b => {
                    b.classList.toggle('active', b.dataset.view === 'fantasy');
                });
                updatePageTitle();
                render();
                renderAllFantasyCharts();
            });
        }

        function openVault() {
            loadVaultData();
            requestPasswordAccess('vault', () => {
                currentView = 'vault';
                document.querySelectorAll('.sidebar-nav button, #mobile-menu-panel .menu-nav button').forEach(b => {
                    b.classList.toggle('active', b.dataset.view === 'vault');
                });
                updatePageTitle();
                render();
            });
        }

        // ============================================================
        //  PROMPTS (Punto 5)
        // ============================================================
        function openNewPrompt() {
            window._editPromptId = null;
            showModal(renderPromptModalContent());
        }

        function openPromptDetail(id) {
            window._editPromptId = id;
            showModal(renderPromptModalContent());
        }

        function renderPromptModalContent() {
            const p = window._editPromptId ? prompts.find(x => x.id === window._editPromptId) : null;
            const title = p ? p.title : '';
            const content = p ? p.content : '';

            return `
                <div class="modal-title" style="font-family:'JetBrains Mono',monospace;color:var(--fantasy-accent)">&gt; ${p ? 'Editar prompt' : 'Nuevo prompt'}</div>
                <div class="modal-label">Título</div>
                <input id="prompt-title-input" class="modal-input console-font" value="${escapeHtml(title)}" placeholder="Nombre del prompt...">
                <div class="modal-label">Contenido</div>
                <textarea id="prompt-content-input" class="modal-input console-font console-textarea" rows="8" placeholder="Escribe tu prompt aquí...">${escapeHtml(content)}</textarea>
                <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
                    <button class="btn-modal-primary" style="width:auto;background:var(--fantasy-accent)" onclick="savePrompt()">💾 Guardar</button>
                    <button class="btn-secondary" style="width:auto" onclick="copyPromptToClipboard()">📋 Copiar</button>
                    ${p ? `<button class="btn-secondary" style="width:auto;color:#dc2626" onclick="deletePrompt('${p.id}')">🗑 Eliminar</button>` : ''}
                </div>
            `;
        }

        async function savePrompt() {
            const title = document.getElementById('prompt-title-input').value.trim();
            const content = document.getElementById('prompt-content-input').value;
            if (!title) { showToast('Escribe un título', true); return; }

            if (window._editPromptId) {
                const p = prompts.find(x => x.id === window._editPromptId);
                if (p) {
                    p.title = title;
                    p.content = content;
                    p.updatedAt = new Date().toISOString();
                }
            } else {
                prompts.push({ id: 'prompt_' + Date.now(), title, content, updatedAt: new Date().toISOString() });
            }
            closeModal();
            document.getElementById('content').innerHTML = renderSettings();
            try { await saveData();
                showToast('Prompt guardado'); } catch (e) { console.error(e);
                showToast('No se pudo guardar en la nube', true); }
        }

        async function deletePrompt(id) {
            if (!confirm('¿Eliminar este prompt?')) return;
            prompts = prompts.filter(p => p.id !== id);
            closeModal();
            document.getElementById('content').innerHTML = renderSettings();
            try { await saveData();
                showToast('Prompt eliminado'); } catch (e) { console.error(e);
                showToast('No se pudo guardar en la nube', true); }
        }

        function copyPromptToClipboard() {
            const content = document.getElementById('prompt-content-input').value;
            navigator.clipboard.writeText(content)
                .then(() => showToast('📋 Copiado al portapapeles'))
                .catch(() => showToast('No se pudo copiar', true));
        }

        // ============================================================
        //  VAULT
        // ============================================================
        let vaultTasks = [];

        function loadVaultData() {
            try {
                const stored = localStorage.getItem('vault_data');
                if (stored) {
                    vaultTasks = JSON.parse(stored);
                    return true;
                }
            } catch (e) { console.error('Error cargando Vault:', e); }
            return false;
        }

        function saveVaultData() {
            try {
                localStorage.setItem('vault_data', JSON.stringify(vaultTasks));
                return true;
            } catch (e) {
                console.error('Error guardando Vault:', e);
                return false;
            }
        }

        function renderVault() {
            if (!vaultTasks.length) {
                return `
                    <div style="max-width:600px">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                            <div>
                                <div style="font-size:20px;font-weight:800;color:var(--text-primary)">◈ Vault</div>
                                <div style="font-size:13px;color:var(--text-secondary)">Tareas personales</div>
                            </div>
                            <button class="btn-secondary" onclick="changeVaultPassword()" style="margin:0;padding:6px 12px;font-size:12px;width:auto;color:var(--vault-accent)">🔑 Cambiar contraseña</button>
                        </div>
                        <div class="vault-input-row">
                            <input type="text" id="vault-input" placeholder="Escribe una tarea..." onkeydown="if(event.key==='Enter')addVaultTask()">
                            <button onclick="addVaultTask()">Añadir</button>
                        </div>
                        <div class="empty-state">
                            <div class="empty-icon">◈</div>
                            <div class="empty-title">Sin tareas</div>
                            <div class="empty-sub">Añade tu primera tarea con el campo de arriba</div>
                        </div>
                    </div>
                `;
            }

            const done = vaultTasks.filter(t => t.done);
            const pending = vaultTasks.filter(t => !t.done);

            return `
                <div style="max-width:600px">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                        <div>
                            <div style="font-size:20px;font-weight:800;color:var(--text-primary)">◈ Vault</div>
                            <div style="font-size:13px;color:var(--text-secondary)">${pending.length} pendientes · ${done.length} completadas</div>
                        </div>
                        <button class="btn-secondary" onclick="changeVaultPassword()" style="margin:0;padding:6px 12px;font-size:12px;width:auto;color:var(--vault-accent)">🔑 Cambiar contraseña</button>
                    </div>
                    <div class="vault-input-row">
                        <input type="text" id="vault-input" placeholder="Escribe una tarea..." onkeydown="if(event.key==='Enter')addVaultTask()">
                        <button onclick="addVaultTask()">Añadir</button>
                    </div>

                    ${pending.length ? `
                        <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-secondary);letter-spacing:0.5px;margin:12px 0 8px 0">Pendientes</div>
                        ${pending.map((t, i) => {
                            const realIdx = vaultTasks.indexOf(t);
                            return `
                                <div class="vault-task" onclick="toggleVaultTask(${realIdx})">
                                    <span class="task-check">◯</span>
                                    <span class="task-text">${escapeHtml(t.text)}</span>
                                    <button class="task-delete" onclick="event.stopPropagation();deleteVaultTask(${realIdx})">✕</button>
                                </div>
                            `;
                        }).join('')}
                    ` : ''}

                    ${done.length ? `
                        <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-secondary);letter-spacing:0.5px;margin:12px 0 8px 0">Completadas</div>
                        ${done.map((t, i) => {
                            const realIdx = vaultTasks.indexOf(t);
                            return `
                                <div class="vault-task done" onclick="toggleVaultTask(${realIdx})">
                                    <span class="task-check">●</span>
                                    <span class="task-text">${escapeHtml(t.text)}</span>
                                    <button class="task-delete" onclick="event.stopPropagation();deleteVaultTask(${realIdx})">✕</button>
                                </div>
                            `;
                        }).join('')}
                    ` : ''}
                </div>
            `;
        }

        function addVaultTask() {
            const input = document.getElementById('vault-input');
            if (!input) return;
            const text = input.value.trim();
            if (!text) { showToast('Escribe una tarea', true); return; }

            vaultTasks.push({ text, done: false, created: new Date().toISOString() });
            saveVaultData();
            input.value = '';
            render();
            showToast('Tarea añadida');
        }

        function toggleVaultTask(index) {
            if (index < 0 || index >= vaultTasks.length) return;
            vaultTasks[index].done = !vaultTasks[index].done;
            saveVaultData();
            render();
        }

        function deleteVaultTask(index) {
            if (index < 0 || index >= vaultTasks.length) return;
            if (!confirm('¿Eliminar esta tarea?')) return;
            vaultTasks.splice(index, 1);
            saveVaultData();
            render();
            showToast('Tarea eliminada');
        }

        // ============================================================
        //  VAULT PASSWORD CHANGE
        // ============================================================
        function changeVaultPassword() {
            showModal(`
                <div class="modal-title" style="color:var(--vault-accent)">◈ Cambiar contraseña de Vault</div>
                <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Introduce tu contraseña actual y la nueva.</div>
                <div class="form-row">
                    <label class="modal-label">Contraseña actual</label>
                    <input type="password" id="pw-old-v" class="modal-input" placeholder="Tu contraseña actual">
                </div>
                <div class="form-row">
                    <label class="modal-label">Nueva contraseña</label>
                    <input type="password" id="pw-new-v" class="modal-input" placeholder="Mínimo 6 caracteres">
                </div>
                <div class="form-row">
                    <label class="modal-label">Repetir nueva contraseña</label>
                    <input type="password" id="pw-new2-v" class="modal-input" placeholder="Repite la contraseña">
                </div>
                <div id="pw-change-error-v" style="color:#dc2626;font-size:12px;margin-bottom:8px;min-height:16px"></div>
                <button class="btn-modal-primary" onclick="updateVaultPassword()" style="background:var(--vault-accent)">🔐 Cambiar contraseña</button>
            `);
        }

        async function updateVaultPassword() {
            const old = document.getElementById('pw-old-v').value;
            const pw1 = document.getElementById('pw-new-v').value;
            const pw2 = document.getElementById('pw-new2-v').value;
            const errorEl = document.getElementById('pw-change-error-v');

            if (!old) { errorEl.textContent = 'Introduce tu contraseña actual'; return; }
            if (!pw1 || pw1.length < 6) { errorEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres'; return; }
            if (pw1 !== pw2) { errorEl.textContent = 'Las contraseñas no coinciden'; return; }

            try {
                const storedHash = await getSecret('vault');
                const oldHash = await hashPassword(old);
                if (oldHash !== storedHash) {
                    errorEl.textContent = '❌ Contraseña actual incorrecta';
                    return;
                }
                const newHash = await hashPassword(pw1);
                await setSecret('vault', newHash);
                closeModal();
                showToast('🔑 Contraseña de Vault actualizada');
            } catch (e) {
                console.error('Error cambiando contraseña:', e);
                errorEl.textContent = 'Error de conexión, intenta de nuevo';
            }
        }

        // ============================================================
        //  FANTASY PASSWORD CHANGE
        // ============================================================
        function changeFantasyPassword() {
            showModal(`
                <div class="modal-title" style="color:var(--fantasy-accent)">◉ Cambiar contraseña de Fantasy</div>
                <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Introduce tu contraseña actual y la nueva.</div>
                <div class="form-row">
                    <label class="modal-label">Contraseña actual</label>
                    <input type="password" id="pw-old" class="modal-input" placeholder="Tu contraseña actual">
                </div>
                <div class="form-row">
                    <label class="modal-label">Nueva contraseña</label>
                    <input type="password" id="pw-new-f" class="modal-input" placeholder="Mínimo 6 caracteres">
                </div>
                <div class="form-row">
                    <label class="modal-label">Repetir nueva contraseña</label>
                    <input type="password" id="pw-new2-f" class="modal-input" placeholder="Repite la contraseña">
                </div>
                <div id="pw-change-error" style="color:#dc2626;font-size:12px;margin-bottom:8px;min-height:16px"></div>
                <button class="btn-modal-primary" onclick="updateFantasyPassword()" style="background:var(--fantasy-accent)">Cambiar contraseña</button>
            `);
        }

        async function updateFantasyPassword() {
            const old = document.getElementById('pw-old').value;
            const pw1 = document.getElementById('pw-new-f').value;
            const pw2 = document.getElementById('pw-new2-f').value;
            const errorEl = document.getElementById('pw-change-error');

            if (!old) { errorEl.textContent = 'Introduce tu contraseña actual'; return; }
            if (!pw1 || pw1.length < 6) { errorEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres'; return; }
            if (pw1 !== pw2) { errorEl.textContent = 'Las contraseñas no coinciden'; return; }

            try {
                const storedHash = await getSecret('fantasy');
                const oldHash = await hashPassword(old);
                if (oldHash !== storedHash) {
                    errorEl.textContent = 'Contraseña actual incorrecta';
                    return;
                }
                const newHash = await hashPassword(pw1);
                await setSecret('fantasy', newHash);
                closeModal();
                showToast('Contraseña de Fantasy actualizada');
            } catch (e) {
                console.error('Error cambiando contraseña:', e);
                errorEl.textContent = 'Error de conexión, intenta de nuevo';
            }
        }

        // ============================================================
        //  INIT
        // ============================================================
        let appInitialized = false;

        async function init() {
            loadTheme();
            const loaded = await loadData();
            await cargarCodigoAmigo();
            await cargarAmigos();
            await cargarNombrePublico();
            await cargarRecomendaciones();
            await cargarSolicitudesAmistad();
            await cargarViajesCompartidos();

            if (!loadFantasyData()) {
                fantasyData = getDefaultFantasyData();
                recalcFantasyBalances();
                saveFantasyData();
            }
            if (!loadVaultData()) {
                vaultTasks = [];
                saveVaultData();
            }

            // Inicializar devModeActive = false (siempre empieza desactivado)
            devModeActive = false;

            if (window.innerWidth <= 768) {
                document.querySelector('.menu-hamburger').style.display = 'block';
            }

            if (!appInitialized) {
                appInitialized = true;

                document.getElementById('mobile-menu-overlay').addEventListener('click', function() {
                    if (this.classList.contains('open')) toggleMobileMenu();
                });

                let resizeTimer;
                window.addEventListener('resize', () => {
                    clearTimeout(resizeTimer);
                    resizeTimer = setTimeout(() => {
                        const isMobile = window.innerWidth <= 768;
                        document.querySelector('.menu-hamburger').style.display = isMobile ? 'block' :
                        'none';
                    }, 200);
                });
            }

            if (!loaded) {
                document.getElementById('content').innerHTML =
                    `<div class="empty-state">
                        <div class="empty-icon">⚠️</div>
                        <div class="empty-title">No se pudieron cargar tus datos</div>
                        <div class="empty-sub">Revisa tu conexión a internet y vuelve a intentarlo. No se ha modificado nada en la nube.</div>
                        <button class="btn-secondary" style="margin-top:12px" onclick="init()">Reintentar</button>
                    </div>`;
                return;
            }

            requestAnimationFrame(() => {
                render();
                updateHeaderClock();
                updateSidebarProgress();
                if (!window._headerClockTimer) window._headerClockTimer = setInterval(() => { updateHeaderClock(); updateSidebarProgress(); }, 1000);
                updatePageTitle();
                updateAddButton();
                updateSidebarPrivacy();
                maybeShowDailyAlert();
                if (!window._dailyAlertTimer) window._dailyAlertTimer = setInterval(maybeShowDailyAlert, 60000);
                updateNotifBadge();
                if (!window._notifTimer) window._notifTimer = setInterval(refreshNotifData, 90000);
            });
        }

        if (window.location.hash) {
            const view = window.location.hash.replace('#', '');
            if (view && view !== 'calendar') {
                currentView = view;
            }
        } else {
            currentView = 'calendar';
        }
