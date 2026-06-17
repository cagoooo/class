# 班級小管家 - 開發進度記錄

## 📅 最後更新：2026-06-17

## 🎯 當前版本：v3.12.2

> 詳細逐版紀錄見 [CHANGELOG.md](CHANGELOG.md)；最近一次為「全站深色模式對比度稽核與優化 (v3.12.2)」，解決了 11 項深色背景下的「淺底淺字」與「深底深字」問題。未來方向見 [FUTURE_DEVELOPMENT_SUGGESTIONS.md](FUTURE_DEVELOPMENT_SUGGESTIONS.md)。

---

## ✅ 最新工作階段 (2026-06-17) v3.12.2 全站深色模式對比優化 (P0)

本次稽核並全面修補了 11 項在深色模式下的「淺底淺字」與「深底深字」對比度缺陷，提升了全站主題的一致性與可讀性。

#### ✨ 優化與修復內容 11 項
- [x] **全域灰階背景適配**：`slate`, `zinc`, `stone`, `neutral` 淺色背景（`-50/-100/-200`）在 `.dark` 模式下自動轉為深色變數。
- [x] **全域文字顏色適配**：`slate`, `zinc`, `stone`, `neutral` 以及常用彩色字（`blue`, `green`, `indigo`, `purple`, `pink`, `yellow`, `orange`, `teal` 等）在深色背景下強制覆寫為對比度充足的亮色。
- [x] **頂部導覽列品牌與徽章**：修改 `classnew.html` 解決深藍背景配深藍品牌字體之可讀性問題。
- [x] **Excel 匯入引導**：解決說明粗體字與檔案上傳按鈕在深色模式下的「淺底淺字」。
- [x] **隨機抽籤剩餘人數**：剩餘人數數字 `text-purple-600` 適配 `dark:text-purple-300`。
- [x] **作業/聯絡簿提示框**：適配 `dark:bg-blue-950/20` 與 `dark:text-blue-300`。
- [x] **ConfirmDialog 樣式適配**：調整 colors 對照表的標題與按鈕為 `dark:` 變體。
- [x] **備份同步確認彈窗**：`google-auth-ui.js` 動態判斷是否處於深色模式，切換 inline style 的背景與字體顏色，徹底解決深灰底配深灰字。
- [x] **首次登入與歡迎彈窗**：在 CSS 注入中追加 `.dark` 適配樣式，將寫死的深色標題與描述變亮。
- [x] **排行榜對比度**：追加全套深色覆寫樣式，使排行榜背景在深色下變為深色漸層，前三名背景和進度條完美適配。
- [x] **搜尋 mark 標記**：在深色模式下轉換為高對比的暗黃底、亮黃字。

---

## ✅ 工作階段 (2026-06-17) v3.12.1 🩺 版本健康面板 + 登入帳號顯示 + 雲端定期備份

### 🎯 一次打包 7 項 P0/P1 UX 改良

這是從 FUTURE_DEVELOPMENT_SUGGESTIONS.md 第十章挑出的「快速勝利套餐」完整實作版。配合 v3.0.9–v3.0.13 的累積改動，整體 UX 大幅提升。

#### ✨ 新功能 5 項
- [x] **A1** `data-primary-action` 擴展 - 為分組/抽籤/計時器/聯絡簿/作業/公告 6 個區塊加上主要行動標記（加上 v3.0.11 的考試共 7 個）。
- [x] **B2** 班級視覺差異化 - 8 組顏色+emoji 調色盤，新增班級自動分配，切換按鈕依當前班顏色渲染，預防切錯班。
- [x] **D2** 空狀態 EmptyState 元件 - 新檔 `js/empty-state.js`，4 個區塊已整合（學生/聯絡簿/作業/公告）。
- [x] **C3** 同步狀態指示器 - 新檔 `js/sync-status-indicator.js`，右下角浮動雲端圖示，5 種狀態即時顯示。
- [x] **B1** Ctrl+K 快速切換器 - 新檔 `js/class-quick-switcher.js`，command palette 風格，支援鍵盤導航。

