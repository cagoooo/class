// App 內建瀏覽器防護：LINE 自動跳外部瀏覽器、Android 臉書等自動叫出 Chrome（只試一次）、iPhone 只顯示引導。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function extract(file) {
    const html = fs.readFileSync(file, 'utf8');
    const start = html.indexOf('<!-- 🛡️ App 內建瀏覽器防護');
    const s = html.indexOf('<script>', start) + '<script>'.length;
    const e = html.indexOf('</script>', s);
    return html.slice(s, e);
}

function run(code, { ua, href, tried = false }) {
    const u = new URL(href);
    const nav = [];
    const store = new Map(tried ? [['iabEscapeTried', '1']] : []);
    const domReady = [];
    const appended = [];
    const location = {
        host: u.host, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, href: u.href,
        replace(x) { nav.push(['replace', x]); },
    };
    const timers = [];
    const ctx = {
        setTimeout(fn) { timers.push(fn); return timers.length; },
        navigator: { userAgent: ua },
        sessionStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
        document: {
            addEventListener(t, fn) { if (t === 'DOMContentLoaded') domReady.push(fn); },
            createElement() { return { style: {}, set innerHTML(v) { this.html = v; } }; },
            body: { appendChild(el) { appended.push(el); } },
        },
    };
    ctx.location = new Proxy(location, {
        set(t, k, v) { if (k === 'href') nav.push(['href', v]); t[k] = v; return true; },
    });
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    assert.equal(nav.filter(n => n[0] === 'href').length, 0, '引導畫出來之前不得先跳轉');
    domReady.forEach(fn => fn());
    timers.forEach(fn => fn());
    return { nav, store, appended };
}

const ANDROID_FB = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]';
const IPHONE_FB = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]';
const LINE = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36 Line/14.0.0';
const CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const HREF = 'https://cagoooo.github.io/class/classnew.html?fbclid=abc#students';

for (const file of ['classnew.html', 'index.html']) {
    const code = extract(file);

    // Android 臉書：第一次自動叫出 Chrome，保留 query 與 hash，沒裝 Chrome 的備援網址帶 iabEscape=1
    let r = run(code, { ua: ANDROID_FB, href: HREF });
    assert.equal(r.nav.length, 1);
    const [kind, intent] = r.nav[0];
    assert.equal(kind, 'href');
    assert.ok(intent.startsWith('intent://cagoooo.github.io/class/classnew.html?fbclid=abc#students#Intent;scheme=https;package=com.android.chrome;'), intent);
    assert.ok(intent.includes('S.browser_fallback_url=' + encodeURIComponent('https://cagoooo.github.io/class/classnew.html?fbclid=abc&iabEscape=1#students')));
    assert.ok(intent.endsWith(';end'));
    assert.equal(r.store.get('iabEscapeTried'), '1');
    assert.equal(r.appended.length, 1, '仍要顯示引導，跳不過去時老師知道怎麼做');
    assert.ok(r.appended[0].html.includes('用 Chrome 開啟'));

    // 已試過（同分頁再開、或沒裝 Chrome 被帶回 iabEscape=1）：不再自動跳，只顯示引導與按鈕
    r = run(code, { ua: ANDROID_FB, href: HREF, tried: true });
    assert.equal(r.nav.length, 0);
    assert.ok(r.appended[0].html.includes('用 Chrome 開啟'));
    r = run(code, { ua: ANDROID_FB, href: 'https://cagoooo.github.io/class/classnew.html?iabEscape=1' });
    assert.equal(r.nav.length, 0, '帶 iabEscape=1 不得再跳，避免無限跳轉');

    // iPhone 臉書：沒有自動跳轉，只有引導、沒有 Chrome 按鈕
    r = run(code, { ua: IPHONE_FB, href: HREF });
    assert.equal(r.nav.length, 0);
    assert.equal(r.appended.length, 1);
    assert.ok(!r.appended[0].html.includes('用 Chrome 開啟'));

    // LINE：照舊用官方參數跳外部瀏覽器
    r = run(code, { ua: LINE, href: HREF });
    assert.deepEqual(r.nav, [['replace', 'https://cagoooo.github.io/class/classnew.html?fbclid=abc&openExternalBrowser=1#students']]);

    // 一般 Chrome：完全不受影響
    r = run(code, { ua: CHROME, href: HREF });
    assert.equal(r.nav.length, 0);
    assert.equal(r.appended.length, 0);
    console.log(`PASS ${file} App 內建瀏覽器防護（Android 臉書自動開 Chrome、iPhone 引導、LINE、一般瀏覽器）`);
}
