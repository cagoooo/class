// 深色模式文字對比（2026-11-24，全站檢測第 25 項）
// 實際畫面的量測是在瀏覽器裡做的（17 個分頁＋7 個彈出視窗，深色模式才變差的 27 處全部修到 4.5 以上）。
// 這支測試鎖住兩件事，避免之後改回去：
//  1. js/theme-toggle.js 裡那些修正規則還在
//  2. 規則用的顏色配上它實際落在的底色，對比都有 4.5（WCAG AA）
const fs = require('node:fs'), assert = require('node:assert/strict');
const CSS = fs.readFileSync('js/theme-toggle.js', 'utf8');

let passed = 0;
function test(name, fn) { fn(); console.log('PASS', name); passed++; }

const lum = (hex) => {
    const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// 深色模式的底色（theme-toggle.js 的變數）
const SURFACE = '#1e293b', SURFACE_RAISED = '#334155';
const vars = { '--text-primary': '#f1f5f9', '--text-secondary': '#cbd5e1' };

/** 找出某個選擇器所在規則設定的文字顏色（變數換成實際色碼）。 */
function colorOf(selector) {
    const at = CSS.indexOf(selector);
    assert.ok(at >= 0, '找不到規則：' + selector);
    const block = CSS.slice(at, CSS.indexOf('}', at));
    const m = /color:\s*(#[0-9a-fA-F]{6}|var\((--[a-z-]+)\))/.exec(block);
    assert.ok(m, selector + ' 沒有設定文字顏色');
    assert.ok(block.includes('!important'), selector + ' 要用 !important（各功能自己的樣式比較晚載入）');
    return m[2] ? vars[m[2]] : m[1];
}

test('對比計算本身正確', () => {
    assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
    assert.equal(contrast('#777777', '#777777'), 1);
    // 修正前量到的幾個數字（瀏覽器量測 1.42、2.67、2.0），確認算法和當時一致
    assert.equal(contrast('#374151', SURFACE).toFixed(2), '1.42');
    assert.equal(contrast('#047857', SURFACE).toFixed(2), '2.67');
    assert.equal(contrast('#9a3412', SURFACE).toFixed(2), '2.00');
});

test('深色底上的說明文字：改用淺色後對比都在 4.5 以上', () => {
    const onDark = [
        ['.dark .empty-state-title', SURFACE], ['.dark .empty-state-desc', SURFACE],
        ['.dark .cg-sub', SURFACE], ['.dark .bc-title', SURFACE], ['.dark .zslot-stats', SURFACE],
        ['.dark .cg-name-row > label', SURFACE], ['.dark .lt-poolinfo {', SURFACE],
        ['.dark #studentsList .class-management-action summary', SURFACE],
        ['.dark #backup-section .text-emerald-800 {', SURFACE],
        ['.dark #backup-section .bg-slate-50 .text-amber-700', SURFACE],
        ['.dark #studentsList .text-red-600', SURFACE], ['.dark #danger-zone .text-red-700', SURFACE],
        ['.dark .report-stat-label', SURFACE], ['.dark .homework-view-btn:not(.active)', SURFACE_RAISED],
    ];
    for (const [selector, bg] of onDark) {
        const ratio = contrast(colorOf(selector), bg);
        assert.ok(ratio >= 4.5, `${selector} 對比只有 ${ratio.toFixed(2)}`);
    }
});

test('沒有變深的淺色卡片：裡面的字改回深色後對比都在 4.5 以上', () => {
    const onLight = [
        ['.dark #examSubjectList > div .text-gray-900 {', '#f9fafb'],   // 考試科目列（淺灰到白的漸層，取較暗的一端）
        ['.dark .ann-form-card .text-gray-700', '#ffffff'],              // 公告表單
        ['.dark #timerAlarmNext', '#fee2e2'],                            // 計時顯示區（淡紅到淡橘）
        ['.dark #timerAlarmNext', '#ffedd5'],
        ['.dark .bg-violet-50 .text-gray-700', '#f5f3ff'],               // 淡紫色提示
        ['.dark #examSubjectList > div .text-teal-700', '#f9fafb'],
        ['.dark #backup-section .bg-emerald-50 .text-emerald-800', '#ecfdf5'],   // 備份頁的淡綠狀態框
    ];
    for (const [selector, bg] of onLight) {
        const ratio = contrast(colorOf(selector), bg);
        assert.ok(ratio >= 4.5, `${selector} 在 ${bg} 上對比只有 ${ratio.toFixed(2)}`);
    }
});

test('修正只針對確定的位置，沒有整站改掉綠／琥珀／紅色的工具類別', () => {
    // 淺色提示框裡的同色深字本來是清楚的，整站改成淺色會變成淺底配淺字（實測備份頁的淡綠框就中過一次）
    for (const utility of ['text-emerald-700', 'text-amber-700', 'text-red-700', 'text-red-600']) {
        assert.doesNotMatch(CSS, new RegExp('\\n\\s*\\.dark \\.' + utility + '\\s*[,{]'), utility + ' 不可以不帶範圍就整站覆蓋');
    }
});

console.log(passed + ' dark-mode-contrast checks passed');
