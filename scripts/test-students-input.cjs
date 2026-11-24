// 學生姓名／座號輸入（classnew.html 行內程式：Validator、parseBatchStudentLines、updateStudentIdentity）
// 舊版：姓名用中英數白名單，瑪法·達魯、伊替‧達飛、Mary-Ann、O'Neil、𠮷田 全被拒；座號上限 999、
//       1.5 被 parseInt 當成 1；批次貼上「王小明,1」姓名變「王小明,1」、「Mary Ann 3」姓名只剩 Mary 且座號被吞掉，
//       沒寫座號的人一律從 1 開始（和別人重複）；學生卡片沒有修改姓名／座號的入口。
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const SRC = fs.readFileSync('classnew.html', 'utf8');
const ENH = fs.readFileSync('js/student-enhancement.js', 'utf8');

function grab(signature) {
    const start = SRC.indexOf(signature);
    assert.ok(start >= 0, '找不到 ' + signature);
    let depth = 0, i = SRC.indexOf('{', start);
    for (; i < SRC.length; i++) {
        if (SRC[i] === '{') depth++;
        else if (SRC[i] === '}' && --depth === 0) break;
    }
    return SRC.slice(start, i + 1);
}
const VALIDATOR = grab('class Validator {');
const PARSE = grab('function parseBatchStudentLines(text, existing)');
const IDENTITY = grab('function updateStudentIdentity(id, nameInput, numberInput)');
const ADD_STUDENT = grab('function addStudent()');

let passed = 0;
function test(name, fn) { fn(); console.log('PASS', name); passed++; }
const J = x => JSON.stringify(x);