#### 🔧 技術債修補 2 項
- [x] **E1** 修掉 `classnew.html` 多餘的 `</div>`（v3.0.9 Session 發現）
- [x] **E2** GitHub Actions 加入 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`，主動 opt-in Node.js 24

#### 其他
- [x] **Cache-buster** - 為 7 個 JS 檔案加上 `?v=3.1.0`，確保使用者升級後立即拿到新版
- [x] **sw.js PRECACHE** 加入 3 個新檔案，確保 PWA 離線可用
- [x] **版本號同步更新** - `package.json`, `manifest.json`, `sw.js` 均升級至 `v3.1.0`

### 💡 使用者端 Before / After

| 情境 | Before | After |
|---|---|---|
| 分享 `#timer` 連結 | 捲到計時器區塊，還要再滑到「開始」按鈕 | 直接看到「開始」按鈕 ⭐ |
| 切換班級 | 右上角按鈕顏色統一紫色，容易切錯 | 每班獨特顏色+emoji，一眼辨識 ⭐ |
| 找切班選單 | 點右上角下拉選單 | 直接 Ctrl+K 彈出 ⭐ |
| 看同步狀態 | 打開 Google 帳號下拉看時間 | 右下角雲端圖示即時顯示 ⭐ |
| 新老師看空畫面 | 灰色「目前沒有學生」一行字 | 友善引導卡片+行動按鈕 ⭐ |

---

---

## 🗓 2026-04-16 Session 總覽（v3.0.9 → v3.0.13）

本日五個版本累進完成「分享連結體驗 → 首次使用者引導 → 多班級資料完整性」三大主題的全面強化。

| 版本 | 主題 | 影響範圍 | 關鍵檔案 |
|---|---|---|---|
| v3.0.9 | URL Hash 深連結 + 改預設考試科目 | 單檔小改進 | `classnew.html`, `js/announcement.js`, `js/exam-proctor.js` |
| v3.0.10 | Deep-link 進入自動捲動至區塊 | 單檔小改進 | `classnew.html` |
| v3.0.11 | Deep-link 優先顯示主要 CTA 按鈕 | 新增通用機制 `data-primary-action` | `classnew.html` |
| v3.0.12 | 首次使用者 Google 登入提醒 Banner | 新功能 | `js/google-auth-ui.js` |
| v3.0.13 | **多班級資料完整隔離 + 同步覆蓋補完** ⭐ | 架構性改進 | `js/class-aware-storage.js` **【新檔】**, `js/firebase-sync.js` |

### 🎯 本日解決的三大使用者痛點

1. **「連結分享後同事要自己找區塊」** → v3.0.9/10 URL hash 深連結 + 自動捲動
2. **「首次使用者不知道可以登入雲端備份」** → v3.0.12 引導 Banner（智能不打擾）
3. **「科任老師教多班會互相覆蓋資料」** → v3.0.13 透明 localStorage 攔截器 + 補完 7 個缺漏的同步 key

### 📐 本日設計決策要點

- **向下相容優先**：預設班級沿用原 key（`notebookEntries` 仍是預設班級的 key），新架構只對非預設班級加 suffix。老用戶零風險升級。
- **零模組修改**：v3.0.13 用攔截器模式，11 個共用 key 在底層自動路由，所有現有模組（`announcement.js`、`exam-proctor.js` 等）完全不用改。降低回歸風險。
- **一次性遷移 flag**：`classAwareStorageMigrated_v1` 確保升級遷移只跑一次，避免切換班級時誤把舊班級資料複製到新班級。
- **通用機制 > 特例**：v3.0.11 用 `data-primary-action` 屬性而非硬編碼選擇器，未來其他區塊可以立即套用。

---

## ✅ 最新工作階段 (2026-04-16) 多班級資料隔離與同步完整性大修

### v3.0.13 跨班級同步全面修補
- [x] **補上 3 個高/中風險缺漏功能性資料** - `examAbsenceRecords`、`seatingConfig`、`drawnStudentIds`。
- [x] **補上 4 個 UI 偏好同步** - `examLightMode`、`examAnalogClock`、`examSoundsEnabled`、`homeworkDashboardView`。
- [x] **新增 `js/class-aware-storage.js` 攔截器** - 透明地把 11 個共用 key 依班級隔離，零模組改動。
- [x] **預設班級向下相容** - 沿用原 key，老用戶資料完全不受影響。
- [x] **一次性升級遷移** - 升級到 v3.0.13 時自動把現有資料遷移到 per-class 結構。
- [x] **`firebase-sync.js` 全面更新** - 單班 + 全班同步路徑都加入新 key。
- [x] **sw.js 加入 class-aware-storage.js** - 確保 PWA 離線可用。
- [x] **版本號同步更新** - `package.json`, `manifest.json`, `sw.js` 均升級至 `v3.0.13`。

