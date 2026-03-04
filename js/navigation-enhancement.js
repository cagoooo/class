/**
 * 導航增強模組
 * Navigation Enhancement Module
 * 
 * 功能：點擊功能選單時自動平滑滾動到對應區塊
 */

(function () {
    'use strict';

    /**
     * 增強版 showSection 函數
     * 添加平滑滾動效果，提升 UX 體驗
     */
    function enhanceShowSection(retryCount) {
        retryCount = retryCount || 0;

        // 保存原始函數
        const originalShowSection = window.showSection;

        if (typeof originalShowSection !== 'function') {
            if (retryCount >= 30) {
                // 超過 30 次（約 6 秒）就放棄，避免無窮迴圈
                console.warn('⚠️ [navigation-enhancement] showSection 函數始終不存在，已停止重試');
                return;
            }
            setTimeout(() => enhanceShowSection(retryCount + 1), 200);
            return;
        }

        // 覆蓋 showSection 函數
        window.showSection = function (sectionName) {
            // 先調用原始函數
            originalShowSection(sectionName);

            // 獲取目標區塊
            const targetSection = document.getElementById(sectionName + '-section');
            if (!targetSection) return;

            // 平滑滾動到目標區塊
            setTimeout(() => {
                const navHeight = document.querySelector('nav')?.offsetHeight || 80;
                const targetPosition = targetSection.getBoundingClientRect().top + window.pageYOffset - navHeight - 20;

                window.scrollTo({
                    top: Math.max(0, targetPosition),
                    behavior: 'smooth'
                });
            }, 50);
        };

        console.log('✅ 導航增強模組已載入（點擊功能選單自動滾動）');
    }

    // 在 DOM 載入完成後初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(enhanceShowSection, 300);
        });
    } else {
        setTimeout(enhanceShowSection, 300);
    }
})();
