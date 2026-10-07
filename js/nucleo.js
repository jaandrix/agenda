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
                document.body.classList.remove('pwa');
                showPaywallScreen(user, { confirmando: veniaDeCheckout });
                return;
            }
            if (isMobileStandaloneMode() && !mobileExitedToDesktop) document.body.classList.add('pwa');

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

        // El arranque espera a que estén cargados todos los archivos de js/:
        // startApp acaba llamando a funciones de los últimos (init, en
        // inicio.js), y la sesión puede resolverse antes de que lleguen.
        document.addEventListener('DOMContentLoaded', async () => {
            const { data: { session } } = await sb.auth.getSession();
            document.getElementById('boot-loading').style.display = 'none';
            if (session) {
                await startApp();
            } else {
                document.body.classList.remove('pwa');
                showLandingScreen();
            }
        });

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
        // Lo que Claude o ChatGPT han hecho a través del conector, con lo
        // necesario para deshacerlo (ver aplicarOpConector). Lo más nuevo
        // primero; se guardan las últimas REGISTRO_CONECTOR_MAX.
        let registroConector = [];
        // Pedidos de "envíos." (lógica en actualizaciones.js).
        let pedidos = [];
        // Reflexiones semanales del método (metodo.js): {semana, bien, mal, cambio, fecha}.
        let hansei = [];
        // Perfil y apartados opcionales (Ajustes → apartados.):
        // { perfil: 'estudiante' | 'trabajador' | 'ambos', opcionales: { collectibles: bool } }.
        let apartadosConfig = null;
        // Datos del CV (cv.js): contacto, formación, idiomas, habilidades y perfil.
        let perfilLaboral = null;
        // Cambios de la IA que esperan validación en "bandeja." (filas de
        // conector_bandeja que no se aplican solas, ver OPS_AUTOMATICAS).
        let bandejaPendiente = [];
        // Resumen de lo que Bitácora calcula (ritmo, patrones, avisos) para
        // que el conector lo lea tal cual, sin rehacer los cálculos en el
        // servidor con otra lógica (ver actualizarAnalisisIA).
        let analisisIA = null;
        // Qué avisos automáticos quiere recibir (los lee la función
        // avisos-diarios); un tipo ausente cuenta como activado.
        let preferenciasAvisos = {};
        // Ciudad de la previsión del Home ({ nombre, lat, lon }); sin elegir,
        // Zaragoza (CIUDAD_TIEMPO_DEFECTO).
        let ciudadTiempo = null;
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
            rules: [],
            // Gastos programados para un día futuro: {id, date, account,
            // amount, category, note}. Al llegar su día pasan a transactions
            // (ver financeProAplicarProgramados()).
            programados: []
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
            work: 'Empleo',
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
            graph: 'Conexiones',
            collectibles: 'Coleccionables',
            friends: 'Social',
            studies: 'Estudios',
            universidad: 'Universidad',
            links: 'Enlaces',
            actualizaciones: 'Envíos',
            bandeja: 'Bandeja',
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
                { view: 'work', icon: '◫', text: 'Empleo' },
                { view: 'studies', icon: '◎', text: 'Estudios' },
                { view: 'universidad', icon: '◎', text: 'Universidad' },
                { view: 'documents', icon: '▤', text: 'Documentos' },
                { view: 'goals', icon: '◉', text: 'Objetivos' },
                { view: 'projects', icon: '⊞', text: 'Proyectos' },
                { view: 'links', icon: '⛓', text: 'Enlaces' },
            ] },
            { label: 'Otros', items: [
                { view: 'culture', icon: '◊', text: 'Ocio' },
                { view: 'friends', icon: '◕', text: 'Social' },
                { view: 'travels', icon: '⌂', text: 'Viajes' },
                { view: 'actualizaciones', icon: '▣', text: 'Envíos' },
                { view: 'collectibles', icon: '◆', text: 'Coleccionables' },
                { view: 'tags', icon: '#', text: 'Etiquetas' },
                { view: 'graph', icon: '◇', text: 'Conexiones' },
            ] },
            { label: 'Sistema', items: [
                { view: 'bandeja', icon: '▣', text: 'Bandeja' },
                { view: 'suggestions', icon: '✎', text: 'Sugerencias' },
                { view: 'settings', icon: '⚙', text: 'Ajustes' },
            ] },
        ];

        // ============================================================
        //  VERSIÓN MÓVIL (PWA añadida a "pantalla de inicio")
        //  Cuando Bitácora se abre en modo standalone (icono de inicio,
        //  no pestaña de Safari/Chrome) se sustituye TODA la interfaz de
        //  escritorio por #mobile-shell: inicio con el mes en bolitas,
        //  menú a pantalla completa (botón de arriba a la derecha) y una
        //  página propia por apartado. Estética suiza: cifras enormes,
        //  títulos grandes en dos tonos, círculos y filas con filete.
        //  La vista móvil sigue siempre a currentView, así que switchView,
        //  openEntryDetail y compañía funcionan igual que en escritorio.
        // ============================================================
        function isMobileStandaloneMode() {
            try {
                return (window.navigator.standalone === true) || window.matchMedia('(display-mode: standalone)').matches;
            } catch (e) { return false; }
        }
        let mobileStandaloneActive = false;
        let mobileExitedToDesktop = false;
        let mobileMenuAbierto = false;
        let mobileDiaSel = null;
        let mobileMes = null;

        // En la versión móvil, los apartados que reutilizan el render de
        // escritorio existen dos veces (el de #content, oculto, y el de
        // #mobile-shell) con los mismos id, y getElementById devolvía el
        // oculto: Sugerencias no enviaba nada y en Amigos no se guardaba el
        // nombre ni se añadían códigos. Con la versión móvil activa, se
        // busca primero dentro de #mobile-shell.
        const getElementByIdOriginal = Document.prototype.getElementById;
        document.getElementById = function (id) {
            if (mobileStandaloneActive && !mobileExitedToDesktop) {
                const shell = getElementByIdOriginal.call(document, 'mobile-shell');
                const enMovil = shell && id !== 'mobile-shell' ? shell.querySelector(`[id="${CSS.escape(id)}"]`) : null;
                if (enMovil) return enMovil;
            }
            return getElementByIdOriginal.call(document, id);
        };

        function initMobileShell() {
            mobileStandaloneActive = isMobileStandaloneMode();
            document.body.classList.toggle('mobile-standalone', mobileStandaloneActive && !mobileExitedToDesktop);
        }

        function exitMobileToDesktop() {
            mobileExitedToDesktop = true;
            mobileMenuAbierto = false;
            document.body.classList.remove('mobile-standalone', 'pwa');
            render();
        }

        // Sin el aviso de privacidad de Finanzas que pone switchView: en el
        // móvil se entra a consultar o apuntar algo rápido.
        function mobileIr(view) {
            mobileMenuAbierto = false;
            if (view !== 'travels') window._openTripId = null;
            if (view === 'calendar') { mobileDiaSel = null; mobileMes = null; }
            const shell = document.getElementById('mobile-shell');
            conTransicion(vtDireccionSidebar(currentView, view), () => {
                aplicarSwitchView(view);
                if (shell) shell.scrollTop = 0;
            });
        }

        function toggleMenuMovil() {
            mobileMenuAbierto = !mobileMenuAbierto;
            document.getElementById('m-menu')?.classList.toggle('abierto', mobileMenuAbierto);
            document.body.classList.toggle('m-menu-abierto', mobileMenuAbierto);
        }

        let mobileLastEffectView = null;
        function renderMobileShell() {
            if (!mobileStandaloneActive || mobileExitedToDesktop) return;
            const shell = document.getElementById('mobile-shell');
            if (!shell) return;
            const view = NAV_VIEW_LABELS[currentView] ? currentView : 'calendar';
            const entra = mobileLastEffectView !== view;
            requestAnimationFrame(() => document.body.classList.remove('pwa'));
            shell.innerHTML = `
                <div class="m-app">
                    ${renderMobileTopbar(view)}
                    <main class="m-pagina">${view === 'calendar' ? renderMobileInicio(entra) : renderMobileSeccion(view)}</main>
                </div>
                ${renderMobileMenu(view)}`;
            document.body.classList.toggle('m-menu-abierto', mobileMenuAbierto);
            if (mobileLastEffectView !== view) {
                mobileLastEffectView = view;
                const effect = MOBILE_SECTION_EFFECTS[view];
                if (effect) setTimeout(effect, 0);
            }
        }

        // En la portada, la marca; en cualquier apartado, el mismo hueco es
        // un "‹ inicio." bien visible para volver sin abrir el menú.
        function renderMobileTopbar(view) {
            const avisos = bandejaPendiente.length;
            return `
            <div class="m-topbar">
                ${view === 'calendar'
                    ? '<span class="m-marca">bitácora.</span>'
                    : `<button class="m-inicio" onclick="mobileIr('calendar')"><svg viewBox="0 0 100 100" fill="currentColor" aria-hidden="true"><path d="M70 10L58 0 8 50l50 50 12-10-40-40z"/></svg>inicio.</button>`}
                <button class="m-menu-btn" onclick="toggleMenuMovil()" aria-label="Abrir el menú">
                    <span></span><span></span>
                    ${avisos ? '<i class="m-menu-aviso" aria-hidden="true"></i>' : ''}
                </button>
            </div>`;
        }

        function mobileCuentaMenu(view) {
            if (view === 'bandeja') return bandejaPendiente.length;
            if (view === 'actualizaciones') return pedidos.filter(p => p.estado !== 'entregado').length;
            if (view === 'planner') {
                const hoy = todayISO();
                return plannerItemsForOffset(0).filter(i => !i.done).length + recurringTasksDueToday().filter(t => !t.completadas?.[hoy]).length;
            }
            if (view === 'habits') {
                const hoy = todayISO();
                return habits.filter(h => h.activo !== false && !h.completadas?.[hoy]).length;
            }
            return 0;
        }

        function renderMobileMenu(view) {
            let n = 0;
            const muestras = { asfalto: ['#302f2c', '#efede3'], papel: ['#FAF8F5', '#302f2c'], acuarela: ['#E7E2D9', '#EE4B1F'] };
            const tema = temaActual();
            return `
            <div class="m-menu ${mobileMenuAbierto ? 'abierto' : ''}" id="m-menu">
                <div class="m-menu-top">
                    <span class="m-marca">bitácora.</span>
                    <button class="m-cerrar" onclick="toggleMenuMovil()">cerrar <span aria-hidden="true">×</span></button>
                </div>
                <div class="m-menu-cuerpo">
                    ${navSeccionesVisibles().map(sec => `
                        <div class="m-menu-grupo">${escapeHtml(sec.label.toLowerCase())}.</div>
                        ${sec.items.map(it => {
                            const i = n++;
                            const cuenta = mobileCuentaMenu(it.view);
                            return `<button class="m-menu-fila ${it.view === view ? 'activa' : ''}" style="--i:${Math.min(i, 20)}" onclick="mobileIr('${it.view}')">
                                <sup>${String(i).padStart(2, '0')}</sup><span class="m-menu-texto">${escapeHtml((it.view === 'calendar' ? 'inicio' : it.text).toLowerCase())}</span>${cuenta ? `<span class="m-menu-cuenta">${cuenta}</span>` : ''}
                            </button>`;
                        }).join('')}`).join('')}
                    <div class="m-menu-pie">
                        <div class="m-menu-temas">
                            ${THEMES.map(t => `<button class="m-tema ${t === tema ? 'activo' : ''}" onclick="setTheme('${t}');render()" aria-label="Tema ${THEME_LABELS[t]}"><span style="background:${muestras[t][0]}"></span><span style="background:${muestras[t][1]}"></span></button>`).join('')}
                        </div>
                        <button class="m-enlace" onclick="toggleMenuMovil();openGuia()">guía.</button>
                        <button class="m-enlace" onclick="exitMobileToDesktop()">versión completa.</button>
                    </div>
                </div>
            </div>`;
        }

        // Título en dos tonos, a lo cartel: el nombre del apartado en grande
        // y debajo, en gris, el dato que más importa ahora mismo. El tamaño
        // se ajusta al largo del título para que "coleccionables." quepa.
        function renderMobileCabecera(titulo, sub) {
            const t = titulo.toLowerCase() + '.';
            return `<header class="m-cab">
                <h1 class="m-titulo" style="--largo:${Math.max(t.length, 7)}">${escapeHtml(t)}</h1>
                ${sub ? `<div class="m-sub">${sub}</div>` : ''}
            </header>`;
        }

        const MOBILE_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        const MOBILE_DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
        const MOBILE_DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        function mobileAnillo(frac, tam = 92) {
            const r = 40, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac || 0));
            return `<svg class="m-anillo" width="${tam}" height="${tam}" viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r="${r}" class="m-anillo-pista"/>
                <circle cx="50" cy="50" r="${r}" class="m-anillo-arco" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - f)}" transform="rotate(-90 50 50)"/>
            </svg>`;
        }

        // ---- Inicio: el mes en bolitas ----
        function mobileDiaPlanner(date) {
            resetDayPlannerIfNeeded();
            return Array.isArray(dayPlanner.days[date]) ? dayPlanner.days[date] : [];
        }

        // Lo que "ocupa" un día: eventos, cumpleaños, viajes, exámenes y
        // tareas del planificador. El trabajo diario y los cargos fijos se
        // quedan fuera del color: pintarían casi todos los días.
        function mobileOcupacionDia(date) {
            const entradas = getDayAllEntries(date).filter(e => e.type !== 'work' && !e._recurringPayment);
            return entradas.length + mobileDiaPlanner(date).length;
        }

        function mobileElegirDia(date) {
            mobileDiaSel = date;
            const d = new Date(date + 'T12:00:00');
            mobileMes = { y: d.getFullYear(), m: d.getMonth() };
            const pagina = document.querySelector('#mobile-shell .m-pagina');
            if (pagina && currentView === 'calendar') pagina.innerHTML = renderMobileInicio();
            else render();
        }

        function mobileCambiarMes(delta) {
            const base = mobileMes || { y: new Date().getFullYear(), m: new Date().getMonth() };
            const d = new Date(base.y, base.m + delta, 1);
            mobileMes = { y: d.getFullYear(), m: d.getMonth() };
            const pagina = document.querySelector('#mobile-shell .m-pagina');
            if (pagina) pagina.innerHTML = renderMobileInicio();
        }

        function renderMobileInicio(entra) {
            const hoy = isoLocal(new Date());
            const sel = mobileDiaSel || hoy;
            const d = new Date(sel + 'T12:00:00');
            const { y, m } = mobileMes || { y: d.getFullYear(), m: d.getMonth() };
            const primero = new Date(y, m, 1);
            const huecos = (primero.getDay() + 6) % 7;
            const diasMes = new Date(y, m + 1, 0).getDate();
            const celdas = [];
            for (let i = 0; i < huecos; i++) celdas.push('<span class="m-punto m-punto-fuera"></span>');
            for (let dia = 1; dia <= diasMes; dia++) {
                const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
                const ocupado = mobileOcupacionDia(iso) > 0;
                const clases = ['m-punto', iso < hoy ? 'pasado' : 'futuro', ocupado ? 'ocupado' : '', iso === hoy ? 'hoy' : '', iso === sel ? 'sel' : ''].filter(Boolean).join(' ');
                celdas.push(`<button class="${clases}" style="--o:${huecos + dia}" onclick="mobileElegirDia('${iso}')" aria-label="${dia} de ${MOBILE_MESES[m]}${ocupado ? ', con cosas' : ''}"><span>${dia}</span></button>`);
            }
            const resto = (7 - (celdas.length % 7)) % 7;
            for (let i = 0; i < resto; i++) celdas.push('<span class="m-punto m-punto-fuera"></span>');
            const letraHoy = (new Date().getDay() + 6) % 7;

            return `
            <section class="m-hero">
                <div class="m-hero-fila">
                    <div class="m-hero-num">${d.getDate()}</div>
                    <div class="m-hero-tiempo">${renderTiempoWidget()}</div>
                </div>
                <div class="m-hero-mes"><span>${MOBILE_MESES[d.getMonth()]}.</span><span class="m-hero-dia">${MOBILE_DIAS[d.getDay()]}.</span></div>
                <div class="m-hero-anio">${d.getFullYear()}${sel !== hoy ? `<button class="m-hoy-link" onclick="mobileElegirDia('${hoy}')">volver a hoy.</button>` : ''}</div>
            </section>
            <section class="m-mes">
                <div class="m-mes-cab">
                    <span class="m-etiqueta">${MOBILE_MESES[m]} ${y !== new Date().getFullYear() ? y : ''}</span>
                    <div class="m-mes-flechas">
                        <button onclick="mobileCambiarMes(-1)" aria-label="Mes anterior">‹</button>
                        <button onclick="mobileCambiarMes(1)" aria-label="Mes siguiente">›</button>
                    </div>
                </div>
                <div class="m-mes-letras">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((l, i) => `<span class="${i === letraHoy && y === new Date().getFullYear() && m === new Date().getMonth() ? 'hoy' : ''}">${l}</span>`).join('')}</div>
                <div class="m-mes-puntos ${entra ? 'm-entra' : ''}">${celdas.join('')}</div>
            </section>
            ${renderMobileDiaPanel(sel, hoy)}
            ${renderMobileTeselas()}`;
        }

        function renderMobileDiaPanel(sel, hoy) {
            const filas = [];
            getDayAllEntries(sel).forEach(e => {
                const hora = e.time || e.startTime || '';
                if (e.type === 'work') {
                    const horario = (e.startTime || e.endTime) ? `de ${e.startTime || '--'} a ${e.endTime || '--'}` : '';
                    const meta = [horario, e.position].filter(Boolean).map(escapeHtml).join(' · ');
                    filas.push({ hora, html: `<div class="m-fila" data-open-entry="${e.id}"><span class="m-fila-hora">${escapeHtml(e.startTime || '—')}</span><div class="m-fila-cuerpo"><div class="m-fila-titulo">trabajando en ${escapeHtml(e.company || 'tu empresa')}</div>${meta ? `<div class="m-fila-meta">${meta}</div>` : ''}</div></div>` });
                    return;
                }
                if (e._recurringPayment) {
                    filas.push({ hora: '', html: `<div class="m-fila m-fila-suave"><span class="m-fila-hora">—</span><div class="m-fila-cuerpo"><div class="m-fila-titulo">pago: ${escapeHtml(e.title)}</div><div class="m-fila-meta">${financeMoney(e.amount)}</div></div></div>` });
                    return;
                }
                const titulo = e.type === 'birthday' ? `cumpleaños de ${escapeHtml(e.title)}` : escapeHtml(e.title || '');
                const cat = categories.find(c => c.id === e.categoryId);
                const meta = [e.place, cat?.name].filter(Boolean).map(escapeHtml).join(' · ');
                filas.push({ hora, html: `<div class="m-fila" data-open-entry="${e.id}"><span class="m-fila-hora">${escapeHtml(hora) || '—'}</span><div class="m-fila-cuerpo"><div class="m-fila-titulo">${titulo}</div>${meta ? `<div class="m-fila-meta">${meta}</div>` : ''}</div><span class="m-fila-bola" aria-hidden="true"></span></div>` });
            });
            const offset = Math.round((new Date(sel + 'T12:00:00') - new Date(currentPlannerDayKey() + 'T12:00:00')) / 86400000);
            mobileDiaPlanner(sel).forEach(it => {
                filas.push({ hora: it.time || '', html: renderMobileFilaTarea(it, offset) });
            });
            if (sel === hoy) {
                recurringTasksDueToday().forEach(t => {
                    const hecha = !!t.completadas?.[hoy];
                    filas.push({ hora: '', html: `<div class="m-fila ${hecha ? 'hecha' : ''}"><span class="m-fila-hora">↻</span><div class="m-fila-cuerpo"><div class="m-fila-titulo">${escapeHtml(t.texto)}</div></div><button class="m-check ${hecha ? 'on' : ''}" onclick="mobileMarcarRecurrente('${t.id}')" aria-label="Marcar hecha"></button></div>` });
                });
            }
            filas.sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
            const d = new Date(sel + 'T12:00:00');
            const titulo = sel === hoy ? 'hoy.' : `${MOBILE_DIAS_LARGOS[d.getDay()]} ${d.getDate()}.`;
            return `
            <section class="m-dia">
                <div class="m-dia-cab">
                    <div class="m-dia-titulo">${titulo}</div>
                    <button class="m-mas" onclick="openNewEntryForDay('${sel}')" aria-label="Añadir algo este día">+</button>
                </div>
                ${filas.length ? `<div class="m-lista">${filas.map(f => f.html).join('')}</div>` : '<div class="m-vacio">nada este día.</div>'}
            </section>`;
        }

        function renderMobileFilaTarea(it, offset) {
            const subs = Array.isArray(it.subtasks) ? it.subtasks : [];
            const meta = [it.arrastrado && !it.done ? 'de ayer' : '', subs.length ? `${subs.filter(s => s.done).length}/${subs.length} subtareas` : '', it.notes || ''].filter(Boolean).map(escapeHtml).join(' · ');
            return `<div class="m-fila ${it.done ? 'hecha' : ''} ${it.arrastrado && !it.done ? 'arrastrada' : ''}">
                <span class="m-fila-hora">${escapeHtml(it.time || '—')}</span>
                <div class="m-fila-cuerpo" onclick="mobileTareaAcciones('${it.id}', ${offset})"><div class="m-fila-titulo">${escapeHtml(it.title)}</div>${meta ? `<div class="m-fila-meta">${meta}</div>` : ''}</div>
                <button class="m-check ${it.done ? 'on' : ''}" onclick="mobileMarcarTarea('${it.id}', ${offset})" aria-label="Marcar hecha"></button>
            </div>`;
        }

        // Las funciones de escritorio solo repintan si se está en el
        // Planificador; desde el inicio hay que repintar a mano.
        function mobileMarcarTarea(id, offset) {
            togglePlannerItemDone(id, offset);
            if (currentView !== 'planner') renderMobileShell();
        }
        function mobileMarcarRecurrente(id) {
            toggleRecurringTaskDoneToday(id);
            if (currentView !== 'planner') renderMobileShell();
        }

        function mobileTareaAcciones(id, offset) {
            const it = plannerItemsForOffset(offset).find(x => x.id === id);
            if (!it) return;
            const subs = Array.isArray(it.subtasks) ? it.subtasks : [];
            showModal(`
                <div class="modal-title">${escapeHtml(it.title)}</div>
                ${it.notes ? `<div class="finance-modal-note" style="margin-bottom:12px">${escapeHtml(it.notes)}</div>` : ''}
                ${subs.length ? `<div class="m-modal-subtareas">${subs.map(st => `
                    <label class="planner-subtask-row"><input type="checkbox" ${st.done ? 'checked' : ''} onchange="togglePlannerSubtaskDone('${it.id}','${st.id}',${offset});renderMobileShell()"><span class="${st.done ? 'done' : ''}">${escapeHtml(st.text)}</span></label>`).join('')}</div>` : ''}
                <button class="btn-modal-primary" onclick="closeModal();addPlannerSubtask('${it.id}',${offset}).then(renderMobileShell)">+ subtarea.</button>
                <button class="btn-secondary btn-danger-pill" style="width:100%;margin-top:10px" onclick="closeModal();deletePlannerItem('${it.id}',${offset}).then(renderMobileShell)">borrar tarea.</button>
            `);
        }

        function renderMobileTeselas() {
            const hoy = todayISO();
            const tareas = plannerItemsForOffset(0), rec = recurringTasksDueToday();
            const total = tareas.length + rec.length;
            const hechas = tareas.filter(i => i.done).length + rec.filter(t => t.completadas?.[hoy]).length;
            const activos = habits.filter(h => h.activo !== false);
            const habHechos = activos.filter(h => h.completadas?.[hoy]).length;
            const { expense } = financeProMonthTotals(financeMonthKey());
            const examen = nextUpcomingExam();
            const diasExamen = examen ? Math.round((new Date(examen.date + 'T12:00:00') - new Date(hoy + 'T12:00:00')) / 86400000) : null;
            const viaje = entries.filter(e => e.type === 'travel' && e.startDate && e.startDate >= hoy).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
            const diasViaje = viaje ? Math.round((new Date(viaje.startDate + 'T12:00:00') - new Date(hoy + 'T12:00:00')) / 86400000) : null;
            const tesela = (view, cifra, texto, extra = '', clase = '') => `
                <button class="m-tesela ${clase}" onclick="mobileIr('${view}')">
                    <span class="m-tesela-cifra">${cifra}</span>
                    <span class="m-tesela-texto">${texto}</span>
                    ${extra}
                </button>`;
            const teselas = [
                tesela('planner', total ? `${hechas}<small>/${total}</small>` : '0', total ? 'tareas de hoy hechas.' : 'tareas para hoy.', total ? `<span class="m-tesela-anillo">${mobileAnillo(hechas / total, 44)}</span>` : ''),
                tesela('habits', activos.length ? `${habHechos}<small>/${activos.length}</small>` : '—', 'hábitos hoy.'),
                tesela('finances', `${Math.round(expense).toLocaleString('es-ES')}<small>€</small>`, `gastado en ${MOBILE_MESES[new Date().getMonth()]}.`),
                !apartadoVisible('studies') ? '' : examen ? tesela('studies', diasExamen === 0 ? 'hoy' : diasExamen, `${diasExamen === 0 ? '' : diasExamen === 1 ? 'día para ' : 'días para '}${escapeHtml(examen.title || 'el examen').toLowerCase()}.`) : tesela('studies', '—', 'sin exámenes a la vista.'),
            ].filter(Boolean);
            if (bandejaPendiente.length) teselas.push(tesela('bandeja', bandejaPendiente.length, `${bandejaPendiente.length === 1 ? 'cambio' : 'cambios'} de claude por validar.`, '', 'm-tesela-acento'));
            const enCamino = pedidos.filter(p => p.estado !== 'entregado');
            if (enCamino.length) teselas.push(tesela('actualizaciones', enCamino.length, `${enCamino.length === 1 ? 'pedido' : 'pedidos'} en camino.`));
            if (viaje) teselas.push(tesela('travels', diasViaje === 0 ? 'hoy' : diasViaje, `${diasViaje === 0 ? 'empieza ' : diasViaje === 1 ? 'día para ' : 'días para '}${escapeHtml((viaje.destination || viaje.title || '').split(',')[0])}.`));
            if (teselas.length % 2) teselas.push(tesela('notes', notes.length, 'notas escritas.'));
            return `<section class="m-teselas">${teselas.join('')}</section>`;
        }

        // ---- Apartados ----
        const MOBILE_QUICK_ADD = {
            notes: { label: '+ nota de hoy.', action: 'openWriteNote()' },
            work: { label: '+ nuevo empleo.', action: "openNewEntry('work')" },
            goals: { label: '+ nuevo objetivo.', action: "openNewEntry('goal')" },
            projects: { label: '+ nuevo proyecto.', action: "openNewEntry('project')" },
            culture: { label: '+ añadir.', action: "openNewEntry(({books:'book',series:'series',movies:'movie',games:'game'})[cultureTab] || 'book')" },
        };

        // Apartados que reutilizan el render de escritorio, dentro de un
        // contenedor que lo adapta (ver .m-generico en styles.css).
        // Funciones flecha: los render viven en archivos que se cargan después.
        const MOBILE_GENERIC_RENDERERS = {
            home: () => renderHome(), work: () => renderWork(), goals: () => renderGoals(), projects: () => renderProjects(), links: () => renderLinks(),
            culture: () => renderCulture(), collectibles: () => renderCollectibles(), documents: () => renderDocuments(),
            friends: () => renderFriendsView(), tags: () => renderTagsView(), graph: () => renderGraph(),
            bandeja: () => renderBandeja(), suggestions: () => renderSuggestions(), settings: () => renderSettings(),
            actualizaciones: () => renderActualizaciones(), universidad: () => renderUniversidad(),
        };

        // Efectos que en escritorio se disparan tras pintar ciertas vistas
        // (cargar datos remotos, enganchar botones...): la vista móvil las
        // pinta por su cuenta, así que hay que repetirlos aquí.
        const MOBILE_SECTION_EFFECTS = {
            documents: () => { loadDocuments(); loadViewerFiles(); },
            friends: () => loadFriendsViewData(),
            suggestions: () => loadMySuggestions(),
            bandeja: () => aplicarBandejaConector(),
            settings: () => {
                if (typeof pwaSyncInstallButton === 'function') pwaSyncInstallButton();
                loadSettingsSubscriptionInfo();
                loadSettingsPushInfo();
                cargarConectoresAjustes();
            },
        };

        const MOBILE_SECCIONES = {
            planner: renderMobilePlanner, finances: renderMobileFinances, studies: renderMobileStudies,
            habits: renderMobileHabits, events: renderMobileEvents, notes: renderMobileNotes, travels: renderMobileTravels,
        };

        function renderMobileSeccion(view) {
            if (MOBILE_SECCIONES[view]) return MOBILE_SECCIONES[view]();
            const quick = MOBILE_QUICK_ADD[view];
            const titulo = view === 'home' ? 'resumen' : (NAV_VIEW_LABELS[view] || view);
            return `${renderMobileCabecera(titulo, view === 'bandeja' && bandejaPendiente.length ? `${bandejaPendiente.length} por validar.` : '')}
                ${quick ? `<button class="m-boton m-boton-acento m-boton-ancho" onclick="${quick.action}">${quick.label}</button>` : ''}
                <div class="m-generico">${MOBILE_GENERIC_RENDERERS[view] ? MOBILE_GENERIC_RENDERERS[view]() : ''}</div>`;
        }

        function renderMobilePlanner() {
            resetDayPlannerIfNeeded();
            const off = plannerDayOffset;
            const items = [...plannerItemsForOffset(off)].sort((a, b) => String(a.time).localeCompare(String(b.time)));
            const hoy = todayISO();
            const rec = off === 0 ? recurringTasksDueToday() : [];
            const total = items.length + rec.length;
            const hechas = items.filter(i => i.done).length + rec.filter(t => t.completadas?.[hoy]).length;
            const backlog = dayPlanner.backlog;
            return `${renderMobileCabecera('planificador', total ? `${hechas} de ${total} hechas.` : 'nada planeado.')}
                <div class="m-pestanas">${['hoy', 'mañana', 'pasado'].map((l, i) => `<button class="${off === i ? 'activa' : ''}" onclick="setPlannerDayOffset(${i})">${l}.</button>`).join('')}</div>
                ${total ? `<div class="m-progreso">${mobileAnillo(hechas / total)}<div><div class="m-progreso-num">${Math.round(hechas / total * 100)}<small>%</small></div><div class="m-progreso-txt">del día, hecho.</div></div></div>` : ''}
                <div class="m-acciones">
                    <button class="m-boton m-boton-acento" onclick="openAddPlannerItem()">+ tarea.</button>
                    <button class="m-boton" onclick="openManageRecurringTasks()">recurrentes.</button>
                </div>
                <div class="m-lista">
                    ${rec.map(t => {
                        const hecha = !!t.completadas?.[hoy];
                        return `<div class="m-fila ${hecha ? 'hecha' : ''}"><span class="m-fila-hora">↻</span><div class="m-fila-cuerpo"><div class="m-fila-titulo">${escapeHtml(t.texto)}</div><div class="m-fila-meta">recurrente</div></div><button class="m-check ${hecha ? 'on' : ''}" onclick="toggleRecurringTaskDoneToday('${t.id}')" aria-label="Marcar hecha"></button></div>`;
                    }).join('')}
                    ${items.map(it => renderMobileFilaTarea(it, off)).join('')}
                </div>
                ${!total ? '<div class="m-vacio">nada todavía. pulsa + tarea.</div>' : ''}
                <div class="m-bloque-cab"><div class="m-etiqueta">pendientes sin día.</div><button class="m-mini" onclick="openAddBacklogTask()">+ añadir</button></div>
                ${backlog.length ? `<div class="m-lista">${backlog.map(it => `
                    <div class="m-fila ${it.done ? 'hecha' : ''}">
                        <div class="m-fila-cuerpo"><div class="m-fila-titulo">${escapeHtml(it.title)}</div>${it.notes ? `<div class="m-fila-meta">${escapeHtml(it.notes)}</div>` : ''}</div>
                        <button class="m-mini" onclick="scheduleBacklogTaskToday('${it.id}')">→ hoy</button>
                        <button class="m-check ${it.done ? 'on' : ''}" onclick="toggleBacklogTaskDone('${it.id}')" aria-label="Marcar hecha"></button>
                    </div>`).join('')}</div>` : '<div class="m-vacio m-vacio-peque">sin pendientes.</div>'}`;
        }

        function renderMobileHabits() {
            const hoy = todayISO();
            const activos = habits.filter(h => h.activo !== false);
            const hechos = activos.filter(h => h.completadas?.[hoy]).length;
            return `${renderMobileCabecera('hábitos', activos.length ? `${hechos} de ${activos.length} hoy.` : 'sin presión.')}
                <button class="m-boton m-boton-acento m-boton-ancho" onclick="openAddHabit()">+ hábito.</button>
                ${activos.length ? activos.map(h => {
                    const on = !!h.completadas?.[hoy];
                    const racha = habitStreak(h);
                    const puntos = Array.from({ length: 14 }, (_, i) => {
                        const d = new Date(); d.setDate(d.getDate() - 13 + i);
                        return `<span class="${h.completadas?.[d.toISOString().slice(0, 10)] ? 'on' : ''}"></span>`;
                    }).join('');
                    return `<div class="m-habito ${on ? 'hecho' : ''}">
                        <button class="m-check m-check-grande ${on ? 'on' : ''}" onclick="toggleHabitToday('${h.id}')" aria-label="Hecho hoy"></button>
                        <div class="m-habito-cuerpo" onclick="openHabitMenu('${h.id}')">
                            <div class="m-habito-nombre">${escapeHtml(h.texto)}</div>
                            <div class="m-habito-racha">${racha > 0 ? `racha de ${racha} día${racha === 1 ? '' : 's'}.` : 'sin racha.'}</div>
                            <div class="m-habito-puntos">${puntos}</div>
                        </div>
                    </div>`;
                }).join('') : '<div class="m-vacio">ningún hábito todavía.</div>'}`;
        }

        function renderMobileFinances() {
            const ahora = new Date();
            const { income, expense } = financeProMonthTotals(financeMonthKey());
            const total = financeProTotalBalance();
            const ratio = income > 0 ? expense / income : (expense > 0 ? 1 : 0);
            const rPeq = Math.max(6, 46 * Math.sqrt(Math.min(ratio, 1)));
            const ultimos = [...financePro.transactions].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 12);
            return `${renderMobileCabecera('finanzas', `${MOBILE_MESES[ahora.getMonth()]}.`)}
                <div class="m-cifra-bloque">
                    <div class="m-etiqueta">patrimonio.</div>
                    <div class="m-cifra">${financeMoney(total)}</div>
                </div>
                ${income || expense ? `
                <div class="m-composicion">
                    <svg viewBox="0 0 100 100" class="m-composicion-svg" aria-hidden="true">
                        <circle cx="50" cy="50" r="48" class="m-circulo-lleno"/>
                        <circle cx="${4 + rPeq + 4}" cy="${96 - rPeq - 4}" r="${rPeq}" class="m-circulo-acento"/>
                    </svg>
                    <div class="m-composicion-texto">
                        <div class="m-cifra-media">${Math.round(ratio * 100)}<small>%</small></div>
                        <div class="m-fila-meta">de lo que ha entrado este mes, ya gastado.</div>
                    </div>
                </div>` : ''}
                <div class="m-dos">
                    <div><div class="m-etiqueta">entra.</div><div class="m-cifra-media">${financeMoney(income)}</div></div>
                    <div><div class="m-etiqueta">sale.</div><div class="m-cifra-media">${financeMoney(expense)}</div></div>
                </div>
                <div class="m-acciones">
                    <button class="m-boton m-boton-acento" onclick="openFinanceProQuickCaptureModal()">+ movimiento.</button>
                    <button class="m-boton" onclick="pegarExtractoBancario()">pegar extracto.</button>
                </div>
                <div class="m-bloque-cab"><div class="m-etiqueta">cuentas.</div></div>
                <div class="m-lista">${FINANCE_PRO_ACCOUNT_KEYS.map(k => `
                    <div class="m-fila"><div class="m-fila-cuerpo"><div class="m-fila-titulo">${escapeHtml((financePro.accounts[k]?.name || k).toLowerCase())}.</div></div><span class="m-fila-cifra">${financeMoney(financeProAccountBalance(k))}</span></div>`).join('')}
                </div>
                <div class="m-bloque-cab"><div class="m-etiqueta">últimos movimientos.</div></div>
                ${ultimos.length ? `<div class="m-lista">${ultimos.map(t => {
                    const cat = financeProCategoryById(t.category);
                    const d = new Date((t.date || todayISO()) + 'T12:00:00');
                    const signo = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '⇄';
                    return `<div class="m-fila ${t.type === 'income' ? 'positiva' : ''}">
                        <span class="m-fila-hora">${d.getDate()} ${MOBILE_MESES[d.getMonth()].slice(0, 3)}</span>
                        <div class="m-fila-cuerpo"><div class="m-fila-titulo">${escapeHtml(t.note || t.bankNote || cat?.name || 'movimiento')}</div><div class="m-fila-meta">${escapeHtml([cat?.name, financePro.accounts[t.account]?.name].filter(Boolean).join(' · ').toLowerCase())}</div></div>
                        <span class="m-fila-cifra">${signo}${financeMoney(t.amount)}</span>
                    </div>`;
                }).join('')}</div>` : '<div class="m-vacio m-vacio-peque">sin movimientos.</div>'}
                <button class="m-enlace m-enlace-bloque" onclick="exitMobileToDesktop()">ver el panel completo.</button>`;
        }

        function renderMobileStudies() {
            const hoy = todayISO();
            const ex = nextUpcomingExam();
            const dias = ex ? Math.round((new Date(ex.date + 'T12:00:00') - new Date(hoy + 'T12:00:00')) / 86400000) : null;
            const claveHoy = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'][new Date().getDay()];
            const clasesHoy = (studies.schedule[claveHoy] || []).slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''));
            const entregas = [];
            studies.subjects.forEach(s => (s.assignments || []).forEach(a => { if (!a.done && a.date && a.date >= hoy) entregas.push({ ...a, asignatura: s.name }); }));
            entregas.sort((a, b) => a.date.localeCompare(b.date));
            const fechaCorta = iso => { const d = new Date(iso + 'T12:00:00'); return `${d.getDate()} ${MOBILE_MESES[d.getMonth()].slice(0, 3)}`; };
            return `${renderMobileCabecera('estudios', ex ? `examen ${eventCountdownLabel(ex.date).toLowerCase()}.` : 'sin exámenes a la vista.')}
                ${ex ? `
                <div class="m-destacado">
                    <div class="m-destacado-cifra">${dias === 0 ? 'hoy' : dias}</div>
                    <div class="m-destacado-texto">
                        <div class="m-etiqueta">${dias === 0 ? 'examen.' : dias === 1 ? 'día para el examen.' : 'días para el examen.'}</div>
                        <div class="m-destacado-titulo">${escapeHtml(ex.title || 'examen')}</div>
                        <div class="m-fila-meta">${escapeHtml(ex.subjectName)} · ${fechaCorta(ex.date)}</div>
                    </div>
                </div>` : ''}
                <div class="m-bloque-cab"><div class="m-etiqueta">clases de hoy.</div></div>
                ${clasesHoy.length ? `<div class="m-lista">${clasesHoy.map(b => `<div class="m-fila"><span class="m-fila-hora">${escapeHtml(b.time || '')}</span><div class="m-fila-cuerpo"><div class="m-fila-titulo">${escapeHtml(b.subject || '')}</div></div></div>`).join('')}</div>` : '<div class="m-vacio m-vacio-peque">sin clases hoy.</div>'}
                ${entregas.length ? `<div class="m-bloque-cab"><div class="m-etiqueta">entregas.</div></div>
                <div class="m-lista">${entregas.slice(0, 6).map(a => `<div class="m-fila"><span class="m-fila-hora">${fechaCorta(a.date)}</span><div class="m-fila-cuerpo"><div class="m-fila-titulo">${escapeHtml(a.title || 'trabajo')}</div><div class="m-fila-meta">${escapeHtml(a.asignatura)}</div></div></div>`).join('')}</div>` : ''}
                <div class="m-bloque-cab"><div class="m-etiqueta">semana.</div></div>
                <div class="m-semana">${STUDIES_SCHEDULE_DISPLAY_DAYS.map(d => {
                    const bloques = (studies.schedule[d.key] || []).slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''));
                    return `<div class="m-semana-dia ${d.key === claveHoy ? 'hoy' : ''}"><div class="m-semana-letra">${escapeHtml(d.label.slice(0, 3).toLowerCase())}.</div><div class="m-semana-clases">${bloques.length ? bloques.map(b => `<span><b>${escapeHtml(b.time || '')}</b> ${escapeHtml(b.subject || '')}</span>`).join('') : '<span class="m-fila-meta">—</span>'}</div></div>`;
                }).join('')}</div>
                <div class="m-bloque-cab"><div class="m-etiqueta">asignaturas.</div><button class="m-mini" onclick="openAddSubject()">+ añadir</button></div>
                <div class="m-generico m-generico-sin-zoom studies-subjects-list">
                    ${asignaturasEnCurso().length ? asignaturasEnCurso().map((s, i, l) => renderSubjectRow(s, i, l.length)).join('') : '<div class="m-vacio m-vacio-peque">ninguna asignatura todavía.</div>'}
                </div>`;
        }

        function renderMobileEvents() {
            const hoy = todayISO();
            const eventos = entries.filter(e => e.type === 'event' && !isCalendarLogEntry(e) && e.date);
            const prox = eventos.filter(e => e.date >= hoy).sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
            const pasados = eventos.filter(e => e.date < hoy).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
            const fila = e => {
                const d = new Date(e.date + 'T12:00:00');
                const icono = EVENT_TYPE_ICONS[e.eventType] || EVENT_TYPE_ICONS.otro || '';
                return `<div class="m-evento" data-open-entry="${e.id}">
                    <div class="m-evento-fecha"><span>${d.getDate()}</span><small>${MOBILE_DIAS[d.getDay()]}.</small></div>
                    <div class="m-fila-cuerpo"><div class="m-fila-titulo">${escapeHtml(e.title || '')}</div><div class="m-fila-meta">${escapeHtml([e.time, e.place].filter(Boolean).join(' · '))}</div></div>
                    <span class="m-evento-icono">${icono}</span>
                </div>`;
            };
            let mesActual = '';
            const lista = prox.map(e => {
                const d = new Date(e.date + 'T12:00:00');
                const clave = `${MOBILE_MESES[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}.`;
                const cab = clave !== mesActual ? `<div class="m-bloque-cab"><div class="m-etiqueta">${clave}</div></div>` : '';
                mesActual = clave;
                return cab + fila(e);
            }).join('');
            return `${renderMobileCabecera('eventos', prox.length ? `próximo ${eventCountdownLabel(prox[0].date).toLowerCase()}.` : 'nada a la vista.')}
                <button class="m-boton m-boton-acento m-boton-ancho" onclick="openNewEntry('event')">+ evento.</button>
                ${lista || '<div class="m-vacio">ningún evento por venir.</div>'}
                ${pasados.length ? `<div class="m-bloque-cab"><div class="m-etiqueta">pasados.</div></div><div class="m-pasados">${pasados.map(fila).join('')}</div>` : ''}`;
        }

        function renderMobileNotes() {
            const lista = [...notes].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            return `${renderMobileCabecera('notas', lista.length ? `${lista.length} escrita${lista.length === 1 ? '' : 's'}.` : 'ninguna todavía.')}
                <button class="m-boton m-boton-acento m-boton-ancho" onclick="openWriteNote()">+ nota de hoy.</button>
                ${lista.map(n => {
                    const extracto = extractoNota(n.content);
                    return `<div class="m-nota" onclick="openReadNote('${n.id}')">
                        <div class="m-fila-meta">${formatNoteFecha(n.date)}${n.date === todayISO() ? ' · hoy' : ''}</div>
                        <div class="m-nota-titulo">${n.title ? escapeHtml(n.title) : 'sin título.'}</div>
                        ${extracto ? `<div class="m-nota-texto">${escapeHtml(extracto)}</div>` : ''}
                    </div>`;
                }).join('')}`;
        }

        function renderMobileTravels() {
            if (window._openTripId && getTrip(window._openTripId)) {
                return `<div class="m-generico">${renderTravels()}</div>`;
            }
            const hoy = todayISO();
            const viajes = entries.filter(e => e.type === 'travel');
            const futuros = viajes.filter(t => !t.startDate || (t.endDate || t.startDate) >= hoy).sort((a, b) => (a.startDate || '9').localeCompare(b.startDate || '9'));
            const pasados = viajes.filter(t => t.startDate && (t.endDate || t.startDate) < hoy).sort((a, b) => b.startDate.localeCompare(a.startDate));
            const sig = futuros.find(t => t.startDate);
            const tarjeta = (t, grande) => {
                const st = tripStatus(t);
                const reservas = (t.transportes || []).length + (t.alojamientos || []).length;
                return `<div class="m-viaje ${grande ? 'm-viaje-grande' : ''}" onclick="openTripManager('${t.id}')">
                    <div class="m-etiqueta">${escapeHtml(st.label.toLowerCase())}.</div>
                    <div class="m-viaje-titulo">${escapeHtml(t.title || t.destination || 'viaje')}</div>
                    <div class="m-viaje-pie">
                        <div class="m-fila-meta">${t.startDate ? escapeHtml(formatTravelRange(t.startDate, t.endDate)) : 'sin fecha'}${reservas ? ` · ${reservas} reserva${reservas === 1 ? '' : 's'}` : ''}</div>
                        ${grande && t.startDate > hoy ? `<div class="m-viaje-cuenta">${Math.round((new Date(t.startDate + 'T12:00:00') - new Date(hoy + 'T12:00:00')) / 86400000)}<small>días</small></div>` : ''}
                    </div>
                </div>`;
            };
            return `${renderMobileCabecera('viajes', sig ? `${escapeHtml((sig.destination || sig.title || '').split(',')[0].toLowerCase())}, ${eventCountdownLabel(sig.startDate).toLowerCase()}.` : `${viajes.length} viaje${viajes.length === 1 ? '' : 's'}.`)}
                <button class="m-boton m-boton-acento m-boton-ancho" onclick="openNewEntry('travel')">+ nuevo viaje.</button>
                ${futuros.map((t, i) => tarjeta(t, i === 0)).join('')}
                ${pasados.length ? `<div class="m-bloque-cab"><div class="m-etiqueta">hechos.</div></div>${pasados.map(t => tarjeta(t, false)).join('')}` : ''}
                ${!viajes.length ? '<div class="m-vacio">ningún viaje todavía.</div>' : ''}`;
        }

        const NAV_VIEW_LABELS = Object.fromEntries(NAV_SECTIONS.flatMap(s => s.items).map(i => [i.view, i.text]));

        // ============================================================
        //  PERFIL Y APARTADOS OPCIONALES (Ajustes → apartados.)
        //  Un apartado que no corresponde al perfil (Estudios para quien
        //  solo trabaja, Empleo para quien solo estudia) o un opcional sin
        //  activar desaparece del todo: menús, buscador, captura rápida,
        //  ayuda e inicio móvil. Sin elección guardada, el perfil es
        //  "ambos" y un opcional cuenta como activado solo si ya tiene datos.
        // ============================================================
        const PERFILES = [
            { id: 'estudiante', titulo: 'estudiante.', texto: 'Estudios a la vista; sin Empleo.' },
            { id: 'trabajador', titulo: 'trabajador.', texto: 'Empleo a la vista; sin Estudios ni exámenes.' },
            { id: 'ambos', titulo: 'ambas.', texto: 'Estudios y Empleo.' },
        ];
        // `porDefecto` decide si un opcional está activo mientras el usuario no
        // haya elegido: así las cuentas que ya lo usaban no lo pierden y las
        // nuevas empiezan con lo básico.
        const APARTADOS_OPCIONALES = [
            { view: 'universidad', titulo: 'universidad.', texto: 'Tu carrera por cuatrimestres: créditos, media, fechas de exámenes y qué necesitas para aprobar.', porDefecto: () => false },
            { view: 'actualizaciones', titulo: 'envíos.', texto: 'Tus pedidos por internet y por dónde van.', porDefecto: () => pedidos.length > 0 },
            { view: 'projects', titulo: 'proyectos.', texto: 'Proyectos con fases, lista o tablero.', porDefecto: () => entries.some(e => e.type === 'project') },
            { view: 'links', titulo: 'enlaces.', texto: 'Webs y recursos guardados por carpetas.', porDefecto: () => links.length > 0 },
            { view: 'tags', titulo: 'etiquetas.', texto: 'Todo lo que lleva la misma etiqueta, junto.', porDefecto: () => entries.some(e => (e.tags || []).length) },
            { view: 'graph', titulo: 'conexiones.', texto: 'Cómo se relacionan tus viajes, personas, lugares y etiquetas.', porDefecto: () => entries.length >= 30 },
            { view: 'collectibles', titulo: 'coleccionables.', texto: 'Tu colección (cartas, videojuegos...) con su valor de mercado.', porDefecto: () => collectibles.length > 0 },
        ];

        function configApartados() {
            const c = apartadosConfig || {};
            const perfil = PERFILES.some(p => p.id === c.perfil) ? c.perfil : 'ambos';
            const opcionales = { ...(c.opcionales || {}) };
            APARTADOS_OPCIONALES.forEach(o => { if (opcionales[o.view] === undefined) opcionales[o.view] = o.porDefecto(); });
            return { perfil, opcionales };
        }

        function apartadoVisible(view) {
            const { perfil, opcionales } = configApartados();
            if ((view === 'studies' || view === 'universidad') && perfil === 'trabajador') return false;
            if (view === 'work' && perfil === 'estudiante') return false;
            if (APARTADOS_OPCIONALES.some(o => o.view === view) && !opcionales[view]) return false;
            return true;
        }

        function navSeccionesVisibles() {
            return NAV_SECTIONS.map(s => ({ ...s, items: s.items.filter(i => apartadoVisible(i.view)) })).filter(s => s.items.length);
        }

        async function guardarConfigApartados(cambio) {
            apartadosConfig = { ...configApartados(), ...cambio };
            if (!apartadoVisible(currentView)) currentView = 'calendar';
            renderAllNavs();
            render();
            try { await saveData(); } catch (e) { console.error(e); showToast('No se pudo guardar en la nube', true); }
        }

        function elegirPerfil(id) { guardarConfigApartados({ perfil: id }); }

        function alternarOpcional(view) {
            const { opcionales } = configApartados();
            guardarConfigApartados({ opcionales: { ...opcionales, [view]: !opcionales[view] } });
        }

        // Apartados "de segundo nivel" dentro de cada sección — para poder
        // escribir p.ej. "asignaturas" en el buscador y llegar directo a
        // Estudios > Asignaturas, aunque el nombre no coincida con ninguna
        // sección de primer nivel. `anchor` hace scroll hasta ese bloque,
        // `setter`+`value` cambia una pestaña/modo interno (llama a
        // window[setter](value) tras cambiar de vista), `action` llama a una
        // función tras cambiar de vista (p.ej. abrir un modal).
        const NAV_SUBSECTIONS = [
            { view: 'friends', text: 'Gastos compartidos', setter: 'setSocialTab', value: 'gastos' },
            { view: 'friends', text: 'Amigos', setter: 'setSocialTab', value: 'amigos' },
            { view: 'friends', text: 'Eventos compartidos', setter: 'setSocialTab', value: 'eventos' },
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
            { view: 'settings', text: 'Guía de Bitácora', action: 'openGuia' },
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
            { type: 'work', text: 'Empleo' },
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
        const EVENT_TYPE_LABELS = { social: 'Social', teatro: 'Teatro', cine: 'Cine', concierto: 'Concierto', deportes: 'Deportes', futbol: 'Fútbol', baloncesto: 'Baloncesto', f1: 'F1', motogp: 'Moto GP', estudios: 'Estudios', trabajo: 'Trabajo', salud: 'Salud', hogar: 'Hogar', viajes: 'Viajes', otro: 'Otro' };
        // Deportes es una categoría con subcategorías. El evento guarda la
        // subcategoría en eventType (futbol, f1...) igual que antes, así los
        // eventos ya existentes no necesitan migrarse; 'deportes' a secas
        // es un evento deportivo sin especificar.
        const EVENT_DEPORTES = ['futbol', 'baloncesto', 'f1', 'motogp'];
        const EVENT_CATEGORIAS = ['social', 'teatro', 'cine', 'concierto', 'deportes', 'estudios', 'trabajo', 'salud', 'hogar', 'viajes', 'otro'];

        function eventCategoria(tipo) {
            return EVENT_DEPORTES.includes(tipo) ? 'deportes' : (EVENT_TYPE_LABELS[tipo] ? tipo : 'otro');
        }

        function eventCoincideFiltro(e, filtro) {
            return filtro === 'all' || e.eventType === filtro || (filtro === 'deportes' && eventCategoria(e.eventType) === 'deportes');
        }
        // Iconos sólidos (misma familia TARJETA BITACORA) para el chip a la
        // izquierda de cada tarjeta de evento — uno por tipo, más un
        // genérico de reserva. "Deporte" se divide en cuatro disciplinas
        // propias en vez de un único icono genérico.
        const EVENT_TYPE_ICONS = {
            social: '<svg viewBox="0 0 1311 1200" fill-rule="evenodd" fill="currentColor"><path d="M 990.61,245.78 c 0.14,0.73 -0.15,1.15 -0.87,1.26 c -1.88,-0.35 -1.6,-1.51 -1.45,0.8 c 2.09,4.32 4.36,8.55 6.83,12.68 c 1.08,0.59 1.4,-0.48 2.21,0.7 c -0.44,2 -0.47,4.01 -0.08,6.01 c 1.81,0.95 2.82,0.43 3.02,-1.58 c 0.2,-0.35 0.48,-0.58 0.86,-0.71 c 7.23,22.64 3.2,37.06 -5.88,57.6 c -3.45,17.85 24.14,17.13 35.06,21.85 c 87.08,24.74 147.14,100.98 154.83,190.59 c -1.33,0.34 -1.08,1.75 -1.6,2.7 c -1.21,-0.96 -0.23,-5.6 -0.63,-7.14 c -0.29,-1.56 -0.58,-1.58 -0.88,-0.07 c -0.38,4.62 -0.74,9.23 -1.1,13.85 c 0.48,6.71 0.86,13.43 1.15,20.16 c -0.94,6.01 -1.97,12.01 -3.09,17.99 c 0.06,1.29 0.13,2.57 0.23,3.86 c 0.51,0.67 1.02,0.66 1.54,-0.02 c 0.83,-3.99 1.41,-8 1.73,-12.03 c 0.07,1.18 0.56,2.09 1.48,2.75 c -3.85,31.82 -17.56,79.25 -42.52,100.85 c -4.9,3.59 -10.12,4.16 -15.66,1.72 c 0.55,-0.48 1.04,-1.02 1.45,-1.63 c -6.13,-8.95 -4.42,-17.59 -2.3,-27.42 c -0.02,-0.92 0.47,-2.52 -0.43,-3.16 c -0.91,1.07 -0.84,1.82 -2.27,0.69 c 13.31,-45.49 8.52,-109.27 -31.56,-140.4 c -4.67,-3.18 -9.9,-2.54 -11.11,3.6 c -10.94,103.59 -61.12,186.52 -142.64,249.97 c -62.25,48.52 -131.92,87.8 -197.46,131.7 c -31.19,21.4 -61.99,43.33 -92.39,65.82 c -17.82,12.78 -36.23,25.38 -56.02,34.93 c -19.48,10.19 -32.98,-7.66 -18.55,-23.67 c 19.2,-22.64 41.63,-43.37 63.13,-63.82 c 35.77,-32.95 71.78,-65.63 108.04,-98.03 c 13.51,-12.42 25.14,-26.82 38.78,-39.22 c 28.81,-26.35 59.5,-50.5 88.93,-76.13 c 6.37,-4.64 9.63,-15.1 -1.38,-15.35 c -16.43,0.88 -34.73,7.59 -50.34,12.8 c -54.64,20.11 -103.53,48.19 -153.6,77.38 c -11.72,6.57 -30.27,13.66 -35.67,-4.35 c -2.34,-13.82 10.62,-29.49 17.92,-40.31 c 60.82,-78.53 153.5,-108.56 239.62,-149.64 c 25.5,-12.65 59.64,-33.65 62.78,-64.86 c 0.59,-33.78 -37.03,-45.22 -64.72,-44.99 c -38.5,-0.46 -76.46,11.19 -113.52,20.39 c -69.22,19.07 -138.63,36.63 -208.99,51.01 c -43.4,9.32 -87.98,16.38 -130.98,27.11 c -39.11,9.47 -89.41,38.62 -110.86,73.25 c -10.62,17.85 0.42,25.74 17.85,25.61 c 31.9,0.68 67.33,-0.58 98.46,6.74 c 33.76,8.57 56.26,37.26 45.75,72.71 c -21.27,66.33 -91.28,124.24 -146.04,163.98 c -9.51,5.95 -23.39,17.6 -34.97,17.23 c -14.33,-1.01 -17.22,-16.07 -8.32,-25.66 c 26.28,-28.45 50.43,-58.61 72.44,-90.49 c 9.92,-14.17 32.45,-46.8 11.19,-59.92 c -26.26,-11.68 -70.48,4.81 -95.07,16.88 c -84.91,41 -128.52,131.83 -171.04,211.04 c -5.99,9.8 -13.17,23.92 -25.4,26.61 c -13.76,2.48 -18.06,-10.6 -19.26,-21.54 c -4.21,-37.95 2.58,-75.15 12.18,-111.76 c 30.62,-109.26 73.63,-226.85 149.6,-313.18 c 32.62,-37.05 72.75,-69.56 120.31,-84.82 c 9.4,-3.5 0.69,-12.74 -0.75,-18.72 c -20.3,-60.92 56.28,-107.33 103.08,-66.22 c 37.81,34.71 11.36,86.57 -33.97,95.62 c -5.42,2.25 -19.81,-1.54 -21.92,5.07 c -1.28,7.98 8.14,8.41 13.73,8.61 c 74.07,-0.46 152.32,-6.59 224.85,-22.3 c 100.59,-23.22 197.39,-64.61 292.32,-104.5 c 5.56,-3.13 19.28,-6.13 21.05,-12.93 c 0.46,-3.9 -1.28,-6.01 -5.21,-6.33 c -57.11,5.79 -93.06,-56.75 -57.61,-102.54 c 28.32,-34.6 78.06,-33.31 105.71,1.32 Z M 1186.82,556.02 c 0.04,-7.83 0.11,-15.67 0.21,-23.5 c -0.08,-0.81 0.08,-1.55 0.48,-2.22 c 0.48,1.28 0.72,2.63 0.73,4.05 c 2.12,3.31 0.9,6.52 0.86,10.14 c 0.1,6 0.16,12.01 0.18,18.03 c -0.58,2.06 -1.15,4.12 -1.72,6.18 c -0.45,-0.64 -0.65,-1.36 -0.6,-2.16 c -0.03,-3.51 -0.07,-7.01 -0.14,-10.52 Z"/></svg>',
            teatro: '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M10 92V55a40 40 0 0 1 80 0v37z"/></svg>',
            cine: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M8 26a18 18 0 0 1 18-18h48a18 18 0 0 1 18 18v48a18 18 0 0 1-18 18H26A18 18 0 0 1 8 74zM40 32l28 18-28 18z"/></svg>',
            concierto: '<svg viewBox="0 0 100 100" fill="currentColor"><circle cx="28" cy="76" r="16"/><rect x="40" y="15" width="9" height="61"/><path d="M40 15l38-11v20l-38 11z"/></svg>',
            futbol: '<svg viewBox="-55 -55 477 472"><g transform="translate(0,362) scale(0.1,-0.1)" fill="currentColor" stroke="none"><path d="M2217 3322 c310 -77 554 -218 772 -448 200 -211 344 -494 397 -779 27\n-149 30 -386 5 -537 -105 -638 -567 -1138 -1201 -1298 -172 -43 -435 -54 -615\n-25 -739 119 -1289 723 -1320 1450 l-4 110 14 -80 c39 -220 37 -214 133 -307\n48 -45 147 -132 219 -192 125 -103 133 -112 133 -145 0 -60 29 -217 50 -273\n33 -88 73 -138 152 -191 145 -96 366 -188 525 -218 57 -10 65 -10 108 11 56\n27 131 84 206 157 l55 54 119 4 c134 5 229 16 398 47 64 11 120 18 123 15 4\n-3 2 -37 -4 -74 -5 -37 -8 -70 -6 -72 8 -9 173 99 258 170 145 120 255 251\n349 414 49 85 113 232 105 240 -3 3 -85 -40 -183 -95 -98 -55 -179 -100 -180\n-100 -1 0 -41 92 -90 204 l-88 205 61 148 c119 292 204 488 213 498 8 7 197\n-48 318 -93 17 -6 11 31 -25 156 -64 219 -183 429 -345 606 -54 59 -196 186\n-209 186 -3 0 -3 -26 1 -57 9 -73 11 -241 3 -280 -6 -29 -7 -29 -52 -22 -105\n17 -424 2 -532 -26 -23 -6 -33 3 -95 86 -38 51 -127 152 -198 226 -114 117\n-128 135 -116 149 21 26 155 113 254 166 104 56 102 56 292 10z m-1294 -403\nc107 -72 104 -61 36 -142 -98 -117 -171 -247 -229 -411 l-29 -79 -144 -57\nc-80 -31 -161 -67 -182 -78 -20 -12 -38 -22 -41 -22 -20 0 28 209 70 303 42\n96 119 216 204 318 91 110 217 223 238 215 8 -3 42 -24 77 -47z m943 -967 c43\n-70 124 -201 181 -290 57 -90 103 -168 103 -174 0 -6 -26 -40 -58 -77 -63 -71\n-315 -378 -347 -423 -11 -15 -25 -28 -32 -28 -6 0 -80 32 -165 71 -84 39 -218\n100 -298 136 -80 35 -149 68 -153 72 -20 19 -2 423 27 625 l11 79 115 24 c63\n13 207 45 320 71 113 27 208 47 212 45 4 -2 42 -61 84 -131z"/></g></svg>',
            baloncesto: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M50 4a46 46 0 1 0 0 92 46 46 0 0 0 0-92zM46 6h8v88h-8zM13 30c9 6 16 15 16 20s-7 14-16 20l-5-7c7-5 12-11 12-13s-5-8-12-13z M87 30c-9 6-16 15-16 20s7 14 16 20l5-7c-7-5-12-11-12-13s5-8 12-13z"/></svg>',
            f1: '<svg viewBox="0 0 100 100" fill="currentColor"><text x="50" y="66" text-anchor="middle" font-size="54" font-weight="800" font-family="Poppins, sans-serif">F1</text></svg>',
            motogp: '<svg viewBox="0 0 100 100" fill="currentColor"><circle cx="22" cy="74" r="13"/><circle cx="78" cy="74" r="13"/><circle cx="60" cy="28" r="8"/><path d="M18 74l16-20h14l10-14c3-4 9-5 12-1l-7 9 9 11h10l6 15H70l-8-13H42z"/></svg>',
            deportes: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M28 8h44v12h18v10c0 15-11 26-25 28-3 7-8 11-11 12v12h14v10H32V82h14V70c-3-1-8-5-11-12-14-2-25-13-25-28V20h18zM20 30c0 8 6 15 13 17-3-5-5-11-5-17zm60 0h-8c0 6-2 12-5 17 7-2 13-9 13-17z"/></svg>',
            estudios: '<svg viewBox="0 0 341 337" fill="currentColor"><circle cx="166.5" cy="77" r="39"/><path d="M49 117C91 117 131 132 166 162C201 132 241 117 283 117L283 259C240 259 201 275 188 287C179 295 172 301 166 305C160 301 153 295 144 287C131 275 92 259 49 259Z"/></svg>',
            hogar: '<svg viewBox="0 0 368 386" fill="currentColor"><path d="M183.5 0L367 178.5H326V386H222V270H146V386H42V178.5H0Z"/></svg>',
            // Trabajo (sobre) y salud (pastilla): trazados de los dibujos del usuario.
            trabajo: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path d="M9.3 22.9Q9.0 23.2 7.7 25.7Q6.4 28.3 5.4 31.8Q4.4 35.3 4.2 37.3Q4.0 39.4 4.1 51.1Q4.1 62.8 4.7 65.7Q5.2 68.5 6.4 71.6Q7.7 74.7 9.8 77.6Q11.9 80.6 14.5 82.9Q17.0 85.2 20.7 87.1Q24.4 89.0 26.1 89.5Q27.8 90.1 31.2 90.5Q34.5 90.9 50.0 90.9Q65.5 90.9 68.8 90.5Q72.2 90.1 74.2 89.4Q76.2 88.8 78.8 87.5Q81.3 86.3 83.3 84.9Q85.2 83.4 86.7 82.0Q88.2 80.5 89.6 78.7Q91.0 76.8 91.8 75.5Q92.6 74.2 93.6 71.7Q94.6 69.2 95.2 66.0Q95.9 62.7 95.9 51.1Q96.0 39.4 95.8 37.4Q95.6 35.4 95.2 33.3Q94.7 31.2 93.7 28.7Q92.7 26.3 91.7 24.6Q90.8 22.9 90.1 22.9Q89.5 22.8 78.8 33.5Q68.2 44.3 66.3 45.8Q64.5 47.3 61.0 49.1Q57.4 50.8 54.6 51.3Q51.8 51.8 50.0 51.8Q48.2 51.8 45.7 51.4Q43.3 51.0 41.8 50.5Q40.2 49.9 37.8 48.6Q35.4 47.2 33.6 45.7Q31.8 44.3 21.2 33.6Q10.6 22.9 10.2 22.8Q9.7 22.7 9.3 22.9ZM18.2 14.2Q17.5 14.9 17.7 15.4Q17.9 15.8 28.5 26.4Q39.2 37.0 41.2 38.5Q43.2 39.9 45.4 40.6Q47.6 41.4 50.2 41.4Q52.9 41.3 54.5 40.8Q56.1 40.2 57.3 39.5Q58.6 38.8 61.1 36.6Q63.7 34.3 73.1 24.8Q82.5 15.2 82.4 15.0Q82.4 14.7 81.7 14.1Q81.1 13.6 78.4 12.3Q75.6 11.0 73.8 10.5Q72.0 9.9 68.5 9.5Q65.0 9.1 50.0 9.1Q35.0 9.1 33.2 9.3Q31.4 9.4 27.9 10.2Q24.4 11.0 21.6 12.3Q18.9 13.6 18.2 14.2Z"/></svg>',
            salud: '<svg viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd"><path transform="translate(50 50) scale(.82) translate(-50 -50)" d="M88.0 12.7Q84.2 8.6 81.8 7.3Q79.3 5.9 75.7 4.9Q72.2 4.0 68.6 4.1Q65.0 4.2 61.4 5.4Q57.8 6.5 54.5 8.7Q51.3 11.0 31.7 30.4Q12.2 49.8 10.3 52.1Q8.4 54.4 7.2 56.9Q5.9 59.3 4.9 63.0Q4.0 66.7 4.0 68.9Q4.0 71.1 4.9 75.2Q5.9 79.3 7.0 81.4Q8.0 83.6 9.9 85.9Q11.8 88.2 14.3 90.1Q16.9 92.0 19.2 93.2Q21.5 94.3 24.4 95.1Q27.2 95.8 30.9 95.8Q34.6 95.8 38.3 94.6Q42.0 93.5 45.9 90.7Q49.8 88.0 69.1 68.7Q88.4 49.4 89.9 47.6Q91.4 45.8 92.6 43.5Q93.9 41.1 94.8 38.0Q95.8 34.8 95.9 31.7Q96.0 28.7 95.1 24.9Q94.1 21.1 92.9 18.9Q91.8 16.7 88.0 12.7ZM81.7 18.2Q84.8 21.3 86.1 25.0Q87.3 28.7 87.2 31.1Q87.1 33.5 86.4 35.9Q85.7 38.2 83.7 40.9Q81.7 43.7 74.7 50.5Q67.7 57.4 66.6 57.6Q65.4 57.8 56.4 48.8Q47.5 39.9 46.6 39.6Q45.8 39.2 45.0 39.6Q44.3 39.9 29.5 54.7Q14.8 69.6 13.9 69.3Q13.1 69.0 13.6 65.6Q14.1 62.2 15.9 59.6Q17.7 57.0 36.9 37.9Q56.1 18.8 58.4 17.0Q60.8 15.2 63.8 14.0Q66.9 12.9 69.8 13.0Q72.8 13.1 75.6 14.1Q78.5 15.2 81.7 18.2Z"/></svg>',
            viajes: '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M10 54L36 12l15 22 14-22 25 42z"/><path d="M12 80c6-12 12-14 19-14 11 0 12 16 19 16s9-16 19-16c7 0 13 3 19 14" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            otro: '<svg viewBox="0 0 100 100" fill="currentColor"><circle cx="50" cy="50" r="23"/></svg>'
        };
        // Icono de la tarjeta "Próximo evento · hoy" — signo de exclamación
        // grueso y ligeramente inclinado, misma familia TARJETA BITACORA.
        const EVENT_HERO_ICON_ALERT = '<svg viewBox="0 0 100 100" fill="currentColor"><path d="M46 4 L70 10 L58 62 L40 58 Z"/><path d="M30 74 L52 79 L46 96 L26 91 Z"/></svg>';
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
            menu.style.transformOrigin = `${event.clientX - Math.max(8, x)}px ${event.clientY - Math.max(8, y)}px`;
            setTimeout(() => document.addEventListener('click', closeNavContextMenu, { once: true }), 0);
        }

        function toggleHiddenDrawer(el) {
            el.parentElement.classList.toggle('open');
        }

        function renderNavButtons(sections, mobile) {
            return sections.map(sec => `<span class="nav-label">${escapeHtml(sec.label)}</span>` +
                sec.items.filter(i => !isSectionHidden(i.view) && apartadoVisible(i.view)).map(i => mobile
                    ? `<button onclick="switchView('${i.view}')" oncontextmenu="openNavContextMenu(event,'${i.view}')" data-view="${i.view}">${escapeHtml(i.text)}${i.view === 'bandeja' && bandejaPendiente.length ? ` <span class="nav-bandeja-badge">(${bandejaPendiente.length})</span>` : ''}</button>`
                    : `<button onclick="switchView('${i.view}')" oncontextmenu="openNavContextMenu(event,'${i.view}')" data-view="${i.view}"><span class="nav-text">${escapeHtml(i.text)}</span>${i.view === 'bandeja' && bandejaPendiente.length ? `<span class="nav-bandeja-badge">(${bandejaPendiente.length})</span>` : ''}</button>`
                ).join('')
            ).join('');
        }

        // Los apartados ocultos no desaparecen del todo: quedan aquí, en un
        // desplegable al final de la barra, para poder recuperarlos.
        function renderHiddenSectionsDrawer(mobile) {
            const items = bitacoraHiddenSections
                .map(view => ({ view, label: NAV_VIEW_LABELS[view] }))
                .filter(x => x.label && apartadoVisible(x.view));
            if (!items.length) return '';
            return `
                <div class="nav-hidden-drawer">
                    <button class="nav-hidden-toggle" onclick="toggleHiddenDrawer(this)">
                        <span class="nav-text">Apartados ocultos (${items.length})</span>
                        <span class="nav-hidden-arrow">›</span>
                    </button>
                    <div class="nav-hidden-list">
                        ${items.map((x, i) => `
                            <div class="nav-hidden-item" style="--i:${i}">
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

        // Fechas de Notas a la manera del resto de la app: "sáb 3 oct 2026"
        // en las tarjetas y "sábado 3 de octubre de 2026." dentro, en vez
        // del "#03/10/2026" de antes.
        function formatNoteFecha(dateISO, larga) {
            const d = new Date(dateISO + 'T12:00:00');
            if (larga) return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(',', '').toLowerCase() + '.';
            return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(/[.,]/g, '').toLowerCase();
        }

        function extractoNota(content) {
            return String(content || '').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 140);
        }

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

        // La vista de conexiones (antes grafo) vive en conexiones.js.


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
                ? CREATE_PALETTE_ITEMS.filter(i => apartadoVisible({ work: 'work', project: 'projects' }[i.type] || 'calendar')).map(i => ({ ...i, kind: 'create' }))
                : navSeccionesVisibles().flatMap(s => s.items).map(i => ({ ...i, kind: 'nav' }));
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
                const subMatches = q ? NAV_SUBSECTIONS.filter(s => apartadoVisible(s.view) && s.text.toLowerCase().includes(q)).map(s => ({
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
            if (!document.getElementById('app')?.classList.contains('ready')) return false;
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
            const flat = navSeccionesVisibles().flatMap(s => s.items);
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
                if (currentView === 'friends') pintarSocial();
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
                if (currentView === 'friends') pintarSocial();
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
                if (currentView === 'friends') pintarSocial();
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
                pintarSocial();
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
            await Promise.all([cargarCodigoAmigo(), cargarAmigos(), cargarNombrePublico(), cargarSolicitudesAmistad(), cargarGruposGastos(), cargarEventosCompartidos()]);
            if (currentView === 'friends') pintarSocial();
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
                if (currentView === 'friends') pintarSocial();
                if (typeof updateNotifBadge === 'function') updateNotifBadge();
                showToast(aceptar ? 'Amigo añadido' : 'Solicitud rechazada');
            } catch (e) {
                console.error('Error respondiendo a la solicitud de amistad:', e);
                showToast('No se pudo procesar la solicitud' + (e?.message ? ': ' + e.message : ''), true);
            }
        }

        function renderAmigosLista() {
            return `
                <div class="settings-layout">
                <div class="settings-col-main">
                    <div class="chart-container" style="margin-bottom:16px" id="friends-name-section">
                        <div class="chart-title">Tu nombre visible</div>
                        <div style="font-size:11px;color:var(--text-secondary);margin:8px 0 14px">Es el nombre con el que te ven tus amigos dentro de Bitácora. No tiene por qué coincidir con el nombre de tu cuenta, y no puede repetirse con el de otra persona.</div>
                        <div class="friend-add-row">
                            <input type="text" id="nombre-publico-input" class="modal-input" style="margin:0;text-transform:none;letter-spacing:normal;font-family:var(--font-family)" placeholder="Tu nombre visible" value="${escapeHtml(nombrePublico || '')}">
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

