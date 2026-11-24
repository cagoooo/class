// 本機自動備份要認班級：快照記下是哪一班的、只能還原回同一班、分組讀寫目前班級的那一份（v3.73.1）
// 以前所有班級共用一份沒記班級的清單：在乙班按「恢復」會把甲班的學生寫進乙班；
// 分組固定讀寫預設班級的鍵，在其他班級還原時改到的是預設班的分組。
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const STORAGE_SRC = fs.readFileSync('js/class-aware-storage.js', 'utf8');
const REPORTS_SRC = fs.readFileSync('js/data-reports.js', 'utf8');
const PROFILES = [{ id: 'default', name: '預設班級' }, { id: 'c2', name: '五年二班' }, { id: 'c3', name: '六年<一>班' }];

/** 開一頁（指定班級）。shared 是共用的 localStorage 內容。 */
function openPage(shared, classId, options = {}) {
    if (classId === 'default') shared.delete('currentClassId'); else shared.set('currentClassId', classId);
    class Storage {
        constructor(data) { this.data = data; }
        getItem(k) { return this.data.get(k) ?? null; }
        setItem(k, v) { if (options.quota && k === 'classManager_autoBackup' && String(v).length > options.quota) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } this.data.set(k, String(v)); }
        removeItem(k) { this.data.delete(k); }
        key(i) { return [...this.data.keys()][i] ?? null; }
        get length() { return this.data.size; }
    }
    const local = new Storage(shared), notices = [];
    let modal = null, reloads = 0, confirmText = '';
    const element = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, set onclick(v) {}, innerHTML: '' });
    const c = {
        Storage, localStorage: local, sessionStorage: new Storage(new Map()),
        console: { log() {}, warn() {}, error() {} },
        document: {
            readyState: 'loading', hidden: false, hasFocus: () => true, activeElement: { matches: () => false },
            addEventListener() {}, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
            createElement: element, head: { appendChild() {} }, body: { appendChild(el) { modal = el; } },
        },
        addEventListener() {}, setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
        alert(m) { notices.push('alert:' + m); }, confirm(m) { confirmText = m; return options.decline ? false : true; },
        location: { reload() { reloads++; } },
        NotificationSystem: { warning(m) { notices.push('warning:' + m); }, success(m) { notices.push('success:' + m); }, show() {} },
        ClassProfiles: { list: () => options.profiles || PROFILES },
        escapeHtml: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    };
    c.window = c; vm.createContext(c);
    vm.runInContext(STORAGE_SRC, c);
    const suffix = classId === 'default' ? '' : '-' + classId;
    c.STUDENTS_KEY = 'students' + suffix; c.POINTS_HISTORY_KEY = 'pointsHistory' + suffix; c.GROUPS_KEY = 'groups' + suffix;
    c.students = JSON.parse(local.getItem(c.STUDENTS_KEY) || '[]');
    vm.runInContext(REPORTS_SRC, c);
    return {
        c, notices, reloads: () => reloads, confirmText: () => confirmText,
        backup() { c.performManualBackup(); return JSON.parse(shared.get('classManager_autoBackup') || '[]'); },
        modalHtml() { c.showBackupManager(); return modal.innerHTML; },
        setStudents(list) { c.students = list; local.setItem(c.STUDENTS_KEY, JSON.stringify(list)); },
    };
}
const json = (shared, key) => JSON.parse(shared.get(key) || 'null');
const roster = (...names) => names.map((name, i) => ({ id: name.charCodeAt(0) * 100 + i, name, points: i }));
function twoClasses() {
    return new Map([
        ['students', JSON.stringify(roster('預設甲', '預設乙'))], ['groups', JSON.stringify([{ id: 1, name: '預設班第一組' }])],
        ['students-c2', JSON.stringify(roster('二班小明', '二班小華', '二班大同'))], ['groups-c2', JSON.stringify([{ id: 9, name: '二班第一組' }])],
    ]);
}

let passed = 0;
function test(name, fn) { fn(); console.log('PASS', name); passed++; }

test('在其他班級備份：快照記下班級，分組存的是這一班的', () => {
    const shared = twoClasses();
    const [b] = openPage(shared, 'c2').backup();
    assert.equal(b.classId, 'c2'); assert.equal(b.className, '五年二班');
    assert.deepEqual(b.students.map(s => s.name), ['二班小明', '二班小華', '二班大同']);
    assert.deepEqual(b.groups.map(g => g.name), ['二班第一組']);
});

