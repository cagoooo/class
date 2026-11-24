/**
 * 同一台電腦多位老師的班級資料隔離（v3.67.0）
 *
 * 問題：本機資料只依「班級」分開，沒有依「Google 帳號」分開。導師與科任在同一台教室電腦輪流登入時，
 * 後登入的老師會直接看到前一位老師留在這台的班級，自動同步再把它們上傳到自己的帳號；
 * 「同步過了沒」的記號也是整台共用，所以後登入的老師連首次登入的選擇視窗都不會出現。
 *
 * 作法（像每位老師一個抽屜）：
 *   - 這台電腦目前的班級資料屬於誰，記在 workspaceOwner。
 *   - 換成另一個 Google 帳號時，先把整份班級資料收進前一位老師的抽屜（IndexedDB），確認存好後
 *     才清空，再拿出新老師自己的抽屜（沒有就從空白開始，由雲端帶回），最後重新整理頁面。
 *   - 登出時把資料收進自己的抽屜並清空，下一位使用的人看不到。
 *   - 收納與切換期間、或資料不屬於目前帳號時，一律不上傳也不下載（FirebaseConfig.canWriteCloud 把關）。
 *   - 抽屜每位老師保留最近 3 份，不會被覆蓋掉。
 *
 * 只動班級資料；主題、時鐘、Firebase 登入狀態與各帳號自己的同步紀錄（cloudSafetyBase:uid:…）留在原處。
 */
