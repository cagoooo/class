/**
 * Google 撣唾??餃 UI 璅∠? v1.0
 * ?芣?瘜典 CSS + HTML嚗??游董?恣????
 */

(function () {
    'use strict';

    // ????????????????????????????????????????????????????????
    // CSS 瘜典
    // ????????????????????????????????????????????????????????
    function injectCSS() {
        if (document.getElementById('gauth-style')) return;
        const style = document.createElement('style');
        style.id = 'gauth-style';
        style.textContent = `
/* Google Auth ?餃?? */
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

/* 撌脩?伐??剖?摰孵 */
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

/* 銝??詨 */
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

/* ?郊銝剖?敶Ｗ???*/
#gauth-sync-spinner {
    display: none;
    width: 16px; height: 16px;
    border: 2px solid #6366f1;
    border-top-color: transparent;
    border-radius: 50%;
    animation: gauthSpin .8s linear infinite;
}
@keyframes gauthSpin { to { transform: rotate(360deg); } }

/* 擐活?餃 Modal */
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

    // ????????????????????????????????????????????????????????
    // 撌亙?賢?
    // ????????????????????????????????????????????????????????
    function lastSyncText() {
        const t = localStorage.getItem('lastSyncTime');
        if (!t) return '敺?郊';
        const diff = Math.round((Date.now() - new Date(t).getTime()) / 60000);
        if (diff < 1) return '??';
        if (diff < 60) return `${diff} ???;
        return `${Math.floor(diff / 60)} 撠??;
    }

    function hasLocalData() {
        try {
            const s = JSON.parse(localStorage.getItem(window.STUDENTS_KEY || 'students') || '[]');
            return s.length > 0;
        } catch { return false; }
    }

    // ????????????????????????????????????????????????????????
    // HTML 瘜典嚗釣?亙 nav ?喳雿???嚗???????甇伐?
    // ????????????????????????????????????????????????????????
    // ?梁??交???HTML嚗??Ｙ?嚗?
    const DESKTOP_SLOT_HTML = `
            <!-- ?芰??-->
            <button id="gauth-btn" onclick="GoogleAuthUI.login()" title="雿輻 Google 撣唾??餃嚗?鞈??郊?圈蝡?>
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G">
                <span>Google ?餃</span>
            </button>

            <!-- 撌脩?伐??身?梯?嚗?-->
            <div id="gauth-avatar-wrap" style="display:none;">
                <div id="gauth-avatar-initial" onclick="GoogleAuthUI.toggleDropdown()"></div>
                <img id="gauth-avatar-img" src="" alt="?剖?"
                     style="display:none; width:36px;height:36px;border-radius:50%;border:2px solid #6366f1;object-fit:cover;cursor:pointer;"
                     onclick="GoogleAuthUI.toggleDropdown()">
                <span id="gauth-name-label"></span>
                <span id="gauth-sync-spinner"></span>

                <!-- 銝??詨 -->
                <div id="gauth-dropdown">
                    <div class="gauth-dd-header">
                        <div class="gauth-dd-name"  id="gauth-dd-name"></div>
                        <div class="gauth-dd-email" id="gauth-dd-email"></div>
                        <div class="gauth-dd-sync-time">?? 銝活?郊嚗?span id="gauth-dd-sync"></span></div>
                    </div>
                    <button class="gauth-dd-item" onclick="GoogleAuthUI.syncUp()">
                        ?? 蝡?郊嚗?????脩垢嚗?
                    </button>
                    <button class="gauth-dd-item" onclick="GoogleAuthUI.syncDown()">
                        ? 敺蝡舫????脩垢 ???砍嚗?
                    </button>
                    <div class="gauth-dd-divider"></div>
                    <button class="gauth-dd-item danger" onclick="GoogleAuthUI.logout()">
                        ? ?餃
                    </button>
                </div>
            </div>
    `;

    // ?????芣??內??嚗?皝?嚗???格??冽迨??
    const MOBILE_SLOT_HTML = `
            <!-- ???芰??-->
            <button id="gauth-btn-mobile" onclick="GoogleAuthUI.login()" title="?餃" style="
                display:flex; align-items:center; gap:4px;
                padding:6px 10px; background:#fff; border:1.5px solid #dadce0;
                border-radius:50px; cursor:pointer; font-size:0.78rem; font-weight:600;
                color:#3c4043; white-space:nowrap; box-shadow:0 1px 3px rgba(0,0,0,.08);
            ">
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" style="width:16px;height:16px;">
                <span>?餃</span>
            </button>

            <!-- ??撌脩?伐??芷＊蝷粹??-->
            <div id="gauth-avatar-wrap-mobile" style="display:none; position:relative;">
                <div id="gauth-avatar-initial-mobile"
                     onclick="GoogleAuthUI.toggleDropdownMobile()"
                     style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#818cf8);
                            color:#fff;font-weight:700;font-size:0.85rem;display:flex;align-items:center;
                            justify-content:center;border:2px solid #6366f1;cursor:pointer;
                            transition:box-shadow 0.2s;">
                </div>
                <img id="gauth-avatar-img-mobile" src="" alt="?剖?"
                     style="display:none;width:32px;height:32px;border-radius:50%;border:2px solid #6366f1;
                            object-fit:cover;cursor:pointer;"
                     onclick="GoogleAuthUI.toggleDropdownMobile()">
                <span id="gauth-sync-spinner-mobile" style="display:none;width:14px;height:14px;
                    border:2px solid #6366f1;border-top-color:transparent;border-radius:50%;
                    animation:gauthSpin .8s linear infinite;"></span>

                <!-- ???????-->
                <div id="gauth-dropdown-mobile" style="
                    display:none; position:absolute; top:calc(100% + 8px); right:0;
                    min-width:210px; background:#fff; border-radius:14px;
                    box-shadow:0 8px 32px rgba(0,0,0,.18); overflow:hidden;
                    z-index:9999; animation:gauthFadeIn .18s ease;
                ">
                    <div class="gauth-dd-header" id="gauth-dd-header-mobile">
                        <div class="gauth-dd-name"  id="gauth-dd-name-mobile"></div>
                        <div class="gauth-dd-email" id="gauth-dd-email-mobile"></div>
                        <div class="gauth-dd-sync-time">?? 銝活?郊嚗?span id="gauth-dd-sync-mobile"></span></div>
                    </div>
                    <button class="gauth-dd-item" onclick="GoogleAuthUI.syncUp()">
                        ?? 蝡?郊
                    </button>
                    <button class="gauth-dd-item" onclick="GoogleAuthUI.syncDown()">
                        ? 敺蝡舫???
                    </button>
                    <div class="gauth-dd-divider"></div>
                    <button class="gauth-dd-item danger" onclick="GoogleAuthUI.logout()">
                        ? ?餃
                    </button>
                </div>
            </div>
    `;

    function injectHTML() {
        // 獢??slot
        const slot = document.getElementById('auth-nav-slot');
        if (slot) slot.innerHTML = DESKTOP_SLOT_HTML;

        // ????slot
        const mobileSlot = document.getElementById('auth-nav-slot-mobile');
        if (mobileSlot) mobileSlot.innerHTML = MOBILE_SLOT_HTML;

        // 暺?憭??獢銝?
        document.addEventListener('click', (e) => {
            const wrap = document.getElementById('gauth-avatar-wrap');
            if (wrap && !wrap.contains(e.target)) {
                const dd = document.getElementById('gauth-dropdown');
                if (dd) dd.classList.remove('open');
            }
            // ????????
            const mwrap = document.getElementById('gauth-avatar-wrap-mobile');
            if (mwrap && !mwrap.contains(e.target)) {
                const mdd = document.getElementById('gauth-dropdown-mobile');
                if (mdd) mdd.style.display = 'none';
            }
        });
    }

    // ????????????????????????????????????????????????????????
    // Modal 撠店獢?銝 alert/confirm嚗?
    // ????????????????????????????????????????????????????????
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

    // ????????????????????????????????????????????????????????
    // UI ???堆??郊?湔獢??????
    // ????????????????????????????????????????????????????????
    function showLoggedIn(profile) {
        const firstChar = (profile.displayName || '??)[0].toUpperCase();

        // === 獢??===
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
            const nameParts = (profile.displayName || '?葦').split(' ');
            const nameLabel = document.getElementById('gauth-name-label');
            if (nameLabel) nameLabel.textContent = nameParts[0];
        }

        // === ????===
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

        // Dropdown header嚗???+ ???梁?迂/靽∠拳嚗?
        const ddName = document.getElementById('gauth-dd-name');
        const ddEmail = document.getElementById('gauth-dd-email');
        if (ddName) ddName.textContent = profile.displayName || '?葦';
        if (ddEmail) ddEmail.textContent = profile.email || '';

        const ddNameM = document.getElementById('gauth-dd-name-mobile');
        const ddEmailM = document.getElementById('gauth-dd-email-mobile');
        if (ddNameM) ddNameM.textContent = profile.displayName || '?葦';
        if (ddEmailM) ddEmailM.textContent = profile.email || '';

        refreshSyncTime();
    }

    // ?餃????憪?HTML嚗?典虜?賂??踹???摮葡嚗?
    const LOGIN_BTN_HTML = `<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G"><span>Google ?餃</span>`;
    const LOGIN_BTN_MOBILE_HTML = `<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" style="width:16px;height:16px;"><span>?餃</span>`;

    function showLoggedOut() {
        // 獢??
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

        // ????
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

    // ????????????????????????????????????????????????????????
    // 擐活?餃瘚?
    // ????????????????????????????????????????????????????????
    async function handleFirstTimeLogin() {
        // 瑼Ｘ?脩垢?臬????
        let cloudHasData = false;
        try {
            const db = window.FirebaseConfig.getDb();
            const uid = window.FirebaseConfig.getCurrentUserId();
            const snap = await db.collection('users').doc(uid).collection('students').limit(1).get();
            cloudHasData = !snap.empty;
        } catch (e) { /* ?⊥??????箇征 */ }

        const localHasData = hasLocalData();

        if (!cloudHasData && !localHasData) {
            // ?拚??賣??????湔?脣
            NotificationSystem && NotificationSystem.success('甇∟?嚗董?歇撠梁? ??');
            return;
        }

        if (!cloudHasData && localHasData) {
            // ?芣??砍鞈?嚗岷??虫???
            const choice = await showModal(
                '?? 擐活?餃??嚗?,
                '?菜葫?唳?啣歇?蝝???血?鞈?銝?唬???Google 撣唾?嚗?銝活?其遙雿?蝵桃?仿?賢???',
                [
                    { label: '?? 銝?圈蝡?, cls: 'gauth-btn-primary', value: 'upload' },
                    { label: '蝔??牧', cls: 'gauth-btn-secondary', value: 'skip' },
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
            // ?芣??脩垢鞈?嚗??頛?
            setSyncing(true);
            await window.FirebaseSync.loadFromCloud();
            setSyncing(false);
            refreshSyncTime();
            NotificationSystem && NotificationSystem.success('撌脣??脩垢頛雿?鞈? ?');
            return;
        }

        // ?拚??賣?鞈?嚗??訾?
        const choice = await showModal(
            '?? ?菜葫?圈蝡航??砍?賣?鞈?',
            '隢??雿輻?芯遢鞈?嚗??蔥嚗飛???桀??舫??????靽?嚗?,
            [
                { label: '? 雿輻?脩垢鞈?嚗???堆?', cls: 'gauth-btn-primary', value: 'cloud' },
                { label: '?? 銝?砍鞈?嚗??蝡荔?', cls: 'gauth-btn-accent', value: 'local' },
                { label: '?? ?蔥?拐遢鞈?', cls: 'gauth-btn-secondary', value: 'merge' },
            ]
        );
        setSyncing(true);
        if (choice === 'cloud') await window.FirebaseSync.loadFromCloud();
        else if (choice === 'local') await window.FirebaseSync.syncToCloud();
        else if (choice === 'merge') await window.FirebaseSync.mergeWithCloud();
        setSyncing(false);
        refreshSyncTime();
    }

    // ????????????????????????????????????????????????????????
    // ?祇? API
    // ????????????????????????????????????????????????????????
    window.GoogleAuthUI = {

        async login() {
            // 獢???＊蝷箝?乩葉...??
            const loginBtn = document.getElementById('gauth-btn');
            const loginBtnM = document.getElementById('gauth-btn-mobile');
            if (loginBtn) {
                loginBtn.innerHTML = '<span style="font-size:.8rem;">?餃銝?..</span>';
                loginBtn.disabled = true;
            }
            if (loginBtnM) {
                loginBtnM.innerHTML = '<span style="font-size:.75rem;">?餃銝?..</span>';
                loginBtnM.disabled = true;
            }

            const profile = await window.FirebaseConfig.signInWithGoogle();

            // ?∟?????瘨????????踹???乩葉...?雿?
            if (loginBtn) {
                loginBtn.innerHTML = LOGIN_BTN_HTML;
                loginBtn.disabled = false;
            }
            if (loginBtnM) {
                loginBtnM.innerHTML = LOGIN_BTN_MOBILE_HTML;
                loginBtnM.disabled = false;
            }

            if (!profile) return; // 雿輻??瘨?

            showLoggedIn(profile);

            // 擐活?餃嚗Ⅱ隤?行?郊
            const everSynced = localStorage.getItem('lastSyncTime');
            if (!everSynced) {
                await handleFirstTimeLogin();
            } else {
                NotificationSystem && NotificationSystem.success(`甇∟???嚗?{profile.displayName} ?灼);
            }
        },

        async logout() {
            const dd = document.getElementById('gauth-dropdown');
            if (dd) dd.classList.remove('open');
            const ddM = document.getElementById('gauth-dropdown-mobile');
            if (ddM) ddM.style.display = 'none';

            const confirmed = await showModal(
                '?餃蝣箄?',
                '?餃敺?啗????蔣?選?雿蝡臬?甇亙??怠??Ⅱ摰??餃??',
                [
                    { label: '? 蝣箏??餃', cls: 'gauth-btn-danger', value: true },
                    { label: '??', cls: 'gauth-btn-secondary', value: false },
                ]
            );
            if (!confirmed) return;

            await window.FirebaseConfig.signOut();
            showLoggedOut();
            NotificationSystem && NotificationSystem.info('撌脩??);
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
            // ??銝??詨
            const dd = document.getElementById('gauth-dropdown');
            if (dd) dd.classList.remove('open');
            const ddM = document.getElementById('gauth-dropdown-mobile');
            if (ddM) ddM.style.display = 'none';

            if (!window.FirebaseConfig.isConnected()) {
                NotificationSystem && NotificationSystem.warning('隢??餃 Google 撣唾?');
                return;
            }
            // ?澆?啁?閰喟敦撌桃?汗 Modal
            const ok = await window.FirebaseSync.showSyncConfirmModal('upload');
            if (ok) {
                setSyncing(false);
                refreshSyncTime();
            }
        },

        async syncDown() {
            // ??銝??詨
            const dd = document.getElementById('gauth-dropdown');
            if (dd) dd.classList.remove('open');
            const ddM = document.getElementById('gauth-dropdown-mobile');
            if (ddM) ddM.style.display = 'none';

            if (!window.FirebaseConfig.isConnected()) {
                NotificationSystem && NotificationSystem.warning('隢??餃 Google 撣唾?');
                return;
            }
            // ?澆?啁?閰喟敦撌桃?汗 Modal嚗????
            const ok = await window.FirebaseSync.showSyncConfirmModal('download');
            if (ok) {
                setSyncing(false);
                refreshSyncTime();
            }
        },
    };

    // ????????????????????????????????????????????????????????
    // ????
    // ????????????????????????????????????????????????????????
    function init() {
        injectCSS();
        injectModal();
        injectHTML();

        // ?? Auth ?????瑟敺?敺拍??
        if (window.FirebaseConfig && typeof window.FirebaseConfig.onAuthStateChanged === 'function') {
            window.FirebaseConfig.onAuthStateChanged((user, profile) => {
                if (user && !user.isAnonymous && profile) {
                    showLoggedIn(profile);
                } else {
                    showLoggedOut();
                }
            });
        }

        // 瘥???啜?甈∪?甇交???
        setInterval(refreshSyncTime, 60000);

        console.log('??Google 撣唾? UI 璅∠?撌脰???);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 800));
    } else {
        setTimeout(init, 800);
    }

})();
