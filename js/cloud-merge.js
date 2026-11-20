/**
 * 同步衝突的三方合併（純函式，不碰儲存與網路）。
 *
 * 比對「上次共同版本、本機、雲端」三份資料：只有一邊動過的內容直接採用，兩邊各自新增的紀錄都保留。
 * 成長值與金幣都由 pointsHistory 明細算出，明細以編號合併後自然正確；學生分數與小組分數是累計值，
 * 所以把兩邊各自的增減加總，而不是二選一。
 *
 * 只要有一處無法判斷（同一欄位兩邊改成不同內容、一邊刪除另一邊修改、位置式陣列兩邊都動過）就整份放棄，
 * 回傳 blocked 交給老師比較。寧可多問一次，也不猜老師要哪一邊。
 */
(function () {
    'use strict';
    const ADDITIVE = { students: 'points', groups: 'score' };
    /** 經營白板的公告文字、字體、活動、抽籤設定：兩邊改得不同時保留本機，不擋整份合併。 */
    const SCREEN_KEYS = ['boardNote', 'boardNoteStyle', 'boardActivity', 'boardLotteryCfg'];

    const blocked = path => Object.assign(Error('無法自動合併：' + path), { code: 'merge-blocked', path: path.split('.').slice(0, 2).join('.').slice(0, 60) });
    const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
    const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

    /** 明細清單要以編號對齊才能合併；同編號重複（舊資料）用出現順序區分。 */
    function keyed(list) {
        const seen = new Map(), items = new Map();
        for (const item of list) {
            const id = String(item.id ?? JSON.stringify(item));
            const n = seen.get(id) || 0;
            seen.set(id, n + 1);
            items.set(`${id}#${n}`, item);
        }
        return items;
    }

    function mergeList(path, base, local, remote) {
        if (![base, local, remote].every(list => list.every(isObject))) throw blocked(path);
        const b = keyed(base), l = keyed(local), r = keyed(remote);
        const merged = new Map();
        for (const key of new Set([...l.keys(), ...r.keys()])) {
            const value = merge(path, b.get(key), l.get(key), r.get(key));
            if (value !== undefined) merged.set(key, value);
        }
        // 只有本機調整過順序時保留本機的排序；其餘以雲端為主，另一邊新增的接在後面
        const localLeads = same([...r.keys()].filter(k => b.has(k)), [...b.keys()].filter(k => r.has(k)));
        const [first, second] = localLeads ? [l, r] : [r, l];
        const order = [...new Set([...first.keys(), ...second.keys()])].filter(k => merged.has(k));
        const list = order.map(k => merged.get(k));
        if (path === 'pointsHistory') list.sort((x, y) => (Number(y.createdAtMs) || 0) - (Number(x.createdAtMs) || 0));
        return list;
    }

    /**
     * 同一位學生的蛋在兩台各自孵化（共同版本還沒孵化）：寵物種類是隨機抽的，兩邊不同不代表老師改了什麼。
     * 採用比較早孵化的那一邊（看不出先後就用雲端），兩邊的孵化欄位對齊後再照常合併，不必整份停下來（2026-11-16 實際發生）。
     * 共同版本已經孵化過、兩邊又各自改成不同寵物，仍然放棄合併交給老師。
     */
    const HATCH = ['classPet', 'classPetRevealed', 'petHatchedAt'];
    function settleHatch(base, local, remote) {
        if (!(local.classPetRevealed === true && remote.classPetRevealed === true)) return [local, remote];
        if (isObject(base) && base.classPetRevealed === true) return [local, remote];
        const lt = Date.parse(local.petHatchedAt), rt = Date.parse(remote.petHatchedAt);
        const winner = Number.isFinite(lt) && (!Number.isFinite(rt) || lt < rt) ? local : remote;
        const pick = o => { const out = { ...o }; for (const k of HATCH) { if (Object.hasOwn(winner, k)) out[k] = winner[k]; else delete out[k]; } return out; };
        return [pick(local), pick(remote)];
    }

    /** 「最後修改時間」比大小：zh-TW 的 2026/11/19 11:35:55 或 ISO 字串都轉成補零數字串比較。 */
    const stampKey = v => typeof v === 'number' ? String(v).padStart(16, '0') : (String(v).match(/\d+/g) || []).map(n => n.padStart(4, '0')).join('');

    function merge(path, base, local, remote) {
        if (path === 'students' && isObject(local) && isObject(remote)) [local, remote] = settleHatch(base, local, remote);
        if (same(local, remote) || same(base, remote)) return local;
        if (same(base, local)) return remote;
        const [top, field, extra] = path.split('.');
        // 兩台把同一筆改成一樣的內容，只差在「最後修改時間」：其他欄位照常比對，這一欄採用較晚的時間。
        // 內容真的改得不一樣時，content 等欄位仍會擋下來交給老師（2026-11-19、11-20 家老師的聯絡簿實際發生）。
        if (field === 'updatedAt' && extra === undefined && typeof local === typeof remote && (typeof local === 'string' || typeof local === 'number')) {
            return stampKey(local) > stampKey(remote) ? local : remote;
        }
        if (ADDITIVE[top] === field && extra === undefined && typeof local === 'number' && typeof remote === 'number') {
            // 其中一邊歸零是重設分數，加總會讓分數活回來
            if (local === 0 || remote === 0) throw blocked(path);
            const start = Number(base) || 0;
            return start + (local - start) + (remote - start);
        }
        if (field === 'petMaxLevel' && typeof local === 'number' && typeof remote === 'number') return Math.max(local, remote);
        // 兩台裝置發現同一種寵物，只差在發現時間
        if (top === 'petSettings' && field === 'collection' && isObject(local) && isObject(remote) && extra !== undefined) return remote;
        if (Array.isArray(local) && Array.isArray(remote) && (base === undefined || base === null || Array.isArray(base))) {
            return mergeList(path, base || [], local, remote);
        }
        if (isObject(local) && isObject(remote) && (base === undefined || base === null || isObject(base))) {
            const out = {}, start = base || {};
            for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
                const value = merge(`${path}.${key}`, start[key], local[key], remote[key]);
                if (value !== undefined) out[key] = value;
            }
            return out;
        }
        throw blocked(path);
    }

    const parse = (key, text) => {
        if (text === null || text === undefined) return text;
        try { return JSON.parse(text); } catch { throw blocked(key); }
    };

    /**
     * @param {Object<string, string|null>} base 上次共同版本（各鍵原始字串）
     * @param {Object<string, string|null>} local 本機
     * @param {Object<string, string|null>} remote 雲端
     * @param {string[]} keys 要合併的鍵
     * @param {string[]} [deviceKeys] 裝置偏好（主題、時鐘等）：一律保留本機
     * @returns {{ok:true, values:Object}|{ok:false, path:string}}
     */
    function mergeValues(base, local, remote, keys, deviceKeys = []) {
        const values = {};
        try {
            for (const key of keys) {
                const b = base[key] ?? null, l = local[key] ?? null, r = remote[key] ?? null;
                if (deviceKeys.includes(key) || l === r || b === r) values[key] = l;
                else if (b === l) values[key] = r;
                else if (SCREEN_KEYS.includes(key)) {
                    // 白板文字等「這台螢幕上顯示的東西」兩邊都改過：能合併就合併，合不了保留這台的，
                    // 不能因為一段白板文字讓整班的加扣分都傳不上去（柏老師 11/12～11/20 卡了 9 天）。
                    try {
                        const merged = merge(key, parse(key, b), parse(key, l), parse(key, r));
                        values[key] = merged === undefined ? null : JSON.stringify(merged);
                    } catch (error) {
                        if (error?.code !== 'merge-blocked') throw error;
                        values[key] = l;
                    }
                }
                else {
                    const merged = merge(key, parse(key, b), parse(key, l), parse(key, r));
                    values[key] = merged === undefined ? null : JSON.stringify(merged);
                }
            }
        } catch (error) {
            if (error?.code === 'merge-blocked') return { ok: false, path: error.path };
            throw error;
        }
        return { ok: true, values };
    }

    /** 紀錄建立時間：新紀錄有 createdAtMs，舊紀錄的編號就是 Date.now()。看不出時間回傳 NaN。 */
    const recordTime = r => { const t = Number(r?.createdAtMs) || Number(r?.id); return Number.isFinite(t) && t > 0 ? t : NaN; };
    const APPEND_ONLY = ['pointsHistory', 'lotteryHistory'];
    const SUBSET = ['students', 'notebookEntries', 'homeworkList'];

    /**
     * 共同舊版本已被清理，兩邊又各有對方沒有的紀錄時（久沒開的電腦還留著當時沒傳上去的加扣分）：
     * 以雲端為主，把這台多出來、只會新增不會修改的加扣分與抽籤紀錄補進去，學生與小組分數跟著加上。
     * 任何一項看不出來就放棄，交給老師（2026-11-20 東老師的另一台電腦留著 11/12 的 3 筆加扣分）。
     *  - 這台不能有雲端沒有的學生、聯絡簿、作業（沒有基準分不出是這台新增還是雲端刪除）
     *  - 補進去的紀錄要比兩邊共有的最新一筆還晚：學期封存清掉的舊紀錄不會被救回來
     *  - 這台不能有重新計分；雲端在這些紀錄之後重新計分過也不合併（分數該不該算進去要老師決定）
     *  - 兩邊撤銷同一筆獎勵不合併（會沖回兩次）
     * 其餘設定（寵物商店、座位表、白板等）採用雲端，這台原本的資料由呼叫端另存副本。
     * @returns {{ok:true, changes:Object<string,string>, added:number}|{ok:false, path:string}}
     */
    function unionWithoutBase(local, remote) {
        const read = (src, k) => { const v = parse(k, src[k] ?? null); return v == null ? [] : v; };
        try {
            for (const k of SUBSET) {
                const l = read(local, k), r = read(remote, k);
                if (!Array.isArray(l) || !Array.isArray(r)) throw blocked('no-base');
                const ids = new Set(r.map(x => String(x?.id)));
                if (l.some(x => x?.id == null || !ids.has(String(x.id)))) throw blocked('no-base');
            }
            const lists = {};
            let added = 0;
            for (const k of APPEND_ONLY) {
                const l = read(local, k), r = read(remote, k);
                if (!Array.isArray(l) || !Array.isArray(r) || ![...l, ...r].every(isObject)) throw blocked('no-base');
                const remoteIds = new Set(r.map(x => String(x.id)));
                const mine = l.filter(x => !remoteIds.has(String(x.id)));
                const shared = l.filter(x => remoteIds.has(String(x.id))).map(recordTime).filter(Number.isFinite);
                const latestShared = shared.length ? Math.max(...shared) : -Infinity;
                if (mine.some(x => !(recordTime(x) > latestShared))) throw blocked('no-base');
                lists[k] = { remote: r, mine };
                added += mine.length;
            }
            if (!added) throw blocked('no-base');

            const ph = lists.pointsHistory;
            const firstMine = Math.min(...ph.mine.map(recordTime));
            if (ph.mine.some(x => x.type === 'reset')) throw blocked('no-base');
            if (ph.remote.some(x => x.type === 'reset' && recordTime(x) > firstMine)) throw blocked('no-base');
            const reversed = new Set(ph.remote.filter(x => x.petReverses != null).map(x => String(x.petReverses)));
            if (ph.mine.some(x => x.petReverses != null && reversed.has(String(x.petReverses)))) throw blocked('no-base');

            const students = read(remote, 'students').map(s => ({ ...s }));
            const groupsRaw = parse('groups', remote.groups ?? null);
            if (groupsRaw != null && !Array.isArray(groupsRaw)) throw blocked('no-base');
            const groups = (groupsRaw || []).map(g => ({ ...g }));
            const byId = new Map(students.map(s => [String(s.id), s]));
            for (const r of ph.mine) {
                const points = Number(r.points) || 0;
                if (r.studentId == null) { if (points) throw blocked('no-base'); continue; }
                const s = byId.get(String(r.studentId));
                if (!s) throw blocked('no-base');
                if (!points) continue;
                s.points = (Number(s.points) || 0) + points;
                const g = (r.petGroupId != null && groups.find(x => String(x.id) === String(r.petGroupId)))
                    || groups.find(x => Array.isArray(x.members) && x.members.some(m => String(m?.id) === String(r.studentId)));
                if (g) g.score = (Number(g.score) || 0) + points;
            }
            // 這台補上的加分讓蛋孵化了：沿用這台抽到的寵物，等級取兩邊較高的
            for (const ls of read(local, 'students')) {
                const s = byId.get(String(ls?.id));
                if (!s) continue;
                if (ls.classPetRevealed === true && s.classPetRevealed !== true) for (const k of HATCH) { if (Object.hasOwn(ls, k)) s[k] = ls[k]; }
                if (typeof ls.petMaxLevel === 'number' && typeof s.petMaxLevel === 'number') s.petMaxLevel = Math.max(ls.petMaxLevel, s.petMaxLevel);
            }

            const newestFirst = list => list.map((x, i) => [x, i]).sort((a, b) => ((recordTime(b[0]) || 0) - (recordTime(a[0]) || 0)) || a[1] - b[1]).map(p => p[0]);
            const changes = { students: JSON.stringify(students) };
            if (groupsRaw != null) changes.groups = JSON.stringify(groups);
            for (const k of APPEND_ONLY) if (lists[k].mine.length) changes[k] = JSON.stringify(newestFirst([...lists[k].mine, ...lists[k].remote]));
            return { ok: true, changes, added };
        } catch (error) {
            if (error?.code === 'merge-blocked') return { ok: false, path: 'no-base' };
            throw error;
        }
    }

    const api = { mergeValues, unionWithoutBase };
    if (typeof window !== 'undefined') window.CloudMerge = api;
    if (typeof module !== 'undefined') module.exports = api;
})();
