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
        throw error;
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
        throw error;
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
    if (syncStatus.isSyncing) return false;
    const id = CloudSafety.current();
    syncStatus.isSyncing = true;
    try {
        await CloudSafety.publish(id);
        await uploadClassProfilesMerged();
        await writeCloudSyncInfo();
        if (!silent) NotificationSystem.success(CloudSafety.status(id) === 'pending' ? '已同步；上傳期間新增的操作仍待同步' : '班級成果已完整同步 ☁️');
        return true;
    } catch (error) {
        await CloudSafety.report(error, id, silent);
        return false;
    } finally { syncStatus.isSyncing = false; }
}

async function syncFromCloud() {
    try {
        const snapshot = await CloudSafety.read();
        const d = CloudSafety.dataFor(snapshot.values);
        return { ...d, announcements: d.classAnnouncements || [], homeworkChecks: d.homeworkChecks || {}, __snapshot: snapshot };
    } catch (error) {
        NotificationSystem.error('讀取雲端失敗：' + error.message);
        return null;
    }
}

async function loadFromCloudData(cloudData) {
    if (syncStatus.isSyncing || !cloudData?.__snapshot) return false;
    syncStatus.isSyncing = true;
    try {
        if (cloudData.__snapshot.classId !== CloudSafety.current()) throw Error('預覽後已切換班級，請重新讀取雲端');
        const ok = await CloudSafety.restore(cloudData.__snapshot);
        if (ok) NotificationSystem.success('已完整還原；還原前本機副本已保留');
        return ok;
    } catch (error) { NotificationSystem.error(error.message); return false; }
    finally { syncStatus.isSyncing = false; }
}

async function loadFromCloud() {
    const cloudData = await syncFromCloud();
    return loadFromCloudData(cloudData);
}

// ─────────────────────────────────────────────────────
// 合併雲端與本地資料
// ─────────────────────────────────────────────────────
async function mergeWithCloud() {
    // Point ledgers and coin purchases cannot be safely merged by student ID alone.
    try { await CloudSafety.showConflict(); return false; }
    catch (error) { NotificationSystem.error(error.message); return false; }
}

/** Build a class-scoped, reviewable upload/download preview. */

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
        ? `⚠️ <b>只同步「${currentClassName}」班的資料</b>至雲端，將建立完整雲端版本；若其他裝置已更新，會先停止並請你比較資料。`
        : `⚠️ <b>只還原「${currentClassName}」班的資料</b>至本地，會先保存還原前副本，再取代本機資料。`;
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
    const previewClass = CloudSafety.current();
    const previewFingerprint = CloudSafety.fingerprint(CloudSafety.capture(previewClass));
    const cloudData = await syncFromCloud();
    if (!cloudData) { document.getElementById('sync-loading-tip')?.remove(); return false; }

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
            if (CloudSafety.current() !== previewClass || CloudSafety.fingerprint(CloudSafety.capture(previewClass)) !== previewFingerprint) { NotificationSystem.warning('預覽期間資料已變更，請重新確認'); resolve(false); return; }
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
    DataBackup.exportJSON(DataBackup.collectData());
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
    if (syncStatus.isSyncing) return [];
    syncStatus.isSyncing = true;
    const results = [];
    try {
        const all = buildAllClassList(JSON.parse(localStorage.getItem('classProfiles') || '[]'));
        for (const [i, cls] of all.entries()) {
            onProgress?.(i, all.length, cls.name, 'syncing');
            try {
                // 一鍵同步前已由老師確認「雲端舊資料將被覆蓋」。
                // publish 會在同源分頁鎖內重新讀取最新雲端版本，避免把
                // 另一個分頁剛完成的合法上傳誤判成衝突；真正跨裝置的
                // 變更仍會由各自的 CAS 與比較流程保護。
                await CloudSafety.publish(String(cls.id), { allowRemoteOverwrite: true });
                const count = CloudSafety.dataFor(CloudSafety.capture(String(cls.id))).students.length;
                results.push({ name: cls.name, status: 'ok', count });
                onProgress?.(i + 1, all.length, cls.name, 'ok', count);
            } catch (error) {
                console.error(`[AllSync] ${cls.id}（${cls.name}）同步失敗:`, error);
                await CloudSafety.report(error, String(cls.id), true);
                results.push({ name: cls.name, status: 'fail', error: error.message });
                onProgress?.(i + 1, all.length, cls.name, 'fail', 0, error.message);
            }
        }
        await uploadClassProfilesMerged();
        if (results.some(r => r.status === 'ok')) await writeCloudSyncInfo();
        return results;
    } finally { syncStatus.isSyncing = false; }
}

