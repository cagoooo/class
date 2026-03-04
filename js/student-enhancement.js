/**
 * 摮貊?蝞∠?憓撥璅∠?
 * Student Enhancement Module
 * 
 * ?啣??踝?
 * 1. 摮貊??剖?蝟餌絞嚗?閮剛”?泵???
 * 2. ??璅惜蝟餌絞
 */

// ==================== ?蔭 ====================

// ?身?剖??賊?
const DEFAULT_AVATARS = [
    '?', '?', '??', '?', '??', '??', '??', '??',
    '?', '?', '?', '?', '??', '?', '?', '??',
    '潃?, '??', '?', '??', '?', '??', '?', '??
];

// ?身璅惜?蔭
const STUDENT_TAGS = {
    'leader': { name: '撟寥', icon: '??', color: 'yellow', bgClass: 'bg-yellow-100', textClass: 'text-yellow-800' },
    'helper': { name: '撠葦', icon: '??', color: 'blue', bgClass: 'bg-blue-100', textClass: 'text-blue-800' },
    'tutor': { name: '隤脰?', icon: '??', color: 'green', bgClass: 'bg-green-100', textClass: 'text-green-800' },
    'special': { name: '?寞??瘙?, icon: '??', color: 'pink', bgClass: 'bg-pink-100', textClass: 'text-pink-800' },
    'monitor': { name: '?剝', icon: '??儭?, color: 'purple', bgClass: 'bg-purple-100', textClass: 'text-purple-800' },
    'vice': { name: '?舐??, icon: '??', color: 'indigo', bgClass: 'bg-indigo-100', textClass: 'text-indigo-800' }
};

// ==================== ?剖?蝟餌絞 ====================

/**
 * 憿舐內?剖??豢???Modal
 */
function showAvatarPicker(studentId = null) {
    // 蝘駁?? Modal
    const existingModal = document.getElementById('avatar-picker-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'avatar-picker-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const currentAvatar = studentId ? (students.find(s => s.id === studentId)?.avatar || '??') : '??';

    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 animate-bounce-in">
            <h3 class="text-xl font-bold text-gray-800 mb-4 text-center">? ?豢??剖?</h3>
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
                    ??
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

/**
 * ?豢??剖?
 */
function selectAvatar(avatar, studentId) {
    if (studentId) {
        // ?湔?暹?摮貊????
        const student = students.find(s => s.id === studentId);
        if (student) {
            student.avatar = avatar;
            localStorage.setItem(window.STUDENTS_KEY || 'students', JSON.stringify(students));
            renderStudentsEnhanced();
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.success(`撌脫?啜?{student.name}???剖?`);
            }
        }
    } else {
        // 閮剖??啣?摮貊?????剖?
        window._pendingStudentAvatar = avatar;
        const avatarBtn = document.getElementById('new-student-avatar-btn');
        if (avatarBtn) avatarBtn.textContent = avatar;
    }

    document.getElementById('avatar-picker-modal')?.remove();
}

// ==================== 璅惜蝟餌絞 ====================

/**
 * 憿舐內璅惜蝺刻摩??Modal
 */
function showTagEditor(studentId) {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    // ????蝐日??
    if (!student.tags) student.tags = [];

    const existingModal = document.getElementById('tag-editor-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'tag-editor-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 animate-bounce-in">
            <h3 class="text-xl font-bold text-gray-800 mb-2 text-center">?儭?蝺刻摩璅惜</h3>
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
                摰?
            </button>
        </div>
    `;

    document.body.appendChild(modal);
}

/**
 * ??摮貊?璅惜
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

    // ?湔 Modal 銝剔?璅??
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

// ==================== 憓撥?葡??====================

/**
 * 憓撥?飛??銵冽葡???舀???嚗?
 */
function renderStudentsEnhanced() {
    const container = document.getElementById('studentsList');
    if (!container) return;

    // ?仿爸?嗅?甇?＊蝷箔葉嚗?甈∟??伐?嚗?雿辣?脰????????
    const hasSkeleton = container.querySelector('.skeleton-container');
    if (hasSkeleton) {
        // 撉冽撅歇??skeleton.js ?嚗?敺?撠挾??敺?皜脫??祕鞈?
        setTimeout(() => _doRenderStudents(container), 250);
        return;
    }

    _doRenderStudents(container);
}

/**
 * 摮貊??”撖阡?皜脫??摩嚗?典撘?
 */
function _doRenderStudents(container) {
    container.innerHTML = '';

    // 摰?扳炎?伐?蝣箔? students ?舫??
    const safeStudents = (typeof students !== 'undefined' && Array.isArray(students)) ? students : [];

    // ??摮貊?
    const sortedStudents = [...safeStudents].sort((a, b) => (a.number || 999) - (b.number || 999));

    // 憟???蕪
    const filteredStudents = filterStudents(sortedStudents, (typeof currentSearchQuery !== 'undefined' ? currentSearchQuery : ''));

    // ?湔??蝯梯?
    updateSearchStats(filteredStudents.length, safeStudents.length);

    if (safeStudents.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center text-gray-500 p-6 bg-gray-50 rounded-lg">?桀?瘝?摮貊?嚗?敺??寞憓飛??/div>`;
    } else if (filteredStudents.length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center p-6 bg-gray-50 rounded-lg">
                <div class="text-4xl mb-3">??</div>
                <div class="text-gray-500">?曆??啁泵??span class="font-semibold text-gray-700">${currentSearchQuery}</span>??摮貊?</div>
                <div class="text-sm text-gray-400 mt-2">閰西岫?嗡??摮?皜??</div>
            </div>`;
    } else {
        filteredStudents.forEach(student => {
            const avatar = student.avatar || '??';
            const tags = student.tags || [];

            const div = document.createElement('div');
            div.className = 'bg-gray-50 p-3 sm:p-4 rounded-lg border-l-4 border-blue-500 hover:shadow-md transition-shadow';

            // 憒?甇???嚗溶??鈭桀??急???
            if (currentSearchQuery) {
                div.classList.add('ring-2', 'ring-blue-200');
            }

            // 璅惜 HTML
            const tagsHTML = tags.length > 0 ? `
                <div class="flex flex-wrap gap-1 mt-2">
                    ${tags.map(tagKey => {
                const tag = STUDENT_TAGS[tagKey];
                return tag ? `<span class="px-2 py-0.5 text-xs rounded-full ${tag.bgClass} ${tag.textClass}">${tag.icon} ${tag.name}</span>` : '';
            }).join('')}
                </div>
            ` : '';

            // 擃漁憿舐內憪??漣??
            const highlightedName = highlightSearchText(student.name, currentSearchQuery);
            const highlightedNumber = highlightSearchText(String(student.number), currentSearchQuery);

            div.innerHTML = `
                <div class="flex flex-col gap-1">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2 min-w-0 flex-1">
                            <button onclick="showAvatarPicker(${student.id})" 
                                class="text-xl hover:scale-110 transition-transform cursor-pointer flex-shrink-0"
                                title="暺??湔??剖?">
                                ${avatar}
                            </button>
                            <span class="font-semibold text-gray-800 text-sm truncate">${highlightedName}</span>
                        </div>
                        <div class="flex items-center flex-shrink-0">
                            <button onclick="showTagEditor(${student.id})" 
                                class="text-sm p-0.5 text-blue-500 hover:text-blue-700" title="蝺刻摩璅惜">?儭?/button>
                            <button onclick="showStudentReport(${student.id})" 
                                class="text-sm p-0.5 text-green-500 hover:text-green-700" title="?亦??勗?">??</button>
                            <button onclick="removeStudent(${student.id})" 
                                class="text-sm p-0.5 text-red-500 hover:text-red-700" title="?芷摮貊?">??儭?/button>
                        </div>
                    </div>
                    <div class="text-xs text-gray-500 pl-7">
                        <span>摨扯?嚗?{highlightedNumber}</span>
                        <span class="ml-2 font-medium ${student.points >= 0 ? 'text-green-600' : 'text-red-600'}">?嚗?{student.points}</span>
                    </div>
                    ${tagsHTML}
                </div>
            `;

            container.appendChild(div);
        });
    }

    // ?湔蝯梯?
    const totalEl = document.getElementById('totalStudents');
    if (totalEl) totalEl.textContent = safeStudents.length;

    const avgScoreEl = document.getElementById('averageScore');
    if (avgScoreEl) {
        const avgScore = safeStudents.length > 0 ? (safeStudents.reduce((sum, s) => sum + (s.points || 0), 0) / safeStudents.length).toFixed(1) : 0;
        avgScoreEl.textContent = avgScore;
    }
}

// ==================== ?啣?摮貊?憓撥 ====================

/**
 * 憓撥?啣?摮貊?銵典
 */
function enhanceAddStudentForm() {
    const studentNameInput = document.getElementById('studentName');
    if (!studentNameInput || document.getElementById('new-student-avatar-btn')) return;

    // ?典??撓?交??溶??????
    const avatarBtn = document.createElement('button');
    avatarBtn.type = 'button';
    avatarBtn.id = 'new-student-avatar-btn';
    avatarBtn.className = 'text-3xl hover:scale-110 transition-transform cursor-pointer bg-gray-100 rounded-lg p-2 mr-2';
    avatarBtn.textContent = '??';
    avatarBtn.title = '?豢??剖?';
    avatarBtn.onclick = () => showAvatarPicker(null);

    studentNameInput.parentNode.insertBefore(avatarBtn, studentNameInput);

    // ???啣?摮貊?鈭辣
    const originalAddStudent = window.addStudent;
    if (originalAddStudent) {
        window.addStudent = function () {
            const pendingAvatar = window._pendingStudentAvatar || '??';

            // 隤輻???賣
            const studentCountBefore = (typeof students !== 'undefined' && Array.isArray(students)) ? students.length : 0;
            originalAddStudent.apply(this, arguments);

            // 憒????啣?鈭飛???湔?剖?
            const currentStudents = (typeof students !== 'undefined' && Array.isArray(students)) ? students : [];
            if (currentStudents.length > studentCountBefore) {
                const newStudent = students[students.length - 1];
                newStudent.avatar = pendingAvatar;
                newStudent.tags = [];
                localStorage.setItem(window.STUDENTS_KEY || 'students', JSON.stringify(students));
                renderStudentsEnhanced();
            }

            // ?蔭
            window._pendingStudentAvatar = '??';
            const avatarBtn = document.getElementById('new-student-avatar-btn');
            if (avatarBtn) avatarBtn.textContent = '??';
        };
    }
}

// ==================== ??? ====================

// ?????
let currentSearchQuery = '';
let searchDebounceTimer = null;

/**
 * ????撠???
 */
function initStudentSearch() {
    const searchInput = document.getElementById('studentSearch');
    const clearBtn = document.getElementById('clearSearch');
    const searchStats = document.getElementById('searchStats');

    if (!searchInput) return;

    // 頛詨鈭辣 - 雿輻?脫???
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();

        // 憿舐內/?梯?皜??
        if (clearBtn) {
            clearBtn.classList.toggle('hidden', query === '');
        }

        // ?脫???
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            currentSearchQuery = query;
            renderStudentsEnhanced();
        }, 150);
    });

    // 皜??暺?鈭辣
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

    // ?舀 ESC ?菜??斗?撠?
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
 * ?蕪摮貊??”
 * @param {Array} studentList - 摮貊????
 * @param {string} query - ???摮?
 * @returns {Array} - ?蕪敺?摮貊????
 */
function filterStudents(studentList, query) {
    if (!Array.isArray(studentList)) return [];
    if (!query) return studentList;

    const lowerQuery = query.toLowerCase();

    return studentList.filter(student => {
        // 瘥?憪?
        const nameMatch = student.name.toLowerCase().includes(lowerQuery);
        // 瘥?摨扯?嚗??箏?銝脫?撠?
        const numberMatch = String(student.number).includes(query);

        return nameMatch || numberMatch;
    });
}

/**
 * 擃漁憿舐內???摮?
 * @param {string} text - ????
 * @param {string} query - ???摮?
 * @returns {string} - 撣嗆?擃漁璅???HTML
 */
function highlightSearchText(text, query) {
    if (!query) return text;

    // 頧儔甇??銵券?撘畾???
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');

    return text.replace(regex, '<mark class="bg-yellow-200 px-0.5 rounded">$1</mark>');
}

/**
 * ?湔??蝯梯?
 * @param {number} filtered - ?蕪敺??賊?
 * @param {number} total - 蝮賣??
 */
function updateSearchStats(filtered, total) {
    const searchStats = document.getElementById('searchStats');
    if (!searchStats) return;

    if (!currentSearchQuery) {
        searchStats.textContent = '';
        return;
    }

    if (filtered === 0) {
        searchStats.innerHTML = `<span class="text-red-500">???曆??啁泵??{currentSearchQuery}??摮貊?</span>`;
    } else if (filtered === total) {
        searchStats.innerHTML = `<span class="text-green-600">??憿舐內?券 ${total} 雿飛??/span>`;
    } else {
        searchStats.innerHTML = `<span class="text-blue-600">?? ?曉 ${filtered} / ${total} 雿飛??/span>`;
    }
}

// ==================== ????====================

/**
 * ???飛??撘瑟芋蝯?
 */
function initStudentEnhancement() {
    // ????撠???
    initStudentSearch();

    // 憓撥?啣?摮貊?銵典
    enhanceAddStudentForm();

    // 閬????renderStudents ?賣
    if (typeof window.renderStudents === 'function') {
        window._originalRenderStudents = window.renderStudents;
        window.renderStudents = renderStudentsEnhanced;
    }

    // ??皜脫?
    renderStudentsEnhanced();

    console.log('??摮貊?憓撥璅∠?撌脰???);
}

// ??DOM 頛摰?敺??憪?
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initStudentEnhancement, 200);
    });
} else {
    setTimeout(initStudentEnhancement, 200);
}
