// 安靜挑戰純邏輯測試：音量換算、太吵判定、計時狀態機
const assert = require('node:assert/strict');
const qc = require('../js/quiet-challenge.js');

// 音量換算：dBFS 單調遞增；校正後平常的聲音落在 25、界線 50 約比平常大 12.5 分貝
const tone = amp => Float32Array.from({ length: 1024 }, (_, i) => amp * Math.sin(i / 5));
assert.ok(qc.dbFromSamples(new Float32Array(1024)) < -150, '完全無聲應極小');
assert.ok(qc.dbFromSamples(tone(0.01)) < qc.dbFromSamples(tone(0.1)), '大聲的分貝要比小聲高');
assert.equal(qc.levelFromDb(-60, -60), 0);
assert.equal(qc.levelFromDb(0, -60), 100, '超過範圍封頂 100');
// 老師的麥克風很靈敏：安靜教室就有 -22 dBFS，舊算法約 80，要拉界線到近 90
const hotQuiet = Array.from({ length: 60 }, () => -22);
hotQuiet[10] = -3; hotQuiet[11] = -4;   // 校正時有人咳了一下
const floor = qc.floorFromDbs(hotQuiet);
assert.ok(Math.abs(qc.levelFromDb(-22, floor) - qc.BASE_LEVEL) < 3, '校正後平常的聲音約 25（咳嗽不影響中位數）');
assert.ok(qc.levelFromDb(-22 + 12, floor) >= qc.DEFAULT_TH - 1, '比平常大 12 分貝左右才到界線');
assert.ok(qc.levelFromDb(-22 + 4, floor) < qc.DEFAULT_TH, '小小聲講話不會過界線');
assert.equal(qc.floorFromDbs([-160, -160, -160]), qc.DEFAULT_FLOOR, '只有空白資料時用預設值');
assert.equal(qc.floorFromDbs([-160, -160, -160, -160, -22, -22, -22]), -22 - 12.5, '麥克風剛啟動的空白資料不算進中位數');
assert.equal(qc.floorFromDbs([-130, -130, -130]), -95, '極安靜時下限保護');
assert.equal(qc.floorFromDbs([]), qc.DEFAULT_FLOOR, '沒有取樣用預設值');

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

// 心情：熟睡 → 打瞌睡 → 清醒 → 警覺 → 太吵 → 超級吵
assert.equal(qc.moodOf(20, 50, false), 'sleep');
assert.equal(qc.moodOf(30, 50, false), 'doze');
assert.equal(qc.moodOf(38, 50, false), 'calm');
assert.equal(qc.moodOf(45, 50, false), 'warn');
assert.equal(qc.moodOf(20, 50, true), 'loud', '判定太吵優先');
assert.equal(qc.moodOf(75, 50, true), 'storm', '超過界線很多是超級吵');
assert.equal(qc.moodOf(97, 90, true), 'loud', '界線很高時超級吵要到 98 以上');
assert.equal(qc.fmtTime(180000), '03:00');
assert.equal(qc.fmtTime(59001), '01:00', '不足一秒進位顯示');

console.log('✅ 安靜挑戰邏輯測試全部通過');