async function syncPendingClasses() {
    if (syncStatus.isSyncing || navigator.onLine === false || !window.FirebaseConfig.isConnected()) return false;
    syncStatus.isSyncing = true;
    let ok = true, uploaded = false;
    try {
        const all = buildAllClassList(JSON.parse(localStorage.getItem('classProfiles') || '[]'));
        for (const cls of all) {
            const id = String(cls.id);
            if (CloudSafety.status(id) === 'synced' || CloudSafety.status(id) === 'conflict') continue;
            if (!CloudSafety.dataFor(CloudSafety.capture(id)).students.length && !CloudSafety.dataFor(CloudSafety.capture(id)).pointsHistory.length) continue;
            try { await CloudSafety.publish(id); uploaded = true; }
            catch (e) { ok = false; await CloudSafety.report(e, id, true); }
        }
        if (ok) await uploadClassProfilesMerged();
        if (uploaded) await writeCloudSyncInfo();
        return ok;
    } finally { syncStatus.isSyncing = false; window.SyncStatusIndicator?.updateStateBasedOnSync(); }
}

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
    const onProgress = (done, total, name, status, count, errorMessage) => {
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
            if (info) { info.textContent = errorMessage ? `失敗：${String(errorMessage).slice(0, 42)}` : '失敗'; info.style.color = '#ef4444'; info.title = errorMessage || '同步失敗'; }
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

        const ref = db.collection('users').doc(userId).collection('_meta').doc('classProfiles');
        const merged = await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            const byId = new Map((snap.exists ? snap.data().profiles || [] : []).map(p => [String(p.id), p]));
            localProfiles.forEach(p => { if (p?.id != null) byId.set(String(p.id), { ...byId.get(String(p.id)), ...p }); });
            const result = [...byId.values()];
            tx.set(ref, { profiles: result, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            return result;
        });

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
    if (syncStatus.isSyncing) return [];
    syncStatus.isSyncing = true;
    const results = [];
    try {
        const all = buildAllClassList(await syncClassProfilesFromCloud());
        for (const [i, cls] of all.entries()) {
            onProgress?.(i, all.length, cls.name, 'syncing');
            try {
                const remote = await CloudSafety.read(String(cls.id));
                if (remote.empty) throw Error('雲端沒有完整班級資料，保留本機');
                if (!await CloudSafety.restore(remote)) throw Error('本機儲存未完成，未還原');
                const count = CloudSafety.dataFor(remote.values).students.length;
                results.push({ name: cls.name, status: 'ok', count });
                onProgress?.(i + 1, all.length, cls.name, 'ok', count);
            } catch (error) {
                results.push({ name: cls.name, status: 'fail', error: error.message });
                onProgress?.(i + 1, all.length, cls.name, 'fail');
            }
        }
        return results;
    } finally { syncStatus.isSyncing = false; }
}

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
        if (results.length) {
            if (failed) window.NotificationSystem?.warning(`已還原 ${results.length - failed} 班，${failed} 班未完成；原資料已保留`);
            else window.NotificationSystem?.success('所有班級已從雲端還原 📥');
        }
    }
}


window.FirebaseSync = {
    syncToCloud,
    syncPendingClasses,
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
};

// 頁面載入時自動初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initFirebaseAndSync, 500));
} else {
    setTimeout(initFirebaseAndSync, 500);
}
