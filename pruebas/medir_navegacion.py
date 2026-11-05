"""Mide la navegación de la versión móvil con la CPU 4 veces más lenta (fase 2 del plan de sensación nativa).

    py pruebas/medir_navegacion.py

Primer fotograma al cambiar de pestaña, al entrar en un apartado desde el menú y al volver con el botón atrás del
sistema (history.back), si volver deja el scroll donde estaba y si la barra de abajo se rehace al navegar (debe
seguir siendo el mismo nodo). Usa el index.html actual y el espejo, como el resto de bancos (ver banco.py).
"""
import sys
from banco import Banco, informe, mediana

ATRAS = """(async () => {
    if (!history.state?.bitacoraVista) return null;
    const t = performance.now(); history.back();
    await new Promise(r => addEventListener('popstate', r, { once: true }));
    await __b.fotograma(); return performance.now() - t;
})()"""

with Banco() as b:
    ctx, pg = b.pagina(True)
    d = {k: [] for k in ('pestana', 'menu', 'atras')}
    rehecha = 0
    pg.evaluate("mobileReciente = 'notes'; renderMobileShell()")  # la cuarta pestaña cambia (con razón) al visitar un apartado nuevo
    scroll_ok = 0
    for _ in range(6):
        pg.evaluate("mobileIr('calendar', 'm-pestana')"); pg.wait_for_timeout(350)
        pg.evaluate("window.__tab = document.querySelector('#mobile-shell .m-tabbar')")
        d['pestana'].append(pg.evaluate("__b.accion(() => mobileIr('planner', 'm-pestana'))")); pg.wait_for_timeout(350)
        pg.evaluate("document.getElementById('mobile-shell').scrollTop = 300"); pg.wait_for_timeout(100)
        antes = pg.evaluate("document.getElementById('mobile-shell').scrollTop")
        pg.evaluate("toggleMenuMovil()"); pg.wait_for_timeout(350)
        d['menu'].append(pg.evaluate("__b.accion(() => mobileIr('notes'))")); pg.wait_for_timeout(350)
        rehecha += pg.evaluate("window.__tab !== document.querySelector('#mobile-shell .m-tabbar')")
        r = pg.evaluate(ATRAS); d['atras'].append(r); pg.wait_for_timeout(350)
        if r is None: print('  atrás no tiene a dónde volver dentro de la app (saldría de ella)'); break
        vista, despues = pg.evaluate("[currentView, document.getElementById('mobile-shell').scrollTop]")
        scroll_ok += vista == 'planner' and abs(despues - antes) < 2
    fallos = informe('NAVEGACIÓN DEL MÓVIL, CPU 4x (ms):', [
        ('cambiar de pestaña, primer fotograma', mediana(d['pestana']), 100),
        ('entrar desde el menú, primer fotograma', mediana(d['menu']), 100),
        ('volver (atrás del sistema), primer fotograma', mediana(d['atras']), 100),
    ])
    print(f'  volver deja la vista y el scroll de antes: {scroll_ok} de 6')
    print(f'  la barra de abajo se rehizo al navegar: {rehecha} de 6')
    if b.errores: print('  errores de la página:', b.errores)
    ctx.close()
    sys.exit(1 if fallos or b.errores else 0)
