const CACHE_NAME = 'bitacora-shell-v2';
const SHELL_URLS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
    // Además del cascarón, los archivos que carga index.html con su ?v= (la lista sale del propio index publicado),
    // para que instalar la app y abrirla enseguida sin red no la deje sin estilos ni JavaScript.
    event.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
        await cache.addAll(SHELL_URLS);
        try {
            const html = await (await fetch('./index.html', { cache: 'no-store' })).text();
            const propios = [...html.matchAll(/(?:src|href)="([^"]+\?v=[^"]+)"/g)].map(m => m[1]).filter(u => !/^https?:/.test(u));
            await cache.addAll(propios);
        } catch (e) { /* sin red al instalar: se guardan al pedirse */ }
    }));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        // Al cambiar CACHE_NAME (v1 -> v2), esto borra también toda la
        // caché vieja que se hubiera quedado pillada sirviendo versiones
        // antiguas de la app.
        caches.keys().then((keys) => Promise.all(
            keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        ))
    );
    self.clients.claim();
});

// Solo se cachean peticiones GET al propio origen (el "cascarón" de la
// app). Todo lo que va a Supabase u otros dominios pasa siempre por la
// red directamente: los datos nunca deben servirse desde caché.
//
// Estrategia "red primero": se intenta siempre cargar la versión más
// reciente de la red, y solo se recurre a la copia guardada si no hay
// conexión. Antes era al revés (caché primero, red de fondo para la
// próxima vez), lo que hacía que una publicación nueva pudiera tardar
// varias recargas en verse — con esta app siempre necesitando conexión
// para los datos de todos modos, no tiene sentido priorizar la caché.
// Las librerías de los CDN y las tipografías también se guardan: sin
// ellas (Supabase sobre todo) la app no arranca sin conexión y se quedaba
// en negro. Se piden con crossorigin desde index.html para que la copia
// sea una respuesta normal y no una opaca (que en iPhone ocupa muchísimo).
const CDN_GUARDADOS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

// Lo que no cambia nunca va primero a la copia guardada: los archivos de la app con versión (?v=, que se sube en
// cada publicación), las librerías con versión exacta y las tipografías. Antes todo iba «red primero» y sin caché,
// así que cada vez que se abría la app se volvían a bajar los 46 archivos de JavaScript y los estilos.
const fijo = (url, propio) => (propio && url.searchParams.has('v')) || url.hostname === 'fonts.gstatic.com' ||
    (!propio && /@\d+\.\d+\.\d+|\/\d+\.\d+\.\d+\//.test(url.pathname));

async function guardarCopia(request, response, url, propio) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response);
    // De un archivo propio con versión solo se queda la última: las copias viejas se borran.
    if (propio && url.searchParams.has('v')) {
        for (const vieja of await cache.keys()) {
            const u = new URL(vieja.url);
            if (u.pathname === url.pathname && u.origin === url.origin && u.searchParams.get('v') !== url.searchParams.get('v')) await cache.delete(vieja);
        }
    }
}

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET') return;
    const propio = url.origin === self.location.origin;
    if (!propio && !CDN_GUARDADOS.includes(url.hostname)) return;

    if (fijo(url, propio)) {
        event.respondWith(caches.match(event.request).then(guardada => guardada || fetch(event.request).then((response) => {
            if (response.ok) event.waitUntil(guardarCopia(event.request, response.clone(), url, propio));
            return response;
        })));
        return;
    }

    event.respondWith(
        fetch(event.request, propio ? { cache: 'no-store' } : undefined).then((response) => {
            if (response.ok) event.waitUntil(guardarCopia(event.request, response.clone(), url, propio));
            return response;
        }).catch(async () => {
            const guardada = await caches.match(event.request);
            if (guardada) return guardada;
            // Abrir la app desde un aviso (/?semana, /?compartido=...) sin red.
            if (event.request.mode === 'navigate') return caches.match('./index.html', { ignoreSearch: true });
            return Response.error();
        })
    );
});

// ============================================================
//  NOTIFICACIONES PUSH
//  Funciona igual en PWA (iOS 16.4+/Android/desktop) que en la app nativa,
//  porque ambas cargan esta misma web — no hace falta nada específico de
//  iOS aquí. El payload lo manda la función de Supabase send-push.
// ============================================================
self.addEventListener('push', (event) => {
    let payload = { title: 'Bitácora', body: '' };
    try { if (event.data) payload = { ...payload, ...event.data.json() }; } catch (e) { /* payload no era JSON, se usa el texto tal cual */ }

    event.waitUntil(
        self.registration.showNotification(payload.title || 'Bitácora', {
            body: payload.body || '',
            icon: './icon-192.png',
            badge: './icon-192.png',
            tag: payload.tag || 'bitacora-generic',
            data: { url: payload.url || './' }
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || './';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
            for (const client of clientsList) {
                if ('focus' in client) return client.focus();
            }
            if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
        })
    );
});
