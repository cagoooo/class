// 同步衝突的三方合併：兩邊各自新增的都保留；無法判斷時整份放棄，交給老師比較。
const assert = require('node:assert/strict');
const { mergeValues, unionWithoutBase } = require('../js/cloud-merge.js');
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
    assert.equal(mergeValues({ classAnnouncements: 'a' }, { classAnnouncements: 'b' }, { classAnnouncements: 'c' }, ['classAnnouncements']).ok, false);
});
// 2026-11-16：同一位學生的蛋在兩台各自孵化，抽到不同寵物
const egg = (extra = {}) => ({ id: 1, points: 8, classPetRevealed: false, ...extra });
test('兩台各自孵化不同寵物：採用比較早孵化的那隻，其餘照常合併', () => {
    const base = { students: [egg()], pointsHistory: [record('a', 1)] };
    const local = { students: [egg({ points: 12, classPet: 'turtle', classPetRevealed: true, petHatchedAt: '2026-11-13T05:24:33Z' })], pointsHistory: [record('c', 3), record('a', 1)] };
    const remote = { students: [egg({ points: 11, classPet: 'monkey', classPetRevealed: true, petHatchedAt: '2026-11-11T06:20:00Z' })], pointsHistory: [record('b', 2), record('a', 1)] };
    const out = run(base, local, remote);
    assert.equal(out.students[0].classPet, 'monkey');
    assert.equal(out.students[0].petHatchedAt, '2026-11-11T06:20:00Z');
    assert.equal(out.students[0].points, 15);
    assert.deepEqual(out.pointsHistory.map(r => r.id), ['c', 'b', 'a']);
});
test('兩台孵出同一種寵物、只差孵化時間：也能合併，取比較早的時間', () => {
    const out = run({ students: [egg()] }, { students: [egg({ classPet: 'cat', classPetRevealed: true, petHatchedAt: '2026-11-13T00:00:00Z' })] },
        { students: [egg({ classPet: 'cat', classPetRevealed: true, petHatchedAt: '2026-11-12T00:00:00Z' })] });
    assert.equal(out.students[0].petHatchedAt, '2026-11-12T00:00:00Z');
});
test('看不出哪邊先孵化：用雲端那隻', () => {
    const out = run({ students: [egg()] }, { students: [egg({ classPet: 'dog', classPetRevealed: true })] }, { students: [egg({ classPet: 'fox', classPetRevealed: true })] });
    assert.equal(out.students[0].classPet, 'fox');
});
test('共同版本早就孵化了、兩邊又各自改成不同寵物：仍交給老師', () => {
    const hatched = { classPet: 'cat', classPetRevealed: true, petHatchedAt: '2026-11-01T00:00:00Z' };
    assert.deepEqual(run({ students: [egg(hatched)] }, { students: [egg({ ...hatched, classPet: 'dog' })] }, { students: [egg({ ...hatched, classPet: 'fox' })] }),
        { ok: false, path: 'students.classPet' });
});
test('兩台把同一筆聯絡簿改成一樣的內容、只差修改時間：採用較晚的時間（家老師 11/19 實際情況）', () => {
    const entry = (content, updatedAt) => ({ id: 60234, date: '2026/11/19', type: 'homework', content, timestamp: '2026/11/18 12:42:22', priority: 'normal', ...(updatedAt ? { updatedAt } : {}) });
    const out = run({ notebookEntries: [entry('舊')] }, { notebookEntries: [entry('新', '2026/11/19 11:38:02')] }, { notebookEntries: [entry('新', '2026/11/19 11:35:55')] });
    assert.equal(out.notebookEntries[0].updatedAt, '2026/11/19 11:38:02');
    assert.equal(out.notebookEntries[0].content, '新');
    const flipped = run({ notebookEntries: [entry('舊')] }, { notebookEntries: [entry('新', '2026/11/9 08:00:00')] }, { notebookEntries: [entry('新', '2026/11/19 07:00:00')] });
    assert.equal(flipped.notebookEntries[0].updatedAt, '2026/11/19 07:00:00', '日期位數不同也要比對正確');
});
test('兩台把同一筆聯絡簿改成不同內容：仍交給老師', () => {
    const entry = (content, updatedAt) => ({ id: 1, content, ...(updatedAt ? { updatedAt } : {}) });
    assert.equal(run({ notebookEntries: [entry('舊')] }, { notebookEntries: [entry('甲', '2026/11/19 11:38:02')] }, { notebookEntries: [entry('乙', '2026/11/19 11:35:55')] }).ok, false);
});

