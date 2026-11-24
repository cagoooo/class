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
    // ── 2026-11-24 補量彈出視窗與全螢幕畫面後加入 ──
    ['提示訊息（右上角跳出的通知）：成功、失敗、一般；提醒是黃色，底色不動、字改深棕色', [
        ['.notification.success', { gradient: ['135deg', '#10b981', '#059669'] }],
        ['.notification.error', { gradient: ['135deg', '#ef4444', '#dc2626'] }],
        ['.notification.info', { gradient: ['135deg', '#3b82f6', '#2563eb'] }],
        ['.notification.warning, .notification.warning *', { raw: `color: ${DARK_TEXT} !important;` }],
    ]],
    ['全螢幕監考：考試進行中的狀態列（剩餘時間那一塊原本疊一層白，改成疊一層深色）、考試設定、缺考記錄', [
        ['.exam-status-bar:not(.waiting):not(.finished)', { solid: '#22c55e' }],
        ['.exam-status-remaining', { raw: 'background: rgba(0, 0, 0, 0.18) !important;' }],
        ['.exam-settings-header', { gradient: ['135deg', '#667eea 0%', '#764ba2 100%'] }],
        ['.exam-settings-close', { raw: 'background: rgba(0, 0, 0, 0.22) !important;' }],
        ['.exam-settings-add-btn', { gradient: ['135deg', '#3b82f6 0%', '#8b5cf6 100%'] }],
        ['.absence-add-btn', { gradient: ['135deg', '#22c55e 0%', '#16a34a 100%'] }],
        ['.absence-export-btn', { solid: '#3b82f6' }],
        // 深色的監考畫面上：應到／實到人數的藍字調亮、右下角提示調亮；淺色的監考畫面提示調深
        ['.exam-fullscreen-modal:not(.light-mode) .exam-attendance-value', { raw: 'color: #93c5fd !important;' }],
        ['.exam-fullscreen-modal:not(.light-mode) .exam-fullscreen-hint', { raw: 'color: rgba(255, 255, 255, 0.78) !important;' }],
        ['.exam-fullscreen-modal.light-mode .exam-fullscreen-hint', { raw: 'color: rgba(0, 0, 0, 0.64) !important;' }],
    ]],
    ['全螢幕計時：開始（綠）調深；計時中是琥珀色，字改深棕色', [
        ['.timer-fullscreen-btn-primary:not(.running)', { gradient: ['135deg', '#10b981 0%', '#059669 100%'] }],
        ['.timer-fullscreen-btn-primary.running', { raw: `color: ${DARK_TEXT} !important;` }],
    ]],
    ['大時鐘（時鐘自己的淺色外觀）：選取中的樣式與開關', [
        // 網站深色模式下這兩顆的字會被改成淺灰（不是純白），所以連字色一起指定
        ['#clock-modal:not(.dark) .clock-style-btn.active, #clock-modal:not(.dark) .clock-toggle-btn.active', { raw: `background-color: ${darken('#3b82f6')} !important; color: #ffffff !important;` }],
        ['#clock-modal:not(.dark) .clock-toggle-btn.active span', { raw: 'color: #ffffff !important;' }],
    ]],
    ['版本與健康狀態、備份提醒、抽籤結果、白板全螢幕的提示', [
        ['.hp-head', { gradient: ['135deg', '#0ea5e9', '#6366f1'] }],
        ['.hp-btn.primary', { solid: '#3b82f6' }],
        ['.dsg-bn-backup', { gradient: ['135deg', '#dc2626', '#ef4444'] }],
        ['.lt-fbtn.lt-main', { solid: '#8b5cf6', border: true }],
        ['.cb-fs-hint', { raw: 'color: rgba(0, 0, 0, 0.64) !important;' }],
    ]],
];

function build() {
    const out = [];
    out.push('/*');
    out.push(' * 文字對比修正（白字配亮色底、淺色模式的淺灰與亮色小字）。這份檔案是 scripts/build-contrast-css.cjs 產生的，不要直接改：');
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

    out.push('/* ── 三、淺色模式的文字：淺灰小字、亮色字配淺色底（深色模式另有自己的規則，這裡不碰） ── */');
    out.push('/*');
    out.push(' * 通用類別（text-gray-400 這類）：把字調深到「放在淡色底（例如淡藍色提示框）上」也有 4.6。');
    out.push(' * 不加 !important，選擇器只比原本多一點點權重：滑鼠移過（hover:text-…）與各功能更精確的規則仍然優先。');
    out.push(' */');
    for (const [name, shades] of Object.entries(PALETTE)) {
        shades.slice(0, 3).forEach((hex, i) => {
            if (contrast(hex, TINT_REF) >= 4.5) return;
            out.push(`${LIGHT}.text-${name}-${SHADES[i]} { color: ${darkenText(hex, TINT_REF)}; }`);
        });
    }
    out.push('/* 各功能自己的文字顏色（依實際所在的底色計算） */');
    for (const [title, rules] of TEXTS) {
        out.push(`/* ${title} */`);
        for (const [selector, fg, bg, scope] of rules) {
            // scope 是 'both' 的：這個元素的底色在深色模式下也是淺的，兩種模式都要調
            const selectors = selector.split(',').map((s) => (scope === 'both' ? '' : LIGHT) + s.trim()).join(', ');
            out.push(`${selectors} { color: ${darkenText(fg, bg)} !important; }`);
        }
    }
    out.push('');
    return out.join('\n');
}

