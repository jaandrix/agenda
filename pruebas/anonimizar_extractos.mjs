// Convierte extractos reales en los de pruebas/extractos, que sí se publican. Los importes cambian con una tabla
// aleatoria que no se guarda: el mismo importe da siempre el mismo (las recargas siguen emparejando entre bancos) y uno
// redondo sigue siendo redondo. Conceptos, personas, cuentas y referencias se inventan; los saldos se rehacen.
//     node pruebas/anonimizar_extractos.mjs <carpeta> <revolut.csv>... -- <ibercaja.xlsx>...
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { leerXlsx } from './finanzas.mjs';

const salida = new URL('./extractos/', import.meta.url);
mkdirSync(salida, { recursive: true });
const [carpeta, ...resto] = process.argv.slice(2);
const corte = resto.indexOf('--');
const revolut = resto.slice(0, corte), ibercaja = resto.slice(corte + 1);

const tabla = new Map(), usados = new Set();
function importe(cent) {
    const abs = Math.abs(cent);
    if (!abs) return 0;
    if (!tabla.has(abs)) {
        let nuevo;
        do {
            nuevo = Math.max(1, Math.round(abs * (0.75 + Math.random() * 0.5)));
            if (abs % 100 === 0) nuevo = Math.max(100, Math.round(nuevo / 100) * 100);
        } while (usados.has(nuevo) && abs % 100 !== 0);
        usados.add(nuevo);
        tabla.set(abs, nuevo);
    }
    return Math.sign(cent) * tabla.get(abs);
}
const nombres = new Map();
const nombre = (texto, prefijo) => {
    const k = prefijo + texto.trim().toLowerCase();
    if (!nombres.has(k)) nombres.set(k, `${prefijo} ${nombres.size + 1}`);
    return nombres.get(k);
};
const fechaFalsa = t => t.replace(/20(\d\d)/g, (m, a) => String(2000 + +a - 3));
function concepto(d) {
    if (/^Top-up by \*/.test(d)) return 'Top-up by *0000';
    if (/^Money added via/.test(d)) return d;
    let m;
    if ((m = d.match(/^Bizum payment to: (.+)/))) return `Bizum payment to: ${nombre(m[1], 'Persona')}`;
    if ((m = d.match(/^Transfer from (.+)/))) return `Transfer from ${nombre(m[1], 'Persona')}`;
    if (/^(From|To) EUR /.test(d)) return `${d.split(' ')[0]} EUR Hucha`;
    if ((m = d.match(/^To (.+)/))) return `To ${nombre(m[1], 'Persona')}`;
    return nombre(d, 'Comercio');
}
const dinero = c => (c / 100).toFixed(2);

const archivos = revolut.map(f => {
    const l = readFileSync(join(carpeta, f), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
    return { f, cab: l[0], filas: l.slice(1).map(x => x.split(',')) };
});
// Un solo libro para todos los archivos: la misma fila lleva el mismo saldo en cada uno.
const clave = r => [r[2], r[4], r[5]].join('|');
const saldos = new Map();
let saldo = 20000;
archivos.forEach(a => a.filas.forEach(r => {
    if (r[8] !== 'COMPLETED' || r[1] !== 'Current' || saldos.has(clave(r))) return;
    saldo += importe(Math.round(r[5] * 100)) - Math.round(r[6] * 100);
    saldos.set(clave(r), saldo);
}));
archivos.forEach((a, i) => {
    const filas = a.filas.map(r => [r[0], r[1], fechaFalsa(r[2]), fechaFalsa(r[3]), concepto(r[4]), dinero(importe(Math.round(r[5] * 100))), r[6], r[7], r[8], saldos.has(clave(r)) && r[8] === 'COMPLETED' ? dinero(saldos.get(clave(r))) : ''].join(','));
    writeFileSync(new URL(`revolut-${i + 1}.csv`, salida), [a.cab, ...filas].join('\n') + '\n');
});

const euros = t => Math.round(+String(t).replace(/−/g, '-').replace(/\./g, '').replace(',', '.') * 100);
ibercaja.forEach((f, i) => {
    const rows = leerXlsx(join(carpeta, f));
    const cab = rows.findIndex(r => /Fecha Operacion/.test(r.join(' ')));
    const datos = rows.slice(cab + 1);
    const nuevos = datos.map(r => importe(euros(r[6])));
    let s = 100000 + nuevos.reduce((a, b) => a + b, 0);
    const filas = datos.map((r, k) => {
        const fila = [r[0], fechaFalsa(r[1]), fechaFalsa(r[2]), r[3], /^Revolut/i.test(r[4]) ? 'Revolut**0000*' : nombre(r[4], 'Comercio'), String(900000 + k), dinero(nuevos[k]).replace('.', ','), dinero(s).replace('.', ',')];
        s -= nuevos[k];
        return fila;
    });
    const previo = [['Consulta Movimientos de la Cuenta:', '20850000******000000'], ['Fecha de generación del informe en Banca'], ['Filtros', 'De 01/01/2023; a 31/10/2023; ']];
    const ancho = rows[cab].length;
    const todas = [...previo, rows[cab], ...filas].map(r => r.concat(Array(ancho - r.length).fill('')));
    writeFileSync(new URL(`ibercaja-${i + 1}.json`, salida), JSON.stringify(todas, null, 0).replace(/\],\[/g, '],\n[') + '\n');
});
console.log('hecho:', [...revolut, ...ibercaja].map(f => basename(f)).length, 'archivos');
