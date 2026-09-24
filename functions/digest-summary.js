'use strict';

const { PET_EVENT_TYPES } = require('./pet-notification');

const LEGACY_SYNC_CONFLICT = /另一台裝置已更新此班|資料已在其他分頁或同步中更新|雲端同步衝突/i;

function clip(value, length) {
  return String(value == null ? '' : value).slice(0, length);
}

function canonicalFeatureLabel(value) {
  const label = clip(value, 40).trim();
  return /^pets$/i.test(label) ? '班級寵物' : label;
}

function canonicalizeFeatureStats(raw) {
  const stats = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return stats;
  Object.keys(raw).slice(0, 40).forEach((key) => {
    const count = Number(raw[key]);
    const label = canonicalFeatureLabel(key);
    if (!label || !Number.isFinite(count) || count <= 0) return;
    const safeCount = Math.min(Math.round(count), 99999);
    stats[label] = Math.min((stats[label] || 0) + safeCount, 99999);
  });
  return stats;
}

function isExpectedSyncWait(event) {
  if (event?.type !== 'error' || event.feature !== 'pet' || event.operation !== 'cloud_sync') return false;
  return ['請先登入 Google 帳號', '已存本機，恢復連線後再同步'].includes(String(event.message || '').trim());
}

function isSyncConflictEvent(event) {
  if (!event || typeof event !== 'object') return false;
  if (event.type === 'sync_conflict') return true;
  return event.type === 'error' && (
    String(event.failureStage || '') === 'sync-conflict'
    || LEGACY_SYNC_CONFLICT.test(String(event.message || ''))
  );
}

function safeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : fallback;
}

