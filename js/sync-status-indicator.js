/**
 * 同步狀態常駐指示器 v1.0（v3.1.0 新增）
 *
 * 目的：讓老師隨時知道「資料是否已安全上雲」，並提供一鍵觸發同步。
 *      取代之前需要點開 Google 帳號下拉選單才看得到上次同步時間的設計。
 *
 * 狀態分四類：
 *   🟢 synced   - 已同步（lastSyncTime < 2 分鐘，且沒有未同步的本地改動）
 *   🟡 pending  - 有未同步的本地改動（setItem 後尚未觸發同步）
 *   🔴 error    - 最近一次同步失敗 / 網路錯誤
 *   ⚫ offline  - 未登入 Google 帳號 or 離線
 *
 * 顯示位置：右下角懸浮圓形圖示（z-index 999）
 *
 * 互動：
 *   - hover 顯示詳細狀態（上次同步時間、未同步項目數）
 *   - click 立即觸發同步（已登入者）/ 顯示登入提示（未登入者）
 */
(function () {
    'use strict';

    const STATES = {
        synced: { color: '#10b981', icon: '✅', label: '已同步', title: '所有資料已安全儲存至雲端' },
        pending: { color: '#f59e0b', icon: '🔄', label: '有未同步變更', title: '有新變動尚未同步到雲端' },
        syncing: { color: '#3b82f6', icon: '☁️', label: '同步中', title: '正在上傳到雲端...' },
        error: { color: '#ef4444', icon: '⚠️', label: '同步失敗', title: '最近一次同步失敗，點擊重試' },
        offline: { color: '#9ca3af', icon: '☁️', label: '未登入', title: '登入 Google 帳號即可自動同步' },
    };

    let currentState = 'offline';
    let lastChangedAt = null;  // 最後一次 setItem 時間（pending 計時用）
    let updateAvailable = false;  // v3.1.3：是否有新版本可套用

    // ── CSS 注入 ──
    function injectCSS() {
        if (document.getElementById('sync-status-style')) return;
        const s = document.createElement('style');
        s.id = 'sync-status-style';
        s.textContent = `
/* 定位於「一鍵更新」按鈕（#pwaManualUpdateBtn，bottom:24px right:24px 寬約 130px）左側，避免重疊 */
#sync-status-indicator {
    position: fixed;
    bottom: 28px;
    right: 172px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 9998;
    transition: all 0.25s;
    border: 2px solid currentColor;
    font-size: 1.1rem;
}
#sync-status-indicator:hover {
    transform: scale(1.1);
    box-shadow: 0 6px 20px rgba(0,0,0,0.18);
}
#sync-status-indicator.syncing {
    animation: ssiPulse 1.2s ease-in-out infinite;
}
@keyframes ssiPulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.08); box-shadow: 0 6px 24px rgba(59,130,246,0.45); }
}
/* v3.1.3：有新版本時顯示的小紅點徽章 */
#sync-status-indicator .ssi-update-dot {
    position: absolute;
    top: -2px;
    right: -2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #3b82f6;
    border: 2px solid #fff;
    box-shadow: 0 0 0 0 rgba(59,130,246,0.7);
    animation: ssiDotPulse 2s infinite;
}
@keyframes ssiDotPulse {
    0% { box-shadow: 0 0 0 0 rgba(59,130,246,0.7); }
    70% { box-shadow: 0 0 0 8px rgba(59,130,246,0); }
    100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); }
}
#sync-status-tooltip {
    position: fixed;
    bottom: 78px;
    right: 152px;
    background: #1f2937;
    color: #fff;
    padding: 0.6rem 0.9rem;
    border-radius: 8px;
    font-size: 0.85rem;
    max-width: 240px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s;
    z-index: 9997;
    line-height: 1.4;
}
#sync-status-tooltip.show { opacity: 1; }
#sync-status-tooltip::after {
    content: '';
    position: absolute;
    bottom: -6px;
    right: 20px;
    width: 0; height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid #1f2937;
}
.sync-tooltip-title { font-weight: 700; margin-bottom: 0.25rem; }
.sync-tooltip-detail { font-size: 0.75rem; color: #d1d5db; }
/* 手機版：一鍵更新按鈕位置為 bottom:16px right:16px 寬約 110px */
@media (max-width: 640px) {
    #sync-status-indicator {
        width: 36px;
        height: 36px;
        font-size: 1rem;
        bottom: 18px;
        right: 140px;
    }
    #sync-status-tooltip {
        bottom: 62px;
        right: 16px;
        font-size: 0.78rem;
        max-width: calc(100vw - 32px);
    }
    #sync-status-tooltip::after {
        right: 150px;
    }
}
        `;
        document.head.appendChild(s);
    }

    // ── 產生 UI ──
    function injectUI() {
        if (document.getElementById('sync-status-indicator')) return;

        const btn = document.createElement('div');
        btn.id = 'sync-status-indicator';
        btn.title = '';
        btn.addEventListener('click', handleClick);
        btn.addEventListener('mouseenter', showTooltip);
        btn.addEventListener('mouseleave', hideTooltip);
        document.body.appendChild(btn);

        const tooltip = document.createElement('div');
        tooltip.id = 'sync-status-tooltip';
        document.body.appendChild(tooltip);

        updateUI();
    }

    function updateUI() {
        const btn = document.getElementById('sync-status-indicator');
        if (!btn) return;
        const state = STATES[currentState];
        const dotHtml = updateAvailable ? '<span class="ssi-update-dot"></span>' : '';
        btn.innerHTML = state.icon + dotHtml;
        btn.style.color = state.color;
        btn.classList.toggle('syncing', currentState === 'syncing');
        btn.title = updateAvailable
            ? '有新版本可套用（點擊套用 & 重新整理）'
            : state.title;
    }

    function showTooltip() {
        const tt = document.getElementById('sync-status-tooltip');
        if (!tt) return;
        const state = STATES[currentState];
        const lastSync = localStorage.getItem('lastSyncTime');
        const lastSyncText = lastSync
            ? '上次同步：' + formatRelativeTime(new Date(lastSync))
            : '從未同步';
        // v3.1.3：若有新版本可用，tooltip 優先顯示更新提示
        if (updateAvailable) {
            tt.innerHTML = `
                <div class="sync-tooltip-title">🎁 新版本可用</div>
                <div>點擊套用更新並重新整理</div>
                <div class="sync-tooltip-detail">${lastSyncText}</div>
            `;
        } else {
            tt.innerHTML = `
                <div class="sync-tooltip-title">${state.label}</div>
                <div>${state.title}</div>
                <div class="sync-tooltip-detail">${lastSyncText}</div>
            `;
        }
        tt.classList.add('show');
    }
    function hideTooltip() {
        document.getElementById('sync-status-tooltip')?.classList.remove('show');
    }

    function formatRelativeTime(date) {
        const diff = (Date.now() - date.getTime()) / 1000;
        if (diff < 60) return '剛才';
        if (diff < 3600) return Math.floor(diff / 60) + ' 分鐘前';
        if (diff < 86400) return Math.floor(diff / 3600) + ' 小時前';
        return Math.floor(diff / 86400) + ' 天前';
    }

    function setState(name) {
        if (!STATES[name]) return;
        currentState = name;
        updateUI();
    }

    // ── 處理點擊 ──
    async function handleClick() {
        hideTooltip();

        // v3.1.3：若有新版本可用，優先處理「套用更新」
        if (updateAvailable) {
            if (window.PWAInstaller?.applyPendingUpdate) {
                const applied = window.PWAInstaller.applyPendingUpdate();
                if (applied && typeof NotificationSystem !== 'undefined') {
                    NotificationSystem.info('正在套用新版本，即將重新整理...');
                }
            } else {
                window.location.reload();
            }
            return;
        }

        if (currentState === 'offline') {
            // 未登入 → 提示登入
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.info('請點擊右上角的「Google 登入」按鈕啟用雲端同步');
            } else {
                alert('請先登入 Google 帳號以啟用雲端同步');
            }
            return;
        }
        if (currentState === 'syncing') return;
        // 其他狀態（synced/pending/error）都可觸發手動同步
        if (window.FirebaseSync?.syncToCloud) {
            setState('syncing');
            try {
                const ok = await window.FirebaseSync.syncToCloud();
                setState(ok ? 'synced' : 'error');
                lastChangedAt = null;
            } catch (e) {
                console.error('[SyncStatus] 手動同步失敗:', e);
                setState('error');
            }
        }
    }

    // ── 監聽登入狀態 & 同步事件 ──
    function bindAuthListener() {
        if (!window.FirebaseConfig?.onAuthStateChanged) {
            // Firebase 尚未就緒，稍後重試
            setTimeout(bindAuthListener, 500);
            return;
        }
        window.FirebaseConfig.onAuthStateChanged((user, profile) => {
            if (user && !user.isAnonymous && profile) {
                // 已登入：根據最後同步時間判斷
                updateStateBasedOnSync();
            } else {
                setState('offline');
            }
        });
    }

    function updateStateBasedOnSync() {
        const lastSync = localStorage.getItem('lastSyncTime');
        if (!lastSync) {
            setState('pending');  // 已登入但從未同步
            return;
        }
        const age = (Date.now() - new Date(lastSync).getTime()) / 1000;
        // 若最後 setItem 發生在最後同步之後，視為 pending
        if (lastChangedAt && lastChangedAt > new Date(lastSync).getTime()) {
            setState('pending');
        } else if (age < 120) {
            setState('synced');
        } else {
            setState('pending');  // 超過 2 分鐘沒同步，提醒使用者
        }
    }

    // ── 攔截 localStorage.setItem 偵測「未同步變動」 ──
    // 注意：此攔截在 class-aware-storage.js 之後執行，所以是疊加攔截
    function setupChangeDetection() {
        const proto = Storage.prototype;
        const orig = proto.setItem;
        // 會觸發 pending 狀態的 key（只有使用者資料類）
        const USER_DATA_KEYS = [
            'students', 'pointsHistory', 'groups',
            'notebookEntries', 'homeworkList', 'homeworkChecks',
            'lotteryHistory', 'classAnnouncements',
            'examSubjects', 'examReminders', 'examAttendance', 'examAbsenceRecords',
            'seatingConfig', 'drawnStudentIds',
        ];
        const isUserKey = (k) => USER_DATA_KEYS.some(uk => k === uk || k.startsWith(uk + '-'));

        proto.setItem = function (key, value) {
            const result = orig.call(this, key, value);
            try {
                if (isUserKey(key) && currentState !== 'offline' && currentState !== 'syncing') {
                    lastChangedAt = Date.now();
                    if (currentState === 'synced') setState('pending');
                }
            } catch (e) { /* 不影響原有功能 */ }
            return result;
        };
    }

    // ── 初始化 ──
    function init() {
        injectCSS();
        injectUI();
        setupChangeDetection();
        bindAuthListener();

        // 定期刷新 tooltip 內的「幾分鐘前」文字，並在超過 2 分鐘時自動從 synced → pending
        setInterval(() => {
            if (currentState === 'synced') updateStateBasedOnSync();
        }, 60000);

        console.log('✅ 同步狀態指示器已載入');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 900));
    } else {
        setTimeout(init, 900);
    }

    // ── 更新可用狀態（v3.1.3：由 pwa-install.js 呼叫） ──
    function setUpdateAvailable(hasUpdate) {
        updateAvailable = !!hasUpdate;
        updateUI();
    }

    // 監聽全域事件（若 pwa-install.js 晚於此模組載入，透過事件也能收到）
    window.addEventListener('pwa-update-available', () => setUpdateAvailable(true));

    // 若 pwa-install.js 已在初始化前標記 __pwaUpdateAvailable，補上狀態
    if (window.__pwaUpdateAvailable) setUpdateAvailable(true);

    // 暴露給外部
    window.SyncStatusIndicator = { setState, updateStateBasedOnSync, setUpdateAvailable };
})();
