/**
 * 作業檢查增強模組
 * Homework Enhancement Module
 * 
 * 新功能：
 * 1. 作業科目分類
 * 2. 作業類型標籤
 * 3. 批量操作
 * 4. 科目篩選
 */

// 科目配置
const SUBJECTS = {
    '國語': { icon: '📚', color: 'blue' },
    '數學': { icon: '🔢', color: 'green' },
    '英語': { icon: '🔤', color: 'purple' },
    '自然': { icon: '🌱', color: 'emerald' },
    '社會': { icon: '🌍', color: 'orange' },
    '其他': { icon: '📝', color: 'gray' }
};

// 作業類型配置
const HOMEWORK_TYPES = {
    'daily': { name: '每日作業', icon: '📋' },
    'project': { name: '專題報告', icon: '🎨' },
    'exam': { name: '評量考試', icon: '📝' },
    'other': { name: '其他', icon: '📦' }
};

/**
 * 增強版新增作業函數
 * 需要在 HTML 中添加 homeworkSubject 和 homeworkType 選擇器
 */
function addHomeworkEnhanced() {
    const name = document.getElementById('homeworkName').value.trim();
    const due = document.getElementById('homeworkDue').value;
    const subject = document.getElementById('homeworkSubject')?.value || '其他';
    const type = document.getElementById('homeworkType')?.value || 'daily';

    if (!name || !due) {
        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.error('請填寫作業名稱和繳交日期');
        } else {
            alert('請填寫作業名稱和繳交日期');
        }
        return;
    }

    const homework = {
        id: Date.now(),
        name: name,
        due: due,
        subject: subject,
        type: type,
        createdAt: new Date().toISOString()
    };

    homeworkList.push(homework);
    localStorage.setItem('homeworkList', JSON.stringify(homeworkList));
    document.getElementById('homeworkName').value = '';

    renderHomeworkEnhanced();
    updateHomeworkSelect();

    if (typeof NotificationSystem !== 'undefined') {
        NotificationSystem.success(`已新增作業：${name}`);
    }
}

/**
 * 增強版渲染作業列表
 * 顯示科目標籤和類型圖示
 */
function renderHomeworkEnhanced() {
    const container = document.getElementById('homeworkList');
    if (!container) return;

    container.innerHTML = homeworkList.length === 0
        ? '<div class="text-gray-500 text-center">尚無作業項目</div>'
        : '';

    homeworkList.forEach(homework => {
        const subjectInfo = SUBJECTS[homework.subject] || SUBJECTS['其他'];
        const typeInfo = HOMEWORK_TYPES[homework.type] || HOMEWORK_TYPES['other'];
        const isOverdue = new Date(homework.due) < new Date() && !isHomeworkCompleted(homework.id);

        const div = document.createElement('div');
        div.className = `flex justify-between items-center p-3 bg-${subjectInfo.color}-50 border-l-4 border-${subjectInfo.color}-500 rounded ${isOverdue ? 'opacity-70' : ''}`;
        div.innerHTML = `
            <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-lg">${subjectInfo.icon}</span>
                    <span class="px-2 py-0.5 bg-${subjectInfo.color}-100 text-${subjectInfo.color}-700 text-xs rounded-full font-medium">${homework.subject}</span>
                    <span class="text-xs text-gray-500">${typeInfo.icon} ${typeInfo.name}</span>
                </div>
                <div class="font-semibold text-gray-800">${homework.name}</div>
                <div class="text-sm text-gray-600 flex items-center gap-2">
                    繳交日期：${homework.due}
                    ${isOverdue ? '<span class="text-red-500 font-semibold">⚠️ 已逾期</span>' : ''}
                </div>
            </div>
            <button onclick="removeHomework(${homework.id})" class="text-red-500 hover:text-red-700 ml-2">🗑️</button>
        `;
        container.appendChild(div);
    });
}

/**
 * 檢查作業是否已完成（所有學生都標記為完成）
 */
function isHomeworkCompleted(homeworkId) {
    const checks = homeworkChecks[homeworkId] || {};
    if (Object.keys(checks).length === 0) return false;
    return Object.values(checks).every(status => status === 'completed');
}

/**
 * 批量操作：將所有學生標記為已完成
 */
