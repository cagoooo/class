// 只有 Google 帳號（非匿名）才能把班級資料寫上雲端。開頁自動建立的匿名身分
// 只綁在單一瀏覽器，寫上去只會留下沒人認領的學生資料；匿名時資料只留本機。
// 這支測試執行真實的 firebase-config / cloud-safety / firebase-sync 程式，
// 用會記錄每一次寫入的假資料庫，確認匿名身分走過所有同步入口都沒有寫入。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS', name); }

// 任何讀取都回傳「雲端是空的」；任何寫入都記下來。
function recordingDb() {
    const writes = [];
    const emptySnap = { exists: false, empty: true, size: 0, docs: [], data: () => ({}), forEach() {} };
    const ref = path => new Proxy({}, {
        get(_, prop) {
            if (prop === 'then') return undefined;
            if (prop === 'get') return async () => emptySnap;
            if (['set', 'update', 'delete', 'add'].includes(prop)) return async () => { writes.push(`${prop} ${path}`); };
            return (...args) => ref(`${path}/${args.map(String).join('/')}`);
        },
    });
    const db = new Proxy({}, {
        get(_, prop) {
            if (prop === 'then') return undefined;
            if (prop === 'batch') return () => ({
                set: (r) => writes.push('batch.set'), delete: () => writes.push('batch.delete'), update: () => writes.push('batch.update'),
                commit: async () => { writes.push('batch.commit'); },
            });
            if (prop === 'runTransaction') return async (fn) => fn({
                get: async () => emptySnap,
                set: () => writes.push('tx.set'), update: () => writes.push('tx.update'), delete: () => writes.push('tx.delete'),
            });
            return (...args) => ref(args.map(String).join('/'));
        },
    });
    return { db, writes };
}

function setup({ googleSignedIn }) {
    class Storage {
        constructor() { this.data = new Map(); }
        getItem(k) { return this.data.has(k) ? this.data.get(k) : null; }
        setItem(k, v) { this.data.set(k, String(v)); }
        removeItem(k) { this.data.delete(k); }
        key(i) { return [...this.data.keys()][i] ?? null; }
        get length() { return this.data.size; }
    }
    const storage = new Storage();
    storage.setItem('currentClassId', 'A');
    storage.setItem('classProfiles', JSON.stringify([{ id: 'A', name: '測試班' }]));
    storage.setItem('students-A', JSON.stringify([{ id: 1, name: '虛構學生', number: 1, points: 3 }]));
    storage.setItem('pointsHistory-A', JSON.stringify([{ id: 9, studentId: 1, points: 3 }]));
    const { db, writes } = recordingDb();
    const notices = [];
    const user = googleSignedIn
        ? { uid: 'teacher', isAnonymous: false, email: 't@example.test', displayName: '老師' }
        : { uid: 'anon-123', isAnonymous: true };
    const auth = { currentUser: user, onAuthStateChanged(cb) { cb(user); return () => {}; } };
    const c = {
        Storage, localStorage: storage, sessionStorage: new Storage(), crypto: webcrypto,
        navigator: { onLine: true, userAgent: 'test' },
        console: { log() {}, warn() {}, error() {} },
        document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } },
        addEventListener() {}, alert() {}, setTimeout, clearTimeout,
        NotificationSystem: { error: m => notices.push(m), success: m => notices.push(m), warning: m => notices.push(m), info: m => notices.push(m) },
        SyncStatusIndicator: { updateStateBasedOnSync() {}, setState() {} },
        LocalRecovery: { put: async () => {}, get: async () => null },
        firebase: {
            apps: [{}], app: () => ({}),
            auth: () => auth,
            firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => 1 } }),
        },
    };
    c.window = c;
    vm.createContext(c);
    for (const f of ['class-aware-storage', 'backup-integrity', 'firebase-config', 'cloud-safety', 'firebase-sync']) {
        vm.runInContext(fs.readFileSync(`js/${f}.js`, 'utf8'), c);
    }
    return { c, writes, notices };
}

async function signIn(t) {
    await t.c.FirebaseConfig.initialize();
    t.c.FirebaseConfig.onAuthStateChanged();
}

