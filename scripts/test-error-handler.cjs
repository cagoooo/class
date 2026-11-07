// Firestore 快取內部斷言只應降級處理，不得產生錯誤 webhook。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
    const elements = new Map();
    const listeners = new Map();
    const element = tag => ({
        tagName: tag,
        id: '',
        style: {},
        classList: { add() {}, remove() {}, toggle() {} },
        appendChild(child) { if (child?.id) elements.set(child.id, child); },
        setAttribute() {},
    });
    const context = {
        console: { log() {}, warn() {}, error() {} },
        navigator: { userAgent: 'test' },
        location: { href: 'https://example.test/' },
        document: {
            head: { appendChild() {} },
            body: { appendChild() {} },
            getElementById: id => elements.get(id) || null,
            createElement: element,
        },
        addEventListener(type, handler) { listeners.set(type, handler); },
        setTimeout() { return 1; },
        clearTimeout() {},
        APP_VERSION: 'test',
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('js/error-handler.js', 'utf8'), context);
    return { context, listeners };
}

const { context, listeners } = setup();
const firestoreError = new Error('FIRESTORE (9.22.0) INTERNAL ASSERTION FAILED: Unexpected state');
context.ErrorHandler.handle(firestoreError, 'UNKNOWN', 'Global Error at https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js:1:59569');
assert.equal(context.ErrorHandler.getHistory().length, 0, 'Firestore 快取斷言不得寫入錯誤紀錄');
console.log('PASS Firestore 快取內部斷言不產生 webhook 錯誤');

const safariFirestoreError = vm.runInContext("new Error('FIRESTORE (9.22.0) INTERNAL ASSERTION FAILED: Unexpected state')", context);
safariFirestoreError.stack = [
    safariFirestoreError.message,
    'listen@https://cagoooo.github.io/class/js/firebase-sync.js:1:400',
    'run@https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js:59569:32',
].join('\n');
let safariRejectionPrevented = false;
listeners.get('unhandledrejection')({
    reason: safariFirestoreError,
    preventDefault() { safariRejectionPrevented = true; },
});
assert.equal(safariRejectionPrevented, true, 'Safari 格式的 Firestore 斷言應被正確辨識');
assert.equal(context.ErrorHandler.getHistory().length, 0, 'Safari 格式的 Firestore 斷言不得送出錯誤 webhook');
console.log('PASS Safari 格式的 unhandledrejection 正確辨識 Firestore 來源');

const appAssertion = vm.runInContext("new Error('FIRESTORE (9.22.0) INTERNAL ASSERTION FAILED: Unexpected state')", context);
appAssertion.stack = 'Error: FIRESTORE (9.22.0) INTERNAL ASSERTION FAILED: Unexpected state\n    at savePoints (https://cagoooo.github.io/class/js/points.js:10:2)';
context.ErrorHandler.handle(appAssertion, 'UNKNOWN', 'points/save');
assert.equal(context.ErrorHandler.getHistory().length, 1, '沒有 Firestore SDK 來源的同名斷言仍應保留');
context.ErrorHandler.clearHistory();
console.log('PASS 缺少 Firestore SDK 來源時仍保留錯誤');

const safariContexts = [];
context.UsageNotify = { error(_message, errorContext) { safariContexts.push(errorContext); } };
const safariAppError = vm.runInContext("new Error('Safari rejection with stack')", context);
safariAppError.stack = 'Error: Safari rejection with stack\nonlineCallback@https://cagoooo.github.io/class/js/points.js:10:2';
listeners.get('unhandledrejection')({ reason: safariAppError, preventDefault() {} });
assert.match(safariContexts[0], /Unhandled Promise Rejection @ onlineCallback@https:\/\/cagoooo\.github\.io\/class\/js\/points\.js:10:2/,
    'Safari 格式的堆疊應被保留在錯誤上下文');
context.ErrorHandler.clearHistory();
delete context.UsageNotify;
console.log('PASS Safari 格式的 Promise 堆疊可保留來源資訊');

const compatibilityError = new Error('A newer version of the Firestore SDK was previously used and so the persisted data is not compatible with the version of the SDK you are now using. The SDK will operate with persistence disabled.');
context.ErrorHandler.handle(compatibilityError, 'UNKNOWN', 'Unhandled Promise Rejection');
assert.equal(context.ErrorHandler.getHistory().length, 0, 'Firestore 版本不相容訊息不得寫入錯誤紀錄');
console.log('PASS Firestore 快取版本不相容不產生 webhook 錯誤');

