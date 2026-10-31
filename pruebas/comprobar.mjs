import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const raiz = new URL('..', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1');
const carpetaJs = join(raiz, 'js');
// Los de js/bajo-demanda no van en index.html (se cargan al abrirlos, cargarBajoDemanda en nucleo.js), pero se
// revisan igual: sintaxis y nombres repetidos con el resto.
const archivosJs = [...readdirSync(carpetaJs).filter(f => f.endsWith('.js')), ...readdirSync(join(carpetaJs, 'bajo-demanda')).filter(f => f.endsWith('.js')).map(f => 'bajo-demanda/' + f)].sort();
const fallos = [];

for (const archivo of archivosJs) {
    const ruta = join(carpetaJs, archivo);
    const resultado = spawnSync(process.execPath, ['--check', ruta], { encoding: 'utf8' });
    if (resultado.status !== 0) fallos.push(`sintaxis en js/${archivo}: ${(resultado.stderr || resultado.stdout).trim()}`);
}

function sinLiterales(codigo) {
    let salida = '', estado = 'codigo';
    for (let i = 0; i < codigo.length; i++) {
        const c = codigo[i], n = codigo[i + 1];
        if (estado === 'codigo') {
            if (c === '/' && n === '/') { salida += '  '; i++; estado = 'linea'; }
            else if (c === '/' && n === '*') { salida += '  '; i++; estado = 'bloque'; }
            else if (c === "'" || c === '"' || c === '`') { salida += ' '; estado = c; }
            else salida += c;
        } else if (estado === 'linea') {
            salida += c === '\n' ? '\n' : ' ';
            if (c === '\n') estado = 'codigo';
        } else if (estado === 'bloque') {
            if (c === '*' && n === '/') { salida += '  '; i++; estado = 'codigo'; }
            else salida += c === '\n' ? '\n' : ' ';
        } else {
            if (c === '\\') { salida += '  '; i++; }
            else if (c === estado) { salida += ' '; estado = 'codigo'; }
            else salida += c === '\n' ? '\n' : ' ';
        }
    }
    return salida;
}

const globales = new Map();
for (const archivo of archivosJs) {
    const lineas = sinLiterales(readFileSync(join(carpetaJs, archivo), 'utf8')).split(/\r?\n/);
    let profundidad = 0;
    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i];
        if (profundidad === 0) {
            const declaracion = linea.match(/^\s*(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/);
            if (declaracion) registrar(declaracion[1], archivo, i + 1);
            const variable = linea.match(/^\s*(?:let|const)\s+(.+)/);
            if (variable) {
                let texto = variable[1];
                let anidado = balanceDeclaracion(texto);
                while ((anidado > 0 || !texto.includes(';')) && i + 1 < lineas.length) {
                    const siguiente = lineas[++i].trim();
                    texto += ' ' + siguiente;
                    anidado += balanceDeclaracion(siguiente);
                }
                nombresDeclaracion(texto).forEach(nombre => registrar(nombre, archivo, i + 1));
            }
        }
        profundidad += (linea.match(/{/g) || []).length - (linea.match(/}/g) || []).length;
    }
}

function balanceDeclaracion(texto) {
    return (texto.match(/[({\[]/g) || []).length - (texto.match(/[)}\]]/g) || []).length;
}

function nombresDeclaracion(texto) {
    const nombres = [];
    let inicio = 0, anidado = 0;
    for (let i = 0; i <= texto.length; i++) {
        const c = texto[i];
        if (c === '(' || c === '[' || c === '{') anidado++;
        else if (c === ')' || c === ']' || c === '}') anidado--;
        if ((c === ',' && anidado === 0) || i === texto.length) {
            const nombre = texto.slice(inicio, i).trim().match(/^([A-Za-z_$][\w$]*)/);
            if (nombre) nombres.push(nombre[1]);
            inicio = i + 1;
        }
    }
    return nombres;
}

function registrar(nombre, archivo, linea) {
    const lugares = globales.get(nombre) || [];
    lugares.push(`js/${archivo}:${linea}`);
    globales.set(nombre, lugares);
}

for (const [nombre, lugares] of globales) {
    const archivos = new Set(lugares.map(l => l.split(':')[0]));
    if (archivos.size > 1) fallos.push(`global repetido ${nombre}: ${lugares.join(', ')}`);
}

const html = readFileSync(join(raiz, 'index.html'), 'utf8');
// Solo los .js y .css propios: iconos, manifiesto e imágenes llevan su propia versión.
const versiones = [...html.matchAll(/(?:src|href)="(?:js\/[^"?]+\.js|styles\.css)\?v=([^"'&\s>]+)/g)].map(m => m[1]);
if (new Set(versiones).size > 1) fallos.push(`valores ?v= distintos en index.html: ${[...new Set(versiones)].join(', ')}`);

// El service worker sirve su copia de cada ?v=: sin subirlo, lo nuevo no llega a quien ya tiene la app (pasó con cuatro commits seguidos).
const git = (...args) => spawnSync('git', ['-C', raiz, ...args], { encoding: 'utf8' });
const cambiados = git('diff', '--name-only', 'origin/main', '--', 'js', 'styles.css').stdout.trim();
const versionSubida = git('show', 'origin/main:index.html').stdout.match(/styles\.css\?v=([^"'&\s>]+)/)?.[1];
if (cambiados && versionSubida === versiones[0]) fallos.push(`hay cambios en js/ o styles.css sin subir ?v= en index.html (sigue en ${versionSubida})`);

const enlazados = [...html.matchAll(/<script\b[^>]*\bsrc=["'](js\/[^"'?]+\.js)(?:\?[^"']*)?["'][^>]*>/gi)].map(m => m[1].replaceAll('/', '\\'));
for (const src of enlazados) if (!existsSync(join(raiz, src))) fallos.push(`script enlazado inexistente: ${src.replaceAll('\\', '/')}`);
const conjuntoEnlazados = new Set(enlazados.map(src => src.toLowerCase()));
const swTexto = readFileSync(join(raiz, 'service-worker.js'), 'utf8');
const nucleoTexto = readFileSync(join(carpetaJs, 'nucleo.js'), 'utf8');
for (const archivo of archivosJs.filter(a => a.startsWith('bajo-demanda/'))) {
    const nombre = archivo.slice(13, -3);
    if (!swTexto.includes(`'${nombre}'`)) fallos.push(`js/${archivo} no está en BAJO_DEMANDA de service-worker.js (sin conexión fallaría)`);
    if (!nucleoTexto.includes(`'${nombre}'`)) fallos.push(`js/${archivo} no está en BAJO_DEMANDA de nucleo.js`);
}
for (const archivo of archivosJs) if (!archivo.startsWith('bajo-demanda/') && !conjuntoEnlazados.has(`js\\${archivo}`.toLowerCase())) fallos.push(`js/${archivo} no está enlazado en index.html`);

if (fallos.length) {
    console.error(`Comprobación fallida: ${fallos.length} problema(s).`);
    fallos.forEach(f => console.error(`- ${f}`));
    process.exit(1);
}

console.log(`Comprobación correcta: ${archivosJs.length} archivos JavaScript, sintaxis, globales, versiones y enlaces revisados.`);
