/**
 * Firebase 資料同步模組 v3.0.4
 * - 完整涵蓋所有功能模組的資料同步
 * - 新增同步前詳細差異預覽 Modal
 */
console.log('✅ firebase-sync.js v3.0.4 載入完成');

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
 * ⚡ 完全同步模式：先刪除雲端多餘舊文件，再寫入本地資料
 * 確保雲端與本地完全一致，不殘留舊班資料
 */
async function uploadCollection(collectionName, dataArray) {
    try {
        const collection = getUserCollection(collectionName);
        if (!collection) return false;

        const db = window.FirebaseConfig.getDb();
        const localIds = new Set((dataArray || []).map(item => String(item.id)));

        // ① 取得雲端現有所有 ID
        const snapshot = await collection.get();
        const cloudIds = [];
        snapshot.forEach(doc => cloudIds.push(doc.id));

        // ② 批次刪除雲端多餘文件（本地沒有的）
        const toDelete = cloudIds.filter(id => !localIds.has(id));
        if (toDelete.length > 0) {
            const delBatch = db.batch();
            toDelete.forEach(id => delBatch.delete(collection.doc(id)));
            await delBatch.commit();
            console.log(`🗑️ 刪除雲端多餘 ${collectionName}: ${toDelete.length} 筆`);
        }

        // ③ 批次寫入本地資料（空陣列則只做刪除，直接返回）
        if (!dataArray || dataArray.length === 0) return true;

        // Firestore 每次 batch 限 500 筆，分批處理
        const BATCH_SIZE = 400;
        for (let i = 0; i < dataArray.length; i += BATCH_SIZE) {
            const chunk = dataArray.slice(i, i + BATCH_SIZE);
            const writeBatch = db.batch();
            chunk.forEach(item => {
                const docRef = collection.doc(String(item.id));
                writeBatch.set(docRef, { ...item, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            });
            await writeBatch.commit();
        }
        console.log(`✅ 上傳 ${collectionName}: ${dataArray.length} 筆（已清除 ${toDelete.length} 筆舊資料）`);
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
// R-A3：判斷是否為「空白／從未同步」的裝置
// 用來擋掉自動／背景同步從空白裝置上傳，避免把雲端完整資料覆蓋洗掉
// （這次 601~606 名冊被洗掉的根因就是手機首登後背景自動上傳預設空班）
// ─────────────────────────────────────────────────────
function looksLikeBlankDevice() {
    try {
        const neverSynced = !localStorage.getItem('lastSyncTime');
        const noStudents = !(window.students && window.students.length);
        let profiles = [];
        try { profiles = JSON.parse(localStorage.getItem('classProfiles') || '[]'); } catch { profiles = []; }
        const onlyDefault = profiles.filter(p => String(p.id) !== 'default').length === 0;
        return neverSynced && noStudents && onlyDefault;
    } catch { return false; }
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
async function syncToCloud(silent = false) {
    if (!window.FirebaseConfig.isConnected()) {
        if (!silent) NotificationSystem && NotificationSystem.warning('請先登入 Google 帳號');
        return false;
    }
    // R-A3：背景／自動同步時，若這台是「空白且從未同步」的裝置，直接略過上傳，
    //       避免在尚未下載雲端資料前就用空資料覆蓋、洗掉雲端（手動上傳不受此限，會走確認 modal）
    if (silent && looksLikeBlankDevice()) {
        console.warn('[Sync] R-A3：偵測到空白／未同步裝置，略過自動上傳以保護雲端資料');
        return false;
    }
    if (syncStatus.isSyncing) { console.warn('同步進行中...'); return false; }

    syncStatus.isSyncing = true;
    try {
        // silent=true（自動 / 背景同步）：不顯示全螢幕遮罩，避免每次切回頁面就擋住操作；
        // 由 auto-sync.js 自己的右上角小圖示 + 底部靜默 Toast 提供低調回饋。
        if (!silent) typeof LoadingIndicator !== 'undefined' && LoadingIndicator.show('正在同步至雲端...');

        const db = window.FirebaseConfig.getDb();
        const userId = window.FirebaseConfig.getCurrentUserId();
        const annData = safeLS('classAnnouncements', []);

        // 讀取考試監考資料
        const examSubjects = safeLS('examSubjects', []);
        const examReminders = safeLS('examReminders', { exam: [], break: [] });
        const examAttendance = safeLS('examAttendance', {});
        const examAbsenceRecords = safeLS('examAbsenceRecords', {});  // 缺考詳細記錄
        const examDayPresets = safeLS('examDayPresets', null);        // v3.1.6：多日考試預設（第一天/第二天...）
        // 讀取 App 設定
        const clockSettings = safeLS('clockSettings', {});
        const noRepeat = localStorage.getItem('noRepeatLottery');
        // 讀取座位表（依班級隔離，由攔截器處理）
        const seatingConfig = safeLS('seatingConfig', null);
        // 讀取抽籤已抽出 ID 清單（依班級隔離）
        const drawnStudentIds = safeLS('drawnStudentIds', []);
        // UI 偏好（全域，不依班級）
        const examLightMode = localStorage.getItem('examLightMode');
        const examAnalogClock = localStorage.getItem('examAnalogClock');
        const examSoundsEnabled = localStorage.getItem('examSoundsEnabled');
        const homeworkDashboardView = localStorage.getItem('homeworkDashboardView');
        const theme = localStorage.getItem('theme');  // v3.1.6：深色/淺色模式偏好

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
            uploadSingleDoc(COLLECTIONS.EXAM_DATA, 'absenceRecords', { data: examAbsenceRecords }),
            uploadSingleDoc(COLLECTIONS.EXAM_DATA, 'dayPresets', { data: examDayPresets }),  // v3.1.6
            // App 設定（時鐘 + 抽籤偏好 + 座位表 + 已抽 ID + UI 偏好）
            uploadSingleDoc(COLLECTIONS.APP_SETTINGS, 'clock', clockSettings),
            uploadSingleDoc(COLLECTIONS.APP_SETTINGS, 'lottery', {
                noRepeatLottery: noRepeat,
                drawnStudentIds: drawnStudentIds
            }),
            uploadSingleDoc(COLLECTIONS.APP_SETTINGS, 'seating', { data: seatingConfig }),
            uploadSingleDoc(COLLECTIONS.APP_SETTINGS, 'uiPrefs', {
                examLightMode, examAnalogClock, examSoundsEnabled, homeworkDashboardView, theme
            }),
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
        // ⚠️ 合併寫入（只增不減），避免空白裝置覆蓋洗掉雲端完整班級索引
        await uploadClassProfilesMerged();
        await writeCloudSyncInfo();  // R-A5：記錄本次上傳時間

        syncStatus.lastSyncTime = new Date();
        localStorage.setItem('lastSyncTime', syncStatus.lastSyncTime.toISOString());

        // 離線優先佇列：上傳成功後清空待同步 Key，並重整指示器狀態
        localStorage.removeItem('pendingSyncKeys');
        if (window.SyncStatusIndicator && window.SyncStatusIndicator.updateStateBasedOnSync) {
            window.SyncStatusIndicator.updateStateBasedOnSync();
        }

        if (!silent) typeof LoadingIndicator !== 'undefined' && LoadingIndicator.hide();
        if (typeof window.GoogleAuthUI !== 'undefined') {
            window.GoogleAuthUI.refreshSyncTime && window.GoogleAuthUI.refreshSyncTime();
        }
        if (!silent) NotificationSystem && NotificationSystem.success('資料已完整同步至雲端 ☁️');
        console.log('✅ 同步完成:', syncStatus.lastSyncTime);
        return true;
    } catch (error) {
        console.error('同步失敗:', error);
        if (!silent) typeof LoadingIndicator !== 'undefined' && LoadingIndicator.hide();
        if (!silent) NotificationSystem && NotificationSystem.error('同步失敗: ' + error.message);
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
            examSubjectsDoc, examRemindersDoc, examAttendDoc, examAbsenceDoc, examDayPresetsDoc,
            clockDoc, lotterySettingDoc, seatingDoc, uiPrefsDoc
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
            downloadSingleDoc(COLLECTIONS.EXAM_DATA, 'absenceRecords'),
            downloadSingleDoc(COLLECTIONS.EXAM_DATA, 'dayPresets'),  // v3.1.6
            downloadSingleDoc(COLLECTIONS.APP_SETTINGS, 'clock'),
            downloadSingleDoc(COLLECTIONS.APP_SETTINGS, 'lottery'),
            downloadSingleDoc(COLLECTIONS.APP_SETTINGS, 'seating'),
            downloadSingleDoc(COLLECTIONS.APP_SETTINGS, 'uiPrefs'),
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
            examAbsenceRecords: examAbsenceDoc?.data ?? null,   // 新增：缺考詳細記錄
            examDayPresets: examDayPresetsDoc?.data ?? null,    // v3.1.6：多日考試預設
            clockSettings: clockDoc ?? null,
            lotterySettings: lotterySettingDoc ?? null,         // 包含 noRepeatLottery + drawnStudentIds
            seatingConfig: seatingDoc?.data ?? null,            // 新增：座位表
            uiPrefs: uiPrefsDoc ?? null,                        // 新增：UI 偏好（examLightMode/examAnalogClock 等）
            classProfiles: cloudProfiles,
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
            dbSave(window.STUDENTS_KEY || 'students', cloudData.students),
            dbSave(window.POINTS_HISTORY_KEY || 'pointsHistory', cloudData.pointsHistory),
            dbSave(window.GROUPS_KEY || 'groups', cloudData.groups),
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
        // 缺考詳細記錄（含座號、原因等）
        if (cloudData.examAbsenceRecords && Object.keys(cloudData.examAbsenceRecords).length > 0) {
            await dbSave('examAbsenceRecords', cloudData.examAbsenceRecords);
        }
        // v3.1.6：考試多日預設（第一天/第二天... 完整科目清單）
        if (cloudData.examDayPresets && cloudData.examDayPresets.days) {
            await dbSave('examDayPresets', cloudData.examDayPresets);
        }

        // App 設定
        if (cloudData.clockSettings) {
            await dbSave('clockSettings', cloudData.clockSettings);
        }
        if (cloudData.lotterySettings?.noRepeatLottery !== undefined) {
            localStorage.setItem('noRepeatLottery', cloudData.lotterySettings.noRepeatLottery);
        }
        // 抽籤已抽出 ID 清單（依班級隔離，由攔截器處理）
        if (cloudData.lotterySettings?.drawnStudentIds && Array.isArray(cloudData.lotterySettings.drawnStudentIds)) {
            await dbSave('drawnStudentIds', cloudData.lotterySettings.drawnStudentIds);
        }
        // 座位表（依班級隔離）
        if (cloudData.seatingConfig) {
            await dbSave('seatingConfig', cloudData.seatingConfig);
        }
        // UI 偏好（全域）
        if (cloudData.uiPrefs) {
            ['examLightMode', 'examAnalogClock', 'examSoundsEnabled', 'homeworkDashboardView', 'theme'].forEach(k => {
                if (cloudData.uiPrefs[k] !== null && cloudData.uiPrefs[k] !== undefined) {
                    localStorage.setItem(k, cloudData.uiPrefs[k]);
                }
            });
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
        // 重大資料操作：本地資料被雲端覆蓋，不可逆
        try {
            if (window.UsageNotify) {
                const n = (cloudData.students && cloudData.students.length) || 0;
                UsageNotify.dataAction('從雲端還原（覆蓋本地）', `已用雲端資料覆蓋本機，還原 ${n} 位學生`);
            }
        } catch (e) { /* ignore */ }
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
        localStorage.setItem(window.STUDENTS_KEY || 'students', JSON.stringify(students));
        localStorage.setItem(window.POINTS_HISTORY_KEY || 'pointsHistory', JSON.stringify(pointsHistory));
        localStorage.setItem(window.GROUPS_KEY || 'groups', JSON.stringify(groups));
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
function buildSyncPreviewHTML(direction, local, cloud, extraWarnHtml = '') {
    const isUpload = direction === 'upload';
    const icon = isUpload ? '📤' : '📥';
    // 取得目前班級名稱
    const currentClassName = (() => {
        try {
            const profiles = JSON.parse(localStorage.getItem('classProfiles') || '[]');
            const currentId = localStorage.getItem('currentClassId') || 'default';
            if (currentId === 'default') return '預設班級';
            const found = profiles.find(p => String(p.id) === String(currentId));
            return found ? found.name : currentId;
        } catch { return '目前班級'; }
    })();
    const title = isUpload ? `立即同步（本地 → 雲端）` : `從雲端還原（雲端 → 本地）`;
    const warn = isUpload
        ? `⚠️ <b>只同步「${currentClassName}」班的資料</b>至雲端，將完整覆蓋該班雲端資料，此操作無法復原。`
        : `⚠️ <b>只還原「${currentClassName}」班的資料</b>至本地，本地未同步變更將遺失。`;
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
          <div style="font-size:.85rem;opacity:.85;margin-top:4px">⚡ 僅同步 <b style="background:rgba(255,255,255,.2);padding:1px 8px;border-radius:12px">${currentClassName}</b> 班的資料，其他班級不受影響</div>
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
        ${extraWarnHtml || ''}

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

    // R-A3 / R-A5：上傳前的額外風險提示（雲端有更多班 / 雲端較新）
    let extraWarnHtml = '';
    if (direction === 'upload') {
        try {
            const [cloudProfiles, discovered, cloudLastUploadMs] = await Promise.all([
                fetchCloudClassProfiles(), discoverCloudClasses(), fetchCloudLastUploadMs()
            ]);
            const cloudClassIds = new Set([...cloudProfiles, ...discovered].map(p => String(p.id)));
            cloudClassIds.delete('default');
            let localProfiles = [];
            try { localProfiles = JSON.parse(localStorage.getItem('classProfiles') || '[]'); } catch { localProfiles = []; }
            const localClassCount = localProfiles.filter(p => String(p.id) !== 'default').length;
            const localLastSyncMs = Date.parse(localStorage.getItem('lastSyncTime') || '') || 0;

            const warns = [];
            // R-A3：雲端班級數 > 本地（尤其本地只剩預設班）→ 可能洗掉雲端其他班的索引
            if (cloudClassIds.size > localClassCount) {
                warns.push(`☁️ 雲端目前有 <b>${cloudClassIds.size}</b> 個班，本機只有 <b>${localClassCount}</b> 個。上傳<b>只會合併不會刪除</b>雲端班級索引，但若本機資料較少請先確認，避免誤把空班蓋上去。`);
            }
            // R-A5：雲端最後上傳時間 > 本機上次同步時間 → 可能有其他裝置更新
            if (cloudLastUploadMs && cloudLastUploadMs > localLastSyncMs + 60000) {
                const t = new Date(cloudLastUploadMs).toLocaleString('zh-TW');
                warns.push(`🕒 雲端在你上次同步後可能被<b>其他裝置</b>更新過（雲端最後上傳：${t}）。確定要用本機資料覆蓋嗎？`);
            }
            if (warns.length) {
                extraWarnHtml = `<div style="margin:0 20px 4px;padding:10px 14px;background:#fef2f2;border-left:4px solid #ef4444;border-radius:6px;font-size:.82rem;color:#991b1b;line-height:1.6">${warns.join('<br>')}</div>`;
            }
        } catch (e) { /* 提示失敗不擋流程 */ }
    }
    document.getElementById('sync-loading-tip')?.remove();

    const localStats = getLocalStats();
    const cloudStats = getCloudStats(cloudData);

    // 注入 Modal
    const wrap = document.createElement('div');
    wrap.innerHTML = buildSyncPreviewHTML(direction, localStats, cloudStats, extraWarnHtml);
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
// 一鍵同步所有班級（科任老師功能）
/**
 * 由班級名冊組出「所有班級」清單（一鍵同步／一鍵還原的來源）。
 *
 * ⚠️ 這裡有兩個踩過的雷，改動前先看清楚：
 *   1. `default` **本來就在 `classProfiles` 裡**。舊寫法是先硬塞一筆
 *      `{id:'default', name:'預設班級'}` 再把整份名冊攤開，於是 default
 *      出現兩次——UI 會列出「預設班級」和「601」兩列（其實同一個班），
 *      而且同一份資料會被上傳兩遍。所以一定要以 id 去重。
 *   2. default 的名稱要用名冊裡的，不能寫死「預設班級」。老師可以改名
 *      （阿凱把它改成「601」），寫死會讓 UI 顯示成他不認得的名字。
 */
function buildAllClassList(profiles) {
    const list = [];
    const seen = new Set();
    const arr = Array.isArray(profiles) ? profiles : [];

    // default 固定排第一個，名稱優先取名冊裡的
    const def = arr.find(p => p && String(p.id) === 'default');
    list.push({ id: 'default', name: (def && def.name) || '預設班級' });
    seen.add('default');

    arr.forEach((p) => {
        if (!p || p.id == null) return;
        const id = String(p.id);
        if (seen.has(id)) return;
        seen.add(id);
        list.push({ id, name: p.name || id });
    });
    return list;
}

// ─────────────────────────────────────────────────────

/**
 * 根據明確的 classId 取得 Firestore collection ref
 * 不依賴 localStorage.currentClassId，供全班迴圈使用
 */
function getUserCollectionForClass(collectionName, classId) {
    const db = window.FirebaseConfig.getDb();
    const userId = window.FirebaseConfig.getCurrentUserId();
    if (!db || !userId) return null;
    if (!classId || classId === 'default') {
        return db.collection('users').doc(userId).collection(collectionName);
    }
    return db.collection('users').doc(userId)
        .collection('classes').doc(String(classId)).collection(collectionName);
}

/**
 * 針對指定班級上傳 collection（先刪多餘再寫入）
 */
async function uploadCollectionForClass(collectionName, dataArray, classId) {
    try {
        const collection = getUserCollectionForClass(collectionName, classId);
        if (!collection) return false;
        const db = window.FirebaseConfig.getDb();
        const localIds = new Set((dataArray || []).map(item => String(item.id)));

        // ① 取得雲端現有 ID，刪除多餘
        const snapshot = await collection.get();
        const cloudIds = [];
        snapshot.forEach(doc => cloudIds.push(doc.id));
        const toDelete = cloudIds.filter(id => !localIds.has(id));
        if (toDelete.length > 0) {
            const delBatch = db.batch();
            toDelete.forEach(id => delBatch.delete(collection.doc(id)));
            await delBatch.commit();
        }

        // ② 批次寫入
        if (!dataArray || dataArray.length === 0) return true;
        const BATCH_SIZE = 400;
        for (let i = 0; i < dataArray.length; i += BATCH_SIZE) {
            const chunk = dataArray.slice(i, i + BATCH_SIZE);
            const writeBatch = db.batch();
            chunk.forEach(item => {
                writeBatch.set(collection.doc(String(item.id)), {
                    ...item,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            await writeBatch.commit();
        }
        return true;
    } catch (err) {
        console.error(`[AllSync] uploadCollectionForClass ${collectionName} 失敗:`, err);
        return false;
    }
}

/**
 * 一鍵同步所有班級到雲端
 * @param {Function} onProgress - 進度回呼 (classIndex, total, className, status)
 */
async function syncAllClassesToCloud(onProgress) {
    if (syncStatus.isSyncing) return { success: 0, failed: 0, results: [] };
    if (!window.FirebaseConfig.isConnected()) {
        NotificationSystem && NotificationSystem.warning('請先登入 Google 帳號');
        return null;
    }
    syncStatus.isSyncing = true;
    const results = [];

    try {
        const profiles = JSON.parse(localStorage.getItem('classProfiles') || '[]');
        const allClasses = buildAllClassList(profiles);   // 含 default、已去重

        const db = window.FirebaseConfig.getDb();
        const userId = window.FirebaseConfig.getCurrentUserId();

        for (let i = 0; i < allClasses.length; i++) {
            const cls = allClasses[i];
            const classId = cls.id;
            onProgress && onProgress(i, allClasses.length, cls.name, 'syncing');

            // 讀取各班 localStorage 資料
            // ⚠️ 重要：必須繞過 ClassAwareStorage 攔截器，直接讀取每個班級的 per-class key
            //         否則會永遠讀到當前班級的資料，覆蓋其他班級
            const _raw = window.ClassAwareStorage?.rawGet
                ? window.ClassAwareStorage.rawGet
                : (k) => localStorage.getItem(k);
            const _classKey = (k) => (classId === 'default' ? k : `${k}-${classId}`);

            // class-isolated keys
            const localStudents = JSON.parse(_raw(_classKey('students')) || '[]');
            const localGroups = JSON.parse(_raw(_classKey('groups')) || '[]');
            const localPoints = JSON.parse(_raw(_classKey('pointsHistory')) || '[]');
            const localNotebooks = JSON.parse(_raw(_classKey('notebookEntries')) || '[]');
            const localHomeworks = JSON.parse(_raw(_classKey('homeworkList')) || '[]');
            const localLottery = JSON.parse(_raw(_classKey('lotteryHistory')) || '[]');
            const localAnn = JSON.parse(_raw(_classKey('classAnnouncements')) || '[]');
            const examSubjects = JSON.parse(_raw(_classKey('examSubjects')) || '[]');
            const examReminders = JSON.parse(_raw(_classKey('examReminders')) || 'null');
            const examAttendance = JSON.parse(_raw(_classKey('examAttendance')) || '{}');
            const examAbsenceRecords = JSON.parse(_raw(_classKey('examAbsenceRecords')) || '{}');
            const examDayPresets = JSON.parse(_raw(_classKey('examDayPresets')) || 'null');  // v3.1.6：多日考試
            const seatingConfig = JSON.parse(_raw(_classKey('seatingConfig')) || 'null');
            const drawnStudentIds = JSON.parse(_raw(_classKey('drawnStudentIds')) || '[]');
            const localChecks = JSON.parse(_raw(_classKey('homeworkChecks')) || '{}');

            // global keys (UI 偏好 / 系統設定，跨班共用)
            const clockSettings = JSON.parse(_raw('clockSettings') || '{}');
            const noRepeat = _raw('noRepeatLottery');
            const examLightMode = _raw('examLightMode');
            const examAnalogClock = _raw('examAnalogClock');
            const examSoundsEnabled = _raw('examSoundsEnabled');
            const homeworkDashboardView = _raw('homeworkDashboardView');
            const theme = _raw('theme');  // v3.1.6：深色/淺色模式

            try {
                await Promise.all([
                    uploadCollectionForClass(COLLECTIONS.STUDENTS, localStudents, classId),
                    uploadCollectionForClass(COLLECTIONS.GROUPS, localGroups, classId),
                    uploadCollectionForClass(COLLECTIONS.POINTS_HISTORY, localPoints, classId),
                    uploadCollectionForClass(COLLECTIONS.NOTEBOOKS, localNotebooks, classId),
                    uploadCollectionForClass(COLLECTIONS.HOMEWORKS, localHomeworks, classId),
                    uploadCollectionForClass(COLLECTIONS.LOTTERY_HISTORY, localLottery, classId),
                    uploadCollectionForClass(COLLECTIONS.ANNOUNCEMENTS, localAnn, classId),
                    // 考試監考設定（單一 doc）
                    (async () => {
                        const col = getUserCollectionForClass(COLLECTIONS.EXAM_DATA, classId);
                        if (col) {
                            const db = window.FirebaseConfig.getDb();
                            const b = db.batch();
                            b.set(col.doc('subjects'), { data: examSubjects, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                            b.set(col.doc('reminders'), { data: examReminders, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                            b.set(col.doc('attendance'), { data: examAttendance, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                            b.set(col.doc('absenceRecords'), { data: examAbsenceRecords, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                            b.set(col.doc('dayPresets'), { data: examDayPresets, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });  // v3.1.6
                            await b.commit();
                        }
                    })(),
                    // App 設定（時鐘 + 抽籤偏好+已抽 ID + 座位表 + UI 偏好）
                    (async () => {
                        const col = getUserCollectionForClass(COLLECTIONS.APP_SETTINGS, classId);
                        if (col) {
                            const db = window.FirebaseConfig.getDb();
                            const b = db.batch();
                            b.set(col.doc('clock'), { ...clockSettings, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                            b.set(col.doc('lottery'), {
                                noRepeatLottery: noRepeat,
                                drawnStudentIds: drawnStudentIds,
                                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                            });
                            b.set(col.doc('seating'), { data: seatingConfig, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                            b.set(col.doc('uiPrefs'), {
                                examLightMode, examAnalogClock, examSoundsEnabled, homeworkDashboardView, theme,
                                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                            });
                            await b.commit();
                        }
                    })(),
                    // 作業繳交狀態
                    (async () => {
                        if (!localChecks || Object.keys(localChecks).length === 0) return;
                        const col = getUserCollectionForClass(COLLECTIONS.HOMEWORK_CHECKS, classId);
                        if (!col) return;
                        for (const [hwId, checks] of Object.entries(localChecks)) {
                            await col.doc(String(hwId)).set({ checks, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                        }
                    })(),
                ]);
                results.push({ name: cls.name, status: 'ok', count: localStudents.length });
                onProgress && onProgress(i + 1, allClasses.length, cls.name, 'ok', localStudents.length);
            } catch (err) {
                results.push({ name: cls.name, status: 'fail', error: err.message });
                onProgress && onProgress(i + 1, allClasses.length, cls.name, 'fail');
            }
        }

        // 同步班級清單 meta（合併寫入，只增不減，避免洗掉雲端既有班級索引）
        await uploadClassProfilesMerged();
        await writeCloudSyncInfo();  // R-A5：記錄本次上傳時間

        syncStatus.lastSyncTime = new Date();
        localStorage.setItem('lastSyncTime', syncStatus.lastSyncTime.toISOString());

    } finally {
        syncStatus.isSyncing = false;
    }
    return results;
}

/**
 * 顯示一鍵同步所有班級的進度 Modal
 */
async function showAllClassSyncModal() {
    // 移除既有 Modal
    const existId = 'all-class-sync-modal';
    document.getElementById(existId)?.remove();

    const profiles = JSON.parse(localStorage.getItem('classProfiles') || '[]');
    const allClasses = buildAllClassList(profiles);   // 含 default、已去重
    const total = allClasses.length;

    // 建立 Modal
    const wrap = document.createElement('div');
    wrap.id = existId;
    wrap.style.cssText = `
        position:fixed; inset:0; z-index:99999;
        background:rgba(0,0,0,.55); backdrop-filter:blur(4px);
        display:flex; align-items:center; justify-content:center; padding:16px;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
        background:#fff; border-radius:20px; padding:28px 32px; max-width:480px; width:100%;
        box-shadow:0 24px 80px rgba(0,0,0,.22); font-family:inherit;
    `;

    const renderInitial = () => {
        const rows = allClasses.map((cls, i) =>
            `<div id="acsm-row-${i}" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0f0f0;">
                <span id="acsm-icon-${i}" style="font-size:1.2rem;width:24px;text-align:center;">⬜</span>
                <span style="flex:1;font-weight:600;color:#374151;">${cls.name}</span>
                <span id="acsm-info-${i}" style="color:#9ca3af;font-size:.85rem;"></span>
            </div>`
        ).join('');

        card.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
                <span style="font-size:1.6rem;">🌐</span>
                <div>
                    <div style="font-weight:700;font-size:1.1rem;color:#1e293b;">一鍵同步所有班級</div>
                    <div style="color:#64748b;font-size:.88rem;">本地 → 雲端，共 ${total} 個班級</div>
                </div>
            </div>
            <div style="background:#f0f9ff;border-radius:10px;padding:8px 14px;margin-bottom:16px;">
                <div style="display:flex;justify-content:space-between;font-size:.85rem;color:#0369a1;margin-bottom:6px;">
                    <span id="acsm-label">準備同步...</span>
                    <span id="acsm-counter">0 / ${total}</span>
                </div>
                <div style="background:#bae6fd;border-radius:999px;height:8px;">
                    <div id="acsm-bar" style="background:linear-gradient(90deg,#0ea5e9,#06b6d4);height:8px;border-radius:999px;width:0%;transition:width .4s ease;"></div>
                </div>
            </div>
            <div style="max-height:300px;overflow-y:auto;">${rows}</div>
            <div style="margin-top:20px;text-align:right;">
                <button id="acsm-close-btn" onclick="document.getElementById('${existId}').remove()"
                    style="padding:10px 28px;background:#6b7280;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:600;font-size:.95rem;">
                    取消
                </button>
            </div>
        `;
    };
    renderInitial();
    wrap.appendChild(card);
    document.body.appendChild(wrap);

    // 更新進度的回呼
    const onProgress = (done, total, name, status, count) => {
        const bar = document.getElementById('acsm-bar');
        const label = document.getElementById('acsm-label');
        const counter = document.getElementById('acsm-counter');
        const idx = done - (status === 'syncing' ? 0 : 1);

        if (bar) bar.style.width = `${Math.round((done / total) * 100)}%`;
        if (counter) counter.textContent = `${done} / ${total}`;

        if (status === 'syncing') {
            if (label) label.textContent = `正在同步：${name}...`;
            const icon = document.getElementById(`acsm-icon-${idx}`);
            const info = document.getElementById(`acsm-info-${idx}`);
            if (icon) icon.textContent = '⏳';
            if (info) info.textContent = '同步中...';
        } else if (status === 'ok') {
            if (label) label.textContent = `已完成：${name}`;
            const rowIdx = done - 1;
            const icon = document.getElementById(`acsm-icon-${rowIdx}`);
            const info = document.getElementById(`acsm-info-${rowIdx}`);
            if (icon) icon.textContent = '✅';
            if (info) info.textContent = `${count} 人`;
        } else if (status === 'fail') {
            const rowIdx = done - 1;
            const icon = document.getElementById(`acsm-icon-${rowIdx}`);
            const info = document.getElementById(`acsm-info-${rowIdx}`);
            if (icon) icon.textContent = '❌';
            if (info) { info.textContent = '失敗'; info.style.color = '#ef4444'; }
        }
    };

    // 執行
    const results = await syncAllClassesToCloud(onProgress);

    // 完成
    const bar = document.getElementById('acsm-bar');
    const label = document.getElementById('acsm-label');
    const counter = document.getElementById('acsm-counter');
    const closeBtn = document.getElementById('acsm-close-btn');
    if (bar) bar.style.width = '100%';
    if (counter) counter.textContent = `${total} / ${total}`;

    if (results) {
        const failed = results.filter(r => r.status === 'fail').length;
        if (label) {
            label.textContent = failed === 0
                ? `✅ 所有 ${total} 個班級同步完成！`
                : `⚠️ ${total - failed} 班成功，${failed} 班失敗`;
            label.style.color = failed === 0 ? '#16a34a' : '#d97706';
        }
        if (closeBtn) {
            closeBtn.textContent = '完成';
            closeBtn.style.background = failed === 0 ? '#16a34a' : '#d97706';
        }
        NotificationSystem && NotificationSystem.success(`所有班級同步完成 🌐`);
    }
}


// ─────────────────────────────────────────────────────
// 班級清單（classProfiles）雲端 → 本地 合併
// ─────────────────────────────────────────────────────

/**
 * 從雲端 _meta/classProfiles 取得班級清單（不寫入本地）
 * @returns {Promise<Array>} 雲端班級陣列（無則回傳 []）
 */
async function fetchCloudClassProfiles() {
    try {
        if (!window.FirebaseConfig.isConnected()) return [];
        const db = window.FirebaseConfig.getDb();
        const userId = window.FirebaseConfig.getCurrentUserId();
        const metaDoc = await db.collection('users').doc(userId)
            .collection('_meta').doc('classProfiles').get();
        if (metaDoc.exists && Array.isArray(metaDoc.data().profiles)) {
            return metaDoc.data().profiles;
        }
    } catch (e) {
        console.warn('[MultiClass] 讀取雲端 classProfiles 失敗:', e);
    }
    return [];
}

/**
 * R-A1：在 classes/{classId} 文件「本身」寫一筆 marker（含班名/圖示/顏色）。
 * 原本班級資料都寫在 classes/{id} 的「子集合」，classes/{id} 文件本身是無欄位的 phantom，
 * client 端 collection('classes').get() 看不到 → 一旦 _meta/classProfiles 名冊掉了就完全找不到班。
 * 寫了 marker 後，前端可直接列舉 classes/ 發現所有班級，達成「名冊自我修復」。
 */
async function writeClassMarker(classId, profile) {
    try {
        if (!classId || String(classId) === 'default') return; // default 不走 classes/ 子路徑
        const db = window.FirebaseConfig.getDb();
        const userId = window.FirebaseConfig.getCurrentUserId();
        if (!db || !userId) return;
        await db.collection('users').doc(userId).collection('classes').doc(String(classId)).set({
            isClassMarker: true,
            name: profile?.name || String(classId),
            icon: profile?.icon || null,
            color: profile?.color || null,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    } catch (e) {
        console.warn(`[MultiClass] 寫入班級 marker ${classId} 失敗（非致命）:`, e);
    }
}

/**
 * R-A1：直接列舉雲端 classes/ 子集合中「帶 marker 的班級文件」。
 * 只會回傳「有欄位的真實文件」（phantom 父文件 client 讀不到），所以回來的都是 marker。
 * @returns {Promise<Array>} [{id,name,icon,color}]
 */
async function discoverCloudClasses() {
    try {
        if (!window.FirebaseConfig.isConnected()) return [];
        const db = window.FirebaseConfig.getDb();
        const userId = window.FirebaseConfig.getCurrentUserId();
        const snap = await db.collection('users').doc(userId).collection('classes').get();
        const arr = [];
        snap.forEach(doc => {
            const d = doc.data() || {};
            arr.push({ id: doc.id, name: d.name || doc.id, icon: d.icon || undefined, color: d.color || undefined });
        });
        return arr;
    } catch (e) {
        console.warn('[MultiClass] 列舉雲端 classes/ marker 失敗:', e);
        return [];
    }
}

/**
 * 抓雲端班級清單並合併進本地 localStorage（雲端優先 + 保留本地獨有）
 * 解決「新裝置首次登入只看得到預設班、還原所有班級也只還原預設班」的問題：
 * 還原流程必須先知道雲端有哪些班級，不能只依賴本地（新裝置本地是空的）。
 * R-A1：除了 _meta/classProfiles，也合併 classes/ 的 marker（名冊掉了也能自我修復找回班級）。
 * @returns {Promise<Array>} 合併後的班級陣列（一定含 default）
 */
async function syncClassProfilesFromCloud() {
    const [cloudProfiles, discovered] = await Promise.all([
        fetchCloudClassProfiles(),
        discoverCloudClasses(),
    ]);
    let localProfiles = [];
    try { localProfiles = JSON.parse(localStorage.getItem('classProfiles') || '[]'); } catch { localProfiles = []; }

    // 以 id 為鍵合併三來源：_meta 名冊 → classes/ marker 補名稱 → 本地獨有附加
    const byId = new Map();
    cloudProfiles.forEach(p => { if (p && p.id != null) byId.set(String(p.id), { ...p }); });
    // marker 補進「名冊裡沒有」的班；名冊裡已有的，只在缺名稱時用 marker 名稱補
    discovered.forEach(m => {
        const k = String(m.id);
        if (!byId.has(k)) byId.set(k, { id: k, name: m.name, icon: m.icon, color: m.color });
        else {
            const ex = byId.get(k);
            if (!ex.name || ex.name === k) ex.name = m.name;
            if (!ex.icon && m.icon) ex.icon = m.icon;
            if (!ex.color && m.color) ex.color = m.color;
        }
    });
    // 本地獨有（雲端兩來源都沒有）附加
    localProfiles.forEach(p => { if (p && p.id != null && !byId.has(String(p.id))) byId.set(String(p.id), p); });

    let merged = Array.from(byId.values());

    // 確保一定有 default
    if (!merged.find(p => String(p.id) === 'default')) {
        merged.unshift({ id: 'default', name: '預設班級', isDefault: true, createdAt: new Date().toISOString() });
    }

    // 只要雲端任一來源有「非 default」班級，就把合併結果寫回本地名冊
    const cloudHasReal = cloudProfiles.some(p => String(p.id) !== 'default') || discovered.length > 0;
    if (cloudHasReal) {
        try {
            localStorage.setItem('classProfiles', JSON.stringify(merged));
            console.log(`[MultiClass] 已從雲端（_meta + classes marker）合併班級清單（${merged.length} 個班級）`);
        } catch (e) { console.warn('[MultiClass] 寫入合併後 classProfiles 失敗:', e); }
    }
    return merged;
}

/**
 * 把本地班級清單「合併（只增不減）」寫回雲端 _meta/classProfiles。
 * ⚠️ 絕對不能直接覆蓋：空白／新裝置本地只有 default，若覆蓋會把雲端完整班級索引洗掉
 *    （實際發生過：手機首登後背景同步把雲端 601~606 名冊蓋成只剩預設班，班級資料還在卻「找不到」）。
 * 合併規則：以雲端既有為底，本地同 id 者覆蓋（更新名稱/圖示），本地新增者附加；雙方聯集，不刪任何一邊。
 */
async function uploadClassProfilesMerged() {
    try {
        const db = window.FirebaseConfig.getDb();
        const userId = window.FirebaseConfig.getCurrentUserId();
        let localProfiles = [];
        try { localProfiles = JSON.parse(localStorage.getItem('classProfiles') || '[]'); } catch { localProfiles = []; }

        const cloudProfiles = await fetchCloudClassProfiles();

        // 以 id 為鍵聯集：先放雲端，再用本地覆蓋/附加
        const byId = new Map();
        cloudProfiles.forEach(p => { if (p && p.id != null) byId.set(String(p.id), p); });
        localProfiles.forEach(p => { if (p && p.id != null) byId.set(String(p.id), { ...byId.get(String(p.id)), ...p }); });

        const merged = Array.from(byId.values());
        if (merged.length === 0) return;

        await db.collection('users').doc(userId)
            .collection('_meta').doc('classProfiles')
            .set({ profiles: merged, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });

        // R-A1：同時為每個「本地有的」非 default 班級寫 classes/{id} marker，達成名冊自我修復
        //   （只為本地 profile 寫，避免把雲端獨有的也亂寫；雲端獨有者其資料本就在、discover 也找得到）
        await Promise.all(
            localProfiles
                .filter(p => p && p.id != null && String(p.id) !== 'default')
                .map(p => writeClassMarker(p.id, p))
        );

        console.log(`[MultiClass] classProfiles 已合併同步至雲端（${merged.length} 個班級，不洗掉雲端既有）+ 寫入班級 marker`);
    } catch (e) {
        console.warn('[MultiClass] classProfiles 合併同步失敗（非致命）:', e);
    }
}

/**
 * R-A4：班級健檢與修復——掃描雲端（_meta 名冊 + classes/ marker），
 * 把「有資料卻不在本地名冊」的班級補回本地與雲端名冊（孤兒班級自助修復）。
 * @returns {Promise<{beforeCount:number, afterCount:number, recovered:number, names:string[]}|null>}
 */
async function repairClassRegistry() {
    if (!window.FirebaseConfig.isConnected()) {
        NotificationSystem && NotificationSystem.warning('請先登入 Google 帳號');
        return null;
    }
    let before = [];
    try { before = JSON.parse(localStorage.getItem('classProfiles') || '[]'); } catch { before = []; }
    const beforeCount = before.filter(p => String(p.id) !== 'default').length;

    // 1) 合併雲端 _meta + classes/ marker 進本地名冊
    const merged = await syncClassProfilesFromCloud();
    // 2) 合併後再寫回雲端（補齊 _meta 與各班 marker），讓雲端也自我修復
    await uploadClassProfilesMerged();
    await writeCloudSyncInfo();

    const afterList = merged.filter(p => String(p.id) !== 'default');
    const afterCount = afterList.length;

    // 重繪班級選擇器（若已載入）
    try {
        if (window.ClassProfiles && typeof window.ClassProfiles.list === 'function') {
            const dd = document.getElementById('class-selector-dropdown');
            const ddm = document.getElementById('class-selector-dropdown-mobile');
            // 觸發重新 render（toggle 兩次或直接重載較保險）；這裡只清掉讓下次開啟重繪
            if (dd) dd.classList.remove('open');
            if (ddm) ddm.style.display = 'none';
        }
    } catch (e) { /* ignore */ }

    return {
        beforeCount, afterCount,
        recovered: Math.max(0, afterCount - beforeCount),
        names: afterList.map(p => p.name),
    };
}

/**
 * R-A5：把「本次上傳時間」寫到雲端 _meta/syncInfo，供其他裝置判斷雲端是否較新。
 */
async function writeCloudSyncInfo() {
    try {
        const db = window.FirebaseConfig.getDb();
        const userId = window.FirebaseConfig.getCurrentUserId();
        if (!db || !userId) return;
        await db.collection('users').doc(userId).collection('_meta').doc('syncInfo').set({
            lastUploadAt: firebase.firestore.FieldValue.serverTimestamp(),
            device: (navigator.userAgent || '').slice(0, 80),
        }, { merge: true });
    } catch (e) { /* 非致命 */ }
}

/**
 * R-A5：讀雲端最後上傳時間（毫秒）。讀不到回 0。
 */
async function fetchCloudLastUploadMs() {
    try {
        if (!window.FirebaseConfig.isConnected()) return 0;
        const db = window.FirebaseConfig.getDb();
        const userId = window.FirebaseConfig.getCurrentUserId();
        const doc = await db.collection('users').doc(userId).collection('_meta').doc('syncInfo').get();
        const v = doc.exists ? doc.data().lastUploadAt : null;
        if (v && typeof v.toMillis === 'function') return v.toMillis();
    } catch (e) { /* ignore */ }
    return 0;
}

/**
 * R-A2：刪除班級時，從雲端「明確移除」名冊項與 marker。
 * 因為上傳名冊改成「只增不減」的合併，若刪班只刪本地，雲端仍留著該班 → 合併時又被加回（殭屍班）。
 * 所以刪班必須主動把雲端 _meta/classProfiles 的該項移除，並刪掉 classes/{id} marker 文件。
 * （該班的子集合資料留著不主動遞迴刪——client 無遞迴刪除；移除名冊+marker 後它不會再被列出/還原）
 */
async function deleteClassFromCloud(classId) {
    try {
        if (!classId || String(classId) === 'default') return false;
        if (!window.FirebaseConfig.isConnected()) return false;
        const db = window.FirebaseConfig.getDb();
        const userId = window.FirebaseConfig.getCurrentUserId();

        // 1) 從 _meta/classProfiles 移除該班
        const cloud = await fetchCloudClassProfiles();
        const removed = cloud.find(p => String(p.id) === String(classId));
        const filtered = cloud.filter(p => String(p.id) !== String(classId));
        if (filtered.length !== cloud.length) {
            await db.collection('users').doc(userId)
                .collection('_meta').doc('classProfiles')
                .set({ profiles: filtered, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        }
        // 2) 刪除 classes/{id} marker 文件（避免 discover 又把它找回來）
        await db.collection('users').doc(userId).collection('classes').doc(String(classId)).delete();

        console.log(`[MultiClass] R-A2：已從雲端移除班級 ${classId}（名冊 + marker）`);
        // 重大資料操作：不可逆，即時通知開發者
        try {
            if (window.UsageNotify) {
                UsageNotify.dataAction('刪除班級',
                    `班級「${(removed && removed.name) || classId}」已自雲端移除（名冊 + marker），剩餘 ${filtered.length} 班`);
            }
        } catch (e) { /* ignore */ }
        return true;
    } catch (e) {
        console.warn(`[MultiClass] R-A2：雲端移除班級 ${classId} 失敗（非致命）:`, e);
        return false;
    }
}

// ─────────────────────────────────────────────────────
// 一鍵從雲端還原所有班級到本地（科任老師回家用）
// ─────────────────────────────────────────────────────

/**
 * 從雲端下載所有班級資料，寫入各班 localStorage
 * @param {Function} onProgress - 進度回呼 (done, total, name, status, count)
 */
async function syncAllClassesFromCloud(onProgress) {
    if (syncStatus.isSyncing) return null;
    if (!window.FirebaseConfig.isConnected()) {
        NotificationSystem && NotificationSystem.warning('請先登入 Google 帳號');
        return null;
    }
    syncStatus.isSyncing = true;
    const results = [];

    try {
        // ⚡ 先從雲端 _meta 取得完整班級清單並合併進本地，
        //    否則新裝置本地只有 default，這個迴圈永遠只還原預設班（601~606 不會被發現）
        const profiles = await syncClassProfilesFromCloud();
        const allClasses = buildAllClassList(profiles);   // 含 default、已去重

        for (let i = 0; i < allClasses.length; i++) {
            const cls = allClasses[i];
            const classId = cls.id;
            onProgress && onProgress(i, allClasses.length, cls.name, 'syncing');

            // 用 raw 寫入避開 ClassAwareStorage 攔截，明確指定每個班級的 key
            const _rawSet = window.ClassAwareStorage?.rawSet
                ? window.ClassAwareStorage.rawSet
                : (k, v) => localStorage.setItem(k, v);
            const _classKey = (k) => (classId === 'default' ? k : `${k}-${classId}`);

            try {
                // 從對應班級的 Firebase 路徑下載
                const [
                    cloudStudents, cloudGroups, cloudPoints,
                    cloudNotebooks, cloudHomeworks, cloudLottery, cloudAnn
                ] = await Promise.all([
                    (async () => { const col = getUserCollectionForClass(COLLECTIONS.STUDENTS, classId); if (!col) return []; const s = await col.get(); return s.docs.map(d => ({ id: d.id, ...d.data() })); })(),
                    (async () => { const col = getUserCollectionForClass(COLLECTIONS.GROUPS, classId); if (!col) return []; const s = await col.get(); return s.docs.map(d => ({ id: d.id, ...d.data() })); })(),
                    (async () => { const col = getUserCollectionForClass(COLLECTIONS.POINTS_HISTORY, classId); if (!col) return []; const s = await col.get(); return s.docs.map(d => ({ id: d.id, ...d.data() })); })(),
                    (async () => { const col = getUserCollectionForClass(COLLECTIONS.NOTEBOOKS, classId); if (!col) return []; const s = await col.get(); return s.docs.map(d => ({ id: d.id, ...d.data() })); })(),
                    (async () => { const col = getUserCollectionForClass(COLLECTIONS.HOMEWORKS, classId); if (!col) return []; const s = await col.get(); return s.docs.map(d => ({ id: d.id, ...d.data() })); })(),
                    (async () => { const col = getUserCollectionForClass(COLLECTIONS.LOTTERY_HISTORY, classId); if (!col) return []; const s = await col.get(); return s.docs.map(d => ({ id: d.id, ...d.data() })); })(),
                    (async () => { const col = getUserCollectionForClass(COLLECTIONS.ANNOUNCEMENTS, classId); if (!col) return []; const s = await col.get(); return s.docs.map(d => ({ id: d.id, ...d.data() })); })(),
                ]);

                // 寫入該班級的 per-class localStorage（每個班級獨立保存，不互相覆蓋！）
                _rawSet(_classKey('students'), JSON.stringify(cloudStudents));
                _rawSet(_classKey('groups'), JSON.stringify(cloudGroups));
                _rawSet(_classKey('pointsHistory'), JSON.stringify(cloudPoints));
                _rawSet(_classKey('notebookEntries'), JSON.stringify(cloudNotebooks));
                _rawSet(_classKey('homeworkList'), JSON.stringify(cloudHomeworks));
                _rawSet(_classKey('lotteryHistory'), JSON.stringify(cloudLottery));
                _rawSet(_classKey('classAnnouncements'), JSON.stringify(cloudAnn));

                // 寫入該班級的考試監考設定
                const colExam = getUserCollectionForClass(COLLECTIONS.EXAM_DATA, classId);
                if (colExam) {
                    const [subjDoc, remDoc, attDoc, absDoc, dayDoc] = await Promise.all([
                        colExam.doc('subjects').get(),
                        colExam.doc('reminders').get(),
                        colExam.doc('attendance').get(),
                        colExam.doc('absenceRecords').get(),
                        colExam.doc('dayPresets').get(),  // v3.1.6
                    ]);
                    if (subjDoc.exists && subjDoc.data().data?.length) _rawSet(_classKey('examSubjects'), JSON.stringify(subjDoc.data().data));
                    if (remDoc.exists && remDoc.data().data) _rawSet(_classKey('examReminders'), JSON.stringify(remDoc.data().data));
                    if (attDoc.exists && Object.keys(attDoc.data().data || {}).length) _rawSet(_classKey('examAttendance'), JSON.stringify(attDoc.data().data));
                    if (absDoc.exists && absDoc.data().data) _rawSet(_classKey('examAbsenceRecords'), JSON.stringify(absDoc.data().data));
                    // v3.1.6：多日考試預設
                    if (dayDoc.exists && dayDoc.data().data && dayDoc.data().data.days) {
                        _rawSet(_classKey('examDayPresets'), JSON.stringify(dayDoc.data().data));
                    }
                }
                // App 設定
                const colApp = getUserCollectionForClass(COLLECTIONS.APP_SETTINGS, classId);
                if (colApp) {
                    const [clockDoc, lotteryDoc, seatingDoc, uiPrefsDoc] = await Promise.all([
                        colApp.doc('clock').get(),
                        colApp.doc('lottery').get(),
                        colApp.doc('seating').get(),
                        colApp.doc('uiPrefs').get(),
                    ]);
                    // 時鐘設定（全域，最後一班會覆蓋；可接受因為是 UI 偏好）
                    if (clockDoc.exists) _rawSet('clockSettings', JSON.stringify(clockDoc.data()));
                    // 抽籤偏好 + 已抽 ID
                    if (lotteryDoc.exists) {
                        const ld = lotteryDoc.data();
                        if (ld.noRepeatLottery !== undefined) _rawSet('noRepeatLottery', String(ld.noRepeatLottery));
                        if (Array.isArray(ld.drawnStudentIds)) _rawSet(_classKey('drawnStudentIds'), JSON.stringify(ld.drawnStudentIds));
                    }
                    // 座位表（per-class）
                    if (seatingDoc.exists && seatingDoc.data().data) {
                        _rawSet(_classKey('seatingConfig'), JSON.stringify(seatingDoc.data().data));
                    }
                    // UI 偏好（全域）
                    if (uiPrefsDoc.exists) {
                        const u = uiPrefsDoc.data();
                        ['examLightMode', 'examAnalogClock', 'examSoundsEnabled', 'homeworkDashboardView', 'theme'].forEach(k => {
                            if (u[k] !== null && u[k] !== undefined) _rawSet(k, String(u[k]));
                        });
                    }
                }
                // 作業繳交狀態（per-class）
                const colChecks = getUserCollectionForClass(COLLECTIONS.HOMEWORK_CHECKS, classId);
                if (colChecks) {
                    const checksSnap = await colChecks.get();
                    if (!checksSnap.empty) {
                        const checks = {};
                        checksSnap.forEach(doc => { checks[doc.id] = doc.data().checks || {}; });
                        _rawSet(_classKey('homeworkChecks'), JSON.stringify(checks));
                    }
                }

                results.push({ name: cls.name, status: 'ok', count: cloudStudents.length });
                onProgress && onProgress(i + 1, allClasses.length, cls.name, 'ok', cloudStudents.length);
            } catch (err) {
                console.error(`[AllSync] 雲端→本地 ${cls.name} 失敗:`, err);
                results.push({ name: cls.name, status: 'fail', error: err.message });
                onProgress && onProgress(i + 1, allClasses.length, cls.name, 'fail');
            }
        }

        // 若目前班級資料被覆蓋，刷新全域變數
        try {
            const curId = localStorage.getItem('currentClassId') || 'default';
            const curSKey = curId === 'default' ? 'students' : `students-${curId}`;
            window.students = JSON.parse(localStorage.getItem(curSKey) || '[]');
            if (typeof renderStudents === 'function') renderStudents();
        } catch (e) { /* 非致命 */ }

        syncStatus.lastSyncTime = new Date();
        localStorage.setItem('lastSyncTime', syncStatus.lastSyncTime.toISOString());

    } finally {
        syncStatus.isSyncing = false;
    }
    return results;
}

/**
 * 顯示一鍵雲端→本地的進度 Modal
 */
async function showAllClassDownloadModal() {
    const existId = 'all-class-dl-modal';
    document.getElementById(existId)?.remove();

    // ⚡ 先從雲端抓班級清單，讓進度列表能列出所有班級（新裝置本地只有 default）
    const profiles = await syncClassProfilesFromCloud();
    const allClasses = buildAllClassList(profiles);   // 含 default、已去重
    const total = allClasses.length;

    const wrap = document.createElement('div');
    wrap.id = existId;
    wrap.style.cssText = `
        position:fixed; inset:0; z-index:99999;
        background:rgba(0,0,0,.55); backdrop-filter:blur(4px);
        display:flex; align-items:center; justify-content:center; padding:16px;
    `;
    const card = document.createElement('div');
    card.style.cssText = `
        background:#fff; border-radius:20px; padding:28px 32px; max-width:480px; width:100%;
        box-shadow:0 24px 80px rgba(0,0,0,.22); font-family:inherit;
    `;

    const rows = allClasses.map((cls, i) =>
        `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0f0f0;">
            <span id="acdm-icon-${i}" style="font-size:1.2rem;width:24px;text-align:center;">⬜</span>
            <span style="flex:1;font-weight:600;color:#374151;">${cls.name}</span>
            <span id="acdm-info-${i}" style="color:#9ca3af;font-size:.85rem;"></span>
        </div>`
    ).join('');

    card.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
            <span style="font-size:1.6rem;">📥</span>
            <div>
                <div style="font-weight:700;font-size:1.1rem;color:#1e293b;">還原所有班級至本地</div>
                <div style="color:#64748b;font-size:.88rem;">雲端 → 本地，共 ${total} 個班級</div>
            </div>
        </div>
        <div style="background:#fef3c7;border-radius:10px;padding:8px 14px;font-size:.82rem;color:#92400e;margin-bottom:14px;">
            ⚠️ 各班本地資料將被雲端資料覆蓋，操作前請確認雲端有最新備份
        </div>
        <div style="background:#f0f9ff;border-radius:10px;padding:8px 14px;margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;font-size:.85rem;color:#0369a1;margin-bottom:6px;">
                <span id="acdm-label">準備還原...</span>
                <span id="acdm-counter">0 / ${total}</span>
            </div>
            <div style="background:#bae6fd;border-radius:999px;height:8px;">
                <div id="acdm-bar" style="background:linear-gradient(90deg,#7c3aed,#2563eb);height:8px;border-radius:999px;width:0%;transition:width .4s ease;"></div>
            </div>
        </div>
        <div style="max-height:280px;overflow-y:auto;">${rows}</div>
        <div style="margin-top:20px;text-align:right;">
            <button id="acdm-close-btn" onclick="document.getElementById('${existId}').remove()"
                style="padding:10px 28px;background:#6b7280;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:600;font-size:.95rem;">
                取消
            </button>
        </div>
    `;
    wrap.appendChild(card);
    document.body.appendChild(wrap);

    const onProgress = (done, total, name, status, count) => {
        const bar = document.getElementById('acdm-bar');
        const label = document.getElementById('acdm-label');
        const counter = document.getElementById('acdm-counter');
        if (bar) bar.style.width = `${Math.round((done / total) * 100)}%`;
        if (counter) counter.textContent = `${done} / ${total}`;

        const idx = status === 'syncing' ? done : done - 1;
        if (status === 'syncing') {
            if (label) label.textContent = `正在還原：${name}...`;
            const icon = document.getElementById(`acdm-icon-${idx}`);
            const info = document.getElementById(`acdm-info-${idx}`);
            if (icon) icon.textContent = '⏳';
            if (info) info.textContent = '下載中...';
        } else if (status === 'ok') {
            if (label) label.textContent = `已還原：${name}`;
            const icon = document.getElementById(`acdm-icon-${idx}`);
            const info = document.getElementById(`acdm-info-${idx}`);
            if (icon) icon.textContent = '✅';
            if (info) info.textContent = `${count} 人`;
        } else if (status === 'fail') {
            const icon = document.getElementById(`acdm-icon-${idx}`);
            const info = document.getElementById(`acdm-info-${idx}`);
            if (icon) icon.textContent = '❌';
            if (info) { info.textContent = '失敗'; info.style.color = '#ef4444'; }
        }
    };

    const results = await syncAllClassesFromCloud(onProgress);

    const bar = document.getElementById('acdm-bar');
    const label = document.getElementById('acdm-label');
    const counter = document.getElementById('acdm-counter');
    const closeBtn = document.getElementById('acdm-close-btn');
    if (bar) bar.style.width = '100%';
    if (counter) counter.textContent = `${total} / ${total}`;

    if (results) {
        const failed = results.filter(r => r.status === 'fail').length;
        if (label) {
            label.textContent = failed === 0
                ? `✅ 所有 ${total} 個班級已還原至本地！`
                : `⚠️ ${total - failed} 班成功，${failed} 班失敗`;
            label.style.color = failed === 0 ? '#16a34a' : '#d97706';
        }
        if (closeBtn) {
            closeBtn.textContent = '完成';
            closeBtn.style.background = failed === 0 ? '#16a34a' : '#d97706';
        }
        NotificationSystem && NotificationSystem.success(`所有班級已從雲端還原 📥`);
    }
}


window.FirebaseSync = {
    syncToCloud,
    syncFromCloud,
    loadFromCloud,
    loadFromCloudData,
    mergeWithCloud,
    exportAllData,
    showSyncDialog,
    showSyncConfirmModal,
    showAllClassSyncModal,       // 一鍵同步所有班級（本地→雲端）
    showAllClassDownloadModal,   // 一鍵還原所有班級（雲端→本地）
    fetchCloudClassProfiles,     // 讀取雲端班級清單（不寫本地）
    discoverCloudClasses,        // R-A1：列舉 classes/ marker
    syncClassProfilesFromCloud,  // 雲端班級清單合併進本地（含 marker）
    syncAllClassesFromCloud,     // 還原所有班級（雲端→本地，無 Modal）
    deleteClassFromCloud,        // R-A2：刪班時從雲端移除名冊+marker
    repairClassRegistry,         // R-A4：班級健檢與修復
    looksLikeBlankDevice,        // R-A3：判斷空白裝置
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
