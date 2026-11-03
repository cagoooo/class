# 班級小管家 📚

🌐 **線上使用：[班級小管家](https://cagoooo.github.io/class/)**

> 📌 **目前版本：v3.63.2**（依據 `CHANGELOG.md`；升版時 `npm run update-sw` 會自動更新這一行）

給導師與科任老師用的班級經營工具箱，打開網頁就能用，不必安裝。主軸是上課時用得到的事：加扣分、抽籤、分組、計時、聯絡簿與作業檢查；2026 年 9 月起加上 **班級寵物** 與 **金幣商店**。沒有點名或出缺勤功能。

## 功能特色

### 上課常用
- ⭐ **加扣分** — 點學生再按項目可一次給多人，也可先選項目再連續點學生；8 秒內可撤銷，分數、成長值、金幣一起退回。項目可自訂。
- 🎲 **抽籤** — 名字卡片拉霸式抽籤、全螢幕投影抽籤，可設不重複抽取；抽中可直接 +1 分，請假可一鍵改抽。
- 👨‍👩‍👧‍👦 **隨機分組** — 依組數或每組人數分組，預覽照實際分配顯示；可設組長、加減小組分數、投影顯示、匯出 Excel。抽籤與分組共用「今天請假」名單。
- ⏰ **計時器** — 倒數／正數、番茄鐘、全螢幕時鐘，以及可設週一至週五重複的 **定時鬧鈴**。
- 📝 **聯絡簿** — 以日期為中心，一次貼多行就變多則；「複製今天」可貼到 LINE／Classroom，並有大字投影模式。
- 📋 **作業檢查** — 繳交狀態追蹤，作業列表可拖曳排序、點兩下原地改名。
- 🤫 **安靜挑戰** — 用電腦麥克風看全班音量，先自動校正教室平常的聲音，5 隻小幫手跟著換表情；聲音只在這台電腦即時分析，不錄音、不上傳。
- 🏆 **排行榜**、📝 **考試監考**、🎨 **班級經營白板**、🦷 **潔牙勾選表**、✍️ **成績單評語產生器**、💬 **生動對話小學堂**、🧧 **十二生肖拉霸機**（開學破冰）

### 🐾 班級寵物與金幣商店
- **寵物成長** — 每班自行啟用；加分時寵物成長值同步增加，扣分只扣分數、寵物不退化。
- **盲盒孵化** — 10 成長值從 30 種原創寵物隨機孵化（Blender 建模預渲染，共 450 張），之後長成成長期（Lv.3）與成熟期（Lv.5）。
- **全班圖鑑、共同任務、收藏蛋** — 任何同學孵出新種類，全班圖鑑就亮一格；全班任務達標可領班級收藏蛋。
- **獎勵規則只填分數** — 加分時成長值與金幣自動增加同樣數量（v3.61.0）。
- **金幣兌換商店** — 兌換獎勵／獎勵設定／兌換紀錄三個分頁；兌換只扣金幣。
- **學生寵物頁**（`pets.html`）— 老師用 Google 登入後可建立分享連結與 QR Code，學生免登入查看；姓名預設遮罩，不顯示分數與加扣分原因。

### ☁️ 資料與跨裝置
- **多班級** — 一位老師可建多個班級，資料各自分開；切換班級前會先確認雲端最新版本。
- **只在 Google 登入時上雲端** — 資料平常存在這台電腦（IndexedDB／localStorage），用 Google 帳號登入後才同步到 Firebase Firestore。
- **存到雲端／取回這台電腦** — 右上角頭像選單用白話按鈕分成兩組，第一次登入有教學引導（`js/cloud-guide.js`）；取回前會先另存一份這台原本的資料。
- **兩台電腦自動合併** — 比對上次共同版本，合併兩邊新增的紀錄；判斷不了才請老師比較後選擇（`js/cloud-merge.js`）。
- **備份與還原** — Excel 完整備份（可登記成績、也能匯入還原）、學期封存、每日 Firestore 自動備份，舊同步快照保留 7 天後清理。
- **不打斷上課的更新** — 重要修正在沒有計時、全螢幕或對話框時才自動套用（`critical-update.json`）。
- **隱私** — 錯誤通報只帶座號，不帶學生姓名。

## 快速開始

1. 開啟 [線上版](https://cagoooo.github.io/class/)（`index.html` 會轉到主頁 `classnew.html`）
2. 在「學生管理」下載 Excel 範本匯入名單，或手動新增學生
3. 想跨電腦使用，點右上角用 Google 登入，照教學引導操作
4. 想用寵物，到「班級寵物」為這個班啟用，之後照平常加分

## 技術棧

- 純 HTML／CSS／JavaScript（沒有前端框架）：主頁 `classnew.html`，搭配 `js/` 約 60 個模組與 `css/` 10 個樣式檔
- Tailwind CSS（CDN）、SheetJS（Excel 匯入匯出）
- Firebase Authentication（Google 登入）＋ Firestore
- Cloud Functions（`functions/`）：使用情形通知與每日戰報、每日 Firestore 備份、同步快照清理、維運後台
- PWA：`sw.js` Service Worker 離線快取
- 部署：GitHub Pages（`.github/workflows/deploy.yml`，推送 `main` 後先跑測試，再注入金鑰並發布）

## 🛠️ 開發與安全性規範

為了確保 Firebase API Key 不會意外外洩至 GitHub，本專案採用「編譯時佔位」機制：原始碼只放 `__FIREBASE_API_KEY__` 這類佔位符，部署時由 `.github/inject.py` 從 GitHub Secrets 注入。

### 本地開發指令
- **套用金鑰**：`npm run dev:apply`（讀取 `.env` 並注入金鑰）
- **還原佔位符**：`npm run dev:restore`（將金鑰替換回佔位符，**Push 前必跑**）
- **升版**：改 `manifest.json` 與 `package.json` 的 `version` 後執行 `npm run update-sw`，會同步 `sw.js` 快取名稱、各檔 `?v=`、版本徽章與本 README 的版本號

> [!CAUTION]
> 在執行 `git push` 之前，請務必確認已執行 `npm run dev:restore`！

### 測試

`scripts/test-*.cjs` 是部署前必過的檢查（資料安全、雲端合併、寵物、分享頁、同步、學期封存等），用 Node 直接執行，例如：

```bash
node scripts/test-data-safety.cjs
node scripts/test-cloud-merge.cjs
node scripts/test-class-pets.cjs
```

完整清單見 `.github/workflows/deploy.yml` 的「Check classroom data safety」步驟。資料格式與同步設計說明見 `DATA-SAFETY.md`。

## 授權

MIT License

---

<!-- BEGIN:PROJECT_GUIDE -->
## 專案導覽

班級小管家

- 專案定位：實用工具／自動化原型
- Repository：`cagoooo/class`
- 可見性：公開
- 主要技術：JavaScript、Firebase
- 線上入口：<https://cagoooo.github.io/class/>

### 可以怎麼應用

- 解決特定工作流程中的重複操作或資訊整理需求
- 作為相近工具的功能原型與程式碼參考
- 串接新的資料來源、服務或介面後延伸到其他情境

這些是依目前專案定位整理的延伸方向，不代表所有情境都已內建完成；實作前請先確認現有功能與資料格式。

### 技術與專案結構

- `README.md`
- `apple-touch-icon.png`
- `firebase.json`
- `functions`
- `index.html`
- `package.json`
- `scripts`

檔案結構會隨版本演進；若本節與程式碼不一致，以目前預設分支的原始碼為準。

### 本機執行

```bash
npm install
```
請以 `package.json` 的 `scripts` 為準；若專案需要雲端服務，請先建立自己的環境變數與測試專案。

### 給 AI Agent 的接手指南

1. 先閱讀本 README、`AGENTS.md`（若有）、套件腳本與部署設定。
2. 先從入口檔、設定檔與資料流確認真實行為，不要只依 repo 名稱推測。
3. 修改前檢查環境變數、外部服務、檔案格式與失敗處理。
4. 完成後執行既有檢查，並以最小可重現案例驗證主要流程。
5. 不要捏造尚未存在的功能；README 與實作有落差時，應同時更新文件。
6. 提交前只納入本次任務檔案，並記錄實際執行過的驗證。

### 安全與資料注意事項

- 不要提交 `.env`、服務帳號、API 金鑰、token、學生個資或正式環境匯出資料。
- 使用 Firebase、Supabase、Google API 或其他雲端服務時，請建立自己的測試專案並套用最小權限。
- 若要公開衍生作品，請先確認程式碼、圖片、音訊、字型與教材內容的授權。

### 貢獻與客製化

歡迎依教學現場、活動或工作流程需求進行 fork／客製化。建議在變更說明中交代使用情境、主要修改、測試方式，以及是否影響資料格式或部署設定。
<!-- END:PROJECT_GUIDE -->

<!-- akai-edu-tools:backlink -->

---

## 🔗 阿凱老師教育工具集

這個專案是[阿凱老師教育工具集](https://cagoooo.github.io/Akai/)的 **#10 班級小管家**，由桃園市龍潭區石門國民小學阿凱老師開發。

- 工具介紹頁：[https://cagoooo.github.io/Akai/tool/10/](https://cagoooo.github.io/Akai/tool/10/)
- 線上使用：[https://cagoooo.github.io/class/](https://cagoooo.github.io/class/)
- 教學情境文章：[https://cagoooo.github.io/Akai/blog/class-helper-10-daily-routine/](https://cagoooo.github.io/Akai/blog/class-helper-10-daily-routine/)
- 全部工具（上百個教育工具與原始碼）：[https://cagoooo.github.io/Akai/](https://cagoooo.github.io/Akai/)

想改造成自己的版本？到上面的教學情境文章，按左下角「複製 AI 開發提示詞」，貼給 ChatGPT、Claude、Gemini 等 AI 助手，就能參考這份原始碼開始規劃。