---

## ✅ 工作階段 (2026-04-16) Google 帳號登入提醒通知

### v3.0.12 首次使用者引導
- [x] **登入提醒 Banner** - 未登入的老師進入 3 秒後顯示底部浮動卡片，引導登入 Google 帳號雲端備份。
- [x] **三種不再顯示條件** - 已登入 / 曾登入 / 點擊「不再提醒」，均以 localStorage 持久記錄。
- [x] **整合 onAuthStateChanged** - 已登入者直接設定 flag 永久關閉；未登入者延遲 3 秒顯示。
- [x] **公開 API `GoogleAuthUI.dismissReminder()`** - 供 HTML onclick 調用。
- [x] **RWD + 無障礙支援** - 手機版自動堆疊、`aria-label` 標記。
- [x] **版本號同步更新** - `package.json`, `manifest.json`, `sw.js` 均升級至 `v3.0.12`。

---

## ✅ 工作階段 (2026-04-16) Deep-link 主要行動按鈕優先

### v3.0.11 Deep-link 顯示主要 CTA
- [x] **考試監考 deep-link 直接看到「啟動全螢幕監考模式」按鈕** - 使用 `scrollIntoView({block: 'end'})` 讓按鈕出現在視窗底部。
- [x] **`data-primary-action` 機制** - 通用的 HTML 標記，允許任何區塊指定自己的主要 CTA 按鈕。
- [x] **時序修正** - deep-link 捲動延遲調整為 500ms，避免被 `navigation-enhancement.js` 的捲動覆蓋。
- [x] **版本號同步更新** - `package.json`, `manifest.json`, `sw.js` 均升級至 `v3.0.11`。

---

## ✅ 工作階段 (2026-04-16) Deep-link 自動捲動

### v3.0.10 Deep-link UX 優化
- [x] **分享連結進入自動捲動至區塊** - 使用 URL hash 深連結（例：`classnew.html#exam`）進入頁面時，自動捲動到對應區塊（使用 `behavior: 'auto'` instant scroll）。
- [x] **未帶 hash 載入維持原行為** - 正常進入頁面 scrollY=0，頂部 nav 完整可見。
- [x] **點擊 tab 切換維持既有 smooth scroll** - 由 `navigation-enhancement.js` 處理，不受影響。
- [x] **版本號同步更新** - `package.json`, `manifest.json`, `sw.js` 均升級至 `v3.0.10`。

---

## ✅ 工作階段 (2026-04-16) URL Hash 深連結 & 預設科目調整

### v3.0.9 UX 小改進
- [x] **URL Hash 深連結** - 支援用網址直接跳轉到指定區塊（例：`classnew.html#exam` 直接開啟考試監考）。
- [x] **`showSection()` 同步 URL hash** - 使用 `history.replaceState` 不污染瀏覽歷史。
- [x] **`hashchange` 監聽** - 允許手動改網址或分享連結切換區塊。
- [x] **公告模組 wrapper 同步 hash** - `js/announcement.js` 的特殊路徑也同步更新 hash。
- [x] **考試監考預設科目** - 由「國語 / 數學 / 社會」改為「國語 / 自然 / 英文」（僅影響新使用者首次載入的預設值）。
- [x] **版本號同步更新** - `package.json`, `manifest.json`, `sw.js` 均升級至 `v3.0.9`。

---

## ✅ 工作階段 (2026-03-24) GitHub Actions 佈署與金鑰注入修復

### v3.0.8 部署與安全修復
- [x] **部署來源轉換** - 將 GitHub Pages 的部署來源從分支 (Branch) 切換為 **GitHub Actions**，確保金鑰注入腳本能正確執行。
- [x] **佔位符標準化** - 統一 `firebase-config.js` 中的 `appId` 為 `__FIREBASE_APP_ID__` 佔位符。
- [x] **診斷功能強化** - 更新 `inject.py` 以便在部署日誌中查看環境變數的注入狀態。
- [x] **版本號同步更新** - `package.json`, `manifest.json`, `sw.js` 均升級至 `v3.0.8`。

---

## ✅ 工作階段 (2026-03-24) 金鑰管理優化與腳本強化

