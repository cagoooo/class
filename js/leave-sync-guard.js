/**
 * 離開前雲端同步提醒 v2.0
 *
 * 瀏覽器關閉分頁時只能使用 beforeunload 的原生確認視窗，無法由網頁
 * 自訂視窗文字。本模組另外提供頁面內提醒卡，讓老師在按下關閉前就能
 * 立即同步；只有同步基準確認有差異、明確寫入待同步標記或正在同步時才會攔截離開，
 * 避免單純切班／載入既有資料時打擾老師。
 *
 * 提醒卡不能打斷課堂操作（v2.0）：
 * - 老師正在操作時不出現；停下來一段時間、且變更已經一陣子沒上傳才提醒
 *   （自動同步通常會先處理掉，根本不需要提醒）。
 * - 卡片出現後老師直接繼續操作，卡片自己收起來，一段時間內不再出現。
 * - 按「稍後提醒」就安靜 15 分鐘，期間再怎麼加分都不會跳出來。
 * - 背景自動同步不會把卡片叫出來；只有老師自己按「立即同步」才顯示進度。
 * 關閉分頁時的原生確認視窗不受以上規則影響，仍是最後一道保險。
 */
(function () {
    'use strict';

    const QUIET_MS = 30 * 1000;             // 老師停下操作多久後才可能顯示
    const MIN_PENDING_MS = 2 * 60 * 1000;   // 變更至少多久沒上傳才提醒
    const SNOOZE_MS = 15 * 60 * 1000;       // 按「稍後提醒」後安靜多久
    const SOFT_SNOOZE_MS = 5 * 60 * 1000;   // 沒按按鈕、直接繼續操作後安靜多久
    const EXIT_INTENT_MS = 8 * 1000;        // 滑鼠移出視窗上緣（準備關閉分頁）後的顯示時間
    const SNOOZE_KEY = 'leaveSyncSnoozeUntil';

    const state = {
        banner: null,
        initialized: false,
        timer: null,
        allowInternalNavigation: false,
        internalNavigationTimer: null,
        lastInputAt: Date.now(),
        pendingSince: 0,
        snoozeUntil: 0,
        exitIntentAt: 0,
        userSyncing: false,
    };

    /**
     * 純函式：此刻要不要顯示提醒卡。
     * @param {{active:boolean, syncing:boolean, status:string}} info 同步狀態
     * @param {{visible:boolean, userSyncing:boolean, snoozeUntil:number, exitIntentAt:number, lastInputAt:number, pendingSince:number}} view 互動狀態
     */
    function shouldShow(info, view, now) {
        if (!info.active) return false;
        if (view.userSyncing) return true;               // 老師自己按了同步：顯示進度到結束
        if (info.syncing) return view.visible;           // 背景自動同步不主動跳出來
        if (now < view.snoozeUntil) return false;
        if (view.visible) return true;                   // 已顯示的卡片留著，直到老師繼續操作或按按鈕
        if (now - view.exitIntentAt < EXIT_INTENT_MS) return true;
        if (now - view.lastInputAt < QUIET_MS) return false;
        // 同步衝突需要老師決定，停下來就提醒；一般待上傳則先給自動同步一點時間。
        return info.status === 'conflict' || now - view.pendingSince >= MIN_PENDING_MS;
    }

    function currentClassId() {
        try { return String(localStorage.getItem('currentClassId') || 'default'); }
        catch (e) { return 'default'; }
    }

    function currentClassName() {
        try {
            const profile = window.ClassProfiles?.currentProfile?.();
            return profile?.name || currentClassId();
        } catch (e) { return currentClassId(); }
    }

    function isGoogleUser() {
        try {
            return !!window.FirebaseConfig?.isGoogleUser?.();
        } catch (e) { return false; }
    }

    function cloudStatus() {
        try { return window.CloudSafety?.status?.() || 'offline'; }
        catch (e) { return 'offline'; }
    }

    function isOnline() {
        try {
            return navigator.onLine !== false && !window.OfflineDetector?.isOffline?.();
        } catch (e) { return true; }
    }

    function syncProgress() {
        try {
            if (!window.syncStatus?.isSyncing) return null;
            const value = window.syncStatus?.progress;
            return value && typeof value === 'object' ? value : null;
        } catch (e) { return null; }
    }

    function elapsedText(startedAt) {
        const seconds = Math.max(0, Math.round((Date.now() - Number(startedAt || Date.now())) / 1000));
        return `已等待 ${seconds} 秒`;
    }

    function phaseText(progress) {
        const labels = {
            prepare: '正在準備安全同步',
            snapshot: '正在上傳班級完整快照',
            registry: '正在更新班級清單',
            metadata: '正在寫入同步時間',
            done: '同步即將完成',
            error: '同步需要重新處理',
        };
        return progress?.detail || labels[progress?.phase] || '正在安全同步，請稍候';
    }

    function hasPendingEvidence(id, status, syncing) {
        if (syncing || status === 'conflict') return true;
        if (status !== 'pending') return false;
        try {
            // 指紋差異也可能來自載入時的預設值整理、舊版資料轉換或
            // IndexedDB 回填。只有同步偵測器留下明確的本機寫入標記，
            // 才能確認是老師操作造成的待同步成果。
            if (typeof window.CloudSafety?.hasLocalChangeMarker === 'function') {
                return !!window.CloudSafety.hasLocalChangeMarker(id);
            }
            // 舊版沒有異動標記 API 時，才退回基準判斷，保留相容性。
            return !!window.CloudSafety?.hasBaseline?.(id);
        } catch (e) { return false; }
    }

    function signal() {
        const status = cloudStatus();
        const syncing = !!window.syncStatus?.isSyncing;
        const active = isGoogleUser() && hasPendingEvidence(currentClassId(), status, syncing);
        return {
            id: currentClassId(),
            name: currentClassName(),
            status,
            syncing,
            progress: syncing ? syncProgress() : null,
            active,
            offline: !isOnline(),
        };
    }

    // 「稍後提醒」記在 sessionStorage：切換班級或套用更新造成的重新載入不會讓它失效。
    function loadSnooze() {
        try { return Number(sessionStorage.getItem(SNOOZE_KEY)) || 0; } catch (e) { return 0; }
    }
    function snooze(duration) {
        state.snoozeUntil = Math.max(state.snoozeUntil, Date.now() + duration);
        try { sessionStorage.setItem(SNOOZE_KEY, String(state.snoozeUntil)); } catch (e) { /* 存不了就只在本頁有效 */ }
    }
    function bannerVisible() { return !!state.banner && !state.banner.hidden; }

    function needsReminder() {
        const info = signal();
        return info.active && !info.offline;
    }

    function injectCSS() {
        if (document.getElementById('leave-sync-guard-style')) return;
        const style = document.createElement('style');
        style.id = 'leave-sync-guard-style';
        style.textContent = `
#leave-sync-reminder {
    position: fixed;
    right: 16px;
    bottom: calc(84px + env(safe-area-inset-bottom, 0px));
    width: min(410px, calc(100vw - 32px));
    padding: 16px;
    color: #1e293b;
    background: #ffffff;
    border: 1px solid #bfdbfe;
    border-left: 5px solid #2563eb;
    border-radius: 16px;
    box-shadow: 0 12px 34px rgba(15, 23, 42, 0.22);
    z-index: 9996;
    font-size: 0.92rem;
    line-height: 1.5;
    animation: leaveSyncIn 0.22s ease-out;
}
#leave-sync-reminder[hidden] { display: none; }
#leave-sync-reminder .leave-sync-head { display: flex; align-items: flex-start; gap: 10px; }
#leave-sync-reminder .leave-sync-icon { font-size: 1.45rem; line-height: 1.2; }
#leave-sync-reminder .leave-sync-title { margin: 0; color: #1d4ed8; font-size: 1rem; font-weight: 800; }
#leave-sync-reminder .leave-sync-message { margin: 4px 0 0; color: #475569; }
#leave-sync-reminder .leave-sync-progress { margin-top: 12px; padding: 10px 11px; border-radius: 11px; background: #eff6ff; border: 1px solid #dbeafe; }
#leave-sync-reminder .leave-sync-progress[hidden] { display: none; }
#leave-sync-reminder .leave-sync-progress-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: #1e40af; font-size: .78rem; font-weight: 800; }
#leave-sync-reminder .leave-sync-progress-percent { font-variant-numeric: tabular-nums; }
#leave-sync-reminder .leave-sync-progress-track { height: 9px; margin-top: 7px; overflow: hidden; border-radius: 999px; background: #bfdbfe; }
#leave-sync-reminder .leave-sync-progress-fill { height: 100%; width: 0; border-radius: inherit; background: linear-gradient(90deg, #2563eb, #06b6d4); transition: width .35s ease; }
#leave-sync-reminder .leave-sync-progress-fill.is-indeterminate { width: 42%; animation: leaveSyncProgress 1.15s ease-in-out infinite; }
#leave-sync-reminder .leave-sync-progress-note { margin: 6px 0 0; color: #475569; font-size: .76rem; }
#leave-sync-reminder .leave-sync-actions { display: flex; gap: 8px; margin-top: 12px; }
#leave-sync-reminder button { min-height: 40px; border-radius: 10px; padding: 8px 13px; font: inherit; font-weight: 700; cursor: pointer; }
#leave-sync-reminder .leave-sync-primary { flex: 1; color: #fff; background: #2563eb; border: 1px solid #2563eb; }
#leave-sync-reminder .leave-sync-primary:hover { background: #1d4ed8; }
#leave-sync-reminder .leave-sync-primary:disabled { opacity: 0.65; cursor: wait; }
#leave-sync-reminder .leave-sync-secondary { color: #334155; background: #f8fafc; border: 1px solid #cbd5e1; }
#leave-sync-reminder .leave-sync-secondary:hover { background: #f1f5f9; }
@keyframes leaveSyncIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes leaveSyncProgress { 0%, 100% { transform: translateX(-85%); } 50% { transform: translateX(145%); } }
@media (prefers-reduced-motion: reduce) { #leave-sync-reminder, #leave-sync-reminder .leave-sync-progress-fill { animation: none; } }
@media (max-width: 640px) {
    #leave-sync-reminder {
        left: 12px;
        right: 12px;
        bottom: calc(74px + env(safe-area-inset-bottom, 0px));
        width: auto;
        padding: 14px;
        font-size: 0.88rem;
    }
    #leave-sync-reminder .leave-sync-actions { flex-direction: column; }
    #leave-sync-reminder button { width: 100%; min-height: 44px; }
}
.dark #leave-sync-reminder, body.dark #leave-sync-reminder {
    color: #e2e8f0;
    background: #1e293b;
    border-color: #60a5fa;
}
.dark #leave-sync-reminder .leave-sync-title, body.dark #leave-sync-reminder .leave-sync-title { color: #93c5fd; }
.dark #leave-sync-reminder .leave-sync-message, body.dark #leave-sync-reminder .leave-sync-message { color: #cbd5e1; }
.dark #leave-sync-reminder .leave-sync-progress, body.dark #leave-sync-reminder .leave-sync-progress { background: #172554; border-color: #1e40af; }
.dark #leave-sync-reminder .leave-sync-progress-head, body.dark #leave-sync-reminder .leave-sync-progress-head { color: #bfdbfe; }
.dark #leave-sync-reminder .leave-sync-progress-note, body.dark #leave-sync-reminder .leave-sync-progress-note { color: #cbd5e1; }
.dark #leave-sync-reminder .leave-sync-progress-track, body.dark #leave-sync-reminder .leave-sync-progress-track { background: #1e3a8a; }
.dark #leave-sync-reminder .leave-sync-secondary, body.dark #leave-sync-reminder .leave-sync-secondary { color: #e2e8f0; background: #334155; border-color: #64748b; }
        `;
        document.head.appendChild(style);
    }

    function createBanner() {
        if (state.banner || !document.body) return state.banner;
        const banner = document.createElement('aside');
        banner.id = 'leave-sync-reminder';
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'polite');
        banner.hidden = true;
        banner.innerHTML = `
            <div class="leave-sync-head">
                <span class="leave-sync-icon" aria-hidden="true">☁️</span>
                <div>
                    <p class="leave-sync-title">離開前記得同步班級</p>
                    <p class="leave-sync-message"></p>
                </div>
            </div>
            <div class="leave-sync-progress" hidden>
                <div class="leave-sync-progress-head">
                    <span>同步進度</span>
                    <span class="leave-sync-progress-percent">0%</span>
                </div>
                <div class="leave-sync-progress-track">
                    <div class="leave-sync-progress-fill" role="progressbar" aria-label="班級同步進度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>
                </div>
                <p class="leave-sync-progress-note"></p>
            </div>
            <div class="leave-sync-actions">
                <button type="button" class="leave-sync-primary" data-action="sync">立即同步</button>
                <button type="button" class="leave-sync-secondary" data-action="snooze" title="15 分鐘內不再顯示這個提醒">15 分鐘後再提醒</button>
            </div>
        `;
        banner.querySelector('[data-action="sync"]').addEventListener('click', handlePrimary);
        banner.querySelector('[data-action="snooze"]').addEventListener('click', () => {
            snooze(SNOOZE_MS);
            hideBanner();
        });
        document.body.appendChild(banner);
        state.banner = banner;
        return banner;
    }

    function updateBanner(info) {
        const banner = createBanner();
        if (!banner) return;
        const message = banner.querySelector('.leave-sync-message');
        const action = banner.querySelector('[data-action="sync"]');
        const progressBox = banner.querySelector('.leave-sync-progress');
        const progressFill = banner.querySelector('.leave-sync-progress-fill');
        const progressPercent = banner.querySelector('.leave-sync-progress-percent');
        const progressNote = banner.querySelector('.leave-sync-progress-note');
        if (info.offline) {
            message.textContent = `「${info.name}」班的變更已保留在本機；目前離線，恢復網路後請記得同步到 Google 雲端。`;
            action.textContent = '目前離線';
            action.disabled = true;
        } else if (info.syncing) {
            message.textContent = `「${info.name}」班正在上傳雲端，請等同步完成再關閉頁面。`;
            action.textContent = '同步中…';
            action.disabled = true;
            const progress = info.progress;
            const percent = progress ? Math.max(0, Math.min(100, Number(progress.percent) || 0)) : 24;
            progressBox.hidden = false;
            progressFill.style.width = `${percent}%`;
            progressFill.classList.toggle('is-indeterminate', !progress);
            if (progress) progressFill.setAttribute('aria-valuenow', String(Math.round(percent)));
            else progressFill.removeAttribute('aria-valuenow');
            progressPercent.textContent = progress ? `${Math.round(percent)}%` : '處理中';
            progressNote.textContent = `${phaseText(progress)} · ${elapsedText(progress?.startedAt)}` + (percent >= 90 ? ' · 即將完成' : ' · 通常還需要幾秒');
        } else if (info.status === 'conflict') {
            message.textContent = `「${info.name}」班的雲端版本與本機資料不同，請先比較資料，避免覆蓋成果。`;
            action.textContent = '比較同步差異';
            action.disabled = false;
        } else {
            message.textContent = `「${info.name}」班還有變更尚未上傳。先同步到 Google 雲端，回家或換電腦就能繼續整理。`;
            action.textContent = '立即同步';
            action.disabled = false;
        }
        if (!info.syncing) progressBox.hidden = true;
        banner.hidden = false;
    }

    function hideBanner() {
        if (state.banner) state.banner.hidden = true;
    }

    async function handlePrimary(event) {
        const info = signal();
        const button = event.currentTarget;
        button.disabled = true;
        state.userSyncing = true;
        try {
            if (info.status === 'conflict') {
                await window.CloudSafety?.showConflict?.(info.id);
            } else if (window.FirebaseSync?.syncToCloud) {
                await window.FirebaseSync.syncToCloud();
            }
        } catch (error) {
            window.NotificationSystem?.error?.(`同步未完成：${error.message || '請稍後再試'}`);
        } finally {
            state.userSyncing = false;
            button.disabled = false;
            refresh();
        }
    }

    function refresh() {
        const info = signal(), now = Date.now();
        if (!info.active) {
            state.pendingSince = 0;
            hideBanner();
            return info;
        }
        if (!state.pendingSince) state.pendingSince = now;
        const view = {
            visible: bannerVisible(), userSyncing: state.userSyncing, snoozeUntil: state.snoozeUntil,
            exitIntentAt: state.exitIntentAt, lastInputAt: state.lastInputAt, pendingSince: state.pendingSince,
        };
        if (shouldShow(info, view, now)) updateBanner(info);
        else hideBanner();
        return info;
    }

    /** 老師繼續操作課堂：記下時間；卡片若在畫面上就自己收起來，一段時間內不再出現。 */
    function handleInput(event) {
        state.lastInputAt = Date.now();
        if (!bannerVisible() || state.userSyncing) return;
        if (state.banner.contains(event.target)) return;   // 正在按卡片上的按鈕
        if (window.syncStatus?.isSyncing) return;            // 進度顯示中，讓老師看完
        snooze(SOFT_SNOOZE_MS);
        hideBanner();
    }

    /** 滑鼠從視窗上緣移出，多半是要關閉或切換分頁：這是提醒同步最有用的時機。 */
    function handleExitIntent(event) {
        if (event.relatedTarget || event.clientY > 0) return;
        state.exitIntentAt = Date.now();
        refresh();
    }

    function handleBeforeUnload(event) {
        // 班級切換／新增班級會由程式主動 reload，這是頁面內部導覽，
        // 不應被當成老師關閉頁面而跳出瀏覽器原生確認視窗。
        if (state.allowInternalNavigation) {
            return undefined;
        }
        if (!needsReminder()) return undefined;
        // Chrome / Edge / Safari 只會顯示瀏覽器自己的標準確認文字。
        event.preventDefault?.();
        event.returnValue = '';
        return '';
    }

    function allowInternalNavigation() {
        state.allowInternalNavigation = true;
        clearTimeout(state.internalNavigationTimer);
        state.internalNavigationTimer = setTimeout(() => {
            state.allowInternalNavigation = false;
            state.internalNavigationTimer = null;
        }, 5000);
    }

    function init() {
        if (state.initialized) return;
        state.initialized = true;
        injectCSS();
        createBanner();
        state.snoozeUntil = loadSnooze();
        state.lastInputAt = Date.now();
        for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, handleInput, true);
        document.documentElement?.addEventListener?.('mouseleave', handleExitIntent);
        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('online', refresh);
        window.addEventListener('offline', refresh);
        window.addEventListener('storage', refresh);
        window.addEventListener('class-sync-progress', refresh);
        document.addEventListener('visibilitychange', () => setTimeout(refresh, 80));
        state.timer = setInterval(refresh, 1500);
        refresh();
        console.log('✅ 離開前雲端同步提醒已載入');
    }

    window.LeaveSyncGuard = {
        init,
        refresh,
        needsReminder,
        beforeUnload: handleBeforeUnload,
        show: () => { state.snoozeUntil = 0; state.exitIntentAt = Date.now(); refresh(); },
        hide: () => { snooze(SOFT_SNOOZE_MS); hideBanner(); },
        shouldShow,
        timing: { QUIET_MS, MIN_PENDING_MS, SNOOZE_MS, SOFT_SNOOZE_MS, EXIT_INTENT_MS },
        allowInternalNavigation,
        isInternalNavigation: () => state.allowInternalNavigation,
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
