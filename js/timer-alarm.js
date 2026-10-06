/**
 * 定時鬧鈴模組
 * 在「計時器」頁新增「幾點幾分響鈴」：可設定多組、單次／每天／平日重複、可延後再響。
 * 鬧鈴排程與計時器分頁無關，切到其他功能頁也會準時響；資料存本機（不上雲端，鬧鈴屬於這台電腦）。
 *
 * v2（UX 優化）：快速設定晶片（幾分鐘後／常用名稱）、編輯既有鬧鈴、三種鈴聲＋試聽、
 * 下一個鬧鈴提示列、同時多組鬧鈴合併顯示、刪除可復原、清除已響過、鍵盤操作。
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'timerAlarms';
    const GRACE_MS = 5 * 60 * 1000;      // 電腦睡眠／分頁被節流時，5 分鐘內補響
    const RING_MAX_MS = 60 * 1000;       // 沒人關就響滿 1 分鐘自動停
    const REPEAT_LABEL = { once: '只響一次', daily: '每天', weekday: '週一至週五' };
    const SOUNDS = { bell: '清脆鈴聲', chime: '悅耳鐘聲', soft: '溫和提示' };
    const REL_MINUTES = [5, 10, 15, 30, 45];
    const LABEL_CHIPS = ['下課', '上課', '收作業', '集合', '午休結束', '放學'];

    let alarms = [];
    let audioCtx = null;
    let ringTimer = null;
    let ringStopTimer = null;
    let overlay = null;
    let ringingIds = [];
    let editingId = null;
    let undoTimer = null;

    // ---------- 儲存 ----------
    function load() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            alarms = Array.isArray(parsed) ? parsed.filter(a => a && /^\d{2}:\d{2}$/.test(a.time)) : [];
        } catch (e) { alarms = []; }
    }
    function save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(alarms)); } catch (e) { /* 儲存失敗不影響響鈴 */ }
    }

    // ---------- 時間計算 ----------
    const pad = n => String(n).padStart(2, '0');
    function todayKey(d) {
        return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    }
    function targetOn(date, time) {
        const [h, m] = time.split(':').map(Number);
        const t = new Date(date);
        t.setHours(h, m, 0, 0);
        return t;
    }
    function activeOn(alarm, date) {
        if (alarm.repeat === 'weekday') return date.getDay() >= 1 && date.getDay() <= 5;
        return true;
    }
    // 下一次響鈴時間（含延後）；沒有則回傳 null
    function nextRing(alarm, now) {
        if (alarm.enabled === false) return null;
        if (alarm.repeat === 'once' && alarm.done) return null;
        if (alarm.snoozeUntil && alarm.snoozeUntil > now.getTime()) return new Date(alarm.snoozeUntil);
        for (let i = 0; i < 8; i++) {
            const day = new Date(now);
            day.setDate(day.getDate() + i);
            if (!activeOn(alarm, day)) continue;
            const t = targetOn(day, alarm.time);
            if (t.getTime() > now.getTime() && alarm.lastFired !== todayKey(day)) return t;
        }
        return null;
    }
    function fmtRemain(ms) {
        const min = Math.ceil(ms / 60000);
        if (min <= 1) return '1 分鐘內';
        if (min < 60) return min + ' 分鐘後';
        const h = Math.floor(min / 60), m = min % 60;
        if (h < 24) return h + ' 小時' + (m ? ' ' + m + ' 分' : '') + '後';
        return Math.floor(h / 24) + ' 天後';
    }
    function nextRoundTime() {
        const d = new Date(Date.now() + 5 * 60000);
        d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
        return pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    // ---------- 聲音 ----------
    function ensureAudio() {
        try {
            if (!audioCtx) {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                if (!Ctx) return null;
                audioCtx = new Ctx();
            }
            if (audioCtx.state === 'suspended') audioCtx.resume();
        } catch (e) { return null; }
        return audioCtx;
    }
    function tone(ctx, type, freq, start, dur, peak) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(peak, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + dur + 0.05);
    }
    function playSound(kind) {
        const ctx = ensureAudio();
        if (!ctx) return;
        const t = ctx.currentTime;
        if (kind === 'chime') {
            [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ctx, 'sine', f, t + i * 0.22, 0.9, 0.5));
        } else if (kind === 'soft') {
            tone(ctx, 'triangle', 660, t, 1.2, 0.35);
            tone(ctx, 'triangle', 880, t + 0.45, 1.2, 0.3);
        } else {
            [880, 880, 1175].forEach((f, i) => tone(ctx, 'sine', f, t + i * 0.28, 0.22, 0.7));
        }
    }
    function stopRinging() {
        clearInterval(ringTimer);
        clearTimeout(ringStopTimer);
        ringTimer = ringStopTimer = null;
        ringingIds = [];
        if (overlay) { overlay.remove(); overlay = null; }
        document.removeEventListener('keydown', onRingKey, true);
        document.title = document.title.replace(/^🔔 /, '');
    }
    function onRingKey(e) {
        if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); stopRinging(); }
    }

    // ---------- 響鈴 ----------
    function ring(list) {
        stopRinging();
        ringingIds = list.map(a => a.id);
        const first = list[0];
        const names = list.map(a => a.label || '時間到了');

        overlay = document.createElement('div');
        overlay.setAttribute('role', 'alertdialog');
        overlay.setAttribute('aria-label', '鬧鈴時間到');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;';
        const card = document.createElement('div');
        card.style.cssText = 'background:#fff;color:#1f2937;border:4px solid #ef4444;border-radius:20px;padding:28px 36px;text-align:center;max-width:92vw;box-shadow:0 20px 50px rgba(0,0,0,.4);animation:timerAlarmPop .35s ease-out;';
        const bell = document.createElement('div');
        bell.textContent = '🔔';
        bell.style.cssText = 'font-size:72px;line-height:1;margin-bottom:8px;display:inline-block;animation:timerAlarmShake .6s ease-in-out infinite;';
        const clock = document.createElement('div');
        clock.textContent = first.time;
        clock.style.cssText = 'font-size:56px;font-weight:800;color:#dc2626;line-height:1.1;';
        const name = document.createElement('div');
        name.textContent = names.join('、');
        name.style.cssText = 'font-size:28px;font-weight:700;margin:8px 0 22px;word-break:break-word;';
        const btns = document.createElement('div');
        btns.style.cssText = 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap;';
        const mkBtn = (text, bg) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = text;
            b.style.cssText = `background:${bg};color:#fff;border:0;border-radius:12px;padding:12px 24px;font-size:20px;font-weight:700;cursor:pointer;`;
            return b;
        };
        const closeBtn = mkBtn('我知道了', '#ef4444');
        closeBtn.onclick = stopRinging;
        btns.appendChild(closeBtn);
        [5, 10].forEach(min => {
            const b = mkBtn(min + ' 分鐘後再響', '#6b7280');
            b.onclick = () => {
                list.forEach(a => { a.snoozeUntil = Date.now() + min * 60000; });
                save(); render(); stopRinging();
            };
            btns.appendChild(b);
        });
        const hint = document.createElement('div');
        hint.textContent = '按 Enter 或 Esc 也可關閉';
        hint.style.cssText = 'font-size:13px;color:#9ca3af;margin-top:14px;';
        card.append(bell, clock, name, btns, hint);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        closeBtn.focus();
        document.addEventListener('keydown', onRingKey, true);

        const kind = first.sound || 'bell';
        playSound(kind);
        ringTimer = setInterval(() => playSound(kind), kind === 'bell' ? 1500 : 2600);
        ringStopTimer = setTimeout(stopRinging, RING_MAX_MS);

        document.title = '🔔 ' + document.title.replace(/^🔔 /, '');
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
            try { new Notification('⏰ ' + names.join('、'), { body: first.time + ' 鬧鈴時間到了' }); } catch (e) { /* 部分瀏覽器不支援 */ }
        }
    }

    // ---------- 檢查 ----------
    function check() {
        const now = new Date();
        const nowMs = now.getTime();
        let changed = false;
        const due = [];
        alarms.forEach(a => {
            if (a.enabled === false) return;
            let fire = false;
            if (a.snoozeUntil) {
                if (nowMs >= a.snoozeUntil) {
                    if (nowMs - a.snoozeUntil < GRACE_MS) fire = true;
                    a.snoozeUntil = null;
                    changed = true;
                }
            } else if (activeOn(a, now) && a.lastFired !== todayKey(now) && !(a.repeat === 'once' && a.done)) {
                const t = targetOn(now, a.time).getTime();
                if (nowMs >= t && nowMs - t < GRACE_MS) {
                    fire = true;
                    a.lastFired = todayKey(now);
                    if (a.repeat === 'once') a.done = true;
                    changed = true;
                }
            }
            if (fire) due.push(a);
        });
        if (changed) { save(); render(); }
        if (due.length) {
            // 正在響的鬧鈴不被打斷；新的一組併入同一個提示
            const merged = [...ringingIds.map(id => alarms.find(a => a.id === id)).filter(Boolean), ...due];
            ring(merged);
        }
    }

    // ---------- 介面 ----------
    function toast(msg, undo) {
        let el = document.getElementById('timerAlarmToast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'timerAlarmToast';
            el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99998;background:#1f2937;color:#fff;padding:10px 16px;border-radius:12px;font-size:14px;display:flex;gap:12px;align-items:center;box-shadow:0 8px 24px rgba(0,0,0,.3);';
            document.body.appendChild(el);
        }
        el.textContent = '';
        const span = document.createElement('span');
        span.textContent = msg;
        el.appendChild(span);
        if (undo) {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = '復原';
            b.style.cssText = 'color:#fca5a5;font-weight:700;background:none;border:0;cursor:pointer;';
            b.onclick = () => { undo(); el.remove(); clearTimeout(undoTimer); };
            el.appendChild(b);
        }
        el.style.display = 'flex';
        clearTimeout(undoTimer);
        undoTimer = setTimeout(() => el.remove(), 5000);
    }

    function updateNextBanner() {
        const el = document.getElementById('timerAlarmNext');
        if (!el) return;
        const now = new Date();
        let best = null, bestAlarm = null;
        alarms.forEach(a => {
            const n = nextRing(a, now);
            if (n && (!best || n < best)) { best = n; bestAlarm = a; }
        });
        if (!best) { el.classList.add('hidden'); el.textContent = ''; return; }
        el.classList.remove('hidden');
        const hhmm = pad(best.getHours()) + ':' + pad(best.getMinutes());
        el.textContent = '🔔 下一個鬧鈴 ' + hhmm + (bestAlarm.label ? ' ' + bestAlarm.label : '') + '（' + fmtRemain(best - now) + '）';
    }

    function render() {
        updateNextBanner();
        const list = document.getElementById('timerAlarmList');
        if (!list) return;
        list.innerHTML = '';
        const clearBtn = document.getElementById('timerAlarmClearDone');
        if (clearBtn) clearBtn.classList.toggle('hidden', !alarms.some(a => a.repeat === 'once' && a.done));
        if (!alarms.length) {
            const empty = document.createElement('div');
            empty.className = 'text-sm text-gray-500 text-center py-3 border border-dashed border-gray-300 rounded-lg';
            empty.textContent = '還沒有鬧鈴，選好時間按「加入鬧鈴」就會準時提醒 ⏰';
            list.appendChild(empty);
            return;
        }
        const now = new Date();
        const rank = a => {
            const n = nextRing(a, now);
            return n ? n.getTime() : Infinity;
        };
        [...alarms].sort((a, b) => rank(a) - rank(b) || a.time.localeCompare(b.time)).forEach(a => {
            const finished = a.repeat === 'once' && a.done;
            const off = a.enabled === false || finished;
            const row = document.createElement('div');
            row.className = 'flex items-center gap-2 p-2 border rounded-lg bg-white ' +
                (a.id === editingId ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-200') + (off ? ' opacity-60' : '');

            const toggle = document.createElement('input');
            toggle.type = 'checkbox';
            toggle.checked = !off;
            toggle.style.cssText = 'width:20px;height:20px;accent-color:#ef4444;cursor:pointer;flex:none;';
            toggle.setAttribute('aria-label', '啟用此鬧鈴');
            toggle.onchange = () => {
                a.enabled = toggle.checked;
                if (toggle.checked && a.repeat === 'once') {
                    a.done = false;
                    // 重新啟用時若今天的時間已過，改排明天
                    a.lastFired = targetOn(new Date(), a.time).getTime() <= Date.now() ? todayKey(new Date()) : null;
                }
                save(); render();
            };

            const info = document.createElement('div');
            info.className = 'flex-1 min-w-0';
            const t = document.createElement('div');
            t.className = 'font-bold text-base truncate';
            t.textContent = a.time + (a.label ? '　' + a.label : '');
            const sub = document.createElement('div');
            sub.className = 'text-xs text-gray-500';
            const next = nextRing(a, now);
            let status = '';
            if (a.enabled === false) status = '已停用';
            else if (finished) status = '已響過';
            else if (next) status = fmtRemain(next - now);
            sub.textContent = REPEAT_LABEL[a.repeat] + '・' + SOUNDS[a.sound || 'bell'] + (status ? '・' + status : '');
            info.append(t, sub);

            const mkIcon = (text, title, handler, cls) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = text;
                b.title = title;
                b.setAttribute('aria-label', title);
                b.className = 'px-2 py-1 rounded hover:bg-gray-100 ' + cls;
                b.onclick = handler;
                return b;
            };
            const edit = mkIcon('✏️', '編輯', () => startEdit(a), '');
            const del = mkIcon('✕', '刪除', () => {
                const idx = alarms.indexOf(a);
                alarms = alarms.filter(x => x.id !== a.id);
                if (editingId === a.id) cancelEdit();
                save(); render();
                toast('已刪除 ' + a.time + (a.label ? ' ' + a.label : ''), () => {
                    alarms.splice(Math.min(idx, alarms.length), 0, a);
                    save(); render();
                });
            }, 'text-red-500');
            row.append(toggle, info, edit, del);
            list.appendChild(row);
        });
    }

    // ---------- 表單 ----------
    const $ = id => document.getElementById(id);

    function setForm(alarm) {
        $('timerAlarmTime').value = alarm ? alarm.time : nextRoundTime();
        $('timerAlarmLabel').value = alarm ? alarm.label : '';
        $('timerAlarmRepeat').value = alarm ? alarm.repeat : 'once';
        $('timerAlarmSound').value = alarm ? (alarm.sound || 'bell') : 'bell';
    }
    function startEdit(a) {
        editingId = a.id;
        setForm(a);
        $('timerAlarmAddBtn').textContent = '儲存修改';
        $('timerAlarmCancelBtn').classList.remove('hidden');
        $('timerAlarmTime').focus();
        render();
    }
    function cancelEdit() {
        editingId = null;
        setForm(null);
        $('timerAlarmAddBtn').textContent = '加入鬧鈴';
        $('timerAlarmCancelBtn').classList.add('hidden');
        render();
    }

    function submitAlarm() {
        const timeEl = $('timerAlarmTime');
        if (!/^\d{2}:\d{2}$/.test(timeEl.value)) {
            timeEl.focus();
            toast('請先選擇響鈴時間');
            return;
        }
        ensureAudio(); // 使用者按鈕當下解鎖音效，之後才能自動出聲
        if ('Notification' in window && Notification.permission === 'default') {
            try { Notification.requestPermission().then(updateNotifyHint); } catch (e) { /* 忽略 */ }
        }
        const fields = {
            time: timeEl.value,
            label: ($('timerAlarmLabel').value || '').trim().slice(0, 30),
            repeat: $('timerAlarmRepeat').value,
            sound: $('timerAlarmSound').value
        };
        const now = new Date();
        const pastToday = targetOn(now, fields.time).getTime() <= now.getTime();
        let msg;
        if (editingId) {
            const a = alarms.find(x => x.id === editingId);
            if (a) {
                Object.assign(a, fields, { enabled: true, done: false, snoozeUntil: null });
                a.lastFired = pastToday ? todayKey(now) : null;
            }
            msg = '已更新鬧鈴 ' + fields.time;
        } else {
            alarms.push(Object.assign({
                id: Date.now() + '-' + Math.random().toString(36).slice(2, 6),
                enabled: true,
                // 設定的時間今天已過，視為從明天開始（避免一加入就立刻響）
                lastFired: pastToday ? todayKey(now) : null,
                done: false,
                snoozeUntil: null
            }, fields));
            msg = '已加入鬧鈴 ' + fields.time + (pastToday ? '（今天已過，明天開始響）' : '');
        }
        save();
        editingId = null;
        $('timerAlarmAddBtn').textContent = '加入鬧鈴';
        $('timerAlarmCancelBtn').classList.add('hidden');
        $('timerAlarmLabel').value = '';
        $('timerAlarmTime').value = nextRoundTime();
        render();
        toast(msg);
    }

    function updateNotifyHint() {
        const el = $('timerAlarmNotifyHint');
        if (!el) return;
        const denied = 'Notification' in window && Notification.permission === 'denied';
        el.classList.toggle('hidden', !denied);
    }

    function injectStyles() {
        if ($('timerAlarmStyles')) return;
        const st = document.createElement('style');
        st.id = 'timerAlarmStyles';
        st.textContent = `
            @keyframes timerAlarmPop { from { transform: scale(.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
            @keyframes timerAlarmShake { 0%,100% { transform: rotate(0); } 25% { transform: rotate(-14deg); } 75% { transform: rotate(14deg); } }
            .timer-alarm-chip { border: 1px solid #d1d5db; background: #f9fafb; color: #374151; border-radius: 9999px;
                padding: 3px 10px; font-size: 12px; cursor: pointer; transition: background .15s; }
            .timer-alarm-chip:hover { background: #fee2e2; border-color: #fca5a5; }
            @media (prefers-reduced-motion: reduce) { [role=alertdialog] * { animation: none !important; } }
        `;
        document.head.appendChild(st);
    }

    function injectUI() {
        const anchor = $('countdownQuickTimers');
        if (!anchor || $('timerAlarmBox')) return;
        const opt = (obj) => Object.entries(obj).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
        const box = document.createElement('div');
        box.id = 'timerAlarmBox';
        box.className = 'border-t border-gray-200 pt-4 mt-2';
        box.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <h4 class="text-sm sm:text-base font-semibold">🔔 定時鬧鈴（指定幾點幾分響）</h4>
                <button type="button" id="timerAlarmClearDone" class="hidden text-xs text-gray-500 hover:text-red-600 underline">清除已響過</button>
            </div>
            <div class="grid grid-cols-2 gap-2 mb-2">
                <input type="time" id="timerAlarmTime" aria-label="響鈴時間"
                    class="w-full px-2 sm:px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 text-base sm:text-lg font-semibold">
                <select id="timerAlarmRepeat" aria-label="重複方式"
                    class="w-full px-2 sm:px-3 py-2 border border-gray-300 rounded-lg text-sm sm:text-base">${opt(REPEAT_LABEL)}</select>
            </div>
            <div class="flex flex-wrap gap-1 mb-2" id="timerAlarmRelChips" aria-label="快速設定幾分鐘後">
                <span class="text-xs text-gray-500 self-center mr-1">現在起：</span>
                ${REL_MINUTES.map(m => `<button type="button" class="timer-alarm-chip" data-rel="${m}">${m} 分後</button>`).join('')}
            </div>
            <div class="flex gap-2 mb-1">
                <input type="text" id="timerAlarmLabel" maxlength="30" placeholder="鬧鈴名稱（選填，例：下課、收作業）"
                    class="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 text-sm sm:text-base">
            </div>
            <div class="flex flex-wrap gap-1 mb-2" id="timerAlarmLabelChips">
                ${LABEL_CHIPS.map(l => `<button type="button" class="timer-alarm-chip" data-label="${l}">${l}</button>`).join('')}
            </div>
            <div class="grid grid-cols-[1fr_auto] gap-2 mb-2">
                <select id="timerAlarmSound" aria-label="鈴聲"
                    class="w-full px-2 sm:px-3 py-2 border border-gray-300 rounded-lg text-sm sm:text-base">${opt(SOUNDS)}</select>
                <button type="button" id="timerAlarmPreviewBtn"
                    class="bg-gray-200 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-300 text-sm active:scale-95 whitespace-nowrap">▶ 試聽</button>
            </div>
            <div class="grid grid-cols-2 gap-2 mb-3">
                <button type="button" id="timerAlarmAddBtn"
                    class="bg-red-500 text-white py-2 rounded-lg hover:bg-red-600 transition-colors text-sm active:scale-95 col-span-2">加入鬧鈴</button>
                <button type="button" id="timerAlarmCancelBtn"
                    class="hidden col-span-2 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 text-sm">取消編輯</button>
            </div>
            <div id="timerAlarmList" class="space-y-2"></div>
            <p id="timerAlarmNotifyHint" class="hidden text-xs text-amber-600 mt-2">⚠️ 瀏覽器通知被封鎖，分頁在背景時只會出聲，不會跳通知。</p>
            <p class="text-xs text-gray-500 mt-2">需保持班級小管家分頁開啟（可切到其他功能頁，也可縮到背景）；鬧鈴只存在這台電腦。</p>`;
        anchor.parentNode.appendChild(box);

        // 計時顯示區下方的「下一個鬧鈴」提示列
        const progress = $('timerProgress');
        if (progress && !$('timerAlarmNext')) {
            const next = document.createElement('div');
            next.id = 'timerAlarmNext';
            next.className = 'hidden mt-3 text-sm text-gray-700 bg-white/70 rounded-lg px-3 py-2';
            progress.parentNode.appendChild(next);
        }

        box.addEventListener('click', e => {
            const rel = e.target.closest('[data-rel]');
            if (rel) {
                const d = new Date(Date.now() + Number(rel.dataset.rel) * 60000);
                $('timerAlarmTime').value = pad(d.getHours()) + ':' + pad(d.getMinutes());
                $('timerAlarmRepeat').value = 'once';
                return;
            }
            const lab = e.target.closest('[data-label]');
            if (lab) { $('timerAlarmLabel').value = lab.dataset.label; return; }
        });
        $('timerAlarmAddBtn').addEventListener('click', submitAlarm);
        $('timerAlarmCancelBtn').addEventListener('click', cancelEdit);
        $('timerAlarmPreviewBtn').addEventListener('click', () => playSound($('timerAlarmSound').value));
        $('timerAlarmClearDone').addEventListener('click', () => {
            const removed = alarms.filter(a => a.repeat === 'once' && a.done);
            alarms = alarms.filter(a => !(a.repeat === 'once' && a.done));
            save(); render();
            toast('已清除 ' + removed.length + ' 個已響過的鬧鈴', () => { alarms.push(...removed); save(); render(); });
        });
        ['timerAlarmLabel', 'timerAlarmTime'].forEach(id => {
            $(id).addEventListener('keydown', e => { if (e.key === 'Enter') submitAlarm(); });
        });
        setForm(null);
        updateNotifyHint();
    }

    function init() {
        load();
        injectStyles();
        injectUI();
        render();
        check();
        setInterval(check, 1000);
        setInterval(render, 30000); // 更新「幾分鐘後」文字
        document.addEventListener('visibilitychange', () => { if (!document.hidden) { check(); render(); } });
        // 任何一次點擊都先解鎖音效，避免鬧鈴時被瀏覽器靜音
        document.addEventListener('click', ensureAudio, { once: true });
        window.TimerAlarm = { check, list: () => alarms.slice(), stop: stopRinging };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