### v3.0.7 安全開發流程優化
- [x] **修正 Windows 編碼衝突** - 移除 `inject.py` 中的 Emoji 並加入 `sys.stdout` UTF-8 配置。
- [x] **建立自動化開發腳本** - 新增 `dev:apply` 與 `dev:restore` 提升開發效率並防止金鑰誤傳。
- [x] **版本號同步更新** - `package.json`, `manifest.json`, `sw.js` 均升級至 `v3.0.7`。

---
+
+## ✅ 工作階段 (2026-03-18) 作業概覽表格視圖 & 安全佈署強化

### v3.0.6 作業概覽表格視圖
- [x] **新增表格視圖 (Table View)** - 提供直觀的作業繳交狀況網格，支援橫向/縱向固定標題。
- [x] **快速狀態切換** - 點擊表格單元格可循環切換「未檢查/已完成/未完成/待訂正/遲交」狀態。
- [x] **自動同步機制** - 表格內的所有更動會即時同步至 `localStorage`、儀表板統計數據及主畫面。
- [x] **視圖首選項持久化** - 系統會記住使用者最後選擇的是「卡片」或「表格」模式。
- [x] **版本號碼同步更新** - `package.json`, `manifest.json`, `sw.js` 均升級至 `v3.0.6`。

### 🛡️ 安全佈署自動化 (GHA)
- [x] **API 金鑰保護** - 實作「編譯時佔位」機制，原始碼中使用 `__PLACEHOLDER__` 並由 `inject.py` 進行動態注入。
- [x] **GitHub Actions 直接佈署** - 採用 `deploy-pages` 策略，避免在 `gh-pages` 分支殘留敏感資訊。
- [x] **本地環境隔離** - 新增 `.env` 檔案與 `.gitignore` 設定，確保開發環境不洩漏金鑰。

---

---

### v3.0.3 IndexedDB 儲存模組
- [x] **`js/class-db.js`** - ClassDB 模組（9個 Array 資料表 + settings KV表）
- [x] **自動遷移邏輯** - 首次載入自動從 localStorage 遷移兩也不重複
- [x] **localStorage 同步備份** - 安全雙重寫入機制
- [x] **firebase-sync.js 整合** - loadFromCloud 改用 ClassDB.save
- [x] **sw.js + manifest.json** - 版本升至 v2.9.9

---

- [x] **考試監考統計一致化** - 本地/雲端統一改用陣列長度，消除假差異警報
- [x] **`renderGroups()` 补上** - `loadFromCloud()` 補上分組重繪呼叫
- [x] **深淺色按鈕佘局** - 移入導覽列 slot，不再覆蓋頭像
- [x] **sw.js + manifest.json** - 版本升至 v2.9.8
- [x] **CHANGELOG.md** - 補齊 v2.9.8 完整記錄

---

- [x] **檢查同步陳令** - 發現公告下載缺漏、考試監考設定/時鐘設定未同步
- [x] **`firebase-sync.js` 全面改寫 v2** - 同步資料頔1【0種類別，新增 `examData`/`appSettings` Firestore 集合
- [x] **公告下載修復** - `syncFromCloud()` 補上 `classAnnouncements` 下載
- [x] **精美同步差異預覽 Modal** - 廢除原生 `confirm()`，改用漸層卡片式 Modal
- [x] **10 類資料對比表格** - 櫮示本地 vs. 雲端數量，差異以彩色標示
- [x] **`google-auth-ui.js`** - `syncUp/syncDown` 改呼叫 `showSyncConfirmModal`

---

- [x] **問題辨析** - CSS `vw` 無法反映実際渲染寬度，估算公式不準確
- [x] **文字時鐘（數位/LED/可愛）** - 先設 200px 基準 → 量 `scrollWidth/Height` → 按比例縮放，保證不溢出
- [x] **翻轉時鐘** - 新增 `style === 'flip'` 分支，直接設定 `.flipper` 和 `.flipper-colon` 字體大小
- [x] **resize 自動重算** - 視窗縮放時重新計算，橫向/直向均正確
- [x] **`sw.js` + `manifest.json`** - 版本號升至 v2.9.6
- [x] **`CHANGELOG.md`** - 補齊 v2.9.6 完整記錄

---

