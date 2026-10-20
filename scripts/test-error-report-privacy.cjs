// 錯誤通報會推到 Google Chat，並在雲端 `_usageEvents` 留底約 180 天，
// 所以通報內容不可出現學生姓名，只能帶座號。這支測試實際執行主程式的
// 加扣分存檔、資料瘦身遷移、SafeStorage、ErrorHandler 與 UsageNotify，
// 檢查排進通報佇列（＝將送往雲端）的內容。學生姓名全部是測試用假名。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {
    hasLegacyStudentName,
    redactEventData,
    redactLegacyStudentNames,
} = require('../functions/privacy-redact');

const NAME_A = '王小明';
const NAME_B = '陳美美';
const QKEY = 'un_queue_v1';

let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS', name); }

function quotaError() {
    const err = new Error("Failed to execute 'setItem' on 'Storage': Setting the value exceeded the quota.");
    err.name = 'QuotaExceededError';
    err.code = 22;
    return err;
}

// 從 classnew.html 取出「資料瘦身遷移 → 錯誤通報班級資訊 → 加扣分存檔」這一段真實程式碼
function pointsSource() {
    const html = fs.readFileSync('classnew.html', 'utf8');
    const start = html.indexOf('        function migrateStudentRecords() {');
    const end = html.indexOf('        function showPointsAnimation(');
    assert.ok(start > 0 && end > start, '找不到 classnew.html 的加扣分存檔程式段落');
    return html.slice(start, end);
}

function setup({ failKeys = [], classId = 'class-601' } = {}) {
    class Storage {
        constructor() { this.data = new Map(); this.failKeys = new Set(); }
        getItem(k) { return this.data.has(k) ? this.data.get(k) : null; }
        setItem(k, v) { if (this.failKeys.has(k)) throw quotaError(); this.data.set(k, String(v)); }
        removeItem(k) { this.data.delete(k); }
        key(i) { return [...this.data.keys()][i] ?? null; }
        get length() { return this.data.size; }
    }
    const localStorage = new Storage();
    localStorage.setItem('currentClassId', classId);
    const element = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, setAttribute() {}, remove() {} });
    const ctx = {
        Storage, localStorage, sessionStorage: new Storage(),
        console: { log() {}, warn() {}, error() {} },
        navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/140' },
        location: { href: 'https://cagoooo.github.io/class/classnew.html#points' },
        document: {
            readyState: 'loading', addEventListener() {},
            head: { appendChild() {} }, body: { appendChild() {} },
            getElementById() { return null; }, createElement: element,
        },
        addEventListener() {}, setTimeout, clearTimeout, alert() {},
        NotificationSystem: { error() {}, success() {} },
        ClassProfiles: { currentProfile: () => ({ id: classId, name: '601 班' }) },
        renderStudents() {}, renderGroups() {},
        APP_VERSION: 'test',
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    for (const file of ['class-aware-storage', 'error-handler', 'usage-notify']) {
        vm.runInContext(fs.readFileSync(`js/${file}.js`, 'utf8'), ctx);
    }
    // classnew.html 主程式用的全域變數
    vm.runInContext(`
        var _curClassId = ${JSON.stringify(classId)};
        var STUDENTS_KEY = 'students-' + _curClassId;
        window.POINTS_HISTORY_KEY = 'pointsHistory-' + _curClassId;
        window.GROUPS_KEY = 'groups-' + _curClassId;
        var students = [
            { id: 1, name: ${JSON.stringify(NAME_A)}, number: 7, points: 3 },
            { id: 2, name: ${JSON.stringify(NAME_B)}, number: 12, points: 0 },
        ];
        var pointsHistory = [];
        var groups = [];
    `, ctx);
    vm.runInContext(pointsSource(), ctx);
    failKeys.forEach(k => localStorage.failKeys.add(k));
    const queue = () => JSON.parse(localStorage.getItem(QKEY) || '[]');
    return { ctx, localStorage, queue };
}

