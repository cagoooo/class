/**
 * semester-archive.js
 * Q01嚗飛?????摮芋蝯?Semester Archive嚗?
 *
 * ?嚗?
 *  - 銝?萄??桀??剔??????摮 Firebase archives/ 頝臬?
 *  - 撠?敺?賂?皜征?嚗??飛???殷?/ 皜征雿平閮?
 *  - ?舀?仿甇瑕摮豢?嚗?靘???Q02 撱嗡撓嚗?
 *  - 摰?游?憭蝝頂蝯梧?v3.0.1+嚗?
 *
 * 雿輻?孵?嚗?
 *  ??classnew.html ? <script src="./js/semester-archive.js"> 敺?
 *  SemesterArchive.openUI() ?臬?怠?摮?Modal??
 *
 * @version 3.0.2
 */

const SemesterArchive = (() => {
    'use strict';

    // ??? 撣豢 ???????????????????????????????????????????????
    const CURRENT_YEAR = new Date().getFullYear();
    const CURRENT_MONTH = new Date().getMonth() + 1;
    // ?啁摮詨嚗?嚚??銝飛??S2)嚗????僑1?銝飛??S1)
    const CURRENT_SEMESTER = (CURRENT_MONTH >= 2 && CURRENT_MONTH <= 7) ? 'S2' : 'S1';
    const DEFAULT_ARCHIVE_KEY = `${CURRENT_YEAR}-${CURRENT_SEMESTER}`;

    // ???桀??剔? ID嚗?游??剔?嚗?
    function getCurClassId() {
        return localStorage.getItem('currentClassId') || 'default';
    }

    // ??甇斤蝝? Firebase ?箏??
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

    // ??? ?詨?嚗銵?摮?????????????????????????????????????
    /**
     * @param {string} archiveKey 靘? "2025-S2"
     * @param {Object} options { clearScores, clearHomework }
     */
    async function archiveSemester(archiveKey, options = {}) {
        const base = getClassBaseRef();
        if (!base) throw new Error('隢??餃 Google 撣唾?敺??瑁?撠?');

        typeof LoadingIndicator !== 'undefined' && LoadingIndicator.show('? 甇?撠?摮豢?鞈?...');

        try {
            const archiveRef = base.collection('archives').doc(archiveKey);

            // ?? 1. 霈?????????
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

            // ?? 2. 撖怠撠?蝭暺???
            const db = window.FirebaseConfig.getDb();
            const batch = db.batch();

            // meta ?辣
            batch.set(archiveRef.collection('meta').doc('info'), {
                archiveKey,
                archivedAt: firebase.firestore.FieldValue.serverTimestamp(),
                studentCount: students.length,
                totalPoints,
                avgPoints: Number(avgPoints),
                classId: getCurClassId(),
                semesterLabel: _buildSemesterLabel(archiveKey),
            });

            // 摮貊?敹怎嚗?嚗?
            students.forEach(s => batch.set(archiveRef.collection('students').doc(String(s.id)), s));

            // ?????
            const MAX_BATCH = 490; // Firestore batch 銝? 500
            let batchCount = students.length + 1; // 撌脩??雿

            const flush = async () => {
                await batch.commit();
                // 瘜冽?嚗atch 雿輻敺撱Ｘ?嚗??db.batch() ?遣
            };

            // ?撖怠 pointsHistory
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

            // ?舐窗蝪踴?璆剛???
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

            // 擐嚗eta + students嚗?
            await batch.commit();

            console.log(`[SemesterArchive] ??撠?摰?: ${archiveKey}嚗?{students.length} 雿飛??`);

            // ?? 3. 靘??蝛箸摮豢?鞈? ??
            if (options.clearScores) {
                await _clearScores(base, students);
                console.log('[SemesterArchive] ?撌脫飛?塚?摮貊??靽?嚗?);
            }
            if (options.clearHomework) {
                await _clearCollection(base, 'homeworks');
                await _clearCollection(base, 'notebookEntries');
                console.log('[SemesterArchive] 雿平?蝯∠倏撌脫?蝛?);
            }

            return { success: true, archiveKey, studentCount: students.length };

        } finally {
            typeof LoadingIndicator !== 'undefined' && LoadingIndicator.hide();
        }
    }

    // 撠??飛???豢飛?塚?銝?文飛??
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

        // 皜征?????
        await _clearCollection(base, 'pointsHistory');

        // ?郊?砍 localStorage
        window.students?.forEach(s => { s.score = 0; });
        localStorage.setItem(window.STUDENTS_KEY || 'students', JSON.stringify(window.students || []));
        localStorage.setItem('pointsHistory', JSON.stringify([]));
        if (typeof window.pointsHistory !== 'undefined') window.pointsHistory = [];
        if (typeof renderStudents === 'function') renderStudents();
    }

    // 皜征?游?collection
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

    // 撱箇?摮豢?璅惜憿舐內??
    function _buildSemesterLabel(key) {
        const [year, sem] = key.split('-');
        const semLabel = sem === 'S1' ? '銝飛?? : '銝飛??;
        return `${year} 摮詨僑 ${semLabel}`;
    }

    // ??? 霈?風?脣?摮?銵??????????????????????????????????
    async function listArchives() {
        const base = getClassBaseRef();
        if (!base) return [];
        try {
            const archivesCol = base.collection('archives');
            const snap = await archivesCol.listDocuments?.() || [];
            // listDocuments ?冽?鈭?SDK ?銝?剁??寧 getDocs
            const metaSnaps = await Promise.all(
                (await archivesCol.get()).docs
                    .map(d => d.ref.collection('meta').doc('info').get())
            );
            return metaSnaps
                .filter(s => s.exists)
                .map(s => s.data())
                .sort((a, b) => (b.archiveKey > a.archiveKey ? 1 : -1));
        } catch (e) {
            console.warn('[SemesterArchive] 霈??摮?銵典仃??', e);
            return [];
        }
    }

    // ??? UI 璅??瘜典 ??????????????????????????????????????
    function _injectStyles() {
        if (document.getElementById('semester-archive-styles')) return;
        const style = document.createElement('style');
        style.id = 'semester-archive-styles';
        style.textContent = `
/* ??? 摮豢?撠? Modal 璅?? ??? */
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

    // ??? ?? UI ?亙 ?????????????????????????????????????
    async function openUI() {
        if (!window.FirebaseConfig?.isConnected()) {
            typeof NotificationSystem !== 'undefined' &&
                NotificationSystem.warning('隢??餃 Google 撣唾?敺??賭蝙?典飛??摮???);
            return;
        }
        _injectStyles();

        // ???桀?蝯梯?
        const stu = window.students || [];
        const pts = window.pointsHistory || [];
        const totalPts = stu.reduce((a, s) => a + (Number(s.score) || 0), 0);

        const overlay = document.createElement('div');
        overlay.id = 'sa-modal-overlay';
        overlay.innerHTML = `
<div id="sa-modal">
  <div id="sa-modal-header">
    <h2>? 摮豢?鞈?撠?</h2>
    <button id="sa-modal-close" title="??">??/button>
  </div>

  <div id="sa-modal-body">
    <p style="font-size:0.85rem;color:#6b7280;margin-bottom:1rem;">
      撠?敺??砍飛??????瘞訾?靽??券蝡荔??舫??望風?脰???
    </p>

    <!-- ?砍飛?絞閮?-->
    <div class="sa-stat-grid">
      <div class="sa-stat-card">
        <div class="sa-stat-value">${stu.length}</div>
        <div class="sa-stat-label">摮貊?鈭箸</div>
      </div>
      <div class="sa-stat-card">
        <div class="sa-stat-value">${pts.length}</div>
        <div class="sa-stat-label">?????/div>
      </div>
      <div class="sa-stat-card">
        <div class="sa-stat-value">${totalPts}</div>
        <div class="sa-stat-label">?函蝛?蝮質?</div>
      </div>
    </div>

    <!-- 撠?摮豢?璅惜 -->
    <div class="sa-key-row">
      <label>?? 撠?璅惜</label>
      <input id="sa-archive-key" type="text" value="${DEFAULT_ARCHIVE_KEY}"
        placeholder="靘? 2025-S2" maxlength="16">
    </div>

    <!-- 撠?敺?雿??-->
    <div class="sa-options">
      <label class="sa-option">
        <input type="checkbox" id="sa-opt-clear-scores" checked>
        <div>
          <div class="sa-option-title">?? 皜征?嚗??飛????/div>
          <div class="sa-option-desc">撠?敺??飛???飛?塚??????蝛算??拙???摮豢?雿輻</div>
        </div>
      </label>
      <label class="sa-option">
        <input type="checkbox" id="sa-opt-clear-homework">
        <div>
          <div class="sa-option-title">?? ??皜征雿平?蝯∠倏閮?</div>
          <div class="sa-option-desc">銝雿菜??方?摮豢???璆剖?銵典??舐窗蝪選?霈?摮豢?敺??</div>
        </div>
      </label>
    </div>

    <!-- 霅血??憛?-->
    <div class="sa-warning">
      ?? <span>皜征??<strong>?⊥?敺拙?</strong>嚗?????撌脣?摰?脣??喳?摮?暺?隢敹?/span>
    </div>
  </div>

  <div id="sa-modal-footer">
    <button id="sa-btn-cancel">??</button>
    <button id="sa-btn-confirm">? 蝣箄?撠?</button>
  </div>
</div>
        `;

        document.body.appendChild(overlay);

        // 鈭辣蝬?
        overlay.querySelector('#sa-modal-close').onclick = () => overlay.remove();
        overlay.querySelector('#sa-btn-cancel').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        overlay.querySelector('#sa-btn-confirm').onclick = async () => {
            const key = overlay.querySelector('#sa-archive-key').value.trim();
            if (!/^\d{4}-S[12]$/.test(key)) {
                alert('撠?璅惜?澆??航炊嚗?雿輻?僑隞?S1???僑隞?S2?撘n靘?嚗?025-S2');
                return;
            }
            const clearScores = overlay.querySelector('#sa-opt-clear-scores').checked;
            const clearHomework = overlay.querySelector('#sa-opt-clear-homework').checked;

            const btn = overlay.querySelector('#sa-btn-confirm');
            btn.disabled = true;
            btn.textContent = '撠?銝?..';

            try {
                const result = await archiveSemester(key, { clearScores, clearHomework });
                overlay.remove();
                typeof NotificationSystem !== 'undefined' &&
                    NotificationSystem.success(
                        `?? 摮豢?撠???嚗歇撠? ${result.studentCount} 雿飛??摰鞈??
                    );
            } catch (err) {
                btn.disabled = false;
                btn.textContent = '? 蝣箄?撠?';
                console.error('[SemesterArchive] 撠?憭望?:', err);
                typeof NotificationSystem !== 'undefined' &&
                    NotificationSystem.error('撠?憭望?嚗? + err.message);
            }
        };
    }

    // ??? ?具飛?恣????亙?? ???????????????????????
    function _injectEntryButton() {
        // 蝑?DOM 撠梁?敺釣??
        const tryInject = () => {
            // 撠???桃恣?憛??剁?蝺?具??渲???隞賬??對?
            const backupDiv = document.querySelector('.mt-4.pt-4.border-t.border-gray-200');
            if (!backupDiv) return;

            // ?踹???瘜典
            if (document.getElementById('sa-entry-btn')) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'mt-4 pt-4 border-t border-gray-200';
            wrapper.innerHTML = `
<h4 class="text-sm font-semibold text-gray-700 mb-2">? 摮豢?鞈?撠?</h4>
<button id="sa-entry-btn"
    class="w-full bg-violet-500 text-white px-4 py-2 rounded-lg hover:bg-violet-600 transition-colors text-sm active:scale-95"
    title="撠?蝝?????摮?脩垢嚗?豢?蝛箏??訾誑靘踵摮豢???">
    ?? 撠??砍飛????
</button>
<div class="text-xs text-gray-600 bg-violet-50 p-2 rounded mt-2">
    ? 摮豢??思蝙?剁?銝?萄?摮??詨翰?改?霈?摮豢?敺??
</div>
            `;
            backupDiv.after(wrapper);
            document.getElementById('sa-entry-btn').onclick = () => openUI();
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', tryInject);
        } else {
            // 撱園蝑隞芋蝯葡????
            setTimeout(tryInject, 800);
        }
    }

    // ??? ???????????????????????????????????????????????
    _injectEntryButton();

    // ??? ?祇? API ?????????????????????????????????????????
    return {
        openUI,
        archiveSemester,
        listArchives,
    };

})();

window.SemesterArchive = SemesterArchive;
