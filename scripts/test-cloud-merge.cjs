// 同步衝突的三方合併：兩邊各自新增的都保留；無法判斷時整份放棄，交給老師比較。
const assert = require('node:assert/strict');
const { mergeValues } = require('../js/cloud-merge.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS', name); }
const json = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === null ? null : JSON.stringify(v)]));
function run(base, local, remote, deviceKeys) {
    const keys = [...new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])];
    const result = mergeValues(json(base), json(local), json(remote), keys, deviceKeys);
    return result.ok ? Object.fromEntries(Object.entries(result.values).map(([k, v]) => [k, v === null ? null : JSON.parse(v)])) : result;
}
const record = (id, createdAtMs, extra = {}) => ({ id, createdAtMs, studentId: 1, points: 1, petEvent: true, ...extra });

test('只有一邊動過的鍵直接採用那一邊', () => {
    const out = run({ students: [{ id: 1 }], homeworkList: [] }, { students: [{ id: 1, name: '改' }], homeworkList: [] }, { students: [{ id: 1 }], homeworkList: [{ id: 9 }] });
    assert.deepEqual(out, { students: [{ id: 1, name: '改' }], homeworkList: [{ id: 9 }] });
});
test('兩台都加分：明細全部保留、由新到舊，分數把兩邊的增減加總', () => {
    const base = { pointsHistory: [record('a', 1)], students: [{ id: 1, points: 10 }], groups: [{ id: 'g', score: 10, members: [{ id: 1 }] }] };
    const local = { pointsHistory: [record('c', 3), record('a', 1)], students: [{ id: 1, points: 12 }], groups: [{ id: 'g', score: 12, members: [{ id: 1 }] }] };
    const remote = { pointsHistory: [record('d', 4), record('b', 2), record('a', 1)], students: [{ id: 1, points: 15 }], groups: [{ id: 'g', score: 15, members: [{ id: 1 }] }] };
    const out = run(base, local, remote);
    assert.deepEqual(out.pointsHistory.map(r => r.id), ['d', 'c', 'b', 'a']);
    assert.equal(out.students[0].points, 17);
    assert.equal(out.groups[0].score, 17);
});
test('扣分也能加總', () => {
    assert.equal(run({ students: [{ id: 1, points: 10 }] }, { students: [{ id: 1, points: 8 }] }, { students: [{ id: 1, points: 13 }] }).students[0].points, 11);
});
test('有一邊把分數歸零（重設分數）：不加總，交給老師', () => {
    assert.deepEqual(run({ students: [{ id: 1, points: 10 }] }, { students: [{ id: 1, points: 0 }] }, { students: [{ id: 1, points: 13 }] }), { ok: false, path: 'students.points' });
});
test('同一學生不同欄位各改各的都保留', () => {
    const out = run({ students: [{ id: 1, name: '甲', number: 1 }] }, { students: [{ id: 1, name: '乙', number: 1 }] }, { students: [{ id: 1, name: '甲', number: 5 }] });
    assert.deepEqual(out.students, [{ id: 1, name: '乙', number: 5 }]);
});
test('同一欄位兩邊改得不同：放棄合併，且回報的位置不含學生內容', () => {
    assert.deepEqual(run({ students: [{ id: 1, classPet: 'cat' }] }, { students: [{ id: 1, classPet: 'dog' }] }, { students: [{ id: 1, classPet: 'fox' }] }), { ok: false, path: 'students.classPet' });
});
test('一邊刪除、另一邊修改同一筆：放棄合併', () => {
    assert.equal(run({ homeworkList: [{ id: 1, name: 'a' }] }, { homeworkList: [] }, { homeworkList: [{ id: 1, name: 'b' }] }).ok, false);
});
test('一邊刪除、另一邊沒動：確實刪除，不會活回來', () => {
    const out = run({ homeworkList: [{ id: 1 }, { id: 2 }] }, { homeworkList: [{ id: 2 }] }, { homeworkList: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    assert.deepEqual(out.homeworkList.map(h => h.id), [2, 3]);
});
test('只有本機調整順序：保留本機順序，雲端新增的接在後面', () => {
    const out = run({ homeworkList: [{ id: 1 }, { id: 2 }] }, { homeworkList: [{ id: 2 }, { id: 1 }] }, { homeworkList: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    assert.deepEqual(out.homeworkList.map(h => h.id), [2, 1, 3]);
});
test('位置式陣列（座位）兩邊都動過：不猜，放棄合併', () => {
    assert.equal(run({ seatingConfig: { seats: [1, 2] } }, { seatingConfig: { seats: [2, 1] } }, { seatingConfig: { seats: [1, 3] } }).ok, false);
});
test('寵物圖鑑兩邊都解鎖：都保留；同一種只差發現時間也不算衝突', () => {
    const out = run({ petSettings: { collection: {} } }, { petSettings: { collection: { cat: { discoveredAt: '1' }, dog: { discoveredAt: '1' } } } }, { petSettings: { collection: { cat: { discoveredAt: '2' }, fox: { discoveredAt: '2' } } } });
    assert.deepEqual(Object.keys(out.petSettings.collection).sort(), ['cat', 'dog', 'fox']);
});
test('最高等級取較大值', () => {
    assert.equal(run({ students: [{ id: 1, petMaxLevel: 1 }] }, { students: [{ id: 1, petMaxLevel: 2 }] }, { students: [{ id: 1, petMaxLevel: 3 }] }).students[0].petMaxLevel, 3);
});
test('裝置偏好一律保留本機', () => {
    assert.deepEqual(run({ theme: 'a' }, { theme: 'b' }, { theme: 'c' }, ['theme']), { theme: 'b' });
});
test('舊資料同編號重複、沒有編號的紀錄都不會遺失', () => {
    const dup = { id: 'x', createdAtMs: 1 }, noId = { createdAtMs: 2, reason: '舊' };
    const out = run({ pointsHistory: [dup, dup, noId] }, { pointsHistory: [record('l', 5), dup, dup, noId] }, { pointsHistory: [record('r', 6), dup, dup, noId] });
    assert.equal(out.pointsHistory.length, 5);
});
test('無法解析的內容：放棄合併而不是丟錯', () => {
    assert.equal(mergeValues({ boardNote: 'a' }, { boardNote: 'b' }, { boardNote: 'c' }, ['boardNote']).ok, false);
});
console.log(`${passed} cloud-merge checks passed`);
