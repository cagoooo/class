// 同一個班級開在兩個分頁：一邊存檔不能把另一邊剛寫的內容蓋掉（v3.73.0）
// 每個「分頁」有自己的執行環境與記憶體，共用同一份 localStorage；一邊寫入，另一邊會收到 storage 事件（和瀏覽器相同）。
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const SOURCE = fs.readFileSync('js/class-aware-storage.js', 'utf8');

function createBrowser(initial) {
    const shared = new Map(initial || []);
    const tabs = [];
    /** 開一個分頁。options.deaf：收不到 storage 事件（模擬被瀏覽器凍結的背景分頁）。 */
    function openTab(options = {}) {
        const tab = { deaf: !!options.deaf };
        class TabStorage {
            constructor(data) { this.data = data; }
            getItem(k) { return this.data.get(k) ?? null; }
            setItem(k, v) { const old = this.data.get(k) ?? null, next = String(v); this.data.set(k, next); if (this.data === shared && old !== next) broadcast(tab, k, old, next); }
            removeItem(k) { const old = this.data.get(k) ?? null; this.data.delete(k); if (this.data === shared && old !== null) broadcast(tab, k, old, null); }
            key(i) { return [...this.data.keys()][i] ?? null; }
            get length() { return this.data.size; }
        }
        const local = new TabStorage(shared), session = new TabStorage(options.session || new Map());
        const listeners = {}, docListeners = {};
        const state = { busy: !!options.busy, typing: false, hidden: !!options.hidden, focused: options.focused !== false };
        const timers = [], intervals = [], notices = [], calls = [];
        let reloads = 0, now = options.now || 1700000000000;
        const c = {
            Storage: TabStorage, localStorage: local, sessionStorage: session,
            console: { log() {}, warn() {}, error() {} },
            Date: class extends Date { static now() { return now; } },
            document: {
                readyState: 'complete', get hidden() { return state.hidden; }, hasFocus: () => state.focused,
                get activeElement() { return { matches: () => state.typing }; },
                addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
                getElementById() { return null; },
            },
            addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
            dispatchEvent(e) { calls.push('event:' + e.type); (listeners[e.type] || []).forEach(fn => fn(e)); return true; },
            CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
            setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {},
            setInterval(fn) { intervals.push(fn); return intervals.length; }, clearInterval() {}, alert() {},
            location: { reload() { reloads++; } },
            FirebaseConfig: { isPageBusy: () => state.busy },
            NotificationSystem: { show(text, kind) { notices.push({ kind, text }); } },
            ClassPets: { prepare() { calls.push('pets.prepare'); }, render() { calls.push('pets.render'); local.getItem('petSettings'); } },
        };
        for (const fn of ['renderStudents', 'renderGroups', 'renderPointsStudentList', 'renderPointsHistory', 'renderNotebook', 'renderHomework', 'renderLotteryHistory']) c[fn] = () => calls.push(fn);
        c.window = c; vm.createContext(c);
        vm.runInContext(SOURCE, c);
        Object.assign(tab, {
            c, state, local, session, notices, calls,
            reloads: () => reloads,
            advance(ms) { now += ms; },
            fire(type, e) { (listeners[type] || []).forEach(fn => fn(e || {})); },
            fireDoc(type, e) { const event = Object.assign({ stopped: false, stopImmediatePropagation() { this.stopped = true; }, preventDefault() {} }, e); (docListeners[type] || []).forEach(fn => fn(event)); return event; },
            runTimers() { while (timers.length) timers.shift()(); },
            tick() { intervals.forEach(fn => fn()); },
            /** 主頁面開機：把班級資料讀進全域變數（和 classnew.html 的 bootRead 相同） */
            boot(classId) {
                const suffix = classId && classId !== 'default' ? '-' + classId : '';
                c.STUDENTS_KEY = 'students' + suffix; c.POINTS_HISTORY_KEY = 'pointsHistory' + suffix; c.GROUPS_KEY = 'groups' + suffix;
                const read = (k, fallback) => JSON.parse(local.getItem(k) || 'null') ?? fallback;
                c.students = read(c.STUDENTS_KEY, []); c.pointsHistory = read(c.POINTS_HISTORY_KEY, []); c.groups = read(c.GROUPS_KEY, []);
                c.notebookEntries = read('notebookEntries', []); c.homeworkList = read('homeworkList', []); c.homeworkChecks = read('homeworkChecks', {});
                c.lotteryHistory = read('lotteryHistory', []); c.drawnStudentIds = read('drawnStudentIds', []);
                return tab;
            },
            /** 老師加一分：改記憶體、整包寫回（主頁面的做法） */
            addPoint(id, reason) {
                const s = c.students.find(x => x.id === id); s.score += 1;
                c.pointsHistory.push({ studentId: id, change: 1, reason });
                return c.SafeStorage.write([[c.STUDENTS_KEY, JSON.stringify(c.students)], [c.POINTS_HISTORY_KEY, JSON.stringify(c.pointsHistory)]], { context: '加扣分' });
            },
        });
        tabs.push(tab);
        return tab;
    }
    function broadcast(from, key, oldValue, newValue) {
        for (const t of tabs) if (t !== from && !t.deaf) t.fire('storage', { key, oldValue, newValue, storageArea: t.local });
    }
    return { shared, openTab };
}

