/**
 * 加扣分增強模組
 *
 * 兩種給分方式都支援：
 *   1. 先點學生（可複選）→ 再按項目：一次給選取的學生，同一批可一起撤銷。
 *   2. 先按項目 →「連續給分」：之後點誰就給誰，按「結束」或 Esc 停止（沿用舊版習慣）。
 * 學生卡片顯示目前分數與「今天」增減；給分後卡片跳出 +1，底部提示可「撤銷」。
 * 加扣分項目可自行編輯（存在這台電腦）；紀錄依日期分段、同一批合併顯示，可逐筆撤銷。
 *
 * 資料一律走既有流程：有班級寵物模組時用 ClassPets.award / ClassPets.undo（與寵物成長、金幣、
 * 小組分數、雲端同步一致）；沒有時退回 addPointsToStudent。本模組不直接改分數資料。
 */

(function () {
    'use strict';

    const ITEMS_KEY = 'pointsQuickActions';
    const DEFAULT_ITEMS = [
        { points: 1, reason: '回答問題' }, { points: 2, reason: '主動發言' },
        { points: 3, reason: '幫助同學' }, { points: 5, reason: '優秀表現' },
        { points: -1, reason: '遲到' }, { points: -2, reason: '未交作業' },
        { points: -3, reason: '上課講話' }, { points: -5, reason: '嚴重違規' }
    ];
    const VALUES = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5];
    const HISTORY_STEP = 30;
    const UNDO_MS = 8000;

    const state = {
        selected: new Set(),     // 學生 id（字串）
        armed: null,             // 連續給分中的項目 { points, reason }
        filter: 'all',           // 'all' 或小組 id（字串）
        editing: false,
        historyLimit: HISTORY_STEP,
        custom: { points: 1, reason: '' },
        sheet: null
    };
    let items = null;
    let queue = Promise.resolve();
    let toastTimer = null;

    // ---------- 小工具 ----------
    const $ = id => document.getElementById(id);
    const getStudents = () => (Array.isArray(window.students) ? window.students : []);
    const getHistory = () => (Array.isArray(window.pointsHistory) ? window.pointsHistory : []);
    const getGroups = () => (Array.isArray(window.groups) ? window.groups : []);
    const sameId = (a, b) => a != null && b != null && String(a) === String(b);
    const seatText = s => String(s?.number ?? s?.seatNumber ?? '').trim();
    const seatSort = s => { const n = Number(seatText(s)); return seatText(s) && Number.isFinite(n) ? n : Infinity; };
    const fmtPts = p => (p > 0 ? '+' : '') + p;
    const sameItem = (a, b) => !!a && !!b && a.points === b.points && a.reason === b.reason;
    const isNarrow = () => window.innerWidth < 1024;

    function el(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text != null) node.textContent = text;
        return node;
    }
    function btn(cls, text, handler, label) {
        const b = el('button', cls, text);
        b.type = 'button';
        if (label) b.setAttribute('aria-label', label);
        if (handler) b.addEventListener('click', handler);
        return b;
    }
    function play(fnName) {
        try { if (typeof window[fnName] === 'function') window[fnName](); } catch (e) { /* 音效失敗不影響給分 */ }
    }
    function absentSet() {
        try { return window.TodayAttendance ? TodayAttendance.load() : new Set(); } catch (e) { return new Set(); }
    }
    function newBatchId() {
        try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* 舊瀏覽器 */ }
        return 'pt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    }
    // 每次給分、撤銷依序執行：寵物模組忙碌時會直接略過新的操作，排隊才不會漏掉連點
    function enqueue(task) {
        const run = queue.then(task, task);
        queue = run.catch(() => {});
        return run;
    }
    function recordTime(r) {
        const n = Number(r?.createdAtMs) || Number(r?.id);
        if (n > 1e12 && n < 1e13) return n;
        const d = Date.parse(r?.timestamp || r?.date || '');
        return Number.isFinite(d) ? d : null;
    }
    function startOfToday() {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }

    // ---------- 樣式 ----------
    function injectStyles() {
        if ($('points-v2-styles')) return;
        const style = document.createElement('style');
        style.id = 'points-v2-styles';
        style.textContent = `
            .pt-scope [hidden] { display:none !important; }
            .pt-scope .points-pet-bridge { padding:10px 14px; margin:0 0 14px; line-height:1.5; }
            .pt-scope .points-pet-bridge strong { font-size:15px; }
            .pt-scope .points-pet-bridge p { margin:4px 0; font-size:13px; }
            .pt-scope .points-pet-actions { flex-direction:row; flex-wrap:wrap; gap:6px; margin-top:6px; }
            .pt-scope .points-pet-actions button { width:auto; min-height:36px; padding:6px 12px; font-size:13px; }
            .pt-scope .pet-nav { min-height:36px; padding:6px 12px; font-size:14px; margin:0 0 10px; }
            .pt-topbar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px 16px; margin-bottom:14px; }
            .pt-howto { margin:0; font-size:14px; color:#475569; }
            .pt-tools { display:flex; flex-wrap:wrap; gap:8px; }
            .pt-tool { min-height:38px; padding:6px 14px; border-radius:10px; border:1px solid #cbd5e1; background:#fff; color:#334155; font-size:14px; font-weight:700; cursor:pointer; touch-action:manipulation; }
            .pt-tool:hover { background:#f1f5f9; }
            .pt-tool-danger { color:#b91c1c; border-color:#fca5a5; }
            .pt-tool-danger:hover { background:#fef2f2; }
            .pt-layout { display:flex; flex-direction:column; gap:16px; }
            .pt-card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:14px; min-width:0; }
            .pt-card-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; }
            .pt-card-head h3 { margin:0; font-size:17px; font-weight:800; color:#1e293b; }
            .pt-link { border:0; background:none; padding:6px 4px; min-height:36px; font-size:14px; font-weight:700; color:#2563eb; cursor:pointer; }
            .pt-link:hover { text-decoration:underline; }
            .pt-count { font-size:13px; font-weight:500; color:#64748b; }
            .pt-sub { margin:10px 0 6px; font-size:13px; font-weight:700; color:#64748b; }
            .pt-sub:first-child { margin-top:0; }
            .pt-items-box .pt-sub:first-child { margin-top:0; }

            .pt-item-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(128px,1fr)); gap:8px; }
            .pt-item { display:flex; align-items:center; justify-content:space-between; gap:6px; min-height:46px; padding:8px 12px; border-radius:12px; border:2px solid; background:#fff; font-size:15px; font-weight:700; text-align:left; cursor:pointer; touch-action:manipulation; transition:transform .08s, box-shadow .15s, background .15s; }
            .pt-item:active { transform:scale(.96); }
            .pt-item-name { min-width:0; overflow-wrap:anywhere; color:#1f2937; }
            .pt-item-pts { flex:none; min-width:2.4em; padding:2px 8px; border-radius:999px; color:#fff; font-weight:900; text-align:center; }
            .pt-item.pt-plus { border-color:#86efac; }
            .pt-item.pt-plus:hover { background:#f0fdf4; }
            .pt-item.pt-plus .pt-item-pts { background:#16a34a; }
            .pt-item.pt-minus { border-color:#fca5a5; }
            .pt-item.pt-minus:hover { background:#fef2f2; }
            .pt-item.pt-minus .pt-item-pts { background:#dc2626; }
            .pt-item[aria-pressed="true"] { box-shadow:0 0 0 3px #fbbf24; background:#fffbeb; }
            .pt-values { display:flex; flex-wrap:wrap; gap:6px; }
            .pt-val { width:44px; height:44px; border-radius:999px; border:2px solid; background:#fff; font-size:16px; font-weight:900; cursor:pointer; touch-action:manipulation; transition:transform .08s; }
            .pt-val:active { transform:scale(.9); }
            .pt-val.pt-plus { border-color:#86efac; color:#15803d; }
            .pt-val.pt-minus { border-color:#fca5a5; color:#b91c1c; }
            .pt-val[aria-pressed="true"] { box-shadow:0 0 0 3px #fbbf24; background:#fffbeb; }
            .pt-custom { margin-top:4px; }
            .pt-custom-row { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
            .pt-custom-row .pt-step { width:40px; height:40px; border-radius:10px; border:1px solid #cbd5e1; background:#fff; font-size:20px; font-weight:800; color:#334155; cursor:pointer; }
            .pt-custom-row input[type="number"] { width:64px; height:40px; text-align:center; font-size:18px; font-weight:800; border:1px solid #cbd5e1; border-radius:10px; -moz-appearance:textfield; }
            .pt-custom-row input[type="number"]::-webkit-outer-spin-button, .pt-custom-row input[type="number"]::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
            .pt-custom-row input[type="text"] { flex:1 1 140px; min-width:0; height:40px; padding:0 10px; font-size:15px; border:1px solid #cbd5e1; border-radius:10px; }
            .pt-custom-row .pt-go { height:40px; padding:0 16px; border:0; border-radius:10px; background:#2563eb; color:#fff; font-size:15px; font-weight:800; cursor:pointer; }
            .pt-custom-row .pt-go:hover { background:#1d4ed8; }
            .pt-bad { border-color:#ef4444 !important; background:#fef2f2 !important; }

            .pt-armed { position:sticky; top:var(--pt-top,84px); z-index:5; display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; margin-bottom:10px; padding:10px 12px; border-radius:12px; background:#fef3c7; border:2px solid #f59e0b; color:#78350f; font-size:15px; font-weight:700; box-shadow:0 4px 12px rgba(245,158,11,.25); }
            .pt-armed b { font-size:17px; }
            .pt-armed span { flex:1 1 160px; }
            .pt-armed button { min-height:36px; padding:4px 14px; border-radius:999px; border:1px solid #d97706; background:#fff; color:#92400e; font-weight:800; cursor:pointer; }
            .pt-filter { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
            .pt-filter button { min-height:32px; padding:3px 12px; border-radius:999px; border:1px solid #cbd5e1; background:#fff; color:#334155; font-size:13px; font-weight:600; cursor:pointer; }
            .pt-filter button[aria-pressed="true"] { background:#2563eb; border-color:#2563eb; color:#fff; }
            .pt-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(104px,1fr)); gap:8px; }
            .pt-stu { position:relative; display:flex; flex-direction:column; align-items:center; gap:2px; min-height:92px; padding:10px 6px 8px; border-radius:14px; border:2px solid #e2e8f0; background:#fff; color:#1f2937; cursor:pointer; touch-action:manipulation; transition:transform .08s, border-color .15s, box-shadow .15s, background .2s; }
            .pt-stu:hover { border-color:#93c5fd; }
            .pt-stu:active { transform:scale(.96); }
            .pt-stu-seat { position:absolute; top:5px; left:8px; font-size:11px; font-weight:700; color:#94a3b8; }
            .pt-stu-name { max-width:100%; font-size:16px; font-weight:800; line-height:1.25; overflow-wrap:anywhere; }
            .pt-stu-score { font-size:22px; font-weight:900; line-height:1.1; font-variant-numeric:tabular-nums; color:#16a34a; }
            .pt-stu-score.pt-neg { color:#dc2626; }
            .pt-stu-today { min-height:16px; font-size:11px; font-weight:700; color:#64748b; }
            .pt-stu-tag { position:absolute; top:5px; right:7px; font-size:11px; font-weight:800; padding:0 6px; border-radius:999px; background:#fef3c7; color:#92400e; }
            .pt-stu.pt-absent { opacity:.6; }
            .pt-stu[aria-pressed="true"] { border-color:#2563eb; background:#eff6ff; box-shadow:0 0 0 2px #93c5fd; }
            .pt-stu[aria-pressed="true"]::after { content:'✓'; position:absolute; top:-8px; right:-8px; width:24px; height:24px; border-radius:999px; background:#2563eb; color:#fff; font-size:14px; font-weight:900; line-height:24px; text-align:center; box-shadow:0 2px 6px rgba(37,99,235,.4); }
            .pt-scope.pt-is-armed .pt-stu { cursor:copy; border-style:dashed; border-color:#f59e0b; }
            .pt-stu.pt-hit-plus { background:#dcfce7; border-color:#22c55e; }
            .pt-stu.pt-hit-minus { background:#fee2e2; border-color:#ef4444; }
            .pt-bump { animation:ptBump .45s ease-out; }
            .pt-bubble { position:absolute; top:22px; left:50%; transform:translateX(-50%); font-size:22px; font-weight:900; pointer-events:none; animation:ptFloat 1s ease-out forwards; }
            .pt-bubble.pt-plus { color:#16a34a; }
            .pt-bubble.pt-minus { color:#dc2626; }
            .pt-hint { margin:10px 0 0; font-size:13px; color:#64748b; }
            .pt-selbar { position:sticky; bottom:76px; z-index:6; display:flex; flex-wrap:wrap; align-items:center; gap:8px 10px; margin-top:12px; padding:10px 12px; border-radius:14px; background:#1e3a8a; color:#fff; box-shadow:0 10px 24px rgba(30,58,138,.35); }
            .pt-selbar span { flex:1 1 180px; min-width:0; font-size:14px; }
            .pt-selbar b { font-size:17px; }
            .pt-selbar button { min-height:40px; padding:6px 14px; border-radius:999px; border:1px solid rgba(255,255,255,.5); background:transparent; color:#fff; font-size:14px; font-weight:800; cursor:pointer; }
            .pt-selbar .pt-selbar-go { background:#facc15; border-color:#facc15; color:#1e293b; }

            .pt-editor-row { display:grid; grid-template-columns:minmax(0,1fr) auto auto auto auto; align-items:center; gap:6px; margin-bottom:6px; }
            .pt-editor-row input[type="text"] { min-width:0; height:40px; padding:0 10px; font-size:15px; border:1px solid #cbd5e1; border-radius:10px; }
            .pt-editor-row input[type="number"] { width:58px; height:40px; text-align:center; font-size:16px; font-weight:800; border:1px solid #cbd5e1; border-radius:10px; -moz-appearance:textfield; }
            .pt-editor-row input[type="number"]::-webkit-outer-spin-button, .pt-editor-row input[type="number"]::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
            .pt-editor-row button { width:40px; height:40px; border-radius:10px; border:1px solid #cbd5e1; background:#fff; font-size:18px; font-weight:800; cursor:pointer; }
            .pt-editor-row .pt-del { color:#b91c1c; }
            .pt-editor-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
            .pt-editor-actions button { min-height:40px; padding:6px 14px; border-radius:10px; border:1px solid #cbd5e1; background:#fff; font-size:14px; font-weight:700; cursor:pointer; }
            .pt-editor-actions .pt-done { background:#2563eb; border-color:#2563eb; color:#fff; }
            .pt-editor-note { margin:6px 0 0; font-size:12px; color:#64748b; }

            .pt-history { max-height:420px; overflow:auto; }
            .pt-hday { position:sticky; top:0; z-index:1; padding:4px 0; font-size:12px; font-weight:800; color:#2563eb; background:#f8fafc; }
            .pt-hrow { display:grid; grid-template-columns:auto minmax(0,1fr) auto auto; align-items:center; gap:4px 10px; padding:7px 10px; margin-bottom:5px; border-radius:10px; background:#fff; border-left:4px solid #94a3b8; }
            .pt-hrow.pt-plus { border-left-color:#22c55e; }
            .pt-hrow.pt-minus { border-left-color:#ef4444; }
            .pt-htime { font-size:12px; color:#94a3b8; font-variant-numeric:tabular-nums; }
            .pt-hmain { min-width:0; font-size:14px; line-height:1.4; }
            .pt-hmain b { color:#1e293b; }
            .pt-hreason { color:#64748b; margin-left:6px; }
            .pt-hpts { font-size:16px; font-weight:900; font-variant-numeric:tabular-nums; }
            .pt-hpts.pt-plus { color:#16a34a; }
            .pt-hpts.pt-minus { color:#dc2626; }
            .pt-hundo { min-height:32px; padding:2px 10px; border-radius:999px; border:1px solid #cbd5e1; background:#fff; color:#475569; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap; }
            .pt-hundo.pt-confirm { background:#dc2626; border-color:#dc2626; color:#fff; }
            .pt-hrow.pt-undone .pt-hmain, .pt-hrow.pt-undone .pt-hpts { text-decoration:line-through; opacity:.55; }
            .pt-htag { font-size:12px; color:#94a3b8; white-space:nowrap; }
            .pt-hrow.pt-rev { background:#f8fafc; }
            .pt-hreset { padding:6px 10px; margin-bottom:5px; border:1px dashed #94a3b8; border-radius:10px; background:#fff; color:#475569; font-size:13px; font-weight:700; }
            .pt-more { display:block; margin:6px auto 0; }

            .pt-sheet-backdrop { position:fixed; inset:0; z-index:9000; background:rgba(15,23,42,.45); }
            .pt-sheet { position:fixed; left:50%; bottom:0; z-index:9001; width:min(720px,100%); max-height:78vh; overflow:auto; transform:translateX(-50%); padding:16px 16px max(16px,env(safe-area-inset-bottom)); border-radius:20px 20px 0 0; background:#fff; box-shadow:0 -10px 40px rgba(15,23,42,.3); animation:ptSheet .22s ease-out; }
            .pt-sheet-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:10px; }
            .pt-sheet-head strong { font-size:17px; color:#1e293b; }
            .pt-sheet-head p { margin:2px 0 0; font-size:13px; color:#64748b; }
            .pt-sheet-head button { flex:none; width:40px; height:40px; border-radius:999px; border:1px solid #cbd5e1; background:#fff; font-size:18px; cursor:pointer; }

            .pt-toast { position:fixed; left:50%; bottom:24px; transform:translateX(-50%); z-index:100001; max-width:min(560px,92vw); display:flex; align-items:center; gap:14px; padding:11px 16px; border-radius:14px; background:#0f172a; color:#fff; font-size:14px; line-height:1.45; box-shadow:0 10px 30px rgba(0,0,0,.35); }
            .pt-toast button { flex:none; border:0; background:none; color:#93c5fd; font-size:14px; font-weight:800; padding:4px 6px; min-height:32px; cursor:pointer; }
            .pt-sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
            .pt-scope :is(.pt-item,.pt-val,.pt-stu,.pt-link,.pt-tool,.pt-filter button,.pt-hundo,.pt-armed button,.pt-selbar button):focus-visible, .pt-sheet :is(button,input):focus-visible { outline:3px solid #93c5fd; outline-offset:2px; }
            @keyframes ptBump { 0% { transform:scale(1); } 40% { transform:scale(1.35); } 100% { transform:scale(1); } }
            @keyframes ptFloat { from { opacity:1; transform:translate(-50%,0); } to { opacity:0; transform:translate(-50%,-34px); } }
            @keyframes ptSheet { from { transform:translate(-50%,40px); opacity:0; } to { transform:translate(-50%,0); opacity:1; } }
            @media (prefers-reduced-motion: reduce) { .pt-bump, .pt-bubble, .pt-sheet { animation:none !important; } }

            @media (min-width: 1024px) {
                .pt-layout { display:grid; grid-template-columns:minmax(300px,5fr) minmax(0,7fr); align-items:start; }
                .pt-items { grid-column:1; grid-row:1; position:sticky; top:var(--pt-top,84px); max-height:calc(100vh - var(--pt-top,84px) - 16px); overflow:auto; }
                .pt-students { grid-column:2; grid-row:1; }
            }
            @media (max-width: 480px) {
                .pt-grid { grid-template-columns:repeat(auto-fill,minmax(92px,1fr)); }
                .pt-item-grid { grid-template-columns:1fr 1fr; }
                .pt-tools { width:100%; }
                .pt-tool { flex:1 1 auto; }
                .pt-hrow { grid-template-columns:auto minmax(0,1fr) auto; }
                .pt-hrow .pt-hundo, .pt-hrow .pt-htag { grid-column:2 / -1; justify-self:end; }
            }

            .dark .pt-howto, .dark .pt-hint, .dark .pt-sub, .dark .pt-count, .dark .pt-editor-note { color:#cbd5e1; }
            .dark .pt-card { background:#1e293b; border-color:#334155; }
            .dark .pt-card-head h3 { color:#f1f5f9; }
            .dark .pt-link { color:#93c5fd; }
            .dark .pt-tool, .dark .pt-filter button, .dark .pt-custom-row .pt-step, .dark .pt-editor-row button, .dark .pt-editor-actions button, .dark .pt-hundo { background:#0f172a; border-color:#475569; color:#e2e8f0; }
            .dark .pt-tool-danger { color:#fca5a5; border-color:#7f1d1d; }
            .dark .pt-item, .dark .pt-val { background:#0f172a; }
            .dark .pt-item-name { color:#f1f5f9; }
            .dark .pt-val.pt-plus { color:#86efac; }
            .dark .pt-val.pt-minus { color:#fca5a5; }
            .dark .pt-item[aria-pressed="true"], .dark .pt-val[aria-pressed="true"] { background:#422006; }
            .dark .pt-stu { background:#0f172a; border-color:#334155; color:#f1f5f9; }
            .dark .pt-stu-score { color:#4ade80; }
            .dark .pt-stu-score.pt-neg { color:#f87171; }
            .dark .pt-stu-today { color:#94a3b8; }
            .dark .pt-stu[aria-pressed="true"] { background:#1e3a8a; border-color:#60a5fa; }
            .dark .pt-stu.pt-hit-plus { background:#14532d; }
            .dark .pt-stu.pt-hit-minus { background:#7f1d1d; }
            .dark .pt-armed { background:#422006; color:#fde68a; }
            .dark .pt-armed button { background:#1e293b; color:#fde68a; }
            .dark .pt-hday { background:#1e293b; color:#93c5fd; }
            .dark .pt-hrow, .dark .pt-hreset { background:#0f172a; }
            .dark .pt-hmain b { color:#f1f5f9; }
            .dark .pt-hreason { color:#94a3b8; }
            .dark .pt-hrow.pt-rev { background:#111827; }
            .dark .pt-sheet { background:#1e293b; }
            .dark .pt-scope .pet-nav { background:#1e1b4b; color:#c7d2fe; border-color:#4338ca; }
            .dark .pt-sheet-head strong { color:#f1f5f9; }
            .dark .pt-sheet-head button { background:#0f172a; border-color:#475569; color:#e2e8f0; }
        `;
        document.head.append(style);
    }

    // ---------- 加扣分項目（存在這台電腦） ----------
    const validItem = x => x && typeof x.reason === 'string' && x.reason.trim() && Number.isInteger(Number(x.points)) && Number(x.points) !== 0;
    const normItem = x => ({ reason: String(x.reason).trim().slice(0, 20), points: Math.max(-100, Math.min(100, Number(x.points))) });
    function loadItems() {
        if (items) return items;
        try {
            const raw = JSON.parse(localStorage.getItem(ITEMS_KEY) || 'null');
            if (Array.isArray(raw)) items = raw.filter(validItem).map(normItem);
        } catch (e) { items = null; }
        if (!items || !items.length) items = DEFAULT_ITEMS.map(x => ({ ...x }));
        return items;
    }
    function saveItems() {
        try { localStorage.setItem(ITEMS_KEY, JSON.stringify(items)); } catch (e) { /* 只是常用項目 */ }
    }

    function itemButton(item, context) {
        const b = btn('pt-item ' + (item.points > 0 ? 'pt-plus' : 'pt-minus'), null, () => onItem(item, context));
        b.append(el('span', 'pt-item-name', item.reason), el('span', 'pt-item-pts', fmtPts(item.points)));
        b.setAttribute('aria-pressed', String(context === 'panel' && sameItem(state.armed, item)));
        b.setAttribute('aria-label', `${item.reason} ${fmtPts(item.points)} 分`);
        return b;
    }
    function renderItemsInto(box, context) {
        if (!box) return;
        box.replaceChildren();
        const list = loadItems();
        [['加分', list.filter(i => i.points > 0)], ['扣分', list.filter(i => i.points < 0)]].forEach(([title, group]) => {
            if (!group.length) return;
            const grid = el('div', 'pt-item-grid');
            group.forEach(i => grid.append(itemButton(i, context)));
            box.append(el('div', 'pt-sub', title), grid);
        });
    }
    function quickItem(v) {
        return { points: v, reason: v > 0 ? '快速加分' : '快速扣分' };
    }
    function renderValuesInto(box, context) {
        if (!box) return;
        box.replaceChildren(...VALUES.map(v => {
            const b = btn('pt-val ' + (v > 0 ? 'pt-plus' : 'pt-minus'), fmtPts(v), () => onItem(quickItem(v), context), `${v > 0 ? '加' : '扣'} ${Math.abs(v)} 分`);
            b.setAttribute('aria-pressed', String(context === 'panel' && sameItem(state.armed, quickItem(v))));
            return b;
        }));
    }
    function customRow(context) {
        const wrap = el('div', 'pt-custom');
        wrap.append(el('div', 'pt-sub', '自訂分數與原因'));
        const row = el('div', 'pt-custom-row');
        const input = el('input');
        input.type = 'number';
        input.inputMode = 'numeric';
        input.value = state.custom.points;
        input.setAttribute('aria-label', '自訂分數（負數是扣分）');
        const step = d => {
            let v = parseInt(input.value, 10);
            if (!Number.isFinite(v)) v = 0;
            v += d;
            if (v === 0) v += d;
            input.value = Math.max(-100, Math.min(100, v));
            input.classList.remove('pt-bad');
        };
        const reason = el('input');
        reason.type = 'text';
        reason.maxLength = 40;
        reason.placeholder = '原因（選填）';
        reason.value = state.custom.reason;
        reason.setAttribute('aria-label', '自訂原因');
        const go = btn('pt-go', context === 'sheet' ? '給分' : '套用', () => {
            const v = parseInt(input.value, 10);
            if (!Number.isInteger(v) || v === 0 || Math.abs(v) > 100) {
                input.classList.add('pt-bad');
                input.focus();
                toast('分數請填 -100 到 100、不是 0 的整數');
                return;
            }
            state.custom = { points: v, reason: reason.value.trim() };
            onItem({ points: v, reason: reason.value.trim().slice(0, 40) || '自訂加扣分' }, context);
        });
        [input, reason].forEach(x => x.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go.click(); } }));
        input.addEventListener('input', () => input.classList.remove('pt-bad'));
        row.append(btn('pt-step', '−', () => step(-1), '分數減 1'), input, btn('pt-step', '＋', () => step(1), '分數加 1'), reason, go);
        wrap.append(row);
        return wrap;
    }
    function renderPanel() {
        injectStyles();
        const editing = state.editing;
        const itemsBox = $('quickPointsActions'), valuesBox = $('quickPointsBar'), customBox = $('ptCustomBox'), editor = $('ptEditor');
        [itemsBox, valuesBox, customBox].forEach(x => { if (x) x.hidden = editing; });
        const sub = valuesBox?.previousElementSibling;
        if (sub && sub.classList.contains('pt-sub')) sub.hidden = editing;
        if (editor) editor.hidden = !editing;
        const editBtn = $('ptEditBtn');
        if (editBtn) editBtn.textContent = editing ? '✓ 完成編輯' : '✏️ 編輯項目';
        if (editing) { renderEditor(); return; }
        renderItemsInto(itemsBox, 'panel');
        renderValuesInto(valuesBox, 'panel');
        if (customBox) customBox.replaceChildren(customRow('panel'));
    }
    function syncPressed() {
        $('quickPointsActions')?.querySelectorAll('.pt-item').forEach(b => {
            const [name, pts] = [b.querySelector('.pt-item-name')?.textContent, Number(b.querySelector('.pt-item-pts')?.textContent)];
            b.setAttribute('aria-pressed', String(!!state.armed && state.armed.reason === name && state.armed.points === pts));
        });
        $('quickPointsBar')?.querySelectorAll('.pt-val').forEach(b => {
            b.setAttribute('aria-pressed', String(sameItem(state.armed, quickItem(Number(b.textContent)))));
        });
    }

    // ---------- 編輯常用項目 ----------
    function renderEditor() {
        const box = $('ptEditor');
        if (!box) return;
        box.replaceChildren();
        const list = loadItems();
        list.forEach((item, i) => {
            const row = el('div', 'pt-editor-row');
            const name = el('input');
            name.type = 'text';
            name.maxLength = 20;
            name.value = item.reason;
            name.setAttribute('aria-label', `第 ${i + 1} 個項目名稱`);
            name.addEventListener('input', () => {
                const v = name.value.trim();
                name.classList.toggle('pt-bad', !v);
                if (v) { item.reason = v; saveItems(); }
            });
            const pts = el('input');
            pts.type = 'number';
            pts.value = item.points;
            pts.setAttribute('aria-label', `第 ${i + 1} 個項目分數`);
            const setPts = v => {
                if (!Number.isInteger(v) || v === 0 || Math.abs(v) > 100) { pts.classList.add('pt-bad'); return; }
                pts.classList.remove('pt-bad');
                item.points = v;
                pts.value = v;
                saveItems();
            };
            pts.addEventListener('input', () => setPts(parseInt(pts.value, 10)));
            const stepBy = d => { let v = item.points + d; if (v === 0) v += d; setPts(Math.max(-100, Math.min(100, v))); };
            row.append(name,
                btn('', '−', () => stepBy(-1), `${item.reason} 減 1`), pts, btn('', '＋', () => stepBy(1), `${item.reason} 加 1`),
                btn('pt-del', '🗑', () => {
                    if (loadItems().length <= 1) { toast('至少要留一個項目'); return; }
                    const removed = list.splice(i, 1)[0];
                    saveItems();
                    renderEditor();
                    toast(`已刪除「${removed.reason}」`, { label: '復原', onClick: () => { list.splice(Math.min(i, list.length), 0, removed); saveItems(); renderPanel(); } });
                }, `刪除 ${item.reason}`));
            box.append(row);
        });
        const actions = el('div', 'pt-editor-actions');
        actions.append(
            btn('', '＋ 加分項目', () => { list.push({ reason: '新的加分', points: 1 }); saveItems(); renderEditor(); focusLastEditor(); }),
            btn('', '＋ 扣分項目', () => { list.push({ reason: '新的扣分', points: -1 }); saveItems(); renderEditor(); focusLastEditor(); }),
            btn('', '恢復預設', () => {
                const before = list.map(x => ({ ...x }));
                items = DEFAULT_ITEMS.map(x => ({ ...x }));
                saveItems();
                renderEditor();
                toast('已恢復預設項目', { label: '復原', onClick: () => { items = before; saveItems(); renderPanel(); } });
            }),
            btn('pt-done', '完成', () => { state.editing = false; renderPanel(); $('ptEditBtn')?.focus(); })
        );
        box.append(actions, el('p', 'pt-editor-note', '項目名稱最多 20 字；分數 -100～100（負數是扣分）。常用項目存在這台電腦，換電腦要再設定一次。'));
    }
    function focusLastEditor() {
        const inputs = $('ptEditor')?.querySelectorAll('.pt-editor-row input[type="text"]');
        const last = inputs && inputs[inputs.length - 1];
        if (last) { last.focus(); last.select(); }
    }

    // ---------- 給分 ----------
    function onItem(item, context) {
        if (!getStudents().length) { toast('請先到「學生管理」新增學生'); return; }
        if (state.selected.size) {
            const ids = [...state.selected];
            state.selected.clear();
            closeSheet();
            renderGrid();
            apply(ids, item);
            return;
        }
        if (context === 'sheet') { closeSheet(); return; }
        // 沒有選學生：進入「連續給分」，之後點誰就給誰（再按一次同一項目＝結束）
        if (sameItem(state.armed, item)) { disarm(); return; }
        state.armed = { points: item.points, reason: item.reason };
        renderArmed();
        syncPressed();
        if (isNarrow()) {
            const card = $('ptStudentsCard');
            const r = card?.getBoundingClientRect();
            if (r && (r.top < 0 || r.top > window.innerHeight * 0.5)) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
    function disarm() {
        state.armed = null;
        renderArmed();
        syncPressed();
    }
    function onStudent(key) {
        if (state.armed) { apply([key], state.armed); return; }
        if (state.selected.has(key)) state.selected.delete(key); else state.selected.add(key);
        const card = $('pointsStudentList')?.querySelector(`.pt-stu[data-id="${CSS.escape(key)}"]`);
        if (card) card.setAttribute('aria-pressed', String(state.selected.has(key)));
        updateSelectionUI();
    }
    function apply(keys, item) {
        const points = Number(item.points);
        const reason = String(item.reason || '自訂加扣分').slice(0, 80);
        if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 1000) { toast('分數不正確'); return Promise.resolve(false); }
        return enqueue(async () => {
            const roster = getStudents();
            const targets = keys.map(k => roster.find(s => String(s.id) === String(k))).filter(Boolean);
            if (!targets.length) { toast('找不到這些學生，名單可能已更新'); return false; }
            const ids = targets.map(s => s.id);
            let ok = false;
            let recordIds = [];
            if (window.ClassPets && typeof ClassPets.award === 'function') {
                const batch = newBatchId();
                try {
                    ClassPets.prepare?.();
                    ok = !!(await ClassPets.award(ids, points, reason, undefined, batch));
                } catch (e) {
                    console.error('[Points] 給分失敗:', e);
                }
                if (ok) recordIds = getHistory().filter(r => r && r.petBatch === batch).map(r => r.id);
            } else if (typeof window.addPointsToStudent === 'function') {
                for (const id of ids) {
                    const before = getHistory().length;
                    try {
                        const r = window.addPointsToStudent(id, points, reason);
                        const done = r && typeof r.then === 'function' ? await r : getHistory().length > before;
                        ok = ok || !!done;
                    } catch (e) { console.error('[Points] 給分失敗:', e); }
                }
            }
            if (!ok) return false;
            play(points > 0 ? 'playAddScoreSound' : 'playSubtractScoreSound');
            if (!$('pointsStudentList')?.querySelector(`.pt-stu[data-id="${CSS.escape(String(ids[0]))}"] .pt-stu-score`)) renderGrid();
            flashCards(ids.map(String), points);
            const who = targets.length === 1 ? targets[0].name : `${targets.length} 人`;
            const msg = `${points > 0 ? '✅' : '⚠️'} ${who}　${reason} ${fmtPts(points)}`;
            announce(`${who} ${reason} ${fmtPts(points)} 分，已存本機`);
            if (recordIds.length && window.ClassPets?.undo) {
                toast(msg, { label: '撤銷', onClick: () => undoRecords(recordIds, `${who} ${reason} ${fmtPts(points)}`) }, UNDO_MS);
            } else {
                toast(msg);
            }
            return true;
        });
    }
    function undoRecords(ids, label) {
        return enqueue(async () => {
            if (!window.ClassPets?.undo) return false;
            let ok = false;
            try {
                ClassPets.prepare?.();
                ok = !!(await ClassPets.undo(ids));
            } catch (e) { console.error('[Points] 撤銷失敗:', e); }
            if (ok) {
                renderGrid();
                toast(`↩️ 已撤銷：${label}`);
                announce(`已撤銷 ${label}`);
            }
            return ok;
        });
    }
    function flashCards(keys, points) {
        const grid = $('pointsStudentList');
        if (!grid) return;
        keys.forEach(key => {
            const card = grid.querySelector(`.pt-stu[data-id="${CSS.escape(key)}"]`);
            if (!card) return;
            card.classList.add(points > 0 ? 'pt-hit-plus' : 'pt-hit-minus');
            card.querySelector('.pt-stu-score')?.classList.add('pt-bump');
            const bubble = el('span', 'pt-bubble ' + (points > 0 ? 'pt-plus' : 'pt-minus'), fmtPts(points));
            card.append(bubble);
            setTimeout(() => { bubble.remove(); card.classList.remove('pt-hit-plus', 'pt-hit-minus'); }, 1000);
        });
    }

    // ---------- 學生區 ----------
    function todayDeltas() {
        const hist = getHistory();
        const from = Math.max(startOfToday(), Number(window.PointsReset?.lastResetId?.(hist)) || 0);
        const map = new Map();
        for (const r of hist) {
            if (!r || r.type === 'reset' || r.petShopType) continue;
            const t = recordTime(r);
            if (t == null || t < from) continue;
            const k = String(r.studentId);
            map.set(k, (map.get(k) || 0) + (Number(r.points) || 0));
        }
        return map;
    }
    function renderFilter() {
        const box = $('ptGroupFilter');
        if (!box) return null;
        const gs = getGroups().filter(g => g && Array.isArray(g.members) && g.members.length);
        if (!gs.length) { box.hidden = true; state.filter = 'all'; return null; }
        if (state.filter !== 'all' && !gs.some(g => String(g.id) === state.filter)) state.filter = 'all';
        box.hidden = false;
        const chip = (key, label) => {
            const b = btn('', label, () => { state.filter = key; renderGrid(); });
            b.setAttribute('aria-pressed', String(state.filter === key));
            return b;
        };
        box.replaceChildren(chip('all', '全班'), ...gs.map((g, i) => chip(String(g.id), `${g.name || `第 ${i + 1} 組`}（${g.members.length}）`)));
        const g = gs.find(x => String(x.id) === state.filter);
        return g ? new Set(g.members.map(m => String(m.id))) : null;
    }
    function visibleStudents() {
        const only = renderFilter();
        return getStudents().map((s, i) => ({ s, i }))
            .sort((a, b) => (seatSort(a.s) - seatSort(b.s)) || (a.i - b.i)).map(x => x.s)
            .filter(s => !only || only.has(String(s.id)));
    }
    function renderGrid() {
        injectStyles();
        const box = $('pointsStudentList');
        if (!box) return;
        const roster = getStudents();
        const keys = new Set(roster.map(s => String(s.id)));
        [...state.selected].forEach(k => { if (!keys.has(k)) state.selected.delete(k); });
        const focusKey = document.activeElement && box.contains(document.activeElement) ? document.activeElement.dataset.id : null;
        box.replaceChildren();
        if (!roster.length) {
            const empty = el('div', 'text-center text-gray-500 py-6');
            empty.style.gridColumn = '1 / -1';
            empty.append(el('p', '', '還沒有學生名單，先到「學生管理」新增學生。'));
            const go = btn('pt-link', '前往學生管理 →', () => window.showSection?.('students'));
            empty.append(go);
            box.append(empty);
            $('ptGroupFilter') && ($('ptGroupFilter').hidden = true);
            updateSelectionUI();
            return;
        }
        const absent = absentSet();
        const today = todayDeltas();
        visibleStudents().forEach(s => {
            const key = String(s.id);
            const card = btn('pt-stu', null, () => onStudent(key));
            card.dataset.id = key;
            card.setAttribute('aria-pressed', String(state.selected.has(key)));
            const pts = Number(s.points) || 0;
            const delta = today.get(key) || 0;
            const isAbsent = absent.has(key);
            if (isAbsent) card.classList.add('pt-absent');
            const score = el('span', 'pt-stu-score' + (pts < 0 ? ' pt-neg' : ''), String(pts));
            if (seatText(s)) card.append(el('span', 'pt-stu-seat', seatText(s)));
            if (isAbsent) card.append(el('span', 'pt-stu-tag', '請假'));
            card.append(el('span', 'pt-stu-name', s.name), score, el('span', 'pt-stu-today', delta ? `今天 ${fmtPts(delta)}` : ''));
            card.setAttribute('aria-label', `${seatText(s) ? seatText(s) + ' 號 ' : ''}${s.name}，目前 ${pts} 分${delta ? `，今天 ${fmtPts(delta)}` : ''}${isAbsent ? '，今天請假' : ''}`);
            box.append(card);
        });
        if (focusKey) [...box.children].find(c => c.dataset.id === focusKey)?.focus({ preventScroll: true });
        updateSelectionUI();
    }
    function renderArmed() {
        const box = $('ptArmed');
        const section = $('points-section');
        if (section) section.classList.toggle('pt-is-armed', !!state.armed);
        if (!box) return;
        box.replaceChildren();
        box.hidden = !state.armed;
        if (state.armed) {
            const text = el('span');
            text.append('🎯 連續給分：', el('b', '', `${state.armed.reason} ${fmtPts(state.armed.points)}`), '　點學生就給分');
            box.append(text, btn('', '結束', disarm));
        }
        updateSelectionUI();
    }
    function updateSelectionUI() {
        const n = state.selected.size;
        const all = $('ptSelectAll');
        if (all) all.hidden = !!state.armed || !getStudents().length;
        if (all) all.textContent = n ? '✕ 清除選取' : '☑ 全選';
        const hint = $('ptHint');
        if (hint) hint.hidden = !!state.armed || n > 0 || !getStudents().length;
        updateHintText();
        const bar = $('ptSelBar');
        if (!bar) return;
        bar.replaceChildren();
        bar.hidden = !n || !!state.armed;
        if (!n || state.armed) return;
        const names = [...state.selected].map(k => getStudents().find(s => String(s.id) === k)?.name).filter(Boolean);
        const info = el('span');
        info.append('已選 ', el('b', '', String(n)), ' 人：' + names.slice(0, 4).join('、') + (names.length > 4 ? '…' : ''));
        bar.append(info, btn('', '清除', clearSelection), btn('pt-selbar-go', '選項目給分 ▲', openSheet));
    }
    function updateHintText() {
        const hint = $('ptHint');
        if (!hint) return;
        const text = isNarrow()
            ? '點學生可以複選，選好後按下方藍色列的「選項目給分」。也可以先按下方的項目，再一位一位點學生。'
            : '點學生可以複選，選好後按左邊的項目就會一起給分；也可以先按項目，再一位一位點學生。';
        if (hint.textContent !== text) hint.textContent = text;
    }
    function clearSelection() {
        state.selected.clear();
        renderGrid();
    }
    function selectAllOrClear() {
        if (state.selected.size) { clearSelection(); return; }
        const absent = absentSet();
        const visible = visibleStudents().filter(s => !absent.has(String(s.id)));
        visible.forEach(s => state.selected.add(String(s.id)));
        renderGrid();
        const skipped = visibleStudents().length - visible.length;
        if (skipped) toast(`已選 ${visible.length} 人（今天請假的 ${skipped} 人沒有選，需要的話可以再點）`);
    }

    // ---------- 選項目的底部面板 ----------
    function openSheet() {
        if (!state.selected.size) return;
        closeSheet(false);
        const opener = document.activeElement;
        const backdrop = el('div', 'pt-sheet-backdrop');
        backdrop.addEventListener('click', () => closeSheet());
        const sheet = el('div', 'pt-sheet');
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        sheet.setAttribute('aria-label', '選擇加扣分項目');
        const names = [...state.selected].map(k => getStudents().find(s => String(s.id) === k)?.name).filter(Boolean);
        const head = el('div', 'pt-sheet-head');
        const title = el('div');
        title.append(el('strong', '', `給 ${names.length} 人加扣分`), el('p', '', names.slice(0, 8).join('、') + (names.length > 8 ? `…等 ${names.length} 人` : '')));
        head.append(title, btn('', '✕', () => closeSheet(), '關閉'));
        const itemsBox = el('div');
        renderItemsInto(itemsBox, 'sheet');
        const valuesBox = el('div', 'pt-values');
        renderValuesInto(valuesBox, 'sheet');
        sheet.append(head, itemsBox, el('div', 'pt-sub', '只調分數'), valuesBox, customRow('sheet'));
        document.body.append(backdrop, sheet);
        state.sheet = { backdrop, sheet, opener };
        sheet.querySelector('.pt-item, .pt-val')?.focus();
    }
    function closeSheet(restoreFocus = true) {
        if (!state.sheet) return;
        const { backdrop, sheet, opener } = state.sheet;
        state.sheet = null;
        backdrop.remove();
        sheet.remove();
        if (restoreFocus && opener && opener.isConnected) opener.focus({ preventScroll: true });
    }

    // ---------- 紀錄 ----------
    function dayLabel(t) {
        if (t == null) return '更早';
        const d = new Date(t);
        const diff = Math.round((startOfToday() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
        if (diff === 0) return '今天';
        if (diff === 1) return '昨天';
        return `${d.getMonth() + 1}/${d.getDate()}（${'日一二三四五六'[d.getDay()]}）`;
    }
    const hhmm = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    function undoButton(ids, label) {
        const b = btn('pt-hundo', '撤銷');
        let armedAt = 0, timer = null;
        b.addEventListener('click', () => {
            if (Date.now() - armedAt < 4000) {
                clearTimeout(timer);
                b.disabled = true;
                b.textContent = '撤銷中…';
                undoRecords(ids, label).then(ok => { if (!ok && b.isConnected) { b.disabled = false; b.textContent = '撤銷'; b.classList.remove('pt-confirm'); } });
                return;
            }
            armedAt = Date.now();
            b.textContent = '確定撤銷？';
            b.classList.add('pt-confirm');
            timer = setTimeout(() => { armedAt = 0; if (b.isConnected) { b.textContent = '撤銷'; b.classList.remove('pt-confirm'); } }, 4000);
        });
        return b;
    }
    function renderHistory() {
        injectStyles();
        const box = $('pointsHistory');
        if (!box) return;
        const hist = getHistory();
        const count = $('ptHistoryCount');
        if (count) count.textContent = hist.length ? `共 ${hist.length} 筆` : '';
        box.replaceChildren();
        const more = $('ptHistoryMore');
        if (!hist.length) {
            box.append(el('div', 'text-gray-500 text-center text-sm py-3', '還沒有加扣分紀錄'));
            if (more) more.hidden = true;
            return;
        }
        const reversed = new Set(hist.filter(r => r && r.petReverses).map(r => String(r.petReverses)));
        const canUndo = !!(window.ClassPets && typeof ClassPets.undo === 'function');
        const rows = [];
        for (const r of hist) {
            if (!r) continue;
            const last = rows[rows.length - 1];
            if (r.petBatch && last && last.batch === r.petBatch && r.type !== 'reset' && last.reason === r.reason && last.points === r.points) {
                last.records.push(r);
                continue;
            }
            if (rows.length >= state.historyLimit) { rows.overflow = true; break; }
            rows.push({ batch: r.petBatch || null, reason: r.reason, points: r.points, records: [r] });
        }
        let lastDay = null;
        rows.forEach(row => {
            const first = row.records[0];
            const t = recordTime(first);
            const day = dayLabel(t);
            if (day !== lastDay) { box.append(el('div', 'pt-hday', day)); lastDay = day; }
            if (first.type === 'reset') {
                box.append(el('div', 'pt-hreset', `🔄 分數歸零（之前的紀錄仍保留）${t != null ? '　' + hhmm(t) : ''}`));
                return;
            }
            const pts = Number(row.points) || 0;
            const line = el('div', 'pt-hrow' + (pts > 0 ? ' pt-plus' : pts < 0 ? ' pt-minus' : ''));
            const roster = getStudents();
            const names = row.records.map(r => ({ name: r.studentName || '?', seat: seatSort(roster.find(s => sameId(s.id, r.studentId))) }))
                .sort((x, y) => x.seat - y.seat).map(x => x.name);
            const main = el('div', 'pt-hmain');
            const isRev = !!first.petReverses;
            if (isRev) line.classList.add('pt-rev');
            main.append(el('b', '', (isRev ? '↩️ ' : first.petShopType ? '🛒 ' : '') + names.slice(0, 5).join('、') + (names.length > 5 ? `…等 ${names.length} 人` : '')),
                el('span', 'pt-hreason', row.reason || ''));
            const ptsEl = el('span', 'pt-hpts' + (pts > 0 ? ' pt-plus' : pts < 0 ? ' pt-minus' : ''), pts ? fmtPts(pts) : (first.coinDelta ? `${fmtPts(first.coinDelta)} 金幣` : '—'));
            line.append(el('span', 'pt-htime', t != null ? hhmm(t) : ''), main, ptsEl);
            const undoable = row.records.filter(r => r.petEvent && !r.petReverses && !r.petShopType && !reversed.has(String(r.id)));
            const allUndone = !isRev && row.records.every(r => reversed.has(String(r.id)));
            if (allUndone) {
                line.classList.add('pt-undone');
                line.append(el('span', 'pt-htag', '已撤銷'));
            } else if (canUndo && undoable.length) {
                line.append(undoButton(undoable.map(r => r.id), `${names.length > 1 ? names.length + ' 人' : names[0]} ${row.reason || ''} ${fmtPts(pts)}`));
            } else {
                line.append(el('span'));
            }
            box.append(line);
        });
        if (more) more.hidden = !rows.overflow;
    }

    // ---------- 提示（可帶「撤銷」按鈕） ----------
    function toast(message, action, duration = 3500) {
        let box = $('ptToast');
        if (!box) {
            box = el('div', 'pt-toast');
            box.id = 'ptToast';
            box.setAttribute('role', 'status');
            box.setAttribute('aria-live', 'polite');
            document.body.append(box);
        }
        box.replaceChildren(el('span', '', message));
        if (action) box.append(btn('', action.label, () => { hideToast(); action.onClick(); }));
        clearTimeout(toastTimer);
        toastTimer = setTimeout(hideToast, duration);
    }
    function hideToast() {
        clearTimeout(toastTimer);
        $('ptToast')?.remove();
    }
    function announce(text) {
        const sr = $('ptAnnounce');
        if (sr) sr.textContent = text;
    }

    // ---------- 初始化 ----------
    function init() {
        injectStyles();
        const section = $('points-section');
        if (!section) return;
        if (!$('ptAnnounce')) {
            const sr = el('div', 'pt-sr');
            sr.id = 'ptAnnounce';
            sr.setAttribute('role', 'status');
            sr.setAttribute('aria-live', 'polite');
            section.append(sr);
        }
        $('ptSelectAll')?.addEventListener('click', selectAllOrClear);
        $('ptEditBtn')?.addEventListener('click', () => { state.editing = !state.editing; if (state.editing) disarm(); renderPanel(); });
        $('ptHistoryMore')?.addEventListener('click', () => { state.historyLimit += HISTORY_STEP; renderHistory(); });
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;
            if (state.sheet) { closeSheet(); return; }
            if (state.armed && !section.classList.contains('hidden')) disarm();
        });
        window.addEventListener('todayattendancechange', () => { if (!section.classList.contains('hidden')) renderGrid(); });
        const syncTop = () => {
            const header = $('app-header');
            section.style.setProperty('--pt-top', ((header ? header.offsetHeight : 76) + 8) + 'px');
        };
        syncTop();
        // 手機捲動時網址列伸縮也會觸發 resize：只更新提示文字，不重建選取列（避免點到一半按鈕被換掉）
        window.addEventListener('resize', () => { syncTop(); updateHintText(); });
        // 離開加扣分頁就結束連續給分、清掉選取，回來時重新整理名單
        new MutationObserver(() => {
            if (section.classList.contains('hidden')) {
                if (state.armed) disarm();
                if (state.selected.size) state.selected.clear();
                closeSheet(false);
            } else {
                renderGrid();
                renderHistory();
            }
        }).observe(section, { attributes: true, attributeFilter: ['class'] });
        renderPanel();
        renderArmed();
        renderGrid();
        renderHistory();
        console.log('⭐ 加扣分增強模組已載入');
    }

    // 覆蓋既有的全域函式（初始化、寵物模組存檔後的重畫、雲端還原都會呼叫）
    window.renderPointsStudentList = () => renderGrid();
    // 分數歸零、還原等流程只會呼叫 renderPointsHistory；學生卡片上的分數也要一起更新
    window.renderPointsHistory = () => { renderHistory(); renderGrid(); };
    window.renderQuickPointsButtons = () => renderPanel();
    window.renderQuickPointsBar = () => {};
    window.updatePointsStudentSelect = () => {};
    window.selectQuickPointsValue = v => onItem(quickItem(Number(v)), 'panel');
    window.selectQuickAction = a => a && onItem({ points: Number(a.points), reason: String(a.reason || '') }, 'panel');
    window.finishBatchPoints = () => { disarm(); clearSelection(); };
    window.applyPointsToStudentFromList = id => onStudent(String(id));
    window.addCustomPoints = () => $('ptCustomBox')?.querySelector('input')?.focus();
    window.PointsUI = { apply: (ids, points, reason) => apply(ids.map(String), { points, reason }), undo: undoRecords, refresh: () => { renderGrid(); renderHistory(); } };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
