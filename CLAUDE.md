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
- GitHub Pages 只發布網站需要的檔案（2026-11-24 起）：清單在 `scripts/build-site.cjs`（根目錄幾個檔案＋`js`、`css`、`assets`、`icons`）。網站要用到新的根目錄檔案或資料夾時，一定要加進清單，否則正式站會 404；`scripts/test-site-publish-scope.cjs` 會檢查頁面與 Service Worker 參考到的檔案都有發布。GitHub 上的 repo 本身仍是公開的，尚未修補的弱點細節一樣不要寫進 repo。
- 把使用者輸入的文字放進 `innerHTML` 一律用 `escapeHtml()`；把資料編號放進 `onclick="…"` 一律用 `safeId()`（兩個都定義在 `classnew.html`）。`pets.html` 會載入的檔案不能依賴這兩個函式。外部 js 檔要用時，檔頭一定要自帶後備（`const safeId = window.safeId || (…)`，沒包在函式裡的檔案用 `var`）：老師的瀏覽器可能拿到快取的舊版主頁面配上新版程式檔（GitHub Pages 不看 `?v=`），2026-11-24 就因此出現「Can't find variable: safeId」。`scripts/test-old-page-new-scripts.cjs` 會檢查；之後主頁面再新增給外部檔用的函式，也要照這個做法。
- 同一班開在兩個分頁的保護在 `js/class-aware-storage.js`（v3.73.0）：另一個分頁寫入時，全域變數裡的資料（學生、加扣分、分組、聯絡簿、作業、抽籤）就地換新；模組自己留一份的資料要用 `ClassAwareStorage.onOtherTabChange(名稱, 函式)` 登記「重新讀取並重畫」（換好回傳 `true`），沒登記的會等安全時機重新整理，拿舊資料寫入會被擋下。新增班級資料鍵時要決定它屬於哪一類：模組載入時讀一次、之後整包寫回的加進 `HELD`；後寫蓋掉先寫也無妨的小設定加進 `RELAXED`。只是比對內容（不是把手上那份換新）請用 `ClassAwareStorage.peek()`。測試在 `scripts/test-same-class-two-tabs.cjs`。
