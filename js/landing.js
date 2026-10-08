// ============================================================
//  LANDING — movimiento: los bloques aparecen al llegar a ellos, el móvil
//  de la portada se desplaza un poco más lento que la página (paralaje),
//  la barra superior toma fondo al bajar y en las preguntas solo queda
//  abierta una. #landing-screen es el contenedor con scroll, no la ventana.
//  Con "reducir movimiento" activado en el sistema, todo aparece quieto.
// ============================================================
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