const twoStudents = () => JSON.stringify([{ id: 1, name: '王小明', score: 10 }, { id: 2, name: '李小華', score: 5 }]);
const read = (browser, key) => JSON.parse(browser.shared.get(key));
/** 分頁裡的陣列和這裡的陣列不是同一種（各有各的執行環境），用內容比對 */
const same = (actual, expected) => assert.equal(JSON.stringify(actual), JSON.stringify(expected));

let passed = 0;
function test(name, fn) { fn(); console.log('PASS', name); passed++; }

test('兩個分頁輪流加分：兩邊的加分都留著，不會互相蓋掉', () => {
    const browser = createBrowser([['currentClassId', '1001'], ['students-1001', twoStudents()], ['pointsHistory-1001', '[]']]);
    const a = browser.openTab().boot('1001'), b = browser.openTab().boot('1001');
    assert.equal(b.addPoint(1, 'B 分頁加的'), true);
    assert.equal(a.c.students[0].score, 11);            // A 的記憶體已就地換成新的
    assert.equal(a.addPoint(2, 'A 分頁加的'), true);
    assert.equal(b.addPoint(1, 'B 再加一次'), true);
    assert.deepEqual(read(browser, 'students-1001').map(s => s.score), [12, 6]);
    assert.deepEqual(read(browser, 'pointsHistory-1001').map(h => h.reason), ['B 分頁加的', 'A 分頁加的', 'B 再加一次']);
    assert.equal(a.reloads() + b.reloads(), 0);         // 不用重新整理
    assert.equal(a.notices.length + b.notices.length, 0);
});

test('就地更新後會重畫畫面，並通知其他模組', () => {
    const browser = createBrowser([['currentClassId', '1001'], ['students-1001', twoStudents()]]);
    const a = browser.openTab().boot('1001'), b = browser.openTab().boot('1001');
    b.addPoint(1, '加分');
    assert.equal(a.calls.length, 0);                     // 先換記憶體，重畫稍後一次做完
    a.runTimers();
    for (const fn of ['renderStudents', 'renderPointsStudentList', 'renderPointsHistory', 'renderHomework', 'pets.prepare', 'pets.render', 'event:class-data-refreshed']) assert.ok(a.calls.includes(fn), fn);
    assert.equal(a.calls.filter(x => x === 'renderStudents').length, 1);   // 兩個鍵一起變只重畫一次
});

test('聯絡簿、作業、作業繳交、抽籤名單也就地更新；預設班級的鍵不加後綴', () => {
    const browser = createBrowser([['students', twoStudents()]]);
    const a = browser.openTab().boot('default'), b = browser.openTab().boot('default');
    b.c.localStorage.setItem('notebookEntries', JSON.stringify([{ id: 1, content: '明天帶水壺' }]));
    b.c.localStorage.setItem('homeworkChecks', JSON.stringify({ 7: { 1: true } }));
    b.c.localStorage.setItem('drawnStudentIds', '[2]');
    assert.equal(a.c.notebookEntries[0].content, '明天帶水壺');
    assert.equal(a.c.homeworkChecks[7][1], true);
    same(a.c.drawnStudentIds, [2]);
    a.c.notebookEntries.push({ id: 2, content: 'A 分頁新增' });
    a.c.localStorage.setItem('notebookEntries', JSON.stringify(a.c.notebookEntries));
    assert.equal(read(browser, 'notebookEntries').length, 2);
    b.c.localStorage.removeItem('drawnStudentIds');      // 另一邊清空抽籤名單
    same(a.c.drawnStudentIds, []);
});