const T0 = Date.parse('2026-11-12T08:00:00+08:00'), H = 3600e3;
const pr = (id, t, studentId, points, extra = {}) => ({ id, createdAtMs: t, studentId, points, ...extra });
const cls = (history, students, groups, more = {}) => json({ students, groups, pointsHistory: history, notebookEntries: [], homeworkList: [], lotteryHistory: [], ...more });
const people = () => [{ id: 1, name: '虛構甲', points: 100 }, { id: 2, name: '虛構乙', points: 50 }];
const team = () => [{ id: 'g1', score: 300, members: [{ id: 1 }] }];
function union(local, remote) {
    const r = unionWithoutBase(local, remote);
    return r.ok ? { ...r, data: Object.fromEntries(Object.entries(r.changes).map(([k, v]) => [k, JSON.parse(v)])) } : r;
}
test('沒有共同舊版本、久沒開的電腦留著當時的加扣分：以雲端為主補上，學生與小組分數跟著加（東老師 11/20 實際情況）', () => {
    const shared = pr('s', T0, 1, 10);
    const local = cls([pr('b2', T0 + 4 * H, 1, -100), pr('b1', T0 + 2 * H, 2, 50), shared], people(), team());
    const remote = cls([pr('a9', T0 + 200 * H, 2, 20), pr('a1', T0 + 3 * H, 1, 50), shared], [{ id: 1, name: '虛構甲', points: 160 }, { id: 2, name: '虛構乙', points: 70 }], [{ id: 'g1', score: 360, members: [{ id: 1 }] }]);
    const out = union(local, remote);
    assert.equal(out.ok, true);
    assert.equal(out.added, 2);
    assert.deepEqual(out.data.pointsHistory.map(r => r.id), ['a9', 'b2', 'a1', 'b1', 's'], '由新到舊排好');
    assert.deepEqual(out.data.students.map(s => s.points), [60, 120]);
    assert.equal(out.data.groups[0].score, 260, '小組分數跟著組員的扣分減少');
    assert.equal(out.changes.notebookEntries, undefined, '其他資料採用雲端，由呼叫端處理');
});
test('寵物獎勵依紀錄上的小組編號加小組分數', () => {
    const shared = pr('s', T0, 1, 0);
    const local = cls([pr('b', T0 + H, 2, 5, { petGroupId: 'g2' }), shared], people(), team());
    const remote = cls([shared], people(), [...team(), { id: 'g2', score: 0, members: [] }]);
    assert.deepEqual(union(local, remote).data.groups.map(g => g.score), [300, 5]);
});
test('這台多出來的紀錄比兩邊共有的最新一筆還舊（像是學期封存清掉的）：不合併', () => {
    const local = cls([pr('new', T0 + 5 * H, 1, 1), pr('archived', T0 - H, 1, 1), pr('s', T0, 1, 1)], people(), team());
    const remote = cls([pr('s', T0, 1, 1)], people(), team());
    assert.deepEqual(unionWithoutBase(local, remote), { ok: false, path: 'no-base' });
});
test('這台多了雲端沒有的聯絡簿或作業：不合併', () => {
    const base = [pr('s', T0, 1, 1)];
    assert.equal(unionWithoutBase(cls([pr('b', T0 + H, 1, 1), ...base], people(), team(), { notebookEntries: [{ id: 7 }] }), cls(base, people(), team())).ok, false);
    assert.equal(unionWithoutBase(cls([pr('b', T0 + H, 1, 1), ...base], people(), team(), { homeworkList: [{ id: 8 }] }), cls(base, people(), team())).ok, false);
});
test('兩邊撤銷同一筆獎勵、這台有重新計分、紀錄看不出時間：不合併', () => {
    const base = [pr('orig', T0, 1, 3)];
    assert.equal(unionWithoutBase(cls([pr('u1', T0 + H, 1, -3, { petReverses: 'orig' }), ...base], people(), team()), cls([pr('u2', T0 + 2 * H, 1, -3, { petReverses: 'orig' }), ...base], people(), team())).ok, false);
    assert.equal(unionWithoutBase(cls([{ id: T0 + H, type: 'reset', studentId: null, points: 0 }, ...base], people(), team()), cls(base, people(), team())).ok, false);
    assert.equal(unionWithoutBase(cls([{ id: 'no-time', studentId: 1, points: 1 }, ...base], people(), team()), cls(base, people(), team())).ok, false);
});
test('這台的加分讓蛋孵化了：沿用這台的寵物；抽籤紀錄也補上', () => {
    const base = [pr('s', T0, 1, 0)];
    const hatched = { id: 1, name: '虛構甲', points: 100, classPet: 'fox', classPetRevealed: true, petHatchedAt: '2026-11-12T10:00:00Z', petMaxLevel: 2 };
    const local = cls([pr('b', T0 + H, 1, 10), ...base], [hatched], [], { lotteryHistory: [{ id: T0 + 2 * H, result: '1號' }, { id: T0 - H, result: '舊' }] });
    const remote = cls(base, [{ id: 1, name: '虛構甲', points: 120, petMaxLevel: 1 }], [], { lotteryHistory: [{ id: T0 - H, result: '舊' }] });
    const out = union(local, remote);
    assert.equal(out.data.students[0].classPet, 'fox');
    assert.equal(out.data.students[0].points, 130);
    assert.equal(out.data.students[0].petMaxLevel, 2);
    assert.deepEqual(out.data.lotteryHistory.map(r => r.result), ['1號', '舊']);
});
test('這台沒有多出任何紀錄：不合併', () => {
    const base = cls([pr('s', T0, 1, 1)], people(), team());
    assert.equal(unionWithoutBase(base, base).ok, false);
});
test('白板文字兩邊都改過：保留這台的白板，加扣分照常合併（柏老師 11/12～11/20 實際情況）', () => {
    const keys = ['boardNote', 'pointsHistory', 'students'];
    const base = { boardNote: '舊公告', pointsHistory: '[{"id":"a","createdAtMs":1,"studentId":1,"points":1}]', students: '[{"id":1,"points":1}]' };
    const local = { boardNote: '這台的公告', pointsHistory: '[{"id":"b","createdAtMs":3,"studentId":1,"points":2},{"id":"a","createdAtMs":1,"studentId":1,"points":1}]', students: '[{"id":1,"points":3}]' };
    const remote = { boardNote: '秩序不佳', pointsHistory: base.pointsHistory, students: base.students };
    const result = mergeValues(base, local, remote, keys);
    assert.equal(result.ok, true);
    assert.equal(result.values.boardNote, '這台的公告');
    assert.equal(JSON.parse(result.values.students)[0].points, 3);
    const style = mergeValues({ boardNoteStyle: '{"size":1,"color":"a"}' }, { boardNoteStyle: '{"size":2,"color":"a"}' }, { boardNoteStyle: '{"size":1,"color":"b"}' }, ['boardNoteStyle']);
    assert.deepEqual(JSON.parse(style.values.boardNoteStyle), { size: 2, color: 'b' }, '能合併的白板設定照常合併');
    const clash = mergeValues({ boardNoteStyle: '{"size":1}' }, { boardNoteStyle: '{"size":2}' }, { boardNoteStyle: '{"size":3}' }, ['boardNoteStyle']);
    assert.equal(clash.values.boardNoteStyle, '{"size":2}', '合不了就保留這台的');
});
test('潔牙勾選表：雲端被清空、這台勾了新的一天，採用新的一天，加扣分照常合併（柏老師 11/23～11/25 實際情況）', () => {
    const keys = ['brushChecked', 'students'];
    const base = { brushChecked: '{"date":"2026/11/10","ids":[5,4,9]}', students: '[{"id":1,"points":1}]' };
    const local = { brushChecked: '{"date":"2026/11/23","ids":[3,7]}', students: '[{"id":1,"points":2}]' };
    const remote = { brushChecked: null, students: base.students };
    const result = mergeValues(base, local, remote, keys);
    assert.equal(result.ok, true);
    assert.equal(result.values.brushChecked, local.brushChecked);
    assert.equal(JSON.parse(result.values.students)[0].points, 2);
});
test('潔牙勾選表：日期較新的一邊勝出；同一天把兩邊勾的座號合在一起；看不懂的當成最舊', () => {
    const one = (b, l, r) => mergeValues({ brushChecked: b }, { brushChecked: l }, { brushChecked: r }, ['brushChecked']).values.brushChecked;
    const d = (date, ids) => JSON.stringify({ date, ids });
    assert.equal(one(d('2026/11/10', [1]), d('2026/11/9', [2]), d('2026/11/24', [3])), d('2026/11/24', [3]), '雲端的日期較新（11/24 > 11/9，不是字串比大小）');
    assert.deepEqual(JSON.parse(one(d('2026/11/25', [1]), d('2026/11/25', [1, 2]), d('2026/11/25', [3]))).ids.sort(), [2, 3], '同一天：兩邊新增的都留，雲端取消的 1 號拿掉');
    assert.deepEqual(JSON.parse(one(d('2026/11/20', [9]), d('2026/11/25', [1]), d('2026/11/25', [2]))).ids.sort(), [1, 2], '共同版本是舊日期：同一天兩邊勾的都留');
    assert.equal(one(d('2026/11/10', [1]), '壞掉', d('2026/11/25', [2])), d('2026/11/25', [2]));
    assert.equal(one(d('2026/11/10', [1]), '壞掉', null), '壞掉', '兩邊都看不懂：保留這台的，不擋合併');
});
console.log(`${passed} cloud-merge checks passed`);
