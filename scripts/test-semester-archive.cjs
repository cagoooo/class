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
// 真正的 Firestore 參照有 id
const idRef=FakeDb.prototype.ref;FakeDb.prototype.ref=function(path){const r=idRef.call(this,path);r.id=path.split('/').at(-1);return r;};
function setup(db=new FakeDb(),classId='A',uid='teacher'){
 class Storage {constructor(){this.data=new Map();this.failKey=null;}getItem(k){return this.data.get(k)??null;}setItem(k,v){if(this.failKey===k){this.failKey=null;throw Error('quota');}this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}key(i){return [...this.data.keys()][i]??null;}get length(){return this.data.size;}}
 const storage=new Storage();storage.setItem('currentClassId',classId);const notices=[],petErrors=[],syncConflicts=[];
 const c={Storage,localStorage:storage,sessionStorage:new Storage(),crypto:webcrypto,navigator:{onLine:true},console:{log(){},warn(){},error(){}},document:{readyState:'loading',addEventListener(){},getElementById(){return null;}},addEventListener(){},alert(){},setTimeout(){},clearTimeout(){},NotificationSystem:{error:m=>notices.push(m),success:m=>notices.push(m),warning:m=>notices.push(m)},UsageNotify:{petError:(...args)=>petErrors.push(args),syncConflict:(...args)=>syncConflicts.push(args)},FirebaseConfig:{getCurrentUserId:()=>uid,getDb:()=>db,isConnected:()=>true,isGoogleUser:()=>true},SyncStatusIndicator:{updateStateBasedOnSync(){},setState(){}},firebase:{firestore:{FieldValue:{serverTimestamp:()=>1}}}};
 c.window=c;vm.createContext(c);for(const f of ['class-aware-storage','backup-integrity','cloud-safety','firebase-sync','data-backup','semester-archive'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),c);
 c.STUDENTS_KEY='students-'+classId;c.GROUPS_KEY='groups-'+classId;c.POINTS_HISTORY_KEY='pointsHistory-'+classId;
 c.students=[{id:1,name:'虛構學生 🦄',points:10,petNickname:'星星',petHatchedAt:'2026-09-22T00:00:00Z',petMaxLevel:1,classPet:'unicorn',classPetRevealed:true,classPetMood:'happy',petCarryXp:4,petCarryCoins:2}];c.groups=[];c.pointsHistory=[{id:'earn',studentId:1,points:10,petEvent:true,petXp:10,coinDelta:7},{id:'buy',studentId:1,points:0,petEvent:true,petXp:0,coinDelta:-3,petShopType:'purchase',productName:'獎勵'},{id:'refund',studentId:1,points:0,petEvent:true,petXp:0,coinDelta:3,petReverses:'buy'}];
 const save=()=>{for(const k of ['students','groups','pointsHistory'])storage.setItem(k+'-'+classId,JSON.stringify(c[k]));};save();storage.setItem('petSettings',JSON.stringify({enabled:true,coinsEnabled:true,quests:[{id:'q',name:'全班整理',target:1,startDate:'',endDate:'',createdAt:'2026-09-22T00:00:00Z',claimedAt:'2026-09-22T00:02:00Z',events:[{id:'qe',amount:1,note:'老師確認',at:'2026-09-22T00:01:00Z'}]}],collectionEggs:[{id:'q',questName:'全班整理',earnedAt:'2026-09-22T00:02:00Z',kind:'unicorn',openedAt:'2026-09-22T00:03:00Z'}],collection:{unicorn:{discoveredAt:'2026-09-22T00:00:00Z'}},rules:[{id:'r',name:'努力',xp:3,coins:2,points:1}],products:[{id:'p',name:'獎勵',cost:3}]}));
 const recovery=new Map();c.LocalRecovery={put:async(k,v)=>recovery.set(k,structuredClone(v)),get:async k=>recovery.get(k)};
 return {c,db,storage,save,recovery,notices,petErrors,syncConflicts,s:c.CloudSafety};
}
// 學期封存：封存讀的是同步快照（不是舊集合），存好讀回驗證後才清空，清空只改本機再同步。
const P='users/teacher/classes/A/';
const pets=c=>{c.ClassPets={xpFor:(id,h,carry)=>carry+h.filter(r=>String(r.studentId)===String(id)).reduce((a,r)=>a+(Number(r.petXp)||0),0),coinsFor:(id,h,carry)=>carry+h.filter(r=>String(r.studentId)===String(id)).reduce((a,r)=>a+(Number(r.coinDelta)||0),0)};};
const legacySeed=db=>{db.data.set(P+'students/1',{name:'舊名單',points:999});db.data.set(P+'pointsHistory/old',{studentId:1,points:999});db.data.set(P+'homeworks/h',{name:'舊作業'});};
const legacyIntact=db=>{assert.equal(db.data.get(P+'students/1').points,999);assert.ok(db.data.get(P+'pointsHistory/old'));assert.ok(db.data.get(P+'homeworks/h'));};
const archives=db=>[...db.data.keys()].filter(k=>k.startsWith(P+'archives/')&&k.split('/').length===P.split('/').length+1);
let passed=0;async function test(name,fn){await fn();console.log('PASS',name);passed++;}
(async()=>{
 await test('封存的是目前完整資料，不是舊集合；讀回比對一致',async()=>{
  const a=setup();pets(a.c);await a.s.publish();legacySeed(a.db);
  a.c.students[0].points=37;a.save();a.storage.setItem('notebookEntries-A',JSON.stringify([{id:5,date:'2026-10-06',content:'帶水壺'}]));
  const r=await a.c.SemesterArchive.archiveSemester('2026-S1',{});
  assert.equal(r.archiveId,'2026-S1');assert.equal(r.studentCount,1);assert.equal(r.totalPoints,37);assert.equal(r.notebookCount,1);
  const head=a.db.data.get(P+"archives/2026-S1");assert.equal(head.schema,1);assert.equal(head.archiveKey,'2026-S1');
  const json=Array.from({length:head.count},(_,i)=>a.db.data.get(P+'archives/2026-S1/parts/'+i).text).join('');
  const values=JSON.parse(json).values;assert.equal(JSON.parse(values['students-A']??values.students)[0].points,37);
  assert.equal(a.s.status(),'synced');legacyIntact(a.db);assert.equal(a.c.students[0].points,37);
 });
 await test('清空分數：本機歸零並同步，寵物成長轉期初值，舊集合不動',async()=>{
  const a=setup();pets(a.c);a.c.groups=[{id:'g',name:'一組',score:8,members:[]}];a.save();await a.s.publish();legacySeed(a.db);
  const r=await a.c.SemesterArchive.archiveSemester('2026-S1',{clearScores:true});
  assert.equal(JSON.stringify(r.cleared),'["清空分數"]');assert.equal(r.synced,true);
  assert.equal(a.c.students[0].points,0);assert.equal(a.c.groups[0].score,0);assert.equal(a.c.pointsHistory.length,0);
  assert.equal(a.c.students[0].petCarryXp,14);assert.equal(a.c.students[0].petCarryCoins,9);
  assert.equal(JSON.parse(a.storage.getItem('students-A'))[0].points,0);
  const remote=a.s.dataFor((await a.s.read()).values);assert.equal(remote.students[0].points,0);assert.equal(remote.pointsHistory.length,0);
  const head=a.db.data.get(P+'archives/2026-S1');assert.equal(head.pointsHistoryCount,3);assert.equal(head.totalPoints,10);
  legacyIntact(a.db);assert.ok(a.recovery.get('teacher:A'),'清空前留還原前副本');
 });
 await test('清空作業與聯絡簿只動本機三個鍵',async()=>{
  const a=setup();pets(a.c);await a.s.publish();
  a.storage.setItem('homeworkList-A','[{"id":1,"name":"習作"}]');a.storage.setItem('homeworkChecks-A','{"1":{"1":"completed"}}');a.storage.setItem('notebookEntries-A','[{"id":2}]');
  a.c.homeworkList=[{id:1}];a.c.notebookEntries=[{id:2}];
  await a.c.SemesterArchive.archiveSemester('2026-S1',{clearHomework:true});
  for(const k of ['homeworkList-A','notebookEntries-A'])assert.equal(a.storage.getItem(k),'[]');assert.equal(a.storage.getItem('homeworkChecks-A'),'{}');
  assert.equal(a.c.students[0].points,10,'沒勾清空分數就不動分數');assert.equal(a.c.homeworkList.length,0);
 });
 await test('雲端與本機有衝突時直接停下，不封存也不清空',async()=>{
  const a=setup();pets(a.c);await a.s.publish();const b=setup(a.db);await b.s.restore(await b.s.read());b.c.students[0].points=50;b.save();await b.s.publish();
  a.c.students[0].points=11;a.save();
  await assert.rejects(a.c.SemesterArchive.archiveSemester('2026-S1',{clearScores:true}),/不一致/);
  assert.equal(archives(a.db).length,0);assert.equal(a.c.students[0].points,11);assert.equal(a.c.pointsHistory.length,3);
 });
 await test('離線時不封存',async()=>{
  const a=setup();a.c.navigator.onLine=false;
  await assert.rejects(a.c.SemesterArchive.archiveSemester('2026-S1',{clearScores:true}),/離線/);assert.equal(archives(a.db).length,0);assert.equal(a.c.students[0].points,10);
 });
 await test('同名封存不覆蓋（含舊格式），另存一份',async()=>{
  const a=setup();pets(a.c);await a.s.publish();a.db.data.set(P+'archives/2026-S1/meta/info',{archiveKey:'2026-S1'});
  const r=await a.c.SemesterArchive.archiveSemester('2026-S1',{});assert.notEqual(r.archiveId,'2026-S1');assert.match(r.archiveId,/^2026-S1_\d{8}-\d{6}$/);
  assert.equal(a.db.data.get(P+'archives/2026-S1/meta/info').archiveKey,'2026-S1');
  const r2=await a.c.SemesterArchive.archiveSemester('2026-S2',{});assert.equal(r2.archiveId,'2026-S2');
  const list=await a.c.SemesterArchive.listArchives();assert.equal(list.length,2);
 });
 await test('清空寫入失敗：封存保留、本機資料原封不動',async()=>{
  const a=setup();pets(a.c);await a.s.publish();a.storage.failKey='groups-A';
  await assert.rejects(a.c.SemesterArchive.archiveSemester('2026-S1',{clearScores:true}),/封存已完成/);
  assert.equal(archives(a.db).length,1);assert.equal(a.c.students[0].points,10);assert.equal(JSON.parse(a.storage.getItem('students-A'))[0].points,10);assert.equal(a.c.pointsHistory.length,3);
 });
 await test('封存分段損毀時讀回驗證失敗，不清空',async()=>{
  const a=setup();pets(a.c);await a.s.publish();const orig=a.db.batch.bind(a.db);
  a.db.batch=()=>{const b=orig();const set=b.set;b.set=(r,d)=>set(r,r.path.includes('/archives/')?{...d,text:d.text+'x'}:d);return b;};
  await assert.rejects(a.c.SemesterArchive.archiveSemester('2026-S1',{clearScores:true}),/完整性/);
  assert.equal(a.c.students[0].points,10);
 });
 await test('已封存的學期可下載 Excel 資料（含當時分數）',async()=>{
  const a=setup();pets(a.c);await a.s.publish();await a.c.SemesterArchive.archiveSemester('2026-S1',{clearScores:true});
  let got=null;a.c.DataBackup.exportJSON=d=>{got=d;};
  await a.c.SemesterArchive.downloadArchive('2026-S1');assert.equal(got.students[0].points,10);assert.equal(got.pointsHistory.length,3);
 });
 await test('另一分頁改過資料（本分頁記憶體過期）時，清空以封存的資料為準，不會蓋掉新學生',async()=>{
  const a=setup();pets(a.c);await a.s.publish();
  const fresh=JSON.parse(a.storage.getItem('students-A'));fresh.push({id:2,name:'新同學',points:3,petCarryXp:0,petCarryCoins:0});a.storage.setItem('students-A',JSON.stringify(fresh));
  const h=JSON.parse(a.storage.getItem('pointsHistory-A'));h.unshift({id:'b-tab',studentId:2,points:3,petEvent:true,petXp:3,coinDelta:3});a.storage.setItem('pointsHistory-A',JSON.stringify(h));
  // 本分頁的 window.students 還是只有 1 位（過期）
  await a.c.SemesterArchive.archiveSemester('2026-S1',{clearScores:true});
  const saved=JSON.parse(a.storage.getItem('students-A'));assert.equal(saved.length,2);assert.equal(saved[1].name,'新同學');assert.equal(saved[1].petCarryXp,3);assert.equal(saved[1].petCarryCoins,3);
  assert.equal(a.c.students.length,2,'畫面也換成最新名單');
 });
 await test('待交付的金幣兌換保留，期初金幣不重複扣',async()=>{
  const a=setup();pets(a.c);
  a.c.pointsHistory.unshift({id:'pending',studentId:1,points:0,petEvent:true,petXp:0,coinDelta:-2,petShopType:'redeem',productCost:2},{id:'done',studentId:1,points:0,petEvent:true,petXp:0,coinDelta:-1,petShopType:'redeem',productCost:1,petDeliveredAt:'2026-10-01'});a.save();await a.s.publish();
  const before=a.c.ClassPets.coinsFor(1,JSON.parse(a.storage.getItem('pointsHistory-A')),2);
  await a.c.SemesterArchive.archiveSemester('2026-S1',{clearScores:true});
  const hist=JSON.parse(a.storage.getItem('pointsHistory-A'));assert.equal(hist.length,1);assert.equal(hist[0].id,'pending');
  const s=JSON.parse(a.storage.getItem('students-A'))[0];assert.equal(a.c.ClassPets.coinsFor(1,hist,s.petCarryCoins),before,'清空前後可用金幣一樣');
 });
 await test('沒用 Google 登入（匿名）不能封存',async()=>{
  const a=setup();a.c.FirebaseConfig.isGoogleUser=()=>false;
  await assert.rejects(a.c.SemesterArchive.archiveSemester('2026-S1',{clearScores:true}),/Google/);assert.equal(archives(a.db).length,0);assert.equal(a.c.students[0].points,10);
 });
 await test('預設班級（default）清空寫回不帶班級後綴的鍵',async()=>{
  const a=setup(undefined,'default');pets(a.c);a.c.STUDENTS_KEY='students';a.c.GROUPS_KEY='groups';a.c.POINTS_HISTORY_KEY='pointsHistory';
  for(const k of ['students','groups','pointsHistory'])a.storage.setItem(k,JSON.stringify(a.c[k]));await a.s.publish();
  await a.c.SemesterArchive.archiveSemester('2026-S1',{clearScores:true});
  assert.equal(JSON.parse(a.storage.getItem('students'))[0].points,0);assert.equal(JSON.parse(a.storage.getItem('students-default'))[0].points,10,'沒寫到帶後綴的鍵');
  assert.ok(a.db.data.get('users/teacher/archives/2026-S1'));
 });
 console.log(passed+' semester archive checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
