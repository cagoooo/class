/**
 * 寵物系統通知的共用模型。
 *
 * 這裡只做白名單、裁切與摘要，不碰 Firestore 或 webhook，方便在沒有
 * Firebase 憑證的本機測試中驗證通知內容，也避免把學生姓名等資料送進通知。
 */

const PET_EVENT_META = Object.freeze({
  pet_reward: { emoji: '🐾', title: '寵物獎勵已記錄' },
  pet_hatch: { emoji: '🥚', title: '寵物成功孵化' },
  pet_level_up: { emoji: '🌟', title: '寵物升級' },
  pet_undo: { emoji: '↩️', title: '寵物獎勵已撤銷' },
  pet_shop_redeem: { emoji: '🛍️', title: '寵物商店完成兌換' },
  pet_shop_refund: { emoji: '💰', title: '寵物商店已退幣' },
  pet_settings: { emoji: '⚙️', title: '寵物系統設定更新' },
});

const PET_EVENT_TYPES = new Set(Object.keys(PET_EVENT_META));

// 寵物事件只允許這些欄位進入 Firestore / Google Chat。
const STRING_FIELDS = [
  'classId', 'className', 'action', 'reason', 'productName', 'kind', 'kinds',
  'status', 'operation', 'petAction', 'failureStage',
];
const NUMBER_FIELDS = [
  'count', 'points', 'xp', 'coins', 'cost', 'level', 'hatchCount',
  'levelUpCount', 'durationMs',
];

function clip(value, max) {
  return String(value == null ? '' : value).slice(0, max);
}

function normalizePetData(data = {}) {
  const out = {};
  STRING_FIELDS.forEach((key) => {
    if (data[key] != null && data[key] !== '') out[key] = clip(data[key], key === 'className' ? 80 : 120);
  });
  if (Array.isArray(data.kinds)) {
    out.kinds = data.kinds.map((kind) => clip(kind, 40)).slice(0, 12).join('、');
  }
  NUMBER_FIELDS.forEach((key) => {
    const value = Number(data[key]);
    if (Number.isSafeInteger(value) && Math.abs(value) <= 100000) out[key] = value;
  });
  return out;
}

function petEventSummary(type, data = {}) {
  const count = Number.isSafeInteger(data.count) ? data.count : 0;
  switch (type) {
    case 'pet_hatch':
      return `🥚 孵化 ${count || 1} 隻${data.kinds || data.kind ? `：${clip(data.kinds || data.kind, 60)}` : ''}`;
    case 'pet_level_up':
      return `🌟 升級 ${count || 1} 隻${data.level ? `至 Lv.${data.level}` : ''}`;
    case 'pet_reward':
      return `🐾 ${count || 1} 位學生獲得獎勵`;
    case 'pet_undo':
      return `↩️ 撤銷 ${count || 1} 筆寵物獎勵`;
    case 'pet_shop_redeem':
      return `🛍️ 完成 ${count || 1} 筆兌換${data.productName ? `：${clip(data.productName, 60)}` : ''}`;
    case 'pet_shop_refund':
      return `💰 完成 ${count || 1} 筆退幣${data.productName ? `：${clip(data.productName, 60)}` : ''}`;
    case 'pet_settings':
      return `⚙️ ${clip(data.action || '設定已更新', 80)}`;
    default:
      return '🐾 寵物系統事件';
  }
}

module.exports = {
  PET_EVENT_META,
  PET_EVENT_TYPES,
  normalizePetData,
  petEventSummary,
};
