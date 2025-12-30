/**
 * 班級小管家 - 模組索引
 * index.js - 程式碼載入順序說明
 * 
 * 載入順序很重要！請按以下順序引入：
 * 
 * CSS 檔案（放在 <head> 中）：
 * 1. css/main.css        - 基礎樣式
 * 2. css/animations.css  - 動畫效果
 * 3. css/notification.css - 通知系統
 * 4. css/clock.css       - 時鐘樣式
 * 
 * JavaScript 檔案（放在 </body> 前）：
 * 1. js/utils.js         - 工具函數（最先載入）
 * 2. js/notification.js  - 通知系統
 * 3. js/validator.js     - 驗證系統
 * 4. js/loading.js       - 載入指示器
 * 5. js/dialog.js        - 確認對話框
 * 6. js/backup.js        - 備份系統
 * 7. js/app.js           - 主程式（最後載入）
 */

// 模組清單
const MODULES = {
    css: [
        'css/main.css',
        'css/animations.css',
        'css/notification.css',
        'css/clock.css'
    ],
    js: [
        'js/utils.js',
        'js/notification.js',
        'js/validator.js',
        'js/loading.js',
        'js/dialog.js',
        'js/backup.js'
    ]
};

console.log('📚 班級小管家模組已載入');
console.log('模組清單:', MODULES);
