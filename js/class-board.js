/**
 * class-board.js
 * 🎨 班級經營白板 —— 公告白板 + 班級秩序狀態 + 號碼抽籤（可愛風、可全螢幕）
 * @version 3.5.0
 *
 * 內容（皆為班級小管家原本沒有、本次新增的部分）：
 *   1) 白板公告區：自由打字，可選字級 / 顏色 / 粗細，一鍵全螢幕投影給全班看
 *   2) 班級秩序管理：6 個可愛圖示（閱讀/吃飯/午休/安靜/打掃/學習）點選切換目前狀態，可全螢幕
 *   3) 號碼抽籤小工具：設定最大號碼 + 一次抽幾位 + 不重複，滾動動畫抽出，可全螢幕
 *   4) 倒數計時器：沿用既有「計時器」功能（捷徑切換，不重做）
 *
 * 純前端、零相依；自行注入 CSS。資料依班級隔離（key 已加入 class-aware-storage 的 SHARED_KEYS）。
 * 對外：window.ClassBoard.{ init, fullscreenNote, fullscreenActivity, setActivity, clearActivity, openLottery }
 */
(function () {
    'use strict';

    const K_NOTE = 'boardNote';
    const K_STYLE = 'boardNoteStyle';
    const K_ACT = 'boardActivity';
    const K_LOT = 'boardLotteryCfg';

    // 字級：編輯區用 px，全螢幕用 vw（投影更大）
    const SIZES = [
        { k: 's', label: '小', px: 22, vw: 5 },
        { k: 'm', label: '中', px: 34, vw: 9 },
        { k: 'l', label: '大', px: 52, vw: 13 },
        { k: 'xl', label: '特大', px: 76, vw: 18 }
    ];
    const COLORS = ['#1f2937', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];

    const ACTIVITIES = [
        { key: 'reading', emoji: '📖', label: '閱讀時間', sub: '安安靜靜看好書', color: '#16a34a', bg: 'linear-gradient(135deg,#dcfce7,#bbf7d0)' },
        { key: 'eating', emoji: '🍚', label: '用餐時間', sub: '細嚼慢嚥不浪費', color: '#ea580c', bg: 'linear-gradient(135deg,#ffedd5,#fed7aa)' },
        { key: 'nap', emoji: '😴', label: '午休時間', sub: '趴著休息養精神', color: '#4f46e5', bg: 'linear-gradient(135deg,#e0e7ff,#c7d2fe)' },
        { key: 'quiet', emoji: '🤫', label: '保持安靜', sub: '噓～小聲一點', color: '#dc2626', bg: 'linear-gradient(135deg,#fee2e2,#fecaca)' },
        { key: 'cleaning', emoji: '🧹', label: '打掃時間', sub: '一起把教室變乾淨', color: '#0d9488', bg: 'linear-gradient(135deg,#ccfbf1,#99f6e4)' },
        { key: 'learning', emoji: '✏️', label: '學習時間', sub: '動動腦袋一起學', color: '#2563eb', bg: 'linear-gradient(135deg,#dbeafe,#bfdbfe)' }
    ];

    // ───────────── 小工具 ─────────────
    function lsGet(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : v; } catch (e) { return def; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function actByKey(k) { return ACTIVITIES.find(a => a.key === k) || null; }
    function getStyle() {
        try { return Object.assign({ size: 'l', color: '#1f2937', bold: true }, JSON.parse(lsGet(K_STYLE, '{}'))); }
        catch (e) { return { size: 'l', color: '#1f2937', bold: true }; }
    }
    function saveStyle(s) { lsSet(K_STYLE, JSON.stringify(s)); }
    function sizeObj(k) { return SIZES.find(s => s.k === k) || SIZES[2]; }

    // ───────────── CSS ─────────────
    function injectCSS() {
        if (document.getElementById('class-board-style')) return;
        const css = `
        #board-section .cb-sub{color:#7c3aed;font-weight:600}
        .cb-grid{display:grid;grid-template-columns:1fr;gap:1rem;margin-bottom:1.25rem}
        @media(min-width:1024px){.cb-grid{grid-template-columns:1fr 230px}}
        /* 白板 */
        .cb-board-col{background:linear-gradient(135deg,#fdf4ff,#eff6ff);border:3px solid #ddd6fe;border-radius:1.25rem;padding:1rem}
        .cb-toolbar{display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:center;margin-bottom:.75rem}
        .cb-tgroup{display:flex;align-items:center;gap:.35rem;flex-wrap:wrap}
        .cb-tgroup .lbl{font-size:.78rem;color:#6b7280;font-weight:700;margin-right:.1rem}
        .cb-sz{padding:.25rem .6rem;border-radius:9999px;border:2px solid #e5e7eb;background:#fff;font-weight:700;
            font-size:.82rem;cursor:pointer;color:#4b5563;transition:all .12s}
        .cb-sz.on{background:#8b5cf6;border-color:#8b5cf6;color:#fff}
        .cb-sw{width:24px;height:24px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #e5e7eb;cursor:pointer;transition:transform .1s}
        .cb-sw:hover{transform:scale(1.15)}
        .cb-sw.on{box-shadow:0 0 0 3px #8b5cf6;transform:scale(1.15)}
        .cb-bold{padding:.25rem .7rem;border-radius:9999px;border:2px solid #e5e7eb;background:#fff;font-weight:900;cursor:pointer;color:#4b5563}
        .cb-bold.on{background:#8b5cf6;border-color:#8b5cf6;color:#fff}
        .cb-text{width:100%;min-height:170px;border:none;border-radius:.9rem;padding:1rem;resize:vertical;
            background:#fff;box-shadow:inset 0 2px 8px rgba(0,0,0,.06);outline:none;line-height:1.4;
            font-family:'Mochiyochi Pop One','Noto Sans TC',sans-serif}
        .cb-fsbtn{margin-top:.7rem;width:100%;padding:.7rem;border:none;border-radius:.9rem;font-weight:800;cursor:pointer;
            background:linear-gradient(135deg,#a78bfa,#8b5cf6);color:#fff;font-size:1rem;box-shadow:0 4px 0 #6d28d9;transition:transform .1s,box-shadow .1s}
        .cb-fsbtn:active{transform:translateY(4px);box-shadow:0 0 0 #6d28d9}
        /* 右側工具列 */
        .cb-tools-col{display:flex;flex-direction:column;gap:.75rem}
        .cb-tool{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.2rem;
            border:none;border-radius:1.1rem;padding:1rem .5rem;cursor:pointer;font-weight:800;color:#fff;
            box-shadow:0 5px 0 rgba(0,0,0,.18);transition:transform .1s,box-shadow .1s}
        .cb-tool:active{transform:translateY(5px);box-shadow:0 0 0 rgba(0,0,0,.18)}
        .cb-tool .ico{font-size:2rem;line-height:1}
        .cb-tool.timer{background:linear-gradient(135deg,#fb7185,#f43f5e)}
        .cb-tool.lottery{background:linear-gradient(135deg,#38bdf8,#0ea5e9)}
        .cb-tool .cap{font-size:.7rem;font-weight:600;opacity:.9}
        /* 班級秩序 */
        .cb-order{background:#fff;border:3px solid #fde68a;border-radius:1.25rem;padding:1rem}
        .cb-order h3{font-size:1.05rem;font-weight:800;color:#374151;margin-bottom:.25rem;display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}
        .cb-cur{font-size:.85rem;font-weight:700;padding:.2rem .8rem;border-radius:9999px;background:#f3f4f6;color:#6b7280}
        .cb-hint{font-size:.78rem;color:#9ca3af;margin-bottom:.75rem}
        .cb-acts{display:grid;grid-template-columns:repeat(3,1fr);gap:.7rem}
        @media(min-width:640px){.cb-acts{grid-template-columns:repeat(6,1fr)}}
        .cb-act{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.3rem;
            border:3px solid transparent;border-radius:1.1rem;padding:.9rem .3rem;cursor:pointer;background:#f9fafb;
            transition:transform .12s,box-shadow .12s;text-align:center}
        .cb-act:hover{transform:translateY(-3px)}
        .cb-act .e{font-size:2.3rem;line-height:1}
        .cb-act .l{font-size:.82rem;font-weight:800;color:#374151}
        .cb-act.on{transform:translateY(-3px) scale(1.03);box-shadow:0 8px 18px rgba(0,0,0,.12)}
        .cb-act.on .l{color:#111827}
        .cb-act .chk{position:absolute;top:.3rem;right:.4rem;font-size:.9rem;opacity:0;transition:opacity .12s}
        .cb-act.on .chk{opacity:1}
        /* 全螢幕 overlay */
        .cb-fs{position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;
            padding:4vmin;text-align:center;animation:cbFade .25s ease}
        @keyframes cbFade{from{opacity:0}to{opacity:1}}
        .cb-fs-close{position:absolute;top:18px;right:20px;width:48px;height:48px;border-radius:50%;border:none;cursor:pointer;
            background:rgba(0,0,0,.18);color:#fff;font-size:1.5rem;font-weight:700;line-height:1}
        .cb-fs-close:hover{background:rgba(0,0,0,.32)}
        .cb-fs-hint{position:absolute;bottom:16px;left:0;right:0;text-align:center;font-size:.8rem;color:rgba(0,0,0,.35)}
        .cb-fs-note{max-width:92vw;white-space:pre-wrap;word-break:break-word;line-height:1.35;
            font-family:'Mochiyochi Pop One','Noto Sans TC',sans-serif}
        .cb-fs-emoji{font-size:34vmin;line-height:1;animation:cbBounce 1.6s ease-in-out infinite}
        @keyframes cbBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-3vmin)}}
        .cb-fs-label{font-family:'Mochiyochi Pop One','Noto Sans TC',sans-serif;font-weight:900;font-size:11vmin;margin-top:1vmin}
        .cb-fs-sub{font-size:4.5vmin;font-weight:700;opacity:.75;margin-top:1vmin}
        /* 號碼抽籤 popup */
        .cb-lot-mask{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99990;display:flex;align-items:center;justify-content:center;padding:1rem;animation:cbFade .2s ease}
        .cb-lot{background:linear-gradient(160deg,#ecfeff,#fdf4ff);border:4px solid #67e8f9;border-radius:1.5rem;max-width:420px;width:100%;padding:1.4rem;box-shadow:0 20px 60px rgba(0,0,0,.3)}
        .cb-lot h3{font-size:1.2rem;font-weight:900;color:#0e7490;text-align:center;margin-bottom:1rem}
        .cb-lot-row{display:flex;align-items:center;justify-content:space-between;gap:.6rem;margin-bottom:.7rem}
        .cb-lot-row label{font-weight:700;color:#334155;font-size:.92rem}
        .cb-lot-row input[type=number]{width:90px;padding:.45rem .6rem;border:2px solid #cbd5e1;border-radius:.6rem;font-weight:700;text-align:center;font-size:1rem}
        .cb-lot-chk{display:flex;align-items:center;gap:.4rem;font-weight:700;color:#334155;font-size:.9rem;cursor:pointer}
        .cb-lot-display{background:#fff;border-radius:1rem;min-height:96px;display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;justify-content:center;padding:1rem;margin:.6rem 0;box-shadow:inset 0 2px 8px rgba(0,0,0,.06)}
        .cb-ball{min-width:64px;height:64px;padding:0 .5rem;border-radius:50%;display:flex;align-items:center;justify-content:center;
            font-family:'Mochiyochi Pop One','Noto Sans TC',sans-serif;font-weight:900;font-size:2rem;color:#fff;
            background:linear-gradient(135deg,#22d3ee,#0891b2);box-shadow:0 6px 14px rgba(8,145,178,.4)}
        .cb-ball.rolling{animation:cbRoll .4s linear infinite}
        @keyframes cbRoll{0%{transform:translateY(0)}50%{transform:translateY(-8px) rotate(8deg)}100%{transform:translateY(0)}}
        .cb-ball.pop{animation:cbPop .45s cubic-bezier(.2,1.6,.4,1)}
        @keyframes cbPop{0%{transform:scale(.4)}60%{transform:scale(1.18)}100%{transform:scale(1)}}
        .cb-lot-actions{display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-top:.4rem}
        .cb-lot-btn{padding:.7rem;border:none;border-radius:.9rem;font-weight:800;cursor:pointer;font-size:.95rem}
        .cb-lot-go{grid-column:1/-1;background:linear-gradient(135deg,#22d3ee,#0891b2);color:#fff;font-size:1.1rem;box-shadow:0 4px 0 #155e75;transition:transform .1s,box-shadow .1s}
        .cb-lot-go:active{transform:translateY(4px);box-shadow:0 0 0 #155e75}
        .cb-lot-go:disabled{opacity:.6;cursor:not-allowed}
        .cb-lot-fs{background:#fde68a;color:#92400e}
        .cb-lot-close{background:#e5e7eb;color:#374151}
        .cb-lot-stats{text-align:center;font-size:.78rem;color:#64748b;margin-top:.5rem}
        `;
        const st = document.createElement('style');
        st.id = 'class-board-style';
        st.textContent = css;
        (document.head || document.documentElement).appendChild(st);
    }

    // ───────────── 白板公告 ─────────────
    function applyTextStyle() {
        const ta = document.getElementById('cb-text');
        if (!ta) return;
        const s = getStyle();
        const so = sizeObj(s.size);
        // 用 important 壓過 rwd-breakpoints.css 的「input,textarea{font-size:16px!important}」(iOS 防縮放)
        ta.style.setProperty('font-size', so.px + 'px', 'important');
        ta.style.setProperty('color', s.color, 'important');
        ta.style.setProperty('font-weight', s.bold ? '900' : '400', 'important');
    }
    function renderToolbar() {
        const tb = document.getElementById('cb-toolbar');
        if (!tb) return;
        const s = getStyle();
        // 字級
        let html = '<div class="cb-tgroup"><span class="lbl">字級</span>';
        SIZES.forEach(sz => html += `<button class="cb-sz ${s.size === sz.k ? 'on' : ''}" data-size="${sz.k}">${sz.label}</button>`);
        html += '</div>';
        // 顏色
        html += '<div class="cb-tgroup"><span class="lbl">顏色</span>';
        COLORS.forEach(c => html += `<span class="cb-sw ${s.color === c ? 'on' : ''}" data-color="${c}" style="background:${c}"></span>`);
        html += '</div>';
        // 粗細
        html += `<div class="cb-tgroup"><span class="lbl">粗細</span><button class="cb-bold ${s.bold ? 'on' : ''}" data-bold="1">B 粗體</button></div>`;
        tb.innerHTML = html;
        tb.querySelectorAll('[data-size]').forEach(b => b.addEventListener('click', () => { const st = getStyle(); st.size = b.dataset.size; saveStyle(st); renderToolbar(); applyTextStyle(); }));
        tb.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => { const st = getStyle(); st.color = b.dataset.color; saveStyle(st); renderToolbar(); applyTextStyle(); }));
        tb.querySelectorAll('[data-bold]').forEach(b => b.addEventListener('click', () => { const st = getStyle(); st.bold = !st.bold; saveStyle(st); renderToolbar(); applyTextStyle(); }));
    }
    function wireText() {
        const ta = document.getElementById('cb-text');
        if (!ta || ta.__cbWired) return;
        ta.value = lsGet(K_NOTE, '');
        ta.addEventListener('input', () => lsSet(K_NOTE, ta.value));
        ta.__cbWired = true;
    }

    // ───────────── 班級秩序 ─────────────
    function renderActivities() {
        const wrap = document.getElementById('cb-activities');
        if (!wrap) return;
        const cur = lsGet(K_ACT, '');
        wrap.innerHTML = ACTIVITIES.map(a => `
            <button class="cb-act ${cur === a.key ? 'on' : ''}" data-act="${a.key}"
                style="${cur === a.key ? `background:${a.bg};border-color:${a.color}` : ''}">
                <span class="chk">✅</span>
                <span class="e">${a.emoji}</span>
                <span class="l">${esc(a.label)}</span>
            </button>`).join('');
        wrap.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => api.setActivity(b.dataset.act)));
        updateCurrentLabel();
    }
    function updateCurrentLabel() {
        const el = document.getElementById('cb-current');
        if (!el) return;
        const a = actByKey(lsGet(K_ACT, ''));
        if (a) { el.textContent = '目前：' + a.emoji + ' ' + a.label; el.style.background = a.bg; el.style.color = a.color; }
        else { el.textContent = '目前：尚未設定'; el.style.background = '#f3f4f6'; el.style.color = '#6b7280'; }
    }

    // ───────────── 全螢幕 overlay ─────────────
    function closeFs() {
        const o = document.getElementById('cb-fs');
        if (o) o.remove();
        try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { }
        document.removeEventListener('keydown', onEsc);
    }
    function onEsc(e) { if (e.key === 'Escape') closeFs(); }
    function openFs(innerHtml, bg) {
        closeFs();
        const o = document.createElement('div');
        o.id = 'cb-fs';
        o.className = 'cb-fs';
        o.style.background = bg || '#ffffff';
        o.innerHTML = `<button class="cb-fs-close" title="關閉（ESC）">✕</button>${innerHtml}<div class="cb-fs-hint">點右上 ✕ 或按 ESC 關閉</div>`;
        document.body.appendChild(o);
        o.querySelector('.cb-fs-close').addEventListener('click', closeFs);
        document.addEventListener('keydown', onEsc);
        // 嘗試進入真・全螢幕（被拒不影響 overlay）；requestFullscreen 回傳 Promise，需吃掉 rejection 避免 unhandled
        try {
            if (o.requestFullscreen) {
                const p = o.requestFullscreen();
                if (p && typeof p.catch === 'function') p.catch(function () { });
            }
        } catch (e) { /* 全螢幕被拒不影響 overlay */ }
        return o;
    }

    // ───────────── 對外 API ─────────────
    const api = {
        init() {
            injectCSS();
            renderToolbar();
            wireText();
            applyTextStyle();
            renderActivities();
        },
        setActivity(key) {
            const cur = lsGet(K_ACT, '');
            lsSet(K_ACT, cur === key ? '' : key);   // 再點一次同一個 = 取消
            renderActivities();
        },
        clearActivity() { lsSet(K_ACT, ''); renderActivities(); },
        fullscreenNote() {
            injectCSS();
            const ta = document.getElementById('cb-text');
            const text = ta ? ta.value.trim() : '';
            const s = getStyle();
            const so = sizeObj(s.size);
            if (!text) {
                const html = `<div class="cb-fs-note" style="color:#9ca3af;font-size:6vmin">（白板還沒有內容，先在白板上打字吧！）</div>`;
                openFs(html, 'linear-gradient(135deg,#fdf4ff,#eff6ff)');
                return;
            }
            const html = `<div class="cb-fs-note" style="font-size:${so.vw}vw;color:${s.color};font-weight:${s.bold ? 900 : 400}">${esc(text)}</div>`;
            openFs(html, 'linear-gradient(135deg,#fdf4ff,#eff6ff)');
        },
        fullscreenActivity() {
            injectCSS();
            const a = actByKey(lsGet(K_ACT, ''));
            if (!a) {
                openFs(`<div class="cb-fs-note" style="color:#9ca3af;font-size:6vmin">（先在下方點一個班級狀態圖示）</div>`, '#f8fafc');
                return;
            }
            const html = `<div class="cb-fs-emoji">${a.emoji}</div>
                <div class="cb-fs-label" style="color:${a.color}">${esc(a.label)}</div>
                <div class="cb-fs-sub" style="color:${a.color}">${esc(a.sub)}</div>`;
            openFs(html, a.bg);
            if (typeof window.triggerConfetti === 'function') window.triggerConfetti();
        },
        openLottery() { openLottery(); }
    };
    window.ClassBoard = api;

    // ───────────── 號碼抽籤 popup ─────────────
    let drawnSet = [];     // 本場已抽出的號碼（不重複用）
    function lotCfg() {
        try { return Object.assign({ max: 30, count: 1, noRepeat: true }, JSON.parse(lsGet(K_LOT, '{}'))); }
        catch (e) { return { max: 30, count: 1, noRepeat: true }; }
    }
    function saveLotCfg(c) { lsSet(K_LOT, JSON.stringify(c)); }
    function openLottery() {
        injectCSS();
        if (document.getElementById('cb-lot-mask')) return;
        const c = lotCfg();
        const mask = document.createElement('div');
        mask.id = 'cb-lot-mask';
        mask.className = 'cb-lot-mask';
        mask.innerHTML = `
            <div class="cb-lot" role="dialog" aria-modal="true">
                <h3>🎲 號碼抽籤</h3>
                <div class="cb-lot-row"><label>最大號碼</label><input type="number" id="cb-lot-max" min="1" max="999" value="${c.max}"></div>
                <div class="cb-lot-row"><label>一次抽幾位</label><input type="number" id="cb-lot-count" min="1" max="50" value="${c.count}"></div>
                <div class="cb-lot-row"><label class="cb-lot-chk"><input type="checkbox" id="cb-lot-norepeat" ${c.noRepeat ? 'checked' : ''}> 不重複（記住已抽過）</label></div>
                <div class="cb-lot-display" id="cb-lot-display"><span style="color:#94a3b8;font-weight:700">按下「開始抽籤」🎉</span></div>
                <button class="cb-lot-btn cb-lot-go" id="cb-lot-go">🎉 開始抽籤</button>
                <div class="cb-lot-actions">
                    <button class="cb-lot-btn cb-lot-fs" id="cb-lot-fsbtn">🖥️ 全螢幕</button>
                    <button class="cb-lot-btn cb-lot-close" id="cb-lot-reset">🔄 重置已抽</button>
                </div>
                <div class="cb-lot-stats" id="cb-lot-stats"></div>
                <div class="cb-lot-actions"><button class="cb-lot-btn cb-lot-close" id="cb-lot-x" style="grid-column:1/-1">關閉</button></div>
            </div>`;
        document.body.appendChild(mask);

        const display = mask.querySelector('#cb-lot-display');
        const go = mask.querySelector('#cb-lot-go');
        const stats = mask.querySelector('#cb-lot-stats');
        let lastDrawn = [];
        let rolling = false;

        function curCfg() {
            const max = Math.max(1, Math.min(999, parseInt(mask.querySelector('#cb-lot-max').value) || 1));
            const count = Math.max(1, Math.min(50, parseInt(mask.querySelector('#cb-lot-count').value) || 1));
            const noRepeat = mask.querySelector('#cb-lot-norepeat').checked;
            return { max, count, noRepeat };
        }
        function refreshStats() {
            const { max, noRepeat } = curCfg();
            stats.textContent = noRepeat ? `已抽 ${drawnSet.length} / ${max}　（剩 ${Math.max(0, max - drawnSet.length)}）` : '';
        }
        function showBalls(nums, popped) {
            display.innerHTML = nums.map(n => `<span class="cb-ball ${popped ? 'pop' : 'rolling'}">${n}</span>`).join('');
        }
        function draw() {
            if (rolling) return;
            const cfg = curCfg();
            saveLotCfg(cfg);
            let pool = [];
            for (let i = 1; i <= cfg.max; i++) if (!(cfg.noRepeat && drawnSet.includes(i))) pool.push(i);
            if (pool.length === 0) { display.innerHTML = '<span style="color:#ef4444;font-weight:800">號碼都抽完囉！按「重置已抽」</span>'; return; }
            const n = Math.min(cfg.count, pool.length);
            // 最終結果
            const picked = [];
            const tmp = pool.slice();
            for (let i = 0; i < n; i++) { const idx = Math.floor(Math.random() * tmp.length); picked.push(tmp.splice(idx, 1)[0]); }

            rolling = true; go.disabled = true;
            let ticks = 0;
            const timer = setInterval(() => {
                const rnd = []; for (let i = 0; i < n; i++) rnd.push(1 + Math.floor(Math.random() * cfg.max));
                showBalls(rnd, false);
                if (++ticks >= 14) {
                    clearInterval(timer);
                    picked.sort((a, b) => a - b);
                    showBalls(picked, true);
                    lastDrawn = picked.slice();
                    if (cfg.noRepeat) picked.forEach(p => { if (!drawnSet.includes(p)) drawnSet.push(p); });
                    refreshStats();
                    rolling = false; go.disabled = false;
                    if (typeof window.triggerConfetti === 'function') window.triggerConfetti();
                }
            }, 80);
        }

        go.addEventListener('click', draw);
        mask.querySelector('#cb-lot-reset').addEventListener('click', () => { drawnSet = []; refreshStats(); display.innerHTML = '<span style="color:#94a3b8;font-weight:700">已重置，重新開抽 🎉</span>'; });
        mask.querySelector('#cb-lot-x').addEventListener('click', () => mask.remove());
        mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
        mask.querySelector('#cb-lot-fsbtn').addEventListener('click', () => {
            const nums = lastDrawn.length ? lastDrawn : null;
            const inner = nums
                ? `<div style="display:flex;flex-wrap:wrap;gap:3vmin;align-items:center;justify-content:center">${nums.map(n => `<span class="cb-ball pop" style="min-width:22vmin;height:22vmin;font-size:11vmin">${n}</span>`).join('')}</div>`
                : `<div class="cb-fs-note" style="color:#94a3b8;font-size:6vmin">先抽一次再全螢幕喔！</div>`;
            openFs(inner, 'linear-gradient(135deg,#ecfeff,#fdf4ff)');
        });
        refreshStats();
    }

    // ───────────── 啟動 ─────────────
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectCSS);
    else injectCSS();
})();
