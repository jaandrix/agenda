"""Mide la versión móvil contra los presupuestos del plan de la PWA, con la CPU 4 veces más lenta.

    py pruebas/medir_movil.py           aperturas ya calentadas (6 repeticiones)
    py pruebas/medir_movil.py --frio    primera vez de cada cosa, justo después de arrancar

Sirve la carpeta espejo con el index.html actual (ver banco.py) y compara cada mediana con su presupuesto.
"""
import sys
from banco import Banco, informe, mediana

MOV = "openFinanceProTransactionModal()"
FICHA = "openEntryDetail(entries.find(e => e.type === 'event').id)"
TAREA = "(dayPlanner.days[isoLocal(new Date())] ||= []).push({ id: 'medir_tarea', title: 'medir.', time: '', done: false }); mobileZonas = {}; renderMobileShell()"
SEL = """'#mobile-shell .m-check[onclick*="medir_tarea"]'"""
FRIO = '--frio' in sys.argv

with Banco() as b:
    if FRIO:
        filas = []
        for nombre, acc, lim in (('apuntar', 'openApuntar()', 150), ('ficha de evento', FICHA, 150), ('editor de movimiento', MOV, 150)):
            v = []
            for _ in range(3):
                ctx, pg = b.pagina(True, espera=800)
                v.append(pg.evaluate(f"__b.abrir(() => {acc})")['primero'])
                ctx.close()
            filas.append((f'{nombre}, primera vez', mediana(v), lim))
        v = []
        for _ in range(3):
            ctx, pg = b.pagina(True, espera=800)
            v.append(pg.evaluate("__b.accion(() => mobileIr('finances'))"))
            ctx.close()
        filas.append(('entrar en finanzas, primera vez', mediana(v), 180))
        fallos = informe('MÓVIL EN FRÍO, CPU 4x (ms):', filas)
        if b.errores: print('  errores de la página:', b.errores)
        sys.exit(1 if fallos or b.errores else 0)

    ctx, pg = b.pagina(True)
    pg.evaluate(TAREA)
    pg.evaluate("__b.abrir(() => openApuntar())"); pg.evaluate("__b.cerrar()")
    d = {k: [] for k in ('ap1', 'ap2', 'cierre', 'mov', 'ficha', 'menu', 'marcar', 'fin')}
    saltos = 0
    for _ in range(6):
        r = pg.evaluate("__b.abrir(() => openApuntar())"); d['ap1'].append(r['primero']); d['ap2'].append(r['estable']); saltos += r['salto']
        c = pg.evaluate("__b.cerrar()"); d['cierre'].append(c['ms'])
        if c.get('atascado'): print('  modal atascado al cerrar:', c['atascado'])
        r = pg.evaluate(f"__b.abrir(() => {MOV})"); d['mov'].append(r['primero']); saltos += r['salto']; pg.evaluate("__b.cerrar()")
        r = pg.evaluate(f"__b.abrir(() => {FICHA})"); d['ficha'].append(r['primero']); saltos += r['salto']; pg.evaluate("__b.cerrar()")
        d['menu'].append(pg.evaluate("(async () => { const t = performance.now(); toggleMenuMovil(); await __b.fotograma(); const m = performance.now() - t; toggleMenuMovil(); await new Promise(r => setTimeout(r, 350)); return m; })()"))
        d['marcar'].append(pg.evaluate(f"(async () => {{ const t = performance.now(); document.querySelector({SEL}).click(); await __b.fotograma(); const m = performance.now() - t; await new Promise(r => setTimeout(r, 200)); document.querySelector({SEL}).click(); await new Promise(r => setTimeout(r, 300)); return m; }})()"))
    for _ in range(4):
        pg.evaluate("mobileIr('calendar')"); pg.wait_for_timeout(350)
        d['fin'].append(pg.evaluate("__b.accion(() => mobileIr('finances'))")); pg.wait_for_timeout(500)
    filas = [('apuntar, primer fotograma', mediana(d['ap1']), 100), ('apuntar, estable', mediana(d['ap2']), 300), ('cerrar capa', mediana(d['cierre']), 300),
             ('editor de movimiento, primer fotograma', mediana(d['mov']), 120), ('ficha de evento, primer fotograma', mediana(d['ficha']), 120),
             ('menú, primer fotograma', mediana(d['menu']), 100), ('marcar tarea', mediana(d['marcar']), 100), ('entrar en finanzas', mediana(d['fin']), 180)]
    fallos = informe('MÓVIL, CPU 4x (ms):', filas)
    print(f'  cambios de alto tras entrar: {saltos}')
    if b.errores: print('  errores de la página:', b.errores)
    sys.exit(1 if fallos or saltos or b.errores else 0)
