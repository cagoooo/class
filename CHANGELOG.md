# 班級小管家 Changelog

## [v3.11.6 ~ v3.11.8] - 2026-06-17 📱 手機端體驗三修 + 雲端班級索引資料完整性修補

> 起因：老師回報手機端三個問題——大時鐘跑版、深色模式按鈕文字看不到、雲端 601~606 班級還原只剩 1 班。來回多趟才挖到「真正的根因」（前兩版一度誤判成快取 / 改錯地方），最終全部解決。

### 🐛 問題一：全螢幕大時鐘在手機上「跑版」（時間右側被裁掉）
- **真因**：時鐘字級不是 CSS `clamp` 控制，而是 JS `fitClockToScreen()` 動態量測後寫 inline `font-size`。它用 `availW = window.innerWidth * 0.96` 當可用寬度，**漏算了 `#clock-modal` 的 `p-4`（左右各 16px）內距** → 字級放太大、塞進較窄的容器後右側被裁。
- **修法**：改用「實際容器寬度」`displayEl.clientWidth * 0.98` 計算；同時移除誤加、會夾住文字框的 `max-width:100%`，並為數位時鐘明確指定 Latin 系統字型 + `tabular-nums`（避免 iOS fallback 成全形 CJK 數字撐爆）。
- **驗證**：320 / 375 / 414px 寬度實測，時間皆完整在容器內不溢出。

### 🌑 問題二：深色模式首頁功能卡片「文字看不到」
- **真因**：首頁功能卡片用淺色漸層底（`from-*-50`），深色模式不會自動變深；但 `theme-toggle.js` 有一條 `.dark .text-gray-700/800 → 淺色` 規則，造成**淺底配淺字**，整排卡片名稱（學生管理、加扣分…）看不見。
- **修法**：深色模式下把功能卡片底色改深（`.dark #feature-menu-grid > button`），保留左側彩色辨識條，文字對比拉到約 19:1。
- **附帶**：CDN 版 Tailwind 改設 `tailwind.config = { darkMode: 'class' }`，讓 `dark:` 工具類跟著 `.dark` class（與 theme-toggle 一致）而非作業系統，並補強時鐘控制面板自身深色開關下的具體色值。

### ☁️ 問題三（最關鍵·資料完整性）：雲端多班級還原只看到 1 個班
- **驗屍**（用管理權限查真實 Firestore，本地是 placeholder 連不上）：老師帳號雲端**班級資料完整都在**（7 個 `classes/{id}` 子集合、601~606 學生齊全），**但班級名冊 `_meta/classProfiles` 只剩「預設班級」一筆** → 還原讀名冊只得 1 班。
- **真因**：`syncToCloud()` / `syncAllClassesToCloud()` 寫 `_meta/classProfiles` 是**整份覆蓋**。手機首次登入（本地只有預設班）背景自動同步，把「只有預設班」的名冊覆蓋上雲端，**洗掉**了原本完整的班級索引（資料還在卻「找不到」）。
- **修法**：新增 `uploadClassProfilesMerged()`，上傳名冊改成**與雲端聯集、只增不減**（同 id 以本地覆蓋更新名稱，新增者附加，不刪任何一邊），兩處上傳點都改用它。搭配 v3.11.6 的還原端先抓雲端 `_meta` 合併，多裝置班級索引不再互相洗掉。
- **復原**：老師在電腦端（仍保有正確班名）按「一鍵同步所有班級」把正確名冊合併寫回雲端 → 手機「一鍵還原所有班級」即全數回來，**成功**。

### 🧰 同場加映：除錯紀律沉澱為 skill
- 新增全域 skill `firebase-pwa-sync-forensics`：固化「使用者說還是壞→先驗線上檔+版本徽章別空轉怪快取」「動態值錯先找 JS 是否覆蓋 CSS」「雲端資料不見＝索引被覆蓋洗掉」「registry 寫入只增不減」「用 gcloud+REST 驗屍真實 Firestore」等鐵則。

---

## [v3.1.6] - 2026-04-24 🛡️ 同步完整性最終修補（稽核發現的 4 個漏洞）

### 🔍 稽核動機
全面稽核 v3.1.5 的雲端同步覆蓋率，結果發現 v3.1.2 新增的 `examDayPresets`（考試多日預設）**只加到 SHARED_KEYS 但完全沒進同步邏輯**，會導致考試第二天資料在異地還原時完全丟失。

### 🐛 發現的問題
| 嚴重度 | 問題 | 影響 |
|---|---|---|
| 🔴 P1 | `examDayPresets` 未在 4 條同步路徑中出現 | 第二天考試科目**永久丟失** |
| 🟡 P3 | `emergencyCleanup` 未檢查雲端登入狀態 | 未登入者可能因 quota 清理導致本地備份消失 |
| 🟢 P4 | `theme` 偏好未同步 | 跨裝置主題不一致 |

### ✨ 修復內容

#### 🔴 P1: examDayPresets 完整加入所有同步路徑
- **`syncToCloud()`**：上傳至 `examData/dayPresets` Firestore doc
- **`loadFromCloudData()`**：下載並透過 `dbSave` 還原
- **`syncAllClassesToCloud()`**：每個班級的 examDayPresets 分別上傳
- **`syncAllClassesFromCloud()`**：每個班級的 examDayPresets 分別還原
- 上游函式 `syncFromCloud()` 的 return 物件補上 `examDayPresets` 欄位

#### 🟡 P3: emergencyCleanup 加上雲端安全檢查
- 新增 `isLoggedInToCloud()` helper
- 清理清單改為有安全等級標記：
  - `alwaysSafe: true` → 暫存/節流（隨時可清）
  - `alwaysSafe: false` → 本地備份（僅登入雲端者才清）
- 對話框內容**依登入狀態動態調整**：
  - 已登入：「雲端保有完整資料，安全無虞」（綠色）
  - 未登入：「⚠️ 尚未登入，建議先登入後再清理」（橘色）

#### 🟢 P4: theme 偏好加入 uiPrefs 同步
- `syncToCloud()` 與多班級上傳都帶上 `theme`
- `loadFromCloudData()` 與多班級下載都還原 `theme`
- 使用者在電腦 A 切深色模式，電腦 B 自動同步

### 🎯 稽核結果：完整率 93% → **100%**

經本次修補，**12 個 SHARED_KEYS + 6 個 UI 偏好**全部都被完整覆蓋於 4 條同步路徑。

| 稽核項目 | v3.1.5 之前 | v3.1.6 之後 |
|---|---|---|
| 核心資料同步完整率 | 93% (14/15) | ✅ **100%** (15/15) |
| UI 偏好同步完整率 | 83% (5/6) | ✅ **100%** (6/6) |
| 異地還原會遺失的資料 | 第二天考試科目、主題 | ✅ **無** |

### 📁 更新檔案
- `js/firebase-sync.js` - 4 條同步路徑都加上 examDayPresets 與 theme
- `js/class-aware-storage.js` - emergencyCleanup 雲端狀態檢查 + 對話框動態文案
- `classnew.html` - cache-buster `?v=3.1.6`
- `package.json` / `manifest.json` / `sw.js` - 版本號升至 v3.1.6（自動同步）

---

## [v3.1.5] - 2026-04-24 🏷️ 版本號顯示強化

### ✨ 新功能
- **📌 瀏覽器分頁 title 顯示版本**：從「班級小管家」→「班級小管家 v3.1.5」，老師一眼看出是否為最新版
- **🏷️ Header 版本徽章**：在「📚 班級小管家」右側顯示 `v3.1.5` 小膠囊按鈕（藍色）
- **🔗 點擊徽章開啟 CHANGELOG**：點 Header 的版本徽章會在新分頁開啟 GitHub 上的更新紀錄
- **🧮 `window.APP_VERSION` 全域常數**：其他模組可透過此常數取得版本資訊，方便未來開發

### 🔧 開發者體驗強化
- **`scripts/update-sw-version.js` 增強**：現在會**自動同步**更新以下位置的版本號：
  - `sw.js` 的 `CACHE_NAME` / `STATIC_CACHE` / `DYNAMIC_CACHE` / `@version`
  - `classnew.html` 的 `<title>` / `window.APP_VERSION` / Header 版本徽章
- **單一真相來源**：`manifest.json` 的 version 欄位為唯一權威版本號，其他檔案全部由 script 自動同步
- **零遺漏保證**：未來升版只需改 `package.json` + `manifest.json` + `npm run update-sw`，其他 7 處版本標記自動同步

### 📁 更新檔案
- `classnew.html` - 新增 `<title> v3.1.5`、`window.APP_VERSION`、Header 版本徽章（可點擊）
- `scripts/update-sw-version.js` - 支援同步更新 HTML 內的 3 處版本標記
- `package.json` / `manifest.json` / `sw.js` - 版本號升至 v3.1.5

---

## [v3.1.4] - 2026-04-24 🚑 緊急修復 localStorage 配額爆滿

### 🐛 問題
有老師反映教室電腦上加扣分時出現紅色錯誤訊息：
```
Failed to execute 'setItem' on 'Storage':
Setting the value of 'students-1772598689573' exceeded the quota.
```
導致無法使用加分、改動學生資料等任何儲存操作。

