/**
 * 班級小管家 - 通知系統模組
 * notification.js - 統一通知系統
 */

class NotificationSystem {
    static show(message, type = 'info', duration = 3000) {
        const notification = this.createNotification(message, type);
        document.body.appendChild(notification);

        // 動畫進入
        setTimeout(() => notification.classList.add('show'), 10);

        // 自動移除
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }

    static createNotification(message, type) {
        const div = document.createElement('div');
        div.className = `notification ${type}`;
        div.innerHTML = `
            <span class="notification-icon" aria-hidden="true">${this.getIcon(type)}</span>
            <span class="notification-message">${this.escapeHtml(message)}</span>
        `;
        return div;
    }

    static getIcon(type) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icons[type] || '📢';
    }

    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    static success(message) { this.show(message, 'success'); }
    static error(message) { this.show(message, 'error'); }
    static warning(message) { this.show(message, 'warning'); }
    static info(message) { this.show(message, 'info'); }
}
