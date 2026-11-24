/**
 * Class-Aware localStorage 攔截器 v1.0
 *
 * 目的：讓所有「應該屬於各班獨立」的 localStorage key 自動依目前班級隔離，
 *      而現有模組的程式碼完全不需改動（依舊用 'notebookEntries' 等全域名稱）。
 *
 * 機制：
 *   - 攔截 Storage.prototype.{getItem, setItem, removeItem}
 *   - 對於 SHARED_KEYS 內的 key，如果目前不是預設班級，會自動改寫為 `{key}-{classId}`
 *   - 預設班級沿用全域 key（向下相容，舊資料不會丟失）
 *
 * 必須在所有其他 JS 模組之前載入！
 *
 * 一次性遷移：
 *   - 升級時若使用者目前在非預設班級，且 per-class key 不存在但全域 key 存在，
 *     會自動把全域 key 的內容複製到 per-class key（保留現有資料）
 *
 * 注意：
 *   - 班級切換（class-profiles.js）做 location.reload() 後，攔截器會重新讀取
 *     currentClassId，自動路由到新班級的資料
 */
(function () {
    'use strict';

    // 應該依班級隔離的 key（全域共用會造成跨班資料混淆的）
    const SHARED_KEYS = new Set([
        'petSettings', // 班級寵物啟用與獎勵規則
        // 9 大功能區塊的核心資料
        'notebookEntries',          // 聯絡簿
        'homeworkList',             // 作業列表
        'homeworkChecks',           // 作業繳交狀態
        'lotteryHistory',           // 抽籤歷史
        'classAnnouncements',       // 班級公告
        'examSubjects',             // 考試科目
        'examReminders',            // 考試提醒語
        'examAttendance',           // 考試缺考統計
        'examAbsenceRecords',       // 考試缺考詳細記錄
        'seatingConfig',            // 座位表
        'drawnStudentIds',          // 抽籤已抽出學生
        'examDayPresets',           // 考試多日預設（第一天/第二天...）
        'boardNote',                // 經營白板：公告文字
        'boardNoteStyle',           // 經營白板：字級/顏色/粗細
        'boardActivity',            // 經營白板：目前班級秩序狀態
        'boardLotteryCfg',          // 經營白板：號碼抽籤設定
        'brushChecked',             // 潔牙勾選表：今日已潔牙號碼
        'quietChallengeLog',        // 安靜挑戰：挑戰紀錄
        'pointsQuickActions',       // 加扣分項目（v3.64.2 起依班級存、跟著雲端同步）
    ]);

    // 取得原始 Storage 方法（避免被自己攔截）
    const _proto = Storage.prototype;
    const _origGet = _proto.getItem;
    const _origSet = _proto.setItem;
    const _origRemove = _proto.removeItem;

    /**
     * 將 key 轉換為 class-aware key
     * - 預設班級或非 SHARED_KEYS：原 key 不變（向下相容）
     * - 其他班級且為 SHARED_KEYS：加上 `-{classId}` 後綴
     */
    // 這一頁「載入時」的班級（v3.71.1）。
    // 以前每次讀寫都重新去看 currentClassId：另一個分頁切到別班後，這頁手上還是原本那班的資料，
    // 寫入卻會落到別班的 key，把別班的作業、聯絡簿、座位表蓋掉。
    // 現在只跟著「這一頁自己」改的班級走；別的分頁改的不理會，並在安全時機重新整理這一頁。
    const CLASS_ID_KEY = 'currentClassId';
    let pageClassId = _origGet.call(localStorage, CLASS_ID_KEY) || 'default';
    function notePageClass(key, value) {
        if (key === CLASS_ID_KEY) pageClassId = value == null ? 'default' : (String(value) || 'default');
        noteSeen(key, value);
    }
    function classKey(key) {
        if (!SHARED_KEYS.has(key)) return key;
        if (pageClassId === 'default') return key;
        return key + '-' + pageClassId;
    }

    // ───── 同一班開在兩個分頁：記住「這一頁最後看到的內容」（v3.73.0）─────
    // 每個分頁各自在記憶體留一份班級資料，存檔時整包寫回，另一個分頁剛寫的內容就會被蓋掉。
    // 這裡替這一頁這一班的每一項資料記下最後一次讀到或寫入的內容；之後要寫入時，
    // 如果 localStorage 裡的內容已經不是這一頁看過的那份，代表別的分頁改過，這次寫入就是拿舊資料去蓋新的。
    const CORE_KEYS = ['students', 'groups', 'pointsHistory'];
    // 主頁面放在全域變數裡的資料：另一個分頁寫入時可以直接就地換成新的
    const MEMORY_SHAPE = {
        students: [], groups: [], pointsHistory: [], notebookEntries: [], homeworkList: [],
        homeworkChecks: {}, lotteryHistory: [], drawnStudentIds: [],
    };
    // 頁面（或模組）載入時讀一次、之後一直用手上那份整包寫回的資料。
    // 這些資料「之後又被讀到」不代表手上那份有更新（備份、同步狀態都會順手讀），所以只認第一次讀取與自己的寫入。
    const HELD = new Set(Object.keys(MEMORY_SHAPE).concat(['classAnnouncements', 'pointsQuickActions',
        'examSubjects', 'examReminders', 'examAttendance', 'examAbsenceRecords', 'examDayPresets']));
    // 小設定：模組每次操作都重新讀取，或後寫的蓋掉先寫的也無妨。另一邊改了不必重新整理，也不擋寫入。
    const RELAXED = new Set(['boardNote', 'boardNoteStyle', 'boardActivity', 'boardLotteryCfg', 'brushChecked', 'quietChallengeLog']);
    const seen = new Map();                         // 實際的鍵 → 這一頁手上那份對應的內容（沒有這一項是 null）
    let watchedFor = null, watched = new Map();     // 實際的鍵 → 程式裡的名稱（只有這一頁這一班的班級資料）
    function watchedName(actualKey) {
        if (watchedFor !== pageClassId) {
            watchedFor = pageClassId; watched = new Map(); seen.clear();
            CORE_KEYS.forEach(function (k) { watched.set(pageClassId === 'default' ? k : k + '-' + pageClassId, k); });
            SHARED_KEYS.forEach(function (k) { watched.set(classKey(k), k); });
        }
        return watched.get(actualKey);
    }
    function noteSeen(actualKey, value, isRead) {
        const name = watchedName(actualKey);
        if (!name) return;
        if (isRead && HELD.has(name) && seen.has(actualKey)) return;
        seen.set(actualKey, value == null ? null : String(value));
    }
    /** 這一頁沒看過 localStorage 現在的內容（別的分頁改過），卻要拿手上的資料寫回去。 */
    function isStaleWrite(actualKey, value) {
        const name = watchedName(actualKey);
        if (!name || RELAXED.has(name) || !seen.has(actualKey)) return false;
        const live = _origGet.call(localStorage, actualKey);
        if (live === seen.get(actualKey)) return false;
        // 要寫的內容和現在存的一模一樣（例如兩個分頁同時開機、各自補上相同的預設值）：沒有東西會被蓋掉
        if (live === (value == null ? null : String(value))) { seen.set(actualKey, live); return false; }
        return true;
    }

    // ───── 緊急清理：localStorage 滿時自動釋放非必要空間 ─────
    // v3.1.4 新增：老師反映 QuotaExceededError 導致加扣分等操作失敗
    // v3.1.6 加強：先判斷是否已登入雲端，再決定是否清理本地備份
    //           - 已登入：可以安全清 autoBackup（雲端有完整資料）
    //           - 未登入：只清節流/暫存，保留 autoBackup 避免資料永久遺失
    function isLoggedInToCloud() {
        // ⚠️ v3.27.1：必須是 Google 帳號才算「雲端有備份」。
        //    isConnected() 對自動匿名登入也回傳 true，會讓這裡在空間不足時
        //    刪掉 classManager_autoBackup——那可能是未登入老師僅存的一份副本。
        try {
            return !!(window.FirebaseConfig?.isGoogleUser?.());
        } catch (e) { return false; }
    }

    function emergencyCleanup() {
        let freedBytes = 0;
        const isLoggedIn = isLoggedInToCloud();
        // 清理順序依「資料安全性」排序
        const CLEANUP_TARGETS = [
            // 一律安全可清（純暫存/節流時間戳）
            { key: 'classManager_lastSync', alwaysSafe: true },
            { key: 'pwaLastUpdateCheck', alwaysSafe: true },
            { key: 'swLastUpdateCheck', alwaysSafe: true },
            // 需要雲端備份才能安全清（本地備份快照）
            { key: 'classManager_autoBackup', alwaysSafe: false },
        ];
        CLEANUP_TARGETS.forEach(target => {
            // 未登入 + 非 alwaysSafe → 跳過，保留本地備份
            if (!target.alwaysSafe && !isLoggedIn) return;
            const v = _origGet.call(localStorage, target.key);
            if (v !== null) {
                freedBytes += (target.key.length + v.length) * 2;  // UTF-16 roughly 2 bytes/char
                _origRemove.call(localStorage, target.key);
            }
        });
        // 額外清理：舊的 Firestore 持久化暫存（永遠安全，只是快取）
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (k.startsWith('firebase:') && k.includes('/offline')) {
                const v = _origGet.call(localStorage, k);
                if (v) freedBytes += (k.length + v.length) * 2;
                _origRemove.call(localStorage, k);
            }
        }
        console.log(`[ClassAwareStorage] emergencyCleanup 釋放 ${(freedBytes/1024).toFixed(1)} KB（登入狀態: ${isLoggedIn ? '已登入' : '未登入'}）`);
        return freedBytes;
    }

    let quotaDialogShown = false;
    function showQuotaDialog() {
        if (quotaDialogShown) return;
        if (typeof document === 'undefined') return;
        if (document.getElementById('cas-quota-dialog')) return;
        quotaDialogShown = true;
        const modal = document.createElement('div');
        modal.id = 'cas-quota-dialog';
        modal.innerHTML = `
            <style>
                #cas-quota-dialog {
                    position: fixed; inset: 0; background: rgba(0,0,0,0.55);
                    z-index: 99999; display: flex; align-items: center; justify-content: center;
                    padding: 1rem; animation: casQuotaFade 0.2s ease;
                }
                @keyframes casQuotaFade { from { opacity: 0; } to { opacity: 1; } }
                .cas-quota-box {
                    background: #fff; border-radius: 16px; max-width: 460px; width: 100%;
                    padding: 1.75rem; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    animation: casQuotaPop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                @keyframes casQuotaPop { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                .cas-quota-icon { font-size: 2.5rem; text-align: center; margin-bottom: 0.5rem; }
                .cas-quota-title { font-size: 1.1rem; font-weight: 700; color: #1f2937; text-align: center; margin-bottom: 0.5rem; }
                .cas-quota-desc { font-size: 0.88rem; color: #6b7280; text-align: center; line-height: 1.6; margin-bottom: 1rem; }
                .cas-quota-actions { display: flex; gap: 0.5rem; flex-direction: column; }
                .cas-quota-btn {
                    padding: 0.75rem 1rem; border-radius: 8px; border: none; font-weight: 600;
                    font-size: 0.92rem; cursor: pointer; transition: all 0.15s;
                }
                .cas-quota-btn-primary { background: linear-gradient(135deg,#3b82f6,#6366f1); color: #fff; }
                .cas-quota-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(99,102,241,0.4); }
                .cas-quota-btn-warn { background: linear-gradient(135deg,#f59e0b,#d97706); color: #fff; }
                .cas-quota-btn-warn:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(217,119,6,0.4); }
                .cas-quota-btn-secondary { background: #f3f4f6; color: #374151; }
                .cas-quota-btn-secondary:hover { background: #e5e7eb; }
            </style>
            <div class="cas-quota-box">
                <div class="cas-quota-icon">💾</div>
                <div class="cas-quota-title">瀏覽器儲存空間已滿</div>
                <div class="cas-quota-desc">
                    累積的資料已超過瀏覽器可用空間，導致加扣分等操作失敗。<br>
                    <b style="color:#b91c1c">⚠️ 清理或清除前，請務必先下載備份，否則學生與加扣分紀錄可能永久消失！</b><br>
                    ` + (isLoggedInToCloud()
                        ? '建議點擊下方「一鍵清理」釋放空間（不會刪除學生資料）。<br><span style="color:#059669;font-weight:600;">已登入 Google 帳號，雲端保有完整資料，安全無虞。</span>'
                        : '<span style="color:#d97706;font-weight:600;">⚠️ 尚未登入 Google 帳號。</span><br>建議先登入雲端同步後再清理，以免本地備份遺失。現在只會清理暫存資料（不會刪除備份）。')
                    + `
                </div>
                <div class="cas-quota-actions">
                    <button class="cas-quota-btn cas-quota-btn-primary" onclick="window.__casQuotaBackup()">
                        📥 先下載備份檔（強烈建議）
                    </button>
                    <button class="cas-quota-btn cas-quota-btn-warn" onclick="window.__casQuotaClean()">
                        🧹 一鍵清理（釋放空間）
                    </button>
                    <button class="cas-quota-btn cas-quota-btn-secondary" onclick="window.__casQuotaClose()">
                        稍後再說
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        window.__casQuotaClose = () => {
            modal.remove();
            quotaDialogShown = false;
            delete window.__casQuotaClose;
            delete window.__casQuotaClean;
            delete window.__casQuotaBackup;
        };
        // 📥 先下載備份：優先走資料保險模組，其次直接用 DataBackup.export
        window.__casQuotaBackup = () => {
            try {
                if (window.DataSafetyGuard && DataSafetyGuard.downloadBackup) { DataSafetyGuard.downloadBackup(); return; }
                var _DB = (typeof DataBackup !== 'undefined') ? DataBackup : window.DataBackup;
                if (_DB && _DB.export) { _DB.export(); return; }
                alert('找不到備份功能，請到「學生管理 → 管理功能 → 匯出完整備份」手動下載後再清理。');
            } catch (e) {
                alert('備份失敗：' + (e && e.message || e));
            }
        };
        window.__casQuotaClean = () => {
            const freed = emergencyCleanup();
            const kb = (freed / 1024).toFixed(1);
            modal.remove();
            quotaDialogShown = false;
            alert('✅ 已釋放 ' + kb + ' KB 空間！\n\n接著請按「一鍵更新」按鈕重新載入，即可恢復正常使用。');
        };
    }

    // ───── v3.67.0 同一台電腦多位老師：這頁載入的資料不是目前主人的，就不准再寫回班級資料 ─────
    // 另一個分頁換了帳號（資料已換成另一位老師的），或正在收納切換時，這頁手上的舊資料寫回去就會混到別人的班級。
    // 主題、登入狀態等這台電腦的設定不受影響（由 AccountVault.isDeviceKey 判斷）。
    let pageOwner = _origGet.call(localStorage, 'workspaceOwner');
    function blockedWrite(key) {
        const isDevice = window.AccountVault && window.AccountVault.isDeviceKey;
        if (!isDevice || isDevice(key)) return false;
        const now = _origGet.call(localStorage, 'workspaceOwner');
        if (pageOwner !== '__switching__' && (now || null) === (pageOwner || null)) return false;
        console.warn('[ClassAwareStorage] 這台電腦的班級資料已切換給另一個帳號，這頁的舊資料不再寫入：' + key);
        return true;
    }

    // ───── 攔截 localStorage 方法（v3.1.4 加入 quota-safe 包裝） ─────
    _proto.getItem = function (key) {
        const actualKey = classKey(key);
        const value = _origGet.call(this, actualKey);
        if (this === localStorage) noteSeen(actualKey, value, true);
        return value;
    };
    _proto.setItem = function (key, value) {
        const actualKey = classKey(key);
        if (this === localStorage && blockedWrite(actualKey)) return;
        if (this === localStorage && isStaleWrite(actualKey, value)) { rejectStaleWrite(actualKey); return; }
        try {
            const result = _origSet.call(this, actualKey, value);
            if (this === localStorage) notePageClass(actualKey, value);
            return result;
        } catch (err) {
            // QuotaExceededError 或 similar
            if (err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014)) {
                console.warn('[ClassAwareStorage] localStorage 已滿，嘗試緊急清理...');
                const freed = emergencyCleanup();
                if (freed > 0) {
                    console.log('[ClassAwareStorage] 已釋放 ' + (freed / 1024).toFixed(1) + ' KB，重試儲存');
                    try {
                        const retried = _origSet.call(this, actualKey, value);
                        if (this === localStorage) notePageClass(actualKey, value);
                        return retried;
                    } catch (retryErr) {
                        // 仍失敗 → 顯示對話框讓使用者處理
                        showQuotaDialog();
                        throw retryErr;
                    }
                } else {
                    // 沒有可清理的，直接提示使用者
                    showQuotaDialog();
                }
            }
            throw err;
        }
    };
    _proto.removeItem = function (key) {
        const actualKey = classKey(key);
        if (this === localStorage && blockedWrite(actualKey)) return;
        if (this === localStorage && isStaleWrite(actualKey, null)) { rejectStaleWrite(actualKey); return; }
        const result = _origRemove.call(this, actualKey);
        if (this === localStorage) notePageClass(actualKey, null);
        return result;
    };

    // ───── 另一個分頁切換了班級：這一頁的畫面與記憶體還是原本那班，找安全的時機重新整理 ─────
    // 上課中（計時器在跑、全螢幕、對話框開著、正在打字）不打斷，等老師告一段落再換。
    let classChangedElsewhere = false, staleTimer = null;
    function pageIsBusy() {
        try {
            if (window.FirebaseConfig && window.FirebaseConfig.isPageBusy && window.FirebaseConfig.isPageBusy()) return true;
            const el = document.activeElement;
            if (el && typeof el.matches === 'function' && el.matches('input, textarea, select, [contenteditable]')) return true;
        } catch (e) { return true; }
        return false;
    }
    function reloadIfClassChangedElsewhere() {
        if (!classChangedElsewhere) return;
        const live = _origGet.call(localStorage, CLASS_ID_KEY) || 'default';
        if (live === pageClassId) {   // 另一個分頁又切回同一班：不用重新整理
            classChangedElsewhere = false;
            if (staleTimer) { clearInterval(staleTimer); staleTimer = null; }
            return;
        }
        if (pageIsBusy()) return;
        try { sessionStorage.setItem('classChangedElsewhere', '1'); } catch (e) { /* 無痕模式 */ }
        try { if (window.LeaveSyncGuard && window.LeaveSyncGuard.allowInternalNavigation) window.LeaveSyncGuard.allowInternalNavigation(); } catch (e) { /* ignore */ }
        try { window.location.reload(); } catch (e) { /* 測試環境 */ }
    }
    try {
        window.addEventListener('storage', function (event) {
            if (event.key !== CLASS_ID_KEY) return;
            if (event.storageArea && event.storageArea !== localStorage) return;
            if ((event.newValue || 'default') === pageClassId) return;
            classChangedElsewhere = true;
            reloadIfClassChangedElsewhere();
            if (classChangedElsewhere && !staleTimer) staleTimer = setInterval(reloadIfClassChangedElsewhere, 5000);
        });
        window.addEventListener('focus', reloadIfClassChangedElsewhere);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) reloadIfClassChangedElsewhere(); });
        // 重新整理後告訴老師發生了什麼事
        if (sessionStorage.getItem('classChangedElsewhere')) {
            sessionStorage.removeItem('classChangedElsewhere');
            setTimeout(function () {
                try {
                    if (window.NotificationSystem && window.NotificationSystem.info) window.NotificationSystem.info('另一個分頁切換了班級，這一頁已跟著換成目前的班級');
                } catch (e) { /* ignore */ }
            }, 2500);
        }
    } catch (e) { /* 測試環境沒有 window 事件 */ }

    // ───── 同一班開在兩個分頁：另一個分頁寫入後，這一頁怎麼跟上（v3.73.0）─────
    // 1. 學生、加扣分、分組、聯絡簿、作業、抽籤：主頁面放在全域變數裡，直接就地換成新內容並重畫，不用重新整理。
    // 2. 其餘資料（公告、考試、座位表、白板……各模組自己留一份）：記下「這一頁是舊的」，
    //    等老師回到這一頁（切回分頁、點進視窗、開始操作）而且沒在上課操作時才重新整理；投影中的畫面不會被打斷。
    // 3. 萬一還是拿舊資料寫入（上面第 2 類還沒來得及重新整理）：擋下來、告訴老師，不讓它蓋掉另一個分頁的內容。
    const REDRAW = ['renderStudents', 'renderGroups', 'renderPointsStudentList', 'renderPointsHistory',
        'renderNotebook', 'renderHomework', 'refreshHomeworkSelectKeep', 'updateHomeworkCheckList',
        'renderLotteryHistory', 'updateLotteryStats'];
    const KEY_LABELS = {
        students: '學生名單', groups: '分組', pointsHistory: '加扣分紀錄', petSettings: '寵物設定',
        notebookEntries: '聯絡簿', homeworkList: '作業', homeworkChecks: '作業繳交', lotteryHistory: '抽籤紀錄',
        classAnnouncements: '公告', examSubjects: '考試科目', examReminders: '考試提醒', examAttendance: '考試出缺席',
        examAbsenceRecords: '缺考記錄', seatingConfig: '座位表', drawnStudentIds: '抽籤名單', examDayPresets: '考試日程',
        boardNote: '白板公告', boardNoteStyle: '白板樣式', boardActivity: '白板狀態', boardLotteryCfg: '白板抽籤設定',
        brushChecked: '潔牙勾選', quietChallengeLog: '安靜挑戰紀錄', pointsQuickActions: '加扣分項目',
    };
    const STALE_NOTICE = 'class-manager-tab-refreshed';     // 重新整理後要告訴老師的話（只存在這個分頁）
    const RELOAD_LOG = 'class-manager-tab-reloads';         // 最近幾次自動重新整理的時間，避免兩個分頁互相觸發
    const staleNames = new Set();       // 另一個分頁改過、這一頁還是舊的
    const refreshedNames = new Set();   // 剛就地換成新內容、還沒重畫
    const refreshers = {};              // 名稱 → 模組登記的「重新讀取並重畫」函式
    let redrawTimer = null, staleTicker = null, rejectedAt = 0, rejectedSomething = false, tabReloading = false, lastTypedAt = 0;
    const TYPING = 'textarea, [contenteditable], input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=button])';
    function label(name) { return KEY_LABELS[name] || name; }
    function notify(kind, text, ms) {
        try {
            const N = window.NotificationSystem;
            if (!N) return;
            if (typeof N.show === 'function') N.show(text, kind, ms || 8000);
            else if (typeof N[kind] === 'function') N[kind](text);
        } catch (e) { /* 通知失敗不影響資料 */ }
    }
    function ownerChangedElsewhere() {
        const now = _origGet.call(localStorage, 'workspaceOwner');
        return pageOwner === '__switching__' || (now || null) !== (pageOwner || null);
    }

    /** 把主頁面記憶體裡的那一份換成 localStorage 現在的內容。換不了（形狀不對、不是主頁面）回傳 false。 */
    function adoptIntoMemory(actualKey, rawValue) {
        const name = watchedName(actualKey);
        if (!name || !Object.prototype.hasOwnProperty.call(MEMORY_SHAPE, name) || !(name in window)) return false;
        const wantArray = Array.isArray(MEMORY_SHAPE[name]);
        let parsed = null;
        try { parsed = rawValue == null || rawValue === '' ? null : JSON.parse(rawValue); }
        catch (e) { return false; }
        if (parsed === null) parsed = wantArray ? [] : {};
        if (typeof parsed !== 'object' || Array.isArray(parsed) !== wantArray) return false;
        window[name] = parsed;
        seen.set(actualKey, rawValue == null ? null : String(rawValue));
        scheduleRedraw(name);
        return true;
    }
    function scheduleRedraw(name) {
        refreshedNames.add(name);
        if (!redrawTimer) redrawTimer = setTimeout(redrawAfterRefresh, 150);
    }
    function redrawAfterRefresh() {
        redrawTimer = null;
        const names = Array.from(refreshedNames); refreshedNames.clear();
        if (!names.length) return;
        if (names.some(function (n) { return Object.prototype.hasOwnProperty.call(MEMORY_SHAPE, n); })) {
            REDRAW.forEach(function (fn) {
                try { if (typeof window[fn] === 'function') window[fn](); }
                catch (e) { console.warn('[ClassAwareStorage] 重畫失敗：' + fn, e); }
            });
        }
        try { if (window.ClassPets) { if (window.ClassPets.prepare) window.ClassPets.prepare(); if (window.ClassPets.render) window.ClassPets.render(); } }
        catch (e) { console.warn('[ClassAwareStorage] 寵物重畫失敗', e); }
        try { window.dispatchEvent(new CustomEvent('class-data-refreshed', { detail: { names: names } })); }
        catch (e) { /* 舊瀏覽器或測試環境 */ }
    }

    function onOtherTabWrite(actualKey) {
        const name = watchedName(actualKey);
        if (!name || ownerChangedElsewhere()) return;     // 換帳號由 AccountVault 處理
        const live = _origGet.call(localStorage, actualKey);   // 事件可能排隊，以現在實際的內容為準
        if (seen.has(actualKey) && seen.get(actualKey) === live) return;   // 這一頁已經是最新的
        if (adoptIntoMemory(actualKey, live)) return;
        if (!seen.has(actualKey)) return;                 // 這一頁沒讀過這一項，手上沒有舊的
        let reloaded = false;                             // 模組說它已經重新讀取並重畫（回傳 true）
        (refreshers[name] || []).forEach(function (fn) {
            try { if (fn(name) === true) reloaded = true; }
            catch (e) { console.warn('[ClassAwareStorage] 重新讀取失敗：' + name, e); }
        });
        if (reloaded || RELAXED.has(name)) { seen.set(actualKey, live); return; }
        if (name === 'petSettings' && window.ClassPets) scheduleRedraw(name);   // 寵物重畫時會重新讀取設定
        if (seen.get(actualKey) === live) return;
        markStale(name);
    }
    /** 回到這一頁時補檢查一次：背景分頁可能被瀏覽器凍結，沒收到另一邊寫入的通知。 */
    function catchUp() {
        if (tabReloading || classChangedElsewhere) return;
        watchedName(CLASS_ID_KEY);     // 確保清單是這一頁目前的班級
        Array.from(watched.keys()).forEach(function (actualKey) {
            if (seen.has(actualKey) && seen.get(actualKey) !== _origGet.call(localStorage, actualKey)) onOtherTabWrite(actualKey);
        });
    }
    function markStale(name) {
        staleNames.add(name);
        if (!staleTicker) staleTicker = setInterval(function () { reloadIfStale(false); }, 5000);
    }
    /** 這一頁沒看過最新內容就要寫入：不寫，並讓老師知道。 */
    function rejectStaleWrite(actualKey) {
        const name = watchedName(actualKey);
        console.warn('[ClassAwareStorage] 另一個分頁已改過這項資料，這一頁的舊內容不寫入：' + actualKey);
        const live = _origGet.call(localStorage, actualKey);
        const adopted = adoptIntoMemory(actualKey, live);
        if (!adopted) { markStale(name); rejectedSomething = true; }
        const now = Date.now();
        if (now - rejectedAt > 10000) {
            rejectedAt = now;
            notify('warning', adopted
                ? '另一個分頁剛改過「' + label(name) + '」，這次修改沒有存檔。畫面已換成最新內容，請再操作一次。'
                : '另一個分頁已改過「' + label(name) + '」，為了不蓋掉那邊的內容，這次修改沒有存檔。這一頁會重新整理成最新內容，請之後再改一次。', 12000);
        }
        if (!adopted) setTimeout(function () { reloadIfStale(true); }, 1500);
    }
    function recentReloads() {
        try {
            const list = JSON.parse(sessionStorage.getItem(RELOAD_LOG) || '[]');
            return Array.isArray(list) ? list.filter(function (t) { return Date.now() - t < 120000; }) : [];
        } catch (e) { return []; }
    }
    /**
     * 這一頁有舊資料時找時機重新整理。
     * @param {boolean} userIsHere 老師正在這一頁（切回分頁、點進視窗、開始操作，或剛有修改被擋下）
     */
    function reloadIfStale(userIsHere) {
        if (!staleNames.size || tabReloading || classChangedElsewhere) return;
        // 這一頁後來自己重新讀過（例如切到那個功能頁時重新載入）就不算舊的了
        watched.forEach(function (name, actualKey) {
            if (staleNames.has(name) && seen.get(actualKey) === _origGet.call(localStorage, actualKey)) staleNames.delete(name);
        });
        if (!staleNames.size) {
            if (staleTicker) { clearInterval(staleTicker); staleTicker = null; }
            return;
        }
        try { if (document.hidden) return; } catch (e) { return; }
        if (!userIsHere) { try { if (!document.hasFocus()) return; } catch (e) { return; } }   // 只是投影著、沒人在操作：不打斷
        if (pageIsBusy() || Date.now() - lastTypedAt < 60000) return;   // 剛打過字：可能有還沒存的內容，晚一點再換
        const recent = recentReloads();
        if (recent.length >= 3) return;     // 兩分鐘內已自動重新整理 3 次：先停，寫入保護仍然有效
        try {
            recent.push(Date.now());
            sessionStorage.setItem(RELOAD_LOG, JSON.stringify(recent));
            sessionStorage.setItem(STALE_NOTICE, rejectedSomething ? 'rejected' : 'refreshed');
        } catch (e) { /* 無痕模式 */ }
        tabReloading = true;
        try { if (window.LeaveSyncGuard && window.LeaveSyncGuard.allowInternalNavigation) window.LeaveSyncGuard.allowInternalNavigation(); } catch (e) { /* ignore */ }
        try { window.location.reload(); } catch (e) { /* 測試環境 */ }
    }
    try {
        window.addEventListener('storage', function (event) {
            if (!event.key || event.key === CLASS_ID_KEY) return;
            if (event.storageArea && event.storageArea !== localStorage) return;
            onOtherTabWrite(event.key);
        });
        window.addEventListener('focus', function () { catchUp(); reloadIfStale(true); });
        document.addEventListener('visibilitychange', function () { if (!document.hidden) { catchUp(); reloadIfStale(true); } });
        // 老師開始操作這一頁：先換成最新內容再讓他操作；正在重新整理時，這一下點擊或按鍵不交給舊畫面
        ['pointerdown', 'keydown'].forEach(function (type) {
            document.addEventListener(type, function (event) {
                if (!staleNames.size && !tabReloading) return;
                if (!tabReloading) reloadIfStale(true);
                if (tabReloading) { try { event.stopImmediatePropagation(); event.preventDefault(); } catch (e) { /* ignore */ } }
            }, true);
        });
        document.addEventListener('input', function (event) {
            try { if (event.target && event.target.matches && event.target.matches(TYPING)) lastTypedAt = Date.now(); } catch (e) { /* ignore */ }
        }, true);
        ['click', 'pointerup', 'keyup', 'submit'].forEach(function (type) {
            document.addEventListener(type, function (event) {
                if (tabReloading) { try { event.stopImmediatePropagation(); event.preventDefault(); } catch (e) { /* ignore */ } }
            }, true);
        });
        const notice = sessionStorage.getItem(STALE_NOTICE);
        if (notice) {
            sessionStorage.removeItem(STALE_NOTICE);
            setTimeout(function () {
                notify(notice === 'rejected' ? 'warning' : 'info', notice === 'rejected'
                    ? '這一頁已換成另一個分頁更新後的最新內容。剛才沒有存檔的那次修改，請再做一次。'
                    : '另一個分頁更新了這一班的資料，這一頁已換成最新內容。', notice === 'rejected' ? 12000 : 6000);
            }, 2500);
        }
    } catch (e) { /* 測試環境沒有 window 事件 */ }

    // ───── 一次性遷移：保留升級前的現有資料 ─────
    // 場景：使用者升級到 v3.0.13 之前，若正在使用非預設班級，所有共用 key 的內容
    //       仍存在於全域 key 中。我們把它複製到該班級的 per-class key。
    //
    // ⚠️ 必須只跑一次！否則切換班級後，全域 key 仍是舊班級資料，會被誤複製到新班級。
    const MIGRATION_FLAG = 'classAwareStorageMigrated_v1';
    try {
        if (!_origGet.call(localStorage, MIGRATION_FLAG)) {
            const classId = _origGet.call(localStorage, 'currentClassId') || 'default';
            if (classId !== 'default') {
                let migrated = 0;
                SHARED_KEYS.forEach(key => {
                    if (key === 'petSettings') return; // 不複製其他班級的新功能設定
                    const perClassKey = key + '-' + classId;
                    const existsPerClass = _origGet.call(localStorage, perClassKey);
                    const existsGlobal = _origGet.call(localStorage, key);
                    if (existsPerClass === null && existsGlobal !== null) {
                        _origSet.call(localStorage, perClassKey, existsGlobal);
                        migrated++;
                    }
                });
                if (migrated > 0) {
                    console.log('[ClassAwareStorage] 已遷移 ' + migrated + ' 個 key 至班級 ' + classId);
                }
            }
            // 標記已完成遷移（無論是否實際遷移，避免再執行）
            _origSet.call(localStorage, MIGRATION_FLAG, '1');
        }
    } catch (e) {
        console.warn('[ClassAwareStorage] 遷移失敗（非致命）:', e);
    }

    // ==================== SafeStorage：不會靜默吃掉資料的寫入 ====================
    /**
     * v3.28.0：共用的「存檔失敗就講出來」寫入器。
     *
     * 背景：localStorage 只有幾 MB，寫滿時 setItem 會丟 QuotaExceededError。
     * 舊寫法多半是裸的 `localStorage.setItem(...)`——例外往上拋，後面的 render 不會執行，
     * 老師只看到畫面沒更新，以為只是卡頓，實際上這筆資料「從來沒存進去」。
     * 王薇婷老師就是這樣掉了數十筆加扣分（v3.25.0 已修加扣分那條路徑，這裡把同一套
     * 保護推廣到新增學生、作業、聯絡簿、抽籤等其餘寫入點）。
     *
     * 保證三件事：
     *   1. 多個 key 要嘛全部寫成功，要嘛全部還原成寫入前的內容（不留半套資料）。
     *   2. 失敗時呼叫 rollback() 把記憶體狀態也還原，畫面與資料才不會對不上。
     *   3. 失敗時一定會讓老師看到（通知＋alert），並透過 ErrorHandler 通報開發者。
     *
     * @param {Array<[string,?string]>} pairs 要寫入的 [key, value] 陣列（value 必須已是字串；
     *        value 給 null 代表「刪除這個 key」，讓匯入／還原可以把刪除也納入同一次原子操作）
     * @param {{context?:string, reportContext?:string, rollback?:Function, message?:string, feature?:string, petAction?:string, classId?:string, className?:string}} [opts]
     *        context  — 出事時要顯示給老師看的情境，例如「新增學生（王小明）」
     *        reportContext — 通報開發者用的情境；context 含學生姓名時必填，只能帶座號，
     *                   例如「新增學生（座號 7）」。通報會推到 Google Chat 並在雲端留底。
     *        rollback — 還原記憶體狀態的函式（例如把剛 push 的項目 pop 回來）
     *        message  — 自訂給老師看的訊息；預設會用 context 組一句
     * @returns {boolean} true=已存檔；false=沒存檔（呼叫端應該 return，不要繼續往下走）
     */
    function safeWrite(pairs, opts) {
        opts = opts || {};
        const list = (pairs || []).filter(p => Array.isArray(p) && p[0]);
        if (!list.length) return true;
        if (list.some(p => blockedWrite(opts.raw ? p[0] : classKey(p[0])))) return false;
        // 一般寫入（不是同步、還原這類「明確要換掉」的寫入）：這一頁手上是舊資料就整批不寫
        if (!opts.raw) {
            const staleKeys = list.filter(p => isStaleWrite(classKey(p[0]), p[1])).map(p => classKey(p[0]));
            if (staleKeys.length) {
                try { if (typeof opts.rollback === 'function') opts.rollback(); }
                catch (e) { console.error('[SafeStorage] rollback 失敗:', e); }
                staleKeys.forEach(rejectStaleWrite);
                return false;
            }
        }

        // 先拍快照（走一般 getItem，與 setItem 同一套班級 key 路由）
        const get = k => opts.raw ? _origGet.call(localStorage, k) : localStorage.getItem(k);
        const set = (k, v) => { if (!opts.raw) return localStorage.setItem(k, v); _origSet.call(localStorage, k, v); notePageClass(k, v); };
        const remove = k => { if (!opts.raw) return localStorage.removeItem(k); _origRemove.call(localStorage, k); notePageClass(k, null); };
        const snapshot = list.map(p => [p[0], get(p[0])]);
        try {
            list.forEach(p => p[1] === null ? remove(p[0]) : set(p[0], p[1]));
            return true;
        } catch (err) {
            // 前面幾個 key 可能已寫進去，全部還原成寫入前的樣子
            snapshot.forEach(function (s) {
                try {
                    s[1] === null ? remove(s[0]) : set(s[0], s[1]);
                } catch (e) { /* 空間已滿時還原也可能失敗，記憶體狀態才是主要保障 */ }
            });
            try { if (typeof opts.rollback === 'function') opts.rollback(); }
            catch (e) { console.error('[SafeStorage] rollback 失敗:', e); }

            const context = opts.context || '資料存檔';
            console.error('[SafeStorage] 寫入失敗（' + context + '）:', err);

            // 通報開發者：只有 ErrorHandler.handle 這條路會發 webhook
            try {
                if (window.ErrorHandler && window.ErrorHandler.handle) {
                    const errorOptions = { severity: 'critical' };
                    ['feature', 'petAction', 'classId', 'className', 'failureStage']
                        .forEach(key => { if (opts[key] != null) errorOptions[key] = opts[key]; });
                    window.ErrorHandler.handle(
                        new Error('資料寫入失敗：' + ((err && err.message) || err)),
                        'STORAGE', opts.reportContext || context, errorOptions
                    );
                }
            } catch (e) { /* 通報失敗不能再擋住主流程 */ }

            // 告訴老師：這次「沒有存檔」
            const msg = opts.message || ('⚠️ 這次「' + context + '」沒有存檔！\n\n' +
                '可能是瀏覽器儲存空間已滿。請先登入 Google 同步到雲端，或匯出備份後再試一次。');
            try { if (window.NotificationSystem && NotificationSystem.error) NotificationSystem.error(context + ' 沒有存檔（儲存空間可能已滿）'); }
            catch (e) { /* noop */ }
            try { alert(msg); } catch (e) { /* noop */ }
            return false;
        }
    }

    // ==================== LocalDataHold：本機資料讀不出來時，先暫停上傳雲端 ====================
    // v3.71.1：開機時某個班的學生名單／加扣分／作業等內容壞掉（不是合法資料），畫面會先用空白代替讓老師還能操作。
    // 但空白資料如果照常同步，會把雲端完整的班級蓋掉，所以替這個班記一個「暫停上傳」的記號，
    // 直到老師從雲端取回、匯入備份，或明確表示要以這台為準為止。
    const HOLD_PREFIX = 'class-manager-corrupt-hold:';
    window.LocalDataHold = {
        set(classId, keys) {
            try { _origSet.call(localStorage, HOLD_PREFIX + (classId || 'default'), JSON.stringify({ keys: keys || [], at: new Date().toISOString() })); }
            catch (e) { /* 存不進去時，至少這次開頁期間仍由 window.__localDataCorrupt 擋住 */ }
        },
        has(classId) {
            const id = classId || 'default';
            if (id === pageClassId && Array.isArray(window.__localDataCorrupt) && window.__localDataCorrupt.length) return true;
            return _origGet.call(localStorage, HOLD_PREFIX + id) !== null;
        },
        clear(classId) {
            const id = classId || 'default';
            try { _origRemove.call(localStorage, HOLD_PREFIX + id); } catch (e) { /* ignore */ }
            if (id === pageClassId) window.__localDataCorrupt = [];
        },
    };

    window.SafeStorage = {
        write: safeWrite,
        writeRaw(pairs, opts) { return safeWrite(pairs, { ...opts, raw: true }); },
        /** 單一 key 的捷徑：SafeStorage.set(KEY, JSON.stringify(x), { context, rollback }) */
        set(key, value, opts) { return safeWrite([[key, value]], opts); },
    };

    // 暴露工具給其他模組（特別是 firebase-sync.js）使用
    window.ClassAwareStorage = {
        SHARED_KEYS: Array.from(SHARED_KEYS),
        // 給 sync 模組用：建構指定班級的 key（不依賴 currentClassId）
        keyForClass(key, classId) {
            if (!SHARED_KEYS.has(key)) return key;
            if (!classId || classId === 'default') return key;
            return key + '-' + classId;
        },
        // 直接讀取（繞過攔截器，給 sync 模組用）
        rawGet(key) { return _origGet.call(localStorage, key); },
        rawSet(key, value) { if (blockedWrite(key)) return; const r = _origSet.call(localStorage, key, value); notePageClass(key, value); return r; },
        rawRemove(key) { if (blockedWrite(key)) return; const r = _origRemove.call(localStorage, key); notePageClass(key, null); return r; },
        // 只給 AccountVault 收納／切換使用：不經過上面的主人檢查
        vaultSet(key, value) { const r = _origSet.call(localStorage, key, value); notePageClass(key, value); return r; },
        vaultRemove(key) { const r = _origRemove.call(localStorage, key); notePageClass(key, null); return r; },
        setPageOwner(uid) { pageOwner = uid; },
        /** 這一頁載入時的班級（另一個分頁切班不會改變它）。 */
        pageClassId() { return pageClassId; },
        /**
         * 模組登記「另一個分頁改了這項資料時，重新從 localStorage 讀取並重畫」的函式。
         * 函式把模組手上那份換成新的並重畫後回傳 true，這一頁就算跟上了，不必重新整理；
         * 回傳其他值（例如正在編輯、不方便換）則照舊等安全時機重新整理。
         * @param {string|string[]} names 程式裡寫的名稱，例如 'classAnnouncements'
         * @param {Function} fn
         */
        onOtherTabChange(names, fn) {
            (Array.isArray(names) ? names : [names]).forEach(function (n) { (refreshers[n] = refreshers[n] || []).push(fn); });
        },
        /** 只是看一眼目前存的內容（例如比對有沒有變），不代表這一頁手上那份已經更新。 */
        peek(key) { return _origGet.call(localStorage, classKey(key)); },
        /** 另一個分頁改過、這一頁還沒跟上的資料名稱（診斷與測試用）。 */
        staleNames() { return Array.from(staleNames); },
    };

    console.log('[ClassAwareStorage] localStorage 攔截器已載入（' + SHARED_KEYS.size + ' 個共用 key 將依班級隔離）');
})();
