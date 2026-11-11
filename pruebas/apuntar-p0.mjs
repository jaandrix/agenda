// Lo que «apuntar.» de la app nativa no debe guardar nunca (P0 de la 0.17): fechas que no existen, repeticiones
// imposibles, cosas sin contenido, órdenes de cambiar o borrar y preguntas. Corre el mismo entorno que JavaScriptCore
// (apuntar-entorno.js + js/apuntar.js + apuntar-puente.js): el puente deja el motivo en `r.error` y CrearApunte se niega.
// También que lo normal siga entrando (rangos que cruzan de año, importes con miles).
//     node --test pruebas/apuntar-p0.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const raiz = new URL('../', import.meta.url);
const ctx = { console };
vm.createContext(ctx);
for (const f of ['ios/BitacoraApp/BitacoraNative/Features/Apuntar/apuntar-entorno.js', 'js/apuntar.js', 'ios/BitacoraApp/BitacoraNative/Features/Apuntar/apuntar-puente.js'])
    vm.runInContext(readFileSync(new URL(f, raiz), 'utf8'), ctx, { filename: f });
vm.runInContext(`__fijarAhora(2026, 10, 5, 16); __contexto('{"uid":"u","categorias":[],"asignaturas":[]}');`, ctx);
const leer = f => JSON.parse(vm.runInContext(`__apuntar(${JSON.stringify(f)}, null)`, ctx)).map(c => c.r);

const BLOQUEAN = ['dentista el 31 de febrero', 'reunión 13/13/2026', 'cena el 32 de enero', 'cena el 32', 'dentista el 31',
    'regar cada 0 días', 'pagar alquiler el día 32 de cada mes', 'mañana', 'a las 5', '12 €',
    'viaje a Roma del 10 de mayo al 3 de abril', 'cancela la cita del dentista', 'mueve dentista al viernes', 'borra lo de ayer',
    'cambia la cena al sábado', '¿qué tengo mañana?'];
for (const f of BLOQUEAN) test(`no se guarda: «${f}»`, () => assert.ok(leer(f)[0].error, 'sin aviso'));

const ENTRAN = { 'cambiar el aceite del coche': {}, 'cancelar la suscripción de netflix': {}, 'pasar la aspiradora': {}, 'me han pagado 300': { importe: '300' },
    'gasté 1.500,50 € en el sofá': { importe: '1500.5' }, 'alquiler 1.500 €': { importe: '1500' }, 'café 2,40 €': { importe: '2.4' }, 'cena 12.50 €': { importe: '12.5' },
    'del 28 de diciembre al 2 de enero vacaciones en la playa': { fecha: '2026-12-28', fechaFin: '2027-01-02' }, 'del 28 al 2 de enero vacaciones en la playa': {},
    'el 29 de febrero de 2028 algo': { fecha: '2028-02-29' }, 'examen de estadística el 20 a las 9': {}, 'pagar el alquiler el 1': {}, 'cumple de Ana el 3 de mayo': {} };
for (const [f, esperado] of Object.entries(ENTRAN)) test(`entra: «${f}»`, () => {
    const c = leer(f)[0];
    assert.equal(c.error, undefined);
    for (const [k, v] of Object.entries(esperado)) assert.equal(c[k], v, k);
});

// P1 de la 0.19: prioridad dicha, varios importes, asignatura que no existe (con asignaturas), negaciones y días dictados.
vm.runInContext(`__contexto('{"uid":"u","categorias":[],"asignaturas":[{"id":"s0","name":"Estadística"}]}');`, ctx);
const todo = f => JSON.parse(vm.runInContext(`__apuntar(${JSON.stringify(f)}, null)`, ctx));
test('prioridad dicha: «llamar al banco prioridad alta»', () => { const c = leer('llamar al banco prioridad alta')[0]; assert.equal(c.prioridad, 'alta'); assert.equal(c.titulo, 'Llamar al banco'); });
test('urgente es prioridad alta', () => assert.equal(leer('urgente: renovar el dni')[0].prioridad, 'alta'));
test('dos importes son dos gastos', () => { const c = todo('gasté 12 en gasolina y 30 en comida'); assert.equal(c.length, 2); assert.deepEqual(c.map(x => x.tipo), ['gasto', 'gasto']); assert.deepEqual(c.map(x => x.r.importe), ['12', '30']); });
test('asignatura que no existe avisa', () => assert.match(leer('examen de Química el 20')[0].error, /Química/));
test('asignatura que existe entra', () => assert.equal(leer('examen de estadística el 20')[0].error, undefined));
for (const f of ['no tengo que ir al dentista mañana', 'ya no hay cena el viernes']) test(`negación no se guarda: «${f}»`, () => assert.ok(leer(f)[0].error));
test('«no olvidar comprar pan» entra', () => assert.equal(leer('no olvidar comprar pan')[0].error, undefined));
test('día dictado: «el día veinte»', () => assert.equal(leer('reunión el día veinte a las diez')[0].fecha, '2026-11-20'));
