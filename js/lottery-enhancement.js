/**
 * 抽籤系統增強模組
 * 提供不重複抽取功能、進階動畫效果、視覺增強
 */

(function () {
    'use strict';

    // 動畫配置
    const LOTTERY_CONFIG = {
        totalRolls: 30,           // 滾動次數
        initialSpeed: 50,         // 初始速度 (ms)
        finalSpeed: 200,          // 最終速度 (ms)
        suspenseDelay: 500,       // 結果揭曉前的暫停 (ms)
        resultScale: 1.2,         // 結果放大倍數
        glowColors: ['#8B5CF6', '#EC4899', '#F59E0B', '#10B981'] // 光暈顏色
    };

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
            const savedNoRepeat = JSON.parse(localStorage.getItem('noRepeatLottery'));
            noRepeatToggle.checked = savedNoRepeat !== false;
        }

        // 更新統計數據
        if (typeof updateLotteryStats === 'function') {
            updateLotteryStats();
        }

        // 清理無效記錄
        cleanupDrawnStudents();

        // 注入增強樣式
        injectLotteryStyles();

        // 覆蓋原有的動畫函式
        overrideLotteryFunctions();

        console.log('🎲 抽籤增強模組已載入 (進階動畫版)');
    }

    // 注入增強 CSS 樣式
    function injectLotteryStyles() {
        const styleId = 'lottery-enhancement-styles';
        if (document.getElementById(styleId)) return;

        const styles = document.createElement('style');
        styles.id = styleId;
        styles.textContent = `
            /* 抽籤容器動畫 */
            #lotteryResult {
                position: relative;
                overflow: hidden;
            }

            /* 滾動名字樣式 */
            .lottery-rolling-name {
                font-size: 2.5rem;
                font-weight: 800;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                animation: lottery-pulse 0.15s ease-in-out;
            }

            @keyframes lottery-pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.05); opacity: 0.8; }
            }

            /* 結果揭曉動畫 */
            .lottery-winner-reveal {
                animation: winner-reveal 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            }

            @keyframes winner-reveal {
                0% {
                    transform: scale(0.3) rotateY(180deg);
                    opacity: 0;
                }
                50% {
                    transform: scale(1.1) rotateY(0deg);
                }
                100% {
                    transform: scale(1) rotateY(0deg);
                    opacity: 1;
                }
            }

            /* 名字發光效果 */
            .lottery-winner-name {
                font-size: 3rem;
                font-weight: 800;
                background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #EC4899 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                animation: glow-text 2s ease-in-out infinite alternate;
                text-shadow: 0 0 30px rgba(139, 92, 246, 0.5);
            }

            @keyframes glow-text {
                0% { filter: brightness(1) drop-shadow(0 0 10px rgba(139, 92, 246, 0.5)); }
                100% { filter: brightness(1.2) drop-shadow(0 0 20px rgba(236, 72, 153, 0.7)); }
            }

            /* 問號動畫 */
            .lottery-question-marks {
                font-size: 4rem;
                animation: bounce-questions 0.5s ease-in-out infinite;
            }

            @keyframes bounce-questions {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-10px); }
            }

            /* 進度指示器 */
            .lottery-progress-bar {
                height: 4px;
                background: linear-gradient(90deg, #6366F1, #8B5CF6, #EC4899);
                border-radius: 2px;
                transition: width 0.1s linear;
            }

            /* 懸念效果 - 倒數 */
            .lottery-suspense {
                animation: suspense-shake 0.1s ease-in-out infinite;
            }

            @keyframes suspense-shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-2px); }
                75% { transform: translateX(2px); }
            }

            /* 光暈背景 */
            .lottery-glow-bg {
                position: absolute;
                inset: 0;
                background: radial-gradient(circle at center, 
                    rgba(139, 92, 246, 0.2) 0%, 
                    transparent 70%);
                animation: glow-pulse 1.5s ease-in-out infinite;
                pointer-events: none;
            }

            @keyframes glow-pulse {
                0%, 100% { opacity: 0.5; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.1); }
            }

            /* 星星裝飾 */
            .lottery-stars {
                position: absolute;
                width: 100%;
                height: 100%;
                pointer-events: none;
                overflow: hidden;
            }

            .lottery-star {
                position: absolute;
                font-size: 1.5rem;
                animation: star-twinkle 1s ease-in-out infinite;
            }

            @keyframes star-twinkle {
                0%, 100% { opacity: 0.3; transform: scale(0.8); }
                50% { opacity: 1; transform: scale(1.2); }
            }

            /* === RWD 響應式樣式 === */
            
            /* 平板以下 (768px) */
            @media (max-width: 768px) {
                .lottery-rolling-name {
                    font-size: 1.8rem;
                }
                
                .lottery-winner-name {
                    font-size: 2rem;
                    line-height: 1.3;
                    word-break: keep-all;
                    padding: 0 0.5rem;
                }
                
                .lottery-question-marks {
                    font-size: 3rem;
                }
                
                .lottery-star {
                    font-size: 1.2rem;
                }
            }
            
            /* 手機 (480px) */
            @media (max-width: 480px) {
                .lottery-rolling-name {
                    font-size: 1.5rem;
                }
                
                .lottery-winner-name {
                    font-size: 1.5rem;
                    line-height: 1.4;
                }
                
                .lottery-question-marks {
                    font-size: 2.5rem;
                }
                
                .lottery-star {
                    font-size: 1rem;
                }
                
                .lottery-winner-reveal .text-5xl {
                    font-size: 2.5rem;
                }
                
                .lottery-winner-reveal .text-xl {
                    font-size: 1rem;
                }
            }
        `;
        document.head.appendChild(styles);
    }

    // 覆蓋原有函式
    function overrideLotteryFunctions() {
        // 保存原始函式
        const originalRunLotteryAnimation = window.runLotteryAnimation;
        const originalDisplayLotteryResult = window.displayLotteryResult;

        // 覆蓋 runLotteryAnimation
        window.runLotteryAnimation = function (finalResult, type) {
            runEnhancedLotteryAnimation(finalResult, type);
        };

        // 覆蓋 displayLotteryResult
        window.displayLotteryResult = function (result, type) {
            displayEnhancedLotteryResult(result, type);
        };
    }

    // 增強版抽籤動畫
    function runEnhancedLotteryAnimation(finalResult, type) {
        const container = document.getElementById('lotteryResult');
        const btn = document.getElementById('startLotteryBtn');

        btn.disabled = true;
        btn.classList.add('bg-gray-400', 'hover:bg-gray-400');
        btn.innerHTML = '🔄 抽籤中...';

        // 建立動畫容器
        container.innerHTML = `
            <div class="lottery-glow-bg"></div>
            <div class="lottery-stars" id="lotteryStars"></div>
            <div class="relative z-10 py-4">
                <div class="lottery-question-marks mb-2">❓</div>
                <div id="lottery-rolling-text" class="lottery-rolling-name"></div>
                <div class="mt-4 px-8">
                    <div class="h-1 bg-gray-200 rounded-full overflow-hidden">
                        <div id="lottery-progress" class="lottery-progress-bar" style="width: 0%"></div>
                    </div>
                </div>
            </div>
        `;

        // 添加裝飾星星
        addDecorativeStars();

        const rollingText = document.getElementById('lottery-rolling-text');
        const progressBar = document.getElementById('lottery-progress');

        if (!rollingText) return;

        let rollCount = 0;
        const totalRolls = LOTTERY_CONFIG.totalRolls;

        // 計算變速動畫
        const getInterval = (count) => {
            const progress = count / totalRolls;
            // 使用緩動函數：開始快，結束慢
            const easeOut = 1 - Math.pow(1 - progress, 3);
            return LOTTERY_CONFIG.initialSpeed +
                (LOTTERY_CONFIG.finalSpeed - LOTTERY_CONFIG.initialSpeed) * easeOut;
        };

        // 隨機名字產生器
        const getRollingText = () => {
            if (type === 'group') {
                const randomGroup = groups[Math.floor(Math.random() * groups.length)];
                return randomGroup.name;
            } else {
                const randomStudents = [...students].sort(() => 0.5 - Math.random());
                let randomNames = [];
                for (let i = 0; i < finalResult.length; i++) {
                    randomNames.push(randomStudents[i % randomStudents.length].name);
                }
                return randomNames.join('、');
            }
        };

        // 遞迴動畫
        const animateRoll = () => {
            rollingText.textContent = getRollingText();

            // 更新進度條
            const progress = (rollCount / totalRolls) * 100;
            progressBar.style.width = `${progress}%`;

            // 播放音效
            if (typeof playLotteryTickSound === 'function') {
                playLotteryTickSound();
            }

            rollCount++;

            if (rollCount < totalRolls) {
                setTimeout(animateRoll, getInterval(rollCount));
            } else {
                // 最後懸念效果
                rollingText.classList.add('lottery-suspense');
                progressBar.style.width = '100%';

                setTimeout(() => {
                    rollingText.classList.remove('lottery-suspense');

                    // 顯示結果
                    displayEnhancedLotteryResult(finalResult, type);

                    // 播放勝利音效
                    if (typeof playLotteryWinSound === 'function') {
                        playLotteryWinSound();
                    }

                    // 觸發彩花
                    if (typeof triggerConfetti === 'function') {
                        triggerConfetti();
                    }

                    // 儲存歷史記錄
                    if (typeof saveLotteryHistory === 'function') {
                        saveLotteryHistory(finalResult, type);
                    }

                    // 恢復按鈕
                    btn.disabled = false;
                    btn.classList.remove('bg-gray-400', 'hover:bg-gray-400');
                    btn.innerHTML = '🎲 開始抽籤';

                }, LOTTERY_CONFIG.suspenseDelay);
            }
        };

        // 開始動畫
        animateRoll();
    }

    // 增強版結果顯示
    function displayEnhancedLotteryResult(result, type) {
        const container = document.getElementById('lotteryResult');

        let emoji, title, names, subtitle = '';

        if (type === 'group') {
            const group = result[0];
            emoji = '🏆';
            title = '獲勝組別';
            names = group.name;
            subtitle = group.members.map(m => m.name).join('、');
        } else {
            emoji = result.length > 1 ? '🎊' : '🎉';
            title = result.length > 1 ? '抽中的是...' : '抽中的是...';
            names = result.map(s => s.name).join('、');
        }

        container.innerHTML = `
            <div class="lottery-glow-bg"></div>
            <div class="lottery-stars" id="lotteryStars"></div>
            <div class="lottery-winner-reveal relative z-10 py-4">
                <div class="text-5xl mb-3 animate-bounce">${emoji}</div>
                <div class="text-xl font-bold text-purple-600 mb-2">${title}</div>
                <div class="lottery-winner-name">${names}</div>
                ${subtitle ? `<p class="text-sm text-gray-600 mt-3 max-w-xs mx-auto">${subtitle}</p>` : ''}
            </div>
        `;

        // 添加裝飾星星
        addDecorativeStars();
    }

    // 添加裝飾星星
    function addDecorativeStars() {
        const container = document.getElementById('lotteryStars');
        if (!container) return;

        const stars = ['✨', '⭐', '🌟', '💫'];
        const positions = [
            { top: '10%', left: '15%' },
            { top: '20%', right: '10%' },
            { top: '60%', left: '8%' },
            { top: '70%', right: '15%' },
            { bottom: '15%', left: '20%' },
            { bottom: '20%', right: '20%' }
        ];

        positions.forEach((pos, i) => {
            const star = document.createElement('div');
            star.className = 'lottery-star';
            star.textContent = stars[i % stars.length];
            star.style.animationDelay = `${i * 0.2}s`;

            Object.entries(pos).forEach(([key, value]) => {
                star.style[key] = value;
            });

            container.appendChild(star);
        });
    }

    // 清理已刪除學生的抽取記錄
    function cleanupDrawnStudents() {
        try {
            const drawnIds = JSON.parse(localStorage.getItem('drawnStudentIds')) || [];
            const studentData = JSON.parse(localStorage.getItem('students')) || [];
            const validStudentIds = studentData.map(s => s.id);

            const cleanedIds = drawnIds.filter(id => validStudentIds.includes(id));

            if (cleanedIds.length !== drawnIds.length) {
                localStorage.setItem('drawnStudentIds', JSON.stringify(cleanedIds));
                if (typeof drawnStudentIds !== 'undefined') {
                    window.drawnStudentIds = cleanedIds;
                }
            }
        } catch (e) {
            console.error('清理抽籤記錄時發生錯誤:', e);
        }
    }
})();
