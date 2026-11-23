// notifyUsage 防洗版與卡片內容安全（2026-11-24，全站檢測第三批）
//  - 不用登入就能呼叫，所以防線在後端：訪客共用額度池、配額檢查失敗時訪客不推播
//  - 送到 Google Chat 前，內容裡的標籤與連結要處理掉（不能在管理員手機上放假連結）
//  - 剛好學的 create／feature／ai_api／class_end 要留底並進戰報
// 完全離線：firebase-admin、firebase-functions、fetch 都換成假的，載入真正的 functions/index.js 執行。
const path = require('node:path'), Module = require('node:module'), assert = require('node:assert/strict'), fs = require('node:fs');

// ───────── 假的 Firestore ─────────
const docs = new Map();          // 路徑 → 資料
const writes = [];               // 留底寫入（不含配額）
let txMode = 'ok';
function docRef(p) {
    return {
        path: p,
        async set(d) { writes.push({ op: 'set', path: p, data: d }); docs.set(p, { ...(docs.get(p) || {}), ...d }); },
        async create(d) { if (docs.has(p)) { const e = new Error('6 ALREADY_EXISTS'); e.code = 6; throw e; } writes.push({ op: 'create', path: p, data: d }); docs.set(p, d); },
        async get() { return { exists: docs.has(p), data: () => docs.get(p) }; },
    };
}
function col(name) {
    return {
        doc(id) {
            const p = name + '/' + id;
            assert.equal(p.split('/').length % 2, 0, '文件路徑的段數不對（會寫進子集合）：' + p);
            return docRef(p);
        },
        async add(d) { writes.push({ op: 'add', path: name + '/auto', data: d }); },
    };
}
const fakeAdmin = {
    initializeApp() {},
    firestore: Object.assign(() => ({
        collection: col,
        async runTransaction(fn) {
            if (txMode === 'abort') throw new Error('10 ABORTED: Too much contention');
            const pending = [];
            const result = await fn({
                async get(ref) { return { exists: docs.has(ref.path), data: () => docs.get(ref.path) }; },
                set(ref, patch) { pending.push([ref.path, patch]); },
            });
            pending.forEach(([p, patch]) => docs.set(p, { ...(docs.get(p) || {}), ...patch }));
            return result;
        },
    }), {
        FieldValue: { serverTimestamp: () => 'TS' },
        Timestamp: { fromMillis: (m) => m },
    }),
};
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const fakes = {
    'firebase-admin': fakeAdmin,
    'firebase-functions/v2/https': { onCall: (opts, handler) => ({ run: handler, opts }), HttpsError },
    'firebase-functions/v2/scheduler': { onSchedule: (opts, handler) => ({ run: handler, opts }) },
    'firebase-functions/params': { defineSecret: (name) => ({ value: () => process.env[name] || '' }) },
    'firebase-functions/logger': { info() {}, warn() {}, error() {}, log() {} },
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
    return Object.hasOwn(fakes, request) ? 'FAKE:' + request : origResolve.call(this, request, ...rest);
};
Object.entries(fakes).forEach(([name, exports]) => {
    require.cache['FAKE:' + name] = { id: 'FAKE:' + name, filename: 'FAKE:' + name, loaded: true, exports };
});

const pushed = [];
global.fetch = async (url, opt) => { pushed.push(JSON.parse(opt.body)); return { ok: true, text: async () => '' }; };
process.env.GOOGLE_CHAT_WEBHOOK = 'https://stub.invalid/webhook';

const FN_DIR = path.join(__dirname, '..', 'functions');
const fns = require(path.join(FN_DIR, 'index.js'));
const { summarizeEvents, buildDigestPayload } = require(path.join(FN_DIR, 'digest-summary.js'));
const { neutralizeMarkup, defangLinks } = require(path.join(FN_DIR, 'chat-safe.js'));

const run = (data, auth) => fns.notifyUsage.run({ data, auth, rawRequest: {} });
const teacher = (uid, name) => ({ uid, token: { email: uid + '@example.test', name: name || '王老師', firebase: { sign_in_provider: 'google.com' } } });
const anon = (uid) => ({ uid, token: { firebase: { sign_in_provider: 'anonymous' } } });
const reset = () => { docs.clear(); writes.length = 0; pushed.length = 0; txMode = 'ok'; };
const widgetTexts = (payload) => payload.cardsV2[0].card.sections.flatMap((s) => s.widgets.map((w) => w.decoratedText.text));