### 🔍 根本原因
1. **5 份自動備份佔用過多空間**：`performAutoBackup` 保留 5 份完整快照（students + pointsHistory + notebook + groups + seatingConfig），每份可達數百 KB
2. **累積歷史過多**：老師使用半年後，pointsHistory 可能數千筆
3. **瀏覽器 localStorage quota**：Chrome 預設約 5-10 MB
4. **沒有優雅降級**：setItem 失敗直接 throw，頁面紅色錯誤訊息擋住 UI

### ✨ 三層修復

#### 1. 🚑 緊急恢復機制（`js/class-aware-storage.js`）
- 攔截 `setItem`，若遇 `QuotaExceededError` 自動執行緊急清理：
  - 清除 `classManager_autoBackup`（最大、最安全）
  - 清除節流時間戳（`pwaLastUpdateCheck`、`swLastUpdateCheck`）
  - 清除 Firestore 離線暫存（`firebase:*offline`）
- 釋放空間後自動重試 `setItem`
- 若重試仍失敗，顯示友善對話框

#### 2. 💾 減少備份體積（`js/data-reports.js`）
- **自動備份數量：5 → 2 份**（大幅減少空間）
- **已登入 Google 者跳過本地備份**（雲端已有完整資料）
- 備份失敗時主動清空 `classManager_autoBackup`

#### 3. 🎨 友善錯誤對話框
- 跳出模態對話框：「瀏覽器儲存空間已滿」
- 提供「🧹 一鍵清理」按鈕
- 告知已登入者雲端資料完整無虞
- 清理後顯示釋放的 KB 數

### 📁 更新檔案
- `js/class-aware-storage.js` - 新增 `emergencyCleanup()`、`showQuotaDialog()`、quota-safe setItem 包裝
- `js/data-reports.js` - `performAutoBackup` 加入雲端檢查，備份數 5 → 2
- `classnew.html` - cache-buster `?v=3.1.4`
- `package.json` / `manifest.json` / `sw.js` - 版本號升至 v3.1.4

### 💡 立即效益
- 🚑 **已爆滿的老師**：載入新版後，第一次加分時自動清理空間，操作成功
- 🛡️ **預防未來**：已登入雲端者不再占用本地空間儲存備份
- 📉 **空間占用下降 60%**：5 份備份 → 2 份

### 🧪 受影響老師請這樣做
1. 硬重新整理頁面（`Ctrl+Shift+R`）
2. 等新版本載入
3. 再次嘗試加扣分 → 應該會出現「瀏覽器儲存空間已滿」對話框
4. 點「🧹 一鍵清理」→ 彈出「已釋放 XXX KB」
5. 點「🔄 一鍵更新」重新載入
6. 恢復正常使用 ✅

---

## [v3.1.3] - 2026-04-16 🎯 課堂不打擾更新

### ⭐ 解決老師反映的核心 UX 問題
> 「常常要使用就必須更新等待，每次要抽籤或加扣分就更新等待」
> 「自動更新的頻率太高，反而影響上課即時互動」

### 🐛 根本原因分析
1. **更新橫幅出現在螢幕底部正中央**（`bottom:1rem; left:50%; z-index:10000`）— 正好蓋住「開始抽籤」「產生分組」等主要按鈕
2. **每次頁面載入都檢查更新** — 切換班級 `location.reload()` 觸發，一天 10+ 次
3. **`skipWaiting()` + `clients.claim()` 立即接管** — 老師上課到一半 SW 強制換版
4. **高頻部署放大問題** — 一天內部署數個版本，每次都讓線上老師看到更新通知

### ✨ 修復方案（三管齊下）

#### 1. 🙅 移除攔路橫幅
- **刪除** `showUpdatePrompt()` 創建的置中浮動橫幅
- 改為**靜默下載**，通知改到右下角 sync-status-indicator 的小紅點徽章
- 上課時完全不打擾，老師想更新時才套用

#### 2. ⏰ 節流更新檢查
- `registration.update()` 加入 **30 分鐘節流**
- 切換班級（一天 10+ 次 reload）不再重複檢查
- 首次載入 or 距離上次檢查 > 30 分鐘才觸發

#### 3. ⏸️ 延遲套用新 SW
- **移除 `self.skipWaiting()`** - 新 SW 停留在 waiting 狀態
- **移除 `self.clients.claim()`** - 老師正在用的舊 tab 維持舊版本
- 新增 **`message` handler** 接收 `SKIP_WAITING` 指令，僅在使用者主動觸發時接管
- 🟢 老師上課途中完全不會被打斷

### 🎯 新的更新流程

```
背景：使用者開啟頁面 → SW 檢查更新（節流後）→ 新版本下載到 waiting
通知：sync-status-indicator 跳出小紅點徽章（非侵入式）
選擇：
  A. 老師不理它 → 繼續使用舊版本，沒人被打擾
  B. 老師點擊指示器 → postMessage SKIP_WAITING → SW 接管 → 自動 reload
  C. 老師點「一鍵更新」按鈕 → 智能選擇快速/慢速路徑
```

### 📁 更新檔案
- `js/pwa-install.js`
  - `registerServiceWorker()` 加入 30 分鐘節流
  - 新增 `notifyUpdateAvailable()` 通知 sync-status-indicator
  - 新增 `applyPendingUpdate()` 觸發 SKIP_WAITING
  - 移除 `showUpdatePrompt()` 置中橫幅
  - `manualUpdate()` 改為智能版（優先快速路徑，備援慢速路徑）
  - 監聽 `controllerchange` 事件自動 reload
- `sw.js`
  - 移除 `install` 事件的 `self.skipWaiting()`
  - 移除 `activate` 事件的 `self.clients.claim()`
  - 新增 `message` handler 接收 `SKIP_WAITING`
- `js/sync-status-indicator.js`
  - 新增 `setUpdateAvailable(bool)` API
  - 新增藍色小紅點徽章樣式（脈動動畫）
  - `handleClick` 優先處理「套用更新」
  - `showTooltip` 顯示「🎁 新版本可用」
  - 監聽 `pwa-update-available` 事件
- `package.json` / `manifest.json` / `sw.js` - 版本號升至 v3.1.3

### 💡 使用者端 Before / After

| 情境 | v3.1.2 之前 | v3.1.3 之後 |
|---|---|---|
| 上課中有新版本 | 底部橫幅擋住按鈕 😱 | 右下角藍點，不干擾 ✨ |
| 切換班級後 | 每次都可能跳更新 | 30 分鐘內不重複檢查 |
| 老師誤按更新 | 被迫 reload 等 10+ 秒 | 只能主動點擊才套用 |
| 想更新 | 必須點橫幅的按鈕 | 點右下角指示器 / 下次自然 reload |

---

## [v3.1.2] - 2026-04-16

### ✨ 新功能：考試監考多日切換
- **📅 第一天 / 第二天 Tab 切換按鈕**：在科目列表上方新增天數切換 Tab，老師可以一鍵切換不同考試日的科目組合。
  - 第一天預設：國語、自然、英文
  - 第二天預設：數學、社會
- **自動儲存與還原**：切換天數時自動儲存當前天的科目，載入目標天的科目。新增/刪除/修改科目時也自動同步到當前天的 preset。
- **＋ 新增天數**：可動態新增第三天、第四天...（按「＋」按鈕），滿足段考 / 期末考多天需求。
- **舊版升級遷移**：舊版的 `examSubjects` 自動成為第一天，第二天使用預設值。
- **空狀態整合**：某一天沒有科目時顯示 EmptyState 引導。
- **班級隔離**：`examDayPresets` 已加入 `ClassAwareStorage` 的 SHARED_KEYS，各班級的考試天數獨立。

### 📁 更新檔案
- `js/exam-proctor.js` - 新增 `examDayPresets` 資料結構、`switchExamDay()`、`addExamDay()`、`renderDayTabs()`、`saveData()` 同步 preset。
- `js/class-aware-storage.js` - SHARED_KEYS 加入 `examDayPresets`。
- `classnew.html` - 新增 `#examDayTabs` 容器。
- `package.json` / `manifest.json` / `sw.js` - 版本號升至 v3.1.2。

---

## [v3.1.1] - 2026-04-16

### 🐛 修復
- **同步狀態指示器與「一鍵更新」按鈕重疊** - v3.1.0 的同步狀態雲端圖示位置與既有的 PWA「一鍵更新」按鈕在 `bottom-right` 重疊。將同步指示器移至「一鍵更新」按鈕**左側**（`right: 172px`），保持視覺鄰近但不重疊。
- **手機版同步調整** - 手機版的圖示尺寸與位置（`right: 140px, bottom: 18px`）配合手機版一鍵更新按鈕位置（`right: 16px`）做對應調整。
- **tooltip 箭頭位置修正** - 桌面與手機 tooltip 箭頭都重新對齊到指示器上方。

### 📁 更新檔案
- `js/sync-status-indicator.js` - 調整 CSS 定位與 RWD 斷點
- `classnew.html` - cache-buster `?v=3.1.0` → `?v=3.1.1`
- `package.json` / `manifest.json` / `sw.js` - 版本號升至 v3.1.1

