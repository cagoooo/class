/**
 * semester-archive.js
 * Q01：學期資料自動封存模組（Semester Archive）
 *
 * 功能：
 *  - 一鍵將目前班級所有資料封存至 Firebase archives/ 路徑
 *  - 封存後可選：清空分數（保留學生名單）/ 清空作業記錄
 *  - 支援查閱歷史學期（僅供參考，Q02 延伸）
 *  - 完整整合多班級系統（v3.0.1+）
 *
 * 使用方式：
 *  在 classnew.html 加入 <script src="./js/semester-archive.js"> 後，
 *  SemesterArchive.openUI() 可呼叫封存 Modal。
 *
 * @version 3.0.2
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
    /**
     * @param {string} archiveKey 例如 "2025-S2"
     * @param {Object} options { clearScores, clearHomework }
     */
    async function archiveSemester(archiveKey, options = {}) {
        const base = getClassBaseRef();
        if (!base) throw new Error('請先登入 Google 帳號後再執行封存');

        typeof LoadingIndicator !== 'undefined' && LoadingIndicator.show('📦 正在封存學期資料...');

        try {
            const archiveRef = base.collection('archives').doc(archiveKey);

            // ── 1. 讀取目前所有資料 ──
            const [studentsSnap, pointsSnap, notebookSnap, hwSnap] = await Promise.all([
                base.collection('students').get(),
                base.collection('pointsHistory').get(),
                base.collection('notebookEntries').get(),
                base.collection('homeworks').get(),
            ]);

            const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const pointsHistory = pointsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const notebookEntries = notebookSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const homeworkList = hwSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const totalPoints = students.reduce((acc, s) => acc + (Number(s.score) || 0), 0);
            const avgPoints = students.length ? (totalPoints / students.length).toFixed(1) : 0;

            // ── 2. 寫入封存節點 ──
            const db = window.FirebaseConfig.getDb();
            const batch = db.batch();

            // meta 文件
            batch.set(archiveRef.collection('meta').doc('info'), {
                archiveKey,
                archivedAt: firebase.firestore.FieldValue.serverTimestamp(),
                studentCount: students.length,
                totalPoints,
                avgPoints: Number(avgPoints),
                classId: getCurClassId(),
                semesterLabel: _buildSemesterLabel(archiveKey),
            });

            // 學生快照（含分數）
            students.forEach(s => batch.set(archiveRef.collection('students').doc(String(s.id)), s));

            // 加扣分記錄
            const MAX_BATCH = 490; // Firestore batch 上限 500
            let batchCount = students.length + 1; // 已用的操作數

            const flush = async () => {
                await batch.commit();
                // 注意：batch 使用後即廢棄，改用 db.batch() 重建
            };

            // 分批寫入 pointsHistory
            let tempBatch = db.batch();
            let tempCount = 0;
            for (const p of pointsHistory) {
                tempBatch.set(archiveRef.collection('pointsHistory').doc(String(p.id)), p);
                tempCount++;
                if (tempCount >= MAX_BATCH) {
                    await tempBatch.commit();
                    tempBatch = db.batch();
                    tempCount = 0;
                }
            }

            // 聯絡簿、作業記錄
            for (const n of notebookEntries) {
                tempBatch.set(archiveRef.collection('notebookEntries').doc(String(n.id)), n);
                tempCount++;
                if (tempCount >= MAX_BATCH) {
                    await tempBatch.commit();
                    tempBatch = db.batch();
                    tempCount = 0;
                }
            }
            for (const hw of homeworkList) {
                tempBatch.set(archiveRef.collection('homeworks').doc(String(hw.id)), hw);
                tempCount++;
                if (tempCount >= MAX_BATCH) {
                    await tempBatch.commit();
                    tempBatch = db.batch();
                    tempCount = 0;
                }
            }
            if (tempCount > 0) await tempBatch.commit();

            // 首批（meta + students）
            await batch.commit();

            console.log(`[SemesterArchive] ✅ 封存完成: ${archiveKey}（${students.length} 位學生）`);

            // ── 3. 依選項清空本學期資料 ──
            if (options.clearScores) {
                await _clearScores(base, students);
                console.log('[SemesterArchive] 分數已歸零（學生名單保留）');
            }
            if (options.clearHomework) {
                await _clearCollection(base, 'homeworks');
                await _clearCollection(base, 'notebookEntries');
                console.log('[SemesterArchive] 作業與聯絡簿已清空');
            }

            return { success: true, archiveKey, studentCount: students.length };

        } finally {
            typeof LoadingIndicator !== 'undefined' && LoadingIndicator.hide();
        }
    }

    // 將所有學生分數歸零（不刪除學生）
    async function _clearScores(base, students) {
        const db = window.FirebaseConfig.getDb();
        let batch = db.batch();
        let count = 0;
        for (const s of students) {
            const ref = base.collection('students').doc(String(s.id));
            batch.update(ref, { score: 0 });
            count++;
            if (count >= 490) {
                await batch.commit();
                batch = db.batch();
                count = 0;
            }
        }
        if (count > 0) await batch.commit();

        // 清空加扣分記錄
        await _clearCollection(base, 'pointsHistory');

        // 同步本地 localStorage
        window.students?.forEach(s => { s.score = 0; });
        localStorage.setItem(window.STUDENTS_KEY || 'students', JSON.stringify(window.students || []));
        localStorage.setItem('pointsHistory', JSON.stringify([]));
        if (typeof window.pointsHistory !== 'undefined') window.pointsHistory = [];
        if (typeof renderStudents === 'function') renderStudents();
    }

    // 清空整個 collection
    async function _clearCollection(base, collectionName) {
        const snap = await base.collection(collectionName).get();
        if (snap.empty) return;
        const db = window.FirebaseConfig.getDb();
        let batch = db.batch();
        let count = 0;
        snap.docs.forEach(doc => {
            batch.delete(doc.ref);
            count++;
        });
        if (count > 0) await batch.commit();
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
        try {
            const archivesCol = base.collection('archives');
            const snap = await archivesCol.listDocuments?.() || [];
            // listDocuments 在某些 SDK 版本不可用，改用 getDocs
            const metaSnaps = await Promise.all(
                (await archivesCol.get()).docs
                    .map(d => d.ref.collection('meta').doc('info').get())
            );
            return metaSnaps
                .filter(s => s.exists)
                .map(s => s.data())
                .sort((a, b) => (b.archiveKey > a.archiveKey ? 1 : -1));
        } catch (e) {
            console.warn('[SemesterArchive] 讀取封存列表失敗:', e);
            return [];
        }
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
        `;
        document.head.appendChild(style);
    }

    // ─── 開啟 UI 入口 ─────────────────────────────────────
    async function openUI() {
        if (!window.FirebaseConfig?.isConnected()) {
            typeof NotificationSystem !== 'undefined' &&
                NotificationSystem.warning('請先登入 Google 帳號後才能使用學期封存功能');
            return;
        }
        _injectStyles();

        // 取得目前統計
        const stu = window.students || [];
        const pts = window.pointsHistory || [];
        const totalPts = stu.reduce((a, s) => a + (Number(s.score) || 0), 0);

        const overlay = document.createElement('div');
        overlay.id = 'sa-modal-overlay';
        overlay.innerHTML = `
<div id="sa-modal">
  <div id="sa-modal-header">
    <h2>📦 學期資料封存</h2>
    <button id="sa-modal-close" title="關閉">✕</button>
  </div>

  <div id="sa-modal-body">
    <p style="font-size:0.85rem;color:#6b7280;margin-bottom:1rem;">
      封存後，本學期所有資料將永久保存在雲端，可隨時查閱歷史記錄。
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
      <label>📅 封存標籤</label>
      <input id="sa-archive-key" type="text" value="${DEFAULT_ARCHIVE_KEY}"
        placeholder="例如 2025-S2" maxlength="16">
    </div>

    <!-- 封存後操作選項 -->
    <div class="sa-options">
      <label class="sa-option">
        <input type="checkbox" id="sa-opt-clear-scores" checked>
        <div>
          <div class="sa-option-title">🔄 清空分數，保留學生名單</div>
          <div class="sa-option-desc">封存後所有學生積分歸零，加扣分記錄清空——最適合升下學期使用</div>
        </div>
      </label>
      <label class="sa-option">
        <input type="checkbox" id="sa-opt-clear-homework">
        <div>
          <div class="sa-option-title">📋 同時清空作業與聯絡簿記錄</div>
          <div class="sa-option-desc">一併清除舊學期的作業列表和聯絡簿，讓下學期從頭開始</div>
        </div>
      </label>
    </div>

    <!-- 警告區塊 -->
    <div class="sa-warning">
      ⚠️ <span>清空操作<strong>無法復原</strong>，但所有資料都已先安全儲存至封存節點，請放心。</span>
    </div>
  </div>

  <div id="sa-modal-footer">
    <button id="sa-btn-cancel">取消</button>
    <button id="sa-btn-confirm">📦 確認封存</button>
  </div>
</div>
        `;

        document.body.appendChild(overlay);

        // 事件綁定
        overlay.querySelector('#sa-modal-close').onclick = () => overlay.remove();
        overlay.querySelector('#sa-btn-cancel').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        overlay.querySelector('#sa-btn-confirm').onclick = async () => {
            const key = overlay.querySelector('#sa-archive-key').value.trim();
            if (!/^\d{4}-S[12]$/.test(key)) {
                alert('封存標籤格式錯誤，請使用「年份-S1」或「年份-S2」格式\n例如：2025-S2');
                return;
            }
            const clearScores = overlay.querySelector('#sa-opt-clear-scores').checked;
            const clearHomework = overlay.querySelector('#sa-opt-clear-homework').checked;

            const btn = overlay.querySelector('#sa-btn-confirm');
            btn.disabled = true;
            btn.textContent = '封存中...';

            try {
                const result = await archiveSemester(key, { clearScores, clearHomework });
                overlay.remove();
                typeof NotificationSystem !== 'undefined' &&
                    NotificationSystem.success(
                        `🎉 學期封存成功！已封存 ${result.studentCount} 位學生的完整資料。`
                    );
            } catch (err) {
                btn.disabled = false;
                btn.textContent = '📦 確認封存';
                console.error('[SemesterArchive] 封存失敗:', err);
                typeof NotificationSystem !== 'undefined' &&
                    NotificationSystem.error('封存失敗：' + err.message);
            }
        };
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
    };

})();

window.SemesterArchive = SemesterArchive;
