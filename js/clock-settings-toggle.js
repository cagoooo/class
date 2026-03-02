/**
 * clock-settings-toggle.js
 * 點擊時鐘畫面以切換設定面板的顯示/隱藏
 * 增強時鐘 UX：提供比 hover 更直覺的點擊互動
 */
(function () {
    'use strict';

    // ------- 內部狀態 -------
    let settingsVisible = false;

    // ------- 覆蓋 openBigClock，在開啟時初始化並重置狀態 -------
    function patchOpenBigClock() {
        const original = window.openBigClock;
        if (typeof original !== 'function') {
            setTimeout(patchOpenBigClock, 200);
            return;
        }

        window.openBigClock = async function (...args) {
            await original.apply(this, args);
            // 每次開啟時鐘，預設隱藏設定面板
            settingsVisible = false;
            applySettingsVisibility(false);
        };
    }

    // ------- 切換設定面板 -------
    function toggleClockSettings() {
        settingsVisible = !settingsVisible;
        applySettingsVisibility(settingsVisible);
    }

    // 讓全域可呼叫（供 HTML onclick 使用）
    window.toggleClockSettings = toggleClockSettings;

    // ------- 實際套用顯示/隱藏 -------
    function applySettingsVisibility(show) {
        const controls = document.getElementById('clock-controls');
        const hint = document.getElementById('clock-settings-hint');
        if (!controls) return;

        if (show) {
            controls.classList.remove('clock-settings-hidden');
            controls.classList.add('clock-settings-visible');
            if (hint) hint.classList.add('hint-active');
        } else {
            controls.classList.remove('clock-settings-visible');
            controls.classList.add('clock-settings-hidden');
            if (hint) hint.classList.remove('hint-active');
        }
    }

    // ------- 在 DOM 中插入所需樣式 -------
    function injectStyles() {
        const style = document.createElement('style');
        style.id = 'clock-settings-toggle-style';
        style.textContent = `
            /* 覆蓋原本 hover 觸發的隱藏行為，改為 class 控制 */
            #clock-modal:not(:hover) #clock-controls:not(:focus-within) {
                opacity: 1 !important;
                transform: none !important;
            }

            /* 設定面板 — 收起狀態 */
            #clock-controls.clock-settings-hidden {
                opacity: 0 !important;
                transform: translateY(100%) !important;
                pointer-events: none;
            }

            /* 設定面板 — 展開狀態 */
            #clock-controls.clock-settings-visible {
                opacity: 1 !important;
                transform: translateY(0) !important;
                pointer-events: auto;
            }

            /* 可點擊的時鐘主體 */
            #big-clock-container {
                cursor: pointer;
                user-select: none;
            }

            /* 點擊提示區塊 */
            #clock-settings-hint {
                position: fixed;
                bottom: 12px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 6px 14px;
                border-radius: 999px;
                background: rgba(0, 0, 0, 0.35);
                color: rgba(255,255,255,0.85);
                font-size: 13px;
                font-family: 'Noto Sans TC', sans-serif;
                pointer-events: none;
                transition: opacity 0.4s ease, transform 0.4s ease;
                opacity: 0.7;
                z-index: 110;
                backdrop-filter: blur(4px);
                animation: hintPulse 2.5s ease-in-out 0.8s 2;
            }

            /* 設定展開後提示圖示旋轉 */
            #clock-settings-hint.hint-active .hint-icon {
                transform: rotate(180deg);
            }

            #clock-settings-hint .hint-icon {
                display: inline-block;
                transition: transform 0.3s ease;
                font-size: 14px;
            }

            /* 深色模式時稍微提高提示的對比 */
            #clock-modal.dark #clock-settings-hint {
                background: rgba(255,255,255,0.18);
                color: rgba(255, 255, 255, 0.9);
            }

            @keyframes hintPulse {
                0%   { opacity: 0.7; }
                50%  { opacity: 1; transform: translateX(-50%) translateY(-3px); }
                100% { opacity: 0.7; }
            }
        `;
        document.head.appendChild(style);
    }

    // ------- 在時鐘 modal 中插入提示元素 -------
    function injectHintElement() {
        const modal = document.getElementById('clock-modal');
        if (!modal || document.getElementById('clock-settings-hint')) return;

        const hint = document.createElement('div');
        hint.id = 'clock-settings-hint';
        hint.innerHTML = '<span class="hint-icon">▲</span><span>點擊畫面切換設定</span>';
        modal.appendChild(hint);
    }

    // ------- 為時鐘容器綁定點擊事件 -------
    function bindClockClick() {
        const clockContainer = document.getElementById('big-clock-container');
        if (!clockContainer) {
            setTimeout(bindClockClick, 300);
            return;
        }

        // 移除原本阻止冒泡的 inline onclick（改為更精確的處理）
        // 將 toggleClockSettings 綁定在 big-clock-container 上
        clockContainer.addEventListener('click', function (e) {
            // 防止觸發外層 clock-modal 的 closeBigClock
            e.stopPropagation();
            toggleClockSettings();
        });
    }

    // ------- 初始化 -------
    function init() {
        injectStyles();

        // 等待 DOM 完全載入後再綁定
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () {
                bindClockClick();
                injectHintElement();
            });
        } else {
            bindClockClick();
            injectHintElement();
        }

        // 覆蓋 openBigClock
        patchOpenBigClock();

        // 當時鐘開啟時，重新注入 hint（避免 modal hidden 造成 hint 遺失）
        const originalOpen = window.openBigClock;
        if (typeof originalOpen === 'function') {
            const checkAndInject = function () {
                injectHintElement();
            };
            document.addEventListener('click', function (e) {
                // 任何觸發 openBigClock 的動作後，補充注入 hint
                setTimeout(checkAndInject, 200);
            }, { once: false, passive: true });
        }
    }

    init();
})();
