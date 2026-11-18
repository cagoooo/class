/**
 * 計時背景音樂（v3.68.0）：老師貼上 YouTube 影片或播放清單網址，按「開始」計時就播放、停止就暫停、
 * 倒數最後 5 秒慢慢變小聲、時間到停止。全螢幕計時時播放器縮到右下角（YouTube 規定播放器要看得見，不能藏起來）。
 *
 * - 只在老師有設定網址時才載入 YouTube 播放器，沒用這功能的老師完全不多下載。
 * - 計時狀態透過 classnew.html 的 window.getTimerState() 讀（timerRunning 是 let，不在 window 上）。
 * - 設定存在這台電腦的 timerBgmSettings（跟著老師帳號的抽屜走，不上雲端）。
 */
(function () {
    'use strict';
    const KEY = 'timerBgmSettings', FADE_SECONDS = 5, RECENT_MAX = 5;

    /** 解析 YouTube 網址：影片（watch、youtu.be、shorts、embed、live）或播放清單（list=）。 */
    function parseYouTube(input) {
        const text = String(input || '').trim();
        if (!text) return null;
        if (/^[\w-]{11}$/.test(text)) return { videoId: text };
        let url;
        try { url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text); } catch { return null; }
        const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
        if (!['youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) return null;
        const list = url.searchParams.get('list');
        let videoId = null;
        if (host === 'youtu.be') videoId = url.pathname.slice(1).split('/')[0];
        else if (url.pathname === '/watch') videoId = url.searchParams.get('v');
        else { const m = /^\/(?:shorts|embed|live|v)\/([\w-]{11})/.exec(url.pathname); if (m) videoId = m[1]; }
        if (videoId && !/^[\w-]{11}$/.test(videoId)) videoId = null;
        const listId = list && /^[\w-]{10,}$/.test(list) ? list : null;
        if (!videoId && !listId) return null;
        return { videoId, list: listId };
    }

    function load() {
        try {
            const s = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
            return { url: s.url || '', enabled: s.enabled !== false, volume: Number.isFinite(s.volume) ? Math.min(100, Math.max(0, s.volume)) : 60, recent: Array.isArray(s.recent) ? s.recent.slice(0, RECENT_MAX) : [] };
        } catch { return { url: '', enabled: true, volume: 60, recent: [] }; }
    }
    let settings = load();
    function save() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* 空間不足時只影響下次記憶 */ } }

    // ── YouTube 播放器 ──
    let apiPromise = null, player = null, playerKey = '', ready = false, pendingPlay = false, playing = false, lastError = '';
    function loadApi() {
        if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
        if (apiPromise) return apiPromise;
        apiPromise = new Promise((resolve, reject) => {
            const previous = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => { try { previous?.(); } catch { /* 其他模組的回呼 */ } resolve(window.YT); };
            const s = document.createElement('script');
            s.src = 'https://www.youtube.com/iframe_api';
            s.async = true;
            s.onerror = () => { apiPromise = null; reject(Error('YouTube 播放器載入失敗')); };
            document.head.appendChild(s);
        });
        return apiPromise;
    }
    const keyOf = p => p ? `${p.videoId || ''}|${p.list || ''}` : '';

    let creating = null;
    function ensurePlayer() {
        const parsed = parseYouTube(settings.url);
        if (!parsed) { destroyPlayer(); return Promise.resolve(null); }
        if (player && playerKey === keyOf(parsed)) return Promise.resolve(player);
        // 同一首正在建立中（例如剛打開計時頁、老師又馬上按開始）：等同一個，不要建兩個播放器
        if (creating && creating.key === keyOf(parsed)) return creating.promise;
        const promise = createPlayer(parsed);
        creating = { key: keyOf(parsed), promise };
        promise.finally(() => { if (creating?.promise === promise) creating = null; });
        return promise;
    }
    async function createPlayer(parsed) {
        const wantPlay = pendingPlay;   // 換播放器不能把「等一下要播」的要求弄丟
        destroyPlayer();
        pendingPlay = wantPlay;
        const host = document.getElementById('timerBgmPlayer');
        if (!host) return null;
        setStatus('載入音樂中…');
        try { await loadApi(); }
        catch { setStatus('連不上 YouTube，請確認網路或學校防火牆', true); return null; }
        const target = document.createElement('div');
        host.replaceChildren(target);
        playerKey = keyOf(parsed); ready = false;
        const vars = { rel: 0, playsinline: 1, modestbranding: 1, controls: 1, origin: location.origin };
        if (parsed.list) { vars.list = parsed.list; vars.listType = 'playlist'; vars.loop = 1; }
        player = new window.YT.Player(target, {
            host: 'https://www.youtube-nocookie.com',
            width: '100%', height: '100%',
            videoId: parsed.videoId || undefined,
            playerVars: vars,
            events: {
                onReady: () => {
                    ready = true; lastError = '';
                    player.setVolume(settings.volume);
                    rememberTitle();
                    setStatus(settings.enabled ? '準備好了：按「開始」計時就會播放' : '已載入（目前設定為不自動播放）');
                    if (pendingPlay) { pendingPlay = false; play(); }
                },
                onStateChange: e => {
                    const S = window.YT.PlayerState;
                    playing = e.data === S.PLAYING || e.data === S.BUFFERING;
                    if (e.data === S.PLAYING) rememberTitle();
                    // 單一影片播完：計時還沒結束就從頭再放，音樂不會中途斷掉
                    if (e.data === S.ENDED && !parsed.list && running()) { player.seekTo(0, true); player.playVideo(); }
                    renderButtons();
                },
                onError: e => {
                    lastError = [101, 150].includes(e.data) ? '這部影片的作者不允許在其他網站播放，請換一部' : e.data === 100 ? '找不到這部影片（可能已刪除或設為私人）' : '這部影片無法播放，請換一部';
                    setStatus(lastError, true); playing = false; renderButtons();
                }
            }
        });
        return player;
    }
    function destroyPlayer() {
        try { player?.destroy?.(); } catch { /* 已經移除 */ }
        player = null; playerKey = ''; ready = false; playing = false; pendingPlay = false;
        document.getElementById('timerBgmPlayer')?.replaceChildren();
    }

    function play() {
        if (!player || !ready) { pendingPlay = true; ensurePlayer(); return; }
        if (lastError) return;
        try { player.setVolume(settings.volume); player.playVideo(); } catch { /* 播放器尚未可用 */ }
    }
    function pause() { pendingPlay = false; try { if (player && ready) player.pauseVideo(); } catch { /* 忽略 */ } }

    function rememberTitle() {
        try {
            const title = player?.getVideoData?.()?.title;
            if (!title || !settings.url) return;
            settings.recent = [{ url: settings.url, title }, ...settings.recent.filter(r => r.url !== settings.url)].slice(0, RECENT_MAX);
            save(); renderRecent();
            const name = document.getElementById('timerBgmTitle');
            if (name) name.textContent = '🎵 ' + title;
        } catch { /* 取不到標題不影響播放 */ }
    }

    // ── 跟著計時器走 ──
    const timerState = () => { try { return window.getTimerState?.() || null; } catch { return null; } };
    const running = () => !!timerState()?.running;
    let wasRunning = false, fadeVolume = null;
    function tick() {
        const state = timerState();
        const now = !!state?.running;
        if (settings.enabled && settings.url) {
            if (now && !wasRunning) play();
            else if (!now && wasRunning) pause();
            // 倒數最後幾秒慢慢變小聲，接上時間到的提示音
            if (now && state.mode === 'countdown' && ready && playing) {
                const target = state.total <= FADE_SECONDS ? Math.round(settings.volume * Math.max(0, state.total) / FADE_SECONDS) : settings.volume;
                if (target !== fadeVolume) { fadeVolume = target; try { player.setVolume(target); } catch { /* 忽略 */ } }
            } else fadeVolume = null;
        }
        wasRunning = now;
        syncFloating();
    }
    window.addEventListener('timer:finished', () => { pause(); try { player?.setVolume?.(settings.volume); } catch { /* 忽略 */ } });

    // 全螢幕計時：播放器縮到右下角，學生看得到時間、老師也能隨時暫停音樂
    function syncFloating() {
        const box = document.getElementById('timerBgmPlayerBox');
        if (!box) return;
        const full = !!document.getElementById('timerFullscreenModal')?.classList.contains('active');
        const floating = full && !!player;
        box.classList.toggle('timer-bgm-floating', floating);
        if (!floating) { box.style.bottom = ''; lastClearance = 0; return; }
        // 每 2 秒重新量一次就夠（按鈕很少移動），不必每半秒掃整個角落
        const now = Date.now();
        if (now - lastClearance > 2000) { lastClearance = now; box.style.bottom = cornerClearance(box) + 'px'; }
    }
    let lastClearance = 0;
    /**
     * 右下角原本就有「一鍵更新」、雲端同步等浮動按鈕（2026-11-18 老師回報疊在一起）。
     * 找出這個角落裡其他固定位置的元素，把播放器放到它們上面；之後那裡多了其他按鈕也會自動讓開。
     */
    function cornerClearance(box) {
        const MARGIN = 16, w = window.innerWidth, h = window.innerHeight;
        if (!document.elementsFromPoint || !w || !h) return MARGIN;
        let top = h - MARGIN;
        const width = box.offsetWidth || 240;
        for (let x = w - 12; x > w - width - MARGIN; x -= 24) {
            for (let y = h - 12; y > h - 140; y -= 16) {
                for (const el of document.elementsFromPoint(x, y)) {
                    if (el === box || box.contains(el) || el === document.body || el === document.documentElement) continue;
                    if (el.closest('#timerFullscreenModal')) continue;
                    const fixed = el.closest('*') && [el, ...ancestors(el)].find(a => getComputedStyle(a).position === 'fixed');
                    if (!fixed || fixed.id === 'timerFullscreenModal') continue;
                    const r = fixed.getBoundingClientRect();
                    // 只避開角落的小按鈕；蓋住整個畫面的遮罩（例如登入歡迎視窗的底色）不算
                    if (r.width > w * 0.5 || r.height > h * 0.5) continue;
                    if (r.width && r.height && r.top < top) top = r.top;
                }
            }
        }
        // 播放器至少要完整留在畫面裡
        const boxHeight = box.offsetHeight || 170;
        return Math.max(MARGIN, Math.min(Math.round(h - top + 12), h - boxHeight - MARGIN));
    }
    function ancestors(el) { const out = []; for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) out.push(p); return out; }

    // ── 畫面 ──
    function setStatus(text, error) {
        const el = document.getElementById('timerBgmStatus');
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('is-error', !!error);
    }
    function renderButtons() {
        const btn = document.getElementById('timerBgmPreview');
        if (btn) { btn.textContent = playing ? '⏸ 暫停試聽' : '▶ 試聽'; btn.disabled = !parseYouTube(settings.url); }
    }
    function renderRecent() {
        const box = document.getElementById('timerBgmRecent');
        if (!box) return;
        box.replaceChildren();
        const items = settings.recent.filter(r => r.url !== settings.url);
        box.hidden = !items.length;
        if (!items.length) return;
        const label = document.createElement('span');
        label.className = 'timer-bgm-recent-label'; label.textContent = '最近使用：';
        box.append(label);
        for (const r of items) {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'timer-bgm-chip'; b.textContent = r.title; b.title = r.title;
            b.addEventListener('click', () => applyUrl(r.url));
            box.append(b);
        }
    }
    function applyUrl(url) {
        const input = document.getElementById('timerBgmUrl');
        if (input) input.value = url;
        const parsed = parseYouTube(url);
        if (url && !parsed) { setStatus('看不懂這個網址，請貼上 YouTube 影片或播放清單的網址', true); return; }
        settings.url = parsed ? url.trim() : '';
        lastError = '';
        save();
        document.getElementById('timerBgmTitle')?.replaceChildren();
        document.getElementById('timerBgmPlayerBox')?.toggleAttribute('hidden', !parsed);
        renderButtons(); renderRecent();
        if (!parsed) { destroyPlayer(); setStatus('貼上 YouTube 網址，計時的時候就有背景音樂'); return; }
        ensurePlayer();
        // 計時中換歌：直接接著播
        if (settings.enabled && running()) play();
    }

    function buildCard() {
        const anchor = document.getElementById('countdownQuickTimers');
        if (!anchor || document.getElementById('timerBgmCard')) return false;
        const card = document.createElement('section');
        card.id = 'timerBgmCard'; card.className = 'timer-bgm-card';
        card.setAttribute('aria-labelledby', 'timerBgmHeading');
        card.innerHTML = `
            <div class="timer-bgm-head">
                <h4 id="timerBgmHeading">🎵 計時背景音樂</h4>
                <label class="timer-bgm-switch"><input type="checkbox" id="timerBgmEnabled"> 計時時自動播放</label>
            </div>
            <div class="timer-bgm-row">
                <label for="timerBgmUrl" class="sr-only">YouTube 網址</label>
                <input type="url" id="timerBgmUrl" inputmode="url" autocomplete="off" placeholder="貼上 YouTube 影片或播放清單網址">
                <button type="button" id="timerBgmApply">套用</button>
                <button type="button" id="timerBgmClear" title="不使用背景音樂" aria-label="清除背景音樂">✕</button>
            </div>
            <div class="timer-bgm-row timer-bgm-controls">
                <label for="timerBgmVolume">🔊 音量</label>
                <input type="range" id="timerBgmVolume" min="0" max="100" step="5">
                <output id="timerBgmVolumeText" for="timerBgmVolume"></output>
                <button type="button" id="timerBgmPreview">▶ 試聽</button>
            </div>
            <div id="timerBgmRecent" class="timer-bgm-recent" hidden></div>
            <p id="timerBgmStatus" class="timer-bgm-status" role="status" aria-live="polite"></p>
            <p class="timer-bgm-hint">按「開始」播放、「停止」暫停，倒數最後 5 秒慢慢變小聲，時間到就停；單一影片播完會從頭再放。</p>`;
        anchor.insertAdjacentElement('afterend', card);

        const display = document.getElementById('timerProgress')?.parentElement;
        const box = document.createElement('div');
        box.id = 'timerBgmPlayerBox'; box.className = 'timer-bgm-player-box';
        box.innerHTML = '<p id="timerBgmTitle" class="timer-bgm-title"></p><div class="timer-bgm-player-frame"><div id="timerBgmPlayer"></div></div>';
        display?.insertAdjacentElement('afterend', box);

        const url = card.querySelector('#timerBgmUrl'), enabled = card.querySelector('#timerBgmEnabled');
        const volume = card.querySelector('#timerBgmVolume'), volumeText = card.querySelector('#timerBgmVolumeText');
        url.value = settings.url; enabled.checked = settings.enabled; volume.value = settings.volume; volumeText.textContent = settings.volume;
        box.hidden = !parseYouTube(settings.url);
        card.querySelector('#timerBgmApply').addEventListener('click', () => applyUrl(url.value));
        url.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyUrl(url.value); } });
        url.addEventListener('paste', () => setTimeout(() => { if (parseYouTube(url.value)) applyUrl(url.value); }, 0));
        card.querySelector('#timerBgmClear').addEventListener('click', () => applyUrl(''));
        enabled.addEventListener('change', () => {
            settings.enabled = enabled.checked; save();
            if (!settings.enabled) pause(); else if (running()) play();
            setStatus(settings.enabled ? '計時時會自動播放' : '已關閉自動播放（仍可按試聽）');
        });
        volume.addEventListener('input', () => {
            settings.volume = Number(volume.value); volumeText.textContent = settings.volume; save();
            try { if (ready) player.setVolume(settings.volume); } catch { /* 忽略 */ }
        });
        card.querySelector('#timerBgmPreview').addEventListener('click', async () => {
            if (playing) { pause(); return; }
            if (!player) await ensurePlayer();
            play();
        });
        renderButtons(); renderRecent();
        setStatus(settings.url ? '' : '貼上 YouTube 網址，計時的時候就有背景音樂');
        return true;
    }

    // 有設定過網址的老師：打開計時器頁面時才載入播放器
    function whenTimerVisible() {
        const section = document.getElementById('timer-section');
        if (!section) return;
        const check = () => { if (!section.classList.contains('hidden') && parseYouTube(settings.url) && !player) ensurePlayer(); };
        new MutationObserver(check).observe(section, { attributes: true, attributeFilter: ['class'] });
        check();
    }

    function injectStyles() {
        if (document.getElementById('timer-bgm-styles')) return;
        const style = document.createElement('style');
        style.id = 'timer-bgm-styles';
        style.textContent = `
            .timer-bgm-card { border:1px solid #fecaca; background:#fff7f5; border-radius:12px; padding:12px; display:grid; gap:8px; }
            .timer-bgm-head { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; }
            .timer-bgm-head h4 { margin:0; font-size:15px; font-weight:700; color:#9a3412; }
            .timer-bgm-switch { display:inline-flex; align-items:center; gap:6px; font-size:13px; color:#475569; cursor:pointer; min-height:32px; }
            .timer-bgm-row { display:flex; gap:6px; align-items:center; }
            .timer-bgm-row input[type=url] { flex:1; min-width:0; padding:8px 10px; border:1px solid #d1d5db; border-radius:8px; font-size:14px; background:#fff; color:#111827; }
            .timer-bgm-row button { flex:none; min-height:38px; padding:0 12px; border:0; border-radius:8px; background:#ef4444; color:#fff; font-size:13px; font-weight:600; cursor:pointer; }
            .timer-bgm-row button:disabled { opacity:.45; cursor:not-allowed; }
            #timerBgmClear { background:#e5e7eb; color:#374151; padding:0 10px; }
            .timer-bgm-controls label { font-size:13px; color:#475569; white-space:nowrap; }
            .timer-bgm-controls input[type=range] { flex:1; min-width:0; accent-color:#ef4444; }
            .timer-bgm-controls output { width:2.2em; text-align:right; font-size:13px; color:#475569; }
            #timerBgmPreview { background:#f97316; }
            .timer-bgm-recent { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
            .timer-bgm-recent[hidden] { display:none; }
            .timer-bgm-recent-label { font-size:12px; color:#64748b; }
            .timer-bgm-chip { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:4px 10px; border:1px solid #fdba74; border-radius:999px; background:#fff; color:#9a3412; font-size:12px; cursor:pointer; }
            .timer-bgm-status { margin:0; min-height:1.2em; font-size:12px; color:#047857; }
            .timer-bgm-status.is-error { color:#b91c1c; }
            .timer-bgm-hint { margin:0; font-size:12px; line-height:1.6; color:#64748b; }
            .timer-bgm-player-box { margin-top:12px; }
            .timer-bgm-player-box[hidden] { display:none; }
            .timer-bgm-title { margin:0 0 6px; font-size:13px; color:#9a3412; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .timer-bgm-player-frame { position:relative; width:100%; max-width:360px; margin:0 auto; aspect-ratio:16/9; border-radius:10px; overflow:hidden; background:#000; }
            .timer-bgm-player-frame iframe, #timerBgmPlayer { position:absolute; inset:0; width:100%; height:100%; border:0; }
            .timer-bgm-player-box.timer-bgm-floating { position:fixed; right:16px; bottom:16px; z-index:101; width:240px; margin:0; padding:6px; border-radius:12px; background:rgba(15,23,42,.75); box-shadow:0 8px 24px rgba(0,0,0,.35); }
            .timer-bgm-floating .timer-bgm-title { color:#fde68a; font-size:12px; }
            .timer-bgm-floating .timer-bgm-player-frame { max-width:none; }
            .dark .timer-bgm-card { background:#2a1d1a; border-color:#7c2d12; }
            .dark .timer-bgm-head h4, .dark .timer-bgm-title { color:#fdba74; }
            .dark .timer-bgm-switch, .dark .timer-bgm-controls label, .dark .timer-bgm-controls output, .dark .timer-bgm-hint { color:#cbd5e1; }
            .dark .timer-bgm-row input[type=url] { background:#1f2937; color:#f9fafb; border-color:#4b5563; }
            .dark .timer-bgm-chip { background:#1f2937; color:#fdba74; border-color:#9a3412; }
            .dark .timer-bgm-status { color:#6ee7b7; }
            @media (max-width:480px) { .timer-bgm-player-box.timer-bgm-floating { width:180px; right:10px; bottom:10px; } }`;
        document.head.appendChild(style);
    }

    function init() {
        injectStyles();
        if (!buildCard()) return;
        whenTimerVisible();
        setInterval(tick, 500);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.TimerBgm = { parseYouTube };
})();
