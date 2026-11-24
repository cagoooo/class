// 全站檢測「其餘發現」第四批：同步（v3.74.2）
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const read = f => fs.readFileSync(f, 'utf8');
const { mergeValues } = require('../js/cloud-merge.js');

let passed = 0;
function test(name, fn) { fn(); console.log('PASS', name); passed++; }
function grab(src, signature) {
    const start = src.indexOf(signature);
    assert.ok(start >= 0, '找不到 ' + signature);
    let depth = 0, i = src.indexOf('{', start);
    for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
    return src.slice(start, i + 1);
}
const run = (base, local, remote, keys) => {
    const k = keys || [...new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])];
    const s = o => Object.fromEntries(Object.entries(o).map(([key, v]) => [key, JSON.stringify(v)]));
    const r = mergeValues(s(base), s(local), s(remote), k, []);
    return r.ok ? Object.fromEntries(Object.entries(r.values).map(([key, v]) => [key, v == null ? v : JSON.parse(v)])) : r;
};

test('抽籤名單兩邊都改過：當成集合合併（兩邊新增的都留、任一邊放回的就放回），不再整班卡住', () => {
    const out = run({ drawnStudentIds: [1, 2] }, { drawnStudentIds: [1, 2, 3] }, { drawnStudentIds: [2, 4] });
    assert.deepEqual(out.drawnStudentIds.slice().sort(), [2, 3, 4]);
});

test('潔牙勾選同一天兩台都勾：座號合在一起', () => {
    const day = '2026/11/24';
    const out = run({ brushChecked: { date: day, ids: [1] } }, { brushChecked: { date: day, ids: [1, 5] } }, { brushChecked: { date: day, ids: [1, 7] } });
    assert.deepEqual(out.brushChecked.ids.slice().sort((a, b) => a - b), [1, 5, 7]);
});

test('座位表這類「第幾格是誰」的清單：照舊不猜', () => {
    assert.equal(run({ seatingConfig: { seats: [1, 2] } }, { seatingConfig: { seats: [2, 1] } }, { seatingConfig: { seats: [1, 3] } }).ok, false);
});

test('明細排序：全班分數重置這類沒有 createdAtMs 的舊標記，依編號（時間戳）排在正確位置', () => {
    const t = 1763950000000;
    const base = { pointsHistory: [{ id: 'a', createdAtMs: t }] };
    const local = { pointsHistory: [{ id: 'a', createdAtMs: t }, { id: t + 2000, type: 'reset', points: 0 }] };
    const remote = { pointsHistory: [{ id: 'a', createdAtMs: t }, { id: 'b', createdAtMs: t + 1000 }, { id: 'c', createdAtMs: t + 3000 }] };
    const out = run(base, local, remote);
    assert.deepEqual(out.pointsHistory.map(r => String(r.id)), ['c', String(t + 2000), 'b', 'a']);
    assert.match(read('classnew.html'), /id: now\.getTime\(\), createdAtMs: now\.getTime\(\), type: 'reset'/);
});

test('同步進行中的修改：也留下異動標記，同步完成後燈號是「待同步」不是「已同步」', () => {
    const src = read('js/sync-status-indicator.js');
    assert.match(src, /if \(currentState === 'syncing'\) changedDuringSync = true;/);
    assert.match(grab(src, 'function setState(name)'), /if \(name === 'synced' && changedDuringSync\) name = 'pending';/);
    assert.doesNotMatch(src, /\} else if \(currentState !== 'syncing'\) \{\s*lastChangedAt/);
});

test('還原前副本：「找不到共同舊版本」與「雲端舊版資料」的副本也下載得到', () => {
    const fn = grab(read('js/cloud-safety.js'), 'async function downloadRecovery()');
    assert.match(fn, /\['', 'auto-merge:', 'no-base:', 'legacy-cloud:'\]/);
    assert.match(fn, /copy = \{ version: '1\.2', classId: copy\.classId, exportDate: copy\.savedAt, \.\.\.dataFor\(copy\.values\) \}/);
});

test('重要更新自動套用：計時器在跑、對話框開著、正在打字時不重新載入', () => {
    const fn = grab(read('js/critical-update.js'), 'function busy()');
    assert.match(fn, /window\.FirebaseConfig\?\.isPageBusy\?\.\(\)/);
    assert.match(fn, /textarea, select, \[contenteditable\]/);
});

test('同步燈號：只改這台電腦的偏好（主題等）不算還沒同步', () => {
    const fn = grab(read('js/cloud-safety.js'), 'function status(id = current())');
    assert.match(fn, /trackedMatches\(known, local\)/);
    assert.match(fn, /known\.tracked2 === tracked2Fingerprint\(local\)/);
});

test('雲端讀取：同一個版本讀過就不再整份下載；自動同步連續失敗 6 次先停', () => {
    const src = read('js/cloud-safety.js');
    const fn = grab(src, 'async function read(id = current())');
    assert.ok(fn.indexOf('readCache.get(cacheKey)') < fn.indexOf("collection('syncSnapshots')"), '先查快取再下載分段');
    assert.match(fn, /readCache\.set\(cacheKey, JSON\.stringify\(payload\.values\)\)/);
    assert.match(read('js/auto-sync.js'), /state\.retryCount < 6/);
});

console.log(passed + ' sync v3.74.2 checks passed');
