/**
 * 深色模式切換模組
 * 提供全站主題切換功能
 */

(function () {
    'use strict';

    // === CSS 變數定義 ===
    const themeStyles = `
        /* 主題變數 */
        :root {
            --bg-primary: #ffffff;
            --bg-secondary: #f8fafc;
            --bg-tertiary: #f1f5f9;
            --bg-card: #ffffff;
            --bg-hover: #f1f5f9;
            --text-primary: #1e293b;
            --text-secondary: #64748b;
            --text-muted: #94a3b8;
            --border-color: #e2e8f0;
            --shadow-color: rgba(0, 0, 0, 0.1);
        }

        :root.dark {
            --bg-primary: #0f172a;
            --bg-secondary: #1e293b;
            --bg-tertiary: #334155;
            --bg-card: #1e293b;
            --bg-hover: #334155;
            --text-primary: #f1f5f9;
            --text-secondary: #cbd5e1;
            --text-muted: #94a3b8;
            --border-color: #334155;
            --shadow-color: rgba(0, 0, 0, 0.3);
        }

        /* 全域樣式覆寫 */
        .dark body {
            background-color: var(--bg-primary) !important;
            color: var(--text-primary) !important;
        }

        .dark .bg-white {
            background-color: var(--bg-card) !important;
        }

        .dark .bg-gray-50,
        .dark .bg-gray-100 {
            background-color: var(--bg-secondary) !important;
        }

        .dark .bg-gray-200 {
            background-color: var(--bg-tertiary) !important;
        }

        .dark .text-gray-800,
        .dark .text-gray-700,
        .dark .text-gray-900 {
            color: var(--text-primary) !important;
        }

        .dark .text-gray-600,
        .dark .text-gray-500 {
            color: var(--text-secondary) !important;
        }

        .dark .border-gray-200,
        .dark .border-gray-300 {
            border-color: var(--border-color) !important;
        }

        .dark .shadow-lg,
        .dark .shadow-md,
        .dark .shadow {
            box-shadow: 0 4px 20px var(--shadow-color) !important;
        }

        /* 導覽列深色 */
        .dark nav {
            background: linear-gradient(135deg, #1e3a5f 0%, #2d1b4e 100%) !important;
        }

        /* 區塊深色 */
        .dark .section {
            background-color: var(--bg-card) !important;
            border: 1px solid var(--border-color);
        }

        /* 輸入框深色 */
        .dark input,
        .dark select,
        .dark textarea {
            background-color: var(--bg-tertiary) !important;
            color: var(--text-primary) !important;
            border-color: var(--border-color) !important;
        }

        .dark input::placeholder,
        .dark textarea::placeholder {
            color: var(--text-muted) !important;
        }

        /* 按鈕調整 */
        .dark .bg-gray-200:hover {
            background-color: var(--bg-hover) !important;
        }

        /* 漸層背景調整 */
        .dark .bg-gradient-to-r {
            opacity: 0.9;
        }

        /* 學生卡片 */
        .dark .bg-blue-50,
        .dark .bg-green-50,
        .dark .bg-yellow-50,
        .dark .bg-red-50,
        .dark .bg-purple-50,
        .dark .bg-indigo-50,
        .dark .bg-pink-50,
        .dark .bg-teal-50,
        .dark .bg-cyan-50,
        .dark .bg-orange-50 {
            background-color: var(--bg-tertiary) !important;
        }

        /* 主題切換按鈕 */
        .theme-toggle-btn {
            background: rgba(255, 255, 255, 0.15);
            border: none;
            color: white;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.25rem;
            transition: all 0.3s ease;
        }

        .theme-toggle-btn:hover {
            background: rgba(255, 255, 255, 0.25);
            transform: scale(1.1);
        }

        /* 切換動畫 */
        @keyframes theme-switch {
            0% { transform: rotate(0deg) scale(1); }
            50% { transform: rotate(180deg) scale(0.8); }
            100% { transform: rotate(360deg) scale(1); }
        }

        .theme-toggle-btn.switching {
            animation: theme-switch 0.5s ease;
        }

        /* 過渡效果 */
        body,
        .section,
        .bg-white,
        input,
        select,
        textarea {
            transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
        }
    `;

    // 注入樣式
    function injectStyles() {
        if (document.getElementById('theme-toggle-styles')) return;

        const styleEl = document.createElement('style');
        styleEl.id = 'theme-toggle-styles';
        styleEl.textContent = themeStyles;
        document.head.appendChild(styleEl);
    }

    // 取得當前主題
    function getCurrentTheme() {
        return localStorage.getItem('theme') || 'light';
    }

    // 設定主題
    function setTheme(theme) {
        const root = document.documentElement;

        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }

        localStorage.setItem('theme', theme);
        updateToggleButton(theme);
    }

    // 切換主題
    function toggleTheme() {
        const currentTheme = getCurrentTheme();
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';

        // 播放動畫
        const btn = document.getElementById('themeToggleBtn');
        if (btn) {
            btn.classList.add('switching');
            setTimeout(() => btn.classList.remove('switching'), 500);
        }

        setTheme(newTheme);
    }

    // 更新按鈕圖示
    function updateToggleButton(theme) {
        const btn = document.getElementById('themeToggleBtn');
        if (!btn) return;

        btn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
        btn.title = theme === 'dark' ? '切換淺色模式' : '切換深色模式';
    }

    // 添加切換按鈕到導覽列
    function addToggleButton() {
        if (document.getElementById('themeToggleBtn')) return;

        const btn = document.createElement('button');
        btn.id = 'themeToggleBtn';
        btn.className = 'theme-toggle-btn';
        btn.innerHTML = getCurrentTheme() === 'dark' ? '☀️' : '🌙';
        btn.title = getCurrentTheme() === 'dark' ? '切換淺色模式' : '切換深色模式';
        btn.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            toggleTheme();
        };

        // 優先插入桌面版 slot
        const desktopSlot = document.getElementById('theme-toggle-slot');
        if (desktopSlot) {
            desktopSlot.appendChild(btn);

            // 手機版：複製一份小型按鈕
            const mobileSlot = document.getElementById('theme-toggle-slot-mobile');
            if (mobileSlot) {
                const btnM = btn.cloneNode(true);
                btnM.id = 'themeToggleBtnMobile';
                btnM.style.cssText = 'width:34px;height:34px;font-size:1rem;';
                btnM.onclick = function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleTheme();
                };
                mobileSlot.appendChild(btnM);
            }
        } else {
            // 後備：fixed 定位，但往左移避開頭像（頭像約佔 right:0~3rem）
            const wrapper = document.createElement('div');
            wrapper.id = 'themeToggleWrapper';
            wrapper.style.cssText = 'position:fixed;top:0.75rem;right:5rem;z-index:900;';
            wrapper.appendChild(btn);
            document.body.appendChild(wrapper);
        }
    }

    // 初始化
    function init() {
        injectStyles();

        // 載入已儲存的主題
        const savedTheme = getCurrentTheme();
        setTheme(savedTheme);

        // 添加切換按鈕
        if (document.readyState === 'complete') {
            addToggleButton();
        } else {
            window.addEventListener('load', addToggleButton);
        }

        // 監聽系統主題變化
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                if (!localStorage.getItem('theme')) {
                    setTheme(e.matches ? 'dark' : 'light');
                }
            });
        }

        // 將函數暴露到全域
        window.toggleTheme = toggleTheme;
        window.setTheme = setTheme;

        console.log('✅ 深色模式模組已載入');
    }

    // 當 DOM 載入完成後初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