---

## [v3.1.0] - 2026-04-16 🎉 快速勝利套餐

里程碑版本！一次打包 7 項 P0/P1 UX 改良，配合前面 v3.0.9–v3.0.13 的累積改動，整體體驗大幅提升。

### ✨ 新增功能

#### 🎯 A1：為 7 個區塊標記主要行動按鈕（`data-primary-action`）
延伸 v3.0.11 的通用機制。現在透過 `classnew.html#{section}` 深連結進入時，除了區塊標題，還會自動捲動到該區塊的**主要行動按鈕**。
- 🎲 分組：「產生分組」
- 🎰 抽籤：「開始抽籤」
- ⏱ 計時器：「開始」
- 📝 聯絡簿：「新增聯絡事項」
- 📋 作業：「新增作業項目」
- 🖥 考試監考：「啟動全螢幕監考模式」（原本就有）
- 📢 班級公告：「發布公告」

#### 🎨 B2：班級視覺差異化（顏色 + emoji）
**預防「切錯班級寫錯資料」的頭號風險**。
- 新增 8 組顏色 + emoji 調色盤（📚🌟🎨🚀🌈🎯🌸🍀）
- 新增班級時自動分配下一組未使用的視覺識別
- 右上角班級切換按鈕依目前班級的顏色動態渲染（漸層 + 陰影）
- 下拉選單的每個班級顯示自己的 emoji 與顏色
- 自動遷移：老用戶現有班級會被自動補上 icon/color

#### 🌱 D2：空狀態視覺與引導（EmptyState 元件）
**全新檔案 `js/empty-state.js`**：通用的空狀態元件，讓各區塊沒資料時不再是冷冰冰的灰色文字。
- 4 個區塊已整合：學生管理、聯絡簿、作業檢查、班級公告
- 每個空狀態包含：emoji、主標題、說明、行動按鈕、小提示
- Bob 彈跳動畫 + FadeIn 淡入動畫
- RWD 支援：可用 `compact: true` 參數產生縮小版

#### ☁️ C3：同步狀態常駐指示器
**全新檔案 `js/sync-status-indicator.js`**：右下角浮動雲端圖示，一眼看出資料是否已安全上雲。
- 五種狀態：🟢 已同步 / 🟡 未同步 / 🔵 同步中 / 🔴 失敗 / ⚫ 未登入
- Hover 顯示「上次同步 X 分鐘前」
- Click 一鍵觸發手動同步
- 自動攔截 `localStorage.setItem`，有新變動時由 🟢 變 🟡
- 每分鐘重新計算（超過 2 分鐘未同步會從 🟢 變 🟡 提醒）

#### ⌨️ B1：Ctrl+K 班級快速切換器
**全新檔案 `js/class-quick-switcher.js`**：類似 VSCode / Slack 的 command palette。
- `Ctrl+K` 或 `Cmd+K` 開啟
- 即時搜尋（班號 / 班名）
- `↑↓` 選擇、`Enter` 切換、`Esc` 關閉
- 數字鍵 1-9 快速切換前 9 個班級
- 點擊班級項目也可直接切換
- 顯示目前班級的綠色「目前」badge

### 🔧 技術債修正

#### E1：修掉 `classnew.html:1274` 多餘的 `</div>`
v3.0.9 Session 發現的 HTML 結構不平衡問題。真實瀏覽器容錯，但某些預覽工具對此敏感。

#### E2：GitHub Actions Node.js 20 棄用警告
在 workflow 加入 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"`，主動 opt-in 到 Node.js 24。2026-09-16 Node 20 移除前完成升級準備。

### 📁 更新檔案

**新增**：
- `js/empty-state.js` 【新】通用空狀態元件
- `js/sync-status-indicator.js` 【新】同步狀態指示器
- `js/class-quick-switcher.js` 【新】Ctrl+K 快速切換器

**修改**：
- `classnew.html` - 7 處 `data-primary-action`、3 處 `?v=3.1.0` cache-buster、新腳本掛載、E1 多餘 div 移除、空狀態整合
- `js/class-profiles.js` - 加入調色盤、自動分配、UI 動態渲染
- `js/announcement.js` - 發布按鈕 `data-primary-action`、空狀態整合
- `js/student-enhancement.js` - 空狀態整合
- `js/notebook-enhancement.js` - 空狀態整合
- `js/homework-enhancement.js` - 空狀態整合
- `.github/workflows/deploy.yml` - E2 Node.js 24 env var
- `sw.js` - 新增 3 個檔案到 PRECACHE
- `package.json` / `manifest.json` - 版本號升至 **v3.1.0**

### 💡 使用者可感知的差異
- ✨ **點擊 `classnew.html#timer` 後直接看到「開始」按鈕**（原本需要再往下捲）
- 🎨 **切到不同班級時右上角按鈕顏色會變**（預防切錯班）
- ⌨️ **按 Ctrl+K 秒切班級**（不用再點下拉選單）
- ☁️ **右下角隨時看到同步狀態**（不用再打開下拉選單找上次同步時間）
- 🌱 **空畫面變成友善引導**（新老師知道下一步該做什麼）

---

## [v3.0.13] - 2026-04-16

### 🔒 多班級資料隔離與同步完整性大修
本次版本針對「科任老師教多班」的核心痛點做全面修補：

#### Phase 1：補上 3 個遺漏的功能性資料
- ✅ **`examAbsenceRecords`**（考試缺考詳細記錄）— 之前漏掉，換裝置後缺考記錄消失
- ✅ **`seatingConfig`**（座位表）— 之前漏掉，老師排好的座位換裝置後要重排
- ✅ **`drawnStudentIds`**（抽籤已抽出學生 ID）— 之前漏掉，換裝置後抽過的學生會被重複抽

#### Phase 2：補上 4 個 UI 偏好同步
- `examLightMode` / `examAnalogClock`（全螢幕監考的淺色模式 / 類比時鐘偏好）
- `examSoundsEnabled`（考試音效開關）
- `homeworkDashboardView`（作業檢查的卡片/表格視圖偏好）

#### Phase 3：多班級資料完全隔離（架構性改進）⭐
**新增 `js/class-aware-storage.js` — 透明的 localStorage 攔截器**

之前的問題：聯絡簿、作業列表、考試科目、班級公告等 11 個 key 是**全域共用**，多班級老師切換班級時資料會互相覆蓋（科任老師 601 班的公告，切到 602 班會被取代）。

修補方式：
- 攔截 `localStorage.{getItem, setItem, removeItem}`，對 11 個共用 key 自動加上 `-{classId}` 後綴
- **完全透明，零模組修改** — 現有 `js/announcement.js`、`js/exam-proctor.js`、`js/homework-enhancement.js` 等模組依舊用 `localStorage.getItem('notebookEntries')`，攔截器自動路由到正確的 per-class key
- 預設班級沿用原 key（向下相容，老用戶資料不丟失）
- 一次性遷移：升級時若使用者目前在非預設班級，自動把全域 key 的資料複製到 per-class key

完整隔離的 11 個 key：
`notebookEntries`、`homeworkList`、`homeworkChecks`、`lotteryHistory`、`classAnnouncements`、`examSubjects`、`examReminders`、`examAttendance`、`examAbsenceRecords`、`seatingConfig`、`drawnStudentIds`

#### 同步覆蓋矩陣（升級後）
| 資料 | 單班同步 | 全班同步 | 班級隔離 |
|---|---|---|---|
| 9 大功能區塊核心資料 | ✅ | ✅ | ✅ 各班獨立 |
| `examAbsenceRecords` / `seatingConfig` / `drawnStudentIds` | ✅ **新增** | ✅ **新增** | ✅ |
| UI 偏好（4 項） | ✅ **新增** | ✅ **新增** | ⚪ 全域（合理）|

### 📁 更新檔案
- `js/class-aware-storage.js` **【新增】** - localStorage 攔截器（11 共用 key 自動依班級隔離）
- `classnew.html` - 在 `<head>` 最早載入攔截器
- `js/firebase-sync.js` - `syncToCloud` / `loadFromCloudData` / `syncAllClassesToCloud` / `syncAllClassesFromCloud` 全部加入 7 個新 key
- `sw.js` - 加入新檔案到 PRECACHE
- `package.json` / `manifest.json` / `sw.js` - 版本號升至 v3.0.13

---

## [v3.0.12] - 2026-04-16

### ✨ Google 帳號登入提醒通知
- **首次使用者引導 Banner**：未登入的老師進入頁面 3 秒後，底部會出現浮動提醒卡片，說明「登入 Google 帳號可以雲端備份班級數據、跨裝置同步」。
- **三種自動不再顯示的條件**：
  - 已登入 Google 帳號的老師：不會出現提醒。
  - 曾登入過的老師（即使後來登出）：不會再出現。
  - 點擊「不再提醒」或「✕」的老師：永久不再顯示。
