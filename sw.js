/**
 * ?剔?撠恣摰?Service Worker
 * @version 3.0.4
 * @description PWA ?Ｙ??舀?翰???亙??
 */

const CACHE_NAME = 'class-manager-v3.0.5';
const STATIC_CACHE = 'class-manager-static-v3.0.5';
const DYNAMIC_CACHE = 'class-manager-dynamic-v3.0.5';


// ??鞈??”嚗?鋆??翰??
const STATIC_ASSETS = [
    './',
    './index.html',
    './classnew.html',
    './manifest.json',
    './favicon.ico',
    './icons/icon-192.png',
    './icons/icon-512.png',
    // CSS
    './css/main.css',
    './css/animations.css',
    './css/clock.css',
    './css/notification.css',
    './css/rwd-breakpoints.css',
    './css/pwa-install.css',
    // ?詨? JS
    './js/app-state.js',
    './js/event-bus.js',
    './js/error-handler.js',
    './js/storage-manager.js',
    './js/utils.js',
    // ?璅∠? JS
    './js/exam-proctor.js',
    './js/homework-enhancement.js',
    './js/lottery-enhancement.js',
    './js/grouping-enhancement.js',
    './js/leaderboard-enhancement.js',
    './js/pomodoro.js',
    './js/keyboard-shortcuts.js',
    './js/timer-enhancement.js',
    './js/ui-enhancement.js',
    './js/student-enhancement.js',
    './js/notebook-enhancement.js',
    './js/data-reports.js',
    './js/theme-toggle.js',
    './js/pwa-install.js',
    // v3.0.0 ?啣?璅∠?
    './js/gesture-handler.js',
    './js/auto-sync.js',
    './js/offline-detector.js'
];

// ?閬雯頝臬??頝臬?璅∪?
const NETWORK_FIRST_PATTERNS = [
    /\/api\//,
    /firebase/,
    /firestore/,
    /googleapis/
];

// ==================== 摰?鈭辣 ====================
self.addEventListener('install', (event) => {
    console.log('[SW] 摰?銝?..', CACHE_NAME);

    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[SW] ?翰????皞?);
                // ?翰???踹??桀仃???游?典仃??
                return Promise.allSettled(
                    STATIC_ASSETS.map(asset =>
                        cache.add(asset).catch(err => {
                            console.warn(`[SW] 敹怠?憭望?: ${asset}`, err);
                        })
                    )
                );
            })
            .then(() => {
                console.log('[SW] 摰?摰?嚗歲??敺?);
                return self.skipWaiting();
            })
    );
});

// ==================== ?鈭辣 ====================
self.addEventListener('activate', (event) => {
    console.log('[SW] ?銝?..', CACHE_NAME);

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => {
                            // ?芷???砍翰??
                            return name.startsWith('class-manager-') &&
                                name !== STATIC_CACHE &&
                                name !== DYNAMIC_CACHE;
                        })
                        .map((name) => {
                            console.log('[SW] ?芷?翰??', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] ?摰?嚗蝞⊥?????);
                return self.clients.claim();
            })
    );
});

// ==================== 隢?? ====================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // ?芾???http/https 隢?
    if (!request.url.startsWith('http')) return;

    // 頝喲? Chrome ?游??隢?
    if (url.protocol === 'chrome-extension:') return;

    // ?斗?臬?閬雯頝臬??
    const needsNetworkFirst = NETWORK_FIRST_PATTERNS.some(pattern =>
        pattern.test(request.url)
    );

    if (needsNetworkFirst) {
        // 蝬脰楝?芸?蝑嚗PI?irebase 蝑?
        event.respondWith(networkFirst(request));
    } else if (request.destination === 'document') {
        // HTML ?辣嚗雯頝臬??敹怠??
        event.respondWith(networkFirst(request));
    } else {
        // ??鞈?嚗翰???
        event.respondWith(cacheFirst(request));
    }
});

// ==================== 敹怠?蝑 ====================

/**
 * 敹怠??芸?蝑
 * ?拍?潘?CSS?S??????鞈?
 */
async function cacheFirst(request) {
    try {
        // ??閰血翰??
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            // ?刻??舀?啣翰??Stale While Revalidate嚗?
            updateCache(request);
            return cachedResponse;
        }

        // 敹怠??芸銝哨?敺雯頝舐??
        const networkResponse = await fetch(request);

        // 敹怠???????
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.error('[SW] cacheFirst ?航炊:', error);

        // 餈??Ｙ????閮剖???
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;

        // 憒??臬???瘙?餈??身??
        if (request.destination === 'image') {
            return new Response(
                '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#999">?</text></svg>',
                { headers: { 'Content-Type': 'image/svg+xml' } }
            );
        }

        return new Response('?Ｙ?', { status: 503, statusText: 'Offline' });
    }
}

/**
 * 蝬脰楝?芸?蝑
 * ?拍?潘?HTML?PI 隢?
 */
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);

        // 敹怠?????GET 隢?
        if (networkResponse.ok && request.method === 'GET') {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.warn('[SW] 蝬脰楝隢?憭望?嚗?閰血翰??', request.url);

        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        // 憒??舀?隞嗉?瘙?餈??Ｙ??
        if (request.destination === 'document') {
            const offlinePage = await caches.match('./classnew.html');
            if (offlinePage) return offlinePage;
        }

        return new Response('?Ｙ? - 隢炎?亦雯頝舫??', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

/**
 * ??湔敹怠?嚗tale While Revalidate嚗?
 */
async function updateCache(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse);
        }
    } catch (error) {
        // ??湔憭望?嚗?暺???
    }
}

// ==================== 閮?? ====================
self.addEventListener('message', (event) => {
    const { type, payload } = event.data || {};

    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;

        case 'GET_VERSION':
            event.ports[0].postMessage({ version: CACHE_NAME });
            break;

        case 'CLEAR_CACHE':
            caches.keys().then(names => {
                names.forEach(name => {
                    if (name.startsWith('class-manager-')) {
                        caches.delete(name);
                    }
                });
            });
            break;

        default:
            if (type) {
                console.log('[SW] ?芰閮:', type);
            }
    }
});

// ==================== ?券嚗靘撅?====================
self.addEventListener('push', (event) => {
    if (!event.data) return;

    const data = event.data.json();
    const options = {
        body: data.body || '?剔?撠恣摰嗆??圈',
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        vibrate: [100, 50, 100],
        data: data.url || './'
    };

    event.waitUntil(
        self.registration.showNotification(data.title || '?剔?撠恣摰?, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data)
    );
});

console.log('[SW] Service Worker 撌脰???', CACHE_NAME);
