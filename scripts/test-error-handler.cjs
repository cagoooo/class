// Firestore 快取內部斷言只應降級處理，不得產生錯誤 webhook。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
    const elements = new Map();
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
        addEventListener() {},
        setTimeout() { return 1; },
        clearTimeout() {},
        APP_VERSION: 'test',
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('js/error-handler.js', 'utf8'), context);
    return context;
}

const context = setup();
const firestoreError = new Error('FIRESTORE (9.22.0) INTERNAL ASSERTION FAILED: Unexpected state');
context.ErrorHandler.handle(firestoreError, 'UNKNOWN', 'Global Error at https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js:1:59569');
assert.equal(context.ErrorHandler.getHistory().length, 0, 'Firestore 快取斷言不得寫入錯誤紀錄');
console.log('PASS Firestore 快取內部斷言不產生 webhook 錯誤');

const compatibilityError = new Error('A newer version of the Firestore SDK was previously used and so the persisted data is not compatible with the version of the SDK you are now using. The SDK will operate with persistence disabled.');
context.ErrorHandler.handle(compatibilityError, 'UNKNOWN', 'Unhandled Promise Rejection');
assert.equal(context.ErrorHandler.getHistory().length, 0, 'Firestore 版本不相容訊息不得寫入錯誤紀錄');
console.log('PASS Firestore 快取版本不相容不產生 webhook 錯誤');

context.ErrorHandler.handle(new Error('真正的資料寫入失敗'), 'STORAGE', 'students/save');
assert.equal(context.ErrorHandler.getHistory().length, 1, '真正錯誤仍應保留紀錄');
console.log('PASS 真正資料錯誤仍保留紀錄');

console.log('3 error-handler checks passed');
