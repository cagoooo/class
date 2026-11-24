// 使用者輸入的文字顯示時要跳脫（2026-11-24，全站檢測第 11 項）
//  - 姓名、班級名稱、作業名稱等可以從 Excel、備份檔、雲端還原進來，不保證乾淨
//  - 資料編號會被拼進按鈕的點擊指令，備份檔可以把編號寫成一段程式
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const HTML = fs.readFileSync('classnew.html', 'utf8');
const read = (f) => fs.readFileSync(f, 'utf8');

function grab(src, signature) {
    const start = src.indexOf(signature);
    assert.ok(start >= 0, '找不到 ' + signature);
    let depth = 0, i = src.indexOf('{', start);
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) break;
    }
    return src.slice(start, i + 1);
}

let passed = 0;
function test(name, fn) { fn(); console.log('PASS', name); passed++; }

// 真正的 Validator 與 safeId
const ctx = { window: {} };
vm.createContext(ctx);
const safeIdLine = HTML.split('\n').find((l) => l.includes('window.safeId = '));
vm.runInContext(grab(HTML, 'class Validator {') + '; this.Validator = Validator;' + safeIdLine, ctx);
const esc = (t) => ctx.Validator.escapeHtml(t);
const safeId = ctx.window.safeId;

test('escapeHtml：跳脫 & < > " \'，空值回傳空字串，數字先轉字串', () => {
    assert.equal(esc('<img src=x onerror="a(\'b\')">&'), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
    assert.equal(esc(null), '');
    assert.equal(esc(undefined), '');
    assert.equal(esc(0), '0');
    assert.equal(esc(60105), '60105');
    assert.equal(esc('王小明'), '王小明');
    assert.equal(esc('瑪法·達魯 O\'Neil'), '瑪法·達魯 O&#39;Neil');
    // 舊版用 div.innerHTML 轉，不會跳脫引號，放在屬性值裡會跳出去
    assert.ok(!esc('" onmouseover="x').includes('"'));
});

test('safeId：數字與單純的英數編號原樣放行，其他一律變成 0', () => {
    assert.equal(safeId(1795473629603), 1795473629603);
    assert.equal(safeId('1795473629603'), '1795473629603');
    assert.equal(safeId('default'), 'default');
    assert.equal(safeId('ann_1k2j3-x'), 'ann_1k2j3-x');
    assert.equal(safeId(-3), -3);
    for (const bad of ['1);alert(1);//', "1');alert(1);//", '1,alert(1)', 'a b', 'x"onmouseover="y', '`${1}`', '', null, undefined, {}, [], NaN, Infinity, '1.5.toString()', 'a.b']) {
        assert.equal(safeId(bad), 0, '應該擋下：' + String(bad));
    }
});

test('搜尋標記：先跳脫文字再插入標記，搜尋字也跳脫；標記功能照常', () => {
    const c = { escapeHtml: esc };
    vm.createContext(c);
    vm.runInContext(grab(read('js/student-enhancement.js'), 'function highlightSearchText(') + '; this.h = highlightSearchText;', c);
    const marked = c.h('王小明', '小');
    assert.match(marked, /^王<mark[^>]*>小<\/mark>明$/);
    assert.equal(c.h('王小明', ''), '王小明');
    const evil = c.h('<img src=x onerror=alert(1)>', 'img');
    assert.ok(!/<img/i.test(evil), '姓名裡的標籤不可以原樣輸出');
    assert.match(evil, /&lt;<mark[^>]*>img<\/mark> src=x/);
    assert.ok(!/<(?!\/?mark\b)/.test(c.h('A&B<C', '<')), '除了 mark 以外不可以有其他標籤');
    assert.ok(!c.h('Tom & Jerry', 'amp').includes('<mark'), '不可以去標記跳脫後才出現的字（&amp; 裡的 amp）');
    assert.equal(c.h('A&B', 'B').replace(/<[^>]+>/g, ''), 'A&amp;B');
});

test('所有拼進按鈕點擊指令的資料編號都經過 safeId', () => {
    const DATA_IDS = ['student.id', 'entry.id', 'homework.id', 'homeworkId', 'ann.id', 'p.id', 'curId', 'studentId', 'subject.id', 'subjectId', 'absence.id'];
    const files = ['classnew.html', ...fs.readdirSync('js').filter((f) => f.endsWith('.js')).map((f) => 'js/' + f)];
    let wrapped = 0;
    for (const file of files) {
        const src = read(file);
        for (const m of src.matchAll(/on(?:click|change|dblclick|input|keydown|blur)="[^"]*"/g)) {
            for (const id of DATA_IDS) {
                assert.ok(!m[0].includes('${' + id + '}'), `${file}：${m[0].slice(0, 80)} 的 ${id} 沒有經過 safeId`);
                if (m[0].includes('${safeId(' + id + ')}')) wrapped++;
            }
        }
    }
    assert.ok(wrapped >= 40, '應該有 40 處以上（實際 ' + wrapped + '）');
});

test('已知會顯示使用者文字的位置都有跳脫（原始碼檢查，防止改回去）', () => {
    const mustNot = [
        ['classnew.html', /truncate">\$\{student\.name\}</],
        ['classnew.html', /\$\{student\.number\}\. \$\{student\.name\}</],
        ['classnew.html', /whitespace-pre-wrap">\$\{entry\.content\}</],
        ['classnew.html', /text-gray-800">\$\{group\.name\}</],
        ['js/student-enhancement.js', />\$\{student\.name\}<\/p>/],
        ['js/student-enhancement.js', /font-semibold text-gray-700">\$\{currentSearchQuery\}</],
        ['js/data-reports.js', /report-name">\$\{student\.name\}</],
        ['js/data-reports.js', /<span>\$\{r\.reason \|\| '無說明'\}<\/span>/],
        ['js/health-panel.js', /\$\{user\.(displayName|email)\}/],
    ];
    for (const [file, pattern] of mustNot) assert.doesNotMatch(read(file), pattern, file + ' 又出現沒有跳脫的寫法：' + pattern);
    // 各模組自己的跳脫函式不可以再用「div.innerHTML」那種不處理引號的寫法
    for (const file of ['js/homework-enhancement.js', 'js/exam-proctor.js', 'js/announcement.js']) {
        const fn = grab(read(file), 'function escapeHtml(');
        assert.ok(fn.includes('&quot;') && fn.includes('&lt;'), file + ' 的 escapeHtml 要處理引號與角括號');
    }
    assert.ok(HTML.includes('window.escapeHtml = (text) => Validator.escapeHtml(text);'));
});

console.log(passed + ' html-escape checks passed');
