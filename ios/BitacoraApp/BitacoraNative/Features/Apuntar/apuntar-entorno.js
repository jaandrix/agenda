// Lo que js/apuntar.js necesita de la web para interpretar, copiado tal cual de nucleo.js, planificador.js y
// finanzas.js. La app nativa carga este archivo y después js/apuntar.js (el mismo de la web) en JavaScriptCore: así
// las dos interpretan igual. pruebas/apuntar-casos.mjs comprueba que con este entorno sale lo mismo que en la web.
var copiaUid = '';
var financePro = { categories: [], transactions: [] };
var studies = { subjects: [] };
var apuntesRecientes = [];
var __ocultos = {};
function stripAccents(s) {
    return s.normalize('NFD').split('').filter(function(ch){var c=ch.charCodeAt(0);return !(c>=768&&c<=879);}).join('');
}
const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function todayISO() { return isoLocal(new Date()); }
function currentPlannerDayKey(date = new Date(), offsetDays = 0) {
    const d = new Date(date);
    if (d.getHours() < 4) d.setDate(d.getDate() - 1);
    d.setDate(d.getDate() + offsetDays);
    return isoLocal(d);
}
function apartadoVisible(v) { return !__ocultos[v]; }
function asignaturasEnCurso() { return studies.subjects; }
function escapeHtml(s) { return String(s ?? ''); }
const FMT_EUROS = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function financeMoney(value) { return FMT_EUROS.format(Number(value || 0)) + '€'; }

// Solo para las pruebas: un «ahora» fijo en hora local.
function __fijarAhora(a, m, d, h) {
    const _Date = globalThis.__DateReal || Date;
    globalThis.__DateReal = _Date;
    globalThis.Date = class extends _Date {
        constructor(...x) { super(...(x.length ? x : [a, m, d, h, 0, 0])); }
        static now() { return new _Date(a, m, d, h, 0, 0).getTime(); }
    };
}