// 只在淺色模式生效；:where() 不增加權重，所以整條規則只比原本的類別多一個 body 的權重
const LIGHT = ':where(html:not(.dark)) body ';
// 通用文字類別要能放在各種淡色底上：以最暗的淡色底（淡藍 blue-100）當基準
const TINT_REF = '#dbeafe';

/** 色相與彩度不變，把文字亮度往下調到在指定底色上達標為止。 */
function darkenText(fg, bg, target = TARGET) {
    const hsl = toHsl(fg);
    let out = fg.toLowerCase();
    for (let i = 0; i < 200 && contrast(out, bg) < target; i++) { hsl.l -= 0.005; out = fromHsl(hsl); }
    return out;
}

// 各功能自己的文字：[選擇器, 原本的字色, 它所在的底色（有多種時取最暗的）, 'both'（選填）]
// 第四個值寫 'both'：這個元素的底色在深色模式下也維持淺色（例如白板的工具列、評語的特質分類），兩種模式都套用。
// 沒寫的只在淺色模式套用（深色模式下它的底會變深，字色由 js/theme-toggle.js 處理）。
// 會隨滑鼠移過變色的元素加上 :not(:hover)，原本的 hover 顏色才不會被蓋掉。
const TEXTS = [
    ['座位表、加扣分、分組：座號與時間的小字', [
        ['.seat-number', '#94a3b8', '#f8fafc'],
        ['.pt-stu-seat, .pt-htime, .gp-seat', '#94a3b8', '#ffffff'],
        ['.pt-hpts.pt-plus', '#16a34a', '#ffffff'],
    ]],
    ['公告：沒選到的類型與分頁、則數、清除', [
        ['.ann-type-btn:not(.selected), .ann-tab:not(.active)', '#6b7280', '#f3f4f6', 'both'],
        ['#annCount', '#9ca3af', '#ffffff'],
        ['.ann-form-card button[onclick*="annExpiresInput"]', '#9ca3af', '#ffffff', 'both'],
    ]],
    ['考試：沒選到的天數、目前第幾天的說明（顏色寫在元素上）', [
        ['#examDayTabs button[style*="#6b7280"]', '#6b7280', '#f3f4f6', 'both'],
        ['#examDayTabs div[style*="#9ca3af"]', '#9ca3af', '#ffffff'],
    ]],
    ['抽籤：不重複抽取的說明、這一輪進度、空白提示、示範標籤', [
        ['.lt-norepeat small, #lotteryRound, #lotteryRound span, .lt-idle-text', '#6b7280', '#f5f3ff'],
        ['.lt-stu.lt-demo', '#64748b', '#f1f5f9'],
    ]],
    ['作業：刪除（沒移過去時）、儀表板沒選到的檢視、未檢查與未繳標籤', [
        ['.hw-act-del:not(:hover)', '#94a3b8', '#eef2ff'],
        ['.homework-view-btn:not(.active), .homework-card-tag.unchecked', '#64748b', '#f1f5f9'],
        ['.homework-card-tag.incomplete', '#dc2626', '#fee2e2'],
    ]],
    ['白板：工具列標籤、目前狀態、操作提示', [
        ['.cb-board-col .lbl', '#6b7280', '#eff6ff', 'both'],
        ['.cb-cur', '#6b7280', '#f3f4f6', 'both'],
        ['.cb-hint', '#9ca3af', '#ffffff', 'both'],
    ]],
    ['安靜挑戰：目前班級', [
        ['.qc-head .class-context', '#64748b', '#eef2ff'],
    ]],
    ['評語生成：特質分類標題、空白提示', [
        ['.cg-group.pos .cg-group-t', '#16a34a', '#f5f3ff', 'both'],
        ['.cg-group.neg .cg-group-t', '#d97706', '#f5f3ff', 'both'],
        ['.cg-output.placeholder', '#9ca3af', '#fffef9', 'both'],
    ]],
    ['開運拉霸：籤詩出處', [
        ['.zf-credit', '#9ca3af', '#fee2e2', 'both'],
    ]],
    ['排行榜：正分（金牌列的底最暗）', [
        ['.leaderboard-score.positive', '#059669', '#fde68a'],
    ]],
    // ── 2026-11-24 補量彈出視窗與全螢幕畫面後加入 ──
    ['抽籤結果：已抽過的名字、籤筒剩餘人數、紀錄的時間', [
        ['.lt-stu[data-state="drawn"]', '#64748b', '#f1f5f9'],
        ['.lt-foot-info', '#6b7280', '#f5f3ff'],
        ['.lt-htime', '#94a3b8', '#ffffff'],
    ]],
    ['備份提醒（底色在深色模式也是淺的）', [
        ['.dsg-bn-sub, .dsg-bn-dismiss', '#6b7280', '#eff6ff', 'both'],
    ]],
    ['版本與健康狀態的連結、缺考記錄的空白提示、考試設定的休息提醒標題（這幾個視窗在深色模式也是白底）', [
        ['.hp-link', '#6366f1', '#ffffff', 'both'],
        ['.absence-empty', '#9ca3af', '#ffffff', 'both'],
        ['.exam-settings-column-title.break-type, #breakReminderCount', '#059669', '#ffffff', 'both'],
    ]],
];

module.exports = { build, darken, darkenText, contrast, PALETTE, MODULES, TEXTS, TARGET, TINT_REF, LIGHT, DARK_TEXT, KEEP_BRIGHT };

if (require.main === module) {
    const file = path.join(__dirname, '..', 'css', 'contrast.css');
    fs.writeFileSync(file, build());
    console.log('已產生 ' + file);
}