- [x] **問題根源修正** - `auth-nav-slot` 使用 `hidden lg:flex`，行動裝置完全看不到登入按鈕
- [x] **手機版同行佈局** - Logo 與登入按鈕同一列（Flexbox justify-between），時鐘換行置中
- [x] **`auth-nav-slot-mobile`** - 新增手機版專屬 slot，`flex lg:hidden` 在桌面隱藏
- [x] **MOBILE_SLOT_HTML 模板** - 緊湊型登入按鈕（G圖示 + 「登入」文字）
- [x] **手機登出下拉選單** - 頭像點選展開（同步雲端、從雲端還原、登出）
- [x] **雙版本狀態同步** - `showLoggedIn/Out()` 同時更新桌面和手機 DOM
- [x] **`sw.js` + `manifest.json`** - 版本號升至 v2.9.5
- [x] **`CHANGELOG.md`** - 補齊 v2.9.1～v2.9.5 完整記錄

---

### 🔧 v2.9.1 登出後按鈕UI未重置修正 (`js/google-auth-ui.js`)
- [x] **`LOGIN_BTN_HTML` 共用常數** - 統一登入按鈕 innerHTML，避免重複字串
- [x] **`showLoggedOut()` 完整還原** - 登出時同時重置 innerHTML、disabled、關閉下拉
- [x] **`login()` 安全還原** - await 後不論成功或取消均立即還原按鈕狀態

### ⏰ v2.9.2 大時鐘全螢幕模式優化 (`classnew.html`)
- [x] **字體改用 `min(vw, vh)`** - 同時考慮寬高，寬螢幕不溢出、直向螢幕正確縮放
- [x] **底部提示橫槓 UI** - 控制列隱藏時底部顯示細橫槓，hover 消失
- [x] **`line-height: 0.95` + `letter-spacing`** - 時鐘更緊湊、更易讀

### 🚀 v2.9.3 localhost 自動清除 SW 快取 (`classnew.html`)
- [x] **`<head>` 頂部內嵌偵測 script** - 偵測 localhost/127.0.0.1 自動執行
- [x] **`unregister()` 所有 Service Worker** - 避免舊快取攔截造成 404
- [x] **`caches.delete()` 所有 Cache Storage** - 正式環境不受影響

### 🔍 v2.9.4 大時鐘字體再次放大 (`classnew.html`)
- [x] **數位樣式** `clamp(5rem, min(26vw, 52vh), 40rem)` - 由 30vh 提升到 52vh
- [x] **LED 樣式** `clamp(4rem, min(24vw, 46vh), 36rem)` - 由 28vh 提升到 46vh
- [x] **可愛樣式** `clamp(7rem, min(26vw, 52vh), 40rem)` - 由 34vh 提升到 52vh
- [x] **佔螢幕高度提升** - 在 1920×911 由 34% 提升至 **52%**，充分利用留白

---

## ✅ 工作階段 (2026-03-02) Google 帳號登入 + 資料雲端同步

### 🔑 Google Auth UI 模組 (`js/google-auth-ui.js`)
- [x] **Google 登入按鈕** - 導覽欄右上角 Popup 方式登入
- [x] **已登入頭像 + 下拉選單** - 顯示 Google 大頭貼、名字縮寫、蹔點展開
- [x] **下拉選單功能** - ☁️ 立即同步 / 📥 從雲端還原 / 🕒 上次同步時間 / 🚩 登出
- [x] **首次登入引導 Modal** - 偵測本地/雲端資料情況，三選一（䣆雲端/使用本地/合併）
- [x] **檢明登入恢復** - `onAuthStateChanged` 頁面重及後自動恢復 Google 登入狀態
- [x] **設定確認對話框** - 登出/还原動作均有自訂確認 Modal，非 alert()

### ☁️ Firebase 資料同步擴充 (`js/firebase-config.js` + `js/firebase-sync.js`)
- [x] **`signInWithGoogle()`** - GoogleAuthProvider Popup 登入
- [x] **`signOutGoogle()`** - 登出並清除本地快取
- [x] **`getCurrentProfile()`** - 取得登入者完整資料（uid / displayName / email / photoURL）
- [x] **`mergeWithCloud()`** - 學生名單取 union、評分記錄追加去重
- [x] **公告同步** - `classAnnouncements` 集合已包含在部署範圍

### 🛡️ API Key 安全機制
- [x] **HTTP Referrer 限制** - Key 只接受 localhost / cagoooo.github.io / class-4719f.web.app 請求
- [x] **Firebase Google 登入提供者** - 已在 Firebase Console 啟用

---

## ✅ 工作階段 (2026-03-02) 班級公告系統

