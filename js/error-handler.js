/**
 * 錯誤處理模組 (Error Handler)
 * 統一處理應用程式中的各種錯誤
 * 
 * @version 1.0.0
 * @since 2026-01-13
 */

const ErrorHandler = (function () {
    'use strict';

    // 錯誤類型定義
    const ErrorTypes = {
        STORAGE: 'storage',
        NETWORK: 'network',
        VALIDATION: 'validation',
        RENDER: 'render',
        PERMISSION: 'permission',
        TIMEOUT: 'timeout',
        UNKNOWN: 'unknown'
    };

    // 錯誤訊息對照表
    const ErrorMessages = {
        [ErrorTypes.STORAGE]: {
            title: '儲存失敗',
            message: '資料儲存失敗，請重試',
            icon: '💾'
        },
        [ErrorTypes.NETWORK]: {
            title: '網路異常',
            message: '網路連線異常，請檢查連線',
            icon: '🌐'
        },
        [ErrorTypes.VALIDATION]: {
            title: '驗證失敗',
            message: '輸入資料有誤，請檢查',
            icon: '⚠️'
        },
        [ErrorTypes.RENDER]: {
            title: '顯示異常',
            message: '畫面載入異常，請重新整理',
            icon: '🖥️'
        },
        [ErrorTypes.PERMISSION]: {
            title: '權限不足',
            message: '您沒有執行此操作的權限',
            icon: '🔒'
        },
        [ErrorTypes.TIMEOUT]: {
            title: '操作逾時',
            message: '操作時間過長，請稍後再試',
            icon: '⏱️'
        },
        [ErrorTypes.UNKNOWN]: {
            title: '未知錯誤',
            message: '發生未知錯誤，請重新整理頁面',
            icon: '❓'
        }
    };

    // 錯誤歷史記錄
    const errorHistory = [];
    const MAX_HISTORY = 50;

    // 設定
    let config = {
        showNotification: true,
        logToConsole: true,
        reportEnabled: false,
        reportEndpoint: '/api/errors'
    };

    /**
     * 記錄錯誤到歷史
     */
    function logToHistory(errorInfo) {
        if (errorHistory.length >= MAX_HISTORY) {
            errorHistory.shift();
        }
        errorHistory.push({
            ...errorInfo,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href
        });
    }

    /**
     * 顯示錯誤通知
     */
    function showErrorNotification(type, customMessage) {
        const errorInfo = ErrorMessages[type] || ErrorMessages[ErrorTypes.UNKNOWN];
        const message = customMessage || errorInfo.message;

        // 使用全域通知系統（如果存在）
        if (typeof NotificationSystem !== 'undefined' && NotificationSystem.error) {
            NotificationSystem.error(`${errorInfo.icon} ${message}`);
        } else if (typeof showNotification === 'function') {
            showNotification(message, 'error');
        } else {
            // 簡易 fallback
            console.warn(`[錯誤通知] ${message}`);

            // 建立簡易通知
            const notification = document.createElement('div');
            notification.className = 'error-handler-notification';
            notification.innerHTML = `
                <span class="error-icon">${errorInfo.icon}</span>
                <span class="error-message">${message}</span>
                <button class="error-close" onclick="this.parentElement.remove()">✕</button>
            `;
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #fee2e2, #fecaca);
                color: #991b1b;
                padding: 12px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3);
                display: flex;
                align-items: center;
                gap: 10px;
                z-index: 10000;
                animation: slideIn 0.3s ease;
                font-family: 'Noto Sans TC', sans-serif;
            `;
            document.body.appendChild(notification);

            // 自動移除
            setTimeout(() => notification.remove(), 5000);
        }
    }

    /**
     * 發送錯誤報告
     */
    async function reportError(errorInfo) {
        if (!config.reportEnabled) return;

        try {
            await fetch(config.reportEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...errorInfo,
                    appVersion: window.APP_VERSION || 'unknown',
                    timestamp: new Date().toISOString()
                })
            });
        } catch (e) {
            // 靜默失敗，避免無限錯誤循環
            console.warn('[ErrorHandler] 無法發送錯誤報告:', e.message);
        }
    }

    /**
     * 格式化錯誤堆疊
     */
    function formatStack(error) {
        if (!error || !error.stack) return '';

        return error.stack
            .split('\n')
            .slice(0, 5)
            .join('\n');
    }

    // 注入 CSS 樣式
    function injectStyles() {
        if (document.getElementById('error-handler-styles')) return;

        const style = document.createElement('style');
        style.id = 'error-handler-styles';
        style.textContent = `
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateX(100px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }
            
            .error-handler-notification .error-close {
                background: none;
                border: none;
                color: #991b1b;
                cursor: pointer;
                padding: 4px;
                font-size: 14px;
                opacity: 0.7;
                transition: opacity 0.2s;
            }
            
            .error-handler-notification .error-close:hover {
                opacity: 1;
            }
        `;
        document.head.appendChild(style);
    }

    // 全域錯誤捕獲
    function setupGlobalErrorHandlers() {
        // 捕獲未處理的 Promise 錯誤
        window.addEventListener('unhandledrejection', (event) => {
            ErrorHandler.handle(
                event.reason,
                ErrorTypes.UNKNOWN,
                'Unhandled Promise Rejection'
            );
        });

        // 捕獲全域腳本錯誤
        window.addEventListener('error', (event) => {
            // 忽略資源載入錯誤
            if (event.target && (event.target.tagName === 'IMG' || event.target.tagName === 'SCRIPT')) {
                return;
            }

            ErrorHandler.handle(
                event.error || new Error(event.message),
                ErrorTypes.UNKNOWN,
                `Global Error at ${event.filename}:${event.lineno}`
            );
        });
    }

    // 初始化
    injectStyles();
    setupGlobalErrorHandlers();

    return {
        // 暴露錯誤類型常數
        ErrorTypes,

        /**
         * 設定配置
         * @param {Object} newConfig - 新配置
         */
        configure(newConfig) {
            config = { ...config, ...newConfig };
        },

        /**
         * 統一錯誤處理
         * @param {Error|string} error - 錯誤物件或訊息
         * @param {string} type - 錯誤類型
         * @param {string} context - 錯誤發生的上下文
         * @param {Object} options - 額外選項
         */
        handle(error, type = ErrorTypes.UNKNOWN, context = '', options = {}) {
            const errorObj = error instanceof Error ? error : new Error(String(error));
            const errorType = ErrorTypes[type.toUpperCase()] || type || ErrorTypes.UNKNOWN;

            const errorInfo = {
                type: errorType,
                message: errorObj.message,
                stack: formatStack(errorObj),
                context,
                ...options
            };

            // 記錄到歷史
            logToHistory(errorInfo);

            // 控制台輸出
            if (config.logToConsole) {
                console.error(`[${errorType.toUpperCase()}] ${context}:`, errorObj);
            }

            // 顯示通知
            if (config.showNotification && options.silent !== true) {
                const customMessage = options.customMessage ||
                    (errorType === ErrorTypes.VALIDATION || errorType === ErrorTypes.UNKNOWN ? errorObj.message : null);
                showErrorNotification(errorType, customMessage);
            }

            // 發送錯誤報告
            reportError(errorInfo);

            // 發送事件（如果 EventBus 存在）
            if (typeof EventBus !== 'undefined') {
                EventBus.emit('error', errorInfo);
            }
        },

        /**
         * 創建包裝的安全執行函數
         * @param {Function} fn - 要包裝的函數
         * @param {string} context - 上下文描述
         * @returns {Function} - 包裝後的函數
         */
        wrap(fn, context = '') {
            return (...args) => {
                try {
                    const result = fn(...args);

                    // 處理 Promise
                    if (result && typeof result.catch === 'function') {
                        return result.catch(error => {
                            this.handle(error, ErrorTypes.UNKNOWN, context);
                            throw error;
                        });
                    }

                    return result;
                } catch (error) {
                    this.handle(error, ErrorTypes.UNKNOWN, context);
                    throw error;
                }
            };
        },

        /**
         * 創建帶錯誤處理的 async 函數包裝
         * @param {Function} asyncFn - async 函數
         * @param {string} type - 錯誤類型
         * @param {string} context - 上下文描述
         * @returns {Function} - 包裝後的函數
         */
        wrapAsync(asyncFn, type = ErrorTypes.UNKNOWN, context = '') {
            return async (...args) => {
                try {
                    return await asyncFn(...args);
                } catch (error) {
                    this.handle(error, type, context);
                    return null;
                }
            };
        },

        /**
         * 安全執行函數（不拋出錯誤）
         * @param {Function} fn - 要執行的函數
         * @param {*} defaultValue - 錯誤時的預設返回值
         * @param {string} context - 上下文描述
         * @returns {*} - 函數結果或預設值
         */
        safeExecute(fn, defaultValue = null, context = '') {
            try {
                return fn();
            } catch (error) {
                this.handle(error, ErrorTypes.UNKNOWN, context, { silent: true });
                return defaultValue;
            }
        },

        /**
         * 驗證資料並在失敗時拋出錯誤
         * @param {*} value - 要驗證的值
         * @param {Function} validator - 驗證函數
         * @param {string} message - 錯誤訊息
         * @throws {Error}
         */
        validate(value, validator, message = '驗證失敗') {
            if (!validator(value)) {
                const error = new Error(message);
                this.handle(error, ErrorTypes.VALIDATION, 'Validation');
                throw error;
            }
            return value;
        },

        /**
         * 斷言條件為真
         * @param {boolean} condition - 條件
         * @param {string} message - 錯誤訊息
         * @throws {Error}
         */
        assert(condition, message = '斷言失敗') {
            if (!condition) {
                const error = new Error(message);
                this.handle(error, ErrorTypes.VALIDATION, 'Assertion');
                throw error;
            }
        },

        /**
         * 取得錯誤歷史記錄
         * @returns {Array} - 錯誤歷史
         */
        getHistory() {
            return [...errorHistory];
        },

        /**
         * 清除錯誤歷史
         */
        clearHistory() {
            errorHistory.length = 0;
        },

        /**
         * 匯出錯誤報告
         * @returns {string} - JSON 格式的錯誤報告
         */
        exportReport() {
            return JSON.stringify({
                appVersion: window.APP_VERSION || 'unknown',
                exportTime: new Date().toISOString(),
                errors: errorHistory
            }, null, 2);
        }
    };
})();

// 掛載到全域
window.ErrorHandler = ErrorHandler;

// 快捷方法
window.handleError = (error, type, context) => ErrorHandler.handle(error, type, context);

// 初始化訊息
console.log('✅ ErrorHandler 錯誤處理模組已載入');
