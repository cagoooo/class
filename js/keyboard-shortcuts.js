/**
 * 鍵盤快捷鍵模組
 * Keyboard Shortcuts Module
 * 
 * 提供全站快捷鍵操作
 */

(function () {
    'use strict';

    // ==================== 快捷鍵配置 ====================
    const SHORTCUTS = {
        // 功能切換
        '1': { action: 'showSection', args: ['student-section'], desc: '學生管理', icon: '📋' },
        '2': { action: 'showSection', args: ['points-section'], desc: '加扣分', icon: '⭐' },
        '3': { action: 'showSection', args: ['timer-section'], desc: '計時器', icon: '⏰' },
        '4': { action: 'showSection', args: ['lottery-section'], desc: '抽籤', icon: '🎲' },
        '5': { action: 'showSection', args: ['group-section'], desc: '分組', icon: '🧩' },
        '6': { action: 'showSection', args: ['homework-section'], desc: '作業檢查', icon: '✅' },
        '7': { action: 'showSection', args: ['notebook-section'], desc: '聯絡簿', icon: '📝' },

        // 計時器控制
        'Space': { action: 'toggleTimer', desc: '開始/暫停計時', icon: '▶️' },
        'r': { action: 'resetTimer', desc: '重置計時器', icon: '🔄' },
        'f': { action: 'toggleFullscreen', desc: '全螢幕計時器', icon: '⤢' },
        'p': { action: 'togglePomodoro', desc: '番茄鐘模式', icon: '🍅' },

        // 抽籤
        'l': { action: 'startLottery', desc: '開始抽籤', icon: '🎰' },

        // 其他
        'd': { action: 'toggleDarkMode', desc: '深色模式', icon: '🌙' },
        '?': { action: 'showHelp', desc: '顯示快捷鍵說明', icon: '❓' },
        'Escape': { action: 'closeModal', desc: '關閉彈窗', icon: '✕' },
    };

    // ==================== CSS 樣式 ====================
    const shortcutStyles = `
        /* 快捷鍵說明 Modal */
        .shortcuts-modal {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 200;
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
        }

        .shortcuts-modal.active {
            opacity: 1;
            visibility: visible;
        }

        .shortcuts-content {
            background: white;
            border-radius: 1rem;
            padding: 1.5rem;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
            from {
                transform: translateY(20px);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }

        .shortcuts-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
            padding-bottom: 0.75rem;
            border-bottom: 1px solid #e5e7eb;
        }

        .shortcuts-title {
            font-size: 1.25rem;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .shortcuts-close {
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            color: #6b7280;
            transition: color 0.2s;
        }

        .shortcuts-close:hover {
            color: #1f2937;
        }

        .shortcuts-section {
            margin-bottom: 1rem;
        }

        .shortcuts-section-title {
            font-size: 0.875rem;
            font-weight: 600;
            color: #6b7280;
            margin-bottom: 0.5rem;
            text-transform: uppercase;
        }

        .shortcuts-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 0.5rem;
        }

        .shortcut-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem;
            background: #f9fafb;
            border-radius: 0.375rem;
        }

        .shortcut-key {
            background: linear-gradient(180deg, #f3f4f6 0%, #e5e7eb 100%);
            border: 1px solid #d1d5db;
            border-radius: 0.25rem;
            padding: 0.25rem 0.5rem;
            font-family: monospace;
            font-size: 0.75rem;
            font-weight: 600;
            min-width: 2rem;
            text-align: center;
            box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }

        .shortcut-icon {
            font-size: 1rem;
        }

        .shortcut-desc {
            font-size: 0.875rem;
            color: #374151;
        }

        /* 快捷鍵提示氣泡 */
        .shortcut-hint {
            position: fixed;
            bottom: 1rem;
            right: 1rem;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            font-size: 0.875rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            opacity: 0;
            transform: translateY(10px);
            transition: all 0.3s ease;
            z-index: 100;
        }

        .shortcut-hint.show {
            opacity: 1;
            transform: translateY(0);
        }

        /* 快捷鍵提示按鈕 */
        .shortcuts-help-btn {
            position: fixed;
            bottom: 1rem;
            left: 1rem;
            background: rgba(99, 102, 241, 0.9);
            color: white;
            border: none;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            font-size: 1rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            z-index: 50;
        }

        .shortcuts-help-btn:hover {
            transform: scale(1.1);
            background: rgba(99, 102, 241, 1);
        }

        @media (max-width: 640px) {
            .shortcuts-help-btn {
                display: none;
            }
        }
    `;

    // ==================== 功能函數 ====================

    /**
     * 執行快捷鍵動作
     */
    function executeAction(action, args = []) {
        switch (action) {
            case 'showSection':
                if (typeof window.showSection === 'function') {
                    window.showSection(args[0]);
                }
                break;

            case 'toggleTimer':
                if (typeof window.startTimer === 'function') {
                    window.startTimer();
                }
                break;

            case 'resetTimer':
                if (typeof window.resetTimer === 'function') {
                    window.resetTimer();
                }
                break;

            case 'toggleFullscreen':
                if (typeof window.openTimerFullscreen === 'function') {
                    window.openTimerFullscreen();
                }
                break;

            case 'togglePomodoro':
                if (typeof window.togglePomodoroMode === 'function') {
                    window.togglePomodoroMode();
                }
                break;

            case 'startLottery':
                if (typeof window.startLottery === 'function') {
                    window.showSection?.('lottery-section');
                    setTimeout(() => window.startLottery(), 300);
                }
                break;

            case 'toggleDarkMode':
                if (typeof window.toggleTheme === 'function') {
                    window.toggleTheme();
                }
                break;

            case 'showHelp':
                showShortcutsModal();
                break;

            case 'closeModal':
                closeAllModals();
                break;
        }
    }

    /**
     * 顯示快捷鍵說明
     */
    function showShortcutsModal() {
        let modal = document.getElementById('shortcuts-modal');

        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'shortcuts-modal';
            modal.className = 'shortcuts-modal';
            modal.onclick = (e) => { if (e.target === modal) hideShortcutsModal(); };

            modal.innerHTML = `
                <div class="shortcuts-content">
                    <div class="shortcuts-header">
                        <div class="shortcuts-title">
                            ⌨️ 鍵盤快捷鍵
                        </div>
                        <button class="shortcuts-close" onclick="hideShortcutsModal()">✕</button>
                    </div>
                    
                    <div class="shortcuts-section">
                        <div class="shortcuts-section-title">功能切換</div>
                        <div class="shortcuts-list">
                            ${['1', '2', '3', '4', '5', '6', '7'].map(key => createShortcutItem(key)).join('')}
                        </div>
                    </div>

                    <div class="shortcuts-section">
                        <div class="shortcuts-section-title">計時器控制</div>
                        <div class="shortcuts-list">
                            ${['Space', 'r', 'f', 'p'].map(key => createShortcutItem(key)).join('')}
                        </div>
                    </div>

                    <div class="shortcuts-section">
                        <div class="shortcuts-section-title">其他</div>
                        <div class="shortcuts-list">
                            ${['l', 'd', '?', 'Escape'].map(key => createShortcutItem(key)).join('')}
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
        }

        modal.classList.add('active');
    }

    /**
     * 建立快捷鍵項目 HTML
     */
    function createShortcutItem(key) {
        const shortcut = SHORTCUTS[key];
        if (!shortcut) return '';

        const displayKey = key === 'Space' ? '空白鍵' : key;
        return `
            <div class="shortcut-item">
                <span class="shortcut-key">${displayKey}</span>
                <span class="shortcut-icon">${shortcut.icon}</span>
                <span class="shortcut-desc">${shortcut.desc}</span>
            </div>
        `;
    }

    /**
     * 隱藏快捷鍵說明
     */
    window.hideShortcutsModal = function () {
        const modal = document.getElementById('shortcuts-modal');
        if (modal) {
            modal.classList.remove('active');
        }
    };

    /**
     * 關閉所有 Modal
     */
    function closeAllModals() {
        // 關閉快捷鍵說明
        hideShortcutsModal();

        // 關閉全螢幕計時器
        if (typeof window.closeTimerFullscreen === 'function') {
            window.closeTimerFullscreen();
        }

        // 關閉時鐘
        const clockModal = document.getElementById('clock-modal');
        if (clockModal && clockModal.style.display !== 'none') {
            if (typeof window.closeBigClock === 'function') {
                window.closeBigClock();
            }
        }

        // 關閉其他可能的 Modal
        document.querySelectorAll('.fixed.inset-0').forEach(el => {
            if (el.id !== 'shortcuts-modal') {
                el.remove();
            }
        });
    }

    /**
     * 顯示快捷鍵執行提示
     */
    function showShortcutHint(shortcut) {
        let hint = document.getElementById('shortcut-hint');

        if (!hint) {
            hint = document.createElement('div');
            hint.id = 'shortcut-hint';
            hint.className = 'shortcut-hint';
            document.body.appendChild(hint);
        }

        hint.innerHTML = `
            <span>${shortcut.icon}</span>
            <span>${shortcut.desc}</span>
        `;
        hint.classList.add('show');

        setTimeout(() => hint.classList.remove('show'), 1500);
    }

    /**
     * 鍵盤事件處理
     */
    function handleKeyDown(e) {
        // 忽略在輸入框內的按鍵
        if (e.target.matches('input, textarea, select, [contenteditable]')) {
            // 只處理 Escape
            if (e.key === 'Escape') {
                closeAllModals();
            }
            return;
        }

        // 忽略有修飾鍵的組合（Ctrl, Alt, Meta）
        if (e.ctrlKey || e.altKey || e.metaKey) {
            return;
        }

        // 取得按鍵
        let key = e.key;
        if (key === ' ') key = 'Space';

        // 檢查是否有對應的快捷鍵
        const shortcut = SHORTCUTS[key];
        if (shortcut) {
            e.preventDefault();
            executeAction(shortcut.action, shortcut.args);

            // 顯示提示（除了顯示說明本身）
            if (shortcut.action !== 'showHelp' && shortcut.action !== 'closeModal') {
                showShortcutHint(shortcut);
            }
        }
    }

    /**
     * 添加快捷鍵提示按鈕
     */
    function addHelpButton() {
        if (document.getElementById('shortcuts-help-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'shortcuts-help-btn';
        btn.className = 'shortcuts-help-btn';
        btn.innerHTML = '?';
        btn.title = '快捷鍵說明 (按 ? 鍵)';
        btn.onclick = showShortcutsModal;

        document.body.appendChild(btn);
    }

    // ==================== 初始化 ====================
    function init() {
        // 注入樣式
        if (!document.getElementById('shortcuts-styles')) {
            const style = document.createElement('style');
            style.id = 'shortcuts-styles';
            style.textContent = shortcutStyles;
            document.head.appendChild(style);
        }

        // 綁定鍵盤事件
        document.addEventListener('keydown', handleKeyDown);

        // 添加說明按鈕
        addHelpButton();

        console.log('✅ 鍵盤快捷鍵模組已載入（按 ? 查看說明）');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
