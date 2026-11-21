/**
 * ClassDB（IndexedDB 儲存模組）已於 v3.69.9（2026-11-22）停用。
 *
 * 它在 v2.9.9 加入，原本打算取代 localStorage，但始終沒有任何程式讀取它的資料：
 * 每台裝置第一次開啟時只是把 localStorage 整份再複製一份到 IndexedDB。
 * 2026-11-22 iPhone 上這個複製步驟找不到資料表（One of the specified object stores was not found），
 * 又沒有接住錯誤，變成錯誤通知。班級資料一直都存在 localStorage 與雲端快照，不受影響。
 *
 * 新版頁面不再載入這支檔案；保留空殼是給還沒更新、仍會載入它的舊頁面，讓它們也不再開資料庫。
 * 舊裝置上已經存在的 ClassManagerDB 不主動刪除（刪除班級時 class-profiles.js 仍會一併清掉）。
 */
