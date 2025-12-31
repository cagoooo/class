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

// ==================== P1 新增：範本系統 ====================
const NOTEBOOK_TEMPLATES = {
    'homework': {
        name: '📚 今日作業',
        content: `【今日作業】

國語：
數學：
英語：
其他：

※ 請家長簽名確認`
    },
    'weekend': {
        name: '🏠 週末通知',
        content: `【週末通知】

📅 週末愉快！

本週作業：
1. 
2. 
3. 

下週注意事項：
• 

祝 週末愉快！`
    },
    'exam': {
        name: '📝 考試提醒',
        content: `【考試提醒】

📅 考試日期：
📖 考試科目：
📚 考試範圍：

準備事項：
✅ 
✅ 
✅ 

加油！祝考試順利！`
    },
    'activity': {
        name: '🎉 活動通知',
        content: `【活動通知】

📅 活動日期：
🕐 活動時間：
📍 活動地點：
🎯 活動內容：

需準備物品：
• 
• 

注意事項：
1. 
2. `
    },
    'meeting': {
        name: '👨‍👩‍👧 家長會通知',
        content: `【家長會通知】

敬愛的家長您好：

📅 日期：
🕐 時間：
📍 地點：
📋 議程：

請務必撥冗出席，謝謝！

敬祝 順心`
    }
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

// ==================== P1 新增：範本應用 ====================

/**
 * 應用聯絡簿範本
 */
function applyNotebookTemplate(templateKey) {
    if (!templateKey) return;

    const template = NOTEBOOK_TEMPLATES[templateKey];
    if (!template) return;

    const contentEl = document.getElementById('notebookContent');
    if (contentEl) {
        // 如果已有內容，詢問是否覆蓋
        if (contentEl.value.trim() && !confirm('目前已有內容，確定要使用範本覆蓋嗎？')) {
            document.getElementById('notebook-template-select').value = '';
            return;
        }
        contentEl.value = template.content;
        contentEl.focus();
    }

    // 重置選擇器
    document.getElementById('notebook-template-select').value = '';

    if (typeof NotificationSystem !== 'undefined') {
        NotificationSystem.info(`已套用「${template.name}」範本`);
    }
}

// ==================== P1 新增：全螢幕編輯 ====================

/**
 * 開啟全螢幕編輯器
 */
function openFullscreenEditor() {
    const existingModal = document.getElementById('fullscreen-editor-modal');
    if (existingModal) existingModal.remove();

    const currentContent = document.getElementById('notebookContent')?.value || '';
    const currentDate = document.getElementById('notebookDate')?.value || new Date().toISOString().split('T')[0];
    const currentType = document.getElementById('notebookType')?.value || 'other';
    const currentPriority = document.getElementById('notebookPriority')?.value || 'normal';

    const modal = document.createElement('div');
    modal.id = 'fullscreen-editor-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50';

    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full h-full max-w-4xl max-h-[90vh] m-4 flex flex-col animate-bounce-in">
            <div class="flex items-center justify-between p-4 border-b bg-gradient-to-r from-indigo-500 to-purple-500 rounded-t-2xl">
                <h3 class="text-xl font-bold text-white flex items-center gap-2">
                    📝 全螢幕編輯模式
                </h3>
                <div class="flex items-center gap-2">
                    <span class="text-white text-sm opacity-75">Ctrl+Enter 儲存</span>
                    <button onclick="closeFullscreenEditor()" class="text-white hover:text-gray-200 text-2xl">✕</button>
                </div>
            </div>
            
            <div class="p-4 flex gap-4 bg-gray-50">
                <div class="flex items-center gap-2">
                    <label class="text-sm font-medium text-gray-700">日期：</label>
                    <input type="date" id="fs-date" value="${currentDate}"
                        class="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                </div>
                <div class="flex items-center gap-2">
                    <label class="text-sm font-medium text-gray-700">類型：</label>
                    <select id="fs-type" class="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                        <option value="homework" ${currentType === 'homework' ? 'selected' : ''}>📚 作業</option>
                        <option value="exam" ${currentType === 'exam' ? 'selected' : ''}>📝 考試</option>
                        <option value="activity" ${currentType === 'activity' ? 'selected' : ''}>🎉 活動</option>
                        <option value="notice" ${currentType === 'notice' ? 'selected' : ''}>📢 通知</option>
                        <option value="other" ${currentType === 'other' ? 'selected' : ''}>📌 其他</option>
                    </select>
                </div>
                <div class="flex items-center gap-2">
                    <label class="text-sm font-medium text-gray-700">優先級：</label>
                    <select id="fs-priority" class="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                        <option value="normal" ${currentPriority === 'normal' ? 'selected' : ''}>🟡 一般</option>
                        <option value="high" ${currentPriority === 'high' ? 'selected' : ''}>🔴 高優先</option>
                        <option value="low" ${currentPriority === 'low' ? 'selected' : ''}>🟢 低優先</option>
                    </select>
                </div>
                <div class="flex items-center gap-2 ml-auto">
                    <select id="fs-template" onchange="applyFsTemplate(this.value)"
                        class="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 bg-purple-50">
                        <option value="">📋 範本...</option>
                        ${Object.entries(NOTEBOOK_TEMPLATES).map(([key, tpl]) =>
        `<option value="${key}">${tpl.name}</option>`
    ).join('')}
                    </select>
                </div>
            </div>
            
            <div class="flex-1 p-4 overflow-hidden">
                <textarea id="fs-content" placeholder="在此輸入聯絡簿內容..."
                    class="w-full h-full p-4 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none text-lg leading-relaxed"
                    style="min-height: 300px;">${currentContent}</textarea>
            </div>
            
            <div class="flex gap-3 p-4 border-t bg-gray-50 rounded-b-2xl">
                <button onclick="closeFullscreenEditor()" 
                    class="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium">
                    取消
                </button>
                <button onclick="saveFromFullscreen()" 
                    class="flex-1 px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg hover:from-indigo-600 hover:to-purple-600 transition-colors font-medium">
                    💾 儲存並新增
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // 對焦到內容輸入框
    setTimeout(() => document.getElementById('fs-content')?.focus(), 100);

    // 綁定快捷鍵
    document.getElementById('fs-content').addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            saveFromFullscreen();
        }
    });
}