- **行動按鈕**：Banner 提供「立即登入」（一鍵觸發 Google OAuth）及「不再提醒」兩個選項。
- **RWD 支援**：手機版按鈕自動堆疊為全寬。
- **無障礙**：`aria-label` 標記、鍵盤可操作。

### 📁 更新檔案
- `js/google-auth-ui.js` - 新增登入提醒 Banner CSS、`showLoginReminder` / `dismissLoginReminder` / `shouldShowLoginReminder` 邏輯、`onAuthStateChanged` 整合、公開 API `dismissReminder`。
- `package.json` / `manifest.json` / `sw.js` - 版本號升至 v3.0.12。

---

## [v3.0.11] - 2026-04-16

### ✨ Deep-link 主要行動按鈕優先顯示
- **考試監考 deep-link 直接看到「啟動全螢幕監考模式」按鈕**：透過 `classnew.html#exam` 進入頁面時，自動捲動至主要 CTA 按鈕，讓使用者一進來就能直接開始監考，不需要再往下滑找按鈕。
- **`data-primary-action` 機制**：在 HTML 元素加上 `data-primary-action="true"` 即可標記為該區塊的主要行動按鈕，初始化 deep-link 時會優先捲至該按鈕位於視窗底部（`scrollIntoView({block: 'end'})`）。未標記的區塊仍然捲到頂部（`block: 'start'`）。
- **時序修正**：將 deep-link 自動捲動延遲調整為 500ms（原 150ms），確保晚於 `navigation-enhancement.js` 的捲動邏輯，避免被覆蓋。

### 📁 更新檔案
- `classnew.html` - `_autoScrollToSection` helper 新增 `data-primary-action` 優先邏輯；啟動全螢幕監考模式按鈕加上 `data-primary-action="true"` 標記與 `scroll-margin-bottom`。
- `package.json` / `manifest.json` / `sw.js` - 版本號升至 v3.0.11。

---

## [v3.0.10] - 2026-04-16

### ✨ Deep-link UX 優化
- **分享連結進入後自動捲動**：透過 URL hash 深連結（例：`classnew.html#exam`）進入頁面時，自動捲動到對應區塊，使用者不再需要手動往下滑。
- **為什麼用 instant 而非 smooth**：分享連結進入的情境下，使用者期待「立即看到目標內容」，不需等動畫。點擊 tab 切換時仍然由 `navigation-enhancement.js` 提供既有的 smooth scroll。
- **無 hash 載入維持原行為**：未帶 hash 的正常進入（`classnew.html`）保持 scrollY=0，頂部 nav 完整可見。

### 📁 更新檔案
- `classnew.html` - 初始化流程新增 `_autoScrollToSection` helper 與 deep-link 專用捲動邏輯。
- `package.json` / `manifest.json` / `sw.js` - 版本號升至 v3.0.10。

---

## [v3.0.9] - 2026-04-16

### ✨ UX 小改進
- **URL Hash 深連結**：支援用網址直接跳轉到指定區塊，提升分享連結的可用性。
  - 例：`classnew.html#exam` 直接開啟考試監考、`classnew.html#announcement` 直接開啟班級公告。
  - 支援的區塊：`students` / `points` / `grouping` / `lottery` / `timer` / `notebook` / `homework` / `exam` / `announcement`。
  - `showSection()` 切換時會自動同步 URL hash（使用 `history.replaceState`，不污染瀏覽歷史）。
  - 新增 `hashchange` 監聽，允許手動改網址切換區塊。
- **考試監考預設科目調整**：新使用者（首次載入）的預設科目由 `國語 / 數學 / 社會` 改為 `國語 / 自然 / 英文`（已有自訂科目的使用者不受影響）。

### 📁 更新檔案
- `classnew.html` - 新增 `VALID_SECTIONS` 常數、`showSection` 同步 hash、初始化時依 hash 跳轉、`hashchange` 監聽。
- `js/announcement.js` - 公告模組的 `showSection` wrapper 同步 hash。
- `js/exam-proctor.js` - 預設科目改為「國語 / 自然 / 英文」。
- `package.json` / `manifest.json` / `sw.js` - 版本號升至 v3.0.9。

---

## [v3.0.8] - 2026-03-24
### 🔧 部署與安全修復
- **部署來源轉換**：將 GitHub Pages 的部署來源從分支 (Branch) 切換為 **GitHub Actions**，確保金鑰注入腳本能正確執行。
- **佔位符標準化**：統一 `firebase-config.js` 中的 `appId` 為 `__FIREBASE_APP_ID__` 佔位符。
- **診斷功能強化**：更新 `inject.py` 以便在部署日誌中查看環境變數的注入狀態。

## [v3.0.7] - 2026-03-24

### 🔐 安全性與開發流程優化

#### 💉 Firebase API Key 注入機制強化（`inject.py` + 新增開發腳本）

**改進說明**：
- **Windows 相容性修補**：修正了 `inject.py` 在 Windows 環境下執行時，因 Emoji 字元導致的 `UnicodeEncodeError` 與 `UnicodeDecodeError`。
- **本地開發自動化**：新增 `scripts/apply-secrets.py` 與 `scripts/restore-placeholders.py`，大幅簡化本地開發時套用與還原金鑰的流程。
- **快捷指令整合**：在 `package.json` 中新增 `npm run dev:apply` 與 `npm run dev:restore` 腳本，落實「零洩漏」安全性規範。

### 📁 更新/新增檔案
- `.github/inject.py` - 修正編碼問題
- `scripts/apply-secrets.py` **[新增]** - 本地金鑰注入工具
- `scripts/restore-placeholders.py` **[新增]** - 佔位符還原工具
- `package.json` / `manifest.json` - 版本號升至 v3.0.7
- `sw.js` - 快取版本同步更新至 v3.0.7

---

## [v3.0.6] - 2026-03-18

### 🆕 新功能

#### 📊 作業總覽儀表板 - 表格模式增強（`js/homework-enhancement.js`）

**新功能說明**：
- **表格視圖**：新增「表格」顯示模式，可一次查看所有學生對應所有作業的繳交狀態。
- **固定行列**：支援捲動時固定作業名稱（首欄）與學生標題（表頭），優化大數據量下的閱讀體驗。
- **快速循環切換**：直接點擊表格儲存格即可循環切換狀態（未檢查 → 完成 → 未交 → 需訂正 → 遲交）。
- **視圖持久化**：自動記憶使用者最後選擇的視圖模式（卡片或表格）。
- **統計同步**：表格內的狀態改動會即時同步至儀表板統計資訊與主分頁顯示。

### 📁 更新檔案
- `js/homework-enhancement.js` - 實作表格渲染、樣式與狀態切換邏輯
- `classnew.html` - 儀表板 Modal 結構更新，加入視圖切換按鈕
- `manifest.json` / `package.json` - 版本號升至 v3.0.6
- `sw.js` - 快取版本更新

---
## [v3.0.5] - 2026-03-04

### 🆕 新功能

#### 🏫 多班級學生資料隔離（`classnew.html` + 9 個 JS 模組）

**問題描述**：切換班級時，所有班級共用同一個 `localStorage.students` key，導致不同班級的學生資料互相混淆。

**修復方式**：
- `classnew.html` 初始化 `window.STUDENTS_KEY`：預設班使用 `students`（向下相容），其他班使用 `students-{classId}`（如 `students-1772592454136`）
- 9 個 JS 模組全部改用 `window.STUDENTS_KEY || 'students'` 讀寫 localStorage

**更新模組**：
`student-enhancement.js`、`ui-enhancement.js`、`firebase-sync.js`、`backup.js`、`semester-archive.js`、`data-reports.js`、`leaderboard-enhancement.js`、`lottery-enhancement.js`、`exam-proctor.js`、`google-auth-ui.js`

### 🐛 修復

#### 📱 同步確認 Modal 顯示優化（`js/firebase-sync.js`）

- 在 Modal 標題副文字加入目前班級名稱（如「⚡ 僅同步 [602] 班的資料，其他班級不受影響」）
- 警告文字改為「只同步『602』班的資料至雲端，將完整覆蓋該班雲端資料」
- 消除因本地/雲端班級資料量差異產生的誤導性「-25 人」警示

### 📁 更新檔案
- `classnew.html` - 初始化 `STUDENTS_KEY` 全域變數
- `js/firebase-sync.js` - 同步 Modal 顯示班級名稱
- 9 個 JS 模組 - 改用 `STUDENTS_KEY` 讀寫學生資料
- `sw.js` / `manifest.json` - 版本號升至 v3.0.5

---

## [v3.0.4] - 2026-03-04

### 🐛 修復

#### ☁️ 雲端同步無限循環修復（`js/firebase-sync.js`）

**問題描述**：從雲端還原資料後，AutoSync 立即再次觸發下載，且二次開啟同步預覽 Modal 時本地資料始終顯示為 0，造成差異假報警並形成無限同步循環。

**根本原因（5 個連鎖問題）**：

