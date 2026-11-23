// 安靜挑戰純邏輯測試：音量換算、太吵判定、計時狀態機
const assert = require('node:assert/strict');
const qc = require('../js/quiet-challenge.js');

// 音量換算：dBFS 單調遞增；校正後平常的聲音落在 25、界線 50 約比平常大 12.5 分貝
const tone = amp => Float32Array.from({ length: 1024 }, (_, i) => amp * Math.sin(i / 5));
assert.ok(qc.dbFromSamples(new Float32Array(1024)) < -150, '完全無聲應極小');
assert.ok(qc.dbFromSamples(tone(0.01)) < qc.dbFromSamples(tone(0.1)), '大聲的分貝要比小聲高');
assert.equal(qc.levelFromDb(-60, -60), 0);
assert.equal(qc.levelFromDb(0, -60), 100, '超過範圍封頂 100');
// 老師的麥克風很靈敏：安靜教室就有 -22 dBFS，舊算法約 80，要拉界線到近 90
const hotQuiet = Array.from({ length: 60 }, () => -22);
hotQuiet[10] = -3; hotQuiet[11] = -4;   // 校正時有人咳了一下
const floor = qc.floorFromDbs(hotQuiet);
assert.ok(Math.abs(qc.levelFromDb(-22, floor) - qc.BASE_LEVEL) < 3, '校正後平常的聲音約 25（咳嗽不影響中位數）');
assert.ok(qc.levelFromDb(-22 + 12, floor) >= qc.DEFAULT_TH - 1, '比平常大 12 分貝左右才到界線');
assert.ok(qc.levelFromDb(-22 + 4, floor) < qc.DEFAULT_TH, '小小聲講話不會過界線');
assert.equal(qc.floorFromDbs([-160, -160, -160]), qc.DEFAULT_FLOOR, '只有空白資料時用預設值');
assert.equal(qc.floorFromDbs([-160, -160, -160, -160, -22, -22, -22]), -22 - 12.5, '麥克風剛啟動的空白資料不算進中位數');
assert.equal(qc.floorFromDbs([-130, -130, -130]), -95, '極安靜時下限保護');
assert.equal(qc.floorFromDbs([]), qc.DEFAULT_FLOOR, '沒有取樣用預設值');

// 一聲短促的咳嗽（< 300ms）不算太吵；持續吵才算；回到安靜要 700ms 才解除
let st = { loud: false, aboveMs: 0, belowMs: 0 };
for (let t = 0; t < 250; t += 50) st = qc.loudStep(st, 80, 45, 50);
assert.equal(st.loud, false, '短暫聲響不算太吵');
st = qc.loudStep(st, 30, 45, 50);
for (let t = 0; t < 350; t += 50) st = qc.loudStep(st, 80, 45, 50);
assert.equal(st.loud, true, '持續超過界線算太吵');
for (let t = 0; t < 600; t += 50) st = qc.loudStep(st, 30, 45, 50);
assert.equal(st.loud, true, '剛安靜下來還不解除（遲滯）');
for (let t = 0; t < 200; t += 50) st = qc.loudStep(st, 30, 45, 50);
assert.equal(st.loud, false, '安靜夠久就解除');

// 暫停模式：太吵不計時、吵醒次數只在轉為太吵時加一
let c = qc.createChallenge(10000, 'pause');
c.update(4000, false);
c.update(1000, true);
c.update(1000, true);
assert.equal(c.elapsed, 4000, '太吵期間不計時');
assert.equal(c.noiseCount, 1, '連續太吵只算一次');
c.update(5999, false);
assert.equal(c.state, 'running');
assert.equal(c.bestStreak, 5999, '記錄最長連續安靜');
c.update(10, false);
assert.equal(c.state, 'done', '累積安靜達標即成功');
assert.equal(c.remaining(), 0);
c.update(1000, true);
assert.equal(c.noiseCount, 1, '成功後不再變動');

