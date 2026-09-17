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
    function classKey(key) {
        if (!SHARED_KEYS.has(key)) return key;
        // 注意：使用 _origGet 讀取 currentClassId，避免無限遞迴
        const classId = _origGet.call(localStorage, 'currentClassId') || 'default';
        if (classId === 'default') return key;
        return key + '-' + classId;
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

    // ───── 攔截 localStorage 方法（v3.1.4 加入 quota-safe 包裝） ─────
    _proto.getItem = function (key) {
        return _origGet.call(this, classKey(key));
    };
    _proto.setItem = function (key, value) {
        const actualKey = classKey(key);
        try {
            return _origSet.call(this, actualKey, value);
        } catch (err) {
            // QuotaExceededError 或 similar
            if (err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014)) {
                console.warn('[ClassAwareStorage] localStorage 已滿，嘗試緊急清理...');
                const freed = emergencyCleanup();
                if (freed > 0) {
                    console.log('[ClassAwareStorage] 已釋放 ' + (freed / 1024).toFixed(1) + ' KB，重試儲存');
                    try {
                        return _origSet.call(this, actualKey, value);
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
        return _origRemove.call(this, classKey(key));
    };

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
     * @param {{context?:string, rollback?:Function, message?:string}} [opts]
     *        context  — 出事時要顯示／通報的情境，例如「新增學生（王小明）」
     *        rollback — 還原記憶體狀態的函式（例如把剛 push 的項目 pop 回來）
     *        message  — 自訂給老師看的訊息；預設會用 context 組一句
     * @returns {boolean} true=已存檔；false=沒存檔（呼叫端應該 return，不要繼續往下走）
     */
    function safeWrite(pairs, opts) {
        opts = opts || {};
        const list = (pairs || []).filter(p => Array.isArray(p) && p[0]);
        if (!list.length) return true;

        // 先拍快照（走一般 getItem，與 setItem 同一套班級 key 路由）
        const snapshot = list.map(p => [p[0], localStorage.getItem(p[0])]);
        try {
            list.forEach(p => p[1] === null ? localStorage.removeItem(p[0]) : localStorage.setItem(p[0], p[1]));
            return true;
        } catch (err) {
            // 前面幾個 key 可能已寫進去，全部還原成寫入前的樣子
            snapshot.forEach(function (s) {
                try {
                    s[1] === null ? localStorage.removeItem(s[0]) : localStorage.setItem(s[0], s[1]);
                } catch (e) { /* 空間已滿時還原也可能失敗，記憶體狀態才是主要保障 */ }
            });
            try { if (typeof opts.rollback === 'function') opts.rollback(); }
            catch (e) { console.error('[SafeStorage] rollback 失敗:', e); }

            const context = opts.context || '資料存檔';
            console.error('[SafeStorage] 寫入失敗（' + context + '）:', err);

            // 通報開發者：只有 ErrorHandler.handle 這條路會發 webhook
            try {
                if (window.ErrorHandler && window.ErrorHandler.handle) {
                    window.ErrorHandler.handle(
                        new Error('資料寫入失敗：' + ((err && err.message) || err)),
                        'STORAGE', context, { severity: 'critical' }
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

    window.SafeStorage = {
        write: safeWrite,
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
        rawSet(key, value) { return _origSet.call(localStorage, key, value); },
        rawRemove(key) { return _origRemove.call(localStorage, key); },
    };

    console.log('[ClassAwareStorage] localStorage 攔截器已載入（' + SHARED_KEYS.size + ' 個共用 key 將依班級隔離）');
})();
