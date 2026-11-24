// 全站檢測「其餘發現」第五批：離線快取、登入、寵物、分享、安裝提示（v3.74.3）
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const read = f => fs.readFileSync(f, 'utf8');

const pending = [];
let passed = 0;
function test(name, fn) {
    const r = fn();
    if (r && typeof r.then === 'function') pending.push(r.then(() => { console.log('PASS', name); passed++; }));
    else { console.log('PASS', name); passed++; }
}
function grab(src, signature) {
    const start = src.indexOf(signature);
    assert.ok(start >= 0, '找不到 ' + signature);
    let depth = 0, i = src.indexOf('{', start);
    for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
    return src.slice(start, i + 1);
}

/** 在假的 Service Worker 環境載入 sw.js：快取用 Map，網路可以設定成離線 */
function loadSW() {
    const ORIGIN = 'https://cagoooo.github.io';
    const stores = new Map();
    let online = true; const fetched = [];
    const keyOf = (req, ignoreSearch) => { const u = new URL(typeof req === 'string' ? new URL(req, ORIGIN + '/class/sw.js').href : req.url); return ignoreSearch ? u.origin + u.pathname : u.href; };
    const caches = {
        async open(name) {
            if (!stores.has(name)) stores.set(name, new Map());
            const m = stores.get(name);
            return {
                async put(req, res) { m.set(keyOf(req), { req: typeof req === 'string' ? { url: new URL(req, ORIGIN + '/class/sw.js').href } : req, res }); },
                async keys() { return [...m.values()].map(v => v.req); },
                async delete(req) { return m.delete(keyOf(req)); },
            };
        },
        async match(req, opts = {}) {
            for (const m of stores.values()) for (const [k, v] of m) {
                if (opts.ignoreSearch ? keyOf(k, true) === keyOf(req, true) : k === keyOf(req)) return v.res;
            }
            return undefined;
        },
        async keys() { return [...stores.keys()]; },
        async delete(n) { return stores.delete(n); },
    };
    class Resp { constructor(body, init = {}) { this.body = body; this.status = init.status || 200; this.ok = this.status < 400; this.headers = init.headers || {}; } clone() { return this; } }
    const listeners = {};
    const self = { location: { origin: ORIGIN, href: ORIGIN + '/class/sw.js' }, addEventListener(t, fn) { listeners[t] = fn; }, skipWaiting() {}, clients: {} };
    const c = { self, caches, Response: Resp, Request: class { constructor(u) { this.url = new URL(u, ORIGIN + '/class/').href; } }, URL, console: { log() {}, warn() {}, error() {} }, Promise,
        fetch: async req => { fetched.push(typeof req === 'string' ? req : req.url); if (!online) throw new TypeError('Failed to fetch'); return new Resp('net:' + (req.url || req)); } };
    vm.createContext(c); vm.runInContext(read('sw.js'), c);
    const respond = async (url, destination = 'script') => {
        let p = null;
        listeners.fetch({ request: { url, method: 'GET', destination }, respondWith(x) { p = x; } });
        return p ? await p : 'not-intercepted';
    };
    return { c, caches, stores, respond, fetched, setOnline: v => { online = v; }, listeners };
}

test('離線快取：預先存的檔案沒帶 ?v=，離線時也找得到（以前對不上，離線開不起來）', async () => {
    const sw = loadSW();
    const cache = await sw.caches.open(sw.c.STATIC_CACHE);
    await cache.put('./js/class-profiles.js', new sw.c.Response('precached'));
    sw.setOnline(false);
    const res = await sw.respond('https://cagoooo.github.io/class/js/class-profiles.js?v=3.74.3');
    assert.equal(res.body, 'precached');
});

test('帶版本號的程式從快取拿到後，不在背景重抓（重抓會把新內容存在舊網址底下）', async () => {
    const sw = loadSW();
    const cache = await sw.caches.open(sw.c.DYNAMIC_CACHE);
    await cache.put({ url: 'https://cagoooo.github.io/class/js/a.js?v=1' }, new sw.c.Response('v1'));
    const res = await sw.respond('https://cagoooo.github.io/class/js/a.js?v=1');
    assert.equal(res.body, 'v1');
    assert.equal(sw.fetched.length, 0);
});

test('離線時圖片拿不到：回報失敗，不再回一張 📷 假圖', async () => {
    const sw = loadSW(); sw.setOnline(false);
    const res = await sw.respond('https://cagoooo.github.io/class/assets/pets/cat-1.webp?v=9', 'image');
    assert.equal(res.status, 503);
    assert.doesNotMatch(read('sw.js'), /📷<\/text>/);
});

