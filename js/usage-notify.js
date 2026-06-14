/**
 * usage-notify.js
 * 📡 使用情形通知（→ Cloud Function `notifyUsage` → Google Chat）
 * @version 3.10.0
 *
 * 目的：讓開發者（阿凱老師）即時掌握老師們的使用情形。
 *   - session_start：每場 session 報一次「有老師正在使用」
 *   - login：Google 帳號登入（每場每人一次）
 *   - class_create：建立新班級（重要動作，必報）
 *   - feature：使用功能（每場每功能只報第一次，避免洗版）
 *   - error：系統錯誤（同訊息每場一次、每場上限 5 則）
 *
 * 設計原則：
 *   1. 純 fire-and-forget，任何失敗都「吞掉」，通知絕不影響 App 正常運作。
 *   2. webhook 秘密只存在 Cloud Function 端，前端零金鑰、零 URL、零 CORS 問題。
 *   3. 持久化佇列（localStorage）：建立班級後會 reload，事件先入列、
 *      下次載入再補送，確保不漏。Function 尚未部署時也只是留在佇列等之後補送。
 *
 * 對外：window.UsageNotify.{ init, login, classCreate, feature, error }
 */
(function () {
    'use strict';

    var REGION = 'asia-east1';            // 必須與 Cloud Function 部署區域一致
    var FN_NAME = 'notifyUsage';
    var QKEY = 'un_queue_v1';             // localStorage 佇列
    var SS = 'un_';                       // sessionStorage 去重前綴
    var MAX_QUEUE = 50;
    var MAX_ERRORS_PER_SESSION = 5;

    var FEATURE_LABELS = {
        students: '學生管理', points: '加扣分', grouping: '隨機分組', lottery: '號碼抽籤',
        timer: '計時器', notebook: '隨堂筆記', homework: '作業檢查', exam: '考試監考',
        zodiac: '開運拉霸', board: '班級經營工具板', brush: '潔牙勾選',
        comment: '評語生成器', dialogue: '對話小學堂', backup: '資料備份', announcement: '班級公告'
    };

    var started = false;
    var errCount = 0;
    var flushing = false;
    var callableFn = null;

    // ───────── 工具 ─────────
    function getCallable() {
        if (callableFn) return callableFn;
        try {
            if (typeof firebase === 'undefined' || typeof firebase.app !== 'function') return null;
            var app = firebase.app();
            if (typeof app.functions !== 'function') return null;   // functions-compat 尚未載入
            callableFn = app.functions(REGION).httpsCallable(FN_NAME);
            return callableFn;
        } catch (e) { return null; }
    }

    function ssOnce(key) {
        try {
            if (sessionStorage.getItem(SS + key)) return false;
            sessionStorage.setItem(SS + key, '1');
            return true;
        } catch (e) { return true; }   // 儲存被擋時，寧可放行（不至於洗版，量本來就小）
    }

    function loadQ() {
        try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch (e) { return []; }
    }
    function saveQ(q) {
        try { localStorage.setItem(QKEY, JSON.stringify(q.slice(-MAX_QUEUE))); } catch (e) { /* ignore */ }
    }

    function enqueue(type, data) {
        var ev = Object.assign({ type: type, ts: new Date().toISOString() }, data || {});
        ev._id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        var q = loadQ();
        q.push(ev);
        saveQ(q);
        flush();
    }

    // 逐筆補送：成功才從佇列移除；失敗（含 Function 未部署）保留待下次
    function flush() {
        var fn = getCallable();
        if (!fn || flushing) return;
        var q = loadQ();
        if (!q.length) return;
        flushing = true;
        var idx = 0;
        function next() {
            if (idx >= q.length) { flushing = false; return; }
            var ev = q[idx];
            var payload = {};
            for (var k in ev) { if (k !== '_id') payload[k] = ev[k]; }
            var p;
            try { p = fn(payload); } catch (e) { flushing = false; return; }
            p.then(function () {
                var cur = loadQ().filter(function (x) { return x._id !== ev._id; });
                saveQ(cur);
            }).catch(function () { /* 保留於佇列，下次再試 */ })
              .then(function () { idx++; next(); });
        }
        next();
    }

    function hash(s) {
        var h = 0;
        for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
        return Math.abs(h).toString(36);
    }

    // ───────── 對外 API ─────────
    var API = {
        init: function () {
            if (started) return;
            started = true;
            var done = false;
            var fire = function () {
                if (done) return;
                done = true;
                if (ssOnce('session')) enqueue('session_start', {});
                else flush();   // 本場已報過，順手補送殘留佇列（如建立班級後 reload 的事件）
            };
            // 盡量等 Firebase Auth 就緒再送（callable 才帶得到身分）；逾時仍會送出。
            // 注意：firebase.auth() 在 initializeApp 前會丟錯，故輪詢等待。
            var tries = 0;
            var timer = setInterval(function () {
                tries++;
                var authObj = null;
                try { authObj = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth() : null; } catch (e) { authObj = null; }
                if (authObj) {
                    clearInterval(timer);
                    try { authObj.onAuthStateChanged(function () { fire(); }); } catch (e) { fire(); }
                    setTimeout(fire, 3000);   // 保險：監聽沒回也送
                } else if (tries >= 40) {       // 約 10 秒仍無 auth：直接送（身分從缺）
                    clearInterval(timer);
                    fire();
                }
            }, 250);
        },

        // Google 帳號登入：每場每人一次
        login: function (profile) {
            var email = (profile && profile.email) || '';
            if (!ssOnce('login_' + (email || 'x'))) return;
            enqueue('login', { name: (profile && profile.displayName) || '', email: email });
        },

        // 建立新班級：重要動作，必報（reload 也不漏，靠持久化佇列）
        classCreate: function (className) {
            enqueue('class_create', { className: className || '' });
        },

        // 使用功能：每場每功能只報第一次
        feature: function (name) {
            if (!name) return;
            if (!ssOnce('feat_' + name)) return;
            enqueue('feature', { feature: name, label: FEATURE_LABELS[name] || name });
        },

        // 系統錯誤：同訊息每場一次、每場上限 5 則
        error: function (message, context) {
            message = String(message == null ? '' : message).slice(0, 300);
            if (!message) return;
            if (errCount >= MAX_ERRORS_PER_SESSION) return;
            if (!ssOnce('err_' + hash(message))) return;
            errCount++;
            enqueue('error', { message: message, context: String(context == null ? '' : context).slice(0, 160) });
        }
    };

    window.UsageNotify = API;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { API.init(); });
    } else {
        API.init();
    }
})();
