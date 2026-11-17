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

// Los validadores, los días dictados y los varios importes están en js/apuntar.js desde la 0.24 (apuntarValidar,
// apuntarDictado, apuntarVariosImportes, apuntarSinMiles): la web y el iPhone validan igual. Aquí queda la prioridad.
// «… prioridad alta», «urgente: …»: se quita del título y va a la tarea como en el planificador.
function __prioridad(t) {
    let p = null;
    const limpio = t.replace(/[,.]?\s*\b(?:con\s+)?prioridad\s+(alta|media|baja)\b/i, (m, x) => { p = x.toLowerCase(); return ''; })
        .replace(/^\s*(?:muy\s+)?urgente\s*[:,.-]?\s*|[,.]?\s*\b(?:es\s+)?urgente\s*$/i, () => { p = p || 'alta'; return ''; });
    return { texto: p ? limpio.trim() : t, prioridad: p };
}
function __apuntar(texto, fechaBase) {
    apuntarFechaBase = fechaBase || null;
    return JSON.stringify(apuntarTrocear(texto).map(t => {
        const pr = __prioridad(t);
        const r = interpretarApunte(pr.texto);
        const error = apuntarValidar(t, r);
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
