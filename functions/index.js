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

const { onCall } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');

const GOOGLE_CHAT_WEBHOOK = defineSecret('GOOGLE_CHAT_WEBHOOK');

const REGION = 'asia-east1';

// 事件樣式對照（標題 emoji + 中文）
const EVENT_META = {
  session_start: { emoji: '👀', title: '有老師正在使用班級小管家' },
  login:         { emoji: '✅', title: '老師登入使用' },
  class_create:  { emoji: '🏫', title: '建立了新班級' },
  feature:       { emoji: '🧩', title: '使用了功能' },
  error:         { emoji: '🐞', title: '系統發生錯誤' },
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
  return { label: provider === 'anonymous' ? '匿名訪客' : '未知使用者', email: '', name: '', anonymous: true };
}

/** 安全裁切字串 */
function clip(s, n) {
  return String(s == null ? '' : s).slice(0, n);
}

/** 組 cardsV2 卡片 */
function buildCard(type, data, who) {
  const meta = EVENT_META[type] || { emoji: '🔔', title: '使用事件' };
  const rows = [];

  rows.push({ decoratedText: { topLabel: '使用者', text: who.label, wrapText: true } });

  if (type === 'class_create' && data.className) {
    rows.push({ decoratedText: { topLabel: '新班級名稱', text: clip(data.className, 80), wrapText: true } });
  }
  if (type === 'feature') {
    rows.push({ decoratedText: { topLabel: '功能', text: clip(data.label || data.feature, 80), wrapText: true } });
  }
  if (type === 'error') {
    rows.push({ decoratedText: { topLabel: '錯誤訊息', text: clip(data.message, 300), wrapText: true } });
    if (data.context) rows.push({ decoratedText: { topLabel: '發生位置', text: clip(data.context, 160), wrapText: true } });
  }

  // 時間（前端送 ISO；以台灣時區顯示）
  let timeText = '';
  try {
    const d = data.ts ? new Date(data.ts) : new Date();
    timeText = d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
  } catch (e) { timeText = clip(data.ts, 40); }
  rows.push({ decoratedText: { topLabel: '時間', text: timeText, wrapText: true } });

  return {
    cardsV2: [{
      cardId: 'usage-' + Date.now(),
      card: {
        header: { title: meta.emoji + ' ' + meta.title, subtitle: '班級小管家 · 使用情形' },
        sections: [{ widgets: rows }],
      },
    }],
  };
}

exports.notifyUsage = onCall(
  { region: REGION, secrets: [GOOGLE_CHAT_WEBHOOK], cors: true, maxInstances: 5 },
  async (request) => {
    const webhook = (GOOGLE_CHAT_WEBHOOK.value() || '').trim();
    if (!webhook) {
      logger.warn('GOOGLE_CHAT_WEBHOOK 尚未設定');
      return { ok: false, reason: 'no-webhook' };
    }

    const data = request.data || {};
    const type = String(data.type || '').trim();
    if (!EVENT_META[type]) {
      return { ok: false, reason: 'unknown-type' };
    }

    const who = identityOf(request.auth);
    const payload = buildCard(type, data, who);

    try {
      const resp = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        logger.error('Google Chat 回應非 200', { status: resp.status, body: body.slice(0, 200) });
        return { ok: false, status: resp.status };
      }
      return { ok: true };
    } catch (err) {
      logger.error('推送 Google Chat 失敗', err);
      return { ok: false, reason: 'fetch-failed' };
    }
  }
);
