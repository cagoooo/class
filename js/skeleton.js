/**
 * 班級小管家 - 骨架屏管理器
 * skeleton.js - 統一骨架屏顯示 / 隱藏工具
 *
 * 用法：
 *   SkeletonManager.show('studentsList', 'student', 6);
 *   // ... 渲染真實資料 ...
 *   SkeletonManager.hide('studentsList');  // 通常不需要手動呼叫，渲染會覆蓋
 *
 * 支援類型（type 參數）：
 *   'student'     - 學生卡片（頭像 + 兩行文字）
 *   'leaderboard' - 排行榜項目（圓形獎牌 + 姓名 + 分數條）
 *   'homework'    - 作業管理卡片（標題 + 進度條 + 標籤）
 */

const SkeletonManager = (() => {
    'use strict';

    // ==================== 模板 ====================

    const templates = {

        /**
         * 學生卡片骨架
         */
        student: () => `
            <div class="skeleton-student-card">
                <div class="skeleton-row">
                    <div class="skeleton skeleton-avatar"></div>
                    <div style="flex:1; display:flex; flex-direction:column; gap:6px;">
                        <div class="skeleton skeleton-text" style="width:60%;"></div>
                        <div class="skeleton skeleton-text" style="width:40%;"></div>
                    </div>
                </div>
                <div class="skeleton skeleton-text" style="width:55%;"></div>
            </div>
        `,

        /**
         * 排行榜項目骨架
         */
        leaderboard: () => `
            <div class="skeleton-leaderboard-item">
                <div class="skeleton skeleton-medal"></div>
                <div class="skeleton-info">
                    <div class="skeleton skeleton-text" style="width:55%;"></div>
                    <div class="skeleton skeleton-bar" style="width:80%;"></div>
                </div>
                <div class="skeleton skeleton-text" style="width:3rem; height:1.125rem;"></div>
            </div>
        `,

        /**
         * 作業卡片骨架
         */
        homework: () => `
            <div class="skeleton-homework-card">
                <div class="skeleton skeleton-title" style="width:70%;"></div>
                <div class="skeleton skeleton-text" style="width:45%;"></div>
                <div class="skeleton-tag-row">
                    <div class="skeleton skeleton-badge" style="width:5rem;"></div>
                    <div class="skeleton skeleton-badge" style="width:4rem;"></div>
                </div>
                <div class="skeleton skeleton-bar"></div>
            </div>
        `,
    };

    // ==================== 公開 API ====================

    /**
     * 在指定容器中顯示骨架屏
     * @param {string} containerId  - 容器元素的 id
     * @param {string} type         - 骨架類型：'student' | 'leaderboard' | 'homework'
     * @param {number} [count=4]    - 要顯示幾個骨架卡片
     */
    function show(containerId, type, count = 4) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // 避免在已有真實內容時疊加骨架（僅在容器空白時插入）
        if (container.children.length > 0 &&
            !container.querySelector('.skeleton-student-card, .skeleton-leaderboard-item, .skeleton-homework-card')) {
            return;
        }

        const templateFn = templates[type];
        if (!templateFn) {
            console.warn(`[SkeletonManager] 未知的骨架類型：${type}`);
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'skeleton-container';
        wrapper.setAttribute('data-skeleton-type', type);

        // 選擇正確的網格樣式
        if (type === 'student') {
            wrapper.classList.add('skeleton-student-grid');
        } else if (type === 'homework') {
            wrapper.classList.add('skeleton-homework-grid');
        }

        wrapper.innerHTML = Array.from({ length: count }, templateFn).join('');
        container.innerHTML = '';
        container.appendChild(wrapper);
    }

    /**
     * 移除指定容器中的骨架屏（通常不需要手動呼叫，因為渲染會用 innerHTML = '' 蓋掉）
     * @param {string} containerId
     */
    function hide(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const skeleton = container.querySelector('.skeleton-container');
        if (skeleton) skeleton.remove();
    }

    /**
     * 包裝一個非同步渲染操作，自動在執行前顯示骨架、完成後隱藏
     * @param {string}   containerId - 容器 id
     * @param {string}   type        - 骨架類型
     * @param {number}   count       - 骨架數量
     * @param {Function} renderFn    - 實際的渲染函式（可為 async）
     */
    async function wrap(containerId, type, count, renderFn) {
        show(containerId, type, count);
        try {
            await renderFn();
        } finally {
            // renderFn 通常會用 innerHTML="" 覆蓋，此處作為保險
            hide(containerId);
        }
    }

    // ==================== 初始化 ====================

    function init() {
        // 初次進入頁面時，對主要容器預先插入骨架屏，
        // 等待對應的增強模組完成初始化後自然被覆蓋。
        const initialTargets = [
            { id: 'studentsList', type: 'student', count: 6 }
        ];

        initialTargets.forEach(({ id, type, count }) => {
            show(id, type, count);
        });

        console.log('✅ 骨架屏管理器已載入');
    }

    // DOM 就緒後執行初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { show, hide, wrap, templates };
})();