// 嚴格模式：一吵就歸零
c = qc.createChallenge(10000, 'reset');
c.update(8000, false);
c.update(100, true);
assert.equal(c.elapsed, 0, '嚴格模式太吵從頭開始');
c.update(500, false);
c.update(100, true);
assert.equal(c.noiseCount, 2);

// 心情：熟睡 → 打瞌睡 → 清醒 → 警覺 → 太吵 → 超級吵
assert.equal(qc.moodOf(20, 50, false), 'sleep');
assert.equal(qc.moodOf(30, 50, false), 'doze');
assert.equal(qc.moodOf(38, 50, false), 'calm');
assert.equal(qc.moodOf(45, 50, false), 'warn');
assert.equal(qc.moodOf(20, 50, true), 'loud', '判定太吵優先');
assert.equal(qc.moodOf(75, 50, true), 'storm', '超過界線很多是超級吵');
assert.equal(qc.moodOf(97, 90, true), 'loud', '界線很高時超級吵要到 98 以上');
assert.equal(qc.fmtTime(180000), '03:00');
assert.equal(qc.fmtTime(59001), '01:00', '不足一秒進位顯示');

// v3.69.0 Blender 3D 小幫手：每種心情都有動作時間表、格子編號不超出、動作圖檔案齊全且是 WebP
const fs = require('node:fs'), path = require('node:path');
const moods = ['off', 'sleep', 'doze', 'calm', 'warn', 'loud', 'storm', 'party'];
for (const m of moods) {
    const plan = qc.SPRITE_PLAN[m], n = qc.SPRITE_FRAMES[m];
    assert.ok(plan && plan.length && n >= 2, `${m} 要有動作時間表`);
    for (const [f, ms] of plan) {
        assert.ok(Number.isInteger(f) && f >= 0 && f < n, `${m} 的格子 ${f} 超出 ${n} 格`);
        assert.ok(ms >= 100 && ms <= 3000, `${m} 每格停留時間合理`);
    }
    assert.equal(new Set(plan.map(p => p[0])).size, n, `${m} 每一格都要用到`);
    for (const a of qc.SPRITE_ANIMALS) {
        const file = path.join(__dirname, '..', 'assets', 'quiet-mascot', `${a}-${m}.webp`);
        const buf = fs.readFileSync(file);
        assert.equal(buf.toString('ascii', 8, 12), 'WEBP', `${a}-${m} 要是 WebP`);
        assert.ok(buf.length < 160 * 1024, `${a}-${m} 檔案不要太大（${buf.length}）`);
    }
}
assert.deepEqual(Object.keys(qc.SPRITE_FRAMES).sort(), [...moods].sort(), '動作圖心情與小幫手心情一致');

console.log('✅ 安靜挑戰邏輯測試全部通過');

// ───────────────────────────────────────────────────────────
// 麥克風「等待授權中」防重複（startMic 的 micPending／micRequest）
// 舊版：瀏覽器跳出授權視窗、老師還沒按允許時，按鈕沒有消失也沒有 disabled，再按一次就要第二支麥克風；
//       第一支串流永遠沒人關（stopMic 只關得到第二支），而且第一個 50ms 計時器停不掉。
//       等待中離開本頁（suspend）也一樣：晚到的串流會留下計時器與 AudioContext，離開後仍在收音。
// 這一段載入真正的 js/quiet-challenge.js，放進假 DOM、假麥克風（getUserMedia 由測試手動 resolve）。
// ───────────────────────────────────────────────────────────
const vm = require('node:vm');

