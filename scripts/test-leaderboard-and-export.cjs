// 排行榜名次／獎牌（js/leaderboard-enhancement.js）與「撤銷不算扣分」的統計（PointsReset.withoutUndone、學生總表）
// 舊版：排行榜永遠把前三名標成 🥇🥈🥉，全班 0 分也發獎牌、同分的人名次不同（3、3、0 → 🥇🥈🥉）；
//       學生總表的「加分次數／扣分次數」把「按錯後撤銷」算成一次加分＋一次扣分（加分 2 次、扣分 2 次），
//       跟目前總分對不上。
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const HTML = fs.readFileSync('classnew.html', 'utf8');
const LB_SRC = fs.readFileSync('js/leaderboard-enhancement.js', 'utf8');
const BACKUP_SRC = fs.readFileSync('js/data-backup.js', 'utf8');

let passed = 0;
function test(name, fn) { fn(); console.log('PASS', name); passed++; }
const J = x => JSON.parse(JSON.stringify(x));   // 跨 vm 領域的資料轉成本領域物件，deepEqual 才比得準

// ───────── 1. 排行榜：載入真正的 IIFE ─────────
function loadLeaderboard(students) {
    const modal = { id: '', className: '', innerHTML: '', classList: { remove() {} }, setAttribute() {} };
    const timers = [], confetti = [], cheers = [];
    const ctx = {
        console: { log() {}, warn() {} }, JSON, Math, Number, String, Array, Object, parseInt, isNaN, Set,
        document: {
            readyState: 'complete',
            getElementById: id => (id === 'leaderboardModal' ? (modal.__attached ? modal : null) : null),
            createElement: () => { modal.__attached = false; return modal; },
            head: { appendChild() {} },
            body: { appendChild(el) { el.__attached = true; }, contains: el => !!el.__attached },
        },
        localStorage: { getItem: k => (k === 'students' ? JSON.stringify(students || []) : null) },
        setTimeout: (fn, ms) => { timers.push(fn); return timers.length; },
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(LB_SRC, ctx);
    ctx.triggerConfetti = () => confetti.push(1);     // 載入後換成計數（程式用全域名稱呼叫）
    ctx.playCheerSound = () => cheers.push(1);
    return {
        ctx, modal, confetti, cheers,
        rank: list => J(ctx.LeaderboardRank.rank(list)),
        /** 打開排行榜並把延遲 200ms 的渲染跑完，回傳畫面 HTML。 */
        show() { ctx.showLeaderboard(); timers.splice(0).forEach(f => f()); return modal.innerHTML; },
    };
}
const S = (name, points, number) => ({ id: name, name, points, number });
const ranks = r => r.rows.map(x => x.rank);
const medals = r => r.rows.map(x => x.medal);

test('載入 IIFE 後對外有 window.LeaderboardRank.rank，且 showLeaderboard 被換成增強版', () => {
    const lb = loadLeaderboard([]);
    assert.equal(typeof lb.ctx.LeaderboardRank.rank, 'function');
    assert.equal(typeof lb.ctx.showLeaderboard, 'function');
});

test('分數 3、3、0、0、0、0、-2 → 名次 1、1、3、3、3、3、7；只有兩位 3 分拿金牌，0 與負分沒有（舊版 🥇3、🥈3、🥉0）', () => {
    const lb = loadLeaderboard();
    const r = lb.rank([S('a', 3, 1), S('b', 3, 2), S('c', 0, 3), S('d', 0, 4), S('e', 0, 5), S('f', 0, 6), S('g', -2, 7)]);
    assert.deepEqual(ranks(r), [1, 1, 3, 3, 3, 3, 7]);
    assert.deepEqual(medals(r), [1, 1, 0, 0, 0, 0, 0]);
    assert.equal(r.tiedAll, false);
    assert.equal(r.hasMedal, true);
});

test('全班 0 分、或全班同為 5 分：tiedAll、沒有任何獎牌', () => {
    const lb = loadLeaderboard();
    const zero = lb.rank([S('a', 0, 1), S('b', 0, 2), S('c', 0, 3)]);
    assert.equal(zero.tiedAll, true); assert.equal(zero.hasMedal, false);
    assert.deepEqual(medals(zero), [0, 0, 0]); assert.deepEqual(ranks(zero), [1, 1, 1]);
    const five = lb.rank([S('a', 5, 1), S('b', 5, 2), S('c', 5, 3), S('d', 5, 4)]);
    assert.equal(five.tiedAll, true); assert.equal(five.hasMedal, false);
    assert.deepEqual(medals(five), [0, 0, 0, 0]);
});

test('5、4、3、2 → 名次 1~4，前三名獎牌 1、2、3，第四名沒有', () => {
    const r = loadLeaderboard().rank([S('a', 5, 1), S('b', 4, 2), S('c', 3, 3), S('d', 2, 4)]);
    assert.deepEqual(ranks(r), [1, 2, 3, 4]);
    assert.deepEqual(medals(r), [1, 2, 3, 0]);
    assert.equal(r.tiedAll, false);
});

test('同分排名次跳號：5、5、4 → 1、1、3（第三名拿銅牌）；5、4、4、4 → 1、2、2、2 都拿 2 號獎牌', () => {
    const lb = loadLeaderboard();
    let r = lb.rank([S('a', 5, 1), S('b', 5, 2), S('c', 4, 3)]);
    assert.deepEqual(ranks(r), [1, 1, 3]); assert.deepEqual(medals(r), [1, 1, 3]);
    r = lb.rank([S('a', 5, 1), S('b', 4, 2), S('c', 4, 3), S('d', 4, 4)]);
    assert.deepEqual(ranks(r), [1, 2, 2, 2]); assert.deepEqual(medals(r), [1, 2, 2, 2]);
});

test('同分依座號由小到大；輸入順序打亂結果相同；五碼座號可排序；沒座號排最後；不改動傳入陣列', () => {
    const lb = loadLeaderboard();
    const base = [S('甲', 3, 60105), S('乙', 3, 60101), S('丙', 3, 60103), S('丁', 5, 60110), S('戊', 3, undefined)];
    const names = r => r.rows.map(x => x.student.name);
    const expectOrder = ['丁', '乙', '丙', '甲', '戊'];
    assert.deepEqual(names(lb.rank(base)), expectOrder);
    for (const shuffled of [[...base].reverse(), [base[2], base[4], base[0], base[3], base[1]], [base[4], base[3], base[2], base[1], base[0]]]) {
        assert.deepEqual(names(lb.rank(shuffled)), expectOrder);
    }
    const input = [S('x', 1, 3), S('y', 2, 2), S('z', 1, 1)];
    const snap = JSON.stringify(input);
    lb.ctx.LeaderboardRank.rank(input);
    assert.equal(JSON.stringify(input), snap, '傳入的陣列順序與內容不能被改動');
});

test('只有 1 位學生：分數 >0 拿金牌；分數 0 沒有；沒有學生／不是陣列也不丟例外', () => {
    const lb = loadLeaderboard();
    let r = lb.rank([S('a', 4, 1)]);
    assert.deepEqual(medals(r), [1]); assert.equal(r.tiedAll, false);
    r = lb.rank([S('a', 0, 1)]);
    assert.deepEqual(medals(r), [0]); assert.equal(r.hasMedal, false);
    assert.deepEqual(lb.rank([]), { rows: [], tiedAll: false, hasMedal: false });
    assert.deepEqual(lb.rank(null).rows, []);
    assert.deepEqual(lb.rank(undefined).rows, []);
    assert.deepEqual(ranks(lb.rank([null, S('a', 1, 1), undefined])), [1]);
});

test('分數是字串或缺值也能排（當成數字／0）', () => {
    const r = loadLeaderboard().rank([{ name: 'a', points: '3', number: 1 }, { name: 'b', number: 2 }, { name: 'c', points: 'x', number: 3 }]);
    assert.deepEqual(r.rows.map(x => x.points), [3, 0, 0]);
    assert.deepEqual(medals(r), [1, 0, 0]);
});

test('畫面：姓名含 <b> 會被跳脫，不會變成真的標籤', () => {
    const lb = loadLeaderboard([S('<b>壞</b>', 3, 1), S('正常', 2, 2)]);
    const html = lb.show();
    assert.ok(html.includes('&lt;b&gt;壞&lt;/b&gt;'), '要有跳脫後的姓名');
    assert.ok(!html.includes('<b>壞'), '不能有未跳脫的 <b>');
});

test('畫面：分數 3、3、0、0 → 只有兩個 🥇，沒有 🥈🥉；有人拿獎牌才放彩花與歡呼', () => {
    const lb = loadLeaderboard([S('a', 3, 1), S('b', 3, 2), S('c', 0, 3), S('d', 0, 4)]);
    const html = lb.show();
    assert.equal((html.match(/🥇/g) || []).length, 2);
    assert.ok(!html.includes('🥈') && !html.includes('🥉'));
    assert.equal(lb.confetti.length, 1); assert.equal(lb.cheers.length, 1);
    assert.match(html, /#3/, '0 分的人顯示名次數字 #3');
});

test('畫面：全班 0 分 → 顯示「還沒有分出名次」、沒有任何獎牌、不放彩花', () => {
    const lb = loadLeaderboard([S('a', 0, 1), S('b', 0, 2), S('c', 0, 3)]);
    const html = lb.show();
    assert.match(html, /還沒有分出名次/);
    assert.ok(!/🥇|🥈|🥉/.test(html));
    assert.equal(lb.confetti.length, 0); assert.equal(lb.cheers.length, 0);
});

test('畫面：沒有學生 → 顯示空狀態', () => {
    const html = loadLeaderboard([]).show();
    assert.match(html, /目前沒有學生可以排名/);
});

// ───────── 2. PointsReset.withoutUndone ─────────
function loadPointsReset() {
    const start = HTML.indexOf('window.PointsReset = {');
    assert.ok(start >= 0, '找不到 window.PointsReset');
    let depth = 0, i = HTML.indexOf('{', start);
    for (; i < HTML.length; i++) { if (HTML[i] === '{') depth++; else if (HTML[i] === '}' && --depth === 0) break; }
    const code = HTML.slice(start, i + 1) + ';';
    const ctx = { Set, Array, Number, String };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    return ctx.PointsReset;
}
const PR = loadPointsReset();

test('withoutUndone：+1 被 -1 撤銷（petReverses 指向原紀錄）→ 兩筆都拿掉', () => {
    const list = [{ id: 1, points: 1, petEvent: true }, { id: 2, points: -1, petReverses: 1, petEvent: true }];
    assert.deepEqual(J(PR.withoutUndone(list)), []);
});

test('withoutUndone：真正的扣分（沒有 petReverses）保留；其他人的紀錄保留', () => {
    const list = [{ id: 1, points: 1, petEvent: true }, { id: 2, points: -1, petReverses: 1, petEvent: true }, { id: 3, points: -1 }, { id: 4, points: 2 }];
    assert.deepEqual(J(PR.withoutUndone(list)).map(r => r.id), [3, 4]);
});

test('withoutUndone：商店退幣（petShopType:refund、petReverses 指向兌換紀錄）不處理、原樣保留', () => {
    const list = [{ id: 10, points: -5, petShopType: 'redeem' }, { id: 11, points: 5, petShopType: 'refund', petReverses: 10 }];
    const out = PR.withoutUndone(list);
    assert.deepEqual(J(out).map(r => r.id), [10, 11]);
    assert.equal(out, list, '沒有任何一般撤銷時回傳同一個陣列');
});

test('withoutUndone：撤銷紀錄指向的原紀錄不在清單裡（例如重置前的）→ 撤銷紀錄保留，小計才等於目前分數', () => {
    const list = [{ id: 50, points: -1, petReverses: 49, petEvent: true }, { id: 51, points: 2 }];
    const out = PR.withoutUndone(list);
    assert.deepEqual(J(out).map(r => r.id), [50, 51]);
    assert.equal(out, list);
});

test('withoutUndone：沒有任何撤銷時回傳同一個陣列；null／undefined／非陣列回傳空陣列', () => {
    const list = [{ id: 1, points: 1 }, { id: 2, points: -1 }];
    assert.equal(PR.withoutUndone(list), list);
    assert.deepEqual(J(PR.withoutUndone(null)), []);
    assert.deepEqual(J(PR.withoutUndone(undefined)), []);
    assert.deepEqual(J(PR.withoutUndone('abc')), []);
    assert.deepEqual(J(PR.withoutUndone([])), []);
});

test('withoutUndone：id 是字串或數字都對得上；多組撤銷各自成對；不改動傳入的陣列', () => {
    const list = [{ id: '1', points: 1 }, { id: 2, points: -1, petReverses: 1 }, { id: 3, points: 1 }, { id: '4', points: -1, petReverses: '3' }, { id: 5, points: 3 }];
    const snap = JSON.stringify(list);
    assert.deepEqual(J(PR.withoutUndone(list)).map(r => r.id), [5]);
    assert.equal(JSON.stringify(list), snap);
});

// ───────── 3. 學生總表（DataBackup.exportExcel） ─────────
function exportSheets(data) {
    const sheets = {}, written = [];
    const ctx = {
        console: { warn() {}, log() {} }, JSON, Math, Number, String, Array, Object, Set, Date,
        XLSX: {
            utils: {
                book_new: () => ({}),
                aoa_to_sheet: rows => ({ rows: JSON.parse(JSON.stringify(rows)) }),
                book_append_sheet: (wb, ws, name) => { sheets[name] = ws.rows; },
            },
            writeFile: (wb, name) => written.push(name),
        },
        BackupIntegrity: { encode: () => [['raw']] },
        localStorage: { getItem: () => null },
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    // 用 classnew.html 裡真正的 PointsReset
    const start = HTML.indexOf('window.PointsReset = {');
    let depth = 0, i = HTML.indexOf('{', start);
    for (; i < HTML.length; i++) { if (HTML[i] === '{') depth++; else if (HTML[i] === '}' && --depth === 0) break; }
    vm.runInContext(HTML.slice(start, i + 1) + ';', ctx);
    vm.runInContext(BACKUP_SRC, ctx);
    ctx.DataBackup.exportExcel(data);
    return { sheets, written };
}
const HEAD = ['座號', '姓名', '目前總分', '加分次數', '扣分次數', '加分小計', '扣分小計'];

test('學生總表：+1（已被撤銷）、撤銷 -1、+2、真扣分 -1，目前總分 1 → 加分 1 次、扣分 1 次、加分小計 2、扣分小計 -1（舊版加分 2 次、扣分 2 次）', () => {
    const data = {
        students: [{ id: 1, number: 1, name: '王小明', points: 1 }],
        pointsHistory: [
            { id: 4, studentId: 1, points: -1, reason: '忘記帶課本' },
            { id: 3, studentId: 1, points: 2, reason: '發表' },
            { id: 2, studentId: 1, points: -1, reason: '撤銷：按錯', petReverses: 1, petEvent: true },
            { id: 1, studentId: 1, points: 1, reason: '按錯了', petEvent: true },
        ],
    };
    const { sheets, written } = exportSheets(data);
    assert.deepEqual(sheets['學生總表'][0], HEAD);
    assert.deepEqual(sheets['學生總表'][1], [1, '王小明', 1, 1, 1, 2, -1]);
    // 加分小計 + 扣分小計 = 目前總分
    const row = sheets['學生總表'][1];
    assert.equal(row[5] + row[6], row[2]);
    // 明細工作表仍保留全部 4 筆（含撤銷那筆）
    assert.equal(sheets['加扣分明細'].length, 1 + 4);
    assert.equal(written.length, 1);
    assert.match(written[0], /\.xlsx$/);
});

test('學生總表：沒有任何撤銷時照舊計算；其他學生不受影響', () => {
    const data = {
        students: [{ id: 1, number: 1, name: 'A', points: 3 }, { id: 2, number: 2, name: 'B', points: -2 }],
        pointsHistory: [
            { id: 5, studentId: 2, points: -2 }, { id: 4, studentId: 1, points: 1 }, { id: 3, studentId: 1, points: 2 },
        ],
    };
    const t = exportSheets(data).sheets['學生總表'];
    assert.deepEqual(t[1], [1, 'A', 3, 2, 0, 3, 0]);
    assert.deepEqual(t[2], [2, 'B', -2, 0, 1, 0, -2]);
});

test('學生總表：撤銷發生在重置之後、原紀錄在重置之前 → 撤銷紀錄保留，小計仍等於目前分數', () => {
    const data = {
        students: [{ id: 1, number: 1, name: 'A', points: 2 }],
        pointsHistory: [
            { id: 30, studentId: 1, points: 3 },
            { id: 20, studentId: 1, points: -1, petReverses: 5, petEvent: true },   // 原紀錄 5 在重置前，已不在統計範圍
            { id: 10, type: 'reset' },
            { id: 5, studentId: 1, points: 2 },
        ],
    };
    const row = exportSheets(data).sheets['學生總表'][1];
    assert.deepEqual(row, [1, 'A', 2, 1, 1, 3, -1]);
    assert.equal(row[5] + row[6], row[2], '加減小計等於目前總分');
});

test('學生總表：舊資料沒有 pointsHistory 時退回用 student.records，同樣先把撤銷成對拿掉', () => {
    const data = {
        students: [{ id: 1, number: 1, name: 'A', points: 1, records: [{ id: 1, points: 1 }, { id: 2, points: -1, petReverses: 1 }, { id: 3, points: 2 }, { id: 4, points: -1 }] }],
        pointsHistory: [],
    };
    assert.deepEqual(exportSheets(data).sheets['學生總表'][1], [1, 'A', 1, 1, 1, 2, -1]);
});

test('原始碼：data-backup.js 與 data-reports.js 都呼叫 PointsReset.withoutUndone', () => {
    assert.match(BACKUP_SRC, /PointsReset\.withoutUndone/);
    assert.match(fs.readFileSync('js/data-reports.js', 'utf8'), /\.withoutUndone\(records\)/);
});

console.log(`${passed} leaderboard-and-export checks passed`);