| # | 問題 | 後果 |
|---|------|------|
| 1 | `syncStatus` 用 `let` 宣告，`auto-sync.js` 讀取的 `window.syncStatus` 是不同物件 | `isSyncing` 防護完全失效 |
| 2 | `loadFromCloud()` 還原後未更新 `lastSyncTime` | AutoSync 認為超過間隔，立即再次觸發上傳 |
| 3 | `showSyncConfirmModal` 讀取雲端兩次（比對 + 還原各一次） | 浪費 Firebase 讀取次數 |
| 4 | `loadFromCloud()` 缺乏 `isSyncing` 互斥保護 | 並行呼叫不受限 |
| 5 | 還原後全域變數（`window.students` 等）未更新 | `getLocalStats()` 讀到舊值（0），預覽 Modal 永遠顯示本地為 0 |

**修復方式**：
- 將 `syncStatus` 改為 `window.syncStatus`，並以 `const syncStatus = window.syncStatus` 引用
- 新增 `loadFromCloudData(cloudData)` 函式，內含 `isSyncing` 保護、還原後更新 `lastSyncTime` 與更新全域變數
- `showSyncConfirmModal` 確認時直接傳入已下載的 `cloudData`，不再二次讀取 Firebase
- 原 `loadFromCloud()` 改呼叫 `loadFromCloudData()`，保持向下相容

### 📁 更新檔案
- `js/firebase-sync.js` - 同步防護機制全面修復
- `sw.js` / `manifest.json` - 版本號升至 v3.0.4

---

## [v3.0.3] - 2026-03-04

### 🔐 安全性
- **Firestore Security Rules 正式部署**（Q13）：新建 `firestore.rules`，覆蓋多班級路徑 `classes/{classId}/**`、全域 meta 路徑 `_meta/**` 及 `archives/**`，確保每位使用者只能讀寫自己的資料
- 更新 `firebase.json` 加入 `firestore.rules` 設定，支援 `firebase deploy --only firestore:rules`

### 📦 系統工具
- **Service Worker 版本管理自動化**（Q14）：新增 `scripts/update-sw-version.js`，從 `manifest.json` 自動讀取版本號並一次更新 `sw.js` 的 `CACHE_NAME`、`STATIC_CACHE`、`DYNAMIC_CACHE` 及 `@version` 標籤
- 新增 `package.json`，含 `npm run update-sw` 和 `preversion` 鉤子，升版後執行 `npm version patch` 即可自動同步 SW 快取版本

### 📅 新功能
- **學期資料自動封存系統**（Q01）：新增 `js/semester-archive.js`，一鍵封存學期到 Firebase `archives/{year}-{semester}/`，選項包含清空分數/清空作業，完整支援多班級路徑（v3.0.1+）
- 封存 UI：在「學生管理」頁自動注入「📅 封存本學期資料」按鈕，彈出確認 Modal 顯示本學期統計

### 🐛 修復
- 修復電腦版導覽列班級選擇器與時鐘按鈕重疊問題：桌面版右側三個 slot 統一包入 `ml-auto wrapper`，時鐘絕對置中與右側元素不再衝突
- 修復時鐘按鈕位置跑偏：移除錯誤加入的 `lg:top-1/2 lg:-translate-y-1/2`，恢復原本正確的 `lg:transform lg:-translate-x-1/2`
- 班級選擇器下拉選單改為從右側展開（`right:0`），不超出螢幕右邊界

### 📁 更新/新增檔案
- `firestore.rules` **[新增]** - Firestore 安全規則
- `firebase.json` **[修改]** - 加入 `firestore` 設定區塊
- `scripts/update-sw-version.js` **[新增]** - SW 版本自動化腳本
- `package.json` **[新增]** - npm 腳本定義
- `js/semester-archive.js` **[新增]** - 學期封存模組
- `js/class-profiles.js` **[修改]** - 下拉選單從右側展開
- `classnew.html` **[修改]** - 導覽列右側 slot 重構、加入 semester-archive.js 引用

---

## [v3.0.1 ~ v3.0.2] - 2026-03-03

### ✨ 新功能
- **多班級系統（P13）**：科任老師可在同一帳號管理多個班級，資料完全隔離（獨立 IDB + Firebase 子路徑）
- 班級切換器注入桌面/手機導覽列（`js/class-profiles.js` 新增）

### 🐛 修復（v3.0.2）
- `syncToCloud()` 的 `homeworkChecks` 改用 `getUserCollection()` 動態多班級路徑（原本硬編碼錯誤）
- `syncFromCloud()` 同樣修正 `homeworkChecks` 下載路徑
- `classProfiles`（班級清單）現在每次上傳時同步至 `users/{uid}/_meta/classProfiles`，下載後與本地合併還原
- `loadFromCloud()` 修正誤用舊變數的 bug（`students` → `cloudData.students`）

---

## [v3.0.0] - 2026-03-03


### 🆕 新增功能

#### ✋ 手勢操作支援（`js/gesture-handler.js`）
- **觸控左右滑動**切換功能區（學生管理 ↔ 加扣分 ↔ 分組 ↔ 抽籤 ↔ 計時器…），方便平板/手機操作
- **長按學生卡片**彈出快捷選單（+1分 / +2分 / -1分 / 查看資料），不需進入加扣分頁面
- **GestureHandler 通用類別**，可供其他模組重用（`new GestureHandler(el, { onSwipeLeft, onLongPress })`）
- 智慧識別橫向滾動容器，不干擾考試監考科目列等原生滾動
- 切換功能區時顯示半透明 Toast 提示（如「→ 隨機分組」）

#### ⏱️ 自動定時同步（`js/auto-sync.js`）P11 功能
- **每 10 分鐘自動呼叫 `syncToCloud()`**，無需手動操作，資料安全有保障
- **登入後自動啟動**、登出後自動停止，無副作用
- 從背景切回前台時，若距上次同步超過間隔 → 立即補同步
- 同步中顯示右上角 ⟳ 旋轉小圓點，完成後顯示底部 Toast
- 支援動態調整間隔：`AutoSync.setIntervalMin(5)`（1~120 分鐘）
- 未登入 / 離線 / 已在同步中 → 自動跳過，不報錯

#### 📵 離線狀態偵測（`js/offline-detector.js`）P12 功能
- 斷網時頂部滑入**黃色警告 Banner**：「目前離線中 — 資料已安全暫存於本機 IndexedDB」
- 自動調整 `<nav>` 間距，Banner 不遮住導覽列
- Banner 提供 ✕ 關閉按鈕（僅關閉提示，離線仍持續偵測）
- 恢復連線時 Banner 自動滑出 + 觸發一次 AutoSync
- **深色模式相容**：自動切換為棕色色調

### 📁 更新檔案
- `js/gesture-handler.js` **[新增]** - 手勢操作支援（觸控滑動 + 長按選單）
- `js/auto-sync.js` **[新增]** - 自動定時同步（P11，每 10 分鐘）
- `js/offline-detector.js` **[新增]** - 離線狀態偵測 Banner（P12）
- `classnew.html` - 加入三個新模組的 script 引用
- `sw.js` - 版本升至 v3.0.0，STATIC_ASSETS 新增三模組快取
- `manifest.json` - version 升至 3.0.0
- `FUTURE_DEVELOPMENT_SUGGESTIONS.md` - 新增第八章 P 系列（P01~P15）全新功能建議

---

## [v2.9.9] - 2026-03-03


### 🆕 新增功能

#### 💾 IndexedDB 儲存模組（`js/class-db.js`）
- **全新 `ClassDB` 模組**：取代 localStorage 成為主要儲存層，容量從 ~5MB 提升至 250MB+
- **9 個資料表**：`students` / `pointsHistory` / `groups` / `notebookEntries` / `homeworkList` / `lotteryHistory` / `classAnnouncements` / `examSubjects` / `savedStudentLists`
- **Settings KV 表**：統一管理所有設定類資料（時鐘/作業/抽籤/同步時間等）
- **首次自動遷移**：偵測到舊 localStorage 資料時，自動一次性遷移至 IndexedDB，完成後標記避免重複
- **透明後備機制**：IndexedDB 不可用時自動降級至 localStorage，完全不影響功能
- **localStorage 同步備份**：每次 `ClassDB.save()` 也同步寫入 localStorage，雙重保護
- **儲存用量報告**：localhost 開發模式下在 Console 顯示 IDB 用量（MB / 總配額）
- **`firebase-sync.js` 整合**：`loadFromCloud()` 改用 `ClassDB.save`，確保同步結果也寫入 IDB

### 📁 更新檔案
- `js/class-db.js` **[新增]** - IndexedDB 模組（完整 CRUD + 自動遷移）
- `classnew.html` - 加入 `class-db.js` script 引用（firebase-config 之前載入）
- `js/firebase-sync.js` - `loadFromCloud()` 改用 ClassDB.save
- `sw.js` / `manifest.json` - 版本號升至 v2.9.9

---

## [v2.9.8] - 2026-03-03


### 🔧 修復問題

#### ☁️ 同步功能細節修復
- **考試監考設定差異假警報** - 本地統計用科目數量、雲端用有/無，標準不一致導致每次都顯示差異 → **統一改用陣列長度計算**
- **分組還原後不顯示** - `loadFromCloud()` 重繪區段漏掉 `renderGroups()` 呼叫，資料有寫入但畫面不更新 → **補上呼叫**

