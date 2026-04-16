/**
 * 班級快速切換器 v1.0（v3.1.0 新增）
 *
 * 目的：高頻率切換班級的科任老師需要比下拉選單更快的方式。
 *
 * 快捷鍵：
 *   - Ctrl+K（Mac: Cmd+K） → 開啟快速切換器
 *   - Esc → 關閉
 *   - ↑↓ → 選擇
 *   - Enter → 切換
 *   - 直接輸入文字即時過濾（班號 / 班名）
 *
 * 相依：window.ClassProfiles（來自 class-profiles.js）
 */
(function () {
    'use strict';

    let selectedIndex = 0;
    let filteredProfiles = [];
    let isOpen = false;

    // ── CSS 注入 ──
    function injectCSS() {
        if (document.getElementById('class-quick-switcher-style')) return;
        const s = document.createElement('style');
        s.id = 'class-quick-switcher-style';
        s.textContent = `
#cqs-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.55);
    z-index: 20000;
    display: none;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
    animation: cqsFade 0.15s ease;
}
#cqs-backdrop.open { display: flex; }
@keyframes cqsFade { from { opacity: 0; } to { opacity: 1; } }

#cqs-modal {
    background: #fff;
    width: 90%;
    max-width: 500px;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    overflow: hidden;
    animation: cqsSlideDown 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes cqsSlideDown {
    from { opacity: 0; transform: translateY(-20px); }
    to { opacity: 1; transform: translateY(0); }
}

#cqs-search-wrap {
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    gap: 0.6rem;
}
#cqs-search-icon { font-size: 1.1rem; color: #6b7280; }
#cqs-search {
    flex: 1;
    border: none;
    outline: none;
    font-size: 1rem;
    padding: 0.3rem 0;
    background: transparent;
}
#cqs-search::placeholder { color: #9ca3af; }
#cqs-hint {
    font-size: 0.72rem;
    color: #9ca3af;
    background: #f3f4f6;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
}

#cqs-list {
    max-height: 50vh;
    overflow-y: auto;
    padding: 0.4rem 0;
}

.cqs-item {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.7rem 1.25rem;
    cursor: pointer;
    transition: background 0.1s;
}
.cqs-item:hover, .cqs-item.selected {
    background: #eef2ff;
}
.cqs-item.selected {
    border-left: 4px solid #6366f1;
    padding-left: calc(1.25rem - 4px);
}
.cqs-item-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
}
.cqs-item-name {
    flex: 1;
    font-size: 0.95rem;
    color: #1f2937;
    font-weight: 500;
}
.cqs-item-current {
    font-size: 0.7rem;
    background: #10b981;
    color: #fff;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    font-weight: 600;
}
.cqs-item-kbd {
    font-size: 0.7rem;
    color: #9ca3af;
    font-family: monospace;
    background: #f3f4f6;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    border: 1px solid #e5e7eb;
}

#cqs-empty {
    padding: 2rem;
    text-align: center;
    color: #9ca3af;
    font-size: 0.88rem;
}

#cqs-footer {
    padding: 0.6rem 1rem;
    background: #f9fafb;
    border-top: 1px solid #e5e7eb;
    display: flex;
    gap: 1rem;
    font-size: 0.72rem;
    color: #6b7280;
    justify-content: center;
    flex-wrap: wrap;
}
#cqs-footer kbd {
    display: inline-block;
    padding: 0.1rem 0.35rem;
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 3px;
    font-family: monospace;
    font-size: 0.7rem;
    box-shadow: 0 1px 0 rgba(0,0,0,0.05);
    margin-right: 0.2rem;
}
        `;
        document.head.appendChild(s);
    }

    // ── HTML 注入 ──
    function injectUI() {
        if (document.getElementById('cqs-backdrop')) return;
        const backdrop = document.createElement('div');
        backdrop.id = 'cqs-backdrop';
        backdrop.innerHTML = `
            <div id="cqs-modal" onclick="event.stopPropagation()">
                <div id="cqs-search-wrap">
                    <span id="cqs-search-icon">🔍</span>
                    <input type="text" id="cqs-search" placeholder="輸入班級名稱或班號..." autocomplete="off" spellcheck="false">
                    <span id="cqs-hint">Esc 關閉</span>
                </div>
                <div id="cqs-list"></div>
                <div id="cqs-footer">
                    <span><kbd>↑</kbd><kbd>↓</kbd> 選擇</span>
                    <span><kbd>Enter</kbd> 切換</span>
                    <span><kbd>Esc</kbd> 關閉</span>
                </div>
            </div>
        `;
        backdrop.addEventListener('click', close);
        document.body.appendChild(backdrop);

        const input = document.getElementById('cqs-search');
        input.addEventListener('input', () => { filter(input.value); });
        input.addEventListener('keydown', handleInputKey);
    }

    // ── 渲染列表 ──
    function renderList() {
        const list = document.getElementById('cqs-list');
        const profiles = window.ClassProfiles?.list?.() || [];
        const curId = window.ClassProfiles?.current?.() || 'default';

        if (filteredProfiles.length === 0) {
            list.innerHTML = '<div id="cqs-empty">找不到符合的班級</div>';
            return;
        }

        list.innerHTML = filteredProfiles.map((p, i) => `
            <div class="cqs-item ${i === selectedIndex ? 'selected' : ''}" data-idx="${i}">
                <span class="cqs-item-icon">${p.icon || '📚'}</span>
                <span class="cqs-item-name">${escapeHtml(p.name)}</span>
                ${p.id === curId ? '<span class="cqs-item-current">目前</span>' : ''}
                ${i < 9 ? `<span class="cqs-item-kbd">${i + 1}</span>` : ''}
            </div>
        `).join('');

        // 綁定點擊
        list.querySelectorAll('.cqs-item').forEach(el => {
            el.addEventListener('click', () => {
                selectedIndex = Number(el.dataset.idx);
                confirmSelection();
            });
        });

        // 確保選中項可見
        const selEl = list.querySelector('.cqs-item.selected');
        selEl?.scrollIntoView({ block: 'nearest' });
    }

    function filter(query) {
        const profiles = window.ClassProfiles?.list?.() || [];
        const q = (query || '').trim().toLowerCase();
        filteredProfiles = q
            ? profiles.filter(p => (p.name || '').toLowerCase().includes(q) || String(p.id).toLowerCase().includes(q))
            : profiles;
        selectedIndex = 0;
        renderList();
    }

    function handleInputKey(e) {
        // 數字鍵 1-9 快速切換
        if (/^[1-9]$/.test(e.key) && e.target.value === '') {
            const idx = parseInt(e.key, 10) - 1;
            if (filteredProfiles[idx]) {
                selectedIndex = idx;
                confirmSelection();
                e.preventDefault();
            }
            return;
        }
        if (e.key === 'ArrowDown') {
            selectedIndex = Math.min(selectedIndex + 1, filteredProfiles.length - 1);
            renderList();
            e.preventDefault();
        } else if (e.key === 'ArrowUp') {
            selectedIndex = Math.max(selectedIndex - 1, 0);
            renderList();
            e.preventDefault();
        } else if (e.key === 'Enter') {
            confirmSelection();
            e.preventDefault();
        } else if (e.key === 'Escape') {
            close();
            e.preventDefault();
        }
    }

    function confirmSelection() {
        const target = filteredProfiles[selectedIndex];
        if (!target) return;
        close();
        if (window.ClassProfiles?.switchTo) {
            window.ClassProfiles.switchTo(target.id);
        }
    }

    // ── 開啟/關閉 ──
    function open() {
        if (isOpen) return;
        isOpen = true;
        filter('');
        const bd = document.getElementById('cqs-backdrop');
        const input = document.getElementById('cqs-search');
        if (bd) bd.classList.add('open');
        if (input) {
            input.value = '';
            setTimeout(() => input.focus(), 50);
        }
    }
    function close() {
        isOpen = false;
        document.getElementById('cqs-backdrop')?.classList.remove('open');
    }

    // ── 全域快捷鍵 ──
    function bindHotkey() {
        document.addEventListener('keydown', (e) => {
            const isCmdOrCtrl = e.ctrlKey || e.metaKey;
            if (isCmdOrCtrl && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                if (isOpen) close();
                else open();
            }
        });
    }

    function escapeHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── 初始化 ──
    function init() {
        injectCSS();
        injectUI();
        bindHotkey();
        console.log('✅ 班級快速切換器已載入（Ctrl+K 或 Cmd+K 開啟）');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
    } else {
        setTimeout(init, 500);
    }

    // 公開 API（供外部手動觸發）
    window.ClassQuickSwitcher = { open, close };
})();