// ───────── 共用環境 ─────────
function makeEnv(init = {}) {
    const rec = { writes: [], render: 0, select: 0, hw: 0, success: [], writeResult: true };
    const ctx = {
        console, JSON, Math, Number, String, Array, Object, Set, Map, parseInt, isNaN,
        document: { createElement: () => ({ set textContent(v) { this._t = v; }, get innerHTML() { return String(this._t); } }) },
        NotificationSystem: { success: m => rec.success.push(m), error() {}, warning() {} },
        SafeStorage: {
            write(pairs, opts) {
                rec.writes.push(Array.from(pairs, p => [p[0], p[1]]));
                if (rec.writeResult) return true;
                if (opts && opts.rollback) opts.rollback();
                return false;
            },
        },
        renderStudents: () => rec.render++, updatePointsStudentSelect: () => rec.select++, updateHomeworkCheckList: () => rec.hw++,
        rec,
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(`
        ${VALIDATOR}
        Validator.SEAT_MAX = 99999;
        globalThis.Validator = Validator;
        var STUDENTS_KEY = 'students', GROUPS_KEY = 'groups';
        var students = ${J(init.students || [])};
        var groups = ${J(init.groups || [])};
        ${PARSE}
        ${IDENTITY}
        function __state() { return { students, groups }; }
    `, ctx);
    return { ctx, rec, state: () => JSON.parse(JSON.stringify(vm.runInContext('__state()', ctx))) };
}
const V = makeEnv().ctx.Validator;
const parse = (text, existing) => {
    const r = makeEnv().ctx.parseBatchStudentLines(text, existing || []);
    return JSON.parse(JSON.stringify(r));
};
const brief = r => r.rows.map(x => [x.name, x.number, x.auto]);

// ───────── 1. validateStudentName ─────────
test('validateStudentName：間隔號、連字號、撇號、罕用字、單字都接受（舊版中英數白名單全部拒絕）', () => {
    for (const n of ['瑪法·達魯', '伊替‧達飛', '阿美．陳', 'Mary-Ann', "O'Neil", '𠮷田', '丁', '歐陽 小明']) {
        const r = V.validateStudentName(n);
        assert.equal(r.valid, true, n);
        assert.equal(r.value, n);
    }
});
test('validateStudentName：拒絕空字串、只有空白、<img src=x>、含雙引號、只有數字', () => {
    for (const n of ['', '   ', '<img src=x>', '王"明', '王>明', '12', '1 2', null, undefined, 123]) {
        const r = V.validateStudentName(n);
        assert.equal(r.valid, false, String(n));
        assert.ok(r.message, String(n) + ' 要有說明文字');
    }
});
test('validateStudentName：頭尾空白會去掉；超過 50 字截斷', () => {
    assert.equal(V.validateStudentName('  王小明 \t').value, '王小明');
    assert.equal(V.validateStudentName('甲'.repeat(80)).value.length, 50);
});

// ───────── 2. validateSeatNumber ─────────
test('validateSeatNumber：接受 5、60123、99999、全形１２→12、數字字串、前後空白', () => {
    assert.equal(V.validateSeatNumber(5).value, 5);
    assert.equal(V.validateSeatNumber('60123').value, 60123);
    assert.equal(V.validateSeatNumber('99999').value, 99999);
    assert.equal(V.validateSeatNumber('１２').value, 12);
    assert.equal(V.validateSeatNumber(' 7 ').value, 7);
    assert.equal(V.validateSeatNumber('1').value, 1);
    for (const n of [5, '60123', '１２']) assert.equal(typeof V.validateSeatNumber(n).value, 'number');
});
test('validateSeatNumber：拒絕 0、100000、1.5（舊版當成 1）、abc、空字串、-3、null', () => {
    for (const n of ['0', 0, '100000', '1.5', 1.5, 'abc', '', '-3', -3, null, undefined, '5a', '1e3']) {
        const r = V.validateSeatNumber(n);
        assert.equal(r.valid, false, String(n));
        assert.ok(r.message);
    }
});

// ───────── 3. parseBatchStudentLines ─────────
test('沒寫座號的人接在上一行座號後面自動編（張小美 = 3、auto），沒有重複（舊版張小美拿到 1）', () => {
    const r = parse('王小明 1\n李小華 2\n張小美\n陳小強 4');
    assert.deepEqual(r.errors, []);
    assert.deepEqual(brief(r), [['王小明', 1, false], ['李小華', 2, false], ['張小美', 3, true], ['陳小強', 4, false]]);
    assert.equal(new Set(r.rows.map(x => x.number)).size, 4);
});

test('各種分隔寫法：逗號、全形逗號、Tab、空格、座號在前、「3號」都抓得到姓名與座號（舊版姓名變成「王小明,1」或「1」）', () => {
    const cases = [
        ['王小明,1', 1], ['王小明，1', 1], ['1\t王小明', 1], ['1 王小明', 1], ['3號 王小明', 3],
        ['王小明 7', 7], ['王小明\t7', 7], ['王小明、8', 8], ['王小明;9', 9], ['王小明　10', 10], ['王小明 １１', 11], ['王小明 12號', 12],
    ];
    for (const [text, seat] of cases) {
        const r = parse(text);
        assert.deepEqual(r.errors, [], text);
        assert.deepEqual(brief(r), [['王小明', seat, false]], text);
    }
});

test('英文姓名「Mary Ann 3」→ 姓名 Mary Ann、座號 3（舊版姓名 Mary、座號被吞掉）', () => {
    assert.deepEqual(brief(parse('Mary Ann 3')), [['Mary Ann', 3, false]]);
    assert.deepEqual(brief(parse('5 Mary Ann')), [['Mary Ann', 5, false]]);
    assert.deepEqual(brief(parse('瑪法·達魯 6')), [['瑪法·達魯', 6, false]]);
});

test('第一行是標題（座號 Tab 姓名／姓名 座號）：略過不報錯', () => {
    for (const head of ['座號\t姓名', '姓名 座號', '姓名,座號', '學號 姓名']) {
        const r = parse(head + '\n王小明 1\n李小華 2');
        assert.deepEqual(r.errors, [], head);
        assert.deepEqual(brief(r), [['王小明', 1, false], ['李小華', 2, false]], head);
    }
});

test('單獨一行 12：報錯「看不出姓名」，行號是原始行號（中間有空行不跳掉）', () => {
    const r = parse('王小明 1\n\n12');
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /第 3 行/);
    assert.match(r.errors[0], /看不出姓名/);
    assert.deepEqual(brief(r), [['王小明', 1, false]]);
    const r2 = parse('\n\n\n12\n王小明');
    assert.match(r2.errors[0], /第 4 行/);
    assert.equal(r2.rows[0].line, 5);
    // 「12號」「３號」也是只有座號，不能建出名字叫「12號」的學生
    for (const only of ['12號', '３號', '60105']) {
        const r3 = parse(only);
        assert.deepEqual(r3.rows, [], only);
        assert.match(r3.errors[0], /看不出姓名/, only);
    }
});

