/** 班級寵物：成長值只由已存檔獎勵紀錄計算，不複製點數帳本。 */
(function () {
    'use strict';
    const KEY = 'petSettings';
    const pets = { cat: ['🐱', '小貓'], dog: ['🐶', '小狗'], rabbit: ['🐰', '小兔'], panda: ['🐼', '熊貓'] };
    const defaults = () => ({ enabled: false, rules: [
        { id: 'homework', name: '準時交作業', points: 2, xp: 2 },
        { id: 'help', name: '主動幫忙', points: 2, xp: 2 },
        { id: 'team', name: '小組合作', points: 3, xp: 3 },
        { id: 'tidy', name: '整理環境', points: 2, xp: 2 }
    ] });
    const clone = x => JSON.parse(JSON.stringify(x));
    const uid = () => crypto.randomUUID();
    const cid = () => localStorage.getItem('currentClassId') || 'default';
    const settings = () => { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : defaults(); };
    const keys = () => [window.STUDENTS_KEY || 'students', window.GROUPS_KEY || 'groups', window.POINTS_HISTORY_KEY || 'pointsHistory'];
    let busy = false;
    let selected = new Set();
    let query = '';
    let selectedRule = '';
    let expected = null;
    let expectedClass = cid();
    const fingerprint = () => JSON.stringify([...keys(), KEY].map(k => localStorage.getItem(k)));
    function memoryMatchesStorage() {
        const ordered = values => JSON.stringify([...values].sort((a, b) => String(a.id).localeCompare(String(b.id))));
        return keys().every((key, i) => ordered(JSON.parse(localStorage.getItem(key) || '[]')) === ordered([window.students, window.groups, window.pointsHistory][i] || []));
    }
    function prepare() {
        // 只接受與磁碟一致的記憶體，不能把其他分頁的新快照當作本頁舊資料。
        if (cid() === expectedClass && memoryMatchesStorage()) remember();
    }
    const fail = message => { window.alert(message); return false; };
    function xpFor(id, history = window.pointsHistory || [], carry = Number(window.students?.find(s => String(s.id) === String(id))?.petCarryXp) || 0) {
        // 每筆事件只能計算一次；撤銷事件保留在同一本帳本。
        const seen = new Set();
        return Math.max(0, history.reduce((sum, r) => {
            if (String(r.studentId) !== String(id) || !r.petEvent || seen.has(r.id)) return sum;
            seen.add(r.id);
            return sum + (Number.isFinite(r.petXp) ? r.petXp : 0);
        }, carry));
    }
    function stage(xp) {
        if (xp < 10) return { level: 0, label: '等待孵化', start: 0, next: 10 };
        const level = 1 + Math.floor((xp - 10) / 20);
        return { level, label: `Lv.${level}`, start: 10 + (level - 1) * 20, next: 10 + level * 20 };
    }
    function remember() { expected = fingerprint(); expectedClass = cid(); }
    function fresh() {
        return expectedClass === cid() && expected === fingerprint();
    }
    function redraw() {
        window.renderStudents?.(); window.renderGroups?.(); window.renderPointsHistory?.();
        render();
    }
    async function change(action) {
        if (busy) return false;
        busy = true;
        try {
            const execute = () => {
                if (!fresh()) return fail('資料已在其他分頁或同步中更新，請重新整理後再操作。');
                return action();
            };
            return navigator.locks ? await navigator.locks.request('class-pets-' + expectedClass, execute) : execute();
        } catch (e) {
            console.error('[ClassPets]', e);
            return fail('這次操作未完成，請確認資料與儲存空間後再試。');
        } finally { busy = false; render(); }
    }
    function commit(nextStudents, nextGroups, nextHistory) {
        const values = [nextStudents, nextGroups, nextHistory];
        if (!SafeStorage.write(keys().map((k, i) => [k, JSON.stringify(values[i])]), { context: '寵物獎勵與班級分數' })) return false;
        window.students = nextStudents; window.groups = nextGroups; window.pointsHistory = nextHistory;
        remember(); redraw();
        return true;
    }
    async function award(ids, points, reason, xpOverride, batchId = uid()) {
        return change(() => {
            if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 1000) return fail('分數請填寫 -1000 到 1000 的非零整數。');
            const config = settings();
            const xp = config.enabled && points > 0 ? (xpOverride ?? points) : 0;
            if (!Number.isInteger(xp) || xp < 0 || xp > 1000) return fail('成長值請填寫 0 到 1000 的整數。');
            if (window.pointsHistory.some(r => r.petBatch === batchId)) return false;
            const unique = [...new Set(ids.map(String))];
            if (!unique.length || unique.some(id => !window.students.some(s => String(s.id) === id))) return fail('請選擇目前班級的學生。');
            const ss = clone(window.students), gg = clone(window.groups), hh = clone(window.pointsHistory);
            const now = new Date();
            unique.forEach(id => {
                const s = ss.find(s => String(s.id) === id);
                s.points = (Number(s.points) || 0) + points;
                const g = gg.find(g => g.members.some(m => String(m.id) === id));
                if (g) g.score = (Number(g.score) || 0) + points;
                hh.unshift({ id: uid(), createdAtMs: Math.max(now.getTime(), (window.PointsReset?.lastResetId(hh) || 0) + 1), studentId: s.id, studentName: s.name,
                    points, reason: String(reason || '自訂加扣分').slice(0, 80), date: now.toLocaleDateString('zh-TW'),
                    timestamp: now.toLocaleString('zh-TW', { hour12: false }), petEvent: true, petXp: xp,
                    petBatch: batchId, petGroupId: g?.id ?? null });
            });
            if (!commit(ss, gg, hh)) return false;
            selected.clear(); render();
            if (typeof NotificationSystem !== 'undefined') NotificationSystem.success(`已存本機 · ${unique.length} 人${xp ? `，每人成長 +${xp}` : ''}`);
            return true;
        });
    }
    async function undo(ids) {
        return change(() => {
            const hh = clone(window.pointsHistory), ss = clone(window.students), gg = clone(window.groups);
            const originals = hh.filter(r => ids.includes(r.id) && r.petEvent && !r.petReverses);
            if (!originals.length || originals.some(r => hh.some(x => x.petReverses === r.id))) return fail('這筆獎勵已撤銷，請重新查看紀錄。');
            if (originals.some(r => !ss.some(s => String(s.id) === String(r.studentId)))) return fail('學生已不在目前名單，無法撤銷；原紀錄仍保留。');
            const reset = Math.max(0, ...hh.filter(r => r.type === 'reset').map(r => Number(r.createdAtMs || r.id) || 0));
            const now = new Date(), batch = uid();
            originals.forEach(r => {
                // 重置前的分數已歸零，只沖回成長值，不再扣一次班級分數。
                const points = Number(r.createdAtMs || r.id) > reset ? -r.points : 0;
                const s = ss.find(s => String(s.id) === String(r.studentId));
                s.points = (Number(s.points) || 0) + points;
                const g = gg.find(g => g.id === r.petGroupId);
                if (g) g.score = (Number(g.score) || 0) + points;
                hh.unshift({ id: uid(), createdAtMs: now.getTime(), studentId: s.id, studentName: s.name,
                    points, reason: '撤銷：' + r.reason, date: now.toLocaleDateString('zh-TW'), timestamp: now.toLocaleString('zh-TW', { hour12: false }),
                    petEvent: true, petXp: -r.petXp, petBatch: batch, petReverses: r.id, petGroupId: r.petGroupId });
            });
            return commit(ss, gg, hh);
        });
    }
    function el(tag, text, cls) {
        const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e;
    }
    function button(text, action, cls) { const b = el('button', text, cls); b.type = 'button'; b.addEventListener('click', action); return b; }
    function saveSettings(config) {
        return change(() => {
            if (!SafeStorage.set(KEY, JSON.stringify(config), { context: '寵物獎勵設定' })) return false;
            remember(); render(); return true;
        });
    }
    function render() {
        const root = document.getElementById('pets-section'); if (!root) return;
        prepare();
        const config = settings(); root.replaceChildren();
        root.append(el('h2', '🐾 班級寵物'), el('p', `目前班級：${window.ClassProfiles?.currentProfile()?.name || '預設班級'}`));
        if (!config.enabled) {
            root.append(el('p', '從今天的努力開始養一隻寵物。啟用後，原本的正向加分會同時獲得等量成長值；舊分數不換算，扣分不讓寵物退化。'));
            root.append(button('啟用本班寵物成長', () => saveSettings({ ...config, enabled: true, enabledAt: new Date().toISOString() }), 'pet-primary'));
            if (!(window.pointsHistory || []).some(r => r.petEvent)) return;
        } else root.append(el('p', '🥚 10 成長值孵化，每增加 20 成長值升一級。分數歸零不影響成長；撤銷誤加獎勵會回復成長。'));
        root.append(el('p', '資料先存在本機，登入後沿用雲端同步。換裝置前請完成同步，同一班請避免兩台裝置同時加分。'));
        const tools = el('div', undefined, 'pet-tools');
        const search = el('input'); search.type = 'search'; search.placeholder = '搜尋姓名或座號'; search.value = query; search.setAttribute('aria-label', '搜尋寵物學生');
        search.addEventListener('input', () => { query = search.value; renderCards(); page = 0; renderHistory(); });
        tools.append(search, button('選取目前顯示學生', () => { visibleStudents().forEach(s => selected.add(String(s.id))); render(); }), button('取消選取', () => { selected.clear(); render(); }));
        const groupSelect = el('select'); groupSelect.setAttribute('aria-label', '選取小組'); groupSelect.add(new Option('選取整組…', ''));
        window.groups.forEach((g, i) => groupSelect.add(new Option(g.name, String(i))));
        groupSelect.addEventListener('change', () => { if (groupSelect.value !== '') { window.groups[Number(groupSelect.value)].members.forEach(s => selected.add(String(s.id))); render(); } });
        tools.append(groupSelect); root.append(tools);
        const cards = el('div', undefined, 'pet-cards'); root.append(cards);
        function visibleStudents() { return window.students.filter(s => `${s.name} ${s.number || s.seatNumber || ''}`.includes(query.trim())); }
        function renderCards() {
            cards.replaceChildren();
            const list = visibleStudents();
            if (!list.length) cards.append(el('p', '沒有符合的學生，請調整搜尋或先到學生管理新增名單。'));
            list.forEach(s => {
                const xp = xpFor(s.id), growth = stage(xp), kind = pets[s.classPet] ? s.classPet : 'cat';
                const card = el('article', undefined, 'pet-card');
                const label = el('label', undefined, 'pet-student'); const check = el('input'); check.type = 'checkbox'; check.checked = selected.has(String(s.id));
                check.addEventListener('change', () => { check.checked ? selected.add(String(s.id)) : selected.delete(String(s.id)); updateCount(); });
                label.append(check, el('span', `${s.number || s.seatNumber || ''} ${s.name}`));
                card.append(label, el('div', growth.level ? pets[kind][0] : '🥚', 'pet-avatar'), el('strong', growth.level ? `${pets[kind][1]} · ${growth.label}` : `等待孵化 · ${pets[kind][1]}`));
                const progress = el('progress'); progress.max = growth.next - growth.start; progress.value = xp - growth.start; progress.setAttribute('aria-label', `${s.name}成長進度`);
                card.append(progress, el('p', `成長值 ${xp} · 距離${growth.level ? '升級' : '孵化'}還有 ${growth.next - xp}`));
                const choose = el('select'); choose.setAttribute('aria-label', `${s.name}的寵物`); Object.entries(pets).forEach(([id, p]) => choose.add(new Option(p.join(' '), id))); choose.value = kind;
                choose.addEventListener('change', async () => { const value = choose.value; const ok = await change(() => { const ss = clone(window.students); ss.find(x => x.id === s.id).classPet = value; return commit(ss, window.groups, window.pointsHistory); }); if (!ok) choose.value = kind; });
                card.append(choose); cards.append(card);
            });
        }
        const bar = el('div', undefined, 'pet-award-bar'); const count = el('span'); count.setAttribute('role', 'status');
        const ruleSelect = el('select'); ruleSelect.setAttribute('aria-label', '獎勵規則');
        config.rules.forEach(r => ruleSelect.add(new Option(`${r.name} · ${r.points > 0 ? '+' : ''}${r.points} 分 / 成長 +${config.enabled ? r.xp : 0}`, r.id)));
        if (config.rules.some(r => r.id === selectedRule)) ruleSelect.value = selectedRule;
        ruleSelect.addEventListener('change', () => { selectedRule = ruleSelect.value; });
        const give = button('確認發放', async () => {
            const r = config.rules.find(r => r.id === ruleSelect.value); if (!r) return;
            const ids = [...selected].filter(id => window.students.some(s => String(s.id) === id));
            if (!ids.length) return fail('請先選取學生。');
            if (!confirm(`發放「${r.name}」給 ${ids.length} 位學生？\n每人 ${r.points} 分、成長 +${config.enabled ? r.xp : 0}。`)) return;
            give.disabled = true;
            await award(ids, r.points, r.name, r.xp);
            give.disabled = false;
        }, 'pet-primary');
        function updateCount() { count.textContent = `已選 ${selected.size} 人`; give.disabled = !selected.size || busy; }
        bar.append(count, ruleSelect, give); root.append(bar); renderCards(); updateCount();
        const rules = el('details'); rules.append(el('summary', '⚙️ 自訂獎勵規則與設定'));
        const form = el('form', undefined, 'pet-tools');
        const name = el('input'); name.required = true; name.maxLength = 40; name.placeholder = '規則名稱'; name.setAttribute('aria-label', '規則名稱');
        function number(label, value, min) { const wrapper = el('label', label); const input = el('input'); input.type = 'number'; input.value = value; input.required = true; input.min = min; input.max = 1000; input.step = 1; wrapper.append(input); return [wrapper, input]; }
        const [pl, point] = number('分數', 2, -1000), [xl, xp] = number('成長值', 2, 0);
        const submit = el('button', '新增規則'); submit.type = 'submit'; form.append(name, pl, xl, submit);
        form.addEventListener('submit', async e => { e.preventDefault(); const p = Number(point.value), x = Number(xp.value); if (!name.value.trim() || p === 0 || (p < 0 && x !== 0)) return fail('請填寫名稱及非零分數；扣分規則的成長值需為 0。'); const ok = await saveSettings({ ...config, rules: [...config.rules, { id: uid(), name: name.value.trim(), points: p, xp: x }] }); if (ok) form.reset(); });
        rules.append(form);
        config.rules.forEach(r => { const row = el('div', undefined, 'pet-rule'); row.append(el('span', `${r.name} · ${r.points} 分 / 成長 ${r.xp}`), button('移除規則', () => saveSettings({ ...config, rules: config.rules.filter(x => x.id !== r.id) }))); rules.append(row); });
        if (config.enabled) rules.append(button('暫停成長獎勵（保留寵物與紀錄）', () => saveSettings({ ...config, enabled: false })));
        root.append(rules);
        const history = el('details'); history.append(el('summary', '📒 獎勵紀錄與撤銷'));
        history.append(el('p', '顯示本次搜尋學生的紀錄，每頁 30 筆。撤銷保留原紀錄；已歸零的舊分數不重複扣回。'));
        let page = 0;
        const rows = el('div'); const paging = el('div', undefined, 'pet-tools');
        function renderHistory() {
            const matches = new Set(visibleStudents().map(s => String(s.id)));
            const records = (window.pointsHistory || []).filter(r => r.petEvent && matches.has(String(r.studentId)));
            const reversedIds = new Set(window.pointsHistory.filter(r => r.petReverses).map(r => r.petReverses));
            const batches = new Map();
            window.pointsHistory.forEach(r => {
                if (!r.petBatch || r.petReverses || reversedIds.has(r.id)) return;
                if (!batches.has(r.petBatch)) batches.set(r.petBatch, []);
                batches.get(r.petBatch).push(r);
            });
            rows.replaceChildren(); paging.replaceChildren();
            records.slice(page * 30, (page + 1) * 30).forEach(r => {
                const reversed = reversedIds.has(r.id);
                const row = el('div', undefined, 'pet-history'); row.append(el('strong', `${r.studentName} · ${r.reason}`), el('span', `${r.points > 0 ? '+' : ''}${r.points} 分 · 成長 ${r.petXp >= 0 ? '+' : ''}${r.petXp}`), el('small', r.timestamp));
                if (r.petReverses || reversed) row.append(el('span', r.petReverses ? '撤銷紀錄' : '已撤銷'));
                else {
                    row.append(button('撤銷這筆', () => { if (confirm(`撤銷 ${r.studentName} 的「${r.reason}」？`)) undo([r.id]); }));
                    const batch = batches.get(r.petBatch) || [];
                    if (batch.length > 1) row.append(button(`撤銷整批 ${batch.length} 人`, () => { if (confirm(`撤銷這批尚未撤銷的 ${batch.length} 筆獎勵？`)) undo(batch.map(x => x.id)); }));
                }
                rows.append(row);
            });
            if (!records.length) rows.append(el('p', '尚無獎勵紀錄。啟用後試著從原本加扣分頁給予正向加分。'));
            if (page > 0) paging.append(button('上一頁', () => { page--; renderHistory(); }));
            paging.append(el('span', `第 ${page + 1} / ${Math.max(1, Math.ceil(records.length / 30))} 頁`));
            if ((page + 1) * 30 < records.length) paging.append(button('下一頁', () => { page++; renderHistory(); }));
        }
        renderHistory(); history.append(rows, paging); root.append(history);
    }
    function init() {
        remember();
        const menu = document.getElementById('feature-menu-grid') || document.querySelector('button[onclick="showSection(\'grouping\')"]')?.parentElement;
        const nav = button('🐾 班級寵物', () => { render(); window.showSection('pets'); }, 'pet-nav'); menu?.append(nav);
        const section = el('section', undefined, 'section hidden'); section.id = 'pets-section'; document.getElementById('grouping-section')?.after(section);
        const entry = button('🐾 寵物成長／批次獎勵', () => { render(); window.showSection('pets'); }, 'pet-nav'); document.getElementById('pointsHistory')?.before(entry);
        // 同頁正常操作也會改動共用資料；獎勵操作開始時仍檢查其他分頁造成的衝突。
        document.addEventListener('click', e => { if (!busy && !e.target.closest('#pets-section') && !e.target.closest('#points-section')) prepare(); });
        window.addEventListener('storage', () => { /* 保留快照，下一次操作會阻擋過期分頁。 */ });
        render();
        if (location.hash === '#pets') window.showSection('pets');
    }
    window.ClassPets = { award, undo, xpFor, stage, render, prepare, settings };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