test('別班的資料、與班級無關的設定：不理會', () => {
    const browser = createBrowser([['currentClassId', '1001'], ['students-1001', twoStudents()]]);
    const a = browser.openTab().boot('1001'), b = browser.openTab();
    b.c.ClassAwareStorage.rawSet('students-2002', '[{"id":9,"name":"別班","score":0}]');
    b.c.localStorage.setItem('theme', 'dark');
    assert.equal(a.c.students.length, 2);
    same(a.c.ClassAwareStorage.staleNames(), []);
    assert.equal(a.reloads(), 0);
});

test('各模組自己留一份的資料（公告）：另一邊改過後，這一頁回來時重新整理', () => {
    const browser = createBrowser([['currentClassId', '1001'], ['classAnnouncements-1001', '[{"id":1,"title":"舊公告"}]']]);
    const a = browser.openTab({ focused: false }).boot('1001'), b = browser.openTab().boot('1001');
    const mine = JSON.parse(a.c.localStorage.getItem('classAnnouncements'));      // A 的公告模組開機讀一次
    JSON.parse(b.c.localStorage.getItem('classAnnouncements'));
    b.c.localStorage.setItem('classAnnouncements', '[{"id":1,"title":"舊公告"},{"id":2,"title":"B 新增的公告"}]');
    same(a.c.ClassAwareStorage.staleNames(), ['classAnnouncements']);
    a.tick();
    assert.equal(a.reloads(), 0);                        // 只是開著（例如投影中）、沒人在操作：不打斷
    a.state.focused = true; a.fire('focus');
    assert.equal(a.reloads(), 1);                        // 老師點回這個視窗：先換成最新內容
    assert.equal(a.session.getItem('class-manager-tab-refreshed'), 'refreshed');
    assert.equal(mine.length, 1);
});

test('這一頁沒讀過的資料：手上沒有舊的，不用重新整理', () => {
    const browser = createBrowser([['currentClassId', '1001']]);
    const a = browser.openTab().boot('1001'), b = browser.openTab().boot('1001');
    b.c.localStorage.setItem('seatingConfig', '{"rows":5}');
    same(a.c.ClassAwareStorage.staleNames(), []);
    a.c.localStorage.setItem('seatingConfig', '{"rows":6}');                   // 之後第一次寫入也不擋
    assert.equal(browser.shared.get('seatingConfig-1001'), '{"rows":6}');
});

test('上課中來不及重新整理就拿舊資料寫入：擋下來，不蓋掉另一邊的內容，並告訴老師', () => {
    const browser = createBrowser([['currentClassId', '1001'], ['classAnnouncements-1001', '[{"id":1}]']]);
    const a = browser.openTab({ busy: true }).boot('1001'), b = browser.openTab().boot('1001');
    const mine = JSON.parse(a.c.localStorage.getItem('classAnnouncements'));
    b.c.localStorage.getItem('classAnnouncements');
    b.c.localStorage.setItem('classAnnouncements', '[{"id":1},{"id":2,"title":"B 新增"}]');
    a.fire('focus');
    assert.equal(a.reloads(), 0);                        // 計時器在跑：不重新整理
    let rolledBack = false;
    mine.push({ id: 3, title: 'A 用舊資料新增' });
    const saved = a.c.SafeStorage.set('classAnnouncements', JSON.stringify(mine), { context: '新增公告', rollback: () => { rolledBack = true; } });
    assert.equal(saved, false); assert.equal(rolledBack, true);
    a.c.localStorage.setItem('classAnnouncements', JSON.stringify(mine));       // 沒走 SafeStorage 的寫法一樣擋
    assert.equal(browser.shared.get('classAnnouncements-1001'), '[{"id":1},{"id":2,"title":"B 新增"}]');
    assert.equal(a.notices.length, 1);                   // 短時間內只提醒一次
    assert.equal(a.notices[0].kind, 'warning'); assert.match(a.notices[0].text, /公告/); assert.match(a.notices[0].text, /沒有存檔/);
    a.state.busy = false; a.runTimers();                 // 下課了：重新整理，並在新畫面提醒剛才那次沒存
    assert.equal(a.reloads(), 1);
    assert.equal(a.session.getItem('class-manager-tab-refreshed'), 'rejected');
});

