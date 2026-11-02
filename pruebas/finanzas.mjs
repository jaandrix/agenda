// Pruebas de dinero: el código real de la app, en Node y sin navegador, contra extractos anonimizados.
//     node --test pruebas/finanzas.mjs
// Las marcadas «todo» son errores conocidos: se ven en la salida sin hacer fallar nada. Al arreglar uno, quitar su marca.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { inflateRawSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const raiz = new URL('..', import.meta.url);
const stub = () => new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => '' : stub(), apply: () => stub(), construct: () => stub(), set: () => true });

export function cargarApp() {
    const ctx = { console: { log() {}, error() {}, warn() {}, info() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, TextDecoder, Intl, structuredClone, URLSearchParams, URL, Blob };
    ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
    for (const k of ['document', 'navigator', 'localStorage', 'sessionStorage', 'location', 'history', 'supabase', 'matchMedia', 'addEventListener', 'indexedDB', 'requestAnimationFrame', 'visualViewport', 'CSS', 'screen', 'IntersectionObserver', 'ResizeObserver', 'MutationObserver', 'Document', 'Element', 'Node', 'HTMLElement', 'Event']) ctx[k] = stub();
    vm.createContext(ctx);
    const scripts = [...new Set(readFileSync(new URL('index.html', raiz), 'utf8').match(/js\/[\w-]+\.js/g))];
    scripts.forEach(f => vm.runInContext(readFileSync(new URL(f, raiz), 'utf8'), ctx, { filename: f }));
    vm.runInContext(`
        globalThis.__vaciar = (saldos = {}) => {
            financePro = { enabled: true, accounts: { efectivo: { name: 'Efectivo', balance0: 0 }, bancos: { name: 'Ibercaja', balance0: 0 }, online: { name: 'Revolut', balance0: 0 } }, categories: [], transactions: [], categoryBudgets: {}, rules: [], programados: [] };
            Object.entries(saldos).forEach(([c, s]) => { financePro.accounts[c].balance0 = s; });
            entries = []; financeSaldosCache = null;
        };
        globalThis.__importar = (datos, cuenta) => {
            const imp = financeProPrepararImport(datos, cuenta);
            renderFinanceProImportFilas(imp);
            const antes = financePro.transactions.length;
            const r = financeProEjecutarImport(imp);
            return { ...r, nuevos: financePro.transactions.length - antes, excluidas: imp.excluidas.size, cuadre: financeProCuadreExtracto(imp) };
        };
    `, ctx);
    return { ctx, run: c => vm.runInContext(c, ctx) };
}

// Hace lo mismo que financeProLeerExcel, que necesita DOMParser y DecompressionStream del navegador.
export function leerXlsx(ruta) {
    const buf = readFileSync(ruta), dv = new DataView(buf.buffer, buf.byteOffset, buf.length);
    let fin = buf.length - 22;
    while (dv.getUint32(fin, true) !== 0x06054b50) fin--;
    const partes = {};
    for (let k = 0, p = dv.getUint32(fin + 16, true); k < dv.getUint16(fin + 10, true); k++) {
        const n = dv.getUint16(p + 28, true), e = dv.getUint16(p + 30, true), c = dv.getUint16(p + 32, true);
        const nombre = buf.subarray(p + 46, p + 46 + n).toString();
        const l = dv.getUint32(p + 42, true), ini = l + 30 + dv.getUint16(l + 26, true) + dv.getUint16(l + 28, true);
        const d = buf.subarray(ini, ini + dv.getUint32(p + 20, true));
        partes[nombre] = dv.getUint16(p + 10, true) === 0 ? d.toString() : inflateRawSync(d).toString();
        p += 46 + n + e + c;
    }
    const ent = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    const ss = [...(partes['xl/sharedStrings.xml'] || '').matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(m => ent([...m[1].matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(x => x[1]).join('')));
    const hoja = partes[Object.keys(partes).filter(n => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort()[0]];
    const col = ref => [...ref.replace(/\d+$/, '')].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    const rows = [];
    for (const f of hoja.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
        const cs = [];
        for (const c of f[1].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
            const r = c[1].match(/\br="([A-Z]+\d+)"/)?.[1], t = c[1].match(/\bt="(\w+)"/)?.[1];
            const v = c[2]?.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1] ?? '';
            const inl = c[2]?.match(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/)?.[1];
            const val = t === 's' ? ss[+v] ?? '' : t === 'inlineStr' ? ent(inl || '') : ent(v);
            const i = r ? col(r) : cs.length;
            while (cs.length < i) cs.push('');
            cs[i] = String(val).trim();
        }
        if (cs.some(Boolean)) rows.push(cs);
    }
    const ancho = Math.max(0, ...rows.map(r => r.length));
    return rows.map(r => r.concat(Array(ancho - r.length).fill('')));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { ctx, run } = cargarApp();
    const extracto = f => readFileSync(new URL(`extractos/${f}`, import.meta.url), 'utf8');
    const REVOLUT = ['revolut-1.csv', 'revolut-2.csv', 'revolut-3.csv'].map(extracto);
    const IBERCAJA = JSON.parse(extracto('ibercaja-1.json'));
    const cabRevolut = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance';
    const importar = (datos, cuenta) => { ctx.__datos = datos; return run(`__importar(__datos, ${JSON.stringify(cuenta)})`); };
    const vaciar = (saldos = {}) => run(`__vaciar(${JSON.stringify(saldos)})`);
    const numero = t => +String(t).replace(',', '.');
    const aperturaRevolut = () => { const c = REVOLUT[0].trim().split('\n')[1].split(','); return +(+c[9] - +c[5]).toFixed(2); };
    const aperturaIbercaja = () => { const u = IBERCAJA[IBERCAJA.length - 1]; return +(numero(u[7]) - numero(u[6])).toFixed(2); };
    const saldo = c => Math.round(run(`financeProAccountBalance(${JSON.stringify(c)})`) * 100) / 100;

    test('reimportar los extractos de Revolut no añade nada', () => {
        vaciar({ online: aperturaRevolut() });
        REVOLUT.forEach(e => importar(e, 'online'));
        const antes = JSON.stringify(run('financePro.transactions.map(t => [t.date, t.amount, t.note])'));
        REVOLUT.forEach(e => assert.equal(importar(e, 'online').nuevos, 0));
        assert.equal(JSON.stringify(run('financePro.transactions.map(t => [t.date, t.amount, t.note])')), antes);
    });

    test('los pendientes se completan sin duplicarse y lo anulado no cuenta', () => {
        vaciar({ online: aperturaRevolut() });
        const filasSep = REVOLUT[0].trim().split('\n').slice(1).map(l => l.split(','));
        const anulada = filasSep.find(r => r[8] === 'REVERTED');
        REVOLUT.forEach(e => importar(e, 'online'));
        assert.equal(run('financePro.transactions.filter(t => t.pendiente).length'), 3);
        ctx.__nota = anulada[4];
        assert.equal(run('financePro.transactions.filter(t => t.note === __nota).length'), 1);
    });

    test('un mes de Revolut cuadra con su saldo', () => {
        vaciar({ online: aperturaRevolut() });
        assert.equal(importar(REVOLUT[0], 'online').cuadre.cuadra, true);
    });

    test('Ibercaja cuadra con su saldo y reimportar no añade nada', () => {
        vaciar({ bancos: aperturaIbercaja() });
        assert.equal(importar(IBERCAJA, 'bancos').cuadre.cuadra, true);
        assert.equal(saldo('bancos'), numero(IBERCAJA[4][7]));
        assert.equal(importar(IBERCAJA, 'bancos').nuevos, 0);
    });

    test('el orden de los archivos de dos bancos no cambia los saldos', () => {
        vaciar({ online: aperturaRevolut(), bancos: aperturaIbercaja() });
        importar(IBERCAJA, 'bancos'); REVOLUT.forEach(e => importar(e, 'online'));
        const a = [saldo('bancos'), saldo('online')];
        vaciar({ online: aperturaRevolut(), bancos: aperturaIbercaja() });
        REVOLUT.forEach(e => importar(e, 'online')); importar(IBERCAJA, 'bancos');
        assert.deepEqual([saldo('bancos'), saldo('online')], a);
    });

    test('la foto de antes de importar devuelve Finanzas a como estaba', () => {
        vaciar({ online: aperturaRevolut() });
        importar(REVOLUT[0], 'online');
        const antes = run('JSON.stringify(financePro)');
        run('globalThis.__foto = financeFotoFinanzas()');
        importar(REVOLUT[2], 'online');
        assert.notEqual(run('JSON.stringify(financePro)'), antes);
        run('financePro = JSON.parse(JSON.stringify(__foto.financePro))');
        assert.equal(run('JSON.stringify(financePro)'), antes);
    });

    test('dos compras iguales en días cercanos de extractos distintos son dos compras', { todo: 'financeProFilasYaApuntadas desmarca la segunda como «parece que ya está»: quedan fuera y el saldo descuadra' }, () => {
        vaciar();
        const fila = (ini, fin, sal) => `Card Payment,Current,${ini},${fin},Cafe,-1.60,0.00,EUR,COMPLETED,${sal}`;
        importar([cabRevolut, fila('2023-09-29 18:00:00', '2023-09-30 04:00:00', '98.40')].join('\n'), 'online');
        const r = importar([cabRevolut, fila('2023-10-01 18:00:00', '2023-10-02 04:00:00', '96.80')].join('\n'), 'online');
        assert.equal(r.nuevos, 1);
    });

    test('la comisión de Revolut descuenta del saldo', { todo: 'financeProEjecutarImport ignora la columna Fee: el saldo se queda alto por lo que sumen las comisiones' }, () => {
        vaciar({ online: 100 });
        const r = importar([cabRevolut, 'Transfer,Current,2023-10-01 10:00:00,2023-10-01 10:00:01,To Persona,-10.00,1.50,EUR,COMPLETED,88.50'].join('\n'), 'online');
        assert.equal(r.cuadre.cuadra, true);
    });

    test('el cuadre encuentra el saldo final aunque las filas de un día estén desordenadas', () => {
        const cab = ['Nº Orden', 'Fecha Operacion', 'Fecha Valor', 'Concepto', 'Descripción', 'Referencia', 'Importe', 'Saldo'];
        const filas = [cab,
            ['2', '02/10/2023', '02/10/2023', 'TARJETA VISA', 'Comercio B', '2', '-30,00', '70,00'],
            ['1', '02/10/2023', '02/10/2023', 'TARJETA VISA', 'Comercio A', '1', '-20,00', '50,00'],
            ['3', '01/10/2023', '01/10/2023', 'NOMINA', 'Empresa', '3', '100,00', '100,00']];
        vaciar();
        assert.equal(importar(filas, 'bancos').cuadre.cuadra, true);
    });

    test('una recarga entre tus bancos es un traspaso sin tener reglas', { todo: 'a 2 o 3 días y con el concepto «Revolut**…» en Ibercaja no se empareja: cuenta como gasto y como ingreso para quien aún no tenga la regla' }, () => {
        vaciar({ online: aperturaRevolut(), bancos: aperturaIbercaja() });
        importar(IBERCAJA, 'bancos'); REVOLUT.forEach(e => importar(e, 'online'));
        assert.equal(run(`financePro.transactions.filter(t => t.type === 'income' && /Top-up/.test(t.note || '')).length`), 0);
    });
}
