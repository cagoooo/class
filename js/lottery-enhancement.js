/**
 * 抽籤系統增強模組
 * 提供不重複抽取功能的初始化和狀態同步
 */

(function () {
    'use strict';

    // 等待 DOM 載入完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLotteryEnhancement);
    } else {
        initLotteryEnhancement();
    }

    function initLotteryEnhancement() {
        // 同步 checkbox 狀態
        const noRepeatToggle = document.getElementById('noRepeatToggle');
        if (noRepeatToggle) {
            // 從 localStorage 讀取設定（預設為 true）
            const savedNoRepeat = JSON.parse(localStorage.getItem('noRepeatLottery'));
            noRepeatToggle.checked = savedNoRepeat !== false; // 如果沒有設定或為 true，則勾選
        }

        // 更新統計數據
        if (typeof updateLotteryStats === 'function') {
            updateLotteryStats();
        }

        // 監聽學生資料變化，自動清理無效的已抽取記錄
        cleanupDrawnStudents();

        console.log('🎲 抽籤增強模組已載入');
    }

    // 清理已刪除學生的抽取記錄
    function cleanupDrawnStudents() {
        try {
            const drawnIds = JSON.parse(localStorage.getItem('drawnStudentIds')) || [];
            const studentData = JSON.parse(localStorage.getItem('students')) || [];
            const validStudentIds = studentData.map(s => s.id);

            // 過濾掉已不存在的學生 ID
            const cleanedIds = drawnIds.filter(id => validStudentIds.includes(id));

            if (cleanedIds.length !== drawnIds.length) {
                localStorage.setItem('drawnStudentIds', JSON.stringify(cleanedIds));
                // 更新全域變數
                if (typeof drawnStudentIds !== 'undefined') {
                    window.drawnStudentIds = cleanedIds;
                }
            }
        } catch (e) {
            console.error('清理抽籤記錄時發生錯誤:', e);
        }
    }
})();
