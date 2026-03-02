/**
 * Firebase 資料同步模組
 * Firebase Data Sync Module
 */

// 資料集合名稱
const COLLECTIONS = {
    STUDENTS: 'students',
    POINTS_HISTORY: 'pointsHistory',
    GROUPS: 'groups',
    NOTEBOOKS: 'notebooks',
    HOMEWORKS: 'homeworks',
    HOMEWORK_CHECKS: 'homeworkChecks',
    LOTTERY_HISTORY: 'lotteryHistory',
    ANNOUNCEMENTS: 'classAnnouncements',  // 班級公告
    SETTINGS: 'settings',            // 使用者設定
};

// 同步狀態
let syncStatus = {
    lastSyncTime: null,
    isSyncing: false,
    pendingChanges: []
};

/**
 * 取得用戶的資料集合參考
 */
function getUserCollection(collectionName) {
    const db = window.FirebaseConfig.getDb();
    const userId = window.FirebaseConfig.getCurrentUserId();

    if (!db || !userId) {
        console.warn('Firebase 尚未連線');
        return null;
    }

    return db.collection('users').doc(userId).collection(collectionName);
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
 * 上傳整個資料集合
 */
async function uploadCollection(collectionName, dataArray) {
    try {
        const collection = getUserCollection(collectionName);
        if (!collection) return false;

        const batch = window.FirebaseConfig.getDb().batch();

        dataArray.forEach(item => {
            const docRef = collection.doc(String(item.id));
            batch.set(docRef, {
                ...item,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
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
 * 下載資料集合
 */
async function downloadCollection(collectionName) {
    try {
        const collection = getUserCollection(collectionName);
        if (!collection) return [];

        const snapshot = await collection.get();
        const data = [];

        snapshot.forEach(doc => {
            data.push({ id: doc.id, ...doc.data() });
        });

        console.log(`✅ 下載 ${collectionName}: ${data.length} 筆`);
        return data;
    } catch (error) {
        console.error(`下載 ${collectionName} 失敗:`, error);
        return [];
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

/**
 * 同步所有本地資料到雲端
 */
async function syncToCloud() {
    if (!window.FirebaseConfig.isConnected()) {
        console.warn('Firebase 尚未連線，無法同步');
        return false;
    }

    if (syncStatus.isSyncing) {
        console.warn('同步進行中...');
        return false;
    }

    syncStatus.isSyncing = true;

    try {
        if (typeof LoadingIndicator !== 'undefined') {
            LoadingIndicator.show('正在同步至雲端...');
        }

        // 同步各資料集合（含公告）
        const annData = (() => {
            try { return JSON.parse(localStorage.getItem('classAnnouncements') || '[]'); } catch { return []; }
        })();

        const results = await Promise.all([
            uploadCollection(COLLECTIONS.STUDENTS, students || []),
            uploadCollection(COLLECTIONS.POINTS_HISTORY, pointsHistory || []),
            uploadCollection(COLLECTIONS.GROUPS, groups || []),
            uploadCollection(COLLECTIONS.NOTEBOOKS, notebookEntries || []),
            uploadCollection(COLLECTIONS.HOMEWORKS, homeworkList || []),
            uploadCollection(COLLECTIONS.LOTTERY_HISTORY, lotteryHistory || []),
            uploadCollection(COLLECTIONS.ANNOUNCEMENTS, annData),
        ]);

        // 同步作業繳交狀態（特殊結構）
        const db = window.FirebaseConfig.getDb();
        const userId = window.FirebaseConfig.getCurrentUserId();

        if (homeworkChecks && Object.keys(homeworkChecks).length > 0) {
            const checksCollection = db.collection('users').doc(userId).collection(COLLECTIONS.HOMEWORK_CHECKS);

            for (const [homeworkId, checks] of Object.entries(homeworkChecks)) {
                await checksCollection.doc(String(homeworkId)).set({
                    checks: checks,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }

        syncStatus.lastSyncTime = new Date();
        localStorage.setItem('lastSyncTime', syncStatus.lastSyncTime.toISOString());

        if (typeof LoadingIndicator !== 'undefined') {
            LoadingIndicator.hide();
        }

        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.success('資料已同步至雲端');
        }

        console.log('✅ 同步完成:', syncStatus.lastSyncTime);
        return true;
    } catch (error) {
        console.error('同步失敗:', error);

        if (typeof LoadingIndicator !== 'undefined') {
            LoadingIndicator.hide();
        }

        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.error('同步失敗: ' + error.message);
        }

        return false;
    } finally {
        syncStatus.isSyncing = false;
    }
}

/**
 * 從雲端下載資料
 */
async function syncFromCloud() {
    if (!window.FirebaseConfig.isConnected()) {
        console.warn('Firebase 尚未連線，無法下載');
        return false;
    }

    try {
        if (typeof LoadingIndicator !== 'undefined') {
            LoadingIndicator.show('正在從雲端載入...');
        }

        // 下載各資料集合
        const [
            cloudStudents,
            cloudPointsHistory,
            cloudGroups,
            cloudNotebooks,
            cloudHomeworks,
            cloudLotteryHistory
        ] = await Promise.all([
            downloadCollection(COLLECTIONS.STUDENTS),
            downloadCollection(COLLECTIONS.POINTS_HISTORY),
            downloadCollection(COLLECTIONS.GROUPS),
            downloadCollection(COLLECTIONS.NOTEBOOKS),
            downloadCollection(COLLECTIONS.HOMEWORKS),
            downloadCollection(COLLECTIONS.LOTTERY_HISTORY)
        ]);

        // 下載作業繳交狀態
        const db = window.FirebaseConfig.getDb();
        const userId = window.FirebaseConfig.getCurrentUserId();
        const checksSnapshot = await db.collection('users').doc(userId).collection(COLLECTIONS.HOMEWORK_CHECKS).get();

        const cloudHomeworkChecks = {};
        checksSnapshot.forEach(doc => {
            cloudHomeworkChecks[doc.id] = doc.data().checks || {};
        });

        if (typeof LoadingIndicator !== 'undefined') {
            LoadingIndicator.hide();
        }

        return {
            students: cloudStudents,
            pointsHistory: cloudPointsHistory,
            groups: cloudGroups,
            notebookEntries: cloudNotebooks,
            homeworkList: cloudHomeworks,
            lotteryHistory: cloudLotteryHistory,
            homeworkChecks: cloudHomeworkChecks
        };
    } catch (error) {
        console.error('下載失敗:', error);

        if (typeof LoadingIndicator !== 'undefined') {
            LoadingIndicator.hide();
        }

        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.error('下載失敗: ' + error.message);
        }

        return null;
    }
}

/**
 * 載入雲端資料並覆蓋本地
 */
async function loadFromCloud() {
    const cloudData = await syncFromCloud();

    if (!cloudData) return false;

    // 覆蓋本地資料
    students = cloudData.students;
    pointsHistory = cloudData.pointsHistory;
    groups = cloudData.groups;
    notebookEntries = cloudData.notebookEntries;
    homeworkList = cloudData.homeworkList;
    lotteryHistory = cloudData.lotteryHistory;
    homeworkChecks = cloudData.homeworkChecks;

    // 儲存到本地
    localStorage.setItem('students', JSON.stringify(students));
    localStorage.setItem('pointsHistory', JSON.stringify(pointsHistory));
    localStorage.setItem('groups', JSON.stringify(groups));
    localStorage.setItem('notebookEntries', JSON.stringify(notebookEntries));
    localStorage.setItem('homeworkList', JSON.stringify(homeworkList));
    localStorage.setItem('lotteryHistory', JSON.stringify(lotteryHistory));
    localStorage.setItem('homeworkChecks', JSON.stringify(homeworkChecks));

    // 重新渲染 UI
    if (typeof renderStudents === 'function') renderStudents();
    if (typeof renderNotebook === 'function') renderNotebook();
    if (typeof renderHomework === 'function') renderHomework();
    if (typeof renderLotteryHistory === 'function') renderLotteryHistory();
    if (typeof updatePointsStudentSelect === 'function') updatePointsStudentSelect();
    if (typeof updateHomeworkSelect === 'function') updateHomeworkSelect();

    if (typeof NotificationSystem !== 'undefined') {
        NotificationSystem.success('已從雲端載入資料');
    }

    return true;
}

/**
 * 匯出所有資料為 JSON
 */
function exportAllData() {
    const exportData = {
        exportDate: new Date().toISOString(),
        students: students || [],
        pointsHistory: pointsHistory || [],
        groups: groups || [],
        notebookEntries: notebookEntries || [],
        homeworkList: homeworkList || [],
        homeworkChecks: homeworkChecks || {},
        lotteryHistory: lotteryHistory || []
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `班級資料備份_${new Date().toLocaleDateString('zh-TW').replace(/\//g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (typeof NotificationSystem !== 'undefined') {
        NotificationSystem.success('資料已匯出');
    }
}

/**
 * 顯示同步確認對話框
 */
async function showSyncDialog() {
    if (!window.FirebaseConfig.isConnected()) {
        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.warning('請先連線至雲端');
        }
        return;
    }

    const choice = confirm(
        '請選擇同步方式：\n\n' +
        '確定 = 上傳本地資料到雲端\n' +
        '取消 = 從雲端下載資料到本地'
    );

    if (choice) {
        await syncToCloud();
    } else {
        const confirmLoad = confirm('確定要從雲端載入資料嗎？這將覆蓋本地資料。');
        if (confirmLoad) {
            await loadFromCloud();
        }
    }
}

/**
 * 初始化 Firebase 並自動登入
 */
async function initFirebaseAndSync() {
    const initialized = await window.FirebaseConfig.initialize();

    if (!initialized) {
        console.error('Firebase 初始化失敗');
        return false;
    }

    const userId = await window.FirebaseConfig.signIn();

    if (!userId) {
        console.error('登入失敗');
        return false;
    }

    // 更新 UI 顯示連線狀態
    updateCloudStatusUI(true);

    return true;
}

/**
 * 更新雲端連線狀態 UI
 */
function updateCloudStatusUI(connected) {
    const statusEl = document.getElementById('cloud-status');
    if (statusEl) {
        statusEl.innerHTML = connected
            ? '<span class="text-green-600">☁️ 已連線</span>'
            : '<span class="text-gray-400">☁️ 離線</span>';
    }
}

/**
 * 合併雲端與本地資料
 * - 學生名單：以 id 去重後取聯集
 * - 評分記錄：全部合併（id 去重）
 * - 其他集合：雲端優先（本地若為空則用雲端）
 */
async function mergeWithCloud() {
    if (!window.FirebaseConfig.isConnected()) return false;

    try {
        if (typeof LoadingIndicator !== 'undefined') LoadingIndicator.show('正在合併資料...');

        const cloudData = await syncFromCloud();
        if (!cloudData) throw new Error('無法取得雲端資料');

        // 合併學生名單（id 去重，以本地版本優先）
        const localStudents = students || [];
        const localIds = new Set(localStudents.map(s => s.id));
        const mergedStudents = [
            ...localStudents,
            ...(cloudData.students || []).filter(s => !localIds.has(s.id))
        ];

        // 合併評分記錄（id 去重，以本地版本優先）
        const localHist = pointsHistory || [];
        const localHistIds = new Set(localHist.map(h => h.id));
        const mergedHistory = [
            ...localHist,
            ...(cloudData.pointsHistory || []).filter(h => !localHistIds.has(h.id))
        ].sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));

        // 合併公告
        const localAnn = (() => {
            try { return JSON.parse(localStorage.getItem('classAnnouncements') || '[]'); } catch { return []; }
        })();
        const localAnnIds = new Set(localAnn.map(a => a.id));
        const mergedAnn = [
            ...localAnn,
            ...(cloudData.announcements || []).filter(a => !localAnnIds.has(a.id))
        ];

        // 套用合併結果
        students = mergedStudents;
        pointsHistory = mergedHistory;
        // 其餘集合：若本地為空則採雲端
        if (!groups.length && cloudData.groups.length) groups = cloudData.groups;
        if (!notebookEntries.length && cloudData.notebookEntries.length) notebookEntries = cloudData.notebookEntries;
        if (!homeworkList.length && cloudData.homeworkList.length) homeworkList = cloudData.homeworkList;
        if (!lotteryHistory.length && cloudData.lotteryHistory.length) lotteryHistory = cloudData.lotteryHistory;

        // 更新 localStorage
        localStorage.setItem('students', JSON.stringify(students));
        localStorage.setItem('pointsHistory', JSON.stringify(pointsHistory));
        localStorage.setItem('groups', JSON.stringify(groups));
        localStorage.setItem('notebookEntries', JSON.stringify(notebookEntries));
        localStorage.setItem('homeworkList', JSON.stringify(homeworkList));
        localStorage.setItem('lotteryHistory', JSON.stringify(lotteryHistory));
        localStorage.setItem('classAnnouncements', JSON.stringify(mergedAnn));

        // 重新上傳合併結果到雲端
        await syncToCloud();

        // 重繪 UI
        if (typeof renderStudents === 'function') renderStudents();
        if (typeof renderNotebook === 'function') renderNotebook();
        if (typeof renderHomework === 'function') renderHomework();
        if (typeof renderLotteryHistory === 'function') renderLotteryHistory();
        if (typeof updatePointsStudentSelect === 'function') updatePointsStudentSelect();

        if (typeof LoadingIndicator !== 'undefined') LoadingIndicator.hide();
        NotificationSystem && NotificationSystem.success('合併完成！資料已同步 🎉');
        return true;
    } catch (error) {
        console.error('合併失敗:', error);
        if (typeof LoadingIndicator !== 'undefined') LoadingIndicator.hide();
        NotificationSystem && NotificationSystem.error('合併失敗: ' + error.message);
        return false;
    }
}

// 導出函數
window.FirebaseSync = {
    syncToCloud: syncToCloud,
    syncFromCloud: syncFromCloud,
    loadFromCloud: loadFromCloud,
    mergeWithCloud: mergeWithCloud,
    exportAllData: exportAllData,
    showSyncDialog: showSyncDialog,
    init: initFirebaseAndSync,
    uploadItem: uploadItem,
    deleteItem: deleteItem,
};

// 頁面載入時自動初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initFirebaseAndSync, 500));
} else {
    setTimeout(initFirebaseAndSync, 500);
}
