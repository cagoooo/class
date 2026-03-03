/**
 * 班級 Profile 管理模組
 * Class Profiles Module v1.0.0  2026-03-03
 *
 * 讓科任老師在同一帳號管理多個班級，資料完全隔離。
 *
 * 設計原則：
 * ① 向下相容：預設班級（id='default'）沿用現有 IDB 'ClassManagerDB' 和 Firebase 路徑
 * ② 新班級使用獨立 IDB 'ClassManagerDB-{id}' 和 Firebase 子路徑 classes/{id}/
 * ③ 切換班級時先同步 Firebase（若已登入）→ 更新 currentClassId → location.reload()
 *
 * 全域 API：
 *   ClassProfiles.list()            — 取得所有班級陣列
 *   ClassProfiles.current()         — 取得目前班級 ID
 *   ClassProfiles.currentProfile()  — 取得目前班級完整物件
 *   ClassProfiles.add(name)         — 新增班級（含 UI 輸入框）
 *   ClassProfiles.rename(id, name)  — 重新命名班級
 *   ClassProfiles.delete(id)        — 刪除班級（含清除 IDB）
 *   ClassProfiles.switchTo(id)      — 切換班級（同步後 reload）
 *   ClassProfiles.getDbName(id)     — 取得 IDB 名稱
 *   ClassProfiles.getFirebasePath(id) — 取得 Firebase 子路徑（空字串代表預設路徑）
 */

