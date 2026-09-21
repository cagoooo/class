# 班級成果備份與同步（v3.36.0）

Excel 的還原工作表使用 CHUNKS_V2：分段順序、長度與 CRC32 用來檢查損壞，不是安全簽章。舊 CHUNKS 仍可讀取。學生、分組、帳本、寵物設定及班級獨立功能資料一併保存。匯入先驗證，再顯示目標班級，確認後將原資料寫入 IndexedDB，才覆蓋本機。

雲端完整版本存入 users/{uid}/classes/{classId}/syncSnapshots/{token}/parts；預設班省略 classes/{classId}。appSettings/syncRevision 是生效指標。全部分段完成後，Firestore transaction 比較舊 token 並提交新指標。離線、中斷或衝突不會發布半份版本。每段最多 60,000 UTF-16 字元，上限 200 段。

本機保留各帳號各班級的 token 與內容指紋。上傳中的新操作仍待同步。恢復連線時重試；遇到不同版本則停止，須比較兩份備份後選擇，不自動合併成長或金幣帳本。

首次升級讀取原雲端集合。沒有同步基準且兩側已有資料時，需要先比較。舊集合保留；所有裝置必須重新載入新版，舊版仍寫舊集合，無法參與新版本衝突保護。雲端版本目前不自動清除。後台舊清理流程遇到版本備份會停止，避免刪除未完整封存的資料。

「下載還原前副本」提供此帳號此班最近一次還原前的 JSON。副本仍在同一瀏覽器，清除網站資料也會清除；重要成果仍需下載 Excel/JSON 留存。同步歸屬 Google 登入的 Firebase 使用者，不是 Google Drive 檔案。

驗收：scripts/test-class-pets.cjs、scripts/test-data-safety.cjs、scripts/test-pet-sync.cjs。線上 tests/data-safety-acceptance.html 使用獨立 sessionStorage 與 safety-qa 測試班，僅寫入虛構資料，不更新正式班級目錄。

班級收藏保存在 petSettings.collection，以種類去重；與孵化獎勵共同寫入，備份與雲端完整版本均包含。資料還原以選定備份為準，不合併不同班的收藏。
