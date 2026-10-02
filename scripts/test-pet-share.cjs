// 無網路、無正式資料的回歸驗收：寵物分享快照只含可公開欄位，且只在該送出時才寫入雲端。
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { webcrypto } = require('node:crypto');
let passed = 0;
function setup({ classId = 'default', google = true, existing = [] } = {}) {
    class Storage {
        constructor() { this.data = new Map(); }
        getItem(k) { return this.data.has(k) ? this.data.get(k) : null; }
        setItem(k, v) { this.data.set(k, String(v)); }
        removeItem(k) { this.data.delete(k); }
        key(i) { return [...this.data.keys()][i] ?? null; }
        get length() { return this.data.size; }
    }
    const storage = new Storage(); storage.setItem('currentClassId', classId);
    const cloud = new Map(existing.map(doc => [doc.id, doc.data])), writes = [];
    const db = { collection(name) { assert.equal(name, 'petShares'); return {
        doc: id => ({ async set(data) { writes.push({ op: 'set', id, data }); cloud.set(id, data); }, async delete() { writes.push({ op: 'delete', id }); cloud.delete(id); } }),
        where(field, op, value) { assert.deepEqual([field, op], ['ownerUid', '==']); return { async get() {
            const docs = [...cloud].filter(([, data]) => data.ownerUid === value).map(([id, data]) => ({ id, data: () => data }));
            return { forEach: fn => docs.forEach(fn) }; } }; } }; } };
    const ctx = { Storage, localStorage: storage, sessionStorage: new Storage(), console: { log(){}, warn(){}, error(){} },
        navigator: { onLine: true }, crypto: webcrypto, btoa, URL, location: { href: 'https://example.test/class/classnew.html#pets' }, alert(){},
        document: { readyState: 'loading', addEventListener(){}, getElementById(){ return null; } }, addEventListener(){}, setTimeout, clearTimeout,
        firebase: { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TIME' } } },
        FirebaseConfig: { isGoogleUser: () => google, getCurrentUserId: () => 'teacher-1', getDb: () => db },
        ClassProfiles: { currentProfile: () => ({ name: '三年二班' }) } };
    ctx.window = ctx; vm.createContext(ctx);
    vm.runInContext(fs.readFileSync('js/class-aware-storage.js', 'utf8'), ctx);
    const suffix = classId === 'default' ? '' : '-' + classId;
    ctx.STUDENTS_KEY = 'students' + suffix; ctx.GROUPS_KEY = 'groups' + suffix; ctx.POINTS_HISTORY_KEY = 'pointsHistory' + suffix;
    ctx.students = [{ id: 1, name: '王小明', number: '1', points: 5 }, { id: 2, name: '陳美', number: '2', points: 0 }, { id: 3, name: '歐陽大同學', seatNumber: '30103', points: 0 }];
    ctx.groups = []; ctx.pointsHistory = [{ id: 1, studentId: 1, points: 5, reason: '上課講話被提醒' }];
    ['students', 'groups', 'pointsHistory'].forEach((k, i) => storage.setItem([ctx.STUDENTS_KEY, ctx.GROUPS_KEY, ctx.POINTS_HISTORY_KEY][i], JSON.stringify(ctx[k])));
    storage.setItem('petSettings', JSON.stringify({ enabled: true, coinsEnabled: true, rules: [], products: [{ id: 'p', name: '獎勵貼紙', cost: 10, active: true }, { id: 'q', name: '已下架', cost: 5, active: false }] }));
    vm.runInContext(fs.readFileSync('js/pet-share.js', 'utf8'), ctx);
    vm.runInContext(fs.readFileSync('js/class-pets.js', 'utf8'), ctx); ctx.ClassPets.prepare();
    const source = () => ({ students: ctx.students, pointsHistory: ctx.pointsHistory, config: ctx.ClassPets.settings(), className: '三年二班', classId });
    return { ctx, storage, writes, cloud, share: ctx.PetShare, pet: ctx.ClassPets, source };
}
// vm 內建立的物件原型與外層不同，比對內容前先轉成一般 JSON。
const plain = value => JSON.parse(JSON.stringify(value));
async function test(name, fn) { await fn(); passed++; console.log('PASS', name); }
(async () => {
    await test('姓名遮罩保留頭尾、兩字名只留姓', async () => {
        const { share } = setup();
        assert.deepEqual(['王小明', '陳美', '歐陽大同學', '李', ''].map(share.maskName), ['王○明', '陳○', '歐○○學', '李', '']);
    });
    await test('預設快照不含完整姓名、分數、加扣分原因、內部編號與金幣', async () => {
        const { share, pet, source } = setup();
        await pet.award([1], 12, '準時交作業');
        const payload = share.buildPayload(source()), json = JSON.stringify(payload);
        for (const secret of ['王小明', '歐陽大同學', '準時交作業', '上課講話被提醒', '"points"', '"id"', 'coins', 'products', '獎勵貼紙']) assert.equal(json.includes(secret), false, secret);
        assert.equal(payload.nameMode, 'masked'); assert.equal(payload.students[0].name, '王○明'); assert.equal(payload.students[2].seat, '30103');
        assert.equal(payload.students[0].xp, 12); assert.equal(new Set(payload.students.map(s => s.key)).size, 3);
    });
    await test('未孵化的蛋不透露種類，孵化後才公開並列入圖鑑', async () => {
        const { share, pet, ctx, source } = setup();
        ctx.students[1].classPet = 'dragon'; // 舊資料殘留的種類也不能外流
        await pet.award([1], 10, '努力');
        const payload = share.buildPayload(source());
        assert.equal(payload.students[0].kind, ctx.students[0].classPet); assert.equal(payload.students[1].kind, null); assert.equal(payload.students[1].mood, 'normal');
        assert.deepEqual(Object.keys(payload.collection), [ctx.students[0].classPet]);
    });
    await test('只顯示座號時不帶姓名；完整姓名須老師明確選擇', async () => {
        const { share, source } = setup();
        assert.deepEqual(plain(share.buildPayload(source(), { nameMode: 'seat' }).students.map(s => s.name)), ['', '', '']);
        assert.equal(share.buildPayload(source(), { nameMode: 'full' }).students[0].name, '王小明');
        assert.equal(share.buildPayload(source(), { nameMode: 'unknown' }).nameMode, 'masked');
    });
    await test('開啟金幣顯示才附上餘額與上架商品', async () => {
        const { share, pet, source } = setup();
        await pet.award([1], 4, '合作');
        const payload = share.buildPayload(source(), { showCoins: true });
        assert.equal(payload.students[0].coins, 4); assert.deepEqual(plain(payload.products), [{ name: '獎勵貼紙', cost: 10 }]);
    });
    await test('共同任務只公開進行中的名稱與進度，收藏蛋未揭曉不透露種類', async () => {
        const { share, pet, source } = setup();
        await pet.createQuest({ name: '全班安靜午休', target: 2 }, 'q1'); await pet.contributeQuest('q1', '老師的私下備註'); await pet.contributeQuest('q1'); await pet.claimQuest('q1');
        await pet.createQuest({ name: '整潔比賽', target: 3 }, 'q2'); await pet.contributeQuest('q2', '老師的私下備註');
        const payload = plain(share.buildPayload(source()));
        assert.deepEqual(payload.quests, [{ name: '整潔比賽', target: 3, progress: 1, startDate: '', endDate: '' }]);
        assert.equal(payload.questsDone, 1); assert.deepEqual(payload.eggs, [{ kind: null, from: '全班安靜午休' }]);
        assert.equal(JSON.stringify(payload).includes('私下備註'), false);
    });
    await test('未確認雲端清單或未用 Google 登入時不寫入', async () => {
        const a = setup(); assert.equal(await a.share.publish({ force: true }), false); await a.share.create({ nameMode: 'masked' });
        assert.equal(a.writes.length, 0); assert.equal(Object.keys(a.share.shares()).length, 0);
        const b = setup({ google: false }); await b.share.refresh(); await b.share.create({ nameMode: 'masked' });
        assert.equal(b.writes.length, 0); assert.equal(Object.keys(b.share.shares()).length, 0);
    });
    await test('建立分享只寫入規則允許的欄位，資料沒變不重複寫入', async () => {
        const { share, writes, pet } = setup();
        await share.refresh(); await share.create({ nameMode: 'masked', showCoins: false });
        assert.equal(writes.length, 1); const { id, data } = writes[0];
        assert.match(id, /^[A-Za-z0-9_-]{20,64}$/);
        assert.deepEqual(Object.keys(data).sort(), ['classId', 'className', 'nameMode', 'ownerUid', 'payload', 'schema', 'showCoins', 'updatedAt']);
        assert.equal(data.ownerUid, 'teacher-1'); assert.equal(data.schema, 1); assert.equal(typeof data.payload, 'string'); assert.equal(JSON.parse(data.payload).students.length, 3);
        assert.equal(await share.publish(), true); assert.equal(writes.length, 1);
        await pet.award([2], 10, '努力'); assert.equal(await share.publish(), true); assert.equal(writes.length, 2);
        assert.equal(JSON.parse(writes[1].data.payload).students[1].xp, 10); assert.equal(writes[1].id, id);
    });
    await test('換裝置剛開啟不覆蓋學生頁，之後真的變動才更新', async () => {
        const existing = [{ id: 'A'.repeat(24), data: { ownerUid: 'teacher-1', classId: 'default', className: '三年二班', nameMode: 'full', showCoins: false, updatedAt: { toMillis: () => 5 } } },
            { id: 'B'.repeat(24), data: { ownerUid: 'someone-else', classId: 'default', className: '別人的班', nameMode: 'full', showCoins: false } }];
        const { share, writes, pet } = setup({ existing });
        await share.refresh();
        assert.deepEqual(Object.keys(share.shares()), ['default']); assert.equal(share.shares().default.id, 'A'.repeat(24));
        assert.equal(await share.publish(), true); assert.equal(writes.length, 0);
        await pet.award([1], 3, '努力'); await share.publish();
        assert.equal(writes.length, 1); assert.equal(writes[0].data.nameMode, 'full'); assert.equal(JSON.parse(writes[0].data.payload).students[0].name, '王小明');
    });
    await test('同一班的重複連結仍列出，可供老師停止', async () => {
        const doc = (id, at) => ({ id, data: { ownerUid: 'teacher-1', classId: 'default', className: '三年二班', nameMode: 'masked', showCoins: false, updatedAt: { toMillis: () => at } } });
        const { share } = setup({ existing: [doc('A'.repeat(24), 9), doc('B'.repeat(24), 3)] });
        await share.refresh();
        assert.equal(share.shares().default.id, 'A'.repeat(24)); assert.equal(share.shares()['dup:' + 'B'.repeat(24)].id, 'B'.repeat(24));
    });
    await test('記憶體資料不屬於目前班級時不發布', async () => {
        const { share, writes, storage } = setup();
        await share.refresh(); await share.create({ nameMode: 'masked' }); assert.equal(writes.length, 1);
        storage.setItem('currentClassId', 'B');
        assert.equal(await share.publish({ force: true }), false); assert.equal(writes.length, 1);
    });
    await test('登入還原前畫出的面板不要求再登入，還原後自動顯示分享設定', async () => {
        // 最小的假 DOM：只需能串出面板文字。
        const node = tag => ({ tagName: tag, children: [], dataset: {}, style: {}, isConnected: true, textContent: '', className: '',
            append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; }, add(item) { this.children.push(item); },
            setAttribute() {}, addEventListener() {},
            get text() { return [this.textContent, ...this.children.map(child => child.text ?? '')].join('|'); } });
        const open = ({ remembered }) => {
            const a = setup(), listeners = []; let signedIn = false;
            a.ctx.document.createElement = node; a.ctx.Option = function (label) { this.text = label; };
            a.ctx.setTimeout = (fn, ms) => { const timer = setTimeout(fn, ms); timer.unref(); return timer; };
            if (remembered) a.storage.setItem('firebaseUserProfile', JSON.stringify({ uid: 'teacher-1', isAnonymous: false }));
            Object.assign(a.ctx.FirebaseConfig, { isGoogleUser: () => signedIn, onAuthStateChanged: fn => listeners.push(fn) });
            // 重新載入模組，讓它在「Firebase 已初始化、登入尚未還原」的狀態下掛上監聽。
            vm.runInContext(fs.readFileSync('js/pet-share.js', 'utf8'), a.ctx);
            const root = node('section'); a.ctx.PetShare.renderPanel(root);
            return { ...a, root, restore: async () => { signedIn = true; listeners.forEach(fn => fn()); await new Promise(r => setTimeout(r, 0)); } };
        };
        const teacher = open({ remembered: true });
        assert.ok(teacher.root.text.includes('確認登入中')); assert.equal(teacher.root.text.includes('用 Google 帳號登入'), false); assert.equal(teacher.root.text.includes('登入後可用'), false);
        await teacher.restore();
        assert.ok(teacher.root.text.includes('尚未分享')); assert.ok(teacher.root.text.includes('建立本班分享連結')); assert.equal(teacher.root.text.includes('確認登入中'), false);
        const guest = open({ remembered: false });
        assert.ok(guest.root.text.includes('登入後可用')); assert.equal(guest.root.text.includes('確認登入中'), false);
    });
    await test('隨專案提供的 QR 函式庫可將分享連結編成矩陣', async () => {
        const ctx = {}; vm.createContext(ctx);
        vm.runInContext(fs.readFileSync('js/vendor/qrcode-generator.js', 'utf8'), ctx);
        const qr = ctx.qrcode(0, 'M'); qr.addData('https://cagoooo.github.io/class/pets.html?s=' + 'A'.repeat(24)); qr.make();
        const count = qr.getModuleCount();
        assert.ok(count >= 21 && count <= 57, '模組數應落在容易掃描的範圍');
        // 三個定位圖案的外框為深色、內圈為淺色
        for (const [row, col] of [[0, 0], [0, count - 1], [count - 1, 0]]) assert.equal(qr.isDark(row, col), true);
        assert.equal(qr.isDark(1, 1), false); assert.equal(qr.isDark(3, 3), true);
        assert.ok(fs.readFileSync('js/pet-share.js', 'utf8').includes("'qrcode-generator.js?v=1.4.4'"));
    });
    console.log(`${passed} checks passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
