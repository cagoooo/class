// 開頁不載入 Excel 工具（用到才載）；js/ 底下的小程式沒送到會自動補載一次。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('classnew.html', 'utf8');
assert.ok(!/<script[^>]+src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx/.test(html), 'Excel 工具不得在開頁時用 <script src> 載入');
assert.ok(html.includes('window.ensureXLSX = function'), '要有 ensureXLSX 載入器');
for (const f of ['js/data-backup.js', 'js/grouping-enhancement.js', 'js/semester-archive.js']) {
    assert.ok(fs.readFileSync(f, 'utf8').includes('ensureXLSX'), `${f} 用到 Excel 前要先 ensureXLSX`);
}
assert.ok(/async function downloadStudentTemplate[\s\S]{0,200}ensureXLSX/.test(html), '學生名單範本要先 ensureXLSX');
assert.ok(/reader\.onload = async function[\s\S]{0,200}ensureXLSX/.test(html), '匯入學生 Excel 要先 ensureXLSX');

// 補載區塊必須在所有 js/ 小程式之前
const start = html.indexOf('<!-- SCRIPT-RETRY:START -->');
const end = html.indexOf('<!-- SCRIPT-RETRY:END -->');
assert.ok(start > 0 && end > start);
assert.ok(start < html.indexOf('<script src="js/'), '補載區塊要放在第一支 js/ 之前');
const code = html.slice(html.indexOf('<script>', start) + 8, html.lastIndexOf('</script>', end));

function setup(readyState) {
    let listener;
    const written = [], appended = [];
    const ctx = {
        URL, String, Date,
        console: { warn() {} },
        location: { href: 'https://cagoooo.github.io/class/classnew.html', origin: 'https://cagoooo.github.io' },
        addEventListener(t, fn, capture) { if (t === 'error') { assert.equal(capture, true, '要用捕獲階段才收得到載入失敗'); listener = fn; } },
        document: {
            readyState,
            write: h => written.push(h),
            createElement: () => ({ setAttribute(k, v) { this[k] = v; } }),
            head: { appendChild: el => appended.push(el) },
        },
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const script = (src, extra = {}) => ({ tagName: 'SCRIPT', src, parentNode: {}, getAttribute: k => extra[k] ?? null, ...extra });
    return { fire: el => listener({ target: el }), written, appended, ctx, script };
}

let t = setup('loading');
t.fire(t.script('https://cagoooo.github.io/class/js/data-backup.js?v=1'));
assert.equal(t.written.length, 1, '頁面還在讀時要寫在原位置，維持載入順序');
assert.match(t.written[0], /^<script src="\/class\/js\/data-backup\.js\?v=1&retry=\d+" data-retried="1"><\/script>$/);

t.fire(t.script('https://cagoooo.github.io/class/js/data-backup.js?v=1&retry=1', { 'data-retried': '1' }));
assert.equal(t.written.length, 1, '補載過的不得再補，避免無限重試');

t.fire(t.script('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'));
t.fire({ tagName: 'IMG', src: 'https://cagoooo.github.io/class/icon.png', getAttribute: () => null });
assert.equal(t.written.length, 1, '外部程式與圖片不在補載範圍');

t = setup('complete');
t.fire(t.script('https://cagoooo.github.io/class/js/pet-share.js?v=1'));
assert.equal(t.written.length, 0, '頁面讀完後不得 document.write');
assert.equal(t.appended.length, 1, '頁面讀完後改用動態載入');
assert.equal(t.appended[0]['data-retried'], '1');
console.log('PASS Excel 工具用到才載入；js/ 小程式載入失敗自動補載一次、順序不變、不無限重試');
