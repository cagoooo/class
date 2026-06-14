/**
 * zodiac-slot.js
 * 🧧 十二生肖・新年拉霸機 —— 開學破冰遊戲
 * @version 3.2.0
 *
 * 設計理念：
 *   開學第一堂課，用「拉霸試手氣」的儀式感快速帶動班級氣氛。
 *   每位同學輪流上台拉一把，三個生肖轉輪滾動後，得到：
 *     1) 一句過年祝福詞語（含白話小解釋，溫暖又應景）
 *     2) 一個有趣的獎項 / 禮物（混入大量「互動式破冰任務」）
 *   人人有獎，三連得頭獎、兩同得二獎、全不同也有參加獎。
 *
 * 純前端、零相依：自行注入 CSS、用 Web Audio 產生音效、重用主程式的
 *   triggerConfetti()（若存在）並自帶金幣雨。對外只暴露三個全域函式：
 *     window.zodiacSpin()        拉霸
 *     window.zodiacPickStudent() 抽一位同學上台
 *     window.zodiacInit()        進入區塊時初始化（由 showSection 呼叫）
 */
(function () {
    'use strict';

    // ───────────────────────── 資料 ─────────────────────────

    // 十二生肖
    const ZODIACS = [
        { emoji: '🐭', name: '鼠' },
        { emoji: '🐮', name: '牛' },
        { emoji: '🐯', name: '虎' },
        { emoji: '🐰', name: '兔' },
        { emoji: '🐲', name: '龍' },
        { emoji: '🐍', name: '蛇' },
        { emoji: '🐴', name: '馬' },
        { emoji: '🐑', name: '羊' },
        { emoji: '🐵', name: '猴' },
        { emoji: '🐔', name: '雞' },
        { emoji: '🐶', name: '狗' },
        { emoji: '🐷', name: '豬' }
    ];

    // 過年祝福詞語（四字吉祥話 + 一句白話小解釋，給國小學生看也懂）
    const BLESSINGS = [
        { word: '恭喜發財', emoji: '🧧', note: '新的一年福氣旺旺，紅包滿滿！' },
        { word: '新年快樂', emoji: '✨', note: '開開心心過新年，天天都有好心情！' },
        { word: '學業進步', emoji: '📚', note: '功課越來越棒，學什麼都上手！' },
        { word: '心想事成', emoji: '🌟', note: '心裡許的願望，今年通通實現！' },
        { word: '金榜題名', emoji: '🎯', note: '考試順順利利，成績亮眼！' },
        { word: '步步高升', emoji: '🚀', note: '一步一步往上爬，越來越厲害！' },
        { word: '福星高照', emoji: '☀️', note: '有福星罩著你，做什麼都順！' },
        { word: '好運連連', emoji: '🍀', note: '好運一個接一個，停不下來～' },
        { word: '萬事如意', emoji: '🎊', note: '每件事都照你的意思發展！' },
        { word: '笑口常開', emoji: '😄', note: '每天都笑嘻嘻，快樂滿出來！' },
        { word: '龍馬精神', emoji: '🐎', note: '活力十足、精神百倍一整年！' },
        { word: '虎虎生風', emoji: '🔥', note: '做事超有勁，威風又帥氣！' },
        { word: '聰明伶俐', emoji: '🧠', note: '頭腦動得快，反應一級棒！' },
        { word: '平安健康', emoji: '💪', note: '身體頭好壯壯，平平安安每一天！' },
        { word: '五福臨門', emoji: '🎁', note: '五種福氣一起來敲你家的門！' },
        { word: '招財進寶', emoji: '💰', note: '財神爺來報到，存錢撲滿滿出來！' },
        { word: '鴻運當頭', emoji: '🌈', note: '超級好運正當頭，運氣擋不住！' },
        { word: '出類拔萃', emoji: '🏆', note: '比別人更出色，閃閃發光！' },
        { word: '才華洋溢', emoji: '🎨', note: '才藝滿滿，走到哪裡都發光！' },
        { word: '勤學向上', emoji: '📖', note: '認真學習向上衝，進步看得見！' },
        { word: '日新又新', emoji: '🌱', note: '每天都進步一點點，越來越好！' },
        { word: '喜氣洋洋', emoji: '🏮', note: '到處都是喜氣，開心又熱鬧！' },
        { word: '大吉大利', emoji: '🍊', note: '超級吉利，做什麼都大成功！' },
        { word: '友愛同學', emoji: '🤝', note: '和同學相親相愛，朋友一大堆！' }
    ];

    // 獎項與禮物 —— 分三級。大量「互動任務」讓開學破冰更熱鬧。
    const PRIZES = {
        jackpot: [   // 頭獎：三個生肖一樣（最稀有最興奮）
            { emoji: '🎁', text: '免寫一次回家功課券！' },
            { emoji: '👑', text: '當一天班級小老師' },
            { emoji: '🍿', text: '全班一起看 10 分鐘影片' },
            { emoji: '🎮', text: '下課延長 5 分鐘（全班同享）' },
            { emoji: '⭐', text: '榮譽加 10 分！' },
            { emoji: '🎤', text: '點一首歌全班一起聽' },
            { emoji: '🏆', text: '老師神秘小禮物一份' },
            { emoji: '🪑', text: '自由選座位一整週' }
        ],
        pair: [      // 二獎：兩個生肖一樣
            { emoji: '⭐', text: '榮譽加 5 分！' },
            { emoji: '🙌', text: '全班為你鼓掌 10 秒' },
            { emoji: '🤝', text: '跟老師擊掌＋拍一張帥照／美照' },
            { emoji: '🍬', text: '糖果一顆' },
            { emoji: '✏️', text: '文具小禮物一份' },
            { emoji: '🎫', text: '免值日生一次券' },
            { emoji: '🌟', text: '自由選座位一天' },
            { emoji: '📢', text: '當一節課的小幫手' }
        ],
        consolation: [   // 參加獎：三個都不同（人人有獎，全是破冰互動任務）
            { emoji: '🌟', text: '榮譽加 1 分，新年好彩頭！' },
            { emoji: '😄', text: '大聲說出一個「新年新希望」' },
            { emoji: '🕺', text: '帶全班一起做一個搞笑動作' },
            { emoji: '👏', text: '跟左右同學擊掌說「新年快樂」' },
            { emoji: '🗣️', text: '自我介紹一句話＋分享一個興趣' },
            { emoji: '🤗', text: '給隔壁同學一句真心讚美' },
            { emoji: '🎵', text: '哼一句你最愛的歌給大家聽' },
            { emoji: '🔄', text: '好運在路上，下次再接再厲！' }
        ]
    };

    // 生肖專屬吉祥話（三連時當作彩蛋祝福，更有儀式感）
    const ZODIAC_BLESSING = {
        '鼠': '鼠來寶 · 數錢數到手抽筋！',
        '牛': '牛轉乾坤 · 好運牛年年！',
        '虎': '生龍活虎 · 虎力全開！',
        '兔': '揚眉兔氣 · 前途似錦！',
        '龍': '龍騰虎躍 · 一飛沖天！',
        '蛇': '金蛇獻瑞 · 靈活有智慧！',
        '馬': '馬到成功 · 一路領先！',
        '羊': '三羊開泰 · 吉祥如意！',
        '猴': '靈猴獻瑞 · 機靈又聰明！',
        '雞': '金雞報喜 · 好事連連！',
        '狗': '旺旺好運 · 忠誠又勇敢！',
        '豬': '豬事大吉 · 福氣滿滿！'
    };

    // 中獎吶喊（頭獎連線成功時的大字橫幅，活潑搶眼）
    const JACKPOT_SHOUTS = ['🎉 中獎啦！', '✨ 好運到！', '💰 財運滾滾來！', '🧧 大吉大利！', '🌈 旺到不行！', '🍀 福氣滿滿！', '🎊 事事順心！', '🔥 財運爆棚！'];

    // ───────────────────────── 狀態 ─────────────────────────
    let spinning = false;
    let playCount = 0;
    let currentPlayer = null;
    let pickedIds = [];          // 本輪已抽過的學生 id，確保人人有機會輪到

    // ───────────────────────── CSS 注入 ─────────────────────────
    function injectCSS() {
        if (document.getElementById('zodiac-slot-style')) return;
        const css = `
        #zodiac-section .zslot-subtitle{color:#9a3412;font-weight:600}
        /* 抽同學上台 */
        .zslot-stage{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem;
            background:linear-gradient(135deg,#fff7ed,#fef2f2);border:2px dashed #fca5a5;
            border-radius:1rem;padding:.9rem 1.1rem;margin-bottom:1.25rem}
        .zslot-pick-btn{background:linear-gradient(135deg,#f43f5e,#e11d48);color:#fff;
            font-weight:700;padding:.6rem 1.1rem;border-radius:9999px;box-shadow:0 4px 0 #9f1239;
            transition:transform .1s ease,box-shadow .1s ease;white-space:nowrap}
        .zslot-pick-btn:active{transform:translateY(3px);box-shadow:0 1px 0 #9f1239}
        .zslot-player{font-size:1.05rem;font-weight:700;color:#b91c1c}
        .zslot-player .nm{font-size:1.45rem;background:linear-gradient(90deg,#dc2626,#f59e0b);
            -webkit-background-clip:text;background-clip:text;color:transparent;padding:0 .15em}

        /* 機台外框 */
        .zslot-machine-wrap{display:flex;justify-content:center;perspective:900px}
        .zslot-machine{position:relative;width:min(440px,100%);
            background:linear-gradient(160deg,#dc2626 0%,#b91c1c 55%,#991b1b 100%);
            border-radius:26px;padding:18px 20px 24px;
            box-shadow:0 18px 40px rgba(127,29,29,.45),inset 0 2px 6px rgba(255,255,255,.25);
            border:4px solid #fbbf24}
        /* 跑馬燈頂飾 */
        .zslot-marquee{display:flex;align-items:center;justify-content:center;gap:.4rem;
            background:linear-gradient(90deg,#7f1d1d,#b91c1c,#7f1d1d);border-radius:14px;
            padding:8px 10px;margin-bottom:14px;border:2px solid #fcd34d;position:relative;overflow:hidden}
        .zslot-marquee .ttl{font-weight:800;letter-spacing:.15em;color:#fde68a;
            text-shadow:0 1px 2px rgba(0,0,0,.4);font-size:1.05rem}
        .zslot-bulbs{position:absolute;inset:0;pointer-events:none}
        .zslot-bulbs span{position:absolute;top:3px;width:7px;height:7px;border-radius:50%;
            background:#fde047;box-shadow:0 0 6px #fde047;animation:zbulb 1s infinite}
        @keyframes zbulb{0%,100%{opacity:.25}50%{opacity:1}}
        /* 轉輪視窗 */
        .zslot-screen{background:#1f2937;border-radius:16px;padding:14px;
            border:3px solid #fbbf24;box-shadow:inset 0 4px 14px rgba(0,0,0,.6)}
        .zslot-reels{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
        .zslot-reel{aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;
            font-size:clamp(2.6rem,12vw,3.6rem);line-height:1;
            background:radial-gradient(circle at 50% 30%,#fffbeb,#fde68a);
            border-radius:12px;box-shadow:inset 0 -6px 10px rgba(180,83,9,.35),inset 0 4px 8px rgba(255,255,255,.8);
            user-select:none;transition:transform .15s ease}
        .zslot-reel.spinning{animation:zshake .12s linear infinite;filter:blur(1px)}
        @keyframes zshake{0%{transform:translateY(-4px)}50%{transform:translateY(4px)}100%{transform:translateY(-4px)}}
        .zslot-reel.landed{animation:zland .45s cubic-bezier(.2,1.6,.4,1)}
        @keyframes zland{0%{transform:scale(.7)}60%{transform:scale(1.18)}100%{transform:scale(1)}}
        .zslot-reel.win-glow{box-shadow:0 0 0 4px #f59e0b,0 0 22px 6px #fbbf24,inset 0 4px 8px rgba(255,255,255,.8)}

        /* 底座 + 拉霸鈕 */
        .zslot-base{margin-top:16px;text-align:center}
        .zslot-spin-btn{background:linear-gradient(180deg,#fbbf24,#f59e0b);color:#7f1d1d;
            font-weight:900;font-size:1.2rem;letter-spacing:.05em;padding:.7rem 2.2rem;border-radius:9999px;
            box-shadow:0 6px 0 #b45309,0 10px 18px rgba(0,0,0,.25);transition:transform .1s ease,box-shadow .1s ease}
        .zslot-spin-btn:active:not(:disabled){transform:translateY(4px);box-shadow:0 2px 0 #b45309}
        .zslot-spin-btn:disabled{opacity:.6;cursor:not-allowed}
        /* 側邊拉桿 */
        .zslot-lever{position:absolute;right:-26px;top:78px;width:18px;height:120px;cursor:pointer}
        .zslot-lever .rod{position:absolute;left:6px;top:18px;width:6px;height:100px;
            background:linear-gradient(90deg,#9ca3af,#e5e7eb,#9ca3af);border-radius:4px;transform-origin:bottom}
        .zslot-lever .knob{position:absolute;left:-4px;top:0;width:26px;height:26px;border-radius:50%;
            background:radial-gradient(circle at 35% 30%,#fca5a5,#dc2626);box-shadow:0 3px 6px rgba(0,0,0,.4);
            transition:transform .25s cubic-bezier(.3,1.4,.5,1)}
        .zslot-lever.pulled .knob{transform:translateY(70px)}
        .zslot-lever-hint{position:absolute;right:-34px;top:206px;font-size:.62rem;color:#fecaca;
            writing-mode:vertical-rl;letter-spacing:.1em}

        /* 結果卡（春聯風） */
        .zslot-result{margin-top:1.5rem;opacity:0;transform:translateY(12px);
            transition:opacity .4s ease,transform .4s ease}
        .zslot-result.show{opacity:1;transform:translateY(0)}
        .zslot-card{max-width:520px;margin:0 auto;border-radius:20px;padding:1.4rem 1.5rem;text-align:center;
            background:linear-gradient(160deg,#fff7ed,#fee2e2);border:3px solid #fbbf24;
            box-shadow:0 12px 30px rgba(127,29,29,.25)}
        .zslot-badge{display:inline-block;font-weight:800;padding:.25rem 1rem;border-radius:9999px;
            font-size:.95rem;color:#fff;margin-bottom:.6rem}
        .zslot-badge.jackpot{background:linear-gradient(90deg,#f59e0b,#dc2626);animation:zpulse 1s infinite}
        .zslot-badge.pair{background:linear-gradient(90deg,#f97316,#ea580c)}
        .zslot-badge.consolation{background:linear-gradient(90deg,#10b981,#059669)}
        @keyframes zpulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
        .zslot-combo{font-size:2rem;letter-spacing:.2em;margin:.2rem 0 .6rem}
        .zslot-bless{font-size:1.9rem;font-weight:900;color:#b91c1c;letter-spacing:.12em;margin:.2rem 0}
        .zslot-bless-note{color:#92400e;font-size:.95rem;margin-bottom:.9rem}
        .zslot-prize{display:inline-flex;align-items:center;gap:.5rem;background:#fff;border:2px dashed #f87171;
            border-radius:14px;padding:.7rem 1.1rem;font-size:1.15rem;font-weight:700;color:#b91c1c;
            box-shadow:0 4px 10px rgba(0,0,0,.08)}
        .zslot-prize .pe{font-size:1.5rem}
        .zslot-result-for{color:#9a3412;font-weight:700;margin-bottom:.5rem}

        /* 統計列 */
        .zslot-stats{text-align:center;color:#9a3412;font-weight:600;margin-top:1.1rem}

        /* 金幣雨 */
        .zslot-coin{position:fixed;top:-40px;font-size:1.8rem;z-index:1001;pointer-events:none;
            animation:zcoin linear forwards}
        @keyframes zcoin{0%{transform:translateY(0) rotate(0)}100%{transform:translateY(108vh) rotate(540deg)}}

        /* === v3.7.1 視覺升級：圓體字、連線、煙火閃光、星星愛心金幣 === */
        .zslot-bless,.zslot-combo{font-family:'Mochiyochi Pop One','Noto Sans TC',sans-serif}
        .zslot-spin-btn,.zslot-pick-btn,.zslot-lever{touch-action:manipulation;-webkit-tap-highlight-color:transparent}
        /* 中獎吶喊橫幅 */
        .zslot-shout{font-family:'Mochiyochi Pop One','Noto Sans TC',sans-serif;font-weight:900;
            font-size:clamp(1.6rem,6vw,2.6rem);letter-spacing:.06em;margin-bottom:.4rem;
            background:linear-gradient(90deg,#dc2626,#f59e0b,#dc2626);-webkit-background-clip:text;background-clip:text;color:transparent;
            animation:zshout .6s cubic-bezier(.2,1.7,.4,1)}
        .zslot-shout.pair{font-size:clamp(1.3rem,5vw,2rem);background:linear-gradient(90deg,#f97316,#ea580c);
            -webkit-background-clip:text;background-clip:text}
        @keyframes zshout{0%{transform:scale(.3) rotate(-8deg);opacity:0}60%{transform:scale(1.15) rotate(3deg)}100%{transform:scale(1) rotate(0);opacity:1}}
        /* 連線發光線（拉霸連線成功） */
        .zslot-reels{position:relative}
        .zslot-winline{position:absolute;top:50%;height:0;transform:translateY(-50%);pointer-events:none;z-index:5;
            border-top:5px solid #fde047;border-radius:6px;box-shadow:0 0 12px 4px #fbbf24,0 0 26px 8px rgba(245,158,11,.6);
            animation:zline .5s ease both}
        @keyframes zline{0%{opacity:0;transform:translateY(-50%) scaleX(.1)}100%{opacity:1;transform:translateY(-50%) scaleX(1)}}
        /* 機台中獎閃光 + 跑馬燈加速 */
        .zslot-machine.flash{animation:zflash .6s ease}
        @keyframes zflash{0%,100%{box-shadow:0 18px 40px rgba(127,29,29,.45),inset 0 2px 6px rgba(255,255,255,.25)}
            40%{box-shadow:0 0 0 6px #fde047,0 0 44px 14px #fbbf24,inset 0 0 30px rgba(255,255,255,.6)}}
        .zslot-bulbs.win span{animation-duration:.32s}
        /* 星星 / 愛心 / 金幣 上飄 */
        .zslot-spark{position:fixed;z-index:1002;pointer-events:none;font-size:1.6rem;animation:zspark 1.3s ease-out forwards}
        @keyframes zspark{0%{opacity:0;transform:translateY(0) scale(.4) rotate(0)}20%{opacity:1}100%{opacity:0;transform:translateY(-130px) scale(1.3) rotate(25deg)}}

        @media (max-width:480px){.zslot-lever{display:none}}
        `;
        const style = document.createElement('style');
        style.id = 'zodiac-slot-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ───────────────────────── 音效（Web Audio） ─────────────────────────
    function getCtx() {
        if (window.audioContext) return window.audioContext;
        try {
            window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) { return null; }
        return window.audioContext;
    }
    function tone(freq, dur, type, vol, when) {
        const ctx = getCtx();
        if (!ctx) return;
        const t0 = ctx.currentTime + (when || 0);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type || 'square';
        osc.frequency.setValueAtTime(freq, t0);
        gain.gain.setValueAtTime(vol || 0.15, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    }
    function sndTick() { tone(660, 0.05, 'square', 0.05); }
    function sndStop() { tone(180, 0.12, 'sine', 0.22); }
    function sndWin(level) {
        const seq = level === 'jackpot'
            ? [523, 659, 784, 1047, 1319]
            : level === 'pair'
                ? [523, 659, 784]
                : [659, 784];
        seq.forEach((f, i) => tone(f, 0.18, 'triangle', 0.2, i * 0.12));
        if (level === 'jackpot') tone(1568, 0.5, 'triangle', 0.18, seq.length * 0.12);
    }

    // ───────────────────────── 金幣雨 ─────────────────────────
    function coinRain(count) {
        const coins = ['🪙', '💰', '🧧', '🟡'];
        for (let i = 0; i < count; i++) {
            const c = document.createElement('div');
            c.className = 'zslot-coin';
            c.textContent = coins[i % coins.length];
            c.style.left = Math.random() * 100 + 'vw';
            c.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
            c.style.animationDelay = (Math.random() * 0.5) + 's';
            document.body.appendChild(c);
            setTimeout(() => c.remove(), 3500);
        }
    }
    // 星星 / 愛心 / 金幣 從機台往上飄（療癒亮晶晶）
    function sparkleFloat(count) {
        const marks = ['✨', '💖', '🌟', '⭐', '🪙', '💛'];
        const wrap = document.querySelector('.zslot-machine-wrap');
        const r = wrap ? wrap.getBoundingClientRect() : { left: window.innerWidth / 2 - 100, top: window.innerHeight / 2, width: 200, height: 200 };
        for (let i = 0; i < count; i++) {
            const s = document.createElement('div');
            s.className = 'zslot-spark';
            s.textContent = marks[i % marks.length];
            s.style.left = (r.left + Math.random() * r.width) + 'px';
            s.style.top = (r.top + r.height * 0.25 + Math.random() * 50) + 'px';
            s.style.animationDelay = (Math.random() * 0.4) + 's';
            document.body.appendChild(s);
            setTimeout(() => s.remove(), 1800);
        }
    }
    // 機台閃光 + 跑馬燈加速
    function flashMachine() {
        const m = document.querySelector('.zslot-machine');
        if (m) { m.classList.remove('flash'); void m.offsetWidth; m.classList.add('flash'); setTimeout(() => m.classList.remove('flash'), 700); }
        const bulbs = document.querySelector('.zslot-bulbs');
        if (bulbs) { bulbs.classList.add('win'); setTimeout(() => bulbs.classList.remove('win'), 1300); }
    }
    // 連線發光線：跨越中獎的轉輪（3 欄，第 i 顆中心約 (i+0.5)/3）
    function showWinLine(indices) {
        const reelsEl = document.querySelector('.zslot-reels');
        if (!reelsEl || !indices || !indices.length) return;
        reelsEl.querySelectorAll('.zslot-winline').forEach(e => e.remove());
        const a = Math.min.apply(null, indices), b = Math.max.apply(null, indices);
        const center = i => (i + 0.5) / 3 * 100;
        const line = document.createElement('div');
        line.className = 'zslot-winline';
        line.style.left = center(a) + '%';
        line.style.width = (center(b) - center(a)) + '%';
        if (a === b) { line.style.width = '14%'; line.style.left = (center(a) - 7) + '%'; }
        reelsEl.appendChild(line);
    }

    function celebrate(level) {
        if (typeof window.triggerConfetti === 'function') window.triggerConfetti();
        if (level === 'jackpot') { coinRain(28); flashMachine(); sparkleFloat(16); }
        else if (level === 'pair') { coinRain(12); flashMachine(); sparkleFloat(8); }
        else { sparkleFloat(4); }   // 參加獎也來幾顆星星，療癒不冷場
    }

    // ───────────────────────── 工具 ─────────────────────────
    const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
    function shuffle(a) {
        const arr = a.slice();
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
    function pickN(arr, n) { return shuffle(arr).slice(0, n); }

    // 先決定中獎等級（加權，讓頭獎在班上夠常出現、人人有獎）
    function decideLevel() {
        const r = Math.random();
        if (r < 0.12) return 'jackpot';      // 三連 ~12%
        if (r < 0.50) return 'pair';         // 兩同 ~38%
        return 'consolation';                // 全不同 ~50%
    }
    // 依等級產生三個轉輪的目標生肖
    function buildTargets(level) {
        if (level === 'jackpot') {
            const z = rand(ZODIACS);
            return [z, z, z];
        }
        if (level === 'pair') {
            const [a, b] = pickN(ZODIACS, 2);
            return shuffle([a, a, b]);
        }
        return pickN(ZODIACS, 3);            // 三個都不同
    }

    // ───────────────────────── 拉霸主流程 ─────────────────────────
    window.zodiacSpin = function () {
        if (spinning) return;
        spinning = true;
        getCtx();                            // 在使用者點擊當下解鎖音訊

        const btn = document.getElementById('zslot-spin-btn');
        const lever = document.getElementById('zslot-lever');
        const result = document.getElementById('zslot-result');
        if (btn) { btn.disabled = true; btn.textContent = '🎰 轉動中…'; }
        if (lever) { lever.classList.add('pulled'); setTimeout(() => lever.classList.remove('pulled'), 600); }
        if (result) { result.classList.remove('show'); result.classList.add('hidden'); }
        // 清掉上一輪的連線發光線與機台閃光
        document.querySelectorAll('.zslot-winline').forEach(e => e.remove());
        const machineEl = document.querySelector('.zslot-machine');
        if (machineEl) machineEl.classList.remove('flash');

        const level = decideLevel();
        const targets = buildTargets(level);
        const reels = [0, 1, 2].map(i => document.getElementById('zslot-reel-' + i));

        // 啟動三個轉輪的快速跳動
        const intervals = reels.map((reel) => {
            if (!reel) return null;
            reel.classList.remove('landed', 'win-glow');
            reel.classList.add('spinning');
            let tickToggle = 0;
            return setInterval(() => {
                reel.textContent = rand(ZODIACS).emoji;
                if (tickToggle++ % 2 === 0) sndTick();
            }, 70);
        });

        // 依序停下：0 → 1 → 2
        const stopTimes = [900, 1500, 2200];
        reels.forEach((reel, i) => {
            setTimeout(() => {
                if (intervals[i]) clearInterval(intervals[i]);
                if (!reel) return;
                reel.classList.remove('spinning');
                reel.textContent = targets[i].emoji;
                reel.classList.add('landed');
                sndStop();
                if (i === reels.length - 1) {
                    setTimeout(() => revealResult(level, targets, reels), 350);
                }
            }, stopTimes[i]);
        });
    };

    function revealResult(level, targets, reels) {
        // 祝福詞：頭獎用該生肖專屬吉祥話當主標，其餘隨機
        let blessWord, blessNote, blessEmoji;
        let matchedIdx = [];        // 連線（相同生肖）的轉輪索引
        if (level === 'jackpot') {
            const z = targets[0];
            blessWord = ZODIACS && ZODIAC_BLESSING[z.name] ? ZODIAC_BLESSING[z.name].split(' · ')[0] : rand(BLESSINGS).word;
            blessNote = ZODIAC_BLESSING[z.name] || '';
            blessEmoji = z.emoji;
            matchedIdx = [0, 1, 2];
            reels.forEach(r => r && r.classList.add('win-glow'));
        } else if (level === 'pair') {
            const b = rand(BLESSINGS);
            blessWord = b.word; blessNote = b.note; blessEmoji = b.emoji;
            // 標出相同的兩個輪子
            const counts = {};
            targets.forEach((t, i) => { (counts[t.name] = counts[t.name] || []).push(i); });
            Object.values(counts).forEach(idxs => {
                if (idxs.length === 2) { matchedIdx = idxs.slice(); idxs.forEach(i => reels[i] && reels[i].classList.add('win-glow')); }
            });
        } else {
            const b = rand(BLESSINGS);
            blessWord = b.word; blessNote = b.note; blessEmoji = b.emoji;
        }
        // 中獎吶喊橫幅
        const shout = level === 'jackpot' ? rand(JACKPOT_SHOUTS) : (level === 'pair' ? '✨ 喜相逢！' : '');

        const prize = rand(PRIZES[level]);
        const meta = {
            jackpot: { cls: 'jackpot', label: '🎉 頭獎・三連發 🎉' },
            pair: { cls: 'pair', label: '✨ 二獎・喜相逢 ✨' },
            consolation: { cls: 'consolation', label: '🎊 參加獎・好彩頭 🎊' }
        }[level];

        const combo = targets.map(t => t.emoji).join(' ');
        const forWho = currentPlayer
            ? `<div class="zslot-result-for">🙋 ${escapeHtml(currentPlayer)} 同學的手氣</div>` : '';

        const result = document.getElementById('zslot-result');
        if (result) {
            result.innerHTML = `
                <div class="zslot-card">
                    ${forWho}
                    ${shout ? `<div class="zslot-shout ${level === 'pair' ? 'pair' : ''}">${shout}</div>` : ''}
                    <div class="zslot-badge ${meta.cls}">${meta.label}</div>
                    <div class="zslot-combo">${combo}</div>
                    <div class="zslot-bless">${blessEmoji} ${blessWord}</div>
                    <div class="zslot-bless-note">${escapeHtml(blessNote)}</div>
                    <div class="zslot-prize"><span class="pe">${prize.emoji}</span>${escapeHtml(prize.text)}</div>
                </div>`;
            result.classList.remove('hidden');
            // 觸發進場動畫
            requestAnimationFrame(() => result.classList.add('show'));
            setTimeout(() => result.classList.add('show'), 30); // 隱藏分頁 rAF 不跑時的保險
            // ✨ 自動捲動到結果卡，讓全班立刻看到中獎結果（只在結果未完整露出時才捲，避免已可見時亂跳）
            setTimeout(() => {
                try {
                    const rect = result.getBoundingClientRect();
                    const vh = window.innerHeight || document.documentElement.clientHeight;
                    const fullyVisible = rect.top >= 0 && rect.bottom <= vh;
                    if (!fullyVisible) result.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } catch (e) {
                    try { result.scrollIntoView(); } catch (e2) { /* ignore */ }
                }
            }, 150);
        }

        // 拉霸連線成功：畫出發光連線
        showWinLine(matchedIdx);

        sndWin(level);
        celebrate(level);

        playCount++;
        updateCount();

        const btn = document.getElementById('zslot-spin-btn');
        if (btn) { btn.disabled = false; btn.textContent = '🧧 再拉一把！'; }
        spinning = false;
    }

    // ───────────────────────── 抽一位同學上台 ─────────────────────────
    window.zodiacPickStudent = function () {
        const list = Array.isArray(window.students) ? window.students : [];
        const playerEl = document.getElementById('zslot-current-player');
        if (list.length === 0) {
            if (typeof window.NotificationSystem !== 'undefined' && NotificationSystem.warning) {
                NotificationSystem.warning('還沒有學生名單喔！可先到「學生管理」新增，或老師直接拉霸。');
            } else {
                alert('還沒有學生名單，請先到「學生管理」新增。');
            }
            return;
        }
        // 過濾掉本輪已抽過的；全抽完就重置（人人輪一次）
        let pool = list.filter(s => !pickedIds.includes(s.id));
        if (pool.length === 0) {
            pickedIds = [];
            pool = list.slice();
            if (typeof window.NotificationSystem !== 'undefined' && NotificationSystem.info) {
                NotificationSystem.info('全班都輪過一次囉！重新開始新一輪 🎉');
            }
        }
        const chosen = rand(pool);
        pickedIds.push(chosen.id);
        currentPlayer = chosen.name;

        // 小小抽人動畫：名字快速跳動後定格
        if (playerEl) {
            let ticks = 0;
            const flicker = setInterval(() => {
                const tmp = rand(list);
                playerEl.innerHTML = `🎲 <span class="nm">${escapeHtml(tmp.name)}</span>`;
                sndTick();
                if (++ticks >= 12) {
                    clearInterval(flicker);
                    playerEl.innerHTML = `✨ 請 <span class="nm">${escapeHtml(chosen.name)}</span> 同學上台拉霸！`;
                    sndStop();
                }
            }, 80);
        }
    };

    // ───────────────────────── 小工具 ─────────────────────────
    function updateCount() {
        const el = document.getElementById('zslot-count');
        if (el) el.textContent = playCount;
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // 進入區塊時呼叫（由 showSection 觸發）
    window.zodiacInit = function () {
        injectCSS();
        updateCount();
    };

    // 確保樣式就緒（即使尚未進入區塊）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectCSS);
    } else {
        injectCSS();
    }
})();
