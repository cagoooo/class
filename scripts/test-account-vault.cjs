// 同一台電腦多位老師（導師、科任）輪流登入：班級資料依帳號收納，不會互相污染（v3.67.0）
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');

function setup(prefill, prefillDrawers) {
    class Storage {
        constructor() { this.data = new Map(); }
        getItem(k) { return this.data.get(k) ?? null; }
        setItem(k, v) { this.data.set(k, String(v)); }
        removeItem(k) { this.data.delete(k); }
        key(i) { return [...this.data.keys()][i] ?? null; }
        get length() { return this.data.size; }
    }
    const storage = new Storage();
    if (prefill) for (const [k, v] of prefill.data) storage.data.set(k, v);
    const notices = [];
    let reloads = 0, listeners = {};
    const c = {
        Storage, localStorage: storage, sessionStorage: new Storage(), console: { log() {}, warn() {}, error() {} },
        document: { readyState: 'complete', addEventListener() {}, getElementById() { return null; } },
        addEventListener(type, fn) { (listeners[type] ||= []).push(fn); }, setTimeout() {}, clearTimeout() {},
        NotificationSystem: { info: m => notices.push(m), success: m => notices.push(m), error: m => notices.push(m), warning: m => notices.push(m) },
        location: { reload() { reloads++; } }
    };
    c.window = c; vm.createContext(c);
    vm.runInContext(fs.readFileSync('js/class-aware-storage.js', 'utf8'), c);
    vm.runInContext(fs.readFileSync('js/account-vault.js', 'utf8'), c);
    const drawers = new Map(prefillDrawers || []);
    let failPut = false;
    c.AccountVault._setVault({
        async get(id) { return drawers.has(id) ? structuredClone(drawers.get(id)) : null; },
        async put(id, v) { if (failPut) throw Error('quota'); drawers.set(id, structuredClone(v)); },
        async keys() { return [...drawers.keys()]; }
    });
    let profile = null;
    c.FirebaseConfig = { getCurrentProfile: () => profile };
    // 模擬重新整理：換一個新的頁面環境，沿用同一份 localStorage 與抽屜
    const reloadPage = () => {
        const next = setup.withStorage(storage, drawers);
        return next;
    };
    return {
        c, storage, drawers, notices, reloads: () => reloads, setProfile: p => { profile = p; },
        failPut: v => { failPut = v; }, fire: (type, e) => (listeners[type] || []).forEach(fn => fn(e)), reloadPage,
        V: c.AccountVault
    };
}
setup.withStorage = (storage, drawers) => setup(storage, drawers);
const classOf = (env, name, students) => {
    env.storage.setItem('classProfiles', JSON.stringify([{ id: 'default', name }]));
    env.storage.setItem('students', JSON.stringify(students));
    env.storage.setItem('pointsHistory', JSON.stringify([{ id: name + '-p', points: 1 }]));
    env.storage.setItem('lastSyncTime', '2026-11-18T00:00:00Z');
};
const studentsOf = env => JSON.parse(env.storage.getItem('students') || '[]').map(s => s.name);

let passed = 0;
async function test(name, fn) { await fn(); console.log('PASS', name); passed++; }