/**
 * 在全螢幕模式中應用範本
 */
function applyFsTemplate(templateKey) {
    if (!templateKey) return;

    const template = NOTEBOOK_TEMPLATES[templateKey];
    if (!template) return;

    const contentEl = document.getElementById('fs-content');
    if (contentEl) {
        if (contentEl.value.trim() && !confirm('目前已有內容，確定要使用範本覆蓋嗎？')) {
            document.getElementById('fs-template').value = '';
            return;
        }
        contentEl.value = template.content;
        contentEl.focus();
    }

    document.getElementById('fs-template').value = '';
}

/**
 * 從全螢幕模式儲存
 */
function saveFromFullscreen() {
    const date = document.getElementById('fs-date')?.value;
    const type = document.getElementById('fs-type')?.value;
    const priority = document.getElementById('fs-priority')?.value;
    const content = document.getElementById('fs-content')?.value.trim();

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

    closeFullscreenEditor();
    renderNotebookEnhanced();

    if (typeof NotificationSystem !== 'undefined') {
        NotificationSystem.success('已新增聯絡事項');
    }
}

/**
 * 關閉全螢幕編輯器
 */
function closeFullscreenEditor() {
    document.getElementById('fullscreen-editor-modal')?.remove();
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

    // P1 新增：添加範本選擇器
    const notebookContent = document.getElementById('notebookContent');
    if (notebookContent && !document.getElementById('notebook-template-select')) {
        const templateHTML = `
            <div class="flex gap-2 mb-2">
                <select id="notebook-template-select" onchange="applyNotebookTemplate(this.value)"
                    class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm bg-purple-50">
                    <option value="">📋 選擇範本...</option>
                    ${Object.entries(NOTEBOOK_TEMPLATES).map(([key, tpl]) =>
            `<option value="${key}">${tpl.name}</option>`
        ).join('')}
                </select>
                <button type="button" onclick="openFullscreenEditor()" 
                    class="px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors text-sm flex items-center gap-1">
                    ⤢ 全螢幕
                </button>
            </div>
        `;
        notebookContent.insertAdjacentHTML('beforebegin', templateHTML);
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
        setTimeout(injectNotebookEnhancements, 300);
    });
} else {
    setTimeout(injectNotebookEnhancements, 300);
}

// P1 新增：掛載函數到全域範圍，使 HTML onclick 可調用
window.applyNotebookTemplate = applyNotebookTemplate;
window.openFullscreenEditor = openFullscreenEditor;
window.applyFsTemplate = applyFsTemplate;
window.saveFromFullscreen = saveFromFullscreen;
window.closeFullscreenEditor = closeFullscreenEditor;
window.NOTEBOOK_TEMPLATES = NOTEBOOK_TEMPLATES;
