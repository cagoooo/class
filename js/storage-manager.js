/**
 * 儲存管理工具模組
 * 提供安全的 localStorage 操作和統一的狀態管理
 */

(function () {
    'use strict';

    // === 應用程式狀態管理 ===
    window.AppState = {
        // 學生資料
        students: [],
        // 分組資料
        groups: [],
        // 作業列表
        homeworkList: [],
        // 作業檢查記錄
        homeworkChecks: {},
        // 加扣分歷史
        pointsHistory: [],
        // 抽籤歷史
        lotteryHistory: [],
        // 已抽取學生 ID
        drawnStudentIds: [],
        // 設定
        settings: {
            noRepeatLottery: true,
            theme: 'light'
        }
    };

    // === 安全的 localStorage 操作 ===
    const StorageManager = {
        /**
         * 安全讀取 localStorage
         * @param {string} key - 儲存鍵名
         * @param {*} defaultValue - 預設值
         * @returns {*} 讀取的值或預設值
         */
        get(key, defaultValue = null) {
            try {
                const item = localStorage.getItem(key);
                if (item === null) return defaultValue;
                return JSON.parse(item);
            } catch (error) {
                console.error(`[StorageManager] 讀取 "${key}" 失敗:`, error);
                return defaultValue;
            }
        },

        /**
         * 安全寫入 localStorage
         * @param {string} key - 儲存鍵名
         * @param {*} value - 要儲存的值
         * @returns {boolean} 是否成功
         */
        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (error) {
                console.error(`[StorageManager] 寫入 "${key}" 失敗:`, error);

                // 檢查是否為配額超出錯誤
                if (error.name === 'QuotaExceededError' || error.code === 22) {
                    this.handleQuotaExceeded(key);
                }
                return false;
            }
        },

        /**
         * 安全刪除 localStorage
         * @param {string} key - 儲存鍵名
         * @returns {boolean} 是否成功
         */
        remove(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (error) {
                console.error(`[StorageManager] 刪除 "${key}" 失敗:`, error);
                return false;
            }
        },

        /**
         * 處理配額超出錯誤
         * @param {string} failedKey - 失敗的鍵名
         */
        handleQuotaExceeded(failedKey) {
            console.warn('[StorageManager] localStorage 配額已滿，嘗試清理...');

            // 嘗試清理舊的歷史記錄
            const keysToTrim = ['pointsHistory', 'lotteryHistory'];

            keysToTrim.forEach(key => {
                try {
                    const data = this.get(key, []);
                    if (Array.isArray(data) && data.length > 100) {
                        // 只保留最新的 100 筆
                        const trimmed = data.slice(0, 100);
                        localStorage.setItem(key, JSON.stringify(trimmed));
                        console.log(`[StorageManager] 已裁剪 "${key}"，從 ${data.length} 筆減至 100 筆`);
                    }
                } catch (e) {
                    console.error(`[StorageManager] 裁剪 "${key}" 失敗:`, e);
                }
            });

            // 通知用戶
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.warning('儲存空間不足，部分舊資料已被清理');
            }
        },

        /**
         * 獲取儲存使用狀況
         * @returns {Object} 使用狀況資訊
         */
        getUsage() {
            let totalSize = 0;
            const details = {};

            try {
                for (let key in localStorage) {
                    if (localStorage.hasOwnProperty(key)) {
                        const size = (localStorage[key].length * 2) / 1024; // KB
                        details[key] = size;
                        totalSize += size;
                    }
                }
            } catch (error) {
                console.error('[StorageManager] 無法計算儲存使用量:', error);
            }

            return {
                totalKB: totalSize.toFixed(2),
                details: details,
                estimatedMaxKB: 5120 // 約 5MB
            };
        },

        /**
         * 匯出所有資料
         * @returns {Object} 所有儲存的資料
         */
        exportAll() {
            const data = {};
            const keys = [
                'students', 'groups', 'homeworkList', 'homeworkChecks',
                'pointsHistory', 'lotteryHistory', 'drawnStudentIds',
                'noRepeatLottery', 'theme'
            ];

            keys.forEach(key => {
                data[key] = this.get(key, null);
            });

            data.exportedAt = new Date().toISOString();
            data.version = '2.2.0';

            return data;
        },

        /**
         * 匯入資料
         * @param {Object} data - 要匯入的資料
         * @returns {boolean} 是否成功
         */
        importAll(data) {
            if (!data || typeof data !== 'object') {
                console.error('[StorageManager] 匯入資料格式錯誤');
                return false;
            }

            const keys = [
                'students', 'groups', 'homeworkList', 'homeworkChecks',
                'pointsHistory', 'lotteryHistory', 'drawnStudentIds'
            ];

            let success = true;
            keys.forEach(key => {
                if (data[key] !== undefined) {
                    if (!this.set(key, data[key])) {
                        success = false;
                    }
                }
            });

            return success;
        }
    };

    // === 初始化載入資料到 AppState ===
    function initAppState() {
        // 確保 settings 物件存在
        if (!AppState.settings) {
            AppState.settings = {
                noRepeatLottery: true,
                theme: 'light'
            };
        }

        AppState.students = StorageManager.get('students', []);
        AppState.groups = StorageManager.get('groups', []);
        AppState.homeworkList = StorageManager.get('homeworkList', []);
        AppState.homeworkChecks = StorageManager.get('homeworkChecks', {});
        AppState.pointsHistory = StorageManager.get('pointsHistory', []);
        AppState.lotteryHistory = StorageManager.get('lotteryHistory', []);
        AppState.drawnStudentIds = StorageManager.get('drawnStudentIds', []);
        AppState.settings.noRepeatLottery = StorageManager.get('noRepeatLottery', true);
        AppState.settings.theme = StorageManager.get('theme', 'light');

        console.log('✅ AppState 已初始化');
    }

    // === 同步全域變數（向後相容） ===
    function syncGlobalVariables() {
        // 確保全域變數與 AppState 同步
        if (typeof window.students === 'undefined') {
            window.students = AppState.students;
        }
        if (typeof window.groups === 'undefined') {
            window.groups = AppState.groups;
        }
        if (typeof window.homeworkList === 'undefined') {
            window.homeworkList = AppState.homeworkList;
        }
        if (typeof window.homeworkChecks === 'undefined') {
            window.homeworkChecks = AppState.homeworkChecks;
        }
        if (typeof window.pointsHistory === 'undefined') {
            window.pointsHistory = AppState.pointsHistory;
        }
        if (typeof window.lotteryHistory === 'undefined') {
            window.lotteryHistory = AppState.lotteryHistory;
        }
        if (typeof window.drawnStudentIds === 'undefined') {
            window.drawnStudentIds = AppState.drawnStudentIds;
        }
        if (typeof window.noRepeatLottery === 'undefined') {
            window.noRepeatLottery = AppState.settings.noRepeatLottery;
        }
    }

    // 暴露到全域
    window.StorageManager = StorageManager;

    // 初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initAppState();
            syncGlobalVariables();
        });
    } else {
        initAppState();
        syncGlobalVariables();
    }

    console.log('✅ 儲存管理工具已載入');
})();
