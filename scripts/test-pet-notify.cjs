// 寵物 webhook 事件模型與本機佇列的無網路回歸測試。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {
    PET_EVENT_TYPES,
    normalizePetData,
    petEventSummary,
} = require('../functions/pet-notification');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS', name); }

class Storage {
    constructor() { this.data = new Map(); }
    getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
    setItem(key, value) { this.data.set(key, String(value)); }
    removeItem(key) { this.data.delete(key); }
}

test('寵物事件模型只保留白名單欄位與安全數值', () => {
    const data = normalizePetData({
        classId: '601', className: '601 班', count: '2', xp: '3', cost: '9',
        studentName: '不應送出', reason: '完成約定', kinds: ['小貓', '小狗'],
    });
    assert.equal(data.classId, '601');
    assert.equal(data.count, 2);
    assert.equal(data.kinds, '小貓、小狗');
    assert.equal(data.studentName, undefined);
    assert.equal(petEventSummary('pet_hatch', { count: 2, kind: '小貓' }), '🥚 孵化 2 隻：小貓');
    assert.ok(PET_EVENT_TYPES.has('pet_settings'));
});

test('UsageNotify.pet、petError 與同步衝突各自進入持久佇列', () => {
    const localStorage = new Storage();
    const sessionStorage = new Storage();
    const ctx = {
        localStorage, sessionStorage, location: { href: 'https://example.test/class' },
        navigator: { userAgent: 'Mozilla/5.0 Chrome/140' },
        document: { readyState: 'loading', addEventListener() {} },
        addEventListener() {}, setTimeout, clearTimeout,
        console: { log() {}, warn() {}, error() {} },
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync('js/usage-notify.js', 'utf8'), ctx);
    ctx.UsageNotify.pet('hatch', { classId: '601', className: '601 班', count: 2, kinds: ['小貓', '小狗'], studentName: '不應送出' });
    ctx.UsageNotify.petError('設定寫入失敗', 'settings', { classId: '601', failureStage: 'storage' });
    ctx.UsageNotify.syncConflict('另一台裝置已更新此班', { classId: '601', feature: 'pet' });
    ctx.UsageNotify.syncConflict('不應重複送出', { classId: '601', feature: 'pet' });
    ctx.UsageNotify.classCreate('502自然', 'class-502-1');
    const queue = JSON.parse(localStorage.getItem('un_queue_v1'));
    assert.equal(queue.length, 4);
    assert.equal(queue[0].type, 'pet_hatch');
    assert.equal(queue[0].count, 2);
    assert.equal(queue[0].studentName, undefined);
    assert.equal(queue[1].type, 'error');
    assert.equal(queue[1].feature, 'pet');
    assert.equal(queue[1].operation, 'settings');
    assert.equal(queue[1].failureStage, 'storage');
    assert.equal(queue[2].type, 'sync_conflict');
    assert.equal(queue[2].message, '另一台裝置已更新此班');
    assert.equal(queue[2].failureStage, 'sync-conflict');
    assert.equal(queue[2].operation, 'cloud_sync');
    assert.equal(queue[3].type, 'class_create');
    assert.equal(queue[3].classId, 'class-502-1');
});

console.log(`✅ 寵物 webhook 通知測試通過：${passed} 項`);
