// 清理殘留班級前的備份：必須涵蓋 recursiveDelete 會刪到的每一層。
const assert = require('node:assert/strict');
const { dumpTree, buildDump, verifyDump, MAX_DEPTH } = require('../functions/purge-backup');

// 假的 Admin Firestore：只存「有資料的文件」路徑，子集合由路徑推得（和真的一樣會有「本身不存在、底下有東西」的文件）
function fakeDb(paths) {
  const data = new Map(Object.entries(paths));
  const childCollections = (docPath) => {
    const names = new Set();
    for (const p of data.keys()) if (p.startsWith(docPath + '/')) names.add(p.slice(docPath.length + 1).split('/')[0]);
    return [...names];
  };
  const docRef = (path) => ({
    path,
    async get() { return { exists: data.has(path), data: () => structuredClone(data.get(path)) }; },
    async listCollections() { return childCollections(path).map((name) => colRef(path + '/' + name)); },
  });
  const colRef = (path) => ({
    path,
    async listDocuments() {
      const ids = new Set();
      for (const p of data.keys()) if (p.startsWith(path + '/')) ids.add(p.slice(path.length + 1).split('/')[0]);
      return [...ids].map((id) => docRef(path + '/' + id));
    },
  });
  return { doc: docRef, data };
}

let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS', name); }

(async () => {
  const C = 'users/u/classes/1700000000000';
  const tree = {
    [C]: { name: '三年甲班' },
    [C + '/students/1']: { name: '小明' },
    [C + '/pointsHistory/p1']: { points: 1 },
    [C + '/notebooks/n1']: { content: '帶水壺' },
    [C + '/classAnnouncements/a1']: { text: '公告' },
    [C + '/appSettings/pets']: { data: { enabled: true } },
    // 封存：archives/2025-S2 本身不存在，只有底下的 meta/info 與 students（舊格式）
    [C + '/archives/2025-S2/meta/info']: { archiveKey: '2025-S2' },
    [C + '/archives/2025-S2/students/1']: { name: '小明', points: 30 },
    // 新格式封存：表頭 + parts
    [C + '/archives/2026-S1']: { schema: 1, count: 1 },
    [C + '/archives/2026-S1/parts/0']: { index: 0, text: '{}' },
    // 另一個班不能被讀進來
    ['users/u/classes/other/students/9']: { name: '別班' },
  };

  await test('整棵子集合都備份到（含不存在的父文件底下、第二三層、名稱不在舊名單的集合）', async () => {
    const db = fakeDb(tree);
    const docs = await dumpTree(db.doc(C));
    const paths = docs.map((d) => d.path).sort();
    const expected = Object.keys(tree).filter((p) => p.startsWith(C + '/')).sort();
    assert.deepEqual(paths, expected);
    assert.ok(!paths.some((p) => p.includes('/other/')), '不能讀到別班');
    assert.equal(docs.find((d) => d.path.endsWith('/notebooks/n1')).data.content, '帶水壺');
  });

  await test('備份檔有完整路徑與統計，讀回核對通過', async () => {
    const db = fakeDb(tree);
    const docs = await dumpTree(db.doc(C));
    const dump = buildDump({ uid: 'u', classId: '1700000000000', classPath: C, marker: { name: '三年甲班' }, docs, purgedBy: 'admin', at: '2026-10-06T00:00:00Z' });
    assert.equal(dump.format, 2);
    assert.equal(dump.docCount, 9);
    assert.equal(dump.counts.archives, 4);
    assert.equal(dump.counts.notebooks, 1);
    assert.equal(verifyDump(JSON.stringify(dump), docs).docCount, 9);
  });

  await test('備份檔缺文件、數量不符或壞掉時拒絕（就不會刪）', async () => {
    const db = fakeDb(tree);
    const docs = await dumpTree(db.doc(C));
    const dump = buildDump({ uid: 'u', classId: 'x', classPath: C, docs, purgedBy: 'a', at: 't' });
    const short = { ...dump, documents: dump.documents.slice(1) };
    assert.throws(() => verifyDump(JSON.stringify(short), docs), /文件數不符/);
    const swapped = { ...dump, documents: dump.documents.map((d, i) => (i === 0 ? { ...d, path: d.path + 'x' } : d)) };
    assert.throws(() => verifyDump(JSON.stringify(swapped), docs), /缺少文件/);
    assert.throws(() => verifyDump(JSON.stringify(dump).slice(0, -5), docs), /無法解析/);
    assert.throws(() => verifyDump(JSON.stringify({ ...dump, format: 1 }), docs), /格式不符/);
  });

  await test('層數異常深時停止備份', async () => {
    let p = C;
    for (let i = 0; i <= MAX_DEPTH + 1; i++) p += `/c${i}/d${i}`;
    const db = fakeDb({ [p]: { deep: true } });
    await assert.rejects(dumpTree(db.doc(C)), /層數超過/);
  });

  await test('空的班級（只有 marker）備份 0 筆也能核對', async () => {
    const db = fakeDb({ [C]: { name: 'x' } });
    const docs = await dumpTree(db.doc(C));
    assert.equal(docs.length, 0);
    const dump = buildDump({ uid: 'u', classId: 'x', classPath: C, marker: { name: 'x' }, docs, purgedBy: 'a', at: 't' });
    assert.equal(verifyDump(JSON.stringify(dump), docs).docCount, 0);
  });

  console.log(passed + ' purge backup checks passed');
})().catch((e) => { console.error(e); process.exitCode = 1; });
