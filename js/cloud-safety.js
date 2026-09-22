/** Immutable class snapshots, published with a Firestore compare-and-swap transaction.
 * Legacy collections remain untouched. Only a complete, verified snapshot becomes current.
 */
(function () {
    'use strict';
    const core = ['students', 'groups', 'pointsHistory'];
    const current = () => localStorage.getItem('currentClassId') || 'default';
    const raw = k => window.ClassAwareStorage?.rawGet ? window.ClassAwareStorage.rawGet(k) : localStorage.getItem(k);
    const globalKeys = ['clockSettings', 'noRepeatLottery', 'examLightMode', 'examAnalogClock', 'examSoundsEnabled', 'homeworkDashboardView', 'theme'];
    const keyFor = (k, id) => id === 'default' || globalKeys.includes(k) ? k : `${k}-${id}`;
    const keys = () => [...new Set([...core, ...(window.ClassAwareStorage?.SHARED_KEYS || []), ...globalKeys])];
    const context = id => {
        const uid = window.FirebaseConfig?.getCurrentUserId();
        const db = window.FirebaseConfig?.getDb();
        if (!uid || !db || !window.FirebaseConfig.isConnected()) throw Error('請先登入 Google 帳號');
        return { uid, db, id: id || current() };
    };
    const sameAccount = c => { if (window.FirebaseConfig.getCurrentUserId() !== c.uid) throw Error('登入帳號已改變，已停止同步'); };
    const root = c => c.id === 'default' ? c.db.collection('users').doc(c.uid) : c.db.collection('users').doc(c.uid).collection('classes').doc(c.id);
    const doc = (c, path) => { const [collection, id] = path.split('/'); return root(c).collection(collection).doc(id); };
    const baseKey = c => `cloudSafetyBase:${c.uid}:${c.id}`;
    const recoveryKey = c => `${c.uid || 'local'}:${c.id}`;
    const fingerprint = values => BackupIntegrity.checksum(JSON.stringify(Object.keys(values).sort().map(k => [k, values[k]])));
    function capture(id = current()) {
        const values = {};
        for (const k of keys()) values[k] = raw(keyFor(k, id));
        for (const k of core) if (values[k] == null) values[k] = '[]';
        return values;
    }
    function dataFor(values) {
        const data = { version: '1.2' };
        for (const k of keys()) if (values[k] != null) {
            try { data[k] = JSON.parse(values[k]); } catch { data[k] = values[k]; }
        }
        return data;
    }
    function ensure(values) {
        if (!BackupIntegrity.validate(dataFor(values))) throw Error('班級資料不完整，已停止同步');
    }
    function base(c) { try { return JSON.parse(raw(baseKey(c)) || 'null'); } catch { return null; } }
    function remember(c, token, values) {
        sameAccount(c);
        localStorage.setItem(baseKey(c), JSON.stringify({ token, fingerprint: fingerprint(values), at: new Date().toISOString() }));
    }
    function conflict(message = '另一台裝置已更新此班，已暫停上傳並保留本機資料。請比較兩份資料後再選擇。') {
        const e = Error(message); e.code = 'sync-conflict'; return e;
    }
    async function legacy(c) {
        const values = Object.fromEntries(keys().map(k => [k, null]));
        const mapping = { students: 'students', groups: 'groups', pointsHistory: 'pointsHistory', notebooks: 'notebookEntries', homeworks: 'homeworkList', lotteryHistory: 'lotteryHistory', classAnnouncements: 'classAnnouncements' };
        let hasData = false;
        await Promise.all(Object.entries(mapping).map(async ([collection, key]) => {
            const snap = await root(c).collection(collection).get({ source: 'server' });
            hasData ||= !snap.empty;
            values[key] = JSON.stringify(snap.docs.map(d => { const { updatedAt, ...item } = d.data(); return { id: d.id, ...item }; }));
        }));
        const settings = { 'appSettings/pets': 'petSettings', 'appSettings/seating': 'seatingConfig', 'examData/subjects': 'examSubjects', 'examData/reminders': 'examReminders', 'examData/attendance': 'examAttendance', 'examData/absenceRecords': 'examAbsenceRecords', 'examData/dayPresets': 'examDayPresets' };
        await Promise.all(Object.entries(settings).map(async ([path, key]) => {
            const setting = await doc(c, path).get({ source: 'server' });
            if (setting.exists && setting.data().data != null) { values[key] = JSON.stringify(setting.data().data); hasData = true; }
        }));
        const checks = await root(c).collection('homeworkChecks').get({ source: 'server' });
        const lottery = await doc(c, 'appSettings/lottery').get({ source: 'server' });
        if (!checks.empty) { values.homeworkChecks = JSON.stringify(Object.fromEntries(checks.docs.map(d => [d.id, d.data().checks || {}]))); hasData = true; }
        if (lottery.exists) {
            if (lottery.data().drawnStudentIds) values.drawnStudentIds = JSON.stringify(lottery.data().drawnStudentIds);
            if (lottery.data().noRepeatLottery != null) values.noRepeatLottery = String(lottery.data().noRepeatLottery);
        }
        const [clock, prefs] = await Promise.all(['clock', 'uiPrefs'].map(k => doc(c, 'appSettings/' + k).get({ source: 'server' })));
        if (clock.exists) { const { updatedAt, ...settings } = clock.data(); values.clockSettings = JSON.stringify(settings); }
        if (prefs.exists) for (const k of globalKeys.filter(k => !['clockSettings','noRepeatLottery'].includes(k))) if (prefs.data()[k] != null) values[k] = String(prefs.data()[k]);
        return { values, token: `legacy:${fingerprint(values)}`, empty: !hasData };
    }
    async function read(id = current()) {
        if (navigator.onLine === false) throw Error('目前離線，請恢復連線後再讀取雲端');
        const c = context(id), ref = doc(c, 'appSettings/syncRevision');
        const snap = await ref.get({ source: 'server' });
        if (!snap.exists) {
            const old = await legacy(c);
            // A new client may have published while the legacy collections were read.
            if ((await ref.get({ source: 'server' })).exists) return read(id);
            sameAccount(c); return { ...old, uid: c.uid, classId: c.id };
        }
        const head = snap.data();
        if (head.schema !== 1 || !Number.isSafeInteger(head.count) || head.count < 1 || head.count > 200) throw Error('雲端版本格式無法讀取，未還原');
        const parts = await Promise.all(Array.from({ length: head.count }, (_, i) => root(c).collection('syncSnapshots').doc(head.token).collection('parts').doc(String(i)).get({ source: 'server' })));
        if (parts.some((p, i) => !p.exists || p.data().index !== i || typeof p.data().text !== 'string')) throw Error('雲端備份分段不完整，未還原');
        const json = parts.map(p => p.data().text).join('');
        if (BackupIntegrity.checksum(json) !== head.checksum) throw Error('雲端備份完整性檢查失敗，未還原');
        const payload = JSON.parse(json); ensure(payload.values);
        if (payload.classId !== c.id) throw Error('雲端班級不符，未還原');
        sameAccount(c);
        return { values: payload.values, token: head.token, uid: c.uid, classId: c.id, at: head.at, empty: false };
    }
    async function publish(id = current(), options = {}) {
        if (navigator.onLine === false) throw Error('已存本機，恢復連線後再同步');
        const c = context(id), values = capture(id); ensure(values);
        const remote = options.remote || await read(id), known = base(c);
        const expected = Object.hasOwn(options, 'expectedToken') ? options.expectedToken : known?.token;
        if (!remote.empty && expected !== remote.token) throw conflict();
        const before = fingerprint(values);
        if (expected === remote.token && before === fingerprint(remote.values)) { remember(c, remote.token, values); return true; }
        const token = crypto.randomUUID(), json = JSON.stringify({ schema: 1, classId: id, values });
        const parts = BackupIntegrity.split(json, 60000), count = parts.length;
        if (count > 200) throw Error('資料量超過單次同步範圍，請先匯出 Excel 保存');
        // Stage immutable parts. Interrupted/conflicting attempts cannot replace the current head.
        for (let start = 0; start < count; start += 20) {
            const batch = c.db.batch();
            for (let i = start; i < Math.min(start + 20, count); i++) batch.set(root(c).collection('syncSnapshots').doc(token).collection('parts').doc(String(i)), { index: i, text: parts[i] });
            await batch.commit();
        }
        sameAccount(c);
        const ref = doc(c, 'appSettings/syncRevision');
        await c.db.runTransaction(async tx => {
            const latest = await tx.get(ref);
            if ((latest.exists ? latest.data().token : remote.token) !== remote.token) throw conflict();
            tx.set(ref, { schema: 1, token, previous: latest.exists ? latest.data().token : null, count, checksum: BackupIntegrity.checksum(json), at: new Date().toISOString(), students: dataFor(values).students.length, pointsHistory: dataFor(values).pointsHistory.length });
        });
        remember(c, token, values);
        localStorage.setItem('lastSyncTime', new Date().toISOString());
        delete conflicts[recoveryKey(c)];
        // Changes made during upload retain a different fingerprint and remain pending.
        window.SyncStatusIndicator?.updateStateBasedOnSync();
        return true;
    }
    async function checkpoint(id = current()) {
        const uid = window.FirebaseConfig?.getCurrentUserId() || 'local';
        const value = { version: '1.2', classId: id, exportDate: new Date().toISOString(), ...dataFor(capture(id)) };
        await window.LocalRecovery.put(`${uid}:${id}`, value);
    }
    async function restore(remote) {
        const c = context(remote.classId);
        if (c.uid !== remote.uid) throw Error('登入帳號已改變，未還原');
        ensure(remote.values);
        const before = fingerprint(capture(c.id));
        await checkpoint(c.id);
        sameAccount(c);
        if (fingerprint(capture(c.id)) !== before) throw Error('備份期間本機資料已改變，請重新預覽還原');
        const ops = keys().map(k => [keyFor(k, c.id), remote.values[k] ?? null]);
        ops.push([baseKey(c), JSON.stringify({ token: remote.token, fingerprint: fingerprint(remote.values), at: new Date().toISOString() })]);
        if (!window.SafeStorage.writeRaw(ops, { context: '完整還原班級資料' })) return false;
        if (current() === c.id) {
            const data = dataFor(remote.values);
            for (const k of ['students', 'groups', 'pointsHistory', 'notebookEntries', 'homeworkList', 'lotteryHistory']) window[k] = data[k] || [];
            window.homeworkChecks = data.homeworkChecks || {};
            for (const fn of ['renderStudents', 'renderGroups', 'renderNotebook', 'renderHomework', 'renderLotteryHistory']) if (typeof window[fn] === 'function') window[fn]();
            window.ClassPets?.prepare(); window.ClassPets?.render();
        }
        delete conflicts[recoveryKey(c)];
        return true;
    }
    const conflicts = {};
    function status(id = current()) {
        try {
            const c = context(id);
            if (conflicts[recoveryKey(c)]) return 'conflict';
            return base(c)?.fingerprint === fingerprint(capture(id)) ? 'synced' : 'pending';
        } catch { return 'offline'; }
    }
    function download(data, name) {
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    async function showConflict(id = current()) {
        const c = context(id), remote = await read(id), localValues = capture(id), local = dataFor(localValues);
        const previewFingerprint = fingerprint(localValues);
        const checkPreview = () => { sameAccount(c); if (current() !== id || fingerprint(capture(id)) !== previewFingerprint) throw Error('班級或本機資料已改變，請關閉後重新比較'); };
        const dialog = document.createElement('dialog'); dialog.className = 'cloud-conflict';
        const header = document.createElement('div'); header.className = 'cloud-conflict-header';
        const title = document.createElement('h2'); title.textContent = '先保留成果，再處理同步差異';
        const dismiss = () => { dialog.close(); dialog.remove(); };
        const closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.className = 'cloud-conflict-close'; closeButton.textContent = '關閉'; closeButton.setAttribute('aria-label', '關閉同步衝突視窗'); closeButton.title = '關閉視窗，稍後再處理'; closeButton.onclick = dismiss;
        header.append(title, closeButton);
        const text = document.createElement('p'); text.textContent = `本機：${local.students.length} 位學生、${local.pointsHistory.length} 筆紀錄；雲端：${dataFor(remote.values).students.length} 位學生、${dataFor(remote.values).pointsHistory.length} 筆紀錄。兩邊可能有不同的獎勵或兌換，系統不會自動合併金幣。請依照下方 3 個步驟處理。`;
        const note = document.createElement('p'); note.className = 'cloud-conflict-note'; note.setAttribute('role', 'status');
        const steps = document.createElement('ol'); steps.className = 'cloud-conflict-steps';
        const step1 = document.createElement('li'); step1.textContent = '下載兩份備份，先把成果留在電腦裡。';
        const step2 = document.createElement('li'); step2.textContent = '勾選已下載，確認你要保留的版本。';
        const step3 = document.createElement('li'); step3.textContent = '選擇本機或雲端版本繼續使用。';
        steps.append(step1, step2, step3);
        const backupTitle = document.createElement('h3'); backupTitle.textContent = '步驟 1｜先下載備份'; backupTitle.className = 'cloud-conflict-section-title';
        const backupActions = document.createElement('div'); backupActions.className = 'cloud-conflict-actions cloud-conflict-backups';
        const decisionTitle = document.createElement('h3'); decisionTitle.textContent = '步驟 3｜選擇要保留的版本'; decisionTitle.className = 'cloud-conflict-section-title';
        const actions = document.createElement('div'); actions.className = 'cloud-conflict-actions cloud-conflict-decisions'; let localDownloaded = false, cloudDownloaded = false, backedUp = false;
        const button = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = async () => { b.disabled = true; try { await fn(); } catch (e) { note.textContent = e.message; } finally { b.disabled = false; } }; actions.append(b); return b; };
        const localButton = button('下載本機備份', () => { download({ ...local, exportDate: new Date().toISOString() }, '班級成果_本機.json'); localDownloaded = true; localButton.textContent = '✓ 本機備份已下載'; localButton.classList.add('is-done'); updateDecisions(); });
        const cloudButton = button('下載雲端備份', () => { download({ ...dataFor(remote.values), exportDate: remote.at || new Date().toISOString() }, '班級成果_雲端.json'); cloudDownloaded = true; cloudButton.textContent = '✓ 雲端備份已下載'; cloudButton.classList.add('is-done'); updateDecisions(); });
        backupActions.append(localButton, cloudButton);
        const ackTitle = document.createElement('h3'); ackTitle.textContent = '步驟 2｜確認備份'; ackTitle.className = 'cloud-conflict-section-title';
        const ack = document.createElement('label'); ack.className = 'cloud-conflict-ack'; const check = document.createElement('input'); check.type = 'checkbox'; check.onchange = () => { backedUp = check.checked; updateDecisions(); }; ack.append(check, ' 我已確認兩份備份已下載，並選好要保留的版本');
        const decisionHelp = document.createElement('p'); decisionHelp.className = 'cloud-conflict-help'; decisionHelp.textContent = '完成前兩步後，下面的選項才會開啟。';
        const keepLocal = button('保留本機並上傳', async () => { checkPreview(); await publish(id, { expectedToken: remote.token }); note.textContent = '已保留本機並同步'; dialog.close(); dialog.remove(); });
        const keepCloud = button('使用雲端並保留本機副本', async () => { checkPreview(); if (await restore(remote)) { note.textContent = '已還原雲端；原本機資料已保留在還原前副本'; dialog.close(); dialog.remove(); } });
        actions.append(keepLocal, keepCloud);
        const updateDecisions = () => { const ready = localDownloaded && cloudDownloaded && backedUp; keepLocal.disabled = !ready; keepCloud.disabled = !ready; decisionHelp.textContent = ready ? '已完成確認，請選擇要繼續使用的版本。' : '請先下載本機與雲端備份，再勾選上方確認框。'; decisionHelp.classList.toggle('is-ready', ready); };
        updateDecisions();
        const cancel = button('關閉，稍後處理', dismiss); cancel.className = 'cloud-conflict-cancel';
        dialog.append(header, text, steps, backupTitle, backupActions, ackTitle, ack, decisionTitle, decisionHelp, actions, cancel, note); document.body.append(dialog); dialog.showModal(); dialog.addEventListener('cancel', () => dialog.remove());
    }
    function report(error, id, silent) {
        if (error.code === 'sync-conflict') {
            conflicts[recoveryKey(context(id))] = true;
            window.SyncStatusIndicator?.setState('conflict');
            if (!silent) return showConflict(id);
        } else window.SyncStatusIndicator?.setState('error');
        if (!silent) window.NotificationSystem?.error(error.message);
    }
    async function downloadRecovery() {
        try {
            const uid = window.FirebaseConfig?.getCurrentUserId() || 'local';
            const copy = await LocalRecovery.get(`${uid}:${current()}`);
            if (!copy) throw Error('此班目前沒有還原前副本');
            download(copy, '班級成果_還原前副本.json');
        } catch (e) { window.NotificationSystem?.error(e.message); }
    }
    window.CloudSafety = { downloadRecovery, capture, dataFor, fingerprint, read, publish, restore, checkpoint, status, showConflict, report, current, download };
    // A separate IndexedDB keeps the rollback copy out of localStorage's small quota.
    window.LocalRecovery = {
        async access(mode, key, value) {
            const db = await new Promise((resolve, reject) => { const r = indexedDB.open('ClassManagerRecovery', 1); r.onupgradeneeded = () => r.result.createObjectStore('copies'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(Error('無法保存還原前副本，已停止還原')); });
            try { return await new Promise((resolve, reject) => { const tx = db.transaction('copies', mode), store = tx.objectStore('copies'); const r = mode === 'readwrite' ? store.put(value, key) : store.get(key); tx.oncomplete = () => resolve(r.result); tx.onerror = tx.onabort = () => reject(Error('還原前副本未存妥，已停止還原')); }); } finally { db.close(); }
        },
        put(key, value) { return this.access('readwrite', key, value); },
        get(key) { return this.access('readonly', key); }
    };
})();
