// 同步快照定期清理：最新與上一版本絕不刪、一週內曾是最新的都留、資料不完整整班跳過。
const assert = require('node:assert/strict');
const { KEEP_DAYS, KEEP_MS, groupSnapshotParts, planClassPrune } = require('../functions/snapshot-prune');
const { pruneLine, buildDigestPayload, summarizeEvents } = require('../functions/digest-summary');

const DAY = 86400000;
const NOW = Date.parse('2026-10-20T00:00:00Z');
const ago = (days) => NOW - days * DAY;
const snap = (token, days, parts = 1) => ({ token, createdMs: ago(days), paths: Array.from({ length: parts }, (_, i) => `x/${token}/${i}`) });
const plan = (snapshots, head) => planClassPrune({ snapshots, head, nowMs: NOW });

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS', name); }

test('保留天數是一週', () => {
  assert.equal(KEEP_DAYS, 7);
  assert.equal(KEEP_MS, 7 * DAY);
});

test('目前版本再舊也不刪（老師很久沒上傳）', () => {
  const r = plan([snap('a', 60), snap('b', 40)], { token: 'b', previous: 'a', count: 1 });
  assert.deepEqual(r, { action: 'prune', remove: [], keep: ['a', 'b'] });
});

test('上一版本即使早就被取代也保留', () => {
  const r = plan([snap('a', 30), snap('b', 20), snap('c', 10)], { token: 'c', previous: 'b', count: 1 });
  // a 在 20 天前被 b 取代 → 刪；b 是上一版本 → 留
  assert.deepEqual(r.remove, ['a']);
  assert.deepEqual(r.keep, ['b', 'c']);
});

test('用「被取代的時間」判斷，不是建立時間', () => {
  // a 建立於 30 天前，但 3 天前才被 b 取代：這週內還是最新的 → 留
  const r = plan([snap('a', 30), snap('b', 3), snap('c', 1)], { token: 'c', previous: 'b', count: 1 });
  assert.deepEqual(r.remove, []);
});

test('一週前被取代的刪、一週內被取代的留', () => {
  const r = plan([snap('a', 12), snap('b', 9), snap('c', 6), snap('d', 2), snap('e', 1)], { token: 'e', previous: 'd', count: 1 });
  // a 被 b（9 天前）取代 → 刪；b 被 c（6 天前）取代 → 留；c 被 d 取代 → 留
  assert.deepEqual(r.remove, ['a']);
  assert.deepEqual(r.keep, ['b', 'c', 'd', 'e']);
});

test('比目前版本新、但上傳失敗沒成為最新的：一週後才清', () => {
  const r = plan([snap('a', 20), snap('old-fail', 10), snap('new-fail', 2)].concat([]), { token: 'a', previous: null, count: 1 });
  assert.deepEqual(r.remove, ['old-fail']);
  assert.deepEqual(r.keep, ['a', 'new-fail']);
});

test('同一時間建立、排在目前版本之後的也能判斷', () => {
  const r = plan([snap('z', 10), snap('a', 10)], { token: 'a', previous: null, count: 1 });
  assert.deepEqual(r.remove, ['z']);
});

test('沒有版本資訊：整班跳過', () => {
  assert.deepEqual(plan([snap('a', 30)], null), { action: 'skip', reason: 'no-head' });
  assert.deepEqual(plan([snap('a', 30)], { previous: 'a', count: 1 }), { action: 'skip', reason: 'no-head' });
});

test('目前版本不在清單裡：整班跳過', () => {
  assert.deepEqual(plan([snap('a', 30)], { token: 'b', count: 1 }), { action: 'skip', reason: 'head-missing' });
});

test('目前版本分段不完整：整班跳過', () => {
  assert.deepEqual(plan([snap('a', 30), snap('b', 20, 2)], { token: 'b', count: 3 }), { action: 'skip', reason: 'head-incomplete' });
  assert.deepEqual(plan([snap('a', 30), snap('b', 20, 2)], { token: 'b' }), { action: 'skip', reason: 'head-incomplete' });
});

test('保留時間設錯（少於一天）直接拒絕', () => {
  assert.throws(() => planClassPrune({ snapshots: [], head: null, nowMs: NOW, keepMs: 3600000 }), /不可少於 1 天/);
  assert.throws(() => planClassPrune({ snapshots: [], head: null, nowMs: NaN }), /目前時間/);
});

test('分組：預設班級與其他班級各自歸位，封存與奇怪路徑一律忽略', () => {
  const roots = groupSnapshotParts([
    { path: 'users/u1/syncSnapshots/t1/parts/0', createMs: 200 },
    { path: 'users/u1/syncSnapshots/t1/parts/1', createMs: 100 },
    { path: 'users/u1/classes/c1/syncSnapshots/t2/parts/0', createMs: 300 },
    { path: 'users/u1/archives/k/parts/0', createMs: 1 },
    { path: 'users/u1/classes/c1/archives/k/parts/0', createMs: 1 },
    { path: 'other/u1/syncSnapshots/t3/parts/0', createMs: 1 },
    { path: 'users/u1/syncSnapshots/t4/other/0', createMs: 1 },
    { path: 'users/u1/syncSnapshots/t5/parts/0', createMs: NaN },
    null,
  ]);
  assert.deepEqual([...roots.keys()], ['users/u1', 'users/u1/classes/c1']);
  const t1 = roots.get('users/u1').get('t1');
  assert.equal(t1.createdMs, 100);
  assert.deepEqual(t1.paths, ['users/u1/syncSnapshots/t1/parts/0', 'users/u1/syncSnapshots/t1/parts/1']);
  assert.equal(roots.get('users/u1/classes/c1').get('t2').createdMs, 300);
});

test('戰報清理行：成功、跳過、失敗、沒紀錄', () => {
  assert.equal(pruneLine({ day: 'd', status: 'ok', removedSnapshots: 232 }), '🧹 清理一週前舊快照 232 份 ✅');
  assert.match(pruneLine({ day: 'd', status: 'ok', removedSnapshots: 5, deferredSnapshots: 3 }), /另有 3 份明天繼續/);
  assert.match(pruneLine({ day: 'd', status: 'ok', removedSnapshots: 5, skipped: { 'head-missing': 2 } }), /2 班版本資訊不完整，未動） ⚠️$/);
  assert.match(pruneLine({ day: 'd', status: 'partial', removedSnapshots: 5, failedParts: 4 }), /4 個分段刪除失敗） ⚠️$/);
  assert.match(pruneLine({ day: 'd', status: 'skipped' }), /備份未成功，已暫停清理/);
  assert.match(pruneLine({ day: 'd', status: 'failed', error: 'boom' }), /清理失敗 ⚠️ boom/);
  assert.match(pruneLine(null), /今日尚無紀錄/);
});

test('戰報卡片：有傳清理狀態才顯示這一行', () => {
  const sum = summarizeEvents([{ type: 'session_start', uid: 'u' }]);
  const health = (p) => JSON.stringify(p.cardsV2[0].card.sections.at(-1));
  assert.doesNotMatch(health(buildDigestPayload('d', 'd', sum, null)), /舊快照/);
  assert.match(health(buildDigestPayload('d', 'd', sum, null, null)), /舊快照清理：今日尚無紀錄/);
  assert.match(health(buildDigestPayload('d', 'd', sum, null, { day: 'd', status: 'ok', removedSnapshots: 1 })), /清理一週前舊快照 1 份/);
});

console.log(`\n全部 ${passed} 項通過`);
