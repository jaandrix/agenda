        // ============================================================
        //  SUPABASE CONFIG
        // ============================================================
        const SUPABASE_URL = 'https://avdqtnukgbejorieuunj.supabase.co';
        const SUPABASE_ANON_KEY =
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2ZHF0bnVrZ2Jlam9yaWV1dW5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMjcyOTUsImV4cCI6MjEwMDkwMzI5NX0.sq1cepXuBaNT6qygyxKEAhVHJh7G9LZyzaeJBhc7s7s';
        const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // ============================================================
        //  SUSCRIPCIÓN DE PAGO (Stripe)
        // ============================================================
        // Toda cuenta creada antes de esta fecha queda con acceso gratis
        // para siempre ("legado"), sin necesidad de mantener una lista.
        const CUTOFF_LANZAMIENTO_PAGO = '2026-09-15T00:00:00Z';
        // Payment Links de Stripe en modo real (live).
        const STRIPE_PAYMENT_LINKS = {
            mensual: 'https://buy.stripe.com/7sYdR8bk5aTI3DZ7E28Zq00',
            anual: 'https://buy.stripe.com/6oUcN4bk58LAdez5vU8Zq01'
        };
        // Margen de gracia si un cobro falla (past_due), antes de cortar
        // el acceso, contado desde que se guardó ese estado.
        const DIAS_GRACIA_PAST_DUE = 3;

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
            const paywall = document.getElementById('paywall-screen');
            if (paywall) paywall.style.display = 'none';
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('login-email').value = '';
            document.getElementById('login-password').value = '';
            showAuthMode('login');
            showLandingScreen();
        }

        // ============================================================
        //  LANDING PÚBLICA
        // ============================================================
        function showLandingScreen() {
            document.getElementById('app').classList.remove('ready');
            document.getElementById('login-screen').style.display = 'none';
            const paywall = document.getElementById('paywall-screen');
            if (paywall) paywall.style.display = 'none';
            document.getElementById('landing-screen').classList.add('visible');
        }

        function goToLogin() {
            document.getElementById('landing-screen').classList.remove('visible');
            document.getElementById('login-screen').style.display = 'flex';
            showAuthMode('login');
        }

        function goToLanding() {
            showLandingScreen();
        }

        // El plan elegido en la landing (si lo hay) se recuerda para que, una
        // vez creada la cuenta, la pantalla de pago lo destaque en vez de
        // hacer que el usuario elija dos veces lo mismo.
        function goToSignup(plan) {
            if (plan) sessionStorage.setItem('bitacoraPlanIntencion', plan);
            else sessionStorage.removeItem('bitacoraPlanIntencion');
            document.getElementById('landing-screen').classList.remove('visible');
            document.getElementById('login-screen').style.display = 'flex';
            showAuthMode('signup');
        }

        function openPromoVideo() {
            showModal(`
                <div class="modal-title">Bitácora en 40 segundos<button class="modal-close" onclick="closeModal()">✕</button></div>
                <div class="promo-video-modal">
                    <video src="promo.mp4" controls autoplay playsinline></video>
                </div>
            `);
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

            const { data: { user } } = await sb.auth.getUser();
            const veniaDeCheckout = new URLSearchParams(window.location.search).get('checkout') === 'success';
            const sub = await getSubscriptionStatus(user, { allowRetry: veniaDeCheckout });

            if (!hasAccess(sub)) {
                showPaywallScreen(user, { confirmando: veniaDeCheckout });
                return;
            }

            // Limpia el ?checkout=success de la URL para que recargar la
            // página no repita el reintento cada vez.
            if (veniaDeCheckout) history.replaceState(null, '', window.location.pathname);

            document.getElementById('login-screen').style.display = 'none';
            const paywall = document.getElementById('paywall-screen');
            if (paywall) paywall.style.display = 'none';
            document.getElementById('app').classList.add('ready');

            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

            await init();
        }

        // Lee el estado de suscripción del usuario. Si vuelve justo del
        // checkout de Stripe, el webhook puede tardar uno o dos segundos
        // en escribir la fila — se reintenta unas cuantas veces antes de
        // rendirse, en vez de enseñar el pago de nuevo de inmediato.
        async function getSubscriptionStatus(user, opts = {}) {
            const intentos = opts.allowRetry ? 4 : 1;
            for (let i = 0; i < intentos; i++) {
                const { data } = await sb.from('suscripciones').select('*').eq('user_id', user.id).maybeSingle();
                if (data) return data;
                if (i < intentos - 1) await new Promise(r => setTimeout(r, 1500));
            }
            const esLegado = new Date(user.created_at) < new Date(CUTOFF_LANZAMIENTO_PAGO);
            return { estado: esLegado ? 'legado' : 'sin_suscripcion', modulos: ['base'] };
        }

        function hasAccess(sub) {
            if (['legado', 'active', 'trialing'].includes(sub.estado)) return true;
            if (sub.estado === 'past_due') {
                const limite = new Date(sub.actualizado_en || 0);
                limite.setDate(limite.getDate() + DIAS_GRACIA_PAST_DUE);
                return new Date() < limite;
            }
            return false;
        }

        function showPaywallScreen(user, opts = {}) {
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('app').classList.remove('ready');
            window._paywallUser = user;

            const screen = document.getElementById('paywall-screen');
            screen.style.display = 'flex';
            screen.innerHTML = opts.confirmando ? `
                <div id="paywall-box">
                    <h1>Confirmando tu <span class="login-brand-accent">pago</span></h1>
                    <p class="sub">Puede tardar unos segundos en reflejarse. Si no cambia, pulsa reintentar.</p>
                    <button onclick="startApp()">Reintentar ahora</button>
                    <a class="login-back" onclick="handleLogout()">Cerrar sesión</a>
                </div>
            ` : (() => {
                // Solo se aplica una vez, justo tras venir de elegir un plan
                // en la landing — no debe quedar "pegado" en visitas futuras.
                // Sin elección previa, el anual sigue destacado por defecto
                // (es el de mejor precio).
                const elegido = sessionStorage.getItem('bitacoraPlanIntencion');
                sessionStorage.removeItem('bitacoraPlanIntencion');
                const mensualElegido = elegido === 'mensual';
                const anualElegido = elegido === 'anual' || !elegido;
                return `
                <div id="paywall-box">
                    <h1>Bienvenido a <span class="login-brand-accent">Bitácora</span></h1>
                    <p class="sub">Un cuaderno digital para tu vida entera: ocio, trabajo, estudios, finanzas y planes, todos en un solo sitio. Sin scroll infinito, sin ruido, sin depender de decenas de apps.</p>
                    <div class="paywall-plans">
                        <button class="paywall-plan ${mensualElegido ? 'paywall-plan-highlight' : ''}" onclick="startStripeCheckout('mensual')">
                            ${mensualElegido ? '<span class="paywall-plan-badge">Tu elección</span>' : ''}
                            <span class="paywall-plan-name">Mensual</span>
                            <span class="paywall-plan-price">1,99€<span class="paywall-plan-period">/mes</span></span>
                        </button>
                        <button class="paywall-plan ${anualElegido ? 'paywall-plan-highlight' : ''}" onclick="startStripeCheckout('anual')">
                            <span class="paywall-plan-badge">${elegido === 'anual' ? 'Tu elección' : 'Ahorra ~20%'}</span>
                            <span class="paywall-plan-name">Anual</span>
                            <span class="paywall-plan-price">18,99€<span class="paywall-plan-period">/año</span></span>
                        </button>
                    </div>
                    <div class="paywall-trial-note">14 días de prueba gratuita en ambos planes. Cancela cuando quieras.</div>
                    <a class="login-back" onclick="handleLogout()">Cerrar sesión</a>
                </div>
            `; })();
        }

        function startStripeCheckout(plan) {
            const user = window._paywallUser;
            const link = STRIPE_PAYMENT_LINKS[plan];
            if (!user || !link) return;
            const url = new URL(link);
            url.searchParams.set('client_reference_id', user.id);
            if (user.email) url.searchParams.set('prefilled_email', user.email);
            window.location.href = url.toString();
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
                            
                            <div class="about-feature-title">Tu día a día</div>
                            <div class="about-feature-desc">Calendario, planificador diario, notas y un mapa anual de puntos para ver, de un vistazo, cómo ha sido tu año.</div>
                        </div>
                        <div class="about-feature">
                            
                            <div class="about-feature-title">Ocio</div>
                            <div class="about-feature-desc">Lleva la cuenta de libros, películas, series y videojuegos — y recomiéndaselos a tus amigos dentro de la propia app.</div>
                        </div>
                        <div class="about-feature">
                            
                            <div class="about-feature-title">Viajes</div>
                            <div class="about-feature-desc">Un gestor completo por viaje: lugares que ver, itinerario con horarios, documentos y listas de qué llevar.</div>
                        </div>
                        <div class="about-feature">
                            
                            <div class="about-feature-title">Trabajo y finanzas</div>
                            <div class="about-feature-desc">Historial laboral, un dashboard financiero completo y seguimiento de tus inversiones.</div>
                        </div>
                        <div class="about-feature">
                            
                            <div class="about-feature-title">Organización</div>
                            <div class="about-feature-desc">Objetivos, proyectos, enlaces y coleccionables — cada aspecto de tu vida tiene su sitio propio.</div>
                        </div>
                        <div class="about-feature">
                            
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
                showLandingScreen();
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
        // Listas personalizadas de Ocio: colecciones con nombre de libros/pelis/series/juegos.
        let cultureLists = [];
        // Hábitos: seguimiento de constancia sin puntos ni insignias, solo una racha discreta.
        let habits = [];
        // Coleccionables: catálogo de objetos por categoría con valor de mercado.
        let collectibleCategories = [
            { id: 'cat_cartas', name: 'Cartas' },
            { id: 'cat_videojuegos', name: 'Videojuegos' }
        ];
        let collectibles = [];
        // Planificador del día: sustituye a Apuntes. Cada día lógico (4:00 am - 4:00 am)
        // tiene su propia lista de eventos en "days", así se puede planificar hoy,
        // mañana y pasado mañana por adelantado sin que se borren entre sí.
        let dayPlanner = { days: {} };
        // Pestaña de día activa en el planificador: 0 = hoy, 1 = mañana, 2 = pasado mañana.
        let plannerDayOffset = 0;
        // Última clave de "hoy" vista, para detectar el cruce de las 4:00 am.
        let plannerLastTodayKey = '';
        // Tareas que se repiten (diaria/semanal/mensual). "completadas" guarda,
        // por fecha, si ya se marcó hecha ese día concreto — así una tarea
        // recurrente no queda "hecha para siempre" al marcarla una vez.
        let recurringTasks = [];
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
            forecastProfile: { salary: 0, contractMonths: 0, emergencyMonthlyPlan: 0, vacationMonthlyPlan: 0, investMonthlyPlan: 0 },
            // Cuentas propias que el usuario añade además de las 4 fijas
            // (Efectivo/Emergencia/Vacaciones/Inversión): [{id, name, balance}].
            customAccounts: [],
            // Sueldo real cobrado cada mes ({ 'YYYY-MM': importe }), aparte
            // de salaryForecast (la previsión) para poder comparar ambos.
            salaryReal: {},
            // Aportaciones a inversión a largo plazo: [{month:'YYYY-MM', amount}].
            investmentContributions: [],
            // Líneas configurables de la gráfica de evolución: [{id, name, accountKeys, color}].
            // Si está vacío se usan las dos líneas de siempre (safe/total).
            chartSeries: [],
            // Presupuestos y metas de ahorro (Fase 1) y actualización mensual guiada.
            budgets: {},
            savingsGoals: [],
            // Día del mes (1-28) en que el usuario quiere que se le recuerde
            // actualizar sus finanzas; null = sin recordatorio.
            recordatorioDia: null,
            // Mes (YYYY-MM) del último cierre mensual guiado ya completado.
            ultimoCierreMensual: null
        };
        let financeSubView = 'menu';
        // ============================================================
        //  FINANZAS PRO — registro de movimientos por cuenta (Efectivo /
        //  Bancos / Online), categorías al estilo Wallet, e importación
        //  desde CSV/Excel del banco. Capa opcional y totalmente aparte
        //  del resumen de Finanzas: activarla no toca ninguna cifra del
        //  dashboard de siempre.
        // ============================================================
        let financePro = {
            enabled: false,
            accounts: {
                efectivo: { name: 'Efectivo', balance0: 0 },
                bancos: { name: 'Bancos', balance0: 0 },
                online: { name: 'Online', balance0: 0 }
            },
            categories: [],
            // {id, date:'YYYY-MM-DD', account, type:'income'|'expense'|'transfer',
            //  amount (siempre positivo), category (id, solo income/expense),
            //  transferTo (cuenta destino, solo transfer), note, importBatch}
            transactions: [],
            // Presupuesto mensual opcional por categoría de gasto: { catId: importe }
            categoryBudgets: {},
            // Reglas de traspaso para la importación: {id, enabled, matchText,
            // otherAccount} — un movimiento importado cuyo concepto contenga
            // matchText se registra como traspaso con otherAccount en vez de
            // como ingreso/gasto normal (ver confirmFinanceProImport()).
            rules: []
        };
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
            calendar: 'Home',
            home: 'Centro resumen',
            culture: 'Ocio',
            travels: 'Viajes',
            work: 'Trabajo',
            projects: 'Proyectos',
            events: 'Eventos',
            documents: 'Documentos',
            finances: 'Dashboard',
            tags: 'Etiquetas',
            vault: 'Vault',
            notes: 'Notas',
            goals: 'Objetivos',
            planner: 'Planificador del día',
            habits: 'Hábitos',
            graph: 'Grafo',
            collectibles: 'Coleccionables',
            friends: 'Amigos',
            studies: 'Estudios',
            links: 'Enlaces',
            suggestions: 'Sugerencias',
            settings: 'Ajustes'
        };

        // ============================================================
        //  NAVEGACIÓN: fuente única para sidebar, menú móvil y el
        //  buscador "¿dónde quieres ir?" (evita mantener el menú
        //  duplicado a mano en dos sitios distintos).
        // ============================================================
        const NAV_SECTIONS = [
            { label: 'General', items: [
                { view: 'calendar', icon: '◷', text: 'Home' },
                { view: 'home', icon: '⌂', text: 'Centro resumen' },
                { view: 'planner', icon: '▤', text: 'Planificador' },
                { view: 'habits', icon: '○', text: 'Hábitos' },
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
                { view: 'graph', icon: '◇', text: 'Grafo' },
            ] },
            { label: 'Sistema', items: [
                { view: 'suggestions', icon: '✎', text: 'Sugerencias' },
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
            { view: 'finances', text: 'Inversión', anchor: 'finance-investment-section' },
            { view: 'finances', text: 'Patrimonio operativo', anchor: 'finance-networth-section' },
            { view: 'finances', text: 'Cuentas', anchor: 'finance-accounts-section' },
            { view: 'travels', text: 'Viajes', setter: 'setTravelPlacesTab', value: 'travels' },
            { view: 'travels', text: 'Lugares', setter: 'setTravelPlacesTab', value: 'places' },
            { view: 'calendar', text: 'Vista Día', setter: 'setCalView', value: 'day' },
            { view: 'calendar', text: 'Vista Semana', setter: 'setCalView', value: 'week' },
            { view: 'calendar', text: 'Vista Mes', setter: 'setCalView', value: 'month' },
            { view: 'settings', text: 'Datos de la cuenta (exportar/importar)', anchor: 'settings-account-section' },
            { view: 'settings', text: 'Apariencia', anchor: 'settings-appearance-section' },
            { view: 'settings', text: 'Modo desarrollador', anchor: 'settings-advanced-section' },
            { view: 'settings', text: 'Prompts guardados', anchor: 'settings-prompts-section' },
            { view: 'settings', text: 'Cerrar sesión en todos los dispositivos', anchor: 'settings-danger-section' },
            { view: 'friends', text: 'Tu nombre visible', anchor: 'friends-name-section' },
            { view: 'friends', text: 'Mis amigos', anchor: 'friends-list-section' },
            { view: 'friends', text: 'Tu código de amigo', anchor: 'friends-code-section' },
            { view: 'home', text: 'Mis tareas', anchor: 'summary-mytasks-section' },
            { view: 'home', text: 'Revisión semanal', anchor: 'summary-review-section' },
            { view: 'home', text: 'Esta semana', anchor: 'summary-week-section' },
            { view: 'home', text: 'Actividad reciente', anchor: 'summary-activity-section' },
            { view: 'home', text: 'Estadísticas históricas', anchor: 'summary-stats-section' },
            { view: 'home', text: 'Copia de seguridad', anchor: 'summary-backup-section' },
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
            { cmd: 'año', text: '/año' },
            { cmd: 'tema', text: '/tema' },
            { cmd: 'backup', text: '/backup' },
            { cmd: 'exportar', text: '/exportar' },
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
        const EVENT_TYPE_LABELS = { social: 'Social', teatro: 'Teatro', cine: 'Cine', concierto: 'Concierto', futbol: 'Fútbol', baloncesto: 'Baloncesto', f1: 'F1', motogp: 'Moto GP', otro: 'Otro' };
        // Iconos sólidos (misma familia TARJETA BITACORA) para el chip a la
        // izquierda de cada tarjeta de evento — uno por tipo, más un
        // genérico de reserva. "Deporte" se divide en cuatro disciplinas
        // propias en vez de un único icono genérico.
        const EVENT_TYPE_ICONS = {
            social: '<svg viewBox="0 0 100 100" fill="currentColor"><circle cx="36" cy="46" r="26"/><circle cx="68" cy="50" r="20" opacity=".5"/></svg>',
            teatro: '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M10 92V55a40 40 0 0 1 80 0v37z"/></svg>',
            cine: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M8 26a18 18 0 0 1 18-18h48a18 18 0 0 1 18 18v48a18 18 0 0 1-18 18H26A18 18 0 0 1 8 74zM40 32l28 18-28 18z"/></svg>',
            concierto: '<svg viewBox="0 0 100 100" fill="currentColor"><circle cx="28" cy="76" r="16"/><rect x="40" y="15" width="9" height="61"/><path d="M40 15l38-11v20l-38 11z"/></svg>',
            futbol: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M50 4a46 46 0 1 0 0 92 46 46 0 0 0 0-92zM50 35l10.46 7.6-4 12.3h-12.92l-4-12.3zM52.2 35L52.2 10 47.8 10 47.8 35zM61.73 44.4L83.97 28.7 81.43 25.1 59.19 40.8zM55.13 56.65L80.57 75.95 83.23 72.45 57.79 53.15zM42.21 53.15L16.77 72.45 19.43 75.95 44.87 56.65zM40.81 40.8L18.57 25.1 16.03 28.7 38.27 44.4z"/></svg>',
            baloncesto: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M50 4a46 46 0 1 0 0 92 46 46 0 0 0 0-92zM46 6h8v88h-8zM13 30c9 6 16 15 16 20s-7 14-16 20l-5-7c7-5 12-11 12-13s-5-8-12-13z M87 30c-9 6-16 15-16 20s7 14 16 20l5-7c-7-5-12-11-12-13s5-8 12-13z"/></svg>',
            f1: '<svg viewBox="0 0 100 100" fill="currentColor"><text x="50" y="66" text-anchor="middle" font-size="54" font-weight="800" font-family="Poppins, sans-serif">F1</text></svg>',
            motogp: '<svg viewBox="0 0 100 100" fill="currentColor"><circle cx="22" cy="74" r="13"/><circle cx="78" cy="74" r="13"/><circle cx="60" cy="28" r="8"/><path d="M18 74l16-20h14l10-14c3-4 9-5 12-1l-7 9 9 11h10l6 15H70l-8-13H42z"/></svg>',
            otro: '<svg viewBox="0 0 100 100" fill="currentColor"><circle cx="50" cy="50" r="23"/></svg>'
        };
        let eventsTypeFilter = 'all';
        let eventsSearchQuery = '';
        let eventsShowPast = false;
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

        // Apartados ocultos a mano (clic derecho → Ocultar): preferencia de
        // pantalla, no datos — se guarda en este dispositivo, no en la nube.
        let bitacoraHiddenSections = [];
        try { bitacoraHiddenSections = JSON.parse(localStorage.getItem('bitacora_hidden_sections') || '[]'); } catch (e) { bitacoraHiddenSections = []; }
        function saveHiddenSections() {
            try { localStorage.setItem('bitacora_hidden_sections', JSON.stringify(bitacoraHiddenSections)); } catch (e) {}
        }
        function isSectionHidden(view) { return bitacoraHiddenSections.includes(view); }
        function hideSection(view) {
            if (!bitacoraHiddenSections.includes(view)) bitacoraHiddenSections.push(view);
            saveHiddenSections();
            closeNavContextMenu();
            renderAllNavs();
        }
        function showSection(view) {
            bitacoraHiddenSections = bitacoraHiddenSections.filter(v => v !== view);
            saveHiddenSections();
            closeNavContextMenu();
            renderAllNavs();
        }

        function closeNavContextMenu() {
            document.getElementById('nav-context-menu')?.remove();
        }

        function openNavContextMenu(event, view) {
            event.preventDefault();
            event.stopPropagation();
            closeNavContextMenu();
            const label = NAV_VIEW_LABELS[view] || view;
            const menu = document.createElement('div');
            menu.id = 'nav-context-menu';
            menu.className = 'nav-context-menu';
            menu.innerHTML = `<button onclick="hideSection('${view}')">Ocultar «${escapeHtml(label)}»</button>`;
            document.body.appendChild(menu);
            const x = Math.min(event.clientX, window.innerWidth - menu.offsetWidth - 8);
            const y = Math.min(event.clientY, window.innerHeight - menu.offsetHeight - 8);
            menu.style.left = Math.max(8, x) + 'px';
            menu.style.top = Math.max(8, y) + 'px';
            setTimeout(() => document.addEventListener('click', closeNavContextMenu, { once: true }), 0);
        }

        function toggleHiddenDrawer(el) {
            el.parentElement.classList.toggle('open');
        }

        function renderNavButtons(sections, mobile) {
            return sections.map(sec => `<span class="nav-label">${escapeHtml(sec.label)}</span>` +
                sec.items.filter(i => !isSectionHidden(i.view)).map(i => mobile
                    ? `<button onclick="switchView('${i.view}')" oncontextmenu="openNavContextMenu(event,'${i.view}')" data-view="${i.view}">${escapeHtml(i.text)}</button>`
                    : `<button onclick="switchView('${i.view}')" oncontextmenu="openNavContextMenu(event,'${i.view}')" data-view="${i.view}"><span class="nav-text">${escapeHtml(i.text)}</span></button>`
                ).join('')
            ).join('');
        }

        // Los apartados ocultos no desaparecen del todo: quedan aquí, en un
        // desplegable al final de la barra, para poder recuperarlos.
        function renderHiddenSectionsDrawer(mobile) {
            const items = bitacoraHiddenSections
                .map(view => ({ view, label: NAV_VIEW_LABELS[view] }))
                .filter(x => x.label);
            if (!items.length) return '';
            return `
                <div class="nav-hidden-drawer">
                    <button class="nav-hidden-toggle" onclick="toggleHiddenDrawer(this)">
                        <span class="nav-text">Apartados ocultos (${items.length})</span>
                        <span class="nav-hidden-arrow">›</span>
                    </button>
                    <div class="nav-hidden-list">
                        ${items.map(x => `
                            <div class="nav-hidden-item">
                                <button onclick="switchView('${x.view}')">${escapeHtml(x.label)}</button>
                                <button class="nav-hidden-restore" title="Mostrar de nuevo" onclick="event.stopPropagation();showSection('${x.view}')">↺</button>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
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
            [['sidebar-hidden-drawer', false], ['mobile-hidden-drawer', true]].forEach(([id, mobile]) => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = renderHiddenSectionsDrawer(mobile);
            });
        }
        renderAllNavs();

        const NON_CALENDAR_TYPES = ['document', 'restaurant', 'place', 'goal', 'subscription', 'fixed_expense'];

        // Las marcas de "tarea completada" (tareas semanales, del
        // planificador o recurrentes) se guardan como entradas de tipo
        // 'event' para llevar historial, pero no son eventos reales — no
        // deben aparecer en el calendario. calendarLog cubre las nuevas;
        // el prefijo de id cubre las que ya existían antes de este cambio.
        function isCalendarLogEntry(e) {
            return !!(e && (e.calendarLog === true || /^(weekly_task_done_|planner_done_|recurring_done_)/.test(e.id || '')));
        }

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

        // Formato ligero tipo Markdown para reseñas y notas: **negrita** y
        // *cursiva*, sin más sintaxis — deliberadamente mínimo, no es un
        // editor de texto enriquecido, solo permite dar énfasis puntual.
        function applyLiteMarkdown(escaped) {
            return escaped
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
        }

        function linkifyText(text) {
            if (!text) return '';
            const escaped = applyLiteMarkdown(escapeHtml(text));
            return linkifyWikilinks(escaped).replace(/\n/g, '<br>');
        }

        function getBacklinks(entryId) {
            return entries.filter(e => e.id !== entryId && parseWikiLinks(e.notes || '').includes(entryId));
        }

        // ============================================================
        //  VISTA DE GRAFO
        //  Grafo de entradas conectadas por [[wikilinks]] en sus notas,
        //  con un layout de fuerzas calculado una vez (sin física en vivo,
        //  para no gastar ciclos de más en una app que no lo necesita).
        // ============================================================
        const GRAPH_TYPE_COLORS = {
            book: '#3498db', movie: '#f39c12', series: '#9b59b6', game: '#e74c3c',
            travel: '#e84393', project: '#00b894', work: '#e67e22', event: '#f9a8d4',
            goal: '#2ecc71', place: '#14b8a6', birthday: '#ec4899'
        };

        function buildGraphData() {
            const edgesRaw = [];
            entries.forEach(e => {
                parseWikiLinks(e.notes || '').forEach(targetId => {
                    if (targetId === e.id) return;
                    edgesRaw.push({ source: e.id, target: targetId });
                });
            });
            const linkedIds = new Set();
            edgesRaw.forEach(ed => { linkedIds.add(ed.source); linkedIds.add(ed.target); });
            const nodes = [...linkedIds].map(id => entries.find(e => e.id === id)).filter(Boolean);
            const nodeIds = new Set(nodes.map(n => n.id));
            const edges = edgesRaw.filter(ed => nodeIds.has(ed.source) && nodeIds.has(ed.target));
            return { nodes, edges };
        }

        function computeGraphLayout(nodes, edges) {
            const n = nodes.length;
            const W = 900, H = 620;
            const positions = {};
            nodes.forEach((node, i) => {
                const angle = (i / n) * Math.PI * 2;
                positions[node.id] = { x: W / 2 + Math.cos(angle) * 220, y: H / 2 + Math.sin(angle) * 220, vx: 0, vy: 0 };
            });
            const edgeList = edges.map(e => [e.source, e.target]);
            const REPULSION = 2600, SPRING = 0.02, SPRING_LEN = 110, DAMPING = 0.85, CENTER_PULL = 0.01;
            const iterations = n > 150 ? 60 : 160;
            for (let iter = 0; iter < iterations; iter++) {
                for (let i = 0; i < n; i++) {
                    for (let j = i + 1; j < n; j++) {
                        const a = positions[nodes[i].id], b = positions[nodes[j].id];
                        const dx = a.x - b.x, dy = a.y - b.y;
                        const distSq = Math.max(dx * dx + dy * dy, 0.01);
                        const dist = Math.sqrt(distSq);
                        const force = REPULSION / distSq;
                        const fx = (dx / dist) * force, fy = (dy / dist) * force;
                        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
                    }
                }
                edgeList.forEach(([sId, tId]) => {
                    const a = positions[sId], b = positions[tId];
                    const dx = b.x - a.x, dy = b.y - a.y;
                    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
                    const force = (dist - SPRING_LEN) * SPRING;
                    const fx = (dx / dist) * force, fy = (dy / dist) * force;
                    a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
                });
                nodes.forEach(node => {
                    const p = positions[node.id];
                    p.vx += (W / 2 - p.x) * CENTER_PULL;
                    p.vy += (H / 2 - p.y) * CENTER_PULL;
                    p.vx *= DAMPING; p.vy *= DAMPING;
                    p.x += p.vx; p.y += p.vy;
                });
            }
            return positions;
        }

        function renderGraph() {
            const { nodes, edges } = buildGraphData();
            if (!nodes.length) {
                return `<div class="empty-state"><div class="empty-title">Sin conexiones todavía</div><div class="empty-sub">Escribe [[Título de otra entrada]] en las notas de cualquier entrada para enlazarla a otra, y aparecerán aquí conectadas.</div></div>`;
            }
            const positions = computeGraphLayout(nodes, edges);
            const xs = Object.values(positions).map(p => p.x), ys = Object.values(positions).map(p => p.y);
            const minX = Math.min(...xs) - 50, maxX = Math.max(...xs) + 50;
            const minY = Math.min(...ys) - 50, maxY = Math.max(...ys) + 50;

            const degree = {};
            edges.forEach(e => { degree[e.source] = (degree[e.source] || 0) + 1; degree[e.target] = (degree[e.target] || 0) + 1; });

            const edgesSvg = edges.map(e => {
                const a = positions[e.source], b = positions[e.target];
                return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="var(--border-strong)" stroke-width="1.2"/>`;
            }).join('');

            const nodesSvg = nodes.map(node => {
                const p = positions[node.id];
                const cat = categories.find(c => c.id === node.categoryId);
                const color = cat?.color || GRAPH_TYPE_COLORS[node.type] || 'var(--accent)';
                const r = 5 + Math.min(11, (degree[node.id] || 0) * 1.6);
                const label = (node.title || '').length > 22 ? node.title.slice(0, 20) + '…' : (node.title || '');
                return `
                    <g class="graph-node" data-open-entry="${node.id}">
                        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="${color}" stroke="var(--bg-app)" stroke-width="1.5"/>
                        <text x="${p.x.toFixed(1)}" y="${(p.y - r - 5).toFixed(1)}" text-anchor="middle" font-size="10" fill="var(--text-secondary)">${escapeHtml(label)}</text>
                    </g>`;
            }).join('');

            return `
            <div>
                <div style="font-size:20px;font-weight:700;margin-bottom:4px;color:var(--text-primary)">Grafo</div>
                <div style="color:var(--text-secondary);margin-bottom:16px;font-size:12.5px">${nodes.length} entradas conectadas · escribe [[Título]] en las notas de cualquier entrada para enlazarla a otra.</div>
                <div class="graph-svg-wrap">
                    <svg viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}" width="100%" style="min-height:440px">
                        ${edgesSvg}
                        ${nodesSvg}
                    </svg>
                </div>
            </div>`;
        }

        // La cadena Objetivo → Proyecto se apoya en el mismo mecanismo de
        // enlaces [[...]]: un proyecto que sirve a un objetivo escribe
        // [[Título del objetivo]] en sus notas, y aquí se filtran los
        // backlinks de tipo 'project' para mostrarlos de forma destacada
        // en el propio objetivo, en vez de mezclados con el resto.
        function renderGoalLinkedProjects(goalId, goalTitle) {
            const linked = getBacklinks(goalId).filter(e => e.type === 'project');
            if (!linked.length) {
                return `<div class="entry-detail-field" style="grid-column:1/-1">
                    <div class="entry-detail-label">Proyectos vinculados</div>
                    <div class="entry-detail-value" style="font-size:12px;color:var(--text-secondary)">Ninguno todavía. Escribe <strong>[[${escapeHtml(goalTitle)}]]</strong> en las notas de un proyecto para vincularlo a este objetivo.</div>
                </div>`;
            }
            return `<div class="entry-detail-field" style="grid-column:1/-1">
                <div class="entry-detail-label">Proyectos vinculados · ${linked.length}</div>
                ${linked.map(p => {
                    const prog = projectTaskProgress(p);
                    return `<div class="review-item" data-open-entry="${p.id}">
                        <span class="review-item-text">${escapeHtml(p.title)}</span>
                        ${prog.total ? `<div class="progress-bar-bg" style="margin:4px 0 0"><div class="progress-bar-fill" style="width:${prog.pct}%;background:#2563eb"></div></div>` : ''}
                    </div>`;
                }).join('')}
            </div>`;
        }

        function openEntryFromLink(entryId) {
            const target = entries.find(e => e.id === entryId);
            if (!target) return;
            closeModal();
            openEditEntry(entryId);
        }

        // ============================================================
        //  AUTOCOMPLETADO DE ENLACES [[...]] EN LAS NOTAS
        //  El sistema de wikilinks ya existía (parseWikiLinks/getBacklinks)
        //  pero había que saber de memoria el título exacto de la otra
        //  entrada. Esto añade un desplegable en vivo mientras se escribe
        //  dentro de [[ ]], igual en cualquier textarea de notas de
        //  cualquier tipo de entrada (todas comparten id="modal-notes").
        // ============================================================
        function wikilinkAutocompleteContext(textarea) {
            const pos = textarea.selectionStart;
            const before = textarea.value.slice(0, pos);
            const openIdx = before.lastIndexOf('[[');
            if (openIdx === -1) return null;
            const between = before.slice(openIdx + 2);
            if (between.includes(']]') || between.includes('\n')) return null;
            return { openIdx, query: between };
        }

        function hideWikilinkAutocomplete() {
            const box = document.getElementById('wikilink-autocomplete-box');
            if (box) box.style.display = 'none';
        }

        function insertWikilinkAutocomplete(textareaId, openIdx, title) {
            const textarea = document.getElementById(textareaId);
            if (!textarea) return;
            const pos = textarea.selectionStart;
            const before = textarea.value.slice(0, openIdx);
            const after = textarea.value.slice(pos);
            const inserted = before + '[[' + title + ']]';
            textarea.value = inserted + after;
            textarea.focus();
            textarea.setSelectionRange(inserted.length, inserted.length);
            hideWikilinkAutocomplete();
        }

        function handleWikilinkAutocompleteInput(textarea) {
            const ctx = textarea.id ? wikilinkAutocompleteContext(textarea) : null;
            if (!ctx) { hideWikilinkAutocomplete(); return; }
            const q = ctx.query.trim().toLowerCase();
            const matches = buildLinkableIndex()
                .filter(x => !q || x.title.toLowerCase().includes(q))
                .slice(0, 6);
            if (!matches.length) { hideWikilinkAutocomplete(); return; }

            let box = document.getElementById('wikilink-autocomplete-box');
            if (!box) {
                box = document.createElement('div');
                box.id = 'wikilink-autocomplete-box';
                box.className = 'wikilink-autocomplete';
                document.body.appendChild(box);
            }
            box.innerHTML = matches.map(m =>
                `<div class="wikilink-autocomplete-item">${escapeHtml(m.title)}</div>`
            ).join('');
            [...box.children].forEach((item, i) => {
                item.onmousedown = (e) => { e.preventDefault(); insertWikilinkAutocomplete(textarea.id, ctx.openIdx, matches[i].title); };
            });
            const rect = textarea.getBoundingClientRect();
            box.style.left = rect.left + 'px';
            box.style.top = (rect.bottom + window.scrollY + 4) + 'px';
            box.style.width = Math.min(rect.width, 320) + 'px';
            box.style.display = 'block';
        }

        // Delegado en document (no en el textarea, que se recrea cada vez
        // que se abre un modal): funciona para cualquier campo de notas de
        // cualquier tipo de entrada sin tener que engancharlo uno a uno.
        document.addEventListener('input', (e) => {
            if (e.target?.id === 'modal-notes') handleWikilinkAutocompleteInput(e.target);
        });
        document.addEventListener('keydown', (e) => {
            if (e.target?.id === 'modal-notes' && e.key === 'Escape') hideWikilinkAutocomplete();
        });
        document.addEventListener('click', (e) => {
            if (e.target?.id !== 'modal-notes' && !e.target?.closest?.('.wikilink-autocomplete')) hideWikilinkAutocomplete();
        });

        // Delegación de eventos para las tarjetas/filas de entrada (libros,
        // películas, viajes, trabajos, proyectos, eventos, objetivos...):
        // un único listener en document en vez de un onclick="openEntryDetail(...)"
        // por cada tarjeta repartido por decenas de render*() distintos.
        // Cada tarjeta solo lleva data-open-entry="<id>"; closest() ya
        // resuelve bien el caso de una fila anidada dentro de otra.
        document.addEventListener('click', (e) => {
            const el = e.target.closest('[data-open-entry]');
            if (el) openEntryDetail(el.dataset.openEntry);
        });

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
                // Vault no depende del Modo Desarrollador (su botón ya
                // está siempre visible en el menú), así que aquí basta
                // con que coincida el texto escrito.
                const hiddenMatches = [
                    ...((q && 'vault'.includes(q)) ? [{ kind: 'vault', text: 'Vault' }] : []),
                ];
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
                    // Los campos de fecha ya traen "hoy" como valor por
                    // defecto (no vacío), así que hay que sobrescribirlos
                    // siempre aquí, no solo cuando estén vacíos — si no, la
                    // fecha del día concreto en el que se pulsó "Añadir"
                    // nunca llegaba a aplicarse.
                    document.querySelectorAll('#modal-container input[type="date"]').forEach(inp => { inp.value = prefillDate; });
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
            } else if (item.kind === 'vault') {
                openVault();
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
            // Empaquetado en un callback porque, si item.view es 'finances',
            // switchView primero pregunta por el modo privacidad y no cambia
            // de vista hasta que se responde — sin esto, el scroll/acción
            // se ejecutaría contra la vista anterior.
            switchView(item.view, () => {
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
            });
        }

        function runPaletteCommand(cmd) {
            if (cmd === 'admin') toggleDeveloperMode();
            else if (cmd === 'año') abrirCalendarioAnual();
            else if (cmd === 'tema') toggleTheme();
            else if (cmd === 'backup') runManualBackupNow();
            else if (cmd === 'exportar') exportData();
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
                { id: 'cat_evento', name: 'Evento', color: '#000000' },
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
                    <div class="chart-container" style="margin-bottom:16px" id="friends-name-section">
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

                    <div class="chart-container" id="friends-list-section">
                        <div class="chart-title">Mis amigos</div>
                        <div style="font-size:11px;color:var(--text-secondary);margin-top:8px">Introduce el código que te ha compartido tu amigo. Le llegará como solicitud y tendrá que aceptarla.</div>
                        <div class="friend-add-row">
                            <input type="text" id="friend-add-input" class="friend-add-input" placeholder="Código de amigo" maxlength="8" onkeydown="friendAddInputKeydown(event)">
                            <button class="btn-secondary" id="friend-add-btn" style="width:auto" onclick="anadirAmigoPorCodigo()">+ Añadir</button>
                        </div>
                        ${solicitudesEnviadas.length ? `<div style="font-size:11px;color:var(--text-secondary);margin:10px 0 4px">Solicitudes enviadas, pendientes de respuesta:</div>
                        <div class="friend-list" style="margin-bottom:10px">
                            ${solicitudesEnviadas.map(s => `<div class="friend-list-item"><span class="friend-list-name" style="font-weight:500;color:var(--text-secondary)">${escapeHtml(s.nombre)}</span><span style="font-size:11px;color:var(--text-secondary)">Pendiente</span></div>`).join('')}
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
                    <div class="chart-container" id="friends-code-section">
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
                // El rosa de "Evento" (en cualquiera de sus dos tonos
                // anteriores) pasa a negro — a quien ya tuviera la categoría
                // creada se le actualiza sola, una única vez.
                const eventCat = categories.find(c => c.id === 'cat_evento');
                if (eventCat && (eventCat.color === '#ec4899' || eventCat.color === '#f9a8d4')) eventCat.color = '#000000';
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
                financeProfile.customAccounts = Array.isArray(financeProfile.customAccounts) ? financeProfile.customAccounts : [];
                financeProfile.salaryReal = (financeProfile.salaryReal && typeof financeProfile.salaryReal === 'object') ? financeProfile.salaryReal : {};
                financeProfile.investmentContributions = Array.isArray(financeProfile.investmentContributions) ? financeProfile.investmentContributions : [];
                financeProfile.chartSeries = Array.isArray(financeProfile.chartSeries) ? financeProfile.chartSeries : [];
                financeProfile.budgets = (financeProfile.budgets && typeof financeProfile.budgets === 'object') ? financeProfile.budgets : {};
                financeProfile.savingsGoals = Array.isArray(financeProfile.savingsGoals) ? financeProfile.savingsGoals : [];
                financeProfile.recordatorioDia = Number.isFinite(financeProfile.recordatorioDia) ? financeProfile.recordatorioDia : null;
                financeProfile.ultimoCierreMensual = financeProfile.ultimoCierreMensual || null;
                financePro = saved.financePro || financePro;
                financePro.enabled = !!financePro.enabled;
                financePro.accounts = (financePro.accounts && typeof financePro.accounts === 'object') ? financePro.accounts : {};
                ['efectivo', 'bancos', 'online'].forEach(k => {
                    financePro.accounts[k] = financePro.accounts[k] || { name: k[0].toUpperCase() + k.slice(1), balance0: 0 };
                });
                financePro.categories = Array.isArray(financePro.categories) && financePro.categories.length ? financePro.categories : financeProDefaultCategories();
                financePro.transactions = Array.isArray(financePro.transactions) ? financePro.transactions : [];
                financePro.categoryBudgets = (financePro.categoryBudgets && typeof financePro.categoryBudgets === 'object') ? financePro.categoryBudgets : {};
                financePro.rules = Array.isArray(financePro.rules) ? financePro.rules : [];
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
                cultureLists = Array.isArray(saved.cultureLists) ? saved.cultureLists : [];
                habits = Array.isArray(saved.habits) ? saved.habits : [];
                habits.forEach(h => { h.completadas = h.completadas && typeof h.completadas === 'object' ? h.completadas : {}; });
                collectibleCategories = Array.isArray(saved.collectibleCategories) && saved.collectibleCategories.length
                    ? saved.collectibleCategories
                    : [{ id: 'cat_cartas', name: 'Cartas' }, { id: 'cat_videojuegos', name: 'Videojuegos' }];
                collectibles = Array.isArray(saved.collectibles) ? saved.collectibles : [];
                dayPlanner = migratePlannerData(saved.dayPlanner);
                recurringTasks = Array.isArray(saved.recurringTasks) ? saved.recurringTasks : [];
                recurringTasks.forEach(t => { t.completadas = t.completadas && typeof t.completadas === 'object' ? t.completadas : {}; });
                dailyEffort = (saved.dailyEffort && typeof saved.dailyEffort === 'object') ? saved.dailyEffort : {};
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
                financePro,
                plannedTrips,
                weeklyTasks,
                cultureLists,
                habits,
                collectibleCategories,
                collectibles,
                dayPlanner,
                recurringTasks,
                dailyEffort,
                studies,
                links,
                linkCategories,
                blurFinances,
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

            bitacoraNativeSyncSnapshot();
        }

        // ============================================================
        //  PUENTE CON LA APP NATIVA DE iOS (widgets)
        //  La app nativa envuelve esta misma web en un WKWebView y registra
        //  un manejador de mensajes llamado "bitacoraNative". Cada vez que
        //  se guarda algo, le mandamos un resumen (racha, tareas de hoy,
        //  saldo, próximos eventos) que la app nativa deja en un App Group
        //  para que los widgets lo lean sin conexión. En la PWA/web normal
        //  ese manejador no existe, así que esto no hace nada.
        // ============================================================
        function bitacoraActivityDates() {
            const dates = new Set();
            (entries || []).forEach(e => { if (e && e.date && !isCalendarLogEntry(e)) dates.add(String(e.date).slice(0, 10)); });
            (financePro && Array.isArray(financePro.transactions) ? financePro.transactions : []).forEach(t => { if (t && t.date) dates.add(String(t.date).slice(0, 10)); });
            return dates;
        }

        // Racha de días seguidos con algo añadido/editado en Bitácora. Si
        // hoy todavía no hay actividad no se da la racha por rota hasta que
        // acabe el día — se cuenta hacia atrás desde ayer mientras tanto.
        function bitacoraUpdateStreak() {
            const dates = bitacoraActivityDates();
            const today = new Date();
            const todayStr = today.toISOString().slice(0, 10);
            const cursor = new Date(today);
            if (!dates.has(todayStr)) cursor.setDate(cursor.getDate() - 1);
            let streak = 0;
            while (dates.has(cursor.toISOString().slice(0, 10))) {
                streak++;
                cursor.setDate(cursor.getDate() - 1);
            }
            return streak;
        }

        function bitacoraSnapshotPayload() {
            const today = todayISO();
            const tasksToday = (typeof plannerItemsForOffset === 'function' ? plannerItemsForOffset(0) : [])
                .slice(0, 7)
                .map(it => ({ done: !!it.done }));
            const todaysEvents = (entries || [])
                .filter(e => e.type === 'event' && e.date === today && !isCalendarLogEntry(e))
                .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')))
                .slice(0, 3)
                .map(e => ({ time: e.time || '', title: e.title || '' }));
            let balancePct = null;
            if (financePro && financePro.enabled) {
                try { balancePct = financeProStatsData().pctVsPrevMonth; } catch (e) { balancePct = null; }
            }
            return {
                streakDays: bitacoraUpdateStreak(),
                tasksToday,
                balance: (financePro && financePro.enabled) ? financeProTotalBalance() : 0,
                balancePct,
                events: todaysEvents,
                updatedAtISO: new Date().toISOString()
            };
        }

        function bitacoraNativeSyncSnapshot() {
            try {
                if (!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bitacoraNative)) return;
                window.webkit.messageHandlers.bitacoraNative.postMessage(JSON.stringify(bitacoraSnapshotPayload()));
            } catch (e) { console.error('bitacoraNativeSyncSnapshot', e); }
        }

        // Cuando un widget abre la app con bitacora://quick?type=expense|income
        // (ver ContentView.swift), la app nativa carga
        // https://appbitacora.es/?quick=expense — aquí se detecta y se abre
        // el registro rápido de Finanzas PRO ya preparado en ese tipo.
        function handleWidgetDeepLink() {
            const params = new URLSearchParams(window.location.search);
            const quick = params.get('quick');
            if (quick !== 'expense' && quick !== 'income') return;
            history.replaceState(null, '', window.location.pathname + window.location.hash);
            if (!financePro || !financePro.enabled) { showToast('Activa el modo PRO de Finanzas para usar el registro rápido', true); return; }
            switchView('finance');
            setTimeout(() => {
                if (typeof openFinanceProQuickCaptureModal === 'function') {
                    openFinanceProQuickCaptureModal();
                    if (typeof financeProQuickSet === 'function') financeProQuickSet('type', quick);
                }
            }, 150);
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
                titleEl.innerHTML = `Home - ${greeting} ${nameLink}`;
            } else {
                const baseTitle = VIEW_LABELS[currentView] || 'Home';
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

        const FAB_ICON_DEFAULT = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M13 2 3 14h6l-1 8 10-12h-6z"/></svg>';

        // El FAB (captura rápida) cambia de icono según el apartado activo
        // y añade un anillo de pulso cuando hay uno contextual — misma idea
        // que el resto de icono TARJETA BITACORA, sin cambiar su acción
        // (sigue abriendo la paleta de comandos / tecla ESPACIO).
        function updateFabIcon() {
            const fab = document.getElementById('fab');
            if (!fab) return;
            if (currentView === 'work') {
                fab.innerHTML = typeof FAB_ICON_LAPTOP !== 'undefined' ? FAB_ICON_LAPTOP : FAB_ICON_DEFAULT;
                fab.classList.add('fab-pulse');
                fab.title = 'Captura rápida · Trabajo (tecla ESPACIO)';
            } else {
                fab.innerHTML = FAB_ICON_DEFAULT;
                fab.classList.remove('fab-pulse');
                fab.title = 'Captura rápida (tecla ESPACIO)';
            }
        }

        // ============================================================
        //  THEME
        // ============================================================
        // Dos tonos únicos — "asfalto" (oscuro, por defecto, sin clase en
        // <body>) y "papel" (claro, body.papel). Sustituyen a los tres
        // temas anteriores (oscuro puro / claro puro / beige).
        const THEMES = ['asfalto', 'papel'];
        const THEME_LABELS = { asfalto: 'asfalto', papel: 'papel' };
        // Los temas antiguos ('dark'/'light'/'beige') que ya hubiera
        // guardados en localStorage de sesiones previas migran al tono más
        // parecido la primera vez que se cargan, para no cambiarle el tema
        // a quien ya tenía uno elegido.
        const THEME_MIGRATION = { dark: 'asfalto', light: 'papel', beige: 'papel' };

        function loadTheme() {
            let theme = localStorage.getItem('bitacora_theme') || 'asfalto';
            if (THEME_MIGRATION[theme]) {
                theme = THEME_MIGRATION[theme];
                localStorage.setItem('bitacora_theme', theme);
            }
            THEMES.forEach(t => document.body.classList.remove(t));
            if (theme !== 'asfalto') document.body.classList.add(theme);
        }

        function toggleTheme() {
            const current = THEMES.find(t => document.body.classList.contains(t)) || 'asfalto';
            const idx = (THEMES.indexOf(current) + 1) % THEMES.length;
            const next = THEMES[idx];
            THEMES.forEach(t => document.body.classList.remove(t));
            if (next !== 'asfalto') document.body.classList.add(next);
            localStorage.setItem('bitacora_theme', next);
            showToast('Tema cambiado a ' + THEME_LABELS[next]);
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

            // Comprueba si "hoy" ha cambiado (cruce de las 4:00 am), para
            // limpiar días pasados y refrescar la pestaña "Hoy" si está abierta.
            const todayKey = currentPlannerDayKey();
            if (plannerLastTodayKey !== todayKey) {
                plannerLastTodayKey = todayKey;
                resetDayPlannerIfNeeded();
                if (currentView === 'planner') render();
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

        // "afterEnter" es un callback opcional para cuando switchView('finances')
        // va seguido de otra acción que necesita que la vista ya esté activa
        // (p. ej. abrir un modal encima) — con el aviso de privacidad de por
        // medio, ese "seguido de" deja de ser síncrono, así que se guarda
        // para lanzarlo en cuanto se responda la pregunta.
        function switchView(view, afterEnter) {
            // Al entrar en Finanzas (desde otra sección) se pregunta si
            // activar el modo privacidad (cifras ocultas) antes de mostrar
            // el panel — con Intro se responde "Sí" (botón enfocado de
            // salida) por ser la opción más prudente por defecto.
            if (view === 'finances' && currentView !== 'finances') {
                promptFinancePrivacyThenEnter(afterEnter);
                return;
            }
            performSwitchView(view);
            if (typeof afterEnter === 'function') afterEnter();
        }

        function promptFinancePrivacyThenEnter(afterEnter) {
            window._financePrivacyPromptCallback = afterEnter || null;
            showModal(`
                <div class="modal-title">Modo privacidad</div>
                <div class="finance-modal-note" style="margin:4px 0 18px">¿Quieres entrar a tu dashboard de Finanzas con el modo privacidad activado (cifras ocultas)?</div>
                <button class="btn-modal-primary" id="finance-privacy-yes-btn" onclick="answerFinancePrivacyPrompt(true)">Sí</button>
                <button class="btn-secondary" style="margin-top:10px" onclick="answerFinancePrivacyPrompt(false)">No</button>
            `);
            setTimeout(() => document.getElementById('finance-privacy-yes-btn')?.focus(), 0);
        }

        function answerFinancePrivacyPrompt(wantsPrivacy) {
            blurFinances = wantsPrivacy;
            closeModal();
            performSwitchView('finances');
            const cb = window._financePrivacyPromptCallback;
            window._financePrivacyPromptCallback = null;
            if (typeof cb === 'function') cb();
            saveData().catch(e => console.error(e));
        }

        function performSwitchView(view) {
            try {
                currentView = view;
                if (view === 'planner') plannerDayOffset = 0;

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
                createdAt: new Date().toISOString(),
                calendarLog: true
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
        //  Cada día lógico (4:00 am - 4:00 am) tiene su propia lista de
        //  eventos, para poder planificar hoy, mañana y pasado mañana
        //  por adelantado. Los días pasados se limpian solos.
        // ============================================================

        const PLANNER_DAY_TABS = [
            { offset: 0, label: 'Hoy' },
            { offset: 1, label: 'Mañana' },
            { offset: 2, label: 'Pasado mañana' }
        ];

        // Clave del "día lógico" para un desplazamiento de días dado: antes de
        // las 4:00 am se sigue considerando parte del día anterior.
        function currentPlannerDayKey(date = new Date(), offsetDays = 0) {
            const d = new Date(date);
            if (d.getHours() < 4) d.setDate(d.getDate() - 1);
            d.setDate(d.getDate() + offsetDays);
            return d.toISOString().slice(0, 10);
        }

        // Adapta datos guardados con el formato antiguo (un único { dayKey, items })
        // al nuevo formato multi-día { days: { AAAA-MM-DD: items[] } }.
        function migratePlannerData(saved) {
            if (saved && typeof saved === 'object' && saved.days && typeof saved.days === 'object') {
                const days = {};
                Object.keys(saved.days).forEach(k => { days[k] = Array.isArray(saved.days[k]) ? saved.days[k] : []; });
                return { days };
            }
            if (saved && typeof saved === 'object' && Array.isArray(saved.items) && saved.items.length) {
                const key = saved.dayKey || currentPlannerDayKey();
                return { days: { [key]: saved.items } };
            }
            return { days: {} };
        }

        function resetDayPlannerIfNeeded() {
            if (!dayPlanner || typeof dayPlanner !== 'object') dayPlanner = { days: {} };
            if (!dayPlanner.days || typeof dayPlanner.days !== 'object') dayPlanner.days = {};

            // Lo que quedó sin marcar como hecho en un día ya pasado se
            // arrastra a hoy en vez de perderse (se detecta en cuanto
            // cambia la fecha — ver plannerLastTodayKey en
            // updateSidebarProgress), marcado como "arrastrado" para
            // poder destacarlo como prioritario.
            const todayKey = currentPlannerDayKey();
            if (!Array.isArray(dayPlanner.days[todayKey])) dayPlanner.days[todayKey] = [];
            Object.keys(dayPlanner.days).forEach(k => {
                if (k >= todayKey) return;
                (dayPlanner.days[k] || []).forEach(it => {
                    if (!it.done) {
                        it.arrastrado = true;
                        dayPlanner.days[todayKey].push(it);
                    }
                });
                delete dayPlanner.days[k];
            });
        }

        function plannerItemsForOffset(offset) {
            resetDayPlannerIfNeeded();
            const key = currentPlannerDayKey(new Date(), offset);
            if (!Array.isArray(dayPlanner.days[key])) dayPlanner.days[key] = [];
            return dayPlanner.days[key];
        }

        function setPlannerDayOffset(offset) {
            plannerDayOffset = offset;
            if (currentView === 'planner') render();
        }

        function renderPlanner() {
            resetDayPlannerIfNeeded();
            const offset = plannerDayOffset;
            const items = [...plannerItemsForOffset(offset)].sort((a, b) => String(a.time).localeCompare(String(b.time)));
            const now = new Date();
            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            const today = todayISO();
            const dueToday = offset === 0 ? recurringTasksDueToday() : [];
            const activeLabel = PLANNER_DAY_TABS.find(t => t.offset === offset)?.label || 'Hoy';
            const emptyLabel = offset === 0 ? 'para hoy' : (offset === 1 ? 'para mañana' : 'para pasado mañana');

            return `
            <div class="planner-view">
                <div class="planner-head">
                    <div>
                        <div class="finance-kicker">${activeLabel}</div>
                        <h3 style="margin:2px 0 0 0">Planificador del día</h3>
                        <p style="font-size:12px;color:var(--text-secondary);margin-top:4px">
                            Cada día empieza de cero a las 4:00 am — lo que no marques como hecho se arrastra a hoy, destacado en granate. Puedes ir dejando planificados los próximos dos días.
                        </p>
                    </div>
                    <div style="display:flex;gap:8px">
                        <button class="btn-secondary" onclick="openManageRecurringTasks()">Recurrentes</button>
                        <button class="btn-modal-primary" onclick="openAddPlannerItem()">+ Evento</button>
                    </div>
                </div>

                <div class="culture-tabs" style="margin-bottom:18px">
                    ${PLANNER_DAY_TABS.map(t => `
                        <button class="culture-tab ${offset === t.offset ? 'active' : ''}" onclick="setPlannerDayOffset(${t.offset})">${t.label}</button>
                    `).join('')}
                </div>

                ${dueToday.length ? `
                    <div class="planner-recurring-block">
                        <div class="planner-recurring-title">Recurrentes de hoy</div>
                        ${dueToday.map(t => `
                            <label class="planner-recurring-row">
                                <input type="checkbox" ${t.completadas?.[today] ? 'checked' : ''} onchange="toggleRecurringTaskDoneToday('${t.id}')">
                                <span class="${t.completadas?.[today] ? 'done' : ''}">${escapeHtml(t.texto)}</span>
                            </label>
                        `).join('')}
                    </div>
                ` : ''}

                <div class="planner-timeline">
                    ${items.length ? items.map(it => {
                        const [h, m] = String(it.time).split(':').map(Number);
                        const itemMinutes = (h || 0) * 60 + (m || 0);
                        const isPast = offset === 0 && itemMinutes < nowMinutes;
                        return `
                        <div class="planner-item ${isPast && !it.arrastrado ? 'planner-item-past' : ''} ${it.done ? 'planner-item-done' : ''} ${it.arrastrado && !it.done ? 'planner-item-arrastrado' : ''}">
                            <div class="planner-item-time">${escapeHtml(it.time)}</div>
                            <input type="checkbox" class="planner-item-check" ${it.done ? 'checked' : ''} onchange="togglePlannerItemDone('${it.id}', ${offset})">
                            <div class="planner-item-body">
                                <div class="planner-item-title">${escapeHtml(it.title)}${it.arrastrado && !it.done ? '<span class="planner-item-arrastrado-tag">Pendiente de ayer</span>' : ''}</div>
                                ${it.notes ? `<div class="planner-item-notes">${escapeHtml(it.notes)}</div>` : ''}
                                ${renderPlannerSubtasks(it, offset)}
                            </div>
                            <button class="planner-item-delete" title="Eliminar" onclick="deletePlannerItem('${it.id}', ${offset})">×</button>
                        </div>`;
                    }).join('') : `
                        <div class="finance-empty-state">Aún no has añadido eventos ${emptyLabel}. Pulsa <strong>+ Evento</strong> para empezar tu planificación.</div>
                    `}
                </div>
            </div>`;
        }

        // Subtareas de un elemento del planificador: mismo patrón que las
        // tareas de un proyecto, pero por ítem del día.
        function renderPlannerSubtasks(it, offset) {
            const subtasks = Array.isArray(it.subtasks) ? it.subtasks : [];
            return `
                <div class="planner-item-subtasks">
                    ${subtasks.map(st => `
                        <label class="planner-subtask-row">
                            <input type="checkbox" ${st.done ? 'checked' : ''} onchange="togglePlannerSubtaskDone('${it.id}','${st.id}',${offset})">
                            <span class="${st.done ? 'done' : ''}">${escapeHtml(st.text)}</span>
                        </label>`).join('')}
                    <button type="button" class="planner-subtask-add" onclick="addPlannerSubtask('${it.id}',${offset})">+ subtarea</button>
                </div>`;
        }

        async function addPlannerSubtask(itemId, offset) {
            const text = prompt('Nueva subtarea');
            if (!text || !text.trim()) return;
            const item = plannerItemsForOffset(offset).find(it => it.id === itemId);
            if (!item) return;
            item.subtasks = Array.isArray(item.subtasks) ? item.subtasks : [];
            item.subtasks.push({ id: 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), text: text.trim(), done: false });
            if (currentView === 'planner') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function togglePlannerSubtaskDone(itemId, subtaskId, offset) {
            const item = plannerItemsForOffset(offset).find(it => it.id === itemId);
            const sub = item?.subtasks?.find(s => s.id === subtaskId);
            if (!sub) return;
            sub.done = !sub.done;
            if (currentView === 'planner') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openAddPlannerItem() {
            const offset = plannerDayOffset;
            const now = new Date();
            const defaultTime = offset === 0
                ? `${String(now.getHours()).padStart(2, '0')}:${String(Math.ceil(now.getMinutes() / 5) * 5 % 60).padStart(2, '0')}`
                : '09:00';
            const titleSuffix = offset === 0 ? 'de hoy' : (offset === 1 ? 'de mañana' : 'de pasado mañana');
            showModal(`
                <div class="modal-title">+ Evento ${titleSuffix}</div>
                <div class="modal-label">Hora</div>
                <input id="planner-item-time" class="modal-input" type="time" value="${defaultTime}">
                <div class="modal-label">Título</div>
                <input id="planner-item-title" class="modal-input" type="text" placeholder="¿Qué vas a hacer?">
                <div class="modal-label">Notas (opcional)</div>
                <textarea id="planner-item-notes" class="modal-input" rows="2" placeholder="Detalles adicionales..."></textarea>
                <button class="btn-modal-primary" onclick="savePlannerItem(${offset})">Añadir a la timeline</button>
            `);
            setTimeout(() => document.getElementById('planner-item-title')?.focus(), 50);
        }

        async function savePlannerItem(offset = plannerDayOffset) {
            const time = document.getElementById('planner-item-time')?.value || '';
            const title = document.getElementById('planner-item-title')?.value.trim() || '';
            const notes = document.getElementById('planner-item-notes')?.value.trim() || '';
            if (!time || !title) { showToast('Indica al menos hora y título', true); return; }

            plannerItemsForOffset(offset).push({
                id: 'planner_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                time, title, notes, done: false
            });
            closeModal();
            if (currentView === 'planner') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deletePlannerItem(id, offset = plannerDayOffset) {
            const key = currentPlannerDayKey(new Date(), offset);
            resetDayPlannerIfNeeded();
            if (Array.isArray(dayPlanner.days[key])) {
                dayPlanner.days[key] = dayPlanner.days[key].filter(it => it.id !== id);
            }
            if (currentView === 'planner') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function togglePlannerItemDone(id, offset = plannerDayOffset) {
            const item = plannerItemsForOffset(offset).find(it => it.id === id);
            if (!item) return;
            item.done = !item.done;

            // Al completarla, queda constancia como evento en el calendario
            // (con la fecha real en que se completó); al desmarcarla, se retira.
            const doneEntryId = 'planner_done_' + item.id;
            entries = entries.filter(e => e.id !== doneEntryId);
            if (item.done) {
                entries.push({
                    id: doneEntryId,
                    type: 'event',
                    eventType: 'otro',
                    title: 'Completado: ' + item.title,
                    date: todayISO(),
                    time: item.time || '',
                    place: '',
                    notes: item.notes || '',
                    category: 'Planificador',
                    calendarLog: true
                });
            }
            filteredEntries = [...entries];

            if (currentView === 'planner') render();
            else if (currentView === 'calendar' || currentView === 'home') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // ------------------------------------------------------------
        //  TAREAS RECURRENTES (diaria / semanal / mensual)
        // ------------------------------------------------------------
        const RECURRING_FREQ_LABELS = { diaria: 'Todos los días', semanal: 'Cada semana', mensual: 'Cada mes' };
        const RECURRING_WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

        function isRecurringTaskDueToday(task, dateStr = todayISO()) {
            if (!task.activo) return false;
            const d = new Date(dateStr + 'T12:00:00');
            if (task.frecuencia === 'diaria') return true;
            if (task.frecuencia === 'semanal') {
                const dias = Array.isArray(task.diasSemana) && task.diasSemana.length ? task.diasSemana : [task.diaSemana];
                return dias.includes(d.getDay());
            }
            if (task.frecuencia === 'mensual') return d.getDate() === task.diaMes;
            if (task.frecuencia === 'intervalo') {
                if (!task.intervaloInicio || !(task.intervaloDias > 0)) return false;
                const start = new Date(task.intervaloInicio + 'T12:00:00');
                const diffDays = Math.round((d - start) / 86400000);
                return diffDays >= 0 && diffDays % task.intervaloDias === 0;
            }
            return false;
        }

        function recurringTasksDueToday() {
            const today = todayISO();
            return recurringTasks.filter(t => isRecurringTaskDueToday(t, today));
        }

        async function toggleRecurringTaskDoneToday(id) {
            const task = recurringTasks.find(t => t.id === id);
            if (!task) return;
            const today = todayISO();
            task.completadas = task.completadas || {};
            task.completadas[today] = !task.completadas[today];

            // Igual que con los eventos del planificador: cada día que se
            // completa una recurrente queda su propio evento en el calendario.
            const doneEntryId = 'recurring_done_' + task.id + '_' + today;
            entries = entries.filter(e => e.id !== doneEntryId);
            if (task.completadas[today]) {
                entries.push({
                    id: doneEntryId,
                    type: 'event',
                    eventType: 'otro',
                    title: 'Completado: ' + task.texto,
                    date: today,
                    time: '',
                    place: '',
                    notes: 'Tarea recurrente',
                    category: 'Tareas recurrentes',
                    calendarLog: true
                });
            }
            filteredEntries = [...entries];

            if (currentView === 'planner') render();
            else if (currentView === 'calendar' || currentView === 'home') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openManageRecurringTasks() {
            showModal(`
                <div class="modal-title">Tareas recurrentes</div>
                <div style="font-size:11px;color:var(--text-secondary);margin-bottom:14px">Se repiten solas cada día/semana/mes; marcarlas hecha un día no las completa para siempre.</div>
                <div class="modal-label">Texto</div>
                <input id="recurring-texto" class="modal-input" placeholder="Ej: Sacar la basura">
                <div class="modal-label">Frecuencia</div>
                <select id="recurring-frecuencia" class="modal-input" onchange="updateRecurringFreqFields()">
                    <option value="diaria">Todos los días</option>
                    <option value="semanal">Días concretos de la semana</option>
                    <option value="mensual">Cada mes</option>
                    <option value="intervalo">Cada N días</option>
                </select>
                <div id="recurring-freq-extra"></div>
                <button class="btn-modal-primary" onclick="saveRecurringTask()">Añadir</button>
                <div class="modal-label" style="margin-top:18px">Ya creadas</div>
                <div id="recurring-tasks-list">${renderRecurringTasksManageList()}</div>
            `);
            updateRecurringFreqFields();
        }

        function updateRecurringFreqFields() {
            const freq = document.getElementById('recurring-frecuencia')?.value;
            const extra = document.getElementById('recurring-freq-extra');
            if (!extra) return;
            if (freq === 'semanal') {
                extra.innerHTML = `
                    <div class="modal-label">Días de la semana</div>
                    <div class="recurring-weekday-picker">
                        ${RECURRING_WEEKDAY_LABELS.map((label, i) => `
                            <label class="recurring-weekday-chip">
                                <input type="checkbox" class="recurring-dia-semana-check" value="${i}" ${i === 1 ? 'checked' : ''}>
                                ${label.slice(0, 3)}
                            </label>`).join('')}
                    </div>`;
            } else if (freq === 'mensual') {
                extra.innerHTML = `
                    <div class="modal-label">Día del mes</div>
                    <input id="recurring-dia-mes" type="number" min="1" max="31" class="modal-input" value="1">`;
            } else if (freq === 'intervalo') {
                extra.innerHTML = `
                    <div class="modal-label">Cada cuántos días</div>
                    <input id="recurring-intervalo-dias" type="number" min="2" max="365" class="modal-input" value="2">
                    <div class="modal-label">A partir de</div>
                    <input id="recurring-intervalo-inicio" type="date" class="modal-input" value="${todayISO()}">`;
            } else {
                extra.innerHTML = '';
            }
        }

        function renderRecurringTasksManageList() {
            if (!recurringTasks.length) return '<div style="font-size:12px;color:var(--text-secondary);padding:6px 0">Sin tareas recurrentes todavía.</div>';
            return recurringTasks.map(t => {
                let detalle = RECURRING_FREQ_LABELS[t.frecuencia] || '';
                if (t.frecuencia === 'semanal') {
                    const dias = Array.isArray(t.diasSemana) && t.diasSemana.length ? t.diasSemana : [t.diaSemana];
                    detalle = dias.map(d => RECURRING_WEEKDAY_LABELS[d]).join(', ');
                }
                if (t.frecuencia === 'mensual') detalle = `Día ${t.diaMes} de cada mes`;
                if (t.frecuencia === 'intervalo') detalle = `Cada ${t.intervaloDias} días desde ${t.intervaloInicio}`;
                return `
                    <div class="friend-list-item">
                        <span class="friend-list-name" style="${t.activo ? '' : 'opacity:.5;text-decoration:line-through'}">${escapeHtml(t.texto)} <span style="color:var(--text-secondary);font-weight:400">— ${detalle}</span></span>
                        <span style="display:flex;gap:6px">
                            <button class="btn-secondary" style="padding:4px 10px;font-size:11px" onclick="toggleRecurringTaskActiveState('${t.id}')">${t.activo ? 'Pausar' : 'Reactivar'}</button>
                            <button class="friend-remove-btn" title="Eliminar" onclick="deleteRecurringTask('${t.id}')">✕</button>
                        </span>
                    </div>`;
            }).join('');
        }

        async function saveRecurringTask() {
            const texto = document.getElementById('recurring-texto')?.value.trim();
            const frecuencia = document.getElementById('recurring-frecuencia')?.value;
            if (!texto) { showToast('Escribe el texto de la tarea', true); return; }
            const task = {
                id: 'rt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                texto, frecuencia, activo: true, completadas: {}
            };
            if (frecuencia === 'semanal') {
                const dias = [...document.querySelectorAll('.recurring-dia-semana-check:checked')].map(el => parseInt(el.value));
                task.diasSemana = dias.length ? dias : [1];
            }
            if (frecuencia === 'mensual') task.diaMes = parseInt(document.getElementById('recurring-dia-mes')?.value) || 1;
            if (frecuencia === 'intervalo') {
                task.intervaloDias = parseInt(document.getElementById('recurring-intervalo-dias')?.value) || 2;
                task.intervaloInicio = document.getElementById('recurring-intervalo-inicio')?.value || todayISO();
            }
            recurringTasks.push(task);
            document.getElementById('recurring-texto').value = '';
            const list = document.getElementById('recurring-tasks-list');
            if (list) list.innerHTML = renderRecurringTasksManageList();
            if (currentView === 'planner') render();
            try { await saveData(); showToast('Tarea recurrente añadida'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function toggleRecurringTaskActiveState(id) {
            const t = recurringTasks.find(x => x.id === id);
            if (!t) return;
            t.activo = !t.activo;
            const list = document.getElementById('recurring-tasks-list');
            if (list) list.innerHTML = renderRecurringTasksManageList();
            if (currentView === 'planner') render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteRecurringTask(id) {
            if (!confirm('¿Eliminar esta tarea recurrente?')) return;
            recurringTasks = recurringTasks.filter(t => t.id !== id);
            const list = document.getElementById('recurring-tasks-list');
            if (list) list.innerHTML = renderRecurringTasksManageList();
            if (currentView === 'planner') render();
            try { await saveData(); showToast('Tarea recurrente eliminada'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // ============================================================
        //  HÁBITOS
        //  Seguimiento de constancia deliberadamente sin puntos, insignias
        //  ni rachas destacadas en rojo/fuego: solo una cuadrícula discreta
        //  de los últimos días y un número de racha en texto normal.
        // ============================================================
        function habitStreak(habit, dateStr = todayISO()) {
            let streak = 0;
            let d = new Date(dateStr + 'T12:00:00');
            while (true) {
                const iso = d.toISOString().slice(0, 10);
                if (habit.completadas?.[iso]) { streak++; d.setDate(d.getDate() - 1); }
                else break;
            }
            return streak;
        }

        function renderHabitDots(habit, days = 14) {
            const cells = [];
            const d = new Date();
            for (let i = days - 1; i >= 0; i--) {
                const dd = new Date(d);
                dd.setDate(dd.getDate() - i);
                const iso = dd.toISOString().slice(0, 10);
                cells.push(`<span class="habit-dot ${habit.completadas?.[iso] ? 'on' : ''}" title="${iso}"></span>`);
            }
            return `<div class="habit-dots">${cells.join('')}</div>`;
        }

        function renderHabits() {
            return `
            <div style="max-width:640px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                    <div style="font-size:20px;font-weight:700;color:var(--text-primary)">Hábitos</div>
                    <button class="btn-modal-primary" style="width:auto" onclick="openAddHabit()">+ Hábito</button>
                </div>
                <div style="color:var(--text-secondary);margin-bottom:20px;font-size:12.5px">Solo para llevar la cuenta, sin presión. Marca el día cuando lo hagas.</div>
                ${habits.length ? habits.filter(h => h.activo !== false).map(h => {
                    const today = todayISO();
                    const streak = habitStreak(h);
                    return `
                    <div class="habit-card">
                        <div class="habit-card-head">
                            <label class="habit-check-row">
                                <input type="checkbox" ${h.completadas?.[today] ? 'checked' : ''} onchange="toggleHabitToday('${h.id}')">
                                <span>${escapeHtml(h.texto)}</span>
                            </label>
                            <span class="habit-menu" onclick="openHabitMenu('${h.id}')">⋯</span>
                        </div>
                        ${renderHabitDots(h)}
                        <div class="habit-streak-text">${streak > 0 ? `Racha: ${streak} día${streak === 1 ? '' : 's'}` : 'Sin racha activa'}</div>
                    </div>`;
                }).join('') : `<div class="empty-state"><div class="empty-title">Sin hábitos todavía</div><div class="empty-sub">Pulsa + Hábito para empezar a seguir alguno, sin más presión que la cuadrícula.</div></div>`}
            </div>`;
        }

        function openAddHabit() {
            showModal(`
                <div class="modal-title">+ Hábito</div>
                <div class="modal-label">¿Qué quieres seguir?</div>
                <input id="habit-texto" class="modal-input" placeholder="Ej: Leer 10 minutos">
                <button class="btn-modal-primary" onclick="saveHabit()">Añadir</button>
            `);
            setTimeout(() => document.getElementById('habit-texto')?.focus(), 50);
        }

        async function saveHabit() {
            const texto = document.getElementById('habit-texto')?.value.trim();
            if (!texto) { showToast('Escribe el hábito', true); return; }
            habits.push({ id: 'habit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), texto, activo: true, completadas: {} });
            closeModal();
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function toggleHabitToday(id) {
            const h = habits.find(x => x.id === id);
            if (!h) return;
            const today = todayISO();
            h.completadas = h.completadas || {};
            h.completadas[today] = !h.completadas[today];
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openHabitMenu(id) {
            const h = habits.find(x => x.id === id);
            if (!h) return;
            showModal(`
                <div class="modal-title">${escapeHtml(h.texto)}</div>
                <button class="btn-secondary" onclick="toggleHabitActiveState('${id}')">${h.activo === false ? 'Reactivar' : 'Pausar'}</button>
                <button class="btn-secondary" style="margin-top:8px;color:#dc2626" onclick="deleteHabit('${id}')">Eliminar hábito</button>
            `);
        }

        async function toggleHabitActiveState(id) {
            const h = habits.find(x => x.id === id);
            if (!h) return;
            h.activo = h.activo === false ? true : false;
            closeModal();
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteHabit(id) {
            if (!confirm('¿Eliminar este hábito? Se pierde su historial.')) return;
            habits = habits.filter(h => h.id !== id);
            closeModal();
            render();
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
                                
                                <div class="finance-metric-value">${financeMoney(t.total)}</div>
                                <div class="finance-metric-label">${escapeHtml(t.cat.name)}</div>
                                <div class="finance-metric-note">${t.count} objeto${t.count === 1 ? '' : 's'}</div>
                            </div>
                        `).join('')}
                        <div class="finance-metric-card collectibles-total-card">
                            
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
                fields+=renderGoalLinkedProjects(entry.id,entry.title||'');
                if(entry.tags?.length)fields+=detailField('Etiquetas',entry.tags.map(t=>escapeHtml(t)).join(' · '));
                if(entry.notes)fields+=detailField('Notas',linkifyText(entry.notes));
            }else if(entry.type==='work'){
                if(entry.company)fields+=detailField('Empresa',escapeHtml(entry.company));
                if(entry.position)fields+=detailField('Cargo',escapeHtml(entry.position));
                const modalidadLabel=WORK_MODALIDAD_LABELS[entry.modalidad]||'';
                if(modalidadLabel)fields+=detailField('Modalidad',modalidadLabel);
                fields+=detailField('Fechas',escapeHtml((entry.startDate||'')+(entry.endDate?' → '+entry.endDate:' → Actual')));
                if(entry.schedule)fields+=detailField('Horario',escapeHtml(entry.schedule));
                if(entry.salary)fields+=detailField('Salario',entry.salary+'€/mes');
                if(entry.logros)fields+=detailField('Logros / aprendizajes',linkifyText(entry.logros));
                if(entry.endDate&&entry.motivoSalida)fields+=detailField('Motivo de salida',escapeHtml(entry.motivoSalida));
                if(entry.notes)fields+=detailField('Notas',linkifyText(entry.notes));
                fields+=`<div class="entry-detail-field work-docs-section" style="grid-column:1/-1">
                    <div class="entry-detail-label">Documentos (contratos, nóminas...)</div>
                    <button class="btn-secondary" style="width:auto;margin-bottom:10px" onclick="document.getElementById('work-doc-input-${entry.id}').click()">+ Subir documento</button>
                    <input type="file" id="work-doc-input-${entry.id}" accept="application/pdf" style="display:none" onchange="handleWorkDocUpload(event,'${entry.id}')">
                    <div id="work-doc-list-${entry.id}">Cargando documentos...</div>
                </div>`;
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
            return `<div class="modal-overlay" onclick="if(event.target===this)closeModal()"><div class="modal-sheet entry-detail-card">${detailExternalBtn}<div class="modal-title${detailExternalUrl ? ' entry-detail-title-with-external' : ''}">${escapeHtml(entry.title||label)}</div><div style="font-size:11px;color:var(--text-secondary)">${label}</div><div class="entry-detail-grid">${fields||detailField('Información','Sin información adicional')}</div>${renderBacklinksBlock(entry.id, entry.type==='goal' ? ['project'] : null)}<div class="entry-detail-actions"><button class="btn-modal-primary" onclick="openEditEntry('${entry.id}')">Editar</button><button class="btn-secondary" style="width:auto" onclick="deleteEntry('${entry.id}')">Eliminar</button><button class="btn-secondary" style="width:auto" onclick="closeModal()">Cerrar</button>${recomendarBtn}</div></div></div>`;
        }
        function openEntryDetail(id){const entry=entries.find(e=>e.id===id);if(!entry)return;if(entry.type==='travel'){switchView('travels');openTripManager(id);return;}document.getElementById('modal-container').innerHTML=renderEntryDetailModal(entry);if(entry.type==='work')loadWorkDocuments(entry.id);}
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
        function renderBacklinksBlock(entryId, excludeTypes) {
            let backlinks = getBacklinks(entryId);
            if (excludeTypes) backlinks = backlinks.filter(e => !excludeTypes.includes(e.type));
            if (!backlinks.length) return '';
            return `
                <div class="modal-label">Enlazado desde</div>
                <div class="backlinks-list">
                    ${backlinks.map(b => `
                        <div class="backlink-item" onclick="openEntryFromLink('${b.id}')">
                            <span>${escapeHtml(b.title)}</span>
                        </div>
                    `).join('')}
                </div>`;
        }

        function renderEntryModal(type, entry) {
            const isEdit = !!entry;
            const today = new Date().toISOString().slice(0, 10);
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
                    <div class="modal-label">Modalidad</div>
                    <select id="modal-modalidad" class="modal-input">
                        <option value="" ${isEdit && entry.modalidad ? '' : 'selected'}>Sin especificar</option>
                        <option value="presencial" ${isEdit && entry.modalidad === 'presencial' ? 'selected' : ''}>Presencial</option>
                        <option value="hibrido" ${isEdit && entry.modalidad === 'hibrido' ? 'selected' : ''}>Híbrido</option>
                        <option value="remoto" ${isEdit && entry.modalidad === 'remoto' ? 'selected' : ''}>Remoto</option>
                    </select>
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
                    <div class="modal-label">Logros / lo que aprendiste (opcional)</div>
                    <textarea id="modal-logros" class="modal-input" rows="2" placeholder="Ej: Lideré la migración del almacén al nuevo sistema...">${isEdit ? entry.logros || '' : ''}</textarea>
                    <div class="modal-label">Motivo de salida (opcional)</div>
                    <input id="modal-motivo-salida" class="modal-input" value="${isEdit ? entry.motivoSalida || '' : ''}" placeholder="Ej: Fin de contrato, cambio voluntario...">
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
                        ${Object.keys(EVENT_TYPE_LABELS).map(t => `<option value="${t}" ${isEdit && entry.eventType === t ? 'selected' : ''}>${EVENT_TYPE_LABELS[t]}</option>`).join('')}
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
                    ${financePro.enabled ? `
                    <div class="modal-label">Cuenta PRO a la que se carga</div>
                    <select id="modal-recurring-account" class="modal-input">
                        <option value="">No registrar como movimiento PRO</option>
                        ${FINANCE_PRO_ACCOUNT_KEYS.map(k => `<option value="${k}" ${isEdit && entry.proAccount === k ? 'selected' : ''}>${escapeHtml(financePro.accounts[k].name)}</option>`).join('')}
                    </select>
                    <div class="finance-modal-note">Si eliges una cuenta, este cargo se registrará solo como movimiento PRO el día indicado de cada mes.</div>` : ''}
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
                        ${title}
                        <button class="modal-close" onclick="closeModal()">✕</button>
                    </div>

                    <div class="modal-label">Título</div>
                    <input id="modal-title" class="modal-input" value="${isEdit ? entry.title : ''}" placeholder="Escribe un título...">

                    ${extraFields}

                    <div class="modal-label">Etiquetas (separadas por comas)</div>
                    <input id="modal-tags" class="modal-input" value="${isEdit ? (entry.tags || []).join(', ') : ''}" placeholder="p.ej. urgente, 2026, personal">

                    <div class="wikilink-hint">Consejo: escribe [[ en las notas y elige de la lista para enlazar otra entrada.</div>
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
                entry.modalidad = document.getElementById('modal-modalidad')?.value || '';
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
                entry.logros = document.getElementById('modal-logros')?.value?.trim() || '';
                entry.motivoSalida = document.getElementById('modal-motivo-salida')?.value?.trim() || '';
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
                if (financePro.enabled) entry.proAccount = document.getElementById('modal-recurring-account')?.value || '';
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
                financeIncome, financeProfile, financePro, plannedTrips, weeklyTasks, cultureLists, habits,
                collectibleCategories, collectibles, dayPlanner, recurringTasks, dailyEffort, studies, links,
                linkCategories, blurFinances, apuntes,
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
            if (data.financePro) financePro = data.financePro;
            if (data.plannedTrips) plannedTrips = data.plannedTrips;
            if (data.weeklyTasks) weeklyTasks = Array.isArray(data.weeklyTasks) ? data.weeklyTasks : [];
            if (data.cultureLists) cultureLists = Array.isArray(data.cultureLists) ? data.cultureLists : [];
            if (data.habits) habits = Array.isArray(data.habits) ? data.habits : [];
            if (data.collectibleCategories) collectibleCategories = data.collectibleCategories;
            if (data.collectibles) collectibles = data.collectibles;
            if (data.dayPlanner) dayPlanner = migratePlannerData(data.dayPlanner);
            if (data.recurringTasks) recurringTasks = Array.isArray(data.recurringTasks) ? data.recurringTasks : [];
            if (data.dailyEffort) dailyEffort = (typeof data.dailyEffort === 'object') ? data.dailyEffort : {};
            if (data.studies) studies = data.studies;
            if (data.links) links = data.links;
            if (data.linkCategories) linkCategories = data.linkCategories;
            if (typeof data.blurFinances === 'boolean') blurFinances = data.blurFinances;
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
        //  RENDER
        // ============================================================
        function render() {
            invalidateLinkableIndex();
            const content = document.getElementById('content');
            if (currentView === 'calendar') content.innerHTML = renderCalendar();
            else if (currentView === 'home') content.innerHTML = renderHome();
            else if (currentView === 'culture') content.innerHTML = renderCulture();
            else if (currentView === 'travels') { content.innerHTML = renderTravels();
                if (window._openTripId && tripManagerTab === 'documentos') loadTripDocuments(window._openTripId);
                if (window._openTripId && tripManagerTab === 'mapa') { const t = getTrip(window._openTripId); if (t) setTimeout(() => initTripMap(t), 0); } }
            else if (currentView === 'work') content.innerHTML = renderWork();
            else if (currentView === 'projects') content.innerHTML = renderProjects();
            else if (currentView === 'events') content.innerHTML = renderEvents();
            else if (currentView === 'documents') { content.innerHTML = renderDocuments();
                loadDocuments(); loadBackups(); renderBackupFailureBanner(); } else if (currentView === 'finances') { content.innerHTML = renderFinances();
                requestAnimationFrame(animateFinanceProChartPanel); }
            else if (currentView === 'tags') content.innerHTML = renderTagsView();
            else if (currentView === 'graph') content.innerHTML = renderGraph();
            else if (currentView === 'vault') content.innerHTML = renderVault();
            else if (currentView === 'notes') content.innerHTML = renderNotes();
            else if (currentView === 'goals') content.innerHTML = renderGoals();
            else if (currentView === 'planner') content.innerHTML = renderPlanner();
            else if (currentView === 'habits') content.innerHTML = renderHabits();
            else if (currentView === 'collectibles') content.innerHTML = renderCollectibles();
            else if (currentView === 'friends') { content.innerHTML = renderFriendsView();
                loadFriendsViewData(); }
            else if (currentView === 'studies') content.innerHTML = renderStudies();
            else if (currentView === 'links') content.innerHTML = renderLinks();
            else if (currentView === 'suggestions') { content.innerHTML = renderSuggestions(); loadMySuggestions(); }
            else if (currentView === 'settings') { content.innerHTML = renderSettings();
                if (typeof pwaSyncInstallButton === 'function') pwaSyncInstallButton();
                loadSettingsSubscriptionInfo();
                loadSettingsPushInfo(); }
            updateAddButton();
            updateFabIcon();

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
                if (isCalendarLogEntry(e)) return;
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
        // Puntuación de esfuerzo (1-5) por día: cuánto te esforzaste ese día
        // en cumplir tus objetivos. Es la forma de "categorizar" cada día
        // desde este mismo calendario — se puntúa haciendo clic en su
        // casilla mientras la vista de esfuerzo está activa.
        let dailyEffort = {};
        let yearCalEffortMode = false;

        function abrirCalendarioAnual() {
            yearCalYear = new Date().getFullYear();
            yearCalCompareMode = false;
            yearCalEffortMode = false;
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

        const YEAR_CAL_MODE_CLASSES = ['year-dot-worked', 'year-dot-travel', 'year-dot-worked-travel',
            'year-dot-square', 'year-dot-effort-none', 'year-dot-effort-1', 'year-dot-effort-2', 'year-dot-effort-3', 'year-dot-effort-4', 'year-dot-effort-5'];

        // No se regenera todo el modal (eso crearía puntos nuevos de cero y
        // el cambio se vería como un salto brusco): se cambian las clases de
        // cada punto ya existente en su sitio, así la transición CSS de
        // .year-dot (color de fondo/borde/forma) anima de verdad entre una
        // vista y otra en vez de saltar de golpe — incluida la transición
        // círculo-cuadrado del modo esfuerzo.
        function applyYearCalDotStates() {
            document.querySelectorAll('.year-cal-grid-wrap .year-dot[title]').forEach(dot => {
                const dateStr = dot.getAttribute('title');
                const esFuturo = dot.classList.contains('year-dot-future');
                dot.classList.remove(...YEAR_CAL_MODE_CLASSES);
                dot.onclick = null;
                if (yearCalEffortMode) {
                    dot.classList.add('year-dot-square');
                    if (!esFuturo) {
                        const score = dailyEffort[dateStr] || 0;
                        dot.classList.add(score > 0 ? 'year-dot-effort-' + score : 'year-dot-effort-none');
                        dot.onclick = () => openDailyEffortPicker(dateStr);
                    }
                } else if (yearCalCompareMode) {
                    const cls = claseCompareDot(esDiaTrabajado(dateStr), esDiaDeViaje(dateStr));
                    if (cls) dot.classList.add(cls);
                }
            });
            document.querySelector('.year-cal-compare-btn')?.classList.toggle('active', yearCalCompareMode);
            document.querySelector('.year-cal-effort-btn')?.classList.toggle('active', yearCalEffortMode);
            const legend = document.querySelector('.year-cal-legend');
            if (legend) legend.innerHTML = renderYearCalLegendHtml();
        }

        function toggleYearCalCompare() {
            yearCalCompareMode = !yearCalCompareMode;
            if (yearCalCompareMode) yearCalEffortMode = false;
            applyYearCalDotStates();
        }

        function toggleYearCalEffort() {
            yearCalEffortMode = !yearCalEffortMode;
            if (yearCalEffortMode) yearCalCompareMode = false;
            applyYearCalDotStates();
        }

        function renderYearCalLegendHtml() {
            if (yearCalEffortMode) {
                return `
                    <div class="year-cal-legend-item"><span class="year-dot year-dot-square year-dot-effort-none year-cal-legend-dot"></span> Sin puntuar</div>
                    ${[1, 2, 3, 4, 5].map(n => `<div class="year-cal-legend-item"><span class="year-dot year-dot-square year-dot-effort-${n} year-cal-legend-dot"></span> ${n}</div>`).join('')}
                    <div class="year-cal-legend-item"><span class="year-dot year-dot-square year-dot-future year-cal-legend-dot"></span> Día futuro</div>
                `;
            }
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

        // Puntuar el esfuerzo de un día concreto (1-5) — la forma de
        // "categorizar" cada día desde este calendario. Los días futuros no
        // se pueden puntuar (el propio onclick no se añade para ellos).
        function openDailyEffortPicker(dateStr) {
            const current = dailyEffort[dateStr] || 0;
            const fecha = new Date(dateStr + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
            showModal(`
                <div class="modal-title">Esfuerzo — ${escapeHtml(fecha)}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px">¿Cuánto te esforzaste ese día en cumplir tus objetivos?</div>
                <div class="effort-picker-row">
                    ${[1, 2, 3, 4, 5].map(n => `<button class="effort-picker-btn year-dot-effort-${n} ${current === n ? 'active' : ''}" onclick="setDailyEffort('${dateStr}',${n})">${n}</button>`).join('')}
                </div>
                ${current ? `<button class="btn-secondary" style="width:auto;margin-top:14px" onclick="setDailyEffort('${dateStr}',0)">Quitar puntuación</button>` : ''}
            `);
        }

        async function setDailyEffort(dateStr, value) {
            if (value > 0) dailyEffort[dateStr] = value; else delete dailyEffort[dateStr];
            showModal(renderCalendarioAnual());
            try { await saveData(); } catch (e) { console.error('Error guardando el esfuerzo diario:', e); showToast('No se pudo guardar en la nube', true); }
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
                    let onclickAttr = '';
                    if (yearCalEffortMode) {
                        cls += ' year-dot-square';
                        if (!esFuturo) {
                            const score = dailyEffort[dateStr] || 0;
                            cls += score > 0 ? ' year-dot-effort-' + score : ' year-dot-effort-none';
                            onclickAttr = ` onclick="openDailyEffortPicker('${dateStr}')"`;
                        }
                    } else if (yearCalCompareMode) {
                        const compareCls = claseCompareDot(esDiaTrabajado(dateStr), esDiaDeViaje(dateStr));
                        if (compareCls) cls += ' ' + compareCls;
                    }
                    const estiloExtra = esHoy ? ` style="box-shadow:${ANILLO_HOY}"` : '';
                    celdas += `<div class="year-cal-cell"><span class="${cls}" title="${dateStr}"${estiloExtra}${onclickAttr}></span></div>`;
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
                        <button class="year-cal-compare-btn ${yearCalCompareMode ? 'active' : ''}" onclick="toggleYearCalCompare()" title="Comparar trabajado/viaje">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="6.5"/><circle cx="15" cy="12" r="6.5"/></svg>
                        </button>
                        <button class="year-cal-compare-btn year-cal-effort-btn ${yearCalEffortMode ? 'active' : ''}" onclick="toggleYearCalEffort()" title="Esfuerzo diario">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 18v-5"/><path d="M12 18V9"/><path d="M19 18V6"/></svg>
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
            return `<div class="card" style="margin-top:16px;padding:14px 16px">
                <div class="card-title" style="margin-bottom:8px;font-size:12px">En este día, hace...</div>
                <div style="display:flex;flex-direction:column;gap:8px">
                    ${items.map(it => {
                        const anios = anioActual - it.year;
                        return `<div style="display:flex;align-items:baseline;gap:8px;cursor:pointer" onclick="openOnThisDayItem('${it.kind}','${it.id}')">
                            <span style="font-size:10px;font-weight:700;color:var(--text-secondary);white-space:nowrap;min-width:48px">${anios} año${anios === 1 ? '' : 's'}</span>
                            <div style="min-width:0">
                                <div style="font-size:12px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(it.title)}</div>
                                <div style="font-size:10px;color:var(--text-secondary)">${escapeHtml(it.type)}</div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
        }

        function renderCalendar() {
            let html = `<div class="cal-home">`;
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

            html += renderOnThisDayCard();
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
                <span style="font-size:17px;font-weight:600;color:var(--text-primary)">${CAL_MONTH_NAMES[calMonth]} ${calYear}</span>
                <button class="cal-nav-arrow" onclick="changeMonth(1)">›</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px">`;

            dayNames.forEach(d => {
                html +=
                    `<div style="text-align:center;font-size:10px;font-weight:600;text-transform:uppercase;color:var(--text-secondary);padding:6px 0 10px 0">${d}</div>`;
            });

            for (let i = 0; i < offset; i++) {
                const day = daysInPrevMonth - offset + i + 1;
                html +=
                    `<div style="background:transparent;border-radius:16px;padding:6px 4px 8px 4px;min-height:64px;text-align:center;border:1px solid transparent"><span style="font-size:13px;font-weight:600;opacity:0.3;color:var(--text-secondary)">${day}</span></div>`;
            }

            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr =
                    `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const isToday = dateStr === today;
                const isSelected = dateStr === window._selectedDate;
                const dayEntries = entriesByDate[dateStr] || [];

                // Una línea por evento (no una por color distinto) para que
                // el número de líneas refleje cuántos eventos hay ese día,
                // de un vistazo, sin tener que abrirlo.
                const barsHtml = dayEntries.slice(0, 4).map(e => {
                    const cat = categories.find(c => c.id === e.categoryId);
                    const color = cat ? cat.color : 'var(--text-muted)';
                    return `<span style="width:20px;height:3px;border-radius:4px;display:block;background:${color}"></span>`;
                }).join('');

                const extra = dayEntries.length > 4 ?
                    `<span style="width:12px;height:3px;border-radius:4px;display:block;background:var(--text-muted);font-size:7px;text-align:center;color:var(--text-secondary)">+${dayEntries.length - 4}</span>` :
                    '';

                html += `
                <div class="cal-month-cell ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}" onclick="showDayEntries('${dateStr}')">
                    <span style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;color:var(--text-primary)">${d}</span>
                    <div style="display:flex;flex-direction:column;gap:2px;align-items:center">${barsHtml}${extra}</div>
                </div>`;
            }

            const totalDays = offset + daysInMonth;
            const remaining = (7 - (totalDays % 7)) % 7;
            for (let d = 1; d <= remaining; d++) {
                html +=
                    `<div style="background:transparent;border-radius:16px;padding:6px 4px 8px 4px;min-height:64px;text-align:center;border:1px solid transparent"><span style="font-size:13px;font-weight:600;opacity:0.3;color:var(--text-secondary)">${d}</span></div>`;
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
                <span style="font-size:15px;font-weight:600;color:var(--text-primary)">Semana del ${monday.getDate()} de ${CAL_MONTH_NAMES[monday.getMonth()]}</span>
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
                <span class="cal-day-title" style="font-size:15px;font-weight:600;color:var(--text-primary);text-transform:capitalize">${dateLabel}</span>
                <button class="cal-nav-arrow" onclick="changeDay(1)">›</button>
            </div>
            ${body || '<div class="empty-state"><div class="empty-title">Sin entradas</div><div class="empty-sub">No hay nada registrado este día.</div></div>'}`;
        }

        function showDayEntries(date) {
            window._selectedDate = date;
            calSelectedDate = date;
            render();

            const dateObj = new Date(date + 'T12:00:00');
            const weekday = dateObj.toLocaleDateString('es-ES', { weekday: 'long' });
            const restDate = dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
            const all = getDayAllEntries(date);
            const rows = all.length ? renderDayEntryRows(all) : `<div class="empty-state"><div class="empty-title">Sin entradas</div><div class="empty-sub">No hay nada registrado este día.</div></div>`;

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
            closeModal();
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
                if (isCalendarLogEntry(e)) return false;
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
                <div class="entry-item" data-open-entry="${e.id}">
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
                <div class="day-entry-card" data-open-entry="${e.id}">
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
            const events = entries.filter(e => e.type === 'event' && e.date === today && e.linkedKind !== 'exams' && !isCalendarLogEntry(e));
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
                        ${group('Eventos', events, e => `<div class="daily-alert-item" onclick="closeDailyAlert();navigateToEntry('${e.id}')">${escapeHtml(e.title)}${e.time ? ' · ' + escapeHtml(e.time) : ''}</div>`)}
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
        function bitacoraActivityCount(dateISO) {
            let count = 0;
            count += entries.filter(e => e.date === dateISO || e.startDate === dateISO).length;
            count += (Array.isArray(notes) ? notes : []).filter(n => String(n.date || n.createdAt || '').slice(0, 10) === dateISO).length;
            count += (financePro?.transactions || []).filter(t => t.date === dateISO).length;
            return count;
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
                return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${xGuide.toFixed(1)}" y2="${yGuide.toFixed(1)}" stroke="var(--text-primary)" opacity="0.14" stroke-width="1"/>
                    <circle cx="${xGuide.toFixed(1)}" cy="${yGuide.toFixed(1)}" r="${dotR}" fill="var(--text-primary)" opacity="0.28"/>
                    <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${xBar.toFixed(1)}" y2="${yBar.toFixed(1)}" stroke="var(--text-primary)" stroke-width="2" stroke-linecap="round"/>`;
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
            const rows = [
                renderHomeLauncherRow(HOME_ICON_TODAY, 'hoy.', 'openHomeTodayModal()'),
                renderHomeLauncherRow(HOME_ICON_TASKS, 'tareas.', 'openHomeTasksModal()'),
                renderHomeLauncherRow(HOME_ICON_WEEK, 'esta semana.', 'openHomeWeekModal()'),
                renderHomeLauncherRow(HOME_ICON_UPCOMING, 'próximamente.', 'openHomeUpcomingModal()'),
                renderHomeLauncherRow(HOME_ICON_REVIEW, 'revisión semanal.', 'openHomeReviewModal()'),
                renderHomeLauncherRow(HOME_ICON_ACTIVITY, 'actividad.', 'openConstellationView()'),
                renderHomeLauncherRow(HOME_ICON_STATS, 'estadísticas.', 'openHomeStatsModal()'),
                inbox.length ? renderHomeLauncherRow(HOME_ICON_INBOX, 'inbox.', 'openHomeInboxModal()', inbox.length) : '',
                renderHomeLauncherRow(HOME_ICON_BACKUP, 'copia de seguridad.', 'openHomeBackupModal()')
            ].join('');

            return `
            <div style="display:flex;gap:36px;align-items:center;flex-wrap:wrap;max-width:1100px">
                <div style="flex:1 1 360px;min-width:280px">
                    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:2px">${new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>
                    <div style="font-size:20px;font-weight:700;margin-bottom:18px;color:var(--text-primary)">Centro de resumen</div>
                    <div class="home-launcher-list">${rows}</div>
                </div>
                <div class="bitacora-activity-card">
                    <div class="bitacora-activity-title">tu estancia en bitácora.</div>
                    <div class="bitacora-activity-radial">${renderBitacoraActivityRadial(90)}</div>
                </div>
            </div>`;
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
                { id: 'lists', label: 'Listas', icon: '☰', count: cultureLists.length },
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
                ${(!cultureSharedMode && cultureTab === 'movies') ? `
                <button class="btn-secondary" style="width:auto;background:#3b82f6;color:#fff;border-color:#3b82f6" onclick="openLetterboxdImportModal()">Importar Letterboxd</button>
                ` : ''}
                ${(!cultureSharedMode && cultureTab === 'books') ? `
                <button class="btn-secondary" style="width:auto;background:#3b82f6;color:#fff;border-color:#3b82f6" onclick="openGoodreadsImportModal()">Importar Goodreads</button>
                ` : ''}
                ${(!cultureSharedMode && cultureTab === 'series') ? `
                <button class="btn-secondary" style="width:auto;background:#3b82f6;color:#fff;border-color:#3b82f6" onclick="openImdbSeriesImportModal()">Importar IMDb</button>
                ` : ''}
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
            else if (cultureTab === 'lists') html += renderCultureLists();

            html += `</div></div></div>`;
            return html;
        }

        // ------------------------------------------------------------
        //  LISTAS PERSONALIZADAS DE OCIO
        // ------------------------------------------------------------
        const CULTURE_MEDIA_TYPES = ['book', 'movie', 'series', 'game'];

        function renderCultureLists() {
            if (window._selectedCultureList) {
                const list = cultureLists.find(l => l.id === window._selectedCultureList);
                if (!list) { window._selectedCultureList = null; return renderCultureLists(); }
                const items = entries.filter(e => (list.entryIds || []).includes(e.id));
                return `
                <div>
                    <button class="btn-secondary" style="width:auto;margin-bottom:12px" onclick="window._selectedCultureList=null;render()">← Volver a Listas</button>
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap">
                        <div style="font-size:18px;font-weight:700">${escapeHtml(list.name)} · ${items.length}</div>
                        <div style="display:flex;gap:8px">
                            <button class="finance-oneoff-btn" onclick="openCultureListPicker('${list.id}')">+ Añadir</button>
                            <button class="finance-oneoff-btn" onclick="abrirCompartirListaModal('${list.id}')">Compartir</button>
                            <button class="finance-oneoff-btn" style="color:#dc2626" onclick="deleteCultureList('${list.id}')">Eliminar lista</button>
                        </div>
                    </div>
                    ${items.length ? renderMediaCardGrid(items, e => TYPE_LABELS[e.type] || '') : `
                        <div class="finance-empty-state">Lista vacía. Pulsa <strong>+ Añadir</strong> para meter libros, pelis, series o juegos.</div>
                    `}
                </div>`;
            }

            return `
            <div>
                <button class="btn-modal-primary" style="width:auto;margin-bottom:16px" onclick="createCultureList()">+ Nueva lista</button>
                ${renderSharedCultureListsSection()}
                ${cultureLists.length ? `
                    <div style="display:flex;flex-direction:column;gap:2px">
                        ${cultureLists.map(l => `
                            <div class="entry-item" onclick="window._selectedCultureList='${l.id}';render()">
                                <div class="entry-color-dot" style="background:var(--accent)"></div>
                                <div class="entry-info">
                                    <div class="entry-title">${escapeHtml(l.name)}</div>
                                    <div class="entry-meta">${(l.entryIds || []).length} elemento${(l.entryIds || []).length === 1 ? '' : 's'}</div>
                                </div>
                            </div>`).join('')}
                    </div>
                ` : `<div class="finance-empty-state">Aún no tienes listas. Crea una para agrupar tus favoritos, tu "pendiente 2026" o lo que quieras.</div>`}
            </div>`;
        }

        async function createCultureList() {
            const name = prompt('Nombre de la nueva lista');
            if (!name || !name.trim()) return;
            const list = { id: 'clist_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), name: name.trim(), entryIds: [] };
            cultureLists.push(list);
            window._selectedCultureList = list.id;
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteCultureList(id) {
            const list = cultureLists.find(l => l.id === id);
            if (!list || !confirm(`¿Eliminar la lista "${list.name}"? Las entradas no se borran, solo la lista.`)) return;
            cultureLists = cultureLists.filter(l => l.id !== id);
            window._selectedCultureList = null;
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openCultureListPicker(listId) {
            const list = cultureLists.find(l => l.id === listId);
            if (!list) return;
            window._cultureListPickerId = listId;
            // Selección "en borrador": los ticks se acumulan aquí y solo se
            // aplican a la lista real al pulsar "Confirmar", para poder
            // marcar varios elementos seguidos sin que el modal se repinte
            // ni se guarde nada hasta terminar.
            window._cultureListPickerPending = [...(list.entryIds || [])];
            const options = entries.filter(e => CULTURE_MEDIA_TYPES.includes(e.type));
            showModal(`
                <div class="modal-title">Añadir a "${escapeHtml(list.name)}"</div>
                <input id="culture-list-picker-filter" class="modal-input" placeholder="Buscar..." oninput="filterCultureListPicker(this.value)">
                <div id="culture-list-picker-items" style="max-height:340px;overflow-y:auto;margin-top:8px">${renderCultureListPickerItems(options, '')}</div>
                <button class="btn-modal-primary" style="margin-top:12px" onclick="confirmCultureListPicker()">Confirmar</button>
            `);
            setTimeout(() => document.getElementById('culture-list-picker-filter')?.focus(), 50);
        }

        function renderCultureListPickerItems(options, q) {
            const pending = window._cultureListPickerPending || [];
            const filtered = q ? options.filter(e => e.title.toLowerCase().includes(q.toLowerCase())) : options;
            if (!filtered.length) return `<div class="finance-empty-line">Sin resultados</div>`;
            return filtered.map(e => `
                <label class="weekly-task-row">
                    <input type="checkbox" class="weekly-task-check" ${pending.includes(e.id) ? 'checked' : ''} onchange="toggleCultureListEntry('${e.id}')">
                    <span class="weekly-task-text">${escapeHtml(e.title)} <span style="color:var(--text-secondary)">· ${TYPE_LABELS[e.type] || ''}</span></span>
                </label>`).join('');
        }

        function filterCultureListPicker(q) {
            const options = entries.filter(e => CULTURE_MEDIA_TYPES.includes(e.type));
            const el = document.getElementById('culture-list-picker-items');
            if (el) el.innerHTML = renderCultureListPickerItems(options, q);
        }

        // Solo marca/desmarca en el borrador (window._cultureListPickerPending),
        // no toca la lista real todavía.
        function toggleCultureListEntry(entryId) {
            const pending = window._cultureListPickerPending || (window._cultureListPickerPending = []);
            if (pending.includes(entryId)) window._cultureListPickerPending = pending.filter(id => id !== entryId);
            else pending.push(entryId);
        }

        async function confirmCultureListPicker() {
            const list = cultureLists.find(l => l.id === window._cultureListPickerId);
            if (list) list.entryIds = [...(window._cultureListPickerPending || [])];
            window._cultureListPickerPending = null;
            closeModal();
            render();
            try { await saveData(); showToast('Lista actualizada'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // ------------------------------------------------------------
        //  LISTAS DE OCIO COMPARTIDAS ENTRE AMIGOS
        //  Mismo patrón que los viajes compartidos: se manda una foto fija
        //  de la lista (título, tipo y valoración de cada elemento), no una
        //  referencia en vivo, y el destinatario decide si la añade a las
        //  suyas o la descarta.
        // ------------------------------------------------------------
        let listasOcioCompartidas = [];

        async function cargarListasOcioCompartidas() {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) { listasOcioCompartidas = []; return; }
                const { data, error } = await sb.from('listas_ocio_compartidas')
                    .select('id, remitente_id, lista, nota, creado_en')
                    .eq('destinatario_id', user.id)
                    .order('creado_en', { ascending: false });
                if (error) { console.error('Error cargando listas de Ocio compartidas:', error); return; }
                listasOcioCompartidas = data || [];
                if (listasOcioCompartidas.length) {
                    const ids = [...new Set(listasOcioCompartidas.map(l => l.remitente_id))];
                    const { data: publicos } = await sb.from('perfiles_publicos').select('user_id, nombre_publico').in('user_id', ids);
                    const porId = Object.fromEntries((publicos || []).map(p => [p.user_id, p.nombre_publico]));
                    const amigoPorId = Object.fromEntries((amigos || []).map(a => [a.friend_id, a.nombre_visible || a.friend_nombre]));
                    listasOcioCompartidas.forEach(l => { l.remitente_nombre = porId[l.remitente_id] || amigoPorId[l.remitente_id] || 'Un amigo'; });
                }
            } catch (e) {
                console.error('Error cargando listas de Ocio compartidas:', e);
            }
        }

        function abrirCompartirListaModal(listId) {
            const list = cultureLists.find(l => l.id === listId);
            if (!list) return;
            if (!amigos.length) { showToast('Añade primero un amigo desde el apartado Amigos', true); return; }
            showModal(`
                <div class="modal-title">Compartir "${escapeHtml(list.name)}"</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Se enviará tal como está ahora: los títulos, su tipo y tu valoración. Si luego cambias la lista, no se actualizará lo ya enviado.</div>
                <div class="modal-label">Con quién</div>
                <select id="compartir-lista-amigo" class="modal-input">
                    ${amigos.map(a => `<option value="${a.friend_id}">${escapeHtml(a.nombre_visible || a.friend_nombre || 'Amigo')}</option>`).join('')}
                </select>
                <div class="modal-label">Nota (opcional)</div>
                <textarea id="compartir-lista-nota" class="modal-input" rows="3" placeholder="Algo que quieras contarle sobre la lista"></textarea>
                <button class="btn-modal-primary" onclick="enviarListaCompartida('${listId}')">Enviar lista</button>
            `);
        }

        async function enviarListaCompartida(listId) {
            const list = cultureLists.find(l => l.id === listId);
            if (!list) return;
            const destinatarioId = document.getElementById('compartir-lista-amigo')?.value;
            const nota = document.getElementById('compartir-lista-nota')?.value?.trim() || null;
            if (!destinatarioId) { showToast('Elige con quién compartirla', true); return; }
            const { data: { user } } = await sb.auth.getUser();
            if (!user) return;
            const items = entries.filter(e => (list.entryIds || []).includes(e.id))
                .map(e => ({ title: e.title, type: e.type, rating: e.rating || null }));
            if (!items.length) { showToast('Esta lista está vacía', true); return; }
            try {
                const { error } = await sb.from('listas_ocio_compartidas').insert({
                    remitente_id: user.id,
                    destinatario_id: destinatarioId,
                    lista: { name: list.name, items },
                    nota
                });
                if (error) throw error;
                closeModal();
                showToast('Lista compartida');
            } catch (e) {
                console.error('Error compartiendo la lista:', e);
                showToast('No se pudo compartir la lista', true);
            }
        }

        async function quitarListaCompartida(id) {
            listasOcioCompartidas = listasOcioCompartidas.filter(l => l.id !== id);
            if (typeof updateNotifBadge === 'function') updateNotifBadge();
            try {
                const { error } = await sb.from('listas_ocio_compartidas').delete().eq('id', id);
                if (error) console.error('Error quitando la lista compartida en Supabase:', error);
            } catch (e) {
                console.error('Error quitando la lista compartida:', e);
            }
        }

        async function anadirListaCompartidaAMisListas(id) {
            const l = listasOcioCompartidas.find(x => x.id === id);
            if (!l) return;
            const lista = l.lista || {};
            const nuevaLista = { id: 'clist_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), name: lista.name || 'Lista compartida', entryIds: [] };
            (lista.items || []).forEach(item => {
                const entryId = 'entry_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                entries.push({ id: entryId, type: item.type, title: item.title, rating: item.rating || 0, createdAt: new Date().toISOString() });
                nuevaLista.entryIds.push(entryId);
            });
            cultureLists.push(nuevaLista);
            filteredEntries = [...entries];
            try { await saveData(); } catch (e) { console.error(e); }
            await quitarListaCompartida(id);
            render();
            showToast('Lista añadida a las tuyas');
        }

        async function descartarListaCompartida(id) {
            if (!confirm('¿Descartar esta lista compartida?')) return;
            await quitarListaCompartida(id);
            render();
            showToast('Lista descartada');
        }

        function renderSharedCultureListsSection() {
            if (!listasOcioCompartidas.length) return '';
            return `
                <div style="margin-bottom:18px">
                    <div style="font-size:13px;font-weight:600;margin-bottom:8px">Listas compartidas contigo (${listasOcioCompartidas.length})</div>
                    ${listasOcioCompartidas.map(l => {
                        const lista = l.lista || {};
                        const items = lista.items || [];
                        return `
                        <div class="card" style="background:transparent;border-style:dashed;margin-bottom:10px">
                            <div style="font-weight:600">${escapeHtml(lista.name || 'Lista')}</div>
                            <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">De ${escapeHtml(l.remitente_nombre || 'un amigo')} · ${items.length} elemento${items.length === 1 ? '' : 's'}</div>
                            ${l.nota ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${linkifyText(l.nota)}</div>` : ''}
                            <div style="display:flex;gap:8px;margin-top:10px">
                                <button class="btn-modal-primary" style="width:auto" onclick="anadirListaCompartidaAMisListas('${l.id}')">+ Añadir a mis listas</button>
                                <button class="btn-secondary" style="width:auto" onclick="descartarListaCompartida('${l.id}')">Descartar</button>
                            </div>
                        </div>`;
                    }).join('')}
                </div>`;
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
                <div class="media-card media-card-type-${entry.type} ${gold ? 'media-card-gold' : ''}" data-open-entry="${entry.id}">
                    <div class="media-card-icon">${mediaCardIcon(entry.type)}</div>
                    <div class="media-card-title">${escapeHtml(entry.title)}</div>
                    <div class="media-card-meta">${metaLine ? escapeHtml(metaLine) : ''}</div>
                    <div class="media-card-status-slot">${statusContent}</div>
                </div>`;
        }
        function renderMediaCardGrid(items, metaFn, badgeFn) {
            return `<div class="media-card-grid">${items.map(e => renderMediaCard(e, metaFn ? metaFn(e) : '', badgeFn ? badgeFn(e) : '')).join('')}</div>`;
        }

        function openGoodreadsImportModal() {
            showModal(`
                <div class="modal-title">Importar desde Goodreads</div>
                <div class="doc-upload-box" onclick="document.getElementById('goodreads-import-input').click()">
                    <div style="font-weight:500;margin-bottom:4px;color:var(--text-primary)">Elegir archivo CSV</div>
                    <div style="font-size:12px;color:var(--text-secondary)">Goodreads → My Books → Import and export → Export Library</div>
                </div>
                <input type="file" id="goodreads-import-input" accept=".csv,text/csv" style="display:none" onchange="handleGoodreadsImport(event)">
            `);
        }

        // Los libros marcados "to-read" (aún no empezados) se omiten a
        // propósito — importar la pila de pendientes como si fueran lecturas
        // ensuciaría Ocio con libros que en realidad no has tocado todavía,
        // igual que se evitó con la lista de Letterboxd.
        function handleGoodreadsImport(event) {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async function (e) {
                try {
                    const rows = parseCsv(String(e.target.result));
                    if (rows.length < 2) { showToast('El CSV está vacío o no se ha podido leer', true); return; }
                    const header = rows[0].map(h => h.trim());
                    const idx = name => header.indexOf(name);
                    const iTitle = idx('Title');
                    const iAuthor = idx('Author');
                    const iRating = idx('My Rating');
                    const iDateRead = idx('Date Read');
                    const iDateAdded = idx('Date Added');
                    const iShelf = idx('Exclusive Shelf');
                    if (iTitle === -1) { showToast('Este archivo no parece un CSV de Goodreads (falta la columna "Title")', true); return; }

                    let added = 0, duplicates = 0, skippedToRead = 0, errors = 0;
                    for (let r = 1; r < rows.length; r++) {
                        const row = rows[r];
                        const title = (row[iTitle] || '').trim();
                        if (!title) { errors++; continue; }

                        const shelf = iShelf !== -1 ? (row[iShelf] || '').trim() : '';
                        if (shelf === 'to-read') { skippedToRead++; continue; }

                        const dateRead = iDateRead !== -1 ? (row[iDateRead] || '').trim() : '';
                        const dateAdded = iDateAdded !== -1 ? (row[iDateAdded] || '').trim() : '';
                        const endDate = normalizeImportDate(dateRead);
                        // Goodreads no guarda cuándo se EMPEZÓ un libro, solo cuándo
                        // se añadió y cuándo se terminó — se usa la mejor fecha
                        // disponible como fecha de inicio en vez de dejarla vacía.
                        const startDate = endDate || normalizeImportDate(dateAdded);
                        const status = endDate ? 'Completado' : 'Leyendo';
                        const ratingRaw = iRating !== -1 ? parseInt(row[iRating], 10) : NaN;
                        const rating = isNaN(ratingRaw) ? 0 : Math.max(0, Math.min(5, ratingRaw));
                        const author = iAuthor !== -1 ? (row[iAuthor] || '').trim() : '';

                        const normTitle = stripAccents(title.toLowerCase());
                        const isDup = entries.some(en => en.type === 'book' &&
                            stripAccents((en.title || '').toLowerCase()) === normTitle && en.startDate === startDate);
                        if (isDup) { duplicates++; continue; }

                        entries.push({
                            id: 'book_gr_' + Date.now() + '_' + r,
                            type: 'book',
                            title,
                            author,
                            startDate,
                            endDate,
                            date: startDate,
                            status,
                            rating
                        });
                        added++;
                    }

                    closeModal();
                    render();
                    showToast(`Importados ${added} libro${added === 1 ? '' : 's'}` +
                        (duplicates ? ` · ${duplicates} ya existían` : '') +
                        (skippedToRead ? ` · ${skippedToRead} pendientes de leer omitidos` : '') +
                        (errors ? ` · ${errors} fila${errors === 1 ? '' : 's'} con error` : ''));
                    try { await saveData(); } catch (err) { console.error('Error guardando la importación de Goodreads:', err); showToast('No se pudo guardar en la nube', true); }
                } catch (err) {
                    console.error('Error importando CSV de Goodreads:', err);
                    showToast('Error al leer el archivo CSV', true);
                }
            };
            reader.readAsText(file);
        }

        function renderBooks() {
            const allBooks = entries.filter(e => e.type === 'book');
            if (!allBooks.length) {
                return `<div class="empty-state"><div class="empty-title">Sin libros</div><div class="empty-sub">Pulsa el botón + y selecciona "Libro"</div></div>`;
            }
            const { items: books, banner } = applyMonthFilterTo('book', allBooks);
            if (!books.length) return banner + `<div class="empty-state"><div class="empty-title">Sin libros ese mes</div></div>`;

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
        function openLetterboxdImportModal() {
            showModal(`
                <div class="modal-title">Importar desde Letterboxd</div>
                <div class="doc-upload-box" onclick="document.getElementById('letterboxd-import-input').click()">
                    <div style="font-weight:500;margin-bottom:4px;color:var(--text-primary)">Elegir archivo CSV</div>
                    <div style="font-size:12px;color:var(--text-secondary)">Sube tu archivo diary.csv o watched.csv — Letterboxd → Settings → Import & Export → Export Your Data</div>
                </div>
                <input type="file" id="letterboxd-import-input" accept=".csv,text/csv" style="display:none" onchange="handleLetterboxdImport(event)">
            `);
        }

        function renderMovies() {
            const allMovies = entries.filter(e => e.type === 'movie');
            if (!allMovies.length) {
                return `<div class="empty-state"><div class="empty-title">Sin películas</div><div class="empty-sub">Pulsa el botón + y selecciona "Película", o "Importar Letterboxd" arriba</div></div>`;
            }
            const { items: movies, banner } = applyMonthFilterTo('movie', allMovies);
            if (!movies.length) return banner + `<div class="empty-state"><div class="empty-title">Sin películas ese mes</div></div>`;

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
                return new Date(y, mo - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
            };

            let html = banner + `<div>`;
            groups.forEach(g => {
                html += `<div class="media-month-label">${escapeHtml(monthLabel(g.key))}.</div>`;
                html += renderMediaCardGrid(g.items, m => m.date || 'Sin fecha');
            });
            html += `</div>`;
            return html;
        }

        // Parser CSV mínimo pero correcto: entiende campos entre comillas con
        // comas dentro (habitual en títulos de película, p.ej. "Paris, Texas")
        // y comillas escapadas como "" — un split(',') simple los rompería.
        function parseCsv(text) {
            const rows = [];
            let row = [], field = '', inQuotes = false;
            for (let i = 0; i < text.length; i++) {
                const c = text[i];
                if (inQuotes) {
                    if (c === '"') {
                        if (text[i + 1] === '"') { field += '"'; i++; }
                        else inQuotes = false;
                    } else field += c;
                } else if (c === '"') inQuotes = true;
                else if (c === ',') { row.push(field); field = ''; }
                else if (c === '\r') { /* ignorar, el salto real es \n */ }
                else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
                else field += c;
            }
            if (field.length || row.length) { row.push(field); rows.push(row); }
            return rows.filter(r => r.some(f => f !== ''));
        }

        // Normaliza una fecha de un CSV externo a AAAA-MM-DD. No todos usan
        // guiones: Goodreads, por ejemplo, exporta con barras ("2024/03/12").
        // Devuelve cadena vacía si no reconoce el formato, en vez de intentar
        // adivinar y arriesgarse a una fecha incorrecta.
        function normalizeImportDate(raw) {
            const s = (raw || '').trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
            const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(s);
            return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
        }

        // Importador de Letterboxd: acepta tanto diary.csv (fecha real de
        // visionado + valoración) como watched.csv (solo título/fecha, sin
        // valorar) — busca las columnas por nombre en la cabecera en vez de
        // por posición fija, así vale para cualquiera de los dos archivos
        // del export oficial de Letterboxd sin pedir dos importadores
        // distintos. Duplicados = mismo título (sin acentos/mayúsculas) y
        // misma fecha ya existentes, para poder reimportar sin duplicar.
        function handleLetterboxdImport(event) {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async function (e) {
                try {
                    const rows = parseCsv(String(e.target.result));
                    if (rows.length < 2) { showToast('El CSV está vacío o no se ha podido leer', true); return; }

                    // Letterboxd exporta dos formatos muy distintos con la
                    // misma extensión .csv:
                    //  - diary.csv / watched.csv: una sola cabecera en la
                    //    primera línea (Date, Name, Rating, Watched Date...).
                    //  - la exportación de una LISTA propia: empieza con una
                    //    línea de título ("Letterboxd list export v7"),
                    //    luego una cabecera+fila con los metadatos de la
                    //    lista (nombre, fecha de creación...), y solo DESPUÉS
                    //    la cabecera real de las películas de la lista
                    //    (Position, Name, Year, URL...). Si se coge la
                    //    primera línea como cabecera aquí, se importa basura.
                    // Se detecta buscando la cabecera de items (contiene
                    // "Position" y "Name" a la vez) en vez de asumir que
                    // siempre está en la primera fila.
                    const isListExport = /letterboxd list export/i.test(rows[0][0] || '');
                    let headerRowIndex = 0;
                    let listName = '';
                    if (isListExport) {
                        const metaHeaderIdx = rows.findIndex(r => r.includes('Name') && r.includes('Date'));
                        if (metaHeaderIdx !== -1 && rows[metaHeaderIdx + 1]) {
                            listName = (rows[metaHeaderIdx + 1][rows[metaHeaderIdx].indexOf('Name')] || '').trim();
                        }
                        const itemsHeaderIdx = rows.findIndex(r => r.includes('Position') && r.includes('Name'));
                        if (itemsHeaderIdx !== -1) headerRowIndex = itemsHeaderIdx;
                    }

                    const header = rows[headerRowIndex].map(h => h.trim());
                    const idx = name => header.indexOf(name);
                    const iName = idx('Name');
                    const iYear = idx('Year');
                    const iDate = idx('Date');
                    const iWatchedDate = idx('Watched Date');
                    const iRating = idx('Rating');
                    const iUri = idx('Letterboxd URI') !== -1 ? idx('Letterboxd URI') : idx('URL');
                    if (iName === -1) { showToast('Este archivo no parece un CSV de Letterboxd reconocible (falta la columna "Name")', true); return; }

                    let added = 0, duplicates = 0, errors = 0;
                    for (let r = headerRowIndex + 1; r < rows.length; r++) {
                        const row = rows[r];
                        const title = (row[iName] || '').trim();
                        if (!title) { errors++; continue; }

                        const rawDate = (iWatchedDate !== -1 && row[iWatchedDate]) ? row[iWatchedDate] : (iDate !== -1 ? row[iDate] : '');
                        const date = normalizeImportDate(rawDate);
                        const ratingRaw = iRating !== -1 ? parseFloat(row[iRating]) : NaN;
                        const rating = isNaN(ratingRaw) ? 0 : Math.max(0, Math.min(5, Math.round(ratingRaw)));
                        const year = iYear !== -1 ? (row[iYear] || '').trim() : '';
                        const uri = iUri !== -1 ? (row[iUri] || '').trim() : '';

                        const normTitle = stripAccents(title.toLowerCase());
                        const isDup = entries.some(en => en.type === 'movie' &&
                            stripAccents((en.title || '').toLowerCase()) === normTitle && en.date === date);
                        if (isDup) { duplicates++; continue; }

                        entries.push({
                            id: 'movie_lb_' + Date.now() + '_' + r,
                            type: 'movie',
                            title,
                            date,
                            rating,
                            notes: [listName ? `Lista Letterboxd: ${listName}` : '', year ? `Año: ${year}` : '', uri].filter(Boolean).join(' · ')
                        });
                        added++;
                    }

                    closeModal();
                    render();
                    showToast(`Importadas ${added} película${added === 1 ? '' : 's'}` +
                        (duplicates ? ` · ${duplicates} ya existían` : '') +
                        (errors ? ` · ${errors} fila${errors === 1 ? '' : 's'} con error` : ''));
                    try { await saveData(); } catch (err) { console.error('Error guardando la importación de Letterboxd:', err); showToast('No se pudo guardar en la nube', true); }
                } catch (err) {
                    console.error('Error importando CSV de Letterboxd:', err);
                    showToast('Error al leer el archivo CSV', true);
                }
            };
            reader.readAsText(file);
        }

        // ============================================================
        //  RENDER: SERIES
        // ============================================================
        function openImdbSeriesImportModal() {
            showModal(`
                <div class="modal-title">Importar desde IMDb</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px">Series según tus valoraciones de IMDb — de un mismo archivo de valoraciones, solo se cogen las series (se ignoran películas y episodios sueltos).</div>
                <div class="doc-upload-box" onclick="document.getElementById('imdb-series-import-input').click()">
                    <div style="font-weight:500;margin-bottom:4px;color:var(--text-primary)">Elegir archivo CSV</div>
                    <div style="font-size:12px;color:var(--text-secondary)">IMDb → Your Ratings → Export</div>
                </div>
                <input type="file" id="imdb-series-import-input" accept=".csv,text/csv" style="display:none" onchange="handleImdbSeriesImport(event)">
            `);
        }

        // IMDb no tiene un export de "series" aparte: el mismo archivo de
        // valoraciones mezcla películas, series y episodios sueltos, así que
        // se filtra por la columna "Title Type" y solo se importan las de
        // tipo serie (tvSeries/tvMiniSeries) — los episodios sueltos
        // valorados aparte se ignoran para no meter un episodio como si
        // fuera la serie entera.
        function handleImdbSeriesImport(event) {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async function (e) {
                try {
                    const rows = parseCsv(String(e.target.result));
                    if (rows.length < 2) { showToast('El CSV está vacío o no se ha podido leer', true); return; }
                    const header = rows[0].map(h => h.trim());
                    const idx = name => header.indexOf(name);
                    const iTitle = idx('Title');
                    const iRating = idx('Your Rating');
                    const iDateRated = idx('Date Rated');
                    const iType = idx('Title Type');
                    if (iTitle === -1) { showToast('Este archivo no parece un CSV de valoraciones de IMDb (falta la columna "Title")', true); return; }

                    let added = 0, duplicates = 0, skippedNotSeries = 0, errors = 0;
                    for (let r = 1; r < rows.length; r++) {
                        const row = rows[r];
                        const title = (row[iTitle] || '').trim();
                        if (!title) { errors++; continue; }

                        const titleType = iType !== -1 ? (row[iType] || '').trim() : '';
                        if (iType !== -1 && titleType !== 'tvSeries' && titleType !== 'tvMiniSeries') { skippedNotSeries++; continue; }

                        const dateRated = iDateRated !== -1 ? (row[iDateRated] || '').trim() : '';
                        const endDate = normalizeImportDate(dateRated);
                        // IMDb tampoco guarda cuándo se empezó a ver una serie,
                        // solo cuándo se valoró — se usa esa misma fecha de inicio.
                        const startDate = endDate;
                        const status = endDate ? 'Completada' : 'Viendo';
                        const ratingRaw = iRating !== -1 ? parseInt(row[iRating], 10) : NaN;
                        // Escala de IMDb (1-10) a la de Bitácora (0-5).
                        const rating = isNaN(ratingRaw) ? 0 : Math.max(0, Math.min(5, Math.round(ratingRaw / 2)));

                        const normTitle = stripAccents(title.toLowerCase());
                        const isDup = entries.some(en => en.type === 'series' &&
                            stripAccents((en.title || '').toLowerCase()) === normTitle && en.startDate === startDate);
                        if (isDup) { duplicates++; continue; }

                        entries.push({
                            id: 'series_imdb_' + Date.now() + '_' + r,
                            type: 'series',
                            title,
                            startDate,
                            endDate,
                            date: startDate,
                            status,
                            rating
                        });
                        added++;
                    }

                    closeModal();
                    render();
                    showToast(`Importadas ${added} serie${added === 1 ? '' : 's'}` +
                        (duplicates ? ` · ${duplicates} ya existían` : '') +
                        (skippedNotSeries ? ` · ${skippedNotSeries} no eran series` : '') +
                        (errors ? ` · ${errors} fila${errors === 1 ? '' : 's'} con error` : ''));
                    try { await saveData(); } catch (err) { console.error('Error guardando la importación de IMDb:', err); showToast('No se pudo guardar en la nube', true); }
                } catch (err) {
                    console.error('Error importando CSV de IMDb:', err);
                    showToast('Error al leer el archivo CSV', true);
                }
            };
            reader.readAsText(file);
        }

        function renderSeries() {
            const allSeries = entries.filter(e => e.type === 'series');
            if (!allSeries.length) {
                return `<div class="empty-state"><div class="empty-title">Sin series</div><div class="empty-sub">Pulsa el botón + y selecciona "Serie"</div></div>`;
            }
            const { items: series, banner } = applyMonthFilterTo('series', allSeries);
            if (!series.length) return banner + `<div class="empty-state"><div class="empty-title">Sin series ese mes</div></div>`;

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
                return `<div class="empty-state"><div class="empty-title">Sin videojuegos</div><div class="empty-sub">Pulsa el botón + y selecciona "Videojuego"</div></div>`;
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
        const NOTIF_ICON_EVENT = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>';
        const CULTURE_TYPE_TO_TAB = { book: 'books', series: 'series', movie: 'movies', game: 'games' };
        const CULTURE_TYPE_LABEL = { book: 'un libro', series: 'una serie', movie: 'una película', game: 'un videojuego' };

        function computeNotifItems() {
            const items = [];
            // Eventos de hoy — mismos datos que el popup de bienvenida
            // (getTodayAlerts), pero también avisados aquí por si el
            // usuario cerró el popup sin fijarse o entra más tarde.
            const today = todayISO();
            getTodayAlerts().events.forEach(e => {
                items.push({
                    icon: NOTIF_ICON_EVENT,
                    iconClass: 'icon-event',
                    title: e.title,
                    sub: e.time ? `Hoy · ${e.time}` : 'Hoy',
                    date: today + 'T' + (e.time || '00:00'),
                    onClick: () => { closeNotifPanel(); navigateToEntry(e.id); }
                });
            });
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
            (typeof listasOcioCompartidas !== 'undefined' ? listasOcioCompartidas : []).forEach(l => {
                items.push({
                    icon: NOTIF_ICON_TRIP,
                    iconClass: 'icon-trip',
                    title: `${l.remitente_nombre || 'Un amigo'} te compartió una lista`,
                    sub: (l.lista && l.lista.name) || '',
                    date: l.creado_en || '',
                    onClick: () => { closeNotifPanel(); cultureTab = 'lists'; window._selectedCultureList = null; switchView('culture'); }
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
                await Promise.all([cargarSolicitudesAmistad(), cargarRecomendaciones(), cargarViajesCompartidos(), cargarListasOcioCompartidas()]);
                updateNotifBadge();
            } catch (e) {
                console.error('Error actualizando notificaciones:', e);
            }
        }

        function closeNotifPanel() {
            const panel = document.getElementById('notif-panel');
            if (panel) panel.classList.remove('open');
        }

        // Explicaciones del panel de ayuda — se apoyan en NAV_SECTIONS (la
        // misma fuente que usan la barra lateral y el buscador) para no
        // mantener dos listas de apartados por separado. Cada una explica
        // qué se hace ahí, no solo qué es, pensando en quien entra por
        // primera vez y no tiene ni idea de por dónde empezar.
        const HELP_VIEW_DESC = {
            calendar: 'Tu calendario de toda la vida: cambia entre vista de día, semana, mes o año, y toca cualquier día para ver o añadir lo que tengas planeado ese día.',
            home: 'Un resumen de un vistazo: lo próximo que tienes encima, cumpleaños cercanos y accesos directos a lo que más usas — para no tener que ir apartado por apartado.',
            planner: 'La franja horaria de tu día, hora a hora. Tiene pestañas para dejar ya planificados hoy, mañana y pasado mañana, y se vacía sola cada madrugada.',
            notes: 'Una nota de texto libre por día, como un diario — sin campos ni estructura, escribe lo que quieras.',
            events: 'Planes con fecha, hora y lugar: conciertos, citas, quedadas... Puedes añadirlos a mano o importar varios de golpe pegando texto o subiendo un archivo .ics de Google/Apple Calendar.',
            finances: 'Registra cada ingreso y gasto, y sigue tus inversiones — verás tu balance y cómo evoluciona con gráficas.',
            work: 'El historial de tus empleos: empresa, fechas, sueldo, y los documentos de cada uno (contrato, nóminas) guardados dentro.',
            studies: 'Tus asignaturas, con los exámenes de cada una y tus propios apuntes guardados sin salir de Bitácora.',
            documents: 'Un cajón para documentos importantes (DNI, contratos, seguros...), a mano cuando de verdad los necesites.',
            goals: 'Objetivos que quieres cumplir a medio o largo plazo. Puedes vincular cada uno a los proyectos con los que estás trabajando para conseguirlo.',
            projects: 'Proyectos con sus propias tareas: ve marcando lo que completas y verás el progreso de cada proyecto.',
            links: 'Enlaces web guardados por categoría, para no perderlos entre veinte pestañas abiertas.',
            culture: 'Lleva la cuenta de lo que lees, ves y juegas — libros, películas, series y videojuegos — con tu valoración y notas. Se puede importar desde Letterboxd, Goodreads o IMDb.',
            travels: 'Cada viaje con su itinerario día a día y los gastos que vas llevando, para no perder el control fuera de casa.',
            collectibles: 'Un catálogo de tus coleccionables (cartas, videojuegos...) con su valor de mercado actual.',
            friends: 'Añade amigos dentro de Bitácora para recomendaros películas, libros o series entre vosotros, y compartir viajes.',
            tags: 'Todas tus entradas de golpe, filtradas por la etiqueta que elijas — útil cuando sabes qué buscas pero no en qué apartado lo metiste.',
            settings: 'Tu cuenta: exportar o importar tus datos, tu suscripción, el tema claro/oscuro, y el resto de opciones generales.',
        };

        function helpKbd(tecla) {
            return `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:26px;padding:0 9px;border-radius:7px;border:1px solid var(--border-strong);border-bottom-width:2.5px;background:var(--bg-input);font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:var(--text-primary);white-space:nowrap">${tecla}</span>`;
        }

        function openHelpPanel() {
            const movimiento = [
                ['ENTER', 'Abre el buscador «¿Dónde quieres ir?», para saltar a cualquier apartado o entrada sin tocar el ratón.'],
                ['ESPACIO', 'Abre la captura rápida «¿Dónde quieres crear la entrada?», para añadir algo nuevo al instante.'],
                ['ESC', 'Cierra lo que esté abierto (un buscador, un modal...). Si no hay nada abierto, pregunta si quieres cerrar sesión.'],
                ['CTRL + ↑ / ↓', 'Salta al apartado anterior o siguiente del menú, sin usar el ratón.'],
            ];
            const secciones = NAV_SECTIONS.map(s => `
                <div class="help-section-label">${escapeHtml(s.label)}</div>
                <div class="help-item-list">
                    ${s.items.map(it => `
                        <div class="help-item">
                            <div class="help-item-title">${escapeHtml(it.text)}</div>
                            <div class="help-item-desc">${escapeHtml(HELP_VIEW_DESC[it.view] || '')}</div>
                        </div>
                    `).join('')}
                </div>`).join('');

            showModal(`
                <div class="modal-title">Cómo usar Bitácora<button class="modal-close" onclick="closeModal()">✕</button></div>
                <div class="help-section-label" style="color:#3b82f6">Movimiento por Bitácora</div>
                <div class="help-kbd-list">
                    ${movimiento.map(([tecla, texto]) => `
                        <div class="help-kbd-row">
                            ${helpKbd(tecla)}
                            <span class="help-kbd-desc">${texto}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="help-section-label" style="color:#3b82f6;margin-top:22px">Apartados</div>
                ${secciones}
            `);
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
                return `<div class="empty-state"><div class="empty-title">Sin recomendaciones</div><div class="empty-sub">Aquí aparecerá lo que tus amigos te recomienden.</div></div>`;
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
                    <div style="font-size:13px;font-weight:600;margin-bottom:8px">Viajes compartidos contigo (${viajesCompartidos.length})</div>
                    ${viajesCompartidos.map(v => {
                        const viaje = v.viaje || {};
                        return `
                        <div class="trip-card" style="background:transparent;border-style:dashed">
                            <div style="font-weight:700;font-size:15px;color:var(--text-primary)">${escapeHtml(viaje.title || 'Viaje')}</div>
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

        // Icono propio de Viajes — misma familia sólida/geométrica que los
        // iconos de Finanzas (ritmo/largo plazo/metas), a modo de logo fijo
        // para toda tarjeta de viaje.
        const TRAVEL_ICON_MOUNTAIN = '<svg viewBox="0 0 100 80" fill="currentColor"><path d="M4 76 L32 16 C34 12 40 12 42 16 L54 40 L62 28 C64 25 68 25 70 28 L96 76 Z"/></svg>';

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
                        <div style="font-size:20px;font-weight:700">Viajes</div>
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
                    html += `<div class="empty-state"><div class="empty-title">Sin viajes</div><div class="empty-sub">Pulsa el botón + y selecciona "Viaje"</div></div>`;
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
                                        <div style="font-weight:700;font-size:16px;margin-top:6px;color:var(--text-primary)">${escapeHtml(t.title)}</div>
                                        <div style="font-size:13px;color:var(--text-secondary);margin-top:2px">${escapeHtml(t.destination || '')}${t.startDate ? ' · ' + escapeHtml(formatTravelRange(t.startDate, t.endDate)) : ''}</div>
                                    </div>
                                    <div class="trip-card-icon">${TRAVEL_ICON_MOUNTAIN}</div>
                                </div>
                                ${(places2.length || itemsTotal) ? `<div style="display:flex;gap:14px;margin-top:10px;font-size:11px;color:var(--text-secondary)">
                                    ${places2.length ? `<span>${places2.filter(p => p.visitado).length}/${places2.length} lugares</span>` : ''}
                                    ${itemsTotal ? `<span>${itemsHechos}/${itemsTotal} preparativos</span>` : ''}
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
                { id: 'mapa', label: 'Mapa', count: t.itinerario.filter(i => i.lat && i.lon).length },
                { id: 'documentos', label: 'Documentos' },
                { id: 'listas', label: 'Listas', count: t.listas.length },
            ];

            let body = '';
            if (tripManagerTab === 'resumen') body = renderTripResumenTab(t);
            else if (tripManagerTab === 'lugares') body = renderTripPlacesTab(t);
            else if (tripManagerTab === 'itinerario') body = renderTripItineraryTab(t);
            else if (tripManagerTab === 'mapa') body = renderTripMapTab(t);
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
                        <button class="btn-secondary btn-danger-pill" style="width:auto" onclick="deleteTripFromManager('${t.id}')">Eliminar</button>
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
                ${t.notes ? `<div class="entry-detail-field"><div class="entry-detail-label">Notas</div><div class="entry-detail-value">${linkifyText(t.notes)}</div></div>` : '<div class="empty-state"><div class="empty-title">Sin notas todavía</div><div class="empty-sub">Pulsa "Editar" arriba para añadir notas generales del viaje.</div></div>'}
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
                `).join('') : '<div class="empty-state"><div class="empty-title">Sin lugares todavía</div><div class="empty-sub">Añade los sitios que quieres visitar.</div></div>'}
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
                                <div style="font-size:11px;color:var(--text-secondary);font-weight:600">${it.dia ? escapeHtml(new Date(it.dia + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })) : 'Sin día'}${it.hora ? ' · ' + escapeHtml(it.hora) : ''}</div>
                                <div style="font-weight:600;margin-top:2px">${escapeHtml(it.titulo)}</div>
                                ${it.lugar ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">📍 ${escapeHtml(it.lugar)}${it.lat ? '' : ' · localizando...'}</div>` : ''}
                                ${it.notas ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${linkifyText(it.notas)}</div>` : ''}
                            </div>
                            <button class="friend-remove-btn" title="Eliminar" onclick="deleteItineraryItem('${t.id}','${it.id}')">✕</button>
                        </div>
                    </div>
                `).join('') : '<div class="empty-state"><div class="empty-title">Sin itinerario todavía</div><div class="empty-sub">Añade horarios y planes para cada día del viaje.</div></div>'}
            `;
        }
        // ---- Mapa del itinerario ----
        function renderTripMapTab(t) {
            const withCoords = [...t.itinerario].filter(i => i.lat && i.lon)
                .sort((a, b) => (a.dia || '').localeCompare(b.dia || '') || (a.hora || '').localeCompare(b.hora || ''));
            if (!withCoords.length) {
                return `<div class="empty-state"><div class="empty-title">Sin lugares en el mapa todavía</div><div class="empty-sub">Añade un "Lugar" al crear un punto del itinerario y aparecerá aquí en cuanto se localice.</div></div>`;
            }
            return `<div id="trip-map" class="trip-map-container"></div>`;
        }

        let _tripMapInstance = null;
        function initTripMap(t) {
            const container = document.getElementById('trip-map');
            if (!container || typeof L === 'undefined') return;
            if (_tripMapInstance) { _tripMapInstance.remove(); _tripMapInstance = null; }
            const withCoords = [...t.itinerario].filter(i => i.lat && i.lon)
                .sort((a, b) => (a.dia || '').localeCompare(b.dia || '') || (a.hora || '').localeCompare(b.hora || ''));
            if (!withCoords.length) return;

            const map = L.map('trip-map');
            _tripMapInstance = map;
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap',
                maxZoom: 19
            }).addTo(map);

            const latlngs = withCoords.map(i => [i.lat, i.lon]);
            withCoords.forEach((it, i) => {
                const dayLabel = it.dia ? new Date(it.dia + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '';
                L.marker([it.lat, it.lon]).addTo(map)
                    .bindPopup(`<strong>${i + 1}. ${escapeHtml(it.titulo)}</strong><br>${escapeHtml(dayLabel)}${it.hora ? ' · ' + escapeHtml(it.hora) : ''}`);
            });
            if (latlngs.length > 1) L.polyline(latlngs, { color: '#3b82f6', weight: 3, opacity: 0.7, dashArray: '6,6' }).addTo(map);
            map.fitBounds(latlngs, { padding: [30, 30] });
        }

        function openAddItineraryItem(tripId) {
            showModal(`
                <div class="modal-title">Añadir al itinerario</div>
                <div class="modal-row">
                    <div><div class="modal-label">Día</div><input type="date" id="it-dia" class="modal-input"></div>
                    <div><div class="modal-label">Hora (opcional)</div><input type="time" id="it-hora" class="modal-input"></div>
                </div>
                <div class="modal-label">Qué</div><input id="it-titulo" class="modal-input" placeholder="Visita al Coliseo">
                <div class="modal-label">Lugar (opcional, para el mapa)</div><input id="it-lugar" class="modal-input" placeholder="Colosseo, Roma">
                <div class="modal-label">Notas (opcional)</div><textarea id="it-notas" class="modal-input" rows="2"></textarea>
                <button class="btn-modal-primary" onclick="saveItineraryItem('${tripId}')">Guardar</button>
            `);
        }
        // Geocodifica un texto de lugar a lat/lon vía Nominatim (OpenStreetMap,
        // gratuito y sin API key). Falla en silencio: sin lugar geocodificado
        // el ítem simplemente no aparece en el mapa, pero sigue en la lista.
        async function geocodePlace(query) {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
                const data = await res.json();
                if (data && data[0]) return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
            } catch (e) { console.error('Error geocodificando lugar:', e); }
            return null;
        }
        async function saveItineraryItem(tripId) {
            const t = getTrip(tripId); if (!t) return;
            const titulo = document.getElementById('it-titulo')?.value.trim();
            const lugar = document.getElementById('it-lugar')?.value.trim() || '';
            if (!titulo) { showToast('Escribe qué vas a hacer', true); return; }
            if (!Array.isArray(t.itinerario)) t.itinerario = [];
            const item = {
                lugar,
                id: 'it_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                dia: document.getElementById('it-dia')?.value || '',
                hora: document.getElementById('it-hora')?.value || '',
                titulo,
                notas: document.getElementById('it-notas')?.value.trim() || ''
            };
            t.itinerario.push(item);
            closeModal();
            try { await saveData(); } catch (e) { console.error(e); }
            render();
            showToast('Añadido al itinerario');

            if (lugar) {
                const coords = await geocodePlace(lugar);
                if (coords) {
                    item.lat = coords.lat;
                    item.lon = coords.lon;
                    if (tripManagerTab === 'mapa') render();
                    try { await saveData(); } catch (e) { console.error(e); }
                }
            }
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
                    <div style="font-weight:500;margin-bottom:4px;color:var(--text-primary)">Sube un documento PDF de este viaje</div>
                    <div style="font-size:12px;color:var(--text-secondary)">Billetes, reservas, seguro de viaje...</div>
                </div>
                <input type="file" id="trip-doc-input-${t.id}" accept="application/pdf" style="display:none" onchange="handleTripDocUpload(event,'${t.id}')">
                <div id="trip-doc-list-${t.id}" style="margin-top:12px">${docs ? renderTripDocList(t.id, docs) : 'Cargando documentos...'}</div>
            `;
        }
        function renderTripDocList(tripId, docs) {
            if (!docs.length) return '<div class="empty-state"><div class="empty-title">Sin documentos</div><div class="empty-sub">Sube el primero con el botón de arriba</div></div>';
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
                if (el) el.innerHTML = '<div class="empty-state"><div class="empty-title">No se pudieron cargar los documentos</div></div>';
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

        // ---- Documentos de trabajo (contratos, nóminas...), mismo patrón que los de viaje ----
        let workDocumentsCache = {};
        function renderWorkDocList(workId, docs) {
            if (!docs.length) return '<div class="empty-state"><div class="empty-title">Sin documentos</div><div class="empty-sub">Sube el primero con el botón de arriba</div></div>';
            return docs.map(doc => {
                const sizeKb = doc.metadata?.size ? Math.round(doc.metadata.size / 1024) + ' KB' : '';
                const date = doc.created_at ? new Date(doc.created_at).toLocaleDateString('es-ES') : '';
                return `<div class="doc-item">
                    <div class="doc-info"><div style="min-width:0"><div class="doc-name">${escapeHtml(doc.name)}</div><div class="doc-meta">${date}${sizeKb ? ' · ' + sizeKb : ''}</div></div></div>
                    <div class="doc-actions">
                        <button class="doc-action-download" onclick="downloadWorkDocument('${workId}','${escapeHtml(doc.name)}')">Descargar</button>
                        <button class="doc-action-delete-btn" title="Eliminar" onclick="deleteWorkDocument('${workId}','${escapeHtml(doc.name)}')">✕</button>
                    </div>
                </div>`;
            }).join('');
        }
        async function loadWorkDocuments(workId) {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const { data, error } = await sb.storage.from('documents').list(`${user.id}/work/${workId}`, { sortBy: { column: 'created_at', order: 'desc' } });
                if (error) throw error;
                workDocumentsCache[workId] = data || [];
                const el = document.getElementById('work-doc-list-' + workId);
                if (el) el.innerHTML = renderWorkDocList(workId, workDocumentsCache[workId]);
            } catch (e) {
                console.error('Error cargando documentos del trabajo:', e);
                const el = document.getElementById('work-doc-list-' + workId);
                if (el) el.innerHTML = '<div class="empty-state"><div class="empty-title">No se pudieron cargar los documentos</div></div>';
            }
        }
        async function handleWorkDocUpload(event, workId) {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;
            if (file.type !== 'application/pdf') { showToast('Solo se admiten archivos PDF', true); return; }
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/work/${workId}/${Date.now()}_${file.name}`;
                const { error } = await sb.storage.from('documents').upload(path, file, { upsert: false });
                if (error) throw error;
                showToast('Documento subido');
                await loadWorkDocuments(workId);
            } catch (e) {
                console.error('Error subiendo documento del trabajo:', e);
                showToast('Error al subir: ' + (e?.message || 'desconocido'), true);
            }
        }
        async function downloadWorkDocument(workId, name) {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/work/${workId}/${name}`;
                const { data, error } = await sb.storage.from('documents').createSignedUrl(path, 60);
                if (error) throw error;
                window.open(data.signedUrl, '_blank');
            } catch (e) {
                console.error('Error descargando documento del trabajo:', e);
                showToast('Error al descargar: ' + (e?.message || 'desconocido'), true);
            }
        }
        async function deleteWorkDocument(workId, name) {
            if (!confirm('¿Eliminar este documento? No se puede deshacer.')) return;
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const path = `${user.id}/work/${workId}/${name}`;
                const { error } = await sb.storage.from('documents').remove([path]);
                if (error) throw error;
                showToast('Documento eliminado');
                await loadWorkDocuments(workId);
            } catch (e) {
                console.error('Error eliminando documento del trabajo:', e);
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
                            <div style="font-weight:700">${escapeHtml(l.nombre)} <span style="font-weight:400;color:var(--text-secondary);font-size:12px">(${(l.items || []).filter(i => i.hecho).length}/${(l.items || []).length})</span></div>
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
                `).join('') : '<div class="empty-state"><div class="empty-title">Sin listas todavía</div><div class="empty-sub">Crea una lista de qué llevar, qué hacer o lo que necesites.</div></div>'}
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

        const WORK_MODALIDAD_LABELS = { presencial: 'Presencial', hibrido: 'Híbrido', remoto: 'Remoto' };

        // Icono de portátil — misma familia sólida de las TARJETA BITACORA,
        // pensado para ir en blanco sobre el fondo negro de la tarjeta.
        const WORK_ICON_LAPTOP = '<svg viewBox="0 0 100 80" fill="none"><rect x="6" y="6" width="88" height="56" rx="8" fill="currentColor"/><rect x="18" y="16" width="64" height="36" rx="3" fill="#000"/><rect x="0" y="66" width="100" height="10" rx="5" fill="currentColor"/></svg>';
        // Misma silueta, pero el "hueco" de la pantalla toma el color de
        // fondo del FAB (var(--bg-fab)) en vez de negro fijo, porque el FAB
        // sí cambia de blanco a negro según el tema.
        const FAB_ICON_LAPTOP = '<svg viewBox="0 0 100 80" fill="none"><rect x="6" y="6" width="88" height="56" rx="8" fill="currentColor"/><rect x="18" y="16" width="64" height="36" rx="3" fill="var(--bg-fab)"/><rect x="0" y="66" width="100" height="10" rx="5" fill="currentColor"/></svg>';

        function renderWork() {
            const work = entries.filter(e => e.type === 'work');
            if (!work.length) {
                return `<div class="empty-state">
                    <div class="empty-title">Sin experiencia laboral</div>
                    <div class="empty-sub">Pulsa el botón + y selecciona "Trabajo", o importa tu Informe de Vida Laboral</div>
                    <button class="btn-secondary" style="width:auto;margin-top:12px;background:#3b82f6;color:#fff;border-color:#3b82f6" onclick="openWorkImportModal()">Importar Vida Laboral</button>
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
                    <div style="font-size:20px;font-weight:700;color:var(--text-primary)">Trabajo</div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <button class="btn-secondary" style="width:auto;background:#3b82f6;color:#fff;border-color:#3b82f6" onclick="openWorkImportModal()">Importar Vida Laboral</button>
                        <button class="btn-secondary" style="width:auto" onclick="generateWorkResumePDF()">⭳ Descargar resumen (PDF)</button>
                    </div>
                </div>
                <div class="card work-bubble-flow-card" style="max-width:980px;margin-bottom:22px">
                    <div class="work-bubble-flow-title">evolución de tus empleos. ${totalDays} días trabajados en total.</div>
                    ${renderWorkBubbleFlow(sorted)}
                </div>
                <div style="max-width:980px">`;

            if (actuales.length) {
                html += `<div style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin-bottom:10px">Actual</div>`;
                actuales.forEach(w => { html += renderWorkCard(w, todayStr, daysBetween); });
            }
            if (historial.length) {
                html += `<div style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin:${actuales.length ? '22px' : '0'} 0 10px 0">Historial</div>`;
                historial.forEach(w => { html += renderWorkCard(w, todayStr, daysBetween); });
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
                return { label: w.company || w.title || 'Trabajo', days: Math.max(0, days) };
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

        function renderWorkCard(w, todayStr, daysBetween) {
            const isActive = !w.endDate || w.endDate >= todayStr;
            const effectiveEnd = isActive ? todayStr : w.endDate;
            const calculatedDaysHere = daysBetween(w.startDate, effectiveEnd);
            const manualDaysHere = Number(w.cotizedDays);
            const daysHere = Number.isFinite(manualDaysHere) && manualDaysHere >= 0
                ? manualDaysHere
                : calculatedDaysHere;
            const statusLabel = isActive ? 'Actual' : (w.status || 'Finalizado');
            const scheduleText = (w.startTime || w.endTime) ? `${w.startTime || '--'} - ${w.endTime || '--'}` : (w
                .schedule || '');
            const heading = w.company || w.title;
            const subheading = [w.position, w.company ? w.title : ''].filter(Boolean).join(' · ');
            const modalidadLabel = WORK_MODALIDAD_LABELS[w.modalidad] || '';
            return `
                <div class="work-card-bitacora" style="margin-bottom:12px;cursor:pointer" data-open-entry="${w.id}">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
                        <div>
                            <div style="font-weight:700;font-size:16px">${escapeHtml(heading)}</div>
                            ${subheading ? `<div style="font-size:13px;color:rgba(255,255,255,.6);margin-top:1px">${escapeHtml(subheading)}</div>` : ''}
                        </div>
                        <span class="work-card-bitacora-badge">${statusLabel}</span>
                    </div>
                    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px">
                        <span style="font-size:12px;color:rgba(255,255,255,.6)">${w.startDate || ''} ${w.endDate ? '→ ' + w.endDate : '→ Actual'}</span>
                        <span style="font-size:12px;color:rgba(255,255,255,.6)">${daysHere} días</span>
                        <span style="font-size:11px;color:rgba(255,255,255,.5)">${getCotizationDays(w, todayStr)} días cotizados · ${getCotizationSource(w)}</span>
                        ${modalidadLabel ? `<span style="font-size:11px;color:rgba(255,255,255,.5)">${modalidadLabel}</span>` : ''}
                    </div>
                    ${scheduleText ? `<div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:2px">${scheduleText}</div>` : ''}
                    ${w.salary ? `<div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:2px">${w.salary}€/mes</div>` : ''}
                    ${w.notes ? `<div style="font-size:13px;color:rgba(255,255,255,.75);margin-top:6px">${linkifyText(w.notes)}</div>` : ''}
                    ${w.logros ? `<div class="work-card-bitacora-logros"><strong>Logros:</strong> ${linkifyText(w.logros)}</div>` : ''}
                    ${(!isActive && w.motivoSalida) ? `<div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:4px"><strong style="color:#fff">Motivo de salida:</strong> ${escapeHtml(w.motivoSalida)}</div>` : ''}
                    <div class="work-card-bitacora-icon">${WORK_ICON_LAPTOP}</div>
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
                    <div class="event-hero-kicker" style="color:${nextExam.subjectColor || '#3b82f6'}">Próximo examen · ${eventCountdownLabel(nextExam.date)}</div>
                    <div class="event-hero-title">${escapeHtml(nextExam.title || 'Examen')} — ${escapeHtml(nextExam.subjectName)}</div>
                    <div class="event-hero-meta">${escapeHtml(nextExam.date)}</div>
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
                    <h3>Asignaturas</h3>
                    ${studies.subjects.length ? `<div class="studies-subjects-list">${studies.subjects.map((s, i) => renderSubjectRow(s, i, studies.subjects.length)).join('')}</div>` : '<div class="finance-empty-line">Aún no has añadido ninguna asignatura.</div>'}
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

        // Una línea por asignatura, por orden de creación — nombre en
        // negrita, profesor en gris debajo ("añadir nombre." si no se ha
        // indicado todavía, pulsable aparte sin abrir el detalle). El
        // desglose de trabajos/exámenes vive solo en el popup de detalle.
        function renderSubjectRow(s, index, total) {
            const hasProfessor = !!(s.professor && s.professor.trim());
            const lastRowStart = total - (total % 2 === 0 ? 2 : 1);
            const isLastRow = index >= lastRowStart;
            return `
                <div class="studies-subject-row ${isLastRow ? 'studies-subject-row-lastrow' : ''}" onclick="openSubjectDetail('${s.id}')">
                    <div class="studies-subject-index">${String(index + 1).padStart(2, '0')}</div>
                    <div class="studies-subject-row-body">
                        <div class="studies-subject-row-name">${escapeHtml(s.name)}</div>
                        <div class="studies-subject-row-prof ${hasProfessor ? '' : 'studies-subject-row-prof-empty'}" onclick="event.stopPropagation();editSubjectProfessor('${s.id}')">${hasProfessor ? escapeHtml(s.professor) : 'añadir nombre.'}</div>
                    </div>
                </div>`;
        }

        function editSubjectProfessor(id) {
            const s = findSubject(id);
            if (!s) return;
            showModal(`
                <div class="modal-title">Profesor — ${escapeHtml(s.name)}</div>
                <input id="subject-professor-input" class="modal-input" placeholder="Nombre del profesor" value="${escapeHtml(s.professor || '')}">
                <button class="btn-modal-primary" onclick="saveSubjectProfessor('${id}')">Guardar</button>
            `);
            setTimeout(() => document.getElementById('subject-professor-input')?.focus(), 50);
        }

        async function saveSubjectProfessor(id) {
            const s = findSubject(id);
            if (!s) return;
            const val = document.getElementById('subject-professor-input')?.value.trim();
            s.professor = val || null;
            closeModal();
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openAddSubject() {
            showModal(`
                <div class="modal-title">+ Asignatura</div>
                <div class="modal-label">Nombre</div>
                <input id="subject-name" class="modal-input" placeholder="Ej: Cálculo I">
                <div class="modal-label">Color</div>
                <input id="subject-color" class="modal-input" type="color" value="#5b8def" style="height:40px;padding:4px">
                <div class="modal-label">Créditos ECTS (opcional)</div>
                <input id="subject-creditos" class="modal-input" type="number" min="0" step="0.5" placeholder="Ej: 6">
                <button class="btn-modal-primary" onclick="saveNewSubject()">Añadir asignatura</button>
            `);
            setTimeout(() => document.getElementById('subject-name')?.focus(), 50);
        }

        async function saveNewSubject() {
            const name = document.getElementById('subject-name')?.value.trim();
            if (!name) { showToast('Indica un nombre para la asignatura', true); return; }
            const color = document.getElementById('subject-color')?.value || '#5b8def';
            const creditosRaw = document.getElementById('subject-creditos')?.value;
            const creditos = creditosRaw !== '' && creditosRaw != null ? Math.max(0, parseFloat(creditosRaw) || 0) : null;
            studies.subjects.push({ id: 'subj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name, color, creditos, exams: [], assignments: [] });
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

        async function updateSubjectCredits(id, value) {
            const s = findSubject(id);
            if (!s) return;
            s.creditos = value !== '' && value != null ? Math.max(0, parseFloat(value) || 0) : null;
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function openSubjectDetail(id) {
            const s = findSubject(id);
            if (!s) return;
            showModal(renderSubjectDetailModal(s));
        }

        const STUDIES_ICON_EXAM = '<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M9 9h6M9 13h6M9 17h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
        const STUDIES_ICON_WORK = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 20l1-5 11-11 4 4-11 11-5 1z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><path d="M14 5l4 4" stroke="currentColor" stroke-width="1.8"/></svg>';

        function renderSubjectDetailModal(s) {
            const finalGrade = subjectFinalGrade(s);
            const hasProfessor = !!(s.professor && s.professor.trim());
            return `
                <div class="subject-detail-modal">
                    <div class="subject-detail-head">
                        <div>
                            <div class="modal-title" style="margin-bottom:0">${escapeHtml(s.name)}</div>
                            <div class="subject-detail-prof ${hasProfessor ? '' : 'subject-detail-prof-empty'}" onclick="editSubjectProfessor('${s.id}')">${hasProfessor ? escapeHtml(s.professor) : 'añadir nombre.'}</div>
                        </div>
                        ${finalGrade !== null ? `<div class="subject-detail-grade"><span class="nota-final ${gradeTierClass(finalGrade)}">${finalGrade.toFixed(2)}</span><div class="subject-detail-grade-label">Nota final</div></div>` : ''}
                    </div>
                    <div class="modal-label">Créditos ECTS (opcional, para el expediente)</div>
                    <input class="modal-input" type="number" min="0" step="0.5" value="${s.creditos ?? ''}" placeholder="Ej: 6" onchange="updateSubjectCredits('${s.id}',this.value)">
                    <div class="studies-modal-block">
                        <div class="modal-label studies-modal-block-title" style="justify-content:space-between">
                            <span style="display:flex;align-items:center;gap:8px"><span class="studies-block-icon">${STUDIES_ICON_EXAM}</span>Exámenes</span>
                            <button class="finance-icon-btn" onclick="addSubjectItem('${s.id}','exams')">+</button>
                        </div>
                        ${(s.exams || []).length ? s.exams.map((ex, i) => renderSubjectItemRow(s.id, 'exams', ex, i)).join('') : '<div class="finance-empty-line">Sin exámenes todavía.</div>'}
                    </div>
                    <div class="studies-modal-block">
                        <div class="modal-label studies-modal-block-title" style="justify-content:space-between">
                            <span style="display:flex;align-items:center;gap:8px"><span class="studies-block-icon">${STUDIES_ICON_WORK}</span>Trabajos</span>
                            <button class="finance-icon-btn" onclick="addSubjectItem('${s.id}','assignments')">+</button>
                        </div>
                        ${(s.assignments || []).length ? s.assignments.map((a, i) => renderSubjectItemRow(s.id, 'assignments', a, i)).join('') : '<div class="finance-empty-line">Sin trabajos todavía.</div>'}
                    </div>
                    <button class="finance-oneoff-btn" style="color:#dc2626;border-color:#dc2626" onclick="deleteSubject('${s.id}')">Eliminar asignatura</button>
                </div>
            `;
        }

        function renderSubjectItemRow(subjectId, listKey, item, index) {
            const gradeNum = item.grade !== '' && item.grade !== null && item.grade !== undefined && !isNaN(Number(item.grade)) ? Number(item.grade) : null;
            const gradeCls = gradeNum !== null ? gradeTierClass(gradeNum) : '';
            return `
                <div class="studies-item-card">
                    <div class="studies-item-card-head">
                        <input class="modal-input studies-item-title-input" value="${escapeHtml(item.title || '')}" placeholder="Título" onchange="updateSubjectItem('${subjectId}','${listKey}',${index},'title',this.value)">
                        <button class="studies-item-remove" title="Eliminar" onclick="removeSubjectItem('${subjectId}','${listKey}',${index})">✕</button>
                    </div>
                    <div class="studies-item-fields">
                        <div class="studies-item-field"><label>Fecha</label><input class="modal-input" type="date" value="${item.date || ''}" onchange="updateSubjectItem('${subjectId}','${listKey}',${index},'date',this.value)"></div>
                        <div class="studies-item-field"><label>Nota</label><input class="modal-input ${gradeCls}" type="number" min="0" max="10" step="0.1" value="${item.grade ?? ''}" placeholder="0-10" onchange="updateSubjectItem('${subjectId}','${listKey}',${index},'grade',this.value)"></div>
                        <div class="studies-item-field"><label>Peso %</label><input class="modal-input" type="number" min="0" max="100" step="1" value="${item.weight ?? ''}" placeholder="0-100" onchange="updateSubjectItem('${subjectId}','${listKey}',${index},'weight',this.value)"></div>
                    </div>
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
                return `<div class="empty-state"><div class="empty-title">Sin proyectos</div><div class="empty-sub">Pulsa el botón + y selecciona "Proyecto"</div></div>`;
            }

            const toggle = `
                <div class="culture-tabs" style="margin-bottom:18px">
                    <button class="culture-tab ${projectViewMode === 'list' ? 'active' : ''}" onclick="setProjectViewMode('list')">Lista</button>
                    <button class="culture-tab ${projectViewMode === 'kanban' ? 'active' : ''}" onclick="setProjectViewMode('kanban')">Tablero</button>
                </div>`;

            return `<div style="max-width:980px">${toggle}<div class="cal-view-anim">${projectViewMode === 'kanban' ? renderProjectsKanban(projects) : renderProjectsList(projects)}</div></div>`;
        }

        // Lista de proyectos con la misma línea de diseño que Asignaturas/
        // Documentos: fila numerada, sin la tarjeta con borde de color de
        // categoría, separador grueso. La descripción y las features
        // detalladas quedan solo en el popup de detalle (openEntryDetail),
        // aquí se ve lo justo para escanear la lista de un vistazo.
        function renderProjectsList(projects) {
            const today = todayISO();
            const sorted = [...projects].sort((a, b) => {
                const aActive = projectStatusBucket(a.status) !== 'Completado', bActive = projectStatusBucket(b.status) !== 'Completado';
                if (aActive !== bActive) return aActive ? -1 : 1;
                return (b.startDate || '').localeCompare(a.startDate || '');
            });

            return `<div class="projects-list">${sorted.map((p, i) => {
                const bucket = projectStatusBucket(p.status);
                const statusClass = bucket === 'Completado' ? 'badge-done' : bucket === 'En progreso' ? 'badge-progress' : 'badge-pending';
                const { total, done, pct } = projectTaskProgress(p);
                const overdue = p.endDate && p.endDate < today && bucket !== 'Completado';
                const priority = p.priority || 'media';

                return `
                    <div class="projects-row" data-open-entry="${p.id}">
                        <div class="projects-row-index">${String(i + 1).padStart(2, '0')}</div>
                        <div class="projects-row-body">
                            <div class="projects-row-top">
                                <span class="projects-row-title">${escapeHtml(p.title)}</span>
                                <span class="project-priority-dot" style="background:${PROJECT_PRIORITY_COLOR[priority]}" title="Prioridad ${PROJECT_PRIORITY_LABEL[priority]}"></span>
                            </div>
                            <div class="projects-row-meta">
                                <span class="badge ${statusClass}">${bucket}</span>
                                <span>${escapeHtml(p.projectCategory || 'Sin categoría')}</span>
                                ${p.endDate ? `<span class="${overdue ? 'project-overdue' : ''}">${overdue ? '⚠ ' : ''}${escapeHtml(p.endDate)}</span>` : ''}
                            </div>
                            ${total > 0 ? `
                                <div class="progress-bar-bg" style="margin-top:8px"><div class="progress-bar-fill" style="width:${pct}%;background:#2563eb"></div></div>
                                <div class="project-card-progress-label">${done}/${total} hitos · ${pct}%</div>
                            ` : ''}
                        </div>
                    </div>`;
            }).join('')}</div>`;
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
                            <div class="kanban-card" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${p.id}')" data-open-entry="${p.id}" style="border-left:4px solid ${color}">
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

        function openEventsImportModal() {
            showModal(`
                <div class="modal-title">Importar eventos</div>

                <div class="events-section-label" style="margin-top:0">Desde un calendario (.ics)</div>
                <div class="doc-upload-box" onclick="document.getElementById('ics-import-input').click()">
                    <div style="font-weight:500;margin-bottom:4px;color:var(--text-primary)">Elegir archivo .ics</div>
                    <div style="font-size:12px;color:var(--text-secondary)">Exportado desde Google Calendar, Apple Calendar u Outlook</div>
                </div>
                <input type="file" id="ics-import-input" accept=".ics,text/calendar" style="display:none" onchange="handleIcsImport(event)">

                <div class="events-section-label" style="margin-top:22px">O pega texto</div>
                <textarea id="events-text-import" class="modal-input" rows="1" placeholder="Pega aquí líneas EVENTO|fecha|hora|tipo|título|lugar|notas..." style="margin-bottom:8px;resize:vertical;min-height:38px;overflow:hidden" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
                <button class="btn-secondary" style="width:auto;margin:0;padding:7px 14px;font-size:12px;border-radius:14px" onclick="processEventsTextImport()">Procesar texto</button>
                <div style="font-size:10px;color:var(--text-secondary);margin-top:6px">Formato: EVENTO|AAAA-MM-DD|HH:MM|tipo|título|lugar|notas — hora, lugar y notas pueden ir vacíos. Tipo: social/teatro/cine/concierto/deporte/otro. El prompt para generar estas líneas a partir de una foto o un enlace está guardado en Ajustes → Prompts guardados.</div>
                <div id="events-import-summary" style="font-size:12px;margin-top:8px;color:var(--text-secondary)"></div>
            `);
        }

        // Formato .ics (RFC 5545): primero se "desdoblan" las líneas partidas
        // (una línea que empieza por espacio es continuación de la
        // anterior), y luego se recorren los bloques BEGIN:VEVENT/END:VEVENT
        // sacando solo los campos que hacen falta. Los eventos recurrentes
        // (RRULE) no se expanden: se importa únicamente la fecha base de
        // cada VEVENT, no cada repetición futura.
        function parseIcs(text) {
            const unfolded = text.replace(/\r\n/g, '\n').split('\n').reduce((lines, line) => {
                if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length) {
                    lines[lines.length - 1] += line.slice(1);
                } else {
                    lines.push(line);
                }
                return lines;
            }, []);

            const events = [];
            let cur = null;
            unfolded.forEach(line => {
                if (line.trim() === 'BEGIN:VEVENT') { cur = {}; return; }
                if (line.trim() === 'END:VEVENT') { if (cur) events.push(cur); cur = null; return; }
                if (!cur) return;
                const idx = line.indexOf(':');
                if (idx === -1) return;
                const key = line.slice(0, idx).split(';')[0].trim().toUpperCase();
                const value = line.slice(idx + 1);
                if (key === 'SUMMARY') cur.summary = value;
                else if (key === 'LOCATION') cur.location = value;
                else if (key === 'DESCRIPTION') cur.description = value;
                else if (key === 'DTSTART') cur.dtstart = value;
            });
            return events;
        }

        function icsUnescape(s) {
            return (s || '').replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
        }

        function handleIcsImport(event) {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async function (e) {
                try {
                    const vevents = parseIcs(String(e.target.result));
                    if (!vevents.length) { showToast('No se han encontrado eventos en ese archivo .ics', true); return; }

                    let added = 0, duplicates = 0, errors = 0;
                    vevents.forEach((ev, i) => {
                        const title = icsUnescape(ev.summary).trim();
                        const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/.exec(ev.dtstart || '');
                        if (!title || !m) { errors++; return; }
                        const date = `${m[1]}-${m[2]}-${m[3]}`;
                        const time = m[4] ? `${m[4]}:${m[5]}` : '';
                        const place = icsUnescape(ev.location).trim();
                        const notes = icsUnescape(ev.description).trim();

                        if (entries.some(en => en.type === 'event' && en.title === title && en.date === date)) { duplicates++; return; }
                        entries.push({ id: 'evt_ics_' + Date.now() + '_' + i, type: 'event', title, eventType: 'otro', date, time, place, notes });
                        added++;
                    });

                    closeModal();
                    render();
                    showToast(`Importados ${added} evento${added === 1 ? '' : 's'}` +
                        (duplicates ? ` · ${duplicates} ya existían` : '') +
                        (errors ? ` · ${errors} sin título o fecha válida` : ''));
                    try { await saveData(); } catch (err) { console.error('Error guardando eventos importados de .ics:', err); showToast('No se pudo guardar en la nube', true); }
                } catch (err) {
                    console.error('Error importando .ics:', err);
                    showToast('Error al leer el archivo .ics', true);
                }
            };
            reader.readAsText(file);
        }

        // Mismo patrón que otros importadores de texto de la app: líneas con
        // campos separados por "|", pensadas para pegar de golpe lo que
        // genere el prompt de importación de eventos (guardado en Ajustes →
        // Prompts guardados). Duplicados = mismo título y misma fecha ya
        // existentes, para poder pegar el mismo bloque dos veces sin miedo.
        function processEventsTextImport() {
            const ta = document.getElementById('events-text-import');
            const raw = ta.value.trim();
            if (!raw) { showToast('Pega primero el texto a importar', true); return; }
            const validTypes = Object.keys(EVENT_TYPE_LABELS);
            let added = 0, errors = 0, duplicates = 0;

            raw.split('\n').map(l => l.trim()).filter(Boolean).forEach((line, i) => {
                const p = line.split('|').map(s => s.trim());
                if ((p[0] || '').toUpperCase() !== 'EVENTO' || p.length < 5) { errors++; return; }
                const date = p[1];
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors++; return; }
                const time = /^\d{1,2}:\d{2}$/.test(p[2]) ? p[2] : '';
                let eventType = (p[3] || '').toLowerCase();
                if (!validTypes.includes(eventType)) eventType = 'otro';
                const title = p[4] || '';
                if (!title) { errors++; return; }
                const place = p[5] || '';
                const notes = p[6] || '';

                if (entries.some(e => e.type === 'event' && e.title === title && e.date === date)) { duplicates++; return; }
                entries.push({ id: 'evt_text_' + Date.now() + '_' + i, type: 'event', title, eventType, date, time, place, notes });
                added++;
            });

            render();
            const summaryEl = document.getElementById('events-import-summary');
            if (summaryEl) {
                summaryEl.textContent = `Importados: ${added}` +
                    (duplicates ? ` · ${duplicates} ya existían` : '') +
                    (errors ? ` · ${errors} línea${errors === 1 ? '' : 's'} con error` : '');
            }
            saveData().catch(e => { console.error('Error guardando eventos importados:', e); showToast('No se pudo guardar en la nube', true); });
        }

        function renderEvents() {
            const allEvents = entries.filter(e => e.type === 'event');
            if (!allEvents.length) {
                return `<div style="max-width:980px"><button class="btn-secondary" style="width:auto;background:#3b82f6;color:#fff;border-color:#3b82f6" onclick="openEventsImportModal()">Importar eventos</button></div><div class="empty-state"><div class="empty-title">Sin eventos</div><div class="empty-sub">Pulsa el botón + y selecciona "Evento", o importa arriba</div></div>`;
            }
            const { items: events, banner } = applyMonthFilterTo('event', allEvents);
            if (!events.length) return banner + `<div class="empty-state"><div class="empty-title">Sin eventos ese mes</div></div>`;

            const next = entryMonthFilter && entryMonthFilter.type === 'event' ? null : nextUpcomingEvent(events);

            let html = `<div style="max-width:980px">` + banner;

            if (next) {
                const nextCat = categories.find(c => c.id === next.categoryId);
                const nextColor = nextCat?.color || '#3b82f6';
                const nextType = EVENT_TYPE_LABELS[next.eventType] || '';
                html += `
                    <div class="event-hero" style="border-color:${nextColor}66" data-open-entry="${next.id}">
                        <div class="event-hero-kicker" style="color:${nextColor}">Próximo evento · ${eventCountdownLabel(next.date)}</div>
                        <div class="event-hero-title">${escapeHtml(next.title)}</div>
                        <div class="event-hero-meta">${nextType ? escapeHtml(nextType) + ' · ' : ''}${escapeHtml(next.date)}${next.time ? ' · ' + escapeHtml(next.time) : ''}${next.place ? ' · ' + escapeHtml(next.place) : ''}</div>
                    </div>`;
            }

            html += `
                <div class="events-toolbar">
                    <input type="text" id="events-search-input" class="modal-input" style="margin:0;max-width:260px" placeholder="Buscar por título o lugar..." value="${escapeHtml(eventsSearchQuery)}" oninput="setEventsSearchQuery(this.value)">
                    <div class="events-type-chips">
                        <button class="events-type-chip ${eventsTypeFilter === 'all' ? 'active' : ''}" onclick="setEventsTypeFilter('all')">Todos</button>
                        ${Object.keys(EVENT_TYPE_LABELS).map(t => `
                            <button class="events-type-chip ${eventsTypeFilter === t ? 'active' : ''}" onclick="setEventsTypeFilter('${t}')">${EVENT_TYPE_LABELS[t]}</button>
                        `).join('')}
                    </div>
                    <button class="btn-secondary" style="width:auto;background:#3b82f6;color:#fff;border-color:#3b82f6" onclick="openEventsImportModal()">Importar eventos</button>
                </div>
                <div id="events-list-content">${renderEventsListContent(events)}</div>
            </div>`;
            return html;
        }

        // Recalcula solo la lista (próximos/pasados) filtrada por tipo y
        // búsqueda, sin volver a pintar el buscador — así el campo de texto
        // no pierde el foco ni el cursor mientras escribes.
        function renderEventsListContent(events) {
            const q = stripAccents(eventsSearchQuery.toLowerCase().trim());
            let filtered = events;
            if (eventsTypeFilter !== 'all') filtered = filtered.filter(e => e.eventType === eventsTypeFilter);
            if (q) {
                filtered = filtered.filter(e =>
                    stripAccents((e.title || '').toLowerCase()).includes(q) ||
                    stripAccents((e.place || '').toLowerCase()).includes(q)
                );
            }

            const today = todayISO();
            const upcoming = filtered.filter(e => e.date && e.date >= today)
                .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
            const past = filtered.filter(e => !e.date || e.date < today)
                .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

            const hayFiltro = eventsTypeFilter !== 'all' || !!q;
            let html = `<div class="events-section-label">Próximos${upcoming.length ? ` (${upcoming.length})` : ''}</div>`;
            html += upcoming.length
                ? renderEventsMonthColumns(upcoming, { reverse: false })
                : `<div class="events-empty-note">Sin eventos próximos${hayFiltro ? ' con este filtro.' : '.'}</div>`;

            if (past.length) {
                html += `<button class="events-past-toggle" onclick="toggleEventsShowPast()">${eventsShowPast ? 'Ocultar pasados' : `Mostrar pasados (${past.length})`}</button>`;
                if (eventsShowPast) html += renderEventsMonthColumns(past, { reverse: true });
            }
            return html;
        }

        // Agrupa eventos por mes en columnas separadas (una por mes) en vez
        // de una única rejilla larga — cada columna lleva su propio
        // encabezado "mes. (n)" y sus tarjetas ordenadas por día.
        function renderEventsMonthColumns(events, opts) {
            const reverse = opts && opts.reverse;
            const groups = [];
            const byKey = {};
            events.forEach(e => {
                const key = (e.date || '').slice(0, 7) || 'sin-fecha';
                if (!byKey[key]) { byKey[key] = { key, items: [] }; groups.push(byKey[key]); }
                byKey[key].items.push(e);
            });
            groups.sort((a, b) => reverse ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key));
            const monthLabel = key => {
                if (key === 'sin-fecha') return 'sin fecha';
                const [y, m] = key.split('-').map(Number);
                return new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long' });
            };
            return groups.map(g => `
                <div class="events-month-section">
                    <div class="events-month-col-title"><span class="events-month-col-title-text">${escapeHtml(monthLabel(g.key))}.</span> <span class="events-month-col-count">(${g.items.length})</span></div>
                    <div class="events-month-row">
                        ${g.items.sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(e => renderEventSquareCard(e)).join('')}
                    </div>
                </div>
            `).join('');
        }

        function renderEventSquareCard(e) {
            const cat = categories.find(c => c.id === e.categoryId);
            const color = cat?.color || 'var(--text-secondary)';
            const typeLabel = EVENT_TYPE_LABELS[e.eventType] || '';
            const icon = EVENT_TYPE_ICONS[e.eventType] || EVENT_TYPE_ICONS.otro;
            const day = e.date ? e.date.slice(8, 10) : '–';
            const isPast = e.date && e.date < todayISO();
            return `
                <div class="event-sq-card ${isPast ? 'event-sq-card-past' : ''}" data-open-entry="${e.id}">
                    <div class="event-sq-icon">${icon}</div>
                    <div class="event-sq-body">
                        <div class="event-sq-title">${escapeHtml(e.title)}</div>
                        <div class="event-sq-meta"><span class="event-sq-dot" style="background:${color}"></span>${escapeHtml(typeLabel || e.place || 'Evento')}${e.time ? `,&nbsp;<em>${escapeHtml(e.time)}.</em>` : ''}</div>
                    </div>
                    <div class="event-sq-day">${day}</div>
                </div>`;
        }

        function setEventsSearchQuery(value) {
            eventsSearchQuery = value;
            const allEvents = entries.filter(e => e.type === 'event');
            const { items: events } = applyMonthFilterTo('event', allEvents);
            const container = document.getElementById('events-list-content');
            if (container) container.innerHTML = renderEventsListContent(events);
        }

        function setEventsTypeFilter(type) {
            eventsTypeFilter = type;
            render();
        }

        function toggleEventsShowPast() {
            eventsShowPast = !eventsShowPast;
            render();
        }

        // ============================================================
        //  RENDER: PLACES
        // ============================================================
        function renderPlaces() {
            const places = entries.filter(e => e.type === 'place');
            if (!places.length) {
                return `<div class="empty-state"><div class="empty-title">Sin lugares</div><div class="empty-sub">Pulsa el botón + y selecciona "Lugar"</div></div>`;
            }

            const sorted = [...places].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

            let html = `<div style="max-width:700px">`;
            sorted.forEach(p => {
                const cat = categories.find(c => c.id === p.categoryId);
                const color = cat?.color || 'var(--text-secondary)';
                html += `
                    <div class="entry-item" data-open-entry="${p.id}">
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
            const filteredMap = {};
            tagList.forEach(t => { if (!q || t.toLowerCase().includes(q)) filteredMap[t] = tagMap[t]; });
            if (!Object.keys(filteredMap).length) return `<div class="finance-empty-line">Sin etiquetas que coincidan con "${escapeHtml(window._tagFilter || '')}"</div>`;
            const tree = buildTagTree(filteredMap);
            const roots = Object.values(tree).sort((a, b) => a.name.localeCompare(b.name));
            return `<div class="tags-tree">${roots.map(n => renderTagsTreeNode(n, 0)).join('')}</div>`;
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

        function buildTagTree(tagMap) {
            const root = {};
            Object.keys(tagMap).forEach(tag => {
                const parts = tag.split('/').map(p => p.trim()).filter(Boolean);
                if (!parts.length) return;
                let node = root;
                let path = '';
                parts.forEach((part, i) => {
                    path = path ? path + '/' + part : part;
                    if (!node[part]) node[part] = { name: part, path, children: {}, count: 0 };
                    if (i === parts.length - 1) node[part].count += tagMap[tag].length;
                    node = node[part].children;
                });
            });
            return root;
        }

        function entriesForTagPrefix(prefix) {
            return entries.filter(e => (e.tags || []).some(t => t === prefix || String(t).startsWith(prefix + '/')));
        }

        function renderTagsTreeNode(node, depth) {
            const pathEsc = escapeHtml(node.path).replace(/'/g, "\\'");
            const label = `#${escapeHtml(node.path)}${node.count ? ' · ' + node.count : ''}`;
            const children = Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name));
            if (!children.length) {
                return `<div class="tags-tree-row" style="padding-left:${depth * 16}px" onclick="window._selectedTag='${pathEsc}';render()">${label}</div>`;
            }
            return `
                <details class="tags-tree-group" style="margin-left:${depth * 16}px" open>
                    <summary class="tags-tree-row"><span onclick="event.preventDefault();event.stopPropagation();window._selectedTag='${pathEsc}';render()">${label}</span></summary>
                    ${children.map(c => renderTagsTreeNode(c, depth + 1)).join('')}
                </details>`;
        }

        function renderTagsView() {
            const tagMap = tagMapFromEntries();
            const tagList = Object.keys(tagMap);

            if (!tagList.length) {
                return `<div class="empty-state"><div class="empty-title">Sin etiquetas todavía</div><div class="empty-sub">Añade etiquetas a tus entradas para verlas aquí</div></div>`;
            }

            if (window._selectedTag) {
                const items = entriesForTagPrefix(window._selectedTag);
                const tagEsc = escapeHtml(window._selectedTag).replace(/'/g, "\\'");
                return `
                <div style="max-width:700px">
                    <button class="btn-secondary" style="width:auto;margin-bottom:12px" onclick="window._selectedTag=null;render()">← Volver a Etiquetas</button>
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap">
                        <div style="font-size:18px;font-weight:700">#${escapeHtml(window._selectedTag)} · ${items.length}</div>
                        <div style="display:flex;gap:8px">
                            <button class="finance-oneoff-btn" onclick="renameTag('${tagEsc}')">✎ Renombrar</button>
                            <button class="finance-oneoff-btn" style="color:#dc2626" onclick="deleteTagEverywhere('${tagEsc}')">Eliminar etiqueta</button>
                        </div>
                    </div>
                    ${items.map(e => {
                        const cat = categories.find(c => c.id === e.categoryId);
                        const color = cat?.color || 'var(--text-secondary)';
                        return `
                        <div class="entry-item ${e.status === 'Completado' ? 'bone-surface goal-completed-bone' : ''}" data-open-entry="${e.id}">
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
                <input class="modal-input" placeholder="Buscar etiqueta..." value="${escapeHtml(window._tagFilter || '')}" oninput="filterTagsView(this.value)">
                <div style="font-size:11px;color:var(--text-secondary);margin:8px 0 16px">Consejo: escribe etiquetas como <strong>padre/hijo</strong> (p. ej. "trabajo/urgente") para agruparlas en jerarquías.</div>
                <div id="tags-cloud-list">${renderTagsCloudList()}</div>
            </div>`;
        }

        // ============================================================
        //  SUGERENCIAS
        // ============================================================
        function renderSuggestions() {
            return `
                <div style="max-width:600px">
                    <div class="chart-container" style="margin-bottom:16px">
                        <div class="chart-title">Sugerencias</div>
                        <div style="font-size:12px;color:var(--text-secondary);margin:8px 0 14px">¿Hay algo que eches en falta, o que cambiarías? Cuéntamelo — lo leo yo directamente.</div>
                        <textarea id="suggestion-text" class="modal-input" rows="4" placeholder="Escribe tu sugerencia..."></textarea>
                        <button class="btn-modal-primary" style="width:auto" onclick="submitSuggestion()">Enviar sugerencia</button>
                    </div>
                    <div class="chart-container" id="my-suggestions-section" style="display:none">
                        <div class="chart-title">Tus sugerencias anteriores</div>
                        <div id="my-suggestions-list" style="margin-top:8px"></div>
                    </div>
                </div>`;
        }

        async function submitSuggestion() {
            const textarea = document.getElementById('suggestion-text');
            const texto = textarea?.value.trim();
            if (!texto) { showToast('Escribe algo antes de enviar', true); return; }
            try {
                const { data: { user } } = await sb.auth.getUser();
                const { error } = await sb.from('sugerencias').insert({ user_id: user.id, texto });
                if (error) throw error;
                textarea.value = '';
                showToast('Sugerencia enviada, ¡gracias!');
                loadMySuggestions();
            } catch (e) {
                console.error('Error enviando sugerencia:', e);
                showToast('No se pudo enviar la sugerencia', true);
            }
        }

        async function loadMySuggestions() {
            const section = document.getElementById('my-suggestions-section');
            const list = document.getElementById('my-suggestions-list');
            if (!section || !list) return;
            const { data: { user } } = await sb.auth.getUser();
            const { data } = await sb.from('sugerencias').select('*').eq('user_id', user.id).order('creado_en', { ascending: false });
            if (!data || !data.length) { section.style.display = 'none'; return; }
            section.style.display = '';
            list.innerHTML = data.map(s => `
                <div style="padding:9px 0;border-bottom:1px solid var(--border)">
                    <div style="font-size:12.5px;color:var(--text-primary);white-space:pre-line">${escapeHtml(s.texto)}</div>
                    <div style="font-size:10.5px;color:var(--text-secondary);margin-top:4px">${new Date(s.creado_en).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                </div>
            `).join('');
        }

        // ============================================================
        //  NOTIFICACIONES PUSH
        //  Web Push estándar (funciona en PWA — iOS 16.4+, Android, escritorio
        //  — y dentro de la app nativa, porque ambas cargan esta misma web).
        //  La clave pública VAPID es pública por diseño, no es un secreto.
        //  El envío real lo hace la función de Supabase "send-push" con la
        //  clave privada correspondiente guardada como secreto.
        // ============================================================
        const BITACORA_VAPID_PUBLIC_KEY = 'BG0bTxTamqFW-3hdbkN5gGFV52wc9iA8Nuig-pMwXQmWG1ErG-kdwO44qXm0XWCSEyZ4qJma50aVTK_EN-Hs62c';

        function urlBase64ToUint8Array(base64String) {
            const padding = '='.repeat((4 - base64String.length % 4) % 4);
            const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
            const rawData = atob(base64);
            const output = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
            return output;
        }

        async function pushNotificationsStatus() {
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
            if (typeof Notification === 'undefined') return 'unsupported';
            if (Notification.permission === 'denied') return 'denied';
            try {
                const reg = await navigator.serviceWorker.ready;
                const sub = await reg.pushManager.getSubscription();
                return sub ? 'enabled' : 'disabled';
            } catch (e) { return 'unsupported'; }
        }

        async function enablePushNotifications() {
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
                showToast('Este navegador no soporta notificaciones push', true);
                return false;
            }
            try {
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') { showToast('No se han activado las notificaciones', true); return false; }
                const reg = await navigator.serviceWorker.ready;
                let sub = await reg.pushManager.getSubscription();
                if (!sub) {
                    sub = await reg.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(BITACORA_VAPID_PUBLIC_KEY)
                    });
                }
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return false;
                const { error } = await sb.from('push_subscriptions').upsert({
                    user_id: user.id,
                    endpoint: sub.endpoint,
                    subscription: sub.toJSON(),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'endpoint' });
                if (error) throw error;
                showToast('Notificaciones activadas');
                return true;
            } catch (e) {
                console.error('enablePushNotifications', e);
                showToast('No se pudieron activar las notificaciones', true);
                return false;
            }
        }

        async function disablePushNotifications() {
            try {
                const reg = await navigator.serviceWorker.ready;
                const sub = await reg.pushManager.getSubscription();
                if (sub) {
                    try { await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); } catch (e) { console.error(e); }
                    await sub.unsubscribe();
                }
                showToast('Notificaciones desactivadas');
            } catch (e) {
                console.error('disablePushNotifications', e);
                showToast('No se pudieron desactivar', true);
            }
        }

        async function togglePushNotifications() {
            const status = await pushNotificationsStatus();
            if (status === 'enabled') await disablePushNotifications();
            else await enablePushNotifications();
            loadSettingsPushInfo();
        }

        function renderPushSettingsBody(status) {
            if (status === 'unsupported') {
                return `<div style="font-size:12.5px;color:var(--text-secondary)">Este navegador no soporta notificaciones push.</div>`;
            }
            if (status === 'denied') {
                return `<div style="font-size:12.5px;color:var(--text-secondary)">Bloqueadas desde los ajustes del navegador/sistema — actívalas ahí para poder usarlas aquí.</div>`;
            }
            if (status === 'cargando') {
                return `<div style="font-size:12.5px;color:var(--text-secondary)">Cargando...</div>`;
            }
            const enabled = status === 'enabled';
            return `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
                    <div style="font-size:12.5px;color:var(--text-secondary)">${enabled ? 'Activadas en este dispositivo.' : 'Recibe avisos de Bitácora en este dispositivo.'}</div>
                    <button class="finance-pro-switch ${enabled ? 'on' : ''}" onclick="togglePushNotifications()" title="${enabled ? 'Desactivar' : 'Activar'} notificaciones" aria-label="Notificaciones">
                        <span class="finance-pro-switch-knob"></span>
                    </button>
                </div>`;
        }

        async function loadSettingsPushInfo() {
            const body = document.getElementById('settings-push-body');
            if (!body) return;
            const status = await pushNotificationsStatus();
            body.innerHTML = renderPushSettingsBody(status);
        }

        function renderSettings() {
            const devStatus = devModeActive ? 'Activado' : 'Desactivado';
            const devColor = devModeActive ? 'var(--accent-purple)' : 'var(--text-secondary)';

            return `
                <div style="max-width:600px">
                    <div class="chart-container" style="margin-bottom:16px" id="settings-subscription-section">
                        <div class="chart-title">Suscripción</div>
                        <div id="settings-subscription-body" style="margin-top:10px;font-size:12.5px;color:var(--text-secondary)">Cargando...</div>
                    </div>

                    <div class="chart-container" style="margin-bottom:16px" id="settings-account-section">
                        <div class="chart-title">Datos de la cuenta</div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
                            <button class="btn-secondary" style="width:auto" onclick="exportData()">📤 Exportar datos</button>
                            <button class="btn-secondary" style="width:auto" onclick="document.getElementById('import-input').click()">📥 Importar datos</button>
                        </div>
                        <div style="font-size:11px;color:var(--text-secondary);margin-top:8px">Exporta o importa todos tus datos (entradas, categorías, notas, etc.) en formato JSON.</div>
                    </div>

                    <div class="chart-container" style="margin-bottom:16px" id="settings-push-section">
                        <div class="chart-title">Notificaciones</div>
                        <div id="settings-push-body" style="margin-top:10px">${renderPushSettingsBody('cargando')}</div>
                    </div>

                    <div class="chart-container" style="margin-bottom:16px">
                        <div class="chart-title">Qué es Bitácora</div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
                            <button class="btn-secondary" style="width:auto" onclick="openAboutBitacora()">ⓘ Qué es Bitácora, a fondo</button>
                            <button class="btn-secondary" id="pwa-install-btn" style="width:auto;display:none" onclick="handlePwaInstallClick()">⭳ Descargar Bitácora</button>
                        </div>
                    </div>

                    <div class="chart-container" style="margin-bottom:16px" id="settings-appearance-section">
                        <div class="chart-title">Apariencia</div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
                            <button class="btn-secondary" style="width:auto" onclick="toggleTheme()">Cambiar tema</button>
                            <button class="btn-secondary" style="width:auto" onclick="toggleMode()">Alternar modo ancho</button>
                        </div>
                    </div>

                    <div class="chart-container" style="margin-bottom:16px" id="settings-advanced-section">
                        <div class="chart-title">Avanzado</div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
                            <button class="btn-secondary" style="width:auto;color:${devColor}" onclick="toggleDeveloperMode()">⚙ Modo desarrollador: ${devStatus}</button>
                        </div>
                        <div style="font-size:11px;color:var(--text-secondary);margin-top:8px">Activa el modo desarrollador para acceder a funciones ocultas (ej. Vault).</div>
                    </div>

                    <div class="chart-container" style="margin-bottom:16px" id="settings-prompts-section">
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

                    <div class="chart-container" id="settings-danger-section">
                        <div class="chart-title" style="color:#dc2626">Zona de riesgo</div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
                            <button class="btn-secondary" style="width:auto;color:#dc2626" onclick="handleLogoutAllDevices()">⏻ Cerrar sesión en todos los dispositivos</button>
                        </div>
                        <div style="font-size:11px;color:var(--text-secondary);margin-top:8px">Esto cerrará tu sesión en todos los navegadores y dispositivos donde hayas iniciado sesión.</div>
                    </div>
                </div>`;
        }

        // Rellena la sección "Suscripción" de Ajustes aparte, porque
        // necesita una consulta a Supabase (renderSettings() es síncrono,
        // igual que ya hacen loadDocuments()/loadFriendsViewData() con
        // sus propias secciones).
        async function loadSettingsSubscriptionInfo() {
            const body = document.getElementById('settings-subscription-body');
            if (!body) return;
            const { data: { user } } = await sb.auth.getUser();
            if (!user) return;
            const sub = await getSubscriptionStatus(user, { allowRetry: false });

            if (sub.estado === 'legado') {
                body.innerHTML = `
                    <div class="settings-subscription-card settings-subscription-card-legado">
                        <div class="settings-subscription-status">Acceso gratuito permanente</div>
                        <div class="settings-subscription-note">Cuenta anterior al lanzamiento de pago.</div>
                    </div>`;
                return;
            }
            if (sub.estado === 'sin_suscripcion' || sub.estado === 'canceled') {
                body.innerHTML = `
                    <div class="settings-subscription-card settings-subscription-card-neutral">
                        <div class="settings-subscription-status">${sub.estado === 'canceled' ? 'Suscripción terminada' : 'Sin suscripción activa'}</div>
                        <div class="settings-subscription-note">${sub.estado === 'canceled' ? 'Ya no tienes acceso a Bitácora.' : ''}</div>
                    </div>`;
                return;
            }

            const planLabel = sub.plan === 'anual' ? 'anual' : 'mensual';
            const fecha = sub.periodo_fin
                ? new Date(sub.periodo_fin).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
                : null;

            if (sub.cancela_al_final_periodo) {
                body.innerHTML = `
                    <div class="settings-subscription-card">
                        <div class="settings-subscription-status">Suscripción ${planLabel} · se cancela${fecha ? ' el ' + fecha : ''}</div>
                        <div class="settings-subscription-note">Mantienes el acceso hasta esa fecha. No se te volverá a cobrar.</div>
                    </div>`;
                return;
            }

            body.innerHTML = `
                <div class="settings-subscription-card">
                    <div class="settings-subscription-status">Suscripción ${planLabel}${sub.estado === 'trialing' ? ' (en prueba)' : ''} · se renueva${fecha ? ' el ' + fecha : ''}</div>
                    <button class="btn-secondary" style="width:auto;margin-top:10px;color:#7f1d1d" onclick="confirmCancelSubscription()">Cancelar suscripción</button>
                </div>`;
        }

        function confirmCancelSubscription() {
            showModal(`
                <div class="modal-title">Cancelar suscripción<button class="modal-close" onclick="closeModal()">✕</button></div>
                <p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:22px">
                    Mantendrás el acceso hasta el final del periodo ya pagado. No se te volverá a cobrar después.
                </p>
                <div style="display:flex;gap:8px">
                    <button class="btn-secondary" style="width:auto;flex:1" onclick="closeModal()">Seguir suscrito</button>
                    <button class="btn-secondary" style="width:auto;flex:1;background:#7f1d1d;color:#fff;border-color:#7f1d1d" onclick="closeModal();executeCancelSubscription()">Sí, cancelar</button>
                </div>
            `);
        }

        async function executeCancelSubscription() {
            try {
                const { data: { session } } = await sb.auth.getSession();
                const res = await fetch(`${SUPABASE_URL}/functions/v1/cancelar-suscripcion`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Error desconocido');
                showToast('Suscripción cancelada. Conservas el acceso hasta el final del periodo.');
                loadSettingsSubscriptionInfo();
            } catch (e) {
                console.error('Error cancelando suscripción:', e);
                showToast('No se pudo cancelar: ' + e.message, true);
            }
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

        let goalViewMode = 'list';
        function setGoalViewMode(mode) { goalViewMode = mode; render(); }

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

                        <div class="empty-title">Sin objetivos</div>
                        <div class="empty-sub">Pulsa el botón + y selecciona "Objetivo"</div>
                    </div>`;
            }

            const thisYear = String(new Date().getFullYear());
            const activeCount = goals.filter(g => g.status !== 'Completado').length;
            const completedThisYear = goals.filter(g => g.status === 'Completado' && (g.date || '').startsWith(thisYear)).length;

            let html = `<div style="max-width:980px">
                <div class="culture-tabs" style="margin-bottom:18px">
                    <button class="culture-tab ${goalViewMode === 'list' ? 'active' : ''}" onclick="setGoalViewMode('list')">Lista</button>
                    <button class="culture-tab ${goalViewMode === 'kanban' ? 'active' : ''}" onclick="setGoalViewMode('kanban')">Tablero</button>
                </div>
                <div class="goals-summary">
                    <div><strong>${activeCount}</strong><span>activos</span></div>
                    <div><strong>${completedThisYear}</strong><span>completados en ${thisYear}</span></div>
                    <div><strong>${goals.length}</strong><span>en total</span></div>
                </div>`;

            if (goalViewMode === 'kanban') {
                html += renderGoalsKanban(goals);
                html += `</div>`;
                return html;
            }

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
                        <div class="entry-item" style="align-items:flex-start" data-open-entry="${e.id}">
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

        function renderGoalsKanban(goals) {
            const columns = ['Pendiente', 'En progreso', 'Completado'];
            return `<div class="kanban-board" id="goals-kanban-board">
                ${columns.map(col => {
                    const items = goals.filter(g => (g.status || 'Pendiente') === col);
                    return `
                    <div class="kanban-column" ondragover="event.preventDefault()" ondrop="goalColumnDrop(event,'${col}')">
                        <div class="kanban-column-head">${col} <span>${items.length}</span></div>
                        ${items.map(g => {
                            const cat = categories.find(c => c.id === g.categoryId);
                            const color = cat?.color || 'var(--text-secondary)';
                            const pct = goalProgressPct(g);
                            return `
                            <div class="kanban-card" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${g.id}')" data-open-entry="${g.id}" style="border-left:4px solid ${color}">
                                <div class="kanban-card-title">${escapeHtml(g.title)}</div>
                                ${pct !== null ? `<div class="progress-bar-bg" style="margin-top:8px"><div class="progress-bar-fill" style="width:${pct}%;background:#2563eb"></div></div>` : ''}
                            </div>`;
                        }).join('')}
                    </div>`;
                }).join('')}
            </div>`;
        }

        async function goalColumnDrop(event, status) {
            event.preventDefault();
            const id = event.dataTransfer.getData('text/plain');
            const g = entries.find(e => e.id === id && e.type === 'goal');
            if (!g || (g.status || 'Pendiente') === status) return;
            g.status = status;
            const board = document.getElementById('goals-kanban-board');
            if (board) board.outerHTML = renderGoalsKanban(entries.filter(e => e.type === 'goal'));
            else render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
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
        function financeSmoothPath(points) {
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
            if (data.length > 1) {
                const pathOf = id => financeSmoothPath(data.map((d, i) => ({ x: Number(x(i).toFixed(1)), y: Number(y(d[id]).toFixed(1)) })));
                const mainSeries = series[series.length - 1];
                const areaPath = `${pathOf(mainSeries.id)} L${x(data.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${x(0).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
                linesSvg = `<path d="${areaPath}" fill="url(#financeTotalGradient)" stroke="none"/>` +
                    series.map((s, idx) => `<path d="${pathOf(s.id)}" fill="none" stroke="${s.color || 'var(--text-secondary)'}" stroke-width="${idx === series.length - 1 ? 2.5 : 2}" ${idx === series.length - 1 ? '' : 'stroke-dasharray="4,4"'} stroke-linecap="round" stroke-linejoin="round"/>`).join('');
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
                        ${yAxisGuides}
                        ${linesSvg}
                        ${targetLine}
                        ${series.map((s, idx) => dotsOf(s, idx === series.length - 1)).join('')}
                        ${xLabels}
                    </svg>
                </div>
                <div class="finance-chart-legend">${series.map(s => `<span class="finance-chart-legend-item"><i style="background:${s.color || 'var(--text-secondary)'}"></i>${escapeHtml(s.name)}</span>`).join('')}</div>
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
        function financeInvestmentStats() {
            const contributions = Array.isArray(financeProfile.investmentContributions) ? financeProfile.investmentContributions : [];
            const totalAportado = contributions.reduce((s, c) => s + Number(c.amount || 0), 0);
            const valorActual = Number(financeProfile.invested || 0);
            const gain = valorActual - totalAportado;
            const gainPct = totalAportado > 0 ? (gain / totalAportado) * 100 : null;
            return { meses: contributions.length, totalAportado, valorActual, gain, gainPct };
        }

        function renderInvestmentPanel() {
            const stats = financeInvestmentStats();
            const fc = financeProfile.forecastProfile || {};
            const monthKey = financeMonthKey();
            const yaActualizado = (financeProfile.investmentContributions || []).some(c => c.month === monthKey);
            const needsOnboarding = !(financeProfile.investmentContributions || []).length;

            if (needsOnboarding) {
                return `
                <section class="finance-panel" id="finance-investment-section">
                    <div class="finance-panel-head">${financePanelHeadIcon(FINANCE_ICON_TREND, 'fin-purple', 'Largo plazo', 'Inversión')}</div>
                    <div class="finance-empty-line" style="text-align:center;margin-top:4px">Indica tu punto de partida — cuánto llevas invertido y cuánto vale ahora mismo — para poder comparar aportaciones con valor actual mes a mes.</div>
                    <button class="finance-oneoff-btn" style="margin-top:12px" onclick="openInvestmentOnboarding()">Configurar inversión</button>
                </section>`;
            }

            const maxBar = Math.max(stats.totalAportado, stats.valorActual, 1);
            const gainCls = stats.gain > 0 ? 'positive' : stats.gain < 0 ? 'negative' : 'neutral';
            return `
            <section class="finance-panel" id="finance-investment-section">
                <div class="finance-panel-head">${financePanelHeadIcon(FINANCE_ICON_TREND, 'fin-purple', 'Largo plazo', 'Inversión')}<button class="finance-icon-btn" title="Ajustes" onclick="openInvestmentAccountEditor()">✎</button></div>
                <div class="finance-invest-headline">
                    <div><span>Valor actual</span><strong id="finance-invest-value" data-value="${stats.valorActual}">${financeMoney(stats.valorActual)}</strong></div>
                    <span class="finance-trend-chip ${gainCls}">${stats.gain >= 0 ? '+' : ''}${financeMoney(stats.gain)}${stats.gainPct !== null ? ` · ${stats.gain >= 0 ? '+' : ''}${stats.gainPct.toFixed(1)}%` : ''}</span>
                </div>
                <div class="finance-invest-bars">
                    <div class="finance-invest-bar-row"><span>Aportado</span><div class="finance-invest-bar-track"><div class="finance-invest-bar-fill" data-target-width="${(stats.totalAportado / maxBar) * 100}%" style="width:0"></div></div><strong>${financeMoney(stats.totalAportado)}</strong></div>
                    <div class="finance-invest-bar-row"><span>Valor actual</span><div class="finance-invest-bar-track"><div class="finance-invest-bar-fill finance-invest-bar-fill-accent" data-target-width="${(stats.valorActual / maxBar) * 100}%" style="width:0"></div></div><strong>${financeMoney(stats.valorActual)}</strong></div>
                </div>
                <div class="finance-empty-line" style="margin-top:10px">${stats.meses} aportación${stats.meses === 1 ? '' : 'es'} registrada${stats.meses === 1 ? '' : 's'}${fc.investMonthlyPlan ? ` · plan: ${financeMoney(fc.investMonthlyPlan)}/mes` : ''}${yaActualizado ? ` · ✓ ${financeMonthLabel(monthKey)} ya registrado` : ''}</div>
                <button class="finance-oneoff-btn" style="margin-top:10px" onclick="openInvestmentMonthlyUpdate()">nueva aportación.</button>
            </section>`;
        }

        // Primer contacto con la tarjeta de Inversión: fija el punto de
        // partida (dinero realmente puesto vs. valor de partida del fondo,
        // que pueden no coincidir si ya venía de antes) antes de empezar
        // con las actualizaciones mensuales.
        function openInvestmentOnboarding() {
            showModal(`
                <div class="modal-title">Configurar inversión</div>
                <div class="finance-modal-note" style="margin-bottom:12px">A partir de aquí, cada mes solo tendrás que actualizar estos dos datos.</div>
                <div class="modal-label">Dinero inicial aportado (€)</div>
                <input id="invest-onboard-initial" class="modal-input" type="number" min="0" step="0.01" placeholder="0.00">
                <div class="modal-label">Valor inicial del fondo (€)</div>
                <input id="invest-onboard-value" class="modal-input" type="number" min="0" step="0.01" value="${Number(financeProfile.invested || 0) || ''}" placeholder="0.00">
                <button class="btn-modal-primary" onclick="saveInvestmentOnboarding()">Empezar a hacer seguimiento</button>
            `);
            setTimeout(() => document.getElementById('invest-onboard-initial')?.focus(), 50);
        }

        async function saveInvestmentOnboarding() {
            const initial = Math.max(0, Number(document.getElementById('invest-onboard-initial')?.value) || 0);
            const value = Math.max(0, Number(document.getElementById('invest-onboard-value')?.value) || 0);
            financeProfile.investmentContributions = [{ month: financeMonthKey(), amount: initial, initial: true }];
            financeProfile.invested = value;
            closeModal();
            refreshCurrentMonthSnapshot();
            try { await saveData(); showToast('Inversión configurada'); render(); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        // Ritual mensual único: valor actual del fondo + aportación de este
        // mes en el mismo paso, en vez de dos acciones sueltas (editar valor
        // por un lado, marcar aportación por otro) que era fácil olvidar
        // hacer juntas.
        // Permite corregir el valor de la inversión (y su aportación) no
        // solo del mes en curso, sino también de los 2 meses anteriores —
        // útil si te olvidaste de actualizarla a tiempo. Corregir un mes
        // pasado solo toca ese registro histórico, nunca el valor en vivo.
        function openInvestmentMonthlyUpdate(monthKey) {
            monthKey = monthKey || financeMonthKey();
            const isCurrent = monthKey === financeMonthKey();
            const fc = financeProfile.forecastProfile || {};
            const existing = (financeProfile.investmentContributions || []).find(c => c.month === monthKey);
            const histEntry = (financeProfile.history || []).find(h => h.month === monthKey);
            const histValue = histEntry?.accounts?.invested ?? histEntry?.invested;
            const currentValue = isCurrent ? Number(financeProfile.invested || 0) : (histValue !== undefined ? Number(histValue) : '');
            const now = new Date();
            const monthOptions = [0, 1, 2].map(back => financeMonthKey(new Date(now.getFullYear(), now.getMonth() - back, 1)));
            showModal(`
                <div class="modal-title">Actualizar inversión</div>
                <div class="modal-label">Mes</div>
                <select class="modal-input" onchange="openInvestmentMonthlyUpdate(this.value)">
                    ${monthOptions.map(m => `<option value="${m}" ${m === monthKey ? 'selected' : ''}>${escapeHtml(financeMonthLabel(m))}</option>`).join('')}
                </select>
                <div class="modal-label">Valor del fondo (€)</div>
                <input id="invest-update-value" class="modal-input" type="number" min="0" step="0.01" value="${currentValue}">
                <div class="modal-label">Aportación de ${escapeHtml(financeMonthLabel(monthKey))} (€)</div>
                <input id="invest-update-contrib" class="modal-input" type="number" min="0" step="0.01" value="${existing ? existing.amount : (isCurrent ? (fc.investMonthlyPlan || '') : '')}" placeholder="0.00">
                ${!isCurrent ? `<div class="finance-modal-note" style="margin-top:8px">Estás corrigiendo un mes anterior — no cambia el valor actual de tu inversión, solo el registro histórico de ese mes (y su línea en la gráfica).</div>` : ''}
                <button class="btn-modal-primary" style="margin-top:10px" onclick="saveInvestmentMonthlyUpdate('${monthKey}')">Guardar</button>
            `);
            setTimeout(() => document.getElementById('invest-update-value')?.focus(), 50);
        }

        async function saveInvestmentMonthlyUpdate(monthKey) {
            const value = Math.max(0, Number(document.getElementById('invest-update-value')?.value) || 0);
            const contribRaw = document.getElementById('invest-update-contrib')?.value;
            const contrib = contribRaw === '' ? 0 : Math.max(0, Number(contribRaw) || 0);
            const isCurrent = monthKey === financeMonthKey();

            financeProfile.investmentContributions = (financeProfile.investmentContributions || []).filter(c => c.month !== monthKey);
            if (contrib > 0) financeProfile.investmentContributions.push({ month: monthKey, amount: contrib });

            if (isCurrent) {
                financeProfile.invested = value;
                refreshCurrentMonthSnapshot();
            } else {
                let history = Array.isArray(financeProfile.history) ? [...financeProfile.history] : [];
                const idx = history.findIndex(h => h.month === monthKey);
                const base = idx >= 0 ? history[idx] : { month: monthKey, date: new Date().toISOString() };
                const accounts = { ...financeHistoryEntryAccountsBaseline(base), invested: value };
                const cash = Number(accounts.cash || 0), emergency = Number(accounts.emergency || 0);
                const entry = { ...base, month: monthKey, invested: value, cash, emergency, safe: cash + emergency, total: cash + emergency + value, accounts };
                if (idx >= 0) history[idx] = entry; else history.push(entry);
                financeProfile.history = history.sort((a, b) => String(a.month).localeCompare(String(b.month))).slice(-36);
            }
            closeModal();
            if (currentView === 'finances') render();
            try { await saveData(); showToast('Inversión actualizada'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
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
                { id: 'cat_regalo', name: 'Regalos', icon: 'gift', type: 'income', color: FINANCE_PRO_PALETTE[13] },
                { id: 'cat_reembolso', name: 'Reembolsos', icon: 'repeat', type: 'income', color: FINANCE_PRO_PALETTE[14] },
                { id: 'cat_otros_ingreso', name: 'Otros ingresos', icon: 'other', type: 'income', color: FINANCE_PRO_PALETTE[15] },
                { id: 'cat_viajes', name: 'Viajes y vacaciones', icon: 'plane', type: 'expense', color: FINANCE_PRO_PALETTE[8] },
                { id: 'cat_mascotas', name: 'Mascotas', icon: 'paw', type: 'expense', color: FINANCE_PRO_PALETTE[9] },
                { id: 'cat_deporte', name: 'Deporte', icon: 'dumbbell', type: 'expense', color: FINANCE_PRO_PALETTE[2] },
                { id: 'cat_tecnologia', name: 'Tecnología', icon: 'laptop', type: 'expense', color: FINANCE_PRO_PALETTE[6] },
                { id: 'cat_bienestar', name: 'Bienestar y belleza', icon: 'sparkle', type: 'expense', color: FINANCE_PRO_PALETTE[13] },
                { id: 'cat_alquileres', name: 'Alquileres', icon: 'key', type: 'income', color: FINANCE_PRO_PALETTE[7] }
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

        // Un gasto recurrente con cuenta PRO asignada se registra solo como
        // movimiento el día de cargo de cada mes — una vez por mes y por
        // gasto (_proLastCharged evita duplicarlo si se re-renderiza varias
        // veces el mismo día). Queda sin categoría, igual que un movimiento
        // importado, para no adivinar mal una categoría.
        function ensureRecurringProCharges() {
            const monthKey = financeMonthKey();
            const today = new Date();
            const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            let changed = false;
            entries.forEach(e => {
                if (!(e.type === 'subscription' || e.type === 'fixed_expense')) return;
                if (e.active === false) return;
                if (!e.proAccount || !FINANCE_PRO_ACCOUNT_KEYS.includes(e.proAccount)) return;
                const chargeDay = Math.min(Number(e.renewalDay) || 1, daysInMonth);
                if (today.getDate() < chargeDay) return;
                if (e._proLastCharged === monthKey) return;
                financePro.transactions.push({
                    id: 'ptx_rec_' + e.id + '_' + monthKey,
                    date: monthKey + '-' + String(chargeDay).padStart(2, '0'),
                    account: e.proAccount,
                    type: 'expense',
                    amount: Number(e.amount) || 0,
                    note: e.title || (e.type === 'subscription' ? 'Suscripción' : 'Gasto fijo'),
                    recurringEntryId: e.id
                });
                e._proLastCharged = monthKey;
                changed = true;
            });
            if (changed) saveData().catch(err => console.error(err));
        }

        function financeProAccountBalance(key) {
            let bal = Number(financePro.accounts[key]?.balance0 || 0);
            financePro.transactions.forEach(t => {
                if (t.type === 'transfer') {
                    if (t.account === key) bal -= Number(t.amount) || 0;
                    if (t.transferTo === key) bal += Number(t.amount) || 0;
                } else if (t.account === key) {
                    bal += (t.type === 'income' ? 1 : -1) * (Number(t.amount) || 0);
                }
            });
            return bal;
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
            const txs = financePro.transactions;
            if (!txs.length) return [];
            const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
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
            const results = months.map(m => {
                const cutoff = m + '-31';
                let bal = keys.reduce((s, k) => s + Number(financePro.accounts[k]?.balance0 || 0), 0);
                txs.forEach(t => {
                    if (t.date > cutoff) return;
                    if (t.type === 'transfer') {
                        if (keys.includes(t.account) && !keys.includes(t.transferTo)) bal -= Number(t.amount) || 0;
                        if (keys.includes(t.transferTo) && !keys.includes(t.account)) bal += Number(t.amount) || 0;
                    } else if (keys.includes(t.account)) {
                        bal += (t.type === 'income' ? 1 : -1) * (Number(t.amount) || 0);
                    }
                });
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
                return `<div class="finance-empty-state" style="padding:${compact ? '10px 0' : '30px 0'}">Sin histórico suficiente todavía — necesitas movimientos en al menos 2 meses distintos.</div>`;
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

        // Vista general: dos líneas sobre la misma escala — la suma de las
        // cuentas PRO (con relleno degradado, la serie "principal") y el
        // patrimonio total (+ emergencia + fondo a largo), en discontinuo
        // para diferenciarla sin saturar el gráfico con dos áreas.
        function renderFinanceProMultiLineChart(seriesList, idSuffix) {
            const base = seriesList[0].data;
            if (!base || base.length < 2) {
                return `<div class="finance-empty-state" style="padding:30px 0">Sin histórico suficiente todavía — necesitas movimientos en al menos 2 meses distintos.</div>`;
            }
            const W = 900, H = 200, padX = 28, padT = 8, padB = 22;
            const innerW = W - padX * 2, innerH = H - padT - padB;
            const allValues = seriesList.flatMap(s => s.data.map(d => d.balance));
            const minVal = Math.min(0, ...allValues);
            const maxVal = Math.max(1, ...allValues) * 1.08;
            const n = base.length;
            const x = i => n === 1 ? padX + innerW / 2 : padX + innerW * i / (n - 1);
            const y = v => padT + innerH - ((v - minVal) / (maxVal - minVal || 1)) * innerH;
            const step = Math.max(1, Math.ceil(n / 6));
            const labels = base.map((d, i) => (i % step === 0 || i === n - 1)
                ? `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="var(--text-muted)">${escapeHtml(financeMonthLabel(d.month).split(' de ')[0])}</text>` : '').join('');
            const gridLines = financeChartGridLines(minVal, maxVal, padX, padT, innerW, innerH, W, 3);
            const lines = seriesList.map((s, si) => {
                const path = financeSmoothPath(s.data.map((d, i) => [x(i), y(d.balance)]));
                const points = s.data.map((d, i) => {
                    const tip = escapeHtml(`${s.label} · ${financeMonthLabel(d.month)}: ${financeMoney(d.balance)}`).replace(/"/g, '&quot;');
                    return `<circle cx="${x(i).toFixed(1)}" cy="${y(d.balance).toFixed(1)}" r="9" fill="transparent" onmousemove="financeProChartTooltipShow(event,'${idSuffix}-${si}-${i}',&quot;${tip}&quot;)" onmouseleave="financeProChartTooltipHide('${idSuffix}-${si}-${i}')" onclick="financeProChartTooltipShow(event,'${idSuffix}-${si}-${i}',&quot;${tip}&quot;)"/>
                        <circle cx="${x(i).toFixed(1)}" cy="${y(d.balance).toFixed(1)}" r="3.5" fill="${s.color}" style="pointer-events:none"/>`;
                }).join('');
                const area = si === 0 ? `<path d="${path} L${x(n - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${x(0).toFixed(1)},${(padT + innerH).toFixed(1)} Z" fill="url(#fpGrad_${idSuffix}_${si})" stroke="none"/>` : '';
                return `<defs><linearGradient id="fpGrad_${idSuffix}_${si}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style="stop-color:${s.color};stop-opacity:0.22"/><stop offset="100%" style="stop-color:${s.color};stop-opacity:0"/></linearGradient></defs>
                    ${area}
                    <path d="${path}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${si === 1 ? 'stroke-dasharray="5,4"' : ''}/>
                    ${points}`;
            }).join('');
            const legend = `<div class="finance-chart-legend">${seriesList.map((s, si) => `<span><i style="background:${s.color};${si === 1 ? 'border-radius:0;height:2px;width:12px;margin-top:5px' : ''}"></i>${escapeHtml(s.label)}</span>`).join('')}</div>`;
            return `${legend}<svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:280px;display:block">
                ${gridLines}
                ${lines}
                ${labels}
            </svg>`;
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
        //  FINANZAS PRO — rango de la gráfica y estadísticas
        // ============================================================
        let financeProChartRange = 'all';
        const FINANCE_PRO_CHART_RANGES = [
            { key: '3m', label: '3M', months: 3 },
            { key: '6m', label: '6M', months: 6 },
            { key: '1y', label: '1A', months: 12 },
            { key: 'all', label: 'Todo', months: null }
        ];

        function financeProSetChartRange(key) {
            financeProChartRange = key;
            const panel = document.getElementById('finance-pro-chart-panel');
            if (panel) panel.outerHTML = renderFinanceProChartPanel();
            requestAnimationFrame(animateFinanceProChartPanel);
        }

        // Dispara las dos micro-animaciones (cifra + líneas) del panel
        // "Vista general" — se llama tras insertarlo en el DOM, nunca desde
        // dentro del propio render*() (necesita medir el <svg> ya montado).
        function animateFinanceProChartPanel() {
            const valueEl = document.getElementById('finance-pro-chart-total');
            if (valueEl) bitacoraAnimateNumber(valueEl, Number(valueEl.dataset.value || 0), financeMoney);
            bitacoraAnimateChart(document.getElementById('finance-pro-chart-panel'));
        }

        function renderFinanceProChartPanel() {
            const total = financeProTotalBalance();
            const rangeDef = FINANCE_PRO_CHART_RANGES.find(r => r.key === financeProChartRange) || FINANCE_PRO_CHART_RANGES[3];
            const mainSeries = financeProMonthlyBalances(null, rangeDef.months);
            const totalSeries = financeUnifiedPatrimonySeries(rangeDef.months);
            return `<section class="finance-panel finance-chart-panel" id="finance-pro-chart-panel">
                <div class="finance-panel-head">
                    ${financePanelHeadIcon(FINANCE_ICON_CHART, 'fin-slate', 'Vista general', 'Suma cuentas principales')}
                    <button class="finance-icon-btn" title="Ver estadísticas" onclick="openFinanceProStatsModal()">${FINANCE_ICON_STATS}</button>
                </div>
                <div class="finance-networth-value finance-networth-value-compact" id="finance-pro-chart-total" data-value="${total}" style="margin:2px 0 10px">${financeMoney(total)}</div>
                <div class="finance-pro-range-tabs">
                    ${FINANCE_PRO_CHART_RANGES.map(r => `<button class="${financeProChartRange === r.key ? 'active' : ''}" onclick="financeProSetChartRange('${r.key}')">${r.label}</button>`).join('')}
                </div>
                ${renderFinanceProMultiLineChart([
                    { data: mainSeries, color: 'var(--text-primary)', label: 'Suma cuentas principales' },
                    { data: totalSeries, color: '#b3872a', label: 'Patrimonio total' }
                ], 'total')}
            </section>`;
        }

        function financeProMonthTotals(monthKey) {
            let income = 0, expense = 0;
            financePro.transactions.forEach(t => {
                if (t.date.slice(0, 7) !== monthKey) return;
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
                if (t.type !== 'expense' || t.date.slice(0, 7) !== now) return;
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
                <div class="modal-title">Estadísticas · ${escapeHtml(financeMonthLabel(s.now))}</div>
                <div class="finance-stats-grid">
                    <div class="finance-stats-card">
                        <div class="finance-stats-label">Gastos este mes</div>
                        <div class="finance-stats-value finance-negative">${financeMoney(s.curTotals.expense)}</div>
                        <div class="finance-stats-sub">${financeProPctLabel(expVsPrev)} vs mes anterior · ${financeProPctLabel(expVsAvg)} vs media (6m)</div>
                    </div>
                    <div class="finance-stats-card">
                        <div class="finance-stats-label">Ingresos este mes</div>
                        <div class="finance-stats-value finance-positive">${financeMoney(s.curTotals.income)}</div>
                        <div class="finance-stats-sub">${financeProPctLabel(incVsPrev)} vs mes anterior · ${financeProPctLabel(incVsAvg)} vs media (6m)</div>
                    </div>
                    <div class="finance-stats-card">
                        <div class="finance-stats-label">Evolución del saldo</div>
                        <div class="finance-stats-value">${financeProPctLabel(s.pctVsPrevMonth)}</div>
                        <div class="finance-stats-sub">vs mes anterior · ${financeProPctLabel(s.pctSinceStart)} desde el primer registro</div>
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
                <div class="modal-title">Modificar saldo · ${escapeHtml(acc.name)}</div>
                <div class="finance-modal-note" style="margin-bottom:12px">Saldo actual: ${financeMoney(current)}. Escribe el saldo real y se creará un movimiento "Ajuste de saldo" con la diferencia para cuadrarlo, sin tocar tu histórico.</div>
                <div class="modal-label">Saldo real (€)</div>
                <input class="modal-input" id="pro-acc-adjust-target" type="number" step="0.01" value="${current.toFixed(2)}">
                <button class="btn-modal-primary" style="margin-top:6px" onclick="saveFinanceProBalanceAdjust()">Guardar</button>
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
                date: new Date().toISOString().slice(0, 10),
                account: key,
                type: diff > 0 ? 'income' : 'expense',
                amount: Math.abs(diff),
                note: 'Ajuste de saldo'
            });
            render();
            try { await saveData(); showToast(`Saldo ajustado · ${diff > 0 ? '+' : '-'}${financeMoney(Math.abs(diff))}`); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function financeProCategorySpend(catId, monthKey) {
            monthKey = monthKey || financeMonthKey();
            return financePro.transactions
                .filter(t => t.type === 'expense' && t.category === catId && t.date.slice(0, 7) === monthKey)
                .reduce((s, t) => s + (Number(t.amount) || 0), 0);
        }

        // Solo se muestran las categorías de gasto con presupuesto puesto
        // (Categorías → presupuesto mensual). Sin ninguna, el panel entero
        // desaparece en vez de quedar vacío ocupando sitio.
        function renderFinanceProBudgetsPanel() {
            const budgets = financePro.categoryBudgets || {};
            const ids = Object.keys(budgets).filter(id => budgets[id] > 0 && financeProCategoryById(id));
            if (!ids.length) return '';
            const monthKey = financeMonthKey();
            return `<section class="finance-panel" style="margin-top:16px">
                <div class="finance-panel-head">
                    ${financePanelHeadIcon(FINANCE_ICON_TARGET, 'fin-pink', financeMonthLabel(monthKey), 'Presupuestos')}
                    <button class="finance-icon-btn" title="Editar presupuestos" onclick="openFinanceProCategoriesModal()">✎</button>
                </div>
                ${ids.map(id => {
                    const cat = financeProCategoryById(id);
                    const spent = financeProCategorySpend(id, monthKey);
                    const budget = budgets[id];
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

        // Serie histórica del "Patrimonio total" (cuentas PRO + fondo de
        // emergencia + fondo a largo/inversión) para la segunda línea de la
        // gráfica — emergencia e inversión no tienen un valor por mes real
        // (se actualizan a mano), así que para cada mes se usa el snapshot
        // del histórico más cercano, sin pasarse de la fecha de ese mes.
        function financeUnifiedPatrimonySeries(rangeMonths) {
            const proSeries = financeProMonthlyBalances(null, rangeMonths);
            const history = [...(financeProfile.history || [])].sort((a, b) => String(a.month).localeCompare(String(b.month)));
            let histIdx = -1;
            return proSeries.map(p => {
                while (histIdx + 1 < history.length && history[histIdx + 1].month <= p.month) histIdx++;
                const snap = histIdx >= 0 ? history[histIdx] : null;
                const extra = snap ? (Number(snap.emergency || 0) + Number(snap.invested || 0)) : (Number(financeProfile.emergency || 0) + Number(financeProfile.invested || 0));
                return { month: p.month, balance: p.balance + extra };
            });
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
            if (avgDelta <= 0) return { text: `A tu ritmo actual (${financeMoney(avgDelta)}/mes de media) no te acercas al objetivo — te faltan ${financeMoney(remaining)}.` };
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
                    <button onclick="financeShiftYearlyPctYear(-1)" aria-label="Año anterior">‹</button>
                    <strong>${year}</strong>
                    <button onclick="financeShiftYearlyPctYear(1)" aria-label="Año siguiente" ${atCurrentYear ? 'disabled' : ''}>›</button>
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
            showModal(`<div class="modal-title">Saldos netos · últimos 6 meses</div>
                <div class="finance-modal-note" style="margin-bottom:6px">Ingresos menos gastos de cada mes en tus cuentas PRO. Las barras tenues por debajo de la línea son meses en negativo.</div>
                ${renderFinanceMonthlyBalancesChart()}`);
        }

        // "Planificación a futuro" — tres botones a modo de tarjeta (blanco
        // y negro, icono grande) que abren cada uno su popup, en vez de tres
        // paneles anchos siempre visibles ocupando toda esa franja.
        function openFinanceRitmoModal() {
            const trend = financeGoalTrendSignal();
            showModal(`
                <section class="finance-panel" id="finance-forecast-section">
                    <div class="finance-panel-head">
                        ${financePanelHeadIcon(FINANCE_ICON_CALENDAR, 'fin-indigo', 'Previsión automática', 'Según tu ritmo real')}
                    </div>
                    <div class="finance-empty-line" style="margin-top:10px">${trend ? escapeHtml(trend.text) : 'Necesitas al menos 2 meses de histórico en tus cuentas PRO para calcular tu previsión.'}</div>
                </section>
            `);
        }

        function openFinanceLargoPlazoModal() {
            showModal(renderInvestmentPanel());
            requestAnimationFrame(animateInvestmentPanel);
        }

        // Cifra "Valor actual" contando hacia arriba + barras de
        // aportado/valor actual creciendo desde 0 al abrir el popup.
        function animateInvestmentPanel() {
            const valueEl = document.getElementById('finance-invest-value');
            if (valueEl) bitacoraAnimateNumber(valueEl, Number(valueEl.dataset.value || 0), financeMoney);
            document.querySelectorAll('#finance-investment-section .finance-invest-bar-fill[data-target-width]').forEach(bar => {
                requestAnimationFrame(() => { bar.style.width = bar.dataset.targetWidth; });
            });
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
        function renderFinanceBitacoraCard(label, iconSvg, variant, onClick, value) {
            const hasValue = value !== undefined;
            return `
                <button class="finance-plan-btn finance-plan-btn-${variant} finance-bitacora-card ${hasValue ? 'finance-bitacora-card-with-value' : ''}" ${onClick ? `onclick="${onClick}"` : ''}>
                    <div class="finance-plan-btn-label">${escapeHtml(label)}</div>
                    <div class="finance-bitacora-card-foot">
                        ${hasValue ? `<div class="finance-bitacora-card-value">${financeMoney(value)}</div>` : ''}
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
                renderFinanceBitacoraCard('recurrentes.', FINANCE_ICON_REFRESH_BOLD, 'outline', 'openRecurringExpensesModal()', recurring),
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

        function renderFinanceProDashboard() {
            ensureCurrentMonthHistory();
            const blurToggleBtn = `<button class="finance-blur-toggle" title="${blurFinances ? 'Mostrar cifras' : 'Ocultar cifras'}" onclick="toggleBlurFinances()">${blurFinances ? FINANCE_EYE_OFF_ICON : FINANCE_EYE_ICON}</button>`;
            return `
            <div class="finance-dashboard ${blurFinances ? 'blurred' : ''}">
                <div class="finance-toolbar-row">
                    <div class="finance-pro-settings-links">
                        <button onclick="openFinanceProAccountsSettings()">✎ Renombrar / saldo inicial</button>
                        <span>·</span>
                        <button onclick="openFinanceProCategoriesModal()">Categorías</button>
                        <span>·</span>
                        <button onclick="openFinanceProImportModal()">${FINANCE_ICON_UPLOAD} Importar</button>
                        <span>·</span>
                        <button onclick="openFinanceProRulesModal()">${FINANCE_ICON_REPEAT} Reglas</button>
                    </div>
                    ${blurToggleBtn}
                </div>
                ${renderFinanceProReviewBanner()}

                ${renderFinanceProChartPanel()}

                ${renderFinanceNetworthCard()}

                <div class="finance-section-head" style="margin-top:20px">
                    <div class="finance-kicker">Cuentas</div>
                </div>
                <div class="finance-pro-accounts-grid">
                    ${FINANCE_PRO_ACCOUNT_KEYS.map(k => renderFinanceProAccountCard(k)).join('')}
                </div>

                ${renderFinanceProBudgetsPanel()}

                <div class="finance-section-head" style="margin-top:24px">
                    <div class="finance-kicker">planificación.</div>
                </div>
                ${renderFinancePlanRow()}

                ${renderFinanceProTxSection()}

                <div class="finance-dashboard-foot-actions" style="margin-top:20px">
                    <button class="finance-oneoff-btn" onclick="openFinanceHistoryCorrectionModal()">✎ Corregir registros</button>
                </div>
            </div>`;
        }

        // ============================================================
        //  FINANZAS PRO — cuentas (renombrar / saldo inicial)
        // ============================================================
        function openFinanceProAccountsSettings() {
            showModal(`
                <div class="modal-title">Cuentas PRO</div>
                <div class="finance-modal-note" style="margin-bottom:12px">El saldo inicial es el punto de partida de cada cuenta antes de tus movimientos registrados — útil si no vas a importar todo tu historial.</div>
                ${FINANCE_PRO_ACCOUNT_KEYS.map(k => `
                    <div class="modal-label">Nombre</div>
                    <input class="modal-input" id="pro-acc-name-${k}" value="${escapeHtml(financePro.accounts[k].name)}">
                    <div class="modal-label">Saldo inicial (€)</div>
                    <input class="modal-input" id="pro-acc-balance0-${k}" type="number" step="0.01" value="${Number(financePro.accounts[k].balance0 || 0)}" style="margin-bottom:16px">
                `).join('')}
                <button class="btn-modal-primary" onclick="saveFinanceProAccountsSettings()">Guardar</button>
                <button class="btn-secondary" style="margin-top:14px;color:#dc2626" onclick="resetFinancePro()">Restablecer Finanzas PRO</button>
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
                <div class="finance-modal-note" style="margin-bottom:10px">Escribe el importe y toca la cuenta — se guarda al instante sin categoría. Lo ajustas luego desde "Ajustar movimientos".</div>
                <div id="finance-quick-capture-body">${renderFinanceProQuickCaptureBody()}</div>
            `);
        }

        function renderFinanceProQuickCaptureBody() {
            const d = window._financeProQuickDraft;
            return `
                <div class="finance-pro-type-tabs">
                    <button class="${d.type === 'expense' ? 'active' : ''}" onclick="financeProQuickSet('type','expense')">Gasto</button>
                    <button class="${d.type === 'income' ? 'active' : ''}" onclick="financeProQuickSet('type','income')">Ingreso</button>
                </div>
                <input class="modal-input finance-quick-amount-input" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0,00" value="${d.amount}" oninput="financeProQuickSet('amount', this.value)" autofocus>
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
            const amount = Math.abs(Number(d.amount));
            if (!(amount > 0)) { showToast('Introduce un importe válido', true); return; }
            financePro.transactions.push({
                id: 'ptx_q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                date: new Date().toISOString().slice(0, 10),
                account, type: d.type, amount, needsReview: true
            });
            window._financeProQuickDraft = null;
            closeModal();
            render();
            try { await saveData(); showToast('Guardado · ajústalo luego en «Ajustar movimientos»'); }
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
            const pending = financePro.transactions.filter(t => t.needsReview).sort((a, b) => b.date.localeCompare(a.date));
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
        let financeProTxFilter = { account: '', month: '', year: '', search: '' };
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
                        <button class="finance-oneoff-btn" onclick="openFinanceProQuickCaptureModal()">Registro rápido</button>
                        <button class="finance-oneoff-btn finance-chart-config-btn" onclick="openFinanceProTransactionModal()">+ Movimiento</button>
                    </div>
                </div>
                <div id="finance-pro-tx-list">${renderFinanceProTransactionList(false)}</div>
                <button class="finance-oneoff-btn finance-pro-tx-expand-btn" onclick="openFinanceProAllTxModal()">▾ Ver todos los movimientos</button>
            </div>`;
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
            txs.sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
            if (!full) txs = txs.slice(0, 5);
            const groups = {};
            txs.forEach(t => { const m = t.date.slice(0, 7); groups[m] = groups[m] || []; groups[m].push(t); });
            // El detalle mes a mes (ingresos/gastos, barra) vive ahora en la
            // tarjeta ampliable "Resumen anual" — aquí solo queda una
            // cabecera ligera con el neto, para no repetir lo mismo cada vez
            // que se hace scroll por el listado de movimientos.
            return Object.keys(groups).sort().reverse().map(m => {
                const income = groups[m].filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
                const expense = groups[m].filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
                const monthTotal = income - expense;
                return `<div class="finance-pro-tx-month-group">
                    <div class="finance-pro-tx-month-summary finance-pro-tx-month-summary-light">
                        <span class="finance-pro-tx-month-title">${escapeHtml(financeMonthLabel(m))}</span>
                        <span class="finance-pro-tx-month-net ${monthTotal >= 0 ? 'positive' : 'negative'}">${monthTotal >= 0 ? '+' : ''}${financeMoney(monthTotal)}</span>
                    </div>
                    ${groups[m].map(t => renderFinanceProTxRow(t)).join('')}
                </div>`;
            }).join('');
        }

        function renderFinanceProTxRow(t) {
            if (t.type === 'transfer') {
                return `<div class="finance-pro-tx-row" onclick="openFinanceProTransactionModal('${t.id}')">
                    <div class="finance-metric-icon fin-slate finance-pro-tx-icon">${FINANCE_ICON_SWAP}</div>
                    <div class="finance-pro-tx-main">
                        <div class="finance-pro-tx-title">${escapeHtml(financePro.accounts[t.account]?.name || t.account)} → ${escapeHtml(financePro.accounts[t.transferTo]?.name || t.transferTo)}</div>
                        <div class="finance-pro-tx-sub">${t.note ? escapeHtml(t.note) + ' · ' : ''}${financeDateLabelShort(t.date)}</div>
                    </div>
                    <div class="finance-pro-tx-amount">${financeMoney(t.amount)}</div>
                </div>`;
            }
            const cat = financeProCategoryById(t.category);
            return `<div class="finance-pro-tx-row" onclick="openFinanceProTransactionModal('${t.id}')">
                ${financeProCategoryBadge(cat)}
                <div class="finance-pro-tx-main">
                    <div class="finance-pro-tx-title">${escapeHtml(cat ? cat.name : 'Sin categoría')}</div>
                    <div class="finance-pro-tx-sub">${escapeHtml(financePro.accounts[t.account]?.name || t.account)} · ${financeDateLabelShort(t.date)}</div>
                    ${t.note ? `<div class="finance-pro-tx-note">${escapeHtml(t.note)}</div>` : ''}
                </div>
                <div class="finance-pro-tx-amount ${t.type === 'income' ? 'finance-positive' : 'finance-negative'}">${t.type === 'income' ? '+' : '-'}${financeMoney(t.amount)}</div>
            </div>`;
        }

        // ============================================================
        //  FINANZAS PRO — crear / editar / eliminar movimiento
        // ============================================================
        function openFinanceProTransactionModal(id, presetAccount) {
            window._financeProTxEditId = id || null;
            const existing = id ? financePro.transactions.find(t => t.id === id) : null;
            window._financeProTxDraft = existing
                ? { ...existing, category: existing.category || '', transferTo: existing.transferTo || '', note: existing.note || '' }
                : { type: 'expense', account: presetAccount || FINANCE_PRO_ACCOUNT_KEYS[0], date: new Date().toISOString().slice(0, 10), amount: '', category: '', note: '', transferTo: '' };
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
                    <button class="${d.type === 'expense' ? 'active' : ''}" onclick="financeProDraftSet('type','expense')">Gasto</button>
                    <button class="${d.type === 'income' ? 'active' : ''}" onclick="financeProDraftSet('type','income')">Ingreso</button>
                    <button class="${d.type === 'transfer' ? 'active' : ''}" onclick="financeProDraftSet('type','transfer')">Transferencia</button>
                </div>
                <div class="modal-label">Fecha</div>
                <input class="modal-input" type="date" value="${d.date}" onchange="financeProDraftSet('date',this.value)">
                <div class="modal-label">Importe (€)</div>
                <input class="modal-input" type="number" min="0" step="0.01" value="${d.amount}" onchange="financeProDraftSet('amount',this.value)" placeholder="0.00">
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
                <div class="modal-label">Categoría</div>
                <select class="modal-input" onchange="financeProDraftSet('category',this.value)">
                    <option value="">Sin categoría</option>
                    ${cats.map(c => `<option value="${c.id}" ${d.category === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                </select>`}
                <div class="modal-label">Nota (opcional)</div>
                <input class="modal-input" value="${escapeHtml(d.note || '')}" onchange="financeProDraftSet('note',this.value)" placeholder="Ej. Cena con amigos">
                <button class="btn-modal-primary" style="margin-top:6px" onclick="saveFinanceProTransaction()">Guardar</button>
                ${window._financeProTxEditId ? `<button class="btn-secondary" style="margin-top:8px;color:#dc2626" onclick="deleteFinanceProTransaction('${window._financeProTxEditId}')">Eliminar movimiento</button>` : ''}
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
            const amount = Math.abs(Number(d.amount));
            if (!(amount > 0)) { showToast('Introduce un importe válido', true); return; }
            if (d.type === 'transfer' && (!d.transferTo || d.transferTo === d.account)) { showToast('Elige una cuenta destino distinta', true); return; }
            const entry = {
                id: window._financeProTxEditId || ('ptx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
                date: d.date || new Date().toISOString().slice(0, 10),
                account: d.account,
                type: d.type,
                amount,
                category: d.type === 'transfer' ? undefined : (d.category || undefined),
                transferTo: d.type === 'transfer' ? d.transferTo : undefined,
                note: (d.note || '').trim() || undefined
            };
            const idx = financePro.transactions.findIndex(t => t.id === entry.id);
            if (idx >= 0) financePro.transactions[idx] = entry; else financePro.transactions.push(entry);
            window._financeProTxEditId = null; window._financeProTxDraft = null;
            closeModal();
            render();
            try { await saveData(); showToast('Movimiento guardado'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        async function deleteFinanceProTransaction(id) {
            if (!confirm('¿Eliminar este movimiento?')) return;
            financePro.transactions = financePro.transactions.filter(t => t.id !== id);
            window._financeProTxEditId = null; window._financeProTxDraft = null;
            closeModal();
            render();
            try { await saveData(); showToast('Movimiento eliminado'); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
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
                <div class="finance-modal-note" style="margin-bottom:10px">En las de gasto puedes poner un presupuesto mensual — cuando te acerques o te pases, se avisa en Movimientos.</div>
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
                    <button class="btn-secondary" style="width:auto;padding:2px 8px;font-size:11px;color:#dc2626" onclick="deleteFinanceProCategory('${c.id}')">✕</button>
                </div>
                ${c.type === 'expense' ? `
                <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
                    <span style="font-size:10px;color:var(--text-secondary)">Presupuesto mensual (€)</span>
                    <input class="modal-input" style="margin:0;width:90px;padding:5px 8px;font-size:11px" type="number" min="0" step="1" value="${financePro.categoryBudgets[c.id] || ''}" placeholder="Sin límite" onchange="setFinanceProCategoryBudget('${c.id}', this.value)">
                </div>` : ''}
            </div>`;
            const expense = financePro.categories.filter(c => c.type === 'expense');
            const income = financePro.categories.filter(c => c.type === 'income');
            return `<div class="finance-kicker" style="margin:8px 0 4px">Gastos</div>${expense.map(row).join('') || '<div class="finance-empty-line">Ninguna</div>'}
                <div class="finance-kicker" style="margin:14px 0 4px">Ingresos</div>${income.map(row).join('') || '<div class="finance-empty-line">Ninguna</div>'}`;
        }

        async function setFinanceProCategoryBudget(id, value) {
            const amount = Math.max(0, Number(value) || 0);
            financePro.categoryBudgets = financePro.categoryBudgets || {};
            if (amount > 0) financePro.categoryBudgets[id] = amount; else delete financePro.categoryBudgets[id];
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
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
                <div class="finance-modal-note" style="margin-bottom:12px">Para movimientos recurrentes que en realidad son traspasos entre tus propias cuentas (traer saldo de un banco a otro, por ejemplo) — al importar, si el concepto contiene el texto de una regla activa, se registra como traspaso en vez de como ingreso o gasto.</div>
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
                    <button class="finance-icon-btn" title="Eliminar" onclick="deleteFinanceProRule('${r.id}')">✕</button>
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
                <div class="finance-modal-note" style="margin-bottom:12px">Sube el CSV que exporta tu banco o tu app de finanzas (si tienes un Excel, guárdalo primero como CSV). En el siguiente paso indicas qué columna es cada dato.</div>
                <input type="file" id="finance-pro-import-file" accept=".csv,text/csv" class="modal-input" onchange="handleFinanceProImportFile(event)">
                <div id="finance-pro-import-body"></div>
            `);
        }

        // Parser CSV manual (soporta comillas, campos con comas dentro, y
        // detecta solo si el separador es "," o ";" — este último es muy
        // habitual en extractos de bancos españoles).
        function financeProParseCSV(text) {
            const firstLine = text.split(/\r?\n/)[0] || '';
            const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
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
        function financeProGuessColumn(headerRow, patterns, fallback) {
            const idx = headerRow.findIndex(h => patterns.some(p => String(h || '').trim().toLowerCase() === p));
            return idx >= 0 ? idx : fallback;
        }

        function handleFinanceProImportFile(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const rows = financeProParseCSV(String(reader.result));
                if (rows.length < 2) { showToast('El archivo no tiene filas suficientes', true); return; }
                const header = rows[0];
                const date = financeProGuessColumn(header, ['completed date', 'fecha de finalización', 'date', 'fecha'], 0);
                const amount = financeProGuessColumn(header, ['amount', 'importe'], 1);
                const description = financeProGuessColumn(header, ['description', 'descripción', 'concepto'], header.length > 2 ? 2 : 0);
                const category = financeProGuessColumn(header, ['category', 'categoría', 'categoria'], -1);
                const status = financeProGuessColumn(header, ['state', 'estado'], -1);
                window._financeProImport = { rows, mapping: { hasHeader: true, date, amount, description, category, amountOut: 0, amountIn: 1, splitAmount: false, account: FINANCE_PRO_ACCOUNT_KEYS[0], status, skipPending: false } };
                document.getElementById('finance-pro-import-body').innerHTML = renderFinanceProImportMapping();
            };
            reader.onerror = () => showToast('No se pudo leer el archivo', true);
            reader.readAsText(file, 'UTF-8');
        }

        function renderFinanceProImportMapping() {
            const imp = window._financeProImport;
            const headerRow = imp.rows[0];
            const previewRows = imp.rows.slice(imp.mapping.hasHeader ? 1 : 0, imp.mapping.hasHeader ? 4 : 3);
            const colOptions = (selected) => headerRow.map((h, i) => `<option value="${i}" ${Number(selected) === i ? 'selected' : ''}>${imp.mapping.hasHeader ? escapeHtml(String(h).slice(0, 24)) : 'Columna ' + (i + 1)}</option>`).join('');
            return `
                <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-primary);margin:14px 0 10px">
                    <input type="checkbox" ${imp.mapping.hasHeader ? 'checked' : ''} onchange="financeProImportSet('hasHeader', this.checked)"> La primera fila es cabecera
                </label>
                <div class="modal-label">Cuenta destino</div>
                <select class="modal-input" onchange="financeProImportSet('account', this.value)">
                    ${FINANCE_PRO_ACCOUNT_KEYS.map(k => `<option value="${k}" ${imp.mapping.account === k ? 'selected' : ''}>${escapeHtml(financePro.accounts[k].name)}</option>`).join('')}
                </select>
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
                <div class="finance-modal-note" style="margin:12px 0 6px">Vista previa (${imp.rows.length - (imp.mapping.hasHeader ? 1 : 0)} filas detectadas):</div>
                <div class="finance-import-preview">${previewRows.map(r => `<div class="finance-import-preview-row">${(r || []).slice(0, 4).map(c => `<span>${escapeHtml(String(c || '').slice(0, 20))}</span>`).join('')}</div>`).join('')}</div>
                <button class="btn-modal-primary" style="margin-top:14px" onclick="confirmFinanceProImport()">Importar movimientos</button>
            `;
        }

        function financeProImportSet(key, value) {
            const m = window._financeProImport.mapping;
            if (key === 'hasHeader' || key === 'splitAmount' || key === 'skipPending' || key === 'account') m[key] = value;
            else m[key] = Number(value);
            document.getElementById('finance-pro-import-body').innerHTML = renderFinanceProImportMapping();
        }

        function financeProParseEuroAmount(str) {
            if (str === undefined || str === null) return NaN;
            let s = String(str).trim().replace(/[€\s]/g, '');
            if (!s) return NaN;
            if (s.includes(',') && s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
            else s = s.replace(/,/g, '');
            return Number(s);
        }

        function financeProParseDate(str) {
            const s = String(str || '').trim();
            let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
            if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
            m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
            if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
            return null;
        }

        async function confirmFinanceProImport() {
            const imp = window._financeProImport;
            const m = imp.mapping;
            const rows = m.hasHeader ? imp.rows.slice(1) : imp.rows;
            const existingKeys = new Set(financePro.transactions.map(t => `${t.account}|${t.date}|${t.amount}|${t.note || ''}`));
            const activeRules = financePro.rules.filter(r => r.enabled);
            let added = 0, skipped = 0;
            rows.forEach(r => {
                if (m.status >= 0 && m.skipPending) {
                    const statusVal = (r[m.status] || '').trim().toLowerCase();
                    if (/pending|pendiente|processing|procesando/.test(statusVal)) { skipped++; return; }
                }
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
                let date = financeProParseDate(r[m.date]);
                if (!date) {
                    // Fecha vacía en la columna elegida — típico de "fecha de
                    // finalización" en un movimiento todavía pendiente.
                    date = altDates[0] || null;
                }
                if (!date) { skipped++; return; }
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
                const rule = activeRules.find(rl => description.toLowerCase().includes(rl.matchText.toLowerCase()) && rl.otherAccount !== m.account);
                const effectiveAccount = rule ? (type === 'income' ? rule.otherAccount : m.account) : m.account;
                const dedupeKey = `${effectiveAccount}|${date}|${amount}|${description}`;
                // Se comprueba también con las fechas alternativas de la
                // fila (ver altDates arriba) para no duplicar un movimiento
                // que ya se importó pendiente con otra fecha.
                const isDuplicate = existingKeys.has(dedupeKey) || altDates.some(d => existingKeys.has(`${effectiveAccount}|${d}|${amount}|${description}`));
                if (isDuplicate) { skipped++; return; }
                existingKeys.add(dedupeKey);
                if (rule) {
                    financePro.transactions.push({
                        id: 'ptx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + added,
                        date, type: 'transfer',
                        account: effectiveAccount,
                        transferTo: type === 'income' ? m.account : rule.otherAccount,
                        amount, note: description || undefined
                    });
                    added++;
                    return;
                }
                let category;
                if (m.category >= 0) {
                    const raw = (r[m.category] || '').trim().toLowerCase();
                    const match = raw && financePro.categories.find(c => c.type === type && c.name.toLowerCase() === raw);
                    if (match) category = match.id;
                }
                financePro.transactions.push({
                    id: 'ptx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + added,
                    date, account: m.account, type, amount, category, note: description || undefined
                });
                added++;
            });
            closeModal();
            render();
            try { await saveData(); showToast(`${added} movimiento${added === 1 ? '' : 's'} importado${added === 1 ? '' : 's'}${skipped ? ` · ${skipped} omitido${skipped === 1 ? '' : 's'}` : ''}`); }
            catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
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
                    <div class="card-sub">${active.length} activos · ${(total * 12).toLocaleString('es-ES')}€/año</div>
                </div>
                ${sorted.length ? sorted.map(s => {
                    const daysUntil = s.renewalDay >= todayDay ? s.renewalDay - todayDay : s.renewalDay + 31 - todayDay;
                    return `
                    <div class="entry-item" data-open-entry="${s.id}">
                        <div class="entry-color-dot" style="background:${daysUntil <= 3 ? '#e17055' : 'var(--text-secondary)'}"></div>
                        <div class="entry-info">
                            <div class="entry-title">${escapeHtml(s.title)}</div>
                            <div class="entry-meta">Día ${s.renewalDay} · en ${daysUntil} días</div>
                        </div>
                        <span style="font-weight:600;font-size:13px">${s.amount.toLocaleString('es-ES')}€</span>
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
                        <div style="font-weight:500;margin-bottom:4px;color:var(--text-primary)">Sube un documento PDF</div>
                        <div style="font-size:12px;color:var(--text-secondary)">Pulsa aquí para elegir un archivo</div>
                    </div>
                    <div id="doc-list">Cargando documentos...</div>

                    <div class="backups-section">
                        <div class="events-section-label">Backups automáticos</div>
                        <div style="font-size:11px;color:var(--text-secondary);margin:-6px 0 10px">
                            Bitácora guarda una copia de seguridad completa la primera vez que abres la app cada día, y conserva las 7 más recientes.
                        </div>
                        <div id="backup-failure-banner"></div>
                        <div id="backups-list">Cargando backups...</div>
                    </div>
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
                // La carpeta "backups" aparece en este listado como una entrada
                // más (id null, sin metadata) porque hay archivos dentro de
                // documents/<usuario>/backups/ — se excluye porque esos backups
                // ya tienen su propia sección y no son un documento subido.
                documents = (data || []).filter(d => d.name !== 'backups' && d.id !== null);
                if (listEl) renderDocList();
            } catch (e) {
                console.error('Error cargando documentos:', e);
                if (listEl) listEl.innerHTML =
                    `<div class="empty-state"><div class="empty-title">No se pudieron cargar los documentos</div><div class="empty-sub">${(e?.message || 'Comprueba que el bucket "documents" existe en Supabase Storage')}</div></div>`;
            }
        }

        function renderDocList() {
            const listEl = document.getElementById('doc-list');
            if (!listEl) return;
            if (!documents.length) {
                listEl.innerHTML =
                    `<div class="empty-state"><div class="empty-title">Sin documentos</div><div class="empty-sub">Sube tu primer PDF con el botón de arriba</div></div>`;
                return;
            }
            listEl.innerHTML = `<div class="docs-list">${documents.map((doc, i) => {
                const sizeKb = doc.metadata?.size ? Math.round(doc.metadata.size / 1024) + ' KB' : '';
                const date = doc.created_at ? new Date(doc.created_at).toLocaleDateString('es-ES') : '';
                return `
                    <div class="docs-row">
                        <div class="docs-row-index">${String(i + 1).padStart(2, '0')}</div>
                        <div class="docs-row-body">
                            <div class="docs-row-name">${escapeHtml(doc.name)}</div>
                            <div class="docs-row-meta">${date}${sizeKb ? ' · ' + sizeKb : ''}</div>
                        </div>
                        <div class="doc-actions">
                            <button class="doc-action-download" onclick="downloadDocument('${escapeHtml(doc.name)}')">Descargar</button>
                            <button class="doc-action-delete-btn" title="Eliminar" onclick="deleteDocument('${escapeHtml(doc.name)}')">✕</button>
                        </div>
                    </div>`;
            }).join('')}</div>`;
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
        //  BACKUPS AUTOMÁTICOS DIARIOS
        //  Como Bitácora no tiene servidor propio (es una app estática),
        //  no puede ejecutar nada exactamente a las 00:00h aunque tengas
        //  la app cerrada. En su lugar, la primera vez que la abres cada
        //  día (en cualquier dispositivo) se sube una copia de seguridad
        //  completa a Storage, en documents/<usuario>/backups/. Se
        //  consulta la lista real de archivos (no localStorage) para que
        //  funcione igual da igual desde qué dispositivo abras la app.
        //  Se conservan solo los 7 backups más recientes; al subir el 8º,
        //  se borra el más antiguo.
        // ============================================================
        let backupFiles = [];
        const BACKUPS_TO_KEEP = 7;
        const BACKUP_LAST_ERROR_KEY = 'bitacora_backup_last_error';

        function backupFileDate(name) {
            const m = name.match(/(\d{4}-\d{2}-\d{2})/);
            return m ? m[1] : '';
        }

        // Traduce el error crudo de Supabase (network/auth/RLS/bucket/cuota...)
        // a un mensaje concreto en vez de "desconocido" — para que si falla
        // el backup sepas de un vistazo qué ha pasado, sin tener que abrir
        // la consola del navegador.
        function describeBackupError(e) {
            const raw = (e?.message || String(e || '')).toLowerCase();
            const status = e?.status || e?.statusCode;
            if (!navigator.onLine || raw.includes('failed to fetch') || raw.includes('network')) {
                return 'Sin conexión a internet en ese momento.';
            }
            if (status === 401 || raw.includes('jwt') || raw.includes('not authenticated') || raw.includes('invalid token')) {
                return 'La sesión había caducado — vuelve a iniciar sesión y se reintentará solo.';
            }
            if (status === 403 || raw.includes('row-level security') || raw.includes('permission denied') || raw.includes('policy')) {
                return 'Permiso denegado por Supabase (revisa las políticas RLS del bucket "documents").';
            }
            if (status === 404 || raw.includes('bucket not found')) {
                return 'El bucket "documents" no existe o no es accesible en Supabase Storage.';
            }
            if (status === 413 || raw.includes('payload too large') || raw.includes('exceeded') || raw.includes('quota')) {
                return 'La copia de seguridad supera el límite de tamaño o se agotó la cuota de almacenamiento.';
            }
            return e?.message ? `Error de Supabase: ${e.message}` : 'Error desconocido al subir el backup.';
        }

        function recordBackupFailure(e) {
            try {
                localStorage.setItem(BACKUP_LAST_ERROR_KEY, JSON.stringify({ date: todayISO(), message: describeBackupError(e) }));
            } catch (_) { /* localStorage no disponible: no es crítico, se pierde el aviso persistente */ }
        }

        function clearBackupFailure() {
            try { localStorage.removeItem(BACKUP_LAST_ERROR_KEY); } catch (_) { /* no-op */ }
        }

        function getBackupFailure() {
            try {
                const raw = localStorage.getItem(BACKUP_LAST_ERROR_KEY);
                return raw ? JSON.parse(raw) : null;
            } catch (_) { return null; }
        }

        // Sube (o sustituye) el backup de HOY y aplica la rotación de los
        // últimos BACKUPS_TO_KEEP. La usan tanto la comprobación diaria
        // automática como el comando /backup para forzar uno al momento.
        async function uploadTodayBackupAndRotate(user, existingFiles) {
            const todayName = `bitacora_backup_${todayISO()}.json`;
            const payload = buildFullBackupPayload();
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            const { error: upErr } = await sb.storage.from('documents').upload(`${user.id}/backups/${todayName}`, blob, { upsert: true, contentType: 'application/json' });
            if (upErr) throw upErr;
            clearBackupFailure();

            const alreadyListed = existingFiles.some(f => f.name === todayName);
            const updated = alreadyListed ? existingFiles : [...existingFiles, { name: todayName }];
            updated.sort((a, b) => a.name.localeCompare(b.name));
            if (updated.length > BACKUPS_TO_KEEP) {
                const toDelete = updated.slice(0, updated.length - BACKUPS_TO_KEEP).map(f => `${user.id}/backups/${f.name}`);
                await sb.storage.from('documents').remove(toDelete);
            }
            if (currentView === 'documents') { await loadBackups(); renderBackupFailureBanner(); }
        }

        // El chequeo diario corre en silencio al abrir la app — si falla, el
        // usuario podría no enterarse nunca (nadie mira la consola). Ahora
        // se avisa con un toast la primera vez que falla cada día, y además
        // queda un aviso persistente (leído por renderBackupFailureBanner)
        // hasta que un backup se suba con éxito.
        async function runDailyBackupCheck() {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const todayName = `bitacora_backup_${todayISO()}.json`;
                const { data: files, error } = await sb.storage.from('documents').list(`${user.id}/backups`, {
                    sortBy: { column: 'name', order: 'asc' }
                });
                if (error) throw error;
                const existing = files || [];
                if (existing.some(f => f.name === todayName)) return; // ya hay backup de hoy
                await uploadTodayBackupAndRotate(user, existing);
            } catch (e) {
                console.error('Error en el backup automático diario:', e);
                const already = getBackupFailure();
                recordBackupFailure(e);
                if (!already || already.date !== todayISO()) {
                    showToast('No se pudo hacer la copia de seguridad de hoy: ' + describeBackupError(e), true);
                }
            }
        }

        // Comando /backup: fuerza una copia de seguridad AHORA MISMO, sin
        // esperar a que sea la primera vez que abres la app hoy — útil
        // justo antes de probar algo que podrías querer deshacer.
        async function runManualBackupNow() {
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) { showToast('No hay sesión activa', true); return; }
                const { data: files, error } = await sb.storage.from('documents').list(`${user.id}/backups`, {
                    sortBy: { column: 'name', order: 'asc' }
                });
                if (error) throw error;
                await uploadTodayBackupAndRotate(user, files || []);
                showToast('Backup guardado ahora mismo');
            } catch (e) {
                console.error('Error en el backup manual:', e);
                recordBackupFailure(e);
                showToast('No se pudo guardar el backup: ' + describeBackupError(e), true);
                renderBackupFailureBanner();
            }
        }

        // Aviso persistente (no solo el toast, que se puede perder) en la
        // propia sección Documentos si el último intento de backup falló.
        function renderBackupFailureBanner() {
            const el = document.getElementById('backup-failure-banner');
            if (!el) return;
            const failure = getBackupFailure();
            if (!failure) { el.innerHTML = ''; return; }
            el.innerHTML = `
                <div class="backup-failure-banner">
                    <div>
                        <strong>⚠ El backup automático falló</strong>
                        <div class="backup-failure-banner-msg">${escapeHtml(failure.message)} (${escapeHtml(failure.date)})</div>
                    </div>
                    <button class="btn-secondary" style="width:auto" onclick="runManualBackupNow()">Reintentar ahora</button>
                </div>`;
        }

        async function loadBackups() {
            const el = document.getElementById('backups-list');
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) { backupFiles = []; if (el) el.innerHTML = ''; return; }
                const { data, error } = await sb.storage.from('documents').list(`${user.id}/backups`, {
                    sortBy: { column: 'name', order: 'desc' }
                });
                if (error) throw error;
                backupFiles = data || [];
                if (el) renderBackupsListContent();
            } catch (e) {
                console.error('Error cargando backups:', e);
                if (el) el.innerHTML = `<div class="empty-state"><div class="empty-title">No se pudieron cargar los backups</div></div>`;
            }
        }

        function renderBackupsListContent() {
            const el = document.getElementById('backups-list');
            if (!el) return;
            if (!backupFiles.length) {
                el.innerHTML = `<div class="empty-state"><div class="empty-title">Aún no hay backups automáticos</div><div class="empty-sub">Se generará el primero la próxima vez que abras Bitácora.</div></div>`;
                return;
            }
            el.innerHTML = `<div class="docs-list">${backupFiles.map((f, i) => {
                const iso = backupFileDate(f.name);
                const fecha = iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) : f.name;
                return `<div class="docs-row">
                    <div class="docs-row-index">${String(i + 1).padStart(2, '0')}</div>
                    <div class="docs-row-body"><div class="docs-row-name">${escapeHtml(fecha)}</div><div class="docs-row-meta">${escapeHtml(iso)}</div></div>
                    <div class="doc-actions"><button class="doc-action-download" onclick="restoreBackupFile('${escapeHtml(f.name)}')">Restaurar</button></div>
                </div>`;
            }).join('')}</div>`;
        }

        async function restoreBackupFile(name) {
            const iso = backupFileDate(name);
            if (!confirm(`¿Restaurar el backup del ${iso}? Esto sustituirá TODOS tus datos actuales (de cualquier apartado) por los que había guardados ese día. No se puede deshacer.`)) return;
            try {
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                const { data, error } = await sb.storage.from('documents').download(`${user.id}/backups/${name}`);
                if (error) throw error;
                const payload = JSON.parse(await data.text());
                applyBackupPayload(payload);
                await saveData();
                render();
                updatePageTitle();
                showToast('Backup restaurado correctamente');
            } catch (e) {
                console.error('Error restaurando backup:', e);
                showToast('Error al restaurar: ' + (e?.message || 'desconocido'), true);
            }
        }

        // ============================================================
        //  VAULT: CONTRASEÑAS EN SUPABASE
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
        //  PASSWORD ACCESS SYSTEM (para Vault) - CORREGIDO
        // ============================================================

        async function requestPasswordAccess(type, onSuccess) {
            try {
                const storedHash = await getSecret(type);
                
                if (!storedHash) {
                    // No hay contraseña guardada → crear por primera vez
                    window._passwordSuccessCallback = onSuccess;
                    window._passwordType = type;
                    
                    showModal(`
                        <div class="modal-title" style="color:var(--vault-accent)">
                            Configurar acceso a Vault
                        </div>
                        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
                            Establece una contraseña para proteger Vault.
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
                        <button class="btn-modal-primary" onclick="createPassword('${type}')" style="background:var(--vault-accent)">
                            🔐 Crear contraseña
                        </button>
                    `);
                    return;
                }

                // Ya hay contraseña guardada → verificar acceso
                window._passwordSuccessCallback = onSuccess;
                window._passwordType = type;

                showModal(`
                    <div class="modal-title" style="color:var(--vault-accent)">
                        Acceso a Vault
                    </div>
                    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
                        Introduce tu contraseña para acceder.
                    </div>
                    <div class="form-row">
                        <label class="modal-label">Contraseña</label>
                        <input type="password" id="pw-input" class="modal-input" placeholder="Tu contraseña" onkeydown="if(event.key==='Enter')verifyPassword('${type}')">
                    </div>
                    <div id="pw-error" style="color:#dc2626;font-size:12px;margin-bottom:8px;min-height:16px"></div>
                    <button class="btn-modal-primary" onclick="verifyPassword('${type}')" style="background:var(--vault-accent)">
                        Verificar
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
                <div class="modal-title" style="color:var(--accent-purple)">⚙ Configurar Modo Desarrollador</div>
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
                <button class="btn-modal-primary" onclick="confirmCreateDevPassword()" style="background:var(--accent-purple)">
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
                document.getElementById('content').innerHTML = renderSettings();
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
                    <div class="modal-title" style="color:var(--accent-purple)">⚙ Modo Desarrollador</div>
                    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Introduce la contraseña global del Modo Desarrollador para activarlo.</div>
                    <div class="form-row">
                        <label class="modal-label">Contraseña</label>
                        <input type="password" id="pw-dev-input" class="modal-input" placeholder="Contraseña global" onkeydown="if(event.key==='Enter')verifyDevPassword()">
                    </div>
                    <div id="pw-dev-error" style="color:#dc2626;font-size:12px;margin-bottom:8px;min-height:16px"></div>
                    <button class="btn-modal-primary" onclick="verifyDevPassword()" style="background:var(--accent-purple)">🔓 Activar</button>
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
                document.getElementById('content').innerHTML = renderSettings();
                showCenteredMessage('Modo desarrollador activado');
            } catch (e) {
                console.error('Error verificando contraseña:', e);
                errorEl.textContent = 'Error de conexión, intenta de nuevo';
            }
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
                <div class="modal-title" style="font-family:'JetBrains Mono',monospace;color:var(--accent-purple)">&gt; ${p ? 'Editar prompt' : 'Nuevo prompt'}</div>
                <div class="modal-label">Título</div>
                <input id="prompt-title-input" class="modal-input console-font" value="${escapeHtml(title)}" placeholder="Nombre del prompt...">
                <div class="modal-label">Contenido</div>
                <textarea id="prompt-content-input" class="modal-input console-font console-textarea" rows="8" placeholder="Escribe tu prompt aquí...">${escapeHtml(content)}</textarea>
                <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
                    <button class="btn-modal-primary" style="width:auto;background:var(--accent-purple)" onclick="savePrompt()">💾 Guardar</button>
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
                                <div style="font-size:20px;font-weight:700;color:var(--text-primary)">Vault</div>
                                <div style="font-size:13px;color:var(--text-secondary)">Tareas personales</div>
                            </div>
                            <button class="btn-secondary" onclick="changeVaultPassword()" style="margin:0;padding:6px 12px;font-size:12px;width:auto;color:var(--vault-accent)">🔑 Cambiar contraseña</button>
                        </div>
                        <div class="vault-input-row">
                            <input type="text" id="vault-input" placeholder="Escribe una tarea..." onkeydown="if(event.key==='Enter')addVaultTask()">
                            <button onclick="addVaultTask()">Añadir</button>
                        </div>
                        <div class="empty-state">
                            
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
                            <div style="font-size:20px;font-weight:700;color:var(--text-primary)">Vault</div>
                            <div style="font-size:13px;color:var(--text-secondary)">${pending.length} pendientes · ${done.length} completadas</div>
                        </div>
                        <button class="btn-secondary" onclick="changeVaultPassword()" style="margin:0;padding:6px 12px;font-size:12px;width:auto;color:var(--vault-accent)">🔑 Cambiar contraseña</button>
                    </div>
                    <div class="vault-input-row">
                        <input type="text" id="vault-input" placeholder="Escribe una tarea..." onkeydown="if(event.key==='Enter')addVaultTask()">
                        <button onclick="addVaultTask()">Añadir</button>
                    </div>

                    ${pending.length ? `
                        <div style="font-size:12px;font-weight:600;text-transform:uppercase;color:var(--text-secondary);letter-spacing:0.5px;margin:12px 0 8px 0">Pendientes</div>
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
                        <div style="font-size:12px;font-weight:600;text-transform:uppercase;color:var(--text-secondary);letter-spacing:0.5px;margin:12px 0 8px 0">Completadas</div>
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
                <div class="modal-title" style="color:var(--vault-accent)">Cambiar contraseña de Vault</div>
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
            await cargarListasOcioCompartidas();

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
                runDailyBackupCheck();
                updateNotifBadge();
                if (!window._notifTimer) window._notifTimer = setInterval(refreshNotifData, 90000);
                bitacoraNativeSyncSnapshot();
                handleWidgetDeepLink();
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
