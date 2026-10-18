// 手機上 Google 登入彈窗先被判定關閉、結果慢一步回來時，仍要補走登入後續流程。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup({ popupError, currentUser = null }) {
    const authListeners = [];
    const events = [];
    const store = new Map();
    const usage = [];
    const auth = {
        currentUser,
        signInWithPopup: async () => { throw popupError; },
        onAuthStateChanged(cb) {
            authListeners.push(cb);
            return () => { const i = authListeners.indexOf(cb); if (i >= 0) authListeners.splice(i, 1); };
        },
    };
    function GoogleAuthProvider() { this.setCustomParameters = () => {}; }
    const context = {
        console: { log() {}, warn() {}, error() {} },
        setTimeout: () => 1,
        clearTimeout() {},
        localStorage: { setItem: (k, v) => store.set(k, v), getItem: k => store.get(k) ?? null, removeItem: k => store.delete(k) },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
        dispatchEvent: e => events.push(e),
        UsageNotify: { login: (profile, isNew) => usage.push({ profile, isNew }) },
        firebase: {
            apps: [{}],
            app: () => ({}),
            auth: Object.assign(() => auth, { GoogleAuthProvider }),
            firestore: () => ({ enablePersistence: async () => {} }),
        },
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('js/firebase-config.js', 'utf8'), context);
    return { context, auth, authListeners, events, store, usage };
}

(async () => {
    // 彈窗先回報關閉，之後 SDK 才完成登入 → 補接
    const t1 = setup({ popupError: { code: 'auth/popup-closed-by-user' } });
    await t1.context.FirebaseConfig.initialize();
    assert.equal(await t1.context.FirebaseConfig.signInWithGoogle(), null);
    assert.equal(t1.authListeners.length, 1, '取消後應開始等候慢一步的登入');
    t1.authListeners[0](null);
    assert.equal(t1.events.length, 0, '仍未登入時不補接');
    t1.authListeners[0]({ uid: 'u1', isAnonymous: false, email: 't@example.test', displayName: '老師A' });
    assert.equal(t1.events.length, 1, '慢一步完成的登入應發出 gauth:late-signin');
    assert.equal(t1.events[0].type, 'gauth:late-signin');
    assert.equal(t1.events[0].detail.email, 't@example.test');
    assert.equal(t1.store.get('firebaseUserId'), 'u1', '應記住登入帳號');
    assert.equal(t1.usage.length, 1, '應送出登入使用情形');
    assert.equal(t1.authListeners.length, 0, '補接後應停止等候');
    console.log('PASS 彈窗關閉後慢一步完成的登入會補走後續流程');

    // 原本就登入同一帳號 → 不重複觸發
    const t2 = setup({ popupError: { code: 'auth/popup-closed-by-user' }, currentUser: { uid: 'u1', isAnonymous: false } });
    await t2.context.FirebaseConfig.initialize();
    await t2.context.FirebaseConfig.signInWithGoogle();
    t2.authListeners[0]({ uid: 'u1', isAnonymous: false });
    assert.equal(t2.events.length, 0, '同一帳號不應重複補接');
    console.log('PASS 已登入的同一帳號不重複補接');

    // 其他錯誤不等候
    const t3 = setup({ popupError: { code: 'auth/network-request-failed' } });
    await t3.context.FirebaseConfig.initialize();
    await t3.context.FirebaseConfig.signInWithGoogle();
    assert.equal(t3.authListeners.length, 0, '非取消類錯誤不應等候');
    console.log('PASS 非取消類錯誤不啟動補接');

    console.log('3 late-signin checks passed');
})().catch(e => { console.error(e); process.exit(1); });
