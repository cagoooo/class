/**
 * 班級小管家 — 使用情形 Google Chat 通知
 *
 * 架構：前端用「已登入的 Firebase SDK」呼叫這支 Callable Function（自動帶身分，
 * 不可偽造），Function 端把事件組成 cardsV2 卡片，POST 到 Google Chat incoming
 * webhook 推到老師（開發者）的手機。
 *
 * 🔐 webhook 網址 = 發文金鑰，絕不寫進原始碼 / 公開 repo。
 *    存在 Cloud Functions 的 Secret（Secret Manager）：
 *      firebase functions:secrets:set GOOGLE_CHAT_WEBHOOK
 *
 * 部署（學校帳號、需 Blaze 方案）：
 *      firebase deploy --only functions --project <你的專案ID> \
 *        --account=ipad@mail2.smes.tyc.edu.tw
 *
 * 區域固定 asia-east1（台灣最近），前端呼叫端也要用同一區域。
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();

const GOOGLE_CHAT_WEBHOOK = defineSecret('GOOGLE_CHAT_WEBHOOK');

const REGION = 'asia-east1';

// 事件樣式對照（標題 emoji + 中文）
const EVENT_META = {
  session_start:   { emoji: '👋', title: '有老師開始使用班級小管家' },
  login:           { emoji: '🔐', title: '老師登入使用' },
  login_new:       { emoji: '🎉', title: '新老師註冊加入！' },
  class_create:    { emoji: '🏫', title: '建立了新班級' },
  feature_summary: { emoji: '📊', title: '功能使用統計彙整' },
  data_action:     { emoji: '⚙️', title: '重大資料操作' },
  error:           { emoji: '🐞', title: '系統發生錯誤' },
};

/** 從 Auth token 取出可辨識的身分字串（Google 登入有 email / 姓名；匿名則標示訪客） */
function identityOf(auth) {
  const token = (auth && auth.token) || {};
  const provider = (token.firebase && token.firebase.sign_in_provider) || '';
  const name = token.name || '';
  const email = token.email || '';
  if (email || name) {
    return { label: [name, email].filter(Boolean).join(' · '), email, name, anonymous: false };
  }
  return { label: provider === 'anonymous' ? '匿名訪客 👤' : '未知使用者 👤', email: '', name: '', anonymous: true };
}

/** 安全裁切字串 */
function clip(s, n) {
  return String(s == null ? '' : s).slice(0, n);
}

