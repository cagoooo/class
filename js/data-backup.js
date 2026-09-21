/** Shared production Excel/JSON backup and restore implementation. */
class DataBackup {
    // 全量收集「目前班級」所有資料：核心三鍵 + 所有 SHARED_KEYS
    // （含考試/公告/座位/經營白板/潔牙等；日後新增區塊只要把 key 加進 SHARED_KEYS 就會自動納入備份）
    static collectData() {
        const data = {
            version: '1.1',
            className: window.ClassProfiles?.currentProfile()?.name || '預設班級',
            exportDate: new Date().toISOString(),
            appVersion: window.APP_VERSION || '',
            students: window.students || [],
            pointsHistory: window.pointsHistory || [],
            groups: window.groups || []
        };
        const shared = (window.ClassAwareStorage && ClassAwareStorage.SHARED_KEYS) || [];
        shared.forEach(k => {
            try {
                const raw = localStorage.getItem(k);   // 攔截器自動對應目前班級
                if (raw != null) { try { data[k] = JSON.parse(raw); } catch (e) { data[k] = raw; } }
            } catch (e) { /* ignore */ }
        });
        return data;
    }

    static export() {
        try {
            const data = this.collectData();
            // 老師備份後通常要登記成績，優先輸出 Excel；若 XLSX 未載入則退回 JSON
            if (typeof XLSX !== 'undefined') {
                this.exportExcel(data);
            } else {
                this.exportJSON(data);
            }
            return true;
        } catch (error) {
            console.error('匯出失敗:', error);
            if (typeof NotificationSystem !== 'undefined') NotificationSystem.error('資料匯出失敗：' + error.message);
            return false;
        }
    }

    // 退回方案：純 JSON 備份（與舊版相容）
    static exportJSON(data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `班級小管家備份_${this.getDateString()}.json`;
        link.click();
        URL.revokeObjectURL(url);
        if (typeof NotificationSystem !== 'undefined') NotificationSystem.success('資料已匯出（JSON）');
    }