(function () {
    'use strict';

    // ==================== 常數 ====================

    const STORAGE_KEY = 'classProfiles';       // localStorage 儲存班級清單
    const CURRENT_KEY = 'currentClassId';     // localStorage 儲存目前班級 ID
    const DEFAULT_ID = 'default';
    const DEFAULT_NAME = '預設班級';

    // ==================== Profile 資料操作 ====================

    /** 讀取所有班級（保證至少有 default） */
    function loadProfiles() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const profiles = raw ? JSON.parse(raw) : [];
            if (!profiles.find(p => p.id === DEFAULT_ID)) {
                // 首次使用：自動建立預設班級
                profiles.unshift({
                    id: DEFAULT_ID,
                    name: DEFAULT_NAME,
                    createdAt: new Date().toISOString(),
                    isDefault: true,
                });
                localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
            }
            return profiles;
        } catch (e) {
            return [{ id: DEFAULT_ID, name: DEFAULT_NAME, createdAt: new Date().toISOString(), isDefault: true }];
        }
    }

    /** 儲存班級清單 */
    function saveProfiles(profiles) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    }

    /** 讀取目前班級 ID */
    function getCurrentId() {
        return localStorage.getItem(CURRENT_KEY) || DEFAULT_ID;
    }

    /** 設定目前班級 ID */
    function setCurrentId(id) {
        localStorage.setItem(CURRENT_KEY, id);
    }

    // ==================== Firebase 同步前處理 ====================

    /** 在切換前，嘗試將目前資料同步到 Firebase */
    async function syncBeforeSwitch() {
        try {
            if (window.FirebaseConfig?.isConnected?.() && window.FirebaseSync?.syncToCloud) {
                const { syncToCloud } = window.FirebaseSync;
                await syncToCloud();
                console.log('[ClassProfiles] 切換前同步完成');
            }
        } catch (e) {
            console.warn('[ClassProfiles] 切換前同步失敗（繼續切換）:', e);
        }
    }

    /** 刪除指定 IDB */
    function deleteIdb(id) {
        return new Promise((resolve) => {
            if (id === DEFAULT_ID) { resolve(); return; } // 不刪預設班級 IDB
            const dbName = getDbName(id);
            const req = indexedDB.deleteDatabase(dbName);
            req.onsuccess = () => {
                console.log(`[ClassProfiles] 已刪除 IDB: ${dbName}`);
                resolve();
            };
            req.onerror = () => { console.warn(`刪除 IDB ${dbName} 失敗`); resolve(); };
            req.onblocked = () => { console.warn(`IDB ${dbName} 被鎖定，稍後可能殘留`); resolve(); };
        });
    }

    // ==================== 路徑計算 ====================

    function getDbName(id) {
        return id === DEFAULT_ID ? 'ClassManagerDB' : `ClassManagerDB-${id}`;
    }

    function getFirebasePath(id) {
        return id === DEFAULT_ID ? '' : id;  // '' 代表使用原有路徑
    }

    // ==================== CSS 注入 ====================

    function injectCSS() {
        if (document.getElementById('class-profiles-style')) return;
        const style = document.createElement('style');
        style.id = 'class-profiles-style';
        style.textContent = `
/* 班級選擇器按鈕 */
#class-selector-btn {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.42rem 0.85rem;
    background: linear-gradient(135deg, #6366f1 0%, #818cf8 100%);
    border: none;
    border-radius: 50px;
    cursor: pointer;
    font-size: 0.82rem;
    font-weight: 700;
    color: #fff;
    transition: opacity 0.2s, box-shadow 0.2s;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(99,102,241,0.35);
    max-width: 130px;
}
#class-selector-btn:hover { opacity: 0.9; box-shadow: 0 4px 12px rgba(99,102,241,0.45); }
#class-selector-btn .cs-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 80px;
}

/* 下拉選單外層 */
#class-selector-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
}
#class-selector-dropdown {
    display: none;
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    left: auto;
    min-width: 210px;
    background: #fff;
    border-radius: 14px;
    box-shadow: 0 8px 32px rgba(0,0,0,.18);
    overflow: hidden;
    z-index: 9998;
    animation: csFadeIn .18s ease;
}
@keyframes csFadeIn { from { opacity:0; transform:translateY(-6px);} to { opacity:1; transform:translateY(0);} }
#class-selector-dropdown.open { display: block; }

/* 選單標題 */
#class-selector-dropdown .cs-header {
    padding: 0.7rem 1rem 0.5rem;
    background: linear-gradient(135deg, #6366f1 0%, #818cf8 100%);
    color: #fff;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
}

/* 班級項目 */
.cs-class-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.65rem 1rem;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.88rem;
    color: #374151;
    transition: background 0.15s;
    text-align: left;
    gap: 0.5rem;
}
.cs-class-item:hover { background: #f5f5ff; }
.cs-class-item.active { background: #eef2ff; color: #4338ca; font-weight: 700; }
.cs-class-item .cs-check { font-size: 0.75rem; color: #6366f1; }
.cs-divider { height: 1px; background: #f0f0f0; margin: 0; }
.cs-action-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.65rem 1rem;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
    color: #374151;
    transition: background 0.15s;
    text-align: left;
}
.cs-action-btn:hover { background: #f5f5ff; }
.cs-action-btn.danger { color: #ef4444; }
.cs-action-btn.danger:hover { background: #fef2f2; }

/* 班級輸入 Modal */
#cs-input-modal {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.55);
    z-index: 10001;
    align-items: center;
    justify-content: center;
}
#cs-input-modal.open { display: flex; }
#cs-input-box {
    background: #fff;
    border-radius: 18px;
    padding: 1.75rem;
    max-width: 360px;
    width: 90%;
    box-shadow: 0 20px 60px rgba(0,0,0,.25);
    animation: csFadeIn .2s ease;
}
#cs-input-box h3 {
    font-size: 1rem;
    font-weight: 700;
    color: #1f2937;
    margin-bottom: 0.35rem;
}
#cs-input-box p {
    font-size: 0.82rem;
    color: #6b7280;
    margin-bottom: 1rem;
}
#cs-class-name-input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.6rem 0.9rem;
    border: 1.5px solid #d1d5db;
    border-radius: 8px;
    font-size: 0.95rem;
    outline: none;
    transition: border-color 0.2s;
    margin-bottom: 0.9rem;
}
#cs-class-name-input:focus { border-color: #6366f1; }
.cs-modal-btns { display: flex; gap: 0.5rem; justify-content: flex-end; }
.cs-modal-btns button {
    padding: 0.55rem 1.25rem;
    border-radius: 8px;
    border: none;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
}
.cs-modal-btns button:hover { opacity: 0.88; }
.cs-btn-confirm { background: #6366f1; color: #fff; }
.cs-btn-cancel  { background: #f3f4f6; color: #374151; }

/* 切換中 Overlay */
#cs-switch-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(255,255,255,0.9);
    z-index: 19999;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    font-size: 1.1rem;
    font-weight: 700;
    color: #4338ca;
}
#cs-switch-overlay.show { display: flex; }
.cs-switch-spinner {
    width: 40px; height: 40px;
    border: 4px solid #e0e7ff;
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: csSpin 0.8s linear infinite;
}
@keyframes csSpin { to { transform: rotate(360deg); } }
        `;
        document.head.appendChild(style);
    }

    // ==================== HTML 注入 ====================

    function renderDropdown() {
        const profiles = loadProfiles();
        const curId = getCurrentId();

        const items = profiles.map(p => `
            <button class="cs-class-item ${p.id === curId ? 'active' : ''}"
                    onclick="ClassProfiles.switchTo('${p.id}')">
                <span>📚 ${_esc(p.name)}</span>
                ${p.id === curId ? '<span class="cs-check">✓</span>' : ''}
            </button>
        `).join('');

        const curProfile = profiles.find(p => p.id === curId);
        const canDelete = curId !== DEFAULT_ID;

        return `
            <div class="cs-header">📚 班級切換</div>
            ${items}
            <div class="cs-divider"></div>
            <button class="cs-action-btn" onclick="ClassProfiles._uiAdd()">➕ 新增班級</button>
            <button class="cs-action-btn" onclick="ClassProfiles._uiRename()">✏️ 重新命名目前班級</button>
            ${canDelete ? `<button class="cs-action-btn danger" onclick="ClassProfiles._uiDelete()">🗑️ 刪除「${_esc(curProfile?.name || '')}」</button>` : ''}
        `;
    }

    function injectUI() {
        // 桌面版：注入到 auth-nav-slot 左側的佔位 div
        const desktopTarget = document.getElementById('class-selector-slot');
        if (desktopTarget) {
            desktopTarget.innerHTML = `
                <div id="class-selector-wrap">
                    <button id="class-selector-btn" onclick="ClassProfiles.toggleDropdown()">
                        <span>📚</span>
                        <span class="cs-name" id="cs-current-name">${_esc(_getCurrentName())}</span>
                        <span>▾</span>
                    </button>
                    <div id="class-selector-dropdown">
                        ${renderDropdown()}
                    </div>
                </div>
            `;
        }

        // 手機版：注入到 class-selector-slot-mobile
        const mobileTarget = document.getElementById('class-selector-slot-mobile');
        if (mobileTarget) {
            mobileTarget.innerHTML = `
                <button id="class-selector-btn-mobile" onclick="ClassProfiles.toggleDropdown()"
                    title="${_esc(_getCurrentName())}"
                    style="
                        display:flex;align-items:center;gap:3px;
                        padding:5px 8px;background:linear-gradient(135deg,#6366f1,#818cf8);
                        border:none;border-radius:50px;cursor:pointer;font-size:0.75rem;
                        font-weight:700;color:#fff;box-shadow:0 2px 8px rgba(99,102,241,0.35);
                    ">
                    📚
                </button>
            `;
        }

        // 切換 Overlay
        if (!document.getElementById('cs-switch-overlay')) {
            const ov = document.createElement('div');
            ov.id = 'cs-switch-overlay';
            ov.innerHTML = `
                <div class="cs-switch-spinner"></div>
                <div id="cs-switch-msg">切換班級中...</div>
            `;
            document.body.appendChild(ov);
        }

        // 輸入 Modal
        if (!document.getElementById('cs-input-modal')) {
            const modal = document.createElement('div');
            modal.id = 'cs-input-modal';
            modal.innerHTML = `
                <div id="cs-input-box">
                    <h3 id="cs-modal-title">新增班級</h3>
                    <p id="cs-modal-desc">輸入班級名稱（如「502班」）</p>
                    <input type="text" id="cs-class-name-input" placeholder="班級名稱" maxlength="20">
                    <div class="cs-modal-btns">
                        <button class="cs-btn-cancel" id="cs-modal-cancel">取消</button>
                        <button class="cs-btn-confirm" id="cs-modal-confirm">確認</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Enter 鍵觸發確認
            modal.querySelector('#cs-class-name-input').addEventListener('keydown', e => {
                if (e.key === 'Enter') document.getElementById('cs-modal-confirm')?.click();
            });
        }

        // 點外部關閉下拉
        document.addEventListener('click', e => {
            const wrap = document.getElementById('class-selector-wrap');
            if (wrap && !wrap.contains(e.target)) {
                document.getElementById('class-selector-dropdown')?.classList.remove('open');
            }
        });
    }

    function _getCurrentName() {
        const profiles = loadProfiles();
        const curId = getCurrentId();
        return profiles.find(p => p.id === curId)?.name || DEFAULT_NAME;
    }

    function _esc(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ==================== 輸入 Modal 核心 ====================

    function showInputModal(title, desc, defaultVal = '') {
        return new Promise((resolve) => {
            const modal = document.getElementById('cs-input-modal');
            document.getElementById('cs-modal-title').textContent = title;
            document.getElementById('cs-modal-desc').textContent = desc;
            const input = document.getElementById('cs-class-name-input');
            input.value = defaultVal;
            modal.classList.add('open');
            setTimeout(() => input.focus(), 100);

            const confirm = document.getElementById('cs-modal-confirm');
            const cancel = document.getElementById('cs-modal-cancel');

            const onConfirm = () => {
                cleanup();
                resolve(input.value.trim());
            };
            const onCancel = () => {
                cleanup();
                resolve(null);
            };
            const onOverlay = e => {
                if (e.target === modal) { cleanup(); resolve(null); }
            };

            function cleanup() {
                modal.classList.remove('open');
                confirm.removeEventListener('click', onConfirm);
                cancel.removeEventListener('click', onCancel);
                modal.removeEventListener('click', onOverlay);
            }

            confirm.addEventListener('click', onConfirm);
            cancel.addEventListener('click', onCancel);
            modal.addEventListener('click', onOverlay);
        });
    }

    // ==================== 公開 API ====================

    const ClassProfiles = {
        list: loadProfiles,
        current: getCurrentId,
        currentProfile: () => loadProfiles().find(p => p.id === getCurrentId()),
        getDbName,
        getFirebasePath: () => getFirebasePath(getCurrentId()),

        toggleDropdown() {
            const dd = document.getElementById('class-selector-dropdown');
            if (!dd) return;
            const isOpen = dd.classList.contains('open');
            if (!isOpen) {
                // 更新選單內容
                dd.innerHTML = renderDropdown();
            }
            dd.classList.toggle('open');
        },

        /** 切換班級（核心） */
        async switchTo(id) {
            const curId = getCurrentId();
            if (id === curId) {
                document.getElementById('class-selector-dropdown')?.classList.remove('open');
                return;
            }

            // 顯示切換 Overlay
            const ov = document.getElementById('cs-switch-overlay');
            const msg = document.getElementById('cs-switch-msg');
            const targetName = loadProfiles().find(p => p.id === id)?.name || id;
            if (msg) msg.textContent = `正在切換至「${targetName}」...`;
            if (ov) ov.classList.add('show');

            // 先同步目前班級資料
            await syncBeforeSwitch();

            // 切換
            setCurrentId(id);
            console.log(`[ClassProfiles] 切換至班級 ID: ${id}`);

            // Reload
            location.reload();
        },

        /** 新增班級 */
        async add(name) {
            const profiles = loadProfiles();
            const id = String(Date.now());
            profiles.push({ id, name, createdAt: new Date().toISOString(), isDefault: false });
            saveProfiles(profiles);
            console.log(`[ClassProfiles] 新增班級: ${name} (${id})`);
            return id;
        },

        /** 重新命名班級 */
        rename(id, name) {
            const profiles = loadProfiles();
            const p = profiles.find(x => x.id === id);
            if (p) {
                p.name = name;
                saveProfiles(profiles);
                // 更新目前顯示的名稱
                const el = document.getElementById('cs-current-name');
                if (id === getCurrentId() && el) el.textContent = name;
                const dd = document.getElementById('class-selector-dropdown');
                if (dd) dd.innerHTML = renderDropdown();
            }
        },

        /** 刪除班級（不可刪 default） */
        async delete(id) {
            if (id === DEFAULT_ID) {
                console.warn('[ClassProfiles] 不能刪除預設班級');
                return false;
            }
            const profiles = loadProfiles();
            const idx = profiles.findIndex(p => p.id === id);
            if (idx === -1) return false;

            await deleteIdb(id);

            profiles.splice(idx, 1);
            saveProfiles(profiles);

            // 若刪的是目前班級，切換回 default
            if (getCurrentId() === id) {
                setCurrentId(DEFAULT_ID);
            }
            return true;
        },

        // ─── UI 操作（供 onclick 呼叫） ────────────────────────

        async _uiAdd() {
            document.getElementById('class-selector-dropdown')?.classList.remove('open');
            const name = await showInputModal(
                '➕ 新增班級',
                '輸入新班級名稱（如「502班」、「英文B組」）'
            );
            if (!name) return;

            const id = await this.add(name);

            // 顯示切換 Overlay 並切換到新班級
            const ov = document.getElementById('cs-switch-overlay');
            const msg = document.getElementById('cs-switch-msg');
            if (msg) msg.textContent = `正在切換至新班級「${name}」...`;
            if (ov) ov.classList.add('show');

            await syncBeforeSwitch();
            setCurrentId(id);
            location.reload();
        },

        async _uiRename() {
            document.getElementById('class-selector-dropdown')?.classList.remove('open');
            const curProfile = this.currentProfile();
            if (!curProfile) return;

            const name = await showInputModal(
                '✏️ 重新命名班級',
                '修改目前班級的名稱',
                curProfile.name
            );
            if (!name || name === curProfile.name) return;
            this.rename(curProfile.id, name);

            // 更新 tab title
            const btn = document.getElementById('class-selector-btn');
            if (btn) {
                const el = btn.querySelector('.cs-name');
                if (el) el.textContent = name;
            }
            NotificationSystem?.success?.(`班級已重新命名為「${name}」`);
        },

        async _uiDelete() {
            document.getElementById('class-selector-dropdown')?.classList.remove('open');
            const curProfile = this.currentProfile();
            if (!curProfile || curProfile.id === DEFAULT_ID) return;

            // 使用 gauth-modal（若已載入）或 confirm
            let confirmed = false;
            if (typeof window.GoogleAuthUI !== 'undefined') {
                // 使用 gauth showModal（需要存取 private function，改用 window.confirm 作備援）
                confirmed = window.confirm(
                    `⚠️ 確定要刪除「${curProfile.name}」？\n\n這將清除該班級的所有本地資料，此操作無法復原。\n\n（雲端資料若已登入同步則需手動清除）`
                );
            } else {
                confirmed = window.confirm(`確定要刪除「${curProfile.name}」？此操作無法復原。`);
            }
            if (!confirmed) return;

            const ov = document.getElementById('cs-switch-overlay');
            const msg = document.getElementById('cs-switch-msg');
            if (msg) msg.textContent = `正在刪除「${curProfile.name}」並切回預設班級...`;
            if (ov) ov.classList.add('show');

            await this.delete(curProfile.id);
            setCurrentId(DEFAULT_ID);
            location.reload();
        },
    };

    // 全域掛載
    window.ClassProfiles = ClassProfiles;

    // ==================== 初始化 ====================

    function init() {
        // 確保 default profile 存在
        loadProfiles();
        injectCSS();
        injectUI();
        console.log(`✅ [ClassProfiles] 班級管理模組已載入，目前班級: "${_getCurrentName()}" (${getCurrentId()})`);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
