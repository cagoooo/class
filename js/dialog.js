/**
 * 班級小管家 - 確認對話框模組
 * dialog.js - 確認對話框系統
 */

class ConfirmDialog {
    static async show(options) {
        return new Promise((resolve) => {
            const dialog = this.create(options);
            document.body.appendChild(dialog);

            const confirmBtn = dialog.querySelector('[data-action="confirm"]');
            const cancelBtn = dialog.querySelector('[data-action="cancel"]');

            confirmBtn.onclick = () => {
                dialog.remove();
                resolve(true);
            };

            cancelBtn.onclick = () => {
                dialog.remove();
                resolve(false);
            };

            // 點擊背景關閉
            dialog.onclick = (e) => {
                if (e.target === dialog) {
                    dialog.remove();
                    resolve(false);
                }
            };

            // ESC 鍵關閉
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    dialog.remove();
                    resolve(false);
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);

            // 聚焦到確定按鈕
            setTimeout(() => confirmBtn.focus(), 100);
        });
    }

    static create({ title, message, confirmText = '確定', cancelText = '取消', type = 'warning' }) {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-dialog-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';

        const colors = {
            warning: { title: 'text-yellow-600 dark:text-yellow-400', btn: 'bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-500' },
            danger: { title: 'text-red-600 dark:text-red-400', btn: 'bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-500' },
            info: { title: 'text-blue-600 dark:text-blue-400', btn: 'bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500' }
        };

        const color = colors[type] || colors.warning;

        overlay.innerHTML = `
            <div class="confirm-dialog bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
                <div class="p-6">
                    <h3 class="text-xl font-bold ${color.title} mb-4">${Validator.escapeHtml(title)}</h3>
                    <p class="text-gray-700 mb-6">${Validator.escapeHtml(message)}</p>
                    <div class="flex gap-3 justify-end">
                        <button 
                            type="button"
                            data-action="cancel" 
                            class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition active:scale-95">
                            ${Validator.escapeHtml(cancelText)}
                        </button>
                        <button 
                            type="button"
                            data-action="confirm" 
                            class="px-4 py-2 ${color.btn} text-white rounded-lg transition active:scale-95">
                            ${Validator.escapeHtml(confirmText)}
                        </button>
                    </div>
                </div>
            </div>
        `;

        return overlay;
    }
}
