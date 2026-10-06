/**
 * 隨機分組增強模組 v2
 *
 * 設定：分段切換（依組數／依每組人數）、加減按鈕與快速晶片、照實際分配方式計算的預覽、
 *       「今天誰參加」（請假同學不分組，當天記住）、記住上次設定、動畫開關。
 * 結果：彩色卡片＋名字膠囊（不再擠在 3 行小框裡捲動）、點組名直接改名、點名字設組長／抽組長、
 *       加減分即時跳動、重新分組可「復原」、投影顯示（字體自動放到最大）、複製結果、匯出 Excel。
 * 手動編輯：沿用草稿＋明確儲存；原本就沒分到組的同學（例如請假）可以維持未分組。
 */

(function () {
    'use strict';

    // 與舊版 10 色相近的色相（紅、橙、黃、綠、青、藍、靛、紫、粉、水藍）
    const HUES = [0, 28, 45, 140, 175, 215, 240, 275, 330, 190];
    const EMOJIS = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '💜', '💖', '💙', '💚'];
    const QUICK = { byGroupCount: [2, 3, 4, 5, 6, 7, 8], byMemberCount: [2, 3, 4, 5, 6, 8] };
    const DEFAULTS = { byGroupCount: 4, byMemberCount: 4 };
    const LABELS = { byGroupCount: '要分成幾組？', byMemberCount: '每組要有幾人？' };
    const PREFS_KEY = 'groupingPrefs';
    const UNDO_MS = 8000;

    const state = { method: 'byGroupCount', anim: true, busy: false, skip: false, leaderBusy: false };
    const memo = { byGroupCount: DEFAULTS.byGroupCount, byMemberCount: DEFAULTS.byMemberCount };
    let absent = new Set();
    let undoCtx = null;
    let toastTimer = null;
    let proj = null;          // { root, grid, opener }
    const scoreMemo = { main: new Map(), proj: new Map() };

    // ---------- 小工具 ----------
    const $ = id => document.getElementById(id);
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const getStudents = () => (typeof students !== 'undefined' && Array.isArray(students)) ? students : [];
    const getGroups = () => (typeof groups !== 'undefined' && Array.isArray(groups)) ? groups : [];
    const setGroups = next => { groups = next; };
    const gKey = () => window.GROUPS_KEY || 'groups';
    const classId = () => localStorage.getItem('currentClassId') || 'default';
    const className = () => {
        try { return (window.ClassProfiles && ClassProfiles.currentProfile && ClassProfiles.currentProfile()?.name) || ''; }
        catch (e) { return ''; }
    };
    const reduceMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const sameId = (a, b) => a != null && b != null && String(a) === String(b);
    const seatText = s => String(s?.number ?? s?.seatNumber ?? '').trim();
    const seatSort = s => { const n = Number(seatText(s)); return seatText(s) && Number.isFinite(n) ? n : Infinity; };
    const hueFor = i => (HUES[i % HUES.length] + 12 * Math.floor(i / HUES.length)) % 360;
    const todayStamp = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

    function el(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text != null) node.textContent = text;
        return node;
    }
    function shuffle(list) {
        const a = list.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }
    function play(fnName) {
        try { if (typeof window[fnName] === 'function') window[fnName](); } catch (e) { /* 音效失敗不影響操作 */ }
    }
    function persist(context, rollback) {
        try {
            if (window.SafeStorage) return !!SafeStorage.set(gKey(), JSON.stringify(getGroups()), { context, rollback });
            localStorage.setItem(gKey(), JSON.stringify(getGroups()));
            return true;
        } catch (e) {
            if (typeof rollback === 'function') rollback();
            return false;
        }
    }

    // ---------- 樣式 ----------
    function injectStyles() {
        if ($('grouping-v2-styles')) return;
        const style = document.createElement('style');
        style.id = 'grouping-v2-styles';
        style.textContent = `
            .gp-scope [hidden], .gp-proj [hidden], .gp-toast [hidden] { display:none !important; }
            .gp-roster { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 10px; font-size:13px; color:#64748b; }
            .gp-roster b { font-size:17px; color:#0e7490; }
            .gp-seg { display:grid; grid-template-columns:1fr 1fr; gap:4px; padding:4px; background:#e2e8f0; border-radius:12px; }
            .gp-seg button { border:0; background:transparent; border-radius:9px; padding:9px 6px; font-size:14px; font-weight:700; color:#475569; cursor:pointer; touch-action:manipulation; transition:background .15s,color .15s,box-shadow .15s; }
            .gp-seg button[aria-checked="true"] { background:#06b6d4; color:#fff; box-shadow:0 1px 4px rgba(8,145,178,.35); }
            .gp-seg button:focus-visible, .gp-stepper button:focus-visible, .gp-quick button:focus-visible, .gp-tbtn:focus-visible, .gp-chip:focus-visible, .gp-name:focus-visible, .gp-step:focus-visible, .gp-stu:focus-visible, .gp-link:focus-visible, .gp-leader-btn:focus-visible { outline:3px solid #67e8f9; outline-offset:2px; }
            .gp-stepper { display:flex; align-items:stretch; gap:8px; }
            .gp-stepper button { flex:none; width:48px; min-height:48px; border-radius:12px; border:1px solid #cbd5e1; background:#fff; color:#0e7490; font-size:24px; font-weight:800; cursor:pointer; touch-action:manipulation; transition:transform .08s,background .15s; }
            .gp-stepper button:hover:not(:disabled) { background:#ecfeff; }
            .gp-stepper button:active:not(:disabled) { transform:scale(.92); }
            .gp-stepper button:disabled { opacity:.35; cursor:not-allowed; }
            .gp-stepper input { flex:1; min-width:0; text-align:center; font-size:24px; font-weight:800; border:1px solid #cbd5e1; border-radius:12px; padding:6px; color:#0f172a; background:#fff; -moz-appearance:textfield; }
            .gp-stepper input::-webkit-outer-spin-button, .gp-stepper input::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
            .gp-stepper input:focus { outline:3px solid #67e8f9; outline-offset:1px; }
            .gp-stepper input[aria-invalid="true"] { border-color:#ef4444; background:#fef2f2; }
            .gp-quick { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
            .gp-quick button { min-height:32px; padding:3px 12px; border-radius:999px; border:1px solid #cbd5e1; background:#fff; color:#334155; font-size:13px; font-weight:600; cursor:pointer; touch-action:manipulation; }
            .gp-quick button:hover { border-color:#67e8f9; background:#ecfeff; }
            .gp-quick button[aria-pressed="true"] { background:#06b6d4; border-color:#06b6d4; color:#fff; }
            .gp-preview { border-radius:12px; padding:10px 12px; font-size:13px; line-height:1.6; background:#ecfeff; color:#155e75; border:1px solid #a5f3fc; }
            .gp-preview[data-tone="warn"] { background:#fffbeb; color:#92400e; border-color:#fcd34d; }
            .gp-preview[data-tone="error"] { background:#fef2f2; color:#991b1b; border-color:#fca5a5; }
            .gp-preview strong { font-size:16px; }
            .gp-preview .gp-sub { display:block; }
            .gp-preview .gp-hint { display:block; font-size:12px; opacity:.85; margin-top:2px; }
            .gp-bar { display:flex; gap:3px; height:10px; margin-top:8px; }
            .gp-bar i { display:block; border-radius:3px; background:hsl(var(--gh) 70% 52%); min-width:3px; }
            .gp-absent { border:1px solid #cbd5e1; border-radius:12px; background:#fff; }
            .gp-absent summary { list-style:none; cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:44px; padding:8px 12px; font-size:14px; font-weight:700; color:#334155; }
            .gp-absent summary::-webkit-details-marker { display:none; }
            .gp-absent summary::after { content:'▾'; color:#94a3b8; transition:transform .2s; }
            .gp-absent[open] summary::after { transform:rotate(180deg); }
            .gp-absent summary > span:first-child { flex:1; }
            .gp-badge { font-size:12px; font-weight:700; padding:2px 10px; border-radius:999px; background:#dcfce7; color:#166534; }
            .gp-badge.gp-has-absent { background:#fef3c7; color:#92400e; }
            .gp-absent-body { padding:0 12px 12px; }
            .gp-absent-help { margin:0 0 8px; font-size:12px; color:#64748b; line-height:1.5; }
            .gp-absent-list { display:flex; flex-wrap:wrap; gap:6px; max-height:230px; overflow:auto; padding:2px; }
            .gp-stu { min-height:32px; padding:3px 10px; border-radius:999px; border:1px solid #a5f3fc; background:#ecfeff; color:#155e75; font-size:13px; font-weight:600; cursor:pointer; touch-action:manipulation; }
            .gp-stu[aria-pressed="false"] { background:#f1f5f9; border-color:#cbd5e1; color:#94a3b8; text-decoration:line-through; }
            .gp-link { margin-top:8px; border:0; background:none; padding:4px 0; font-size:13px; font-weight:700; color:#0e7490; text-decoration:underline; cursor:pointer; }
            .gp-toggle { display:flex; align-items:center; gap:8px; font-size:14px; color:#475569; cursor:pointer; user-select:none; }
            .gp-toggle input { width:18px; height:18px; accent-color:#06b6d4; cursor:pointer; }
            .gp-shake { animation:gpShake .3s; }

            .gp-toolbar { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
            .gp-tbtn { display:inline-flex; align-items:center; gap:6px; min-height:40px; padding:7px 14px; border-radius:10px; border:1px solid #cbd5e1; background:#fff; color:#334155; font-size:14px; font-weight:700; cursor:pointer; touch-action:manipulation; transition:background .15s,transform .08s; }
            .gp-tbtn:hover { background:#f1f5f9; }
            .gp-tbtn:active { transform:scale(.96); }
            .gp-tbtn.gp-primary { background:#06b6d4; border-color:#06b6d4; color:#fff; }
            .gp-tbtn.gp-primary:hover { background:#0891b2; }
            .gp-tbtn.gp-proj-btn { background:#4f46e5; border-color:#4f46e5; color:#fff; }
            .gp-tbtn.gp-proj-btn:hover { background:#4338ca; }
            .gp-summary { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; font-size:14px; color:#475569; }
            .gp-summary strong { color:#0f172a; }
            .gp-note { padding:8px 12px; border-radius:10px; background:#f1f5f9; color:#475569; font-size:13px; line-height:1.5; }
            .gp-note.gp-warn { background:#fffbeb; color:#92400e; border:1px solid #fcd34d; }

            .gp-card { --gh:200; font-size:15px; display:flex; flex-direction:column; gap:.65em; min-width:0; padding:.95em .95em .8em; border-radius:14px; border-left:6px solid hsl(var(--gh) 65% 48%); background:hsl(var(--gh) 90% 96%); box-shadow:0 1px 3px rgba(15,23,42,.08); }
            .gp-card-head { display:flex; align-items:center; gap:.45em; min-width:0; }
            .gp-emoji { flex:none; font-size:1.1em; }
            .gp-name { flex:1; min-width:0; text-align:left; font:inherit; font-size:1.2em; font-weight:800; color:hsl(var(--gh) 65% 28%); background:transparent; border:0; padding:.1em .3em; margin-left:-.3em; border-radius:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            button.gp-name { cursor:text; }
            button.gp-name:hover { background:hsl(var(--gh) 80% 90%); }
            button.gp-name::after { content:' ✏️'; font-size:.65em; opacity:0; transition:opacity .15s; }
            button.gp-name:hover::after, button.gp-name:focus-visible::after { opacity:.8; }
            .gp-name-input { flex:1; min-width:0; font-size:1.15em; font-weight:800; border:2px solid hsl(var(--gh) 65% 48%); border-radius:8px; padding:.1em .4em; }
            .gp-count { flex:none; font-size:.8em; font-weight:800; padding:.2em .7em; border-radius:999px; background:#fff; color:hsl(var(--gh) 65% 28%); }
            .gp-members { display:flex; flex-wrap:wrap; align-content:flex-start; gap:.4em; margin:0; padding:0; list-style:none; flex:1; min-height:0; }
            .gp-members li { display:contents; }
            .gp-chip { display:inline-flex; align-items:baseline; gap:.3em; max-width:100%; padding:.35em .75em; border-radius:999px; border:1px solid hsl(var(--gh) 45% 82%); background:#fff; color:#1f2937; font:inherit; font-size:1em; font-weight:700; line-height:1.25; overflow-wrap:anywhere; touch-action:manipulation; transition:transform .1s,box-shadow .15s,background .15s; }
            button.gp-chip { cursor:pointer; }
            button.gp-chip:hover { box-shadow:0 1px 5px rgba(15,23,42,.18); }
            button.gp-chip:active { transform:scale(.95); }
            .gp-seat { font-size:.72em; font-weight:700; color:#94a3b8; }
            .gp-chip.gp-leader { background:hsl(var(--gh) 65% 46%); border-color:hsl(var(--gh) 65% 46%); color:#fff; }
            .gp-chip.gp-leader .gp-seat { color:rgba(255,255,255,.8); }
            .gp-chip.gp-flash { background:#fde68a; border-color:#f59e0b; color:#78350f; transform:scale(1.08); }
            .gp-nomember { color:#94a3b8; font-size:.9em; }
            .gp-card-foot { display:flex; flex-wrap:wrap; align-items:center; gap:.4em .5em; padding-top:.6em; border-top:1px solid hsl(var(--gh) 35% 85%); }
            .gp-leader-btn { flex:none; margin-right:auto; border:1px dashed hsl(var(--gh) 50% 60%); background:transparent; color:hsl(var(--gh) 60% 30%); border-radius:999px; padding:.3em .8em; min-height:34px; font:inherit; font-size:.85em; font-weight:700; cursor:pointer; touch-action:manipulation; }
            .gp-leader-btn:hover { background:hsl(var(--gh) 80% 90%); }
            .gp-score { flex:1 0 auto; display:flex; align-items:baseline; justify-content:flex-end; gap:.35em; color:#475569; font-weight:700; white-space:nowrap; }
            .gp-score-label { font-size:.85em; }
            .gp-score-num { display:inline-block; min-width:2ch; text-align:right; font-size:1.75em; font-weight:900; color:#4338ca; font-variant-numeric:tabular-nums; }
            .gp-step { flex:none; width:max(40px,2.6em); height:max(40px,2.6em); border:0; border-radius:999px; color:#fff; font:inherit; font-size:1.4em; font-weight:900; line-height:1; cursor:pointer; touch-action:manipulation; transition:transform .08s,filter .15s; }
            .gp-step:hover { filter:brightness(1.08); }
            .gp-step:active { transform:scale(.88); }
            .gp-step.gp-plus { background:#22c55e; }
            .gp-step.gp-minus { background:#ef4444; }
            .gp-enter { animation:gpEnter .38s ease-out both; }
            .gp-bump { animation:gpBump .35s ease-out; }
            @keyframes gpEnter { from { opacity:0; transform:translateY(14px) scale(.97); } to { opacity:1; transform:none; } }
            @keyframes gpBump { 0% { transform:scale(1); } 40% { transform:scale(1.4); } 100% { transform:scale(1); } }
            @keyframes gpShake { 0%,100% { transform:translateX(0); } 25% { transform:translateX(-6px); } 75% { transform:translateX(6px); } }

            .gp-shuffle { grid-column:1/-1; text-align:center; padding:28px 12px; border-radius:14px; background:#f8fafc; cursor:pointer; }
            .gp-shuffle-names { display:flex; flex-wrap:wrap; justify-content:center; gap:10px; min-height:60px; margin-bottom:12px; }
            .gp-shuffle-names span { --gh:200; font-size:clamp(22px,3.6vw,38px); font-weight:900; padding:4px 18px; border-radius:14px; color:#fff; background:hsl(var(--gh) 65% 46%); }
            .gp-shuffle-text { color:#475569; margin-bottom:12px; }
            .gp-shuffle-bar { max-width:320px; height:12px; margin:0 auto 12px; border-radius:6px; background:#e2e8f0; overflow:hidden; }
            .gp-shuffle-bar div { height:100%; width:0; background:linear-gradient(90deg,#06b6d4,#14b8a6); transition:width .15s; }
            .gp-shuffle-skip { font-size:13px; color:#64748b; }

            .gp-proj { position:fixed; inset:0; z-index:10001; display:flex; flex-direction:column; background:#e2e8f0; color:#0f172a; }
            .gp-proj-bar { flex:none; display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:10px 16px; background:#0f172a; color:#fff; }
            .gp-proj-title { flex:1; min-width:160px; font-size:20px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .gp-proj-bar button { min-height:40px; padding:6px 14px; border-radius:10px; border:1px solid rgba(255,255,255,.35); background:rgba(255,255,255,.12); color:#fff; font-size:15px; font-weight:700; cursor:pointer; }
            .gp-proj-bar button:hover { background:rgba(255,255,255,.24); }
            .gp-proj-bar button:focus-visible { outline:3px solid #67e8f9; outline-offset:2px; }
            .gp-proj-grid { flex:1; min-height:0; display:grid; gap:14px; padding:14px; grid-template-columns:repeat(var(--cols,2),minmax(0,1fr)); grid-auto-rows:minmax(0,1fr); }
            .gp-proj .gp-card { font-size:var(--pj-size,28px); overflow:hidden; min-height:0; padding:.5em .65em .45em; gap:.35em; }
            .gp-proj .gp-members { overflow:hidden; gap:.25em .3em; }
            .gp-proj .gp-chip { padding:.12em .55em; }
            .gp-proj .gp-card-foot { padding-top:.3em; row-gap:.2em; }
            .gp-proj .gp-score-label { display:none; }
            .gp-proj .gp-step { width:min(max(40px,1.9em),88px); height:min(max(40px,1.9em),88px); font-size:min(1.2em,52px); }
            .gp-proj .gp-score-num { font-size:min(1.6em,72px); }
            .gp-proj .gp-leader-btn { font-size:max(14px,.55em); }

            .gp-toast { position:fixed; left:50%; bottom:24px; transform:translateX(-50%); z-index:100001; max-width:min(560px,92vw); display:flex; align-items:center; gap:14px; padding:11px 16px; border-radius:14px; background:#0f172a; color:#fff; font-size:14px; line-height:1.45; box-shadow:0 10px 30px rgba(0,0,0,.35); animation:gpEnter .25s ease-out; }
            .gp-toast button { flex:none; border:0; background:none; color:#67e8f9; font-size:14px; font-weight:800; padding:4px 6px; min-height:32px; cursor:pointer; }

            @media (prefers-reduced-motion: reduce) {
                .gp-enter, .gp-bump, .gp-shake, .gp-toast { animation:none !important; }
            }
            @media (max-width: 640px) {
                .gp-tbtn { flex:1 1 calc(50% - 8px); justify-content:center; padding:7px 8px; }
            }

            .dark .gp-roster b { color:#67e8f9; }
            .dark .gp-seg { background:#334155; }
            .dark .gp-seg button { color:#cbd5e1; }
            .dark .gp-seg button[aria-checked="true"] { background:#0891b2; color:#fff; }
            .dark .gp-stepper button, .dark .gp-quick button, .dark .gp-tbtn { background:#1e293b; border-color:#475569; color:#e2e8f0; }
            .dark .gp-stepper button { color:#67e8f9; }
            .dark .gp-quick button[aria-pressed="true"] { background:#0891b2; border-color:#0891b2; color:#fff; }
            .dark .gp-stepper input[aria-invalid="true"] { background:#450a0a !important; border-color:#ef4444 !important; }
            .dark .gp-preview { background:#083344; color:#cffafe; border-color:#155e75; }
            .dark .gp-preview[data-tone="warn"] { background:#422006; color:#fde68a; border-color:#a16207; }
            .dark .gp-preview[data-tone="error"] { background:#450a0a; color:#fecaca; border-color:#b91c1c; }
            .dark .gp-absent { background:#1e293b; border-color:#475569; }
            .dark .gp-absent summary { color:#e2e8f0; }
            .dark .gp-stu { background:#083344; border-color:#155e75; color:#cffafe; }
            .dark .gp-stu[aria-pressed="false"] { background:#1e293b; border-color:#475569; color:#64748b; }
            .dark .gp-link { color:#67e8f9; }
            .dark .gp-toggle { color:#cbd5e1; }
            .dark .gp-tbtn.gp-primary { background:#0891b2; border-color:#0891b2; color:#fff; }
            .dark .gp-tbtn.gp-proj-btn { background:#4f46e5; border-color:#4f46e5; color:#fff; }
            .dark .gp-summary { color:#cbd5e1; }
            .dark .gp-summary strong { color:#f1f5f9; }
            .dark .gp-note { background:#1e293b; color:#cbd5e1; }
            .dark .gp-note.gp-warn { background:#422006; color:#fde68a; border-color:#a16207; }
            .dark .gp-card { background:hsl(var(--gh) 30% 17%); border-left-color:hsl(var(--gh) 60% 55%); box-shadow:none; }
            .dark .gp-name { color:hsl(var(--gh) 80% 82%); }
            .dark button.gp-name:hover { background:hsl(var(--gh) 30% 25%); }
            .dark .gp-count { background:hsl(var(--gh) 25% 27%); color:hsl(var(--gh) 80% 85%); }
            .dark .gp-chip { background:hsl(var(--gh) 22% 25%); border-color:hsl(var(--gh) 30% 38%); color:#f1f5f9; }
            .dark .gp-chip.gp-leader { background:hsl(var(--gh) 60% 42%); border-color:hsl(var(--gh) 60% 50%); }
            .dark .gp-card-foot { border-top-color:hsl(var(--gh) 25% 30%); }
            .dark .gp-leader-btn { color:hsl(var(--gh) 80% 82%); border-color:hsl(var(--gh) 40% 45%); }
            .dark .gp-leader-btn:hover { background:hsl(var(--gh) 30% 25%); }
            .dark .gp-score { color:#cbd5e1; }
            .dark .gp-score-num { color:#c7d2fe; }
            .dark .gp-shuffle { background:#1e293b; }
            .dark .gp-shuffle-text, .dark .gp-shuffle-skip { color:#cbd5e1; }
            .dark .gp-shuffle-bar { background:#334155; }
            .dark .gp-proj { background:#0b1220; color:#f1f5f9; }

            /* 手動編輯分組對話框 */
            .group-editor { width:min(860px,calc(100vw - 32px)); max-width:none; height:min(820px,90dvh); max-height:90dvh; padding:0; border:0; border-radius:20px; color:#172033; background:#fff; box-shadow:0 24px 80px #17203340; }
            .group-editor[open] { display:flex; flex-direction:column; }
            .group-editor::backdrop { background:#17203380; }
            .group-editor * { box-sizing:border-box; }
            .ge-header { padding:24px 24px 16px; border-bottom:1px solid #e2e8f0; flex:none; }
            .ge-header h3 { font-size:22px; margin:0 0 8px; font-weight:700; }
            .ge-header p { margin:0; font-size:14px; color:#526078; line-height:1.65; }
            .ge-body { overflow:auto; overscroll-behavior:contain; min-height:0; padding:20px 24px; }
            .ge-section-title { font-size:16px; font-weight:700; margin:0 0 12px; }
            .ge-names { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
            .ge-group { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; padding:12px; background:#f5f7fc; border:1px solid #e2e8f0; border-radius:12px; }
            .ge-group input { width:100%; min-width:0; }
            .ge-count { grid-column:1/-1; color:#526078; font-size:13px; }
            .group-editor input,.group-editor select { border:1px solid #cbd5e1; border-radius:9px; padding:10px; min-height:46px; font-size:16px; color:#172033; background:#fff; }
            .group-editor button { min-height:46px; border:1px solid #cbd5e1; border-radius:9px; padding:10px 14px; font-size:15px; font-weight:600; background:#fff; color:#334155; cursor:pointer; }
            .group-editor button:hover { background:#eef2ff; }
            .group-editor :is(input,select,button):focus-visible { outline:3px solid #818cf8; outline-offset:2px; }
            .ge-group button { color:#b42318; padding:8px 10px; }
            .group-editor .ge-add { margin:12px 0 24px; width:100%; border:1px dashed #a5b4fc; color:#4338ca; background:#f5f3ff; }
            .ge-members { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
            .ge-member { display:flex; flex-direction:column; gap:8px; border:1px solid #e2e8f0; border-radius:12px; padding:12px; min-width:0; }
            .ge-member span { font-size:16px; font-weight:600; overflow-wrap:anywhere; }
            .ge-member select { width:100%; min-width:0; text-overflow:ellipsis; }
            .ge-member.ge-unassigned { border-color:#f59e0b; background:#fffbeb; }
            .ge-member.ge-skipped { border-style:dashed; background:#f8fafc; }
            .ge-footer { flex:none; padding:14px 24px max(16px,env(safe-area-inset-bottom)); border-top:1px solid #e2e8f0; background:#fff; }
            .ge-discard { padding:12px; margin-bottom:12px; background:#fff7ed; border:1px solid #fdba74; border-radius:9px; }
            .ge-discard button { margin:8px 8px 0 0; }
            .ge-status { margin:0 0 10px; font-size:14px; line-height:1.5; color:#4338ca; }
            .ge-actions { display:flex; justify-content:flex-end; gap:12px; }
            .group-editor .ge-save { color:#fff; background:#4f46e5; border-color:#4f46e5; min-width:160px; }
            .group-editor .ge-save:hover { background:#4338ca; }
            @media(max-width:600px) {
                .group-editor { width:100%; height:100dvh; max-height:100dvh; margin:0; border-radius:0; }
                .ge-header { padding:18px 16px 12px; }
                .ge-header h3 { font-size:20px; }
                .ge-body { padding:16px; }
                .ge-names,.ge-members { grid-template-columns:1fr; }
                .ge-member { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.2fr); align-items:center; }
                .ge-footer { padding:12px 16px max(16px,env(safe-area-inset-bottom)); }
                .ge-actions { display:grid; grid-template-columns:1fr 2fr; gap:10px; }
                .group-editor .ge-save { min-width:0; }
            }
            @media(max-width:359px) { .ge-member { display:flex; } }
        `;
        document.head.append(style);
    }

    // ---------- 設定（記住上次選擇） ----------
    function loadPrefs() {
        try {
            const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {};
            if (p.method === 'byGroupCount' || p.method === 'byMemberCount') state.method = p.method;
            ['byGroupCount', 'byMemberCount'].forEach(k => { if (Number.isInteger(p[k]) && p[k] >= 1) memo[k] = p[k]; });
            state.anim = typeof p.anim === 'boolean' ? p.anim : !reduceMotion();
        } catch (e) { state.anim = !reduceMotion(); }
    }
    function savePrefs() {
        try {
            localStorage.setItem(PREFS_KEY, JSON.stringify({
                method: state.method, byGroupCount: memo.byGroupCount, byMemberCount: memo.byMemberCount, anim: state.anim
            }));
        } catch (e) { /* 只是偏好設定，存不了不影響分組 */ }
    }

    // ---------- 今天誰參加（請假名單只記當天、各班分開） ----------
    const absentKey = () => 'groupingAbsent-' + classId();
    function loadAbsent() {
        try {
            const raw = JSON.parse(localStorage.getItem(absentKey()) || 'null');
            if (raw && raw.date === todayStamp() && Array.isArray(raw.ids)) return new Set(raw.ids.map(String));
        } catch (e) { /* 壞掉的紀錄當作沒有 */ }
        return new Set();
    }
    function saveAbsent() {
        try {
            if (absent.size) localStorage.setItem(absentKey(), JSON.stringify({ date: todayStamp(), ids: [...absent] }));
            else localStorage.removeItem(absentKey());
        } catch (e) { /* 只是當天便利設定 */ }
    }
    function pruneAbsent() {
        const ids = new Set(getStudents().map(s => String(s.id)));
        let changed = false;
        absent.forEach(id => { if (!ids.has(id)) { absent.delete(id); changed = true; } });
        if (changed) saveAbsent();
    }
    const participants = () => getStudents().filter(s => !absent.has(String(s.id)));

    // ---------- 分組計畫（與實際分配方式一致：輪流發牌，人數最多差 1） ----------
    function readValue() {
        const raw = String($('groupingValue')?.value ?? '').trim();
        return /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
    }
    function plan(n, method, v) {
        if (getStudents().length === 0) return { error: '還沒有學生名單，請先到「學生管理」新增學生。', empty: true };
        if (n < 1) return { error: '今天沒有人參加分組，請在「今天誰參加」至少選 1 位同學。' };
        if (!Number.isInteger(v) || v < 1) return { error: '請輸入 1 以上的整數。' };
        if (method === 'byGroupCount' && v > n) return { error: `組數不能超過參加人數，最多 ${n} 組。` };
        if (method === 'byMemberCount' && v > n) return { error: `每組人數不能超過參加人數，最多 ${n} 人。` };
        const g = method === 'byGroupCount' ? v : Math.ceil(n / v);
        const base = Math.floor(n / g), extra = n % g;
        return { n, g, base, extra, sizes: Array.from({ length: g }, (_, i) => i < extra ? base + 1 : base) };
    }
    function currentPlan() { return plan(participants().length, state.method, readValue()); }

    // ---------- 設定區畫面 ----------
    function syncMethodUI() {
        const hidden = $('groupingMethod');
        if (hidden) hidden.value = state.method;
        document.querySelectorAll('#grouping-section .gp-seg [data-method]').forEach(b => {
            const on = b.dataset.method === state.method;
            b.setAttribute('aria-checked', String(on));
            b.tabIndex = on ? 0 : -1;
        });
        const label = $('groupingLabel');
        if (label) label.textContent = LABELS[state.method];
    }
    function selectMethod(method, focus) {
        if (!LABELS[method]) return;
        if (method !== state.method) {
            state.method = method;
            const input = $('groupingValue');
            if (input) input.value = memo[method] || DEFAULTS[method];
            savePrefs();
        }
        syncMethodUI();
        renderQuick();
        updatePreview();
        if (focus) document.querySelector(`#grouping-section .gp-seg [data-method="${method}"]`)?.focus();
    }
    function setValue(v) {
        const input = $('groupingValue');
        if (!input) return;
        input.value = v;
        updatePreview();
    }
    function renderQuick() {
        const wrap = $('groupingQuick');
        if (!wrap) return;
        const n = participants().length;
        const unit = state.method === 'byGroupCount' ? '組' : '人';
        wrap.replaceChildren(...QUICK[state.method].filter(v => v <= n).map(v => {
            const b = el('button', '', `${v} ${unit}`);
            b.type = 'button';
            b.dataset.v = v;
            b.setAttribute('aria-pressed', 'false');
            b.addEventListener('click', () => setValue(v));
            return b;
        }));
        syncQuick();
    }
    function syncQuick() {
        const v = readValue();
        $('groupingQuick')?.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === v)));
    }
    function updateRosterInfo() {
        const box = $('groupingRoster');
        if (!box) return;
        const total = getStudents().length, n = participants().length;
        box.replaceChildren();
        const add = (pre, num, post) => { const s = el('span'); s.append(pre, el('b', '', String(num)), post); box.append(s); };
        add('👥 全班 ', total, ' 人');
        if (absent.size) add('今天參加 ', n, ' 人');
        const badge = $('groupingAbsentBadge');
        if (badge) {
            badge.textContent = absent.size ? `${n}/${total} 人參加` : '全員參加';
            badge.classList.toggle('gp-has-absent', absent.size > 0);
        }
    }
    function updatePreview() {
        const box = $('groupingPreview');
        const p = currentPlan();
        const input = $('groupingValue');
        const v = readValue();
        const n = participants().length;
        if (input) input.setAttribute('aria-invalid', String(!!p.error && !p.empty && n > 0));
        const minus = $('groupingMinus'), plus = $('groupingPlus');
        if (minus) minus.disabled = !(v > 1);
        if (plus) plus.disabled = !(n > 0 && (isNaN(v) || v < n));
        const btn = $('groupingStartBtn');
        if (btn && !state.busy) btn.disabled = !!p.error;
        syncQuick();
        if (!p.error) { memo[state.method] = v; savePrefs(); }
        if (!box) return;
        box.replaceChildren();
        if (p.error) {
            box.dataset.tone = 'error';
            box.append(el('span', '', '⚠️ ' + p.error));
            return;
        }
        const tone = (p.base === 1 && p.g > 1) || p.g === 1 ? 'warn' : 'ok';
        box.dataset.tone = tone;
        const head = el('strong', '', `${p.n} 人 → ${p.g} 組`);
        const range = p.extra ? `${p.base}~${p.base + 1}` : `${p.base}`;
        const detail = p.extra ? `（${p.extra} 組 ${p.base + 1} 人、${p.g - p.extra} 組 ${p.base} 人）` : '';
        box.append(head, el('span', 'gp-sub', `每組 ${range} 人${detail}`));
        if (state.method === 'byMemberCount' && p.extra) box.append(el('span', 'gp-hint', '※ 無法剛好整除，已把人數盡量平均，不會有人落單。'));
        if (p.g === 1) box.append(el('span', 'gp-hint', '※ 只有 1 組，全部同學都在同一組。'));
        else if (p.base === 1) box.append(el('span', 'gp-hint', '※ 有小組只有 1 個人，確定要這樣分嗎？'));
        if (p.g <= 40) {
            const bar = el('div', 'gp-bar');
            bar.setAttribute('aria-hidden', 'true');
            p.sizes.forEach((size, i) => {
                const seg = el('i');
                seg.style.flex = String(size);
                seg.style.setProperty('--gh', hueFor(i));
                seg.title = `第 ${i + 1} 組 ${size} 人`;
                bar.append(seg);
            });
            box.append(bar);
        }
    }
    function renderAbsentList() {
        const list = $('groupingAbsentList');
        if (!list) return;
        const sorted = getStudents().map((s, i) => ({ s, i })).sort((a, b) => (seatSort(a.s) - seatSort(b.s)) || (a.i - b.i)).map(x => x.s);
        list.replaceChildren(...sorted.map(s => {
            const id = String(s.id);
            const b = el('button', 'gp-stu', `${seatText(s) ? seatText(s) + ' ' : ''}${s.name}`);
            b.type = 'button';
            const sync = () => {
                const on = !absent.has(id);
                b.setAttribute('aria-pressed', String(on));
                b.title = on ? '點一下：今天不參加分組' : '點一下：恢復參加';
            };
            sync();
            b.addEventListener('click', () => {
                if (absent.has(id)) absent.delete(id); else absent.add(id);
                saveAbsent();
                sync();
                afterParticipantsChange();
            });
            return b;
        }));
        if (!sorted.length) list.append(el('span', 'gp-absent-help', '還沒有學生名單。'));
        const all = $('groupingAbsentAll');
        if (all) all.hidden = absent.size === 0;
    }
    function afterParticipantsChange() {
        const all = $('groupingAbsentAll');
        if (all) all.hidden = absent.size === 0;
        updateRosterInfo();
        renderQuick();
        updatePreview();
    }
    function refreshSettings() {
        pruneAbsent();
        syncMethodUI();
        updateRosterInfo();
        renderAbsentList();
        renderQuick();
        updatePreview();
    }

    // ---------- 分組流程 ----------
    function buildGroups(list, p) {
        const stamp = Date.now();
        const next = Array.from({ length: p.g }, (_, i) => ({ id: stamp + i, name: `第 ${i + 1} 組`, members: [], score: 0 }));
        shuffle(list).forEach((student, i) => next[i % p.g].members.push(student));
        next.forEach(g => { g.score = g.members.reduce((t, m) => t + (Number(m.points) || 0), 0); });
        return next;
    }
    function setBusyUI(busy) {
        const btn = $('groupingStartBtn');
        if (btn) {
            btn.disabled = busy || !!currentPlan().error;
            btn.setAttribute('aria-busy', String(busy));
            btn.textContent = busy ? '🔄 分組中…' : '🎲 開始隨機分組';
        }
        const bar = $('groupingToolbar');
        if (bar) bar.hidden = busy;
        if (busy) { const sum = $('groupingSummary'); if (sum) sum.hidden = true; }
    }
    function onBusyKey(e) {
        if (e.key === 'Tab') return;
        e.stopPropagation();   // 洗牌時不要觸發全站快捷鍵（空白鍵會開始計時器）
        if (['Enter', ' ', 'Escape'].includes(e.key)) { e.preventDefault(); state.skip = true; }
    }
    async function runShuffle(list) {
        const box = $('groupingResult');
        if (!box) return;
        const panel = el('div', 'gp-shuffle');
        panel.setAttribute('role', 'status');
        const names = el('div', 'gp-shuffle-names');
        const text = el('div', 'gp-shuffle-text', '🔀 正在隨機洗牌中…');
        const barWrap = el('div', 'gp-shuffle-bar');
        const bar = el('div');
        barWrap.append(bar);
        panel.append(names, text, barWrap, el('div', 'gp-shuffle-skip', '點一下或按 Enter 可略過動畫'));
        panel.addEventListener('click', () => { state.skip = true; });
        box.replaceChildren(panel);
        document.addEventListener('keydown', onBusyKey, true);
        try {
            const frames = 18;
            for (let i = 0; i < frames && !state.skip; i++) {
                const picks = shuffle(list).slice(0, Math.min(3, list.length));
                names.replaceChildren(...picks.map((s, k) => {
                    const span = el('span', '', s.name);
                    span.style.setProperty('--gh', hueFor(Math.floor(Math.random() * 10) + k));
                    return span;
                }));
                bar.style.width = ((i + 1) / frames * 90) + '%';
                play('playLotteryTickSound');
                await sleep(80);
            }
            bar.style.width = '100%';
            if (!state.skip) await sleep(180);
        } finally {
            document.removeEventListener('keydown', onBusyKey, true);
        }
    }
    async function startFlow(opts = {}) {
        if (state.busy) return;
        const list = participants();
        const p = plan(list.length, state.method, readValue());
        if (p.error) {
            updatePreview();
            const target = p.empty ? $('groupingPreview') : $('groupingValue');
            if (target) { target.classList.remove('gp-shake'); void target.offsetWidth; target.classList.add('gp-shake'); }
            if (!p.empty) $('groupingValue')?.focus();
            toast(p.error);
            return;
        }
        const startBtn = $('groupingStartBtn');
        const hadFocus = document.activeElement === startBtn;
        const prevGroups = getGroups();
        const prevSnapshot = prevGroups.length ? JSON.stringify(prevGroups) : null;
        const useAnim = state.anim && !opts.instant && !proj;
        let saved = false, next = null;
        state.busy = true;
        state.skip = false;
        setBusyUI(true);
        try {
            if (useAnim) await runShuffle(list);
            next = buildGroups(list, p);
            setGroups(next);
            saved = persist('儲存分組結果', () => { setGroups(prevGroups); });
        } catch (e) {
            console.error('[Grouping] 分組失敗:', e);
            setGroups(prevGroups);
        } finally {
            state.busy = false;
            setBusyUI(false);
        }
        renderResult({ animate: saved && useAnim });
        if (hadFocus && startBtn && !startBtn.disabled) startBtn.focus({ preventScroll: true });
        if (!saved) return;
        if (useAnim) { play('playCheerSound'); play('triggerConfetti'); }
        if (prevSnapshot) {
            undoCtx = { prev: prevSnapshot, expect: JSON.stringify(getGroups()) };
            toast(`已重新分成 ${p.g} 組（小組分數依新組員重新計算）`, { label: '復原', onClick: undoRegroup }, UNDO_MS);
        } else {
            undoCtx = null;
            toast(`已分成 ${p.g} 組 🎉`);
        }
    }
    function undoRegroup() {
        const ctx = undoCtx;
        undoCtx = null;
        if (!ctx) return;
        if (JSON.stringify(getGroups()) !== ctx.expect) {
            toast('分組之後已經有新的變動（例如加減分），為了不弄丟資料，這次無法復原。');
            return;
        }
        const current = getGroups();
        let restored;
        try { restored = JSON.parse(ctx.prev); } catch (e) { return; }
        setGroups(restored);
        if (!persist('復原上一次分組', () => { setGroups(current); })) { renderResult(); return; }
        renderResult();
        toast('已復原成上一次的分組 ↩️');
    }

    // ---------- 結果畫面 ----------
    function nameMap() {
        return new Map(getStudents().map(s => [String(s.id), s]));
    }
    function memberView(m, byId) {
        const live = byId.get(String(m.id));
        return { id: m.id, name: (live && live.name) || m.name || '（未命名）', seat: seatText(live || m), sort: seatSort(live || m) };
    }
    function captureFocusKey(root) {
        const a = document.activeElement;
        return a && root && root.contains(a) ? a.dataset.gpKey : null;
    }
    function restoreFocus(root, key) {
        if (!key || !root) return;
        const target = [...root.querySelectorAll('[data-gp-key]')].find(n => n.dataset.gpKey === key);
        if (target) target.focus({ preventScroll: true });
    }
    function renderResult(opts = {}) {
        injectStyles();
        if (state.busy) return;
        const container = $('groupingResult');
        if (!container) return;
        const gs = getGroups();
        const focusKey = captureFocusKey(container);
        updateToolbar(gs);
        updateSummary(gs);
        container.replaceChildren();
        if (!gs.length) {
            renderEmpty(container);
        } else {
            const byId = nameMap();
            const nextMemo = new Map();
            gs.forEach((g, i) => container.append(buildCard(g, i, { byId, animate: opts.animate, view: 'main', nextMemo })));
            scoreMemo.main = nextMemo;
            restoreFocus(container, focusKey);
        }
        refreshProjection();
    }
    function renderEmpty(container) {
        const hasStudents = getStudents().length > 0;
        const opts = hasStudents ? {
            icon: '🧩', title: '還沒有分組',
            desc: '在左邊選好「分成幾組」或「每組幾人」，按「🎲 開始隨機分組」就好；也可以按上方「✏️ 手動編輯」自己排。',
            compact: true
        } : {
            icon: '🧑‍🎓', title: '還沒有學生名單',
            desc: '先到「學生管理」新增或匯入學生，就能開始分組。',
            actionLabel: '前往學生管理',
            onAction: () => { if (typeof window.showSection === 'function') window.showSection('students'); },
            compact: true
        };
        if (window.EmptyState && typeof EmptyState.render === 'function') {
            EmptyState.render(container, opts);
            container.firstElementChild?.classList.add('col-span-full');
        } else {
            const box = el('div', 'text-gray-500 text-center p-6 bg-gray-50 rounded-lg col-span-full', opts.title + '。' + opts.desc);
            container.append(box);
        }
    }
    function updateToolbar(gs) {
        const bar = $('groupingToolbar');
        if (!bar) return;
        bar.hidden = false;
        bar.querySelectorAll('[data-gp]').forEach(b => { b.hidden = b.dataset.needs === 'groups' && !gs.length; });
    }
    function listNames(arr, max = 15) {
        return arr.slice(0, max).join('、') + (arr.length > max ? `…等 ${arr.length} 人` : '');
    }
    function updateSummary(gs) {
        const box = $('groupingSummary');
        if (!box) return;
        box.replaceChildren();
        if (!gs.length) { box.hidden = true; return; }
        box.hidden = false;
        const byId = nameMap();
        const grouped = new Set();
        const ghosts = [];
        gs.forEach(g => (g.members || []).forEach(m => {
            const id = String(m.id);
            if (grouped.has(id)) return;
            grouped.add(id);
            if (!byId.has(id)) ghosts.push(m.name || '（未命名）');
        }));
        const sizes = gs.map(g => (g.members || []).length);
        const min = Math.min(...sizes), max = Math.max(...sizes);
        const line = el('div');
        line.append('共 ', el('strong', '', `${gs.length} 組`), ' · ', el('strong', '', `${sizes.reduce((a, b) => a + b, 0)} 人`),
            ` · 每組 ${min === max ? min : `${min}~${max}`} 人`);
        box.append(line);
        const ungrouped = getStudents().filter(s => !grouped.has(String(s.id))).map(s => s.name);
        if (ungrouped.length) box.append(el('div', 'gp-note', `🙋 沒有分到組（${ungrouped.length} 人）：${listNames(ungrouped)}`));
        if (ghosts.length) box.append(el('div', 'gp-note gp-warn', `⚠️ 有 ${ghosts.length} 位同學已不在班級名單：${listNames(ghosts)}。可以按「重新分組」或「手動編輯」更新。`));
    }
    function buildCard(group, index, ctx) {
        const inProj = ctx.view === 'proj';
        const members = (group.members || []).map(m => memberView(m, ctx.byId))
            .map((m, i) => ({ ...m, i })).sort((a, b) => (a.sort - b.sort) || (a.i - b.i));
        const card = el('article', 'gp-card');
        card.style.setProperty('--gh', hueFor(index));
        card.setAttribute('aria-label', group.name || `第 ${index + 1} 組`);
        if (ctx.animate) { card.classList.add('gp-enter'); card.style.animationDelay = (index * 70) + 'ms'; }

        const head = el('div', 'gp-card-head');
        head.append(el('span', 'gp-emoji', EMOJIS[index % EMOJIS.length]));
        if (inProj) {
            head.append(el('span', 'gp-name', group.name || `第 ${index + 1} 組`));
        } else {
            const nameBtn = el('button', 'gp-name', group.name || `第 ${index + 1} 組`);
            nameBtn.type = 'button';
            nameBtn.title = '點一下修改組名';
            nameBtn.dataset.gpKey = 'name-' + index;
            nameBtn.addEventListener('click', () => startRename(nameBtn, index));
            head.append(nameBtn);
        }
        head.append(el('span', 'gp-count', `${members.length} 人`));

        const ul = el('ul', 'gp-members');
        members.forEach(m => {
            const li = el('li');
            const isLeader = sameId(group.leaderId, m.id);
            const chip = el(inProj ? 'span' : 'button', 'gp-chip' + (isLeader ? ' gp-leader' : ''));
            chip.dataset.id = String(m.id);
            if (isLeader) chip.append(el('span', 'gp-crown', '👑'));
            if (!inProj && m.seat) chip.append(el('span', 'gp-seat', m.seat));
            chip.append(document.createTextNode(m.name));
            if (!inProj) {
                chip.type = 'button';
                chip.setAttribute('aria-pressed', String(isLeader));
                chip.title = isLeader ? '點一下取消組長' : '點一下設為組長';
                chip.dataset.gpKey = `chip-${index}-${m.id}`;
                chip.addEventListener('click', () => toggleLeader(index, m.id));
            }
            li.append(chip);
            ul.append(li);
        });
        if (!members.length) ul.append(el('li', 'gp-nomember', '沒有組員'));

        const foot = el('div', 'gp-card-foot');
        if (members.length) {
            const leaderBtn = el('button', 'gp-leader-btn', group.leaderId != null && members.some(m => sameId(m.id, group.leaderId)) ? '🎲 換組長' : '🎲 抽組長');
            leaderBtn.type = 'button';
            leaderBtn.dataset.gpKey = 'leader-' + index;
            leaderBtn.addEventListener('click', () => pickLeader(index, card));
            foot.append(leaderBtn);
        }
        const score = Number(group.score) || 0;
        const scoreBox = el('div', 'gp-score');
        const num = el('span', 'gp-score-num', String(score));
        const memoKey = String(group.id ?? index);
        const prevMemo = scoreMemo[ctx.view];
        if (prevMemo.has(memoKey) && prevMemo.get(memoKey) !== score) num.classList.add('gp-bump');
        ctx.nextMemo.set(memoKey, score);
        scoreBox.append(el('span', 'gp-score-label', '分數'), num);
        const label = group.name || `第 ${index + 1} 組`;
        const step = (sign) => {
            const b = el('button', 'gp-step ' + (sign > 0 ? 'gp-plus' : 'gp-minus'), sign > 0 ? '+' : '−');
            b.type = 'button';
            b.setAttribute('aria-label', `${label}${sign > 0 ? '加' : '減'} 1 分`);
            b.dataset.gpKey = (sign > 0 ? 'plus-' : 'minus-') + index;
            b.addEventListener('click', () => adjustScore(index, sign));
            return b;
        };
        foot.append(scoreBox, step(-1), step(1));
        card.append(head, ul, foot);
        return card;
    }

    // ---------- 卡片互動 ----------
    function adjustScore(index, delta) {
        if (typeof window.adjustGroupScore === 'function') {
            window.adjustGroupScore(index, delta);
        } else {
            const g = getGroups()[index];
            if (!g) return;
            g.score = (Number(g.score) || 0) + delta;
            persist('調整小組分數', () => { g.score -= delta; });
            renderResult();
        }
        play(delta > 0 ? 'playAddScoreSound' : 'playSubtractScoreSound');
    }
    function startRename(button, index) {
        const g = getGroups()[index];
        if (!g) return;
        const input = el('input', 'gp-name-input');
        input.value = g.name || '';
        input.maxLength = 40;
        input.setAttribute('aria-label', '組名');
        button.replaceWith(input);
        input.focus();
        input.select();
        let done = false;
        const finish = commit => {
            if (done) return;
            done = true;
            const next = input.value.trim();
            const target = getGroups()[index];
            if (commit && target === g && next && next !== g.name) {
                const prev = g.name;
                g.name = next;
                persist('修改組名', () => { g.name = prev; });
            }
            renderResult();
            restoreFocus($('groupingResult'), 'name-' + index);
        };
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); finish(true); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
        });
        input.addEventListener('blur', () => finish(true));
    }
    function setLeader(index, id) {
        const g = getGroups()[index];
        if (!g) return false;
        const had = Object.prototype.hasOwnProperty.call(g, 'leaderId');
        const prev = g.leaderId;
        if (id == null) delete g.leaderId; else g.leaderId = id;
        return persist('設定組長', () => { if (had) g.leaderId = prev; else delete g.leaderId; });
    }
    function toggleLeader(index, id) {
        const g = getGroups()[index];
        if (!g) return;
        setLeader(index, sameId(g.leaderId, id) ? null : id);
        renderResult();
    }
    function randomLeader(g) {
        const members = g.members || [];
        const pool = members.length > 1 ? members.filter(m => !sameId(m.id, g.leaderId)) : members;
        return pool[Math.floor(Math.random() * pool.length)];
    }
    async function pickLeader(index, card) {
        const g = getGroups()[index];
        if (!g || !(g.members || []).length || state.leaderBusy) return;
        state.leaderBusy = true;
        const winner = randomLeader(g);
        try {
            const chips = card ? [...card.querySelectorAll('.gp-chip[data-id]')] : [];
            if (chips.length > 1 && !reduceMotion()) {
                let last = -1;
                for (let step = 0; step < 12; step++) {
                    let k = Math.floor(Math.random() * chips.length);
                    if (k === last) k = (k + 1) % chips.length;
                    last = k;
                    chips.forEach(c => c.classList.remove('gp-flash'));
                    if (!chips[k].isConnected) break;
                    chips[k].classList.add('gp-flash');
                    play('playLotteryTickSound');
                    await sleep(55 + step * 14);
                }
                chips.forEach(c => c.classList.remove('gp-flash'));
            }
            if (getGroups()[index] !== g) return;   // 這段期間分組被換掉了
            setLeader(index, winner.id);
            renderResult();
            play('playLotteryWinSound');
            const name = memberView(winner, nameMap()).name;
            toast(`👑 ${g.name || `第 ${index + 1} 組`}的組長：${name}`);
        } finally {
            state.leaderBusy = false;
        }
    }
    function pickAllLeaders() {
        const gs = getGroups();
        if (!gs.length) return;
        const before = gs.map(g => ({ had: Object.prototype.hasOwnProperty.call(g, 'leaderId'), v: g.leaderId }));
        let count = 0;
        gs.forEach(g => { const w = (g.members || []).length ? randomLeader(g) : null; if (w) { g.leaderId = w.id; count++; } });
        const ok = persist('抽組長', () => gs.forEach((g, i) => { if (before[i].had) g.leaderId = before[i].v; else delete g.leaderId; }));
        renderResult();
        if (ok) { play('playLotteryWinSound'); toast(`👑 已為 ${count} 組抽出組長（點名字可以自己換）`); }
    }

    // ---------- 複製、匯出 ----------
    function resultText() {
        const byId = nameMap();
        const lines = getGroups().map((g, i) => {
            const ms = (g.members || []).map(m => memberView(m, byId)).sort((a, b) => a.sort - b.sort);
            const leader = ms.find(m => sameId(m.id, g.leaderId));
            const name = g.name || `第 ${i + 1} 組`;
            return `${name}（${ms.length} 人${leader ? `，組長：${leader.name}` : ''}）：${ms.map(m => m.name).join('、') || '沒有組員'}`;
        });
        const grouped = new Set(getGroups().flatMap(g => (g.members || []).map(m => String(m.id))));
        const left = getStudents().filter(s => !grouped.has(String(s.id))).map(s => s.name);
        if (left.length) lines.push(`未分組：${left.join('、')}`);
        return lines.join('\n');
    }
    async function copyResult() {
        const text = resultText();
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { /* 改用舊方法 */ }
        if (!ok) {
            try {
                const ta = el('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
                document.body.append(ta);
                ta.select();
                ok = document.execCommand('copy');
                ta.remove();
            } catch (e) { ok = false; }
        }
        toast(ok ? '📋 已複製分組結果，可以貼到聯絡簿或 LINE' : '複製失敗，請改用「匯出 Excel」');
    }
    function exportGroups() {
        const gs = getGroups();
        if (!gs.length) { toast('還沒有分組可以匯出'); return; }
        if (typeof XLSX === 'undefined') {
            if (typeof window.exportGroupScores === 'function') window.exportGroupScores();
            return;
        }
        try {
            const byId = nameMap();
            const summary = [['組別', '組長', '人數', '組員', '小組分數']];
            const detail = [['組別', '座號', '姓名', '組長']];
            gs.forEach((g, i) => {
                const name = g.name || `第 ${i + 1} 組`;
                const ms = (g.members || []).map(m => memberView(m, byId)).sort((a, b) => a.sort - b.sort);
                const leader = ms.find(m => sameId(m.id, g.leaderId));
                summary.push([name, leader ? leader.name : '', ms.length, ms.map(m => m.name).join('、'), Number(g.score) || 0]);
                ms.forEach(m => detail.push([name, m.seat, m.name, sameId(m.id, g.leaderId) ? '是' : '']));
            });
            const wb = XLSX.utils.book_new();
            const ws1 = XLSX.utils.aoa_to_sheet(summary);
            ws1['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 6 }, { wch: 60 }, { wch: 10 }];
            XLSX.utils.book_append_sheet(wb, ws1, '分組結果');
            const ws2 = XLSX.utils.aoa_to_sheet(detail);
            ws2['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 6 }];
            XLSX.utils.book_append_sheet(wb, ws2, '每人一列');
            const date = (window.DataBackup && DataBackup.getDateString) ? DataBackup.getDateString() : new Date().toISOString().slice(0, 10);
            const cls = className().replace(/[\\/:*?"<>|]/g, '').trim();
            XLSX.writeFile(wb, `小組分組_${cls ? cls + '_' : ''}${date}.xlsx`);
            toast('💾 已匯出 Excel');
        } catch (e) {
            console.error('[Grouping] 匯出 Excel 失敗，改用 CSV:', e);
            if (typeof window.exportGroupScores === 'function') window.exportGroupScores();
        }
    }

    // ---------- 投影顯示 ----------
    function onProjKey(e) {
        if (!proj) return;
        // 投影時擋住全站快捷鍵（空白鍵開計時器、數字鍵換頁…）；按鈕本身的 Enter／空白鍵照常運作
        e.stopPropagation();
        if (e.key === 'Escape' && !document.fullscreenElement) {
            e.preventDefault();
            closeProjection();
        }
    }
    function onProjResize() {
        if (!proj) return;
        cancelAnimationFrame(proj.raf);
        proj.raf = requestAnimationFrame(layoutProjection);
    }
    function openProjection(opener) {
        if (proj) return;
        if (!getGroups().length) { toast('請先分組'); return; }
        const root = el('div', 'gp-proj');
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', '分組投影顯示');
        const bar = el('div', 'gp-proj-bar');
        const title = el('div', 'gp-proj-title', `🧩 分組結果${className() ? ' · ' + className() : ''}`);
        const btn = (text, handler, label) => {
            const b = el('button', '', text);
            b.type = 'button';
            if (label) b.setAttribute('aria-label', label);
            b.addEventListener('click', handler);
            return b;
        };
        const regroup = btn('🔀 重新分組', () => startFlow({ instant: true }));
        const leaders = btn('👑 抽組長', pickAllLeaders);
        const full = btn('⛶ 全螢幕', () => {
            try {
                if (document.fullscreenElement) document.exitFullscreen();
                else root.requestFullscreen?.();
            } catch (e) { /* 不支援就維持視窗大小 */ }
        });
        const close = btn('✕ 關閉', closeProjection, '關閉投影顯示');
        bar.append(title, regroup, leaders, full, close);
        const grid = el('div', 'gp-proj-grid');
        root.append(bar, grid);
        document.body.append(root);
        proj = { root, grid, opener, overflow: document.body.style.overflow, raf: 0 };
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', onProjKey, true);
        window.addEventListener('resize', onProjResize);
        document.addEventListener('fullscreenchange', onProjResize);
        refreshProjection();
        close.focus();
    }
    function closeProjection() {
        if (!proj) return;
        const { root, opener, overflow } = proj;
        cancelAnimationFrame(proj.raf);
        proj = null;
        document.removeEventListener('keydown', onProjKey, true);
        window.removeEventListener('resize', onProjResize);
        document.removeEventListener('fullscreenchange', onProjResize);
        try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* ignore */ }
        root.remove();
        document.body.style.overflow = overflow || '';
        if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    }
    function refreshProjection() {
        if (!proj) return;
        const gs = getGroups();
        if (!gs.length) { closeProjection(); return; }
        const focusKey = captureFocusKey(proj.grid);
        const byId = nameMap();
        const nextMemo = new Map();
        proj.grid.replaceChildren(...gs.map((g, i) => buildCard(g, i, { byId, view: 'proj', nextMemo })));
        scoreMemo.proj = nextMemo;
        restoreFocus(proj.grid, focusKey);
        layoutProjection();
    }
    function layoutProjection() {
        if (!proj) return;
        const grid = proj.grid;
        const n = grid.children.length;
        const portrait = window.innerWidth < window.innerHeight * 0.9 || window.innerWidth < 700;
        const cols = portrait ? (n <= 2 ? 1 : 2) : (n <= 2 ? n : n <= 4 ? 2 : n <= 6 ? 3 : n <= 12 ? 4 : 5);
        grid.style.setProperty('--cols', String(Math.max(1, cols)));
        // 從大字開始縮，直到每張卡片的名字都放得下（全部卡片用同一個字級，看起來整齊）
        const cards = [...grid.children];
        const fits = () => cards.every(c => {
            const m = c.querySelector('.gp-members');
            const f = c.querySelector('.gp-card-foot');
            return c.scrollHeight <= c.clientHeight + 1 && c.scrollWidth <= c.clientWidth + 1 &&
                (!m || m.scrollHeight <= m.clientHeight + 1) && (!f || f.scrollWidth <= f.clientWidth + 1);
        });
        let size = Math.max(16, Math.min(64, Math.floor(window.innerHeight / 10)));
        for (; size > 14; size -= 2) {
            grid.style.setProperty('--pj-size', size + 'px');
            if (fits()) break;
        }
        grid.style.setProperty('--pj-size', size + 'px');
    }

    // ---------- 手動編輯分組（草稿與正式資料分離，儲存前檢查班級與資料是否已變動） ----------
    function openGroupEditor(opener) {
        const studentsAtOpen = getStudents().slice();
        if (!studentsAtOpen.length) { toast('請先到「學生管理」新增學生'); return; }
        const key = window.GROUPS_KEY || 'groups';
        const classIdAtOpen = localStorage.getItem('currentClassId');
        const original = JSON.stringify(getGroups());
        const roster = JSON.stringify(getStudents());
        const stored = localStorage.getItem(key);
        const draft = getGroups().map(g => ({ ...g, members: [...(g.members || [])] }));
        const assignments = studentsAtOpen.map(student => draft.findIndex(g =>
            g.members.some(m => String(m.id) === String(student.id))));
        // 已有分組時，原本就沒分到組的同學（例如請假）可以維持未分組；
        // 從零開始建立分組時，仍要求每位同學都要選組。
        const keepUnassigned = new Set(draft.length ? assignments.map((a, i) => a < 0 ? i : -1).filter(i => i >= 0) : []);
        const baseline = JSON.stringify({ draft, assignments });
        let saved = false;
        const isDirty = () => !saved && JSON.stringify({ draft, assignments }) !== baseline;
        const dialog = document.createElement('dialog');
        dialog.className = 'group-editor';
        dialog.setAttribute('aria-label', '手動編輯分組');
        const heading = document.createElement('h3');
        heading.textContent = `手動編輯分組 · ${className() || '目前班級'}`;
        const hint = document.createElement('p');
        hint.textContent = '可修改組名及學生所屬組別。既有小組分數保留，新組從 0 分開始；儲存後才套用。';
        const names = el('div', 'ge-names');
        const members = el('div', 'ge-members');
        const status = el('p', 'ge-status');
        status.setAttribute('role', 'status');
        const button = (label, handler) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.addEventListener('click', handler);
            return b;
        };
        const blocking = () => assignments.filter((a, i) => a < 0 && !keepUnassigned.has(i)).length;
        function renderMembers() {
            members.replaceChildren();
            studentsAtOpen.forEach((student, index) => {
                const label = el('label', 'ge-member');
                const text = el('span', '', `${student.number || student.seatNumber || ''} ${student.name}`.trim());
                const select = document.createElement('select');
                select.setAttribute('aria-label', `${student.name}所屬組別`);
                select.add(new Option(keepUnassigned.has(index) ? '未分組（不參加）' : '未分組', '-1'));
                draft.forEach((g, i) => select.add(new Option(g.name || `第 ${i + 1} 組`, String(i))));
                select.value = String(assignments[index]);
                const mark = () => {
                    label.classList.toggle('ge-unassigned', assignments[index] < 0 && !keepUnassigned.has(index));
                    label.classList.toggle('ge-skipped', assignments[index] < 0 && keepUnassigned.has(index));
                };
                mark();
                select.addEventListener('change', () => {
                    assignments[index] = Number(select.value);
                    mark();
                    updateStatus();
                });
                label.append(text, select);
                members.append(label);
            });
            updateStatus();
        }
        function updateStatus() {
            const missing = blocking();
            const skipped = assignments.filter((a, i) => a < 0 && keepUnassigned.has(i)).length;
            const assigned = assignments.filter(a => a >= 0).length;
            status.textContent = missing
                ? `尚有 ${missing} 位學生未分組，請選擇組別。`
                : `✓ ${assigned} 人已分配至 ${draft.length} 組${skipped ? `，另有 ${skipped} 人維持未分組` : ''}，按儲存套用。`;
            status.textContent = (isDirty() ? '尚未儲存 · ' : '') + status.textContent;
            names.querySelectorAll('.ge-count').forEach((badge, i) => {
                badge.textContent = `${assignments.filter(a => a === i).length} 人 · 小組分數 ${draft[i].score || 0}`;
            });
        }
        function renderNames() {
            names.replaceChildren();
            draft.forEach((g, i) => {
                const row = el('div', 'ge-group');
                const input = document.createElement('input');
                input.value = g.name;
                input.maxLength = 40;
                input.setAttribute('aria-label', `第 ${i + 1} 組組名`);
                input.addEventListener('input', () => { g.name = input.value; renderMembers(); });
                row.append(input, button('刪除組別', () => {
                    draft.splice(i, 1);
                    assignments.forEach((a, n) => { assignments[n] = a === i ? -1 : a > i ? a - 1 : a; });
                    renderNames(); renderMembers();
                }));
                row.append(el('span', 'ge-count'));
                names.append(row);
            });
        }
        const add = button('＋ 新增組別', () => {
            draft.push({ id: Date.now() + draft.length, name: `第 ${draft.length + 1} 組`, members: [], score: 0 });
            renderNames(); renderMembers();
        });
        add.className = 'ge-add';
        const actions = el('div', 'ge-actions');
        const discardPrompt = el('div', 'ge-discard');
        discardPrompt.hidden = true;
        discardPrompt.setAttribute('role', 'alert');
        const keepEditing = button('繼續編輯', () => { discardPrompt.hidden = true; cancel.focus(); });
        const discard = button('放棄修改', () => dialog.close());
        discardPrompt.append(el('p', '', '分組尚未儲存，要放棄修改嗎？'), keepEditing, discard);
        const requestClose = () => { if (isDirty()) { discardPrompt.hidden = false; keepEditing.focus(); } else dialog.close(); };
        const cancel = button('取消', requestClose);
        const save = button('儲存分組', () => {
            if (key !== (window.GROUPS_KEY || 'groups') || classIdAtOpen !== localStorage.getItem('currentClassId') ||
                original !== JSON.stringify(getGroups()) || roster !== JSON.stringify(getStudents()) || stored !== localStorage.getItem(key)) {
                alert('班級或資料已變更，請取消後重新開啟編輯，避免覆蓋新資料。'); return;
            }
            if (!draft.length || blocking()) {
                alert('請建立組別，並為每位學生選擇組別後再儲存。'); return;
            }
            if (draft.some(g => !String(g.name || '').trim())) { alert('請填寫每個組別的名稱。'); return; }
            const next = draft.map((g, i) => {
                const out = { ...g, name: g.name.trim(), members: studentsAtOpen.filter((student, n) => assignments[n] === i) };
                if (out.leaderId != null && !out.members.some(m => sameId(m.id, out.leaderId))) delete out.leaderId;
                return out;
            });
            try {
                localStorage.setItem(key, JSON.stringify(next));
            } catch (error) {
                alert('儲存失敗，請確認儲存空間後重試；編輯內容仍保留。'); return;
            }
            setGroups(next);
            saved = true;
            undoCtx = null;
            window.renderGroups();
            dialog.close();
            if (typeof NotificationSystem !== 'undefined') NotificationSystem.success('已存本機');
        });
        save.className = 'ge-save';
        actions.append(cancel, save);
        const header = el('header', 'ge-header');
        header.append(heading, hint);
        const body = el('div', 'ge-body');
        body.append(el('h4', 'ge-section-title', '① 設定組別'), names, add, el('h4', 'ge-section-title', '② 分配學生'), members);
        const footer = el('footer', 'ge-footer');
        footer.append(status, discardPrompt, actions);
        dialog.append(header, body, footer);
        const warnUnload = e => {
            if (window.LeaveSyncGuard?.isInternalNavigation?.()) return;
            if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
        };
        window.addEventListener('beforeunload', warnUnload);
        dialog.addEventListener('cancel', e => { e.preventDefault(); requestClose(); });
        dialog.addEventListener('close', () => {
            window.removeEventListener('beforeunload', warnUnload);
            dialog.remove();
            const back = opener && opener.isConnected ? opener : $('groupingToolbar')?.querySelector('[data-gp="edit"]');
            back?.focus();
        });
        document.body.append(dialog);
        renderNames(); renderMembers();
        dialog.showModal();
    }

    // ---------- 提示（可帶「復原」按鈕） ----------
    function toast(message, action, duration = 3500) {
        let box = $('gpToast');
        if (!box) {
            box = el('div', 'gp-toast');
            box.id = 'gpToast';
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
        box.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(hideToast, duration);
    }
    function hideToast() {
        clearTimeout(toastTimer);
        const box = $('gpToast');
        if (box) box.remove();
    }

    // ---------- 初始化 ----------
    function init() {
        injectStyles();
        const section = $('grouping-section');
        if (!section) return;
        loadPrefs();
        absent = loadAbsent();
        const input = $('groupingValue');
        if (input) input.value = memo[state.method] || DEFAULTS[state.method];
        const anim = $('groupingAnimToggle');
        if (anim) {
            anim.checked = state.anim;
            anim.addEventListener('change', () => { state.anim = anim.checked; savePrefs(); });
        }

        // 分段切換：點擊與左右方向鍵
        section.querySelectorAll('.gp-seg [data-method]').forEach(b => {
            b.addEventListener('click', () => selectMethod(b.dataset.method));
            b.addEventListener('keydown', e => {
                if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                    e.preventDefault();
                    selectMethod(state.method === 'byGroupCount' ? 'byMemberCount' : 'byGroupCount', true);
                }
            });
        });
        $('groupingMinus')?.addEventListener('click', () => {
            const v = readValue();
            setValue(Math.max(1, (isNaN(v) ? DEFAULTS[state.method] : v) - 1));
        });
        $('groupingPlus')?.addEventListener('click', () => {
            const v = readValue();
            const n = participants().length;
            setValue(Math.min(Math.max(n, 1), (isNaN(v) ? 0 : v) + 1));
        });
        if (input) {
            input.addEventListener('input', updatePreview);
            input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); startFlow(); } });
        }
        $('groupingAbsentAll')?.addEventListener('click', () => {
            absent.clear();
            saveAbsent();
            renderAbsentList();
            afterParticipantsChange();
        });
        if (absent.size) $('groupingAbsent')?.setAttribute('open', '');

        // 主按鈕：拿掉備援用的 onclick，改走新流程
        const start = $('groupingStartBtn');
        if (start) {
            start.removeAttribute('onclick');
            start.addEventListener('click', () => startFlow());
        }

        // 結果工具列
        $('groupingToolbar')?.addEventListener('click', e => {
            const b = e.target.closest('[data-gp]');
            if (!b || state.busy) return;
            const actions = {
                regroup: () => startFlow(),
                project: () => openProjection(b),
                leaders: pickAllLeaders,
                copy: copyResult,
                edit: () => openGroupEditor(b),
                export: exportGroups
            };
            actions[b.dataset.gp]?.();
        });

        // 每次打開「隨機分組」都重新整理名單（學生可能剛新增或刪除）
        new MutationObserver(() => {
            if (!section.classList.contains('hidden')) { refreshSettings(); renderResult(); }
        }).observe(section, { attributes: true, attributeFilter: ['class'] });

        refreshSettings();
        renderResult();
        console.log('🧩 分組增強模組 v2 已載入');
    }

    // 覆蓋原有的 renderGroups（加扣分、清除資料、還原等流程都會呼叫它）
    window.renderGroups = function () { renderResult(); };
    window.renderGroupsEnhanced = window.renderGroups;
    window.startGroupingWithAnimation = () => startFlow();
    window.GroupingUI = { start: startFlow, project: openProjection, closeProjection, edit: openGroupEditor, copyText: resultText };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