(function () {
    'use strict';
    const OWNER = 'workspaceOwner', SWITCHING = 'workspaceSwitching', KEEP_SNAPSHOTS = 3;
    // 這台電腦的偏好與登入狀態：不屬於任何一位老師的班級資料，不跟著收納
    const DEVICE_KEYS = new Set(['theme', 'clockSettings', 'timerFullscreenLight', 'petReduceMotion', 'petViewMode', 'noRepeatLottery',
        'homeworkDashboardView', 'examLightMode', 'examAnalogClock', 'examSoundsEnabled', 'firebaseUserId', 'firebaseUserProfile',
        'classdb_migrated_v1', 'classAwareStorageMigrated_v1', OWNER, SWITCHING,
        // v3.74.1：這台電腦的麥克風校正、番茄鐘與背景音樂設定、備份提醒的「稍後」——換老師登入時不跟著收走
        'quietChallengeCfg', 'pomodoroSettings', 'timerBgmSettings', 'dsg_bannerSnoozeUntil']);
    const DEVICE_PREFIXES = ['firebase', 'firestore', 'un_', 'pwa', 'sw', 'critical', 'cloudSafetyBase:', 'cloudSafetyDirty:', 'workspace'];
    const isDeviceKey = k => DEVICE_KEYS.has(k) || DEVICE_PREFIXES.some(p => k.startsWith(p));

    const storage = () => window.localStorage;
    const raw = k => window.ClassAwareStorage?.rawGet ? window.ClassAwareStorage.rawGet(k) : storage().getItem(k);
    const rawSet = (k, v) => window.ClassAwareStorage?.vaultSet ? window.ClassAwareStorage.vaultSet(k, v) : storage().setItem(k, v);
    const rawRemove = k => window.ClassAwareStorage?.vaultRemove ? window.ClassAwareStorage.vaultRemove(k) : storage().removeItem(k);
    const allKeys = () => { const out = []; for (let i = 0; i < storage().length; i++) { const k = storage().key(i); if (k != null) out.push(k); } return out; };
    const workspaceKeys = () => allKeys().filter(k => !isDeviceKey(k));
    const owner = () => raw(OWNER) || null;
    const switching = () => { try { return JSON.parse(raw(SWITCHING) || 'null'); } catch { return null; } };

    /** 抽屜：IndexedDB（容量比 localStorage 大很多）；測試可換成記憶體版本。 */
    let vault = {
        async open() {
            return new Promise((resolve, reject) => {
                const r = indexedDB.open('ClassManagerAccountVault', 1);
                r.onupgradeneeded = () => r.result.createObjectStore('drawers');
                r.onsuccess = () => resolve(r.result);
                r.onerror = () => reject(r.error || Error('無法開啟本機抽屜'));
            });
        },
        async get(id) { const db = await this.open(); return new Promise((ok, no) => { const q = db.transaction('drawers').objectStore('drawers').get(id); q.onsuccess = () => ok(q.result || null); q.onerror = () => no(q.error); }); },
        async put(id, value) { const db = await this.open(); return new Promise((ok, no) => { const t = db.transaction('drawers', 'readwrite'); t.objectStore('drawers').put(value, id); t.oncomplete = () => ok(); t.onerror = () => no(t.error); t.onabort = () => no(t.error || Error('寫入中止')); }); },
        async keys() { const db = await this.open(); return new Promise((ok, no) => { const q = db.transaction('drawers').objectStore('drawers').getAllKeys(); q.onsuccess = () => ok(q.result || []); q.onerror = () => no(q.error); }); }
    };

    /** 這份資料有沒有實際內容（空白的工作區不需要收，也代表可以直接放進別人的抽屜內容）。 */
    function hasData(entries) {
        return Object.entries(entries).some(([k, v]) => {
            const base = k.replace(/-\d+$/, '');
            if (!['students', 'pointsHistory', 'notebookEntries', 'homeworkList', 'classProfiles'].includes(base)) return false;
            try {
                const parsed = JSON.parse(v);
                // 重新整理後班級名冊一定會自動補上一個「預設班級」：只有它不算有資料，
                // 否則登出再登入會以為這台已經有東西，不去拿抽屜裡真正的班級資料（v3.71.1）
                if (base === 'classProfiles') return Array.isArray(parsed) && parsed.some(p => p && p.id !== 'default');
                return Array.isArray(parsed) ? parsed.length > 0 : !!parsed && Object.keys(parsed).length > 0;
            } catch { return false; }
        });
    }
    function snapshot() { const entries = {}; for (const k of workspaceKeys()) entries[k] = raw(k); return entries; }
    /** 舊版沒有記錄主人：看哪個帳號最近在這台同步過（同步紀錄本來就依帳號分開）。 */
    function lastSyncedUid() {
        let best = null, at = '';
        for (const k of allKeys()) {
            const m = /^cloudSafetyBase:([^:]+):/.exec(k);
            if (!m) continue;
            try { const t = JSON.parse(raw(k))?.at || ''; if (t >= at) { at = t; best = m[1]; } } catch { /* 壞掉的紀錄略過 */ }
        }
        return best;
    }

    async function stash(uid, entries, meta = {}) {
        const id = 'drawer:' + uid, current = await vault.get(id);
        const item = { savedAt: new Date().toISOString(), email: meta.email || '', name: meta.name || '', entries };
        const list = [item, ...((current && current.snapshots) || [])].slice(0, KEEP_SNAPSHOTS);
        await vault.put(id, { uid, snapshots: list });
        const check = await vault.get(id);   // 讀回來確認真的存好，才可以清空
        if (!check?.snapshots?.[0] || JSON.stringify(check.snapshots[0].entries) !== JSON.stringify(entries)) throw Error('抽屜內容核對不符');
    }
    async function drawerOf(uid) { const d = await vault.get('drawer:' + uid); return d?.snapshots?.[0] || null; }
    function replaceWorkspace(entries) {
        for (const k of workspaceKeys()) rawRemove(k);
        for (const [k, v] of Object.entries(entries || {})) if (v != null && !isDeviceKey(k)) rawSet(k, v);
    }

    let pageOwner = owner(), busy = null, lastResult = null;
    const profileOf = () => { try { return window.FirebaseConfig?.getCurrentProfile?.() || {}; } catch { return {}; } };
    const ownerProfile = () => { try { return JSON.parse(raw('workspaceOwnerProfile') || 'null') || {}; } catch { return {}; } };
    function setOwner(uid) {
        if (uid) { rawSet(OWNER, uid); const p = profileOf(); if (p.uid === uid) rawSet('workspaceOwnerProfile', JSON.stringify({ email: p.email || '', name: p.displayName || '' })); }
        else { rawRemove(OWNER); rawRemove('workspaceOwnerProfile'); }
        pageOwner = uid || null;
        window.ClassAwareStorage?.setPageOwner?.(pageOwner);
    }
    function reload() { try { window.location.reload(); } catch { /* 測試環境 */ } }
    /** 換成某位老師後重新整理：讓下一頁接著跑登入後流程（空白時從雲端帶回所有班級）。 */
    function reloadInto(uid) { try { window.sessionStorage.setItem('workspaceAfterSwitch', uid); } catch { /* 無痕模式 */ } reload(); }
    function notify(kind, message) { try { window.NotificationSystem?.[kind]?.(message); } catch { /* 通知失敗不影響切換 */ } }

    /**
     * 換人：收好前一位（from）的資料，拿出下一位（to）的抽屜。from 為 null 表示目前資料沒有主人，收進「未登入」抽屜。
     * 任何一步失敗都放回原本的資料，不清空。
     */
    async function swap(from, to, fromMeta) {
        const before = snapshot(), mark = { from, to, at: new Date().toISOString(), phase: 'stashing' };
        rawSet(SWITCHING, JSON.stringify(mark));
        window.ClassAwareStorage?.setPageOwner?.('__switching__');
        try {
            if (hasData(before)) await stash(from || 'unowned', before, fromMeta);
            const next = to ? await drawerOf(to) : null;
            // 從這裡開始才會清空：中途被關掉時，下次看到 replacing 就知道原本的資料已經在抽屜裡
            rawSet(SWITCHING, JSON.stringify({ ...mark, phase: 'replacing' }));
            try { replaceWorkspace(next?.entries); }
            catch (e) { replaceWorkspace(before); throw e; }
            setOwner(to);
            rawRemove(SWITCHING);
            return { switched: true, restored: !!next, stashed: hasData(before) };
        } catch (error) {
            rawRemove(SWITCHING);
            window.ClassAwareStorage?.setPageOwner?.(pageOwner);
            throw error;
        }
    }

    /**
     * Google 帳號登入（含開頁時記住的登入）時呼叫。回傳 'owned'（可以同步）、'switched'（已換抽屜、即將重新整理）、
     * 'blocked'（無法安全切換，這次不同步）。匿名身分不處理。
     */
    function claim(uid) {
        if (!uid) return Promise.resolve('blocked');
        if (busy) return busy;
        const current = owner();
        if (current === uid && pageOwner === uid && !switching()) return Promise.resolve(lastResult = 'owned');
        const run = (async () => {
            try {
                // 上次切換到一半被關掉。收納階段（stashing）還沒動到資料，照常處理即可；
                // 替換階段（replacing）的資料可能只剩一半，原本的已在抽屜裡：丟掉這份，直接拿這位老師的抽屜
                const pending = switching();
                if (pending) rawRemove(SWITCHING);
                if (pending?.phase === 'replacing') {
                    const mine = await drawerOf(uid);
                    replaceWorkspace(mine?.entries);
                    setOwner(uid);
                    reloadInto(uid);
                    return lastResult = 'switched';
                }
                const entries = snapshot();
                // 其他分頁剛換成這位老師：這頁手上還是前一份資料，重新整理載入正確的那份
                if (current === uid) { reload(); return lastResult = 'switched'; }
                if (!current) {
                    const previous = lastSyncedUid();
                    // 沒有主人、也看不出是誰的（從沒同步過）：照舊由這位老師接手，首次登入時會問要不要上傳
                    if (!hasData(entries)) {
                        if (await drawerOf(uid)) { await swap(null, uid); notify('success', '已拿出你上次收在這台電腦的班級資料'); reloadInto(uid); return lastResult = 'switched'; }
                        setOwner(uid); return lastResult = 'owned';
                    }
                    if (!previous || previous === uid) { setOwner(uid); return lastResult = 'owned'; }
                    // 舊版留下、最後是另一位老師同步的資料：收進那位老師的抽屜
                    await swap(previous, uid, {});
                } else {
                    await swap(current, uid, ownerProfile());
                }
                notify('info', '這台電腦先前登入的是另一位老師，已把對方的班級資料收好；接著載入你的班級');
                reloadInto(uid);
                return lastResult = 'switched';
            } catch (error) {
                console.error('[AccountVault] 無法切換班級資料', error);
                notify('error', '這台電腦存的是另一位老師的班級資料，這次無法安全切換，已暫停雲端同步。請重新整理再試，或先由原本的老師登出。');
                return lastResult = 'blocked';
            }
        })();
        // 沒有用到 await 的情況會同步跑完，所以等 run 結束後才清掉，不能寫在裡面的 finally
        busy = run;
        run.then(() => { if (busy === run) busy = null; });
        return run;
    }

    /** 登出：把自己的資料收進抽屜並清空，下一位使用的人看不到。 */
    async function release() {
        const current = owner();
        if (!current) return 'none';
        try {
            await swap(current, null, ownerProfile());
            return 'released';
        } catch (error) {
            console.error('[AccountVault] 登出時收納失敗', error);
            return 'failed';
        }
    }

    /** 這頁的資料是不是屬於這個帳號（同步前一律要問）。 */
    function owns(uid) {
        return !!uid && !busy && !switching() && owner() === uid && pageOwner === uid;
    }

    // 其他分頁切換了帳號：這頁手上的是前一位老師的資料，不能再寫回去，直接重新整理
    try {
        window.addEventListener('storage', event => {
            if (event.key === OWNER && (event.newValue || null) !== pageOwner) reload();
        });
    } catch { /* 測試環境 */ }

    window.AccountVault = {
        claim, release, owns, isDeviceKey, hasData,
        get owner() { return owner(); },
        _setVault(v) { vault = v; }, _snapshot: snapshot, _lastSyncedUid: lastSyncedUid
    };
})();