let passed = 0;
async function test(name, fn) { reset(); await fn(); console.log('PASS', name); passed++; }

(async () => {
    const EVIL = '<a href="https://evil.example/login">點此重新登入修復同步</a>';

    await test('沒登入的呼叫：訊息裡的標籤與連結送到 Chat 前都被處理掉，並加上提醒', async () => {
        const r = await run({ type: 'error', message: EVIL, context: '<b>x</b>', url: 'https://evil.example/a', ua: 'Windows Chrome/1' }, undefined);
        assert.equal(r.pushed, true);
        const body = JSON.stringify(pushed[0]);
        assert.ok(!/[<>]/.test(body), '送出的內容不可以還有角括號（舊版原樣送出，Chat 會顯示成可點的連結）');
        assert.ok(body.includes('＜a href='), '角括號換成全形，仍看得出原本寫什麼');
        assert.ok(!body.includes('://'), '訪客內容裡的網址要拆開，不讓 Chat 自動變成連結');
        assert.ok(widgetTexts(pushed[0]).some((t) => /訪客送出的內容未經驗證/.test(t)), '要有提醒不要點連結的一行');
    });

    await test('已登入 Google 的老師：角括號一樣處理，但網址保留（追查用），沒有訪客提醒', async () => {
        const r = await run({ type: 'error', message: 'Loading <chunk> failed https://cagoooo.github.io/class/js/a.js', url: 'https://cagoooo.github.io/class/classnew.html' }, teacher('T1'));
        assert.equal(r.pushed, true);
        const body = JSON.stringify(pushed[0]);
        assert.ok(!/[<>]/.test(body));
        assert.ok(body.includes('https://cagoooo.github.io/class/js/a.js'));
        assert.ok(!widgetTexts(pushed[0]).some((t) => /訪客送出的內容未經驗證/.test(t)));
    });

    await test('Google 顯示名稱裡的標籤也會被處理（名稱是使用者自己取的）', async () => {
        await run({ type: 'error', message: 'x', url: 'u' }, teacher('T2', '<users/all> <https://evil.example|點我>'));
        assert.ok(!/[<>]/.test(JSON.stringify(pushed[0])));
    });

    await test('匿名帳號開再多個，全站一天最多推 30 則（舊版每個帳號各 5 則，40 個帳號可推 200 則）', async () => {
        let count = 0;
        for (let u = 0; u < 40; u++) {
            for (let i = 0; i < 5; i++) {
                const r = await run({ type: 'error', message: 'flood ' + u + '-' + i, url: 'u' }, anon('anon-' + u));
                if (r.pushed) count++;
            }
        }
        assert.ok(count <= 30, '推播數 ' + count + ' 超過訪客額度池上限 30');
        assert.ok(count >= 3, '額度池還有空間時，訪客的錯誤仍然要能即時通報（實際 ' + count + '）');
        assert.equal(pushed.length, count);
    });

    await test('訪客額度池用完之後，已登入老師的錯誤通報照常送得出來', async () => {
        for (let u = 0; u < 60; u++) for (let i = 0; i < 5; i++) await run({ type: 'error', message: 'f', url: 'u' }, anon('a' + u));
        const before = pushed.length;
        const r = await run({ type: 'error', message: '老師這邊真的出錯了', url: 'u' }, teacher('T3'));
        assert.equal(r.pushed, true);
        assert.equal(pushed.length, before + 1);
    });

    await test('同一個匿名帳號仍受自己的每日 5 則限制', async () => {
        let count = 0;
        for (let i = 0; i < 8; i++) { const r = await run({ type: 'error', message: 'm' + i, url: 'u' }, anon('solo')); if (r.pushed) count++; }
        assert.ok(count <= 3, '同一份額度池每天 3 則（實際 ' + count + '）');
        const r = await run({ type: 'error', message: 'again', url: 'u' }, anon('solo'));
        assert.equal(r.pushed, false);
        assert.equal(r.throttled, true);
    });

    await test('訪客額度池的留底也有上限：池子滿了就不再寫入', async () => {
        const first = await run({ type: 'session_start' }, anon('visitor-1'));
        assert.equal(first.logged, true);
        const poolPath = [...docs.keys()].find((p) => p.includes('guest-pool-'));
        assert.ok(poolPath, '匿名帳號的事件要記進訪客額度池');
        docs.set(poolPath, { ...docs.get(poolPath), total: 1000 });
        const n = writes.length;
        const r = await run({ type: 'session_start' }, anon('visitor-1'));
        assert.equal(r.logged, false);
        assert.equal(writes.length, n, '池子滿了不可以再留底');
    });

    await test('已登入老師與完全沒登入的呼叫不佔用訪客額度池', async () => {
        await run({ type: 'session_start' }, teacher('T4'));
        await run({ type: 'session_start' }, undefined);
        assert.ok(![...docs.keys()].some((p) => p.includes('guest-pool-')));
        assert.ok([...docs.keys()].some((p) => p.startsWith('_usageRateLimits/no-auth_')), '沒登入的呼叫共用 no-auth 這一筆');
    });

    await test('配額檢查失敗（交易被擠爆）：訪客只留底不推播；老師照常推播', async () => {
        txMode = 'abort';
        let guestPush = 0;
        for (let i = 0; i < 30; i++) {
            const r = await run({ type: 'error', message: 'y' + i, url: 'u' }, i % 2 ? undefined : anon('x' + i));
            if (r.pushed) guestPush++;
            assert.equal(r.logged, true);
        }
        assert.equal(guestPush, 0, '舊版這 30 則全部會推播');
        const r = await run({ type: 'error', message: '老師的錯誤', url: 'u' }, teacher('T5'));
        assert.equal(r.pushed, true, '限流機制自己壞掉時，不能吞掉老師的錯誤通報');
    });

    await test('剛好學的四種事件：留底、不即時推播，欄位有裁切與上限', async () => {
        for (const type of ['create', 'feature', 'ai_api', 'class_end']) {
            const r = await run({
                type, app: 'akailao', role: 'teacher', classroom: 'ABC123' + 'x'.repeat(100), feature: 'quiz', label: '隨堂測驗',
                keyType: 'gemini-custom', studentCount: 9999, durationMin: 40.4, secret: '不該留下的欄位',
            }, teacher('AK1'));
            assert.equal(r.ok, true, type + ' 舊版回 unknown-type、不留底');
            assert.equal(r.logged, true);
            assert.equal(r.pushed, false);
        }
        assert.equal(pushed.length, 0);
        const byType = Object.fromEntries(writes.map((w) => [w.data.type, w.data]));
        assert.deepEqual(Object.keys(byType).sort(), ['ai_api', 'class_end', 'create', 'feature']);
        for (const d of Object.values(byType)) {
            assert.equal(d.app, 'akailao');
            assert.equal(d.classroom.length, 40);
            assert.ok(!('secret' in d), '只留白名單欄位');
        }
        assert.equal(byType.feature.label, '隨堂測驗');
        assert.equal(byType.ai_api.keyType, 'gemini-custom');
        assert.equal(byType.class_end.studentCount, 500);
        assert.equal(byType.class_end.durationMin, 40);
    });

    await test('戰報的剛好學區塊會統計開課、下課、AI 使用與課堂功能', async () => {
        const base = { app: 'akailao', uid: 'AK1', day: '2026-11-24' };
        const sum = summarizeEvents([
            { ...base, type: 'create', classroom: 'A1' }, { ...base, type: 'create', classroom: 'B2' },
            { ...base, type: 'class_end', studentCount: 25 }, { ...base, type: 'class_end', studentCount: 28 },
            { ...base, type: 'ai_api', feature: 'gen' }, { ...base, type: 'ai_api', feature: 'gen' }, { ...base, type: 'ai_api', feature: 'gen' },
            { ...base, type: 'feature', feature: 'quiz', label: '隨堂測驗' }, { ...base, type: 'feature', feature: 'quiz', label: '隨堂測驗' },
            { ...base, type: 'feature', feature: 'vote', label: '<b>投票</b>' },
            { ...base, type: 'error', message: '剛好學的錯誤' },
        ]);
        const a = sum.apps.akailao;
        assert.deepEqual([a.creates, a.classEnds, a.classEndStudents, a.aiCalls], [2, 2, 53, 3]);
        assert.deepEqual(a.hotFeatures[0], { label: '隨堂測驗', count: 2 });
        assert.equal(a.errors.length, 1, '錯誤照舊另外計');
        assert.equal(sum.errors.length, 0, '不混進班級小管家的錯誤數');
        const payload = buildDigestPayload('2026-11-24', '11/24', sum, null, undefined);
        const text = JSON.stringify(payload);
        assert.ok(text.includes('開課 2 次'));
        assert.ok(text.includes('下課 2 次（學生共 53 人次）'));
        assert.ok(text.includes('AI 使用 3 次'));
        assert.ok(text.includes('隨堂測驗 2'));
        // 戰報也是經過同一個出口送出，留底內容裡的標籤一樣會被處理
        assert.ok(!/[<>]/.test(JSON.stringify(neutralizeMarkup(payload))));
    });

    await test('沒有課堂活動的日子，剛好學區塊不多出空白行', async () => {
        const sum = summarizeEvents([{ app: 'akailao', uid: 'AK1', type: 'login', role: 'teacher' }]);
        const payload = buildDigestPayload('2026-11-24', '11/24', sum, null, undefined);
        assert.ok(!JSON.stringify(payload).includes('🏫 課堂'));
    });

    await test('ua 不是字串時不會整則失敗（舊版丟 TypeError，推播中斷）', async () => {
        const r = await run({ type: 'error', message: 'z', url: 'u', ua: { a: 1 } }, teacher('T6'));
        assert.equal(r.pushed, true);
    });

    await test('功能統計：裝置代號不能把留底寫到別的路徑，日期不能任意指定', async () => {
        await run({ type: 'feature_summary', date: '2020-01-01', deviceId: 'dev/sub/doc', stats: { 加扣分: 3 } }, teacher('T7'));
        const w = writes.find((x) => x.path.startsWith('_usageEvents/feat_'));
        assert.ok(w, '要有留底');
        assert.equal(w.path.split('/').length, 2);
        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
        assert.equal(w.data.day, today, '離現在太久的日期改記在今天');
        assert.ok(w.path.includes('feat_' + today + '_T7_dev_sub_doc'));

        writes.length = 0;
        const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
        await run({ type: 'feature_summary', date: yesterday, deviceId: 'mabc123', stats: { 加扣分: 1 } }, teacher('T7'));
        assert.equal(writes[0].data.day, yesterday, '昨天的累計值晚一點送到，仍記在昨天');
        assert.ok(writes[0].path.endsWith('_T7_mabc123'), '正常的裝置代號不變，同一台同一天仍是同一筆');

        writes.length = 0;
        await run({ type: 'feature_summary', date: '不是日期', deviceId: 'mabc123', stats: {} }, teacher('T7'));
        assert.equal(writes[0].data.day, today);
    });

    await test('既有行為不變：不認得的型別照舊不留底；登入等日常事件只留底不推播', async () => {
        const r1 = await run({ type: 'whatever' }, teacher('T8'));
        assert.deepEqual(r1, { ok: false, reason: 'unknown-type' });
        const r2 = await run({ type: 'login' }, teacher('T8'));
        assert.equal(r2.logged, true);
        assert.equal(r2.pushed, false);
        assert.equal(pushed.length, 0);
    });

    await test('chat-safe：只動字串內容，數字、布林、鍵名與結構不變', async () => {
        const input = { text: 'a<b>c', n: 3, ok: true, list: ['<x>', { 'k<': 'v>' }], nil: null };
        assert.deepEqual(neutralizeMarkup(input), { text: 'a＜b＞c', n: 3, ok: true, list: ['＜x＞', { 'k<': 'v＞' }], nil: null });
        assert.equal(defangLinks({ t: 'see https://a.b/c and http://d' }).t, 'see https：//a.b/c and http：//d');
        assert.equal(input.text, 'a<b>c', '不改動傳入的物件');
    });

    await test('檔頭的部署說明不再教人跑會刪掉剛好學函式的指令', async () => {
        const src = fs.readFileSync(path.join(FN_DIR, 'index.js'), 'utf8').slice(0, 2500);
        assert.ok(!/firebase deploy --only functions --project/.test(src), '不可以出現不點名函式的部署指令');
        assert.ok(src.includes('--only functions:notifyUsage,functions:dailyUsageDigest'));
        assert.ok(src.includes('--account cagooo@gmail.com'));
    });

    console.log(passed + ' notify-abuse checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
