/**
 * 定時鬧鈴模組
 * 在「計時器」頁新增「幾點幾分響鈴」：可設定多組、單次／每天／平日重複、可延後 5 分鐘。
 * 鬧鈴排程與計時器分頁無關，切到其他功能頁也會準時響；資料存本機（不上雲端，鬧鈴屬於這台電腦）。
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'timerAlarms';
    const GRACE_MS = 5 * 60 * 1000;      // 電腦睡眠／分頁被節流時，5 分鐘內補響
    const SNOOZE_MS = 5 * 60 * 1000;
    const RING_MAX_MS = 60 * 1000;       // 沒人關就響滿 1 分鐘自動停
    const REPEAT_LABEL = { once: '只響一次', daily: '每天', weekday: '週一至週五' };

    let alarms = [];
    let audioCtx = null;
    let ringTimer = null;
    let ringStopTimer = null;
    let overlay = null;

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
        if (alarm.snoozeUntil && alarm.snoozeUntil > now.getTime()) return new Date(alarm.snoozeUntil);
        for (let i = 0; i < 8; i++) {
            const day = new Date(now);
            day.setDate(day.getDate() + i);
            if (!activeOn(alarm, day)) continue;
            if (alarm.repeat === 'once' && alarm.done) return null;
            const t = targetOn(day, alarm.time);
            if (t.getTime() > now.getTime() && alarm.lastFired !== todayKey(day)) return t;
        }
        return null;
    }
    function fmtRemain(ms) {
        const min = Math.max(0, Math.round(ms / 60000));
        if (min < 1) return '不到 1 分鐘';
        if (min < 60) return min + ' 分鐘後';
        const h = Math.floor(min / 60), m = min % 60;
        if (h < 24) return h + ' 小時' + (m ? ' ' + m + ' 分' : '') + '後';
        return Math.floor(h / 24) + ' 天後';
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
    function beepPattern() {
        const ctx = ensureAudio();
        if (!ctx) return;
        const now = ctx.currentTime;
        [0, 0.28, 0.56].forEach((offset, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(i === 2 ? 1175 : 880, now + offset);
            gain.gain.setValueAtTime(0.0001, now + offset);
            gain.gain.exponentialRampToValueAtTime(0.7, now + offset + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + offset);
            osc.stop(now + offset + 0.25);
        });
    }
    function stopRinging() {
        clearInterval(ringTimer);
        clearTimeout(ringStopTimer);
        ringTimer = ringStopTimer = null;
        if (overlay) { overlay.remove(); overlay = null; }
        document.title = document.title.replace(/^🔔 /, '');
    }

    // ---------- 響鈴 ----------
    function ring(alarm) {
        stopRinging();
        const title = alarm.label || '時間到了';

        overlay = document.createElement('div');
        overlay.setAttribute('role', 'alertdialog');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;';
        const card = document.createElement('div');
        card.style.cssText = 'background:#fff;color:#1f2937;border:4px solid #ef4444;border-radius:20px;padding:32px 40px;text-align:center;max-width:92vw;box-shadow:0 20px 50px rgba(0,0,0,.4);';
        const bell = document.createElement('div');
        bell.textContent = '🔔';
        bell.style.cssText = 'font-size:72px;line-height:1;margin-bottom:12px;';
        const clock = document.createElement('div');
        clock.textContent = alarm.time;
        clock.style.cssText = 'font-size:56px;font-weight:800;color:#dc2626;';
        const name = document.createElement('div');
        name.textContent = title;
        name.style.cssText = 'font-size:28px;font-weight:700;margin:8px 0 24px;word-break:break-word;';
        const btns = document.createElement('div');
        btns.style.cssText = 'display:flex;gap:12px;justify-content:center;flex-wrap:wrap;';
        const mkBtn = (text, bg) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = text;
            b.style.cssText = `background:${bg};color:#fff;border:0;border-radius:12px;padding:12px 28px;font-size:20px;font-weight:700;cursor:pointer;`;
            return b;
        };
        const closeBtn = mkBtn('我知道了', '#ef4444');
        const snoozeBtn = mkBtn('5 分鐘後再響', '#6b7280');
        closeBtn.onclick = stopRinging;
        snoozeBtn.onclick = () => {
            alarm.snoozeUntil = Date.now() + SNOOZE_MS;
            save(); render(); stopRinging();
        };
        btns.append(closeBtn, snoozeBtn);
        card.append(bell, clock, name, btns);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        closeBtn.focus();

        beepPattern();
        ringTimer = setInterval(beepPattern, 1500);
        ringStopTimer = setTimeout(stopRinging, RING_MAX_MS);

        document.title = '🔔 ' + document.title.replace(/^🔔 /, '');
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
            try { new Notification('⏰ ' + title, { body: alarm.time + ' 鬧鈴時間到了' }); } catch (e) { /* 部分瀏覽器不支援 */ }
        }
    }

    // ---------- 檢查 ----------
    function check() {
        const now = new Date();
        let changed = false;
        let toRing = null;
        alarms.forEach(a => {
            if (a.enabled === false) return;
            let due = false;
            if (a.snoozeUntil) {
                if (now.getTime() >= a.snoozeUntil && now.getTime() - a.snoozeUntil < GRACE_MS) due = true;
                if (now.getTime() >= a.snoozeUntil) { a.snoozeUntil = null; changed = true; }
            } else if (activeOn(a, now) && a.lastFired !== todayKey(now)) {
                const t = targetOn(now, a.time).getTime();
                if (now.getTime() >= t && now.getTime() - t < GRACE_MS && !(a.repeat === 'once' && a.done)) {
                    due = true;
                    a.lastFired = todayKey(now);
                    if (a.repeat === 'once') a.done = true;
                    changed = true;
                }
            }
            if (due && !toRing) toRing = a;
        });
        if (changed) { save(); render(); }
        if (toRing) ring(toRing);
    }

    // ---------- 介面 ----------
    function render() {
        const list = document.getElementById('timerAlarmList');
        if (!list) return;
        list.innerHTML = '';
        if (!alarms.length) {
            const empty = document.createElement('div');
            empty.className = 'text-xs text-gray-500 text-center py-2';
            empty.textContent = '尚未設定鬧鈴';
            list.appendChild(empty);
            return;
        }
        const now = new Date();
        [...alarms].sort((a, b) => a.time.localeCompare(b.time)).forEach(a => {
            const row = document.createElement('div');
            row.className = 'flex items-center gap-2 p-2 border border-gray-200 rounded-lg bg-white';

            const toggle = document.createElement('input');
            toggle.type = 'checkbox';
            toggle.checked = a.enabled !== false && !(a.repeat === 'once' && a.done);
            toggle.title = '啟用／停用';
            toggle.onchange = () => {
                a.enabled = toggle.checked;
                if (toggle.checked && a.repeat === 'once') { a.done = false; a.lastFired = null; }
                save(); render();
            };

            const info = document.createElement('div');
            info.className = 'flex-1 min-w-0';
            const t = document.createElement('div');
            t.className = 'font-bold text-base';
            t.textContent = a.time + (a.label ? '　' + a.label : '');
            const sub = document.createElement('div');
            sub.className = 'text-xs text-gray-500';
            const next = nextRing(a, now);
            let status;
            if (a.enabled === false) status = '已停用';
            else if (a.repeat === 'once' && a.done) status = '已響過';
            else if (next) status = fmtRemain(next - now);
            else status = '';
            sub.textContent = REPEAT_LABEL[a.repeat] + (status ? '・' + status : '');
            info.append(t, sub);

            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'text-red-500 hover:text-red-700 px-2';
            del.textContent = '✕';
            del.title = '刪除';
            del.onclick = () => {
                alarms = alarms.filter(x => x.id !== a.id);
                save(); render();
            };
            row.append(toggle, info, del);
            list.appendChild(row);
        });
    }

    function addAlarm() {
        const timeEl = document.getElementById('timerAlarmTime');
        const labelEl = document.getElementById('timerAlarmLabel');
        const repeatEl = document.getElementById('timerAlarmRepeat');
        if (!timeEl || !/^\d{2}:\d{2}$/.test(timeEl.value)) {
            alert('請先選擇響鈴時間');
            return;
        }
        ensureAudio(); // 使用者按鈕當下解鎖音效，之後才能自動出聲
        if ('Notification' in window && Notification.permission === 'default') {
            try { Notification.requestPermission(); } catch (e) { /* 忽略 */ }
        }
        const alarm = {
            id: Date.now() + '-' + Math.random().toString(36).slice(2, 6),
            time: timeEl.value,
            label: (labelEl.value || '').trim().slice(0, 30),
            repeat: repeatEl.value,
            enabled: true,
            lastFired: null,
            done: false,
            snoozeUntil: null
        };
        // 單次鬧鈴若設定時間已過，視為明天（避免一加入就立刻響）
        const now = new Date();
        if (alarm.repeat === 'once' && targetOn(now, alarm.time).getTime() <= now.getTime()) {
            alarm.lastFired = todayKey(now);
        }
        alarms.push(alarm);
        save();
        labelEl.value = '';
        render();
    }

    function injectUI() {
        const anchor = document.getElementById('countdownQuickTimers');
        if (!anchor || document.getElementById('timerAlarmBox')) return;
        const box = document.createElement('div');
        box.id = 'timerAlarmBox';
        box.className = 'border-t border-gray-200 pt-4 mt-2';
        box.innerHTML = `
            <h4 class="text-sm sm:text-base font-semibold mb-2">🔔 定時鬧鈴（指定幾點幾分響）</h4>
            <div class="grid grid-cols-2 gap-2 mb-2">
                <input type="time" id="timerAlarmTime" aria-label="響鈴時間"
                    class="w-full px-2 sm:px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 text-sm sm:text-base">
                <select id="timerAlarmRepeat" aria-label="重複方式"
                    class="w-full px-2 sm:px-3 py-2 border border-gray-300 rounded-lg text-sm sm:text-base">
                    <option value="once">只響一次</option>
                    <option value="weekday">週一至週五</option>
                    <option value="daily">每天</option>
                </select>
            </div>
            <div class="flex gap-2 mb-2">
                <input type="text" id="timerAlarmLabel" maxlength="30" placeholder="鬧鈴名稱（選填，例：下課、收作業）"
                    class="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 text-sm sm:text-base">
                <button type="button" id="timerAlarmAddBtn"
                    class="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors text-sm active:scale-95 whitespace-nowrap">加入鬧鈴</button>
            </div>
            <div id="timerAlarmList" class="space-y-2"></div>
            <p class="text-xs text-gray-500 mt-2">需保持班級小管家分頁開啟（可切到其他功能頁，也可縮到背景）；鬧鈴只存在這台電腦。</p>`;
        anchor.parentNode.appendChild(box);
        document.getElementById('timerAlarmAddBtn').addEventListener('click', addAlarm);
        document.getElementById('timerAlarmLabel').addEventListener('keydown', e => {
            if (e.key === 'Enter') addAlarm();
        });
    }

    function init() {
        load();
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
