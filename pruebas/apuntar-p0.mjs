// Lo que «apuntar.» no debe guardar nunca (P0 del plan de la 0.17): fechas que no existen, repeticiones imposibles,
// cosas sin contenido, órdenes de cambiar o borrar y preguntas. El intérprete deja el motivo en `r.error` y apuntarCrear
// se niega. También que lo normal siga entrando (los rangos que cruzan de año, los importes con miles).
//     node --test pruebas/apuntar-p0.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargarApp } from './finanzas.mjs';

const { run } = cargarApp();
run(`const _D = Date; globalThis.Date = class extends _D { constructor(...a) { super(...(a.length ? a : [2026, 10, 5, 16, 0, 0])); } static now() { return new _D(2026, 10, 5, 16).getTime(); } };`);
const leer = f => run(`apuntarTrocear(${JSON.stringify(f)}).map(t => { const r = interpretarApunte(t); return { error: r.error, importe: r.importe, fecha: r.fecha, fechaFin: r.fechaFin, crea: apuntarCrear(t, r, apuntarTipo(r)).error || '' }; })`);

const BLOQUEAN = ['dentista el 31 de febrero', 'reunión 13/13/2026', 'cena el 32 de enero', 'cena el 32', 'dentista el 31',
    'regar cada 0 días', 'pagar alquiler el día 32 de cada mes', 'mañana', 'a las 5', '12 €',
    'viaje a Roma del 10 de mayo al 3 de abril', 'cancela la cita del dentista', 'mueve dentista al viernes', 'borra lo de ayer',
    'cambia la cena al sábado', '¿qué tengo mañana?'];
for (const f of BLOQUEAN) test(`no se guarda: «${f}»`, () => {
    const [c] = leer(f);
    assert.ok(c.error, 'sin aviso');
    assert.equal(c.crea, c.error);
});

const ENTRAN = { 'cambiar el aceite del coche': {}, 'cancelar la suscripción de netflix': {}, 'pasar la aspiradora': {}, 'me han pagado 300': { importe: 300 },
    'gasté 1.500,50 € en el sofá': { importe: 1500.5 }, 'alquiler 1.500 €': { importe: 1500 }, 'café 2,40 €': { importe: 2.4 }, 'cena 12.50 €': { importe: 12.5 },
    'del 28 de diciembre al 2 de enero vacaciones en la playa': { fecha: '2026-12-28', fechaFin: '2027-01-02' }, 'del 28 al 2 de enero vacaciones en la playa': {},
    'el 29 de febrero de 2028 algo': { fecha: '2028-02-29' } };
for (const [f, esperado] of Object.entries(ENTRAN)) test(`entra: «${f}»`, () => {
    const [c] = leer(f);
    assert.equal(c.error, '');
    for (const [k, v] of Object.entries(esperado)) assert.equal(c[k], v, k);
});
