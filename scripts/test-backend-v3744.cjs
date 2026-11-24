// 全站檢測「其餘發現」第六批：戰報、後台分析、部署防呆（v3.74.4）
const fs = require('node:fs'), assert = require('node:assert/strict');
const { selectDigestEvents, readAllPages, digestCutoffMs } = require('../functions/digest-summary');

const pending = [];
let passed = 0;
function test(name, fn) {
    const r = fn();
    if (r && typeof r.then === 'function') pending.push(r.then(() => { console.log('PASS', name); passed++; }));
    else { console.log('PASS', name); passed++; }
}
const at = iso => ({ toMillis: () => Date.parse(iso) });

test('戰報 21:00 的切點是台北時間', () => {
    assert.equal(new Date(digestCutoffMs('2026-11-24')).toISOString(), '2026-11-24T13:00:00.000Z');
});

test('戰報算「昨天 21:00 以後＋今天 21:00 以前」：以前 21:00 以後的事件哪一天都不會出現', () => {
    const yesterday = [
        { type: 'login', createdAt: at('2026-11-23T20:59:00+08:00'), _documentId: 'y1' },   // 昨天的戰報已經算過
        { type: 'login', createdAt: at('2026-11-23T21:30:00+08:00'), _documentId: 'y2' },   // 以前漏掉的
        { type: 'error', ts: '2026-11-23T23:10:00+08:00', _documentId: 'y3' },               // 沒有寫入時間就看 ts
        { type: 'feature_summary', createdAt: at('2026-11-23T22:00:00+08:00'), _documentId: 'fs_y' },   // 累計型：不跨日
        { type: 'class_upgrade', createdAt: at('2026-11-23T22:00:00+08:00'), _documentId: 'upg_a_b' },
    ];
    const today = [
        { type: 'login', createdAt: at('2026-11-24T08:00:00+08:00'), _documentId: 't1' },
        { type: 'login', createdAt: at('2026-11-24T21:00:30+08:00'), _documentId: 't2' },   // 送出後才寫入：算到明天
        { type: 'feature_summary', createdAt: at('2026-11-24T21:30:00+08:00'), _documentId: 'fs_t' },
        { type: 'login', _documentId: 't3' },                                                // 看不出時間：算今天
    ];
    const picked = selectDigestEvents(today, yesterday, '2026-11-24', '2026-11-23').map(e => e._documentId);
    assert.deepEqual(picked.sort(), ['fs_t', 't1', 't3', 'y2', 'y3']);
});

test('分頁讀完查詢：超過一頁會接著讀，到上限才標示截斷', async () => {
    const all = Array.from({ length: 2500 }, (_, i) => ({ id: 'd' + i }));
    const makeQuery = (start = 0, size = Infinity) => ({
        limit: n => makeQuery(start, n),
        startAfter: last => makeQuery(all.indexOf(last) + 1, size),
        get: async () => { const docs = all.slice(start, start + size); return { docs, size: docs.length }; },
    });
    const full = await readAllPages(makeQuery(), 1000, 10000);
    assert.equal(full.docs.length, 2500); assert.equal(full.truncated, false);
    const cut = await readAllPages(makeQuery(), 1000, 2000);
    assert.equal(cut.docs.length, 2000); assert.equal(cut.truncated, true);
});

test('雲端函式改用分頁讀取，不再一次 limit 3000／20000', () => {
    const src = fs.readFileSync('functions/' + 'index.js', 'utf8');
    assert.doesNotMatch(src, /\.limit\(3000\)/);
    assert.doesNotMatch(src, /\.limit\(20000\)/);
    assert.match(src, /selectDigestEvents\(todayRead\.docs\.map\(toEvent\), yesterdayRead\.docs\.map\(toEvent\), day, yesterday\)/);
    assert.match(src, /truncated: eventsRead\.truncated/);
});

test('部署防呆：本 repo 的 firebase.json 沒有資料庫規則區塊（規則正本在剛好學）；函式相依鎖定檔入庫', () => {
    const cfg = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
    assert.equal(cfg.firestore, undefined);
    assert.equal(cfg.functions[0].codebase, 'default');
    assert.match(fs.readFileSync('.gitignore', 'utf8'), /^!functions\/package-lock\.json$/m);
});

Promise.all(pending).then(() => console.log(passed + ' backend v3.74.4 checks passed'), e => { console.error(e); process.exit(1); });
