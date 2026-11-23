// 考試鈴聲（js/exam-sounds.js + js/exam-proctor.js）
// 舊版：exam-sounds.js 去包「window.updateFullscreenStatus」，但那個函式從來沒掛到 window，
//       所以開始鈴、結束鈴、靜音按鈕全部沒作用；鈴聲鍵只用科目編號，多日考試第二天第一科被吃掉；
//       下課倒數顯示用 60 - 秒數，會出現 05:60、05:50（比實際多一秒）。
// 新版：靜音按鈕由 attachToggle 放進控制列；exam-proctor 每秒呼叫 ringExamSounds 判斷狀態轉換。
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');

let passed = 0;
function test(name, fn) { fn(); console.log('PASS', name); passed++; }

/** 用大括號配對從原始碼抓出一段完整的 function（或物件）。 */
function grab(src, signature) {
    const start = src.indexOf(signature);
    assert.ok(start >= 0, '找不到 ' + signature);
    let depth = 0, i = src.indexOf('{', start);
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) break;
    }
    return src.slice(start, i + 1);
}

const SOUNDS_SRC = fs.readFileSync('js/exam-sounds.js', 'utf8');
const PROCTOR_SRC = fs.readFileSync('js/exam-proctor.js', 'utf8');

// ───────── exam-sounds.js 環境 ─────────
function soundsEnv(opts = {}) {
    let nowMs = new Date(2026, 10, 24, 9, 0, 0).getTime();
    class FakeDate extends Date {
        constructor(...a) { if (a.length) super(...a); else super(nowMs); }
        static now() { return nowMs; }
    }
    const byId = new Map(), domListeners = {};
    function el(tag) {
        const e = {
            tag, children: [], style: {}, attrs: {}, textContent: '', title: '', id: '', className: '',
            appendChild(c) { this.children.push(c); if (c.id) byId.set(c.id, c); return c; },
            setAttribute(k, v) { this.attrs[k] = v; },
        };
        return e;
    }
    const controls = el('div');
    const doc = {
        readyState: opts.readyState || 'complete',
        querySelector: sel => (sel === '.exam-fullscreen-controls' && !opts.noControls ? controls : null),
        querySelectorAll: sel => (sel === '.exam-sound-toggle-btn' ? controls.children.filter(c => /exam-sound-toggle-btn/.test(c.className)) : []),
        getElementById: id => byId.get(id) || null,
        createElement: el,
        addEventListener: (t, fn) => { (domListeners[t] ||= []).push(fn); },
        body: el('body'),
    };
    const store = new Map();
    const audio = { resumed: 0, created: 0 };
    class FakeAudioContext {
        constructor() { audio.created++; this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
        resume() { audio.resumed++; this.state = 'running'; }
        createOscillator() { return { connect() {}, frequency: { setValueAtTime() {} }, start() {}, stop() {} }; }
        createGain() { return { connect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
    }
    const ctx = {
        console: { warn() {}, log() {} }, Date: FakeDate, String, Object, Number, Math,
        document: doc,
        localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
        AudioContext: FakeAudioContext,
        setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: fn => fn(),
    };
    if (opts.stored !== undefined) store.set('examSoundsEnabled', opts.stored);
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(SOUNDS_SRC, ctx);
    const S = ctx.ExamSounds;
    const count = { start: 0, end: 0, five: 0, one: 0, toast: 0 };
    S.playStart = () => count.start++;
    S.playEnd = () => count.end++;
    S.playFiveMinWarning = () => count.five++;
    S.playOneMinWarning = () => count.one++;
    S._showToast = () => count.toast++;
    return {
        S, count, controls, doc, audio, store, domListeners, byId,
        setNow: (y, mo, d, h = 9, mi = 0) => { nowMs = new Date(y, mo, d, h, mi, 0).getTime(); },
    };
}

// ───────── 1. 靜音按鈕 ─────────
test('頁面已就緒且有控制列：載入時自動放一顆靜音按鈕（舊版：根本沒放）', () => {
    const e = soundsEnv();
    assert.equal(e.controls.children.length, 1);
    assert.equal(e.controls.children[0].id, 'examSoundToggleBtn');
    assert.match(e.controls.children[0].className, /exam-sound-toggle-btn/);
});

test('attachToggle 重複呼叫不會放兩顆；init 也一樣', () => {
    const e = soundsEnv();
    e.S.attachToggle(); e.S.attachToggle(); e.S.init();
    assert.equal(e.controls.children.length, 1);
});

test('頁面還在載入：等 DOMContentLoaded 才放；沒有控制列時不放也不丟例外', () => {
    const e = soundsEnv({ readyState: 'loading' });
    assert.equal(e.controls.children.length, 0, '載入中先不放');
    assert.equal(e.domListeners.DOMContentLoaded.length, 1);
    e.domListeners.DOMContentLoaded[0]();
    assert.equal(e.controls.children.length, 1);
    const none = soundsEnv({ noControls: true });
    assert.equal(none.controls.children.length, 0);
    none.S.attachToggle();   // 不丟例外
});

test('靜音按鈕：預設 🔔、點一下變 🔇 並記住、再點一下恢復；點擊同時解鎖聲音', () => {
    const e = soundsEnv();
    const btn = e.controls.children[0];
    assert.equal(btn.textContent, '🔔');
    btn.onclick();
    assert.equal(e.S.isEnabled(), false);
    assert.equal(btn.textContent, '🔇');
    assert.equal(e.store.get('examSoundsEnabled'), 'false');
    btn.onclick();
    assert.equal(e.S.isEnabled(), true);
    assert.equal(btn.textContent, '🔔');
    assert.equal(e.store.get('examSoundsEnabled'), 'true');
    assert.ok(e.audio.resumed >= 1, '點擊要 resume AudioContext（瀏覽器規定要有點擊才出聲）');
});

test('已存成靜音時載入：按鈕一開始就是 🔇', () => {
    const e = soundsEnv({ stored: 'false' });
    assert.equal(e.controls.children[0].textContent, '🔇');
});

test('unlock：存在、AudioContext 暫停時 resume、不丟例外', () => {
    const e = soundsEnv();
    assert.equal(typeof e.S.unlock, 'function');
    e.S.unlock();
    assert.equal(e.audio.created, 1);
    assert.equal(e.audio.resumed, 1);
    e.S.unlock();            // 已 running 就不用再 resume
    assert.equal(e.audio.resumed, 1);
});

// ───────── 2. _once：日期｜科目｜種類 ─────────
test('_once：同一科同一種鈴同一天只回傳一次 true；換種類／換科目各自獨立', () => {
    const e = soundsEnv();
    assert.equal(e.S._once('start', { id: 1 }), true);
    assert.equal(e.S._once('start', { id: 1 }), false);
    assert.equal(e.S._once('end', { id: 1 }), true);
    assert.equal(e.S._once('start', { id: 2 }), true);
    e.setNow(2026, 10, 24, 15, 30);   // 同一天晚一點
    assert.equal(e.S._once('start', { id: 1 }), false);
});

test('_once：換一天後同一個科目編號要能再響（舊版只用 id 當鍵，多日考試第二天第一科被吃掉）', () => {
    const e = soundsEnv();
    assert.equal(e.S._once('start', { id: 1 }), true);
    e.setNow(2026, 10, 25);
    assert.equal(e.S._once('start', { id: 1 }), true);
    assert.equal(e.S._once('start', { id: 1 }), false);
    // 跨月也算不同天
    e.setNow(2026, 11, 1);
    assert.equal(e.S._once('start', { id: 1 }), true);
});

// ───────── 3. onExamTick / onExamEnd ─────────
test('onExamTick：justStarted 響開始鈴一次；不是 justStarted 就不響', () => {
    const e = soundsEnv();
    const ex = { id: 1, name: '國語' };
    e.S.onExamTick(ex, 40, false);
    assert.equal(e.count.start, 0);
    e.S.onExamTick(ex, 40, true);
    assert.equal(e.count.start, 1);
    e.S.onExamTick(ex, 40, true);
    assert.equal(e.count.start, 1, '同一科開始鈴只響一次');
});

test('onExamTick：剩 5 分鐘（含）以內且 >1 響五分鐘警示一次；剩 1 分鐘以內響一分鐘警示一次', () => {
    const e = soundsEnv();
    const ex = { id: 1, name: '數學' };
    e.S.onExamTick(ex, 10, false); assert.equal(e.count.five + e.count.one, 0);
    e.S.onExamTick(ex, 6, false); assert.equal(e.count.five, 0, '剩 6 分鐘還不響');
    e.S.onExamTick(ex, 5, false); assert.equal(e.count.five, 1);
    e.S.onExamTick(ex, 4, false); e.S.onExamTick(ex, 2, false);
    assert.equal(e.count.five, 1, '五分鐘警示只響一次');
    e.S.onExamTick(ex, 1, false); assert.equal(e.count.one, 1);
    e.S.onExamTick(ex, 0, false); assert.equal(e.count.one, 1, '一分鐘警示只響一次');
    assert.equal(e.count.five, 1);
});

test('onExamTick：直接從剩 1 分鐘開始（考到一半才打開）只響一分鐘警示，不補五分鐘', () => {
    const e = soundsEnv();
    e.S.onExamTick({ id: 3, name: '社會' }, 1, false);
    assert.equal(e.count.one, 1);
    assert.equal(e.count.five, 0);
});

test('onExamTick(null) 與 onExamEnd(null)：什麼都不做、不丟例外', () => {
    const e = soundsEnv();
    e.S.onExamTick(null, 3, true); e.S.onExamEnd(null);
    assert.equal(e.count.start + e.count.end + e.count.five + e.count.one, 0);
});

test('onExamEnd：結束鈴同一科只響一次；多日考試第二天同編號可再響', () => {
    const e = soundsEnv();
    const ex = { id: 1, name: '自然' };
    e.S.onExamEnd(ex); e.S.onExamEnd(ex);
    assert.equal(e.count.end, 1);
    e.setNow(2026, 10, 25);
    e.S.onExamEnd(ex);
    assert.equal(e.count.end, 2);
});

test('第二天第一科的開始鈴、警示鈴都能再響（日期鍵）', () => {
    const e = soundsEnv();
    const ex = { id: 1, name: '國語' };
    e.S.onExamTick(ex, 40, true); e.S.onExamTick(ex, 5, false); e.S.onExamTick(ex, 1, false);
    assert.deepEqual([e.count.start, e.count.five, e.count.one], [1, 1, 1]);
    e.setNow(2026, 10, 25);
    e.S.onExamTick(ex, 40, true); e.S.onExamTick(ex, 5, false); e.S.onExamTick(ex, 1, false);
    assert.deepEqual([e.count.start, e.count.five, e.count.one], [2, 2, 2]);
});

// ───────── 4. exam-proctor.js 的 ringExamSounds 等 ─────────
function proctorEnv() {
    const state = { exam: undefined, remaining: 30, modalActive: true, noModal: false };
    const calls = [], timers = [];
    const sounds = {
        onExamTick: (exam, rem, started) => calls.push(['tick', exam && exam.id, rem, started]),
        onExamEnd: exam => calls.push(['end', exam && exam.id]),
    };
    const modal = { classList: { contains: c => c === 'active' && state.modalActive } };
    const ctx = {
        console: { warn() {} }, Math, Number, Date,
        document: { getElementById: id => (id === 'examFullscreenModal' && !state.noModal ? modal : null) },
        getCurrentExam: () => state.exam,
        getRemainingMinutes: () => state.remaining,
        setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    };
    ctx.window = ctx; ctx.window.ExamSounds = sounds;
    vm.createContext(ctx);
    const code = 'let soundSeen = false, soundPrevExam = null;\n'
        + grab(PROCTOR_SRC, 'function timeToMinutes(') + '\n'
        + grab(PROCTOR_SRC, 'function resetExamSoundWatch(') + '\n'
        + grab(PROCTOR_SRC, 'function ringExamSounds(') + '\n'
        + grab(PROCTOR_SRC, 'function breakSecondsLeft(') + '\n';
    vm.runInContext(code, ctx);
    return { ctx, state, calls, timers, sounds, ring: () => ctx.ringExamSounds(), reset: () => ctx.resetExamSoundWatch(), sounds };
}
const A = { id: 1, name: 'A' }, B = { id: 2, name: 'B' }, C = { id: 3, name: 'C' };

test('breakSecondsLeft：09:30:10 距 09:35 = 290 秒（04:50；舊版顯示 05:50）', () => {
    const e = proctorEnv();
    assert.equal(e.ctx.breakSecondsLeft('09:35', new Date(2026, 10, 24, 9, 30, 10)), 290);
});
test('breakSecondsLeft：09:30:00 = 300 秒（05:00；舊版 05:60）；已過開始時間 = 0', () => {
    const e = proctorEnv();
    assert.equal(e.ctx.breakSecondsLeft('09:35', new Date(2026, 10, 24, 9, 30, 0)), 300);
    assert.equal(e.ctx.breakSecondsLeft('09:35', new Date(2026, 10, 24, 9, 35, 0)), 0);
    assert.equal(e.ctx.breakSecondsLeft('09:35', new Date(2026, 10, 24, 10, 0, 5)), 0);
    assert.equal(e.ctx.breakSecondsLeft('09:35', new Date(2026, 10, 24, 9, 34, 59)), 1);
    assert.equal(e.ctx.timeToMinutes('09:35'), 575);
});

test('ringExamSounds：監考畫面沒開（沒有 active、或根本沒有 modal）→ 完全不呼叫 ExamSounds', () => {
    const e = proctorEnv();
    e.state.exam = A; e.state.modalActive = false;
    e.ring(); e.ring();
    assert.equal(e.calls.length, 0);
    e.state.noModal = true; e.ring();
    assert.equal(e.calls.length, 0);
    e.ctx.window.ExamSounds = undefined;   // 沒有鈴聲模組也不能丟例外
    e.state.noModal = false; e.state.modalActive = true;
    e.ring();
    assert.equal(e.calls.length, 0);
});

test('ringExamSounds：第一次看到「考試中」不補響開始鈴，但仍呼叫 onExamTick(exam, rem, false)', () => {
    const e = proctorEnv();
    e.state.exam = A; e.state.remaining = 4;
    e.ring();
    assert.deepEqual(e.calls, [['tick', 1, 4, false]]);
    e.ring();
    assert.deepEqual(e.calls[1], ['tick', 1, 4, false], '同一科持續觀察一直是 false');
});

test('ringExamSounds：無考試 → 有考試呼叫 onExamTick(…, true)；有考試 → 無考試呼叫 onExamEnd(上一科)', () => {
    const e = proctorEnv();
    e.state.exam = undefined; e.ring();                 // 先看到「沒有考試」
    assert.equal(e.calls.length, 0);
    e.state.exam = A; e.state.remaining = 40; e.ring();
    assert.deepEqual(e.calls, [['tick', 1, 40, true]]);
    e.calls.length = 0;
    e.state.exam = undefined; e.ring();
    assert.deepEqual(e.calls, [['end', 1]]);
    e.calls.length = 0;
    e.ring();                                            // 持續沒有考試不再響
    assert.equal(e.calls.length, 0);
});

test('resetExamSoundWatch 後重新觀察：新看到的考試不補響開始鈴、不補響上一科的結束鈴', () => {
    const e = proctorEnv();
    e.state.exam = A; e.ring(); e.calls.length = 0;
    e.reset();                       // 老師關掉監考畫面再打開
    e.state.exam = undefined; e.ring();   // 重新打開時 A 已經結束了
    assert.equal(e.calls.length, 0, 'A 在畫面關閉期間結束，不補響結束鈴');
    e.reset();
    e.state.exam = C; e.state.remaining = 20; e.ring();
    assert.deepEqual(e.calls, [['tick', 3, 20, false]]);
});

test('ringExamSounds：兩科緊接（A→B）先 onExamEnd(A)，B 的開始鈴經 setTimeout 延後', () => {
    const e = proctorEnv();
    e.state.exam = A; e.ring(); e.calls.length = 0;
    e.state.exam = B; e.state.remaining = 45; e.ring();
    assert.deepEqual(e.calls, [['end', 1]], '先只有結束鈴');
    assert.equal(e.timers.length, 1);
    assert.ok(e.timers[0].ms >= 1000, '要讓結束鈴先響完（延後 ' + e.timers[0].ms + 'ms）');
    e.timers[0].fn();
    assert.deepEqual(e.calls, [['end', 1], ['tick', 2, 45, true]]);
});

test('ringExamSounds：鈴聲模組丟例外不會讓監考畫面壞掉，且狀態照常前進（不會每秒重複補響）', () => {
    const e = proctorEnv();
    e.state.exam = A; e.ring(); e.calls.length = 0;
    e.sounds.onExamEnd = () => { throw new Error('audio fail'); };
    e.state.exam = undefined;
    e.ring();                                // 不丟例外
    e.sounds.onExamEnd = exam => e.calls.push(['end', exam.id]);
    e.ring();
    assert.equal(e.calls.length, 0, '狀態已前進，下一秒不會重響');
});

// ───────── 5. 原始碼檢查 ─────────
test('原始碼：exam-proctor 不再有 60 - now.getSeconds()；exam-sounds 不再去包 window.updateFullscreenStatus', () => {
    assert.ok(!/60\s*-\s*now\.getSeconds\(\)/.test(PROCTOR_SRC));
    const codeOnly = SOUNDS_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');   // 註解裡可以提到舊做法
    assert.ok(!codeOnly.includes('updateFullscreenStatus'));
});

test('原始碼：openExamFullscreen 有放靜音按鈕（attachToggle）並解鎖聲音（unlock）、每秒的更新會呼叫 ringExamSounds', () => {
    const body = grab(PROCTOR_SRC, 'window.openExamFullscreen = function');
    assert.ok(body.includes('setInterval(updateFullscreenStatus'), '抓到的函式範圍不對');
    assert.match(body, /attachToggle/);
    assert.match(body, /unlock/);
    assert.match(body, /resetExamSoundWatch\(\)/);
    const upd = grab(PROCTOR_SRC, 'function updateFullscreenStatus(');
    assert.match(upd, /ringExamSounds\(\)/);
});

console.log(`${passed} exam bell checks passed`);
