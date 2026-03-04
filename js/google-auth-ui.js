/**
 * Google 帳號登入 UI 模組 v1.0
 * 自我注入 CSS + HTML，完整帳號管理介面
 */

(function () {
    'use strict';

    // ────────────────────────────────────────────────────────
    // CSS 注入
    // ────────────────────────────────────────────────────────
    function injectCSS() {
        if (document.getElementById('gauth-style')) return;
        const style = document.createElement('style');
        style.id = 'gauth-style';
        style.textContent = `
/* Google Auth 登入按鈕 */
#gauth-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 1rem;
    background: #fff;
    border: 1.5px solid #dadce0;
    border-radius: 50px;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    color: #3c4043;
    transition: background 0.2s, box-shadow 0.2s;
    white-space: nowrap;
    box-shadow: 0 1px 3px rgba(0,0,0,.08);
}
#gauth-btn:hover { background: #f8f9fa; box-shadow: 0 2px 6px rgba(0,0,0,.12); }
#gauth-btn img { width: 18px; height: 18px; }

/* 已登入：頭像容器 */
#gauth-avatar-wrap {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
}
#gauth-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 2px solid #6366f1;
    object-fit: cover;
    transition: box-shadow 0.2s;
}
#gauth-avatar:hover { box-shadow: 0 0 0 3px rgba(99,102,241,0.3); }
#gauth-avatar-initial {
    width: 36px; height: 36px; border-radius: 50%;
    background: linear-gradient(135deg,#6366f1,#818cf8);
    color: #fff; font-weight: 700; font-size: 1rem;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid #6366f1;
    cursor: pointer;
    transition: box-shadow 0.2s;
}
#gauth-avatar-initial:hover { box-shadow: 0 0 0 3px rgba(99,102,241,0.3); }
#gauth-name-label {
    font-size: 0.82rem; font-weight: 600; color: #374151;
    max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* 下拉選單 */
#gauth-dropdown {
    display: none;
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    min-width: 230px;
    background: #fff;
    border-radius: 14px;
    box-shadow: 0 8px 32px rgba(0,0,0,.18);
    overflow: hidden;
    z-index: 9999;
    animation: gauthFadeIn .18s ease;
}
@keyframes gauthFadeIn { from { opacity:0; transform:translateY(-6px);} to { opacity:1; transform:translateY(0);} }
#gauth-dropdown.open { display: block; }

.gauth-dd-header {
    padding: 0.9rem 1rem 0.7rem;
    background: linear-gradient(135deg,#6366f1 0%,#818cf8 100%);
    color: #fff;
}
.gauth-dd-header .gauth-dd-name { font-weight: 700; font-size: 0.95rem; }
.gauth-dd-header .gauth-dd-email { font-size: 0.75rem; opacity: .8; margin-top: 1px; }
.gauth-dd-header .gauth-dd-sync-time {
    font-size: 0.72rem; opacity: .65; margin-top: 5px;
}
.gauth-dd-divider { height: 1px; background: #f0f0f0; margin: 0; }
.gauth-dd-item {
    display: flex; align-items: center; gap: 0.6rem;
    width: 100%; padding: 0.7rem 1rem;
    background: none; border: none; cursor: pointer;
    font-size: 0.88rem; color: #374151;
    transition: background 0.15s;
    text-align: left;
}
.gauth-dd-item:hover { background: #f5f5ff; }
.gauth-dd-item.danger { color: #ef4444; }
.gauth-dd-item.danger:hover { background: #fef2f2; }

/* 同步中圓形動畫 */
#gauth-sync-spinner {
    display: none;
    width: 16px; height: 16px;
    border: 2px solid #6366f1;
    border-top-color: transparent;
    border-radius: 50%;
    animation: gauthSpin .8s linear infinite;
}
@keyframes gauthSpin { to { transform: rotate(360deg); } }

/* 首次登入 Modal */
#gauth-modal-overlay {
    display: none;
    position: fixed; inset: 0;
    background: rgba(0,0,0,.55);
    z-index: 10000;
    align-items: center; justify-content: center;
}
#gauth-modal-overlay.open { display: flex; }
#gauth-modal {
    background: #fff;
    border-radius: 20px;
    padding: 2rem;
    max-width: 400px; width: 90%;
    box-shadow: 0 20px 60px rgba(0,0,0,.3);
    animation: gauthFadeIn .2s ease;
}
#gauth-modal h3 { font-size: 1.1rem; font-weight: 700; color: #1f2937; margin-bottom: .5rem; }
#gauth-modal p  { font-size: .88rem; color: #6b7280; margin-bottom: 1.25rem; }
.gauth-modal-btns { display: flex; flex-direction: column; gap: .5rem; }
.gauth-modal-btns button {
    padding: .65rem 1rem; border-radius: 10px; border: none;
    font-size: .9rem; font-weight: 600; cursor: pointer;
    transition: opacity .2s;
}
.gauth-modal-btns button:hover { opacity: .88; }
.gauth-btn-primary    { background: #6366f1; color: #fff; }
.gauth-btn-secondary  { background: #f3f4f6; color: #374151; }
.gauth-btn-accent     { background: #10b981; color: #fff; }
.gauth-btn-danger     { background: #ef4444; color: #fff; }
        `;
        document.head.appendChild(style);
    }

    // ────────────────────────────────────────────────────────
    // 工具函式
    // ────────────────────────────────────────────────────────
    function lastSyncText() {
        const t = localStorage.getItem('lastSyncTime');
        if (!t) return '從未同步';
        const diff = Math.round((Date.now() - new Date(t).getTime()) / 60000);
        if (diff < 1) return '剛剛';
        if (diff < 60) return `${diff} 分鐘前`;
        return `${Math.floor(diff / 60)} 小時前`;
    }

    function hasLocalData() {
        try {
            const s = JSON.parse(localStorage.getItem(window.STUDENTS_KEY || 'students') || '[]');
            return s.length > 0;
        } catch { return false; }
    }

    // ────────────────────────────────────────────────────────
    // HTML 注入（注入到 nav 右側佔位元素，桌面+手機版同步）
    // ────────────────────────────────────────────────────────
    // 共用的登入按鈕 HTML（桌面版）
    const DESKTOP_SLOT_HTML = `
            <!-- 未登入 -->
            <button id="gauth-btn" onclick="GoogleAuthUI.login()" title="使用 Google 帳號登入，讓資料同步到雲端">
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G">
                <span>Google 登入</span>
            </button>

            <!-- 已登入（預設隱藏） -->
            <div id="gauth-avatar-wrap" style="display:none;">
                <div id="gauth-avatar-initial" onclick="GoogleAuthUI.toggleDropdown()"></div>
                <img id="gauth-avatar-img" src="" alt="頭像"
                     style="display:none; width:36px;height:36px;border-radius:50%;border:2px solid #6366f1;object-fit:cover;cursor:pointer;"
                     onclick="GoogleAuthUI.toggleDropdown()">
                <span id="gauth-name-label"></span>
                <span id="gauth-sync-spinner"></span>

                <!-- 下拉選單 -->
                <div id="gauth-dropdown">
                    <div class="gauth-dd-header">
                        <div class="gauth-dd-name"  id="gauth-dd-name"></div>
                        <div class="gauth-dd-email" id="gauth-dd-email"></div>
                        <div class="gauth-dd-sync-time">🕒 上次同步：<span id="gauth-dd-sync"></span></div>
                    </div>
                    <button class="gauth-dd-item" onclick="GoogleAuthUI.syncUp()">
                        ☁️ 立即同步（本地 → 雲端）
                    </button>
                    <button class="gauth-dd-item" onclick="window.FirebaseSync?.syncAllClassesToCloud()" style="color:#7c3aed;font-weight:600">
                        🚀 全班一鍵上傳
                    </button>
                    <button class="gauth-dd-item" onclick="GoogleAuthUI.syncDown()">
                        📥 從雲端還原（雲端 → 本地）
                    </button>
                    <div class="gauth-dd-divider"></div>
                    <button class="gauth-dd-item danger" onclick="GoogleAuthUI.logout()">
                        🚪 登出
                    </button>
                </div>
            </div>
    `;

    // 手機版：只有圖示按鈕（緊湊），下拉選單掛在此處
    const MOBILE_SLOT_HTML = `
            <!-- 手機未登入 -->
            <button id="gauth-btn-mobile" onclick="GoogleAuthUI.login()" title="登入" style="
                display:flex; align-items:center; gap:4px;
                padding:6px 10px; background:#fff; border:1.5px solid #dadce0;
                border-radius:50px; cursor:pointer; font-size:0.78rem; font-weight:600;
                color:#3c4043; white-space:nowrap; box-shadow:0 1px 3px rgba(0,0,0,.08);
            ">
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" style="width:16px;height:16px;">
                <span>登入</span>
            </button>

            <!-- 手機已登入：只顯示頭像 -->
            <div id="gauth-avatar-wrap-mobile" style="display:none; position:relative;">
                <div id="gauth-avatar-initial-mobile"
                     onclick="GoogleAuthUI.toggleDropdownMobile()"
                     style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#818cf8);
                            color:#fff;font-weight:700;font-size:0.85rem;display:flex;align-items:center;
                            justify-content:center;border:2px solid #6366f1;cursor:pointer;
                            transition:box-shadow 0.2s;">
                </div>
                <img id="gauth-avatar-img-mobile" src="" alt="頭像"
                     style="display:none;width:32px;height:32px;border-radius:50%;border:2px solid #6366f1;
                            object-fit:cover;cursor:pointer;"
                     onclick="GoogleAuthUI.toggleDropdownMobile()">
                <span id="gauth-sync-spinner-mobile" style="display:none;width:14px;height:14px;
                    border:2px solid #6366f1;border-top-color:transparent;border-radius:50%;
                    animation:gauthSpin .8s linear infinite;"></span>

                <!-- 手機版下拉選單 -->
                <div id="gauth-dropdown-mobile" style="
                    display:none; position:absolute; top:calc(100% + 8px); right:0;
                    min-width:210px; background:#fff; border-radius:14px;
                    box-shadow:0 8px 32px rgba(0,0,0,.18); overflow:hidden;
                    z-index:9999; animation:gauthFadeIn .18s ease;
                ">
                    <div class="gauth-dd-header" id="gauth-dd-header-mobile">
                        <div class="gauth-dd-name"  id="gauth-dd-name-mobile"></div>
                        <div class="gauth-dd-email" id="gauth-dd-email-mobile"></div>
                        <div class="gauth-dd-sync-time">🕒 上次同步：<span id="gauth-dd-sync-mobile"></span></div>
                    </div>
                    <button class="gauth-dd-item" onclick="GoogleAuthUI.syncUp()">
                        ☁️ 立即同步
                    </button>
                    <button class="gauth-dd-item" onclick="window.FirebaseSync?.syncAllClassesToCloud()" style="color:#7c3aed;font-weight:600">
                        🚀 全班上傳
                    </button>
                    <button class="gauth-dd-item" onclick="GoogleAuthUI.syncDown()">
                        📥 從雲端還原
                    </button>
                    <div class="gauth-dd-divider"></div>
                    <button class="gauth-dd-item danger" onclick="GoogleAuthUI.logout()">
                        🚪 登出
                    </button>
                </div>
            </div>
    `;

    function injectHTML() {
        // 桌面版 slot
        const slot = document.getElementById('auth-nav-slot');
        if (slot) slot.innerHTML = DESKTOP_SLOT_HTML;

        // 手機版 slot
        const mobileSlot = document.getElementById('auth-nav-slot-mobile');
        if (mobileSlot) mobileSlot.innerHTML = MOBILE_SLOT_HTML;

        // 點擊外部關閉桌面下拉
        document.addEventListener('click', (e) => {
            const wrap = document.getElementById('gauth-avatar-wrap');
            if (wrap && !wrap.contains(e.target)) {
                const dd = document.getElementById('gauth-dropdown');
                if (dd) dd.classList.remove('open');
            }
            // 關閉手機版下拉
            const mwrap = document.getElementById('gauth-avatar-wrap-mobile');
            if (mwrap && !mwrap.contains(e.target)) {
                const mdd = document.getElementById('gauth-dropdown-mobile');
                if (mdd) mdd.style.display = 'none';
            }
        });
    }

    // ────────────────────────────────────────────────────────
    // Modal 對話框（不用 alert/confirm）
    // ────────────────────────────────────────────────────────
    function injectModal() {
        if (document.getElementById('gauth-modal-overlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'gauth-modal-overlay';
        overlay.innerHTML = `
            <div id="gauth-modal">
                <h3 id="gauth-modal-title"></h3>
                <p  id="gauth-modal-desc"></p>
                <div class="gauth-modal-btns" id="gauth-modal-btns"></div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    function showModal(title, desc, buttons) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('gauth-modal-overlay');
            document.getElementById('gauth-modal-title').textContent = title;
            document.getElementById('gauth-modal-desc').textContent = desc;
            const btnsEl = document.getElementById('gauth-modal-btns');
            btnsEl.innerHTML = '';
            buttons.forEach(({ label, cls, value }) => {
                const btn = document.createElement('button');
                btn.textContent = label;
                btn.className = cls;
                btn.onclick = () => {
                    overlay.classList.remove('open');
                    resolve(value);
                };
                btnsEl.appendChild(btn);
            });
            overlay.classList.add('open');
        });
    }

    // ────────────────────────────────────────────────────────
    // UI 狀態更新（同步更新桌面版與手機版）
    // ────────────────────────────────────────────────────────
    function showLoggedIn(profile) {
        const firstChar = (profile.displayName || '老')[0].toUpperCase();

        // === 桌面版 ===
        const loginBtn = document.getElementById('gauth-btn');
        const avatarWrap = document.getElementById('gauth-avatar-wrap');
        if (loginBtn) loginBtn.style.display = 'none';
        if (avatarWrap) {
            avatarWrap.style.display = 'flex';
            const initial = document.getElementById('gauth-avatar-initial');
            const photo = document.getElementById('gauth-avatar-img');
            if (profile.photoURL) {
                if (photo) { photo.src = profile.photoURL; photo.style.display = 'block'; }
                if (initial) initial.style.display = 'none';
            } else {
                if (initial) { initial.textContent = firstChar; initial.style.display = 'flex'; }
                if (photo) photo.style.display = 'none';
            }
            const nameParts = (profile.displayName || '老師').split(' ');
            const nameLabel = document.getElementById('gauth-name-label');
            if (nameLabel) nameLabel.textContent = nameParts[0];
        }

        // === 手機版 ===
        const loginBtnM = document.getElementById('gauth-btn-mobile');
        const avatarWrapM = document.getElementById('gauth-avatar-wrap-mobile');
        if (loginBtnM) loginBtnM.style.display = 'none';
        if (avatarWrapM) {
            avatarWrapM.style.display = 'flex';
            const initialM = document.getElementById('gauth-avatar-initial-mobile');
            const photoM = document.getElementById('gauth-avatar-img-mobile');
            if (profile.photoURL) {
                if (photoM) { photoM.src = profile.photoURL; photoM.style.display = 'block'; }
                if (initialM) initialM.style.display = 'none';
            } else {
                if (initialM) { initialM.textContent = firstChar; initialM.style.display = 'flex'; }
                if (photoM) photoM.style.display = 'none';
            }
        }

        // Dropdown header（桌面 + 手機共用名稱/信箱）
        const ddName = document.getElementById('gauth-dd-name');
        const ddEmail = document.getElementById('gauth-dd-email');
        if (ddName) ddName.textContent = profile.displayName || '老師';
        if (ddEmail) ddEmail.textContent = profile.email || '';

        const ddNameM = document.getElementById('gauth-dd-name-mobile');
        const ddEmailM = document.getElementById('gauth-dd-email-mobile');
        if (ddNameM) ddNameM.textContent = profile.displayName || '老師';
        if (ddEmailM) ddEmailM.textContent = profile.email || '';

        refreshSyncTime();
    }

    // 登入按鈕的原始 HTML（共用常數，避免重複字串）
    const LOGIN_BTN_HTML = `<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G"><span>Google 登入</span>`;
    const LOGIN_BTN_MOBILE_HTML = `<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" style="width:16px;height:16px;"><span>登入</span>`;

    function showLoggedOut() {
        // 桌面版
        const loginBtn = document.getElementById('gauth-btn');
        const avatarWrap = document.getElementById('gauth-avatar-wrap');
        const dd = document.getElementById('gauth-dropdown');
        if (dd) dd.classList.remove('open');
        if (avatarWrap) avatarWrap.style.display = 'none';
        if (loginBtn) {
            loginBtn.innerHTML = LOGIN_BTN_HTML;
            loginBtn.disabled = false;
            loginBtn.style.display = 'flex';
        }

        // 手機版
        const loginBtnM = document.getElementById('gauth-btn-mobile');
        const avatarWrapM = document.getElementById('gauth-avatar-wrap-mobile');
        const ddM = document.getElementById('gauth-dropdown-mobile');
        if (ddM) ddM.style.display = 'none';
        if (avatarWrapM) avatarWrapM.style.display = 'none';
        if (loginBtnM) {
            loginBtnM.innerHTML = LOGIN_BTN_MOBILE_HTML;
            loginBtnM.disabled = false;
            loginBtnM.style.display = 'flex';
        }
    }

    function refreshSyncTime() {
        const el = document.getElementById('gauth-dd-sync');
        if (el) el.textContent = lastSyncText();
        const elM = document.getElementById('gauth-dd-sync-mobile');
        if (elM) elM.textContent = lastSyncText();
    }

    function setSyncing(on) {
        const spinner = document.getElementById('gauth-sync-spinner');
        if (spinner) spinner.style.display = on ? 'block' : 'none';
        const spinnerM = document.getElementById('gauth-sync-spinner-mobile');
        if (spinnerM) spinnerM.style.display = on ? 'inline-block' : 'none';
    }

    // ────────────────────────────────────────────────────────
    // 首次登入流程
    // ────────────────────────────────────────────────────────
    async function handleFirstTimeLogin() {
        // 檢查雲端是否有資料
        let cloudHasData = false;
        try {
            const db = window.FirebaseConfig.getDb();
            const uid = window.FirebaseConfig.getCurrentUserId();
            const snap = await db.collection('users').doc(uid).collection('students').limit(1).get();
            cloudHasData = !snap.empty;
        } catch (e) { /* 無法取得則視為空 */ }

        const localHasData = hasLocalData();

        if (!cloudHasData && !localHasData) {
            // 兩邊都沒有資料：直接進入
            NotificationSystem && NotificationSystem.success('歡迎！帳號已就緒 ☁️');
            return;
        }

        if (!cloudHasData && localHasData) {
            // 只有本地資料：詢問是否上傳
            const choice = await showModal(
                '🎉 首次登入成功！',
                '偵測到本地已有班級資料。是否將資料上傳到你的 Google 帳號？ 下次在任何裝置登入都能存取！',
                [
                    { label: '☁️ 上傳到雲端', cls: 'gauth-btn-primary', value: 'upload' },
                    { label: '稍後再說', cls: 'gauth-btn-secondary', value: 'skip' },
                ]
            );
            if (choice === 'upload') {
                setSyncing(true);
                await window.FirebaseSync.syncToCloud();
                setSyncing(false);
                refreshSyncTime();
            }
            return;
        }

        if (cloudHasData && !localHasData) {
            // 只有雲端資料：自動下載
            setSyncing(true);
            await window.FirebaseSync.loadFromCloud();
            setSyncing(false);
            refreshSyncTime();
            NotificationSystem && NotificationSystem.success('已從雲端載入你的資料 📥');
            return;
        }

        // 兩邊都有資料：三選一
        const choice = await showModal(
            '⚠️ 偵測到雲端與本地都有資料',
            '請選擇要使用哪份資料？（合併：學生名單取聯集、加分記錄全保留）',
            [
                { label: '📥 使用雲端資料（覆蓋本地）', cls: 'gauth-btn-primary', value: 'cloud' },
                { label: '☁️ 上傳本地資料（覆蓋雲端）', cls: 'gauth-btn-accent', value: 'local' },
                { label: '🔀 合併兩份資料', cls: 'gauth-btn-secondary', value: 'merge' },
            ]
        );
        setSyncing(true);
        if (choice === 'cloud') await window.FirebaseSync.loadFromCloud();
        else if (choice === 'local') await window.FirebaseSync.syncToCloud();
        else if (choice === 'merge') await window.FirebaseSync.mergeWithCloud();
        setSyncing(false);
        refreshSyncTime();
    }

    // ────────────────────────────────────────────────────────
    // 公開 API
    // ────────────────────────────────────────────────────────
    window.GoogleAuthUI = {

        async login() {
            // 桌面版按鈕顯示「登入中...」
            const loginBtn = document.getElementById('gauth-btn');
            const loginBtnM = document.getElementById('gauth-btn-mobile');
            if (loginBtn) {
                loginBtn.innerHTML = '<span style="font-size:.8rem;">登入中...</span>';
                loginBtn.disabled = true;
            }
            if (loginBtnM) {
                loginBtnM.innerHTML = '<span style="font-size:.75rem;">登入中...</span>';
                loginBtnM.disabled = true;
            }

            const profile = await window.FirebaseConfig.signInWithGoogle();

            // 無論成功或取消，先還原按鈕（避免「登入中...」卡住）
            if (loginBtn) {
                loginBtn.innerHTML = LOGIN_BTN_HTML;
                loginBtn.disabled = false;
            }
            if (loginBtnM) {
                loginBtnM.innerHTML = LOGIN_BTN_MOBILE_HTML;
                loginBtnM.disabled = false;
            }

            if (!profile) return; // 使用者取消

            showLoggedIn(profile);

            // 首次登入：確認是否曾同步
            const everSynced = localStorage.getItem('lastSyncTime');
            if (!everSynced) {
                await handleFirstTimeLogin();
            } else {
                NotificationSystem && NotificationSystem.success(`歡迎回來，${profile.displayName} ✨`);
            }
        },

        async logout() {
            const dd = document.getElementById('gauth-dropdown');
            if (dd) dd.classList.remove('open');
            const ddM = document.getElementById('gauth-dropdown-mobile');
            if (ddM) ddM.style.display = 'none';

            const confirmed = await showModal(
                '登出確認',
                '登出後本地資料不受影響，但雲端同步將暫停。確定要登出嗎？',
                [
                    { label: '🚪 確定登出', cls: 'gauth-btn-danger', value: true },
                    { label: '取消', cls: 'gauth-btn-secondary', value: false },
                ]
            );
            if (!confirmed) return;

            await window.FirebaseConfig.signOut();
            showLoggedOut();
            NotificationSystem && NotificationSystem.info('已登出');
        },

        toggleDropdown() {
            refreshSyncTime();
            const dd = document.getElementById('gauth-dropdown');
            if (dd) dd.classList.toggle('open');
        },

        toggleDropdownMobile() {
            refreshSyncTime();
            const dd = document.getElementById('gauth-dropdown-mobile');
            if (dd) dd.style.display = (dd.style.display === 'block') ? 'none' : 'block';
        },

        async syncUp() {
            // 關閉下拉選單
            const dd = document.getElementById('gauth-dropdown');
            if (dd) dd.classList.remove('open');
            const ddM = document.getElementById('gauth-dropdown-mobile');
            if (ddM) ddM.style.display = 'none';

            if (!window.FirebaseConfig.isConnected()) {
                NotificationSystem && NotificationSystem.warning('請先登入 Google 帳號');
                return;
            }
            // 呼叫新的詳細差異預覽 Modal
            const ok = await window.FirebaseSync.showSyncConfirmModal('upload');
            if (ok) {
                setSyncing(false);
                refreshSyncTime();
            }
        },

        async syncDown() {
            // 關閉下拉選單
            const dd = document.getElementById('gauth-dropdown');
            if (dd) dd.classList.remove('open');
            const ddM = document.getElementById('gauth-dropdown-mobile');
            if (ddM) ddM.style.display = 'none';

            if (!window.FirebaseConfig.isConnected()) {
                NotificationSystem && NotificationSystem.warning('請先登入 Google 帳號');
                return;
            }
            // 呼叫新的詳細差異預覽 Modal（還原方向）
            const ok = await window.FirebaseSync.showSyncConfirmModal('download');
            if (ok) {
                setSyncing(false);
                refreshSyncTime();
            }
        },
    };

    // ────────────────────────────────────────────────────────
    // 初始化
    // ────────────────────────────────────────────────────────
    function init() {
        injectCSS();
        injectModal();
        injectHTML();

        // 監聽 Auth 狀態，頁面刷新後自動恢復登入
        if (window.FirebaseConfig && typeof window.FirebaseConfig.onAuthStateChanged === 'function') {
            window.FirebaseConfig.onAuthStateChanged((user, profile) => {
                if (user && !user.isAnonymous && profile) {
                    showLoggedIn(profile);
                } else {
                    showLoggedOut();
                }
            });
        }

        // 每分鐘刷新「上次同步時間」
        setInterval(refreshSyncTime, 60000);

        console.log('✅ Google 帳號 UI 模組已載入');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 800));
    } else {
        setTimeout(init, 800);
    }

})();
