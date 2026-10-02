// 自動快轉的時機控制：剛開啟且尚未操作才自動更新並重新載入；使用途中只提示，由老師決定。
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
let passed = 0;
function setup({ dry = 'newer', applied = 'updated', google = true, syncing = false } = {}) {
    const listeners = {}, authCallbacks = [], calls = [], notices = [], session = new Map();
    const node = () => ({ style: {}, children: [], textContent: '', isConnected: true, setAttribute() {}, handlers: {},
        addEventListener(type, fn) { this.handlers[type] = fn; }, append(...items) { this.children.push(...items); }, remove() { this.isConnected = false; } });
    const body = node();
    const ctx = { console: { log() {}, warn() {} }, setTimeout: fn => fn(), Date,
        sessionStorage: { getItem: k => session.get(k) ?? null, setItem: (k, v) => session.set(k, String(v)), removeItem: k => session.delete(k) },
        document: { readyState: 'complete', hidden: false, body, createElement: node,
            addEventListener(type, fn) { (listeners[type] ||= []).push(fn); } },
        addEventListener(type, fn) { (listeners['window:' + type] ||= []).push(fn); },
        location: { reload() { calls.push('reload'); } },
        NotificationSystem: { success: message => notices.push(message) },
        syncStatus: { isSyncing: syncing },
        FirebaseConfig: { isGoogleUser: () => google, getDb: () => ({}), onAuthStateChanged: fn => authCallbacks.push(fn) },
        CloudSafety: { async fastForward(id, options) { calls.push(options?.dryRun ? 'dry' : 'apply'); return options?.dryRun ? ctx.dry : ctx.applied; } } };
    ctx.dry = dry; ctx.applied = applied; ctx.window = ctx; vm.createContext(ctx);
    vm.runInContext(fs.readFileSync('js/cloud-fast-forward.js', 'utf8'), ctx);
    const fire = type => (listeners[type] || []).forEach(fn => fn({}));
    const settle = () => new Promise(resolve => setImmediate(resolve));
    return { ctx, calls, notices, session, body, fire, settle, auth: async () => { authCallbacks.forEach(fn => fn()); await settle(); await settle(); } };
}
const banner = env => env.body.children.find(child => child.isConnected);
async function test(name, fn) { await fn(); passed++; console.log('PASS', name); }
(async () => {
    await test('剛開啟且尚未操作：自動更新並重新載入', async () => {
        const env = setup(); await env.auth();
        assert.deepEqual(env.calls, ['dry', 'apply', 'reload']); assert.equal(env.session.get('cloudFastForwardNotice'), '1'); assert.equal(banner(env), undefined);
    });
    await test('重新載入後提示已自動更新，且不重複檢查出迴圈', async () => {
        const env = setup({ dry: 'current' }); env.session.set('cloudFastForwardNotice', '1');
        vm.runInContext(fs.readFileSync('js/cloud-fast-forward.js', 'utf8'), env.ctx); await env.settle();
        assert.equal(env.notices.length, 1); assert.match(env.notices[0], /已自動更新/); assert.equal(env.session.has('cloudFastForwardNotice'), false);
    });
    await test('老師已開始操作：只提示，按下才更新', async () => {
        const env = setup(); env.fire('pointerdown'); await env.auth();
        assert.deepEqual(env.calls, ['dry']); const shown = banner(env); assert.ok(shown);
        assert.deepEqual(shown.children.slice(1).map(control => control.textContent), ['立即更新', '稍後']);
        await shown.children[1].handlers.click(); await env.settle();
        assert.deepEqual(env.calls, ['dry', 'apply', 'reload']);
    });
    await test('按「稍後」只關閉提示，不更新', async () => {
        const env = setup(); env.fire('keydown'); await env.auth();
        const shown = banner(env); shown.children[2].handlers.click();
        assert.equal(banner(env), undefined); assert.deepEqual(env.calls, ['dry']);
    });
    await test('雲端沒有較新、本機有變更、未登入或同步中都不介入', async () => {
        for (const options of [{ dry: 'current' }, { dry: 'local-changes' }, { dry: 'no-baseline' }]) {
            const env = setup(options); await env.auth(); assert.deepEqual(env.calls, ['dry']); assert.equal(banner(env), undefined);
        }
        for (const options of [{ google: false }, { syncing: true }]) {
            const env = setup(options); await env.auth(); assert.equal(env.calls.includes('apply'), false); assert.equal(env.calls.includes('reload'), false);
        }
    });
    await test('更新時發現本機剛有變更就不重新載入', async () => {
        const env = setup({ applied: 'local-changes' }); await env.auth();
        assert.deepEqual(env.calls, ['dry', 'apply']); assert.equal(env.session.has('cloudFastForwardNotice'), false);
    });
    await test('短時間內不重複重新載入', async () => {
        const env = setup(); env.session.set('cloudFastForwardReloadAt', String(Date.now())); await env.auth();
        assert.deepEqual(env.calls, ['dry', 'apply']); assert.equal(env.notices.length, 1);
    });
    console.log(`${passed} fast-forward checks passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
