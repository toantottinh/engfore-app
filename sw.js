const CACHE_NAME = 'engfore-cache-v3';
const APP_SHELL_URLS = [
    '/app.html',
    '/dashboard.css',
    '/main.js',
    '/router.js',
    '/db.service.js',
    '/auth.service.js',
    '/auth-errors.js',
    '/supabase-client.js',
    '/shortcut.service.js',
    '/theme.service.js',
    '/audio.service.js',
    '/page-transitions.css',
    // Vocabulary Library
    '/vocabulary-library.js',
    '/vocabulary-library.html',
    '/vocabulary-library.css',
    // Vocabulary Detail (Feature 2)
    '/vocabulary-detail.js',
    '/vocabulary-detail.html',
    '/vocabulary-detail.css',
    '/add-word-modal.html',
    '/add-word-modal.css',
    '/import-ai-modal.html',
    '/import-ai-modal.css',
    '/set-stats-modal.html',
    '/set-stats-modal.css',
    // Practice
    '/practice-session.css',
    '/practice-session.html',
    '/practice-engine.js',
    '/gamemodes/typing/index.js',
    '/gamemodes/flashcard/index.js',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
];

// The install event is fired when the service worker is first installed.
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Install');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching App Shell');
            return cache.addAll(APP_SHELL_URLS);
        })
    );
});

// The activate event is fired when the service worker is activated.
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activate');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// The fetch event is fired for every network request.
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request); // Cache first, then network
        })
    );
});

// The push event is fired when a push message is received.
self.addEventListener('push', (event) => {
    const data = event.data.json();
    console.log('[Service Worker] Push Received.', data);

    const title = data.title || 'EngFore';
    const options = {
        body: data.body || 'Bạn có từ vựng cần ôn tập!',
        icon: '/assets/icons/icon-192x192.png',
        badge: '/assets/icons/icon-192x192.png'
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// The notificationclick event is fired when a user clicks on a notification.
self.addEventListener('notificationclick', (event) => {
    console.log('[Service Worker] Notification click Received.');
    event.notification.close();
    // Focus or open the app and navigate to the review page
    event.waitUntil(clients.openWindow('/app.html#/review'));
});
