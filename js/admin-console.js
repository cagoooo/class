/**
 * 班級小管家 - 系統維運後台前端模組 (R-D1)
 *
 * 目的：供管理員（阿凱老師）檢視所有教師帳號的數據統計（班級數、最後同步時間、孤兒資料）。
 * 依賴：
 * - window.FirebaseConfig (提供 Firebase App 與 Functions 實例)
 * - window.NotificationSystem (提供 Toast 通知)
 *
 * 全域 API：
 * - window.showAdminConsole()
 */
(function () {
    'use strict';

    let statsData = [];

    // ── 建立與注入 CSS ──
    function injectCSS() {
        if (document.getElementById('admin-console-style')) return;
        const s = document.createElement('style');
        s.id = 'admin-console-style';
        s.textContent = `
            .admin-modal-overlay {
                position: fixed;
                inset: 0;
                background: rgba(15, 23, 42, 0.45);
                backdrop-filter: blur(8px);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
                padding: 1rem;
            }
            .admin-modal-overlay.open {
                opacity: 1;
                visibility: visible;
            }
            .admin-modal-content {
                background: #ffffff;
                width: 100%;
                max-width: min(1040px, 96vw);
                max-height: 88vh;
                border-radius: 1.25rem;
                box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                border: 1px solid rgba(226, 232, 240, 0.8);
                transition: transform 0.3s ease;
                transform: scale(0.95);
            }
            .admin-modal-overlay.open .admin-modal-content {
                transform: scale(1);
            }
            .dark .admin-modal-content {
                background: #1e293b;
                border-color: rgba(51, 65, 85, 0.8);
                color: #f1f5f9;
            }
            .admin-modal-header {
                padding: 1.25rem 1.5rem;
                border-bottom: 1px solid #f1f5f9;
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: linear-gradient(135deg, #1e3a8a, #3b82f6);
                color: #ffffff;
            }
            .dark .admin-modal-header {
                border-bottom: 1px solid #334155;
            }
            .admin-modal-title {
                font-size: 1.25rem;
                font-weight: 700;
                letter-spacing: 0.02em;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .admin-modal-body {
                padding: 1.5rem;
                overflow-y: auto;
                flex: 1;
            }
            .admin-table-container {
                overflow-x: auto;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
            }
            .dark .admin-table-container {
                border-color: #334155;
            }
            .admin-table {
                width: 100%;
                min-width: 760px; /* 欄位有足夠空間不被擠到跳行；不夠寬時容器橫向捲動 */
                border-collapse: collapse;
                text-align: left;
                font-size: 0.875rem;
            }
            .admin-table th {
                background: #f8fafc;
                padding: 0.7rem 0.85rem;
                font-weight: 600;
                color: #475569;
                border-bottom: 1px solid #e2e8f0;
                white-space: nowrap; /* 表頭一律不跳行 */
            }
            .dark .admin-table th {
                background: #1e293b;
                color: #94a3b8;
                border-bottom: 1px solid #334155;
            }
            .admin-table td {
                padding: 0.7rem 0.85rem;
                border-bottom: 1px solid #e2e8f0;
                color: #334155;
                vertical-align: middle;
            }
            /* 數字/狀態/時間/操作欄不跳行；只有姓名(第1欄)與裝置(第5欄)可換行或省略 */
            .admin-table td:nth-child(2),
            .admin-table td:nth-child(3),
            .admin-table td:nth-child(4),
            .admin-table td:nth-child(6) {
                white-space: nowrap;
            }
            .dark .admin-table td {
                border-bottom: 1px solid #334155;
                color: #cbd5e1;
            }
            .admin-table tr:hover {
                background: #f1f5f9;
            }
            .dark .admin-table tr:hover {
                background: #334155;
            }
            .badge-green, .badge-orange {
                display: inline-block;
                white-space: nowrap;
                padding: 2px 8px;
                border-radius: 4px;
                font-weight: 600;
            }
            .badge-green {
                background: #dcfce7; color: #15803d;
            }
            .dark .badge-green {
                background: #14532d; color: #4ade80;
            }
            .badge-orange {
                background: #ffedd5; color: #c2410c;
            }
            .dark .badge-orange {
                background: #7c2d12; color: #fb923c;
            }
            .admin-btn-back {
                background: rgba(255,255,255,0.18);
                color: #ffffff;
                border: 1px solid rgba(255,255,255,0.3);
                padding: 6px 16px;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                font-size: 0.85rem;
            }
            .admin-btn-back:hover {
                background: #ffffff;
                color: #1e3a8a;
            }
            .admin-modal-footer {
                padding: 1rem 1.5rem;
                border-top: 1px solid #f1f5f9;
                display: flex;
                justify-content: flex-end;
                background: #f8fafc;
            }
            .dark .admin-modal-footer {
                border-top: 1px solid #334155;
                background: #0f172a;
            }
            .admin-btn-close-large {
                background: #3b82f6;
                color: #ffffff;
                border: none;
                padding: 8px 20px;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            }
            .admin-btn-close-large:hover {
                background: #2563eb;
            }
            .admin-btn-rescue {
                background: #059669;
                color: #ffffff;
                border: none;
                padding: 5px 12px;
                border-radius: 6px;
                font-weight: 600;
                font-size: 0.8rem;
                cursor: pointer;
                white-space: nowrap;
                transition: background 0.2s, opacity 0.2s;
            }
            .admin-btn-rescue:hover { background: #047857; }
            .admin-btn-rescue:disabled { opacity: 0.6; cursor: not-allowed; }

            /* 孤兒檢視/勾選面板 */
            .admin-btn-cancel {
                background: #e2e8f0; color: #334155; border: none;
                padding: 8px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;
            }
            .admin-btn-cancel:hover { background: #cbd5e1; }
            .dark .admin-btn-cancel { background: #334155; color: #e2e8f0; }
            .orphan-list { display: flex; flex-direction: column; gap: 0.6rem; }
            .orphan-item {
                display: flex; align-items: flex-start; gap: 0.7rem;
                padding: 0.75rem 0.85rem; border: 1px solid #e2e8f0; border-radius: 10px;
                cursor: pointer; transition: background 0.15s, border-color 0.15s;
            }
            .orphan-item:hover { background: #f8fafc; border-color: #cbd5e1; }
            .dark .orphan-item { border-color: #334155; }
            .dark .orphan-item:hover { background: #1e293b; }
            .orphan-item input.orphan-check { margin-top: 3px; width: 18px; height: 18px; cursor: pointer; flex-shrink: 0; }
            .orphan-info { flex: 1; min-width: 0; }
            .orphan-line1 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem; }
            .orphan-name { font-weight: 700; color: #1e293b; }
            .dark .orphan-name { color: #f1f5f9; }
            .orphan-date { font-size: 0.78rem; color: #94a3b8; }
            .orphan-line2 { margin-top: 0.35rem; display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
            .orphan-sample { font-size: 0.82rem; color: #475569; }
            .dark .orphan-sample { color: #cbd5e1; }
            .orphan-empty { font-size: 0.82rem; color: #b45309; font-weight: 600; }
            .dark .orphan-empty { color: #fbbf24; }
            .orphan-id { margin-top: 0.3rem; font-size: 0.72rem; color: #cbd5e1; font-family: monospace; }
            .dark .orphan-id { color: #64748b; }

            /* 手機版：縮邊距、搜尋框佔滿一行、標題略縮 */
            @media (max-width: 640px) {
                .admin-modal-overlay { padding: 0.5rem; }
                .admin-modal-content { max-width: 100vw; max-height: 92vh; border-radius: 1rem; }
                .admin-modal-header { padding: 1rem; }
                .admin-modal-title { font-size: 1.05rem; }
                .admin-modal-body { padding: 1rem; }
                #admin-search-input { width: 100% !important; }
                .admin-table th, .admin-table td { padding: 0.6rem 0.7rem; font-size: 0.82rem; }
            }
            /* ── 分頁列（教師帳號 / 使用活動）── */
            .admin-tabs { display: flex; gap: 0.4rem; margin-bottom: 1rem; border-bottom: 2px solid #e2e8f0; }
            .dark .admin-tabs { border-bottom-color: #334155; }
            .admin-tab {
                padding: 0.55rem 1rem; border: none; background: none; cursor: pointer;
                font-size: 0.9rem; font-weight: 700; color: #94a3b8;
                border-bottom: 3px solid transparent; margin-bottom: -2px;
                transition: color .15s, border-color .15s;
            }
            .admin-tab:hover { color: #64748b; }
            .admin-tab.active { color: #2563eb; border-bottom-color: #2563eb; }
            .dark .admin-tab.active { color: #60a5fa; border-bottom-color: #60a5fa; }
            .admin-pane { display: none; }
            .admin-pane.active { display: block; }

            /* ── KPI 數字卡 ── */
            .kpi-grid {
                display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
                gap: 0.7rem; margin-bottom: 1.4rem;
            }
            .kpi-card {
                background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.85rem;
                padding: 0.85rem 0.9rem;
            }
            .dark .kpi-card { background: #0f172a; border-color: #334155; }
            .kpi-label { font-size: 0.74rem; color: #64748b; font-weight: 600; }
            .dark .kpi-label { color: #94a3b8; }
            .kpi-value { font-size: 1.6rem; font-weight: 800; color: #1e293b; line-height: 1.25; }
            .dark .kpi-value { color: #f1f5f9; }
            .kpi-unit { font-size: 0.78rem; font-weight: 600; color: #94a3b8; margin-left: 0.15rem; }

            /* ── 區塊標題 ── */
            .an-section { margin-bottom: 1.5rem; }
            .an-title {
                font-size: 0.95rem; font-weight: 800; color: #1e293b;
                margin-bottom: 0.2rem; display: flex; align-items: center; gap: 0.4rem;
            }
            .dark .an-title { color: #f1f5f9; }
            .an-hint { font-size: 0.76rem; color: #94a3b8; margin-bottom: 0.6rem; }

            /* ── 橫向長條（縣市 / 功能熱度）── */
            .bar-row { display: grid; grid-template-columns: 7.5rem 1fr 3.5rem; align-items: center; gap: 0.6rem; margin-bottom: 0.4rem; }
            .bar-name { font-size: 0.84rem; font-weight: 600; color: #334155; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .dark .bar-name { color: #cbd5e1; }
            .bar-track { background: #e2e8f0; border-radius: 999px; height: 0.85rem; overflow: hidden; }
            .dark .bar-track { background: #1e293b; }
            .bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #3b82f6, #60a5fa); min-width: 3px; }
            .bar-fill.warm { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
            .bar-val { font-size: 0.8rem; font-weight: 700; color: #475569; }
            .dark .bar-val { color: #cbd5e1; }

            /* ── 直向趨勢柱（近 30 天）── */
            .trend { display: flex; align-items: flex-end; gap: 3px; height: 90px; padding: 0.4rem 0; overflow-x: auto; }
            .trend-col { flex: 1 0 10px; display: flex; flex-direction: column; justify-content: flex-end; height: 100%; }
            .trend-bar { background: linear-gradient(180deg, #60a5fa, #2563eb); border-radius: 3px 3px 0 0; min-height: 2px; }
            .trend-labels { display: flex; justify-content: space-between; font-size: 0.68rem; color: #94a3b8; margin-top: 0.15rem; }

            /* ── 提醒框（未對應網域）── */
            .an-warn {
                background: #fffbeb; border: 1px solid #fcd34d; border-radius: 0.75rem;
                padding: 0.75rem 0.9rem; font-size: 0.82rem; color: #92400e;
            }
            .dark .an-warn { background: rgba(120, 53, 15, 0.25); border-color: #b45309; color: #fcd34d; }

            .an-empty { text-align: center; padding: 1.6rem; color: #94a3b8; font-size: 0.85rem; }

            @media (max-width: 640px) {
                .bar-row { grid-template-columns: 5.5rem 1fr 2.8rem; }
                .kpi-value { font-size: 1.35rem; }
            }

        `;
        document.head.appendChild(s);
    }

    // ── 建立與注入 HTML ──
    function injectHTML() {
        if (document.getElementById('admin-console-modal')) return;

        const overlay = document.createElement('div');
        overlay.id = 'admin-console-modal';
        overlay.className = 'admin-modal-overlay';
        overlay.innerHTML = `
            <div class="admin-modal-content">
                <div class="admin-modal-header">
                    <div class="admin-modal-title">🔧 系統運作維運控制台</div>
                    <button class="admin-btn-back" id="admin-header-back-btn">← 關閉並回主頁</button>
                </div>
                <div class="admin-modal-body">
                    <div class="admin-tabs">
                        <button class="admin-tab active" data-pane="accounts">👩‍🏫 教師帳號</button>
                        <button class="admin-tab" data-pane="activity">📊 使用活動</button>
                    </div>

                    <div class="admin-pane active" id="admin-pane-accounts">
                    <div class="flex justify-between items-center mb-4 flex-wrap gap-2">
                        <div class="text-sm text-gray-500 dark:text-gray-400" id="admin-stats-summary">
                            正在載入維運數據中，請稍候...
                        </div>
                        <input type="text" id="admin-search-input" placeholder="搜尋姓名 / Email..." 
                            class="text-sm border rounded-lg px-3 py-1.5 w-60 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            style="outline:none;">
                    </div>
                    <div class="admin-table-container">
                        <table class="admin-table">
                            <thead>
                                <tr>
                                    <th>教師姓名 / 帳號</th>
                                    <th>有效班級數</th>
                                    <th>孤兒資料數</th>
                                    <th>最後同步時間</th>
                                    <th>同步裝置資訊</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody id="admin-table-body">
                                <tr>
                                    <td colspan="6" style="text-align:center;padding:2rem;color:#94a3b8;">
                                        <div class="inline-block animate-spin border-2 border-blue-500 border-t-transparent rounded-full w-6 h-6 mr-2 vertical-middle"></div>
                                        正在讀取雲端統計...
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    </div>

                    <div class="admin-pane" id="admin-pane-activity">
                        <div class="an-empty" id="admin-analytics-body">
                            <div class="inline-block animate-spin border-2 border-blue-500 border-t-transparent rounded-full w-6 h-6 mr-2 vertical-middle"></div>
                            正在彙整使用活動…
                        </div>
                    </div>
                </div>
                <div class="admin-modal-footer">
                    <button class="admin-btn-close-large" id="admin-footer-close-btn">關閉視窗</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // 綁定關閉事件（安全導航回主頁）
        const closeBtn = () => {
            overlay.classList.remove('open');
        };
        overlay.querySelector('#admin-header-back-btn').addEventListener('click', closeBtn);
        overlay.querySelector('#admin-footer-close-btn').addEventListener('click', closeBtn);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeBtn();
        });

        // 分頁切換
        bindTabs(overlay);

        // 搜尋功能
        overlay.querySelector('#admin-search-input').addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            renderTable(query);
        });

        // 一鍵救援（事件委派，按鈕每次 renderTable 都會重建）
        overlay.querySelector('#admin-table-body').addEventListener('click', (e) => {
            const btn = e.target.closest('.admin-btn-rescue');
            if (!btn) return;
            rescueTeacher(btn);
        });
    }

    // ── 步驟1：點救援 → 拉孤兒明細 → 開「先檢視再勾選」面板 ──
    async function rescueTeacher(btn) {
        const uid = btn.getAttribute('data-rescue-uid');
        const name = btn.getAttribute('data-rescue-name') || '這位老師';
        if (!uid) return;

        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = '讀取中…';

        try {
            const fn = firebase.app().functions('asia-east1').httpsCallable('getTeacherOrphanDetails');
            const resp = await fn({ uid });
            const r = (resp && resp.data) || {};
            if (!r.ok) throw new Error(r.reason || '回傳異常');
            const orphans = r.data || [];
            if (orphans.length === 0) {
                if (typeof NotificationSystem !== 'undefined') NotificationSystem.info(`「${name}」目前已無孤兒班級。`);
                await loadStats();
                return;
            }
            openOrphanReview(uid, name, orphans);
        } catch (error) {
            console.error('[AdminConsole] 讀取孤兒明細失敗:', error);
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.error('讀取孤兒明細失敗：' + (error.message || '未知錯誤'));
            }
        } finally {
            btn.disabled = false;
            btn.textContent = original;
        }
    }

    // ── 步驟2：渲染孤兒勾選面板 ──
    function openOrphanReview(uid, teacherName, orphans) {
        let modal = document.getElementById('orphan-review-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'orphan-review-modal';
            modal.className = 'admin-modal-overlay';
            modal.style.zIndex = '10001';
            document.body.appendChild(modal);
        }

        const rows = orphans.map((o) => {
            const hasStudents = o.studentCount > 0;
            const sample = (o.sampleNames || []).join('、');
            const meta = hasStudents
                ? `<span class="badge-orange">👥 ${o.studentCount} 位學生</span>` +
                  (sample ? `<span class="orphan-sample">${sample}${o.studentCount > o.sampleNames.length ? '…' : ''}</span>` : '')
                : `<span class="orphan-empty">⚠️ 0 學生（空班，多半是可丟的殘留）</span>`;
            return `
                <label class="orphan-item">
                    <input type="checkbox" class="orphan-check" value="${o.id}" ${hasStudents ? 'checked' : ''}>
                    <div class="orphan-info">
                        <div class="orphan-line1">
                            <span class="orphan-name">${o.suggestedName || o.id}</span>
                            ${o.createdLabel ? `<span class="orphan-date">建立於 ${o.createdLabel}</span>` : ''}
                        </div>
                        <div class="orphan-line2">${meta}</div>
                        <div class="orphan-id">ID: ${o.id}</div>
                    </div>
                </label>`;
        }).join('');

        modal.innerHTML = `
            <div class="admin-modal-content" style="max-width:min(620px,96vw);">
                <div class="admin-modal-header">
                    <div class="admin-modal-title">🩺 檢視並挑選要救援的班級</div>
                </div>
                <div class="admin-modal-body">
                    <p style="font-size:0.9rem;color:#475569;margin-bottom:0.5rem;" class="dark:text-gray-300">
                        老師「<strong>${teacherName}</strong>」有 ${orphans.length} 個孤兒班級。
                        <strong>孤兒不一定是遺失的班</strong>，也可能是早期刪掉的殘留——請只勾選「確定要救回」的。
                        有學生的已預設勾選、空班預設不勾。
                    </p>
                    <p style="font-size:0.82rem;color:#64748b;margin-bottom:1rem;">救回只會補進名冊（只增不減），不會刪任何資料；沒勾的維持原狀。</p>
                    <div class="orphan-list">${rows}</div>
                </div>
                <div class="admin-modal-footer" style="justify-content:space-between;">
                    <button class="admin-btn-cancel" id="orphan-cancel-btn">取消</button>
                    <button class="admin-btn-close-large" id="orphan-confirm-btn" style="background:#059669;">救回勾選的班級</button>
                </div>
            </div>`;

        requestAnimationFrame(() => modal.classList.add('open'));

        const close = () => modal.classList.remove('open');
        modal.querySelector('#orphan-cancel-btn').addEventListener('click', close);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
        modal.querySelector('#orphan-confirm-btn').addEventListener('click', () => {
            const ids = Array.from(modal.querySelectorAll('.orphan-check:checked')).map(c => c.value);
            confirmRescue(uid, teacherName, ids, modal);
        });
    }

    // ── 步驟3：對勾選的 classIds 執行救援 ──
    async function confirmRescue(uid, teacherName, classIds, modal) {
        if (!classIds || classIds.length === 0) {
            if (typeof NotificationSystem !== 'undefined') NotificationSystem.warning('請至少勾選一個要救援的班級');
            return;
        }
        const confirmBtn = modal.querySelector('#orphan-confirm-btn');
        if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = '救援中…'; }

        try {
            const fn = firebase.app().functions('asia-east1').httpsCallable('repairTeacherRegistry');
            const resp = await fn({ uid, classIds });
            const r = (resp && resp.data) || {};
            if (!r.ok) throw new Error(r.reason || '回傳異常');

            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.success(
                    `🩺 已為「${teacherName}」救回 ${r.recovered} 個班級：${(r.names || []).join('、')}。該老師下次登入／還原即可看到。`
                );
            }
            modal.classList.remove('open');
            await loadStats();
        } catch (error) {
            console.error('[AdminConsole] 救援失敗:', error);
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.error('救援失敗：' + (error.message || '未知錯誤'));
            }
            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = '救回勾選的班級'; }
        }
    }

    // ── 渲染表格資料 ──
    function renderTable(searchQuery = '') {
        const tbody = document.getElementById('admin-table-body');
        const summary = document.getElementById('admin-stats-summary');
        if (!tbody) return;

        const filtered = statsData.filter(item => {
            const name = (item.name || '').toLowerCase();
            const email = (item.email || '').toLowerCase();
            return name.includes(searchQuery) || email.includes(searchQuery);
        });

        if (summary) {
            summary.textContent = `共 ${statsData.length} 位教師，已篩選出 ${filtered.length} 位`;
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center;padding:2rem;color:#94a3b8;">
                        無符合條件的教師資料
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map(item => {
            let lastSyncText = '從未同步';
            if (item.lastSync) {
                try {
                    const d = new Date(item.lastSync);
                    lastSyncText = d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
                } catch (e) {
                    lastSyncText = item.lastSync;
                }
            }

            const orphanBadge = item.orphanCount > 0
                ? `<span class="badge-orange" title="孤兒班級 ID: ${item.orphans.join(', ')}">⚠️ ${item.orphanCount} 個孤兒</span>`
                : `<span class="badge-green">無孤兒資料</span>`;

            // 只有「有孤兒」的老師才出現救援按鈕；用 data-* 帶 uid 給事件委派
            const rescueCell = item.orphanCount > 0
                ? `<button class="admin-btn-rescue" data-rescue-uid="${item.uid}" data-rescue-name="${(item.name || '').replace(/"/g, '&quot;')}" data-rescue-count="${item.orphanCount}">🩺 一鍵救援</button>`
                : `<span class="text-xs text-gray-400">—</span>`;

            return `
                <tr>
                    <td>
                        <div class="font-semibold text-gray-800 dark:text-gray-100">${item.name}</div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">${item.email || '無電子郵件'}</div>
                    </td>
                    <td style="font-weight: 600;">${item.classCount} 個班級</td>
                    <td>${orphanBadge}</td>
                    <td class="text-xs text-gray-600 dark:text-gray-400">${lastSyncText}</td>
                    <td class="text-xs text-gray-500 dark:text-gray-400" style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.device || ''}">${item.device || '-'}</td>
                    <td>${rescueCell}</td>
                </tr>
            `;
        }).join('');
    }


    // ── 使用活動：資料載入與渲染 ─────────────────────────────
    let analyticsLoaded = false;

    function esc(v) {
        return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    /** 橫向長條圖。以該組最大值為滿格。 */
    function barChart(rows, opts) {
        if (!rows.length) return '<div class="an-empty">尚無資料</div>';
        const max = Math.max.apply(null, rows.map(function (r) { return r.value; })) || 1;
        const cls = (opts && opts.warm) ? ' warm' : '';
        const unit = (opts && opts.unit) || '';
        return rows.map(function (r) {
            const pct = (r.value / max * 100).toFixed(1);
            return '<div class="bar-row">'
                + '<div class="bar-name" title="' + esc(r.label) + '">' + esc(r.label) + '</div>'
                + '<div class="bar-track"><div class="bar-fill' + cls + '" style="width:' + pct + '%"></div></div>'
                + '<div class="bar-val">' + r.value + unit + '</div>'
                + '</div>';
        }).join('');
    }

    /** 每日趨勢的直向柱狀圖。 */
    function trendChart(days, key) {
        if (!days.length) return '<div class="an-empty">尚無資料</div>';
        const max = Math.max.apply(null, days.map(function (d) { return d[key]; })) || 1;
        const bars = days.map(function (d) {
            const h = (d[key] / max * 100).toFixed(1);
            return '<div class="trend-col" title="' + esc(d.day) + '：' + d[key] + '">'
                + '<div class="trend-bar" style="height:' + h + '%"></div></div>';
        }).join('');
        return '<div class="trend">' + bars + '</div>'
            + '<div class="trend-labels"><span>' + esc(days[0].day) + '</span>'
            + '<span>' + esc(days[days.length - 1].day) + '</span></div>';
    }

    function kpi(label, value, unit) {
        return '<div class="kpi-card"><div class="kpi-label">' + label + '</div>'
            + '<div class="kpi-value">' + value
            + (unit ? '<span class="kpi-unit">' + unit + '</span>' : '') + '</div></div>';
    }

    function section(title, hint, body) {
        return '<div class="an-section"><div class="an-title">' + title + '</div>'
            + '<div class="an-hint">' + hint + '</div>' + body + '</div>';
    }

    function renderAnalytics(d) {
        const box = document.getElementById('admin-analytics-body');
        if (!box) return;

        const a = d.accounts || {};
        const act = d.activity || {};
        const ev = d.events || {};
        const days = ev.days || [];
        const counties = d.counties || [];
        const active7 = (act.today || 0) + (act.last7 || 0);
        const active30 = active7 + (act.last30 || 0);

        // 事件留底是 2026-09-03 才上線的，之前沒有歷史；講清楚免得誤以為沒人用
        const eventsNote = days.length <= 1
            ? '事件留底自 2026-09-03 起才開始記錄，趨勢要幾天後才看得出來。'
            : '近 ' + days.length + ' 天，共 ' + (ev.totalEvents || 0) + ' 筆事件。';

        let html = '<div class="kpi-grid">'
            + kpi('註冊老師', a.teachers || 0, '位')
            + kpi('今日登入', act.today || 0, '位')
            + kpi('近 7 天活躍', active7, '位')
            + kpi('近 30 天活躍', active30, '位')
            + kpi('涵蓋縣市', counties.length, '個')
            + kpi('個人信箱登入', a.personalEmail || 0, '位')
            + kpi('匿名訪客帳號', a.anonymous || 0, '')
            + '</div>';

        const countyTeachers = counties.reduce(function (n, c) { return n + c.teachers; }, 0);
        const coverage = a.teachers ? Math.round(countyTeachers / a.teachers * 100) : 0;
        html += section('🗺️ 縣市分佈',
            '依學校 email 網域判斷，涵蓋 ' + countyTeachers + ' / ' + (a.teachers || 0)
                + ' 位老師（' + coverage + '%）。其餘用個人信箱登入，網域看不出縣市，只能略過。',
            barChart(counties.map(function (c) { return { label: c.name, value: c.teachers }; }), { unit: ' 位' }));

        html += section('📈 老師成長',
            '依帳號註冊月份。這份資料來自 Firebase Auth，涵蓋事件留底上線前的完整歷史。',
            barChart((d.growth || []).map(function (g) { return { label: g.month, value: g.count }; }), { unit: ' 位' }));

        html += section('🕒 活躍度分佈',
            '依每位老師的最後登入時間分組。',
            barChart([
                { label: '今天', value: act.today || 0 },
                { label: '7 天內', value: act.last7 || 0 },
                { label: '30 天內', value: act.last30 || 0 },
                { label: '90 天內', value: act.last90 || 0 },
                { label: '更久以前', value: act.older || 0 }
            ].filter(function (r) { return r.value > 0; }), { unit: ' 位' }));

        html += section('📅 每日活躍老師', esc(eventsNote), trendChart(days, 'activeTeachers'));

        html += section('🔥 功能熱度',
            '功能點擊次數累計（自事件留底上線起）。',
            barChart((ev.features || []).slice(0, 12).map(function (f) {
                return { label: f.label, value: f.count };
            }), { warm: true, unit: ' 次' }));

        html += section('🏫 學校排行',
            '只含教育網域（.edu.tw）；個人信箱不是學校，不列入。',
            barChart((d.schools || []).map(function (s) {
                return { label: (s.county ? s.county + ' · ' : '') + s.domain, value: s.teachers };
            }), { unit: ' 位' }));

        const pd = d.personalDomains || [];
        if (pd.length) {
            html += section('📮 個人信箱登入',
                '這些老師有被算進總人數、成長曲線與活躍度，但網域看不出學校與縣市，'
                    + '是縣市分析唯一的盲區。',
                barChart(pd.map(function (u) {
                    return { label: u.domain, value: u.teachers };
                }), { unit: ' 位' }));
        }

        const un = d.unmappedDomains || [];
        if (un.length) {
            html += section('⚠️ 未對應的教育網域',
                '這些是 .edu.tw 網域但縣市代碼不在對照表裡，所以沒被算進縣市分佈。把代碼補進 functions/index.js 的 COUNTY_BY_CODE 就會歸位。',
                '<div class="an-warn">' + un.map(function (u) {
                    return esc(u.domain) + '（' + u.teachers + ' 位）';
                }).join('、') + '</div>');
        }

        html += '<div class="an-hint" style="text-align:right;margin-top:1rem;">資料產生時間：'
            + esc(new Date(d.generatedAt).toLocaleString('zh-TW', { hour12: false })) + '</div>';

        box.className = '';
        box.innerHTML = html;
    }

    async function loadAnalytics(force) {
        if (analyticsLoaded && !force) return;
        const box = document.getElementById('admin-analytics-body');
        if (!box) return;

        box.className = 'an-empty';
        box.innerHTML = '<div class="inline-block animate-spin border-2 border-blue-500 '
            + 'border-t-transparent rounded-full w-6 h-6 mr-2 vertical-middle"></div>'
            + '正在彙整使用活動…（要走訪所有帳號，約需幾秒）';

        try {
            const fn = firebase.app().functions('asia-east1').httpsCallable('getUsageAnalytics');
            const resp = await fn();
            if (!resp || !resp.data || !resp.data.ok) {
                throw new Error((resp && resp.data && resp.data.reason) || 'API 回傳異常');
            }
            analyticsLoaded = true;
            renderAnalytics(resp.data.data);
        } catch (error) {
            console.error('[AdminConsole] 載入使用活動失敗:', error);
            box.className = 'an-empty';
            box.innerHTML = '<div style="color:#ef4444;font-weight:600;">❌ 載入失敗：'
                + esc(error.message || '請確認您擁有管理員權限') + '</div>';
        }
    }

    // ── 呼叫 API 載入數據 ──
    async function loadStats() {
        injectCSS();
        injectHTML();

        const overlay = document.getElementById('admin-console-modal');
        if (!overlay) return;

        overlay.classList.add('open');

        // 重置載入狀態
        const tbody = document.getElementById('admin-table-body');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center;padding:2rem;color:#94a3b8;">
                        <div class="inline-block animate-spin border-2 border-blue-500 border-t-transparent rounded-full w-6 h-6 mr-2 vertical-middle"></div>
                        正在載入雲端統計中...
                    </td>
                </tr>
            `;
        }

        try {
            const getAdminStatsFn = firebase.app().functions('asia-east1').httpsCallable('getAdminStats');
            const response = await getAdminStatsFn();
            if (response && response.data && response.data.ok) {
                statsData = response.data.data;
                renderTable();
            } else {
                throw new Error(response?.data?.reason || 'API 回傳異常');
            }
        } catch (error) {
            console.error('[AdminConsole] 載入資料失敗:', error);
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align:center;padding:2rem;color:#ef4444;font-weight:600;">
                            ❌ 載入失敗: ${error.message || '請確認您擁有管理員權限'}
                        </td>
                    </tr>
                `;
            }
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.error('載入後台維運數據失敗: ' + error.message);
            }
        }
    }

    // 分頁切換（事件委派）：點「使用活動」才去拉資料，
    // 避免每次開後台都跑一次「走訪所有帳號」的昂貴查詢。
    function bindTabs(overlay) {
        const tabs = overlay.querySelectorAll('.admin-tab');
        tabs.forEach(function (btn) {
            btn.addEventListener('click', function () {
                const name = btn.getAttribute('data-pane');
                tabs.forEach(function (b) { b.classList.toggle('active', b === btn); });
                overlay.querySelectorAll('.admin-pane').forEach(function (pane) {
                    pane.classList.toggle('active', pane.id === 'admin-pane-' + name);
                });
                if (name === 'activity') loadAnalytics();
            });
        });
    }

    // 全域掛載
    window.showAdminConsole = loadStats;
})();
