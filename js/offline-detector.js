/**
 * 離線狀態偵測模組（Offline Detector）
 * P12 功能實作 v1.0.0  2026-03-03
 *
 * 功能：
 * - 斷網時：頂部顯示黃色警告 Banner，提示資料已暫存 IDB
 * - 恢復連線：Banner 自動消失，觸發一次 AutoSync（若已登入）
 * - 初次載入時若已離線：立即顯示 Banner
 * - 深色模式相容：自動偵測 [data-theme="dark"]
 *
 * 依賴：
 * - window.AutoSync（可選，auto-sync.js）
 * - window.NotificationSystem（可選，notification.js）
 *
 * 全域 API：
 *   OfflineDetector.init()   — 初始化並開始監聽（通常自動呼叫）
 *   OfflineDetector.isOffline() — 取得目前離線狀態
 */

(function () {
    'use strict';

    // ==================== 狀態 ====================

    const state = {
        offline: false,
        banner: null,
    };

    // ==================== Banner 操作 ====================

    function showBanner() {
        if (state.banner) return;

        const banner = document.createElement('div');
        banner.id = 'offline-banner';
        banner.setAttribute('role', 'alert');
        banner.setAttribute('aria-live', 'assertive');

        banner.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 19997;
            background: #f59e0b;
            color: #1c1917;
            text-align: center;
            padding: 7px 1rem;
            font-size: 0.875rem;
            font-weight: 600;
            letter-spacing: 0.01em;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            transform: translateY(-100%);
            transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
        `;

        // 圖示 + 文字 + 關閉按鈕
        banner.innerHTML = `
            <span style="font-size:1.1rem" aria-hidden="true">📵</span>
            <span>目前離線中 — 資料已安全暫存於本機 IndexedDB，恢復網路後將自動同步</span>
            <button id="offline-banner-close"
                title="關閉提示（離線狀態仍存在）"
                style="
                    background: rgba(0,0,0,0.12);
                    border: none;
                    border-radius: 4px;
                    padding: 1px 6px;
                    cursor: pointer;
                    font-size: 0.9rem;
                    margin-left: 8px;
                    color: inherit;
                    flex-shrink: 0;
                " aria-label="關閉離線提示">✕</button>
        `;

        document.body.prepend(banner);
        state.banner = banner;

        // 滑入動畫（nextTick）
        requestAnimationFrame(() => {
            banner.style.transform = 'translateY(0)';
        });

        // 關閉按鈕：僅隱藏 Banner，不影響離線偵測
        banner.querySelector('#offline-banner-close')?.addEventListener('click', () => {
            hideBanner(true /* userClosed */);
        });

        // 深色模式相容
        applyTheme(banner);

        // 同步更新 body padding，避免 Banner 遮住導覽列
        updateBodyPadding(true);
    }

    function hideBanner(userClosed = false) {
        if (!state.banner) return;

        state.banner.style.transform = 'translateY(-100%)';
        const toRemove = state.banner;

        setTimeout(() => {
            toRemove.remove();
            if (state.banner === toRemove) state.banner = null;
        }, 380);

        updateBodyPadding(false);

        if (!userClosed) {
            // 恢復連線：顯示成功提示
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.success('✅ 網路已恢復！正在同步資料...');
            } else {
                console.log('[OfflineDetector] ✅ 網路已恢復');
            }
        }
    }

    function applyTheme(banner) {
        const isDark = document.documentElement.dataset.theme === 'dark' ||
            document.body.dataset.theme === 'dark';
        if (isDark) {
            banner.style.background = '#92400e';
            banner.style.color = '#fef3c7';
        }
    }

    /** 動態調整 body/nav 的 top padding，避免 Banner 遮住內容 */
    function updateBodyPadding(show) {
        const BANNER_HEIGHT = 38; // px
        const nav = document.querySelector('nav');
        if (show) {
            if (nav) nav.style.marginTop = BANNER_HEIGHT + 'px';
        } else {
            if (nav) nav.style.marginTop = '';
        }
    }

    // ==================== 網路事件監聽 ====================

    function onOnline() {
        if (!state.offline) return;
        state.offline = false;
        console.log('[OfflineDetector] 🌐 網路已恢復');
        hideBanner(false);

        // 延遲一秒讓連線穩定後再觸發同步
        setTimeout(() => {
            if (window.AutoSync?.isRunning?.()) {
                window.AutoSync.triggerNow();
            }
        }, 1200);
    }

    function onOffline() {
        if (state.offline) return;
        state.offline = true;
        console.log('[OfflineDetector] 📵 裝置離線');
        showBanner();
    }

    // ==================== 主題切換監聽 ====================

    function watchThemeChange() {
        // 監聽 [data-theme] 屬性變更（使用 MutationObserver）
        const observer = new MutationObserver(() => {
            if (state.banner) applyTheme(state.banner);
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });
        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['data-theme']
        });
    }

    // ==================== 公開 API ====================

    const OfflineDetector = {
        init() {
            window.addEventListener('online', onOnline);
            window.addEventListener('offline', onOffline);
            watchThemeChange();

            // 初次載入：若已離線立即顯示
            if (!navigator.onLine) {
                state.offline = true;
                // 稍微延遲，確保 DOM 已完全載入
                setTimeout(showBanner, 500);
            }

            console.log(`✅ [OfflineDetector] 離線偵測已啟動（目前：${navigator.onLine ? '線上' : '離線'}）`);
        },

        isOffline: () => state.offline,
    };

    // 全域掛載
    window.OfflineDetector = OfflineDetector;

    // ==================== 自動初始化 ====================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', OfflineDetector.init.bind(OfflineDetector));
    } else {
        OfflineDetector.init();
    }

    console.log('✅ offline-detector.js 已載入（離線狀態偵測模組）');
})();
