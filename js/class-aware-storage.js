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

    // ───── 攔截 localStorage 方法 ─────
    _proto.getItem = function (key) {
        return _origGet.call(this, classKey(key));
    };
    _proto.setItem = function (key, value) {
        return _origSet.call(this, classKey(key), value);
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
