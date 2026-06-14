/**
 * data-safety-guard.js
 * 🛟 資料保險把關 —— 清除前強制備份，避免悲劇重演
 * @version 3.3.0
 *
 * 背景（真實事故）：
 *   老師頻繁使用班級小管家，瀏覽器累積的網站資料越來越多，跳出「儲存空間已滿」
 *   警告。老師沒多想就用「瀏覽器的清除瀏覽資料」一次清光，結果連 localStorage 裡
 *   的學生互動、加扣分、聯絡簿等紀錄全部消失，且無法復原。
 *
 * ⚠️ 重要前提：
 *   瀏覽器「設定 → 清除瀏覽資料」這個原生動作，網頁【無法攔截】。因此本模組採三層防線：
 *
 *   第 1 層（預防）：儲存空間壓力監測 + 置頂橫幅，在老師「還沒去清」之前就提醒先備份。
 *   第 2 層（把關）：App 內的危險清除按鈕（清除全班、重置分數）一律先過「先備份」閘門。
 *   第 3 層（補救）：配額已滿對話框（class-aware-storage.js）加上「先下載備份」主要按鈕。
 *
 * 備份格式：優先呼叫既有的 DataBackup.export()（與「📥 匯入備份檔案」相容、可還原），
 *           找不到時退而求其次匯出整個 localStorage 完整快照。
 *
 * 對外 API：
 *   window.DataSafetyGuard.guardClear({title, message, dangerLabel}) -> Promise<boolean>
 *   window.DataSafetyGuard.downloadBackup() -> boolean
 *   window.DataSafetyGuard.checkStorage()         手動觸發一次空間檢查
 */
