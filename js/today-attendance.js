/**
 * 今日請假名單（分組、抽籤共用）
 *
 * 今天請假的同學：隨機分組不會分到他、抽籤也不會抽到他。
 * 只記當天、各班分開，隔天自動失效；只存在這台裝置，不上雲端（屬於當天的便利設定，不是班級資料）。
 *
 * API：
 *   TodayAttendance.load()          → Set<string>  今天請假的學生 id
 *   TodayAttendance.save(set)       → 整批寫入並通知
 *   TodayAttendance.set(id, absent) → 切換一位
 *   TodayAttendance.clear()         → 全員出席
 * 名單變動時會發出 window 事件 'todayattendancechange'。
 */
(function () {
    'use strict';

    const PREFIX = 'todayAbsent-';
    const LEGACY_PREFIX = 'groupingAbsent-';   // v3.48.0 分組功能先用的 key，讀到就搬過來
    const EVENT = 'todayattendancechange';

    const classId = () => {
        try { return localStorage.getItem('currentClassId') || 'default'; } catch (e) { return 'default'; }
    };
    const today = () => {
        const d = new Date();
        return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    };
    function parse(raw) {
        try {
            const v = JSON.parse(raw || 'null');
            if (v && v.date === today() && Array.isArray(v.ids)) return v.ids.map(String);
        } catch (e) { /* 壞掉的紀錄當作沒有 */ }
        return null;
    }
    function write(set) {
        const key = PREFIX + classId();
        try {
            if (set.size) localStorage.setItem(key, JSON.stringify({ date: today(), ids: [...set].map(String) }));
            else localStorage.removeItem(key);
        } catch (e) { /* 只是當天便利設定，存不了不影響分組或抽籤 */ }
    }
    function load() {
        const id = classId();
        let ids = null;
        try {
            ids = parse(localStorage.getItem(PREFIX + id));
            const legacyRaw = localStorage.getItem(LEGACY_PREFIX + id);
            if (legacyRaw !== null) {
                if (!ids) {
                    ids = parse(legacyRaw);
                    if (ids) write(new Set(ids));
                }
                localStorage.removeItem(LEGACY_PREFIX + id);
            }
        } catch (e) { /* 讀不到就當作全員出席 */ }
        return new Set(ids || []);
    }
    function save(set) {
        write(set instanceof Set ? set : new Set(set || []));
        try { window.dispatchEvent(new CustomEvent(EVENT)); } catch (e) { /* 舊瀏覽器忽略 */ }
    }
    function set(id, absent) {
        const s = load();
        const k = String(id);
        if (absent) s.add(k); else s.delete(k);
        save(s);
        return s;
    }

    window.TodayAttendance = {
        load,
        save,
        set,
        has: id => load().has(String(id)),
        clear: () => save(new Set()),
        EVENT
    };
})();
