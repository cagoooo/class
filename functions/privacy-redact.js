/**
 * 錯誤通報的學生姓名遮蔽（後端最後一道防線）
 *
 * v3.55.2 起前端的錯誤通報只帶座號，送出前也會把班級名單上的姓名換成座號。
 * 但老師的瀏覽器可能還開著舊版頁面（PWA 快取），舊版會把學生姓名寫進錯誤情境，
 * 例如「加扣分存檔（姓名，+1）」。這裡依舊版已知的 6 種格式，在留底與推播
 * Google Chat 之前把姓名換成「已隱藏姓名」；維運後台讀出舊紀錄時也套用同一套
 * 規則遮蔽顯示——舊紀錄本身不改、不刪。
 *
 * 新版格式一律以「座號」開頭（例如「加扣分存檔（座號 7，+1）」），所以每條規則
 * 都排除「座號」開頭的內容，不會誤傷新版通報。
 */

const HIDDEN_NAME = '已隱藏姓名';

// [格式說明, 規則]；每條規則的第 1、2 組是要保留的前後文，中間是姓名。
const LEGACY_NAME_PATTERNS = [
  ['加扣分存檔（姓名，±分數）', /(加扣分存檔（)(?!座號)[^，）]+(，)/g],
  ['新增／刪除學生（姓名）', /((?:新增|刪除)學生（)(?!座號)[^）]+(）)/g],
  ['更換「姓名」的頭像／修改「姓名」的標籤', /((?:更換|修改)「)(?!座號)[^」]+(」的(?:頭像|標籤))/g],
  ['設定新學生「姓名」的頭像', /(設定新學生「)(?!座號)[^」]+(」的頭像)/g],
];

// 這些欄位是錯誤／同步／資料操作事件裡的自由文字，可能夾帶舊版的姓名。
const REDACT_FIELDS = ['message', 'context', 'details'];

/** 把一段文字裡舊版格式的學生姓名換成「已隱藏姓名」。 */
function redactLegacyStudentNames(text) {
  if (typeof text !== 'string' || !text) return text;
  return LEGACY_NAME_PATTERNS.reduce(
    (out, [, pattern]) => out.replace(pattern, `$1${HIDDEN_NAME}$2`),
    text
  );
}

/** 文字裡是否含有舊版格式的學生姓名（盤點舊紀錄用，不回傳姓名本身）。 */
function hasLegacyStudentName(text) {
  return typeof text === 'string' && redactLegacyStudentNames(text) !== text;
}

/** 回傳事件資料的淺拷貝，自由文字欄位已遮蔽舊版格式的學生姓名。 */
function redactEventData(data) {
  const out = { ...(data || {}) };
  REDACT_FIELDS.forEach((key) => {
    if (typeof out[key] === 'string') out[key] = redactLegacyStudentNames(out[key]);
  });
  return out;
}

module.exports = {
  HIDDEN_NAME,
  LEGACY_NAME_PATTERNS,
  hasLegacyStudentName,
  redactEventData,
  redactLegacyStudentNames,
};
