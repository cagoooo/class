# 班級小管家 - 未來開發建議 📋

> 最後更新：2026-03-03 16:10
> 當前版本：v2.9.8
> 本文件提供詳細的未來優化與開發方向建議，供開發參考


---

## 📊 目錄

1. [優先級說明](#優先級說明)
2. [✅ v2.9.x 已完成功能摘要](#v29x-已完成功能摘要)
3. [短期優化 (1-2 週)](#短期優化-1-2-週)
4. [中期功能 (1-2 個月)](#中期功能-1-2-個月)
5. [長期規劃 (3-6 個月)](#長期規劃-3-6-個月)
6. [技術債務清理](#技術債務清理)
7. [效能優化](#效能優化)
8. [無障礙與國際化](#無障礙與國際化)
9. [部署與維運](#部署與維運)
10. [新增：AI 輔助工具](#新增ai-輔助工具)
11. [新增：護具與安全性](#新增護具與安全性)
12. [新增：進階視覺與動畫](#新增進階視覺與動畫)

---

## ✅ v2.9.x 已完成功能摘要

> 本區块記錄 v2.9.0~v2.9.8 所有完成的專案改善，供日後開發參考。

### 🔔 大時鐘全螢幕（v2.9.5~v2.9.6）
- ✅ 封裝 `fitClockToScreen()` v2：精確量測法（`scrollWidth`/`scrollHeight`）取代固定 `clamp` 公式
- ✅ 數位/LED/可愛時鐘：先設 200px 基準 → 測量實際寬度 → 按比例縮放，保證不溢出
- ✅ 翻轉時鐘：新增獨立分支，正確設定 `.flipper` 和 `.flipper-colon` 字體
- ✅ 視窗大小變化監聽：自動重新計算字體大小

### ☁️ Google 帳號同步功能屬全優化（v2.9.7~v2.9.8）

#### 已修復
- ✅ **公告下載缺漏** - `syncFromCloud()` 補上 `classAnnouncements` 下載
- ✅ **`renderGroups()` 缺漏** - `loadFromCloud()` 補上分組重繪呼叫
- ✅ **考試監考統計假警報** - 本地/雲端統一改用陣列長度計算
- ✅ **深淺色按鈕覆蓋頭像** - 移入導覽列 slot，加入 `theme-toggle-slot`
- ✅ **Service Worker 快取問題** - 加入版本 console.log，升版 sw.js 強制刷新

#### 新增同步資料類別（共 10 種）

| 資料 | 之前 | 現在 |
|------|------|------|
| 學生名單 | ✅ | ✅ |
| 加扣分記錄 | ✅ | ✅ |
| 分組記錄 | ✅ | ✅ |
| 聯絡簿 | ✅ | ✅ |
| 作業列表 | ✅ | ✅ |
| 作業繳交狀態 | ✅ | ✅ |
| 抽簽歷史 | ✅ | ✅ |
| **班級公告（下載）** | ❌ 缺漏 | ✅ |
| **考試監考設定** | ❌ 未同步 | ✅ |
| **時鐘設定** | ❌ 未同步 | ✅ |

#### 新增同步確認 Modal
- ✅ 廢除原生 `confirm()` 對話框
- ✅ 同步前静默讀取雲端統計，顯示 10 類資料對比表格
- ✅ 差異彩色標示（増加 🟢 / 減少 🔴 / 無變化 灰色）
- ✅ 上傳/下載各有獨立方向確認 Modal，正確說明覆蓋方向

---

---

## 優先級說明

| 優先級 | 圖示 | 說明 |
|--------|------|------|
| 🔴 高 | P0 | 影響核心功能或用戶體驗，需優先處理 |
| 🟡 中 | P1 | 增強功能或改善體驗，可排入近期迭代 |
| 🟢 低 | P2 | 錦上添花的功能，可視資源決定 |

---

## 短期優化 (1-2 週)

### ✅ P0：程式碼品質提升（已完成）

#### ✅ EventBus 事件總線（已完成 v2.6.0）
- ✅ 建立 `js/event-bus.js` 事件總線模組
- ✅ 支援 `on`, `once`, `off`, `emit` 方法
- ✅ 事件歷史記錄和除錯模式

#### ✅ 錯誤處理機制（已完成 v2.6.0）
- ✅ 建立 `js/error-handler.js` 錯誤處理模組
- ✅ 統一中文錯誤訊息顯示
- ✅ 全域捕獲 `unhandledrejection`、`window.error`

#### ✅ PWA 完整支援（已完成 v2.6.x～v2.8.x）
- ✅ Service Worker 離線快取
- ✅ 安裝引導 Banner
- ✅ Firebase App Check（reCAPTCHA v3）
- ✅ 開發環境 SW 自動 unregister（localhost 隔離）
- ✅ App Check 節流 400 錯誤修復

---

### 🟡 P1：考試監考模組優化（部分完成）

#### ✅ 科目時間衝突檢測（已完成）
- ✅ 自動偵測時間重疊科目
- ✅ ⚠️ 警告標示 + 衝突詳情

#### ✅ 缺考學生記錄（已完成）
- ✅ 按科目記錄缺考（病假/事假/公假/其他）
- ✅ 備註欄 + 出席率統計
- ✅ 匯出缺考報告 .txt

#### ✅ 3. 音效提醒系統（已完成 v2.8.4）
**完成內容**：
- ✅ `js/exam-sounds.js` - Web Audio API 合成，**無需任何外部 mp3 檔案**
- ✅ 5 種合成音效：開始鈴 / 5分鐘警告 / 1分鐘緊急 / 結束鈴 / 計時器到期
- ✅ 全螢幕監考模式整合（🔔/🔇 靜音按鈕 + Toast 通知）
- ✅ 計時器歸零連動（MutationObserver 監聽 #timerDisplay）
- ✅ 靜音狀態 localStorage 持久化

**未來可擴充**：
- 可加入更多音效類型（如：設施铃聲、下課鈴、特殊事項提醒）
- 可為不同警告等級設定不同音量（嚴重程度對應音量）
- 可加入自訂音效上傳功能（使用者自選 mp3）

**預估工時**：✅ 已完成


**建議實作**：
```javascript
// 在 exam-proctor.js 中新增
const ExamSounds = {
  sounds: {
    start: new Audio('sounds/exam-start.mp3'),
    end: new Audio('sounds/exam-end.mp3'),
    warning: new Audio('sounds/warning.mp3'),
    break: new Audio('sounds/break.mp3')
  },
  enabled: true,
  
  play(type) {
    if (!this.enabled) return;
    const sound = this.sounds[type];
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch(e => console.log('Audio play failed:', e));
    }
  },
  
  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('examSoundEnabled', this.enabled);
    return this.enabled;
  }
};
```

> **💡 無音效檔也可用 Web Audio API 合成簡單鈴聲，完全不需要外部檔案！**

**預估工時**：1 天

---

### 🟡 P1：UI/UX 細節優化

#### ✅ 4. 骨架屏（已完成 v2.8.3）
**完成內容**：
- ✅ `css/skeleton.css` - 波紋揃描動畫 + 深色模式 + RWD
- ✅ `js/skeleton.js` - `SkeletonManager` 通用管理器
- ✅ 學生列表 / 排行榜 / 作業儀表板 / 全螢幕作業檢查 四個模組全部整合

**限制與可援展**：
- 可將骨架屏模板扩充至其他新模組
- 可邏些真實 API loading，経第二階段整否 Firebase 資料來源

**預估工時**：✅ 已完成

---

#### 5. 🔲 通知系統升級（Browser Notification API）
**需求描述**：
- 離開瀏覽器時仍能收到考試提醒
- 學生繳交作業通知（需 Firebase 配合）
- 計時器到期 OS 通知

**建議實作**：
```javascript
// js/notification-manager.js
async function requestNotificationPermission() {
  if ('Notification' in window) {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      new Notification('班級小管家', {
        body: '通知功能已啟用，考試倒數時您將收到提醒',
        icon: './icons/icon-192.png'
      });
    }
  }
}

function sendExamWarning(minutesLeft) {
  if (Notification.permission === 'granted') {
    new Notification('⚠️ 考試提醒', {
      body: `距離考試結束還有 ${minutesLeft} 分鐘！`,
      icon: './icons/icon-192.png',
      tag: 'exam-warning', // 避免重複通知
      silent: false
    });
  }
}
```

**預估工時**：0.5 天

---

## 中期功能 (1-2 個月)

### 🔴 P0：資料持久化增強

#### 6. 🔲 IndexedDB 遷移
**現狀問題**：
- localStorage 有 5MB 限制
- 大量學生資料（含歷史記錄）可能超出限制
- 無法儲存二進位資料（如學生照片）

**建議方案**：
```javascript
// 新增檔案：js/indexed-db.js
const DB_NAME = 'ClassManagerDB';
const DB_VERSION = 1;

class ClassDatabase {
  constructor() {
    this.db = null;
  }
  
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // 學生資料表
        if (!db.objectStoreNames.contains('students')) {
          const store = db.createObjectStore('students', { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('seatNumber', 'seatNumber', { unique: false });
        }
        
        // 考試記錄表
        if (!db.objectStoreNames.contains('examRecords')) {
          const store = db.createObjectStore('examRecords', { keyPath: 'id' });
          store.createIndex('date', 'date', { unique: false });
        }
        
        // 評分歷史表
        if (!db.objectStoreNames.contains('scoreHistory')) {
          const store = db.createObjectStore('scoreHistory', { keyPath: 'id' });
          store.createIndex('studentId', 'studentId', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }
  
  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
  
  async put(storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
}

// 全域實例
const classDB = new ClassDatabase();
```

**遷移策略**：
1. 建立 IndexedDB 架構
2. 保留 localStorage 作為備份
3. 首次載入時自動遷移資料
4. 逐步移除 localStorage 依賴

**預估工時**：5-7 天

---

### 🟡 P1：新功能模組

#### 7. 🔲 課表管理模組（**強力推薦**）
**需求描述**：
- 視覺化週課表編輯
- 整合考試監考時間
- 匯出圖片或 PDF

**功能規劃**：
```
📅 課表管理
├── 🗓️ 週課表顯示
│   ├── 拖拽編輯課程
│   ├── 顏色區分科目（國語-藍/數學-紅/英語-綠）
│   └── 顯示節次與時間
├── 📋 課表範本
│   ├── 預設範本（40 分鐘制/45 分鐘制）
│   └── 自訂範本儲存
├── 🔄 課表切換
│   ├── 正課課表
│   └── 段考/特殊課表
└── 📤 匯出功能
    ├── 匯出圖片（html2canvas）
    └── 列印友善版
```

**建議 UI 設計**：
```html
<!-- 課表網格結構 -->
<div class="timetable-grid">
  <div class="timetable-header">
    <div class="time-col">時間</div>
    <div class="day-col">週一</div>
    <div class="day-col">週二</div>
    <!-- 週三~週五 -->
  </div>
  <div class="timetable-body">
    <div class="time-row">
      <div class="time-cell">08:00-08:45</div>
      <div class="class-cell" data-day="1" data-period="1">
        <span class="subject-tag" style="background: var(--subject-chinese)">
          國語
        </span>
      </div>
    </div>
  </div>
</div>
```

**預估工時**：7-10 天
**新增檔案**：`js/timetable.js`, `css/timetable.css`

---

#### 8. 🔲 班級公告系統（**適合每日使用**）
**需求描述**：
- 發布班級公告（支援類型標籤）
- 重要通知置頂顯示
- 公告到期日自動隱藏

**功能規劃**：
```javascript
const Announcement = {
  types: {
    GENERAL: { icon: '📢', color: '#6366f1', label: '一般公告' },
    URGENT:  { icon: '🚨', color: '#ef4444', label: '緊急通知' },
    EVENT:   { icon: '🎉', color: '#22c55e', label: '活動通知' },
    HOMEWORK:{ icon: '📚', color: '#f59e0b', label: '作業提醒' }
  },
  
  create(data) {
    return {
      id: Date.now().toString(),
      type: data.type || 'GENERAL',
      title: data.title,
      content: data.content,
      isPinned: data.isPinned || false,
      createdAt: new Date().toISOString(),
      expiresAt: data.expiresAt || null  // null = 永不過期
    };
  },
  
  getActive() {
    const now = new Date();
    return announcements
      .filter(a => !a.expiresAt || new Date(a.expiresAt) > now)
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return b.isPinned - a.isPinned;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
  }
};
```

**預估工時**：4-5 天
**新增檔案**：`js/announcement.js`

---

#### 9. 🔲 學生成績追蹤（**教學核心功能**）
**需求描述**：
- 記錄各科段考/平時考成績
- 成績趨勢折線圖（Chart.js）
- 個別成績單匯出 PDF

**功能規劃**：
```javascript
// 成績資料結構
const GradeRecord = {
  studentId: '',
  examId: '',          // 識別考試場次
  examType: 'midterm', // midterm / final / quiz
  examDate: '',
  scores: [
    { subject: 'chinese', score: 95, fullScore: 100 },
    { subject: 'math',    score: 88, fullScore: 100 },
    { subject: 'english', score: 92, fullScore: 100 }
  ],
  rank: 5,
  totalStudents: 28,
  comments: ''
};

// 成績統計分析
const GradeAnalytics = {
  calculateAverage(grades, subject = null) {
    const scores = grades
      .flatMap(g => g.scores)
      .filter(s => !subject || s.subject === subject)
      .map(s => s.score);
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  },
  
  calculateProgress(studentId, subject) {
    const sorted = grades
      .filter(g => g.studentId === studentId)
      .sort((a, b) => new Date(a.examDate) - new Date(b.examDate));
    if (sorted.length < 2) return null;
    const getScore = (g) => g.scores.find(s => s.subject === subject)?.score || 0;
    const first = getScore(sorted[0]);
    const last = getScore(sorted[sorted.length - 1]);
    return { change: last - first, percentage: ((last - first) / first * 100).toFixed(1) };
  }
};
```

**圖表整合（Chart.js）**：
```javascript
// 成績趨勢折線圖
const trendChart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: ['第一次段考', '第二次段考', '第三次段考'],
    datasets: [
      { label: '國語', data: [85, 90, 92], borderColor: '#6366f1' },
      { label: '數學', data: [78, 82, 88], borderColor: '#22c55e' }
    ]
  },
  options: {
    responsive: true,
    plugins: { legend: { position: 'top' } }
  }
});
```

**預估工時**：7-10 天
**依賴**：引入 Chart.js CDN
**新增檔案**：`js/grade-tracker.js`, `css/grade-tracker.css`

---

#### 10. 🔲 AI 評語生成（**整合現有 Gemini API**）
**需求描述**：
- 一鍵生成個別學生期末評語
- 根據分數、標籤、表現自動撰寫
- 語氣親切正面，符合台灣小學風格

**建議實作**（整合現有後端架構）：
```javascript
// 複用專案中已有的 Firebase Function 架構
async function generateStudentComment(student) {
  const prompt = `
    你是一位台灣小學老師，請根據以下學生資訊生成一段60-100字的期末評語。
    語氣要溫暖正面，鼓勵學生持續努力。
    
    學生資訊：
    - 姓名：${student.name}
    - 累積分數：${student.score} 分
    - 特殊標籤：${student.tags.map(t => t.label).join('、') || '無'}
    - 近期表現：${student.score > 0 ? '分數為正，表現不錯' : '需要加油'}
    
    請直接輸出評語，不要包含「評語：」等前綴文字。
  `;
  
  // 呼叫現有 Firebase Function
  const response = await fetch(VITE_FUNCTIONS_BASE + '/generateComment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId: student.id, prompt })
  });
  return response.json();
}
```

**預估工時**：3-4 天（可複用現有 Firebase Function 架構）

---

### 🟢 P2：體驗增強

#### 11. 🔲 手勢操作支援（觸控裝置）
**需求描述**：
- 觸控滑動切換功能區
- 長按編輯項目
- 支援平板觸控操作

**建議實作**：
```javascript
// js/gesture-handler.js
class GestureHandler {
  constructor(element, options = {}) {
    this.element = element;
    this.options = {
      swipeThreshold: 50,
      longPressDelay: 500,
      ...options
    };
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.longPressTimer = null;
    this.bindEvents();
  }
  
  bindEvents() {
    this.element.addEventListener('touchstart', (e) => {
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
      this.longPressTimer = setTimeout(() => {
        this.options.onLongPress?.(e);
      }, this.options.longPressDelay);
    });
    
    this.element.addEventListener('touchmove', () => {
      clearTimeout(this.longPressTimer);
    });
    
    this.element.addEventListener('touchend', (e) => {
      clearTimeout(this.longPressTimer);
      const dx = e.changedTouches[0].clientX - this.touchStartX;
      const dy = e.changedTouches[0].clientY - this.touchStartY;
      
      if (Math.abs(dx) > this.options.swipeThreshold) {
        dx > 0 ? this.options.onSwipeRight?.(e) : this.options.onSwipeLeft?.(e);
      }
      if (Math.abs(dy) > this.options.swipeThreshold) {
        dy > 0 ? this.options.onSwipeDown?.(e) : this.options.onSwipeUp?.(e);
      }
    });
  }
}

// 使用範例
const contentArea = document.querySelector('.content-area');
new GestureHandler(contentArea, {
  onSwipeLeft:  () => switchToNextTab(),
  onSwipeRight: () => switchToPrevTab(),
  onLongPress:  (e) => showContextMenu(e)
});
```

**預估工時**：2-3 天

---

#### 12. 🔲 語音指令整合（創新功能）
**需求描述**：
- 語音抽籤：「抽一個人」
- 語音計時：「設定五分鐘」
- 語音加分：「王小明加三分」

**建議實作**：
```javascript
// js/voice-commands.js
class VoiceCommands {
  constructor() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    
    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'zh-TW';
    this.recognition.continuous = false;
    
    this.commands = new Map([
      [/抽(一個|一位|\d+個)?人/, () => startLottery(1)],
      [/計時(\d+)分鐘?/, (m) => { setTimer(parseInt(m[1]) * 60); startTimer(); }],
      [/(.+)(加|扣)(\d+)分/, (m) => {
        const student = findStudentByName(m[1].trim());
        if (student) adjustScore(student.id, m[2] === '加' ? parseInt(m[3]) : -parseInt(m[3]));
      }],
      [/全班靜下來|安靜/, () => playAttentionSound()]
    ]);
    
    this.recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      this.processCommand(text);
    };
  }
  
  processCommand(text) {
    for (const [pattern, handler] of this.commands) {
      const match = text.match(pattern);
      if (match) {
        handler(match);
        showNotification(`✅ 已執行：${text}`, 'success');
        return;
      }
    }
    showNotification(`❓ 無法辨識：${text}`, 'warning');
  }
  
  start() {
    this.recognition?.start();
    showNotification('🎙️ 請說出指令...', 'info');
  }
}

const voiceCommands = new VoiceCommands();
```

**預估工時**：3-4 天
**注意事項**：需 HTTPS 環境（GitHub Pages 已符合）

---

## 長期規劃 (3-6 個月)

### 🔴 P0：架構升級

#### 13. 🔲 TypeScript 遷移
**現狀問題**：缺乏型別檢查，IDE 自動補全有限，大型專案維護困難

**遷移計劃**：

**Phase 1：基礎設置 (1 週)**
```typescript
// types/student.d.ts
interface Student {
  id: string;
  name: string;
  seatNumber: number;
  avatar: string;
  score: number;
  tags: StudentTag[];
  records: ScoreRecord[];
  createdAt: string;
  updatedAt: string;
}

type StudentTag = 'leader' | 'monitor' | 'tutor' | 'special' | 'president' | 'vicePresident';

interface ScoreRecord {
  id: string;
  studentId: string;
  change: number;
  reason: string;
  timestamp: string;
}

interface ExamSubject {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  hasConflict?: boolean;
}
```

**Phase 2：核心模組遷移 (2-3 週)**
```
優先順序：
1. app-state.ts
2. storage-manager.ts
3. event-bus.ts
4. 各功能模組...
```

**Phase 3：建置流程 (1 週)**
- 設定 Vite + TypeScript
- 配置 source maps
- ESLint + 型別嚴格模式

**預估工時**：4-6 週

---

#### 14. 🔲 Web Components 重構
**需求描述**：建立可重用 UI 元件，元件封裝與隔離，跨專案共用

**建議元件清單**：
```
📦 Web Components
├── <class-student-card>     學生卡片
├── <class-timer>            計時器
├── <class-lottery-wheel>    抽籤輪盤
├── <class-leaderboard>      排行榜
├── <class-notification>     通知訊息
├── <class-modal>            彈窗
├── <class-timetable>        課表
└── <class-score-badge>      分數徽章
```

**預估工時**：6-8 週

---

### 🟡 P1：多租戶支援

#### 15. 🔲 多班級/多帳號系統
**需求描述**：教師可管理多個班級，班級資料完全隔離，快速切換

**建議架構**：
```javascript
// 多班級資料結構
const UserData = {
  userId: 'teacher_001',
  name: '王老師',
  classes: [
    { classId: 'class_501', className: '501班', studentCount: 28 },
    { classId: 'class_502', className: '502班', studentCount: 30 }
  ],
  currentClassId: 'class_501'
};

// 班級快速切換
async function switchClass(classId) {
  await saveCurrentClassData();
  const classData = await loadClassData(classId);
  AppState.set('currentClass', classData);
  AppState.set('students', classData.students);
  renderAllViews();
}
```

**預估工時**：8-10 週

---

### 🟢 P2：進階 AI 整合

#### 16. 🔲 智慧分組建議（Gemini API）
**需求描述**：
- 依成績異質分組（高中低分混搭）
- 依個性標籤分組（避免全幹部同組）
- AI 建議最佳分組方案

```javascript
async function getAIGroupingSuggestion(students, groupCount) {
  const studentSummary = students.map(s => ({
    name: s.name,
    score: s.score,
    tags: s.tags
  }));
  
  const prompt = `
    請為以下 ${students.length} 位學生分成 ${groupCount} 組。
    要求：
    1. 每組成績高低均衡（異質分組）
    2. 幹部學生分散到各組
    3. 特殊需求學生需要擔任組長的同學陪同
    
    學生資料：${JSON.stringify(studentSummary)}
    
    請以 JSON 格式回傳分組結果。
  `;
  
  // 呼叫 Firebase Function
}
```

**預估工時**：4-5 天

---

#### 17. 🔲 學習狀況分析儀表板
**需求描述**：
- 全班分數分佈視覺化（直方圖）
- 進步/退步學生自動標記
- 每週班級狀況摘要報告

**功能規劃**：
```
📊 分析儀表板
├── 📈 分數趨勢（折線圖）
├── 📊 分佈統計（直方圖）
├── 🏆 進步最多 Top 5
├── 💪 需要關注學生清單
└── 📄 週/月報表自動生成
```

**預估工時**：5-7 天（整合 Chart.js）

---

## 技術債務清理

### 18. Console Log 清理
**現狀**：開發用的 `console.log` 散落各處，正式版不應顯示

```javascript
// js/logger.js
const Logger = {
  isDev: window.location.hostname === 'localhost',
  
  log(...args)  { if (this.isDev) console.log('[LOG]', ...args); },
  warn(...args) { if (this.isDev) console.warn('[WARN]', ...args); },
  error(...args){ console.error('[ERROR]', ...args); this.report('error', args); },
  info(...args) { if (this.isDev) console.info('[INFO]', ...args); },
  
  report(level, args) { /* 未來接 Sentry 等錯誤收集服務 */ }
};
```

**預估工時**：1 天

---

### 19. CSS 架構優化
**現狀**：樣式分散在多個檔案，部分樣式內嵌在 JS 中

**建議最終結構**：
```
css/
├── base/
│   ├── reset.css        # 重置樣式
│   ├── typography.css   # 字體樣式
│   └── variables.css    # CSS 變數（色彩/間距/陰影/動畫）
├── components/
│   ├── buttons.css
│   ├── cards.css
│   ├── modals.css
│   └── forms.css
├── layouts/
│   ├── grid.css
│   ├── nav.css
│   └── sidebar.css
├── utilities/
│   ├── spacing.css
│   ├── colors.css
│   └── animations.css
└── main.css             # 入口檔案（@import 各模組）
```

**CSS 變數標準化**：
```css
/* css/base/variables.css */
:root {
  /* 色彩系統 */
  --primary-500: #6366f1;
  --primary-600: #4f46e5;
  --success-500: #22c55e;
  --warning-500: #f59e0b;
  --danger-500: #ef4444;
  
  /* 間距 */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-4: 1rem;
  --space-8: 2rem;
  
  /* 圓角 */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;
  
  /* 動畫 */
  --transition-fast:   150ms ease;
  --transition-normal: 250ms ease;
  --transition-slow:   350ms ease;
}

[data-theme="dark"] {
  --bg-primary:   #0f172a;
  --bg-secondary: #1e293b;
  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
}
```

**預估工時**：3-5 天

---

### 20. HTML 拆分（主要技術債）
**現狀**：`classnew.html` 達 5000+ 行，難以維護

**建議方案**：
```javascript
// 動態載入 HTML 片段
async function loadComponent(name, targetId) {
  const response = await fetch(`components/${name}.html`);
  const html = await response.text();
  document.getElementById(targetId).innerHTML = html;
}

// 應用啟動時載入
await Promise.all([
  loadComponent('student-section', 'studentArea'),
  loadComponent('homework-section', 'homeworkArea'),
  loadComponent('exam-section', 'examArea')
]);
```

**預估工時**：5-7 天（風險中等，需完整測試）

---

## 效能優化

### 21. 🔲 懶加載（Lazy Loading）
```javascript
// 僅在切換到對應功能時初始化模組
const moduleLoaders = {
  exam:     () => import('./js/exam-proctor.js'),
  homework: () => import('./js/homework-enhancement.js'),
  lottery:  () => import('./js/lottery-enhancement.js')
};

async function switchTab(tabName) {
  if (moduleLoaders[tabName] && !loadedModules.has(tabName)) {
    await moduleLoaders[tabName]();
    loadedModules.add(tabName);
  }
  showSection(tabName);
}
```

**優點**：初始載入時間減少 40-60%
**預估工時**：3-4 天

---

### 22. 🔲 防抖/節流統一化
**現狀**：防抖邏輯散落各處，不一致

```javascript
// js/utils.js
function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function throttle(fn, interval = 200) {
  let lastTime = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastTime >= interval) {
      lastTime = now;
      fn.apply(this, args);
    }
  };
}
```

**預估工時**：0.5 天

---

## 無障礙與國際化

### 23. 🔲 無障礙功能（A11y）
**需求描述**：
- 螢幕閱讀器支援（ARIA labels）
- 鍵盤完整操作
- 色盲友善配色模式

```html
<!-- 範例：學生卡片 ARIA -->
<div class="student-card"
     role="button"
     aria-label="學生 王小明，座號 6，目前分數 15 分"
     tabindex="0"
     onkeydown="if(event.key==='Enter') openStudentDetail(this)">
  <!-- 內容 -->
</div>
```

**預估工時**：3-5 天

---

### 24. 🔲 深色模式完整審核
**現狀**：深色模式覆蓋率約 80%，部分細節元件未完全支援

**建議審核清單**：
- [ ] 所有 Modal 彈窗
- [ ] 考試監考全螢幕
- [ ] 課表模組（未來）
- [ ] Toast 通知
- [ ] 工具提示（Tooltip）

**預估工時**：2 天

---

## 部署與維運

### 25. 🔲 錯誤監控整合（Sentry）
```javascript
// 整合 Sentry SDK
import * as Sentry from '@sentry/browser';

Sentry.init({
  dsn: 'YOUR_SENTRY_DSN',
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,  // 10% 效能追蹤取樣
});

// 捕獲自訂錯誤
try {
  await riskyOperation();
} catch (error) {
  Sentry.captureException(error, {
    extra: { studentId, operation: 'saveScore' }
  });
}
```

**預估工時**：1 天

---

### 26. ✅ CI/CD 自動部署（已完成）
- ✅ GitHub Actions 自動部署到 GitHub Pages
- ✅ Service Worker 版本自動更新
- ✅ Environment Variables 透過 GitHub Secrets 注入

**未來增強**：
- [ ] PR 預覽環境（Preview Deployments）
- [ ] 自動化 E2E 測試（Playwright）
- [ ] Lighthouse CI 效能檢查

---

## 📋 開發路線建議摘要

| 階段 | 時程 | 重點功能 | 預估工時 |
|------|------|----------|----------|
| **Sprint 1** | 1-2 週 | 音效提醒 + 通知 API + 骨架屏 | 3-4 天 |
| **Sprint 2** | 3-4 週 | 課表管理模組 | 7-10 天 |
| **Sprint 3** | 5-6 週 | 班級公告 + 成績追蹤基礎 | 4-5 天 |
| **Sprint 4** | 7-8 週 | AI 評語生成 + 分析儀表板 | 5-7 天 |
| **Sprint 5** | 9-12 週 | 語音指令 + 手勢操作 | 5-7 天 |
| **長期** | 3-6 個月 | TypeScript + 多班級 + Web Components | - |

> [!TIP]
> **建議最先開始的 3 個項目**（投入小、效益高）：
> 1. 🔔 **音效提醒系統**（1天，考試必備）
> 2. 📅 **課表管理模組**（7天，每天都用）
> 3. 🤖 **AI 評語生成**（3天，複用現有架構）

---

## 📌 快速開發環境

```powershell
# 啟動本地伺服器（最快）
cd H:\Class
python -m http.server 8080
# 開啟 http://localhost:8080/classnew.html

# GitHub 推送
git add -A
git commit -m "✅功能說明"
git push
```

- **GitHub 倉庫**：https://github.com/cagoooo/class.git
- **GitHub Pages**：https://cagoooo.github.io/class/classnew.html

---

## 新增：AI 輔助工具

> 利用 Google Gemini API 為班級小管家加入 AI 能力，提升教師工作效率。

### 🤖 A01：學生個人化評語生成（強力推薦，預估 2 天）

**需求描述**：教師期末需針對每位學生手寫評語，可借助 AI 大幅減輕負擔。

**功能規劃**：
- 根據學生分數、標籤（幹部/課輔等）、作業繳交率，自動生成 80-100 字評語
- 一鍵批量生成全班，每份可手動微調
- 匯出全班評語為 TXT / Word

**建議實作**：
```javascript
// js/ai-comment-generator.js
async function generateStudentComment(student, homeworkStats) {
    const prompt = `
你是一位溫暖的小學班導師，請根據以下學生資料，
用繁體中文撰寫一段 80-100 字的期末評語，語氣友善鼓勵。

學生姓名：${student.name}
學生分數：${student.points}
標籤：${(student.tags||[]).join('、') || '無'}
作業完成率：${homeworkStats.rate}%（${homeworkStats.completed}/${homeworkStats.total}）

評語需包含具體優點、成長建議、鼓勵語句。只輸出評語本文。
    `.trim();

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
        { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ contents:[{ parts:[{text:prompt}] }] }) }
    );
    return (await res.json()).candidates[0].content.parts[0].text;
}
```

**UI 整合**：在學生報告卡加「✨ AI 生成評語」按鈕 → 顯示生成中 Spinner → 可編輯 textarea → 複製/重新生成

**預估工時**：2 天

---

### 🎙️ A02：語音指令控制（預估 3 天）

**需求描述**：教師雙手忙於黑板時，可用語音操作系統。

**支援指令範例**：

| 語音指令 | 觸發動作 |
|----------|---------|
| 「抽一個人」 | 觸發抽籤 |
| 「計時三分鐘」 | 啟動 3 分鐘計時 |
| 「分四組」 | 觸發 4 組分組 |
| 「給王小明加一分」 | 更新分數 +1 |
| 「顯示排行榜」 | 開啟排行榜 |

**建議實作**：
```javascript
// js/voice-command.js（使用免費 Web Speech API，不需要 API Key）
const VoiceCommand = {
    recognition: new (window.SpeechRecognition || window.webkitSpeechRecognition)(),
    commands: [
        { re: /抽一個人?/,         fn: () => window.drawLottery?.() },
        { re: /計時(\d+)分/,       fn: m => window.startTimer?.(+m[1]*60) },
        { re: /分(\d+)組/,         fn: m => window.createGroups?.(+m[1]) },
        { re: /給(.+?)加(\d+)分/,  fn: m => updateScore(m[1], +m[2]) },
        { re: /給(.+?)扣(\d+)分/,  fn: m => updateScore(m[1], -m[2]) },
        { re: /顯示排行榜/,         fn: () => window.showLeaderboard?.() },
    ],
    init() {
        this.recognition.lang = 'zh-TW';
        this.recognition.onresult = e =>
            this.process(e.results[0][0].transcript);
    },
    process(text) {
        for (const cmd of this.commands) {
            const m = text.match(cmd.re);
            if (m) { cmd.fn(m); return; }
        }
    }
};
```

**預估工時**：3 天（含字典訓練與 UI 指示燈）

---

### 📊 A03：成績趨勢圖表 + AI 月報（預估 2 天）

**功能規劃**：
- 折線圖視覺化全班分數趨勢（Chart.js）
- AI 自動標記本月進步/退步名單
- 生成月報摘要：「本月 3 位學生進步顯著，2 位需要關注」

**建議實作**（需引入 Chart.js CDN）：
```javascript
new Chart(document.getElementById('trendCanvas'), {
    type: 'line',
    data: {
        labels: dateList,
        datasets: students.slice(0, 10).map(s => ({
            label: s.name,
            data: scoreHistory.filter(h => h.studentId === s.id).map(h => h.score),
            tension: 0.3, borderWidth: 2
        }))
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
});
```

**預估工時**：2 天

---

## 新增：護具與安全性

> 保護資料完整性、避免意外遺失，強化操作安全。

### 🛡️ S01：完整資料匯出/匯入（最高推薦，預估 2 天）

**現狀問題**：清除瀏覽器快取即全部遺失，缺乏離線備份機制。

**備份層次建議**：

| 層次 | 方式 | 說明 |
|------|------|------|
| L1 | localStorage 自動備份 | 每 5 分鐘（已實作）|
| L2 | IndexedDB 持久快照 | 每日快照，保留 30 天 |
| L3 | Firebase Firestore | 雲端同步（已實作）|
| **L4** | **匯出 JSON 檔** | **一鍵下載，可完整還原（待開發）**|

**L4 匯出/匯入建議**：
```javascript
function exportAllData() {
    const backup = {
        version: '2.8.3',
        exportedAt: new Date().toISOString(),
        students:        JSON.parse(localStorage.getItem('students') || '[]'),
        homeworkList:    JSON.parse(localStorage.getItem('homeworkList') || '[]'),
        homeworkChecks:  JSON.parse(localStorage.getItem('homeworkChecks') || '{}'),
        notebookEntries: JSON.parse(localStorage.getItem('notebookEntries') || '[]'),
        scoreHistory:    JSON.parse(localStorage.getItem('scoreHistory') || '[]')
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {type:'application/json'});
    const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob),
        download: `backup_${backup.exportedAt.split('T')[0]}.json`
    });
    a.click();
}

function importAllData(file) {
    const r = new FileReader();
    r.onload = e => {
        const b = JSON.parse(e.target.result);
        if (!b.version) { alert('不支援的備份格式'); return; }
        if (confirm(`確認匯入 ${b.exportedAt} 的備份？現有資料將被覆蓋`)) {
            ['students','homeworkList','homeworkChecks','notebookEntries','scoreHistory']
                .forEach(k => b[k] && localStorage.setItem(k, JSON.stringify(b[k])));
            location.reload();
        }
    };
    r.readAsText(file);
}
```

**預估工時**：2 天

---

### 🏫 S02：多班級 Profile 切換（預估 3-5 天）

**需求描述**：多位教師共用電腦，或導師同時管理多個班級時，資料需完全隔離。

**建議架構**：
```javascript
// 每個 Profile 使用獨立 localStorage 前綴
const ClassProfile = {
    current: localStorage.getItem('activeProfile') || 'default',
    getKey: (key) => `p_${ClassProfile.current}_${key}`,
    save:   (key, val) => localStorage.setItem(ClassProfile.getKey(key), JSON.stringify(val)),
    load:   (key, fb)  => { const v = localStorage.getItem(ClassProfile.getKey(key)); return v ? JSON.parse(v) : fb; },
    list:   ()         => JSON.parse(localStorage.getItem('profiles') || '[]'),
    switchTo: (id)     => { localStorage.setItem('activeProfile', id); location.reload(); }
};
```

**預估工時**：3-5 天（含 UI、PIN 鎖定、資料遷移工具）

---

### 📱 S03：多裝置資料衝突解析（預估 3 天）

**現狀問題**：兩台裝置同時操作時，Firebase sync 可能覆蓋彼此資料。

**建議合併策略**：
```javascript
// 各欄位獨立比較，取最新/最大值
function mergeStudentData(local, remote) {
    return {
        ...local,
        points:    Math.max(local.points, remote.points),
        tags:      [...new Set([...local.tags, ...remote.tags])],
        updatedAt: Math.max(local.updatedAt||0, remote.updatedAt||0)
    };
}
```

**預估工時**：3 天

---

## 新增：進階視覺與動畫

> 讓班級小管家的視覺體驗更出色，活絡課堂氣氛。

### 🎨 V01：主題皮膚系統（預估 2 天）

**建議主題**：

| 主題 | 主色 | 適合場合 |
|------|------|---------|
| 🌊 深海藍（預設） | `#3b82f6` | 日常授課 |
| 🌿 森林綠 | `#22c55e` | 自然/生物課 |
| 🌸 櫻花粉 | `#f472b6` | 低年級/美術 |
| 🌙 午夜黑 | `#1e1b4b` | 投影深色模式 |
| ☀️ 暖陽橘 | `#f97316` | 體育/活動日 |

**建議實作**（CSS 自定義屬性一鍵換膚）：
```css
:root { --cp:#3b82f6; --cp-d:#1d4ed8; --bg:#f8fafc; --text:#1e293b; }
[data-theme="sakura"] { --cp:#f472b6; --cp-d:#db2777; --bg:#fdf2f8; }
[data-theme="forest"] { --cp:#22c55e; --cp-d:#15803d; --bg:#f0fdf4; }
[data-theme="night"]  { --cp:#818cf8; --cp-d:#6366f1; --bg:#0f172a; --text:#e2e8f0; }
```

```javascript
function applyTheme(name) {
    document.documentElement.setAttribute('data-theme', name);
    localStorage.setItem('classTheme', name);
}
// 在 theme-toggle.js 初始化時套用：
document.addEventListener('DOMContentLoaded', () => applyTheme(localStorage.getItem('classTheme') || 'default'));
```

**預估工時**：2 天

---

### ✨ V02：頁面功能區轉場動畫（預估 1 天）

**現狀問題**：功能區切換時直接跳換，缺乏過渡感。

```javascript
// 包裝現有 showSection()，加入淡出/滑入
const _orig = window.showSection;
window.showSection = function(id) {
    const cur = document.querySelector('[id$="-section"]:not(.hidden)');
    if (cur) {
        cur.style.animation = 'secOut 0.15s ease forwards';
        setTimeout(() => {
            _orig(id);
            const next = document.getElementById(id + '-section');
            if (next) next.style.animation = 'secIn 0.2s ease forwards';
        }, 150);
    } else { _orig(id); }
};
```

```css
@keyframes secOut { to { opacity:0; transform:translateY(-8px); } }
@keyframes secIn  { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
```

**預估工時**：1 天

---

### 🏅 V03：學生加分浮動動畫（預估 1.5 天）

**需求描述**：點擊加/減分時，顯示浮動飛出數字（`+1 ✨`），增強課堂互動感。

```javascript
function showScoreFlyout(anchorEl, delta) {
    const el = document.createElement('div');
    const rect = anchorEl.getBoundingClientRect();
    Object.assign(el.style, {
        position:'fixed', pointerEvents:'none', zIndex:'9999',
        fontSize:'2rem', fontWeight:'900',
        color: delta > 0 ? '#22c55e' : '#ef4444',
        left: (rect.left + rect.width/2 - 20) + 'px',
        top: rect.top + 'px',
        animation: 'scoreFly 0.9s ease-out forwards'
    });
    el.textContent = (delta > 0 ? '+' : '') + delta;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
}
```

```css
@keyframes scoreFly {
    0%   { opacity:1; transform:translateY(0) scale(1); }
    40%  { opacity:1; transform:translateY(-28px) scale(1.5); }
    100% { opacity:0; transform:translateY(-55px) scale(0.7); }
}
```

**預估工時**：1.5 天

---

### 🎉 V04：班級里程碑慶祝系統（預估 2 天）

**建議觸發條件**：

| 條件 | 效果 |
|------|------|
| 全班作業完成率 100% | 🎊 全屏彩花 + 「全班太棒了！」 |
| 某學生分數達 100 分 | 🏆 金光閃爍特效 |
| 抽籤抽到「幸運星」 | ⭐ 特別放大旋轉 |
| 累計發出 1000 分 | 🎆 里程碑煙火 |

```javascript
function triggerCelebration(type = 'default', message = '') {
    const cfg = {
        homework:  { count: 200, colors: ['#3b82f6','#6366f1','#8b5cf6'] },
        perfect:   { count: 300, colors: ['#ffd700','#ffa500','#ff6347'] },
        lucky:     { count: 150, colors: ['#ec4899','#f43f5e','#fb923c'] },
        milestone: { count: 400, colors: ['#22d3ee','#34d399','#a3e635'] },
        default:   { count: 100, colors: ['#ff0','#f00','#0f0'] }
    }[type];
    launchConfetti(cfg); // 呼叫現有彩花函式並傳入配置
    if (message) showFloatingBanner(message);
}

// 在 renderDashboardCards 後呼叫：
function checkMilestones() {
    if (getHomeworkCompletionRate() === 100)
        triggerCelebration('homework', '🎊 全班作業全部完成！');
}
```

**預估工時**：2 天

---

### 📅 V05：課表管理模組（強力推薦，預估 4-5 天）

**功能規劃**：
```
📅 課表管理
├── 🗓️ 週課表顯示（7欄 × 8節網格）
│   ├── 拖拽調課（節次互換）
│   ├── 科目顏色區分（國語-藍/數學-紅/英語-綠）
│   ├── 顯示任課教師與教室
│   └── 特殊事項標記（運動會/補課/校外教學）
├── 🔔 上下課提醒整合
│   ├── 依課表自動推算各節時間
│   └── 整合倒數計時功能
├── 📋 課表範本（40/45 分鐘制、A/B 週）
└── 📥 匯出（截圖 html2canvas、Markdown 表格）
```

**建議資料結構**：
```javascript
const timetable = {
    weekType: 'A',
    periods: [
        { no:1, start:'08:00', end:'08:40' },
        { no:2, start:'08:50', end:'09:30' },
        // ...
    ],
    schedule: {
        monday:  ['國語','數學','英語','自然','體育','班會'],
        tuesday: ['數學','國語','社會','美術','音樂','彈性'],
        // ...
    },
    colors: { '國語':'#3b82f6','數學':'#ef4444','英語':'#22c55e','自然':'#f97316' }
};
```

**預估工時**：4-5 天

---

### 🔔 V06：進階桌面通知系統（預估 2 天）

**功能規劃**：
- 考試倒數 5 分鐘 / 1 分鐘 桌面通知
- 作業截止日期當天早上 8:00 自動推播
- 計時器結束 OS 通知

```javascript
// js/notification-manager.js
const NotificationManager = {
    async init() {
        if (!('Notification' in window)) return;
        await Notification.requestPermission();
    },
    push(title, body, delayMs = 0, tag = '') {
        setTimeout(() => {
            if (Notification.permission !== 'granted') return;
            const n = new Notification(title, {
                body, icon:'./icons/icon-192.png',
                tag: tag || ('cls-' + Date.now()),
                vibrate: [200, 100, 200]
            });
            n.onclick = () => { window.focus(); n.close(); };
        }, delayMs);
    },
    scheduleExam(endTime) {
        const now = Date.now(), end = new Date(endTime).getTime();
        if (end - 300000 > now) this.push('⚠️ 考試提醒','距離交卷還有 5 分鐘！', end-300000-now, 'ex-5m');
        if (end - 60000  > now) this.push('🚨 最後 1 分鐘','請填寫姓名，準備交卷！', end-60000-now,  'ex-1m');
        this.push('🔔 交卷時間到','請全班停筆！', end-now, 'ex-end');
    }
};
```

**預估工時**：2 天

---

## 📋 開發優先順序建議總表

> 依課堂實用性 × 開發效益排序，建議按此順序逐步推進。

| 優先級 | 功能 | 預估工時 | 教學效益 | 難度 |
|--------|------|---------|---------|------|
| 🔴 P0 | 音效提醒系統（考試鈴聲）| 1 天 | ⭐⭐⭐⭐ | 低 ⚡ |
| 🔴 P0 | S01 完整備份匯出/匯入 | 2 天 | ⭐⭐⭐⭐⭐ | 低 ⚡ |
| 🔴 P0 | V05 課表管理模組 | 4-5 天 | ⭐⭐⭐⭐⭐ | 高 |
| 🟡 P1 | V03 分數浮動動畫 | 1.5 天 | ⭐⭐⭐ | 低 ⚡ |
| 🟡 P1 | V02 頁面轉場動畫 | 1 天 | ⭐⭐⭐ | 低 ⚡ |
| 🟡 P1 | A01 AI 學生評語生成 | 2 天 | ⭐⭐⭐⭐ | 中 |
| 🟡 P1 | V04 里程碑慶祝系統 | 2 天 | ⭐⭐⭐⭐ | 低 |
| 🟡 P1 | V06 進階通知系統 | 2 天 | ⭐⭐⭐⭐ | 中 |
| 🟡 P1 | V01 主題皮膚系統 | 2 天 | ⭐⭐⭐ | 中 |
| 🟡 P1 | A03 成績趨勢圖表 | 2 天 | ⭐⭐⭐ | 中 |
| 🟡 P1 | S02 多班級 Profile | 3-5 天 | ⭐⭐⭐⭐ | 高 |
| 🟢 P2 | A02 語音指令控制 | 3 天 | ⭐⭐⭐ | 高 |
| 🟢 P2 | S03 衝突解析 | 3 天 | ⭐⭐ | 高 |
| 🟢 P2 | IndexedDB 遷移 | 5-7 天 | ⭐⭐ | 極高 |

> 💡 **建議下一步順序（更新版）**：S01 完整備份（保護資料）→ V03 分數動畫（提升課堂互動感）→ E01 考試公告板 → T01 課表管理

---

---

# 第五章：音效系統進階擴充建議 🔔

> 基於 v2.8.4 已完成的基礎音效系統，以下是可以進一步強化的方向

---

## E01. 自訂鈴聲上傳功能

**需求描述**：讓老師可以自行上傳 MP3/WAV 作為考試鈴聲，告別千篇一律的合成音。

**實作方案**：

```javascript
// js/exam-sounds.js 擴充
const CustomSoundManager = {
  _customSounds: JSON.parse(localStorage.getItem('customExamSounds') || '{}'),

  // 上傳並儲存為 Base64
  async uploadSound(type, file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        this._customSounds[type] = e.target.result; // base64
        localStorage.setItem('customExamSounds', JSON.stringify(this._customSounds));
        resolve(true);
      };
      reader.readAsDataURL(file);
    });
  },

  // 播放自訂音效（優先於合成音）
  play(type) {
    if (this._customSounds[type]) {
      const audio = new Audio(this._customSounds[type]);
      audio.volume = 0.6;
      audio.play().catch(() => ExamSounds.playStart()); // 降級至合成音
    } else {
      ExamSounds.playStart(); // 預設合成音
    }
  }
};
```

**UI 介面**：在考試設定頁加入檔案上傳區塊，分別為「開始鈴」「結束鈴」「警告音」提供獨立上傳槽。

**預估工時**：1.5 天  
**難度**：⭐⭐  
**優先度**：🟡 P1

---

## E02. 廣播式文字轉語音提醒

**需求描述**：除了鈴聲，在重要節點自動用 Web Speech API 廣播語音提醒（如「國語考試開始，請將准考證放桌面」）。

**實作方案**：

```javascript
// 在 ExamSounds 中新增
playAnnouncement(text, lang = 'zh-TW') {
  if (!this._enabled || !window.speechSynthesis) return;

  // 取消前一個公告
  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = 0.85;
  utter.pitch = 1.1;
  utter.volume = 0.85;

  // 找中文語音
  const voices = speechSynthesis.getVoices();
  const zhVoice = voices.find(v => v.lang.startsWith('zh'));
  if (zhVoice) utter.voice = zhVoice;

  window.speechSynthesis.speak(utter);
},

// 在 onExamTick 中整合
if (justStarted) {
  this.playStart();
  setTimeout(() => this.playAnnouncement(
    `${currentExam.name}考試開始，請確認試卷，注意準考證放桌面`
  ), 1000);
}
```

**UI 設定**：在考試設定中加入「語音廣播」開關，可自訂各節點廣播文字。

**預估工時**：1 天  
**難度**：⭐⭐  
**優先度**：🟡 P1

---

## E03. 音量視覺化波形顯示

**需求描述**：在音效播放時，於畫面上顯示動態波形視覺化，增加視覺回饋（特別適合教室投影機環境）。

**實作方案**：

```javascript
// 使用 AnalyserNode 即時分析音頻
_showWaveform(duration = 2000) {
  const ctx = this._getCtx();
  if (!ctx) return;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.connect(ctx.destination);

  const canvas = document.createElement('canvas');
  canvas.style.cssText = `
    position: fixed; bottom: 2rem; left: 50%;
    transform: translateX(-50%);
    z-index: 99999; opacity: 0.7;
    border-radius: 8px; background: rgba(0,0,0,0.4);
  `;
  canvas.width = 300; canvas.height = 80;
  document.body.appendChild(canvas);

  // requestAnimationFrame 繪製波形...
  setTimeout(() => canvas.remove(), duration + 500);
}
```

**預估工時**：1 天  
**難度**：⭐⭐⭐  
**優先度**：🟢 P2

---

# 第六章：考試功能深度強化建議 📋

---

## F01. 考試公告板（全螢幕公告疊加層）

**需求描述**：在全螢幕監考畫面中加入一個「臨時公告疊加」功能，老師可輸入臨時訊息（如「第 3 題有誤，請跳過」），這條訊息以半透明橫幅方式疊在畫面底部，持續顯示直到手動關閉。

**實作方案**：

```javascript
// js/exam-proctor.js 新增
window.broadcastExamNotice = function(message, type = 'info') {
  let notice = document.getElementById('examBroadcastNotice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'examBroadcastNotice';
    notice.style.cssText = `
      position: fixed; bottom: 0; left: 0; right: 0;
      background: rgba(239,68,68,0.92);
      color: white; font-size: clamp(1.2rem, 3vw, 2rem);
      font-weight: 700; text-align: center;
      padding: 1rem 3rem; z-index: 9999;
      backdrop-filter: blur(4px);
      border-top: 3px solid rgba(255,255,255,0.3);
      animation: slideUp 0.3s ease;
    `;
    document.body.appendChild(notice);
  }
  notice.textContent = `📢 ${message}`;
  notice.style.display = 'block';
};

window.clearExamNotice = function() {
  const el = document.getElementById('examBroadcastNotice');
  if (el) el.style.display = 'none';
};
```

**UI 介面**：在全螢幕底部加入「+ 臨時公告」按鈕，點擊後彈出輸入框快速廣播。

**預估工時**：0.5 天  
**難度**：⭐  
**優先度**：🔴 P0（最簡單且最實用）

---

## F02. 考試模板快速套用

**需求描述**：儲存常用考試科目組合為「模板」（如「週考模板」：國語 + 數學，各 40 分鐘），下次開考時一鍵套用，不必每次重新設定時間。

**資料結構**：

```javascript
// localStorage: examTemplates
const examTemplates = [
  {
    id: 'template_weekly',
    name: '週定期考',
    subjects: [
      { name: '國語', startTime: '08:45', endTime: '09:25' },
      { name: '數學', startTime: '09:35', endTime: '10:15' },
    ]
  },
  {
    id: 'template_midterm',
    name: '期中考（4 科）',
    subjects: [
      { name: '國語', startTime: '08:00', endTime: '09:20' },
      { name: '數學', startTime: '09:30', endTime: '10:50' },
      { name: '社會', startTime: '11:00', endTime: '11:50' },
      { name: '自然', startTime: '13:00', endTime: '13:50' },
    ]
  }
];
```

**UI 介面**：在「考試監考」設定頁加入「📂 載入模板」和「💾 另存為模板」按鈕。

**預估工時**：1 天  
**難度**：⭐⭐  
**優先度**：🔴 P0

---

## F03. 考試歷史記錄查閱

**需求描述**：每次考試結束後，自動將本次考試的科目、時間、出席人數、缺考名單存入 Firebase，形成歷史資料庫，老師可查閱過往考試紀錄。

**Firestore 資料結構**：

```
examHistory/
  {examId}/
    date: "2026-03-02"
    subjects: [
      { name: "國語", startTime: "08:45", endTime: "09:25" }
    ]
    attendance: { expected: 28, present: 26 }
    absences: [
      { studentName: "王小明", type: "sick", note: "發燒" }
    ]
    teacherNote: "考試過程順利"
```

**功能**：查閱、篩選（依日期/科目）、匯出 CSV。

**預估工時**：2-3 天（含 Firebase 整合）  
**難度**：⭐⭐⭐  
**優先度**：🟡 P1

---

## F04. 倒數計時 vs 正向計時切換

**需求描述**：在考試全螢幕模式中，加入「倒數模式」（顯示剩餘時間）和「正向模式」（顯示已考時間）切換按鈕，適應不同老師的偏好。

**預估工時**：0.5 天  
**難度**：⭐  
**優先度**：🟡 P1

---

# 第七章：課堂互動強化建議 🎮

---

## G01. 即興問答機制（隨機點名 + 計分）

**需求描述**：整合現有的「隨機抽籤」與「評分系統」，讓老師快速啟動「問答活動」：系統隨機點學生，回答正確按「+分」，答錯或跳過按「換人」。

**流程設計**：

```
[開始問答] → 隨機顯示一名學生（全螢幕大字）
    → 老師等待回答
    → 按 ✅ (+1分) 或 ❌ (0分) 或 ⏭ (換人)
    → 記錄本輪答題結果
    → 統計本場問答排行（Top 3 獲額外加分）
```

**UI 元素**：大型圓形學生頭像（以名字首字取代）、彩色背景動畫、得分飛出特效。

**預估工時**：2 天  
**難度**：⭐⭐⭐  
**優先度**：🔴 P0（高課堂參與感）

---

## G02. 學習儀表板（學生個人進度追蹤）

**需求描述**：為每位學生建立個人成長檔案，追蹤「總分趨勢圖」「作業完成率」「出席率」「問答答題率」，協助老師了解個別學生狀況。

**資料來源**：整合現有 `scoreHistory`、`homeworkData`、`examAttendance` 等 localStorage 資料。

**圖表選用**：使用 `Chart.js`（CDN 引入，輕量且無需安裝）

```html
<!-- classnew.html 中加入 Chart.js -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
```

```javascript
// 學生個人儀表板資料整合
function getStudentDashboard(studentName) {
  return {
    name: studentName,
    totalScore: getTotalScore(studentName),       // 現有功能
    scoreTrend: getScoreTrend(studentName),       // 近 10 次評分
    homeworkRate: getHomeworkCompletionRate(studentName), // 作業完成率
    examAttendance: getExamAttendanceRate(studentName),  // 考試出席率
    badgesEarned: getBadges(studentName),         // 已獲勳章
  };
}
```

**預估工時**：3-4 天  
**難度**：⭐⭐⭐⭐  
**優先度**：🟡 P1

---

## G03. 計時器 + 分組搶答模式

**需求描述**：將現有計時器擴充為「搶答模式」，在計時進行中學生可以按下「搶答鈴」（大按鈕），系統記錄第一個按下的學生，並顯示得分機會。

**實作概念**：

```javascript
// 搶答模式：啟動一個可視的倒數鐘
// 學生在課堂平板/手機透過特定 URL 按「搶答」
// 使用 Firebase Realtime Database 記錄搶答時間戳

buzzer_session/
  active: true
  startTime: 1234567890
  firstBuzzer:
    studentName: "王小明"
    timestamp: 1234567895
    score: 10
```

**技術要求**：需 Firebase Realtime Database + 學生端簡單頁面（QR Code 分享）

**預估工時**：3 天  
**難度**：⭐⭐⭐⭐  
**優先度**：🟢 P2（需要多裝置協作）

---

# 第八章：資料安全與管理強化 🔒

---

## H01. 完整資料備份 / 還原系統（最高優先）

**需求描述**：目前所有資料存在 localStorage，更換裝置或清除瀏覽器資料即全部遺失。建立一鍵匯出 JSON + 一鍵還原的機制，是最重要的資料保護措施。

**匯出格式**：

```javascript
// 匯出所有 localStorage 資料為 JSON
function exportAllData() {
  const backup = {
    version: '2.8.4',
    exportDate: new Date().toISOString(),
    data: {}
  };

  // 所有重要的 key
  const importantKeys = [
    'students', 'scores', 'homeworkData', 'notebookData',
    'examSubjects', 'examReminders', 'examAttendance',
    'lotteryHistory', 'groupConfig', 'customTheme',
    'timerPresets', 'pomodoroSettings', 'examSoundsEnabled'
  ];

  importantKeys.forEach(key => {
    const val = localStorage.getItem(key);
    if (val) backup.data[key] = JSON.parse(val);
  });

  // 下載 JSON 檔案
  const blob = new Blob([JSON.stringify(backup, null, 2)],
    { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `班級小管家備份_${new Date().toLocaleDateString('zh-TW')}.json`;
  a.click();
}

// 還原
function importAllData(jsonFile) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const backup = JSON.parse(e.target.result);
    if (!backup.version || !backup.data) {
      alert('備份格式錯誤');
      return;
    }
    if (!confirm(`確定要還原 ${backup.exportDate} 的備份？目前資料將被覆蓋！`)) return;
    Object.entries(backup.data).forEach(([key, val]) => {
      localStorage.setItem(key, JSON.stringify(val));
    });
    location.reload(); // 重新載入以更新 UI
  };
  reader.readAsText(jsonFile);
}
```

**UI 位置**：設定頁面底部「資料管理」區塊，加「⬇️ 匯出備份」＋「⬆️ 載入備份」兩個按鈕。

**預估工時**：1 天  
**難度**：⭐⭐  
**優先度**：🔴 P0（**最重要的保護措施**）

---

## H02. Firebase 自動雲端同步（進階）

**需求描述**：補強現有 Firebase 同步邏輯，使所有 localStorage 資料能自動雙向同步至 Firestore，讓老師換電腦後仍能取回完整資料。

**同步策略**：

| 資料類型 | 同步頻率 | 衝突處理 |
|---------|--------|--------|
| 學生名單 | 每次變更 | 以雲端為主 |
| 評分記錄 | 每次變更 | 合併（追加） |
| 作業資料 | 每次變更 | 以最新為主 |
| 設定偏好 | 每次變更 | 以本地為主 |

**技術重點**：需處理離線狀態、衝突合併、版本號控制。

**預估工時**：5-7 天  
**難度**：⭐⭐⭐⭐⭐  
**優先度**：🟡 P1

---

## H03. 班級 PIN 碼鎖定功能

**需求描述**：若有多重身份使用者（如代課老師），可設定進入系統時需輸入 4 位 PIN 碼，防止學生誤操作。

**技術方案**：PIN 以 SHA-256 雜湊存於 localStorage，不存明文。

```javascript
// PIN 驗證
async function verifyPin(inputPin) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(inputPin)
  );
  const hex = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === localStorage.getItem('classPinHash');
}
```

**預估工時**：1 天  
**難度**：⭐⭐  
**優先度**：🟢 P2

---

# 第九章：行政效率工具 📊

---

## I01. 智慧聯絡簿分析報告

**需求描述**：分析聯絡簿記錄，自動產生週報/月報：作業完成率趨勢、最常缺交的科目分佈、個別學生的表現變化。

**報告格式**：HTML 報表，可列印或另存 PDF（使用 `window.print()`）。

**預估工時**：2-3 天  
**難度**：⭐⭐⭐  
**優先度**：🟡 P1

---

## I02. 課程行事曆整合

**需求描述**：在現有課表管理模組基礎上，新增「月行事曆」視圖，可標記重要事項（考試日、運動會、校外教學），並與 Google Calendar API 雙向同步。

**技術選用**：使用 `FullCalendar.js`（免費 MIT 授權）。

```html
<script src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1/index.global.min.js"></script>
```

**預估工時**：3-4 天  
**難度**：⭐⭐⭐⭐  
**優先度**：🟢 P2

---

## I03. 學生座位表生成器

**需求描述**：根據學生名單，自動生成可自訂列數/欄數的座位表，支援拖曳換位、匯出 PDF。

**實作方式**：拖曳使用 HTML5 Drag & Drop API；PDF 匯出使用 `html2canvas` + `jsPDF`。

```javascript
// 座位表資料結構
const seatingChart = {
  rows: 6,
  cols: 5,
  seats: [
    [null, 'student01', 'student02', null, 'student03'],
    // ...
  ]
};
```

**預估工時**：2-3 天  
**難度**：⭐⭐⭐  
**優先度**：🟡 P1（老師最常問的功能之一）

---

## I04. 每日課程提醒推播（PWA Push Notification）

**需求描述**：利用現有的 PWA 基礎架構，設定每日早晨推播提醒（如「今日有考試：國語 08:45」），即使未開啟網頁也能收到通知。

**技術要求**：Firebase Cloud Messaging (FCM) + Service Worker Push API。

**實作步驟**：
1. 在 Service Worker 加入 Push 事件監聽
2. 使用 FCM 發送排程推播訊息
3. 在設定頁提供「訂閱今日考試提醒」開關

**預估工時**：2-3 天（需 FCM 設定）  
**難度**：⭐⭐⭐⭐  
**優先度**：🟡 P1

---

# 更新版優先順序總表（v2.8.4 更新）

| 優先度 | 功能 ID | 功能名稱 | 預估工時 | 影響力 | 難度 |
|-------|---------|---------|---------|-------|------|
| 🔴 P0 | H01 | **完整資料備份/還原** | 1 天 | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| 🔴 P0 | F02 | 考試模板快速套用 | 1 天 | ⭐⭐⭐⭐ | ⭐⭐ |
| 🔴 P0 | F01 | 考試公告板疊加層 | 0.5 天 | ⭐⭐⭐⭐ | ⭐ |
| 🔴 P0 | G01 | 即興問答機制 | 2 天 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 🟡 P1 | E01 | 自訂鈴聲上傳 | 1.5 天 | ⭐⭐⭐ | ⭐⭐ |
| 🟡 P1 | E02 | 語音廣播提醒 | 1 天 | ⭐⭐⭐⭐ | ⭐⭐ |
| 🟡 P1 | F03 | 考試歷史記錄 | 2-3 天 | ⭐⭐⭐ | ⭐⭐⭐ |
| 🟡 P1 | I03 | 座位表生成器 | 2-3 天 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 🟡 P1 | I01 | 聯絡簿分析報告 | 2-3 天 | ⭐⭐⭐ | ⭐⭐⭐ |
| 🟡 P1 | G02 | 學習儀表板 | 3-4 天 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 🟡 P1 | H02 | Firebase 雲端同步 | 5-7 天 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 🟡 P1 | I04 | 每日推播提醒 | 2-3 天 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 🟢 P2 | E03 | 音效波形視覺化 | 1 天 | ⭐⭐ | ⭐⭐⭐ |
| 🟢 P2 | F04 | 倒數/正向計時切換 | 0.5 天 | ⭐⭐ | ⭐ |
| 🟢 P2 | H03 | PIN 碼鎖定 | 1 天 | ⭐⭐⭐ | ⭐⭐ |
| 🟢 P2 | G03 | 搶答模式 | 3 天 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 🟢 P2 | I02 | 課程行事曆 | 3-4 天 | ⭐⭐⭐ | ⭐⭐⭐⭐ |

---

> 💡 **建議新下一步順序（v2.8.4 更新）**：
> 1. **H01 完整資料備份** (1天) - 最簡單且最重要的保護
> 2. **F01 考試公告板** (0.5天) - 半天即可完成，立竿見影
> 3. **F02 考試模板** (1天) - 大幅節省每次設定時間
> 4. **G01 即興問答機制** (2天) - 最能提升課堂參與感
> 5. **I03 座位表生成器** (2-3天) - 老師反覆需要的行政工具

---

# 🆕 v2.9.0 後 新功能建議彙整（2026-03-02）

> **背景**：v2.9.0 已完成 Google 帳號登入 + Firestore 雲端同步。資料安全基礎已建立，接下來重點轉向**課堂體驗提升**、**AI 智慧輔助**和**多班級管理**。

---

## 🔴 P0 立即可做（1-3 天）

### J01 ｜ 自動 10 分鐘同步
**背景**：目前需手動點選「立即同步」；老師上課中無暇操作容易忘記。  
**功能**：
- 在 `google-auth-ui.js` 加入 `setInterval` 定時同步（預設 10 分鐘）
- 右上角顯示「⟳ 同步中...」轉圈動畫
- 支援設定同步間隔（5 / 10 / 30 分鐘）
- 僅在 Google 帳號登入狀態下啟動

**實作建議**：
```javascript
// 在 google-auth-ui.js init() 中加入
if (isGoogleUser()) {
    setInterval(() => FirebaseSync.syncToCloud(), 10 * 60 * 1000);
}
```
**預估**：0.5 天 ｜ **效益**：⭐⭐⭐⭐⭐ ｜ **難度**：⭐

---

### J02 ｜ 離線狀態提示 Banner
**背景**：網路斷線時，教師不知道資料是否能在雲端保存。  
**功能**：
- 偵測 `navigator.onLine` / Firebase 連線狀態
- 離線時顯示頂部黃色 Banner：「⚠️ 離線模式 - 資料暫存本地，恢復網路後自動同步」
- 恢復連線後自動觸發同步並隱藏 Banner
- PWA 離線快取已有基礎，此為 UX 視覺呈現

**預估**：1 天 ｜ **效益**：⭐⭐⭐⭐ ｜ **難度**：⭐⭐

---

### J03 ｜ 多班級支援
**背景**：目前所有資料存於單一 Firestore users/{uid}/students，無法管理多個班級。  
**功能**：
- Firestore 路徑改為 `users/{uid}/classes/{classId}/students`
- 導覽欄加入**班級切換下拉**（如「502班」、「503班」）
- 可新增、重命名、刪除班級
- 每個班級有獨立的學生名單、加分記錄、公告

**資料結構**：
```
users/
  {uid}/
    classes/
      {classId}/         ← 新增此層
        info: { name: '502班', createdAt }
        students/
        pointsHistory/
        classAnnouncements/
```
**預估**：3-5 天 ｜ **效益**：⭐⭐⭐⭐⭐ ｜ **難度**：⭐⭐⭐⭐

---

## 🟡 P1 近期規劃（1-2 週）

### K01 ｜ 座位表生成器 2.0
**背景**：現有 `ui-enhancement.js` 有基礎座位表，但缺乏直覺的拖曳介面。  
**功能**：
- **拖曳排座**：直接拖拽學生名字到座位格
- **隨機排座**：一鍵重新排列（可設定固定座位學生）
- **座位匯出**：列印成 PDF 或截圖
- **歷史記錄**：保存多份座位表版本
- **角色標記**：標記「組長」、「需注意」等標籤
- **雲端同步**：座位表自動同步至 Firestore

**技術**：`SortableJS` 拖曳庫（CDN 引入）  
**預估**：3 天 ｜ **效益**：⭐⭐⭐⭐⭐ ｜ **難度**：⭐⭐⭐

---

### K02 ｜ 即興問答 / 隨機抽人 2.0
**背景**：現有抽籤只是隨機顯示名字，缺乏互動性。  
**功能**：
- **動畫轉盤**：輪盤轉動動畫後亮出被抽中學生
- **連線保護**：剛被抽中的學生短期內不再被抽
- **回答記錄**：記錄誰被抽到、是否回答正確
- **加扣分連動**：答對自動加分，答錯可選擇扣分或鼓勵
- **問題庫**：輸入問題庫，答對才能過關才抽下一位

**預估**：2-3 天 ｜ **效益**：⭐⭐⭐⭐⭐ ｜ **難度**：⭐⭐⭐

---

### K03 ｜ AI 智慧評語生成
**背景**：老師聯絡簿的家長通知或評語撰寫耗時。  
**功能**：
- 連結 Gemini API（已有後端 Cloud Functions 基礎）
- 選擇學生 → 選擇情境（表現優良 / 需改善 / 特殊狀況）
- 一鍵生成**個人化評語**（含學生姓名、具體建議）
- 可手動修改後複製或直接貼入聯絡簿
- 支援生成**家長通知書**模板

**API 範例**：
```javascript
const prompt = `學生${name}本週表現：${description}。
請以家長能理解的方式，生成一段 80 字的中文聯絡評語。`;
```
**預估**：2 天 ｜ **效益**：⭐⭐⭐⭐⭐ ｜ **難度**：⭐⭐

---

### K04 ｜ 學生個人頁面
**背景**：目前學生僅有名字和分數，缺乏完整個人檔案。  
**功能**：
- 點擊學生名字展開「個人頁面」側邊欄或 Modal
- 顯示：加扣分趨勢圖、作業繳交率、座位資訊、備註標籤
- **行為標籤**：可貼「積極」、「需關注」、「特殊需求」等標籤
- **教師私人備忘**：雲端加密儲存，不公開
- **學期報告**：一鍵生成單一學生的學期表現摘要

**預估**：3-4 天 ｜ **效益**：⭐⭐⭐⭐ ｜ **難度**：⭐⭐⭐

---

### K05 ｜ 班級週報自動生成
**背景**：老師每週需撰寫班週誌或家長信，耗費大量時間。  
**功能**：
- 系統自動彙整一週：出席狀況、作業繳交率、加分榜前三名、公告列表
- 一鍵生成 Markdown 格式週報
- 可選擇輸出格式：Markdown / 純文字 / 複製到剪貼簿
- Gemini API 潤飾成自然語氣的家長信

**預估**：2 天 ｜ **效益**：⭐⭐⭐⭐⭐ ｜ **難度**：⭐⭐

---

## 🟢 P2 中長期規劃（1-2 個月）

### L01 ｜ 學生端唯讀視圖（QR Code 分享）
**背景**：學生可能需要查看自己的積分或公告，但不能有編輯權限。  
**功能**：
- 教師點「分享」→ 產生唯讀 QR Code 連結
- 學生用手機掃描 → 看到自己的積分排名、最新公告
- 嚴格 Firestore 規則：只能讀取被授權的班級資料
- 可設定有效期（1 天 / 1 週 / 永久）

**安全設計**：`/public/{shareToken}/` 只能讀公告和積分排名（不含備忘）  
**預估**：4-5 天 ｜ **效益**：⭐⭐⭐⭐ ｜ **難度**：⭐⭐⭐⭐

---

### L02 ｜ 課堂評量即時回饋（ARS 系統）
**背景**：課堂中老師想快速了解學生理解程度。  
**功能**：
- 教師出一個選擇題 → 學生手機進入連結作答
- 即時顯示各選項百分比（類似 Slido / Kahoot）
- 基於 Firestore `onSnapshot` 即時資料流
- 答完自動連動加分記錄
- 歷史答題記錄可回顧

**技術**：Firestore realtime + QR Code 學生入口  
**預估**：5-7 天 ｜ **效益**：⭐⭐⭐⭐⭐ ｜ **難度**：⭐⭐⭐⭐⭐

---

### L03 ｜ 家長通知系統（LINE / Email）
**背景**：老師有重要事項需即時通知家長。  
**功能**：
- 發布「緊急公告」時，可選擇同步發送 LINE Notify
- 支援 Email 批量發送（家長 Email 存於學生資料）
- Firebase Cloud Functions 處理 LINE / Email 發送
- 發送記錄可查詢（誰在何時收到）

**第三方整合**：LINE Notify API / SendGrid Email API  
**預估**：5-7 天 ｜ **效益**：⭐⭐⭐⭐⭐ ｜ **難度**：⭐⭐⭐⭐

---

### L04 ｜ 進階數據儀表板
**背景**：目前 `data-reports.js` 有基礎圖表，可大幅強化。  
**功能**：
- **班級整體趨勢**：每週加扣分量的折線圖
- **個人成長曲線**：選取學生查看積分趨勢
- **作業分析**：繳交率趨勢、常未交學生清單
- **出席熱力圖**：日曆式出勤記錄視覺化
- **導出 PDF**：完整學期報告一鍵導出

**圖表庫**：`Chart.js`（已有基礎，擴充即可）  
**預估**：4-5 天 ｜ **效益**：⭐⭐⭐⭐ ｜ **難度**：⭐⭐⭐

---

### L05 ｜ 多教師協作
**背景**：班導師、科任老師可能需共同管理班級資料。  
**功能**：
- 班導師可邀請其他教師（Email）加入共同管理
- 權限分級：管理員（全部）/ 協作者（加分、公告）/ 唯讀
- 修改歸屬：記錄「誰在何時做了什麼操作」
- Firestore 資料結構支援多 owner

**Firestore 規則設計**：
```javascript
// 僅允許班級成員存取
allow read, write: if request.auth.uid in resource.data.members;
```
**預估**：5-7 天 ｜ **效益**：⭐⭐⭐⭐ ｜ **難度**：⭐⭐⭐⭐⭐

---

## 💡 技術優化建議（隨時可做）

### M01 ｜ Firestore 分頁查詢（大班額優化）
- 學生超過 100 人時，`querySnapshot.get()` 效能下降
- 改用 `limit(30)` + `startAfter()` 分頁讀取
- **優先條件**：班級人數 > 50 人才需要

### M02 ｜ 同步衝突 Timestamp 策略
- 目前合併策略以「本地版本優先」，可能造成跨裝置衝突
- 升級為 **Last-Write-Wins**：每筆記錄帶 `updatedAt` timestamp，取較新者
- 可搭配 Firestore Transactions 確保原子性操作

### M03 ｜ enableIndexedDbPersistence 升級
- 目前使用的 `enableIndexedDbPersistence()` 將被廢棄
- 升級到 Firebase 9 modular API + `initializeFirestore({ cache: persistentLocalCache() })`
- 改動較大，建議等其他功能穩定後再重構

### M04 ｜ PWA 推播通知
- 已有 Service Worker 基礎
- 整合 Firebase Cloud Messaging (FCM)
- 用途：課前提醒、作業截止提醒、緊急公告
- 需申請用戶推播授權

### M05 ｜ 資料壓縮與清理機制
- 加分記錄長期累積會很大，定期歸檔舊記錄
- 設計「學期結束歸檔」功能：舊資料移至 `/archive/{year-semester}/`
- 保留最近 3 個月活躍資料，其餘壓縮保存

---

## 📊 完整優先順序總表（v2.9.0 更新版）

| 優先 | ID | 功能名稱 | 預估時間 | 效益 | 難度 |
|------|----|---------|---------|------|------|
| 🔴 P0 | J01 | 自動 10 分鐘同步 | 0.5 天 | ⭐⭐⭐⭐⭐ | ⭐ |
| 🔴 P0 | J02 | 離線狀態提示 Banner | 1 天 | ⭐⭐⭐⭐ | ⭐⭐ |
| 🔴 P0 | J03 | 多班級支援 | 3-5 天 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 🟡 P1 | K01 | 座位表生成器 2.0 | 3 天 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 🟡 P1 | K02 | 即興問答/隨機抽人 2.0 | 2-3 天 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 🟡 P1 | K03 | AI 智慧評語生成 | 2 天 | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| 🟡 P1 | K04 | 學生個人頁面 | 3-4 天 | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| 🟡 P1 | K05 | 班級週報自動生成 | 2 天 | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| 🟢 P2 | L01 | 學生端唯讀視圖（QR Code） | 4-5 天 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 🟢 P2 | L02 | 課堂評量即時回饋（ARS） | 5-7 天 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 🟢 P2 | L03 | 家長通知（LINE/Email） | 5-7 天 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 🟢 P2 | L04 | 進階數據儀表板 | 4-5 天 | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| 🟢 P2 | L05 | 多教師協作 | 5-7 天 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| ⚙️ 技術 | M01 | Firestore 分頁查詢 | 1 天 | ⭐⭐⭐ | ⭐⭐ |
| ⚙️ 技術 | M02 | 同步衝突 Timestamp 策略 | 1-2 天 | ⭐⭐⭐ | ⭐⭐⭐ |
| ⚙️ 技術 | M03 | IndexedDB Persistence 升級 | 2 天 | ⭐⭐ | ⭐⭐⭐⭐ |
| ⚙️ 技術 | M04 | PWA 推播通知 | 2-3 天 | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| ⚙️ 技術 | M05 | 資料壓縮與學期歸檔 | 2 天 | ⭐⭐⭐ | ⭐⭐⭐ |

---

> 💡 **建議下一步順序（v2.9.8 更新版）**：
> 1. **K03 AI 智慧評語生成**（2 天）- Gemini 後端已有基礎，最快產出高價值功能
> 2. **V03 分數浮動動畫**（1.5 天）- 極低成本，大幅提升課堂加分互動感
> 3. **V05 課表管理模組**（4-5 天）- 每天都會用，教師最期待的功能
> 4. **K05 班級週報自動生成**（2 天）- 節省大量行政時間
> 5. **J03 多班級支援**（3-5 天）- 架構性功能，早做避免後期重構

---

## 🆕 第六章：v2.9.8 之後新增開發建議

> 根據本次同步功能完整優化的開發經驗，提出以下新建議。

---

### 🔄 N01：同步選擇性備份（預估 1.5 天）

**需求描述**：目前同步是「全量覆蓋」，使用者無法選擇只還原特定類別的資料。

**建議功能**：
- 在「從雲端還原」Modal 中，每一行資料旁加入 **勾選框**
- 使用者可以勾選「只還原考試監考設定」「只還原學生名單」等
- 避免因為一個設定同步而覆蓋全部資料

**建議 UI 修改**（在 Modal 表格行加入 checkbox）：
```html
<tr>
  <td><input type="checkbox" checked class="sync-item-check" data-key="students"></td>
  <td>👥 學生名單</td>
  <td>25 人 → 28 人</td>
  <td class="diff">+3 人</td>
</tr>
```

**預估工時**：1.5 天  
**難度**：⭐⭐  
**優先度**：🟡 P1

---

### 🖥️ N02：課堂儀表板全螢幕廣播模式（預估 2 天）

**需求描述**：老師希望將「目前時間 + 倒數計時 + 班級公告 + 排行榜」同時投影到教室大螢幕。

**功能規劃**：
```
🖥️ 廣播模式（全螢幕）
├── 左上：實時時鐘（現有大時鐘整合）
├── 右上：倒數計時器（現有計時器整合）
├── 中間：最新班級公告 3 則（滾動）
├── 右下：今日加分 TOP 5 排行榜
└── 底部：跑馬燈（自訂文字）
```

**建議快捷鍵**：`F11` 或右上角「📺 廣播模式」按鈕

**建議資料結構**（新增全螢幕 overlay）：
```javascript
function openBroadcastMode() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position:fixed;inset:0;z-index:9990;
        background:#0f172a;color:#f8fafc;
        display:grid;grid-template-columns:1fr 1fr;
        padding:2rem;gap:2rem;
    `;
    overlay.innerHTML = buildBroadcastHTML();
    document.body.appendChild(overlay);
    overlay.requestFullscreen?.();
}
```

**預估工時**：2 天  
**難度**：⭐⭐⭐  
**優先度**：🟡 P1

---

### 📇 N03：學生個人卡片 + QR Code 分享（預估 2 天）

**需求描述**：每位學生可有一張個人卡片，顯示座號/分數/稱號/作業完成率，可生成 QR Code 讓學生或家長掃描查看。

**功能規劃**：
- 點擊學生頭像 → 展開個人卡片 Modal
- 卡片顯示：頭像、名字、座號、目前積分、作業完成率、最近 3 筆加減分記錄
- 「生成 QR Code」按鈕 → 生成以 Firebase 儲存的學生唯讀頁面連結
- 家長掃描 QR 可看到「本週加減分記錄」（唯讀，無需登入）

**建議 QR 生成方式**（使用免費 QR API）：
```javascript
function generateStudentQR(studentId) {
    const url = `https://cagoooo.github.io/class/student.html?id=${studentId}&uid=${currentUserId}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
    return `<img src="${qrUrl}" alt="學生 QR Code">`;
}
```

**安全性**：公開連結僅顯示最近 7 天記錄，不含完整分數/名單，無寫入權限。

**預估工時**：2 天（含 Firebase 唯讀規則設計）  
**難度**：⭐⭐⭐  
**優先度**：🟢 P2

---

### ⏱️ N04：自動定時同步（預估 0.5 天）

**現狀問題**：目前只能手動點擊同步，忘記同步時資料就有落差風險。

**建議實作**：
```javascript
// 在 firebase-sync.js 末尾加入
const AUTO_SYNC_INTERVAL = 10 * 60 * 1000; // 10 分鐘

function startAutoSync() {
    setInterval(async () => {
        if (!window.FirebaseConfig.isConnected()) return;
        const now = Date.now();
        const lastSync = new Date(localStorage.getItem('lastSyncTime') || 0).getTime();
        if (now - lastSync > AUTO_SYNC_INTERVAL) {
            console.log('🔄 自動同步執行中...');
            await syncToCloud();
        }
    }, AUTO_SYNC_INTERVAL);
}

// 頁面可見時強制觸發
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && window.FirebaseConfig.isConnected()) {
        const lastSync = new Date(localStorage.getItem('lastSyncTime') || 0).getTime();
        if (Date.now() - lastSync > AUTO_SYNC_INTERVAL) syncToCloud();
    }
});
```

**預估工時**：0.5 天  
**難度**：⭐  
**優先度**：🔴 P0 ← **下次優先實作！**

---

### 🎨 N05：深色模式完整審查清單（預估 2 天）

**現狀**：深色模式覆蓋率約 75%，以下元件尚未完整支援：

| 元件 | 狀態 |
|------|------|
| 主頁面卡片、nav | ✅ 已支援 |
| 同步確認 Modal | ⚠️ 尚未支援深色 |
| 考試監考全螢幕 | ⚠️ 有部分深色 |
| Skeleton 骨架屏 | ✅ 已支援 |
| Toast 通知 | ✅ 已支援 |
| 排行榜 Modal | ❓ 待確認 |
| 抽籤動畫 | ❓ 待確認 |
| 學生大頭貼上傳 | ❓ 待確認 |

**建議**：用深色模式開啟每個功能頁面，逐一截圖確認。對尚未支援的元件，在 `theme-toggle.js` 的 CSS 中補上對應 `.dark` 選擇器。

**預估工時**：2 天  
**難度**：⭐⭐  
**優先度**：🟡 P1

---

## 📊 完整優先順序總表（v2.9.8 更新版）

| 優先 | ID | 功能名稱 | 預估時間 | 效益 | 難度 |
|------|----|---------|---------|------|------|
| 🔴 P0 | **N04** | **自動定時同步（10 分鐘）** | 0.5 天 | ⭐⭐⭐⭐⭐ | ⭐ |
| 🔴 P0 | J02 | 離線狀態提示 Banner | 1 天 | ⭐⭐⭐⭐ | ⭐⭐ |
| 🔴 P0 | J03 | 多班級支援 | 3-5 天 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 🟡 P1 | K03 | AI 智慧評語生成 | 2 天 | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| 🟡 P1 | V03 | 分數浮動動畫 | 1.5 天 | ⭐⭐⭐ | ⭐ |
| 🟡 P1 | V05 | 課表管理模組 | 4-5 天 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 🟡 P1 | K05 | 班級週報自動生成 | 2 天 | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| 🟡 P1 | **N01** | **同步選擇性備份** | 1.5 天 | ⭐⭐⭐⭐ | ⭐⭐ |
| 🟡 P1 | **N02** | **課堂廣播全螢幕模式** | 2 天 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 🟡 P1 | **N05** | **深色模式完整審查** | 2 天 | ⭐⭐⭐ | ⭐⭐ |
| 🟡 P1 | K01 | 座位表生成器 2.0 | 3 天 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 🟡 P1 | K02 | 隨機抽人 2.0 | 2-3 天 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 🟡 P1 | K04 | 學生個人頁面 | 3-4 天 | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| 🟢 P2 | **N03** | **學生卡片 + QR Code** | 2 天 | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| 🟢 P2 | L01 | 學生端唯讀視圖（QR Code） | 4-5 天 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 🟢 P2 | L02 | 課堂評量即時回饋（ARS） | 5-7 天 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 🟢 P2 | L03 | 家長通知（LINE/Email） | 5-7 天 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 🟢 P2 | A02 | 語音指令控制 | 3 天 | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| ⚙️ 技術 | M02 | 同步衝突 Timestamp 策略 | 1-2 天 | ⭐⭐⭐ | ⭐⭐⭐ |
| ⚙️ 技術 | M03 | IndexedDB Persistence 升級 | 2 天 | ⭐⭐ | ⭐⭐⭐⭐ |
| ⚙️ 技術 | M04 | PWA 推播通知（FCM） | 2-3 天 | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| ⚙️ 技術 | M05 | 學期資料歸檔機制 | 2 天 | ⭐⭐⭐ | ⭐⭐⭐ |

