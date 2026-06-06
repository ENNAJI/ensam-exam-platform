// Service Worker pour EMSI Exam Platform V3
const CACHE_NAME = 'emsi-exam-v3-cache';
const urlsToCache = [
    '/',
    '/index.html',
    '/professeur.html',
    '/css/styles.css',
    '/manifest.json'
];

// Installation
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Cache ouvert');
                return cache.addAll(urlsToCache);
            })
    );
});

// Fetch avec stratégie Network First, fallback Cache
self.addEventListener('fetch', (event) => {
    // Ignorer les requêtes API
    if (event.request.url.includes('/api/')) {
        return;
    }
    
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Mettre en cache la nouvelle réponse
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                }
                return response;
            })
            .catch(() => {
                // Fallback sur le cache si hors-ligne
                return caches.match(event.request);
            })
    );
});

// Activation et nettoyage des anciens caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Sync en arrière-plan pour les données hors-ligne
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-exam-data') {
        event.waitUntil(syncExamData());
    }
});

async function syncExamData() {
    // Synchroniser les données sauvegardées hors-ligne
    const cache = await caches.open('emsi-exam-offline-data');
    const requests = await cache.keys();
    
    for (const request of requests) {
        try {
            const response = await cache.match(request);
            const data = await response.json();
            
            await fetch(request.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            await cache.delete(request);
        } catch (e) {
            console.error('Sync failed:', e);
        }
    }
}
