/**
 * 自動快轉的時機控制（「能不能換、怎麼換」的判斷與寫入都在 CloudSafety.fastForward）。
 *
 * 科任老師在多台教室電腦間切換時，沒有未同步變更的裝置應該自己跟上雲端，
 * 否則老師一在舊資料上編輯，就會撞上同步衝突。
 *
 * - 剛開啟頁面、老師還沒開始操作：自動換成雲端新版並重新載入，讓所有模組都從新資料啟動。
 * - 使用途中切回分頁或恢復連線：只提示「雲端有新資料」，由老師按下才更新，
 *   避免打斷計時、考試，或洗掉輸入到一半的文字。
 * - 本機有任何未同步的變更時完全不介入，維持原本的比較流程。
 */
(function () {
    'use strict';
    const NOTICE_KEY = 'cloudFastForwardNotice', RELOAD_KEY = 'cloudFastForwardReloadAt';
    const RECHECK_MS = 60000, RELOAD_GUARD_MS = 20000;
    let interacted = false, checking = false, lastCheck = 0, startupDone = false, banner = null;

    const ready = () => !!(window.CloudSafety?.fastForward && window.FirebaseConfig?.isGoogleUser?.() && window.FirebaseConfig?.getDb?.());
    const say = message => { try { window.NotificationSystem?.success?.(message); } catch { /* 提示失敗不影響更新 */ } };
    const session = {
        get(key) { try { return sessionStorage.getItem(key); } catch { return null; } },
        set(key, value) { try { sessionStorage.setItem(key, value); } catch { /* 無痕模式等情況略過 */ } },
        remove(key) { try { sessionStorage.removeItem(key); } catch { /* 同上 */ } },
    };

    function hideBanner() { banner?.remove(); banner = null; }
    function showBanner() {
        if (banner?.isConnected) return;
        banner = document.createElement('div');
        banner.setAttribute('role', 'status');
        banner.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:9000;display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;max-width:min(560px,calc(100vw - 24px));padding:12px 16px;border:1px solid #9cc7e8;border-radius:14px;background:#eff8ff;color:#12344d;box-shadow:0 12px 28px -8px #0f172a59;font-size:15px;line-height:1.6;';
        const text = document.createElement('span');
        text.textContent = '☁️ 這個班級在其他裝置有更新。這台沒有未同步的變更，可以直接換成最新版本。';
        text.style.cssText = 'flex:1 1 220px;';
        const button = (label, primary, action) => {
            const control = document.createElement('button');
            control.type = 'button'; control.textContent = label;
            control.style.cssText = `min-height:44px;padding:8px 16px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;border:1px solid ${primary ? '#1d6fb8' : '#9cc7e8'};background:${primary ? '#1d6fb8' : '#fff'};color:${primary ? '#fff' : '#12344d'};`;
            control.addEventListener('click', action);
            return control;
        };
        banner.append(text, button('立即更新', true, () => apply()), button('稍後', false, hideBanner));
        document.body.append(banner);
    }

    /** 實際換成雲端版本；有更新就重新載入，讓公告、考試、座位等模組也從新資料啟動。 */
    async function apply() {
        hideBanner();
        let result;
        try { result = await window.CloudSafety.fastForward(); }
        catch (error) { console.warn('[CloudFastForward] 更新未完成', error); return 'skipped'; }
        if (result !== 'updated') return result;
        // 剛為了快轉重新載入過就不再重載，避免異常情況下反覆重新整理；此時畫面已由 CloudSafety 就地更新。
        if (Date.now() - Number(session.get(RELOAD_KEY) || 0) < RELOAD_GUARD_MS) { say('☁️ 已更新為雲端最新版本'); return result; }
        session.set(NOTICE_KEY, '1'); session.set(RELOAD_KEY, String(Date.now()));
        location.reload();
        return result;
    }
    /**
     * @param {{auto?: boolean}} [options] auto：允許在老師尚未操作時直接更新；否則一律只提示
     */
    async function check(options = {}) {
        if (checking || !ready() || window.syncStatus?.isSyncing) return 'skipped';
        checking = true; lastCheck = Date.now();
        try {
            const state = await window.CloudSafety.fastForward(undefined, { dryRun: true });
            if (state !== 'newer') { hideBanner(); return state; }
            if (options.auto && !interacted) return await apply();
            showBanner();
            return state;
        } catch (error) {
            // 未登入、離線、讀取失敗都不是需要老師處理的問題；下次再檢查。
            console.warn('[CloudFastForward] 略過這次檢查', error?.message || error);
            return 'skipped';
        } finally { checking = false; }
    }
    function recheck() { if (startupDone && Date.now() - lastCheck >= RECHECK_MS) check(); }

    function watchAuth(attempt = 0) {
        const config = window.FirebaseConfig;
        if (!config?.onAuthStateChanged) return;
        // Firebase 尚未初始化時掛不上監聽，等它就緒再掛（與分享面板相同的時序問題）。
        if (!config.getDb?.()) { if (attempt < 150) setTimeout(() => watchAuth(attempt + 1), 400); return; }
        config.onAuthStateChanged(() => {
            if (startupDone || !ready()) return;
            startupDone = true;
            check({ auto: true });
        });
    }
    function init() {
        for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, () => { interacted = true; }, { capture: true, once: true });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) recheck(); });
        window.addEventListener('focus', recheck);
        window.addEventListener('online', recheck);
        if (session.get(NOTICE_KEY)) {
            session.remove(NOTICE_KEY);
            setTimeout(() => say('☁️ 已自動更新為雲端最新版本（其他裝置的變更已帶入）'), 1200);
        }
        watchAuth();
    }

    window.CloudFastForward = { check, apply };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
