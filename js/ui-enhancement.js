/**
 * UI 增強模組
 * 包含：深色模式完善、拖拽排序、座位表
 */

(function () {
    'use strict';

    // ==================== 深色模式增強 CSS ====================
    const darkModeEnhancementStyles = `
        /* Modal 深色模式 */
        .dark .fixed.inset-0 > div:not(.bg-black) {
            background-color: var(--bg-card) !important;
        }

        .dark [class*="rounded-xl"],
        .dark [class*="rounded-2xl"] {
            border: 1px solid var(--border-color);
        }

        /* 通知系統深色 */
        .dark .notification-container > div {
            background-color: var(--bg-card) !important;
            border: 1px solid var(--border-color);
        }

        /* 確認對話框深色 */
        .dark .confirm-dialog-overlay .bg-white {
            background-color: var(--bg-card) !important;
        }

        /* 分數標籤深色調整 */
        .dark .bg-green-100 { background-color: rgba(16, 185, 129, 0.2) !important; }
        .dark .bg-red-100 { background-color: rgba(239, 68, 68, 0.2) !important; }
        .dark .bg-yellow-100 { background-color: rgba(245, 158, 11, 0.2) !important; }
        .dark .bg-blue-100 { background-color: rgba(59, 130, 246, 0.2) !important; }
        .dark .bg-purple-100 { background-color: rgba(139, 92, 246, 0.2) !important; }
        .dark .bg-pink-100 { background-color: rgba(236, 72, 153, 0.2) !important; }
        .dark .bg-indigo-100 { background-color: rgba(99, 102, 241, 0.2) !important; }

        /* 表格深色 */
        .dark table { background-color: var(--bg-card); }
        .dark th { background-color: var(--bg-tertiary) !important; }
        .dark td { border-color: var(--border-color) !important; }

        /* 快捷鍵 Modal 深色 */
        .dark .shortcuts-content {
            background-color: var(--bg-card) !important;
            color: var(--text-primary);
        }

        .dark .shortcut-item {
            background-color: var(--bg-secondary) !important;
        }

        .dark .shortcut-key {
            background: linear-gradient(180deg, var(--bg-tertiary) 0%, var(--bg-secondary) 100%);
            border-color: var(--border-color);
            color: var(--text-primary);
        }

        /* 番茄鐘狀態深色 */
        .dark .pomodoro-status {
            background-color: var(--bg-secondary) !important;
        }

        /* 頭像/標籤選擇器深色 */
        .dark #avatar-picker-modal .bg-white,
        .dark #tag-editor-modal .bg-white {
            background-color: var(--bg-card) !important;
        }

        .dark .avatar-option {
            background-color: var(--bg-secondary) !important;
        }

        .dark .avatar-option:hover {
            background-color: var(--bg-tertiary) !important;
        }
    `;

    // ==================== 拖拽排序 ====================
    const dragStyles = `
        /* 拖拽樣式 */
        .draggable {
            cursor: grab;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .draggable:active {
            cursor: grabbing;
        }

        .draggable.dragging {
            opacity: 0.5;
            transform: scale(1.02);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            z-index: 100;
        }

        .drag-handle {
            cursor: grab;
            opacity: 0.5;
            transition: opacity 0.2s;
        }

        .drag-handle:hover {
            opacity: 1;
        }

        .drag-over {
            border: 2px dashed #3b82f6 !important;
            background-color: rgba(59, 130, 246, 0.1) !important;
        }

        .drag-placeholder {
            border: 2px dashed #94a3b8;
            background-color: rgba(148, 163, 184, 0.1);
            border-radius: 0.5rem;
            min-height: 60px;
        }
    `;

    // ==================== 座位表 ====================
    const seatingStyles = `
        /* 座位表容器 */
        .seating-chart {
            display: grid;
            gap: 0.5rem;
            padding: 1rem;
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
            border-radius: 1rem;
            min-height: 400px;
        }

        .dark .seating-chart {
            background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
        }

        /* 講台 */
        .seating-podium {
            grid-column: 1 / -1;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: white;
            text-align: center;
            padding: 0.75rem;
            border-radius: 0.5rem;
            font-weight: 600;
            margin-bottom: 1rem;
        }

        /* 座位 */
        .seat {
            aspect-ratio: 1;
            min-width: 60px;
            background: white;
            border: 2px solid #e2e8f0;
            border-radius: 0.5rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 0.75rem;
            padding: 0.25rem;
        }

        .dark .seat {
            background: var(--bg-card);
            border-color: var(--border-color);
        }

        .seat:hover {
            border-color: #3b82f6;
            transform: scale(1.05);
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
        }

        .seat.occupied {
            background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
            border-color: #3b82f6;
        }

        .dark .seat.occupied {
            background: rgba(59, 130, 246, 0.2);
        }

        .seat.empty {
            background: #f8fafc;
            border-style: dashed;
        }

        .dark .seat.empty {
            background: var(--bg-secondary);
        }

        .seat-number {
            font-size: 0.625rem;
            color: #94a3b8;
        }

        .seat-avatar {
            font-size: 1.5rem;
            line-height: 1;
        }

        .seat-name {
            font-size: 0.625rem;
            font-weight: 600;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* 座位表控制 */
        .seating-controls {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 1rem;
            flex-wrap: wrap;
        }

        .seating-controls input {
            width: 60px;
            text-align: center;
        }

        .seating-btn {
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }

        .seating-btn-primary {
            background: linear-gradient(135deg, #3b82f6, #2563eb);
            color: white;
            border: none;
        }

        .seating-btn-primary:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        .seating-btn-secondary {
            background: white;
            color: #374151;
            border: 1px solid #e5e7eb;
        }

        .dark .seating-btn-secondary {
            background: var(--bg-tertiary);
            color: var(--text-primary);
            border-color: var(--border-color);
        }
    `;

    // ==================== 拖拽排序功能 ====================
    let draggedElement = null;
    let draggedIndex = null;

    /**
     * 初始化學生列表拖拽
     */
    function initStudentDrag() {
        const studentsList = document.getElementById('studentsList');
        if (!studentsList) return;

        // 使用 MutationObserver 監聽列表變化
        const observer = new MutationObserver(() => {
            setupDraggableItems(studentsList);
        });

        observer.observe(studentsList, { childList: true });
        setupDraggableItems(studentsList);
    }

    /**
     * 設置可拖拽項目
     */
    function setupDraggableItems(container) {
        const items = container.querySelectorAll(':scope > div:not(.col-span-full)');

        items.forEach((item, index) => {
            if (item.hasAttribute('data-drag-init')) return;
            item.setAttribute('data-drag-init', 'true');

            item.draggable = true;
            item.classList.add('draggable');
            item.dataset.index = index;

            // 添加拖拽手柄
            const handle = document.createElement('span');
            handle.className = 'drag-handle mr-2 text-gray-400';
            handle.innerHTML = '⠿';
            handle.style.cssText = 'font-size: 1.25rem; user-select: none;';
            item.insertBefore(handle, item.firstChild);

            // 拖拽事件
            item.addEventListener('dragstart', onDragStart);
            item.addEventListener('dragend', onDragEnd);
            item.addEventListener('dragover', onDragOver);
            item.addEventListener('drop', onDrop);
            item.addEventListener('dragleave', onDragLeave);
        });
    }

    function onDragStart(e) {
        draggedElement = this;
        draggedIndex = parseInt(this.dataset.index);
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    }

    function onDragEnd(e) {
        this.classList.remove('dragging');
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        draggedElement = null;
        draggedIndex = null;
    }

    function onDragOver(e) {
        e.preventDefault();
        if (this === draggedElement) return;
        this.classList.add('drag-over');
    }

    function onDragLeave(e) {
        this.classList.remove('drag-over');
    }

    function onDrop(e) {
        e.preventDefault();
        this.classList.remove('drag-over');

        if (this === draggedElement || !draggedElement) return;

        const targetIndex = parseInt(this.dataset.index);

        // 重新排序學生陣列
        if (typeof students !== 'undefined' && Array.isArray(students)) {
            const [removed] = students.splice(draggedIndex, 1);
            students.splice(targetIndex, 0, removed);

            // 更新座號
            students.forEach((s, i) => s.number = i + 1);

            localStorage.setItem('students', JSON.stringify(students));

            if (typeof renderStudents === 'function') {
                renderStudents();
            }

            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.success('已更新學生順序');
            }
        }
    }

    // ==================== 座位表功能 ====================
    let seatingConfig = {
        rows: 6,
        cols: 6,
        layout: {} // { "row-col": studentId }
    };

    /**
     * 顯示座位表
     */
    window.showSeatingChart = function () {
        // 移除舊的
        document.getElementById('seating-modal')?.remove();

        // 載入配置
        const saved = localStorage.getItem('seatingConfig');
        if (saved) {
            try {
                seatingConfig = JSON.parse(saved);
            } catch (e) { }
        }

        const modal = document.createElement('div');
        modal.id = 'seating-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-auto" onclick="event.stopPropagation()">
                <div class="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-500 to-indigo-500 rounded-t-2xl">
                    <h3 class="text-xl font-bold text-white flex items-center gap-2">
                        🪑 座位表
                    </h3>
                    <button onclick="document.getElementById('seating-modal').remove()" class="text-white hover:text-gray-200 text-2xl">✕</button>
                </div>
                
                <div class="p-4">
                    <div class="seating-controls">
                        <label class="flex items-center gap-2">
                            <span class="text-sm text-gray-600">行數:</span>
                            <input type="number" id="seating-rows" value="${seatingConfig.rows}" min="1" max="10" 
                                class="px-2 py-1 border rounded-lg" onchange="updateSeatingGrid()">
                        </label>
                        <label class="flex items-center gap-2">
                            <span class="text-sm text-gray-600">列數:</span>
                            <input type="number" id="seating-cols" value="${seatingConfig.cols}" min="1" max="10"
                                class="px-2 py-1 border rounded-lg" onchange="updateSeatingGrid()">
                        </label>
                        <button onclick="autoAssignSeats()" class="seating-btn seating-btn-primary">🔄 自動安排</button>
                        <button onclick="clearSeats()" class="seating-btn seating-btn-secondary">🗑️ 清除</button>
                        <button onclick="saveSeatingChart()" class="seating-btn seating-btn-primary">💾 儲存</button>
                    </div>
                    
                    <div id="seating-grid" class="seating-chart"></div>
                    
                    <div class="mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                        💡 點擊空座位可選擇學生入座，點擊已入座的座位可移除
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        renderSeatingGrid();
    };

    /**
     * 渲染座位表格
     */
    window.renderSeatingGrid = function () {
        const grid = document.getElementById('seating-grid');
        if (!grid) return;

        grid.style.gridTemplateColumns = `repeat(${seatingConfig.cols}, 1fr)`;
        grid.innerHTML = `<div class="seating-podium">📚 講台</div>`;

        for (let row = 0; row < seatingConfig.rows; row++) {
            for (let col = 0; col < seatingConfig.cols; col++) {
                const key = `${row}-${col}`;
                const studentId = seatingConfig.layout[key];
                const student = studentId ? students?.find(s => s.id === studentId) : null;

                const seat = document.createElement('div');
                seat.className = `seat ${student ? 'occupied' : 'empty'}`;
                seat.dataset.key = key;
                seat.onclick = () => onSeatClick(key, student);

                if (student) {
                    seat.innerHTML = `
                        <span class="seat-avatar">${student.avatar || '😊'}</span>
                        <span class="seat-name">${student.name}</span>
                        <span class="seat-number">${student.number}</span>
                    `;
                } else {
                    seat.innerHTML = `
                        <span class="seat-number">${row * seatingConfig.cols + col + 1}</span>
                        <span style="font-size: 1.5rem; opacity: 0.3;">+</span>
                    `;
                }

                grid.appendChild(seat);
            }
        }
    };

    /**
     * 座位點擊事件
     */
    function onSeatClick(key, currentStudent) {
        if (currentStudent) {
            // 移除學生
            delete seatingConfig.layout[key];
            renderSeatingGrid();
            return;
        }

        // 顯示學生選擇器
        const unassigned = students?.filter(s =>
            !Object.values(seatingConfig.layout).includes(s.id)
        ) || [];

        if (unassigned.length === 0) {
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.warning('所有學生都已入座');
            }
            return;
        }

        // 簡易選擇器
        const picker = document.createElement('div');
        picker.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]';
        picker.onclick = (e) => { if (e.target === picker) picker.remove(); };

        picker.innerHTML = `
            <div class="bg-white rounded-xl p-4 max-w-md w-full mx-4 max-h-[60vh] overflow-auto">
                <h4 class="font-bold mb-3">選擇學生入座</h4>
                <div class="grid grid-cols-3 gap-2">
                    ${unassigned.map(s => `
                        <button onclick="assignSeat('${key}', ${s.id}); this.closest('.fixed').remove();"
                            class="p-2 bg-gray-50 rounded-lg hover:bg-blue-100 transition-colors text-center">
                            <div class="text-2xl">${s.avatar || '😊'}</div>
                            <div class="text-xs truncate">${s.name}</div>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;

        document.body.appendChild(picker);
    }

    /**
     * 分配座位
     */
    window.assignSeat = function (key, studentId) {
        seatingConfig.layout[key] = studentId;
        renderSeatingGrid();
    };

    /**
     * 更新座位格局
     */
    window.updateSeatingGrid = function () {
        seatingConfig.rows = parseInt(document.getElementById('seating-rows')?.value) || 6;
        seatingConfig.cols = parseInt(document.getElementById('seating-cols')?.value) || 6;
        renderSeatingGrid();
    };

    /**
     * 自動安排座位
     */
    window.autoAssignSeats = function () {
        seatingConfig.layout = {};
        const sortedStudents = [...(students || [])].sort((a, b) => (a.number || 0) - (b.number || 0));

        let index = 0;
        for (let row = 0; row < seatingConfig.rows && index < sortedStudents.length; row++) {
            for (let col = 0; col < seatingConfig.cols && index < sortedStudents.length; col++) {
                seatingConfig.layout[`${row}-${col}`] = sortedStudents[index].id;
                index++;
            }
        }

        renderSeatingGrid();
        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.success('已自動安排座位');
        }
    };

    /**
     * 清除座位
     */
    window.clearSeats = function () {
        seatingConfig.layout = {};
        renderSeatingGrid();
    };

    /**
     * 儲存座位表
     */
    window.saveSeatingChart = function () {
        localStorage.setItem('seatingConfig', JSON.stringify(seatingConfig));
        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.success('座位表已儲存');
        }
    };

    // ==================== 初始化 ====================
    function init() {
        // 注入樣式
        if (!document.getElementById('ui-enhancement-styles')) {
            const style = document.createElement('style');
            style.id = 'ui-enhancement-styles';
            style.textContent = darkModeEnhancementStyles + dragStyles + seatingStyles;
            document.head.appendChild(style);
        }

        // 初始化拖拽
        setTimeout(initStudentDrag, 500);

        // 添加座位表按鈕到學生管理區
        setTimeout(addSeatingButton, 600);

        console.log('✅ UI 增強模組已載入（深色模式完善、拖拽排序、座位表）');
    }

    /**
     * 添加座位表按鈕
     */
    function addSeatingButton() {
        const studentSection = document.getElementById('student-section');
        if (!studentSection || document.getElementById('seating-chart-btn')) return;

        const statsArea = studentSection.querySelector('.grid.grid-cols-2');
        if (statsArea) {
            const btn = document.createElement('button');
            btn.id = 'seating-chart-btn';
            btn.className = 'col-span-2 mt-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg hover:from-blue-600 hover:to-indigo-600 transition-all flex items-center justify-center gap-2';
            btn.innerHTML = '🪑 座位表';
            btn.onclick = showSeatingChart;
            statsArea.parentNode.insertBefore(btn, statsArea.nextSibling);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
