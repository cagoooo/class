/**
 * 事件總線模組 (Event Bus)
 * 用於模組間的統一事件通訊
 * 
 * @version 1.0.0
 * @since 2026-01-13
 */

const EventBus = (function () {
    'use strict';

    // 私有事件儲存
    const events = {};

    // 事件歷史記錄（用於除錯）
    const eventHistory = [];
    const MAX_HISTORY = 100;

    // 是否啟用除錯模式
    let debugMode = false;

    /**
     * 記錄事件到歷史
     */
    function logEvent(type, eventName, data) {
        if (eventHistory.length >= MAX_HISTORY) {
            eventHistory.shift();
        }
        eventHistory.push({
            type,
            eventName,
            data,
            timestamp: new Date().toISOString()
        });

        if (debugMode) {
            console.log(`[EventBus] ${type}: ${eventName}`, data);
        }
    }

    return {
        /**
         * 訂閱事件
         * @param {string} eventName - 事件名稱
         * @param {Function} callback - 回調函數
         * @returns {Function} - 取消訂閱函數
         * 
         * @example
         * const unsubscribe = EventBus.on('student:updated', (data) => {
         *     console.log('學生已更新:', data);
         * });
         * // 取消訂閱
         * unsubscribe();
         */
        on(eventName, callback) {
            if (typeof callback !== 'function') {
                console.error('[EventBus] callback 必須是函數');
                return () => { };
            }

            if (!events[eventName]) {
                events[eventName] = [];
            }

            events[eventName].push(callback);
            logEvent('SUBSCRIBE', eventName, { callbackCount: events[eventName].length });

            // 返回取消訂閱函數
            return () => this.off(eventName, callback);
        },

        /**
         * 訂閱事件（只觸發一次）
         * @param {string} eventName - 事件名稱
         * @param {Function} callback - 回調函數
         * @returns {Function} - 取消訂閱函數
         */
        once(eventName, callback) {
            const onceCallback = (data) => {
                callback(data);
                this.off(eventName, onceCallback);
            };
            return this.on(eventName, onceCallback);
        },

        /**
         * 取消訂閱事件
         * @param {string} eventName - 事件名稱
         * @param {Function} callback - 要移除的回調函數
         */
        off(eventName, callback) {
            if (!events[eventName]) return;

            const index = events[eventName].indexOf(callback);
            if (index > -1) {
                events[eventName].splice(index, 1);
                logEvent('UNSUBSCRIBE', eventName, { remainingCount: events[eventName].length });
            }

            // 如果沒有監聽器了，清理事件
            if (events[eventName].length === 0) {
                delete events[eventName];
            }
        },

        /**
         * 發送事件
         * @param {string} eventName - 事件名稱
         * @param {*} data - 事件資料
         */
        emit(eventName, data) {
            logEvent('EMIT', eventName, data);

            if (!events[eventName]) return;

            // 複製陣列避免在遍歷時修改
            const callbacks = [...events[eventName]];
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[EventBus] 事件處理器錯誤 (${eventName}):`, error);
                    // 如果有錯誤處理器，發送錯誤事件
                    if (eventName !== 'error') {
                        this.emit('error', { eventName, error, data });
                    }
                }
            });
        },

        /**
         * 移除某事件的所有監聽器
         * @param {string} eventName - 事件名稱
         */
        removeAll(eventName) {
            if (eventName) {
                delete events[eventName];
                logEvent('REMOVE_ALL', eventName, null);
            } else {
                // 清除所有事件
                Object.keys(events).forEach(key => delete events[key]);
                logEvent('REMOVE_ALL', '*', null);
            }
        },

        /**
         * 取得事件監聽器數量
         * @param {string} eventName - 事件名稱
         * @returns {number} - 監聽器數量
         */
        listenerCount(eventName) {
            return events[eventName] ? events[eventName].length : 0;
        },

        /**
         * 取得所有已註冊的事件名稱
         * @returns {string[]} - 事件名稱陣列
         */
        eventNames() {
            return Object.keys(events);
        },

        /**
         * 取得事件歷史記錄
         * @returns {Array} - 事件歷史
         */
        getHistory() {
            return [...eventHistory];
        },

        /**
         * 清除事件歷史
         */
        clearHistory() {
            eventHistory.length = 0;
        },

        /**
         * 設定除錯模式
         * @param {boolean} enabled - 是否啟用
         */
        setDebugMode(enabled) {
            debugMode = !!enabled;
            console.log(`[EventBus] 除錯模式: ${debugMode ? '啟用' : '關閉'}`);
        },

        /**
         * 是否為除錯模式
         * @returns {boolean}
         */
        isDebugMode() {
            return debugMode;
        }
    };
})();

// ========================================
// 預定義事件名稱常數
// ========================================

const EventTypes = {
    // 學生相關
    STUDENT: {
        ADDED: 'student:added',
        UPDATED: 'student:updated',
        DELETED: 'student:deleted',
        SELECTED: 'student:selected',
        SCORE_CHANGED: 'student:score_changed'
    },

    // 作業相關
    HOMEWORK: {
        ADDED: 'homework:added',
        UPDATED: 'homework:updated',
        DELETED: 'homework:deleted',
        STATUS_CHANGED: 'homework:status_changed',
        CHECK_COMPLETED: 'homework:check_completed'
    },

    // 考試監考相關
    EXAM: {
        STARTED: 'exam:started',
        ENDED: 'exam:ended',
        SUBJECT_CHANGED: 'exam:subject_changed',
        BREAK_STARTED: 'exam:break_started',
        ATTENDANCE_UPDATED: 'exam:attendance_updated'
    },

    // 計時器相關
    TIMER: {
        STARTED: 'timer:started',
        PAUSED: 'timer:paused',
        RESUMED: 'timer:resumed',
        ENDED: 'timer:ended',
        WARNING: 'timer:warning'
    },

    // 抽籤相關
    LOTTERY: {
        STARTED: 'lottery:started',
        RESULT: 'lottery:result',
        COMPLETED: 'lottery:completed'
    },

    // UI 相關
    UI: {
        SECTION_CHANGED: 'ui:section_changed',
        MODAL_OPENED: 'ui:modal_opened',
        MODAL_CLOSED: 'ui:modal_closed',
        THEME_CHANGED: 'ui:theme_changed',
        FULLSCREEN_ENTER: 'ui:fullscreen_enter',
        FULLSCREEN_EXIT: 'ui:fullscreen_exit'
    },

    // 資料相關
    DATA: {
        LOADED: 'data:loaded',
        SAVED: 'data:saved',
        SYNC_START: 'data:sync_start',
        SYNC_COMPLETE: 'data:sync_complete',
        SYNC_ERROR: 'data:sync_error'
    },

    // 系統相關
    SYSTEM: {
        READY: 'system:ready',
        ERROR: 'error',
        ONLINE: 'system:online',
        OFFLINE: 'system:offline'
    }
};

// 掛載到全域
window.EventBus = EventBus;
window.EventTypes = EventTypes;

// 初始化訊息
console.log('✅ EventBus 事件總線已載入');
