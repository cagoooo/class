/**
 * 雲端選單教學引導（v3.63.0）
 *
 * 老師第一次登入 Google 後，一步一步圈出右上角頭像選單裡的功能，說明「什麼時候按哪一個」，
 * 最後用「換電腦只要三步」收尾。登入後若正在取回資料而重新整理頁面，重整後才接著顯示。
 *
 * - 只在老師親自按登入之後自動出現一次（每個帳號、每台裝置各一次）；之後可從選單「換電腦怎麼做？」重看。
 * - 有對話框、計時器、全螢幕或正在同步時先不出現，等畫面安靜再開始，不打斷上課。
 * - 教學期間點背景不會誤按到選單裡的功能；Esc 或「略過」隨時結束。
 * - 還沒看過教學時，右上角頭像會有一圈會動的亮光，選單裡的「換電腦怎麼做？」標上「新」，看完或略過就消失。
 *
 * 全域 API：CloudGuide.start()、CloudGuide.afterLogin()
 */
(function () {
    'use strict';
    const SEEN_KEY = 'cloudGuideSeen', PENDING_KEY = 'cloudGuidePending';
    const WAIT_MS = 1500, WAIT_TRIES = 40;

    const STEPS = [
        { target: 'avatar', title: '👋 這是你的雲端帳號', text: '右上角的頭像就是雲端選單的開關，點一下就會打開。接下來帶你看看裡面每個按鈕什麼時候用。' },
        { target: 'sync-time', title: '☁️ 平常會自動幫你存', text: '登入後，只要資料有變動，系統每 10 分鐘會自動存到雲端。這裡顯示雲端狀態：看到「✅ 已是最新」，就代表這台的資料都存好了。', open: true },
        { target: 'save-one', title: '存目前班級', text: '剛改完重要的資料（例如加完分、改了名單），想馬上存起來，就按這個。', open: true },
        { target: 'save-all', title: '存全部班級', text: '帶好幾個班的老師，下班離開學校前按一次，所有班級都會存到雲端，最安心。', open: true },
        { target: 'get-one', title: '取回目前班級', text: '換到另一台電腦時，把「這個班」在雲端的最新資料帶到這台電腦。', open: true },
        { target: 'get-all', title: '🏠 回家或換新電腦？按這個', text: '先用同一個 Google 帳號登入，再按「取回全部班級」，學校的資料就會出現在這台電腦。取回前會先幫這台電腦原本的資料留一份副本，不會弄丟，也不會改動雲端上的資料。', open: true },
        { target: 'help', title: '❓ 忘記了也沒關係', text: '隨時點頭像，再按這裡就能重看這份教學。', open: true },
        { target: null, title: '換電腦只要三步', finale: true },
    ];

    let state = null;   // { step, overlay, spot, card, onKey, onResize }

    const raw = {
        get(key) { try { return localStorage.getItem(key); } catch { return null; } },
        set(key, value) { try { localStorage.setItem(key, value); } catch { /* 無痕模式等情況略過 */ } },
        remove(key) { try { localStorage.removeItem(key); } catch { /* 同上 */ } },
    };
    const uid = () => window.FirebaseConfig?.getCurrentUserId?.() || '';
    const signedIn = () => !!window.FirebaseConfig?.isGoogleUser?.();
    const seenKey = () => `${SEEN_KEY}:${uid()}`;

    function isMobileMenu() {
        const desktop = document.getElementById('gauth-avatar-wrap');
        return !(desktop && desktop.offsetParent !== null);
    }
    function menu() { return document.getElementById(isMobileMenu() ? 'gauth-dropdown-mobile' : 'gauth-dropdown'); }
    function openMenu(open) {
        const dd = menu();
        if (!dd) return;
        if (isMobileMenu()) dd.style.display = open ? 'block' : 'none';
        else dd.classList.toggle('open', open);
    }
    function targetOf(key) {
        if (!key) return null;
        if (key === 'avatar') {
            const suffix = isMobileMenu() ? '-mobile' : '';
            const img = document.getElementById('gauth-avatar-img' + suffix);
            return img && img.offsetParent !== null ? img : document.getElementById('gauth-avatar-initial' + suffix);
        }
        return menu()?.querySelector(`[data-guide="${key}"]`) || null;
    }

    /** 畫面有其他對話框、正在同步或上課中（計時器、全螢幕）時先不打擾 */
    function busy() {
        if (window.syncStatus?.isSyncing) return true;
        if (window.FirebaseConfig?.isPageBusy?.()) return true;
        const overlays = ['gauth-modal-overlay', 'gauth-welcome-overlay', 'cs-switch-overlay'];
        if (overlays.some(id => document.getElementById(id)?.classList.contains('open') || document.getElementById(id)?.classList.contains('show'))) return true;
        return !!document.querySelector('.cloud-conflict[open], #all-class-dl-modal, #all-class-sync-modal, #sync-preview-modal');
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function injectStyle() {
        if (document.getElementById('cloud-guide-style')) return;
        const style = document.createElement('style');
        style.id = 'cloud-guide-style';
        style.textContent = `
/* 還沒看過教學：頭像外圍一圈會動的亮光，提醒這裡有教學 */
.cg-hint #gauth-avatar-initial, .cg-hint #gauth-avatar-img,
.cg-hint #gauth-avatar-initial-mobile, .cg-hint #gauth-avatar-img-mobile { animation:cgPulse 1.8s ease-out infinite; border-color:#f59e0b !important; }
@keyframes cgPulse {
    0% { box-shadow:0 0 0 0 rgba(245,158,11,.85), 0 0 0 0 rgba(99,102,241,.55); }
    70% { box-shadow:0 0 0 9px rgba(245,158,11,0), 0 0 0 16px rgba(99,102,241,0); }
    100% { box-shadow:0 0 0 0 rgba(245,158,11,0), 0 0 0 0 rgba(99,102,241,0); }
}
.cg-hint [data-guide="help"] { background:#fffbeb; }
.cg-hint [data-guide="help"] b::after { content:'新'; display:inline-block; margin-left:6px; padding:0 7px; border-radius:999px; background:#f59e0b; color:#fff; font-size:.7rem; line-height:1.5; vertical-align:middle; }
.dark .cg-hint [data-guide="help"] { background:#422006; }
@media (prefers-reduced-motion: reduce) {
    .cg-hint #gauth-avatar-initial, .cg-hint #gauth-avatar-img,
    .cg-hint #gauth-avatar-initial-mobile, .cg-hint #gauth-avatar-img-mobile { animation:none; box-shadow:0 0 0 3px #f59e0b; }
}
.cg-overlay { position:fixed; inset:0; z-index:2147482000; background:rgba(15,23,42,.62); }
.cg-spot { position:fixed; z-index:2147482000; border-radius:12px; box-shadow:0 0 0 4px #fbbf24, 0 0 18px 6px rgba(251,191,36,.45); cursor:default; transition:all .25s ease; }
.cg-spot.cg-none { display:none; }
.cg-card { position:fixed; z-index:2147482001; width:min(360px, calc(100vw - 24px)); box-sizing:border-box; background:#fff; color:#1f2937; border-radius:16px; padding:18px 18px 14px; box-shadow:0 20px 50px -12px rgba(15,23,42,.55); font-size:15px; line-height:1.7; transition:top .25s ease, left .25s ease; }
.cg-card h3 { margin:0 0 6px; font-size:17px; font-weight:800; color:#312e81; }
.cg-card p { margin:0; color:#374151; }
.cg-steps { margin:8px 0 0; padding-left:0; list-style:none; display:grid; gap:8px; }
.cg-steps li { display:flex; gap:10px; align-items:flex-start; background:#eef2ff; border-radius:10px; padding:8px 10px; color:#1e1b4b; }
.cg-steps b.cg-num { flex:0 0 26px; height:26px; border-radius:50%; background:#4f46e5; color:#fff; display:flex; align-items:center; justify-content:center; font-size:14px; }
.cg-foot { display:flex; align-items:center; gap:8px; margin-top:14px; flex-wrap:wrap; }
.cg-count { font-size:13px; color:#6b7280; margin-right:auto; }
.cg-card button { min-height:40px; padding:6px 14px; border-radius:10px; font-size:14px; font-weight:700; cursor:pointer; border:1px solid #c7d2fe; background:#fff; color:#4338ca; }
.cg-card button.cg-next { background:#4f46e5; border-color:#4f46e5; color:#fff; }
.cg-card button.cg-skip { border-color:transparent; color:#6b7280; font-weight:600; }
.cg-card button:focus-visible { outline:3px solid #fbbf24; outline-offset:2px; }
.dark .cg-card { background:#1e293b; color:#e2e8f0; }
.dark .cg-card h3 { color:#c7d2fe; }
.dark .cg-card p { color:#cbd5e1; }
.dark .cg-steps li { background:#312e81; color:#e0e7ff; }
.dark .cg-card button { background:#0f172a; color:#c7d2fe; border-color:#4338ca; }
.dark .cg-card button.cg-next { background:#6366f1; color:#fff; }
.dark .cg-card button.cg-skip { background:transparent; border-color:transparent; color:#94a3b8; }
@media (prefers-reduced-motion: reduce) { .cg-spot, .cg-card { transition:none; } }
`;
        document.head.append(style);
    }

    function place() {
        if (!state) return;
        const step = STEPS[state.step];
        const target = targetOf(step.target);
        const { spot, card } = state;
        const vw = window.innerWidth, vh = window.innerHeight, gap = 12;
        if (!target) {
            state.overlay.style.clipPath = '';
            spot.classList.add('cg-none');
            spot.style.left = vw / 2 + 'px'; spot.style.top = vh / 2 + 'px';
            card.style.left = Math.max(12, (vw - card.offsetWidth) / 2) + 'px';
            card.style.top = Math.max(12, (vh - card.offsetHeight) / 2) + 'px';
            return;
        }
        target.scrollIntoView?.({ block: 'nearest' });
        const r = target.getBoundingClientRect(), pad = 6;
        spot.classList.remove('cg-none');
        Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
        // 暗色遮罩在目標上挖一個洞（evenodd：外框減掉目標框），被圈起來的按鈕保持原本亮度
        const x = r.left - pad, y = r.top - pad, w = r.width + pad * 2, h = r.height + pad * 2;
        state.overlay.style.clipPath = `path(evenodd, 'M0 0H${vw}V${vh}H0Z M${x} ${y}h${w}v${h}h${-w}Z')`;
        // 選單在畫面右上角：卡片優先放在目標左邊，放不下就放下方或上方
        const cw = card.offsetWidth, ch = card.offsetHeight;
        let left, top;
        if (r.left - gap - cw >= 12) {
            left = r.left - gap - cw;
            top = Math.min(Math.max(12, r.top + r.height / 2 - ch / 2), vh - ch - 12);
        } else {
            left = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), vw - cw - 12);
            top = r.bottom + gap + ch <= vh - 12 ? r.bottom + gap : Math.max(12, r.top - gap - ch);
        }
        card.style.left = left + 'px'; card.style.top = top + 'px';
    }

    function render() {
        const step = STEPS[state.step], card = state.card, last = state.step === STEPS.length - 1;
        openMenu(!!step.open);
        card.replaceChildren();
        const title = el('h3', null, step.title); title.id = 'cg-title';
        card.append(title);
        if (step.finale) {
            const list = el('ol', 'cg-steps');
            [['在學校', '登入 Google 就會自動存到雲端；要離開前，點頭像按「存全部班級」最保險。'],
             ['回到家', '打開班級小管家，用同一個 Google 帳號登入。第一次在空白的電腦登入，資料會自動帶過來。'],
             ['沒看到資料？', '點頭像，按「取回全部班級」，學校的資料就會出現。']].forEach(([head, body], i) => {
                const item = el('li'); const num = el('b', 'cg-num', String(i + 1)); const text = el('span');
                text.append(el('strong', null, head + '：'), document.createTextNode(body));
                item.append(num, text); list.append(item);
            });
            card.append(list);
        } else card.append(el('p', null, step.text));
        const foot = el('div', 'cg-foot');
        foot.append(el('span', 'cg-count', `${state.step + 1} / ${STEPS.length}`));
        if (!last) foot.append(button('略過教學', 'cg-skip', () => finish()));
        if (state.step > 0) foot.append(button('上一步', '', () => go(state.step - 1)));
        const next = button(last ? '我知道了' : '下一步', 'cg-next', () => (last ? finish() : go(state.step + 1)));
        foot.append(next);
        card.append(foot);
        // 選單打開後位置才確定，下一個畫面更新再定位
        requestAnimationFrame(() => { place(); next.focus({ preventScroll: true }); });
        place();
        setTimeout(place, 250);   // 選單有 0.18 秒的滑入動畫，結束後再對準一次
    }
    function button(label, className, action) {
        const b = el('button', className, label);
        b.type = 'button';
        b.addEventListener('click', e => { e.stopPropagation(); action(); });
        return b;
    }
    function go(index) {
        if (!state) return;
        state.step = Math.max(0, Math.min(STEPS.length - 1, index));
        render();
    }

    function start() {
        if (state) return;
        if (!signedIn()) {
            window.NotificationSystem?.info?.('請先用 Google 帳號登入，才能使用雲端功能');
            return;
        }
        injectStyle();
        const overlay = el('div', 'cg-overlay');
        // 教學期間點背景不關選單、不誤按功能
        for (const type of ['click', 'pointerdown', 'mousedown', 'touchstart']) overlay.addEventListener(type, e => { e.stopPropagation(); if (type === 'click') e.preventDefault(); });
        const spot = el('div', 'cg-spot');
        // 遮罩在目標處挖了洞，由圈選框擋住點擊，避免教學中誤按到真正的功能
        for (const type of ['click', 'pointerdown', 'mousedown', 'touchstart']) spot.addEventListener(type, e => { e.stopPropagation(); if (type === 'click') e.preventDefault(); });
        const card = el('div', 'cg-card');
        card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'cg-title');
        for (const type of ['click', 'pointerdown', 'mousedown', 'touchstart']) card.addEventListener(type, e => e.stopPropagation());
        document.body.append(overlay, spot, card);
        const onKey = e => {
            if (e.key === 'Escape') { e.preventDefault(); finish(); }
            else if (e.key === 'ArrowRight') go(state.step + 1);
            else if (e.key === 'ArrowLeft') go(state.step - 1);
        };
        const onResize = () => place();
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', onResize);
        window.addEventListener('scroll', onResize, true);
        state = { step: 0, overlay, spot, card, onKey, onResize };
        render();
    }

    function finish() {
        if (!state) return;
        const { overlay, spot, card, onKey, onResize } = state;
        overlay.remove(); spot.remove(); card.remove();
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('scroll', onResize, true);
        state = null;
        openMenu(false);
        if (uid()) raw.set(seenKey(), '1');
        raw.remove(PENDING_KEY);
        updateHint();
    }

    /** 已登入、這個帳號在這台還沒看過教學 → 頭像亮圈＋選單「新」標籤；看過就拿掉 */
    function updateHint() {
        const show = signedIn() && !!uid() && !raw.get(seenKey());
        if (show) injectStyle();
        for (const id of ['gauth-avatar-wrap', 'gauth-avatar-wrap-mobile']) {
            const wrap = document.getElementById(id);
            if (!wrap) continue;
            wrap.classList.toggle('cg-hint', show);
            for (const avatar of wrap.querySelectorAll('[id^="gauth-avatar-initial"], [id^="gauth-avatar-img"]')) {
                if (show) avatar.title = '點我看雲端選單與換電腦教學';
                else if (avatar.title === '點我看雲端選單與換電腦教學') avatar.removeAttribute('title');
            }
        }
    }
    function watchAuth(attempt = 0) {
        const config = window.FirebaseConfig;
        if (!config?.onAuthStateChanged || !config.getDb?.()) { if (attempt < 150) setTimeout(() => watchAuth(attempt + 1), 400); return; }
        // 登入狀態與頭像由 google-auth-ui 在同一輪更新，稍等一下再判斷
        config.onAuthStateChanged(() => setTimeout(updateHint, 300));
        updateHint();
    }

    /** 等畫面安靜（沒有對話框、沒在同步）才開始；登入後取回資料而重新整理時，重整後接著顯示 */
    function startWhenQuiet(tries = 0) {
        if (state || !signedIn() || raw.get(seenKey())) { if (raw.get(seenKey())) raw.remove(PENDING_KEY); return; }
        if (busy()) { if (tries < WAIT_TRIES) setTimeout(() => startWhenQuiet(tries + 1), WAIT_MS); return; }
        start();
    }

    /** 老師親自按下登入、完成首次登入流程後呼叫 */
    function afterLogin() {
        updateHint();
        if (!uid() || raw.get(seenKey())) return;
        raw.set(PENDING_KEY, '1');
        setTimeout(() => startWhenQuiet(), WAIT_MS);
    }

    function resumePending(attempt = 0) {
        if (!raw.get(PENDING_KEY)) return;
        if (signedIn() && uid()) { setTimeout(() => startWhenQuiet(), WAIT_MS); return; }
        if (attempt < 30) setTimeout(() => resumePending(attempt + 1), 1000);   // 等登入狀態恢復（重新整理後約數秒）
        else raw.remove(PENDING_KEY);   // 已登出就不再等
    }

    window.CloudGuide = { start, afterLogin, finish, updateHint, steps: STEPS.length };
    const boot = () => { resumePending(); watchAuth(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
