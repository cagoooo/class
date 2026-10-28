/**
 * quiet-challenge.js
 * 🤫 安靜挑戰 —— 用麥克風看全班音量，安靜才會計時
 * @version 3.58.0
 *
 * 需求：
 *   - 麥克風即時音量（相對音量 0～100，不是精確分貝），聲音只在這台裝置分析，不錄音、不上傳
 *   - 自動校正：每台電腦麥克風靈敏度差很多，先聽 3 秒教室平常的聲音，把它定在 25 左右，
 *     預設界線 50 就是「比平常大聲一截」（v3.58.0：老師反映原本要把界線拉到近 90 才不會一直吵）
 *   - 5 隻小幫手可選（或每次隨機），7 種表情與場景隨音量變化，台詞隨機換
 *   - 安靜挑戰：選 1～10 分鐘，音量低於界線才計時；太吵就暫停（或嚴格模式：重新開始）
 *   - 成功有提示音與彩帶，老師可再按一下幫全班加分（明確操作才改學生資料）
 *   - 大字全螢幕投影；離開本頁自動關閉麥克風
 *   - 挑戰紀錄依班級隔離（quietChallengeLog 已加入 class-aware SHARED_KEYS）
 *
 * 對外：window.QuietChallenge.{ init, suspend, isActive }
 */
