/**
 * Firebase 資料同步模組 v2.9.7
 * - 完整涵蓋所有功能模組的資料同步
 * - 新增同步前詳細差異預覽 Modal
 */
console.log('✅ firebase-sync.js v2.9.7 載入完成');

// 資料集合名稱
const COLLECTIONS = {
    STUDENTS: 'students',
    POINTS_HISTORY: 'pointsHistory',
    GROUPS: 'groups',
    NOTEBOOKS: 'notebooks',
    HOMEWORKS: 'homeworks',
    HOMEWORK_CHECKS: 'homeworkChecks',
    LOTTERY_HISTORY: 'lotteryHistory',
    ANNOUNCEMENTS: 'classAnnouncements',
    EXAM_DATA: 'examData',         // 考試監考設定
    APP_SETTINGS: 'appSettings',   // 各類 App 設定（時鐘、抽籤等）
};

// 同步狀態（掛到 window，讓 auto-sync.js 能正確讀到 isSyncing）
window.syncStatus = window.syncStatus || {
    lastSyncTime: null,
    isSyncing: false,
    pendingChanges: []
};
const syncStatus = window.syncStatus;

/**
 * 取得用戶的資料集合參考
 * 多班級支援：預設班級使用原有路徑，其他班級使用 classes/{classId}/ 子路徑
 */
function getUserCollection(collectionName) {
    const db = window.FirebaseConfig.getDb();
    const userId = window.FirebaseConfig.getCurrentUserId();
    if (!db || !userId) {
        console.warn('Firebase 尚未連線');
        return null;
    }
    // 讀取目前班級 ID（由 class-profiles.js 寫入）
    const curClassId = localStorage.getItem('currentClassId') || 'default';
    if (curClassId === 'default') {
        // 預設班級：沿用現有路徑（向下相容）
        return db.collection('users').doc(userId).collection(collectionName);
    }
    // 新班級：使用獨立子路徑
    return db.collection('users').doc(userId).collection('classes').doc(curClassId).collection(collectionName);
}


/**
 * 上傳整個資料集合（Array 形式）
 */
