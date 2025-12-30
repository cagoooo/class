/**
 * 班級小管家 - 載入指示器模組
 * loading.js - 載入動畫控制
 */

class LoadingIndicator {
    static show(message = '載入中...') {
        if (document.getElementById('loading-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        overlay.innerHTML = `
            <div class="bg-white rounded-lg p-6 flex flex-col items-center">
                <div class="loader mb-4"></div>
                <p class="text-gray-700">${Validator.escapeHtml(message)}</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    static hide() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.remove();
    }

    static async wrap(promise, message) {
        this.show(message);
        try {
            const result = await promise;
            return result;
        } finally {
            this.hide();
        }
    }
}
