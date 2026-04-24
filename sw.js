/**
 * 班級小管家 Service Worker
 * @version 3.1.4
 * @description PWA 離線支援與快取策略優化
 */

const CACHE_NAME = 'class-manager-v3.1.4';
const STATIC_CACHE = 'class-manager-static-v3.1.4';
const DYNAMIC_CACHE = 'class-manager-dynamic-v3.1.4';


// 靜態資源列表（安裝時預快取）
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
    // 核心 JS
    './js/class-aware-storage.js',
    './js/empty-state.js',
    './js/app-state.js',
    './js/event-bus.js',
    './js/error-handler.js',
    './js/storage-manager.js',
    './js/utils.js',
    // 功能模組 JS
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
    // v3.0.0 新增模組
    './js/gesture-handler.js',
    './js/auto-sync.js',
    './js/offline-detector.js',
    // v3.1.0 新增模組
    './js/sync-status-indicator.js',
    './js/class-quick-switcher.js'
];

// 需要網路優先的路徑模式
const NETWORK_FIRST_PATTERNS = [
    /\/api\//,
    /firebase/,
    /firestore/,
    /googleapis/
];

// ==================== 安裝事件 ====================
// v3.1.3：移除 skipWaiting()，新 SW 會停留在 waiting 狀態，
// 直到所有舊 tab 關閉、或使用者主動點擊更新（postMessage SKIP_WAITING）才接管。
// 好處：老師上課時不會被強制切換版本，中斷正在使用的抽籤/加扣分等即時互動。
self.addEventListener('install', (event) => {
    console.log('[SW] 安裝中...', CACHE_NAME);

    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[SW] 預快取靜態資源');
                // 逐個快取，避免單個失敗導致全部失敗
                return Promise.allSettled(
                    STATIC_ASSETS.map(asset =>
                        cache.add(asset).catch(err => {
                            console.warn(`[SW] 快取失敗: ${asset}`, err);
                        })
                    )
                );
            })
            .then(() => {
                console.log('[SW] 安裝完成，新版本在背景等待使用者主動套用');
                // 不再自動 skipWaiting()，改由 message handler 觸發
            })
    );
});

// ==================== 啟用事件 ====================
// v3.1.3：移除 clients.claim()，讓舊 tab 繼續使用舊 SW 直到自然 reload。
// 新 tab 才會使用新 SW，避免中途換版造成資源不一致。
self.addEventListener('activate', (event) => {
    console.log('[SW] 啟用中...', CACHE_NAME);

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => {
                            // 刪除舊版本快取
                            return name.startsWith('class-manager-') &&
                                name !== STATIC_CACHE &&
                                name !== DYNAMIC_CACHE;
                        })
                        .map((name) => {
                            console.log('[SW] 刪除舊快取:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] 啟用完成（僅接管新開啟的頁面，舊頁面維持舊 SW）');
            })
    );
});

// ==================== 訊息處理（v3.1.3：支援手動觸發更新） ====================
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[SW] 收到 SKIP_WAITING 指令，接管頁面');
        self.skipWaiting();
    }
});

// ==================== 請求攔截 ====================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 只處理 http/https 請求
    if (!request.url.startsWith('http')) return;

    // 跳過 Chrome 擴充功能請求
    if (url.protocol === 'chrome-extension:') return;

    // 判斷是否需要網路優先
    const needsNetworkFirst = NETWORK_FIRST_PATTERNS.some(pattern =>
        pattern.test(request.url)
    );

    if (needsNetworkFirst) {
        // 網路優先策略（API、Firebase 等）
        event.respondWith(networkFirst(request));
    } else if (request.destination === 'document') {
        // HTML 文件：網路優先，快取備援
        event.respondWith(networkFirst(request));
    } else {
        // 靜態資源：快取優先
        event.respondWith(cacheFirst(request));
    }
});

// ==================== 快取策略 ====================

/**
 * 快取優先策略
 * 適用於：CSS、JS、圖片等靜態資源
 */
async function cacheFirst(request) {
    try {
        // 先嘗試快取
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            // 在背景更新快取（Stale While Revalidate）
            updateCache(request);
            return cachedResponse;
        }

        // 快取未命中，從網路獲取
        const networkResponse = await fetch(request);

        // 快取成功的回應
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.error('[SW] cacheFirst 錯誤:', error);

        // 返回離線頁面或預設回應
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;

        // 如果是圖片請求，返回預設圖片
        if (request.destination === 'image') {
            return new Response(
                '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#999">📷</text></svg>',
                { headers: { 'Content-Type': 'image/svg+xml' } }
            );
        }

        return new Response('離線', { status: 503, statusText: 'Offline' });
    }
}

/**
 * 網路優先策略
 * 適用於：HTML、API 請求
 */
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);

        // 快取成功的 GET 請求
        if (networkResponse.ok && request.method === 'GET') {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.warn('[SW] 網路請求失敗，嘗試快取:', request.url);

        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        // 如果是文件請求，返回離線頁面
        if (request.destination === 'document') {
            const offlinePage = await caches.match('./classnew.html');
            if (offlinePage) return offlinePage;
        }

        return new Response('離線 - 請檢查網路連線', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

/**
 * 背景更新快取（Stale While Revalidate）
 */
async function updateCache(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse);
        }
    } catch (error) {
        // 背景更新失敗，靜默處理
    }
}

// ==================== 訊息處理 ====================
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
                console.log('[SW] 未知訊息:', type);
            }
    }
});

// ==================== 推送通知（未來擴展）====================
self.addEventListener('push', (event) => {
    if (!event.data) return;

    const data = event.data.json();
    const options = {
        body: data.body || '班級小管家有新通知',
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        vibrate: [100, 50, 100],
        data: data.url || './'
    };

    event.waitUntil(
        self.registration.showNotification(data.title || '班級小管家', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data)
    );
});

console.log('[SW] Service Worker 已載入:', CACHE_NAME);
