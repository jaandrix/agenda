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

function __apuntar(texto, fechaBase) {
    apuntarFechaBase = fechaBase || null;
    return JSON.stringify(apuntarTrocear(texto).map(t => {
        const r = interpretarApunte(__sinMiles(t));
        const error = __validar(t, r);
        const tipo = apuntarTipo(r);
        const describir = {};
        __TIPOS.forEach(k => { describir[k] = apuntarDescribir(r, k); if (error) describir[k].falta = error; });
        const nada = tipo === 'tarea' && !r.fechaDicha && !r.hora && r.importe == null && !r.comprar && !r.nota && !r.estudio && !r.cumple;
        return {
            texto: t, tipo, describir, nada,
            r: { ...r, importe: r.importe == null ? null : String(r.importe), asignatura: undefined,
                 asignaturaId: r.asignatura ? String(r.asignatura.id) : null, asignaturaNombre: r.asignatura ? r.asignatura.name : null,
                 ...(error ? { error } : {}) },
        };
    }));
}
