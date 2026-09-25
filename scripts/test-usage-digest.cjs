// 每日戰報的衝突分類、舊資料相容與統計口徑回歸檢查。
const assert = require('node:assert/strict');
const {
  buildDigestPayload,
  canonicalizeFeatureStats,
  isExpectedSyncWait,
  isSyncConflictEvent,
  summarizeEvents,
} = require('../functions/digest-summary');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('PASS', name);
}

test('舊版 pets 與新版班級寵物標籤會合併', () => {
  assert.deepEqual(canonicalizeFeatureStats({ pets: 88, '班級寵物': 119 }), { '班級寵物': 207 });
});

test('舊版同步錯誤會歸入衝突，並按帳號與班級去重', () => {
  const summary = summarizeEvents([
    { type: 'sync_conflict', uid: 'teacher-a', classId: '601', day: '2026-09-22', notify: true },
    { type: 'error', uid: 'teacher-a', classId: '601', day: '2026-09-22', message: '資料已在其他分頁或同步中更新', _documentId: 'legacy-1' },
    { type: 'sync_conflict', uid: 'teacher-b', classId: '602', day: '2026-09-22', notify: false },
    { type: 'error', uid: 'teacher-c', classId: '603', day: '2026-09-22', message: '另一台裝置已更新此班', _documentId: 'legacy-2' },
    { type: 'sync_conflict', uid: 'teacher-d', classId: '604', day: '2026-09-22', notify: false, source: 'legacy-divergence' },
    { type: 'error', uid: 'teacher-c', feature: 'pet', operation: 'cloud_sync', failureStage: 'unavailable', message: 'Failed to get document because the client is offline.' },
    { type: 'error', uid: 'teacher-c', feature: 'pet', operation: 'cloud_sync', failureStage: 'unavailable', message: 'Firestore service unavailable.' },
  ]);

  assert.equal(isSyncConflictEvent({ type: 'error', message: '資料已在其他分頁或同步中更新' }), true);
  assert.deepEqual(summary.syncConflicts, { total: 4, cloudDivergence: 1, legacyBaselineDifference: 1, sourceUnverified: 2 });
  assert.equal(summary.errors.length, 1);
  assert.match(summary.errors[0].message, /service unavailable/);
});

test('新班級以班級 ID 去重，同名但不同 ID 仍分開計算', () => {
  const summary = summarizeEvents([
    { type: 'class_create', uid: 'teacher-a', classId: 'class-1', className: '502自然' },
    { type: 'class_create', uid: 'teacher-a', classId: 'class-1', className: '502自然' },
    { type: 'class_create', uid: 'teacher-a', classId: 'class-2', className: '502自然' },
  ]);
  assert.equal(summary.classesCreated.length, 2);
});

test('寵物戰報呈現獎勵人次、撤銷後淨變動與設定動作', () => {
  const summary = summarizeEvents([
    { type: 'pet_reward', count: 3, points: 2, xp: 3, coins: 4 },
    { type: 'pet_reward', count: 1, points: 1, xp: 2, coins: 3 },
    { type: 'pet_undo', count: 3, points: 6, xp: 9, coins: 12 },
    { type: 'pet_settings', action: '啟用金幣' },
    { type: 'pet_settings', action: '新增獎勵規則' },
  ]);
  assert.equal(summary.pet.rewards, 2);
  assert.equal(summary.pet.rewardOccurrences, 4);
  assert.deepEqual([summary.pet.pointsNet, summary.pet.xpNet, summary.pet.coinsNet], [1, 2, 3]);
  assert.deepEqual(summary.pet.settingsByAction, { '啟用金幣': 1, '新增獎勵規則': 1 });

  const payload = buildDigestPayload('2026-09-22', '09/22（週二）', summary, { day: '2026-09-22', status: 'ok' });
  assert.match(JSON.stringify(payload.cardsV2), /受獎 4 人次/);
  assert.match(JSON.stringify(payload.cardsV2), /啟用金幣 1/);
});

test('同步戰報使用當日事件語氣，不把發生數寫成仍待處理數', () => {
  const summary = summarizeEvents([
    { type: 'sync_conflict', uid: 'teacher-a', classId: '601', notify: false },
  ]);
  const payload = buildDigestPayload('2026-09-22', '09/22（週二）', summary, null);
  assert.match(payload.text, /今日同步差異 1 件/);
  assert.match(payload.text, /來源待確認 1/);
  assert.doesNotMatch(payload.text, /請完成比較後再繼續/);
});

console.log(`✅ 每日戰報彙整測試通過：${passed} 項`);

test('登入與離線等待不誤報，但真正錯誤保留', () => {
 const base={type:'error',feature:'pet',operation:'cloud_sync'};
 for(const message of ['請先登入 Google 帳號','已存本機，恢復連線後再同步']) {
  assert.equal(isExpectedSyncWait({...base,message}),true);
  assert.equal(summarizeEvents([{...base,message}]).errors.length,0);
 }
 for(const message of ['permission-denied','雲端備份完整性檢查失敗','Failed to get document because the client is offline.']) {
  assert.equal(isExpectedSyncWait({...base,message}),false);
  assert.equal(summarizeEvents([{...base,message}]).errors.length,1);
 }
 assert.equal(isExpectedSyncWait({...base,operation:'reward',message:'請先登入 Google 帳號'}),false);
});
