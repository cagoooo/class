// 同步狀態偵測：初始化重寫相同資料不得留下未同步標記。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Storage {
    constructor() { this.data = new Map(); }
    getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
    setItem(key, value) { this.data.set(key, String(value)); }
    removeItem(key) { this.data.delete(key); }
}

function setup() {
    const localStorage = new Storage();
    const sessionStorage = new Storage();
    const elements = new Map();
    const element = tag => ({
        tagName: tag, id: '', style: {},
        classList: { toggle() {} },
        addEventListener() {}, append() {},
        appendChild(child) { if (child?.id) elements.set(child.id, child); },
        setAttribute() {}, focus() {},
    });
    const context = {
        Storage, localStorage, sessionStorage,
        console: { log() {}, warn() {}, error() {} },
        navigator: { onLine: true },
        OfflineDetector: { isOffline: () => false },
        FirebaseConfig: {
            isGoogleUser: () => true,
            onAuthStateChanged: callback => callback({ uid: 'teacher' }, {}),
        },
        CloudSafety: { status: () => 'synced', markLocalChange() { context.markers++; } },
        markers: 0,
        document: {
            readyState: 'complete',
            head: { appendChild(child) { if (child?.id) elements.set(child.id, child); } },
            body: { appendChild(child) { if (child?.id) elements.set(child.id, child); } },
            getElementById: id => elements.get(id) || null,
            createElement: element,
        },
        setTimeout: callback => { callback(); return 1; },
        setInterval: () => 1,
        clearTimeout() {}, clearInterval() {}, addEventListener() {},
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('js/sync-status-indicator.js', 'utf8'), context);
    return context;
}

const context = setup();
context.localStorage.setItem('students', '[1]');
assert.equal(context.markers, 1, '真正的新資料應留下待同步標記');
context.localStorage.setItem('students', '[1]');
assert.equal(context.markers, 1, '相同內容重寫不得重複標記');
context.sessionStorage.setItem('students', '[2]');
assert.equal(context.markers, 1, 'sessionStorage 不應被算成本機班級異動');
context.localStorage.setItem('students', '[2]');
assert.equal(context.markers, 2, '內容真的改變時仍應標記');
console.log('4 sync-status checks passed');
