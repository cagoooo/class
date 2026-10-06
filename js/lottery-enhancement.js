/**
 * 抽籤系統增強模組 v2
 *
 * 設定：抽 1 人／一次抽多人（−／＋ 與快速晶片）、不重複抽取的「這一輪進度」、
 *       籤筒名單（誰可抽、誰抽過、誰請假；請假與隨機分組共用 js/today-attendance.js）、動畫開關、記住設定。
 * 抽籤：名字卡片像拉霸一樣滾動、一張一張定格；抽籤中再按一次（或 Enter／空白鍵）可略過動畫。
 * 結果：每位抽中的同學都可「＋1 加分」或「請假・重抽」；再抽一次、投影抽籤（全螢幕大字，字級自動放大）。
 * 紀錄：依日期分段，最近 40 筆；只新增、不刪除，不影響備份與雲端同步。
 */

(function () {
    'use strict';

    const PREFS_KEY = 'lotteryPrefs';
    const QUICK_COUNTS = [2, 3, 4, 5, 6];
    const HUES = [275, 330, 215, 28, 140, 190, 0, 45, 240, 175];
    const UNDO_MS = 8000;
    const HISTORY_SHOWN = 40;

    const state = { busy: false, skip: false, anim: true, count: 2 };
    const view = { mode: 'idle', slots: [], done: false, recordId: null, type: 'single' };
    let proj = null;            // { root, stage, drawBtn, info, countNum, opener, overflow, raf }
    let toastTimer = null;
    let savingAbsent = false;

    // ---------- 小工具 ----------
    const $ = id => document.getElementById(id);
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const getStudents = () => (typeof students !== 'undefined' && Array.isArray(students)) ? students : [];
    const getHistory = () => (typeof lotteryHistory !== 'undefined' && Array.isArray(lotteryHistory)) ? lotteryHistory : [];
    const getDrawn = () => (typeof drawnStudentIds !== 'undefined' && Array.isArray(drawnStudentIds)) ? drawnStudentIds : [];
    const isNoRepeat = () => (typeof noRepeatLottery === 'undefined') ? true : noRepeatLottery !== false;
    const reduceMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const seatText = s => String(s?.number ?? s?.seatNumber ?? '').trim();
    const seatSort = s => { const n = Number(seatText(s)); return seatText(s) && Number.isFinite(n) ? n : Infinity; };
    const className = () => {
        try { return (window.ClassProfiles && ClassProfiles.currentProfile && ClassProfiles.currentProfile()?.name) || ''; }
        catch (e) { return ''; }
    };
    const slim = s => ({ id: s.id, name: s.name, number: s.number ?? s.seatNumber ?? '' });

    function el(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text != null) node.textContent = text;
        return node;
    }
    function play(fnName) {
        if (!state.anim) return;
        try { if (typeof window[fnName] === 'function') window[fnName](); } catch (e) { /* 音效失敗不影響抽籤 */ }
    }
    function sample(list, n) {
        const a = list.slice();
        for (let i = 0; i < n; i++) {
            const j = i + Math.floor(Math.random() * (a.length - i));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a.slice(0, n);
    }
    const pick = list => list[Math.floor(Math.random() * list.length)];
    function safeSet(key, value, context, rollback) {
        try {
            if (window.SafeStorage) return !!SafeStorage.set(key, value, { context, rollback });
            localStorage.setItem(key, value);
            return true;
        } catch (e) {
            if (typeof rollback === 'function') rollback();
            return false;
        }
    }

    // ---------- 樣式 ----------
    function injectStyles() {
        if ($('lottery-v2-styles')) return;
        const style = document.createElement('style');
        style.id = 'lottery-v2-styles';
        style.textContent = `
            .lt-scope [hidden], .lt-proj [hidden] { display:none !important; }
            .lt-poolinfo { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 12px; font-size:13px; color:#64748b; }
            .lt-poolinfo b { font-size:18px; color:#7c3aed; }
            .lt-stepper { display:flex; align-items:stretch; gap:8px; }
            .lt-stepper button { flex:none; width:48px; min-height:48px; border-radius:12px; border:1px solid #cbd5e1; background:#fff; color:#7c3aed; font-size:24px; font-weight:800; cursor:pointer; touch-action:manipulation; transition:transform .08s,background .15s; }
            .lt-stepper button:hover:not(:disabled) { background:#f5f3ff; }
            .lt-stepper button:active:not(:disabled) { transform:scale(.92); }
            .lt-stepper button:disabled { opacity:.35; cursor:not-allowed; }
            .lt-stepper input { flex:1; min-width:0; text-align:center; font-size:24px; font-weight:800; border:1px solid #cbd5e1; border-radius:12px; padding:6px; color:#0f172a; background:#fff; -moz-appearance:textfield; }
            .lt-stepper input::-webkit-outer-spin-button, .lt-stepper input::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
            .lt-stepper input:focus { outline:3px solid #c4b5fd; outline-offset:1px; }
            .lt-stepper input[aria-invalid="true"] { border-color:#ef4444; background:#fef2f2; }
            .lt-quick { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
            .lt-quick button { min-height:32px; padding:3px 12px; border-radius:999px; border:1px solid #cbd5e1; background:#fff; color:#334155; font-size:13px; font-weight:600; cursor:pointer; touch-action:manipulation; }
            .lt-quick button:hover { border-color:#c4b5fd; background:#f5f3ff; }
            .lt-quick button[aria-pressed="true"] { background:#8b5cf6; border-color:#8b5cf6; color:#fff; }
            .lt-norepeat { display:flex; flex-direction:column; gap:8px; padding:10px 12px; border-radius:12px; background:#f5f3ff; border:1px solid #e9d5ff; }
            .lt-toggle { display:flex; align-items:flex-start; gap:8px; cursor:pointer; user-select:none; }
            .lt-toggle input { flex:none; width:18px; height:18px; margin-top:2px; accent-color:#8b5cf6; cursor:pointer; }
            .lt-toggle b { display:block; font-size:14px; color:#374151; }
            .lt-toggle small { display:block; font-size:12px; color:#6b7280; line-height:1.45; }
            .lt-toggle-plain { align-items:center; font-size:14px; color:#475569; }
            .lt-toggle-plain input { margin-top:0; }
            .lt-round { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; font-size:12px; color:#6b7280; }
            .lt-round-bar { flex:1 1 120px; height:8px; border-radius:4px; background:#ede9fe; overflow:hidden; }
            .lt-round-bar i { display:block; height:100%; border-radius:4px; background:linear-gradient(90deg,#8b5cf6,#ec4899); transition:width .3s; }
            .lt-round button { min-height:32px; padding:3px 12px; border-radius:999px; border:1px solid #c4b5fd; background:#fff; color:#6d28d9; font-size:12px; font-weight:700; cursor:pointer; }
            .lt-round button:disabled { opacity:.45; cursor:not-allowed; }
            .lt-pool { border:1px solid #cbd5e1; border-radius:12px; background:#fff; }
            .lt-pool summary { list-style:none; cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:44px; padding:8px 12px; font-size:14px; font-weight:700; color:#334155; }
            .lt-pool summary::-webkit-details-marker { display:none; }
            .lt-pool summary::after { content:'▾'; color:#94a3b8; transition:transform .2s; }
            .lt-pool[open] summary::after { transform:rotate(180deg); }
            .lt-pool summary > span:first-child { flex:1; }
            .lt-badge { font-size:12px; font-weight:700; padding:2px 10px; border-radius:999px; background:#ede9fe; color:#5b21b6; }
            .lt-pool-body { padding:0 12px 12px; }
            .lt-pool-help { margin:0 0 8px; font-size:12px; color:#64748b; line-height:1.8; }
            .lt-pool-list { display:flex; flex-wrap:wrap; gap:6px; max-height:240px; overflow:auto; padding:2px; }
            .lt-stu { min-height:32px; padding:3px 10px; border-radius:999px; border:1px solid #c4b5fd; background:#f5f3ff; color:#5b21b6; font-size:13px; font-weight:600; cursor:pointer; touch-action:manipulation; }
            .lt-stu[data-state="drawn"] { background:#f1f5f9; border-color:#cbd5e1; color:#64748b; }
            .lt-stu[data-state="drawn"]::before { content:'✓ '; color:#16a34a; font-weight:800; }
            .lt-stu[data-state="absent"] { background:#fffbeb; border-color:#fcd34d; color:#b45309; text-decoration:line-through; }
            .lt-stu.lt-demo { display:inline-block; min-height:0; padding:0 7px; font-size:11px; cursor:default; vertical-align:1px; }
            .lt-proj-open-btn { width:100%; min-height:44px; border-radius:10px; border:1px solid #c4b5fd; background:#fff; color:#6d28d9; font-size:15px; font-weight:700; cursor:pointer; touch-action:manipulation; }
            .lt-proj-open-btn:hover { background:#f5f3ff; }
            .lt-scope :is(.lt-stepper button,.lt-quick button,.lt-round button,.lt-stu,.lt-proj-open-btn,.lt-act,.lt-fbtn):focus-visible { outline:3px solid #c4b5fd; outline-offset:2px; }

            .lt-stage { position:relative; min-height:280px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; padding:20px 16px; border-radius:18px; text-align:center; overflow:hidden; background:linear-gradient(135deg,#f5f3ff 0%,#fdf2f8 100%); border:1px solid #e9d5ff; }
            .lt-idle { display:flex; flex-direction:column; align-items:center; gap:8px; }
            .lt-idle-icon { font-size:56px; line-height:1; animation:ltBob 2.4s ease-in-out infinite; }
            .lt-idle-title { font-size:20px; font-weight:800; color:#5b21b6; }
            .lt-idle-text { font-size:14px; color:#6b7280; }
            .lt-last { margin-top:4px; font-size:13px; color:#6d28d9; background:#fff; border:1px dashed #c4b5fd; padding:4px 12px; border-radius:999px; }
            .lt-idle .lt-fbtn { margin-top:6px; }
            .lt-head { font-size:18px; font-weight:800; color:#6d28d9; }
            .lt-cards { width:100%; display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); }
            .lt-cards[data-n="1"] { grid-template-columns:minmax(0,440px); justify-content:center; }
            .lt-card { --h:275; position:relative; min-width:0; display:flex; flex-direction:column; align-items:center; gap:6px; padding:14px 10px 12px; border-radius:16px; background:#fff; border:3px solid hsl(var(--h) 70% 62%); box-shadow:0 6px 18px hsl(var(--h) 60% 50% / .15); }
            .lt-seat { min-height:20px; padding:1px 10px; border-radius:999px; background:hsl(var(--h) 65% 52%); color:#fff; font-size:13px; font-weight:800; }
            .lt-seat:empty { visibility:hidden; }
            .lt-name { max-width:100%; font-size:clamp(26px,3vw,40px); font-weight:900; line-height:1.15; color:#1f2937; overflow-wrap:anywhere; }
            .lt-cards[data-n="1"] .lt-name { font-size:clamp(40px,6vw,72px); }
            .lt-card.lt-rolling .lt-name { color:#a78bfa; }
            .lt-card.lt-pop { animation:ltPop .5s cubic-bezier(.34,1.56,.64,1); }
            .lt-acts { display:flex; flex-wrap:wrap; justify-content:center; gap:6px; margin-top:4px; }
            .lt-stage:not(.lt-done) .lt-acts, .lt-card.lt-rolling .lt-acts { visibility:hidden; }
            .lt-act { min-height:36px; padding:4px 12px; border-radius:999px; border:1px solid; font-size:13px; font-weight:800; cursor:pointer; touch-action:manipulation; }
            .lt-plus { background:#dcfce7; border-color:#86efac; color:#166534; }
            .lt-plus:hover { background:#bbf7d0; }
            .lt-redo { background:#fff; border-color:#e5e7eb; color:#6b7280; }
            .lt-redo:hover { background:#fffbeb; border-color:#fcd34d; color:#b45309; }
            .lt-float { position:absolute; top:4px; right:10px; font-size:22px; font-weight:900; color:#16a34a; pointer-events:none; animation:ltFloat .9s ease-out forwards; }
            .lt-foot { display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:8px; }
            .lt-stage:not(.lt-done) .lt-foot { visibility:hidden; }
            .lt-fbtn { min-height:40px; padding:6px 16px; border-radius:999px; border:1px solid #c4b5fd; background:#fff; color:#6d28d9; font-size:14px; font-weight:800; cursor:pointer; touch-action:manipulation; }
            .lt-fbtn:hover { background:#f5f3ff; }
            .lt-fbtn.lt-main { background:#8b5cf6; border-color:#8b5cf6; color:#fff; }
            .lt-fbtn.lt-main:hover { background:#7c3aed; }
            .lt-foot-info { font-size:13px; color:#6b7280; }
            .lt-sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
            @keyframes ltBob { 0%,100% { transform:translateY(0) rotate(0); } 50% { transform:translateY(-6px) rotate(-8deg); } }
            @keyframes ltPop { 0% { transform:scale(.6); } 60% { transform:scale(1.08); } 100% { transform:scale(1); } }
            @keyframes ltFloat { from { opacity:1; transform:translateY(0); } to { opacity:0; transform:translateY(-28px); } }

            .lt-hday { position:sticky; top:0; z-index:1; margin:8px 0 4px; padding:2px 0; font-size:12px; font-weight:800; color:#7c3aed; background:inherit; }
            .lt-hday:first-child { margin-top:0; }
            .lt-hrow { display:flex; align-items:baseline; gap:10px; padding:6px 8px; margin-bottom:4px; border-radius:8px; background:#fff; border-left:4px solid #a78bfa; }
            .lt-htime { flex:none; font-size:12px; color:#94a3b8; font-variant-numeric:tabular-nums; }
            .lt-hnames { display:flex; flex-wrap:wrap; gap:4px; font-size:14px; font-weight:600; color:#334155; }
            .lt-hchip { padding:0 8px; border-radius:999px; background:#f5f3ff; }
            .lt-hmore { margin-top:6px; font-size:12px; color:#94a3b8; text-align:center; }

            .lt-proj { position:fixed; inset:0; z-index:10001; display:flex; flex-direction:column; color:#fff; background:radial-gradient(circle at 50% 30%,#5b21b6 0%,#1e1b4b 60%,#0f0a2e 100%); }
            .lt-proj-bar { flex:none; display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:10px 16px; background:rgba(0,0,0,.28); }
            .lt-proj-title { flex:1; min-width:150px; font-size:20px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .lt-proj-count { display:flex; align-items:center; gap:6px; font-size:16px; font-weight:700; }
            .lt-proj-count b { min-width:2ch; text-align:center; font-size:22px; }
            .lt-proj-bar button { min-height:40px; min-width:40px; padding:6px 14px; border-radius:10px; border:1px solid rgba(255,255,255,.35); background:rgba(255,255,255,.12); color:#fff; font-size:15px; font-weight:700; cursor:pointer; }
            .lt-proj-bar button:hover { background:rgba(255,255,255,.24); }
            .lt-proj-bar button:disabled { opacity:.35; cursor:not-allowed; }
            .lt-proj-info { font-size:15px; color:#ddd6fe; }
            .lt-proj .lt-stage.lt-big { flex:1; min-height:0; margin:0 16px; padding:8px; gap:2vh; background:transparent; border:0; border-radius:0; }
            .lt-big .lt-head { font-size:clamp(20px,3.4vh,42px); color:#e9d5ff; }
            .lt-big .lt-cards { gap:2vh; grid-template-columns:repeat(var(--cols,1),minmax(0,1fr)); }
            .lt-big .lt-cards[data-n="1"] { grid-template-columns:minmax(0,min(1100px,92vw)); }
            .lt-big .lt-card { background:rgba(255,255,255,.97); padding:1.6vh 1vw 1.4vh; }
            .lt-big .lt-name { font-size:var(--lt-size,120px) !important; }
            .lt-big .lt-seat { font-size:max(14px,calc(var(--lt-size,120px) * .16)); }
            .lt-big .lt-act { font-size:max(14px,calc(var(--lt-size,120px) * .13)); min-height:40px; }
            .lt-big .lt-idle-icon { font-size:18vh; }
            .lt-big .lt-idle-title { font-size:6vh; color:#fff; }
            .lt-big .lt-idle-text { font-size:2.6vh; color:#ddd6fe; }
            .lt-big .lt-last { font-size:2.2vh; background:rgba(255,255,255,.1); color:#f5f3ff; border-color:rgba(255,255,255,.35); }
            .lt-big .lt-foot-info { font-size:2.2vh; color:#ddd6fe; }
            .lt-proj-foot { flex:none; display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:16px; padding:12px 16px 20px; }
            .lt-proj-draw { min-height:72px; min-width:min(420px,80vw); border:0; border-radius:999px; background:linear-gradient(135deg,#a855f7,#ec4899); color:#fff; font-size:clamp(22px,3.6vh,36px); font-weight:900; box-shadow:0 10px 30px rgba(236,72,153,.4); cursor:pointer; touch-action:manipulation; }
            .lt-proj-draw:hover { filter:brightness(1.08); }
            .lt-proj-draw:focus-visible, .lt-proj-bar button:focus-visible, .lt-proj .lt-act:focus-visible { outline:3px solid #fde68a; outline-offset:3px; }
            .lt-proj-hint { font-size:14px; color:#c4b5fd; }
            body.lt-proj-open .confetti { z-index:10002 !important; }

            .lt-toast { position:fixed; left:50%; bottom:24px; transform:translateX(-50%); z-index:100001; max-width:min(560px,92vw); display:flex; align-items:center; gap:14px; padding:11px 16px; border-radius:14px; background:#0f172a; color:#fff; font-size:14px; line-height:1.45; box-shadow:0 10px 30px rgba(0,0,0,.35); }
            .lt-toast button { flex:none; border:0; background:none; color:#c4b5fd; font-size:14px; font-weight:800; padding:4px 6px; min-height:32px; cursor:pointer; }

            @media (prefers-reduced-motion: reduce) {
                .lt-idle-icon, .lt-card.lt-pop, .lt-float { animation:none !important; }
            }

            .dark .lt-poolinfo b { color:#c4b5fd; }
            .dark .lt-stepper button, .dark .lt-quick button, .dark .lt-round button, .dark .lt-proj-open-btn, .dark .lt-fbtn { background:#1e293b; border-color:#475569; color:#ddd6fe; }
            .dark .lt-quick button[aria-pressed="true"], .dark .lt-fbtn.lt-main { background:#7c3aed; border-color:#7c3aed; color:#fff; }
            .dark .lt-stepper input[aria-invalid="true"] { background:#450a0a !important; border-color:#ef4444 !important; }
            .dark .lt-norepeat { background:#2e1065; border-color:#4c1d95; }
            .dark .lt-toggle b { color:#f1f5f9; }
            .dark .lt-toggle small, .dark .lt-round, .dark .lt-toggle-plain { color:#cbd5e1; }
            .dark .lt-round-bar { background:#4c1d95; }
            .dark .lt-pool { background:#1e293b; border-color:#475569; }
            .dark .lt-pool summary { color:#e2e8f0; }
            .dark .lt-badge { background:#4c1d95; color:#ede9fe; }
            .dark .lt-pool-help { color:#94a3b8; }
            .dark .lt-stu { background:#2e1065; border-color:#6d28d9; color:#ede9fe; }
            .dark .lt-stu[data-state="drawn"] { background:#1e293b; border-color:#475569; color:#94a3b8; }
            .dark .lt-stu[data-state="absent"] { background:#422006; border-color:#a16207; color:#fde68a; }
            .dark .lt-stage { background:linear-gradient(135deg,#2e1065 0%,#500724 100%); border-color:#4c1d95; }
            .dark .lt-idle-title, .dark .lt-head { color:#e9d5ff; }
            .dark .lt-idle-text, .dark .lt-foot-info { color:#cbd5e1; }
            .dark .lt-last { background:#1e1b4b; color:#ddd6fe; border-color:#6d28d9; }
            .dark .lt-card { background:#1e1b4b; box-shadow:none; }
            .dark .lt-name { color:#f8fafc; }
            .dark .lt-card.lt-rolling .lt-name { color:#a78bfa; }
            .dark .lt-redo { background:#1e293b; border-color:#475569; color:#cbd5e1; }
            .dark .lt-hrow { background:#1e293b; }
            .dark .lt-hnames { color:#e2e8f0; }
            .dark .lt-hchip { background:#2e1065; }
            .dark .lt-hday { color:#c4b5fd; }
            .dark .lt-big .lt-card { background:rgba(30,27,75,.92); }
        `;
        document.head.append(style);
    }

    // ---------- 設定（記住上次選擇） ----------
    function loadPrefs() {
        try {
            const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {};
            if (Number.isInteger(p.count) && p.count >= 1) state.count = p.count;
            state.anim = typeof p.anim === 'boolean' ? p.anim : !reduceMotion();
            return p;
        } catch (e) {
            state.anim = !reduceMotion();
            return {};
        }
    }
    function savePrefs() {
        try { localStorage.setItem(PREFS_KEY, JSON.stringify({ type: currentType(), count: state.count, anim: state.anim })); }
        catch (e) { /* 只是偏好設定 */ }
    }

    // ---------- 籤筒 ----------
    function absentSet() {
        return window.TodayAttendance ? TodayAttendance.load() : new Set();
    }
    function poolInfo() {
        const roster = getStudents();
        const absent = absentSet();
        const drawn = new Set(getDrawn().map(String));
        const noRepeat = isNoRepeat();
        const present = roster.filter(s => !absent.has(String(s.id)));
        const available = present.filter(s => !(noRepeat && drawn.has(String(s.id))));
        const drawnPresent = noRepeat ? present.filter(s => drawn.has(String(s.id))) : [];
        return { roster, absent, drawn, noRepeat, present, available, drawnPresent };
    }
    function setDrawn(next, context) {
        const prev = getDrawn();
        drawnStudentIds = next;
        return safeSet('drawnStudentIds', JSON.stringify(next), context, () => { drawnStudentIds = prev; });
    }
    function setAbsent(id, absent) {
        if (!window.TodayAttendance) return;
        savingAbsent = true;   // 自己改的就不用再被通知重畫一次
        try { TodayAttendance.set(id, absent); } finally { savingAbsent = false; }
    }
    function cleanupDrawnStudents() {
        const ids = new Set(getStudents().map(s => String(s.id)));
        if (!ids.size) return;   // 名單還沒載入（例如新裝置等雲端）時不要動已抽名單
        const drawn = getDrawn();
        const cleaned = drawn.filter(id => ids.has(String(id)));
        if (cleaned.length !== drawn.length) setDrawn(cleaned, '整理抽籤紀錄');
    }

    // ---------- 設定區 ----------
    function currentType() {
        return $('lotteryType')?.value === 'multiple' ? 'multiple' : 'single';
    }
    function readCount() {
        const raw = String($('lotteryCount')?.value ?? '').trim();
        return /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
    }
    function wantCount() {
        if (currentType() !== 'multiple') return 1;
        const v = readCount();
        return Number.isInteger(v) && v >= 1 ? v : Math.max(1, state.count);
    }
    function setType(value) {
        const v = value === 'multiple' ? 'multiple' : 'single';
        const input = $('lotteryType');
        if (input) input.value = v;
        document.querySelectorAll('.lottery-type-btn').forEach(b => {
            const on = b.dataset.ltype === v;
            b.setAttribute('data-on', on ? '1' : '0');
            b.setAttribute('aria-pressed', String(on));
        });
        $('multipleCount')?.classList.toggle('hidden', v !== 'multiple');
        savePrefs();
        syncCountUI();
        updateProjInfo();
    }
    function setCount(v) {
        const input = $('lotteryCount');
        if (input) input.value = v;
        onCountInput();
    }
    function onCountInput() {
        const v = readCount();
        if (Number.isInteger(v) && v >= 1) { state.count = v; savePrefs(); }
        syncCountUI();
        updateProjInfo();
    }
    function syncCountUI() {
        const max = Math.max(1, poolInfo().present.length);
        const v = readCount();
        const minus = $('lotteryMinus'), plus = $('lotteryPlus'), input = $('lotteryCount');
        if (minus) minus.disabled = !(v > 1);
        if (plus) plus.disabled = !(isNaN(v) || v < max);
        if (input) input.setAttribute('aria-invalid', String(!(Number.isInteger(v) && v >= 1)));
        const wrap = $('lotteryQuick');
        if (!wrap) return;
        const options = QUICK_COUNTS.filter(n => n <= max);
        if (wrap.dataset.max !== String(max)) {
            wrap.dataset.max = String(max);
            wrap.replaceChildren(...options.map(n => {
                const b = el('button', '', `${n} 人`);
                b.type = 'button';
                b.dataset.v = n;
                b.addEventListener('click', () => setCount(n));
                return b;
            }));
        }
        wrap.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === v)));
    }
    function refreshPoolUI() {
        if (state.busy) return;   // 抽籤動畫中先不更新，避免籤筒名單提早洩漏結果
        const info = poolInfo();
        const box = $('lotteryPoolInfo');
        if (box) {
            box.replaceChildren();
            const add = (pre, num, post) => { const s = el('span'); s.append(pre, el('b', '', String(num)), post); box.append(s); };
            add('🫙 籤筒可抽 ', info.available.length, ' 人');
            if (info.noRepeat && info.drawnPresent.length) add('已抽 ', info.drawnPresent.length, ' 人');
            if (info.absent.size) add('請假 ', [...info.absent].filter(id => info.roster.some(s => String(s.id) === id)).length, ' 人');
        }
        const round = $('lotteryRound');
        if (round) {
            round.replaceChildren();
            round.hidden = !info.noRepeat || !info.present.length;
            if (!round.hidden) {
                const done = info.drawnPresent.length, total = info.present.length;
                const bar = el('div', 'lt-round-bar');
                const fill = el('i');
                fill.style.width = (total ? Math.round(done / total * 100) : 0) + '%';
                bar.append(fill);
                const reset = el('button', '', '全部放回籤筒');
                reset.type = 'button';
                reset.disabled = done === 0;
                reset.addEventListener('click', resetDrawn);
                round.append(el('span', '', `這一輪 ${done} / ${total}`), bar, reset);
            }
        }
        const badge = $('lotteryPoolBadge');
        if (badge) badge.textContent = `可抽 ${info.available.length}／${info.roster.length}`;
        renderPoolList(info);
        syncCountUI();
        updateProjInfo();
    }
    function renderPoolList(info) {
        const list = $('lotteryPoolList');
        if (!list) return;
        const scroll = list.scrollTop;
        const focusId = document.activeElement && list.contains(document.activeElement) ? document.activeElement.dataset.id : null;
        const sorted = info.roster.map((s, i) => ({ s, i })).sort((a, b) => (seatSort(a.s) - seatSort(b.s)) || (a.i - b.i)).map(x => x.s);
        list.replaceChildren(...sorted.map(s => {
            const id = String(s.id);
            const st = info.absent.has(id) ? 'absent' : (info.noRepeat && info.drawn.has(id) ? 'drawn' : 'ok');
            const b = el('button', 'lt-stu', `${seatText(s) ? seatText(s) + ' ' : ''}${s.name}`);
            b.type = 'button';
            b.dataset.state = st;
            b.dataset.id = id;
            b.title = st === 'ok' ? '點一下：今天請假（不會被抽到，分組也會跳過）'
                : st === 'absent' ? '點一下：恢復出席' : '點一下：放回籤筒';
            b.setAttribute('aria-label', `${s.name}，${st === 'ok' ? '可抽' : st === 'absent' ? '請假' : '已抽過'}`);
            b.addEventListener('click', () => onPoolChip(s, st));
            return b;
        }));
        if (!sorted.length) list.append(el('span', 'lt-pool-help', '還沒有學生名單。'));
        list.scrollTop = scroll;
        if (focusId) [...list.children].find(c => c.dataset.id === focusId)?.focus({ preventScroll: true });
    }
    function onPoolChip(s, st) {
        if (state.busy) return;
        if (st === 'drawn') setDrawn(getDrawn().filter(x => String(x) !== String(s.id)), '放回籤筒');
        else setAbsent(s.id, st === 'ok');
        refreshPoolUI();
        if (view.mode === 'idle') paint();
    }
    function resetDrawn() {
        if (state.busy) return;
        const prev = getDrawn().slice();
        if (!prev.length) { toast('籤筒已經是滿的，大家都可以被抽到'); return; }
        if (!setDrawn([], '全部放回籤筒')) return;
        refreshPoolUI();
        toast('🔄 已把全部同學放回籤筒', {
            label: '復原',
            onClick: () => {
                // 復原時保留之後新抽出的人
                setDrawn([...new Map([...prev, ...getDrawn()].map(id => [String(id), id])).values()], '復原籤筒');
                refreshPoolUI();
                toast('已復原籤筒');
            }
        }, UNDO_MS);
    }
    function toggleNoRepeat() {
        const box = $('noRepeatToggle');
        noRepeatLottery = box ? !!box.checked : !isNoRepeat();
        try { localStorage.setItem('noRepeatLottery', JSON.stringify(noRepeatLottery)); } catch (e) { /* 偏好設定 */ }
        refreshPoolUI();
    }

    // ---------- 舞台（主畫面與投影共用同一份狀態） ----------
    function stages() {
        const list = [];
        const main = $('lotteryResult');
        if (main) list.push(main);
        if (proj) list.push(proj.stage);
        return list;
    }
    function headText() {
        if (!view.done) return '🎲 抽籤中…（點一下可略過）';
        const n = view.slots.length;
        return n > 1 ? `🎊 抽中 ${n} 位！` : '🎉 抽中了！';
    }
    function paint() {
        injectStyles();
        stages().forEach(stage => buildStage(stage, !!proj && stage === proj.stage));
        fitProj();
    }
    function buildStage(stage, big) {
        stage.className = 'lt-stage' + (big ? ' lt-big' : '') + (view.mode === 'draw' && view.done ? ' lt-done' : '');
        stage.onclick = () => { if (state.busy) state.skip = true; };
        stage.replaceChildren();
        if (view.mode !== 'draw') { stage.append(idleContent(big)); return; }
        stage.append(el('div', 'lt-head', headText()));
        const grid = el('div', 'lt-cards');
        grid.dataset.n = String(view.slots.length);
        view.slots.forEach((slot, i) => grid.append(buildCard(slot, i)));
        stage.append(grid);
        const foot = el('div', 'lt-foot');
        if (!big) {
            const again = el('button', 'lt-fbtn lt-main', '🎲 再抽一次');
            again.type = 'button';
            again.addEventListener('click', e => { e.stopPropagation(); draw(); });
            const projBtn = el('button', 'lt-fbtn', '🖥️ 投影');
            projBtn.type = 'button';
            projBtn.addEventListener('click', e => { e.stopPropagation(); openProj(projBtn); });
            foot.append(again, projBtn);
        }
        foot.append(el('span', 'lt-foot-info', footText()));
        stage.append(foot);
    }
    function footText() {
        const info = poolInfo();
        return `籤筒還剩 ${info.available.length} 人`;
    }
    function idleContent(big) {
        const wrap = el('div', 'lt-idle');
        wrap.append(el('div', 'lt-idle-icon', '🎲'));
        if (!getStudents().length) {
            wrap.append(el('div', 'lt-idle-title', '還沒有學生名單'), el('div', 'lt-idle-text', '先到「學生管理」新增或匯入學生，就能開始抽籤。'));
            if (!big) {
                const go = el('button', 'lt-fbtn lt-main', '前往學生管理');
                go.type = 'button';
                go.addEventListener('click', () => { if (typeof window.showSection === 'function') window.showSection('students'); });
                wrap.append(go);
            }
            return wrap;
        }
        wrap.append(
            el('div', 'lt-idle-title', big ? '準備抽籤！' : '準備好了嗎？'),
            el('div', 'lt-idle-text', big ? '按下方「🎲 抽籤」或空白鍵開始' : '按「🎲 開始抽籤」，或在鍵盤按 L 鍵')
        );
        const last = getHistory()[0];
        if (last && last.type !== 'group' && Array.isArray(last.result) && last.result.length) {
            const when = recordDate(last);
            wrap.append(el('div', 'lt-last', `上一次：${last.result.map(s => s?.name || '?').join('、')}${when ? `（${hhmm(when)}）` : ''}`));
        }
        return wrap;
    }
    function buildCard(slot, i) {
        const card = el('div', 'lt-card ' + (slot.landed ? 'lt-landed' : 'lt-rolling'));
        card.dataset.slot = String(i);
        card.style.setProperty('--h', HUES[i % HUES.length]);
        const name = slot.landed ? slot.student.name : (pick(poolInfo().available.concat(getStudents()))?.name || '？');
        card.append(el('span', 'lt-seat', slot.landed ? seatText(slot.student) : ''), el('div', 'lt-name', name));
        const acts = el('div', 'lt-acts');
        const plus = el('button', 'lt-act lt-plus', plusLabel(slot));
        plus.type = 'button';
        plus.title = '幫這位同學加 1 分（理由：抽籤加分）';
        plus.addEventListener('click', e => { e.stopPropagation(); award(i); });
        const redo = el('button', 'lt-act lt-redo', '請假・重抽');
        redo.type = 'button';
        redo.title = '標成今天請假（分組也會跳過），並改抽另一位';
        redo.addEventListener('click', e => { e.stopPropagation(); rerollAbsent(i); });
        acts.append(plus, redo);
        card.append(acts);
        return card;
    }
    const plusLabel = slot => slot.given ? `＋1（已加 ${slot.given} 分）` : '＋1 加分';
    function cardEls(i) {
        return stages().map(stage => stage.querySelector(`.lt-card[data-slot="${i}"]`)).filter(Boolean);
    }
    function rollTick(pool) {
        if (!pool.length) return;
        stages().forEach(stage => stage.querySelectorAll('.lt-card.lt-rolling .lt-name').forEach(n => { n.textContent = pick(pool).name; }));
    }
    function landSlot(i) {
        const slot = view.slots[i];
        if (!slot || slot.landed) return;
        slot.landed = true;
        cardEls(i).forEach(card => {
            card.classList.remove('lt-rolling');
            card.classList.add('lt-landed');
            if (state.anim) { card.classList.remove('lt-pop'); void card.offsetWidth; card.classList.add('lt-pop'); }
            card.querySelector('.lt-name').textContent = slot.student.name;
            card.querySelector('.lt-seat').textContent = seatText(slot.student);
        });
        fitProj();
    }
    function finishDraw() {
        view.done = true;
        stages().forEach(stage => {
            stage.classList.add('lt-done');
            const head = stage.querySelector('.lt-head');
            if (head) head.textContent = headText();
            const info = stage.querySelector('.lt-foot-info');
            if (info) info.textContent = footText();
        });
        const sr = $('lotteryAnnounce');
        if (sr) sr.textContent = '抽中：' + view.slots.map(s => s.student.name).join('、');
        fitProj();
    }
    function setBusyUI(busy) {
        const btn = $('startLotteryBtn');
        if (btn) {
            btn.textContent = busy ? '⏭ 略過動畫' : '🎲 開始抽籤';
            btn.setAttribute('aria-busy', String(busy));
            btn.disabled = false;
        }
        if (proj) proj.drawBtn.textContent = busy ? '⏭ 略過' : '🎲 抽籤';
    }

    // ---------- 抽籤流程 ----------
    async function animateDraw(pool, n) {
        const delays = [];
        for (let d = 45; d < 170; d *= 1.18) delays.push(Math.round(d));
        for (const ms of delays) {
            if (state.skip) break;
            rollTick(pool);
            play('playLotteryTickSound');
            await sleep(ms);
        }
        for (let i = 0; i < n && !state.skip; i++) {
            // 定格前多晃兩下，製造懸念
            for (const ms of [190, 230]) {
                if (state.skip) break;
                rollTick(pool);
                play('playLotteryTickSound');
                await sleep(ms);
            }
            if (state.skip) break;
            landSlot(i);
            if (i < n - 1) play('playLotteryTickSound');
        }
        for (let i = 0; i < n; i++) landSlot(i);
    }
    async function draw() {
        if (state.busy) { state.skip = true; return; }   // 抽籤中再按一次 = 略過動畫
        const info = poolInfo();
        if (!info.roster.length) { toast('還沒有學生名單，請先到「學生管理」新增學生'); paint(); return; }
        if (!info.present.length) {
            toast('今天全部同學都標成請假了，請在「籤筒名單」恢復出席');
            const pool = $('lotteryPool');
            if (pool && !proj) pool.open = true;
            return;
        }
        let available = info.available;
        if (!available.length) {
            // 一輪抽完：自動全部放回（沿用舊版行為），只放回今天出席的同學
            if (!setDrawn([], '自動放回籤筒')) return;
            available = info.present;
            toast('🔄 這一輪大家都抽過了，已全部放回籤筒');
        }
        const want = wantCount();
        const n = Math.min(want, available.length);
        if (n < want) toast(`籤筒只剩 ${available.length} 人，這次抽 ${n} 位`);
        const winners = sample(available, n);
        if (isNoRepeat()) {
            const next = getDrawn().slice();
            winners.forEach(w => { if (!next.some(x => String(x) === String(w.id))) next.push(w.id); });
            if (!setDrawn(next, '記錄已抽出的學生')) return;
        }
        const useAnim = state.anim;
        view.mode = 'draw';
        view.type = currentType();
        view.done = false;
        view.recordId = null;
        view.slots = winners.map(student => ({ student, landed: !useAnim, given: 0 }));
        state.busy = true;
        state.skip = false;
        setBusyUI(true);
        paint();
        try {
            if (useAnim) await animateDraw(available, n);
        } catch (e) {
            console.error('[Lottery] 動畫錯誤:', e);
            view.slots.forEach((s, i) => landSlot(i));
        } finally {
            state.busy = false;
            setBusyUI(false);
        }
        view.recordId = saveHistory(view.slots.map(s => s.student), view.type);
        finishDraw();
        refreshPoolUI();
        renderHistory();
        play('playLotteryWinSound');
        play('triggerConfetti');
    }
    function saveHistory(list, type) {
        const record = { id: Date.now(), type, result: list.map(slim), timestamp: new Date().toLocaleString('zh-TW', { hour12: false }) };
        const hist = getHistory();
        hist.unshift(record);
        const ok = safeSet('lotteryHistory', JSON.stringify(hist), '記錄抽籤結果', () => {
            const i = hist.indexOf(record);
            if (i >= 0) hist.splice(i, 1);
        });
        return ok ? record.id : null;
    }
    function updateRecord() {
        if (view.recordId == null) return;
        const hist = getHistory();
        const record = hist.find(r => r && r.id === view.recordId);
        if (!record) return;
        const before = record.result;
        record.result = view.slots.map(s => slim(s.student));
        safeSet('lotteryHistory', JSON.stringify(hist), '更新抽籤結果', () => { record.result = before; });
        renderHistory();
    }

    // ---------- 抽中後：加分、請假重抽 ----------
    async function award(i) {
        const slot = view.slots[i];
        if (!slot || !view.done || state.busy) return;
        const sid = slot.student.id;
        if (!getStudents().some(s => s.id === sid)) { toast('這位同學已不在名單中'); return; }
        if (typeof window.addPointsToStudent !== 'function') { toast('找不到加分功能'); return; }
        const before = Array.isArray(window.pointsHistory) ? window.pointsHistory.length : -1;
        let ok = false;
        try {
            const r = window.addPointsToStudent(sid, 1, '抽籤加分');
            ok = r && typeof r.then === 'function' ? !!(await r) : (Array.isArray(window.pointsHistory) && window.pointsHistory.length > before);
        } catch (e) {
            console.error('[Lottery] 加分失敗:', e);
        }
        if (!ok) return;
        slot.given += 1;
        cardEls(i).forEach(card => {
            const btn = card.querySelector('.lt-plus');
            if (btn) btn.textContent = plusLabel(slot);
            const f = el('span', 'lt-float', '+1');
            card.append(f);
            setTimeout(() => f.remove(), 950);
        });
    }
    async function rerollAbsent(i) {
        const slot = view.slots[i];
        if (!slot || !view.done || state.busy) return;
        const s = slot.student;
        setAbsent(s.id, true);
        // 他其實沒有被抽到：從已抽名單拿掉，之後出席還會在籤筒裡
        if (isNoRepeat()) setDrawn(getDrawn().filter(x => String(x) !== String(s.id)), '請假重抽');
        const taken = new Set(view.slots.map(x => String(x.student.id)));
        const pool = poolInfo().available.filter(x => !taken.has(String(x.id)));
        if (!pool.length) {
            view.slots.splice(i, 1);
            if (!view.slots.length) view.mode = 'idle';
            updateRecord();
            paint();
            refreshPoolUI();
            toast(`${s.name} 已標成今天請假；籤筒沒有其他人可以替補`);
            return;
        }
        const repl = pick(pool);
        if (isNoRepeat()) setDrawn([...getDrawn(), repl.id], '請假重抽');
        view.slots[i] = { student: repl, landed: false, given: 0 };
        state.busy = true;
        state.skip = false;
        setBusyUI(true);
        cardEls(i).forEach(card => {
            card.classList.remove('lt-landed', 'lt-pop');
            card.classList.add('lt-rolling');
            card.querySelector('.lt-seat').textContent = '';
            const btn = card.querySelector('.lt-plus');
            if (btn) btn.textContent = plusLabel(view.slots[i]);
        });
        try {
            if (state.anim) {
                for (let k = 0; k < 10 && !state.skip; k++) {
                    rollTick(pool);
                    play('playLotteryTickSound');
                    await sleep(60 + k * 16);
                }
            }
        } finally {
            landSlot(i);
            state.busy = false;
            setBusyUI(false);
        }
        updateRecord();
        finishDraw();
        refreshPoolUI();
        play('playLotteryWinSound');
        toast(`${s.name} 今天請假，改抽到 ${repl.name}`);
    }

    // ---------- 紀錄 ----------
    function recordDate(r) {
        const n = Number(r && r.id);
        if (n > 1e12 && n < 1e13) return new Date(n);
        const d = new Date(r && r.timestamp);
        return isNaN(d) ? null : d;
    }
    const hhmm = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    function dayLabel(d) {
        if (!d) return '更早';
        const start = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
        const diff = Math.round((start(new Date()) - start(d)) / 86400000);
        if (diff === 0) return '今天';
        if (diff === 1) return '昨天';
        return `${d.getMonth() + 1}/${d.getDate()}（${'日一二三四五六'[d.getDay()]}）`;
    }
    function renderHistory() {
        const box = $('lotteryHistory');
        if (!box) return;
        injectStyles();
        const hist = getHistory();
        const count = $('lotteryHistoryCount');
        if (count) count.textContent = hist.length ? `共 ${hist.length} 筆` : '';
        box.replaceChildren();
        if (!hist.length) { box.append(el('div', 'text-gray-500 text-center text-sm py-2', '還沒有抽籤紀錄')); return; }
        let lastLabel = null;
        hist.slice(0, HISTORY_SHOWN).forEach(r => {
            if (!r) return;
            const when = recordDate(r);
            const label = dayLabel(when);
            if (label !== lastLabel) { box.append(el('div', 'lt-hday', label)); lastLabel = label; }
            const row = el('div', 'lt-hrow');
            row.append(el('span', 'lt-htime', when ? hhmm(when) : ''));
            const names = el('span', 'lt-hnames');
            if (r.type === 'group') names.append(el('span', 'lt-hchip', `🏆 ${r.result?.[0]?.name || ''}（分組）`));
            else if (Array.isArray(r.result) && r.result.length) r.result.forEach(s => names.append(el('span', 'lt-hchip', s?.name || '?')));
            else names.append(el('span', 'lt-hchip', '（抽中的同學改為請假）'));
            row.append(names);
            box.append(row);
        });
        if (hist.length > HISTORY_SHOWN) box.append(el('div', 'lt-hmore', `只顯示最近 ${HISTORY_SHOWN} 筆；完整紀錄會一起備份與同步。`));
    }

    // ---------- 投影抽籤 ----------
    function updateProjInfo() {
        if (!proj) return;
        const info = poolInfo();
        const n = wantCount();
        proj.countNum.textContent = String(n);
        proj.minus.disabled = n <= 1;
        proj.plus.disabled = n >= Math.max(1, info.present.length);
        proj.info.textContent = `籤筒可抽 ${info.available.length} 人`;
    }
    function changeProjCount(delta) {
        const max = Math.max(1, poolInfo().present.length);
        const next = Math.min(max, Math.max(1, wantCount() + delta));
        if (next === 1) setType('single');
        else { setType('multiple'); setCount(next); }
        updateProjInfo();
    }
    function onProjResize() {
        if (!proj) return;
        cancelAnimationFrame(proj.raf);
        proj.raf = requestAnimationFrame(fitProj);
    }
    function openProj(opener) {
        if (proj) return;
        injectStyles();
        const root = el('div', 'lt-proj');
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', '投影抽籤');
        const bar = el('div', 'lt-proj-bar');
        const btn = (text, handler, label) => {
            const b = el('button', '', text);
            b.type = 'button';
            if (label) b.setAttribute('aria-label', label);
            b.addEventListener('click', handler);
            return b;
        };
        const count = el('div', 'lt-proj-count');
        const minus = btn('−', () => changeProjCount(-1), '少抽 1 人');
        const plus = btn('＋', () => changeProjCount(1), '多抽 1 人');
        const countNum = el('b', '', '1');
        count.append('每次抽', minus, countNum, plus, '人');
        const info = el('span', 'lt-proj-info');
        const full = btn('⛶ 全螢幕', () => {
            try {
                if (document.fullscreenElement) document.exitFullscreen();
                else root.requestFullscreen?.();
            } catch (e) { /* 不支援就維持視窗大小 */ }
        });
        const close = btn('✕ 關閉', closeProj, '關閉投影抽籤');
        bar.append(el('div', 'lt-proj-title', `🎲 抽籤${className() ? ' · ' + className() : ''}`), count, info, full, close);
        const stage = el('div', 'lt-stage lt-big');
        const foot = el('div', 'lt-proj-foot');
        const drawBtn = btn('🎲 抽籤', () => draw());
        drawBtn.className = 'lt-proj-draw';
        foot.append(drawBtn, el('span', 'lt-proj-hint', '空白鍵或 Enter 也可以抽；Esc 關閉'));
        root.append(bar, stage, foot);
        document.body.append(root);
        document.body.classList.add('lt-proj-open');
        proj = { root, stage, drawBtn, info, countNum, minus, plus, opener, overflow: document.body.style.overflow, raf: 0 };
        document.body.style.overflow = 'hidden';
        window.addEventListener('resize', onProjResize);
        document.addEventListener('fullscreenchange', onProjResize);
        setBusyUI(state.busy);
        paint();
        updateProjInfo();
        drawBtn.focus();
    }
    function closeProj() {
        if (!proj) return;
        const { root, opener, overflow } = proj;
        cancelAnimationFrame(proj.raf);
        proj = null;
        window.removeEventListener('resize', onProjResize);
        document.removeEventListener('fullscreenchange', onProjResize);
        try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* ignore */ }
        root.remove();
        document.body.classList.remove('lt-proj-open');
        document.body.style.overflow = overflow || '';
        if (opener && opener.isConnected) opener.focus({ preventScroll: true });
        else $('lotteryProjectBtn')?.focus({ preventScroll: true });
    }
    function fitProj() {
        if (!proj) return;
        const stage = proj.stage;
        const n = view.mode === 'draw' ? view.slots.length : 0;
        const portrait = window.innerWidth < window.innerHeight * 0.9 || window.innerWidth < 700;
        const cols = n <= 1 ? 1 : portrait ? (n <= 3 ? 1 : 2) : n <= 3 ? n : n === 4 ? 2 : n <= 6 ? 3 : n <= 8 ? 4 : 5;
        stage.style.setProperty('--cols', String(cols));
        const cards = stage.querySelector('.lt-cards');
        if (!cards) return;
        const rows = Math.ceil(n / cols);
        let size = Math.floor(Math.min(n === 1 ? window.innerHeight * 0.24 : window.innerHeight * 0.42 / rows, window.innerWidth / cols / 3.4, 240));
        const fits = () => stage.scrollHeight <= stage.clientHeight + 1 &&
            [...cards.querySelectorAll('.lt-name')].every(x => x.scrollWidth <= x.clientWidth + 1);
        for (; size > 24; size -= 4) {
            stage.style.setProperty('--lt-size', size + 'px');
            if (fits()) break;
        }
        stage.style.setProperty('--lt-size', Math.max(24, size) + 'px');
    }

    // ---------- 鍵盤：抽籤中與投影時擋住全站快捷鍵 ----------
    function onKey(e) {
        if (!proj && !state.busy) return;
        if (e.key === 'Tab') return;
        e.stopPropagation();   // 不要觸發全站快捷鍵（空白鍵會開計時器、數字鍵會換頁…）
        if (state.busy && ['Enter', ' ', 'Escape'].includes(e.key)) { e.preventDefault(); state.skip = true; return; }
        if (!proj) return;
        if (e.key === 'Escape') {
            if (!document.fullscreenElement) { e.preventDefault(); closeProj(); }
            return;
        }
        if (e.key === ' ' || e.key === 'Enter') {
            const a = document.activeElement;
            if (a && a !== proj.drawBtn && proj.root.contains(a) && a.matches('button, input, select, [role="button"]')) return;   // 讓那個按鈕自己處理
            e.preventDefault();
            draw();
        }
    }

    // ---------- 提示（可帶「復原」按鈕） ----------
    function toast(message, action, duration = 3500) {
        let box = $('ltToast');
        if (!box) {
            box = el('div', 'lt-toast');
            box.id = 'ltToast';
            box.setAttribute('role', 'status');
            box.setAttribute('aria-live', 'polite');
            document.body.append(box);
        }
        box.replaceChildren(el('span', '', message));
        if (action) {
            const b = el('button', '', action.label);
            b.type = 'button';
            b.addEventListener('click', () => { hideToast(); action.onClick(); });
            box.append(b);
        }
        clearTimeout(toastTimer);
        toastTimer = setTimeout(hideToast, duration);
    }
    function hideToast() {
        clearTimeout(toastTimer);
        $('ltToast')?.remove();
    }

    // ---------- 初始化 ----------
    function init() {
        injectStyles();
        const section = $('lottery-section');
        if (!section) return;
        const prefs = loadPrefs();
        const noRepeatBox = $('noRepeatToggle');
        if (noRepeatBox) noRepeatBox.checked = isNoRepeat();
        cleanupDrawnStudents();

        const input = $('lotteryCount');
        if (input) {
            input.value = state.count;
            input.addEventListener('input', onCountInput);
            input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); draw(); } });
        }
        $('lotteryMinus')?.addEventListener('click', () => setCount(Math.max(1, (readCount() || state.count) - 1)));
        $('lotteryPlus')?.addEventListener('click', () => {
            const max = Math.max(1, poolInfo().present.length);
            setCount(Math.min(max, (readCount() || 0) + 1));
        });
        setType(prefs.type === 'multiple' ? 'multiple' : 'single');
        const anim = $('lotteryAnimToggle');
        if (anim) {
            anim.checked = state.anim;
            anim.addEventListener('change', () => { state.anim = anim.checked; savePrefs(); });
        }
        $('lotteryProjectBtn')?.addEventListener('click', e => openProj(e.currentTarget));
        if (!$('lotteryAnnounce')) {
            const sr = el('div', 'lt-sr');
            sr.id = 'lotteryAnnounce';
            sr.setAttribute('role', 'status');
            sr.setAttribute('aria-live', 'polite');
            section.append(sr);
        }
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('todayattendancechange', () => {
            if (savingAbsent || state.busy) return;
            refreshPoolUI();
            if (view.mode === 'idle') paint();
        });
        // 每次打開「抽籤系統」都重新整理名單（學生可能剛新增、刪除或標了請假）
        new MutationObserver(() => {
            if (section.classList.contains('hidden')) return;
            refreshPoolUI();
            if (view.mode === 'idle') paint();
        }).observe(section, { attributes: true, attributeFilter: ['class'] });

        refreshPoolUI();
        paint();
        renderHistory();
        console.log('🎲 抽籤增強模組 v2 已載入');
    }

    // 覆蓋既有的全域函式（按鈕 onclick、鍵盤 L 鍵、雲端還原後的重畫都會呼叫）
    window.startLottery = function () {
        const section = $('lottery-section');
        if (!proj && section && section.classList.contains('hidden') && typeof window.showSection === 'function') window.showSection('lottery');
        draw();
    };
    window.setLotteryType = setType;
    window.toggleNoRepeat = toggleNoRepeat;
    window.resetDrawnStudents = resetDrawn;
    window.updateLotteryStats = () => refreshPoolUI();
    window.renderLotteryHistory = () => { renderHistory(); if (view.mode === 'idle') paint(); };
    window.LotteryUI = { draw, project: openProj, closeProjection: closeProj, refresh: refreshPoolUI };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