/** 組 cardsV2 卡片 */
function buildCard(type, data, who) {
  const meta = EVENT_META[type] || { emoji: '🔔', title: '使用事件' };
  
  // 基礎資訊區塊 (使用者 & 時間)
  let timeText = '';
  try {
    const d = data.ts ? new Date(data.ts) : new Date();
    timeText = d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
  } catch (e) { timeText = clip(data.ts, 40); }

  const baseSection = {
    widgets: [
      { decoratedText: { topLabel: '使用者', text: who.label, wrapText: true } },
      { decoratedText: { topLabel: '時間', text: timeText, wrapText: true } }
    ]
  };

  // 詳細內容區塊
  const contentWidgets = [];

  if (type === 'login' || type === 'login_new') {
    if (type === 'login_new') {
      contentWidgets.push({
        decoratedText: {
          topLabel: '註冊狀態',
          text: '🎉 恭喜！這是該帳號首次完成 Google 登入註冊。',
          wrapText: true
        }
      });
    } else {
      contentWidgets.push({
        decoratedText: {
          topLabel: '登入狀態',
          text: '🔐 已成功完成 Google 帳號驗證。',
          wrapText: true
        }
      });
    }
  }

  if (type === 'class_create' && data.className) {
    contentWidgets.push({
      decoratedText: {
        topLabel: '新班級名稱',
        text: clip(data.className, 80),
        wrapText: true
      }
    });
  }

  if (type === 'feature_summary' && data.stats) {
    const statsLines = [];
    for (const label in data.stats) {
      statsLines.push(`• ${label}: ${data.stats[label]} 次`);
    }
    contentWidgets.push({
      decoratedText: {
        topLabel: `功能點擊累計 (${data.date || ''})`,
        text: statsLines.join('\n') || '無使用記錄',
        wrapText: true
      }
    });
  }

  if (type === 'data_action') {
    contentWidgets.push({
      decoratedText: {
        topLabel: '操作類型',
        text: clip(data.action, 80),
        wrapText: true
      }
    });
    if (data.details) {
      contentWidgets.push({
        decoratedText: {
          topLabel: '詳細描述',
          text: clip(data.details, 300),
          wrapText: true
        }
      });
    }
  }

  if (type === 'error') {
    contentWidgets.push({
      decoratedText: {
        topLabel: '錯誤訊息',
        text: clip(data.message, 300),
        wrapText: true
      }
    });
    if (data.context) {
      contentWidgets.push({
        decoratedText: {
          topLabel: '發生位置',
          text: clip(data.context, 160),
          wrapText: true
        }
      });
    }
    if (data.url) {
      contentWidgets.push({
        decoratedText: {
          topLabel: '當前網址',
          text: clip(data.url, 250),
          wrapText: true
        }
      });
    }
    if (data.ua) {
      let device = '未知裝置';
      const ua = data.ua;
      if (ua.includes('iPad')) device = 'iPad 📱';
      else if (ua.includes('iPhone')) device = 'iPhone 📱';
      else if (ua.includes('Macintosh')) device = 'Mac 💻';
      else if (ua.includes('Windows')) device = 'Windows 💻';
      else if (ua.includes('Android')) device = 'Android 📱';
      
      let browser = '未知瀏覽器';
      if (ua.includes('Edg/')) browser = 'Edge';
      else if (ua.includes('Chrome/')) browser = 'Chrome';
      else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
      else if (ua.includes('Firefox/')) browser = 'Firefox';

      contentWidgets.push({
        decoratedText: {
          topLabel: '執行環境',
          text: `${device} / ${browser}`,
          wrapText: true
        }
      });
    }
  }

  const sections = [baseSection];
  if (contentWidgets.length > 0) {
    sections.push({
      header: '事件詳情',
      widgets: contentWidgets
    });
  }

  // 產生推播通知的純文字摘要，避免手機上只顯示「傳送了一個附件檔案給你」
  let notificationText = `${meta.emoji} ${meta.title}`;
  if (who.label) {
    notificationText += ` (${who.label})`;
  }
  if (type === 'class_create' && data.className) {
    notificationText += `\n🏫 班級名稱: ${clip(data.className, 80)}`;
  } else if (type === 'data_action') {
    notificationText += `\n⚙️ 操作: ${clip(data.action, 80)}`;
    if (data.details) {
      notificationText += ` - ${clip(data.details, 100)}`;
    }
  } else if (type === 'error' && data.message) {
    notificationText += `\n🐞 錯誤: ${clip(data.message, 150)}`;
  } else if (type === 'feature_summary' && data.stats) {
    const statsLines = [];
    for (const label in data.stats) {
      statsLines.push(`${label}: ${data.stats[label]}次`);
    }
    if (statsLines.length > 0) {
      notificationText += `\n📊 使用摘要: ${statsLines.join(', ')}`;
    }
  }

  return {
    text: notificationText,
    cardsV2: [{
      cardId: 'usage-' + Date.now(),
      card: {
        header: { 
          title: meta.emoji + ' ' + meta.title, 
          subtitle: '班級小管家 · 使用情形' 
        },
        sections: sections,
      },
    }],
  };
}

// ─────────────────────────────────────────────────────────────
// 📥 事件留底（_usageEvents）與 🔕 通知分流
//
// v3.13.0 起，notifyUsage 的職責拆成兩件事：
//   ① 留底：所有事件一律寫進 Firestore `_usageEvents`，供維運後台查歷史、
//      算趨勢，也是每日戰報（dailyUsageDigest）的資料來源。
//   ② 打擾：只有「值得馬上看一眼」的事件才即時推 Google Chat。
//
// 這麼拆是因為老師越來越多之後，「有老師來了 / 有老師登入了」這類日常事件
// 會隨老師數線性成長把手機洗版，但它們的價值是「趨勢」而不是「單筆」——
// 適合被彙整進每天一則的戰報，而不是逐筆震動。
//
// ⏳ TTL：每筆事件都寫 `expireAt`，需在 Firebase Console →
//    Firestore → TTL 為 `_usageEvents` 與 `_usageRateLimits` 兩個 collection
//    的 `expireAt` 欄位各建立一條 TTL 政策，過期文件才會自動清掉。
//    （沒建政策也不會壞，只是舊資料不會自動消失。）
// ─────────────────────────────────────────────────────────────

const EVENT_LOG_COLLECTION = '_usageEvents';
const EVENT_RETENTION_DAYS = 180;

// 值得即時推 Google Chat 的事件；其餘只留底，交給每日戰報彙整。
const INSTANT_PUSH_TYPES = new Set(['login_new', 'class_create', 'data_action', 'error']);

// 每個身分每日上限：error 推播 5 則（沿用舊規則）、事件留底 200 筆（防呆用）。
const MAX_ERROR_PUSH_PER_DAY = 5;
const MAX_EVENTS_PER_DAY = 300;

