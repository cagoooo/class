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
    
    let eventType = type;
    if (type === 'login' && data.isNewUser) {
      eventType = 'login_new';
    }

    if (!EVENT_META[eventType]) {
      return { ok: false, reason: 'unknown-type' };
    }

    const who = identityOf(request.auth);
    const payload = buildCard(eventType, data, who);

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

/**
 * 雲端定期備份 (R-D2)：排程 Firestore 匯出，每天清晨台北時間 04:00 執行。
 *
 * 備份會自動匯出至當前 Firebase 專案預設的 Storage Bucket 的 /firestore_backups 目錄。
 *
 * ⚠️ 必須在 GCP Console 中為 App Engine 預設服務帳號或 Cloud Functions 服務帳號
 * 授予「Storage Object Admin」及「Cloud Datastore Import Export Admin」權限，此 Functions 才能成功運作。
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

    let bucketName = '';
    try {
      bucketName = admin.storage().bucket().name;
    } catch (e) {
      // 若未配置預設儲存桶，則 fallback 使用 projectId 拼接預設儲存桶名稱
      bucketName = `${projectId}.appspot.com`;
    }

    const outputUriPrefix = `gs://${bucketName}/firestore_backups`;

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
