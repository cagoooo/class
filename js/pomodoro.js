/**
 * 番茄鐘模組
 * Pomodoro Timer Module
 *
 * 功能：
 * 1. 番茄鐘模式：專注／短休息／長休息，時間可在狀態列「⚙️ 時間設定」調整（預設 25／5／15 分鐘，每 4 個番茄長休息）
 * 2. 倒數結束自動進入下一階段（監聽 classnew.html timerFinished 發出的 'timer:finished' 事件）
 * 3. 提示文字一律用實際設定的分鐘數；關閉番茄鐘時把計時器還原成開啟前的設定
 *
 * 注意：timerRunning、timerMode 等是 classnew.html 的 let，不在 window 上，一律透過 window.getTimerState() 讀。
 */

(function () {
    'use strict';

    // ==================== 設定 ====================
    const SETTINGS_KEY = 'pomodoroSettings';
    const DEFAULTS = { focus: 25, short: 5, long: 15, rounds: 4 };
    const LIMITS = { focus: [1, 90], short: [1, 30], long: [1, 60], rounds: [2, 8] };
    let config = loadSettings();

    // 番茄鐘狀態
    const state = {
        active: false,
        mode: 'focus',      // 'focus' | 'shortBreak' | 'longBreak'
        done: 0,            // 這一輪已完成的番茄數
        saved: null,        // 開啟前的計時器設定，關閉時還原
        internal: false,    // 番茄鐘自己在操作計時器（不要被當成老師手動改設定）
        settingsOpen: false
    };
    let sharedAudio = null;

    function loadSettings() {
        try {
            const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
            const out = { ...DEFAULTS };
            Object.keys(DEFAULTS).forEach(k => {
                const v = Number(raw[k]);
                if (Number.isInteger(v) && v >= LIMITS[k][0] && v <= LIMITS[k][1]) out[k] = v;
            });
            return out;
        } catch (e) {
            return { ...DEFAULTS };
        }
    }
    function saveSettings() {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(config)); } catch (e) { /* 只是偏好設定 */ }
    }
    function minutesFor(mode) {
        return mode === 'shortBreak' ? config.short : mode === 'longBreak' ? config.long : config.focus;
    }
    function phaseName(mode) {
        return mode === 'focus' ? '專注' : mode === 'shortBreak' ? '短休息' : '長休息';
    }
    function labelFor(mode) {
        return mode === 'focus' ? '🎯 專注中' : mode === 'shortBreak' ? '☕ 短休息' : '🌴 長休息';
    }
    function notify(kind, message) {
        try {
            if (typeof NotificationSystem !== 'undefined') NotificationSystem[kind](message);
        } catch (e) { /* 提示失敗不影響計時 */ }
    }
    function timerState() {
        try {
            if (typeof window.getTimerState === 'function') return window.getTimerState();
        } catch (e) { /* 讀不到就用預設 */ }
        return { running: false, mode: 'countdown' };
    }
    const $ = id => document.getElementById(id);

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
            white-space: nowrap;
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
            gap: 0.75rem 1rem;
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
            font-weight: 700;
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
            font-size: 0.75rem;
            color: #6b7280;
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

        .pomodoro-skip-btn, .pomodoro-settings-btn {
            min-height: 34px;
            padding: 0.375rem 0.75rem;
            background: rgba(107, 114, 128, 0.1);
            border: 1px solid rgba(107, 114, 128, 0.2);
            border-radius: 0.375rem;
            font-size: 0.8rem;
            color: #4b5563;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .pomodoro-skip-btn:hover, .pomodoro-settings-btn:hover {
            background: rgba(107, 114, 128, 0.2);
        }

        .pomodoro-plan {
            flex-basis: 100%;
            font-size: 0.8rem;
            color: #6b7280;
        }

        .pomodoro-settings {
            flex-basis: 100%;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.5rem 0.75rem;
            padding-top: 0.5rem;
            border-top: 1px dashed rgba(107, 114, 128, 0.3);
            font-size: 0.875rem;
            color: #374151;
        }

        .pomodoro-settings label {
            display: flex;
            align-items: center;
            gap: 0.25rem;
            white-space: nowrap;
        }

        .pomodoro-settings input {
            width: 3.6rem;
            min-height: 34px;
            padding: 0.25rem;
            text-align: center;
            font-weight: 700;
            border: 1px solid #d1d5db;
            border-radius: 0.375rem;
        }

        .pomodoro-settings .pomodoro-apply {
            min-height: 34px;
            padding: 0.375rem 0.9rem;
            border: none;
            border-radius: 0.375rem;
            background: #ef4444;
            color: #fff;
            font-weight: 700;
            cursor: pointer;
        }

        .pomodoro-settings small {
            flex-basis: 100%;
            color: #6b7280;
        }

        .pomodoro-toggle:focus-visible, .pomodoro-skip-btn:focus-visible, .pomodoro-settings-btn:focus-visible,
        .pomodoro-settings input:focus-visible, .pomodoro-settings .pomodoro-apply:focus-visible {
            outline: 3px solid #fca5a5;
            outline-offset: 2px;
        }

        .dark .pomodoro-sessions, .dark .pomodoro-plan, .dark .pomodoro-settings small { color: #cbd5e1; }
        .dark .pomodoro-settings { color: #e2e8f0; }
        .dark .pomodoro-skip-btn, .dark .pomodoro-settings-btn { color: #e2e8f0; }

        /* 全螢幕番茄鐘模式 */
        .timer-fullscreen-modal.pomodoro-focus {
            background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #1a1a2e 100%) !important;
        }

        .timer-fullscreen-modal.pomodoro-break {
            background: linear-gradient(135deg, #064e3b 0%, #065f46 50%, #1a1a2e 100%) !important;
        }
    `;

    // ==================== 計時器操作（都經過既有函式） ====================
    function withInternal(fn) {
        state.internal = true;
        try { return fn(); } finally { state.internal = false; }
    }

    /** 把計時器設成這個階段的時間並開始倒數 */
    function runPhase(mode) {
        state.mode = mode;
        const minutes = minutesFor(mode);
        withInternal(() => {
            // 番茄鐘只在倒數模式下運作
            if (timerState().mode !== 'countdown' && typeof window.setTimerMode === 'function') window.setTimerMode('countdown');
            if (timerState().running && typeof window.stopTimer === 'function') window.stopTimer();
            const min = $('timerMinutes'), sec = $('timerSeconds'), title = $('timerTitle');
            if (min) min.value = minutes;
            if (sec) sec.value = 0;
            if (title) title.value = mode === 'focus' ? '🍅 專注時間' : mode === 'shortBreak' ? '☕ 休息時間' : '🌴 長休息時間';
            if (typeof window.resetTimer === 'function') window.resetTimer();
            if (!timerState().running && typeof window.startTimer === 'function') window.startTimer();
        });
        updateStatusBar();
        updateFullscreenTheme();
    }

    function saveTimerSettings() {
        const min = $('timerMinutes'), sec = $('timerSeconds'), title = $('timerTitle');
        return {
            mode: timerState().mode || 'countdown',
            minutes: min ? min.value : '5',
            seconds: sec ? sec.value : '0',
            title: title ? title.value : ''
        };
    }

    function restoreTimerSettings(saved) {
        withInternal(() => {
            if (timerState().running && typeof window.stopTimer === 'function') window.stopTimer();
            if (!saved) { if (typeof window.resetTimer === 'function') window.resetTimer(); return; }
            if (saved.mode === 'stopwatch' && typeof window.setTimerMode === 'function') {
                window.setTimerMode('stopwatch');
            } else {
                const min = $('timerMinutes'), sec = $('timerSeconds');
                if (min) min.value = saved.minutes;
                if (sec) sec.value = saved.seconds;
                if (typeof window.resetTimer === 'function') window.resetTimer();
            }
            const title = $('timerTitle');
            if (title) title.value = saved.title;
            const titleDisplay = $('timerTitleDisplay');
            if (titleDisplay) titleDisplay.textContent = '準備開始';
        });
    }

    // ==================== 開關 ====================
    function syncToggleButton() {
        const btn = $('pomodoro-toggle-btn');
        if (!btn) return;
        btn.classList.toggle('active', state.active);
        btn.innerHTML = state.active ? '🍅 番茄鐘 ON' : '🍅 番茄鐘';
        btn.setAttribute('aria-pressed', String(state.active));
        btn.title = state.active ? '關閉番茄鐘，計時器回到原本的設定' : `開始番茄鐘：專注 ${config.focus} 分鐘、休息 ${config.short} 分鐘`;
    }

    function start() {
        if (state.active) return;
        // 從其他頁按 p 開啟時，先切到計時器頁，老師才看得到
        const section = $('timer-section');
        if (section && section.classList.contains('hidden') && typeof window.showSection === 'function') window.showSection('timer');
        state.saved = saveTimerSettings();
        state.active = true;
        state.done = 0;
        showStatusBar();
        syncToggleButton();
        runPhase('focus');
        notify('success', `🍅 番茄鐘開始！專注 ${config.focus} 分鐘，接著休息 ${config.short} 分鐘`);
    }

    /** restore=false：老師改用一般計時（例如按了 5 分鐘、正數計時），不要蓋掉他剛選的設定 */
    function stop({ restore = true, message = '番茄鐘已關閉，計時器回到原本的設定' } = {}) {
        if (!state.active) return;
        state.active = false;
        state.mode = 'focus';
        state.done = 0;
        state.settingsOpen = false;
        const saved = state.saved;
        state.saved = null;
        if (restore) {
            restoreTimerSettings(saved);
        } else {
            const title = $('timerTitle');
            if (title && saved) withInternal(() => { title.value = saved.title; });
        }
        hideStatusBar();
        syncToggleButton();
        updateFullscreenTheme();
        if (message) notify('info', message);
    }

    window.togglePomodoroMode = function () {
        if (state.active) stop(); else start();
    };

    // ==================== 階段切換 ====================
    function onPhaseComplete(natural) {
        if (!state.active) return;
        if (state.mode === 'focus') {
            if (natural) {
                state.done += 1;
                playPomodoroSound();
            }
            if (natural && state.done >= config.rounds) {
                runPhase('longBreak');
                notify('success', `🎉 太棒了！完成 ${config.rounds} 個番茄，長休息 ${config.long} 分鐘`);
            } else {
                runPhase('shortBreak');
                notify('info', natural
                    ? `☕ 專注完成（第 ${state.done} 個番茄）！休息 ${config.short} 分鐘`
                    : `⏭️ 已跳過專注（不算番茄），休息 ${config.short} 分鐘`);
            }
        } else {
            if (state.mode === 'longBreak') state.done = 0;   // 長休息結束才開始新的一輪
            if (natural) playPomodoroSound();
            runPhase('focus');
            notify('success', natural
                ? `🍅 休息結束！開始專注 ${config.focus} 分鐘`
                : `⏭️ 已跳過休息，開始專注 ${config.focus} 分鐘`);
        }
    }

    window.skipPomodoroPhase = function () {
        if (!state.active) return;
        onPhaseComplete(false);
    };

    // ==================== 狀態列 ====================
    function showStatusBar() {
        if ($('pomodoro-status-bar')) { updateStatusBar(); return; }
        const timerSection = $('timer-section');
        if (!timerSection) return;
        const statusBar = document.createElement('div');
        statusBar.id = 'pomodoro-status-bar';
        statusBar.className = 'pomodoro-status focus';
        statusBar.setAttribute('role', 'status');
        const timerDisplay = timerSection.querySelector('.bg-gradient-to-r');
        if (timerDisplay) timerDisplay.parentNode.insertBefore(statusBar, timerDisplay.nextSibling);
        else timerSection.appendChild(statusBar);
        updateStatusBar();
    }

    function hideStatusBar() {
        const statusBar = $('pomodoro-status-bar');
        if (statusBar) statusBar.remove();
    }

    function updateStatusBar() {
        const statusBar = $('pomodoro-status-bar');
        if (!statusBar) return;
        const isBreak = state.mode !== 'focus';
        statusBar.className = `pomodoro-status ${isBreak ? 'break' : 'focus'}`;
        statusBar.replaceChildren();

        const badge = document.createElement('div');
        badge.className = `pomodoro-mode-badge ${isBreak ? 'break' : 'focus'}`;
        badge.textContent = `${labelFor(state.mode)}・${minutesFor(state.mode)} 分鐘`;

        const sessions = document.createElement('div');
        sessions.className = 'pomodoro-sessions';
        sessions.title = `這一輪完成 ${state.done}/${config.rounds} 個番茄`;
        for (let i = 0; i < config.rounds; i++) {
            const dot = document.createElement('div');
            dot.className = 'pomodoro-session-dot' + (i < state.done ? ' completed' : '');
            sessions.appendChild(dot);
        }
        const count = document.createElement('span');
        count.textContent = `${state.done}/${config.rounds}`;
        sessions.appendChild(count);

        const skip = document.createElement('button');
        skip.type = 'button';
        skip.className = 'pomodoro-skip-btn';
        skip.textContent = isBreak ? '⏭️ 跳過休息' : '⏭️ 跳過專注';
        skip.addEventListener('click', () => window.skipPomodoroPhase());

        const gear = document.createElement('button');
        gear.type = 'button';
        gear.className = 'pomodoro-settings-btn';
        gear.textContent = state.settingsOpen ? '✕ 收起設定' : '⚙️ 時間設定';
        gear.setAttribute('aria-expanded', String(state.settingsOpen));
        gear.addEventListener('click', () => { state.settingsOpen = !state.settingsOpen; updateStatusBar(); });

        const plan = document.createElement('div');
        plan.className = 'pomodoro-plan';
        plan.textContent = `專注 ${config.focus} 分 → 休息 ${config.short} 分，每 ${config.rounds} 個番茄長休息 ${config.long} 分`;

        statusBar.append(badge, sessions, skip, gear, plan);
        if (state.settingsOpen) statusBar.appendChild(buildSettings());
    }

    function buildSettings() {
        const box = document.createElement('div');
        box.className = 'pomodoro-settings';
        const fields = {};
        const field = (key, text, unit) => {
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'number';
            input.inputMode = 'numeric';
            input.min = LIMITS[key][0];
            input.max = LIMITS[key][1];
            input.value = config[key];
            input.setAttribute('aria-label', text);
            fields[key] = input;
            label.append(text, input, unit);
            return label;
        };
        const apply = document.createElement('button');
        apply.type = 'button';
        apply.className = 'pomodoro-apply';
        apply.textContent = '套用';
        apply.addEventListener('click', () => {
            const next = {};
            for (const key of Object.keys(DEFAULTS)) {
                const v = Number(fields[key].value);
                if (!Number.isInteger(v) || v < LIMITS[key][0] || v > LIMITS[key][1]) {
                    fields[key].focus();
                    notify('warning', `請填 ${LIMITS[key][0]}～${LIMITS[key][1]} 的整數`);
                    return;
                }
                next[key] = v;
            }
            config = next;
            saveSettings();
            if (state.done > config.rounds) state.done = config.rounds;
            state.settingsOpen = false;
            syncToggleButton();
            // 目前階段立刻改用新的時間重新開始
            if (state.active) runPhase(state.mode);
            notify('success', state.active ? `已套用：${phaseName(state.mode)}改為 ${minutesFor(state.mode)} 分鐘，重新開始計時` : '已套用新的番茄鐘時間');
        });
        const note = document.createElement('small');
        note.textContent = '按「套用」後，目前這個階段會用新的時間重新開始。設定存在這台電腦。';
        box.append(field('focus', '專注', '分'), field('short', '短休息', '分'), field('long', '長休息', '分'), field('rounds', '每', '個番茄長休息'), apply, note);
        box.querySelectorAll('input').forEach(input => input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); apply.click(); } }));
        return box;
    }

    // ==================== 音效（沿用頁面已解鎖的 AudioContext，不要每次新建） ====================
    function playPomodoroSound() {
        try {
            let ctx = (typeof audioContext !== 'undefined' && audioContext) ? audioContext : null;
            if (!ctx) {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                if (!Ctx) return;
                sharedAudio = sharedAudio || new Ctx();
                ctx = sharedAudio;
            }
            if (ctx.state === 'suspended') ctx.resume();
            const now = ctx.currentTime;
            [[880, 0], [1100, 0.22]].forEach(([freq, at]) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + at);
                gain.gain.setValueAtTime(0.3, now + at);
                gain.gain.exponentialRampToValueAtTime(0.001, now + at + 0.3);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + at);
                osc.stop(now + at + 0.32);
            });
        } catch (e) {
            console.log('Audio not supported');
        }
    }

    // ==================== 全螢幕主題 ====================
    function updateFullscreenTheme() {
        const modal = $('timerFullscreenModal');
        if (!modal) return;
        modal.classList.remove('pomodoro-focus', 'pomodoro-break');
        if (state.active) modal.classList.add(state.mode === 'focus' ? 'pomodoro-focus' : 'pomodoro-break');
    }

    // ==================== 初始化 ====================
    function initPomodoroUI() {
        if (!$('pomodoro-styles')) {
            const style = document.createElement('style');
            style.id = 'pomodoro-styles';
            style.textContent = pomodoroStyles;
            document.head.appendChild(style);
        }
        const timerSection = $('timer-section');
        if (!timerSection || $('pomodoro-toggle-btn')) return;
        const timerControls = timerSection.querySelector('.flex.gap-2');
        if (timerControls) {
            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.id = 'pomodoro-toggle-btn';
            toggleBtn.className = 'pomodoro-toggle';
            toggleBtn.addEventListener('click', () => window.togglePomodoroMode());
            timerControls.appendChild(toggleBtn);
            syncToggleButton();
        }
    }

    // 老師自己切到正數計時或按快速計時（5／10／15 分鐘）＝改用一般計時，自動關閉番茄鐘
    function wrapTimerControls() {
        ['setTimerMode', 'setQuickTimer'].forEach(name => {
            const original = window[name];
            if (typeof original !== 'function' || original.__pomodoroWrapped) return;
            const wrapped = function () {
                if (state.active && !state.internal) {
                    stop({ restore: false, message: name === 'setTimerMode' ? '已切換計時方式，番茄鐘已關閉' : '已改用一般倒數，番茄鐘已關閉' });
                }
                return original.apply(this, arguments);
            };
            wrapped.__pomodoroWrapped = true;
            window[name] = wrapped;
        });
    }

    function init() {
        wrapTimerControls();
        window.addEventListener('timer:finished', () => onPhaseComplete(true));
        // 等待 DOM 和其他模組載入
        setTimeout(initPomodoroUI, 500);
        window.PomodoroUI = { isActive: () => state.active, settings: () => ({ ...config }), mode: () => state.mode, done: () => state.done };
        console.log('✅ 番茄鐘模組已載入');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
