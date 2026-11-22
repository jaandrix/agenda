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

    test('dos compras iguales en días cercanos de extractos distintos son dos compras', () => {
        vaciar();
        const fila = (ini, fin, sal) => `Card Payment,Current,${ini},${fin},Cafe,-1.60,0.00,EUR,COMPLETED,${sal}`;
        importar([cabRevolut, fila('2023-09-29 18:00:00', '2023-09-30 04:00:00', '98.40')].join('\n'), 'online');
        const r = importar([cabRevolut, fila('2023-10-01 18:00:00', '2023-10-02 04:00:00', '96.80')].join('\n'), 'online');
        assert.equal(r.nuevos, 1);
    });

    test('un pendiente que se completa con otro nombre de comercio no se duplica', () => {
        vaciar({ online: 100 });
        importar([cabRevolut, 'Card Payment,Current,2023-10-14 18:40:53,,Peaje,-8.42,0.00,EUR,PENDING,'].join('\n'), 'online');
        const r = importar([cabRevolut, 'Card Payment,Current,2023-10-14 18:40:53,2023-10-18 09:35:45,Autopista,-8.42,0.00,EUR,COMPLETED,91.58'].join('\n'), 'online');
        assert.equal(run('financePro.transactions.length'), 1);
        assert.equal(run('financePro.transactions.filter(t => t.pendiente).length'), 0);
        assert.equal(r.cuadre.cuadra, true);
    });

    test('un cargo pendiente de antes del extracto no lo descuadra', () => {
        vaciar({ online: 100 });
        importar([cabRevolut, 'Card Payment,Current,2023-09-29 10:00:00,2023-09-29 10:00:01,Tienda,-10.00,0.00,EUR,COMPLETED,90.00',
            'Card Payment,Current,2023-09-30 12:00:00,,Bar,-5.00,0.00,EUR,PENDING,'].join('\n'), 'online');
        const r = importar([cabRevolut, 'Card Payment,Current,2023-10-01 09:00:00,2023-10-01 09:00:01,Super,-20.00,0.00,EUR,COMPLETED,70.00'].join('\n'), 'online');
        assert.equal(r.cuadre.cuadra, true);
    });

    test('la comisión de Revolut descuenta del saldo y reimportar no la repite', () => {
        vaciar({ online: 100 });
        const csv = [cabRevolut, 'Transfer,Current,2023-10-01 10:00:00,2023-10-01 10:00:01,To Persona,-10.00,1.50,EUR,COMPLETED,88.50'].join('\n');
        const r = importar(csv, 'online');
        assert.equal(r.cuadre.cuadra, true);
        assert.equal(saldo('online'), 88.5);
        assert.equal(run(`financePro.transactions.filter(t => t.comision).length`), 1);
        assert.equal(importar(csv, 'online').nuevos, 0);
        assert.equal(saldo('online'), 88.5);
    });

    test('cada pantalla de Finanzas se abre sin errores', () => {
        vaciar({ bancos: 100 });
        run(`financePro.categories = [{ id: 'c1', name: 'Super', type: 'expense' }]; financePro.transactions = [{ id: 't1', date: '2023-10-01', account: 'bancos', type: 'expense', amount: 5, category: 'c1', note: 'x' }];`);
        run(`showModal = h => { globalThis.__modal = String(h); }; ponerModal = showModal; modoCapa = () => {};`);
        const pantallas = ['openFinanceProTransactionModal()', "openFinanceProTransactionModal('t1')", 'openFinanceProQuickCaptureModal()', 'openFinanceProAccountsSettings()', "openFinanceProBalanceAdjustModal('bancos')",
            'openFinanceProCategoriesModal()', 'openFinanceProRulesModal()', 'openFinanceProDuplicatesModal()', 'openFinanceProAllTxModal()', 'openFinanceProProgramadosModal()', 'openFinanceProViajeModal()',
            'openFinanceProImportModal()', 'openDeshacerImportacion()', 'openFinanceProReviewModal()', 'openGestorSuscripciones()', 'openPuedoPermitirme()', 'openFinanceHistoryCorrectionModal()',
            "financeTab = 'resumen'; renderFinanceProDashboard()", "financeTab = 'cuentas'; renderFinanceProDashboard()", "financeTab = 'movimientos'; renderFinanceProDashboard()", "financeTab = 'planificacion'; renderFinanceProDashboard()",
            "financeTab = 'resumen'; renderMobileFinances()", "financeTab = 'cuentas'; renderMobileFinances()", "financeTab = 'movimientos'; renderMobileFinances()", "financeTab = 'planificacion'; renderMobileFinances()"];
        const fallos = pantallas.flatMap(p => { try { run(p); return []; } catch (e) { return [`${p}: ${e.message}`]; } });
        assert.deepEqual(fallos, []);
    });

    test('el correo de inversión rellena huecos, no pisa lo guardado a mano y se deshace', () => {
        vaciar();
        run(`showModal = h => { globalThis.__modal = String(h); }; modoCapa = () => {}; registroConector = [];
            financeProfile.investmentAccounts = [{ id: 'i1', name: 'MyInvestor', contributions: [{ month: '2026-09', amount: 200, value: 1000, guardado: true }] }];`);
        run(`registrarLineaConector(aplicarOpConector({ tipo: 'inversion', cuentaId: 'i1', cuenta: 'MyInvestor', mes: '2026-09', correo: { valor: 950, aportadoMes: 198 } }, 'r1'), 'auto')`);
        assert.equal(run(`financeProfile.investmentAccounts[0].contributions.find(c => c.month === '2026-09').value`), 1000);
        assert.equal(run(`financeProfile.investmentAccounts[0].contributions.find(c => c.month === '2026-09').correo.valor`), 950);
        run(`registrarLineaConector(aplicarOpConector({ tipo: 'inversion', cuenta: 'myinvestor', mes: '2026-10', correo: { valor: 1189, aportadoMes: 198 } }, 'r2'), 'auto')`);
        assert.equal(run(`financeProfile.investmentAccounts.length`), 1);
        assert.equal(run(`financeProfile.investmentAccounts[0].contributions.find(c => c.month === '2026-10').value`), 1189);
        assert.equal(run(`financeProfile.investmentAccounts[0].contributions.find(c => c.month === '2026-10').desdeCorreo`), true);
        run(`deshacerConector('r2', true)`);
        assert.equal(run(`financeProfile.investmentAccounts[0].contributions.some(c => c.month === '2026-10')`), false);
        run(`deshacerConector('r1', true)`);
        assert.equal(run(`'correo' in financeProfile.investmentAccounts[0].contributions.find(c => c.month === '2026-09')`), false);
        run(`openFichaInversion('i1')`);
        assert.match(run(`__modal`), /si mantienes el ritmo/);
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

    // Arreglado el 19-11 (auditoría F-05). La recarga del 28-10 (536,96 €) no sale en el extracto de Ibercaja, que acaba
    // ese día: solo tiene una mitad y se queda como está (la propone «salud.»).
    test('una recarga entre tus bancos es un traspaso sin tener reglas, en los dos órdenes', () => {
        const recargasIbercaja = new Set(IBERCAJA.filter(r => /Revolut/.test(r[4])).map(r => Math.abs(numero(r[6]))));
        for (const orden of ['ibercaja primero', 'revolut primero']) {
            vaciar({ online: aperturaRevolut(), bancos: aperturaIbercaja() });
            if (orden === 'ibercaja primero') { importar(IBERCAJA, 'bancos'); REVOLUT.forEach(e => importar(e, 'online')); }
            else { REVOLUT.forEach(e => importar(e, 'online')); importar(IBERCAJA, 'bancos'); }
            ctx.__recargas = [...recargasIbercaja];
            const sueltas = run(`JSON.stringify(financePro.transactions.filter(t => t.type === 'income' && /Top-up/.test(t.note || '') && t.date >= '2023-09-01' && t.date <= '2023-10-26' && __recargas.includes(Number(t.amount))).map(t => [t.date, t.amount]))`);
            assert.equal(sueltas, '[]', orden);
            assert.ok(run(`financePro.transactions.filter(t => t.type === 'transfer' && t.account === 'bancos' && t.transferTo === 'online').length`) >= 6, orden);
        }
    });
}


// ---- Invariantes de la auditoría del 05-11 ----
test('un movimiento con fecha futura no cuenta en el saldo de hoy (F-01)', () => {
    const { run } = cargarApp();
    run(`__vaciar(); financePro.transactions.push({ id: 'fut', date: '2099-01-01', type: 'income', amount: 1000, account: 'bancos', manual: true });`);
    assert.equal(run('saldoLiquido()'), 0);
});

test('una inversión con aportaciones y sin valoración vale lo aportado (F-03)', () => {
    const { run } = cargarApp();
    assert.equal(run(`investmentAccountValue({ contributions: [{ month: '2026-05', amount: 500 }] })`), 500);
    assert.equal(run(`investmentAccountValue({ contributions: [{ month: '2026-05', amount: 500, value: 510 }, { month: '2026-06', amount: 100 }] })`), 610);
});

test('el correo rellena el valor de un mes que ya existía sin valor, sin tocar lo apuntado a mano (F-09)', () => {
    const { run } = cargarApp();
    run(`__vaciar();
        financePro.transactions.push({ id: 'a1', date: '2026-05-10', type: 'expense', amount: 500, category: 'cat_inversion_gasto', account: 'online' });
        financeProfile.investmentAccounts = [{ id: 'i1', name: 'fondo', contributions: [
            { month: '2026-05', amount: 500, deMovimientos: true, correo: { valor: 495, gananciasInicio: 2 } },
            { month: '2026-06', amount: 0, value: 777, correo: { valor: 600, gananciasInicio: 5 } } ] }];
        invSincronizarMovimientos();`);
    assert.equal(run(`financeProfile.investmentAccounts[0].contributions.find(c => c.month === '2026-05').value`), 502);
    assert.equal(run(`financeProfile.investmentAccounts[0].contributions.find(c => c.month === '2026-06').value`), 777);
});

// Prepara una cuenta con todo lo que Finanzas materializaba al pintarse: una suscripción por cobrar, un gasto programado
// vencido, una aportación sin sincronizar y un mes sin punto en el histórico.
const PREPARAR_PINTADO = `__vaciar({ bancos: 100 });
    entries = [{ id: 's1', type: 'subscription', title: 'Netflix', amount: 10, renewalDay: 1, active: true, proAccount: 'bancos' }];
    financePro.programados = [{ id: 'p1', date: '2000-01-01', account: 'bancos', amount: 5 }];
    financePro.transactions.push({ id: 'a1', date: '2000-01-02', type: 'expense', amount: 50, category: 'cat_inversion_gasto', account: 'bancos' });
    financeProfile.investmentAccounts = [{ id: 'i1', name: 'fondo', contributions: [] }];
    financeProfile.history = [];
    globalThis.__guardados = 0; saveData = () => { __guardados++; return Promise.resolve(); };
    setTimeout = f => { f(); return 0; };
    showModal = () => {}; modoCapa = () => {};`;

test('pintar Finanzas no cambia los datos ni guarda (F-05)', () => {
    const { run } = cargarApp();
    run(PREPARAR_PINTADO);
    const antes = run('JSON.stringify([financePro, financeProfile, entries])');
    for (const tab of ['resumen', 'cuentas', 'movimientos', 'planificacion']) {
        run(`financeTab = '${tab}'; renderFinances(); renderFinanceProDashboard(); renderMobileFinances(); renderFinances();`);
    }
    assert.equal(run('JSON.stringify([financePro, financeProfile, entries])'), antes);
    assert.equal(run('__guardados'), 0);
});

test('preparar Finanzas es un paso aparte, idempotente y que no guarda solo (F-05)', () => {
    const { run } = cargarApp();
    run(PREPARAR_PINTADO);
    assert.equal(run('prepararFinanzas()'), true);
    assert.equal(run(`financePro.transactions.filter(t => t.id === 'ptx_prog_p1' || t.recurringEntryId === 's1').length`), 2);
    assert.equal(run(`financeProfile.history.length`), 1);
    assert.equal(run(`financeProfile.investmentAccounts[0].contributions.length`), 1);
    const despues = run('JSON.stringify([financePro, financeProfile.investmentAccounts, entries])');
    assert.equal(run('prepararFinanzas()'), false);
    assert.equal(run('JSON.stringify([financePro, financeProfile.investmentAccounts, entries])'), despues);
    assert.equal(run('__guardados'), 0);
});

// Cada escritura de Finanzas, con un guardado que falla y con uno que funciona.
async function escribirFinanzas(accion, falla) {
    const { run } = cargarApp();
    run(`__vaciar({ bancos: 100 });
        financePro.transactions.push({ id: 't1', date: '2026-01-10', type: 'expense', amount: 5, account: 'bancos', manual: true });
        financePro.programados = [{ id: 'p1', date: '2099-01-01', account: 'bancos', amount: 5 }];
        entries = [{ id: 's1', type: 'subscription', title: 'Netflix', amount: 10, renewalDay: 1, active: true }];
        globalThis.__guardados = 0;
        saveData = () => { __guardados++; return ${falla} ? Promise.reject(new Error('servidor')) : Promise.resolve(); };
        showModal = () => {}; ponerModal = showModal; modoCapa = () => {}; confirm = () => true; render = () => {};
        window._financeProTxEditId = null;
        window._financeProTxDraft = { date: '2026-01-11', amount: '12,50', account: 'bancos', type: 'expense', note: 'nuevo' };
        window._financeProAdjustKey = 'bancos';
        window._financeProgramadoDraft = { date: '2099-02-01', amount: '7', account: 'bancos', category: '', note: 'seguro' };`);
    const antes = run('JSON.stringify([financePro, entries])');
    await run(accion);
    return { run, antes, ahora: run('JSON.stringify([financePro, entries])') };
}

const ESCRITURAS = {
    'crear un movimiento': 'saveFinanceProTransaction()',
    'editar un movimiento': `(window._financeProTxEditId = 't1', saveFinanceProTransaction())`,
    'borrar un movimiento': `deleteFinanceProTransaction('t1')`,
    'ajustar el saldo': 'saveFinanceProBalanceAdjust()',
    'programar un gasto': 'saveFinanceProProgramado()',
    'quitar un programado': `deleteFinanceProProgramado('p1')`,
    'dar de baja una suscripción': `suscripcionDarDeBaja('s1')`,
    'borrar una suscripción': `suscripcionBorrar('s1')`,
};

for (const [nombre, accion] of Object.entries(ESCRITURAS)) {
    test(`${nombre}: si el guardado falla, todo queda como estaba; si funciona, se queda (F-07)`, async () => {
        const mal = await escribirFinanzas(accion, true);
        assert.equal(mal.ahora, mal.antes);
        assert.equal(mal.run('__guardados'), 1);
        const bien = await escribirFinanzas(accion, false);
        assert.notEqual(bien.ahora, bien.antes);
        assert.equal(bien.run('__guardados'), 1);
    });
}

test('un movimiento que no se pudo guardar conserva lo escrito para reintentar (F-07)', async () => {
    const { run } = await escribirFinanzas('saveFinanceProTransaction()', true);
    assert.equal(run('window._financeProTxDraft?.note'), 'nuevo');
});

test('dos toques seguidos en guardar crean un solo movimiento (F-07)', async () => {
    const { run } = cargarApp();
    run(`__vaciar(); let soltar; saveData = () => new Promise(r => { soltar = r; }); globalThis.__soltar = () => soltar();
        showModal = () => {}; modoCapa = () => {}; render = () => {}; window._financeProTxEditId = null;
        window._financeProTxDraft = { date: '2026-01-11', amount: '3', account: 'bancos', type: 'expense' };
        globalThis.__p1 = saveFinanceProTransaction(); globalThis.__p2 = saveFinanceProTransaction();`);
    run('__soltar()');
    await run('Promise.all([__p1, __p2])');
    assert.equal(run('financePro.transactions.length'), 1);
});

// Una cuenta con todo: tres cuentas de Finanzas y una cuarta (F-10), inversión, emergencia, vacaciones y una cuenta a mano.
const PATRIMONIO = `__vaciar({ bancos: 1000, efectivo: 20.1, online: 0.2 });
    financePro.accounts.cuarta = { name: 'Cuarta', balance0: 50 };
    financePro.transactions.push({ id: 'g', date: '2026-01-05', type: 'expense', amount: 10.05, account: 'bancos' },
        { id: 'tr', date: '2026-01-06', type: 'transfer', amount: 5, account: 'bancos', transferTo: 'cuarta' });
    financeProfile.investmentAccounts = []; financeProfile.invested = 300.1; financeProfile.emergency = 100.2;
    financeProfile.vacation = 200; financeProfile.customAccounts = [{ id: 'ca1', name: 'Hucha', balance: 500 }];
    financeProfile.history = [];`;

test('saldo líquido, patrimonio operativo y activos totales: cada uno suma lo suyo (F-02, F-10)', () => {
    const { run } = cargarApp();
    run(PATRIMONIO);
    assert.equal(run('saldoLiquido()'), 1060.25);
    assert.equal(run('patrimonioOperativo()'), 1460.55);
    assert.equal(run('activosTotales()'), 2160.55);
});

test('en el snapshot, las piezas suman su total (F-02)', () => {
    const { run } = cargarApp();
    run(PATRIMONIO);
    const s = JSON.parse(run('JSON.stringify(financeSnapshot())'));
    const suma = (...v) => Math.round(v.reduce((a, b) => a + b, 0) * 100) / 100;
    assert.equal(s.cash, run('saldoLiquido()'));
    assert.equal(s.total, suma(s.cash, s.invested, s.emergency));
    assert.equal(s.total, run('patrimonioOperativo()'));
    assert.equal(s.activos, suma(...Object.values(s.accounts)));
    assert.equal(s.activos, run('activosTotales()'));
});

test('la gráfica, el objetivo y la exportación usan las mismas cifras (F-02)', () => {
    const { run } = cargarApp();
    run(PATRIMONIO + 'prepararFinanzas();');
    const serie = JSON.parse(run('JSON.stringify(financeSerieDiaria(null, false))'));
    assert.equal(Math.round(serie[serie.length - 1].v * 100) / 100, run('saldoLiquido()'));
    const conExtras = JSON.parse(run('JSON.stringify(financeSerieDiaria(null, true))'));
    assert.equal(Math.round(conExtras[conExtras.length - 1].v * 100) / 100, run('patrimonioOperativo()'));
    assert.equal(run('finRedondo(finResCaminoObjetivo().actual)'), run('patrimonioOperativo()'));
    const md = run('buildFinanceExportMarkdown()');
    assert.ok(md.includes(run('financeMoney(patrimonioOperativo())')), 'el Markdown lleva el patrimonio operativo');
    assert.ok(md.includes(run('financeMoney(activosTotales())')), 'el Markdown lleva los activos totales');
});

test('un traspaso cuenta en una sola cuenta de inversión (F-12)', () => {
    const { run } = cargarApp();
    run(`__vaciar();
        financePro.transactions.push({ id: 'a', date: '2026-05-10', type: 'expense', amount: 100, category: 'cat_inversion_gasto', account: 'bancos', note: 'traspaso fondo indexado' },
            { id: 'b', date: '2026-05-12', type: 'expense', amount: 40, category: 'cat_inversion_gasto', account: 'bancos', note: 'otro', investmentAccountId: 'i1' });
        financeProfile.investmentAccounts = [{ id: 'i1', name: 'fondo', traspasoTexto: 'fondo', contributions: [] }, { id: 'i2', name: 'indexado', traspasoTexto: 'indexado', contributions: [] }];`);
    const aportado = id => run(`invTraspasos(financeProfile.investmentAccounts.find(a => a.id === '${id}')).reduce((s, t) => s + t.amount, 0)`);
    assert.equal(aportado('i1') + aportado('i2'), 40, 'el que encaja con las dos no se reparte a ciegas');
    run(`financePro.transactions[0].investmentAccountId = 'i2'`);
    assert.equal(aportado('i1'), 40);
    assert.equal(aportado('i2'), 100);
});

test('con una sola cuenta de inversión, todo lo invertido es suyo (F-12)', () => {
    const { run } = cargarApp();
    run(`__vaciar(); financePro.transactions.push({ id: 'a', date: '2026-05-10', type: 'expense', amount: 100, category: 'cat_inversion_gasto', account: 'bancos', note: 'x' });
        financeProfile.investmentAccounts = [{ id: 'i1', name: 'fondo', contributions: [] }];`);
    assert.equal(run(`invTraspasos(financeProfile.investmentAccounts[0]).length`), 1);
});

test('restablecer tiene dos alcances: movimientos y cuentas, o todas las finanzas (F-11)', async () => {
    for (const alcance of ['movimientos', 'todo']) {
        const { run } = cargarApp();
        run(PATRIMONIO + `prepararFinanzas(); financePro.programados = [{ id: 'p1', date: '2099-01-01', account: 'bancos', amount: 5 }];
            saveData = () => Promise.resolve(); showModal = () => {}; confirm = () => true; render = () => {};`);
        await run(`resetFinancePro('${alcance}')`);
        assert.equal(run('financePro.transactions.length + financePro.programados.length'), 0);
        assert.equal(run('saldoLiquido()'), 0);
        assert.equal(run('financeProfile.history.length + financeProfile.customAccounts.length + Number(financeProfile.invested)') > 0, alcance === 'movimientos');
    }
});

test('importes y fechas no válidos: se corrigen si se puede, se avisan si no y no rompen nada (F-16)', () => {
    const { run } = cargarApp();
    run(`__vaciar({ bancos: 100 }); showModal = () => {}; ponerModal = showModal; modoCapa = () => {};
        financePro.transactions.push({ id: 'texto', date: '2026-01-05', type: 'expense', amount: '12,50', account: 'bancos' },
            { id: 'sinfecha', type: 'expense', amount: 5, account: 'bancos' },
            { id: 'basura', date: '2026-01-06', type: 'income', amount: 'abc', account: 'bancos' });
        prepararFinanzas();`);
    assert.equal(run(`financePro.transactions.find(t => t.id === 'texto').amount`), 12.5);
    assert.deepEqual(JSON.parse(run('JSON.stringify(financeProIncidencias().map(i => i.id).sort())')), ['basura', 'sinfecha']);
    assert.equal(run('saldoLiquido()'), 87.5);
    const pantallas = ["financeTab = 'resumen'; renderFinanceProDashboard()", "financeTab = 'cuentas'; renderFinanceProDashboard()", "financeTab = 'movimientos'; renderFinanceProDashboard()", "financeTab = 'planificacion'; renderFinanceProDashboard()",
        "financeTab = 'resumen'; renderMobileFinances()", "financeTab = 'cuentas'; renderMobileFinances()", "financeTab = 'movimientos'; renderMobileFinances()", 'openFinanceProAllTxModal()', 'openFinanceProStatsModal()'];
    const fallos = pantallas.flatMap(p => { try { run(p); return []; } catch (e) { return [`${p}: ${e.message}`]; } });
    assert.deepEqual(fallos, []);
    assert.match(run(`financeTab = 'movimientos'; renderFinanceProDashboard()`), /no cuentan en los saldos/);
});

// Un traspaso entre tus cuentas, lo que va o vuelve de la inversión (por su categoría o una creada a mano con ese
// nombre), los ahorros y los ajustes mueven dinero tuyo de sitio: ni ingreso, ni gasto, ni cambian la tasa de ahorro.
test('traspasos e inversión no cambian ingresos, gastos ni tasa de ahorro', () => {
    const { run } = cargarApp();
    run(`__vaciar({ bancos: 1000 });
        financePro.categories = [{ id: 'sueldo', name: 'Sueldo', type: 'income' }, { id: 'super', name: 'Supermercado', type: 'expense' },
            { id: 'cat_inversion_gasto', name: 'Inversiones', type: 'expense' }, { id: 'inv_mano', name: 'Inversiones', type: 'expense' }, { id: 'inv_vuelve', name: 'inversiones', type: 'income' }];
        globalThis.__meses = [finResMes(-2).clave, finResMes(-1).clave, finResMes(0).clave];
        __meses.forEach((m, i) => financePro.transactions.push(
            { id: 'n' + i, date: m + '-01', type: 'income', amount: 2000, category: 'sueldo', account: 'bancos' },
            { id: 'g' + i, date: m + '-01', type: 'expense', amount: 500 + i * 100, category: 'super', account: 'bancos' }));
        globalThis.__cifras = () => JSON.stringify({
            totales: __meses.map(m => financeProMonthTotals(m)),
            tasas: __meses.map(m => finResTasaAhorro(m)),
            historico: finResHistoricoAhorro().map(x => [x.clave, x.tasa]),
            stats: (({ curTotals, prevTotals, avgExpense, avgIncome, savingsRate }) => ({ curTotals, prevTotals, avgExpense, avgIncome, savingsRate }))(financeProStatsData()),
            gasto: asistGasto(__meses[0] + '-01', __meses[2] + '-31').reduce((s, t) => s + t.amount, 0),
            ritmo: ritmoMovimientos().length,
        });`);
    const antes = JSON.parse(run('__cifras()'));
    assert.deepEqual(antes.tasas, [75, 70, 65]);
    assert.deepEqual(antes.historico.map(x => x[1]), [75, 70], 'el histórico va del primer mes con movimientos al anterior, sin el de ahora');
    run(`__meses.forEach((m, i) => financePro.transactions.push(
            { id: 'tr' + i, date: m + '-05', type: 'transfer', amount: 300, account: 'bancos', transferTo: 'online' },
            { id: 'inv' + i, date: m + '-06', type: 'expense', amount: 250, category: 'cat_inversion_gasto', account: 'online' },
            { id: 'invm' + i, date: m + '-07', type: 'expense', amount: 50, category: 'inv_mano', account: 'online' },
            { id: 'invv' + i, date: m + '-08', type: 'income', amount: 80, category: 'inv_vuelve', account: 'online' },
            { id: 'ah' + i, date: m + '-09', type: 'expense', amount: 20, ahorro: true, account: 'online' },
            { id: 'ptx_adj_' + i, date: m + '-10', type: 'income', amount: 15, account: 'efectivo' }));
        financeSaldosCache = null;`);
    assert.deepEqual(JSON.parse(run('__cifras()')), antes);
    assert.match(run('finResPanelAhorro()'), /fin-res-cifra ">70,0 %[\s\S]*, en curso\./, 'la cifra grande es la del mes anterior y el de ahora va marcado');
});

// 0.25, salud de Finanzas (js/finanzas-salud.js): lo que GPT encontró en unas finanzas reales.
const SALUD = `__vaciar({ bancos: 1000, online: 100 });
    financePro.categories = financeProDefaultCategories();
    globalThis.__d = k => financeProSumarDias(todayISO(), -k);
    globalThis.__mes = todayISO().slice(0, 7);
    financePro.transactions.push(
        { id: 'compra', date: __d(5), account: 'online', type: 'expense', amount: 50, note: 'Zalando pedido', category: 'cat_compras' },
        { id: 'devuelve', date: __d(1), account: 'online', type: 'income', amount: 50, note: 'Zalando refund' },
        { id: 'sale', date: __d(2), account: 'bancos', type: 'expense', amount: 200, note: 'REVOLUT**1234' },
        { id: 'entra', date: __d(2), account: 'online', type: 'income', amount: 200, note: 'Top-up by *1234' },
        { id: 'hucha', date: __d(3), account: 'online', type: 'expense', amount: 30, note: 'To pocket EUR Ahorro' },
        { id: 'fcf', date: __d(3), account: 'online', type: 'income', amount: 40, note: 'Flexible Cash Funds withdrawal' },
        { id: 'fondo', date: __d(3), account: 'online', type: 'expense', amount: 150, note: 'MyInvestor aportación' },
        { id: 'bizum', date: __d(3), account: 'online', type: 'income', amount: 20, note: 'Bizum de Persona 2' });`;

test('salud: propone ahorro, inversión, traspaso y reembolso sin tocar nada hasta que se acepta', () => {
    const { run } = cargarApp();
    run(SALUD);
    const antes = run('JSON.stringify(financePro)');
    const p = JSON.parse(run('JSON.stringify(saludPropuestas().map(p => [p.tipo, p.t.id, p.con ? p.con.id : null]).sort())'));
    assert.deepEqual(p, [['ahorro', 'fcf', null], ['ahorro', 'hucha', null], ['inversion', 'fondo', null], ['reembolso', 'devuelve', 'compra'], ['traspaso', 'sale', 'entra']].sort());
    assert.equal(run('JSON.stringify(financePro)'), antes, 'proponer no cambia nada');
    assert.deepEqual(JSON.parse(run('JSON.stringify(saludPorRevisar().map(x => [x.t.id, x.motivo]))')), [['bizum', 'bizum recibido sin categoría.']]);
    assert.deepEqual(JSON.parse(run('JSON.stringify(financeProMonthTotals(__mes))')), { income: 310, expense: 430 });
    run(`saludAccion('propuestas', {})`);
    assert.deepEqual(JSON.parse(run('JSON.stringify(financeProMonthTotals(__mes))')), { income: 20, expense: 0 }, 'solo queda el Bizum como ingreso; la compra devuelta no es gasto');
    assert.equal(run(`financePro.transactions.find(t => t.id === 'sale').type`), 'transfer');
    assert.equal(run(`financePro.transactions.some(t => t.id === 'entra')`), false, 'el traspaso se guarda una vez');
    assert.equal(run(`JSON.stringify(saludPropuestas())`), '[]');
});

test('salud: un reembolso vinculado resta de la categoría de su compra y no es ingreso', () => {
    const { run } = cargarApp();
    run(SALUD);
    run(`saludAccion('resolver', { id: 'devuelve', como: 'reembolso', compra: 'compra' })`);
    assert.equal(run(`financeProCategoryExpense('cat_compras', __mes)`), 50);
    assert.equal(run(`financeProCategoryRefunds('cat_compras', __mes)`), 50);
    assert.equal(run(`financeProCategorySpend('cat_compras', __mes)`), 0);
    assert.equal(run(`financeProNeutro(financePro.transactions.find(t => t.id === 'devuelve'))`), true);
    assert.deepEqual(JSON.parse(run(`JSON.stringify(saludCosteNeto(__mes).find(c => c.id === 'cat_compras'))`)), { id: 'cat_compras', nombre: 'Compras', bruto: 50, devuelto: 50, neto: 0, destacada: true });
    assert.throws(() => run(`saludAccion('resolver', { id: 'compra', como: 'reembolso', compra: 'compra' })`), /Solo un ingreso/);
    run(`saludAccion('resolver', { id: 'bizum', como: 'bien' })`);
    assert.equal(run('saludPorRevisar().length'), 0, 'así está bien lo saca de por revisar');
});

test('salud: casillas repetidas del presupuesto, se avisan y se quitan', () => {
    const { run } = cargarApp();
    run(`__vaciar({ bancos: 0 });
        financePro.categories = financeProDefaultCategories();
        globalThis.__m1 = longtermMonthOffset(financeMonthKey(), 1);
        financeProfile.budgetPlans = { [__m1]: { salary: 150, contributions: 0, allocations: [
            { id: 'x1', label: 'Cuenta conjunta', amount: 100, categoryId: '' },
            { id: 'x2', label: 'cuenta conjunta', amount: 100, categoryId: '' },
            { id: 'x3', label: 'Ocio', amount: 60, categoryId: 'cat_ocio' }] } };
        financeProfile.budgetHistory = [];
        entries = [{ id: 's1', type: 'subscription', title: 'Música', amount: 10, renewalDay: 3, active: true }];`);
    const a = JSON.parse(run('JSON.stringify(saludPresupuestoAvisos(__m1))'));
    assert.deepEqual(a.duplicados.map(d => d.id), ['x2']);
    assert.equal(a.exceso, 120, '260 + 10 de suscripciones planificados con 150 de ingresos');
    assert.equal(JSON.parse(run('JSON.stringify(saludPresupuestosFuturos())')).length, 1);
    run(`saludAccion('quitarDuplicados', {})`);
    assert.deepEqual(JSON.parse(run('JSON.stringify(financeProfile.budgetPlans[__m1].allocations.map(a => a.id))')), ['x1', 'x3']);
    run(`financeProfile.budgetPlans[__m1].autoQuitadas = { subscription: true }`);
    assert.equal(JSON.parse(run('JSON.stringify(saludPresupuestoAvisos(__m1))')).suscripcionesFuera, 10);
    run(`saludAccion('reponerCompromisos', { mes: __m1 })`);
    assert.equal(run(`financeProfile.budgetPlans[__m1].allocations.some(a => a.auto === 'subscription')`), true);
});

test('salud: meses que cubre el fondo y reserva de estabilización', () => {
    const { run } = cargarApp();
    run(`__vaciar({ bancos: 0 });
        financePro.categories = financeProDefaultCategories();
        financeProfile.emergency = 300;
        [[-1, 1234, 400], [-2, 568, 380], [-3, 800, 420]].forEach(([k, ing, viv]) => {
            const m = longtermMonthOffset(financeMonthKey(), k);
            financePro.transactions.push({ id: 'i' + k, date: m + '-05', account: 'bancos', type: 'income', amount: ing, category: 'cat_sueldo' },
                { id: 'v' + k, date: m + '-06', account: 'bancos', type: 'expense', amount: viv, category: 'cat_vivienda' },
                { id: 'o' + k, date: m + '-07', account: 'bancos', type: 'expense', amount: 90, category: 'cat_ocio' });
        });`);
    const c = JSON.parse(run('JSON.stringify(saludColchones())'));
    assert.equal(c.esencialesMes, 400, 'solo lo esencial (vivienda), no el ocio');
    assert.equal(c.cubre, 0.8);
    assert.equal(c.objetivoFondo, 1200);
    assert.equal(c.estabilizacion.base, 800, 'la mediana de lo que entra');
    assert.equal(c.estabilizacion.objetivoPropuesto, 700, 'tres veces lo que falta en el peor mes, redondeado');
    run(`saludAccion('esenciales', { ids: ['cat_vivienda', 'cat_ocio'] })`);
    assert.equal(JSON.parse(run('JSON.stringify(saludColchones())')).esencialesMes, 490);
    run(`saludAccion('estabilizacion', { saldo: '200' })`);
    assert.deepEqual(JSON.parse(run('JSON.stringify(saludEstabilizacionMes(600))')), { usar: 200, reponer: 0 }, 'mes flojo: se usa lo que hay');
    assert.deepEqual(JSON.parse(run('JSON.stringify(saludEstabilizacionMes(1000))')), { usar: 0, reponer: 200 });
    assert.equal(run('activosTotales()'), run('saldoLiquido()') + 300 + 200, 'la reserva cuenta en los activos totales');
});

test('salud: reparto del día de cobro en orden y con la inversión por tramos', () => {
    const { run } = cargarApp();
    run(`__vaciar({ bancos: 0 });
        financePro.categories = financeProDefaultCategories();
        financeProfile.emergency = 300;
        financePro.salud = { ordinario: 500 };`);
    assert.deepEqual([600, 800, 1000].map(i => Number(run(`saludTramo(${i})`))), [50, 100, 150]);
    const r = JSON.parse(run('JSON.stringify(saludReparto(800))'));
    assert.deepEqual(r.pasos.map(p => [p.clave, p.importe]), [['ordinario', 500], ['estabilizacion', 0], ['emergencia', 150], ['inversion', 100], ['ocio', 50]]);
    assert.equal(r.pasos.reduce((s, p) => s + p.importe, 0), 800, 'se reparte todo, ni más ni menos');
    const flojo = JSON.parse(run('JSON.stringify(saludReparto(450))'));
    assert.equal(flojo.falta, 50);
    assert.deepEqual(flojo.pasos.map(p => p.importe), [450, 0, 0, 0, 0]);
    run(`saludAccion('cerrarMes', { respuestas: ['la cena del viernes', 'cocinar más'] })`);
    const cierre = JSON.parse(run('JSON.stringify(saludCierre())'));
    assert.equal(cierre.cerrado, true);
    assert.deepEqual(cierre.respuestas, ['la cena del viernes', 'cocinar más']);
    assert.equal(Object.keys(cierre.cifras).length, 7);
});

test('salud: ficha del fondo, suscripciones y esperas solo guardan lo que se escribe', () => {
    const { run } = cargarApp();
    run(`__vaciar({ bancos: 0 });
        financeProfile.investmentAccounts = [{ id: 'inv1', name: 'Fondo indexado', contributions: [] }];
        financeProfile.wishlist = [];
        entries = [{ id: 's1', type: 'subscription', title: 'Música', amount: 10, renewalDay: 3, active: true, date: '2020-01-01' }];`);
    assert.throws(() => run(`saludAccion('fichaFondo', { id: 'inv1', isin: 'XX12' })`), /ISIN/);
    assert.throws(() => run(`saludAccion('fichaFondo', { id: 'inv1', riesgo: 9 })`), /1 a 7/);
    run(`saludAccion('fichaFondo', { id: 'inv1', isin: 'ie00 b03hd191', indice: 'MSCI World', riesgo: '4', ter: '0,20' })`);
    assert.deepEqual(JSON.parse(run('JSON.stringify(financeProfile.investmentAccounts[0].fondo)')), { isin: 'IE00B03HD191', indice: 'MSCI World', riesgo: 4, ter: 0.2 });
    assert.equal(JSON.parse(run('JSON.stringify(saludSuscripcionesRevisar())'))[0].toca, true, 'sin revisar desde hace más de tres meses');
    run(`saludAccion('suscripcionRevisada', { id: 's1' }); saludAccion('suscripcionUso', { id: 's1' })`);
    assert.equal(JSON.parse(run('JSON.stringify(saludSuscripcionesRevisar())'))[0].toca, false);
    run(`saludAccion('esperar', { titulo: 'Cámara', precio: '300', dias: 7 })`);
    const w = JSON.parse(run('JSON.stringify(saludDeseos())'))[0];
    assert.equal(w.diasSugeridos, 7);
    assert.ok(w.horasQuedan > 160 && w.horasQuedan <= 168 && !w.listo);
});

test('salud: los fallos de la simulación con datos reales (reembolsos mal unidos, Bizums y reparto sin margen)', () => {
    const { run } = cargarApp();
    run(`__vaciar({ online: 0 });
        financePro.categories = financeProDefaultCategories();
        financePro.categories.push({ id: 'cat_comida_ing', name: 'Comida y bebida', type: 'income' });
        const d = k => financeProSumarDias(todayISO(), -k);
        financePro.transactions.push(
            { id: 'bolsillo', date: d(30), account: 'online', type: 'expense', amount: 20, note: 'To pocket EUR Arriesgados from EUR' },
            { id: 'paula', date: d(2), account: 'online', type: 'income', amount: 20, note: 'Transfer from PAULA GARCIA PEREZ' },
            { id: 'cena', date: d(20), account: 'online', type: 'expense', amount: 64, note: 'Bizum payment to: Damian M.C.' },
            { id: 'p1', date: d(10), account: 'online', type: 'income', amount: 50, note: 'Payment from A. PASCUAL PUENTE' },
            { id: 'r1', date: d(9), account: 'online', type: 'income', amount: 40, note: 'Tienda refund' },
            { id: 'r2', date: d(8), account: 'online', type: 'income', amount: 40, note: 'Tienda refund' },
            { id: 'tienda', date: d(15), account: 'online', type: 'expense', amount: 60, note: 'Tienda', category: 'cat_compras' },
            { id: 'b1', date: d(3), account: 'online', type: 'income', amount: 15, note: 'Money added via BIZUM' },
            { id: 'b2', date: d(3), account: 'online', type: 'income', amount: 12, note: 'Money added via BIZUM' },
            { id: 'sin', date: d(3), account: 'online', type: 'expense', amount: 3, note: 'El Quiosco', needsReview: true });`);
    const reembolsos = JSON.parse(run(`JSON.stringify(saludPropuestas().filter(p => p.tipo === 'reembolso').map(p => [p.t.id, p.con.id]))`));
    assert.deepEqual(reembolsos, [['r1', 'tienda']], 'ni un bolsillo es una compra, ni «payment» une nada, ni dos devoluciones de 40 caben en 60');
    const motivos = JSON.parse(run(`JSON.stringify(saludPorRevisar().map(x => x.t.id))`));
    assert.ok(!motivos.includes('sin'), 'un gasto sin categoría ya está en «por ajustar»');
    assert.ok(motivos.includes('b1') && motivos.includes('p1'));
    run(`saludAccion('bizums', { categoria: 'cat_comida_ing' })`);
    assert.equal(run(`saludBizumsRecibidos().length`), 0);
    assert.equal(run(`financeProNeutro(financePro.transactions.find(t => t.id === 'b1'))`), false, 'siguen siendo ingreso de su categoría');
    assert.equal(run(`financeProCategoryRefunds('cat_comida', todayISO().slice(0, 7))`) >= 27, true, 'y restan de lo gastado en comida y bebida');
    assert.equal(run(`saludEsencialesIds().has('cat_comida')`), true, 'comida y bebida es esencial por defecto');
    run(`financePro.salud = { ordinario: 853 }`);
    assert.equal(JSON.parse(run('JSON.stringify(saludReparto(800))')).sinMargen, true);
    assert.equal(JSON.parse(run('JSON.stringify(saludReparto(1200))')).sinMargen, false);
});


// ---- Importador 0.26 (auditoría de GPT del 19-11, casos-adversos-importador.mjs y uno por arreglo) ----
const nuevoImportador = () => {
    const app = cargarApp();
    app.importar = (datos, cuenta) => { app.ctx.__d = datos; return JSON.parse(app.run(`JSON.stringify(__importar(__d, ${JSON.stringify(cuenta)}))`)); };
    app.preparar = (datos, cuenta) => { app.ctx.__d = datos; app.run(`globalThis.__imp = financeProPrepararImport(__d, ${JSON.stringify(cuenta)}); renderFinanceProImportFilas(__imp)`); };
    app.movs = () => JSON.parse(app.run(`JSON.stringify(financePro.transactions.map(t => ({ id: t.id, account: t.account, type: t.type, amount: t.amount, note: t.note, bankNote: t.bankNote, pendiente: !!t.pendiente, conciliado: !!t.conciliado, transferTo: t.transferTo })))`));
    return app;
};

test('F-01: Status, Transaction Status, State y Estado; pendiente, anulado, hecho y desconocido', () => {
    const { run, importar, preparar, movs } = nuevoImportador();
    for (const cab of ['Status', 'Transaction Status', 'State', 'Estado']) {
        run(`__vaciar({ bancos: 0 })`);
        const r = importar(`Date,Description,Amount,${cab},Balance\n10/11/2026,Compra real,-10,COMPLETED,90\n11/11/2026,Cargo pendiente,-20,PENDING,70\n12/11/2026,Cargo anulado,-30,REVERTED,70\n12/11/2026,Otro anulado,-5,VOIDED,70\n12/11/2026,Rechazado,-6,REJECTED,70\n13/11/2026,Asentado,-1,SETTLED,69\n13/11/2026,Raro,-2,QUIZÁ,69`, 'bancos');
        const m = movs();
        assert.deepEqual(m.map(t => [t.note, t.amount, t.pendiente]).sort(), [['Asentado', 1, false], ['Cargo pendiente', 20, true], ['Compra real', 10, false]], cab);
        assert.equal(r.excluidas, 4, `${cab}: anuladas y el estado desconocido salen desmarcados`);
    }
    preparar(`Date,Description,Amount,Status\n13/11/2026,Raro,-2,QUIZÁ`, 'bancos');
    assert.match(run(`financeProFilasDelExtracto(__imp)[0].fuera`), /estado del banco/);
    run(`__vaciar({ bancos: 0 }); __imp.excluidas = new Set(); financeProEjecutarImport(__imp)`);
    assert.equal(run(`financePro.transactions.length`), 1, 'el estado desconocido entra si se marca a mano');
});

test('F-01: un pendiente que luego sale anulado se quita aunque su fila venga desmarcada', () => {
    const { run, importar } = nuevoImportador();
    run(`__vaciar({ online: 100 })`);
    const cab = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance';
    importar(`${cab}\nCard Payment,Current,2026-11-10 10:00:00,,Hotel,-50.00,0.00,EUR,PENDING,`, 'online');
    assert.equal(run(`financePro.transactions.length`), 1);
    const r = importar(`${cab}\nCard Payment,Current,2026-11-10 10:00:00,,Hotel,-50.00,0.00,EUR,REVERTED,`, 'online');
    assert.equal(r.anulados, 1);
    assert.equal(run(`financePro.transactions.length`), 0);
});

test('F-02: dos compras distintas del mismo importe y fechas cercanas son dos; lo idéntico sí sale desmarcado', () => {
    const { run, preparar } = nuevoImportador();
    run(`__vaciar({ bancos: 0 }); financePro.transactions.push({ id: 'viejo', date: '2026-11-10', account: 'bancos', type: 'expense', amount: 12.34, note: 'Panadería' })`);
    preparar(`Fecha,Concepto,Importe\n12/11/2026,Farmacia,-12.34\n10/11/2026,Panadería,-12.34`, 'bancos');
    assert.deepEqual(JSON.parse(run(`JSON.stringify([...__imp.excluidas])`)), [1], 'solo la panadería idéntica');
    assert.equal(run(`__imp.posibles.has(0)`), false, 'la panadería ya tiene su fila: la farmacia no se le parece');
    run(`financeProEjecutarImport(__imp)`);
    assert.equal(run(`financePro.transactions.length`), 2);
    run(`__vaciar({ bancos: 0 }); financePro.transactions.push({ id: 'viejo', date: '2026-11-10', account: 'bancos', type: 'expense', amount: 12.34, note: 'Panadería' })`);
    preparar(`Fecha,Concepto,Importe\n12/11/2026,Farmacia,-12.34`, 'bancos');
    assert.equal(run(`__imp.excluidas.size`), 0, 'caso de GPT: la farmacia sigue marcada');
    assert.match(run(`__imp.posibles.get(0) || ''`), /se parece a «Panadería»/, 'con un aviso');
    run(`__vaciar({ bancos: 0 }); financePro.transactions.push({ id: 'otro', date: '2026-11-11', account: 'online', type: 'expense', amount: 12.34, note: 'Panadería' })`);
    preparar(`Fecha,Concepto,Importe\n12/11/2026,Farmacia,-12.34`, 'bancos');
    assert.equal(run(`__imp.excluidas.size`), 0, 'un gasto de otra cuenta no tapa uno de esta');
});

test('F-02: dos gastos iguales el mismo día en la misma cuenta son dos', () => {
    const { run, importar } = nuevoImportador();
    run(`__vaciar({ bancos: 0 })`);
    importar(`Fecha,Concepto,Importe\n10/11/2026,Café,-1.60\n10/11/2026,Café,-1.60`, 'bancos');
    assert.equal(run(`financePro.transactions.length`), 2);
    assert.equal(importar(`Fecha,Concepto,Importe\n10/11/2026,Café,-1.60\n10/11/2026,Café,-1.60`, 'bancos').nuevos, 0);
});

test('F-03: un apunte a mano de otra cuenta no se funde por los céntimos; salud lo propone y se une al aceptarlo', () => {
    const { run, importar, movs } = nuevoImportador();
    run(`__vaciar({ bancos: 0, online: 0 }); financePro.transactions.push({ id: 'manual-online', date: '2026-11-10', account: 'online', type: 'expense', amount: 8.42, note: 'Café', manual: true })`);
    importar(`Fecha,Concepto,Importe\n10/11/2026,Farmacia,-8.42`, 'bancos');
    const m = movs();
    assert.equal(m.length, 2);
    assert.deepEqual(m.find(t => t.id === 'manual-online'), { id: 'manual-online', account: 'online', type: 'expense', amount: 8.42, note: 'Café', pendiente: false, conciliado: false });
    const p = JSON.parse(run(`JSON.stringify(saludPropuestas().filter(p => p.tipo === 'apunte').map(p => [p.t.id, p.con.note]))`));
    assert.deepEqual(p, [['manual-online', 'Farmacia']]);
    run(`saludAplicarPropuestas('apunte')`);
    assert.deepEqual(movs().map(t => [t.id, t.account, t.note, t.bankNote, t.conciliado]), [['manual-online', 'bancos', 'Café', 'Farmacia', true]]);
});

test('F-03: un apunte a mano se funde solo en su cuenta, o en otra si el concepto se parece', () => {
    const { run, importar, movs } = nuevoImportador();
    run(`__vaciar({ bancos: 0, online: 0 }); financePro.transactions.push({ id: 'm1', date: '2026-11-10', account: 'bancos', type: 'expense', amount: 5, note: 'parking', manual: true },
        { id: 'm2', date: '2026-11-10', account: 'online', type: 'expense', amount: 3.75, note: 'primaprix', manual: true })`);
    importar(`Fecha,Concepto,Importe\n11/11/2026,Zaragoza ApParca,-5.00\n10/11/2026,PAGO MOVIL EN PRIMAPRIX ZARAG,-3.75`, 'bancos');
    assert.deepEqual(movs().map(t => [t.id, t.account, t.bankNote, t.conciliado]).sort(), [['m1', 'bancos', 'Zaragoza ApParca', true], ['m2', 'bancos', 'PAGO MOVIL EN PRIMAPRIX ZARAG', true]]);
});

test('F-04: ajustar y fijar el saldo descuentan lo retenido, también con otra diferencia a la vez', async () => {
    const { run } = nuevoImportador();
    run(`__vaciar({ bancos: 0 }); closeModal = () => {}; render = () => {}; saveData = async () => {}; showToast = () => {};`);
    await run(`window._financeProCuadre = { esperado: 100, actual: 80, retenido: 10, hasta: '2026-11-12', cuenta: 'bancos' }; financeProAjustarAlExtracto()`);
    assert.equal(run(`financePro.transactions[0].amount`), 10);
    run(`__vaciar({ bancos: 0 })`);
    await run(`window._financeProCuadre = { esperado: 100, actual: 95, retenido: 10, hasta: '2026-11-12', cuenta: 'bancos' }; financeProAjustarAlExtracto()`);
    assert.deepEqual(JSON.parse(run(`JSON.stringify([financePro.transactions[0].type, financePro.transactions[0].amount])`)), ['expense', 5]);
    assert.equal(run(`financeProDiferenciaCuadre({ esperado: 100, actual: 80, retenido: 10 })`), 10);
    assert.equal(run(`financeProDiferenciaCuadre({ esperado: 100, actual: 80, retenido: 10, diff: 7 })`), 7);
});

test('F-08: el formato de fechas e importes se decide con todo el archivo y, si no se puede, se pregunta', () => {
    const { run, preparar } = nuevoImportador();
    run(`__vaciar({ bancos: 0 })`);
    preparar(`Date,Description,Amount\n04/05/2026,Shop,"1,234.56"\n04/13/2026,Shop,"1,234"`, 'bancos');
    assert.deepEqual(JSON.parse(run(`JSON.stringify([__imp.mapping.fechas, __imp.mapping.decimal, financeProFormatoListo(__imp)])`)), ['mdy', '.', true]);
    assert.deepEqual(JSON.parse(run(`JSON.stringify(financeProFilasDelExtracto(__imp).map(f => [f.date, f.val]))`)), [['2026-04-05', 1234.56], ['2026-04-13', 1234]]);
    preparar(`Fecha,Concepto,Importe\n04/05/2026,Tienda,"1,234"\n13/05/2026,Tienda,"2,50"`, 'bancos');
    assert.deepEqual(JSON.parse(run(`JSON.stringify(financeProFilasDelExtracto(__imp).map(f => [f.date, f.val]))`)), [['2026-05-04', 1.23], ['2026-05-13', 2.5]]);
    preparar(`Date,Description,Amount\n04/05/2026,Shop,"1,234"`, 'bancos');
    assert.deepEqual(JSON.parse(run(`JSON.stringify([__imp.formato.dudaFechas, __imp.formato.dudaDecimal, financeProListoParaImportar(__imp)])`)), [true, true, false]);
    run(`financeProElegirFormato(__imp, 'fechas', 'mdy'); financeProElegirFormato(__imp, 'decimal', '.')`);
    assert.equal(run(`financeProListoParaImportar(__imp)`), true);
    assert.deepEqual(JSON.parse(run(`JSON.stringify(financeProFilasDelExtracto(__imp).map(f => [f.date, f.val]))`)), [['2026-04-05', 1234]]);
    preparar(`Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\nCard Payment,Current,2026-05-04 10:00:00,2026-05-04 10:00:01,Shop,-1.234,0.00,EUR,COMPLETED,10`, 'online');
    assert.equal(run(`financeProFormatoListo(__imp)`), true, 'Revolut no pregunta');
});

test('F-10: una fila de hucha marcada a mano no entra en la cuenta', () => {
    const { run, preparar } = nuevoImportador();
    run(`__vaciar({ online: 0 })`);
    preparar(`Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\nTransfer,Savings,2026-11-10 10:00:00,2026-11-10 10:00:01,To pocket EUR Viaje,20.00,0.00,EUR,COMPLETED,20\nCard Payment,Current,2026-11-10 11:00:00,2026-11-10 11:00:01,Shop,-5.00,0.00,EUR,COMPLETED,95`, 'online');
    assert.equal(run(`financeProFilasDelExtracto(__imp)[0].bloqueada`), true);
    run(`window._financeProImport = __imp; renderFinanceProImportMapping = () => ''; financeProImportFila(0, true)`);
    assert.equal(run(`__imp.excluidas.has(0)`), true, 'la vista previa no deja marcarla');
    run(`__imp.excluidas = new Set(); financeProEjecutarImport(__imp)`);
    assert.deepEqual(JSON.parse(run(`JSON.stringify(financePro.transactions.map(t => t.note))`)), ['Shop'], 'y quien importa la vuelve a mirar');
});

test('F-11: sin columna de saldo se dice que no se ha podido comprobar', () => {
    const { run, preparar } = nuevoImportador();
    run(`__vaciar({ bancos: 0 })`);
    preparar(`Fecha,Concepto,Importe\n10/11/2026,Tienda,-5`, 'bancos');
    assert.equal(run(`financeProTieneSaldo(__imp)`), false);
    assert.match(run(`window._financeProImport = __imp; renderFinanceProImportMapping()`), /no trae la columna de saldo/);
});

test('F-13: cada movimiento nuevo lleva su lote y su fila; quitar el lote quita solo eso; el mismo archivo se reconoce', () => {
    const { run, importar, preparar } = nuevoImportador();
    run(`__vaciar({ bancos: 0 }); financePro.transactions.push({ id: 'mio', date: '2026-11-01', account: 'bancos', type: 'expense', amount: 3, note: 'a mano' })`);
    const csv = `Fecha,Concepto,Importe\n10/11/2026,Tienda,-5\n11/11/2026,Bar,-2`;
    const r = importar(csv, 'bancos');
    assert.deepEqual(JSON.parse(run(`JSON.stringify(financePro.transactions.filter(t => t.importLote === ${JSON.stringify(r.lote)}).map(t => [t.note, t.importFila, typeof t.importHuella]))`)), [['Tienda', 2, 'string'], ['Bar', 3, 'string']]);
    preparar(csv, 'bancos');
    assert.ok(run(`!!financeProLoteRepetido(__imp)`));
    assert.equal(run(`financeProQuitarLoteEn(${JSON.stringify(r.lote)})`), 2);
    assert.deepEqual(JSON.parse(run(`JSON.stringify(financePro.transactions.map(t => t.id))`)), ['mio']);
});

test('F-06: se puede importar a una cuenta que no es de las tres de siempre', () => {
    const { run, importar } = nuevoImportador();
    run(`__vaciar({}); financePro.accounts.myinv = { name: 'MyInvestor', balance0: 0 }`);
    importar(`Fecha,Concepto,Importe\n10/11/2026,Aportación,-50`, 'myinv');
    assert.equal(run(`financePro.transactions[0].account`), 'myinv');
    assert.ok(run(`financeProCuentasImportables().includes('myinv')`));
});

test('F-09: las hojas de un Excel van en el orden del libro, primero las visibles, y con las fechas de 1904', () => {
    const { run } = cargarApp();
    const libro = `<workbook xmlns:r="r"><workbookPr date1904="1"/><sheets><sheet name="Portada" r:id="rId1"/><sheet name="Oculta" state="hidden" r:id="rId2"/><sheet name="Movimientos" r:id="rId3"/></sheets></workbook>`;
    const rels = `<Relationships><Relationship Id="rId1" Target="worksheets/sheet3.xml"/><Relationship Id="rId2" Target="worksheets/sheet1.xml"/><Relationship Id="rId3" Target="/xl/worksheets/sheet2.xml"/></Relationships>`;
    const r = JSON.parse(run(`JSON.stringify(financeProHojasDelLibro(${JSON.stringify(libro)}, ${JSON.stringify(rels)}, ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml']))`));
    assert.deepEqual(r, { hojas: ['xl/worksheets/sheet3.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet1.xml'], fecha1904: true, visibles: 2 });
    assert.deepEqual(JSON.parse(run(`JSON.stringify(financeProHojasDelLibro('', '', ['xl/worksheets/sheet10.xml', 'xl/worksheets/sheet2.xml']))`)), { hojas: ['xl/worksheets/sheet2.xml', 'xl/worksheets/sheet10.xml'], fecha1904: false });
    assert.equal(run(`financeProEsCabecera(['Banco'])`), false);
    assert.equal(run(`financeProEsCabecera(['Fecha', 'Importe'])`), true);
});

// Lo que sacó la simulación con la exportación real del 29-10 y sus extractos de Ibercaja y Revolut.
test('con regla de traspaso: reimportar la recarga de Revolut ya conciliada con el traspaso de Ibercaja no la repite', () => {
    const { run, importar } = nuevoImportador();
    run(`__vaciar({ bancos: 1000, online: 0 }); financePro.rules = [{ id: 'r1', matchText: 'Top-up by *0000', otherAccount: 'bancos', enabled: true }];
        financePro.transactions.push({ id: 'tr', date: '2026-10-01', account: 'bancos', transferTo: 'online', type: 'transfer', amount: 300, note: 'Revolut**0000*' })`);
    const csv = `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\nTopup,Current,2026-09-29 07:57:44,2026-09-29 07:58:02,Top-up by *0000,300.00,0.00,EUR,COMPLETED,300.00`;
    importar(csv, 'online');
    importar(csv, 'online');
    assert.equal(run(`financePro.transactions.length`), 1, 'sigue habiendo un solo traspaso');
});

test('con regla de traspaso: la recarga unida a su mitad de Ibercaja lleva la fecha de la recarga y los dos extractos cuadran', () => {
    const { run, importar } = nuevoImportador();
    run(`__vaciar({ bancos: 1000, online: 0 }); financePro.rules = [{ id: 'r1', matchText: 'Top-up by *0000', otherAccount: 'bancos', enabled: true }]`);
    const ib = [['Nº Orden', 'Fecha Operacion', 'Fecha Valor', 'Concepto', 'Descripción', 'Referencia', 'Importe', 'Saldo'], ['1', '01/10/2026', '01/10/2026', 'TARJETA VISA', 'Revolut**0000*', '1', '-300,00', '700,00']];
    assert.equal(importar(ib, 'bancos').cuadre.cuadra, true);
    const r = importar(`Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\nTopup,Current,2026-09-29 07:57:44,2026-09-29 07:58:02,Top-up by *0000,300.00,0.00,EUR,COMPLETED,300.00`, 'online');
    assert.equal(r.cuadre.cuadra, true, 'Revolut cuadra a 30 de septiembre');
    assert.deepEqual(JSON.parse(run(`JSON.stringify(financePro.transactions.map(t => [t.type, t.date, t.account, t.transferTo]))`)), [['transfer', '2026-09-29', 'bancos', 'online']]);
    const otra = importar(ib, 'bancos');
    assert.equal(otra.nuevos, 0, 'reimportar Ibercaja no la repite');
    assert.equal(otra.cuadre.cuadra, true);
});

test('si Bitácora ya cuadra con el extracto, lo que solo se parece sale desmarcado y no se duplica', () => {
    const { run } = cargarApp();
    // Como en el Revolut del 22-11: el cargo se renombró a mano («Claude» → «Anthropic») y el saldo ya cuadraba.
    run(`__vaciar({ online: 100 }); financePro.transactions.push({ id: 'a', date: '2026-09-08', account: 'online', type: 'expense', amount: 21.78, note: 'Anthropic', bankNote: 'Anthropic' })`);
    const csv = `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\nCard Payment,Current,2026-09-08 15:26:34,2026-09-09 03:09:43,Claude,-21.78,0.00,EUR,COMPLETED,78.22`;
    const r = JSON.parse(run(`(() => { const imp = financeProPrepararImport(${JSON.stringify(csv)}, 'online'); renderFinanceProImportFilas(imp);
        return JSON.stringify({ cuadraAntes: imp.cuadraAntes, posible: imp.posibles.has(0), desmarcada: imp.excluidas.has(0) }); })()`));
    assert.deepEqual(r, { cuadraAntes: true, posible: true, desmarcada: true });
});