test('接在既有名單後面：1~25 → 新同學 = 26；60101~60125 → 轉學生 = 60126；甲 30 後面的乙 = 31', () => {
    const seq = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => ({ name: '舊' + (from + i), number: from + i }));
    assert.deepEqual(brief(parse('新同學', seq(1, 25))), [['新同學', 26, true]]);
    assert.deepEqual(brief(parse('轉學生', seq(60101, 60125))), [['轉學生', 60126, true]]);
    assert.deepEqual(brief(parse('甲 30\n乙')), [['甲', 30, false], ['乙', 31, true]]);
    assert.deepEqual(brief(parse('甲 30\n乙', seq(1, 25))), [['甲', 30, false], ['乙', 31, true]]);
    // 既有名單座號亂序、最大值在中間：仍接在最大值後
    assert.deepEqual(brief(parse('新人', [{ name: 'a', number: 9 }, { name: 'b', number: 3 }])), [['新人', 10, true]]);
});

test('自動編號會跳過同批已經寫明的座號：「甲 / 乙 2 / 丙」→ 甲 1、乙 2、丙 3', () => {
    assert.deepEqual(brief(parse('甲\n乙 2\n丙')), [['甲', 1, true], ['乙', 2, false], ['丙', 3, true]]);
    assert.deepEqual(brief(parse('甲\n乙\n丙 2')), [['甲', 1, true], ['乙', 3, true], ['丙', 2, false]]);
});

test('重複檢查：同名（既有／同一批）、座號重複（既有／同一批）都報錯，且該行不收', () => {
    const roster = [{ name: '王小明', number: 1 }, { name: '李小華', number: 2 }];
    let r = parse('王小明', roster);
    assert.match(r.errors[0], /已存在/); assert.equal(r.rows.length, 0);
    r = parse('張三 5\n張三 6');
    assert.equal(r.errors.length, 1); assert.match(r.errors[0], /第 2 行/); assert.match(r.errors[0], /已存在/);
    assert.deepEqual(brief(r), [['張三', 5, false]]);
    r = parse('張三 2', roster);
    assert.match(r.errors[0], /座號 2 已被使用/); assert.equal(r.rows.length, 0);
    r = parse('張三 5\n李四 5');
    assert.match(r.errors[0], /第 2 行/); assert.match(r.errors[0], /座號 5 已被使用/);
});

test('座號不合法：0、6 位數、小數相關寫法都報錯', () => {
    let r = parse('王小明 0');
    assert.equal(r.errors.length, 1); assert.equal(r.rows.length, 0);
    r = parse('王小明 123456');
    assert.equal(r.errors.length, 1); assert.match(r.errors[0], /99999/);
    r = parse('王小明 100000');
    assert.equal(r.errors.length, 1);
    r = parse('王小明 99999');
    assert.deepEqual(r.errors, []);
    assert.deepEqual(brief(r), [['王小明', 99999, false]]);
    r = parse('<b>壞人</b> 3');
    assert.equal(r.errors.length, 1); assert.equal(r.rows.length, 0);
});

test('全部沒寫座號（空班 3 人）→ 1、2、3，全部 auto', () => {
    assert.deepEqual(brief(parse('甲\n乙\n丙')), [['甲', 1, true], ['乙', 2, true], ['丙', 3, true]]);
});

test('CRLF 換行、行首行尾空白、全形空白分隔、空輸入都正常', () => {
    assert.deepEqual(brief(parse('  王小明  1  \r\n\t李小華\t2\r\n　張小美　\r\n')), [['王小明', 1, false], ['李小華', 2, false], ['張小美', 3, true]]);
    assert.deepEqual(parse(''), { rows: [], errors: [] });
    assert.deepEqual(parse(null), { rows: [], errors: [] });
    assert.deepEqual(parse('\n  \n\t\n'), { rows: [], errors: [] });
    assert.deepEqual(brief(parse('王小明 1', undefined)), [['王小明', 1, false]]);
});

test('parseBatchStudentLines 不會改動傳入的既有名單', () => {
    const roster = [{ name: '王小明', number: 1 }];
    const snap = J(roster);
    parse('李小華\n張小美', roster);
    assert.equal(J(roster), snap);
});

// ───────── 4. updateStudentIdentity ─────────
const mkStudents = () => [
    { id: 101, name: '舊名', number: 5, points: 12, avatar: '🐱', tags: ['愛問問題'], records: [{ id: 1, points: 2 }], createdAt: '2026-09-01T00:00:00.000Z' },
    { id: 102, name: '李小華', number: 6, points: 3, avatar: '🐶', tags: [], records: [] },
    { id: 103, name: '無座號', points: 0, records: [] },
];
const mkGroups = () => [
    { id: 1, name: '第 1 組', members: [{ id: 101, name: '舊名', number: 5 }, { id: 102, name: '李小華', number: 6 }], score: 4 },
    { id: 2, name: '第 2 組', members: [{ id: 103, name: '無座號' }], score: 0 },
];
const withMock = () => makeEnv({ students: mkStudents(), groups: mkGroups() });

