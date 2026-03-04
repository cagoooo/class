/**
 * 學生管理增強模組
 * Student Enhancement Module
 * 
 * 新功能：
 * 1. 學生頭像系統（預設表情符號頭像）
 * 2. 分組標籤系統
 */

// ==================== 配置 ====================

// 預設頭像選項
const DEFAULT_AVATARS = [
    '👦', '👧', '🧒', '👶', '🙂', '😊', '😎', '🤓',
    '🐱', '🐶', '🐰', '🐼', '🦊', '🐸', '🐵', '🦁',
    '⭐', '🌟', '💫', '🌈', '🎨', '📚', '🎵', '⚽'
];

// 預設標籤配置
const STUDENT_TAGS = {
    'leader': { name: '幹部', icon: '👑', color: 'yellow', bgClass: 'bg-yellow-100', textClass: 'text-yellow-800' },
    'helper': { name: '小老師', icon: '📖', color: 'blue', bgClass: 'bg-blue-100', textClass: 'text-blue-800' },
    'tutor': { name: '課輔', icon: '✏️', color: 'green', bgClass: 'bg-green-100', textClass: 'text-green-800' },
    'special': { name: '特殊需求', icon: '💝', color: 'pink', bgClass: 'bg-pink-100', textClass: 'text-pink-800' },
    'monitor': { name: '班長', icon: '🎖️', color: 'purple', bgClass: 'bg-purple-100', textClass: 'text-purple-800' },
    'vice': { name: '副班長', icon: '🏅', color: 'indigo', bgClass: 'bg-indigo-100', textClass: 'text-indigo-800' }
};

// ==================== 頭像系統 ====================

/**
 * 顯示頭像選擇器 Modal
 */