function micEnv() {
    const timers = new Map(); let seq = 0;
    const registry = {};
    function el(id) {
        if (registry[id]) return registry[id];
        const e = registry[id] = {
            id, value: '', textContent: '', className: '', style: {}, dataset: {}, hidden: false, children: [], __l: {}, innerHTML: '',
            addEventListener(t, f) { (e.__l[t] = e.__l[t] || []).push(f); }, removeEventListener() {},
            appendChild(c) { e.children.push(c); return c; }, append() {}, replaceChildren() {}, insertAdjacentElement(_, c) { return c; },
            setAttribute() {}, toggleAttribute() {}, querySelector: sel => el(sel), querySelectorAll: () => [], closest: () => null,
            remove() {}, focus() {}, parentElement: null, parentNode: { appendChild() {}, insertBefore() {} },
        };
        e.classList = { _s: new Set(), add(...c) { c.forEach(x => this._s.add(x)); }, remove(...c) { c.forEach(x => this._s.delete(x)); }, contains(c) { return this._s.has(c); }, toggle(c, f) { if (f === undefined ? !this._s.has(c) : f) this._s.add(c); else this._s.delete(c); } };
        return e;
    }
    const gum = [];            // 每次 getUserMedia：{ stream, resolve, reject }
    const ctxs = [];
    const sb = {
        console, Date, Math, Number, String, Array, Object, Set, Map, JSON, Promise, URL, parseInt, isNaN, Error, Float32Array,
        performance: { now: () => Date.now() },
        setInterval: (fn, ms) => { const id = ++seq; timers.set(id, { fn, ms }); return id; },
        clearInterval: id => timers.delete(id),
        setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { fn, ms, once: true }); return id; },
        clearTimeout: id => timers.delete(id),
        requestIdleCallback: f => f(), Image: class { set src(v) {} },
        localStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
        document: {
            getElementById: id => el(id), createElement: () => el('x' + Math.random()), querySelector: () => null, querySelectorAll: () => [],
            addEventListener() {}, body: el('body'), head: el('head'), documentElement: el('html'), readyState: 'complete', hidden: false, currentScript: null,
        },
        addEventListener() {}, matchMedia: () => ({ matches: false }), location: { origin: 'http://x', search: '' },
        navigator: {
            mediaDevices: {
                getUserMedia: () => new Promise((resolve, reject) => {
                    const tracks = [{ stopped: false, stop() { this.stopped = true; }, addEventListener() {} }];
                    const stream = { tracks, getTracks: () => tracks, getAudioTracks: () => tracks };
                    gum.push({ stream, resolve: () => resolve(stream), reject: err => reject(err) });
                }),
            },
        },
        AudioContext: class {
            constructor() { this.state = 'running'; this.destination = {}; this.closed = false; ctxs.push(this); }
            resume() { return Promise.resolve(); } close() { this.closed = true; }
            createMediaStreamSource() { return { connect() {} }; }
            createAnalyser() { return { fftSize: 0, connect() {}, getFloatTimeDomainData(b) { b.fill(0.01); } }; }
        },
    };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'quiet-challenge.js'), 'utf8'), sb);
    sb.QuietChallenge.init();
    const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };
    const press = act => el('qc-actions').__l.click[0]({ target: { closest: () => ({ dataset: { act }, disabled: false }) } });   // 老師按按鈕
    return {
        sb, gum, ctxs, el, flush, press,
        scanTimers: () => [...timers.values()].filter(t => t.ms === 50).length,
        liveStreams: () => gum.filter(g => g.stream.tracks.some(t => !t.stopped)).length,
        actionsHtml: () => el('qc-actions').innerHTML,
    };
}