function assertNoNames(value, label) {
    const text = JSON.stringify(value);
    assert.ok(!text.includes(NAME_A) && !text.includes(NAME_B), `${label}不可出現學生姓名：${text}`);
}

(async () => {
    await test('加扣分寫入失敗：通報只帶座號、分數變化與班級代號', () => {
        const { ctx, queue } = setup({ failKeys: ['students-class-601'] });
        const student = ctx.students[0];
        const record = { id: 99, studentId: 1, points: 2 };
        student.points += 2;
        ctx.pointsHistory.unshift(record);
        assert.equal(ctx.persistPointChange(student, record, 2, null), false);
        assert.equal(student.points, 3, '寫入失敗要回復分數');
        const events = queue().filter(e => e.type === 'error');
        assert.equal(events.length, 1);
        assert.equal(events[0].context, '加扣分存檔（座號 7，+2）');
        assert.match(events[0].message, /加扣分寫入失敗：localStorage 配額已滿/);
        assert.equal(events[0].severity, 'critical');
        assert.equal(events[0].classId, 'class-601');
        assert.equal(events[0].className, '601 班');
        assert.ok(events[0].ts, '要保留發生時間');
        assertNoNames(queue(), '加扣分通報');
    });

    await test('records 遷移失敗：通報帶班級代號、不帶學生姓名', () => {
        const { ctx, queue } = setup({ failKeys: ['students-class-601'] });
        ctx.students[0].records = [{ id: 5, studentId: 1, studentName: NAME_A, points: 1, timestamp: 't' }];
        ctx.migrateStudentRecords();
        const events = queue().filter(e => e.type === 'error');
        assert.equal(events.length, 1);
        assert.equal(events[0].context, '資料瘦身遷移（待補回 1 筆）');
        assert.equal(events[0].classId, 'class-601');
        assertNoNames(queue(), '遷移通報');
    });

    await test('SafeStorage：畫面訊息可帶姓名，通報改用 reportContext 的座號', () => {
        const { ctx, localStorage, queue } = setup();
        localStorage.failKeys.add('students-class-601');
        const ok = ctx.SafeStorage.set('students-class-601', '[]', {
            context: `刪除學生（${NAME_A}）`,
            reportContext: '刪除學生（座號 7）',
        });
        assert.equal(ok, false);
        const events = queue().filter(e => e.type === 'error');
        assert.equal(events.length, 1);
        assert.equal(events[0].context, '刪除學生（座號 7）');
        assertNoNames(queue(), 'SafeStorage 通報');
    });

    await test('最後防線：瀏覽器錯誤訊息夾帶名單上的姓名也會換成座號', () => {
        const { ctx, queue } = setup();
        ctx.ErrorHandler.handle(
            new Error(`Unexpected token 'x', "[{"name":"${NAME_A}"},{"name":"${NAME_B}"}]" is not valid JSON`),
            'UNKNOWN',
            `Global Error at 某頁面（${NAME_B}）`
        );
        const ev = queue().find(e => e.type === 'error');
        assert.ok(ev, '一般錯誤仍要通報');
        assert.match(ev.message, /"name":"座號 7"/);
        assert.match(ev.context, /座號 12/);
        assertNoNames(queue(), '一般錯誤通報');
    });

    await test('舊版留在佇列裡、帶姓名的事件，送出前也會過濾', async () => {
        const { ctx, localStorage } = setup();
        localStorage.setItem(QKEY, JSON.stringify([{
            type: 'error', ts: '2026-10-01T00:00:00.000Z', app: 'class', _id: 'old-1',
            message: '加扣分寫入失敗：localStorage 配額已滿',
            context: `加扣分存檔（${NAME_A}，+1）`,
        }]));
        const sent = [];
        ctx.firebase = {
            app: () => ({ functions: () => ({ httpsCallable: () => (payload) => { sent.push(payload); return Promise.resolve({}); } }) }),
        };
        ctx.UsageNotify.dataAction('還原本機備份', '已還原快照（2 位學生）');
        for (let i = 0; i < 20 && sent.length < 2; i++) await new Promise(r => setTimeout(r, 0));
        assert.equal(sent.length, 2, '佇列裡的兩筆事件都要送出');
        assert.equal(sent[0].context, '加扣分存檔（座號 7，+1）');
        assertNoNames(sent, '實際送出的內容');
    });

    await test('後端：舊版 6 種姓名格式在留底與推播前遮蔽，新版座號格式不受影響', () => {
        const legacy = [
            [`加扣分存檔（${NAME_A}，+1）`, '加扣分存檔（已隱藏姓名，+1）'],
            [`加扣分存檔（${NAME_A}，-2）`, '加扣分存檔（已隱藏姓名，-2）'],
            [`新增學生（${NAME_A}）`, '新增學生（已隱藏姓名）'],
            [`刪除學生（${NAME_A}）`, '刪除學生（已隱藏姓名）'],
            [`更換「${NAME_A}」的頭像`, '更換「已隱藏姓名」的頭像'],
            [`修改「${NAME_A}」的標籤`, '修改「已隱藏姓名」的標籤'],
            [`設定新學生「${NAME_A}」的頭像`, '設定新學生「已隱藏姓名」的頭像'],
        ];
        legacy.forEach(([input, expected]) => {
            assert.equal(redactLegacyStudentNames(input), expected);
            assert.equal(hasLegacyStudentName(input), true);
        });
        [
            '加扣分存檔（座號 7，+1）', '加扣分存檔（座號未設定，-1）', '新增學生（座號 3）',
            '刪除學生（座號 3）', '更換學生頭像（座號 3）', '修改學生標籤（座號 3）',
            '設定新學生頭像（座號 3）', '批次新增 5 位學生', '新增作業（數學習作）', '資料瘦身遷移（待補回 3 筆）',
        ].forEach(text => {
            assert.equal(redactLegacyStudentNames(text), text, `不可誤改：${text}`);
            assert.equal(hasLegacyStudentName(text), false);
        });
        const data = redactEventData({
            type: 'error', message: 'm', context: `刪除學生（${NAME_A}）`, details: `新增學生（${NAME_B}）`,
            classId: 'class-601', name: '老師本人', email: 't@example.test',
        });
        assert.equal(data.context, '刪除學生（已隱藏姓名）');
        assert.equal(data.details, '新增學生（已隱藏姓名）');
        assert.equal(data.name, '老師本人', '老師帳號資訊不屬於學生姓名，維持原樣');
        assert.equal(redactEventData(undefined).type, undefined);
    });

    await test('原始碼守門：錯誤通報不可直接帶學生姓名', () => {
        const files = ['classnew.html', ...fs.readdirSync('js').filter(f => f.endsWith('.js')).map(f => 'js/' + f)];
        const nameRef = /student\.name|newStudent\.name|nameValidation\.value|studentName/;
        files.forEach(file => {
            const lines = fs.readFileSync(file, 'utf8').split('\n');
            lines.forEach((line, i) => {
                // SafeStorage 的 context 若帶姓名，下一行必須有不含姓名的 reportContext
                if (/^\s*context:/.test(line) && nameRef.test(line)) {
                    const next = lines[i + 1] || '';
                    assert.match(next, /^\s*reportContext:/, `${file}:${i + 1} 的 context 帶學生姓名，需加 reportContext`);
                    assert.ok(!nameRef.test(next), `${file}:${i + 2} 的 reportContext 不可帶學生姓名`);
                }
                // ErrorHandler.handle / UsageNotify 呼叫的參數不可引用學生姓名
                if (/ErrorHandler\.handle\(|UsageNotify\.(error|petError|dataAction|syncConflict)\(/.test(line)) {
                    const call = lines.slice(i, i + 8).join('\n').split(/\);\s*$/m)[0];
                    assert.ok(!nameRef.test(call), `${file}:${i + 1} 的錯誤通報引用了學生姓名`);
                }
            });
        });
    });

    console.log(`✅ 錯誤通報隱私測試通過：${passed} 項`);
})().catch((err) => { console.error(err); process.exit(1); });
