/**
 * 手勢操作支援模組
 * Gesture Handler Module
 *
 * 功能：
 * - 觸控左右滑動切換功能區（對應 showSection + 功能選單順序）
 * - 長按學生卡片顯示快捷動作選單
 * - 雙指捏合/放大：保留系統預設（不攔截）
 *
 * 依賴：
 * - window.showSection()（classnew.html 主邏輯）
 * - navigation-enhancement.js（可選，已套用平滑滾動）
 *
 * v1.0.0  2026-03-03
 */

(function () {
    'use strict';

    // ==================== 設定 ====================

    /** 功能區順序（對應 showSection 的 sectionName 參數） */
    const SECTIONS = [
        'students',
        'points',
        'grouping',
        'lottery',
        'timer',
        'notebook',
        'homework',
        'exam'
    ];

    const CONFIG = {
        swipeThreshold: 60,      // px：觸發滑動切換的最小水平位移
        swipeMaxV: 100,          // px：允許的最大垂直位移（避免誤觸）
        longPressDelay: 550,     // ms：長按觸發時間
        longPressMaxMove: 12,    // px：長按期間允許的最大移動距離（超過即取消）
        toastDuration: 1500,     // ms：提示訊息顯示時長
    };

    // ==================== 狀態管理 ====================

    /** 取得目前顯示的功能區名稱 */
    function getCurrentSection() {
        for (const name of SECTIONS) {
            const el = document.getElementById(name + '-section');
            if (el && !el.classList.contains('hidden') && el.offsetParent !== null) {
                return name;
            }
        }
        return null;
    }

    /** 切換到下一個功能區 */
    function showNextSection() {
        const cur = getCurrentSection();
        const idx = SECTIONS.indexOf(cur);
        if (idx === -1 || idx >= SECTIONS.length - 1) return false;
        window.showSection?.(SECTIONS[idx + 1]);
        showGestureToast(`→ ${getSectionLabel(SECTIONS[idx + 1])}`);
        return true;
    }

    /** 切換到前一個功能區 */
    function showPrevSection() {
        const cur = getCurrentSection();
        const idx = SECTIONS.indexOf(cur);
        if (idx <= 0) return false;
        window.showSection?.(SECTIONS[idx - 1]);
        showGestureToast(`← ${getSectionLabel(SECTIONS[idx - 1])}`);
        return true;
    }

    /** 取得功能區中文標籤 */
    function getSectionLabel(name) {
        const LABELS = {
            students: '學生管理',
            points: '加扣分',
            grouping: '隨機分組',
            lottery: '抽籤系統',
            timer: '計時器',
            notebook: '聯絡簿',
            homework: '作業檢查',
            exam: '考試監考',
        };
        return LABELS[name] || name;
    }

    // ==================== Toast 提示 ====================

    let _toastTimer = null;

    /** 顯示手勢操作提示 */
    function showGestureToast(msg) {
        let toast = document.getElementById('gesture-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'gesture-toast';
            toast.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0.85);
                background: rgba(30, 41, 59, 0.88);
                color: white;
                padding: 0.6rem 1.4rem;
                border-radius: 2rem;
                font-size: 1rem;
                font-weight: 600;
                letter-spacing: 0.03em;
                pointer-events: none;
                z-index: 19999;
                opacity: 0;
                transition: opacity 0.2s ease, transform 0.2s ease;
                backdrop-filter: blur(6px);
                white-space: nowrap;
            `;
            document.body.appendChild(toast);
        }

        clearTimeout(_toastTimer);
        toast.textContent = msg;
        // 觸發過渡
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translate(-50%, -50%) scale(1)';
        });

        _toastTimer = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, -50%) scale(0.85)';
        }, CONFIG.toastDuration);
    }

    // ==================== 滑動手勢：切換功能區 ====================

    /**
     * GestureHandler 類別
     * 監聽指定元素的觸控事件，辨識滑動和長按
     */
    class GestureHandler {
        constructor(element, options = {}) {
            this.element = element;
            this.options = {
                swipeThreshold: CONFIG.swipeThreshold,
                longPressDelay: CONFIG.longPressDelay,
                ...options
            };
            this._startX = 0;
            this._startY = 0;
            this._longPressTimer = null;
            this._moved = false;
            this._bindEvents();
        }

        _bindEvents() {
            this.element.addEventListener('touchstart', this._onStart.bind(this), { passive: true });
            this.element.addEventListener('touchmove', this._onMove.bind(this), { passive: true });
            this.element.addEventListener('touchend', this._onEnd.bind(this), { passive: false });
            this.element.addEventListener('touchcancel', this._onCancel.bind(this), { passive: true });
        }

        _onStart(e) {
            this._startX = e.touches[0].clientX;
            this._startY = e.touches[0].clientY;
            this._moved = false;

            this._longPressTimer = setTimeout(() => {
                if (!this._moved) {
                    this.options.onLongPress?.(e);
                }
            }, this.options.longPressDelay);
        }

        _onMove(e) {
            const dx = Math.abs(e.touches[0].clientX - this._startX);
            const dy = Math.abs(e.touches[0].clientY - this._startY);
            if (dx > CONFIG.longPressMaxMove || dy > CONFIG.longPressMaxMove) {
                this._moved = true;
                clearTimeout(this._longPressTimer);
            }
        }

        _onEnd(e) {
            clearTimeout(this._longPressTimer);
            if (!this._moved) return; // 長按已處理 / 點擊，不算滑動

            const dx = e.changedTouches[0].clientX - this._startX;
            const dy = e.changedTouches[0].clientY - this._startY;

            // 判斷水平滑動（垂直位移不超過閾值）
            if (Math.abs(dx) >= this.options.swipeThreshold &&
                Math.abs(dy) <= CONFIG.swipeMaxV) {
                if (dx > 0) {
                    this.options.onSwipeRight?.(e);
                } else {
                    this.options.onSwipeLeft?.(e);
                }
            }

            // 判斷垂直滑動（可選）
            if (Math.abs(dy) >= this.options.swipeThreshold &&
                Math.abs(dx) <= CONFIG.swipeMaxV) {
                if (dy > 0) {
                    this.options.onSwipeDown?.(e);
                } else {
                    this.options.onSwipeUp?.(e);
                }
            }
        }

        _onCancel() {
            clearTimeout(this._longPressTimer);
            this._moved = false;
        }

        /** 手動銷毀，移除事件監聽 */
        destroy() {
            this.element.removeEventListener('touchstart', this._onStart);
            this.element.removeEventListener('touchmove', this._onMove);
            this.element.removeEventListener('touchend', this._onEnd);
            this.element.removeEventListener('touchcancel', this._onCancel);
        }
    }

    // 全域匯出（讓其他模組可以使用）
    window.GestureHandler = GestureHandler;

    // ==================== 應用：主內容區域滑動切換 ====================

    function initContentSwipe() {
        // 監聽整個 body（排除特殊元件）的橫向滑動
        // 使用一個透明覆蓋層避免干擾現有點擊事件
        const contentArea = document.querySelector('.max-w-7xl') || document.body;

        new GestureHandler(contentArea, {
            swipeThreshold: CONFIG.swipeThreshold,

            onSwipeLeft(e) {
                // 確認目標不是滑動式橫向捲動容器
                if (_isScrollableContainer(e.target)) return;
                showNextSection();
            },

            onSwipeRight(e) {
                if (_isScrollableContainer(e.target)) return;
                showPrevSection();
            }
        });
    }

    /**
     * 檢查目標元素或其祖先是否為橫向可滾動容器
     * （避免干擾橫向滑動的列表、考試監考科目等）
     */
    function _isScrollableContainer(el) {
        let node = el;
        for (let i = 0; i < 6 && node && node !== document.body; i++) {
            const style = getComputedStyle(node);
            if ((style.overflowX === 'auto' || style.overflowX === 'scroll') &&
                node.scrollWidth > node.clientWidth + 5) {
                return true;
            }
            node = node.parentElement;
        }
        return false;
    }

    // ==================== 應用：學生卡片長按快捷選單 ====================

    /** 長按學生卡片顯示快捷操作選單 */
    function initStudentCardLongPress() {
        // 使用事件委派，監聽動態新增的學生卡片
        const studentsSection = document.getElementById('students-section') || document.body;

        studentsSection.addEventListener('touchstart', (e) => {
            const card = e.target.closest('.student-card, [data-student-id]');
            if (!card) return;

            let moved = false;
            let timer = null;

            const onMove = () => { moved = true; clearTimeout(timer); };
            const onEnd = () => {
                clearTimeout(timer);
                card.removeEventListener('touchmove', onMove);
                card.removeEventListener('touchend', onEnd);
            };

            card.addEventListener('touchmove', onMove, { passive: true });
            card.addEventListener('touchend', onEnd, { passive: true });

            timer = setTimeout(() => {
                if (!moved) {
                    const studentId = card.dataset.studentId ||
                        card.getAttribute('data-student-id');
                    if (studentId) showStudentQuickMenu(studentId, card);
                }
            }, CONFIG.longPressDelay);
        }, { passive: true });
    }

    /** 顯示學生快捷選單 */
    function showStudentQuickMenu(studentId, anchorEl) {
        // 若已有選單，先移除
        document.getElementById('gesture-student-menu')?.remove();

        // 安全取得學生資料
        const student = (window.AppState?.students || window.students || [])
            .find(s => String(s.id) === String(studentId));
        if (!student) return;

        const menu = document.createElement('div');
        menu.id = 'gesture-student-menu';

        const rect = anchorEl.getBoundingClientRect();
        const menuTop = Math.min(rect.bottom + 8, window.innerHeight - 210);
        const menuLeft = Math.max(8, Math.min(rect.left, window.innerWidth - 208));

        menu.style.cssText = `
            position: fixed;
            top: ${menuTop}px;
            left: ${menuLeft}px;
            background: white;
            border-radius: 1rem;
            box-shadow: 0 8px 30px rgba(0,0,0,0.18);
            z-index: 9998;
            overflow: hidden;
            min-width: 200px;
            animation: gestureMenuIn 0.2s cubic-bezier(0.34,1.56,0.64,1);
        `;

        const actions = [
            { icon: '⭐', label: `加 1 分給 ${student.name}`, action: () => _quickAddScore(studentId, 1) },
            { icon: '➕', label: '加 2 分', action: () => _quickAddScore(studentId, 2) },
            { icon: '➖', label: '扣 1 分', action: () => _quickAddScore(studentId, -1) },
            {
                icon: '👤', label: '查看資料', action: () => {
                    window.showSection?.('students');
                    showGestureToast(`切至 ${student.name} 的資料`);
                }
            },
        ];

        menu.innerHTML = `
            <div style="padding:0.6rem 1rem;background:#3b82f6;color:white;font-weight:700;font-size:0.9rem;">
                ✋ ${student.name}
            </div>
            ${actions.map((a, i) => `
                <button data-idx="${i}" style="
                    display:block;width:100%;text-align:left;
                    padding:0.65rem 1rem;font-size:0.9rem;
                    background:white;border:none;cursor:pointer;
                    border-top:1px solid #f1f5f9;
                    transition:background 0.15s;
                " onmouseenter="this.style.background='#eff6ff'"
                   onmouseleave="this.style.background='white'">
                    ${a.icon} ${a.label}
                </button>
            `).join('')}
        `;

        // 綁定動作
        menu.querySelectorAll('button[data-idx]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx, 10);
                actions[idx]?.action();
                menu.remove();
                document.removeEventListener('touchstart', _menuDismiss);
            });
        });

        document.body.appendChild(menu);

        // 觸控其他區域關閉選單
        setTimeout(() => {
            document.addEventListener('touchstart', _menuDismiss, { passive: true, once: true });
        }, 100);
    }

    function _menuDismiss(e) {
        const menu = document.getElementById('gesture-student-menu');
        if (menu && !menu.contains(e.target)) menu.remove();
    }

    /** 快速加減分（依賴現有全域函數） */
    function _quickAddScore(studentId, delta) {
        // 優先使用現有的加分函數
        if (typeof window.adjustScore === 'function') {
            window.adjustScore(studentId, delta);
        } else if (typeof window.addPoints === 'function') {
            window.addPoints(studentId, delta);
        } else {
            // 後備：直接修改 AppState
            const students = window.AppState?.students || window.students;
            const s = students?.find(x => String(x.id) === String(studentId));
            if (s) {
                s.score = (s.score || 0) + delta;
                if (typeof window.renderStudents === 'function') window.renderStudents();
                if (typeof window.saveData === 'function') window.saveData();
            }
        }
        showGestureToast(delta > 0 ? `+${delta} ⭐` : `${delta} 💫`);
    }

    // ==================== CSS 注入 ====================

    function injectStyles() {
        if (document.getElementById('gesture-handler-styles')) return;
        const style = document.createElement('style');
        style.id = 'gesture-handler-styles';
        style.textContent = `
            @keyframes gestureMenuIn {
                from { opacity: 0; transform: scale(0.85) translateY(-8px); }
                to   { opacity: 1; transform: scale(1)    translateY(0); }
            }

            /* 手勢操作指示器（滑動中顯示） */
            .gesture-swipe-indicator {
                position: fixed;
                top: 50%;
                transform: translateY(-50%);
                width: 4px;
                height: 60px;
                border-radius: 2px;
                background: rgba(99, 102, 241, 0.5);
                pointer-events: none;
                z-index: 19998;
                opacity: 0;
                transition: opacity 0.2s;
            }
            .gesture-swipe-indicator.left  { left: 12px; }
            .gesture-swipe-indicator.right { right: 12px; }
            .gesture-swipe-indicator.show  { opacity: 1; }

            /* 全螢幕時鐘 / 考試監考模式中不顯示提示 */
            #clock-modal ~ #gesture-toast,
            #exam-fullscreen-overlay ~ #gesture-toast {
                display: none;
            }
        `;
        document.head.appendChild(style);
    }

    // ==================== 初始化 ====================

    function init() {
        injectStyles();
        initContentSwipe();
        initStudentCardLongPress();
        console.log('✅ 手勢操作模組已載入（左右滑動切換功能區 | 長按學生卡片快捷選單）');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
