// Pruebas de la fusión entre dispositivos (datos.js) con la app real cargada en Node: node --test pruebas/sincronizar.mjs.
// Las lanza también comprobar.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargarApp } from './finanzas.mjs';

const { ctx, run } = cargarApp();
const fusionar = (base, local, nube) => {
    ctx.__f = { base, local, nube };
    return run(`(() => {
        datosBase = { dayPlanner: JSON.parse(JSON.stringify(__f.base)) };
        dayPlanner = JSON.parse(JSON.stringify(__f.local));
        resetDayPlannerIfNeeded();
        aplicarFusionConNube({ dayPlanner: JSON.parse(JSON.stringify(__f.nube)) });
        return JSON.parse(JSON.stringify(dayPlanner));
    })()`);
};
const hoy = run('currentPlannerDayKey()'), ayer = run('currentPlannerDayKey(new Date(), -1)');
const tarea = extra => ({ id: 'planner_1', title: 'llamar', notes: '', done: false, ...extra });

test('una tarea marcada en el ordenador sigue marcada cuando el móvil la arrastra a hoy', () => {
    const r = fusionar({ days: { [ayer]: [tarea()] }, backlog: [] },
        { days: { [ayer]: [tarea()] }, backlog: [] },
        { days: { [hoy]: [tarea({ arrastrado: true, done: true, hechaEn: 1 })] }, backlog: [] });
    assert.equal(r.days[hoy].find(t => t.id === 'planner_1')?.done, true);
});

test('una tarea marcada ayer en el ordenador no vuelve a hoy sin marcar', () => {
    const r = fusionar({ days: { [ayer]: [tarea()] }, backlog: [] },
        { days: { [ayer]: [tarea()] }, backlog: [] },
        { days: { [ayer]: [tarea({ done: true, hechaEn: 1 })] }, backlog: [] });
    assert.equal((r.days[hoy] || []).some(t => t.id === 'planner_1' && !t.done), false);
});

test('una tarea marcada en el ordenador y otra añadida en el móvil se quedan las dos', () => {
    const r = fusionar({ days: { [hoy]: [tarea()] }, backlog: [] },
        { days: { [hoy]: [tarea(), { id: 'planner_2', title: 'comprar', notes: '', done: false }] }, backlog: [] },
        { days: { [hoy]: [tarea({ done: true, hechaEn: 1 })] }, backlog: [] });
    assert.equal(r.days[hoy].find(t => t.id === 'planner_1')?.done, true);
    assert.ok(r.days[hoy].some(t => t.id === 'planner_2'));
});
