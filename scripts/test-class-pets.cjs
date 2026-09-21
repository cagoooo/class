// 無網路、無正式資料的回歸驗收；執行實際的 ClassAwareStorage / SafeStorage / ClassPets。
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { webcrypto } = require('node:crypto');
let passed = 0;
function setup(classId = 'default') {
    class Storage {
        constructor() { this.data = new Map(); this.failKey = null; }
        getItem(k) { return this.data.has(k) ? this.data.get(k) : null; }
        setItem(k, v) { if (this.failKey === k) { this.failKey = null; throw new Error('injected write failure'); } this.data.set(k, String(v)); }
        removeItem(k) { this.data.delete(k); }
        key(i) { return [...this.data.keys()][i] ?? null; }
        get length() { return this.data.size; }
    }
    const storage = new Storage();
    storage.setItem('currentClassId', classId);
    const ctx = { Storage, localStorage: storage, sessionStorage: new Storage(), console: { log(){},warn(){},error(){} },
        navigator: {}, crypto: webcrypto, alert(){}, document: { readyState:'loading', addEventListener(){}, getElementById(){return null;} },
        addEventListener(){}, setTimeout, clearTimeout };
    ctx.window = ctx; vm.createContext(ctx);
    vm.runInContext(fs.readFileSync('js/class-aware-storage.js','utf8'),ctx);
    const suffix = classId === 'default' ? '' : '-' + classId;
    ctx.STUDENTS_KEY = 'students' + suffix; ctx.GROUPS_KEY = 'groups' + suffix; ctx.POINTS_HISTORY_KEY = 'pointsHistory' + suffix;
    ctx.students = [{id:1,name:'甲',points:5},{id:2,name:'乙',points:0}];
    ctx.groups = [{id:7,name:'第一組',score:5,members:ctx.students.map(s=>({...s}))}];
    ctx.pointsHistory = [{id:1,studentId:1,points:5}];
    const persist = () => { ['students','groups','pointsHistory'].forEach((k,i)=>storage.setItem([ctx.STUDENTS_KEY,ctx.GROUPS_KEY,ctx.POINTS_HISTORY_KEY][i],JSON.stringify(ctx[k]))); };
    persist(); storage.setItem('petSettings',JSON.stringify({enabled:true,rules:[]}));
    vm.runInContext(fs.readFileSync('js/class-pets.js','utf8'),ctx); ctx.ClassPets.prepare();
    return {ctx,storage,persist,pet:ctx.ClassPets};
}
async function test(name,fn){await fn();passed++;console.log('PASS',name);}
(async()=>{
    await test('舊分数不變成成長值；正向獎勵孵化及升級',async()=>{
        const {pet,ctx}=setup(); assert.equal(pet.xpFor(1),0);
        assert.equal(await pet.award([1],10,'完成約定'),true); assert.equal(ctx.students[0].points,15); assert.equal(pet.xpFor(1),10); assert.equal(pet.stage(10).level,1);
        await pet.award([1],20,'再接再厲'); assert.equal(pet.stage(pet.xpFor(1)).level,2);
    });
    await test('扣分不退化，暫停時不新增成長',async()=>{
        const {pet,storage}=setup(); await pet.award([1],10,'努力'); await pet.award([1],-3,'提醒'); assert.equal(pet.xpFor(1),10);
        storage.setItem('petSettings',JSON.stringify({enabled:false,rules:[]})); pet.prepare(); await pet.award([1],5,'加分'); assert.equal(pet.xpFor(1),10);
    });
    await test('多人批次、重複學生及同一批重送不重複計分',async()=>{
        const {pet,ctx}=setup(); await pet.award([1,1,2],3,'合作',4,'batch-1');
        assert.equal(ctx.students[0].points,8); assert.equal(ctx.students[1].points,3); assert.equal(ctx.groups[0].score,11); assert.equal(pet.xpFor(2),4);
        assert.equal(await pet.award([1,2],3,'合作',4,'batch-1'),false); assert.equal(ctx.pointsHistory.length,3);
        assert.equal(new Set(ctx.pointsHistory.map(r=>r.id)).size,3);
    });
    await test('單筆及整批撤銷可追溯，重複撤銷被擋',async()=>{
        const {pet,ctx}=setup(); await pet.award([1,2],3,'合作',4,'batch-2'); const ids=ctx.pointsHistory.filter(r=>r.petEvent).map(r=>r.id);
        assert.equal(await pet.undo(ids),true); assert.equal(ctx.students[0].points,5); assert.equal(ctx.students[1].points,0); assert.equal(ctx.groups[0].score,5); assert.equal(pet.xpFor(1),0);
        assert.equal(ctx.pointsHistory.filter(r=>r.petReverses).length,2); assert.equal(await pet.undo(ids),false);
    });
    await test('分數歸零保留成長，撤銷歸零前獎勵不造成負分',async()=>{
        const {pet,ctx,persist}=setup(); await pet.award([1],10,'努力'); const id=ctx.pointsHistory[0].id;
        ctx.pointsHistory.unshift({id:Date.now()+1,type:'reset'}); ctx.students.forEach(s=>s.points=0); ctx.groups[0].score=0; persist(); pet.prepare();
        assert.equal(pet.xpFor(1),10); await pet.undo([id]); assert.equal(ctx.students[0].points,0); assert.equal(ctx.groups[0].score,0); assert.equal(pet.xpFor(1),0);
    });
    for(const key of ['students','groups','pointsHistory']) await test('寫入 '+key+' 失敗，三份資料與成長完整回復',async()=>{
        const {pet,ctx,storage}=setup(); const before=JSON.stringify([ctx.students,ctx.groups,ctx.pointsHistory]); const disk=[...storage.data]; storage.failKey=key;
        assert.equal(await pet.award([1,2],4,'合作'),false); assert.equal(JSON.stringify([ctx.students,ctx.groups,ctx.pointsHistory]),before); assert.deepEqual([...storage.data],disk); assert.equal(pet.xpFor(1),0);
    });
    await test('其他分頁修改與切班時阻止覆蓋',async()=>{
        const {pet,ctx,storage}=setup(); storage.setItem('students','[]'); pet.prepare(); assert.equal(await pet.award([1],2,'努力'),false); assert.equal(ctx.students[0].points,5);
        const b=setup(); b.storage.setItem('currentClassId','B'); b.pet.prepare(); assert.equal(await b.pet.award([1],2,'努力'),false);
    });
    await test('非預設班設定及獎勵使用獨立鍵，備份名單包含設定',async()=>{
        const {pet,storage,ctx}=setup('B'); await pet.award([1],2,'努力'); assert.equal(storage.getItem('students'),null); assert.equal(JSON.parse(storage.getItem('students-B'))[0].points,7);
        assert.ok(storage.data.has('petSettings-B')); assert.equal(storage.data.has('petSettings'),false); assert.ok(ctx.ClassAwareStorage.SHARED_KEYS.includes('petSettings'));
    });
    await test('無效數值與不存在學生不寫入',async()=>{
        const {pet,ctx}=setup(); for (const p of [0,NaN,Infinity,1.5,1001]) assert.equal(await pet.award([1],p,'測試'),false);
        assert.equal(await pet.award([999],2,'測試'),false); assert.equal(await pet.award([1],2,'測試',-1),false); assert.equal(ctx.pointsHistory.length,1);
    });
    await test('重載後成長可由儲存帳本重建，重複事件不重算',async()=>{
        const {pet,ctx,storage}=setup(); await pet.award([1],10,'努力'); const history=JSON.parse(storage.getItem('pointsHistory')); assert.equal(pet.xpFor(1,[...history,...history]),10);
        ctx.pointsHistory=history; assert.equal(pet.stage(pet.xpFor(1)).level,1);
    });
    await test('學期封存後的期初成長與新獎勵合併，撤銷不扣掉期初值',async()=>{
        const {pet,ctx,persist}=setup(); ctx.students[0].petCarryXp=30; persist(); pet.prepare();
        await pet.award([1],10,'努力'); assert.equal(pet.xpFor(1),40); await pet.undo([ctx.pointsHistory[0].id]); assert.equal(pet.xpFor(1),30);
    });
    console.log(`${passed} checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1;});
