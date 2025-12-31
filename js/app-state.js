/**
 * AppState - 班級小管家集中狀態管理
 * 
 * P0 優化項目：將散落的全域變數集中到一個 AppState 物件
 * 提供統一的狀態存取、儲存和錯誤處理機制
 */

const AppState = {
    // ==========================================
    // === 資料狀態 ===
    // ==========================================

    /** @type {Array} 學生資料 */
    students: [],

    /** @type {Array} 加扣分歷史 */
    pointsHistory: [],

    /** @type {Array} 抽籤歷史 */
    lotteryHistory: [],

    /** @type {Array} 分組資料 */
    groups: [],

    /** @type {Array} 聯絡簿項目 */
    notebookEntries: [],

    /** @type {Array} 作業清單 */
    homeworkList: [],

    /** @type {Object} 作業繳交記錄 */
    homeworkChecks: {},

    // ==========================================
    // === 計時器狀態 ===
    // ==========================================
    timer: {
        interval: null,
        running: false,
        totalSeconds: 300,      // 預設 5 分鐘
        originalSeconds: 300,   // 用於進度條計算
        mode: 'countdown'       // 'countdown' 或 'stopwatch'
    },

    // ==========================================
    // === 抽籤系統狀態 ===
    // ==========================================
    lottery: {
        drawnStudentIds: [],    // 已抽取過的學生 ID
        noRepeat: true          // 是否開啟不重複抽取
    },

    // ==========================================
    // === 全螢幕時鐘狀態 ===
    // ==========================================
    clock: {
        interval: null,
        wakeLock: null,
        prevFlipTime: '',       // 翻轉時鐘動畫用
        settings: {
            style: 'digital',
            showDate: true,
            is24Hour: null,     // null 表示自動偵測
            isDarkMode: false
        }
    },

    // ==========================================
    // === UI 狀態 ===
    // ==========================================
    ui: {
        audioContext: null,
        selectedQuickAction: null,
        selectedQuickPoints: null,
        currentVisibleList: null,  // 目前顯示的作業名單
        currentSearchTerm: ''      // 搜尋關鍵字
    },

    // ==========================================
    // === 初始化方法 ===
    // ==========================================

    /**
     * 初始化應用狀態，從 localStorage 載入資料
     */
    init() {
        // 載入資料狀態
        this.students = this._loadFromStorage('students', []);
        this.pointsHistory = this._loadFromStorage('pointsHistory', []);
        this.lotteryHistory = this._loadFromStorage('lotteryHistory', []);
        this.groups = this._loadFromStorage('groups', []);
        this.notebookEntries = this._loadFromStorage('notebookEntries', []);
        this.homeworkList = this._loadFromStorage('homeworkList', []);
        this.homeworkChecks = this._loadFromStorage('homeworkChecks', {});

        // 載入抽籤設定
        this.lottery.drawnStudentIds = this._loadFromStorage('drawnStudentIds', []);
        this.lottery.noRepeat = this._loadFromStorage('noRepeatLottery', true);

        // 載入時鐘設定
        const savedClockSettings = this._loadFromStorage('clockSettings', null);
        if (savedClockSettings) {
            this.clock.settings = { ...this.clock.settings, ...savedClockSettings };
        }

        console.log('✅ AppState 初始化完成');
        return this;
    },

    // ==========================================
    // === 儲存方法 ===
    // ==========================================

    /**
     * 儲存學生資料
     */
    saveStudents() {
        this._saveToStorage('students', this.students);
    },

    /**
     * 儲存加扣分歷史
     */
    savePointsHistory() {
        this._saveToStorage('pointsHistory', this.pointsHistory);
    },

    /**
     * 儲存抽籤歷史
     */
    saveLotteryHistory() {
        this._saveToStorage('lotteryHistory', this.lotteryHistory);
    },

    /**
     * 儲存分組資料
     */
    saveGroups() {
        this._saveToStorage('groups', this.groups);
    },

    /**
     * 儲存聯絡簿項目
     */
    saveNotebookEntries() {
        this._saveToStorage('notebookEntries', this.notebookEntries);
    },

    /**
     * 儲存作業清單
     */
    saveHomeworkList() {
        this._saveToStorage('homeworkList', this.homeworkList);
    },

    /**
     * 儲存作業繳交記錄
     */
    saveHomeworkChecks() {
        this._saveToStorage('homeworkChecks', this.homeworkChecks);
    },

    /**
     * 儲存抽籤設定
     */
    saveLotterySettings() {
        this._saveToStorage('drawnStudentIds', this.lottery.drawnStudentIds);
        this._saveToStorage('noRepeatLottery', this.lottery.noRepeat);
    },

    /**
     * 儲存時鐘設定
     */
    saveClockSettings() {
        this._saveToStorage('clockSettings', this.clock.settings);
    },

    // ==========================================
    // === 內部工具方法 ===
    // ==========================================

    /**
     * 從 localStorage 載入資料（含錯誤處理）
     * @param {string} key - 儲存鍵值
     * @param {*} defaultValue - 預設值
     * @returns {*} 載入的資料或預設值
     */
    _loadFromStorage(key, defaultValue) {
        try {
            const data = localStorage.getItem(key);
            if (data === null) return defaultValue;
            return JSON.parse(data);
        } catch (error) {
            console.warn(`⚠️ 載入 ${key} 失敗:`, error);
            return defaultValue;
        }
    },

    /**
     * 儲存資料到 localStorage（含錯誤處理）
     * @param {string} key - 儲存鍵值
     * @param {*} value - 要儲存的資料
     * @returns {boolean} 是否儲存成功
     */
    _saveToStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error(`❌ 儲存 ${key} 失敗:`, error);

            // 處理 localStorage 已滿的情況
            if (error.name === 'QuotaExceededError') {
                console.warn('localStorage 容量已滿，嘗試清理舊資料...');
                // 可以在這裡加入清理邏輯
            }

            return false;
        }
    },

    // ==========================================
    // === 資料備份與還原 ===
    // ==========================================

    /**
     * 匯出所有資料
     * @returns {Object} 完整備份資料
     */
    exportAll() {
        return {
            version: '2.2.0',
            exportDate: new Date().toISOString(),
            students: this.students,
            pointsHistory: this.pointsHistory,
            lotteryHistory: this.lotteryHistory,
            groups: this.groups,
            notebookEntries: this.notebookEntries,
            homeworkList: this.homeworkList,
            homeworkChecks: this.homeworkChecks,
            lottery: {
                drawnStudentIds: this.lottery.drawnStudentIds,
                noRepeat: this.lottery.noRepeat
            },
            clockSettings: this.clock.settings
        };
    },

    /**
     * 匯入所有資料
     * @param {Object} data - 備份資料
     */
    importAll(data) {
        if (data.students) {
            this.students = data.students;
            this.saveStudents();
        }
        if (data.pointsHistory) {
            this.pointsHistory = data.pointsHistory;
            this.savePointsHistory();
        }
        if (data.lotteryHistory) {
            this.lotteryHistory = data.lotteryHistory;
            this.saveLotteryHistory();
        }
        if (data.groups) {
            this.groups = data.groups;
            this.saveGroups();
        }
        if (data.notebookEntries) {
            this.notebookEntries = data.notebookEntries;
            this.saveNotebookEntries();
        }
        if (data.homeworkList) {
            this.homeworkList = data.homeworkList;
            this.saveHomeworkList();
        }
        if (data.homeworkChecks) {
            this.homeworkChecks = data.homeworkChecks;
            this.saveHomeworkChecks();
        }
        if (data.lottery) {
            this.lottery.drawnStudentIds = data.lottery.drawnStudentIds || [];
            this.lottery.noRepeat = data.lottery.noRepeat ?? true;
            this.saveLotterySettings();
        }
        if (data.clockSettings) {
            this.clock.settings = { ...this.clock.settings, ...data.clockSettings };
            this.saveClockSettings();
        }
    },

    /**
     * 清除所有資料（危險操作）
     */
    clearAll() {
        const keys = [
            'students', 'pointsHistory', 'lotteryHistory', 'groups',
            'notebookEntries', 'homeworkList', 'homeworkChecks',
            'drawnStudentIds', 'noRepeatLottery', 'clockSettings'
        ];

        keys.forEach(key => {
            try {
                localStorage.removeItem(key);
            } catch (error) {
                console.warn(`清除 ${key} 失敗:`, error);
            }
        });

        // 重新初始化
        this.init();
    }
};

// 自動初始化（如果 DOM 已載入）
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AppState.init());
} else {
    AppState.init();
}
