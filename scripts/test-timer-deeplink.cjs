// 網址 #timer=分鐘：研習簡報按鈕開新分頁直接預設好倒數時間（v3.75.0）
// 只設定時間、不自動開始；超出 1～59 分鐘就只打開計時器頁，維持預設 5 分鐘。
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const SRC = fs.readFileSync('classnew.html', 'utf8');

function grabFunction(signature) {
    const start = SRC.indexOf(signature);
    assert.ok(start >= 0, '找不到 ' + signature);
    let depth = 0, i = SRC.indexOf('{', start);
    for (; i < SRC.length; i++) {
        if (SRC[i] === '{') depth++;
        else if (SRC[i] === '}' && --depth === 0) break;
    }
    return SRC.slice(start, i + 1);
}

const ctx = {};
vm.createContext(ctx);
vm.runInContext(grabFunction('function parseDeepLinkHash(raw)'), ctx);
const parse = (h) => JSON.parse(JSON.stringify(vm.runInContext('parseDeepLinkHash(' + JSON.stringify(h) + ')', ctx)));

let passed = 0;
function test(name, fn) { fn(); console.log('PASS', name); passed++; }

test('#timer=15 → 計時器、15 分鐘', () => assert.deepEqual(parse('#timer=15'), { section: 'timer', timerSeconds: 900 }));
test('#timer=10 → 10 分鐘', () => assert.deepEqual(parse('#timer=10'), { section: 'timer', timerSeconds: 600 }));
test('沒有 # 也能解析', () => assert.deepEqual(parse('timer=5'), { section: 'timer', timerSeconds: 300 }));
test('#timer 維持原本行為', () => assert.deepEqual(parse('#timer'), { section: 'timer', timerSeconds: 0 }));
test('其他區塊不受影響', () => assert.deepEqual(parse('#exam'), { section: 'exam', timerSeconds: 0 }));
test('空網址', () => assert.deepEqual(parse(''), { section: '', timerSeconds: 0 }));
test('0 分鐘 → 只開計時器', () => assert.deepEqual(parse('#timer=0'), { section: 'timer', timerSeconds: 0 }));
test('60 分鐘超出輸入欄上限 → 只開計時器', () => assert.deepEqual(parse('#timer=60'), { section: 'timer', timerSeconds: 0 }));
test('三位數、負數、小數、文字都不算', () => {
    for (const h of ['#timer=120', '#timer=-5', '#timer=1.5', '#timer=abc', '#timer=15&x=1']) {
        assert.equal(parse(h).timerSeconds, 0, h);
    }
});
test('套用時機在計時器重設之後', () => {
    const a = SRC.indexOf("setTimerMode('countdown');\n            updateTimerDisplay();\n            // 網址帶了分鐘數");
    const b = SRC.indexOf('if (_deepLink.timerSeconds) setQuickTimer(_deepLink.timerSeconds);');
    assert.ok(a > 0 && b > a, '要在 setTimerMode(countdown) 之後才套用');
});
test('hashchange 正在倒數時不打斷', () => {
    assert.ok(SRC.includes('if (d.timerSeconds && !timerRunning) setQuickTimer(d.timerSeconds);'));
});
console.log(`\n${passed} 項全部通過`);
