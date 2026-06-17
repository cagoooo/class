/**
 * health-panel.js — 版本與健康狀態面板（R-C1 / R-C2）
 *
 * 目的：老師回報問題時，一眼（或截圖）就能判斷「是舊版快取還是真 bug」，
 *       並明確顯示目前登入的是哪個 Google 帳號（避免兩帳號登錯看不到資料）。
 *
 * 顯示：App 版本 · Service Worker 狀態 · 上次同步時間 · 登入帳號 · 本地/雲端班級數
 * 入口：點版本徽章（#app-version-badge）或帳號選單「🩺 版本與健康狀態」
 * 全域 API：window.HealthPanel.open()
 */
(function () {
    'use strict';

    function fmtTime(iso) {
        if (!iso) return '從未';
        const t = Date.parse(iso);
        if (!t) return '從未';
        return new Date(t).toLocaleString('zh-TW');
    }

    function localClassCount() {
        try {
            const profiles = JSON.parse(localStorage.getItem('classProfiles') || '[]');
            // 含預設班
            const hasDefault = profiles.some(p => String(p.id) === 'default');
            return profiles.length + (hasDefault ? 0 : 1);
        } catch { return 1; }
    }

    async function swState() {
        try {
            if (!('serviceWorker' in navigator)) return { text: '不支援', updatable: false };
            const reg = await navigator.serviceWorker.getRegistration();
            if (!reg) return { text: '未註冊', updatable: false };
            if (reg.waiting) return { text: '有新版待更新 ⬆️', updatable: true };
            if (reg.active && navigator.serviceWorker.controller) return { text: '啟用中 ✅', updatable: false };
            if (reg.installing) return { text: '安裝中…', updatable: false };
            return { text: '啟用中 ✅', updatable: false };
        } catch { return { text: '無法取得', updatable: false }; }
    }

    function account() {
        try {
            const p = (window.FirebaseConfig && window.FirebaseConfig.getCurrentProfile && window.FirebaseConfig.getCurrentProfile())
                || JSON.parse(localStorage.getItem('firebaseUserProfile') || 'null');
            if (p && p.email && !p.isAnonymous) return { email: p.email, name: p.displayName || '', loggedIn: true };
            return { email: '（未登入 / 訪客）', name: '', loggedIn: false };
        } catch { return { email: '（未登入 / 訪客）', name: '', loggedIn: false }; }
    }

    async function cloudClassCount() {
        try {
            if (!(window.FirebaseConfig && window.FirebaseConfig.isConnected && window.FirebaseConfig.isConnected())) return null;
            if (!window.FirebaseSync || !window.FirebaseSync.fetchCloudClassProfiles) return null;
            const [profs, disc] = await Promise.all([
                window.FirebaseSync.fetchCloudClassProfiles(),
                window.FirebaseSync.discoverCloudClasses ? window.FirebaseSync.discoverCloudClasses() : Promise.resolve([]),
            ]);
            const ids = new Set([...(profs || []), ...(disc || [])].map(p => String(p.id)));
            ids.add('default');
            return ids.size;
        } catch { return null; }
    }

    function injectStyles() {
        if (document.getElementById('health-panel-style')) return;
        const s = document.createElement('style');
        s.id = 'health-panel-style';
        s.textContent = `
        #health-panel-overlay { display:none; position:fixed; inset:0; z-index:10050;
            background:rgba(15,23,42,.55); backdrop-filter:blur(4px); align-items:center; justify-content:center; padding:16px; }
        #health-panel-overlay.open { display:flex; }
        #health-panel-card { background:#fff; border-radius:18px; max-width:420px; width:100%;
            box-shadow:0 24px 70px rgba(0,0,0,.3); overflow:hidden; animation:hpIn .2s ease; }
        @keyframes hpIn { from{opacity:0; transform:translateY(10px) scale(.98);} to{opacity:1; transform:none;} }
        #health-panel-card .hp-head { background:linear-gradient(135deg,#0ea5e9,#6366f1); color:#fff; padding:16px 20px; font-weight:800; font-size:1.1rem; }
        #health-panel-card .hp-body { padding:8px 20px 4px; }
        .hp-row { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px 2px; border-bottom:1px solid #f1f5f9; font-size:.9rem; }
        .hp-row:last-child { border-bottom:none; }
        .hp-row .hp-k { color:#64748b; flex-shrink:0; }
        .hp-row .hp-v { color:#1e293b; font-weight:600; text-align:right; word-break:break-all; }
        .hp-v.hp-acct { color:#0369a1; }
        .hp-v.hp-warn { color:#b45309; }
        #health-panel-card .hp-foot { padding:12px 20px 18px; display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
        .hp-btn { padding:9px 16px; border-radius:9px; border:none; font-size:.86rem; font-weight:700; cursor:pointer; }
        .hp-btn.primary { background:#3b82f6; color:#fff; }
        .hp-btn.ghost { background:#f1f5f9; color:#334155; }
        .hp-btn.update { background:#f59e0b; color:#fff; }
        #health-panel-card .hp-link { color:#6366f1; font-size:.8rem; text-decoration:none; align-self:center; margin-right:auto; }
        `;
        document.head.appendChild(s);
    }

    function ensureCard() {
        injectStyles();
        let ov = document.getElementById('health-panel-overlay');
        if (ov) return ov;
        ov = document.createElement('div');
        ov.id = 'health-panel-overlay';
        ov.innerHTML = `
            <div id="health-panel-card" role="dialog" aria-label="版本與健康狀態">
                <div class="hp-head">🩺 版本與健康狀態</div>
                <div class="hp-body" id="hp-body"></div>
                <div class="hp-foot">
                    <a class="hp-link" href="https://github.com/cagoooo/class/blob/main/CHANGELOG.md" target="_blank" rel="noopener">更新紀錄 ↗</a>
                    <button class="hp-btn ghost" id="hp-copy">📋 複製診斷資訊</button>
                    <button class="hp-btn update" id="hp-update" style="display:none;">⬆️ 立即更新</button>
                    <button class="hp-btn primary" id="hp-close">關閉</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov) close(); });
        ov.querySelector('#hp-close').addEventListener('click', close);
        ov.querySelector('#hp-update').addEventListener('click', () => {
            if (window.PWAInstaller && typeof window.PWAInstaller.manualUpdate === 'function') window.PWAInstaller.manualUpdate();
            else location.reload();
        });
        ov.querySelector('#hp-copy').addEventListener('click', copyDiag);
        return ov;
    }

    let _lastDiagText = '';

    function row(k, v, cls) { return `<div class="hp-row"><span class="hp-k">${k}</span><span class="hp-v ${cls || ''}">${v}</span></div>`; }

    async function render() {
        const body = document.getElementById('hp-body');
        const ver = window.APP_VERSION || '—';
        const acct = account();
        const lastSync = fmtTime(localStorage.getItem('lastSyncTime'));
        const localN = localClassCount();
        // 先放可同步取得的，雲端班數非同步後補
        body.innerHTML =
            row('App 版本', 'v' + ver) +
            row('Service Worker', '查詢中…') +
            row('登入帳號', acct.email, acct.loggedIn ? 'hp-acct' : 'hp-warn') +
            row('上次同步', lastSync) +
            row('本地班級數', localN + ' 個') +
            row('雲端班級數', acct.loggedIn ? '查詢中…' : '（未登入）');

        const [sw, cloudN] = await Promise.all([swState(), cloudClassCount()]);
        body.innerHTML =
            row('App 版本', 'v' + ver) +
            row('Service Worker', sw.text) +
            row('登入帳號', acct.email + (acct.name ? `<br><span style="font-weight:400;color:#94a3b8;font-size:.78rem">${acct.name}</span>` : ''), acct.loggedIn ? 'hp-acct' : 'hp-warn') +
            row('上次同步', lastSync) +
            row('本地班級數', localN + ' 個') +
            row('雲端班級數', acct.loggedIn ? (cloudN == null ? '讀取失敗' : cloudN + ' 個') : '（未登入）');

        // 有新版待更新 → 顯示更新鈕
        const upBtn = document.getElementById('hp-update');
        if (upBtn) upBtn.style.display = sw.updatable ? '' : 'none';

        _lastDiagText =
            `班級小管家 診斷資訊\n` +
            `版本: v${ver}\n` +
            `SW: ${sw.text}\n` +
            `登入帳號: ${acct.email}\n` +
            `上次同步: ${lastSync}\n` +
            `本地班級數: ${localN}\n` +
            `雲端班級數: ${acct.loggedIn ? (cloudN == null ? '讀取失敗' : cloudN) : '未登入'}\n` +
            `UA: ${(navigator.userAgent || '').slice(0, 120)}\n` +
            `時間: ${new Date().toLocaleString('zh-TW')}`;
    }

    async function copyDiag() {
        try {
            await navigator.clipboard.writeText(_lastDiagText || '');
            window.NotificationSystem && NotificationSystem.success('診斷資訊已複製，可貼給老師/開發者回報');
        } catch {
            // 後備：用提示框讓使用者手動複製
            window.prompt('請手動複製以下診斷資訊：', _lastDiagText || '');
        }
    }

    function open() { const ov = ensureCard(); ov.classList.add('open'); render(); }
    function close() { const ov = document.getElementById('health-panel-overlay'); if (ov) ov.classList.remove('open'); }

    window.HealthPanel = { open, close };

    // 點版本徽章開啟（取代原本直接開 GitHub）
    function wireBadge() {
        const badge = document.getElementById('app-version-badge');
        if (badge) {
            badge.onclick = open;
            badge.title = '版本與健康狀態（點擊查看）';
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireBadge);
    else wireBadge();
})();