### 📢 班級公告模組 (`js/announcement.js`)
- [x] **4 種公告類型**：📢 一般公告 / 🚨 緊急通知 / 🎉 活動通知 / 📚 作業提醒
- [x] **置頂功能** - 重要公告固定顯示在列表頂部
- [x] **到期自動隱藏** - 設定到期日，過期公告自動移至「已過期」分頁
- [x] **全螢幕公佈欄** - 深色沉浸式介面，適合教室投影機展示
- [x] **緊急通知角標** - 導覽按鈕顯示紅色計數徽章
- [x] **ESC 關閉** - 全螢幕模式鍵盤快捷鍵
- [x] **localStorage 持久化** - 所有公告跨次保存
- [x] **完全自我注入** - CSS + HTML 全由 JS 動態注入，無需修改 classnew.html
- [x] **showSection 整合** - 正確攔截路由切換，避免 Tailwind hidden class 衝突

---

## ✅ 工作階段 (2026-03-02) 音效提醒系統

### 🔔 音效提醒模組 (`js/exam-sounds.js`)
- [x] **Web Audio API** 合成音效，完全**不需要外部音效檔案**
- [x] **5 種合成音效**：開始鈴 / 5分鐘警告 / 1分鐘緊急 / 結束鈴 / 計時器到期
- [x] **考試監看模組整合** - 在 `updateFullscreenStatus()` 末尾插入音效呼叫
- [x] **計時器連動** - MutationObserver 監聽 `#timerDisplay`，歸零觸發提示音
- [x] **靜音切換按鈕** - 全螢幕監考模式自動注入 🔔 / 🔇 按鈕
- [x] **Toast 通知** - 音效觸發時畫面右上角簡短多予記
- [x] **`localStorage` 持久化** - 靜音狀態跨次密储存

---

## ✅ 工作階段 (2026-06-17) 離線優先操作佇列 (Offline Action Queue)

### ⚡ 離線變更追蹤與自動同步 (`js/sync-status-indicator.js` & `js/firebase-sync.js` & `js/offline-detector.js`)
- [x] **`js/offline-detector.js`** - 離線偵測模組，在網路斷開和恢復連線時，透過 `window.SyncStatusIndicator` 進行狀態聯動。
- [x] **`js/sync-status-indicator.js`** - 修改 `Storage.prototype.setItem` 攔截器，當在已登入但離線狀態（`disconnected`）寫入資料時，將被修改的 key 進行 base-key 轉換（過濾班級字尾）並加入 `pendingSyncKeys` 中。
- [x] **指示器 Hover / Click 提示** - 離線模式下 Hover 懸浮指示器會動態呈現中文待同步變更清單；離線點擊時會顯示 Toast 提示在恢復連線後會自動同步。
- [x] **`js/firebase-sync.js`** - 在雲端同步成功後的 `try` 區塊中，自動移除本地的 `pendingSyncKeys`，並調用 `window.SyncStatusIndicator.updateStateBasedOnSync()` 使指示器重設為 `synced` 綠燈狀態。
- [x] **自動化模擬測試** - 撰寫 Node.js 測試腳本 mock 瀏覽器環境，成功通過線上修改不記錄、離線修改記錄、同步後清空的三大核心情境測試。

---

## ✅ 工作階段 (2026-03-02) 骨架屏載入狀態統一化

### 🖥️ 骨架屏（Skeleton Screen）模組 (`css/skeleton.css` & `js/skeleton.js`)
- [x] **`css/skeleton.css`** - 波紋揃描展神動畫（210° 流光扫描）、深色模式、RWD
- [x] **`js/skeleton.js`** - `SkeletonManager` 管理器，提供 `show(id, type, count)` / `hide(id)` / `wrap()` API
- [x] **三種骨架模板**：`student`（場次圈+文字）、`leaderboard`（獎牌+排名條）、`homework`（卡片+進度條）
- [x] **學生列表整合** - 渲染前先展示 6 個骨架卢，250ms 後切換真實資料
- [x] **排行榜整合** - Modal 立即可見，200ms 後渲染真實排名
- [x] **作業儀表板整合** - 卡片網格骨架屏，工作數量動態適配，200ms 後渲染
- [x] **全螢幕作業檢查整啂** - 學生格位骨架屏，150ms 後渲染

---

## ✅ 工作階段 (2026-02-26) 作業系統 + 聯絡簿展示模式

