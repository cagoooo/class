/**
 * 班級寵物分享（學生端 pets.html）
 *
 * 免登入讀取老師發布的寵物快照（Firestore petShares/{分享碼}，REST 讀單一文件）。
 * 這一頁只能觀看與互動：不寫回雲端，也不改變成長值或金幣。
 * 「我的寵物」、連續來訪天數與上次看到的成長值只記在這台裝置的瀏覽器裡。
 */
(function () {
    'use strict';
    const P = window.ClassPets, root = document.getElementById('pet-share-view');
    const params = new URLSearchParams(location.search), shareId = params.get('s') || '', previewing = params.has('preview');
    const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
    const button = (text, action, cls) => { const b = el('button', text, cls); b.type = 'button'; b.addEventListener('click', action); return b; };
    const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
    const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 無法儲存時仍可觀看 */ } };
    const memoryKey = 'petShareView:' + (previewing ? 'preview' : shareId);
    // { me, seen: { [key]: xp }, lastDay, streak, taps: { day, count }, cache: { payload, updatedAt } }
    const memory = readJson(memoryKey, {});
    const remember = () => { if (!previewing) writeJson(memoryKey, memory); };
    const taipeiDay = (offset = 0) => new Date(Date.now() + offset * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
    let state = null, news = null, sortMode = 'seat', lastFetch = 0, loading = false;

    const text = (value, max) => String(value ?? '').slice(0, max);
    const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
    /** 快照來自網路，逐欄檢查後才使用；不認得的寵物種類一律當成還沒孵化。 */
    function clean(raw) {
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.students)) return null;
        const known = kind => Object.hasOwn(P.pets, kind) ? kind : null;
        return {
            className: text(raw.className, 40) || '我們班', nameMode: raw.nameMode,
            students: raw.students.slice(0, 300).map((s, i) => {
                const xp = count(s?.xp), kind = xp >= 10 ? known(s?.kind) || 'cat' : null;
                return { key: text(s?.key, 40) || 'row-' + i, seat: text(s?.seat, 12), name: text(s?.name, 30), xp, kind,
                    mood: Object.hasOwn(P.moods, s?.mood) ? s.mood : 'normal', nick: text(s?.nick, 20),
                    coins: Number.isSafeInteger(s?.coins) ? s.coins : null, order: i };
            }),
            collection: Object.fromEntries(Object.entries(raw.collection || {}).filter(([kind]) => known(kind))
                .map(([kind, found]) => [kind, { maxLevel: Math.max(1, count(found?.maxLevel)) }])),
            quests: (Array.isArray(raw.quests) ? raw.quests : []).slice(0, 50).map(q => ({ name: text(q?.name, 40), target: Math.max(1, count(q?.target)), progress: count(q?.progress), endDate: text(q?.endDate, 10) })),
            questsDone: count(raw.questsDone),
            eggs: (Array.isArray(raw.eggs) ? raw.eggs : []).slice(0, 100).map(egg => ({ kind: known(egg?.kind), from: text(egg?.from, 40) })),
            products: (Array.isArray(raw.products) ? raw.products : []).slice(0, 100).map(p => ({ name: text(p?.name, 40), cost: count(p?.cost) })),
        };
    }
    const label = s => state.nameMode === 'seat' || !s.name ? (s.seat ? s.seat + ' 號' : `第 ${s.order + 1} 位同學`) : `${s.seat ? s.seat + ' ' : ''}${s.name}`;
    const petName = s => s.nick || (s.kind ? P.pets[s.kind][1] : '神祕寵物蛋');
    const stageLine = s => s.kind ? `${P.pets[s.kind][1]} · ${P.appearance(s.xp).label} · ${P.stage(s.xp).label}` : `神祕寵物蛋 · ${P.eggStage(s.xp).label}`;
    function avatar(s) { const box = el('div', undefined, 'pet-avatar'); box.append(P.interactivePortrait(s.kind || 'cat', s.xp, s.mood)); return box; }
    function progressBar(s) {
        const growth = P.stage(s.xp), bar = el('progress');
        bar.max = growth.next - growth.start; bar.value = s.xp - growth.start;
        bar.setAttribute('aria-label', `${label(s)}的${growth.level ? '升級' : '孵化'}進度`);
        return bar;
    }

    async function fetchShare() {
        if (previewing) {
            const saved = readJson('petSharePreview', null);
            if (!saved?.payload) throw Object.assign(new Error('preview'), { reason: 'preview' });
            return { payload: saved.payload, updatedAt: saved.at };
        }
        if (!/^[A-Za-z0-9_-]{20,64}$/.test(shareId)) throw Object.assign(new Error('invalid'), { reason: 'invalid' });
        const project = typeof firebaseConfig !== 'undefined' ? firebaseConfig.projectId : '';
        const response = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents/petShares/${shareId}`, { cache: 'no-store' });
        if (response.status === 404) throw Object.assign(new Error('gone'), { reason: 'gone' });
        if (!response.ok) throw Object.assign(new Error('http ' + response.status), { reason: 'network' });
        const doc = await response.json();
        return { payload: JSON.parse(doc.fields.payload.stringValue), updatedAt: Date.parse(doc.updateTime) };
    }
    /** 和這台裝置上次看到的成長值比較，找出值得慶祝的變化。 */
    function compare(students) {
        const seen = memory.seen;
        if (!seen) return null;
        const result = { mine: null, hatched: 0, levelled: 0 };
        for (const s of students) {
            if (!Object.hasOwn(seen, s.key) || s.xp <= seen[s.key]) continue;
            const event = P.milestone(seen[s.key], s.xp);
            if (s.key === memory.me) result.mine = { gained: s.xp - seen[s.key], event };
            else if (event) result[event.type === 'hatch' ? 'hatched' : 'levelled']++;
        }
        return result.mine || result.hatched || result.levelled ? result : null;
    }
    function visit() {
        const today = taipeiDay();
        if (memory.lastDay !== today) {
            memory.streak = memory.lastDay === taipeiDay(-1) ? (memory.streak || 1) + 1 : 1;
            memory.lastDay = today;
        }
    }
    async function load() {
        if (loading) return;
        loading = true; root.setAttribute('aria-busy', 'true');
        try {
            const fresh = await fetchShare(), data = clean(fresh.payload);
            if (!data) throw Object.assign(new Error('format'), { reason: 'network' });
            news = compare(data.students) || news;
            memory.seen = Object.fromEntries(data.students.map(s => [s.key, s.xp]));
            memory.cache = fresh; visit(); remember();
            state = { ...data, updatedAt: fresh.updatedAt, stale: false };
            lastFetch = Date.now(); render();
        } catch (error) {
            const cached = !previewing && error.reason !== 'gone' && error.reason !== 'invalid' ? clean(memory.cache?.payload) : null;
            if (cached) { state = { ...cached, updatedAt: memory.cache.updatedAt, stale: true }; render(); }
            else renderProblem(error.reason);
        } finally { loading = false; root.removeAttribute('aria-busy'); }
    }
    function renderProblem(reason) {
        const box = el('section', undefined, 'psv-problem');
        const [title, copy] = reason === 'gone' ? ['這個連結已經停止分享', '老師可能更新了連結。請向老師要新的寵物連結。']
            : reason === 'invalid' ? ['找不到寵物連結', '請確認連結完整，或再向老師要一次連結。']
            : reason === 'preview' ? ['沒有可預覽的資料', '請回到班級小管家的寵物頁，再按一次「預覽學生看到的畫面」。']
            : ['寵物們暫時連不上線', '請確認網路連線後再試一次。'];
        box.append(el('div', '🥚', 'psv-problem-icon'), el('h1', title), el('p', copy));
        if (reason !== 'gone' && reason !== 'invalid' && reason !== 'preview') box.append(button('再試一次', load, 'psv-primary'));
        root.replaceChildren(box);
    }

    function greeting() {
        const hour = Number(new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', hour12: false }).slice(0, 2));
        return hour < 5 ? '夜深了' : hour < 11 ? '早安' : hour < 14 ? '午安' : hour < 18 ? '下午好' : '晚安';
    }
    function newsBanner() {
        if (!news) return null;
        const box = el('aside', undefined, 'psv-news'); box.setAttribute('role', 'status');
        const lines = el('div');
        if (news.mine) {
            const me = state.students.find(s => s.key === memory.me), event = news.mine.event;
            if (me) box.append(P.portrait(me.kind || 'cat', me.xp, 'happy'));
            lines.append(el('strong', event?.type === 'hatch' && me?.kind ? `🎉 你的蛋孵化了！是${P.pets[me.kind][1]}！` : event ? `🌟 你的寵物升到 Lv.${event.level} 了！` : `✨ 你的寵物又長大了 +${news.mine.gained}！`),
                el('p', `從上次來看牠到現在，你的努力讓牠多了 ${news.mine.gained} 成長值。`));
        }
        const classLine = [news.hatched ? `${news.hatched} 隻寵物孵化` : '', news.levelled ? `${news.levelled} 隻寵物升級` : ''].filter(Boolean).join('、');
        if (classLine) lines.append(el(news.mine ? 'p' : 'strong', `${news.mine ? '同學們也有' : '🎉 上次到現在，班上有'} ${classLine}！`));
        box.append(lines, button('知道了', () => { news = null; box.remove(); }));
        return box;
    }
    function tapStatus() {
        const today = taipeiDay(), taps = memory.taps?.day === today ? memory.taps.count : 0;
        return `今天和寵物互動 ${taps} 次${memory.streak > 1 ? ` · 連續 ${memory.streak} 天來看牠` : ''}`;
    }
    function renderMine() {
        const section = el('section', undefined, 'psv-mine'), me = state.students.find(s => s.key === memory.me);
        if (!me) {
            section.append(el('h2', '🔍 先找到你的寵物'), el('p', '選出你自己，下次打開就會直接看到牠。這個選擇只記在這台裝置上。'));
            const form = el('form', undefined, 'psv-pick'), select = el('select'); select.setAttribute('aria-label', '選擇你的座號或姓名');
            select.add(new Option('請選擇…', ''));
            state.students.forEach(s => select.add(new Option(label(s), s.key)));
            const submit = el('button', '就是我', 'psv-primary'); submit.type = 'submit';
            form.append(select, submit);
            form.addEventListener('submit', e => { e.preventDefault(); if (!select.value) return; memory.me = select.value; remember(); render(); document.querySelector('.psv-mine .pet-touch')?.focus(); });
            section.append(form);
            return section;
        }
        const growth = P.stage(me.xp);
        section.classList.add('has-pet');
        const info = el('div', undefined, 'psv-mine-info');
        info.append(el('p', `${greeting()}，${label(me)}！`, 'psv-eyebrow'), el('h2', petName(me)), el('p', stageLine(me), 'psv-stage'),
            progressBar(me), el('p', `成長值 ${me.xp} · 距離${growth.level ? '升級' : '孵化'}還有 ${growth.next - me.xp}`),
            el('p', P.nextUnlockHint(me.xp), 'psv-hint'));
        if (me.coins !== null) info.append(el('p', `🪙 金幣 ${me.coins}`, 'psv-coins'));
        const taps = el('p', tapStatus(), 'psv-taps'); taps.id = 'psv-taps'; taps.setAttribute('role', 'status');
        info.append(taps, button('不是我，重新選擇', () => { delete memory.me; remember(); render(); }, 'psv-link'));
        const stage = el('div', undefined, 'psv-mine-stage'); stage.append(avatar(me), el('p', '點一下，和牠打個招呼', 'psv-caption'));
        section.append(stage, info);
        return section;
    }
    function renderClass() {
        const section = el('section', undefined, 'psv-section'), hatched = state.students.filter(s => s.kind).length;
        const head = el('div', undefined, 'psv-section-head');
        head.append(el('h2', '🐾 全班的寵物'), el('p', `已孵化 ${hatched} 隻 · 還有 ${state.students.length - hatched} 顆蛋等待孵化`));
        const sorter = el('div', undefined, 'psv-sorter'); sorter.setAttribute('role', 'group'); sorter.setAttribute('aria-label', '排列方式');
        for (const [mode, name] of [['seat', '依座號'], ['level', '依成長']]) {
            const control = button(name, () => { sortMode = mode; render(); }); control.setAttribute('aria-pressed', String(sortMode === mode)); sorter.append(control);
        }
        head.append(sorter);
        const grid = el('div', undefined, 'psv-grid');
        const list = sortMode === 'level' ? [...state.students].sort((a, b) => b.xp - a.xp || a.order - b.order) : state.students;
        for (const s of list) {
            const card = el('article', undefined, 'psv-card' + (s.key === memory.me ? ' is-me' : ''));
            card.append(el('h3', label(s) + (s.key === memory.me ? '（我）' : '')), avatar(s), el('strong', petName(s)), el('p', stageLine(s)), progressBar(s));
            if (s.coins !== null) card.append(el('p', `🪙 ${s.coins}`, 'psv-coins'));
            grid.append(card);
        }
        if (!state.students.length) grid.append(el('p', '老師還沒有加入學生名單。'));
        section.append(head, grid);
        return section;
    }
    function renderQuests() {
        if (!state.quests.length && !state.eggs.length) return null;
        const section = el('section', undefined, 'psv-section');
        section.append(el('h2', '🤝 全班共同任務'), el('p', `全班一起完成任務就能得到收藏蛋。${state.questsDone ? `已經完成 ${state.questsDone} 個任務！` : ''}`));
        for (const quest of state.quests) {
            const card = el('article', undefined, 'psv-quest'), bar = el('progress'), left = quest.target - quest.progress;
            bar.max = quest.target; bar.value = Math.min(quest.target, quest.progress); bar.setAttribute('aria-label', quest.name + '進度');
            card.append(el('h3', quest.name), bar, el('p', `${Math.min(quest.target, quest.progress)} / ${quest.target} 次${left > 0 ? ` · 再 ${left} 次就達標` : ' · 🎉 達標了，等老師領蛋！'}${quest.endDate ? ` · ${quest.endDate} 截止` : ''}`));
            section.append(card);
        }
        if (state.eggs.length) {
            const eggs = el('div', undefined, 'psv-grid psv-eggs');
            for (const egg of state.eggs) {
                const card = el('article', undefined, 'psv-card'), box = el('div', undefined, 'pet-avatar');
                box.append(P.interactivePortrait(egg.kind || 'cat', egg.kind ? 10 : 9));
                card.append(box, el('strong', egg.kind ? P.pets[egg.kind][1] : '神祕班級收藏蛋'), el('p', egg.from ? '來自：' + egg.from : '班級收藏蛋'));
                eggs.append(card);
            }
            section.append(el('h3', '🥚 班級收藏蛋'), eggs);
        }
        return section;
    }
    function renderAtlas() {
        const kinds = Object.keys(P.pets), found = Object.keys(state.collection).length;
        const section = el('section', undefined, 'psv-section'), bar = el('progress');
        bar.max = kinds.length; bar.value = found; bar.setAttribute('aria-label', '全班圖鑑收集進度');
        section.append(el('h2', `📖 全班圖鑑 ${found} / ${kinds.length}`), bar, el('p', '同學孵化出新種類，圖鑑就會點亮一格。還沒發現的寵物先保密！'));
        const grid = el('div', undefined, 'psv-grid psv-atlas');
        kinds.forEach((kind, i) => {
            const entry = state.collection[kind], tile = el('article', undefined, 'psv-card' + (entry ? '' : ' is-locked'));
            const number = el('small', 'No.' + String(i + 1).padStart(2, '0'));
            if (entry) {
                const box = el('div', undefined, 'pet-avatar');
                // 只展示全班已經達成過的最高造型。
                box.append(P.interactivePortrait(kind, entry.maxLevel >= 5 ? 90 : entry.maxLevel >= 3 ? 50 : 10));
                tile.append(number, box, el('strong', P.pets[kind][1]));
            } else tile.append(number, el('div', '？', 'psv-unknown'), el('strong', '未發現'));
            grid.append(tile);
        });
        section.append(grid);
        return section;
    }
    function renderShop() {
        if (!state.products.length) return null;
        const section = el('section', undefined, 'psv-section');
        section.append(el('h2', '🛍️ 金幣可以兌換的獎勵'), el('p', '存夠金幣後，到學校請老師幫你兌換。'));
        const list = el('ul', undefined, 'psv-shop');
        for (const product of state.products) { const item = el('li'); item.append(el('span', product.name), el('strong', `🪙 ${product.cost}`)); list.append(item); }
        section.append(list);
        return section;
    }
    function render() {
        document.title = `${state.className}的寵物樂園｜班級小管家`;
        const header = el('header', undefined, 'psv-header');
        header.append(el('p', '班級小管家 · 班級寵物', 'psv-eyebrow'), el('h1', `${state.className}的寵物樂園`));
        const meta = el('div', undefined, 'psv-meta');
        meta.append(el('span', previewing ? '這是預覽畫面，學生看到的就是這樣。' : `老師最後更新：${new Date(state.updatedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}`));
        if (!previewing) meta.append(button('重新整理', load, 'psv-link'));
        header.append(meta);
        if (state.stale) header.append(el('p', '目前連不上網路，先顯示上次看到的樣子。', 'psv-offline'));
        const parts = [header, newsBanner(), renderMine(), renderClass(), renderQuests(), renderAtlas(), renderShop(),
            el('p', '在這裡可以看寵物、和牠互動；成長值與金幣要靠在學校的好表現，由老師發放喔！', 'psv-footnote')];
        root.replaceChildren(...parts.filter(Boolean));
    }

    if (!P || !root) { if (root) root.textContent = '寵物頁載入失敗，請重新整理再試一次。'; return; }
    // 寵物按鈕自己會停止事件冒泡，所以在捕獲階段計數。
    document.addEventListener('click', event => {
        if (!event.target.closest?.('.pet-touch')) return;
        const today = taipeiDay();
        memory.taps = { day: today, count: (memory.taps?.day === today ? memory.taps.count : 0) + 1 }; remember();
        const status = document.getElementById('psv-taps'); if (status) status.textContent = tapStatus();
    }, true);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !previewing && state && Date.now() - lastFetch > 60000) load(); });
    load();
})();
