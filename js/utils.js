/**
 * 班級小管家 - 工具函數模組
 * utils.js - 共用工具函數（防抖、節流等）
 */

// 防抖函數 - 停止輸入後才執行
function debounce(func, delay = 300) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

// 節流函數 - 限制執行頻率
function throttle(func, limit = 100) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// 格式化日期
function formatDate(date, format = 'YYYY-MM-DD') {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day);
}

// 深拷貝物件
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// 產生唯一ID
function generateId() {
    return Date.now() + Math.random().toString(36).substr(2, 9);
}