(async () => {
    await test('第一位老師登入：沒有主人的資料直接由這位老師接手（照舊行為）', async () => {
        const a = setup(); classOf(a, '導師班', [{ name: '虛構甲' }]);
        assert.equal(await a.V.claim('uidA'), 'owned');
        assert.equal(a.V.owner, 'uidA'); assert.equal(a.V.owns('uidA'), true); assert.equal(a.reloads(), 0);
        assert.deepEqual(studentsOf(a), ['虛構甲']);
    });

    await test('換另一位老師登入：前一位的班級收進抽屜、畫面清空，絕不留給新老師', async () => {
        const a = setup(); classOf(a, '導師班', [{ name: '虛構甲' }]); a.storage.setItem('theme', 'dark');
        a.storage.setItem('cloudSafetyBase:uidA:default', JSON.stringify({ token: 't', at: '2026-11-18' }));
        await a.V.claim('uidA');
        assert.equal(a.V.owns('uidB'), false);   // 還沒切換前，這份資料不准同步到 B
        assert.equal(await a.V.claim('uidB'), 'switched');
        assert.equal(a.reloads(), 1);
        assert.equal(a.storage.getItem('students'), null); assert.equal(a.storage.getItem('classProfiles'), null); assert.equal(a.storage.getItem('lastSyncTime'), null);
        assert.equal(a.storage.getItem('theme'), 'dark');                                   // 這台電腦的偏好留著
        assert.ok(a.storage.getItem('cloudSafetyBase:uidA:default'));                       // A 自己的同步紀錄留著（本來就依帳號分）
        assert.equal(a.V.owner, 'uidB'); assert.equal(a.V.owns('uidB'), true);
        const drawer = a.drawers.get('drawer:uidA').snapshots[0].entries;
        assert.deepEqual(JSON.parse(drawer.students).map(s => s.name), ['虛構甲']);
        assert.equal(drawer.theme, undefined);
    });

    await test('導師→科任→導師：各自拿回自己的班級，互不混入', async () => {
        const a = setup(); classOf(a, '導師班', [{ name: '虛構甲' }]); await a.V.claim('uidA');
        await a.V.claim('uidB'); classOf(a, '科任班', [{ name: '虛構乙' }]);
        assert.equal(await a.V.claim('uidA'), 'switched');
        assert.deepEqual(studentsOf(a), ['虛構甲']);
        assert.equal(JSON.parse(a.storage.getItem('classProfiles'))[0].name, '導師班');
        assert.equal(await a.V.claim('uidB'), 'switched');
        assert.deepEqual(studentsOf(a), ['虛構乙']);
    });

    await test('兩位科任（不同帳號）在同一台也各自分開，第三位老師從空白開始', async () => {
        const a = setup(); classOf(a, '自然', [{ name: '虛構丙' }]); await a.V.claim('uidC');
        await a.V.claim('uidD'); classOf(a, '英語', [{ name: '虛構丁' }]);
        await a.V.claim('uidE');
        assert.deepEqual(studentsOf(a), []);
        await a.V.claim('uidC'); assert.deepEqual(studentsOf(a), ['虛構丙']);
        await a.V.claim('uidD'); assert.deepEqual(studentsOf(a), ['虛構丁']);
    });

    await test('登出：收好自己的資料並清空，下一位未登入的人看不到；再登入就回來', async () => {
        const a = setup(); classOf(a, '導師班', [{ name: '虛構甲' }]); await a.V.claim('uidA');
        assert.equal(await a.V.release(), 'released');
        assert.deepEqual(studentsOf(a), []); assert.equal(a.V.owner, null);
        assert.equal(await a.V.claim('uidA'), 'switched');
        assert.deepEqual(studentsOf(a), ['虛構甲']); assert.equal(a.V.owner, 'uidA');
    });

    await test('抽屜存不進去：不清空、不切換，也不准同步給新帳號', async () => {
        const a = setup(); classOf(a, '導師班', [{ name: '虛構甲' }]); await a.V.claim('uidA');
        a.failPut(true);
        assert.equal(await a.V.claim('uidB'), 'blocked');
        assert.deepEqual(studentsOf(a), ['虛構甲']); assert.equal(a.V.owner, 'uidA');
        assert.equal(a.V.owns('uidB'), false);
        assert.ok(a.notices.some(m => m.includes('無法安全切換')));
        a.failPut(false);
        assert.equal(await a.V.release(), 'released');
    });

    await test('舊版沒有記主人、最後是另一位老師同步的資料：收進那位老師的抽屜', async () => {
        const a = setup(); classOf(a, '導師班', [{ name: '虛構甲' }]);
        a.storage.setItem('cloudSafetyBase:uidA:default', JSON.stringify({ token: 't1', at: '2026-11-17T08:00:00Z' }));
        a.storage.setItem('cloudSafetyBase:uidB:default', JSON.stringify({ token: 't2', at: '2026-11-10T08:00:00Z' }));
        assert.equal(await a.V.claim('uidB'), 'switched');
        assert.deepEqual(studentsOf(a), []);
        assert.ok(a.drawers.get('drawer:uidA'));
        assert.equal(await a.V.claim('uidA'), 'switched');
        assert.deepEqual(studentsOf(a), ['虛構甲']);
    });

    await test('舊版資料最後就是這位老師同步的：直接接手，不搬動', async () => {
        const a = setup(); classOf(a, '導師班', [{ name: '虛構甲' }]);
        a.storage.setItem('cloudSafetyBase:uidA:default', JSON.stringify({ token: 't1', at: '2026-11-17T08:00:00Z' }));
        assert.equal(await a.V.claim('uidA'), 'owned'); assert.equal(a.reloads(), 0);
        assert.deepEqual(studentsOf(a), ['虛構甲']);
    });

    await test('抽屜每位老師保留 3 份，舊的一份不會被下一次收納蓋掉', async () => {
        const a = setup();
        for (const n of ['一', '二', '三', '四']) { classOf(a, '導師班', [{ name: '虛構' + n }]); await a.V.claim('uidA'); await a.V.release(); }
        const list = a.drawers.get('drawer:uidA').snapshots;
        assert.equal(list.length, 3);
        assert.deepEqual(list.map(s => JSON.parse(s.entries.students)[0].name), ['虛構四', '虛構三', '虛構二']);
    });

    await test('另一個分頁換了帳號：這頁手上的舊資料不能寫回去，並重新整理', async () => {
        const a = setup(); classOf(a, '導師班', [{ name: '虛構甲' }]); await a.V.claim('uidA');
        const before = a.reloads();
        a.storage.data.set('workspaceOwner', 'uidB');   // 模擬另一個分頁已切換給 B
        a.storage.setItem('students', JSON.stringify([{ name: '舊頁面寫回' }]));
        assert.deepEqual(studentsOf(a), ['虛構甲']);      // 被擋下
        a.storage.setItem('theme', 'light'); assert.equal(a.storage.getItem('theme'), 'light');   // 這台電腦的偏好照常
        assert.equal(a.c.SafeStorage.writeRaw([['pointsHistory', '[]']], { context: 't' }), false);
        a.fire('storage', { key: 'workspaceOwner', newValue: 'uidB' });
        assert.equal(a.reloads(), before + 1);
    });

    await test('重新整理後的頁面以新主人為準，可以正常寫入', async () => {
        const a = setup(); classOf(a, '導師班', [{ name: '虛構甲' }]); await a.V.claim('uidA'); await a.V.claim('uidB');
        const b = a.reloadPage();
        b.storage.setItem('students', JSON.stringify([{ name: '虛構乙' }]));
        assert.deepEqual(studentsOf(b), ['虛構乙']); assert.equal(b.V.owns('uidB'), true);
    });

    await test('切換到一半被關掉（標記還在）：下次登入照樣完成，前一位的資料在抽屜裡', async () => {
        const a = setup(); classOf(a, '導師班', [{ name: '虛構甲' }]); await a.V.claim('uidA');
        a.storage.data.set('workspaceSwitching', JSON.stringify({ from: 'uidA', to: 'uidB' }));
        assert.equal(a.V.owns('uidA'), false);           // 有切換標記時一律不同步
        assert.equal(await a.V.claim('uidB'), 'switched');
        assert.equal(a.storage.getItem('workspaceSwitching'), null);
        assert.ok(a.drawers.get('drawer:uidA'));
    });

    await test('清空到一半被關掉（replacing）：不把半份資料收進抽屜，登入的老師拿回自己完整的資料', async () => {
        const a = setup(); classOf(a, '導師班', [{ name: '虛構甲' }]); await a.V.claim('uidA');
        await a.V.claim('uidB'); classOf(a, '科任班', [{ name: '虛構乙' }]); await a.V.claim('uidA');
        // A 要換 B：抽屜已存好、清空到一半（只剩 classProfiles）就被關掉
        a.storage.data.set('workspaceSwitching', JSON.stringify({ from: 'uidA', to: 'uidB', at: new Date().toISOString(), phase: 'replacing' }));
        a.storage.data.delete('students'); a.storage.data.delete('pointsHistory');
        const snapshotsBefore = a.drawers.get('drawer:uidA').snapshots.length;
        assert.equal(await a.V.claim('uidA'), 'switched');
        assert.deepEqual(studentsOf(a), ['虛構甲']); assert.equal(a.V.owner, 'uidA');
        assert.equal(a.drawers.get('drawer:uidA').snapshots.length, snapshotsBefore);   // 沒有多收一份殘缺的
        await a.V.claim('uidB'); assert.deepEqual(studentsOf(a), ['虛構乙']);
    });

    await test('FirebaseConfig.canWriteCloud：資料不屬於目前帳號時一律回 false', async () => {
        const src = fs.readFileSync('js/firebase-config.js', 'utf8');
        assert.match(src, /AccountVault && !window\.AccountVault\.owns\(currentUserId\)\) return false/);
        assert.match(src, /AccountVault\?\.claim\?\.\(user\.uid\)/);
        const cs = fs.readFileSync('js/cloud-safety.js', 'utf8');
        assert.match(cs, /AccountVault\.owns\(uid\)/);
        const ui = fs.readFileSync('js/google-auth-ui.js', 'utf8');
        assert.match(ui, /AccountVault\.claim\(profile\.uid\)/);
        assert.match(ui, /AccountVault\.release\(\)/);
    });

    await test('登出後重新整理（名冊自動補上預設班級）再用同一帳號登入：抽屜裡的班級資料會回來（v3.71.1）', async () => {
        const a = setup(); classOf(a, '導師班', [{ name: '虛構甲' }]);
        await a.V.claim('uidA'); a.setProfile({ uid: 'uidA' });
        await a.V.release();
        assert.equal(a.storage.getItem('students'), null);
        const b = a.reloadPage();
        // 重新整理後 class-profiles 一定會重建只有預設班級的名冊
        b.storage.setItem('classProfiles', JSON.stringify([{ id: 'default', name: '預設班級', isDefault: true, icon: '📚', color: '#6366f1' }]));
        assert.equal(b.V.hasData(b.V._snapshot()), false, '只有預設班級不算有資料');
        assert.equal(await b.V.claim('uidA'), 'switched');
        assert.deepEqual(studentsOf(b), ['虛構甲']);
    });

    await test('只有預設班級的空白工作區不會被收進抽屜，蓋在真正的資料上面（v3.71.1）', async () => {
        const a = setup(); classOf(a, '導師班', [{ name: '虛構甲' }]);
        await a.V.claim('uidA'); a.setProfile({ uid: 'uidA' });
        await a.V.release();
        const b = a.reloadPage();
        b.storage.setItem('classProfiles', JSON.stringify([{ id: 'default', name: '預設班級', isDefault: true }]));
        await b.V.claim('uidB');                                   // 另一位老師在同一台登入
        const kept = [...b.drawers.values()].flatMap(d => d.snapshots || []).map(s => !!s.entries.students);
        assert.ok(kept.length >= 1 && kept.every(Boolean), '抽屜裡每一份都應該是有學生的真資料');
        assert.equal(b.V.hasData({ classProfiles: JSON.stringify([{ id: 'default' }, { id: '1001', name: '科任班' }]) }), true, '有自己建的班級仍算有資料');
    });

    console.log(`${passed} account vault checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
