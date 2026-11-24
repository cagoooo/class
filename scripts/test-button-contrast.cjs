// 白字配亮色底的對比修正（2026-11-24）
// 瀏覽器裡的實測：全站 17 個分頁＋8 個彈出視窗，白字配亮色底不合格的從 80 處降到 0（淺色、深色模式都是）。
// 這支測試鎖住：
//  1. css/contrast.css 和 scripts/build-contrast-css.cjs 的輸出一致（沒有人直接手改產生出來的檔案）
//  2. 樣式檔裡每一個底色配白字、每一組深色字配亮底，對比都有 4.5
//  3. 調深時色相不變（不會把藍色調成別的顏色）
//  4. 主頁面有載入這份樣式，離線快取清單也有它
const fs = require('node:fs'), assert = require('node:assert/strict');
const { build, darken, contrast, PALETTE, MODULES, DARK_TEXT, KEEP_BRIGHT } = require('./build-contrast-css.cjs');
const CSS = fs.readFileSync('css/contrast.css', 'utf8');

let passed = 0;
function test(name, fn) { fn(); console.log('PASS', name); passed++; }

const hue = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx === mn) return 0;
    const d = mx - mn, h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return h * 60;
};

test('樣式檔是腳本產生的，內容一致', () => {
    assert.equal(CSS.replace(/\r\n/g, '\n'), build(), '請執行 node scripts/build-contrast-css.cjs 重新產生 css/contrast.css');
});

