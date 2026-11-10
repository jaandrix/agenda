// Un extracto importado en el iPhone no entra otra vez al importarlo en la web (P0 de la 0.17). La app nativa escribe
// cada fila como en ImportadorFinanzas.operaciones + importarFila (Operaciones.swift): cuenta, fecha, importe y nota con
// el concepto del banco, sin claveImport. El otro sentido (web y luego iPhone) lo prueba ImportadorFinanzasTests.
//     node --test pruebas/importar-ios-web.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargarApp } from './finanzas.mjs';

const { ctx, run } = cargarApp();
const CSV = 'Fecha;Concepto;Importe\n09/11/2026;Nómina;1.250,50\n10/11/2026;Mercado;-34,20\n10/11/2026;Mercado;-34,20\n11/11/2026;Café;-2,00\n';
const DEL_IPHONE = [
    { id: 'ptx_imp_a', date: '2026-11-09', account: 'bancos', type: 'income', amount: 1250.5, manual: false, needsReview: true, note: 'Nómina' },
    { id: 'ptx_imp_b', date: '2026-11-10', account: 'bancos', type: 'expense', amount: 34.2, manual: false, needsReview: true, note: 'Mercado' },
    { id: 'ptx_imp_c', date: '2026-11-10', account: 'bancos', type: 'expense', amount: 34.2, manual: false, needsReview: true, note: 'Mercado' },
    { id: 'ptx_imp_d', date: '2026-11-11', account: 'bancos', type: 'expense', amount: 2, manual: false, needsReview: true, note: 'Café' },
];
const importar = () => { ctx.__datos = CSV; return run(`__importar(__datos, 'bancos')`); };

test('la web lee el extracto como el iPhone', () => {
    run('__vaciar()');
    assert.equal(importar().nuevos, 4);
    const web = run(`JSON.stringify(financePro.transactions.map(t => [t.account, t.date, t.type, t.amount, t.note]))`);
    assert.equal(web, JSON.stringify(DEL_IPHONE.map(t => [t.account, t.date, t.type, t.amount, t.note])));
});

test('lo importado en el iPhone no se duplica en la web', () => {
    run('__vaciar()');
    ctx.__tx = DEL_IPHONE;
    run('financePro.transactions = JSON.parse(JSON.stringify(__tx))');
    assert.equal(importar().nuevos, 0);
});

