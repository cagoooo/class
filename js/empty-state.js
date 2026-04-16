/**
 * Empty State 元件 v1.0（v3.1.0 新增）
 *
 * 目的：當各區塊沒有資料時，以友善的視覺告訴老師「下一步該做什麼」。
 *      降低新使用者的認知負擔，同時讓空畫面不再冷冰冰。
 *
 * 使用：
 *   EmptyState.render(targetElement, {
 *     icon: '📝',
 *     title: '還沒有聯絡簿',
 *     desc: '記錄今天的班級大事，家長每天都能看到。',
 *     actionLabel: '✏️ 新增第一則',
 *     onAction: () => focusNotebookInput(),
 *   });
 *
 * 或把 HTML 字串塞到容器：
 *   container.innerHTML = EmptyState.html({ ... });
 */
(function () {
    'use strict';

    // ── CSS 注入 ──
    function injectCSS() {
        if (document.getElementById('empty-state-style')) return;
        const style = document.createElement('style');
        style.id = 'empty-state-style';
        style.textContent = `
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2.5rem 1.5rem;
    text-align: center;
    color: #6b7280;
    animation: esFadeIn 0.4s ease;
}
@keyframes esFadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
}
.empty-state-icon {
    font-size: 3rem;
    margin-bottom: 0.75rem;
    opacity: 0.85;
    animation: esBob 2.5s ease-in-out infinite;
}
@keyframes esBob {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
}
.empty-state-title {
    font-size: 1.05rem;
    font-weight: 700;
    color: #374151;
    margin-bottom: 0.4rem;
}
.empty-state-desc {
    font-size: 0.88rem;
    color: #6b7280;
    margin-bottom: 1rem;
    max-width: 360px;
    line-height: 1.55;
}
.empty-state-action {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.55rem 1.25rem;
    background: linear-gradient(135deg, #6366f1, #818cf8);
    color: #fff;
    border: none;
    border-radius: 999px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(99,102,241,0.35);
    transition: all 0.2s;
}
.empty-state-action:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99,102,241,0.45); }
.empty-state-action:active { transform: translateY(0) scale(0.97); }
.empty-state-tip {
    margin-top: 0.75rem;
    font-size: 0.78rem;
    color: #9ca3af;
}
/* 緊湊版（侷限空間用） */
.empty-state.compact { padding: 1.25rem 1rem; }
.empty-state.compact .empty-state-icon { font-size: 2rem; margin-bottom: 0.4rem; }
.empty-state.compact .empty-state-title { font-size: 0.95rem; }
.empty-state.compact .empty-state-desc { font-size: 0.82rem; margin-bottom: 0.6rem; }
        `;
        document.head.appendChild(style);
    }

    function escapeHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /** 產生 HTML 字串（適合 container.innerHTML 直接使用） */
    function html(opts) {
        const { icon = '✨', title = '還沒有資料', desc = '', actionLabel, actionOnClick, compact = false, tip } = opts || {};
        const actionHtml = actionLabel
            ? `<button class="empty-state-action" onclick="${actionOnClick || ''}">${escapeHtml(actionLabel)}</button>`
            : '';
        const tipHtml = tip ? `<div class="empty-state-tip">${escapeHtml(tip)}</div>` : '';
        return `
            <div class="empty-state${compact ? ' compact' : ''}">
                <div class="empty-state-icon">${icon}</div>
                <div class="empty-state-title">${escapeHtml(title)}</div>
                ${desc ? `<div class="empty-state-desc">${escapeHtml(desc)}</div>` : ''}
                ${actionHtml}
                ${tipHtml}
            </div>
        `;
    }

    /** 渲染至容器（會清空容器內容） */
    function render(target, opts) {
        if (!target) return;
        const el = typeof target === 'string' ? document.querySelector(target) : target;
        if (!el) return;
        el.innerHTML = html(opts);
        // 若有 onAction callback（而非 onclick 字串），綁定事件
        if (opts && typeof opts.onAction === 'function') {
            const btn = el.querySelector('.empty-state-action');
            if (btn) btn.addEventListener('click', opts.onAction);
        }
    }

    // ── 初始化（注入 CSS） ──
    function init() {
        injectCSS();
        console.log('✅ 空狀態元件（Empty State）已載入');
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 全域 API
    window.EmptyState = { render, html };
})();
