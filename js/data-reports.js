/**
 * ?豢??梯”??隞賣芋蝯?
 * Data Reports and Backup Module
 * 
 * ?嚗?
 * 1. 摮貊??勗???
 * 2. ?臬 Excel
 * 3. ?豢?閬死???”嚗?
 * 4. ?芸??遢
 */

(function () {
    'use strict';

    // ==================== CSS 璅?? ====================
    const reportStyles = `
        /* ?勗???Modal */
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

        /* ?”???*/
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

        /* ?遢?內 */
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

        /* ?豢??Ｘ?? */
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

    // ==================== 摮貊??勗???====================

    /**
     * 憿舐內摮貊??勗???
     */
    window.showStudentReport = function (studentId) {
        const student = students?.find(s => s.id === studentId);
        if (!student) return;

        document.getElementById('student-report-modal')?.remove();

        // 閮?蝯梯??豢?
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
            'leader': { name: '撟寥', icon: '??' },
            'helper': { name: '撠葦', icon: '??' },
            'tutor': { name: '隤脰?', icon: '??' },
            'special': { name: '?寞??瘙?, icon: '??' },
            'monitor': { name: '?剝', icon: '??儭? },
            'vice': { name: '?舐??, icon: '??' }
        };

        modal.innerHTML = `
            <div class="report-card" onclick="event.stopPropagation()">
                <div class="report-header">
                    <div class="report-avatar">${student.avatar || '??'}</div>
                    <div class="report-name">${student.name}</div>
                    <div class="report-number">摨扯?嚗?{student.number}</div>
                </div>

                <div class="report-stats">
                    <div class="report-stat">
                        <div class="report-stat-value" style="color: ${student.points >= 0 ? '#10b981' : '#ef4444'}">${student.points}</div>
                        <div class="report-stat-label">?桀??</div>
                    </div>
                    <div class="report-stat">
                        <div class="report-stat-value" style="color: #10b981">+${totalPositive}</div>
                        <div class="report-stat-label">蝝舐???</div>
                    </div>
                    <div class="report-stat">
                        <div class="report-stat-value" style="color: #ef4444">-${totalNegative}</div>
                        <div class="report-stat-label">蝝舐????</div>
                    </div>
                </div>

                ${tags.length > 0 ? `
                <div class="report-section">
                    <div class="report-section-title">?儭?璅惜</div>
                    <div class="report-tags">
                        ${tags.map(t => `<span class="report-tag">${tagConfig[t]?.icon || ''} ${tagConfig[t]?.name || t}</span>`).join('')}
                    </div>
                </div>
                ` : ''}

                <div class="report-section">
                    <div class="report-section-title">?? ?餈???(${records.length})</div>
                    <div class="report-history">
                        ${records.length > 0 ? records.slice(-10).reverse().map(r => `
                            <div class="report-history-item">
                                <span>${r.reason || '?∟牧??}</span>
                                <span style="color: ${r.points >= 0 ? '#10b981' : '#ef4444'}; font-weight: 600;">
                                    ${r.points > 0 ? '+' : ''}${r.points}
                                </span>
                            </div>
                        `).join('') : '<div class="text-gray-500 text-center py-4">撠閮?</div>'}
                    </div>
                </div>

                <div class="p-4 flex gap-2">
                    <button onclick="document.getElementById('student-report-modal').remove()"
                        class="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                        ??
                    </button>
                    <button onclick="exportStudentReport(${studentId})"
                        class="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                        ? ?臬
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    };

    /**
     * ?臬?桐?摮貊??勗?
     */
    window.exportStudentReport = function (studentId) {
        const student = students?.find(s => s.id === studentId);
        if (!student) return;

        const records = student.records || [];
        let content = `摮貊??勗??﹏n`;
        content += `====================\n`;
        content += `憪?嚗?{student.name}\n`;
        content += `摨扯?嚗?{student.number}\n`;
        content += `?桀??嚗?{student.points}\n`;
        content += `\n閮?嚗n`;
        records.forEach(r => {
            content += `  ${r.date || ''} | ${r.reason || '?∟牧??} | ${r.points > 0 ? '+' : ''}${r.points}\n`;
        });

        downloadFile(`${student.name}_?勗???txt`, content);
        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.success('撌脣?箏?');
        }
    };

    // ==================== ?臬 Excel ====================

    /**
     * ?臬?函鞈???CSV
     */
    window.exportClassData = function () {
        if (!students || students.length === 0) {
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.warning('瘝?摮貊?鞈??臬??);
            }
            return;
        }

        // CSV 銵券
        let csv = '\uFEFF摨扯?,憪?,?,??甈⊥,???甈⊥,璅惜\n';

        students.forEach(s => {
            const records = s.records || [];
            const positiveCount = records.filter(r => r.points > 0).length;
            const negativeCount = records.filter(r => r.points < 0).length;
            const tags = (s.tags || []).join(';');

            csv += `${s.number},"${s.name}",${s.points},${positiveCount},${negativeCount},"${tags}"\n`;
        });

        downloadFile('?剔??蜀??csv', csv);
        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.success('撌脣?箇蝝?蝮曉');
        }
    };

    /**
     * ?臬?甇瑕閮?
     */
    window.exportPointsHistory = function () {
        const history = JSON.parse(localStorage.getItem('pointsHistory')) || [];

        if (history.length === 0) {
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.warning('瘝??閮??臬??);
            }
            return;
        }

        let csv = '\uFEFF?交?,摮貊?,?霈?,??\n';
        history.forEach(h => {
            csv += `"${h.date || ''}","${h.studentName || ''}",${h.points > 0 ? '+' : ''}${h.points},"${h.reason || ''}"\n`;
        });

        downloadFile('?甇瑕閮?.csv', csv);
        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.success('撌脣?箏??豢風??);
        }
    };

    /**
     * 銝?瑼?
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

    // ==================== ?豢?閬死??====================

    /**
     * 憿舐內?豢??Ｘ
     */
    window.showDataPanel = function () {
        document.getElementById('data-panel-modal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'data-panel-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        // 閮?蝯梯??豢?
        const totalStudents = students?.length || 0;
        const avgScore = totalStudents > 0 ? (students.reduce((sum, s) => sum + s.points, 0) / totalStudents).toFixed(1) : 0;
        const maxScore = totalStudents > 0 ? Math.max(...students.map(s => s.points)) : 0;
        const minScore = totalStudents > 0 ? Math.min(...students.map(s => s.points)) : 0;

        // ???
        const scoreRanges = [
            { label: '鞎?', min: -999, max: -1, color: '#ef4444' },
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
                    <h3 class="text-xl font-bold text-white">?? ?豢?蝯梯??Ｘ</h3>
                    <button onclick="document.getElementById('data-panel-modal').remove()" class="text-white hover:text-gray-200 text-2xl">??/button>
                </div>

                <div class="p-4 space-y-4">
                    <!-- 璁汗 -->
                    <div class="grid grid-cols-4 gap-3">
                        <div class="bg-blue-50 p-3 rounded-lg text-center">
                            <div class="text-2xl font-bold text-blue-600">${totalStudents}</div>
                            <div class="text-xs text-gray-600">蝮賭犖??/div>
                        </div>
                        <div class="bg-green-50 p-3 rounded-lg text-center">
                            <div class="text-2xl font-bold text-green-600">${avgScore}</div>
                            <div class="text-xs text-gray-600">撟喳???/div>
                        </div>
                        <div class="bg-purple-50 p-3 rounded-lg text-center">
                            <div class="text-2xl font-bold text-purple-600">${maxScore}</div>
                            <div class="text-xs text-gray-600">?擃?</div>
                        </div>
                        <div class="bg-red-50 p-3 rounded-lg text-center">
                            <div class="text-2xl font-bold text-red-600">${minScore}</div>
                            <div class="text-xs text-gray-600">?雿?</div>
                        </div>
                    </div>

                    <!-- ?????-->
                    <div class="chart-container">
                        <div class="chart-title">?? ???</div>
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

                    <!-- ????-->
                    <div class="chart-container">
                        <div class="chart-title">?? ?剔???5 ??/div>
                        <div class="space-y-2">
                            ${[...(students || [])].sort((a, b) => b.points - a.points).slice(0, 5).map((s, i) => `
                                <div class="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                                    <span class="text-lg">${['??', '??', '??', '4儭', '5儭'][i]}</span>
                                    <span class="text-xl">${s.avatar || '??'}</span>
                                    <span class="flex-1 font-medium">${s.name}</span>
                                    <span class="font-bold text-green-600">${s.points} ??/span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- ?臬?? -->
                    <div class="flex gap-2">
                        <button onclick="exportClassData()" class="flex-1 data-panel-btn">
                            ? ?臬?蜀??
                        </button>
                        <button onclick="exportPointsHistory()" class="flex-1 data-panel-btn">
                            ?? ?臬甇瑕閮?
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    };

    // ==================== ?芸??遢 ====================
    const BACKUP_KEY = 'classManager_autoBackup';
    const BACKUP_INTERVAL = 5 * 60 * 1000; // 5 ??

    /**
     * ?瑁??芸??遢
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

        // 靽??餈?5 ??隞?
        let backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
        backups.unshift(backupData);
        backups = backups.slice(0, 5);

        try {
            localStorage.setItem(BACKUP_KEY, JSON.stringify(backups));
            showBackupToast();
        } catch (e) {
            console.warn('?芸??遢憭望?嚗?, e);
        }
    }

    /**
     * 憿舐內?遢?內
     */
    function showBackupToast() {
        let toast = document.getElementById('backup-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'backup-toast';
            toast.className = 'backup-toast';
            toast.innerHTML = '? 撌脰??隞?;
            document.body.appendChild(toast);
        }

        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
    }

    /**
     * ?Ｗ儔?遢
     */
    window.restoreBackup = function (index = 0) {
        const backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
        if (backups.length === 0 || !backups[index]) {
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.warning('瘝??舐??隞?);
            }
            return;
        }

        const backup = backups[index];

        if (confirm(`蝣箏?閬敺?${new Date(backup.timestamp).toLocaleString()} ??隞賢?嚗n\n?? ?桀?鞈?撠◤閬?嚗)) {
            localStorage.setItem(window.STUDENTS_KEY || 'students', JSON.stringify(backup.students));
            localStorage.setItem('pointsHistory', JSON.stringify(backup.pointsHistory));
            localStorage.setItem('notebookEntries', JSON.stringify(backup.notebookEntries));
            localStorage.setItem('groups', JSON.stringify(backup.groups));
            localStorage.setItem('seatingConfig', JSON.stringify(backup.seatingConfig));

            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.success('撌脫敺拙?隞踝??頛?...');
            }

            setTimeout(() => location.reload(), 1500);
        }
    };

    /**
     * 憿舐內?遢蝞∠?
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
                    <h3 class="text-xl font-bold text-white">? ?遢蝞∠?</h3>
                    <button onclick="document.getElementById('backup-modal').remove()" class="text-white hover:text-gray-200 text-2xl">??/button>
                </div>

                <div class="p-4 space-y-3">
                    ${backups.length > 0 ? backups.map((b, i) => `
                        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                                <div class="font-medium">${new Date(b.timestamp).toLocaleString()}</div>
                                <div class="text-xs text-gray-500">${b.students?.length || 0} 雿飛??/div>
                            </div>
                            <button onclick="restoreBackup(${i})" class="px-3 py-1 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600">
                                ?Ｗ儔
                            </button>
                        </div>
                    `).join('') : '<div class="text-center text-gray-500 py-8">撠?遢</div>'}
                    
                    <button onclick="performManualBackup()" class="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">
                        ? 蝡?遢
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    };

    /**
     * ???遢
     */
    window.performManualBackup = function () {
        performAutoBackup();
        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.success('撌脣?????隞?);
        }
        document.getElementById('backup-modal')?.remove();
        showBackupManager();
    };

    // ==================== ????====================

    function init() {
        // 瘜典璅??
        if (!document.getElementById('report-styles')) {
            const style = document.createElement('style');
            style.id = 'report-styles';
            style.textContent = reportStyles;
            document.head.appendChild(style);
        }

        // ???芸??遢
        setInterval(performAutoBackup, BACKUP_INTERVAL);

        // 擐活?遢嚗?0 蝘?嚗?
        setTimeout(performAutoBackup, 30000);

        // 瘛餃??豢??Ｘ??
        setTimeout(addDataPanelButton, 700);

        console.log('???豢??梯”??隞賣芋蝯歇頛');
    }

    /**
     * 瘛餃??豢??Ｘ???啣飛?恣??
     */
    function addDataPanelButton() {
        const studentSection = document.getElementById('students-section');
        if (!studentSection || document.getElementById('data-panel-btn')) return;

        // 雿輻 id 蝎曄Ⅱ摰??剔?蝯梯?????踹?隤日?摮貊??∠?
        const statsArea = document.getElementById('class-stats-panel');
        if (statsArea) {
            const btnContainer = document.createElement('div');
            btnContainer.className = 'flex gap-2 mt-3';
            btnContainer.innerHTML = `
                <button id="data-panel-btn" onclick="showDataPanel()" class="flex-1 data-panel-btn">
                    ?? ?豢??Ｘ
                </button>
                <button onclick="showBackupManager()" class="flex-1 data-panel-btn" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed);">
                    ? ?遢蝞∠?
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
