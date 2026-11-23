'use strict';

/**
 * 送到 Google Chat 之前的最後一道整理。
 *
 * notifyUsage 的內容（錯誤訊息、班級名稱、網址、Google 顯示名稱…）都是呼叫端給的，
 * 而這支函式不用登入就能呼叫。Chat 的卡片文字看得懂 <a>、<b>、<font> 這類標籤，
 * 純文字訊息還看得懂 <網址|顯示文字> 與 <users/all>（提及所有人），原樣送出的話，
 * 外人可以在管理員手機上放一個看起來像系統通知的假連結（2026-11-23 全站檢測）。
 *
 * 本專案自己組的卡片從來不用這些標籤（全部是純文字加換行），所以一律把角括號換成全形，
 * 不必逐欄判斷，新加的欄位也不會漏掉。
 */

/** 走過整個物件，把每一個字串交給 fn 轉換（物件的鍵不動）。 */
function mapStrings(value, fn) {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, fn));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, fn)]));
  }
  return value;
}

/** 角括號換成全形（＜ ＞）：看得懂原本寫什麼，但 Chat 不會把它當成標籤或連結。 */
function neutralizeMarkup(payload) {
  return mapStrings(payload, (text) => text.replace(/</g, '＜').replace(/>/g, '＞'));
}

/**
 * 沒登入 Google 的訪客送來的內容：把網址的「://」拆開，Chat 就不會自動變成可以點的連結。
 * 已登入老師的通報不處理（錯誤訊息裡的網址常常是追查線索）。
 */
function defangLinks(payload) {
  return mapStrings(payload, (text) => text.replace(/:\/\//g, '：//'));
}

module.exports = { defangLinks, mapStrings, neutralizeMarkup };
