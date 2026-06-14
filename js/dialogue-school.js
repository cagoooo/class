/**
 * dialogue-school.js
 * 💬 生動對話小學堂 —— 國語寫作互動教學（4 關卡）
 * @version 3.8.0
 *
 * 由外部 React 原型移植 + 優化為班級小管家原生模組：
 *   關卡一 學習祕笈：心情/表情+動作+對話 的魔法公式 + 課本範例（鼠鹿遇老虎）+ 語氣朗讀
 *   關卡二 牛刀小試：三年坡 拖曳/點擊 填空（心情/表情/動作）+ 檢查 + 朗讀示範
 *   關卡三 寫作挑戰：10 個經典故事情境，主角反應 + 對手回應，支援語音輸入(SpeechRecognition)
 *   關卡四 小劇場：12 種背景、開幕/閉幕布幕、掌聲、全螢幕表演
 *
 * 優化重點：
 *   - lucide 圖示 → emoji；animate-in 外掛類別 → 自寫淡入
 *   - 外部掌聲音檔 → Web Audio 合成（離線可用，符合 PWA）
 *   - TTS 自動挑選中文語音；全螢幕用 overlay + Fullscreen API（吃掉 Promise rejection）
 *   - 依賴頁面已載入的 Tailwind Play CDN（動態 class 即時生效），自注入自訂動畫
 *
 * 對外：window.DialogueSchool.{ init, tab, speak, selectScenario, drawCard, toggleRec, onType,
 *                               dndCheck, dndReset, selectBg, curtain, applause, toggleFullscreen }
 */