const authStale = vm.runInContext("new Error('INTERNAL ASSERTION FAILED: Pending promise was never set')", context);
authStale.stack = 'Error: INTERNAL ASSERTION FAILED: Pending promise was never set\n    at G (https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js:1:22836)';
let authStalePrevented = false;
listeners.get('unhandledrejection')({ reason: authStale, preventDefault() { authStalePrevented = true; } });
assert.equal(authStalePrevented, true, 'Auth 登入彈窗慢一步的斷言應被辨識');
assert.equal(context.ErrorHandler.getHistory().length, 0, 'Auth 登入彈窗慢一步的斷言不得送出錯誤 webhook');
console.log('PASS Google 登入彈窗慢一步回傳的 Auth 斷言不產生 webhook 錯誤');

const appPending = vm.runInContext("new Error('INTERNAL ASSERTION FAILED: Pending promise was never set')", context);
appPending.stack = 'Error: INTERNAL ASSERTION FAILED: Pending promise was never set\n    at save (https://cagoooo.github.io/class/js/points.js:10:2)';
context.ErrorHandler.handle(appPending, 'UNKNOWN', 'points/save');
assert.equal(context.ErrorHandler.getHistory().length, 1, '沒有 Auth SDK 來源的同名斷言仍應保留');
context.ErrorHandler.clearHistory();
console.log('PASS 缺少 Auth SDK 來源時仍保留錯誤');

context.ErrorHandler.handle(new Error('真正的資料寫入失敗'), 'STORAGE', 'students/save');
assert.equal(context.ErrorHandler.getHistory().length, 1, '真正錯誤仍應保留紀錄');
console.log('PASS 真正資料錯誤仍保留紀錄');

console.log('8 error-handler checks passed');

{
    const { context: ctx } = setup();
    let notified = 0;
    ctx.UsageNotify = { error() { notified++; } };
    ctx.ErrorHandler.handle(vm.runInContext("new Error('The client has already been terminated.')", ctx), 'STORAGE', '寵物系統/reward', { severity: 'critical', silent: true, feature: 'pet' });
    assert.equal(notified, 0, '頁面暫存恢復後的 Firestore 已關閉不得送出 webhook');
    assert.equal(ctx.ErrorHandler.getHistory().length, 0);
    console.log('PASS 頁面暫存恢復後 Firestore 已關閉不推播');
}

{
    // 臉書／LINE 內建瀏覽器注入的腳本（iabjs://）出錯，不是班級小管家的錯，不送警報。
    const { context: ctx, listeners: ls } = setup();
    const before = ctx.ErrorHandler.getHistory().length;
    ls.get('error')({
        message: 'Error invoking postMessage: Java object is gone',
        filename: 'iabjs://navigation_performance_logger_android',
        lineno: 1,
        colno: 11722,
        error: null,
    });
    ls.get('error')({
        message: 'Uncaught TypeError: x is undefined',
        filename: 'chrome-extension://abcdef/content.js',
        lineno: 3,
        colno: 9,
        error: null,
    });
    assert.equal(ctx.ErrorHandler.getHistory().length, before, '內建瀏覽器或擴充功能注入的錯誤不得寫入錯誤紀錄');

    ls.get('error')({
        message: 'Uncaught TypeError: boom',
        filename: 'https://cagoooo.github.io/class/js/points.js',
        lineno: 10,
        colno: 2,
        error: null,
    });
    assert.equal(ctx.ErrorHandler.getHistory().length, before + 1, '班級小管家自己的錯誤仍要記錄');
    console.log('PASS 臉書內建瀏覽器注入腳本的錯誤不推播，自己的錯誤照常記錄');
}

{
    // iPhone Safari／臉書內建瀏覽器打不開 Firestore 離線快取，SDK 自己改用記憶體快取，不送警報。
    const { context: ctx, listeners: ls } = setup();
    let prevented = false;
    ls.get('unhandledrejection')({
        reason: vm.runInContext("new Error(\"IndexedDB transaction 'createOrUpgrade' failed: AbortError: The operation was aborted.\")", ctx),
        preventDefault() { prevented = true; },
    });
    assert.equal(prevented, true, 'Firestore 離線快取打不開應被辨識');
    assert.equal(ctx.ErrorHandler.getHistory().length, 0, 'Firestore 離線快取打不開不得寫入錯誤紀錄');

    // 班級小管家自己接住並回報的同類訊息仍要記錄
    ctx.ErrorHandler.handle(vm.runInContext("new Error(\"IndexedDB transaction 'createOrUpgrade' failed: AbortError\")", ctx), 'STORAGE', '雲端同步/上傳', { silent: true });
    assert.equal(ctx.ErrorHandler.getHistory().length, 1, '自己接住的錯誤仍要記錄');
    console.log('PASS Firestore 離線快取打不開不推播，自己接住的錯誤照常記錄');
}