test('重新整理後告訴老師發生什麼事', () => {
    const browser = createBrowser([['currentClassId', '1001']]);
    const a = browser.openTab({ session: new Map([['class-manager-tab-refreshed', 'rejected']]) });
    assert.equal(a.session.getItem('class-manager-tab-refreshed'), null);
    a.runTimers();
    assert.equal(a.notices.length, 1); assert.match(a.notices[0].text, /請再做一次/);
    const b = browser.openTab({ session: new Map([['class-manager-tab-refreshed', 'refreshed']]) });
    b.runTimers();
    assert.equal(b.notices[0].kind, 'info');
});

test('每次操作都重新讀取再寫入的模組（座位表每次開視窗重讀）：不會被誤擋', () => {
    const browser = createBrowser([['currentClassId', '1001'], ['seatingConfig-1001', '[1]']]);
    const a = browser.openTab({ busy: true }).boot('1001'), b = browser.openTab().boot('1001');
    a.c.localStorage.getItem('seatingConfig');
    const append = (tab, n) => { const list = JSON.parse(tab.c.localStorage.getItem('seatingConfig')); list.push(n); return tab.c.SafeStorage.set('seatingConfig', JSON.stringify(list), { context: '儲存座位表' }); };
    assert.equal(append(b, 2), true); assert.equal(append(a, 3), true); assert.equal(append(b, 4), true); assert.equal(append(a, 5), true);
    assert.equal(browser.shared.get('seatingConfig-1001'), '[1,2,3,4,5]');
    assert.equal(a.notices.length + b.notices.length, 0);
    a.state.busy = false; a.fire('focus');
    assert.equal(a.reloads(), 0);                        // 已經重新讀過，不算舊的
    same(a.c.ClassAwareStorage.staleNames(), []);
});

test('白板、潔牙、安靜挑戰紀錄這類小設定：另一邊改了不用重新整理，也不擋寫入', () => {
    const browser = createBrowser([['currentClassId', '1001'], ['boardNote-1001', '舊的白板'], ['quietChallengeLog-1001', '[1]']]);
    const a = browser.openTab().boot('1001'), b = browser.openTab().boot('1001');
    let shown = a.c.localStorage.getItem('boardNote'); a.c.localStorage.getItem('quietChallengeLog');
    a.c.ClassAwareStorage.onOtherTabChange(['boardNote', 'boardNoteStyle'], () => { shown = a.c.localStorage.getItem('boardNote'); });
    b.c.localStorage.getItem('boardNote');
    b.c.localStorage.setItem('boardNote', '新的白板');
    b.c.localStorage.setItem('quietChallengeLog', '[2,1]');
    assert.equal(shown, '新的白板');                     // 模組登記的函式把畫面換成新的
    same(a.c.ClassAwareStorage.staleNames(), []);
    a.fire('focus'); a.tick();
    assert.equal(a.reloads(), 0);
    a.c.localStorage.setItem('boardNote', 'A 接著打的字');
    assert.equal(browser.shared.get('boardNote-1001'), 'A 接著打的字');
    assert.equal(a.notices.length, 0);
});

