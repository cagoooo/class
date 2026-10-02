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

    // ── 提醒卡的顯示時機：不能打斷課堂操作 ──
    const { shouldShow, timing } = setup({ dirty: true }).LeaveSyncGuard;
    const now = 10_000_000, minute = 60_000;
    const pendingInfo = { active: true, syncing: false, status: 'pending' };
    // 預設狀態：變更已 10 分鐘沒上傳、老師已停下 1 分鐘、沒按過稍後提醒
    const view = overrides => ({ visible: false, userSyncing: false, snoozeUntil: 0, exitIntentAt: 0, lastInputAt: now - minute, pendingSince: now - 10 * minute, ...overrides });

    assert.equal(shouldShow(pendingInfo, view({ lastInputAt: now - 1000 }), now), false);
    assert.equal(shouldShow(pendingInfo, view({ lastInputAt: now - timing.QUIET_MS + 1 }), now), false);
    console.log('PASS 老師正在操作時不跳出提醒');

    assert.equal(shouldShow(pendingInfo, view({ pendingSince: now - 30_000 }), now), false);
    assert.equal(shouldShow(pendingInfo, view(), now), true);
    console.log('PASS 停下操作且變更已一陣子沒上傳才提醒');

    const snoozed = view({ snoozeUntil: now + timing.SNOOZE_MS });
    assert.equal(shouldShow(pendingInfo, snoozed, now), false);
    // 稍後提醒期間即使又加分（剛操作完、又停下來）、甚至滑鼠移向關閉分頁，也不出現
    assert.equal(shouldShow(pendingInfo, { ...snoozed, pendingSince: now - 20 * minute, exitIntentAt: now }, now), false);
    assert.equal(shouldShow(pendingInfo, snoozed, now + timing.SNOOZE_MS + 1), true);
    assert.equal(timing.SNOOZE_MS, 15 * minute);
    console.log('PASS 按稍後提醒後 15 分鐘內不再出現，時間到才恢復');

    assert.equal(shouldShow({ ...pendingInfo, syncing: true }, view(), now), false);
    assert.equal(shouldShow({ ...pendingInfo, syncing: true }, view({ visible: true }), now), true);
    assert.equal(shouldShow({ ...pendingInfo, syncing: true }, view({ userSyncing: true, snoozeUntil: now + minute }), now), true);
    console.log('PASS 背景自動同步不叫出卡片，老師自己按同步才顯示進度');

    assert.equal(shouldShow(pendingInfo, view({ lastInputAt: now - 1000, pendingSince: now - 1000, exitIntentAt: now - 1000 }), now), true);
    assert.equal(shouldShow(pendingInfo, view({ lastInputAt: now - 1000, exitIntentAt: now - timing.EXIT_INTENT_MS - 1 }), now), false);
    console.log('PASS 滑鼠移向關閉分頁時立即提醒');

    const conflictInfo = { active: true, syncing: false, status: 'conflict' };
    assert.equal(shouldShow(conflictInfo, view({ pendingSince: now }), now), true);
    assert.equal(shouldShow(conflictInfo, view({ lastInputAt: now - 1000 }), now), false);
    console.log('PASS 同步衝突在老師停下時就提醒，操作中仍不打斷');

    assert.equal(shouldShow({ active: false, syncing: false, status: 'synced' }, view({ visible: true, userSyncing: true }), now), false);
    assert.equal(shouldShow(pendingInfo, view({ visible: true, lastInputAt: now }), now), true);
    console.log('PASS 已同步就收起；已顯示的卡片在老師處理前不會自己消失');

    console.log('17 leave-sync-guard checks passed');
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}
