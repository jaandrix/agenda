// Finanzas de la app nativa (MotorFinanzas.swift): el mismo código de la web, cargado como en JavaScriptCore (con
// finanzas-entorno.js, los archivos de MotorFinanzas.archivos y finanzas-puente.js), da lo mismo que la web completa.
// Importar pasa por la diferencia que la app convierte en operaciones (CambioFinanzas): aquí se aplica igual que en
// Swift (aplicar), y el resultado tiene que ser el de importar en la web.
//     node --test pruebas/finanzas-ios.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { cargarApp } from './finanzas.mjs';

const raiz = new URL('..', import.meta.url);
const carpeta = new URL('ios/BitacoraApp/BitacoraNative/Features/Finanzas/', raiz);
const leer = u => readFileSync(u, 'utf8');
const archivos = [...leer(new URL('MotorFinanzas.swift', carpeta)).match(/static let archivos = \[([^\]]+)\]/)[1].matchAll(/"([\w-]+)"/g)].map(m => m[1]);

export function cargarMotor() {
    const ctx = {};
    vm.createContext(ctx);
    // JavaScriptCore no tiene structuredClone ni TextDecoder: el entorno los pone.
    vm.runInContext('delete globalThis.structuredClone;', ctx);
    vm.runInContext(leer(new URL('finanzas-entorno.js', carpeta)), ctx);
    archivos.forEach(f => vm.runInContext(leer(new URL(`js/${f}.js`, raiz)), ctx, { filename: f }));
    vm.runInContext(leer(new URL('finanzas-puente.js', carpeta)), ctx);
    return c => vm.runInContext(c, ctx);
}

// Lo mismo que CambioFinanzas.aplicar en Swift.
export function aplicar(estado, c) {
    const pro = estado.financePro;
    const lista = pro.transactions;
    for (const id of c.movimientos.quitar) { const i = lista.findIndex(t => String(t.id) === id); if (i >= 0) lista.splice(i, 1); }
    for (const x of c.movimientos.cambiar) {
        const t = lista.find(t => String(t.id) === x.id);
        if (!t) continue;
        Object.assign(t, x.poner);
        x.quitar.forEach(k => delete t[k]);
    }
    for (const { t } of c.movimientos.anadir) if (!lista.some(y => String(y.id) === String(t.id))) lista.push(t);
    Object.entries(c.pro).forEach(([k, v]) => { if (v === null) delete pro[k]; else pro[k] = v; });
    Object.entries(c.perfil).forEach(([k, v]) => { if (v === null) delete estado.financeProfile[k]; else estado.financeProfile[k] = v; });
    const ent = estado.entries;
    for (const id of c.entradas.quitar) { const i = ent.findIndex(e => String(e.id) === id); if (i >= 0) ent.splice(i, 1); }
    for (const x of c.entradas.cambiar) { const e = ent.find(e => String(e.id) === x.id); if (e) { Object.assign(e, x.poner); x.quitar.forEach(k => delete e[k]); } }
    for (const e of c.entradas.anadir) if (!ent.some(y => String(y.id) === String(e.id))) ent.push(e);
}

const extracto = f => readFileSync(new URL(`pruebas/extractos/${f}`, raiz), 'utf8');
const REVOLUT = ['revolut-1.csv', 'revolut-2.csv', 'revolut-3.csv'].map(extracto);
const IBERCAJA = JSON.parse(extracto('ibercaja-1.json'));
const numero = t => +String(t).replace(',', '.');
const aperturaRevolut = () => { const c = REVOLUT[0].trim().split('\n')[1].split(','); return +(+c[9] - +c[5]).toFixed(2); };
const aperturaIbercaja = () => { const u = IBERCAJA[IBERCAJA.length - 1]; return +(numero(u[7]) - numero(u[6])).toFixed(2); };
const base = () => ({
    financePro: { enabled: true, accounts: { efectivo: { name: 'Efectivo', balance0: 0 }, bancos: { name: 'Ibercaja', balance0: aperturaIbercaja() }, online: { name: 'Revolut', balance0: aperturaRevolut() } }, categories: [], transactions: [], categoryBudgets: {}, rules: [], programados: [] },
    financeProfile: {}, entries: [],
});

function importarEnMotor(run, estado, datos, cuenta) {
    run(`__fin.cargar(${JSON.stringify(JSON.stringify(estado.financePro))}, ${JSON.stringify(JSON.stringify(estado.entries))}, ${JSON.stringify(JSON.stringify(estado.financeProfile))}, null)`);
    const texto = typeof datos === 'string' ? datos : JSON.stringify(datos);
    const vista = JSON.parse(run(`__fin.importarPreparar(${JSON.stringify(texto)}, ${JSON.stringify(cuenta)})`));
    const r = JSON.parse(run('__fin.importarEjecutar()'));
    if (r.cambios) aplicar(estado, r.cambios);
    return { vista, ...r.resultado };
}

const resumen = txs => JSON.stringify(txs.map(t => [t.account, t.transferTo || '', t.date, t.type, t.amount, t.note || '', !!t.pendiente]).sort());

