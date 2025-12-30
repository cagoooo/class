/**
 * Firebase UI 模組
 * 添加雲端同步相關的 UI 元素
 */

/**
 * 注入雲端同步 UI
 */
function injectCloudSyncUI() {
    // 找到資料備份區域並添加雲端同步按鈕
    const backupSection = document.querySelector('#students-section .grid.grid-cols-2.sm\\:grid-cols-4');

    if (backupSection && !document.getElementById('cloud-sync-btn')) {
        // 創建雲端同步按鈕區域
        const cloudButtonsHTML = `
            <div class="col-span-2 sm:col-span-4 mt-3 pt-3 border-t border-gray-200">
                <div class="flex items-center justify-between mb-2">
                    <h4 class="text-sm font-semibold text-gray-700">☁️ 雲端同步</h4>
                    <span id="cloud-status" class="text-xs text-gray-400">連線中...</span>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button id="cloud-sync-btn" onclick="window.FirebaseSync.syncToCloud()" 
                        class="bg-blue-500 text-white py-2 px-3 rounded-lg hover:bg-blue-600 transition-colors text-xs active:scale-95 flex items-center justify-center gap-1">
                        <span>⬆️</span> 上傳雲端
                    </button>
                    <button onclick="window.FirebaseSync.loadFromCloud()" 
                        class="bg-green-500 text-white py-2 px-3 rounded-lg hover:bg-green-600 transition-colors text-xs active:scale-95 flex items-center justify-center gap-1">
                        <span>⬇️</span> 下載雲端
                    </button>
                    <button onclick="window.FirebaseSync.exportAllData()" 
                        class="bg-purple-500 text-white py-2 px-3 rounded-lg hover:bg-purple-600 transition-colors text-xs active:scale-95 flex items-center justify-center gap-1">
                        <span>📦</span> 匯出 JSON
                    </button>
                    <button onclick="showCloudInfo()" 
                        class="bg-gray-400 text-white py-2 px-3 rounded-lg hover:bg-gray-500 transition-colors text-xs active:scale-95 flex items-center justify-center gap-1">
                        <span>ℹ️</span> 說明
                    </button>
                </div>
            </div>
        `;

        backupSection.insertAdjacentHTML('beforeend', cloudButtonsHTML);
        console.log('✅ 雲端同步 UI 已注入');
    }

    // 添加到頁首的狀態指示器
    const header = document.querySelector('header .flex.items-center');
    if (header && !document.getElementById('header-cloud-status')) {
        const statusHTML = `
            <div id="header-cloud-status" class="hidden sm:flex items-center gap-1 text-xs bg-white/20 px-2 py-1 rounded-full ml-2">
                <span id="header-cloud-icon">☁️</span>
                <span id="header-cloud-text">離線</span>
            </div>
        `;
        header.insertAdjacentHTML('beforeend', statusHTML);
    }
}

/**
 * 顯示雲端功能說明
 */
function showCloudInfo() {
    const userId = window.FirebaseConfig?.getCurrentUserId() || '未登入';

    alert(
        '☁️ 雲端同步說明\n\n' +
        '• 上傳雲端：將本地資料同步至 Firebase\n' +
        '• 下載雲端：從 Firebase 載入資料（會覆蓋本地）\n' +
        '• 匯出 JSON：下載所有資料的 JSON 備份檔\n\n' +
        '📌 您的用戶 ID：\n' + userId + '\n\n' +
        '💡 提示：請定期上傳雲端，以免資料遺失。'
    );
}

/**
 * 更新雲端連線狀態 UI
 */
function updateCloudStatusUI(connected) {
    // 學生管理區的狀態
    const statusEl = document.getElementById('cloud-status');
    if (statusEl) {
        statusEl.innerHTML = connected
            ? '<span class="text-green-600 font-medium">✅ 已連線</span>'
            : '<span class="text-gray-400">⚪ 離線</span>';
    }

    // 頁首的狀態
    const headerIcon = document.getElementById('header-cloud-icon');
    const headerText = document.getElementById('header-cloud-text');
    if (headerIcon && headerText) {
        if (connected) {
            headerIcon.textContent = '☁️';
            headerText.textContent = '已連線';
            headerText.className = 'text-green-200';
        } else {
            headerIcon.textContent = '☁️';
            headerText.textContent = '離線';
            headerText.className = 'text-gray-300';
        }
    }
}

// 覆蓋 FirebaseSync 的 UI 更新函數
const originalInit = window.FirebaseSync?.init;
if (originalInit) {
    window.FirebaseSync.init = async function () {
        const result = await originalInit();
        updateCloudStatusUI(result);
        return result;
    };
}

// 監聽 Firebase 連線狀態
if (window.FirebaseConfig?.onAuthStateChanged) {
    window.FirebaseConfig.onAuthStateChanged((user) => {
        updateCloudStatusUI(!!user);
    });
}

// 注入 UI
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(injectCloudSyncUI, 300);
    });
} else {
    setTimeout(injectCloudSyncUI, 300);
}

// 導出函數
window.showCloudInfo = showCloudInfo;
window.updateCloudStatusUI = updateCloudStatusUI;
