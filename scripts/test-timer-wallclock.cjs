// 主頁面計時器「看時鐘」（classnew.html 行內程式：startTimer／timerTick／stopTimer／updateTimerDisplay／resetTimer）
// 舊版：setInterval 每跳一次就 totalSeconds--（碼錶是 ++），分頁被蓋住、被瀏覽器節流或電腦睡眠時，
//       interval 跳得比較慢，計時就跟著變慢（10 分鐘的倒數可能 15 分鐘後才響）。
// 新版：記下 timerAnchorMs（倒數＝預定歸零時刻、碼錶＝起算時刻），每 250ms 用 Date.now() 算出 totalSeconds。
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const SRC = fs.readFileSync('classnew.html', 'utf8');

function grabFunction(signature) {
    const start = SRC.indexOf(signature);
    assert.ok(start >= 0, '找不到 ' + signature);
    let depth = 0, i = SRC.indexOf('{', start);
    for (; i < SRC.length; i++) {
        if (SRC[i] === '{') depth++;
        else if (SRC[i] === '}' && --depth === 0) break;
    }
    return SRC.slice(start, i + 1);
}
const FN = {
    startTimer: grabFunction('function startTimer()'),
    timerTick: grabFunction('function timerTick()'),
    stopTimer: grabFunction('function stopTimer()'),
    updateTimerDisplay: grabFunction('function updateTimerDisplay()'),
    resetTimer: grabFunction('function resetTimer()'),
};

let passed = 0;
function test(name, fn) { fn(); console.log('PASS', name); passed++; }

function makeEnv() {
    let now = 1_700_000_000_000;
    const intervals = new Map(); let seq = 0;
    const els = {};
    function el(id) {
        if (els[id]) return els[id];
        const set = new Set();
        return (els[id] = { id, value: '', textContent: '', className: '', style: {}, classList: { add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c) } });
    }
    el('timerMinutes').value = '5'; el('timerSeconds').value = '0'; el('timerTitle').value = '';
    const ctx = {
        console: { warn() {}, log() {} }, Math, parseInt, Number, String,
        Date: { now: () => now },
        document: { getElementById: el },
        alert() {},
        setInterval: (cb, ms) => { const id = ++seq; intervals.set(id, { cb, ms }); return id; },
        clearInterval: id => intervals.delete(id),
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(`
        let timerInterval = null, timerRunning = false, totalSeconds = 300, originalSeconds = 300, timerMode = 'countdown', timerAnchorMs = 0;
        var __finished = 0;
        function timerFinished() { __finished++; stopTimer(); }   // 真正的 timerFinished 也是先 stopTimer；這裡只計次數
        ${FN.updateTimerDisplay}
        ${FN.stopTimer}
        ${FN.resetTimer}
        ${FN.startTimer}
        ${FN.timerTick}
        function __get() { return { totalSeconds, originalSeconds, timerRunning, timerMode, timerAnchorMs }; }
        function __set(o) { if ('mode' in o) timerMode = o.mode; if ('total' in o) totalSeconds = o.total; if ('original' in o) originalSeconds = o.original; }
    `, ctx);
    const env = {
        ctx, els, intervals,
        get s() { return ctx.__get(); },
        get finished() { return ctx.__finished; },
        display: () => els.timerDisplay.textContent,
        set: o => ctx.__set(o),
        setInput: (m, sec = 0) => { els.timerMinutes.value = String(m); els.timerSeconds.value = String(sec); },
        start: () => ctx.startTimer(),
        tickNow: () => ctx.timerTick(),
        /** 時鐘前進 ms，期間 interval 每 everyMs 觸發一次（只觸發還存在的 interval；最後補到剛好 ms）。 */
        advance(ms, everyMs = 250) {
            let left = ms;
            while (left > 0) {
                const step = Math.min(everyMs, left);
                now += step; left -= step;
                for (const t of [...intervals.values()]) t.cb();
            }
        },
        /** 時鐘直接跳 ms（睡眠／節流），只在最後觸發 ticks 次。 */
        jump(ms, ticks = 1) {
            const each = ms / ticks;
            for (let i = 0; i < ticks; i++) { now += each; for (const t of [...intervals.values()]) t.cb(); }
        },
        silentJump: ms => { now += ms; },   // 沒有任何 interval 觸發（計時已暫停）
    };
    return env;
}