/** 取台北時區的 YYYY-MM-DD（做為事件的日期分桶鍵）。 */
function taipeiDay(d) {
  return (d || new Date()).toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
}

/** 依保留天數算出 TTL 到期時間。 */
function expiryTimestamp() {
  return admin.firestore.Timestamp.fromMillis(
    Date.now() + EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
}

/**
 * 單一交易同時處理兩種配額，避免每次呼叫多開一次交易：
 *   - log ：今日事件留底是否還有額度（所有型別共用 MAX_EVENTS_PER_DAY）
 *   - push：error 事件今日是否還能推 Chat（MAX_ERROR_PUSH_PER_DAY）
 *
 * 前端 usage-notify.js 的節流只在前端生效，若有人繞過前端直接呼叫這支
 * callable，那些節流形同虛設；這裡在伺服端再把關一次。
 * 配額檢查本身出錯則 fail-open 全部放行，避免限流機制的 bug 反而吞掉
 * 真正需要被看到的錯誤通報。
 */
async function checkQuota(uid, isError) {
  const key = uid || 'no-auth';
  const day = taipeiDay();
  const ref = admin.firestore().collection('_usageRateLimits').doc(`${key}_${day}`);
  try {
    return await admin.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const d = snap.exists ? (snap.data() || {}) : {};
      const total = d.total || 0;
      // 舊版欄位叫 count（只算 error），保留相容避免升級當天配額被重置
      const errors = (d.errors != null ? d.errors : d.count) || 0;

      const canLog = total < MAX_EVENTS_PER_DAY;
      const canPush = !isError || errors < MAX_ERROR_PUSH_PER_DAY;

      const patch = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        expireAt: expiryTimestamp(),
      };
      if (canLog) patch.total = total + 1;
      if (isError && canPush) patch.errors = errors + 1;
      tx.set(ref, patch, { merge: true });

      return { log: canLog, push: canPush };
    });
  } catch (e) {
    logger.error('[Quota] 配額檢查失敗，預設放行', e);
    return { log: true, push: true };
  }
}

/**
 * 把事件寫進 `_usageEvents` 留底。
 *
 * feature_summary 用「日期 + 使用者 + 裝置」組成固定 doc id，讓同一台裝置
 * 同一天的多次回報是「覆寫」而不是「累加」——前端送的是當日累計值，
 * 覆寫才不會把數字重複灌大。其餘事件用自動 id。
 *
 * 留底失敗絕不影響推播（整支包在 try/catch 裡）。
 */
async function logUsageEvent(eventType, data, who, uid) {
  try {
    const db = admin.firestore();
    const day = eventType === 'feature_summary' && data.date
      ? String(data.date).slice(0, 10)
      : taipeiDay();

    const doc = {
      type: eventType,
      day,
      uid: uid || '',
      email: who.email || '',
      name: who.name || '',
      label: who.label || '',
      anonymous: !!who.anonymous,
      ts: data.ts ? String(data.ts).slice(0, 40) : new Date().toISOString(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expireAt: expiryTimestamp(),
    };

    if (eventType === 'class_create') doc.className = clip(data.className, 80);
    if (eventType === 'data_action') {
      doc.action = clip(data.action, 80);
      doc.details = clip(data.details, 300);
    }
    if (eventType === 'error') {
      doc.message = clip(data.message, 300);
      doc.context = clip(data.context, 160);
      doc.url = clip(data.url, 250);
      doc.ua = clip(data.ua, 250);
    }
    if (eventType === 'feature_summary') {
      const stats = {};
      const raw = data.stats || {};
      // 只收「字串 → 正整數」，擋掉惡意 payload 把統計汙染成怪東西
      Object.keys(raw).slice(0, 40).forEach((k) => {
        const n = Number(raw[k]);
        if (Number.isFinite(n) && n > 0) stats[clip(k, 40)] = Math.min(Math.round(n), 99999);
      });
      doc.stats = stats;
      doc.deviceId = clip(data.deviceId, 40);
    }

    if (eventType === 'feature_summary') {
      const device = doc.deviceId || 'unknown';
      const id = `feat_${day}_${uid || 'anon'}_${device}`;
      await db.collection(EVENT_LOG_COLLECTION).doc(id).set(doc, { merge: true });
    } else {
      await db.collection(EVENT_LOG_COLLECTION).add(doc);
    }
  } catch (e) {
    logger.error('[EventLog] 事件留底失敗（不影響通知）', e);
  }
}

/** 送一則訊息到 Google Chat webhook；回傳是否成功。 */
async function postToChat(webhook, payload) {
  try {
    const resp = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      logger.error('Google Chat 回應非 200', { status: resp.status, body: body.slice(0, 200) });
      return false;
    }
    return true;
  } catch (err) {
    logger.error('推送 Google Chat 失敗', err);
    return false;
  }
}

