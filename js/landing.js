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
    { id: 'rutinas', zona: 'ganglios basales.', x: 150, y: 150, nx: 520, ny: 372, titulo: 'rutinas.', texto: 'Lo que haces cada día, sin presión.', con: 'planificador' },
    { id: 'calendario', zona: 'hipocampo.', x: 120, y: 110, nx: 312, ny: 436, titulo: 'calendario.', texto: 'Todo lo que tiene fecha.', con: 'estudios' },
    { id: 'estudios', zona: 'lóbulo temporal.', x: 80, y: 120, nx: 92, ny: 380, titulo: 'estudios.', texto: 'Exámenes, entregas y notas.', con: 'calendario' },
    { id: 'social', zona: 'sistema límbico.', x: 104, y: 98, nx: 30, ny: 232, titulo: 'social.', texto: 'Gastos y planes con amigos.', con: 'finanzas' },
];
// El cerebro se dibuja en 240 × 200 y se coloca centrado en el lienzo,
// ampliado CEREBRO_ESCALA veces.
const CEREBRO_ESCALA = 1.35, CEREBRO_DX = 300 - 120 * 1.35, CEREBRO_DY = 228 - 100 * 1.35;
const CEREBRO_SILUETA = 'M60 140C30 140 18 112 28 92C14 74 26 46 52 44C58 22 90 14 108 26C124 10 158 12 166 30C190 26 214 46 208 72C226 88 220 118 198 124C202 142 186 158 164 154C160 168 140 174 127 166C123 172 121 180 121 188C117 193 108 193 104 189C104 178 102 168 96 159C84 157 70 152 60 140Z';
const CEREBRO_SURCOS = [
    'M118 28C112 50 126 70 116 96', 'M52 104C80 96 110 100 150 112', 'M132 150C150 140 176 138 196 126', 'M60 70C72 62 86 66 90 78', 'M140 46C150 58 168 56 176 66',
    'M150 84C164 80 180 90 190 102', 'M74 124C92 118 110 126 128 128', 'M140 156C152 152 164 152 174 146', 'M134 163C146 161 156 162 162 157',
    'M38 92C50 88 58 94 62 104', 'M88 46C94 56 106 58 112 52', 'M168 104C176 112 190 112 196 108',
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
