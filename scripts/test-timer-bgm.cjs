// 計時背景音樂（v3.68.0）：網址解析，以及跟著計時器開始／停止／倒數淡出／時間到停止
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');

function makeEnv(saved) {
    const store = new Map(saved ? [['timerBgmSettings', JSON.stringify(saved)]] : []);
    const listeners = {}, intervals = [];
    class El {
        constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.classList = new Set(); this.classList.contains = c => this.classList.has(c); this.classList.toggle = (c, on) => { (on ?? !this.classList.has(c)) ? this.classList.add(c) : this.classList.delete(c); }; this.listeners = {}; this.style = {}; this.hidden = false; this.value = ''; this.textContent = ''; }
        set innerHTML(html) { this._html = html; for (const m of html.matchAll(/id="([^"]+)"/g)) { const e = new El('x'); e.id = m[1]; byId.set(m[1], e); } }
        get innerHTML() { return this._html || ''; }
        querySelector(sel) { return byId.get(sel.replace('#', '')) || null; }
        querySelectorAll() { return []; }
        addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
        insertAdjacentElement(_, el) { if (el.id) byId.set(el.id, el); return el; }
        append(...c) { this.children.push(...c); }
        replaceChildren(...c) { this.children = c; }
        appendChild(c) { this.children.push(c); return c; }
        setAttribute(k, v) { this.attrs[k] = v; }
        toggleAttribute(k, on) { this.hidden = !!on; }
        get parentElement() { return byId.get('timerDisplayBox'); }
    }
    const byId = new Map();
    for (const id of ['countdownQuickTimers', 'timerProgress', 'timerDisplayBox', 'timer-section', 'timerFullscreenModal']) { const e = new El('div'); e.id = id; byId.set(id, e); }
    byId.get('timer-section').classList.add('hidden');
    let timer = { running: false, mode: 'countdown', total: 300, original: 300 };
    const calls = [];
    class FakePlayer {
        constructor(target, opts) { this.opts = opts; this.volume = null; calls.push(['create', opts.videoId, opts.playerVars.list]); setTimeout(() => opts.events.onReady(), 0); }
        setVolume(v) { this.volume = v; calls.push(['volume', v]); }
        playVideo() { calls.push(['play']); this.opts.events.onStateChange({ data: 1 }); }
        pauseVideo() { calls.push(['pause']); this.opts.events.onStateChange({ data: 2 }); }
        seekTo() {} destroy() { calls.push(['destroy']); }
        getVideoData() { return { title: '測試音樂' }; }
    }
    const ctx = {
        console, setTimeout, clearTimeout, URL, JSON, Math, Number, Promise,
        localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
        location: { origin: 'https://example.test' },
        document: {
            readyState: 'complete', head: new El('head'),
            getElementById: id => byId.get(id) || null,
            createElement: tag => new El(tag),
            addEventListener() {}
        },
        MutationObserver: class { observe() {} },
        addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
        setInterval: fn => { intervals.push(fn); return 1; },
        getTimerState: () => ({ ...timer }),
        YT: { Player: FakePlayer, PlayerState: { PLAYING: 1, PAUSED: 2, BUFFERING: 3, ENDED: 0 } }
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync('js/timer-bgm.js', 'utf8'), ctx);
    return {
        ctx, store, calls, byId,
        tick: () => intervals.forEach(f => f()),
        setTimer: t => { timer = { ...timer, ...t }; },
        fire: t => (listeners[t] || []).forEach(f => f()),
        settle: () => new Promise(r => setTimeout(r, 5))
    };
}

let passed = 0;
async function test(name, fn) { await fn(); console.log('PASS', name); passed++; }

