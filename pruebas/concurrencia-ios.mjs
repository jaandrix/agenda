// Concurrencia PWA/iPhone sobre `dayPlanner` (P0 que viene de la 0.17): la web guarda con el doSaveData real, contra un
// servidor falso que se porta como guardar_bitacora (solo escribe si la huella de cada bloque sigue igual), y el
// iPhone escribe justo entre la lectura y la escritura de la web, como hace la app nativa con merge_bitacora_si.
// Lo que se comprueba: ninguno de los dos pierde lo suyo.
//     node --test pruebas/concurrencia-ios.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const raiz = new URL('..', import.meta.url);
const stub = () => new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => '' : stub(), apply: () => stub(), construct: () => stub(), set: () => true });

// El servidor: la fila y una huella por bloque (aquí el JSON del bloque; en Supabase, su md5).
const servidor = { data: {}, escriturasRechazadas: 0, antesDeEscribir: null };
const huellas = () => Object.fromEntries(Object.entries(servidor.data).map(([k, v]) => [k, JSON.stringify(v)]));
const cliente = {
    auth: new Proxy({ getUser: async () => ({ data: { user: { id: 'u' } }, error: null }) }, { get: (t, k) => t[k] || stub() }),
    rpc: async (nombre, args) => {
        if (nombre === 'leer_bitacora') return { data: { data: structuredClone(servidor.data), huellas: huellas() }, error: null };
        if (nombre === 'guardar_bitacora') {
            if (servidor.antesDeEscribir) { const f = servidor.antesDeEscribir; servidor.antesDeEscribir = null; f(); }
            const h = huellas();
            if (Object.entries(args.p_huellas).some(([k, v]) => (h[k] || '') !== v)) { servidor.escriturasRechazadas++; return { data: false, error: null }; }
            Object.assign(servidor.data, structuredClone(args.p_patch));
            return { data: true, error: null };
        }
        return { data: null, error: { message: 'no existe' } };
    },
    from: () => stub(),
};
const clienteProxy = new Proxy(cliente, { get: (t, k) => t[k] || stub() });

const ctx = { console: { log() {}, error() {}, warn() {}, info() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, TextDecoder, Intl, structuredClone, URLSearchParams, URL, Blob };
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
for (const k of ['document', 'localStorage', 'sessionStorage', 'location', 'history', 'matchMedia', 'addEventListener', 'indexedDB', 'requestAnimationFrame', 'visualViewport', 'CSS', 'screen', 'IntersectionObserver', 'ResizeObserver', 'MutationObserver', 'Document', 'Element', 'Node', 'HTMLElement', 'Event']) ctx[k] = stub();
ctx.navigator = { onLine: true, userAgent: 'node' };
ctx.supabase = { createClient: () => clienteProxy };
vm.createContext(ctx);
for (const f of [...new Set(readFileSync(new URL('index.html', raiz), 'utf8').match(/js\/[\w-]+\.js/g))]) vm.runInContext(readFileSync(new URL(f, raiz), 'utf8'), ctx, { filename: f });
const run = c => vm.runInContext(c, ctx);
const hoy = run('currentPlannerDayKey()');

// Las dos partes arrancan con la misma copia de la nube.
function empezar(planner) {
    servidor.data = { dayPlanner: structuredClone(planner), entries: [] };
    servidor.escriturasRechazadas = 0;
    ctx.__nube = structuredClone(servidor.data);
    run(`Object.keys(DATOS_SINCRONIZADOS).forEach(k => { if (k in __nube) DATOS_SINCRONIZADOS[k][1](JSON.parse(JSON.stringify(__nube[k]))); });
         datosBase = Object.fromEntries(Object.keys(DATOS_SINCRONIZADOS).map(k => [k, clonarDatos(DATOS_SINCRONIZADOS[k][0]())]));`);
}
// Lo que hace el iPhone: lee la nube, aplica su operación y escribe ese bloque entero (merge_bitacora_si).
const iphone = cambio => () => { const p = structuredClone(servidor.data.dayPlanner); cambio(p); servidor.data.dayPlanner = p; };
const tarea = (id, extra = {}) => ({ id, title: id, notes: '', done: false, ...extra });
const enNube = id => (servidor.data.dayPlanner.days[hoy] || []).concat(servidor.data.dayPlanner.backlog || []).find(t => t.id === id);

test('la web marca una tarea mientras el iPhone añade otra: quedan las dos', async () => {
    empezar({ days: { [hoy]: [tarea('a')] }, backlog: [] });
    servidor.antesDeEscribir = iphone(p => p.days[hoy].push(tarea('ios')));
    run(`dayPlanner.days['${hoy}'].find(t => t.id === 'a').done = true;`);
    await run('doSaveData()');
    assert.equal(servidor.escriturasRechazadas, 1, 'la primera escritura de la web tenía que chocar');
    assert.equal(enNube('a')?.done, true);
    assert.ok(enNube('ios'), 'se perdió la tarea del iPhone');
});

test('la web añade una tarea mientras el iPhone marca otra: quedan las dos cosas', async () => {
    empezar({ days: { [hoy]: [tarea('a')] }, backlog: [] });
    servidor.antesDeEscribir = iphone(p => { p.days[hoy][0].done = true; p.days[hoy][0].hechaEn = 1; });
    run(`dayPlanner.days['${hoy}'].push({ id: 'web', title: 'web', notes: '', done: false });`);
    await run('doSaveData()');
    assert.equal(enNube('a')?.done, true, 'se perdió la marca del iPhone');
    assert.ok(enNube('web'), 'se perdió la tarea de la web');
});

test('los dos marcan tareas distintas a la vez: las dos quedan marcadas', async () => {
    empezar({ days: { [hoy]: [tarea('a'), tarea('b')] }, backlog: [] });
    servidor.antesDeEscribir = iphone(p => { p.days[hoy][1].done = true; });
    run(`dayPlanner.days['${hoy}'].find(t => t.id === 'a').done = true;`);
    await run('doSaveData()');
    assert.equal(enNube('a')?.done, true);
    assert.equal(enNube('b')?.done, true);
});

test('el iPhone pone un recordatorio y una subtarea mientras la web cambia el título: se conservan', async () => {
    empezar({ days: { [hoy]: [tarea('a')] }, backlog: [] });
    servidor.antesDeEscribir = iphone(p => { p.days[hoy][0].recordatorio = { tipo: 'hora' }; p.days[hoy][0].subtasks = [{ id: 'sub_1', text: 'x', done: false }]; });
    run(`dayPlanner.days['${hoy}'].find(t => t.id === 'a').title = 'nuevo';`);
    await run('doSaveData()');
    const a = enNube('a');
    assert.equal(a?.title, 'nuevo');
    assert.deepEqual(a?.recordatorio, { tipo: 'hora' });
    assert.equal(a?.subtasks?.length, 1);
});
