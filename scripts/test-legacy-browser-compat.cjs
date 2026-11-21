// 舊手機相容：學校有老師用 Android 舊版 Chrome（80～84），
// 程式裡不能出現它看不懂的語法（整支檔案會載入失敗），新函式要先補上。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// 1. 不可使用 Chrome 85 才支援的邏輯指派 ||=、&&=、??=（v3.69.2 事故：cloud-safety.js 整支沒載入）
const files = [...fs.readdirSync('js').filter(f => f.endsWith('.js')).map(f => 'js/' + f), 'sw.js'];
const sources = files.map(f => [f, fs.readFileSync(f, 'utf8')]);
for (const f of ['classnew.html', 'pets.html', 'index.html']) {
    const html = fs.readFileSync(f, 'utf8');
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi; let m;
    while ((m = re.exec(html))) sources.push([f + '（內嵌）', m[1]]);
}
for (const [name, src] of sources) {
    src.split('\n').forEach((line, i) => {
        assert.ok(!/(\|\||&&|\?\?)=/.test(line), `${name}:${i + 1} 用了舊版 Chrome 看不懂的 ||= / &&= / ??=，請改成 a = a || b`);
    });
}

// 2. 補丁要在每個頁面的第一支 js/ 之前
const block = {};
for (const f of ['classnew.html', 'pets.html']) {
    const html = fs.readFileSync(f, 'utf8');
    const start = html.indexOf('<!-- COMPAT-POLYFILL:START -->'), end = html.indexOf('<!-- COMPAT-POLYFILL:END -->');
    assert.ok(start > 0 && end > start, `${f} 缺少舊手機相容補丁`);
    assert.ok(end < html.indexOf('<script src="js/'), `${f} 的相容補丁要放在第一支 js/ 之前`);
    block[f] = html.slice(html.indexOf('<script>', start) + 8, html.lastIndexOf('</script>', end));
}
assert.equal(block['classnew.html'], block['pets.html'], '兩個頁面的補丁內容要一致');

// 3. 用到的新函式都要有補丁
const used = sources.map(s => s[1]).join('\n');
for (const api of ['Object.hasOwn', 'crypto.randomUUID', 'replaceChildren']) {
    if (used.includes(api.split('.').pop())) assert.ok(block['pets.html'].includes(`'${api.split('.').pop()}'`), `用到 ${api} 卻沒有補丁`);
}

// 4. 模擬舊瀏覽器：沒有這三個函式時補上後能正常運作，已有時不覆蓋
function makeEnv(modern) {
    class Node { constructor() { this.children = []; } get lastChild() { return this.children[this.children.length - 1] || null; }
        removeChild(c) { this.children.splice(this.children.indexOf(c), 1); return c; } append(...n) { this.children.push(...n); } }
    class Element extends Node {} class Document extends Node {} class DocumentFragment extends Node {}
    const ObjectCopy = Object.create(null);
    const FakeObject = function (v) { return Object(v); };
    Object.assign(FakeObject, { defineProperty: Object.defineProperty, prototype: Object.prototype });
    const crypto = { getRandomValues: a => { for (let i = 0; i < a.length; i++) a[i] = (i * 37 + 11) & 255; return a; } };
    const native = () => 'native';
    if (modern) { FakeObject.hasOwn = native; crypto.randomUUID = native; Element.prototype.replaceChildren = native; }
    const window = { crypto, Element, Document, DocumentFragment };
    vm.runInNewContext(block['pets.html'], { window, Object: FakeObject, Uint8Array, TypeError });
    return { window, FakeObject, Element, ObjectCopy };
}
const old = makeEnv(false);
assert.equal(old.FakeObject.hasOwn({ a: 1 }, 'a'), true);
assert.equal(old.FakeObject.hasOwn({ a: 1 }, 'toString'), false);
assert.equal(old.FakeObject.hasOwn(Object.create(null), 'x'), false);
assert.throws(() => old.FakeObject.hasOwn(null, 'a'), TypeError);
const uuid = old.window.crypto.randomUUID();
assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'randomUUID 格式要正確：' + uuid);
const box = new old.Element(); box.append('舊1', '舊2');
box.replaceChildren('新1', '新2', '新3');
assert.deepEqual(box.children, ['新1', '新2', '新3']);
box.replaceChildren();
assert.deepEqual(box.children, []);
const modern = makeEnv(true);
assert.equal(modern.FakeObject.hasOwn(), 'native', '瀏覽器已有的函式不要蓋掉');
assert.equal(modern.window.crypto.randomUUID(), 'native');
assert.equal(new modern.Element().replaceChildren(), 'native');

// 5. 沒有網頁音效功能（iPhone App 內建瀏覽器、鎖定模式）：第一次點擊不能出錯，之後的音效靜音（2026-11-21 實際發生）
{
    const html = fs.readFileSync('classnew.html', 'utf8');
    const m = html.match(/function initAudioContext\(\) \{[\s\S]*?\n {8}\}/);
    assert.ok(m, '找不到 initAudioContext');
    for (const win of [{}, { AudioContext: undefined, webkitAudioContext: undefined }, { AudioContext: function () { throw new Error('blocked'); } }]) {
        const ctx = { window: win, audioContext: null };
        vm.runInNewContext(`let audioContext = null; ${m[0]}; initAudioContext(); this.result = audioContext;`, ctx);
        assert.equal(ctx.result, null, '沒有音效功能時 initAudioContext 不得丟錯、audioContext 維持 null');
    }
    const ok = { window: { AudioContext: function () { this.ok = true; } } };
    vm.runInNewContext(`let audioContext = null; ${m[0]}; initAudioContext(); this.result = audioContext;`, ok);
    assert.equal(ok.result.ok, true, '有音效功能時照常建立');
    for (const fn of ['playTimerEndSound', 'playLotteryTickSound', 'playLotteryWinSound', 'playCheerSound', 'playAddScoreSound', 'playSubtractScoreSound']) {
        assert.match(html, new RegExp(`function ${fn}\\(\\) \\{\\s*if \\(!audioContext\\) return;`), `${fn} 要先檢查 audioContext`);
    }
    const quiet = fs.readFileSync('js/quiet-challenge.js', 'utf8');
    const check = quiet.indexOf("if (typeof Ctx !== 'function')"), mic = quiet.indexOf('getUserMedia({ audio');
    assert.ok(check > 0 && check < mic, '安靜挑戰要在開麥克風之前先確認有音效功能');
}

console.log('✅ 舊手機相容：沒有 ||= 類語法、補丁位置與功能正確、沒有音效功能也不出錯');
