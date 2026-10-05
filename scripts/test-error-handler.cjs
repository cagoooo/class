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

context.ErrorHandler.handle(new Error('真正的資料寫入失敗'), 'STORAGE', 'students/save');
assert.equal(context.ErrorHandler.getHistory().length, 1, '真正錯誤仍應保留紀錄');
console.log('PASS 真正資料錯誤仍保留紀錄');

console.log('6 error-handler checks passed');