(async () => {
    await test('匿名身分：isConnected 為真，但 canWriteCloud 為假', async () => {
        const t = setup({ googleSignedIn: false });
        await signIn(t);
        assert.equal(t.c.FirebaseConfig.isConnected(), true, '匿名身分仍算「已連線」');
        assert.equal(t.c.FirebaseConfig.canWriteCloud(), false);
    });

    await test('Google 帳號：canWriteCloud 為真；登入資料與實際身分不符時為假', async () => {
        const t = setup({ googleSignedIn: true });
        await signIn(t);
        assert.equal(t.c.FirebaseConfig.canWriteCloud(), true);
        // 畫面記住的是 Google 身分，但 SDK 目前實際是匿名身分 → 不可寫
        t.c.firebase.auth().currentUser = { uid: 'teacher', isAnonymous: true };
        assert.equal(t.c.FirebaseConfig.canWriteCloud(), false);
    });

    await test('匿名身分走過所有雲端同步入口，雲端寫入 0 次', async () => {
        const t = setup({ googleSignedIn: false });
        await signIn(t);
        // 有些寫入函式沒有掛在 FirebaseSync 上，直接取頁面全域函式
        const S = new Proxy(t.c.FirebaseSync, { get: (o, k) => o[k] || t.c[k] });
        await assert.rejects(t.c.CloudSafety.publish('A'), e => e.code === 'sync-auth-required');
        assert.equal(await S.syncToCloud(true), false);
        assert.equal(await S.syncToCloud(false), false);
        assert.ok(t.notices.some(m => /登入 Google 才會雲端備份與跨裝置同步/.test(m)), '手動同步要告訴老師資料只在本機');
        assert.equal(await S.syncPendingClasses(), false);
        assert.equal(await S.syncAllClassesToCloud(() => {}), null);
        assert.equal(await S.reconcileClassRegistry({ prefer: 'local' }), null);
        assert.equal(await S.deleteClassFromCloud('A'), false);
        await S.uploadClassProfilesMerged();
        await S.writeCloudSyncInfo();
        for (const fn of ['uploadCollection', 'uploadSingleDoc', 'uploadItem', 'deleteItem', 'uploadCollectionForClass']) {
            assert.equal(typeof S[fn], 'function', fn);
            assert.equal(await S[fn]('students', [{ id: 1 }], 'A'), false, fn);
        }
        assert.deepEqual(t.writes, [], `匿名身分不可寫雲端：${t.writes.join(', ')}`);
        // 本機資料完整保留
        assert.equal(JSON.parse(t.c.localStorage.getItem('students-A')).length, 1);
    });

    await test('對照組：Google 帳號時同一批入口會寫雲端', async () => {
        const t = setup({ googleSignedIn: true });
        await signIn(t);
        await t.c.writeCloudSyncInfo();
        await t.c.FirebaseSync.reconcileClassRegistry({ prefer: 'local' });
        assert.ok(t.writes.length > 0, 'Google 帳號應該照常同步');
    });

    await test('原始碼守門：firebase-sync 的寫入函式都先檢查 canWriteCloud', () => {
        const src = fs.readFileSync('js/firebase-sync.js', 'utf8');
        const writers = ['uploadCollection', 'uploadSingleDoc', 'uploadItem', 'deleteItem', 'uploadCollectionForClass',
            'syncToCloud', 'syncAllClassesToCloud', 'syncPendingClasses', 'writeClassMarker', 'reconcileClassRegistry',
            'writeCloudSyncInfo', 'deleteClassFromCloud', 'showSyncConfirmModal', 'showAllClassSyncModal', 'repairClassRegistry'];
        writers.forEach(name => {
            const start = src.indexOf(`async function ${name}(`);
            assert.ok(start >= 0, `找不到 ${name}`);
            const head = src.slice(start, start + 600);
            assert.match(head, /canWriteCloud\(\)/, `${name} 開頭沒有檢查 canWriteCloud()`);
        });
        assert.match(fs.readFileSync('js/cloud-safety.js', 'utf8'), /const c = writeContext\(id\);/, 'CloudSafety.publish 要用 writeContext');
    });

    console.log(`✅ Google 登入才同步測試通過：${passed} 項`);
})().catch(err => { console.error(err); process.exit(1); });
