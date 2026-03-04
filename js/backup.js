/**
 * ?剔?撠恣摰?- 鞈??遢璅∠?
 * backup.js - 鞈??遢?敺拍頂蝯?
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
            link.download = `?剔?撠恣摰嗅?隞稻${this.getDateString()}.json`;
            link.click();

            URL.revokeObjectURL(url);
            NotificationSystem.success('鞈?撌脫????);
        } catch (error) {
            console.error('?臬憭望?:', error);
            NotificationSystem.error('鞈??臬憭望?嚗? + error.message);
        }
    }

    static async import(file) {
        try {
            LoadingIndicator.show('甇?霈??隞賣?獢?..');

            const text = await file.text();
            const data = JSON.parse(text);

            // 撽?鞈??澆?
            if (!this.validateBackupData(data)) {
                throw new Error('?遢瑼??澆?銝迤蝣?);
            }

            LoadingIndicator.hide();

            // 蝣箄??臬
            const confirmed = await ConfirmDialog.show({
                title: '蝣箄??臬鞈?',
                message: '?臬鞈?撠??????蝣箏?閬匱蝥?嚗遣霅啣??遢?暹?鞈???,
                type: 'warning',
                confirmText: '蝣箏??臬',
                cancelText: '??'
            });

            if (!confirmed) {
                NotificationSystem.info('撌脣?瘨??);
                return;
            }

            LoadingIndicator.show('甇??臬鞈?...');

            // ?臬鞈?
            if (data.students) {
                students = data.students;
                localStorage.setItem(window.STUDENTS_KEY || 'students', JSON.stringify(students));
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
            NotificationSystem.success('鞈??臬??嚗??Ｗ撠??啗???);
            setTimeout(() => location.reload(), 1500);

        } catch (error) {
            LoadingIndicator.hide();
            console.error('?臬憭望?:', error);
            NotificationSystem.error('鞈??臬憭望?嚗? + error.message);
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
                console.log('?瑁??芸??遢嚗??乩?甈∴?');
                this.export();
                localStorage.setItem('lastAutoBackup', now.toString());
            }
        } catch (error) {
            console.error('?芸??遢憭望?:', error);
        }
    }
}

// ?遢?臬???賣
async function handleBackupImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    await DataBackup.import(file);

    // 皜征瑼??豢??剁??迂???豢???瑼?
    event.target.value = '';
}
