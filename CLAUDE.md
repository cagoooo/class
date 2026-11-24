# 班級小管家（Class）— 給 AI 助手的專案說明

> 正式站：https://cagoooo.github.io/class/ ｜ Firebase 專案：`class-4719f`
> 版本、功能與更新紀錄見 `CHANGELOG.md`、`DEVELOPMENT_PROGRESS.md`；資料安全原則見 `DATA-SAFETY.md`。

## ⚠️ 最重要：這個 Firebase 專案和「剛好學」共用

`class-4719f` 同時給兩個網站使用：

| | 班級小管家（本 repo） | 剛好學（`H:\Akailao`，https://cagoooo.github.io/Akailao/） |
|---|---|---|
| 資料庫位置 | `users`、`classes`、`petShares`、`_meta`、`appSettings`、`syncSnapshots`、`_usageRateLimits` | `artifacts`、`teachers`、`rateLimits` |
| 雲端函式（正本在誰那裡就由誰部署） | `notifyUsage`、`dailyUsageDigest`、`getAdminStats`、`getUsageAnalytics`、`getTeacherOrphanDetails`、`pruneSyncSnapshots`、`purgeDeletedClassLeftovers`、`repairTeacherRegistry`、`scheduledFirestoreExport` | `callGemini` |
| 瀏覽器登入 | 預設 Firebase app（`[DEFAULT]`） | 自己的 app 名稱 `akailao`（2026-11-21 V4.7.4 起分開） |

兩邊的**資料本身互不讀寫**，在瀏覽器裡的登入、離線暫存、localStorage 名稱、Service Worker 快取也都分開了（2026-11-21 實測）。
但下面這些是**共用的公共設施**，改一次兩邊都受影響：

### 1. Firestore 規則：只有一份，正本在剛好學

- 正本：`H:\Akailao\firestore.rules`。本 repo 的 `firestore.rules` 是**完全相同的複本**（檔頭有註明）。
- 要改規則（包括班級小管家自己的路徑，例如 `users`、`petShares`）：
  1. 改 `H:\Akailao\firestore.rules`
  2. 用模擬資料庫跑規則測試：`cd H:/Akailao/tests/firestore-rules && npm install && npm test`（13 項，含班級小管家的 `users`、`petShares`；改到新路徑時在那支測試補案例）
  3. 在 `H:\Akailao` 部署：`firebase deploy --only firestore:rules --project class-4719f --account cagooo@gmail.com`
  4. `cp H:/Akailao/firestore.rules H:/Class/firestore.rules`，再 `cmp` 確認兩份相同，兩邊都 commit
- 🚫 **不要在本 repo 跑 `firebase deploy --only firestore` 或不加 `--only` 的 `firebase deploy`**：只要兩份不同步，就會把另一個網站的規則蓋掉。
- 前例：2026-11-19 剛好學部署的規則少了 `petShares`，寵物分享連結被擋了兩天（2026-11-21 已修好並同步）。
- 驗證規則有沒有放行：沒登入用 REST 讀一個**不存在**的文件，回 404＝放行、403＝被擋。

### 2. 雲端函式：只部署自己的

- 兩個 repo 的 `functions/` 都用 codebase `default`。
- 🚫 **絕對不要跑 `firebase deploy --only functions`（不指定函式名稱）**：Firebase 會把「這邊程式裡沒有的函式」當成要刪除，會刪掉剛好學的 `callGemini`。
- 一律指定函式名稱，例如：
  ```bash
  FUNCTIONS_DISCOVERY_TIMEOUT=60 firebase deploy --only functions:notifyUsage,functions:dailyUsageDigest --project class-4719f --account cagooo@gmail.com
  ```
- `notifyUsage`、`dailyUsageDigest` 的正本在這裡，剛好學也會呼叫它們（事件帶 `app: 'akailao'`）。改通知或戰報時要顧到剛好學的事件（`functions/digest-summary.js` 的剛好學區塊與 `scripts/test-source-app.cjs`）。
- 前例：2026-11-19 剛好學那邊部署了舊版 `notifyUsage`，蓋掉這裡的正本，害每個學生登入都推一張 Chat 卡片。

### 3. 登入設定、金鑰、帳單

- Firebase Auth 的登入方式、允許的網域、API 金鑰的網站限制、帳單與額度都是兩站共用。修改前先想到剛好學也在用。
- 同一個 Google 帳號在兩個網站的 `uid` 相同（同一個專案），但瀏覽器裡的登入狀態已分開。
- 部署與查詢一律加 `--account cagooo@gmail.com`（預設帳號會 403）。

### 4. 本機與瀏覽器

- 兩站都在 `cagoooo.github.io` 這個網域。新增 localStorage 名稱、IndexedDB、Service Worker 快取時，**名稱要帶本站前綴**（例如 `class-manager-`、`ClassManagerDB`），清除時只清自己前綴的，不要 `localStorage.clear()`、不要刪別人的資料庫。
- 不要把本站的 Firebase app 名稱改掉或改成 `akailao`。

## 其他

- 回覆與 commit 訊息用繁體中文（前綴 `fix:`／`feat:` 可保留英文）。
- 測試正式站時攔截 `notifyUsage`，避免觸發真的 Chat 通知。