### 📺 聯絡簿展示模式 (`js/notebook-enhancement.js` & `classnew.html`)
- [x] **全螢幕展示介面**：大字體、高對比設計，包含即時時鐘與主題切換。
- [x] **渲染崩潰修復**：修復 `renderNotebook` 遺漏預設類型處理導致的 `TypeError`。
- [x] **按鈕穩定性優化**：直接嵌入 HTML 以確保功能按鈕 100% 顯示。
- [x] **跨模組資料同步**：展示模式即時同步聯絡簿最新內容。

### 🔄 作業檢查實時同步 (`js/homework-enhancement.js` & `classnew.html`)
- [x] **全域作用域修正**：將核心變數從 `let` 改為 `var`，解決跨腳本數據隔離問題。
- [x] **全螢幕即時同步**：全螢幕狀態更動即時反映至主畫面列表與統計區。
- [x] **全螢幕彈窗修正**：補回 `.active` 類名，確保視窗能正確顯示。
- [x] **導航邏輯補強**：補回 `closeHomeworkFullscreen` 確保導航回儀表板。
- [x] **學生資料誤判修正**：優化學生資料存在性檢查，避免錯誤警告。

---

## ✅ 已完成功能（各版本累積）

### 🌐 PWA 支援（v2.6.0 後）
- [x] **manifest.json** - PWA 設定檔
- [x] **favicon.ico** - 網站圖示
- [x] **icons/icon-192.png, icon-512.png** - 應用圖示
- [x] **Service Worker** (`sw.js`) - 離線快取支援
- [x] **PWA 安裝引導** (`js/pwa-install.js`, `css/pwa-install.css`)
- [x] **Firebase App Check** - reCAPTCHA v3 保護
- [x] **開發環境 SW 排除** - localhost 自動 unregister，避免 HMR 衝突

### 🔧 P0 核心模組
- [x] **EventBus 事件總線** (`js/event-bus.js`)
- [x] **ErrorHandler 錯誤處理** (`js/error-handler.js`)
- [x] **AppState 狀態管理** (`js/app-state.js`)
- [x] **StorageManager 儲存管理** (`js/storage-manager.js`)
- [x] **RWD 響應式斷點** (`css/rwd-breakpoints.css`)

### 📝 考試監考模式（`js/exam-proctor.js`）
- [x] 全螢幕監考介面（數位/類比時鐘切換）
- [x] 科目管理（可編輯科目名稱與時間）
- [x] 科目時間衝突自動偵測 ⚠️
- [x] 出勤記錄（應到/實到）
- [x] 提醒系統（輪播 + 拖拽排序）
- [x] 休息倒數（彈跳 emoji + 分秒倒數）
- [x] 缺考學生記錄（病假/事假/公假/其他 + 匯出 .txt）
- [x] 監考模式全螢幕 RWD 優化
- [x] 狀態區雙行大字體顯示
- [x] 時間選擇器智能定位

### 📊 作業總覽儀表板（`js/homework-enhancement.js`）
- [x] 卡片式作業總覽（完成率進度條）
- [x] 頂部統計欄（總數/未繳/待訂正/完成）
- [x] 全螢幕實時同步檢查模式
- [x] 匯出 CSV 報告

### 🎓 學生管理（`js/student-enhancement.js`）
- [x] 24 個可愛頭像
- [x] 6 種分組標籤（幹部/小老師/課輔/特殊/班長/副班長）
- [x] 學生名單即時搜尋（支援姓名/座號）
- [x] 拖拽重新排序
- [x] 分數累積報告（正負號顯示）

### 🍅 計時功能
- [x] 番茄鐘（25+5+15，`js/pomodoro.js`）
- [x] 大時鐘 RWD（可愛 + 數位）
- [x] 鍵盤快捷鍵（數字1-7 切換，空白鍵暫停等）

### 🎲 抽籤 & 分組
- [x] 不重複抽取 + 進階動畫
- [x] 隨機分組洗牌動畫 + 組別配色
- [x] 隨機排座位（Fisher-Yates 演算法）

### 📚 聯絡簿（`js/notebook-enhancement.js`）
- [x] 5 種範本（今日作業/週末通知/考試提醒/活動通知/家長會）
- [x] 全螢幕編輯模式（Ctrl+Enter 快速儲存）
- [x] 展示模式（大字體投影）
- [x] 優先級標記（高/中/低）

