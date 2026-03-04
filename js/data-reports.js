/**
 * 數據報表與備份模組
 * Data Reports and Backup Module
 * 
 * 功能：
 * 1. 學生報告卡
 * 2. 匯出 Excel
 * 3. 數據視覺化（圖表）
 * 4. 自動備份
 */

(function () {
    'use strict';

    // ==================== CSS 樣式 ====================
    const reportStyles = `
        /* 報告卡 Modal */
        .report-card {
            background: white;
            border-radius: 1rem;
            max-width: 600px;
            width: 90%;
            max-height: 85vh;
            overflow-y: auto;
        }

        .dark .report-card {
            background: var(--bg-card);
        }

        .report-header {
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            color: white;
            padding: 1.5rem;
            border-radius: 1rem 1rem 0 0;
            text-align: center;
        }

        .report-avatar {
            font-size: 4rem;
            margin-bottom: 0.5rem;
        }

        .report-name {
            font-size: 1.5rem;
            font-weight: 700;
        }

        .report-number {
            opacity: 0.8;
            font-size: 0.875rem;
        }

        .report-stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 1rem;
            padding: 1rem;
            background: #f8fafc;
        }

        .dark .report-stats {
            background: var(--bg-secondary);
        }

        .report-stat {
            text-align: center;
            padding: 0.75rem;
        }

        .report-stat-value {
            font-size: 1.5rem;
            font-weight: 700;
            color: #3b82f6;
        }

        .report-stat-label {
            font-size: 0.75rem;
            color: #6b7280;
        }

        .report-section {
            padding: 1rem;
            border-bottom: 1px solid #e5e7eb;
        }

        .dark .report-section {
            border-color: var(--border-color);
        }

        .report-section-title {
            font-weight: 600;
            margin-bottom: 0.75rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .report-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
        }

        .report-tag {
            padding: 0.25rem 0.75rem;
            background: #e0f2fe;
            color: #0369a1;
            border-radius: 9999px;
            font-size: 0.75rem;
        }

        .report-history {
            max-height: 200px;
            overflow-y: auto;
        }

        .report-history-item {
            display: flex;
            justify-content: space-between;
            padding: 0.5rem;
            border-bottom: 1px solid #f3f4f6;
            font-size: 0.875rem;
        }

        /* 圖表區域 */
        .chart-container {
            background: white;
            border-radius: 1rem;
            padding: 1rem;
            margin-bottom: 1rem;
        }

        .dark .chart-container {
            background: var(--bg-card);
        }

        .chart-title {
            font-weight: 600;
            margin-bottom: 1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .bar-chart {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }

        .bar-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .bar-label {
            width: 80px;
            font-size: 0.75rem;
            text-align: right;
        }

        .bar-track {
            flex: 1;
            height: 24px;
            background: #e5e7eb;
            border-radius: 0.25rem;
            overflow: hidden;
        }

        .bar-fill {
            height: 100%;
            border-radius: 0.25rem;
            transition: width 0.5s ease;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            padding-right: 0.5rem;
            font-size: 0.75rem;
            font-weight: 600;
            color: white;
        }

        /* 備份提示 */
        .backup-toast {
            position: fixed;
            bottom: 1rem;
            left: 1rem;
            background: #10b981;
            color: white;
            padding: 0.75rem 1rem;
            border-radius: 0.5rem;
            font-size: 0.875rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.3s ease;
            z-index: 100;
        }

        .backup-toast.show {
            opacity: 1;
            transform: translateY(0);
        }

        /* 數據面板按鈕 */
        .data-panel-btn {
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            font-size: 0.875rem;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .data-panel-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }
    `;

    // ==================== 學生報告卡 ====================

    /**
     * 顯示學生報告卡
     */
    window.showStudentReport = function (studentId) {
        const student = students?.find(s => s.id === studentId);
        if (!student) return;

        document.getElementById('student-report-modal')?.remove();

        // 計算統計數據
        const records = student.records || [];
        const positiveRecords = records.filter(r => r.points > 0);
        const negativeRecords = records.filter(r => r.points < 0);
        const totalPositive = positiveRecords.reduce((sum, r) => sum + r.points, 0);
        const totalNegative = Math.abs(negativeRecords.reduce((sum, r) => sum + r.points, 0));

        const modal = document.createElement('div');
        modal.id = 'student-report-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        const tags = student.tags || [];
        const tagConfig = {
            'leader': { name: '幹部', icon: '👑' },
            'helper': { name: '小老師', icon: '📖' },
            'tutor': { name: '課輔', icon: '✏️' },
            'special': { name: '特殊需求', icon: '💝' },
            'monitor': { name: '班長', icon: '🎖️' },
            'vice': { name: '副班長', icon: '🏅' }
        };

        modal.innerHTML = `
            <div class="report-card" onclick="event.stopPropagation()">
                <div class="report-header">
                    <div class="report-avatar">${student.avatar || '😊'}</div>
                    <div class="report-name">${student.name}</div>
                    <div class="report-number">座號：${student.number}</div>
                </div>

                <div class="report-stats">
                    <div class="report-stat">
                        <div class="report-stat-value" style="color: ${student.points >= 0 ? '#10b981' : '#ef4444'}">${student.points}</div>
                        <div class="report-stat-label">目前分數</div>
                    </div>
                    <div class="report-stat">
                        <div class="report-stat-value" style="color: #10b981">+${totalPositive}</div>
                        <div class="report-stat-label">累積加分</div>
                    </div>
                    <div class="report-stat">
                        <div class="report-stat-value" style="color: #ef4444">-${totalNegative}</div>
                        <div class="report-stat-label">累積扣分</div>
                    </div>
                </div>

                ${tags.length > 0 ? `
                <div class="report-section">
                    <div class="report-section-title">🏷️ 標籤</div>
                    <div class="report-tags">
                        ${tags.map(t => `<span class="report-tag">${tagConfig[t]?.icon || ''} ${tagConfig[t]?.name || t}</span>`).join('')}
                    </div>
                </div>
                ` : ''}

                <div class="report-section">
                    <div class="report-section-title">📜 最近記錄 (${records.length})</div>
                    <div class="report-history">
                        ${records.length > 0 ? records.slice(-10).reverse().map(r => `
                            <div class="report-history-item">
                                <span>${r.reason || '無說明'}</span>
                                <span style="color: ${r.points >= 0 ? '#10b981' : '#ef4444'}; font-weight: 600;">
                                    ${r.points > 0 ? '+' : ''}${r.points}
                                </span>
                            </div>
                        `).join('') : '<div class="text-gray-500 text-center py-4">尚無記錄</div>'}
                    </div>
                </div>

                <div class="p-4 flex gap-2">
                    <button onclick="document.getElementById('student-report-modal').remove()"
                        class="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                        關閉
                    </button>
                    <button onclick="exportStudentReport(${studentId})"
                        class="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                        📥 匯出
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    };

    /**
     * 匯出單一學生報告
     */
    window.exportStudentReport = function (studentId) {
        const student = students?.find(s => s.id === studentId);
        if (!student) return;

        const records = student.records || [];
        let content = `學生報告卡\n`;
        content += `====================\n`;
        content += `姓名：${student.name}\n`;
        content += `座號：${student.number}\n`;
        content += `目前分數：${student.points}\n`;
        content += `\n記錄：\n`;
        records.forEach(r => {
            content += `  ${r.date || ''} | ${r.reason || '無說明'} | ${r.points > 0 ? '+' : ''}${r.points}\n`;
        });

        downloadFile(`${student.name}_報告卡.txt`, content);
        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.success('已匯出報告卡');
        }
    };

    // ==================== 匯出 Excel ====================

    /**
     * 匯出全班資料為 CSV
     */
    window.exportClassData = function () {
        if (!students || students.length === 0) {
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.warning('沒有學生資料可匯出');
            }
            return;
        }

        // CSV 表頭
        let csv = '\uFEFF座號,姓名,分數,加分次數,扣分次數,標籤\n';

        students.forEach(s => {
            const records = s.records || [];
            const positiveCount = records.filter(r => r.points > 0).length;
            const negativeCount = records.filter(r => r.points < 0).length;
            const tags = (s.tags || []).join(';');

            csv += `${s.number},"${s.name}",${s.points},${positiveCount},${negativeCount},"${tags}"\n`;
        });

        downloadFile('班級成績單.csv', csv);
        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.success('已匯出班級成績單');
        }
    };

    /**
     * 匯出分數歷史記錄
     */
    window.exportPointsHistory = function () {
        const history = JSON.parse(localStorage.getItem('pointsHistory')) || [];

        if (history.length === 0) {
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.warning('沒有分數記錄可匯出');
            }
            return;
        }

        let csv = '\uFEFF日期,學生,分數變動,原因\n';
        history.forEach(h => {
            csv += `"${h.date || ''}","${h.studentName || ''}",${h.points > 0 ? '+' : ''}${h.points},"${h.reason || ''}"\n`;
        });

        downloadFile('分數歷史記錄.csv', csv);
        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.success('已匯出分數歷史');
        }
    };

    /**
     * 下載檔案
     */
    function downloadFile(filename, content) {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ==================== 數據視覺化 ====================

    /**
     * 顯示數據面板
     */
    window.showDataPanel = function () {
        document.getElementById('data-panel-modal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'data-panel-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        // 計算統計數據
        const totalStudents = students?.length || 0;
        const avgScore = totalStudents > 0 ? (students.reduce((sum, s) => sum + s.points, 0) / totalStudents).toFixed(1) : 0;
        const maxScore = totalStudents > 0 ? Math.max(...students.map(s => s.points)) : 0;
        const minScore = totalStudents > 0 ? Math.min(...students.map(s => s.points)) : 0;

        // 分數分佈
        const scoreRanges = [
            { label: '負分', min: -999, max: -1, color: '#ef4444' },
            { label: '0-9', min: 0, max: 9, color: '#f59e0b' },
            { label: '10-19', min: 10, max: 19, color: '#eab308' },
            { label: '20-29', min: 20, max: 29, color: '#84cc16' },
            { label: '30+', min: 30, max: 999, color: '#10b981' }
        ];

        const distribution = scoreRanges.map(range => ({
            ...range,
            count: students?.filter(s => s.points >= range.min && s.points <= range.max).length || 0
        }));

        const maxCount = Math.max(...distribution.map(d => d.count), 1);

        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-auto" onclick="event.stopPropagation()">
                <div class="flex items-center justify-between p-4 border-b bg-gradient-to-r from-green-500 to-teal-500 rounded-t-2xl">
                    <h3 class="text-xl font-bold text-white">📊 數據統計面板</h3>
                    <button onclick="document.getElementById('data-panel-modal').remove()" class="text-white hover:text-gray-200 text-2xl">✕</button>
                </div>

                <div class="p-4 space-y-4">
                    <!-- 概覽 -->
                    <div class="grid grid-cols-4 gap-3">
                        <div class="bg-blue-50 p-3 rounded-lg text-center">
                            <div class="text-2xl font-bold text-blue-600">${totalStudents}</div>
                            <div class="text-xs text-gray-600">總人數</div>
                        </div>
                        <div class="bg-green-50 p-3 rounded-lg text-center">
                            <div class="text-2xl font-bold text-green-600">${avgScore}</div>
                            <div class="text-xs text-gray-600">平均分</div>
                        </div>
                        <div class="bg-purple-50 p-3 rounded-lg text-center">
                            <div class="text-2xl font-bold text-purple-600">${maxScore}</div>
                            <div class="text-xs text-gray-600">最高分</div>
                        </div>
                        <div class="bg-red-50 p-3 rounded-lg text-center">
                            <div class="text-2xl font-bold text-red-600">${minScore}</div>
                            <div class="text-xs text-gray-600">最低分</div>
                        </div>
                    </div>

                    <!-- 分數分佈圖 -->
                    <div class="chart-container">
                        <div class="chart-title">📈 分數分佈</div>
                        <div class="bar-chart">
                            ${distribution.map(d => `
                                <div class="bar-item">
                                    <div class="bar-label">${d.label}</div>
                                    <div class="bar-track">
                                        <div class="bar-fill" style="width: ${(d.count / maxCount) * 100}%; background: ${d.color};">
                                            ${d.count > 0 ? d.count : ''}
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- 前5名 -->
                    <div class="chart-container">
                        <div class="chart-title">🏆 班級前 5 名</div>
                        <div class="space-y-2">
                            ${[...(students || [])].sort((a, b) => b.points - a.points).slice(0, 5).map((s, i) => `
                                <div class="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                                    <span class="text-lg">${['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i]}</span>
                                    <span class="text-xl">${s.avatar || '😊'}</span>
                                    <span class="flex-1 font-medium">${s.name}</span>
                                    <span class="font-bold text-green-600">${s.points} 分</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- 匯出按鈕 -->
                    <div class="flex gap-2">
                        <button onclick="exportClassData()" class="flex-1 data-panel-btn">
                            📥 匯出成績單
                        </button>
                        <button onclick="exportPointsHistory()" class="flex-1 data-panel-btn">
                            📜 匯出歷史記錄
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    };

    // ==================== 自動備份 ====================
    const BACKUP_KEY = 'classManager_autoBackup';
    const BACKUP_INTERVAL = 5 * 60 * 1000; // 5 分鐘

    /**
     * 執行自動備份
     */
    function performAutoBackup() {
        const backupData = {
            timestamp: new Date().toISOString(),
            students: JSON.parse(localStorage.getItem(window.STUDENTS_KEY || 'students') || '[]'),
            pointsHistory: JSON.parse(localStorage.getItem('pointsHistory') || '[]'),
            notebookEntries: JSON.parse(localStorage.getItem('notebookEntries') || '[]'),
            groups: JSON.parse(localStorage.getItem('groups') || '[]'),
            seatingConfig: JSON.parse(localStorage.getItem('seatingConfig') || '{}')
        };

        // 保留最近 5 個備份
        let backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
        backups.unshift(backupData);
        backups = backups.slice(0, 5);

        try {
            localStorage.setItem(BACKUP_KEY, JSON.stringify(backups));
            showBackupToast();
        } catch (e) {
            console.warn('自動備份失敗：', e);
        }
    }

    /**
     * 顯示備份提示
     */
    function showBackupToast() {
        let toast = document.getElementById('backup-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'backup-toast';
            toast.className = 'backup-toast';
            toast.innerHTML = '💾 已自動備份';
            document.body.appendChild(toast);
        }

        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
    }

    /**
     * 恢復備份
     */
    window.restoreBackup = function (index = 0) {
        const backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
        if (backups.length === 0 || !backups[index]) {
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.warning('沒有可用的備份');
            }
            return;
        }

        const backup = backups[index];

        if (confirm(`確定要恢復 ${new Date(backup.timestamp).toLocaleString()} 的備份嗎？\n\n⚠️ 目前資料將被覆蓋！`)) {
            localStorage.setItem(window.STUDENTS_KEY || 'students', JSON.stringify(backup.students));
            localStorage.setItem(window.CLASS_KEYS?.pointsHistory || 'pointsHistory', JSON.stringify(backup.pointsHistory));
            localStorage.setItem(window.CLASS_KEYS?.notebookEntries || 'notebookEntries', JSON.stringify(backup.notebookEntries));
            localStorage.setItem(window.CLASS_KEYS?.groups || 'groups', JSON.stringify(backup.groups));
            localStorage.setItem('seatingConfig', JSON.stringify(backup.seatingConfig));

            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.success('已恢復備份，重新載入頁面...');
            }

            setTimeout(() => location.reload(), 1500);
        }
    };

    /**
     * 顯示備份管理
     */
    window.showBackupManager = function () {
        const backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');

        document.getElementById('backup-modal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'backup-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4" onclick="event.stopPropagation()">
                <div class="flex items-center justify-between p-4 border-b bg-gradient-to-r from-purple-500 to-pink-500 rounded-t-2xl">
                    <h3 class="text-xl font-bold text-white">💾 備份管理</h3>
                    <button onclick="document.getElementById('backup-modal').remove()" class="text-white hover:text-gray-200 text-2xl">✕</button>
                </div>

                <div class="p-4 space-y-3">
                    ${backups.length > 0 ? backups.map((b, i) => `
                        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                                <div class="font-medium">${new Date(b.timestamp).toLocaleString()}</div>
                                <div class="text-xs text-gray-500">${b.students?.length || 0} 位學生</div>
                            </div>
                            <button onclick="restoreBackup(${i})" class="px-3 py-1 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600">
                                恢復
                            </button>
                        </div>
                    `).join('') : '<div class="text-center text-gray-500 py-8">尚無備份</div>'}
                    
                    <button onclick="performManualBackup()" class="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">
                        📦 立即備份
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    };

    /**
     * 手動備份
     */
    window.performManualBackup = function () {
        performAutoBackup();
        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.success('已完成手動備份');
        }
        document.getElementById('backup-modal')?.remove();
        showBackupManager();
    };

    // ==================== 初始化 ====================

    function init() {
        // 注入樣式
        if (!document.getElementById('report-styles')) {
            const style = document.createElement('style');
            style.id = 'report-styles';
            style.textContent = reportStyles;
            document.head.appendChild(style);
        }

        // 啟動自動備份
        setInterval(performAutoBackup, BACKUP_INTERVAL);

        // 首次備份（30 秒後）
        setTimeout(performAutoBackup, 30000);

        // 添加數據面板按鈕
        setTimeout(addDataPanelButton, 700);

        console.log('✅ 數據報表與備份模組已載入');
    }

    /**
     * 添加數據面板按鈕到學生管理區
     */
    function addDataPanelButton() {
        const studentSection = document.getElementById('students-section');
        if (!studentSection || document.getElementById('data-panel-btn')) return;

        // 使用 id 精確定位班級統計區域，避免誤配學生卡片
        const statsArea = document.getElementById('class-stats-panel');
        if (statsArea) {
            const btnContainer = document.createElement('div');
            btnContainer.className = 'flex gap-2 mt-3';
            btnContainer.innerHTML = `
                <button id="data-panel-btn" onclick="showDataPanel()" class="flex-1 data-panel-btn">
                    📊 數據面板
                </button>
                <button onclick="showBackupManager()" class="flex-1 data-panel-btn" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed);">
                    💾 備份管理
                </button>
            `;
            statsArea.appendChild(btnContainer);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
