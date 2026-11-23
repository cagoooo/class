// 開頁之後才登入（或登入狀態還原得比較慢）：定時自動同步也要啟動；登出要停（v3.71.1）
// 以前只在載入後 2 秒檢查一次，之後靠 window.onGoogleSignIn——但整個專案沒有人呼叫它。
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');

function setup({ withAuth = true } = {}) {
    const timeouts = [], intervals = [], authListeners = [];
    let writable = false;
    const c = {
        console: { log() {}, warn() {}, error() {} },
        localStorage: { getItem: () => null, setItem() {} },
        navigator: { onLine: true },
        document: { readyState: 'complete', hidden: false, addEventListener() {}, removeEventListener() {}, getElementById: () => null },
        setTimeout: (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length; },
        clearTimeout() {},
        setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; },
        clearInterval() {},
        FirebaseConfig: { canWriteCloud: () => writable },
    };
    if (withAuth) c.firebase = { apps: [{}], auth: () => ({ onAuthStateChanged: cb => { authListeners.push(cb); } }) };
    c.window = c; vm.createContext(c);
    vm.runInContext(fs.readFileSync('js/auto-sync.js', 'utf8'), c);
    return {
        c, A: c.AutoSync, authListeners,
        setWritable: v => { writable = v; },
        runTimeouts: () => timeouts.splice(0).forEach(t => t.fn()),
        /** 跑一次「登入狀態檢查」用的短間隔計時器（不是 10 分鐘的同步計時器） */
        tickWatch: () => intervals.filter(i => i.ms <= 60000).forEach(i => i.fn()),
    };
}

let passed = 0;
function test(name, fn) { fn(); console.log('PASS', name); passed++; }

test('開頁時已登入：照舊在載入後啟動', () => {
    const t = setup(); t.setWritable(true);
    t.runTimeouts();
    assert.equal(t.A.isRunning(), true);
});

test('開頁時未登入、之後才登入：登入狀態一變就啟動', () => {
    const t = setup();
    t.runTimeouts();
    assert.equal(t.A.isRunning(), false);
    assert.equal(t.authListeners.length, 1, '要訂閱登入狀態變化');
    t.setWritable(true);
    t.authListeners[0]({ uid: 'teacher' });
    assert.equal(t.A.isRunning(), true);
});

test('登入後帳號收納還沒完成（暫時不能寫雲端）：稍後的確認會補上', () => {
    const t = setup();
    t.runTimeouts();
    t.authListeners[0]({ uid: 'teacher' });      // 這一刻 canWriteCloud 還是假
    assert.equal(t.A.isRunning(), false);
    t.setWritable(true);
    t.runTimeouts();                             // 登入後 1.5 秒／5 秒的再次確認
    assert.equal(t.A.isRunning(), true);
});

test('沒收到登入事件（Firebase 還沒準備好就載入）：定期確認仍會啟動', () => {
    const t = setup({ withAuth: false });
    t.runTimeouts();
    t.setWritable(true);
    assert.equal(t.A.isRunning(), false);
    t.tickWatch();
    assert.equal(t.A.isRunning(), true);
});

test('登出或換帳號（不能寫雲端）：自動同步跟著停，再登入又啟動', () => {
    const t = setup(); t.setWritable(true);
    t.runTimeouts();
    assert.equal(t.A.isRunning(), true);
    t.setWritable(false); t.tickWatch();
    assert.equal(t.A.isRunning(), false);
    t.setWritable(true); t.tickWatch();
    assert.equal(t.A.isRunning(), true);
});

console.log(passed + ' auto-sync late login checks passed');