    // Excel 備份：老師可直接拿來登記成績，並夾帶可完整還原的備份資料
    static exportExcel(data) {
        const wb = XLSX.utils.book_new();
        let className = '';
        try { className = (window.ClassProfiles && ClassProfiles.currentProfile && (ClassProfiles.currentProfile() || {}).name) || ''; } catch (e) { }

        const studs = (data.students || []).slice().sort((a, b) => (a.number || 9999) - (b.number || 9999));
        const numById = {}; (data.students || []).forEach(s => { numById[s.id] = s.number; });

        // 工作表 1：學生總表（成績登記用）
        const s1 = [['座號', '姓名', '目前總分', '加分次數', '扣分次數', '加分小計', '扣分小計']];
        studs.forEach(s => {
            let addN = 0, subN = 0, addSum = 0, subSum = 0;
            // v3.26.1：records 已移除（原本是 pointsHistory 的重複副本）。
            // 改從 pointsHistory 依 studentId 取，結果等價；保留 records
            // 退路讓尚未遷移的裝置不會匯出一片 0。
            // v3.27.0：只算最後一次「重置分數」之後的紀錄，才會跟「目前總分」對得上。
            const _hist = Array.isArray(data.pointsHistory) ? data.pointsHistory : [];
            const _hasReset = PointsReset.lastResetId(_hist) > 0;
            const _mine = PointsReset.sinceReset(_hist).filter(r => r.studentId === s.id);
            (_mine.length || _hasReset ? _mine : (s.records || [])).forEach(r => {
                if (r.points > 0) { addN++; addSum += r.points; }
                else if (r.points < 0) { subN++; subSum += r.points; }
            });
            s1.push([s.number || '', s.name || '', s.points || 0, addN, subN, addSum, subSum]);
        });
        const ws1 = XLSX.utils.aoa_to_sheet(s1);
        ws1['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 10 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 9 }];
        XLSX.utils.book_append_sheet(wb, ws1, '學生總表');

        // 工作表 2：加扣分明細（依時間舊→新）
        const ph = (data.pointsHistory || []).slice().reverse();
        const s2 = [['時間', '座號', '姓名', '加/扣分', '原因']];
        ph.forEach(r => PointsReset.isReset(r)
            ? s2.push([r.timestamp || r.date || '', '', '🔄 全班分數重置', '', '分數歸零，以下為重置後紀錄'])
            : s2.push([r.timestamp || r.date || '', (numById[r.studentId] != null ? numById[r.studentId] : ''), r.studentName || '', r.points, r.reason || '']));
        const ws2 = XLSX.utils.aoa_to_sheet(s2);
        ws2['!cols'] = [{ wch: 20 }, { wch: 6 }, { wch: 12 }, { wch: 8 }, { wch: 22 }];
        XLSX.utils.book_append_sheet(wb, ws2, '加扣分明細');

        // 工作表 3：作業繳交（學生 × 作業 矩陣）
        const hw = data.homeworkList || [];
        if (hw.length) {
            const STATUS = { completed: '完成', incomplete: '未交', needs_correction: '需訂正', submitted: '✅繳交', unsubmitted: '❌未交', late: '⏰遲交', absent: '🚫請假', unchecked: '—' };
            const s3 = [['座號', '姓名'].concat(hw.map(h => h.name || '作業'))];
            studs.forEach(s => {
                const row = [s.number || '', s.name || ''];
                hw.forEach(h => {
                    const st = (data.homeworkChecks && data.homeworkChecks[h.id] && data.homeworkChecks[h.id][s.id]) || 'unchecked';
                    row.push(STATUS[st] || st);
                });
                s3.push(row);
            });
            const ws3 = XLSX.utils.aoa_to_sheet(s3);
            ws3['!cols'] = [{ wch: 6 }, { wch: 12 }].concat(hw.map(() => ({ wch: 14 })));
            XLSX.utils.book_append_sheet(wb, ws3, '作業繳交');
        }

        // 工作表 4：聯絡簿
        const nb = data.notebookEntries || [];
        if (nb.length) {
            const s4 = [['日期', '類型', '內容', '建立時間']];
            nb.forEach(e => s4.push([e.date || '', ({ homework: '作業', exam: '考試', activity: '活動', notice: '通知', other: '其他' }[e.type] || e.type || ''), e.content || '', e.timestamp || '']));
            const ws4 = XLSX.utils.aoa_to_sheet(s4);
            ws4['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 44 }, { wch: 20 }];
            XLSX.utils.book_append_sheet(wb, ws4, '聯絡簿');
        }

        // 工作表 5：小組分組
        const gp = data.groups || [];
        if (gp.length) {
            const s5 = [['組別', '組員', '小組分數']];
            gp.forEach(g => s5.push([g.name || '', (g.members || []).map(m => m.name).join('、'), g.score || 0]));
            const ws5 = XLSX.utils.aoa_to_sheet(s5);
            ws5['!cols'] = [{ wch: 12 }, { wch: 44 }, { wch: 10 }];
            XLSX.utils.book_append_sheet(wb, ws5, '小組分組');
        }

        // 工作表 X：備份資料（請勿刪除）— 供「匯入備份」完整還原
        // 注意：Excel 單格上限 32767 字，故將 JSON 分塊存多列
        const rawRows = BackupIntegrity.encode(data);
        const wsRaw = XLSX.utils.aoa_to_sheet(rawRows);
        XLSX.utils.book_append_sheet(wb, wsRaw, '備份資料(請勿刪除)');

        XLSX.writeFile(wb, `班級小管家備份_${className ? className + '_' : ''}${this.getDateString()}.xlsx`);
        if (typeof NotificationSystem !== 'undefined') NotificationSystem.success('Excel 備份已下載（含成績登記表）');
    }

    // 從 Excel 備份的「備份資料(請勿刪除)」工作表重組出 JSON 物件
    static extractDataFromWorkbook(wb) {
        const ws = wb.Sheets['備份資料(請勿刪除)'];
        if (!ws) throw new Error('此 Excel 不是本系統的備份檔（缺少還原資料工作表）');
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        return BackupIntegrity.decode(rows);
    }

    static async import(file) {
        const targetClass = localStorage.getItem('currentClassId') || 'default';
        const original = CloudSafety.fingerprint(CloudSafety.capture(targetClass));
        try {
            LoadingIndicator.show('正在讀取備份檔案...');

            let data;
            if (/\.xlsx$/i.test(file.name)) {
                if (typeof XLSX === 'undefined') throw new Error('無法讀取 Excel（XLSX 套件未載入）');
                const buf = await file.arrayBuffer();
                const wb = XLSX.read(buf, { type: 'array' });
                data = this.extractDataFromWorkbook(wb);
            } else {
                const text = await file.text();
                data = JSON.parse(text);
            }

            // 驗證資料格式
            if (!this.validateBackupData(data)) {
                throw new Error('備份檔案格式不正確');
            }

            LoadingIndicator.hide();

            // 確認匯入
            const confirmed = await ConfirmDialog.show({
                title: '確認匯入資料',
                message: '還原會取代下方目標班級的資料，其他班級不變。請先備份現有資料。',
                details: [
                    { label: '即將覆蓋的班級', value: window.ClassProfiles?.currentProfile()?.name || '目前班級', highlight: true },
                    { label: '備份來源班級', value: data.className || '舊版備份未記載' },
                    { label: '備份時間', value: data.exportDate && !isNaN(Date.parse(data.exportDate)) ? new Date(data.exportDate).toLocaleString('zh-TW') : '未記載' },
                    { label: '資料數量', value: `${(data.students || []).length} 位學生・${(data.groups || []).length} 個分組` },
                    { label: '成果紀錄', value: `${(data.pointsHistory || []).filter(r => r.petEvent).length} 筆寵物／金幣紀錄・${(data.petSettings?.products || []).length} 項商品` },
                    { label: '已收集圖鑑', value: `${Object.keys(data.petSettings?.collection || {}).length} / 30 種` },
                    { label: '還原前保護', value: '確認後會先保存本機副本；存妥才開始還原' },
                    { label: '檔案名稱', value: file.name }
                ],
                type: 'warning',
                confirmText: '確定匯入',
                cancelText: '取消'
            });

            if (!confirmed) {
                NotificationSystem.info('已取消匯入');
                return;
            }

            if ((localStorage.getItem('currentClassId') || 'default') !== targetClass || CloudSafety.fingerprint(CloudSafety.capture(targetClass)) !== original) throw new Error('預覽期間班級或資料已改變，請重新匯入');
            await CloudSafety.checkpoint(targetClass);
            if ((localStorage.getItem('currentClassId') || 'default') !== targetClass || CloudSafety.fingerprint(CloudSafety.capture(targetClass)) !== original) throw new Error('保存副本期間資料已改變，請重新匯入');
            LoadingIndicator.show('正在匯入資料...');

            // 匯入資料：通用還原所有 key（核心三鍵寫入班級 key，其餘 SHARED_KEYS 經攔截器對應目前班級）
            // 向下相容舊備份（只含 7 個 key 的 v1.0 仍可還原）
            const allowed = new Set(['students', 'groups', 'pointsHistory', ...(window.ClassAwareStorage?.SHARED_KEYS || [])]);
            // 完整取代目前班級，避免舊備份未包含的資料殘留；不接受班級目錄或其他班級的儲存鍵。
            // 刪除與寫入一起交給 SafeStorage：中途空間不足時會整批還原，
            // 不會留下「舊資料已刪、新資料沒寫進去」的半套狀態。
            const ops = [];
            allowed.forEach(k => {
                if (Object.prototype.hasOwnProperty.call(data, k)) return;
                const key = k === 'students' ? window.STUDENTS_KEY : k === 'groups' ? window.GROUPS_KEY : k === 'pointsHistory' ? window.POINTS_HISTORY_KEY : k;
                ops.push([key || k, null]);
            });
            Object.keys(data).forEach(k => {
                if (!allowed.has(k)) return;
                let val;
                // 純字串（如 boardNote/boardActivity）直接寫回，避免被再次 JSON 編碼多出引號；物件/陣列才序列化
                try { val = (typeof data[k] === 'string') ? data[k] : JSON.stringify(data[k]); } catch (e) { return; }
                if (k === 'students') ops.push([window.STUDENTS_KEY || 'students', val]);
                else if (k === 'groups') ops.push([window.GROUPS_KEY || 'groups', val]);
                else if (k === 'pointsHistory') ops.push([window.POINTS_HISTORY_KEY || 'pointsHistory', val]);
                else ops.push([k, val]);
            });
            if (!SafeStorage.write(ops, { context: '匯入備份資料' })) {
                LoadingIndicator.hide();
                return;   // 已整批還原成匯入前的資料，不重新載入
            }
            students = data.students || students;
            groups = data.groups || groups;
            pointsHistory = data.pointsHistory || pointsHistory;

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
        return BackupIntegrity.validate(data);
    }

    static getDateString() {
        const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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


window.DataBackup = DataBackup;