(function () {
    'use strict';

    const LS_LAST_BACKUP = 'dsg_lastBackupAt';
    const LS_SNOOZE = 'dsg_bannerSnoozeUntil';
    const PRESSURE_RATIO = 0.7;                 // 已用 / 總配額 達 70%
    const PRESSURE_BYTES = 50 * 1024 * 1024;    // 或絕對用量達 ~50MB
    const STALE_DAYS = 7;                       // 超過 7 天沒備份就提醒
    const SNOOZE_MS = 24 * 60 * 60 * 1000;      // 「今天不再提醒」snooze 1 天

    // ───────────────── 工具 ─────────────────
    // 直接讀寫（繞過 class-aware-storage 的班級路由攔截，避免讀到錯班別資料）
    function rawGet(k) {
        try { return (window.ClassAwareStorage && ClassAwareStorage.rawGet) ? ClassAwareStorage.rawGet(k) : localStorage.getItem(k); }
        catch (e) { return null; }
    }
    function rawSet(k, v) {
        try { if (window.ClassAwareStorage && ClassAwareStorage.rawSet) ClassAwareStorage.rawSet(k, v); else localStorage.setItem(k, v); }
        catch (e) { /* 配額滿時寫時間戳可能失敗，可忽略 */ }
    }
    function isLoggedInToCloud() {
        try {
            if (window.FirebaseConfig) {
                // 優先用「是否為 Google 登入（非匿名）」判斷，匿名連線不算真正登入
                if (FirebaseConfig.isGoogleUser) return !!FirebaseConfig.isGoogleUser();
                if (FirebaseConfig.isConnected) return !!FirebaseConfig.isConnected();
            }
        } catch (e) { /* ignore */ }
        return false;
    }
    function lastBackupAt() { const v = rawGet(LS_LAST_BACKUP); return v ? parseInt(v, 10) : 0; }
    function daysSince(ts) { return ts ? (Date.now() - ts) / 86400000 : Infinity; }
    function fmtBytes(b) {
        if (b == null) return '未知';
        const mb = b / 1048576;
        return mb >= 1 ? mb.toFixed(1) + ' MB' : (b / 1024).toFixed(0) + ' KB';
    }
    function relTime(ts) {
        if (!ts) return '從未';
        const s = (Date.now() - ts) / 1000;
        if (s < 90) return '剛剛';
        if (s < 3600) return Math.round(s / 60) + ' 分鐘前';
        if (s < 86400) return Math.round(s / 3600) + ' 小時前';
        return Math.round(s / 86400) + ' 天前';
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    // 是否真的有值得保護的資料（任一班級的學生名單非空）
    function hasMeaningfulData() {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k) continue;
                if (/^students(-|$)/.test(k)) {
                    const v = rawGet(k);
                    if (v && v !== '[]' && v.length > 5) return true;
                }
            }
        } catch (e) { /* ignore */ }
        return !!(window.students && window.students.length);
    }
    function localStorageBytes() {
        let n = 0;
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i); if (!k) continue;
                const v = rawGet(k) || '';
                n += (k.length + v.length) * 2; // UTF-16 約 2 bytes/char
            }
        } catch (e) { /* ignore */ }
        return n;
    }
    function estimateUsage() {
        if (navigator.storage && navigator.storage.estimate) {
            return navigator.storage.estimate()
                .then(r => ({ usage: r.usage || 0, quota: r.quota || 0 }))
                .catch(() => ({ usage: localStorageBytes(), quota: 0 }));
        }
        return Promise.resolve({ usage: localStorageBytes(), quota: 0 });
    }

    // ───────────────── 備份 ─────────────────
    // 注意：DataBackup 是 classnew.html 內聯的 `class DataBackup{}` 宣告，
    //       class 宣告不會掛到 window，但會進入「全域語彙環境」，classic script 之間共用，
    //       因此用裸名（typeof 防呆）取得，而非 window.DataBackup。
    function getDB() {
        try { if (typeof DataBackup !== 'undefined' && DataBackup) return DataBackup; } catch (e) { /* ReferenceError */ }
        return window.DataBackup || null;
    }
    // 掛鉤既有 DataBackup.export，讓任何來源的備份都更新「最近備份時間」
    function hookBackup() {
        const DB = getDB();
        if (DB && DB.export && !DB.__dsgHooked) {
            const orig = DB.export.bind(DB);
            DB.export = function () {
                const r = orig();
                rawSet(LS_LAST_BACKUP, String(Date.now()));
                return r;
            };
            DB.__dsgHooked = true;
        }
    }
    function snapshotFallback() {
        try {
            const data = {};
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k || k.startsWith('firebase:')) continue; // 略過 Firebase 離線快取（很大且非必要）
                data[k] = rawGet(k);
            }
            const payload = {
                app: '班級小管家', type: 'full-localStorage-snapshot',
                appVersion: window.APP_VERSION || '', exportedAt: new Date().toISOString(), data
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = '班級小管家_完整備份_' + new Date().toISOString().split('T')[0] + '.json';
            a.click();
            URL.revokeObjectURL(url);
            rawSet(LS_LAST_BACKUP, String(Date.now()));
            if (window.NotificationSystem && NotificationSystem.success) NotificationSystem.success('完整備份已下載');
            return true;
        } catch (e) {
            alert('備份失敗：' + (e && e.message || e));
            return false;
        }
    }
    function downloadBackup() {
        hookBackup();
        const DB = getDB();
        if (DB && DB.export) {
            try {
                DB.export();                         // 已掛鉤，會更新 lastBackup，且與「匯入備份檔」相容可還原
                return true;
            } catch (e) { return snapshotFallback(); }
        }
        return snapshotFallback();
    }
    function getBackupInfo() {
        return { lastBackupAt: lastBackupAt(), cloudLoggedIn: isLoggedInToCloud(), hasData: hasMeaningfulData() };
    }
    function triggerCloudLogin() {
        try {
            if (window.GoogleAuthUI && GoogleAuthUI.login) { GoogleAuthUI.login(); return; }
        } catch (e) { /* ignore */ }
        const btn = document.getElementById('gauth-btn') || document.getElementById('gauth-btn-mobile');
        if (btn) { btn.click(); return; }
        if (window.NotificationSystem && NotificationSystem.info) NotificationSystem.info('請點畫面右上角的「登入」開啟雲端同步');
    }

    // ───────────────── CSS ─────────────────
    function injectCSS() {
        if (document.getElementById('dsg-style')) return;
        const css = `
        .dsg-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100000;display:flex;
            align-items:center;justify-content:center;padding:1rem;animation:dsgFade .2s ease}
        @keyframes dsgFade{from{opacity:0}to{opacity:1}}
        .dsg-box{background:#fff;border-radius:16px;max-width:460px;width:100%;padding:1.6rem;
            box-shadow:0 20px 60px rgba(0,0,0,.35);animation:dsgPop .25s cubic-bezier(.34,1.56,.64,1)}
        @keyframes dsgPop{from{transform:scale(.92);opacity:0}to{transform:scale(1);opacity:1}}
        .dsg-icon{font-size:2.6rem;text-align:center}
        .dsg-title{font-size:1.18rem;font-weight:800;color:#b91c1c;text-align:center;margin:.3rem 0 .5rem}
        .dsg-msg{font-size:.92rem;color:#374151;text-align:center;line-height:1.6;margin-bottom:.8rem}
        .dsg-status{font-size:.8rem;text-align:center;background:#f9fafb;border:1px solid #eef0f2;
            border-radius:10px;padding:.55rem .6rem;margin-bottom:1rem;line-height:1.6}
        .dsg-warn{color:#d97706;font-weight:700}
        .dsg-ok{color:#059669;font-weight:700}
        .dsg-btn{padding:.7rem 1rem;border:none;border-radius:10px;font-weight:700;font-size:.95rem;
            cursor:pointer;transition:transform .1s,box-shadow .15s,background .15s;width:100%}
        .dsg-btn-backup{background:linear-gradient(135deg,#2563eb,#4f46e5);color:#fff;margin-bottom:.55rem}
        .dsg-btn-backup:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(79,70,229,.4)}
        .dsg-btn-backup.done{background:linear-gradient(135deg,#059669,#10b981)}
        .dsg-check{display:flex;align-items:center;gap:.5rem;font-size:.85rem;color:#6b7280;
            justify-content:center;margin-bottom:1rem;cursor:pointer}
        .dsg-check input{width:16px;height:16px;cursor:pointer}
        .dsg-row{display:flex;gap:.6rem}
        .dsg-row .dsg-btn{width:50%}
        .dsg-btn-cancel{background:#f3f4f6;color:#374151}
        .dsg-btn-cancel:hover{background:#e5e7eb}
        .dsg-btn-danger{background:#dc2626;color:#fff}
        .dsg-btn-danger:hover:not(:disabled){background:#b91c1c}
        .dsg-btn-danger:disabled{opacity:.45;cursor:not-allowed}

        .dsg-banner{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem;justify-content:space-between;
            border-radius:14px;padding:.9rem 1.1rem;margin-bottom:1rem;box-shadow:0 6px 18px rgba(0,0,0,.08);
            animation:dsgFade .25s ease}
        .dsg-banner.is-pressure{background:linear-gradient(135deg,#fff1f2,#fef3c7);border:2px solid #fca5a5}
        .dsg-banner.is-stale{background:linear-gradient(135deg,#eff6ff,#f0f9ff);border:2px solid #bfdbfe}
        .dsg-bn-text{flex:1 1 260px;font-size:.92rem;font-weight:700;color:#7f1d1d;line-height:1.5}
        .dsg-banner.is-stale .dsg-bn-text{color:#1e40af}
        .dsg-bn-sub{display:block;font-size:.76rem;font-weight:500;color:#6b7280;margin-top:.25rem}
        .dsg-bn-actions{display:flex;flex-wrap:wrap;gap:.5rem}
        .dsg-bn-btn{border:none;border-radius:9999px;padding:.5rem .95rem;font-weight:700;font-size:.82rem;
            cursor:pointer;white-space:nowrap;transition:transform .1s}
        .dsg-bn-btn:active{transform:scale(.95)}
        .dsg-bn-backup{background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff}
        .dsg-bn-cloud{background:#fff;color:#2563eb;border:1px solid #93c5fd}
        .dsg-bn-dismiss{background:transparent;color:#6b7280;text-decoration:underline}
        `;
        const style = document.createElement('style');
        style.id = 'dsg-style';
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    // ───────────────── 第 2 層：清除前把關閘門 ─────────────────
    function statusLine(info) {
        const b = info.lastBackupAt
            ? '最近備份：<b>' + relTime(info.lastBackupAt) + '</b>'
            : '<span class="dsg-warn">⚠️ 尚未下載過任何備份</span>';
        const c = info.cloudLoggedIn
            ? '<span class="dsg-ok">☁️ 已登入雲端（多一層保障）</span>'
            : '<span class="dsg-warn">☁️ 未登入雲端</span>';
        return b + '　・　' + c;
    }

    function guardClear(opts) {
        opts = opts || {};
        injectCSS();
        return new Promise(resolve => {
            if (document.getElementById('dsg-gate')) { resolve(false); return; }
            const info = getBackupInfo();
            const overlay = document.createElement('div');
            overlay.id = 'dsg-gate';
            overlay.className = 'dsg-overlay';
            overlay.innerHTML = `
                <div class="dsg-box" role="dialog" aria-modal="true">
                    <div class="dsg-icon">🛟</div>
                    <div class="dsg-title">${escapeHtml(opts.title || '清除前，請先備份！')}</div>
                    <div class="dsg-msg">${escapeHtml(opts.message || '此操作會永久刪除資料，且無法復原。')}<br>
                        <b style="color:#b91c1c">曾有老師因此遺失整學期紀錄 —— 請先下載備份再繼續。</b></div>
                    <div class="dsg-status">${statusLine(info)}</div>
                    <button class="dsg-btn dsg-btn-backup" data-act="backup">📥 立即下載備份檔</button>
                    <label class="dsg-check"><input type="checkbox" data-act="ack"> 我確認已經自行備份過了</label>
                    <div class="dsg-row">
                        <button class="dsg-btn dsg-btn-cancel" data-act="cancel">取消</button>
                        <button class="dsg-btn dsg-btn-danger" data-act="confirm" disabled>${escapeHtml(opts.dangerLabel || '確定清除')}</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);

            const danger = overlay.querySelector('[data-act="confirm"]');
            const ack = overlay.querySelector('[data-act="ack"]');
            const backupBtn = overlay.querySelector('[data-act="backup"]');
            let backedUp = false;
            const refresh = () => { danger.disabled = !(backedUp || ack.checked); };
            const close = (val) => {
                document.removeEventListener('keydown', onEsc);
                overlay.remove();
                resolve(val);
            };
            function onEsc(e) { if (e.key === 'Escape') close(false); }

            backupBtn.addEventListener('click', () => {
                if (downloadBackup()) {
                    backedUp = true;
                    backupBtn.textContent = '✅ 已下載備份，現在可以安全清除';
                    backupBtn.classList.add('done');
                    refresh();
                }
            });
            ack.addEventListener('change', refresh);
            overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => close(false));
            danger.addEventListener('click', () => { if (!danger.disabled) close(true); });
            overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
            document.addEventListener('keydown', onEsc);
        });
    }

    // ───────────────── 第 1 層：儲存空間壓力 / 備份過期橫幅 ─────────────────
    function bannerHost() {
        const sec = document.getElementById('students-section');
        return (sec && sec.parentElement) || document.body;
    }
    function showBanner(state) {
        if (document.getElementById('dsg-banner')) return;
        injectCSS();
        const bar = document.createElement('div');
        bar.id = 'dsg-banner';
        bar.className = 'dsg-banner ' + (state.pressure ? 'is-pressure' : 'is-stale');
        const usageTxt = state.est && state.est.usage ? '（目前已用約 ' + fmtBytes(state.est.usage) + '）' : '';
        const headline = state.pressure
            ? '⚠️ 瀏覽器儲存空間偏高' + usageTxt + '，清除前請務必先下載備份！'
            : '📅 你已經超過 ' + STALE_DAYS + ' 天沒備份了，建議現在下載一份，以免資料意外消失。';
        const cloudBtn = isLoggedInToCloud() ? '' : '<button class="dsg-bn-btn dsg-bn-cloud" data-act="cloud">☁️ 登入雲端同步</button>';
        bar.innerHTML = `
            <div class="dsg-bn-text">${headline}
                <span class="dsg-bn-sub">提醒：清除瀏覽器的「暫存／Cookie／網站資料」會一併刪掉本機的學生、加扣分與互動紀錄，且無法復原。</span>
            </div>
            <div class="dsg-bn-actions">
                <button class="dsg-bn-btn dsg-bn-backup" data-act="backup">📥 立即下載備份</button>
                ${cloudBtn}
                <button class="dsg-bn-btn dsg-bn-dismiss" data-act="dismiss">今天不再提醒</button>
            </div>`;
        const host = bannerHost();
        host.insertBefore(bar, host.firstChild);

        bar.querySelector('[data-act="backup"]').addEventListener('click', () => {
            if (downloadBackup()) {
                bar.querySelector('.dsg-bn-text').innerHTML =
                    '✅ 備份已下載！請把這個檔案存到電腦或雲端硬碟。現在清除暫存就安全了。';
                setTimeout(() => bar.remove(), 5000);
            }
        });
        const cloud = bar.querySelector('[data-act="cloud"]');
        if (cloud) cloud.addEventListener('click', triggerCloudLogin);
        bar.querySelector('[data-act="dismiss"]').addEventListener('click', () => {
            rawSet(LS_SNOOZE, String(Date.now() + SNOOZE_MS));
            bar.remove();
        });
    }

    function checkStorage(force) {
        if (!hasMeaningfulData()) return;
        if (!force) {
            const snooze = parseInt(rawGet(LS_SNOOZE) || '0', 10);
            if (Date.now() < snooze) return;
        }
        estimateUsage().then(est => {
            const ratio = est.quota ? est.usage / est.quota : 0;
            const pressure = est.usage >= PRESSURE_BYTES || ratio >= PRESSURE_RATIO;
            const stale = daysSince(lastBackupAt()) >= STALE_DAYS;
            if (pressure || stale) showBanner({ pressure, stale, est });
        });
    }

    // ───────────────── 對外 API ─────────────────
    window.DataSafetyGuard = {
        guardClear,
        downloadBackup,
        getBackupInfo,
        checkStorage: () => checkStorage(true)
    };

    // ───────────────── 啟動 ─────────────────
    function boot() {
        injectCSS();
        hookBackup();
        // 載入後稍等，待各模組就緒、學生資料載入完成再檢查
        setTimeout(() => checkStorage(false), 4000);
        // 每 10 分鐘複查一次（老師長時間開著，空間會持續累積）
        setInterval(() => checkStorage(false), 10 * 60 * 1000);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
