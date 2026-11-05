"""Mide el arranque de la versión móvil instalada, con la CPU frenada desde el primer momento.

    py pruebas/medir_arranque.py            CPU 4 veces más lenta (un móvil medio)
    py pruebas/medir_arranque.py --cpu 1    sin frenar (un iPhone reciente se parece más a esto)

Cuatro casos, tres veces cada uno (mediana): primera vez (sin copia en el dispositivo), reapertura con la copia
local, reapertura con la copia y una red lenta (la sesión tarda 2,5 s en renovarse, como en el iPhone tras horas
sin abrir) y reapertura sin red. Dos cifras por caso: cuándo se ve la app pintada debajo del logo y cuándo se puede
tocar (el logo empieza a irse). Usa el index.html actual y el espejo, como el resto de bancos (ver banco.py).
"""
import sys
from banco import Banco, PWA, mediana

UID = '32c660f0-97b7-4cd9-8ed0-00ca44a055dc'
MIRAR = """window.__arr = {};
(function mirar() {
    const p = document.querySelector('#mobile-shell .m-pagina');
    if (!__arr.app && p && p.children.length) __arr.app = performance.now();
    const b = document.getElementById('boot-loading');
    if (__arr.app && !__arr.libre && b && (b.classList.contains('boot-saliendo') || getComputedStyle(b).display === 'none')) __arr.libre = performance.now();
    if (!__arr.libre) requestAnimationFrame(mirar);
})();"""
SESION = "try { localStorage.setItem('sb-prueba-auth-token', JSON.stringify({ user: { id: '%s', email: 'prueba@local', created_at: '2025-01-01T00:00:00Z' } })); } catch (e) {}" % UID
LENTA = """(function () {
    let s;
    const tarda = f => (...a) => new Promise(r => setTimeout(() => r(f(...a)), 2500));
    Object.defineProperty(window, 'supabase', { configurable: true, get: () => s, set(v) {
        const crear = v.createClient;
        v.createClient = function () { const c = crear.apply(this, arguments); c.auth.getSession = tarda(c.auth.getSession.bind(c.auth)); c.auth.getUser = tarda(c.auth.getUser.bind(c.auth)); return c; };
        s = v;
    } });
})();"""
CPU = int(sys.argv[sys.argv.index('--cpu') + 1]) if '--cpu' in sys.argv else 4
SIN_RED = "Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false });"


def abrir(b, ctx):
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: b.errores.append(str(e)[:200]))
    pg.on('dialog', lambda d: d.dismiss())
    ctx.new_cdp_session(pg).send('Emulation.setCPUThrottlingRate', {'rate': CPU})
    pg.goto(f'http://127.0.0.1:{b.srv.server_address[1]}/real.html?todos', wait_until='commit')
    pg.wait_for_function('window.__arr && __arr.libre', timeout=30000, polling=100)
    r = pg.evaluate('__arr')
    return pg, r


def contexto(b, extra=''):
    ctx = b.nav.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=3, has_touch=True, service_workers='block')
    ctx.add_init_script(PWA + SESION + MIRAR)
    ctx.route('**/*', lambda r: r.abort() if any(h in r.request.url for h in ('goatcounter', 'open-meteo', 'jspdf', 'pdf.min')) else r.continue_())
    return ctx


with Banco() as b:
    casos = {'primera vez, sin copia': [], 'reapertura con copia': [], 'con copia y red lenta': [], 'sin red, con copia': []}
    capturas = '--capturas' in sys.argv
    for i in range(3):
        ctx = contexto(b)
        pg, r = abrir(b, ctx); casos['primera vez, sin copia'].append(r)
        pg.wait_for_timeout(4000); pg.close()
        pg, r = abrir(b, ctx); casos['reapertura con copia'].append(r)
        if capturas and i == 0:
            pg.wait_for_timeout(1500); pg.screenshot(path=sys.argv[sys.argv.index('--capturas') + 1])
        pg.close()
        for nombre, script in (('con copia y red lenta', LENTA), ('sin red, con copia', SIN_RED)):
            ctx.add_init_script(script)
            pg, r = abrir(b, ctx); casos[nombre].append(r); pg.close()
            # Cada init script se queda en el contexto: el de red lenta no debe sumarse al de sin red.
            if nombre == 'con copia y red lenta':
                ctx.close(); ctx = contexto(b); pg, _ = abrir(b, ctx); pg.wait_for_timeout(4000); pg.close()
        ctx.close()
    print(f'ARRANQUE DEL MÓVIL, CPU {CPU}x (ms desde que se abre):')
    print(f'  {"":30} {"app pintada":>12} {"se puede tocar":>15}')
    for nombre, v in casos.items():
        print(f'  {nombre:30} {mediana([x.get("app") for x in v]):12.0f} {mediana([x.get("libre") for x in v]):15.0f}')
    if b.errores: print('  errores de la página:', b.errores)