test('離線時的頁面：主頁面用預先存的主頁面；學生分享頁不會變成老師的主程式', async () => {
    const sw = loadSW();
    const cache = await sw.caches.open(sw.c.STATIC_CACHE);
    await cache.put('./classnew.html', new sw.c.Response('MAIN'));
    sw.setOnline(false);
    assert.equal((await sw.respond('https://cagoooo.github.io/class/classnew.html', 'document')).body, 'MAIN');
    assert.equal((await sw.respond('https://cagoooo.github.io/class/', 'document')).body, 'MAIN');
    const pets = await sw.respond('https://cagoooo.github.io/class/pets.html?s=abc', 'document');
    assert.equal(pets.status, 503);
    assert.match(pets.body, /目前沒有網路/);
});

test('資料庫與登入的連線（googleapis）不經過 Service Worker、不被存進快取', async () => {
    const sw = loadSW();
    assert.equal(await sw.respond('https://firestore.googleapis.com/v1/projects/x/documents/users/a'), 'not-intercepted');
    assert.equal(await sw.respond('https://identitytoolkit.googleapis.com/v1/accounts:lookup'), 'not-intercepted');
    assert.notEqual(await sw.respond('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js'), 'not-intercepted', 'Firebase 程式庫照舊快取，離線也能開');
});

test('寵物圖快取有上限，超過先刪最早存的', async () => {
    const sw = loadSW();
    const cache = await sw.caches.open('class-manager-art-v1');
    for (let i = 0; i < 905; i++) await cache.put({ url: `https://cagoooo.github.io/class/assets/p/${i}.webp` }, new sw.c.Response(i));
    await vm.runInContext('trimArtCache()', sw.c);
    const keys = await cache.keys();
    assert.equal(keys.length, 900);
    assert.match(keys[0].url, /\/5\.webp$/);
});

test('預快取清單包含主頁面實際用到的程式與樣式', () => {
    const html = read('classnew.html'), sw = read('sw.js');
    const refs = [...new Set([...html.matchAll(/(?:src|href)="\.?\/?((?:js|css)\/[^"?]+)/g)].map(m => m[1]))];
    const listed = new Set([...sw.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]));
    assert.deepEqual(refs.filter(r => !listed.has(r)), []);
});

test('登入失敗：依原因告訴老師（彈出視窗被擋、沒網路、還在載入）；連按只開一個登入視窗', () => {
    const cfg = read('js/firebase-config.js'), ui = read('js/google-auth-ui.js');
    assert.match(cfg, /lastSignInError = String\(error && error\.code \|\| 'unknown'\);/);
    assert.match(cfg, /getLastSignInError: getLastSignInError,/);
    assert.match(ui, /if \(loginInFlight\) return;/);
    assert.match(ui, /reason === 'auth\/popup-blocked' \? '瀏覽器擋住了登入視窗/);
});

test('寵物：本機儲存不能用時不會整支停住；已交付的獎品退幣有加強提醒；登入狀態變了會重畫', () => {
    const src = read('js/class-pets.js');
    assert.doesNotMatch(src, /\['compact', 'cards'\]\.includes\(localStorage\.getItem\('petViewMode'\)\)/);
    assert.match(src, /const savedViewMode = \(\(\) => \{ try \{ return localStorage\.getItem\('petViewMode'\); \} catch \(e\) \{ return null; \} \}\)\(\);/);
    assert.match(src, /已經交給 \$\{r\.studentName\} 了/);
    assert.match(src, /config\.onAuthStateChanged\(\(\) => \{ if \(!busy/);
});

test('分享面板：雲端寫入 20 秒沒回應就當失敗，按鈕不會永遠卡住', async () => {
    const c = { Promise, setTimeout, clearTimeout, Error, Object };
    vm.createContext(c);
    vm.runInContext(grab(read('js/pet-share.js'), 'function withTimeout(promise, ms = 20000)') + '\nthis.w = withTimeout;', c);
    await assert.rejects(c.w(new Promise(() => {}), 20), e => e.code === 'timeout');
    assert.equal(await c.w(Promise.resolve('ok'), 1000), 'ok');
    assert.match(read('js/pet-share.js'), /await withTimeout\(db\(\)\.collection\(COLLECTION\)\.doc\(share\.id\)\.delete\(\)\);/);
});

test('安裝提示：iPad 也看得到加入主畫面教學；關掉 30 天後可以再提示；不再宣稱「接收即時通知」', () => {
    const src = read('js/pwa-install.js');
    assert.match(src, /navigator\.platform === 'MacIntel' && navigator\.maxTouchPoints > 1/);
    assert.match(src, /localStorage\.setItem\('pwaPromptSeen', String\(Date\.now\(\)\)\)/);
    assert.doesNotMatch(src, /接收即時通知/);
});

Promise.all(pending).then(() => console.log(passed + ' pwa/pets v3.74.3 checks passed'), e => { console.error(e); process.exit(1); });
