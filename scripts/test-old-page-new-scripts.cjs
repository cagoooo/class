// 舊版主頁面＋新版程式檔：外部程式檔不能依賴主頁面新加的函式（v3.73.3）
// 2026-11-24 晚上一台 iPhone 拿到快取裡的 v3.71.0 主頁面，程式檔卻是新版（GitHub Pages 不看 ?v=，
// Service Worker 背景更新又把新內容存在舊網址底下），班級選單出現「Can't find variable: safeId」。
// 規則：classnew.html 提供的 safeId、escapeHtml，外部檔要用就得自帶一份（window.xxx || 後備）。
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');

const HTML = fs.readFileSync('classnew.html', 'utf8');
const HELPERS = ['safeId', 'escapeHtml'];
// 這些檔案由 pets.html 或分享頁載入、或本來就自帶，不在這條規則裡另外處理
const files = fs.readdirSync('js').filter(f => f.endsWith('.js'));
const src = f => fs.readFileSync('js/' + f, 'utf8');

let passed = 0;
function test(name, fn) { fn(); console.log('PASS', name); passed++; }

/** 主頁面裡的正本 */
function pageHelpers() {
    const c = {};
    vm.createContext(c);
    // 主頁面有兩個 escapeHtml（通知用的那個靠 document），取 Validator 那個五字元版本
    const esc = [...HTML.matchAll(/static escapeHtml\(text\) \{([\s\S]*?)\n\s{12}\}/g)].find(m => m[1].includes('&#39;'));
    assert.ok(esc, '找不到 Validator.escapeHtml');
    vm.runInContext('this.escapeHtml = function (text) {' + esc[1] + '\n};', c);
    const safe = HTML.match(/window\.safeId = (\(id\) => .+?);\n/);
    assert.ok(safe, '找不到 window.safeId');
    vm.runInContext('this.safeId = ' + safe[1], c);
    return c;
}
const SAMPLES = {
    safeId: [1, 0, -3, 12.5, NaN, Infinity, '1001', 'c2', 'a_b-9', '', 'x y', "1');alert(1);('", '<img>', null, undefined, {}, [], true],
    escapeHtml: ['王小明', '<b>粗</b>', 'A & B', `"引號" 'single'`, '', 0, 123, null, undefined, '&amp;', '<img src=x onerror=alert(1)>'],
};

test('每個用到 safeId／escapeHtml 的外部檔都自帶一份（或本來就有自己的版本）', () => {
    const missing = [];
    for (const f of files) {
        const s = src(f);
        for (const name of HELPERS) {
            const uses = new RegExp('(^|[^.\\w$])' + name + '\\(', 'm').test(s);
            if (!uses) continue;
            const local = new RegExp('(function\\s+' + name + '\\s*\\(|(const|let|var)\\s+' + name + '\\s*=)').test(s);
            if (!local) missing.push(f + ' → ' + name);
        }
    }
    assert.deepEqual(missing, []);
});

test('自帶的後備和主頁面的正本行為完全相同', () => {
    const page = pageHelpers();
    let checked = 0;
    for (const f of files) {
        for (const m of src(f).matchAll(/(?:const|var) (safeId|escapeHtml) = window\.\1 \|\| (\(.+\));\r?$/gm)) {
            const c = {}; vm.createContext(c);
            const fallback = vm.runInContext(m[2], c);
            for (const v of SAMPLES[m[1]]) {
                assert.deepEqual(fallback(v), page[m[1]](v), `${f} 的 ${m[1]}(${String(v)})`);
            }
            checked++;
        }
    }
    assert.ok(checked >= 12, '後備數量 ' + checked);
});

test('模擬舊版主頁面（沒有這兩個函式）：載入外部檔後一樣能用', () => {
    for (const [file, name, call] of [
        ['class-profiles.js', 'safeId', 'safeId'],
        ['exam-proctor.js', 'safeId', 'safeId'],
        ['data-reports.js', 'escapeHtml', 'escapeHtml'],
    ]) {
        const body = src(file);
        // 只取檔頭那一段後備定義，接在一個空的頁面環境裡執行
        const line = body.split(/\r?\n/).find(l => l.includes(`${name} = window.${name} ||`));
        const c = { window: {} }; vm.createContext(c);
        const fn = vm.runInContext('(function () { ' + line + ' return ' + call + '; })()', c);
        assert.equal(typeof fn, 'function', file);
    }
    // 不是包在函式裡的檔案用 var：會把後備掛到 window，之後載入的檔案也拿得到
    for (const file of ['student-enhancement.js', 'firebase-sync.js']) {
        const c = { window: null, console: { log() {} } }; c.window = c; vm.createContext(c);
        const head = src(file).split(/\r?\n/).filter(l => /^var (safeId|escapeHtml) = window\./.test(l)).join('\n');
        vm.runInContext(head, c);
        assert.equal(typeof c.escapeHtml, 'function', file);
        assert.equal(c.escapeHtml('<b>'), '&lt;b&gt;');
    }
});

test('新版主頁面：外部檔用的就是主頁面那一份（不會各自為政）', () => {
    const line = src('class-profiles.js').split(/\r?\n/).find(l => l.includes('safeId = window.safeId ||'));
    const pageFn = () => 'page';
    const c = { window: { safeId: pageFn } }; vm.createContext(c);
    assert.equal(vm.runInContext('(function () { ' + line + ' return safeId; })()', c), pageFn);
});

console.log(passed + ' old-page/new-scripts checks passed');
