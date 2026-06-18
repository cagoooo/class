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

    // ── 代指定老師一鍵救援孤兒班級 ──
    async function rescueTeacher(btn) {
        const uid = btn.getAttribute('data-rescue-uid');
        const name = btn.getAttribute('data-rescue-name') || '這位老師';
        const count = btn.getAttribute('data-rescue-count') || '';
        if (!uid) return;

        const ok = window.confirm(
            `確定要幫「${name}」救回 ${count} 個孤兒班級嗎？\n\n` +
            `系統只會「把找不到的班級補回名冊」（只增不減，不會刪除任何既有班級）。\n` +
            `救回的班級若無原始名稱，會先給暫名，該老師之後可自行改名。`
        );
        if (!ok) return;

        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = '救援中…';

        try {
            const fn = firebase.app().functions('asia-east1').httpsCallable('repairTeacherRegistry');
            const resp = await fn({ uid });
            const r = (resp && resp.data) || {};
            if (!r.ok) throw new Error(r.reason || '回傳異常');

            if (r.recovered > 0) {
                if (typeof NotificationSystem !== 'undefined') {
                    NotificationSystem.success(
                        `🩺 已為「${name}」救回 ${r.recovered} 個班級：${(r.names || []).join('、')}。` +
                        `該老師下次登入／還原即可看到。`
                    );
                }
            } else {
                if (typeof NotificationSystem !== 'undefined') {
                    NotificationSystem.info(`「${name}」目前已無孤兒班級可救援。`);
                }
            }
            // 重新載入統計，孤兒數歸零後按鈕會自動消失
            await loadStats();
        } catch (error) {
            console.error('[AdminConsole] 救援失敗:', error);
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.error('救援失敗：' + (error.message || '未知錯誤'));
            }
            btn.disabled = false;
            btn.textContent = original;
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

    // 全域掛載
    window.showAdminConsole = loadStats;
})();
