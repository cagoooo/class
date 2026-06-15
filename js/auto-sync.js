/**
 * 自動定時同步模組（Auto Sync）
 * P11 功能實作 v1.0.0  2026-03-03
 *
 * 功能：
 * - 每 10 分鐘自動呼叫 FirebaseSync.syncToCloud()
 * - 從背景切回前台時，若距上次同步超過間隔則立即同步
 * - 同步中顯示導覽列旋轉圖示，完成後顯示成功 Toast（靜默版，不彈大型通知）
 * - 未登入 / 離線 / 已在同步中：自動跳過，不報錯
 * - 可透過設定頁調整間隔（儲存至 ClassDB/localStorage）
 *
 * 依賴：
 * - window.FirebaseSync.syncToCloud()   — firebase-sync.js
 * - window.FirebaseConfig.isConnected() — firebase-config.js
 * - ClassDB（可選，v2.9.9 IDB 模組）
 *
 * 全域 API：
 *   AutoSync.start()    — 啟動定時器
 *   AutoSync.stop()     — 停止定時器
 *   AutoSync.trySync()  — 立即嘗試同步（供外部呼叫）
 *   AutoSync.setInterval(minutes) — 動態調整間隔
 */

(function () {
    'use strict';

    // ==================== 設定 ====================

    const DEFAULTS = {
        intervalMin: 10,        // 預設同步間隔（分鐘）
        settingKey: 'autoSyncIntervalMin',  // 儲存使用者設定的 key
        lastSyncKey: 'lastSyncTime',         // 與 firebase-sync.js 共用的 key
        toastDuration: 2500,     // 靜默 Toast 顯示時間(ms)
    };

    // ==================== 狀態 ====================

    const state = {
        timer: null,
        running: false,
        intervalMs: DEFAULTS.intervalMin * 60 * 1000,
    };

    // ==================== 核心函數 ====================

    /**
     * 取得使用者設定的同步間隔（分鐘），轉為毫秒
     */
    function getIntervalMs() {
        try {
            const saved = parseInt(
                localStorage.getItem(DEFAULTS.settingKey) || '', 10
            );
            if (!isNaN(saved) && saved >= 1 && saved <= 120) {
                return saved * 60 * 1000;
            }
        } catch (e) { /* noop */ }
        return DEFAULTS.intervalMin * 60 * 1000;
    }

    /**
     * 取得上次同步時間戳（毫秒）
     */
    function getLastSyncMs() {
        try {
            const t = localStorage.getItem(DEFAULTS.lastSyncKey);
            return t ? new Date(t).getTime() : 0;
        } catch (e) { return 0; }
    }

    /**
     * 檢查是否需要同步（距上次同步是否超過間隔）
     */
    function needsSync() {
        return Date.now() - getLastSyncMs() >= state.intervalMs;
    }

    /**
     * 嘗試執行同步（內部安全版）
     * - 未登入、離線、已在同步中 → 靜默跳過
     */
    async function trySync(silent = true) {
        // 已在同步 → 跳過
        if (window.syncStatus?.isSyncing) {
            console.log('[AutoSync] 同步中，跳過本次觸發');
            return false;
        }
        // 未連線 → 跳過
        if (!window.FirebaseConfig?.isConnected?.()) {
            console.log('[AutoSync] 未登入或離線，跳過本次觸發');
            return false;
        }
        // 離線 → 跳過
        if (!navigator.onLine) {
            console.log('[AutoSync] 裝置離線，跳過本次觸發');
            return false;
        }

        console.log('[AutoSync] ⟳ 自動同步中...');
        showSyncSpinner(true);

        try {
            const ok = await window.FirebaseSync.syncToCloud(true);   // 靜默：不顯示全螢幕遮罩（用本模組的小圖示 + Toast）
            if (ok && silent) {
                showSilentToast('☁️ 已自動同步');
            }
            return ok;
        } catch (e) {
            console.warn('[AutoSync] 同步失敗:', e);
            return false;
        } finally {
            showSyncSpinner(false);
        }
    }

    /**
     * 定時器觸發：僅在需要時同步
     */
    async function onTimer() {
        if (needsSync()) {
            await trySync(true);
        } else {
            console.log('[AutoSync] 距上次同步未超過間隔，本次跳過');
        }
    }

    /**
     * 頁面可見性切換：從背景切回前台時觸發
     */
    async function onVisibilityChange() {
        if (document.visibilityState !== 'visible') return;
        if (!needsSync()) return;
        console.log('[AutoSync] 頁面重新可見，觸發自動同步');
        await trySync(true);
    }

    // ==================== 旋轉圖示（導覽列） ====================

    function showSyncSpinner(active) {
        // 嘗試在導覽列注入同步圖示（若不存在則建立）
        let indicator = document.getElementById('auto-sync-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'auto-sync-indicator';
            indicator.title = '自動同步中...';
            indicator.style.cssText = `
                position: fixed;
                top: 12px;
                right: 12px;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                background: rgba(59, 130, 246, 0.15);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                opacity: 0;
                transition: opacity 0.3s;
                z-index: 199;
                pointer-events: none;
            `;
            indicator.textContent = '⟳';
            document.body.appendChild(indicator);

            // CSS 旋轉動畫
            if (!document.getElementById('auto-sync-spin-style')) {
                const s = document.createElement('style');
                s.id = 'auto-sync-spin-style';
                s.textContent = `
                    #auto-sync-indicator.spinning {
                        opacity: 1;
                        animation: autoSyncSpin 1s linear infinite;
                    }
                    @keyframes autoSyncSpin {
                        from { transform: rotate(0deg); }
                        to   { transform: rotate(360deg); }
                    }
                `;
                document.head.appendChild(s);
            }
        }

        if (active) {
            indicator.classList.add('spinning');
        } else {
            indicator.classList.remove('spinning');
            indicator.style.opacity = '0';
        }
    }

    // ==================== 靜默 Toast ====================

    let _toastEl = null;
    let _toastTimer = null;

    function showSilentToast(msg) {
        if (!_toastEl) {
            _toastEl = document.createElement('div');
            _toastEl.id = 'auto-sync-toast';
            _toastEl.style.cssText = `
                position: fixed;
                bottom: 4.5rem;
                left: 50%;
                transform: translateX(-50%) translateY(8px);
                background: rgba(16, 185, 129, 0.92);
                color: white;
                padding: 0.4rem 1.1rem;
                border-radius: 999px;
                font-size: 0.8rem;
                font-weight: 600;
                letter-spacing: 0.03em;
                pointer-events: none;
                z-index: 8888;
                opacity: 0;
                transition: opacity 0.3s, transform 0.3s;
                white-space: nowrap;
            `;
            document.body.appendChild(_toastEl);
        }

        clearTimeout(_toastTimer);
        _toastEl.textContent = msg;

        requestAnimationFrame(() => {
            _toastEl.style.opacity = '1';
            _toastEl.style.transform = 'translateX(-50%) translateY(0)';
        });

        _toastTimer = setTimeout(() => {
            _toastEl.style.opacity = '0';
            _toastEl.style.transform = 'translateX(-50%) translateY(8px)';
        }, DEFAULTS.toastDuration);
    }

    // ==================== 公開 API ====================

    const AutoSync = {
        /**
         * 啟動自動同步定時器
         * 建議在使用者登入成功後呼叫（google-auth-ui.js 的 showLoggedIn 內）
         */
        start() {
            if (state.running) return;
            state.intervalMs = getIntervalMs();
            state.timer = setInterval(onTimer, state.intervalMs);
            document.addEventListener('visibilitychange', onVisibilityChange);
            state.running = true;
            console.log(`✅ [AutoSync] 自動同步已啟動（每 ${state.intervalMs / 60000} 分鐘）`);
        },

        /** 停止自動同步（用於登出時） */
        stop() {
            if (!state.running) return;
            clearInterval(state.timer);
            state.timer = null;
            document.removeEventListener('visibilitychange', onVisibilityChange);
            state.running = false;
            console.log('[AutoSync] 自動同步已停止');
        },

        /** 外部呼叫：立即執行同步（非靜默，使用現有通知系統） */
        triggerNow() {
            return trySync(false);
        },

        /** 設定同步間隔（分鐘），自動重啟定時器 */
        setIntervalMin(minutes) {
            const min = Math.max(1, Math.min(120, parseInt(minutes, 10) || 10));
            localStorage.setItem(DEFAULTS.settingKey, String(min));
            state.intervalMs = min * 60 * 1000;
            if (state.running) {
                this.stop();
                this.start();
            }
            console.log(`[AutoSync] 同步間隔已更新為 ${min} 分鐘`);
        },

        /** 取得目前設定（分鐘） */
        getIntervalMin() {
            return state.intervalMs / 60000;
        },

        /** 是否正在執行 */
        isRunning: () => state.running,
    };

    // 全域掛載
    window.AutoSync = AutoSync;

    // ==================== 自動啟動鉤子 ====================
    /**
     * 監聽 FirebaseConfig 連線事件：登入後自動啟動 AutoSync
     * 支援兩種方式觸發：
     *  (1) window.onGoogleSignIn（google-auth-ui.js 登入後觸發）
     *  (2) 頁面載入時發現 isConnected() 為 true （已登入狀態）
     */
    function tryAutoStart() {
        if (window.FirebaseConfig?.isConnected?.()) {
            AutoSync.start();
        }
    }

    // 攔截 GoogleAuthUI 的登入完成事件
    const _origOnSignIn = window.onGoogleSignIn;
    window.onGoogleSignIn = function (...args) {
        if (typeof _origOnSignIn === 'function') _origOnSignIn(...args);
        AutoSync.start();
    };

    // 攔截 GoogleAuthUI 的登出事件
    const _origOnSignOut = window.onGoogleSignOut;
    window.onGoogleSignOut = function (...args) {
        if (typeof _origOnSignOut === 'function') _origOnSignOut(...args);
        AutoSync.stop();
    };

    // 頁面載入時：若已登入則直接啟動
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(tryAutoStart, 2000));
    } else {
        setTimeout(tryAutoStart, 2000);
    }

    console.log('✅ auto-sync.js 已載入（自動定時同步模組）');
})();
