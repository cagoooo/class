// 安靜挑戰純邏輯測試：音量換算、太吵判定、計時狀態機
const assert = require('node:assert/strict');
const qc = require('../js/quiet-challenge.js');

// 音量換算：靜音 0、滿幅接近 100，且單調遞增
const tone = amp => Float32Array.from({ length: 1024 }, (_, i) => amp * Math.sin(i / 5));
assert.equal(qc.levelFromSamples(new Float32Array(1024)), 0, '完全無聲應為 0');
assert.ok(qc.levelFromSamples(tone(1)) > 90, '滿幅聲音應接近 100');
assert.ok(qc.levelFromSamples(tone(0.01)) < qc.levelFromSamples(tone(0.1)), '大聲的音量要比小聲高');

// 一聲短促的咳嗽（< 300ms）不算太吵；持續吵才算；回到安靜要 700ms 才解除
let st = { loud: false, aboveMs: 0, belowMs: 0 };
for (let t = 0; t < 250; t += 50) st = qc.loudStep(st, 80, 45, 50);
assert.equal(st.loud, false, '短暫聲響不算太吵');
st = qc.loudStep(st, 30, 45, 50);
for (let t = 0; t < 350; t += 50) st = qc.loudStep(st, 80, 45, 50);
assert.equal(st.loud, true, '持續超過界線算太吵');
for (let t = 0; t < 600; t += 50) st = qc.loudStep(st, 30, 45, 50);
assert.equal(st.loud, true, '剛安靜下來還不解除（遲滯）');
for (let t = 0; t < 200; t += 50) st = qc.loudStep(st, 30, 45, 50);
assert.equal(st.loud, false, '安靜夠久就解除');

// 暫停模式：太吵不計時、吵醒次數只在轉為太吵時加一
let c = qc.createChallenge(10000, 'pause');
c.update(4000, false);
c.update(1000, true);
c.update(1000, true);
assert.equal(c.elapsed, 4000, '太吵期間不計時');
assert.equal(c.noiseCount, 1, '連續太吵只算一次');
c.update(5999, false);
assert.equal(c.state, 'running');
assert.equal(c.bestStreak, 5999, '記錄最長連續安靜');
c.update(10, false);
assert.equal(c.state, 'done', '累積安靜達標即成功');
assert.equal(c.remaining(), 0);
c.update(1000, true);
assert.equal(c.noiseCount, 1, '成功後不再變動');

// 嚴格模式：一吵就歸零
c = qc.createChallenge(10000, 'reset');
c.update(8000, false);
c.update(100, true);
assert.equal(c.elapsed, 0, '嚴格模式太吵從頭開始');
c.update(500, false);
c.update(100, true);
assert.equal(c.noiseCount, 2);

// 心情與時間格式
assert.equal(qc.moodOf(10, 45, false), 'sleep');
assert.equal(qc.moodOf(30, 45, false), 'calm');
assert.equal(qc.moodOf(40, 45, false), 'warn');
assert.equal(qc.moodOf(10, 45, true), 'loud', '判定太吵優先');
assert.equal(qc.fmtTime(180000), '03:00');
assert.equal(qc.fmtTime(59001), '01:00', '不足一秒進位顯示');

console.log('✅ 安靜挑戰邏輯測試全部通過');
