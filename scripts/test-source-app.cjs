// 通知來源系統：班級小管家與剛好學共用 notifyUsage，通知與戰報都要標對是哪一站。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {
  APP_LABELS,
  appLabel,
  resolveSourceApp,
  withSourceApp,
  summarizeEvents,
  buildDigestPayload,
} = require('../functions/digest-summary');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS', name); }

class Storage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

test('新版前端明確帶 app 時直接採用', () => {
  assert.equal(resolveSourceApp({ type: 'error', app: 'akailao', url: 'https://x/class/' }), 'akailao');
  assert.equal(resolveSourceApp({ type: 'error', app: 'class' }), 'class');
  assert.equal(resolveSourceApp({ type: 'error', app: ' AKAILAO ' }), 'akailao');
});

test('舊版剛好學沒帶 app：靠 role／classroom、專屬型別、錯誤沒附網址辨識', () => {
  assert.equal(resolveSourceApp({ type: 'session_start', role: 'teacher' }), 'akailao');
  assert.equal(resolveSourceApp({ type: 'login', role: 'teacher', name: 'x', classroom: undefined }), 'akailao');
  assert.equal(resolveSourceApp({ type: 'class_end', classroomCount: 1 }), 'akailao');
  // 2026-10-08 實際收到的兩則：都沒有網址
  assert.equal(resolveSourceApp({ type: 'error', message: 'Uncaught ReferenceError: openMultipleChoiceSettingsFromPreparedMode is not defined', context: 'error · @ :1009 · 教師', url: '' }), 'akailao');
  assert.equal(resolveSourceApp({ type: 'error', message: 'Firebase: Error (auth/api-key-not-valid.-please-pass-a-valid-api-key.).', context: 'firebase-auth-failed' }), 'akailao');
});

test('班級小管家的事件（含舊版）都算班級小管家', () => {
  assert.equal(resolveSourceApp({ type: 'error', message: 'x', url: 'https://cagoooo.github.io/class/classnew.html' }), 'class');
  assert.equal(resolveSourceApp({ type: 'session_start' }), 'class');
  assert.equal(resolveSourceApp({ type: 'pet_reward', classId: '601' }), 'class');
  assert.equal(resolveSourceApp({ type: 'sync_conflict', message: 'x' }), 'class');
  // 舊版班級小管家的同步／寵物錯誤可能沒有網址，但帶班級或操作欄位
  assert.equal(resolveSourceApp({ type: 'error', classId: '601', message: '另一台裝置已更新此班' }), 'class');
  assert.equal(resolveSourceApp({ type: 'error', feature: 'pet', operation: 'cloud_sync', message: 'x' }), 'class');
  assert.equal(resolveSourceApp({ type: 'error', failureStage: 'storage', message: 'x' }), 'class');
  assert.equal(resolveSourceApp({ type: 'error', app: 'unknown-site', url: 'https://x' }), 'class');
  assert.equal(resolveSourceApp(null), 'class');
});

test('即時通知：純文字開頭與卡片副標題都標上系統名稱，不改到原物件', () => {
  const payload = { text: '🐞 系統發生錯誤 (王老師)', cardsV2: [{ cardId: 'c', card: { header: { title: '🐞 系統發生錯誤', subtitle: '班級小管家 · 使用情形' }, sections: [1] } }] };
  const out = withSourceApp(payload, 'akailao');
  assert.equal(out.text, '【剛好學】🐞 系統發生錯誤 (王老師)');
  assert.equal(out.cardsV2[0].card.header.subtitle, '剛好學 · 使用情形');
  assert.equal(out.cardsV2[0].card.header.title, '🐞 系統發生錯誤');
  assert.deepEqual(out.cardsV2[0].card.sections, [1]);
  assert.equal(payload.text, '🐞 系統發生錯誤 (王老師)');
  assert.equal(payload.cardsV2[0].card.header.subtitle, '班級小管家 · 使用情形');
  assert.equal(withSourceApp(payload, 'class').text, '【班級小管家】🐞 系統發生錯誤 (王老師)');
  assert.equal(appLabel('nope'), APP_LABELS.class);
});

test('戰報：剛好學的帳號、訪客、錯誤不混進班級小管家', () => {
  const sum = summarizeEvents([
    { type: 'session_start', uid: 'c1', app: 'class' },
    { type: 'error', uid: 'c1', message: '班級壞了', url: 'https://x/class/' },
    { type: 'session_start', uid: 'a1', anonymous: false, app: 'akailao' },
    { type: 'session_start', uid: 'a2', anonymous: true, app: 'akailao' },
    { type: 'session_start', app: 'akailao' },
    { type: 'error', uid: 'a1', message: '剛好學壞了', context: 'error · @ :1009 · 教師', url: '' },
    { type: 'error', uid: 'a1', feature: 'pet', operation: 'cloud_sync', message: '請先登入 Google 帳號', app: 'akailao' },
  ]);
  assert.equal(sum.activeTeachers, 1);
  assert.equal(sum.guestEvents, 0);
  assert.deepEqual(sum.errors.map((e) => e.message), ['班級壞了']);
  assert.deepEqual(sum.apps.akailao, {
    events: 5, accounts: 1, anonymous: 1, guestEvents: 1,
    errors: [{ message: '剛好學壞了', context: 'error · @ :1009 · 教師', who: '' }],
  });
});

test('戰報卡片：有剛好學事件才多一區，純文字摘要另起一行', () => {
  const withAkailao = buildDigestPayload('d', '10/08', summarizeEvents([
    { type: 'session_start', uid: 'c1' },
    { type: 'error', uid: 'a1', message: 'boom', url: '' },
  ]), null);
  const section = withAkailao.cardsV2[0].card.sections.find((s) => String(s.header || '').includes('剛好學'));
  assert.ok(section, '應有剛好學區塊');
  assert.match(section.widgets[0].decoratedText.text, /Google 帳號 1 個/);
  assert.match(section.widgets[0].decoratedText.text, /錯誤 1 則：boom/);
  assert.match(withAkailao.text, /🐞 錯誤 0 則\n🎓 剛好學：帳號 1 個 · 錯誤 1 則$/);

  const classOnly = buildDigestPayload('d', '10/08', summarizeEvents([{ type: 'session_start', uid: 'c1' }]), null);
  assert.ok(!classOnly.cardsV2[0].card.sections.some((s) => String(s.header || '').includes('剛好學')));
  assert.doesNotMatch(classOnly.text, /剛好學/);
});

test('班級小管家前端：排隊的每一筆事件都帶 app: class', () => {
  const localStorage = new Storage();
  const ctx = {
    localStorage, sessionStorage: new Storage(), location: { href: 'https://cagoooo.github.io/class/classnew.html' },
    navigator: { userAgent: 'Mozilla/5.0 Chrome/140' },
    document: { readyState: 'loading', addEventListener() {} },
    addEventListener() {}, setTimeout, clearTimeout,
    console: { log() {}, warn() {}, error() {} },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('js/usage-notify.js', 'utf8'), ctx);
  ctx.UsageNotify.error('測試錯誤', 'ctx');
  ctx.UsageNotify.classCreate('502自然', 'class-502-1');
  ctx.UsageNotify.pet('hatch', { classId: '601', count: 1 });
  const queue = JSON.parse(localStorage.getItem('un_queue_v1'));
  assert.ok(queue.length >= 3);
  queue.forEach((ev) => assert.equal(ev.app, 'class', ev.type));
});

console.log(`\n✅ 通知來源系統測試通過：${passed} 項`);
