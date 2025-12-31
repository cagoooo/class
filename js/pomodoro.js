/**
 * 番茄鐘模組
 * Pomodoro Timer Module
 * 
 * 功能：
 * 1. 番茄鐘模式（25分鐘專注 + 5分鐘休息）
 * 2. 自動循環專注/休息
 * 3. 視覺區分模式
 */

(function () {
    'use strict';

    // ==================== 配置 ====================
    const POMODORO_CONFIG = {
        focusMinutes: 25,      // 專注時間（分鐘）
        shortBreakMinutes: 5,  // 短休息時間
        longBreakMinutes: 15,  // 長休息時間
        sessionsBeforeLong: 4, // 幾次專注後長休息
    };

    // 番茄鐘狀態
    let pomodoroState = {
        isActive: false,
        mode: 'focus',  // 'focus' | 'shortBreak' | 'longBreak'
        completedSessions: 0,
        interval: null
    };

    // ==================== CSS 樣式 ====================
    const pomodoroStyles = `
        /* 番茄鐘開關按鈕 */
        .pomodoro-toggle {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem 1rem;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            color: white;
            border: none;
            border-radius: 0.5rem;
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .pomodoro-toggle:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4);
        }

        .pomodoro-toggle.active {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        }

        .pomodoro-toggle.active:hover {
            box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
        }

        /* 番茄鐘狀態顯示 */
        .pomodoro-status {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 0.75rem 1rem;
            background: rgba(239, 68, 68, 0.1);
            border-radius: 0.5rem;
            margin-top: 0.75rem;
            flex-wrap: wrap;
        }

        .pomodoro-status.focus {
            background: rgba(239, 68, 68, 0.1);
            border-left: 4px solid #ef4444;
        }

        .pomodoro-status.break {
            background: rgba(16, 185, 129, 0.1);
            border-left: 4px solid #10b981;
        }

        .pomodoro-mode-badge {
            display: flex;
            align-items: center;
            gap: 0.375rem;
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.875rem;
            font-weight: 600;
        }

        .pomodoro-mode-badge.focus {
            background: #fef2f2;
            color: #dc2626;
        }

        .pomodoro-mode-badge.break {
            background: #ecfdf5;
            color: #059669;
        }

        .pomodoro-sessions {
            display: flex;
            align-items: center;
            gap: 0.25rem;
        }

        .pomodoro-session-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #e5e7eb;
            transition: all 0.3s ease;
        }

        .pomodoro-session-dot.completed {
            background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
            box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
        }

        .pomodoro-skip-btn {
            padding: 0.375rem 0.75rem;
            background: rgba(107, 114, 128, 0.1);
            border: 1px solid rgba(107, 114, 128, 0.2);
            border-radius: 0.375rem;
            font-size: 0.75rem;
            color: #6b7280;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .pomodoro-skip-btn:hover {
            background: rgba(107, 114, 128, 0.2);
        }

        /* 全螢幕番茄鐘模式 */
        .timer-fullscreen-modal.pomodoro-focus {
            background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #1a1a2e 100%) !important;
        }

        .timer-fullscreen-modal.pomodoro-break {
            background: linear-gradient(135deg, #064e3b 0%, #065f46 50%, #1a1a2e 100%) !important;
        }
    `;

    // ==================== 功能函數 ====================

    /**
     * 初始化番茄鐘 UI
     */
    function initPomodoroUI() {
        // 注入樣式
        if (!document.getElementById('pomodoro-styles')) {
            const style = document.createElement('style');
            style.id = 'pomodoro-styles';
            style.textContent = pomodoroStyles;
            document.head.appendChild(style);
        }

        // 在計時器區域添加番茄鐘開關
        const timerSection = document.getElementById('timer-section');
        if (!timerSection || document.getElementById('pomodoro-toggle-btn')) return;

        // 找到計時器控制區
        const timerControls = timerSection.querySelector('.flex.gap-2');
        if (timerControls) {
            const toggleBtn = document.createElement('button');
            toggleBtn.id = 'pomodoro-toggle-btn';
            toggleBtn.className = 'pomodoro-toggle';
            toggleBtn.innerHTML = '🍅 番茄鐘';
            toggleBtn.onclick = togglePomodoroMode;
            timerControls.appendChild(toggleBtn);
        }
    }

    /**
     * 切換番茄鐘模式
     */
    window.togglePomodoroMode = function () {
        pomodoroState.isActive = !pomodoroState.isActive;

        const toggleBtn = document.getElementById('pomodoro-toggle-btn');
        if (toggleBtn) {
            toggleBtn.classList.toggle('active', pomodoroState.isActive);
            toggleBtn.innerHTML = pomodoroState.isActive ? '🍅 番茄鐘 ON' : '🍅 番茄鐘';
        }

        if (pomodoroState.isActive) {
            startPomodoroSession('focus');
            showPomodoroStatus();
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.success('🍅 番茄鐘模式已開啟！專注 25 分鐘');
            }
        } else {
            stopPomodoro();
            hidePomodoroStatus();
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.info('番茄鐘模式已關閉');
            }
        }
    };

    /**
     * 開始番茄鐘階段
     */
    function startPomodoroSession(mode) {
        pomodoroState.mode = mode;

        let minutes;
        switch (mode) {
            case 'focus':
                minutes = POMODORO_CONFIG.focusMinutes;
                break;
            case 'shortBreak':
                minutes = POMODORO_CONFIG.shortBreakMinutes;
                break;
            case 'longBreak':
                minutes = POMODORO_CONFIG.longBreakMinutes;
                break;
            default:
                minutes = POMODORO_CONFIG.focusMinutes;
        }

        // 設定計時器時間
        const timerInput = document.getElementById('timerInput');
        if (timerInput) {
            timerInput.value = minutes;
        }

        // 更新全域變數
        if (typeof window.totalSeconds !== 'undefined') {
            window.totalSeconds = minutes * 60;
        }

        // 重置並開始計時
        if (typeof window.resetTimer === 'function') {
            window.resetTimer();
        }

        // 更新 UI
        updatePomodoroStatus();
        updateFullscreenPomodoroTheme();

        // 自動開始
        setTimeout(() => {
            if (typeof window.startTimer === 'function' && !window.timerRunning) {
                window.startTimer();
            }
        }, 100);
    }

    /**
     * 停止番茄鐘
     */
    function stopPomodoro() {
        pomodoroState.isActive = false;
        pomodoroState.mode = 'focus';
        pomodoroState.completedSessions = 0;

        if (pomodoroState.interval) {
            clearInterval(pomodoroState.interval);
            pomodoroState.interval = null;
        }

        updateFullscreenPomodoroTheme();
    }

    /**
     * 顯示番茄鐘狀態
     */
    function showPomodoroStatus() {
        if (document.getElementById('pomodoro-status-bar')) return;

        const timerSection = document.getElementById('timer-section');
        if (!timerSection) return;

        const statusBar = document.createElement('div');
        statusBar.id = 'pomodoro-status-bar';
        statusBar.className = 'pomodoro-status focus';

        updateStatusBarContent(statusBar);

        // 插入到計時器區域
        const timerDisplay = timerSection.querySelector('.bg-gradient-to-r');
        if (timerDisplay) {
            timerDisplay.parentNode.insertBefore(statusBar, timerDisplay.nextSibling);
        }

        // 開始監控計時器完成
        startPomodoroMonitor();
    }

    /**
     * 更新狀態欄內容
     */
    function updateStatusBarContent(statusBar) {
        const isBreak = pomodoroState.mode !== 'focus';
        statusBar.className = `pomodoro-status ${isBreak ? 'break' : 'focus'}`;

        const modeText = pomodoroState.mode === 'focus' ? '🎯 專注中' :
            pomodoroState.mode === 'shortBreak' ? '☕ 短休息' : '🌴 長休息';

        const sessionDots = Array(POMODORO_CONFIG.sessionsBeforeLong).fill(0).map((_, i) =>
            `<div class="pomodoro-session-dot ${i < pomodoroState.completedSessions ? 'completed' : ''}"></div>`
        ).join('');

        statusBar.innerHTML = `
            <div class="pomodoro-mode-badge ${isBreak ? 'break' : 'focus'}">
                ${modeText}
            </div>
            <div class="pomodoro-sessions" title="完成 ${pomodoroState.completedSessions}/${POMODORO_CONFIG.sessionsBeforeLong} 個番茄">
                ${sessionDots}
            </div>
            <button class="pomodoro-skip-btn" onclick="skipPomodoroPhase()">
                ⏭️ 跳過
            </button>
        `;
    }

    /**
     * 更新番茄鐘狀態
     */
    function updatePomodoroStatus() {
        const statusBar = document.getElementById('pomodoro-status-bar');
        if (statusBar) {
            updateStatusBarContent(statusBar);
        }
    }

    /**
     * 隱藏番茄鐘狀態
     */
    function hidePomodoroStatus() {
        const statusBar = document.getElementById('pomodoro-status-bar');
        if (statusBar) {
            statusBar.remove();
        }
        stopPomodoroMonitor();
    }

    /**
     * 開始監控計時器
     */
    function startPomodoroMonitor() {
        if (pomodoroState.interval) return;

        pomodoroState.interval = setInterval(() => {
            if (!pomodoroState.isActive) return;

            // 檢查計時器是否完成
            const display = document.getElementById('timerDisplay');
            if (display && display.textContent === '00:00' && !window.timerRunning) {
                onPomodoroPhaseComplete();
            }
        }, 1000);
    }

    /**
     * 停止監控
     */
    function stopPomodoroMonitor() {
        if (pomodoroState.interval) {
            clearInterval(pomodoroState.interval);
            pomodoroState.interval = null;
        }
    }

    /**
     * 番茄鐘階段完成
     */
    function onPomodoroPhaseComplete() {
        if (pomodoroState.mode === 'focus') {
            // 專注階段完成
            pomodoroState.completedSessions++;

            // 播放通知音效
            playPomodoroSound();

            // 決定下一階段
            if (pomodoroState.completedSessions >= POMODORO_CONFIG.sessionsBeforeLong) {
                pomodoroState.completedSessions = 0;
                startPomodoroSession('longBreak');
                if (typeof NotificationSystem !== 'undefined') {
                    NotificationSystem.success('🎉 太棒了！完成 4 個番茄，享受長休息吧！');
                }
            } else {
                startPomodoroSession('shortBreak');
                if (typeof NotificationSystem !== 'undefined') {
                    NotificationSystem.info('☕ 專注完成！休息 5 分鐘');
                }
            }
        } else {
            // 休息階段完成
            startPomodoroSession('focus');
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.success('🍅 休息結束！開始新的專注階段');
            }
        }
    }

    /**
     * 跳過當前階段
     */
    window.skipPomodoroPhase = function () {
        if (!pomodoroState.isActive) return;

        // 停止當前計時
        if (typeof window.timerRunning !== 'undefined' && window.timerRunning) {
            if (typeof window.startTimer === 'function') {
                window.startTimer(); // 這會切換暫停
            }
        }

        onPomodoroPhaseComplete();
    };

    /**
     * 播放番茄鐘音效
     */
    function playPomodoroSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 880;
            oscillator.type = 'sine';
            gainNode.gain.value = 0.3;

            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.3);

            setTimeout(() => {
                const osc2 = audioContext.createOscillator();
                osc2.connect(gainNode);
                osc2.frequency.value = 1100;
                osc2.type = 'sine';
                osc2.start();
                osc2.stop(audioContext.currentTime + 0.3);
            }, 200);
        } catch (e) {
            console.log('Audio not supported');
        }
    }

    /**
     * 更新全螢幕主題
     */
    function updateFullscreenPomodoroTheme() {
        const modal = document.getElementById('timerFullscreenModal');
        if (!modal) return;

        modal.classList.remove('pomodoro-focus', 'pomodoro-break');

        if (pomodoroState.isActive) {
            if (pomodoroState.mode === 'focus') {
                modal.classList.add('pomodoro-focus');
            } else {
                modal.classList.add('pomodoro-break');
            }
        }
    }

    // ==================== 初始化 ====================
    function init() {
        // 等待 DOM 和其他模組載入
        setTimeout(initPomodoroUI, 500);
        console.log('✅ 番茄鐘模組已載入');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
