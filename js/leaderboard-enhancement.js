/**
 * 排行榜增強模組
 * 提供動畫效果、視覺增強和 RWD 支援
 */

(function () {
    'use strict';

    // === 注入 CSS 樣式 ===
    const leaderboardStyles = `
        /* 排行榜動畫樣式 */
        @keyframes leaderboard-slide-in {
            from {
                opacity: 0;
                transform: translateX(-30px);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }

        @keyframes medal-shine {
            0%, 100% {
                filter: brightness(1);
            }
            50% {
                filter: brightness(1.3) drop-shadow(0 0 8px gold);
            }
        }

        @keyframes score-bar-fill {
            from {
                width: 0%;
            }
        }

        @keyframes rank-bounce {
            0%, 100% {
                transform: scale(1);
            }
            50% {
                transform: scale(1.1);
            }
        }

        @keyframes confetti-fall {
            0% {
                transform: translateY(-10px) rotate(0deg);
                opacity: 1;
            }
            100% {
                transform: translateY(100vh) rotate(720deg);
                opacity: 0;
            }
        }

        /* 進階彩花特效 */
        @keyframes confetti-burst {
            0% {
                transform: translate(0, 0) rotate(0deg) scale(0);
                opacity: 0;
            }
            10% {
                opacity: 1;
                transform: translate(var(--x), var(--y)) rotate(180deg) scale(1);
            }
            100% {
                transform: translate(calc(var(--x) * 3), calc(var(--y) * 3 + 100vh)) rotate(720deg) scale(0.5);
                opacity: 0;
            }
        }

        @keyframes confetti-spiral {
            0% {
                transform: translateY(-20px) rotate(0deg) scale(0);
                opacity: 0;
            }
            20% {
                opacity: 1;
                transform: translateY(0) rotate(360deg) scale(1);
            }
            100% {
                transform: translateY(100vh) rotate(1440deg) scale(0.3);
                opacity: 0;
            }
        }

        @keyframes confetti-float {
            0%, 100% {
                transform: translateX(0);
            }
            25% {
                transform: translateX(30px);
            }
            75% {
                transform: translateX(-30px);
            }
        }

        .confetti-enhanced {
            position: fixed;
            pointer-events: none;
            z-index: 9999;
        }

        .confetti-star {
            width: 0;
            height: 0;
            border-left: 8px solid transparent;
            border-right: 8px solid transparent;
            border-bottom: 16px solid currentColor;
            position: relative;
        }

        .confetti-star::after {
            content: '';
            width: 0;
            height: 0;
            border-left: 8px solid transparent;
            border-right: 8px solid transparent;
            border-top: 16px solid currentColor;
            position: absolute;
            top: 6px;
            left: -8px;
        }

        .confetti-circle {
            width: 12px;
            height: 12px;
            border-radius: 50%;
        }

        .confetti-square {
            width: 10px;
            height: 10px;
            border-radius: 2px;
        }

        .confetti-ribbon {
            width: 4px;
            height: 20px;
            border-radius: 2px;
        }

        .confetti-heart {
            width: 12px;
            height: 12px;
            background: currentColor;
            transform: rotate(-45deg);
            position: relative;
        }

        .confetti-heart::before,
        .confetti-heart::after {
            content: '';
            width: 12px;
            height: 12px;
            background: currentColor;
            border-radius: 50%;
            position: absolute;
        }

        .confetti-heart::before {
            top: -6px;
            left: 0;
        }

        .confetti-heart::after {
            top: 0;
            left: 6px;
        }

        /* 排行榜容器 */
        .leaderboard-modal-enhanced {
            backdrop-filter: blur(8px);
        }

        .leaderboard-container {
            background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
            border-radius: 1.5rem;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            overflow: hidden;
        }

        /* 標題區域 */
        .leaderboard-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 1rem 1.5rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .leaderboard-header h3 {
            font-size: 1.25rem;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .leaderboard-header .trophy-icon {
            font-size: 1.5rem;
            animation: rank-bounce 2s infinite;
        }

        .leaderboard-close-btn {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 1.25rem;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .leaderboard-close-btn:hover {
            background: rgba(255, 255, 255, 0.4);
            transform: scale(1.1);
        }

        /* 排名項目 */
        .leaderboard-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.75rem 1rem;
            margin: 0.5rem;
            border-radius: 1rem;
            transition: all 0.3s ease;
            animation: leaderboard-slide-in 0.5s ease forwards;
            opacity: 0;
        }

        .leaderboard-item:hover {
            transform: translateX(8px) scale(1.02);
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        }

        /* 前三名特殊樣式 */
        .leaderboard-item.rank-1 {
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            border: 2px solid #f59e0b;
        }

        .leaderboard-item.rank-2 {
            background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
            border: 2px solid #94a3b8;
        }

        .leaderboard-item.rank-3 {
            background: linear-gradient(135deg, #fed7aa 0%, #fdba74 100%);
            border: 2px solid #ea580c;
        }

        .leaderboard-item.rank-other {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
        }

        /* 獎牌圖標 */
        .leaderboard-medal {
            font-size: 1.75rem;
            min-width: 50px;
            text-align: center;
        }

        .leaderboard-medal.gold {
            animation: medal-shine 2s infinite;
        }

        .leaderboard-rank-number {
            font-size: 1rem;
            font-weight: 700;
            color: #64748b;
            min-width: 50px;
            text-align: center;
        }

        /* 學生資訊 */
        .leaderboard-student-info {
            flex: 1;
            margin-left: 0.5rem;
        }

        .leaderboard-student-name {
            font-weight: 600;
            color: #1e293b;
            font-size: 1rem;
        }

        .leaderboard-score-bar-container {
            height: 6px;
            background: #e2e8f0;
            border-radius: 3px;
            margin-top: 0.375rem;
            overflow: hidden;
        }

        .leaderboard-score-bar {
            height: 100%;
            border-radius: 3px;
            animation: score-bar-fill 1s ease forwards;
        }

        .leaderboard-score-bar.positive {
            background: linear-gradient(90deg, #10b981 0%, #34d399 100%);
        }

        .leaderboard-score-bar.negative {
            background: linear-gradient(90deg, #ef4444 0%, #f87171 100%);
        }

        /* 分數顯示 */
        .leaderboard-score {
            font-weight: 700;
            font-size: 1.125rem;
            min-width: 70px;
            text-align: right;
        }

        .leaderboard-score.positive {
            color: #059669;
        }

        .leaderboard-score.negative {
            color: #dc2626;
        }

        /* 關閉按鈕區域 */
        .leaderboard-footer {
            padding: 1rem;
            background: #f8fafc;
            text-align: center;
        }

        .leaderboard-close-btn-footer {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 0.75rem 2rem;
            border-radius: 0.75rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .leaderboard-close-btn-footer:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }

        .leaderboard-close-btn-footer:active {
            transform: scale(0.95);
        }

        /* 空狀態 */
        .leaderboard-empty {
            text-align: center;
            padding: 3rem 1rem;
            color: #64748b;
        }

        .leaderboard-empty-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
        }

        /* RWD 支援 */
        @media (max-width: 640px) {
            .leaderboard-container {
                margin: 0.5rem;
                max-height: 90vh;
            }

            .leaderboard-header {
                padding: 0.875rem 1rem;
            }

            .leaderboard-header h3 {
                font-size: 1.1rem;
            }

            .leaderboard-item {
                padding: 0.625rem 0.75rem;
                margin: 0.375rem 0.5rem;
            }

            .leaderboard-medal {
                font-size: 1.5rem;
                min-width: 40px;
            }

            .leaderboard-rank-number {
                font-size: 0.875rem;
                min-width: 40px;
            }

            .leaderboard-student-name {
                font-size: 0.9rem;
            }

            .leaderboard-score {
                font-size: 1rem;
                min-width: 60px;
            }

            .leaderboard-score-bar-container {
                height: 5px;
            }
        }

        /* 平板適配 */
        @media (min-width: 641px) and (max-width: 1024px) {
            .leaderboard-container {
                max-width: 500px;
            }
        }
    `;

    // 注入樣式
    function injectStyles() {
        if (document.getElementById('leaderboard-enhancement-styles')) return;

        const styleEl = document.createElement('style');
        styleEl.id = 'leaderboard-enhancement-styles';
        styleEl.textContent = leaderboardStyles;
        document.head.appendChild(styleEl);
    }

    function ensureLeaderboardModal() {
        let modal = document.getElementById('leaderboardModal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'leaderboardModal';
        modal.setAttribute('onclick', 'hideLeaderboard()');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 hidden';
        document.body.appendChild(modal);
        return modal;
    }

    // === 增強版 showLeaderboard 函數 ===
    function showLeaderboardEnhanced() {
        const modal = ensureLeaderboardModal();

        // === 骨架屏：立刻顯示 Modal 並插入骨架 ===
        modal.className = 'fixed inset-0 bg-black bg-opacity-60 leaderboard-modal-enhanced flex items-center justify-center p-2 sm:p-4 z-50';
        modal.classList.remove('hidden');

        // 建立暫時的容器放骨架屏
        modal.innerHTML = `
            <div onclick="event.stopPropagation()" class="leaderboard-container w-full max-w-md sm:max-w-lg">
                <div class="leaderboard-header">
                    <h3><span class="trophy-icon">🏆</span> 即時排行榜</h3>
                    <button onclick="hideLeaderboard()" class="leaderboard-close-btn">&times;</button>
                </div>
                <div id="leaderboardSkeletonArea" class="p-2 sm:p-4 max-h-[60vh] overflow-y-auto"></div>
                <div class="leaderboard-footer">
                    <button onclick="hideLeaderboard()" class="leaderboard-close-btn-footer">
                        ✨ 關閉排行榜
                    </button>
                </div>
            </div>
        `;

        // 在骨架區插入骨架屏動畫
        if (typeof SkeletonManager !== 'undefined') {
            SkeletonManager.show('leaderboardSkeletonArea', 'leaderboard', 5);
        }

        // 延遲 200ms 後渲染真實資料（讓骨架屏有時間展現）
        setTimeout(() => _renderLeaderboardContent(modal), 200);
    }

    /**
     * 排行榜真實內容渲染（內部函式）
     */
    function _renderLeaderboardContent(modal) {
        if (!modal || !document.body.contains(modal)) {
            return;
        }

        // 直接從 localStorage 讀取學生資料
        let students = [];
        try {
            const storedStudents = JSON.parse(localStorage.getItem(window.STUDENTS_KEY || 'students')) || [];
            students = Array.isArray(storedStudents) ? storedStudents : [];
        } catch (error) {
            console.warn('[Leaderboard] Failed to read students from localStorage', error);
        }

        const sortedStudents = [...students].sort((a, b) => b.points - a.points);
        const maxPoints = Math.max(...sortedStudents.map(s => Math.abs(s.points)), 1);

        // 構建增強版 HTML
        let contentHTML = '';

        if (sortedStudents.length === 0) {
            contentHTML = `
                <div class="leaderboard-empty">
                    <div class="leaderboard-empty-icon">🏆</div>
                    <p>目前沒有學生可以排名</p>
                    <p class="text-sm mt-2">請先新增學生！</p>
                </div>
            `;
        } else {
            contentHTML = sortedStudents.map((student, index) => {
                const rank = index + 1;
                let medalHTML = '';
                let rankClass = 'rank-other';

                if (rank === 1) {
                    medalHTML = '<span class="leaderboard-medal gold">🥇</span>';
                    rankClass = 'rank-1';
                } else if (rank === 2) {
                    medalHTML = '<span class="leaderboard-medal">🥈</span>';
                    rankClass = 'rank-2';
                } else if (rank === 3) {
                    medalHTML = '<span class="leaderboard-medal">🥉</span>';
                    rankClass = 'rank-3';
                } else {
                    medalHTML = `<span class="leaderboard-rank-number">#${rank}</span>`;
                }

                const scorePercentage = maxPoints > 0 ? Math.abs(student.points) / maxPoints * 100 : 0;
                const scoreClass = student.points >= 0 ? 'positive' : 'negative';
                const animationDelay = index * 0.08;

                return `
                    <div class="leaderboard-item ${rankClass}" style="animation-delay: ${animationDelay}s;">
                        ${medalHTML}
                        <div class="leaderboard-student-info">
                            <div class="leaderboard-student-name">${student.name}</div>
                            <div class="leaderboard-score-bar-container">
                                <div class="leaderboard-score-bar ${scoreClass}" style="width: ${scorePercentage}%; animation-delay: ${animationDelay + 0.3}s;"></div>
                            </div>
                        </div>
                        <span class="leaderboard-score ${scoreClass}">${student.points} 分</span>
                    </div>
                `;
            }).join('');
        }

        // 更新 Modal 內容（覆蓋骨架屏）
        modal.innerHTML = `
            <div onclick="event.stopPropagation()" class="leaderboard-container w-full max-w-md sm:max-w-lg">
                <div class="leaderboard-header">
                    <h3><span class="trophy-icon">🏆</span> 即時排行榜</h3>
                    <button onclick="hideLeaderboard()" class="leaderboard-close-btn">&times;</button>
                </div>
                <div class="p-2 sm:p-4 max-h-[60vh] overflow-y-auto">
                    ${contentHTML}
                </div>
                <div class="leaderboard-footer">
                    <button onclick="hideLeaderboard()" class="leaderboard-close-btn-footer">
                        ✨ 關閉排行榜
                    </button>
                </div>
            </div>
        `;

        // 觸發特效
        if (typeof triggerConfetti === 'function') {
            triggerConfetti();
        }
        if (typeof playCheerSound === 'function') {
            playCheerSound();
        }
    }

    // === 增強版彩花特效 ===
    function triggerConfettiEnhanced() {
        const colors = [
            '#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff',
            '#5f27cd', '#00d2d3', '#1dd1a1', '#ff9f43', '#ee5a24',
            '#f368e0', '#0abde3', '#10ac84', '#ffeaa7', '#dfe6e9'
        ];

        const shapes = ['circle', 'square', 'ribbon'];
        const confettiCount = 80;

        // 創建彩花容器
        const container = document.createElement('div');
        container.className = 'confetti-container';
        container.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 9999; overflow: hidden;';
        document.body.appendChild(container);

        for (let i = 0; i < confettiCount; i++) {
            const confetti = document.createElement('div');
            const shape = shapes[Math.floor(Math.random() * shapes.length)];
            const color = colors[Math.floor(Math.random() * colors.length)];
            const size = Math.random() * 10 + 6;
            const startX = Math.random() * 100;
            const delay = Math.random() * 0.5;
            const duration = Math.random() * 2 + 2;
            const rotation = Math.random() * 360;

            confetti.className = `confetti-enhanced confetti-${shape}`;

            // 設置樣式
            confetti.style.cssText = `
                position: absolute;
                left: ${startX}%;
                top: -20px;
                width: ${shape === 'ribbon' ? size / 3 : size}px;
                height: ${shape === 'ribbon' ? size * 2 : size}px;
                background: ${color};
                border-radius: ${shape === 'circle' ? '50%' : shape === 'ribbon' ? '2px' : '2px'};
                transform: rotate(${rotation}deg);
                animation: confetti-spiral ${duration}s ease-out ${delay}s forwards;
            `;

            // 添加飄動效果
            if (Math.random() > 0.5) {
                confetti.style.animation += `, confetti-float ${duration / 2}s ease-in-out ${delay}s infinite`;
            }

            container.appendChild(confetti);
        }

        // 添加大型形狀（星星、愛心）
        const specialShapes = ['🌟', '⭐', '✨', '💫', '🎉', '🎊'];
        for (let i = 0; i < 15; i++) {
            const special = document.createElement('div');
            const emoji = specialShapes[Math.floor(Math.random() * specialShapes.length)];
            const startX = Math.random() * 100;
            const delay = Math.random() * 0.3;
            const duration = Math.random() * 2 + 2.5;

            special.style.cssText = `
                position: absolute;
                left: ${startX}%;
                top: -30px;
                font-size: ${Math.random() * 20 + 16}px;
                animation: confetti-spiral ${duration}s ease-out ${delay}s forwards;
                pointer-events: none;
            `;
            special.textContent = emoji;
            container.appendChild(special);
        }

        // 清理
        setTimeout(() => {
            container.remove();
        }, 5000);
    }

    // === 初始化 ===
    function init() {
        // 注入樣式
        injectStyles();

        // 覆寫原始函數
        if (typeof window.showLeaderboard === 'function') {
            window._originalShowLeaderboard = window.showLeaderboard;
        }
        window.showLeaderboard = showLeaderboardEnhanced;

        // 覆寫彩花特效
        if (typeof window.triggerConfetti === 'function') {
            window._originalTriggerConfetti = window.triggerConfetti;
        }
        window.triggerConfetti = triggerConfettiEnhanced;

        console.log('✅ 排行榜增強模組已載入');
    }

    // 當 DOM 載入完成後初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

