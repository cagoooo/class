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
        .dark .bg-gray-100,
        .dark .bg-slate-50,
        .dark .bg-slate-100,
        .dark .bg-zinc-50,
        .dark .bg-zinc-100,
        .dark .bg-stone-50,
        .dark .bg-stone-100,
        .dark .bg-neutral-50,
        .dark .bg-neutral-100 {
            background-color: var(--bg-secondary) !important;
        }

        .dark .bg-gray-200,
        .dark .bg-slate-200,
        .dark .bg-zinc-200,
        .dark .bg-stone-200,
        .dark .bg-neutral-200 {
            background-color: var(--bg-tertiary) !important;
        }

        .dark .text-gray-800,
        .dark .text-gray-700,
        .dark .text-gray-900,
        .dark .text-slate-800,
        .dark .text-slate-700,
        .dark .text-slate-900,
        .dark .text-zinc-800,
        .dark .text-zinc-700,
        .dark .text-zinc-900,
        .dark .text-stone-800,
        .dark .text-stone-700,
        .dark .text-stone-900,
        .dark .text-neutral-800,
        .dark .text-neutral-700,
        .dark .text-neutral-900 {
            color: var(--text-primary) !important;
        }

        .dark .text-gray-600,
        .dark .text-gray-500,
        .dark .text-slate-600,
        .dark .text-slate-500,
        .dark .text-zinc-600,
        .dark .text-zinc-500,
        .dark .text-stone-600,
        .dark .text-stone-500,
        .dark .text-neutral-600,
        .dark .text-neutral-500 {
            color: var(--text-secondary) !important;
        }

        .dark .border-gray-200,
        .dark .border-gray-300,
        .dark .border-slate-200,
        .dark .border-slate-300,
        .dark .border-zinc-200,
        .dark .border-zinc-300 {
            border-color: var(--border-color) !important;
        }

        .dark .shadow-lg,
        .dark .shadow-md,
        .dark .shadow {
            box-shadow: 0 4px 20px var(--shadow-color) !important;
        }

        /* 常用彩色文字在深色背景下的高對比度覆寫 */
        .dark .text-blue-600,
        .dark .text-blue-700,
        .dark .text-blue-800 {
            color: #93c5fd !important; /* text-blue-300 */
        }
        .dark .text-green-600,
        .dark .text-green-700,
        .dark .text-green-800 {
            color: #86efac !important; /* text-green-300 */
        }
        .dark .text-indigo-600,
        .dark .text-indigo-700,
        .dark .text-indigo-800 {
            color: #c7d2fe !important; /* text-indigo-300 */
        }
        .dark .text-purple-600,
        .dark .text-purple-700,
        .dark .text-purple-800 {
            color: #e9d5ff !important; /* text-purple-300 */
        }
        .dark .text-pink-500,
        .dark .text-pink-600,
        .dark .text-pink-700,
        .dark .text-pink-800 {
            color: #fbcfe8 !important; /* text-pink-300 */
        }
        .dark .text-yellow-600,
        .dark .text-yellow-700,
        .dark .text-yellow-800 {
            color: #fef08a !important; /* text-yellow-300 */
        }
        .dark .text-orange-700,
        .dark .text-orange-800 {
            color: #fed7aa !important; /* text-orange-300 */
        }
        .dark .text-teal-600,
        .dark .text-teal-700,
        .dark .text-teal-800 {
            color: #5eead4 !important; /* text-teal-300 */
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

        /* 按鈕調整與 Hover */
        .dark .bg-gray-200:hover,
        .dark .bg-slate-200:hover,
        .dark .bg-zinc-200:hover,
        .dark .bg-stone-200:hover,
        .dark .bg-neutral-200:hover,
        .dark .hover\:bg-gray-300:hover,
        .dark .hover\:bg-slate-300:hover {
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

        /* 標籤元件背景深色化 (與 bg-*-100 類別保持一致) */
        .dark .bg-blue-100 { background-color: rgba(59, 130, 246, 0.15) !important; }
        .dark .bg-green-100 { background-color: rgba(16, 185, 129, 0.15) !important; }
        .dark .bg-yellow-100 { background-color: rgba(251, 191, 36, 0.15) !important; }
        .dark .bg-red-100 { background-color: rgba(239, 68, 68, 0.15) !important; }
        .dark .bg-purple-100 { background-color: rgba(139, 92, 246, 0.15) !important; }
        .dark .bg-indigo-100 { background-color: rgba(99, 102, 241, 0.15) !important; }
        .dark .bg-pink-100 { background-color: rgba(236, 72, 153, 0.15) !important; }
        .dark .bg-orange-100 { background-color: rgba(249, 115, 22, 0.15) !important; }

        /* 搜尋關鍵字標記 (mark) 深色模式 */
        .dark mark {
            background-color: rgba(251, 191, 36, 0.3) !important;
            color: #fef08a !important;
        }

        /* 排行榜深色模式適配 */
        .dark .leaderboard-container {
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%) !important;
            color: var(--text-primary) !important;
            border: 1px solid var(--border-color);
        }
        .dark .leaderboard-item.rank-other {
            background: #1e293b !important;
            border-color: #334155 !important;
        }
        .dark .leaderboard-student-name {
            color: var(--text-primary) !important;
        }
        .dark .leaderboard-rank-number {
            color: var(--text-muted) !important;
        }
        .dark .leaderboard-score-bar-container {
            background: #334155 !important;
        }
        .dark .leaderboard-footer {
            background: #0f172a !important;
        }
        .dark .leaderboard-item.rank-1 {
            background: linear-gradient(135deg, #78350f 0%, #451a03 100%) !important;
            border-color: #f59e0b !important;
        }
        .dark .leaderboard-item.rank-2 {
            background: linear-gradient(135deg, #334155 0%, #1e293b 100%) !important;
            border-color: #94a3b8 !important;
        }
        .dark .leaderboard-item.rank-3 {
            background: linear-gradient(135deg, #7c2d12 0%, #431407 100%) !important;
            border-color: #ea580c !important;
        }
        .dark .leaderboard-score.positive {
            color: #34d399 !important;
        }
        .dark .leaderboard-score.negative {
            color: #f87171 !important;
        }
        .dark .leaderboard-empty {
            color: var(--text-muted) !important;
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
