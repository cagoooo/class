/**
 * 聯絡簿增強模組 v3
 *
 * 以「一天」為單位：上方切換日期（今天／明天／◀ ▶），左邊新增、右邊是這天的編號清單。
 * - 新增：一行一項（自動去掉 1. ① • 之類的編號），也可「整段當成一則」；Ctrl＋Enter 送出；
 *         常用語點一下加一行（可自訂，存這台電腦）；長篇範本；「↻ 沿用上一次」把前一天的事項帶進輸入框。
 * - 每則：✏️ 原地編輯（同一個 id、同一個位置）、▲▼ 調整順序（只在同一天內）、📋 複製、🗑 刪除可復原。
 * - 「📋 複製這天」產生可貼到 LINE 的純文字；「📺 投影這天」只投影選定日期，字級自動放大、可 ◀ ▶ 換日。
 * - 其他日期依日期分組、可搜尋、可只看重要。
 *
 * 資料相容：沿用 notebookEntries 陣列與欄位（id 數字、date YYYY-MM-DD、type、content、timestamp、priority 選填），
 * 只新增選填的 updatedAt；所有寫入走 SafeStorage；繪製時不把預設值寫回資料。內容一律以 textContent 顯示。
 */
(function () {
    'use strict';

    const TYPES = {
        homework: { name: '作業', icon: '📚', hue: 217 },
        exam: { name: '考試', icon: '📝', hue: 0 },
        activity: { name: '活動', icon: '🎉', hue: 142, dark: true },
        notice: { name: '通知', icon: '📢', hue: 38, dark: true },
        other: { name: '其他', icon: '📌', hue: 215 }
    };
    const PHRASES_KEY = 'notebookPhrases';
    const DEFAULT_PHRASES = ['國語習作 p.', '數學習作 p.', '圈詞抄寫', '訂正考卷', '家長簽名', '明天小考：', '請帶 ', '穿運動服'];
    const LAST_TYPE_KEY = 'notebookLastType';
    const PROJ_KEY = 'notebookProjection';
    const UNDO_MS = 8000;

    // 長篇範本（沿用舊版內容；整段當成一則）
    const NOTEBOOK_TEMPLATES = {
        homework: { name: '📚 今日作業', type: 'homework', content: '【今日作業】\n\n國語：\n數學：\n英語：\n其他：\n\n※ 請家長簽名確認' },
        weekend: { name: '🏠 週末通知', type: 'notice', content: '【週末通知】\n\n📅 週末愉快！\n\n本週作業：\n1. \n2. \n3. \n\n下週注意事項：\n• \n\n祝 週末愉快！' },
        exam: { name: '📝 考試提醒', type: 'exam', content: '【考試提醒】\n\n📅 考試日期：\n📖 考試科目：\n📚 考試範圍：\n\n準備事項：\n✅ \n✅ \n✅ \n\n加油！祝考試順利！' },
        activity: { name: '🎉 活動通知', type: 'activity', content: '【活動通知】\n\n📅 活動日期：\n🕐 活動時間：\n📍 活動地點：\n🎯 活動內容：\n\n需準備物品：\n• \n• \n\n注意事項：\n1. \n2. ' },
        meeting: { name: '👨‍👩‍👧 家長會通知', type: 'notice', content: '【家長會通知】\n\n敬愛的家長您好：\n\n📅 日期：\n🕐 時間：\n📍 地點：\n📋 議程：\n\n請務必撥冗出席，謝謝！\n\n敬祝 順心' }
    };

    const state = {
        view: null,            // 正在看的日期 YYYY-MM-DD
        followToday: true,     // 沒手動換日期時，跨日自動跟著今天
        type: 'homework',
        important: false,
        editingId: null,
        editDraft: null,       // 編輯到一半的內容（清單重畫時不能被原文蓋掉）
        search: '',
        onlyImportant: false,
        phraseEditing: false,
        flashIds: new Set()
    };
    let phrases = null;
    let proj = null;
    let toastTimer = null;

    // ---------- 小工具 ----------
    const $ = id => document.getElementById(id);
    function el(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text != null) node.textContent = text;
        return node;
    }
    function btn(cls, text, handler, label) {
        const b = el('button', cls, text);
        b.type = 'button';
        if (label) { b.setAttribute('aria-label', label); b.title = label; }
        if (handler) b.addEventListener('click', handler);
        return b;
    }
    const pad = n => String(n).padStart(2, '0');
    function dateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
    function todayStr() { return dateStr(new Date()); }
    function parseDay(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
        return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
    }
    function addDays(s, n) {
        const d = parseDay(s) || new Date();
        d.setDate(d.getDate() + n);
        return dateStr(d);
    }
    function dayLabel(s) {
        const d = parseDay(s);
        return d ? `${d.getMonth() + 1}/${d.getDate()}（${'日一二三四五六'[d.getDay()]}）` : String(s || '');
    }
    function relLabel(s) {
        const d = parseDay(s);
        if (!d) return '';
        const diff = Math.round((d - parseDay(todayStr())) / 86400000);
        return { '-2': '前天', '-1': '昨天', 0: '今天', 1: '明天', 2: '後天' }[diff] || '';
    }
    const typeOf = e => TYPES[e && e.type] ? e.type : 'other';
    const isImportant = e => e && e.priority === 'high';
    function entries() {
        if (!Array.isArray(window.notebookEntries)) window.notebookEntries = [];
        return window.notebookEntries;
    }
    function save(context, rollback) {
        try {
            if (window.SafeStorage) return !!SafeStorage.set('notebookEntries', JSON.stringify(entries()), { context, rollback });
            localStorage.setItem('notebookEntries', JSON.stringify(entries()));
            return true;
        } catch (e) {
            if (typeof rollback === 'function') rollback();
            return false;
        }
    }
    function nextIds(count) {
        const maxId = entries().reduce((m, e) => Math.max(m, Number(e && e.id) || 0), 0);
        const base = Math.max(Date.now(), maxId + 1);
        return Array.from({ length: count }, (_, i) => base + i);
    }
    // 去掉行首編號：1. 1、 (1) ① 一、 • - *
    function stripNumber(line) {
        // 「10.15 校外教學」「1.5 公升」「5、6 號值日」的數字不是編號：符號後面緊接數字就不去掉
        return line.replace(/^\s*(?:\(?\d{1,2}[\.\)、．](?!\d)|\(\d{1,2}\)|[①-⑳]|[一二三四五六七八九十]{1,3}[、．](?![\d一二三四五六七八九十])|[•·‧]|[\-\*](?=\s))\s*/, '').trim();
    }
    function splitLines(text) {
        return String(text || '').split(/\r?\n/).map(stripNumber).filter(Boolean);
    }
    function dayEntries(day) {
        return entries().filter(e => e && e.date === day);
    }
    function play(fnName) {
        try { if (typeof window[fnName] === 'function') window[fnName](); } catch (e) { /* 音效失敗不影響 */ }
    }

    // ---------- 樣式 ----------
    function injectStyles() {
        if ($('notebook-v3-styles')) return;
        const style = document.createElement('style');
        style.id = 'notebook-v3-styles';
        style.textContent = `
            .nb-scope [hidden] { display:none !important; }
            #notebook-section #notebookList { max-height:none; overflow:visible; }
            .nb-daybar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; margin-bottom:14px; padding:10px 12px; border-radius:16px; background:#fffbeb; border:1px solid #fde68a; }
            .nb-daynav { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
            .nb-daynav .nb-arrow { width:44px; height:44px; border-radius:12px; border:1px solid #fcd34d; background:#fff; font-size:18px; font-weight:800; color:#92400e; cursor:pointer; }
            .nb-daytitle { display:flex; align-items:baseline; gap:6px; min-width:9.5em; justify-content:center; }
            .nb-daytitle b { font-size:22px; font-weight:900; color:#78350f; }
            .nb-tag { font-size:13px; font-weight:800; padding:2px 10px; border-radius:999px; background:#f59e0b; color:#1f2937; }
            .nb-tag:empty { display:none; }
            .nb-daynav input[type="date"] { height:40px; padding:0 8px; border:1px solid #fcd34d; border-radius:10px; background:#fff; font-size:14px; }
            .nb-chip { min-height:36px; padding:4px 12px; border-radius:999px; border:1px solid #fcd34d; background:#fff; color:#92400e; font-size:14px; font-weight:700; cursor:pointer; }
            .nb-chip[aria-pressed="true"] { background:#f59e0b; border-color:#f59e0b; color:#1f2937; }
            .nb-dayactions { display:flex; flex-wrap:wrap; gap:8px; }
            .nb-action { min-height:42px; padding:6px 14px; border-radius:12px; border:1px solid #cbd5e1; background:#fff; color:#334155; font-size:14px; font-weight:800; cursor:pointer; }
            .nb-action:hover { background:#f8fafc; }
            .nb-action.nb-proj-btn { background:#4f46e5; border-color:#4f46e5; color:#fff; }
            .nb-layout { display:flex; flex-direction:column; gap:16px; }
            .nb-layout .nb-day { order:-1; }   /* 手機：先看這天的清單，新增區在下面 */
            .nb-card { min-width:0; padding:14px; border-radius:16px; border:1px solid #e2e8f0; background:#f8fafc; }
            .nb-card h3 { margin:0; font-size:17px; font-weight:800; color:#1e293b; }
            .nb-head { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; }
            .nb-sub { margin:10px 0 6px; font-size:13px; font-weight:700; color:#64748b; display:flex; align-items:center; justify-content:space-between; gap:8px; }
            .nb-types { display:flex; flex-wrap:wrap; gap:6px; }
            .nb-type { --h:217; min-height:38px; padding:4px 12px; border-radius:999px; border:2px solid hsl(var(--h) 70% 80%); background:#fff; color:#334155; font-size:14px; font-weight:700; cursor:pointer; }
            .nb-type[aria-checked="true"] { background:hsl(var(--h) 75% 45%); border-color:hsl(var(--h) 75% 45%); color:#fff; }
            .nb-type.nb-darktext[aria-checked="true"], .nb-item.nb-darktext .nb-num { color:#1f2937; }
            .nb-star { display:inline-flex; align-items:center; gap:6px; margin-top:8px; font-size:14px; font-weight:700; color:#92400e; cursor:pointer; user-select:none; }
            .nb-star input { width:18px; height:18px; accent-color:#f59e0b; }
            .nb-phrases { display:flex; flex-wrap:wrap; gap:6px; }
            .nb-phrase { min-height:34px; padding:3px 12px; border-radius:999px; border:1px dashed #94a3b8; background:#fff; color:#334155; font-size:14px; cursor:pointer; }
            .nb-phrase:hover { border-style:solid; border-color:#f59e0b; background:#fffbeb; }
            .nb-link { border:0; background:none; padding:4px; min-height:32px; font-size:13px; font-weight:700; color:#2563eb; cursor:pointer; }
            .nb-phrase-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:6px; margin-bottom:6px; }
            .nb-phrase-row input { min-width:0; height:38px; padding:0 10px; border:1px solid #cbd5e1; border-radius:10px; font-size:15px; }
            .nb-phrase-row button, .nb-phrase-actions button { min-height:38px; padding:4px 12px; border-radius:10px; border:1px solid #cbd5e1; background:#fff; font-size:14px; font-weight:700; cursor:pointer; }
            .nb-phrase-actions { display:flex; flex-wrap:wrap; gap:6px; }
            #notebook-section #notebookContent { width:100%; margin-top:10px; padding:10px 12px; border:1px solid #cbd5e1; border-radius:12px; font-size:16px; line-height:1.6; resize:vertical; background:#fff; }
            #notebook-section #notebookContent.nb-big { min-height:60vh; }
            .nb-addopts { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; margin:8px 0 10px; font-size:14px; color:#475569; }
            .nb-addopts label { display:inline-flex; align-items:center; gap:6px; cursor:pointer; }
            .nb-addopts select { height:38px; border:1px solid #cbd5e1; border-radius:10px; padding:0 8px; background:#fff; font-size:14px; }
            .nb-addopts .nb-small { min-height:38px; padding:4px 12px; border-radius:10px; border:1px solid #cbd5e1; background:#fff; font-size:14px; font-weight:700; cursor:pointer; }
            #notebook-section .nb-add-btn { width:100%; min-height:48px; border:0; border-radius:12px; background:#f59e0b; color:#1f2937; font-size:17px; font-weight:900; cursor:pointer; }
            #notebook-section .nb-add-btn:hover { background:#d97706; }
            .nb-hint { margin:6px 0 0; font-size:12px; color:#64748b; }
            .nb-list { display:flex; flex-direction:column; gap:8px; }
            .nb-item { --h:217; display:grid; grid-template-columns:auto minmax(0,1fr); gap:4px 12px; padding:10px 12px; border-radius:14px; background:#fff; border:1px solid #e2e8f0; border-left:6px solid hsl(var(--h) 70% 50%); }
            .nb-item.nb-important { box-shadow:0 0 0 2px #fcd34d; }
            .nb-item.nb-flash { animation:nbFlash 1.4s ease-out; }
            .nb-num { grid-row:span 2; align-self:start; min-width:2em; height:2em; border-radius:999px; background:hsl(var(--h) 75% 45%); color:#fff; font-size:15px; font-weight:900; display:flex; align-items:center; justify-content:center; }
            .nb-meta { display:flex; flex-wrap:wrap; align-items:center; gap:6px; font-size:12px; font-weight:800; color:hsl(var(--h) 60% 35%); }
            .nb-meta .nb-imp { color:#b45309; }
            .nb-text { font-size:17px; line-height:1.55; color:#1f2937; white-space:pre-wrap; overflow-wrap:anywhere; }
            .nb-tools { grid-column:2; display:flex; flex-wrap:wrap; gap:4px; }
            .nb-tool { min-height:34px; min-width:34px; padding:2px 10px; border-radius:10px; border:1px solid #e2e8f0; background:#fff; color:#475569; font-size:13px; font-weight:700; cursor:pointer; }
            .nb-tool:hover { background:#f1f5f9; }
            .nb-tool:disabled { opacity:.35; cursor:not-allowed; }
            .nb-tool.nb-del:hover { background:#fef2f2; color:#b91c1c; border-color:#fca5a5; }
            .nb-edit { grid-column:2; display:flex; flex-direction:column; gap:8px; }
            .nb-edit textarea { width:100%; min-height:90px; padding:8px 10px; border:2px solid hsl(var(--h) 70% 50%); border-radius:10px; font-size:16px; line-height:1.5; }
            .nb-edit-row { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; font-size:14px; }
            .nb-edit-row input[type="date"], .nb-edit-row select { height:38px; padding:0 8px; border:1px solid #cbd5e1; border-radius:10px; font-size:14px; background:#fff; }
            .nb-edit-row .nb-save { min-height:40px; padding:4px 16px; border:0; border-radius:10px; background:#2563eb; color:#fff; font-weight:800; cursor:pointer; }
            .nb-edit-row .nb-cancel { min-height:40px; padding:4px 14px; border:1px solid #cbd5e1; border-radius:10px; background:#fff; font-weight:700; cursor:pointer; }
            .nb-empty { padding:24px 12px; text-align:center; color:#64748b; border:2px dashed #e2e8f0; border-radius:14px; font-size:15px; }
            .nb-history-tools { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; }
            .nb-history-tools input[type="search"] { min-width:0; flex:1 1 180px; height:40px; padding:0 12px; border:1px solid #cbd5e1; border-radius:10px; font-size:15px; background:#fff; }
            .nb-history-tools label { display:inline-flex; align-items:center; gap:6px; font-size:14px; color:#475569; cursor:pointer; }
            .nb-group { border:1px solid #e2e8f0; border-radius:12px; background:#fff; margin-bottom:8px; }
            .nb-group summary { list-style:none; cursor:pointer; display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; padding:8px 12px; min-height:44px; }
            .nb-group summary::-webkit-details-marker { display:none; }
            .nb-group summary::before { content:'▸'; color:#94a3b8; transition:transform .15s; }
            .nb-group[open] summary::before { transform:rotate(90deg); }
            .nb-group summary b { color:#1e293b; }
            .nb-group summary .nb-count { color:#64748b; font-size:13px; flex:1; }
            .nb-group summary button { min-height:32px; padding:2px 10px; border-radius:999px; border:1px solid #cbd5e1; background:#fff; font-size:13px; font-weight:700; cursor:pointer; }
            .nb-group ol { margin:0; padding:0 14px 10px 38px; }
            .nb-group li { padding:3px 0; font-size:15px; color:#334155; white-space:pre-wrap; overflow-wrap:anywhere; }
            .nb-more { text-align:center; font-size:13px; color:#64748b; margin-top:6px; }
            .nb-toast { position:fixed; left:50%; bottom:24px; transform:translateX(-50%); z-index:100001; max-width:min(560px,92vw); display:flex; align-items:center; gap:14px; padding:11px 16px; border-radius:14px; background:#0f172a; color:#fff; font-size:14px; line-height:1.45; box-shadow:0 10px 30px rgba(0,0,0,.35); }
            .nb-toast button { flex:none; border:0; background:none; color:#fcd34d; font-size:14px; font-weight:800; padding:4px 6px; min-height:32px; cursor:pointer; }
            .nb-shake { animation:nbShake .3s; }
            @keyframes nbFlash { 0% { background:#fef3c7; } 100% { background:#fff; } }
            @keyframes nbShake { 0%,100% { transform:translateX(0); } 25% { transform:translateX(-6px); } 75% { transform:translateX(6px); } }
            .nb-scope :is(button,input,select,textarea,summary):focus-visible { outline:3px solid #fcd34d; outline-offset:2px; }

            .nb-proj { position:fixed; inset:0; z-index:10001; display:flex; flex-direction:column; background:#0f172a; color:#f8fafc; }
            .nb-proj.nb-light { background:#fffbeb; color:#1f2937; }
            .nb-proj-bar { flex:none; display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; padding:10px 16px; background:rgba(0,0,0,.3); }
            .nb-proj.nb-light .nb-proj-bar { background:#fde68a; }
            .nb-proj-title { flex:1 1 220px; min-width:0; display:flex; align-items:baseline; gap:10px; font-size:clamp(20px,3.4vh,36px); font-weight:900; }
            .nb-proj-title small { font-size:.6em; padding:2px 10px; border-radius:999px; background:#f59e0b; color:#1f2937; }
            .nb-proj-clock { font-size:clamp(16px,2.6vh,28px); font-weight:800; font-variant-numeric:tabular-nums; opacity:.85; }
            .nb-proj-bar button { min-height:42px; min-width:42px; padding:4px 12px; border-radius:10px; border:1px solid rgba(255,255,255,.35); background:rgba(255,255,255,.12); color:inherit; font-size:16px; font-weight:800; cursor:pointer; }
            .nb-proj.nb-light .nb-proj-bar button { border-color:rgba(0,0,0,.2); background:#fff; }
            .nb-proj-bar button:focus-visible { outline:3px solid #fde68a; outline-offset:2px; }
            .nb-proj-body { flex:1; min-height:0; overflow:auto; padding:2vh 4vw; }
            .nb-proj-list { margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:1.2vh; font-size:var(--nb-size,56px); line-height:1.35; }
            .nb-proj-list li { --h:217; display:grid; grid-template-columns:auto minmax(0,1fr); gap:.4em; align-items:baseline; padding:.25em .4em; border-left:.18em solid hsl(var(--h) 75% 55%); border-radius:.2em; background:rgba(255,255,255,.04); }
            .nb-proj.nb-light .nb-proj-list li { background:#fff; }
            .nb-proj-list .nb-pnum { font-weight:900; color:hsl(var(--h) 85% 70%); }
            .nb-proj.nb-light .nb-proj-list .nb-pnum { color:hsl(var(--h) 75% 30%); }
            .nb-proj-list .nb-ptext { white-space:pre-wrap; overflow-wrap:anywhere; font-weight:700; }
            .nb-proj-list .nb-ptype { font-size:.45em; font-weight:800; opacity:.75; margin-right:.4em; vertical-align:middle; }
            .nb-proj-empty { margin-top:20vh; text-align:center; font-size:5vh; opacity:.7; }
            body.nb-proj-open { overflow:hidden; }

            @media (min-width: 1024px) {
                .nb-layout { display:grid; grid-template-columns:minmax(320px,5fr) minmax(0,7fr); align-items:start; }
                .nb-layout .nb-day { order:0; }
            }
            @media (max-width: 640px) {
                .nb-daytitle b { font-size:19px; }
                .nb-dayactions { width:100%; }
                .nb-dayactions .nb-action { flex:1 1 auto; }
            }

            .dark .nb-daybar { background:#292524; border-color:#78350f; }
            .dark .nb-daytitle b { color:#fde68a; }
            .dark .nb-daynav .nb-arrow, .dark .nb-chip, .dark .nb-daynav input[type="date"] { background:#1c1917; border-color:#78350f; color:#fde68a; }
            .dark .nb-chip[aria-pressed="true"] { background:#f59e0b; color:#1f2937; }
            .dark .nb-card { background:#1e293b; border-color:#334155; }
            .dark .nb-card h3 { color:#f1f5f9; }
            .dark .nb-sub, .dark .nb-addopts, .dark .nb-history-tools label { color:#cbd5e1; }
            .dark .nb-type, .dark .nb-phrase, .dark .nb-action, .dark .nb-tool, .dark .nb-addopts .nb-small, .dark .nb-phrase-row button, .dark .nb-phrase-actions button, .dark .nb-group summary button, .dark .nb-edit-row .nb-cancel { background:#0f172a; color:#e2e8f0; border-color:#475569; }
            .dark .nb-action.nb-proj-btn { background:#4f46e5; border-color:#4f46e5; color:#fff; }
            .dark .nb-type[aria-checked="true"] { background:hsl(var(--h) 70% 40%); color:#fff; }
            .dark .nb-star { color:#fcd34d; }
            .dark .nb-item, .dark .nb-group { background:#0f172a; border-color:#334155; }
            .dark .nb-item { border-left-color:hsl(var(--h) 70% 55%); }
            .dark .nb-text, .dark .nb-group li { color:#f1f5f9; }
            .dark .nb-meta { color:hsl(var(--h) 80% 75%); }
            .dark .nb-meta .nb-imp { color:#fcd34d; }
            .dark .nb-group summary b { color:#f1f5f9; }
            .dark .nb-group summary .nb-count, .dark .nb-hint { color:#94a3b8; }
            .dark .nb-empty { color:#94a3b8; border-color:#334155; }
            .dark .nb-link { color:#93c5fd; }
            @keyframes nbFlashDark { 0% { background:#78350f; } 100% { background:#0f172a; } }
            .dark .nb-item.nb-flash { animation:nbFlashDark 1.4s ease-out; }
            @media (prefers-reduced-motion: reduce) { .nb-item.nb-flash, .nb-shake { animation:none !important; } }
        `;
        document.head.append(style);
    }

    // ---------- 常用語（存這台電腦） ----------
    function loadPhrases() {
        if (phrases) return phrases;
        try {
            const raw = JSON.parse(localStorage.getItem(PHRASES_KEY) || 'null');
            if (Array.isArray(raw)) phrases = raw.map(x => String(x || '').slice(0, 40)).filter(x => x.trim());
        } catch (e) { phrases = null; }
        if (!phrases || !phrases.length) phrases = DEFAULT_PHRASES.slice();
        return phrases;
    }
    function savePhrases() {
        try { localStorage.setItem(PHRASES_KEY, JSON.stringify(phrases)); } catch (e) { /* 只是常用語 */ }
    }

    // ---------- 日期切換 ----------
    function setView(day, { follow } = {}) {
        if (!parseDay(day)) return;
        state.view = day;
        state.followToday = follow != null ? follow : day === todayStr();
        state.editingId = null;
        const input = $('notebookDate');
        if (input) input.value = day;
        renderAll();
    }
    function syncToday() {
        // 分頁跨夜沒關：老師沒手動換過日期，就自動換成今天
        if (state.followToday && state.view !== todayStr()) setView(todayStr(), { follow: true });
    }
    function renderDayBar() {
        const label = $('nbDayLabel'), tag = $('nbDayTag'), target = $('nbAddTarget');
        if (label) label.textContent = dayLabel(state.view);
        if (tag) tag.textContent = relLabel(state.view);
        if (target) target.textContent = `${dayLabel(state.view)}${relLabel(state.view) ? '・' + relLabel(state.view) : ''}`;
        const today = todayStr();
        document.querySelectorAll('#notebook-section [data-nb-jump]').forEach(b => {
            b.setAttribute('aria-pressed', String(addDays(today, Number(b.dataset.nbJump)) === state.view));
        });
        const input = $('notebookDate');
        if (input && input.value !== state.view) input.value = state.view;
    }

    // ---------- 新增區 ----------
    function renderTypes() {
        const box = $('nbTypes');
        if (!box) return;
        box.replaceChildren(...Object.entries(TYPES).map(([key, t]) => {
            const b = btn('nb-type' + (t.dark ? ' nb-darktext' : ''), `${t.icon} ${t.name}`, () => { setType(key); });
            b.setAttribute('role', 'radio');
            b.setAttribute('aria-checked', String(state.type === key));
            b.tabIndex = state.type === key ? 0 : -1;
            b.style.setProperty('--h', t.hue);
            b.dataset.type = key;
            return b;
        }));
        if (!box.dataset.keys) {
            box.dataset.keys = '1';
            box.addEventListener('keydown', e => {
                const keys = Object.keys(TYPES);
                let i = keys.indexOf(state.type);
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') i = (i + 1) % keys.length;
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') i = (i - 1 + keys.length) % keys.length;
                else if (e.key === 'Home') i = 0;
                else if (e.key === 'End') i = keys.length - 1;
                else return;
                e.preventDefault();
                setType(keys[i]);
                box.querySelector(`[data-type="${keys[i]}"]`)?.focus();
            });
        }
    }
    function setType(key, remember = true) {
        if (!TYPES[key]) return;
        state.type = key;
        const select = $('notebookType');
        if (select) select.value = key;
        if (remember) { try { localStorage.setItem(LAST_TYPE_KEY, key); } catch (e) { /* 偏好 */ } }
        $('nbTypes')?.querySelectorAll('.nb-type').forEach(b => {
            const on = b.dataset.type === key;
            b.setAttribute('aria-checked', String(on));
            b.tabIndex = on ? 0 : -1;
        });
    }
    function renderPhrases() {
        const box = $('nbPhrases'), editor = $('nbPhraseEditor'), edit = $('nbPhraseEdit');
        if (!box || !editor) return;
        box.hidden = state.phraseEditing;
        editor.hidden = !state.phraseEditing;
        if (edit) edit.textContent = state.phraseEditing ? '✓ 完成' : '✏️ 編輯';
        if (!state.phraseEditing) {
            box.replaceChildren(...loadPhrases().map(p => btn('nb-phrase', p, () => appendLine(p), `加入一行：${p}`)));
            return;
        }
        editor.replaceChildren();
        const list = loadPhrases();
        list.forEach((p, i) => {
            const row = el('div', 'nb-phrase-row');
            const input = el('input');
            input.value = p;
            input.maxLength = 40;
            input.setAttribute('aria-label', `常用語 ${i + 1}`);
            input.addEventListener('input', () => { if (input.value.trim()) { list[i] = input.value; savePhrases(); } });
            row.append(input, btn('', '刪除', () => {
                if (list.length <= 1) { toast('至少留一個常用語'); return; }
                const removed = list.splice(i, 1)[0];
                savePhrases();
                renderPhrases();
                toast(`已刪除「${removed}」`, { label: '復原', onClick: () => { list.splice(Math.min(i, list.length), 0, removed); savePhrases(); renderPhrases(); } });
            }));
            editor.append(row);
        });
        const actions = el('div', 'nb-phrase-actions');
        actions.append(
            btn('', '＋ 新增常用語', () => { list.push('新的常用語'); savePhrases(); renderPhrases(); const inputs = editor.querySelectorAll('input'); inputs[inputs.length - 1]?.select(); }),
            btn('', '恢復預設', () => { const before = list.slice(); phrases = DEFAULT_PHRASES.slice(); savePhrases(); renderPhrases(); toast('已恢復預設常用語', { label: '復原', onClick: () => { phrases = before; savePhrases(); renderPhrases(); } }); })
        );
        editor.append(actions, el('p', 'nb-hint', '常用語存在這台電腦。點一下就會在輸入框加一行。'));
    }
    function appendLine(text) {
        const ta = $('notebookContent');
        if (!ta) return;
        const v = ta.value;
        ta.value = v + (v && !v.endsWith('\n') ? '\n' : '') + text;
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
        updateAddButton();
    }
    function updateAddButton() {
        const b = $('nbAddBtn'), ta = $('notebookContent');
        if (!b || !ta) return;
        const whole = $('nbWhole')?.checked;
        const n = whole ? (ta.value.trim() ? 1 : 0) : splitLines(ta.value).length;
        b.textContent = n > 1 ? `新增 ${n} 則到 ${dayLabel(state.view)}` : `新增到 ${dayLabel(state.view)}`;
    }
    function insertPositionFor(day) {
        const list = entries();
        for (let i = list.length - 1; i >= 0; i--) if (list[i] && list[i].date === day) return i + 1;
        return 0;
    }
    function addFromForm() {
        syncToday();
        const ta = $('notebookContent');
        if (!ta) return;
        const whole = $('nbWhole')?.checked;
        const contents = whole ? (ta.value.trim() ? [ta.value.trim()] : []) : splitLines(ta.value);
        if (!contents.length) {
            ta.classList.remove('nb-shake'); void ta.offsetWidth; ta.classList.add('nb-shake');
            ta.focus();
            toast('請先輸入聯絡事項（一行一項）');
            return;
        }
        const day = state.view;
        const ids = nextIds(contents.length);
        const stamp = new Date().toLocaleString('zh-TW', { hour12: false });
        const fresh = contents.map((content, i) => ({ id: ids[i], date: day, type: state.type, content, timestamp: stamp, priority: state.important ? 'high' : 'normal' }));
        const list = entries();
        const at = insertPositionFor(day);
        list.splice(at, 0, ...fresh);
        if (!save('新增聯絡事項', () => { fresh.forEach(e => { const i = list.indexOf(e); if (i >= 0) list.splice(i, 1); }); })) { renderAll(); return; }
        ta.value = '';
        ta.classList.remove('nb-big');
        const wholeBox = $('nbWhole');
        if (wholeBox) wholeBox.checked = false;   // 長篇範本用完就回到一行一項
        const important = $('nbImportant');
        if (important) important.checked = false;
        state.important = false;
        fresh.forEach(e => state.flashIds.add(String(e.id)));
        renderAll();
        play('playAddScoreSound');
        toast(`✅ 已新增 ${fresh.length} 則到 ${dayLabel(day)}${relLabel(day) ? '（' + relLabel(day) + '）' : ''}`);
        const last = $('notebookList')?.querySelector(`.nb-item[data-id="${fresh[fresh.length - 1].id}"]`);
        if (last && last.getBoundingClientRect().top > window.innerHeight) last.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ta.focus();
    }
    function reusePrevious() {
        const prevDays = [...new Set(entries().filter(e => e && e.date && e.date < state.view).map(e => e.date))].sort();
        const day = prevDays[prevDays.length - 1];
        if (!day) { toast('這天之前還沒有聯絡事項可以沿用'); return; }
        const items = dayEntries(day);
        const ta = $('notebookContent');
        if (!ta) return;
        const whole = $('nbWhole');
        if (whole) whole.checked = false;
        const text = items.map(e => String(e.content || '').replace(/\s*\n\s*/g, '／')).join('\n');
        ta.value = ta.value.trim() ? ta.value.replace(/\s*$/, '') + '\n' + text : text;
        ta.focus();
        updateAddButton();
        toast(`已帶入 ${dayLabel(day)} 的 ${items.length} 則，修改後再按「新增」`);
    }
    function applyLongTemplate(key) {
        const tpl = NOTEBOOK_TEMPLATES[key];
        const ta = $('notebookContent');
        if (!tpl || !ta) return;
        const whole = $('nbWhole');
        if (whole) whole.checked = true;
        ta.value = ta.value.trim() ? ta.value.replace(/\s*$/, '') + '\n\n' + tpl.content : tpl.content;
        setType(tpl.type, false);
        ta.focus();
        updateAddButton();
        toast(`已帶入「${tpl.name}」，這段會整段當成一則`);
    }

    // ---------- 這天的清單 ----------
    function renderDayList() {
        injectStyles();
        const box = $('notebookList');
        if (!box) return;
        const items = dayEntries(state.view);
        const count = $('nbDayCount');
        if (count) count.textContent = items.length ? `${items.length} 則` : '';
        const title = $('nbListTitle');
        if (title) title.textContent = `${dayLabel(state.view)}${relLabel(state.view) ? '・' + relLabel(state.view) : ''} 的聯絡簿`;
        box.replaceChildren();
        if (!items.length) {
            const empty = el('div', 'nb-empty');
            empty.append(el('div', '', `${dayLabel(state.view)} 還沒有聯絡事項`), el('div', 'nb-hint', '在旁邊輸入框打字，一行一項，按「新增」就好。'));
            box.append(empty);
            return;
        }
        items.forEach((e, i) => box.append(buildItem(e, i, items.length)));
        state.flashIds.clear();
    }
    function buildItem(e, index, total) {
        const t = TYPES[typeOf(e)];
        const card = el('div', 'notebook-item nb-item' + (isImportant(e) ? ' nb-important' : '') + (state.flashIds.has(String(e.id)) ? ' nb-flash' : '') + (t.dark ? ' nb-darktext' : ''));
        card.dataset.id = String(e.id);
        card.style.setProperty('--h', t.hue);
        card.append(el('span', 'nb-num', String(index + 1)));
        const meta = el('div', 'nb-meta');
        meta.append(el('span', '', `${t.icon} ${t.name}`));
        if (isImportant(e)) meta.append(el('span', 'nb-imp', '⭐ 重要'));
        if (e.updatedAt) meta.append(el('span', 'nb-hint', '（已修改）'));
        card.title = `建立時間：${e.timestamp || ''}`;
        if (String(state.editingId) === String(e.id)) {
            card.append(meta, buildEditor(e));
            return card;
        }
        const main = el('div');
        main.append(meta, el('div', 'nb-text', String(e.content || '')));
        card.append(main);
        const tools = el('div', 'nb-tools');
        const up = btn('nb-tool', '▲', () => move(e, -1), '往上移');
        const down = btn('nb-tool', '▼', () => move(e, 1), '往下移');
        up.disabled = index === 0;
        down.disabled = index === total - 1;
        tools.append(
            btn('nb-tool', '✏️ 編輯', () => { state.editingId = e.id; state.editDraft = null; renderDayList(); $('notebookList')?.querySelector('.nb-edit textarea')?.focus(); }),
            up, down,
            btn('nb-tool', '📋', () => copyText(String(e.content || ''), '已複製這一則'), '複製這一則'),
            btn('nb-tool nb-del', '🗑', () => removeEntry(e), '刪除這一則')
        );
        card.append(tools);
        return card;
    }
    function buildEditor(e) {
        const box = el('div', 'nb-edit');
        const draft = state.editDraft && String(state.editDraft.id) === String(e.id) ? state.editDraft : null;
        const ta = el('textarea');
        ta.value = draft ? draft.content : String(e.content || '');
        ta.setAttribute('aria-label', '修改內容');
        const row = el('div', 'nb-edit-row');
        const type = el('select');
        Object.entries(TYPES).forEach(([key, t]) => type.add(new Option(`${t.icon} ${t.name}`, key)));
        type.value = draft ? draft.type : typeOf(e);
        type.setAttribute('aria-label', '類型');
        const date = el('input');
        date.type = 'date';
        date.value = draft ? draft.date : (e.date || state.view);
        date.setAttribute('aria-label', '日期');
        const impLabel = el('label', 'nb-star');
        const imp = el('input');
        imp.type = 'checkbox';
        imp.checked = draft ? draft.important : isImportant(e);
        impLabel.append(imp, '⭐ 重要');
        const keep = () => { state.editDraft = { id: e.id, content: ta.value, type: type.value, date: date.value, important: imp.checked }; };
        [ta, type, date, imp].forEach(x => { x.addEventListener('input', keep); x.addEventListener('change', keep); });
        const doSave = () => saveEdit(e, { content: ta.value.trim(), type: type.value, date: date.value, important: imp.checked });
        const doCancel = () => { state.editingId = null; state.editDraft = null; renderDayList(); focusCard(e.id, '✏️ 編輯'); };
        row.append(type, date, impLabel, btn('nb-save', '儲存', doSave), btn('nb-cancel', '取消', doCancel));
        ta.addEventListener('keydown', ev => {
            if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); doSave(); }
            else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); doCancel(); }
        });
        box.append(ta, row);
        return box;
    }
    function saveEdit(e, next) {
        if (!next.content) { toast('內容不能是空白；要刪除請按 🗑'); return; }
        if (!parseDay(next.date)) { toast('日期格式不正確'); return; }
        const before = { content: e.content, type: e.type, date: e.date, priority: e.priority, updatedAt: e.updatedAt };
        const had = { priority: Object.prototype.hasOwnProperty.call(e, 'priority'), updatedAt: Object.prototype.hasOwnProperty.call(e, 'updatedAt') };
        const changed = before.content !== next.content || typeOf(e) !== next.type || before.date !== next.date || isImportant(e) !== next.important;
        state.editingId = null;
        state.editDraft = null;
        if (!changed) { renderAll(); focusCard(e.id, '✏️ 編輯'); return; }
        const list = entries();
        const oldIndex = list.indexOf(e);
        e.content = next.content;
        e.type = next.type;
        // 只有「重要」勾選真的改了才動 priority（保留舊資料的 low）
        if (next.important !== isImportant(e)) e.priority = next.important ? 'high' : 'normal';
        e.updatedAt = new Date().toLocaleString('zh-TW', { hour12: false });
        if (before.date !== next.date && oldIndex >= 0) {
            // 改到別天：排在那一天的最後面，跟新增一樣
            list.splice(oldIndex, 1);
            e.date = next.date;
            list.splice(insertPositionFor(next.date), 0, e);
        } else {
            e.date = next.date;
        }
        if (!save('修改聯絡事項', () => {
            e.content = before.content; e.type = before.type; e.date = before.date;
            if (had.priority) e.priority = before.priority; else delete e.priority;
            if (had.updatedAt) e.updatedAt = before.updatedAt; else delete e.updatedAt;
            const now = list.indexOf(e);
            if (now >= 0 && oldIndex >= 0 && now !== oldIndex) { list.splice(now, 1); list.splice(oldIndex, 0, e); }
        })) { renderAll(); return; }
        state.flashIds.add(String(e.id));
        renderAll();
        if (before.date === next.date) focusCard(e.id, '✏️ 編輯');
        toast(before.date !== next.date ? `已修改並移到 ${dayLabel(next.date)}` : '已儲存修改');
    }
    function move(e, dir) {
        const list = entries();
        const idx = list.indexOf(e);
        if (idx < 0) return;
        let j = idx + dir;
        while (j >= 0 && j < list.length && (!list[j] || list[j].date !== e.date)) j += dir;
        if (j < 0 || j >= list.length) return;
        [list[idx], list[j]] = [list[j], list[idx]];
        if (!save('調整聯絡事項順序', () => { [list[idx], list[j]] = [list[j], list[idx]]; })) { renderAll(); return; }
        renderDayList();
        const card = $('notebookList')?.querySelector(`.nb-item[data-id="${e.id}"]`);
        const same = card?.querySelector(dir < 0 ? '.nb-tool[aria-label="往上移"]' : '.nb-tool[aria-label="往下移"]');
        const other = card?.querySelector(dir < 0 ? '.nb-tool[aria-label="往下移"]' : '.nb-tool[aria-label="往上移"]');
        (same && !same.disabled ? same : other && !other.disabled ? other : card?.querySelector('.nb-tool'))?.focus();
    }
    function focusCard(id, label) {
        const card = $('notebookList')?.querySelector(`.nb-item[data-id="${id}"]`);
        if (!card) return;
        const target = [...card.querySelectorAll('.nb-tool')].find(b => b.textContent.includes(label)) || card.querySelector('.nb-tool');
        target?.focus({ preventScroll: true });
    }
    function removeEntry(e) {
        const list = entries();
        const idx = list.indexOf(e);
        if (idx < 0) return;
        const sameDay = dayEntries(e.date);
        const pos = sameDay.indexOf(e);
        const prevSame = pos > 0 ? sameDay[pos - 1] : null;
        const nextSame = sameDay[pos + 1] || null;
        list.splice(idx, 1);
        if (!save('刪除聯絡事項', () => { list.splice(idx, 0, e); })) { renderAll(); return; }
        if (state.editingId != null && String(state.editingId) === String(e.id)) { state.editingId = null; state.editDraft = null; }
        renderAll();
        const neighbor = nextSame || prevSame;
        if (neighbor) focusCard(neighbor.id, '🗑');
        else $('notebookContent')?.focus({ preventScroll: true });
        const preview = String(e.content || '').split('\n')[0].slice(0, 16);
        toast(`已刪除「${preview}${String(e.content || '').length > 16 ? '…' : ''}」`, {
            label: '復原',
            onClick: () => {
                const now = entries();
                if (now.includes(e) || now.some(x => x && String(x.id) === String(e.id))) return;
                // 插回同一天原本的位置：前一則的後面；原本是第一則就插在那天現在的第一則前面
                let at = -1;
                if (prevSame) { const p = now.indexOf(prevSame); if (p >= 0) at = p + 1; }
                else { const first = now.findIndex(x => x && x.date === e.date); if (first >= 0) at = first; }
                if (at < 0) at = insertPositionFor(e.date);
                now.splice(Math.min(at, now.length), 0, e);
                if (save('復原聯絡事項', () => { const i = now.indexOf(e); if (i >= 0) now.splice(i, 1); })) { state.flashIds.add(String(e.id)); renderAll(); toast('已復原'); }
            }
        }, UNDO_MS);
    }

    // ---------- 複製 ----------
    function dayText(day) {
        const items = dayEntries(day);
        const lines = items.map((e, i) => `${i + 1}. ${isImportant(e) ? '⭐ ' : ''}${String(e.content || '').replace(/\n/g, '\n   ')}`);
        return `${dayLabel(day)} 聯絡簿\n${lines.join('\n')}`;
    }
    async function copyText(text, okMessage) {
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
        toast(ok ? `📋 ${okMessage}` : '複製失敗，請手動選取文字');
    }
    function copyDay(day = state.view) {
        if (!dayEntries(day).length) { toast(`${dayLabel(day)} 還沒有聯絡事項`); return; }
        copyText(dayText(day), `已複製 ${dayLabel(day)} 的聯絡簿，可以貼到 LINE`);
    }

    // ---------- 其他日期 ----------
    function renderHistory() {
        const box = $('nbHistory');
        if (!box) return;
        const q = state.search.trim().toLowerCase();
        const matches = e => (!state.onlyImportant || isImportant(e)) && (!q || String(e.content || '').toLowerCase().includes(q));
        const byDay = new Map();
        entries().forEach(e => {
            if (!e || !e.date || !matches(e)) return;
            if (!q && !state.onlyImportant && e.date === state.view) return;
            if (!byDay.has(e.date)) byDay.set(e.date, []);
            byDay.get(e.date).push(e);
        });
        const today = todayStr();
        const days = [...byDay.keys()];
        const upcoming = days.filter(d => d >= today).sort();
        const past = days.filter(d => d < today).sort().reverse();
        const ordered = upcoming.concat(past);
        box.replaceChildren();
        if (!ordered.length) {
            box.append(el('div', 'nb-empty', q || state.onlyImportant ? '找不到符合的聯絡事項' : '其他日期還沒有聯絡事項'));
            return;
        }
        const LIMIT = 40;
        ordered.slice(0, LIMIT).forEach(day => {
            const items = byDay.get(day);
            const group = el('details', 'nb-group');
            group.open = !!q || state.onlyImportant || day >= today;
            const summary = el('summary');
            summary.append(el('b', '', `${dayLabel(day)}${relLabel(day) ? '・' + relLabel(day) : ''}`), el('span', 'nb-count', `${items.length} 則`));
            const view = btn('', '查看這天', ev => { ev.preventDefault(); setView(day, { follow: day === today }); $('notebook-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
            const copy = btn('', '📋', ev => { ev.preventDefault(); copyDay(day); }, `複製 ${dayLabel(day)}`);
            summary.append(view, copy);
            const ol = el('ol');
            items.forEach(e => ol.append(el('li', '', `${isImportant(e) ? '⭐ ' : ''}${TYPES[typeOf(e)].icon} ${String(e.content || '')}`)));
            group.append(summary, ol);
            box.append(group);
        });
        if (ordered.length > LIMIT) box.append(el('div', 'nb-more', `只列出最近 ${LIMIT} 天；可以用搜尋找更早的事項。`));
    }

    function renderAll() {
        injectStyles();
        if (!state.view) state.view = todayStr();
        renderDayBar();
        renderDayList();
        renderHistory();
        updateAddButton();
        if (proj) renderProjection();
    }

    // ---------- 投影這天 ----------
    function loadProjPrefs() {
        try { return { scale: 1, light: false, ...(JSON.parse(localStorage.getItem(PROJ_KEY) || '{}') || {}) }; }
        catch (e) { return { scale: 1, light: false }; }
    }
    function saveProjPrefs(p) {
        try { localStorage.setItem(PROJ_KEY, JSON.stringify(p)); } catch (e) { /* 偏好 */ }
    }
    function openProjection(opener) {
        if (proj) return;
        injectStyles();
        const prefs = loadProjPrefs();
        const root = el('div', 'nb-proj' + (prefs.light ? ' nb-light' : ''));
        root.id = 'notebook-presentation-modal';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', '投影聯絡簿');
        const bar = el('div', 'nb-proj-bar');
        const title = el('div', 'nb-proj-title');
        const clock = el('div', 'nb-proj-clock');
        const prev = btn('', '◀', () => setView(addDays(state.view, -1)), '前一天');
        const next = btn('', '▶', () => setView(addDays(state.view, 1)), '後一天');
        const smaller = btn('', 'A−', () => scaleBy(-0.1), '字小一點');
        const bigger = btn('', 'A＋', () => scaleBy(0.1), '字大一點');
        const theme = btn('', prefs.light ? '🌙' : '☀️', () => {
            const p = loadProjPrefs(); p.light = !p.light; saveProjPrefs(p);
            root.classList.toggle('nb-light', p.light);
            theme.textContent = p.light ? '🌙' : '☀️';
        }, '切換深淺色');
        const copy = btn('', '📋', () => copyDay(), '複製這天');
        const close = btn('', '✕ 關閉', closeProjection, '關閉投影');
        bar.append(title, clock, prev, next, smaller, bigger, theme, copy, close);
        const body = el('div', 'nb-proj-body');
        root.append(bar, body);
        document.body.append(root);
        const tick = () => { const d = new Date(); clock.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
        tick();
        proj = { root, title, body, opener, timer: setInterval(tick, 15000), raf: 0 };
        document.body.classList.add('nb-proj-open');
        document.addEventListener('keydown', onProjKey, true);
        window.addEventListener('resize', onProjResize);
        root.tabIndex = -1;
        renderProjection();
        root.focus({ preventScroll: true });
    }
    function closeProjection() {
        if (!proj) return;
        const { root, opener, timer } = proj;
        clearInterval(timer);
        cancelAnimationFrame(proj.raf);
        proj = null;
        document.removeEventListener('keydown', onProjKey, true);
        window.removeEventListener('resize', onProjResize);
        document.body.classList.remove('nb-proj-open');
        root.remove();
        if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    }
    function scaleBy(d) {
        const p = loadProjPrefs();
        p.scale = Math.min(1.8, Math.max(0.5, Math.round(((Number(p.scale) || 1) + d) * 10) / 10));
        saveProjPrefs(p);
        fitProjection();
    }
    function onProjResize() {
        if (!proj) return;
        cancelAnimationFrame(proj.raf);
        proj.raf = requestAnimationFrame(fitProjection);
    }
    function onProjKey(e) {
        if (!proj) return;
        e.stopPropagation();   // 投影時不要觸發全站快捷鍵（空白鍵開計時器、數字鍵換頁…）
        if (e.key === 'Tab') {
            // 焦點只在投影的按鈕之間循環，不會跑到被遮住的頁面
            const focusables = [...proj.root.querySelectorAll('button')];
            if (!focusables.length) return;
            const i = focusables.indexOf(document.activeElement);
            const nextIndex = e.shiftKey ? (i <= 0 ? focusables.length - 1 : i - 1) : (i < 0 || i >= focusables.length - 1 ? 0 : i + 1);
            e.preventDefault();
            focusables[nextIndex].focus();
            return;
        }
        if (e.key === 'Escape') { e.preventDefault(); closeProjection(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); setView(addDays(state.view, -1)); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); setView(addDays(state.view, 1)); }
        else if (e.key === '+' || e.key === '=') { e.preventDefault(); scaleBy(0.1); }
        else if (e.key === '-' || e.key === '_') { e.preventDefault(); scaleBy(-0.1); }
        else if (e.key === ' ' || e.key === 'PageDown' || e.key === 'ArrowDown') { e.preventDefault(); proj.body.scrollBy({ top: proj.body.clientHeight * 0.8, behavior: 'smooth' }); }
        else if (e.key === 'PageUp' || e.key === 'ArrowUp') { e.preventDefault(); proj.body.scrollBy({ top: -proj.body.clientHeight * 0.8, behavior: 'smooth' }); }
    }
    function renderProjection() {
        if (!proj) return;
        proj.title.replaceChildren(`📝 ${dayLabel(state.view)} 聯絡簿`);
        if (relLabel(state.view)) proj.title.append(el('small', '', relLabel(state.view)));
        const items = dayEntries(state.view);
        proj.body.replaceChildren();
        if (!items.length) {
            proj.body.append(el('div', 'nb-proj-empty', `${dayLabel(state.view)} 還沒有聯絡事項`));
            return;
        }
        const ol = el('ol', 'nb-proj-list');
        items.forEach((e, i) => {
            const t = TYPES[typeOf(e)];
            const li = el('li');
            li.style.setProperty('--h', t.hue);
            const text = el('span', 'nb-ptext');
            text.append(el('span', 'nb-ptype', `${t.icon}${isImportant(e) ? ' ⭐' : ''}`), String(e.content || ''));
            li.append(el('span', 'nb-pnum', `${i + 1}.`), text);
            ol.append(li);
        });
        proj.body.append(ol);
        proj.body.scrollTop = 0;
        fitProjection();
    }
    function fitProjection() {
        if (!proj) return;
        const list = proj.body.querySelector('.nb-proj-list');
        if (!list) return;
        const scale = Number(loadProjPrefs().scale) || 1;
        // 先找出剛好放得下一頁的字級，再乘上老師調整的倍率（調大會出現捲動）
        let size = Math.min(110, Math.max(28, Math.floor(window.innerHeight / 9)));
        for (; size > 22; size -= 2) {
            list.style.setProperty('--nb-size', size + 'px');
            if (proj.body.scrollHeight <= proj.body.clientHeight + 1) break;
        }
        list.style.setProperty('--nb-size', Math.max(18, Math.round(size * scale)) + 'px');
    }

    // ---------- 提示（可帶「復原」） ----------
    function toast(message, action, duration = 3500) {
        let box = $('nbToast');
        if (!box) {
            box = el('div', 'nb-toast');
            box.id = 'nbToast';
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
        $('nbToast')?.remove();
    }

    // ---------- 初始化 ----------
    function init() {
        injectStyles();
        const section = $('notebook-section');
        if (!section) return;
        try { const t = localStorage.getItem(LAST_TYPE_KEY); if (TYPES[t]) state.type = t; } catch (e) { /* 預設作業 */ }
        state.view = todayStr();
        state.followToday = true;

        renderTypes();
        setType(state.type);
        renderPhrases();
        const tplSelect = $('nbLongTpl');
        if (tplSelect) {
            Object.entries(NOTEBOOK_TEMPLATES).forEach(([key, tpl]) => tplSelect.add(new Option(tpl.name, key)));
            tplSelect.addEventListener('change', () => { if (tplSelect.value) applyLongTemplate(tplSelect.value); tplSelect.value = ''; });
        }
        $('nbPrev')?.addEventListener('click', () => setView(addDays(state.view, -1)));
        $('nbNext')?.addEventListener('click', () => setView(addDays(state.view, 1)));
        section.querySelectorAll('[data-nb-jump]').forEach(b => b.addEventListener('click', () => setView(addDays(todayStr(), Number(b.dataset.nbJump)))));
        $('notebookDate')?.addEventListener('change', e => { if (parseDay(e.target.value)) setView(e.target.value); });
        $('nbImportant')?.addEventListener('change', e => { state.important = e.target.checked; const p = $('notebookPriority'); if (p) p.value = state.important ? 'high' : 'normal'; });
        $('nbWhole')?.addEventListener('change', updateAddButton);
        $('nbReuse')?.addEventListener('click', reusePrevious);
        $('nbCopyDay')?.addEventListener('click', () => copyDay());
        $('nbPhraseEdit')?.addEventListener('click', () => { state.phraseEditing = !state.phraseEditing; renderPhrases(); });
        const ta = $('notebookContent');
        if (ta) {
            ta.addEventListener('input', updateAddButton);
            ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addFromForm(); } });
        }
        const search = $('nbSearch');
        if (search) search.addEventListener('input', () => { state.search = search.value; renderHistory(); });
        $('nbOnlyImportant')?.addEventListener('change', e => { state.onlyImportant = e.target.checked; renderHistory(); });
        state.important = !!$('nbImportant')?.checked;
        state.onlyImportant = !!$('nbOnlyImportant')?.checked;
        document.addEventListener('visibilitychange', () => { if (!document.hidden) syncToday(); });
        setInterval(() => { if (!document.hidden) syncToday(); }, 60000);
        new MutationObserver(() => { if (!section.classList.contains('hidden')) { syncToday(); renderAll(); } })
            .observe(section, { attributes: true, attributeFilter: ['class'] });
        renderAll();
        console.log('📝 聯絡簿增強模組 v3 已載入');
    }

    // 覆蓋既有全域函式（HTML onclick、雲端還原後重畫、其他模組都會呼叫）
    window.renderNotebook = () => renderAll();
    window.addNotebook = () => addFromForm();
    window.removeNotebook = id => { const e = entries().find(x => x && String(x.id) === String(id)); if (e) removeEntry(e); };
    window.useTemplate = content => appendLine(String(content || ''));
    window.applyNotebookTemplate = key => applyLongTemplate(key);
    window.filterNotebookByPriority = p => {
        state.onlyImportant = p === 'high';
        const box = $('nbOnlyImportant');
        if (box) box.checked = state.onlyImportant;
        renderHistory();
    };
    window.openNotebookPresentation = () => openProjection(document.activeElement);
    window.closeNotebookPresentation = closeProjection;
    window.togglePresentationTheme = () => proj?.root.querySelector('.nb-proj-bar button[aria-label="切換深淺色"]')?.click();
    window.openFullscreenEditor = () => { const t = $('notebookContent'); if (t) { t.classList.toggle('nb-big'); t.focus(); } };
    window.closeFullscreenEditor = () => $('notebookContent')?.classList.remove('nb-big');
    window.saveFromFullscreen = () => addFromForm();
    window.applyFsTemplate = key => applyLongTemplate(key);
    window.NOTEBOOK_TEMPLATES = NOTEBOOK_TEMPLATES;
    window.NotebookUI = { setView, copyDay, dayText, refresh: renderAll, view: () => state.view };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
