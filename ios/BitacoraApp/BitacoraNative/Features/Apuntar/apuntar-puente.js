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
function __apuntar(texto, fechaBase) {
    apuntarFechaBase = fechaBase || null;
    return JSON.stringify(apuntarTrocear(texto).map(t => {
        const r = interpretarApunte(t);
        const tipo = apuntarTipo(r);
        const describir = {};
        __TIPOS.forEach(k => { describir[k] = apuntarDescribir(r, k); });
        const nada = tipo === 'tarea' && !r.fechaDicha && !r.hora && r.importe == null && !r.comprar && !r.nota && !r.estudio && !r.cumple;
        return {
            texto: t, tipo, describir, nada,
            r: { ...r, importe: r.importe == null ? null : String(r.importe), asignatura: undefined,
                 asignaturaId: r.asignatura ? String(r.asignatura.id) : null, asignaturaNombre: r.asignatura ? r.asignatura.name : null },
        };
    }));
}
