// 重要更新自動套用：只在安全時機、只在版本低於 minVersion 時動作。
const assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs');
function setup({ version = '3.45.0', min = '3.45.4', fullscreen = false, exam = false, syncing = false, online = true, guard = null } = {}) {
    const calls = [], listeners = {}, session = new Map(guard ? [['criticalUpdateReloadAt', String(guard)]] : []);
    const ctx = { console: { log() {}, warn() {} }, Date, setTimeout: () => {}, navigator: { onLine: online },
        sessionStorage: { getItem: k => session.get(k) ?? null, setItem: (k, v) => session.set(k, String(v)) },
        document: { readyState: 'complete', hidden: false, fullscreenElement: fullscreen ? {} : null,
            getElementById: () => exam ? {} : null, addEventListener: (t, f) => (listeners[t] ||= []).push(f) },
        getComputedStyle: () => ({ display: 'block', visibility: 'visible' }), location: { reload: () => calls.push('reload') },
        fetch: async url => { calls.push('fetch'); return { ok: true, json: async () => ({ minVersion: min }) }; },
        syncStatus: { isSyncing: syncing }, APP_VERSION: version,
        LeaveSyncGuard: { allowInternalNavigation: () => calls.push('allow') },
        PWAInstaller: { applyPendingUpdate: async () => { calls.push('apply'); } } };
    ctx.window = ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync('js/critical-update.js', 'utf8'), ctx);
    return { ctx, calls, fire: t => (listeners[t] || []).forEach(f => f({})) };
}
(async () => {
    const { isOlder } = setup().ctx.CriticalUpdate;
    assert.deepEqual([isOlder('3.45.0', '3.45.4'), isOlder('3.45.4', '3.45.4'), isOlder('3.46.0', '3.45.4'), isOlder('3.9.0', '3.10.0'), isOlder('3.45', '3.45.1')], [true, false, false, true, true]);
    console.log('PASS 版本比較以數字逐段判斷（3.9 < 3.10）');
    let t = setup(); assert.equal(await t.ctx.CriticalUpdate.check({ startup: true }), 'applied'); assert.deepEqual(t.calls, ['fetch', 'allow', 'apply']);
    console.log('PASS 版本過舊、剛開啟且沒操作：自動套用，並先放行離開確認');
    t = setup({ version: '3.45.4' }); assert.equal(await t.ctx.CriticalUpdate.check({ startup: true }), 'current'); assert.deepEqual(t.calls, ['fetch']);
    console.log('PASS 已是最低版本以上：不動');
    t = setup(); t.fire('pointerdown'); assert.equal(await t.ctx.CriticalUpdate.check({ startup: true }), 'skipped'); assert.deepEqual(t.calls, []);
    console.log('PASS 老師已開始操作：開啟時不更新');
    t = setup(); assert.equal(await t.ctx.CriticalUpdate.check(), 'skipped'); assert.deepEqual(t.calls, []);
    console.log('PASS 切回分頁但不夠閒置：不更新');
    for (const o of [{ fullscreen: true }, { exam: true }, { syncing: true }, { online: false }, { guard: Date.now() }]) {
        t = setup(o); assert.equal(await t.ctx.CriticalUpdate.check({ startup: true }), 'skipped'); assert.equal(t.calls.includes('apply'), false);
    }
    console.log('PASS 全螢幕、考試、同步中、離線、20 秒內剛重載過：一律不動');
    console.log('5 critical-update checks passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