exports.notifyUsage = onCall(
  { region: REGION, secrets: [GOOGLE_CHAT_WEBHOOK], cors: true, maxInstances: 5 },
  async (request) => {
    const data = request.data || {};
    const type = String(data.type || '').trim();

    let eventType = type;
    if (type === 'login' && data.isNewUser) {
      eventType = 'login_new';
    }

    if (!EVENT_META[eventType]) {
      return { ok: false, reason: 'unknown-type' };
    }

    const uid = (request.auth && request.auth.uid) || '';
    const who = identityOf(request.auth);
    const isError = eventType === 'error';

    // 配額：決定這筆能不能留底、error 能不能推播
    const quota = await checkQuota(uid, isError);

    // ① 留底（所有型別，含不推播的日常事件）
    if (quota.log) {
      await logUsageEvent(eventType, data, who, uid);
    } else {
      logger.warn('[Quota] 今日事件留底配額已用盡，略過', { uid: uid || 'no-auth', type: eventType });
    }

    // ② 打擾：只有重要事件才即時推 Chat；日常事件交給每日戰報
    if (!INSTANT_PUSH_TYPES.has(eventType)) {
      return { ok: true, logged: quota.log, pushed: false, reason: 'digest-only' };
    }
    if (isError && !quota.push) {
      logger.warn('[Quota] 今日 error 推播配額已用盡，只留底不推播', { uid: uid || 'no-auth' });
      return { ok: true, logged: quota.log, pushed: false, throttled: true };
    }

    const webhook = (GOOGLE_CHAT_WEBHOOK.value() || '').trim();
    if (!webhook) {
      logger.warn('GOOGLE_CHAT_WEBHOOK 尚未設定');
      return { ok: true, logged: quota.log, pushed: false, reason: 'no-webhook' };
    }

    const pushed = await postToChat(webhook, buildCard(eventType, data, who));
    return { ok: true, logged: quota.log, pushed };
  }
);

/**
 * 把當日事件陣列彙整成戰報所需的數字。抽成純函式（不碰 Firestore / 網路）
 * 是為了能單獨驗證統計邏輯 —— 戰報一天只跑一次，算錯很難察覺。
 */