#### 🌙 深淺色切換按鈕佈局優化
- 原 `position: fixed; top: 1rem; right: 1rem` 直接疊在 Google 帳號頭像上
- **新增 `theme-toggle-slot` div** 至導覽列（桌面 + 手機版），按鈕移入 nav 中，在頭像左側
- 後備方案改為 `right: 5rem` 確保不重疊

### 📁 更新檔案
- `js/firebase-sync.js` - 考試監考統計一致化、渲染修復
- `js/theme-toggle.js` - 按鈕插入 nav slot 邏輯
- `classnew.html` - 新增 `theme-toggle-slot`（桌面 + 手機）
- `sw.js` / `manifest.json` - 版本號升至 v2.9.8

---

## [v2.9.7] - 2026-03-03


### ✨ 新增功能 & 🔧 修復

#### ☁️ Google 帳號同步功能完整優化

**同步涵蓋範圍補全**：

| 類別 | 修改前 | 修改後 |
|------|--------|--------|
| 班級公告下載 | ❌ 缺漏 | ✅ 修復 |
| 考試監考設定（科目/提醒/出勤） | ❌ 未同步 | ✅ 新增 |
| 時鐘樣式設定 | ❌ 未同步 | ✅ 新增 |
| 抽籤不重複設定 | ❌ 未同步 | ✅ 新增 |

**同步確認 Modal 全面升級**：
- 廢除原生 `confirm()` 對話框，改用精美的漸層卡片式 Modal
- 同步前自動靜默讀取雲端資料，計算本地 vs. 雲端的具體差異
- 顯示 10 類資料的數量對比表格（學生/加扣分/聯絡簿/作業/公告/考試/時鐘等）
- 差異數量以彩色標示（增加 🟢 / 減少 🔴 / 無變化 灰色）
- 上傳和下載各有獨立方向的確認 Modal，警告文字清楚說明覆蓋方向

### 📁 更新檔案
- `js/firebase-sync.js` - 全面改寫 v2（590 行），補全同步範圍 + 新增 Modal
- `js/google-auth-ui.js` - `syncUp/syncDown` 改呼叫 `showSyncConfirmModal`

---

## [v2.9.6] - 2026-03-03


### 🔧 修復問題

#### ⏰ 大時鐘全螢幕自適應完整修復（所有樣式）

**問題根源**：CSS `vw` 單位無法精確反映字體在不同字型下的實際渲染寬度，導致數位/LED/可愛時鐘溢出，翻轉時鐘字體過小。

**修復策略 — `fitClockToScreen()` v2（精確量測法）**：

- **文字時鐘（數位 / LED / 可愛）**
  - 先設 200px 基準字體 → 量測 `scrollWidth` / `scrollHeight`（實際渲染數值）→ 按比例縮放
  - 保證字體恰好填滿可用空間，不溢出、不太小
- **翻轉時鐘**（之前 JS 未支援）
  - 偵測 `style === 'flip'`，直接對 `.flipper` 和 `.flipper-colon` 計算並設定字體大小
  - 以可用寬高各自計算限制值，取最小值套用
- **視窗 resize 支援**：視窗縮放時自動重新計算，橫向/直向均正確

### 📁 更新檔案
- `classnew.html` - `fitClockToScreen()` v2 全面重寫，CSS 同步整理
- `sw.js` - 版本號更新至 v2.9.6
- `manifest.json` - 版本號更新至 v2.9.6

---

## [v2.9.5] - 2026-03-03


### 🔧 RWD 修復

#### 📱 手機/平板登入按鈕 RWD 優化
- **問題修正**：導覽列登入按鈕在手機/平板寬度下完全不顯示（`hidden lg:flex` 問題）
- **全裝置可見**：所有螢幕尺寸現在都能看到並操作登入/登出功能
- **手機版佈局重設計**：Logo 與登入按鈕同行顯示（左 Logo、右登入），時鐘按鈕置中換行
- **緊湊型手機按鈕**：手機版登入按鈕較桌面版更小，只顯示 Google 圖示 + 「登入」文字
- **登入後頭像**：登入後手機版顯示圓形頭像，點選展開下拉選單（同步/還原/登出）
- **雙版本狀態同步**：登入/登出/同步狀態在桌面版與手機版同步更新

### 📁 更新檔案
- `classnew.html` - 導覽列 RWD 布局調整，新增 `auth-nav-slot-mobile`
- `js/google-auth-ui.js` - 新增手機版按鈕注入、狀態同步、下拉選單
- `sw.js` - 版本號更新至 v2.9.5
- `manifest.json` - 版本號更新至 v2.9.5

---

## [v2.9.4] - 2026-03-03

### 🔧 UI 優化

#### ⏰ 大時鐘字體再次放大
- **數位樣式**：字體提升 `clamp(5rem, min(26vw, 52vh), 40rem)`（由 30vh → 52vh）
- **LED 樣式**：字體提升 `clamp(4rem, min(24vw, 46vh), 36rem)`（由 28vh → 46vh）
- **可愛樣式**：字體提升 `clamp(7rem, min(26vw, 52vh), 40rem)`（由 34vh → 52vh）
- 在 1920×911 螢幕佔高度由 34% 提升至 **52%**，充分利用垂直留白

### 📁 更新檔案
- `classnew.html` - 三種時鐘樣式字體 clamp 數值更新

---

## [v2.9.3] - 2026-03-02

### 🔧 開發環境改善

#### 🚀 localhost 自動清除 Service Worker 快取
- **`<head>` 頂部內嵌偵測 script**：偵測 localhost/127.0.0.1 時自動執行
- **`unregister()` 所有 SW**：避免舊快取攔截造成 404 錯誤
- **`caches.delete()` 所有 Cache**：開發流暢，正式環境不受影響

### 📁 更新檔案
- `classnew.html` - `<head>` 頂部新增 localhost 偵測腳本

---

## [v2.9.2] - 2026-03-02

### 🔧 UI 優化

#### ⏰ 大時鐘全螢幕模式優化
- **字體改用 `min(vw, vh)`**：寬螢幕不溢出，直向螢幕也能正確縮放
- **底部提示橫槓**：控制列隱藏時底部顯示細橫槓，hover 消失
- **`line-height: 0.95` + `letter-spacing`**：時鐘更緊湊，更易讀

### 📁 更新檔案
- `classnew.html` - 時鐘字體縮放策略與細節優化

---

## [v2.9.1] - 2026-03-02

### 🔧 修復問題

#### 🔑 登出後登入按鈕 UI 未重置修正
- **`LOGIN_BTN_HTML` 共用常數**：統一登入按鈕 innerHTML，避免重複字串
- **`showLoggedOut()` 完整還原**：登出時同時重置 innerHTML、disabled、關閉下拉
- **`login()` 安全還原**：await 後不論成功或取消，均立即還原按鈕狀態（修正「登入中...」卡住問題）

### 📁 更新檔案
- `js/google-auth-ui.js` - 登出 UI 還原邏輯完整化

---



### ✨ 新增功能

#### 📺 聯絡簿展示模式 (Presentation Mode)
- **視覺體驗升級**：專為教室投影設計的大字體、高對比全螢幕介面。
- **即時時鐘整合**：頂部顯示目前日期與精確時間，幫助教學節奏掌握。
- **主題切換**：支援深色與淺色模式切換，適應不同教學場景。
- **穩定性優化**：按鈕直接嵌入 HTML，確保功能 100% 可見與穩定觸發。

### 🔧 修復與改進

#### 📝 聯絡簿系統
- **修復渲染崩潰漏洞**：解決了原始 `renderNotebook` 函式在遇到未知記事類型時會導致 JavaScript 報錯的安全性漏洞（TypeError）。
- **同步邏輯優化**：確保展示模式與主視窗資料完全同步。

### 📁 更新檔案
- `classnew.html` - 嵌入展示模式按鈕與修復渲染漏洞
- `js/notebook-enhancement.js` - 展示模式核心邏輯實作與清理
- `sw.js` - 版本號更新至 v2.8.2
- `manifest.json` - 版本號更新至 v2.8.2

---

## [v2.8.1] - 2026-02-26

### ✨ 重大更新與 UX 優化

#### 🔄 作業檢查實時同步系統
- **全域數據共享優化**
  - 將核心數據變數宣告由 `let` 改為 `var`，徹底解決跨腳本作用域隔離問題。
  - 確保「全螢幕模式」與「主視窗區域」操作的是同一個數據對象。
- **實時 UI 渲染同步**
  - 在全螢幕模式下進行的任何狀態變更（完成、未交、訂正、遲交），會即時同步至主畫面列表與統計區。
  - 關閉全螢幕視窗後，主畫面數據立即顯現最新狀態，無需重新載入。

### 🔧 修復與改進

#### 🖥️ 全螢幕儀表板
- **修復彈窗回歸錯誤**：補回 `openHomeworkFullscreen` 中遺漏的 `.active` 類名。
- **導航優化**：補回 `closeHomeworkFullscreen` 函式，確保關閉全螢幕後能正確跳回作業儀表板。

