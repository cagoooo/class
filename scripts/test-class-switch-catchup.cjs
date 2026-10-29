/**
 * 切換班級前，先讓目標班級跟上雲端最新版本（v3.61.1）。
 * 科任老師在多台電腦輪流使用時，這台的目標班級可能停在幾天前；切班後直接加分會撞上同步衝突。
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'class-profiles.js'), 'utf8');

function setup({ googleUser = true, fastForward } = {}) {
    const store = new Map([['currentClassId', 'A'], ['classProfiles', JSON.stringify([{ id: 'A', name: '401' }, { id: 'B', name: '綜合304' }])]]);
    const order = [];
    const msg = { textContent: '' };
    const ctx = {
        console: { log() {}, warn() {} },
        setTimeout, clearTimeout, Promise, JSON, Date, String, Array, Set, Map, Object, Error,
        localStorage: {
            getItem: k => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => { store.set(k, String(v)); },
            removeItem: k => { store.delete(k); },
        },
        document: {
            readyState: 'loading',
            addEventListener() {},
            getElementById: id => (id === 'cs-switch-msg' ? msg : id === 'cs-switch-overlay' ? { classList: { add() {} } } : null),
        },
        location: { reload: () => order.push('reload:' + store.get('currentClassId')) },
        FirebaseConfig: { isGoogleUser: () => googleUser, canWriteCloud: () => false },
        CloudSafety: { fastForward: async id => { order.push('fastForward:' + id + ':' + msg.textContent); return fastForward ? fastForward(id) : 'updated'; } },
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(source, ctx);
    return { ctx, order };
}

(async () => {
    let n = 0;
    const test = async (name, fn) => { await fn(); n++; console.log('PASS ' + name); };

    await test('切班前先替目標班級確認雲端版本，再切換並重新載入', async () => {
        const { ctx, order } = setup();
        await ctx.ClassProfiles.switchTo('B');
        assert.strictEqual(order.length, 2);
        assert.ok(order[0].startsWith('fastForward:B:'), order[0]);
        assert.ok(order[0].includes('綜合304'), '切換畫面要告訴老師正在確認雲端資料');
        assert.strictEqual(order[1], 'reload:B');
    });

    await test('未登入 Google 時不檢查雲端，照常切換', async () => {
        const { ctx, order } = setup({ googleUser: false });
        await ctx.ClassProfiles.switchTo('B');
        assert.deepStrictEqual(Array.from(order), ['reload:B']);
    });

    await test('雲端確認失敗不阻擋切換', async () => {
        const { ctx, order } = setup({ fastForward: () => { throw Object.assign(Error('offline'), { code: 'sync-auth-required' }); } });
        await ctx.ClassProfiles.switchTo('B');
        assert.strictEqual(order[order.length - 1], 'reload:B');
    });

    await test('網路太慢時最多等 6 秒就照常切換', async () => {
        const realSetTimeout = setTimeout;
        const { ctx, order } = setup({ fastForward: () => new Promise(() => {}) });
        ctx.setTimeout = (fn, ms) => realSetTimeout(fn, ms === 6000 ? 5 : ms);   // 把 6 秒縮短，避免測試真的等待
        await ctx.ClassProfiles.switchTo('B');
        assert.strictEqual(order[order.length - 1], 'reload:B');
    });

    await test('切回目前班級不做任何事', async () => {
        const { ctx, order } = setup();
        await ctx.ClassProfiles.switchTo('A');
        assert.strictEqual(order.length, 0);
    });

    console.log(n + ' checks passed');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