test('在其他班級還原：還原的是這一班的分組，預設班級的分組不會被動到', () => {
    const shared = twoClasses();
    openPage(shared, 'c2').backup();
    shared.set('groups-c2', JSON.stringify([{ id: 9, name: '二班改壞的組名' }]));
    shared.set('groups', JSON.stringify([{ id: 1, name: '預設班後來改的組名' }]));
    const page = openPage(shared, 'c2');
    page.c.restoreBackup(0);
    assert.equal(json(shared, 'groups-c2')[0].name, '二班第一組');
    assert.equal(json(shared, 'groups')[0].name, '預設班後來改的組名');
    assert.ok(page.notices.some(n => /已恢復備份/.test(n)));
});

test('別班的快照不能還原進目前的班級，清單也只列這一班的', () => {
    const shared = twoClasses();
    openPage(shared, 'c2').backup();
    const page = openPage(shared, 'default');
    const html = page.modalHtml();
    assert.match(html, /這個班級尚無備份/);
    assert.match(html, /另有 1 份是其他班級的備份/);
    assert.doesNotMatch(html, /restoreBackup\(/);
    page.c.restoreBackup(0);                                      // 就算硬叫也不行
    assert.deepEqual(json(shared, 'students').map(s => s.name), ['預設甲', '預設乙']);
    assert.ok(page.notices.some(n => /五年二班/.test(n) && /不能還原到目前的班級/.test(n)));
    assert.equal(page.confirmText(), '');                          // 連確認視窗都不會出現
});

test('清單：每一班各看各的，恢復按鈕帶的是整份清單裡的位置；班級名稱有特殊符號也安全', () => {
    const shared = twoClasses();
    shared.set('students-c3', JSON.stringify(roster('六年級甲')));
    openPage(shared, 'default').backup(); openPage(shared, 'c2').backup(); openPage(shared, 'c3').backup();
    const html = openPage(shared, 'default').modalHtml();
    assert.match(html, /restoreBackup\(2\)/);                      // 預設班的那份排在第三（最舊）
    assert.doesNotMatch(html, /restoreBackup\([01]\)/);
    assert.match(html, /另有 2 份是其他班級的備份/);
    const c3 = openPage(shared, 'c3').modalHtml();
    assert.match(c3, /六年&lt;一&gt;班/); assert.doesNotMatch(c3, /六年<一>班/);
});

test('內容沒變不重複存；有變才存，每班最多留 2 份，別班的不會被擠掉', () => {
    const shared = twoClasses();
    openPage(shared, 'default').backup();
    const page = openPage(shared, 'c2');
    assert.equal(page.backup().length, 2);
    assert.equal(page.backup().length, 2);                         // 內容一樣：不多存
    page.setStudents(roster('二班小明', '二班小華'));
    assert.equal(page.backup().length, 3);
    page.setStudents(roster('二班小明'));
    const list = page.backup();
    assert.deepEqual(list.map(b => b.classId + ':' + b.students.length), ['c2:1', 'c2:2', 'default:2']);   // 三人的那份被最舊規則淘汰
});

test('誤刪後還救得回來：清空名單後再備份一次，前一個狀態還在', () => {
    const shared = twoClasses();
    const page = openPage(shared, 'c2');
    page.backup();
    page.setStudents([]);                                          // 不小心清空
    page.backup(); page.backup(); page.backup();                   // 之後每 5 分鐘再備份，內容沒變不會把舊的擠掉
    const list = json(shared, 'classManager_autoBackup');
    assert.deepEqual(list.map(b => b.students.length), [0, 3]);
    page.c.restoreBackup(1);
    assert.equal(json(shared, 'students-c2').length, 3);
});

test('全部班級合計最多 8 份：超過時先丟其他班級最舊的', () => {
    const shared = new Map();
    const profiles = [];
    for (let i = 1; i <= 6; i++) {
        const id = 'k' + i; profiles.push({ id, name: '班級' + i });
        shared.set('students-' + id, JSON.stringify(roster('學生' + i)));
        const page = openPage(shared, id, { profiles });
        page.backup(); page.setStudents(roster('學生' + i, '轉學生' + i)); page.backup();
    }
    const list = json(shared, 'classManager_autoBackup');
    assert.equal(list.length, 8);
    assert.equal(list.filter(b => b.classId === 'k6').length, 2);  // 目前班級的兩份都在
    assert.equal(list.filter(b => b.classId === 'k1').length, 0);  // 最舊的班級先被淘汰
});

test('空間不夠：只留這一班最新的一份，不是整個清掉', () => {
    const shared = twoClasses();
    openPage(shared, 'default').backup();
    const big = shared.get('classManager_autoBackup').length;
    const page = openPage(shared, 'c2', { quota: big + 250 });      // 放得下一份、放不下兩份
    const list = page.backup();
    assert.equal(list.length, 1); assert.equal(list[0].classId, 'c2');
});

test('舊版快照（沒記班級）：只有一個班級時照常還原，連分組一起', () => {
    const shared = new Map([['students', JSON.stringify(roster('甲'))], ['groups', '[]'],
        ['classManager_autoBackup', JSON.stringify([{ timestamp: new Date().toISOString(), students: roster('甲', '乙'), pointsHistory: [], notebookEntries: [], groups: [{ id: 1, name: '舊分組' }], seatingConfig: {} }])]]);
    const page = openPage(shared, 'default', { profiles: [PROFILES[0]] });
    assert.match(page.modalHtml(), /restoreBackup\(0\)/);
    page.c.restoreBackup(0);
    assert.equal(json(shared, 'students').length, 2);
    assert.equal(json(shared, 'groups')[0].name, '舊分組');
    assert.doesNotMatch(page.confirmText(), /沒有記錄是哪個班級/);
});

test('舊版快照、有多個班級：學生對得上才算這一班的；對不上就不能還原', () => {
    const shared = twoClasses();
    shared.set('classManager_autoBackup', JSON.stringify([{ timestamp: new Date().toISOString(), students: roster('二班小明', '二班小華', '二班大同', '二班轉學生'), pointsHistory: [], notebookEntries: [], groups: [{ id: 1, name: '其實是預設班的分組' }], seatingConfig: {} }]));
    const other = openPage(shared, 'default');
    assert.doesNotMatch(other.modalHtml(), /restoreBackup\(/);
    other.c.restoreBackup(0);
    assert.equal(json(shared, 'students').length, 2);              // 預設班沒被換成二班的學生
    const page = openPage(shared, 'c2');
    assert.match(page.modalHtml(), /restoreBackup\(0\)/);
    page.c.restoreBackup(0);
    assert.equal(json(shared, 'students-c2').length, 4);
    assert.equal(json(shared, 'groups-c2')[0].name, '二班第一組');  // 舊快照裡的分組是預設班的：不寫進二班
    assert.equal(json(shared, 'groups')[0].name, '預設班第一組');   // 也不去動預設班
});

test('舊版快照、看不出是哪一班的（這一班現在沒有學生）：列出來但加註，還原前特別提醒', () => {
    const shared = twoClasses();
    shared.set('students-c2', '[]');
    shared.set('classManager_autoBackup', JSON.stringify([{ timestamp: new Date().toISOString(), students: roster('二班小明'), pointsHistory: [], notebookEntries: [], groups: [], seatingConfig: {} }]));
    const page = openPage(shared, 'c2', { decline: true });
    assert.match(page.modalHtml(), /舊版備份，未記錄班級/);
    page.c.restoreBackup(0);
    assert.match(page.confirmText(), /沒有記錄是哪個班級/);
    assert.equal(shared.get('students-c2'), '[]');                 // 老師按取消：不動
});

test('舊版快照超過 7 天就丟掉', () => {
    const shared = twoClasses();
    const old = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
    shared.set('classManager_autoBackup', JSON.stringify([{ timestamp: old, students: roster('甲'), pointsHistory: [], notebookEntries: [], groups: [], seatingConfig: {} }]));
    const list = openPage(shared, 'c2').backup();
    assert.deepEqual(list.map(b => b.classId), ['c2']);
});

test('原始碼：缺考名單與人數以這一頁現在的名單為準；舊的狀態副本改讀目前班級的鍵', () => {
    const exam = fs.readFileSync('js/exam-proctor.js', 'utf8');
    assert.doesNotMatch(exam, /if \(typeof AppState !== 'undefined' && AppState\.students && AppState\.students\.length > 0\) \{\s*students = AppState\.students;\s*\} else if \(window\.students/);
    assert.equal((exam.match(/if \(Array\.isArray\(window\.students\)\) \{/g) || []).length, 2);
    for (const file of ['js/app-state.js', 'js/storage-manager.js', 'js/homework-enhancement.js']) {
        const src = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(src, /(_loadFromStorage|StorageManager\.get|localStorage\.getItem)\('(students|groups|pointsHistory)'/, file);
    }
    assert.doesNotMatch(REPORTS_SRC, /getItem\('groups'\)|\['groups', JSON/);
});

console.log(passed + ' auto-backup per-class checks passed');
