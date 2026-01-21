---
description: 班級小管家專案代碼修改指南 - 避免編碼和替換問題
---

# 🚨 重要提醒：修改 classnew.html 的正確方法

## 問題背景
這個專案的 `classnew.html` 檔案有以下特性：
- **檔案大小**：約 3500 行，超過 180KB
- **編碼**：UTF-8 (含中文字符)
- **換行符**：Windows CRLF (`\r\n`)

## ❌ 會失敗的方法（請勿使用）

### 1. replace_file_content 工具
- 對於大型 HTML 文件經常匹配失敗
- 會產生意外的替換結果，破壞其他函數

### 2. PowerShell 的 Get-Content/Set-Content
- 會破壞 UTF-8 中文編碼
- 結果：頁面標題變成亂碼 `?��?小管�?`

### 3. PowerShell 的 -replace 配合 Set-Content
- 即使指定 `-Encoding utf8` 也可能出問題
- 經常導致編碼損壞

---

## ✅ 成功的方法

### 方法 1：創建獨立的 JS 增強模組（推薦）

不要直接修改 HTML 原始碼，而是：

1. **創建新的 JS 文件**，例如 `js/navigation-enhancement.js`
2. **使用覆蓋模式**增強現有函數：
```javascript
(function() {
    'use strict';
    
    function enhance() {
        const originalFunction = window.targetFunction;
        if (typeof originalFunction !== 'function') {
            setTimeout(enhance, 200);
            return;
        }
        
        window.targetFunction = function(...args) {
            originalFunction.apply(this, args);
            // 添加新功能
        };
    }
    
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(enhance, 300);
    });
})();
```

3. **使用 Node.js 添加 script 引用**（見下方）

### 方法 2：使用 Node.js 修改文件（保持編碼）

// turbo
```powershell
node -e "const fs = require('fs'); let c = fs.readFileSync('classnew.html', 'utf8'); c = c.replace('舊字串', '新字串'); fs.writeFileSync('classnew.html', c); console.log('OK');"
```

**注意事項**：
- 使用 `replace()` 時，舊字串要簡短明確
- 避免使用正則表達式（特殊字符會出問題）
- 使用十六進制轉義來處理特殊字符：
  - `\x22` = 雙引號 `"`
  - `\x3e` = 大於號 `>`
  - `\x3c` = 小於號 `<`

**範例：在 ui-enhancement.js 後添加新的 script**：
```powershell
node -e "const fs = require('fs'); let c = fs.readFileSync('classnew.html', 'utf8'); c = c.replace('js/ui-enhancement.js', 'js/ui-enhancement.js\x22\x3e\x3c/script\x3e\n    \x3cscript src=\x22js/navigation-enhancement.js'); fs.writeFileSync('classnew.html', c); console.log('OK');"
```

### 方法 3：使用 git 快速還原

如果編輯出錯，立即使用 git 還原：
// turbo
```powershell
git checkout -- classnew.html
```

---

## 📋 修改 classnew.html 的標準流程

1. **先備份/確認 git status 是乾淨的**
2. **創建獨立的 JS 模組**（而非直接修改 HTML 原始碼）
3. **使用 Node.js 添加 script 引用**
4. **驗證修改**：
   // turbo
   ```powershell
   Select-String -Pattern "新添加的內容" -Path "classnew.html"
   Select-String -Pattern "<title>" -Path "classnew.html" | Select-Object -First 1
   ```
5. **測試頁面**確認沒有亂碼
6. **如果出錯，立即 git checkout**

---

## 🔧 修改 js/ui-enhancement.js 的方法

這個文件也是大型 JS 文件，但是：
- **multi_replace_file_content 工具**對它有效
- 確保 TargetContent 完全精確（包含正確的縮排空格）

---

## 📝 這次學到的教訓

1. 大型 HTML 文件 + 中文 + Windows = 編碼地雷
2. 增強功能優先使用**獨立模組覆蓋模式**
3. 需要修改 HTML 時使用 **Node.js fs 模塊**
4. 出錯第一時間 `git checkout` 還原
5. 不要浪費時間嘗試 replace_file_content 重試