function markAllCompleted() {
    const select = document.getElementById('checkHomework');
    const homeworkId = select?.value;

    if (!homeworkId) {
        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.warning('請先選擇要檢查的作業');
        } else {
            alert('請先選擇要檢查的作業');
        }
        return;
    }

    if (!confirm('確定要將所有學生標記為已完成嗎？')) return;

    if (!homeworkChecks[homeworkId]) {
        homeworkChecks[homeworkId] = {};
    }

    students.forEach(student => {
        homeworkChecks[homeworkId][student.id] = 'completed';
    });

    localStorage.setItem('homeworkChecks', JSON.stringify(homeworkChecks));
    updateHomeworkCheckList();
    updateHomeworkStats();

    if (typeof NotificationSystem !== 'undefined') {
        NotificationSystem.success('已將所有學生標記為已完成');
    }
}

/**
 * 批量操作：重置所有學生狀態
 */
function resetAllStatus() {
    const select = document.getElementById('checkHomework');
    const homeworkId = select?.value;

    if (!homeworkId) {
        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.warning('請先選擇要檢查的作業');
        } else {
            alert('請先選擇要檢查的作業');
        }
        return;
    }

    if (!confirm('確定要重置所有學生的狀態嗎？')) return;

    delete homeworkChecks[homeworkId];
    localStorage.setItem('homeworkChecks', JSON.stringify(homeworkChecks));
    updateHomeworkCheckList();
    updateHomeworkStats();

    if (typeof NotificationSystem !== 'undefined') {
        NotificationSystem.info('已重置所有學生狀態');
    }
}

/**
 * 注入增強 UI 元素
 * 在 DOMContentLoaded 後調用
 */
function injectHomeworkEnhancements() {
    // 增強作業輸入區域
    const homeworkNameInput = document.getElementById('homeworkName');
    if (homeworkNameInput && !document.getElementById('homeworkSubject')) {
        // 插入科目和類型選擇器
        const selectorsHTML = `
            <div class="grid grid-cols-2 gap-2" id="homework-selectors">
                <select id="homeworkSubject"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm">
                    <option value="國語">📚 國語</option>
                    <option value="數學">🔢 數學</option>
                    <option value="英語">🔤 英語</option>
                    <option value="自然">🌱 自然</option>
                    <option value="社會">🌍 社會</option>
                    <option value="其他">📝 其他</option>
                </select>
                <select id="homeworkType"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm">
                    <option value="daily">📋 每日作業</option>
                    <option value="project">🎨 專題報告</option>
                    <option value="exam">📝 評量考試</option>
                    <option value="other">📦 其他</option>
                </select>
            </div>
        `;

        const selectorsDiv = document.createElement('div');
        selectorsDiv.innerHTML = selectorsHTML;
        homeworkNameInput.parentNode.insertBefore(selectorsDiv.firstElementChild, homeworkNameInput.nextSibling);
    }

    // 增強作業統計區域 - 添加批量操作按鈕
    const homeworkStats = document.getElementById('homeworkStats');
    if (homeworkStats && !document.getElementById('batch-actions')) {
        const batchActionsHTML = `
            <div id="batch-actions" class="mt-4 flex gap-2">
                <button onclick="markAllCompleted()" 
                    class="flex-1 bg-green-500 text-white py-2 px-3 rounded-lg hover:bg-green-600 transition-colors text-sm active:scale-95">
                    ✅ 全部完成
                </button>
                <button onclick="resetAllStatus()" 
                    class="flex-1 bg-gray-400 text-white py-2 px-3 rounded-lg hover:bg-gray-500 transition-colors text-sm active:scale-95">
                    🔄 重置全部
                </button>
            </div>
        `;
        homeworkStats.insertAdjacentHTML('afterend', batchActionsHTML);
    }

    // 覆蓋原本的 addHomework 函數
    if (typeof window.addHomework === 'function') {
        window._originalAddHomework = window.addHomework;
        window.addHomework = addHomeworkEnhanced;
    }

    // 覆蓋原本的 renderHomework 函數
    if (typeof window.renderHomework === 'function') {
        window._originalRenderHomework = window.renderHomework;
        window.renderHomework = renderHomeworkEnhanced;
    }

    // 重新渲染作業列表
    renderHomeworkEnhanced();

    console.log('✅ 作業檢查增強模組已載入');
}

// 在 DOM 載入完成後自動注入增強功能
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(injectHomeworkEnhancements, 100);
    });
} else {
    setTimeout(injectHomeworkEnhancements, 100);
}