function summarizeEvents(events) {
  const activeUids = new Set();
  const newTeachers = [];
  const classesCreated = [];
  const dataActions = [];
  const errors = [];
  const featureTotals = {};
  let guestEvents = 0;

  events.forEach((d) => {
    if (d.uid) activeUids.add(d.uid);
    else if (d.type === 'session_start') guestEvents++;

    switch (d.type) {
      case 'login_new':
        newTeachers.push(d.label || d.email || '未具名老師');
        break;
      case 'class_create':
        classesCreated.push({ name: d.className || '(未命名)', who: d.name || d.email || '' });
        break;
      case 'data_action':
        dataActions.push({ action: d.action || '', details: d.details || '', who: d.name || d.email || '' });
        break;
      case 'error':
        errors.push({ message: d.message || '', context: d.context || '', who: d.name || d.email || '' });
        break;
      case 'feature_summary':
        Object.keys(d.stats || {}).forEach((k) => {
          featureTotals[k] = (featureTotals[k] || 0) + (Number(d.stats[k]) || 0);
        });
        break;
      default:
        break;
    }
  });

  const hotFeatures = Object.keys(featureTotals)
    .map((k) => ({ label: k, count: featureTotals[k] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return {
    activeTeachers: activeUids.size,
    guestEvents,
    newTeachers,
    classesCreated,
    dataActions,
    errors,
    hotFeatures,
  };
}

/** 由彙整結果組出 Google Chat 卡片（含手機推播用的純文字摘要）。 */
function buildDigestPayload(day, dateLabel, sum) {
  const overviewLines = [`👥 活躍老師 ${sum.activeTeachers} 位`];
  if (sum.newTeachers.length) {
    overviewLines.push(`🎉 新加入 ${sum.newTeachers.length} 位：${sum.newTeachers.slice(0, 5).join('、')}`);
  }
  if (sum.guestEvents) overviewLines.push(`👤 訪客造訪 ${sum.guestEvents} 人次`);
  overviewLines.push(`🏫 新建班級 ${sum.classesCreated.length} 個`);

  const sections = [{
    widgets: [{ decoratedText: { topLabel: '今日總覽', text: overviewLines.join('\n'), wrapText: true } }],
  }];

  if (sum.hotFeatures.length) {
    sections.push({
      header: '🔥 熱門功能',
      widgets: [{
        decoratedText: {
          topLabel: '功能點擊次數',
          text: sum.hotFeatures.map((f) => `• ${f.label} ${f.count} 次`).join('\n'),
          wrapText: true,
        },
      }],
    });
  }

  if (sum.classesCreated.length) {
    sections.push({
      header: '🏫 新建班級',
      widgets: [{
        decoratedText: {
          topLabel: `共 ${sum.classesCreated.length} 個`,
          text: sum.classesCreated.slice(0, 8)
            .map((c) => `• ${c.name}${c.who ? `（${c.who}）` : ''}`).join('\n'),
          wrapText: true,
        },
      }],
    });
  }

  if (sum.dataActions.length) {
    sections.push({
      header: '⚙️ 重大資料操作',
      widgets: [{
        decoratedText: {
          topLabel: `共 ${sum.dataActions.length} 次`,
          text: sum.dataActions.slice(0, 8)
            .map((a) => `• ${a.action}${a.who ? `（${a.who}）` : ''}`).join('\n'),
          wrapText: true,
        },
      }],
    });
  }

  sections.push({
    header: '🐞 系統健康',
    widgets: [{
      decoratedText: {
        topLabel: '錯誤回報',
        text: sum.errors.length
          ? `${sum.errors.length} 則\n` + sum.errors.slice(0, 3).map((e) => `• ${clip(e.message, 80)}`).join('\n')
          : '0 則，一切正常 ✅',
        wrapText: true,
      },
    }],
  });

  // 手機推播摘要（沒有這段，Chat 只會顯示「傳送了一個附件檔案給你」）
  let text = `📈 今日戰報 ${dateLabel}\n👥 活躍老師 ${sum.activeTeachers} 位`;
  if (sum.newTeachers.length) text += ` · 🎉 新加入 ${sum.newTeachers.length} 位`;
  if (sum.classesCreated.length) text += ` · 🏫 新班級 ${sum.classesCreated.length} 個`;
  if (sum.hotFeatures.length) {
    text += `\n🔥 ${sum.hotFeatures.slice(0, 3).map((f) => `${f.label} ${f.count}`).join(' · ')}`;
  }
  text += `\n🐞 錯誤 ${sum.errors.length} 則`;

  return {
    text,
    cardsV2: [{
      cardId: 'digest-' + day,
      card: {
        header: { title: `📈 今日戰報 ${dateLabel}`, subtitle: '班級小管家 · 使用情形彙整' },
        sections,
      },
    }],
  };
}

/**
 * 📈 每日戰報 (dailyUsageDigest)：每天 21:00（台北）把當天累積的 `_usageEvents`
 * 彙整成「一則」Google Chat 卡片，取代原本每位老師每天好幾則的零碎通知。
 *
 * 設計取捨：
 *   - 當天完全沒有任何事件（寒暑假、假日）就靜靜不送，不製造「今天沒人使用」的噪音。
 *   - 昨天的 feature 統計若今天才補送到，會落在昨天的日期桶裡，不會混進今天的戰報；
 *     代價是那份補送統計不會再被戰報播報一次（後台歷史仍查得到）。
 */
exports.dailyUsageDigest = onSchedule(
  {
    schedule: 'every day 21:00',
    timeZone: 'Asia/Taipei',
    region: REGION,
    secrets: [GOOGLE_CHAT_WEBHOOK],
    memory: '256MiB',
    timeoutSeconds: 120,
  },
  async () => {
    const webhook = (GOOGLE_CHAT_WEBHOOK.value() || '').trim();
    if (!webhook) {
      logger.warn('[Digest] GOOGLE_CHAT_WEBHOOK 尚未設定，略過每日戰報');
      return;
    }

    const day = taipeiDay();
    const snap = await admin.firestore()
      .collection(EVENT_LOG_COLLECTION)
      .where('day', '==', day)
      .limit(3000)
      .get();

    if (snap.empty) {
      logger.info(`[Digest] ${day} 無任何使用事件，靜默略過`);
      return;
    }

    const events = snap.docs.map((doc) => doc.data() || {});
    const sum = summarizeEvents(events);
    const dateLabel = new Date().toLocaleDateString('zh-TW', {
      timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', weekday: 'short',
    });

    const ok = await postToChat(webhook, buildDigestPayload(day, dateLabel, sum));
    logger.info(`[Digest] ${day} 戰報${ok ? '已送出' : '送出失敗'}`, {
      events: snap.size, activeTeachers: sum.activeTeachers, errors: sum.errors.length,
    });
  }
);

/**
 * 雲端定期備份 (R-D2)：排程 Firestore 匯出，每天清晨台北時間 04:00 執行。
 *
 * 匯出目的地：`gs://<projectId>-firestore-backups/firestore_backups/<日期>`。
 *
 * ⚠️ 不能用 `admin.storage().bucket()` 拿預設桶：這個專案**沒有**啟用
 *    Firebase Storage，預設桶根本不存在，舊寫法會每天默默失敗。
 *    另外 Firestore 匯出要求備份桶與資料庫**同區域**（本專案都是 asia-east1）。
 *
 * 前置作業（已於 2026-09-03 完成，重建專案時要重做）：
 *   1. 建桶：gcloud storage buckets create gs://class-4719f-firestore-backups
 *              --location=asia-east1 --uniform-bucket-level-access
 *   2. 生命週期：舊備份 30 天自動刪除（避免儲存費無限累積）
 *   3. 授權服務帳號 528903484088-compute@developer.gserviceaccount.com：
 *      - 專案層：roles/datastore.importExportAdmin
 *      - 備份桶：roles/storage.objectAdmin
 */
exports.scheduledFirestoreExport = onSchedule(
  {
    schedule: 'every day 04:00',
    timeZone: 'Asia/Taipei',
    region: REGION,
    timeoutSeconds: 540, // 支援大檔案，設為 9 分鐘
    memory: '256MiB'
  },
  async (event) => {
    const firestore = require('@google-cloud/firestore');
    const client = new firestore.v1.FirestoreAdminClient();
    const projectId = process.env.GCLOUD_PROJECT || admin.instanceId().app.options.projectId;
    const databaseName = client.databasePath(projectId, '(default)');

    // 專用備份桶（與 Firestore 同區域）。刻意不用 admin.storage() 的預設桶，
    // 本專案沒有啟用 Firebase Storage，拿到的會是不存在的桶名。
    const bucketName = process.env.BACKUP_BUCKET || `${projectId}-firestore-backups`;

    // 依日期分資料夾，方便一眼看出哪天的備份，也讓生命週期規則好清
    const stamp = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
    const outputUriPrefix = `gs://${bucketName}/firestore_backups/${stamp}`;

    try {
      logger.info(`[Backup] 開始自動備份 Firestore，匯出至: ${outputUriPrefix}`);
      const [operation] = await client.exportDocuments({
        name: databaseName,
        outputUriPrefix: outputUriPrefix,
        collectionIds: [] // 留空代表匯出所有 collections
      });
      
      logger.info(`[Backup] 備份作業已順利啟動，Operation Name: ${operation.name}`);
      return { success: true, operation: operation.name };
    } catch (error) {
      logger.error('[Backup] Firestore 自動備份失敗:', error);
      throw error;
    }
  }
);

/**
 * 維運小後台 API (R-D1)：列出所有教師的統計數據（班級數、最後同步時間、孤兒資料）。
 *
 * 🔐 安全防護：僅允許 ADMIN_EMAILS 中所列出的管理員 Email 調用，其餘一律攔截。
 */
// 🔐 維運後台僅限此名單帳號（與前端 js/google-auth-ui.js 的 ADMIN_EMAILS 對齊）
const ADMIN_EMAILS = ['ipad@mail2.smes.tyc.edu.tw'];

/** 核驗呼叫者為已登入的管理員，否則丟出 HttpsError；通過則回傳其 email。 */
function requireAdmin(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '必須先進行 Google 登入才能調用此介面');
  }
  const userEmail = (request.auth.token.email || '').toLowerCase().trim();
  if (!ADMIN_EMAILS.includes(userEmail)) {
    logger.warn(`未經授權的後台存取嘗試: ${userEmail}`);
    throw new HttpsError('permission-denied', '您沒有存取系統維運後台的權限');
  }
  return userEmail;
}

exports.getAdminStats = onCall(
  { region: REGION, cors: true, maxInstances: 5 },
  async (request) => {
    // 1. 身分與權限核驗
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '必須先進行 Google 登入才能調用此介面');
    }

    const userEmail = (request.auth.token.email || '').toLowerCase().trim();
    if (!ADMIN_EMAILS.includes(userEmail)) {
      logger.warn(`未經授權的後台存取嘗試: ${userEmail}`);
      throw new HttpsError('permission-denied', '您沒有存取系統維運後台的權限');
    }

    try {
      logger.info(`管理員 ${userEmail} 正在存取系統維運後台數據`);

      // 2. 獲取所有 Firebase 註冊帳號
      const userMap = new Map();
      let nextPageToken;
      do {
        const listUsersResult = await admin.auth().listUsers(1000, nextPageToken);
        listUsersResult.users.forEach((userRecord) => {
          userMap.set(userRecord.uid, {
            email: userRecord.email || '',
            name: userRecord.displayName || '未具名老師'
          });
        });
        nextPageToken = listUsersResult.pageToken;
      } while (nextPageToken);

      // 3. 獲取所有在 Firestore 中有紀錄的 user document refs
      const usersCol = admin.firestore().collection('users');
      const userRefs = await usersCol.listDocuments();

      // 4. 並行查詢每位教師的資料
      const statsPromises = userRefs.map(async (userRef) => {
        const uid = userRef.id;
        const authUser = userMap.get(uid) || { email: '', name: '匿名/訪客帳號' };

        // 讀取 classProfiles, syncInfo 以及 classes
        const metaCol = userRef.collection('_meta');
        
        const [profilesDoc, syncInfoDoc, classesDocs] = await Promise.all([
          metaCol.doc('classProfiles').get(),
          metaCol.doc('syncInfo').get(),
          userRef.collection('classes').listDocuments()
        ]);

        const classProfiles = profilesDoc.exists ? (profilesDoc.data().profiles || []) : [];
        const syncInfo = syncInfoDoc.exists ? syncInfoDoc.data() : null;
        
        // 取得 classes 子集合中所有的班級 ID
        const cloudClassIds = classesDocs.map(doc => doc.id);
        
        // 對照班級名冊與雲端 classes 集合，篩選出孤兒班級
        const activeClassIds = new Set(classProfiles.map(p => p.id));
        // 'default' 是預設班級，不列在 classProfiles 中但它是合法的，不算孤兒
        activeClassIds.add('default'); 

        const orphans = cloudClassIds.filter(id => !activeClassIds.has(id));

        return {
          uid,
          email: authUser.email,
          name: authUser.name,
          classCount: classProfiles.length,
          orphanCount: orphans.length,
          orphans: orphans,
          lastSync: syncInfo && syncInfo.lastUploadAt ? syncInfo.lastUploadAt.toDate().toISOString() : null,
          device: syncInfo ? (syncInfo.device || '') : ''
        };
      });

      const results = await Promise.all(statsPromises);
      
      // 根據最後同步時間排序（最近同步的排在前面）
      results.sort((a, b) => {
        if (!a.lastSync) return 1;
        if (!b.lastSync) return -1;
        return new Date(b.lastSync) - new Date(a.lastSync);
      });

      return { ok: true, data: results };
    } catch (error) {
      logger.error('讀取維運統計資料失敗:', error);
      throw new HttpsError('internal', '讀取統計資料時發生系統內部錯誤');
    }
  }
);