test('importar en el iPhone da lo mismo que en la web', () => {
    const run = cargarMotor();
    const estado = base();
    REVOLUT.forEach(e => importarEnMotor(run, estado, e, 'online'));
    importarEnMotor(run, estado, IBERCAJA, 'bancos');
    const web = cargarApp();
    web.run(`__vaciar(${JSON.stringify({ online: aperturaRevolut(), bancos: aperturaIbercaja() })})`);
    REVOLUT.forEach(e => { web.ctx.__datos = e; web.run(`__importar(__datos, 'online')`); });
    web.ctx.__datos = IBERCAJA; web.run(`__importar(__datos, 'bancos')`);
    assert.equal(resumen(estado.financePro.transactions), resumen(JSON.parse(web.run('JSON.stringify(financePro.transactions)'))));
});

test('reimportar en el iPhone no añade nada y cuadra con el saldo', () => {
    const run = cargarMotor();
    const estado = base();
    assert.equal(importarEnMotor(run, estado, REVOLUT[0], 'online').cuadre.cuadra, true);
    const r = importarEnMotor(run, estado, REVOLUT[0], 'online');
    assert.equal(r.nuevos, 0);
    assert.equal(importarEnMotor(run, estado, IBERCAJA, 'bancos').cuadre.cuadra, true);
    assert.equal(importarEnMotor(run, estado, IBERCAJA, 'bancos').nuevos, 0);
});

test('las cuatro pestañas, la búsqueda y el gestor salen sin errores', () => {
    const run = cargarMotor();
    const estado = base();
    REVOLUT.forEach(e => importarEnMotor(run, estado, e, 'online'));
    estado.entries.push({ id: 'sub_1', type: 'subscription', title: 'Netflix', amount: 12.99, renewalDay: 3, active: true });
    run(`__fin.cargar(${JSON.stringify(JSON.stringify(estado.financePro))}, ${JSON.stringify(JSON.stringify(estado.entries))}, '{}', null)`);
    for (const tab of ['cuentas', 'movimientos', 'planificacion', 'resumen']) {
        const m = JSON.parse(run(`__fin.pestana('${tab}', '{"rango":"6m","n":30}')`));
        assert.ok(m && typeof m === 'object', tab);
    }
    const cuentas = JSON.parse(run(`__fin.pestana('cuentas', '{"rango":"all"}')`));
    assert.equal(cuentas.cuentas.find(c => c.id === 'online').saldo, run(`financeProAccountBalance('online')`));
    assert.ok(JSON.parse(run(`__fin.buscar('{"search":"a"}')`)).total > 0);
    assert.equal(JSON.parse(run('__fin.gestor()')).activas.length, 1);
    const baja = JSON.parse(run(`__fin.suscripcion('sub_1', 'baja')`));
    assert.equal(baja.cambios.entradas.cambiar[0].poner.active, false);
    assert.equal(JSON.parse(run('__fin.gestor()')).activas.length, 1, 'el motor no guarda: la baja vuelve como cambio');
});

test('preparar Finanzas es idempotente', () => {
    const run = cargarMotor();
    const estado = base();
    importarEnMotor(run, estado, REVOLUT[0], 'online');
    estado.entries.push({ id: 'sub_1', type: 'subscription', title: 'Netflix', amount: 12.99, renewalDay: 1, active: true, proAccount: 'online' });
    const cargar = () => run(`__fin.cargar(${JSON.stringify(JSON.stringify(estado.financePro))}, ${JSON.stringify(JSON.stringify(estado.entries))}, ${JSON.stringify(JSON.stringify(estado.financeProfile))}, null)`);
    cargar();
    const p = JSON.parse(run('__fin.preparar()'));
    if (p.cambios) aplicar(estado, p.cambios);
    cargar();
    const otra = JSON.parse(run('__fin.preparar()'));
    assert.equal(otra.cambios, null);
});

test('editar en el iPhone un movimiento importado no lo duplica al reimportar', () => {
    const run = cargarMotor();
    const estado = base();
    importarEnMotor(run, estado, REVOLUT[0], 'online');
    const t = estado.financePro.transactions.find(x => x.type === 'expense' && !x.pendiente);
    const notaBanco = t.note;
    const cargar = () => run(`__fin.cargar(${JSON.stringify(JSON.stringify(estado.financePro))}, ${JSON.stringify(JSON.stringify(estado.entries))}, '{}', null)`);
    cargar();
    const d = JSON.parse(run(`__fin.movimientoDatos(${JSON.stringify(String(t.id))}, '')`));
    assert.equal(d.existe, true);
    const r = JSON.parse(run(`__fin.guardarMovimiento(${JSON.stringify(JSON.stringify({ ...d, id: String(t.id), nota: 'otra cosa', viaje: true }))})`));
    aplicar(estado, r.cambios);
    const e = estado.financePro.transactions.find(x => x.id === t.id);
    assert.equal(e.note, 'otra cosa');
    assert.equal(e.bankNote, notaBanco);
    assert.equal(e.viaje, true);
    assert.equal(importarEnMotor(run, estado, REVOLUT[0], 'online').nuevos, 0);
    cargar();
    const b = JSON.parse(run(`__fin.borrarMovimiento(${JSON.stringify(String(t.id))})`));
    assert.deepEqual(b.cambios.movimientos.quitar, [String(t.id)]);
});
