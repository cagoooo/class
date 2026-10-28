/**
 * quiet-challenge.js
 * 🤫 安靜挑戰 —— 用麥克風看全班音量，安靜才會計時
 * @version 3.57.0
 *
 * 需求：
 *   - 麥克風即時音量（相對音量 0～100，不是精確分貝），聲音只在這台裝置分析，不錄音、不上傳
 *   - 小貓頭鷹「噓噓」依音量換表情：很安靜睡著、太吵摀耳朵
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

    /** 時域取樣 → 相對音量 0～100（-70 dBFS 視為 0、-10 dBFS 視為 100）。 */
    function levelFromSamples(buf) {
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / (buf.length || 1));
        const db = 20 * Math.log10(Math.max(rms, 1e-8));
        return Math.max(0, Math.min(100, (db + 70) / 60 * 100));
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

    /** 依音量與界線決定小貓頭鷹的心情。 */
    function moodOf(level, threshold, loud) {
        if (loud) return 'loud';
        if (level >= threshold * 0.8) return 'warn';
        if (level < threshold * 0.5) return 'sleep';
        return 'calm';
    }

    const pure = { levelFromSamples, smooth, loudStep, createChallenge, fmtTime, moodOf, LOUD_HOLD_MS, CALM_HOLD_MS };
    if (typeof module !== 'undefined' && module.exports) module.exports = pure;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // ───────────── 設定與紀錄 ─────────────
    const K_CFG = 'quietChallengeCfg';   // 每台裝置自己的設定（每間教室背景聲不同）
    const K_LOG = 'quietChallengeLog';   // 挑戰紀錄，依班級隔離
    const MINUTES = [1, 2, 3, 5, 10];
    const DEFAULT_CFG = { threshold: 45, minutes: 3, mode: 'pause', sound: true, reward: 1 };
    const TICK_MS = 50;

    const MOODS = {
        sleep: { face: '😴', text: '好安靜～我睡著了', cls: 'qc-sleep' },
        calm: { face: '🦉', text: '很安靜，繼續保持！', cls: 'qc-calm' },
        warn: { face: '😯', text: '有點聲音囉……', cls: 'qc-warn' },
        loud: { face: '🙉', text: '好吵！耳朵受不了了！', cls: 'qc-loud' },
        off: { face: '🦉', text: '我是噓噓，按下開始讓我聽聽教室', cls: 'qc-off' }
    };

    function lsGet(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
    function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 存不了不影響使用 */ } }
    function loadCfg() {
        const c = Object.assign({}, DEFAULT_CFG, lsGet(K_CFG, {}));
        c.threshold = Math.max(10, Math.min(95, Number(c.threshold) || DEFAULT_CFG.threshold));
        if (!MINUTES.includes(Number(c.minutes))) c.minutes = DEFAULT_CFG.minutes;
        c.reward = Math.max(1, Math.min(5, parseInt(c.reward, 10) || 1));
        return c;
    }
    function loadLog() { const l = lsGet(K_LOG, []); return Array.isArray(l) ? l : []; }
    function addLog(entry) { const l = loadLog(); l.unshift(entry); lsSet(K_LOG, l.slice(0, 30)); }

    let cfg = loadCfg();
    const audio = { stream: null, ctx: null, analyser: null, buf: null, timer: null };
    const meter = { level: 0, loud: { loud: false, aboveMs: 0, belowMs: 0 }, last: 0 };
    let challenge = null;      // createChallenge() 物件
    let countdown = 0;         // 開始前 3、2、1 倒數（毫秒）
    let awarded = false;
    let lastMood = '';
    let fsOn = false;

    const $ = id => document.getElementById(id);
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
        /* 舞台 */
        .qc-stage{position:relative;border-radius:1.5rem;padding:clamp(16px,3vw,32px);min-height:460px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.9rem;
            transition:background .6s ease,color .4s ease;overflow:hidden;text-align:center;color:#1e293b}
        .qc-stage.qc-off{background:linear-gradient(160deg,#eef2ff,#e0f2fe)}
        .qc-stage.qc-sleep{background:linear-gradient(160deg,#1e1b4b,#312e81 60%,#1e3a8a);color:#e0e7ff}
        .qc-stage.qc-calm{background:linear-gradient(160deg,#dcfce7,#bbf7d0)}
        .qc-stage.qc-warn{background:linear-gradient(160deg,#fef9c3,#fde68a)}
        .qc-stage.qc-loud{background:linear-gradient(160deg,#fee2e2,#fca5a5)}
        .qc-stars{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .8s}
        .qc-sleep .qc-stars{opacity:1}
        .qc-stars span{position:absolute;color:#fde68a;animation:qc-twinkle 2.4s ease-in-out infinite}
        @keyframes qc-twinkle{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}
        .qc-face{font-size:clamp(90px,16vw,170px);line-height:1;position:relative;user-select:none;filter:drop-shadow(0 8px 14px rgba(0,0,0,.15))}
        .qc-loud .qc-face{animation:qc-shake .35s linear infinite}
        .qc-sleep .qc-face{animation:qc-breathe 3.2s ease-in-out infinite}
        @keyframes qc-shake{0%,100%{transform:translateX(0) rotate(0)}25%{transform:translateX(-8px) rotate(-6deg)}75%{transform:translateX(8px) rotate(6deg)}}
        @keyframes qc-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
        .qc-zzz{position:absolute;right:-.35em;top:-.2em;font-size:.32em;font-weight:900;color:#c7d2fe;opacity:0}
        .qc-sleep .qc-zzz{animation:qc-zzz 2.6s ease-in-out infinite}
        @keyframes qc-zzz{0%{opacity:0;transform:translate(0,10px)}30%{opacity:1}100%{opacity:0;transform:translate(16px,-28px)}}
        .qc-say{font-size:clamp(20px,2.8vw,30px);font-weight:900;min-height:1.4em}
        .qc-meter{width:min(100%,720px)}
        .qc-bar{position:relative;height:30px;border-radius:999px;background:rgba(255,255,255,.65);box-shadow:inset 0 2px 6px rgba(0,0,0,.12);overflow:visible}
        .qc-sleep .qc-bar{background:rgba(255,255,255,.18)}
        .qc-fill{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:linear-gradient(90deg,#22c55e,#84cc16);transition:width .08s linear,background .3s;width:0}
        .qc-fill.over{background:linear-gradient(90deg,#f97316,#ef4444)}
        .qc-line{position:absolute;top:-8px;bottom:-8px;width:4px;margin-left:-2px;background:#ef4444;border-radius:2px}
        .qc-line::after{content:'太吵';position:absolute;top:-22px;left:50%;transform:translateX(-50%);font-size:12px;font-weight:900;color:#ef4444;white-space:nowrap}
        .qc-sleep .qc-line::after{color:#fca5a5}
        .qc-num{display:flex;justify-content:space-between;font-size:14px;font-weight:700;margin-top:.35rem;opacity:.85}
        .qc-clock{font-size:clamp(64px,13vw,150px);font-weight:900;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:.02em}
        .qc-clock.paused{animation:qc-blink 1s steps(2) infinite}
        @keyframes qc-blink{50%{opacity:.35}}
        .qc-prog{width:min(100%,720px);height:14px;border-radius:999px;background:rgba(255,255,255,.55);overflow:hidden}
        .qc-sleep .qc-prog{background:rgba(255,255,255,.18)}
        .qc-prog > div{height:100%;width:0;background:linear-gradient(90deg,#6366f1,#a855f7);border-radius:999px;transition:width .2s linear}
        .qc-status{font-size:clamp(18px,2.4vw,26px);font-weight:900}
        .qc-chips{display:flex;gap:.6rem;flex-wrap:wrap;justify-content:center;font-size:15px;font-weight:700}
        .qc-chip{background:rgba(255,255,255,.7);color:#334155;border-radius:999px;padding:.25rem .8rem}
        .qc-sleep .qc-chip{background:rgba(255,255,255,.15);color:#e0e7ff}
        .qc-actions{display:flex;gap:.6rem;flex-wrap:wrap;justify-content:center}
        .qc-btn{border:0;border-radius:999px;padding:.7rem 1.4rem;font-size:18px;font-weight:900;cursor:pointer;transition:transform .15s,box-shadow .15s;box-shadow:0 4px 12px rgba(0,0,0,.12)}
        .qc-btn:hover{transform:translateY(-2px)}
        .qc-btn:active{transform:scale(.96)}
        .qc-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
        .qc-btn-main{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff}
        .qc-btn-go{background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff}
        .qc-btn-soft{background:#fff;color:#4338ca}
        .qc-btn-gift{background:linear-gradient(135deg,#f59e0b,#f97316);color:#fff}
        .qc-btn-big{font-size:clamp(20px,2.6vw,26px);padding:.9rem 2rem}
        .qc-count{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:clamp(120px,24vw,260px);font-weight:900;color:#4338ca;background:rgba(255,255,255,.55);backdrop-filter:blur(2px);z-index:3}
        .qc-win{display:flex;flex-direction:column;align-items:center;gap:.6rem}
        .qc-win h3{font-size:clamp(34px,6vw,64px);font-weight:900;color:#b45309}
        .qc-win p{font-size:clamp(18px,2.4vw,24px);font-weight:700}
        .qc-msg{font-size:15px;font-weight:700;color:#b91c1c;background:#fff;border-radius:1rem;padding:.6rem 1rem;max-width:560px;line-height:1.6}
        .qc-ok{color:#15803d}
        .qc-fsbtn{position:absolute;top:12px;right:12px;z-index:4;border:0;background:rgba(255,255,255,.75);color:#334155;border-radius:999px;padding:.4rem .9rem;font-weight:800;cursor:pointer;font-size:14px}
        .qc-sleep .qc-fsbtn{background:rgba(255,255,255,.18);color:#e0e7ff}
        /* 全螢幕投影 */
        .qc-stage.qc-fs{position:fixed;inset:0;z-index:2147483000;border-radius:0;min-height:100vh;padding:4vh 4vw}
        .qc-stage.qc-fs .qc-face{font-size:min(28vh,24vw)}
        .qc-stage.qc-fs .qc-clock{font-size:min(22vh,18vw)}
        .qc-stage.qc-fs .qc-say{font-size:min(5vh,4.4vw)}
        .qc-stage.qc-fs .qc-meter,.qc-stage.qc-fs .qc-prog{width:min(86vw,1400px)}
        .qc-stage.qc-fs .qc-bar{height:min(5vh,44px)}
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
        .dark .qc-log li{background:#0f172a;color:#e2e8f0}
        .dark .qc-best{color:#fbbf24}
        @media (prefers-reduced-motion: reduce){.qc-face,.qc-zzz,.qc-stars span,.qc-clock.paused{animation:none!important}}
        `;
        const s = document.createElement('style');
        s.id = 'quiet-challenge-style';
        s.textContent = css;
        document.head.appendChild(s);
    }

    // ───────────── 畫面 ─────────────
    function stars() {
        let h = '';
        for (let i = 0; i < 14; i++) {
            const x = (i * 37 + 11) % 96, y = (i * 53 + 7) % 90, d = (i % 5) * 0.45, z = 10 + (i % 3) * 6;
            h += `<span style="left:${x}%;top:${y}%;font-size:${z}px;animation-delay:${d}s">✦</span>`;
        }
        return h;
    }

    function render() {
        const root = $('qc-root');
        if (!root || root.dataset.ready) return;
        root.dataset.ready = '1';
        root.innerHTML = `
        <div class="qc-wrap">
            <div class="qc-head">
                <h2>🤫 安靜挑戰 <span class="qc-privacy">🔒 聲音只在這台裝置即時分析，不錄音、不上傳</span></h2>
                <p>用麥克風看全班音量。太吵時噓噓會摀住耳朵，夠安靜就睡著；挑戰期間要安靜才會計時！</p>
            </div>
            <div class="qc-grid">
                <div class="qc-stage qc-off" id="qc-stage" aria-live="polite">
                    <div class="qc-stars">${stars()}</div>
                    <button class="qc-fsbtn" id="qc-fs" title="全螢幕投影（ESC 離開）">⛶ 全螢幕投影</button>
                    <div class="qc-face" id="qc-face" aria-hidden="true">🦉<span class="qc-zzz">Z z z</span></div>
                    <div class="qc-say" id="qc-say">${MOODS.off.text}</div>
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
                        <input type="range" class="qc-range" id="qc-th" min="10" max="95" step="1" value="${cfg.threshold}" aria-label="太吵的界線">
                        <div class="hint">教室本來就有點吵？把界線往右調。先開麥克風聽幾秒，再調到剛好的位置。數值是相對音量，不是精確分貝。</div>
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
        renderActions();
        renderLog();
        updateThresholdLine();
    }

    function wire() {
        $('qc-th').addEventListener('input', e => {
            cfg.threshold = Number(e.target.value);
            $('qc-th-val').textContent = cfg.threshold;
            updateThresholdLine();
            lsSet(K_CFG, cfg);
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

    function syncSeg() {
        const lock = !!challenge;
        document.querySelectorAll('#qc-min [data-min]').forEach(b => { b.setAttribute('aria-pressed', String(Number(b.dataset.min) === cfg.minutes)); b.disabled = lock; });
        document.querySelectorAll('#qc-mode [data-mode]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.mode === cfg.mode)); b.disabled = lock; });
    }

    function updateThresholdLine() {
        const l = $('qc-line');
        if (l) l.style.left = cfg.threshold + '%';
    }

    function show(id, on) { const e = $(id); if (e) e.hidden = !on; }

    function renderActions() {
        const box = $('qc-actions');
        if (!box) return;
        const btn = (act, cls, label, dis) => `<button type="button" class="qc-btn ${cls}" data-act="${act}" ${dis ? 'disabled' : ''}>${label}</button>`;
        let h = '';
        if (!audio.stream) {
            h = btn('mic', 'qc-btn-main qc-btn-big', '🎤 開始偵測音量');
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

    function setMood(key) {
        if (key === lastMood) return;
        lastMood = key;
        const m = MOODS[key];
        const st = $('qc-stage');
        if (!st) return;
        Object.values(MOODS).forEach(x => st.classList.remove(x.cls));
        st.classList.add(m.cls);
        $('qc-face').firstChild.nodeValue = m.face;
        if (!challenge || challenge.state !== 'done') $('qc-say').textContent = m.text;
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
        if (!challenge || challenge.state !== 'done') setMood(moodOf(meter.level, cfg.threshold, meter.loud.loud));
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
    async function startMic() {
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
            show('qc-meter', true);
            renderActions();
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
        endChallenge(false);
        meter.level = 0;
        show('qc-meter', false);
        lastMood = '';
        setMood('off');
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
        meter.level = smooth(meter.level, levelFromSamples(audio.buf));
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

    // ───────────── 挑戰流程 ─────────────
    function startChallenge() {
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
        syncSeg();
        renderActions();
        paint();
    }

    function endChallenge(record) {
        if (challenge && record && challenge.state === 'running' && challenge.elapsed >= 10000) {
            addLog({ t: Date.now(), min: cfg.minutes, ok: false, noise: challenge.noiseCount, mode: challenge.mode });
            renderLog();
        }
        challenge = null;
        countdown = 0;
        show('qc-count', false);
        show('qc-play', false);
        show('qc-win', false);
        syncSeg();
    }

    function win() {
        addLog({ t: Date.now(), min: cfg.minutes, ok: true, noise: challenge.noiseCount, mode: challenge.mode });
        renderLog();
        show('qc-play', false);
        const w = $('qc-win');
        const praise = challenge.noiseCount === 0 ? '一次都沒吵醒噓噓，太厲害了！' : `中間吵醒 ${challenge.noiseCount} 次，還是撐到最後！`;
        w.innerHTML = `<h3>🏆 挑戰成功！</h3><p>全班安靜了 ${cfg.minutes} 分鐘，${esc(praise)}</p>`;
        w.hidden = false;
        $('qc-say').textContent = '謝謝大家，我睡得好飽 😊';
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
        if (a === 'mic') startMic();
        else if (a === 'micoff') stopMic();
        else if (a === 'start' || a === 'again') { endChallenge(false); startChallenge(); }
        else if (a === 'stop') { endChallenge(true); lastMood = ''; renderActions(); paint(); }
        else if (a === 'close') { endChallenge(false); setMsg(''); lastMood = ''; renderActions(); paint(); }
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
            render();
            renderLog();
            renderActions();
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
