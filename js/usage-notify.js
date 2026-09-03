/**
 * usage-notify.js
 * 📡 使用情形通知（→ Cloud Function `notifyUsage` → Google Chat）
 * @version 3.13.0
 *
 * 目的：讓開發者（阿凱老師）掌握老師們的使用情形，但避免手機被逐筆通知洗版。
 *
 * v3.13.0 通知策略改為「留底與打擾分離」：
 *   所有事件一律送到 Cloud Function 留底（寫入 Firestore `_usageEvents`），
 *   但只有「值得馬上看一眼」的事件會即時推 Google Chat，其餘交由伺服端
 *   每天 21:00 的「今日戰報」彙整成一則。分流規則在 functions/index.js 的
 *   INSTANT_PUSH_TYPES，前端不需要（也不該）自己決定要不要吵人。
 *
 *   - session_start：每台裝置每天一次（只留底，進戰報）
 *   - login        ：Google 帳號登入，每台裝置每天一次（只留底，進戰報）
 *   - login_new    ：新老師首次註冊 —— 即時推播，且刻意不節流
 *   - class_create ：建立新班級 —— 即時推播
 *   - data_action  ：刪班 / 還原覆蓋 / 學期封存等不可逆操作 —— 即時推播
 *   - feature      ：功能點擊，累積在本機並「當天內」定期回報（不再等到隔天），
 *                    伺服端以「日期＋使用者＋裝置」覆寫，戰報再跨裝置加總
 *   - error        ：系統錯誤 —— 即時推播（同訊息每場一次、每場上限 5 則）
 *
 * 設計原則：
 *   1. 純 fire-and-forget，任何失敗都「吞掉」，通知絕不影響 App 正常運作。
 *   2. webhook 秘密只存在 Cloud Function 端，前端零金鑰、零 URL、零 CORS 問題。
 *   3. 持久化佇列（localStorage）：建立班級後會 reload，事件先入列、
 *      下次載入再補送，確保不漏。Function 尚未部署時也只是留在佇列等之後補送。
 *   4. 功能統計是「當日累計值」而非增量，重複回報會被伺服端覆寫而不是累加，
 *      所以多送幾次不會把數字灌大；佇列裡也只保留同一天的最後一份。
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
    var DEVICE_KEY = 'un_device_v1';      // 穩定的裝置識別（讓伺服端能「覆寫」而非累加同裝置統計）
    var STATS_FLUSH_MS = 2 * 60 * 1000;   // 功能統計最快每 2 分鐘回報一次

    var statsFlushTimer = null;
    var lastStatsSig = '';          // 上次已回報的統計內容指紋（內容沒變就不重送）

    /** 取得（必要時建立）本機裝置識別碼；純用於統計去重，不含任何個資。 */
    function deviceId() {
        try {
            var id = localStorage.getItem(DEVICE_KEY);
            if (!id) {
                id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
                localStorage.setItem(DEVICE_KEY, id);
            }
            return id;
        } catch (e) { return 'nostorage'; }
    }

    // 取台北時區的 YYYY-MM-DD。
    // ⚠️ 一定要用台北時區，不能用 toISOString()（那是 UTC）：台灣是 UTC+8，
    //    UTC 日期在台北時間早上 8 點才換日，老師 07:30 到校用的那半小時會被
    //    歸到「前一天」，導致當日統計掉進昨天的桶子、今晚的戰報看不到。
    //    伺服端 taipeiDay() 也是同一套算法，兩邊必須一致。
    function todayKey() {
        try {
            return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
        } catch (e) {
            return new Date().toISOString().slice(0, 10);   // 極舊瀏覽器保底
        }
    }

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
    var STATS_KEY = 'un_feature_stats_v1';

    // 送出某一天的功能統計。送的是「當日累計值」，伺服端以
    // （日期＋使用者＋裝置）為 key 覆寫，所以同一天送幾次都不會把數字灌大。
    function sendFeatureSummary(statsObj) {
        if (!statsObj || !statsObj.stats || Object.keys(statsObj.stats).length === 0) return;
        enqueueReplace('feature_summary', {
            date: statsObj.date,
            stats: statsObj.stats,
            deviceId: deviceId()
        }, 'featsum_' + statsObj.date);
    }

    // 把「今天」的累計統計即時回報一次（不再等到隔天才補送）。
    // 原本只在跨天時才送，導致老師學期末的統計要等他下次開機才會到，
    // 換裝置或清快取則直接遺失；改成當天就回報，戰報才拿得到當日資料。
    function flushTodayStats() {
        try {
            var today = todayKey();
            var raw = localStorage.getItem(STATS_KEY);
            if (!raw) return;
            var statsObj = JSON.parse(raw);
            if (!statsObj || statsObj.date !== today) return;

            // 內容與上次回報完全相同就別再送一次：老師整天掛著 App 時，
            // 每 2 分鐘一次的節流最多會打出 200 多通，會撞到伺服端的
            // 每日事件上限，反而讓當天後段的統計進不了戰報。
            var sig = statsSignature(statsObj.stats);
            if (sig === lastStatsSig) return;
            lastStatsSig = sig;

            sendFeatureSummary(statsObj);
        } catch (e) { /* ignore */ }
    }

    /** 統計內容指紋：key 排序後序列化，避免因物件鍵順序不同而誤判為「有變動」。 */
    function statsSignature(stats) {
        try {
            return Object.keys(stats || {}).sort().map(function (k) {
                return k + ':' + stats[k];
            }).join('|');
        } catch (e) { return String(Math.random()); }
    }

    // 節流排程：功能點擊後最快 STATS_FLUSH_MS 才回報一次，避免連點洗佇列。
    function scheduleStatsFlush() {
        if (statsFlushTimer) return;
        statsFlushTimer = setTimeout(function () {
            statsFlushTimer = null;
            flushTodayStats();
        }, STATS_FLUSH_MS);
    }

    function checkAndSendOldStats() {
        try {
            var today = todayKey();
            var raw = localStorage.getItem(STATS_KEY);
            if (raw) {
                var statsObj = JSON.parse(raw);
                if (statsObj && statsObj.date && statsObj.date !== today) {
                    sendFeatureSummary(statsObj);
                    localStorage.removeItem(STATS_KEY);
                }
            }
        } catch (e) { /* ignore */ }
    }

    function recordFeature(name) {
        try {
            var label = FEATURE_LABELS[name] || name;
            if (!label) return;
            var today = todayKey();
            var raw = localStorage.getItem(STATS_KEY);
            var statsObj = null;
            try { statsObj = raw ? JSON.parse(raw) : null; } catch (e) {}

            if (!statsObj || typeof statsObj.stats !== 'object') {
                statsObj = { date: today, stats: {} };
            } else if (statsObj.date !== today) {
                sendFeatureSummary(statsObj);
                statsObj = { date: today, stats: {} };
            }

            statsObj.stats[label] = (statsObj.stats[label] || 0) + 1;
            localStorage.setItem(STATS_KEY, JSON.stringify(statsObj));
            scheduleStatsFlush();
        } catch (e) { /* ignore */ }
    }

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

    // 「每天只放行一次」去重：用 localStorage 存當天日期（key 固定、值為日期，不會累積膨脹）。
    // 跨「整天」而非「每場 session」降頻 → 同一位老師一天只報一次來訪 / 登入。
    function dayOnce(key) {
        try {
            var today = todayKey();   // 台北時區 YYYY-MM-DD（與伺服端同一套日界線）
            var k = SS + 'day_' + key;
            if (localStorage.getItem(k) === today) return false;
            localStorage.setItem(k, today);
            return true;
        } catch (e) { return true; }   // 儲存被擋時放行（量本來就小）
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

    // 與 enqueue 相同，但會先把佇列裡同一個 dedupe key 的舊事件移除。
    // 用於「當日累計值」這種後蓋前的事件（功能統計），避免離線時佇列
    // 塞滿同一天的十幾份中途快照。
    function enqueueReplace(type, data, dedupeKey) {
        var ev = Object.assign({ type: type, ts: new Date().toISOString() }, data || {});
        ev._id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        ev._dedupe = dedupeKey;
        var q = loadQ().filter(function (x) { return x._dedupe !== dedupeKey; });
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

        function next() {
            var currentQ = loadQ();
            if (!currentQ.length) {
                flushing = false;
                return;
            }
            var ev = currentQ[0];
            var payload = {};
            for (var k in ev) { if (k !== '_id' && k !== '_dedupe') payload[k] = ev[k]; }
            var p;
            try { p = fn(payload); } catch (e) { flushing = false; return; }
            p.then(function () {
                var cur = loadQ().filter(function (x) { return x._id !== ev._id; });
                saveQ(cur);
            }).catch(function () {
                // 失敗時停止發送，保留在佇列中
                flushing = false;
            }).then(function () {
                if (flushing) {
                    setTimeout(next, 0); // 讓出 thread 避免 stack overflow
                }
            });
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
                checkAndSendOldStats(); // 補送昨天的功能統計
                if (dayOnce('session')) enqueue('session_start', {});
                else flush();   // 今天已報過，順手補送殘留佇列（如建立班級後 reload 的事件）
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
        login: function (profile, isNewUser) {
            var email = (profile && profile.email) || '';
            var isNew = !!isNewUser;
            // 新註冊帳號不受 dayOnce 限制，必須即時送出
            if (!isNew && !dayOnce('login_' + (email || 'x'))) {
                checkAndSendOldStats();
                return;
            }
            checkAndSendOldStats();
            enqueue('login', { name: (profile && profile.displayName) || '', email: email, isNewUser: isNew });
        },

        // 建立新班級：重要動作，必報（reload 也不漏，靠持久化佇列）
        classCreate: function (className) {
            enqueue('class_create', { className: className || '' });
        },

        // 使用功能：累積今日統計，並在節流後回報當日累計值（不逐筆通知，只進戰報）
        feature: function (name) {
            recordFeature(name);
        },

        // 系統錯誤：同訊息每場一次、每場上限 5 則；預設嚴重錯誤 (critical) 才發送通知
        error: function (message, context, severity) {
            message = String(message == null ? '' : message).slice(0, 300);
            if (!message) return;
            
            var sev = String(severity || 'critical').toLowerCase();
            if (sev !== 'critical') {
                return; // 非嚴重錯誤不發送通知
            }

            if (errCount >= MAX_ERRORS_PER_SESSION) return;
            if (!ssOnce('err_' + hash(message))) return;
            errCount++;

            var url = '';
            var ua = '';
            try {
                url = window.location.href;
                ua = navigator.userAgent;
            } catch (e) {}

            enqueue('error', { 
                message: message, 
                context: String(context == null ? '' : context).slice(0, 160),
                severity: sev,
                url: url,
                ua: ua
            });
        },

        // 重大資料操作（刪除班級 / 雲端還原覆蓋 / 還原本機備份 / 學期封存）：
        // 不可逆且影響老師的資料，屬於「值得馬上看一眼」，伺服端會即時推播。
        dataAction: function (action, details) {
            enqueue('data_action', {
                action: String(action || '').slice(0, 80),
                details: String(details || '').slice(0, 300)
            });
        }
    };

    window.UsageNotify = API;

    // 老師切走 / 關閉分頁時，把當日累計統計補送一次，避免整節課的使用量
    // 卡在節流計時器裡沒送出（回報是覆寫語意，多送一次不會重複計算）。
    try {
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') flushTodayStats();
        });
        window.addEventListener('pagehide', function () { flushTodayStats(); });
    } catch (e) { /* ignore */ }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { API.init(); });
    } else {
        API.init();
    }
})();
