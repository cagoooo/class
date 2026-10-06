/**
 * semester-archive.js
 * Q01：學期資料自動封存模組（Semester Archive）
 *
 * 功能：
 *  - 一鍵將目前班級所有資料封存至 Firebase archives/ 路徑
 *  - 封存內容為同步快照的完整班級資料，寫入後讀回驗證；確認完整才依選項清空（只改本機再同步）
 *  - 支援查閱歷史學期（僅供參考，Q02 延伸）
 *  - 完整整合多班級系統（v3.0.1+）
 *
 * 使用方式：
 *  在 classnew.html 加入 <script src="./js/semester-archive.js"> 後，
 *  SemesterArchive.openUI() 可呼叫封存 Modal。
 *
 * @version 3.53.0
 */

const SemesterArchive = (() => {
    'use strict';

    // ─── 常數 ───────────────────────────────────────────────
    const CURRENT_YEAR = new Date().getFullYear();
    const CURRENT_MONTH = new Date().getMonth() + 1;
    // 台灣學制：2～7月為下學期(S2)，8月～隔年1月為上學期(S1)
    const CURRENT_SEMESTER = (CURRENT_MONTH >= 2 && CURRENT_MONTH <= 7) ? 'S2' : 'S1';
    const DEFAULT_ARCHIVE_KEY = `${CURRENT_YEAR}-${CURRENT_SEMESTER}`;

    // 取得目前班級 ID（支援多班級）
    function getCurClassId() {
        return localStorage.getItem('currentClassId') || 'default';
    }

    // 取得此班級的 Firebase 基底參照
    function getClassBaseRef() {
        const db = window.FirebaseConfig?.getDb();
        const uid = window.FirebaseConfig?.getCurrentUserId();
        if (!db || !uid) return null;
        const classId = getCurClassId();
        if (classId === 'default') {
            return db.collection('users').doc(uid);
        }
        return db.collection('users').doc(uid).collection('classes').doc(classId);
    }

    // ─── 核心：執行封存 ────────────────────────────────────
    // v3.53.0 重寫：班級資料早已改存在「同步快照」（appSettings/syncRevision + syncSnapshots），
    // 舊版封存卻去讀 students／pointsHistory 等舊集合（新版程式不再更新，常常是空的或很舊），
    // 還把真正的分數清掉——等於把空箱子封起來再擦黑板。現在的流程：
    //   1. 先把這台的資料同步上雲端（有衝突就停，不封存一份沒對齊的資料）
    //   2. 封存內容 = 剛同步好的完整班級資料（所有區塊），分段寫進 archives/{key}/parts
    //   3. 從伺服器讀回比對檢查碼，確認完整才繼續
    //   4. 要清空時只改本機，再走正常同步；舊集合一律不碰
    const PART_SIZE = 60000;

    function syncErrorMessage(e) {
        if (e?.code === 'sync-conflict') return '雲端與這台電腦的資料不一致，請先點右上角的同步圖示處理差異，再封存。';
        if (e?.code === 'sync-busy') return '另一個分頁正在同步，請稍候再試一次。';
        if (e?.code === 'sync-auth-required') return '請先登入 Google 帳號後再封存。';
        if (window.CloudSafety?.isOfflineWait?.(e)) return '目前離線，請恢復連線後再封存。';
        return '同步失敗：' + (e?.message || '未知錯誤');
    }

    function stampNow() {
        const d = new Date(), p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    }

    // 已有同名封存（新格式或舊格式）就另存一份，絕不覆蓋
    async function freeArchiveRef(base, archiveKey) {
        const col = base.collection('archives');
        const taken = async id => {
            const ref = col.doc(id);
            const [head, oldMeta] = await Promise.all([
                ref.get({ source: 'server' }),
                ref.collection('meta').doc('info').get({ source: 'server' }),
            ]);
            return head.exists || oldMeta.exists;
        };
        if (!(await taken(archiveKey))) return col.doc(archiveKey);
        const alt = `${archiveKey}_${stampNow()}`;
        if (await taken(alt)) throw new Error('同名封存已存在，請稍後再試');
        return col.doc(alt);
    }

    function summarize(data) {
        const students = Array.isArray(data.students) ? data.students : [];
        const totalPoints = students.reduce((a, s) => a + (Number(s.points ?? s.score) || 0), 0);
        return {
            studentCount: students.length,
            pointsHistoryCount: Array.isArray(data.pointsHistory) ? data.pointsHistory.length : 0,
            notebookCount: Array.isArray(data.notebookEntries) ? data.notebookEntries.length : 0,
            homeworkCount: Array.isArray(data.homeworkList) ? data.homeworkList.length : 0,
            totalPoints,
            avgPoints: students.length ? Number((totalPoints / students.length).toFixed(1)) : 0,
        };
    }

    /** 從伺服器讀回一份封存並驗證完整性，回傳 { head, values }。 */
    async function readArchive(ref) {
        const head = await ref.get({ source: 'server' });
        if (!head.exists) throw new Error('找不到這份封存');
        const h = head.data();
        if (h.schema !== 1 || !Number.isSafeInteger(h.count) || h.count < 1 || h.count > 200) throw new Error('封存格式無法讀取');
        const parts = await Promise.all(Array.from({ length: h.count }, (_, i) => ref.collection('parts').doc(String(i)).get({ source: 'server' })));
        if (parts.some((p, i) => !p.exists || p.data().index !== i || typeof p.data().text !== 'string')) throw new Error('封存分段不完整');
        const json = parts.map(p => p.data().text).join('');
        if (BackupIntegrity.checksum(json) !== h.checksum) throw new Error('封存完整性檢查失敗');
        const payload = JSON.parse(json);
        return { head: h, values: payload.values || {} };
    }

    /**
     * @param {string} archiveKey 例如 "2025-S2"
     * @param {Object} options { clearScores, clearHomework, excel }
     */
    async function archiveSemester(archiveKey, options = {}) {
        const base = getClassBaseRef();
        // 匿名身分換成 Google 登入後 uid 會變，封存會找不回來：一定要 Google 帳號
        if (!base || !window.FirebaseConfig?.isGoogleUser?.()) throw new Error('請先登入 Google 帳號後再執行封存');
        if (!window.CloudSafety || !window.BackupIntegrity) throw new Error('同步模組尚未載入，請重新整理後再試');
        const classId = getCurClassId();

        typeof LoadingIndicator !== 'undefined' && LoadingIndicator.show('📦 正在封存學期資料...');
        try {
            // ── 1. 先同步：封存的一定是雲端最新、和這台一致的版本 ──
            try { await CloudSafety.publish(classId); }
            catch (e) { throw new Error(syncErrorMessage(e)); }
            if (getCurClassId() !== classId) throw new Error('封存期間切換了班級，已停止');

            // ── 2. 封存內容：完整班級資料（學生、分數紀錄、小組、作業、聯絡簿、寵物、考試…）──
            const values = CloudSafety.capture(classId);
            const data = CloudSafety.dataFor(values);
            const stats = summarize(data);
            const json = JSON.stringify({ schema: 1, classId, values });
            const parts = BackupIntegrity.split(json, PART_SIZE);
            if (parts.length > 200) throw new Error('資料量太大，無法封存到雲端，請改用「完整資料備份」匯出 Excel');
            const checksum = BackupIntegrity.checksum(json);

            const archiveRef = await freeArchiveRef(base, archiveKey);
            const db = window.FirebaseConfig.getDb();
            for (let start = 0; start < parts.length; start += 20) {
                const batch = db.batch();
                for (let i = start; i < Math.min(start + 20, parts.length); i++) {
                    batch.set(archiveRef.collection('parts').doc(String(i)), { index: i, text: parts[i] });
                }
                await batch.commit();
            }
            // 分段都寫好才寫表頭：中途失敗不會留下一份看起來完整的封存
            let className = '';
            try { className = window.ClassProfiles?.currentProfile?.()?.name || ''; } catch (e) { /* 名稱只是顯示用 */ }
            await archiveRef.set({
                schema: 1,
                archiveKey,
                archiveId: archiveRef.id,
                classId,
                className,
                semesterLabel: _buildSemesterLabel(archiveKey),
                archivedAt: firebase.firestore.FieldValue.serverTimestamp(),
                at: new Date().toISOString(),
                appVersion: window.APP_VERSION || '',
                count: parts.length,
                checksum,
                ...stats,
            });

            // ── 3. 讀回驗證：確定雲端那份完整、和這台一模一樣 ──
            const check = await readArchive(archiveRef);
            if (CloudSafety.fingerprint(check.values) !== CloudSafety.fingerprint(values)) {
                throw new Error('封存讀回比對不一致');
            }
            console.log(`[SemesterArchive] ✅ 封存完成並驗證: ${archiveRef.id}（${stats.studentCount} 位學生）`);

            // ── 4. Excel 備份（老師期末要登成績；封存當下的資料）──
            if (options.excel) downloadExcel(data);

            // ── 5. 依選項清空本學期資料（只改本機，再正常同步）──
            const cleared = [];
            let synced = true;
            if (options.clearScores || options.clearHomework) {
                try { await CloudSafety.checkpoint(classId); } catch (e) { /* 封存已驗證，還原前副本只是多一層保險 */ }
                // 檢查與寫入之間不能再有 await：另一個分頁可能切班或加分
                if (getCurClassId() !== classId) throw new Error('封存期間切換了班級，已停止清空（封存已完成）');
                if (CloudSafety.fingerprint(CloudSafety.capture(classId)) !== CloudSafety.fingerprint(values)) {
                    throw new Error('封存期間班級資料有變動，為安全起見沒有清空（封存已完成），請再確認一次');
                }
                if (!clearLocal(classId, data, options)) throw new Error('清空沒有存檔，資料維持原狀（封存已完成）');
                if (options.clearScores) cleared.push('清空分數');
                if (options.clearHomework) cleared.push('清空作業與聯絡簿');
                CloudSafety.markLocalChange?.(classId);
                try { await CloudSafety.publish(classId); }
                catch (e) {
                    console.warn('[SemesterArchive] 清空後同步未完成:', e);
                    if (e?.code === 'sync-conflict') {
                        synced = 'conflict';
                        try { CloudSafety.report(e, classId, true); } catch (err) { /* 只是標記同步圖示 */ }
                    } else synced = false;
                }
            }

            return { success: true, archiveKey, archiveId: archiveRef.id, ...stats, cleared, synced };
        } finally {
            typeof LoadingIndicator !== 'undefined' && LoadingIndicator.hide();
        }
    }

    // 本機清空：以剛封存並驗證過的資料為準（不是這個分頁記憶體裡可能過期的陣列），
    // 先算好新內容、寫進「封存那一班」的鍵；沒存成功就什麼都不變
    function clearLocal(classId, data, options) {
        const keyFor = k => classId === 'default' ? k : `${k}-${classId}`;
        const ops = [];
        const next = {};
        if (options.clearScores) {
            const history = Array.isArray(data.pointsHistory) ? data.pointsHistory : [];
            // 還沒交付、也沒退幣的金幣兌換要留著，老師才能在商店交付或退幣
            const refunded = new Set(history.filter(r => r && r.petShopType === 'refund' && r.petReverses != null).map(r => String(r.petReverses)));
            const kept = history.filter(r => r && r.petShopType === 'redeem' && !r.petDeliveredAt && !refunded.has(String(r.id)));
            const removed = history.filter(r => !kept.includes(r));
            // 清掉的明細轉成寵物期初值（成長、金幣），寵物不會回到蛋；留下的兌換不重複計算
            next.students = (Array.isArray(data.students) ? data.students : []).map(s => {
                const carryXp = Number(s.petCarryXp) || 0, carryCoins = Number(s.petCarryCoins) || 0;
                const copy = {
                    ...s,
                    points: 0,
                    score: 0,
                    petCarryXp: window.ClassPets ? ClassPets.xpFor(s.id, removed, carryXp) : carryXp,
                    petCarryCoins: window.ClassPets ? ClassPets.coinsFor(s.id, removed, carryCoins) : carryCoins,
                };
                if (Array.isArray(copy.records)) copy.records = [];
                return copy;
            });
            next.groups = (Array.isArray(data.groups) ? data.groups : []).map(g => ({ ...g, score: 0 }));
            next.pointsHistory = kept;
            ops.push([keyFor('students'), JSON.stringify(next.students)]);
            ops.push([keyFor('groups'), JSON.stringify(next.groups)]);
            ops.push([keyFor('pointsHistory'), JSON.stringify(next.pointsHistory)]);
        }
        if (options.clearHomework) {
            next.homeworkList = [];
            next.homeworkChecks = {};
            next.notebookEntries = [];
            ops.push([keyFor('homeworkList'), '[]'], [keyFor('homeworkChecks'), '{}'], [keyFor('notebookEntries'), '[]']);
        }
        if (!window.SafeStorage.writeRaw(ops, { context: '封存後清空本學期資料' })) return false;
        if (getCurClassId() !== classId) return true;   // 不是這頁顯示的班級就不動畫面
        // 這個分頁的畫面也換成剛寫入的內容（未清空的區塊沿用已驗證的資料，避免舊分頁蓋回去）
        Object.assign(window, {
            students: data.students || [], groups: data.groups || [], pointsHistory: data.pointsHistory || [],
            homeworkList: data.homeworkList || [], homeworkChecks: data.homeworkChecks || {}, notebookEntries: data.notebookEntries || [],
        }, next);
        for (const fn of ['renderStudents', 'renderGroups', 'renderPointsHistory', 'renderHomework', 'renderNotebook']) {
            try { if (typeof window[fn] === 'function') window[fn](); } catch (e) { console.warn('[SemesterArchive] 重新繪製失敗:', fn, e); }
        }
        try { window.ClassPets?.prepare?.(); window.ClassPets?.render?.(); } catch (e) { /* 寵物畫面下次開啟會重畫 */ }
        return true;
    }

    function downloadExcel(data) {
        try {
            const copy = { version: '1.1', exportDate: new Date().toISOString(), appVersion: window.APP_VERSION || '', ...data };
            if (typeof XLSX !== 'undefined') DataBackup.exportExcel(copy);
            else DataBackup.exportJSON(copy);
            return true;
        } catch (e) {
            console.warn('[SemesterArchive] 封存 Excel 下載失敗:', e);
            window.NotificationSystem?.warning?.('Excel 下載失敗，封存已完成，可稍後在「已封存的學期」重新下載');
            return false;
        }
    }

    // 建立學期標籤顯示文字
    function _buildSemesterLabel(key) {
        const [year, sem] = key.split('-');
        const semLabel = sem === 'S1' ? '上學期' : '下學期';
        return `${year} 學年 ${semLabel}`;
    }

    // ─── 讀取歷史封存列表 ─────────────────────────────────
    async function listArchives() {
        const base = getClassBaseRef();
        if (!base) return [];
        const snap = await base.collection('archives').get({ source: 'server' });
        return snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(a => a.schema === 1)
            .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    }

    async function downloadArchive(archiveId) {
        const base = getClassBaseRef();
        if (!base) throw new Error('請先登入 Google 帳號');
        const { values } = await readArchive(base.collection('archives').doc(archiveId));
        return downloadExcel(CloudSafety.dataFor(values));
    }

    // ─── UI 樣式注入 ──────────────────────────────────────
    function _injectStyles() {
        if (document.getElementById('semester-archive-styles')) return;
        const style = document.createElement('style');
        style.id = 'semester-archive-styles';
        style.textContent = `
/* ─── 學期封存 Modal 樣式 ─── */
#sa-modal-overlay {
    position: fixed; inset: 0; z-index: 9000;
    background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
    padding: 1rem;
    animation: sa-fade-in 0.2s ease;
}
@keyframes sa-fade-in { from { opacity:0; } to { opacity:1; } }

#sa-modal {
    background: white; border-radius: 1.25rem;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    width: 100%; max-width: 520px;
    overflow: hidden;
    animation: sa-slide-up 0.3s ease;
}
@keyframes sa-slide-up {
    from { opacity:0; transform: translateY(40px); }
    to   { opacity:1; transform: translateY(0); }
}

#sa-modal-header {
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: white; padding: 1.25rem 1.5rem;
    display: flex; align-items: center; justify-content: space-between;
}
#sa-modal-header h2 { font-size: 1.25rem; font-weight: 700; margin: 0; }
#sa-modal-close {
    background: rgba(255,255,255,0.2); border: none; color: white;
    width: 2rem; height: 2rem; border-radius: 50%; cursor: pointer;
    font-size: 1.25rem; display: flex; align-items: center; justify-content: center;
    transition: background 0.2s;
}
#sa-modal-close:hover { background: rgba(255,255,255,0.35); }

#sa-modal-body { padding: 1.5rem; }

.sa-stat-grid {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem; margin-bottom: 1.25rem;
}
.sa-stat-card {
    background: #f8fafc; border-radius: 0.75rem; padding: 0.75rem;
    text-align: center; border: 1px solid #e2e8f0;
}
.sa-stat-value { font-size: 1.5rem; font-weight: 800; color: #6366f1; }
.sa-stat-label { font-size: 0.7rem; color: #64748b; margin-top: 0.25rem; }

.sa-key-row {
    display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;
}
.sa-key-row label { font-size: 0.875rem; font-weight: 600; color: #374151; white-space: nowrap; }
.sa-key-row input {
    flex: 1; padding: 0.5rem 0.75rem; border: 1.5px solid #d1d5db;
    border-radius: 0.5rem; font-size: 0.875rem;
}
.sa-key-row input:focus { outline: none; border-color: #6366f1; }

.sa-options { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.25rem; }
.sa-option {
    display: flex; align-items: flex-start; gap: 0.75rem;
    padding: 0.75rem 1rem; border-radius: 0.75rem; border: 1.5px solid #e2e8f0;
    cursor: pointer; transition: all 0.2s;
}
.sa-option:has(input:checked) { border-color: #6366f1; background: #eef2ff; }
.sa-option input[type="checkbox"] { margin-top: 2px; accent-color: #6366f1; }
.sa-option-title { font-size: 0.875rem; font-weight: 600; color: #1f2937; }
.sa-option-desc { font-size: 0.75rem; color: #6b7280; margin-top: 0.125rem; }

.sa-warning {
    background: #fef3c7; border: 1px solid #fbbf24; border-radius: 0.75rem;
    padding: 0.75rem 1rem; font-size: 0.8rem; color: #92400e;
    margin-bottom: 1.25rem; display: flex; align-items: flex-start; gap: 0.5rem;
}

#sa-modal-footer {
    padding: 1rem 1.5rem; background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    display: flex; gap: 0.75rem; justify-content: flex-end;
}
#sa-btn-cancel {
    padding: 0.6rem 1.25rem; border-radius: 0.6rem;
    border: 1.5px solid #d1d5db; background: white;
    font-size: 0.875rem; cursor: pointer; color: #374151;
    transition: background 0.2s;
}
#sa-btn-cancel:hover { background: #f1f5f9; }
#sa-btn-confirm {
    padding: 0.6rem 1.5rem; border-radius: 0.6rem;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    border: none; color: white; font-weight: 700; font-size: 0.875rem;
    cursor: pointer; transition: opacity 0.2s;
}
#sa-btn-confirm:hover { opacity: 0.9; }
#sa-btn-confirm:disabled { opacity: 0.5; cursor: not-allowed; }
#sa-btn-confirm.sa-danger { background: linear-gradient(135deg, #dc2626, #b91c1c); }
#sa-modal { max-height: calc(100vh - 2rem); display: flex; flex-direction: column; }
#sa-modal-body { overflow-y: auto; }
.sa-intro { font-size: 0.85rem; color: #4b5563; margin: 0 0 1rem; }
.dark .sa-intro { color: #d1d5db; }
.sa-option-danger:has(input:checked) { border-color: #dc2626; background: #fef2f2; }
.sa-history { margin-top: 0.25rem; border: 1px solid #e2e8f0; border-radius: 0.75rem; padding: 0.5rem 0.75rem; }
.sa-history summary { cursor: pointer; font-size: 0.875rem; font-weight: 600; color: #374151; }
.sa-history-list { margin-top: 0.5rem; font-size: 0.8rem; color: #4b5563; display: flex; flex-direction: column; gap: 0.5rem; }
.sa-history-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
.sa-history-title { font-weight: 600; color: #1f2937; }
.sa-history-meta { font-size: 0.75rem; color: #64748b; }
.sa-history-btn { padding: 0.35rem 0.75rem; border-radius: 0.5rem; border: 1.5px solid #6366f1; background: white; color: #4f46e5; font-size: 0.8rem; cursor: pointer; }
.sa-history-btn:disabled { opacity: 0.5; cursor: wait; }
.dark #sa-modal, .dark #sa-modal-footer, .dark .sa-history-btn { background: #1f2937; color: #e5e7eb; }
.dark .sa-stat-card, .dark .sa-option { background: #111827; border-color: #374151; }
.dark .sa-option-title, .dark .sa-history-title, .dark .sa-history summary, .dark .sa-key-row label { color: #f3f4f6; }
.dark .sa-option-desc, .dark .sa-history-meta, .dark .sa-history-list, .dark .sa-stat-label { color: #9ca3af; }
.dark .sa-option:has(input:checked) { background: #1e1b4b; }
.dark .sa-option-danger:has(input:checked) { background: #450a0a; border-color: #f87171; }
.dark .sa-key-row input { background: #111827; color: #f3f4f6; border-color: #4b5563; }
@media (max-width: 480px) { .sa-stat-grid { gap: 0.5rem; } .sa-stat-value { font-size: 1.2rem; } #sa-modal-body { padding: 1rem; } }
        `;
        document.head.appendChild(style);
    }

    // ─── 開啟 UI 入口 ─────────────────────────────────────
    async function openUI() {
        if (!window.FirebaseConfig?.isConnected() || !window.FirebaseConfig?.isGoogleUser?.()) {
            typeof NotificationSystem !== 'undefined' &&
                NotificationSystem.warning('請先登入 Google 帳號後才能使用學期封存功能');
            return;
        }
        if (document.getElementById('sa-modal-overlay')) return;
        _injectStyles();

        // 取得目前統計（加扣分系統實際用的是 points）
        const stu = window.students || [];
        const pts = window.pointsHistory || [];
        const totalPts = stu.reduce((a, s) => a + (Number(s.points ?? s.score) || 0), 0);
        const opener = document.activeElement;

        const overlay = document.createElement('div');
        overlay.id = 'sa-modal-overlay';
        overlay.innerHTML = `
<div id="sa-modal" role="dialog" aria-modal="true" aria-labelledby="sa-modal-title">
  <div id="sa-modal-header">
    <h2 id="sa-modal-title">📦 學期資料封存</h2>
    <button id="sa-modal-close" title="關閉" aria-label="關閉">✕</button>
  </div>

  <div id="sa-modal-body">
    <p class="sa-intro">
      會先把這台電腦的資料同步到雲端，再把<strong>整個班級的完整資料</strong>（學生、分數紀錄、小組、作業、聯絡簿、寵物…）另存一份到雲端，存好會讀回檢查。
    </p>

    <!-- 本學期統計 -->
    <div class="sa-stat-grid">
      <div class="sa-stat-card">
        <div class="sa-stat-value">${stu.length}</div>
        <div class="sa-stat-label">學生人數</div>
      </div>
      <div class="sa-stat-card">
        <div class="sa-stat-value">${pts.length}</div>
        <div class="sa-stat-label">加扣分記錄</div>
      </div>
      <div class="sa-stat-card">
        <div class="sa-stat-value">${totalPts}</div>
        <div class="sa-stat-label">全班積分總計</div>
      </div>
    </div>

    <!-- 封存學期標籤 -->
    <div class="sa-key-row">
      <label for="sa-archive-key">📅 封存標籤</label>
      <input id="sa-archive-key" type="text" value="${DEFAULT_ARCHIVE_KEY}"
        placeholder="例如 2025-S2" maxlength="16" autocomplete="off">
    </div>

    <!-- 封存後操作選項 -->
    <div class="sa-options">
      <label class="sa-option">
        <input type="checkbox" id="sa-opt-excel" checked autocomplete="off">
        <div>
          <div class="sa-option-title">📊 同時下載 Excel 備份</div>
          <div class="sa-option-desc">含學生總表與加扣分明細，可直接登記成績；也能用「匯入備份」還原</div>
        </div>
      </label>
      <label class="sa-option sa-option-danger">
        <input type="checkbox" id="sa-opt-clear-scores" autocomplete="off">
        <div>
          <div class="sa-option-title">🔄 封存後清空分數，保留學生名單</div>
          <div class="sa-option-desc">學生與小組分數歸零、加扣分紀錄清空（寵物成長與金幣保留）——升下學期時使用</div>
        </div>
      </label>
      <label class="sa-option sa-option-danger">
        <input type="checkbox" id="sa-opt-clear-homework" autocomplete="off">
        <div>
          <div class="sa-option-title">📋 封存後清空作業與聯絡簿</div>
          <div class="sa-option-desc">一併清除舊學期的作業列表、繳交紀錄和聯絡簿</div>
        </div>
      </label>
    </div>

    <!-- 警告區塊 -->
    <div class="sa-warning" id="sa-warning">
      🛡️ <span>只有在封存<strong>確認完整存到雲端</strong>之後才會清空；同步有問題時會直接停下，不會動到任何資料。</span>
    </div>

    <!-- 已封存的學期 -->
    <details class="sa-history" id="sa-history">
      <summary>📂 已封存的學期</summary>
      <div id="sa-history-list" class="sa-history-list" aria-live="polite">讀取中…</div>
    </details>
  </div>

  <div id="sa-modal-footer">
    <button id="sa-btn-cancel">取消</button>
    <button id="sa-btn-confirm">📦 確認封存</button>
  </div>
</div>
        `;

        document.body.appendChild(overlay);
        const $ = sel => overlay.querySelector(sel);
        let busy = false;

        const close = () => {
            if (busy) return;
            document.removeEventListener('keydown', onKey, true);
            overlay.remove();
            if (opener && opener.isConnected) opener.focus?.({ preventScroll: true });
        };
        const onKey = e => {
            // 視窗開著時不讓全站快捷鍵（數字換頁、r 重置計時器、Ctrl+K 切班…）在背景觸發
            e.stopPropagation();
            if (busy) { if (e.key !== 'Tab') e.preventDefault(); return; }
            if (e.key === 'Escape') { e.preventDefault(); close(); return; }
            if (e.key === 'Tab') {
                const items = [...overlay.querySelectorAll('button, input, summary')].filter(x => !x.disabled && x.offsetParent !== null);
                if (!items.length) return;
                const i = items.indexOf(document.activeElement);
                const n = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i < 0 || i === items.length - 1 ? 0 : i + 1);
                e.preventDefault();
                items[n].focus();
            }
        };
        document.addEventListener('keydown', onKey, true);

        // 事件綁定
        $('#sa-modal-close').onclick = close;
        $('#sa-btn-cancel').onclick = close;
        overlay.onclick = (e) => { if (e.target === overlay) close(); };

        const confirmBtn = $('#sa-btn-confirm');
        const updateConfirm = () => {
            if (busy) return;
            const clearing = $('#sa-opt-clear-scores').checked || $('#sa-opt-clear-homework').checked;
            confirmBtn.textContent = clearing ? '📦 封存並清空' : '📦 確認封存';
            confirmBtn.classList.toggle('sa-danger', clearing);
        };
        $('#sa-opt-clear-scores').onchange = updateConfirm;
        $('#sa-opt-clear-homework').onchange = updateConfirm;

        // 已封存的學期：打開時才讀雲端
        const renderHistory = async () => {
            const box = $('#sa-history-list');
            box.textContent = '讀取中…';
            try {
                const list = await listArchives();
                if (!list.length) { box.textContent = '這個班級還沒有封存紀錄。'; return; }
                box.replaceChildren(...list.map(a => {
                    const row = document.createElement('div');
                    row.className = 'sa-history-row';
                    const info = document.createElement('div');
                    const title = document.createElement('div');
                    title.className = 'sa-history-title';
                    title.textContent = `${a.semesterLabel || a.archiveKey}（${a.archiveKey}）`;
                    const meta = document.createElement('div');
                    meta.className = 'sa-history-meta';
                    const when = a.at ? new Date(a.at).toLocaleString('zh-TW', { hour12: false }) : '';
                    meta.textContent = `${when}・${a.studentCount || 0} 位學生・${a.pointsHistoryCount || 0} 筆加扣分`;
                    info.append(title, meta);
                    const dl = document.createElement('button');
                    dl.type = 'button';
                    dl.className = 'sa-history-btn';
                    dl.textContent = '📊 下載 Excel';
                    dl.onclick = async () => {
                        dl.disabled = true;
                        try { await downloadArchive(a.id); }
                        catch (e) { window.NotificationSystem?.error?.('下載封存失敗：' + e.message); }
                        finally { dl.disabled = false; }
                    };
                    row.append(info, dl);
                    return row;
                }));
            } catch (e) {
                box.textContent = window.CloudSafety?.isOfflineWait?.(e) ? '目前離線，恢復連線後再打開這裡。' : '讀取失敗：' + e.message;
            }
        };
        $('#sa-history').addEventListener('toggle', e => { if (e.target.open) renderHistory(); });

        confirmBtn.onclick = async () => {
            const key = $('#sa-archive-key').value.trim();
            if (!/^\d{4}-S[12]$/.test(key)) {
                alert('封存標籤格式錯誤，請使用「年份-S1」或「年份-S2」格式\n例如：2025-S2');
                $('#sa-archive-key').focus();
                return;
            }
            const clearScores = $('#sa-opt-clear-scores').checked;
            const clearHomework = $('#sa-opt-clear-homework').checked;
            const excel = $('#sa-opt-excel').checked;
            if (clearScores || clearHomework) {
                const what = [clearScores ? '・分數歸零、加扣分紀錄清空' : '', clearHomework ? '・作業與聯絡簿清空' : ''].filter(Boolean).join('\n');
                if (!confirm(`封存完成並確認無誤後，會清空：\n${what}\n\n清空後要看舊資料，請到「已封存的學期」下載 Excel。確定嗎？`)) return;
            }

            busy = true;
            const lockables = [...overlay.querySelectorAll('#sa-modal-footer button, #sa-modal-close, .sa-options input, #sa-archive-key')];
            lockables.forEach(x => { x.disabled = true; });
            confirmBtn.textContent = '封存中...';

            try {
                const result = await archiveSemester(key, { clearScores, clearHomework, excel });
                busy = false;
                close();
                const extra = result.archiveId !== key ? `（已有同名封存，這份另存為 ${result.archiveId}）` : '';
                const clearedText = result.cleared.length ? `，並已${result.cleared.join('、')}` : '';
                window.NotificationSystem?.success?.(`🎉 學期封存完成：${result.studentCount} 位學生、${result.pointsHistoryCount} 筆加扣分${clearedText}${extra}`);
                if (result.cleared.length && result.synced === 'conflict') {
                    window.NotificationSystem?.warning?.('清空已存在這台電腦，但雲端剛有其他裝置的更新：請點右上角同步圖示比較，選擇「保留本機並上傳」（已清空的版本）');
                } else if (result.cleared.length && !result.synced) {
                    window.NotificationSystem?.warning?.('清空已存在這台電腦，恢復連線後會自動同步到雲端');
                }

                // 重大資料操作：封存可能一併清空分數 / 作業
                try {
                    if (window.UsageNotify) {
                        UsageNotify.dataAction('學期封存',
                            `封存「${result.archiveId}」共 ${result.studentCount} 位學生，${result.cleared.join('、') || '未清空任何資料'}`);
                    }
                } catch (e) { /* ignore */ }
            } catch (err) {
                busy = false;
                lockables.forEach(x => { x.disabled = false; });
                updateConfirm();
                console.error('[SemesterArchive] 封存失敗:', err);
                window.NotificationSystem?.error?.(String(err.message).includes('封存已完成') ? err.message : '封存未完成：' + err.message);
            }
        };

        $('#sa-archive-key').focus();
    }

    // ─── 在「學生管理」頁加入入口按鈕 ───────────────────────
    function _injectEntryButton() {
        // 等 DOM 就緒後注入
        const tryInject = () => {
            // 尋找「名單管理」区塊底部（緊接在「完整資料備份」下方）
            const backupDiv = document.querySelector('.mt-4.pt-4.border-t.border-gray-200');
            if (!backupDiv) return;

            // 避免重複注入
            if (document.getElementById('sa-entry-btn')) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'mt-4 pt-4 border-t border-gray-200';
            wrapper.innerHTML = `
<h4 class="text-sm font-semibold text-gray-700 mb-2">📦 學期資料封存</h4>
<button id="sa-entry-btn"
    class="w-full bg-violet-500 text-white px-4 py-2 rounded-lg hover:bg-violet-600 transition-colors text-sm active:scale-95"
    title="將目前班級所有資料封存至雲端，可選清空分數以便新學期開始">
    📅 封存本學期資料
</button>
<div class="text-xs text-gray-600 bg-violet-50 p-2 rounded mt-2">
    💡 學期末使用：一鍵封存分數快照，讓下學期從零開始
</div>
            `;
            backupDiv.after(wrapper);
            document.getElementById('sa-entry-btn').onclick = () => openUI();
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', tryInject);
        } else {
            // 延遲等其他模組渲染完成
            setTimeout(tryInject, 800);
        }
    }

    // ─── 初始化 ───────────────────────────────────────────
    _injectEntryButton();

    // ─── 公開 API ─────────────────────────────────────────
    return {
        openUI,
        archiveSemester,
        listArchives,
        downloadArchive,
    };

})();

window.SemesterArchive = SemesterArchive;
