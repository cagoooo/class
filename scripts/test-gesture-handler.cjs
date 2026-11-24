// 手勢模組：只保留左右滑動切換功能頁；長按學生卡片快捷選單已拿掉（v3.73.2）
// 那個選單從上線起就不會出現，選單裡的加分還會寫錯欄位（score）、不寫紀錄、不存檔。
// 這支測試防止有人只修好一半又把它接回來。
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const SRC = fs.readFileSync('js/gesture-handler.js', 'utf8');

let passed = 0;
function test(name, fn) { fn(); console.log('PASS', name); passed++; }

/** 在假的頁面裡載入模組，回傳每個元素上掛的觸控監聽與切換紀錄。 */
function load() {
    const listeners = new Map(), shown = [];
    const el = name => ({
        name, classList: { contains: () => false }, offsetParent: {}, style: {}, parentElement: null,
        addEventListener(type, fn) { const k = name + ':' + type; listeners.set(k, (listeners.get(k) || []).concat(fn)); },
    });
    const sections = {};
    for (const n of ['students', 'points', 'grouping']) sections[n + '-section'] = el(n + '-section');
    let current = 'students';
    for (const [id, node] of Object.entries(sections)) node.classList = { contains: c => c === 'hidden' && id !== current + '-section' };
    const header = el('header');
    const c = {
        console: { log() {}, warn() {}, error() {} },
        document: {
            readyState: 'complete', body: Object.assign(el('body'), { appendChild() {} }), head: { appendChild() {} },
            getElementById: id => sections[id] || null, querySelector: sel => sel === '.max-w-7xl' ? header : null,
            createElement: () => ({ style: {}, appendChild() {} }), addEventListener() {},
        },
        getComputedStyle: () => ({ overflowX: 'visible' }),
        requestAnimationFrame: fn => fn(), setTimeout: () => 1, clearTimeout() {},
        showSection: n => { current = n; shown.push(n); },
    };
    c.window = c; vm.createContext(c); vm.runInContext(SRC, c);
    return { c, listeners, shown, header };
}

test('原始碼：長按快捷選單與錯誤的加分後備已拿掉', () => {
    for (const gone of ['showStudentQuickMenu', 'initStudentCardLongPress', '_quickAddScore', '_menuDismiss', 'gesture-student-menu', 'AppState', 's.score']) {
        assert.ok(!SRC.includes(gone), gone);
    }
});

test('學生頁沒有掛任何觸控監聽（長按不會再有任何反應）', () => {
    const { listeners } = load();
    assert.deepEqual([...listeners.keys()].filter(k => k.startsWith('students-section:')), []);
});

test('左右滑動切換功能頁照常：往左滑到下一頁、往右滑回上一頁', () => {
    const { listeners, shown, header } = load();
    const fire = (type, x) => (listeners.get('header:' + type) || []).forEach(fn => fn({
        target: header, touches: [{ clientX: x, clientY: 100 }], changedTouches: [{ clientX: x, clientY: 100 }], preventDefault() {},
    }));
    fire('touchstart', 300); fire('touchmove', 150); fire('touchend', 150);
    assert.deepEqual(shown, ['points']);
    fire('touchstart', 150); fire('touchmove', 300); fire('touchend', 300);
    assert.deepEqual(shown, ['points', 'students']);
});

console.log(passed + ' gesture handler checks passed');
