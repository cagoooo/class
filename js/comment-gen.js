/**
 * comment-gen.js
 * ✍️ 成績單評語生成器
 * @version 3.10.2
 *
 * 需求：
 *   - 三大類特質點選：人際關係 / 學習表現 / 日常生活表現
 *   - 每類都有「正向」與「待加強」特質，各 10 個（每類 20 個，共 60 個）
 *   - 可選「口氣」（溫暖鼓勵 / 客觀中性 / 嚴謹正式 / 活潑親切）與「字數」（簡短 / 適中 / 詳細）
 *   - 自動組成通順的中文評語，可一鍵複製
 *
 * 純前端、零相依、自注入 CSS；無狀態（每位學生重新點選，不寫 localStorage）。
 * 對外：window.CommentGen.{ init, generate, copy, clear }
 */
(function () {
    'use strict';

    // ───────────── 特質資料（l=晶片短標、p=入句語句，語句皆可接在主詞後） ─────────────
    const CATS = [
        {
            key: 'social', label: '人際關係', emoji: '🤝',
            pos: [
                { l: '熱心助人', p: '熱心助人、樂於協助同學' },
                { l: '相處融洽', p: '與同學相處融洽' },
                { l: '有禮貌', p: '待人有禮、應對得宜' },
                { l: '善溝通', p: '善於表達與溝通' },
                { l: '樂分享', p: '樂於和大家分享' },
                { l: '有同理心', p: '能體貼他人、富有同理心' },
                { l: '守信用', p: '重視承諾、值得信賴' },
                { l: '能包容', p: '能包容並接納不同意見' },
                { l: '愛合作', p: '樂於與人合作' },
                { l: '人緣好', p: '廣受同學喜愛、人緣很好' }
            ],
            neg: [
                { l: '易起摩擦', p: '與同學相處時偶有摩擦' },
                { l: '害羞被動', p: '在人際互動上較為害羞被動' },
                { l: '不易納諫', p: '較不易接納他人的意見' },
                { l: '說話較直', p: '言語表達有時較為直接' },
                { l: '較少互動', p: '較少主動與同學互動' },
                { l: '愛計較', p: '與同學相處時較容易計較' },
                { l: '情緒影響相處', p: '情緒起伏較會影響人際相處' },
                { l: '不易融入', p: '在團體活動中較不易融入' },
                { l: '不擅拒絕', p: '較不擅長適當地表達拒絕' },
                { l: '易受影響', p: '較容易受同儕影響' }
            ]
        },
        {
            key: 'learning', label: '學習表現', emoji: '📚',
            pos: [
                { l: '認真積極', p: '學習態度認真積極' },
                { l: '上課專心', p: '上課專心、能持續專注' },
                { l: '勇於發問', p: '勇於發問、樂於思考' },
                { l: '按時作業', p: '作業總是按時且用心完成' },
                { l: '求知慾強', p: '對學習充滿好奇與求知慾' },
                { l: '理解力佳', p: '理解力佳、能舉一反三' },
                { l: '自動自發', p: '能自動自發地學習' },
                { l: '參與踴躍', p: '課堂參與十分踴躍' },
                { l: '持續進步', p: '學習表現持續進步' },
                { l: '細心負責', p: '做事細心且負責任' }
            ],
            neg: [
                { l: '易分心', p: '上課時較容易分心' },
                { l: '作業遲交', p: '作業繳交常需老師提醒' },
                { l: '較被動', p: '學習態度較為被動' },
                { l: '專注不足', p: '專注的時間有待延長' },
                { l: '偶爾粗心', p: '作答時偶爾較為粗心' },
                { l: '少複習', p: '較少主動複習功課' },
                { l: '遇難易放棄', p: '遇到困難時較容易放棄' },
                { l: '少發言', p: '課堂上發言較少' },
                { l: '動機待提升', p: '學習動機有待提升' },
                { l: '訂正不確實', p: '訂正時較不夠確實' }
            ]
        },
        {
            key: 'daily', label: '日常生活表現', emoji: '🌿',
            pos: [
                { l: '守常規', p: '能確實遵守班級常規' },
                { l: '重整潔', p: '重視整潔、座位總是整齊' },
                { l: '負責盡職', p: '認真完成班級交辦的任務' },
                { l: '作息守時', p: '作息守時、不遲到' },
                { l: '情緒穩定', p: '情緒穩定、處事冷靜' },
                { l: '對師長有禮', p: '對師長有禮貌' },
                { l: '自理佳', p: '生活自理能力良好' },
                { l: '樂於服務', p: '樂於為班上服務付出' },
                { l: '誠實', p: '誠實不說謊' },
                { l: '愛惜物品', p: '懂得愛惜公物與個人物品' }
            ],
            neg: [
                { l: '常規待加強', p: '對班級常規的遵守仍待加強' },
                { l: '物品凌亂', p: '個人物品的整理有待加強' },
                { l: '動作較慢', p: '生活作息的動作較為緩慢' },
                { l: '偶爾遲到', p: '偶爾會有遲到的情形' },
                { l: '情緒待控制', p: '情緒的控制仍待加強' },
                { l: '常忘東西', p: '常忘記攜帶個人物品' },
                { l: '較依賴', p: '生活自理較依賴他人' },
                { l: '規律待養成', p: '生活規律仍有待養成' },
                { l: '不愛惜物品', p: '愛惜物品的習慣有待養成' },
                { l: '逃避責任', p: '面對責任時較容易逃避' }
            ]
        }
    ];

    // ───────────── 口氣設定 ─────────────
    const TONES = {
        warm: {
            name: '溫暖鼓勵',
            opens: [
                n => `這學期，老師看見了${n || '你'}的努力與成長：`,
                n => `回顧這學期，${n || '你'}有許多令人欣喜的表現：`,
                n => `這一學期以來，${n || '你'}的點滴進步老師都看在眼裡：`,
                n => `老師想和${n || '你'}分享這學期的觀察與肯定：`,
                n => `這學期，${n || '你'}帶給老師不少感動與驚喜：`,
                n => `這學期，${n || '你'}一步一腳印地成長，老師都記在心裡：`,
                n => `看著${n || '你'}這學期的表現，老師有好多話想說：`,
                n => `這學期過得很充實，${n || '你'}的努力老師都感受到了：`,
                n => `親愛的${n || '你'}，這學期的點滴成長值得好好喝采：`,
                n => `這學期，${n || '你'}用行動讓老師看見滿滿的進步：`
            ],
            posTail: ['，讓老師看了很欣慰', '，真的很棒', '，值得好好讚賞', ''],
            negTail: ['相信只要多用一點心，一定會越來越進步', '只要再多努力一些，一定會更好', '老師相信你做得到，我們一起加油'],
            extra: ['老師會一直為你加油，相信你擁有很大的潛力！', '每一點努力老師都看得到，繼續往前走！', '你的用心一定會開花結果，老師很期待。'],
            close: ['期待下學期看見更棒的你，繼續保持！', '你是個很棒的孩子，老師會一直支持你！']
        },
        neutral: {
            name: '客觀中性',
            opens: [
                n => `${n || '該生'}本學期各方面表現綜述如下：`,
                n => `以下就${n || '該生'}本學期的學習與生活表現綜合說明：`,
                n => `${n || '該生'}本學期的整體表現，分述如下：`,
                n => `謹將${n || '該生'}本學期各方面表現摘要如下：`,
                n => `${n || '該生'}本學期於各面向之表現，說明如下：`,
                n => `就${n || '該生'}本學期的學習與生活情形，綜述如下：`,
                n => `${n || '該生'}本學期的表現重點，整理如下：`,
                n => `以下為${n || '該生'}本學期各項表現之綜合說明：`,
                n => `${n || '該生'}本學期在校的整體狀況，分述如下：`,
                n => `針對${n || '該生'}本學期的表現，綜合說明如下：`
            ],
            posTail: ['', '，表現穩定', '，值得肯定'],
            negTail: ['仍有進步空間', '尚待加強', '可再多加留意'],
            extra: ['建議家長能持續關注並適時給予鼓勵。', '若能配合家庭的提醒，效果會更好。', '期能在師長協助下逐步調整。'],
            close: ['整體而言表現尚屬穩定。', '盼能持續維持並逐步改善。']
        },
        formal: {
            name: '嚴謹正式',
            opens: [
                n => `茲將${n || '該生'}本學期之表現綜評如下：`,
                n => `謹就${n || '該生'}本學期之各項表現綜述如下：`,
                n => `${n || '該生'}本學期之表現，謹綜評如下：`,
                n => `茲就${n || '該生'}本學期學習與生活之表現評述如下：`,
                n => `謹將${n || '該生'}本學期之學習與品行表現綜評如下：`,
                n => `茲就${n || '該生'}本學期各項表現，謹陳述如下：`,
                n => `${n || '該生'}本學期之各方面表現，茲評述如下：`,
                n => `謹就${n || '該生'}本學期在校之表現綜合評述如下：`,
                n => `茲將${n || '該生'}本學期之學習、生活及品德表現綜述如下：`,
                n => `${n || '該生'}本學期表現綜評，謹臚列如下：`
            ],
            posTail: ['，表現值得肯定', '，殊值嘉許', '，洵屬難得'],
            negTail: ['仍待加強與督促', '宜再多加努力', '期能持續改進'],
            extra: ['尚祈家長密切配合，共同督導，以臻完善。', '盼家庭與學校攜手，共助其成長。', '期能在師長督導下精益求精。'],
            close: ['望能持續精進，更上層樓。', '盼能再接再厲，日新又新。']
        },
        lively: {
            name: '活潑親切',
            opens: [
                n => `嘿${n ? '，' + n : ''}！來看看你這學期有多棒～`,
                n => `叮咚～${n ? n + '，' : ''}這學期的精彩表現來囉！`,
                n => `${n ? n + '，' : ''}這學期超有料，一起來看看吧～`,
                n => `登登！${n ? n + ' ' : ''}這學期的成績單評語來啦 🎉`,
                n => `哇～${n ? n + '，' : ''}這學期表現太精彩，老師忍不住想說：`,
                n => `${n ? n + '！' : '嘿！'}這學期的你超級閃亮，一起回顧一下～`,
                n => `鏘鏘～${n ? n + '，' : ''}本學期的亮點時刻來囉！`,
                n => `${n ? n + '，' : ''}快來看看你這學期解鎖了哪些成就 🏆`,
                n => `耶～${n ? n + '，' : ''}這學期的你真的很可以！老師說給你聽：`,
                n => `Hi${n ? '，' + n : ''}！老師幫你把這學期的精彩整理好囉～`
            ],
            posTail: ['，超讚的 👍', '，太棒了 🎉', '，給你一個大大的讚 👍'],
            negTail: ['再加把勁就更棒囉', '下次一定可以做得更好', '我們一起努力，沒問題的 💪'],
            extra: ['只要保持這份熱情，你一定會越來越厲害唷！', '繼續這樣衝，下學期一定更精彩！', '把這股幹勁留著，你超有潛力的！'],
            close: ['繼續保持，你超棒的！🌟', '期待你越來越進步～加油 ✨']
        }
    };
    const LENGTHS = {
        short: { max: 2, opening: false, extra: false },
        medium: { max: 4, opening: true, extra: false },
        detailed: { max: 99, opening: true, extra: true }
    };

    // 句首引導語與轉折詞（多樣化，避免每段都「在…方面，」「不過」重複；{L} 會替換成類別名）
    const LEADS = ['在{L}方面，', '在{L}上，', '就{L}來說，'];
    const TRANSITIONS = ['不過', '只是', '美中不足的是', '但'];

    const selected = new Set();
    let lastText = '';

    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    // 同一次生成內對同一語句池「不放回」抽樣（用完才重置）→ 句子不會重複
    function uniquePicker() {
        const used = new Map();
        return function (arr) {
            if (!arr || !arr.length) return '';
            let set = used.get(arr);
            if (!set) { set = new Set(); used.set(arr, set); }
            if (set.size >= arr.length) set.clear();
            const avail = [];
            for (let i = 0; i < arr.length; i++) if (!set.has(i)) avail.push(i);
            const idx = avail[Math.floor(Math.random() * avail.length)];
            set.add(idx);
            return arr[idx];
        };
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ───────────── CSS ─────────────
    function injectCSS() {
        if (document.getElementById('comment-gen-style')) return;
        const css = `
        #comment-section .cg-sub{color:#7c3aed;font-weight:600}
        .cg-name-row{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin-bottom:1rem}
        .cg-name-row label{font-weight:700;color:#374151}
        .cg-name-row input{padding:.5rem .8rem;border:2px solid #ddd6fe;border-radius:.7rem;font-size:1rem;max-width:200px}
        .cg-cat{border:3px solid #ede9fe;border-radius:1.2rem;padding:1rem;margin-bottom:1rem;background:linear-gradient(160deg,#fbfaff,#f5f3ff)}
        .cg-cat h3{font-size:1.1rem;font-weight:900;color:#5b21b6;margin-bottom:.7rem;display:flex;align-items:center;gap:.4rem}
        .cg-group{margin-bottom:.6rem}
        .cg-group:last-child{margin-bottom:0}
        .cg-group-t{font-size:.85rem;font-weight:800;margin-bottom:.4rem}
        .cg-group.pos .cg-group-t{color:#16a34a}
        .cg-group.neg .cg-group-t{color:#d97706}
        .cg-chips{display:flex;flex-wrap:wrap;gap:.45rem}
        .cg-chip{border:2px solid #e5e7eb;background:#fff;border-radius:9999px;padding:.4rem .85rem;font-size:.9rem;font-weight:700;
            color:#4b5563;cursor:pointer;transition:all .12s;user-select:none}
        .cg-chip:hover{transform:translateY(-2px)}
        .cg-chip.pos.on{background:linear-gradient(135deg,#34d399,#10b981);border-color:#10b981;color:#fff;box-shadow:0 4px 10px rgba(16,185,129,.35)}
        .cg-chip.neg.on{background:linear-gradient(135deg,#fbbf24,#f59e0b);border-color:#f59e0b;color:#fff;box-shadow:0 4px 10px rgba(245,158,11,.35)}
        .cg-controls{display:flex;flex-wrap:wrap;align-items:flex-end;gap:.9rem;margin:0;padding:1rem;background:#faf5ff;border-radius:1rem}
        .cg-controls .fld{display:flex;flex-direction:column;gap:.25rem;flex:1;min-width:130px}
        .cg-controls label{font-size:.82rem;font-weight:800;color:#6b21a8}
        .cg-controls select{width:100%;padding:.5rem .8rem;border:2px solid #ddd6fe;border-radius:.7rem;font-size:.95rem;font-weight:700;color:#4b5563;background:#fff}
        .cg-actions{display:flex;gap:.7rem}
        .cg-actions .cg-btn{padding:.7rem 1rem}
        .cg-actions .cg-clear{flex:1}
        .cg-actions .cg-gen{flex:2}
        .cg-btn{border:none;border-radius:.8rem;padding:.6rem 1.2rem;font-weight:800;cursor:pointer;font-size:.95rem;transition:transform .1s,box-shadow .1s}
        .cg-btn:active{transform:translateY(3px)}
        .cg-gen{background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:#fff;box-shadow:0 4px 0 #5b21b6;font-size:1.05rem}
        .cg-clear{background:#f3f4f6;color:#4b5563}
        .cg-out-wrap{border:3px solid #c4b5fd;border-radius:1.2rem;overflow:hidden}
        .cg-output{padding:1.1rem 1.2rem;min-height:96px;font-size:1.08rem;line-height:1.9;color:#1f2937;background:#fffef9;white-space:pre-wrap;word-break:break-word}
        .cg-output.placeholder{color:#9ca3af}
        .cg-out-bar{display:flex;align-items:center;justify-content:space-between;gap:.6rem;flex-wrap:wrap;padding:.6rem .9rem;background:#f5f3ff;border-top:2px solid #ede9fe}
        .cg-charcount{font-size:.85rem;font-weight:700;color:#7c3aed}
        .cg-out-actions{display:flex;gap:.5rem}
        .cg-regen{background:#ede9fe;color:#6d28d9}
        .cg-copy{background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;box-shadow:0 3px 0 #15803d}
        .cg-toast{font-size:.85rem;font-weight:800;color:#16a34a;margin-left:.4rem;opacity:0;transition:opacity .2s}
        .cg-toast.show{opacity:1}
        `;
        const st = document.createElement('style');
        st.id = 'comment-gen-style';
        st.textContent = css;
        (document.head || document.documentElement).appendChild(st);
    }

    // ───────────── 渲染特質面板 ─────────────
    function renderCats() {
        const host = document.getElementById('cg-cats');
        if (!host) return;
        host.innerHTML = CATS.map(cat => `
            <div class="cg-cat">
                <h3>${cat.emoji} ${esc(cat.label)}</h3>
                <div class="cg-group pos">
                    <div class="cg-group-t">👍 正向特質</div>
                    <div class="cg-chips">${cat.pos.map((t, i) => chip(cat.key, 'p', i, t.l, 'pos')).join('')}</div>
                </div>
                <div class="cg-group neg">
                    <div class="cg-group-t">💪 待加強</div>
                    <div class="cg-chips">${cat.neg.map((t, i) => chip(cat.key, 'n', i, t.l, 'neg')).join('')}</div>
                </div>
            </div>`).join('');
        host.querySelectorAll('.cg-chip').forEach(c => {
            // 重新進入區塊時還原先前已選取的高亮狀態，避免「有評語卻沒亮燈」的錯亂
            if (selected.has(c.dataset.id)) c.classList.add('on');
            c.addEventListener('click', () => {
                const id = c.dataset.id;
                if (selected.has(id)) { selected.delete(id); c.classList.remove('on'); }
                else { selected.add(id); c.classList.add('on'); }
                generate(); // 即時生成：點選特質後右側立刻更新
            });
        });
    }
    function chip(catKey, pol, i, label, cls) {
        return `<span class="cg-chip ${cls}" data-id="${catKey}|${pol}|${i}">${esc(label)}</span>`;
    }

    function phraseOf(catKey, pol, i) {
        const cat = CATS.find(c => c.key === catKey);
        if (!cat) return '';
        const arr = pol === 'p' ? cat.pos : cat.neg;
        return arr[i] ? arr[i].p : '';
    }

    // ───────────── 產生評語 ─────────────
    function output(text, isPlaceholder) {
        const el = document.getElementById('cg-output');
        if (!el) return;
        el.textContent = text;
        el.classList.toggle('placeholder', !!isPlaceholder);
        const cc = document.getElementById('cg-charcount');
        if (cc) cc.textContent = isPlaceholder ? '' : ('字數：' + text.replace(/\s/g, '').length + ' 字');
        lastText = isPlaceholder ? '' : text;
    }

    function generate() {
        injectCSS();
        const name = (document.getElementById('cg-name').value || '').trim();
        const tone = document.getElementById('cg-tone').value;
        const len = document.getElementById('cg-length').value;
        const T = TONES[tone] || TONES.warm;
        const L = LENGTHS[len] || LENGTHS.medium;
        const subj = name || (tone === 'formal' || tone === 'neutral' ? '該生' : '你');

        const pu = uniquePicker();       // 本次生成的不放回抽樣器，避免句子重複
        const clauses = [];
        let used = false;
        CATS.forEach(cat => {
            const P = [], N = [];
            cat.pos.forEach((t, i) => { if (selected.has(cat.key + '|p|' + i)) P.push(t.p); });
            cat.neg.forEach((t, i) => { if (selected.has(cat.key + '|n|' + i)) N.push(t.p); });
            if (!P.length && !N.length) return;
            const Pp = P.slice(0, L.max), Nn = N.slice(0, L.max);
            const sj = used ? '' : subj;     // 主詞只放在第一句，其餘以省略主詞承接
            const lead = pu(LEADS).replace('{L}', cat.label);
            let s;
            if (Pp.length && Nn.length) s = `${lead}${sj}${Pp.join('、')}${pu(T.posTail)}；${pu(TRANSITIONS)}${Nn.join('、')}，${pu(T.negTail)}。`;
            else if (Pp.length) s = `${lead}${sj}${Pp.join('、')}${pu(T.posTail)}。`;
            else s = `${lead}${sj}${Nn.join('、')}，${pu(T.negTail)}。`;
            clauses.push(s);
            used = true;
        });

        if (!clauses.length) {
            output('（在左側點選特質，這裡會即時生成評語 ✨）', true);
            return;
        }
        const parts = [];
        if (L.opening) parts.push(pick(T.opens)(name));
        parts.push(clauses.join(''));
        if (L.extra) parts.push(pu(T.extra));
        parts.push(pu(T.close));
        output(parts.join(''), false);
    }

    // ───────────── 複製 / 清除 ─────────────
    function toast(msg) {
        const t = document.getElementById('cg-toast');
        if (window.NotificationSystem && NotificationSystem.success) { NotificationSystem.success(msg); }
        if (t) { t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1800); }
    }
    function copy() {
        if (!lastText) { toast('請先生成評語'); return; }
        const done = () => toast('評語已複製 ✅');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(lastText).then(done).catch(() => fallbackCopy(lastText, done));
        } else { fallbackCopy(lastText, done); }
    }
    function fallbackCopy(text, done) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); ta.remove(); done();
        } catch (e) { toast('複製失敗，請手動選取'); }
    }
    function clear() {
        selected.clear();
        document.querySelectorAll('#cg-cats .cg-chip.on').forEach(c => c.classList.remove('on'));
        output('（在左側點選特質，這裡會即時生成評語 ✨）', true);
    }

    // ───────────── 對外 API ─────────────
    window.CommentGen = {
        init() { injectCSS(); renderCats(); if (!lastText) output('（在左側點選特質，這裡會即時生成評語 ✨）', true); },
        generate, copy, clear
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectCSS);
    else injectCSS();
})();