test('改姓名與座號成功：只更新 name／number，id、points、avatar、tags、records 不變', () => {
    const e = withMock();
    const r = e.ctx.updateStudentIdentity(101, '新名字', '60126');
    assert.deepEqual({ ...r }, { ok: true });
    const s = e.state().students;
    const want = mkStudents()[0];
    assert.deepEqual(s[0], { ...want, name: '新名字', number: 60126 });
    assert.deepEqual(s[1], mkStudents()[1]);
    assert.deepEqual(s[2], mkStudents()[2]);
    assert.equal(e.rec.render, 1); assert.equal(e.rec.select, 1); assert.equal(e.rec.hw, 1);
    assert.equal(e.rec.success.length, 1);
});

test('同時寫入 students 與 groups 兩個鍵；組內該成員跟著改，其他成員與其他組不變', () => {
    const e = withMock();
    e.ctx.updateStudentIdentity(101, '新名字', 60126);
    assert.equal(e.rec.writes.length, 1);
    const pairs = e.rec.writes[0];
    assert.deepEqual(pairs.map(p => p[0]), ['students', 'groups']);
    const savedStudents = JSON.parse(pairs[0][1]), savedGroups = JSON.parse(pairs[1][1]);
    assert.equal(savedStudents[0].name, '新名字'); assert.equal(savedStudents[0].number, 60126);
    assert.deepEqual(savedGroups[0].members[0], { id: 101, name: '新名字', number: 60126 });
    assert.deepEqual(savedGroups[0].members[1], { id: 102, name: '李小華', number: 6 });
    assert.deepEqual(savedGroups[0].score, 4);
    assert.deepEqual(savedGroups[1], mkGroups()[1]);
    assert.deepEqual(e.state().groups, savedGroups, '寫入成功後記憶體裡的 groups 也更新');
});

test('沒有分組、或該生不在任何組：只寫 students 一個鍵', () => {
    const none = makeEnv({ students: mkStudents(), groups: [] });
    none.ctx.updateStudentIdentity(101, '新名字', 5);
    assert.deepEqual(none.rec.writes[0].map(p => p[0]), ['students']);
    const notIn = makeEnv({ students: mkStudents(), groups: [{ id: 9, name: '別組', members: [{ id: 102, name: '李小華', number: 6 }] }] });
    notIn.ctx.updateStudentIdentity(101, '新名字', 5);
    assert.deepEqual(notIn.rec.writes[0].map(p => p[0]), ['students']);
});

test('只改姓名（座號沒動）也能存；只改座號也能存', () => {
    const e = withMock();
    assert.equal(e.ctx.updateStudentIdentity('101', '改名', '5').ok, true);   // id 用字串也找得到
    assert.equal(e.state().students[0].name, '改名'); assert.equal(e.state().students[0].number, 5);
    assert.equal(e.ctx.updateStudentIdentity(101, '改名', '8').ok, true);
    assert.equal(e.state().students[0].number, 8);
});

test('座號和別人重複 → ok:false、訊息含對方姓名、資料不變、沒有寫入', () => {
    const e = withMock();
    const r = e.ctx.updateStudentIdentity(101, '舊名', '6');
    assert.equal(r.ok, false);
    assert.match(r.message, /李小華/);
    assert.deepEqual(e.state().students, mkStudents());
    assert.equal(e.rec.writes.length, 0);
    assert.equal(e.rec.render, 0);
});

test('姓名不合法／座號不合法／找不到學生 → ok:false、資料不變、沒有寫入', () => {
    const e = withMock();
    for (const [id, n, num] of [[101, '<b>', 5], [101, '', 5], [101, '12', 5], [101, '好名', '0'], [101, '好名', 'abc'], [101, '好名', '100000'], [101, '好名', '1.5'], [101, '好名', ''], [999, '好名', 5]]) {
        const r = e.ctx.updateStudentIdentity(id, n, num);
        assert.equal(r.ok, false, J([id, n, num]));
        assert.ok(r.message);
    }
    assert.deepEqual(e.state().students, mkStudents());
    assert.deepEqual(e.state().groups, mkGroups());
    assert.equal(e.rec.writes.length, 0);
});

