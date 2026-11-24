// 產生 css/contrast.css：白字配亮色底對比不足的地方，把底色調深到剛好合格（WCAG AA，4.5）。
//
// 2026-11-24 量過全站：白字配亮色按鈕不合格的有 80 處、66 種來源（藍 3.68、綠 2.28、青 2.43、紅 3.76…）。
// 做法是「色相、彩度不變，只把亮度一點一點往下調，調到白字對比 4.6 就停」，所以原本就接近合格的
// 藍、靛、紫、紅幾乎看不出差別，綠、青、橘會深一階。黃、琥珀色調深會變成土黃色，改成底色不動、字換成深棕色。
//
// 樣式分兩段：
//   1. 通用類別（bg-blue-500 這類）：只在同一個元素也有 text-white 時才套用，不影響沒有文字的色塊
//   2. 各功能自己定義的按鈕：逐一列出（含選取中、啟用中等狀態）
// 每條都加 !important：通用類別的樣式與各功能的樣式都是網頁載入後才插入的，順序比這份檔案晚。
//
// 改這份清單後執行：node scripts/build-contrast-css.cjs
// scripts/test-button-contrast.cjs 會檢查 css/contrast.css 和這支腳本的輸出一致，而且每個顏色都合格。
const fs = require('node:fs'), path = require('node:path');