/** 找出某老師的孤兒班級 ref（雲端有 classes/{id} 卻不在 _meta/classProfiles 名冊裡）。 */
async function findOrphanRefs(userRef) {
  const [profilesDoc, classDocRefs] = await Promise.all([
    userRef.collection('_meta').doc('classProfiles').get(),
    userRef.collection('classes').listDocuments(),
  ]);
  const existingProfiles = (profilesDoc.exists && Array.isArray(profilesDoc.data().profiles))
    ? profilesDoc.data().profiles.slice()
    : [];
  const knownIds = new Set(existingProfiles.map(p => String(p.id)));
  knownIds.add('default'); // default 班合法、不算孤兒
  return {
    existingProfiles,
    orphanRefs: classDocRefs.filter(ref => !knownIds.has(ref.id)),
  };
}

/**
 * 維運後台「孤兒明細」(R-D3a)：列出某老師每個孤兒班的學生數、建立日、範例姓名，
 * 供管理員「先檢視再勾選」哪些要救——避免把老師刻意刪掉的殘留無腦復原。
 *
 * 🔐 僅限 ADMIN_EMAILS（唯讀，不寫入）。
 */
exports.getTeacherOrphanDetails = onCall(
  { region: REGION, cors: true, maxInstances: 5 },
  async (request) => {
    requireAdmin(request);
    const targetUid = String((request.data && request.data.uid) || '').trim();
    if (!targetUid) throw new HttpsError('invalid-argument', '缺少必要參數 uid');

    try {
      const userRef = admin.firestore().collection('users').doc(targetUid);
      const { orphanRefs } = await findOrphanRefs(userRef);

      const details = await Promise.all(orphanRefs.map(async (ref) => {
        // marker 名稱（若有）
        let markerName = '';
        try {
          const snap = await ref.get();
          if (snap.exists) {
            const d = snap.data() || {};
            if (d.name && String(d.name) !== ref.id) markerName = String(d.name);
          }
        } catch (e) { /* 純幽靈，無 marker */ }

        // 學生數與範例姓名（rosters 都很小，直接讀）
        let studentCount = 0;
        let sampleNames = [];
        try {
          const stu = await ref.collection('students').get();
          studentCount = stu.size;
          sampleNames = stu.docs.slice(0, 5)
            .map(d => (d.data() && d.data().name) || '')
            .filter(Boolean);
        } catch (e) { /* 無 students 子集合 */ }

        return {
          id: ref.id,
          markerName,
          suggestedName: markerName || placeholderClassName(ref.id),
          createdLabel: classCreatedLabel(ref.id),
          studentCount,
          sampleNames,
        };
      }));

      // 有學生的排前面，方便判斷
      details.sort((a, b) => b.studentCount - a.studentCount);
      return { ok: true, data: details };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error('讀取孤兒明細失敗:', error);
      throw new HttpsError('internal', '讀取孤兒明細時發生系統內部錯誤');
    }
  }
);

