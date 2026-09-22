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
    ctx.petEvents = []; ctx.petErrors = [];
    ctx.UsageNotify = {
        pet(event, details) { ctx.petEvents.push({ event, details }); },
        petError(message, operation, details) { ctx.petErrors.push({ message, operation, details }); }
    };
    ctx.ErrorHandler = { handle(error, type, context, options) { ctx.petErrors.push({ message: error.message, type, context, options }); } };
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
    await test('寵物獎勵、孵化與升級會留下 webhook 事件摘要',async()=>{
        const {pet,ctx}=setup();
        await pet.award([1],10,'完成約定');
        await pet.award([1],20,'再接再厲');
        assert.deepEqual(ctx.petEvents.map(e=>e.event),['reward','hatch','reward','level_up']);
        assert.equal(ctx.petEvents[1].details.count,1);
        assert.equal(ctx.petEvents[3].details.level,2);
        assert.equal(ctx.petEvents.some(e=>e.details.studentName),false);
    });
    await test('寵物設定儲存失敗會標記 pet 功能錯誤',async()=>{
        const {pet,ctx,storage}=setup(); storage.failKey='petSettings';
        assert.equal(await pet.setCoinsEnabled(true),false);
        assert.ok(ctx.petErrors.some(e=>e.options?.feature==='pet' && e.options?.petAction==='settings'));
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
    await test('造型依既有等級分段，門檻前後不改變分數與成長算法',async()=>{
        const {pet}=setup(); for(const [xp,id] of [[0,'egg'],[9,'egg'],[10,'baby'],[49,'baby'],[50,'junior'],[89,'junior'],[90,'grown'],[1000,'grown']]) assert.equal(pet.appearance(xp).id,id);
    });
    await test('跨多級只產生一次里程碑，扣分、撤銷與同級不觸發',async()=>{
        const {pet}=setup();assert.equal(pet.milestone(9,10).type,'hatch');assert.equal(pet.milestone(0,90).level,5);assert.equal(pet.milestone(10,90).type,'level');for(const pair of [[10,11],[30,10],[0,0]])assert.equal(pet.milestone(...pair),null);
    });
    await test('金幣需先啟用，不追溯舊分數或成長事件',async()=>{
        const {pet,ctx}=setup(); await pet.award([1],10,'舊獎勵'); assert.equal(pet.coinsFor(1),0);
        assert.equal(await pet.setCoinsEnabled(true),true); assert.equal(pet.coinsFor(1),0);
        await pet.award([1],3,'新獎勵'); assert.equal(pet.coinsFor(1),3); assert.equal(pet.xpFor(1),13); assert.equal(ctx.students[0].points,18);
    });
    await test('規則可分別設定三種數值，修改不重算舊紀錄',async()=>{
        const {pet,ctx}=setup();await pet.setCoinsEnabled(true);
        assert.equal(await pet.saveRule({name:'合作',points:2,xp:5,coins:7}),true); const rule=pet.settings().rules[0];
        await pet.award([1],rule.points,rule.name,rule.xp,'rule-batch',rule.coins); const original=JSON.stringify(ctx.pointsHistory);
        assert.equal(await pet.saveRule({name:'合作新版',points:3,xp:0,coins:1},rule.id),true);
        assert.equal(pet.settings().rules.length,1);assert.equal(JSON.stringify(ctx.pointsHistory),original);assert.equal(pet.coinsFor(1),7);assert.equal(pet.xpFor(1),5);
        await pet.undo([ctx.pointsHistory[0].id]);assert.equal(pet.coinsFor(1),0);assert.equal(pet.xpFor(1),0);assert.equal(ctx.students[0].points,5);
    });
    await test('金幣與成長可分別暫停，重新啟用不補發',async()=>{
        const {pet,storage}=setup();await pet.setCoinsEnabled(true);await pet.award([1],2,'努力');await pet.setCoinsEnabled(false);await pet.award([1],4,'努力');assert.equal(pet.coinsFor(1),2);assert.equal(pet.xpFor(1),6);
        await pet.setCoinsEnabled(true);storage.setItem('petSettings',JSON.stringify({...pet.settings(),enabled:false}));pet.prepare();await pet.award([1],3,'努力');assert.equal(pet.coinsFor(1),5);assert.equal(pet.xpFor(1),6);
    });
    await test('批次金幣防重送，歸零後撤銷只回沖該筆金幣',async()=>{
        const {pet,ctx,persist}=setup();await pet.setCoinsEnabled(true);await pet.award([1,1,2],2,'合作',5,'coins-batch',7);
        assert.equal(await pet.award([1,2],2,'合作',5,'coins-batch',7),false);assert.equal(pet.coinsFor(2),7);
        const ids=ctx.pointsHistory.filter(r=>r.petEvent).map(r=>r.id);ctx.pointsHistory.unshift({id:Date.now()+1,type:'reset'});ctx.students.forEach(s=>s.points=0);ctx.groups[0].score=0;persist();pet.prepare();
        assert.equal(pet.coinsFor(1),7);await pet.undo(ids);assert.equal(pet.coinsFor(1),0);assert.equal(ctx.students[0].points,0);assert.equal(await pet.undo(ids),false);
    });
    for(const key of ['students','groups','pointsHistory']) await test('金幣發放 '+key+' 寫入失敗不留半筆獎勵',async()=>{
        const {pet,ctx,storage}=setup();await pet.setCoinsEnabled(true);const before=JSON.stringify([ctx.students,ctx.groups,ctx.pointsHistory]);const disk=[...storage.data];storage.failKey=key;
        assert.equal(await pet.award([1],2,'合作',3,undefined,8),false);assert.equal(pet.coinsFor(1),0);assert.equal(JSON.stringify([ctx.students,ctx.groups,ctx.pointsHistory]),before);assert.deepEqual([...storage.data],disk);
    });
    await test('金幣設定存檔失敗與非法規則不覆蓋原設定',async()=>{
        const {pet,storage}=setup();const before=storage.getItem('petSettings');storage.failKey='petSettings';assert.equal(await pet.setCoinsEnabled(true),false);assert.equal(storage.getItem('petSettings'),before);
        for(const coins of [-1,1.5,1001,NaN])assert.equal(await pet.saveRule({name:'測試',points:2,xp:2,coins}),false);
        assert.equal(await pet.saveRule({name:'扣分',points:-1,xp:0,coins:1}),false);assert.equal(storage.getItem('petSettings'),before);
    });
    await test('金幣備份重建去重、班級隔離與期初餘額',async()=>{
        const {pet,ctx,persist,storage}=setup('B');ctx.students[0].petCarryCoins=12;persist();pet.prepare();await pet.setCoinsEnabled(true);await pet.award([1],2,'努力',3,'carry',5);
        const history=JSON.parse(storage.getItem(ctx.POINTS_HISTORY_KEY));assert.equal(pet.coinsFor(1,[...history,...history]),17);assert.equal(storage.data.has('petSettings'),false);
        await pet.undo([ctx.pointsHistory[0].id]);assert.equal(pet.coinsFor(1),12);assert.equal(pet.xpFor(1),0);
    });
    await test('商店只扣金幣，退回成交價一次，商品改價下架不改舊帳',async()=>{
        const {pet,ctx}=setup(); await pet.setCoinsEnabled(true);await pet.award([1],20,'努力');
        await pet.saveProduct({name:'優先選座位',cost:7});const product=pet.settings().products[0];
        assert.equal(await pet.redeem(1,product.id,7,'shop-1'),true);const id=ctx.pointsHistory[0].id;
        assert.equal(pet.coinsFor(1),13);assert.equal(pet.xpFor(1),20);assert.equal(ctx.students[0].points,25);
        assert.equal(await pet.redeem(1,product.id,7,'shop-1'),false);
        await pet.saveProduct({name:'改名商品',cost:9},product.id);await pet.setProductActive(product.id,false);
        assert.equal(await pet.redeem(1,product.id,9),false);assert.equal(await pet.refund(id),true);
        assert.equal(pet.coinsFor(1),20);assert.equal(ctx.pointsHistory[0].productName,'優先選座位');assert.equal(await pet.refund(id),false);
        assert.equal(await pet.refund(ctx.pointsHistory[0].id),false);assert.equal(pet.xpFor(1),20);
    });
    await test('阻止餘額不足、失效價格、外班學生與已花費金幣的獎勵撤銷',async()=>{
        const {pet,ctx}=setup();await pet.setCoinsEnabled(true);await pet.award([1],10,'努力');const award=ctx.pointsHistory[0].id;
        await pet.saveProduct({name:'獎勵',cost:7});const p=pet.settings().products[0];
        for(const args of [[2,p.id,7],[999,p.id,7],[1,p.id,6],[1,'missing',7]])assert.equal(await pet.redeem(...args),false);
        await pet.redeem(1,p.id,7);const purchase=ctx.pointsHistory[0].id;
        assert.equal(await pet.undo([purchase]),false);assert.equal(await pet.undo([award]),false);assert.equal(pet.coinsFor(1),3);
        assert.equal(await pet.redeem(1,p.id,7),false);await pet.refund(purchase);assert.equal(await pet.undo([award]),true);assert.equal(pet.coinsFor(1),0);
    });
    for(const key of ['students','groups','pointsHistory']) await test('兌換與退幣 '+key+' 存檔失敗完整回復',async()=>{
        const {pet,ctx,storage}=setup();await pet.setCoinsEnabled(true);await pet.award([1],20,'努力');await pet.saveProduct({name:'獎勵',cost:5});const p=pet.settings().products[0];
        const before=JSON.stringify(ctx.pointsHistory);storage.failKey=key;assert.equal(await pet.redeem(1,p.id,5),false);assert.equal(JSON.stringify(ctx.pointsHistory),before);assert.equal(pet.coinsFor(1),20);
        await pet.redeem(1,p.id,5);const id=ctx.pointsHistory[0].id;storage.failKey=key;assert.equal(await pet.refund(id),false);assert.equal(pet.coinsFor(1),15);assert.equal(await pet.refund(id),true);assert.equal(pet.coinsFor(1),20);
    });
    await test('商品驗證、暫停累積後可兌換、設定與帳本備份保留',async()=>{
        const {pet,ctx,storage}=setup('B');await pet.setCoinsEnabled(true);await pet.award([1],10,'努力');await pet.setCoinsEnabled(false);
        for(const cost of [0,-1,1.5,10001,NaN])assert.equal(await pet.saveProduct({name:'商品',cost}),false);
        storage.failKey='petSettings-B';assert.equal(await pet.saveProduct({name:'失敗商品',cost:3}),false);
        await pet.saveProduct({name:'獎勵',cost:3});const p=pet.settings().products[0];await pet.redeem(1,p.id,3);
        assert.equal(pet.coinsFor(1),7);const backup=JSON.parse(storage.getItem(ctx.POINTS_HISTORY_KEY));assert.equal(pet.coinsFor(1,backup),7);
        assert.equal(JSON.parse(storage.getItem('petSettings')).products[0].cost,3);assert.equal(storage.data.has('petSettings'),false);
        storage.setItem('currentClassId','C');assert.equal(storage.getItem('petSettings'),null);assert.equal(await pet.refund(ctx.pointsHistory[0].id),false);
    });
    await test('盲盒孵化前不抽選，30 種可被抽出且一律顯示神祕蛋',async()=>{
        const kinds='cat dog rabbit panda fox bear penguin owl turtle dragon capybara axolotl lion tiger elephant giraffe zebra monkey koala redpanda raccoon otter hedgehog squirrel sheep pig frog seal deer unicorn'.split(' ');
        for(let index=0;index<30;index++){
            const {pet,ctx}=setup();let draws=0;ctx.crypto={randomUUID:()=>webcrypto.randomUUID(),getRandomValues:a=>{draws++;a[0]=index;return a;}};
            await pet.award([1],9,'努力');assert.equal(draws,0);assert.equal(ctx.students[0].classPet,undefined);
            assert.equal(pet.assetName(kinds[index],9,'happy'),'mystery-egg-hatching.webp');
            await pet.award([1],1,'孵化');assert.equal(draws,1);assert.equal(ctx.students[0].classPet,kinds[index]);assert.equal(ctx.students[0].classPetRevealed,true);
        }
    });
    await test('隨機抽樣排除模數偏差範圍，批次每位獨立抽取',async()=>{
        const {pet,ctx}=setup();const values=[4294967295,4,11];let draws=0;ctx.crypto={randomUUID:()=>webcrypto.randomUUID(),getRandomValues:a=>{a[0]=values[draws++];return a;}};
        await pet.award([1,2],10,'一起孵化');assert.equal(draws,3);assert.equal(ctx.students[0].classPet,'fox');assert.equal(ctx.students[1].classPet,'axolotl');
    });
    await test('撤銷再孵化與重新載入不重抽，表情不改帳本或種類',async()=>{
        const {pet,ctx,storage}=setup();await pet.setCoinsEnabled(true);await pet.award([1],10,'孵化');const kind=ctx.students[0].classPet,id=ctx.pointsHistory[0].id;
        await pet.undo([id]);assert.equal(ctx.students[0].classPet,kind);assert.equal(ctx.students[0].classPetRevealed,true);
        ctx.crypto={randomUUID:()=>webcrypto.randomUUID(),getRandomValues:()=>{throw Error('must not reroll')}};
        vm.runInContext(fs.readFileSync('js/class-pets.js','utf8'),ctx);ctx.ClassPets.prepare();await ctx.ClassPets.award([1],10,'再次孵化');assert.equal(ctx.students[0].classPet,kind);
        const before=JSON.stringify([ctx.groups,ctx.pointsHistory]);for(const mood of ['normal','happy','sleepy'])assert.equal(await ctx.ClassPets.setPetMood(1,mood),true);
        assert.equal(ctx.students[0].classPet,kind);assert.equal(JSON.stringify([ctx.groups,ctx.pointsHistory]),before);assert.equal(ctx.ClassPets.xpFor(1),10);assert.equal(ctx.ClassPets.coinsFor(1),10);
        const saved=JSON.parse(storage.getItem(ctx.STUDENTS_KEY))[0];assert.equal(saved.classPet,kind);assert.equal(saved.classPetRevealed,true);assert.equal(saved.classPetMood,'sleepy');assert.equal(typeof ctx.ClassPets.setPetLook,'undefined');
    });
    await test('舊版已孵化寵物保留種類，舊版撤銷後也不重抽',async()=>{
        const {pet,ctx,persist}=setup();ctx.students[0].classPet='panda';ctx.pointsHistory.unshift({id:'old-award',studentId:1,petEvent:true,petXp:10,points:10,createdAtMs:Date.now()});persist();pet.prepare();
        ctx.crypto={randomUUID:()=>webcrypto.randomUUID(),getRandomValues:()=>{throw Error('legacy must not reroll')}};
        await pet.undo(['old-award']);await pet.award([1],10,'再次孵化');assert.equal(ctx.students[0].classPet,'panda');assert.equal(ctx.students[0].classPetRevealed,true);
    });
    await test('孵化存檔失敗不留下半筆揭曉或扣款',async()=>{
        const {pet,ctx,storage}=setup();storage.failKey='pointsHistory';assert.equal(await pet.award([1],10,'孵化'),false);assert.equal(ctx.students[0].classPet,undefined);assert.equal(ctx.students[0].classPetRevealed,undefined);assert.equal(pet.xpFor(1),0);
    });
    await test('表情與資產路徑白名單，存檔失敗保留原樣態',async()=>{
        const {pet,ctx,storage}=setup();await pet.setPetMood(1,'normal');storage.failKey='students';assert.equal(await pet.setPetMood(1,'happy'),false);assert.equal(ctx.students[0].classPetMood,'normal');
        assert.equal(await pet.setPetMood(1,'missing'),false);assert.equal(await pet.setPetMood(999,'happy'),false);
        assert.equal(pet.assetName('fox',10,'happy'),'fox-baby-happy.webp');assert.equal(pet.assetName('owl',50,'sleepy'),'owl-junior-sleepy.webp');assert.equal(pet.assetName('__proto__',90),'cat-grown-normal.webp');
    });
    await test('四段蛋造型門檻、表情不洩漏種類與撤銷後進度回復', async()=>{
        const {pet,ctx}=setup();
        for(const [xp,name,label] of [[0,'rest','安靜孵育'],[2,'rest','安靜孵育'],[3,'crack','出現裂紋'],[5,'crack','出現裂紋'],[6,'splitting','裂縫擴大'],[8,'splitting','裂縫擴大'],[9,'hatching','即將破殼']]){
            for(const kind of ['cat','unicorn'])for(const mood of ['normal','happy','sleepy'])assert.equal(pet.assetName(kind,xp,mood),`mystery-egg-${name}.webp`);
            assert.equal(pet.appearance(xp).label,label);assert.equal(pet.stage(xp).next,10);
        }
        await pet.award([1],3,'裂紋');await pet.award([1],3,'裂縫');await pet.award([1],3,'破殼');
        assert.equal(pet.xpFor(1),9);assert.equal(ctx.students[0].classPet,undefined);
        await pet.undo([ctx.pointsHistory[0].id]);assert.equal(pet.assetName('cat',pet.xpFor(1)),'mystery-egg-splitting.webp');
    });
    await test('30 種抽樣的接受與拒絕邊界',async()=>{
        const {pet,ctx}=setup();const values=[4294967280,4294967279];let draws=0;
        ctx.crypto={randomUUID:()=>webcrypto.randomUUID(),getRandomValues:a=>{a[0]=values[draws++];return a;}};
        await pet.award([1],10,'孵化');assert.equal(draws,2);assert.equal(ctx.students[0].classPet,'unicorn');
    });
    await test('班級圖鑑只在孵化後解鎖且同種不重複計數',async()=>{
        const {pet,ctx}=setup();ctx.crypto={randomUUID:()=>webcrypto.randomUUID(),getRandomValues:a=>{a[0]=0;return a;}};
        await pet.award([1],9,'未孵化');assert.equal(Object.keys(pet.collectionFor()).length,0);
        await pet.award([1],1,'孵化');await pet.award([2],10,'相同種類');assert.equal(Object.keys(pet.settings().collection).length,1);assert.ok(pet.settings().collection.cat);
    });
    await test('撤銷獎勵、學生離班及重新載入不抹除已解鎖圖鑑',async()=>{
        const {pet,ctx,persist}=setup();await pet.award([1],10,'孵化');const kind=ctx.students[0].classPet;await pet.undo([ctx.pointsHistory[0].id]);assert.ok(pet.collectionFor()[kind]);ctx.students=[];persist();pet.prepare();assert.ok(pet.settings().collection[kind]);
        vm.runInContext(fs.readFileSync('js/class-pets.js','utf8'),ctx);ctx.ClassPets.prepare();assert.ok(ctx.ClassPets.collectionFor()[kind]);
    });
    await test('圖鑑寫入失敗會一起還原孵化和帳本',async()=>{
        const {pet,ctx,storage}=setup();const before=JSON.stringify([ctx.students,ctx.pointsHistory]);storage.failKey='petSettings';assert.equal(await pet.award([1],10,'孵化'),false);assert.equal(JSON.stringify([ctx.students,ctx.pointsHistory]),before);assert.equal(Object.keys(pet.collectionFor()).length,0);
    });
    await test('各班圖鑑獨立；舊版已孵化自動收錄且不暴露未孵化預選',async()=>{
        const {pet,ctx,storage,persist}=setup('A');ctx.students[0].classPet='unicorn';ctx.students[0].classPetRevealed=true;ctx.students[1].classPet='dragon';persist();pet.prepare();assert.ok(pet.settings().collection.unicorn);assert.equal(pet.collectionFor().dragon,undefined);storage.setItem('currentClassId','B');assert.equal(pet.settings().collection,undefined);
    });
    await test('圖鑑進化階段依班級實際最高等級逐步解鎖',async()=>{
        const {pet,ctx}=setup(); await pet.award([1],10,'孵化');
        const kind=ctx.students[0].classPet;
        assert.equal(pet.collectionFor()[kind].maxLevel,1);
        assert.equal(JSON.stringify(pet.collectionStagesFor(kind).map(v=>v.unlocked)),JSON.stringify([true,false,false]));
        await pet.award([1],40,'成長');
        assert.equal(pet.collectionFor()[kind].maxLevel,3);
        assert.equal(JSON.stringify(pet.collectionStagesFor(kind).map(v=>v.unlocked)),JSON.stringify([true,true,false]));
        await pet.award([1],40,'成熟');
        assert.equal(pet.collectionFor()[kind].maxLevel,5);
        assert.equal(JSON.stringify(pet.collectionStagesFor(kind).map(v=>v.unlocked)),JSON.stringify([true,true,true]));
    });
    await test('進化階段解鎖紀錄不因扣分或學生離班消失',async()=>{
        const {pet,ctx,persist}=setup(); await pet.award([1],50,'成長');
        const kind=ctx.students[0].classPet; assert.equal(pet.collectionFor()[kind].maxLevel,3);
        await pet.award([1],-100,'提醒'); assert.equal(pet.collectionFor()[kind].maxLevel,3);
        ctx.students=[]; persist(); pet.prepare(); assert.equal(pet.collectionFor()[kind].maxLevel,3);
    });
    console.log(`${passed} checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1;});
