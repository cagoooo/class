// 全站檢測「其餘發現」第二批：作業、考試、公告、評語、匯出（v3.74.0）
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const read = f => fs.readFileSync(f, 'utf8');

let passed = 0;
function test(name, fn) { fn(); console.log('PASS', name); passed++; }

/** 從原始碼抓出一個函式（依大括號配對），在乾淨環境裡執行 */
function grab(src, signature) {
    const start = src.indexOf(signature);
    assert.ok(start >= 0, '找不到 ' + signature);
    let depth = 0, i = src.indexOf('{', start);
    for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
    return src.slice(start, i + 1);
}

test('公告到期：用日曆天數算（當天到期顯示「今日到期」，前一天顯示「明日到期」）', () => {
    const src = read('js/announcement.js');
    let now = new Date(2026, 10, 23, 8, 0, 0);
    const c = { Date: class extends Date { constructor(...a) { if (a.length) super(...a); else super(now.getTime()); } static now() { return now.getTime(); } }, Math };
    vm.createContext(c); vm.runInContext(grab(src, 'function formatExpiry(isoString)'), c);
    const due = new Date(2026, 10, 23, 23, 59, 59).toISOString();
    assert.equal(c.formatExpiry(due), '今日到期');
    now = new Date(2026, 10, 22, 8, 0, 0);
    assert.equal(c.formatExpiry(due), '明日到期');
    now = new Date(2026, 10, 21, 23, 0, 0);
    assert.equal(c.formatExpiry(due), '2 天後到期');
    now = new Date(2026, 10, 24, 0, 0, 1);
    assert.equal(c.formatExpiry(due), '已過期');
});