const TARGET = 4.6;          // 留一點餘裕，四捨五入後不會掉到 4.5 以下
const HOVER_TARGET = 5.6;    // 滑鼠移上去再深一點
const DARK_TEXT = '#422006'; // 黃、琥珀色底上的深棕色字
const HOVER = 'hover' + String.fromCharCode(92) + ':';   // CSS 選擇器裡的「hover\:」（類別名稱含冒號要跳脫）

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const lum = (hex) => {
    const v = toRgb(hex).map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function toHsl(hex) {
    const [r, g, b] = toRgb(hex).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) {
        const d = mx - mn;
        s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        h = (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
    }
    return { h, s, l };
}
function fromHsl({ h, s, l }) {
    const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
    if (s === 0) return toHex([l * 255, l * 255, l * 255]);
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return toHex([f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255]);
}
/** 色相與彩度不變，亮度往下調到白字對比達標為止；本來就達標的原樣回傳。 */
function darken(hex, target = TARGET) {
    const hsl = toHsl(hex);
    let out = hex.toLowerCase();
    for (let i = 0; i < 200 && contrast('#ffffff', out) < target; i++) { hsl.l -= 0.005; out = fromHsl(hsl); }
    return out;
}

// Tailwind 3 的色票（400／500／600）
const PALETTE = {
    red: ['#f87171', '#ef4444', '#dc2626', '#b91c1c'], orange: ['#fb923c', '#f97316', '#ea580c', '#c2410c'], amber: ['#fbbf24', '#f59e0b', '#d97706', '#b45309'],
    yellow: ['#facc15', '#eab308', '#ca8a04', '#a16207'], lime: ['#a3e635', '#84cc16', '#65a30d', '#4d7c0f'], green: ['#4ade80', '#22c55e', '#16a34a', '#15803d'],
    emerald: ['#34d399', '#10b981', '#059669', '#047857'], teal: ['#2dd4bf', '#14b8a6', '#0d9488', '#0f766e'], cyan: ['#22d3ee', '#06b6d4', '#0891b2', '#0e7490'],
    sky: ['#38bdf8', '#0ea5e9', '#0284c7', '#0369a1'], blue: ['#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8'], indigo: ['#818cf8', '#6366f1', '#4f46e5', '#4338ca'],
    violet: ['#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9'], purple: ['#c084fc', '#a855f7', '#9333ea', '#7e22ce'], fuchsia: ['#e879f9', '#d946ef', '#c026d3', '#a21caf'],
    pink: ['#f472b6', '#ec4899', '#db2777', '#be185d'], rose: ['#fb7185', '#f43f5e', '#e11d48', '#be123c'],
    gray: ['#9ca3af', '#6b7280', '#4b5563', '#374151'], slate: ['#94a3b8', '#64748b', '#475569', '#334155'],
};
const SHADES = [400, 500, 600, 700];   // 700 只用來產生滑鼠移上去的顏色
const KEEP_BRIGHT = ['amber', 'yellow', 'lime'];   // 調深會變土黃／橄欖色：底色不動，字改深色

// 各功能自己定義的按鈕。solid：單色；gradient：[方向, 色標…]（色標可帶位置，例如 '#ef4444 0%'）
const MODULES = [
    ['公告：選取中的類型、發布按鈕、空白提示的按鈕', [
        ['.ann-type-btn.selected', { solid: '#6366f1' }],
        ['.ann-submit-btn', { gradient: ['135deg', '#6366f1 0%', '#8b5cf6 100%'] }],
        ['.empty-state-action', { gradient: ['135deg', '#6366f1', '#818cf8'] }],
    ]],
    ['學生：數據面板、座位表、報告卡', [
        ['.data-panel-btn', { gradient: ['135deg', '#10b981', '#059669'] }],
        ['.seating-btn.seating-btn-primary', { gradient: ['135deg', '#3b82f6', '#2563eb'] }],
        ['.seating-podium', { gradient: ['135deg', '#6366f1', '#8b5cf6'] }],
        ['.report-header', { gradient: ['135deg', '#3b82f6', '#8b5cf6'] }],
        ['.leaderboard-close-btn-footer', { gradient: ['135deg', '#667eea 0%', '#764ba2 100%'] }],
    ]],
    ['加扣分：加分項目的分數標籤', [
        ['.pt-item.pt-plus .pt-item-pts', { solid: '#16a34a' }],
    ]],
    ['分組：主要按鈕、加號、選取中的選項', [
        ['.gp-primary', { solid: '#06b6d4' }],
        ['.gp-plus', { solid: '#22c55e' }],
        ['.gp-seg button[aria-checked="true"]', { solid: '#06b6d4', border: true }],
        ['.gp-quick button[aria-pressed="true"]', { solid: '#06b6d4', border: true }],
    ]],
    ['抽籤：選取中的人數', [
        ['.lottery-type-btn[data-on="1"]', { solid: '#a855f7', border: true }],
    ]],
    ['計時器：番茄鐘（未啟用是紅色、啟用中是綠色）、背景音樂、全螢幕', [
        ['.pomodoro-toggle:not(.active)', { gradient: ['135deg', '#ef4444 0%', '#dc2626 100%'] }],
        ['.pomodoro-toggle.active', { gradient: ['135deg', '#10b981 0%', '#059669 100%'] }],
        ['#timerBgmApply', { solid: '#ef4444' }],
        ['#timerBgmPreview', { solid: '#f97316' }],
        ['.timer-expand-btn', { gradient: ['135deg', '#6366f1 0%', '#8b5cf6 100%'] }],
    ]],
    ['作業：儀表板與全螢幕按鈕', [
        ['.homework-dashboard-open-btn', { gradient: ['135deg', '#14b8a6 0%', '#0d9488 100%'] }],
        ['.homework-expand-btn', { gradient: ['135deg', '#6366f1 0%', '#8b5cf6 100%'] }],
        ['.homework-dashboard-btn.primary', { gradient: ['135deg', '#f97316 0%', '#ea580c 100%'] }],
    ]],
    ['考試：選取中的天數（樣式寫在元素上，用屬性選擇器蓋過去）', [
        ['#examDayTabs button[style*="gradient"]', { gradient: ['135deg', '#14b8a6', '#06b6d4'] }],
    ]],
    ['白板：字級與粗體的選取狀態、全螢幕按鈕、右側工具', [
        ['.cb-sz.on', { solid: '#8b5cf6' }],
        ['.cb-bold.on', { solid: '#8b5cf6' }],
        ['.cb-fsbtn', { gradient: ['135deg', '#a78bfa', '#8b5cf6'] }],
        // 「全螢幕顯示目前狀態」是琥珀色（顏色寫在元素上）：底色保留，字改深棕色
        ['.cb-fsbtn[style*="#fbbf24"]', { raw: `background: linear-gradient(135deg, #fbbf24, #f59e0b) !important; color: ${DARK_TEXT} !important;` }],
        ['.cb-tool.timer', { gradient: ['135deg', '#fb7185', '#f43f5e'] }],
        ['.cb-tool.lottery', { gradient: ['135deg', '#38bdf8', '#0ea5e9'] }],
    ]],
    ['安靜挑戰：選取中的選項', [
        ['.qc-seg button[aria-pressed="true"]', { solid: '#6366f1', border: true }],
    ]],
    ['評語生成：生成與複製', [
        ['.cg-btn.cg-gen', { gradient: ['135deg', '#8b5cf6', '#7c3aed'] }],
        ['.cg-btn.cg-copy', { gradient: ['135deg', '#22c55e', '#16a34a'] }],
    ]],
    ['開運拉霸：抽同學上台的按鈕', [
        ['.zslot-pick-btn', { gradient: ['135deg', '#f43f5e', '#e11d48'] }],
    ]],
];

function build() {
    const out = [];
    out.push('/*');
    out.push(' * 白字配亮色底的對比修正。這份檔案是 scripts/build-contrast-css.cjs 產生的，不要直接改：');
    out.push(' * 要調整請改那支腳本裡的清單，再執行 node scripts/build-contrast-css.cjs。');
    out.push(' * 原則：色相與彩度不變，只把底色調深到白字對比 4.6（WCAG AA 是 4.5）；黃、琥珀色改用深棕色字。');
    out.push(' */');
    out.push('');
    out.push('/* ── 一、通用類別：同一個元素有 text-white 才套用 ── */');
    // 滑鼠移上去的顏色：某個顏色只要有任何一階被調深，各階的 hover 就要一起給。
    // 不給的話，底色那條 !important 會蓋掉原本的 hover（例如 bg-blue-500 hover:bg-blue-600 會變成移上去沒反應）。
    for (const [name, shades] of Object.entries(PALETTE)) {
        // 黃、琥珀色不給：那些按鈕的字已改成深棕色，原本的 hover（稍深的黃）配深色字仍然清楚
        if (KEEP_BRIGHT.includes(name)) continue;
        if (!shades.some((hex) => contrast('#ffffff', hex) < 4.5)) continue;
        shades.forEach((hex, i) => {
            out.push(`.text-white.${HOVER}bg-${name}-${SHADES[i]}:hover { background-color: ${darken(hex, HOVER_TARGET)} !important; }`);
        });
    }
    const entries = [];
    for (const [name, shades] of Object.entries(PALETTE)) {
        shades.forEach((hex, i) => {
            const shade = SHADES[i];
            if (contrast('#ffffff', hex) >= 4.5) return;
            entries.push({ name, shade, hex });
        });
    }
    for (const { name, shade, hex } of entries) {
        const bright = KEEP_BRIGHT.includes(name) && shade <= 500;
        const fixed = darken(hex);
        if (bright) out.push(`.text-white.bg-${name}-${shade} { color: ${DARK_TEXT} !important; }`);
        else out.push(`.text-white.bg-${name}-${shade} { background-color: ${fixed} !important; }`);
        // 漸層的起點、終點、中間色（文字只有一種顏色，所以黃、琥珀色在漸層裡也調深）
        out.push(`.text-white.from-${name}-${shade} { --tw-gradient-from: ${fixed} var(--tw-gradient-from-position) !important; }`);
        out.push(`.text-white.to-${name}-${shade} { --tw-gradient-to: ${fixed} var(--tw-gradient-to-position) !important; }`);
        out.push(`.text-white.via-${name}-${shade} { --tw-gradient-stops: var(--tw-gradient-from), ${fixed} var(--tw-gradient-via-position), var(--tw-gradient-to) !important; }`);
    }
    out.push('');
    out.push('/* ── 二、各功能自己定義的按鈕 ── */');
    for (const [title, rules] of MODULES) {
        out.push(`/* ${title} */`);
        for (const [selector, spec] of rules) {
            if (spec.raw) {
                out.push(`${selector} { ${spec.raw} }`);
            } else if (spec.solid) {
                const c = darken(spec.solid);
                out.push(`${selector} { background: ${c} !important;${spec.border ? ` border-color: ${c} !important;` : ''} }`);
            } else {
                const [direction, ...stops] = spec.gradient;
                const fixed = stops.map((stop) => { const [hex, ...rest] = stop.split(' '); return [darken(hex), ...rest].join(' '); });
                out.push(`${selector} { background: linear-gradient(${direction}, ${fixed.join(', ')}) !important; }`);
            }
        }
    }
    out.push('/* 開運拉霸：拉桿旁的小字原本是淡粉色，改成白色 */');
    out.push('.zslot-lever-hint { color: #ffffff !important; }');
    out.push('');
    return out.join('\n');
}

module.exports = { build, darken, contrast, PALETTE, MODULES, TARGET, DARK_TEXT, KEEP_BRIGHT };

if (require.main === module) {
    const file = path.join(__dirname, '..', 'css', 'contrast.css');
    fs.writeFileSync(file, build());
    console.log('已產生 ' + file);
}
