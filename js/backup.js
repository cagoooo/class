/**
 * 班級小管家 - 資料備份模組
 * backup.js - 資料備份與恢復系統
 */

class DataBackup {
    static export() {
        try {
            const data = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                students: students,
                pointsHistory: pointsHistory,
                groups: groups,
                notebookEntries: notebookEntries,
                homeworkList: homeworkList,
                homeworkChecks: homeworkChecks,
                lotteryHistory: lotteryHistory
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `班級小管家備份_${this.getDateString()}.json`;
            link.click();

            URL.revokeObjectURL(url);
            NotificationSystem.success('資料已成功匯出');
        } catch (error) {
            console.error('匯出失敗:', error);
            NotificationSystem.error('資料匯出失敗：' + error.message);
        }
    }

    static async import(file) {
        try {
            LoadingIndicator.show('正在讀取備份檔案...');

            const text = await file.text();
            const data = JSON.parse(text);

            // 驗證資料格式
            if (!this.validateBackupData(data)) {
                throw new Error('備份檔案格式不正確');
            }

            LoadingIndicator.hide();

            // 確認匯入
            const confirmed = await ConfirmDialog.show({
                title: '確認匯入資料',
                message: '匯入資料將覆蓋現有資料，確定要繼續嗎？建議先備份現有資料。',
                type: 'warning',
                confirmText: '確定匯入',
                cancelText: '取消'
            });

            if (!confirmed) {
                NotificationSystem.info('已取消匯入');
                return;
            }

            LoadingIndicator.show('正在匯入資料...');

            // 匯入資料
            if (data.students) {
                students = data.students;
                localStorage.setItem('students', JSON.stringify(students));
            }
            if (data.pointsHistory) {
                pointsHistory = data.pointsHistory;
                localStorage.setItem('pointsHistory', JSON.stringify(pointsHistory));
            }
            if (data.groups) {
                groups = data.groups;
                localStorage.setItem('groups', JSON.stringify(groups));
            }
            if (data.notebookEntries) {
                notebookEntries = data.notebookEntries;
                localStorage.setItem('notebookEntries', JSON.stringify(notebookEntries));
            }
            if (data.homeworkList) {
                homeworkList = data.homeworkList;
                localStorage.setItem('homeworkList', JSON.stringify(homeworkList));
            }
            if (data.homeworkChecks) {
                homeworkChecks = data.homeworkChecks;
                localStorage.setItem('homeworkChecks', JSON.stringify(homeworkChecks));
            }
            if (data.lotteryHistory) {
                lotteryHistory = data.lotteryHistory;
                localStorage.setItem('lotteryHistory', JSON.stringify(lotteryHistory));
            }

            LoadingIndicator.hide();
            NotificationSystem.success('資料匯入成功，頁面即將重新載入');
            setTimeout(() => location.reload(), 1500);

        } catch (error) {
            LoadingIndicator.hide();
            console.error('匯入失敗:', error);
            NotificationSystem.error('資料匯入失敗：' + error.message);
        }
    }

    static validateBackupData(data) {
        const requiredKeys = ['version'];
        return requiredKeys.every(key => key in data);
    }

    static getDateString() {
        return new Date().toISOString().split('T')[0];
    }

    static autoBackup() {
        try {
            const lastBackup = localStorage.getItem('lastAutoBackup');
            const now = Date.now();
            const oneDay = 24 * 60 * 60 * 1000;

            if (!lastBackup || (now - parseInt(lastBackup)) > oneDay) {
                console.log('執行自動備份（每日一次）');
                this.export();
                localStorage.setItem('lastAutoBackup', now.toString());
            }
        } catch (error) {
            console.error('自動備份失敗:', error);
        }
    }
}

// 備份匯入處理函數
async function handleBackupImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    await DataBackup.import(file);

    // 清空檔案選擇器，允許重複選擇同一檔案
    event.target.value = '';
}
