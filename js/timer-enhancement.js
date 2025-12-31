/**
 * 計時器增強模組
 * 提供全螢幕計時功能和 RWD 支援
 */

(function () {
    'use strict';

    // === 注入 CSS 樣式 ===
    const timerStyles = `
        /* 全螢幕計時器 Modal */
        .timer-fullscreen-modal {
            position: fixed;
            inset: 0;
            z-index: 100;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #1e3a5f 0%, #2d1b4e 50%, #1a1a2e 100%);
            padding: 1rem;
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
        }

        .timer-fullscreen-modal.active {
            opacity: 1;
            visibility: visible;
        }

        /* 關閉按鈕 */
        .timer-fullscreen-close {
            position: absolute;
            top: 1rem;
            right: 1rem;
            background: rgba(255, 255, 255, 0.15);
            border: none;
            color: white;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            font-size: 1.5rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            z-index: 10;
        }

        .timer-fullscreen-close:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: scale(1.1);
        }

        /* 標題 */
        .timer-fullscreen-title {
            color: rgba(255, 255, 255, 0.8);
            font-size: clamp(1rem, 3vw, 1.5rem);
            margin-bottom: 1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .timer-fullscreen-title-icon {
            font-size: 1.5em;
        }

        /* 時間顯示 */
        .timer-fullscreen-display {
            font-family: 'Noto Sans TC', system-ui, sans-serif;
            font-size: clamp(5rem, 28vw, 18rem);
            font-weight: 700;
            color: #ffffff;
            text-shadow: 0 0 30px rgba(255, 255, 255, 0.3);
            line-height: 1;
            margin-bottom: 0.5rem;
            transition: all 0.3s ease;
        }

        .timer-fullscreen-display.warning {
            color: #fbbf24;
            animation: timer-pulse 1s ease-in-out infinite;
        }

        .timer-fullscreen-display.danger {
            color: #ef4444;
            animation: timer-pulse 0.5s ease-in-out infinite;
        }

        @keyframes timer-pulse {
            0%, 100% {
                transform: scale(1);
                opacity: 1;
            }
            50% {
                transform: scale(1.02);
                opacity: 0.8;
            }
        }

        /* 狀態文字 */
        .timer-fullscreen-status {
            color: rgba(255, 255, 255, 0.6);
            font-size: clamp(0.875rem, 2vw, 1.25rem);
            margin-bottom: 2rem;
        }

        /* 進度條容器 */
        .timer-fullscreen-progress-container {
            width: 100%;
            max-width: 600px;
            margin: 0 auto 2rem auto;
            padding: 0 1rem;
            display: flex;
            justify-content: center;
        }

        .timer-fullscreen-progress {
            width: 100%;
            height: 12px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            overflow: hidden;
        }

        .timer-fullscreen-progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #10b981 0%, #34d399 50%, #6ee7b7 100%);
            border-radius: 6px;
            transition: width 1s linear;
        }

        .timer-fullscreen-progress-bar.warning {
            background: linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%);
        }

        .timer-fullscreen-progress-bar.danger {
            background: linear-gradient(90deg, #dc2626 0%, #ef4444 100%);
        }



        /* 控制按鈕區 */
        .timer-fullscreen-controls {
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
            justify-content: center;
        }

        .timer-fullscreen-btn {
            min-width: 120px;
            padding: 1rem 2rem;
            border: none;
            border-radius: 1rem;
            font-size: 1.125rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
        }

        .timer-fullscreen-btn:active {
            transform: scale(0.95);
        }

        .timer-fullscreen-btn-primary {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
        }

        .timer-fullscreen-btn-primary:hover {
            box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4);
            transform: translateY(-2px);
        }

        .timer-fullscreen-btn-primary.running {
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        }

        .timer-fullscreen-btn-secondary {
            background: rgba(255, 255, 255, 0.1);
            color: white;
            border: 2px solid rgba(255, 255, 255, 0.2);
        }

        .timer-fullscreen-btn-secondary:hover {
            background: rgba(255, 255, 255, 0.2);
        }

        /* 展開按鈕 */
        .timer-expand-btn {
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 0.375rem;
            transition: all 0.3s ease;
            margin-top: 0.75rem;
        }

        .timer-expand-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
        }

        .timer-expand-btn:active {
            transform: scale(0.95);
        }

        /* RWD 調整 */
        @media (max-width: 640px) {
            .timer-fullscreen-close {
                top: 0.5rem;
                right: 0.5rem;
                width: 44px;
                height: 44px;
            }

            .timer-fullscreen-controls {
                flex-direction: column;
                width: 100%;
                padding: 0 1rem;
            }

            .timer-fullscreen-btn {
                width: 100%;
                min-height: 56px;
            }

            .timer-fullscreen-progress-container {
                max-width: 100%;
            }
        }

        @media (min-width: 641px) and (max-width: 1024px) {
            .timer-fullscreen-display {
                font-size: clamp(6rem, 20vw, 14rem);
            }
        }
    `;

    // Modal HTML 模板
    const modalHTML = `
        <div id="timerFullscreenModal" class="timer-fullscreen-modal" onclick="closeTimerFullscreen()">
            <button class="timer-fullscreen-close" onclick="event.stopPropagation(); closeTimerFullscreen();">&times;</button>
            
            <div onclick="event.stopPropagation();">
                <div class="timer-fullscreen-title">
                    <span class="timer-fullscreen-title-icon">⏱️</span>
                    <span id="timerFullscreenTitle">計時器</span>
                </div>
                
                <div id="timerFullscreenDisplay" class="timer-fullscreen-display">05:00</div>
                
                <div id="timerFullscreenStatus" class="timer-fullscreen-status">準備開始</div>
                
                <div class="timer-fullscreen-progress-container">
                    <div class="timer-fullscreen-progress">
                        <div id="timerFullscreenProgressBar" class="timer-fullscreen-progress-bar" style="width: 0%;"></div>
                    </div>
                </div>
                
                <div class="timer-fullscreen-controls">
                    <button id="timerFullscreenResetBtn" class="timer-fullscreen-btn timer-fullscreen-btn-secondary" onclick="event.stopPropagation(); resetTimerFromFullscreen();">
                        🔄 重置
                    </button>
                    <button id="timerFullscreenStartBtn" class="timer-fullscreen-btn timer-fullscreen-btn-primary" onclick="event.stopPropagation(); toggleTimerFromFullscreen();">
                        ▶️ 開始
                    </button>
                </div>
            </div>
        </div>
    `;

    // 注入樣式
    function injectStyles() {
        if (document.getElementById('timer-enhancement-styles')) return;

        const styleEl = document.createElement('style');
        styleEl.id = 'timer-enhancement-styles';
        styleEl.textContent = timerStyles;
        document.head.appendChild(styleEl);
    }

    // 注入 Modal
    function injectModal() {
        if (document.getElementById('timerFullscreenModal')) return;

        const container = document.createElement('div');
        container.innerHTML = modalHTML;
        document.body.appendChild(container.firstElementChild);
    }

    // 添加展開按鈕到計時顯示區
    function addExpandButton() {
        const timerDisplay = document.querySelector('#timer-section .bg-gradient-to-r');
        if (!timerDisplay || document.getElementById('timerExpandBtn')) return;

        const btn = document.createElement('button');
        btn.id = 'timerExpandBtn';
        btn.className = 'timer-expand-btn';
        btn.innerHTML = '⤢ 全螢幕計時';
        btn.onclick = openTimerFullscreen;

        timerDisplay.appendChild(btn);
    }

    // 開啟全螢幕計時器
    window.openTimerFullscreen = function () {
        const modal = document.getElementById('timerFullscreenModal');
        if (!modal) return;

        // 同步標題
        const title = document.getElementById('timerTitle')?.value || '計時器';
        document.getElementById('timerFullscreenTitle').textContent = title;

        // 同步當前狀態
        syncTimerState();

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // 開始同步更新
        startFullscreenSync();
    };

    // 關閉全螢幕計時器
    window.closeTimerFullscreen = function () {
        const modal = document.getElementById('timerFullscreenModal');
        if (!modal) return;

        modal.classList.remove('active');
        document.body.style.overflow = '';

        // 停止同步
        stopFullscreenSync();
    };

    // 同步計時器狀態
    let syncInterval = null;

    function syncTimerState() {
        // 讀取主計時器狀態
        const display = document.getElementById('timerDisplay');
        const titleDisplay = document.getElementById('timerTitleDisplay');
        const progressBar = document.getElementById('timerProgressBar');

        if (display) {
            const fsDisplay = document.getElementById('timerFullscreenDisplay');
            fsDisplay.textContent = display.textContent;

            // 根據時間設置警告狀態
            const timeText = display.textContent;
            const [mins, secs] = timeText.split(':').map(Number);
            const totalSecs = mins * 60 + secs;

            fsDisplay.classList.remove('warning', 'danger');
            const fsProgressBar = document.getElementById('timerFullscreenProgressBar');
            fsProgressBar.classList.remove('warning', 'danger');

            if (totalSecs <= 10 && totalSecs > 0) {
                fsDisplay.classList.add('danger');
                fsProgressBar.classList.add('danger');
            } else if (totalSecs <= 30) {
                fsDisplay.classList.add('warning');
                fsProgressBar.classList.add('warning');
            }
        }

        if (titleDisplay) {
            document.getElementById('timerFullscreenStatus').textContent = titleDisplay.textContent;
        }

        if (progressBar) {
            const width = progressBar.style.width;
            document.getElementById('timerFullscreenProgressBar').style.width = width;
        }

        // 更新按鈕狀態
        updateFullscreenButtons();
    }

    function updateFullscreenButtons() {
        const startBtn = document.getElementById('timerFullscreenStartBtn');
        if (!startBtn) return;

        // 檢查計時器是否在運行
        const isRunning = typeof window.timerRunning !== 'undefined' ? window.timerRunning : false;

        if (isRunning) {
            startBtn.innerHTML = '⏸️ 暫停';
            startBtn.classList.add('running');
        } else {
            startBtn.innerHTML = '▶️ 開始';
            startBtn.classList.remove('running');
        }
    }

    function startFullscreenSync() {
        if (syncInterval) return;
        syncInterval = setInterval(syncTimerState, 100);
    }

    function stopFullscreenSync() {
        if (syncInterval) {
            clearInterval(syncInterval);
            syncInterval = null;
        }
    }

    // 從全螢幕控制計時器
    window.toggleTimerFromFullscreen = function () {
        if (typeof window.startTimer === 'function') {
            window.startTimer();
            setTimeout(updateFullscreenButtons, 100);
        }
    };

    window.resetTimerFromFullscreen = function () {
        if (typeof window.resetTimer === 'function') {
            window.resetTimer();
            setTimeout(syncTimerState, 100);
        }
    };

    // 初始化
    function init() {
        injectStyles();
        injectModal();

        // 等待 DOM 完全載入後添加按鈕
        if (document.readyState === 'complete') {
            addExpandButton();
        } else {
            window.addEventListener('load', addExpandButton);
        }

        // 監聽 section 切換，確保按鈕存在
        const observer = new MutationObserver(() => {
            addExpandButton();
        });

        const timerSection = document.getElementById('timer-section');
        if (timerSection) {
            observer.observe(timerSection, { attributes: true, attributeFilter: ['class'] });
        }

        console.log('✅ 計時器增強模組已載入');
    }

    // 當 DOM 載入完成後初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