test('每一條底色規則配白字的對比都在 4.5 以上', () => {
    let checked = 0;
    for (const line of CSS.split('\n')) {
        // 只看「底色」的規則：設定字色的規則（深棕色字、拉霸小字改白色）另外檢查
        if (!line.includes('{') || line.includes(`color: ${DARK_TEXT}`) || /\{\s*color:/.test(line)) continue;
        const colors = [...line.slice(line.indexOf('{')).matchAll(/#[0-9a-f]{6}/g)].map((m) => m[0]);
        for (const c of colors) {
            const ratio = contrast('#ffffff', c);
            assert.ok(ratio >= 4.5, `${line.slice(0, 60)}… 的 ${c} 配白字只有 ${ratio.toFixed(2)}`);
            checked++;
        }
    }
    assert.ok(checked > 150, '應該檢查到很多顏色（實際 ' + checked + '）');
});

test('黃、琥珀色：底色不動、字改深棕色，對比也在 4.5 以上', () => {
    for (const name of KEEP_BRIGHT) {
        for (const hex of PALETTE[name].slice(0, 2)) assert.ok(contrast(DARK_TEXT, hex) >= 4.5, `${name} ${hex} 配深棕色字只有 ${contrast(DARK_TEXT, hex).toFixed(2)}`);
    }
    assert.match(CSS, new RegExp('\\.text-white\\.bg-amber-500 \\{ color: ' + DARK_TEXT + ' !important; \\}'));
    assert.doesNotMatch(CSS, /\.text-white\.bg-(amber|yellow|lime)-(400|500) \{ background-color/, '黃、琥珀色的底色不調深（會變土黃色）');
    assert.doesNotMatch(CSS, /hover\\:bg-(amber|yellow|lime)-/, '黃、琥珀色不另外給 hover 底色（深色字配深底會看不見）');
    // 白板的琥珀色按鈕：保留琥珀色，字是深棕色
    assert.ok(CSS.includes('.cb-fsbtn[style*="#fbbf24"]'));
    assert.ok(contrast(DARK_TEXT, '#fbbf24') >= 4.5 && contrast(DARK_TEXT, '#f59e0b') >= 4.5);
});

test('調深只動亮度：色相不變，本來就合格的顏色不動', () => {
    for (const [name, shades] of Object.entries(PALETTE)) {
        for (const hex of shades) {
            const fixed = darken(hex);
            if (contrast('#ffffff', hex) >= 4.6) { assert.equal(fixed, hex, name + ' ' + hex + ' 本來就合格，不應該被改'); continue; }
            const diff = Math.abs(hue(fixed) - hue(hex));
            assert.ok(Math.min(diff, 360 - diff) <= 3, `${name} ${hex} → ${fixed} 色相跑掉了`);
            assert.ok(contrast('#ffffff', fixed) >= 4.5 && contrast('#ffffff', fixed) < 5.0, `${name} ${hex} → ${fixed} 應該只調到剛好合格`);
        }
    }
    // 幾個實際量過的例子：藍、靛、紅幾乎看不出差別
    assert.equal(darken('#3b82f6'), '#196cf4');
    assert.equal(darken('#6366f1'), '#5e61f1');
    assert.equal(darken('#ef4444'), '#e71414');
    assert.equal(darken('#22c55e'), '#178640');
});

test('通用類別只在有 text-white 的元素上生效；滑鼠移過仍有變化', () => {
    const utilityLines = CSS.split('\n').filter((l) => /^\.[a-z]/.test(l) && /(bg|from|to|via)-[a-z]+-\d{3}/.test(l));
    assert.ok(utilityLines.length > 100);
    for (const l of utilityLines) assert.ok(l.startsWith('.text-white.'), '通用類別的規則一定要帶 .text-white：' + l.slice(0, 60));
    // 底色加了 !important 之後，原本的 hover 會失效，所以每個被調深的顏色都要有 hover 規則，而且比底色更深
    for (const name of ['blue', 'green', 'teal', 'cyan', 'red', 'purple', 'indigo', 'violet', 'orange']) {
        const base = new RegExp('\\.text-white\\.bg-' + name + '-500 \\{ background-color: (#[0-9a-f]{6})').exec(CSS);
        const hover = new RegExp('\\.text-white\\.hover\\\\:bg-' + name + '-600:hover \\{ background-color: (#[0-9a-f]{6})').exec(CSS);
        assert.ok(base && hover, name + ' 要有底色與 hover 規則');
        assert.ok(contrast('#ffffff', hover[1]) > contrast('#ffffff', base[1]), name + ' 的 hover 要比底色深');
    }
});

test('各功能的按鈕：有狀態的只改對應狀態，不會把別的狀態蓋掉', () => {
    const selectors = MODULES.flatMap(([, rules]) => rules.map(([selector]) => selector));
    for (const s of selectors) assert.ok(CSS.includes(s + ' {'), '樣式檔少了 ' + s);
    // 番茄鐘：未啟用（紅）與啟用中（綠）分開寫
    assert.ok(selectors.includes('.pomodoro-toggle:not(.active)') && selectors.includes('.pomodoro-toggle.active'));
    assert.ok(!selectors.includes('.pomodoro-toggle'));
    // 選取狀態的按鈕一定帶狀態條件，沒選到的不會被塗成選取色
    for (const s of ['.ann-type-btn.selected', '.cb-sz.on', '.cb-bold.on', '.gp-seg button[aria-checked="true"]', '.gp-quick button[aria-pressed="true"]', '.qc-seg button[aria-pressed="true"]', '.lottery-type-btn[data-on="1"]']) assert.ok(selectors.includes(s), s);
});

test('主頁面載入這份樣式，離線快取清單也有；班級顏色與數據面板改在原始碼', () => {
    assert.match(fs.readFileSync('classnew.html', 'utf8'), /<link rel="stylesheet" href="css\/contrast\.css\?v=[\d.]+">/);
    assert.ok(fs.readFileSync('sw.js', 'utf8').includes("'./css/contrast.css'"));
    // 班級按鈕的漸層（白字）每個色標都合格
    const profiles = fs.readFileSync('js/class-profiles.js', 'utf8');
    const gradients = [...profiles.matchAll(/gradient: 'linear-gradient\(135deg,(#[0-9a-f]{6}),(#[0-9a-f]{6})\)'/g)];
    assert.equal(gradients.length, 8);
    for (const [, a, b] of gradients) for (const c of [a, b]) assert.ok(contrast('#ffffff', c) >= 4.5, '班級顏色 ' + c + ' 配白字只有 ' + contrast('#ffffff', c).toFixed(2));
    // 數據面板長條圖：每一條的底色與字色
    const reports = fs.readFileSync('js/data-reports.js', 'utf8');
    const bars = [...reports.matchAll(/color: '(#[0-9a-f]{6})', text: '(#[0-9a-f]{6})'/g)];
    assert.equal(bars.length, 5);
    for (const [, bg, text] of bars) assert.ok(contrast(text, bg) >= 4.5, `長條 ${bg} 配 ${text} 只有 ${contrast(text, bg).toFixed(2)}`);
    assert.ok(reports.includes('color: ${d.text};'));
});

console.log(passed + ' button-contrast checks passed');
