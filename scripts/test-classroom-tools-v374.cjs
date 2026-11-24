// 全站檢測「其餘發現」第一批：上課工具與加扣分的小問題（v3.74.0）
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const read = f => fs.readFileSync(f, 'utf8');

let passed = 0;
const pending = [];
function test(name, fn) {
    const r = fn();
    if (r && typeof r.then === 'function') pending.push(r.then(() => { console.log('PASS', name); passed++; }));
    else { console.log('PASS', name); passed++; }
}

/** 載入快捷鍵模組，回傳「按一個鍵」的函式與執行過的動作 */
function loadShortcuts() {
    const actions = [], listeners = {};
    const doc = {
        readyState: 'complete', body: { appendChild() {} }, head: { appendChild() {} },
        addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
        getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
        createElement() { return { style: {}, classList: { add() {}, remove() {} }, appendChild() {}, addEventListener() {}, setAttribute() {} }; },
    };
    const c = {
        console: { log() {}, warn() {} }, document: doc, setTimeout() { return 1; }, clearTimeout() {},
        showSection: n => actions.push('section:' + n), startTimer: () => actions.push('toggleTimer'), resetTimer: () => actions.push('resetTimer'),
        startLottery: () => actions.push('lottery'),
    };
    c.window = c; vm.createContext(c); vm.runInContext(read('js/keyboard-shortcuts.js'), c);
    const press = (key, extra = {}) => {
        const e = Object.assign({ key, target: { matches: () => false, closest: () => null }, preventDefault() {}, ctrlKey: false, altKey: false, metaKey: false, repeat: false }, extra);
        (listeners.keydown || []).forEach(fn => fn(e));
    };
    return { press, actions };
}

test('快捷鍵：開著大寫鎖定也能用（R 等於 r）', () => {
    const { press, actions } = loadShortcuts();
    press('R'); press('r'); press('L');
    // 抽籤快捷鍵會先切到抽籤頁再開始；只看有沒有被觸發
    assert.equal(actions.filter(a => a === 'resetTimer').length, 2);
    assert.ok(actions.some(a => a === 'lottery' || a === 'section:lottery'), actions.join(','));
});

test('快捷鍵：按住不放只算一下（計時器不會反覆開始／暫停）', () => {
    const { press, actions } = loadShortcuts();
    press(' ');
    for (let i = 0; i < 5; i++) press(' ', { repeat: true });
    assert.equal(actions.filter(a => a === 'toggleTimer').length, 1);
});

test('座號搜尋：完全比對，五碼座號可以打後兩碼；姓名照舊用包含', () => {
    const c = { console: { log() {}, warn() {} }, document: { addEventListener() {}, readyState: 'loading' }, addEventListener() {}, setTimeout() {} };
    c.window = c; vm.createContext(c);
    vm.runInContext(read('js/student-enhancement.js'), c);
    const list = [
        { name: '王小明', number: 1 }, { name: '李小華', number: 10 }, { name: '陳一', number: 11 },
        { name: '林五', number: '60105' }, { name: '張十', number: '60110' }, { name: '小一', number: '60101' },
    ];
    const names = q => c.filterStudents(list, q).map(s => s.name);
    assert.deepEqual(names('1'), ['王小明', '小一']);              // 以前會選到 1、10、11 和所有五碼座號
    assert.deepEqual(names('10'), ['李小華', '張十']);
    assert.deepEqual(names('05'), ['林五']);
    assert.deepEqual(names('60105'), ['林五']);
    assert.deepEqual(names('小'), ['王小明', '李小華', '小一']);
});

test('全班加分（安靜挑戰）：今天請假的同學不加；回傳實際人數', () => {
    const src = read('js/points-enhancement.js');
    assert.match(src, /window\.awardPointsToAll = \(points, reason\) => \{\s*const absent = absentSet\(\);\s*const ids = getStudents\(\)\.map\(s => String\(s\.id\)\)\.filter\(id => !absent\.has\(id\)\);/);
    assert.match(read('js/quiet-challenge.js'), /今天到校的 \$\{count\} 位同學/);
});

test('連續給分：同一位、同一個項目 0.6 秒內再點一次不加第二次', () => {
    const src = read('js/points-enhancement.js');
    assert.match(src, /lastArmedTap\.key === key && lastArmedTap\.item === state\.armed && now - lastArmedTap\.at < 600\) return;/);
});

