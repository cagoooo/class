/**
 * 班級小管家 Service Worker
 * @version 3.74.9
 * @description PWA 離線支援與快取策略優化
 */

const CACHE_NAME = 'class-manager-v3.74.9';
const STATIC_CACHE = 'class-manager-static-v3.74.9';
const DYNAMIC_CACHE = 'class-manager-dynamic-v3.74.9';
// v3.69.1：寵物、安靜挑戰小幫手等圖片放在不跟著版本清掉的快取。
// 原本放在 DYNAMIC_CACHE，每次發新版就整個清空，老師幾乎每次更新後都要重新下載一次，小幫手要等很久才出現。
const ART_CACHE = 'class-manager-art-v1';
const ART_PATTERN = /\/assets\/.+\.(webp|png|jpe?g|svg)$/i;
function isArt(url) { return url.origin === self.location.origin && ART_PATTERN.test(url.pathname); }


// 靜態資源列表（安裝時預快取）
const STATIC_ASSETS = [
    './',
    './index.html',
    './classnew.html',
    './manifest.json',
    './favicon.ico',
    './favicon.svg',
    './apple-touch-icon.png',
    './icons/icon-192.png',
    './icons/icon-512.png',
    // CSS
    './css/main.css',
    './css/class-pets.css',
    './css/animations.css',
    './css/clock.css',
    './css/notification.css',
    './css/rwd-breakpoints.css',
    './css/pwa-install.css',
    './css/contrast.css',
    // v3.74.3：主頁面用到、以前沒有預先存好的檔案（離線第一次開啟會缺）
    './css/skeleton.css',
    './js/skeleton.js',
    './js/firebase-config.js',
    './js/firebase-sync.js',
    './js/firebase-ui.js',
    './js/navigation-enhancement.js',
    './js/exam-sounds.js',
    './js/announcement.js',
    './js/clock-settings-toggle.js',
    './js/semester-archive.js',
    './js/class-profiles.js',
    './js/google-auth-ui.js',
    './js/classroom-ux.js',
    // 核心 JS
    './js/class-aware-storage.js',
    './js/backup-integrity.js',
    './js/data-backup.js',
    './js/cloud-merge.js',
    './js/cloud-safety.js',
    './js/account-vault.js',
    './css/data-safety.css',
    './js/class-pets.js',
    './js/pet-share.js',
    './js/vendor/qrcode-generator.js',
    './js/empty-state.js',
    './js/app-state.js',
    './js/event-bus.js',
    './js/error-handler.js',
    './js/storage-manager.js',
    // 功能模組 JS
    './js/exam-proctor.js',
    './js/homework-enhancement.js',
    './js/today-attendance.js',
    './js/lottery-enhancement.js',
    './js/grouping-enhancement.js',
    './js/points-enhancement.js',
    './js/leaderboard-enhancement.js',
    './js/pomodoro.js',
    './js/keyboard-shortcuts.js',
    './js/timer-enhancement.js',
    './js/timer-bgm.js',
    './js/timer-alarm.js',
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
    './js/leave-sync-guard.js',
    './js/critical-update.js',
    './js/cloud-fast-forward.js',
    './js/class-quick-switcher.js',
    // v3.2.0 新增模組
    './js/zodiac-slot.js',
    // v3.3.0 新增模組
    './js/data-safety-guard.js',
    // v3.5.0 新增模組
    './js/class-board.js',
    // v3.6.0 新增模組
    './js/brush-check.js',
    // v3.57.0 新增模組
    './js/quiet-challenge.js',
    './js/cloud-guide.js',
    // v3.7.0 新增模組
    './js/comment-gen.js',
    // v3.8.0 新增模組
    './js/dialogue-school.js',
    // v3.10.0 新增模組
    './js/usage-notify.js',
    // v3.12.1 新增模組
    './js/health-panel.js',
    // v3.12.3 新增模組
    './js/admin-console.js'
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
                    // 用 {cache: 'reload'} 強制繞過瀏覽器 HTTP 快取抓最新檔再存入，
                    // 確保新版 SW 接管時 precache 內容一定是最新（而非瀏覽器舊快取）。
                    STATIC_ASSETS.map(asset =>
                        fetch(new Request(asset, { cache: 'reload' }))
                            .then(resp => { if (resp && resp.ok) return cache.put(asset, resp); })
                            .catch(err => {
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
                                name !== DYNAMIC_CACHE &&
                                name !== ART_CACHE;
                        })
                        .map((name) => {
                            console.log('[SW] 刪除舊快取:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => trimArtCache())
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

    // 重要更新標記必須永遠即時，不能被快取住（否則舊版永遠看不到新的 minVersion）
    if (new URL(event.request.url).pathname.endsWith('/critical-update.json')) return;

    // 只處理 http/https 請求
    if (!request.url.startsWith('http')) return;

    // 跳過 Chrome 擴充功能請求
    if (url.protocol === 'chrome-extension:') return;

    // YouTube 播放器（計時背景音樂）交給瀏覽器自己處理：快取住舊的播放器程式會讓影片播不出來
    if (/(^|\.)(youtube\.com|youtube-nocookie\.com|ytimg\.com|googlevideo\.com)$/.test(url.hostname)) return;

    // reCAPTCHA（App Check 用）交給瀏覽器：載入檔會指向 Google 每次更新的版本，存住舊的會讓驗證失效（v3.74.5）
    if (/(^|\.)(google\.com|recaptcha\.net)$/.test(url.hostname)) return;
    if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/recaptcha/')) return;

    // 只攔截 GET：POST/PUT 等（Cloud Functions callable、Firestore 寫入…）一律放行給瀏覽器。
    // 否則 cacheFirst 內 cache.put(POST) 會丟錯，請求被攔截成 503（會讓 callable 通知失敗）。
    if (request.method !== 'GET') return;

    // 資料庫與登入的連線（*.googleapis.com）一律交給瀏覽器：以前也會被存進快取，
    // 存的是某位老師的資料回應，既占空間又可能在離線時拿出過期內容（v3.74.3）
    if (/(^|\.)googleapis\.com$/.test(url.hostname)) return;

    // 判斷是否需要網路優先（Firebase 程式庫等）
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

/** 同網站的檔案：不看網址後面的 ?v= 找預先存好的那一份（只在離線時用） */
async function matchSameOrigin(request) {
    try {
        if (new URL(request.url).origin !== self.location.origin) return undefined;
        return await caches.match(request, { ignoreSearch: true });
    } catch (e) { return undefined; }
}

/** 寵物圖快取不跟著版本清掉，但重新繪製後舊版圖會一直留著：超過上限時先刪最早存的（v3.74.3） */
const ART_CACHE_MAX = 900;
async function trimArtCache() {
    try {
        const cache = await caches.open(ART_CACHE);
        const keys = await cache.keys();
        for (let i = 0; i < keys.length - ART_CACHE_MAX; i++) await cache.delete(keys[i]);
    } catch (e) { /* 清不掉不影響使用 */ }
}

/**
 * 快取優先策略
 * 適用於：CSS、JS、圖片等靜態資源
 */
async function cacheFirst(request) {
    try {
        // 先嘗試快取
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            // 在背景更新快取（Stale While Revalidate）。網址帶版本號（?v=）的檔案內容不該變，不用每次重抓：
            // 而且 GitHub Pages 不看 ?v=，重抓會把「新版內容」存在「舊版網址」底下，舊頁面就載到新程式（v3.74.3）
            const u = new URL(request.url);
            if (!(u.origin === self.location.origin && u.searchParams.has('v'))) updateCache(request);
            return cachedResponse;
        }

        // 快取未命中，從網路獲取
        const networkResponse = await fetch(request);

        // 快取成功的回應
        if (networkResponse.ok) {
            const cache = await caches.open(isArt(new URL(request.url)) ? ART_CACHE : DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.error('[SW] cacheFirst 錯誤:', error);

        // 離線：先找完全相同的網址，再找預先存好的同一個檔案（預快取的網址沒有 ?v=，以前因此對不上、離線開不起來）
        const cachedResponse = await caches.match(request) || await matchSameOrigin(request);
        if (cachedResponse) return cachedResponse;

        // 圖片拿不到就回報失敗：以前回一張 📷 圖假裝成功，寵物圖等會一直顯示成相機、也不會再重試（v3.74.3）
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

        const cachedResponse = await caches.match(request) || await matchSameOrigin(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        // 主頁面（含首頁）離線時用預先存好的主頁面；其他頁面（例如學生的寵物分享頁）不要換成老師的主程式（v3.74.3）
        if (request.destination === 'document') {
            const path = new URL(request.url).pathname;
            if (/\/(classnew\.html|index\.html)?$/.test(path)) {
                const offlinePage = await caches.match('./classnew.html');
                if (offlinePage) return offlinePage;
            }
            return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>離線</title>' +
                '<body style="font-family:sans-serif;text-align:center;padding:3rem 1rem;color:#334155"><h1 style="font-size:1.4rem">目前沒有網路</h1>' +
                '<p>這個頁面需要網路才能開啟，請連上網路後重新整理。</p></body>', {
                status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
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
            const cache = await caches.open(isArt(new URL(request.url)) ? ART_CACHE : DYNAMIC_CACHE);
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
