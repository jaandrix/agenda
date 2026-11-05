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

    test('una recarga entre tus bancos es un traspaso sin tener reglas', { todo: 'a 2 o 3 días y con el concepto «Revolut**…» en Ibercaja no se empareja: cuenta como gasto y como ingreso para quien aún no tenga la regla' }, () => {
        vaciar({ online: aperturaRevolut(), bancos: aperturaIbercaja() });
        importar(IBERCAJA, 'bancos'); REVOLUT.forEach(e => importar(e, 'online'));
        assert.equal(run(`financePro.transactions.filter(t => t.type === 'income' && /Top-up/.test(t.note || '')).length`), 0);
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
