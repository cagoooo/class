/**
 * brush-check.js
 * 🦷 潔牙勾選表 —— 可愛風、適合國小學生
 * @version 3.6.0
 *
 * 需求：
 *   - 標題：「潔牙做得好，健康沒煩惱」（60 號字）
 *   - 內文 24 號字
 *   - 左方提醒區：吃完飯要 潔牙 / 擦桌子 / 上廁所
 *   - 右方號碼區：1～30 號，每顆牙齒上有號碼，點了之後牙齒「亮晶晶」✨
 *   - 每天自動換新（換日重置勾選），資料依班級隔離
 *
 * 對外：window.BrushCheck.{ init, toggle, reset }
 */
(function () {
    'use strict';

    const TOTAL = 30;
    const K = 'brushChecked';   // {date:'YYYY/M/D', ids:[..]}，已加入 class-aware SHARED_KEYS

    const REMINDERS = [
        { emoji: '🦷', title: '潔牙', sub: '把牙齒刷得亮晶晶' },
        { emoji: '🧽', title: '擦桌子', sub: '桌面收乾淨' },
        { emoji: '🚽', title: '上廁所', sub: '記得洗手手' }
    ];

    function today() { return new Date().toLocaleDateString('zh-TW'); }
    function load() {
        try {
            const o = JSON.parse(localStorage.getItem(K) || '{}');
            if (o && o.date === today() && Array.isArray(o.ids)) return o.ids;
        } catch (e) { }
        return [];
    }
    function save(ids) { try { localStorage.setItem(K, JSON.stringify({ date: today(), ids })); } catch (e) { } }

    let checked = [];

    // ───────────── CSS ─────────────
    function injectCSS() {
        if (document.getElementById('brush-check-style')) return;
        const css = `
        .bc-wrap{font-family:'Mochiyochi Pop One','Noto Sans TC',sans-serif}
        .bc-title{font-size:clamp(34px,7vw,60px);font-weight:900;text-align:center;line-height:1.25;margin-bottom:1.1rem;
            color:#0e7490;text-shadow:0 2px 0 #cffafe;letter-spacing:.04em}
        .bc-title .tooth{font-size:.95em}
        .bc-grid{display:grid;grid-template-columns:1fr;gap:1rem}
        @media(min-width:1024px){.bc-grid{grid-template-columns:270px 1fr}}
        /* 左：提醒區 */
        .bc-remind{background:linear-gradient(160deg,#ecfeff,#eff6ff);border:3px solid #a5f3fc;border-radius:1.25rem;padding:1.1rem}
        .bc-remind h3{font-size:clamp(20px,2.4vw,24px);font-weight:900;color:#0369a1;margin-bottom:.8rem;text-align:center}
        .bc-remind-item{display:flex;align-items:center;gap:.7rem;background:#fff;border-radius:1rem;padding:.7rem .9rem;margin-bottom:.7rem;
            box-shadow:0 3px 8px rgba(2,132,199,.08)}
        .bc-remind-item:last-child{margin-bottom:0}
        .bc-remind-item .e{font-size:2.2rem;line-height:1;flex:none}
        .bc-remind-item .t{font-size:24px;font-weight:900;color:#0e7490;line-height:1.2}
        .bc-remind-item .s{font-size:15px;font-weight:600;color:#64748b}
        /* 右：號碼牙齒區 */
        .bc-teeth-area{background:#fff;border:3px solid #bae6fd;border-radius:1.25rem;padding:1rem}
        .bc-teeth-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem;margin-bottom:.9rem}
        .bc-count{font-size:24px;font-weight:900;color:#0891b2}
        .bc-reset{background:#e0f2fe;color:#0369a1;border:none;border-radius:9999px;padding:.45rem 1rem;font-weight:800;cursor:pointer;font-size:.9rem;transition:background .15s}
        .bc-reset:hover{background:#bae6fd}
        .bc-teeth{display:grid;grid-template-columns:repeat(5,1fr);gap:.55rem}
        @media(min-width:640px){.bc-teeth{grid-template-columns:repeat(6,1fr)}}
        @media(min-width:1024px){.bc-teeth{grid-template-columns:repeat(10,1fr);gap:.7rem}}
        .bc-tooth{position:relative;aspect-ratio:1/1.12;border:none;cursor:pointer;padding:0;background:transparent;
            display:flex;align-items:center;justify-content:center;transition:transform .12s}
        .bc-tooth:hover{transform:translateY(-3px) scale(1.04)}
        .bc-tooth:active{transform:scale(.92)}
        /* 牙齒外型 */
        .bc-tooth .shape{position:absolute;inset:0;border-radius:48% 48% 42% 42%/56% 56% 46% 46%;
            background:linear-gradient(160deg,#ffffff,#e8f1fb);box-shadow:inset 0 -6px 10px rgba(148,163,184,.25),0 4px 8px rgba(2,132,199,.12);
            border:2px solid #e2e8f0;overflow:hidden;transition:all .2s}
        .bc-tooth .shape::after{content:'';position:absolute;bottom:6%;left:50%;transform:translateX(-50%);
            width:22%;height:16%;background:#dbeafe;border-radius:50%}
        .bc-num{position:relative;z-index:2;font-size:clamp(20px,3.4vw,30px);font-weight:900;color:#64748b;transition:color .2s}
        /* 勾選後：亮晶晶 */
        .bc-tooth.on .shape{background:linear-gradient(160deg,#ccfbf1,#a7f3d0);border-color:#34d399;
            box-shadow:inset 0 -6px 10px rgba(16,185,129,.25),0 0 0 3px #6ee7b7,0 0 18px 4px rgba(52,211,153,.55)}
        .bc-tooth.on .num,.bc-tooth.on .bc-num{color:#047857}
        /* 亮晶晶：移動的高光掃過 */
        .bc-tooth.on .shape::before{content:'';position:absolute;top:-60%;left:-30%;width:50%;height:220%;
            background:linear-gradient(90deg,transparent,rgba(255,255,255,.85),transparent);transform:rotate(20deg);
            animation:bcShine 2s ease-in-out infinite}
        @keyframes bcShine{0%{left:-40%}60%,100%{left:130%}}
        /* 角落 ✨ */
        .bc-tooth.on .spk1,.bc-tooth.on .spk2{position:absolute;z-index:3;font-size:1rem;animation:bcTwinkle 1.2s ease-in-out infinite}
        .bc-tooth .spk1,.bc-tooth .spk2{display:none}
        .bc-tooth.on .spk1{display:block;top:-6px;right:-2px}
        .bc-tooth.on .spk2{display:block;bottom:2px;left:-4px;animation-delay:.4s}
        @keyframes bcTwinkle{0%,100%{opacity:.3;transform:scale(.7) rotate(0)}50%{opacity:1;transform:scale(1.15) rotate(20deg)}}
        .bc-tooth.on .chk{position:absolute;z-index:4;top:-6px;left:-4px;font-size:1.05rem;animation:bcPop .4s cubic-bezier(.2,1.6,.4,1)}
        .bc-tooth .chk{display:none}
        .bc-tooth.on .chk{display:block}
        @keyframes bcPop{0%{transform:scale(0)}60%{transform:scale(1.3)}100%{transform:scale(1)}}
        /* 點擊時噴出的 ✨ */
        .bc-burst{position:absolute;z-index:9999;pointer-events:none;font-size:1.2rem;animation:bcBurst .7s ease-out forwards}
        @keyframes bcBurst{0%{opacity:1;transform:translate(0,0) scale(.6)}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(1.3)}}
        .bc-done{text-align:center;font-size:24px;font-weight:900;color:#059669;margin-top:1rem;display:none}
        .bc-done.show{display:block;animation:bcPop .5s cubic-bezier(.2,1.6,.4,1)}
        `;
        const st = document.createElement('style');
        st.id = 'brush-check-style';
        st.textContent = css;
        (document.head || document.documentElement).appendChild(st);
    }

    // ───────────── 渲染 ─────────────
    function renderTeeth() {
        const wrap = document.getElementById('bc-teeth');
        if (!wrap) return;
        let html = '';
        for (let n = 1; n <= TOTAL; n++) {
            const on = checked.includes(n);
            html += `<button class="bc-tooth ${on ? 'on' : ''}" data-n="${n}" aria-label="${n} 號" aria-pressed="${on}">
                <span class="shape"></span>
                <span class="spk1">✨</span><span class="spk2">✨</span><span class="chk">✅</span>
                <span class="bc-num">${n}</span>
            </button>`;
        }
        wrap.innerHTML = html;
        wrap.querySelectorAll('.bc-tooth').forEach(b => b.addEventListener('click', () => api.toggle(parseInt(b.dataset.n, 10), b)));
    }
    function updateCount() {
        const c = document.getElementById('bc-count');
        if (c) c.textContent = '✨ 已潔牙 ' + checked.length + ' / ' + TOTAL;
        const done = document.getElementById('bc-done');
        if (done) done.classList.toggle('show', checked.length === TOTAL);
    }
    function sparkleBurst(btn) {
        if (!btn) return;
        const marks = ['✨', '⭐', '💫', '🌟'];
        for (let i = 0; i < 6; i++) {
            const s = document.createElement('span');
            s.className = 'bc-burst';
            s.textContent = marks[i % marks.length];
            const ang = (Math.PI * 2 * i) / 6;
            s.style.left = '50%'; s.style.top = '40%';
            s.style.setProperty('--dx', Math.cos(ang) * 42 + 'px');
            s.style.setProperty('--dy', Math.sin(ang) * 42 + 'px');
            btn.appendChild(s);
            setTimeout(() => s.remove(), 750);
        }
    }

    // ───────────── 對外 API ─────────────
    const api = {
        init() {
            injectCSS();
            checked = load();
            renderTeeth();
            updateCount();
        },
        toggle(n, btn) {
            const i = checked.indexOf(n);
            const nowOn = i === -1;
            if (nowOn) checked.push(n); else checked.splice(i, 1);
            save(checked);
            if (btn) {
                btn.classList.toggle('on', nowOn);
                btn.setAttribute('aria-pressed', nowOn ? 'true' : 'false');
                if (nowOn) sparkleBurst(btn);
            } else {
                renderTeeth();
            }
            updateCount();
            if (nowOn && checked.length === TOTAL && typeof window.triggerConfetti === 'function') window.triggerConfetti();
        },
        reset() {
            checked = [];
            save(checked);
            renderTeeth();
            updateCount();
        }
    };
    window.BrushCheck = api;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectCSS);
    else injectCSS();
})();
