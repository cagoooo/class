/**
 * Firebase 鞈??郊璅∠? v3.0.4
 * - 摰瘨菔?????賣芋蝯?鞈??郊
 * - ?啣??郊?底蝝啣榆?圈?閬?Modal
 */
console.log('??firebase-sync.js v3.0.4 頛摰?');

// 鞈????迂
const COLLECTIONS = {
    STUDENTS: 'students',
    POINTS_HISTORY: 'pointsHistory',
    GROUPS: 'groups',
    NOTEBOOKS: 'notebooks',
    HOMEWORKS: 'homeworks',
    HOMEWORK_CHECKS: 'homeworkChecks',
    LOTTERY_HISTORY: 'lotteryHistory',
    ANNOUNCEMENTS: 'classAnnouncements',
    EXAM_DATA: 'examData',         // ?岫??身摰?
    APP_SETTINGS: 'appSettings',   // ?? App 閮剖?嚗??蝐斤?嚗?
};

// ?郊???? window嚗? auto-sync.js ?賣迤蝣箄???isSyncing嚗?
window.syncStatus = window.syncStatus || {
    lastSyncTime: null,
    isSyncing: false,
    pendingChanges: []
};
const syncStatus = window.syncStatus;

/**
 * ???冽????????
 * 憭蝝?湛??身?剔?雿輻??頝臬?嚗隞蝝蝙??classes/{classId}/ 摮楝敺?
 */
function getUserCollection(collectionName) {
    const db = window.FirebaseConfig.getDb();
    const userId = window.FirebaseConfig.getCurrentUserId();
    if (!db || !userId) {
        console.warn('Firebase 撠???');
        return null;
    }
    // 霈??蝝?ID嚗 class-profiles.js 撖怠嚗?
    const curClassId = localStorage.getItem('currentClassId') || 'default';
    if (curClassId === 'default') {
        // ?身?剔?嚗窒?函?楝敺????詨捆嚗?
        return db.collection('users').doc(userId).collection(collectionName);
    }
    // ?啁蝝?雿輻?函?摮楝敺?
    return db.collection('users').doc(userId).collection('classes').doc(curClassId).collection(collectionName);
}


/**
 * 銝?游?????Array 敶Ｗ?嚗?
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
        console.log(`??銝 ${collectionName}: ${dataArray.length} 蝑);
        return true;
    } catch (error) {
        console.error(`銝 ${collectionName} 憭望?:`, error);
        return false;
    }
}

/**
 * 銝?桐? Object 敶Ｗ??身摰?隞?
 */
