/* 班級識別與次要管理操作；不改動班級資料。 */
(function () {
    'use strict';
    function init() {
        function refreshContext() {
            const name = window.ClassProfiles?.currentProfile()?.name || '預設班級';
            document.querySelectorAll('.section').forEach(section => {
                const heading = section.querySelector('h2');
                if (!heading) return;
                let badge = section.querySelector('.class-context');
                if (!badge) {
                    badge = document.createElement('p');
                    badge.className = 'class-context';
                    heading.after(badge);
                }
                badge.textContent = `目前班級：${name}`;
            });
        }
        refreshContext();
        const show = window.showSection;
        window.showSection = function (...args) {
            const result = show.apply(this, args);
            refreshContext();
            return result;
        };
        const nameNode = document.getElementById('cs-current-name');
        if (nameNode) new MutationObserver(refreshContext).observe(nameNode, { childList: true, subtree: true });

        function tidyActions(root) {
            root.querySelectorAll('button[onclick]').forEach(button => {
                if (button.closest('.class-management-action')) return;
                const action = button.getAttribute('onclick');
                const label = /^removeStudent\(/.test(action) ? '刪除學生'
                    : /^removeNotebook\(/.test(action) ? '刪除此事項'
                    : /^removeHomework\(/.test(action) ? '刪除此作業' : '';
                if (!label) return;
                const menu = document.createElement('details');
                menu.className = 'class-management-action';
                const summary = document.createElement('summary');
                summary.textContent = '管理';
                menu.append(summary);
                button.before(menu);
                button.textContent = label;
                button.setAttribute('aria-label', label);
                menu.append(button);
            });
        }
        ['studentsList', 'notebookList', 'homeworkList'].forEach(id => {
            const root = document.getElementById(id);
            if (!root) return;
            tidyActions(root);
            new MutationObserver(() => tidyActions(root)).observe(root, { childList: true, subtree: true });
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
