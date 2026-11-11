// Lo mínimo del navegador para cargar el código de Finanzas de la web en JavaScriptCore (MotorFinanzas.swift).
// Todo lo de pantalla es un comodín que acepta cualquier uso y no hace nada: aquí solo se calcula.
(function () {
    var g = globalThis;
    var comodin = function () {
        return new Proxy(function () {}, {
            get: function (t, k) { return k === Symbol.toPrimitive ? function () { return ''; } : k === 'length' ? 0 : comodin(); },
            apply: function () { return comodin(); },
            construct: function () { return comodin(); },
            set: function () { return true; },
            has: function () { return false; }
        });
    };
    g.window = g; g.self = g;
    ['document', 'navigator', 'location', 'history', 'supabase', 'matchMedia', 'indexedDB', 'visualViewport', 'CSS', 'screen',
     'IntersectionObserver', 'ResizeObserver', 'MutationObserver', 'Document', 'Element', 'Node', 'HTMLElement', 'Event',
     'addEventListener', 'removeEventListener', 'requestAnimationFrame', 'cancelAnimationFrame', 'fetch', 'Image', 'Blob',
     'Response', 'DecompressionStream', 'DOMParser', 'FileReader', 'Notification', 'caches', 'performance', 'getComputedStyle',
     'alert', 'confirm', 'prompt', 'open', 'scrollTo', 'BroadcastChannel', 'Worker', 'AbortController', 'URL', 'URLSearchParams',
     'TextEncoder', 'crypto'].forEach(function (k) { if (!(k in g)) g[k] = comodin(); });
    var almacen = function () {
        var d = {};
        return { getItem: function (k) { return k in d ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; }, clear: function () { d = {}; }, key: function () { return null; }, get length() { return 0; } };
    };
    g.localStorage = almacen(); g.sessionStorage = almacen();
    g.setTimeout = function () { return 0; }; g.clearTimeout = function () {};
    g.setInterval = function () { return 0; }; g.clearInterval = function () {};
    g.queueMicrotask = function () {};
    if (typeof g.structuredClone !== 'function') g.structuredClone = function (v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); };
    g.console = g.console || { log: function () {}, error: function () {}, warn: function () {}, info: function () {} };
    if (typeof g.TextDecoder !== 'function') g.TextDecoder = function () { this.decode = function () { return ''; }; };
})();