test('startTimer 的 interval 間隔是 250ms（不是 1000ms）', () => {
    const e = makeEnv();
    e.start();
    assert.equal(e.intervals.size, 1);
    assert.equal([...e.intervals.values()][0].ms, 250);
});

test('倒數：記下預定歸零時刻 = Date.now() + 秒數 × 1000', () => {
    const e = makeEnv();
    const before = e.ctx.Date.now();
    e.setInput(10, 30);
    e.start();
    assert.equal(e.s.timerAnchorMs, before + 630 * 1000);
    assert.equal(e.s.totalSeconds, 630);
    assert.equal(e.s.timerRunning, true);
    assert.equal(e.display(), '10:30');
});

test('背景分頁節流：時鐘走了 10 分鐘，期間只觸發 5 次 tick → 最後 0 秒、timerFinished 剛好 1 次（舊版還剩 595 秒）', () => {
    const e = makeEnv();
    e.setInput(10, 0); e.start();
    const seen = [];
    for (let i = 0; i < 5; i++) { e.jump(120_000, 1); seen.push(e.s.totalSeconds); }
    assert.deepEqual(seen, [480, 360, 240, 120, 0]);
    assert.equal(e.s.totalSeconds, 0);
    assert.equal(e.finished, 1);
    assert.equal(e.intervals.size, 0, '結束後 interval 已清掉');
});

test('電腦睡眠：9 分鐘倒數，時鐘直接跳 3 分鐘、tick 一次 → 剩 360 秒、還沒結束', () => {
    const e = makeEnv();
    e.setInput(9, 0); e.start();
    e.jump(180_000, 1);
    assert.equal(e.s.totalSeconds, 360);
    assert.equal(e.display(), '06:00');
    assert.equal(e.finished, 0);
    assert.equal(e.s.timerRunning, true);
});

test('睡眠時間比倒數還長：醒來第一次 tick 就結束，且不會是負數', () => {
    const e = makeEnv();
    e.setInput(1, 0); e.start();
    e.jump(3_600_000, 1);
    assert.equal(e.s.totalSeconds, 0);
    assert.equal(e.finished, 1);
    assert.equal(e.display(), '00:00');
});

test('正常每 250ms tick：每過 1 秒剛好少 1 秒，不多跳也不少跳，畫面 MM:SS 正確（跑 5 秒）', () => {
    const e = makeEnv();
    e.setInput(5, 0); e.start();
    assert.equal(e.display(), '05:00');
    const history = [];
    for (let ms = 250; ms <= 5000; ms += 250) {
        e.advance(250);
        history.push([ms, e.s.totalSeconds, e.display()]);
    }
    for (const [ms, total, text] of history) {
        const expect = 300 - Math.floor(ms / 1000);
        assert.equal(total, expect, `${ms}ms 時應剩 ${expect} 秒`);
        assert.equal(text, String(Math.floor(expect / 60)).padStart(2, '0') + ':' + String(expect % 60).padStart(2, '0'));
    }
    assert.equal(history.at(-1)[2], '04:55');
    // 只在整秒邊界變化：5 秒內 totalSeconds 恰好改變 5 次
    let changes = 0, last = 300;
    for (const [, total] of history) { if (total !== last) { changes++; assert.equal(last - total, 1, '一次只少 1 秒'); last = total; } }
    assert.equal(changes, 5);
    assert.equal(e.finished, 0);
});

test('倒數自然跑完：最後一秒之後 timerFinished 剛好 1 次', () => {
    const e = makeEnv();
    e.setInput(0, 3); e.start();
    e.advance(2750); assert.equal(e.s.totalSeconds, 1); assert.equal(e.finished, 0);
    e.advance(250); assert.equal(e.s.totalSeconds, 0); assert.equal(e.finished, 1);
    e.advance(5000);   // interval 已清除，不會再結束第二次
    assert.equal(e.finished, 1);
});