#### 🛡️ 安全性與錯誤處理
- **學生資料誤判修正**：統一採用 `AppState.students` 優先檢查，解決了「已有學生卻顯示未輸入提示」的邏輯誤判。
- **錯誤提示優化**：針對全螢幕檢查加入專屬的安全提示訊息。

### 📁 更新檔案
- `classnew.html` - 全域變數作用域修正
- `js/homework-enhancement.js` - 新增同步機制與回歸錯誤修正
- `js/student-enhancement.js` - 學生資料檢查邏輯優化
- `sw.js` - 版本號更新至 v2.7.0

---

## [v2.6.8] - 2026-01-21

### ✨ 新增功能

#### 🔍 學生名單搜尋功能
- **即時搜尋過濾**
  - 支援姓名搜尋（不區分大小寫）
  - 支援座號搜尋
  - 輸入即時過濾學生列表

- **效能優化**
  - 150ms 防抖處理，避免頻繁重繪

- **搜尋體驗優化**
  - 關鍵字黃色高亮顯示
  - 搜尋統計顯示（找到 X / Y 位學生）
  - 清除按鈕（✕）一鍵清空搜尋
  - ESC 快捷鍵清除搜尋
  - 無結果時顯示友善提示

### 📁 更新檔案
- `js/student-enhancement.js` - 新增搜尋功能模組

---

## [v2.6.7] - 2026-01-21

### ✨ UX 體驗優化

#### 🪑 座位表輸入框優化
- 修正行數/列數輸入框寬度過窄導致數字無法顯示的問題
- 增加輸入框最小寬度 (70px) 和適當的內邊距
- 添加 RWD 響應式設計，適應不同螢幕尺寸
- 優化深色模式下的顯示效果

#### 🧭 功能選單平滑滾動（新增）
- 點擊上方功能選單按鈕後，頁面會自動平滑滾動到對應區塊
- 大幅提升使用者體驗，讓切換功能更加直覺

### 📁 新增檔案
- `js/navigation-enhancement.js` - 導航增強模組
- `.agent/workflows/modify-html-safely.md` - 代碼修改工作流程指南

### 🔧 技術改進
- `js/ui-enhancement.js` - 座位表 CSS 樣式優化

---

## [v2.6.6] - 2026-01-14

### 🔧 UI 優化

#### 🖥️ 考試監考模式 - 狀態區字體放大
- **考試進行中**：字體從 `clamp(1.5rem, 4vw, 3rem)` 放大至 `clamp(2rem, 5vw, 4rem)`
- **剩餘時間**：字體從 `clamp(1.2rem, 3vw, 2.2rem)` 放大至 `clamp(1.5rem, 4vw, 2.8rem)`
- 膠囊背景透明度提高 (`0.2` → `0.25`)，更醒目
- 符合 RWD 格式，大小螢幕都能正確顯示

### 📁 更新檔案
- `js/exam-proctor.js` - 狀態區字體樣式

---

## [v2.6.5] - 2026-01-14

### 🔧 UI 優化

#### 🖥️ 考試監考模式 - 右側布局優化
- **修復重疊問題**
  - 狀態區（考試進行中）與提醒區不再重疊
  - 調整 grid 佈局，狀態區改為佔據獨立行
  - 設定狀態區最大高度 35vh 確保空間足夠

- **剩餘時間 UI 強化**
  - 加入半透明背景 (`rgba(255,255,255,0.2)`)
  - 圓角膠囊設計 (`border-radius: 2rem`)
  - 脈動動畫效果 (`pulse-remaining`)，更醒目易讀
  - 字體放大並加粗，學生更容易看清倒數時間

- **提醒區優化**
  - 減少內邊距，給內容更多空間
  - 確保提醒卡片完整顯示不被截斷

### 📁 更新檔案
- `js/exam-proctor.js` - 右側狀態區與提醒區布局樣式

---

## [v2.6.4] - 2026-01-14

### 🔧 UI 優化

#### 🖥️ 考試監考模式 - 全螢幕布局優化
- **類比時鐘縮小**
  - 將時鐘尺寸從 `min(50vh, 45vw, 320px)` 縮小至 `min(32vh, 35vw, 260px)`
  - 確保時鐘下方的日期和星期能完整顯示
  
- **科目列表可滾動**
  - 科目區域加入 `overflow-y: auto`
  - 當有 3 個以上科目時可滾動查看
  - 調整列表排列從置中改為靠上對齊
  
- **整體布局調整**
  - 時鐘區域最大高度限制為 45vh
  - 科目區域最大高度限制為 55vh
  - 減少各區域間距，優化空間利用

### 📁 更新檔案
- `js/exam-proctor.js` - 全螢幕監考布局樣式優化

---

## [v2.6.3] - 2026-01-14

### 🔧 UI 優化

#### 🖥️ 考試監考模式 - 狀態列雙行顯示
- 將「考試進行中 - 剩餘 X 分鐘」改為雙行顯示
- 第一行：考試進行中
- 第二行：剩餘時間還有 X 分鐘
- 優化字體大小層次，提高可讀性

### 📁 更新檔案
- `js/exam-proctor.js` - 狀態列雙行顯示與樣式

---

## [v2.6.2] - 2026-01-14

### 🔧 UI 優化

#### ⭐ 加扣分系統 - 按鈕置中對齊
- 將快速加扣分項目按鈕（遲到、未交作業、上課講話等）改為置中對齊
- 符合 RWD 響應式設計，在各種螢幕尺寸下都能正確顯示

### 📁 更新檔案
- `classnew.html` - 加扣分按鈕容器加入 `justify-center`

---

## [v2.6.1] - 2026-01-14

### 🔧 修復問題

#### 🕐 考試監考模式 - 時間選擇器優化
- **智能定位系統**
  - 修復時間選擇器靠近螢幕底部被截斷的問題
  - 自動偵測可用空間，優先往下顯示
  - 空間不足時自動往上方彈出
  - 兩邊空間都不足時居中顯示並限制高度
  - 使用 `requestAnimationFrame` 確保精確定位

- **Z-index 提升**
  - 將 z-index 從 300 提升至 10000
  - 確保在全螢幕監考模式中正確顯示在最上層

- **RWD 相容性**
  - 加入 max-width/max-height 限制
  - 確保在任何螢幕尺寸都能正確顯示
  - 內容過多時支援滾動

### 📁 更新檔案
- `js/exam-proctor.js` - 時間選擇器智能定位

---

## [v2.6.0] - 2026-01-13

### ✨ 新增功能

#### 🔧 核心模組 - 程式碼品質提升 (P0)

- **事件總線 (EventBus)**
  - 統一的模組間事件通訊機制
  - 支援訂閱 (`on`)、一次性訂閱 (`once`)、取消訂閱 (`off`)
  - 事件發送 (`emit`) 與錯誤處理
  - 事件歷史記錄與除錯模式
  - 預定義事件類型常數 (`EventTypes`)

- **錯誤處理模組 (ErrorHandler)**
  - 統一的錯誤類型定義（儲存、網路、驗證、渲染等）
  - 友善的中文錯誤訊息顯示
  - 全域錯誤捕獲（unhandledrejection、window.error）
  - 錯誤歷史記錄與匯出功能
  - 包裝函數 (`wrap`、`wrapAsync`、`safeExecute`)
  - 資料驗證輔助 (`validate`、`assert`)

### 📁 新增檔案
- `js/event-bus.js` - 事件總線模組
- `js/error-handler.js` - 錯誤處理模組

### 📁 更新檔案
- `classnew.html` - 引入核心模組

---

## [v2.5.1] - 2026-01-13

### ✨ 新增功能

#### 🕐 考試監考模式 - 圓形時鐘
- **切換時鐘樣式**
  - 點擊 🕐 按鈕切換數位/類比時鐘
  - 圓形時鐘包含時針、分針、秒針
  - 12 小時制刻度與數字顯示
  - 秒針紅色，分針藍色，時針白色
  - 時鐘下方顯示民國日期

- **視覺設計**
  - 精緻的圓形時鐘外框
  - 深色/淺色模式完整支援
  - 平滑的指針動畫效果

### 📁 更新檔案
- `js/exam-proctor.js` - 新增圓形時鐘切換功能

---

## [v2.5.0] - 2026-01-13

### ✨ 新增功能

#### 📊 作業總覽儀表板
- **卡片式作業總覽**
  - 一目了然所有作業繳交情況
  - 每張卡片顯示作業名稱、繳交日期
  - 狀態標籤：X人未繳（紅）、X人待訂正（橙）、X人遲交（黃）
  - 完成率進度條

- **頂部統計欄**
  - 總作業數
  - 總未繳人次
  - 總待訂正人次
  - 總完成人次

- **快速操作**
  - 點擊卡片直接進入全螢幕檢查模式
  - 新增作業按鈕
  - 匯出 CSV 報告功能

- **視覺設計**
  - 淺藍漸層背景
  - 卡片 hover 動畫效果
  - 完整深色模式支援
  - RWD 響應式設計

### 📁 更新檔案
- `js/homework-enhancement.js` - 新增作業總覽儀表板功能

---


