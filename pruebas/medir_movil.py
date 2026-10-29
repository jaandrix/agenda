"""Mide la versión móvil contra los presupuestos del plan de la PWA (29-10), con la CPU 4 veces más lenta.

    py pruebas/medir_movil.py [carpeta del espejo]

Sirve la carpeta espejo (por defecto C:/Users/jandr/Downloads/bitacora-mirror, con demo.html y datos de ejemplo),
abre la app en modo móvil y repite cada interacción varias veces. Da la mediana y si cumple el presupuesto.
Necesita Playwright para Python (py -m pip install playwright) y Chrome.
"""
import functools, http.server, json, statistics, sys, threading
from playwright.sync_api import sync_playwright

ESPEJO = sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\jandr\Downloads\bitacora-mirror'
REPETICIONES = 6
PRESUPUESTOS = {'apuntar, primer fotograma': 100, 'apuntar, estable': 250, 'cerrar capa': 280,
                'editor de movimiento, primer fotograma': 120, 'ficha de evento, primer fotograma': 120,
                'menú, primer fotograma': 100, 'marcar tarea': 100}


class Servidor(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def handle(self):
        try: super().handle()
        except Exception: pass


# Se mide en la página: el tiempo hasta el segundo fotograma tras la acción (lo que de verdad se ve), si la hoja cambia
# de alto después de entrar y cuánto tarda en quitarse la capa al cerrar.
MEDIDOR = """
window.__medir = {
    fotograma: () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))),
    async abrir(fn) {
        const t = performance.now(); fn(); await this.fotograma(); const primero = performance.now() - t;
        const hoja = document.querySelector('#modal-container .modal-sheet');
        await Promise.all((hoja?.getAnimations() || []).map(a => a.finished.catch(() => {})));
        const estable = performance.now() - t;
        const alto = () => Math.round(document.querySelector('#modal-container .modal-sheet')?.getBoundingClientRect().height || 0);
        const a1 = alto(); await new Promise(r => setTimeout(r, 300));
        return { primero, estable, salto: alto() !== a1 };
    },
    async cerrar() {
        const t = performance.now(); closeModal();
        while (document.querySelector('#modal-container .modal-overlay')) await new Promise(r => setTimeout(r, 4));
        return performance.now() - t;
    }
};
"""


def main():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Servidor, directory=ESPEJO))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    datos = {k: [] for k in PRESUPUESTOS}
    saltos, errores = 0, []
    with sync_playwright() as p:
        nav = p.chromium.launch(channel='chrome')
        pg = nav.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=3, has_touch=True)
        pg.on('pageerror', lambda e: errores.append(str(e)[:200]))
        pg.on('dialog', lambda d: d.dismiss())
        cdp = pg.context.new_cdp_session(pg)
        pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/demo.html?todos&movil')
        pg.wait_for_timeout(6500)
        pg.evaluate(MEDIDOR)
        # demo.html apaga las animaciones para las capturas: aquí se quieren las de verdad.
        pg.evaluate("document.querySelectorAll('style').forEach(s => { if (/animation-duration\\s*:\\s*0s/.test(s.textContent)) s.remove(); })")
        pg.evaluate("closeModal(); mobileIr('calendar')")
        pg.wait_for_timeout(500)
        cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
        mov = pg.evaluate("financePro.transactions[0]?.id")
        ev = pg.evaluate("entries.find(e => e.type === 'event')?.id")
        for _ in range(REPETICIONES):
            r = pg.evaluate("__medir.abrir(() => openApuntar())")
            datos['apuntar, primer fotograma'].append(r['primero']); datos['apuntar, estable'].append(r['estable']); saltos += r['salto']
            datos['cerrar capa'].append(pg.evaluate("__medir.cerrar()"))
            if mov:
                r = pg.evaluate(f"__medir.abrir(() => openFinanceProTransactionModal('{mov}'))")
                datos['editor de movimiento, primer fotograma'].append(r['primero']); saltos += r['salto']
                pg.evaluate("__medir.cerrar()")
            if ev:
                r = pg.evaluate(f"__medir.abrir(() => openEntryDetail('{ev}'))")
                datos['ficha de evento, primer fotograma'].append(r['primero']); saltos += r['salto']
                pg.evaluate("__medir.cerrar()")
            datos['menú, primer fotograma'].append(pg.evaluate("(async () => { const t = performance.now(); toggleMenuMovil(); await __medir.fotograma(); const d = performance.now() - t; toggleMenuMovil(); await new Promise(r => setTimeout(r, 350)); return d; })()"))
            datos['marcar tarea'].append(pg.evaluate("""(async () => {
                const b = document.querySelector('#mobile-shell .m-check'); if (!b) return 0;
                const t = performance.now(); b.click(); await __medir.fotograma(); const d = performance.now() - t;
                document.querySelector('#mobile-shell .m-check')?.click(); await __medir.fotograma(); return d; })()"""))
        cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
        nav.close()
    srv.shutdown()
    print('medianas con la CPU 4 veces más lenta (ms):')
    fallos = 0
    for k, lim in PRESUPUESTOS.items():
        v = [x for x in datos[k] if x]
        if not v: print(f'  {k:42} sin datos'); continue
        m = statistics.median(v)
        ok = m <= lim
        fallos += not ok
        print(f'  {k:42} {m:7.0f}   presupuesto {lim:4}  {"bien" if ok else "PASA DEL PRESUPUESTO"}')
    print(f'  cambios de alto tras entrar: {saltos}')
    if errores: print('  errores de la página:', json.dumps(errores, ensure_ascii=False))
    sys.exit(1 if fallos or saltos or errores else 0)


if __name__ == '__main__':
    main()
