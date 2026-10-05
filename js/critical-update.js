/**
 * 重要更新自動套用。
 *
 * 一般更新維持「提示、由老師決定」，避免打斷上課。資料安全與同步修正這類重要更新如果也靠老師自己按，
 * 就會有人一直停在舊版。critical-update.json 的 minVersion 高於目前版本時，在「不會打斷老師」的時機自動套用：
 *  - 剛開啟頁面、老師還沒有任何操作；
 *  - 切回分頁，且已閒置一段時間。
 * 考試全螢幕、瀏覽器全螢幕、同步進行中一律不動；20 秒內剛重新載入過也不再重複，避免異常時反覆重新整理。
 */
(function () {
    'use strict';
    const IDLE_MS = 5 * 60 * 1000, RELOAD_GUARD_MS = 20 * 1000, GUARD_KEY = 'criticalUpdateReloadAt';
    let lastInputAt = Date.now(), interacted = false, checking = false, startupDone = false;

    /** 純函式：a 是否比 b 舊（"3.45.4" 這種數字版本號）。 */
    function isOlder(a, b) {
        const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
        for (let i = 0; i < Math.max(x.length, y.length); i++) {
            const d = (x[i] || 0) - (y[i] || 0);
            if (d) return d < 0;
        }
        return false;
    }
    function busy() {
        try {
            if (document.fullscreenElement) return true;
            const exam = document.getElementById('examFullscreenModal');
            if (exam && getComputedStyle(exam).display !== 'none' && getComputedStyle(exam).visibility !== 'hidden') return true;
            return !!window.syncStatus?.isSyncing;
        } catch (e) { return true; }
    }
    function recentlyReloaded() {
        try { return Date.now() - Number(sessionStorage.getItem(GUARD_KEY) || 0) < RELOAD_GUARD_MS; } catch (e) { return false; }
    }
    async function check({ startup = false } = {}) {
        if (checking || busy() || recentlyReloaded() || !navigator.onLine) return 'skipped';
        // 只在安全時機：剛開啟且沒操作，或切回分頁且閒置夠久
        if (startup ? interacted : Date.now() - lastInputAt < IDLE_MS) return 'skipped';
        checking = true;
        try {
            const response = await fetch('critical-update.json?t=' + Date.now(), { cache: 'no-store' });
            if (!response.ok) return 'skipped';
            const { minVersion } = await response.json();
            if (!minVersion || !isOlder(window.APP_VERSION || '0', minVersion)) return 'current';
            // 抓取期間老師若開始操作或進入考試就放棄
            if (busy() || (startup && interacted)) return 'skipped';
            try { sessionStorage.setItem(GUARD_KEY, String(Date.now())); } catch (e) { /* 存不了就只靠 20 秒內不重複的計時 */ }
            window.LeaveSyncGuard?.allowInternalNavigation?.();   // 避免瀏覽器跳出「確定離開？」
            if (window.PWAInstaller?.applyPendingUpdate) await window.PWAInstaller.applyPendingUpdate();
            else location.reload();
            // 套用流程偶爾（例如剛安裝的 Service Worker）沒有觸發重新載入；3 秒後頁面還在就補一次。20 秒防重複已設好，不會變成迴圈。
            setTimeout(() => location.reload(), 3000);
            return 'applied';
        } catch (e) { return 'skipped'; }
        finally { checking = false; }
    }

    function init() {
        for (const type of ['pointerdown', 'keydown']) {
            document.addEventListener(type, () => { interacted = true; lastInputAt = Date.now(); }, { capture: true, passive: true });
        }
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) return;
            // 離開期間不算操作：用隱藏前的最後操作時間判斷閒置
            check();
        });
        // 載入完成、Service Worker 與同步模組都就緒後再看一次
        setTimeout(() => { startupDone = true; check({ startup: true }); }, 2500);
    }
    window.CriticalUpdate = { check, isOlder };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
