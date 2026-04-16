/**
 * 班級公告系統 v1.0
 * Class Announcement System
 *
 * 功能：4 種類型分類、置頂、到期自動隱藏、全螢幕公佈欄
 * 自動注入 CSS + HTML，不依賴外部樣式
 */

(function () {
    'use strict';

    // =============================================
    // 公告類型定義
    // =============================================

    const AnnouncementTypes = {
        GENERAL: { icon: '📢', color: '#6366f1', bg: '#eef2ff', label: '一般公告', border: '#818cf8' },
        URGENT: { icon: '🚨', color: '#ef4444', bg: '#fef2f2', label: '緊急通知', border: '#f87171' },
        EVENT: { icon: '🎉', color: '#16a34a', bg: '#f0fdf4', label: '活動通知', border: '#4ade80' },
        HOMEWORK: { icon: '📚', color: '#d97706', bg: '#fffbeb', label: '作業提醒', border: '#fbbf24' },
    };

    // =============================================
    // 資料管理（localStorage）
    // =============================================

    let announcements = [];

    function loadData() {
        try {
            announcements = JSON.parse(localStorage.getItem('classAnnouncements') || '[]');
        } catch {
            announcements = [];
        }
    }

    function saveData() {
        localStorage.setItem('classAnnouncements', JSON.stringify(announcements));
    }

    // =============================================
    // 公告邏輯核心
    // =============================================

    const Announcement = {
        create(data) {
            return {
                id: Date.now().toString(),
                type: data.type || 'GENERAL',
                title: data.title.trim(),
                content: data.content.trim(),
                isPinned: data.isPinned || false,
                createdAt: new Date().toISOString(),
                expiresAt: data.expiresAt || null,
            };
        },

        getActive() {
            const now = new Date();
            return announcements
                .filter(a => !a.expiresAt || new Date(a.expiresAt) > now)
                .sort((a, b) => {
                    if (a.isPinned !== b.isPinned) return b.isPinned - a.isPinned;
                    return new Date(b.createdAt) - new Date(a.createdAt);
                });
        },

        getExpired() {
            const now = new Date();
            return announcements.filter(a => a.expiresAt && new Date(a.expiresAt) <= now);
        },

        add(data) {
            const item = this.create(data);
            announcements.unshift(item);
            saveData();
            return item;
        },

        delete(id) {
            announcements = announcements.filter(a => a.id !== id);
            saveData();
        },

        togglePin(id) {
            const item = announcements.find(a => a.id === id);
            if (item) {
                item.isPinned = !item.isPinned;
                saveData();
            }
        },

        getById(id) {
            return announcements.find(a => a.id === id);
        },

        update(id, data) {
            const item = announcements.find(a => a.id === id);
            if (!item) return;
            item.type = data.type || item.type;
            item.title = data.title || item.title;
            item.content = data.content || item.content;
            item.isPinned = data.isPinned !== undefined ? data.isPinned : item.isPinned;
            item.expiresAt = data.expiresAt !== undefined ? data.expiresAt : item.expiresAt;
            saveData();
        },
    };

    // =============================================
    // CSS 注入
    // =============================================

    const announcementCSS = `
        /* ========= 公告系統：主容器 ========= */
        #announcement-section {
            animation: fadeInUp 0.3s ease;
        }

        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(12px); }
            to   { opacity: 1; transform: translateY(0); }
        }

        /* ========= 公告卡片 ========= */
        .ann-card {
            position: relative;
            border-radius: 1rem;
            padding: 1rem 1.25rem;
            margin-bottom: 0.75rem;
            border-left: 5px solid;
            transition: box-shadow 0.2s, transform 0.2s;
            animation: fadeInUp 0.25s ease;
        }

        .ann-card:hover {
            box-shadow: 0 6px 20px rgba(0,0,0,0.1);
            transform: translateY(-1px);
        }

        .ann-card.pinned::after {
            content: '📌';
            position: absolute;
            top: 0.6rem;
            right: 0.75rem;
            font-size: 1rem;
        }

        .ann-card-header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            flex-wrap: wrap;
            margin-bottom: 0.4rem;
        }

        .ann-type-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.25rem;
            padding: 0.2rem 0.6rem;
            border-radius: 999px;
            font-size: 0.75rem;
            font-weight: 600;
            color: white;
        }

        .ann-title {
            font-size: 1rem;
            font-weight: 700;
            color: #1f2937;
            flex: 1;
        }

        .ann-content {
            color: #4b5563;
            font-size: 0.9rem;
            line-height: 1.6;
            white-space: pre-wrap;
            margin-bottom: 0.5rem;
        }

        .ann-meta {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            font-size: 0.75rem;
            color: #9ca3af;
            flex-wrap: wrap;
        }

        .ann-expires {
            color: #ef4444;
            font-weight: 600;
        }

        .ann-actions {
            display: flex;
            gap: 0.4rem;
            margin-left: auto;
        }

        .ann-btn {
            background: none;
            border: 1px solid #e5e7eb;
            border-radius: 0.4rem;
            padding: 0.2rem 0.5rem;
            font-size: 0.75rem;
            cursor: pointer;
            transition: all 0.2s;
            color: #6b7280;
        }

        .ann-btn:hover {
            background: #f3f4f6;
            color: #374151;
        }

        .ann-btn.pin-active {
            background: #fef3c7;
            border-color: #fcd34d;
            color: #92400e;
        }

        .ann-btn.delete {
            border-color: #fecaca;
            color: #ef4444;
        }

        .ann-btn.delete:hover {
            background: #fef2f2;
        }

        /* ========= 新增公告表單 ========= */
        .ann-form-card {
            background: white;
            border-radius: 1rem;
            padding: 1.25rem;
            border: 1px solid #e5e7eb;
            margin-bottom: 1.5rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }

        .ann-type-selector {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin-bottom: 0.75rem;
        }

        .ann-type-btn {
            display: flex;
            align-items: center;
            gap: 0.35rem;
            padding: 0.4rem 0.9rem;
            border-radius: 999px;
            border: 2px solid transparent;
            background: #f3f4f6;
            font-size: 0.8rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            color: #6b7280;
        }

        .ann-type-btn.selected {
            color: white;
            border-color: transparent;
        }

        .ann-type-btn:hover:not(.selected) {
            background: #e5e7eb;
            color: #374151;
        }

        .ann-input {
            width: 100%;
            padding: 0.6rem 0.85rem;
            border: 1.5px solid #e5e7eb;
            border-radius: 0.6rem;
            font-size: 0.9rem;
            font-family: inherit;
            transition: border-color 0.2s, box-shadow 0.2s;
            background: white;
            margin-bottom: 0.6rem;
            box-sizing: border-box;
        }

        .ann-input:focus {
            outline: none;
            border-color: #6366f1;
            box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
        }

        .ann-input-row {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 0.6rem;
            align-items: center;
            margin-bottom: 0.75rem;
        }

        .ann-submit-btn {
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            color: white;
            border: none;
            border-radius: 0.6rem;
            padding: 0.6rem 1.5rem;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            white-space: nowrap;
        }

        .ann-submit-btn:hover {
            box-shadow: 0 4px 14px rgba(99,102,241,0.4);
            transform: translateY(-1px);
        }

        .ann-submit-btn:active { transform: scale(0.97); }

        /* ========= 空狀態 ========= */
        .ann-empty {
            text-align: center;
            padding: 3rem 1rem;
            color: #9ca3af;
        }

        .ann-empty-icon { font-size: 3.5rem; margin-bottom: 0.75rem; }

        /* ========= 分頁標籤（全部/已過期） ========= */
        .ann-tab-group {
            display: flex;
            gap: 0.25rem;
            background: #f3f4f6;
            border-radius: 0.6rem;
            padding: 0.2rem;
            margin-bottom: 1rem;
            width: fit-content;
        }

        .ann-tab {
            padding: 0.35rem 1rem;
            border-radius: 0.4rem;
            border: none;
            background: transparent;
            font-size: 0.85rem;
            font-weight: 500;
            color: #6b7280;
            cursor: pointer;
            transition: all 0.2s;
        }

        .ann-tab.active {
            background: white;
            color: #1f2937;
            box-shadow: 0 1px 4px rgba(0,0,0,0.1);
            font-weight: 600;
        }

        /* ========= 全螢幕公佈欄 ========= */
        .ann-fullscreen-modal {
            position: fixed;
            inset: 0;
            z-index: 9000;
            background: linear-gradient(135deg, #0f1923 0%, #1e1b4b 50%, #0f1923 100%);
            display: none;
            flex-direction: column;
            overflow-y: auto;
            padding: 2rem;
        }

        .ann-fullscreen-modal.active {
            display: flex;
        }

        .ann-fullscreen-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 2rem;
            flex-wrap: wrap;
            gap: 1rem;
        }

        .ann-fullscreen-title {
            color: white;
            font-size: clamp(1.5rem, 4vw, 2.5rem);
            font-weight: 800;
            letter-spacing: -0.02em;
        }

        .ann-fullscreen-close {
            background: rgba(255,255,255,0.15);
            border: none;
            color: white;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            font-size: 1.4rem;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .ann-fullscreen-close:hover {
            background: rgba(255,255,255,0.3);
            transform: scale(1.1);
        }

        .ann-fullscreen-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
            gap: 1.25rem;
            width: 100%;
        }

        .ann-fullscreen-card {
            background: rgba(255,255,255,0.07);
            backdrop-filter: blur(8px);
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 1.25rem;
            padding: 1.5rem;
            animation: fadeInUp 0.35s ease;
            border-left: 5px solid;
            transition: transform 0.2s;
        }

        .ann-fullscreen-card:hover { transform: translateY(-3px); }

        .ann-fullscreen-card .ann-title {
            color: white;
            font-size: 1.1rem;
            margin-bottom: 0.5rem;
        }

        .ann-fullscreen-card .ann-content {
            color: rgba(255,255,255,0.8);
            font-size: 0.95rem;
        }

        .ann-fullscreen-card .ann-meta {
            color: rgba(255,255,255,0.45);
            margin-top: 0.75rem;
        }

        /* ========= 全螢幕按鈕 ========= */
        .ann-fullscreen-btn {
            background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
            color: white;
            border: none;
            padding: 0.55rem 1.2rem;
            border-radius: 0.6rem;
            font-size: 0.875rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
        }

        .ann-fullscreen-btn:hover {
            box-shadow: 0 4px 14px rgba(79,70,229,0.5);
            transform: translateY(-1px);
        }

        /* ========= 徽章計數（快速導覽按鈕） ========= */
        .ann-nav-badge {
            position: absolute;
            top: 0.35rem;
            right: 0.35rem;
            background: #ef4444;
            color: white;
            border-radius: 999px;
            font-size: 0.65rem;
            font-weight: 700;
            padding: 0.1rem 0.4rem;
            min-width: 18px;
            text-align: center;
            line-height: 1.3;
        }

        /* ========= RWD ========= */
        @media (max-width: 640px) {
            .ann-input-row { grid-template-columns: 1fr; }
            .ann-fullscreen-grid { grid-template-columns: 1fr; }
        }
    `;

    function injectCSS() {
        if (document.getElementById('announcement-styles')) return;
        const style = document.createElement('style');
        style.id = 'announcement-styles';
        style.textContent = announcementCSS;
        document.head.appendChild(style);
    }

    // =============================================
    // HTML 建置
    // =============================================

    function buildSectionHTML() {
        return `
        <div id="announcement-section" class="section hidden bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4 sm:mb-6">
            <div class="flex items-center justify-between mb-5 flex-wrap gap-3">
                <h2 class="text-xl sm:text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <span class="text-2xl sm:text-3xl">📢</span>班級公告
                </h2>
                <button onclick="openAnnouncementBoard()" class="ann-fullscreen-btn">
                    ⤢ 全螢幕公佈欄
                </button>
            </div>

            <!-- 新增公告表單 -->
            <div class="ann-form-card">
                <h3 class="text-base font-semibold text-gray-700 mb-3">✏️ 發布新公告</h3>

                <!-- 類型選擇 -->
                <div class="ann-type-selector" id="annTypeSelector">
                    ${Object.entries(AnnouncementTypes).map(([key, t]) => `
                        <button class="ann-type-btn${key === 'GENERAL' ? ' selected' : ''}"
                            data-type="${key}"
                            onclick="selectAnnType('${key}')"
                            style="${key === 'GENERAL' ? `background:${t.color}` : ''}">
                            ${t.icon} ${t.label}
                        </button>
                    `).join('')}
                </div>

                <input type="text" id="annTitleInput" class="ann-input"
                    placeholder="📌 公告標題（必填）" maxlength="60">

                <textarea id="annContentInput" class="ann-input" rows="3"
                    placeholder="公告內容（選填）" style="resize:vertical;"></textarea>

                <div class="ann-input-row">
                    <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
                        <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.85rem;color:#6b7280;cursor:pointer;">
                            <input type="checkbox" id="annPinnedCheck" style="width:14px;height:14px;accent-color:#6366f1;">
                            📌 置頂
                        </label>
                        <div style="display:flex;align-items:center;gap:0.4rem;font-size:0.85rem;color:#6b7280;">
                            <span>到期日：</span>
                            <input type="date" id="annExpiresInput" class="ann-input"
                                style="width:auto;margin:0;padding:0.3rem 0.6rem;font-size:0.82rem;">
                            <button onclick="document.getElementById('annExpiresInput').value=''"
                                style="font-size:0.75rem;color:#9ca3af;background:none;border:none;cursor:pointer;">清除</button>
                        </div>
                    </div>
                    <button onclick="submitAnnouncement()" data-primary-action="true" class="ann-submit-btn">發布公告</button>
                </div>
            </div>

            <!-- 分頁標籤 -->
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;margin-bottom:1rem;">
                <div class="ann-tab-group">
                    <button class="ann-tab active" id="annTabActive" onclick="switchAnnTab('active')">✅ 有效公告</button>
                    <button class="ann-tab" id="annTabExpired" onclick="switchAnnTab('expired')">🕒 已過期</button>
                </div>
                <span id="annCount" style="font-size:0.8rem;color:#9ca3af;"></span>
            </div>

            <!-- 公告列表 -->
            <div id="announcementList"></div>
        </div>

        <!-- 全螢幕公佈欄 -->
        <div id="announcementFullscreen" class="ann-fullscreen-modal">
            <div class="ann-fullscreen-header">
                <div>
                    <div class="ann-fullscreen-title">📢 班級公佈欄</div>
                    <div id="annFullscreenDate" style="color:rgba(255,255,255,0.5);font-size:0.9rem;margin-top:0.25rem;"></div>
                </div>
                <button class="ann-fullscreen-close" onclick="closeAnnouncementBoard()" title="關閉">✕</button>
            </div>
            <div class="ann-fullscreen-grid" id="annFullscreenGrid"></div>
        </div>
        `;
    }

    // =============================================
    // UI 渲染
    // =============================================

    let currentTab = 'active';
    let selectedType = 'GENERAL';

    function formatDate(isoString) {
        const d = new Date(isoString);
        return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    }

    function formatExpiry(isoString) {
        if (!isoString) return '';
        const d = new Date(isoString);
        const now = new Date();
        const diffDays = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return '已過期';
        if (diffDays === 0) return '今日到期';
        if (diffDays === 1) return '明日到期';
        return `${diffDays} 天後到期`;
    }

    function renderCard(ann, isFullscreen = false) {
        const t = AnnouncementTypes[ann.type] || AnnouncementTypes.GENERAL;
        const expiry = ann.expiresAt ? formatExpiry(ann.expiresAt) : '';
        const isExpired = ann.expiresAt && new Date(ann.expiresAt) <= new Date();

        if (isFullscreen) {
            return `
            <div class="ann-fullscreen-card${ann.isPinned ? ' pinned' : ''}"
                style="border-left-color:${t.color};">
                <div class="ann-card-header">
                    <span class="ann-type-badge" style="background:${t.color};">${t.icon} ${t.label}</span>
                    ${ann.isPinned ? '<span style="color:rgba(255,255,255,0.6);font-size:0.75rem;">📌</span>' : ''}
                </div>
                <div class="ann-title" style="color:white;">${escapeHtml(ann.title)}</div>
                ${ann.content ? `<div class="ann-content" style="color:rgba(255,255,255,0.75);">${escapeHtml(ann.content)}</div>` : ''}
                <div class="ann-meta">
                    <span>${formatDate(ann.createdAt)}</span>
                    ${expiry ? `<span class="${isExpired ? 'ann-expires' : ''}" style="color:rgba(255,255,255,0.5);">${expiry}</span>` : ''}
                </div>
            </div>`;
        }

        return `
        <div class="ann-card${ann.isPinned ? ' pinned' : ''}"
            style="background:${t.bg};border-left-color:${t.border};">
            <div class="ann-card-header">
                <span class="ann-type-badge" style="background:${t.color};">${t.icon} ${t.label}</span>
                <span class="ann-title">${escapeHtml(ann.title)}</span>
            </div>
            ${ann.content ? `<div class="ann-content">${escapeHtml(ann.content)}</div>` : ''}
            <div class="ann-meta">
                <span>📅 ${formatDate(ann.createdAt)}</span>
                ${expiry ? `<span class="${isExpired ? 'ann-expires' : ''}">${expiry}</span>` : ''}
                <div class="ann-actions">
                    <button class="ann-btn${ann.isPinned ? ' pin-active' : ''}"
                        onclick="toggleAnnPin('${ann.id}')" title="${ann.isPinned ? '取消置頂' : '置頂'}">
                        ${ann.isPinned ? '📌 取消置頂' : '📌 置頂'}
                    </button>
                    <button class="ann-btn delete"
                        onclick="deleteAnn('${ann.id}')" title="刪除">🗑️</button>
                </div>
            </div>
        </div>`;
    }

    function renderList() {
        const container = document.getElementById('announcementList');
        const countEl = document.getElementById('annCount');
        if (!container) return;

        const items = currentTab === 'active' ? Announcement.getActive() : Announcement.getExpired();

        if (items.length === 0) {
            if (typeof EmptyState !== 'undefined' && currentTab === 'active') {
                container.innerHTML = EmptyState.html({
                    icon: '📢',
                    title: '還沒有班級公告',
                    desc: '緊急通知、活動提醒、重要公告都可以在這裡發布，班級學生都能看到。',
                    actionLabel: '✏️ 發布第一則公告',
                    actionOnClick: "document.getElementById('annTitleInput')?.focus()",
                });
            } else {
                container.innerHTML = `
                    <div class="ann-empty">
                        <div class="ann-empty-icon">${currentTab === 'active' ? '📭' : '🕒'}</div>
                        <div>${currentTab === 'active' ? '尚無有效公告' : '沒有已過期的公告'}</div>
                    </div>`;
            }
        } else {
            container.innerHTML = items.map(a => renderCard(a)).join('');
        }

        if (countEl) countEl.textContent = `共 ${items.length} 則`;

        // 更新導覽按鈕徽章
        updateNavBadge();
    }

    function updateNavBadge() {
        const badge = document.getElementById('annNavBadge');
        const urgentCount = Announcement.getActive().filter(a => a.type === 'URGENT').length;
        if (badge) {
            badge.style.display = urgentCount > 0 ? '' : 'none';
            badge.textContent = urgentCount;
        }
    }

    function escapeHtml(text) {
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    // =============================================
    // 全域 API
    // =============================================

    window.selectAnnType = function (type) {
        selectedType = type;
        document.querySelectorAll('.ann-type-btn').forEach(btn => {
            const t = AnnouncementTypes[btn.dataset.type];
            if (btn.dataset.type === type) {
                btn.classList.add('selected');
                btn.style.background = t.color;
                btn.style.color = 'white';
            } else {
                btn.classList.remove('selected');
                btn.style.background = '';
                btn.style.color = '';
            }
        });
    };

    window.submitAnnouncement = function () {
        const title = document.getElementById('annTitleInput')?.value.trim();
        const content = document.getElementById('annContentInput')?.value.trim();
        const isPinned = document.getElementById('annPinnedCheck')?.checked;
        const expDate = document.getElementById('annExpiresInput')?.value;

        if (!title) {
            // 使用現有通知系統
            if (typeof NotificationSystem !== 'undefined') {
                NotificationSystem.warning('請輸入公告標題');
            } else {
                alert('請輸入公告標題');
            }
            document.getElementById('annTitleInput')?.focus();
            return;
        }

        Announcement.add({
            type: selectedType,
            title,
            content,
            isPinned,
            expiresAt: expDate ? new Date(expDate + 'T23:59:59').toISOString() : null,
        });

        // 清空表單
        document.getElementById('annTitleInput').value = '';
        document.getElementById('annContentInput').value = '';
        document.getElementById('annPinnedCheck').checked = false;
        document.getElementById('annExpiresInput').value = '';
        window.selectAnnType('GENERAL');

        // 切換到有效公告標籤並重繪
        currentTab = 'active';
        updateTabUI();
        renderList();

        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.success('公告已發布！');
        }
    };

    window.deleteAnn = function (id) {
        if (!confirm('確定要刪除這則公告嗎？')) return;
        Announcement.delete(id);
        renderList();
        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.success('公告已刪除');
        }
    };

    window.toggleAnnPin = function (id) {
        Announcement.togglePin(id);
        renderList();
    };

    window.switchAnnTab = function (tab) {
        currentTab = tab;
        updateTabUI();
        renderList();
    };

    function updateTabUI() {
        document.getElementById('annTabActive')?.classList.toggle('active', currentTab === 'active');
        document.getElementById('annTabExpired')?.classList.toggle('active', currentTab === 'expired');
    }

    // =============================================
    // 全螢幕公佈欄
    // =============================================

    window.openAnnouncementBoard = function () {
        const modal = document.getElementById('announcementFullscreen');
        if (!modal) return;

        const grid = document.getElementById('annFullscreenGrid');
        const dateEl = document.getElementById('annFullscreenDate');
        const active = Announcement.getActive();

        if (dateEl) {
            const now = new Date();
            const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
            dateEl.textContent = `民國 ${now.getFullYear() - 1911} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日（星期${weekdays[now.getDay()]}）`;
        }

        if (grid) {
            if (active.length === 0) {
                grid.innerHTML = `<div style="color:rgba(255,255,255,0.4);text-align:center;padding:4rem;grid-column:1/-1;">
                    <div style="font-size:4rem;margin-bottom:1rem;">📭</div>
                    <div style="font-size:1.2rem;">目前沒有有效的班級公告</div>
                </div>`;
            } else {
                grid.innerHTML = active.map(a => renderCard(a, true)).join('');
            }
        }

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    window.closeAnnouncementBoard = function () {
        const modal = document.getElementById('announcementFullscreen');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = '';
    };

    // ESC 關閉
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') window.closeAnnouncementBoard();
    });

    // =============================================
    // showSection 整合
    // =============================================

    function hookShowSection() {
        if (typeof window.showSection !== 'function') return;
        const _orig = window.showSection;
        window.showSection = function (section) {
            if (section === 'announcement') {
                // 自行處理：隱藏所有 .section，然後顯示公告 section
                document.querySelectorAll('.section').forEach(el => el.classList.add('hidden'));
                const annSection = document.getElementById('announcement-section');
                if (annSection) annSection.classList.remove('hidden');
                renderList();
                // 同步 URL hash（與 classnew.html 的 showSection 行為一致）
                try {
                    if (location.hash !== '#announcement') {
                        history.replaceState(null, '', '#announcement');
                    }
                } catch (e) { /* 忽略 hash 更新失敗 */ }
            } else {
                // 其他 section 交給原始函式，但先隱藏公告 section
                const annSection = document.getElementById('announcement-section');
                if (annSection) annSection.classList.add('hidden');
                _orig.apply(this, arguments);
            }
        };
    }

    // =============================================
    // 初始化
    // =============================================

    function init() {
        loadData();
        injectCSS();

        // 注入 HTML section + 全螢幕 modal
        if (!document.getElementById('announcement-section')) {
            const studentsSection = document.getElementById('students-section');
            if (studentsSection) {
                // 解析完整 HTML
                const wrapper = document.createElement('div');
                wrapper.innerHTML = buildSectionHTML();

                // 第一個子元素 = announcement-section
                const annSection = wrapper.querySelector('#announcement-section');
                // 最後一個子元素 = 全螢幕 modal
                const annFullscreen = wrapper.querySelector('#announcementFullscreen');

                // 插入 section 在 students-section 之前
                if (annSection) {
                    studentsSection.parentNode.insertBefore(annSection, studentsSection);
                }
                // 全螢幕 modal 加到 body 最後
                if (annFullscreen) {
                    document.body.appendChild(annFullscreen);
                }
            }
        }

        // 加入導覽按鈕
        addNavButton();

        // Hook showSection
        hookShowSection();

        console.log('✅ 班級公告系統已載入');
    }

    function addNavButton() {
        const navGrid = document.querySelector('.grid.grid-cols-2.sm\\:grid-cols-3.md\\:grid-cols-4.lg\\:grid-cols-7');
        if (!navGrid || document.getElementById('annNavBtn')) return;

        const btn = document.createElement('button');
        btn.id = 'annNavBtn';
        btn.className = 'bg-white p-3 sm:p-4 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 border-l-4 active:scale-95';
        btn.style.borderLeftColor = '#6366f1';
        btn.style.position = 'relative';
        btn.innerHTML = `
            <div class="text-2xl sm:text-3xl mb-1 sm:mb-2">📢</div>
            <div class="font-semibold text-gray-700 text-sm sm:text-base">班級公告</div>
            <span id="annNavBadge" class="ann-nav-badge" style="display:none;">0</span>
        `;
        btn.onclick = () => {
            if (typeof window.showSection === 'function') window.showSection('announcement');
        };
        navGrid.appendChild(btn);
        updateNavBadge();
    }

    // 等其他模組都載入後再初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // 稍微延遲確保 showSection 已定義
        setTimeout(init, 200);
    }

})();
