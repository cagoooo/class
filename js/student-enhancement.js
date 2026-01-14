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
            localStorage.setItem('students', JSON.stringify(students));
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

    localStorage.setItem('students', JSON.stringify(students));

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
 * 增強版學生列表渲染
 */
function renderStudentsEnhanced() {
    const container = document.getElementById('studentsList');
    if (!container) return;

    container.innerHTML = '';

    if (students.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center text-gray-500 p-6 bg-gray-50 rounded-lg">目前沒有學生，請從上方新增學生。</div>`;
    } else {
        students.sort((a, b) => (a.number || 999) - (b.number || 999)).forEach(student => {
            const avatar = student.avatar || '😊';
            const tags = student.tags || [];

            const div = document.createElement('div');
            div.className = 'bg-gray-50 p-3 sm:p-4 rounded-lg border-l-4 border-blue-500 hover:shadow-md transition-shadow';

            // 標籤 HTML
            const tagsHTML = tags.length > 0 ? `
                <div class="flex flex-wrap gap-1 mt-2">
                    ${tags.map(tagKey => {
                const tag = STUDENT_TAGS[tagKey];
                return tag ? `<span class="px-2 py-0.5 text-xs rounded-full ${tag.bgClass} ${tag.textClass}">${tag.icon} ${tag.name}</span>` : '';
            }).join('')}
                </div>
            ` : '';

            div.innerHTML = `
                <div class="flex flex-col gap-1">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2 min-w-0 flex-1">
                            <button onclick="showAvatarPicker(${student.id})" 
                                class="text-xl hover:scale-110 transition-transform cursor-pointer flex-shrink-0"
                                title="點擊更換頭像">
                                ${avatar}
                            </button>
                            <span class="font-semibold text-gray-800 text-sm truncate">${student.name}</span>
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
                        <span>座號：${student.number}</span>
                        <span class="ml-2 font-medium ${student.points >= 0 ? 'text-green-600' : 'text-red-600'}">分數：${student.points}</span>
                    </div>
                    ${tagsHTML}
                </div>
            `;

            container.appendChild(div);
        });
    }

    // 更新統計
    document.getElementById('totalStudents').textContent = students.length;
    const avgScore = students.length > 0 ? (students.reduce((sum, s) => sum + s.points, 0) / students.length).toFixed(1) : 0;
    document.getElementById('averageScore').textContent = avgScore;
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
            const studentCountBefore = students.length;
            originalAddStudent.apply(this, arguments);

            // 如果成功新增了學生，更新頭像
            if (students.length > studentCountBefore) {
                const newStudent = students[students.length - 1];
                newStudent.avatar = pendingAvatar;
                newStudent.tags = [];
                localStorage.setItem('students', JSON.stringify(students));
                renderStudentsEnhanced();
            }

            // 重置
            window._pendingStudentAvatar = '😊';
            const avatarBtn = document.getElementById('new-student-avatar-btn');
            if (avatarBtn) avatarBtn.textContent = '😊';
        };
    }
}

// ==================== 初始化 ====================

/**
 * 初始化學生增強模組
 */
function initStudentEnhancement() {
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