(async () => {
    let n = 0;
    const t = async (name, fn) => { await fn(); console.log('PASS', name); n++; };

    await t('等授權時再按一次開始：只會要一支麥克風（舊版要 2 支）', async () => {
        const e = micEnv();
        e.press('mic');
        e.press('mic');                  // 按鈕在舊版沒有消失也沒有 disabled
        assert.equal(e.gum.length, 1, 'getUserMedia 只能被呼叫 1 次');
        e.gum[0].resolve(); await e.flush();
        assert.equal(e.gum.length, 1);
        assert.equal(e.ctxs.length, 1, '只建一個 AudioContext');
        assert.equal(e.scanTimers(), 1, '偵測計時器只有 1 個');
        assert.equal(e.sb.QuietChallenge.isActive(), true);
        e.press('mic');                  // 已經在收音，再按也不會再要
        assert.equal(e.gum.length, 1);
    });

    await t('等待中按鈕顯示「等待麥克風授權……」且 disabled，拿到麥克風後恢復', async () => {
        const e = micEnv();
        assert.match(e.actionsHtml(), /data-act="mic"/);
        e.press('mic');
        const waiting = e.actionsHtml();
        assert.match(waiting, /等待麥克風授權……/);
        assert.match(waiting, /disabled/);
        assert.doesNotMatch(waiting, /data-act="mic"/, '等待中不該再有可按的「開始」按鈕');
        e.gum[0].resolve(); await e.flush();
        assert.doesNotMatch(e.actionsHtml(), /等待麥克風授權/);
    });

    await t('等授權時呼叫 suspend()：晚到的串流立刻 track.stop()，不留計時器與 AudioContext（舊版離開後仍在收音）', async () => {
        const e = micEnv();
        e.press('mic');
        e.sb.QuietChallenge.suspend();   // 老師切到別的功能頁
        assert.match(e.actionsHtml(), /data-act="mic"/, '離開後按鈕恢復成「開始偵測」');
        e.gum[0].resolve(); await e.flush();
        assert.equal(e.liveStreams(), 0, '晚到的麥克風必須被關掉');
        assert.equal(e.gum[0].stream.tracks[0].stopped, true);
        assert.equal(e.scanTimers(), 0, '不能留下 50ms 計時器');
        assert.equal(e.ctxs.length, 0, '不能建立 AudioContext');
        assert.equal(e.sb.QuietChallenge.isActive(), false);
        assert.doesNotMatch(e.actionsHtml(), /等待麥克風授權/);
    });

    await t('等授權時按「關閉麥克風」（stopMic）：同樣關掉晚到的串流', async () => {
        const e = micEnv();
        e.press('mic');
        e.press('micoff');
        e.gum[0].resolve(); await e.flush();
        assert.equal(e.liveStreams(), 0);
        assert.equal(e.scanTimers(), 0);
        assert.equal(e.ctxs.length, 0);
    });

    await t('取消後可以重新開始：新的請求正常取得麥克風，作廢的舊請求不影響它', async () => {
        const e = micEnv();
        e.press('mic'); e.sb.QuietChallenge.suspend();
        e.press('mic');
        assert.equal(e.gum.length, 2, '取消後再按一次要重新要麥克風');
        e.gum[0].resolve(); await e.flush();         // 舊請求先到：被關掉，不能拆掉新請求的等待狀態
        assert.equal(e.gum[0].stream.tracks[0].stopped, true);
        assert.match(e.actionsHtml(), /等待麥克風授權/, '新請求還在等，按鈕仍是等待中');
        e.gum[1].resolve(); await e.flush();
        assert.equal(e.gum[1].stream.tracks[0].stopped, false, '新請求的串流保留');
        assert.equal(e.scanTimers(), 1);
        assert.equal(e.ctxs.length, 1);
        e.sb.QuietChallenge.suspend();
        assert.equal(e.liveStreams(), 0);
        assert.equal(e.scanTimers(), 0);
        assert.equal(e.ctxs[0].closed, true);
    });

    await t('已取消的請求後來才被拒絕：不跳出錯誤訊息；沒取消時被拒絕才顯示', async () => {
        const e = micEnv();
        e.press('mic'); e.sb.QuietChallenge.suspend();
        e.gum[0].reject({ name: 'NotAllowedError' }); await e.flush();
        assert.equal(e.el('qc-msg').textContent, '');
        const f = micEnv();
        f.press('mic');
        f.gum[0].reject({ name: 'NotAllowedError' }); await f.flush();
        assert.match(f.el('qc-msg').textContent, /麥克風被拒絕/);
        assert.match(f.actionsHtml(), /data-act="mic"/, '被拒絕後按鈕要恢復，才能再試');
    });

    console.log(`${n} quiet-challenge mic-pending checks passed`);
})().catch(err => { console.error(err); process.exit(1); });
