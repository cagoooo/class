/**
 * 隨機分組增強模組
 * 提供洗牌動畫、分組預覽、音效、彩花等功能
 */

(function () {
    'use strict';

    // 組別顏色配置
    const GROUP_COLORS = [
        { border: 'border-red-500', bg: 'bg-red-50', text: 'text-red-700', accent: 'bg-red-500' },
        { border: 'border-orange-500', bg: 'bg-orange-50', text: 'text-orange-700', accent: 'bg-orange-500' },
        { border: 'border-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', accent: 'bg-amber-500' },
        { border: 'border-green-500', bg: 'bg-green-50', text: 'text-green-700', accent: 'bg-green-500' },
        { border: 'border-teal-500', bg: 'bg-teal-50', text: 'text-teal-700', accent: 'bg-teal-500' },
        { border: 'border-blue-500', bg: 'bg-blue-50', text: 'text-blue-700', accent: 'bg-blue-500' },
        { border: 'border-indigo-500', bg: 'bg-indigo-50', text: 'text-indigo-700', accent: 'bg-indigo-500' },
        { border: 'border-purple-500', bg: 'bg-purple-50', text: 'text-purple-700', accent: 'bg-purple-500' },
        { border: 'border-pink-500', bg: 'bg-pink-50', text: 'text-pink-700', accent: 'bg-pink-500' },
        { border: 'border-cyan-500', bg: 'bg-cyan-50', text: 'text-cyan-700', accent: 'bg-cyan-500' }
    ];

    // 組別表情符號
    const GROUP_EMOJIS = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '💜', '💖', '💙', '💚'];

    // 初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        setupPreview();
        enhanceGroupingButton();
        console.log('🧩 分組增強模組已載入');
    }

    // 設置分組預覽
    function setupPreview() {
        const methodSelect = document.getElementById('groupingMethod');
        const valueInput = document.getElementById('groupingValue');

        if (!methodSelect || !valueInput) return;

        // 創建預覽區域
        const previewDiv = document.createElement('div');
        previewDiv.id = 'groupingPreview';
        previewDiv.className = 'mt-3 p-3 bg-cyan-50 rounded-lg text-sm text-cyan-800 hidden';

        const button = document.querySelector('button[onclick="startGrouping()"]');
        if (button) {
            button.parentNode.insertBefore(previewDiv, button);
        }

        // 監聽變化
        const updatePreview = () => {
            const studentCount = (typeof students !== 'undefined') ? students.length : 0;
            if (studentCount === 0) {
                previewDiv.classList.add('hidden');
                return;
            }

            const method = methodSelect.value;
            const value = parseInt(valueInput.value) || 0;

            if (value <= 0) {
                previewDiv.classList.add('hidden');
                return;
            }

            let groupCount, membersPerGroup, minMembers, maxMembers;

            if (method === 'byGroupCount') {
                groupCount = Math.min(value, studentCount);
                membersPerGroup = Math.floor(studentCount / groupCount);
                const remainder = studentCount % groupCount;
                minMembers = membersPerGroup;
                maxMembers = membersPerGroup + (remainder > 0 ? 1 : 0);
            } else {
                membersPerGroup = value;
                groupCount = Math.ceil(studentCount / membersPerGroup);
                const remainder = studentCount % membersPerGroup;
                minMembers = remainder > 0 ? remainder : membersPerGroup;
                maxMembers = membersPerGroup;
            }

            const memberRange = minMembers === maxMembers ?
                `${minMembers}人/組` :
                `${minMembers}~${maxMembers}人/組`;

            previewDiv.innerHTML = `📊 <strong>預覽：</strong>${studentCount}人 → ${groupCount}組 (${memberRange})`;
            previewDiv.classList.remove('hidden');
        };

        methodSelect.addEventListener('change', updatePreview);
        valueInput.addEventListener('input', updatePreview);

        // 初始更新
        setTimeout(updatePreview, 100);
    }

    // 增強分組按鈕
    function enhanceGroupingButton() {
        const button = document.querySelector('button[onclick="startGrouping()"]');
        if (!button) return;

        // 移除原有 onclick，改用新的動畫版本
        button.removeAttribute('onclick');
        button.innerHTML = '🎲 開始隨機分組';
        button.addEventListener('click', startGroupingWithAnimation);
    }

    // 帶動畫的分組功能
    window.startGroupingWithAnimation = async function () {
        if (typeof students === 'undefined' || students.length === 0) {
            alert('請先新增學生！');
            return;
        }

        const method = document.getElementById('groupingMethod').value;
        const value = parseInt(document.getElementById('groupingValue').value);

        if (isNaN(value) || value <= 0) {
            alert('請輸入有效數字！');
            return;
        }

        if (method === 'byGroupCount' && value > students.length) {
            alert('組數不能超過學生總人數！');
            return;
        }

        if (method === 'byMemberCount' && value > students.length) {
            alert('每組人數不能超過學生總人數！');
            return;
        }

        const button = document.querySelector('button[onclick="startGroupingWithAnimation()"]') ||
            document.querySelector('#grouping-section button.bg-cyan-500');
        const container = document.getElementById('groupingResult');

        // 禁用按鈕
        if (button) {
            button.disabled = true;
            button.classList.add('opacity-50', 'cursor-not-allowed');
            button.innerHTML = '🔄 分組中...';
        }

        // 顯示洗牌動畫
        container.innerHTML = `
            <div class="col-span-full text-center py-8">
                <div id="shuffleAnimation" class="text-4xl font-bold text-cyan-600 mb-4"></div>
                <div class="text-gray-600 mb-4">🔀 正在隨機洗牌中...</div>
                <div class="w-full max-w-xs mx-auto bg-gray-200 rounded-full h-3">
                    <div id="groupingProgress" class="bg-gradient-to-r from-cyan-500 to-teal-500 h-3 rounded-full transition-all duration-300" style="width: 0%"></div>
                </div>
            </div>
        `;

        // 執行洗牌動畫
        await runShuffleAnimation();

        // 執行分組邏輯
        let shuffledStudents = [...students].sort(() => Math.random() - 0.5);
        groups = [];

        let groupCount;
        if (method === 'byGroupCount') {
            groupCount = value;
        } else {
            groupCount = Math.ceil(students.length / value);
        }

        for (let i = 0; i < groupCount; i++) {
            groups.push({
                id: Date.now() + i,
                name: `第 ${i + 1} 組`,
                members: [],
                score: 0
            });
        }

        shuffledStudents.forEach((student, index) => {
            groups[index % groupCount].members.push(student);
        });

        // 計算分數
        groups.forEach(group => {
            group.score = group.members.reduce((total, member) => total + member.points, 0);
        });

        localStorage.setItem(window.GROUPS_KEY || 'groups', JSON.stringify(groups));

        // 更新進度到 100%
        const progressBar = document.getElementById('groupingProgress');
        if (progressBar) progressBar.style.width = '100%';

        // 等待一下再顯示結果
        await sleep(300);

        // 顯示結果動畫
        await renderGroupsWithAnimation();

        // 播放成功音效和彩花
        if (typeof playCheerSound === 'function') playCheerSound();
        if (typeof triggerConfetti === 'function') triggerConfetti();

        // 恢復按鈕
        if (button) {
            button.disabled = false;
            button.classList.remove('opacity-50', 'cursor-not-allowed');
            button.innerHTML = '🎲 開始隨機分組';
        }

        // 顯示成功通知
        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.success(`成功分成 ${groupCount} 組！`);
        }
    };

    // 洗牌動畫
    async function runShuffleAnimation() {
        const animDiv = document.getElementById('shuffleAnimation');
        const progressBar = document.getElementById('groupingProgress');
        if (!animDiv || typeof students === 'undefined') return;

        const totalFrames = 20;

        for (let i = 0; i < totalFrames; i++) {
            // 隨機選擇 3 個學生名字顯示
            const shuffled = [...students].sort(() => Math.random() - 0.5);
            const names = shuffled.slice(0, Math.min(3, shuffled.length)).map(s => s.name);

            animDiv.innerHTML = names.map(name =>
                `<span class="inline-block mx-2 animate-pulse">${name}</span>`
            ).join('');

            // 更新進度條
            if (progressBar) {
                progressBar.style.width = `${((i + 1) / totalFrames) * 80}%`;
            }

            // 播放音效
            if (typeof playLotteryTickSound === 'function') {
                playLotteryTickSound();
            }

            await sleep(80);
        }
    }

    // 帶動畫的渲染分組結果
    async function renderGroupsWithAnimation() {
        const container = document.getElementById('groupingResult');
        container.innerHTML = '';

        if (typeof groups === 'undefined' || groups.length === 0) {
            container.innerHTML = '<div class="text-gray-500 text-center p-6 bg-gray-50 rounded-lg col-span-full">尚無分組結果。</div>';
            return;
        }

        for (let index = 0; index < groups.length; index++) {
            const group = groups[index];
            const colorConfig = GROUP_COLORS[index % GROUP_COLORS.length];
            const emoji = GROUP_EMOJIS[index % GROUP_EMOJIS.length];

            const div = document.createElement('div');
            div.className = `${colorConfig.bg} p-4 rounded-lg border-l-4 ${colorConfig.border} flex flex-col opacity-0 transform translate-y-4 transition-all duration-300`;

            const memberNames = group.members.map(m => m.name).join('、') || '沒有組員';
            const memberCount = group.members.length;

            div.innerHTML = `
                <div class="flex-grow">
                    <div class="flex items-center justify-between mb-2">
                        <h4 class="font-bold text-lg ${colorConfig.text}">${emoji} ${group.name}</h4>
                        <span class="text-xs ${colorConfig.text} bg-white px-2 py-1 rounded-full">${memberCount} 人</span>
                    </div>
                    <p class="text-gray-600 text-sm mb-3 h-12 overflow-y-auto">${memberNames}</p>
                </div>
                <div class="flex items-center justify-between mt-2 pt-2 border-t border-gray-200">
                    <span class="font-semibold text-xl">分數: <span class="text-indigo-600">${group.score}</span></span>
                    <div class="flex gap-1">
                        <button onclick="adjustGroupScore(${index}, 1)" class="bg-green-500 text-white rounded-full h-8 w-8 text-lg font-bold hover:bg-green-600 active:scale-90 transition-transform">+</button>
                        <button onclick="adjustGroupScore(${index}, -1)" class="bg-red-500 text-white rounded-full h-8 w-8 text-lg font-bold hover:bg-red-600 active:scale-90 transition-transform">-</button>
                    </div>
                </div>
            `;

            container.appendChild(div);

            // 依序動畫出現
            await sleep(100);
            div.classList.remove('opacity-0', 'translate-y-4');
        }
    }

    // 覆蓋原有的 renderGroups 函式，使用新樣式
    window.renderGroupsEnhanced = function () {
        const container = document.getElementById('groupingResult');
        container.innerHTML = '';

        if (typeof groups === 'undefined' || groups.length === 0) {
            container.innerHTML = '<div class="text-gray-500 text-center p-6 bg-gray-50 rounded-lg col-span-full">尚無分組結果。</div>';
            return;
        }

        groups.forEach((group, index) => {
            const colorConfig = GROUP_COLORS[index % GROUP_COLORS.length];
            const emoji = GROUP_EMOJIS[index % GROUP_EMOJIS.length];

            const div = document.createElement('div');
            div.className = `${colorConfig.bg} p-4 rounded-lg border-l-4 ${colorConfig.border} flex flex-col`;

            const memberNames = group.members.map(m => m.name).join('、') || '沒有組員';
            const memberCount = group.members.length;

            div.innerHTML = `
                <div class="flex-grow">
                    <div class="flex items-center justify-between mb-2">
                        <h4 class="font-bold text-lg ${colorConfig.text}">${emoji} ${group.name}</h4>
                        <span class="text-xs ${colorConfig.text} bg-white px-2 py-1 rounded-full">${memberCount} 人</span>
                    </div>
                    <p class="text-gray-600 text-sm mb-3 h-12 overflow-y-auto">${memberNames}</p>
                </div>
                <div class="flex items-center justify-between mt-2 pt-2 border-t border-gray-200">
                    <span class="font-semibold text-xl">分數: <span class="text-indigo-600">${group.score}</span></span>
                    <div class="flex gap-1">
                        <button onclick="adjustGroupScore(${index}, 1)" class="bg-green-500 text-white rounded-full h-8 w-8 text-lg font-bold hover:bg-green-600 active:scale-90 transition-transform">+</button>
                        <button onclick="adjustGroupScore(${index}, -1)" class="bg-red-500 text-white rounded-full h-8 w-8 text-lg font-bold hover:bg-red-600 active:scale-90 transition-transform">-</button>
                    </div>
                </div>
            `;

            container.appendChild(div);
        });
    };

    // 覆蓋原有的 renderGroups
    const originalRenderGroups = window.renderGroups;
    window.renderGroups = function () {
        if (typeof groups !== 'undefined' && groups.length > 0) {
            window.renderGroupsEnhanced();
        } else if (originalRenderGroups) {
            originalRenderGroups();
        }
    };

    // 工具函式
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
})();
