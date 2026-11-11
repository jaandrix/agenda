// Lo que la app nativa pide al intérprete (va después de js/apuntar.js). Devuelve JSON: texto plano, sin HTML.
const __TIPOS = ['tarea', 'evento', 'gasto', 'compra', 'nota', 'cumple', 'examen', 'trabajo', 'recurrente', 'clase', 'viaje', 'libro', 'serie', 'peli', 'juego'];
function __contexto(json) {
    const c = JSON.parse(json);
    copiaUid = c.uid || '';
    financePro = { categories: c.categorias || [], transactions: [] };
    studies = { subjects: c.asignaturas || [] };
    __ocultos = {};
    (c.ocultos || []).forEach(v => { __ocultos[v] = true; });
}

// Validadores P0 de la 0.17, solo en la app nativa por ahora (js/apuntar.js no se toca: pasarlos a la web queda
// pendiente en PLAN-0.17.md). El motor corre lo que no existe («31 de febrero» daba el 3 de marzo) y crea con
// «cancela la cita»: aquí se mira el resultado y se deja el motivo en `r.error`, que CrearApunte respeta.
// «1.500,50 €» se leía como 500,50: los miles se quitan antes de interpretar.
function __sinMiles(t) { return t.replace(/(?<![\d.,])(\d{1,3}(?:\.\d{3})+)(?=(?:,\d{1,2})?(?![\d.]))/g, m => m.replace(/\./g, '')); }
function __existe(d, m, y) { const f = new Date(y, m, d, 12); return m >= 0 && m <= 11 && f.getMonth() === m && f.getDate() === d; }
function __diaDe(iso) { return Number(String(iso || '').slice(8, 10)); }
function __validar(t, r) {
    const n = apuntarNorm(t).trim();
    if (/^(?:cancela|anula|borra|elimina|mueve|pospon|aplaza|retrasa|adelanta)\b/.test(n)
        || /^(?:cambia|quita)\s+(?:la|el|lo|mi|las|los)\s+(?:cita|evento|tarea|reunion|cena|comida|quedada|de)\b/.test(n)) return 'apuntar solo crea cosas: para cambiar o borrar algo, búscalo y ábrelo';
    if (/\?\s*$/.test(n) || /^¿/.test(n)) return 'eso es una pregunta: búscala en la barra';
    const rc = r.recurrencia;
    if (rc && rc.frecuencia === 'intervalo' && !(rc.cada >= 1)) return 'cada cuántos días: tiene que ser 1 o más';
    if (rc && rc.frecuencia === 'mensual' && !(rc.diaMes >= 1 && rc.diaMes <= 31)) return `el día ${rc.diaMes} no existe en ningún mes`;
    if (r.fechaDicha && !rc) {
        const meses = APUNTAR_MESES.join('|');
        const mesDe = x => /^\d+$/.test(x) ? Number(x) - 1 : APUNTAR_MESES.indexOf(x);
        if (r.fechaFin) {
            const g = n.match(/\bdel?\s+(\d{1,2})\b[\s\S]*?\b(?:al|hasta el)\s+(\d{1,2})\b/);
            if (g && (__diaDe(r.fecha) !== Number(g[1]) || __diaDe(r.fechaFin) !== Number(g[2]))) return 'esa fecha no existe';
            const dias = (new Date(r.fechaFin + 'T12:00:00') - new Date(r.fecha + 'T12:00:00')) / 864e5;
            if (dias < 0 || dias > 120) return 'la fecha de fin va antes que la de inicio';
        } else {
            const f = n.match(new RegExp(`\\b(\\d{1,2})\\s*(?:\\/|-|de\\s+)(\\d{1,2}|${meses})(?:\\s*(?:\\/|-|de\\s+)(\\d{4}|\\d{2}))?\\b`));
            if (f) {
                const d = Number(f[1]), m = mesDe(f[2]), y = f[3] ? Number(f[3].length === 2 ? '20' + f[3] : f[3]) : null;
                if (!__existe(d, m, y != null ? y : 2024)) return m >= 0 && m <= 11 && d >= 1 ? `el ${d} de ${APUNTAR_MESES[m]} no existe` : 'esa fecha no existe';
                if (y == null && d === 29 && m === 1 && !String(r.fecha).endsWith('-02-29')) return `el 29 de febrero no existe en ${String(r.fecha).slice(0, 4)}`;
            } else {
                const e = n.match(/\bel\s+(?:dia\s+)?(\d{1,2})\b/);
                if (e && __diaDe(r.fecha) !== Number(e[1])) return Number(e[1]) >= 1 && Number(e[1]) <= 31 ? `ese mes no tiene día ${Number(e[1])}` : `el día ${Number(e[1])} no existe`;
            }
        }
    }
    // Solo una fecha, una hora o un importe no es nada que apuntar.
    if (!r.titulo && (r.importe == null || /^[\s\d.,€+]*(?:eur(?:os)?|pavos)?\s*$/.test(n))) return r.importe != null ? 'falta en qué' : 'falta qué es';
    return '';
}