async function uploadSingleDoc(collectionName, docId, data) {
    try {
        const collection = getUserCollection(collectionName);
        if (!collection) return false;
        await collection.doc(docId).set({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        console.log(`??銝 ${collectionName}/${docId}`);
        return true;
    } catch (error) {
        console.error(`銝 ${collectionName}/${docId} 憭望?:`, error);
        return false;
    }
}

/**
 * 銝?鞈???嚗rray 敶Ｗ?嚗?
 */
async function downloadCollection(collectionName) {
    try {
        const collection = getUserCollection(collectionName);
        if (!collection) return [];
        const snapshot = await collection.get();
        const data = [];
        snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
        console.log(`??銝? ${collectionName}: ${data.length} 蝑);
        return data;
    } catch (error) {
        console.error(`銝? ${collectionName} 憭望?:`, error);
        return [];
    }
}

/**
 * 銝??桐? Object ?辣
 */
async function downloadSingleDoc(collectionName, docId) {
    try {
        const collection = getUserCollection(collectionName);
        if (!collection) return null;
        const doc = await collection.doc(docId).get();
        return doc.exists ? doc.data() : null;
    } catch (error) {
        console.error(`銝? ${collectionName}/${docId} 憭望?:`, error);
        return null;
    }
}

/**
 * 銝?桐?鞈??
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
        console.error(`銝 ${collectionName}/${itemId} 憭望?:`, error);
        return false;
    }
}

/**
 * ?芷鞈??
 */
async function deleteItem(collectionName, itemId) {
    try {
        const collection = getUserCollection(collectionName);
        if (!collection) return false;
        await collection.doc(String(itemId)).delete();
        return true;
    } catch (error) {
        console.error(`?芷 ${collectionName}/${itemId} 憭望?:`, error);
        return false;
    }
}

// ?????????????????????????????????????????????????????
// 撌亙嚗??刻???localStorage
// ?????????????????????????????????????????????????????
function safeLS(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; }
    catch { return fallback; }
}

// ?????????????????????????????????????????????????????
// 撌亙嚗?敺?唳????絞閮?
// ?????????????????????????????????????????????????????
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

// ?????????????????????????????????????????????????????
// ?郊???啗???脩垢
// ?????????????????????????????????????????????????????
async function syncToCloud() {
    if (!window.FirebaseConfig.isConnected()) {
        NotificationSystem && NotificationSystem.warning('隢??餃 Google 撣唾?');
        return false;
    }
    if (syncStatus.isSyncing) { console.warn('?郊?脰?銝?..'); return false; }

    syncStatus.isSyncing = true;
    try {
        typeof LoadingIndicator !== 'undefined' && LoadingIndicator.show('甇??郊?喲蝡?..');

        const db = window.FirebaseConfig.getDb();
        const userId = window.FirebaseConfig.getCurrentUserId();
        const annData = safeLS('classAnnouncements', []);

        // 霈?岫?????
        const examSubjects = safeLS('examSubjects', []);
        const examReminders = safeLS('examReminders', { exam: [], break: [] });
        const examAttendance = safeLS('examAttendance', {});
        // 霈??App 閮剖?
        const clockSettings = safeLS('clockSettings', {});
        const noRepeat = localStorage.getItem('noRepeatLottery');

        // ?? 銝西?銝?券?? ??
        await Promise.all([
            uploadCollection(COLLECTIONS.STUDENTS, students || []),
            uploadCollection(COLLECTIONS.POINTS_HISTORY, pointsHistory || []),
            uploadCollection(COLLECTIONS.GROUPS, groups || []),
            uploadCollection(COLLECTIONS.NOTEBOOKS, notebookEntries || []),
            uploadCollection(COLLECTIONS.HOMEWORKS, homeworkList || []),
            uploadCollection(COLLECTIONS.LOTTERY_HISTORY, lotteryHistory || []),
            uploadCollection(COLLECTIONS.ANNOUNCEMENTS, annData),
            // ?岫??身摰??桐? doc嚗?
            uploadSingleDoc(COLLECTIONS.EXAM_DATA, 'subjects', { data: examSubjects }),
            uploadSingleDoc(COLLECTIONS.EXAM_DATA, 'reminders', { data: examReminders }),
            uploadSingleDoc(COLLECTIONS.EXAM_DATA, 'attendance', { data: examAttendance }),
            // App 閮剖?
            uploadSingleDoc(COLLECTIONS.APP_SETTINGS, 'clock', clockSettings),
            uploadSingleDoc(COLLECTIONS.APP_SETTINGS, 'lottery', { noRepeatLottery: noRepeat }),
        ]);

        // 雿平蝜喃漱????寞?蝯?嚗?雿輻??頝臬?嚗耨甇???剔?瞍?嚗?
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

        // ?郊?剔?皜嚗lassProfiles嚗?脩垢 meta 蝭暺?蝣箔?憭?蝵桀霅??蝝?
        // 頝臬?嚗sers/{uid}/_meta/classProfiles嚗????剔?頝臬?敶梢嚗摰??
        try {
            const db = window.FirebaseConfig.getDb();
            const userId = window.FirebaseConfig.getCurrentUserId();
            const profiles = JSON.parse(localStorage.getItem('classProfiles') || '[]');
            if (profiles.length > 0) {
                await db.collection('users').doc(userId)
                    .collection('_meta').doc('classProfiles')
                    .set({ profiles, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                console.log('[MultiClass] classProfiles 撌脣?甇亥?脩垢');
            }
        } catch (e) {
            console.warn('[MultiClass] classProfiles ?郊憭望?嚗??游嚗?', e);
        }

        syncStatus.lastSyncTime = new Date();
        localStorage.setItem('lastSyncTime', syncStatus.lastSyncTime.toISOString());

        typeof LoadingIndicator !== 'undefined' && LoadingIndicator.hide();
        if (typeof window.GoogleAuthUI !== 'undefined') {
            window.GoogleAuthUI.refreshSyncTime && window.GoogleAuthUI.refreshSyncTime();
        }
        NotificationSystem && NotificationSystem.success('鞈?撌脣??游?甇亥?脩垢 ??');
        console.log('???郊摰?:', syncStatus.lastSyncTime);
        return true;
    } catch (error) {
        console.error('?郊憭望?:', error);
        typeof LoadingIndicator !== 'undefined' && LoadingIndicator.hide();
        NotificationSystem && NotificationSystem.error('?郊憭望?: ' + error.message);
        return false;
    } finally {
        syncStatus.isSyncing = false;
    }
}

// ?????????????????????????????????????????????????????
// 敺蝡臭?頛?????嚗? 餈?鞈??拐辣
// ?????????????????????????????????????????????????????
async function syncFromCloud() {
    if (!window.FirebaseConfig.isConnected()) return null;
    try {
        typeof LoadingIndicator !== 'undefined' && LoadingIndicator.show('甇?霈?蝡航???..');

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

        // 雿平蝜喃漱?????雿輻??頝臬?嚗耨甇???剔?瞍?嚗?
        const checksCol = getUserCollection(COLLECTIONS.HOMEWORK_CHECKS);
        const cloudChecks = {};
        if (checksCol) {
            const checksSnap = await checksCol.get();
            checksSnap.forEach(doc => { cloudChecks[doc.id] = doc.data().checks || {}; });
        }

        // 銝??剔?皜 classProfiles嚗??meta 蝭暺?
        let cloudProfiles = null;
        try {
            const db = window.FirebaseConfig.getDb();
            const userId = window.FirebaseConfig.getCurrentUserId();
            const metaDoc = await db.collection('users').doc(userId)
                .collection('_meta').doc('classProfiles').get();
            if (metaDoc.exists) cloudProfiles = metaDoc.data().profiles;
        } catch (e) { /* ??meta ???*/ }

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
            classProfiles: cloudProfiles,  // ???啣?嚗葆?蝝???
        };

    } catch (error) {
        console.error('銝?憭望?:', error);
        typeof LoadingIndicator !== 'undefined' && LoadingIndicator.hide();
        NotificationSystem && NotificationSystem.error('霈?蝡臬仃?? ' + error.message);
        return null;
    }
}

// ?????????????????????????????????????????????????????
// 敺蝡舫??蒂閬??砍嚗敹???頛荔??亙?撌脖?頛? cloudData嚗?
// ?????????????????????????????????????????????????????
async function loadFromCloudData(cloudData) {
    if (!cloudData) return false;
    // ?脫迫銝西??瑁?
    if (syncStatus.isSyncing) {
        console.warn('[Sync] ?郊?脰?銝哨?頝喲? loadFromCloudData');
        return false;
    }
    syncStatus.isSyncing = true;
    try {
        // 銝餉??????芸?雿輻 ClassDB嚗??隞質 localStorage嚗?
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

        // ???郊?湔閮擃葉?????
        // getLocalStats() 霈????賂??乩??湔??getLocalStats() 瘞賊?? 0
        window.students = cloudData.students || [];
        window.pointsHistory = cloudData.pointsHistory || [];
        window.groups = cloudData.groups || [];
        window.notebookEntries = cloudData.notebookEntries || [];
        window.homeworkList = cloudData.homeworkList || [];
        window.lotteryHistory = cloudData.lotteryHistory || [];
        window.homeworkChecks = cloudData.homeworkChecks || {};

        // ???剔?皜 classProfiles
        if (cloudData.classProfiles && Array.isArray(cloudData.classProfiles)) {
            try {
                const localRaw = localStorage.getItem('classProfiles');
                const localProfiles = localRaw ? JSON.parse(localRaw) : [];
                const cloudIds = new Set(cloudData.classProfiles.map(p => p.id));
                const localOnlyProfiles = localProfiles.filter(p => !cloudIds.has(p.id));
                const merged = [...cloudData.classProfiles, ...localOnlyProfiles];
                localStorage.setItem('classProfiles', JSON.stringify(merged));
                console.log(`[MultiClass] 撌脤???classProfiles嚗?{merged.length} ?蝝?`);
            } catch (e) {
                console.warn('[MultiClass] classProfiles ??憭望?:', e);
            }
        }

        // ?砍?
        if (cloudData.announcements && cloudData.announcements.length > 0) {
            await dbSave('classAnnouncements', cloudData.announcements);
        }

        // ?岫??身摰?
        if (cloudData.examSubjects && cloudData.examSubjects.length > 0) {
            await dbSave('examSubjects', cloudData.examSubjects);
        }
        if (cloudData.examReminders) {
            await dbSave('examReminders', cloudData.examReminders);
        }
        if (cloudData.examAttendance && Object.keys(cloudData.examAttendance).length > 0) {
            await dbSave('examAttendance', cloudData.examAttendance);
        }

        // App 閮剖?
        if (cloudData.clockSettings) {
            await dbSave('clockSettings', cloudData.clockSettings);
        }
        if (cloudData.lotterySettings?.noRepeatLottery !== undefined) {
            localStorage.setItem('noRepeatLottery', cloudData.lotterySettings.noRepeatLottery);
        }

        // ???湔?郊??嚗甇?AutoSync ??敺??喳?閫貊
        syncStatus.lastSyncTime = new Date();
        localStorage.setItem('lastSyncTime', syncStatus.lastSyncTime.toISOString());

        // ?鼓 UI
        if (typeof renderStudents === 'function') renderStudents();
        if (typeof renderGroups === 'function') renderGroups();
        if (typeof renderNotebook === 'function') renderNotebook();
        if (typeof renderHomework === 'function') renderHomework();
        if (typeof renderLotteryHistory === 'function') renderLotteryHistory();
        if (typeof updatePointsStudentSelect === 'function') updatePointsStudentSelect();
        if (typeof updateHomeworkSelect === 'function') updateHomeworkSelect();

        NotificationSystem && NotificationSystem.success('撌脣??脩垢摰??鞈? ??);
        return true;
    } finally {
        syncStatus.isSyncing = false;
    }
}

// 敺蝡臭?頛???嚗??API嚗摰寡???恬?
async function loadFromCloud() {
    const cloudData = await syncFromCloud();
    return loadFromCloudData(cloudData);
}

// ?????????????????????????????????????????????????????
// ?蔥?脩垢??啗???
// ?????????????????????????????????????????????????????
async function mergeWithCloud() {
    if (!window.FirebaseConfig.isConnected()) return false;
    try {
        typeof LoadingIndicator !== 'undefined' && LoadingIndicator.show('甇??蔥鞈?...');
        const cloudData = await syncFromCloud();
        if (!cloudData) throw new Error('?⊥????脩垢鞈?');

        // 摮貊?嚗?啣??+ ?脩垢?冽?
        const localIds = new Set((students || []).map(s => s.id));
        students = [
            ...(students || []),
            ...(cloudData.students || []).filter(s => !localIds.has(s.id))
        ];

        // ??????蔥?駁?
        const localHistIds = new Set((pointsHistory || []).map(h => h.id));
        pointsHistory = [
            ...(pointsHistory || []),
            ...(cloudData.pointsHistory || []).filter(h => !localHistIds.has(h.id))
        ].sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));

        // ?砍?嚗?雿萄??
        const localAnn = safeLS('classAnnouncements', []);
        const localAnnIds = new Set(localAnn.map(a => a.id));
        const mergedAnn = [
            ...localAnn,
            ...(cloudData.announcements || []).filter(a => !localAnnIds.has(a.id))
        ];
        localStorage.setItem('classAnnouncements', JSON.stringify(mergedAnn));

        // ?園?嚗?啁蝛箸??券蝡?
        if (!groups.length && cloudData.groups.length) groups = cloudData.groups;
        if (!notebookEntries.length && cloudData.notebookEntries.length) notebookEntries = cloudData.notebookEntries;
        if (!homeworkList.length && cloudData.homeworkList.length) homeworkList = cloudData.homeworkList;
        if (!lotteryHistory.length && cloudData.lotteryHistory.length) lotteryHistory = cloudData.lotteryHistory;

        // ?岫??身摰??砍?∪??⊿蝡?
        if (!safeLS('examSubjects', null) && cloudData.examSubjects?.length) {
            localStorage.setItem('examSubjects', JSON.stringify(cloudData.examSubjects));
        }
        if (!safeLS('clockSettings', null) && cloudData.clockSettings) {
            localStorage.setItem('clockSettings', JSON.stringify(cloudData.clockSettings));
        }

        // 摮?localStorage
        localStorage.setItem(window.STUDENTS_KEY || 'students', JSON.stringify(students));
        localStorage.setItem('pointsHistory', JSON.stringify(pointsHistory));
        localStorage.setItem('groups', JSON.stringify(groups));
        localStorage.setItem('notebookEntries', JSON.stringify(notebookEntries));
        localStorage.setItem('homeworkList', JSON.stringify(homeworkList));
        localStorage.setItem('lotteryHistory', JSON.stringify(lotteryHistory));

        // 銝?蔥蝯?
        await syncToCloud();

        // ?鼓
        if (typeof renderStudents === 'function') renderStudents();
        if (typeof renderNotebook === 'function') renderNotebook();
        if (typeof renderHomework === 'function') renderHomework();
        if (typeof renderLotteryHistory === 'function') renderLotteryHistory();
        if (typeof updatePointsStudentSelect === 'function') updatePointsStudentSelect();

        typeof LoadingIndicator !== 'undefined' && LoadingIndicator.hide();
        NotificationSystem && NotificationSystem.success('?蔥摰?嚗??歇?郊 ??');
        return true;
    } catch (error) {
        console.error('?蔥憭望?:', error);
        typeof LoadingIndicator !== 'undefined' && LoadingIndicator.hide();
        NotificationSystem && NotificationSystem.error('?蔥憭望?: ' + error.message);
        return false;
    }
}

// ?????????????????????????????????????????????????????
// ?郊蝣箄? Modal嚗??vs. ?脩垢閰喟敦撌桃?汗
// ?????????????????????????????????????????????????????

/**
 * 撱箇?撌桃?汗 Modal HTML
 * @param {'upload'|'download'} direction
 * @param {Object} local  ?砍蝯梯?
 * @param {Object} cloud  ?脩垢蝯梯?嚗ull 銵函內霈?仃??
 */
function buildSyncPreviewHTML(direction, local, cloud) {
    const isUpload = direction === 'upload';
    const icon = isUpload ? '?' : '?';
    const title = isUpload ? '蝡?郊嚗?????脩垢嚗? : '敺蝡舫????脩垢 ???砍嚗?;
    const warn = isUpload
        ? '?? ?脩垢鞈?撠◤?砍鞈?<b>摰閬?</b>嚗迨???⊥?敺拙???
        : '?? ?砍鞈?撠◤?脩垢鞈?<b>摰閬?</b>嚗?郊??啗??游??箏仃??;
    const btnText = isUpload ? '??蝣箄?銝' : '??蝣箄???';
    const btnClass = isUpload ? 'gauth-btn-primary' : 'gauth-btn-danger';

    const ITEMS = [
        { key: 'students', emoji: '?', label: '摮貊??', unit: '鈭? },
        { key: 'pointsHistory', emoji: '??', label: '?????, unit: '蝑? },
        { key: 'notebookEntries', emoji: '??', label: '?舐窗蝪輯???, unit: '?? },
        { key: 'homeworkList', emoji: '??', label: '雿平?”', unit: '隞? },
        { key: 'homeworkChecks', emoji: '??', label: '雿平蝜喃漱???, unit: '蝘? },
        { key: 'lotteryHistory', emoji: '?', label: '?賜惜甇瑕', unit: '蝑? },
        { key: 'announcements', emoji: '?', label: '?剔??砍?', unit: '?? },
        { key: 'groups', emoji: '?妝', label: '??閮?', unit: '隞? },
        { key: 'examData', emoji: '??', label: '?岫??身摰?, unit: '隞? },
        { key: 'clockSettings', emoji: '??, label: '??閮剖?', unit: '隞? },
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
                diffHtml = `<span style="color:#6b7280">嚗霈?嚗?/span>`;
            } else {
                const sign = isUpload ? diff : -diff;
                const color = sign > 0 ? '#059669' : '#dc2626';
                diffHtml = `<span style="color:${color};font-weight:600">${sign > 0 ? '+' : ''}${sign} ${item.unit}</span>`;
            }
        }

        const fromLabel = from === '?' ? '<span style="color:#9ca3af">霈?仃??/span>' : `${from} ${item.unit}`;
        const toLabel = to === '?' ? '<span style="color:#9ca3af">霈?仃??/span>' : `${to} ${item.unit}`;

        return `
        <tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:8px 4px;font-size:.95rem">${item.emoji} ${item.label}</td>
          <td style="padding:8px 8px;text-align:right;color:#374151">${fromLabel}</td>
          <td style="padding:8px 4px;color:#9ca3af;text-align:center">??/td>
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
          <div style="font-size:.85rem;opacity:.85;margin-top:4px">蝣箄?敺??瑁?隞乩?鞈???</div>
        </div>

        <!-- Table -->
        <div style="overflow-y:auto;flex:1;padding:0 20px">
          <p style="font-size:.8rem;color:#6b7280;margin:12px 0 4px">
            ${isUpload ? '敺? : '敺?}<b>${isUpload ? '?砍' : '?脩垢'}</b>??閬? <b>${isUpload ? '?脩垢' : '?砍'}</b>
          </p>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:2px solid #e5e7eb">
                <th style="padding:6px 4px;text-align:left;font-size:.8rem;color:#6b7280">鞈?憿</th>
                <th style="padding:6px 8px;text-align:right;font-size:.8rem;color:#6b7280">${isUpload ? '?砍' : '?脩垢'}</th>
                <th style="padding:6px 4px"></th>
                <th style="padding:6px 8px;text-align:left;font-size:.8rem;color:#6b7280">${isUpload ? '?脩垢嚗?甇亙?嚗? : '?砍嚗???嚗?}</th>
                <th style="padding:6px 4px;text-align:right;font-size:.8rem;color:#6b7280">撌桃</th>
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
          ">??</button>
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
 * 閮??脩垢鞈?蝯梯??賊?
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
 * 憿舐內?郊蝣箄? Modal嚗???or 銝?嚗?
 */
async function showSyncConfirmModal(direction) {
    if (!window.FirebaseConfig.isConnected()) {
        NotificationSystem && NotificationSystem.warning('隢??餃 Google 撣唾?');
        return;
    }

    // 憿舐內霈?葉?內
    const tempDiv = document.createElement('div');
    tempDiv.id = 'sync-loading-tip';
    tempDiv.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:10px 20px;border-radius:24px;z-index:9998;font-size:.9rem';
    tempDiv.textContent = '?? 甇?霈?蝡舐???..';
    document.body.appendChild(tempDiv);

    // ?????脩垢鞈?雿?撠?
    const cloudData = await syncFromCloud();
    document.getElementById('sync-loading-tip')?.remove();

    const localStats = getLocalStats();
    const cloudStats = getCloudStats(cloudData);

    // 瘜典 Modal
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
                // ???湔雿輻撌脖?頛? cloudData嚗??甈∟???Firebase
                await loadFromCloudData(cloudData);
            }
            resolve(true);
        });
    });
}