test('順手讀一下（比對有沒有變、備份）不算跟上：公告模組手上還是舊的，寫入照樣擋', () => {
    const browser = createBrowser([['currentClassId', '1001'], ['classAnnouncements-1001', '[{"id":1}]']]);
    const a = browser.openTab({ deaf: true }).boot('1001'), b = browser.openTab().boot('1001');
    const mine = JSON.parse(a.c.localStorage.getItem('classAnnouncements'));
    b.c.localStorage.getItem('classAnnouncements');
    b.c.localStorage.setItem('classAnnouncements', '[{"id":1},{"id":2}]');
    a.c.localStorage.getItem('classAnnouncements');     // 備份、同步狀態等順手讀到新內容
    assert.equal(a.c.ClassAwareStorage.peek('classAnnouncements'), '[{"id":1},{"id":2}]');
    mine.push({ id: 3 });
    a.c.localStorage.setItem('classAnnouncements', JSON.stringify(mine));
    assert.equal(browser.shared.get('classAnnouncements-1001'), '[{"id":1},{"id":2}]');
    assert.equal(a.notices.length, 1);
});

test('模組登記了重新讀取的函式（公告）：另一邊改了就自己跟上，不用重新整理；正在編輯時不換、等重新整理', () => {
    const browser = createBrowser([['currentClassId', '1001'], ['classAnnouncements-1001', '[{"id":1}]']]);
    const a = browser.openTab().boot('1001'), b = browser.openTab().boot('1001');
    let list = JSON.parse(a.c.localStorage.getItem('classAnnouncements')), editing = false;
    a.c.ClassAwareStorage.onOtherTabChange('classAnnouncements', () => { if (editing) return false; list = JSON.parse(a.c.ClassAwareStorage.peek('classAnnouncements')); return true; });
    b.c.localStorage.getItem('classAnnouncements');
    b.c.localStorage.setItem('classAnnouncements', '[{"id":1},{"id":2}]');
    assert.equal(list.length, 2);
    same(a.c.ClassAwareStorage.staleNames(), []);
    list.push({ id: 3 });
    assert.equal(a.c.SafeStorage.set('classAnnouncements', JSON.stringify(list), { context: '儲存班級公告' }), true);
    assert.equal(read(browser, 'classAnnouncements-1001').length, 3);
    assert.equal(b.c.SafeStorage.set('classAnnouncements', '[]', { context: '儲存班級公告' }), false);   // B 手上的也變舊了，一樣不能蓋
    editing = true;
    browser.openTab().c.localStorage.setItem('classAnnouncements', '[]');      // 第三個分頁（剛開、手上沒有舊資料）清空公告
    same(a.c.ClassAwareStorage.staleNames(), ['classAnnouncements']);
    a.fire('focus');
    assert.equal(a.reloads(), 1);
});

test('寵物設定：另一邊改了，這一頁重畫寵物時會重新讀取，不用重新整理', () => {
    const browser = createBrowser([['currentClassId', '1001'], ['petSettings-1001', '{"enabled":true}']]);
    const a = browser.openTab().boot('1001'), b = browser.openTab().boot('1001');
    a.c.localStorage.getItem('petSettings'); b.c.localStorage.getItem('petSettings');
    b.c.localStorage.setItem('petSettings', '{"enabled":true,"shop":[1]}');
    a.runTimers();
    assert.ok(a.calls.includes('pets.prepare') && a.calls.includes('pets.render'));
    assert.ok(!a.calls.includes('renderStudents'));     // 學生資料沒變，不用重畫整頁
    a.fire('focus');
    assert.equal(a.reloads(), 0);
    same(a.c.ClassAwareStorage.staleNames(), []);
});

test('背景分頁被凍結、沒收到通知：回來用舊資料加分會被擋下，記憶體換成最新的，再做一次就成功', () => {
    const browser = createBrowser([['currentClassId', '1001'], ['students-1001', twoStudents()], ['pointsHistory-1001', '[]']]);
    const a = browser.openTab({ deaf: true }).boot('1001'), b = browser.openTab().boot('1001');
    b.addPoint(1, 'B 加的'); b.addPoint(1, 'B 又加');
    assert.equal(a.c.students[0].score, 10);             // A 沒收到通知，還是舊的
    assert.equal(a.addPoint(2, 'A 用舊資料加'), false);
    assert.deepEqual(read(browser, 'students-1001').map(s => s.score), [12, 5]);   // B 的加分沒被蓋掉
    same(a.c.students.map(s => s.score), [12, 5]);                     // A 已換成最新內容
    assert.equal(a.c.pointsHistory.length, 2);
    assert.match(a.notices[0].text, /請再操作一次/);
    assert.equal(a.addPoint(2, 'A 再做一次'), true);
    assert.deepEqual(read(browser, 'students-1001').map(s => s.score), [12, 6]);
    assert.equal(read(browser, 'pointsHistory-1001').length, 3);
    assert.equal(a.reloads(), 0);
});

