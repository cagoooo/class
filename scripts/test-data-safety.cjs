const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{webcrypto}=require('crypto');
class FakeDb {
 constructor(){this.data=new Map();this.failStage=false;this.failHead=false;this.tail=Promise.resolve();this.afterStage=null;}
 ref(path){const db=this;return {path,doc:k=>{if(path.split('/').length%2===0)throw Error('DocumentReference has no doc method');return db.ref(path+'/'+k)},collection:k=>db.ref(path+'/'+k),async get(){if(db.offline)throw Error('network');const value=db.data.get(path);return {id:path.split('/').at(-1),exists:value!==undefined,data:()=>structuredClone(value)};}};}
 collection(path){const db=this;const ref=db.ref(path);ref.doc=id=>db.ref(path+'/'+id);return ref;}
 batch(){const ops=[];return{set:(r,d)=>ops.push([r.path,d]),commit:async()=>{if(this.failStage)throw Error('stage failed');for(const[p,d]of ops)this.data.set(p,structuredClone(d));if(this.afterStage){const f=this.afterStage;this.afterStage=null;f();}}};}
 async runTransaction(fn){const previous=this.tail;let unlock;this.tail=new Promise(r=>unlock=r);await previous;try{if(this.failHead)throw Error('transaction failed');const ops=[];const result=await fn({get:r=>r.get(),set:(r,d)=>ops.push([r.path,d])});for(const[p,d]of ops)this.data.set(p,structuredClone(d));return result;}finally{unlock();}}
}
// 名冊與 marker 會直接對文件 set / delete（不經 batch 或 transaction）。
const baseRef=FakeDb.prototype.ref;
FakeDb.prototype.ref=function(path){const r=baseRef.call(this,path),db=this;r.set=async(d,o)=>{db.data.set(path,o&&o.merge?{...(db.data.get(path)||{}),...structuredClone(d)}:structuredClone(d));};r.delete=async()=>{db.data.delete(path);};return r;};
// Collection snapshots for the production legacy adapter.
const originalRef=FakeDb.prototype.ref;
FakeDb.prototype.ref=function(path){const r=originalRef.call(this,path),db=this;if(path.split('/').length%2===1)r.get=async()=>{if(db.offline)throw Error('network');const docs=[...db.data].filter(([p])=>p.startsWith(path+'/')&&p.split('/').length===path.split('/').length+1).map(([p,d])=>({id:p.split('/').at(-1),data:()=>structuredClone(d)}));return{docs,empty:!docs.length,size:docs.length,forEach:f=>docs.forEach(f)};};return r;};
function setup(db=new FakeDb(),classId='A',uid='teacher'){
 class Storage {constructor(){this.data=new Map();this.failKey=null;}getItem(k){return this.data.get(k)??null;}setItem(k,v){if(this.failKey===k){this.failKey=null;throw Error('quota');}this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}key(i){return [...this.data.keys()][i]??null;}get length(){return this.data.size;}}
 const storage=new Storage();storage.setItem('currentClassId',classId);const notices=[],petErrors=[],syncConflicts=[];
 const c={Storage,localStorage:storage,sessionStorage:new Storage(),crypto:webcrypto,navigator:{onLine:true},console:{log(){},warn(){},error(){}},document:{readyState:'loading',addEventListener(){},getElementById(){return null;}},addEventListener(){},alert(){},setTimeout(){},clearTimeout(){},NotificationSystem:{error:m=>notices.push(m),success:m=>notices.push(m),warning:m=>notices.push(m)},UsageNotify:{petError:(...args)=>petErrors.push(args),syncConflict:(...args)=>syncConflicts.push(args)},FirebaseConfig:{getCurrentUserId:()=>uid,getDb:()=>db,isConnected:()=>true},SyncStatusIndicator:{updateStateBasedOnSync(){},setState(){}},firebase:{firestore:{FieldValue:{serverTimestamp:()=>1}}}};
 c.window=c;vm.createContext(c);for(const f of ['class-aware-storage','backup-integrity','cloud-safety','firebase-sync','data-backup'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),c);
 c.STUDENTS_KEY='students-'+classId;c.GROUPS_KEY='groups-'+classId;c.POINTS_HISTORY_KEY='pointsHistory-'+classId;
 c.students=[{id:1,name:'虛構學生 🦄',points:10,petNickname:'星星',petHatchedAt:'2026-09-22T00:00:00Z',petMaxLevel:1,classPet:'unicorn',classPetRevealed:true,classPetMood:'happy',petCarryXp:4,petCarryCoins:2}];c.groups=[];c.pointsHistory=[{id:'earn',studentId:1,points:10,petEvent:true,petXp:10,coinDelta:7},{id:'buy',studentId:1,points:0,petEvent:true,petXp:0,coinDelta:-3,petShopType:'purchase',productName:'獎勵'},{id:'refund',studentId:1,points:0,petEvent:true,petXp:0,coinDelta:3,petReverses:'buy'}];
 const save=()=>{for(const k of ['students','groups','pointsHistory'])storage.setItem(k+'-'+classId,JSON.stringify(c[k]));};save();storage.setItem('petSettings',JSON.stringify({enabled:true,coinsEnabled:true,quests:[{id:'q',name:'全班整理',target:1,startDate:'',endDate:'',createdAt:'2026-09-22T00:00:00Z',claimedAt:'2026-09-22T00:02:00Z',events:[{id:'qe',amount:1,note:'老師確認',at:'2026-09-22T00:01:00Z'}]}],collectionEggs:[{id:'q',questName:'全班整理',earnedAt:'2026-09-22T00:02:00Z',kind:'unicorn',openedAt:'2026-09-22T00:03:00Z'}],collection:{unicorn:{discoveredAt:'2026-09-22T00:00:00Z'}},rules:[{id:'r',name:'努力',xp:3,coins:2,points:1}],products:[{id:'p',name:'獎勵',cost:3}]}));
 const recovery=new Map();c.LocalRecovery={put:async(k,v)=>recovery.set(k,structuredClone(v)),get:async k=>recovery.get(k)};
 return {c,db,storage,save,recovery,notices,petErrors,syncConflicts,s:c.CloudSafety};
}
let passed=0;async function test(name,fn){await fn();console.log('PASS',name);passed++;}
(async()=>{
 await test('獨立客戶端往返保留 Lv.5、圖鑑與兌換退幣帳本',async()=>{
  const a=setup();a.c.students[0].petMaxLevel=5;a.c.students[0].points=90;
  a.c.pointsHistory.push({id:'growth',studentId:1,points:80,petEvent:true,petXp:80,coinDelta:80});a.save();
  const config=JSON.parse(a.storage.getItem('petSettings'));config.collection.unicorn.maxLevel=5;a.storage.setItem('petSettings',JSON.stringify(config));
  await a.s.publish();const b=setup(a.db);assert.equal(await b.s.restore(await b.s.read()),true);
  assert.equal(b.c.students[0].petMaxLevel,5);assert.equal(JSON.parse(b.storage.getItem('petSettings')).collection.unicorn.maxLevel,5);
  assert.deepEqual(JSON.parse(JSON.stringify(b.c.pointsHistory)),JSON.parse(JSON.stringify(a.c.pointsHistory)));
  b.c.pointsHistory.push({id:'buy-device-b',petDeliveredAt:'2026-09-27T00:00:00.000Z',studentId:1,points:0,petEvent:true,petXp:0,coinDelta:-3,petShopType:'purchase',productName:'獎勵'});b.save();await b.s.publish();
  assert.equal(await a.s.restore(await a.s.read()),true);assert.ok(a.c.pointsHistory.some(r=>r.id==='buy-device-b'));
  a.c.pointsHistory.push({id:'refund-device-a',studentId:1,points:0,petEvent:true,petXp:0,coinDelta:3,petReverses:'buy-device-b'});a.save();await a.s.publish();
  assert.equal(await b.s.restore(await b.s.read()),true);
  assert.deepEqual(JSON.parse(JSON.stringify(b.s.dataFor(b.s.capture()))),JSON.parse(JSON.stringify(a.s.dataFor(a.s.capture()))));
  assert.equal(b.c.pointsHistory.filter(r=>r.id==='refund-device-a').length,1);
 });
 await test('完整快照保留寵物、期初值、金幣、商品與退幣',async()=>{const a=setup();await a.s.publish();const remote=await a.s.read();assert.deepEqual(JSON.parse(JSON.stringify(a.s.dataFor(remote.values))),JSON.parse(JSON.stringify(a.s.dataFor(a.s.capture()))));assert.equal(a.s.status(),'synced');});
 await test('未知舊裝置不能覆蓋有差異的雲端資料',async()=>{const a=setup();await a.s.publish();const b=setup(a.db);b.c.students[0].points=42;b.save();await assert.rejects(b.s.publish(),e=>e.code==='sync-conflict');assert.equal((await a.s.read()).token,(await b.s.read()).token);});
 await test('內容相同但 revision 已更新時安全採用新版，不誤判衝突',async()=>{const a=setup();await a.s.publish();const first=await a.s.read(),nextToken='same-content-revision',prefix=`users/teacher/classes/A/syncSnapshots/${first.token}/parts/`;for(const[path,value]of [...a.db.data].filter(([path])=>path.startsWith(prefix)))a.db.data.set(path.replace(first.token,nextToken),structuredClone(value));const headPath='users/teacher/classes/A/appSettings/syncRevision',head=a.db.data.get(headPath);a.db.data.set(headPath,{...head,previous:first.token,token:nextToken});assert.equal(await a.s.publish(),true);assert.equal((await a.s.read()).token,nextToken);assert.equal(a.s.status(),'synced');});
 await test('上傳期間雲端改用相同內容新 token 時重新比對並安靜完成',async()=>{const a=setup();await a.s.publish();const first=await a.s.read(),nextToken='same-content-racing-revision',prefix='users/teacher/classes/A/syncSnapshots/',headPath='users/teacher/classes/A/appSettings/syncRevision';a.c.students[0].points=11;a.save();a.db.afterStage=()=>{const staged=[...a.db.data].filter(([path])=>path.startsWith(prefix)&&!path.startsWith(prefix+first.token+'/'));const uploadToken=staged[0][0].split('/')[5],ordered=staged.map(([,value])=>value).sort((x,y)=>x.index-y.index),checksum=a.c.BackupIntegrity.checksum(ordered.map(part=>part.text).join(''));for(const[path,value]of staged)a.db.data.set(path.replace(uploadToken,nextToken),structuredClone(value));const head=a.db.data.get(headPath);a.db.data.set(headPath,{...head,previous:first.token,token:nextToken,checksum});};assert.equal(await a.s.publish(),true);assert.equal((await a.s.read()).token,nextToken);assert.equal(a.s.status(),'synced');assert.equal(a.syncConflicts.length,0);});
 await test('沒有同步基準的舊雲端差異只留底不即時推播',async()=>{const a=setup();a.db.data.set('users/teacher/classes/A/students/99',{id:99,name:'雲端學生',points:4});a.c.students[0].points=42;a.save();await assert.rejects(a.s.publish(),e=>e.code==='sync-conflict'&&e.notify===false&&e.source==='legacy-divergence');await a.s.report(Object.assign(Error('雲端版本與本機資料不同'),{code:'sync-conflict',notify:false,source:'legacy-divergence'}),'A',true);assert.equal(a.syncConflicts.length,1);assert.equal(a.syncConflicts[0][1].notify,false);assert.equal(a.syncConflicts[0][1].source,'legacy-divergence');});
 await test('同步衝突只送同步提醒，不誤報寵物系統失敗',async()=>{const a=setup();await a.s.publish();const b=setup(a.db);b.c.students[0].points=42;b.save();await assert.rejects(b.s.publish(),e=>e.code==='sync-conflict');await b.s.report(Object.assign(Error('雲端資料與本機資料確實不同'),{code:'sync-conflict'}),'A',true);assert.equal(b.petErrors.length,0);assert.equal(b.syncConflicts.length,1);});
 await test('明確確認的一鍵同步可用最新雲端版本建立快照',async()=>{const a=setup();await a.s.publish();const b=setup(a.db);const remote=await b.s.read();b.c.students[0].points=42;b.save();await b.s.publish(undefined,{remote,expectedToken:remote.token});assert.equal(a.s.dataFor((await a.s.read()).values).students[0].points,42);});
 // ── 自動快轉：換裝置後，沒有未同步變更的裝置自動換成雲端新版 ──
 // 兩台裝置先同步到同一版，之後 a 再上傳新內容，回傳 b 供各測試驗證。
 const twoDevices=async()=>{const a=setup();await a.s.publish();const b=setup(a.db);assert.equal(await b.s.restore(await b.s.read()),true);b.recovery.clear();a.c.students[0].points=77;a.c.pointsHistory.push({id:'later',studentId:1,points:67,petEvent:true,petXp:67,coinDelta:0});a.save();await a.s.publish();return {a,b};};
 await test('另一台裝置上傳後，沒有變更的裝置自動快轉且之後編輯不再衝突',async()=>{
  const {a,b}=await twoDevices();
  assert.equal(await b.s.fastForward(undefined,{dryRun:true}),'newer');assert.equal(JSON.parse(b.storage.getItem('students-A'))[0].points,10);
  assert.equal(await b.s.fastForward(),'updated');
  assert.equal(JSON.parse(b.storage.getItem('students-A'))[0].points,77);assert.equal(b.c.students[0].points,77);assert.equal(b.c.pointsHistory.length,4);
  assert.equal(b.s.status(),'synced');assert.equal(b.recovery.size,0);
  assert.equal(await b.s.fastForward(),'current');
  b.c.students[0].points=80;b.save();assert.equal(await b.s.publish(),true);assert.equal(a.s.dataFor((await a.s.read()).values).students[0].points,80);
 });
 await test('本機有未同步變更時不快轉，資料原封不動',async()=>{
  // 未登入時的編輯不會留下異動標記，所以必須靠內容比對擋下
  const {b}=await twoDevices();b.c.students[0].points=42;b.save();const before=[...b.storage.data];
  assert.equal(await b.s.fastForward(),'local-changes');assert.deepEqual([...b.storage.data],before);
  // 內容沒變但留有異動標記（例如改了又改回來、尚未同步）也不快轉
  const second=(await twoDevices()).b;second.s.markLocalChange('A');const untouched=[...second.storage.data];
  assert.equal(await second.s.fastForward(),'local-changes');assert.deepEqual([...second.storage.data],untouched);
  await assert.rejects(b.s.publish(),e=>e.code==='sync-conflict');
 });
 await test('只改過白板或主題的裝置仍可快轉，並保留這台的白板與主題',async()=>{
  const {b}=await twoDevices();b.storage.setItem('boardNote','這台教室的白板');b.storage.setItem('theme','dark');
  assert.equal(await b.s.fastForward(),'updated');
  assert.equal(JSON.parse(b.storage.getItem('students-A'))[0].points,77);
  assert.equal(b.storage.getItem('boardNote'),'這台教室的白板');assert.equal(b.storage.getItem('theme'),'dark');
  assert.equal(await b.s.fastForward(),'current');
 });
 await test('沒有同步基準、離線或舊版基準內容不符時不快轉',async()=>{
  const a=setup();await a.s.publish();const fresh=setup(a.db);assert.equal(await fresh.s.fastForward(),'no-baseline');
  const {b}=await twoDevices();b.c.navigator.onLine=false;assert.equal(await b.s.fastForward(),'skipped');b.c.navigator.onLine=true;
  // 舊版基準沒有 tracked 指紋：只要整份內容有任何不同就不動
  const key='cloudSafetyBase:teacher:A',old=JSON.parse(b.storage.getItem(key));delete old.tracked;b.storage.setItem(key,JSON.stringify(old));b.storage.setItem('theme','dark');
  assert.equal(await b.s.fastForward(),'local-changes');assert.equal(JSON.parse(b.storage.getItem('students-A'))[0].points,10);
  b.storage.removeItem('theme');assert.equal(await b.s.fastForward(),'updated');
 });
 await test('快轉下載期間老師開始編輯就放棄，不覆蓋剛做的變更',async()=>{
  const {b}=await twoDevices();const read=b.s.read;let edited=false;
  // 模擬：完整快照還在下載時，老師已經加了分
  const headPath='users/teacher/classes/A/syncSnapshots/';const original=b.db.ref.bind(b.db);
  b.db.ref=path=>{const ref=original(path);if(path.startsWith(headPath)&&!edited){const get=ref.get.bind(ref);ref.get=async()=>{if(!edited){edited=true;b.c.students[0].points=55;b.save();}return get();};}return ref;};
  assert.equal(await b.s.fastForward(),'local-changes');assert.equal(JSON.parse(b.storage.getItem('students-A'))[0].points,55);assert.equal(typeof read,'function');
  b.db.ref=original;
 });
 await test('從沒開過的班級（名冊剛帶進來）自動接手雲端資料，並保留這台的主題',async()=>{
  const a=setup();await a.s.publish();const b=setup(a.db);
  for(const k of ['students-A','groups-A','pointsHistory-A','petSettings-A'])b.storage.removeItem(k);b.c.students=[];b.c.groups=[];b.c.pointsHistory=[];b.storage.setItem('theme','dark');
  assert.equal(await b.s.fastForward(undefined,{dryRun:true}),'newer');assert.equal(await b.s.fastForward(),'updated');
  assert.equal(JSON.parse(b.storage.getItem('students-A'))[0].name,'虛構學生 🦄');assert.equal(b.c.students.length,1);assert.equal(b.storage.getItem('theme'),'dark');
  assert.equal(await b.s.fastForward(),'current');b.c.students[0].points=11;b.save();assert.equal(await b.s.publish(),true);
  // 雲端也沒有這個班（剛在這台新建）時不動
  const fresh=setup(new FakeDb());for(const k of ['students-A','groups-A','pointsHistory-A','petSettings-A'])fresh.storage.removeItem(k);assert.equal(await fresh.s.fastForward(),'no-baseline');
 });
 // ── 班級名冊跨裝置對齊 ──
 const registryPath='users/teacher/_meta/classProfiles';
 const names=list=>Array.from(list,p=>p.name);   // vm 內的陣列原型與外層不同，轉成外層陣列再比對
 await test('名冊合併：別處刪除的班級不復活、這台刪除的會送出、救回的班級優先',async()=>{
  const merge=setup().c.mergeClassRegistry,now=Date.parse('2026-10-02T04:00:00Z'),at='2026-10-02T03:00:00Z';
  const X={id:'X',name:'502自然'},Y={id:'Y',name:'604'},D={id:'default',name:'預設班級'};
  // 這台還留著 Y，但 Y 已在別處刪除 → 不加回雲端
  let r=merge({cloudProfiles:[D,X],cloudDeleted:{Y:at},localProfiles:[D,X,Y],now});assert.deepEqual(names(r.profiles),['預設班級','502自然']);assert.equal(r.deleted.Y,at);
  // 這台剛刪了 Y（尚未送出）→ 從雲端移除並留下紀錄
  r=merge({cloudProfiles:[D,X,Y],localProfiles:[D,X],localDeleted:{Y:at},now});assert.deepEqual(names(r.profiles),['預設班級','502自然']);assert.equal(r.deleted.Y,at);
  // 後台把 Y 救回雲端名冊 → 舊的刪除紀錄失效
  r=merge({cloudProfiles:[D,X,Y],cloudDeleted:{Y:at},localProfiles:[D,X],now});assert.deepEqual(names(r.profiles),['預設班級','502自然','604']);assert.equal(r.deleted.Y,undefined);
  // 這台新建、雲端沒有也沒有刪除紀錄 → 視為新增；空白裝置不會洗掉雲端
  r=merge({cloudProfiles:[D,X],localProfiles:[D,{id:'N',name:'新班'}],now});assert.deepEqual(names(r.profiles),['預設班級','502自然','新班']);
  r=merge({cloudProfiles:[D,X,Y],localProfiles:[D],now});assert.deepEqual(names(r.profiles),['預設班級','502自然','604']);
  // 改名：修改時間較新的一邊贏；都沒有時間時依 prefer
  r=merge({cloudProfiles:[{id:'X',name:'舊名',updatedAt:'2026-10-01T00:00:00Z'}],localProfiles:[{id:'X',name:'新名',updatedAt:'2026-10-02T00:00:00Z'}],now});assert.equal(r.profiles[0].name,'新名');
  r=merge({cloudProfiles:[{id:'X',name:'雲端'}],localProfiles:[{id:'X',name:'本機'}],now});assert.equal(r.profiles[0].name,'雲端');
  r=merge({cloudProfiles:[{id:'X',name:'雲端'}],localProfiles:[{id:'X',name:'本機'}],prefer:'local',now});assert.equal(r.profiles[0].name,'本機');
  // 預設班級不能被刪；過期的刪除紀錄會清掉
  r=merge({cloudProfiles:[D],localProfiles:[D],localDeleted:{default:at},cloudDeleted:{old:'2025-01-01T00:00:00Z'},now});assert.deepEqual(names(r.profiles),['預設班級']);assert.deepEqual(Object.keys(r.deleted),[]);
 });
 const registryDevices=async()=>{
  const profiles=[{id:'default',name:'預設班級',isDefault:true},{id:'A',name:'502自然'},{id:'Y',name:'604'}];
  const a=setup();a.storage.setItem('classProfiles',JSON.stringify(profiles));await a.c.uploadClassProfilesMerged();
  const b=setup(a.db);b.storage.setItem('classProfiles',JSON.stringify(profiles));return {a,b};
 };
 const localNames=x=>names(JSON.parse(x.storage.getItem('classProfiles')));
 await test('一台刪除班級後，另一台同步不會把它加回雲端，名冊也跟著移除',async()=>{
  const {a,b}=await registryDevices();
  a.storage.setItem('classProfiles',JSON.stringify(JSON.parse(a.storage.getItem('classProfiles')).filter(p=>p.id!=='Y')));assert.equal(await a.c.deleteClassFromCloud('Y'),true);
  assert.deepEqual(names(a.db.data.get(registryPath).profiles),['預設班級','502自然']);assert.ok(a.db.data.get(registryPath).deleted.Y);
  // b 還留著 Y：修正前這次上傳會把 Y 加回雲端（跨裝置殭屍班）
  await b.c.uploadClassProfilesMerged();
  assert.deepEqual(names(b.db.data.get(registryPath).profiles),['預設班級','502自然']);assert.equal(b.db.data.has('users/teacher/classes/Y'),false);
  assert.deepEqual(localNames(b),['預設班級','502自然']);
 });
 await test('其他裝置新增與改名的班級會帶進這台；空白裝置不會洗掉雲端名冊',async()=>{
  const {a,b}=await registryDevices();
  const list=JSON.parse(a.storage.getItem('classProfiles'));list.push({id:'N',name:'501自然',updatedAt:new Date().toISOString()});list[1].name='502自然（新）';list[1].updatedAt=new Date().toISOString();
  a.storage.setItem('classProfiles',JSON.stringify(list));await a.c.uploadClassProfilesMerged();
  const result=await b.c.FirebaseSync.reconcileClassRegistry();
  assert.deepEqual(localNames(b),['預設班級','502自然（新）','604','501自然']);assert.deepEqual([...result.added],['501自然']);assert.equal(result.changed,true);
  assert.equal((await b.c.FirebaseSync.reconcileClassRegistry()).changed,false);
  const blank=setup(a.db);blank.storage.removeItem('classProfiles');const before=JSON.stringify(a.db.data.get(registryPath).profiles);
  await blank.c.FirebaseSync.reconcileClassRegistry();await blank.c.uploadClassProfilesMerged();
  assert.equal(JSON.stringify(a.db.data.get(registryPath).profiles),before);assert.deepEqual(localNames(blank),['預設班級','502自然（新）','604','501自然']);
 });
 await test('離線時刪除的班級，連線後才送出刪除，不會被雲端帶回來',async()=>{
  const {a,b}=await registryDevices();
  b.storage.setItem('classProfiles',JSON.stringify(JSON.parse(b.storage.getItem('classProfiles')).filter(p=>p.id!=='Y')));b.c.FirebaseSync.rememberClassDeletion('Y');
  await b.c.FirebaseSync.reconcileClassRegistry();
  assert.deepEqual(localNames(b),['預設班級','502自然']);assert.deepEqual(names(a.db.data.get(registryPath).profiles),['預設班級','502自然']);
  assert.ok(a.db.data.get(registryPath).deleted.Y);assert.equal(b.storage.getItem('classProfilesDeleted'),null);
  await a.c.FirebaseSync.reconcileClassRegistry();assert.deepEqual(localNames(a),['預設班級','502自然']);
 });
 await test('正在使用或有未同步變更的班級，即使已在別處刪除也先留在這台，但不加回雲端',async()=>{
  const {a,b}=await registryDevices();
  await a.c.deleteClassFromCloud('A');await a.c.deleteClassFromCloud('Y');b.s.markLocalChange('Y');   // b 目前班級是 A，Y 有未同步變更
  const result=await b.c.FirebaseSync.reconcileClassRegistry();
  assert.deepEqual(localNames(b),['預設班級','502自然','604']);assert.deepEqual([...result.removed],[]);
  await b.c.uploadClassProfilesMerged();assert.deepEqual(names(b.db.data.get(registryPath).profiles),['預設班級']);
 });
 await test('舊版雲端資料本機都有時自動升級並保留雲端舊資料；雲端有本機沒有的才要比較',async()=>{
  const seed=db=>{db.data.set('users/teacher/classes/A/students/1',{id:1,name:'舊雲端學生',points:4});db.data.set('users/teacher/classes/A/pointsHistory/earn',{id:'earn',studentId:1,points:4});};
  const a=setup();seed(a.db);a.c.students[0].points=42;a.save();
  assert.equal(await a.s.publish(),true);
  const head=a.db.data.get('users/teacher/classes/A/appSettings/syncRevision');assert.ok(head&&!String(head.token).startsWith('legacy:'));
  assert.equal(a.s.status(),'synced');assert.equal(a.syncConflicts.length,0);
  const kept=a.recovery.get('teacher:A:legacy')||a.recovery.get('legacy-cloud:teacher:A');assert.ok(kept);assert.equal(JSON.parse(kept.values.students)[0].name,'舊雲端學生');
  assert.equal(a.db.data.get('users/teacher/classes/A/students/1').name,'舊雲端學生');
  assert.equal(a.s.dataFor((await a.s.read()).values).students[0].points,42);
  // 雲端有本機沒有的學生：仍然擋下
  const b=setup();seed(b.db);b.db.data.set('users/teacher/classes/A/students/77',{id:77,name:'別處新增'});
  await assert.rejects(b.s.publish(),e=>e.code==='sync-conflict');assert.equal(b.db.data.has('users/teacher/classes/A/appSettings/syncRevision'),false);
  // 還原區存不進去時不自動升級
  const c2=setup();seed(c2.db);c2.c.LocalRecovery.put=async()=>{throw Error('idb')};await assert.rejects(c2.s.publish(),e=>e.code==='sync-conflict');
 });
 await test('兩台同版本同時上傳僅一台成功',async()=>{const a=setup();await a.s.publish();const b=setup(a.db);await b.s.restore(await b.s.read());a.c.students[0].points=11;a.save();b.c.students[0].points=12;b.save();const r=await Promise.allSettled([a.s.publish(),b.s.publish()]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(r.filter(x=>x.status==='rejected'&&x.reason.code==='sync-conflict').length,1);});
 for(const flag of ['failStage','failHead'])await test('中途失敗保留完整舊版 '+flag,async()=>{const a=setup();await a.s.publish();const before=await a.s.read();a.c.students[0].points=20;a.save();a.db[flag]=true;await assert.rejects(a.s.publish());a.db[flag]=false;assert.equal((await a.s.read()).token,before.token);assert.equal(a.s.status(),'pending');await a.s.publish();assert.equal(a.s.status(),'synced');});
 await test('離線操作重載後恢復仍待同步且只發布一次',async()=>{const a=setup();await a.s.publish();a.c.navigator.onLine=false;a.c.students[0].points=15;a.save();await assert.rejects(a.s.publish(),/恢復連線/);vm.runInContext(fs.readFileSync('js/cloud-safety.js','utf8'),a.c);assert.equal(a.c.CloudSafety.status(),'pending');a.c.navigator.onLine=true;await a.c.CloudSafety.publish();const token=(await a.s.read()).token;await a.c.CloudSafety.publish();assert.equal((await a.s.read()).token,token);});
 await test('上傳期間新增操作不被誤標成已同步',async()=>{const a=setup();a.db.afterStage=()=>{a.c.students[0].points=99;a.save();};await a.s.publish();assert.equal(a.s.status(),'pending');assert.equal(a.s.dataFor((await a.s.read()).values).students[0].points,10);await a.s.publish();assert.equal(a.s.status(),'synced');});
 await test('切班與不同老師同步版本各自隔離',async()=>{const a=setup();await a.s.publish();const b=setup(a.db,'B');assert.equal((await b.s.read()).empty,true);await b.s.publish();const other=setup(a.db,'A','other');assert.equal((await other.s.read()).empty,true);assert.equal(a.s.status(),'synced');});
 await test('讀取過程換帳號不能還原',async()=>{const a=setup();await a.s.publish();const remote=await a.s.read();a.c.FirebaseConfig.getCurrentUserId=()=> 'other';await assert.rejects(a.s.restore(remote),/帳號/);});
 await test('還原失敗整批回復，不更新記憶體與同步基準',async()=>{const a=setup();await a.s.publish();const remote=await a.s.read();a.c.students[0].points=77;a.save();const before=a.s.fingerprint(a.s.capture());a.storage.failKey='groups-A';assert.equal(await a.s.restore(remote),false);assert.equal(a.s.fingerprint(a.s.capture()),before);assert.equal(a.c.students[0].points,77);assert.equal(a.recovery.get('teacher:A').students[0].points,77);});
 await test('無法保存還原前副本時不覆蓋',async()=>{const a=setup();await a.s.publish();const remote=await a.s.read();a.c.LocalRecovery.put=async()=>{throw Error('quota')};a.c.students[0].points=60;a.save();await assert.rejects(a.s.restore(remote));assert.equal(a.c.students[0].points,60);});
 await test('損壞雲端分段不得回退讀取過期集合',async()=>{const a=setup();await a.s.publish();const token=(await a.s.read()).token;a.db.data.delete('users/teacher/classes/A/syncSnapshots/'+token+'/parts/0');await assert.rejects(a.s.read(),/分段不完整/);});
 await test('超過 500 筆紀錄以分段完整往返',async()=>{const a=setup();a.c.pointsHistory=Array.from({length:1200},(_,i)=>({id:'r'+i,studentId:1,points:1,petEvent:true,petXp:1,coinDelta:1,reason:'努力🥚'.repeat(15)}));a.save();await a.s.publish();assert.equal(a.s.dataFor((await a.s.read()).values).pointsHistory.length,1200);});
 await test('舊雲端首次匯入後才能建立新版本，原集合不刪除',async()=>{const a=setup();a.db.data.set('users/teacher/classes/A/students/99',{id:99,name:'原學生',points:4});await assert.rejects(a.s.publish(),e=>e.code==='sync-conflict');const old=await a.s.read();await a.s.restore(old);await a.s.publish();assert.equal(a.db.data.get('users/teacher/classes/A/students/99').name,'原學生');});
 await test('完整備份 codec 含多段、emoji 與寵物成果',async()=>{const a=setup();const data=a.c.DataBackup.collectData();data.boardNote='🦄'.repeat(30000);const rows=a.c.BackupIntegrity.encode(data);assert.ok(rows.length>3);assert.deepEqual(JSON.parse(JSON.stringify(a.c.BackupIntegrity.decode(rows))),JSON.parse(JSON.stringify(data)));for(const r of rows.slice(2)){assert.ok(!/[\uD800-\uDBFF]$/.test(r[1]));assert.ok(!/^[\uDC00-\uDFFF]/.test(r[1]));}});
 for(const damage of ['missing','reorder','edit','count'])await test('拒絕損壞 Excel 分段 '+damage,async()=>{const a=setup();const d=a.c.DataBackup.collectData();d.boardNote='內容'.repeat(20000);const rows=JSON.parse(JSON.stringify(a.c.BackupIntegrity.encode(d)));if(damage==='missing')rows.pop();if(damage==='reorder')[rows[2],rows[3]]=[rows[3],rows[2]];if(damage==='edit')rows[2][1]=rows[2][1].replace('虛構','修改');if(damage==='count')rows[1][1]++;assert.throws(()=>a.c.BackupIntegrity.decode(rows));});
 await test('舊 Excel CHUNKS 保持相容但缺段仍阻擋',async()=>{const a=setup(),d=a.c.DataBackup.collectData();const rows=[['note'],['CHUNKS',1],['DATA',JSON.stringify(d)]];assert.equal(a.c.BackupIntegrity.decode(rows).students[0].classPet,'unicorn');rows[1][1]=2;assert.throws(()=>a.c.BackupIntegrity.decode(rows));});
 await test('格式驗證攔截空殼、重複 ID 與錯誤金幣型別',async()=>{const a=setup();for(const bad of [null,{version:'1.1'}, {version:'1.1',students:[],groups:[],pointsHistory:[{id:1,coinDelta:'10'}]}])assert.equal(a.c.BackupIntegrity.validate(bad),false);const d=a.c.DataBackup.collectData();d.students.push({...d.students[0]});assert.equal(a.c.BackupIntegrity.validate(d),false);});
 await test('自動同步只處理有異動的班級，其他班級基準不清除',async()=>{const a=setup();a.storage.setItem('classProfiles',JSON.stringify([{id:'A',name:'甲班'},{id:'B',name:'乙班'}]));await a.s.publish();assert.equal(await a.c.FirebaseSync.syncPendingClasses(),true);assert.equal(a.s.status(),'synced');});
 await test('每班本機異動標記只在同步完成後清除',async()=>{const a=setup();assert.equal(a.s.hasBaseline(),false);a.s.markLocalChange();assert.equal(a.s.hasLocalChangeMarker(),true);await a.s.publish();assert.equal(a.s.hasBaseline(),true);assert.equal(a.s.hasLocalChangeMarker(),false);});
 await test('內容相同的舊雲端資料會安全升級成新快照',async()=>{const a=setup();
  // 模擬 v3.37.6 前的集合式雲端資料：沒有 syncRevision，只有舊集合與 pets 設定。
  a.c.students[0].id='1';
  a.save();
  for(const key of ['notebookEntries','homeworkList','lotteryHistory','classAnnouncements'])a.c.ClassAwareStorage.rawSet(key+'-A','[]');
  const data=a.s.dataFor(a.s.capture());
  a.db.data.clear();
  const prefix='users/teacher/classes/A';
  for(const row of data.students){const {id,...item}=row;a.db.data.set(`${prefix}/students/${id}`,item);}
  for(const row of data.pointsHistory){const {id,...item}=row;a.db.data.set(`${prefix}/pointsHistory/${id}`,item);}
  a.db.data.set(`${prefix}/appSettings/pets`,{data:data.petSettings});
  await a.s.publish();
  const remote=await a.s.read();
  assert.equal(remote.empty,false);
  assert.ok(remote.token.length>=8 && !remote.token.startsWith('legacy:'));
  assert.equal(a.db.data.has(`${prefix}/appSettings/syncRevision`),true);
 });
 await test('從其他班還原預設班不污染目前班級設定',async()=>{const a=setup();const original=a.storage.getItem('petSettings');a.c.ClassAwareStorage.rawSet('students',JSON.stringify([{id:9,name:'預設學生',points:1}]));a.c.ClassAwareStorage.rawSet('groups','[]');a.c.ClassAwareStorage.rawSet('pointsHistory','[]');a.c.ClassAwareStorage.rawSet('petSettings',JSON.stringify({enabled:false,rules:[]}));await a.s.publish('default');const r=await a.s.read('default');a.c.ClassAwareStorage.rawSet('petSettings',JSON.stringify({enabled:true,rules:[]}));assert.equal(await a.s.restore(r),true);assert.equal(a.storage.getItem('petSettings'),original);assert.equal(JSON.parse(a.c.ClassAwareStorage.rawGet('petSettings')).enabled,false);assert.equal(a.c.students[0].id,1);});
 await test('離線與未登入不發寵物錯誤且保留資料',async()=>{
  for(const offline of [true,false]) {
   const a=setup(); const before=JSON.stringify(a.s.capture()); let state='';
   a.c.SyncStatusIndicator={setState:v=>state=v};
   if(offline)a.c.navigator.onLine=false;else a.c.FirebaseConfig.getCurrentUserId=()=>null;
   let caught;try{await a.s.publish();}catch(e){caught=e;}
   assert.equal(caught.code,offline?'sync-offline':'sync-auth-required');
   await a.s.report(caught,true,'A');
   assert.equal(a.petErrors.length,0);assert.equal(JSON.stringify(a.s.capture()),before);
   assert.equal(state,offline?'disconnected':'offline');
  }
 });
 console.log(passed+' safety checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
