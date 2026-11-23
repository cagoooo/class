// 兩個分頁同時開著：一邊切換班級，另一邊（還停在原本那班）的寫入不能落到別班（v3.71.1）
// 也涵蓋 LocalDataHold（本機資料讀不出來時暫停上傳的記號）。
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');

class Storage {
    constructor() { this.data = new Map(); }
    getItem(k) { return this.data.get(k) ?? null; }
    setItem(k, v) { this.data.set(k, String(v)); }
    removeItem(k) { this.data.delete(k); }
    key(i) { return [...this.data.keys()][i] ?? null; }
    get length() { return this.data.size; }
}

/** 開一個「分頁」：每個分頁有自己的執行環境，共用同一份 localStorage 資料。 */
function openTab(shared, { busy = false, typing = false } = {}) {
    // 每個分頁用自己的 Storage 類別（各自被攔截），底層資料是同一個 Map
    class TabStorage extends Storage {}
    const local = new TabStorage(); local.data = shared;
    const session = new TabStorage();
    const listeners = {}, docListeners = {};
    let reloads = 0;
    const state = { busy, typing, hidden: false };
    const c = {
        Storage: TabStorage, localStorage: local, sessionStorage: session,
        console: { log() {}, warn() {}, error() {} },
        document: {
            readyState: 'complete', get hidden() { return state.hidden; },
            get activeElement() { return state.typing ? { matches: () => true } : { matches: () => false }; },
            addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
            getElementById() { return null; },
        },
        addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
        setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {}, alert() {},
        location: { reload() { reloads++; } },
        FirebaseConfig: { isPageBusy: () => state.busy },
    };
    c.window = c; vm.createContext(c);
    vm.runInContext(fs.readFileSync('js/class-aware-storage.js', 'utf8'), c);
    return {
        c, state, reloads: () => reloads,
        fire: (type, e) => (listeners[type] || []).forEach(fn => fn(e)),
        fireDoc: (type, e) => (docListeners[type] || []).forEach(fn => fn(e)),
        /** 模擬「另一個分頁」改了 currentClassId：直接改共用資料，再送 storage 事件給這個分頁 */
        otherTabSwitchesTo(id) { shared.set('currentClassId', id); this.fire('storage', { key: 'currentClassId', newValue: id, storageArea: local }); },
    };
}

let passed = 0;
function test(name, fn) { fn(); console.log('PASS', name); passed++; }

test('另一個分頁切到別班後，這頁的寫入仍寫回自己那班，不會蓋到別班', () => {
    const shared = new Map([['currentClassId', '1001'], ['homeworkList-2002', JSON.stringify([{ id: 9, name: '2002 班原本的作業' }])]]);
    const a = openTab(shared, { busy: true });   // 上課中（計時器在跑），不會被重新整理
    a.c.localStorage.setItem('homeworkList', JSON.stringify([{ id: 1, name: '1001 班的作業' }]));
    a.otherTabSwitchesTo('2002');
    a.c.SafeStorage.set('homeworkList', JSON.stringify([{ id: 1, name: '1001 班的作業' }, { id: 2, name: '1001 班新增的作業' }]), { context: '新增作業' });
    a.c.localStorage.setItem('notebookEntries', JSON.stringify([{ id: 5, content: '1001 班聯絡簿' }]));
    assert.match(shared.get('homeworkList-1001'), /1001 班新增的作業/);
    assert.equal(shared.get('homeworkList-2002'), JSON.stringify([{ id: 9, name: '2002 班原本的作業' }]));
    assert.match(shared.get('notebookEntries-1001'), /1001 班聯絡簿/);
    assert.equal(shared.has('notebookEntries-2002'), false);
    assert.match(a.c.localStorage.getItem('homeworkList'), /1001 班新增的作業/);   // 讀取也還是自己那班
    assert.equal(a.c.ClassAwareStorage.pageClassId(), '1001');
});

test('這一頁自己切換班級：照舊跟著換（切換後會重新載入）', () => {
    const shared = new Map([['currentClassId', '1001']]);
    const a = openTab(shared);
    a.c.localStorage.setItem('currentClassId', '2002');
    a.c.localStorage.setItem('homeworkList', '[1]');
    assert.equal(shared.get('homeworkList-2002'), '[1]');
    a.c.localStorage.removeItem('currentClassId');
    a.c.localStorage.setItem('homeworkList', '[2]');
    assert.equal(shared.get('homeworkList'), '[2]');              // 回到預設班級：不加後綴
    a.c.ClassAwareStorage.vaultSet('currentClassId', '3003');     // 帳號收納／還原寫入的班級也算這一頁自己的
    assert.equal(a.c.ClassAwareStorage.pageClassId(), '3003');
});

test('另一個分頁切班：這頁沒在忙就重新整理', () => {
    const shared = new Map([['currentClassId', '1001']]);
    const a = openTab(shared);
    a.otherTabSwitchesTo('2002');
    assert.equal(a.reloads(), 1);
    assert.equal(a.c.sessionStorage.getItem('classChangedElsewhere'), '1');
});

test('另一個分頁切班：上課中或正在打字先不打斷，告一段落（切回分頁）才重新整理', () => {
    const shared = new Map([['currentClassId', '1001']]);
    const a = openTab(shared, { busy: true });
    a.otherTabSwitchesTo('2002');
    assert.equal(a.reloads(), 0);
    a.state.busy = false; a.state.typing = true;
    a.fire('focus');
    assert.equal(a.reloads(), 0);
    a.state.typing = false;
    a.fireDoc('visibilitychange');
    assert.equal(a.reloads(), 1);
});

test('另一個分頁又切回同一班：不用重新整理', () => {
    const shared = new Map([['currentClassId', '1001']]);
    const a = openTab(shared, { busy: true });
    a.otherTabSwitchesTo('2002');
    a.otherTabSwitchesTo('1001');
    a.state.busy = false;
    a.fire('focus');
    assert.equal(a.reloads(), 0);
});

test('其他分頁改的不是班級（例如主題）：不理會', () => {
    const shared = new Map([['currentClassId', '1001']]);
    const a = openTab(shared);
    a.fire('storage', { key: 'theme', newValue: 'dark', storageArea: a.c.localStorage });
    assert.equal(a.reloads(), 0);
});

test('LocalDataHold：記號依班級分開，清除後恢復；這次開頁發現壞資料也算暫停', () => {
    const shared = new Map([['currentClassId', '1001']]);
    const a = openTab(shared);
    const H = a.c.LocalDataHold;
    assert.equal(H.has('1001'), false);
    H.set('1001', ['students-1001']);
    assert.equal(H.has('1001'), true); assert.equal(H.has('2002'), false);
    assert.ok(shared.has('class-manager-corrupt-hold:1001'));     // 名稱帶本站前綴
    H.clear('1001');
    assert.equal(H.has('1001'), false);
    a.c.__localDataCorrupt = ['students-1001'];                   // 這次開頁讀到壞資料、記號還沒寫成功
    assert.equal(H.has('1001'), true); assert.equal(H.has('2002'), false);
    H.clear('1001');
    assert.equal(H.has('1001'), false);
});

console.log(passed + ' class tab isolation checks passed');