async function uploadCollection(collectionName, dataArray) {
    try {
        const collection = getUserCollection(collectionName);
        if (!collection) return false;
        if (!dataArray || dataArray.length === 0) return true;

        const db = window.FirebaseConfig.getDb();
        const batch = db.batch();
        dataArray.forEach(item => {
            const docRef = collection.doc(String(item.id));
            batch.set(docRef, { ...item, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        });
        await batch.commit();
        console.log(`✅ 上傳 ${collectionName}: ${dataArray.length} 筆`);
        return true;
    } catch (error) {
        console.error(`上傳 ${collectionName} 失敗:`, error);
        return false;
    }
}

/**
 * 上傳單一 Object 形式的設定文件
 */
async function uploadSingleDoc(collectionName, docId, data) {
    try {
        const collection = getUserCollection(collectionName);
        if (!collection) return false;
        await collection.doc(docId).set({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        console.log(`✅ 上傳 ${collectionName}/${docId}`);
        return true;
    } catch (error) {
        console.error(`上傳 ${collectionName}/${docId} 失敗:`, error);
        return false;
    }
}

/**
 * 下載資料集合（Array 形式）
 */
async function downloadCollection(collectionName) {
    try {
        const collection = getUserCollection(collectionName);
        if (!collection) return [];
        const snapshot = await collection.get();
        const data = [];
        snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
        console.log(`✅ 下載 ${collectionName}: ${data.length} 筆`);
        return data;
    } catch (error) {
        console.error(`下載 ${collectionName} 失敗:`, error);
        return [];
    }
}

/**
 * 下載單一 Object 文件
 */
async function downloadSingleDoc(collectionName, docId) {
    try {
        const collection = getUserCollection(collectionName);
        if (!collection) return null;
        const doc = await collection.doc(docId).get();
        return doc.exists ? doc.data() : null;
    } catch (error) {
        console.error(`下載 ${collectionName}/${docId} 失敗:`, error);
        return null;
    }
}

/**
 * 上傳單一資料項目
 */
async function uploadItem(collectionName, itemId, data) {
    try {
        const collection = getUserCollection(collectionName);
        if (!collection) return false;
        await collection.doc(String(itemId)).set({
            ...data,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error(`上傳 ${collectionName}/${itemId} 失敗:`, error);
        return false;
    }
}

/**
 * 刪除資料項目
 */
async function deleteItem(collectionName, itemId) {
    try {
        const collection = getUserCollection(collectionName);
        if (!collection) return false;
        await collection.doc(String(itemId)).delete();
        return true;
    } catch (error) {
        console.error(`刪除 ${collectionName}/${itemId} 失敗:`, error);
        return false;
    }
}

// ─────────────────────────────────────────────────────
// 工具：安全讀取 localStorage
// ─────────────────────────────────────────────────────
function safeLS(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; }
    catch { return fallback; }
}

// ─────────────────────────────────────────────────────
// 工具：取得本地所有資料統計
// ─────────────────────────────────────────────────────
function getLocalStats() {
    const examData = safeLS('examSubjects', null);
    const annData = safeLS('classAnnouncements', []);
    const clockSet = safeLS('clockSettings', null);
    return {
        students: (students || []).length,
        pointsHistory: (pointsHistory || []).length,
        groups: (groups || []).length,
        notebookEntries: (notebookEntries || []).length,
        homeworkList: (homeworkList || []).length,
        homeworkChecks: Object.keys(homeworkChecks || {}).length,
        lotteryHistory: (lotteryHistory || []).length,
        announcements: annData.length,
        examData: Array.isArray(examData) ? examData.length : (examData ? 1 : 0),
        clockSettings: clockSet ? 1 : 0,
    };
}

// ─────────────────────────────────────────────────────
// 同步所有本地資料到雲端
// ─────────────────────────────────────────────────────
async function syncToCloud() {
    if (!window.FirebaseConfig.isConnected()) {
        NotificationSystem && NotificationSystem.warning('請先登入 Google 帳號');
        return false;
    }
    if (syncStatus.isSyncing) { console.warn('同步進行中...'); return false; }

    syncStatus.isSyncing = true;
    try {
        typeof LoadingIndicator !== 'undefined' && LoadingIndicator.show('正在同步至雲端...');

        const db = window.FirebaseConfig.getDb();
        const userId = window.FirebaseConfig.getCurrentUserId();
        const annData = safeLS('classAnnouncements', []);

        // 讀取考試監考資料
        const examSubjects = safeLS('examSubjects', []);
        const examReminders = safeLS('examReminders', { exam: [], break: [] });
        const examAttendance = safeLS('examAttendance', {});
        // 讀取 App 設定
        const clockSettings = safeLS('clockSettings', {});
        const noRepeat = localStorage.getItem('noRepeatLottery');

        // ── 並行上傳全部集合 ──
        await Promise.all([
            uploadCollection(COLLECTIONS.STUDENTS, students || []),
            uploadCollection(COLLECTIONS.POINTS_HISTORY, pointsHistory || []),
            uploadCollection(COLLECTIONS.GROUPS, groups || []),
            uploadCollection(COLLECTIONS.NOTEBOOKS, notebookEntries || []),
            uploadCollection(COLLECTIONS.HOMEWORKS, homeworkList || []),
            uploadCollection(COLLECTIONS.LOTTERY_HISTORY, lotteryHistory || []),
            uploadCollection(COLLECTIONS.ANNOUNCEMENTS, annData),
            // 考試監考設定（單一 doc）
            uploadSingleDoc(COLLECTIONS.EXAM_DATA, 'subjects', { data: examSubjects }),
            uploadSingleDoc(COLLECTIONS.EXAM_DATA, 'reminders', { data: examReminders }),
            uploadSingleDoc(COLLECTIONS.EXAM_DATA, 'attendance', { data: examAttendance }),
            // App 設定
            uploadSingleDoc(COLLECTIONS.APP_SETTINGS, 'clock', clockSettings),
            uploadSingleDoc(COLLECTIONS.APP_SETTINGS, 'lottery', { noRepeatLottery: noRepeat }),
        ]);

        // 作業繳交狀態（特殊結構）— 使用動態路徑（修正多班級漏洞）
        if (homeworkChecks && Object.keys(homeworkChecks).length > 0) {
            const checksCol = getUserCollection(COLLECTIONS.HOMEWORK_CHECKS);
            if (checksCol) {
                for (const [hwId, checks] of Object.entries(homeworkChecks)) {
                    await checksCol.doc(String(hwId)).set({
                        checks,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            }
        }

        // 同步班級清單（classProfiles）到雲端 meta 節點，確保多裝置可識別所有班級
        // 路徑：users/{uid}/_meta/classProfiles（不受多班級路徑影響，固定全域）
        try {
            const db = window.FirebaseConfig.getDb();
            const userId = window.FirebaseConfig.getCurrentUserId();
            const profiles = JSON.parse(localStorage.getItem('classProfiles') || '[]');
            if (profiles.length > 0) {
                await db.collection('users').doc(userId)
                    .collection('_meta').doc('classProfiles')
                    .set({ profiles, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                console.log('[MultiClass] classProfiles 已同步至雲端');
            }
        } catch (e) {
            console.warn('[MultiClass] classProfiles 同步失敗（非致命）:', e);
        }

        syncStatus.lastSyncTime = new Date();
        localStorage.setItem('lastSyncTime', syncStatus.lastSyncTime.toISOString());

        typeof LoadingIndicator !== 'undefined' && LoadingIndicator.hide();
        if (typeof window.GoogleAuthUI !== 'undefined') {
            window.GoogleAuthUI.refreshSyncTime && window.GoogleAuthUI.refreshSyncTime();
        }
        NotificationSystem && NotificationSystem.success('資料已完整同步至雲端 ☁️');
        console.log('✅ 同步完成:', syncStatus.lastSyncTime);
        return true;
    } catch (error) {
        console.error('同步失敗:', error);
        typeof LoadingIndicator !== 'undefined' && LoadingIndicator.hide();
        NotificationSystem && NotificationSystem.error('同步失敗: ' + error.message);
        return false;
    } finally {
        syncStatus.isSyncing = false;
    }
}

// ─────────────────────────────────────────────────────
// 從雲端下載資料（靜默）→ 返回資料物件
// ─────────────────────────────────────────────────────
async function syncFromCloud() {
    if (!window.FirebaseConfig.isConnected()) return null;
    try {
        typeof LoadingIndicator !== 'undefined' && LoadingIndicator.show('正在讀取雲端資料...');

        const db = window.FirebaseConfig.getDb();
        const userId = window.FirebaseConfig.getCurrentUserId();

        const [
            cloudStudents, cloudPoints, cloudGroups,
            cloudNotebooks, cloudHomeworks, cloudLottery,
            cloudAnn,
            examSubjectsDoc, examRemindersDoc, examAttendDoc,
            clockDoc, lotterySettingDoc
        ] = await Promise.all([
            downloadCollection(COLLECTIONS.STUDENTS),
            downloadCollection(COLLECTIONS.POINTS_HISTORY),
            downloadCollection(COLLECTIONS.GROUPS),
            downloadCollection(COLLECTIONS.NOTEBOOKS),
            downloadCollection(COLLECTIONS.HOMEWORKS),
            downloadCollection(COLLECTIONS.LOTTERY_HISTORY),
            downloadCollection(COLLECTIONS.ANNOUNCEMENTS),
            downloadSingleDoc(COLLECTIONS.EXAM_DATA, 'subjects'),
            downloadSingleDoc(COLLECTIONS.EXAM_DATA, 'reminders'),
            downloadSingleDoc(COLLECTIONS.EXAM_DATA, 'attendance'),
            downloadSingleDoc(COLLECTIONS.APP_SETTINGS, 'clock'),
            downloadSingleDoc(COLLECTIONS.APP_SETTINGS, 'lottery'),
        ]);

        // 作業繳交狀態 — 使用動態路徑（修正多班級漏洞）
        const checksCol = getUserCollection(COLLECTIONS.HOMEWORK_CHECKS);
        const cloudChecks = {};
        if (checksCol) {
            const checksSnap = await checksCol.get();
            checksSnap.forEach(doc => { cloudChecks[doc.id] = doc.data().checks || {}; });
        }

        // 下載班級清單 classProfiles（全域 meta 節點）
        let cloudProfiles = null;
        try {
            const db = window.FirebaseConfig.getDb();
            const userId = window.FirebaseConfig.getCurrentUserId();
            const metaDoc = await db.collection('users').doc(userId)
                .collection('_meta').doc('classProfiles').get();
            if (metaDoc.exists) cloudProfiles = metaDoc.data().profiles;
        } catch (e) { /* 無 meta 則略過 */ }

        typeof LoadingIndicator !== 'undefined' && LoadingIndicator.hide();

        return {
            students: cloudStudents,
            pointsHistory: cloudPoints,
            groups: cloudGroups,
            notebookEntries: cloudNotebooks,
            homeworkList: cloudHomeworks,
            lotteryHistory: cloudLottery,
            homeworkChecks: cloudChecks,
            announcements: cloudAnn,
            examSubjects: examSubjectsDoc?.data ?? [],
            examReminders: examRemindersDoc?.data ?? { exam: [], break: [] },
            examAttendance: examAttendDoc?.data ?? {},
            clockSettings: clockDoc ?? null,
            lotterySettings: lotterySettingDoc ?? null,
            classProfiles: cloudProfiles,  // ← 新增：帶回班級清單
        };

    } catch (error) {
        console.error('下載失敗:', error);
        typeof LoadingIndicator !== 'undefined' && LoadingIndicator.hide();
        NotificationSystem && NotificationSystem.error('讀取雲端失敗: ' + error.message);
        return null;
    }
}

// ─────────────────────────────────────────────────────
// 從雲端還原並覆蓋本地（核心覆蓋邏輯，接受已下載的 cloudData）
// ─────────────────────────────────────────────────────
async function loadFromCloudData(cloudData) {
    if (!cloudData) return false;
    // 防止並行執行
    if (syncStatus.isSyncing) {
        console.warn('[Sync] 同步進行中，跳過 loadFromCloudData');
        return false;
    }
    syncStatus.isSyncing = true;
    try {
        // 主資料覆蓋（優先使用 ClassDB，自動備份至 localStorage）
        const dbSave = (typeof ClassDB !== 'undefined' && ClassDB.isReady)
            ? (k, v) => ClassDB.save(k, v)
            : (k, v) => localStorage.setItem(k, JSON.stringify(v));

        await Promise.all([
            dbSave('students', cloudData.students),
            dbSave('pointsHistory', cloudData.pointsHistory),
            dbSave('groups', cloudData.groups),
            dbSave('notebookEntries', cloudData.notebookEntries),
            dbSave('homeworkList', cloudData.homeworkList),
            dbSave('lotteryHistory', cloudData.lotteryHistory),
            dbSave('homeworkChecks', cloudData.homeworkChecks),
        ]);

        // ✅ 同步更新記憶體中的全域變數
        // getLocalStats() 讀取全域變數，若不更新則 getLocalStats() 永遠回傳 0
        window.students = cloudData.students || [];
        window.pointsHistory = cloudData.pointsHistory || [];
        window.groups = cloudData.groups || [];
        window.notebookEntries = cloudData.notebookEntries || [];
        window.homeworkList = cloudData.homeworkList || [];
        window.lotteryHistory = cloudData.lotteryHistory || [];
        window.homeworkChecks = cloudData.homeworkChecks || {};

        // 還原班級清單 classProfiles
        if (cloudData.classProfiles && Array.isArray(cloudData.classProfiles)) {
            try {
                const localRaw = localStorage.getItem('classProfiles');
                const localProfiles = localRaw ? JSON.parse(localRaw) : [];
                const cloudIds = new Set(cloudData.classProfiles.map(p => p.id));
                const localOnlyProfiles = localProfiles.filter(p => !cloudIds.has(p.id));
                const merged = [...cloudData.classProfiles, ...localOnlyProfiles];
                localStorage.setItem('classProfiles', JSON.stringify(merged));
                console.log(`[MultiClass] 已還原 classProfiles（${merged.length} 個班級）`);
            } catch (e) {
                console.warn('[MultiClass] classProfiles 還原失敗:', e);
            }
        }

        // 公告
        if (cloudData.announcements && cloudData.announcements.length > 0) {
            await dbSave('classAnnouncements', cloudData.announcements);
        }

        // 考試監考設定
        if (cloudData.examSubjects && cloudData.examSubjects.length > 0) {
            await dbSave('examSubjects', cloudData.examSubjects);
        }
        if (cloudData.examReminders) {
            await dbSave('examReminders', cloudData.examReminders);
        }
        if (cloudData.examAttendance && Object.keys(cloudData.examAttendance).length > 0) {
            await dbSave('examAttendance', cloudData.examAttendance);
        }

        // App 設定
        if (cloudData.clockSettings) {
            await dbSave('clockSettings', cloudData.clockSettings);
        }
        if (cloudData.lotterySettings?.noRepeatLottery !== undefined) {
            localStorage.setItem('noRepeatLottery', cloudData.lotterySettings.noRepeatLottery);
        }

        // ✅ 更新同步時間，防止 AutoSync 還原後立即再觸發
        syncStatus.lastSyncTime = new Date();
        localStorage.setItem('lastSyncTime', syncStatus.lastSyncTime.toISOString());

        // 重繪 UI
        if (typeof renderStudents === 'function') renderStudents();
        if (typeof renderGroups === 'function') renderGroups();
        if (typeof renderNotebook === 'function') renderNotebook();
        if (typeof renderHomework === 'function') renderHomework();
        if (typeof renderLotteryHistory === 'function') renderLotteryHistory();
        if (typeof updatePointsStudentSelect === 'function') updatePointsStudentSelect();
        if (typeof updateHomeworkSelect === 'function') updateHomeworkSelect();

        NotificationSystem && NotificationSystem.success('已從雲端完整還原資料 ✅');
        return true;
    } finally {
        syncStatus.isSyncing = false;
    }
}

// 從雲端下載後還原（公開 API，兼容舊版呼叫）
async function loadFromCloud() {
    const cloudData = await syncFromCloud();
    return loadFromCloudData(cloudData);
}

// ─────────────────────────────────────────────────────
// 合併雲端與本地資料
// ─────────────────────────────────────────────────────
async function mergeWithCloud() {
    if (!window.FirebaseConfig.isConnected()) return false;
    try {
        typeof LoadingIndicator !== 'undefined' && LoadingIndicator.show('正在合併資料...');
        const cloudData = await syncFromCloud();
        if (!cloudData) throw new Error('無法取得雲端資料');

        // 學生：本地優先 + 雲端獨有
        const localIds = new Set((students || []).map(s => s.id));
        students = [
            ...(students || []),
            ...(cloudData.students || []).filter(s => !localIds.has(s.id))
        ];

        // 加扣分記錄：合併去重
        const localHistIds = new Set((pointsHistory || []).map(h => h.id));
        pointsHistory = [
            ...(pointsHistory || []),
            ...(cloudData.pointsHistory || []).filter(h => !localHistIds.has(h.id))
        ].sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));

        // 公告：合併去重
        const localAnn = safeLS('classAnnouncements', []);
        const localAnnIds = new Set(localAnn.map(a => a.id));
        const mergedAnn = [
            ...localAnn,
            ...(cloudData.announcements || []).filter(a => !localAnnIds.has(a.id))
        ];
        localStorage.setItem('classAnnouncements', JSON.stringify(mergedAnn));

        // 其餘：本地為空才用雲端
        if (!groups.length && cloudData.groups.length) groups = cloudData.groups;
        if (!notebookEntries.length && cloudData.notebookEntries.length) notebookEntries = cloudData.notebookEntries;
        if (!homeworkList.length && cloudData.homeworkList.length) homeworkList = cloudData.homeworkList;
        if (!lotteryHistory.length && cloudData.lotteryHistory.length) lotteryHistory = cloudData.lotteryHistory;

        // 考試監考設定：本地無則採雲端
        if (!safeLS('examSubjects', null) && cloudData.examSubjects?.length) {
            localStorage.setItem('examSubjects', JSON.stringify(cloudData.examSubjects));
        }
        if (!safeLS('clockSettings', null) && cloudData.clockSettings) {
            localStorage.setItem('clockSettings', JSON.stringify(cloudData.clockSettings));
        }

        // 存 localStorage
        localStorage.setItem('students', JSON.stringify(students));
        localStorage.setItem('pointsHistory', JSON.stringify(pointsHistory));
        localStorage.setItem('groups', JSON.stringify(groups));
        localStorage.setItem('notebookEntries', JSON.stringify(notebookEntries));
        localStorage.setItem('homeworkList', JSON.stringify(homeworkList));
        localStorage.setItem('lotteryHistory', JSON.stringify(lotteryHistory));

        // 上傳合併結果
        await syncToCloud();

        // 重繪
        if (typeof renderStudents === 'function') renderStudents();
        if (typeof renderNotebook === 'function') renderNotebook();
        if (typeof renderHomework === 'function') renderHomework();
        if (typeof renderLotteryHistory === 'function') renderLotteryHistory();
        if (typeof updatePointsStudentSelect === 'function') updatePointsStudentSelect();

        typeof LoadingIndicator !== 'undefined' && LoadingIndicator.hide();
        NotificationSystem && NotificationSystem.success('合併完成！資料已同步 🎉');
        return true;
    } catch (error) {
        console.error('合併失敗:', error);
        typeof LoadingIndicator !== 'undefined' && LoadingIndicator.hide();
        NotificationSystem && NotificationSystem.error('合併失敗: ' + error.message);
        return false;
    }
}

// ─────────────────────────────────────────────────────
// 同步確認 Modal：本地 vs. 雲端詳細差異預覽
// ─────────────────────────────────────────────────────

/**
 * 建立差異預覽 Modal HTML
 * @param {'upload'|'download'} direction
 * @param {Object} local  本地統計
 * @param {Object} cloud  雲端統計（null 表示讀取失敗）
 */
function buildSyncPreviewHTML(direction, local, cloud) {
    const isUpload = direction === 'upload';
    const icon = isUpload ? '📤' : '📥';
    const title = isUpload ? '立即同步（本地 → 雲端）' : '從雲端還原（雲端 → 本地）';
    const warn = isUpload
        ? '⚠️ 雲端資料將被本地資料<b>完整覆蓋</b>，此操作無法復原。'
        : '⚠️ 本地資料將被雲端資料<b>完整覆蓋</b>，未同步的本地變更將遺失。';
    const btnText = isUpload ? '✅ 確認上傳' : '✅ 確認還原';
    const btnClass = isUpload ? 'gauth-btn-primary' : 'gauth-btn-danger';

    const ITEMS = [
        { key: 'students', emoji: '👥', label: '學生名單', unit: '人' },
        { key: 'pointsHistory', emoji: '📊', label: '加扣分記錄', unit: '筆' },
        { key: 'notebookEntries', emoji: '📝', label: '聯絡簿記錄', unit: '則' },
        { key: 'homeworkList', emoji: '📋', label: '作業列表', unit: '份' },
        { key: 'homeworkChecks', emoji: '✔️', label: '作業繳交狀態', unit: '科' },
        { key: 'lotteryHistory', emoji: '🎲', label: '抽籤歷史', unit: '筆' },
        { key: 'announcements', emoji: '📢', label: '班級公告', unit: '則' },
        { key: 'groups', emoji: '🧩', label: '分組記錄', unit: '份' },
        { key: 'examData', emoji: '🎓', label: '考試監考設定', unit: '份' },
        { key: 'clockSettings', emoji: '⏰', label: '時鐘設定', unit: '份' },
    ];

    const rows = ITEMS.map(item => {
        const lv = local[item.key] || 0;
        const cv = cloud ? (cloud[item.key] || 0) : '?';
        const from = isUpload ? lv : cv;
        const to = isUpload ? cv : lv;

        let diffHtml = '';
        if (cloud !== null) {
            const diff = lv - (cloud[item.key] || 0);
            if (diff === 0) {
                diffHtml = `<span style="color:#6b7280">（無變化）</span>`;
            } else {
                const sign = isUpload ? diff : -diff;
                const color = sign > 0 ? '#059669' : '#dc2626';
                diffHtml = `<span style="color:${color};font-weight:600">${sign > 0 ? '+' : ''}${sign} ${item.unit}</span>`;
            }
        }

        const fromLabel = from === '?' ? '<span style="color:#9ca3af">讀取失敗</span>' : `${from} ${item.unit}`;
        const toLabel = to === '?' ? '<span style="color:#9ca3af">讀取失敗</span>' : `${to} ${item.unit}`;

        return `
        <tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:8px 4px;font-size:.95rem">${item.emoji} ${item.label}</td>
          <td style="padding:8px 8px;text-align:right;color:#374151">${fromLabel}</td>
          <td style="padding:8px 4px;color:#9ca3af;text-align:center">→</td>
          <td style="padding:8px 8px;text-align:left;color:#374151">${toLabel}</td>
          <td style="padding:8px 4px;text-align:right">${diffHtml}</td>
        </tr>`;
    }).join('');

    return `
    <div id="sync-preview-modal" style="
        position:fixed;inset:0;z-index:9999;
        background:rgba(0,0,0,.55);backdrop-filter:blur(4px);
        display:flex;align-items:center;justify-content:center;padding:16px;
    ">
      <div style="
          background:#fff;border-radius:1.25rem;width:100%;max-width:520px;
          box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden;
          max-height:90vh;display:flex;flex-direction:column;
      ">
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#3b82f6,#6366f1);padding:18px 24px;color:#fff">
          <div style="font-size:1.4rem;font-weight:700">${icon} ${title}</div>
          <div style="font-size:.85rem;opacity:.85;margin-top:4px">確認後將執行以下資料操作</div>
        </div>

        <!-- Table -->
        <div style="overflow-y:auto;flex:1;padding:0 20px">
          <p style="font-size:.8rem;color:#6b7280;margin:12px 0 4px">
            ${isUpload ? '從' : '從'}<b>${isUpload ? '本地' : '雲端'}</b>→ 覆蓋 <b>${isUpload ? '雲端' : '本地'}</b>
          </p>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:2px solid #e5e7eb">
                <th style="padding:6px 4px;text-align:left;font-size:.8rem;color:#6b7280">資料類別</th>
                <th style="padding:6px 8px;text-align:right;font-size:.8rem;color:#6b7280">${isUpload ? '本地' : '雲端'}</th>
                <th style="padding:6px 4px"></th>
                <th style="padding:6px 8px;text-align:left;font-size:.8rem;color:#6b7280">${isUpload ? '雲端（同步後）' : '本地（還原後）'}</th>
                <th style="padding:6px 4px;text-align:right;font-size:.8rem;color:#6b7280">差異</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>

        <!-- Warning -->
        <div style="margin:12px 20px;padding:10px 14px;background:#fff7ed;border-left:4px solid #f97316;border-radius:6px;font-size:.85rem;color:#92400e">
          ${warn}
        </div>

        <!-- Buttons -->
        <div style="padding:12px 20px 20px;display:flex;gap:10px;justify-content:flex-end">
          <button id="sync-modal-cancel" style="
              padding:9px 20px;border-radius:8px;border:1.5px solid #d1d5db;
              background:#fff;color:#374151;font-size:.9rem;cursor:pointer;font-weight:500;
          ">取消</button>
          <button id="sync-modal-confirm" class="${btnClass}" style="
              padding:9px 22px;border-radius:8px;border:none;
              background:${isUpload ? 'linear-gradient(135deg,#3b82f6,#6366f1)' : 'linear-gradient(135deg,#dc2626,#b91c1c)'};
              color:#fff;font-size:.9rem;cursor:pointer;font-weight:600;
          ">${btnText}</button>
        </div>
      </div>
    </div>`;
}

/**
 * 計算雲端資料統計數量
 */
function getCloudStats(cloudData) {
    if (!cloudData) return null;
    const examSubjects = cloudData.examSubjects;
    return {
        students: (cloudData.students || []).length,
        pointsHistory: (cloudData.pointsHistory || []).length,
        groups: (cloudData.groups || []).length,
        notebookEntries: (cloudData.notebookEntries || []).length,
        homeworkList: (cloudData.homeworkList || []).length,
        homeworkChecks: Object.keys(cloudData.homeworkChecks || {}).length,
        lotteryHistory: (cloudData.lotteryHistory || []).length,
        announcements: (cloudData.announcements || []).length,
        examData: Array.isArray(examSubjects) ? examSubjects.length : (examSubjects ? 1 : 0),
        clockSettings: cloudData.clockSettings ? 1 : 0,
    };
}

/**
 * 顯示同步確認 Modal（上傳 or 下載）
 */
async function showSyncConfirmModal(direction) {
    if (!window.FirebaseConfig.isConnected()) {
        NotificationSystem && NotificationSystem.warning('請先登入 Google 帳號');
        return;
    }

    // 顯示讀取中提示
    const tempDiv = document.createElement('div');
    tempDiv.id = 'sync-loading-tip';
    tempDiv.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:10px 20px;border-radius:24px;z-index:9998;font-size:.9rem';
    tempDiv.textContent = '☁️ 正在讀取雲端狀態...';
    document.body.appendChild(tempDiv);

    // 靜默取得雲端資料作比對
    const cloudData = await syncFromCloud();
    document.getElementById('sync-loading-tip')?.remove();

    const localStats = getLocalStats();
    const cloudStats = getCloudStats(cloudData);

    // 注入 Modal
    const wrap = document.createElement('div');
    wrap.innerHTML = buildSyncPreviewHTML(direction, localStats, cloudStats);
    document.body.appendChild(wrap.firstElementChild);

    return new Promise(resolve => {
        document.getElementById('sync-modal-cancel').addEventListener('click', () => {
            document.getElementById('sync-preview-modal')?.remove();
            resolve(false);
        });
        document.getElementById('sync-modal-confirm').addEventListener('click', async () => {
            document.getElementById('sync-preview-modal')?.remove();
            if (direction === 'upload') {
                await syncToCloud();
            } else {
                // ✅ 直接使用已下載的 cloudData，避免二次讀取 Firebase
                await loadFromCloudData(cloudData);
            }
            resolve(true);
        });
    });
}

// ─────────────────────────────────────────────────────
// 舊版 showSyncDialog（相容保留，改呼叫新 Modal）
// ─────────────────────────────────────────────────────
async function showSyncDialog() {
    await showSyncConfirmModal('upload');
}

// ─────────────────────────────────────────────────────
// 匯出所有資料為 JSON
// ─────────────────────────────────────────────────────
function exportAllData() {
    const exportData = {
        exportDate: new Date().toISOString(),
        students: students || [],
        pointsHistory: pointsHistory || [],
        groups: groups || [],
        notebookEntries: notebookEntries || [],
        homeworkList: homeworkList || [],
        homeworkChecks: homeworkChecks || {},
        lotteryHistory: lotteryHistory || [],
        announcements: safeLS('classAnnouncements', []),
        examSubjects: safeLS('examSubjects', []),
        clockSettings: safeLS('clockSettings', {}),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `班級資料備份_${new Date().toLocaleDateString('zh-TW').replace(/\//g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    NotificationSystem && NotificationSystem.success('資料已完整匯出 ✅');
}

// ─────────────────────────────────────────────────────
// 初始化 Firebase
// ─────────────────────────────────────────────────────
async function initFirebaseAndSync() {
    const initialized = await window.FirebaseConfig.initialize();
    if (!initialized) { console.error('Firebase 初始化失敗'); return false; }
    const userId = await window.FirebaseConfig.signIn();
    if (!userId) { console.error('登入失敗'); return false; }
    updateCloudStatusUI(true);
    return true;
}

function updateCloudStatusUI(connected) {
    const statusEl = document.getElementById('cloud-status');
    if (statusEl) {
        statusEl.innerHTML = connected
            ? '<span class="text-green-600">☁️ 已連線</span>'
            : '<span class="text-gray-400">☁️ 離線</span>';
    }
}

// ─────────────────────────────────────────────────────
// 導出
// ─────────────────────────────────────────────────────
window.FirebaseSync = {
    syncToCloud,
    syncFromCloud,
    loadFromCloud,
    loadFromCloudData,
    mergeWithCloud,
    exportAllData,
    showSyncDialog,
    showSyncConfirmModal,   // 新增：供 UI 直接呼叫
    init: initFirebaseAndSync,
    uploadItem,
    deleteItem,
};

// 頁面載入時自動初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initFirebaseAndSync, 500));
} else {
    setTimeout(initFirebaseAndSync, 500);
}
