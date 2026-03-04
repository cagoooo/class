/**
 * ?賜惜蝟餌絞憓撥璅∠?
 * ??銝?銴???賬脤??????閬箏?撘?
 */

(function () {
    'use strict';

    // ??蔭
    const LOTTERY_CONFIG = {
        totalRolls: 30,           // 皛曉?甈⊥
        initialSpeed: 50,         // ???漲 (ms)
        finalSpeed: 200,          // ?蝯漲 (ms)
        suspenseDelay: 500,       // 蝯??剜????怠? (ms)
        resultScale: 1.2,         // 蝯??曉之?
        glowColors: ['#8B5CF6', '#EC4899', '#F59E0B', '#10B981'] // ??憿
    };

    // 蝑? DOM 頛摰?
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLotteryEnhancement);
    } else {
        initLotteryEnhancement();
    }

    function initLotteryEnhancement() {
        // ?郊 checkbox ???
        const noRepeatToggle = document.getElementById('noRepeatToggle');
        if (noRepeatToggle) {
            const savedNoRepeat = JSON.parse(localStorage.getItem('noRepeatLottery'));
            noRepeatToggle.checked = savedNoRepeat !== false;
        }

        // ?湔蝯梯??豢?
        if (typeof updateLotteryStats === 'function') {
            updateLotteryStats();
        }

        // 皜??⊥?閮?
        cleanupDrawnStudents();

        // 瘜典憓撥璅??
        injectLotteryStyles();

        // 閬??????怠撘?
        overrideLotteryFunctions();

        console.log('? ?賜惜憓撥璅∠?撌脰???(?脤????');
    }

    // 瘜典憓撥 CSS 璅??
    function injectLotteryStyles() {
        const styleId = 'lottery-enhancement-styles';
        if (document.getElementById(styleId)) return;

        const styles = document.createElement('style');
        styles.id = styleId;
        styles.textContent = `
            /* ?賜惜摰孵? */
            #lotteryResult {
                position: relative;
                overflow: hidden;
            }

            /* 皛曉???璅?? */
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

            /* 蝯??剜?? */
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

            /* ???澆??? */
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

            /* ??? */
            .lottery-question-marks {
                font-size: 4rem;
                animation: bounce-questions 0.5s ease-in-out infinite;
            }

            @keyframes bounce-questions {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-10px); }
            }

            /* ?脣漲?內??*/
            .lottery-progress-bar {
                height: 4px;
                background: linear-gradient(90deg, #6366F1, #8B5CF6, #EC4899);
                border-radius: 2px;
                transition: width 0.1s linear;
            }

            /* ?詨艙?? - ? */
            .lottery-suspense {
                animation: suspense-shake 0.1s ease-in-out infinite;
            }

            @keyframes suspense-shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-2px); }
                75% { transform: translateX(2px); }
            }

            /* ??? */
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

            /* ??鋆ˇ */
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

            /* === RWD ?踵?撘見撘?=== */
            
            /* 撟單隞乩? (768px) */
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
            
            /* ?? (480px) */
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

    // 閬????賢?
    function overrideLotteryFunctions() {
        // 靽????賢?
        const originalRunLotteryAnimation = window.runLotteryAnimation;
        const originalDisplayLotteryResult = window.displayLotteryResult;

        // 閬? runLotteryAnimation
        window.runLotteryAnimation = function (finalResult, type) {
            runEnhancedLotteryAnimation(finalResult, type);
        };

        // 閬? displayLotteryResult
        window.displayLotteryResult = function (result, type) {
            displayEnhancedLotteryResult(result, type);
        };
    }

    // 憓撥?蝐文???
    function runEnhancedLotteryAnimation(finalResult, type) {
        const container = document.getElementById('lotteryResult');
        const btn = document.getElementById('startLotteryBtn');

        btn.disabled = true;
        btn.classList.add('bg-gray-400', 'hover:bg-gray-400');
        btn.innerHTML = '?? ?賜惜銝?..';

        // 撱箇??摰孵
        container.innerHTML = `
            <div class="lottery-glow-bg"></div>
            <div class="lottery-stars" id="lotteryStars"></div>
            <div class="relative z-10 py-4">
                <div class="lottery-question-marks mb-2">??/div>
                <div id="lottery-rolling-text" class="lottery-rolling-name"></div>
                <div class="mt-4 px-8">
                    <div class="h-1 bg-gray-200 rounded-full overflow-hidden">
                        <div id="lottery-progress" class="lottery-progress-bar" style="width: 0%"></div>
                    </div>
                </div>
            </div>
        `;

        // 瘛餃?鋆ˇ??
        addDecorativeStars();

        const rollingText = document.getElementById('lottery-rolling-text');
        const progressBar = document.getElementById('lottery-progress');

        if (!rollingText) return;

        let rollCount = 0;
        const totalRolls = LOTTERY_CONFIG.totalRolls;

        // 閮?霈???
        const getInterval = (count) => {
            const progress = count / totalRolls;
            // 雿輻蝺拙??賣嚗?憪翰嚗??
            const easeOut = 1 - Math.pow(1 - progress, 3);
            return LOTTERY_CONFIG.initialSpeed +
                (LOTTERY_CONFIG.finalSpeed - LOTTERY_CONFIG.initialSpeed) * easeOut;
        };

        // ?冽????Ｙ???
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
                return randomNames.join('??);
            }
        };

        // ?艘?
        const animateRoll = () => {
            rollingText.textContent = getRollingText();

            // ?湔?脣漲璇?
            const progress = (rollCount / totalRolls) * 100;
            progressBar.style.width = `${progress}%`;

            // ?剜?單?
            if (typeof playLotteryTickSound === 'function') {
                playLotteryTickSound();
            }

            rollCount++;

            if (rollCount < totalRolls) {
                setTimeout(animateRoll, getInterval(rollCount));
            } else {
                // ?敺敹菜???
                rollingText.classList.add('lottery-suspense');
                progressBar.style.width = '100%';

                setTimeout(() => {
                    rollingText.classList.remove('lottery-suspense');

                    // 憿舐內蝯?
                    displayEnhancedLotteryResult(finalResult, type);

                    // ?剜??單?
                    if (typeof playLotteryWinSound === 'function') {
                        playLotteryWinSound();
                    }

                    // 閫貊敶抵
                    if (typeof triggerConfetti === 'function') {
                        triggerConfetti();
                    }

                    // ?脣?甇瑕閮?
                    if (typeof saveLotteryHistory === 'function') {
                        saveLotteryHistory(finalResult, type);
                    }

                    // ?Ｗ儔??
                    btn.disabled = false;
                    btn.classList.remove('bg-gray-400', 'hover:bg-gray-400');
                    btn.innerHTML = '? ???賜惜';

                }, LOTTERY_CONFIG.suspenseDelay);
            }
        };

        // ???
        animateRoll();
    }

    // 憓撥???＊蝷?
    function displayEnhancedLotteryResult(result, type) {
        const container = document.getElementById('lotteryResult');

        let emoji, title, names, subtitle = '';

        if (type === 'group') {
            const group = result[0];
            emoji = '??';
            title = '?脣?蝯';
            names = group.name;
            subtitle = group.members.map(m => m.name).join('??);
        } else {
            emoji = result.length > 1 ? '??' : '??';
            title = result.length > 1 ? '?賭葉?...' : '?賭葉?...';
            names = result.map(s => s.name).join('??);
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

        // 瘛餃?鋆ˇ??
        addDecorativeStars();
    }

    // 瘛餃?鋆ˇ??
    function addDecorativeStars() {
        const container = document.getElementById('lotteryStars');
        if (!container) return;

        const stars = ['??, '潃?, '??', '?'];
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

    // 皜?撌脣?文飛???賢?閮?
    function cleanupDrawnStudents() {
        try {
            const drawnIds = JSON.parse(localStorage.getItem('drawnStudentIds')) || [];
            const studentData = JSON.parse(localStorage.getItem(window.STUDENTS_KEY || 'students')) || [];
            const validStudentIds = studentData.map(s => s.id);

            const cleanedIds = drawnIds.filter(id => validStudentIds.includes(id));

            if (cleanedIds.length !== drawnIds.length) {
                localStorage.setItem('drawnStudentIds', JSON.stringify(cleanedIds));
                if (typeof drawnStudentIds !== 'undefined') {
                    window.drawnStudentIds = cleanedIds;
                }
            }
        } catch (e) {
            console.error('皜??賜惜閮???隤?', e);
        }
    }
})();
