// ============================================================
//  LANDING — movimiento: los bloques aparecen al llegar a ellos, el móvil
//  de la portada se desplaza un poco más lento que la página (paralaje),
//  la barra superior toma fondo al bajar y en las preguntas solo queda
//  abierta una. #landing-screen es el contenedor con scroll, no la ventana.
//  Con "reducir movimiento" activado en el sistema, todo aparece quieto.
// ============================================================
function landingArriba() {
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('landing-screen')?.scrollTo({ top: 0, behavior: reducido ? 'auto' : 'smooth' });
}

function landingIr(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return false;
}

(function () {
    const pantalla = document.getElementById('landing-screen');
    if (!pantalla) return;
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bloques = pantalla.querySelectorAll('.revela');
    if (reducido || !('IntersectionObserver' in window)) {
        bloques.forEach(el => el.classList.add('visto'));
    } else {
        const io = new IntersectionObserver(entradas => entradas.forEach(e => {
            if (!e.isIntersecting) return;
            e.target.classList.add('visto');
            io.unobserve(e.target);
        }), { root: pantalla, threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        bloques.forEach(el => io.observe(el));
    }

    const barra = pantalla.querySelector('.landing-topbar');
    const movil = pantalla.querySelector('.lp-paralaje');
    let pendiente = false;
    pantalla.addEventListener('scroll', () => {
        if (pendiente) return;
        pendiente = true;
        requestAnimationFrame(() => {
            pendiente = false;
            const y = pantalla.scrollTop;
            barra?.classList.toggle('con-fondo', y > 12);
            if (movil && !reducido && y < 1000) movil.style.transform = `translate3d(0, ${(-y * 0.12).toFixed(1)}px, 0)`;
        });
    }, { passive: true });

    pantalla.querySelectorAll('.lp-faq details').forEach(d => d.addEventListener('toggle', () => {
        if (!d.open) return;
        pantalla.querySelectorAll('.lp-faq details[open]').forEach(o => { if (o !== d) o.open = false; });
    }));
})();

// ============================================================
//  LANDING — el cerebro de la portada. Bitácora como segundo cerebro:
//  cada apartado sale de la zona que hace esa función en un cerebro de
//  verdad (el planificador de la corteza prefrontal, las finanzas del
//  lóbulo parietal, las rutinas de los ganglios basales...). Al pasar por
//  un apartado se ilumina su zona, un pulso recorre su línea y una ficha
//  cuenta qué hace; también se enciende el apartado con el que conecta.
//  Sin nadie encima, los recorre solo. Todo es SVG y CSS que solo anima
//  transformaciones, opacidad y trazos; fuera de pantalla se detiene.
// ============================================================
const CEREBRO_ZONAS = [
    { id: 'planificador', zona: 'corteza prefrontal.', x: 44, y: 74, nx: 70, ny: 86, titulo: 'planificador.', texto: 'Tu día por horas.', con: 'rutinas' },
    { id: 'notas', zona: 'memoria de trabajo.', x: 92, y: 34, nx: 176, ny: 34, titulo: 'notas.', texto: 'Lo que no quieres olvidar.', con: 'calendario' },
    { id: 'finanzas', zona: 'lóbulo parietal.', x: 152, y: 32, nx: 430, ny: 34, titulo: 'finanzas.', texto: 'Tu dinero, cuadrado con el banco.', con: 'viajes' },
    { id: 'viajes', zona: 'células de lugar.', x: 200, y: 86, nx: 548, ny: 150, titulo: 'viajes.', texto: 'Cada viaje, con lo que gastaste.', con: 'finanzas' },
    { id: 'rutinas', zona: 'ganglios basales.', x: 140, y: 118, nx: 520, ny: 372, titulo: 'rutinas.', texto: 'Lo que haces cada día, sin presión.', con: 'planificador' },
    { id: 'calendario', zona: 'hipocampo.', x: 118, y: 132, nx: 312, ny: 436, titulo: 'calendario.', texto: 'Todo lo que tiene fecha.', con: 'estudios' },
    { id: 'estudios', zona: 'lóbulo temporal.', x: 86, y: 142, nx: 92, ny: 380, titulo: 'estudios.', texto: 'Exámenes, entregas y notas.', con: 'calendario' },
    { id: 'social', zona: 'sistema límbico.', x: 104, y: 98, nx: 30, ny: 232, titulo: 'social.', texto: 'Gastos y planes con amigos.', con: 'finanzas' },
];
// El cerebro se dibuja en 240 × 200 y se coloca centrado en el lienzo,
// ampliado CEREBRO_ESCALA veces.
const CEREBRO_ESCALA = 1.35, CEREBRO_DX = 300 - 120 * 1.35, CEREBRO_DY = 228 - 100 * 1.35;
const CEREBRO_SILUETA = 'M34 120Q23.1 110.7 22 100Q16.0 88.7 20 78Q19.2 65.6 28 56Q31.7 43.5 44 36Q51.4 25.5 66 22Q76.5 13.7 92 14Q104.9 7.6 120 11Q134.6 7.0 148 13Q163.1 12.0 174 20Q189.3 22.8 198 33Q211.2 39.8 216 52Q226.2 61.9 227 75Q232.5 86.0 228 98C227 112 222 122 212 128C220 138 220 154 206 162C192 170 172 170 160 162C152 160 148 163 146 168L142 190C141 195 133 195 132 190L131 166C122 160 104 160 92 156C76 158 62 152 58 142C54 132 46 126 34 120Z';
const CEREBRO_SURCOS = [
    'M58 134C74 126 92 116 112 113C128 111 140 105 152 102',
    'M126 13C118 28 130 42 122 58C114 74 120 86 112 102',
    'M212 128C196 136 176 144 158 156',
    'M168 146C184 143 200 146 214 150',
    'M166 156C180 153 194 156 206 160',
    'M36 72C46 64 58 72 56 84C54 94 64 98 70 92',
    'M70 38C78 50 90 46 96 56',
    'M146 30C150 44 162 40 170 52C176 60 186 58 190 66',
    'M140 70C152 62 164 74 176 70C186 68 194 80 200 90',
    'M72 100C80 92 92 98 96 108',
    'M80 146C94 140 108 146 124 144',
    'M204 60C212 72 216 84 214 98',
    'M96 70C104 62 116 68 118 80',
];

function montarCerebro() {
    const caja = document.getElementById('lp-cerebro');
    if (!caja) return;
    const linea = z => {
        const ax = z.x * CEREBRO_ESCALA + CEREBRO_DX, ay = z.y * CEREBRO_ESCALA + CEREBRO_DY;
        const cx = 300, cy = 228;
        const k = 0.45;
        return `M${ax} ${ay}C${ax + (ax - cx) * k} ${ay + (ay - cy) * k} ${z.nx + (cx - z.nx) * .25} ${z.ny + (cy - z.ny) * .25} ${z.nx} ${z.ny}`;
    };
    caja.innerHTML = `
        <svg class="lp-cerebro-svg" viewBox="0 0 600 470" aria-hidden="true">
            <defs>
                <radialGradient id="lp-cerebro-luz"><stop offset="0" stop-color="var(--lp-azul)" stop-opacity=".9"/><stop offset="1" stop-color="var(--lp-azul)" stop-opacity="0"/></radialGradient>
                <filter id="lp-cerebro-halo" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
            </defs>
            <g class="lp-cerebro-lineas">${CEREBRO_ZONAS.map((z, i) => `
                <path class="lp-linea" data-z="${z.id}" d="${linea(z)}"/>
                <path class="lp-pulso" data-z="${z.id}" d="${linea(z)}" pathLength="100" style="animation-delay:${(-i * 0.7).toFixed(1)}s"/>`).join('')}
            </g>
            <g class="lp-cerebro-flota">
                <g transform="translate(${CEREBRO_DX} ${CEREBRO_DY}) scale(${CEREBRO_ESCALA})">
                    <path class="lp-cerebro-halo" d="${CEREBRO_SILUETA}" filter="url(#lp-cerebro-halo)"/>
                    <path class="lp-cerebro-fondo" d="${CEREBRO_SILUETA}"/>
                    ${CEREBRO_ZONAS.map(z => `<circle class="lp-zona" data-z="${z.id}" cx="${z.x}" cy="${z.y}" r="30" fill="url(#lp-cerebro-luz)"/>`).join('')}
                    <g class="lp-cerebro-surcos">${CEREBRO_SURCOS.map(d => `<path d="${d}"/>`).join('')}</g>
                    <path class="lp-cerebro-borde" d="${CEREBRO_SILUETA}"/>
                    ${CEREBRO_ZONAS.map(z => `<circle class="lp-neurona" data-z="${z.id}" cx="${z.x}" cy="${z.y}" r="3.2"/>`).join('')}
                </g>
            </g>
        </svg>
        ${CEREBRO_ZONAS.map(z => `<button class="lp-nodo" data-z="${z.id}" style="left:${(z.nx / 600 * 100).toFixed(2)}%;top:${(z.ny / 470 * 100).toFixed(2)}%" aria-describedby="lp-cerebro-ficha">${z.titulo}</button>`).join('')}`;

    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ficha = document.getElementById('lp-cerebro-ficha');
    let activo = null, encima = false, visible = true, turno = 0, reloj = null;
    const encender = id => {
        if (id === activo) return;
        activo = id;
        const z = CEREBRO_ZONAS.find(x => x.id === id);
        caja.querySelectorAll('[data-z]').forEach(el => {
            el.classList.toggle('activo', el.dataset.z === id);
            el.classList.toggle('conectado', !!z && el.dataset.z === z.con);
        });
        caja.classList.toggle('con-activo', !!z);
        if (!z) return;
        // La ficha cambia con un fundido corto; su hueco es fijo para que la
        // portada no salte al cambiar de apartado.
        ficha.classList.remove('visible');
        void ficha.offsetWidth;
        ficha.innerHTML = `<span class="lp-ficha-zona">${z.zona}</span><b>${z.titulo}</b><span>${z.texto}</span>`;
        ficha.classList.add('visible');
    };
    caja.querySelectorAll('.lp-nodo').forEach(n => {
        n.addEventListener('pointerenter', () => { encima = true; encender(n.dataset.z); });
        n.addEventListener('focus', () => { encima = true; encender(n.dataset.z); });
        n.addEventListener('click', () => { encima = true; encender(n.dataset.z); });
    });
    caja.addEventListener('pointerleave', () => { encima = false; });
    caja.addEventListener('focusout', () => { encima = false; });
    if (reducido) { encender(CEREBRO_ZONAS[0].id); return; }
    // Recorre los apartados solo mientras se ve y nadie lo está tocando.
    const avanzar = () => { if (!encima && visible && !document.hidden) encender(CEREBRO_ZONAS[turno++ % CEREBRO_ZONAS.length].id); };
    setTimeout(() => { avanzar(); reloj = setInterval(avanzar, 3200); }, 1400);
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(e => {
            visible = e[0].isIntersecting;
            caja.classList.toggle('quieto', !visible);
        }, { root: document.getElementById('landing-screen'), threshold: 0.05 }).observe(caja);
    }
}
montarCerebro();

// Portadas por perfil para las campañas de vídeo: appbitacora.es/estudiantes, /profes, /finanzas y /trabajo
// (cada carpeta redirige a /?perfil=...) cambian el titular de la portada y suben su bloque al principio.
// El resto de la portada es la misma. Cada una se mide en el pulso por su ?ref=.
const PORTADAS = {
    estudiantes: { titulo: 'Tus estudios, <span class="login-brand-accent">sin perder el hilo.</span>', sub: 'Asignaturas, horario, exámenes y entregas en un sitio, conectados con tu calendario y tu día. Para el instituto, la carrera, la FP o las oposiciones, con pomodoro, tarjetas de repaso y tests para jugar con tus amigos.', bloque: 2 },
    profes: { titulo: 'Tus clases, <span class="login-brand-accent">siempre al día.</span>', sub: 'El cuadrante de cada grupo, los días no lectivos que corren las sesiones solas, el cuaderno de notas y los deberes, junto a tu calendario y tu vida. Pásale tu programación a una IA y Bitácora la reparte por días.', bloque: 0 },
    finanzas: { titulo: 'Tu dinero, <span class="login-brand-accent">a la vista.</span>', sub: 'Importa el extracto del banco y Bitácora lo ordena por categorías, lo cuadra con tu saldo real y te dice a qué ritmo gastas este mes. Con presupuestos, metas de ahorro, suscripciones vigiladas y los gastos de cada viaje aparte.', bloque: 1 },
    trabajo: { titulo: 'Tu trabajo y tu vida, <span class="login-brand-accent">cada uno en su sitio.</span>', sub: 'Tu horario, turnos, reuniones y plazos en una agenda propia que entra o no en tu calendario, tu vida laboral ordenada y tu CV en PDF paso a paso.', bloque: 3 },
};
function aplicarPortadaPerfil() {
    const perfil = new URLSearchParams(location.search).get('perfil');
    const p = PORTADAS[perfil];
    if (!p) return;
    const hero = document.querySelector('#landing-screen .lp-hero-texto');
    if (!hero) return;
    hero.querySelector('.landing-title').innerHTML = p.titulo;
    hero.querySelector('.landing-sub').textContent = p.sub;
    const bloques = document.querySelectorAll('#lp-funciones .lp-bloque');
    const elegido = bloques[p.bloque];
    if (elegido && p.bloque > 0) {
        bloques[0].before(elegido);
        // Mantiene la alternancia izquierda/derecha de los bloques después de mover uno.
        document.querySelectorAll('#lp-funciones .lp-bloque').forEach((b, i) => b.classList.toggle('lp-bloque-inverso', i % 2 === 1));
    }
}
aplicarPortadaPerfil();

// ------------------------------------------------------------
//  ACTUALIZACIONES (landing): lo nuevo de Bitácora, apartado a
//  apartado, con su rama y para quién es. Al añadir un apartado o algo
//  grande, se apunta aquí arriba del todo.
// ------------------------------------------------------------
const NOVEDADES = [
    { fecha: '2026-10-26', rama: 'todos', nombre: 'panorama más claro y calendario más útil', para: 'todo el mundo.', texto: 'Panorama reúne tu día en «hoy.» y deja las demás tarjetas a tu gusto. Calendario estrena una franja compacta con lo siguiente, las tareas pendientes y accesos para ver el día o apuntar.' },
    { fecha: '2026-10-26', rama: 'todos', nombre: 'tu panorama, a tu manera', para: 'todo el mundo.', texto: 'En Panorama, «editar.»: elige qué tarjetas ves y en qué orden. Hay nuevas para el dinero del mes, las rutinas de hoy, tu próximo viaje y la despensa.' },
    { fecha: '2026-10-25', rama: 'home', nombre: 'planifica lo que comes', para: 'quien hace la compra de la semana.', texto: 'En Despensa, «planificación.»: los platos de cada día (de tus recetas o a mano) y, abajo, todo lo que necesitas comprar esa semana, sin repetir, para pasarlo a la lista con un toque.' },
    { fecha: '2026-10-24', rama: 'todos', nombre: 'una guía para tu ia', para: 'quien quiere sacarle todo el partido.', texto: 'En Ajustes y en la guía: descarga un archivo con todo Bitácora y pásaselo a ChatGPT, Claude o Gemini. Te enseña a hacer cualquier cosa paso a paso y te ayuda si algo no te funciona.' },
    { fecha: '2026-10-24', rama: 'todos', nombre: 'una gráfica de dinero nueva', para: 'quien lleva sus finanzas.', texto: 'Tu patrimonio día a día, con cuánto ha cambiado en el periodo y dónde empezaste. Pasa el dedo para ver cualquier día. Y el historial de tus presupuestos, mes a mes.' },
    { fecha: '2026-10-24', rama: 'todos', nombre: 'enlaces, viajes, panorama y asignaturas, renovados', para: 'todos.', texto: 'Enlaces con buscador y favoritos; Viajes con tu próximo viaje arriba y pestañas; Panorama con tarjetas que enseñan lo que hay dentro; y la ficha de cada asignatura con próximas entregas y tu progreso.' },
    { fecha: '2026-10-23', rama: 'todos', nombre: 'invita a un amigo', para: 'quien quiere compartir bitácora.', texto: 'En Ajustes → cuenta tienes tu código y tu enlace: tu amigo tiene 30 días de prueba en vez de 14 y, cuando entra, los dos desbloqueáis el tema «oliva.».' },
    { fecha: '2026-10-23', rama: 'todos', nombre: 'todas tus tareas en el inicio del móvil', para: 'quien se organiza desde el móvil.', texto: 'El inicio enseña también las tareas sin día, con su «→ hoy». Lo que marcas como hecho se queda a la vista media hora, por si fue sin querer, y luego se va; «ver las hechas.» lo trae de vuelta.' },
    { fecha: '2026-10-23', rama: 'todos', nombre: 'tu mes, en una tarjeta', para: 'quien quiere enseñar su mes.', texto: 'En Panorama → «tu mes.», una imagen vertical con tus planes, viajes, lecturas, tareas y rutinas del mes, lista para stories. Quitas lo que no quieras enseñar antes de guardarla.' },
    { fecha: '2026-10-23', rama: 'todos', nombre: 'ajustes, con buscador', para: 'todos.', texto: 'Ajustes tiene un buscador y un índice arriba, y los grupos están más ordenados. Desde Ayuda puedes poner (o quitar) la semana de ejemplo.' },
    { fecha: '2026-10-23', rama: 'todos', nombre: 'una semana de ejemplo para empezar', para: 'quien acaba de llegar.', texto: 'Al crear la cuenta puedes verla con una semana inventada (una cena, un viaje, unos gastos, un examen) para ver desde el primer minuto cómo se conecta todo. «empezar con lo mío.» borra solo el ejemplo.' },
    { fecha: '2026-10-23', rama: 'todos', nombre: 'menos bandeja', para: 'quien usa bitácora con Claude o ChatGPT.', texto: 'Las tareas, los exámenes y trabajos, las notas, los viajes, las suscripciones y casi todo lo que le pidas a la IA se aplica solo, con deshacer en la bandeja. Solo esperan tu visto bueno el dinero y los borrados.' },
    { fecha: '2026-10-23', rama: 'todos', nombre: 'en qué se va, más claro', para: 'quien lleva sus cuentas desde el móvil.', texto: 'El reparto del gasto del mes va en una tira y una lista sobrias, con porcentajes, y puedes dejar fuera los gastos de viaje para ver tu mes normal.' },
    { fecha: '2026-10-22', rama: 'school', nombre: 'test con amigos', para: 'estudiantes y opositores.', texto: 'En Estudios → repaso → test, crea un test tipo test con tu temario (pídeselo a una IA o por el conector), practícalo a solas o compártelo con tus amigos: cada uno lo juega una vez, contra el reloj y con el teclado, y gana quien más puntos saca.' },
    { fecha: '2026-10-22', rama: 'school', nombre: 'estudios, en una sola página', para: 'quien estudia.', texto: 'Asignaturas, repaso (antes Estudiar) y carrera (antes Universidad) pasan a ser pestañas del mismo apartado.' },
    { fecha: '2026-10-22', rama: 'todos', nombre: 'el conector llega a más sitios', para: 'quien usa bitácora con Claude o ChatGPT.', texto: 'Ahora también puede organizar tus proyectos (crear, mover, quitar, fases), los hitos y el progreso de tus objetivos, tu horario y citas del trabajo y, si das clase, el cuadrante de profesorado. Todo se puede deshacer desde la bandeja.' },
    { fecha: '2026-10-19', rama: 'todos', nombre: 'bitácora sin conexión', para: 'quien la usa en el metro, en el avión o en la puerta de un concierto.', texto: 'Se abre aunque no haya red, con la copia guardada en el dispositivo. Lo que apuntes sin conexión se sube solo cuando vuelva.' },
    { fecha: '2026-10-18', rama: 'todos', nombre: 'quedadas, invitaciones y listas con un enlace', para: 'quien organiza planes con gente que no usa bitácora.', texto: 'Propón fechas y que cada uno marque cuándo puede, invita a un evento y mira quién viene, comparte una lista que todos tachan o enseña el plan de un viaje. Lo abren desde WhatsApp sin cuenta ni app.' },
    { fecha: '2026-10-18', rama: 'todos', nombre: 'siri y tu correo apuntan por ti', para: 'quien apunta sobre la marcha.', texto: '«Oye Siri, apunta en Bitácora» y dicta lo que sea. Y una dirección propia: reenvía la reserva de un vuelo, un hotel, unas entradas o un pedido y se apunta sola.' },
    { fecha: '2026-10-18', rama: 'todos', nombre: 'lo que bitácora sabe sola', para: 'todo el mundo.', texto: 'Festivos de tu ciudad y qué día cogerte para hacer puente, la hora más barata de la luz, los partidos de tus equipos, los estrenos de tus series, la ficha del destino de cada viaje y tu día de un vistazo.' },
    { fecha: '2026-10-18', rama: 'todos', nombre: 'bitácora te echa una mano', para: 'todo el mundo.', texto: 'El domingo, tu semana en un aviso. El buscador responde preguntas («¿cuánto gasté en gasolina en septiembre?»), Finanzas te dice si te puedes permitir algo, avisa suave al acercarte a un presupuesto y detecta suscripciones en el banco, y una semana antes de cada cumpleaños tienes la tarea de pensar el regalo.' },
    { fecha: '2026-10-18', rama: 'todos', nombre: 'traspasos solos entre tus cuentas', para: 'quien reparte el sueldo entre varias cuentas.', texto: 'Al importar, la transferencia que sale de una cuenta y entra en otra tuya queda como traspaso, sin contar como ingreso ni gasto. Y lo apuntado a mano ya no se duplica con el cargo del banco.' },
    { fecha: '2026-10-18', rama: 'todos', nombre: 'finanzas más completas en el móvil', para: 'quien lleva sus cuentas desde el móvil.', texto: 'El ritmo del mes frente al anterior, en qué se va el dinero y los próximos cargos. La semana del inicio pasa como un carrusel, las pestañas cambian con animación y los iconos de categorías son nuevos.' },
    { fecha: '2026-10-18', rama: 'todos', nombre: 'semanas con el dedo y apuntar ocio', para: 'quien usa bitácora en el móvil.', texto: 'En el inicio del móvil, desliza la semana para ir a la siguiente o a la anterior (en la vista de mes, cambia de mes). Apuntar entiende «serie …», «peli …», «libro …» y «evento …», el horario de Estudios se ve por días y la app se pone al día sola al volver a ella.' },
    { fecha: '2026-10-18', rama: 'todos', nombre: 'importar el excel del banco', para: 'quien lleva sus cuentas en finanzas.', texto: 'El extracto de Ibercaja, Santander y otros bancos se importa tal cual lo descargas en Excel, también desde el móvil, aunque traiga arriba los datos de la cuenta.' },
    { fecha: '2026-10-17', rama: 'todos', nombre: 'apuntar, más listo', para: 'quien apunta al vuelo.', texto: 'Varias cosas en una frase, y cada una a su sitio: exámenes y entregas en su asignatura, cumpleaños, lo que se repite, clases, viajes, gastos con su categoría y lo que falta en casa.' },
    { fecha: '2026-10-17', rama: 'home', nombre: 'recetas', para: 'quien cocina y hace la compra.', texto: 'Tus recetas con sus ingredientes y lo que te cuestan según tus tickets; con un toque, lo que falte pasa a la lista de la compra.' },
    { fecha: '2026-10-17', rama: 'todos', nombre: 'tema pizarra', para: 'quien quiere un tono frío y sereno.', texto: 'Un cuarto tema: gris azulado de pizarra con tinta azul marino. Se elige en Ajustes o en el menú del móvil.' },
    { fecha: '2026-10-17', rama: 'home', nombre: 'despensa', para: 'quien quiere saber lo que gasta en el súper.', texto: 'Pásale el ticket a Claude o ChatGPT y Bitácora guarda cada precio y su tienda, separa lo que estaba en la lista de lo que añadiste allí y aprende dónde te sale más barato.' },
    { fecha: '2026-10-16', rama: 'todos', nombre: 'tu calendario en otras apps', para: 'quien usa Google o el Calendario del iPhone.', texto: 'Suscríbete a Bitácora desde tu calendario de siempre: eventos, cumpleaños y viajes, al día solos.' },
    { fecha: '2026-10-16', rama: 'work', nombre: 'proyectos', para: 'quien tiene algo entre manos.', texto: 'Cada proyecto con su siguiente paso a la vista, la colina para saber dónde está, tareas por fases que van al planificador y un diario.' },
    { fecha: '2026-10-16', rama: 'todos', nombre: 'nueva versión móvil', para: 'todos.', texto: 'Barra de pestañas, tu semana y tu día como un horario, y el tamaño de letra a tu gusto.' },
    { fecha: '2026-10-16', rama: 'todos', nombre: 'calendarios', para: 'todos.', texto: 'Trae tu calendario de Google, Apple u Outlook, o el de tu equipo o tu universidad, con un archivo o un enlace.' },
    { fecha: '2026-10-15', rama: 'school', nombre: 'estudiar', para: 'estudiantes y opositores.', texto: 'Pomodoro, el día dividido en temas, el temario por asignaturas y tarjetas de repaso espaciado al estilo Anki.' },
    { fecha: '2026-10-15', rama: 'home', nombre: 'compra', para: 'quien hace la compra.', texto: 'Listas que se ordenan solas por secciones del súper, con lo de siempre a un toque y el gasto directo a Finanzas.' },
    { fecha: '2026-10-15', rama: 'todos', nombre: 'rutinas', para: 'todos.', texto: 'Los hábitos pasan a ser rutinas: por momentos del día, con pasos y a tu ritmo.' },
    { fecha: '2026-10-15', rama: 'todos', nombre: 'portadas en ocio', para: 'quien lee, ve series o juega.', texto: 'Libros, películas, series y juegos con su portada, encontrada sola.' },
    { fecha: '2026-10-09', rama: 'school', nombre: 'profesorado', para: 'docentes.', texto: 'El cuadrante del curso con todas tus clases, cuaderno de notas, deberes y lo que no das en su día, a pendientes.' },
    { fecha: '2026-10-09', rama: 'work', nombre: 'agenda laboral', para: 'quien trabaja con horario o citas.', texto: 'Tu horario y tus citas de trabajo, aparte y, si quieres, dentro de tu calendario.' },
    { fecha: '2026-10-07', rama: 'school', nombre: 'universidad', para: 'universitarios.', texto: 'Tu carrera por cuatrimestres: créditos, media, fechas de exámenes y la nota que necesitas para aprobar.' },
    { fecha: '2026-10-07', rama: 'work', nombre: 'crear mi cv', para: 'quien busca trabajo.', texto: 'Un asistente por pasos que convierte tu historial de Empleo en un CV en PDF, limpio y de una página.' },
    { fecha: '2026-10-07', rama: 'todos', nombre: 'social', para: 'quien comparte planes.', texto: 'Gastos compartidos al estilo Tricount, eventos con amigos y vuestras recomendaciones.' },
    { fecha: '2026-10-07', rama: 'home', nombre: 'envíos', para: 'quien compra por internet.', texto: 'Tus pedidos y por dónde van, actualizados solos.' },
    { fecha: '2026-10-06', rama: 'mind', nombre: 'conexiones', para: 'quien quiere un segundo cerebro.', texto: 'Cómo se relacionan tus viajes, personas, lugares, etiquetas y notas.' },
    { fecha: '2026-10-06', rama: 'todos', nombre: 'método', para: 'quien persigue un objetivo.', texto: 'Objetivos con el método Harada, un paso kaizen y revisión semanal.' },
    { fecha: '2026-10-06', rama: 'todos', nombre: 'documentos', para: 'todos.', texto: 'Garantías, contratos, seguros y el DNI con su caducidad: Bitácora te avisa a tiempo.' },
    { fecha: '2026-10-06', rama: 'todos', nombre: 'bitácora en el móvil', para: 'todos.', texto: 'Una app propia en la pantalla de inicio, rápida y pensada para el dedo.' },
    { fecha: '2026-10-05', rama: 'todos', nombre: 'avisos', para: 'todos.', texto: 'El resumen de la mañana y un aviso antes de cada evento, en el móvil.' },
    { fecha: '2026-10-03', rama: 'todos', nombre: 'claude y chatgpt', para: 'quien usa IA.', texto: 'Conecta tu Bitácora y pídele cosas hablando: apuntar, consultar, planificar.' },
    { fecha: '2026-10-01', rama: 'todos', nombre: 'entradas con qr', para: 'quien va a conciertos, cine o partidos.', texto: 'Guarda la entrada de un evento y enséñala sin conexión.' },
    { fecha: '2026-09-30', rama: 'todos', nombre: 'patrones', para: 'todos.', texto: 'Panorama encuentra relaciones entre tus apartados: cómo duermes, gastas o rindes según el día.' },
    { fecha: '2026-09-21', rama: 'todos', nombre: 'finanzas', para: 'todos.', texto: 'Importa el extracto del banco, cuadra con tu saldo real y sabe a qué ritmo gastas.' },
    { fecha: '2026-09-17', rama: 'todos', nombre: 'viajes', para: 'quien viaja.', texto: 'Cada viaje con reservas, lugares, itinerario, mapa, documentos y lo que gastaste.' },
    { fecha: '2026-07-28', rama: 'todos', nombre: 'bitácora', para: 'todos.', texto: 'El comienzo: calendario, planificador, eventos, ocio y notas, en un solo sitio.' },
];

function openNovedades() {
    const mes = f => new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    let ultimoMes = '';
    const filas = NOVEDADES.map(n => {
        const m = mes(n.fecha);
        const cab = m !== ultimoMes ? `<div class="novedades-mes">${m}.</div>` : '';
        ultimoMes = m;
        return `${cab}<article class="novedad">
            <div class="novedad-cab"><span class="novedad-nuevo">nuevo en bitácora.</span><span class="novedad-rama">bitácora<b>#${n.rama}</b></span></div>
            <h3>${n.nombre.toUpperCase()}.</h3>
            <p>${n.texto}</p>
            <div class="novedad-para">para ${n.para}</div>
        </article>`;
    }).join('');
    showModal(`<div class="modal-title">actualizaciones.<button class="modal-close" aria-label="cerrar" onclick="closeModal()"><i class='ico ico-x' aria-hidden=true></i></button></div>
        <p class="finance-modal-note" style="margin-top:0">Todo lo que ha ido llegando a Bitácora, lo último primero.</p>
        <div class="novedades">${filas}</div>`);
}
