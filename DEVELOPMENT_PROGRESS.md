# 班級小管家 - 開發進度記錄

## 📅 最後更新：2026-03-03 14:50

## 🎯 當前版本：v2.9.6

## ✅ 最新工作階段 (2026-03-03) 大時鐘全螢幕自適應完整修復

### ⏰ v2.9.6 大時鐘自適應 v2（精確量測法）
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
| `最新` | ✅ 聯絡簿展示模式 + 作業同步優化 |
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
