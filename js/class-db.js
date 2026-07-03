/**
 * ClassDB - IndexedDB 儲存模組 v1.0
 * 完整取代 localStorage，並提供自動遷移功能
 *
 * 特性：
 * - 容量從 5MB 升至 250MB+
 * - 支援非同步讀寫，不阻塞 UI
 * - 首次啟動自動從 localStorage 遷移所有資料
 * - localStorage 作為後備（遷移前/IndexedDB 不可用時）
 */

const ClassDB = (() => {
    'use strict';

    // 動態 DB 名稱：預設班級用 'ClassManagerDB'（向下相容），其他班級用獨立名稱
    const _curClassId = localStorage.getItem('currentClassId') || 'default';
    const DB_NAME = _curClassId === 'default' ? 'ClassManagerDB' : `ClassManagerDB-${_curClassId}`;
    const DB_VERSION = 1;

    // ─── 資料表定義 ───────────────────────────────────────────
    // 以 localStorage key 為基準，分為兩類：
    //   ① Array 資料表：每筆記錄獨立存取
    //   ② Settings 文件表：整體讀寫，存在 settings store

    const ARRAY_STORES = [
        'students',
        'pointsHistory',
        'groups',
        'notebookEntries',
        'homeworkList',
        'lotteryHistory',
        'classAnnouncements',
        'examSubjects',
        'savedStudentLists',
    ];

    const SETTINGS_KEYS = [
        'clockSettings',
        'homeworkChecks',
        'drawnStudentIds',
        'noRepeatLottery',
        'lastSyncTime',
        'lastAutoBackup',
        'examReminders',
        'examAttendance',
        'theme',
    ];

    // localStorage key → IDB store name 映射
    const KEY_MAP = {
        pointsHistory: 'pointsHistory',
        notebookEntries: 'notebookEntries',
        homeworkList: 'homeworkList',
        lotteryHistory: 'lotteryHistory',
        classAnnouncements: 'classAnnouncements',
        examSubjects: 'examSubjects',
        savedStudentLists: 'savedStudentLists',
    };

    // ─── 狀態 ─────────────────────────────────────────────────
    let db = null;
    let ready = false;
    let readyCallbacks = [];

    // ─── 交易佇列（序列化執行）─────────────────────────────────
    // Safari（尤其 iPad）在同一時間並發開啟多個 IndexedDB transaction 時，
    // 會有已知穩定性問題：某個 transaction 被提前判定為已結束，
    // 之後對它的存取就會丟出「Attempt to get records from database
    // without an in-progress transaction」。強制所有交易依序執行可完全避開。
    let opQueue = Promise.resolve();
    function enqueueOp(fn) {
        const result = opQueue.then(fn, fn);
        opQueue = result.catch(() => {}); // 佇列本身永遠不 reject，才不會卡住後續操作
        return result;
    }

    // ─── 初始化 ───────────────────────────────────────────────
    function init() {
        return new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) {
                console.warn('❌ IndexedDB 不支援，將使用 localStorage 後備');
                resolve(false);
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('IndexedDB 開啟失敗:', request.error);
                resolve(false);
            };

            request.onsuccess = () => {
                db = request.result;
                ready = true;
                readyCallbacks.forEach(cb => cb());
                readyCallbacks = [];
                console.log('✅ ClassDB (IndexedDB) 初始化成功');
                resolve(true);
            };

            request.onupgradeneeded = (event) => {
                const idb = event.target.result;

                // ① Array 資料表（個別存取）
                for (const name of ARRAY_STORES) {
                    if (!idb.objectStoreNames.contains(name)) {
                        const store = idb.createObjectStore(name, { keyPath: 'id', autoIncrement: false });
                        // 常用索引
                        if (name === 'students') {
                            store.createIndex('name', 'name', { unique: false });
                            store.createIndex('seatNumber', 'seatNumber', { unique: false });
                        }
                        if (name === 'pointsHistory') {
                            store.createIndex('studentId', 'studentId', { unique: false });
                            store.createIndex('time', 'time', { unique: false });
                        }
                        if (name === 'notebookEntries') {
                            store.createIndex('date', 'date', { unique: false });
                        }
                    }
                }

                // ② Settings key-value 表
                if (!idb.objectStoreNames.contains('settings')) {
                    idb.createObjectStore('settings', { keyPath: 'key' });
                }

                console.log('📦 IndexedDB 結構建立完成');
            };
        });
    }

    // ─── 工具：等待 ready ─────────────────────────────────────
    function whenReady() {
        if (ready) return Promise.resolve();
        return new Promise(resolve => readyCallbacks.push(resolve));
    }

    // ─── 工具：取得 Transaction store ─────────────────────────
    function getStore(storeName, mode = 'readonly') {
        if (!db) throw new Error('IndexedDB 尚未初始化');
        return db.transaction(storeName, mode).objectStore(storeName);
    }

    // ─── 基本 CRUD（Array Store）─────────────────────────────

    /**
     * 取得 Array 資料表全部資料
     */
    function getAll(storeName) {
        return enqueueOp(() => new Promise((resolve, reject) => {
            try {
                const store = getStore(storeName, 'readonly');
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            } catch (e) {
                reject(e);
            }
        }));
    }

    /**
     * 整批替換 Array 資料表（清空後重寫）
     */
    function putAll(storeName, dataArray) {
        if (!Array.isArray(dataArray)) return Promise.resolve();
        return enqueueOp(() => new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const clearReq = store.clear();
                clearReq.onsuccess = () => {
                    let count = 0;
                    if (dataArray.length === 0) { resolve(); return; }
                    dataArray.forEach(item => {
                        // 確保有 id 欄位
                        const record = item.id ? item : { ...item, id: String(Date.now()) + Math.random() };
                        const req = store.put(record);
                        req.onsuccess = () => { count++; if (count === dataArray.length) resolve(); };
                        req.onerror = () => reject(req.error);
                    });
                };
                clearReq.onerror = () => reject(clearReq.error);
            } catch (e) {
                reject(e);
            }
        }));
    }

    /**
     * 單筆插入/更新（upsert）
     */
    function put(storeName, item) {
        return enqueueOp(() => new Promise((resolve, reject) => {
            try {
                const store = getStore(storeName, 'readwrite');
                const request = store.put(item);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (e) {
                reject(e);
            }
        }));
    }

    /**
     * 刪除單筆
     */
    function remove(storeName, id) {
        return enqueueOp(() => new Promise((resolve, reject) => {
            try {
                const store = getStore(storeName, 'readwrite');
                const request = store.delete(id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            } catch (e) {
                reject(e);
            }
        }));
    }

    // ─── Settings 讀寫 ────────────────────────────────────────

    /**
     * 讀取設定值
     */
    async function getSetting(key) {
        return enqueueOp(() => new Promise((resolve, reject) => {
            try {
                const store = getStore('settings', 'readonly');
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result?.value ?? null);
                request.onerror = () => reject(request.error);
            } catch (e) {
                reject(e);
            }
        }));
    }

    /**
     * 儲存設定值
     */
    async function setSetting(key, value) {
        return enqueueOp(() => new Promise((resolve, reject) => {
            try {
                const store = getStore('settings', 'readwrite');
                const request = store.put({ key, value });
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            } catch (e) {
                reject(e);
            }
        }));
    }

    // ─── 高階 API：JSON-safe 自動序列化 ──────────────────────

    /**
     * 讀取（優先 IDB，後備 localStorage）
     */
    async function load(key, fallback = null) {
        if (!ready) {
            // 後備：localStorage
            try {
                const v = localStorage.getItem(key);
                return v ? JSON.parse(v) : fallback;
            } catch { return fallback; }
        }

        try {
            // Array 資料表
            if (ARRAY_STORES.includes(KEY_MAP[key] || key)) {
                const store = KEY_MAP[key] || key;
                const data = await getAll(store);
                return data.length ? data : fallback;
            }
            // Settings
            const val = await getSetting(key);
            return val ?? fallback;
        } catch (e) {
            console.warn(`ClassDB.load("${key}") 失敗，後備 localStorage:`, e);
            try {
                const v = localStorage.getItem(key);
                return v ? JSON.parse(v) : fallback;
            } catch { return fallback; }
        }
    }

    /**
     * 儲存（寫入 IDB + 同步備份至 localStorage）
     */
    async function save(key, value) {
        // 先備份至 localStorage（防止 IDB 失敗時資料遺失）
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (lsErr) {
            console.warn('localStorage 備份失敗（可能已滿）:', lsErr);
        }

        if (!ready) return; // IDB 尚未可用，localStorage 已儲存

        try {
            const storeName = KEY_MAP[key] || key;
            if (ARRAY_STORES.includes(storeName)) {
                await putAll(storeName, value);
            } else {
                await setSetting(key, value);
            }
        } catch (e) {
            console.error(`ClassDB.save("${key}") 失敗:`, e);
        }
    }

    // ─── 自動遷移 localStorage → IndexedDB ───────────────────

    async function migrateFromLocalStorage() {
        const MIGRATED_FLAG = 'classdb_migrated_v1';
        if (localStorage.getItem(MIGRATED_FLAG)) {
            console.log('✅ IndexedDB 遷移已在之前完成，跳過');
            return;
        }

        console.log('🚀 開始從 localStorage 遷移資料至 IndexedDB...');
        let migratedCount = 0;

        const allKeys = [
            'students', 'pointsHistory', 'groups', 'notebookEntries',
            'homeworkList', 'lotteryHistory', 'classAnnouncements',
            'examSubjects', 'savedStudentLists',
            'clockSettings', 'homeworkChecks', 'drawnStudentIds',
            'noRepeatLottery', 'lastSyncTime', 'lastAutoBackup',
            'examReminders', 'examAttendance', 'theme',
        ];

        for (const key of allKeys) {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            try {
                const value = JSON.parse(raw);
                await save(key, value);
                migratedCount++;
            } catch (e) {
                // 非 JSON 值（字串）
                await setSetting(key, raw);
                migratedCount++;
            }
        }

        localStorage.setItem(MIGRATED_FLAG, '1');
        console.log(`✅ 遷移完成，共遷移 ${migratedCount} 個資料鍵`);
    }

    // ─── 取得目前儲存使用量報告 ──────────────────────────────
    async function getStorageReport() {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            const used = (estimate.usage / 1024 / 1024).toFixed(2);
            const quota = (estimate.quota / 1024 / 1024).toFixed(1);
            return { used: `${used} MB`, quota: `${quota} MB`, pct: ((estimate.usage / estimate.quota) * 100).toFixed(1) + '%' };
        }
        return { used: '不明', quota: '不明', pct: '不明' };
    }

    // ─── 初始化入口 ───────────────────────────────────────────
    async function initialize() {
        const ok = await init();
        if (ok) {
            await migrateFromLocalStorage();
        }
        return ok;
    }

    // ─── 公開 API ─────────────────────────────────────────────
    return {
        initialize,
        // 高階（建議使用）
        load,
        save,
        // 底層
        getAll,
        putAll,
        put,
        remove,
        getSetting,
        setSetting,
        getStorageReport,
        // 狀態
        get isReady() { return ready; },
    };
})();

// 自動初始化
(async () => {
    await ClassDB.initialize();

    // 初始化完成後，告知其他模組
    document.dispatchEvent(new CustomEvent('classdb:ready'));

    // 儲存用量報告（開發模式）
    if (location.hostname === 'localhost') {
        const report = await ClassDB.getStorageReport();
        console.log(`📦 IndexedDB 用量：${report.used} / ${report.quota} (${report.pct})`);
    }
})();