// P1 de la 0.19 (laboratorio de Apuntar), también solo en la app nativa por ahora.
// Lo dictado escribe los días con letras: «el día veinte» pasa a «el día 20» (las horas ya las entiende el motor).
const __NUMEROS = ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
    'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidos', 'veintitres', 'veinticuatro', 'veinticinco',
    'veintiseis', 'veintisiete', 'veintiocho', 'veintinueve', 'treinta', 'treinta y uno'];
function __dictado(t) {
    const sinTilde = x => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return t.replace(/\b(el\s+(?:d[ií]a\s+)?|d[ií]a\s+)(treinta y uno|[a-záéíóúñ]+)(?=\b)/gi, (m, pre, num) => {
        const i = __NUMEROS.indexOf(sinTilde(num.toLowerCase()).replace('veintiun', 'veintiuno').replace(/^un$/, 'uno').replace(/^primero$/, 'uno'));
        return i >= 0 ? pre + (i + 1) : m;
    });
}
// «… prioridad alta», «urgente: …»: se quita del título y va a la tarea como en el planificador.
function __prioridad(t) {
    let p = null;
    const limpio = t.replace(/[,.]?\s*\b(?:con\s+)?prioridad\s+(alta|media|baja)\b/i, (m, x) => { p = x.toLowerCase(); return ''; })
        .replace(/^\s*(?:muy\s+)?urgente\s*[:,.-]?\s*|[,.]?\s*\b(?:es\s+)?urgente\s*$/i, () => { p = p || 'alta'; return ''; });
    return { texto: p ? limpio.trim() : t, prioridad: p };
}
// «gasté 12 en gasolina y 30 en comida»: dos gastos, no uno de 12 con «y 30 en comida» en el concepto.
function __variosImportes(texto) {
    const imp = '\\d+(?:[.,]\\d{1,2})?\\s*(?:€|eur(?:os)?|pavos)?';
    const re = new RegExp(`(${imp}\\s+(?:en|de)\\s+[^;\\n]+?)\\s+y\\s+(?=${imp}\\s+(?:en|de)\\s)`, 'gi');
    const verbo = (texto.match(/^\s*((?:me\s+)?(?:gast[eé]|pagu[eé]|he\s+gastado|he\s+pagado|gasto|pago))/i) || [])[1] || 'gasto';
    return texto.replace(re, `$1; ${verbo} `);
}
// Lo que no apunta nada: dice lo que ya no hay que hacer. «no olvidar…» sí se apunta.
function __negacion(n) {
    if (/^no\s+(?:te\s+)?olvid/.test(n)) return '';
    return /^(?:ya\s+no|no\s+(?:hay|tengo|tenemos|voy|vamos|quedamos|hace\s+falta|necesito|compres|comprar|hagas|vayas|tienes|habra))\b/.test(n)
        ? 'eso dice lo que no hay que hacer: apunta lo que sí, o búscalo para borrarlo' : '';
}
// «examen de química» sin esa asignatura: avisa en vez de crear un evento con ese nombre.
function __asignaturaQueFalta(n, r, t) {
    if (r.asignatura || !(studies.subjects || []).length) return '';
    const m = n.match(/^(?:examen|parcial|final|recuperacion|entrega(?:r)?\s+(?:el\s+|la\s+)?(?:trabajo|practica))\s+(?:de\s+|del\s+)?([a-z0-9ñ][a-z0-9ñ ]*?)(?=\s+(?:el|la|para|a|en|mañana|pasado|hoy|este|esta|proximo|que)\b|$)/);
    // apuntarNorm conserva la longitud: el nombre se recorta del texto original, con sus tildes.
    const nombre = m ? t.trim().substr(n.indexOf(m[1]), m[1].trim().length) : '';
    return m ? `no tienes ninguna asignatura «${nombre}»: créala en estudios o escríbelo sin «${n.split(' ')[0]}»` : '';
}

function __apuntar(texto, fechaBase) {
    apuntarFechaBase = fechaBase || null;
    return JSON.stringify(apuntarTrocear(__variosImportes(__dictado(texto))).map(t => {
        const pr = __prioridad(t);
        const r = interpretarApunte(__sinMiles(pr.texto));
        const n = apuntarNorm(t).trim();
        const error = __validar(t, r) || __negacion(n) || __asignaturaQueFalta(n, r, t);
        const tipo = apuntarTipo(r);
        const describir = {};
        __TIPOS.forEach(k => { describir[k] = apuntarDescribir(r, k); if (error) describir[k].falta = error; });
        if (pr.prioridad) describir.tarea.texto += `, prioridad ${pr.prioridad}`;
        const nada = tipo === 'tarea' && !r.fechaDicha && !r.hora && r.importe == null && !r.comprar && !r.nota && !r.estudio && !r.cumple;
        return {
            texto: t, tipo, describir, nada,
            r: { ...r, importe: r.importe == null ? null : String(r.importe), asignatura: undefined,
                 asignaturaId: r.asignatura ? String(r.asignatura.id) : null, asignaturaNombre: r.asignatura ? r.asignatura.name : null,
                 ...(pr.prioridad ? { prioridad: pr.prioridad } : {}), ...(error ? { error } : {}) },
        };
    }));
}