/**
 * 維運後台「指定救援」(R-D3)：管理員代老師把「勾選的」孤兒班補回名冊。
 *
 * ⚠️ 一定要傳 classIds（要救哪幾個），不再無腦救全部——孤兒可能是老師刻意刪掉的殘留。
 * 🔐 僅限 ADMIN_EMAILS。✅ 只「增補」名冊（聯集），絕不刪除老師既有任何班級。
 *    只會處理「真的是孤兒」的 id（防止傳入亂寫的 id 污染名冊）。
 */
exports.repairTeacherRegistry = onCall(
  { region: REGION, cors: true, maxInstances: 5 },
  async (request) => {
    const adminEmail = requireAdmin(request);

    const targetUid = String((request.data && request.data.uid) || '').trim();
    if (!targetUid) throw new HttpsError('invalid-argument', '缺少必要參數 uid');

    const wantIds = Array.isArray(request.data && request.data.classIds)
      ? request.data.classIds.map(String)
      : [];
    if (wantIds.length === 0) {
      throw new HttpsError('invalid-argument', '請至少勾選一個要救援的班級（classIds）');
    }

    try {
      const db = admin.firestore();
      const userRef = db.collection('users').doc(targetUid);
      const { existingProfiles, orphanRefs } = await findOrphanRefs(userRef);

      // 只救「真的是孤兒」且「有勾選」的 id
      const wantSet = new Set(wantIds);
      const targetRefs = orphanRefs.filter(ref => wantSet.has(ref.id));
      if (targetRefs.length === 0) {
        return { ok: true, recovered: 0, names: [], afterCount: existingProfiles.length };
      }

      const recoveredProfiles = await Promise.all(targetRefs.map(async (ref) => {
        let markerName = '';
        let icon = null;
        let color = null;
        try {
          const snap = await ref.get();
          if (snap.exists) {
            const d = snap.data() || {};
            if (d.name && String(d.name) !== ref.id) markerName = String(d.name);
            icon = d.icon || null;
            color = d.color || null;
          }
        } catch (e) { /* 純幽靈父文件 */ }
        return {
          id: ref.id,
          name: markerName || placeholderClassName(ref.id),
          icon,
          color,
          recoveredByAdmin: true,
          recoveredAt: new Date().toISOString(),
        };
      }));

      const mergedProfiles = existingProfiles.concat(recoveredProfiles);
      await userRef.collection('_meta').doc('classProfiles').set(
        { profiles: mergedProfiles, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );

      // 為救回的班級補寫 marker，讓老師自己的裝置之後也 discover 得到
      const batch = db.batch();
      recoveredProfiles.forEach((p) => {
        batch.set(userRef.collection('classes').doc(p.id), {
          isClassMarker: true,
          name: p.name,
          icon: p.icon,
          color: p.color,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      await batch.commit();

      logger.info(`[Rescue] ${adminEmail} 已為 ${targetUid} 救回 ${recoveredProfiles.length} 個指定孤兒班級`);
      return {
        ok: true,
        recovered: recoveredProfiles.length,
        names: recoveredProfiles.map(p => p.name),
        afterCount: mergedProfiles.length,
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error('救援孤兒班級失敗:', error);
      throw new HttpsError('internal', '救援孤兒班級時發生系統內部錯誤');
    }
  }
);

/** 由 classId（多半是 String(Date.now())）推算建立日字串，無法判讀則回空字串。 */
function classCreatedLabel(classId) {
  const n = Number(classId);
  if (Number.isFinite(n) && n > 1000000000000) { // 約 2001 年後的毫秒時間戳
    try {
      return new Date(n).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
    } catch (e) { /* fallthrough */ }
  }
  return '';
}

/** 由 classId 推算一個可讀暫名，救援後老師可自行改名。 */
function placeholderClassName(classId) {
  const label = classCreatedLabel(classId);
  return label ? `救回的班級（${label} 建立）` : `救回的班級（${classId}）`;
}
