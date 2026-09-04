/**
 * Google 帳號登入 UI 模組 v1.0
 * 自我注入 CSS + HTML，完整帳號管理介面
 */

(function () {
    'use strict';

    // ────────────────────────────────────────────────────────
    // 🔐 管理員白名單（唯一真實來源）
    //    「班級健檢與修復」與「系統維運後台」兩個功能僅限此名單帳號使用。
    //    ⚠️ 前端只負責隱藏按鈕＋擋呼叫；維運後台的真正防線在 functions/index.js
    //       的 getAdminStats（同一份白名單），請兩邊一起維護。
    // ────────────────────────────────────────────────────────
    const ADMIN_EMAILS = ['ipad@mail2.smes.tyc.edu.tw'];

    function isAdminEmail(email) {
        return !!email && ADMIN_EMAILS.includes(String(email).toLowerCase().trim());
    }

    /** 以目前實際登入的 Firebase 帳號判斷是否為管理員（不依賴 UI 狀態，較難繞過） */
    function isCurrentUserAdmin() {
        try {
            const p = window.FirebaseConfig && window.FirebaseConfig.getCurrentProfile
                ? window.FirebaseConfig.getCurrentProfile()
                : null;
            return !!(p && !p.isAnonymous && isAdminEmail(p.email));
        } catch (e) {
            return false;
        }
    }

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

/* 登入提醒 Banner（首次使用者引導） */
#gauth-login-reminder {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(120%);
    z-index: 1000;
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s;
    max-width: 480px;
    width: calc(100% - 32px);
    opacity: 0;
}
#gauth-login-reminder.show {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
}
.gauth-reminder-card {
    background: linear-gradient(135deg, #f0f7ff 0%, #fff 50%, #f0fdf4 100%);
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.15), 0 0 0 1px rgba(99,102,241,0.1);
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.gauth-reminder-close {
    position: absolute;
    top: 8px;
    right: 12px;
    background: none;
    border: none;
    font-size: 1.1rem;
    cursor: pointer;
    color: #9ca3af;
    padding: 4px 6px;
    border-radius: 6px;
    transition: all 0.2s;
}
.gauth-reminder-close:hover { color: #6b7280; background: rgba(0,0,0,0.05); }
.gauth-reminder-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
}
.gauth-reminder-icon {
    font-size: 2rem;
    flex-shrink: 0;
    line-height: 1;
}
.gauth-reminder-title {
    font-weight: 700;
    font-size: 0.95rem;
    color: #1f2937;
    margin-bottom: 2px;
}
.gauth-reminder-desc {
    font-size: 0.82rem;
    color: #6b7280;
    line-height: 1.5;
}
.gauth-reminder-actions {
    display: flex;
    gap: 8px;
    align-items: center;
}
.gauth-reminder-login {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 9px 20px;
    background: #4285f4;
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.88rem;
    cursor: pointer;
    transition: background 0.2s;
    box-shadow: 0 2px 6px rgba(66,133,244,0.3);
}
.gauth-reminder-login:hover { background: #3367d6; }
.gauth-reminder-login:active { transform: scale(0.97); }
.gauth-reminder-dismiss {
    padding: 9px 16px;
    background: none;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    color: #6b7280;
    font-size: 0.82rem;
    cursor: pointer;
    transition: all 0.2s;
}
.gauth-reminder-dismiss:hover { background: #f3f4f6; border-color: #9ca3af; }
@media (max-width: 480px) {
    #gauth-login-reminder { bottom: 12px; }
    .gauth-reminder-card { padding: 16px; }
    .gauth-reminder-actions { flex-direction: column; }
    .gauth-reminder-login, .gauth-reminder-dismiss { width: 100%; justify-content: center; }
}

/* ───── 升級：底部 Banner 的好處小標籤 ───── */
.gauth-reminder-perks {
    list-style: none; margin: 4px 0 0; padding: 0;
    display: flex; flex-wrap: wrap; gap: 3px 12px;
}
.gauth-reminder-perks li {
    font-size: .74rem; color: #4b5563;
    display: flex; align-items: center; gap: 3px; white-space: nowrap;
}

/* ───── 訪客歡迎彈窗（兩段式第一段：置中 Modal）───── */
#gauth-welcome-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(15,23,42,.55); backdrop-filter: blur(4px);
    z-index: 10001; align-items: center; justify-content: center;
    padding: 16px; opacity: 0; transition: opacity .25s ease;
}
#gauth-welcome-overlay.open { display: flex; opacity: 1; }
#gauth-welcome-card {
    background: linear-gradient(160deg,#eff6ff 0%,#ffffff 45%,#f0fdf4 100%);
    border-radius: 22px; padding: 26px 24px 22px;
    max-width: 400px; width: 100%;
    box-shadow: 0 24px 70px rgba(0,0,0,.3); position: relative;
    transform: translateY(14px) scale(.97);
    transition: transform .3s cubic-bezier(.34,1.56,.64,1);
}
#gauth-welcome-overlay.open #gauth-welcome-card { transform: translateY(0) scale(1); }
.gauth-welcome-close {
    position: absolute; top: 12px; right: 14px; background: none; border: none;
    font-size: 1.15rem; color: #9ca3af; cursor: pointer; padding: 4px 6px;
    border-radius: 8px; transition: all .2s; line-height: 1;
}
.gauth-welcome-close:hover { color: #6b7280; background: rgba(0,0,0,.05); }
.gauth-welcome-icon { font-size: 2.6rem; text-align: center; line-height: 1; margin-bottom: 8px; }
.gauth-welcome-title { font-size: 1.2rem; font-weight: 800; color: #1f2937; text-align: center; margin-bottom: 5px; }
.gauth-welcome-sub { font-size: .85rem; color: #6b7280; text-align: center; line-height: 1.55; margin-bottom: 18px; }
.gauth-welcome-perks { list-style: none; margin: 0 0 20px; padding: 0; display: flex; flex-direction: column; gap: 11px; }
.gauth-welcome-perks li { display: flex; align-items: flex-start; gap: 11px; }
.gauth-perk-ico { font-size: 1.3rem; flex-shrink: 0; line-height: 1.25; width: 26px; text-align: center; }
.gauth-perk-txt { font-size: .86rem; color: #374151; line-height: 1.5; }
.gauth-perk-txt b { color: #1f2937; font-weight: 700; }
.gauth-welcome-actions { display: flex; flex-direction: column; gap: 9px; }
.gauth-welcome-login {
    display: flex; align-items: center; justify-content: center; gap: 9px;
    padding: 12px; background: #4285f4; color: #fff; border: none; border-radius: 11px;
    font-weight: 700; font-size: .95rem; cursor: pointer;
    box-shadow: 0 4px 14px rgba(66,133,244,.35); transition: background .2s, transform .1s;
}
.gauth-welcome-login:hover { background: #3367d6; }
.gauth-welcome-login:active { transform: scale(.98); }
.gauth-welcome-login img { width: 20px; height: 20px; background: #fff; border-radius: 50%; padding: 2px; box-sizing: border-box; }
.gauth-welcome-later {
    padding: 9px; background: none; border: none; color: #6b7280;
    font-size: .85rem; cursor: pointer; border-radius: 8px; transition: background .2s;
}
.gauth-welcome-later:hover { background: rgba(0,0,0,.04); color: #374151; }

/* ─── 深色模式適配 ─── */
.dark #gauth-modal {
    background: var(--bg-card) !important;
    border: 1px solid var(--border-color);
}
.dark #gauth-modal h3 {
    color: var(--text-primary) !important;
}
.dark #gauth-modal p {
    color: var(--text-secondary) !important;
}
.dark .gauth-btn-secondary {
    background: var(--bg-secondary) !important;
    color: var(--text-primary) !important;
}
.dark .gauth-btn-secondary:hover {
    background: var(--bg-hover) !important;
}

.dark #gauth-welcome-card {
    background: linear-gradient(160deg, #1e293b 0%, #0f172a 100%) !important;
    border: 1px solid var(--border-color);
}
.dark .gauth-welcome-title {
    color: var(--text-primary) !important;
}
.dark .gauth-welcome-sub {
    color: var(--text-secondary) !important;
}
.dark .gauth-perk-txt {
    color: var(--text-secondary) !important;
}
.dark .gauth-perk-txt b {
    color: var(--text-primary) !important;
}
.dark .gauth-welcome-later {
    color: var(--text-muted) !important;
}
.dark .gauth-welcome-later:hover {
    background: rgba(255,255,255,.05) !important;
    color: var(--text-primary) !important;
}
.dark .gauth-welcome-close:hover {
    background: rgba(255,255,255,.05) !important;
    color: var(--text-primary) !important;
}
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
                    <button class="gauth-dd-item" onclick="GoogleAuthUI.syncDown()">
                        📥 從雲端還原（雲端 → 本地）
                    </button>
                    <button class="gauth-dd-item" onclick="GoogleAuthUI.syncAll()" style="color:#0369a1;font-weight:700;">
                        🌐 一鍵同步所有班級
                    </button>
                    <button class="gauth-dd-item" onclick="GoogleAuthUI.syncAllDown()" style="color:#7c3aed;font-weight:700;">
                        📥 一鍵還原所有班級
                    </button>
                    <button class="gauth-dd-item" id="gauth-dd-repair" onclick="GoogleAuthUI.repairClasses()" style="display:none;color:#059669;font-weight:700;">
                        🩺 班級健檢與修復
                    </button>
                    <button class="gauth-dd-item" id="gauth-dd-admin" onclick="showAdminConsole()" style="display:none;color:#d97706;font-weight:700;">
                        🔧 系統維運後台
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
                    <button class="gauth-dd-item" onclick="GoogleAuthUI.syncDown()">
                        📥 從雲端還原
                    </button>
                    <button class="gauth-dd-item" onclick="GoogleAuthUI.syncAll()" style="color:#0369a1;font-weight:700;">
                        🌐 一鍵同步所有班級
                    </button>
                    <button class="gauth-dd-item" onclick="GoogleAuthUI.syncAllDown()" style="color:#7c3aed;font-weight:700;">
                        📥 一鍵還原所有班級
                    </button>
                    <button class="gauth-dd-item" id="gauth-dd-repair-mobile" onclick="GoogleAuthUI.repairClasses()" style="display:none;color:#059669;font-weight:700;">
                        🩺 班級健檢與修復
                    </button>
                    <button class="gauth-dd-item" id="gauth-dd-admin-mobile" onclick="showAdminConsole()" style="display:none;color:#d97706;font-weight:700;">
                        🔧 系統維運後台
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

        // 管理員專屬功能（班級健檢與修復 + 系統維運後台）按鈕顯示/隱藏
        const isUserAdmin = isAdminEmail(profile.email);
        const adminBtnIds = ['gauth-dd-repair', 'gauth-dd-repair-mobile', 'gauth-dd-admin', 'gauth-dd-admin-mobile'];
        adminBtnIds.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.style.display = isUserAdmin ? 'block' : 'none';
        });

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

        // 檢查雲端是否有「預設班以外」的班級（科任老師常見：資料全在 601~606，預設班反而是空的）
        // 若只看預設班會誤判成「雲端沒資料」→ 整批班級不會還原，新裝置只看得到預設班
        let cloudExtraClasses = [];
        try {
            const cloudProfiles = await window.FirebaseSync.fetchCloudClassProfiles?.() || [];
            cloudExtraClasses = cloudProfiles.filter(p => String(p.id) !== 'default');
        } catch (e) { /* 略過 */ }
        const cloudHasAny = cloudHasData || cloudExtraClasses.length > 0;

        const localHasData = hasLocalData();

        if (!cloudHasAny && !localHasData) {
            // 兩邊都沒有資料：直接進入
            NotificationSystem && NotificationSystem.success('歡迎！帳號已就緒 ☁️');
            return;
        }

        if (!cloudHasAny && localHasData) {
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

        if (cloudHasAny && !localHasData) {
            // 只有雲端資料：自動下載
            setSyncing(true);
            if (cloudExtraClasses.length > 0) {
                // 多班級帳號：一次還原所有班級（含 601~606），而非只還原預設班
                await window.FirebaseSync.syncAllClassesFromCloud();
                setSyncing(false);
                NotificationSystem && NotificationSystem.success(`已從雲端還原所有班級（共 ${cloudExtraClasses.length + 1} 個）📥`);
                setTimeout(() => location.reload(), 900);
                return;
            }
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
        if (choice === 'cloud') {
            if (cloudExtraClasses.length > 0) {
                // 多班級：還原全部班級後重新載入
                await window.FirebaseSync.syncAllClassesFromCloud();
                setSyncing(false);
                NotificationSystem && NotificationSystem.success(`已從雲端還原所有班級（共 ${cloudExtraClasses.length + 1} 個）📥`);
                setTimeout(() => location.reload(), 900);
                return;
            }
            await window.FirebaseSync.loadFromCloud();
        }
        else if (choice === 'local') await window.FirebaseSync.syncToCloud();
        else if (choice === 'merge') await window.FirebaseSync.mergeWithCloud();
        setSyncing(false);
        refreshSyncTime();
    }

    // ────────────────────────────────────────────────────────
    // ────────────────────────────────────────────────────────
    // 全班同步確認 Modal（私有輔助函式）
    // ────────────────────────────────────────────────────────
    function showAllClassConfirmDialog({ icon, title, subtitle, arrowHtml, warningText, dataList, confirmLabel, confirmColor }) {
        return new Promise(resolve => {
            const id = 'gauth-allsync-confirm';
            document.getElementById(id)?.remove();

            const isDark = document.documentElement.classList.contains('dark');
            const bgCard = isDark ? 'var(--bg-card)' : '#fff';
            const bgWarning = isDark ? 'rgba(217,119,6,.15)' : '#fef3c7';
            const borderWarning = isDark ? '#d97706' : '#f59e0b';
            const textWarning = isDark ? '#f59e0b' : '#92400e';
            const bgList = isDark ? 'var(--bg-secondary)' : '#f8fafc';
            const textPrimary = isDark ? 'var(--text-primary)' : '#1e293b';
            const textSecondary = isDark ? 'var(--text-secondary)' : '#64748b';
            const textMuted = isDark ? 'var(--text-muted)' : '#6b7280';
            const textItem = isDark ? 'var(--text-primary)' : '#374151';
            const cancelBg = isDark ? 'var(--bg-tertiary)' : '#f1f5f9';
            const cancelText = isDark ? 'var(--text-primary)' : '#374151';

            const overlay = document.createElement('div');
            overlay.id = id;
            overlay.style.cssText = `
                position:fixed; inset:0; z-index:999999;
                background:rgba(0,0,0,.6); backdrop-filter:blur(6px);
                display:flex; align-items:center; justify-content:center; padding:16px;
            `;

            const dataItems = dataList.map(d =>
                `<li style="display:flex;align-items:center;gap:6px;padding:4px 0;">
                    <span style="color:${textMuted};font-size:.9rem;">•</span>
                    <span style="color:${textItem};font-size:.9rem;">${d}</span>
                </li>`
            ).join('');

            overlay.innerHTML = `
                <div style="background:${bgCard}; border-radius:20px; padding:28px 28px 24px; max-width:440px; width:100%;
                     box-shadow:0 24px 80px rgba(0,0,0,.25); border: ${isDark ? '1px solid var(--border-color)' : 'none'};">
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
                        <span style="font-size:2rem;">${icon}</span>
                        <div>
                            <div style="font-weight:800;font-size:1.15rem;color:${textPrimary};">${title}</div>
                            <div style="font-size:.85rem;color:${textSecondary};font-weight:600;">${subtitle}</div>
                        </div>
                    </div>

                    ${arrowHtml}

                    <div style="background:${bgWarning};border-left:4px solid ${borderWarning};border-radius:8px;padding:10px 14px;margin-bottom:14px;">
                        <div style="font-size:.85rem;color:${textWarning};line-height:1.6;">${warningText}</div>
                    </div>

                    <div style="font-size:.82rem;font-weight:700;color:${textMuted};margin-bottom:4px;">將同步以下資料：</div>
                    <ul style="margin:0 0 18px 0;padding:0;list-style:none;background:${bgList};border-radius:10px;padding:8px 12px;">
                        ${dataItems}
                    </ul>

                    <div style="display:flex;gap:10px;justify-content:flex-end;">
                        <button id="${id}-cancel"
                            style="padding:10px 20px;background:${cancelBg};color:${cancelText};border:none;border-radius:10px;
                                   cursor:pointer;font-weight:600;font-size:.9rem;">
                            取消
                        </button>
                        <button id="${id}-confirm"
                            style="padding:10px 24px;background:${confirmColor};color:#fff;border:none;border-radius:10px;
                                   cursor:pointer;font-weight:700;font-size:.9rem;">
                            ${confirmLabel}
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            document.getElementById(`${id}-cancel`).onclick = () => { overlay.remove(); resolve(false); };
            document.getElementById(`${id}-confirm`).onclick = () => { overlay.remove(); resolve(true); };
            overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
        });
    }

    // ────────────────────────────────────────────────────────
    // 登入提醒 Banner（首次使用者引導）
    // ────────────────────────────────────────────────────────
    const LOGIN_REMINDER_KEY    = 'gauthLoginReminderDismissed'; // （保留備用）底部 Banner 永久關閉用
    const REMINDER_SESSION_KEY  = 'gauthReminderShownSession';   // 本次開啟已顯示過 Banner（避免重複跳）

    // 用「記憶體變數」而非 sessionStorage 做去重：每次頁面載入（含 F5 重新整理）都會重置 →
    // 未登入就會再跳歡迎彈窗；同一次載入內（含使用者關閉後保底機制再觸發）則不重複彈出。
    // （sessionStorage 在同分頁重新整理時不會清除，會誤擋掉「重整後再跳」，故改用記憶體變數。）
    let welcomeShownThisLoad = false;

    function remindedOff() { return !!localStorage.getItem(LOGIN_REMINDER_KEY); }

    // 是否已用 Google 帳號登入（已登入者一律不顯示任何引導）
    function isLoggedInGoogle() {
        try { return !!(window.FirebaseConfig && window.FirebaseConfig.isGoogleUser && window.FirebaseConfig.isGoogleUser()); }
        catch (e) { return false; }
    }

    function dismissLoginReminder(permanently) {
        if (permanently) {
            localStorage.setItem(LOGIN_REMINDER_KEY, 'true');
        }
        const banner = document.getElementById('gauth-login-reminder');
        if (banner) {
            banner.classList.remove('show');
            setTimeout(() => banner.remove(), 400);
        }
    }

    // ───────── 兩段式第一段：訪客「歡迎彈窗」（史上第一次進入時隆重歡迎 + 列好處）─────────
    function showWelcomeModal() {
        // 未登入老師：每次頁面載入（含 F5 重新整理）都跳（不提供永久關閉）。同一次載入內只跳一次，避免短時間重複彈出。
        if (isLoggedInGoogle()) return;                  // 已登入 → 不跳
        if (welcomeShownThisLoad) return;                // 本次載入已跳過（含關閉後）→ 不重複
        if (document.getElementById('gauth-welcome-overlay')) return;
        welcomeShownThisLoad = true;

        const overlay = document.createElement('div');
        overlay.id = 'gauth-welcome-overlay';
        overlay.innerHTML = `
            <div id="gauth-welcome-card">
                <button class="gauth-welcome-close" onclick="GoogleAuthUI.dismissWelcome()" aria-label="關閉" title="先逛逛看看">✕</button>
                <div class="gauth-welcome-icon">👋☁️</div>
                <div class="gauth-welcome-title">歡迎使用班級小管家！</div>
                <div class="gauth-welcome-sub">用 Google 帳號登入（免費、一鍵），<br>班級資料就不怕不見，還有這些好處 👇</div>
                <ul class="gauth-welcome-perks">
                    <li><span class="gauth-perk-ico">☁️</span><span class="gauth-perk-txt"><b>自動雲端備份</b>：換手機、重灌電腦都不怕，資料永遠都在。</span></li>
                    <li><span class="gauth-perk-ico">🔄</span><span class="gauth-perk-txt"><b>多裝置同步</b>：在學校改一改，回到家打開就能接著用。</span></li>
                    <li><span class="gauth-perk-ico">🗂️</span><span class="gauth-perk-txt"><b>多班級一鍵備份還原</b>：帶好幾個班也不怕弄亂。</span></li>
                    <li><span class="gauth-perk-ico">🔒</span><span class="gauth-perk-txt"><b>安全又私密</b>：資料綁你的帳號，只有你自己看得到。</span></li>
                </ul>
                <div class="gauth-welcome-actions">
                    <button class="gauth-welcome-login" onclick="GoogleAuthUI.loginFromWelcome()">
                        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G">
                        使用 Google 帳號登入
                    </button>
                    <button class="gauth-welcome-later" onclick="GoogleAuthUI.dismissWelcome()">先逛逛看看，晚點再登入</button>
                </div>
            </div>
        `;
        // 點背景（卡片外）也視為「先逛逛」
        overlay.addEventListener('click', (e) => { if (e.target === overlay) GoogleAuthUI.dismissWelcome(); });
        document.body.appendChild(overlay);
        void overlay.offsetWidth;            // 強制 reflow，確保進場 transition 一定觸發（不依賴 rAF，背景分頁也可靠）
        overlay.classList.add('open');
    }

    function closeWelcomeModal() {
        // 不寫任何永久旗標：去重交給記憶體變數 welcomeShownThisLoad，下次頁面載入（含 F5 重新整理）會重置 → 仍會再跳。
        const overlay = document.getElementById('gauth-welcome-overlay');
        if (overlay) {
            overlay.classList.remove('open');
            setTimeout(() => overlay.remove(), 280);
        }
    }

    // ───────── 訪客引導：未登入老師「每次重新進入」都跳歡迎彈窗（同一次使用內只跳一次）─────────
    // 註：底部 Banner（showLoginReminder）相關程式碼保留備用，目前一律以歡迎彈窗引導登入。
    function maybeShowGuestPrompt() {
        setTimeout(() => { if (!isLoggedInGoogle()) showWelcomeModal(); }, 1200);
    }

    // 保底：Firebase auth 回呼有時因初始化時序（race）沒能觸發訪客分支，
    // 此處稍後再判斷一次。已登入、或「上次是 Google 登入、restore 中」則不打擾。
    function guestPromptFallback() {
        if (isLoggedInGoogle()) return;
        try {
            var p = JSON.parse(localStorage.getItem('firebaseUserProfile') || 'null');
            if (p && p.isAnonymous === false) return;
        } catch (e) { /* ignore */ }
        maybeShowGuestPrompt();   // 內部有 isLoggedInGoogle 防護 + DOM 去重，重複呼叫安全
    }

    function showLoginReminder() {
        if (remindedOff()) return;                                    // 已永久不再提醒
        if (isLoggedInGoogle()) return;                               // 已登入 → 不顯示
        if (sessionStorage.getItem(REMINDER_SESSION_KEY)) return;     // 本次開啟已跳過一次
        if (document.getElementById('gauth-login-reminder')) return;  // 已顯示
        sessionStorage.setItem(REMINDER_SESSION_KEY, '1');

        const banner = document.createElement('div');
        banner.id = 'gauth-login-reminder';
        banner.innerHTML = `
            <div class="gauth-reminder-card">
                <button class="gauth-reminder-close" onclick="GoogleAuthUI.dismissReminder(false)" title="下次再說" aria-label="關閉">✕</button>
                <div class="gauth-reminder-header">
                    <div class="gauth-reminder-icon">☁️</div>
                    <div>
                        <div class="gauth-reminder-title">登入 Google，班級資料自動雲端備份</div>
                        <div class="gauth-reminder-desc">免費登入，換手機 / 重灌都不怕資料不見：</div>
                        <ul class="gauth-reminder-perks">
                            <li>☁️ 自動備份</li>
                            <li>🔄 多裝置同步</li>
                            <li>🗂️ 多班級還原</li>
                            <li>🔒 安全私密</li>
                        </ul>
                    </div>
                </div>
                <div class="gauth-reminder-actions">
                    <button class="gauth-reminder-login" onclick="GoogleAuthUI.loginFromReminder()">
                        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" style="width:16px;height:16px;">
                        立即登入
                    </button>
                    <button class="gauth-reminder-dismiss" onclick="GoogleAuthUI.dismissReminder(true)">不再提醒</button>
                </div>
            </div>
        `;
        document.body.appendChild(banner);

        // 進場動畫：強制 reflow 後加 class，確保 transition 一定觸發（不依賴 rAF）
        void banner.offsetWidth;
        banner.classList.add('show');
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

            // 登入成功 → 永久關閉登入提醒 Banner
            dismissLoginReminder(true);
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

        /** 關閉登入提醒 Banner（permanently=true=永久不再顯示；false=只關這次，下次開啟再溫和提醒） */
        dismissReminder(permanently) {
            dismissLoginReminder(permanently);
        },

        /** 底部 Banner 點「立即登入」：先收起 Banner（不永久），再開登入流程 */
        loginFromReminder() {
            dismissLoginReminder(false);
            this.login();
        },

        /** 歡迎彈窗點「登入」：收起彈窗，再開登入流程 */
        loginFromWelcome() {
            closeWelcomeModal();
            this.login();
        },

        /** 關閉歡迎彈窗（先逛逛看看）：只關這次；下次重新進入仍會再跳引導 */
        dismissWelcome() {
            closeWelcomeModal();
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

        async syncAll() {
            // 關閉下拉選單
            const dd = document.getElementById('gauth-dropdown');
            if (dd) dd.classList.remove('open');
            const ddM = document.getElementById('gauth-dropdown-mobile');
            if (ddM) ddM.style.display = 'none';

            if (!window.FirebaseConfig.isConnected()) {
                NotificationSystem && NotificationSystem.warning('請先登入 Google 帳號');
                return;
            }
            if (!window.FirebaseSync || typeof window.FirebaseSync.showAllClassSyncModal !== 'function') {
                NotificationSystem && NotificationSystem.error('同步模組尚未載入，請稍後再試');
                return;
            }

            // ── 確認 Modal ──
            const profiles = JSON.parse(localStorage.getItem('classProfiles') || '[]');
            // ⚠️ 不可寫成 profiles.length + 1。`default` **本來就在 classProfiles 裡**
            //    （class-profiles.js 的 loadProfiles() 會在缺少時自動補上），多 +1
            //    會讓 6 個班顯示成 7 個。用 id 去重才是對的：名冊有 default 就不多算，
            //    極少數舊帳號名冊缺 default 也不會少算。
            //    這與 v3.16.2（一鍵同步列兩次預設班）、v3.16.3（後端註解寫錯）同源。
            const classIds = new Set(profiles.filter(p => p && p.id != null).map(p => String(p.id)));
            classIds.add('default');
            const classCount = classIds.size;
            const confirmed = await showAllClassConfirmDialog({
                direction: 'upload',
                icon: '🌐',
                title: '一鍵同步所有班級',
                subtitle: '本地 → 雲端',
                arrowHtml: `
                    <div style="display:flex;align-items:center;gap:12px;justify-content:center;margin:16px 0;">
                        <div style="background:#dbeafe;border-radius:10px;padding:8px 16px;font-weight:700;color:#1d4ed8;">📱 本地裝置</div>
                        <div style="font-size:1.4rem;color:#2563eb;">→</div>
                        <div style="background:#d1fae5;border-radius:10px;padding:8px 16px;font-weight:700;color:#065f46;">☁️ Firebase 雲端</div>
                    </div>`,
                warningText: `本操作將把本裝置上 <strong>${classCount} 個班級</strong> 的資料上傳至雲端，<strong>雲端舊資料將被覆蓋</strong>。`,
                dataList: ['學生名單與分數', '加扣分記錄', '分組資料', '聯絡簿 / 作業 / 公告', '考試監考設定', '時鐘 / 抽籤設定', '作業繳交狀態'],
                confirmLabel: '確定同步至雲端',
                confirmColor: '#2563eb',
            });
            if (!confirmed) return;

            await window.FirebaseSync.showAllClassSyncModal();
            refreshSyncTime();
        },

        async syncAllDown() {
            // 關閉下拉選單
            const dd = document.getElementById('gauth-dropdown');
            if (dd) dd.classList.remove('open');
            const ddM = document.getElementById('gauth-dropdown-mobile');
            if (ddM) ddM.style.display = 'none';

            if (!window.FirebaseConfig.isConnected()) {
                NotificationSystem && NotificationSystem.warning('請先登入 Google 帳號');
                return;
            }
            if (!window.FirebaseSync || typeof window.FirebaseSync.showAllClassDownloadModal !== 'function') {
                NotificationSystem && NotificationSystem.error('同步模組尚未載入，請稍後再試');
                return;
            }

            // ── 確認 Modal ──
            // 以雲端班級清單為準計算數量（新裝置本地只有 default，用本地會少算）
            let mergedProfiles = [];
            try { mergedProfiles = await window.FirebaseSync.syncClassProfilesFromCloud?.() || []; } catch { /* 略過 */ }
            // 同上：以 id 去重計數，不要用「非 default 筆數 + 1」
            const cloudIds = new Set(mergedProfiles.filter(p => p && p.id != null).map(p => String(p.id)));
            cloudIds.add('default');
            const classCount = cloudIds.size;
            const confirmed = await showAllClassConfirmDialog({
                direction: 'download',
                icon: '📥',
                title: '一鍵還原所有班級',
                subtitle: '雲端 → 本地',
                arrowHtml: `
                    <div style="display:flex;align-items:center;gap:12px;justify-content:center;margin:16px 0;">
                        <div style="background:#d1fae5;border-radius:10px;padding:8px 16px;font-weight:700;color:#065f46;">☁️ Firebase 雲端</div>
                        <div style="font-size:1.4rem;color:#7c3aed;">→</div>
                        <div style="background:#ede9fe;border-radius:10px;padding:8px 16px;font-weight:700;color:#5b21b6;">📱 本地裝置</div>
                    </div>`,
                warningText: `本操作將把雲端上 <strong>${classCount} 個班級</strong> 的資料下載至本裝置，<strong>本地現有資料將被覆蓋</strong>。`,
                dataList: ['學生名單與分數', '加扣分記錄', '分組資料', '聯絡簿 / 作業 / 公告', '考試監考設定', '時鐘 / 抽籤設定', '作業繳交狀態'],
                confirmLabel: '確定還原至本地',
                confirmColor: '#7c3aed',
            });
            if (!confirmed) return;

            await window.FirebaseSync.showAllClassDownloadModal();
            refreshSyncTime();
        },

        // R-A4：班級健檢與修復——掃出「雲端有資料卻不在名冊」的班級補回
        async repairClasses() {
            const dd = document.getElementById('gauth-dropdown');
            if (dd) dd.classList.remove('open');
            const ddM = document.getElementById('gauth-dropdown-mobile');
            if (ddM) ddM.style.display = 'none';

            if (!window.FirebaseConfig.isConnected()) {
                NotificationSystem && NotificationSystem.warning('請先登入 Google 帳號');
                return;
            }
            // 🔐 僅限管理員：即使有人手動呼叫此函式也擋下
            if (!isCurrentUserAdmin()) {
                NotificationSystem && NotificationSystem.error('此功能僅限系統管理員使用');
                return;
            }
            if (!window.FirebaseSync || typeof window.FirebaseSync.repairClassRegistry !== 'function') {
                NotificationSystem && NotificationSystem.error('同步模組尚未載入，請稍後再試');
                return;
            }

            setSyncing(true);
            try {
                const r = await window.FirebaseSync.repairClassRegistry();
                if (!r) return;
                if (r.recovered > 0) {
                    NotificationSystem && NotificationSystem.success(
                        `🩺 健檢完成：找回 ${r.recovered} 個班級（目前共 ${r.afterCount} 個）。班級選單已更新，可再「一鍵還原所有班級」把資料拉回本機。`
                    );
                } else {
                    NotificationSystem && NotificationSystem.success(
                        `🩺 健檢完成：班級名冊正常，雲端共 ${r.afterCount} 個班級，無孤兒班級需修復。`
                    );
                }
            } catch (e) {
                console.error('[GoogleAuthUI] 班級健檢失敗:', e);
                NotificationSystem && NotificationSystem.error('班級健檢失敗：' + (e?.message || e));
            } finally {
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
                    // 已用 Google 登入 → 顯示帳號、收掉訪客引導（歡迎彈窗 / Banner）
                    showLoggedIn(profile);
                    dismissLoginReminder(true);
                    closeWelcomeModal();
                } else {
                    // 訪客（未登入 / 匿名）→ 兩段式引導：首次置中歡迎彈窗、之後底部 Banner
                    showLoggedOut();
                    maybeShowGuestPrompt();
                }
            });
            // 保底：auth 回呼若因初始化時序沒觸發，稍後再判斷一次（內部有去登入/去重防護）
            setTimeout(guestPromptFallback, 3500);
        } else {
            // FirebaseConfig 未載入（離線等情況），仍當訪客嘗試引導
            maybeShowGuestPrompt();
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