test('內容沒變 → ok:true、unchanged:true、沒有寫入也沒有重繪', () => {
    const e = withMock();
    const r = e.ctx.updateStudentIdentity(101, '舊名', '5');
    assert.deepEqual({ ...r }, { ok: true, unchanged: true });
    assert.equal(e.ctx.updateStudentIdentity(101, '  舊名  ', 5).unchanged, true);
    assert.equal(e.rec.writes.length, 0);
    assert.equal(e.rec.render, 0);
    assert.equal(e.rec.success.length, 0);
});

test('寫入失敗（write 回傳 false 並跑 rollback）→ ok:false，記憶體 name／number 回到原值、groups 不變', () => {
    const e = withMock();
    e.rec.writeResult = false;
    const r = e.ctx.updateStudentIdentity(101, '新名字', '60126');
    assert.equal(r.ok, false);
    assert.ok(r.message);
    assert.equal(e.state().students[0].name, '舊名');
    assert.equal(e.state().students[0].number, 5);
    assert.deepEqual(e.state().students, mkStudents());
    assert.deepEqual(e.state().groups, mkGroups(), '失敗時 groups 不能被動到');
    assert.equal(e.rec.success.length, 0);
    assert.equal(e.rec.render, 1, '失敗後仍重繪一次，讓畫面回到真實資料');
});

test('原本沒有座號的學生：座號留空只改姓名 → 成功、number 維持原樣（不會被補成 0 或 null）', () => {
    const e = withMock();
    const r = e.ctx.updateStudentIdentity(103, '補名字', '');
    assert.equal(r.ok, true);
    const s = e.state().students[2];
    assert.equal(s.name, '補名字');
    assert.ok(!('number' in s) || s.number === undefined);
    const g = e.state().groups[1].members[0];
    assert.equal(g.name, '補名字');
    // 之後也可以替他補一個座號
    assert.equal(e.ctx.updateStudentIdentity(103, '補名字', '7').ok, true);
    assert.equal(e.state().students[2].number, 7);
});

test('有座號的學生把座號欄清空 → 不接受（座號一定要是合法座號）', () => {
    const e = withMock();
    assert.equal(e.ctx.updateStudentIdentity(101, '舊名', '').ok, false);
    assert.deepEqual(e.state().students, mkStudents());
});

test('五碼座號 60126、99999 可以存；和既有五碼座號重複會擋', () => {
    const roster = [{ id: 1, name: 'A', number: 60101 }, { id: 2, name: 'B', number: 60102 }];
    const e = makeEnv({ students: roster, groups: [] });
    assert.equal(e.ctx.updateStudentIdentity(1, 'A', '60126').ok, true);
    assert.equal(e.state().students[0].number, 60126);
    const dup = e.ctx.updateStudentIdentity(2, 'B', '60126');
    assert.equal(dup.ok, false); assert.match(dup.message, /A/);
    assert.equal(e.ctx.updateStudentIdentity(2, 'B', '99999').ok, true);
});

// ───────── 5. 原始碼檢查 ─────────
test('原始碼：addStudent 用 validateSeatNumber，不再有 validateNumber(numberInput, 1, 999)', () => {
    assert.match(ADD_STUDENT, /Validator\.validateSeatNumber\(numberInput\)/);
    assert.ok(!/validateNumber\(numberInput,\s*1,\s*999\)/.test(ADD_STUDENT));
    assert.ok(!/validateNumber\(numberInput,\s*1,\s*999\)/.test(SRC));
    assert.match(SRC, /Validator\.SEAT_MAX = 99999;/);
});

test('原始碼：學生卡片有「✏️ 修改」按鈕呼叫 showStudentEditor(id)，且該函式已定義並呼叫 updateStudentIdentity', () => {
    assert.match(ENH, /onclick="showStudentEditor\(\$\{safeId\(student\.id\)\}\)"/);
    assert.match(ENH, /function showStudentEditor\(studentId\)/);
    const body = (() => {
        const start = ENH.indexOf('function showStudentEditor(');
        let depth = 0, i = ENH.indexOf('{', start);
        for (; i < ENH.length; i++) { if (ENH[i] === '{') depth++; else if (ENH[i] === '}' && --depth === 0) break; }
        return ENH.slice(start, i + 1);
    })();
    assert.match(body, /updateStudentIdentity\(studentId,/);
    assert.match(body, /max = '99999'/, '座號輸入框上限要跟 SEAT_MAX 一致');
});

console.log(`${passed} students-input checks passed`);