test('開運拉霸抽人：排除今天請假的同學', () => {
    const src = read('js/zodiac-slot.js');
    const c = { window: null, console: { log() {} }, document: { getElementById: () => null, addEventListener() {}, readyState: 'loading', createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} } }, addEventListener() {}, setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {}, Math };
    c.window = c; vm.createContext(c);
    vm.runInContext(src, c);
    c.students = [{ id: 1, name: '甲' }, { id: 2, name: '乙' }, { id: 3, name: '丙' }];
    c.TodayAttendance = { load: () => new Set(['1', '3']) };
    c.NotificationSystem = { info() {}, warning() {} };
    const picked = new Set();
    for (let i = 0; i < 6; i++) { c.zodiacPickStudent(); picked.add(vm.runInContext('typeof currentPlayer === "undefined" ? null : currentPlayer', c)); }
    assert.ok(!src.includes('let pool = list.filter'), '要從到校名單抽');
    assert.match(src, /const roster = present\.length \? present : list;/);
});

test('確認視窗：任何方式關閉都拿掉鍵盤監聽；刪除類的焦點預設在「取消」', () => {
    const html = read('classnew.html');
    const body = html.slice(html.indexOf('class ConfirmDialog'), html.indexOf('static create({ title, message'));
    assert.match(body, /const close = \(result\) => \{[\s\S]*?document\.removeEventListener\('keydown', escHandler\);/);
    assert.match(body, /confirmBtn\.onclick = \(\) => close\(true\);/);
    assert.match(body, /cancelBtn\.onclick = \(\) => close\(false\);/);
    assert.match(body, /\(danger \? cancelBtn : confirmBtn\)\.focus\(\)/);
});

test('潔牙「全部重來」：有勾選時要先確認，按取消不清除', () => {
    const store = new Map([['brushChecked', JSON.stringify({ date: new Date().toLocaleDateString('zh-TW'), ids: [1, 2] })]]);
    let asked = 0, answer = false;
    const c = {
        console: { log() {} }, localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
        document: { readyState: 'complete', getElementById: () => null, addEventListener() {}, head: { appendChild() {} }, createElement: () => ({}) },
        ConfirmDialog: { show: () => { asked++; return Promise.resolve(answer); } },
        students: [{ number: 1 }, { number: 2 }, { number: 3 }],
    };
    c.window = c; vm.createContext(c); vm.runInContext(read('js/brush-check.js'), c);
    return c.BrushCheck.reset().then(() => {
        assert.equal(asked, 1);
        assert.deepEqual(JSON.parse(store.get('brushChecked')).ids, [1, 2]);
        answer = true;
        return c.BrushCheck.reset();
    }).then(() => {
        assert.deepEqual(JSON.parse(store.get('brushChecked')).ids, []);
        return c.BrushCheck.reset();   // 已經是空的：不用再問
    }).then(() => assert.equal(asked, 2));
});

test('分組投影的「重新分組」：要在 3 秒內再按一次', () => {
    const src = read('js/grouping-enhancement.js');
    assert.match(src, /if \(!regroupArmed\) \{[\s\S]*?再按一次重新分組[\s\S]*?return;\s*\}/);
});

test('保持螢幕不休眠：大時鐘、計時、安靜挑戰共用一套，切回分頁會重新申請', () => {
    const html = read('classnew.html');
    assert.match(html, /window\.ScreenAwake = \(function \(\) \{/);
    assert.match(html, /function requestWakeLock\(\) \{ window\.ScreenAwake\.hold\('clock'\); \}/);
    assert.match(html, /addEventListener\('visibilitychange', \(\) => \{ if \(!document\.hidden\) acquire\(\); \}\)/);
    const quiet = read('js/quiet-challenge.js');
    assert.match(quiet, /window\.ScreenAwake\.hold\('quiet'\)/);
    assert.match(quiet, /window\.ScreenAwake\.drop\('quiet'\)/);
    // 外部檔一律先確認有沒有（舊版主頁面沒有 ScreenAwake）
    assert.doesNotMatch(quiet.replace(/if \(window\.ScreenAwake\) window\.ScreenAwake\.(hold|drop)/g, ''), /ScreenAwake\.(hold|drop)/);
});

test('鬧鈴：點擊、觸控、按鍵都能啟用聲音，而且不只第一次', () => {
    const src = read('js/timer-alarm.js');
    assert.match(src, /\['pointerdown', 'keydown', 'touchstart'\]\.forEach\(type => document\.addEventListener\(type, \(\) => \{\s*if \(!audioCtx \|\| audioCtx\.state !== 'running'\) ensureAudio\(\);/);
    assert.doesNotMatch(src, /addEventListener\('click', ensureAudio, \{ once: true \}\)/);
});

// 有一個測試回傳 Promise，等它跑完再印總數
Promise.all(pending).then(() => console.log(passed + ' classroom-tools v3.74 checks passed'), e => { console.error(e); process.exit(1); });
