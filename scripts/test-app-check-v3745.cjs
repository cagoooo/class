// v3.74.5 App Check：正式網站才啟用、在登入與資料庫之前啟用、舊頁面配新程式不出錯、快取不攔 reCAPTCHA
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');

let passed = 0;
async function test(name, fn) { await fn(); console.log('PASS', name); passed++; }

const SRC = fs.readFileSync('js/firebase-config.js', 'utf8');

function load(hostname, { withAppCheck = true } = {}) {
    const calls = [];
    class ReCaptchaEnterpriseProvider { constructor(key) { this.key = key; } }
    const appCheck = function () { calls.push('appCheck()'); return { activate: (p, auto) => calls.push(['activate', p.key, auto]) }; };
    appCheck.ReCaptchaEnterpriseProvider = ReCaptchaEnterpriseProvider;
    const firebase = {
        apps: [],
        initializeApp: () => { calls.push('initializeApp'); return {}; },
        app: () => ({}),
        auth: () => { calls.push('auth'); return { onAuthStateChanged() {}, currentUser: null }; },
        firestore: () => { calls.push('firestore'); return { enablePersistence: async () => {} }; },
    };
    if (withAppCheck) firebase.appCheck = appCheck;
    const store = {};
    const window = { addEventListener() {} };
    const ctx = {
        window, firebase, console: { log() {}, warn() {}, error() {} },
        location: { hostname }, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
        document: { querySelector: () => null }, navigator: { onLine: true }, setTimeout, clearTimeout,
    };
    ctx.self = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx);
    return { ctx, calls, window };
}

(async () => {
    await test('正式網站：在登入與資料庫之前啟用 App Check，用企業版金鑰並自動換發票證', async () => {
        const { calls, window } = load('cagoooo.github.io');
        await window.FirebaseConfig.initialize();
        const act = calls.findIndex(c => Array.isArray(c) && c[0] === 'activate');
        assert.ok(act > 0, '有啟用');
        assert.equal(calls[act][1], '6Ld13zAuAAAAAJsfm00p6Ehh06EU1GUy1MRvbLJn');
        assert.equal(calls[act][2], true);
        assert.ok(act < calls.indexOf('auth') && act < calls.indexOf('firestore'), '先啟用再用登入與資料庫');
    });

    await test('本機與其他網址不啟用（金鑰只登記正式網域）', async () => {
        for (const host of ['localhost', '127.0.0.1', '::1', 'class-4719f.web.app']) {
            const { calls, window } = load(host);
            await window.FirebaseConfig.initialize();
            assert.equal(calls.some(c => Array.isArray(c)), false, host);
        }
    });

    await test('舊版主頁面沒載入 App Check 程式：照常初始化、不報錯', async () => {
        const { calls, window } = load('cagoooo.github.io', { withAppCheck: false });
        assert.equal(await window.FirebaseConfig.initialize(), true);
        assert.ok(calls.includes('auth') && calls.includes('firestore'));
    });

    await test('主頁面在 firebase-config.js 之前載入同版本的 App Check 相容程式', () => {
        const html = fs.readFileSync('classnew.html', 'utf8');
        const ac = html.indexOf('firebasejs/9.22.0/firebase-app-check-compat.js');
        assert.ok(ac > html.indexOf('firebasejs/9.22.0/firebase-app-compat.js'));
        assert.ok(ac < html.indexOf('src="js/firebase-config.js'));
    });

    await test('reCAPTCHA 徽章隱藏時頁尾有 Google 規定的說明與連結', () => {
        const html = fs.readFileSync('classnew.html', 'utf8');
        assert.match(html, /\.grecaptcha-badge \{ visibility: hidden !important; \}/);
        assert.match(html, /reCAPTCHA[\s\S]{0,80}policies\.google\.com\/privacy[\s\S]{0,200}policies\.google\.com\/terms/);
    });

    await test('Service Worker 不攔截 reCAPTCHA（存住舊的載入檔會讓驗證失效）', () => {
        const sw = fs.readFileSync('sw.js', 'utf8');
        const handler = sw.slice(sw.indexOf("addEventListener('fetch'"));
        const bypass = handler.indexOf('recaptcha');
        assert.ok(bypass > 0 && bypass < handler.indexOf('respondWith'), '在回應之前就放行');
        assert.match(handler, /google\\\.com\|recaptcha\\\.net/);
        assert.match(handler, /\/recaptcha\//);
    });

    console.log(passed + ' App Check checks passed');
})().catch(e => { console.error(e); process.exit(1); });
