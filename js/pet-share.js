/**
 * 班級寵物分享（老師端）
 *
 * 把目前班級的寵物狀態整理成「去識別化快照」發布到 Firestore petShares/{分享碼}，
 * 學生拿到連結後在 pets.html 免登入檢視與互動。快照不含分數、加扣分原因與學生內部編號。
 * 分享清單直接查詢雲端（ownerUid == 老師本人），不寫入 petSettings，不影響班級同步。
 */
(function () {
    'use strict';
    const COLLECTION = 'petShares', SCHEMA = 1, MAX_PAYLOAD = 180000;
    const INDEX_KEY = 'petShareIndex', PUBLISHED_KEY = 'petSharePublished', PREVIEW_KEY = 'petSharePreview';
    const NAME_MODES = { masked: '座號＋遮罩姓名（例：王○明）', full: '座號＋完整姓名', seat: '只顯示座號' };
    const QR_SCRIPT = (document.currentScript?.src ? new URL('vendor/', document.currentScript.src).href : 'js/vendor/') + 'qrcode-generator.js?v=1.4.4';

    const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
    const button = (text, action, cls) => { const b = el('button', text, cls); b.type = 'button'; b.addEventListener('click', action); return b; };
    const cid = () => localStorage.getItem('currentClassId') || 'default';
    const className = () => window.ClassProfiles?.currentProfile?.()?.name || '預設班級';
    const uid = () => window.FirebaseConfig?.getCurrentUserId?.() || null;
    const db = () => window.FirebaseConfig?.getDb?.() || null;
    const isTeacher = () => !!(window.FirebaseConfig?.isGoogleUser?.() && uid() && db());
    const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
    const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };

    function hash(text) {
        // 兩組種子的 FNV-1a；只用來比對快照有無變動與產生匿名鍵，不作安全用途。
        let a = 0x811c9dc5, b = 0x01000193;
        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            a = Math.imul(a ^ code, 0x01000193); b = Math.imul(b ^ code, 0x85ebca6b);
        }
        return (a >>> 0).toString(36) + (b >>> 0).toString(36);
    }
    function maskName(name) {
        const chars = Array.from(String(name || '').trim());
        if (chars.length <= 1) return chars.join('');
        if (chars.length === 2) return chars[0] + '○';
        return chars[0] + '○'.repeat(Math.min(chars.length - 2, 2)) + chars[chars.length - 1];
    }
    function day(value) {
        return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString().slice(0, 10) : null;
    }
    /** 純函式：只挑出學生頁需要的欄位。新增欄位前請確認它適合公開給拿到連結的人。 */
    function buildPayload(source, options = {}) {
        const P = window.ClassPets, { students = [], pointsHistory = [], config = {}, classId = 'default' } = source;
        const nameMode = Object.hasOwn(NAME_MODES, options.nameMode) ? options.nameMode : 'masked';
        const showCoins = !!options.showCoins;
        const payload = {
            v: SCHEMA, className: String(source.className || '').slice(0, 40), nameMode,
            students: students.map(s => {
                const xp = P.xpFor(s.id, pointsHistory, Number(s.petCarryXp) || 0), hatched = xp >= 10;
                const entry = {
                    key: hash(classId + ':' + s.id),
                    seat: String(s.number || s.seatNumber || '').slice(0, 12),
                    name: nameMode === 'full' ? String(s.name || '').slice(0, 30) : nameMode === 'masked' ? maskName(s.name) : '',
                    xp,
                    // 尚未孵化的蛋不透露種類，保留盲盒驚喜。
                    kind: hatched ? (Object.hasOwn(P.pets, s.classPet) ? s.classPet : 'cat') : null,
                    mood: hatched && Object.hasOwn(P.moods, s.classPetMood) ? s.classPetMood : 'normal',
                    nick: String(s.petNickname || '').slice(0, 20),
                    maxLevel: Math.max(P.stage(xp).level, Number(s.petMaxLevel) || 0),
                    hatchedAt: hatched ? day(s.petHatchedAt) : null,
                };
                if (showCoins) entry.coins = P.coinsFor(s.id, pointsHistory, Number(s.petCarryCoins) || 0);
                return entry;
            }),
            collection: Object.fromEntries(Object.entries(P.collectionFor(students, pointsHistory, config))
                .map(([kind, found]) => [kind, { maxLevel: found.maxLevel, discoveredAt: day(found.discoveredAt) }])),
            quests: (config.quests || []).filter(q => !q.claimedAt && !q.archivedAt).map(q => ({
                name: String(q.name || '').slice(0, 40), target: q.target, progress: Math.min(q.target, Math.max(0, P.questProgress(q))),
                startDate: q.startDate || '', endDate: q.endDate || '' })),
            questsDone: (config.quests || []).filter(q => q.claimedAt).length,
            eggs: (config.collectionEggs || []).map(egg => ({ kind: Object.hasOwn(P.pets, egg.kind) ? egg.kind : null, from: String(egg.questName || '').slice(0, 40) })),
        };
        if (showCoins) payload.products = (config.products || []).filter(p => p.active).map(p => ({ name: String(p.name || '').slice(0, 40), cost: p.cost }));
        return payload;
    }

    // 分享清單快取：{ uid, shares: { [classId]: { id, className, nameMode, showCoins, updatedAt } } }
    let index = readJson(INDEX_KEY, { uid: null, shares: {} });
    // verified：本次開啟已向雲端確認過分享清單。未確認前只顯示快取、不寫入，避免把已停止的連結又建立回來。
    let loadState = 'idle', loadedFor = null, verified = false, panel = null, notice = '', working = false, publishing = false, queued = false, timer;
    let draft = { nameMode: 'masked', showCoins: false };
    const sessionBaseline = new Map();
    const shares = () => index.uid === uid() ? index.shares : {};
    const current = () => shares()[cid()] || null;
    const saveIndex = () => writeJson(INDEX_KEY, index);
    const shareUrl = id => new URL('pets.html?s=' + encodeURIComponent(id), location.href).href;
    // 班級切換會整頁重新載入；仍再確認記憶體資料確實屬於目前班級，避免把別班名單發布出去。
    const dataReady = () => Array.isArray(window.students) && !!window.ClassPets &&
        (window.STUDENTS_KEY || 'students') === (cid() === 'default' ? 'students' : 'students-' + cid());
    const source = () => ({ students: window.students, pointsHistory: window.pointsHistory || [], config: window.ClassPets.settings(), className: className(), classId: cid() });
    function randomId() {
        const bytes = crypto.getRandomValues(new Uint8Array(18));
        return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
    }
    function say(message) { notice = message || ''; paint(); }
    function describe(error) {
        if (error?.code === 'permission-denied') return '雲端拒絕這次操作：這個連結可能屬於另一個帳號，或雲端規則尚未更新。請重新產生連結，或稍後再試。';
        if (error?.code === 'unavailable' || navigator.onLine === false) return '目前離線，恢復連線後再試一次。';
        return '這次操作沒有完成，請稍後再試。';
    }
    function logUsage(action) {
        try { window.UsageNotify?.pet?.('settings', { classId: cid(), className: className(), action }); } catch { /* 通知不能阻擋主流程 */ }
    }

    async function refresh() {
        if (!isTeacher() || loadState === 'loading') return;
        const owner = uid(); loadState = 'loading'; verified = false; paint();
        try {
            const snap = await db().collection(COLLECTION).where('ownerUid', '==', owner).get({ source: 'server' });
            const found = {};
            snap.forEach(doc => {
                const data = doc.data(), at = data.updatedAt?.toMillis?.() || 0;
                const entry = { id: doc.id, className: data.className || '', nameMode: data.nameMode, showCoins: !!data.showCoins, updatedAt: at };
                const newest = found[data.classId];
                // 兩台裝置同時替同一班建立連結時，較舊的那個仍列在清單裡，讓老師看得到也停得掉。
                if (newest && newest.updatedAt >= at) found['dup:' + doc.id] = { ...entry, className: entry.className + '（較舊的連結）' };
                else {
                    if (newest) found['dup:' + newest.id] = { ...newest, className: newest.className + '（較舊的連結）' };
                    found[data.classId] = entry;
                }
            });
            if (owner !== uid()) { loadState = 'idle'; return; }
            index = { uid: owner, shares: found }; saveIndex();
            loadState = 'ready'; loadedFor = owner; verified = true;
        } catch (error) {
            console.warn('[PetShare] 讀取分享清單失敗', error);
            // 離線時沿用上次快取，讓老師仍能複製既有連結。
            loadState = index.uid === owner ? 'ready' : 'error'; loadedFor = owner;
        }
        paint(); changed();
    }

    async function publish({ force = false } = {}) {
        const share = current();
        if (!share || !verified || !isTeacher() || !dataReady()) return false;
        const payload = JSON.stringify(buildPayload(source(), share));
        if (payload.length > MAX_PAYLOAD) { say('這個班級的寵物資料超過分享上限，暫時無法更新學生頁。'); return false; }
        const digest = hash(payload), published = readJson(PUBLISHED_KEY, {});
        // 這台裝置沒發布過這個連結時，以開啟當下的資料為基準：只有之後真的變動才送出，
        // 避免一台尚未同步的舊裝置一打開就蓋掉學生頁上較新的狀態。
        if (!published[share.id] && !sessionBaseline.has(share.id)) sessionBaseline.set(share.id, digest);
        if (!force && digest === (published[share.id] || sessionBaseline.get(share.id))) return true;
        if (publishing) { queued = true; return false; }
        publishing = true;
        try {
            await db().collection(COLLECTION).doc(share.id).set({
                ownerUid: uid(), classId: cid(), className: className().slice(0, 80), nameMode: share.nameMode, showCoins: !!share.showCoins,
                schema: SCHEMA, payload, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            published[share.id] = digest; writeJson(PUBLISHED_KEY, published);
            share.updatedAt = Date.now(); share.className = className(); saveIndex();
            if (notice.startsWith('學生頁更新失敗')) notice = '';
            paint();
            return true;
        } catch (error) {
            console.warn('[PetShare] 更新學生頁失敗', error);
            say('學生頁更新失敗：' + describe(error));
            return false;
        } finally {
            publishing = false;
            if (queued) { queued = false; changed(); }
        }
    }
    /** ClassPets 每次重畫後呼叫；稍等一下再比對，連續加分只會送出最後一次。 */
    function changed() {
        clearTimeout(timer);
        if (!current() || !verified || !isTeacher()) return;
        timer = setTimeout(() => { if (navigator.onLine !== false) publish(); }, 2500);
    }

    async function run(task) {
        if (working) return;
        working = true; paint();
        try { await task(); } catch (error) { console.warn('[PetShare]', error); notice = describe(error); }
        finally { working = false; paint(); }
    }
    function create(options) {
        return run(async () => {
            if (!dataReady()) { notice = '班級資料尚未準備好，請重新整理後再試。'; return; }
            const owner = uid(), classId = cid(), share = { id: randomId(), className: className(), nameMode: options.nameMode, showCoins: !!options.showCoins, updatedAt: 0 };
            if (index.uid !== owner) index = { uid: owner, shares: {} };
            index.shares[classId] = share;
            if (await publish({ force: true })) { notice = '✓ 分享連結已建立，複製後傳給本班學生與家長。'; logUsage('建立寵物分享連結'); }
            else delete index.shares[classId];
            saveIndex();
        });
    }
    async function remove(classId) {
        const share = shares()[classId]; if (!share) return;
        await db().collection(COLLECTION).doc(share.id).delete();
        delete index.shares[classId]; saveIndex();
        const published = readJson(PUBLISHED_KEY, {}); delete published[share.id]; writeJson(PUBLISHED_KEY, published);
        sessionBaseline.delete(share.id);
    }
    function stop(classId) {
        return run(async () => {
            const name = shares()[classId]?.className || '這個班級';
            if (!await confirmShare(`停止分享「${name}」的寵物頁？\n連結會立即失效，學生將無法再開啟；班級資料與寵物不受影響。`)) return;
            await remove(classId); notice = '已停止分享，原連結已失效。'; logUsage('停止寵物分享');
        });
    }
    function regenerate() {
        return run(async () => {
            const old = current(); if (!old) return;
            if (!await confirmShare('重新產生連結？\n舊連結會立即失效，需要把新連結再傳給學生一次。')) return;
            const options = { nameMode: old.nameMode, showCoins: old.showCoins };
            await remove(cid());
            index.shares[cid()] = { id: randomId(), className: className(), ...options, updatedAt: 0 };
            if (await publish({ force: true })) { notice = '✓ 已產生新連結，舊連結已失效。'; logUsage('重新產生寵物分享連結'); }
            else delete index.shares[cid()];
            saveIndex();
        });
    }
    function updateOptions(changes) {
        const share = current();
        if (!share) { draft = { ...draft, ...changes }; paint(); return; }
        return run(async () => {
            const before = { nameMode: share.nameMode, showCoins: share.showCoins };
            Object.assign(share, changes);
            if (await publish({ force: true })) { saveIndex(); notice = '✓ 顯示設定已更新，學生重新整理後生效。'; }
            else Object.assign(share, before);
        });
    }
    function preview() {
        if (!dataReady()) return say('班級資料尚未準備好，請重新整理後再試。');
        const options = current() || draft;
        if (!writeJson(PREVIEW_KEY, { at: Date.now(), payload: buildPayload(source(), options) })) return say('瀏覽器儲存空間不足，無法開啟預覽。');
        window.open(new URL('pets.html?preview=1', location.href).href, '_blank', 'noopener');
    }
    async function copy(text, done) {
        try { await navigator.clipboard.writeText(text); }
        catch {
            const field = el('textarea'); field.value = text; field.style.cssText = 'position:fixed;opacity:0';
            document.body.append(field); field.select();
            try { document.execCommand('copy'); } finally { field.remove(); }
        }
        say(done);
    }
    // QR Code 函式庫（qrcode-generator，MIT）只在老師第一次按下按鈕時才載入。
    let qrLoading = null;
    function loadQr() {
        if (window.qrcode) return Promise.resolve(window.qrcode);
        qrLoading ||= new Promise((resolve, reject) => {
            const script = el('script'); script.src = QR_SCRIPT;
            script.onload = () => window.qrcode ? resolve(window.qrcode) : reject(new Error('qrcode unavailable'));
            script.onerror = () => { qrLoading = null; script.remove(); reject(new Error('qrcode load failed')); };
            document.head.append(script);
        });
        return qrLoading;
    }
    /** 畫成一張可投影、下載或列印的卡片；一律白底黑碼，深色模式也不反轉，確保掃得到。 */
    function drawQrCard(make, url, name) {
        const qr = make(0, 'M'); qr.addData(url); qr.make();
        const count = qr.getModuleCount(), quiet = 4, cell = Math.floor(720 / (count + quiet * 2)), size = cell * (count + quiet * 2);
        const canvas = el('canvas'); canvas.width = 900; canvas.height = 1140;
        const ctx = canvas.getContext('2d'), fonts = 'system-ui, "Microsoft JhengHei", "Noto Sans TC", sans-serif';
        const line = (text, y, px, weight, color) => {
            // 班級名稱長短不一，超出寬度就縮小字級。
            do { ctx.font = `${weight} ${px}px ${fonts}`; px -= 2; } while (ctx.measureText(text).width > 800 && px > 18);
            ctx.fillStyle = color; ctx.fillText(text, 450, y);
        };
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        line(`${name}的寵物樂園`, 96, 60, 800, '#172033');
        line('用手機或平板掃描，回家也能看全班的寵物', 176, 32, 500, '#475569');
        const left = (canvas.width - size) / 2, top = 236;
        ctx.fillStyle = '#000';
        for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) {
            if (qr.isDark(row, col)) ctx.fillRect(left + (col + quiet) * cell, top + (row + quiet) * cell, cell, cell);
        }
        line('班級小管家 · 班級寵物', top + size + 60, 28, 500, '#64748b');
        canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${name}寵物分享連結的 QR Code`);
        return canvas;
    }
    async function showQr(url, name) {
        let make;
        try { make = await loadQr(); } catch (error) { console.warn('[PetShare]', error); return say('QR Code 元件載入失敗，請確認網路連線後再試一次。'); }
        const canvas = drawQrCard(make, url, name);
        const dialog = el('dialog', undefined, 'pet-qr'), title = el('h3', `${name}・寵物分享 QR Code`);
        title.id = 'pet-qr-title'; dialog.setAttribute('aria-labelledby', title.id);
        const close = () => { dialog.close(); dialog.remove(); };
        const download = () => canvas.toBlob(blob => {
            const link = el('a'); link.href = URL.createObjectURL(blob);
            link.download = `${name.replace(/[\\/:*?"<>|]/g, '')}-寵物分享QRCode.png`;
            link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        }, 'image/png');
        const print = () => {
            // 用隱藏框架只列印這張卡片，不受主畫面版面影響。
            const frame = el('iframe'); frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden'; frame.setAttribute('aria-hidden', 'true');
            document.body.append(frame);
            const image = frame.contentDocument.createElement('img');
            image.style.cssText = 'display:block;width:100%;max-width:150mm;margin:0 auto';
            image.onload = () => { frame.contentWindow.onafterprint = () => frame.remove(); frame.contentWindow.focus(); frame.contentWindow.print(); };
            frame.contentDocument.body.style.margin = '0'; frame.contentDocument.body.append(image);
            image.src = canvas.toDataURL('image/png');
        };
        const zoom = button('放大投影', () => {
            const projected = dialog.classList.toggle('is-projected');
            zoom.textContent = projected ? '縮小' : '放大投影'; zoom.setAttribute('aria-pressed', String(projected));
        });
        zoom.setAttribute('aria-pressed', 'false');
        const actions = el('div', undefined, 'pet-tools');
        actions.append(button('下載圖片', download, 'pet-primary'), button('列印', print), zoom, button('關閉', close));
        dialog.append(title, canvas, el('p', '投影在教室讓學生掃描，或下載後貼到聯絡簿、班級群組。重新產生連結後，舊的 QR Code 會跟著失效。'), actions);
        dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
        document.body.append(dialog); dialog.showModal(); actions.querySelector('button').focus();
    }
    function confirmShare(message) {
        return new Promise(resolve => {
            const dialog = el('dialog', undefined, 'pet-confirm'), title = el('h3', '確認分享設定');
            title.id = 'pet-share-confirm-title'; dialog.setAttribute('aria-labelledby', title.id);
            const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
            const actions = el('div', undefined, 'pet-tools');
            actions.append(button('取消', () => finish(false)), button('確定', () => finish(true), 'pet-primary'));
            dialog.append(title, el('p', message), actions);
            dialog.addEventListener('cancel', e => { e.preventDefault(); finish(false); });
            document.body.append(dialog); dialog.showModal(); actions.querySelector('button').focus();
        });
    }

    function optionControls(options) {
        const box = el('div', undefined, 'pet-share-options');
        const nameLabel = el('label', '學生頁的姓名顯示'), select = el('select');
        Object.entries(NAME_MODES).forEach(([value, label]) => select.add(new Option(label, value)));
        select.value = options.nameMode; select.disabled = working || !verified; select.dataset.petFocus = 'share-name-mode';
        select.addEventListener('change', () => updateOptions({ nameMode: select.value }));
        nameLabel.append(select);
        const coinLabel = el('label', undefined, 'pet-share-check'), check = el('input');
        check.type = 'checkbox'; check.checked = !!options.showCoins; check.disabled = working || !verified; check.dataset.petFocus = 'share-coins';
        check.addEventListener('change', () => updateOptions({ showCoins: check.checked }));
        coinLabel.append(check, el('span', '同時顯示每位同學的金幣餘額與商店獎勵'));
        box.append(nameLabel, coinLabel);
        return box;
    }
    function paint() {
        if (!panel?.isConnected) return;
        const share = current(), others = Object.entries(shares()).filter(([classId]) => classId !== cid());
        const summary = el('summary');
        summary.append(el('strong', '🔗 分享給學生：回家也能看寵物'), el('span', !isTeacher() ? '登入後可用' : share ? '分享中' : '尚未分享', 'pet-share-state' + (share ? ' is-on' : '')));
        const body = el('div', undefined, 'pet-share-body');
        body.append(el('p', '建立本班專屬連結，學生在家免登入就能看到全班的寵物、和寵物互動，並看見自己離下一次進化還差多少。'));
        if (!isTeacher()) {
            body.append(el('p', '分享連結需要老師的 Google 帳號，才能確保只有您能更新或停止本班的分享。', 'pet-share-note'));
            if (window.GoogleAuthUI?.login) body.append(button('用 Google 帳號登入', async () => { await window.GoogleAuthUI.login(); window.ClassPets?.render?.(); }, 'pet-primary'));
        } else if (index.uid !== uid() && loadState !== 'error') {
            body.append(el('p', '正在讀取分享狀態…', 'pet-share-note'));
        } else if (index.uid !== uid()) {
            body.append(el('p', '無法讀取分享狀態，請確認網路連線。', 'pet-share-note'), button('重新讀取', refresh));
        } else {
            if (!verified && loadState !== 'loading') body.append(el('p', '目前無法連上雲端，以下是這台裝置上次記錄的分享狀態；恢復連線後才能更新或變更。', 'pet-share-note'), button('重新讀取', refresh));
            if (share) {
                const row = el('div', undefined, 'pet-share-link'), field = el('input');
                field.readOnly = true; field.value = shareUrl(share.id); field.setAttribute('aria-label', '本班寵物分享連結');
                field.addEventListener('focus', () => field.select());
                row.append(field, button('複製連結', () => copy(field.value, '✓ 連結已複製，可貼到班級群組或聯絡簿。'), 'pet-primary'), button('顯示 QR Code', () => showQr(field.value, className())));
                if (navigator.share) row.append(button('分享到 App', () => navigator.share({ title: className() + '的寵物樂園', text: '來看看我們班的寵物！', url: field.value }).catch(() => {})));
                row.append(button('開啟學生頁', () => window.open(field.value, '_blank', 'noopener')));
                body.append(row, el('p', share.updatedAt ? '學生頁最後更新：' + new Date(share.updatedAt).toLocaleString('zh-TW', { hour12: false }) + '。加分、孵化或升級後會自動更新。' : '學生頁正在建立中…', 'pet-share-note'));
            }
            body.append(optionControls(share || draft));
            const actions = el('div', undefined, 'pet-tools');
            if (share) actions.append(button('立即更新學生頁', () => run(async () => { if (await publish({ force: true })) notice = '✓ 學生頁已更新。'; })), button('重新產生連結', regenerate), button('停止分享', () => stop(cid())));
            else actions.append(button('建立本班分享連結', () => create(draft), 'pet-primary'));
            actions.append(button('預覽學生看到的畫面', preview));
            for (const control of actions.children) control.disabled = working || (!verified && control !== actions.lastChild);
            body.append(actions);
            const privacy = el('details', undefined, 'pet-share-privacy'); privacy.dataset.petKey = 'share-privacy';
            privacy.append(el('summary', '學生頁會顯示什麼？'),
                el('p', '會顯示：座號與姓名（依上方設定）、寵物種類與等級、成長值、寵物暱稱、全班圖鑑、共同任務進度與收藏蛋。尚未孵化的蛋不會透露種類。'),
                el('p', '不會顯示：班級分數、加扣分原因與紀錄、作業、聯絡簿及其他任何班級資料。學生頁只能觀看與互動，無法修改成長值或金幣。'),
                el('p', '拿到連結的人都能開啟，請只傳給本班學生與家長；若連結外流，按「重新產生連結」即可讓舊連結失效。'));
            body.append(privacy);
            if (others.length) {
                const list = el('div', undefined, 'pet-share-others'); list.append(el('h3', '我分享中的其他班級'));
                for (const [classId, other] of others) {
                    const row = el('div', undefined, 'pet-rule');
                    row.append(el('span', other.className || '未命名班級'), button('複製連結', () => copy(shareUrl(other.id), `✓ 已複製「${other.className || '班級'}」的連結。`)), button('QR Code', () => showQr(shareUrl(other.id), other.className || '班級')), button('停止分享', () => stop(classId)));
                    row.lastChild.disabled = working || !verified;
                    list.append(row);
                }
                body.append(list);
            }
        }
        if (notice) { const status = el('p', notice, 'pet-share-status'); status.setAttribute('role', 'status'); body.append(status); }
        panel.replaceChildren(summary, body);
    }
    function renderPanel(root) {
        panel = el('details', undefined, 'pet-share'); panel.dataset.petKey = 'share';
        root.append(panel); paint();
        if (isTeacher() && loadedFor !== uid()) refresh();
    }

    window.addEventListener?.('online', changed);
    window.PetShare = { renderPanel, changed, refresh, publish, create, buildPayload, maskName, shares, NAME_MODES };
})();
