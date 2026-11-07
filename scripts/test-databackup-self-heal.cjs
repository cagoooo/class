// js/data-backup.js 沒載入成功時：先用備援（今天日期），再背景補載一次；有載入就完全不動。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('classnew.html', 'utf8');
const s = html.indexOf('// <!-- DATABACKUP-SELF-HEAL:START -->');
const e = html.indexOf('// <!-- DATABACKUP-SELF-HEAL:END -->');
assert.ok(s > 0 && e > s, '找不到 DataBackup 自癒區塊');
assert.ok(s > html.indexOf('js/data-backup.js?v='), '自癒區塊必須在 data-backup.js 之後');
const code = html.slice(s, e);

function run(existing) {
    const appended = [];
    const ctx = {
        console: { warn() {} },
        APP_VERSION: 'v9.9.9',
        Date,
        document: { createElement: () => ({}), head: { appendChild: el => appended.push(el) } },
    };
    if (existing) ctx.DataBackup = existing;
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    return { ctx, appended };
}

const real = { getDateString: () => 'real' };
let r = run(real);
assert.equal(r.ctx.DataBackup, real, '已載入時不得覆蓋');
assert.equal(r.appended.length, 0, '已載入時不得補載');

r = run(null);
assert.equal(r.ctx.DataBackup.__fallback, true);
assert.match(r.ctx.DataBackup.getDateString(), /^\d{4}-\d{2}-\d{2}$/);
assert.equal(r.appended.length, 1, '沒載入時要補載一次');
assert.match(r.appended[0].src, /^js\/data-backup\.js\?v=v9\.9\.9&retry=\d+$/);
console.log('PASS data-backup.js 沒載入時改用備援並補載，有載入時不動');
