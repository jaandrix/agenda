// Banco dorado de «apuntar.» para la app nativa: pasa las frases de casos-barra.json y unas cuantas más por el
// intérprete de la web (la app entera cargada en Node) y por el entorno de la app nativa (apuntar-entorno.js +
// js/apuntar.js + apuntar-puente.js, lo mismo que corre en JavaScriptCore). Si difieren, falla; si no, escribe
// pruebas/apuntar-casos.json, que los tests de Swift comparan con lo que da el iPhone.
//     node pruebas/apuntar-casos.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { cargarApp } from './finanzas.mjs';

const raiz = new URL('../', import.meta.url);
const leer = r => readFileSync(new URL(r, raiz), 'utf8');
const AHORA = [2026, 10, 5, 16];
const contexto = {
    uid: 'u',
    categorias: [{ id: 'c_trans', type: 'expense', name: 'Transporte' }, { id: 'c_comida', type: 'expense', name: 'Comida' },
                 { id: 'c_ocio', type: 'expense', name: 'Ocio' }, { id: 'c_nomina', type: 'income', name: 'Nómina' }],
    asignaturas: [{ id: 's0', name: 'Estadística' }, { id: 's1', name: 'Historia del Arte' }, { id: 's2', name: 'Inglés B2' }, { id: 's3', name: 'Psicología' }],
    ocultos: [],
};
const extra = [
    'cena con Marta el viernes a las 9 en La Pepita', 'dentista mañana a las 5 y comprar pan y leche', 'gasté doce euros en gasolina en efectivo',
    'ingreso nómina 1500 en revolut', 'cumple de Ana el 3 de mayo', 'examen de estadística el 20 a las 9', 'entregar trabajo de psicología el 25',
    'gimnasio todos los lunes y jueves a las 19', 'clase de inglés los martes a las 18', 'viaje a Lisboa del 3 al 7 de noviembre',
    'serie Los hombres de Paco', 'nota: idea para el proyecto', 'comida con Lali y Paco a las 13:30', 'llamar a Ana a las 5',
    'libro El infinito en un junco', 'peli Dune', 'juego Zelda', 'café 2,40 €', 'del 28 al 2 de enero vacaciones en la playa', 'el 29 de febrero de 2028 algo',
    'reunión a las 00:30', 'mañana a las 3 de la madrugada vuelo', 'cada 15 días regar los cactus', 'el día 5 de cada mes pagar el alquiler',
    'pagar la luz el 15', 'veinticinco euros de regalo', 'cumpleaños de Lucía el 14 de marzo de 1995', 'se ha acabado el aceite',
    'uno; dos; tres; cuatro; cinco; seis; siete; ocho; nueve; diez; once; doce; trece; catorce',
    'añadir a la compra huevos, harina y azúcar', 'mañana por la tarde peluquería', 'esta noche cine con Pablo', 'de 18 a 20 partido de pádel el sábado',
    'tengo que mandar el informe el lunes', 'Ñandú también acentos áéíóú', 'x'.repeat(2000),
];
const frases = [...new Set([...JSON.parse(leer('pruebas/casos-barra.json')).apuntar.map(c => c.frase), ...extra])];

// La web.
const { run } = cargarApp();
run(`
    const _Date = Date;
    globalThis.Date = class extends _Date {
        constructor(...a) { super(...(a.length ? a : [${AHORA}, 0, 0])); }
        static now() { return new _Date(${AHORA}, 0, 0).getTime(); }
    };
    apartadosConfig = { perfil: 'ambos', opcionales: { compra: true, studies: true, culture: true } };
    studies = { subjects: ${JSON.stringify(contexto.asignaturas)}.map(s => ({ ...s, exams: [], assignments: [] })), schedule: {} };
    financePro.categories = ${JSON.stringify(contexto.categorias)};
    copiaUid = 'u';
`);
run(leer('ios/BitacoraApp/BitacoraNative/Features/Apuntar/apuntar-puente.js').replace(/^const __TIPOS/m, 'var __TIPOS').replace(/^function __contexto[\s\S]*?\n}\n/m, ''));
const web = frases.map(f => JSON.parse(run(`__apuntar(${JSON.stringify(f)}, null)`)));

// El entorno de la app nativa.
const ctx = { console };
vm.createContext(ctx);
for (const f of ['ios/BitacoraApp/BitacoraNative/Features/Apuntar/apuntar-entorno.js', 'js/apuntar.js', 'ios/BitacoraApp/BitacoraNative/Features/Apuntar/apuntar-puente.js']) vm.runInContext(leer(f), ctx, { filename: f });
vm.runInContext(`__fijarAhora(${AHORA}); __contexto(${JSON.stringify(JSON.stringify(contexto))});`, ctx);
const nativa = frases.map(f => JSON.parse(vm.runInContext(`__apuntar(${JSON.stringify(f)}, null)`, ctx)));

let distintos = 0;
frases.forEach((f, i) => {
    const a = JSON.stringify(web[i]), b = JSON.stringify(nativa[i]);
    if (a !== b) { distintos++; console.log(`distinto: «${f.slice(0, 60)}»\n  web:    ${a.slice(0, 400)}\n  nativa: ${b.slice(0, 400)}`); }
});
if (distintos) { console.log(`${distintos} frases distintas`); process.exit(1); }
writeFileSync(new URL('pruebas/apuntar-casos.json', raiz), JSON.stringify({ ahora: AHORA, contexto, casos: frases.map((frase, i) => ({ frase, cosas: web[i] })) }, null, 1) + '\n');
console.log(`${frases.length} frases iguales en la web y en el entorno nativo; escrito pruebas/apuntar-casos.json`);