(function () {
    'use strict';

    // ───────────── 故事題庫（10 個情境，對話版） ─────────────
    const SCENARIOS = [
        { id: 1, title: '三隻小豬', emoji: '🐷🐺', character: '小豬', context: '大野狼在門外大吼大叫，用力撞著磚頭屋的門。屋裡的小豬看著搖晃的門…', question: '小豬現在的心情是什麼？他會有什麼動作？他會對大野狼說什麼？', hint: '提示：害怕、發抖、勇敢反抗', question2: '大野狼聽了小豬的話，會露出什麼表情？他用力撞門一邊大喊什麼？', hint2: '提示：生氣、露出尖牙、威脅' },
        { id: 2, title: '金銀斧頭', emoji: '🪓🧚', character: '誠實的樵夫', context: '誠實的樵夫不小心把唯一的鐵斧頭掉進深深的河裡，這時河神拿著一把閃亮亮的「金斧頭」浮出水面問是不是他的…', question: '樵夫的心情如何？他會有什麼表情和動作？他會怎麼回答河神？', hint: '提示：著急、搖頭、誠懇', question2: '河神聽到樵夫誠實的回答，滿意地點點頭，他帶著微笑對樵夫說了什麼？', hint2: '提示：慈祥、摸摸鬍子、稱讚' },
        { id: 3, title: '漁夫和金魚', emoji: '🐟👑', character: '漁夫', context: '貪心的妻子生氣地要求漁夫再去向金魚要一座大宮殿。漁夫走到海邊，看著波濤洶湧的大海…', question: '漁夫現在的心情是怎樣的？他呼喚金魚時會有什麼動作和語氣？', hint: '提示：無奈、嘆氣、害怕', question2: '金魚浮出水面，看到愁眉苦臉的漁夫，嘆了一口氣對他說什麼？', hint2: '提示：無奈、擺動尾巴、答應要求' },
        { id: 4, title: '巨人的花園', emoji: '🧌👦', character: '巨人', context: '自私的巨人旅行回來，發現居然有一群小孩在他的花園裡快樂地玩耍。他生氣地衝出來…', question: '巨人的表情是什麼？他做了什麼動作？他對孩子們大吼了什麼？', hint: '提示：憤怒、瞪大眼睛、揮舞手臂', question2: '孩子們嚇了一跳，其中一個最小的孩子發抖著往後退，用哭腔對巨人說了什麼？', hint2: '提示：驚嚇、眼淚打轉、道歉' },
        { id: 5, title: '七隻小羊', emoji: '🐐🚪', character: '小羊', context: '大野狼把爪子塗白，在門外捏著嗓子說：「我是媽媽，快開門。」小羊們從門縫看出去…', question: '小羊們發現不對勁時的心情和動作？他們會對門外的「假媽媽」說什麼？', hint: '提示：懷疑、湊近看、機警', question2: '大野狼被拆穿後，氣得咬牙切齒，在門外惡狠狠地留下了什麼話？', hint2: '提示：憤怒、握緊拳頭、放話威脅' },
        { id: 6, title: '西遊記', emoji: '🐒👺', character: '孫悟空', context: '白骨精變成了一個可憐的老婆婆，唐僧正要上前攙扶。孫悟空用火眼金睛看穿了妖怪的偽裝，拔出金箍棒…', question: '孫悟空的表情和動作是怎樣的？他會如何大聲警告唐僧和妖怪？', hint: '提示：威風、怒視、指著妖怪', question2: '妖怪（白骨精）假裝委屈，掉下眼淚對唐僧哭訴了什麼？', hint2: '提示：假裝可憐、擦眼淚、顛倒是非' },
        { id: 7, title: '小紅帽', emoji: '🧒🐺', character: '小紅帽', context: '小紅帽走到床邊，看著戴著睡帽的「奶奶」，發現她的耳朵和牙齒都大得嚇人…', question: '小紅帽的心情有什麼變化？她會有什麼動作？她會怎麼問奶奶？', hint: '提示：疑惑、歪著頭、後退', question2: '大野狼迫不及待地撲上前，張開血盆大口笑著回答什麼？', hint2: '提示：貪婪、流口水、露出真面目' },
        { id: 8, title: '灰姑娘', emoji: '👗🧹', character: '灰姑娘', context: '壞繼母把灰姑娘鎖在房間裡，不讓她去參加王子的舞會。聽著外面馬車離開的聲音，灰姑娘…', question: '灰姑娘現在有多難過？她有什麼動作？她會自言自語說些什麼？', hint: '提示：傷心、流淚、趴在窗邊', question2: '這時仙女教母突然出現，揮舞著魔杖，溫柔地對灰姑娘說了什麼？', hint2: '提示：溫柔、微笑、給予希望' },
        { id: 9, title: '龜兔賽跑', emoji: '🐰🐢', character: '兔子', context: '兔子一開始跑得飛快，回頭一看，連烏龜的影子都沒看到。他走到一棵大樹下…', question: '兔子的表情有多驕傲？他睡覺前做了什麼動作？說了什麼大話？', hint: '提示：驕傲、伸懶腰、打哈欠', question2: '烏龜這時滿頭大汗地慢慢爬過來，看著睡著的兔子，在心裡對自己堅定地說了什麼？', hint2: '提示：堅定、擦汗、不放棄' },
        { id: 10, title: '放羊的孩子', emoji: '👦🐑', character: '牧童', context: '牧童覺得每天放羊太無聊了，他看著山下的村莊，心裡冒出一個壞點子。他跑向村莊…', question: '牧童想騙人時的表情和動作？他會用什麼語氣對村民大喊？', hint: '提示：調皮、假裝驚慌、揮手', question2: '村民們氣喘吁吁地跑上山，發現沒有狼，生氣地指著牧童罵了什麼？', hint2: '提示：生氣、雙手叉腰、責備' }
    ];

    // ───────────── 劇場背景（12 種） ─────────────
    const THEATER_BACKGROUNDS = [
        { id: 'sky', name: '藍天空', bgClass: 'bg-gradient-to-b from-sky-300 to-blue-400', icon: '☁️', decorations: [{ icon: '☀️', className: 'absolute top-8 right-16 text-[120px] animate-spin-slow drop-shadow-xl' }, { icon: '☁️', className: 'absolute top-16 left-8 text-[140px] animate-drift opacity-90' }, { icon: '☁️', className: 'absolute top-32 right-1/4 text-[100px] animate-drift-slow opacity-80' }, { icon: '🕊️', className: 'absolute top-40 left-1/4 text-[60px] animate-float drop-shadow-md' }, { icon: '🦅', className: 'absolute top-20 right-1/3 text-[70px] animate-float-slow drop-shadow-md z-10' }] },
        { id: 'river', name: '小河畔', bgClass: 'bg-gradient-to-b from-blue-100 to-cyan-500', icon: '🌊', decorations: [{ icon: '☀️', className: 'absolute top-12 left-12 text-[90px] animate-pulse drop-shadow-lg opacity-80' }, { icon: '🦆', className: 'absolute bottom-24 left-1/4 text-[80px] animate-float z-10' }, { icon: '🐟', className: 'absolute bottom-16 right-1/3 text-[60px] animate-bounce z-10' }, { icon: '🌾', className: 'absolute -bottom-5 right-10 text-[120px] animate-drift origin-bottom' }, { icon: '🌾', className: 'absolute -bottom-5 left-10 text-[130px] animate-drift-slow origin-bottom z-20' }] },
        { id: 'mountain', name: '深山林', bgClass: 'bg-gradient-to-b from-sky-200 to-green-600', icon: '⛰️', decorations: [{ icon: '☁️', className: 'absolute top-10 left-1/4 text-[90px] animate-drift opacity-80' }, { icon: '⛰️', className: 'absolute bottom-10 left-1/2 -translate-x-1/2 text-[250px] opacity-90 drop-shadow-2xl' }, { icon: '🌲', className: 'absolute -bottom-10 left-16 text-[150px] animate-float-slow' }, { icon: '🌲', className: 'absolute -bottom-10 right-16 text-[140px] animate-float' }, { icon: '🍃', className: 'absolute top-1/3 left-1/3 text-[40px] animate-fall drop-shadow-sm' }] },
        { id: 'cabin', name: '森林小屋', bgClass: 'bg-gradient-to-b from-blue-200 to-green-500', icon: '🏡', decorations: [{ icon: '☀️', className: 'absolute top-6 left-1/4 text-[100px] animate-pulse drop-shadow-lg' }, { icon: '🏡', className: 'absolute bottom-20 left-1/2 -translate-x-1/2 text-[200px] drop-shadow-2xl' }, { icon: '🌳', className: 'absolute bottom-10 left-10 text-[160px] drop-shadow-lg' }, { icon: '🌳', className: 'absolute bottom-12 right-10 text-[150px] drop-shadow-lg' }, { icon: '🦋', className: 'absolute top-1/3 right-1/3 text-[50px] animate-float' }] },
        { id: 'lake', name: '寧靜湖', bgClass: 'bg-gradient-to-b from-teal-100 to-teal-500', icon: '🏞️', decorations: [{ icon: '🏞️', className: 'absolute bottom-20 left-1/2 -translate-x-1/2 text-[250px] opacity-80 drop-shadow-xl' }, { icon: '🦢', className: 'absolute bottom-16 left-1/3 text-[90px] animate-drift-slow z-10' }, { icon: '🦆', className: 'absolute bottom-10 right-1/4 text-[80px] animate-float z-10' }, { icon: '✨', className: 'absolute top-1/3 left-1/2 text-[50px] animate-blink opacity-50' }] },
        { id: 'castle', name: '大城堡', bgClass: 'bg-gradient-to-b from-indigo-200 to-purple-600', icon: '🏰', decorations: [{ icon: '🌙', className: 'absolute top-10 right-20 text-[100px] animate-pulse drop-shadow-lg' }, { icon: '🏰', className: 'absolute bottom-10 left-1/2 -translate-x-1/2 text-[250px] drop-shadow-2xl' }, { icon: '✨', className: 'absolute top-1/4 left-1/4 text-[40px] animate-blink' }, { icon: '✨', className: 'absolute top-1/3 right-1/3 text-[50px] animate-blink' }, { icon: '🚩', className: 'absolute top-24 left-1/2 translate-x-[40px] text-[60px] animate-drift' }] },
        { id: 'underwater', name: '海底世界', bgClass: 'bg-gradient-to-b from-cyan-400 to-blue-900', icon: '🐠', decorations: [{ icon: '🐟', className: 'absolute bottom-24 left-1/4 text-[70px] animate-float z-10' }, { icon: '🐠', className: 'absolute top-1/4 left-1/4 text-[80px] animate-drift drop-shadow-md z-10' }, { icon: '🐢', className: 'absolute top-1/4 right-1/4 text-[80px] animate-drift-slow drop-shadow-md z-10' }, { icon: '🐙', className: 'absolute bottom-10 right-16 text-[110px] animate-float-slow drop-shadow-xl' }, { icon: '🐚', className: 'absolute bottom-5 left-16 text-[100px] drop-shadow-lg animate-drift-slow origin-bottom' }] },
        { id: 'desert', name: '熱沙漠', bgClass: 'bg-gradient-to-b from-yellow-200 to-orange-500', icon: '🐫', decorations: [{ icon: '☀️', className: 'absolute top-10 left-16 text-[120px] animate-pulse drop-shadow-[0_0_30px_rgba(253,224,71,0.8)]' }, { icon: '🏜️', className: 'absolute bottom-10 left-1/2 -translate-x-1/2 text-[250px] opacity-70 drop-shadow-xl' }, { icon: '🐫', className: 'absolute bottom-12 right-20 text-[120px] animate-drift-slow z-10' }, { icon: '🌵', className: 'absolute bottom-8 left-20 text-[100px] drop-shadow-md' }, { icon: '🦅', className: 'absolute top-16 right-1/4 text-[60px] animate-float' }] },
        { id: 'snow', name: '白雪地', bgClass: 'bg-gradient-to-b from-slate-200 to-blue-200', icon: '⛄', decorations: [{ icon: '🏔️', className: 'absolute bottom-16 left-1/2 -translate-x-1/2 text-[280px] drop-shadow-xl opacity-90' }, { icon: '⛄', className: 'absolute bottom-12 right-20 text-[130px] animate-float-slow drop-shadow-lg z-10' }, { icon: '🌲', className: 'absolute bottom-10 left-16 text-[140px] drop-shadow-lg' }, { icon: '❄️', className: 'absolute top-10 left-1/4 text-[40px] animate-fall opacity-80' }, { icon: '❄️', className: 'absolute top-20 right-1/3 text-[50px] animate-fall opacity-70' }] },
        { id: 'space', name: '外太空', bgClass: 'bg-gradient-to-b from-gray-900 to-black', icon: '🚀', decorations: [{ icon: '⭐', className: 'absolute top-10 left-20 text-[40px] animate-blink' }, { icon: '⭐', className: 'absolute bottom-1/3 left-1/3 text-[50px] animate-blink' }, { icon: '🪐', className: 'absolute top-16 right-16 text-[150px] animate-float-slow drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]' }, { icon: '🚀', className: 'absolute bottom-20 left-1/4 text-[100px] animate-drift drop-shadow-lg rotate-45' }, { icon: '👽', className: 'absolute bottom-10 right-1/3 text-[60px] animate-float opacity-80' }] },
        { id: 'grassland', name: '大草原', bgClass: 'bg-gradient-to-b from-lime-200 to-green-500', icon: '🏕️', decorations: [{ icon: '☀️', className: 'absolute top-10 right-20 text-[110px] animate-spin-slow drop-shadow-lg' }, { icon: '🏕️', className: 'absolute bottom-16 left-1/2 -translate-x-1/2 text-[180px] drop-shadow-2xl' }, { icon: '🐑', className: 'absolute bottom-12 left-1/4 text-[90px] animate-float-slow z-10' }, { icon: '🐑', className: 'absolute bottom-8 right-1/4 text-[80px] animate-float z-10' }, { icon: '🦋', className: 'absolute top-1/3 right-1/3 text-[50px] animate-float' }] },
        { id: 'classroom', name: '教室', bgClass: 'bg-gradient-to-b from-amber-100 to-orange-200', icon: '🏫', decorations: [{ icon: '🏫', className: 'absolute bottom-10 left-1/2 -translate-x-1/2 text-[230px] opacity-80 drop-shadow-2xl' }, { icon: '📚', className: 'absolute bottom-12 left-16 text-[90px] drop-shadow-lg' }, { icon: '✏️', className: 'absolute bottom-10 right-16 text-[80px] animate-float-slow drop-shadow-lg' }, { icon: '🍎', className: 'absolute top-16 right-1/4 text-[60px] animate-float' }, { icon: '⭐', className: 'absolute top-1/4 left-1/4 text-[50px] animate-blink' }] }
    ];

    const INITIAL_DRAG = [
        { id: 'm1', text: '十分絕望', type: 'mood', isCorrect: true },
        { id: 'm2', text: '沾沾自喜', type: 'mood', isCorrect: false },
        { id: 'e1', text: '眉頭緊鎖', type: 'expression', isCorrect: true },
        { id: 'e2', text: '眉開眼笑', type: 'expression', isCorrect: false },
        { id: 'a1', text: '坐在地上搥胸頓足', type: 'action', isCorrect: true },
        { id: 'a2', text: '興奮地手舞足蹈', type: 'action', isCorrect: false }
    ];

    // ───────────── 狀態 ─────────────
    let activeTab = 'teach';
    let currentScenario = SCENARIOS[0];
    let dragItems = INITIAL_DRAG.slice();
    let droppedSlots = { mood: null, expression: null, action: null };
    let transcripts = { q1: '', q2: '' };
    let recordingTarget = null;
    let recognition = null;
    let currentBg = THEATER_BACKGROUNDS[0];
    let isCurtainOpen = false;
    let isFullscreen = false;
    let built = false;

    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const TABS = [
        { key: 'teach', no: '關卡一', icon: '📖', label: '學習祕笈', color: 'blue' },
        { key: 'dragPractice', no: '關卡二', icon: '🖱️', label: '牛刀小試', color: 'green' },
        { key: 'practice', no: '關卡三', icon: '✏️', label: '寫作挑戰', color: 'orange' },
        { key: 'theater', no: '關卡四', icon: '🎬', label: '小劇場', color: 'red' }
    ];

    // ───────────── 音效 / 朗讀 ─────────────
    function getCtx() {
        if (window.audioContext) return window.audioContext;
        try { window.audioContext = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
        return window.audioContext;
    }
    function pickZhVoice() {
        try {
            const vs = window.speechSynthesis.getVoices() || [];
            return vs.find(v => /zh[-_]?(TW|HK|Hant)/i.test(v.lang)) || vs.find(v => /^zh/i.test(v.lang)) || null;
        } catch (e) { return null; }
    }
    function speak(text, emotion) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-TW';
        const v = pickZhVoice(); if (v) u.voice = v;
        if (emotion === 'scared') { u.pitch = 1.6; u.rate = 1.2; }
        else if (emotion === 'angry') { u.pitch = 0.8; u.rate = 1.3; }
        else if (emotion === 'sad') { u.pitch = 0.8; u.rate = 0.85; }
        window.speechSynthesis.speak(u);
    }
    // Web Audio 合成掌聲（離線可用，取代外部音檔）
    function applauseSound() {
        const ctx = getCtx(); if (!ctx) return;
        const dur = 2.0;
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            const t = i / data.length;
            const env = Math.pow(1 - t, 1.2);
            data[i] = (Math.random() * 2 - 1) * env * 0.5 * (0.5 + 0.5 * Math.abs(Math.sin(i * 0.04)));
        }
        const src = ctx.createBufferSource(); src.buffer = buf;
        const filt = ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 1800; filt.Q.value = 0.6;
        const gain = ctx.createGain(); gain.gain.value = 0.45;
        src.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
        src.start();
    }

    // ───────────── CSS（自訂動畫 + 小劇場樣式） ─────────────
    function injectCSS() {
        if (document.getElementById('dialogue-school-style')) return;
        const css = `
        #dialogue-section .ds-fade{animation:dsFade .45s ease both}
        @keyframes dsFade{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        #dialogue-section .ds-tab{transition:all .15s}
        @keyframes bounce-slow{0%,100%{transform:translateY(-5%)}50%{transform:translateY(5%)}}
        .animate-bounce-slow{animation:bounce-slow 3s ease-in-out infinite}
        @keyframes ds-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-15px)}}
        .animate-float{animation:ds-float 4s ease-in-out infinite}
        @keyframes ds-float-slow{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        .animate-float-slow{animation:ds-float-slow 6s ease-in-out infinite}
        @keyframes ds-drift{0%,100%{transform:translateX(0)}50%{transform:translateX(25px)}}
        .animate-drift{animation:ds-drift 8s ease-in-out infinite}
        @keyframes ds-drift-slow{0%,100%{transform:translateX(0)}50%{transform:translateX(-20px)}}
        .animate-drift-slow{animation:ds-drift-slow 12s ease-in-out infinite}
        @keyframes ds-spin-slow{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        .animate-spin-slow{animation:ds-spin-slow 20s linear infinite}
        @keyframes ds-blink{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.8)}}
        .animate-blink{animation:ds-blink 2.5s ease-in-out infinite}
        @keyframes ds-applause{0%{transform:translateY(50px) scale(.5) rotate(0);opacity:0}20%{opacity:1;transform:translateY(0) scale(1) rotate(-15deg)}50%{transform:translateY(-100px) scale(1.2) rotate(15deg)}100%{transform:translateY(-200px) scale(1.5) rotate(-15deg);opacity:0}}
        .animate-applause{animation:ds-applause 3s ease-out forwards}
        @keyframes ds-fall{0%{transform:translate(0,-20px) rotate(0);opacity:0}20%{opacity:1}80%{opacity:1}100%{transform:translate(20px,80px) rotate(45deg);opacity:0}}
        .animate-fall{animation:ds-fall 5s linear infinite}
        #dialogue-section .ds-scroll::-webkit-scrollbar{height:10px}
        #dialogue-section .ds-scroll::-webkit-scrollbar-track{background:rgba(0,0,0,.06);border-radius:10px}
        #dialogue-section .ds-scroll::-webkit-scrollbar-thumb{background:#fcd34d;border-radius:10px}
        .ds-stage.ds-fs{position:fixed;inset:0;z-index:100;background:#0f172a;display:flex;flex-direction:column}
        .ds-curtain-tex{background-image:repeating-linear-gradient(90deg,rgba(0,0,0,.12) 0 10px,rgba(255,255,255,.06) 10px 22px)}
        `;
        const st = document.createElement('style');
        st.id = 'dialogue-school-style';
        st.textContent = css;
        (document.head || document.documentElement).appendChild(st);
    }

    // ───────────── 語音辨識初始化 ─────────────
    function setupRecognition() {
        if (recognition) return;
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) return;
        const r = new SR();
        r.continuous = true; r.interimResults = true; r.lang = 'zh-TW';
        r.onresult = (ev) => {
            let txt = '';
            for (let i = 0; i < ev.results.length; i++) txt += ev.results[i][0].transcript;
            if (recordingTarget) {
                transcripts[recordingTarget] = txt;
                const ta = document.getElementById('ds-ta-' + recordingTarget);
                if (ta) ta.value = txt;
                updateCompleteBtn();
            }
        };
        r.onerror = () => { setRecState(null); showRecError('麥克風錯誤，請確認已允許麥克風權限（建議用 Chrome）。'); };
        r.onend = () => { setRecState(null); };
        recognition = r;
    }
    function showRecError(msg) {
        const el = document.getElementById('ds-rec-error');
        if (el) { el.textContent = '⚠️ ' + msg; el.classList.remove('hidden'); }
    }
    function setRecState(target) {
        recordingTarget = target;
        ['q1', 'q2'].forEach(q => {
            const btn = document.getElementById('ds-mic-' + q);
            const tip = document.getElementById('ds-listen-' + q);
            if (btn) {
                const on = target === q;
                btn.textContent = on ? '⏹️' : '🎤';
                btn.className = 'absolute bottom-4 right-4 w-12 h-12 rounded-full text-white text-xl shadow-lg transition-transform hover:scale-105 ' + (on ? 'bg-red-500 animate-pulse' : (q === 'q1' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-green-500 hover:bg-green-600'));
            }
            if (tip) tip.classList.toggle('hidden', target !== q);
        });
    }

    // ───────────── 對外 API ─────────────
    const api = {
        init() {
            injectCSS();
            const host = document.getElementById('dialogue-section');
            if (!host) return;
            if (!built) {
                host.innerHTML = shellHTML();
                host.addEventListener('click', (e) => {
                    const sp = e.target.closest('[data-speak]');
                    if (sp) speak(sp.getAttribute('data-speak'), sp.getAttribute('data-emotion') || 'normal');
                });
                setupRecognition();
                built = true;
            }
            this.tab(activeTab);
        },
        speak,
        tab(name) {
            activeTab = name;
            TABS.forEach(t => {
                const panel = document.getElementById('ds-panel-' + t.key);
                if (panel) panel.classList.toggle('hidden', t.key !== name);
                const btn = document.getElementById('ds-tab-' + t.key);
                if (btn) btn.setAttribute('data-on', t.key === name ? '1' : '0');
            });
            if (name === 'dragPractice') renderDrag();
            if (name === 'practice') renderPractice();
            if (name === 'theater') renderTheater();
            const panel = document.getElementById('ds-panel-' + name);
            if (panel) { panel.classList.remove('ds-fade'); void panel.offsetWidth; panel.classList.add('ds-fade'); }
        },
        // 拖曳練習
        dndCheck() {
            if (!droppedSlots.mood || !droppedSlots.expression || !droppedSlots.action) { setDndFeedback('error', '請把三個空格都填滿喔！'); return; }
            if (droppedSlots.mood.isCorrect && droppedSlots.expression.isCorrect && droppedSlots.action.isCorrect) {
                setDndFeedback('success', '🎉 答對了！你完美地寫出了老爺爺生動的反應！');
                speak('老爺爺跌倒後，覺得十分絕望，他眉頭緊鎖，坐在地上搥胸頓足的說：「哎呀！我只剩三年可以活了，該怎麼辦才好啊！」', 'sad');
            } else {
                setDndFeedback('error', '好像有點不太對喔，再想想老爺爺跌倒時應該是什麼反應？');
            }
        },
        dndReset() { dragItems = INITIAL_DRAG.slice(); droppedSlots = { mood: null, expression: null, action: null }; renderDrag(); },
        // 寫作挑戰
        selectScenario(id) { const s = SCENARIOS.find(x => x.id === id); if (s) { currentScenario = s; transcripts = { q1: '', q2: '' }; renderPractice(); } },
        drawCard() {
            let i; do { i = Math.floor(Math.random() * SCENARIOS.length); } while (SCENARIOS[i].id === currentScenario.id);
            currentScenario = SCENARIOS[i]; transcripts = { q1: '', q2: '' }; renderPractice();
        },
        onType(q, val) { transcripts[q] = val; updateCompleteBtn(); },
        toggleRec(target) {
            if (!recognition) { showRecError('您的瀏覽器不支援語音辨識，請直接用鍵盤輸入（建議 Chrome）。'); return; }
            const errEl = document.getElementById('ds-rec-error'); if (errEl) errEl.classList.add('hidden');
            if (recordingTarget === target) { recognition.stop(); setRecState(null); }
            else {
                if (recordingTarget) recognition.stop();
                setTimeout(() => { try { recognition.start(); setRecState(target); } catch (e) { /* ignore double start */ } }, 120);
            }
        },
        // 小劇場
        selectBg(id) { const b = THEATER_BACKGROUNDS.find(x => x.id === id); if (b) { currentBg = b; renderTheater(); } },
        curtain(open) { isCurtainOpen = open; applyCurtain(); },
        applause() {
            applauseSound();
            const layer = document.getElementById('ds-applause-layer');
            if (!layer) return;
            layer.innerHTML = '';
            for (let i = 0; i < 18; i++) {
                const s = document.createElement('div');
                s.className = 'absolute text-[50px] animate-applause';
                s.textContent = Math.random() > 0.5 ? '👏' : '🎉';
                s.style.left = (Math.random() * 90) + '%';
                s.style.animationDelay = (Math.random() * 0.3) + 's';
                s.style.animationDuration = (1.5 + Math.random()) + 's';
                layer.appendChild(s);
            }
            setTimeout(() => { if (layer) layer.innerHTML = ''; }, 3200);
        },
        toggleFullscreen() {
            isFullscreen = !isFullscreen;
            const stage = document.getElementById('ds-stage');
            if (!stage) return;
            stage.classList.toggle('ds-fs', isFullscreen);
            const fsBtn = document.getElementById('ds-fs-btn');
            if (fsBtn) fsBtn.innerHTML = isFullscreen ? '🗗 縮小' : '⛶ 全螢幕';
            try {
                if (isFullscreen && stage.requestFullscreen) { const p = stage.requestFullscreen(); if (p && p.catch) p.catch(() => { }); }
                else if (!isFullscreen && document.fullscreenElement && document.exitFullscreen) { const p = document.exitFullscreen(); if (p && p.catch) p.catch(() => { }); }
            } catch (e) { /* 全螢幕被拒不影響 overlay */ }
        }
    };
    window.DialogueSchool = api;

    function setDndFeedback(type, msg) {
        const el = document.getElementById('ds-dnd-feedback');
        if (!el) return;
        el.className = 'px-6 py-3 rounded-xl font-bold ' + (type === 'success' ? 'bg-green-100 text-green-800 border-2 border-green-300' : 'bg-red-100 text-red-700 border-2 border-red-300');
        el.textContent = msg; el.classList.remove('hidden');
    }
    function updateCompleteBtn() {
        const b = document.getElementById('ds-complete');
        if (b) b.classList.toggle('hidden', !(transcripts.q1.trim().length > 5 && transcripts.q2.trim().length > 5));
    }

    // ───────────── 各面板 HTML ─────────────
    function shellHTML() {
        const tabBtns = TABS.map((t, i) => `
            ${i > 0 ? '<span class="hidden sm:flex items-center text-slate-300 text-xl">›</span>' : ''}
            <button id="ds-tab-${t.key}" data-on="0" onclick="DialogueSchool.tab('${t.key}')"
                class="ds-tab flex-shrink-0 flex flex-col items-center px-3 py-2 sm:px-4 rounded-xl border-2 data-[on=0]:bg-slate-50 data-[on=0]:border-transparent data-[on=0]:text-slate-500 data-[on=1]:scale-105 data-[on=1]:shadow-sm data-[on=1]:bg-${t.color}-100 data-[on=1]:border-${t.color}-400 data-[on=1]:text-${t.color}-700">
                <span class="text-[10px] sm:text-xs font-bold opacity-70">${t.no}</span>
                <span class="font-bold text-sm sm:text-base">${t.icon} ${t.label}</span>
            </button>`).join('');
        return `
        <div class="bg-white rounded-2xl shadow-md border-b-4 border-blue-400 px-3 py-3 mb-6 flex flex-col lg:flex-row justify-between items-center gap-3">
            <div class="flex items-center gap-2 text-blue-600 flex-shrink-0"><span class="text-2xl">✨</span><h2 class="text-xl sm:text-2xl font-black tracking-wide">生動對話小學堂</h2></div>
            <div class="flex gap-1 sm:gap-2 flex-wrap justify-center items-center">${tabBtns}</div>
        </div>
        <div id="ds-panel-teach" class="hidden">${teachHTML()}</div>
        <div id="ds-panel-dragPractice" class="hidden"></div>
        <div id="ds-panel-practice" class="hidden"></div>
        <div id="ds-panel-theater" class="hidden"></div>`;
    }

    function teachHTML() {
        return `
        <div class="space-y-8">
          <section class="bg-white rounded-3xl p-6 md:p-10 shadow-lg border-t-8 border-blue-400">
            <h3 class="text-2xl sm:text-3xl font-bold text-center text-slate-800 mb-6">寫作大祕笈：讓角色「活」起來！</h3>
            <div class="bg-yellow-50 rounded-2xl p-6 border-2 border-yellow-200 mb-8 flex flex-col md:flex-row gap-6 items-center">
              <div class="flex-1">
                <p class="text-lg mb-4">寫對話時，如果只寫「他說了什麼」，角色會像木頭人一樣呆板。試著在對話前加入角色的 <span class="text-pink-500 font-bold bg-pink-100 px-2 py-1 rounded">心情/表情</span> 和 <span class="text-green-600 font-bold bg-green-100 px-2 py-1 rounded">動作</span>，句子就會變得很生動喔！</p>
                <div class="text-xl sm:text-2xl font-black text-center text-blue-600 bg-white p-4 rounded-xl shadow-sm border border-blue-100">魔法公式：心情/表情 ＋ 動作 ＋「說的話」</div>
              </div>
              <div class="flex-shrink-0 text-7xl animate-pulse">✨</div>
            </div>
            <h4 class="text-xl font-bold mb-4 flex items-center gap-2">✅ 課本範例比一比：鼠鹿遇到老虎</h4>
            <div class="grid md:grid-cols-2 gap-6">
              <div class="bg-slate-50 rounded-2xl p-6 border border-slate-200">
                <div class="text-slate-500 font-bold mb-2">❌ 普通寫法（只有對話）</div>
                <p class="text-lg mb-4">老虎：「我好餓，我要吃了你！」<br><br>鼠鹿：「我…我的身體太小了，根本不夠您吃。」</p>
                <button data-speak="老虎說，我好餓我要吃了你。鼠鹿說，我的身體太小了根本不夠您吃。" class="w-full flex items-center justify-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 py-2 rounded-xl transition">🔊 聽聽看（平淡）</button>
              </div>
              <div class="bg-blue-50 rounded-2xl p-6 border-2 border-blue-200 relative overflow-hidden">
                <div class="absolute top-0 right-0 bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">✨ 生動升級版</div>
                <div class="text-blue-700 font-bold mb-2">✅ 加入心情與動作</div>
                <p class="text-lg mb-4 leading-relaxed">看著迎面而來的老虎，鼠鹿覺得<span class="text-pink-500 font-bold">十分害怕</span>。老虎<span class="text-green-600 font-bold">張開大嘴</span>說：「我好餓，我要吃了你！」<br><br>鼠鹿<span class="text-green-600 font-bold">嚇得全身發抖，只能一臉驚恐</span>說：「我…我的身體太小了，根本不夠您吃。」</p>
                <div class="flex gap-2">
                  <button data-speak="看著迎面而來的老虎，鼠鹿覺得十分害怕。老虎張開大嘴說：「我好餓，我要吃了你！」" data-emotion="angry" class="flex-1 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-xl transition">▶️ 聽老虎語氣</button>
                  <button data-speak="鼠鹿嚇得全身發抖，只能一臉驚恐說：「我的身體太小了，根本不夠您吃。」" data-emotion="scared" class="flex-1 flex items-center justify-center gap-2 bg-pink-500 hover:bg-pink-600 text-white py-2 rounded-xl transition">▶️ 聽鼠鹿語氣</button>
                </div>
              </div>
            </div>
          </section>
          <div class="text-center"><button onclick="DialogueSchool.tab('dragPractice')" class="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-lg sm:text-xl font-bold py-4 px-8 rounded-full shadow-lg hover:-translate-y-1 transition-all">✨ 我學會了，去小試身手！</button></div>
        </div>`;
    }

    // ── 牛刀小試（拖曳） ──
    function slotSpan(key, label, colorEmpty, colorFull) {
        const it = droppedSlots[key];
        const minw = key === 'action' ? '160px' : '120px';
        const cls = it ? colorFull : (colorEmpty + ' text-slate-300 border-dashed hover:bg-slate-50');
        return `<span data-slot="${key}" style="min-width:${minw}" class="ds-slot inline-block mx-2 text-center border-b-4 pb-1 cursor-pointer transition-all ${cls}">${it ? esc(it.text) : '[' + label + ']'}</span>`;
    }
    function renderDrag() {
        const host = document.getElementById('ds-panel-dragPractice');
        if (!host) return;
        const words = dragItems.map(it => {
            const c = it.type === 'mood' ? 'bg-pink-100 text-pink-700 border-pink-200 hover:bg-pink-200' : it.type === 'expression' ? 'bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-200' : 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200';
            return `<div data-word="${it.id}" draggable="true" class="ds-word px-4 py-2 rounded-lg cursor-grab hover:scale-105 active:scale-95 transition-transform shadow-sm font-bold border-2 select-none ${c}">${esc(it.text)}</div>`;
        }).join('') || '<span class="text-slate-400 italic">詞語都用光囉！試著檢查答案吧。</span>';
        host.innerHTML = `
        <div class="space-y-6">
          <section class="bg-white rounded-3xl p-6 md:p-10 shadow-lg border-t-8 border-green-400">
            <div class="flex justify-between items-center mb-6">
              <h3 class="text-2xl sm:text-3xl font-bold text-slate-800">牛刀小試：三年坡的故事</h3>
              <button onclick="DialogueSchool.dndReset()" class="text-slate-500 hover:text-slate-700 flex items-center gap-1 px-3 py-1 rounded-lg hover:bg-slate-100 transition">🔄 重新開始</button>
            </div>
            <div class="bg-green-50 p-6 rounded-2xl mb-6 border border-green-200">
              <p class="text-lg text-slate-700 mb-4 leading-relaxed"><strong>情境：</strong>在「三年坡」這個地方，傳說只要在那裡摔一跤，就只能再活三年。有一天，一位老爺爺不小心在三年坡跌倒了…</p>
              <p class="text-slate-600 font-bold mb-2">🖱️ 請把下方詞語拖曳（或點擊）放入正確的空格：</p>
              <div class="bg-white p-6 rounded-xl text-lg sm:text-xl leading-loose shadow-sm border border-slate-100 mt-4 font-medium">
                老爺爺跌倒後，覺得 ${slotSpan('mood', '心情', 'border-pink-400', 'text-pink-600 font-bold bg-pink-50 rounded-t-lg px-2 border-pink-500 shadow-sm')} ，他 ${slotSpan('expression', '表情', 'border-yellow-400', 'text-yellow-700 font-bold bg-yellow-50 rounded-t-lg px-2 border-yellow-500 shadow-sm')} ，${slotSpan('action', '動作', 'border-green-500', 'text-green-700 font-bold bg-green-50 rounded-t-lg px-2 border-green-600 shadow-sm')} 的說：「哎呀！我只剩三年可以活了，該怎麼辦才好啊！」
              </div>
            </div>
            <div class="bg-slate-50 p-6 rounded-2xl border border-slate-200">
              <p class="text-slate-500 font-bold mb-4">詞語庫（點擊或拖曳）：</p>
              <div id="ds-wordbank" class="flex flex-wrap gap-4 min-h-[50px] items-center">${words}</div>
            </div>
            <div class="mt-8 text-center flex flex-col items-center gap-4">
              <button onclick="DialogueSchool.dndCheck()" class="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-10 rounded-full shadow-lg hover:-translate-y-1 transition-transform text-lg">✅ 檢查答案</button>
              <div id="ds-dnd-feedback" class="hidden"></div>
            </div>
          </section>
          <div class="text-center pb-4"><button onclick="DialogueSchool.tab('practice')" class="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-lg sm:text-xl font-bold py-4 px-8 rounded-full shadow-lg hover:-translate-y-1 transition-all">✨ 準備好了，前往寫作挑戰！</button></div>
        </div>`;
        wireDrag();
    }
    function placeItem(item, targetSlot) {
        const existing = droppedSlots[targetSlot];
        const oldKey = Object.keys(droppedSlots).find(k => droppedSlots[k] && droppedSlots[k].id === item.id);
        if (oldKey) droppedSlots[oldKey] = null;
        dragItems = dragItems.filter(i => i.id !== item.id);
        if (existing && existing.id !== item.id) dragItems.push(existing);
        droppedSlots[targetSlot] = item;
        renderDrag();
    }
    function wireDrag() {
        const host = document.getElementById('ds-panel-dragPractice');
        if (!host) return;
        host.querySelectorAll('.ds-word').forEach(w => {
            const item = dragItems.find(i => i.id === w.getAttribute('data-word'));
            w.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', w.getAttribute('data-word')));
            w.addEventListener('click', () => {
                const empty = ['mood', 'expression', 'action'].find(k => !droppedSlots[k]);
                if (empty && item) placeItem(item, empty);
            });
        });
        host.querySelectorAll('.ds-slot').forEach(s => {
            const key = s.getAttribute('data-slot');
            s.addEventListener('dragover', e => e.preventDefault());
            s.addEventListener('drop', e => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain');
                const item = dragItems.find(i => i.id === id);
                if (item) placeItem(item, key);
            });
            s.addEventListener('click', () => {
                const it = droppedSlots[key];
                if (it) { droppedSlots[key] = null; dragItems.push(it); renderDrag(); }
            });
        });
    }

    // ── 寫作挑戰 ──
    function renderPractice() {
        const host = document.getElementById('ds-panel-practice');
        if (!host) return;
        const chips = SCENARIOS.map(s => `<button onclick="DialogueSchool.selectScenario(${s.id})" class="flex-shrink-0 px-4 py-2 rounded-xl font-bold border-2 transition-all ${currentScenario.id === s.id ? 'bg-orange-500 border-orange-600 text-white shadow-md scale-105' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-orange-300 hover:bg-orange-50'}">${s.emoji} ${esc(s.title)}</button>`).join('');
        const s = currentScenario;
        host.innerHTML = `
        <div class="max-w-3xl mx-auto">
          <h3 class="text-2xl sm:text-3xl font-bold text-slate-800 mb-4">情境對話寫作挑戰</h3>
          <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6">
            <div class="flex items-center gap-2 mb-3 text-slate-600 font-bold">📖 自由選故事，或點隨機抽籤：</div>
            <div class="flex gap-3 overflow-x-auto pb-2 ds-scroll items-center">
              <button onclick="DialogueSchool.drawCard()" class="flex-shrink-0 flex items-center gap-1 bg-orange-100 text-orange-700 border-2 border-orange-300 hover:bg-orange-200 font-bold py-2 px-4 rounded-xl shadow-sm">🔄 隨機抽籤</button>
              <div class="w-px h-8 bg-slate-300 mx-1"></div>${chips}
            </div>
          </div>
          <div class="bg-white rounded-3xl shadow-xl border-t-8 border-orange-400 overflow-hidden ds-fade">
            <div class="bg-gradient-to-b from-orange-50 to-white p-8 text-center border-b border-slate-100">
              <div class="text-7xl sm:text-8xl mb-4 animate-bounce-slow">${s.emoji}</div>
              <div class="inline-block bg-orange-100 text-orange-800 font-bold px-4 py-1 rounded-full text-sm mb-4">故事：${esc(s.title)}</div>
              <p class="text-lg sm:text-xl text-slate-700 leading-relaxed text-left">${esc(s.context)}</p>
            </div>
            <div class="p-6 sm:p-8 space-y-6">
              <div id="ds-rec-error" class="hidden text-red-500 text-sm flex items-center gap-1 bg-red-50 p-3 rounded-lg font-bold"></div>
              <div class="bg-blue-50/50 p-6 rounded-2xl border-2 border-blue-100 relative">
                <div class="absolute -top-4 left-6 bg-blue-500 text-white px-4 py-1 rounded-full font-bold text-sm shadow-sm">主角的反應</div>
                <div class="text-blue-900 mb-4 mt-2"><p class="font-bold text-lg mb-1">${esc(s.question)}</p><p class="text-sm text-blue-600">${esc(s.hint)}</p></div>
                <div class="relative">
                  <textarea id="ds-ta-q1" oninput="DialogueSchool.onType('q1',this.value)" class="w-full h-28 p-4 pr-16 border-2 border-slate-200 focus:border-blue-300 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all resize-none text-lg" placeholder="例如：${esc(s.character)} [心情]地[動作]，說：「…」">${esc(transcripts.q1)}</textarea>
                  <button id="ds-mic-q1" onclick="DialogueSchool.toggleRec('q1')" title="語音輸入" class="absolute bottom-4 right-4 w-12 h-12 rounded-full text-white text-xl shadow-lg transition-transform hover:scale-105 bg-blue-500 hover:bg-blue-600">🎤</button>
                </div>
                <p id="ds-listen-q1" class="hidden text-right text-sm text-red-500 font-bold mt-2 animate-pulse">🎙️ 聆聽中…</p>
              </div>
              <div class="flex justify-center -my-2 relative z-10"><div class="bg-orange-100 p-2 rounded-full border-4 border-white text-orange-500 shadow-sm text-xl">💬</div></div>
              <div class="bg-green-50/50 p-6 rounded-2xl border-2 border-green-100 relative">
                <div class="absolute -top-4 left-6 bg-green-500 text-white px-4 py-1 rounded-full font-bold text-sm shadow-sm">對手的回應</div>
                <div class="text-green-900 mb-4 mt-2"><p class="font-bold text-lg mb-1">${esc(s.question2)}</p><p class="text-sm text-green-600">${esc(s.hint2)}</p></div>
                <div class="relative">
                  <textarea id="ds-ta-q2" oninput="DialogueSchool.onType('q2',this.value)" class="w-full h-28 p-4 pr-16 border-2 border-slate-200 focus:border-green-300 rounded-2xl focus:ring-4 focus:ring-green-100 transition-all resize-none text-lg" placeholder="換寫寫看對方的反應和對話…">${esc(transcripts.q2)}</textarea>
                  <button id="ds-mic-q2" onclick="DialogueSchool.toggleRec('q2')" title="語音輸入" class="absolute bottom-4 right-4 w-12 h-12 rounded-full text-white text-xl shadow-lg transition-transform hover:scale-105 bg-green-500 hover:bg-green-600">🎤</button>
                </div>
                <p id="ds-listen-q2" class="hidden text-right text-sm text-red-500 font-bold mt-2 animate-pulse">🎙️ 聆聽中…</p>
              </div>
              <div id="ds-complete" class="hidden text-center pt-4">
                <button onclick="DialogueSchool.tab('theater')" class="bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-full inline-flex items-center justify-center gap-2 shadow-lg">✨ 對話寫得太精彩了！去小劇場開演 🎬</button>
              </div>
            </div>
          </div>
          <div class="text-center mt-10 pb-8"><button onclick="DialogueSchool.tab('theater')" class="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white text-lg sm:text-xl font-bold py-4 px-8 rounded-full shadow-lg hover:-translate-y-1 transition-all">🎬 劇本寫好了？前往小劇場開演！</button></div>
        </div>`;
        if (!recognition) showRecError('您的瀏覽器不支援語音辨識，可直接用鍵盤輸入（建議 Chrome）。');
        setRecState(recordingTarget);
        updateCompleteBtn();
    }

    // ── 小劇場 ──
    function renderTheater() {
        const host = document.getElementById('ds-panel-theater');
        if (!host) return;
        const decos = currentBg.decorations.map(d => `<div class="${d.className}">${d.icon}</div>`).join('');
        const bgPicker = THEATER_BACKGROUNDS.map(bg => `<button onclick="DialogueSchool.selectBg('${bg.id}')" class="flex-shrink-0 flex flex-col items-center p-2 rounded-xl border-2 transition-all min-w-[78px] ${currentBg.id === bg.id ? 'bg-amber-200 border-yellow-400 scale-110 shadow-md' : 'bg-amber-700 border-amber-600 text-amber-200 hover:bg-amber-600'}"><span class="text-2xl mb-1">${bg.icon}</span><span class="text-xs font-bold ${currentBg.id === bg.id ? 'text-amber-900' : ''}">${esc(bg.name)}</span></button>`).join('');
        const valance = Array.from({ length: 8 }).map(() => '<div class="flex-1 h-full bg-gradient-to-b from-red-800 to-red-600 rounded-b-full border-b-[6px] border-yellow-500 shadow-inner"></div>').join('');
        host.innerHTML = `
        <div class="max-w-5xl mx-auto space-y-6">
          <div class="text-center mb-4 ds-hide-onfs">
            <h3 class="text-3xl sm:text-4xl font-black text-slate-800 flex justify-center items-center gap-3">🎬 生動對話小劇場 🎬</h3>
            <p class="text-slate-600 mt-2 text-base sm:text-lg">選好背景，拉開布幕，配上生動的動作和語氣開始表演吧！</p>
          </div>
          <div id="ds-stage" class="ds-stage relative w-full flex flex-col shadow-2xl">
            <div class="ds-screen relative w-full bg-black overflow-hidden aspect-video rounded-t-3xl border-x-8 border-t-8 border-slate-900">
              <div class="absolute inset-0 z-0 ${currentBg.bgClass} flex items-center justify-center overflow-hidden">
                ${decos}
                <div class="absolute bottom-4 right-6 text-white/90 font-bold text-lg sm:text-xl tracking-widest drop-shadow-md z-30 bg-black/20 px-4 py-1.5 rounded-full backdrop-blur-sm border border-white/10">場景：${esc(currentBg.name)}</div>
              </div>
              <div class="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-3/4 bg-yellow-200/20 rounded-full blur-[100px] z-10 pointer-events-none"></div>
              <div id="ds-applause-layer" class="absolute inset-0 z-40 pointer-events-none flex justify-center items-end overflow-hidden"></div>
              <div class="absolute top-0 left-0 w-full h-[15%] z-30 flex drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)] pointer-events-none">${valance}</div>
              <div id="ds-curtain-l" class="ds-curtain-tex absolute top-0 left-0 w-1/2 h-[110%] bg-gradient-to-r from-red-900 via-red-600 to-red-700 z-20 transition-all duration-1000 ease-in-out border-r-[12px] border-yellow-500 shadow-2xl rounded-br-[100px]"></div>
              <div id="ds-curtain-r" class="ds-curtain-tex absolute top-0 right-0 w-1/2 h-[110%] bg-gradient-to-l from-red-900 via-red-600 to-red-700 z-20 transition-all duration-1000 ease-in-out border-l-[12px] border-yellow-500 shadow-2xl rounded-bl-[100px]"></div>
            </div>
            <div class="bg-amber-800 p-4 sm:p-6 relative overflow-hidden flex-shrink-0 rounded-b-3xl border-x-8 border-b-8 border-slate-900">
              <div class="relative z-10 flex flex-col lg:flex-row items-center gap-4 sm:gap-6 justify-between">
                <div class="flex-1 w-full overflow-hidden">
                  <h4 class="text-amber-100 font-bold mb-3 flex items-center gap-2">✨ 選擇演出場景：</h4>
                  <div class="flex gap-2 overflow-x-auto pb-3 pt-1 px-1 ds-scroll">${bgPicker}</div>
                </div>
                <div class="flex-shrink-0 flex gap-2 sm:gap-3 bg-amber-900/50 p-3 rounded-2xl border-2 border-amber-900 flex-wrap justify-center">
                  <button id="ds-open-btn" onclick="DialogueSchool.curtain(true)" class="text-base sm:text-lg font-black py-2 px-3 sm:px-4 rounded-xl border-4 transition-all bg-green-400 border-green-600 text-green-900 hover:bg-green-300 hover:scale-105 active:scale-95">🎉 開幕</button>
                  <button id="ds-close-btn" onclick="DialogueSchool.curtain(false)" class="text-base sm:text-lg font-black py-2 px-3 sm:px-4 rounded-xl border-4 transition-all bg-slate-400 border-slate-500 text-slate-600 opacity-50 cursor-not-allowed">🎬 閉幕</button>
                  <button onclick="DialogueSchool.applause()" class="text-base sm:text-lg font-black py-2 px-3 sm:px-4 rounded-xl border-4 transition-all bg-yellow-400 border-yellow-600 text-yellow-900 hover:bg-yellow-300 hover:scale-105 active:scale-95">👏 掌聲</button>
                  <button id="ds-fs-btn" onclick="DialogueSchool.toggleFullscreen()" class="text-base sm:text-lg font-black py-2 px-3 sm:px-4 rounded-xl border-4 transition-all bg-sky-500 border-sky-700 text-white hover:bg-sky-400 hover:scale-105 active:scale-95">⛶ 全螢幕</button>
                </div>
              </div>
            </div>
          </div>
        </div>`;
        applyCurtain();
    }
    function applyCurtain() {
        const l = document.getElementById('ds-curtain-l'), r = document.getElementById('ds-curtain-r');
        if (l) l.style.transform = isCurtainOpen ? 'translateX(-90%) scaleX(0.75)' : 'translateX(0) scaleX(1)';
        if (r) r.style.transform = isCurtainOpen ? 'translateX(90%) scaleX(0.75)' : 'translateX(0) scaleX(1)';
        const ob = document.getElementById('ds-open-btn'), cb = document.getElementById('ds-close-btn');
        if (ob) ob.className = 'text-base sm:text-lg font-black py-2 px-3 sm:px-4 rounded-xl border-4 transition-all ' + (isCurtainOpen ? 'bg-slate-400 border-slate-500 text-slate-600 opacity-50 cursor-not-allowed' : 'bg-green-400 border-green-600 text-green-900 hover:bg-green-300 hover:scale-105 active:scale-95');
        if (cb) cb.className = 'text-base sm:text-lg font-black py-2 px-3 sm:px-4 rounded-xl border-4 transition-all ' + (!isCurtainOpen ? 'bg-slate-400 border-slate-500 text-slate-600 opacity-50 cursor-not-allowed' : 'bg-red-500 border-red-700 text-white hover:bg-red-400 hover:scale-105 active:scale-95');
    }

    // 預熱中文語音清單
    if (window.speechSynthesis) { try { window.speechSynthesis.onvoiceschanged = pickZhVoice; } catch (e) { } }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectCSS);
    else injectCSS();
})();