(async () => {
    await test('看得懂各種 YouTube 網址，看不懂的一律拒絕', async () => {
        const { parseYouTube: p } = makeEnv().ctx.TimerBgm;
        assert.deepEqual({ ...p('https://www.youtube.com/watch?v=dQw4w9WgXcQ') }, { videoId: 'dQw4w9WgXcQ', list: null });
        assert.equal(p('https://youtu.be/dQw4w9WgXcQ?si=abc').videoId, 'dQw4w9WgXcQ');
        assert.equal(p('youtube.com/shorts/dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
        assert.equal(p('https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30').videoId, 'dQw4w9WgXcQ');
        assert.equal(p('https://music.youtube.com/watch?v=dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
        assert.equal(p('https://www.youtube.com/live/dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
        assert.equal(p('https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG').list, 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG');
        const both = p('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG');
        assert.equal(both.videoId, 'dQw4w9WgXcQ'); assert.equal(both.list, 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG');
        for (const bad of ['', 'hello', 'https://evil.example/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=<script>', 'javascript:alert(1)', 'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ'])
            assert.equal(p(bad), null, bad);
    });

    await test('按開始播放、停止暫停，倒數最後 5 秒變小聲，時間到停止並恢復音量', async () => {
        const env = makeEnv({ url: 'https://youtu.be/dQw4w9WgXcQ', enabled: true, volume: 60 });
        env.setTimer({ running: true, total: 300 }); env.tick(); await env.settle(); env.tick();
        assert.ok(env.calls.some(c => c[0] === 'create' && c[1] === 'dQw4w9WgXcQ'));
        assert.ok(env.calls.some(c => c[0] === 'play'));
        env.calls.length = 0;
        env.setTimer({ total: 4 }); env.tick();
        assert.deepEqual(env.calls.filter(c => c[0] === 'volume').at(-1), ['volume', 48]);   // 60 × 4/5
        env.setTimer({ total: 1 }); env.tick();
        assert.deepEqual(env.calls.filter(c => c[0] === 'volume').at(-1), ['volume', 12]);
        env.calls.length = 0;
        env.setTimer({ running: false, total: 300 }); env.fire('timer:finished'); env.tick();
        assert.ok(env.calls.some(c => c[0] === 'pause'));
        assert.deepEqual(env.calls.filter(c => c[0] === 'volume').at(-1), ['volume', 60]);
        env.calls.length = 0;
        env.setTimer({ running: true }); env.tick();
        assert.ok(env.calls.some(c => c[0] === 'play'));
        env.setTimer({ running: false }); env.tick();
        assert.ok(env.calls.some(c => c[0] === 'pause'));
    });

    await test('關閉自動播放或沒設定網址：計時完全不碰音樂、也不載入播放器', async () => {
        const off = makeEnv({ url: 'https://youtu.be/dQw4w9WgXcQ', enabled: false, volume: 60 });
        off.setTimer({ running: true }); off.tick(); await off.settle();
        assert.equal(off.calls.filter(c => c[0] === 'play').length, 0);
        const none = makeEnv();
        none.setTimer({ running: true }); none.tick(); await none.settle();
        assert.equal(none.calls.length, 0);
    });

    await test('正數計時也一樣跟著播放與暫停（不做淡出）', async () => {
        const env = makeEnv({ url: 'https://youtu.be/dQw4w9WgXcQ', enabled: true, volume: 50 });
        env.setTimer({ running: true, mode: 'stopwatch', total: 3 }); env.tick(); await env.settle(); env.tick();
        assert.ok(env.calls.some(c => c[0] === 'play'));
        assert.equal(env.calls.filter(c => c[0] === 'volume' && c[1] < 50).length, 0);
    });

    // timer:finished 的處理：pause → 還原音量 → setTimeout(0) 後若「自動播放開著、有網址、計時又在跑」就 play()
    // 舊版：只有 pause，之後靠每半秒的檢查看「停了又開始」；番茄鐘在 timer:finished 的同一瞬間就開始下一段，
    //       running 一直是 true、檢查看不到變化，音樂從此不再自己播（指令序列只有 play → pause）。
    await test('番茄鐘：timer:finished 的同一瞬間就開始下一段（running 一直是 true）→ 事件後音樂接著播', async () => {
        const env = makeEnv({ url: 'https://youtu.be/dQw4w9WgXcQ', enabled: true, volume: 60 });
        env.setTimer({ running: true, total: 300 }); env.tick(); await env.settle(); env.tick();
        assert.ok(env.calls.some(c => c[0] === 'play'), '先確認專注階段有在播');
        env.calls.length = 0;
        env.setTimer({ total: 1500 });            // 下一段已經開始，計時器從頭到尾都在跑
        env.fire('timer:finished');
        assert.deepEqual(env.calls.map(c => c[0]), ['pause', 'volume'], '事件當下先暫停並還原音量');
        assert.deepEqual(env.calls.at(-1), ['volume', 60]);
        await env.settle();                       // 執行 setTimeout(0) 的 callback
        assert.equal(env.calls.at(-1)[0], 'play', '舊版這裡沒有 play，音樂就此停住');
        assert.equal(env.calls.filter(c => c[0] === 'play').length, 1);
        env.tick();                               // 之後每半秒的檢查不會重複下指令
        assert.equal(env.calls.filter(c => c[0] === 'play').length, 1);
    });

    await test('一般倒數結束（running=false）：timer:finished 後音樂維持暫停，不再 play', async () => {
        const env = makeEnv({ url: 'https://youtu.be/dQw4w9WgXcQ', enabled: true, volume: 60 });
        env.setTimer({ running: true, total: 300 }); env.tick(); await env.settle(); env.tick();
        env.calls.length = 0;
        env.setTimer({ running: false, total: 300 });
        env.fire('timer:finished');
        await env.settle();
        assert.ok(env.calls.some(c => c[0] === 'pause'));
        assert.equal(env.calls.filter(c => c[0] === 'play').length, 0);
        env.tick();
        assert.equal(env.calls.filter(c => c[0] === 'play').length, 0);
    });

    await test('關閉自動播放或沒設定網址：timer:finished 即使計時又在跑也不硬播、不載入播放器', async () => {
        const off = makeEnv({ url: 'https://youtu.be/dQw4w9WgXcQ', enabled: false, volume: 60 });
        off.setTimer({ running: true }); off.fire('timer:finished'); await off.settle();
        assert.equal(off.calls.filter(c => c[0] === 'play').length, 0);
        const none = makeEnv();
        none.setTimer({ running: true }); none.fire('timer:finished'); await none.settle();
        assert.equal(none.calls.length, 0);
    });

    console.log(`${passed} timer bgm checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