(function () {
    'use strict';

    // ───────────── 純邏輯（可在 node 測試） ─────────────
    const LOUD_HOLD_MS = 300;    // 超過界線持續多久才算「太吵」（避免一聲咳嗽就判定）
    const CALM_HOLD_MS = 700;    // 回到界線以下持續多久才解除「太吵」
    const RANGE_DB = 50;         // 音量條 0～100 涵蓋的分貝範圍
    const BASE_LEVEL = 25;       // 校正後，教室平常的聲音落在音量條的這個位置
    const DEFAULT_FLOOR = -60;   // 尚未校正時，音量條 0 對應的 dBFS
    const DEFAULT_TH = 50;       // 校正後的預設界線（比平常大約 12 分貝）

    /** 時域取樣 → dBFS（數位滿刻度為 0，越安靜越負）。 */
    function dbFromSamples(buf) {
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / (buf.length || 1));
        return 20 * Math.log10(Math.max(rms, 1e-8));
    }

    /** dBFS → 相對音量 0～100（floor 是音量條 0 對應的 dBFS）。 */
    function levelFromDb(db, floor) {
        return Math.max(0, Math.min(100, (db - floor) / RANGE_DB * 100));
    }

    /** 校正：用中位數（一聲咳嗽不影響），讓平常的聲音落在 BASE_LEVEL。 */
    function floorFromDbs(dbs) {
        const s = dbs.filter(d => d > -140).sort((a, b) => a - b);   // 完全無聲的空白資料不算
        if (!s.length) return DEFAULT_FLOOR;
        const median = s[Math.floor(s.length / 2)];
        return Math.max(-95, Math.min(-20, median - BASE_LEVEL / 100 * RANGE_DB));
    }

    /** 平滑：變大跟得快、變小慢慢降，數字才不會一直跳。 */
    function smooth(prev, raw) {
        return raw > prev ? prev + (raw - prev) * 0.35 : prev + (raw - prev) * 0.08;
    }

    /** 太吵判定（含遲滯）：回傳 { loud, aboveMs, belowMs } */
    function loudStep(st, level, threshold, dt) {
        const above = level >= threshold;
        const aboveMs = above ? st.aboveMs + dt : 0;
        const belowMs = above ? 0 : st.belowMs + dt;
        let loud = st.loud;
        if (!loud && aboveMs >= LOUD_HOLD_MS) loud = true;
        else if (loud && belowMs >= CALM_HOLD_MS) loud = false;
        return { loud, aboveMs, belowMs };
    }

    /**
     * 挑戰狀態機。mode: 'pause' = 太吵暫停計時；'reset' = 太吵從頭來。
     * 計時只在「安靜」時累積；每次由安靜轉為太吵算吵醒一次。
     */
    function createChallenge(durationMs, mode) {
        const c = { durationMs, mode: mode === 'reset' ? 'reset' : 'pause', state: 'running', elapsed: 0, noiseCount: 0, streak: 0, bestStreak: 0, wasLoud: false };
        c.update = function (dt, loud) {
            if (c.state !== 'running') return c.state;
            if (loud) {
                if (!c.wasLoud) {
                    c.noiseCount++;
                    if (c.mode === 'reset') c.elapsed = 0;
                }
                c.streak = 0;
            } else {
                c.elapsed = Math.min(c.durationMs, c.elapsed + dt);
                c.streak += dt;
                if (c.streak > c.bestStreak) c.bestStreak = c.streak;
                if (c.elapsed >= c.durationMs) c.state = 'done';
            }
            c.wasLoud = loud;
            return c.state;
        };
        c.remaining = () => Math.max(0, c.durationMs - c.elapsed);
        return c;
    }

    function fmtTime(ms) {
        const s = Math.ceil(ms / 1000);
        return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }

    /** 依音量與界線決定小幫手的心情：熟睡 → 打瞌睡 → 清醒 → 警覺 → 太吵 → 超級吵。 */
    function moodOf(level, threshold, loud) {
        if (loud) return level >= Math.min(98, threshold + 20) ? 'storm' : 'loud';
        if (level >= threshold * 0.85) return 'warn';
        if (level < threshold * 0.55) return 'sleep';
        if (level < threshold * 0.7) return 'doze';
        return 'calm';
    }

    const pure = { dbFromSamples, levelFromDb, floorFromDbs, smooth, loudStep, createChallenge, fmtTime, moodOf, LOUD_HOLD_MS, CALM_HOLD_MS, BASE_LEVEL, DEFAULT_TH, DEFAULT_FLOOR, RANGE_DB };
    if (typeof module !== 'undefined' && module.exports) module.exports = pure;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // ───────────── 設定與紀錄 ─────────────
    const K_CFG = 'quietChallengeCfg';   // 每台裝置自己的設定（每間教室、每支麥克風都不同）
    const K_LOG = 'quietChallengeLog';   // 挑戰紀錄，依班級隔離
    const MINUTES = [1, 2, 3, 5, 10];
    const DEFAULT_CFG = { threshold: DEFAULT_TH, minutes: 3, mode: 'pause', sound: true, reward: 1, animal: 'random', animalPicked: false, floorDb: null, calibAt: 0 };
    const TICK_MS = 50;
    const CALIB_MS = 3000;
    const CALIB_WAIT_MS = 8000;          // 校正最多等幾秒收到聲音
    const MOOD_HOLD_MS = 600;            // 心情要維持這麼久才換，避免在兩種表情間閃來閃去

    // 小幫手（原創向量角色，同一套骨架換耳朵與配色）
    const ANIMALS = {
        owl: { label: '🦉 貓頭鷹', name: '噓噓', body: '#a0714f', belly: '#f6dfb6', ear: '#7c5236', inner: '#f6dfb6', nose: '#f59e0b', arm: '#7c5236', feet: '#f59e0b' },
        cat: { label: '🐱 小貓', name: '喵喵', body: '#fbbf24', belly: '#fff7ed', ear: '#fbbf24', inner: '#fda4af', nose: '#fb7185', arm: '#fbbf24', feet: '#fbbf24' },
        bear: { label: '🐻 小熊', name: '嚕嚕', body: '#b7793f', belly: '#fde3b4', ear: '#b7793f', inner: '#fde3b4', nose: '#3f2a1d', arm: '#b7793f', feet: '#9a6331' },
        bunny: { label: '🐰 兔兔', name: '跳跳', body: '#f8fafc', belly: '#fce7f3', ear: '#f8fafc', inner: '#f9a8d4', nose: '#f472b6', arm: '#f8fafc', feet: '#f8fafc' },
        panda: { label: '🐼 熊貓', name: '圓圓', body: '#f8fafc', belly: '#ffffff', ear: '#1f2937', inner: '#1f2937', nose: '#1f2937', arm: '#1f2937', feet: '#1f2937' }
    };
    const ANIMAL_KEYS = Object.keys(ANIMALS);

    // 表情：眼睛、嘴巴、手、腮紅、汗滴、符號
    const EXPR = {
        off: { eyes: 'open', mouth: 'smile', arms: 'rest', blush: true },
        sleep: { eyes: 'closed', mouth: 'snore', arms: 'rest', blush: true },
        doze: { eyes: 'half', mouth: 'flat', arms: 'rest', blush: true },
        calm: { eyes: 'open', mouth: 'smile', arms: 'rest', blush: true },
        warn: { eyes: 'wide', mouth: 'oh', arms: 'rest', sweat: true, mark: '❗' },
        loud: { eyes: 'squeeze', mouth: 'wave', arms: 'cover', sweat: true },
        storm: { eyes: 'squeeze', mouth: 'scream', arms: 'cover', mark: '💢' },
        party: { eyes: 'happy', mouth: 'grin', arms: 'up', blush: true }
    };

    // 每種心情的台詞（{n} = 小幫手名字），換心情時隨機挑一句
    const LINES = {
        off: ['我是{n}，按下開始讓我聽聽教室'],
        sleep: ['好安靜～{n}睡著了', '呼……呼……', '安靜到聽得見{n}打呼', '{n}夢到大家都好乖', 'Zzz……好舒服'],
        doze: ['{n}快睡著了……', '眼皮好重喔～', '再安靜一點點，{n}就睡著了', '哈～欠～'],
        calm: ['很安靜，繼續保持！', '{n}覺得好舒服', '這樣剛剛好 👍', '大家好棒！'],
        warn: ['咦？有點聲音囉……', '{n}的耳朵豎起來了', '噓～小聲一點', '快超過界線了！'],
        loud: ['好吵！{n}耳朵受不了了！', '太吵了啦～', '{n}摀住耳朵了', '噓噓噓——！'],
        storm: ['超級吵！！快停下來！', '{n}要被吵翻了！', '耳朵快爆炸啦！'],
        party: ['謝謝大家，{n}睡得好飽 😊', '你們是最安靜的班級！', '{n}要幫大家拍拍手！']
    };

    // 場景裝飾：[符號, 數量, 動畫]
    const SCENES = {
        off: [['☁️', 2, 'drift'], ['🎵', 2, 'float']],
        sleep: [['🌙', 1, 'moon'], ['✦', 14, 'twinkle']],
        doze: [['🌛', 1, 'moon'], ['✦', 6, 'twinkle'], ['☁️', 2, 'drift']],
        calm: [['☀️', 1, 'sun'], ['☁️', 3, 'drift'], ['🌷', 1, 'ground'], ['🌿', 1, 'ground']],
        warn: [['🍃', 4, 'blow'], ['🔔', 1, 'wiggle']],
        loud: [['📢', 2, 'pulse'], ['🔊', 2, 'pulse'], ['💥', 2, 'pulse']],
        storm: [['⚡', 3, 'flash'], ['⛈️', 2, 'drift'], ['💥', 2, 'pulse']],
        party: [['🎉', 2, 'float'], ['🎊', 2, 'float'], ['🎈', 2, 'float'], ['🌟', 3, 'twinkle']]
    };
    const DARK_MOODS = ['sleep', 'doze', 'storm'];

    function lsGet(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
    function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 存不了不影響使用 */ } }
    function loadCfg() {
        const c = Object.assign({}, DEFAULT_CFG, lsGet(K_CFG, {}));
        c.threshold = Math.max(10, Math.min(99, Number(c.threshold) || DEFAULT_CFG.threshold));
        if (!MINUTES.includes(Number(c.minutes))) c.minutes = DEFAULT_CFG.minutes;
        c.reward = Math.max(1, Math.min(5, parseInt(c.reward, 10) || 1));
        // 預設每次隨機換小幫手；老師自己選過才固定（舊版會把預設的貓頭鷹存起來，也一律改回隨機）
        if (!c.animalPicked || (c.animal !== 'random' && !ANIMALS[c.animal])) c.animal = 'random';
        c.floorDb = Number.isFinite(c.floorDb) ? c.floorDb : null;
        return c;
    }
    function loadLog() { const l = lsGet(K_LOG, []); return Array.isArray(l) ? l : []; }
    function addLog(entry) { const l = loadLog(); l.unshift(entry); lsSet(K_LOG, l.slice(0, 30)); }

    let cfg = loadCfg();
    const audio = { stream: null, ctx: null, analyser: null, buf: null, timer: null };
    const meter = { level: 0, loud: { loud: false, aboveMs: 0, belowMs: 0 }, last: 0 };
    let challenge = null;      // createChallenge() 物件
    let countdown = 0;         // 開始前 3、2、1 倒數（毫秒）
    let calib = null;          // 校正中：{ left, dbs, auto }
    let awarded = false;
    let fsOn = false;
    let curAnimal = cfg.animal === 'random' ? ANIMAL_KEYS[Math.floor(Math.random() * ANIMAL_KEYS.length)] : cfg.animal;
    let mood = '', pendingMood = '', pendingAt = 0, lastLine = '';

    const $ = id => document.getElementById(id);
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    // ───────────── 小幫手 SVG ─────────────
    const OUT = 'stroke="#334155" stroke-width="3" stroke-linejoin="round"';
    const pair = frag => frag + `<g transform="translate(200 0) scale(-1 1)">${frag}</g>`;

    function earsSvg(k, a) {
        switch (k) {
            case 'owl': return pair(`<path d="M50 80 L44 34 L86 62 Z" fill="${a.ear}" ${OUT}/>`);
            case 'cat': return pair(`<path d="M46 86 L52 30 L94 62 Z" fill="${a.body}" ${OUT}/><path d="M57 75 L60 46 L81 62 Z" fill="${a.inner}"/>`);
            case 'bear': return pair(`<circle cx="56" cy="64" r="20" fill="${a.body}" ${OUT}/><circle cx="56" cy="64" r="10" fill="${a.inner}"/>`);
            case 'bunny': return pair(`<ellipse cx="74" cy="34" rx="14" ry="38" transform="rotate(-12 74 34)" fill="${a.body}" ${OUT}/><ellipse cx="74" cy="37" rx="7" ry="25" transform="rotate(-12 74 37)" fill="${a.inner}"/>`);
            case 'panda': return pair(`<circle cx="56" cy="64" r="20" fill="${a.ear}" ${OUT}/>`);
        }
        return '';
    }

    function eyesSvg(kind, k) {
        const c = k === 'panda' ? '#f8fafc' : '#1f2937';
        switch (kind) {
            case 'closed': return pair(`<path d="M68 104 Q78 113 88 104" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`);
            case 'half': return pair(`<path d="M68 104 L88 104" stroke="${c}" stroke-width="4" stroke-linecap="round"/><path d="M71 105 Q78 112 85 105 Z" fill="${c}"/>`);
            case 'open': return pair(k === 'panda'
                ? `<circle cx="78" cy="104" r="7.5" fill="#fff"/><circle cx="79" cy="105" r="4" fill="#1f2937"/>`
                : `<circle cx="78" cy="104" r="8" fill="#1f2937"/><circle cx="81" cy="101" r="2.6" fill="#fff"/>`);
            case 'wide': return pair(`<circle cx="78" cy="104" r="12" fill="#fff" stroke="#1f2937" stroke-width="2.5"/><circle cx="79" cy="105" r="4.5" fill="#1f2937"/>`);
            case 'squeeze': return pair(`<path d="M69 96 L86 104 L69 112" fill="none" stroke="${c}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`);
            case 'happy': return pair(`<path d="M68 108 Q78 95 88 108" fill="none" stroke="${c}" stroke-width="4.5" stroke-linecap="round"/>`);
        }
        return '';
    }

    function mouthSvg(kind, y) {
        const S = 'fill="none" stroke="#1f2937" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"';
        switch (kind) {
            case 'smile': return `<path d="M90 ${y - 2} Q100 ${y + 8} 110 ${y - 2}" ${S}/>`;
            case 'snore': return `<circle cx="100" cy="${y + 2}" r="4" fill="#1f2937"/>`;
            case 'flat': return `<path d="M93 ${y + 2} L107 ${y + 2}" ${S}/>`;
            case 'oh': return `<ellipse cx="100" cy="${y + 3}" rx="5" ry="7" fill="#1f2937"/>`;
            case 'wave': return `<path d="M85 ${y + 3} l5 -5 l5 5 l5 -5 l5 5 l5 -5 l5 5" ${S} stroke-width="3"/>`;
            case 'scream': return `<ellipse cx="100" cy="${y + 5}" rx="10" ry="12" fill="#1f2937"/><ellipse cx="100" cy="${y + 11}" rx="6" ry="4" fill="#fb7185"/>`;
            case 'grin': return `<path d="M84 ${y - 3} Q100 ${y + 20} 116 ${y - 3} Z" fill="#1f2937"/><path d="M92 ${y + 8} Q100 ${y + 14} 108 ${y + 8} Z" fill="#fb7185"/>`;
        }
        return '';
    }

    function armsSvg(kind, a) {
        const f = `fill="${a.arm}" ${OUT}`;
        if (kind === 'cover') return pair(`<ellipse cx="40" cy="96" rx="13" ry="24" transform="rotate(-12 40 96)" ${f}/>`);
        if (kind === 'up') return pair(`<ellipse cx="36" cy="72" rx="12" ry="25" transform="rotate(-38 36 72)" ${f}/>`);
        return pair(`<ellipse cx="38" cy="142" rx="12" ry="22" transform="rotate(18 38 142)" ${f}/>`);
    }

    function mascotSvg(k, exprKey) {
        const a = ANIMALS[k] || ANIMALS.owl, e = EXPR[exprKey] || EXPR.calm;
        const mouthY = k === 'owl' ? 144 : 136;
        let s = `<svg viewBox="0 -10 200 215" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(a.label)}">`;
        s += earsSvg(k, a);
        s += pair(`<ellipse cx="78" cy="186" rx="17" ry="9" fill="${a.feet}" ${OUT}/>`);
        s += `<ellipse cx="100" cy="122" rx="66" ry="64" fill="${a.body}" ${OUT}/>`;
        s += `<ellipse cx="100" cy="152" rx="38" ry="29" fill="${a.belly}"/>`;
        if (k === 'owl') {
            s += `<path d="M86 148 q5 5 10 0 M104 148 q5 5 10 0 M95 161 q5 5 10 0" stroke="${a.ear}" fill="none" stroke-width="2.5" stroke-linecap="round"/>`;
            s += pair(`<circle cx="78" cy="104" r="19" fill="#fff7ed" stroke="#334155" stroke-width="2.5"/>`);
        }
        if (k === 'panda') s += pair(`<ellipse cx="78" cy="105" rx="15" ry="19" transform="rotate(28 78 105)" fill="#1f2937"/>`);
        if (k === 'bear') s += `<ellipse cx="100" cy="132" rx="20" ry="14" fill="${a.belly}"/>`;
        if (e.blush) s += pair(`<ellipse cx="60" cy="127" rx="9" ry="5.5" fill="#fb7185" opacity=".45"/>`);
        s += eyesSvg(e.eyes, k);
        s += k === 'owl'
            ? `<path d="M91 120 L109 120 L100 134 Z" fill="${a.nose}" stroke="#334155" stroke-width="2" stroke-linejoin="round"/>`
            : `<ellipse cx="100" cy="124" rx="6" ry="4.5" fill="${a.nose}"/>`;
        if (k === 'cat') s += pair(`<path d="M62 126 L36 120 M62 132 L36 135" stroke="#334155" stroke-width="2" stroke-linecap="round"/>`);
        s += mouthSvg(e.mouth, mouthY);
        s += armsSvg(e.arms, a);
        if (e.sweat) s += `<path d="M160 66 Q168 81 160 87 Q152 81 160 66 Z" fill="#60a5fa" stroke="#1e40af" stroke-width="1.5"/>`;
        if (e.mark) s += `<text x="150" y="50" font-size="30">${e.mark}</text>`;
        return s + '</svg>';
    }

    function sceneHtml(m) {
        const items = SCENES[m] || [];
        let h = '';
        items.forEach(([sym, n, anim]) => {
            for (let i = 0; i < n; i++) {
                let x, y;
                if (anim === 'moon') { x = 6; y = 6; }
                else if (anim === 'sun') { x = 84; y = 6; }
                else if (anim === 'ground') { x = Math.random() < 0.5 ? 3 + Math.random() * 10 : 86 + Math.random() * 8; y = 82 + Math.random() * 8; }
                else {
                    // 裝飾放兩側與上緣，不擋住小幫手和計時數字
                    const side = Math.random();
                    if (side < 0.4) { x = 2 + Math.random() * 16; y = 4 + Math.random() * 80; }
                    else if (side < 0.8) { x = 82 + Math.random() * 14; y = 4 + Math.random() * 80; }
                    else { x = 20 + Math.random() * 60; y = 2 + Math.random() * 8; }
                }
                const size = sym === '✦' ? 10 + Math.random() * 12 : (anim === 'moon' || anim === 'sun' ? 64 : 26 + Math.random() * 16);
                const delay = (Math.random() * 2.5).toFixed(2);
                h += `<span class="qc-deco qc-a-${anim}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;font-size:${size.toFixed(0)}px;animation-delay:${delay}s">${sym}</span>`;
            }
        });
        return h;
    }

    // ───────────── CSS ─────────────
    function injectCSS() {
        if ($('quiet-challenge-style')) return;
        const css = `
        .qc-wrap{font-family:'Noto Sans TC','Microsoft JhengHei',sans-serif}
        .qc-wrap [hidden]{display:none!important}
        .qc-head h2{font-size:clamp(26px,4vw,40px);font-weight:900;color:#4338ca;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
        .qc-head p{color:#64748b;margin:.25rem 0 1rem;font-size:15px}
        .qc-privacy{display:inline-flex;align-items:center;gap:.35rem;background:#eef2ff;color:#4338ca;border-radius:999px;padding:.2rem .75rem;font-size:13px;font-weight:700}
        .qc-grid{display:grid;grid-template-columns:1fr;gap:1rem}
        @media(min-width:1024px){.qc-grid{grid-template-columns:minmax(0,1fr) 340px}}
        /* 舞台與場景 */
        .qc-stage{position:relative;border-radius:1.5rem;padding:clamp(16px,3vw,32px);min-height:480px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.8rem;
            transition:background .7s ease,color .4s ease;overflow:hidden;text-align:center;color:#1e293b}
        .qc-stage > *{position:relative;z-index:1}
        .qc-stage.m-off{background:linear-gradient(160deg,#eef2ff,#e0f2fe)}
        .qc-stage.m-sleep{background:linear-gradient(160deg,#1e1b4b,#312e81 60%,#1e3a8a)}
        .qc-stage.m-doze{background:linear-gradient(160deg,#4c1d95,#7e22ce 55%,#db2777)}
        .qc-stage.m-calm{background:linear-gradient(160deg,#e0f2fe,#dcfce7 55%,#bbf7d0)}
        .qc-stage.m-warn{background:linear-gradient(160deg,#fef9c3,#fde68a)}
        .qc-stage.m-loud{background:linear-gradient(160deg,#fee2e2,#fca5a5)}
        .qc-stage.m-storm{background:linear-gradient(160deg,#450a0a,#991b1b 55%,#dc2626);animation:qc-quake .25s linear infinite}
        .qc-stage.m-party{background:linear-gradient(135deg,#fef3c7,#fbcfe8 45%,#c7d2fe)}
        .qc-stage.qc-darkbg{color:#f1f5f9}
        @keyframes qc-quake{0%,100%{transform:translate(0,0)}25%{transform:translate(-3px,2px)}75%{transform:translate(3px,-2px)}}
        .qc-scene{position:absolute!important;inset:0;pointer-events:none;z-index:0!important}
        .qc-deco{position:absolute;line-height:1;user-select:none}
        .qc-a-twinkle{color:#fde68a;animation:qc-twinkle 2.4s ease-in-out infinite}
        .qc-a-moon{animation:qc-bob 6s ease-in-out infinite;filter:drop-shadow(0 0 18px rgba(253,230,138,.6))}
        .qc-a-sun{animation:qc-spin 18s linear infinite;filter:drop-shadow(0 0 20px rgba(251,191,36,.6))}
        .qc-a-drift{animation:qc-drift 9s ease-in-out infinite alternate;opacity:.9}
        .qc-a-ground{animation:qc-sway 3s ease-in-out infinite;transform-origin:bottom center}
        .qc-a-blow{animation:qc-blow 2.6s ease-in infinite}
        .qc-a-wiggle{animation:qc-wiggle .5s ease-in-out infinite}
        .qc-a-pulse{animation:qc-pulse .7s ease-in-out infinite}
        .qc-a-flash{animation:qc-flash 1.2s steps(2) infinite}
        .qc-a-float{animation:qc-float 3s ease-in-out infinite}
        @keyframes qc-twinkle{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}
        @keyframes qc-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes qc-spin{to{transform:rotate(360deg)}}
        @keyframes qc-drift{from{transform:translateX(-14px)}to{transform:translateX(14px)}}
        @keyframes qc-sway{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
        @keyframes qc-blow{0%{transform:translate(0,0) rotate(0);opacity:0}20%{opacity:1}100%{transform:translate(60px,-30px) rotate(200deg);opacity:0}}
        @keyframes qc-wiggle{0%,100%{transform:rotate(-14deg)}50%{transform:rotate(14deg)}}
        @keyframes qc-pulse{0%,100%{transform:scale(.9)}50%{transform:scale(1.2)}}
        @keyframes qc-flash{0%{opacity:1}100%{opacity:.15}}
        @keyframes qc-float{0%,100%{transform:translateY(0) rotate(-6deg)}50%{transform:translateY(-14px) rotate(6deg)}}
        /* 小幫手 */
        .qc-mascot{position:relative;width:clamp(170px,22vw,250px);aspect-ratio:200/215;user-select:none}
        .qc-mascot svg{width:100%;height:100%;display:block;overflow:visible;filter:drop-shadow(0 10px 14px rgba(0,0,0,.18))}
        .m-sleep .qc-mascot svg,.m-doze .qc-mascot svg{animation:qc-breathe 3.2s ease-in-out infinite;transform-origin:bottom center}
        .m-calm .qc-mascot svg,.m-off .qc-mascot svg{animation:qc-bob 2.8s ease-in-out infinite}
        .m-warn .qc-mascot svg{animation:qc-tilt 1.4s ease-in-out infinite;transform-origin:bottom center}
        .m-loud .qc-mascot svg{animation:qc-shake .35s linear infinite}
        .m-storm .qc-mascot svg{animation:qc-shake .18s linear infinite}
        .m-party .qc-mascot svg{animation:qc-jump .7s ease-in-out infinite;transform-origin:bottom center}
        @keyframes qc-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.04,.97)}}
        @keyframes qc-tilt{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
        @keyframes qc-shake{0%,100%{transform:translateX(0) rotate(0)}25%{transform:translateX(-7px) rotate(-5deg)}75%{transform:translateX(7px) rotate(5deg)}}
        @keyframes qc-jump{0%,100%{transform:translateY(0) scale(1,1)}40%{transform:translateY(-22px) scale(.97,1.04)}80%{transform:translateY(0) scale(1.05,.95)}}
        .qc-zzz{position:absolute;right:-8%;top:-4%;font-size:clamp(22px,3vw,34px);font-weight:900;color:#c7d2fe;opacity:0;pointer-events:none}
        .m-sleep .qc-zzz,.m-doze .qc-zzz{animation:qc-zzz 2.6s ease-in-out infinite}
        .m-doze .qc-zzz{font-size:clamp(16px,2vw,22px)}
        @keyframes qc-zzz{0%{opacity:0;transform:translate(0,10px)}30%{opacity:1}100%{opacity:0;transform:translate(18px,-30px)}}
        .qc-say{font-size:clamp(20px,2.8vw,30px);font-weight:900;min-height:1.4em}
        .qc-meter{width:min(100%,720px)}
        .qc-bar{position:relative;height:30px;border-radius:999px;background:rgba(255,255,255,.65);box-shadow:inset 0 2px 6px rgba(0,0,0,.12)}
        .qc-darkbg .qc-bar{background:rgba(255,255,255,.2)}
        .qc-fill{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:linear-gradient(90deg,#22c55e,#84cc16);transition:width .08s linear,background .3s;width:0}
        .qc-fill.over{background:linear-gradient(90deg,#f97316,#ef4444)}
        .qc-line{position:absolute;top:-8px;bottom:-8px;width:4px;margin-left:-2px;background:#ef4444;border-radius:2px}
        .qc-line::after{content:'太吵';position:absolute;top:-22px;left:50%;transform:translateX(-50%);font-size:12px;font-weight:900;color:#ef4444;white-space:nowrap}
        .qc-darkbg .qc-line::after{color:#fecaca}
        .qc-num{display:flex;justify-content:space-between;font-size:14px;font-weight:700;margin-top:.35rem;opacity:.85}
        .qc-clock{font-size:clamp(64px,13vw,150px);font-weight:900;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:.02em}
        .qc-clock.paused{animation:qc-blink 1s steps(2) infinite}
        @keyframes qc-blink{50%{opacity:.35}}
        .qc-prog{width:min(100%,720px);height:14px;border-radius:999px;background:rgba(255,255,255,.55);overflow:hidden}
        .qc-darkbg .qc-prog{background:rgba(255,255,255,.2)}
        .qc-prog > div{height:100%;width:0;background:linear-gradient(90deg,#6366f1,#a855f7);border-radius:999px;transition:width .2s linear}
        .qc-status{font-size:clamp(18px,2.4vw,26px);font-weight:900}
        .qc-chips{display:flex;gap:.6rem;flex-wrap:wrap;justify-content:center;font-size:15px;font-weight:700}
        .qc-chip{background:rgba(255,255,255,.7);color:#334155;border-radius:999px;padding:.25rem .8rem}
        .qc-darkbg .qc-chip{background:rgba(255,255,255,.16);color:#f1f5f9}
        .qc-actions{display:flex;gap:.6rem;flex-wrap:wrap;justify-content:center}
        .qc-btn{border:0;border-radius:999px;padding:.7rem 1.4rem;font-size:18px;font-weight:900;cursor:pointer;transition:transform .15s,box-shadow .15s;box-shadow:0 4px 12px rgba(0,0,0,.12)}
        .qc-btn:hover{transform:translateY(-2px)}
        .qc-btn:active{transform:scale(.96)}
        .qc-btn:disabled{opacity:.55;cursor:not-allowed;transform:none}
        .qc-btn-main{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff}
        .qc-btn-go{background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff}
        .qc-btn-soft{background:#fff;color:#4338ca}
        .qc-btn-gift{background:linear-gradient(135deg,#f59e0b,#f97316);color:#fff}
        .qc-btn-big{font-size:clamp(20px,2.6vw,26px);padding:.9rem 2rem}
        .qc-count{position:absolute!important;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.5rem;font-size:clamp(120px,24vw,260px);font-weight:900;color:#4338ca;background:rgba(255,255,255,.6);backdrop-filter:blur(2px);z-index:3!important;line-height:1}
        .qc-count small{font-size:clamp(18px,2.6vw,28px);color:#334155;line-height:1.5;padding:0 1rem}
        .qc-win{display:flex;flex-direction:column;align-items:center;gap:.6rem}
        .qc-win h3{font-size:clamp(34px,6vw,64px);font-weight:900;color:#b45309}
        .qc-win p{font-size:clamp(18px,2.4vw,24px);font-weight:700}
        .qc-msg{font-size:15px;font-weight:700;color:#b91c1c;background:#fff;border-radius:1rem;padding:.6rem 1rem;max-width:560px;line-height:1.6}
        .qc-ok{color:#15803d}
        .qc-fsbtn{position:absolute!important;top:12px;right:12px;z-index:4!important;border:0;background:rgba(255,255,255,.75);color:#334155;border-radius:999px;padding:.4rem .9rem;font-weight:800;cursor:pointer;font-size:14px}
        .qc-darkbg .qc-fsbtn{background:rgba(255,255,255,.18);color:#f1f5f9}
        /* 全螢幕投影 */
        .qc-stage.qc-fs{position:fixed;inset:0;z-index:2147483000;border-radius:0;min-height:100vh;padding:4vh 4vw}
        .qc-stage.qc-fs .qc-mascot{width:min(34vh,26vw)}
        .qc-stage.qc-fs .qc-clock{font-size:min(20vh,17vw)}
        .qc-stage.qc-fs .qc-say{font-size:min(5vh,4.4vw)}
        .qc-stage.qc-fs .qc-meter,.qc-stage.qc-fs .qc-prog{width:min(86vw,1400px)}
        .qc-stage.qc-fs .qc-bar{height:min(5vh,44px)}
        .qc-stage.qc-fs .qc-deco{transform-origin:center}
        /* 設定面板 */
        .qc-panel{display:flex;flex-direction:column;gap:.9rem}
        .qc-card{background:#f8fafc;border:2px solid #e2e8f0;border-radius:1.1rem;padding:1rem}
        .qc-card h3{font-size:17px;font-weight:900;color:#334155;margin-bottom:.55rem}
        .qc-card .hint{font-size:13px;color:#64748b;line-height:1.55;margin-top:.4rem}
        .qc-range{width:100%;accent-color:#6366f1}
        .qc-seg{display:flex;flex-wrap:wrap;gap:.45rem}
        .qc-seg button{flex:1 1 auto;min-width:56px;border:2px solid #c7d2fe;background:#fff;color:#4338ca;border-radius:.8rem;padding:.45rem .6rem;font-weight:800;cursor:pointer;font-size:15px}
        .qc-seg button[aria-pressed="true"]{background:#6366f1;border-color:#6366f1;color:#fff}
        .qc-seg button:disabled{opacity:.5;cursor:not-allowed}
        .qc-calib{margin-top:.6rem;width:100%;border:2px dashed #a5b4fc;background:#eef2ff;color:#4338ca;border-radius:.8rem;padding:.5rem;font-weight:800;cursor:pointer;font-size:15px}
        .qc-calib:disabled{opacity:.5;cursor:not-allowed}
        .qc-row{display:flex;align-items:center;justify-content:space-between;gap:.6rem;font-size:15px;font-weight:700;color:#334155}
        .qc-row select{border:2px solid #c7d2fe;border-radius:.6rem;padding:.25rem .5rem;font-weight:700}
        .qc-log{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:.35rem;font-size:14px;color:#334155}
        .qc-log li{display:flex;justify-content:space-between;gap:.5rem;background:#fff;border-radius:.6rem;padding:.35rem .6rem}
        .qc-best{font-size:15px;font-weight:900;color:#b45309;margin-bottom:.45rem}
        .dark .qc-head h2{color:#a5b4fc}
        .dark .qc-head p{color:#94a3b8}
        .dark .qc-privacy{background:#312e81;color:#c7d2fe}
        .dark .qc-card{background:#1e293b;border-color:#334155}
        .dark .qc-card h3,.dark .qc-row{color:#e2e8f0}
        .dark .qc-card .hint{color:#94a3b8}
        .dark .qc-seg button{background:#0f172a;border-color:#4338ca;color:#c7d2fe}
        .dark .qc-seg button[aria-pressed="true"]{background:#6366f1;color:#fff}
        .dark .qc-calib{background:#1e1b4b;border-color:#6366f1;color:#c7d2fe}
        .dark .qc-log li{background:#0f172a;color:#e2e8f0}
        .dark .qc-best{color:#fbbf24}
        @media (prefers-reduced-motion: reduce){.qc-stage,.qc-stage *{animation:none!important}}
        `;
        const s = document.createElement('style');
        s.id = 'quiet-challenge-style';
        s.textContent = css;
        document.head.appendChild(s);
    }

    // ───────────── 畫面 ─────────────
    function render() {
        const root = $('qc-root');
        if (!root || root.dataset.ready) return;
        root.dataset.ready = '1';
        const animalBtns = ANIMAL_KEYS.map(k => `<button type="button" data-animal="${k}" aria-pressed="${cfg.animal === k}">${ANIMALS[k].label}</button>`).join('')
            + `<button type="button" data-animal="random" aria-pressed="${cfg.animal === 'random'}">🎲 每次隨機</button>`;
        root.innerHTML = `
        <div class="qc-wrap">
            <div class="qc-head">
                <h2>🤫 安靜挑戰 <span class="qc-privacy">🔒 聲音只在這台裝置即時分析，不錄音、不上傳</span></h2>
                <p>用麥克風看全班音量。太吵時小幫手會摀住耳朵，夠安靜就睡著；挑戰期間要安靜才會計時！</p>
            </div>
            <div class="qc-grid">
                <div class="qc-stage m-off" id="qc-stage" aria-live="polite">
                    <div class="qc-scene" id="qc-scene"></div>
                    <button class="qc-fsbtn" id="qc-fs" title="全螢幕投影（ESC 離開）">⛶ 全螢幕投影</button>
                    <div class="qc-mascot"><div id="qc-svg"></div><span class="qc-zzz" aria-hidden="true">Z z z</span></div>
                    <div class="qc-say" id="qc-say"></div>
                    <div class="qc-meter" id="qc-meter" hidden>
                        <div class="qc-bar"><div class="qc-fill" id="qc-fill"></div><div class="qc-line" id="qc-line"></div></div>
                        <div class="qc-num"><span>🔈 安靜</span><span id="qc-level">音量 0</span><span>🔊 很吵</span></div>
                    </div>
                    <div id="qc-play" hidden>
                        <div class="qc-clock" id="qc-clock">03:00</div>
                        <div class="qc-prog" style="margin:.6rem auto"><div id="qc-prog"></div></div>
                        <div class="qc-status" id="qc-status"></div>
                        <div class="qc-chips" style="margin-top:.5rem"><span class="qc-chip" id="qc-noise">😵 吵醒 0 次</span><span class="qc-chip" id="qc-streak">🏅 最長連續安靜 00:00</span></div>
                    </div>
                    <div class="qc-win" id="qc-win" hidden></div>
                    <div class="qc-msg" id="qc-msg" hidden></div>
                    <div class="qc-actions" id="qc-actions"></div>
                    <div class="qc-count" id="qc-count" hidden></div>
                </div>
                <div class="qc-panel">
                    <div class="qc-card">
                        <h3>🎚️ 太吵的界線：<span id="qc-th-val">${cfg.threshold}</span></h3>
                        <input type="range" class="qc-range" id="qc-th" min="10" max="99" step="1" value="${cfg.threshold}" aria-label="太吵的界線">
                        <button type="button" class="qc-calib" id="qc-calib">🎯 自動校正（全班先安靜 3 秒）</button>
                        <div class="hint" id="qc-calib-info"></div>
                        <div class="hint">校正會把教室平常的聲音定在 25 左右、界線設為 50。還是覺得太敏感就把界線往右調。數值是相對音量，不是精確分貝。</div>
                    </div>
                    <div class="qc-card">
                        <h3>🐾 選擇小幫手</h3>
                        <div class="qc-seg" id="qc-animal">${animalBtns}</div>
                    </div>
                    <div class="qc-card">
                        <h3>⏱️ 挑戰時間</h3>
                        <div class="qc-seg" id="qc-min">${MINUTES.map(m => `<button type="button" data-min="${m}" aria-pressed="${m === cfg.minutes}">${m} 分</button>`).join('')}</div>
                    </div>
                    <div class="qc-card">
                        <h3>📏 太吵的時候</h3>
                        <div class="qc-seg" id="qc-mode">
                            <button type="button" data-mode="pause" aria-pressed="${cfg.mode !== 'reset'}">⏸ 暫停計時</button>
                            <button type="button" data-mode="reset" aria-pressed="${cfg.mode === 'reset'}">🔁 重新開始</button>
                        </div>
                        <div class="hint">「重新開始」比較嚴格：一吵就從頭計時，適合高年級。</div>
                    </div>
                    <div class="qc-card">
                        <div class="qc-row"><span>🔔 挑戰成功提示音</span><input type="checkbox" id="qc-sound" ${cfg.sound ? 'checked' : ''} style="width:20px;height:20px;accent-color:#6366f1"></div>
                        <div class="qc-row" style="margin-top:.6rem"><span>🎁 成功獎勵（老師按了才加）</span>
                            <select id="qc-reward" aria-label="成功時全班每人加幾分">${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${n === cfg.reward ? 'selected' : ''}>每人 +${n} 分</option>`).join('')}</select></div>
                    </div>
                    <div class="qc-card">
                        <h3>📜 本班挑戰紀錄</h3>
                        <div id="qc-logbox"></div>
                    </div>
                </div>
            </div>
        </div>`;
        wire();
        setMood('off', true);
        renderActions();
        renderLog();
        renderCalibInfo();
        updateThresholdLine();
    }

    function wire() {
        $('qc-th').addEventListener('input', e => {
            cfg.threshold = Number(e.target.value);
            $('qc-th-val').textContent = cfg.threshold;
            updateThresholdLine();
            lsSet(K_CFG, cfg);
        });
        $('qc-calib').addEventListener('click', () => act('calib'));
        $('qc-animal').addEventListener('click', e => {
            const b = e.target.closest('[data-animal]');
            if (!b) return;
            cfg.animal = b.dataset.animal;
            cfg.animalPicked = true;
            lsSet(K_CFG, cfg);
            curAnimal = cfg.animal === 'random' ? randomAnimal() : cfg.animal;
            syncSeg();
            setMood(mood || 'off', true);
        });
        $('qc-min').addEventListener('click', e => {
            const b = e.target.closest('[data-min]');
            if (!b || challenge) return;
            cfg.minutes = Number(b.dataset.min);
            lsSet(K_CFG, cfg);
            syncSeg();
            renderActions();
        });
        $('qc-mode').addEventListener('click', e => {
            const b = e.target.closest('[data-mode]');
            if (!b || challenge) return;
            cfg.mode = b.dataset.mode;
            lsSet(K_CFG, cfg);
            syncSeg();
        });
        $('qc-sound').addEventListener('change', e => { cfg.sound = e.target.checked; lsSet(K_CFG, cfg); });
        $('qc-reward').addEventListener('change', e => { cfg.reward = Number(e.target.value); lsSet(K_CFG, cfg); if (!challenge) renderActions(); });
        $('qc-fs').addEventListener('click', toggleFs);
        $('qc-actions').addEventListener('click', e => {
            const b = e.target.closest('[data-act]');
            if (b && !b.disabled) act(b.dataset.act);
        });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && fsOn && !document.fullscreenElement) exitFs(); });
        document.addEventListener('fullscreenchange', () => { if (fsOn && !document.fullscreenElement) exitFs(); });
        window.addEventListener('pagehide', () => api.suspend());
    }

    function randomAnimal() {
        const others = ANIMAL_KEYS.filter(k => k !== curAnimal);
        return pick(others.length ? others : ANIMAL_KEYS);
    }

    function syncSeg() {
        const lock = !!challenge;
        document.querySelectorAll('#qc-min [data-min]').forEach(b => { b.setAttribute('aria-pressed', String(Number(b.dataset.min) === cfg.minutes)); b.disabled = lock; });
        document.querySelectorAll('#qc-mode [data-mode]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.mode === cfg.mode)); b.disabled = lock; });
        document.querySelectorAll('#qc-animal [data-animal]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.animal === cfg.animal)));
        const cb = $('qc-calib');
        if (cb) cb.disabled = lock || !!calib;
    }

    function updateThresholdLine() {
        const l = $('qc-line');
        if (l) l.style.left = cfg.threshold + '%';
    }

    function renderCalibInfo() {
        const el = $('qc-calib-info');
        if (!el) return;
        if (cfg.floorDb == null) { el.textContent = '尚未校正：第一次開麥克風時會自動校正。'; return; }
        const d = new Date(cfg.calibAt || Date.now());
        el.textContent = `✅ 上次校正：${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}（換教室或換電腦時再校正一次）`;
    }

    function show(id, on) { const e = $(id); if (e) e.hidden = !on; }

    function renderActions() {
        const box = $('qc-actions');
        if (!box) return;
        const btn = (act, cls, label, dis) => `<button type="button" class="qc-btn ${cls}" data-act="${act}" ${dis ? 'disabled' : ''}>${label}</button>`;
        let h = '';
        if (!audio.stream) {
            h = btn('mic', 'qc-btn-main qc-btn-big', '🎤 開始偵測音量');
        } else if (calib) {
            h = btn('none', 'qc-btn-soft', '🎯 校正中……', true);
        } else if (challenge && challenge.state === 'done') {
            const noRoster = !(Array.isArray(window.students) && window.students.length);
            h = btn('award', 'qc-btn-gift qc-btn-big', awarded ? `✅ 已幫全班每人加 ${cfg.reward} 分` : `🎁 全班每人 +${cfg.reward} 分`, awarded || noRoster)
                + btn('again', 'qc-btn-go', '🔁 再挑戰一次')
                + btn('close', 'qc-btn-soft', '✖ 結束');
        } else if (challenge) {
            h = btn('stop', 'qc-btn-soft', '⏹ 結束挑戰');
        } else {
            h = btn('start', 'qc-btn-go qc-btn-big', `▶ 開始 ${cfg.minutes} 分鐘安靜挑戰`)
                + btn('micoff', 'qc-btn-soft', '🔇 關閉麥克風');
        }
        box.innerHTML = h;
        syncSeg();
    }

    function setMsg(text, ok) {
        const m = $('qc-msg');
        if (!m) return;
        m.hidden = !text;
        m.textContent = text || '';
        m.classList.toggle('qc-ok', !!ok);
    }

    function renderLog() {
        const box = $('qc-logbox');
        if (!box) return;
        const log = loadLog();
        if (!log.length) { box.innerHTML = '<div class="hint">還沒有紀錄，來挑戰第一次吧！</div>'; return; }
        const best = log.filter(r => r.ok).reduce((m, r) => Math.max(m, r.min), 0);
        const okCount = log.filter(r => r.ok).length;
        const items = log.slice(0, 6).map(r => {
            const d = new Date(r.t);
            const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            return `<li><span>${esc(when)}　${r.min} 分${r.mode === 'reset' ? '（嚴格）' : ''}</span><span>${r.ok ? '🏆 成功' : '💪 未完成'}・吵醒 ${r.noise} 次</span></li>`;
        }).join('');
        box.innerHTML = `${best ? `<div class="qc-best">⭐ 最高成功紀錄：${best} 分鐘（共成功 ${okCount} 次）</div>` : ''}<ul class="qc-log">${items}</ul>`;
    }

    function line(m) {
        const pool = (LINES[m] || LINES.calm).map(s => s.replace('{n}', ANIMALS[curAnimal].name));
        const choices = pool.filter(s => s !== lastLine);
        lastLine = pick(choices.length ? choices : pool);
        return lastLine;
    }

    /** 換心情：重畫小幫手、場景與台詞。force = 同一心情也重畫（換角色時）。 */
    function setMood(m, force) {
        if (m === mood && !force) return;
        const changed = m !== mood;
        mood = m;
        const st = $('qc-stage');
        if (!st) return;
        st.className = st.className.replace(/\bm-\w+/g, '').trim() + ' m-' + m;
        st.classList.toggle('qc-darkbg', DARK_MOODS.includes(m));
        $('qc-svg').innerHTML = mascotSvg(curAnimal, m);
        if (changed || !$('qc-scene').innerHTML) $('qc-scene').innerHTML = sceneHtml(m);
        if (changed || m === 'off') $('qc-say').textContent = line(m);
        else $('qc-say').textContent = lastLine.replace(/噓噓|喵喵|嚕嚕|跳跳|圓圓/, ANIMALS[curAnimal].name);
    }

    function paint() {
        const lv = Math.round(meter.level);
        const fill = $('qc-fill');
        if (fill) {
            fill.style.width = lv + '%';
            fill.classList.toggle('over', meter.level >= cfg.threshold);
        }
        const lt = $('qc-level');
        if (lt) lt.textContent = '音量 ' + lv;
        if (!challenge || challenge.state !== 'done') {
            const target = moodOf(meter.level, cfg.threshold, meter.loud.loud);
            const now = performance.now();
            if (target === mood) pendingMood = '';
            else if (target === 'loud' || target === 'storm') setMood(target);   // 太吵已經有防抖，立刻反應
            else if (pendingMood !== target) { pendingMood = target; pendingAt = now; }
            else if (now - pendingAt >= MOOD_HOLD_MS) { pendingMood = ''; setMood(target); }
        }
        if (challenge && challenge.state === 'running') {
            $('qc-clock').textContent = fmtTime(challenge.remaining());
            $('qc-clock').classList.toggle('paused', meter.loud.loud && countdown <= 0);
            $('qc-prog').style.width = (challenge.elapsed / challenge.durationMs * 100).toFixed(1) + '%';
            $('qc-noise').textContent = `😵 吵醒 ${challenge.noiseCount} 次`;
            $('qc-streak').textContent = `🏅 最長連續安靜 ${fmtTime(challenge.bestStreak)}`;
            $('qc-status').textContent = countdown > 0 ? '準備好了嗎？'
                : meter.loud.loud ? (challenge.mode === 'reset' ? '🔁 太吵了！從頭開始計時' : '⏸ 太吵了！計時暫停')
                    : '✅ 好安靜，計時進行中';
        }
    }

    // ───────────── 麥克風 ─────────────
    async function startMic(forceCalib) {
        setMsg('');
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setMsg('這個瀏覽器不能使用麥克風。請改用 Chrome 或 Edge，並確認網址是 https 開頭。');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
            const Ctx = window.AudioContext || window.webkitAudioContext;
            const ctx = new Ctx();
            if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* 部分瀏覽器要等下次點擊 */ } }
            if (ctx.state === 'suspended') document.addEventListener('pointerdown', () => { try { ctx.resume(); } catch (e) { /* ignore */ } }, { once: true });
            const src = ctx.createMediaStreamSource(stream);
            const an = ctx.createAnalyser();
            an.fftSize = 2048;
            src.connect(an);   // 不接到喇叭，避免回授
            Object.assign(audio, { stream, ctx, analyser: an, buf: new Float32Array(an.fftSize) });
            meter.level = 0;
            meter.loud = { loud: false, aboveMs: 0, belowMs: 0 };
            meter.last = performance.now();
            audio.timer = setInterval(tick, TICK_MS);
            stream.getAudioTracks().forEach(t => t.addEventListener('ended', () => { stopMic(); setMsg('麥克風被中斷了（可能被拔掉或被其他程式占用），請再按一次開始。'); }));
            if (cfg.animal === 'random') curAnimal = randomAnimal();
            show('qc-meter', true);
            if (forceCalib || cfg.floorDb == null) startCalib(!forceCalib);
            else { renderActions(); setMood('calm', true); }
        } catch (err) {
            const n = err && err.name;
            if (n === 'NotAllowedError' || n === 'SecurityError') setMsg('麥克風被拒絕了。請點網址列左邊的 🔒 圖示，把「麥克風」改成允許，再按一次開始。');
            else if (n === 'NotFoundError' || n === 'OverconstrainedError') setMsg('找不到麥克風。請確認電腦有接麥克風（或筆電內建麥克風沒有被關閉）。');
            else if (n === 'NotReadableError') setMsg('麥克風正被其他程式使用中（例如視訊會議），請先關掉那個程式再試一次。');
            else setMsg('麥克風啟動失敗，請重新整理頁面再試一次。');
        }
    }

    function stopMic() {
        if (audio.timer) clearInterval(audio.timer);
        if (audio.stream) audio.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) { /* ignore */ } });
        if (audio.ctx) { try { audio.ctx.close(); } catch (e) { /* ignore */ } }
        Object.assign(audio, { stream: null, ctx: null, analyser: null, buf: null, timer: null });
        calib = null;
        endChallenge(false);
        meter.level = 0;
        show('qc-meter', false);
        setMood('off', true);
        renderActions();
    }

    function tick() {
        if (!audio.analyser) return;
        const now = performance.now();
        // 分頁在背景時瀏覽器會把計時器放慢到約每秒一次；單次最多算 1.1 秒，
        // 背景時照常計時，電腦睡眠喚醒後也不會一次跳完
        const dt = Math.min(1100, now - meter.last);
        meter.last = now;
        audio.analyser.getFloatTimeDomainData(audio.buf);
        const db = dbFromSamples(audio.buf);
        if (calib) { calibStep(db, dt); return; }
        meter.level = smooth(meter.level, levelFromDb(db, cfg.floorDb == null ? DEFAULT_FLOOR : cfg.floorDb));
        meter.loud = loudStep(meter.loud, meter.level, cfg.threshold, dt);
        if (challenge && challenge.state === 'running') {
            if (countdown > 0) {
                const before = Math.ceil(countdown / 1000);
                countdown -= dt;
                const after = Math.ceil(countdown / 1000);
                const c = $('qc-count');
                if (countdown <= 0) { c.hidden = true; beep(880, 0.18); }
                else if (after !== before) { c.textContent = after; beep(660, 0.1); }
            } else if (challenge.update(dt, meter.loud.loud) === 'done') {
                win();
            }
        }
        paint();
    }

    // ───────────── 自動校正 ─────────────
    function startCalib(auto) {
        endChallenge(false);
        calib = { left: CALIB_MS, dbs: [], auto };
        const c = $('qc-count');
        c.innerHTML = `<div>🎯 3</div><small>${auto ? '第一次使用，先聽聽教室平常的聲音<br>' : ''}請全班先安靜 3 秒～</small>`;
        c.hidden = false;
        setMood('doze', true);
        setMsg('');
        renderActions();
    }

    function calibStep(db, dt) {
        // 麥克風剛啟動時會先送一小段完全無聲的空白資料，不能算進「教室平常的聲音」；
        // 收到真的聲音才開始倒數，等太久都沒聲音就請老師檢查麥克風
        calib.waited = (calib.waited || 0) + dt;
        if (db < -140) {
            if (calib.waited > CALIB_WAIT_MS) {
                calib = null;
                show('qc-count', false);
                setMsg('麥克風沒有收到聲音，沒辦法校正。請確認麥克風沒有被靜音、選對裝置，再按一次「🎯 自動校正」。');
                renderActions();
                setMood('calm', true);
            }
            return;
        }
        calib.dbs.push(db);
        const before = Math.ceil(calib.left / 1000);
        calib.left -= dt;
        const after = Math.ceil(calib.left / 1000);
        if (calib.left > 0) {
            if (after !== before) { const d = $('qc-count').querySelector('div'); if (d) d.textContent = '🎯 ' + after; }
            return;
        }
        cfg.floorDb = floorFromDbs(calib.dbs);
        cfg.calibAt = Date.now();
        cfg.threshold = DEFAULT_TH;
        lsSet(K_CFG, cfg);
        calib = null;
        meter.level = BASE_LEVEL;
        meter.loud = { loud: false, aboveMs: 0, belowMs: 0 };
        $('qc-th').value = cfg.threshold;
        $('qc-th-val').textContent = cfg.threshold;
        updateThresholdLine();
        renderCalibInfo();
        show('qc-count', false);
        setMsg(`🎯 校正完成！教室平常的聲音現在大約是 ${BASE_LEVEL}，太吵的界線設為 ${DEFAULT_TH}。覺得太敏感就把界線往右調一點。`, true);
        renderActions();
        setMood('calm', true);
    }

    // ───────────── 挑戰流程 ─────────────
    function startChallenge() {
        if (cfg.animal === 'random') curAnimal = randomAnimal();
        challenge = createChallenge(cfg.minutes * 60 * 1000, cfg.mode);
        awarded = false;
        countdown = 3000;
        const c = $('qc-count');
        c.textContent = '3';
        c.hidden = false;
        beep(660, 0.1);
        show('qc-win', false);
        show('qc-play', true);
        setMsg('');
        renderActions();
        setMood('calm', true);
        paint();
    }

    function endChallenge(record) {
        if (challenge && record && challenge.state === 'running' && challenge.elapsed >= 10000) {
            addLog({ t: Date.now(), min: cfg.minutes, ok: false, noise: challenge.noiseCount, mode: challenge.mode });
            renderLog();
        }
        challenge = null;
        countdown = 0;
        if (!calib) show('qc-count', false);
        show('qc-play', false);
        show('qc-win', false);
        syncSeg();
    }

    function win() {
        addLog({ t: Date.now(), min: cfg.minutes, ok: true, noise: challenge.noiseCount, mode: challenge.mode });
        renderLog();
        show('qc-play', false);
        const w = $('qc-win');
        const praise = challenge.noiseCount === 0 ? `一次都沒吵醒${ANIMALS[curAnimal].name}，太厲害了！` : `中間吵醒 ${challenge.noiseCount} 次，還是撐到最後！`;
        w.innerHTML = `<h3>🏆 挑戰成功！</h3><p>全班安靜了 ${cfg.minutes} 分鐘，${esc(praise)}</p>`;
        w.hidden = false;
        setMood('party', true);
        if (cfg.sound) fanfare();
        try { if (typeof window.triggerConfetti === 'function') window.triggerConfetti(); } catch (e) { /* ignore */ }
        renderActions();
    }

    async function award() {
        if (awarded || !challenge || challenge.state !== 'done') return;
        if (typeof window.awardPointsToAll !== 'function' || !(Array.isArray(window.students) && window.students.length)) {
            setMsg('請先到「學生管理」新增學生，才能幫全班加分。');
            return;
        }
        awarded = true;
        renderActions();
        let ok = false;
        try { ok = !!(await window.awardPointsToAll(cfg.reward, `安靜挑戰成功（${cfg.minutes} 分鐘）`)); } catch (e) { console.error('[QuietChallenge] 加分失敗:', e); }
        if (ok) setMsg(`✅ 已幫全班每人加 ${cfg.reward} 分（可到「加扣分」查看或撤銷）`, true);
        else { awarded = false; setMsg('加分沒有成功，請到「加扣分」頁面再試一次。'); }
        renderActions();
    }

    function act(a) {
        if (a === 'mic') startMic(false);
        else if (a === 'micoff') stopMic();
        else if (a === 'calib') { if (challenge || calib) return; if (audio.stream) startCalib(false); else startMic(true); }
        else if (a === 'start' || a === 'again') { endChallenge(false); startChallenge(); }
        else if (a === 'stop') { endChallenge(true); renderActions(); paint(); }
        else if (a === 'close') { endChallenge(false); setMsg(''); renderActions(); setMood('calm', true); paint(); }
        else if (a === 'award') award();
    }

    // ───────────── 聲音 ─────────────
    function beep(freq, dur) {
        if (!cfg.sound || !audio.ctx) return;
        try {
            const ctx = audio.ctx, o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
            o.type = 'sine';
            o.frequency.value = freq;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g).connect(ctx.destination);
            o.start(t);
            o.stop(t + dur + 0.05);
        } catch (e) { /* ignore */ }
    }
    function fanfare() {
        if (!audio.ctx) return;
        try {
            const ctx = audio.ctx, t0 = ctx.currentTime;
            [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
                const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + i * 0.16, d = i === 3 ? 0.9 : 0.3;
                o.type = 'triangle';
                o.frequency.value = f;
                g.gain.setValueAtTime(0.0001, t);
                g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, t + d);
                o.connect(g).connect(ctx.destination);
                o.start(t);
                o.stop(t + d + 0.05);
            });
        } catch (e) { /* ignore */ }
    }

    // ───────────── 全螢幕 ─────────────
    function toggleFs() { if (fsOn) exitFs(); else enterFs(); }
    function enterFs() {
        const st = $('qc-stage');
        if (!st) return;
        fsOn = true;
        st.classList.add('qc-fs');
        $('qc-fs').textContent = '✕ 離開全螢幕';
        try {
            if (st.requestFullscreen) {
                const p = st.requestFullscreen();
                if (p && typeof p.catch === 'function') p.catch(function () { /* 被拒時仍以滿版 overlay 顯示 */ });
            }
        } catch (e) { /* ignore */ }
    }
    function exitFs() {
        const st = $('qc-stage');
        fsOn = false;
        if (st) st.classList.remove('qc-fs');
        const b = $('qc-fs');
        if (b) b.textContent = '⛶ 全螢幕投影';
        try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* ignore */ }
    }

    // ───────────── 對外 API ─────────────
    const api = {
        init() {
            injectCSS();
            cfg = loadCfg();
            // 每次進入本頁換一隻小幫手（麥克風開著時不換，避免偵測中突然變角色）
            if (!audio.stream) curAnimal = cfg.animal === 'random' ? randomAnimal() : cfg.animal;
            const fresh = !($('qc-root') && $('qc-root').dataset.ready);
            render();
            if (!fresh) { syncSeg(); setMood(mood || 'off', true); }
            renderLog();
            renderActions();
            renderCalibInfo();
        },
        /** 離開本頁：關閉麥克風、結束挑戰（未完成的會記一筆）。 */
        suspend() {
            if (fsOn) exitFs();
            if (challenge && challenge.state === 'running') endChallenge(true);
            if (audio.stream) stopMic();
        },
        /** 挑戰或偵測進行中：自動更新、同步提醒不要打斷。 */
        isActive() { return !!audio.stream; }
    };
    window.QuietChallenge = api;
})();