### 📊 數據報表（`js/data-reports.js`）
- [x] 學生報告卡（個別完整分數記錄）
- [x] 匯出 CSV（成績單/分數歷史）
- [x] 每 5 分鐘自動備份（最多 5 份）

### 🔥 Firebase 雲端
- [x] 匿名登入
- [x] Firestore 資料同步（上傳/下載）
- [x] Firebase App Check（reCAPTCHA v3）
- [x] App Check 節流問題修復

### 🏆 排行榜
- [x] 金/銀/銅漸層設計
- [x] 分數進度條 + 依序動畫
- [x] 全螢幕時鐘整合

---

## 📁 主要檔案結構

| 檔案 | 說明 | 大小估計 |
|------|------|----------|
| `classnew.html` | 主頁面 | ~5000+ 行 |
| `js/exam-proctor.js` | 考試監考模組 | ~1900 行 |
| `js/homework-enhancement.js` | 作業模組 | ~1440 行 |
| `js/notebook-enhancement.js` | 聯絡簿模組 | ~600 行 |
| `js/student-enhancement.js` | 學生模組 | ~500 行 |
| `js/skeleton.js` | 骨架屏管理器 | ~130 行 |
| `css/skeleton.css` | 骨架屏樣式 | ~170 行 |
| `sw.js` | Service Worker | ~200 行 |
| `CHANGELOG.md` | 版本記錄 | v1.0-v2.8.3 |

---

## 🔧 技術細節

### localStorage 資料鍵值
| Key | 說明 |
|-----|------|
| `examSubjects` | 考試科目列表 |
| `examReminders` | 提醒語（exam/break 兩類） |
| `examAttendance` | 出勤記錄 |
| `examLightMode` | 淺色模式狀態 |
| `absentStudents` | 缺考學生記錄 |
| `classStudents` | 學生資料 |
| `notebookEntries` | 聯絡簿記錄 |
| `homeworkList` | 作業列表 |

### 最新 Git Commits
| Commit | 說明 |
|--------|------|
| `df22ae0` | ✅ 實作離線優先操作佇列以追蹤並同步離線變更 (v3.12.3) |
| `0564d1b` | ✅ 優化全站深色模式對比度與主題一致性 (v3.12.2) |
| `ef8783b` | ✨ 版本健康面板 + 登入帳號顯示 + 雲端定期備份 (v3.12.1) |
| `abce5ca` | ✨ 多班級資料完整性強化 A 系列 (v3.12.0) |
| `42916ab` | fix: 修復深色模式數位時鐘顏色 |
| `e9b7da5` | fix: 修復科目列表無法滾動到頂端和 hover 抖動 |
| `4706f0d` | fix: 修復監考模式大螢幕佈局 |
| `c727eaa` | style: 優化監考模式 RWD |
| `5208278` | feat: 新增 PWA 支援 |

---

## 🚀 下次可繼續的優化方向（優先推薦）

### 🔴 高優先（課堂實用性高）
1. [ ] **音效提醒系統**：考試開始/結束/倒數 5 分鐘音效
2. [ ] **課表管理**：週課表視覺化，整合監考時間
3. [ ] **班級公告系統**：置頂公告、到期自動隱藏
4. [ ] **成績追蹤**：各科成績記錄 + 趨勢折線圖

### 🟡 中優先（體驗提升）
5. [ ] **語音指令**：「抽一個人」「計時 5 分鐘」語音控制
6. [ ] **手勢操作**：滑動切換功能區、長按編輯
7. [x] **骨架屏** ✅ 已完成 v2.8.3 - Skeleton Screen 統一載入狀態
8. [ ] **多班級支援**：切換管理多個班級

### 🟢 低優先（技術優化）
9. [ ] **IndexedDB 遷移**：突破 localStorage 5MB 限制
10. [ ] **TypeScript 遷移**：型別安全 + IDE 補全
11. [ ] **CSS 架構整理**：拆分為 base/components/layouts/utilities
12. [ ] **AI 評語生成**：Gemini API 自動生成學生評語

---

## 📌 快速指令

```powershell
# 啟動本地伺服器
cd H:\Class
python -m http.server 8080
# 開啟 http://localhost:8080/classnew.html

# 查看 git 狀態
git status && git log -5 --oneline

# Push 到 GitHub
git add -A && git commit -m "✅說明" && git push
```

- **GitHub 倉庫**：https://github.com/cagoooo/class.git
- **GitHub Pages**：https://cagoooo.github.io/class/classnew.html
