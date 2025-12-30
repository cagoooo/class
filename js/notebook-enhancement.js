/**
 * 聯絡簿增強模組
 * Notebook Enhancement Module
 * 
 * 新功能：
 * 1. 優先級標記（高/中/低）
 * 2. 優先級顏色顯示
 * 3. 快速篩選
 */

// 優先級配置
const PRIORITIES = {
    'high': {
        name: '高優先',
        icon: '🔴',
        color: 'red',
        bgClass: 'bg-red-50',
        borderClass: 'border-red-500',
        textClass: 'text-red-600'
    },
    'normal': {
        name: '一般',
        icon: '🟡',
        color: 'yellow',
        bgClass: 'bg-yellow-50',
        borderClass: 'border-yellow-500',
        textClass: 'text-yellow-600'
    },
    'low': {
        name: '低優先',
        icon: '🟢',
        color: 'green',
        bgClass: 'bg-green-50',
        borderClass: 'border-green-500',
        textClass: 'text-green-600'
    }
};

// 聯絡簿類型圖示映射
const NOTEBOOK_TYPE_ICONS = {
    'homework': '📚',
    'exam': '📝',
    'activity': '🎉',
    'notice': '📢',
    'other': '📌'
};

/**
 * 增強版新增聯絡簿函數
 */
function addNotebookEnhanced() {
    const date = document.getElementById('notebookDate').value;
    const type = document.getElementById('notebookType').value;
    const content = document.getElementById('notebookContent').value.trim();
    const priority = document.getElementById('notebookPriority')?.value || 'normal';

    if (!date || !content) {
        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.error('請填寫日期和內容');
        } else {
            alert('請填寫日期和內容');
        }
        return;
    }

    const entry = {
        id: Date.now(),
        date: date,
        type: type,
        content: content,
        priority: priority,
        timestamp: new Date().toLocaleString('zh-TW')
    };

    notebookEntries.unshift(entry);
    localStorage.setItem('notebookEntries', JSON.stringify(notebookEntries));

    document.getElementById('notebookContent').value = '';
    renderNotebookEnhanced();

    if (typeof NotificationSystem !== 'undefined') {
        NotificationSystem.success('已新增聯絡事項');
    }
}

/**
 * 增強版渲染聯絡簿
 */
function renderNotebookEnhanced() {
    const container = document.getElementById('notebookList');
    if (!container) return;

    const typeInfo = {
        homework: { name: '作業', color: 'blue' },
        exam: { name: '考試', color: 'red' },
        activity: { name: '活動', color: 'green' },
        notice: { name: '通知', color: 'yellow' },
        other: { name: '其他', color: 'gray' }
    };

    container.innerHTML = '';

    if (notebookEntries.length === 0) {
        container.innerHTML = '<div class="text-gray-500 text-center py-4">尚無聯絡事項</div>';
        return;
    }

    notebookEntries.forEach(entry => {
        const priority = PRIORITIES[entry.priority] || PRIORITIES['normal'];
        const type = typeInfo[entry.type] || typeInfo['other'];
        const typeIcon = NOTEBOOK_TYPE_ICONS[entry.type] || '📌';

        const div = document.createElement('div');
        div.className = `notebook-item flex items-start p-3 ${priority.bgClass} border-l-4 ${priority.borderClass} rounded-lg shadow-sm`;
        div.draggable = true;
        div.dataset.id = entry.id;

        div.innerHTML = `
            <span class="drag-handle cursor-move text-gray-500 hover:text-gray-800 mr-3 text-2xl" style="padding-top: 0.3rem;">⠿</span>
            <div class="flex-1">
                <div class="flex justify-between items-start">
                    <div>
                        <div class="flex items-center gap-2 mb-2 flex-wrap">
                            <span class="text-lg">${priority.icon}</span>
                            <span class="px-2 py-0.5 bg-white text-sm font-semibold rounded">${typeIcon} ${type.name}</span>
                            <span class="text-sm text-gray-600">${entry.date}</span>
                        </div>
                        <div class="text-gray-800 whitespace-pre-wrap">${entry.content}</div>
                        <div class="text-xs text-gray-500 mt-2">建立時間：${entry.timestamp}</div>
                    </div>
                    <button onclick="removeNotebook(${entry.id})" class="text-red-500 hover:text-red-700 ml-4">🗑️</button>
                </div>
            </div>
        `;

        container.appendChild(div);
    });

    // 重新綁定拖曳事件
    if (typeof addNotebookDragListeners === 'function') {
        addNotebookDragListeners();
    }
}

/**
 * 按優先級篩選聯絡簿
 */
function filterNotebookByPriority(priority) {
    const container = document.getElementById('notebookList');
    if (!container) return;

    const items = container.querySelectorAll('.notebook-item');

    items.forEach(item => {
        const itemId = parseInt(item.dataset.id);
        const entry = notebookEntries.find(e => e.id === itemId);

        if (!priority || priority === 'all' || (entry && entry.priority === priority)) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
}

/**
 * 注入增強 UI 元素
 */
function injectNotebookEnhancements() {
    // 增強聯絡簿輸入區域 - 添加優先級選擇器
    const notebookTypeSelect = document.getElementById('notebookType');
    if (notebookTypeSelect && !document.getElementById('notebookPriority')) {
        const priorityHTML = `
            <select id="notebookPriority"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 text-sm">
                <option value="normal">🟡 一般優先</option>
                <option value="high">🔴 高優先</option>
                <option value="low">🟢 低優先</option>
            </select>
        `;

        const priorityDiv = document.createElement('div');
        priorityDiv.className = 'priority-selector';
        priorityDiv.innerHTML = priorityHTML;
        notebookTypeSelect.parentNode.insertBefore(priorityDiv.firstElementChild, notebookTypeSelect.nextSibling);
    }

    // 在聯絡簿記錄標題旁添加篩選器
    const notebookListHeader = document.querySelector('#notebook-section h3');
    if (notebookListHeader && notebookListHeader.textContent.includes('聯絡簿記錄') && !document.getElementById('priority-filter')) {
        const filterHTML = `
            <div id="priority-filter" class="flex gap-1 ml-2">
                <button onclick="filterNotebookByPriority('all')" class="px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300">全部</button>
                <button onclick="filterNotebookByPriority('high')" class="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200">🔴</button>
                <button onclick="filterNotebookByPriority('normal')" class="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200">🟡</button>
                <button onclick="filterNotebookByPriority('low')" class="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200">🟢</button>
            </div>
        `;
        notebookListHeader.insertAdjacentHTML('afterend', filterHTML);
        notebookListHeader.style.display = 'inline-block';
    }

    // 覆蓋原本的函數
    if (typeof window.addNotebook === 'function') {
        window._originalAddNotebook = window.addNotebook;
        window.addNotebook = addNotebookEnhanced;
    }

    if (typeof window.renderNotebook === 'function') {
        window._originalRenderNotebook = window.renderNotebook;
        window.renderNotebook = renderNotebookEnhanced;
    }

    // 重新渲染
    renderNotebookEnhanced();

    console.log('✅ 聯絡簿增強模組已載入');
}

// 在 DOM 載入完成後自動注入增強功能
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(injectNotebookEnhancements, 150);
    });
} else {
    setTimeout(injectNotebookEnhancements, 150);
}
