/**
 * 作業檢查增強模組
 * 提供全螢幕網格視圖與作業總覽儀表板，讓作業檢查更高效
 */

(function () {
    'use strict';

    // 狀態配置
    const STATUS_CONFIG = {
        unchecked: { color: 'bg-gray-100 border-gray-300', text: 'text-gray-600', label: '未檢查', icon: '⬜' },
        completed: { color: 'bg-green-100 border-green-500', text: 'text-green-700', label: '完成', icon: '✅' },
        incomplete: { color: 'bg-red-100 border-red-500', text: 'text-red-700', label: '未交', icon: '❌' },
        needs_correction: { color: 'bg-orange-100 border-orange-500', text: 'text-orange-700', label: '需訂正', icon: '✏️' },
        late: { color: 'bg-yellow-100 border-yellow-500', text: 'text-yellow-700', label: '遲交', icon: '⚠️' }
    };

    let currentFilter = 'all';
    let isFromDashboard = false;

    // 等待 DOM 載入完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        injectStyles();
        injectModal();
        injectDashboardModal();
        addFullscreenButton();
        addDashboardButton();
        console.log('✅ 作業檢查增強模組已載入');
    }

    // === CSS 樣式 ===
    function injectStyles() {
        if (document.getElementById('homework-fullscreen-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'homework-fullscreen-styles';
        styles.textContent = `
            /* 全螢幕作業檢查 Modal */
            .homework-fullscreen-modal {
                position: fixed;
                inset: 0;
                z-index: 100;
                background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
                overflow-y: auto;
            }

            .dark .homework-fullscreen-modal {
                background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            }

            .homework-fullscreen-modal.active {
                opacity: 1;
                visibility: visible;
            }

            /* 頂部工具列 */
            .homework-fullscreen-header {
                position: sticky;
                top: 0;
                z-index: 10;
                background: white;
                padding: 1rem;
                padding-right: 4rem; /* 預留空間給主題切換按鈕 */
                border-bottom: 1px solid #e2e8f0;
                display: flex;
                flex-wrap: wrap;
                gap: 1rem;
                align-items: center;
                justify-content: space-between;
                box-shadow: 0 2px 10px rgba(0,0,0,0.05);
            }

            .dark .homework-fullscreen-header {
                background: #1e293b;
                border-color: #334155;
            }

            .homework-fullscreen-title {
                font-size: 1.25rem;
                font-weight: 700;
                color: #1e293b;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .dark .homework-fullscreen-title {
                color: #f1f5f9;
            }

            /* 快速篩選按鈕 */
            .homework-filter-btn {
                padding: 0.5rem 1rem;
                border-radius: 9999px;
                font-size: 0.875rem;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
                border: 2px solid transparent;
                display: flex;
                align-items: center;
                gap: 0.25rem;
            }

            .homework-filter-btn:hover {
                transform: translateY(-1px);
            }

            .homework-filter-btn.active {
                box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            }

            /* 關閉按鈕 */
            .homework-fullscreen-close {
                background: #ef4444;
                color: white;
                border: none;
                width: 44px;
                height: 44px;
                border-radius: 50%;
                font-size: 1.5rem;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
            }

            .homework-fullscreen-close:hover {
                background: #dc2626;
                transform: scale(1.1);
            }

            /* 學生網格 */
            .homework-student-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
                gap: 0.75rem;
                padding: 1rem;
            }

            /* 學生卡片 */
            .homework-student-card {
                border: 2px solid #e2e8f0;
                border-radius: 0.75rem;
                padding: 0.75rem;
                text-align: center;
                cursor: pointer;
                transition: all 0.2s ease;
                background: white;
                position: relative;
            }

            .dark .homework-student-card {
                background: #1e293b;
                border-color: #334155;
            }

            .homework-student-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }

            .homework-student-card:active {
                transform: scale(0.98);
            }

            .homework-student-card.completed {
                border-color: #22c55e;
                background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
            }

            .homework-student-card.incomplete {
                border-color: #ef4444;
                background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
            }

            .homework-student-card.needs_correction {
                border-color: #f97316;
                background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
            }

            .homework-student-card.late {
                border-color: #eab308;
                background: linear-gradient(135deg, #fefce8 0%, #fef9c3 100%);
            }

            .homework-student-number {
                font-size: 1.5rem;
                font-weight: 700;
                color: #6366f1;
                line-height: 1;
                margin-bottom: 0.25rem;
            }

            .dark .homework-student-number {
                color: #a5b4fc;
            }

            .homework-student-name {
                font-size: 0.875rem;
                font-weight: 500;
                color: #475569;
                margin-bottom: 0.5rem;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .dark .homework-student-name {
                color: #cbd5e1;
            }

            .homework-student-status {
                font-size: 1.25rem;
            }

            /* 統計區 */
            .homework-fullscreen-stats {
                display: flex;
                flex-wrap: wrap;
                gap: 0.5rem;
                justify-content: center;
                padding: 0.5rem 1rem;
                background: rgba(255,255,255,0.8);
                border-top: 1px solid #e2e8f0;
            }

            .dark .homework-fullscreen-stats {
                background: rgba(30, 41, 59, 0.8);
                border-color: #334155;
            }

            .homework-stat-badge {
                padding: 0.25rem 0.75rem;
                border-radius: 9999px;
                font-size: 0.75rem;
                font-weight: 600;
            }

            /* 快速操作按鈕組 */
            .homework-quick-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 0.5rem;
                padding: 0.5rem 1rem;
            }

            .homework-quick-btn {
                padding: 0.5rem 1rem;
                border-radius: 0.5rem;
                border: none;
                font-size: 0.875rem;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 0.25rem;
            }

            .homework-quick-btn:hover {
                transform: translateY(-1px);
            }

            /* RWD 調整 */
            @media (max-width: 640px) {
                .homework-student-grid {
                    grid-template-columns: repeat(3, 1fr);
                    gap: 0.5rem;
                    padding: 0.5rem;
                }

                .homework-student-card {
                    padding: 0.5rem;
                }

                .homework-student-number {
                    font-size: 1.25rem;
                }

                .homework-student-name {
                    font-size: 0.75rem;
                }

                .homework-fullscreen-header {
                    padding: 0.75rem;
                }

                .homework-fullscreen-title {
                    font-size: 1rem;
                }

                .homework-filter-btn {
                    padding: 0.375rem 0.5rem;
                    font-size: 0.75rem;
                }
            }

            @media (min-width: 641px) and (max-width: 1024px) {
                .homework-student-grid {
                    grid-template-columns: repeat(5, 1fr);
                }
            }

            @media (min-width: 1025px) {
                .homework-student-grid {
                    grid-template-columns: repeat(7, 1fr);
                }
            }

            /* 展開按鈕 */
            .homework-expand-btn {
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
            }

            .homework-expand-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
            }

            /* ========== 作業總覽儀表板樣式 ========== */
            .homework-dashboard-modal {
                position: fixed;
                inset: 0;
                z-index: 100;
                background: linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 50%, #e8f4fd 100%);
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
                overflow-y: auto;
            }

            .dark .homework-dashboard-modal {
                background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            }

            .homework-dashboard-modal.active {
                opacity: 1;
                visibility: visible;
            }

            /* 儀表板頂部 */
            .homework-dashboard-header {
                position: sticky;
                top: 0;
                z-index: 10;
                background: white;
                padding: 1rem 1.5rem;
                border-bottom: 1px solid #e2e8f0;
                display: flex;
                flex-wrap: wrap;
                gap: 1rem;
                align-items: center;
                justify-content: space-between;
                box-shadow: 0 2px 10px rgba(0,0,0,0.05);
            }

            .dark .homework-dashboard-header {
                background: #1e293b;
                border-color: #334155;
            }

            .homework-dashboard-title {
                font-size: 1.5rem;
                font-weight: 800;
                color: #1e293b;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .dark .homework-dashboard-title {
                color: #f1f5f9;
            }

            .homework-dashboard-subtitle {
                font-size: 0.875rem;
                color: #64748b;
                margin-top: 0.25rem;
            }

            .dark .homework-dashboard-subtitle {
                color: #94a3b8;
            }

            .homework-dashboard-actions {
                display: flex;
                gap: 0.75rem;
                align-items: center;
            }

            .homework-dashboard-btn {
                padding: 0.625rem 1.25rem;
                border-radius: 0.75rem;
                font-size: 0.875rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                border: none;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .homework-dashboard-btn.primary {
                background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
                color: white;
            }

            .homework-dashboard-btn.primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 15px rgba(249, 115, 22, 0.4);
            }

            .homework-dashboard-btn.secondary {
                background: #f1f5f9;
                color: #475569;
            }

            .dark .homework-dashboard-btn.secondary {
                background: #334155;
                color: #e2e8f0;
            }

            .homework-dashboard-btn.secondary:hover {
                background: #e2e8f0;
            }

            .dark .homework-dashboard-btn.secondary:hover {
                background: #475569;
            }

            .homework-dashboard-close {
                background: #ef4444;
                color: white;
                border: none;
                width: 44px;
                height: 44px;
                border-radius: 50%;
                font-size: 1.5rem;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
            }

            .homework-dashboard-close:hover {
                background: #dc2626;
                transform: scale(1.1);
            }

            /* 作業卡片網格 */
            .homework-dashboard-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                gap: 1rem;
                padding: 1.5rem;
            }

            /* 作業卡片 */
            .homework-card {
                background: white;
                border-radius: 1rem;
                padding: 1.25rem;
                box-shadow: 0 2px 8px rgba(0,0,0,0.06);
                cursor: pointer;
                transition: all 0.25s ease;
                border: 2px solid transparent;
                position: relative;
                overflow: hidden;
            }

            .dark .homework-card {
                background: #1e293b;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            }

            .homework-card:hover {
                transform: translateY(-4px);
                box-shadow: 0 8px 25px rgba(0,0,0,0.12);
                border-color: #6366f1;
            }

            .dark .homework-card:hover {
                box-shadow: 0 8px 25px rgba(0,0,0,0.4);
                border-color: #818cf8;
            }

            .homework-card-name {
                font-size: 1.125rem;
                font-weight: 700;
                color: #1e293b;
                margin-bottom: 0.5rem;
                line-height: 1.3;
            }

            .dark .homework-card-name {
                color: #f1f5f9;
            }

            .homework-card-date {
                font-size: 0.8125rem;
                color: #64748b;
                margin-bottom: 1rem;
            }

            .dark .homework-card-date {
                color: #94a3b8;
            }

            .homework-card-tags {
                display: flex;
                flex-wrap: wrap;
                gap: 0.5rem;
            }

            .homework-card-tag {
                padding: 0.375rem 0.75rem;
                border-radius: 9999px;
                font-size: 0.75rem;
                font-weight: 600;
                display: inline-flex;
                align-items: center;
                gap: 0.25rem;
            }

            .homework-card-tag.incomplete {
                background: #fee2e2;
                color: #dc2626;
            }

            .dark .homework-card-tag.incomplete {
                background: rgba(239, 68, 68, 0.2);
                color: #fca5a5;
            }

            .homework-card-tag.needs-correction {
                background: #ffedd5;
                color: #ea580c;
            }

            .dark .homework-card-tag.needs-correction {
                background: rgba(249, 115, 22, 0.2);
                color: #fdba74;
            }

            .homework-card-tag.late {
                background: #fef9c3;
                color: #ca8a04;
            }

            .dark .homework-card-tag.late {
                background: rgba(234, 179, 8, 0.2);
                color: #fde047;
            }

            .homework-card-tag.unchecked {
                background: #f1f5f9;
                color: #64748b;
            }

            .dark .homework-card-tag.unchecked {
                background: rgba(100, 116, 139, 0.2);
                color: #94a3b8;
            }

            .homework-card-tag.completed {
                background: #dcfce7;
                color: #16a34a;
            }

            .dark .homework-card-tag.completed {
                background: rgba(34, 197, 94, 0.2);
                color: #86efac;
            }

            /* 完成率進度條 */
            .homework-card-progress {
                margin-top: 1rem;
                padding-top: 1rem;
                border-top: 1px solid #e2e8f0;
            }

            .dark .homework-card-progress {
                border-color: #334155;
            }

            .homework-card-progress-label {
                display: flex;
                justify-content: space-between;
                font-size: 0.75rem;
                color: #64748b;
                margin-bottom: 0.5rem;
            }

            .dark .homework-card-progress-label {
                color: #94a3b8;
            }

            .homework-card-progress-bar {
                height: 6px;
                background: #e2e8f0;
                border-radius: 9999px;
                overflow: hidden;
            }

            .dark .homework-card-progress-bar {
                background: #334155;
            }

            .homework-card-progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #22c55e 0%, #16a34a 100%);
                border-radius: 9999px;
                transition: width 0.5s ease;
            }

            /* 空狀態 */
            .homework-dashboard-empty {
                text-align: center;
                padding: 4rem 2rem;
                color: #64748b;
            }

            .dark .homework-dashboard-empty {
                color: #94a3b8;
            }

            .homework-dashboard-empty-icon {
                font-size: 4rem;
                margin-bottom: 1rem;
            }

            .homework-dashboard-empty-text {
                font-size: 1.125rem;
            }

            /* 儀表板統計欄 */
            .homework-dashboard-stats {
                display: flex;
                flex-wrap: wrap;
                gap: 0.75rem;
                padding: 0 1.5rem;
                margin-bottom: 0.5rem;
            }

            .homework-dashboard-stat-card {
                background: white;
                border-radius: 0.75rem;
                padding: 0.75rem 1.25rem;
                display: flex;
                align-items: center;
                gap: 0.75rem;
                box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            }

            .dark .homework-dashboard-stat-card {
                background: #1e293b;
            }

            .homework-dashboard-stat-icon {
                font-size: 1.5rem;
            }

            .homework-dashboard-stat-value {
                font-size: 1.5rem;
                font-weight: 700;
                color: #1e293b;
            }

            .dark .homework-dashboard-stat-value {
                color: #f1f5f9;
            }

            .homework-dashboard-stat-label {
                font-size: 0.75rem;
                color: #64748b;
            }

            .dark .homework-dashboard-stat-label {
                color: #94a3b8;
            }

            /* 儀表板開啟按鈕 */
            .homework-dashboard-open-btn {
                background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%);
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
                margin-top: 0.5rem;
            }

            .homework-dashboard-open-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 15px rgba(20, 184, 166, 0.4);
            }

            /* RWD 調整 */
            @media (max-width: 640px) {
                .homework-dashboard-grid {
                    grid-template-columns: 1fr;
                    padding: 1rem;
                    gap: 0.75rem;
                }

                .homework-dashboard-header {
                    padding: 0.75rem 1rem;
                }

                .homework-dashboard-title {
                    font-size: 1.25rem;
                }

                .homework-card {
                    padding: 1rem;
                }

                .homework-card-name {
                    font-size: 1rem;
                }

                .homework-dashboard-stats {
                    padding: 0 1rem;
                }

                .homework-dashboard-stat-card {
                    padding: 0.5rem 1rem;
                }

                .homework-dashboard-stat-value {
                    font-size: 1.25rem;
                }
            }

            @media (min-width: 641px) and (max-width: 1024px) {
                .homework-dashboard-grid {
                    grid-template-columns: repeat(2, 1fr);
                }
            }
        `;
        document.head.appendChild(styles);
    }

    // === Modal HTML ===
    function injectModal() {
        if (document.getElementById('homeworkFullscreenModal')) return;

        const modal = document.createElement('div');
        modal.id = 'homeworkFullscreenModal';
        modal.className = 'homework-fullscreen-modal';
        modal.innerHTML = `
            <div class="homework-fullscreen-header">
                <div class="homework-fullscreen-title">
                    <span>📋</span>
                    <span id="homeworkFullscreenTitle">作業檢查</span>
                </div>
                
                <div class="flex flex-wrap gap-2 items-center">
                    <div id="homeworkFilterBtns" class="flex flex-wrap gap-1">
                        <!-- 篩選按鈕由 JS 生成 -->
                    </div>
                    
                    <button class="homework-fullscreen-close" onclick="closeHomeworkFullscreen()" title="關閉">✕</button>
                </div>
            </div>

            <div class="homework-quick-actions">
                <button class="homework-quick-btn bg-green-500 text-white" onclick="setAllHomeworkStatus('completed')">
                    ✅ 全部完成
                </button>
                <button class="homework-quick-btn bg-gray-200 text-gray-700" onclick="setAllHomeworkStatus('unchecked')">
                    🔄 重置全部
                </button>
            </div>

            <div id="homeworkStudentGrid" class="homework-student-grid">
                <!-- 學生卡片由 JS 生成 -->
            </div>

            <div class="homework-fullscreen-stats" id="homeworkFullscreenStats">
                <!-- 統計由 JS 生成 -->
            </div>
        `;
        document.body.appendChild(modal);
    }

    // === 添加展開按鈕 ===
    function addFullscreenButton() {
        const checkHomeworkSelect = document.getElementById('checkHomework');
        if (!checkHomeworkSelect) return;

        // 檢查是否已存在按鈕
        if (document.getElementById('homeworkExpandBtn')) return;

        const btn = document.createElement('button');
        btn.id = 'homeworkExpandBtn';
        btn.className = 'homework-expand-btn mt-3';
        btn.innerHTML = '⤢ 全螢幕檢查';
        btn.onclick = openHomeworkFullscreen;

        checkHomeworkSelect.parentNode.insertBefore(btn, checkHomeworkSelect.nextSibling);
    }

    // === 開啟全螢幕 ===
    window.openHomeworkFullscreen = function () {
        const homeworkId = document.getElementById('checkHomework').value;
        if (!homeworkId) {
            const msg = '請先選擇要檢查的作業';
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.warning(msg);
            } else {
                alert(msg);
            }
            return;
        }

        // 檢查是否有學生資料
        const studentList = (typeof AppState !== 'undefined' && AppState.students) ? AppState.students : (typeof students !== 'undefined' ? students : []);
        if (!Array.isArray(studentList) || studentList.length === 0) {
            const msg = '請先在學生管理中新增學生資料，才能使用全螢幕檢查功能';
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.warning(msg);
            } else if (typeof ErrorHandler !== 'undefined' && typeof ErrorHandler.handle === 'function') {
                ErrorHandler.handle(msg, 'VALIDATION', 'HomeworkFullscreen');
            } else {
                alert(msg);
            }
            return;
        }

        const modal = document.getElementById('homeworkFullscreenModal');
        if (!modal) return;

        // 啟動全螢幕模式
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // 取得作業名稱
        const homeworkIdNum = parseInt(homeworkId);
        const homework = (typeof AppState !== 'undefined' && AppState.homeworks) ?
            AppState.homeworks.find(h => h.id == homeworkIdNum) :
            (typeof homeworkList !== 'undefined' ? homeworkList.find(h => h.id == homeworkIdNum) : null);

        const title = homework ? homework.name : '作業檢查';
        const titleElement = document.getElementById('homeworkFullscreenTitle');
        if (titleElement) titleElement.textContent = title;

        // 渲染篩選按鈕
        renderFilterButtons();

        // === 骨架屏：先在學生網格插入骨架屏，再渲染真實資料 ===
        if (typeof SkeletonManager !== 'undefined') {
            const studentList = (typeof AppState !== 'undefined' && AppState.students) ? AppState.students : (typeof students !== 'undefined' ? students : []);
            const count = Math.min(Math.max(studentList.length, 4), 12);
            SkeletonManager.show('homeworkStudentGrid', 'student', count);
        }

        // 延遲 150ms 後渲染真實學生網格
        setTimeout(() => {
            renderStudentGrid();
            updateFullscreenStats();
        }, 150);
    };

    // === 關閉全螢幕 ===
    window.closeHomeworkFullscreen = function () {
        const modal = document.getElementById('homeworkFullscreenModal');
        if (!modal) return;

        modal.classList.remove('active');
        document.body.style.overflow = '';

        // 如果是從儀表板過來的，關閉全螢幕後重新開啟儀表板
        if (isFromDashboard) {
            isFromDashboard = false; // 重置標記
            setTimeout(() => {
                if (typeof openHomeworkDashboard === 'function') {
                    openHomeworkDashboard();
                }
            }, 300);
        } else {
            // 如果不是儀表板，確保主畫面即時整理
            syncToMainView();
        }
    };

    // === 同步至主畫面 ===
    function syncToMainView() {
        if (typeof window.updateHomeworkCheckList === 'function') {
            window.updateHomeworkCheckList();
        }
        if (typeof window.updateHomeworkStats === 'function') {
            window.updateHomeworkStats();
        }
    }

    // === 渲染篩選按鈕 ===
    function renderFilterButtons() {
        const container = document.getElementById('homeworkFilterBtns');
        if (!container) return;

        const filters = [
            { key: 'all', label: '全部', color: 'bg-gray-100 text-gray-700' },
            { key: 'unchecked', label: '未檢查', color: 'bg-gray-100 text-gray-600' },
            { key: 'completed', label: '✅ 完成', color: 'bg-green-100 text-green-700' },
            { key: 'incomplete', label: '❌ 未交', color: 'bg-red-100 text-red-700' },
            { key: 'needs_correction', label: '✏️ 訂正', color: 'bg-orange-100 text-orange-700' },
            { key: 'late', label: '⚠️ 遲交', color: 'bg-yellow-100 text-yellow-700' }
        ];

        container.innerHTML = filters.map(f => `
            <button class="homework-filter-btn ${f.color} ${currentFilter === f.key ? 'active border-indigo-500' : ''}" 
                    onclick="filterHomeworkStudents('${f.key}')">
                ${f.label}
            </button>
        `).join('');
    }

    window.filterHomeworkStudents = function (filter) {
        currentFilter = filter;
        renderFilterButtons();
        renderStudentGrid();
    };

    // === 渲染學生網格 ===
    function renderStudentGrid() {
        const container = document.getElementById('homeworkStudentGrid');
        if (!container) return;

        // 檢查資料
        if (typeof students === 'undefined' || !Array.isArray(students) || students.length === 0) {
            container.innerHTML = `<div class="col-span-full text-center text-gray-500 py-12">
                <div class="text-4xl mb-4">👥</div>
                <div>目前尚無學生資料</div>
                <div class="text-sm mt-2">請先至「學生管理」新增學生</div>
            </div>`;
            return;
        }

        const homeworkId = document.getElementById('checkHomework').value;
        const checks = (typeof homeworkChecks !== 'undefined' && homeworkChecks[homeworkId])
            ? homeworkChecks[homeworkId] : {};

        // 排序學生
        const sortedStudents = [...students].sort((a, b) => (a.number || 999) - (b.number || 999));

        // 篩選學生
        const filteredStudents = sortedStudents.filter(student => {
            if (currentFilter === 'all') return true;
            const status = checks[student.id] || 'unchecked';
            return status === currentFilter;
        });

        if (filteredStudents.length === 0) {
            container.innerHTML = `<div class="col-span-full text-center text-gray-500 py-8">沒有符合條件的學生</div>`;
            return;
        }

        container.innerHTML = filteredStudents.map(student => {
            const status = checks[student.id] || 'unchecked';
            const config = STATUS_CONFIG[status];

            return `
                <div class="homework-student-card ${status}" 
                     onclick="cycleHomeworkStatus(${homeworkId}, ${student.id})"
                     title="點擊切換狀態">
                    <div class="homework-student-number">${student.number || '?'}</div>
                    <div class="homework-student-name">${student.name}</div>
                    <div class="homework-student-status">${config.icon}</div>
                </div>
            `;
        }).join('');
    }

    // === 循環切換狀態 ===
    window.cycleHomeworkStatus = function (homeworkId, studentId) {
        if (typeof homeworkChecks === 'undefined') return;

        if (!homeworkChecks[homeworkId]) homeworkChecks[homeworkId] = {};

        const currentStatus = homeworkChecks[homeworkId][studentId] || 'unchecked';
        const statusOrder = ['unchecked', 'completed', 'incomplete', 'needs_correction', 'late'];
        const currentIndex = statusOrder.indexOf(currentStatus);
        const nextStatus = statusOrder[(currentIndex + 1) % statusOrder.length];

        homeworkChecks[homeworkId][studentId] = nextStatus;
        localStorage.setItem('homeworkChecks', JSON.stringify(homeworkChecks));

        renderStudentGrid();
        updateFullscreenStats();
        syncToMainView(); // 同步至主畫面
    };

    // === 全部設定狀態 ===
    window.setAllHomeworkStatus = function (status) {
        const homeworkId = document.getElementById('checkHomework').value;
        if (!homeworkId || typeof students === 'undefined' || typeof homeworkChecks === 'undefined') return;

        if (!homeworkChecks[homeworkId]) homeworkChecks[homeworkId] = {};

        students.forEach(student => {
            if (status === 'unchecked') {
                delete homeworkChecks[homeworkId][student.id];
            } else {
                homeworkChecks[homeworkId][student.id] = status;
            }
        });

        localStorage.setItem('homeworkChecks', JSON.stringify(homeworkChecks));
        renderStudentGrid();
        updateFullscreenStats();
        syncToMainView(); // 同步至主畫面

        if (typeof NotificationSystem !== 'undefined') {
            const labels = { completed: '全部完成', unchecked: '已重置' };
            NotificationSystem.success(labels[status] || '已更新');
        }
    };

    // === 更新統計 ===
    function updateFullscreenStats() {
        const container = document.getElementById('homeworkFullscreenStats');
        if (!container || typeof students === 'undefined') return;

        const homeworkId = document.getElementById('checkHomework').value;
        const checks = (typeof homeworkChecks !== 'undefined' && homeworkChecks[homeworkId])
            ? homeworkChecks[homeworkId] : {};

        const stats = {
            total: students.length,
            completed: 0,
            incomplete: 0,
            needs_correction: 0,
            late: 0,
            unchecked: 0
        };

        students.forEach(student => {
            const status = checks[student.id] || 'unchecked';
            stats[status]++;
        });

        const rate = stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(0) : 0;

        container.innerHTML = `
            <span class="homework-stat-badge bg-blue-100 text-blue-700">總計：${stats.total}</span>
            <span class="homework-stat-badge bg-green-100 text-green-700">✅ ${stats.completed}</span>
            <span class="homework-stat-badge bg-red-100 text-red-700">❌ ${stats.incomplete}</span>
            <span class="homework-stat-badge bg-orange-100 text-orange-700">✏️ ${stats.needs_correction}</span>
            <span class="homework-stat-badge bg-yellow-100 text-yellow-700">⚠️ ${stats.late}</span>
            <span class="homework-stat-badge bg-gray-100 text-gray-600">⬜ ${stats.unchecked}</span>
            <span class="homework-stat-badge bg-indigo-100 text-indigo-700 font-bold">完成率：${rate}%</span>
        `;
    }

    // ============================================
    // === 作業總覽儀表板功能 ===
    // ============================================

    // === 注入儀表板 Modal ===
    function injectDashboardModal() {
        if (document.getElementById('homeworkDashboardModal')) return;

        const modal = document.createElement('div');
        modal.id = 'homeworkDashboardModal';
        modal.className = 'homework-dashboard-modal';
        modal.innerHTML = `
            <div class="homework-dashboard-header">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <button class="homework-dashboard-close" onclick="closeHomeworkDashboard()" title="關閉">✕</button>
                    <div>
                        <div class="homework-dashboard-title">
                            <span>📋</span>
                            <span>作業總覽</span>
                        </div>
                        <div class="homework-dashboard-subtitle">
                            共有 <span id="dashboardHomeworkCount">0</span> 項作業
                        </div>
                    </div>
                </div>
                
                <div class="homework-dashboard-actions">
                    <button class="homework-dashboard-btn primary" onclick="openAddHomeworkFromDashboard()">
                        ➕ 新增作業
                    </button>
                    <button class="homework-dashboard-btn secondary" onclick="exportHomeworkReport()">
                        📊 匯出報告
                    </button>
                </div>
            </div>

            <div class="homework-dashboard-stats" id="dashboardStats">
                <!-- 統計由 JS 生成 -->
            </div>

            <div id="homeworkDashboardGrid" class="homework-dashboard-grid">
                <!-- 作業卡片由 JS 生成 -->
            </div>
        `;
        document.body.appendChild(modal);
    }

    // === 添加儀表板按鈕 ===
    function addDashboardButton() {
        const homeworkSection = document.getElementById('homework-section');
        if (!homeworkSection) return;

        // 檢查是否已存在按鈕
        if (document.getElementById('homeworkDashboardBtn')) return;

        // 找到標題元素
        const titleElement = homeworkSection.querySelector('h2');
        if (!titleElement) return;

        // 創建按鈕容器
        const btnContainer = document.createElement('div');
        btnContainer.className = 'flex gap-2 mt-3 flex-wrap';

        const btn = document.createElement('button');
        btn.id = 'homeworkDashboardBtn';
        btn.className = 'homework-dashboard-open-btn';
        btn.innerHTML = '📊 作業總覽儀表板';
        btn.onclick = openHomeworkDashboard;

        btnContainer.appendChild(btn);

        // 插入到標題後面
        titleElement.parentNode.insertBefore(btnContainer, titleElement.nextSibling);
    }

    // === 開啟儀表板 ===
    window.openHomeworkDashboard = function () {
        // 檢查是否有學生資料，若無則提示
        const studentList = (typeof AppState !== 'undefined' && AppState.students) ? AppState.students : (typeof students !== 'undefined' ? students : []);
        if (!Array.isArray(studentList) || studentList.length === 0) {
            const msg = '請先在學生管理中新增學生資料，才能使用儀表板功能';
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.warning(msg);
            } else if (typeof ErrorHandler !== 'undefined' && typeof ErrorHandler.handle === 'function') {
                ErrorHandler.handle(msg, 'VALIDATION', 'HomeworkDashboard');
            } else {
                alert(msg);
            }
            return;
        }

        const modal = document.getElementById('homeworkDashboardModal');
        if (!modal) return;

        // === 骨架屏：先讓 Modal 可見，再插入骨架屏 ===
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // 在作業卡片網格容器插入骨架屏（計算合理顯示數量）
        if (typeof SkeletonManager !== 'undefined') {
            const hwCount = (typeof homeworkList !== 'undefined' && homeworkList.length > 0)
                ? Math.min(homeworkList.length, 6)
                : 4;
            SkeletonManager.show('homeworkDashboardGrid', 'homework', hwCount);
        }

        // 延遲 200ms 後渲染真實資料（骨架屏動畫有時間展現）
        setTimeout(() => {
            renderDashboardStats();
            renderDashboardCards();
        }, 200);
    };

    // === 關閉儀表板 ===
    window.closeHomeworkDashboard = function () {
        const modal = document.getElementById('homeworkDashboardModal');
        if (!modal) return;

        modal.classList.remove('active');
        document.body.style.overflow = '';
    };


    // === 從儀表板新增作業 ===
    window.openAddHomeworkFromDashboard = function () {
        closeHomeworkDashboard();
        // 切換到作業檢查區域 (showSection 會自動加上 '-section' 後綴)
        if (typeof showSection === 'function') {
            showSection('homework');
        }
        // 聚焦到作業名稱輸入框
        setTimeout(() => {
            const nameInput = document.getElementById('homeworkName');
            if (nameInput) nameInput.focus();
        }, 300);
    };


    // === 匯出作業報告 ===
    window.exportHomeworkReport = function () {
        if (typeof homeworkList === 'undefined' || homeworkList.length === 0) {
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.warning('沒有作業資料可匯出');
            }
            return;
        }

        const studentList = (typeof students !== 'undefined') ? students : [];
        const checks = (typeof homeworkChecks !== 'undefined') ? homeworkChecks : {};

        let csvContent = '\uFEFF'; // BOM for UTF-8
        csvContent += '作業名稱,繳交日期,完成人數,未交人數,待訂正人數,遲交人數,未檢查人數,完成率\n';

        homeworkList.forEach(homework => {
            const stats = getHomeworkStats(homework.id, studentList, checks);
            csvContent += `"${homework.name}",${homework.due},${stats.completed},${stats.incomplete},${stats.needs_correction},${stats.late},${stats.unchecked},${stats.rate}%\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `作業統計報告_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);

        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.success('報告已匯出');
        }
    };

    // === 計算單一作業統計 ===
    function getHomeworkStats(homeworkId, studentList, checks) {
        const homeworkChecks = (checks && checks[homeworkId]) ? checks[homeworkId] : {};
        const stats = {
            total: (Array.isArray(studentList)) ? studentList.length : 0,
            completed: 0,
            incomplete: 0,
            needs_correction: 0,
            late: 0,
            unchecked: 0
        };

        if (Array.isArray(studentList)) {
            studentList.forEach(student => {
                const status = homeworkChecks[student.id] || 'unchecked';
                stats[status]++;
            });
        }

        stats.rate = stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(0) : 0;
        return stats;
    }

    // === 渲染儀表板統計 ===
    function renderDashboardStats() {
        const container = document.getElementById('dashboardStats');
        if (!container) return;

        const homeworks = (typeof homeworkList !== 'undefined') ? homeworkList : [];
        const studentList = (typeof students !== 'undefined' && Array.isArray(students)) ? students : [];
        const checks = (typeof homeworkChecks !== 'undefined') ? homeworkChecks : {};

        // 更新數量顯示
        const countEl = document.getElementById('dashboardHomeworkCount');
        if (countEl) countEl.textContent = homeworks.length;

        // 計算總體統計
        let totalIncomplete = 0;
        let totalNeedsCorrection = 0;
        let totalCompleted = 0;

        // 如果沒有學生，則不需要跑迴圈計算
        if (studentList.length > 0) {
            homeworks.forEach(homework => {
                const stats = getHomeworkStats(homework.id, studentList, checks);
                totalIncomplete += stats.incomplete;
                totalNeedsCorrection += stats.needs_correction;
                totalCompleted += stats.completed;
            });
        }

        container.innerHTML = `
            <div class="homework-dashboard-stat-card">
                <div class="homework-dashboard-stat-icon">📚</div>
                <div>
                    <div class="homework-dashboard-stat-value">${homeworks.length}</div>
                    <div class="homework-dashboard-stat-label">項作業</div>
                </div>
            </div>
            <div class="homework-dashboard-stat-card">
                <div class="homework-dashboard-stat-icon">❌</div>
                <div>
                    <div class="homework-dashboard-stat-value">${totalIncomplete}</div>
                    <div class="homework-dashboard-stat-label">人次未繳</div>
                </div>
            </div>
            <div class="homework-dashboard-stat-card">
                <div class="homework-dashboard-stat-icon">✏️</div>
                <div>
                    <div class="homework-dashboard-stat-value">${totalNeedsCorrection}</div>
                    <div class="homework-dashboard-stat-label">人次待訂正</div>
                </div>
            </div>
            <div class="homework-dashboard-stat-card">
                <div class="homework-dashboard-stat-icon">✅</div>
                <div>
                    <div class="homework-dashboard-stat-value">${totalCompleted}</div>
                    <div class="homework-dashboard-stat-label">人次完成</div>
                </div>
            </div>
        `;
    }

    // === 渲染作業卡片 ===
    function renderDashboardCards() {
        const container = document.getElementById('homeworkDashboardGrid');
        if (!container) return;

        const homeworks = (typeof homeworkList !== 'undefined') ? homeworkList : [];
        const studentList = (typeof students !== 'undefined') ? students : [];
        const checks = (typeof homeworkChecks !== 'undefined') ? homeworkChecks : {};

        if (homeworks.length === 0) {
            container.innerHTML = `
                <div class="homework-dashboard-empty col-span-full">
                    <div class="homework-dashboard-empty-icon">📝</div>
                    <div class="homework-dashboard-empty-text">尚無作業項目</div>
                    <button class="homework-dashboard-btn primary mt-4" onclick="openAddHomeworkFromDashboard()">
                        ➕ 新增第一個作業
                    </button>
                </div>
            `;
            return;
        }

        // 按日期排序（最新的在前面）
        const sortedHomeworks = [...homeworks].sort((a, b) => {
            return new Date(b.due) - new Date(a.due);
        });

        container.innerHTML = sortedHomeworks.map(homework => {
            const stats = getHomeworkStats(homework.id, studentList, checks);
            const completionRate = parseInt(stats.rate);

            // 生成狀態標籤
            let tagsHtml = '';

            if (stats.incomplete > 0) {
                tagsHtml += `<span class="homework-card-tag incomplete">${stats.incomplete} 人未繳</span>`;
            }
            if (stats.needs_correction > 0) {
                tagsHtml += `<span class="homework-card-tag needs-correction">${stats.needs_correction} 人待訂正</span>`;
            }
            if (stats.late > 0) {
                tagsHtml += `<span class="homework-card-tag late">${stats.late} 人遲交</span>`;
            }
            if (stats.unchecked > 0) {
                tagsHtml += `<span class="homework-card-tag unchecked">${stats.unchecked} 人未檢查</span>`;
            }
            if (completionRate === 100 && stats.total > 0) {
                tagsHtml = `<span class="homework-card-tag completed">🎉 全部完成</span>`;
            }

            // 格式化日期
            const dueDate = new Date(homework.due);
            const formattedDate = `${dueDate.getFullYear()}/${dueDate.getMonth() + 1}/${dueDate.getDate()}`;

            return `
                <div class="homework-card" onclick="openHomeworkFromDashboard(${homework.id})">
                    <div class="homework-card-name">${escapeHtml(homework.name)}</div>
                    <div class="homework-card-date">${formattedDate}</div>
                    <div class="homework-card-tags">
                        ${tagsHtml || '<span class="homework-card-tag unchecked">尚無檢查記錄</span>'}
                    </div>
                    <div class="homework-card-progress">
                        <div class="homework-card-progress-label">
                            <span>完成率</span>
                            <span>${stats.rate}%</span>
                        </div>
                        <div class="homework-card-progress-bar">
                            <div class="homework-card-progress-fill" style="width: ${stats.rate}%"></div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // === 從儀表板開啟特定作業 ===
    window.openHomeworkFromDashboard = function (homeworkId) {
        // 標記來源自儀表板
        isFromDashboard = true;

        // 關閉儀表板
        closeHomeworkDashboard();

        // 設定選擇的作業
        const select = document.getElementById('checkHomework');
        if (select) {
            select.value = homeworkId;
            // 觸發 change 事件
            select.dispatchEvent(new Event('change'));
        }

        // 開啟全螢幕檢查模式
        setTimeout(() => {
            if (typeof openHomeworkFullscreen === 'function') {
                openHomeworkFullscreen();
            }
        }, 100);
    };

    // === HTML 轉義 ===
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // === ESC 關閉儀表板 ===
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            const dashboard = document.getElementById('homeworkDashboardModal');
            if (dashboard && dashboard.classList.contains('active')) {
                closeHomeworkDashboard();
            }
        }
    });
})();