## [v2.4.0] - 2026-01-13

### ✨ 新增功能

#### 📝 考試監考模式
- **全螢幕監考介面**
  - 大型數位時鐘顯示（民國日期+時間）
  - 考試進度條（已進行/剩餘時間）
  - 考試狀態自動切換（進行中/休息中/已結束）
  - 深色/淺色模式切換

- **科目管理**
  - 預設科目時間（國語 08:45-09:25、數學 09:35-10:15、社會 10:25-11:05）
  - 點擊科目名稱可編輯
  - 點擊時間可修改
  - 當前考試科目高亮顯示

- **出勤記錄**
  - 應到/實到人數統計
  - 點擊人數可編輯
  - 缺考/請假備註

- **提醒系統**
  - 考試中提醒語輪播
  - 休息時間提醒語
  - 拖拽排序提醒順序
  - 設定面板管理提醒內容

- **休息時間有趣倒數**
  - 彈跳 emoji 動畫（☕🧘🎯📚💪🌟）
  - 分:秒數字倒數
  - 閃爍分隔符動畫

### 🔧 UI/UX 優化

- **設定提醒面板美化**
  - 漸層紫色標題欄
  - 毛玻璃背景效果
  - 卡片動畫過渡
  - hover 互動效果
  - 長文字自動換行

- **全螢幕監考 RWD**
  - 平板/手機版佈局優化
  - 字體大小自適應
  - 時間區域置中顯示

### 📁 新增檔案
- `js/exam-proctor.js` - 考試監考模組

---


## [v2.3.0] - 2025-12-31

### ✨ 新增功能

#### 🎓 學生管理增強
- **學生頭像系統**
  - 24 個可愛表情符號頭像可選
  - 點擊學生頭像即可更換
  - 新增學生時可預選頭像

- **分組標籤系統**
  - 6 種標籤類型：幹部👑、小老師📖、課輔✏️、特殊需求💝、班長🎖️、副班長🏅
  - 支援多選標籤
  - 標籤顯示在學生卡片上

#### 📝 聯絡簿增強
- **全螢幕編輯模式**
  - 更大的編輯區域，適合長篇內容
  - 支援 Ctrl+Enter 快捷鍵儲存
  - 漸層標題列設計

- **範本系統**
  - 5 種預設範本：今日作業📚、週末通知🏠、考試提醒📝、活動通知🎉、家長會👨‍👩‍👧
  - 一鍵填入範本內容
  - 支援在一般模式和全螢幕模式使用

### 🔧 程式碼品質優化 (P0)

- **狀態管理模組**
  - 新增 `js/app-state.js` 集中管理全域變數
  - 支援資料匯出/匯入和備份
  
- **RWD 響應式設計補強**
  - 新增 `css/rwd-breakpoints.css`
  - 小螢幕優化 (≤360px)
  - 大螢幕優化 (≥1440px)  
  - 超大螢幕優化 (≥1920px)

#### 🍅 番茄鐘模式
- **專注/休息循環**
  - 25 分鐘專注 + 5 分鐘休息自動循環
  - 完成 4 個番茄後 15 分鐘長休息
  - 視覺區分專注/休息模式
  - 完成階段音效通知
  - 跳過按鈕

#### ⌨️ 鍵盤快捷鍵
- **全站快捷操作**
  - 數字 1-7：切換功能區
  - 空白鍵：開始/暫停計時
  - R：重置計時器，F：全螢幕計時
  - P：番茄鐘模式，L：抽籤
  - D：深色模式，?：顯示說明
  - ESC：關閉彈窗

#### 🎨 深色模式完善
- Modal、通知、標籤全面支援深色主題

#### 🔀 拖拽排序
- 學生列表支援拖拽重新排序

#### 🪑 座位表
- **視覺化座位安排**
  - 可調整行列數量
  - 📋 依座號排：按座號順序安排
  - 🎲 隨機排座位：Fisher-Yates 洗牌演算法
  - 手動點擊分配座位
  - 座位配置保存

### 📁 新增檔案
- `js/student-enhancement.js` - 學生增強模組
- `js/app-state.js` - 狀態管理模組
- `css/rwd-breakpoints.css` - RWD 斷點樣式
- `js/pomodoro.js` - 番茄鐘模組
- `js/keyboard-shortcuts.js` - 鍵盤快捷鍵模組
- `js/ui-enhancement.js` - UI 增強模組（深色模式、拖拽、座位表）
- `js/data-reports.js` - 數據報表與備份模組

#### 📊 數據報表
- **學生報告卡** - 個別學生完整分數記錄
- **匯出 CSV** - 班級成績單、分數歷史匯出
- **數據視覺化** - 分數分佈圖、班級前5名

#### 💾 自動備份
- 每 5 分鐘自動備份
- 最多保留 5 個備份
- 備份管理和恢復功能

## [v2.2.0] - 2025-12-31

### ✨ 新增功能

#### 🎲 抽籤系統大升級
- **不重複抽取模式**
  - 預設開啟，確保學生不會被重複抽中
  - 可透過 checkbox 開關切換
  - 設定會自動保存到 localStorage
  
- **即時統計顯示**
  - 顯示「剩餘」可抽取學生人數
  - 顯示「已抽」學生人數
  
- **智慧重置功能**
  - 手動點擊「🔄 重置」按鈕清除記錄
  - 所有學生都被抽過時自動重置
  
- **抽籤時序修正**
  - 修復抽籤歷史提前顯示結果的問題
  - 現在會等動畫結束、結果揭曉後才更新歷史

- **進階動畫效果**
  - 漸變速度動畫（開始快→結束慢，增加懸念感）
  - 光暈背景脈動效果
  - 星星裝飾閃爍動畫
  - 進度條顯示抽籤進度
  - 懸念抖動效果（結果揭曉前）
  - 名字漸層色彩效果
  - 3D 翻轉結果揭曉動畫

#### 🧩 隨機分組 UI/UX 大升級
- **洗牌動畫效果**
  - 分組時顯示學生名字快速閃爍動畫
  - 進度條顯示分組進度
  
- **分組預覽功能**
  - 即時顯示預計分組數量和每組人數
  - 自動計算並顯示成員分配情況
  
- **組別配色系統**
  - 10 種不同顏色區分各組
  - 每組搭配對應顏色的表情符號
  
- **動畫出現效果**
  - 分組結果卡片依序滑入出現
  - 分組完成播放音效和彩花

### 📁 新增檔案
- `js/lottery-enhancement.js` - 抽籤增強模組
- `js/grouping-enhancement.js` - 分組增強模組
- `LOCAL_SERVER_TESTING.md` - 本地伺服器測試文件

### 🔧 技術改進
- 新增 `drawnStudentIds` 全域變數追蹤已抽取學生
- 新增 `noRepeatLottery` 設定儲存機制
- 優化抽籤邏輯，支援自動跳過已抽學生

---

## [v2.1.0] - 2024-12-31

### ✨ 新增功能

#### 🏆 排行榜 UI 大升級
- 全新漸層背景設計（金/銀/銅獎牌區分）
- 分數進度條視覺化
- 依序滑入動畫效果
- 完整 RWD 支援（手機/平板/電腦）
- Hover 互動效果

#### 🎊 進階彩花特效
- 80+ 繽紛彩花粒子
- 多種形狀（圓形、方形、緞帶）
- 特效表情符號（🌟⭐✨💫🎉🎊）
- 螺旋下落 + 飄動動畫

#### ⏰ 時鐘功能優化
- 時鐘按鈕置中顯示
- 藍紫漸層按鈕設計
- 黃色閃爍動畫提示
- 時鐘 RWD 適配優化

### 🔧 修復
- 修復 leaderboard-enhancement.js 404 錯誤
- 修復排行榜學生資料讀取問題

### 📁 新增檔案
- `js/leaderboard-enhancement.js` - 排行榜增強模組

---

## [v2.0.0] - 2024-12-30

### ✨ 新增功能

#### 🔥 Firebase 雲端整合
- 匿名登入支援
- 資料上傳至 Firebase Firestore
- 從雲端下載資料
- 匯出所有資料為 JSON 備份

#### 📋 作業檢查增強
- 科目分類（國語/數學/英語/自然/社會/其他）
- 作業類型標籤（每日作業/專題報告/評量考試）
- 批量操作：一鍵全部完成、重置全部
- 逾期作業警示

#### 📝 聯絡簿增強
- 優先級標記（高/中/低）
- 優先級顏色顯示
- 快速篩選功能

### 📁 新增檔案
- `js/firebase-config.js` - Firebase 初始化
- `js/firebase-sync.js` - 資料同步模組
- `js/firebase-ui.js` - 雲端同步 UI
- `js/homework-enhancement.js` - 作業增強
- `js/notebook-enhancement.js` - 聯絡簿增強

---

## [v1.0.0] - 初始版本

### 核心功能
- 學生管理（新增、編輯、刪除）
- 加扣分系統
- 隨機分組
- 抽籤系統
- 計時器
- 聯絡簿
- 作業檢查
- Excel 匯入學生名單
- 資料備份與還原
- 排行榜
- 全螢幕時鐘
