"""Mide el escritorio con la CPU 4 veces más lenta: primera vez (en frío) y mediana de las siguientes.

    py pruebas/medir_escritorio.py
"""
import sys
from banco import Banco, informe, mediana

MOV = "openFinanceProTransactionModal()"
FICHA = "openEntryDetail(entries.find(e => e.type === 'event').id)"
REPETICIONES = 5

with Banco() as b:
    ctx, pg = b.pagina(False, espera=1500)
    pg.evaluate("switchView('calendar')"); pg.wait_for_timeout(600)
    filas = []
    for nombre, acc, lim in (('apuntar', 'openApuntar()', 120), ('ficha de evento', FICHA, 120), ('editor de movimiento', MOV, 120)):
        tiempos, cierres = [], []
        for _ in range(REPETICIONES + 1):
            tiempos.append(pg.evaluate(f"__b.abrir(() => {acc})")['primero'])
            cierres.append(pg.evaluate("__b.cerrar()")['ms'])
            pg.wait_for_timeout(150)
        filas += [(f'{nombre}, primera vez', tiempos[0], None), (f'{nombre}, siguientes', mediana(tiempos[1:]), lim), (f'{nombre}, cerrar', mediana(cierres[1:]), 280)]
    tiempos = {'finances': [], 'home': [], 'planner': []}
    for _ in range(REPETICIONES + 1):
        for v in tiempos:
            tiempos[v].append(pg.evaluate(f"""(async () => {{ const t = performance.now(); const r = performSwitchView('{v}'); if (r && r.finished) await r.finished; await __b.fotograma(); return performance.now() - t; }})()"""))
            pg.wait_for_timeout(200)
    nombres = {'finances': 'ir a finanzas', 'home': 'ir a panorama', 'planner': 'ir a planificador'}
    for v, t in tiempos.items():
        filas += [(f'{nombres[v]}, primera vez', t[0], None), (f'{nombres[v]}, siguientes', mediana(t[1:]), 180 if v != 'planner' else None)]
    fallos = informe('ESCRITORIO, CPU 4x (ms):', filas)
    if b.errores: print('  errores de la página:', b.errores)
    sys.exit(1 if fallos or b.errores else 0)
