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

const fusionarListas = (base, local, nube) => {
    ctx.__f = { base, local, nube };
    // Se pasa como texto: los arreglos del contexto de la app no son los de Node y deepEqual los daría por distintos.
    return JSON.parse(run(`(() => {
        datosBase = { listasPanorama: JSON.parse(JSON.stringify(__f.base)) };
        listasPanorama = JSON.parse(JSON.stringify(__f.local));
        aplicarFusionConNube({ listasPanorama: JSON.parse(JSON.stringify(__f.nube)) });
        listasNormalizar();
        return JSON.stringify(listasPanorama);
    })()`));
};
const nodo = (id, texto, hijos = [], extra = {}) => ({ id, texto, hecha: false, hijos, ...extra });
const cajas = () => [
    { id: 'lst_a', titulo: 'casa', tareas: [nodo('lt_1', 'pintar', [nodo('lt_2', 'comprar pintura')])] },
    { id: 'lst_b', titulo: 'trabajo', tareas: [nodo('lt_3', 'informe')] },
];

test('listas: dos dispositivos que tocan cajas distintas no se pisan', () => {
    const local = cajas(); local[0].tareas[0].hijos[0].hecha = true;
    const nube = cajas(); nube[1].tareas.push(nodo('lt_4', 'llamar'));
    const r = fusionarListas(cajas(), local, nube);
    assert.equal(r.find(c => c.id === 'lst_a').tareas[0].hijos[0].hecha, true);
    assert.deepEqual(r.find(c => c.id === 'lst_b').tareas.map(t => t.id), ['lt_3', 'lt_4']);
});

test('listas: una subtarea añadida en cada lado a la misma tarea se quedan las dos', () => {
    const local = cajas(); local[0].tareas[0].hijos.push(nodo('lt_5', 'rodillo'));
    const nube = cajas(); nube[0].tareas[0].hijos.push(nodo('lt_6', 'cinta'));
    const r = fusionarListas(cajas(), local, nube);
    assert.deepEqual(r[0].tareas[0].hijos.map(t => t.id), ['lt_2', 'lt_5', 'lt_6']);
});

test('listas: una caja borrada en un lado y sin tocar en el otro se va', () => {
    const local = cajas().slice(0, 1);
    const r = fusionarListas(cajas(), local, cajas());
    assert.deepEqual(r.map(c => c.id), ['lst_a']);
});

test('listas: una tarea movida de padre en un lado y editada en el otro no sale dos veces', () => {
    const local = cajas(); const [sub] = local[0].tareas[0].hijos.splice(0, 1); local[1].tareas.push(sub);
    const nube = cajas(); nube[0].tareas[0].hijos[0].texto = 'comprar pintura blanca';
    const r = fusionarListas(cajas(), local, nube);
    const ids = JSON.stringify(r).match(/"lt_2"/g) || [];
    assert.equal(ids.length, 1);
});
