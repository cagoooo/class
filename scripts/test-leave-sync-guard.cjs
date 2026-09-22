// 離開前同步提醒：驗證只在需要保存時攔截關閉，且不打擾未登入或空白班級。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup({ google = true, status = 'pending', data = { students: [{ id: 1 }], pointsHistory: [] }, syncing = false, online = true } = {}) {
    const storage = new Map([['currentClassId', '601']]);
    const context = {
        console: { log() {}, warn() {}, error() {} },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
        FirebaseConfig: { isGoogleUser: () => google },
        CloudSafety: {
            status: () => status,
            capture: () => ({ students: JSON.stringify(data.students || []), pointsHistory: JSON.stringify(data.pointsHistory || []) }),
            dataFor: values => ({ version: '1.2', students: JSON.parse(values.students), pointsHistory: JSON.parse(values.pointsHistory) }),
            fingerprint: () => 'fingerprint',
        },
        syncStatus: { isSyncing: syncing },
        navigator: { onLine: online },
        document: { readyState: 'loading', addEventListener() {} },
        setTimeout,
        setInterval,
        clearInterval,
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('js/leave-sync-guard.js', 'utf8'), context);
    return context;
}

function beforeUnload(context) {
    let prevented = false;
    const event = { preventDefault: () => { prevented = true; } };
    const result = context.LeaveSyncGuard.beforeUnload(event);
    return { prevented, result, returnValue: event.returnValue };
}

try {
    const pending = setup();
    assert.equal(pending.LeaveSyncGuard.needsReminder(), true);
    assert.deepEqual(beforeUnload(pending), { prevented: true, result: '', returnValue: '' });
    console.log('PASS 有未同步成果時攔截關閉');

    const synced = setup({ status: 'synced' });
    assert.equal(synced.LeaveSyncGuard.needsReminder(), false);
    assert.deepEqual(beforeUnload(synced), { prevented: false, result: undefined, returnValue: undefined });
    console.log('PASS 已同步時不攔截關閉');

    const empty = setup({ data: { students: [], pointsHistory: [] } });
    assert.equal(empty.LeaveSyncGuard.needsReminder(), false);
    console.log('PASS 空白班級不顯示離開提醒');

    const anonymous = setup({ google: false });
    assert.equal(anonymous.LeaveSyncGuard.needsReminder(), false);
    console.log('PASS 未登入 Google 不攔截關閉');

    const offline = setup({ online: false });
    assert.equal(offline.LeaveSyncGuard.needsReminder(), false);
    console.log('PASS 離線時不彈出瀏覽器關閉確認');

    const conflict = setup({ status: 'conflict', data: { students: [], pointsHistory: [] } });
    assert.equal(conflict.LeaveSyncGuard.needsReminder(), true);
    console.log('PASS 同步衝突時攔截關閉');

    const syncing = setup({ status: 'pending', data: { students: [], pointsHistory: [] }, syncing: true });
    assert.equal(syncing.LeaveSyncGuard.needsReminder(), true);
    console.log('PASS 上傳進行中提醒等待完成');

    console.log('7 leave-sync-guard checks passed');
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}