test('背景分頁被凍結後切回來：先補上另一邊的內容，接著加分一次就成功', () => {
    const browser = createBrowser([['currentClassId', '1001'], ['students-1001', twoStudents()], ['pointsHistory-1001', '[]'], ['examSubjects-1001', '[]']]);
    const a = browser.openTab({ deaf: true, hidden: true }).boot('1001'), b = browser.openTab().boot('1001');
    a.c.localStorage.getItem('examSubjects'); b.c.localStorage.getItem('examSubjects');
    b.addPoint(1, 'B 加的');
    a.state.hidden = false; a.fireDoc('visibilitychange');
    same(a.c.students.map(s => s.score), [11, 5]);
    assert.equal(a.reloads(), 0);                        // 只有學生資料變了：就地更新就夠
    assert.equal(a.addPoint(2, 'A 加的'), true);
    assert.equal(a.notices.length, 0);
    b.c.localStorage.setItem('examSubjects', '[{"id":1}]');                    // 考試模組自己留一份：要重新整理
    a.fire('focus');
    assert.equal(a.reloads(), 1);
});

test('剛打過字、正在打字、畫面沒顯示：都先不重新整理', () => {
    const browser = createBrowser([['currentClassId', '1001'], ['seatingConfig-1001', '{"rows":5}']]);
    const a = browser.openTab().boot('1001'), b = browser.openTab().boot('1001');
    a.c.localStorage.getItem('seatingConfig'); b.c.localStorage.getItem('seatingConfig');
    a.fireDoc('input', { target: { matches: () => true } });                   // 老師剛在輸入框打字
    b.c.localStorage.setItem('seatingConfig', '{"rows":6}');
    a.fire('focus'); a.tick();
    assert.equal(a.reloads(), 0);
    a.advance(61000); a.state.typing = true; a.tick();
    assert.equal(a.reloads(), 0);
    a.state.typing = false; a.state.hidden = true; a.tick();
    assert.equal(a.reloads(), 0);
    a.state.hidden = false; a.fireDoc('visibilitychange');
    assert.equal(a.reloads(), 1);
});

test('老師開始操作舊的那一頁：先重新整理，這一下點擊不交給舊畫面', () => {
    const browser = createBrowser([['currentClassId', '1001'], ['examSubjects-1001', '[]']]);
    const a = browser.openTab({ focused: false }).boot('1001'), b = browser.openTab().boot('1001');
    a.c.localStorage.getItem('examSubjects'); b.c.localStorage.getItem('examSubjects');
    assert.equal(a.fireDoc('pointerdown').stopped, false);                    // 沒有舊資料時完全不干涉
    b.c.localStorage.setItem('examSubjects', '[{"id":1,"name":"國語"}]');
    const down = a.fireDoc('pointerdown');
    assert.equal(a.reloads(), 1); assert.equal(down.stopped, true);
    assert.equal(a.fireDoc('click').stopped, true);
    a.fireDoc('keydown');
    assert.equal(a.reloads(), 1);                        // 不會重複重新整理
});

test('兩個分頁互相觸發時不會無限重新整理：兩分鐘內最多 3 次', () => {
    const browser = createBrowser([['currentClassId', '1001'], ['examDayPresets-1001', '0']]);
    const session = new Map();
    const b = browser.openTab().boot('1001');
    let reloads = 0;
    for (let i = 1; i <= 5; i++) {
        const a = browser.openTab({ session }).boot('1001');                   // 同一個分頁重新整理後（sessionStorage 留著）
        a.c.localStorage.getItem('examDayPresets'); b.c.localStorage.getItem('examDayPresets');
        b.c.localStorage.setItem('examDayPresets', String(i));
        a.fire('focus');
        reloads += a.reloads();
        a.deaf = true;
    }
    assert.equal(reloads, 3);
});