function showAvatarPicker(studentId = null) {
    // 移除舊的 Modal
    const existingModal = document.getElementById('avatar-picker-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'avatar-picker-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const currentAvatar = studentId ? (students.find(s => s.id === studentId)?.avatar || '😊') : '😊';

    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 animate-bounce-in">
            <h3 class="text-xl font-bold text-gray-800 mb-4 text-center">🎨 選擇頭像</h3>
            <div class="grid grid-cols-6 gap-3 mb-6" id="avatar-grid">
                ${DEFAULT_AVATARS.map(avatar => `
                    <button class="avatar-option w-12 h-12 text-2xl rounded-xl hover:bg-blue-100 transition-all
                        ${avatar === currentAvatar ? 'bg-blue-200 ring-2 ring-blue-500' : 'bg-gray-100'}"
                        data-avatar="${avatar}" onclick="selectAvatar('${avatar}', ${studentId})">
                        ${avatar}
                    </button>
                `).join('')}
            </div>
            <div class="flex gap-3">
                <button onclick="document.getElementById('avatar-picker-modal').remove()"
                    class="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
                    取消
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

/**
 * 選擇頭像
 */
function selectAvatar(avatar, studentId) {
    if (studentId) {
        // 更新現有學生的頭像
        const student = students.find(s => s.id === studentId);
        if (student) {
            student.avatar = avatar;
            localStorage.setItem(window.STUDENTS_KEY || 'students', JSON.stringify(students));
            renderStudentsEnhanced();
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.success(`已更新「${student.name}」的頭像`);
            }
        }
    } else {
        // 設定新增學生時的預選頭像
        window._pendingStudentAvatar = avatar;
        const avatarBtn = document.getElementById('new-student-avatar-btn');
        if (avatarBtn) avatarBtn.textContent = avatar;
    }

    document.getElementById('avatar-picker-modal')?.remove();
}

// ==================== 標籤系統 ====================

/**
 * 顯示標籤編輯器 Modal
 */
function showTagEditor(studentId) {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    // 初始化標籤陣列
    if (!student.tags) student.tags = [];

    const existingModal = document.getElementById('tag-editor-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'tag-editor-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 animate-bounce-in">
            <h3 class="text-xl font-bold text-gray-800 mb-2 text-center">🏷️ 編輯標籤</h3>
            <p class="text-gray-600 text-center mb-4">${student.name}</p>
            <div class="space-y-2 mb-6" id="tag-options">
                ${Object.entries(STUDENT_TAGS).map(([key, tag]) => `
                    <label class="flex items-center p-3 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors
                        ${student.tags.includes(key) ? tag.bgClass : 'bg-gray-100'}">
                        <input type="checkbox" value="${key}" 
                            ${student.tags.includes(key) ? 'checked' : ''}
                            class="w-5 h-5 rounded text-blue-500 mr-3"
                            onchange="toggleStudentTag(${studentId}, '${key}')">
                        <span class="text-lg mr-2">${tag.icon}</span>
                        <span class="${student.tags.includes(key) ? tag.textClass : 'text-gray-700'} font-medium">${tag.name}</span>
                    </label>
                `).join('')}
            </div>
            <button onclick="document.getElementById('tag-editor-modal').remove()"
                class="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
                完成
            </button>
        </div>
    `;

    document.body.appendChild(modal);
}

/**
 * 切換學生標籤
 */
function toggleStudentTag(studentId, tagKey) {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    if (!student.tags) student.tags = [];

    const index = student.tags.indexOf(tagKey);
    if (index > -1) {
        student.tags.splice(index, 1);
    } else {
        student.tags.push(tagKey);
    }

    localStorage.setItem(window.STUDENTS_KEY || 'students', JSON.stringify(students));

    // 更新 Modal 中的樣式
    const modal = document.getElementById('tag-editor-modal');
    if (modal) {
        const tag = STUDENT_TAGS[tagKey];
        const label = modal.querySelector(`input[value="${tagKey}"]`)?.parentElement;
        if (label) {
            if (student.tags.includes(tagKey)) {
                label.classList.remove('bg-gray-100');
                label.classList.add(tag.bgClass);
            } else {
                label.classList.remove(tag.bgClass);
                label.classList.add('bg-gray-100');
            }
        }
    }

    renderStudentsEnhanced();
}

// ==================== 增強版渲染 ====================

/**
 * 增強版學生列表渲染（支援搜尋功能）
 */
function renderStudentsEnhanced() {
    const container = document.getElementById('studentsList');
    if (!container) return;

    // 若骨架屏正顯示中（初次載入），稍作延遲讓動畫有時間展現
    const hasSkeleton = container.querySelector('.skeleton-container');
    if (hasSkeleton) {
        // 骨架屏已由 skeleton.js 插入，等待一小段時間後再渲染真實資料
        setTimeout(() => _doRenderStudents(container), 250);
        return;
    }

    _doRenderStudents(container);
}

/**
 * 學生列表實際渲染邏輯（內部函式）
 */
function _doRenderStudents(container) {
    container.innerHTML = '';

    // 安全性檢查：確保 students 是陣列
    const safeStudents = (typeof students !== 'undefined' && Array.isArray(students)) ? students : [];

    // 排序學生
    const sortedStudents = [...safeStudents].sort((a, b) => (a.number || 999) - (b.number || 999));

    // 套用搜尋過濾
    const filteredStudents = filterStudents(sortedStudents, (typeof currentSearchQuery !== 'undefined' ? currentSearchQuery : ''));

    // 更新搜尋統計
    updateSearchStats(filteredStudents.length, safeStudents.length);

    if (safeStudents.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center text-gray-500 p-6 bg-gray-50 rounded-lg">目前沒有學生，請從上方新增學生。</div>`;
    } else if (filteredStudents.length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center p-6 bg-gray-50 rounded-lg">
                <div class="text-4xl mb-3">🔍</div>
                <div class="text-gray-500">找不到符合「<span class="font-semibold text-gray-700">${currentSearchQuery}</span>」的學生</div>
                <div class="text-sm text-gray-400 mt-2">試試其他關鍵字或清除搜尋</div>
            </div>`;
    } else {
        filteredStudents.forEach(student => {
            const avatar = student.avatar || '😊';
            const tags = student.tags || [];

            const div = document.createElement('div');
            div.className = 'bg-gray-50 p-3 sm:p-4 rounded-lg border-l-4 border-blue-500 hover:shadow-md transition-shadow';

            // 如果正在搜尋，添加高亮動畫效果
            if (currentSearchQuery) {
                div.classList.add('ring-2', 'ring-blue-200');
            }

            // 標籤 HTML
            const tagsHTML = tags.length > 0 ? `
                <div class="flex flex-wrap gap-1 mt-2">
                    ${tags.map(tagKey => {
                const tag = STUDENT_TAGS[tagKey];
                return tag ? `<span class="px-2 py-0.5 text-xs rounded-full ${tag.bgClass} ${tag.textClass}">${tag.icon} ${tag.name}</span>` : '';
            }).join('')}
                </div>
            ` : '';

            // 高亮顯示姓名和座號
            const highlightedName = highlightSearchText(student.name, currentSearchQuery);
            const highlightedNumber = highlightSearchText(String(student.number), currentSearchQuery);

            div.innerHTML = `
                <div class="flex flex-col gap-1">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2 min-w-0 flex-1">
                            <button onclick="showAvatarPicker(${student.id})" 
                                class="text-xl hover:scale-110 transition-transform cursor-pointer flex-shrink-0"
                                title="點擊更換頭像">
                                ${avatar}
                            </button>
                            <span class="font-semibold text-gray-800 text-sm truncate">${highlightedName}</span>
                        </div>
                        <div class="flex items-center flex-shrink-0">
                            <button onclick="showTagEditor(${student.id})" 
                                class="text-sm p-0.5 text-blue-500 hover:text-blue-700" title="編輯標籤">🏷️</button>
                            <button onclick="showStudentReport(${student.id})" 
                                class="text-sm p-0.5 text-green-500 hover:text-green-700" title="查看報告">📊</button>
                            <button onclick="removeStudent(${student.id})" 
                                class="text-sm p-0.5 text-red-500 hover:text-red-700" title="刪除學生">🗑️</button>
                        </div>
                    </div>
                    <div class="text-xs text-gray-500 pl-7">
                        <span>座號：${highlightedNumber}</span>
                        <span class="ml-2 font-medium ${student.points >= 0 ? 'text-green-600' : 'text-red-600'}">分數：${student.points}</span>
                    </div>
                    ${tagsHTML}
                </div>
            `;

            container.appendChild(div);
        });
    }

    // 更新統計
    const totalEl = document.getElementById('totalStudents');
    if (totalEl) totalEl.textContent = safeStudents.length;

    const avgScoreEl = document.getElementById('averageScore');
    if (avgScoreEl) {
        const avgScore = safeStudents.length > 0 ? (safeStudents.reduce((sum, s) => sum + (s.points || 0), 0) / safeStudents.length).toFixed(1) : 0;
        avgScoreEl.textContent = avgScore;
    }
}

// ==================== 新增學生增強 ====================

/**
 * 增強新增學生表單
 */
function enhanceAddStudentForm() {
    const studentNameInput = document.getElementById('studentName');
    if (!studentNameInput || document.getElementById('new-student-avatar-btn')) return;

    // 在姓名輸入框前添加頭像選擇按鈕
    const avatarBtn = document.createElement('button');
    avatarBtn.type = 'button';
    avatarBtn.id = 'new-student-avatar-btn';
    avatarBtn.className = 'text-3xl hover:scale-110 transition-transform cursor-pointer bg-gray-100 rounded-lg p-2 mr-2';
    avatarBtn.textContent = '😊';
    avatarBtn.title = '選擇頭像';
    avatarBtn.onclick = () => showAvatarPicker(null);

    studentNameInput.parentNode.insertBefore(avatarBtn, studentNameInput);

    // 監聽新增學生事件
    const originalAddStudent = window.addStudent;
    if (originalAddStudent) {
        window.addStudent = function () {
            const pendingAvatar = window._pendingStudentAvatar || '😊';

            // 調用原始函數
            const studentCountBefore = (typeof students !== 'undefined' && Array.isArray(students)) ? students.length : 0;
            originalAddStudent.apply(this, arguments);

            // 如果成功新增了學生，更新頭像
            const currentStudents = (typeof students !== 'undefined' && Array.isArray(students)) ? students : [];
            if (currentStudents.length > studentCountBefore) {
                const newStudent = students[students.length - 1];
                newStudent.avatar = pendingAvatar;
                newStudent.tags = [];
                localStorage.setItem(window.STUDENTS_KEY || 'students', JSON.stringify(students));
                renderStudentsEnhanced();
            }

            // 重置
            window._pendingStudentAvatar = '😊';
            const avatarBtn = document.getElementById('new-student-avatar-btn');
            if (avatarBtn) avatarBtn.textContent = '😊';
        };
    }
}

// ==================== 搜尋功能 ====================

// 搜尋狀態
let currentSearchQuery = '';
let searchDebounceTimer = null;

/**
 * 初始化搜尋功能
 */
function initStudentSearch() {
    const searchInput = document.getElementById('studentSearch');
    const clearBtn = document.getElementById('clearSearch');
    const searchStats = document.getElementById('searchStats');

    if (!searchInput) return;

    // 輸入事件 - 使用防抖處理
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();

        // 顯示/隱藏清除按鈕
        if (clearBtn) {
            clearBtn.classList.toggle('hidden', query === '');
        }

        // 防抖處理
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            currentSearchQuery = query;
            renderStudentsEnhanced();
        }, 150);
    });

    // 清除按鈕點擊事件
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            currentSearchQuery = '';
            clearBtn.classList.add('hidden');
            if (searchStats) searchStats.textContent = '';
            renderStudentsEnhanced();
            searchInput.focus();
        });
    }

    // 支援 ESC 鍵清除搜尋
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            searchInput.value = '';
            currentSearchQuery = '';
            if (clearBtn) clearBtn.classList.add('hidden');
            if (searchStats) searchStats.textContent = '';
            renderStudentsEnhanced();
        }
    });
}

/**
 * 過濾學生列表
 * @param {Array} studentList - 學生陣列
 * @param {string} query - 搜尋關鍵字
 * @returns {Array} - 過濾後的學生陣列
 */
function filterStudents(studentList, query) {
    if (!Array.isArray(studentList)) return [];
    if (!query) return studentList;

    const lowerQuery = query.toLowerCase();

    return studentList.filter(student => {
        // 比對姓名
        const nameMatch = student.name.toLowerCase().includes(lowerQuery);
        // 比對座號（轉為字串比對）
        const numberMatch = String(student.number).includes(query);

        return nameMatch || numberMatch;
    });
}

/**
 * 高亮顯示搜尋關鍵字
 * @param {string} text - 原始文字
 * @param {string} query - 搜尋關鍵字
 * @returns {string} - 帶有高亮標記的 HTML
 */
function highlightSearchText(text, query) {
    if (!query) return text;

    // 轉義正則表達式特殊字元
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');

    return text.replace(regex, '<mark class="bg-yellow-200 px-0.5 rounded">$1</mark>');
}

/**
 * 更新搜尋統計
 * @param {number} filtered - 過濾後的數量
 * @param {number} total - 總數量
 */
function updateSearchStats(filtered, total) {
    const searchStats = document.getElementById('searchStats');
    if (!searchStats) return;

    if (!currentSearchQuery) {
        searchStats.textContent = '';
        return;
    }

    if (filtered === 0) {
        searchStats.innerHTML = `<span class="text-red-500">❌ 找不到符合「${currentSearchQuery}」的學生</span>`;
    } else if (filtered === total) {
        searchStats.innerHTML = `<span class="text-green-600">✅ 顯示全部 ${total} 位學生</span>`;
    } else {
        searchStats.innerHTML = `<span class="text-blue-600">🔍 找到 ${filtered} / ${total} 位學生</span>`;
    }
}

// ==================== 初始化 ====================

/**
 * 初始化學生增強模組
 */
function initStudentEnhancement() {
    // 初始化搜尋功能
    initStudentSearch();

    // 增強新增學生表單
    enhanceAddStudentForm();

    // 覆蓋原本的 renderStudents 函數
    if (typeof window.renderStudents === 'function') {
        window._originalRenderStudents = window.renderStudents;
        window.renderStudents = renderStudentsEnhanced;
    }

    // 初始渲染
    renderStudentsEnhanced();

    console.log('✅ 學生增強模組已載入');
}

// 在 DOM 載入完成後自動初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initStudentEnhancement, 200);
    });
} else {
    setTimeout(initStudentEnhancement, 200);
}