function summarizeEvents(events) {
  const activeUids = new Set();
  const newTeachers = [];
  const classesCreated = [];
  const seenClassIds = new Set();
  const dataActions = [];
  const errors = [];
  const featureTotals = {};
  const syncConflictEvents = new Map();
  const pet = {
    rewards: 0,
    rewardOccurrences: 0,
    pointsNet: 0,
    xpNet: 0,
    coinsNet: 0,
    hatches: 0,
    levelUps: 0,
    undos: 0,
    redeems: 0,
    refunds: 0,
    settings: 0,
    settingsByAction: {},
    errors: 0,
  };
  let guestEvents = 0;

  function addSyncConflict(event) {
    const classId = String(event.classId || '');
    const uid = String(event.uid || '');
    const dedupeKey = uid && classId
      ? `${event.day || ''}:${uid}:${classId}`
      : `event:${event._documentId || event.eventId || `${uid}:${event.ts || ''}:${event.message || ''}`}`;
    const existing = syncConflictEvents.get(dedupeKey) || { cloudDivergence: false };
    // notify=true means there was a known baseline or a confirmed transaction race.
    // It still does not prove that the other writer was a separate physical device.
    existing.cloudDivergence = existing.cloudDivergence || event.type === 'sync_conflict' && event.notify === true;
    syncConflictEvents.set(dedupeKey, existing);
  }

  (Array.isArray(events) ? events : []).forEach((d) => {
    if (!d || typeof d !== 'object') return;
    if (d.uid) activeUids.add(d.uid);
    else if (d.type === 'session_start') guestEvents++;

    if (isExpectedSyncWait(d)) return;
    if (isSyncConflictEvent(d)) {
      addSyncConflict(d);
      return;
    }

    switch (d.type) {
      case 'login_new':
        newTeachers.push(d.label || d.email || '未具名老師');
        break;
      case 'class_create': {
        const classId = String(d.classId || '');
        const classKey = classId && d.uid ? `${d.uid}:${classId}` : '';
        if (classKey && seenClassIds.has(classKey)) break;
        if (classKey) seenClassIds.add(classKey);
        classesCreated.push({ classId, name: d.className || '(未命名)', who: d.name || d.email || '' });
        break;
      }
      case 'data_action':
        dataActions.push({ action: d.action || '', details: d.details || '', who: d.name || d.email || '' });
        break;
      case 'error':
        errors.push({ message: d.message || '', context: d.context || '', who: d.name || d.email || '' });
        if (d.feature === 'pet') pet.errors++;
        break;
      case 'feature_summary':
        Object.entries(canonicalizeFeatureStats(d.stats)).forEach(([label, count]) => {
          featureTotals[label] = (featureTotals[label] || 0) + count;
        });
        break;
      default:
        if (PET_EVENT_TYPES.has(d.type)) {
          const count = Math.max(1, safeInteger(d.count, 1));
          if (d.type === 'pet_reward') {
            pet.rewards++;
            pet.rewardOccurrences += count;
            pet.pointsNet += safeInteger(d.points) * count;
            pet.xpNet += safeInteger(d.xp) * count;
            pet.coinsNet += safeInteger(d.coins) * count;
          }
          if (d.type === 'pet_hatch') pet.hatches += count;
          if (d.type === 'pet_level_up') pet.levelUps += count;
          if (d.type === 'pet_undo') {
            pet.undos += count;
            // Undo events already contain totals across the original batch.
            pet.pointsNet -= safeInteger(d.points);
            pet.xpNet -= safeInteger(d.xp);
            pet.coinsNet -= safeInteger(d.coins);
          }
          if (d.type === 'pet_shop_redeem') pet.redeems += count;
          if (d.type === 'pet_shop_refund') pet.refunds += count;
          if (d.type === 'pet_settings') {
            pet.settings++;
            const action = clip(d.action || '其他設定', 40).trim() || '其他設定';
            pet.settingsByAction[action] = (pet.settingsByAction[action] || 0) + 1;
          }
        }
        break;
    }
  });

  const conflictRows = [...syncConflictEvents.values()];
  const syncConflicts = {
    total: conflictRows.length,
    cloudDivergence: conflictRows.filter((event) => event.cloudDivergence).length,
    sourceUnverified: conflictRows.filter((event) => !event.cloudDivergence).length,
  };
  const hotFeatures = Object.keys(featureTotals)
    .map((label) => ({ label, count: featureTotals[label] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return {
    activeTeachers: activeUids.size,
    guestEvents,
    newTeachers,
    classesCreated,
    dataActions,
    errors,
    syncConflicts,
    pet,
    hotFeatures,
  };
}

function backupLine(backup) {
  if (!backup || !backup.day) return '🗄️ 備份：今日尚無紀錄 ⚠️';
  const mb = backup.bytes ? (backup.bytes / 1048576).toFixed(1) + ' MB' : '';
  const size = mb ? `${mb}／${backup.fileCount || 0} 檔` : '';
  if (backup.status === 'ok') return `🗄️ 備份 ${size} ✅`;
  if (backup.status === 'running') return '🗄️ 備份：仍在進行中 ⏳';
  if (backup.status === 'incomplete') return `🗄️ 備份：${size}，缺少完成標記 ⚠️`;
  return `🗄️ 備份失敗 ⚠️ ${clip(backup.error, 60)}`;
}

function signed(value) {
  const number = safeInteger(value);
  return number > 0 ? `+${number}` : String(number);
}

function settingsSummary(settingsByAction) {
  return Object.entries(settingsByAction || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([action, count]) => `${clip(action, 24)} ${count}`)
    .join('、');
}

function buildDigestPayload(day, dateLabel, sum, backup) {
  const conflict = sum.syncConflicts || { total: 0, cloudDivergence: 0, sourceUnverified: 0 };
  const overviewLines = [`👥 當日有事件帳號 ${sum.activeTeachers} 個`];
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
          topLabel: '功能點擊次數（跨裝置加總）',
          text: sum.hotFeatures.map((feature) => `• ${feature.label} ${feature.count} 次`).join('\n'),
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
          topLabel: `共 ${sum.classesCreated.length} 個（以班級 ID 去重）`,
          text: sum.classesCreated.slice(0, 8)
            .map((classroom) => `• ${classroom.name}${classroom.who ? `（${classroom.who}）` : ''}`).join('\n'),
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
            .map((action) => `• ${action.action}${action.who ? `（${action.who}）` : ''}`).join('\n'),
          wrapText: true,
        },
      }],
    });
  }

  const settingsDetail = settingsSummary(sum.pet.settingsByAction);
  const petLines = [
    sum.pet.rewards && `🐾 獎勵 ${sum.pet.rewards} 批 · 受獎 ${sum.pet.rewardOccurrences} 人次`,
    sum.pet.rewards && `📊 獎勵／撤銷淨變動：分數 ${signed(sum.pet.pointsNet)}、成長 ${signed(sum.pet.xpNet)}、金幣 ${signed(sum.pet.coinsNet)}`,
    sum.pet.hatches && `🥚 孵化 ${sum.pet.hatches} 隻`,
    sum.pet.levelUps && `🌟 升級 ${sum.pet.levelUps} 隻`,
    sum.pet.undos && `↩️ 撤銷 ${sum.pet.undos} 筆`,
    sum.pet.redeems && `🛍️ 兌換 ${sum.pet.redeems} 筆`,
    sum.pet.refunds && `💰 退幣 ${sum.pet.refunds} 筆`,
    sum.pet.settings && `⚙️ 設定 ${sum.pet.settings} 次${settingsDetail ? `（${settingsDetail}）` : ''}`,
    sum.pet.errors && `🚨 失敗 ${sum.pet.errors} 則`,
  ].filter(Boolean);
  if (petLines.length) {
    sections.push({
      header: '🐾 寵物系統',
      widgets: [{ decoratedText: { topLabel: '今日寵物活動', text: petLines.join('\n'), wrapText: true } }],
    });
  }

  const conflictLine = conflict.total
    ? `⚠️ 今日同步差異 ${conflict.total} 件：已確認雲端版本差異 ${conflict.cloudDivergence} 件、來源待確認 ${conflict.sourceUnverified} 件。是否已處理請查看目前班級同步狀態。`
    : '⚠️ 今日雲端同步差異 0 件';
  const healthLines = [
    conflictLine,
    sum.errors.length
      ? `🐞 錯誤 ${sum.errors.length} 則：` + sum.errors.slice(0, 3).map((error) => clip(error.message, 60)).join('；')
      : '🐞 錯誤 0 則，一切正常 ✅',
    backupLine(backup),
  ];
  sections.push({
    header: '🐞 系統健康',
    widgets: [{ decoratedText: { topLabel: '今日狀態', text: healthLines.join('\n'), wrapText: true } }],
  });

  let text = `📈 今日戰報 ${dateLabel}\n👥 當日有事件帳號 ${sum.activeTeachers} 個`;
  if (sum.newTeachers.length) text += ` · 🎉 新加入 ${sum.newTeachers.length} 位`;
  if (sum.classesCreated.length) text += ` · 🏫 新班級 ${sum.classesCreated.length} 個`;
  if (sum.hotFeatures.length) {
    text += `\n🔥 ${sum.hotFeatures.slice(0, 3).map((feature) => `${feature.label} ${feature.count}`).join(' · ')}`;
  }
  if (conflict.total) {
    text += `\n⚠️ 今日同步差異 ${conflict.total} 件（雲端版本差異 ${conflict.cloudDivergence}／來源待確認 ${conflict.sourceUnverified}）`;
  }
  if (petLines.length) text += `\n🐾 ${petLines.slice(0, 4).join(' · ')}`;
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

module.exports = {
  backupLine,
  buildDigestPayload,
  canonicalFeatureLabel,
  canonicalizeFeatureStats,
  isExpectedSyncWait,
  isSyncConflictEvent,
  summarizeEvents,
};