// ?????????????????????????????????????????????????????
// ?? showSyncDialog嚗摰嫣????孵?急 Modal嚗?
// ?????????????????????????????????????????????????????
async function showSyncDialog() {
    await showSyncConfirmModal('upload');
}

// ?????????????????????????????????????????????????????
// ?臬???? JSON
// ?????????????????????????????????????????????????????
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
    link.download = `?剔?鞈??遢_${new Date().toLocaleDateString('zh-TW').replace(/\//g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    NotificationSystem && NotificationSystem.success('鞈?撌脣??游????);
}

// ?????????????????????????????????????????????????????
// ????Firebase
// ?????????????????????????????????????????????????????
async function initFirebaseAndSync() {
    const initialized = await window.FirebaseConfig.initialize();
    if (!initialized) { console.error('Firebase ???仃??); return false; }
    const userId = await window.FirebaseConfig.signIn();
    if (!userId) { console.error('?餃憭望?'); return false; }
    updateCloudStatusUI(true);
    return true;
}

function updateCloudStatusUI(connected) {
    const statusEl = document.getElementById('cloud-status');
    if (statusEl) {
        statusEl.innerHTML = connected
            ? '<span class="text-green-600">?? 撌脤??</span>'
            : '<span class="text-gray-400">?? ?Ｙ?</span>';
    }
}

// ?????????????????????????????????????????????????????
// 撠
// ?????????????????????????????????????????????????????
window.FirebaseSync = {
    syncToCloud,
    syncFromCloud,
    loadFromCloud,
    loadFromCloudData,
    mergeWithCloud,
    exportAllData,
    showSyncDialog,
    showSyncConfirmModal,   // ?啣?嚗? UI ?湔?澆
    init: initFirebaseAndSync,
    uploadItem,
    deleteItem,
};

// ?頛???憪?
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initFirebaseAndSync, 500));
} else {
    setTimeout(initFirebaseAndSync, 500);
}
