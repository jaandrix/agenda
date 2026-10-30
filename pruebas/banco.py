"""Lo común de los bancos de rendimiento: sirve el espejo con el index.html actual y una sesión de ejemplo, sin red real."""
import functools, http.server, io, os, re, statistics, threading
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ESPEJO = os.environ.get('BITACORA_ESPEJO', r'C:\Users\jandr\Downloads\bitacora-mirror')
PWA = "const mm=window.matchMedia.bind(window);window.matchMedia=q=>/display-mode/.test(q)?{matches:true,media:q,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}:mm(q);"
AYUDA = """window.__b = {
    fotograma: () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))),
    async accion(fn) { const t = performance.now(); fn(); await this.fotograma(); return performance.now() - t; },
    async abrir(fn) {
        const t = performance.now(); fn(); await this.fotograma(); const primero = performance.now() - t;
        const hoja = document.querySelector('#modal-container .modal-sheet');
        await Promise.race([Promise.all((hoja?.getAnimations() || []).map(a => a.finished.catch(() => {}))), new Promise(r => setTimeout(r, 1000))]);
        const estable = performance.now() - t;
        const alto = () => Math.round(document.querySelector('#modal-container .modal-sheet')?.getBoundingClientRect().height || 0);
        const a1 = alto(); await new Promise(r => setTimeout(r, 250));
        return { primero, estable, salto: alto() !== a1 };
    },
    // Con límite: si el modal no llega a quitarse, el banco lo cuenta en vez de quedarse colgado.
    async cerrar() {
        const t = performance.now(); closeModal();
        while (document.querySelector('#modal-container .modal-overlay')) {
            if (performance.now() - t > 2000) return { ms: 2000, atascado: document.querySelector('#modal-container .modal-overlay').className };
            await new Promise(r => setTimeout(r, 4));
        }
        return { ms: performance.now() - t };
    }
};"""


class _Servidor(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def handle(self):
        try: super().handle()
        except Exception: pass


def mediana(v):
    v = [x for x in v if x]
    return statistics.median(v) if v else None


class Banco:
    def __enter__(self):
        html = io.open(os.path.join(RAIZ, 'index.html'), encoding='utf-8').read()
        html = re.sub(r'<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js[^>]*></script>', '<script src="demo-datos.js?v=5"></script><script src="stub-sesion.js?v=5"></script>', html)
        io.open(os.path.join(ESPEJO, 'real.html'), 'w', encoding='utf-8').write(html)
        # Con la cola por defecto (5) rechazaba conexiones y dejaba scripts sin cargar, como si fallara la app.
        class Hilos(http.server.ThreadingHTTPServer): request_queue_size = 128
        self.srv = Hilos(('127.0.0.1', 0), functools.partial(_Servidor, directory=ESPEJO))
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.pw = sync_playwright().start()
        self.nav = self.pw.chromium.launch(channel='chrome')
        self.errores = []
        return self

    def __exit__(self, *a):
        self.nav.close(); self.pw.stop(); self.srv.shutdown()

    def pagina(self, movil, cpu=4, espera=3500):
        ctx = self.nav.new_context(viewport={'width': 390, 'height': 844} if movil else {'width': 1300, 'height': 800}, device_scale_factor=3 if movil else 1, has_touch=movil, service_workers='block')
        if movil: ctx.add_init_script(PWA)
        ctx.route('**/*', lambda r: r.abort() if any(h in r.request.url for h in ('goatcounter', 'open-meteo', 'jspdf', 'pdf.min')) else r.continue_())
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: self.errores.append(str(e)[:200]))
        pg.on('dialog', lambda d: d.dismiss())
        pg.goto(f'http://127.0.0.1:{self.srv.server_address[1]}/real.html?todos', wait_until='commit')
        pg.wait_for_function('typeof render === "function" && (!!document.querySelector("#mobile-shell .m-pagina")?.children.length || document.getElementById("app").classList.contains("ready"))', timeout=25000)
        pg.wait_for_timeout(espera)
        pg.evaluate(AYUDA)
        pg.evaluate("closeModal()")
        pg.wait_for_timeout(350)
        ctx.new_cdp_session(pg).send('Emulation.setCPUThrottlingRate', {'rate': cpu})
        return ctx, pg


def informe(titulo, filas):
    print(titulo)
    fallos = 0
    for nombre, valor, limite in filas:
        if valor is None: print(f'  {nombre:44} sin datos'); continue
        ok = limite is None or valor <= limite
        fallos += not ok
        print(f'  {nombre:44} {valor:6.0f}' + ('' if limite is None else f'   presupuesto {limite:4}  {"bien" if ok else "PASA"}'))
    return fallos
