/**
 * 班級小管家 - 驗證系統模組
 * validator.js - 輸入驗證與資料清理
 */

class Validator {
    static sanitizeString(str, maxLength = 100) {
        if (typeof str !== 'string') return '';
        return str.trim().slice(0, maxLength);
    }

    static validateStudentName(name) {
        const sanitized = this.sanitizeString(name, 50);

        if (sanitized.length === 0) {
            return { valid: false, message: '姓名不能為空' };
        }

        if (sanitized.length < 2) {
            return { valid: false, message: '姓名至少需要 2 個字元' };
        }

        // 檢查是否包含特殊字符（允許中文、英文、數字和空格）
        if (!/^[\u4e00-\u9fa5a-zA-Z0-9\s]+$/.test(sanitized)) {
            return { valid: false, message: '姓名只能包含中文、英文、數字和空格' };
        }

        return { valid: true, value: sanitized };
    }

    static validateNumber(num, min = 1, max = 999) {
        const parsed = parseInt(num);

        if (isNaN(parsed)) {
            return { valid: false, message: '請輸入有效的數字' };
        }

        if (parsed < min || parsed > max) {
            return { valid: false, message: `數字必須介於 ${min} 到 ${max} 之間` };
        }

        return { valid: true, value: parsed };
    }

    static validatePoints(points, min = -100, max = 100) {
        return this.validateNumber(points, min, max);
    }

    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
