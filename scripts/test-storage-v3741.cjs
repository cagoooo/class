// 全站檢測「其餘發現」第三批：本機儲存、備份、匯入（v3.74.1）
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const read = f => fs.readFileSync(f, 'utf8');
/** 分頁環境裡的陣列和這裡的不是同一種，用內容比對 */
const same = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);
const HTML = read('classnew.html');

let passed = 0;
function test(name, fn) { fn(); console.log('PASS', name); passed++; }
function grab(src, signature) {
    const start = src.indexOf(signature);
    assert.ok(start >= 0, '找不到 ' + signature);
    let depth = 0, i = src.indexOf('{', start);
    for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
    return src.slice(start, i + 1);
}
function loadIntegrity() {
    const c = { window: {} }; c.window = c; vm.createContext(c);
    vm.runInContext(read('js/backup-integrity.js'), c);
    return c.BackupIntegrity;
}
const base = () => ({ version: '1.2', students: [{ id: 1, name: '甲', points: 1 }], groups: [{ id: 'g1', name: '一組' }], pointsHistory: [{ id: 5, points: 1 }, { id: 6, points: 2 }] });

test('備份：紀錄或分組編號重複時自動換新編號，匯出與還原都不再整份失敗', () => {
    const BI = loadIntegrity();
    const data = base();
    data.pointsHistory.push({ id: 5, points: 3 });                 // 和第一筆重複
    data.groups.push({ id: 'g1', name: '二組' });
    assert.equal(BI.validate(data), false);
    const rows = BI.encode(data);
    assert.equal(BI.encode.lastIssue, 'repaired');
    const back = BI.decode(rows);
    same(back.pointsHistory.map(r => String(r.id)), ['5', '6', '5-2']);
    same(back.groups.map(g => g.id), ['g1', 'g1-2']);
    same(data.pointsHistory.map(r => r.id), [5, 6, 5], '不改動原本的資料');
});

test('備份：修不好的資料（學生編號重複）照樣匯出給老師登成績，但還原時擋下', () => {
    const BI = loadIntegrity();
    const data = base();
    data.students.push({ id: 1, name: '乙' });
    const rows = BI.encode(data);
    assert.equal(BI.encode.lastIssue, 'invalid');
    assert.throws(() => BI.decode(rows), /格式不完整/);
    BI.encode(base());
    assert.equal(BI.encode.lastIssue, '');
    assert.match(read('js/data-backup.js'), /BackupIntegrity\.encode\.lastIssue === 'invalid'/);
});

test('匯入：其他資料型別不對的項目不寫入（保留原本內容），並告訴老師', () => {
    const src = read('js/data-backup.js');
    const c = {}; vm.createContext(c);
    vm.runInContext('this.fn = function ' + grab(src, 'static invalidExtraKeys(data)').replace('static invalidExtraKeys', 'invalidExtraKeys'), c);
    same([...c.fn({ notebookEntries: '壞掉', homeworkChecks: [], boardNote: { x: 1 }, examSubjects: [], seatingConfig: {}, boardActivity: 'quiet', students: [] })],
        ['notebookEntries', 'homeworkChecks', 'boardNote']);
    assert.match(src, /if \(skipped\.includes\(k\)\) return;/);
});

test('備份模組沒載入時：「下載備份」不能當成已備份', () => {
    assert.match(grab(HTML, 'function notReady()'), /return false;/);
    assert.match(read('js/data-safety-guard.js'), /if \(DB && DB\.export && !DB\.__fallback\)/);
});

test('「30 天內不用提醒」只管很久沒備份；儲存空間快滿照樣提醒', () => {
    const fn = grab(read('js/data-safety-guard.js'), 'function checkStorage(force)');
    assert.match(fn, /const stale = !snoozed && daysSince/);
    assert.doesNotMatch(fn, /if \(Date\.now\(\) < snooze\) return;/);
});

test('儲存空間滿了：未登入老師的自動備份只留這一班最新一份，不是整個不動', () => {
    const store = new Map();
    let quotaOnce = true;
    class S { getItem(k) { return store.get(k) ?? null; } setItem(k, v) { if (quotaOnce && k === 'big') { quotaOnce = false; const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; } store.set(k, String(v)); } removeItem(k) { store.delete(k); } key(i) { return [...store.keys()][i] ?? null; } get length() { return store.size; } }
    const local = new S();
    store.set('currentClassId', 'c2');
    store.set('classManager_autoBackup', JSON.stringify([{ classId: 'c1', students: [1] }, { classId: 'c2', students: [2, 2] }, { classId: 'c2', students: [3] }]));
    const c = { Storage: S, localStorage: local, sessionStorage: new S(), console: { log() {}, warn() {}, error() {} }, document: { addEventListener() {}, getElementById() { return null; } }, addEventListener() {}, setTimeout() {}, setInterval() {}, alert() {}, FirebaseConfig: { isGoogleUser: () => false } };
    c.window = c; vm.createContext(c); vm.runInContext(read('js/class-aware-storage.js'), c);
    local.setItem('big', 'x');
    const kept = JSON.parse(store.get('classManager_autoBackup'));
    same(kept.map(b => b.classId), ['c2']);
    same(kept[0].students, [2, 2]);
    assert.equal(store.get('big'), 'x', '清完之後重試成功');
});

test('自動備份：除了份數也看大小，太大時先丟其他班級最舊的', () => {
    const src = read('js/data-reports.js');
    assert.match(src, /const BACKUP_MAX_CHARS = 1200000;/);
    assert.match(grab(src, 'function pruneBackups(list, here, now)'), /kept\.length > BACKUP_MAX_TOTAL \|\| tooBig\(\)/);
});

