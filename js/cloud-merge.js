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

    function merge(path, base, local, remote) {
        if (same(local, remote) || same(base, remote)) return local;
        if (same(base, local)) return remote;
        const [top, field, extra] = path.split('.');
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

    const api = { mergeValues };
    if (typeof window !== 'undefined') window.CloudMerge = api;
    if (typeof module !== 'undefined') module.exports = api;
})();
