/**
 * 作業檢查增強模組
 * 提供全螢幕網格視圖，讓作業檢查更高效
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

    // 等待 DOM 載入完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        injectStyles();
        injectModal();
        addFullscreenButton();
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
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.warning('請先選擇要檢查的作業');
            } else {
                alert('請先選擇要檢查的作業');
            }
            return;
        }

        const modal = document.getElementById('homeworkFullscreenModal');
        if (!modal) return;

        // 取得作業名稱
        const homework = (typeof homeworkList !== 'undefined') ?
            homeworkList.find(h => h.id == homeworkId) : null;
        const title = homework ? homework.name : '作業檢查';
        document.getElementById('homeworkFullscreenTitle').textContent = title;

        // 渲染篩選按鈕
        renderFilterButtons();

        // 渲染學生網格
        renderStudentGrid();

        // 更新統計
        updateFullscreenStats();

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    // === 關閉全螢幕 ===
    window.closeHomeworkFullscreen = function () {
        const modal = document.getElementById('homeworkFullscreenModal');
        if (!modal) return;

        modal.classList.remove('active');
        document.body.style.overflow = '';

        // 同步更新原本的檢查清單
        if (typeof updateHomeworkCheckList === 'function') {
            updateHomeworkCheckList();
        }
    };

    // === 渲染篩選按鈕 ===
    let currentFilter = 'all';

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
        if (!container || typeof students === 'undefined') return;

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
})();
