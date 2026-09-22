/**
 * 離開前雲端同步提醒 v1.0
 *
 * 瀏覽器關閉分頁時只能使用 beforeunload 的原生確認視窗，無法由網頁
 * 自訂視窗文字。本模組另外提供頁面內提醒卡，讓老師在按下關閉前就能
 * 立即同步；只有同步基準確認有差異、明確寫入待同步標記或正在同步時才會攔截離開，
 * 避免單純切班／載入既有資料時打擾老師。
 */
(function () {
    'use strict';

    const state = {
        banner: null,
        lastSignal: '',
        dismissed: false,
        initialized: false,
        timer: null,
    };

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
            // 有同步基準時，指紋不同就是可驗證的本機異動；沒有基準時，
            // 必須有使用者資料寫入標記，避免單純切班／載入既有資料就跳提醒。
            return !!window.CloudSafety?.hasBaseline?.(id) || !!window.CloudSafety?.hasLocalChangeMarker?.(id);
        } catch (e) { return false; }
    }

    function localFingerprint() {
        try {
            const values = window.CloudSafety?.capture?.(currentClassId());
            return values && window.CloudSafety?.fingerprint?.(values) || '';
        } catch (e) { return ''; }
    }

    function signal() {
        const status = cloudStatus();
        const syncing = !!window.syncStatus?.isSyncing;
        const active = isGoogleUser() && hasPendingEvidence(currentClassId(), status, syncing);
        const fingerprint = active ? localFingerprint() : '';
        return {
            id: currentClassId(),
            name: currentClassName(),
            status,
            syncing,
            progress: syncing ? syncProgress() : null,
            active,
            offline: !isOnline(),
            signature: `${currentClassId()}:${status}:${syncing ? 'syncing' : 'idle'}:${isOnline() ? 'online' : 'offline'}:${fingerprint}:${syncProgress()?.percent || 0}:${syncProgress()?.phase || ''}`,
        };
    }

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
                <button type="button" class="leave-sync-secondary" data-action="snooze">稍後提醒</button>
            </div>
        `;
        banner.querySelector('[data-action="sync"]').addEventListener('click', handlePrimary);
        banner.querySelector('[data-action="snooze"]').addEventListener('click', () => {
            state.dismissed = true;
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
        try {
            if (info.status === 'conflict') {
                await window.CloudSafety?.showConflict?.(info.id);
            } else if (window.FirebaseSync?.syncToCloud) {
                await window.FirebaseSync.syncToCloud();
            }
        } catch (error) {
            window.NotificationSystem?.error?.(`同步未完成：${error.message || '請稍後再試'}`);
        } finally {
            button.disabled = false;
            refresh();
        }
    }

    function refresh() {
        const info = signal();
        if (!info.active) {
            state.dismissed = false;
            state.lastSignal = '';
            hideBanner();
            return info;
        }
        if (info.signature !== state.lastSignal) {
            state.lastSignal = info.signature;
            state.dismissed = false;
        }
        if (!state.dismissed) updateBanner(info);
        return info;
    }

    function handleBeforeUnload(event) {
        if (!needsReminder()) return undefined;
        // Chrome / Edge / Safari 只會顯示瀏覽器自己的標準確認文字。
        event.preventDefault?.();
        event.returnValue = '';
        return '';
    }

    function init() {
        if (state.initialized) return;
        state.initialized = true;
        injectCSS();
        createBanner();
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
        show: () => { state.dismissed = false; refresh(); },
        hide: () => { state.dismissed = true; hideBanner(); },
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