test('兩個分頁同時開機、各自補上相同的預設值：內容一樣就不算衝突', () => {
    const browser = createBrowser([['currentClassId', '1001']]);
    const a = browser.openTab().boot('1001'), b = browser.openTab({ deaf: true }).boot('1001');
    a.c.localStorage.getItem('examDayPresets'); b.c.localStorage.getItem('examDayPresets');     // 兩邊都讀到「還沒有」
    a.c.localStorage.setItem('examDayPresets', '{"currentDay":1,"days":{"1":[]}}');
    b.c.localStorage.setItem('examDayPresets', '{"currentDay":1,"days":{"1":[]}}');            // 相同內容：不擋、不提醒
    assert.equal(b.notices.length, 0);
    same(b.c.ClassAwareStorage.staleNames(), []);
    b.c.localStorage.setItem('examDayPresets', '{"currentDay":2,"days":{"1":[],"2":[]}}');    // 之後照常寫入
    assert.match(browser.shared.get('examDayPresets-1001'), /"currentDay":2/);
    assert.equal(a.reloads() + b.reloads(), 0);
});

test('同步、還原這類明確要換掉內容的寫入不受限制，另一個分頁照樣跟上', () => {
    const browser = createBrowser([['currentClassId', '1001'], ['students-1001', twoStudents()], ['classAnnouncements-1001', '[]']]);
    const a = browser.openTab().boot('1001'), b = browser.openTab({ deaf: true }).boot('1001');
    b.c.localStorage.getItem('classAnnouncements');
    a.c.localStorage.setItem('classAnnouncements', '[{"id":1}]');              // B 沒收到通知
    const restored = JSON.stringify([{ id: 1, name: '王小明', score: 30 }]);
    assert.equal(b.c.SafeStorage.writeRaw([['students-1001', restored], ['classAnnouncements-1001', '[{"id":8}]']], { context: '完整還原班級資料' }), true);
    assert.equal(browser.shared.get('classAnnouncements-1001'), '[{"id":8}]');
    assert.equal(a.c.students[0].score, 30);
    b.c.localStorage.setItem('classAnnouncements', '[{"id":8},{"id":9}]');     // 還原後這一頁照常寫入
    assert.equal(browser.shared.get('classAnnouncements-1001'), '[{"id":8},{"id":9}]');
});

test('只開一個分頁：一般使用完全不受影響', () => {
    const browser = createBrowser([['currentClassId', '1001'], ['students-1001', twoStudents()], ['pointsHistory-1001', '[]']]);
    const a = browser.openTab().boot('1001');
    for (let i = 0; i < 20; i++) assert.equal(a.addPoint(1 + (i % 2), '第 ' + i + ' 次'), true);
    a.c.localStorage.setItem('classAnnouncements', '[1]'); a.c.localStorage.setItem('classAnnouncements', '[1,2]');
    a.c.localStorage.removeItem('classAnnouncements');
    a.c.ClassAwareStorage.rawSet('homeworkList-1001', '[{"id":1}]');           // 同步模組直接寫
    a.c.localStorage.setItem('homeworkList', '[{"id":1},{"id":2}]');
    assert.equal(browser.shared.get('homeworkList-1001'), '[{"id":1},{"id":2}]');
    assert.equal(read(browser, 'pointsHistory-1001').length, 20);
    assert.equal(a.notices.length, 0); assert.equal(a.reloads(), 0);
    a.fire('focus'); a.fireDoc('pointerdown'); a.tick();
    assert.equal(a.reloads(), 0);
});

test('另一個分頁換了帳號：交給帳號收納處理，這裡不動記憶體', () => {
    const browser = createBrowser([['currentClassId', '1001'], ['workspaceOwner', 'teacher-a'], ['students-1001', twoStudents()]]);
    const a = browser.openTab().boot('1001'), b = browser.openTab();
    b.c.ClassAwareStorage.vaultSet('workspaceOwner', 'teacher-b');
    b.c.ClassAwareStorage.vaultSet('students-1001', '[{"id":7,"name":"另一位老師的學生","score":0}]');
    assert.equal(a.c.students.length, 2);
    assert.equal(a.reloads(), 0);
});

console.log(passed + ' same-class two-tab checks passed');