test('暫停再繼續：跑 3 秒後暫停、時鐘再過 60 秒、繼續 → 從暫停時剩餘秒數接著算（暫停的 60 秒不算進去）', () => {
    const e = makeEnv();
    e.setInput(5, 0); e.start();
    e.advance(3000);
    assert.equal(e.s.totalSeconds, 297);
    e.start();                                  // 倒數中再按 = 停止
    assert.equal(e.s.timerRunning, false);
    assert.equal(e.intervals.size, 0);
    e.silentJump(60_000);                       // 暫停期間時鐘照樣走
    e.start();                                  // 繼續
    assert.equal(e.s.timerRunning, true);
    assert.equal(e.s.totalSeconds, 297, '不重新讀輸入框、也不扣掉暫停的 60 秒');
    e.tickNow();
    assert.equal(e.s.totalSeconds, 297);
    e.advance(1000);
    assert.equal(e.s.totalSeconds, 296);
    assert.equal(e.finished, 0);
});

test('碼錶：開始後時鐘過 125 秒、tick 一次 → 125；暫停、過 30 秒、繼續、再過 5 秒 → 130', () => {
    const e = makeEnv();
    e.set({ mode: 'stopwatch', total: 0, original: 0 });
    e.start();
    assert.equal(e.s.timerRunning, true);
    e.jump(125_000, 1);
    assert.equal(e.s.totalSeconds, 125);
    assert.equal(e.display(), '02:05');
    e.start();                                  // 暫停
    assert.equal(e.s.timerRunning, false);
    e.silentJump(30_000);
    e.start();                                  // 繼續：從 125 往上算，不含暫停的 30 秒
    assert.equal(e.s.totalSeconds, 125);
    e.advance(5000);
    assert.equal(e.s.totalSeconds, 130);
    assert.equal(e.display(), '02:10');
    assert.equal(e.finished, 0, '碼錶永遠不會觸發倒數結束');
});

test('碼錶：背景節流後回來，一次 tick 就追上真實時間', () => {
    const e = makeEnv();
    e.set({ mode: 'stopwatch', total: 0, original: 0 });
    e.start();
    e.jump(600_000, 2);
    assert.equal(e.s.totalSeconds, 600);
});

test('沒在跑的時候 timerTick 什麼都不做（切回分頁／視窗 focus 也會呼叫它）', () => {
    const e = makeEnv();
    e.setInput(5, 0); e.start(); e.advance(2000);
    e.start();                                  // 暫停在 298
    e.silentJump(1_000_000);
    e.tickNow();
    assert.equal(e.s.totalSeconds, 298);
    assert.equal(e.finished, 0);
});

test('重設：暫停後 resetTimer 回到輸入框設定的時間，再開始從頭算', () => {
    const e = makeEnv();
    e.setInput(2, 0); e.start(); e.advance(10_000);
    assert.equal(e.s.totalSeconds, 110);
    e.start();
    e.ctx.resetTimer();
    assert.equal(e.s.totalSeconds, 120);
    assert.equal(e.display(), '02:00');
    e.start(); e.advance(1000);
    assert.equal(e.s.totalSeconds, 119);
});

test('原始碼：startTimer 不再有 totalSeconds-- 與 totalSeconds++；timerTick 用 Date.now() 計算', () => {
    assert.ok(!/totalSeconds\s*--|--\s*totalSeconds/.test(FN.startTimer), 'startTimer 不該再遞減');
    assert.ok(!/totalSeconds\s*\+\+|\+\+\s*totalSeconds/.test(FN.startTimer), 'startTimer 不該再遞增');
    assert.ok(!/totalSeconds\s*--|totalSeconds\s*\+\+/.test(FN.timerTick));
    assert.match(FN.timerTick, /Date\.now\(\)/);
    assert.match(FN.startTimer, /setInterval\(timerTick,\s*250\)/);
    assert.match(SRC, /addEventListener\('visibilitychange',\s*\(\)\s*=>\s*\{\s*if \(!document\.hidden\) timerTick\(\);/, '回到分頁要立刻對時');
});

console.log(`${passed} timer wall-clock checks passed`);
