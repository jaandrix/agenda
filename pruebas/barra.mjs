// Nota de la barra de apuntar contra los casos de pruebas/casos-barra.json (hechos con DeepSeek a partir de
// pruebas/prompt-deepseek-barra.md). Pasa cada frase por el intérprete real (apuntarTrocear, interpretarApunte,
// apuntarTipo) y cada búsqueda por barraBuscar, con hoy = jueves 5 de noviembre de 2026, y enseña qué falla.
//     node pruebas/barra.mjs            (resumen y fallos)
// No es una prueba que deba pasar entera: los casos son de otra IA y alguno es discutible. Sirve para ver por dónde
// mejorar el intérprete y para no empeorarlo.
import { readFileSync } from 'node:fs';
import { cargarApp } from './finanzas.mjs';

const casos = JSON.parse(readFileSync(new URL('casos-barra.json', import.meta.url), 'utf8'));
const { run } = cargarApp();
run(`
    const _Date = Date;
    globalThis.Date = class extends _Date {
        constructor(...a) { super(...(a.length ? a : [2026, 10, 5, 16, 0, 0])); }
        static now() { return new _Date(2026, 10, 5, 16, 0, 0).getTime(); }
    };
    apartadosConfig = { perfil: 'ambos', opcionales: { compra: true, studies: true, culture: true } };
    studies = { subjects: ['Estadística', 'Historia del Arte', 'Inglés B2'].map((name, i) => ({ id: 's' + i, name, exams: [], assignments: [] })), schedule: {} };
`);

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
let ok = 0, total = 0;
const fallos = [];
for (const c of casos.apuntar) {
    total++;
    const salida = run(`apuntarTrocear(${JSON.stringify(c.frase)}).map(t => { const r = interpretarApunte(t); const tipo = apuntarTipo(r); return { tipo, titulo: r.titulo || '', fecha: r.fecha, hora: r.hora || null, hora_fin: r.horaFin || null, importe: r.importe ?? null, ingreso: !!r.ingreso }; })`);
    const esperado = c.cosas;
    const dif = [];
    if (salida.length !== esperado.length) dif.push(`${salida.length} cosas en vez de ${esperado.length}`);
    esperado.forEach((e, i) => {
        const s = salida[i];
        if (!s) return;
        if (s.tipo !== e.tipo) dif.push(`tipo ${s.tipo} (esperado ${e.tipo})`);
        if (e.fecha && s.fecha !== e.fecha && !['nota', 'serie', 'libro', 'peli', 'juego', 'compra'].includes(e.tipo)) dif.push(`fecha ${s.fecha} (esperada ${e.fecha})`);
        if ((e.hora || null) !== (s.hora || null)) dif.push(`hora ${s.hora} (esperada ${e.hora})`);
        if ((e.hora_fin || null) !== (s.hora_fin || null)) dif.push(`hora fin ${s.hora_fin} (esperada ${e.hora_fin})`);
        if ((e.importe ?? null) !== (s.importe ?? null)) dif.push(`importe ${s.importe} (esperado ${e.importe})`);
        if (e.tipo === 'gasto' && !!e.ingreso !== !!s.ingreso) dif.push(`ingreso ${s.ingreso} (esperado ${e.ingreso})`);
    });
    if (dif.length) fallos.push(`  · «${c.frase}» [${c.dificultad}]: ${dif.join('; ')}`); else ok++;
}
console.log(`apuntar: ${ok} de ${total} bien (${Math.round(ok / total * 100)} %)`);
fallos.forEach(f => console.log(f));

// Búsquedas sobre los datos del prompt
run(`
    const d = ${JSON.stringify([
        ['evento', 'Dentista', '2026-11-05', '18:30'], ['evento', 'Revisión con el médico de cabecera', '2026-11-08', '10:00'], ['evento', 'Fisio', '2026-10-31', '17:00'],
        ['evento', 'Cena con Marta', '2026-11-06', '21:00'], ['evento', 'Partido de pádel', '2026-11-10', '19:00'], ['evento', 'Concierto de Vetusta Morla', '2026-11-21', '21:30'],
    ])};
    entries = d.map(([, title, date, time], i) => ({ id: 'e' + i, type: 'event', title, date, time }));
    entries.push({ id: 'b1', type: 'birthday', title: 'Lucía', date: '2000-11-09', birthDate: '2000-11-09' });
    dayPlanner = { days: { '2026-11-05': [{ id: 't1', title: 'Llamar al banco', done: false }], '2026-11-12': [{ id: 't2', title: 'Pedir cita en el oculista', done: false }] }, backlog: [{ id: 't3', title: 'Renovar el DNI', done: false }] };
    studies.subjects[0].exams = [{ title: 'Examen', date: '2026-11-20', time: '09:00' }];
    financePro.transactions = [
        { id: 'g1', date: '2026-11-03', type: 'expense', amount: 42.5, note: 'Clínica dental', account: 'bancos' },
        { id: 'g2', date: '2026-11-04', type: 'expense', amount: 55, note: 'Gasolina Repsol', account: 'bancos' },
        { id: 'g3', date: '2026-11-02', type: 'expense', amount: 63.2, note: 'Mercadona', account: 'bancos' },
        { id: 'g4', date: '2026-10-31', type: 'income', amount: 1650, note: 'Nómina', account: 'bancos' }];
    notes = [{ id: 'n1', date: '2026-11-01', content: 'Ideas para el regalo de Lucía: libro de cocina, entradas de teatro' }];
    globalThis.getDayAllEntries = iso => entries.filter(e => e.date === iso || (e.type === 'birthday' && e.date.slice(5) === iso.slice(5)));
    barraCache = null;
`);
let okB = 0;
const fallosB = [];
for (const c of casos.buscar) {
    const titulos = run(`barraCache = null; barraBuscar(${JSON.stringify(c.frase.replace(/^\s*busca:\s*/i, ''))}).lista.map(x => x.titulo)`);
    const tiene = t => titulos.some(x => norm(x).includes(norm(t)) || norm(t).includes(norm(x)));
    const faltan = c.debe_encontrar.filter(t => !tiene(t));
    const sobran = c.no_debe_encontrar.filter(t => tiene(t));
    if (faltan.length || sobran.length) fallosB.push(`  · «${c.frase}»: ${faltan.length ? 'faltan ' + faltan.join(', ') : ''}${faltan.length && sobran.length ? '; ' : ''}${sobran.length ? 'sobran ' + sobran.join(', ') : ''}`);
    else okB++;
}
console.log(`\nbuscar: ${okB} de ${casos.buscar.length} bien (${Math.round(okB / casos.buscar.length * 100)} %)`);
fallosB.forEach(f => console.log(f));
