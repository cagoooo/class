// 離開前同步提醒：驗證只在需要保存時攔截關閉，且不打擾未登入或空白班級。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup({ google = true, status = 'pending', data = { students: [{ id: 1 }], pointsHistory: [] }, syncing = false, online = true, baseline = status === 'pending' ? (data.students || []).length > 0 : true, dirty = false } = {}) {
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
            hasBaseline: () => baseline,
            hasLocalChangeMarker: () => dirty,
        },
        syncStatus: { isSyncing: syncing },
        navigator: { onLine: online },
        document: { readyState: 'loading', addEventListener() {} },
        setTimeout,
        setInterval,
        clearTimeout,
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
    const pending = setup({ dirty: true });
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

    const switched = setup({ status: 'pending', baseline: false, dirty: false });
    assert.equal(switched.LeaveSyncGuard.needsReminder(), false);
    console.log('PASS 單純切換到既有班級不顯示提醒');

    const hydrated = setup({ status: 'pending', baseline: true, dirty: false });
    assert.equal(hydrated.LeaveSyncGuard.needsReminder(), false);
    console.log('PASS 初始化造成的指紋差異不顯示提醒');

    const firstEdit = setup({ status: 'pending', baseline: false, dirty: true });
    assert.equal(firstEdit.LeaveSyncGuard.needsReminder(), true);
    console.log('PASS 沒有同步基準但有明確異動仍顯示提醒');

    const internalNavigation = setup();
    internalNavigation.LeaveSyncGuard.allowInternalNavigation();
    assert.deepEqual(beforeUnload(internalNavigation), { prevented: false, result: undefined, returnValue: undefined });
    assert.equal(internalNavigation.LeaveSyncGuard.isInternalNavigation(), true);
    console.log('PASS 班級內部切換 reload 不攔截瀏覽器確認');

    console.log('10 leave-sync-guard checks passed');
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}