test('CSV 匯出：名稱有雙引號、逗號不會把欄位切錯；= + - @ 開頭不會被 Excel 當成公式', () => {
    for (const file of ['js/data-reports.js', 'js/homework-enhancement.js']) {
        const c = {}; vm.createContext(c); vm.runInContext(grab(read(file), 'function csvCell(value)'), c);
        assert.equal(c.csvCell('國語"習作",第一課'), '"國語""習作"",第一課"', file);
        assert.equal(c.csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`, file);
        assert.equal(c.csvCell('+1 加分'), `"'+1 加分"`, file);
        assert.equal(c.csvCell(null), '""', file);
        assert.equal(c.csvCell(7), '"7"', file);
    }
    assert.doesNotMatch(read('js/data-reports.js'), /"\$\{s\.name\}"/);
    assert.doesNotMatch(read('js/homework-enhancement.js'), /"\$\{homework\.name\}"/);
});

test('日期一律用本地時間（以前 toISOString 在早上 8 點前會差一天）', () => {
    for (const file of ['js/exam-proctor.js', 'js/homework-enhancement.js', 'js/data-safety-guard.js']) {
        assert.doesNotMatch(read(file), /toISOString\(\)\.split\('T'\)\[0\]/, file);
    }
});

test('考試：本機資料壞掉時用預設值，不讓監考模組停擺', () => {
    const src = read('js/exam-proctor.js');
    const c = { console: { warn() {} }, localStorage: { getItem: k => ({ a: '{壞掉', b: '[1,2]', c: '{"x":1}' })[k] ?? null }, JSON };
    vm.createContext(c); vm.runInContext(grab(src, 'function readStored(key, fallback, isValid)'), c);
    assert.equal(c.readStored('a', 'fb', () => true), 'fb');
    assert.equal(c.readStored('b', 'fb', v => !Array.isArray(v)), 'fb');
    assert.deepEqual(c.readStored('c', 'fb', v => typeof v === 'object').x, 1);
    assert.equal(c.readStored('none', 'fb', () => true), 'fb');
    for (const key of ['examDayPresets', 'examReminders', 'examAttendance', 'examAbsenceRecords']) {
        assert.doesNotMatch(src, new RegExp("JSON\\.parse\\(localStorage\\.getItem\\('" + key + "'\\)"), key);
    }
});

test('考試：科目依開始時間排序；新增與改時間會檢查重疊與先後', () => {
    const src = read('js/exam-proctor.js');
    const c = {};
    vm.createContext(c);
    vm.runInContext(grab(src, 'function timeToMinutes(timeStr)') + '\nlet examSubjects = [{id:1,startTime:"10:25"},{id:2,startTime:"08:45"},{id:3,startTime:"09:35"}];\n' + grab(src, 'function sortSubjects()') + '\nsortSubjects(); this.out = examSubjects.map(s => s.id);', c);
    assert.deepEqual([...c.out], [2, 3, 1]);
    assert.match(grab(src, 'function saveData()'), /sortSubjects\(\);/);
    const add = grab(src, 'window.addExamSubject = function ()');
    assert.match(add, /checkTimeConflicts\(\{ id: null, startTime, endTime \}, examSubjects\)/);
    const pickConfirm = grab(src, 'window.confirmTimePicker = function (subjectId, timeType)');
    assert.match(pickConfirm, /結束時間必須晚於開始時間/);
    assert.match(pickConfirm, /checkTimeConflicts\(/);
    assert.match(pickConfirm, /selectedMin \? selectedMin\.dataset\.min : oldM/, '分鐘不是 5 的倍數時沿用原本的時間');
});

test('考試：實到人數與缺考備註換日就清空（只改畫面，不在開頁時寫回）', () => {
    const src = read('js/exam-proctor.js');
    let today = '2026-11-24';
    const c = { localDay: () => today };
    vm.createContext(c);
    vm.runInContext('let examAttendance = { expected: 28, present: 25, absentNote: "3 號請假", day: "2026-11-23" };\n' + grab(src, 'function rollAttendanceDay()') + '\nthis.att = () => examAttendance; this.roll = rollAttendanceDay;', c);
    assert.equal(c.roll(), true);
    assert.equal(c.att().absentNote, ''); assert.equal(c.att().present, 28);
    assert.equal(c.roll(), false);
    vm.runInContext('examAttendance = { expected: 28, present: 25, absentNote: "舊版沒有日期" };', c);
    assert.equal(c.roll(), false, '沒有日期的舊資料不動');
    assert.equal(c.att().absentNote, '舊版沒有日期');
    assert.doesNotMatch(grab(src, 'function rollAttendanceDay()'), /setItem/);
    assert.match(grab(src, 'function saveData()'), /examAttendance\.day = localDay\(\);/);
});

test('作業：「全部完成」「全部重置」會蓋掉已登記的狀態時先確認', () => {
    const src = read('js/homework-enhancement.js');
    const fn = grab(src, 'window.setAllHomeworkStatus = async function (status)');
    assert.match(fn, /位同學已經登記了其他狀態/);
    assert.ok(fn.indexOf('ConfirmDialog.show') < fn.indexOf("window.SafeStorage.set('homeworkChecks'"));
});

test('評語：打姓名或改字數上限時沿用同一組句子；選太多會說明哪些沒用到；複製失敗會提示', () => {
    const src = read('js/comment-gen.js');
    const c = {}; vm.createContext(c);
    vm.runInContext(grab(src, 'function seeded(seed)') + '\nconst a = seeded(42), b = seeded(42); this.same = [a(), a(), a()].join() === [b(), b(), b()].join();', c);
    assert.equal(c.same, true);
    assert.doesNotMatch(src, /Math\.floor\(Math\.random\(\) \* (arr|avail)\.length\)/);
    assert.match(src, /if \(from !== 'cg-name' && from !== 'cg-cap'\) wordingSeed =/);
    assert.match(src, /沒用到：\$\{skipped\.join\('、'\)\}/);
    assert.match(src, /const ok = document\.execCommand\('copy'\);/);
});

console.log(passed + ' homework/exam v3.74 checks passed');
