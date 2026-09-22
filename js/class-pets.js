/** 班級寵物：成長值只由已存檔獎勵紀錄計算，不複製點數帳本。 */
(function () {
    'use strict';
    const KEY = 'petSettings';
    const pets = { cat: ['🐱', '小貓'], dog: ['🐶', '小狗'], rabbit: ['🐰', '小兔'], panda: ['🐼', '熊貓'], fox: ['🦊', '狐狸'], bear: ['🐻', '小熊'], penguin: ['🐧', '企鵝'], owl: ['🦉', '貓頭鷹'], turtle: ['🐢', '烏龜'], dragon: ['🐲', '小龍'], capybara: ['🦫', '水豚'], axolotl: ['🪸', '六角恐龍'], lion: ['🦁', '獅子'], tiger: ['🐯', '老虎'], elephant: ['🐘', '大象'], giraffe: ['🦒', '長頸鹿'], zebra: ['🦓', '斑馬'], monkey: ['🐒', '猴子'], koala: ['🐨', '無尾熊'], redpanda: ['🐾', '小熊貓'], raccoon: ['🦝', '浣熊'], otter: ['🦦', '水獺'], hedgehog: ['🦔', '刺蝟'], squirrel: ['🐿️', '松鼠'], sheep: ['🐑', '綿羊'], pig: ['🐷', '小豬'], frog: ['🐸', '青蛙'], seal: ['🦭', '海豹'], deer: ['🦌', '小鹿'], unicorn: ['🦄', '獨角獸'] };
    const moods = { normal: '精神飽滿', happy: '開心歡呼', sleepy: '安心休息' };
    const assetBase = document.currentScript?.src ? new URL('../assets/pets/rendered/', document.currentScript.src).href : 'assets/pets/rendered/';
    function assetName(kind, xp, mood = 'normal') {
        kind = Object.hasOwn(pets, kind) ? kind : 'cat';
        const look = appearance(xp).id;
        if (look === 'egg') return `mystery-egg-${eggStage(xp).id}.webp`;
        mood = look === 'egg' || !Object.hasOwn(moods, mood) ? 'normal' : mood;
        return `${kind}-${look}-${mood}.webp`;
    }
    function portrait(kind, xp, mood = 'normal') {
        kind = Object.hasOwn(pets, kind) ? kind : 'cat';
        const image = el('img', undefined, 'pet-portrait pet-rendered');
        image.width = 320; image.height = 360; image.loading = 'lazy'; image.decoding = 'async';
        if (xp < 10) { image.classList.add('pet-egg'); image.style.setProperty('--egg-duration', xp < 3 ? '5.6s' : xp < 6 ? '5s' : xp < 9 ? '4.6s' : '4.2s'); }
        if (xp >= 10) { image.classList.add('pet-breathing'); image.style.setProperty('--pet-breath-duration', mood === 'sleepy' ? '6s' : mood === 'happy' ? '3.8s' : '4.6s'); }
        image.alt = xp < 10 ? `神祕寵物蛋・${eggStage(xp).label}` : `${pets[kind][1]}・${appearance(xp).label}・${moods[mood] || moods.normal}`;
        image.src = assetBase + assetName(kind, xp, mood) + (xp < 10 ? '?v=3.36.0' : '');
        image.addEventListener('error', () => {
            if (xp >= 10 && ['cat', 'dog', 'rabbit', 'panda'].includes(kind)) image.replaceWith(vectorPortrait(kind, xp));
            else { const fallback = el('span', appearance(xp).id === 'egg' ? '🥚' : pets[kind][0], 'pet-portrait pet-fallback'); fallback.setAttribute('role', 'img'); fallback.setAttribute('aria-label', image.alt + '（簡易備援圖示）'); image.replaceWith(fallback); }
        }, { once: true });
        return image;
    }
    function interactivePortrait(kind, xp, mood = 'normal') {
        const egg = xp < 10;
        const names = { cat:'喵～蹭蹭你', dog:'汪！開心搖搖', rabbit:'蹦蹦跳！', panda:'伸個懶腰～', fox:'俏皮搖搖', bear:'給你一個抱抱', penguin:'搖搖擺擺', owl:'歪頭看看你', turtle:'慢慢點頭', dragon:'展翅飛一下', capybara:'悠閒晃一晃', axolotl:'水中游呀游', lion:'精神抖擻！', tiger:'輕輕撲一下', elephant:'踏踏步！', giraffe:'伸長脖子打招呼', zebra:'小跑步！', monkey:'跳起來打招呼', koala:'抱緊緊～', redpanda:'害羞晃晃', raccoon:'探頭看看', otter:'水中翻個身', hedgehog:'縮成小小球', squirrel:'輕快跳跳', sheep:'軟綿綿蹦一下', pig:'開心扭扭', frog:'呱！跳一下', seal:'滑呀滑', deer:'輕輕躍起', unicorn:'魔法跳躍！' };
        const type = egg ? 'wobble' : ['rabbit','monkey','squirrel','sheep','frog','deer','unicorn'].includes(kind) ? 'hop' : ['dragon','owl'].includes(kind) ? 'float' : ['turtle','giraffe','raccoon','koala'].includes(kind) ? 'nod' : ['axolotl','otter','seal'].includes(kind) ? 'swim' : ['lion','tiger','elephant','zebra'].includes(kind) ? 'pounce' : ['panda','bear','hedgehog'].includes(kind) ? 'squish' : 'wobble';
        const frames = {
            wobble:['rotate(0)','rotate(-5deg)','rotate(5deg)','rotate(-3deg)','rotate(0)'],
            hop:['translateY(0)','translateY(-12px) rotate(-3deg)','translateY(0)','translateY(-5px)','translateY(0)'],
            float:['translateY(0) rotate(0)','translateY(-9px) rotate(-4deg)','translateY(-5px) rotate(4deg)','translateY(0) rotate(0)'],
            nod:['rotate(0) scaleY(1)','rotate(5deg) scaleY(.94)','rotate(-4deg) scaleY(1.02)','rotate(0) scaleY(1)'],
            swim:['translateX(0) rotate(0)','translateX(-5px) rotate(-6deg)','translateX(5px) rotate(6deg)','translateX(0) rotate(0)'],
            pounce:['scale(1)','scale(.95,1.03)','translateY(-5px) scale(1.04,.96)','scale(1)'],
            squish:['scale(1)','scale(1.05,.94)','scale(.97,1.03)','scale(1)']
        };
        let cooling = false;
        const target = button(undefined, event => {
            event.stopPropagation();
            if (cooling) return;
            cooling = true;
            bubble.textContent = egg ? '咚咚！裡面有動靜～' : names[kind] || '你好呀！';
            bubble.hidden = false;
            if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && target.animate) {
                target.animate(frames[type].map(transform => ({ transform })), { duration:680, easing:'ease-in-out' });
            }
            setTimeout(() => { bubble.hidden = true; bubble.textContent = ''; cooling = false; }, 1100);
        }, 'pet-touch');
        target.setAttribute('aria-label', egg ? '和神祕寵物蛋互動' : `和${pets[kind][1]}互動`);
        target.title = '點一下，打個招呼';
        const bubble = el('span', '', 'pet-touch-reply'); bubble.hidden = true; bubble.setAttribute('role', 'status');
        target.append(portrait(kind, xp, mood), bubble);
        return target;
    }
    function setPetMood(id, mood) {
        return change(() => {
            if (!Object.hasOwn(moods, mood)) return fail('請選擇清單中的表情樣態。');
            const next = clone(window.students), student = next.find(s => String(s.id) === String(id));
            if (!student) return fail('學生已不在目前班級。');
            student.classPetMood = mood;
            return commit(next, window.groups, window.pointsHistory);
        }, 'mood');
    }
    function drawPet() {
        const kinds = Object.keys(pets), limit = Math.floor(4294967296 / kinds.length) * kinds.length;
        const random = new Uint32Array(1);
        do { crypto.getRandomValues(random); } while (random[0] >= limit);
        return kinds[random[0] % kinds.length];
    }
    const defaults = () => ({ enabled: false, coinsEnabled: false, rules: [
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
    let editingRuleId = null;
    let shopStudent = '', shopProduct = '', editingProduct = null, shopPage = 0;
    let productDraft = { name: '', cost: '10' };
    const blankRule = () => ({ name: '', points: '2', xp: '2', coins: '2' });
    let ruleDraft = blankRule();
    let onlySelected = false;
    let viewMode = ['compact', 'cards'].includes(localStorage.getItem('petViewMode')) ? localStorage.getItem('petViewMode') : (window.matchMedia?.('(max-width: 600px)').matches ? 'compact' : 'cards');
    let feedbackTimer;
    let expected = null;
    let expectedClass = cid();
    const fingerprint = () => JSON.stringify([...keys(), KEY].map(k => localStorage.getItem(k)));
    function petDetails(details) {
        const profile = window.ClassProfiles?.currentProfile?.();
        return {
            classId: cid(),
            className: profile?.name || '',
            ...(details || {})
        };
    }
    function notifyPet(event, details) {
        try { window.UsageNotify?.pet?.(event, petDetails(details)); } catch (e) { /* 通知不能阻擋主流程 */ }
    }
    function reportPetFailure(operation, error, details) {
        const errorObj = error instanceof Error ? error : new Error(String(error || '寵物操作失敗'));
        try {
            if (window.ErrorHandler?.handle) {
                window.ErrorHandler.handle(errorObj, 'STORAGE', `寵物系統/${operation || '操作'}`, {
                    severity: 'critical', silent: true, feature: 'pet', petAction: operation || 'operation',
                    ...petDetails(details)
                });
            } else {
                window.UsageNotify?.petError?.(errorObj.message, operation, petDetails(details));
            }
        } catch (e) { /* 通知失敗不能阻擋主流程 */ }
    }
    function memoryMatchesStorage() {
        const ordered = values => JSON.stringify([...values].sort((a, b) => String(a.id).localeCompare(String(b.id))));
        return keys().every((key, i) => ordered(JSON.parse(localStorage.getItem(key) || '[]')) === ordered([window.students, window.groups, window.pointsHistory][i] || []));
    }
    function prepare() {
        // 只接受與磁碟一致的記憶體，不能把其他分頁的新快照當作本頁舊資料。
        if (cid() === expectedClass && memoryMatchesStorage()) { preserveCollection(); remember(); }
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
    function coinsFor(id, history = window.pointsHistory || [], carry = Number(window.students?.find(s => String(s.id) === String(id))?.petCarryCoins) || 0) {
        const seen = new Set();
        // 金幣只讀獨立欄位；舊分數、成長值不會被換算成金幣。
        return history.reduce((sum, r) => {
            if (String(r.studentId) !== String(id) || !r.petEvent || seen.has(r.id)) return sum;
            seen.add(r.id);
            return sum + (Number.isSafeInteger(r.coinDelta) ? r.coinDelta : 0);
        }, carry);
    }
    function stage(xp) {
        if (xp < 10) return { level: 0, label: '等待孵化', start: 0, next: 10 };
        const level = 1 + Math.floor((xp - 10) / 20);
        return { level, label: `Lv.${level}`, start: 10 + (level - 1) * 20, next: 10 + level * 20 };
    }
    function eggStage(xp) {
        return xp < 3 ? { id: 'rest', label: '安靜孵育' } : xp < 6 ? { id: 'crack', label: '出現裂紋' } : xp < 9 ? { id: 'splitting', label: '裂縫擴大' } : { id: 'hatching', label: '即將破殼' };
    }
    function appearance(xp) {
        const level = stage(xp).level;
        return level === 0 ? { id: 'egg', label: eggStage(xp).label } : level < 3 ? { id: 'baby', label: '幼年' } : level < 5 ? { id: 'junior', label: '成長' } : { id: 'grown', label: '成熟' };
    }
    function milestone(before, after) {
        const from = stage(before).level, to = stage(after).level;
        return to > from ? { type: from === 0 ? 'hatch' : 'level', level: to } : null;
    }
    const COLLECTION_VARIANTS = [
        { xp: 10, level: 1 },
        { xp: 50, level: 3 },
        { xp: 90, level: 5 },
    ];
    // 固定向量圖形與白名單色彩；不將學生姓名或輸入文字插入 SVG。
    function vectorPortrait(kind, xp) {
        kind = pets[kind] ? kind : 'cat';
        const look = appearance(xp), grown = look.id === 'grown', baby = look.id === 'baby';
        const colors = { cat: ['#f5b45f', '#ffe2b5'], dog: ['#b98259', '#f6d7b0'], rabbit: ['#e0c8ed', '#faf1ff'], panda: ['#f6f8fc', '#dce5f2'] };
        const [fur, belly] = colors[kind];
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 160 160'); svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', `${pets[kind][1]}・${look.label}造型`);
        svg.classList.add('pet-portrait');
        let shape;
        if (look.id === 'egg') {
            shape = `<path d="M80 24C60 24 38 66 38 100a42 42 0 0 0 84 0C122 66 100 24 80 24Z" fill="${belly}" stroke="#586174" stroke-width="3"/><path d="m42 93 16-10 16 14 16-14 17 12 12-7" fill="none" stroke="${fur}" stroke-width="7"/><circle cx="65" cy="64" r="7" fill="${fur}"/><circle cx="99" cy="116" r="8" fill="${fur}"/>`;
        } else {
            const ears = kind === 'cat' ? `<path d="m42 60-4-38 32 22m20 0 32-22-4 38" fill="${fur}" stroke="#586174" stroke-width="3"/>` : kind === 'rabbit' ? `<ellipse cx="59" cy="34" rx="13" ry="30" fill="${fur}"/><ellipse cx="101" cy="34" rx="13" ry="30" fill="${fur}"/><path d="M59 14v32m42-32v32" stroke="#efb8c9" stroke-width="8" stroke-linecap="round"/>` : kind === 'panda' ? '<circle cx="44" cy="46" r="19" fill="#445065"/><circle cx="116" cy="46" r="19" fill="#445065"/>' : `<ellipse cx="41" cy="68" rx="17" ry="32" fill="#895b43"/><ellipse cx="119" cy="68" rx="17" ry="32" fill="#895b43"/>`;
            shape = `<ellipse cx="80" cy="116" rx="${baby ? 28 : 37}" ry="${baby ? 25 : 31}" fill="${fur}" stroke="#586174" stroke-width="2"/><ellipse cx="80" cy="120" rx="19" ry="22" fill="${belly}"/>${ears}<ellipse cx="80" cy="74" rx="${baby ? 46 : 40}" ry="38" fill="${fur}" stroke="#586174" stroke-width="2"/>${kind === 'panda' ? '<ellipse cx="61" cy="72" rx="13" ry="16" fill="#445065"/><ellipse cx="99" cy="72" rx="13" ry="16" fill="#445065"/>' : ''}<circle cx="62" cy="73" r="5" fill="${kind === 'panda' ? '#fff' : '#354158'}"/><circle cx="98" cy="73" r="5" fill="${kind === 'panda' ? '#fff' : '#354158'}"/><ellipse cx="80" cy="88" rx="5" ry="4" fill="#354158"/><path d="M69 94q11 11 22 0" fill="none" stroke="#354158" stroke-width="3" stroke-linecap="round"/><ellipse cx="48" cy="88" rx="8" ry="4" fill="#eea5a1"/><ellipse cx="112" cy="88" rx="8" ry="4" fill="#eea5a1"/>${!baby ? '<path d="M52 105q28 14 56 0l-5 14H57Z" fill="#3d9488"/><path d="m89 117 14 18-17-3Z" fill="#3d9488"/>' : ''}${grown ? '<path d="m80 120 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1Z" fill="#f6c455" stroke="#8f6b1c"/>' : ''}`;
        }
        svg.innerHTML = `<ellipse cx="80" cy="149" rx="48" ry="6" fill="#d9e5e4"/>${shape}`;
        return svg;
    }
    function celebrate(events) {
        if (!events.length || !document.body) return;
        document.getElementById('pet-growth-feedback')?.remove(); clearTimeout(feedbackTimer);
        const box = el('aside', undefined, 'pet-growth-feedback'); box.id = 'pet-growth-feedback';
        const hatch = events.filter(e => e.type === 'hatch').length;
        const title = events.length === 1 ? (events[0].blindOpened ? `${events[0].name}開出了${pets[events[0].kind][1]}！` : `${events[0].name}的寵物${hatch ? '孵化了！' : '升級了！'}`) : `${hatch ? `${hatch} 隻孵化` : ''}${hatch && hatch < events.length ? '、' : ''}${events.length > hatch ? `${events.length - hatch} 隻升級` : ''}！`;
        const message = el('div'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
        message.append(el('strong', title), el('p', events.length === 1 ? `${appearance(events[0].xp).label} · Lv.${events[0].level}，一起繼續成長！` : '這次努力已存本機，到班級寵物查看新造型。'));
        box.append(portrait(events[0].kind, events[0].xp, 'happy'), message, button('關閉', () => { clearTimeout(feedbackTimer); box.remove(); }));
        document.body.append(box); feedbackTimer = setTimeout(() => box.remove(), 8000);
    }
    function remember() { expected = fingerprint(); expectedClass = cid(); }
    function fresh() {
        return expectedClass === cid() && expected === fingerprint();
    }
    function redraw() {
        window.renderStudents?.(); window.renderGroups?.(); window.renderPointsHistory?.(); window.renderPointsStudentList?.();
        render();
    }
    async function change(action, operation = 'operation') {
        if (busy) return false;
        busy = true;
        try {
            const execute = () => {
                if (!fresh()) {
                    const error = new Error('資料已在其他分頁或同步中更新');
                    reportPetFailure(operation, error, { failureStage: 'stale_snapshot' });
                    return fail('資料已在其他分頁或同步中更新，請重新整理後再操作。');
                }
                return action();
            };
            return navigator.locks ? await navigator.locks.request('class-pets-' + expectedClass, execute) : execute();
        } catch (e) {
            console.error('[ClassPets]', e);
            reportPetFailure(operation, e, { failureStage: 'exception' });
            return fail('這次操作未完成，請確認資料與儲存空間後再試。');
        } finally { busy = false; render(); }
    }
    function collectionFor(roster = window.students || [], history = window.pointsHistory || [], config = settings()) {
        const found = {};
        for (const kind of Object.keys(pets)) {
            if (config.collection?.[kind]) {
                const saved = config.collection[kind];
                // 舊版只記錄種類，視為至少解鎖孵化後的 Lv.1；之後的階段必須
                // 由班級中實際達成過的寵物等級逐步留下紀錄。
                found[kind] = {
                    discoveredAt: saved.discoveredAt || null,
                    maxLevel: Math.max(1, Number(saved.maxLevel) || 0),
                };
            }
        }
        for (const student of roster) {
            const xp = xpFor(student.id, history, Number(student.petCarryXp) || 0);
            if (!student.classPetRevealed && xp < 10) continue;
            const kind = Object.hasOwn(pets, student.classPet) ? student.classPet : 'cat';
            if (!found[kind]) found[kind] = { discoveredAt: new Date().toISOString(), maxLevel: 0 };
            found[kind].maxLevel = Math.max(found[kind].maxLevel || 0, stage(xp).level, 1);
        }
        return Object.fromEntries(Object.keys(pets).filter(kind => found[kind]).map(kind => [kind, found[kind]]));
    }
    function collectionStagesFor(kind, collection = collectionFor()) {
        const maxLevel = Math.max(0, Number(collection[kind]?.maxLevel) || 0);
        return COLLECTION_VARIANTS.map(variant => ({ ...variant, unlocked: maxLevel >= variant.level }));
    }
    function preserveCollection() {
        const config = settings(), collection = collectionFor();
        if (!Object.keys(collection).length || JSON.stringify(config.collection || {}) === JSON.stringify(collection)) return true;
        return SafeStorage.set(KEY, JSON.stringify({ ...config, collection }), { context: '班級圖鑑解鎖紀錄' });
    }
    function openCollection() {
        const found = collectionFor(), count = Object.keys(found).length;
        const dialog = el('dialog', undefined, 'pet-collection');
        const header = el('header'), title = el('h2', '全班收集圖鑑'); title.id = 'pet-collection-title';
        dialog.setAttribute('aria-labelledby', title.id);
        header.append(title, button('關閉圖鑑', () => { dialog.close(); dialog.remove(); }));
        const content = el('div', undefined, 'pet-collection-body');
        const progress = el('p', `已收集 ${count} / ${Object.keys(pets).length} 種`); progress.setAttribute('role', 'status');
        const bar = el('progress'); bar.max = Object.keys(pets).length; bar.value = count; bar.setAttribute('aria-label', '全班圖鑑收集進度');
        const grid = el('div', undefined, 'pet-collection-grid');
        Object.entries(pets).forEach(([kind, [, name]], index) => {
            const number = String(index + 1).padStart(2, '0');
            if (!found[kind]) {
                const locked = el('div', undefined, 'pet-collection-locked');
                locked.append(el('small', `No.${number}`), el('span', '？'), el('strong', '未發現'));
                grid.append(locked); return;
            }
            const tile = button(undefined, () => showDetail(kind, number), 'pet-collection-unlocked');
            tile.setAttribute('aria-label', `查看已解鎖圖鑑：${name}`);
            tile.append(el('small', `No.${number}`), portrait(kind, 10), el('strong', name)); grid.append(tile);
        });
        const intro = el('p', count === Object.keys(pets).length ? '全圖鑑收集完成！這是全班一起累積的成果。' : '任一位同學孵化成功，全班就解鎖一格！未發現的寵物保留神祕，等下一顆蛋揭曉；進化階段則要由班級實際達成後才會揭開。');
        function showGrid() { content.replaceChildren(progress, bar, intro, grid); }
        function showDetail(kind, number) {
            const holders = (window.students || []).filter(s => s.classPet === kind && (s.classPetRevealed || xpFor(s.id) >= 10)).length;
            const variants = el('div', undefined, 'pet-collection-variants');
            const unlocked = collectionStagesFor(kind, found);
            unlocked.forEach(({ xp, level, unlocked: isUnlocked }) => {
                const figure = el('figure', undefined, isUnlocked ? '' : 'pet-collection-stage-locked');
                if (isUnlocked) figure.append(interactivePortrait(kind, xp), el('figcaption', `${appearance(xp).label}・Lv.${level}`));
                else figure.append(el('div', '？', 'pet-collection-stage-mask'), el('figcaption', `Lv.${level}・達成後解鎖`));
                variants.append(figure);
            });
            const moodsRow = el('div', undefined, 'pet-collection-variants');
            for (const [mood, label] of Object.entries(moods)) { const figure = el('figure'); figure.append(interactivePortrait(kind, 10, mood), el('figcaption', label)); moodsRow.append(figure); }
            const maxLevel = Math.max(...unlocked.filter(v => v.unlocked).map(v => v.level), 1);
            content.replaceChildren(button('← 返回收集進度', showGrid), el('h3', `No.${number} ${pets[kind][1]}`), el('p', `全班已解鎖・目前 ${holders} 位同學擁有；最高已達 Lv.${maxLevel}。已解鎖紀錄不因扣分或學生離班而消失。`), variants, el('h3', '表情樣態（孵化後可查看）'), moodsRow);
            content.querySelector('button').focus();
        }
        showGrid(); dialog.append(header, content); document.body.append(dialog);
        dialog.addEventListener('cancel', () => dialog.remove()); dialog.showModal();
    }
    function commit(nextStudents, nextGroups, nextHistory) {
        const values = [nextStudents, nextGroups, nextHistory];
        const config = settings(), collection = collectionFor(nextStudents, nextHistory, config);
        const writes = keys().map((k, i) => [k, JSON.stringify(values[i])]);
        if (Object.keys(collection).length) writes.push([KEY, JSON.stringify({ ...config, collection })]);
        if (!SafeStorage.write(writes, {
            context: '寵物獎勵與班級分數', feature: 'pet', petAction: 'save',
            classId: cid(), className: window.ClassProfiles?.currentProfile?.()?.name || ''
        })) return false;
        window.students = nextStudents; window.groups = nextGroups; window.pointsHistory = nextHistory;
        remember(); redraw();
        return true;
    }
    async function award(ids, points, reason, xpOverride, batchId = uid(), coinsOverride) {
        return change(() => {
            if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 1000) return fail('分數請填寫 -1000 到 1000 的非零整數。');
            const config = settings();
            const xp = config.enabled && points > 0 ? (xpOverride ?? points) : 0;
            const coins = config.coinsEnabled && points > 0 ? (coinsOverride ?? points) : 0;
            if (!Number.isInteger(xp) || xp < 0 || xp > 1000) return fail('成長值請填寫 0 到 1000 的整數。');
            if (!Number.isInteger(coins) || coins < 0 || coins > 1000) return fail('金幣請填寫 0 到 1000 的整數。');
            if (window.pointsHistory.some(r => r.petBatch === batchId)) return false;
            const unique = [...new Set(ids.map(String))];
            if (!unique.length || unique.some(id => !window.students.some(s => String(s.id) === id))) return fail('請選擇目前班級的學生。');
            const ss = clone(window.students), gg = clone(window.groups), hh = clone(window.pointsHistory);
            const events = [];
            const now = new Date();
            unique.forEach(id => {
                const s = ss.find(s => String(s.id) === id);
                const before = xpFor(id), after = before + xp;
                let blindOpened = false;
                if (!s.classPetRevealed && before >= 10) {
                    // 已孵化的舊版資料保留原本寵物，不重抽。
                    s.classPet = Object.hasOwn(pets, s.classPet) ? s.classPet : 'cat'; s.classPetRevealed = true;
                }
                if (!s.classPetRevealed && before < 10 && after >= 10) {
                    s.classPet = drawPet(); s.classPetRevealed = true; blindOpened = true;
                }
                const event = milestone(before, after);
                if (event) events.push({ ...event, name: s.name, kind: s.classPet, xp: after, blindOpened });
                s.points = (Number(s.points) || 0) + points;
                const g = gg.find(g => g.members.some(m => String(m.id) === id));
                if (g) g.score = (Number(g.score) || 0) + points;
                hh.unshift({ id: uid(), createdAtMs: Math.max(now.getTime(), (window.PointsReset?.lastResetId(hh) || 0) + 1), studentId: s.id, studentName: s.name,
                    points, reason: String(reason || '自訂加扣分').slice(0, 80), date: now.toLocaleDateString('zh-TW'),
                    timestamp: now.toLocaleString('zh-TW', { hour12: false }), petEvent: true, petXp: xp, coinDelta: coins,
                    petBatch: batchId, petGroupId: g?.id ?? null });
            });
            if (!commit(ss, gg, hh)) return false;
            selected.clear(); onlySelected = false; render();
            celebrate(events);
            notifyPet('reward', {
                count: unique.length, points, xp, coins,
                reason: String(reason || '自訂加扣分').slice(0, 80),
            });
            const hatches = events.filter(e => e.type === 'hatch');
            const levelUps = events.filter(e => e.type === 'level');
            if (hatches.length) notifyPet('hatch', {
                count: hatches.length,
                kinds: hatches.map(e => pets[e.kind]?.[1]).filter(Boolean),
                level: 1,
            });
            if (levelUps.length) notifyPet('level_up', {
                count: levelUps.length,
                level: Math.max(...levelUps.map(e => e.level)),
            });
            if (typeof NotificationSystem !== 'undefined') NotificationSystem.success(`已存本機 · ${unique.length} 人${xp ? `，每人成長 +${xp}` : ''}${coins ? `、金幣 +${coins}` : ''}`);
            return true;
        }, 'reward');
    }
    async function undo(ids) {
        return change(() => {
            const hh = clone(window.pointsHistory), ss = clone(window.students), gg = clone(window.groups);
            const originals = hh.filter(r => ids.includes(r.id) && r.petEvent && !r.petReverses);
            if (originals.some(r => r.petShopType)) return fail('商店兌換請使用退幣功能。');
            const deductions = new Map();
            originals.forEach(r => deductions.set(String(r.studentId), (deductions.get(String(r.studentId)) || 0) + (r.coinDelta || 0)));
            if ([...deductions].some(([id, amount]) => coinsFor(id) < amount)) return fail('金幣已用於兌換，請先退回相關兌換，再撤銷獎勵。');
            if (!originals.length || originals.some(r => hh.some(x => x.petReverses === r.id))) return fail('這筆獎勵已撤銷，請重新查看紀錄。');
            if (originals.some(r => !ss.some(s => String(s.id) === String(r.studentId)))) return fail('學生已不在目前名單，無法撤銷；原紀錄仍保留。');
            const reset = Math.max(0, ...hh.filter(r => r.type === 'reset').map(r => Number(r.createdAtMs || r.id) || 0));
            const now = new Date(), batch = uid();
            originals.forEach(r => {
                // 重置前的分數已歸零，只沖回成長值，不再扣一次班級分數。
                const points = Number(r.createdAtMs || r.id) > reset ? -r.points : 0;
                const s = ss.find(s => String(s.id) === String(r.studentId));
                if (!s.classPetRevealed && xpFor(s.id) >= 10) { s.classPet = Object.hasOwn(pets, s.classPet) ? s.classPet : 'cat'; s.classPetRevealed = true; }
                s.points = (Number(s.points) || 0) + points;
                const g = gg.find(g => g.id === r.petGroupId);
                if (g) g.score = (Number(g.score) || 0) + points;
                hh.unshift({ id: uid(), createdAtMs: now.getTime(), studentId: s.id, studentName: s.name,
                    points, reason: '撤銷：' + r.reason, date: now.toLocaleDateString('zh-TW'), timestamp: now.toLocaleString('zh-TW', { hour12: false }),
                    petEvent: true, petXp: -r.petXp, coinDelta: -(r.coinDelta || 0), petBatch: batch, petReverses: r.id, petGroupId: r.petGroupId });
            });
            const ok = commit(ss, gg, hh);
            if (ok) notifyPet('undo', {
                count: originals.length,
                points: originals.reduce((sum, r) => sum + (Number(r.points) || 0), 0),
                xp: originals.reduce((sum, r) => sum + (Number(r.petXp) || 0), 0),
                coins: originals.reduce((sum, r) => sum + (Number(r.coinDelta) || 0), 0),
            });
            return ok;
        }, 'undo');
    }
    function el(tag, text, cls) {
        const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e;
    }
    function button(text, action, cls) { const b = el('button', text, cls); b.type = 'button'; b.addEventListener('click', action); return b; }
    function confirmAction(message) {
        return new Promise(resolve => {
            const dialog = el('dialog', undefined, 'pet-confirm');
            const title = el('h3', '確認獎勵操作'); title.id = 'pet-confirm-title';
            dialog.setAttribute('aria-labelledby', title.id);
            const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
            const actions = el('div', undefined, 'pet-tools');
            actions.append(button('取消', () => finish(false)), button('確定', () => finish(true), 'pet-primary'));
            dialog.append(title, el('p', message), actions);
            dialog.addEventListener('cancel', e => { e.preventDefault(); finish(false); });
            document.body.append(dialog); dialog.showModal(); actions.querySelector('button').focus();
        });
    }
    function saveSettings(config, notification = {}) {
        return change(() => {
            if (!SafeStorage.set(KEY, JSON.stringify(config), {
                context: '寵物獎勵設定', feature: 'pet', petAction: 'settings',
                classId: cid(), className: window.ClassProfiles?.currentProfile?.()?.name || ''
            })) return false;
            remember(); render();
            notifyPet('settings', notification);
            return true;
        }, 'settings');
    }
    function setCoinsEnabled(enabled) {
        const config = settings();
        return saveSettings({ ...config, coinsEnabled: enabled,
            ...(enabled && !config.coinsEnabledAt ? { coinsEnabledAt: new Date().toISOString() } : {}),
            rules: config.rules.map(r => ({ ...r, coins: r.coins ?? Math.max(0, r.points) })) },
            { action: enabled ? '啟用金幣' : '暫停金幣累積' });
    }
    function saveRule(values, id = null) {
        const name = String(values.name || '').trim();
        const points = Number(values.points), xp = Number(values.xp), coins = Number(values.coins);
        if (!name || name.length > 40 || !Number.isInteger(points) || !points || Math.abs(points) > 1000 ||
            !Number.isInteger(xp) || xp < 0 || xp > 1000 || !Number.isInteger(coins) || coins < 0 || coins > 1000 ||
            (points < 0 && (xp !== 0 || coins !== 0))) return Promise.resolve(fail('請填寫名稱與非零整數分數；成長值、金幣需為 0～1000 的整數，扣分規則請設為 0。'));
        const config = settings();
        if (id && !config.rules.some(r => r.id === id)) return Promise.resolve(fail('這項規則已不存在，請重新選取。'));
        const rule = { id: id || uid(), name, points, xp, coins };
        return saveSettings({ ...config, rules: id ? config.rules.map(r => r.id === id ? rule : r) : [...config.rules, rule] },
            { action: id ? '更新獎勵規則' : '新增獎勵規則', reason: name });
    }
    function saveProduct(values, id = null) {
        const name = String(values.name || '').trim(), cost = Number(values.cost);
        if (!name || name.length > 40 || !Number.isSafeInteger(cost) || cost < 1 || cost > 10000) return Promise.resolve(fail('商品名稱限 40 字，價格請填 1～10000 的整數。'));
        const config = settings(), products = config.products || [];
        if (id && !products.some(p => p.id === id)) return Promise.resolve(fail('商品已不存在，請重新整理。'));
        const product = { id: id || uid(), name, cost, active: products.find(p => p.id === id)?.active ?? true };
        return saveSettings({ ...config, products: id ? products.map(p => p.id === id ? product : p) : [...products, product] },
            { action: id ? '更新商店商品' : '新增商店商品', productName: name, cost });
    }
    function setProductActive(id, active) {
        const config = settings();
        return saveSettings({ ...config, products: (config.products || []).map(p => p.id === id ? { ...p, active: !!active } : p) },
            { action: active ? '商品上架' : '商品下架' });
    }
    async function redeem(studentId, productId, expectedCost, requestId = uid()) {
        return change(() => {
            if (window.pointsHistory.some(r => r.petShopRequest === requestId)) return false;
            const student = window.students.find(s => String(s.id) === String(studentId));
            const product = (settings().products || []).find(p => p.id === productId && p.active);
            if (!student || !product) return fail('請選擇目前班級的學生與上架商品。');
            if (!Number.isSafeInteger(product.cost) || product.cost < 1 || product.cost !== expectedCost) return fail('商品價格已變更，請重新確認。');
            if (coinsFor(student.id) < product.cost) return fail('金幣不足，尚未兌換或扣款。');
            const now = new Date();
            const record = { id: uid(), studentId: student.id, studentName: student.name, points: 0, petXp: 0, petEvent: true,
                coinDelta: -product.cost, petShopType: 'redeem', petShopRequest: requestId, productId, productName: product.name, productCost: product.cost,
                reason: '兌換：' + product.name, createdAtMs: now.getTime(), date: now.toLocaleDateString('zh-TW'), timestamp: now.toLocaleString('zh-TW', { hour12: false }) };
            const ok = commit(window.students, window.groups, [record, ...window.pointsHistory]);
            if (ok) notifyPet('redeem', { count: 1, cost: product.cost, productName: product.name, action: '兌換' });
            return ok;
        }, 'shop_redeem');
    }
    async function refund(id) {
        return change(() => {
            const record = window.pointsHistory.find(r => r.id === id && r.petShopType === 'redeem');
            if (!record || window.pointsHistory.some(r => r.petReverses === id)) return fail('這筆兌換不存在或已退幣。');
            if (!window.students.some(s => String(s.id) === String(record.studentId))) return fail('學生已不在本班，請先還原學生名單再退幣。');
            if (!Number.isSafeInteger(record.productCost) || record.productCost < 1 || record.coinDelta !== -record.productCost) return fail('原始兌換金額不符，無法退幣。');
            const now = new Date();
            const reversal = { ...record, id: uid(), coinDelta: record.productCost, petShopType: 'refund', petReverses: id,
                petShopRequest: uid(), reason: '退幣：' + record.productName, createdAtMs: now.getTime(), date: now.toLocaleDateString('zh-TW'), timestamp: now.toLocaleString('zh-TW', { hour12: false }) };
            const ok = commit(window.students, window.groups, [reversal, ...window.pointsHistory]);
            if (ok) notifyPet('refund', { count: 1, cost: record.productCost, productName: record.productName, action: '退幣' });
            return ok;
        }, 'shop_refund');
    }
    function renderShop(root, config) {
        const shop = el('details', undefined, 'pet-shop'); shop.dataset.petKey = 'shop'; shop.append(el('summary', '🛍️ 兌換商店與退幣'));
        shop.append(el('p', '老師代為兌換，每次一位學生、一件商品。只扣金幣，不扣分數或成長值。獎勵由老師安排交付；退幣會保留原始紀錄。'));
        const account = window.FirebaseConfig?.getCurrentProfile?.();
        shop.append(el('p', window.FirebaseConfig?.isGoogleUser?.() ? `雲端歸屬：${account?.email || account?.displayName || '目前登入的 Google 帳號'}。商品與紀錄沿用本班雲端同步，換裝置前請確認同步成功。` : '目前先存本機。登入老師自己的 Google 帳號後，商品與紀錄會隨本班資料同步。', 'pet-shop-sync'));
        const students = el('select'); students.setAttribute('aria-label', '兌換學生'); students.add(new Option('請選擇學生…', ''));
        window.students.forEach(s => students.add(new Option(`${s.number || ''} ${s.name} · 金幣 ${coinsFor(s.id)}`, String(s.id)))); students.value = shopStudent;
        students.addEventListener('change', () => { shopStudent = students.value; shopPage = 0; render(); });
        const products = el('select'); products.setAttribute('aria-label', '兌換商品'); products.add(new Option('請選擇商品…', ''));
        (config.products || []).filter(p => p.active).forEach(p => products.add(new Option(`${p.name} · ${p.cost} 金幣`, p.id))); products.value = shopProduct;
        products.addEventListener('change', () => { shopProduct = products.value; render(); });
        const product = (config.products || []).find(p => p.id === shopProduct && p.active);
        const student = window.students.find(s => String(s.id) === shopStudent);
        const balance = student ? coinsFor(student.id) : 0;
        const preview = el('p', !student ? '先選學生，即可查看金幣餘額與兌換紀錄。' : !product ? `可用金幣 ${balance}，請選擇商品。` : balance < product.cost ? `可用金幣 ${balance}，還差 ${product.cost - balance} 金幣。` : `可用金幣 ${balance} → 兌換後 ${balance - product.cost}`);
        const buy = button('確認兌換', async () => {
            if (!student || !product || !await confirmAction(`${student.name} 兌換「${product.name}」？\n扣除 ${product.cost} 金幣，餘額 ${balance - product.cost}。分數與成長值不變。`)) return;
            if (await redeem(student.id, product.id, product.cost)) window.NotificationSystem?.success?.('兌換已存本機');
        }, 'pet-primary'); buy.disabled = !student || !product || balance < product.cost || busy;
        const controls = el('div', undefined, 'pet-shop-controls'); controls.append(students, products, preview, buy); shop.append(controls);
        const manage = el('details'); manage.dataset.petKey = 'products'; manage.append(el('summary', '管理商品（新增／改價／上下架）'));
        const form = el('form', undefined, 'pet-product-editor');
        form.append(el('strong', editingProduct ? '編輯商品' : '新增商品'));
        const name = el('input'); name.required = true; name.maxLength = 40; name.value = productDraft.name; name.placeholder = '例如：優先選座位'; name.setAttribute('aria-label', '商品名稱'); name.dataset.petFocus = 'product-name'; name.addEventListener('input', () => productDraft.name = name.value);
        const cost = el('input'); cost.type = 'number'; cost.required = true; cost.min = 1; cost.max = 10000; cost.step = 1; cost.value = productDraft.cost; cost.setAttribute('aria-label', '商品價格（金幣）'); cost.addEventListener('input', () => productDraft.cost = cost.value);
        const submit = el('button', editingProduct ? '儲存商品' : '新增商品', 'pet-primary'); submit.type = 'submit';
        const nameLabel = el('label', '商品名稱'), costLabel = el('label', '價格（金幣）'); nameLabel.append(name); costLabel.append(cost);
        form.append(nameLabel, costLabel, submit);
        if (editingProduct) form.append(button('取消商品編輯', () => { editingProduct = null; productDraft = { name: '', cost: '10' }; render(); }));
        form.addEventListener('submit', async e => { e.preventDefault(); if (await saveProduct({ name: name.value, cost: cost.value }, editingProduct)) { editingProduct = null; productDraft = { name: '', cost: '10' }; render(); window.NotificationSystem?.success?.('商品已存本機'); } });
        manage.append(form);
        (config.products || []).forEach(p => {
            const row = el('div', undefined, 'pet-rule');
            const edit = button('編輯商品', () => { editingProduct = p.id; productDraft = { name: p.name, cost: String(p.cost) }; render(); document.querySelector('[data-pet-focus="product-name"]')?.focus(); }); edit.setAttribute('aria-label', `編輯商品「${p.name}」`);
            row.append(el('span', `${p.name} · ${p.cost} 金幣 · ${p.active ? '上架中' : '已下架'}`), edit, button(p.active ? '下架' : '重新上架', () => setProductActive(p.id, !p.active))); manage.append(row);
        });
        shop.append(manage, el('h3', '兌換與退幣紀錄'));
        shop.append(el('p', '依上方所選學生篩選，每頁 20 筆。改價或下架不影響歷史成交金額；每筆僅能退幣一次。學期封存後請到封存備份查閱舊紀錄。'));
        const history = window.pointsHistory.filter(r => r.petShopType && (!shopStudent || String(r.studentId) === shopStudent));
        history.slice(shopPage * 20, (shopPage + 1) * 20).forEach(r => {
            const returned = window.pointsHistory.some(x => x.petReverses === r.id);
            const row = el('div', undefined, 'pet-history');
            row.append(el('strong', `${r.studentName} · ${r.productName}`), el('span', `${r.petShopType === 'refund' ? '退幣 +' : '兌換 -'}${r.productCost} 金幣`), el('small', r.timestamp));
            if (r.petShopType === 'redeem' && !returned) row.append(button('退回金幣', async () => { if (await confirmAction(`取消 ${r.studentName} 的「${r.productName}」兌換，退回 ${r.productCost} 金幣？`)) { if (await refund(r.id)) window.NotificationSystem?.success?.('退幣已存本機'); } }));
            else if (returned) row.append(el('span', '已退幣'));
            shop.append(row);
        });
        if (!history.length) shop.append(el('p', '尚無兌換紀錄。'));
        const paging = el('div', undefined, 'pet-tools');
        if (shopPage > 0) paging.append(button('上一頁兌換', () => { shopPage--; render(); }));
        paging.append(el('span', `第 ${shopPage + 1} / ${Math.max(1, Math.ceil(history.length / 20))} 頁`));
        if ((shopPage + 1) * 20 < history.length) paging.append(button('下一頁兌換', () => { shopPage++; render(); }));
        shop.append(paging); root.append(shop);
    }
    async function requestCoinsToggle() {
        const config = settings();
        if (!await confirmAction(config.coinsEnabled ? '暫停本班金幣累積？現有金幣與紀錄會保留。' : '啟用後才開始累積金幣，舊分數不換算。\n原本正向加分會發放等量金幣；尚未設定金幣的規則將先使用相同數量，可在規則編輯中調整。')) return;
        await setCoinsEnabled(!config.coinsEnabled);
    }
    function renderPointsBridge() {
        const section = document.getElementById('points-section'); if (!section) return;
        let panel = document.getElementById('points-pet-bridge');
        if (!panel) { panel = el('aside', undefined, 'points-pet-bridge'); panel.id = 'points-pet-bridge'; panel.setAttribute('aria-label', '加分與寵物連動設定'); section.querySelector('h2').after(panel); }
        const config = settings(); panel.replaceChildren();
        panel.append(el('strong', '🐾 加分，也能陪寵物一起成長'));
        const state = el('p', `本班寵物成長：${config.enabled ? '累積中' : '未啟用／已暫停'}　｜　金幣：${config.coinsEnabled ? '累積中' : '未啟用／已暫停'}`); state.setAttribute('role', 'status'); panel.append(state);
        const rewards = [config.enabled ? '寵物成長 ＋3' : '成長未啟用', config.coinsEnabled ? '金幣 ＋3' : '金幣未啟用'];
        panel.append(el('p', `在這裡加 3 分 → ${rewards.join('、')}。一般扣分不扣成長或金幣；啟用前的舊分數不補發。`));
        const actions = el('div', undefined, 'points-pet-actions');
        if (!config.enabled) actions.append(button('啟用本班寵物成長', () => { prepare(); return saveSettings({ ...settings(), enabled: true, enabledAt: config.enabledAt || new Date().toISOString() }); }));
        if (!config.coinsEnabled) actions.append(button('啟用本班金幣', () => { prepare(); return requestCoinsToggle(); }));
        actions.append(button('查看寵物、圖鑑與商店 →', () => { prepare(); render(); window.showSection('pets'); }));
        panel.append(actions);
    }
    function render() {
        renderPointsBridge();
        const root = document.getElementById('pets-section'); if (!root) return;
        const scroll = window.scrollY || 0;
        const opened = [...root.querySelectorAll('details[open][data-pet-key]')].map(d => d.dataset.petKey);
        const focusKey = root.contains(document.activeElement) ? document.activeElement.dataset.petFocus : null;
        renderContent(root);
        opened.forEach(key => { const d = [...root.querySelectorAll('details[data-pet-key]')].find(d => d.dataset.petKey === key); if (d) d.open = true; });
        if (focusKey) [...root.querySelectorAll('[data-pet-focus]')].find(e => e.dataset.petFocus === focusKey)?.focus({ preventScroll: true });
        if (!root.classList.contains('hidden')) window.scrollTo?.({ top: scroll, behavior: 'instant' });
    }
    function renderContent(root) {
        prepare();
        const config = settings(); root.replaceChildren();
        root.append(el('h2', '🐾 班級寵物'), el('p', `目前班級：${window.ClassProfiles?.currentProfile()?.name || '預設班級'}`, 'class-context'));
        if (!config.enabled) {
            root.append(el('p', '從今天的努力開始養一隻寵物。啟用後，原本的正向加分會同時獲得等量成長值；舊分數不換算，扣分不讓寵物退化。'));
            root.append(button('啟用本班寵物成長', () => saveSettings({ ...config, enabled: true, enabledAt: new Date().toISOString() }), 'pet-primary'));
            if (!config.coinsEnabled && !(window.pointsHistory || []).some(r => r.petEvent)) return;
        }
        const guide = el('details', undefined, 'pet-guide'); guide.dataset.petKey = 'guide';
        guide.append(el('summary', '成長指南與同步說明'));
        guide.append(el('p', '10 成長值孵化，每增加 20 成長值升一級。Lv.1 幼年 → Lv.3 成長 → Lv.5 成熟。分數歸零不影響成長；撤銷誤加獎勵會回復成長。'));
        guide.append(el('p', `${Object.keys(pets).length} 種寵物藏在神祕蛋中，孵化才揭曉種類；各有幼年、成長、成熟造型，圖鑑只會顯示班級中實際達成過的進化階段，未達成的階段會保持神秘。孵化後可選精神飽滿、開心歡呼或安心休息樣態。蛋會隨成長值變化：0–2 安靜孵育、3–5 出現裂紋、6–8 裂縫擴大、9 即將破殼。首次達到 10 才隨機揭曉，抽出後固定保留，撤銷再加分不重抽。表情只改外觀，不影響分數、成長或金幣。`));
        guide.append(el('p', '資料先存在本機，登入後沿用雲端同步。換裝置前請完成同步，同一班請避免兩台裝置同時加分。'));
        guide.append(el('p', '通知會留在使用紀錄：孵化、升級、撤銷、商店兌換／退幣與設定變更即時送 webhook；一般獎勵併入每日戰報。寵物資料儲存、同步或設定失敗會標示為寵物系統錯誤並通知。'));
        root.append(guide);
        root.append(el('p', '輕點蛋或寵物，和牠打個招呼！互動不會增加成長值或金幣。', 'pet-touch-hint'));
        root.append(button(`全班收集圖鑑 · ${Object.keys(collectionFor()).length} / ${Object.keys(pets).length}`, openCollection, 'pet-collection-entry'));
        const wallet = el('div', undefined, 'pet-wallet-status');
        wallet.append(el('strong', config.coinsEnabled ? '🪙 本班金幣累積中' : '🪙 本班金幣尚未啟用／已暫停'));
        const coinGuide = el('details'); coinGuide.dataset.petKey = 'coins-guide'; coinGuide.append(el('summary', '金幣規則與使用說明'), el('p', '金幣與成長值分開記錄。啟用後，原本正向加分會獲得等量金幣；自訂規則可調整金額。舊分數不換算，一般扣分與分數歸零不扣金幣，撤銷獎勵會扣回該筆金幣。可在兌換商店使用金幣；暫停累積後仍可使用餘額。'));
        wallet.append(button(config.coinsEnabled ? '暫停金幣累積' : '啟用本班金幣', requestCoinsToggle)); wallet.append(coinGuide); root.append(wallet);
        renderShop(root, config);
        const views = el('div', undefined, 'pet-view-tools'); views.setAttribute('aria-label', '寵物顯示方式');
        ['compact', 'cards'].forEach(mode => {
            const b = button(mode === 'compact' ? '精簡名單' : '成長卡片', () => { viewMode = mode; try { localStorage.setItem('petViewMode', mode); } catch {} render(); });
            b.setAttribute('aria-pressed', String(viewMode === mode)); b.dataset.petFocus = mode; views.append(b);
        });
        const selectedFilter = button('只看已選', () => { onlySelected = !onlySelected; render(); });
        selectedFilter.setAttribute('aria-pressed', String(onlySelected)); selectedFilter.dataset.petFocus = 'selected-filter'; views.append(selectedFilter); root.append(views);
        const tools = el('div', undefined, 'pet-tools');
        const search = el('input'); search.type = 'search'; search.placeholder = '搜尋姓名或座號'; search.value = query; search.setAttribute('aria-label', '搜尋寵物學生');
        search.dataset.petFocus = 'search';
        search.addEventListener('input', () => { query = search.value; renderCards(); updateCount(); page = 0; renderHistory(); });
        tools.append(search, button('選取目前顯示學生', () => { visibleStudents().forEach(s => selected.add(String(s.id))); render(); }), button('取消選取', () => { selected.clear(); render(); }));
        const groupSelect = el('select'); groupSelect.setAttribute('aria-label', '選取小組'); groupSelect.add(new Option('選取整組…', ''));
        groupSelect.dataset.petFocus = 'group';
        window.groups.forEach((g, i) => groupSelect.add(new Option(g.name, String(i))));
        groupSelect.addEventListener('change', () => { if (groupSelect.value !== '') { window.groups[Number(groupSelect.value)].members.forEach(s => selected.add(String(s.id))); render(); } });
        tools.append(groupSelect); root.append(tools);
        const cards = el('div', undefined, 'pet-cards' + (viewMode === 'compact' ? ' pet-compact' : '')); root.append(cards);
        function visibleStudents() { return window.students.filter(s => `${s.name} ${s.number || s.seatNumber || ''}`.includes(query.trim()) && (!onlySelected || selected.has(String(s.id)))); }
        function renderCards() {
            cards.replaceChildren();
            const list = visibleStudents();
            if (!list.length) {
                cards.append(el('p', onlySelected ? '目前沒有符合的已選學生。可返回全部名單繼續選取。' : '沒有符合的學生，請調整搜尋或先到學生管理新增名單。'));
                if (onlySelected || query) cards.append(button('返回全部名單', () => { onlySelected = false; query = ''; render(); }));
            }
            list.forEach(s => {
                const xp = xpFor(s.id), growth = stage(xp), kind = Object.hasOwn(pets, s.classPet) ? s.classPet : 'cat';
                const card = el('article', undefined, 'pet-card');
                const label = el('label', undefined, 'pet-student'); const check = el('input'); check.type = 'checkbox'; check.checked = selected.has(String(s.id));
                check.dataset.petFocus = 'student-' + s.id;
                check.addEventListener('change', () => { check.checked ? selected.add(String(s.id)) : selected.delete(String(s.id)); if (onlySelected) render(); else updateCount(); });
                label.append(check, el('span', `${s.number || s.seatNumber || ''} ${s.name}`));
                const avatar = el('div', undefined, 'pet-avatar'); avatar.append(interactivePortrait(kind, xp, s.classPetMood || 'normal'));
                card.append(label, avatar, el('strong', `${xp < 10 ? '神祕寵物蛋' : pets[kind][1]} · ${appearance(xp).label}${growth.level ? ' · ' + growth.label : ''}`, 'pet-stage-label'));
                const progress = el('progress'); progress.max = growth.next - growth.start; progress.value = xp - growth.start; progress.setAttribute('aria-label', `${s.name}成長進度`);
                card.append(progress, el('p', `成長值 ${xp} · 距離${growth.level ? '升級' : '孵化'}還有 ${growth.next - xp}`));
                card.append(el('span', `🪙 金幣 ${coinsFor(s.id)}`, 'pet-coin-balance'));
                const options = el('details', undefined, 'pet-card-options'); options.dataset.petKey = 'options-' + s.id; options.append(el('summary', '寵物表情'));
                const mood = el('select'); mood.setAttribute('aria-label', `${s.name}的表情樣態`);
                Object.entries(moods).forEach(([key, label]) => mood.add(new Option(label, key))); mood.value = s.classPetMood || 'normal';
                mood.addEventListener('change', () => setPetMood(s.id, mood.value));
                options.append(el('p', '表情樣態（孵化後顯示）'), mood);
                if (xp >= 10) card.append(options); cards.append(card);
            });
        }
        const bar = el('div', undefined, 'pet-award-bar'); const count = el('span'); count.setAttribute('role', 'status');
        const ruleSelect = el('select'); ruleSelect.setAttribute('aria-label', '獎勵規則');
        ruleSelect.dataset.petFocus = 'rule';
        config.rules.forEach(r => ruleSelect.add(new Option(`${r.name} · ${r.points > 0 ? '+' : ''}${r.points} 分 / 成長 +${config.enabled ? r.xp : 0} / 金幣 +${config.coinsEnabled ? (r.coins || 0) : 0}`, r.id)));
        if (config.rules.some(r => r.id === selectedRule)) ruleSelect.value = selectedRule;
        ruleSelect.addEventListener('change', () => { selectedRule = ruleSelect.value; });
        const give = button('確認發放', async () => {
            const r = config.rules.find(r => r.id === ruleSelect.value); if (!r) return;
            const ids = [...selected].filter(id => window.students.some(s => String(s.id) === id));
            if (!ids.length) return fail('請先選取學生。');
            if (!await confirmAction(`發放「${r.name}」給 ${ids.length} 位學生？\n每人 ${r.points} 分、成長 +${config.enabled ? r.xp : 0}、金幣 +${config.coinsEnabled ? (r.coins || 0) : 0}。`)) return;
            give.disabled = true;
            await award(ids, r.points, r.name, r.xp, undefined, r.coins || 0);
            give.disabled = false;
        }, 'pet-primary');
        give.dataset.petFocus = 'award';
        function updateCount() { bar.classList.toggle('pet-award-active', selected.size > 0); const shown = visibleStudents().filter(s => selected.has(String(s.id))).length; count.textContent = `已選 ${selected.size} 人${selected.size > shown ? `（篩選外 ${selected.size - shown} 人）` : ''}`; give.disabled = !selected.size || busy; }
        bar.append(count, ruleSelect, give); root.append(bar); renderCards(); updateCount();
        const rules = el('details'); rules.dataset.petKey = 'rules'; rules.append(el('summary', '⚙️ 自訂獎勵規則與設定'));
        rules.append(el('p', '規則修改只影響之後的發放；已發放的分數、成長值與金幣不會改動。'));
        const form = el('form', undefined, 'pet-rule-editor');
        form.append(el('strong', editingRuleId ? '編輯獎勵規則' : '新增獎勵規則'));
        const name = el('input'); name.required = true; name.maxLength = 40; name.placeholder = '規則名稱'; name.setAttribute('aria-label', '規則名稱');
        name.value = ruleDraft.name; name.dataset.petFocus = 'rule-name'; name.addEventListener('input', () => { ruleDraft.name = name.value; });
        function number(label, value, min) { const wrapper = el('label', label); const input = el('input'); input.type = 'number'; input.value = value; input.required = true; input.min = min; input.max = 1000; input.step = 1; wrapper.append(input); return [wrapper, input]; }
        const [pl, point] = number('分數', ruleDraft.points, -1000), [xl, xp] = number('成長值', ruleDraft.xp, 0), [cl, coins] = number('金幣', ruleDraft.coins, 0);
        [[point, 'points'], [xp, 'xp'], [coins, 'coins']].forEach(([input, key]) => { input.dataset.petFocus = 'rule-' + key; input.addEventListener('input', () => { ruleDraft[key] = input.value; }); });
        const submit = el('button', editingRuleId ? '儲存規則' : '新增規則', 'pet-primary'); submit.type = 'submit';
        const actions = el('div', undefined, 'pet-tools'); actions.append(submit);
        if (editingRuleId) actions.append(button('取消編輯', () => { editingRuleId = null; ruleDraft = blankRule(); render(); }));
        form.append(name, pl, xl, cl, actions);
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const ok = await saveRule({ name: name.value, points: point.value, xp: xp.value, coins: coins.value }, editingRuleId);
            if (ok) { editingRuleId = null; ruleDraft = blankRule(); render(); if (typeof NotificationSystem !== 'undefined') NotificationSystem.success('規則已存本機'); }
        });
        rules.append(form);
        config.rules.forEach(r => {
            const row = el('div', undefined, 'pet-rule');
            const edit = button('編輯', () => { editingRuleId = r.id; ruleDraft = { name: r.name, points: String(r.points), xp: String(r.xp), coins: String(r.coins || 0) }; render(); document.querySelector('[data-pet-focus="rule-name"]')?.focus(); });
            edit.setAttribute('aria-label', `編輯「${r.name}」規則`);
            row.append(el('span', `${r.name} · ${r.points} 分 / 成長 ${r.xp} / 金幣 ${r.coins || 0}`), edit, button('移除規則', async () => {
                const ok = await saveSettings({ ...config, rules: config.rules.filter(x => x.id !== r.id) });
                if (ok && editingRuleId === r.id) { editingRuleId = null; ruleDraft = blankRule(); render(); }
            })); rules.append(row);
        });
        if (config.enabled) rules.append(button('暫停成長獎勵（保留寵物與紀錄）', () => saveSettings({ ...config, enabled: false })));
        root.append(rules);
        const history = el('details'); history.dataset.petKey = 'history'; history.append(el('summary', '📒 獎勵紀錄與撤銷'));
        history.append(el('p', '顯示本次搜尋學生的紀錄，每頁 30 筆。撤銷保留原紀錄；已歸零的舊分數不重複扣回。'));
        let page = 0;
        const rows = el('div'); const paging = el('div', undefined, 'pet-tools');
        function renderHistory() {
            const matches = new Set(visibleStudents().map(s => String(s.id)));
            const records = (window.pointsHistory || []).filter(r => r.petEvent && !r.petShopType && matches.has(String(r.studentId)));
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
                const row = el('div', undefined, 'pet-history'); row.append(el('strong', `${r.studentName} · ${r.reason}`), el('span', `${r.points > 0 ? '+' : ''}${r.points} 分 · 成長 ${r.petXp >= 0 ? '+' : ''}${r.petXp} · 金幣 ${(r.coinDelta || 0) >= 0 ? '+' : ''}${r.coinDelta || 0}`), el('small', r.timestamp));
                if (r.petReverses || reversed) row.append(el('span', r.petReverses ? '撤銷紀錄' : '已撤銷'));
                else {
                    row.append(button('撤銷這筆', async () => { if (await confirmAction(`撤銷 ${r.studentName} 的「${r.reason}」？`)) undo([r.id]); }));
                    const batch = batches.get(r.petBatch) || [];
                    if (batch.length > 1) row.append(button(`撤銷整批 ${batch.length} 人`, async () => { if (await confirmAction(`撤銷這批尚未撤銷的 ${batch.length} 筆獎勵？`)) undo(batch.map(x => x.id)); }));
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
        preserveCollection(); remember();
        const menu = document.getElementById('feature-menu-grid') || document.querySelector('button[onclick="showSection(\'grouping\')"]')?.parentElement;
        const nav = button(undefined, () => { window.UsageNotify?.feature?.('pets'); render(); window.showSection('pets'); }, 'bg-gradient-to-br from-amber-50 to-orange-50 p-3 sm:p-4 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 border-l-4 border-amber-500 active:scale-95');
        nav.id = 'petsNavBtn';
        nav.append(el('div', '🐾', 'text-2xl sm:text-3xl mb-1 sm:mb-2'), el('div', '班級寵物', 'font-semibold text-gray-700 text-sm sm:text-base'));
        menu?.append(nav);
        const section = el('section', undefined, 'section hidden'); section.id = 'pets-section'; document.getElementById('grouping-section')?.after(section);
        const entry = button('🐾 寵物成長／批次獎勵', () => { window.UsageNotify?.feature?.('pets'); render(); window.showSection('pets'); }, 'pet-nav'); document.getElementById('pointsHistory')?.before(entry);
        // 同頁正常操作也會改動共用資料；獎勵操作開始時仍檢查其他分頁造成的衝突。
        document.addEventListener('click', e => { if (!busy && !e.target.closest('#pets-section') && !e.target.closest('#points-section')) prepare(); });
        window.addEventListener('storage', () => { /* 保留快照，下一次操作會阻擋過期分頁。 */ });
        render();
        if (location.hash === '#pets') window.showSection('pets');
    }
    window.ClassPets = { award, undo, xpFor, coinsFor, setCoinsEnabled, saveRule, saveProduct, setProductActive, redeem, refund, setPetMood, assetName, stage, appearance, milestone, render, prepare, settings, collectionFor, collectionStagesFor };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
