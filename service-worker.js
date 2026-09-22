const CACHE_NAME = 'bitacora-shell-v2';
const SHELL_URLS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
    );
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
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

    event.respondWith(
        fetch(event.request, { cache: 'no-store' }).then((response) => {
            if (response.ok) {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            }
            return response;
        }).catch(() => caches.match(event.request))
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
