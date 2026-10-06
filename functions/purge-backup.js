'use strict';

/**
 * 清理殘留班級前的完整備份。
 *
 * 舊版只照一份寫死的集合名單備份第一層，名單又和實際名稱對不上（聯絡簿是 notebooks、
 * 公告是 classAnnouncements），封存的 archives/{id}/parts 這種第二層也完全沒備到，
 * 接著 recursiveDelete 卻會把「所有層」刪光——沒備到的就永遠救不回來。
 * 這裡改成依實際存在的子集合一路往下走，每一份文件都以完整路徑存下來。
 */

const MAX_DEPTH = 8;
const CONCURRENCY = 20;

async function inChunks(items, fn) {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    await Promise.all(items.slice(i, i + CONCURRENCY).map(fn));
  }
}

/**
 * 把某份文件底下的所有子集合（任意深度）讀成 [{ path, data }]。
 * 用 listDocuments 才找得到「本身不存在、但底下還有子集合」的文件（例如 archives/{id}）。
 */
async function dumpTree(docRef, out = [], depth = 0) {
  if (depth > MAX_DEPTH) throw new Error(`子集合層數超過 ${MAX_DEPTH} 層，為安全起見停止備份：${docRef.path}`);
  const collections = await docRef.listCollections();
  for (const col of collections) {
    const refs = await col.listDocuments();
    await inChunks(refs, async (ref) => {
      const snap = await ref.get();
      if (snap.exists) out.push({ path: ref.path, data: snap.data() });
      await dumpTree(ref, out, depth + 1);
    });
  }
  return out;
}

/** 依集合名稱統計（第一層），給維運後台與紀錄看。 */
function countByCollection(classPath, docs) {
  const counts = {};
  const prefix = classPath + '/';
  docs.forEach(({ path }) => {
    if (!path.startsWith(prefix)) return;
    const name = path.slice(prefix.length).split('/')[0];
    counts[name] = (counts[name] || 0) + 1;
  });
  return counts;
}

/**
 * 備份檔內容。format 2：documents 是完整路徑清單（含所有層），
 * 還原時照 path 寫回即可。
 */
function buildDump({ uid, classId, classPath, marker, docs, purgedBy, at }) {
  return {
    format: 2,
    uid,
    classId,
    classPath,
    purgedAt: at,
    purgedBy,
    marker: marker === undefined ? null : marker,
    docCount: docs.length,
    counts: countByCollection(classPath, docs),
    documents: docs.slice().sort((a, b) => a.path.localeCompare(b.path)),
  };
}

/** 讀回上傳的備份檔，確認可解析且每一份文件都在，才允許刪除。 */
function verifyDump(text, docs) {
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { throw new Error('備份檔讀回後無法解析'); }
  if (!parsed || parsed.format !== 2 || !Array.isArray(parsed.documents)) throw new Error('備份檔格式不符');
  if (parsed.documents.length !== docs.length || parsed.docCount !== docs.length) throw new Error('備份檔文件數不符');
  const saved = new Set(parsed.documents.map((d) => d && d.path));
  const missing = docs.find((d) => !saved.has(d.path));
  if (missing) throw new Error('備份檔缺少文件：' + missing.path);
  return parsed;
}

module.exports = { dumpTree, countByCollection, buildDump, verifyDump, MAX_DEPTH };
