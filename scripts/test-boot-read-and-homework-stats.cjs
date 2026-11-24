// 主頁面（classnew.html）行內程式的兩項保護（v3.71.1）：
//  1. 開機讀取本機資料：內容壞掉時用空白代替、保留原內容、記下「暫停上傳」，不讓整頁無法啟動
//  2. 刪除學生後，作業統計只計算目前名單上的學生（不會出現完成率 150%、未檢查 -1、未知學生）
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const SRC = fs.readFileSync('classnew.html', 'utf8');

/** 從 start 開始抓一段完整的 function（用大括號配對找結尾）。 */
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

let passed = 0;
function test(name, fn) { fn(); console.log('PASS', name); passed++; }

// ───────── 1. 開機讀取 ─────────
function bootEnv(initial) {
    const data = new Map(Object.entries(initial));
    const ctx = {
        console: { error() {} },
        localStorage: { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) },
        _curClassId: 'default',
    };
    ctx.window = ctx; vm.createContext(ctx);
    vm.runInContext('window.__localDataCorrupt = [];' + grabFunction('function bootRead(key, fallback, important)') + ';this.bootRead = bootRead;', ctx);
    return { ctx, data, read: (...a) => ctx.bootRead(...a) };
}

test('主頁面不再直接 JSON.parse 開機資料', () => {
    const boot = SRC.slice(SRC.indexOf('// 全域變數'), SRC.indexOf('// --- 全螢幕時鐘變數 ---'));
    assert.ok(boot.length > 200);
    assert.doesNotMatch(boot, /JSON\.parse\(localStorage\.getItem/);
    for (const key of ['STUDENTS_KEY', 'POINTS_HISTORY_KEY', 'GROUPS_KEY', "'notebookEntries'", "'homeworkList'", "'homeworkChecks'"]) {
        assert.ok(boot.includes(`bootRead(${key}, `), key + ' 要走 bootRead');
    }
});

test('正常資料照舊讀出；沒有資料用預設值', () => {
    const e = bootEnv({ students: JSON.stringify([{ id: 1 }]), homeworkChecks: JSON.stringify({ 1: { 1: 'completed' } }), noRepeatLottery: 'false' });
    assert.equal(JSON.stringify(e.read('students', [], true)), JSON.stringify([{ id: 1 }]));
    assert.equal(JSON.stringify(e.read('homeworkChecks', {}, true)), JSON.stringify({ 1: { 1: 'completed' } }));
    assert.equal(e.read('noRepeatLottery', true, false), false);
    assert.equal(JSON.stringify(e.read('groups', [], true)), '[]');
    assert.equal(e.read('missing', true, false), true);
    assert.equal(e.ctx.__localDataCorrupt.length, 0);
});

test('壞掉的內容（不是合法資料、形狀不對）：用空白代替、不丟例外、保留原內容並記下來', () => {
    const e = bootEnv({ students: '[1,2', pointsHistory: 'undefined', homeworkList: '{"a":1}', homeworkChecks: '[1]', groups: '"abc"' });
    assert.equal(JSON.stringify(e.read('students', [], true)), '[]');
    assert.equal(JSON.stringify(e.read('pointsHistory', [], true)), '[]');
    assert.equal(JSON.stringify(e.read('homeworkList', [], true)), '[]');      // 應該是陣列卻是物件
    assert.equal(JSON.stringify(e.read('homeworkChecks', {}, true)), '{}');    // 應該是物件卻是陣列
    assert.equal(JSON.stringify(e.read('groups', [], true)), '[]');
    assert.deepEqual([...e.ctx.__localDataCorrupt], ['students', 'pointsHistory', 'homeworkList', 'homeworkChecks', 'groups']);
    assert.equal(e.data.get('class-manager-corrupt:students:default'), '[1,2');
    assert.equal(e.data.get('students'), '[1,2', '原本的 key 不動');
});

test('不重要的資料（抽籤紀錄等）壞掉：只用空白代替，不暫停同步', () => {
    const e = bootEnv({ lotteryHistory: 'oops', drawnStudentIds: '{}' });
    assert.equal(JSON.stringify(e.read('lotteryHistory', [], false)), '[]');
    assert.equal(JSON.stringify(e.read('drawnStudentIds', [], false)), '[]');
    assert.equal(e.ctx.__localDataCorrupt.length, 0);
});

test('已經留過一份原內容就不再覆蓋（保住最早那份）', () => {
    const e = bootEnv({ students: 'second-bad', 'class-manager-corrupt:students:default': 'first-bad' });
    e.read('students', [], true);
    assert.equal(e.data.get('class-manager-corrupt:students:default'), 'first-bad');
});

// ───────── 2. 作業統計 ─────────
function statsEnv() {
    const box = { innerHTML: '' };
    // 頁面上的 escapeHtml 由 Validator.escapeHtml 提供；測試沙盒放一個等價的小函式
    const escapeHtml = t => (t == null ? '' : String(t)).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ctx = { document: { getElementById: id => id === 'checkHomework' ? { value: '1' } : box }, students: [], homeworkChecks: {}, currentVisibleList: null, escapeHtml };
    vm.createContext(ctx);
    vm.runInContext(grabFunction('function updateHomeworkStats()') + ';this.run = updateHomeworkStats;', ctx);
    const numbers = () => [...box.innerHTML.matchAll(/font-bold text-[a-z]+-600">(-?[\d.]+%?)</g)].map(m => m[1]);
    return { ctx, box, numbers };
}

test('刪除學生後：統計只算目前名單上的學生', () => {
    const e = statsEnv();
    e.ctx.students = [{ id: 1, name: '甲' }, { id: 2, name: '乙' }];                       // 原本 3 位，刪掉 id 3
    e.ctx.homeworkChecks = { 1: { 1: 'completed', 2: 'completed', 3: 'completed' } };       // id 3 的紀錄還留著
    e.ctx.run();
    const text = e.box.innerHTML.replace(/\s+/g, ' ');
    assert.match(text, /100\.0%/);
    assert.doesNotMatch(text, /150\.0%/);
    assert.doesNotMatch(text, />-\d+</, '不可以出現負數');
    assert.equal(e.numbers()[0], '2', '已完成只算 2 位');
});

test('刪除學生後：未交名單不會出現「未知學生」', () => {
    const e = statsEnv();
    e.ctx.students = [{ id: 1, name: '甲' }, { id: 2, name: '乙' }];
    e.ctx.homeworkChecks = { 1: { 1: 'incomplete', 3: 'incomplete' } };
    e.ctx.run();
    assert.doesNotMatch(e.box.innerHTML, /未知學生/);
    assert.match(e.box.innerHTML, /甲/);
    assert.equal(JSON.stringify(e.ctx.homeworkChecks), JSON.stringify({ 1: { 1: 'incomplete', 3: 'incomplete' } }), '紀錄本身不刪');
});

console.log(passed + ' boot read and homework stats checks passed');
