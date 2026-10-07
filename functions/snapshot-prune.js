'use strict';

/**
 * 同步快照的定期清理規則（純函式，無 Firestore I/O，方便測試與離線模擬）。
 *
 * 背景：js/cloud-safety.js 每次上傳都寫一份新的完整快照
 *   <班級根>/syncSnapshots/{token}/parts/{i}
 * 再把 <班級根>/appSettings/syncRevision 指向它；舊快照從不刪，資料庫因此每天長大。
 * （班級根：預設班級是 users/{uid}，其他班級是 users/{uid}/classes/{classId}）
 *
 * 保留規則（任一成立就保留）：
 *   1. 目前的版本（syncRevision.token）——老師再久沒上傳也不刪，那是唯一的雲端版本
 *   2. 上一個版本（syncRevision.previous）
 *   3. 被新版取代還不到 KEEP_DAYS 天的版本（「這週內曾經是最新的」都留著）
 *   4. 比目前版本還新、但從沒成為最新的（上傳途中失敗留下的）只在 KEEP_DAYS 天內保留
 * 版本資訊讀不到、目前版本不在清單裡、或目前版本分段不完整：整個班級跳過，什麼都不刪。
 */

const KEEP_DAYS = 7;
const DAY_MS = 86400000;
const KEEP_MS = KEEP_DAYS * DAY_MS;

/**
 * 把 parts 文件依「班級根 → 快照 token」分組。
 * 只認得 users/{uid}[/classes/{id}]/syncSnapshots/{token}/parts/{i}；
 * 學期封存的 archives/{key}/parts 等其他 parts 一律忽略。
 *
 * @param {{ path: string, createMs: number }[]} parts
 * @returns {Map<string, Map<string, { token: string, createdMs: number, paths: string[] }>>}
 */
function groupSnapshotParts(parts) {
  const roots = new Map();
  for (const part of Array.isArray(parts) ? parts : []) {
    const seg = String(part?.path || '').split('/');
    const createMs = Number(part?.createMs);
    if (!Number.isFinite(createMs)) continue;
    let rootLen;
    if (seg.length === 6 && seg[0] === 'users') rootLen = 2;
    else if (seg.length === 8 && seg[0] === 'users' && seg[2] === 'classes') rootLen = 4;
    else continue;
    if (seg[rootLen] !== 'syncSnapshots' || seg[rootLen + 2] !== 'parts') continue;
    if (seg.some((s) => !s)) continue;

    const root = seg.slice(0, rootLen).join('/');
    const token = seg[rootLen + 1];
    if (!roots.has(root)) roots.set(root, new Map());
    const snaps = roots.get(root);
    const snap = snaps.get(token) || { token, createdMs: createMs, paths: [] };
    snap.createdMs = Math.min(snap.createdMs, createMs);
    snap.paths.push(part.path);
    snaps.set(token, snap);
  }
  return roots;
}

/**
 * 決定一個班級要刪哪些快照。
 *
 * @param {{ snapshots: { token: string, createdMs: number, paths: string[] }[],
 *           head: { token?: string, previous?: string|null, count?: number } | null,
 *           nowMs: number, keepMs?: number }} input
 * @returns {{ action: 'skip', reason: string } | { action: 'prune', remove: string[], keep: string[] }}
 */
function planClassPrune({ snapshots, head, nowMs, keepMs = KEEP_MS }) {
  if (!Number.isFinite(keepMs) || keepMs < DAY_MS) throw new Error('保留時間不可少於 1 天');
  if (!Number.isFinite(nowMs)) throw new Error('缺少目前時間');
  const list = (Array.isArray(snapshots) ? snapshots : [])
    .slice()
    .sort((a, b) => a.createdMs - b.createdMs || (a.token < b.token ? -1 : a.token > b.token ? 1 : 0));

  if (!head || typeof head.token !== 'string' || !head.token) return { action: 'skip', reason: 'no-head' };
  const current = list.find((s) => s.token === head.token);
  if (!current) return { action: 'skip', reason: 'head-missing' };
  if (!Number.isSafeInteger(head.count) || current.paths.length !== head.count) {
    return { action: 'skip', reason: 'head-incomplete' };
  }

  const cutoff = nowMs - keepMs;
  const currentIndex = list.indexOf(current);
  const remove = [], keep = [];
  list.forEach((snap, i) => {
    if (snap.token === head.token || snap.token === head.previous) { keep.push(snap.token); return; }
    // 排在目前版本之後：上傳途中失敗、從沒成為最新的分段，用它自己的建立時間判斷
    // 排在目前版本之前：用「下一份出現的時間」當作被取代的時間
    const replacedMs = i > currentIndex ? snap.createdMs : list[i + 1].createdMs;
    (replacedMs < cutoff ? remove : keep).push(snap.token);
  });
  return { action: 'prune', remove, keep };
}

module.exports = { KEEP_DAYS, KEEP_MS, groupSnapshotParts, planClassPrune };