test('刪除班級：該班在本機的資料鍵一起清掉，別班與預設班不受影響', () => {
    const src = read('js/class-profiles.js');
    const store = new Map([['students-c9', '[]'], ['homeworkList-c9', '[]'], ['groups-c9', '[]'], ['class-manager-corrupt-hold:c9', '{}'],
        ['students-c10', '[1]'], ['students', '[2]'], ['homeworkList', '[3]'], ['homeworkList-c90', '[4]']]);
    const c = { DEFAULT_ID: 'default', localStorage: { getItem: k => store.get(k) ?? null, removeItem: k => store.delete(k) }, window: {} };
    c.window = { ClassAwareStorage: { SHARED_KEYS: ['homeworkList', 'notebookEntries'], rawGet: k => store.get(k) ?? null, rawRemove: k => store.delete(k) } };
    vm.createContext(c);
    vm.runInContext('const DEFAULT_ID = "default";\n' + grab(src, 'function removeClassKeys(id)') + '\nthis.r = removeClassKeys;', c);
    assert.equal(c.r('c9'), 4);
    same([...store.keys()].sort(), ['homeworkList', 'homeworkList-c90', 'students', 'students-c10']);
    assert.equal(c.r('default'), 0);
    assert.match(grab(src, 'async delete(id)'), /removeClassKeys\(id\);/);
});

test('另一個分頁正在換帳號（2 分鐘內的標記）：這一頁的班級資料寫入先不存；舊標記不擋', () => {
    const store = new Map([['workspaceOwner', 'teacherA']]);
    class S { getItem(k) { return store.get(k) ?? null; } setItem(k, v) { store.set(k, String(v)); } removeItem(k) { store.delete(k); } key(i) { return [...store.keys()][i] ?? null; } get length() { return store.size; } }
    const local = new S();
    const c = { Storage: S, localStorage: local, sessionStorage: new S(), console: { log() {}, warn() {}, error() {} }, document: { addEventListener() {}, getElementById() { return null; } }, addEventListener() {}, setTimeout() {}, setInterval() {}, alert() {} };
    c.window = c; vm.createContext(c); vm.runInContext(read('js/class-aware-storage.js'), c);
    c.AccountVault = { isDeviceKey: k => k === 'theme' };
    store.set('workspaceSwitching', JSON.stringify({ at: new Date().toISOString(), phase: 'stashing' }));
    local.setItem('students', '[1]');
    local.setItem('theme', 'dark');
    assert.equal(store.has('students'), false);
    assert.equal(store.get('theme'), 'dark', '這台電腦的設定照常');
    store.set('workspaceSwitching', JSON.stringify({ at: new Date(Date.now() - 10 * 60000).toISOString() }));
    local.setItem('students', '[1]');
    assert.equal(store.get('students'), '[1]');
});

test('裝置偏好（麥克風校正、番茄鐘、背景音樂、備份提醒稍後）不跟著帳號收走', () => {
    const src = read('js/account-vault.js');
    for (const k of ['quietChallengeCfg', 'pomodoroSettings', 'timerBgmSettings', 'dsg_bannerSnoozeUntil']) assert.match(src, new RegExp("'" + k + "'"));
});

test('學期封存預設標籤：1 月算前一年的上學期', () => {
    const src = read('js/semester-archive.js');
    const line = src.split(/\r?\n/).find(l => l.includes('const DEFAULT_ARCHIVE_KEY'));
    const key = (y, m) => { const c = { CURRENT_YEAR: y, CURRENT_MONTH: m, CURRENT_SEMESTER: m >= 2 && m <= 7 ? 'S2' : 'S1' }; vm.createContext(c); return vm.runInContext(line.replace('const ', 'this.') , c); };
    assert.equal(key(2027, 1), '2026-S1');
    assert.equal(key(2026, 11), '2026-S1');
    assert.equal(key(2027, 3), '2027-S2');
});

test('考試設定幾項一起存（空間不足時整批退回）；其他小功能存不進去會提醒', () => {
    const exam = read('js/exam-proctor.js');
    assert.match(grab(exam, 'function saveData()'), /window\.SafeStorage\.write\(pairs, \{ context: '儲存考試設定' \}\)/);
    for (const f of ['js/quiet-challenge.js', 'js/points-enhancement.js', 'js/brush-check.js', 'js/class-board.js']) {
        assert.match(read(f), /catch \(e\) \{ warnNotSaved\(e\); \}/, f);
    }
});

test('Excel 匯入：自動判斷標題列與欄位順序；同名同姓不再整批擋下', () => {
    const c = { Validator: { halfWidthDigits: t => String(t) } };
    vm.createContext(c);
    vm.runInContext(grab(HTML, 'function detectExcelLayout(rows)') + '\nthis.d = detectExcelLayout;', c);
    const plain = x => JSON.parse(JSON.stringify(x));
    assert.deepEqual(plain(c.d([['姓名', '座號'], ['王小明', 1]])), { start: 1, nameCol: 0, seatCol: 1 });
    assert.deepEqual(plain(c.d([['座號', '姓名'], [1, '王小明']])), { start: 1, nameCol: 1, seatCol: 0 });
    assert.deepEqual(plain(c.d([['王小明', 1], ['李小華', 2]])), { start: 0, nameCol: 0, seatCol: 1 }, '沒有標題列：第一位不能不見');
    assert.deepEqual(plain(c.d([[1, '王小明'], [2, '李小華'], [3, '陳大同']])), { start: 0, nameCol: 1, seatCol: 0 }, '座號在前面');
    const imp = grab(HTML, 'function handleExcelImport()');
    assert.doesNotMatch(imp, /學生「\$\{name\}」已存在/);
    assert.match(imp, /skippedSame\.push\(name\)/);
    assert.match(imp, /Validator\.validateStudentName\(name\)/);
});

console.log(passed + ' storage v3.74.1 checks passed');
